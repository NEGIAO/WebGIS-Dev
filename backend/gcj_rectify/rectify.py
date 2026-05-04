import asyncio
from io import BytesIO
from pathlib import Path
from typing import List, Optional

import httpx
from PIL import Image

from .fetch import fetch_tile
from .url_template import TileUrlTemplate, build_tile_url
from .utils import (
    TILE_SIZE,
    bytes_to_image,
    gcjbbox_to_wgsbbox,
    image_to_bytes,
    lonlat_to_xyz,
    wgsbbox_to_gcjbbox,
    xyz_to_bbox,
)

MAX_CONCURRENCY = 8


def _tile_cache_path(
    cache_dir: Path,
    template: TileUrlTemplate,
    category: str,
    z: int,
    x: int,
    y: int,
) -> Path:
    return cache_dir / template.cache_key / category / str(z) / str(x) / f"{y}.png"


def _save_tile_bytes(tile_path: Path, tile_bytes: bytes) -> None:
    tile_path.parent.mkdir(parents=True, exist_ok=True)
    tile_path.write_bytes(tile_bytes)


def _normalize_range(min_val: int, max_val: int) -> tuple[int, int]:
    if min_val > max_val:
        return max_val, min_val
    return min_val, max_val


def _build_blank_tile() -> Image.Image:
    return Image.new("RGBA", (TILE_SIZE, TILE_SIZE))


def _crop_composite(
    composite: Image.Image,
    merged_bbox,
    target_bbox,
) -> Image.Image:
    x_range = merged_bbox[1][0] - merged_bbox[0][0]
    y_range = merged_bbox[0][1] - merged_bbox[1][1]
    if x_range == 0 or y_range == 0:
        return composite.resize((TILE_SIZE, TILE_SIZE))

    left_percent = (target_bbox[0][0] - merged_bbox[0][0]) / x_range
    top_percent = (merged_bbox[0][1] - target_bbox[0][1]) / y_range

    left = int(left_percent * composite.width)
    top = int(top_percent * composite.height)
    right = left + TILE_SIZE
    bottom = top + TILE_SIZE

    left = max(0, min(left, composite.width))
    top = max(0, min(top, composite.height))
    right = max(left, min(right, composite.width))
    bottom = max(top, min(bottom, composite.height))

    crop = composite.crop((left, top, right, bottom))
    if crop.size != (TILE_SIZE, TILE_SIZE):
        canvas = _build_blank_tile()
        canvas.paste(crop, (0, 0))
        return canvas
    return crop


async def _get_tile_cached(
    x: int,
    y: int,
    z: int,
    template: TileUrlTemplate,
    cache_dir: Path,
    category: str,
    *,
    client: Optional[httpx.AsyncClient],
) -> bytes:
    tile_path = _tile_cache_path(cache_dir, template, category, z, x, y)
    if tile_path.exists():
        with Image.open(tile_path) as image:
            image.load()
            return image_to_bytes(image)

    url = build_tile_url(template, x, y, z)
    tile_bytes = await fetch_tile(url, client=client)
    image = bytes_to_image(tile_bytes)
    png_bytes = image_to_bytes(image)
    _save_tile_bytes(tile_path, png_bytes)
    return png_bytes


async def _fetch_tile_grid(
    x_min: int,
    x_max: int,
    y_min: int,
    y_max: int,
    z: int,
    template: TileUrlTemplate,
    cache_dir: Path,
    category: str,
    client: Optional[httpx.AsyncClient],
) -> List[bytes]:
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def _run(x: int, y: int) -> bytes:
        async with semaphore:
            return await _get_tile_cached(
                x,
                y,
                z,
                template,
                cache_dir,
                category,
                client=client,
            )

    tasks = [
        asyncio.create_task(_run(ax, ay))
        for ax in range(x_min, x_max + 1)
        for ay in range(y_min, y_max + 1)
    ]

    return await asyncio.gather(*tasks)


