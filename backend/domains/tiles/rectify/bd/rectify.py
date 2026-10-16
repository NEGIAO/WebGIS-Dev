# -*- coding: utf-8 -*-
"""百度 BD-09 瓦片纠偏：BD 网格 ↔ WGS84 标准 XYZ 网格跨网格重采样。

与 GCJ 纠偏的本质差异：GCJ 瓦片与 WGS 瓦片共用标准 Web 墨卡托网格
（仅坐标值偏移），可按同索引直接换 bbox；而百度瓦片使用独立的 BD09MC
网格（居中原点、Y 轴向上、res=2^(18-z)），且 BD res 与标准 XYZ res
不相等（z_bd ≈ z_out + 1 才能分辨率对齐），因此双向纠偏都必须：
拉取覆盖 bbox 的源网格 → 拼接 → 按精确四角四边形 QUAD 重采样到 256×256。

注意：勿将四角取极值压成轴对齐 box 再 resize——源四边形为倾斜平行
四边形（角点偏差达 0.88 源像素），且相邻瓦片在共享边上取极值方向
相反，会在接缝处形成 1px 级台阶（见 _quad_warp 文档）。QUAD 变换
保证共享边端点逐 bit 一致，几何严格无缝。

复用 domains.tiles.rectify.common.grid 的拉取/缓存/资源护栏（fetch.py 出站头由
core/http_headers.py 的 Referer 白名单适配百度防盗链）。
"""

from __future__ import annotations

import logging
import math
from io import BytesIO
from pathlib import Path
from typing import List, Optional, Tuple

import httpx
from PIL import Image

from domains.tiles.rectify.common.grid import (
    _fetch_tile_grid,
    _merge_tiles,
    _save_tile_bytes,
    _tile_cache_path,
)
from domains.tiles.rectify.common.quad import _quad_warp
from domains.tiles.rectify.common.transform import bd2wgs, wgs2bd
from domains.tiles.rectify.common.url_template import TileUrlTemplate
from domains.tiles.rectify.common.geo import TILE_SIZE, image_to_bytes, lonlat_to_global_px, xyz_to_bbox

from .mercator import bd_lonlat_to_px, bd_tile_bbox

logger = logging.getLogger(__name__)

# 百度街道底图（qt=vtile）实测可用的最高层级；>18 未验证，钳制防 404
_BD_MAX_ZOOM = 18
# 标准 XYZ 源网格最低层级下限（防 z-1 下穿 0）
_STD_MIN_ZOOM = 2


def _corners_bbox(
    bbox: Tuple[Tuple[float, float], Tuple[float, float]],
    convert,
) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    """bbox 四角逐点经坐标系转换后取极值，得到目标系 bbox。

    .. deprecated::
        取极值会丢弃四边形的倾斜信息，相邻瓦片在共享边上误差反相关，
        是接缝台阶的根因（见 :func:`_quad_warp`）。现仅保留供外部兼容；
        内部纠偏已改用精确四角 QUAD。确定源网格覆盖范围时请直接对四角
        坐标取极值（见 get_bd2wgs_tile / get_wgs2bd_tile 步骤 3），
        勿用本函数构造重采样几何。

    Args:
        bbox: ((lt_lon, lt_lat), (rb_lon, rb_lat))
        convert: (lon, lat) -> (lon, lat) 的坐标转换函数（wgs2bd / bd2wgs）

    Returns:
        ((lt_lon, lt_lat), (rb_lon, rb_lat)) 转换后的 bbox
    """
    lt, rb = bbox
    pts = [
        convert(lt[0], lt[1]),
        convert(rb[0], lt[1]),
        convert(lt[0], rb[1]),
        convert(rb[0], rb[1]),
    ]
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    return (min(lons), max(lats)), (max(lons), min(lats))


def _merge_bd_tiles(
    tiles: List[bytes],
    tx_min: int,
    tx_max: int,
    ty_min: int,
    ty_max: int,
) -> Image.Image:
    """拼接百度源瓦片网格为合成大图。

    百度网格 Y 轴向上：ty 越大越靠北，合成图第 0 行必须是最北的 ty_max。
    瓦片列表顺序与 _fetch_tile_grid 的 (tx 升序, ty 升序) 一致。

    Args:
        tiles: 网格瓦片字节列表（按 tx/ty 升序）
        tx_min/tx_max/ty_min/ty_max: 百度源网格索引范围

    Returns:
        RGBA 合成图
    """
    composite = Image.new(
        "RGBA",
        ((tx_max - tx_min + 1) * TILE_SIZE, (ty_max - ty_min + 1) * TILE_SIZE),
    )
    idx = 0
    for tx in range(tx_min, tx_max + 1):
        for ty in range(ty_min, ty_max + 1):
            with Image.open(BytesIO(tiles[idx])) as tile:
                col = tx - tx_min
                row = ty_max - ty  # Y 轴向上 → 行号翻转
                composite.paste(tile.convert("RGBA"), (col * TILE_SIZE, row * TILE_SIZE))
            idx += 1
    return composite


