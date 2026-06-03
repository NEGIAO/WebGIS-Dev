"""
服务层模块

提供统一的业务服务，供 API 路由层调用。
"""

from .ip_geo import IpGeoResult, ip_geo_service

__all__ = ["IpGeoResult", "ip_geo_service"]
