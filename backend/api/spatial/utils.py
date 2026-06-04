"""
空间分析公共工具函数
坐标重投影、几何格式转换、顶点统计等基础能力
所有空间分析操作统一在 EPSG:3857 下进行，本模块负责 4326↔3857 转换
"""

import logging
from functools import lru_cache

from shapely.geometry import shape, mapping
from shapely.ops import transform as shapely_transform
from pyproj import Transformer

logger = logging.getLogger(__name__)

# 空间分析网格/要素数量安全上限（防 OOM）
MAX_GRID_CELLS = 100000


# ==================== 坐标重投影 ====================


@lru_cache(maxsize=2)
def _get_transformer(from_crs: str, to_crs: str) -> Transformer:
    """获取缓存的 pyproj Transformer 实例"""
    return Transformer.from_crs(from_crs, to_crs, always_xy=True)


def reproject_geom(geom, from_crs: str, to_crs: str):
    """将单个 Shapely 几何从一个 CRS 转换到另一个 CRS"""
    transformer = _get_transformer(from_crs, to_crs)
    return shapely_transform(transformer.transform, geom)


def reproject_geoms_to_3857(geoms: list) -> list:
    """将 Shapely 几何列表从 EPSG:4326 转换到 EPSG:3857"""
    transformer = _get_transformer("EPSG:4326", "EPSG:3857")
    return [shapely_transform(transformer.transform, g) for g in geoms if g is not None and not g.is_empty]


def reproject_geoms_to_4326(geoms: list) -> list:
    """将 Shapely 几何列表从 EPSG:3857 转换到 EPSG:4326"""
    transformer = _get_transformer("EPSG:3857", "EPSG:4326")
    return [shapely_transform(transformer.transform, g) for g in geoms if g is not None and not g.is_empty]


def reproject_result_to_4326(result: dict) -> dict:
    """将结果 FeatureCollection 中的所有几何从 EPSG:3857 转换到 EPSG:4326
    处理标准 features 数组和可选的 center_points 子结构
    """
    result["features"] = _reproject_features(result.get("features", []))
    if "center_points" in result and result["center_points"]:
        result["center_points"]["features"] = _reproject_features(
            result["center_points"].get("features", [])
        )
    return result


def _reproject_features(features: list) -> list:
    """将 GeoJSON Feature 列表中的几何从 3857 转换到 4326"""
    transformer = _get_transformer("EPSG:3857", "EPSG:4326")
    out = []
    for feat in features:
        geom_data = feat.get("geometry")
        if geom_data:
            try:
                geom = shape(geom_data)
                reprojected = shapely_transform(transformer.transform, geom)
                new_feat = {**feat, "geometry": mapping(reprojected)}
                out.append(new_feat)
                continue
            except Exception as e:
                logger.warning(f"几何重投影失败: {e}")
        out.append(feat)
    return out


# ==================== 几何格式转换 ====================


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


# ==================== 几何工具 ====================


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
