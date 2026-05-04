from __future__ import annotations

from io import BytesIO
from math import atan, cos, log, pi, sinh, tan
import os
from pathlib import Path
from typing import Tuple

from PIL import Image

from .transform import gcj2wgs, wgs2gcj

TILE_SIZE = 256


def get_cache_dir() -> Path:
    """Resolve the cache directory for rectified tiles."""
    env_cache = os.getenv("GCJRE_CACHE")
    if env_cache:
        cache_dir = Path(env_cache)
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    backend_root = Path(__file__).resolve().parents[1]
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
