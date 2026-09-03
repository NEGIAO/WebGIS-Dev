"""瓦片域路由聚合回归单测（domains/tiles/__init__.py）。

守卫一条正确性不变量：4 条纠偏具体路径必须先于通用流式代理的
`/proxy/{target_url:path}` 通配注册，否则纠偏请求会被通配路由吞掉。
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from domains.tiles import tiles_router

RECTIFY_PATHS = (
    "/proxy/gcj2wgs/{target_url:path}",
    "/proxy/wgs2gcj/{target_url:path}",
    "/proxy/bd2wgs/{target_url:path}",
    "/proxy/wgs2bd/{target_url:path}",
)
UNIVERSAL_PATH = "/proxy/{target_url:path}"
SHIPS_PATH = "/tiles/ships66/{z}/{x}/{y}.png"


class TestTilesRouterOrder(unittest.TestCase):
    """聚合路由表：路径齐全 + 纠偏先于通配"""

    def test_all_paths_registered(self):
        """6 条瓦片路由全部注册"""
        paths = [getattr(route, "path", None) for route in tiles_router.routes]
        for expected in (*RECTIFY_PATHS, UNIVERSAL_PATH, SHIPS_PATH):
            self.assertIn(expected, paths)

    def test_rectify_before_universal(self):
        """4 条纠偏路由排在通配路由之前"""
        paths = [getattr(route, "path", None) for route in tiles_router.routes]
        universal_index = paths.index(UNIVERSAL_PATH)
        for expected in RECTIFY_PATHS:
            self.assertLess(paths.index(expected), universal_index)
