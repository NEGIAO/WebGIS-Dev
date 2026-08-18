"""瓦片 URL 模板解析/重建单测（gcj_rectify/url_template.py）

覆盖三种常规模式（format / query / path）与通用「单路径段内嵌多数字」解析
（如 Google maps/vt 的 pb=!1m4!1m3!1i10!2i500!3i800!2m1!1e6）。
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from gcj_rectify.url_template import build_tile_url, parse_tile_url


class TestParseTileUrl(unittest.TestCase):
    """parse_tile_url 对单路径段内嵌多数字格式的通用识别"""

    def test_multi_number_segment_inline(self):
        """单路径段内嵌 z/x/y（!1i{z}!2i{x}!3i{y} 前缀式）：无 x=/y=/z= 键值对，
        靠通用数字 token 扫描从后向前识别连续三连"""
        url = "https://www.google.com/maps/vt/pb=!1m4!1m3!1i10!2i500!3i800!2m1!1e6"
        template, xyz = parse_tile_url(url)
        self.assertEqual(xyz.z, 10)
        self.assertEqual(xyz.x, 500)
        self.assertEqual(xyz.y, 800)
        rebuilt = build_tile_url(template, 5, 6, 7)
        self.assertEqual(
            rebuilt,
            "https://www.google.com/maps/vt/pb=!1m4!1m3!1i7!2i5!3i6!2m1!1e6",
        )

    def test_multi_number_segment_style_param(self):
        """同一内嵌格式 + 尾随样式参数数字（!1e5），特殊字符 ! = { } 不被编码"""
        url = "https://gac-geo.googlecnapps.club/maps/vt/pb=!1m4!1m3!1i10!2i500!3i800!2m1!1e5"
        template, xyz = parse_tile_url(url)
        self.assertEqual((xyz.z, xyz.x, xyz.y), (10, 500, 800))
        rebuilt = build_tile_url(template, 1, 2, 3)
        self.assertIn("!1i3!2i1!3i2!", rebuilt)
        self.assertNotIn("%7B", rebuilt)
        self.assertNotIn("%21", rebuilt)


class TestStandardModesRegression(unittest.TestCase):
    """既有三种模式回归：修复不得破坏原行为"""

    def test_format_style(self):
        """format 模式：x=/y=/z= 键值对"""
        url = "https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&LAYER=img&TILEMATRIX=10&TILEROW=100&TILECOL=200&tk=abc"
        template, xyz = parse_tile_url(url)
        self.assertEqual((xyz.z, xyz.x, xyz.y), (10, 200, 100))
        rebuilt = build_tile_url(template, 88, 99, 11)
        self.assertIn("TILEMATRIX=11&TILEROW=99&TILECOL=88", rebuilt)

    def test_query_style(self):
        """query 模式：标准 x/y/z 查询参数"""
        url = "https://mt1.google.com/vt/lyrs=s&x=1&y=2&z=3"
        template, xyz = parse_tile_url(url)
        self.assertEqual((xyz.z, xyz.x, xyz.y), (3, 1, 2))
        rebuilt = build_tile_url(template, 10, 20, 30)
        self.assertEqual(rebuilt, "https://mt1.google.com/vt/lyrs=s&x=10&y=20&z=30")

    def test_path_style(self):
        """path 模式：/z/x/y 路径切片"""
        url = "https://tile.openstreetmap.org/15/26000/13000.png"
        template, xyz = parse_tile_url(url)
        self.assertEqual((xyz.z, xyz.x, xyz.y), (15, 26000, 13000))
        rebuilt = build_tile_url(template, 1, 2, 3)
        self.assertEqual(rebuilt, "https://tile.openstreetmap.org/3/1/2.png")

    def test_invalid_url_raises(self):
        """无 x/y/z 的 URL 仍应报错"""
        url = "https://example.com/static/map.png"
        with self.assertRaises(ValueError):
            parse_tile_url(url)

    def test_trailing_junk_digits(self):
        """坐标后尾随垃圾数字：靠 x+y 最大判据仍选中真实坐标"""
        url = "https://tiles.example.com/15/26000/13000/2.png"
        template, xyz = parse_tile_url(url)
        self.assertEqual((xyz.z, xyz.x, xyz.y), (15, 26000, 13000))
        rebuilt = build_tile_url(template, 1, 2, 3)
        self.assertEqual(rebuilt, "https://tiles.example.com/3/1/2/2.png")

    def test_inline_xyz_order(self):
        """同一段内嵌 xyz 序（x{y} 风格）：zxy 校验失败后回退 xyz 序"""
        url = "https://tiles.example.com/x500y800z10.png"
        template, xyz = parse_tile_url(url)
        self.assertEqual((xyz.z, xyz.x, xyz.y), (10, 500, 800))
        rebuilt = build_tile_url(template, 1, 2, 3)
        self.assertEqual(rebuilt, "https://tiles.example.com/x1y2z3.png")

    def test_user_report_url_end_to_end(self):
        """用户报告的 Google maps/vt pb 瓦片 URL：解析 → 重建 → 特殊字符原样保留"""
        url = "https://www.google.com/maps/vt/pb=!1m4!1m3!1i10!2i500!3i800!2m1!1e6"
        template, xyz = parse_tile_url(url)
        self.assertEqual((xyz.z, xyz.x, xyz.y), (10, 500, 800))
        self.assertEqual(template.mode, "path")
        rebuilt = build_tile_url(template, 5, 6, 7)
        self.assertEqual(
            rebuilt,
            "https://www.google.com/maps/vt/pb=!1m4!1m3!1i7!2i5!3i6!2m1!1e6",
        )


if __name__ == "__main__":
    unittest.main()