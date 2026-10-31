<p align="center">
  <a href="./README.md">🇨🇳 中文</a> | <a href="./Docs/README_EN.md">🇬🇧 English</a>
</p>

<h1 align="center">NEGIAO's WebGIS</h1> 

<p align="center">
  <em>专业级前后端分离 WebGIS 平台 · Vue 3 + OpenLayers + Cesium + FastAPI</em>
</p>

<p align="center">
  <a href="https://vuejs.org/"><img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs" alt="Vue" /></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite" alt="Vite" /></a>
  <a href="https://openlayers.org/"><img src="https://img.shields.io/badge/OpenLayers-10.11-FFD700?logo=openlayers" alt="OpenLayers" /></a>
  <a href="https://cesium.com/"><img src="https://img.shields.io/badge/Cesium-1.146-64B5F6?logo=cesium" alt="Cesium" /></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi" alt="FastAPI" /></a>
  <a href="https://rapier.rs/"><img src="https://img.shields.io/badge/Rapier-0.21-FF6B35" alt="Rapier" /></a>
  <a href="https://pages.github.com/"><img src="https://img.shields.io/badge/Frontend-GitHub%20Pages-black?logo=github" alt="Frontend" /></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-24.x-2496ED?logo=docker" alt="Docker" /></a>
  <a href="https://huggingface.co/"><img src="https://img.shields.io/badge/Backend-Hugging%20Face-FFD21E?logo=huggingface" alt="Backend" /></a>
  <a href="#-许可证"><img src="https://img.shields.io/badge/License-MIT-blue" alt="License" /></a>
</p>

<p align="center">
  🚀 <strong>在线演示</strong>：<a href="https://webgis.negiao.cn">NEGIAO's WebGIS-Dev — 欢迎点击体验</a>
</p>

<!-- 站点访问数据（51.la · 实时）：与上方技术栈徽章、下方仓库指标口径不同 —— 这里统计的是站点真实访问，
     不含镜像、抓取与 API 调用，故用表格单独分区，避免三类指标混成一条无法辨读的徽章带。
     7 项指标同宽同色（绿色），「数据统计时间」另起一行（灰色）—— 它是元数据而非指标，
     若塞进表格会因 ISO 串过长（约 300px）把整表拉失衡。
     数据由 CF Worker（workers/github-stats 的 /api/51la）解析上游后返回，边缘缓存 300s；
     7 项指标与站内页脚、账号总览同源同字段。 -->


<table align="center">
  <tr>
    <td align="center"><sub>最近活跃</sub></td>
    <td align="center"><sub>今日访客</sub></td>
    <td align="center"><sub>今日访问量</sub></td>
    <td align="center"><sub>昨日访客</sub></td>
    <td align="center"><sub>昨日访问量</sub></td>
    <td align="center"><sub>本月访问量</sub></td>
    <td align="center"><sub>总访问量</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.negiao.cn%2Fapi%2F51la&query=$.metrics.activeRecent&label=&color=4caf50&style=flat-square" alt="最近活跃" /></td>
    <td align="center"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.negiao.cn%2Fapi%2F51la&query=$.metrics.todayUsers&label=&color=4caf50&style=flat-square" alt="今日访客" /></td>
    <td align="center"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.negiao.cn%2Fapi%2F51la&query=$.metrics.todayPv&label=&color=4caf50&style=flat-square" alt="今日访问量" /></td>
    <td align="center"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.negiao.cn%2Fapi%2F51la&query=$.metrics.yesterdayUsers&label=&color=4caf50&style=flat-square" alt="昨日访客" /></td>
    <td align="center"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.negiao.cn%2Fapi%2F51la&query=$.metrics.yesterdayPv&label=&color=4caf50&style=flat-square" alt="昨日访问量" /></td>
    <td align="center"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.negiao.cn%2Fapi%2F51la&query=$.metrics.monthPv&label=&color=4caf50&style=flat-square" alt="本月访问量" /></td>
    <td align="center"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.negiao.cn%2Fapi%2F51la&query=$.metrics.totalPv&label=&color=4caf50&style=flat-square" alt="总访问量" /></td>
  </tr>
</table>

<p align="center">
  <sub><b>数据统计时间</b></sub>
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.negiao.cn%2Fapi%2F51la&query=$.updatedAt&label=&color=9e9e9e&style=flat-square" alt="数据统计时间" />
</p>

<p align="center">
  <img src="https://visitor-badge.laobi.icu/badge?page_id=negiao.webgis&left_text=README%20Views" alt="Views" />
  <img src="https://img.shields.io/github/last-commit/negiao/webgis-dev" alt="Last Commit" />
  <a href="https://github.com/NEGIAO/WebGIS-Dev/stargazers"><img src="https://img.shields.io/github/stars/NEGIAO/WebGIS-Dev?logo=github" alt="GitHub Stars" /></a>
  <a href="https://github.com/NEGIAO/WebGIS-Dev/forks"><img src="https://img.shields.io/github/forks/NEGIAO/WebGIS-Dev?logo=github" alt="GitHub Forks" /></a>
</p>

---

## 🌟 核心功能预览

<div align="center">


| **🗺️ 底图卷帘对比** | **🧭 罗盘寻龙点穴** |
| :---: | :---: |
| <a href="https://github.com/user-attachments/assets/c8cb6f16-04e0-4b9a-983f-22538e0bd65a"><img src="https://github.com/user-attachments/assets/c8cb6f16-04e0-4b9a-983f-22538e0bd65a" width="400" /></a> | <a href="https://github.com/user-attachments/assets/acbb5a56-bff7-44c3-848b-dbe178c52301"><img src="https://github.com/user-attachments/assets/acbb5a56-bff7-44c3-848b-dbe178c52301" width="400" /></a> |
| **📐 二维数据管理** | **☁️ 三维漫游云景** |
| <a href="https://github.com/user-attachments/assets/da18b733-8979-4beb-9ac6-c07423b86ba2"><img src="https://github.com/user-attachments/assets/da18b733-8979-4beb-9ac6-c07423b86ba2" width="400" /></a> | <a href="https://github.com/user-attachments/assets/7bedba67-d965-4640-ac32-f5d75630e434"><img src="https://github.com/user-attachments/assets/7bedba67-d965-4640-ac32-f5d75630e434" width="400" /></a> |
| **🤖 智能助手交互** | **🌊 动态淹没分析** |
| <a href="https://github.com/user-attachments/assets/b79777bb-6227-4375-898a-d3a612888294"><img src="https://github.com/user-attachments/assets/b79777bb-6227-4375-898a-d3a612888294" width="400" /></a> | <a href="https://github.com/user-attachments/assets/e26761db-8f91-4f05-90f2-106b28223ab5"><img src="https://github.com/user-attachments/assets/e26761db-8f91-4f05-90f2-106b28223ab5" width="400" /></a> |

