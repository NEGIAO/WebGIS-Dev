from __future__ import annotations

import asyncio
import inspect
import logging
import math
from typing import Awaitable, Callable, Iterable, List, Optional, Tuple

import httpx
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import Affine
from rasterio.windows import Window

WEB_MERCATOR_EXTENT = 20037508.342789244
MAX_LATITUDE = 85.05112878
TILE_SIZE = 256
INITIAL_RESOLUTION = (2 * WEB_MERCATOR_EXTENT) / TILE_SIZE
MAX_ZOOM = 22
MAX_CONCURRENCY = 10
DEFAULT_RETRIES = 3
DEFAULT_TIMEOUT = 20.0

ProgressCallback = Callable[[int, int, str], Optional[Awaitable[None]]]

logger = logging.getLogger(__name__)


def resolution_to_zoom(resolution_m: float, lat_deg: float) -> int:
    if resolution_m <= 0:
        raise ValueError("resolution_m must be positive")
    lat = _clamp(lat_deg, -MAX_LATITUDE, MAX_LATITUDE)
    meters_per_pixel = INITIAL_RESOLUTION * math.cos(math.radians(lat))
    zoom = math.log2(meters_per_pixel / resolution_m)
    return _clamp_int(int(math.ceil(zoom)), 0, MAX_ZOOM)


def bbox4326_to_tile_range(
    bbox: Tuple[float, float, float, float],
    zoom: int,
) -> Tuple[int, int, int, int]:
    min_lon, min_lat, max_lon, max_lat = _normalize_bbox_4326(bbox)
    min_lon = _clamp(min_lon, -180.0, 180.0)
    max_lon = _clamp(max_lon, -180.0, 180.0)
    min_lat = _clamp(min_lat, -MAX_LATITUDE, MAX_LATITUDE)
    max_lat = _clamp(max_lat, -MAX_LATITUDE, MAX_LATITUDE)

    x1, y1 = _lonlat_to_tile_xy(min_lon, max_lat, zoom)
    x2, y2 = _lonlat_to_tile_xy(max_lon, min_lat, zoom)

    min_x = min(x1, x2)
    max_x = max(x1, x2)
    min_y = min(y1, y2)
    max_y = max(y1, y2)

    return min_x, max_x, min_y, max_y


def tile_range_to_raster_info(
    min_x: int,
    max_x: int,
    min_y: int,
    max_y: int,
    zoom: int,
    tile_size: int = TILE_SIZE,
) -> Tuple[Affine, int, int, float]:
    resolution = INITIAL_RESOLUTION / (2**zoom)
    left = -WEB_MERCATOR_EXTENT + (min_x * tile_size * resolution)
    top = WEB_MERCATOR_EXTENT - (min_y * tile_size * resolution)
    width = (max_x - min_x + 1) * tile_size
    height = (max_y - min_y + 1) * tile_size
    transform = Affine(resolution, 0.0, left, 0.0, -resolution, top)
    return transform, width, height, resolution


async def build_geotiff_from_tiles(
    tile_url_template: str,
    bbox_4326: Tuple[float, float, float, float],
    resolution_m: float,
    output_path: str,
    *,
    tile_size: int = TILE_SIZE,
    retries: int = DEFAULT_RETRIES,
    timeout: float = DEFAULT_TIMEOUT,
    progress_callback: ProgressCallback | None = None,
    progress_step: int = 1,
) -> dict:
    min_lon, min_lat, max_lon, max_lat = _normalize_bbox_4326(bbox_4326)
    center_lat = (min_lat + max_lat) / 2.0
    zoom = resolution_to_zoom(resolution_m, center_lat)

    min_x, max_x, min_y, max_y = bbox4326_to_tile_range(bbox_4326, zoom)
    transform, width, height, _ = tile_range_to_raster_info(
        min_x,
        max_x,
        min_y,
        max_y,
        zoom,
        tile_size,
    )
    tile_count = (max_x - min_x + 1) * (max_y - min_y + 1)

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    processed_tiles = 0
    downloaded_tiles = 0
    last_reported = -1

    async def maybe_report(phase: str) -> None:
        nonlocal last_reported
        if not progress_callback or tile_count <= 0:
            return
        percent = int((processed_tiles / tile_count) * 100)
        if percent == last_reported:
            return
        if percent < 100 and (percent - last_reported) < max(1, progress_step):
            return
        last_reported = percent
        result = progress_callback(processed_tiles, tile_count, phase)
        if inspect.isawaitable(result):
            await result

    async with httpx.AsyncClient() as client:
        seed_url = tile_url_template.format(z=zoom, x=min_x, y=min_y)
        seed_bytes = await _fetch_tile_bytes(
            client,
            seed_url,
            semaphore,
            retries,
            timeout,
        )

        if seed_bytes:
            seed_data, band_count, dtype = _decode_tile(seed_bytes)
        else:
            seed_data = None
            band_count = 3
            dtype = "uint8"

        profile = {
            "driver": "GTiff",
            "width": width,
            "height": height,
            "count": band_count,
            "dtype": dtype,
            "crs": "EPSG:3857",
            "transform": transform,
            "compress": "deflate",
            "tiled": True,
            "blockxsize": tile_size,
            "blockysize": tile_size,
            "interleave": "band",
        }

        with rasterio.open(output_path, "w", **profile) as dst:
            processed_tiles += 1
            if seed_data is not None:
                _write_tile_array(dst, seed_data, min_x, min_y, min_x, min_y, tile_size)
                downloaded_tiles += 1
            await maybe_report("downloading")

            coords = [
                (x, y)
                for y in range(min_y, max_y + 1)
                for x in range(min_x, max_x + 1)
                if not (seed_data is not None and x == min_x and y == min_y)
            ]

            batch_size = max(1, MAX_CONCURRENCY * 4)
            for batch in _iter_batches(coords, batch_size):
                tasks = [
                    asyncio.create_task(
                        _fetch_tile_for_coords(
                            client,
                            tile_url_template,
                            zoom,
                            x,
                            y,
                            semaphore,
                            retries,
                            timeout,
                        )
                    )
                    for x, y in batch
                ]

                for task in asyncio.as_completed(tasks):
                    x, y, tile_bytes = await task
                    processed_tiles += 1
                    if tile_bytes:
                        data, _, _ = _decode_tile(tile_bytes)
                        _write_tile_array(dst, data, x, y, min_x, min_y, tile_size)
                        downloaded_tiles += 1
                    await maybe_report("downloading")

    return {
        "zoom": zoom,
        "min_x": min_x,
        "max_x": max_x,
        "min_y": min_y,
        "max_y": max_y,
        "width": width,
        "height": height,
        "tile_count": tile_count,
        "processed_tiles": processed_tiles,
        "downloaded_tiles": downloaded_tiles,
        "output_path": output_path,
    }


