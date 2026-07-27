"""泰森多边形（Voronoi Diagram）分析"""

from shapely.geometry import box, MultiPoint, mapping
from shapely.ops import voronoi_diagram


def do_voronoi(geoms_a: list) -> dict:
    """泰森多边形（Voronoi Diagram）分析
    输入点要素，计算每个点的势力范围多边形。
    使用 shapely.ops.voronoi_diagram 实现。
    """
    # 提取所有点几何
    points = []
    for geom in geoms_a:
        if geom is None or geom.is_empty:
            continue
        if geom.geom_type == "Point":
            points.append(geom)
        elif geom.geom_type == "MultiPoint":
            points.extend(list(geom.geoms))
        else:
            # 对于非点几何，取其质心
            points.append(geom.centroid)

    if len(points) < 2:
        raise ValueError("泰森多边形分析至少需要 2 个点要素")

    multi_point = MultiPoint(points)

    # 直接用点集外包围盒（bounds）计算 envelope，留出余量防止边缘多边形无限延伸。
    # 【修复】此前用 convex_hull 且在其为 Point/LineString 时直接报错——但恰好 2 个点的
    # convex_hull 必为 LineString、任意共线点集亦然，导致「至少 2 个点」的契约下 2 点/共线输入
    # 100% 失败。改用 bounds（对两点、共线等退化情形同样有效），零展布维度回退 1km padding
    # （EPSG:3857 下单位为米），voronoi_diagram 以带面积的 box envelope 即可正常切分。
    minx, miny, maxx, maxy = multi_point.bounds
    dx = (maxx - minx) * 0.5 if maxx > minx else 1000.0
    dy = (maxy - miny) * 0.5 if maxy > miny else 1000.0
    bounding_poly = box(minx - dx, miny - dy, maxx + dx, maxy + dy)

    # 计算 Voronoi 图
    voronoi_result = voronoi_diagram(multi_point, envelope=bounding_poly)

    result_geoms = []
    for i, geom in enumerate(voronoi_result.geoms):
        if geom is None or geom.is_empty:
            continue
        # 裁剪到边界内
        clipped = geom.intersection(bounding_poly)
        if not clipped.is_empty:
            result_geoms.append(clipped)

    if not result_geoms:
        raise ValueError("泰森多边形计算未产生有效结果")

    # 构建带属性的 FeatureCollection
    features = []
    for i, geom in enumerate(result_geoms):
        features.append({
            "type": "Feature",
            "properties": {
                "_analysisType": "voronoi",
                "site_index": i,
            },
            "geometry": mapping(geom),
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "analysis_type": "voronoi",
        "feature_count": len(features),
    }
