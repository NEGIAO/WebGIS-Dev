# OpenLayers 高清瓦片渲染：偏向上层取瓦 + 512 瓦片适配

## Context（为什么做这件事）

当前 OL 底图链路在两处有清晰度缺陷：

1. **fractional zoom 取下层瓦片导致模糊**：Map View 为 `minZoom:0 / maxZoom:22` 且未设 `resolutions`/`constrainResolution`（[MapContainer.vue:1552-1557](frontend/src/components/Map/MapContainer.vue#L1552-L1557)）。当视图处于 z=14.5 时，OL 默认取 **z=14** 瓦片并放大渲染 → 模糊。用户明确要求**牺牲性能**，改为取 **z=15** 瓦片并缩小渲染，以换取清晰度，做成**用户可选的全局开关**。

2. **512 瓦片（`@2x`）被当 256 处理（bug）**：新增的 MapTiler HD 图源 `imagery_maptiler_satellite_hd` 用 `satellite-v4/256/{z}/{x}/{y}@2x.jpg`（[basemapConfig.ts:347](frontend/src/constants/basemap/basemapConfig.ts#L347)），瓦片实际像素是 **512×512** 叠在 256 瓦片网格上。但 builders 全程 `new XYZ({ url })` **未传 `tilePixelRatio`**（仅 MFF 非标准适配器硬编码了 `tilePixelRatio:1`，[xyzSource.ts:97](frontend/src/composables/tileSource/xyzSource.ts#L97)），导致 HD 瓦片被按 256 拉伸渲染、错位糊化。这是真 bug，必须修。

两条任务互不依赖、互不冲突：512 修的是"瓦片像素元信息缺失"，取上层修的是"层级选择策略"。可独立实施、独立验证。

## 机制关键点（落地依据）

- OL 的 `tileLoadFunction` / `tileUrlFunction` 接受 `tileCoord=[z,x,y]`；OL 自身按 View 当前 resolution 决定请求哪一层。让 OL"偏向上层"的正道是**给 source 一个 `tileGrid`，其第 N 项 resolution 高于 view 在该 zoom 的 resolution**——OL 会向上找最匹配的层级取瓦。但更省事且符合用户"不在乎性能"诉求的做法是：**给 source 套一层自定义 `tileUrlFunction`，强制把请求层级 +1**（`z' = z+1`，并对同级 tile 坐标做 `2x + offset` 换算），瓦片数 ×4 但渲染时缩小，画面清晰。注意：单纯设 `maxZoom` 不行，那只决定上限，不改变 fractional zoom 的取数方向。
- 512 适配：OL 的 `tilePixelRatio` 告诉渲染器"一张瓦片图像含 N×像素"，`new XYZ({ url, tilePixelRatio: 2 })` 即可让 512 瓦片正确还原为 256 网格的清晰度，**不增加请求数**。这是与"取上层"完全独立的修复。

## 任务 1：512 瓦片适配（`tilePixelRatio`）

最小、最确定的修复。HD 图源是显式声明的，直接在工厂里给它 `tilePixelRatio:2`。

- 文件：`frontend/src/constants/basemap/basemapConfig.ts`
- 给 `imagery_maptiler_satellite_hd` 的 `new XYZ({...})` 增加 `tilePixelRatio: 2`。
- 文件：`frontend/src/constants/basemap/sourceDescriptors.ts`
  - 给 `TileSourceDescriptor` 增加 `tilePixelRatio?: number` 字段（Cesium 侧 `cesiumProviderFactory.ts` 用到这个描述符，保持双引擎一致）。
  - 给 `imagery_maptiler_satellite_hd` 描述符标 `tilePixelRatio: 2`。
- 在 [xyzSource.ts](frontend/src/composables/tileSource/xyzSource.ts) 的 `createXyzSourceStrict` / `createXYZSourceFromUrl` 中支持读 `options.tilePixelRatio` 透传给 `new XYZ(...)`（默认不传，沿用 OL 默认）——为今后其它 HD 图源留扩展点，本次只 HD 这一条用到。

> 说明：这个修复**不要再加 tileGrid/resolutions**，单一 `tilePixelRatio` 足矣；不要影响其它 79 个图源。

## 任务 2：全局"高清渲染"开关（牺牲性能偏向上层取瓦）

一个全局 ref（持久化到 localStorage），用户在底图面板切换；开启时所有 raster 底图 source 进入"偏上层"模式。

### 2a. 开关状态
- 新文件：`frontend/src/composables/map/features/useTileHDRendering.js`
  - 导出 `tileHDRendering`（`ref<boolean>`，默认 false，键名 `webgis:tileHDRendering`）+ `toggleTileHDRendering()`。
  - 单一职责，纯状态 composable，参考现有 `useMessage`/`useBasemap*` 风格。
- 在 [basemapSystem.js](frontend/src/composables/map/basemapSystem.js) 末尾 re-export 该 composable，保持 barrel 风格一致。

### 2b. 开关 UI
- 位置：`frontend/src/components/Layer/LayerControlPanel.vue`，第 10 行 `<div class="layer-label">选择底图</div>` 改为 `底图`（四字→两字），第 391 行 fallback 文案 `'选择底图'` 同步改为 `'底图'`。
- 腾出的横向空间内、紧邻 `.layer-label` 同行（或同段右侧）放一个紧凑的 hd 开关（如 el-switch + 一个小图标/标签"HD"）。
- 用 hover tooltip 完整说明："高清渲染：牺牲性能与流量，请求上一瓦片层级并缩小渲染，换取清晰度。"——避免常驻文案占空间。Hover 提示：原生 `title` 属性或项目既有 tooltip 组件（grep 确认是否有 `el-tooltip` 在用，优先复用）。
- 绑定 `tileHDRendering`（from `useTileHDRendering`）。

### 2c. 取上层逻辑（核心）
- 在 [basemapLayerFactory.js](frontend/src/composables/map/features/basemapLayerFactory.js) 的 `createRasterBasemapLayer` 里，当 `tileHDRendering.value === true` 时，把传入的 source 重新包装一层"超采样 tileGrid / tileUrlFunction"，使其请求 `z+1` 层瓦片并向其同层坐标换算；关闭时回落到原生 source。
  - 推荐实现：用 `tileUrlFunction((tileCoord, pixelRatio, projection) => 原 urlFunction([tileCoord[0]+1, Math.floor(tileCoord[1]/2), Math.floor(tileCoord[2]/2)], ...))` 配合 source 已有 `tileUrlFunction` 或 `url` 模板。
  - 同时给换算后的 source 一个 `tileGrid`，其 resolutions 数组整体下移一级（`shift` 掉最高级，最低级补入更细一档），以保证 fractional zoom 也偏左取数。
  - 复用现有 `prioritizeTileSourceRequest`（[tileLifecycle.ts:192](frontend/src/composables/tileSource/tileLifecycle.ts#L192)）继续包裹，不破坏 abort/代理兜底机制。
- VectorTile 图层（`createVectorTileBasemapLayer`）**不**改——矢量瓦片本身可缩放，无此模糊问题。

### 2d. 动态生效
开关切换时需让已建图层重新取 source。复用现有 `abortTileSourceRequests` + 重新触发 bootstrap 的路径：
- 切换 toggle 时，遍历当前 raster 底图图层，`layer.setSource(当前 definition.createSource(context) 重包装后的 hd-source)`；先 `abortTileSourceRequests(旧 source)` 释放连接，再 `setSource`，避免内存/连接泄漏。
- 找到现有"切换底图预设"已用的 source 替换流程（grep `setSource` / `useBasemapStateManagement.js:109`）对齐其调用约定，确保走同一条 re-attach 逻辑。

### 2e. Cesium 侧（保持双引擎一致）
- Cesium 侧描述符 `TILE_SOURCE_DESCRIPTORS` + `cesiumProviderFactory.ts` 已用 `descriptor.maxZoom || 18` 这类字段。本次"高清"开关在 Cesium 侧暂不必带 512/取上层的等价逻辑（Cesium 的 ` UrlTemplateImageryProvider` 默认按 256 网格，若有 512 需求单独按 `tileWidth/tileHeight` 处理）。计划里只把 `tilePixelRatio` 字段同步进描述符，**不**在 Cesium 侧实现取上层开关；若用户后续要 Cesium 等价再单开任务。

## 不做的事 / 边界
- 不全局加 `preload`（用户没要、会预取相邻层，与"取上层"叠加反而更费流量，留待后续）。
- 不改 View 的 `maxZoom`/`resolutions`/`constrainResolution`——取上层改在 source 侧，view 维持现状，避免影响非底图图层（如 OL 上挂载的其它业务图层）。
- 不动 MFF 适配器已有的 `tilePixelRatio:1`（那是 256 瓦片、显式锁 1，正确）。

## 验证

1. **512 修复**：
   - 切到底图预设 `imagery_maptiler_satellite_hd_preset`，对比开关前后瓦片清晰度与定位。预期：开启后瓦片边界锐利、地理套合正确（不再因 512 被当 256 而偏移糊化）。滚动缩放 z≈10-14 范围观察。
   - DevTools Network 查看请求 URL 仍含 `@2x`，且每张瓦片实际尺寸 512×512。
2. **高清开关**：
   - 默认关：取下层（z=14.5 视图请求 z=14），与现状一致。
   - 开启：z=14.5 视图应请求 z=15 瓦片（Network 里看 `{z}` 实际为 15），画面缩小渲染明显更锐利。
   - 切换开关后旧 source 的 fetch 被 abort（`prioritizeTileSourceRequest` 的 `abortController`），无残留 pending 请求（Network 里无挂起 30s+ 的被墙瓦片）。
   - 开关切换底图后回到 HD 仍正常（re-attach 正确）。
3. **回归**：开关全程关闭时，行为与本次改动前完全一致（80 个图源逐一抽查验基础加载即可，重点验 Google/天地图/ESRI 三类）。
4. 类型：`basemapConfig.ts` / `sourceDescriptors.ts` / `xyzSource.ts` 为 TS，改动后跑 `npm run build` / vue-tsc 无新增 ts 报错（CLAUDE.md 准则 6 强制）。

## 涉及文件
- `frontend/src/constants/basemap/basemapConfig.ts`（HD 源加 `tilePixelRatio:2`）
- `frontend/src/constants/basemap/sourceDescriptors.ts`（新增 `tilePixelRatio` 字段 + HD 标注）
- `frontend/src/composables/tileSource/xyzSource.ts`（`createXYZSourceFromUrl` 支持 `tilePixelRatio` 透传）
- `frontend/src/composables/map/features/useTileHDRendering.js`（新增状态 composable）
- `frontend/src/composables/map/basemapSystem.js`（re-export）
- `frontend/src/composables/map/features/basemapLayerFactory.js`（取上层包装 + re-attach 支持）
- 底图 UI 面板组件（grep `BASEMAP_PRESETS` 消费处定位后补充开关）
- （可选）`frontend/src/composables/map/features/useBasemapStateManagement.js`（对齐现有 setSource 流程）
- 维护日志 `Docs/26-07/26-07-04/2026-07-04-ol-hd-tile-rendering.md` + 三个 README 树同步（新增 `useTileHDRendering.js` 文件需入树）
