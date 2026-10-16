# -*- coding: utf-8 -*-
"""直通瓦片路由：专用海图 + 通用流式代理。

内容整体搬自旧 `api/proxy.py`，逻辑逐字保留。

⚠️ 注册顺序约束：必须后于 `routes_rectify` 挂载（见该模块文档）。
"""

import logging
from typing import Dict

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from config import get_str
from domains.tiles.proxy_shared import (
    PROXY_DEFAULT_REQUEST_HEADERS,
    PROXY_HOP_BY_HOP_HEADERS,
    PROXY_PASSTHROUGH_HEADERS,
    _build_proxy_request_headers,
    _build_proxy_target_url,
    _limited_stream,
    _rate_limit_check,
    _reject_if_content_length_exceeds,
)

router = APIRouter()

logger = logging.getLogger(__name__)

# ==================== 专用海图代理 ====================
@router.get("/tiles/ships66/{z}/{x}/{y}.png")
async def ships66_tile(z: int, x: int, y: int, request: Request, _: None = Depends(_rate_limit_check)):
    upstream_url = get_str("SHIPS66_TILE_URL_TEMPLATE").format(z=z, x=x, y=y)
    headers = {
        "User-Agent": PROXY_DEFAULT_REQUEST_HEADERS["User-Agent"],
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }

    client = getattr(request.app.state, "http_client", None)
    fallback_client = None
    if client is None:
        fallback_client = httpx.AsyncClient(follow_redirects=False)
        client = fallback_client

    try:
        upstream_request = client.build_request("GET", upstream_url, headers=headers)
        upstream_response = await client.send(upstream_request, stream=True)

        if upstream_response.status_code in (301, 302, 307, 308):
            location = upstream_response.headers.get("location")

            background = BackgroundTasks()
            background.add_task(upstream_response.aclose)
            if fallback_client:
                background.add_task(fallback_client.aclose)

            return Response(
                status_code=upstream_response.status_code,
                headers={"Location": location},
                background=background,
            )
    except httpx.TimeoutException:
        if fallback_client:
            await fallback_client.aclose()
        raise HTTPException(status_code=504, detail="瓦片请求超时")
    except Exception as exc:
        if fallback_client:
            await fallback_client.aclose()
        logger.error(f"海图瓦片请求失败: {exc!r}")
        raise HTTPException(status_code=502, detail=str(exc))

    response_headers = {
        key: value
        for key, value in upstream_response.headers.items()
        if key.lower() not in PROXY_HOP_BY_HOP_HEADERS and key.lower() in PROXY_PASSTHROUGH_HEADERS
    }

    # ships66 纯中转不缓存，保持流式响应以降低峰值内存
    background = BackgroundTasks()
    background.add_task(upstream_response.aclose)
    if fallback_client:
        background.add_task(fallback_client.aclose)

    return StreamingResponse(
        upstream_response.aiter_raw(),
        media_type=upstream_response.headers.get("content-type", "image/png"),
        status_code=upstream_response.status_code,
        headers=response_headers,
        background=background,
    )


# ==================== 通用流式代理 ====================
@router.get("/proxy/{target_url:path}")
async def universal_stream_proxy(target_url: str, request: Request, _: None = Depends(_rate_limit_check)):
    """通用流式代理接口"""
    upstream_url = _build_proxy_target_url(target_url, request.url.query)

    proxy_request_headers = _build_proxy_request_headers(request, upstream_url)

    shared_client = getattr(request.app.state, "http_client", None)
    fallback_client = None
    client = shared_client

    if client is None:
        fallback_client = httpx.AsyncClient(follow_redirects=False)
        client = fallback_client

    try:
        upstream_request = client.build_request("GET", upstream_url, headers=proxy_request_headers)
        upstream_response = await client.send(upstream_request, stream=True)

        if upstream_response.status_code in (301, 302, 307, 308):
            location = upstream_response.headers.get("location")

            background = BackgroundTasks()
            background.add_task(upstream_response.aclose)
            if fallback_client:
                background.add_task(fallback_client.aclose)

            return Response(
                status_code=upstream_response.status_code,
                headers={"Location": location},
                background=background,
            )
    except httpx.TimeoutException:
        if fallback_client is not None:
            await fallback_client.aclose()
        return JSONResponse(
            status_code=504,
            content={"detail": "代理请求超时", "upstream": upstream_url},
            headers={"X-Proxy-Status": "TIMEOUT"},
        )
    except httpx.HTTPError as exc:
        if fallback_client is not None:
            await fallback_client.aclose()
        return JSONResponse(
            status_code=502,
            content={"detail": "代理请求失败", "upstream": upstream_url, "error": str(exc)},
            headers={"X-Proxy-Status": "UPSTREAM_ERROR"},
        )

    response_headers: Dict[str, str] = {}
    for key, value in upstream_response.headers.items():
        lower_key = key.lower()
        if lower_key in PROXY_HOP_BY_HOP_HEADERS:
            continue
        if lower_key in PROXY_PASSTHROUGH_HEADERS:
            response_headers[key] = value

    proxy_status = "SUCCESS" if upstream_response.status_code < 400 else "UPSTREAM_ERROR"
    response_headers["X-Proxy-Status"] = proxy_status

    background_tasks = BackgroundTasks()
    background_tasks.add_task(upstream_response.aclose)
    if fallback_client is not None:
        background_tasks.add_task(fallback_client.aclose)

    # 响应体上限（P1-4 S2）：先按 Content-Length 预检，再由 _limited_stream 兜住无长度声明的流
    try:
        _reject_if_content_length_exceeds(upstream_response)
    except HTTPException:
        await upstream_response.aclose()
        if fallback_client is not None:
            await fallback_client.aclose()
        raise

    return StreamingResponse(
        _limited_stream(upstream_response, upstream_url),
        status_code=upstream_response.status_code,
        headers=response_headers,
        background=background_tasks,
    )
