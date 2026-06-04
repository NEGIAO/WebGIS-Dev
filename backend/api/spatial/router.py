"""
空间分析 API 路由
统一端点 /api/v1/spatial/analysis，按 operation 字段分发到具体分析函数。
输入/输出均为 EPSG:4326 GeoJSON，内部统一在 EPSG:3857 下执行。
"""

import logging

from fastapi import APIRouter, HTTPException

from .models import SpatialAnalysisRequest
from .utils import (
    _get_transformer,
    geojson_features_to_shapely,
    reproject_geoms_to_3857,
    reproject_result_to_4326,
)
from .operations import (
    do_buffer,
    do_convex_hull,
    do_difference,
    do_fishnet,
    do_intersection,
    do_multi_ring_buffer,
    do_simplify,
    do_spatial_aggregation,
    do_union,
    do_voronoi,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/spatial", tags=["空间分析"])


@router.post("/analysis")
async def spatial_analysis(request: SpatialAnalysisRequest):
    """
    空间分析接口
    输入/输出均为 GeoJSON FeatureCollection（EPSG:4326）
    内部统一在 EPSG:3857 平面坐标系下执行，所有距离/大小参数单位为米
    """
    operation = request.operation.lower().strip()

    # 解析图层 A 几何（4326），转换到 3857
    geoms_a_4326 = geojson_features_to_shapely(request.features_a.features)
    geoms_a = reproject_geoms_to_3857(geoms_a_4326)
    if not geoms_a and operation != "fishnet":
        raise HTTPException(status_code=400, detail="图层 A 无有效几何要素")

    # 解析图层 B 几何（叠加分析需要）
    geoms_b = []
    if request.features_b:
        geoms_b_4326 = geojson_features_to_shapely(request.features_b.features)
        geoms_b = reproject_geoms_to_3857(geoms_b_4326)

    # bbox 转换到 3857（如果提供）
    bbox_3857 = None
    if request.bbox:
        if len(request.bbox) != 4:
            raise HTTPException(status_code=400, detail="bbox 必须为 [minLon, minLat, maxLon, maxLat]")
        t = _get_transformer("EPSG:4326", "EPSG:3857")
        x1, y1 = t.transform(request.bbox[0], request.bbox[1])
        x2, y2 = t.transform(request.bbox[2], request.bbox[3])
        bbox_3857 = [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]

    try:
        if operation == "buffer":
            result = do_buffer(geoms_a, request.radius or 1000.0)
        elif operation == "intersection":
            if not geoms_b:
                raise ValueError("交集分析需要图层 B")
            result = do_intersection(geoms_a, geoms_b)
        elif operation == "union":
            if not geoms_b:
                raise ValueError("并集分析需要图层 B")
            result = do_union(geoms_a, geoms_b)
        elif operation == "difference":
            if not geoms_b:
                raise ValueError("差集分析需要图层 B")
            result = do_difference(geoms_a, geoms_b)
        elif operation == "convexhull":
            result = do_convex_hull(geoms_a)
        elif operation == "voronoi":
            result = do_voronoi(geoms_a)
        elif operation == "aggregation":
            if not bbox_3857:
                raise ValueError("空间聚合分析需要 bbox 参数 [minLon, minLat, maxLon, maxLat]")
            result = do_spatial_aggregation(
                geoms_a,
                bbox_3857,
                request.grid_type if request.grid_type is not None else "grid",
                request.grid_size if request.grid_size is not None else 500.0,
            )
        elif operation == "multiringbuffer":
            if not request.distances:
                raise ValueError("多环缓冲区需要 distances 参数（距离数组，单位：米）")
            result = do_multi_ring_buffer(geoms_a, request.distances)
        elif operation == "simplify":
            if not request.tolerance:
                raise ValueError("几何简化需要 tolerance 参数（容差，单位：米）")
            result = do_simplify(geoms_a, request.tolerance)
        elif operation == "fishnet":
            if not bbox_3857:
                raise ValueError("渔网分析需要 bbox 参数 [minLon, minLat, maxLon, maxLat]")
            if not request.grid_size or request.grid_size <= 0:
                raise ValueError("渔网分析需要 grid_size 参数（网格大小，单位：米）")
            result = do_fishnet(
                bbox_3857,
                request.grid_size,
                request.geometry_type or "polygon",
                request.create_center_points or False,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的分析类型: {operation}，支持: buffer/intersection/union/difference/convexHull/voronoi/aggregation/multiRingBuffer/simplify/fishnet",
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"空间分析异常: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"空间分析失败: {str(e)}")

    # 结果从 3857 转回 4326
    result = reproject_result_to_4326(result)

    return {"code": 200, "data": result, "message": "success"}
