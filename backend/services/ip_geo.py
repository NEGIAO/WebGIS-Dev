"""
IP 地理定位统一服务

功能：
- 统一的 IP 定位接口，支持多服务降级
- 内存 TTL 缓存，避免重复请求
- 服务优先级：高德（精度高）→ ip-api.com（免费无限制）→ ipapi.co（备用）

使用方式：
    from services.ip_geo import ip_geo_service

    result = await ip_geo_service.locate(ip="8.8.8.8")
    if result:
        print(result.city, result.country)
"""

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

# ==================== 配置 ====================

# 高德 IP 定位
AMAP_KEY = os.getenv("AMAP_WEB_SERVICE_KEY", "")
AMAP_IP_ENDPOINT = "https://restapi.amap.com/v3/ip"

# ip-api.com（免费，无速率限制，支持 HTTPS）
IP_API_ENDPOINT = "https://ip-api.com/json"

# ipapi.co（免费，有速率限制 30次/分钟）
IPAPI_ENDPOINT = "https://ipapi.co"

# HTTP 客户端配置
HTTP_TIMEOUT = httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0)
HTTP_HEADERS = {
    "User-Agent": "WebGIS-Backend/2.0",
    "Accept": "application/json",
}

# 缓存配置
CACHE_TTL = 3600  # 1 小时
CACHE_MAX_SIZE = 2000  # 最大缓存条目数


# ==================== 数据模型 ====================

@dataclass
class IpGeoResult:
    """IP 地理定位结果"""
    ip: str
    country: str
    country_code: str
    region: str  # 省份/州
    city: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    source: str = "unknown"  # "amap", "ip-api", "ipapi"

    @property
    def province(self) -> str:
        """兼容旧代码的 province 字段"""
        return self.region


# ==================== 缓存实现 ====================

class _TTLCache:
    """简单的 TTL 内存缓存，带命中率统计"""

    def __init__(self, ttl: int = CACHE_TTL, max_size: int = CACHE_MAX_SIZE):
        self._store: Dict[str, Dict[str, Any]] = {}
        self._ttl = ttl
        self._max_size = max_size
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[IpGeoResult]:
        """获取缓存，过期返回 None"""
        entry = self._store.get(key)
        if not entry:
            self._misses += 1
            return None
        if entry.get("expire_at", 0) <= time.time():
            self._store.pop(key, None)
            self._misses += 1
            return None
        self._hits += 1
        return entry.get("data")

    def set(self, key: str, data: IpGeoResult) -> None:
        """设置缓存，自动清理过期条目"""
        if not key or not data:
            return

        # 缓存满时清理
        if len(self._store) >= self._max_size:
            self._evict_expired()
            if len(self._store) >= self._max_size:
                oldest = next(iter(self._store), None)
                if oldest:
                    self._store.pop(oldest, None)

        self._store[key] = {
            "data": data,
            "expire_at": time.time() + self._ttl,
        }

    def _evict_expired(self) -> None:
        """清理所有过期条目"""
        now = time.time()
        expired = [k for k, v in self._store.items() if v.get("expire_at", 0) <= now]
        for k in expired:
            self._store.pop(k, None)

    def clear(self) -> None:
        """清空缓存"""
        self._store.clear()
        self._hits = 0
        self._misses = 0

    @property
    def stats(self) -> Dict[str, Any]:
        """返回缓存统计信息"""
        total = self._hits + self._misses
        return {
            "size": len(self._store),
            "max_size": self._max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self._hits / total, 4) if total > 0 else 0,
        }


# 全局缓存实例
_cache = _TTLCache()


# ==================== 服务实现 ====================

