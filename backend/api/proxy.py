import httpx
import ipaddress
import logging
import os
from typing import Any, Dict, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from fastapi.responses import JSONResponse, Response, StreamingResponse

from gcj_rectify.rectify import get_gcj2wgs_tile, get_wgs2gcj_tile
from gcj_rectify.url_template import parse_tile_url
from gcj_rectify.utils import get_cache_dir



# 初始化路由对象
router = APIRouter()

# 定义日志记录器（可选，建议保留）
logger = logging.getLogger(__name__)


# 解析布尔环境变量，支持常见开关值。
def _parse_env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


PROXY_ALLOW_PRIVATE_HOSTS = _parse_env_flag("PROXY_ALLOW_PRIVATE_HOSTS", False)
PROXY_VERIFY_SSL = _parse_env_flag("PROXY_VERIFY_SSL", True)

def build_http_client():
    """
    创建并配置全局异步 HTTP 客户端
    """
    return httpx.AsyncClient(
        timeout=httpx.Timeout(20.0, connect=5.0), # 设置超时时间
        follow_redirects=False,
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        verify=PROXY_VERIFY_SSL, # 默认启用 TLS 校验，必要时可通过环境变量关闭
    )
# ==================== 通用流式代理 ====================
# =====================================================
#  HTTP 代理，可以代理任意上游资源，前端通过构造特定的 URL 来访问不同的服务（如瓦片服务、外部 API 等）。
# Proxy/proxy
PROXY_HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}

PROXY_PASSTHROUGH_HEADERS = {
    "accept-ranges",
    "cache-control",
    "content-disposition",
    "content-encoding",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "expires",
    "last-modified",
    "vary",
}

PROXY_DEFAULT_REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/png,image/*,*/*;q=0.8",  # 优化：优先接受图片
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
}


# 判定目标主机是否为本地或私网地址。
def _is_private_host(hostname: str) -> bool:
    if not hostname:
        return True
    lower = hostname.lower()
    if lower == "localhost" or lower.endswith(".local"):
        return True
    try:
        ip = ipaddress.ip_address(lower)
    except ValueError:
        return False
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


# 校验代理目标 URL，阻止非 http(s) 与私网/本地访问。
def _validate_proxy_target_url(upstream_url: str) -> None:
    parsed = urlparse(upstream_url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http/https targets are allowed")
    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="Target host is missing")
    if not PROXY_ALLOW_PRIVATE_HOSTS and _is_private_host(parsed.hostname):
        raise HTTPException(status_code=403, detail="Target host is not allowed")
# 构建上游 URL 的函数，支持协议补全和查询参数拼接
def _build_proxy_target_url(target_url: str, query: str) -> str:
    normalized_target = str(target_url or "").strip().lstrip("/")
    if not normalized_target:
        raise HTTPException(status_code=400, detail="target_url 不能为空")

    # 约定：缺省协议统一补全为 https://，并允许调用方显式传入 http/https。
    if normalized_target.startswith(("http://", "https://")):
        upstream_url = normalized_target
    else:
        upstream_url = f"https://{normalized_target}"

    compact_query = str(query or "").lstrip("?")
    if compact_query:
        glue = "&" if "?" in upstream_url else "?"
        upstream_url = f"{upstream_url}{glue}{compact_query}"

    _validate_proxy_target_url(upstream_url)
    return upstream_url
# 构建代理请求头的函数，保留关键头部以增强兼容性，同时使用默认值确保基本功能。
def _build_proxy_request_headers(request: Request) -> Dict[str, str]:
    headers = dict(PROXY_DEFAULT_REQUEST_HEADERS)

    # 保留关键请求头，增强对上游服务的兼容性。
    for key in ("Accept", "Accept-Language", "Referer", "Origin", "Range"):
        incoming_value = request.headers.get(key)
        if incoming_value:
            headers[key] = incoming_value

    return headers


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

