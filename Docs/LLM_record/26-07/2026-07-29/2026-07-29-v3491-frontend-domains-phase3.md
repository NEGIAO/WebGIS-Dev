# V3.4.91 前端 domains 架构 Phase 3 Cesium modules/vendors 迁移

## 日期与时间

2026-07-29 00:00

## 任务等级

L3 架构级

## 问题分析

### 核心症状

Phase 2 完成后，Cesium 业务子模块（analysis / cloud / fluid-simulation / shallow-water / player-controller / wind / cesium-navigation）仍留在 `components/Cesium/` 下，未与 OL / Common 建立清晰的领域边界，且 `components/Cesium/` 目录职责继续膨胀。

### 根本原因

Phase 2 仅迁移了 Cesium 入口 Vue 组件、composables、terrain，未处理 Cesium 内部业务模块与第三方内联库。

### 受影响模块

- `frontend/src/components/Cesium/Analysis/`
- `frontend/src/components/Cesium/Cloud/`
- `frontend/src/components/Cesium/FluidSimulation/`
- `frontend/src/components/Cesium/ShallowWater/`
- `frontend/src/components/Cesium/PlayerController/`
- `frontend/src/components/Cesium/cesium-wind-layer/`
- `frontend/src/components/Cesium/cesium-navigation/`
- `frontend/src/domains/cesium/components/CesiumContainer.vue`
- `frontend/src/domains/cesium/composables/index.js`
- `frontend/src/domains/cesium/composables/core/useCesiumNavigation.js`
- `frontend/src/domains/cesium/composables/layers/useCesiumUrlTracking.js`
- `frontend/src/domains/cesium/composables/toolModules/cloudModule.js`
- `frontend/src/domains/cesium/composables/toolModules/useCesiumToolModules.js`
- `frontend/src/domains/cesium/modules/fluid-simulation/FluidSimulationPanel.vue`
- `frontend/src/domains/cesium/modules/player-controller/NavGuideHUD.vue`
- `frontend/src/domains/cesium/composables/dataImport/loaders/kmlLoader.js`
- `Docs/Guide/frontend-structure.md`
- `README.md`
- `Docs/Guide/CHANGELOG.md`

### 候选方案对比

| 方案 | 优点 | 结论 |
|---|---|---|
| 一次性把所有 Cesium 子模块 + vendors 迁入 `domains/cesium` | 一步到位、目录最干净 | 采用 |
| 只迁移业务模块、保留 vendors 在 components/Cesium | 改动小 | 不采用（vendors 仍需归域） |
| 保留 cloud/wind 在 components/Cesium | 改动小 | 不采用（领域边界模糊） |

### 选定方案与理由

采用 Refactor.md Phase 3：业务模块进 `domains/cesium/modules/`，第三方内联库进 `domains/cesium/vendors/`。理由：Cesium 作为完整三维子应用，其内部模块与 vendor 都应纳入 `domains/cesium` 域下，与 OL / Common 平级。

## 修改内容

1. 迁移 7 个 Cesium 子模块至 `domains/cesium/modules` 或 `domains/cesium/vendors`
2. 更新所有引用这些模块的 import（CesiumContainer、composables、toolModules、FluidSimulationPanel、NavGuideHUD、kmlLoader）
3. 同步 frontend-structure.md
4. 版本号 V3.4.90 → V3.4.91
5. CHANGELOG 追加 V3.4.91 条目

## 修改原因

解决 Cesium 模块过深、`components/Cesium` 职责膨胀问题，建立正式三维领域内部结构。

## 影响范围

- Cesium 3D 场景加载
- 工具面板（scene/atmosphere/cloud/wind/fluid/shallow-water/player/analysis 模块）
- 体积云 / 风场 / 流体 / 浅水 / 人物漫游 / 导航控件等功能
- 文档结构树与版本记录

## 解决方案

执行 Refactor.md Phase 3。

## 性能指标

未实测。本阶段为目录结构与 import 迁移，预期不改变运行时性能。

## 测试方案

| 类型 | 内容 |
|---|---|
| Agent 已执行 | 前端构建通过；CheckStructureTree.py 通过（401/401）；CheckConfigRegistry.py 通过 |
| 待用户实机验证 | 打开 3D 场景，验证底图 / 地形 / 工具面板 / 云 / 风场 / 流体 / 浅水 / 人物漫游 / 导航控件 / 分析模块是否正常 |

## 变更文件清单

- `frontend/src/domains/cesium/modules/analysis/*`（从 `components/Cesium/Analysis/` 迁入）
- `frontend/src/domains/cesium/modules/cloud/*`（从 `components/Cesium/Cloud/` 迁入）
- `frontend/src/domains/cesium/modules/fluid-simulation/*`（从 `components/Cesium/FluidSimulation/` 迁入）
- `frontend/src/domains/cesium/modules/shallow-water/*`（从 `components/Cesium/ShallowWater/` 迁入）
- `frontend/src/domains/cesium/modules/player-controller/*`（从 `components/Cesium/PlayerController/` 迁入）
- `frontend/src/domains/cesium/modules/wind/*`（从 `components/Cesium/cesium-wind-layer/` 迁入）
- `frontend/src/domains/cesium/vendors/cesium-navigation/*`（从 `components/Cesium/cesium-navigation/` 迁入）
- `frontend/src/domains/cesium/components/CesiumContainer.vue`（更新 modules/vendors 引用）
- `frontend/src/domains/cesium/composables/index.js`（更新 wind 引用）
- `frontend/src/domains/cesium/composables/core/useCesiumNavigation.js`（更新 vendor 引用）
- `frontend/src/domains/cesium/composables/layers/useCesiumUrlTracking.js`（更新 basemapUrlMapping 引用）
- `frontend/src/domains/cesium/composables/toolModules/cloudModule.js`（更新 cloudQualityPresets 引用）
- `frontend/src/domains/cesium/composables/toolModules/useCesiumToolModules.js`（更新 cloud/wind/analysis 引用）
- `frontend/src/domains/cesium/modules/fluid-simulation/FluidSimulationPanel.vue`（更新 useMessage/useLocale 引用）
- `frontend/src/domains/cesium/modules/player-controller/NavGuideHUD.vue`（更新 formatDistanceMeasure 引用）
- `frontend/src/domains/cesium/composables/dataImport/loaders/kmlLoader.js`（更新 vectorUtils 引用）
- `frontend/src/composables/useLayerDataImport.js`（更新 layer-tree/factory 引用，因 parallel agent 已迁移 map/toc）
- `frontend/src/domains/common/layer-tree/components/TOCTreeItem.vue`（更新 utils/biz 引用，修复 parallel agent 的 TS 警告）
- `Docs/Guide/frontend-structure.md`（同步 modules/vendors 子树）
- `README.md`（版本号三处更新）
- `Docs/Guide/CHANGELOG.md`（追加 V3.4.91 条目）
- `Docs/LLM_record/26-07/2026-07-29/2026-07-29-v3491-frontend-domains-phase3.md`（本日志）

## 遗留与风险

- `components/Cesium/` 已清空，但其历史 git 记录仍保留
- Phase 6（Layer/TOC 拆分）由 parallel agent 并行推进，本阶段未处理
- Phase 4/5（Common Shell/Home、OL 地图核心）由 parallel agent 并行推进，本阶段未处理
- parallel agent 留下的 stale `components/Layer`、`components/Shell`、`components/Map` 副本需由该 agent 自行清理
- terrain worker 路径需实机验证
- lazy import 路径需实机验证
