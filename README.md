<h1 align="center">NEGIAO's WebGIS</h1>

<p align="center">
  <em>专业级前后端分离 WebGIS 平台 · Vue 3 + OpenLayers + Cesium + FastAPI</em>
</p>

<p align="center">
  <a href="https://vuejs.org/"><img src="https://img.shields.io/badge/Vue-3.5+-4FC08D?logo=vuedotjs" alt="Vue" /></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi" alt="FastAPI" /></a>
  <a href="https://openlayers.org/"><img src="https://img.shields.io/badge/OpenLayers-10.5-FFD700?logo=openlayers" alt="OpenLayers" /></a>
  <a href="https://cesium.com/"><img src="https://img.shields.io/badge/Cesium-1.132+-64B5F6?logo=cesium" alt="Cesium" /></a>
  <a href="https://pages.github.com/"><img src="https://img.shields.io/badge/Frontend-GitHub%20Pages-black?logo=github" alt="Frontend" /></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-24.x-2496ED?logo=docker" alt="Docker" /></a>
  <a href="https://huggingface.co/"><img src="https://img.shields.io/badge/Backend-Hugging%20Face-FFD21E?logo=huggingface" alt="Backend" /></a>
  <a href="#-许可证"><img src="https://img.shields.io/badge/License-MIT-blue" alt="License" /></a>
</p>

<p align="center">
  🚀 <strong>在线演示</strong>：<a href="https://negiao.github.io/WebGIS-Dev/">NEGIAO's WebGIS-Dev — 欢迎点击体验</a>
</p>

<p align="center">
  <img src="https://visitor-badge.laobi.icu/badge?page_id=negiao.webgis" alt="visitors" />
  <img src="https://img.shields.io/badge/dynamic/json?label=Total%20Clones&query=$.totalClones&url=https://raw.githubusercontent.com/NEGIAO/WebGIS-Dev/main/.github/traffic.json&color=green" alt="Total Clones" />
  <img src="https://img.shields.io/badge/dynamic/json?label=Unique%20Cloners&query=$.totalUniqueClones&url=https://raw.githubusercontent.com/NEGIAO/WebGIS-Dev/main/.github/traffic.json?cache=1&color=blue" alt="Unique Cloners" />
  <img src="https://img.shields.io/github/last-commit/negiao/webgis-dev" alt="Last Commit" />
</p>

---

## 🌟 核心功能预览

<div align="center">

| **🗺️ 底图卷帘对比** | **🧭 罗盘寻龙点穴** |
| :---: | :---: |
| <a href="https://github.com/user-attachments/assets/4a92dceb-085b-455f-b4f2-caa321fc8b1e"><img src="https://github.com/user-attachments/assets/4a92dceb-085b-455f-b4f2-caa321fc8b1e" width="400" /></a> | <a href="https://github.com/user-attachments/assets/a7afcac1-d95a-410a-a4ee-c10f410ac268"><img src="https://github.com/user-attachments/assets/a7afcac1-d95a-410a-a4ee-c10f410ac268" width="400" /></a> |
| **📐 二维数据管理** | **☁️ 三维漫游云景** |
| <a href="https://github.com/user-attachments/assets/394c7637-5054-48c6-92e1-a8ca0d7f9fd9"><img src="https://github.com/user-attachments/assets/394c7637-5054-48c6-92e1-a8ca0d7f9fd9" width="400" /></a> | <a href="https://github.com/user-attachments/assets/3b2aafa1-b476-4d93-a2ce-1eed9d8e37dd"><img src="https://github.com/user-attachments/assets/3b2aafa1-b476-4d93-a2ce-1eed9d8e37dd" width="400" /></a> |
| **🤖 智能助手交互** | **🌊 动态淹没分析** |
| <a href="https://github.com/user-attachments/assets/2dbbb794-ef3e-4d7a-b16b-4f381053fec3"><img src="https://github.com/user-attachments/assets/2dbbb794-ef3e-4d7a-b16b-4f381053fec3" width="400" /></a> | <a href="https://github.com/user-attachments/assets/e26761db-8f91-4f05-90f2-106b28223ab5"><img src="https://github.com/user-attachments/assets/e26761db-8f91-4f05-90f2-106b28223ab5" width="400" /></a> |

</div>

---

## 📑 目录

