"""叠加分析（交集/并集/差集）"""

import logging

from shapely.ops import unary_union

from ..utils import shapely_geoms_to_geojson_featurecollection

logger = logging.getLogger(__name__)


def do_intersection(geoms_a: list, geoms_b: list) -> dict:
    """交集分析（精确几何交集）"""
    result_geoms = []

    # 将 B 合并为单个几何以提高性能
    b_union = unary_union(geoms_b) if geoms_b else None
    if b_union is None or b_union.is_empty:
        raise ValueError("图层 B 无有效几何")

    for geom_a in geoms_a:
        if geom_a is None or geom_a.is_empty:
            continue
        try:
            inter = geom_a.intersection(b_union)
            if not inter.is_empty:
                result_geoms.append(inter)
        except Exception as e:
            logger.warning(f"交集计算失败: {e}")

    if not result_geoms:
        raise ValueError("交集分析未产生有效结果（两图层无重叠区域）")

    return shapely_geoms_to_geojson_featurecollection(result_geoms, "intersection")


def do_union(geoms_a: list, geoms_b: list) -> dict:
    """并集分析"""
    all_geoms = [g for g in geoms_a + geoms_b if g is not None and not g.is_empty]
    if not all_geoms:
        raise ValueError("无有效几何可合并")

    result = unary_union(all_geoms)
    result_geoms = [result] if not result.is_empty else []

    if not result_geoms:
        raise ValueError("并集分析未产生有效结果")

    return shapely_geoms_to_geojson_featurecollection(result_geoms, "union")


def do_difference(geoms_a: list, geoms_b: list) -> dict:
    """差集分析（精确几何差集）"""
    b_union = unary_union(geoms_b) if geoms_b else None
    if b_union is None or b_union.is_empty:
        # B 为空，直接返回 A
        result_geoms = [g for g in geoms_a if g is not None and not g.is_empty]
        if not result_geoms:
            raise ValueError("图层 A 无有效几何")
        return shapely_geoms_to_geojson_featurecollection(result_geoms, "difference")

    result_geoms = []
    for geom_a in geoms_a:
        if geom_a is None or geom_a.is_empty:
            continue
        try:
            diff = geom_a.difference(b_union)
            if not diff.is_empty:
                result_geoms.append(diff)
        except Exception as e:
            logger.warning(f"差集计算失败: {e}")

    if not result_geoms:
        raise ValueError("差集分析未产生有效结果（A 完全被 B 覆盖）")

    return shapely_geoms_to_geojson_featurecollection(result_geoms, "difference")
