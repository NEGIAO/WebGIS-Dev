"""
外部服务后端代理模块。

目标：
1) 前端不再直连第三方 API，避免密钥泄露与滥用。
2) 统一走后端鉴权与调用配额（require_api_access）。
3) 保持与前端既有数据结构兼容，尽量减少改动面。
"""

import os
import re
from typing import Any, Dict, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from api.auth import require_api_access_or_guest, get_auth_db_connection
from services import ip_geo_service

AMAP_REST_ROOT = "https://restapi.amap.com"
AMAP_WEB_DETAIL_ROOT = "https://www.amap.com/detail/get/detail"
NOMINATIM_SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search"
EPSG_PROJ4_ENDPOINT = "https://epsg.io/{code}.proj4"
AMAP_SUCCESS_STATUS = "1"
AMAP_SUCCESS_INFOCODE = "10000"
AMAP_KEY_RETRY_INFOCODES = {
    "10001", "10002", "10003", "10004", "10005", "10006", "10007", "10008",
    "10009", "10010", "10011", "10012", "10013", "10014", "10015", "10016",
    "10017", "10018", "10019", "10020", "10021", "10022", "10026", "10027",
    "10028", "10029", "10030", "10031", "10032", "10033", "10034", "10035",
    "10036", "10037", "10038", "10039", "10040", "10041", "10042", "10043",
    "10044",
}

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
            # 确保 api_keys 表存在（可能尚未被 agent_chat 模块初始化）
            conn.execute("""
                CREATE TABLE IF NOT EXISTS api_keys (
                    key_name TEXT PRIMARY KEY,
                    key_value TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    updated_by TEXT
                )
            """)
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
    candidates = _resolve_amap_key_candidates()
    return candidates[0] if candidates else ""


def _resolve_amap_key_candidates() -> list[str]:
    """按主 key、备用 key、环境变量顺序返回高德候选 key。"""
    candidates: list[str] = []

    try:
        from api.api_keys_management import _get_api_key_candidates_sync

        candidates.extend(_get_api_key_candidates_sync("amap_key"))
    except Exception:
        db_key = _get_api_key_from_db_sync("amap_key")
        if db_key:
            candidates.append(db_key)

    for env_name in ("AMAP_WEB_SERVICE_KEY", "AMAP_KEY", "GAODE_KEY"):
        value = str(os.getenv(env_name, "") or "").strip()
        if value:
            candidates.append(value)

    result: list[str] = []
    seen: set[str] = set()
    for value in candidates:
        compact = str(value or "").strip()
        if compact and compact not in seen:
            result.append(compact)
            seen.add(compact)
    return result


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


def _amap_error_status_code(infocode: str) -> int:
    compact = str(infocode or "").strip()

    if compact in {"10003", "10004", "10014", "10015", "10019", "10020", "10044"}:
        return status.HTTP_429_TOO_MANY_REQUESTS

    if compact in {
        "10001", "10002", "10005", "10006", "10007", "10008", "10009", "10010",
        "10011", "10012", "10013", "10016", "10017", "10018", "10021", "10022",
        "10026", "10027", "10028", "10029", "10030", "10031", "10032", "10033",
        "10034", "10035", "10036", "10037", "10038", "10039", "10040", "10041",
        "10042", "10043",
    }:
        return status.HTTP_403_FORBIDDEN

    if compact in {"20000", "20001", "20002", "20003", "20800", "20801", "20802", "20803", "30000", "30001"}:
        return status.HTTP_400_BAD_REQUEST

    return status.HTTP_502_BAD_GATEWAY


def _ensure_amap_success(payload: Dict[str, Any], endpoint_name: str) -> Dict[str, Any]:
    amap_status = str(payload.get("status") or "").strip()
    infocode = str(payload.get("infocode") or "").strip()

    if amap_status == AMAP_SUCCESS_STATUS and (not infocode or infocode == AMAP_SUCCESS_INFOCODE):
        return payload

    info = str(payload.get("info") or payload.get("message") or "高德接口返回失败").strip() or "高德接口返回失败"
    status_code = _amap_error_status_code(infocode)
    raise HTTPException(
        status_code=status_code,
        detail=(
            f"高德接口调用失败: {info} "
            f"(endpoint={endpoint_name}, status={amap_status or 'unknown'}, infocode={infocode or 'unknown'})"
        ),
    )


def _is_amap_key_retryable(payload: Dict[str, Any]) -> bool:
    infocode = str(payload.get("infocode") or "").strip()
    return infocode in AMAP_KEY_RETRY_INFOCODES


