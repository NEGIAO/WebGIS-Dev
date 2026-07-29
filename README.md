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
| <a href="https://github.com/user-attachments/assets/c8cb6f16-04e0-4b9a-983f-22538e0bd65a"><img src="https://github.com/user-attachments/assets/c8cb6f16-04e0-4b9a-983f-22538e0bd65a" width="400" /></a> | <a href="https://github.com/user-attachments/assets/acbb5a56-bff7-44c3-848b-dbe178c52301"><img src="https://github.com/user-attachments/assets/acbb5a56-bff7-44c3-848b-dbe178c52301" width="400" /></a> |
| **📐 二维数据管理** | **☁️ 三维漫游云景** |
| <a href="https://github.com/user-attachments/assets/91322c8a-bff5-4fcc-b0d4-fdf3924970ff"><img src="https://github.com/user-attachments/assets/91322c8a-bff5-4fcc-b0d4-fdf3924970ff" width="400" /></a> | <a href="https://github.com/user-attachments/assets/7bedba67-d965-4640-ac32-f5d75630e434"><img src="https://github.com/user-attachments/assets/7bedba67-d965-4640-ac32-f5d75630e434" width="400" /></a> |
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

**NEGIAO's WebGIS** 是一个功能完整、架构清晰的前后端分离 WebGIS 平台（当前版本 V3.5.0），前端托管于 GitHub Pages，后端以 Docker 部署在 Hugging Face Spaces，通过 RESTful API 通信，支持独立扩展。

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
| 🔐 账号体系 | 邮箱注册登录、Google/GitHub 一键注册登录与绑定、三级身份、会话鉴权、双 AI 配额管理 |
| 🧰 实用工具 | 测量、坐标拾取、风水罗盘、卷帘分析、天气、主题切换、图层管理 |

---

## 🚀 快速开始

### 环境要求

| 依赖 | 用途 |
|------|------|
| Node.js 16+ | 前端构建与开发服务器 |
| Docker Desktop | 容器化后端环境（**强制要求**） |
| LocalDev.bat | Windows 一键启动脚本（推荐） |

### 配置（三层，先看这一处）

| 层 | 放哪里 | 做什么 |
|----|--------|--------|
| **L1** | 根目录 tracked [`.env`](.env)（非涉密默认）+ [`.env.example`](.env.example)（全集目录） | 不涉密常量、URL、前端 `VITE_*`、公开服务端点/超时 |
| **L2** | 管理员面板 + 数据库 | 地图 token、Agent/LLM Key 与参数、底图、公告（常变、动态生效） |
| **L3** | Hugging Face **Secrets** | 绝密：`SUPER_USER`、OAuth secret、SMTP 密码、Supabase Key、监控令牌 |

说明与检查清单：[Docs/Guide/configuration.md](Docs/Guide/configuration.md) · 执行计划：[configuration-architecture-plan.md](Docs/Guide/configuration-architecture-plan.md)

```bash
# 仓库根目录：.env 已随仓库提交，作为 L1 非涉密默认配置
# 只改 URL/端点/超时等 L1；L2 启动后 admin 配，L3 生产放 HF Secrets
```

### 一键启动（推荐）

```bash
# Windows：双击 LocalDev.bat，脚本自动完成：
# 1. 检测环境依赖（Node.js / Docker / docker compose）
# 2. 使用根目录 tracked .env 作为前后端唯一 L1 默认配置（Vite 与后端都从根读取）
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
| [交接文档 handover](Docs/Guide/handover.md) | 接手必读：文档地图、三大架构速览、代码坐标、门禁流程与坑清单 |
| [开发约定](Docs/Guide/dev-conventions.md) | 强制规范、分层边界、坐标系统约定、提交前检查 |
| [开发指南与贡献指南](Docs/Guide/dev-guide.md) | 新增页面/API 标准流程、前后端通信、代码风格 |
| [技术栈与常见问题](Docs/Guide/faq.md) | 前后端技术栈、参考资源、FAQ、TODO |
| [更新日志 CHANGELOG](Docs/Guide/CHANGELOG.md) | 完整版本演进历史 |
| [配置指南 configuration](Docs/Guide/configuration.md) | 三层配置（根 .env / Admin+DB / HF Secrets） |
| [配置架构执行计划](Docs/Guide/configuration-architecture-plan.md) | 分阶段收拢配置的落地路线 |
| [OAuth 部署配置指南](Docs/Guide/oauth-deployment.md) | Google/GitHub 登录：控制台申请、HF Secrets 配置、验收与排错全流程 |

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
| 三层配置架构 | [`configuration-three-tier.md`](Docs/Architecture/configuration-three-tier.md) | L1/L2/L3 全景：来源→统一入口→业务/前端消费与门禁 |
| Cesium 统一图层管理 | [`cesium-unified-layer-management.md`](Docs/Architecture/cesium-unified-layer-management.md) | 设计评审稿：3D 数据接入统一 TOC 的两步走方案 |

---

## 📜 版本演进

> 完整历史见 [`CHANGELOG.md`](Docs/Guide/CHANGELOG.md)，以下仅列最近版本摘要。

| 版本 | 日期 | 概要 |
|------|------|------|
| **V3.5.0** | 2026-07-29 | 前端 domains 架构重构完成（Phase 1~9）。~160 个文件从旧扁平 `components/`、`composables/`、`stores/`、`services/`、`utils/`、`constants/` 迁入 `domains/ol/`、`domains/cesium/`、`domains/common/` 三域，消费方全量改用 `@ol/`、`@cesium-domain/`、`@common/` alias，旧目录清空删除。`vite.config.js` 补齐 4 个 alias 条目。构建通过（3763 modules, 23s）。详见[日志](Docs/LLM_record/26-07/2026-07-29/2026-07-29-task5-stores-services-utils-constants.md) |
| **V3.4.99** | 2026-07-29 | 前端 domains 架构 Task 5：stores + services + utils + constants 整理。70+ 文件从旧扁平结构迁入 `domains/ol/`、`domains/common/` 新域，全量消费方改用 `@ol/`、`@common/` alias，`vite.config.js` 补齐 4 个 alias 条目。详见[日志](Docs/LLM_record/26-07/2026-07-29/2026-07-29-task5-stores-services-utils-constants.md) |
| **V3.4.98** | 2026-07-29 | 前端 domains 架构 Task 4：composables 横切整理。25+ composables 文件迁入 `domains/common/`（chat/weather/user/utils/map-view/shell/app）与 `domains/ol/`（layer/composables），消费方改用 `@common/` alias，旧 `composables/` 目录删除。详见[日志](Docs/LLM_record/26-07/2026-07-29/2026-07-29-v3498-task4-composables-reorganize.md) |


更早版本（V3.3.21 及以前）请查阅 [完整更新日志 →](Docs/Guide/CHANGELOG.md)

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

<sub>V3.5.0 · 开发中 · 最后更新 2026-07-29</sub>

</div>
