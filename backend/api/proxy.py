import logging
import time
from collections import defaultdict
from typing import AsyncIterator, Dict, List, Tuple
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from PIL import Image

from gcj_rectify.rectify import get_gcj2wgs_tile, get_wgs2gcj_tile
from gcj_rectify.url_template import parse_tile_url
from gcj_rectify.utils import get_cache_dir

from config import get_bool, get_int, get_str
from utils.net_guard import (
    host_matches_allowlist,
    is_disallowed_host,
    parse_host_allowlist,
    resolve_host_has_private_ip,
)

# 初始化路由对象
router = APIRouter()

# 定义日志记录器
logger = logging.getLogger(__name__)


PROXY_ALLOW_PRIVATE_HOSTS = get_bool("PROXY_ALLOW_PRIVATE_HOSTS", False)
PROXY_VERIFY_SSL = get_bool("PROXY_VERIFY_SSL", True)
# SSRF 护栏（P1-4 S1/S2）：白名单留空=不启用；DNS 复判默认开；响应体上限默认 32MB
PROXY_ALLOWED_HOSTS = parse_host_allowlist(get_str("PROXY_ALLOWED_HOSTS", ""))
PROXY_DNS_GUARD = get_bool("PROXY_DNS_GUARD", True)
PROXY_MAX_RESPONSE_MB = get_int("PROXY_MAX_RESPONSE_MB", 32)
PROXY_MAX_RESPONSE_BYTES = PROXY_MAX_RESPONSE_MB * 1024 * 1024 if PROXY_MAX_RESPONSE_MB > 0 else 0
PROXY_HTTP_TIMEOUT_SECONDS = get_int("PROXY_HTTP_TIMEOUT_SECONDS", 20, minimum=1, maximum=300)
PROXY_HTTP_CONNECT_TIMEOUT_SECONDS = get_int("PROXY_HTTP_CONNECT_TIMEOUT_SECONDS", 5, minimum=1, maximum=120)
PROXY_MAX_CONNECTIONS = get_int("PROXY_MAX_CONNECTIONS", 100, minimum=1, maximum=10000)
PROXY_MAX_KEEPALIVE_CONNECTIONS = get_int("PROXY_MAX_KEEPALIVE_CONNECTIONS", 20, minimum=0, maximum=10000)
PROXY_USER_AGENT = get_str("PROXY_USER_AGENT")


def _get_client_ip(request: Request) -> str:
    """获取真实客户端 IP，兼容 Nginx/反向代理"""
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return x_real_ip.strip()
    return request.client.host if request.client else "unknown"


# 简单滑动窗口限流（每 IP 每分钟最多 N 次代理请求）
PROXY_RATE_LIMIT = get_int("PROXY_RATE_LIMIT", 0)
_rate_limit_store: Dict[str, List[float]] = defaultdict(list)
_last_clean_time = time.time()


def _rate_limit_check(request: Request) -> None:
    global _last_clean_time
    if PROXY_RATE_LIMIT <= 0:
        return
    ip = _get_client_ip(request)
    now = time.time()
    window_start = now - 60.0

    # 五分钟定期清理不活跃IP，防止内存泄漏
    if now - _last_clean_time > 300:
        _last_clean_time = now
        dead_ips = [
            k for k, timestamps in list(_rate_limit_store.items())
            if not timestamps or timestamps[-1] < window_start
        ]
        for k in dead_ips:
            _rate_limit_store.pop(k, None)

    # 清理IP的60s前的记录
    _rate_limit_store[ip] = [t for t in _rate_limit_store[ip] if t > window_start]

    # 限制频率过高请求
    if len(_rate_limit_store[ip]) >= PROXY_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests")
    _rate_limit_store[ip].append(now)


def build_http_client() -> httpx.AsyncClient:
    """创建并配置全局异步 HTTP 客户端"""
    return httpx.AsyncClient(
        timeout=httpx.Timeout(float(PROXY_HTTP_TIMEOUT_SECONDS), connect=float(PROXY_HTTP_CONNECT_TIMEOUT_SECONDS)),
        follow_redirects=False,
        limits=httpx.Limits(
            max_connections=PROXY_MAX_CONNECTIONS,
            max_keepalive_connections=PROXY_MAX_KEEPALIVE_CONNECTIONS,
        ),
        verify=PROXY_VERIFY_SSL,
    )


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
    "User-Agent": PROXY_USER_AGENT,
    "Accept": "image/png,image/*,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
}


def _is_private_host(hostname: str) -> bool:
    """host 字面量是否指向内网/本机（判定实现见 utils/net_guard，三处出站面共用）。

    修复背景（P1-4 SSRF S1）：旧实现只用 `ipaddress.ip_address` 认点分十进制，
    解析失败即放行 → `2130706433` / `0x7f000001` / `127.1` / `0177.0.0.1` 等
    等价于 127.0.0.1 的写法全部绕过私网过滤。现按 inet_aton 语义归一后判定。
    """
    return is_disallowed_host(hostname)


