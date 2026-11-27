"""
统一 IP 地理信息中枢（V3.7.14）。

设计要点：
- 一个 IP 只解析一次：请求级缓存挂 `request.state`，进程级缓存由 ip_geo_service 既有 TTL cache 承担；
- 解析由业务端点惰性触发（get_request_geo），不在全局 HTTP 中间件同步等待外部服务；
  sessions 签发、访问事件、在线表、location 一律从中枢取用，不再各自调用外部定位服务；
- 私网 IP / 解析失败静默返回空结果（`resolved=False`），保留 `ip` 供审计，绝不阻断签发或统计请求。

依赖方向：services/request_geo.py → services/ip_geo.py（同层），不引入 core 反向依赖。
"""

from __future__ import annotations

import ipaddress
import logging
from dataclasses import dataclass
from typing import Any, Optional

from fastapi import Request

from services.ip_geo import IpGeoResult, ip_geo_service

logger = logging.getLogger(__name__)

# request.state 上缓存属性的名字（避免与其它 state 字段撞名）
_STATE_CACHE_KEY = "_unified_geo_result"


@dataclass(frozen=True)
class RequestGeo:
    """中枢对外统一结果：不可变，便于安全共享。"""

    ip: str = ""
    city: str = ""
    region: str = ""
    country: str = ""
    country_code: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    source: str = "unknown"
    # 显式成功标志：私网 / 非法 IP / 外部服务失败均为 False。
    # 不能用 ip 非空近似判断成功——审计需要保留原始 IP，但地理信息并未解析出来。
    resolved: bool = False

    @classmethod
    def empty(cls, ip: str = "") -> "RequestGeo":
        return cls(ip=ip)

    @classmethod
    def from_geo(cls, geo: IpGeoResult) -> "RequestGeo":
        return cls(
            ip=geo.ip,
            city=str(geo.city or ""),
            region=str(geo.region or ""),
            country=str(geo.country or ""),
            country_code=str(geo.country_code or ""),
            latitude=geo.latitude,
            longitude=geo.longitude,
            source=geo.source,
            resolved=True,
        )

    def as_dict(self) -> dict:
        """供旧调用方按 dict 取值（statistics.fetch_geolocation 兼容）。"""
        return {
            "ip": self.ip,
            "ip_city": self.city,
            "ip_region": self.region,
            "ip_country": self.country,
            "country": self.country,
            "country_code": self.country_code,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "source": self.source,
        }


def _mask_ip(ip: str) -> str:
    """调试日志脱敏：仅保留网段前缀，避免完整客户端 IP 落盘。"""
    if "." in ip:
        parts = ip.split(".")
        return ".".join(parts[:2] + ["*", "*"]) if len(parts) == 4 else "*.*.*.*"
    if ":" in ip:
        return ip.split(":", 2)[0] + "::*"
    return "***"


async def resolve_ip_geo(ip: str, *, prefer_amap: bool = True) -> RequestGeo:
    """按 IP 解析地理信息（无 request 上下文版本，供 proxy、游客身份派生等复用）。

    进程级缓存由 ip_geo_service 承担；私网 IP / 解析失败返回空结果，不抛异常。
    """
    clean_ip = str(ip or "").strip()
    if not clean_ip:
        return RequestGeo.empty()
    # 中枢层自行判断私网：确保"私网 IP 零外部请求"不依赖下游 service 实现细节
    try:
        parsed = ipaddress.ip_address(clean_ip)
        if parsed.is_private or parsed.is_loopback or parsed.is_link_local or parsed.is_reserved:
            return RequestGeo.empty(clean_ip)
    except ValueError:
        return RequestGeo.empty(clean_ip)
    try:
        result = await ip_geo_service.locate(clean_ip, prefer_amap=prefer_amap, use_cache=True)
    except Exception as exc:
        logger.debug("IP 地理解析失败（静默留空）: ip=%s, error=%s", _mask_ip(clean_ip), exc)
        return RequestGeo.empty(clean_ip)
    return RequestGeo.from_geo(result) if result else RequestGeo.empty(clean_ip)


async def get_request_geo(request: Request, *, prefer_amap: bool = True) -> RequestGeo:
    """获取请求对应的地理信息（中枢主入口，同一请求只解析一次）。

    优先返回 request.state 上已解析的结果；否则用 _extract_client_ip 取 IP 解析并缓存。
    prefer_amap=False（如禁用高德的调试开关）时不复用 request.state 的默认结果；
    进程级缓存键已包含 amap/free 维度（见 services/ip_geo.py），不会拿到高德预热结果。
    """
    if prefer_amap:
        cached = getattr(request.state, _STATE_CACHE_KEY, None)
        if isinstance(cached, RequestGeo):
            return cached

    from api.auth.constants import _extract_client_ip

    ip = _extract_client_ip(request)
    geo = await resolve_ip_geo(ip, prefer_amap=prefer_amap)
    if prefer_amap:
        try:
            setattr(request.state, _STATE_CACHE_KEY, geo)
        except Exception:
            pass
    return geo


async def resolve_request_geo_middleware(request: Request) -> RequestGeo:
    """可选的入口预热函数（V3.7.14 起默认不挂到全局中间件）。

    仅在明确需要对整个请求提前解析时使用；常规业务端点应直接 get_request_geo 惰性取用。
    """
    return await get_request_geo(request)


def cached_geo(request: Request) -> Optional[RequestGeo]:
    """同步读取已解析结果（供不返回 await 的调用方取用）；未解析时返回 None。"""
    cached = getattr(request.state, _STATE_CACHE_KEY, None)
    return cached if isinstance(cached, RequestGeo) else None
