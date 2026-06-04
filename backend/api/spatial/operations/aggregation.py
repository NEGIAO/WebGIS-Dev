"""空间聚合分析（在 EPSG:3857 下执行，网格大小单位：米）"""

import logging
import math

from shapely.geometry import box, Polygon, mapping
from shapely import STRtree

from ..utils import MAX_GRID_CELLS

logger = logging.getLogger(__name__)


def do_spatial_aggregation(
    geoms_a: list,
    bbox: list,
    grid_type: str = "grid",
    grid_size: float = 500.0,
) -> dict:
    """空间聚合分析（网格化/蜂窝化）
    输入几何和 bbox 均已在 EPSG:3857 下，grid_size 单位为米。
    在指定 bbox 范围内生成方格网或六边形网格，统计每个网格内包含的点数。
    """
    if len(bbox) != 4:
        raise ValueError("bbox 必须为 [minX, minY, maxX, maxY]")

    min_x, min_y, max_x, max_y = bbox
    if min_x >= max_x or min_y >= max_y:
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

    bbox_poly = box(min_x, min_y, max_x, max_y)
    grid_cells = []

    if grid_type == "hexbin":
        hex_width = grid_size
        hex_height = grid_size * math.sqrt(3) / 2.0

        est_cols = max(1, math.ceil((max_x - min_x) / (hex_width * 3 / 4))) if hex_width > 0 else 0
        est_rows = max(1, math.ceil((max_y - min_y) / hex_height)) if hex_height > 0 else 0
        if est_cols * est_rows > MAX_GRID_CELLS:
            raise ValueError(
                f"预估网格数量 {est_cols * est_rows} 超过上限 {MAX_GRID_CELLS}，请增大 grid_size"
            )

        row = 0
        y = min_y
        while y < max_y + hex_height:
            x_row_offset = (hex_width * 3 / 4) if row % 2 == 1 else 0
            x = min_x
            while x < max_x + hex_width:
                cx = x + x_row_offset
                cy = y
                hex_coords = []
                for angle_deg in range(0, 360, 60):
                    angle_rad = math.radians(angle_deg)
                    hx = cx + (hex_width / 2.0) * math.cos(angle_rad)
                    hy = cy + (hex_width / 2.0) * math.sin(angle_rad)
                    hex_coords.append((hx, hy))
                hex_coords.append(hex_coords[0])
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
        n_cols = max(1, math.ceil((max_x - min_x) / grid_size))
        n_rows = max(1, math.ceil((max_y - min_y) / grid_size))
        if n_cols * n_rows > MAX_GRID_CELLS:
            raise ValueError(
                f"网格数量 {n_cols * n_rows} 超过上限 {MAX_GRID_CELLS}，请增大 grid_size"
            )
        for col in range(n_cols):
            x = min_x + col * grid_size
            for row_i in range(n_rows):
                y = min_y + row_i * grid_size
                cell = box(x, y, min(x + grid_size, max_x), min(y + grid_size, max_y))
                grid_cells.append(cell)

    if not grid_cells:
        raise ValueError("未生成有效网格")

    tree = STRtree(points)
    result_features = []
    for cell in grid_cells:
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
