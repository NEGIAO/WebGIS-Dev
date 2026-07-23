# WebGIS 前端项目 — V3.3

> 基于 Vue 3 + Vite + OpenLayers + Cesium 的专业级 WebGIS 前端工程

> 🧭 **文档导航**：项目总览见 [根 README](../README.md) · 完整版本历史见 [更新日志 CHANGELOG](../Docs/Guide/CHANGELOG.md) · 八大功能架构见 [Docs/Architecture/](../Docs/Architecture/) · 开发约定见 [dev-conventions.md](../Docs/Guide/dev-conventions.md)

---

## 📋 项目概述

基于 **Vue 3 + Vite + OpenLayers + Cesium** 构建的专业级 WebGIS 前端应用。历经多次优化迭代，现已发展成为功能丰富、架构清晰的 WebGIS 平台。

### 🎯 核心功能

- 🗺️ **地图引擎**：OpenLayers 2D + Cesium 3D 地球，支持 `view=ol|cesium` URL 双向视图同步
- 🔁 **OL/Cesium URL 状态同步**：`lng/lat/z` 与 `cv=p.<pose>` 分工明确，2D/3D 切换自动换算可视范围
- 🧭 **Cesium 三维分析**：统一控制面板集成场景导航、数据导入、高级特效、GPU 风场、水体模拟
- 🏙️ **Google 真实 3D 模型**：Cesium 叠加层支持 Google Photorealistic 3D Tiles 倾斜摄影
- 🎮 **人物漫游控制器**：第一/第三人称 + Rapier 物理碰撞 + 导航指引 + 动画混合
- 🔐 **运行时 Token 池**：天地图 TK 与 Cesium Ion Token 由管理员后台配置，支持主/备 token 自动兜底
- 🌊 **掩膜分析（水体模拟）**：按捕捉区域高程值域生成外包盒，支持水位滑杆和水色调色板
- 🌪️ **GPU 风场粒子**：cesium-wind-layer 集成，WebGL 2 ComputeCommand + GLSL 300 es
- 📊 **数据管理**：多格式导入（GeoJSON/KML/SHP/GeoTIFF/CSV/GLB/GLTF/CZML/3D Tiles），批量导出
- 🔎 **高德 AOI 注入**：支持详情 JSON 与搜索 AOI，`@` 分隔的独立区域自动拆分为多个环
- 🎨 **可视化**：热力图、等高线、3D 要素、电影级效果（HDR/FXAA/HBAO/体积云/大气散射）
- 🔍 **交互**：绘制、测量、路线规划、地点搜索、卷帘分析
- 🌤️ **天气**：实时天气 + 趋势预报（ECharts 容器查询自适应）
- 🤖 **AI 助手**：LLM 集成地理问答，支持 Function Calling（三层降级）
- 🧭 **风水罗盘**：HUD 模式 + 传统模式，5 种主题，宫位解释系统
- ⚡ **性能**：ESM 分包、动态加载、30-50% 首屏加速

---

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 安装与运行

```bash
npm install
npm run dev
```

### 构建与预览

```bash
npm run build
npm run preview
```

### 体积分析

```bash
npm run build:analyze
```

---

## 🔧 环境变量

复制 `.env.example` 为 `.env.local` 后配置：

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_TILE_PROXY_BASE_URL=https://negiao-webgis.hf.space
VITE_TILE_PROXY_MODE=fallback
# Amap key is configured in the admin API key panel.
VITE_BASE_URL=./
```

> ⚠️ 天地图 TK 与 Cesium Ion Token 由管理员在用户中心统一配置，后端写入数据库；前端启动时通过 `/api/runtime-config/map-tokens` 读取一次主/备 token 池后直连第三方服务。不要在 `VITE_TIANDITU_TK` / `VITE_CESIUM_ION_TOKEN` 中写入真实值，Vite 会把它们打进前端产物。

---

## 📦 部署说明

| 场景 | `VITE_BASE_URL` |
|------|-----------------|
| 本地开发 | `./` |
| GitHub Pages (WebGIS-Dev) | `/WebGIS-Dev/` |
| GitHub Pages (WebGIS) | `/WebGIS/` |

构建示例：

```bash
VITE_BASE_URL=/WebGIS-Dev/ npm run build
```

---

## 📁 目录结构

前端完整文件树（`frontend/src/` 全部文件及注释）统一维护于 [`Docs/Guide/frontend-structure.md`](../Docs/Guide/frontend-structure.md)，本 README 不再重复维护，避免多处同步。

---

## 🏛️ 架构文档

平台八大核心功能的架构说明统一沉淀于 [`Docs/Architecture/`](../Docs/Architecture/)，完整跳转索引表见根 [README「架构文档」章节](../README.md#-架构文档)（前端相关模块尤为详尽）。

前端重点相关：

- 🗺️ [2D/3D 双引擎](../Docs/Architecture/ol-cesium-dual-engine.md) · 📥 [多格式数据导入](../Docs/Architecture/multi-format-data-import.md) · ✨ [三维特效](../Docs/Architecture/cesium-3d-effects.md) · 🧰 [实用工具](../Docs/Architecture/utility-tools.md)
- 🌊 [洪水淹没模拟 GPU 管线](../Docs/Architecture/cesium-fluid-flood-simulation.md)

---

## 📜 版本记录

前端完整版本历史（V3.3.18 → V1.0.0）已统一维护于根目录 [**更新日志 CHANGELOG**](../Docs/Guide/CHANGELOG.md)，本 README 不再单独维护版本记录，避免多处同步。

> 开发约定与提交规范见下方「开发约定」章节及 [Docs/Guide/dev-conventions.md](../Docs/Guide/dev-conventions.md)。

## 📐 开发约定

### 分层边界

| 层 | 职责 | 禁止 |
|----|------|------|
| `components/` | UI 渲染 + 事件 | 业务逻辑 |
| `composables/` | 编排流程 + 地图动作 | 直接操作 store state |
| `stores/` | 状态维护 + 派生 | 依赖 OL / Cesium 类 |
| `utils/` | 纯函数 + 解析 | 副作用 |
| `services/` | 外部 SDK 集成 | UI 逻辑 |
| `api/` | 外部服务调用与结果标准化 | 业务逻辑 |

### 导入约定

- 统一从聚合入口导入（如 `@/api`、`@/stores`、`@/composables/map`）
- 新增功能优先在 `composables/map/features` 扩展，避免堆叠到组件内
- 新增或重命名文件后，请同步更新本 README 的目录结构章节

### 新增文件必须补齐出口

新增 `api`/`store`/`constant`/`map feature`/`utils` 文件后，同步更新对应 `index` barrel。

### 提交前最小验收

- 运行 `npm run build`（构建校验通过）
- 检查是否出现跨层深链导入与重复实现

---

## 🛠️ 常用命令

```bash
npm run dev            # 启动开发服务器
npm run build          # 生产构建
npm run preview        # 预览生产构建
npm run lint           # ESLint 检查
npm run build:analyze  # 构建体积分析
```

---

## 📄 许可证

MIT

---

最后更新：2026-07-23
当前版本：V3.3.21
说明：`GlobalLoading.vue` 已在 `App.vue` 全局挂载，业务组件仅需调用 `showLoading(text)` 与 `hideLoading()` 即可。
