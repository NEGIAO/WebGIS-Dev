# 高级 2D 绘制面板与几何编辑集成记录

## 日期和时间

2026-07-26 13:09

## 修改内容

- 计划将 `D:\Dev\GitHub\basemap\src\components\DrawingToolbar.vue` 中较丰富的 OpenLayers 绘制/编辑能力，按 WebGIS-Dev 架构拆分后集成到前端绘制体系。
- 计划升级 `frontend/src/components/ControlsPanel/DrawPanel.vue`，在保持 WebGIS-Dev 现有 UI 配色的基础上增加矩形、椭圆、圆轮廓、箭头、风向箭头、军标箭头、选择编辑、删除选中与样式控制。
- 计划新增高级绘制与几何编辑 composable，避免把 OpenLayers 业务逻辑堆叠到 `MapContainer.vue`。
- 绘制结果将统一接入 WebGIS-Dev 托管图层体系，以 `sourceType: 'draw'` 纳入图层管理/TOC/LayerControl，而不是使用 basemap 的独立内存绘制图层。

## 修改原因

当前 WebGIS-Dev 绘制面板功能较简陋，只支持点、线、面和清除。basemap 项目的绘制面板提供了更丰富的图形类型、要素级样式、选择与顶点编辑等能力。用户希望借鉴 basemap 的成熟交互体验，并结合 WebGIS-Dev 实际架构集成到现有 OpenLayers 前端编辑功能中。

## 事件逻辑链条分析

### 核心症状

- 当前 `DrawPanel.vue` 只有点、线、面三个工具，难以满足丰富 WebGIS 标绘需求。
- `useDrawMeasure.js` 当前只负责基础绘制与测量，没有 `Select` / `Modify` 几何编辑会话。
- 绘制样式主要是图层级配置，缺少 `drawType` / `styleParams` 这类要素级标绘元数据。
- layer control / TOC 已有托管图层体系，但高级绘制能力尚未纳入统一生命周期。

### 根本原因

- WebGIS-Dev 当前绘制模块设计目标是“基础绘制 + 测量 + 创建托管图层”，不是完整几何编辑器。
- basemap 的能力集中在单个 1732 行 `DrawingToolbar.vue` 中，不能直接复制，否则会违背 WebGIS-Dev “组件轻量、业务进入 composable”的架构约束。
- 现有 `MapContainer.vue` 已承担大量编排职责，新功能必须继续下沉到 `frontend/src/composables/map/features/`。

### 受影响模块

- 前端控制面板：`frontend/src/components/ControlsPanel/DrawPanel.vue`、`ControlsPanel.vue`
- 主页面事件桥：`frontend/src/views/HomeView.vue`
- OpenLayers 地图编排：`frontend/src/components/Map/MapContainer.vue`
- 绘制/编辑 feature 库：`frontend/src/composables/map/features/*`
- 托管图层样式与序列化：`useManagedLayerStyle.js`、`useManagedFeatureSerialization.js`
- 文档与版本记录：根 README、前端/后端 README、结构文档与本维护日志。

## 优化解决方案

1. 新增绘制工具注册表，统一管理点、线、面、矩形、椭圆、圆轮廓、箭头、风向箭头、军标箭头与选择编辑工具的元数据、提示语和默认样式。
2. 新增纯几何工具模块，迁移并加固 basemap 的矩形/椭圆 geometryFunction、Catmull-Rom 平滑、箭头多边形构建、小箭头头部构建等算法。
3. 新增绘制要素样式模块，集中处理 `drawType` / `styleParams`、基础样式、箭头样式、军标渐变样式与选中高亮。
4. 新增高级绘制 composable，处理 Rectangle、Ellipse、CircleOutline、Arrow、WindArrow、BattleArrow 的 OpenLayers Draw 生命周期，并在 drawend 后调用 `createManagedVectorLayer` 进入托管图层体系。
5. 新增几何编辑 composable，接入 OpenLayers Select/Modify，仅编辑 `sourceType: 'draw'` 的托管图层，修改/删除后同步 features、featureCount 与图层管理事件。
6. 升级 DrawPanel UI，保持品牌渐变头、绿色强调色、白色半透明面板、圆角阴影等现有视觉体系；组件只发事件，不直接依赖 OpenLayers。
7. MapContainer 只做最小编排：初始化 composable、工具类型分流、暴露删除选中/样式更新等小接口。

## 性能指标