def _normalize_bbox_4326(
    bbox: Tuple[float, float, float, float]
) -> Tuple[float, float, float, float]:
    if len(bbox) != 4:
        raise ValueError("bbox must be (min_lon, min_lat, max_lon, max_lat)")
    min_lon, min_lat, max_lon, max_lat = bbox
    if min_lon > max_lon:
        min_lon, max_lon = max_lon, min_lon
    if min_lat > max_lat:
        min_lat, max_lat = max_lat, min_lat
    return min_lon, min_lat, max_lon, max_lat


def _lonlat_to_tile_xy(lon: float, lat: float, zoom: int) -> Tuple[int, int]:
    lat = _clamp(lat, -MAX_LATITUDE, MAX_LATITUDE)
    n = 2**zoom
    x = (lon + 180.0) / 360.0 * n
    lat_rad = math.radians(lat)
    y = (1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0 * n
    tile_x = _clamp_int(int(math.floor(x)), 0, n - 1)
    tile_y = _clamp_int(int(math.floor(y)), 0, n - 1)
    return tile_x, tile_y


def _decode_tile(tile_bytes: bytes) -> Tuple[np.ndarray, int, str]:
    with MemoryFile(tile_bytes) as mem:
        with mem.open() as dataset:
            data = dataset.read()
            return data, dataset.count, dataset.dtypes[0]


def _write_tile_array(
    dst: rasterio.DatasetWriter,
    data: np.ndarray,
    tile_x: int,
    tile_y: int,
    min_x: int,
    min_y: int,
    tile_size: int,
) -> None:
    if data.ndim == 2:
        data = data[np.newaxis, :, :]

    if data.shape[0] < dst.count:
        pad = np.zeros((dst.count, data.shape[1], data.shape[2]), dtype=data.dtype)
        pad[: data.shape[0]] = data
        data = pad
    elif data.shape[0] > dst.count:
        data = data[: dst.count]

    if data.dtype != dst.dtypes[0]:
        data = data.astype(dst.dtypes[0], copy=False)

    tile_height = data.shape[1]
    tile_width = data.shape[2]
    col_off = (tile_x - min_x) * tile_size
    row_off = (tile_y - min_y) * tile_size
    window = Window(col_off, row_off, tile_width, tile_height)
    dst.write(data, window=window)


def _iter_batches(items: List[Tuple[int, int]], batch_size: int) -> Iterable[List[Tuple[int, int]]]:
    for start in range(0, len(items), batch_size):
        yield items[start : start + batch_size]


async def _fetch_tile_for_coords(
    client: httpx.AsyncClient,
    tile_url_template: str,
    zoom: int,
    x: int,
    y: int,
    semaphore: asyncio.Semaphore,
    retries: int,
    timeout: float,
) -> Tuple[int, int, bytes | None]:
    url = tile_url_template.format(z=zoom, x=x, y=y)
    content = await _fetch_tile_bytes(client, url, semaphore, retries, timeout)
    return x, y, content


async def _fetch_tile_bytes(
    client: httpx.AsyncClient,
    url: str,
    semaphore: asyncio.Semaphore,
    retries: int,
    timeout: float,
) -> bytes | None:
    for attempt in range(retries):
        try:
            async with semaphore:
                response = await client.get(url, timeout=timeout)
            if response.status_code == 200 and response.content:
                return response.content
            if response.status_code in {204, 404}:
                return None
            logger.warning(
                "Tile download failed (%s) attempt %s/%s: %s",
                response.status_code,
                attempt + 1,
                retries,
                url,
            )
        except httpx.RequestError:
            logger.warning("Tile download error attempt %s/%s: %s", attempt + 1, retries, url)

        if attempt < retries - 1:
            await asyncio.sleep(0.25 * (2**attempt))

    return None


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(value, max_value))


def _clamp_int(value: int, min_value: int, max_value: int) -> int:
    return max(min_value, min(value, max_value))
