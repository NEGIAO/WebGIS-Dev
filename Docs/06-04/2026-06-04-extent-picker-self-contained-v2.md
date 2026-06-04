# 2026-06-04 ExtentPicker 重构为完全自包含组件（V2）

## 日期和时间
2026-06-04 17:30

## 修改内容
将 ExtentPicker 从纯按钮组重构为完全自包含的框选组件，内置全部框选逻辑，彻底消除事件传递链。

## 修改原因
- V1 版 ExtentPicker 只是一个按钮组，框选逻辑分散在 4 层事件链中（ExtentPicker → SpatialAnalysisPanel/MapDownloader → ControlsPanel/TOCPanel → HomeView → MapContainer → useMapInteractionPickers）
- 调用方需要处理大量事件传递和状态同步，违背组件封装原则
- 用户期望：传入地图实例，组件内部完成红色预览、蓝色覆盖、获取视图、清除等全部操作

## 影响范围
- 框选核心：ExtentPicker.vue（完全重写）
- 空间分析面板：SpatialAnalysisPanel.vue（简化）
- 控制面板：ControlsPanel.vue（简化 props）
- 地图下载：MapDownloader.vue（简化事件链）
- 图层面板：TOCPanel.vue（删除事件传递）
- 主页面：HomeView.vue（删除框选函数）
- 地图容器：MapContainer.vue（provide 地图实例 + 清理 expose）
- 框选 composable：useMapInteractionPickers.js（移除框选代码）

## 优化解决方案

### 核心设计
1. **MapContainer `provide('olMap', mapInstance)`** — 地图实例全局注入
2. **ExtentPicker `inject('olMap')`** — 直接获取地图实例，无需 prop 传入
3. **内置全部框选逻辑**：
   - DragBox 交互创建/销毁
   - 红色预览矩形（拖拽过程中）
   - 蓝色虚线覆盖层（框选完成后，按 showOverlay 决定是否保留）
   - "当前视图"按钮 — 一键获取当前地图可视范围
   - "清除"按钮 — 清除覆盖层和内部状态
   - onUnmounted 自动清理

### 接口设计
```vue
<!-- 分析场景（不保留覆盖层） -->
<ExtentPicker @extent-change="fillBbox" @extent-clear="clearBbox" />

<!-- 下载场景（保留蓝色覆盖层） -->
<ExtentPicker :show-overlay="true" @extent-change="applyBbox" @extent-clear="clearBbox" />
```

### 简化效果
- **删除**：4 层事件传递链、6 个中间函数、2 个 props 传递
- **保留**：公交选点 + 逆地理编码选点（useMapInteractionPickers.js 中）

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Common\ExtentPicker.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\ControlsPanel\SpatialAnalysisPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\ControlsPanel\ControlsPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapDownloader.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Layer\TOCPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useMapInteractionPickers.js`
