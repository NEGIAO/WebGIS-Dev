"""
外部服务后端代理模块。

目标：
1) 前端不再直连第三方 API，避免密钥泄露与滥用。
2) 统一走后端鉴权与调用配额（require_api_access）。
3) 保持与前端既有数据结构兼容，尽量减少改动面。
"""

import asyncio
import os
import re
import sqlite3
from typing import Any, Dict, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from api.auth import require_api_access, get_auth_db_connection

AMAP_REST_ROOT = "https://restapi.amap.com"
AMAP_WEB_DETAIL_ROOT = "https://www.amap.com/detail/get/detail"
NOMINATIM_SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search"
EPSG_PROJ4_ENDPOINT = "https://epsg.io/{code}.proj4"
IPAPI_ENDPOINT = "https://ipapi.co"

HTTP_CLIENT_TIMEOUT = httpx.Timeout(connect=3.0, read=8.0, write=8.0, pool=3.0)
HTTP_CLIENT_LIMITS = httpx.Limits(max_connections=120, max_keepalive_connections=60)

DEFAULT_HEADERS = {
    "User-Agent": "WebGIS-Backend/1.0",
    "Accept": "application/json,text/plain,*/*",
}

NOMINATIM_HEADERS = {
    "User-Agent": "WebGIS-Backend/1.0",
    "Accept": "application/json",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
}

AMAP_WEB_DETAIL_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.amap.com/",
    "Accept": "application/json,text/plain,*/*",
}


router = APIRouter(prefix="/api/proxy", tags=["external-proxy"])


def _get_api_key_from_db_sync(key_name: str) -> Optional[str]:
    """从数据库获取 API 密钥"""
    try:
        with get_auth_db_connection() as conn:
            row = conn.execute(
                "SELECT key_value FROM api_keys WHERE key_name = ?",
                (key_name,)
            ).fetchone()
            if row:
                return str(dict(row).get("key_value") or "").strip()
    except Exception as e:
        # 如果数据库查询失败，继续使用环境变量
        pass
    return None


def _resolve_amap_key() -> str:
    # 优先从数据库读取
    db_key = _get_api_key_from_db_sync("amap_key")
    if db_key:
        return db_key
    
    # 回退到环境变量
    for env_name in ("AMAP_WEB_SERVICE_KEY", "AMAP_KEY", "GAODE_KEY", "VITE_AMAP_WEB_SERVICE_KEY"):
        value = str(os.getenv(env_name, "") or "").strip()
        if value:
            return value
    return ""


def _extract_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return str(x_forwarded_for).split(",")[0].strip()

    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return str(x_real_ip).strip()

    return request.client.host if request.client else ""


async def _resolve_http_client(request: Request) -> Tuple[httpx.AsyncClient, bool]:
    shared = getattr(request.app.state, "http_client", None)
    if shared is not None:
        return shared, False

    # 启动钩子未执行时兜底。
    return httpx.AsyncClient(
        timeout=HTTP_CLIENT_TIMEOUT,
        limits=HTTP_CLIENT_LIMITS,
        follow_redirects=True,
    ), True


def _raise_upstream_http_error(status_code: int, detail: str = "") -> None:
    if status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail or "上游资源不存在")
    if status_code == 429:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail or "上游服务限流")
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=detail or f"上游服务异常（HTTP {status_code}）",
    )


async def _request_upstream_json(
    request: Request,
    url: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    client, should_close = await _resolve_http_client(request)
    try:
        resp = await client.get(url, params=params or {}, headers=headers or DEFAULT_HEADERS)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="上游请求超时") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="上游网络请求失败") from exc
    finally:
        if should_close:
            await client.aclose()

    if resp.status_code != 200:
        _raise_upstream_http_error(resp.status_code)

    try:
        payload = resp.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="上游返回非 JSON 数据") from exc

    if isinstance(payload, dict):
        return payload

    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="上游返回结构异常")


async def _request_upstream_json_array(
    request: Request,
    url: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Any:
    client, should_close = await _resolve_http_client(request)
    try:
        resp = await client.get(url, params=params or {}, headers=headers or DEFAULT_HEADERS)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="上游请求超时") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="上游网络请求失败") from exc
    finally:
        if should_close:
            await client.aclose()

    if resp.status_code != 200:
        _raise_upstream_http_error(resp.status_code)

    try:
        return resp.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="上游返回非 JSON 数据") from exc


async def _request_upstream_text(
    request: Request,
    url: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Tuple[str, str]:
    client, should_close = await _resolve_http_client(request)
    try:
        resp = await client.get(url, params=params or {}, headers=headers or DEFAULT_HEADERS)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="上游请求超时") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="上游网络请求失败") from exc
    finally:
        if should_close:
            await client.aclose()

    if resp.status_code != 200:
        _raise_upstream_http_error(resp.status_code)

    content_type = str(resp.headers.get("Content-Type") or "text/plain; charset=utf-8")
    return resp.text, content_type


