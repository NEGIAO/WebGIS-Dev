"""
空间分析 API
提供缓冲区、叠加分析（交集/并集/差集）、凸包、泰森多边形、空间聚合、多环缓冲区、几何简化等空间分析能力
基于 Shapely 2.x 实现精确几何运算
"""

import logging
import math
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from shapely.geometry import shape, mapping, box, MultiPoint, Polygon
from shapely.ops import unary_union, voronoi_diagram
from shapely import STRtree

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/spatial", tags=["空间分析"])


# ==================== 请求/响应模型 ====================


class GeoJSONFeatureCollection(BaseModel):
    type: str = Field(default="FeatureCollection", description="GeoJSON 类型")
    features: List[Dict[str, Any]] = Field(default_factory=list, description="要素列表")


class SpatialAnalysisRequest(BaseModel):
    operation: str = Field(
        ...,
        description="分析类型：buffer / intersection / union / difference / convexHull / voronoi / aggregation / multiRingBuffer / simplify",
    )
    radius: Optional[float] = Field(
        default=1000.0,
        description="缓冲半径（米），仅 buffer 操作使用",
        ge=0.001,
        le=1000000,
    )
    features_a: GeoJSONFeatureCollection = Field(
        ..., description="图层 A 的 GeoJSON FeatureCollection"
    )
    features_b: Optional[GeoJSONFeatureCollection] = Field(
        default=None, description="图层 B 的 GeoJSON FeatureCollection（叠加分析使用）"
    )
    # 高级分析参数
    distances: Optional[List[float]] = Field(
        default=None,
        description="多环缓冲区距离数组（米），如 [100, 300, 500]",
    )
    tolerance: Optional[float] = Field(
        default=None,
        description="几何简化容差（度），simplify 操作使用",
        ge=0.000001,
        le=10,
    )
    bbox: Optional[List[float]] = Field(
        default=None,
        description="可视范围 [minLon, minLat, maxLon, maxLat]，aggregation 操作使用",
    )
    grid_type: Optional[str] = Field(
        default="grid",
        description="网格类型：grid（方格网）/ hexbin（六边形），aggregation 操作使用",
    )
    grid_size: Optional[float] = Field(
        default=0.01,
        description="网格大小（度），aggregation 操作使用",
        ge=0.0001,
        le=10,
    )


# ==================== 核心分析函数 ====================


def meters_to_degrees_approx(radius_m: float, ref_lat: float) -> float:
    """将米近似转换为度（基于参考纬度）"""
    lat_rad = math.radians(ref_lat)
    # 1 度纬度 ≈ 111320 米
    # 1 度经度 ≈ 111320 * cos(lat) 米
    meters_per_degree_lat = 111320.0
    meters_per_degree_lon = 111320.0 * math.cos(lat_rad)
    # 取两者的平均值作为近似
    meters_per_degree = (meters_per_degree_lat + meters_per_degree_lon) / 2.0
    return radius_m / meters_per_degree


def get_reference_lat(geoms: list) -> float:
    """从几何集合中获取参考纬度（用于米→度转换）"""
    for geom in geoms:
        if geom is not None and not geom.is_empty:
            centroid = geom.centroid
            return centroid.y
    return 0.0


def geojson_features_to_shapely(features: list) -> list:
    """将 GeoJSON Feature 列表转换为 Shapely 几何对象列表"""
    geoms = []
    for feat in features:
        geom = feat.get("geometry")
        if geom:
            try:
                geoms.append(shape(geom))
            except Exception as e:
                logger.warning(f"跳过无效几何: {e}")
    return geoms


def shapely_geom_to_geojson_feature(geom, analysis_type: str) -> dict:
    """将单个 Shapely 几何对象转换为 GeoJSON Feature"""
    return {
        "type": "Feature",
        "properties": {"_analysisType": analysis_type},
        "geometry": mapping(geom),
    }


def shapely_geoms_to_geojson_featurecollection(
    geoms: list, analysis_type: str
) -> dict:
    """将 Shapely 几何对象列表转换为 GeoJSON FeatureCollection"""
    features = [shapely_geom_to_geojson_feature(g, analysis_type) for g in geoms]
    return {
        "type": "FeatureCollection",
        "features": features,
        "analysis_type": analysis_type,
        "feature_count": len(features),
    }


def _count_vertices(geom) -> int:
    """统计几何对象的节点数"""
    if geom.geom_type == "Polygon":
        return len(geom.exterior.coords) + sum(len(i.coords) for i in geom.interiors)
    elif geom.geom_type == "LineString":
        return len(geom.coords)
    elif geom.geom_type == "MultiPolygon":
        return sum(_count_vertices(p) for p in geom.geoms)
    elif geom.geom_type == "MultiLineString":
        return sum(len(ls.coords) for ls in geom.geoms)
    return 0


