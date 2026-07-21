# 空间分析后端架构说明

日期：2026-07-21

适用范围：`backend/api/spatial/` 模块及前端 `frontend/src/components/ControlsPanel/SpatialAnalysisPanel.vue` 调用链。

本文是长期参考文档，说明 WebGIS 3.0 中"空间分析"功能的后端架构、坐标系策略、8 种分析操作的算法原理与参数、前端调用链路，供后续维护、扩展算子与性能调优时对照。

## 1. 功能定位

本功能为前端地图提供**基于 Shapely 的矢量空间分析能力**，涵盖缓冲区、叠加、凸包、泰森多边形、空间聚合、几何简化、渔网、多环缓冲区共 8 类分析工具。所有计算在后端 Python 进程中完成，前端仅负责要素序列化、API 调用与结果渲染。

**架构核心**：单一 HTTP 端点 `POST /api/v1/spatial/analysis`，通过请求体中的 `operation` 字段分发到具体分析函数。输入/输出统一为 EPSG:4326 GeoJSON FeatureCollection，内部计算统一在 EPSG:3857（Web Mercator）平面坐标系下执行，所有距离/面积参数单位为**米**。

**重要边界**：这是一套**平面几何近似分析引擎**，依赖 Web Mercator 投影将球面问题转化为平面问题。它不提供大地测量级（椭球面）精确计算，不适合跨越极大经度范围或高纬度地区的精密量算。若需后者，应引入地理坐标系下的椭球算法（如 GeographicLib）。

## 2. 文件结构

| 文件 | 职责 |
|------|------|
| `backend/api/spatial/router.py` | FastAPI 路由层：接收请求、operation 分发、CRS 转换编排、统一异常处理 |
| `backend/api/spatial/models.py` | Pydantic 请求/响应模型定义（`SpatialAnalysisRequest`、`GeoJSONFeatureCollection`） |
| `backend/api/spatial/utils.py` | 公共工具：pyproj 坐标重投影（4326↔3857）、Shapely↔GeoJSON 格式转换、顶点统计、`MAX_GRID_CELLS` 常量 |
| `backend/api/spatial/operations/__init__.py` | 算子包入口，统一导出所有 `do_*` 函数 |
| `backend/api/spatial/operations/buffer.py` | 缓冲区分析 |
| `backend/api/spatial/operations/overlay.py` | 叠加分析（交集 / 并集 / 差集） |
| `backend/api/spatial/operations/convex_hull.py` | 凸包分析 |
| `backend/api/spatial/operations/voronoi.py` | 泰森多边形（Voronoi）分析 |
| `backend/api/spatial/operations/aggregation.py` | 空间聚合分析（方格网 / 六边形 + STRtree 索引） |
| `backend/api/spatial/operations/simplify.py` | 几何简化（Douglas-Peucker 抽稀） |
| `backend/api/spatial/operations/fishnet.py` | 渔网分析（规则网格生成） |
| `backend/api/spatial/operations/multi_ring_buffer.py` | 多环缓冲区分析 |
| `frontend/src/components/ControlsPanel/SpatialAnalysisPanel.vue` | 前端 UI 面板：8 种工具选择、参数输入、事件发射 |
| `frontend/src/composables/map/features/useSpatialAnalysis.js` | 前端编排层：OL Feature↔GeoJSON 序列化、API 调用、结果图层创建 |
| `frontend/src/api/backend/spatial.js` | Axios 封装：`apiSpatialAnalysis()`，30 秒超时 |

## 3. 单端点 + operation 分发架构

```
前端 SpatialAnalysisPanel.vue
  → emit('analysis', params)
  → useSpatialAnalysis.runSpatialAnalysis(params)
    → 序列化 OL Feature 为 GeoJSON（EPSG:4326）
    → apiSpatialAnalysis(payload)  // POST /api/v1/spatial/analysis
      → router.py: spatial_analysis()
        → geojson_features_to_shapely()   // GeoJSON → Shapely 几何
        → reproject_geoms_to_3857()       // 4326 → 3857
        → operation 分发 → do_*()         // 在 3857 下计算
        → reproject_result_to_4326()      // 3857 → 4326
      → 返回 { code: 200, data: FeatureCollection, message }
    → geoJSONToFeatures()                 // GeoJSON → OL Feature（EPSG:3857）
    → createManagedVectorLayer()          // 结果渲染为新图层
```