#海图专用代理（因为 ships66 的瓦片服务对请求头要求较高，且不允许跨域访问，所以单独写一个专用接口来代理这些瓦片请求，避免污染通用代理的逻辑和性能）
#eg:本地前端请求：http://localhost:8000/tiles/ships66/{z}/{x}/{y}.png
@router.get("/tiles/ships66/{z}/{x}/{y}.png")
async def ships66_tile(z: int, x: int, y: int, request: Request):
    upstream_url = f"http://g3.ships66.com/maps/one/{z}/{x}/{y}.png"

    # 瓦片请求尽量干净，不转发浏览器的 Origin/Referer
    headers = {
    "User-Agent": "...Chrome...",
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

    upstream_request = client.build_request("GET", upstream_url, headers=headers)

    try:
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
                background=background
            )
    except httpx.TimeoutException:
        if fallback_client:
            await fallback_client.aclose()
        raise HTTPException(status_code=504, detail="瓦片请求超时")
    except Exception as exc:
        print("上游请求失败:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail=str(exc)
        )

    response_headers = {}
    for key, value in upstream_response.headers.items():
        if key.lower() in PROXY_HOP_BY_HOP_HEADERS:
            continue
        if key.lower() in PROXY_PASSTHROUGH_HEADERS:
            response_headers[key] = value

    background = BackgroundTasks()
    background.add_task(upstream_response.aclose)
    if fallback_client:
        background.add_task(fallback_client.aclose)

    return StreamingResponse(
        upstream_response.aiter_raw(),
        status_code=upstream_response.status_code,
        headers=response_headers,
        background=background,
    )


@router.get("/proxy/gcj2wgs/{target_url:path}")
async def gcj2wgs_proxy(target_url: str, request: Request):
    """GCJ02 -> WGS84 tile rectification for arbitrary XYZ tile URLs."""
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    try:
        template, xyz = parse_tile_url(upstream_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_dir = _resolve_gcj_cache_dir(request)
    client, should_close = _resolve_gcj_http_client(request)
    try:
        tile_bytes = await get_gcj2wgs_tile(
            xyz.x,
            xyz.y,
            xyz.z,
            template,
            cache_dir,
            client=client,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="纠偏请求超时") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"纠偏失败: {exc}") from exc
    finally:
        if should_close:
            await client.aclose()

    return Response(content=tile_bytes, media_type="image/png")


@router.get("/proxy/wgs2gcj/{target_url:path}")
async def wgs2gcj_proxy(target_url: str, request: Request):
    """WGS84 -> GCJ02 tile rectification for arbitrary XYZ tile URLs."""
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    try:
        template, xyz = parse_tile_url(upstream_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_dir = _resolve_gcj_cache_dir(request)
    client, should_close = _resolve_gcj_http_client(request)
    try:
        tile_bytes = await get_wgs2gcj_tile(
            xyz.x,
            xyz.y,
            xyz.z,
            template,
            cache_dir,
            client=client,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="纠偏请求超时") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"纠偏失败: {exc}") from exc
    finally:
        if should_close:
            await client.aclose()

    return Response(content=tile_bytes, media_type="image/png")

@router.get("/proxy/{target_url:path}")
async def universal_stream_proxy(target_url: str, request: Request):
    """
    通用流式代理：将 /proxy/{target_url:path} 代理到任意上游 HTTP(S) 资源。

    使用方式示例：
    - /proxy/services.arcgisonline.com/ArcGIS/rest/services/.../tile/3/4/5
    - /proxy/mt0.google.com/vt?lyrs=s&x=6&y=7&z=4
    """
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    proxy_request_headers = _build_proxy_request_headers(request)

    shared_client = getattr(request.app.state, "http_client", None)
    fallback_client = None
    client = shared_client

    if client is None:
        fallback_client = httpx.AsyncClient(follow_redirects=False)
        client = fallback_client

    upstream_request = client.build_request(
        "GET",
        upstream_url,
        headers=proxy_request_headers,
    )

    try:
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
                background=background
            )
    except httpx.TimeoutException:
        if fallback_client is not None:
            await fallback_client.aclose()
        return JSONResponse(
            status_code=504,
            content={
                "detail": "代理请求超时",
                "upstream": upstream_url,
            },
            headers={"X-Proxy-Status": "TIMEOUT"},
        )
    except httpx.HTTPError as exc:
        if fallback_client is not None:
            await fallback_client.aclose()
        return JSONResponse(
            status_code=502,
            content={
                "detail": "代理请求失败",
                "upstream": upstream_url,
                "error": str(exc),
            },
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

    return StreamingResponse(
        upstream_response.aiter_raw(),
        status_code=upstream_response.status_code,
        headers=response_headers,
        background=background_tasks,
    )
# =====================================================
# ==================== 通用流式代理 ====================