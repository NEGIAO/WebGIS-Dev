# -*- coding: utf-8 -*-
"""纠偏瓦片路由：/proxy/gcj2wgs、/proxy/wgs2gcj、/proxy/bd2wgs、/proxy/wgs2bd。

内容整体搬自旧 `api/proxy.py`，逻辑逐字保留。

⚠️ 注册顺序约束：本路由必须先于通用流式代理
（`routes_passthrough.universal_stream_proxy` 的 `/proxy/{target_url:path}`）
挂载，否则纠偏路径会被通配路由吞掉。顺序由 `domains/tiles/__init__.py` 保证。
"""

import logging
from typing import Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from PIL import Image

from domains.tiles.proxy_shared import (
    _build_proxy_target_url,
    _rate_limit_check,
    _tile_cache,
    build_http_client,
)
from domains.tiles.rectify import (
    get_bd2wgs_tile,
    get_cache_dir,
    get_gcj2wgs_tile,
    get_wgs2bd_tile,
    get_wgs2gcj_tile,
    parse_tile_url,
)

router = APIRouter()

logger = logging.getLogger(__name__)

def _resolve_gcj_cache_dir(request: Request):
    cache_dir = getattr(request.app.state, "gcj_rectify_cache_dir", None)
    if cache_dir is None:
        cache_dir = get_cache_dir()
        request.app.state.gcj_rectify_cache_dir = cache_dir
    return cache_dir


def _resolve_gcj_http_client(request: Request) -> Tuple[httpx.AsyncClient, bool]:
    shared_client = getattr(request.app.state, "http_client", None)
    if shared_client is not None:
        return shared_client, False
    fallback_client = build_http_client()
    return fallback_client, True


# ==================== GCJ 瓦片纠偏代理 ====================
@router.get("/proxy/gcj2wgs/{target_url:path}")
async def gcj2wgs_proxy(target_url: str, request: Request, _: None = Depends(_rate_limit_check)):
    """GCJ02 -> WGS84 瓦片纠偏代理"""
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    try:
        template, xyz = parse_tile_url(upstream_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_key = f"gcj2wgs:{template.cache_key}:{xyz.z}/{xyz.x}/{xyz.y}"
    cached = _tile_cache.get(cache_key)
    if cached:
        logger.debug("瓦片缓存命中 [gcj2wgs z=%d/x=%d/y=%d]", xyz.z, xyz.x, xyz.y)
        return Response(content=cached.content, media_type=cached.media_type)

    cache_dir = _resolve_gcj_cache_dir(request)
    client, should_close = _resolve_gcj_http_client(request)
    try:
        tile_bytes = await get_gcj2wgs_tile(
            xyz.x, xyz.y, xyz.z, template, cache_dir, client=client
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="纠偏请求超时") from exc
    except ValueError as exc:
        # 资源护栏拒绝（瓦片字节/网格数超上限，P1-4 S2）属请求问题 → 400 而非 502
        raise HTTPException(status_code=400, detail=f"纠偏请求被拒绝: {exc}") from exc
    except Image.DecompressionBombError as exc:
        raise HTTPException(status_code=400, detail="上游瓦片像素超上限，已拒绝解码") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"纠偏失败: {exc}") from exc
    finally:
        if should_close:
            await client.aclose()

    _tile_cache.set(cache_key, tile_bytes, "image/png")
    logger.debug("瓦片缓存写入 [gcj2wgs z=%d/x=%d/y=%d] 当前缓存: %d 条目", xyz.z, xyz.x, xyz.y, _tile_cache.size)
    return Response(content=tile_bytes, media_type="image/png")


@router.get("/proxy/wgs2gcj/{target_url:path}")
async def wgs2gcj_proxy(target_url: str, request: Request, _: None = Depends(_rate_limit_check)):
    """WGS84 -> GCJ02 瓦片纠偏代理"""
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    try:
        template, xyz = parse_tile_url(upstream_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_key = f"wgs2gcj:{template.cache_key}:{xyz.z}/{xyz.x}/{xyz.y}"
    cached = _tile_cache.get(cache_key)
    if cached:
        logger.debug("瓦片缓存命中 [wgs2gcj z=%d/x=%d/y=%d]", xyz.z, xyz.x, xyz.y)
        return Response(content=cached.content, media_type=cached.media_type)

    cache_dir = _resolve_gcj_cache_dir(request)
    client, should_close = _resolve_gcj_http_client(request)
    try:
        tile_bytes = await get_wgs2gcj_tile(
            xyz.x, xyz.y, xyz.z, template, cache_dir, client=client
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="纠偏请求超时") from exc
    except ValueError as exc:
        # 同 gcj2wgs：资源护栏拒绝归 400（P1-4 S2）
        raise HTTPException(status_code=400, detail=f"纠偏请求被拒绝: {exc}") from exc
    except Image.DecompressionBombError as exc:
        raise HTTPException(status_code=400, detail="上游瓦片像素超上限，已拒绝解码") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"纠偏失败: {exc}") from exc
    finally:
        if should_close:
            await client.aclose()

    _tile_cache.set(cache_key, tile_bytes, "image/png")
    logger.debug("瓦片缓存写入 [wgs2gcj z=%d/x=%d/y=%d] 当前缓存: %d 条目", xyz.z, xyz.x, xyz.y, _tile_cache.size)
    return Response(content=tile_bytes, media_type="image/png")


