# HENU 矢量瓦片接入服务端样式（Mapbox Style → OL Style 轻量适配器）

## 日期和时间

2026-08-28（V3.5.34 同日更新；整合 Code Review 后版本归并，原临时编号 V3.5.35 并入单一版本 V3.5.34）

## 修改内容

- 新增 `frontend/src/domains/ol/basemap/composables/vectorTileStyleAdapter.js`：矢量瓦片服务端样式适配器。
  - `deriveArcgisVectorTileStyleUrl()`：从瓦片 URL 模板推导 ArcGIS VectorTileServer 样式地址（`.../VectorTileServer/resources/styles/root.json`）；
  - `matchesMapboxFilter()`：最小化 Mapbox filter 表达式求值（==/!=/</<=/>/>=/all/any/none，未知操作符宽松放行）；
  - `createVectorTileStyleFunction()`：将样式 JSON 编译为 OL StyleFunction，支持 line（line-color/line-width/line-dasharray/line-cap/line-join）、fill（fill-color/fill-opacity）、circle（circle-radius/circle-color/circle-stroke-*）三类基础 paint；按要素 `'layer'` 属性（OL MVT 默认 source-layer 存储键）匹配 source-layer + filter，命中多条样式时按样式顺序叠加返回 Style 数组；未命中要素回退通用兜底样式，保证不丢要素。
- `basemapLayerFactory.js` 的 `createVectorTileBasemapLayer`：创建图层后异步拉取服务端样式，成功则 `layer.setStyle()` 应用，失败/超时保持通用兜底样式渲染（不阻塞、不报错）。

## 修改原因

上一修复（图层类型错配）落地后矢量瓦片已能加载，但图层使用的是工厂内置**通用兜底样式**（蓝点/绿线/青多边形），未解析并应用 ArcGIS VectorTileServer 下发的 Mapbox 样式（`resources/styles/root.json`）。实测该服务样式：7 条图层均为 `line` 类型（source-layer "国界线"，按 `_symbol` 0/1/2 区分已定国界线/未定国界线/沿海界线），paint 含 line-color、line-width、line-offset、line-dasharray——期望渲染出"黑色主线 + 紫色晕线 + 浅色宽晕"的专业边界效果，未定国界为虚线。

## 影响范围

- 仅 OL 侧矢量瓦片图层的样式渲染链路（系统唯一矢量瓦片：`vector_henu_border_pbf`）。
- 不引入任何新 npm 依赖（项目无 ol-mapbox-style，按规范自研轻量适配）。
- Cesium 侧不受影响（不支持 PBF）。

## 优化解决方案

1. **依赖评估**：项目无 ol-mapbox-style 且不新增依赖，服务样式结构简单（纯 line 图层、常量 paint），轻量自研适配器可完整覆盖。
2. **渐进增强**：图层创建即用兜底样式渲染（零等待），服务端样式 fetch 成功后无缝切换 setStyle；任何网络/解析异常静默降级回兜底，不影响可用性。
3. **性能**：样式对象在解析期一次性编译缓存（静态常量 paint 无需逐帧重建），渲染期仅做 filter 求值与数组引用返回。
4. **明确的能力边界**：不支持 symbol/text（需 sprite 精灵图与 glyphs 字体 pbf 加载管线）、不支持 paint 表达式（interpolate 等数组形式，跳过该条并回退）、line-offset（OL Stroke 无对应能力）忽略——当前服务均未用到，不会影响实际效果；未来接入复杂样式服务时建议引入 ol-mapbox-style。

## 性能指标

- 首帧渲染零延迟（兜底样式先行）；样式切换一次性，7 条样式编译 <1ms。
- 渲染期开销：每要素每帧 O(命中样式数) 的数组查找与 filter 求值，当前 7 条规模可忽略。

## 测试方案

1. 静态：eslint 新文件 + 改动文件；vite build 通过。
2. Node 单测：直接导入适配器，用 mock 要素验证 filter 求值、source-layer 匹配、多样式叠加、未命中回退逻辑。
3. 运行时（view=ol）：切换到"HENU边界矢量" → 先显示兜底样式，随后切换为服务端样式（黑色主线、未定国界虚线、紫色晕圈）；断网/样式接口异常时保持兜底样式不报错。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\ol\basemap\composables\vectorTileStyleAdapter.js`（新增）
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\ol\basemap\composables\basemapLayerFactory.js`
- `D:\Dev\GitHub\WebGIS-Dev\README.md` / `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`（V3.5.35 条目合并本更新）