class IpGeoService:
    """IP 地理定位服务"""

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._client_lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        """获取或创建 HTTP 客户端（线程安全）"""
        if self._client is not None and not self._client.is_closed:
            return self._client
        async with self._client_lock:
            # 双重检查：等待锁期间可能已被其他协程创建
            if self._client is not None and not self._client.is_closed:
                return self._client
            self._client = httpx.AsyncClient(
                timeout=HTTP_TIMEOUT,
                headers=HTTP_HEADERS,
                follow_redirects=True,
            )
            return self._client

    async def locate(
        self,
        ip: str = "",
        *,
        prefer_amap: bool = True,
        use_cache: bool = True,
    ) -> Optional[IpGeoResult]:
        """
        定位 IP 地址

        Args:
            ip: IP 地址，留空则返回 None（需要调用方传入）
            prefer_amap: 是否优先使用高德（需要配置 AMAP_KEY）
            use_cache: 是否使用缓存

        Returns:
            IpGeoResult 或 None（所有服务都失败时）
        """
        if not ip or ip in ("127.0.0.1", "::1", "localhost"):
            return None

        # 1. 检查缓存
        if use_cache:
            cached = _cache.get(ip)
            if cached:
                return cached

        # 2. 尝试服务（按优先级）
        result = None

        # 优先级 1: 高德（精度高，有 key 时使用）
        if prefer_amap and AMAP_KEY:
            result = await self._locate_amap(ip)
            if result:
                _cache.set(ip, result)
                return result

        # 优先级 2: ip-api.com（免费无限制）
        result = await self._locate_ip_api(ip)
        if result:
            _cache.set(ip, result)
            return result

        # 优先级 3: ipapi.co（备用，有速率限制）
        result = await self._locate_ipapi(ip)
        if result:
            _cache.set(ip, result)
            return result

        logger.warning("所有 IP 定位服务都失败: ip=%s", ip)
        return None

    async def _locate_amap(self, ip: str) -> Optional[IpGeoResult]:
        """
        高德 IP 定位

        注意：高德 IP 定位仅支持中国境内 IP，返回 province/city。
        country_code 固定为 CN（高德不返回此字段且仅覆盖中国）。
        """
        try:
            client = await self._get_client()
            resp = await client.get(
                AMAP_IP_ENDPOINT,
                params={"ip": ip, "key": AMAP_KEY},
            )

            if resp.status_code != 200:
                return None

            try:
                data = resp.json()
            except ValueError:
                logger.debug("高德返回非 JSON 响应: ip=%s", ip)
                return None

            if not isinstance(data, dict) or data.get("status") != "1":
                error_msg = str(data.get("info", "")) if isinstance(data, dict) else ""
                if "查询" in error_msg or "服务" in error_msg:
                    logger.warning("高德 IP 定位配额用完: %s", error_msg)
                return None

            # 高德仅覆盖中国 IP，country/country_code 固定
            return IpGeoResult(
                ip=ip,
                country="中国",
                country_code="CN",
                region=data.get("province", ""),
                city=data.get("city", ""),
                source="amap",
            )
        except Exception as e:
            logger.debug("高德 IP 定位失败: ip=%s, error=%s", ip, str(e))
            return None

    async def _locate_ip_api(self, ip: str) -> Optional[IpGeoResult]:
        """ip-api.com 定位（免费无限制）"""
        try:
            client = await self._get_client()
            resp = await client.get(f"{IP_API_ENDPOINT}/{ip}")

            if resp.status_code != 200:
                return None

            try:
                data = resp.json()
            except ValueError:
                logger.debug("ip-api.com 返回非 JSON 响应: ip=%s", ip)
                return None

            if not isinstance(data, dict) or data.get("status") != "success":
                return None

            return IpGeoResult(
                ip=data.get("query", ip),
                country=data.get("country", ""),
                country_code=data.get("countryCode", ""),
                region=data.get("regionName", ""),
                city=data.get("city", ""),
                latitude=data.get("lat"),
                longitude=data.get("lon"),
                source="ip-api",
            )
        except Exception as e:
            logger.debug("ip-api.com 定位失败: ip=%s, error=%s", ip, str(e))
            return None

    async def _locate_ipapi(self, ip: str) -> Optional[IpGeoResult]:
        """ipapi.co 定位（有速率限制，作为最后备用）"""
        try:
            client = await self._get_client()
            resp = await client.get(f"{IPAPI_ENDPOINT}/{ip}/json/")

            if resp.status_code != 200:
                if resp.status_code == 429:
                    logger.warning("ipapi.co 速率限制 (429)")
                return None

            # 防止非 JSON 响应导致未捕获异常
            try:
                data = resp.json()
            except ValueError:
                logger.debug("ipapi.co 返回非 JSON 响应: ip=%s", ip)
                return None

            if not isinstance(data, dict) or data.get("error"):
                return None

            return IpGeoResult(
                ip=data.get("ip", ip),
                country=data.get("country_name", ""),
                country_code=data.get("country_code", ""),
                region=data.get("region", ""),
                city=data.get("city", ""),
                latitude=data.get("latitude"),
                longitude=data.get("longitude"),
                source="ipapi",
            )
        except (httpx.TimeoutException, httpx.RequestError) as e:
            logger.debug("ipapi.co 网络异常: ip=%s, error=%s", ip, str(e))
            return None
        except Exception as e:
            logger.debug("ipapi.co 定位失败: ip=%s, error=%s", ip, str(e))
            return None

    async def close(self) -> None:
        """关闭 HTTP 客户端，释放连接池资源"""
        async with self._client_lock:
            if self._client is not None and not self._client.is_closed:
                await self._client.aclose()
            self._client = None
        logger.info("IP 定位服务已关闭，缓存统计: %s", _cache.stats)

    def clear_cache(self) -> None:
        """清空缓存"""
        _cache.clear()

    @property
    def cache_stats(self) -> Dict[str, Any]:
        """返回缓存统计信息，供运维监控使用"""
        return _cache.stats


# 全局服务实例
ip_geo_service = IpGeoService()