<div align="center">🗺️ 腾讯 / 高德 / 天地图 矢量瓦片解析</div>
<img width="1280" height="718" alt="QQ20261015-213105" src="https://github.com/user-attachments/assets/b823dd99-1f51-46a2-821c-7778e2b008e6" />

</div>

---

## 📑 目录

- [🌟 核心功能预览](#-核心功能预览)
- [📑 目录](#-目录)
- [🎯 项目简介](#-项目简介)
  - [规模速览](#规模速览)
  - [核心能力 · 地图内核](#核心能力--地图内核)
  - [核心能力 · 三维与分析](#核心能力--三维与分析)
  - [核心能力 · 数据与协作](#核心能力--数据与协作)
  - [核心能力 · 账号与运维](#核心能力--账号与运维)
- [🧰 功能模块全景](#-功能模块全景)
- [🛠️ 技术栈](#️-技术栈)
- [⚠️ 建筑抓取合规声明（必读）](#️-建筑抓取合规声明必读)
- [🚀 快速开始](#-快速开始)
  - [环境要求](#环境要求)
  - [配置（双 env 文件架构，先看这一处）](#配置双-env-文件架构先看这一处)
  - [一键启动（推荐）](#一键启动推荐)
  - [手动启动（高级用户）](#手动启动高级用户)
  - [本地开发镜像](#本地开发镜像)
- [📁 项目结构](#-项目结构)
- [🏗️ 系统架构](#️-系统架构)
  - [分层架构总览](#分层架构总览)
  - [后端 API 面](#后端-api-面)
  - [域名映射](#域名映射)
- [🧭 文档导航](#-文档导航)
  - [开发文档（`Docs/Guide/`）](#开发文档docsguide)
  - [架构文档（`Docs/Architecture/`）](#架构文档docsarchitecture)
- [🚧 已知限制与当前状态](#-已知限制与当前状态)
- [Star History](#star-history)
- [📜 版本演进](#-版本演进)
- [📄 许可证](#-许可证)
- [👤 作者与托管](#-作者与托管)

---

## 🎯 项目简介

**NEGIAO's WebGIS** 是一个功能完整、架构清晰的前后端分离 WebGIS 平台（当前版本 V3.6.34），前端托管于 GitHub Pages（正式域名 webgis.negiao.cn），后端以 Docker 部署在 Hugging Face Spaces，通过 RESTful API 通信，支持独立扩展。

> 📚 本 README 仅保留核心概览与导航。完整文档已模块化至 [`Docs/Guide/`](Docs/Guide/)，详见下方「文档导航」。
>
> 📐 架构文档统一存放于 [`Docs/Architecture/`](Docs/Architecture/)，使用 Mermaid 流程图 / 时序图 / 状态图描述各子系统的模块关系、数据流向与文件交互，供技术交接与方案审查参考。
>
> 🤖 在本仓库使用 AI Agent 协作开发，请先阅读 [`Docs/Force_command.md`](Docs/Force_command.md)（强制执行规范，含红线与门禁）。
>
> 不了解项目全貌？试试 [DeepWiki — 向 LLM 提问本项目](https://deepwiki.com/NEGIAO/WebGIS-Dev) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/NEGIAO/WebGIS-Dev)

### 规模速览

| 维度 | 实测规模 |
|---|---|
| 前端 | 511 个源文件 / 约 18.5 万行（`.vue` / `.js` / `.ts`），70 个 Vue 单文件组件 |
| 后端 | 70 个 Python 文件 / 约 2.15 万行，15 组 REST 路由 |
| 文档 | `Docs/` 下 549 篇 Markdown（含 `Guide/` 13 篇、`Architecture/` 21 篇、`LLM_record/` 逐次开发记录） |
| 双语文案 | `zh-CN` / `en-US` 各 2000+ 行 i18n，30 个命名空间 |
| CI | 4 条工作流（`deploy` / `pre-check` / `codeql` / `traffic-counter`），`deploy` 内含 5 个 Job |

### 核心能力 · 地图内核

| 领域 | 说明 |
|------|------|
| 🗺️ 2D/3D 双引擎 | OpenLayers 10.11 + Cesium 1.146 一键切换，视图状态双向同步，URL 分享还原 |
| 🌐 丰富底图源 | **91 个底图预设 / 107 个图层定义**：天地图、高德、腾讯、天地图矢量、ESRI（含 Wayback 历史影像）、Sentinel-2 Cloudless、OSM、奥维等；熔断回退、GCJ-02/BD-09 纠偏、自定义 XYZ 接入 |
| 🧩 非标准瓦片在线纠偏 | **GCJ-02 / BD-09 → WGS-84**：高德、腾讯与 Google 中国的 GCJ-02 瓦片、百度的 BD-09 瓦片经独立纠偏服务**逐瓦片重采样**，输出与标准 XYZ 网格对齐的 256×256 影像，前端按普通底图直接加载，2D/3D 双引擎零改造；百度侧为跨网格重投影，另提供反向 `wgs2gcj` / `wgs2bd` 与通用直通代理 |
| 🧭 图层管理（TOC） | 统一目录：拖拽排序、行内重命名、显隐/透明度/样式、层级叠放定序、坐标转换（WGS-84 ⇄ GCJ-02）、单层导出（CSV/TXT/GeoJSON/KML）、二维图层导入 3D |
| 📊 属性表 | 视图范围筛选、字段可见性、全字段检索、CSV 导出、要素定位与删除 |
| ✏️ 绘制与测量 | 点/线/面/矩形/椭圆/圆/箭头/风向/军标共 9 类绘制；测距、测面；跨图层顶点编辑 |
| 🔍 地名检索 | 三提供者切换：天地图 / 高德 / Nominatim（国际），支持 POI ID、分页、起终点选点 |
| 🗂️ 行政区划 | 区划树下钻、边界加载、与图层体系共用坐标转换与导出链路 |
| 🎞️ 历史影像 | ESRI Wayback 版本目录（后端 SQLite 缓存 + 前端时序浏览） |
| 🌓 卷帘对比 | 左右底图任选，水平 / 竖直双向滑动 |

### 核心能力 · 三维与分析

| 领域 | 说明 |
|------|------|
| 📥 多格式数据导入 | GeoJSON / JSON / KML / KMZ / SHP（zip 或散件）/ CZML / GLB / GLTF / 3D Tiles（zip）/ GeoTIFF / CSV / GPX；2D/3D 双管线、ZIP 批量分组、`.prj` 投影识别、失败行内可重试 |
| 🏢 建筑白模抓取 | **腾讯地图 / 高德地图 / 天地图** 三类矢量瓦片：腾讯、高德实现建筑层级（CE）轮廓与楼高抓取解析，天地图实现 **12 类图层全量解析**；三者共用同一套解码与几何装配链路，放开图层过滤即可对腾讯、高德做全量解析；跨瓦片同标识融合、自动入库 TOC |
| 📐 空间分析 | **8 算子**：缓冲区、叠加、泰森多边形、热点聚合、渔网（方格/六边形）、凸包、多环缓冲、几何简化（Shapely 后端精确计算） |
| 🔬 三维分析 | 限高分析、可视域分析（`cesium/modules/analysis`，逐像素/射线两套实现） |
| ✨ 三维特效 | 体积云 ray marching、Bruneton 大气、BSM 云影、风场粒子、流体淹没模拟、浅水叠加、后处理（HBAO / 移轴 / 雾） |
| 🛩️ 面状航线规划 | 测区绘制、弓字形 / 五向倾斜采集、AGL 仿地、DJI KMZ 导入导出，接入统一图层管理 |
| 🚶 人物漫游 | 迁移自 `hh-hang/cesium-player-controller` 并持续对齐上游（当前对应 0.2.1）：Rapier 物理、局部系重锚、贴地修正、第一/第三人称 |
| 🛣️ 路径规划 | 天地图驾车 / 公交双管线，搜索选点与路线渲染 |
| 🎬 第一人称漫游 | 航线飞行（`route-fly`）：沿规划航线第一人称飞行，支持速度/视角控制 |

### 核心能力 · 数据与协作

| 领域 | 说明 |
|------|------|
| 🤖 AI 空间助手 | LLM 集成，**三种接入模式**（管理员默认 Key / 个人 Key / 后端代理）；function-calling 工具（视角、缩放、底图切换等）+ OL/Cesium 双引擎命令适配器，支持多步地图操作 |
| 🧭 风水罗盘 | 罗盘、寻龙点穴、方位叠加（`Docs/Guide/compass-types-note.md`） |
| 🌤️ 天气看板 | 实时天气与图表（Open-Meteo 类公开源，后端代理） |
| 🗞️ 新闻聚合 | 多平台热榜，直连 + 代理双通道竞速、静默刷新与本地缓存兜底 |
| 📢 站点公告 | 管理端下发，首次访问弹条 + 可关闭持久化 |
| 🎨 主题体系 | 设计令牌驱动的多主题（绿/蓝等）自动联动，深浅色与移动端适配 |

### 核心能力 · 账号与运维

| 领域 | 说明 |
|------|------|
| 🔐 账号体系 | 邮箱注册登录、Google / GitHub / Hugging Face OAuth 登录与绑定、**三级身份**（`guest` / `registered` / `admin`）、游客序号 `guest_no`、会话鉴权、双 AI 配额 |
| 🛡️ 管理控制台 | 运行时配置（地图 token、底图、Agent 参数、公告）、API Key 管理、访问统计、在线用户调试 |
| 📈 统计与监控 | 访问日志、UV/PV、实时在线 presence（心跳 + 下线）、SSE 日志流转发、`/statistics/*` 后台看板 |
| 🧰 实用工具集 | 屏幕特效（流体烟雾/引力场/维度塌陷/量子波/黑洞/圆环爆破）、测距测面、坐标拾取、视角分享、鸡汤、常用地点跳转 |

---

## 🧰 功能模块全景

按「引擎域」罗列的模块清单，便于快速定位代码：

**Cesium 工具面板（`cesium/composables/toolModules/`）**

`场景导航` · `大气·光照·天空` · `体积云` · `风场` · `流体淹没` · `浅水叠加` · `人物漫游` · `面状航线` · `航线飞行` · `三维分析（限高/可视域）`

**OpenLayers 工具（`ol/`）**

`绘制 drawing` · `空间分析 spatial-analysis` · `路径规划 routing` · `地名检索 search` · `底图 basemap` · `瓦片源 tile-source` · `行政区划 DistrictManager` · `URL 状态 url-state` · `启动编排 startup`

**公共域（`common/`）**

`侧栏外壳 shell（SidePanel/TopBar/公告条/全局加载）` · `图层树 layer-tree` · `数据导入 data-import` · `AI 对话 chat（agent/工具注册/命令总线）` · `罗盘 compass` · `天气 weather` · `用户与账号 user` · `命令总线 command-bus` · `地图视图 map-view` · `数据协议 data-protocol` · `界面 ui`

**侧栏标签页**（共 8 个，按使用懒加载，首次切到后保持挂载以保留状态）：`新闻热榜`（info 默认页）/ `工具箱` / `驾车规划` / `公交规划` / `风水罗盘` / `建筑抓取` / `天气` / `AI 助手`

---

## 🛠️ 技术栈

| 层 | 选型 |
|---|---|
| 前端框架 | Vue 3.5（Composition API）+ Vite 8.3 + Pinia 4.1 + Vue Router 5.4 |
| 二维地图 | OpenLayers 10.11 |
| 三维地图 | Cesium 1.146（`@cesium/engine`）+ Three.js 0.186（特效辅助） |
| 物理引擎 | `@dimforge/rapier3d-compat` 0.21（人物漫游刚体与碰撞） |
| 后端 | FastAPI ≥0.100（Python 3.12）、Shapely ≥2.0、SQLite 缓存、SSE 日志流 |
| 部署 | GitHub Pages / Cloudflare Pages / Posit Connect / Vercel（前端）；Hugging Face Docker（后端） |
| 质量 | ESLint、`vue/compiler-sfc` 编译校验、`tsc --noEmit`、结构树与配置注册表自检脚本、CodeQL |

---

## ⚠️ 建筑抓取合规声明（必读）

### 数据来源

三类数据源均为公开可访问的矢量瓦片服务，分属商业平台与政府机构：

| 界面标签 | 真实来源 | 本项目实现程度 |
|---|---|---|
| 腾讯 | **腾讯地图**（腾讯位置服务） | 仅建筑层级（CE）抓取解析 |
| 高德 | **高德地图**（高德开放平台） | 仅建筑层级（CE）抓取解析 |
| 天地图 | **天地图**（国家地理信息公共服务平台） | **全量解析**，12 类图层可选 |

三者共用同一套瓦片解码与几何装配链路，差别只在图层过滤与凭证策略。
**前端只实现了腾讯、高德的建筑层级（CE）抓取，天地图做了全量解析**；
在同一套解析器上放开图层过滤，即可对腾讯、高德做全量解析——这也是本项目开源的意义之一。

> 此前三类来源在界面与文档中曾以「建筑 1 / 建筑 2 / 矢量瓦片」匿名标识（出于合规考虑），现已恢复真实来源；历史版本日志仍保留当时的匿名化说明与原因。

### 使用边界

- 仅允许在你已获得官方授权的场景下使用建筑抓取能力；
- 严禁绕过权限、规避访问控制、破解或其他未授权技术手段；
- 严禁批量采集、离线库化、二次分发或用于未授权商用；
- 使用者必须自行遵守数据源服务条款、当地法律法规及平台政策；
- 项目默认提供范围/频率控制与前端合规确认提示，使用者仍需承担最终合规责任。

---

## 🚀 快速开始

### 环境要求

| 依赖 | 要求 | 说明 |
|------|------|------|
| **Node.js** | **20 LTS 及以上**（推荐 20.x / 22.x） | Vite 8 要求 Node `^20.19.0 \|\| >=22.12.0`，本项目按 20 LTS 验证。仓库未在 `package.json` 声明 `engines` |
| npm | 10+ | 随 Node 20 附带 |
| Docker Desktop | 仅全栈本地联调需要 | 只跑前端 `npm run dev` **不需要** Docker |
| Python | 3.12（容器内 `python:3.12-slim` 已固定） | 后端仅通过 Docker 运行，不支持裸 `uvicorn` |
| LocalDev.bat | Windows 一键启动脚本 | 自动检测上述依赖 |

### 配置（双 env 文件架构，先看这一处）

| 文件 | git 状态 | 用途 | 读取时机 | `APP_ENV` |
|------|----------|------|----------|-----------|
| **`deploy/.env`** | **git 追踪** | 部署环境（生产基线） | `npm run build` + 线上部署 | `production` |
| **`deploy/.env.local`** | **git 追踪** | 本地开发（覆盖 `.env`） | `npm run dev` + 本地后端 | `development` |
| `deploy/.env.example` | git 追踪 | 全集 key 目录（不写真值） | — | — |

**三层密钥分层**（L1/L2/L3）：

| 层 | 放哪里 | 做什么 |
|----|--------|--------|
| **L1** | `deploy/.env` / `.env.local`（不涉密） | URL、端口、前端 `VITE_*`、公开服务端点/超时 |
| **L2** | 管理员面板 + 数据库 | 地图 token、Agent/LLM Key 与参数、底图、公告（常变、动态生效） | 
| **L3** | Hugging Face **Secrets** | 绝密：`SUPER_USER`、OAuth secret、SMTP 密码、Supabase Key、监控令牌 |

说明与检查清单：[Docs/Guide/configuration.md](Docs/Guide/configuration.md) · 全景：[configuration-three-tier.md](Docs/Architecture/configuration-three-tier.md)

```bash
# 仓库根目录：.env（部署环境）与 .env.local（本地开发）双文件架构
# 两个文件都提交 git（L1 不涉密）
# 本地开发：Vite 读 .env.local，后端读 .env.local（覆盖 .env 的 production 值为 localhost）
# 部署构建：Vite 只读 .env（selectiveEnvPlugin 按 mode 二选一）
```

> 代理相关：后端部署在 Hugging Face，其政策**禁止挂载任何 `/proxy/*`、`/tiles/*` 中转**。瓦片代理与外部站点反代由 VPS 上的独立服务（`vpn.negiao.cn`，仓库 `tile-proxy`）承接，前端通过 `VITE_TILE_PROXY_BASE_URL` 拼接 `${base}/proxy/<host>/<path>`。

### 一键启动（推荐）

```bash
# Windows：双击 LocalDev.bat，脚本自动完成：
# 1. 检测环境依赖（Node.js / Docker / docker compose）
# 2. 本地开发环境：前端 Vite 读 .env.local，后端 load.py 读 .env.local（覆盖为 localhost 开发值）
# 3. 智能检测 Docker 镜像状态（首次构建 / 代码热重载 / Dockerfile 变更提示）
# 4. 启动前端开发服务器 → http://localhost:5173
# 5. 自动打开浏览器
```

> `LocalDev.bat` 为纯 ASCII 编码，兼容 GBK/UTF-8 系统；中文彩色输出由同目录 `Write-Color.ps1` 提供。

**访问地址**：前端 http://localhost:5173 · 后端 API 文档 http://localhost:7860/docs

> **本地开发默认管理员**：账号 `admin`，密码 `123456`。仅在 `SUPER_USER` 未配置且 `APP_ENV` 为 `development`/`dev`/`local`/`test` 时生效（`load.py` → `get_admin_password()`）；生产环境必须通过 HF Secrets 配置 `SUPER_USER`，否则管理员登录直接禁用。

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
<summary><strong>全栈一键（Docker 单容器，推荐）</strong></summary>

```bash
# nginx(前端静态+/api 反代) + FastAPI 同容器，单端口 7860
# 首次运行需 --build 构建镜像（文件较大，需等待几分钟）
docker compose -f deploy/docker-compose.yml up -d --build

# 后续运行
docker compose -f deploy/docker-compose.yml up -d
# → http://localhost:7860 （API 文档 /docs）
```

> 环境文件统一收敛在 `deploy/`（.env / .env.local）；后端不再支持直接运行 `uvicorn`。

</details>

<details>
<summary><strong>双轨部署（生产）</strong></summary>

```bash
# 前端静态轨：GitHub Actions 自动执行（Pages / 主页仓库 / HF Static），无需本地操作
# 全栈轨：push main 后 CI 组装 {Dockerfile, deploy/, backend/, frontend/}
#         推送 Hugging Face Space，镜像内自行 npm ci + vite build + uv sync

# 手动等价：构建全栈单容器镜像（nginx + FastAPI 同容器，单端口 7860）
docker build -t negiao/webgis -f deploy/Dockerfile .
docker run -p 7860:7860 negiao/webgis
```

</details>

### 本地开发镜像

后端 Docker 镜像已托管至 Docker Hub，可直接拉取用于本地开发，无需本地构建：

```bash
docker pull negiao/webgis_dev:V3.5      # 2026-08-03 构建，对应前端 V3.5.10
docker pull negiao/webgis_dev:latest    # 2026-08-23 构建，较新但仍滞后于源码
```

> ⚠️ 两个标签均构建于 2026-08 月，与当前代码（V3.6.23+）存在代差。镜像与 `deploy/docker-compose.yml` 同源（构建文件 `deploy/Dockerfile`），如需与源码一致请本地 `--build` 重建。

## 📁 项目结构

目录树统一维护于 [`Docs/Guide/`](Docs/Guide/)（原子化，不在 README 重复）：

- [项目根级目录总览 + Docs 文档树](Docs/Guide/project-structure.md)
- [前端完整文件树 `frontend/src/`](Docs/Guide/frontend-structure.md)
- [后端完整文件树 `backend/`](Docs/Guide/backend-structure.md)

---

## 🏗️ 系统架构

> 完整架构文档已模块化至 [`Docs/Architecture/`](Docs/Architecture/)：
> [系统架构总览](Docs/Architecture/system-architecture.md) · [CI/CD 流水线](Docs/Architecture/cicd-pipeline.md) · [部署关系与域名映射](Docs/Architecture/deployment-relationship.md)

### 分层架构总览

```mermaid
flowchart TB
    subgraph SRC["📦 源码层"]
        direction LR
        REPO_DEV["WebGIS-Dev
前端 + 后端源码"]
        REPO_HOME["NEGIAO.github.io
个人主页仓库"]
        REPO_PROXY["tile-proxy
VPS 代理 / 瓦片服务"]
    end

    subgraph CI["⚙️ CI / CD"]
        direction LR
        JOB_BUILD["① Build
npm run build → dist"]
        JOB_SYNC["② Sync
dist → 主页仓库WebGIS/目录"]
        JOB_DEPLOY["③ Deploy
多平台部署"]
    end

    subgraph DPL["🚀 部署平台"]
        direction LR
        P_GH["GitHub Pages"]
        P_HF["Hugging Face"]
        P_CF["Cloudflare"]
        P_PC["Posit Connect"]
        P_VC["Vercel"]
    end

    subgraph RT["🌐 运行时"]
        direction LR
        FE_HOME["个人主页
多域名"]
        FE_WEBGIS["WebGIS 前端
多域名"]
        BE["Docker 后端 API"]
        PR["VPS 反代
vpn.negiao.cn"]
        R2["瓦片存储
tiles.negiao.cc.cd"]
    end

    REPO_DEV --> JOB_BUILD
    REPO_PROXY --> PR
    JOB_BUILD --> JOB_SYNC
    JOB_SYNC --> REPO_HOME
    JOB_BUILD --> JOB_DEPLOY

    JOB_DEPLOY --> P_GH
    JOB_DEPLOY --> P_HF
    REPO_HOME --> P_GH
    REPO_HOME --> P_CF
    REPO_HOME --> P_PC
    REPO_HOME --> P_VC

    P_GH --> FE_HOME
    P_GH --> FE_WEBGIS
    P_HF --> FE_WEBGIS
    P_CF --> FE_HOME
    P_CF --> FE_WEBGIS
    P_PC --> FE_HOME
    P_PC --> FE_WEBGIS
    P_VC --> FE_HOME
    P_VC --> FE_WEBGIS
    P_HF --> BE

    FE_WEBGIS -->|"REST API"| BE
    FE_WEBGIS -->|"外部站点反代 / 瓦片代理"| PR
    FE_WEBGIS -->|"加载自定义瓦片"| R2
```

### 后端 API 面

后端共 15 组路由，均为 `/api/*` 前缀（Hugging Face 政策禁止 `/proxy/*`、`/tiles/*`）：

| 模块 | 前缀 | 主要内容 |
|---|---|---|
| 认证 | `/api/auth` | 邮箱注册登录、OAuth 回调、会话、游客登录（回传 `guest_no`）、配额 |
| 空间分析 | `/api/v1/spatial` | 单端点分发 8 算子 |
| 位置 | `/api/v1` | 逆地理 / IP 定位等 |
| AI 对话 | `/api/agent` | 会话、消息、默认 AI 模型与 Key 分配 |
| AI 管理 | `/api/admin/agent` | 模型与配额管理 |
| 外部代理 | `/api/proxy` | 仅 `amap/*`、`search/nominatim`、`geo/epsg`、`ipapi/country` 四类白名单 |
| 历史影像 | `/api/historical-imagery` | ESRI Wayback 图层目录 |
| 统计 | `/api/statistics/*`、`/api/log-visit` | 访问日志、中心看板、实时统计、消息、用户、访问事件 |
| 实时 | `/api/statistics` | SSE 流、心跳、在线 presence（ping / offline）、工单 |
| 公告 | `/api/announcement/*` | 当前公告、关闭记录 |
| 管理 | `/api/admin` | 运行时配置、下载 TTL、看板 |
| API 管理 | `/api/admin`、`/api/admin/api-keys` | 第三方 Key 池与分配 |
| 运行时配置 | `/api/runtime-config` | 前端可读的公开运行时配置（含 `features` 布尔） |
| 监控 | `/api/monitor/*` | 健康、日志流（SSE） |
| Webhook | `/api` | HF Hub 等平台回调 |

### 域名映射

**个人主页：**

| 域名 | 平台 | CDN | 国内访问 |
|------|------|-----|----------|
| `negiao.github.io` | GitHub Pages 默认 | ❌ | ⚠️ 不稳定 |
| `negiao.cloud-ip.cc` | GitHub Pages + 自定义域 | ✅ 可配 | ✅ 可访问 |
| `negiao.cc.cd` | Cloudflare Pages | ✅ Cloudflare | ❌ 被屏蔽 |
| `negiao.pages.dev` | Cloudflare Pages 默认 | ✅ Cloudflare | ✅ 流畅 |
| `negiao-pages.share.connect.posit.cloud` | Posit Connect | ❌ | ✅ 可访问 |
| `negiao.vercel.app` | Vercel | ❌ | ❌ 不可访问 |

**WebGIS 前端：**

| 域名 | 平台 | 来源 |
|------|------|------|
| `webgis.negiao.cn` | **正式域名（付费）** | CNAME → GitHub Pages |
| `negiao.github.io/WebGIS-Dev` | GitHub Pages | WebGIS-Dev 仓库根路径 |
| `negiao.github.io/WebGIS` | GitHub Pages | 主页仓库子目录 |
| `negiao.cloud-ip.cc/WebGIS-Dev` | GitHub Pages + 自定义域 | 自动跳转 |
| `webgis.negiao.cc.cd` | Cloudflare Pages | 私有域名挂载 |
| `webgis-dev.pages.dev` | Cloudflare Pages 默认 | 自动分配 |
| `negiao-webgis.share.connect.posit.cloud` | Posit Connect | 主页仓库触发 |
| `negiao-web.static.hf.space` | Hugging Face Static | 直接推送 |

**后端、代理与存储：**

| 组件 | 域名 | 平台 |
|------|------|------|
| 后端 API | `negiao-webgis.hf.space` | Hugging Face Docker |
| 外部反代 / 瓦片代理 | `vpn.negiao.cn` | VPS（独立仓库 `tile-proxy`） |
| 瓦片存储 | `tiles.negiao.cc.cd` | Cloudflare R2 |

> 完整域名清单、部署来源矩阵、平台能力对比见 [deployment-relationship.md](Docs/Architecture/deployment-relationship.md)

## 🧭 文档导航

### 开发文档（`Docs/Guide/`）

| 文档 | 内容 |
|------|------|
| [交接文档 handover](Docs/Guide/handover.md) | 接手必读：文档地图、三大架构速览、代码坐标、门禁流程与坑清单 |
| [开发约定](Docs/Guide/dev-conventions.md) | 强制规范、分层边界、坐标系统约定、提交前检查 |
| [开发指南与贡献指南](Docs/Guide/dev-guide.md) | 新增页面/API 标准流程、前后端通信、代码风格 |
| [项目结构详解](Docs/Guide/project-structure.md) | 完整目录树与各模块职责说明 |
| [前端结构](Docs/Guide/frontend-structure.md) / [后端结构](Docs/Guide/backend-structure.md) | 逐目录文件树 |
| [配置指南](Docs/Guide/configuration.md) | 三层配置（deploy .env / Admin+DB / HF Secrets） |
| [配置架构执行计划](Docs/Guide/configuration-architecture-plan.md) | 分阶段收拢配置的落地路线 |
| [OAuth 部署配置指南](Docs/Guide/oauth-deployment.md) | Google/GitHub 登录全流程 |
| [技术栈与常见问题](Docs/Guide/faq.md) | 前后端技术栈、参考资源、FAQ、TODO |
| [ESRI Wayback 图层清单](Docs/Guide/ESRI_Wayback_Layers_List.md) | 历史影像可用版本台账 |
| [罗盘类型说明](Docs/Guide/compass-types-note.md) | 罗盘几何与类型定义 |
| [更新日志 CHANGELOG](Docs/Guide/CHANGELOG.md) | 完整版本演进历史 |

### 架构文档（`Docs/Architecture/`）

**系统级**

| 文档 | 一句话说明 |
|------|-----------|
| [系统架构总览](Docs/Architecture/system-architecture.md) | 五层分层架构：源码 → CI/CD → 部署 → 运行时 → 用户 |
| [CI/CD 流水线](Docs/Architecture/cicd-pipeline.md) | 五 Job 流水线：Build → Sync → Multi-Deploy 详解 |
| [部署关系与域名映射](Docs/Architecture/deployment-relationship.md) | 域名清单、部署来源矩阵、平台能力对比 |
| [三层配置架构](Docs/Architecture/configuration-three-tier.md) | L1/L2/L3 全景：来源→统一入口→业务/前端消费与门禁 |

**功能级**

| 功能 | 文档 |
|------|------|
| 2D/3D 双引擎 | [`ol-cesium-dual-engine.md`](Docs/Architecture/ol-cesium-dual-engine.md) |
| 底图源系统 | [`basemap-source-system.md`](Docs/Architecture/basemap-source-system.md) |
| 底图单一事实源重构 | [`2026-08-02-basemap-ssot-refactor.md`](Docs/Architecture/2026-08-02-basemap-ssot-refactor.md) |
| 统一底图选择 | [`2026-08-20-unified-basemap-selection.md`](Docs/Architecture/2026-08-20-unified-basemap-selection.md) |
| 多格式数据导入 | [`multi-format-data-import.md`](Docs/Architecture/multi-format-data-import.md) |
| 空间分析后端 | [`spatial-analysis-backend.md`](Docs/Architecture/spatial-analysis-backend.md) |
| 路径规划 | [`route-planning.md`](Docs/Architecture/route-planning.md) |
| 三维特效 | [`cesium-3d-effects.md`](Docs/Architecture/cesium-3d-effects.md) |
| 洪水淹没模拟 | [`cesium-fluid-flood-simulation.md`](Docs/Architecture/cesium-fluid-flood-simulation.md) |
| 面状航线 | [`cesium-planar-route.md`](Docs/Architecture/cesium-planar-route.md) |
| 贴地策略 | [`2026-08-22-clamp-to-ground-strategy.md`](Docs/Architecture/2026-08-22-clamp-to-ground-strategy.md) |
| Cesium 统一图层管理 | [`cesium-unified-layer-management.md`](Docs/Architecture/cesium-unified-layer-management.md) |
| 实用工具集 | [`utility-tools.md`](Docs/Architecture/utility-tools.md) |
| 账号体系与 AI 配额 | [`account-system-ai-quota.md`](Docs/Architecture/account-system-ai-quota.md) |
| 地图 token 运行时池 | [`runtime-map-token-pool.md`](Docs/Architecture/runtime-map-token-pool.md) |
| 建筑抓取与入库方案 | [`tencent-building-import-plan.md`](Docs/Architecture/tencent-building-import-plan.md) |
| 瓦片纠偏系统（历史稿，已迁出） | [`tile-rectify-system.md`](Docs/Architecture/tile-rectify-system.md) |

**其它目录**：`Docs/Force_command.md`（Agent 强制规范）· `Docs/TODO/`（20+ 待办方案）· `Docs/LLM_record/`（逐次开发记录）· `Docs/Demo/`（特效与纠偏单页示例）· `Docs/Refactor.md`

---

## 🚧 已知限制与当前状态

坦白列出「README 容易说得比实际好」的部分，避免误判：

| 项目 | 状态 | 说明 |
|---|---|---|
| **在线底图导出（GeoTIFF）** | ⚠️ **前端保留、后端已下线** | `MapDownloader.vue` 依赖 `/api/download/*`，该模块在 V3.6.5 移除，HF 环境返回 404。方案见 `Docs/TODO/plan-download-*` |
| **瓦片纠偏（BD-09/GCJ-02 重采样）** | ⚠️ **实现已迁出本仓，能力仍在线** | 迁至独立仓 `tile-proxy`（线上 `vpn.negiao.cn/proxy/*`）；HF Space 政策禁止挂载 `/proxy/*`，故本仓只保留接入契约，见 [`tile-rectify-system.md`](Docs/Architecture/tile-rectify-system.md) |
| **新闻热榜 `cls`（财联社）** | ⚠️ 上游恒定 504 | 该平台标签页为空；其余 21 个平台正常 |
| **新闻 / 瓦片直连** | ⚠️ 国内间歇不可达 | 实际主通道为 `vpn.negiao.cn` 代理 |
| **`frontend/package.json` 版本号** | ⚠️ 未维护 | 字段值为 `2.0.0`，真实版本以 README / CHANGELOG 为准 |
| **单元测试** | ⚠️ 仅后端有部分覆盖 | `backend/tests/` 已有 6 个 unittest 文件（Agent 上下文、配置加载、历史影像、实时统计、SQLite 恢复、Webhook）；前端暂无单测，质量门禁为 ESLint + SFC 编译 + `tsc --noEmit` + 结构/配置自检脚本 |
| **`engines` 字段** | ❌ 未声明 | Node 版本靠文档约定（20 LTS） |

---

## Star History

<a href="https://www.star-history.com/?repos=NEGIAO%2FWebGIS-Dev&type=timeline&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=NEGIAO/WebGIS-Dev&type=timeline&theme=dark&legend=top-left&sealed_token=B5ReoH7FL9EMbjs7rJJ3APlIoYZwGKo3g2gC_4_0LxIrQ--e5uhUrYXR7UEBcnb3CU48BAX9--IyzI-TxTszy8HrMJ3oVSVvfowMjrMOxY8n477EUd4_Ip6F8EMaHsKX6H5b1JjudmBoRUn3HxJ1R6zxt3lO1CKGidFnlqFb2W_TXYy_sTk3AS3rn8v8" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=NEGIAO/WebGIS-Dev&type=timeline&legend=top-left&sealed_token=B5ReoH7FL9EMbjs7rJJ3APlIoYZwGKo3g2gC_4_0LxIrQ--e5uhUrYXR7UEBcnb3CU48BAX9--IyzI-TxTszy8HrMJ3oVSVvfowMjrMOxY8n477EUd4_Ip6F8EMaHsKX6H5b1JjudmBoRUn3HxJ1R6zxt3lO1CKGidFnlqFb2W_TXYy_sTk3AS3rn8v8" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=NEGIAO/WebGIS-Dev&type=timeline&legend=top-left&sealed_token=B5ReoH7FL9EMbjs7rJJ3APlIoYZwGKo3g2gC_4_0LxIrQ--e5uhUrYXR7UEBcnb3CU48BAX9--IyzI-TxTszy8HrMJ3oVSVvfowMjrMOxY8n477EUd4_Ip6F8EMaHsKX6H5b1JjudmBoRUn3HxJ1R6zxt3lO1CKGidFnlqFb2W_TXYy_sTk3AS3rn8v8" />
 </picture>
</a>

## 📜 版本演进

> 完整历史见 [`CHANGELOG.md`](Docs/Guide/CHANGELOG.md)，以下仅列最近版本摘要。

| 版本 | 日期 | 概要 |
|------|------|------|
| **V3.6.34** | 2026-10-31 | **移动端信息层级收敛 + Cesium 控制条对齐 OL + 首屏打包与依赖加载优化（构建链根治 + 异步组件韧性）+ TIF 解码依赖按需加载**。① OL/Cesium 坐标控制条逐项同构（显隐开关 → 坐标胶囊 → 瓦片级别 → 分隔线 → 主页），触屏默认收起、桌面默认展开，视觉统一为浅色玻璃外壳 + 内层品牌胶囊 + 等宽数值字体；Cesium 触屏坐标收敛为「经度, 纬度, 海拔」单行，瓦片级别由相机高度反解 OL zoom（取整规则与 OL `displayZoom` 一致）；② TOC 触屏默认只显示一级、点击逐级展开，搜索命中强制展开；落地页移动菜单关闭钮改 Lucide `X` SVG 修复 iOS 不居中；③ 移除 Vite 8 / rolldown 下失效的手动 `manualChunks` 与 `modulePreload` 白名单（应用模块被错并入以第三方库命名的 chunk、入口被迫引用 591 kB 的 `vendor-geotiff` blob），首屏 gzip 传输约 365 kB → 120 kB；④ 首屏 4 文件改 store 深导入、`useAuthStore` / `useUserPreferencesStore` 的 API 调用改按需 `import()`，切断 `stores/index.ts` 与 `src/api` 聚合桶，把整张 store 图与 axios 移出首屏预加载图；⑤ 新增 `defineResilientAsync`（占位 + 线性退避重试 + 超时兜底 + 内联样式占位，失败态可点击重试），账号中心五分页与图层面板搜索框改用它，修复分片挂起时「整块 UI 空白、无占位无重试」；⑥ `tifUtils.js` 四个顶层重依赖（geotiff 309 kB 等）下沉为函数内按需 import，`olRemoteServiceAdapter.js` 的 `ol/source` 桶导入改子路径，进入 OL 后不再连带下载栅格解码器。详见[完整更新日志](Docs/Guide/CHANGELOG.md) |
| **V3.6.33** | 2026-10-30 | **非标准瓦片在线纠偏文案回填 + Cesium 浮层与原生控件主题统一**。① 落地页核心功能新增第 11 张卡（与「建筑白模」同为整行宽卡，3 列 / 2 列断点均为 6 行、无孤卡），说明 GCJ-02（高德 / 腾讯 / Google 中国）与 BD-09（百度，跨网格）瓦片经服务端逐瓦片重采样后按标准 XYZ 网格直接使用；② 两份 README 的「核心能力 · 地图内核」各新增一行，写明机制与双引擎零改造；③ 订正「已知限制」中把 `tile-rectify-system.md` 称作「历史设计稿」的失实措辞 —— 该服务仍在生产运行，只是实现不在本仓；④ 新增「OSM代理」底图（图层定义 `osm_Backend_Proxy` + 预设 `osm_Backend_Proxy_preset`，走 `vpn.negiao.cn/proxy` 统一瓦片代理，解决 OSM 官方源境内间歇不可达）；⑤ **三维域并入全站主题体系** —— `--ctp-*` 令牌全族改别名指向 `--brand-*`，高级控制台（展开宽度 380→520px）、lil-gui 参数控件、Cesium 原生工具栏 / 搜索 / 动画 / 时间轴 / 底图选择器、罗盘 / 缩放栏 / 比例尺全部改为「浅玻璃 + 品牌色」，并随绿 / 蓝主题联动；InfoBox 正文在独立 iframe 内，新建 `useCesiumInfoBoxTheme.js` 注入主题样式并跟随 `data-theme` 重注入；⑥ 右下角坐标由只读文本改为可点击复制的按钮（位置 / 姿态 / 相机海拔三组）；⑦ 修复 iOS 图标塌陷、移动端折叠手柄缩小、语言切换激活态扁平、OL 移动端控制条占满底部、图层面板「URL 操作」子菜单指针穿缝即消失等问题。详见[完整更新日志](Docs/Guide/CHANGELOG.md) |
| **V3.6.32** | 2026-10-29 | **建筑抓取临时凭证框加固（登录密码被浏览器自动填充外发修复）**。① 该输入框原为 `type="password"`，Chrome 密码管理器对 password 字段忽略 `autocomplete=off`，会把**本站点保存的登录密码**填入 —— 凭据库按 origin 索引、与会话身份无关，实测游客态下填的仍是管理员密码；② 该值经「临时凭证优先于 L2」的短路逻辑，以 `?key=` / `?tk=` 明文发往 jsapi.amap.com 与 tile*.tianditu.gov.cn（天地图按瓦片逐请求，0.2° 范围量级达千次）；③ 改为 `type="text"` + `-webkit-text-security: disc` 遮蔽，密码管理器不再将其识别为凭据框，并补齐 `autocomplete` / 每源唯一 `name` / LastPass·1Password·Bitwarden 的 ignore 标记；④ 腾讯·高德·天地图改为**各自独立的凭证草稿**，修复单一 ref 导致「切 tab 后 A 源凭证被发给 B 源」；⑤ 提交前新增 24~64 位字母数字**格式闸门**，留空仍走管理端 L2（`amap_key` / `tianditu_tk`，数据库值本身未受影响）。详见[完整更新日志](Docs/Guide/CHANGELOG.md) |
更早版本（V3.6.31 及以前）请查阅 [完整更新日志 →](Docs/Guide/CHANGELOG.md)。

---

## 📄 许可证

[MIT License](LICENSE) — 可自由使用、修改、分发。

> **告知义务**：如果你在任何公开环境（网站、服务器、论文、展览等）运行或部署本项目或其衍生版本，请通过邮件 yaonaigao@gmail.com 或 GitHub Issue 告知作者你的使用即可。

---

## 👤 作者与托管

<div align="center">

**NEGIAO** — [GitHub](https://github.com/NEGIAO) · [个人主页](https://www.negiao.cn) · [DeepWiki 项目分析](https://deepwiki.com/NEGIAO/WebGIS-Dev)

| 源代码 | 前端部署 | 后端部署 |
|:------:|:--------:|:--------:|
| [GitHub](https://github.com/NEGIAO/WebGIS-Dev) | [webgis.negiao.cn](https://webgis.negiao.cn)（正式域名，GitHub Pages 托管） | [Hugging Face](https://NEGIAO-WebGIS.hf.space) |

<sub>V3.6.34 · 开发中 · 最后更新 2026-10-31</sub>

</div>
