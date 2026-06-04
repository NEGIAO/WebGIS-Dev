"""渔网分析（在 EPSG:3857 下执行，网格大小单位：米）"""

import math

from shapely.geometry import box, mapping, LineString, Point as ShapelyPoint

from ..utils import MAX_GRID_CELLS


def do_fishnet(
    bbox: list,
    grid_size_meters: float,
    geometry_type: str = "polygon",
    create_center_points: bool = False,
) -> dict:
    """渔网分析（Fishnet Grid）
    输入 bbox 已在 EPSG:3857 下（米），直接在 3857 下生成网格。
    结果由 router 统一转回 4326。
    """
    if len(bbox) != 4:
        raise ValueError("bbox 必须为 [minX, minY, maxX, maxY]")

    min_x, min_y, max_x, max_y = bbox
    if min_x >= max_x or min_y >= max_y:
        raise ValueError("bbox 范围无效")

    if grid_size_meters <= 0:
        raise ValueError("网格大小必须大于 0")

    if geometry_type not in ("polygon", "line"):
        raise ValueError("geometry_type 必须为 'polygon' 或 'line'")

    n_cols = max(1, math.ceil((max_x - min_x) / grid_size_meters))
    n_rows = max(1, math.ceil((max_y - min_y) / grid_size_meters))

    if n_cols * n_rows > MAX_GRID_CELLS:
        raise ValueError(
            f"预估网格数量 {n_cols * n_rows} 超过上限 {MAX_GRID_CELLS}，请增大网格尺寸"
        )

    grid_features = []
    point_features = []

    for col in range(n_cols):
        cx = min_x + col * grid_size_meters
        for row in range(n_rows):
            cy = min_y + row * grid_size_meters
            cell_x_min = cx
            cell_y_min = cy
            cell_x_max = min(cx + grid_size_meters, max_x)
            cell_y_max = min(cy + grid_size_meters, max_y)

            if geometry_type == "line":
                ring_coords = [
                    (cell_x_min, cell_y_min),
                    (cell_x_max, cell_y_min),
                    (cell_x_max, cell_y_max),
                    (cell_x_min, cell_y_max),
                    (cell_x_min, cell_y_min),
                ]
                geom_data = mapping(LineString(ring_coords))
            else:
                cell_poly = box(cell_x_min, cell_y_min, cell_x_max, cell_y_max)
                geom_data = mapping(cell_poly)

            grid_features.append({
                "type": "Feature",
                "properties": {
                    "_analysisType": "fishnet",
                    "col": col,
                    "row": row,
                    "grid_size_m": grid_size_meters,
                    "geometry_type": geometry_type,
                },
                "geometry": geom_data,
            })

            if create_center_points:
                center_x = (cell_x_min + cell_x_max) / 2.0
                center_y = (cell_y_min + cell_y_max) / 2.0
                point_features.append({
                    "type": "Feature",
                    "properties": {
                        "_analysisType": "fishnet_point",
                        "col": col,
                        "row": row,
                        "grid_size_m": grid_size_meters,
                    },
                    "geometry": mapping(ShapelyPoint(center_x, center_y)),
                })

    if not grid_features:
        raise ValueError("渔网分析未生成有效网格")

    result = {
        "type": "FeatureCollection",
        "features": grid_features,
        "analysis_type": "fishnet",
        "feature_count": len(grid_features),
    }

    if create_center_points and point_features:
        result["center_points"] = {
            "type": "FeatureCollection",
            "features": point_features,
            "analysis_type": "fishnet_point",
            "feature_count": len(point_features),
        }

    return result
