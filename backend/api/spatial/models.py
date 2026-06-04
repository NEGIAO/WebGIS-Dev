"""
空间分析 Pydantic 请求/响应模型
所有距离/大小参数统一为米，CRS 转换由 router 层统一处理
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class GeoJSONFeatureCollection(BaseModel):
    type: str = Field(default="FeatureCollection", description="GeoJSON 类型")
    features: List[Dict[str, Any]] = Field(default_factory=list, description="要素列表")


class SpatialAnalysisRequest(BaseModel):
    operation: str = Field(
        ...,
        description="分析类型：buffer / intersection / union / difference / convexHull / voronoi / aggregation / multiRingBuffer / simplify / fishnet",
    )
    radius: Optional[float] = Field(
        default=1000.0,
        description="缓冲半径（米），buffer 操作使用",
        ge=0.001,
        le=1000000,
    )
    features_a: GeoJSONFeatureCollection = Field(
        ..., description="图层 A 的 GeoJSON FeatureCollection（EPSG:4326）"
    )
    features_b: Optional[GeoJSONFeatureCollection] = Field(
        default=None, description="图层 B 的 GeoJSON FeatureCollection（叠加分析使用）"
    )
    # 高级分析参数（统一单位：米）
    distances: Optional[List[float]] = Field(
        default=None,
        description="多环缓冲区距离数组（米），如 [100, 300, 500]",
    )
    tolerance: Optional[float] = Field(
        default=None,
        description="几何简化容差（米），simplify 操作使用",
        ge=0.1,
        le=100000,
    )
    bbox: Optional[List[float]] = Field(
        default=None,
        description="可视范围 [minLon, minLat, maxLon, maxLat]（EPSG:4326），aggregation/fishnet 操作使用",
    )
    grid_type: Optional[str] = Field(
        default="grid",
        description="网格类型：grid（方格网）/ hexbin（六边形），aggregation 操作使用",
    )
    grid_size: Optional[float] = Field(
        default=500.0,
        description="网格大小（米），aggregation/fishnet 操作使用",
        ge=1,
        le=1000000,
    )
    # 渔网分析特有参数
    geometry_type: Optional[str] = Field(
        default="polygon",
        description="渔网几何类型：polygon（面）/ line（线），fishnet 操作使用",
    )
    create_center_points: Optional[bool] = Field(
        default=False,
        description="是否在每个网格中心创建点位，fishnet 操作使用",
    )
