"""
空间分析操作实现
每个模块提供一个或多个 do_* 函数，接收 Shapely 几何对象，返回 GeoJSON FeatureCollection dict。
"""

from .aggregation import do_spatial_aggregation
from .buffer import do_buffer
from .convex_hull import do_convex_hull
from .fishnet import do_fishnet
from .multi_ring_buffer import do_multi_ring_buffer
from .overlay import do_difference, do_intersection, do_union
from .simplify import do_simplify
from .voronoi import do_voronoi

__all__ = [
    "do_buffer",
    "do_intersection",
    "do_union",
    "do_difference",
    "do_convex_hull",
    "do_voronoi",
    "do_spatial_aggregation",
    "do_multi_ring_buffer",
    "do_simplify",
    "do_fishnet",
]
