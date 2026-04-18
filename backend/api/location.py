"""
地理定位服务模块

功能：
- IP 定位：支持高德优先、配额超限自动降级到免费服务
- 反向地理编码：后端代理多服务选择
- 访问追踪：记录用户访问时的位置和设备信息
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from api.auth import (
    get_auth_db_connection,
    _extract_token,
    _get_session_sync,
)

logger = logging.getLogger(__name__)


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
IPAPI_ENDPOINT = "https://ipapi.co"
HTTP_CLIENT_TIMEOUT = httpx.Timeout(connect=3.0, read=8.0, write=8.0, pool=3.0)
HTTP_CLIENT_LIMITS = httpx.Limits(max_connections=100, max_keepalive_connections=50)

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


async def amap_ip_locate(ip: str) -> Optional[Dict[str, Any]]:
    """
    调用高德 IP 定位 API
    
    Returns:
        成功时返回 {city, province, adcode, extent}
        失败时返回 None
    """
    if not AMAP_KEY:
        logger.warning("AMAP_KEY 未配置")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=HTTP_CLIENT_TIMEOUT) as client:
            url = f"https://restapi.amap.com/v3/ip?ip={ip}&key={AMAP_KEY}"
            response = await client.get(url)
            data = response.json()
            
            if data.get("status") == "1":
                # 成功
                return {
                    "city": data.get("city"),
                    "province": data.get("province"),
                    "country": data.get("country", "中国"),
                    "adcode": data.get("adcode"),
                    "extent": [
                        float(data.get("rectangle", "0,0,0,0").split(",")[0]),
                        float(data.get("rectangle", "0,0,0,0").split(",")[1]),
                        float(data.get("rectangle", "0,0,0,0").split(",")[2]),
                        float(data.get("rectangle", "0,0,0,0").split(",")[3]),
                    ]
                }
            else:
                # API 返回错误
                error_msg = data.get("info", "未知错误")
                logger.warning(f"高德 IP 定位错误: {error_msg}")
                
                # 检查是否是配额错误
                if "日查询次数" in error_msg or "服务次数" in error_msg:
                    raise HTTPException(
                        status_code=429,
                        detail="IP 定位：API 调用额度已用完，部分功能受限"
                    )
                return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"高德 IP 定位异常: {str(e)}")
        return None


async def free_service_ip_locate(ip: str) -> Optional[Dict[str, Any]]:
    """
    使用免费服务进行 IP 定位（ipapi.co）
    
    Returns:
        成功时返回 {city, province, country, adcode}
        失败时返回 None
    """
    try:
        async with httpx.AsyncClient(timeout=HTTP_CLIENT_TIMEOUT) as client:
            url = f"{IPAPI_ENDPOINT}/{ip}/json/"
            response = await client.get(url)
            data = response.json()
            
            return {
                "city": data.get("city"),
                "province": data.get("region"),
                "country": data.get("country_name", "Unknown"),
                "adcode": "",
                "extent": None  # 免费服务不提供范围
            }
    except Exception as e:
        logger.error(f"免费 IP 定位异常: {str(e)}")
        return None


async def amap_reverse_geocode(lng: float, lat: float) -> Optional[Dict[str, Any]]:
    """
    调用高德反向地理编码 API
    
    Returns:
        成功时返回 {formattedAddress, province, city, district, adcode}
        失败时返回 None
    """
    if not AMAP_KEY:
        logger.warning("AMAP_KEY 未配置")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=HTTP_CLIENT_TIMEOUT) as client:
            url = f"https://restapi.amap.com/v3/geocode/regeo?location={lng},{lat}&key={AMAP_KEY}&extensions=all"
            response = await client.get(url)
            data = response.json()
            
            if data.get("status") == "1" and data.get("regeocode"):
                regeo = data["regeocode"]
                address = regeo.get("formatted_address", "")
                address_component = regeo.get("address_component", {})
                
                return {
                    "formattedAddress": address,
                    "province": address_component.get("province"),
                    "city": address_component.get("city"),
                    "district": address_component.get("district"),
                    "township": address_component.get("township"),
                    "adcode": address_component.get("adcode"),
                }
            return None
    except Exception as e:
        logger.error(f"高德反向地理编码异常: {str(e)}")
        return None


async def nominatim_reverse_geocode(lng: float, lat: float) -> Optional[Dict[str, Any]]:
    """
    调用 Nominatim 反向地理编码 API（免费）
    
    Returns:
        成功时返回 {formattedAddress, city, province}
        失败时返回 None
    """
    try:
        async with httpx.AsyncClient(timeout=HTTP_CLIENT_TIMEOUT) as client:
            url = f"{NOMINATIM_ENDPOINT}/reverse"
            params = {
                "lon": lng,
                "lat": lat,
                "format": "json",
                "zoom": 10,
                "addressdetails": 1
            }
            response = await client.get(url, params=params, headers={"User-Agent": "WebGIS"})
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
    
    优先级：
    1. 如果 prefer_free_service=true，直接跳到第 3 步
    2. 优先使用高德 API：
       - 检查用户单日配额
       - 调用高德 IP 定位 API
       - 成功 → 返回 source="amap"
       - 配额用完 → HTTP 429，继续第 3 步
       - 其他错误 → 继续第 3 步
    3. 降级到免费服务（ipapi.co）
       - 返回 source="free"
    """
    ip = request_data.ip.strip() or get_client_ip(request)
    
    # 跳过高德（开发者模式或用户设置）
    if request_data.prefer_free_service:
        result = await free_service_ip_locate(ip)
        if result:
            return {
                "code": 200,
                "data": {
                    "ok": True,
                    "status": "1",
                    "source": "free",
                    **result
                },
                "message": "success"
            }
        else:
            return {
                "code": 400,
                "data": {"ok": False},
                "message": "IP 定位失败"
            }
    
    # 尝试高德 API
    try:
        result = await amap_ip_locate(ip)
        if result:
            return {
                "code": 200,
                "data": {
                    "ok": True,
                    "status": "1",
                    "source": "amap",
                    **result
                },
                "message": "success"
            }
    except HTTPException as e:
        # 配额用完，返回 429
        logger.info(f"高德 API 配额用完，IP: {ip}")
        if not request_data.silent:
            raise e
        # 继续降级...
    except Exception as e:
        logger.error(f"高德 API 异常: {str(e)}")
        # 继续降级...
        pass
    
    # 降级到免费服务
    result = await free_service_ip_locate(ip)
    if result:
        return {
            "code": 200,
            "data": {
                "ok": True,
                "status": "1",
                "source": "free",
                **result
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
    current_user: Optional[Dict[str, Any]] = Depends(require_api_access_optional),
):
    """
    反向地理编码接口，支持多个服务
    
    prefer_service 优先级：
    - "auto": 自动选择（高德 > Nominatim）
    - "amap": 仅使用高德
    - "nominatim": 仅使用 Nominatim
    """
    
    if request_data.prefer_service == "auto":
        # 自动选择：尝试高德 → Nominatim
        
        # 1. 尝试高德
        result = await amap_reverse_geocode(request_data.lng, request_data.lat)
        if result:
            return {
                "code": 200,
                "data": {
                    **result,
                    "source": "amap"
                },
                "message": "success"
            }
    
    elif request_data.prefer_service == "amap":
        result = await amap_reverse_geocode(request_data.lng, request_data.lat)
        if result:
            return {
                "code": 200,
                "data": {
                    **result,
                    "source": "amap"
                },
                "message": "success"
            }
        else:
            return {
                "code": 400,
                "data": {"ok": False},
                "message": "高德反向地理编码失败"
            }
    
    # 使用 Nominatim（总是可用）
    result = await nominatim_reverse_geocode(request_data.lng, request_data.lat)
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
    
    - 优先使用 IP 定位（快速，精度可接受）
    - 记录到数据库
    - 与用户关联（如已登陆）
    """
    
    ip = get_client_ip(request)
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # IP 定位（使用免费服务，快速）
    location = await free_service_ip_locate(ip)
    
    if location:
        city = location.get("city")
        province = location.get("province")
        country = location.get("country")
    else:
        city = province = country = None
    
    # 尝试保存到数据库
    user_id = current_user.get("id") if current_user else None
    try:
        conn = get_auth_db_connection()
        cursor = conn.cursor()
        
        # 创建表（如果不存在）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS visit_tracking (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip VARCHAR(50) NOT NULL,
                city VARCHAR(100),
                province VARCHAR(100),
                country VARCHAR(100),
                user_agent TEXT,
                referrer TEXT,
                user_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # 插入记录
        cursor.execute("""
            INSERT INTO visit_tracking (ip, city, province, country, user_agent, referrer, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (ip, city, province, country, request_data.user_agent[:500], request_data.referrer[:500], user_id))
        
        conn.commit()
        conn.close()
        
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
