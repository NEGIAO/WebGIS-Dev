# -*- coding: utf-8 -*-
"""源瓦片网格拉取 / 拼接 / 缓存（gcj/bd 双向共用）。

内容整体搬自旧 `gcj_rectify/rectify.py`（并发、重试、字节/网格护栏、
文件缓存、合成逻辑均原样保留），仅 import 前缀改为本包。
"""

from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from pathlib import Path
from typing import List, Optional

import httpx
from PIL import Image

from config import get_int

from domains.tiles.rectify.common.fetch import fetch_tile
from domains.tiles.rectify.common.geo import TILE_SIZE, bytes_to_image, image_to_bytes
from domains.tiles.rectify.common.url_template import TileUrlTemplate, build_tile_url

logger = logging.getLogger(__name__)

# 并发数：原为 100（注释自述"实际不限制"）；P1-4 S2 收紧至 16，
# 防单个纠偏请求打爆上游与本机 fd（重试机制仍由 fetch.py 处理限流错误）
MAX_CONCURRENCY = get_int("GCJRE_MAX_CONCURRENCY", 16)

# --- SSRF/资源耗尽护栏（P1-4 S2；方案 Docs/TODO/proxy-ssrf-hardening-plan.md）---
# 单瓦片字节上限：上游返回超大图时直接判废，避免进入解码
_TILE_MAX_BYTES = max(0, get_int("GCJRE_TILE_MAX_MB", 8)) * 1024 * 1024
# 解码像素上限：Pillow 默认 MAX_IMAGE_PIXELS 仅告警不拦截 → 显式收紧为硬上限，防解压炸弹
_MAX_IMAGE_PIXELS = get_int("GCJRE_MAX_IMAGE_PIXELS", 4096 * 4096)
# 单请求合成网格瓦片数上限：合成图为 (nx*256)×(ny*256)，无上限时内存随请求参数放大
_MAX_TILES_PER_REQUEST = get_int("GCJRE_MAX_TILES_PER_REQUEST", 64)

if _MAX_IMAGE_PIXELS > 0:
    # Pillow 的全局阈值：超过即抛 DecompressionBombError（而非仅 warning）
    Image.MAX_IMAGE_PIXELS = _MAX_IMAGE_PIXELS


def _reject_oversized_tile_bytes(data: bytes, url: str) -> None:
    """瓦片字节数超上限时抛 ValueError（由路由层转 400/502）。

    参数：data —— 上游返回字节；url —— 仅用于日志定位。无返回。
    """
    if _TILE_MAX_BYTES > 0 and data is not None and len(data) > _TILE_MAX_BYTES:
        logger.warning("纠偏瓦片超字节上限已拒绝：%s（%d > %d）", url, len(data), _TILE_MAX_BYTES)
        raise ValueError(
            f"上游瓦片过大：{len(data)} 字节 > 上限 {_TILE_MAX_BYTES} 字节"
        )


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
    """保存瓦片字节到缓存文件"""
    tile_path.parent.mkdir(parents=True, exist_ok=True)
    tile_path.write_bytes(tile_bytes)


def _build_blank_tile() -> Image.Image:
    """创建空白瓦片（RGBA）"""
    return Image.new("RGBA", (TILE_SIZE, TILE_SIZE))


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
    """获取单个瓦片（带文件缓存）

    优化：缓存命中时直接返回文件字节，避免解码/编码转换
    """
    tile_path = _tile_cache_path(cache_dir, template, category, z, x, y)

    # 缓存命中：直接读取字节返回
    if tile_path.exists():
        return tile_path.read_bytes()

    # 缓存未命中：从上游获取
    url = build_tile_url(template, x, y, z)
    tile_bytes = await fetch_tile(url, client=client)
    # P1-4 S2：先判字节上限，再进入解码/落盘（拒绝路径不写缓存）
    _reject_oversized_tile_bytes(tile_bytes, url)

    # 验证是有效图像后保存
    try:
        # 快速验证格式（检查 PNG/JPEG 魔数）
        if _is_valid_image_bytes(tile_bytes):
            _save_tile_bytes(tile_path, tile_bytes)
        else:
            # 需要转换格式
            image = bytes_to_image(tile_bytes)
            png_bytes = image_to_bytes(image)
            _save_tile_bytes(tile_path, png_bytes)
            return png_bytes
    except (OSError, IOError) as e:
        # 文件系统错误（权限、磁盘空间等）
        logger.warning("Failed to save tile to cache: %s", e)
    except Exception as e:
        # 其他未预期的错误
        logger.error("Unexpected error during tile validation: %s", e, exc_info=True)

    return tile_bytes


def _is_valid_image_bytes(data: bytes) -> bool:
    """快速检查字节是否为有效图像（通过魔数判断）

    支持的格式：PNG, JPEG, WebP, GIF

    Note:
        WebP 格式需要至少 12 字节（RIFF + 4字节大小 + WEBP）
    """
    # PNG 魔数: 89 50 4E 47 (4字节)
    if len(data) >= 4 and data[:4] == b'\x89PNG':
        return True
    # JPEG 魔数: FF D8 FF (3字节)
    if len(data) >= 3 and data[:3] == b'\xff\xd8\xff':
        return True
    # GIF 魔数: GIF87a 或 GIF89a (6字节)
    if len(data) >= 6 and data[:6] in (b'GIF87a', b'GIF89a'):
        return True
    # WebP 魔数: RIFF....WEBP (需要12字节)
    if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return True
    return False


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
    """并发获取瓦片网格

    不限制并发，依赖 fetch.py 的重试机制处理限流错误（RemoteProtocolError）。
    单个瓦片失败时返回空白瓦片而非中断整个请求。
    """
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def _run(x: int, y: int) -> bytes:
        async with semaphore:
            try:
                return await _get_tile_cached(
                    x, y, z, template, cache_dir, category, client=client
                )
            except Exception as e:
                logger.warning("Failed to fetch tile %s/z=%d/x=%d/y=%d: %s", category, z, x, y, repr(e))
                return image_to_bytes(_build_blank_tile())

    # 计算瓦片数量
    x_count = x_max - x_min + 1
    y_count = y_max - y_min + 1
    total_tiles = x_count * y_count

    # P1-4 S2：网格瓦片数上限——合成图为 (x_count*256)×(y_count*256)，
    # 无上限时内存占用随请求间接放大（正常纠偏为 2×2~3×3，默认 64 留足余量）
    if _MAX_TILES_PER_REQUEST > 0 and total_tiles > _MAX_TILES_PER_REQUEST:
        raise ValueError(
            f"纠偏网格过大：{x_count}x{y_count}={total_tiles} 片 > 上限 {_MAX_TILES_PER_REQUEST} 片"
        )

    if total_tiles > 9:
        logger.info("Fetching %d tiles for %s z=%d (grid: %dx%d)", total_tiles, category, z, x_count, y_count)

    # 创建所有任务（无延迟，无并发限制）
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
    """拼接标准 XYZ 网格瓦片（Y 轴向下，行序与索引升序一致）。"""
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
