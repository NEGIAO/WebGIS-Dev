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
            seed_data, seed_band_count, dtype = _decode_tile(seed_bytes)
        else:
            seed_data = None
            seed_band_count = 3
            dtype = "uint8"

        # 标准化波段数: PNG和JPG都统一为3波段RGB
        # 避免PNG灰色化和JPG膨胀问题
        band_count = 3

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
    """Decode tile bytes and apply colormap for indexed color images.
    
    Args:
        tile_bytes: Raw tile image bytes
        
    Returns:
        Tuple of (data array, band_count, dtype_string)
        - For indexed color PNG: converts to RGB (3 bands)
        - For grayscale: returns as-is (1 band)
        - For RGB/RGBA: returns as-is
    """
    with MemoryFile(tile_bytes) as mem:
        with mem.open() as dataset:
            data = dataset.read()
            band_count = dataset.count
            dtype = dataset.dtypes[0]
            
            # 检测并处理索引颜色PNG (Indexed Color Palette)
            if band_count == 1 and hasattr(dataset, 'colorinterp'):
                # 检查是否存在颜色表(Colormap)
                colormap = dataset.colormap(1)
                if colormap is not None:
                    logger.info("Detected indexed color PNG, applying colormap")
                    # colormap是字典: {index: (R, G, B)}
                    # 构建查找表: 0-255每个索引对应的RGB值
                    lut = np.zeros((256, 3), dtype=dtype)
                    for idx, rgb in colormap.items():
                        if 0 <= idx < 256:
                            # RGB是元组(r, g, b)或(r, g, b, a)
                            lut[idx, :] = rgb[:3]
                    
                    # 应用颜色表: 将索引值映射到RGB
                    # data shape: (1, H, W) -> 需要转为 (3, H, W)
                    indexed_data = data[0]  # (H, W)
                    rgb_data = lut[indexed_data]  # (H, W, 3)
                    data = np.transpose(rgb_data, (2, 0, 1))  # (3, H, W)
                    band_count = 3
                    logger.info("Colormap applied: %d bytes -> RGB", len(tile_bytes))
            
            return data, band_count, dtype


def _write_tile_array(
    dst: rasterio.DatasetWriter,
    data: np.ndarray,
    tile_x: int,
    tile_y: int,
    min_x: int,
    min_y: int,
    tile_size: int,
) -> None:
    """Write tile array to GeoTIFF with intelligent band conversion.
    
    Handles:
    - 2D grayscale (H, W) → 3D RGB by replicating
    - 1-band indexed/grayscale → RGB by replicating
    - 4-band RGBA → 3-band RGB (remove alpha)
    - Band count mismatch → pad or truncate
    """
    # 处理2D灰度图 → 3D RGB (复制灰度到三个波段)
    if data.ndim == 2:
        # Grayscale (H, W) → RGB (3, H, W) by replicating
        gray = data
        data = np.stack([gray, gray, gray], axis=0)
        logger.debug("Converted 2D grayscale to 3D RGB")

    # 处理1波段数据(真正的灰度或已处理的索引颜色)
    # 注意: 索引颜色PNG应该在_decode_tile()中已转换为3波段
    if data.shape[0] == 1:
        logger.info("Converting single grayscale band to RGB")
        data = np.repeat(data, 3, axis=0)

    # 处理4波段RGBA → 3波段RGB (去掉Alpha通道)
    if data.shape[0] == 4:
        logger.info("Converting RGBA to RGB by removing alpha channel")
        data = data[:3, :, :]
    # 如果波段数超过目标，截断
    elif data.shape[0] > dst.count:
        logger.info("Truncating tile from %d to %d bands", data.shape[0], dst.count)
        data = data[: dst.count]

    # 如果波段数不足目标波段数，用最后一个波段的值填充
    if data.shape[0] < dst.count:
        logger.info(
            "Padding tile from %d to %d bands", data.shape[0], dst.count
        )
        pad = np.full(
            (dst.count, data.shape[1], data.shape[2]),
            data[-1],
            dtype=data.dtype,
        )
        pad[: data.shape[0]] = data
        data = pad

    # dtype转换
    if data.dtype != dst.dtypes[0]:
        data = data.astype(dst.dtypes[0], copy=False)

    # 计算写入窗口
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


def clip_geotiff_to_bbox(
    input_path: str,
    bbox_4326: Tuple[float, float, float, float],
    output_path: str | None = None,
) -> str:
    """将 GeoTIFF 裁剪到精确的 WGS84 范围。

    Args:
        input_path: 源 GeoTIFF 路径（EPSG:3857）
        bbox_4326: 精确裁剪范围 (min_lon, min_lat, max_lon, max_lat)
        output_path: 输出路径，None 则覆盖原文件

    Returns:
        裁剪后的文件路径
    """
    import os
    from rasterio.windows import from_bounds as window_from_bounds

    min_lon, min_lat, max_lon, max_lat = _normalize_bbox_4326(bbox_4326)

    # WGS84 → EPSG:3857
    min_x_3857 = min_lon * WEB_MERCATOR_EXTENT / 180.0
    max_x_3857 = max_lon * WEB_MERCATOR_EXTENT / 180.0
    min_y_3857 = (
        WEB_MERCATOR_EXTENT
        / math.pi
        * math.log(math.tan(math.pi / 4 + math.radians(min_lat) / 2))
    )
    max_y_3857 = (
        WEB_MERCATOR_EXTENT
        / math.pi
        * math.log(math.tan(math.pi / 4 + math.radians(max_lat) / 2))
    )

    # 保证顺序正确
    clip_left = min(min_x_3857, max_x_3857)
    clip_right = max(min_x_3857, max_x_3857)
    clip_bottom = min(min_y_3857, max_y_3857)
    clip_top = max(min_y_3857, max_y_3857)

    should_replace = output_path is None
    if output_path is None:
        output_path = input_path + ".clip.tif"

    with rasterio.open(input_path) as src:
        # 计算精确裁剪窗口
        window = window_from_bounds(
            clip_left, clip_bottom, clip_right, clip_top,
            transform=src.transform,
        )

        # 取整并限制在源数据范围内
        col_off = max(0, int(math.floor(window.col_off)))
        row_off = max(0, int(math.floor(window.row_off)))
        col_end = min(src.width, int(math.ceil(window.col_off + window.width)))
        row_end = min(src.height, int(math.ceil(window.row_off + window.height)))

        win_width = col_end - col_off
        win_height = row_end - row_off

        if win_width <= 0 or win_height <= 0:
            logger.warning("裁剪窗口为空，跳过裁剪")
            return input_path

        clipped_window = rasterio.windows.Window(col_off, row_off, win_width, win_height)
        data = src.read(window=clipped_window)

        # 计算裁剪后的仿射变换
        new_transform = rasterio.windows.transform(clipped_window, src.transform)

        profile = src.profile.copy()
        profile.update(
            width=win_width,
            height=win_height,
            transform=new_transform,
        )

        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(data)

    logger.info(
        "GeoTIFF 已裁剪到精确范围：[%s, %s, %s, %s] → %s",
        min_lon, min_lat, max_lon, max_lat, output_path,
    )

    if should_replace:
        os.replace(output_path, input_path)
        return input_path

    return output_path
