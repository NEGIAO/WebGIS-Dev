# 2026-11-14 Vue 组件视图/逻辑分离收官与样式内聚规范修正（V3.7.1）

> **任务定级**：L3（架构级重构收官 + 规范修正）
> **版本号**：V3.7.1
> **关联文档**：[`Docs/TODO/2026-11-13-vue-component-refactor-plan.md`](../../../TODO/2026-11-13-vue-component-refactor-plan.md) · [`Docs/Guide/dev-conventions.md`](../../../Guide/dev-conventions.md) · [`Docs/Guide/vue-component-template.md`](../../../Guide/vue-component-template.md)

---

## 一、背景与架构原则修正

1. **核心架构定位修正（禁止剥离 `.vue` 内的 `<style>` 为独立 `.scss`）**：
   - 原重构计划 Phase 4 曾将部分组件的 `<style>` 块外置为 `./styles/X.scss` 并通过 `<style src="...">` 代理引入。
   - **问题根因**：如果将 `<script>` 和 `<style>` 同时从 `.vue` 剥离，`.vue` 单文件组件就退化为纯 HTML 模板片段，完全丧失了 Vue SFC 集中管理视图结构与组件样式的优势，徒增目录层级与文件跳转碎片。
   - **修正后权威规范**：
     - **`X.vue`（视图与样式层）**：完整承担 DOM 组织（`<template>`）与样式定义（内联 `<style scoped>` / `<style>`），仅通过单行 `<script lang="ts" src="./X.ts"></script>` 关联逻辑层；**严禁使用 `<style src="...">` 将样式外置为 `.scss` 代理文件**。
     - **`X.ts`（逻辑实例层）**：与 `X.vue` 同名同级，通过 `defineComponent` + `export class Instance` 独立承载组件状态、生命周期、事件处理与 Composable 调度，实现「前端视图样式（`.vue`）与业务逻辑（`.ts`）」二元清晰分离。
2. **全量 72 个含脚本 `.vue` 组件 100% 剥离 `<script>` 与超长业务 `.ts` 按功能域拆分**：
   - 将全仓其余 36 个含 `<script setup>` 的 `.vue` 组件全部剥离为同名 `.ts` 实例层（`<script lang="ts" src="./X.ts"></script>` + `export class Instance`），实现全仓 72/72 含脚本 `.vue` 组件（仅 `AuthGlobeStage.vue` 为无脚本纯视图）100% 视图/逻辑分离。
   - 将最后一批超过 700 行的组件实例层（`MapContainer.ts`、`LandingView.ts`、`LayerControlPanel.ts`、`FloatingAccountPanel.ts`）及 10 个超 700 行业务 `.ts` 模块全部按独立功能域拆分为专用子模块/Composable，使全仓全部业务 `.ts` 文件 100% 控制在 `< 700` 行以内。

---

## 二、本次实施变更清单

### 1. 全量 `.scss` 样式还原回 `.vue` 组件并清理外置文件
将项目中全部 9 个含 `<style ... src="./styles/*.scss">` 的 `.vue` 组件样式完整还原为 `.vue` 内联 `<style scoped>`（及 `AttributeTable.vue` 的非 scoped `<style>`），并删除全部 10 个 `.scss` 文件、对应 `styles/` 子目录及 `Scripts/ExtractVueStyles.py`：
- `frontend/src/app/HomeView.vue`（还原 `HomeView.scss`）
- `frontend/src/app/LandingView.vue`（还原 `LandingView.scss`）
- `frontend/src/domains/cesium/components/CesiumContainer.vue`（还原 `CesiumContainer.scss`）
- `frontend/src/domains/cesium/components/CesiumToolPanel.vue`（还原 `CesiumToolPanel.scss`）
- `frontend/src/domains/common/layer-tree/components/TOCPanel.vue`（还原 `TOCPanel.scss`）
- `frontend/src/domains/common/user/components/ApiManagementPanel.vue`（还原 `ApiManagementPanel.scss`）
- `frontend/src/domains/ol/components/LogMonitor.vue`（还原 `LogMonitor.scss`）
- `frontend/src/domains/ol/components/MapContainer.vue`（还原 `MapContainer.scss`）
- `frontend/src/domains/ol/layer/components/AttributeTable.vue`（还原 `AttributeTable.global.scss` 与 `AttributeTable.scss`）

### 2. 全量 72/72 `.vue` 组件 `<script>` 剥离与业务 `.ts` 功能域拆分收官
- **全量 72 个含脚本 `.vue` 组件完成 `X.vue` + `X.ts` 分离**：
  - 新增剥离其余 36 个 `.vue` 组件的 `<script>` 为同名 `.ts`（涵盖 `App.ts`、`LoginView.ts`、Cesium 导航罗盘与漫游面板、Common 图层属性/符号/CRS 弹窗、AI 浮动与设置面板、用户中心各子面板、OL 行政区划与工具弹窗等），全仓 72 个含脚本 `.vue` 组件 100% 统一为 `<script lang="ts" src="./X.ts"></script>`。
