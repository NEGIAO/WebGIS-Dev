# 2026-06-05 侧边面板可拖拽调整比例 + 天气看板迁移

## 📅 日期和时间
2026-06-05 15:30 (Asia/Shanghai)

## 📝 修改内容
1. 新增 `ResizeHandle.vue` 可拖拽分割条组件
2. 修改 `HomeView.vue` 集成拖拽调整比例功能
3. 侧边面板宽度从固定值改为响应式百分比布局
4. 将 `WeatherChartPanel` 从 map-wrapper 迁移到 SidePanel 的 weather tab

## 🔍 修改原因
1. 侧边面板宽度固定为 400px，无法满足不同屏幕尺寸和用户个性化需求
2. 天气看板原先以绝对定位覆盖整个地图区域，遮挡了地图，用户无法同时查看地图和天气

## 📋 问题事件逻辑链条分析

### 核心症状
- 侧边面板宽度固定为 400px，无法调整
- 天气看板遮挡地图，无法同时查看

### 根本原因
- 布局采用固定像素值而非响应式比例
- 天气面板放在 map-wrapper 内部并以绝对定位覆盖

### 受影响模块
- `HomeView.vue` - 主页面布局
- `SidePanel.vue` - 侧边面板（新增 weather tab）
- `MapContainer` - 地图容器
- `WeatherChartPanel` - 天气看板

### 解决方案
1. 创建独立的 `ResizeHandle.vue` 拖拽分割条组件
2. 在 SidePanel 中新增 `weather` tab 模式
3. 天气模式切换时自动展开 SidePanel 并切换到 weather tab
4. 地图始终显示，不再被天气面板遮挡

## 🎯 影响范围
- 前端主页面布局 (`HomeView.vue`)
- 侧边面板组件 (`SidePanel.vue`)
- 地图容器尺寸响应 (`MapContainer.vue`)
- 新增组件 (`ResizeHandle.vue`)

## 💡 优化解决方案

### 1. ResizeHandle 组件
- 支持水平/垂直方向拖拽
- 可配置最小/最大比例限制
- 拖拽时提供视觉反馈
- 双击重置为默认比例

### 2. 天气看板迁移
```
原架构：
HomeView
├── map-wrapper
│   ├── MapContainer
│   └── WeatherChartPanel ← 遮挡地图
└── side-panel-wrapper

新架构：
HomeView
├── map-wrapper
│   └── MapContainer ← 始终可见
└── side-panel-wrapper
    └── SidePanel
        ├── info / chat / toolbox / bus / drive / compass
        └── weather ← 新增
```

### 3. HomeView 关键改动
- 移除 WeatherChartPanel 的 `<component>` 引用
- 移除 WeatherChartPanel 的静态导入
- 天气模式切换改为展开 SidePanel + 切换 weather tab
- MapContainer v-show 移除 `isWeatherBoardMode` 条件
- 向 SidePanel 传递 `:should-load-weather` prop

### 4. SidePanel 关键改动
- 新增 `import WeatherChartPanel`
- 新增 `shouldLoadWeather` Boolean prop
- 模板中新增 weather tab 内容区域
- no-padding class 增加 `activeTab === 'weather'`

## 📊 配置参数
| 参数 | 值 | 说明 |
|------|-----|------|
| DEFAULT_SIDE_PANEL_RATIO | 30% | 默认侧边面板占比 |
| MIN_SIDE_PANEL_RATIO | 20% | 最小占比限制 |
| MAX_SIDE_PANEL_RATIO | 70% | 最大占比限制 |
| min-width | 200px | 最小像素宽度 |

## ✅ 测试方案
1. 打开侧边面板，观察分割条是否显示
2. 拖拽分割条，验证比例变化是否平滑
3. 验证最小/最大比例限制是否生效
4. 双击分割条，验证是否重置为默认比例
5. 点击天气看板按钮，验证 SidePanel 自动展开并显示天气
6. 验证地图始终可见，不被天气面板遮挡
7. 关闭天气看板，验证切回新闻 tab

## 📁 修改的文件路径
- `WebGIS_Dev/frontend/src/components/Shell/ResizeHandle.vue` (新增)
- `WebGIS_Dev/frontend/src/components/Shell/SidePanel.vue` (修改)
- `WebGIS_Dev/frontend/src/views/HomeView.vue` (修改)