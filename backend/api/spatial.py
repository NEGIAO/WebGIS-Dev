"""
空间分析 API
提供缓冲区、叠加分析（交集/并集/差集）、凸包等空间分析能力
基于 Shapely 2.x 实现精确几何运算
"""

import json
import logging
import math
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from shapely import from_geojson, to_geojson, union_all, convex_hull
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/spatial", tags=["空间分析"])


# ==================== 请求/响应模型 ====================


class GeoJSONFeatureCollection(BaseModel):
    type: str = Field(default="FeatureCollection", description="GeoJSON 类型")
    features: List[Dict[str, Any]] = Field(default_factory=list, description="要素列表")


class SpatialAnalysisRequest(BaseModel):
    operation: str = Field(
        ...,
        description="分析类型：buffer / intersection / union / difference / convexHull",
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


# ==================== API 端点 ====================


@router.post("/analysis")
async def spatial_analysis(request: SpatialAnalysisRequest):
    """
    空间分析接口
    支持 buffer / intersection / union / difference / convexHull
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
        else:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的分析类型: {operation}，支持: buffer/intersection/union/difference/convexHull",
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"空间分析异常: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"空间分析失败: {str(e)}")

    return {"code": 200, "data": result, "message": "success"}