路由层 `router.py` 的 `spatial_analysis()` 函数是唯一入口，按 `request.operation.lower().strip()` 做 if-elif 分发。支持的 operation 值：`buffer` / `intersection` / `union` / `difference` / `convexhull` / `voronoi` / `aggregation` / `multiringbuffer` / `simplify` / `fishnet`（共 10 个值，对应前端 8 种工具，其中叠加分析展开为 3 个子操作）。

## 4. 坐标系转换策略

### 4.1 为何使用 EPSG:3857 计算

WGS84（EPSG:4326）是地理坐标系，坐标单位为度，无法直接进行距离/面积的欧氏运算。Web Mercator（EPSG:3857）是**等角投影**，坐标单位为米，在中低纬度地区距离与面积形变可接受，且与前端 OpenLayers 地图的默认投影一致，减少前后端坐标转换次数。

### 4.2 转换流程

`utils.py` 通过 `pyproj.Transformer`（`lru_cache` 缓存，`always_xy=True`）实现双向转换：

- **入站**：`reproject_geoms_to_3857()` — 将前端传入的 4326 几何批量转为 3857
- **出站**：`reproject_result_to_4326()` — 将计算结果从 3857 转回 4326，同时处理 `center_points` 子结构（渔网中心点）
- **bbox 转换**：router 层单独将 4326 bbox 转为 3857 bbox 供 aggregation/fishnet 使用

### 4.3 前端侧

`useSpatialAnalysis.js` 利用 OpenLayers 的 `GeoJSON` 格式器在 `EPSG:3857`（地图内部）与 `EPSG:4326`（API 传输）之间转换：

```javascript
// 序列化：地图 → API
gjFormat.writeFeaturesObject(olFeatures, {
    featureProjection: 'EPSG:3857',
    dataProjection: 'EPSG:4326',
});
// 反序列化：API → 地图
gjFormat.readFeatures(geojson, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
});
```

## 5. 请求模型

`SpatialAnalysisRequest`（Pydantic BaseModel）核心字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `operation` | `str`（必填） | 分析类型标识 |
| `features_a` | `GeoJSONFeatureCollection`（必填） | 图层 A，EPSG:4326 |
| `features_b` | `GeoJSONFeatureCollection`（可选） | 图层 B，叠加分析使用 |
| `radius` | `float`（默认 1000.0） | 缓冲半径（米），范围 [0.001, 1000000] |
| `distances` | `List[float]`（可选） | 多环缓冲距离数组（米） |
| `tolerance` | `float`（可选） | 简化容差（米），范围 [0.1, 100000] |
| `bbox` | `List[float]`（可选） | 四至范围 [minLon, minLat, maxLon, maxLat]，EPSG:4326 |
| `grid_type` | `str`（默认 "grid"） | 网格类型：grid / hexbin |
| `grid_size` | `float`（默认 500.0） | 网格大小（米），范围 [1, 1000000] |
| `geometry_type` | `str`（默认 "polygon"） | 渔网几何类型：polygon / line |
| `create_center_points` | `bool`（默认 False） | 是否生成渔网中心点 |

## 6. 八种分析操作

| 操作 | operation 值 | 算法 | 关键参数 |
|------|-------------|------|----------|
| 缓冲区分析 | `buffer` | Shapely `geom.buffer(radius, resolution=64)`，64 段圆弧逼近 | `radius`（米，默认 1000） |
| 叠加分析 | `intersection` / `union` / `difference` | 先 `unary_union` 合并图层 B，再逐要素做精确布尔运算 | 需要 `features_b` |
| 凸包分析 | `convexhull` | `unary_union` 合并全部几何后取 `.convex_hull` | 仅需 `features_a` |
| 泰森多边形 | `voronoi` | `shapely.ops.voronoi_diagram`，以凸包外扩 50% 为裁剪边界 | 至少 2 个点要素 |
| 空间聚合 | `aggregation` | 生成方格网/六边形网格，`STRtree` 空间索引查询每格包含的点数 | `bbox`、`grid_type`、`grid_size` |
| 几何简化 | `simplify` | Douglas-Peucker 算法，`preserve_topology=True` | `tolerance`（米） |
| 渔网分析 | `fishnet` | 在 bbox 内按 grid_size 步长生成规则网格（面或线） | `bbox`、`grid_size`、`geometry_type`、`create_center_points` |
| 多环缓冲区 | `multiringbuffer` | 按距离排序逐级 buffer，相邻环做 `difference` 得到中空环 | `distances`（米数组） |

### 6.1 缓冲区分析（buffer）

