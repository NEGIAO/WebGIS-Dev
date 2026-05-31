# ControlsPanel 绘制/测量/空间分析功能完善

- **日期和时间**：2026-05-27 11:00
- **修改内容**：完善左侧控制栏（ControlsPanel.vue）中绘制、测量、空间分析三大未实现功能模块，新增子面板交互和空间分析引擎
- **修改原因**：原 ControlsPanel 中"绘制"按钮仅硬编码触发 Polygon 类型，"测量"按钮仅触发测距，"空间分析"按钮仅显示 toast 提示，缺少子面板交互，不符合标准 WebGIS 项目交互规范
- **影响范围**：ControlsPanel.vue、DrawPanel.vue、MeasurePanel.vue、SpatialAnalysisPanel.vue、useSpatialAnalysis.js、HomeView.vue、MapContainer.vue
- **优化解决方案**：

## 问题核心症状

| 序号 | 功能模块 | 原始状态 | 问题描述 |
|------|----------|----------|----------|
| 1 | 绘制（draw） | 仅 emit `Polygon` | 缺少点/线/面选择子面板 |
| 2 | 测量（measure） | 仅 emit `MeasureDistance` | 缺少测距/测面选择子面板 |
| 3 | 空间分析（analyze） | 仅 emit `show-analysis` + toast | 无分析面板，无分析逻辑 |
| 4 | 标注（mark） | 直接触发 ReverseGeocodePick | 功能单一（已保留原逻辑） |

## 实施步骤

### Step 1: 新增 DrawPanel.vue
- 三个绘制类型按钮：点（Point）、线（LineString）、面（Polygon）
- 清除所有绘制按钮
- 操作提示区域

### Step 2: 新增 MeasurePanel.vue
- 两个测量模式按钮：测距（MeasureDistance）、测面（MeasureArea）
- 清除测量结果按钮

### Step 3: 新增 SpatialAnalysisPanel.vue
- 缓冲区分析（Buffer）：输入半径，选择目标图层
- 叠加分析（Overlay）：交集/并集/差集，选择两个图层
- 凸包分析（Convex Hull）：计算要素集最小凸多边形

### Step 4: 新增 useSpatialAnalysis.js composable
- `bufferFeatures()`: 基于正多边形近似的缓冲区生成
- `convexHullFeatures()`: Graham Scan 凸包算法
- `intersectionAnalysis()`: 包围盒交集检测
- `unionAnalysis()`: 要素合并
- `differenceAnalysis()`: 差集运算
- `runSpatialAnalysis()`: 统一入口，自动创建结果图层

### Step 5: 修改 ControlsPanel.vue
- 导入三个子面板组件
- 添加子面板可见性状态（drawPanelVisible/measurePanelVisible/spatialPanelVisible）
- 点击绘制/测量/分析按钮时切换对应子面板显示
- 添加子面板事件处理函数
- 添加子面板 CSS 定位样式

### Step 6: 完善事件通信链路
- ControlsPanel → HomeView：`spatial-analysis` 事件
- HomeView → MapContainer：`runSpatialAnalysis()` 方法
- MapContainer：初始化 createSpatialAnalysisFeature 并暴露到 defineExpose

## 修改的文件路径

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/DrawPanel.vue` | 新增 | 绘制子面板组件 |
| `frontend/src/components/MeasurePanel.vue` | 新增 | 测量子面板组件 |
| `frontend/src/components/SpatialAnalysisPanel.vue` | 新增 | 空间分析面板组件 |
| `frontend/src/composables/map/features/useSpatialAnalysis.js` | 新增 | 空间分析核心逻辑 |
| `frontend/src/composables/map/features/index.js` | 修改 | 添加 createSpatialAnalysisFeature 导出 |
| `frontend/src/components/ControlsPanel.vue` | 修改 | 集成子面板，完善交互逻辑 |
| `frontend/src/views/HomeView.vue` | 修改 | 添加 spatial-analysis 事件处理 |
| `frontend/src/components/MapContainer.vue` | 修改 | 初始化空间分析并暴露到 defineExpose |

## 测试方案
1. 启动开发服务器 `npm run dev`
2. 点击左侧"绘制"按钮 → 弹出绘制子面板，可选择点/线/面绘制类型
3. 点击左侧"测量"按钮 → 弹出测量子面板，可选择测距/测面模式
4. 点击左侧"空间分析"按钮 → 弹出分析面板，可配置缓冲区/叠加/凸包参数
5. 各子面板的"关闭"按钮和切换其他菜单项时自动关闭子面板
