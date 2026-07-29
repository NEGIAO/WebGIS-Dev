# 前端 domains 架构 Phase 4/5：Common Shell/Home + OL 地图核心迁移

- **日期与时间**：2026-07-29 15:30
- **任务等级**：L3 架构级
- **版本号**：V3.4.91

---

## 问题分析

### 核心症状
前端 `domains/ol` 与 `domains/common` 骨架已建立（Phase 1/2），但业务代码仍散落在 `views/`、`components/Shell/`、`components/Map/`、`composables/map/`、`utils/map/` 等历史目录中，缺少明确的领域归属。

### 根本原因
项目早期以 OpenLayers 为默认语境生长，后续新增 Cesium 后只能寄生在 `components/Cesium/` 下；OL 相关代码则散落在 `components/`、`composables/`、`utils/` 各处，没有显式的领域边界。

### 受影响模块
- `domains/common/`：应用壳（Shell）、Home 视图
- `domains/ol/`：OL 地图组件、底图系统、绘制测量、路线渲染、空间分析、启动任务、URL 状态、瓦片源、地图工具函数

### 候选方案对比
1. **一次性全量迁移**：风险高，容易引入大量 import 错误，且与另一 Agent 的 Cesium 域操作冲突
2. **按 Refactor.md 分 Phase 迁移**（选定）：Phase 4 迁移 Common + Home，Phase 5 迁移 OL 核心，风险可控，每步可独立验证

### 选定方案与理由
按 Refactor.md 既定计划执行 Phase 4 + Phase 5，只做路径迁移不改业务逻辑，优先使用 `@ol/` 和 `@common/` alias 替换深层相对路径。

---

## 修改内容

### Phase 4：Common Shell / Home

1. 新建目录：`domains/common/app/`、`domains/common/app/home/`、`domains/common/shell/`、`domains/common/components/`
2. 迁移文件：
   - `views/HomeView.vue` → `domains/common/app/HomeView.vue`
   - `views/home/*` → `domains/common/app/home/*`
   - `components/Shell/*` → `domains/common/shell/*`
   - `components/Common/*` → `domains/common/components/*`
3. 更新 import：
   - `router/lazyHomeViewLoader.js`：`../views/HomeView.vue` → `../domains/common/app/HomeView.vue`
   - `App.vue`：`./components/Shell/GlobalLoading.vue` → `@common/shell/GlobalLoading.vue`
   - `composables/useMessage.js`：`../components/Shell/Message.vue` → `@common/shell/Message.vue`
   - `domains/common/app/HomeView.vue`：TopBar/MapContainer/MagicCursor/PersistentAnnouncementBar/ResizeHandle/SidePanel 全部改为 `@common/shell/` 或 `@ol/components/` alias
   - `components/ControlsPanel/SpatialAnalysisPanel.vue` 和 `components/Map/MapDownloader.vue`：ExtentPicker 路径改为 `@common/components/ExtentPicker.vue`

### Phase 5：OL 地图核心

1. 新建目录：`domains/ol/components/`、`domains/ol/basemap/composables/`、`domains/ol/basemap/resilience/`、`domains/ol/drawing/composables/`、`domains/ol/drawing/registry/`、`domains/ol/drawing/geometry/`、`domains/ol/routing/renderers/`、`domains/ol/routing/services/`、`domains/ol/spatial-analysis/composables/`、`domains/ol/startup/`、`domains/ol/url-state/`、`domains/ol/tile-source/`、`domains/ol/utils/`
2. 迁移文件：
   - `components/Map/*` → `domains/ol/components/*`
   - `composables/map/basemapSystem.js` → `domains/ol/basemap/`
   - `composables/map/features/useBasemap*.js` → `domains/ol/basemap/composables/`
   - `useBasemapResilience.js` → `domains/ol/basemap/resilience/`
   - `useDrawMeasure.js` → `domains/ol/drawing/composables/`
   - `drawingToolRegistry.js` → `domains/ol/drawing/registry/`
   - `drawingGeometryUtils.js` → `domains/ol/drawing/geometry/`
   - `useRouteRendering.js` → `domains/ol/routing/renderers/`
   - `routeService.js` → `domains/ol/routing/services/`
   - `useSpatialAnalysis.js` → `domains/ol/spatial-analysis/composables/`
   - `useStartup*.js` → `domains/ol/startup/`
   - `useBasemapUrlMapping.js`、`useMapViewUrlState.js` → `domains/ol/url-state/`
   - `composables/tileSource/*` → `domains/ol/tile-source/*`
   - `utils/map/*` → `domains/ol/utils/*`
   - `basemapLayerFactory.js` → `domains/ol/basemap/composables/`
