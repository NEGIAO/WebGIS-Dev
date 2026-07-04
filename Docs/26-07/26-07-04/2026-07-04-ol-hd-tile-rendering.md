# OpenLayers 高清瓦片渲染：512 修复 + zDirection 偏上层取瓦开关

## 日期和时间
2026-07-04 15:40（初版）；2026-07-04 修订（zDirection 方案替换 shifted grid）

## 修改内容
两项独立的清晰度增强，针对 OL 底图渲染链路：

1. **512 / @2x 瓦片适配（bug 修复）**：MapTiler 影像 HD 图源 (`imagery_maptiler_satellite_hd`) 使用 `satellite-v4/256/{z}/{x}/{y}@2x.jpg`，瓦片实际像素 512×512 叠在 256 网格上。原 factories 全程 `new XYZ({ url })` 未传 `tilePixelRatio`，导致 HD 瓦片被按 256 拉伸渲染、糊化与地理套合错位。修复：显式 `tilePixelRatio: 2`。

2. **全局"高清渲染"开关（性能换清晰）**：新增用户可切换的全局开关，开启后 raster 底图 source 设置 `zDirection = -1`，OL 渲染器在 fractional zoom（如 z=14.6）时自动取更高 zoom 层级（z=15）的瓦片并缩小渲染，瓦片数 ×4 换取清晰度。默认开启，用户可手动关闭。

## 修改原因
- 用户反馈中间 zoom 层级底图糊化，并明确接受"牺牲性能、不在乎流量"以换取清晰度。OL 默认 `zDirection=0`（最近邻），在 fractional zoom 刚超过整数级时（如 z=14.1）仍取 z=14 瓦片放大渲染，清晰度损失明显。
- HD 图源的 512 渲染错位是接入 MapTiler HD 时遗留的真 bug（前序任务 [2026-07-04-maptiler-tiles-add.md](./2026-07-04-maptiler-tiles-add.md) 未覆盖此维度）。

## 影响范围
- 底图图层工厂 `basemapLayerFactory.js`：raster 分支 `buildRasterBasemapSource` 在 HD 开启时设置 `source.zDirection = -1`。
- 底图状态管理 `useBasemapStateManagement.js`：`refreshAllBasemapSourcesForHD()` 开关翻转时重建所有 raster source（VectorTile 跳过）。
- 底图配置 `basemapConfig.ts` / 引擎无关描述符 `sourceDescriptors.ts`：HD 图源加 `tilePixelRatio: 2`，描述符类型新增 `tilePixelRatio?` 字段。
- 瓦片源工厂 `xyzSource.ts` / `types.ts`：`createXYZSourceFromUrl` 支持 `tilePixelRatio` 透传。
- 新增 composable `useTileHDRendering.js`（开关状态 + localStorage 持久化）。
- `LayerControlPanel.vue`：底图面板"选择底图"缩为"底图"，右侧新增 HD 图标开关（SVG 符号 + hover tips），无文字。
- `MapContainer.vue`：引入 `tileHDRendering` + `watch` 联动重组 source。
- `basemapSystem.js`：re-export HD 状态。

## 优化解决方案

### 机制：OL 内置 zDirection 属性
OL 10.5.0 的 `Tile` source 基类（`ol/source/Tile.js:125`）有一个 `zDirection` 属性，渲染器在主渲染路径（`ol/renderer/canvas/TileLayer.js:606`）直接读取：

```js
const z = tileGrid.getZForResolution(viewResolution, tileSource.zDirection);
```

`getZForResolution` 调用 `linearFindNearest(resolutions, target, direction)`（`ol/array.js:86`）：

- `direction = 0`（默认）：最近邻——比较 target 到相邻两级 resolution 的线性距离，取更近的那级。由于 resolution 指数递减，z=14.1 时 target 离 R14 更近，选 z=14（放大渲染 → 模糊）。
- `direction = -1`：只要视图 resolution 低于某级 resolution（即视图 zoom 超过该整数级），直接选下一级。z=14.01 → 选 z=15，z=14.99 → 选 z=15。整数级 z=14.0 → 选 z=14（`arr[14] <= target` 恰好命中）。
- `direction = 1`：总是取更粗的那级。

**设 `zDirection = -1` 即可实现"偏上层取瓦"**，无需自定义 tileGrid 或 tileUrlFunction。

### 为什么放弃初版的 shifted grid 方案
初版用 `shiftedResolutions[i] = stdRes[i+1]` + `tileUrlFunction` z→z+1 的方案，但经 OL 源码验证发现不生效：shifted grid 只重新编号了 index，resolution 值不变，`linearFindNearest` 按 direction=0 计算的线性距离和 shifted 前完全一样，OL 仍然选同一级 resolution，最终 `z = shiftedIndex + 1` 又加回到原来的 z，等价于无操作。

### 实施步骤
1. 修复 512：三处加 `tilePixelRatio: 2` / 透传字段，零流量代价。
2. `useTileHDRendering.js`：`ref<boolean>` + localStorage 持久化 + `toggleTileHDRendering()`。
3. `basemapLayerFactory.js` 的 `buildRasterBasemapSource`：HD 开启时 `rawSource.zDirection = -1`，一行搞定。
4. `useBasemapStateManagement.js` 加 `refreshAllBasemapSourcesForHD()`：遍历 `layerInstances`，用 `isVectorTileSource` 跳过矢量层，旧 source 先 `abortTileSourceRequests` 再 `setSource` 新源。
5. `MapContainer.vue` 加 `watch(tileHDRendering)` 触发重组 + `mapInstance.render()`。
6. UI：`LayerControlPanel.vue` 把 layer-label 行改为 flex 行，"选择底图"→"底图"，右侧 16×16 SVG 山画图标做 HD 开关，`title` 属性 hover 显示完整说明，开启时图标变天蓝色高亮。

## 性能指标
- 512 修复：零性能代价（仅像素比声明）。
- 高清开关开启：稳态约 **4× 瓦片数 / 流量**（每升一级瓦片数 ×4）；CPU/带宽上升，请求并发槽位压力上升。开关默认开，用户可手动关闭以恢复标准渲染。
- 开关切换瞬时：旧 source 的所有 fetch 被 abort（释放 TCP），无挂起请求泄漏。

## 测试方案
1. **512 修复**：底图预设切到 `imagery_maptiler_satellite_hd_preset`，z≈10-14 滚动缩放，对比瓦片边界锐度与地理套合。DevTools Network 确认 URL 含 `@2x`，单瓦片实尺寸 512×512。
2. **高清开关**：
   - 默认开，z=14.15 视图请求 z=15（偏上层取瓦生效）。
   - 手动关闭后，同一视图 Network 中 `{z}` 回落到 z=14（最近邻）。
   - z=14.01（刚超过整数级）也应请求 z=15（zDirection=-1 的核心行为）。
   - 切换开关瞬间 Network 无 30s+ 挂起请求（旧 fetch 已 abort）。
3. **回归**：开关全程关闭时与改动前行为完全一致（抽验 Google/天地图/ESRI 三类）。
4. **类型/lint**：`tsc --noEmit -p tsconfig.json` 仅余 Cesium 模块缺失等既有报错（与本次无关）；`eslint` 改动文件全过。

## 修改的文件路径
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\constants\basemap\basemapConfig.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\constants\basemap\sourceDescriptors.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\tileSource\xyzSource.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\tileSource\types.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useTileHDRendering.js`（新增）
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\basemapLayerFactory.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useBasemapStateManagement.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\basemapSystem.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Layer\LayerControlPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Map\MapContainer.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`（树同步：新增 useTileHDRendering.js）