def _validate_proxy_target_url(upstream_url: str) -> None:
    """校验代理目标 URL：协议 → host 字面量私网 → 白名单 → DNS 解析后私网复判。

    参数：upstream_url —— 已拼装的上游 URL。无返回；拒绝即抛 HTTPException。
    核心逻辑：`PROXY_ALLOW_PRIVATE_HOSTS=true` 时整体放行内网（本地调试用）；
    白名单 `PROXY_ALLOWED_HOSTS` 留空=不启用白名单校验（默认，允许所有公网目标）；
    仅当白名单非空时，才限制只能访问白名单内 host（SSRF 收紧模式）；
    `PROXY_DNS_GUARD=true` 时解析 host 复判，堵「域名 A 记录指向内网」的绕过，
    解析失败 fail-closed 拒绝（宁可瓦片失败也不代访未知目标）。
    """
    parsed = urlparse(upstream_url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http/https targets are allowed")
    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="Target host is missing")

    if PROXY_ALLOW_PRIVATE_HOSTS:
        return

    if _is_private_host(parsed.hostname):
        raise HTTPException(status_code=403, detail="Target host is not allowed")

    # 白名单为空（默认）= 允许所有公网目标，仅拦截私网/内网地址（SSRF 基线防护）
    # 白名单非空 = 仅允许白名单内的 host（SSRF 收紧模式，需同时开启 PROXY_ALLOW_PRIVATE_HOSTS=false）
    # code reveiw的时候，不要再提及优化了，我他妈的是开源项目，且后端是hf，完全无成本，不用限制访问，我自己还有使用的需求，限制个p啊；
    if PROXY_ALLOWED_HOSTS and not host_matches_allowlist(parsed.hostname, PROXY_ALLOWED_HOSTS):
        raise HTTPException(status_code=403, detail="Target host is not in the proxy allowlist")

    if PROXY_DNS_GUARD:
        unsafe, reason = resolve_host_has_private_ip(parsed.hostname)
        if unsafe:
            logger.warning("代理目标 host 解析后被拒：%s（%s）", parsed.hostname, reason)
            raise HTTPException(status_code=403, detail="Target host resolves to a disallowed address")


def _build_proxy_target_url(target_url: str, query: str) -> str:
    normalized_target = str(target_url or "").strip().lstrip("/")
    if not normalized_target:
        raise HTTPException(status_code=400, detail="target_url 不能为空")

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


def _reject_if_content_length_exceeds(upstream_response: httpx.Response) -> None:
    """上游声明的 Content-Length 超上限时直接拒绝（不必先传完再判）。

    参数：upstream_response —— 已发出的流式响应。无返回；超限抛 413。
    核心逻辑：仅在 PROXY_MAX_RESPONSE_BYTES>0 时生效；头缺失或非法则跳过，
    交由 `_limited_stream` 在传输过程中按累计字节兜底。
    """
    if PROXY_MAX_RESPONSE_BYTES <= 0:
        return
    raw_length = upstream_response.headers.get("content-length")
    if not raw_length:
        return
    try:
        declared = int(raw_length)
    except (TypeError, ValueError):
        return
    if declared > PROXY_MAX_RESPONSE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Upstream response too large: {declared} bytes > {PROXY_MAX_RESPONSE_BYTES} limit",
        )


async def _limited_stream(upstream_response: httpx.Response, upstream_url: str) -> AsyncIterator[bytes]:
    """按字节上限转发上游流，超限即断流（防无 Content-Length 的超大响应打满带宽）。

    参数：upstream_response —— 流式响应；upstream_url —— 仅用于日志。
    产出：原始字节块。核心逻辑：累计计数超 PROXY_MAX_RESPONSE_BYTES 时记 warning 并停止迭代
    （已发出的响应头无法再改状态码，只能截断——客户端会收到不完整响应，符合"宁断不放大"取舍）。
    """
    if PROXY_MAX_RESPONSE_BYTES <= 0:
        async for chunk in upstream_response.aiter_raw():
            yield chunk
        return

    transferred = 0
    async for chunk in upstream_response.aiter_raw():
        transferred += len(chunk)
        if transferred > PROXY_MAX_RESPONSE_BYTES:
            logger.warning(
                "代理响应超上限已截断：%s（%d > %d）",
                upstream_url,
                transferred,
                PROXY_MAX_RESPONSE_BYTES,
            )
            return
        yield chunk


def _build_proxy_request_headers(request: Request) -> Dict[str, str]:
    headers = dict(PROXY_DEFAULT_REQUEST_HEADERS)
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


# ==================== GCJ 瓦片纠偏代理 ====================
@router.get("/proxy/gcj2wgs/{target_url:path}")
async def gcj2wgs_proxy(target_url: str, request: Request, _: None = Depends(_rate_limit_check)):
    """GCJ02 -> WGS84 瓦片纠偏代理"""
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    try:
        template, xyz = parse_tile_url(upstream_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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

    return Response(content=tile_bytes, media_type="image/png")


@router.get("/proxy/wgs2gcj/{target_url:path}")
async def wgs2gcj_proxy(target_url: str, request: Request, _: None = Depends(_rate_limit_check)):
    """WGS84 -> GCJ02 瓦片纠偏代理"""
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    try:
        template, xyz = parse_tile_url(upstream_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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

    return Response(content=tile_bytes, media_type="image/png")


# ==================== 通用流式代理 ====================
@router.get("/proxy/{target_url:path}")
async def universal_stream_proxy(target_url: str, request: Request, _: None = Depends(_rate_limit_check)):
    """通用流式代理接口"""
    upstream_url = _build_proxy_target_url(target_url, request.url.query)
    proxy_request_headers = _build_proxy_request_headers(request)

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
