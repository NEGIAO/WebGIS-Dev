from __future__ import annotations

from io import BytesIO
from math import atan, cos, log, pi, sinh, tan
from pathlib import Path
from typing import Tuple

from PIL import Image

from config import get_str

from .transform import gcj2wgs, wgs2gcj

TILE_SIZE = 256


def _find_backend_root() -> Path:
    """向上查找 backend 根目录（以 pyproject.toml 为标记）。

    旧实现用 `__file__.parents[1]` 硬编码，包搬迁即错指
    （曾误在 `domains/tiles/rectify/data/` 下建缓存）。按标记查找，
    搬到哪里都不怕；找不到则回退到文件所在包的四级父目录。
    """
    here = Path(__file__).resolve()
    for parent in (here.parent, *here.parents):
        if (parent / "pyproject.toml").is_file():
            return parent
    return here.parents[4] if len(here.parents) > 4 else here.parent


def get_cache_dir() -> Path:
    """Resolve the cache directory for rectified tiles."""
    env_cache = get_str("GCJRE_CACHE", "")
    if env_cache:
        cache_dir = Path(env_cache)
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    backend_root = _find_backend_root()
    cache_dir = backend_root.joinpath("data", "gcj_rectify_cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def bytes_to_image(content: bytes) -> Image.Image:
    """Convert bytes to a PIL Image."""
    image = Image.open(BytesIO(content))
    image.load()
    return image


def image_to_bytes(image: Image.Image, img_format: str = "PNG") -> bytes:
    """Convert a PIL Image to bytes."""
    img_buffer = BytesIO()
    image.save(img_buffer, format=img_format)
    img_bytes = img_buffer.getvalue()
    img_buffer.close()
    return img_bytes


def xyz_to_lonlat(x: int, y: int, z: int) -> Tuple[float, float]:
    """Convert XYZ tile coordinate to lon/lat for the upper-left corner."""
    n = 2.0**z
    lon_deg = x / n * 360.0 - 180.0
    lat_rad = atan(sinh(pi * (1 - 2 * y / n)))
    lat_deg = lat_rad * 180.0 / pi
    return lon_deg, lat_deg


def lonlat_to_xyz(lon: float, lat: float, z: int) -> Tuple[int, int]:
    """Convert lon/lat to XYZ tile coordinate."""
    n = 2.0**z
    x = (lon + 180.0) / 360.0 * n
    lat_rad = lat * pi / 180.0
    t = log(tan(lat_rad) + 1 / cos(lat_rad))
    y = (1 - t / pi) * n / 2
    return _clamp_xy(int(x), int(y), z)


def lonlat_to_global_px(lon: float, lat: float, z: int) -> Tuple[float, float]:
    """经纬度 → 该层级全局像素坐标（float，不取整不钳制）。

    与 :func:`lonlat_to_xyz` 同一公式（标准 slippy 约定：x 向东、y 向南），
    但保留浮点亚像素部分，供 QUAD 精确重采样用。调用方按需自行处理
    网格覆盖范围（floor 取极值）与越界钳制。
    """
    n = 2.0**z
    px = (lon + 180.0) / 360.0 * n * TILE_SIZE
    lat_rad = lat * pi / 180.0
    t = log(tan(lat_rad) + 1 / cos(lat_rad))
    py = (1 - t / pi) * n / 2 * TILE_SIZE
    return px, py


def xyz_to_bbox(x: int, y: int, z: int) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    """Convert XYZ tile coordinate to bounding box (lon/lat)."""
    left_upper_lon, left_upper_lat = xyz_to_lonlat(x, y, z)
    right_lower_lon, right_lower_lat = xyz_to_lonlat(x + 1, y + 1, z)
    return (left_upper_lon, left_upper_lat), (right_lower_lon, right_lower_lat)


def wgsbbox_to_gcjbbox(wgs_bbox: Tuple[Tuple[float, float], Tuple[float, float]]):
    """Convert WGS84 bounding box to GCJ02 bounding box."""
    left_upper, right_lower = wgs_bbox
    gcj_left_upper = wgs2gcj(left_upper[0], left_upper[1])
    gcj_right_lower = wgs2gcj(right_lower[0], right_lower[1])
    return gcj_left_upper, gcj_right_lower


def gcjbbox_to_wgsbbox(gcj_bbox: Tuple[Tuple[float, float], Tuple[float, float]]):
    """Convert GCJ02 bounding box to WGS84 bounding box."""
    left_upper, right_lower = gcj_bbox
    wgs_left_upper = gcj2wgs(left_upper[0], left_upper[1])
    wgs_right_lower = gcj2wgs(right_lower[0], right_lower[1])
    return wgs_left_upper, wgs_right_lower


def _bbox_four_corners(bbox, convert):
    """bbox 四角逐点转换，返回 (LT, RT, LB, RB) 精确坐标（不取极值）。

    QUAD 重采样要求共享边端点逐 bit 一致，取极值会丢弃倾斜信息，
    故此处保留四角各自的转换结果。
    """
    (west, north), (east, south) = bbox
    return (
        convert(west, north),  # LT
        convert(east, north),  # RT
        convert(west, south),  # LB
        convert(east, south),  # RB
    )


def wgsbbox_to_gcj_corners(wgs_bbox) -> Tuple[Tuple[float, float], ...]:
    """WGS84 bbox → GCJ02 四角精确坐标 (LT, RT, LB, RB)。"""
    return _bbox_four_corners(wgs_bbox, wgs2gcj)


def gcjbbox_to_wgs_corners(gcj_bbox) -> Tuple[Tuple[float, float], ...]:
    """GCJ02 bbox → WGS84 四角精确坐标 (LT, RT, LB, RB)。"""
    return _bbox_four_corners(gcj_bbox, gcj2wgs)


def _clamp_xy(x: int, y: int, z: int) -> Tuple[int, int]:
    limit = 2**z - 1
    if x < 0:
        x = 0
    elif x > limit:
        x = limit
    if y < 0:
        y = 0
    elif y > limit:
        y = limit
    return x, y