3. 更新 import：
   - `domains/ol/components/MapContainer.vue`：已迁移的 composables 改为 `@ol/` alias，未迁移的保持相对路径；子组件路径修正为 `../../../components/Layer/`
   - `domains/ol/components/MapControlsBar.vue`：`../../` → `../../../`
   - `domains/ol/components/MapDownloader.vue`：`../../` → `../../../`，ExtentPicker 改为 `@common/components/`
   - `domains/ol/basemap/composables/useBasemapLayerBootstrap.js` 等：`../../useTileSourceFactory` → `../../../../composables/useTileSourceFactory`
   - `domains/ol/basemap/composables/basemapLayerFactory.js`：`./useTileHDRendering` → `../../../../composables/map/features/useTileHDRendering`
   - `domains/ol/basemap/composables/useBasemapSwipe.js`：`../../useMapSwipe` → `../../../../composables/useMapSwipe`
   - `domains/ol/url-state/useMapViewUrlState.js`：`../utils/url/` → `../../../utils/url/`
   - `domains/ol/routing/services/routeService.js`：修正 re-export 路径
   - `domains/ol/tile-source/tileLifecycle.ts`：`../useMessage` → `../../../composables/useMessage`
   - `domains/ol/tile-source/types.ts`：`../../config/publicRuntime` → `../../../config/publicRuntime`

---

## 修改原因

- 建立明确的领域边界，让 `src/` 不再默认等价于 OL 应用
- 降低 `components/Cesium/` 之外的跨域耦合
- 为后续 Phase（Layer/TOC、Data Import、stores）奠定基础
- 方便多 Agent / 多会话分阶段交接实施

---

## 影响范围

- **Phase 4**：应用壳（Shell 7 组件）、Home 视图、Home 子模块（4 文件）、ExtentPicker
- **Phase 5**：OL 地图组件（5 Vue）、底图系统（6 composables + 1 resilience + 1 factory）、绘制测量（3 文件）、路线渲染（1 文件）、路线服务（1 文件）、空间分析（1 文件）、启动任务（3 文件）、URL 状态（2 文件）、瓦片源（7 文件）、地图工具（2 文件）

---

## 解决方案

采用 Refactor.md 规定的分阶段路径迁移策略：
1. 复制文件到新位置（原文件保留至 Phase 9）
2. 更新新位置文件中的 import（使用 alias 或修正相对路径深度）
3. 更新所有引用这些文件的外部 import
4. 运行构建与门禁验证

---

## 性能指标

未实测（纯路径迁移，无业务逻辑变化）

---

## 测试方案

### Agent 已执行
- `npm run build`：因另一 Agent 的 Cesium 域操作不完整（`vectorUtils.js` 未迁移但 `kmlLoader.js` 已引用新路径）导致构建失败，与本迁移无关
- `npx tsc --noEmit`：`domains/ol/` 与 `domains/common/` 下无新增 TS 错误（12 个错误均在 `domains/cesium/modules/player-controller/`，属另一 Agent 的 Cesium 域操作）
- 路径验证：所有 `@ol/` 和 `@common/` alias 均通过 `tsconfig.json` / `jsconfig.json` / `vite.config.js` 配置

### 待用户实机验证
1. 运行 `npm --prefix frontend run build`，确认构建通过（需等待另一 Agent 完成 Cesium 域修复）
2. 启动开发服务器 `npm --prefix frontend run dev`，验证：
   - 首页可正常进入
   - 顶栏、侧栏、全局 loading、消息、公告条正常
   - 2D 地图能初始化
   - 底图切换、图层管理、绘制测量、路线、搜索、空间分析基本可用