- **组件实例层（`X.ts`）功能域二次拆分**：
  - **`MapContainer.ts`（1,003 行 → 604 行）**：抽离 `useMapBasemapPipeline.ts`（235 行）与 `useMapLayerAndRoutePipeline.ts`（297 行）
  - **`LandingView.ts`（852 行 → 659 行）**：抽离 `useLandingGithubAndVersion.ts`（242 行）
  - **`LayerControlPanel.ts`（811 行 → 695 行）**：抽离 `useLayerCustomWmsAndSearch.ts`（160 行）
  - **`FloatingAccountPanel.ts`（792 行 → 688 行）**：抽离 `useAccountSecurityAndActions.ts`（176 行）
- **10 个超 700 行业务 `.ts` 模块按功能域拆分（全部降至 `< 700` 行）**：
  - `useCesiumDrawMeasure.ts`（1,153 → 563 行）+ `drawHandleRegistry.ts`（534 行，测量/标绘句柄注册与显隐删除管理）
  - `fluidRuntime.ts`（1,089 → 543 行）+ `fluid/fluidRenderPrimitives.ts`（427 行，流体 DrawCommand/Pass/纹理管线创建）
  - `firstPersonFlyController.ts`（1,054 → 528 行）+ `routeFlyTimelineAndIo.ts`（387 行，飞行时间轴高程采样、CZML 构建与路线导入导出）
  - `useCesiumLayers.ts`（939 → 558 行）+ `imageryProviderBuilders.ts`（326 行，XYZ/WMS/WMTS/ArcGIS/瓦片网格 ImageryProvider 构建）
  - `useHomeLayerAndMapRouting.ts`（926 → 435 行）+ `useHomeTocAndAttributeActions.ts`（487 行，TOC 节点动作分发、属性表联动与样式应用）
  - `useMapState.ts`（911 → 534 行）+ `useMapBasemapInstances.ts`（221 行，OL 底图实例按需挂载、显隐透明度同步与切换回收）
  - `tilesetTerrainFit.ts`（801 → 445 行）+ `tilesetLeafSampling.ts`（309 行，3D Tiles 叶子包围盒采样与地表高程批查询）
  - `playerController.ts`（775 → 535 行）+ `utils/playerModelLoader.ts`（113 行，GLB 角色模型加载、动画剪辑探测与降级回退）
  - `planarRouteController.ts`（738 → 509 行）+ `utils/planarControllerSetup.ts`（148 行，测区航线子处理器装配与全局统计重置）
  - `tilesetLoader.ts`（714 → 397 行）+ `tileset/tilesetSampleLoaders.ts`（266 行，在线示例与本地目录 3D Tiles 探测加载）

### 3. 门禁与规范文档同步
- **`Scripts/CheckVueParadigm.py`**：新增 `<style[^>]*\bsrc\s*=` 检测规则，禁止范式化 `.vue` 组件外置 `<style src="...">` 样式代理。
- **规范与计划文档更新**：
  - `Docs/Guide/dev-conventions.md`：更新「组件范式化」条目，移除原「样式外置」规则，明确 `.vue` 承担 DOM 与样式组织、仅剥离 `<script>` 到 `.ts`。
  - `Docs/Guide/vue-component-template.md`：更新 `.vue` 模板示例与约束说明。
  - `Docs/TODO/2026-11-13-vue-component-refactor-plan.md` 与 `Docs/TODO/bugfix-optimization-plan.md`（P3-1）：标记全部完成并修正样式内聚原则说明。
  - `Docs/Guide/frontend-structure.md` 与 `Docs/Guide/project-structure.md`：同步全部 46 个新增 `.ts` 文件与移除 `ExtractVueStyles.py`。

---

## 三、质量门禁验证结果

- `python Scripts/CheckVueParadigm.py frontend/src`：范式化组件 **72 个，全部通过**（0 违规，0 外置 `<style src>`）
- `python Scripts/CheckDomainDeps.py frontend/src`：`common->ol: 0`、`common->cesium: 0`、`cesium->ol: 0`、`ol->cesium: 0`，**TOTAL: 0**
- `python Scripts/CheckStructureTree.py`：**文档条目 733 · 磁盘文件 733 · 漏登记 0 · 幽灵条目 0**
- `python Scripts/CheckConfigRegistry.py`：**通过（exit code 0）**
- `cd frontend && npx eslint src/ --quiet`：**0 错误**
- `cd frontend && npx vue-tsc --noEmit`：**0 错误**
- `cd frontend && npm run build`：**构建通过**