对图层 A 中每个几何执行 `geom.buffer(radius_m, resolution=64)`。`resolution=64` 表示用 64 段折线逼近四分之一圆弧，保证缓冲区边界光滑。空几何被跳过，全部为空则抛出 ValueError。

### 6.2 叠加分析（overlay）

三个子操作共享 `overlay.py`：

- **交集（intersection）**：先 `unary_union(geoms_b)` 将图层 B 合并为单一几何（减少重复计算），再对 A 中每个要素执行 `.intersection(b_union)`。
- **并集（union）**：将 A + B 所有几何合并后执行一次 `unary_union`，输出单一合并结果。
- **差集（difference）**：同样先合并 B，再对 A 中每个要素执行 `.difference(b_union)`。B 为空时直接返回 A。

`unary_union` 是 Shapely 2.x 的高效批量合并函数（底层 GEOS Cascaded Union），避免逐对合并的 O(n²) 开销。

### 6.3 凸包分析（convexHull）

将图层 A 所有几何 `unary_union` 合并后取 `.convex_hull`，输出包含全部要素的最小凸多边形。

### 6.4 泰森多边形（voronoi）

1. 提取所有点坐标（Point 直接取，MultiPoint 展开，非点几何取质心）。
2. 至少需要 2 个点，否则报错。
3. 以点集凸包的 bounds 外扩 50%（退化时用 1000m）构建裁剪矩形 `bounding_poly`。
4. 调用 `shapely.ops.voronoi_diagram(multi_point, envelope=bounding_poly)` 计算 Voronoi 图。
5. 每个 Voronoi 多边形裁剪到 `bounding_poly` 内，输出带 `site_index` 属性的 FeatureCollection。

退化检测：若点集凸包为 Point 或 LineString（共线/重合），直接报错。

### 6.5 空间聚合（aggregation）

1. 提取所有点坐标（同 voronoi 逻辑）。
2. 在 3857 bbox 内生成网格：
   - **方格网（grid）**：按 `grid_size` 步长切分，`n_cols × n_rows` 个矩形。
   - **六边形（hexbin）**：以 `grid_size` 为宽度、`grid_size × √3/2` 为高度生成正六边形，奇数行偏移 `3/4 × width`，裁剪到 bbox。
3. **格数安全上限**：`n_cols × n_rows > MAX_GRID_CELLS (100000)` 时拒绝执行，防止 OOM。
4. 构建 `STRtree(points)` 空间索引（Shapely 2.x 的 R-tree 实现），对每个网格执行 `tree.query(cell, predicate="contains")` 统计包含的点数。
5. 仅输出 count > 0 的网格，属性含 `count` 和 `grid_type`。

### 6.6 几何简化（simplify）

对每个几何执行 `geom.simplify(tolerance, preserve_topology=True)`：

- 算法为 **Douglas-Peucker**：递归移除偏离首尾连线不超过 tolerance 的中间节点。
- `preserve_topology=True`：保证简化后不产生自相交、不改变拓扑关系。
- 结果属性记录 `original_vertices` / `simplified_vertices`，FeatureCollection 顶层附加 `total_original_vertices` / `total_simplified_vertices` 供前端计算压缩率。

### 6.7 渔网分析（fishnet）

1. 在 3857 bbox 内按 `grid_size` 步长生成 `n_cols × n_rows` 个网格单元。
2. 格数超过 `MAX_GRID_CELLS (100000)` 时拒绝。
3. `geometry_type="polygon"` 输出矩形面，`"line"` 输出矩形环线（LineString 闭合环）。
4. `create_center_points=True` 时额外生成中心点 FeatureCollection，挂在结果的 `center_points` 字段下。
5. 渔网分析**不需要输入图层**（`features_a` 传空集合），仅依赖 bbox 和 grid_size。

### 6.8 多环缓冲区（multiRingBuffer）

1. 将图层 A 所有几何 `unary_union` 合并。
2. 对 `distances` 排序后逐级执行 `merged.buffer(dist, resolution=64)`。
3. 相邻两级缓冲做 `difference` 得到中空环（甜甜圈拓扑）：第一环 = buffer(d₁) − 原始几何，第 i 环 = buffer(dᵢ) − buffer(dᵢ₋₁)。
4. 每个环输出为独立 Feature，属性含 `ring_index` 和 `distance_m`。

## 7. STRtree 空间索引

`aggregation.py` 使用 Shapely 2.x 的 `STRtree`（Sort-Tile-Recursive R-tree）：