3. 运行 `python CheckStructureTree.py` 和 `python CheckConfigRegistry.py`

---

## 变更文件清单

### Phase 4（Common Shell/Home）
- `frontend/src/domains/common/app/HomeView.vue`（新位置，由 `views/HomeView.vue` 复制）
- `frontend/src/domains/common/app/home/*`（4 文件，由 `views/home/*` 复制）
- `frontend/src/domains/common/shell/*`（7 文件，由 `components/Shell/*` 复制）
- `frontend/src/domains/common/components/ExtentPicker.vue`（由 `components/Common/ExtentPicker.vue` 复制）
- `frontend/src/router/lazyHomeViewLoader.js`（更新 import 路径）
- `frontend/src/App.vue`（更新 GlobalLoading import）
- `frontend/src/composables/useMessage.js`（更新 Message import）
- `frontend/src/components/ControlsPanel/SpatialAnalysisPanel.vue`（更新 ExtentPicker import）
- `frontend/src/components/Map/MapDownloader.vue`（更新 ExtentPicker import）

### Phase 5（OL 地图核心）
- `frontend/src/domains/ol/components/*`（5 Vue 文件，由 `components/Map/*` 复制）
- `frontend/src/domains/ol/basemap/basemapSystem.js`（由 `composables/map/basemapSystem.js` 复制）
- `frontend/src/domains/ol/basemap/composables/*`（6 文件，含 basemapLayerFactory）
- `frontend/src/domains/ol/basemap/resilience/useBasemapResilience.js`
- `frontend/src/domains/ol/drawing/composables/useDrawMeasure.js`
- `frontend/src/domains/ol/drawing/registry/drawingToolRegistry.js`
- `frontend/src/domains/ol/drawing/geometry/drawingGeometryUtils.js`
- `frontend/src/domains/ol/routing/renderers/useRouteRendering.js`
- `frontend/src/domains/ol/routing/services/routeService.js`
- `frontend/src/domains/ol/spatial-analysis/composables/useSpatialAnalysis.js`
- `frontend/src/domains/ol/startup/*`（3 文件）
- `frontend/src/domains/ol/url-state/*`（2 文件）
- `frontend/src/domains/ol/tile-source/*`（7 文件）
- `frontend/src/domains/ol/utils/*`（2 文件）

### 文档与版本
- `README.md`（三处版本号更新）
- `Docs/Guide/CHANGELOG.md`（追加 V3.4.91 条目）
- `Docs/Guide/frontend-structure.md`（需同步更新结构树）

---

## 遗留与风险

1. **构建失败（另一 Agent 责任）**：`domains/cesium/composables/dataImport/loaders/kmlLoader.js` 引用 `@cesium-domain/composables/dataImport/vectorUtils.js`，但该文件不存在（原文件在 `composables/dataImport/vectorUtils.js`）。需另一 Agent 修复。
2. **`composables/map/index.js` 引用失效（另一 Agent 责任）**：另一 Agent 把 `composables/map/toc/` 整体移走但没更新 `composables/map/index.js` 的 `export * from './toc'`。
3. **原文件未删除**：按 Refactor.md，原文件保留至 Phase 9 清理。目前存在两份副本（原位置 + domains/），原位置的引用仍然有效。
4. **`constants/basemap` 未迁移**：因 Cesium 域也复用，保留原处。
5. **`composables/map/features/` 中大量文件未迁移**：如 `useMapEventHandlers`、`useAdvancedDrawing` 等，留待后续 Phase。
6. **`MapContainer.vue` 中对 `LayerControlPanel` 和 `AttributeTable` 的 import**：当前路径 `../../../components/Layer/` 有效，后续 Phase 7/8 迁移时需同步更新。

---

## 下一步建议

1. 等待另一 Agent 完成 Cesium 域修复（`vectorUtils.js` 路径 + `composables/map/index.js` toc 引用）
2. 进入 **Refactor.md Phase 6：Layer / TOC 拆分**（迁移 `components/Layer/` 到 `domains/common/layer-tree/` + `domains/ol/layer/` + `domains/cesium/layers/`）
3. 更新 `Docs/Guide/frontend-structure.md` 结构树（建议在 Phase 6 完成后统一更新）