def _require_amap_key_or_503() -> str:
    amap_key = _resolve_amap_key()
    if not amap_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="后端未配置高德服务密钥，请联系管理员",
        )
    return amap_key


@router.get("/amap/place/text")
async def proxy_amap_place_text(
    request: Request,
    keywords: str = Query(..., min_length=1, max_length=100),
    city: str = Query(default="", max_length=40),
    page: int = Query(default=1, ge=1, le=100),
    offset: int = Query(default=10, ge=1, le=50),
    extensions: str = Query(default="base", pattern="^(base|all)$"),
    _current_user: Dict[str, Any] = Depends(require_api_access),
) -> Dict[str, Any]:
    """
    功能：高德 POI 关键词检索代理（文本搜索）。

    参数：
    - keywords: 搜索关键词。
    - city: 可选城市限制。
    - page/offset: 分页参数。
    - extensions: `base` 或 `all`。

    返回：
    - 原样转发高德 `/v3/place/text` JSON 响应。

    处理过程：
    1. 校验并读取后端托管高德 key；
    2. 请求上游接口；
    3. 统一错误映射后返回。
    """
    amap_key = _require_amap_key_or_503()

    return await _request_upstream_json(
        request,
        f"{AMAP_REST_ROOT}/v3/place/text",
        params={
            "key": amap_key,
            "keywords": str(keywords).strip(),
            "city": str(city or "").strip(),
            "page": int(page),
            "offset": int(offset),
            "extensions": str(extensions or "base").strip(),
        },
    )


@router.get("/amap/place/detail")
async def proxy_amap_place_detail(
    request: Request,
    id: str = Query(..., min_length=1, max_length=96),
    extensions: str = Query(default="all", pattern="^(base|all)$"),
    _current_user: Dict[str, Any] = Depends(require_api_access),
) -> Dict[str, Any]:
    """
    功能：高德 POI 详情代理。

    参数：
    - id: 高德 POI ID。
    - extensions: `base` 或 `all`。

    返回：
    - 原样转发高德 `/v3/place/detail` JSON 响应。
    """
    amap_key = _require_amap_key_or_503()

    return await _request_upstream_json(
        request,
        f"{AMAP_REST_ROOT}/v3/place/detail",
        params={
            "key": amap_key,
            "id": str(id).strip(),
            "extensions": str(extensions or "all").strip(),
        },
    )


@router.get("/amap/geocode/geo")
async def proxy_amap_geocode_geo(
    request: Request,
    address: str = Query(..., min_length=1, max_length=200),
    city: str = Query(default="", max_length=40),
    _current_user: Dict[str, Any] = Depends(require_api_access),
) -> Dict[str, Any]:
    """
    功能：地理编码（地址 -> 坐标）后端代理。

    参数：
    - address: 待编码地址文本。
    - city: 可选城市约束。

    返回：
    - 原样转发高德 `/v3/geocode/geo` JSON 响应。
    """
    amap_key = _require_amap_key_or_503()

    return await _request_upstream_json(
        request,
        f"{AMAP_REST_ROOT}/v3/geocode/geo",
        params={
            "key": amap_key,
            "address": str(address).strip(),
            "city": str(city or "").strip(),
        },
    )


@router.get("/amap/geocode/regeo")
async def proxy_amap_geocode_regeo(
    request: Request,
    location: str = Query(..., min_length=3, max_length=80),
    extensions: str = Query(default="base", pattern="^(base|all)$"),
    radius: int = Query(default=1000, ge=0, le=3000),
    batch: bool = Query(default=False),
    _current_user: Dict[str, Any] = Depends(require_api_access),
) -> Dict[str, Any]:
    """
    功能：逆地理编码（坐标 -> 地址）后端代理。

    参数：
    - location: `lng,lat`（高德坐标系 GCJ-02）。
    - extensions: `base` 或 `all`。
    - radius: 搜索半径（米）。
    - batch: 是否批量模式。

    返回：
    - 原样转发高德 `/v3/geocode/regeo` JSON 响应。
    """
    amap_key = _require_amap_key_or_503()

    return await _request_upstream_json(
        request,
        f"{AMAP_REST_ROOT}/v3/geocode/regeo",
        params={
            "key": amap_key,
            "location": str(location).strip(),
            "extensions": str(extensions or "base").strip(),
            "radius": int(radius),
            "batch": "true" if bool(batch) else "false",
        },
    )