- [🌟 核心功能预览](#-核心功能预览)
- [📑 目录](#-目录)
- [🎯 项目简介](#-项目简介)
  - [核心能力](#核心能力)
- [🚀 快速开始](#-快速开始)
  - [环境要求](#环境要求)
  - [一键启动（推荐）](#一键启动推荐)
  - [手动启动（高级用户）](#手动启动高级用户)
- [📁 项目结构](#-项目结构)
- [🧭 文档导航](#-文档导航)
  - [开发文档](#开发文档)
  - [架构文档](#架构文档)
- [📜 版本演进](#-版本演进)
- [📄 许可证](#-许可证)
- [👤 作者与托管](#-作者与托管)

---

## 🎯 项目简介

**NEGIAO's WebGIS** 是一个功能完整、架构清晰的前后端分离 WebGIS 平台（当前版本 V3.3.21），前端托管于 GitHub Pages，后端以 Docker 部署在 Hugging Face Spaces，通过 RESTful API 通信，支持独立扩展。

> 📚 本 README 仅保留核心概览与导航。完整文档已模块化至 [`Docs/Guide/`](Docs/Guide/)，详见下方「文档导航」。
>
> 不了解项目全貌？试试 [DeepWiki — 向 LLM 提问本项目](https://deepwiki.com/NEGIAO/WebGIS-Dev) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/NEGIAO/WebGIS-Dev)

### 核心能力

| 领域 | 说明 |
|------|------|
| 🗺️ 2D/3D 双引擎 | OpenLayers 2D + Cesium 3D 一键切换，视图状态双向同步，URL 分享还原 |
| 🌐 丰富底图源 | 20+ 瓦片图源、熔断回退、GCJ-02 纠偏、自定义 XYZ 接入 |
| 📥 多格式数据导入 | GeoJSON / KML / SHP / GLB / CZML / 3D Tiles 拖拽加载，2D/3D 双管线 |
| 📐 空间分析 | 缓冲区 / 叠加 / 泰森多边形 / 聚合 / 渔网等 8 算子（Shapely 后端精确计算） |
| ✨ 三维特效 | 体积云 ray marching、Bruneton 大气、BSM 云影、风场粒子、洪水淹没模拟 |
| 🛣️ 路径规划 | 天地图驾车/公交双管线、搜索选点与路线渲染 |
| 🤖 AI 空间助手 | LLM 集成，三种接入模式（默认 / 个人 Key / 后端代理） |
| 🔐 账号体系 | 邮箱注册登录、三级身份、会话鉴权、双 AI 配额管理 |
| 🧰 实用工具 | 测量、坐标拾取、风水罗盘、卷帘分析、天气、主题切换、图层管理 |

---

## 🚀 快速开始

### 环境要求

| 依赖 | 用途 |
|------|------|
| Node.js 16+ | 前端构建与开发服务器 |
| Docker Desktop | 容器化后端环境（**强制要求**） |
| LocalDev.bat | Windows 一键启动脚本（推荐） |

### 一键启动（推荐）

```bash
# Windows：双击 LocalDev.bat，脚本自动完成：
# 1. 检测环境依赖（Node.js / Docker / docker compose）
# 2. 自动配置前端 .env.local
# 3. 智能检测 Docker 镜像状态（首次构建 / 代码热重载 / Dockerfile 变更提示）
# 4. 启动前端开发服务器 → http://localhost:5173
# 5. 自动打开浏览器
```

> `LocalDev.bat` 为纯 ASCII 编码，兼容 GBK/UTF-8 系统；中文彩色输出由同目录 `Write-Color.ps1` 提供。

**访问地址**：前端 http://localhost:5173 · 后端 API 文档 http://localhost:7860/docs

### 手动启动（高级用户）

<details>
<summary><strong>前端本地开发</strong></summary>

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

</details>

<details>
<summary><strong>后端（Docker Compose）</strong></summary>

```bash
# 首次运行需 --build 构建镜像（文件较大，需等待几分钟）
docker-compose up --build

# 后续运行
docker-compose up
# → http://localhost:7860/docs
```

> 后端已升级为 Docker Compose 容器化部署，不再支持直接运行 `uvicorn`。

</details>

<details>
<summary><strong>生产部署</strong></summary>

```bash
# 一键启动前后端
docker-compose up

# 或单独构建后端镜像
cd backend
docker build -t webgis-backend .
```

</details>

---

## 📁 项目结构

目录树统一维护于 [`Docs/Guide/`](Docs/Guide/)（原子化，不在 README 重复）：

- [项目根级目录总览 + Docs 文档树](Docs/Guide/project-structure.md)
- [前端完整文件树 `frontend/src/`](Docs/Guide/frontend-structure.md)
- [后端完整文件树 `backend/`](Docs/Guide/backend-structure.md)

---

## 🧭 文档导航

### 开发文档

| 文档 | 内容 |
|------|------|
| [项目结构详解](Docs/Guide/project-structure.md) | 完整目录树与各模块职责说明 |
| [开发约定](Docs/Guide/dev-conventions.md) | 强制规范、分层边界、坐标系统约定、提交前检查 |
| [开发指南与贡献指南](Docs/Guide/dev-guide.md) | 新增页面/API 标准流程、前后端通信、代码风格 |
| [技术栈与常见问题](Docs/Guide/faq.md) | 前后端技术栈、参考资源、FAQ、TODO |
| [更新日志 CHANGELOG](Docs/Guide/CHANGELOG.md) | 完整版本演进历史 |

### 架构文档

八大核心功能的架构说明沉淀于 [`Docs/Architecture/`](Docs/Architecture/)：

| 功能 | 文档 | 一句话说明 |
|------|------|-----------|
| 2D/3D 双引擎 | [`ol-cesium-dual-engine.md`](Docs/Architecture/ol-cesium-dual-engine.md) | 一键切换、视图同步与 URL 分享还原 |
| 丰富底图源 | [`basemap-source-system.md`](Docs/Architecture/basemap-source-system.md) | 20+ 图源、熔断回退、GCJ-02 纠偏 |
| 多格式数据导入 | [`multi-format-data-import.md`](Docs/Architecture/multi-format-data-import.md) | 拖拽加载，2D/3D 双管线与 blob URL 方案 |
| 空间分析 | [`spatial-analysis-backend.md`](Docs/Architecture/spatial-analysis-backend.md) | 单端点分发，Shapely 后端 8 算子 |
| 路径规划 | [`route-planning.md`](Docs/Architecture/route-planning.md) | 驾车/公交双管线、搜索选点与路线渲染 |
| 三维特效 | [`cesium-3d-effects.md`](Docs/Architecture/cesium-3d-effects.md) | 体积云、风场、浅水叠加与后处理 |
| 实用工具 | [`utility-tools.md`](Docs/Architecture/utility-tools.md) | 测量、坐标拾取、罗盘、分享、GeoTIFF 下载 |
| 账号体系 | [`account-system-ai-quota.md`](Docs/Architecture/account-system-ai-quota.md) | 邮箱登录、三级身份、双 AI 配额 |
| 洪水淹没模拟 | [`cesium-fluid-flood-simulation.md`](Docs/Architecture/cesium-fluid-flood-simulation.md) | GPU 流体管线详解（三维特效配套） |

---

## 📜 版本演进

> 完整历史见 [`CHANGELOG.md`](Docs/Guide/CHANGELOG.md)，以下仅列最近版本摘要。

| 版本 | 日期 | 概要 |
|------|------|------|
| **V3.3.22** | 2026-07-23 | 3D Tiles 贴地修复（模型底部高度 `center.height - radius`）+ ENU 参考系高程范围采样 + 手动贴地滑杆 + ArcGIS 地形性能极致优化（`_hasAvailability=false` / 动态 SSE / 层级硬顶 11） |
| **V3.3.21** | 2026-07-23 | Cesium Composables 架构重构（按功能域分层：core/scene/camera/layers/interaction/terrain/models/dataImport/toolModules），toolModules 控件拆分，importUtils 与 layerUtils 工具函数提取 |
| **V3.3.20** | 2026-07-22 | 体积云迁移缺陷修复（bottomRadius / BSM 纹理 / Aerial 双 gamma / 高度淡出 / 云底颜色）+ 面板参数补全 + 邮件服务加固 |

更早版本（V3.3.19 及以前）请查阅 [完整更新日志 →](Docs/Guide/CHANGELOG.md)

---

## 📄 许可证

[MIT License](LICENSE) — 可自由使用、修改、分发。

> **告知义务**：如果你在任何公开环境（网站、服务器、论文、展览等）运行或部署本项目或其衍生版本，请通过邮件 yaonaigao@gmail.com 或 GitHub Issue 告知作者你的使用即可。

---

## 👤 作者与托管

<div align="center">

**NEGIAO** — [GitHub](https://github.com/NEGIAO) · [DeepWiki 项目分析](https://deepwiki.com/NEGIAO/WebGIS-Dev)

| 源代码 | 前端部署 | 后端部署 |
|:------:|:--------:|:--------:|
| [GitHub](https://github.com/NEGIAO/WebGIS-Dev) | [GitHub Pages](https://negiao.github.io/WebGIS-Dev/) | [Hugging Face](https://NEGIAO-WebGIS.hf.space) |

<sub>V3.3.22 · 开发中 · 最后更新 2026-07-23</sub>

</div>