def _merge_tiles(
    tiles: List[bytes],
    x_min: int,
    x_max: int,
    y_min: int,
    y_max: int,
) -> Image.Image:
    composite = Image.new(
        "RGBA",
        ((x_max - x_min + 1) * TILE_SIZE, (y_max - y_min + 1) * TILE_SIZE),
    )
    tile_index = 0
    for i, _ in enumerate(range(x_min, x_max + 1)):
        for j, _ in enumerate(range(y_min, y_max + 1)):
            with Image.open(BytesIO(tiles[tile_index])) as tile:
                composite.paste(tile.convert("RGBA"), (i * TILE_SIZE, j * TILE_SIZE))
            tile_index += 1
    return composite


async def _build_rectified_tile(
    source_bbox,
    z: int,
    template: TileUrlTemplate,
    cache_dir: Path,
    source_category: str,
    client: Optional[httpx.AsyncClient],
) -> bytes:
    left_upper, right_lower = source_bbox
    x_min, y_min = lonlat_to_xyz(left_upper[0], left_upper[1], z)
    x_max, y_max = lonlat_to_xyz(right_lower[0], right_lower[1], z)
    x_min, x_max = _normalize_range(x_min, x_max)
    y_min, y_max = _normalize_range(y_min, y_max)

    tiles = await _fetch_tile_grid(
        x_min,
        x_max,
        y_min,
        y_max,
        z,
        template,
        cache_dir,
        source_category,
        client,
    )
    composite = _merge_tiles(tiles, x_min, x_max, y_min, y_max)

    merged_bbox = (
        xyz_to_bbox(x_min, y_min, z)[0],
        xyz_to_bbox(x_max, y_max, z)[1],
    )
    cropped = _crop_composite(composite, merged_bbox, source_bbox)
    return image_to_bytes(cropped)


async def get_gcj2wgs_tile(
    x: int,
    y: int,
    z: int,
    template: TileUrlTemplate,
    cache_dir: Path,
    *,
    client: Optional[httpx.AsyncClient] = None,
) -> bytes:
    """Return a WGS tile built from GCJ tiles."""
    output_path = _tile_cache_path(cache_dir, template, "gcj2wgs", z, x, y)
    if output_path.exists():
        with Image.open(output_path) as image:
            image.load()
            return image_to_bytes(image)

    if z <= 9:
        tile_bytes = await _get_tile_cached(
            x,
            y,
            z,
            template,
            cache_dir,
            "source-gcj",
            client=client,
        )
        _save_tile_bytes(output_path, tile_bytes)
        return tile_bytes

    wgs_bbox = xyz_to_bbox(x, y, z)
    gcj_bbox = wgsbbox_to_gcjbbox(wgs_bbox)
    tile_bytes = await _build_rectified_tile(
        gcj_bbox,
        z,
        template,
        cache_dir,
        "source-gcj",
        client,
    )
    _save_tile_bytes(output_path, tile_bytes)
    return tile_bytes


async def get_wgs2gcj_tile(
    x: int,
    y: int,
    z: int,
    template: TileUrlTemplate,
    cache_dir: Path,
    *,
    client: Optional[httpx.AsyncClient] = None,
) -> bytes:
    """Return a GCJ tile built from WGS tiles."""
    output_path = _tile_cache_path(cache_dir, template, "wgs2gcj", z, x, y)
    if output_path.exists():
        with Image.open(output_path) as image:
            image.load()
            return image_to_bytes(image)

    if z <= 9:
        tile_bytes = await _get_tile_cached(
            x,
            y,
            z,
            template,
            cache_dir,
            "source-wgs",
            client=client,
        )
        _save_tile_bytes(output_path, tile_bytes)
        return tile_bytes

    gcj_bbox = xyz_to_bbox(x, y, z)
    wgs_bbox = gcjbbox_to_wgsbbox(gcj_bbox)
    tile_bytes = await _build_rectified_tile(
        wgs_bbox,
        z,
        template,
        cache_dir,
        "source-wgs",
        client,
    )
    _save_tile_bytes(output_path, tile_bytes)
    return tile_bytes
