"""几何简化（在 EPSG:3857 下执行，容差单位：米）"""

from shapely.geometry import mapping

from ..utils import _count_vertices


def do_simplify(geoms_a: list, tolerance: float) -> dict:
    """几何简化（抽稀）
    输入几何已在 EPSG:3857 下，tolerance 单位为米。
    使用 Douglas-Peucker 算法对复杂几何进行节点抽稀。
    """
    if tolerance <= 0:
        raise ValueError("容差必须大于 0")

    result_features = []
    total_original = 0
    total_simplified = 0

    for geom in geoms_a:
        if geom is None or geom.is_empty:
            continue

        original_count = _count_vertices(geom)

        simplified = geom.simplify(tolerance, preserve_topology=True)
        if simplified.is_empty:
            continue

        simplified_count = _count_vertices(simplified)
        total_original += original_count
        total_simplified += simplified_count

        result_features.append({
            "type": "Feature",
            "properties": {
                "_analysisType": "simplify",
                "original_vertices": original_count,
                "simplified_vertices": simplified_count,
                "tolerance": tolerance,
            },
            "geometry": mapping(simplified),
        })

    if not result_features:
        raise ValueError("几何简化未产生有效结果")

    return {
        "type": "FeatureCollection",
        "features": result_features,
        "analysis_type": "simplify",
        "feature_count": len(result_features),
        "total_original_vertices": total_original,
        "total_simplified_vertices": total_simplified,
    }