本次主要是交互能力增强，不属于性能优化任务。性能约束为：高级绘制仅面向少量用户标绘图形，军标箭头 Canvas renderer 不用于大规模要素批量渲染；上传大数据图层和分析结果图层默认不进入编辑会话，避免 Select/Modify 对大图层造成卡顿。

## 测试方案

1. 基础绘制回归：点、线、面、测距、测面、清除所有绘制仍可用。
2. 高级绘制验证：矩形、椭圆、圆轮廓、小箭头、风向箭头、军标箭头均能绘制并显示正确样式。
3. 图层管理验证：高级绘制结果全部以 `sourceType: 'draw'` 出现在 layer control / TOC 中，支持显示/隐藏、定位、删除与导出。
4. 几何编辑验证：开启选择编辑后，可选中绘制图层中的要素，拖拽顶点后样式不丢失，TOC 和 featureCount 同步刷新。
5. 删除验证：删除选中要素后图层状态正确；删除图层最后一个要素后自动移除空绘制图层。
6. 样式验证：绘制前修改颜色、线宽、透明度、填充、半径、箭头参数后，新绘制要素使用新样式；选中后修改样式时当前要素即时更新。
7. 交互清理验证：切换工具、关闭面板、Escape、2D/3D 切换后无 Draw/Snap/Select/Modify 残留。
8. 构建验证：在 `frontend/` 执行 `npm run build`，如项目提供 lint 脚本则同时执行 `npm run lint`。

## 修改的文件路径

实际涉及以下文件：

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\drawingToolRegistry.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\drawingGeometryUtils.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useDrawingFeatureStyle.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useAdvancedDrawing.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useGeometryEdit.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useDrawMeasure.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useManagedLayerStyle.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useManagedFeatureSerialization.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\index.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\interactionHandlers.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\ControlsPanel\DrawPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\ControlsPanel\ControlsPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\views\HomeView.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Map\MapContainer.vue`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-advanced-2d-editing-port.md`

## 实施结果

- 前端 `npm run build` 已通过。
- 版本号已提升为 `V3.4.5`。
- 高级绘制与几何编辑已接入现有 `ControlsPanel → HomeView → MapContainer → feature composable` 事件链。
- 绘制结果统一进入 `sourceType: 'draw'` 托管图层，由 layer control / TOC 管理。

## 追加修复记录（2026-07-26 13:52）

### 问题 1：虚线符号配置无效

- 根因：基础绘制 `useDrawMeasure.js` 的 Draw 预览仍使用旧的 `createStyleFromConfig(drawStyleConfig.value)`，没有读取 DrawPanel 中的 `strokeDashType/dashLength/dashGap`；高级绘制激活时也捕获了一份旧样式参数，激活工具后再调整虚线不会实时生效。
- 修复：基础绘制和高级绘制均改为通过 `createDrawingStyleFromParams()` 读取实时 `drawingStyleParamsRef`，drawend 提交时也读取最新样式参数，确保虚线、颜色、线宽、透明度对预览和最终托管图层生效。

### 问题 2：绘制层与图层管理重复控制，清除需要操作两次

- 根因：OpenLayers `Draw` 在 `drawend` 后仍会把 feature 插入临时 `drawSource`，而当前实现同时又将同一个 feature 提交为 managed layer，导致地图上存在“临时绘制层 + 托管图层”两套显示来源。
- 修复：基础绘制与高级绘制在 drawend 后使用延迟清理 `drawSource.removeFeature(feature)`，确保最终只保留 managed layer 这一套图层来源。之后绘制图层的显示/隐藏/删除/清除统一由 TOC/LayerControl 的托管图层体系管理，DrawPanel 的“清除所有”也会直接移除 `sourceType: 'draw'` 托管图层。

### 验证

- 已重新执行 `frontend/npm run build`，构建通过。

## 追加修复记录（2026-07-26 13:??）

### 问题：MapContainer 初始化顺序错误

- 现象：运行时报 `ReferenceError: Cannot access 'drawingStyleParams' before initialization`。
- 根因：`createDrawMeasureFeature()` 注入 `drawingStyleParamsRef: drawingStyleParams` 时，`drawingStyleParams` 的 `ref()` 声明在后面，触发 ES module/`const` 暂时性死区。
- 修复：将 `const drawingStyleParams = ref(normalizeDrawingStyleParams({}))` 提前到 `createDrawMeasureFeature()` 调用之前，确保基础绘制和高级绘制共享同一个已初始化样式 ref。
