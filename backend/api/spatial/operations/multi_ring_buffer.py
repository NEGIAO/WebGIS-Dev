"""多环缓冲区分析（在 EPSG:3857 下执行，距离单位：米）"""

from shapely.geometry import mapping
from shapely.ops import unary_union


def do_multi_ring_buffer(geoms_a: list, distances: list) -> dict:
    """多环缓冲区分析
    输入几何已在 EPSG:3857 下，distances 直接作为缓冲距离（米）。
    使用 difference 擦除实现"甜甜圈"中空环状拓扑。
    """
    if not distances or len(distances) < 1:
        raise ValueError("至少需要一个缓冲距离")

    sorted_distances = sorted(distances)
    if sorted_distances[0] <= 0:
        raise ValueError("缓冲距离必须大于 0")

    merged = unary_union([g for g in geoms_a if g is not None and not g.is_empty])
    if merged.is_empty:
        raise ValueError("无有效几何可计算缓冲区")

    rings = []
    prev_buffer = None
    for i, dist_m in enumerate(sorted_distances):
        current_buffer = merged.buffer(dist_m, resolution=64)

        if prev_buffer is not None:
            ring = current_buffer.difference(prev_buffer)
        else:
            ring = current_buffer.difference(merged)

        if not ring.is_empty:
            rings.append((ring, i, dist_m))
        prev_buffer = current_buffer

    if not rings:
        raise ValueError("多环缓冲区计算未产生有效结果")

    features = []
    for geom, idx, dist in rings:
        features.append({
            "type": "Feature",
            "properties": {
                "_analysisType": "multiRingBuffer",
                "ring_index": idx,
                "distance_m": dist,
            },
            "geometry": mapping(geom),
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "analysis_type": "multiRingBuffer",
        "feature_count": len(features),
    }