def _crop_resize(composite: Image.Image, box: Tuple[float, float, float, float]) -> Image.Image:
    """按像素级仿射框从合成图裁切并缩放到 256×256 输出瓦片。

    .. deprecated::
        轴对齐 box 近似已由 :func:`_quad_warp` 取代（相邻瓦片接缝错位 bug，
        见本模块文档）。仅保留作退化兜底（四边形退化时）。

    Args:
        composite: 源网格合成图
        box: (left, top, right, bottom) 合成图像素坐标（float，PIL resize box 语义）

    Returns:
        256×256 RGBA 输出瓦片；box 落在合成图外/过小时返回透明瓦片
    """
    left, top, right, bottom = box
    left = max(0.0, min(left, composite.width))
    right = max(0.0, min(right, composite.width))
    top = max(0.0, min(top, composite.height))
    bottom = max(0.0, min(bottom, composite.height))
    if right - left < 0.5 or bottom - top < 0.5:
        return Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    return composite.resize(
        (TILE_SIZE, TILE_SIZE), Image.LANCZOS, box=(left, top, right, bottom)
    )


# bd 双向的重采样核：跨网格降采样（约 306→256），用 BICUBIC 保细节；
# gcj 双向同网格 1:1，用共用函数默认的 BILINEAR（更锐、更快）。
_BD_RESAMPLE = Image.BICUBIC


async def get_bd2wgs_tile(
    x: int,
    y: int,
    z: int,
    template: TileUrlTemplate,
    cache_dir: Path,
    *,
    client: Optional[httpx.AsyncClient] = None,
) -> bytes:
    """百度瓦片源 → WGS84 标准 XYZ 输出瓦片（bd2wgs 纠偏）。

    输出为 (x, y, z) 标准 XYZ 瓦片：前端以标准 XYZ 索引填充 URL 模板，
    本函数将其四角转 BD09 后拉取对应百度源网格，QUAD 重采样对齐 WGS84。

    Args:
        x/y/z: 输出瓦片的标准 XYZ 索引
        template: 由传入百度 URL 解析出的模板（用作源瓦片拉取模板）
        cache_dir: 纠偏瓦片文件缓存目录
        client: 可选共享 httpx 客户端

    Returns:
        PNG 瓦片字节
    """
    output_path = _tile_cache_path(cache_dir, template, "bd2wgs2", z, x, y)
    if output_path.exists():
        return output_path.read_bytes()

    # 1. 输出瓦片四角（WGS84）→ BD09 → 百度全局像素（Y 轴向上）。
    #    必须保留四角逐点坐标做 QUAD 变换：四角取极值压成轴对齐 box 会
    #    引入达 0.88 源像素的角点误差，且相邻瓦片在共享边上误差反相关，
    #    是接缝台阶的根因（见 _quad_warp 文档）。
    wgs_bbox = xyz_to_bbox(x, y, z)
    (wgs_west, wgs_north), (wgs_east, wgs_south) = wgs_bbox
    bd_lt = wgs2bd(wgs_west, wgs_north)
    bd_rt = wgs2bd(wgs_east, wgs_north)
    bd_lb = wgs2bd(wgs_west, wgs_south)
    bd_rb = wgs2bd(wgs_east, wgs_south)

    # 2. 分辨率对齐：标准 XYZ z 级 ≈ 百度 z+1 级（156543·cosφ/2^z vs 2^(18-z)）
    z_bd = min(z + 1, _BD_MAX_ZOOM)

    # 3. 精确四角源坐标 + 由其极值确定源网格索引范围（仅用于覆盖拉取）
    px_lt = bd_lonlat_to_px(*bd_lt, z_bd)
    px_rt = bd_lonlat_to_px(*bd_rt, z_bd)
    px_lb = bd_lonlat_to_px(*bd_lb, z_bd)
    px_rb = bd_lonlat_to_px(*bd_rb, z_bd)
    all_px = (px_lt[0], px_rt[0], px_lb[0], px_rb[0])
    all_py = (px_lt[1], px_rt[1], px_lb[1], px_rb[1])
    tx_min, tx_max = math.floor(min(all_px) / TILE_SIZE), math.floor(max(all_px) / TILE_SIZE)
    ty_min, ty_max = math.floor(min(all_py) / TILE_SIZE), math.floor(max(all_py) / TILE_SIZE)

    # 4. 拉取源网格并拼接（护栏/并发/缓存均在 common.grid._fetch_tile_grid 内）
    tiles = await _fetch_tile_grid(
        tx_min, tx_max, ty_min, ty_max, z_bd, template, cache_dir, "source-bd", client
    )
    composite = _merge_bd_tiles(tiles, tx_min, tx_max, ty_min, ty_max)

    # 5. QUAD 重采样：合成图内 y 翻转后的精确四边形 → 256×256。
    #    共享边端点由同一地理角点算出，相邻瓦片 bit 级一致，严格无缝。
    top_in_grid = (ty_max + 1) * TILE_SIZE  # 合成图第 0 行对应的全局 py 上界

    def _to_composite(px: float, py: float) -> Tuple[float, float]:
        return (px - tx_min * TILE_SIZE, top_in_grid - py)

    quad = (
        _to_composite(*px_lt),  # NW
        _to_composite(*px_lb),  # SW
        _to_composite(*px_rb),  # SE
        _to_composite(*px_rt),  # NE
    )
    out = _quad_warp(composite, quad, _BD_RESAMPLE)
    data = image_to_bytes(out)
    _save_tile_bytes(output_path, data)
    return data


