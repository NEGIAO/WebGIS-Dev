# WebGIS Project Architecture Roadmap (Vue 3 + Pinia + OpenLayers)

## 1. 核心架构原则 (Core Principles)
本项目正在进行彻底的解耦重构，从“巨石组件”转向“状态驱动（Store-Driven）”架构。所有 Agent 在生成代码时必须严格遵守以下原则：
- **Vue 归 Vue，地图归地图**：Vue 组件 (`.vue`) 仅负责 UI 渲染、DOM 事件绑定和读取/写入 Pinia Store。**绝对禁止**在 Vue 文件中直接编写复杂的 OpenLayers (OL) 或 Cesium 逻辑（除 `new Map` 挂载 DOM 外）。
- **Pinia 是唯一的神经中枢**：UI 面板（如公交规划、图层控制）与地图容器之间**零直接通信**。UI 触发操作 -> 修改 Pinia Store -> 纯 TS 编写的 MapManager/Renderer 监听 Store 变化 -> 执行地图 API 更新。
- **纯 JS/TS 引擎层**：所有地图图层管理、要素绘制、坐标转换逻辑必须封装在 `src/core/` 目录下的独立类中。

## 2. 目标目录结构 (Target Directory Structure)
```text
src/
├── api/                     # 第三方服务 API
├── stores/                  # 🧠 状态中心 (Pinia)
│   ├── appStore.ts          # UI 状态：侧边栏激活面板、移动端适配、弹窗状态
│   ├── mapStateStore.ts     # 地图状态：中心经纬度、缩放级别、当前底图、2D/3D模式
│   └── layerStore.ts        # 数据状态：已加载图层列表、显隐、样式参数
├── core/                    # ⚙️ 地图引擎层 (纯 TS/JS，解耦核心)
│   ├── map2d/               # OL 逻辑 (Map2DManager, LayerRenderer, DrawController)
│   └── gis-parser/          # 空间数据解析 (ZIP/KML/SHP/TIFF)
├── components/              # 🧩 视图组件层
│   ├── layout/              # 布局组件 (TopBar, SideBar, AppShell)
│   ├── map-ui/              # 悬浮在地图上的 UI (Zoom, ScaleBar, BasemapPicker, SearchBar)
│   └── panels/              # 侧栏业务面板 (LayerToolbox, AIChat, RoutePlanner)
├── composables/             # 🪝 组合式函数 (useUrlSync, useMapInit)
└── views/                   # 页面入口 (HomeView)