# -*- coding: utf-8 -*-
"""GCJ-02 ↔ WGS84 瓦片纠偏（同网格同分辨率，精确四角 QUAD 重采样）。

由旧 `gcj_rectify/rectify.py` 拆分而来：网格拉取/拼接/护栏移入
`domains.tiles.rectify.common.grid`，`_quad_warp` 移入同包 `common.quad`，
坐标数学移入 `common.{transform,geo}`；本文件只保留
gcj 双向编排与 gcj 特有的重采样核选择。
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Optional, Tuple

import httpx
from PIL import Image

from domains.tiles.rectify.common.geo import (
    TILE_SIZE,
    gcjbbox_to_wgs_corners,
    image_to_bytes,
    lonlat_to_global_px,
    wgsbbox_to_gcj_corners,
    xyz_to_bbox,
)
from domains.tiles.rectify.common.grid import (
    _build_blank_tile,
    _fetch_tile_grid,
    _get_tile_cached,
    _merge_tiles,
    _save_tile_bytes,
    _tile_cache_path,
)
from domains.tiles.rectify.common.quad import _quad_warp
from domains.tiles.rectify.common.url_template import TileUrlTemplate

# 纠偏重采样核：BILINEAR（同网格 1:1 下与 BICUBIC 肉眼无差、更快、
# 核半径更小 → 柔化更轻）。如需逐像素锐度优先（bit 级保留源像素），可改
# 为 Image.NEAREST，但几何残差回到 ≤0.5px（四舍五入量化）。
_GCJ_RESAMPLE = Image.BILINEAR


def _crop_composite(
    composite: Image.Image,
    merged_bbox,
    target_bbox,
) -> Image.Image:
    """按比例从合成图裁切 256×256 窗口（旧实现，int 截断）。

    .. deprecated::
        ``int()`` 截断带来每瓦片达 1px 的几何量化误差，且相邻瓦片不相关，
        是 gcj 接缝台阶的根因（另有约 −0.5px 系统性偏移）。内部纠偏已改用
        精确四角 :func:`domains.tiles.rectify.common.quad._quad_warp`。仅保留供外部兼容。
    """
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


async def _build_rectified_tile(
    source_corners,
    z: int,
    template: TileUrlTemplate,
    cache_dir: Path,
    source_category: str,
    client: Optional[httpx.AsyncClient],
) -> bytes:
    """由源坐标系下的精确四角构造纠偏瓦片（QUAD 重采样，几何无缝）。

    旧实现只取两角点（LT/RB）+ ``int()`` 截断定位 256 窗口拷贝，带来
    达 1px 的量化台阶与约 −0.5px 系统偏移；现对四角逐点算全局像素
    （float），网格覆盖范围由其极值确定，重采样用共用 ``_quad_warp``。
    共享边端点由同一地理角点算出，相邻瓦片 bit 级一致。

    Args:
        source_corners: ((lt_lon, lt_lat), (rt_lon, rt_lat),
            (lb_lon, lb_lat), (rb_lon, rb_lat)) 源坐标系四角经纬度
    """
    (lt_lon, lt_lat), (rt_lon, rt_lat), (lb_lon, lb_lat), (rb_lon, rb_lat) = source_corners
    px_lt = lonlat_to_global_px(lt_lon, lt_lat, z)
    px_rt = lonlat_to_global_px(rt_lon, rt_lat, z)
    px_lb = lonlat_to_global_px(lb_lon, lb_lat, z)
    px_rb = lonlat_to_global_px(rb_lon, rb_lat, z)
    all_px = (px_lt[0], px_rt[0], px_lb[0], px_rb[0])
    all_py = (px_lt[1], px_rt[1], px_lb[1], px_rb[1])
    limit = 2**z - 1
    x_min = max(0, min(math.floor(min(all_px) / TILE_SIZE), limit))
    x_max = max(0, min(math.floor(max(all_px) / TILE_SIZE), limit))
    y_min = max(0, min(math.floor(min(all_py) / TILE_SIZE), limit))
    y_max = max(0, min(math.floor(max(all_py) / TILE_SIZE), limit))

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

    def _to_composite(px: float, py: float) -> Tuple[float, float]:
        return (px - x_min * TILE_SIZE, py - y_min * TILE_SIZE)

    quad = (
        _to_composite(*px_lt),  # NW
        _to_composite(*px_lb),  # SW
        _to_composite(*px_rb),  # SE
        _to_composite(*px_rt),  # NE
    )
    warped = _quad_warp(composite, quad, _GCJ_RESAMPLE)
    return image_to_bytes(warped)


async def get_gcj2wgs_tile(
    x: int,
    y: int,
    z: int,
    template: TileUrlTemplate,
    cache_dir: Path,
    *,
    client: Optional[httpx.AsyncClient] = None,
) -> bytes:
    """Return a WGS tile built from GCJ tiles.

    GCJ-02 -> WGS84 纠偏流程：
    1. 检查输出缓存，命中则直接返回
    2. z <= 9 时直接返回源瓦片（低缩放级别偏差可忽略）
    3. z > 9 时执行像素级纠偏
    """
    output_path = _tile_cache_path(cache_dir, template, "gcj2wgs2", z, x, y)

    # 缓存命中：直接返回字节
    if output_path.exists():
        return output_path.read_bytes()

    # 低缩放级别：偏差可忽略，直接返回源瓦片
    if z <= 9:
        tile_bytes = await _get_tile_cached(
            x, y, z, template, cache_dir, "source-gcj", client=client
        )
        _save_tile_bytes(output_path, tile_bytes)
        return tile_bytes

    # 高缩放级别：执行像素级纠偏（四角逐点转换，勿取极值压扁）
    wgs_bbox = xyz_to_bbox(x, y, z)
    gcj_corners = wgsbbox_to_gcj_corners(wgs_bbox)
    tile_bytes = await _build_rectified_tile(
        gcj_corners, z, template, cache_dir, "source-gcj", client
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
    """Return a GCJ tile built from WGS tiles.

    WGS84 -> GCJ-02 纠偏流程：
    1. 检查输出缓存，命中则直接返回
    2. z <= 9 时直接返回源瓦片（低缩放级别偏差可忽略）
    3. z > 9 时执行像素级纠偏
    """
    output_path = _tile_cache_path(cache_dir, template, "wgs2gcj2", z, x, y)

    # 缓存命中：直接返回字节
    if output_path.exists():
        return output_path.read_bytes()

    # 低缩放级别：偏差可忽略，直接返回源瓦片
    if z <= 9:
        tile_bytes = await _get_tile_cached(
            x, y, z, template, cache_dir, "source-wgs", client=client
        )
        _save_tile_bytes(output_path, tile_bytes)
        return tile_bytes

    # 高缩放级别：执行像素级纠偏（四角逐点转换，勿取极值压扁）
    gcj_bbox = xyz_to_bbox(x, y, z)
    wgs_corners = gcjbbox_to_wgs_corners(gcj_bbox)
    tile_bytes = await _build_rectified_tile(
        wgs_corners, z, template, cache_dir, "source-wgs", client
    )
    _save_tile_bytes(output_path, tile_bytes)
    return tile_bytes