async def get_wgs2bd_tile(
    x: int,
    y: int,
    z: int,
    template: TileUrlTemplate,
    cache_dir: Path,
    *,
    client: Optional[httpx.AsyncClient] = None,
) -> bytes:
    """WGS84 源 → 百度网格输出瓦片（wgs2bd 纠偏）。

    输出为 (x, y, z) 百度网格瓦片：客户端工作在百度坐标空间（如原生加载
    百度底图并叠加 WGS 图源），传入 URL 模板中的索引按百度网格解释；
    其 bbox 转 WGS84 后按标准 XYZ 网格拉取源瓦片，重采样对齐百度网格。

    Args:
        x/y/z: 输出瓦片的百度网格索引
        template: 由传入 WGS 图源 URL 解析出的模板（用作源瓦片拉取模板）
        cache_dir: 纠偏瓦片文件缓存目录
        client: 可选共享 httpx 客户端

    Returns:
        PNG 瓦片字节
    """
    output_path = _tile_cache_path(cache_dir, template, "wgs2bd2", z, x, y)
    if output_path.exists():
        return output_path.read_bytes()

    # 1. 输出百度瓦片四角（BD09）→ WGS84（逐点保留，勿取极值压扁；
    #    同 bd2wgs，实测角点偏差达 0.71 源像素，是接缝台阶的根因）。
    bd_bbox = bd_tile_bbox(x, y, z)
    # 百度世界范围校验：索引越界（换算后 |lon|>180 或 |lat|>85）的瓦片
    # 不存在于百度网格，显式拒绝而非静默返回透明瓦片
    if (
        abs(bd_bbox[0][0]) > 180.0 or abs(bd_bbox[1][0]) > 180.0
        or abs(bd_bbox[0][1]) > 85.0 or abs(bd_bbox[1][1]) > 85.0
    ):
        raise ValueError(
            f"百度瓦片索引越界: x={x} y={y} z={z} 换算后超出 BD09 世界范围"
        )
    (bd_west, bd_north), (bd_east, bd_south) = bd_bbox
    wgs_lt = bd2wgs(bd_west, bd_north)
    wgs_rt = bd2wgs(bd_east, bd_north)
    wgs_lb = bd2wgs(bd_west, bd_south)
    wgs_rb = bd2wgs(bd_east, bd_south)

    # 2. 分辨率对齐：百度 z 级 ≈ 标准 XYZ z-1 级
    z_src = max(z - 1, _STD_MIN_ZOOM)
    n = 2 ** z_src

    # 3. 精确四角 → 标准 XYZ 全局像素（Y 轴向下，共用 helper，
    #    与 lonlat_to_xyz 同公式但保留浮点）；网格范围由其极值确定
    def _std_px(lon: float, lat: float) -> Tuple[float, float]:
        return lonlat_to_global_px(lon, lat, z_src)

    px_lt = _std_px(*wgs_lt)
    px_rt = _std_px(*wgs_rt)
    px_lb = _std_px(*wgs_lb)
    px_rb = _std_px(*wgs_rb)
    all_px = (px_lt[0], px_rt[0], px_lb[0], px_rb[0])
    all_py = (px_lt[1], px_rt[1], px_lb[1], px_rb[1])
    limit = n - 1
    tx_min = max(0, min(math.floor(min(all_px) / TILE_SIZE), limit))
    tx_max = max(0, min(math.floor(max(all_px) / TILE_SIZE), limit))
    ty_min = max(0, min(math.floor(min(all_py) / TILE_SIZE), limit))
    ty_max = max(0, min(math.floor(max(all_py) / TILE_SIZE), limit))

    # 4. 拉取源网格并拼接（标准 XYZ y 向下，行序与索引升序一致）
    tiles = await _fetch_tile_grid(
        tx_min, tx_max, ty_min, ty_max, z_src, template, cache_dir, "source-wgs", client
    )
    composite = _merge_tiles(tiles, tx_min, tx_max, ty_min, ty_max)

    # 5. QUAD 重采样（标准 XYZ 像素方向与合成图一致，无需翻转）
    def _to_composite(px: float, py: float) -> Tuple[float, float]:
        return (px - tx_min * TILE_SIZE, py - ty_min * TILE_SIZE)

    quad = (
        _to_composite(*px_lt),  # NW
        _to_composite(*px_lb),  # SW
        _to_composite(*px_rb),  # SE
        _to_composite(*px_rt),  # NE
    )
    out = _quad_warp(composite, quad, _BD_RESAMPLE)
    data = image_to_bytes(out)
    _save_tile_bytes(output_path, data)
    return data