# ==================== 分析操作实现 ====================


def do_buffer(geoms_a: list, radius_m: float) -> dict:
    """缓冲区分析"""
    ref_lat = get_reference_lat(geoms_a)
    radius_deg = meters_to_degrees_approx(radius_m, ref_lat)

    result_geoms = []
    for geom in geoms_a:
        if geom is None or geom.is_empty:
            continue
        buffered = geom.buffer(radius_deg, resolution=64)
        if not buffered.is_empty:
            result_geoms.append(buffered)

    if not result_geoms:
        raise ValueError("缓冲区分析未产生有效结果")

    return shapely_geoms_to_geojson_featurecollection(result_geoms, "buffer")


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

    # 计算边界 envelope，留出余量防止边缘多边形无限延伸
    envelope = multi_point.convex_hull

    # 检测退化输入（共线或重合点导致 convex_hull 不是 Polygon）
    if envelope.geom_type in ("Point", "LineString"):
        raise ValueError("输入点集退化（共线或重合），无法计算泰森多边形")
    minx, miny, maxx, maxy = envelope.bounds
    dx = (maxx - minx) * 0.5 if maxx > minx else 0.01
    dy = (maxy - miny) * 0.5 if maxy > miny else 0.01
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


def do_spatial_aggregation(
    geoms_a: list,
    bbox: list,
    grid_type: str = "grid",
    grid_size: float = 0.01,
) -> dict:
    """空间聚合分析（网格化/蜂窝化）
    在指定 BBox 范围内生成方格网或六边形网格，统计每个网格内包含的点数。
    返回带 count 属性的网格 GeoJSON。
    """
    if len(bbox) != 4:
        raise ValueError("bbox 必须为 [minLon, minLat, maxLon, maxLat]")

    min_lon, min_lat, max_lon, max_lat = bbox
    if min_lon >= max_lon or min_lat >= max_lat:
        raise ValueError("bbox 范围无效")

    # 提取所有点坐标
    points = []
    for geom in geoms_a:
        if geom is None or geom.is_empty:
            continue
        if geom.geom_type == "Point":
            points.append(geom)
        elif geom.geom_type == "MultiPoint":
            points.extend(list(geom.geoms))
        else:
            points.append(geom.centroid)

    if not points:
        raise ValueError("无有效点要素可聚合")

    # 构建 bounding box 多边形
    bbox_poly = box(min_lon, min_lat, max_lon, max_lat)

    grid_cells = []
    MAX_GRID_CELLS = 100000

    if grid_type == "hexbin":
        # 六边形网格（平顶六边形，奇数行偏移半列实现蜂窝交错）
        hex_width = grid_size
        hex_height = grid_size * math.sqrt(3) / 2.0

        # 预估网格数量，防止 OOM
        est_cols = max(1, math.ceil((max_lon - min_lon) / (hex_width * 3 / 4))) if hex_width > 0 else 0
        est_rows = max(1, math.ceil((max_lat - min_lat) / hex_height)) if hex_height > 0 else 0
        if est_cols * est_rows > MAX_GRID_CELLS:
            raise ValueError(
                f"预估网格数量 {est_cols * est_rows} 超过上限 {MAX_GRID_CELLS}，请增大 grid_size"
            )

        row = 0
        y = min_lat
        while y < max_lat + hex_height:
            # 仅奇数行向右偏移 3/4 个 hex_width，实现蜂窝交错排列
            x_row_offset = (hex_width * 3 / 4) if row % 2 == 1 else 0
            x = min_lon
            while x < max_lon + hex_width:
                cx = x + x_row_offset
                cy = y
                hex_coords = []
                for angle_deg in range(0, 360, 60):
                    angle_rad = math.radians(angle_deg)
                    hx = cx + (hex_width / 2.0) * math.cos(angle_rad)
                    hy = cy + (hex_width / 2.0) * math.sin(angle_rad)
                    hex_coords.append((hx, hy))
                hex_coords.append(hex_coords[0])  # 闭合
                try:
                    hex_poly = Polygon(hex_coords)
                    if hex_poly.is_valid and hex_poly.intersects(bbox_poly):
                        clipped = hex_poly.intersection(bbox_poly)
                        if not clipped.is_empty:
                            grid_cells.append(clipped)
                except Exception as e:
                    logger.debug(f"跳过退化六边形: {e}")
                x += hex_width * 3 / 4
            y += hex_height
            row += 1
    else:
        # 方格网（默认），使用整数计数器避免浮点累积误差
        n_cols = max(1, math.ceil((max_lon - min_lon) / grid_size))
        n_rows = max(1, math.ceil((max_lat - min_lat) / grid_size))
        if n_cols * n_rows > MAX_GRID_CELLS:
            raise ValueError(
                f"网格数量 {n_cols * n_rows} 超过上限 {MAX_GRID_CELLS}，请增大 grid_size"
            )
        for col in range(n_cols):
            x = min_lon + col * grid_size
            for row_i in range(n_rows):
                y = min_lat + row_i * grid_size
                cell = box(x, y, min(x + grid_size, max_lon), min(y + grid_size, max_lat))
                grid_cells.append(cell)

    if not grid_cells:
        raise ValueError("未生成有效网格")

    # 使用 STRtree 空间索引统计每个网格内的点数（O(N*logN) 替代 O(N*M)）
    tree = STRtree(points)
    result_features = []
    for cell in grid_cells:
        # query 返回与 cell 相交的点的索引，再验证精确包含关系
        candidate_indices = tree.query(cell, predicate="contains")
        count = len(candidate_indices)
        if count > 0:
            result_features.append({
                "type": "Feature",
                "properties": {
                    "_analysisType": "aggregation",
                    "count": count,
                    "grid_type": grid_type,
                },
                "geometry": mapping(cell),
            })

    if not result_features:
        raise ValueError("聚合分析未产生包含要素的网格（所有网格均为空）")

    return {
        "type": "FeatureCollection",
        "features": result_features,
        "analysis_type": "aggregation",
        "feature_count": len(result_features),
    }


