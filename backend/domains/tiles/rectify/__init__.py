# -*- coding: utf-8 -*-
"""瓦片纠偏库（domains.tiles.rectify）：GCJ-02 / BD-09 与 WGS84 标准 XYZ 网格互转。

对外统一出口：调用方只从本包 import，无需关心 bd/gcj/common 内部分工。
依赖方向恒为 ``bd → common ← gcj``，common 禁止 import 兄弟包。
"""

from domains.tiles.rectify.bd.rectify import get_bd2wgs_tile, get_wgs2bd_tile
from domains.tiles.rectify.common.geo import get_cache_dir
from domains.tiles.rectify.common.transform import bd2gcj, bd2wgs, gcj2bd, gcj2wgs, wgs2bd, wgs2gcj
from domains.tiles.rectify.common.url_template import (
    TileUrlTemplate,
    TileXYZ,
    build_tile_url,
    parse_tile_url,
)
from domains.tiles.rectify.gcj.rectify import get_gcj2wgs_tile, get_wgs2gcj_tile

__all__ = [
    "TileUrlTemplate",
    "TileXYZ",
    "bd2gcj",
    "bd2wgs",
    "build_tile_url",
    "gcj2bd",
    "gcj2wgs",
    "get_bd2wgs_tile",
    "get_cache_dir",
    "get_gcj2wgs_tile",
    "get_wgs2bd_tile",
    "get_wgs2gcj_tile",
    "parse_tile_url",
    "wgs2bd",
    "wgs2gcj",
]
