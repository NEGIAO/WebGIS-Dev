# V3.4.90 前端 domains 架构 Phase 1/2 首批迁移

## 日期与时间

2026-07-29 00:00

## 任务等级

L3 架构级

## 问题分析

### 核心症状

`frontend/src/components/Cesium/` 承载了完整三维子应用职责，目录层级过深，并混合 Vue 组件、Cesium composables、terrain provider、runtime、tool modules、数据导入、第三方内联模块等内容。

### 根本原因

项目早期 `frontend/src/` 主要以 OpenLayers 二维地图为默认上下文生长；后续新增 Cesium 三维能力时，没有建立与 OL 平级的三维领域根目录，而是把 Cesium 能力集中放入 `components/Cesium/`。

### 受影响模块

- `frontend/src/components/Cesium/`
- `frontend/src/components/Cesium/composables/`
- `frontend/src/components/Cesium/terrain/`
- `frontend/vite.config.js`
- `frontend/jsconfig.json`
- `frontend/tsconfig.json`
- `Docs/Guide/frontend-structure.md`
- 根 `README.md`
- `Docs/Guide/CHANGELOG.md`

### 候选方案对比

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 原地继续维护 `components/Cesium/` | 改动少 | 架构问题继续扩大，components 语义失真 | 不采用 |
| 直接一次性迁移全部前端到 `domains/ol/cesium/common` | 一步到位 | 风险极高，import、worker、shader、store、TOC、数据导入都可能同时断裂 | 不采用 |
| 分阶段迁移，第一批只建 domains 与迁移 Cesium 入口/composables/terrain | 风险可控，优先解决最痛点 | 迁移期会保留部分旧路径兼容 | 采用 |

### 选定方案与理由

采用 `Docs/Refactor.md` 的 Phase 1 + Phase 2：

1. 建立 `frontend/src/domains/ol`、`frontend/src/domains/cesium`、`frontend/src/domains/common` 骨架；
2. 配置 `@domains/`、`@ol/`、`@cesium-domain/`、`@common/` alias；
3. 迁移 Cesium 第一批：入口 Vue 组件、`composables/`、`terrain/`；
4. 对尚未进入本阶段的 Cloud / FluidSimulation / ShallowWater / PlayerController / wind / navigation 等模块使用迁移期 legacy import，避免扩大 Phase 2 范围。

理由：当前主要痛点是 Cesium 被压在 `components/` 下；先把三维主入口和核心 composables / terrain provider 迁出，可以建立新领域根目录，同时避免一次性改动所有 132 个 Cesium 文件。

## 修改内容

> 本日志先行创建，后续实施完成后补充实际改动清单、验证结果和风险。

## 修改原因

为解决前端架构中 Cesium 模块过深、`components` 目录职责失真、OL/Cesium/Common 边界不清的问题，启动第一批领域化迁移。

## 影响范围

- 前端构建 alias 解析；
- Cesium 3D 容器加载；
- Cesium 工具面板；
- Cesium composables；
- terrain provider / decode worker 路径；
- 文档结构树与版本记录。

## 解决方案

执行 `Docs/Refactor.md` 中：

- Phase 1：建立 `domains` 骨架与 alias；
- Phase 2：迁移 Cesium 领域第一批。

本阶段不处理：

- OL 目录迁移；
- Common Shell/Home 迁移；
- Layer / TOC 拆分；
- Data Import / GIS IO 全链路拆分；
- Pinia stores 拆分。

## 性能指标

未实测。本阶段为目录结构与 import 迁移，预期不改变运行时性能。

## 测试方案

| 类型 | 内容 |
|---|---|
| Agent 已执行 | 待实施完成后补充：前端构建、结构树检查、配置登记检查 |
| 待用户实机验证 | 打开 3D/Cesium 场景，验证底图、地形、工具面板、基础交互、数据导入弹窗是否正常 |

## 变更文件清单

- `frontend/vite.config.js`：新增 `@domains`、`@ol`、`@cesium-domain`、`@common` alias
- `frontend/jsconfig.json`：新增 domains alias 路径映射
- `frontend/tsconfig.json`：新增 domains alias 路径映射
- `frontend/src/domains/ol/index.js`：新建 OL 领域入口
- `frontend/src/domains/cesium/index.js`：新建 Cesium 领域入口
- `frontend/src/domains/common/index.js`：新建 Common 领域入口
- `frontend/src/domains/cesium/components/CesiumContainer.vue`：从 `components/Cesium/` 迁入
- `frontend/src/domains/cesium/components/CesiumToolPanel.vue`：从 `components/Cesium/` 迁入
- `frontend/src/domains/cesium/components/CesiumAdvancedEffects.vue`：从 `components/Cesium/` 迁入
- `frontend/src/domains/cesium/components/CesiumDataImportDialog.vue`：从 `components/Cesium/` 迁入
- `frontend/src/domains/cesium/components/LilGuiControls.vue`：从 `components/Cesium/` 迁入
- `frontend/src/domains/cesium/composables/*`：从 `components/Cesium/composables/` 整体迁入
- `frontend/src/domains/cesium/providers/terrain/*`：从 `components/Cesium/terrain/` 整体迁入
- `frontend/src/views/HomeView.vue`：lazy import 路径改为 `@cesium-domain/components/CesiumContainer.vue`
- `frontend/src/components/Cesium/FluidSimulation/FluidSimulationPanel.vue`：更新 LilGuiControls / composables 引用
- `frontend/src/components/Cesium/ShallowWater/ShallowWaterOverlay.vue`：更新 composables 引用
- `frontend/src/components/Cesium/cesium-wind-layer/useCesiumWind.js`：更新 composables 引用
- `frontend/src/components/Cesium/Cloud/setupCloudIntegration.js`：更新 composables 引用
- `frontend/src/components/Cesium/PlayerController/usePlayerController.js`：更新 composables 引用
- `frontend/src/cesium-shim.js`：注释更新为迁移期说明
- `Docs/Guide/frontend-structure.md`：同步为新领域树
- `README.md`：版本号三处更新为 V3.4.90
- `Docs/Guide/CHANGELOG.md`：追加 V3.4.90 条目
- `Docs/LLM_record/26-07/2026-07-29/2026-07-29-v3490-frontend-domains-phase1-2.md`：本日志

## 遗留与风险

- Phase 2 仅迁移 Cesium 第一批；Cloud / FluidSimulation / ShallowWater / PlayerController / wind / navigation / Analysis 等模块仍保留在 `components/Cesium/`，属于迁移期 legacy 模块
- `domains/cesium/components/CesiumContainer.vue` 仍通过相对路径引用 `components/Cesium/FluidSimulation`、`ShallowWater`、`Cloud`、`cesium-wind-layer`、`PlayerController` 等 legacy 模块，后续 Phase 3 清理
- terrain worker 路径已验证可构建，但需实机验证地形加载
- lazy import 路径已验证可构建，但需实机验证 3D 场景启动