def do_multi_ring_buffer(geoms_a: list, distances: list) -> dict:
    """多环缓冲区分析
    接收距离数组（米），生成由内到外的同心环。
    使用 difference 擦除实现"甜甜圈"中空环状拓扑。
    """
    if not distances or len(distances) < 1:
        raise ValueError("至少需要一个缓冲距离")

    # 排序距离（由小到大）
    sorted_distances = sorted(distances)
    if sorted_distances[0] <= 0:
        raise ValueError("缓冲距离必须大于 0")

    ref_lat = get_reference_lat(geoms_a)
    merged = unary_union([g for g in geoms_a if g is not None and not g.is_empty])
    if merged.is_empty:
        raise ValueError("无有效几何可计算缓冲区")

    # 生成每个距离的缓冲区（从小到大）
    rings = []
    prev_buffer = None
    for i, dist_m in enumerate(sorted_distances):
        dist_deg = meters_to_degrees_approx(dist_m, ref_lat)
        current_buffer = merged.buffer(dist_deg, resolution=64)

        if prev_buffer is not None:
            # 甜甜圈：大环减去小环
            ring = current_buffer.difference(prev_buffer)
        else:
            # 最内环：减去原始几何
            ring = current_buffer.difference(merged)

        if not ring.is_empty:
            rings.append((ring, i, dist_m))
        prev_buffer = current_buffer

    if not rings:
        raise ValueError("多环缓冲区计算未产生有效结果")

    # 构建 FeatureCollection
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


def do_simplify(geoms_a: list, tolerance: float) -> dict:
    """几何简化（抽稀）
    使用 Douglas-Peucker 算法对复杂几何进行节点抽稀。
    返回简化后的几何，附带原始和简化后的节点数信息。
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


# ==================== API 端点 ====================


@router.post("/analysis")
async def spatial_analysis(request: SpatialAnalysisRequest):
    """
    空间分析接口
    支持 buffer / intersection / union / difference / convexHull / voronoi / aggregation / multiRingBuffer / simplify
    输入和输出均为 GeoJSON FeatureCollection（EPSG:4326）
    """
    operation = request.operation.lower().strip()

    # 解析图层 A 几何
    geoms_a = geojson_features_to_shapely(request.features_a.features)
    if not geoms_a:
        raise HTTPException(status_code=400, detail="图层 A 无有效几何要素")

    # 解析图层 B 几何（叠加分析需要）
    geoms_b = []
    if request.features_b:
        geoms_b = geojson_features_to_shapely(request.features_b.features)

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
            if not request.bbox:
                raise ValueError("空间聚合分析需要 bbox 参数 [minLon, minLat, maxLon, maxLat]")
            result = do_spatial_aggregation(
                geoms_a,
                request.bbox,
                request.grid_type if request.grid_type is not None else "grid",
                request.grid_size if request.grid_size is not None else 0.01,
            )
        elif operation == "multiringbuffer":
            if not request.distances:
                raise ValueError("多环缓冲区需要 distances 参数（距离数组，单位：米）")
            result = do_multi_ring_buffer(geoms_a, request.distances)
        elif operation == "simplify":
            if not request.tolerance:
                raise ValueError("几何简化需要 tolerance 参数（容差，单位：度）")
            result = do_simplify(geoms_a, request.tolerance)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的分析类型: {operation}，支持: buffer/intersection/union/difference/convexHull/voronoi/aggregation/multiRingBuffer/simplify",
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"空间分析异常: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"空间分析失败: {str(e)}")

    return {"code": 200, "data": result, "message": "success"}
