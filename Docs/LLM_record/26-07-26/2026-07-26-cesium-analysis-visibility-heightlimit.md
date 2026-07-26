# Cesium 三维分析模块：通视 + 限高（Demo 移植集成，V3.4.24）

## 日期和时间

2026-07-26 19:47（北京时间）

## 事件逻辑链条分析

- **核心症状**：Docs/Demo 已沉淀 15 个 Cesium 单页演示，但主应用 Cesium 侧**分析类能力为零**（现有模块均为特效/漫游/数据导入向）；用户要求评估并集成，选定通视 + 限高组合（共享点选交互基建、与镇远 3D Tiles 城市模型天然配套），并明确集成范式：**独立文件夹模块 + 统一 GUI 控制接口**。
- **根本原因**：demo 是 lil-gui 全局 + Vue CDN 单页写法，直接搬运会把逻辑堆进组件（违反规范 6 单一职责）；且 demo 依赖 turf（sector/推算）与全局 Cesium，需去依赖化、注入化改造。
- **受影响模块**：Cesium 组件树（新增 Analysis/）、工具模块聚合（useCesiumToolModules）、容器接线（CesiumContainer）、控制面板（零改动——声明式控件由既有 LilGuiControls 渲染）。
- **解决思路**：按 Cloud/FluidSimulation 先例建文件夹模块；分析器类只依赖注入的 getViewer/getCesium；GUI 走既有声明式 controls[] 管线；发现 LilGuiControls 缺省分支天然支持 lil-gui 函数控件 → 新增 type:'button' 约定（value 为稳定空函数，动作按 controlId 分发），无需改面板渲染器。

## 修改内容

1. **新增 `frontend/src/components/Cesium/Analysis/`（5 文件）**
   - `analysisMath.js`：共享纯函数——`pickCartesian`（pickPosition 优先、globe.pick 兜底）、`cartesianToDegrees`、`destinationPoint`（大圆推算）、`sectorRingDegrees`（扇形顶点环，替代 turf.sector 零依赖）。
   - `visibilityAnalysis.js`：`VisibilityAnalysis` 类——选点模式（独立 ScreenSpaceEventHandler，选完即析构）、逐角度 `scene.pickFromRay`（排除自身观察点/扇形/线段实体；API 缺失环境整段视为可见的防御分支）、命中距离 < 半径时拆分可见/遮挡两段 polyline（depthFail 半透明同色）、覆盖扇形 Entity、参数热更（applyParams 触发重算）、clear/destroy 全量释放。
   - `heightLimitAnalysis.js`：`HeightLimitAnalysis` 类——`fitToTileset()` 按场景首个 `Cesium3DTileset` 包围球生成矩形区域/推荐限高（底部 + 40% 半径经验值，与 demo 一致）/飞行定位；`startDrawRegion()` 左键加点（橙色辅助点）右键结束（≥3 点生效，不足则取消）；`ClassificationPrimitive`（PolygonGeometry height=限高，CESIUM_3D_TILE 分类）超限染色 + 黄色截面框（hierarchy/height 双 CallbackProperty）；clear/destroy。
   - `analysisModule.js`：`createAnalysisModule(analysisParams, analysisState)` 声明式控件（通视 11 项 + 限高 8 项，vis*/limit* 前缀；按钮 label 随状态切换如「⏳ 绘制中（右键结束）」；禁用态跟随开关与结果有无）；导出 `DEFAULT_ANALYSIS_PARAMS/STATE` 与稳定空函数 `ANALYSIS_NOOP`。
   - `index.js`：`createAnalysisRuntime({ getViewer, getCesium, onStateChange })`——懒实例化两个分析器、控件 id→分析器参数键映射表换名同步、开关关闭即销毁对应分析器、`destroy()` 总出口；barrel re-export。
2. **`composables/toolModules/useCesiumToolModules.js`**：新增 `getViewer/getCesium` 入参；`analysisParams/analysisState` ref；运行时懒创建（onStateChange 合并回写 state）；`toolModules` 数组注册 `createAnalysisModule`；`handleToolControlChange` 顶部新增 analysis 分支（参数写回 ref 后统一分发，函数值不写入参数）；`cleanupTools` 追加运行时销毁；return 导出两个 ref。
3. **`CesiumContainer.vue`**：`useCesiumToolModules({ ... })` 增传现成的 `getViewer/getCesium`（一处两行）。

## 修改原因

用户选定方案（通视 + 限高一起做）并指定集成范式；补齐 Cesium 侧三维分析能力短板，让 Demo 资产进入主应用可用状态。

## 影响范围

Cesium 3D 高级控制台「模块」页签新增「三维分析·通视/限高」卡片；不影响任何既有模块（分析运行时懒创建，默认关闭零开销）；面板/LilGui 渲染器零改动（按钮为既有缺省分支的自然能力）。

## 优化解决方案

相对 demo 的工程化改造：去 turf（自实现大圆/扇形数学）；去全局 Cesium（getCesium 注入，与 Cloud 模块 getCesium.js 同哲学）；lil-gui 独立实例改为统一 controls[] 声明（面板一处渲染、状态可回写驱动 label/禁用态）；生命周期显式化（开关即建/毁，选点与绘制的 handler 均为一次性/可销毁，杜绝事件泄漏）；`pickFromRay` 私有 API 加存在性防御。

## 性能指标

默认关闭零成本；开启后通视单次重算 = (方位角跨度/步长) 次 pickFromRay + 等量 polyline 实体（默认 25 条射线），参数拖动即时重算无明显卡顿；限高为单个 ClassificationPrimitive + 单 Entity，可忽略。

## 测试方案

- **已验（静态）**：新增 5 文件 + 改动 useCesiumToolModules/CesiumContainer 全部 ESLint 零告警（过程中修复 index.js JSDoc 注释含 `*/` 导致的解析错误）；事件链人工核对闭环：LilGuiControls emit(change) → CesiumToolPanel `emitControlChange`（仅 range Number 化，按钮函数原样）→ `handleToolControlChange` analysis 分支；`featureModules` 过滤仅排除 scene，analysis 卡片必然渲染。
- **待实机回归**：
  1. 3D 模式 → 高级控制台 → 模块 → 启用通视 → 地图选点 → 绿/红射线与扇形出现，拖动半径/步长/方位角实时重算，清除按钮生效；
  2. 「加载3D模型」载入镇远 tileset → 启用限高 → 自动框选（相机飞行 + 染色 + 截面框）→ 拖动限高滑杆染色区随动 → 手绘 ≥3 点区域替换范围 → 关闭开关全部实体消失；
  3. 反复开关 + 切换 2D/3D 无残留实体与 cursor 异常（验证 destroy/cleanupTools 链路）。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Analysis\index.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Analysis\analysisModule.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Analysis\analysisMath.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Analysis\visibilityAnalysis.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Analysis\heightLimitAnalysis.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\toolModules\useCesiumToolModules.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\CesiumContainer.vue
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md（文件树补录 Analysis/ 5 文件）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.24 三处 + 版本表保留最新三条）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.24 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-cesium-analysis-visibility-heightlimit.md（本日志）

> 备注：未执行任何 git 操作，提交由用户决策。
