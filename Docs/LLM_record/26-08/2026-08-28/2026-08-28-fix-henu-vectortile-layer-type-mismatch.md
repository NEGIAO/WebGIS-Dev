# 修复 HENU 边界矢量瓦片在 OL 中渲染空白（图层类型与 source 类型错配）

## 日期和时间

2026-08-28（会话内完成）

## 修改内容

- `basemapLayerFactory.js` 新增共享助手 `applyBasemapSourceToLayer()`：底图 source 挂载前做图层类型校验，VectorTileSource 必须挂 VectorTileLayer、raster source 挂 TileLayer；类型一致走轻量 `setSource`，不一致按旧图层 visible/zIndex/opacity 重建图层实例并替换。
- `useMapState.js` 的 `ensureLayerSourceById` 改用助手：修复"TileLayer 挂 VectorTileSource"导致的渲染空白（根因点）。
- `useBasemapStateManagement.js` 的 `refreshAllBasemapSourcesForHD()`：删除"一律跳过矢量瓦片"分支与"本系统暂无矢量瓦片"错误注释，改为类型安全挂载；新增 `mapInstanceRef` 依赖注入以支持图层实例替换。
- `MapContainer.vue`：`createBasemapStateManagementFeature` 注入 `mapInstanceRef`（一行）。

## 修改原因

HENU 边界矢量（`vector_henu_border_pbf`）是系统唯一的**真矢量瓦片**（ArcGIS VectorTileServer，MVT/PBF）。已实测排除网络/数据层因素：瓦片 HTTP 200、起始字节 `1a f1 13` 合法 MVT（图层名"国界线"）、无 gzip 编码、CORS 头正常、512px 瓦片网格与 OL 默认 VectorTile 网格（tileSize 512、origin 左上角、标准 LOD）完全吻合。

渲染空白的根因是**图层类型与 source 类型错配**：
1. 启动引导（useBasemapLayerBootstrap.js:42-47）：图层初始不可见时 `source=null`，`createBasemapLayerFromSource(null)` 中 `isVectorTileSource(null)=false`，创建的是 raster 型 **TileLayer**。
2. 切换挂载（useMapState.js:746-748 `ensureLayerSourceById`）：切到该底图后 `cfg.createSource()` 产出 **VectorTileSource**，直接 `layer.setSource()` 挂到 TileLayer 上。
3. OL 的 `TileLayer` 渲染器只认 image 瓦片，VectorTileSource 的要素瓦片无 image 可画 → **有网络请求、无画面**。

同型隐患：`refreshAllBasemapSourcesForHD()` 也无条件 `setSource()`，HD 开关翻转后同样破坏该图层；且其"矢量瓦片跳过"分支基于"系统暂无矢量瓦片"的错误假设（custom 自定义图层路径早在 useLayerControlHandlers.js:296-311 修过同类问题，预设图层路径漏改）。

## 影响范围

- OL 底图链路：底图切换（switchLayerById → refreshLayerInstances → ensureLayerSourceById）、HD 高清开关刷新（refreshAllBasemapSourcesForHD）。
- 受影响图层：`vector_henu_border_pbf`（真矢量瓦片）；其余全部底图为 wms/wmts/xyz raster，行为不变。
- 不涉及：Cesium 侧（3D 不支持 PBF 矢量瓦片，`basemapProviderFactory.ts` 的 vector-tile 跳过属引擎能力限制，保留）。

## 优化解决方案

1. **助手单点收口**：`applyBasemapSourceToLayer({ layer, source, map })` 统一类型校验——`isVectorTileSource(source) === isVectorTileLayer(layer)` 时轻量 `setSource`；不一致时以 `createBasemapLayerFromSource` + 旧图层状态（visible/zIndex/opacity）重建图层实例并返回，由调用方执行 `map.removeLayer/addLayer + instanceMap[id] 替换`（与 useLayerControlHandlers.replaceLayerInstance 同款模式）。
2. **ensureLayerSourceById 接入**：重建后的实例同步写回 `instanceMap`，后续 refreshLayerInstances 读取到正确类型的图层。
3. **HD 刷新接入**：`refreshAllBasemapSourcesForHD` 移除矢量跳过分支，遍历统一走助手；VectorTileLayer 上重建 source 正常生效（OL VectorTileLayer 渲染器读取 `source.zDirection`，已在 node_modules/ol/renderer/canvas/VectorTileLayer.js 验证），HD 开启时真矢量瓦片同样按 finer-zoom 取瓦，行为统一。
4. **容错**：助手对 null source、缺失 map 实例均安全降级（仅 setSource / 不替换）。

## 性能指标

- 类型一致路径（绝大多数底图）开销零变化（一次 `instanceof`/属性比较）。
- 类型不一致仅在首次挂载/替换时发生一次 map.removeLayer/addLayer，无持续性开销。

## 测试方案

1. 静态：`npx eslint` 四个改动文件无错误。
2. 运行时（view=ol）：
   - 切换底图到"HENU边界矢量" → Network 面板出现 `Border_Vector/VectorTileServer/tile/**/*.pbf` 请求（状态 200），地图出现边界线渲染（此前为空白）；
   - 翻转 HD 山形图标开关 → 图层仍正常渲染（不再因 setSource 错配而空白）；
   - 切走（如天地图）再切回 → 仍正常；
   - 回归：其他栅格底图（天地图/Google/OSM）、注记图层、卷帘对比、自定义 URL 底图行为不变。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\ol\basemap\composables\basemapLayerFactory.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\ol\composables\useMapState.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\ol\basemap\composables\useBasemapStateManagement.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\ol\components\MapContainer.vue`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`（版本记录 V3.5.35）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`（V3.5.35 条目）
