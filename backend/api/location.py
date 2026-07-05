"""
地理定位服务模块

功能：
- IP 定位：通过 services/ip_geo 统一服务（支持多服务降级 + 缓存）
- 反向地理编码：后端代理多服务选择
- 访问追踪：记录用户访问时的位置和设备信息
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from api.auth import (
    get_auth_db_connection,
    _extract_token,
    _get_session_sync,
)
from services import ip_geo_service
from gcj_rectify.transform import wgs2gcj

logger = logging.getLogger(__name__)

_visit_tracking_table_ready = False


async def require_api_access_optional(request: Request) -> Optional[Dict[str, Any]]:
    """
    可选的身份验证依赖
    如果提供了有效的令牌，返回用户会话；否则返回 None
    """
    import asyncio
    
    token = _extract_token(request)
    if not token:
        return None
    
    try:
        session = await asyncio.to_thread(_get_session_sync, token)
        return session
    except Exception:
        return None

# ==================== 配置 ====================

AMAP_KEY = os.getenv("AMAP_WEB_SERVICE_KEY", "")
NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org"

# ==================== 请求/响应模型 ====================


class IpLocateRequest(BaseModel):
    """IP 定位请求"""
    ip: str = Field(default="", description="IP 地址，留空则使用客户端 IP")
    prefer_free_service: bool = Field(default=False, description="优先使用免费服务")
    silent: bool = Field(default=False, description="错误是否静默处理")


class ReverseGeocodeRequest(BaseModel):
    """反向地理编码请求"""
    lng: float = Field(..., description="经度")
    lat: float = Field(..., description="纬度")
    prefer_service: str = Field(default="auto", description="优先服务: auto/amap/tianditu/nominatim")
    silent: bool = Field(default=False, description="错误是否静默处理")


class TrackVisitRequest(BaseModel):
    """访问追踪请求"""
    user_agent: str = Field(default="", description="用户代理字符串")
    referrer: str = Field(default="", description="页面来源")


class IpLocateResponse(BaseModel):
    """IP 定位响应"""
    ok: bool
    status: str
    city: Optional[str] = None
    province: Optional[str] = None
    country: Optional[str] = None
    adcode: Optional[str] = None
    extent: Optional[list] = None  # [minLon, minLat, maxLon, maxLat]
    source: str  # "amap" or "free"


class ReverseGeocodeResponse(BaseModel):
    """反向地理编码响应"""
    formattedAddress: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    township: Optional[str] = None
    adcode: Optional[str] = None
    source: str  # "amap", "tianditu", "nominatim", etc.


class TrackVisitResponse(BaseModel):
    """访问追踪响应"""
    ip: str
    city: Optional[str] = None
    province: Optional[str] = None
    country: Optional[str] = None
    timestamp: str
    tracked: bool


# ==================== 辅助函数 ====================


def get_client_ip(request: Request) -> str:
    """获取客户端 IP 地址"""
    # 检查代理头
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "x-real-ip" in request.headers:
        return request.headers["x-real-ip"]
    return request.client.host if request.client else "127.0.0.1"


async def amap_reverse_geocode(lng: float, lat: float, client: httpx.AsyncClient) -> Optional[Dict[str, Any]]:
    """
    调用高德反向地理编码 API

    Args:
        lng, lat: WGS-84 坐标（函数内部自动转换为 GCJ-02）
        client: 共享 httpx 客户端

    Returns:
        成功时返回 {formattedAddress, province, city, district, adcode}，失败时返回 None
    """
    if not AMAP_KEY:
        logger.warning("AMAP_KEY 未配置")
        return None

    # 高德 API 要求 GCJ-02 坐标，将输入的 WGS-84 转换为 GCJ-02
    gcj_lng, gcj_lat = wgs2gcj(lng, lat)

    try:
        response = await client.get(
            "https://restapi.amap.com/v3/geocode/regeo",
            params={"location": f"{gcj_lng},{gcj_lat}", "key": AMAP_KEY, "extensions": "all"},
        )
        data = response.json()

        if data.get("status") == "1" and data.get("regeocode"):
            regeo = data["regeocode"]
            ac = regeo.get("address_component", {})
            return {
                "formattedAddress": regeo.get("formatted_address", ""),
                "province": ac.get("province"),
                "city": ac.get("city"),
                "district": ac.get("district"),
                "township": ac.get("township"),
                "adcode": ac.get("adcode"),
            }
        return None
    except Exception as e:
        logger.error(f"高德反向地理编码异常: {str(e)}")
        return None


async def nominatim_reverse_geocode(lng: float, lat: float, client: httpx.AsyncClient) -> Optional[Dict[str, Any]]:
    """
    调用 Nominatim 反向地理编码 API（免费）

    Args:
        lng, lat: 坐标
        client: 共享 httpx 客户端

    Returns:
        成功时返回 {formattedAddress, city, province}，失败时返回 None
    """
    try:
        response = await client.get(
            f"{NOMINATIM_ENDPOINT}/reverse",
            params={"lon": lng, "lat": lat, "format": "json", "zoom": 10, "addressdetails": 1},
            headers={"User-Agent": "WebGIS"},
        )
        data = response.json()
        address = data.get("address", {})
        return {
            "formattedAddress": data.get("display_name"),
            "province": address.get("state"),
            "city": address.get("city"),
            "district": address.get("county"),
            "township": None,
            "adcode": None,
        }
    except Exception as e:
        logger.error(f"Nominatim 反向地理编码异常: {str(e)}")
        return None


# ==================== 路由 ====================

router = APIRouter(prefix="/api/v1", tags=["location"])


@router.post("/location/ip-locate", response_model=Dict[str, Any])
async def ip_locate(
    request_data: IpLocateRequest,
    request: Request,
    current_user: Optional[Dict[str, Any]] = Depends(require_api_access_optional),
):
    """
    统一 IP 定位接口

    使用统一的 IP 定位服务，支持：
    - 多服务降级：高德 → ip-api.com → ipapi.co
    - 内存缓存（TTL 1小时）
    - 自动选择最优服务
    """
    ip = request_data.ip.strip() or get_client_ip(request)

    # 使用统一的 IP 定位服务
    result = await ip_geo_service.locate(
        ip=ip,
        prefer_amap=not request_data.prefer_free_service,
        use_cache=True,
    )

    if result:
        return {
            "code": 200,
            "data": {
                "ok": True,
                "status": "1",
                "source": result.source,
                "ip": result.ip,
                "city": result.city,
                "province": result.region,
                "country": result.country,
                "country_code": result.country_code,
                "adcode": "",  # 高德特有字段，其他服务为空
                "extent": None,
                "latitude": result.latitude,
                "longitude": result.longitude,
            },
            "message": "success"
        }

    return {
        "code": 400,
        "data": {"ok": False},
        "message": "IP 定位失败"
    }


@router.post("/location/reverse", response_model=Dict[str, Any])
async def reverse_geocode(
    request_data: ReverseGeocodeRequest,
    request: Request,
    current_user: Optional[Dict[str, Any]] = Depends(require_api_access_optional),
):
    """
    反向地理编码接口，支持多个服务

    prefer_service 优先级：
    - "auto": 自动选择（高德 > Nominatim）
    - "amap": 仅使用高德
    - "nominatim": 仅使用 Nominatim
    """
    client = request.app.state.http_client

    if request_data.prefer_service == "auto":
        # 自动选择：尝试高德 → Nominatim
        result = await amap_reverse_geocode(request_data.lng, request_data.lat, client)
        if result:
            return {
                "code": 200,
                "data": {**result, "source": "amap"},
                "message": "success",
            }

    elif request_data.prefer_service == "amap":
        result = await amap_reverse_geocode(request_data.lng, request_data.lat, client)
        if result:
            return {
                "code": 200,
                "data": {**result, "source": "amap"},
                "message": "success",
            }
        else:
            return {"code": 400, "data": {"ok": False}, "message": "高德反向地理编码失败"}

    # 使用 Nominatim（总是可用）
    result = await nominatim_reverse_geocode(request_data.lng, request_data.lat, client)
    if result:
        return {
            "code": 200,
            "data": {
                **result,
                "source": "nominatim"
            },
            "message": "success"
        }
    
    return {
        "code": 400,
        "data": {"ok": False},
        "message": "反向地理编码失败"
    }


@router.post("/location/track-visit", response_model=Dict[str, Any])
async def track_visit(
    request_data: TrackVisitRequest,
    request: Request,
    current_user: Optional[Dict[str, Any]] = Depends(require_api_access_optional),
):
    """
    记录用户访问时的位置信息

    - 使用统一的 IP 定位服务（带缓存）
    - 记录到数据库
    - 与用户关联（如已登陆）
    """

    ip = get_client_ip(request)
    timestamp = datetime.now(timezone.utc).isoformat()

    # IP 定位（使用统一服务，带缓存）
    location = await ip_geo_service.locate(ip=ip, prefer_amap=False, use_cache=True)

    if location:
        city = location.city
        province = location.region
        country = location.country
    else:
        city = province = country = None
    
    # 尝试保存到数据库
    global _visit_tracking_table_ready
    username = str(current_user.get("username") or "") if current_user else ""
    conn = None
    try:
        conn = get_auth_db_connection()
        cursor = conn.cursor()

        # 创建表（如果不存在），使用模块级标志避免每次请求执行 DDL
        if not _visit_tracking_table_ready:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS visit_tracking (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip VARCHAR(50) NOT NULL,
                    city VARCHAR(100),
                    province VARCHAR(100),
                    country VARCHAR(100),
                    user_agent TEXT,
                    referrer TEXT,
                    username TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            _visit_tracking_table_ready = True

        # 插入记录
        cursor.execute("""
            INSERT INTO visit_tracking (ip, city, province, country, user_agent, referrer, username)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (ip, city, province, country, request_data.user_agent[:500], request_data.referrer[:500], username or None))

        conn.commit()

        return {
            "code": 200,
            "data": {
                "ip": ip,
                "city": city,
                "province": province,
                "country": country,
                "timestamp": timestamp,
                "tracked": True
            },
            "message": "success"
        }
    except Exception as e:
        logger.error(f"访问追踪保存失败: {str(e)}")
        # 即使保存失败，也返回成功（避免影响前端）
        return {
            "code": 200,
            "data": {
                "ip": ip,
                "city": city,
                "province": province,
                "country": country,
                "timestamp": timestamp,
                "tracked": False
            },
            "message": "location detected but not persisted"
        }
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