```python
from shapely import STRtree

tree = STRtree(points)
candidate_indices = tree.query(cell, predicate="contains")
```

- 构建阶段：将所有点几何批量插入 R-tree，O(n log n)。
- 查询阶段：对每个网格单元做空间谓词查询（`contains`），仅返回被该网格完全包含的点索引。
- 相比逐点遍历的 O(n×m)，STRtree 将聚合查询降至 O(n log n + m log n)，对万级点 × 千级网格场景有数量级提升。

## 8. 安全上限与异常处理

| 机制 | 说明 |
|------|------|
| `MAX_GRID_CELLS = 100000` | 渔网/聚合分析的网格数量硬上限，超出返回 400 |
| Pydantic 字段约束 | `radius` ∈ [0.001, 1000000]，`tolerance` ∈ [0.1, 100000]，`grid_size` ∈ [1, 1000000] |
| ValueError → HTTP 400 | 业务逻辑错误（无有效几何、参数缺失、格数超限等） |
| Exception → HTTP 500 | 未预期异常，记录 `exc_info` 日志 |
| 前端 30s 超时 | `apiSpatialAnalysis` 设置 `timeout: 30000`，重计算操作给予充足时间 |

## 9. 前端调用链路

`SpatialAnalysisPanel.vue` 是纯 UI 层，通过 `emit('analysis', params)` 将用户操作传递给父组件，父组件调用 `useSpatialAnalysis.js` 的 `runSpatialAnalysis(params)`：

1. **参数校验**：检查目标图层、bbox、距离数组等必填项。
2. **要素序列化**：`getLayerFeatures(layerId)` 从 OL 图层取 Feature，`featuresToGeoJSON()` 转为 EPSG:4326 GeoJSON。
3. **API 调用**：组装 payload 调用 `apiSpatialAnalysis()`。
4. **结果渲染**：`geoJSONToFeatures()` 将结果转回 OL Feature（EPSG:3857），`createManagedVectorLayer()` 创建新矢量图层并自适应视图。
5. **特殊处理**：渔网分析不需要输入图层，结果可能包含 `center_points` 子图层；几何简化额外显示节点压缩率。

## 10. 技术栈

| 组件 | 版本/说明 |
|------|-----------|
| Shapely | 2.x（使用 `from shapely import STRtree` 新式导入、`shapely.ops.voronoi_diagram`） |
| pyproj | Transformer API，`always_xy=True`，`lru_cache` 缓存实例 |
| FastAPI | 异步路由，Pydantic v2 模型校验 |
| GEOS | Shapely 底层 C 库，提供 buffer/union/intersection/voronoi 等几何运算 |
| OpenLayers | 前端地图引擎，GeoJSON 格式器负责 3857↔4326 转换 |

## 11. 局限与升级方向

**现有局限：**

1. **Web Mercator 高纬度形变**：EPSG:3857 是等角投影，面积形变随纬度升高急剧增大（60°N 处面积放大约 4 倍）。缓冲区、聚合网格在高纬度地区的实际地面距离/面积与参数标称值存在显著偏差。
2. **平面近似**：所有运算在投影平面上执行，不考虑椭球面曲率。跨越大经度范围（如全球尺度）的分析结果不可靠。
3. **单线程同步计算**：所有操作在 FastAPI 的 async 函数中同步执行（无 `run_in_executor`），大几何量时阻塞事件循环。
4. **无增量/流式处理**：每次请求需将全部要素序列化传输，无分页、无缓存、无增量更新机制。
5. **Voronoi 无权重**：当前为标准 Voronoi（等权重），不支持加权泰森多边形或自然邻域插值。
6. **聚合仅统计点数**：`STRtree.query` 仅做 contains 计数，不支持属性聚合（求和、均值等）。

**升级方向：**

1. 引入局部投影（如 UTM 分区）或椭球面算法（GeographicLib / pyproj geodesic）替代全局 3857，消除高纬度形变。
2. 将重计算操作放入线程池（`asyncio.to_thread`）或 Celery 任务队列，避免阻塞。
3. 支持属性聚合：在 STRtree 查询结果上叠加属性统计（sum/mean/max），实现真正的空间统计。
4. 增加更多算子：空间连接（spatial join）、最近邻分析、密度估计（KDE）、网络分析等。
5. 大几何量场景引入 GeoParquet / PostGIS 后端，支持流式读取与数据库级空间索引。
6. 前端增加分析进度反馈（WebSocket / SSE），替代当前的"提交后等待"模式。
