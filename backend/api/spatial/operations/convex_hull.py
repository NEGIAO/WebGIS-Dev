"""凸包分析"""

from shapely.ops import unary_union

from ..utils import shapely_geoms_to_geojson_featurecollection


def do_convex_hull(geoms_a: list) -> dict:
    """凸包分析"""
    all_geoms = [g for g in geoms_a if g is not None and not g.is_empty]
    if not all_geoms:
        raise ValueError("无有效几何可计算凸包")

    merged = unary_union(all_geoms)
    hull = merged.convex_hull

    if hull.is_empty:
        raise ValueError("凸包计算未产生有效结果")

    return shapely_geoms_to_geojson_featurecollection([hull], "convexHull")