# ==================== 百度 BD-09 瓦片纠偏代理 ====================
# 百度瓦片使用独立 BD09MC 网格（居中原点、Y 轴向上、res=2^(18-z)），
# 与标准 XYZ 网格既不平移等价也不分辨率等价（z_bd ≈ z±1），
# 纠偏必须跨网格拉源重采样，实现见 backend/domains/tiles/rectify/。
# 与 gcj 路由同契入式契约：URL 模板中 {x}{y}{z} 由客户端按其工作网格填充。


@router.get("/proxy/bd2wgs/{target_url:path}")
async def bd2wgs_proxy(target_url: str, request: Request, _: None = Depends(_rate_limit_check)):
    """百度 BD-09 → WGS84 瓦片纠偏代理。

    客户端以标准 XYZ 索引填充百度 URL 模板，返回同索引的
    WGS84 对齐瓦片（源为对应区域的百度瓦片网格）。
    """
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    try:
        template, xyz = parse_tile_url(upstream_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_key = f"bd2wgs:{template.cache_key}:{xyz.z}/{xyz.x}/{xyz.y}"
    cached = _tile_cache.get(cache_key)
    if cached:
        logger.debug("瓦片缓存命中 [bd2wgs z=%d/x=%d/y=%d]", xyz.z, xyz.x, xyz.y)
        return Response(content=cached.content, media_type=cached.media_type)

    cache_dir = _resolve_gcj_cache_dir(request)
    client, should_close = _resolve_gcj_http_client(request)
    try:
        tile_bytes = await get_bd2wgs_tile(
            xyz.x, xyz.y, xyz.z, template, cache_dir, client=client
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="纠偏请求超时") from exc
    except ValueError as exc:
        # 资源护栏拒绝（瓦片字节/网格数超上限）属请求问题 → 400 而非 502
        raise HTTPException(status_code=400, detail=f"纠偏请求被拒绝: {exc}") from exc
    except Image.DecompressionBombError as exc:
        raise HTTPException(status_code=400, detail="上游瓦片像素超上限，已拒绝解码") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"纠偏失败: {exc}") from exc
    finally:
        if should_close:
            await client.aclose()

    _tile_cache.set(cache_key, tile_bytes, "image/png")
    logger.debug("瓦片缓存写入 [bd2wgs z=%d/x=%d/y=%d] 当前缓存: %d 条目", xyz.z, xyz.x, xyz.y, _tile_cache.size)
    return Response(content=tile_bytes, media_type="image/png")


@router.get("/proxy/wgs2bd/{target_url:path}")
async def wgs2bd_proxy(target_url: str, request: Request, _: None = Depends(_rate_limit_check)):
    """WGS84 → 百度 BD-09 瓦片纠偏代理。

    客户端工作在百度网格空间（如原生加载百度底图叠加 WGS 图源），
    传入 WGS 图源 URL 模板、以百度网格索引填充 {x}{y}{z}，
    返回同索引、内容重采样自 WGS 源的百度网格瓦片。
    """
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    try:
        template, xyz = parse_tile_url(upstream_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_key = f"wgs2bd:{template.cache_key}:{xyz.z}/{xyz.x}/{xyz.y}"
    cached = _tile_cache.get(cache_key)
    if cached:
        logger.debug("瓦片缓存命中 [wgs2bd z=%d/x=%d/y=%d]", xyz.z, xyz.x, xyz.y)
        return Response(content=cached.content, media_type=cached.media_type)

    cache_dir = _resolve_gcj_cache_dir(request)
    client, should_close = _resolve_gcj_http_client(request)
    try:
        tile_bytes = await get_wgs2bd_tile(
            xyz.x, xyz.y, xyz.z, template, cache_dir, client=client
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="纠偏请求超时") from exc
    except ValueError as exc:
        # 同 bd2wgs：资源护栏拒绝归 400
        raise HTTPException(status_code=400, detail=f"纠偏请求被拒绝: {exc}") from exc
    except Image.DecompressionBombError as exc:
        raise HTTPException(status_code=400, detail="上游瓦片像素超上限，已拒绝解码") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"纠偏失败: {exc}") from exc
    finally:
        if should_close:
            await client.aclose()

    _tile_cache.set(cache_key, tile_bytes, "image/png")
    logger.debug("瓦片缓存写入 [wgs2bd z=%d/x=%d/y=%d] 当前缓存: %d 条目", xyz.z, xyz.x, xyz.y, _tile_cache.size)
    return Response(content=tile_bytes, media_type="image/png")


