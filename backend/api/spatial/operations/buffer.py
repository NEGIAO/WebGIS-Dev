"""缓冲区分析（在 EPSG:3857 下执行，距离单位：米）"""

from ..utils import shapely_geoms_to_geojson_featurecollection


def do_buffer(geoms_a: list, radius_m: float) -> dict:
    """缓冲区分析
    输入几何已在 EPSG:3857 下，radius_m 直接作为 buffer 距离（米）。
    """
    result_geoms = []
    for geom in geoms_a:
        if geom is None or geom.is_empty:
            continue
        buffered = geom.buffer(radius_m, resolution=64)
        if not buffered.is_empty:
            result_geoms.append(buffered)

    if not result_geoms:
        raise ValueError("缓冲区分析未产生有效结果")

    return shapely_geoms_to_geojson_featurecollection(result_geoms, "buffer")