async def _request_amap_json(
    request: Request,
    endpoint_path: str,
    endpoint_name: str,
    *,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    amap_keys = _resolve_amap_key_candidates()
    if not amap_keys:
        _require_amap_key_or_503()

    safe_params = dict(params or {})
    last_payload: Optional[Dict[str, Any]] = None

    for index, amap_key in enumerate(amap_keys):
        attempt_params = dict(safe_params)
        attempt_params["key"] = amap_key
        payload = await _request_upstream_json(
            request,
            f"{AMAP_REST_ROOT}{endpoint_path}",
            params=attempt_params,
        )
        last_payload = payload
        if str(payload.get("status") or "").strip() == AMAP_SUCCESS_STATUS:
            return _ensure_amap_success(payload, endpoint_name)
        if index < len(amap_keys) - 1 and _is_amap_key_retryable(payload):
            continue
        return _ensure_amap_success(payload, endpoint_name)

    return _ensure_amap_success(last_payload or {}, endpoint_name)


@router.get("/amap/place/text")
async def proxy_amap_place_text(
    request: Request,
    keywords: str = Query(..., min_length=1, max_length=100),
    city: str = Query(default="", max_length=40),
    page: int = Query(default=1, ge=1, le=100),
    offset: int = Query(default=10, ge=1, le=50),
    extensions: str = Query(default="base", pattern="^(base|all)$"),
    _current_user: Dict[str, Any] = Depends(require_api_access_or_guest),
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
    return await _request_amap_json(
        request,
        "/v3/place/text",
        "poi_search",
        params={
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
    _current_user: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """
    功能：高德 POI 详情代理。

    参数：
    - id: 高德 POI ID。
    - extensions: `base` 或 `all`。

    返回：
    - 原样转发高德 `/v3/place/detail` JSON 响应。
    """
    return await _request_amap_json(
        request,
        "/v3/place/detail",
        "poi_detail",
        params={
            "id": str(id).strip(),
            "extensions": str(extensions or "all").strip(),
        },
    )


@router.get("/amap/geocode/geo")
async def proxy_amap_geocode_geo(
    request: Request,
    address: str = Query(..., min_length=1, max_length=200),
    city: str = Query(default="", max_length=40),
    _current_user: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """
    功能：地理编码（地址 -> 坐标）后端代理。

    参数：
    - address: 待编码地址文本。
    - city: 可选城市约束。

    返回：
    - 原样转发高德 `/v3/geocode/geo` JSON 响应。
    """
    return await _request_amap_json(
        request,
        "/v3/geocode/geo",
        "geo_coding",
        params={
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
    _current_user: Dict[str, Any] = Depends(require_api_access_or_guest),
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
    return await _request_amap_json(
        request,
        "/v3/geocode/regeo",
        "reverse_geo_coding",
        params={
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
    _current_user: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """
    功能：高德天气查询代理。

    参数：
    - city: 行政区编码（adcode）。
    - extensions: `base`=实况，`all`=预报。

    返回：
    - 原样转发高德 `/v3/weather/weatherInfo` JSON 响应。
    """
    normalized_city = str(city or "").strip()
    if not re.fullmatch(r"\d{6}", normalized_city):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="天气查询参数 city 必须为 6 位 adcode",
        )

    return await _request_amap_json(
        request,
        "/v3/weather/weatherInfo",
        "get_weather",
        params={
            "city": normalized_city,
            "extensions": str(extensions or "base").strip(),
        },
    )


@router.get("/amap/ip")
async def proxy_amap_ip_location(
    request: Request,
    ip: str = Query(default="", max_length=64),
    _current_user: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """
    功能：高德 IP 定位代理。

    参数：
    - ip: 可选 IP，留空时由高德按请求来源识别。

    返回：
    - 原样转发高德 `/v3/ip` JSON 响应。
    """
    normalized_ip = str(ip or "").strip()

    params: Dict[str, Any] = {}
    if normalized_ip:
        params["ip"] = normalized_ip

    return await _request_amap_json(
        request,
        "/v3/ip",
        "ip_location",
        params=params,
    )


@router.get("/amap/web/detail")
async def proxy_amap_web_detail(
    request: Request,
    id: str = Query(..., min_length=1, max_length=96),
    _current_user: Dict[str, Any] = Depends(require_api_access_or_guest),
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
    _current_user: dict = Depends(require_api_access_or_guest),
):
    """
    功能：Nominatim 国际地名搜索代理（需鉴权）。

    参数：
    - keywords: 查询关键词。
    - limit: 返回数量上限。

    返回：
    - Nominatim JSON 数组结果。
    """
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
    _current_user: dict = Depends(require_api_access_or_guest),
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

    特性：
    - 使用统一的 IP 定位服务
    - 内存缓存（TTL 1小时），避免重复请求触发速率限制
    - 多服务降级：高德 → ip-api.com → ipapi.co

    参数：
    - ip: 可选，留空时自动使用客户端 IP。

    返回：
    - 标准化后的国家、地区、城市信息。
    """
    normalized_ip = str(ip or "").strip() or _extract_client_ip(request)

    result = await ip_geo_service.locate(ip=normalized_ip, prefer_amap=False, use_cache=True)

    if result:
        return {
            "ip": result.ip,
            "country": result.country,
            "country_code": result.country_code,
            "country_name": result.country,
            "region": result.region,
            "city": result.city,
        }

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="IP 地理位置服务暂不可用",
    )
