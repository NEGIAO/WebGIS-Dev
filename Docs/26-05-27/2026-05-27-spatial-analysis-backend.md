# 空间分析后端化改造

- **日期和时间**：2026-05-27 15:30
- **修改内容**：将空间分析功能从前端 OpenLayers 简化实现迁移到后端 Shapely 精确几何运算
- **修改原因**：原前端实现使用包围盒近似（intersection/difference），结果不精确，不适合生产系统
- **影响范围**：后端 API 层、前端空间分析 composable、Docker 构建配置
- **优化解决方案**：

## 技术选型

- 后端使用 **Shapely 2.x**（基于 GEOS C 库）实现精确几何运算
- 数据格式：GeoJSON FeatureCollection（EPSG:4326）
- 通信方式：前端 POST GeoJSON → 后端计算 → 返回 GeoJSON 结果

## 后端变更

### 新增文件

| 文件 | 说明 |
|------|------|
| `backend/api/spatial.py` | 空间分析 API 路由，5 种分析操作 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `backend/pyproject.toml` | 添加 `shapely>=2.0.0` 依赖 |
| `backend/Dockerfile` | 添加 `libgeos-dev` 系统库 |
| `backend/app.py` | 注册 `spatial_router` |

### API 设计

```
POST /api/v1/spatial/analysis
```

请求体：
```json
{
  "operation": "buffer | intersection | union | difference | convexHull",
  "radius": 1000,
  "features_a": { "type": "FeatureCollection", "features": [...] },
  "features_b": { "type": "FeatureCollection", "features": [...] }
}
```

响应体：
```json
{
  "code": 200,
  "data": {
    "type": "FeatureCollection",
    "features": [...],
    "analysis_type": "buffer",
    "feature_count": 3
  },
  "message": "success"
}
```

## 前端变更

### 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/api/backend.js` | 新增 `apiSpatialAnalysis()` 函数 |
| `frontend/src/composables/map/features/useSpatialAnalysis.js` | 重写为调用后端 API |

### 数据流

```
SpatialAnalysisPanel → ControlsPanel → HomeView → MapContainer
  → useSpatialAnalysis.js:
    1. getLayerFeatures(layerId) → OL Feature[] (EPSG:3857)
    2. featuresToGeoJSON(olFeatures) → GeoJSON (EPSG:4326)
    3. POST /api/v1/spatial/analysis → 后端 Shapely 计算
    4. geoJSONToFeatures(response) → OL Feature[] (EPSG:3857)
    5. createManagedVectorLayer({ features, name, ... })
```

## 修改的文件路径

| 文件 | 操作 |
|------|------|
| `backend/pyproject.toml` | 修改 |
| `backend/Dockerfile` | 修改 |
| `backend/api/spatial.py` | 新建 |
| `backend/app.py` | 修改 |
| `frontend/src/api/backend.js` | 修改 |
| `frontend/src/composables/map/features/useSpatialAnalysis.js` | 重写 |
| `Docs/26-05-27/2026-05-27-spatial-analysis-backend.md` | 本日志 |

## 测试方案

1. `docker compose up` 后端启动无报错，Shapely 导入成功
2. `npm run dev` 前端启动无报错
3. 导入测试数据 → 点击空间分析 → 选择图层/参数 → 执行分析
4. 检查返回结果精度（交集应为精确几何交集，非包围盒矩形）
5. 检查结果图层正确渲染到地图
