# V3.4.94 前端 domains 架构 Phase 8：Cesium 域 stores/utils/constants 下沉

## 日期与时间

2026-07-29 00:00

## 任务等级

L3 架构级

## 问题分析

### 核心症状

Phase 1-7 完成后，Cesium 域专属的 stores（cesiumLayers、cesiumLayerNodeBuilder）、utils（cesiumFxRuntime）、constants（cesiumProviderFactory）仍留在根级目录（stores/layer/、utils/echarts/、constants/basemap/），未与 OL / Common 建立清晰的域边界。

### 根本原因

Phase 1-7 主要处理 Cesium 组件、composables、modules、vendors 的迁移，未涉及 stores/utils/constants 的域归属整理。

### 受影响模块

- `frontend/src/stores/layer/cesiumLayers.ts`
- `frontend/src/stores/layer/cesiumLayerNodeBuilder.ts`
- `frontend/src/utils/echarts/cesiumFxRuntime.js`
- `frontend/src/constants/basemap/cesiumProviderFactory.ts`
- `frontend/src/domains/cesium/components/CesiumContainer.vue`
- `frontend/src/domains/cesium/components/CesiumToolPanel.vue`
- `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js`
- `frontend/src/domains/cesium/composables/core/useCesiumNavigation.js`
- `frontend/src/domains/cesium/composables/layers/useCesiumUrlTracking.js`
- `frontend/src/domains/cesium/composables/toolModules/cloudModule.js`
- `frontend/src/domains/cesium/composables/toolModules/useCesiumToolModules.js`
- `frontend/src/domains/cesium/modules/fluid-simulation/FluidSimulationPanel.vue`
- `frontend/src/domains/cesium/modules/player-controller/NavGuideHUD.vue`
- `frontend/src/domains/cesium/composables/dataImport/loaders/utils.js`
- `frontend/src/domains/cesium/composables/dataImport/loaders/kmlLoader.js`
- `frontend/src/composables/useLayerDataImport.js`
- `frontend/src/domains/common/layer-tree/components/TOCTreeItem.vue`
- `frontend/src/composables/useTileSourceFactory.ts`
- `frontend/src/domains/ol/data-import/composables/useLayerDataImport.js`
- `Docs/Guide/frontend-structure.md`
- `README.md`
- `Docs/Guide/CHANGELOG.md`

## 修改内容

1. 迁移 Cesium 专属 stores 到 `domains/cesium/stores/`
2. 迁移 Cesium 专属 utils 到 `domains/cesium/utils/`
3. 迁移 Cesium 专属 constants 到 `domains/cesium/constants/`
4. 更新所有引用这些文件的 import
5. 同步 frontend-structure.md
6. 版本号 V3.4.91 → V3.4.94（注：V3.4.92/93 由 Agent B 占用）
7. CHANGELOG 追加 V3.4.94 条目

## 修改原因

解决 Cesium 域 stores/utils/constants 仍在根级目录的问题，建立完整的三维领域内部结构。

## 影响范围

- Cesium 3D 场景加载
- 工具面板
- 数据导入
- 文档结构树与版本记录

## 解决方案

执行 Refactor.md Phase 8 的 Cesium 域部分。

## 性能指标

未实测。本阶段为目录结构与 import 迁移，预期不改变运行时性能。

## 测试方案

| 类型 | 内容 |
|---|---|
| Agent 已执行 | 前端构建通过；CheckStructureTree.py 通过（401/401）；CheckConfigRegistry.py 通过 |
| 待用户实机验证 | 打开 3D 场景，验证底图 / 地形 / 工具面板 / 数据导入 / 图表运行时是否正常 |

## 变更文件清单

- `frontend/src/domains/cesium/stores/cesiumLayers.ts`（从 `stores/layer/` 迁入）
- `frontend/src/domains/cesium/stores/cesiumLayerNodeBuilder.ts`（从 `stores/layer/` 迁入）
- `frontend/src/domains/cesium/utils/echartsFxRuntime.js`（从 `utils/echarts/` 迁入）
- `frontend/src/domains/cesium/constants/basemapProviderFactory.ts`（从 `constants/basemap/` 迁入）
- `frontend/src/stores/useLayerStore.ts`（更新 import）
- `frontend/src/domains/cesium/layers/toc-adapters/cesiumTocActions.js`（更新 import）
- `frontend/src/domains/cesium/components/CesiumToolPanel.vue`（更新 import）
- `frontend/src/domains/cesium/components/CesiumContainer.vue`（更新 import）
- `frontend/src/components/Layer/TOCPanel.vue`（更新 import）
- `frontend/src/constants/basemap/index.ts`（移除 cesiumProviderFactory 导出）
- `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js`（更新 import）
- `frontend/src/composables/useTileSourceFactory.ts`（更新 import）
- `frontend/src/domains/ol/data-import/composables/useLayerDataImport.js`（更新 import）
- `Docs/Guide/frontend-structure.md`（同步 stores/utils/constants 子树）
- `README.md`（版本号三处更新）
- `Docs/Guide/CHANGELOG.md`（追加 V3.4.94 条目）
- `Docs/LLM_record/26-07/2026-07-29/2026-07-29-v3494-frontend-domains-phase8.md`（本日志）

## 遗留与风险

- `stores/layer/` 仍保留 layerHelpers.ts、layerTreeBuilder.ts、index.ts（属于 OL/Common 域，待后续阶段处理）
- `utils/echarts/weatherRuntime.js` 仍留在根级（属于 Common 域）
- `constants/basemap/` 仍保留 basemapConfig.ts、basemapPresets.ts 等（属于 Common 域）
- terrain worker 路径需实机验证
- lazy import 路径需实机验证