@router.get("/amap/weather")
async def proxy_amap_weather(
    request: Request,
    city: str = Query(..., min_length=1, max_length=32),
    extensions: str = Query(default="base", pattern="^(base|all)$"),
    _current_user: Dict[str, Any] = Depends(require_api_access),
) -> Dict[str, Any]:
    """
    功能：高德天气查询代理。

    参数：
    - city: 行政区编码（adcode）。
    - extensions: `base`=实况，`all`=预报。

    返回：
    - 原样转发高德 `/v3/weather/weatherInfo` JSON 响应。
    """
    amap_key = _require_amap_key_or_503()

    return await _request_upstream_json(
        request,
        f"{AMAP_REST_ROOT}/v3/weather/weatherInfo",
        params={
            "key": amap_key,
            "city": str(city).strip(),
            "extensions": str(extensions or "base").strip(),
        },
    )


@router.get("/amap/ip")
async def proxy_amap_ip_location(
    request: Request,
    ip: str = Query(default="", max_length=64),
    _current_user: Dict[str, Any] = Depends(require_api_access),
) -> Dict[str, Any]:
    """
    功能：高德 IP 定位代理。

    参数：
    - ip: 可选 IP，留空时由高德按请求来源识别。

    返回：
    - 原样转发高德 `/v3/ip` JSON 响应。
    """
    amap_key = _require_amap_key_or_503()
    normalized_ip = str(ip or "").strip()

    params: Dict[str, Any] = {"key": amap_key}
    if normalized_ip:
        params["ip"] = normalized_ip

    return await _request_upstream_json(
        request,
        f"{AMAP_REST_ROOT}/v3/ip",
        params=params,
    )


@router.get("/amap/web/detail")
async def proxy_amap_web_detail(
    request: Request,
    id: str = Query(..., min_length=1, max_length=96),
    _current_user: Dict[str, Any] = Depends(require_api_access),
) -> Response:
    """
    功能：高德 Web 详情页接口代理（文本响应）。

    参数：
    - id: POI ID。

    返回：
    - 文本载荷（JSON/JSONP/HTML），由前端自行解析。
    """
    text, content_type = await _request_upstream_text(
        request,
        AMAP_WEB_DETAIL_ROOT,
        params={"id": str(id).strip()},
        headers=AMAP_WEB_DETAIL_HEADERS,
    )

    return Response(content=text, media_type=content_type)


@router.get("/search/nominatim")
async def proxy_nominatim_search(
    request: Request,
    keywords: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(default=10, ge=1, le=50),
):
    """
    功能：Nominatim 国际地名搜索代理（免鉴权）。

    参数：
    - keywords: 查询关键词。
    - limit: 返回数量上限。

    返回：
    - Nominatim JSON 数组结果。
    """
    # Nominatim 是免费的国际地名搜索服务，不需要认证限制
    return await _request_upstream_json_array(
        request,
        NOMINATIM_SEARCH_ENDPOINT,
        params={
            "format": "json",
            "limit": int(limit),
            "q": str(keywords).strip(),
        },
        headers=NOMINATIM_HEADERS,
    )


@router.get("/geo/epsg/{epsg_code}/proj4")
async def proxy_epsg_proj4(
    request: Request,
    epsg_code: str,
) -> Response:
    """
    功能：查询 EPSG 的 Proj4 定义文本。

    参数：
    - epsg_code: EPSG 编码（3-6 位数字）。

    返回：
    - `text/plain` 格式的 proj4 字符串。
    """
    code = str(epsg_code or "").strip()
    if not re.fullmatch(r"\d{3,6}", code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的 EPSG 编码")

    text, _content_type = await _request_upstream_text(
        request,
        EPSG_PROJ4_ENDPOINT.format(code=code),
        params={},
    )

    normalized = str(text or "").strip()
    if not normalized or "not found" in normalized.lower():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到对应 EPSG 定义")

    return Response(content=normalized, media_type="text/plain; charset=utf-8")


@router.get("/ipapi/country")
async def proxy_ipapi_country(
    request: Request,
    ip: str = Query(default="", max_length=64),
) -> Dict[str, Any]:
    """
    功能：IP 所属国家/城市信息代理（ipapi）。

    参数：
    - ip: 可选，留空时自动使用客户端 IP。

    返回：
    - 标准化后的国家、地区、城市信息。
    """
    normalized_ip = str(ip or "").strip() or _extract_client_ip(request)
    endpoint = f"{IPAPI_ENDPOINT}/{normalized_ip}/json/" if normalized_ip else f"{IPAPI_ENDPOINT}/json/"

    data = await _request_upstream_json(request, endpoint, headers=DEFAULT_HEADERS)
    return {
        "ip": str(data.get("ip") or normalized_ip),
        "country": str(data.get("country") or "").strip(),
        "country_code": str(data.get("country_code") or "").strip(),
        "country_name": str(data.get("country_name") or "").strip(),
        "region": str(data.get("region") or "").strip(),
        "city": str(data.get("city") or "").strip(),
    }
