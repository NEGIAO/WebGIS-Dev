"""V3.7.14 统一 IP 地理中枢单测：私网跳过、请求级缓存、失败静默。"""

import asyncio
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import request_geo as geo_module
from services.request_geo import RequestGeo, get_request_geo, resolve_ip_geo


class _FakeState:
    pass


class _FakeRequest:
    def __init__(self):
        self.state = _FakeState()


class RequestGeoTests(unittest.TestCase):
    def test_private_ip_skips_external_lookup(self):
        """私网/回环 IP 不调用外部定位服务，直接返回空结果。"""
        with mock.patch.object(geo_module, "ip_geo_service") as svc:
            for ip in ("10.16.26.165", "172.19.0.1", "127.0.0.1", ""):
                geo = asyncio.run(resolve_ip_geo(ip))
                self.assertEqual(geo.city, "")
                self.assertEqual(geo.source, "unknown")
                self.assertFalse(geo.resolved)          # 空结果不得被当作解析成功
                self.assertEqual(geo.ip, ip)            # 但保留审计 IP
            svc.locate.assert_not_called()

    def test_request_level_cache_resolves_once(self):
        """同一请求多次取地理信息只解析一次。"""
        request = _FakeRequest()
        with mock.patch.object(geo_module, "ip_geo_service") as svc:
            svc.locate = mock.AsyncMock(
                return_value=geo_module.IpGeoResult(
                    ip="8.8.8.8", country="United States", country_code="US",
                    region="California", city="Mountain View",
                    latitude=37.4, longitude=-122.1, source="ip-api",
                )
            )
            with mock.patch("api.auth.constants._extract_client_ip", return_value="8.8.8.8"):
                first = asyncio.run(get_request_geo(request))
                second = asyncio.run(get_request_geo(request))
        self.assertEqual(first.city, "Mountain View")
        self.assertTrue(first.resolved)
        self.assertIs(first, second)
        self.assertEqual(svc.locate.call_count, 1)

    def test_lookup_failure_is_silent(self):
        """定位服务抛异常时静默返回空结果，不阻断调用方。"""
        with mock.patch.object(geo_module, "ip_geo_service") as svc:
            svc.locate = mock.AsyncMock(side_effect=RuntimeError("network down"))
            geo = asyncio.run(resolve_ip_geo("8.8.8.8"))
        self.assertEqual(geo.ip, "8.8.8.8")
        self.assertEqual(geo.city, "")
        self.assertFalse(geo.resolved)

    def test_free_mode_does_not_reuse_amap_cache(self):
        """prefer_amap=False 不得拿到高德预热结果（缓存键含模式维度）。"""
        from services import ip_geo as ipgeo

        svc = ipgeo.ip_geo_service
        ipgeo._cache.clear()
        amap_result = ipgeo.IpGeoResult(
            ip="1.2.3.4", country="CN", country_code="CN", region="Jiangsu",
            city="AmapCity", source="amap",
        )
        free_result = ipgeo.IpGeoResult(
            ip="1.2.3.4", country="CN", country_code="CN", region="Jiangsu",
            city="FreeCity", source="ip-api",
        )
        with mock.patch.object(ipgeo, "_resolve_amap_key", return_value="fake-key"), \
             mock.patch.object(svc, "_locate_amap", new=mock.AsyncMock(return_value=amap_result)), \
             mock.patch.object(svc, "_locate_ipwho", new=mock.AsyncMock(return_value=free_result)):
            amap = asyncio.run(svc.locate("1.2.3.4", prefer_amap=True))
            free = asyncio.run(svc.locate("1.2.3.4", prefer_amap=False))
        self.assertEqual(amap.city, "AmapCity")
        self.assertEqual(free.city, "FreeCity")

    def test_as_dict_compatible_keys(self):
        """兼容旧调用方按 dict 取值（含 ip_city 键）。"""
        geo = RequestGeo(ip="1.2.3.4", city="Nanjing", region="Jiangsu", country="CN")
        d = geo.as_dict()
        self.assertEqual(d["ip_city"], "Nanjing")
        self.assertEqual(d["ip_region"], "Jiangsu")
        self.assertEqual(d["ip_country"], "CN")


if __name__ == "__main__":
    unittest.main()
