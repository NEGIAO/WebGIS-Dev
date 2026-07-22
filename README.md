# NEGIAO's WebGIS

> 专业级前后端分离 WebGIS 平台 · Vue 3 + OpenLayers + Cesium + FastAPI

[![Vue](https://img.shields.io/badge/Vue-3.5+-4FC08D?logo=vuedotjs)](https://vuejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![OpenLayers](https://img.shields.io/badge/OpenLayers-10.5-FFD700?logo=openlayers)](https://openlayers.org/)
[![Cesium](https://img.shields.io/badge/Cesium-1.132+-64B5F6?logo=cesium)](https://cesium.com/)
[![Deployment](https://img.shields.io/badge/Frontend-GitHub%20Pages-black?logo=github)](https://pages.github.com/)
[![Docker](https://img.shields.io/badge/Docker-24.x-2496ED?logo=docker)](https://www.docker.com/)
[![Deployment](https://img.shields.io/badge/Backend-Hugging%20Face-FFD21E?logo=huggingface)](https://huggingface.co/)
[![License](https://img.shields.io/badge/License-MIT-blue)](#-许可证)

---

<div align="center">
  
  > 🚀 **在线演示地址**：[NEGIAO's WebGIS-Dev - 欢迎点击体验](https://negiao.github.io/WebGIS-Dev/)
> 
</div>

<div align="center">
  
| 访问统计 (Visitors) | 累计克隆 (Total Clones) | 独立克隆人数 (Unique Cloners) | 最后提交 (Last Commit) |
| :---: | :---: | :---: | :---: |
| [![visitors](https://visitor-badge.laobi.icu/badge?page_id=negiao.webgis)](https://github.com/NEGIAO/WebGIS-Dev) | [![Total Clones](https://img.shields.io/badge/dynamic/json?label=Total%20Clones&query=$.totalClones&url=https://raw.githubusercontent.com/NEGIAO/WebGIS-Dev/main/.github/traffic.json&color=green)](https://github.com/NEGIAO/WebGIS-Dev/graphs/traffic) | [![Unique Cloners](https://img.shields.io/badge/dynamic/json?label=Unique%20Cloners&query=$.totalUniqueClones&url=https://raw.githubusercontent.com/NEGIAO/WebGIS-Dev/main/.github/traffic.json?cache=1&color=blue)](https://github.com/NEGIAO/WebGIS-Dev/graphs/traffic) | ![Last Commit](https://img.shields.io/github/last-commit/negiao/webgis-dev) |

</div>

<div align="center">

### 🌟 核心功能预览

| 🗺️ 底图卷帘对比 | 🧭 罗盘寻龙点穴 |
| :---: | :---: |
| <a href="https://github.com/user-attachments/assets/4a92dceb-085b-455f-b4f2-caa321fc8b1e"><img src="https://github.com/user-attachments/assets/4a92dceb-085b-455f-b4f2-caa321fc8b1e" width="400" /></a> | <a href="https://github.com/user-attachments/assets/a7afcac1-d95a-410a-a4ee-c10f410ac268"><img src="https://github.com/user-attachments/assets/a7afcac1-d95a-410a-a4ee-c10f410ac268" width="400" /></a> |
| **📐 二维数据管理** | **☁️ 三维漫游云景** |
| <a href="https://github.com/user-attachments/assets/394c7637-5054-48c6-92e1-a8ca0d7f9fd9"><img src="https://github.com/user-attachments/assets/394c7637-5054-48c6-92e1-a8ca0d7f9fd9" width="400" /></a> | <a href="https://github.com/user-attachments/assets/3b2aafa1-b476-4d93-a2ce-1eed9d8e37dd"><img src="https://github.com/user-attachments/assets/3b2aafa1-b476-4d93-a2ce-1eed9d8e37dd" width="400" /></a> |
| **🤖 智能助手交互** | **🌊 动态淹没分析** |
| <a href="https://github.com/user-attachments/assets/2dbbb794-ef3e-4d7a-b16b-4f381053fec3"><img src="https://github.com/user-attachments/assets/2dbbb794-ef3e-4d7a-b16b-4f381053fec3" width="400" /></a> | <a href="https://github.com/user-attachments/assets/e26761db-8f91-4f05-90f2-106b28223ab5"><img src="https://github.com/user-attachments/assets/e26761db-8f91-4f05-90f2-106b28223ab5" width="400" /></a> |

</div>


## [LLM 项目详细分析](https://deepwiki.com/NEGIAO/WebGIS-Dev)[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/NEGIAO/WebGIS-Dev)
> 不知如何下手？向大语言模型了解本项目的具体内容：(https://deepwiki.com/NEGIAO/WebGIS-Dev)

**NEGIAO's WebGIS** 是一个功能完整、架构清晰的**前后端分离** WebGIS 平台，历经多次优化迭代，现已进入 V3.3.20 阶段，体积云·大气模块缺陷修复（bottomRadius 统一 / BSM 纹理注入 / Aerial 双 gamma / 高度渐变淡出 / 云底颜色）+ 面板参数补全 + 邮件服务加固

> 📚 **文档已模块化**：本 README 作为项目门户页，仅保留核心概览与导航。完整的项目结构、开发约定、开发指南、技术栈与常见问题、更新日志等已拆分至 [`Docs/Guide/`](Docs/Guide/)，点击下方「文档导航」一键跳转。

---
## 📑 目录

- [项目简介](#-项目简介)
- [核心能力](#-核心能力)
- [快速开始](#-快速开始)
- [项目结构](#-项目结构)
- [架构文档](#-架构文档)
- [文档导航](#-文档导航)
- [版本演进](#-版本演进)
- [许可证](#-许可证)

---
### 🎯 项目定位

- **前端**：基于 Vue 3 + Vite + OpenLayers + Cesium，托管在 GitHub Pages  
- **后端**：基于 FastAPI + Python，用Dockers部署在 Hugging Face Spaces
- **架构**：RESTful API 通信，前后端完全解耦，支持独立扩展

### 💫 核心特性

**前端功能**：
- 🗺️ OpenLayers 2D + Cesium 3D 地球
- 🔁 **OL/Cesium 双向 URL 视图同步**：`view=ol|cesium`、`lng/lat/z` 与 `cv=p.<pose>` 分工明确，2D/3D 切换自动换算可视范围，分享链接刷新不覆盖待恢复视图
- 🧭 **Cesium 三维分析增强**：统一控制面板集成场景导航、**数据导入**、高级特效、风场、水体模拟与参数说明
- 🆕 **Cesium 数据导入**：GeoJSON/KML/KMZ/SHP/GLB/GLTF/CZML/3D Tiles 加载到 3D 场景；支持文件选择 + 拖拽上传 + GLTF 坐标弹窗
- 🔐 **运行时地图 Token 管理**：天地图 TK 与 Cesium Ion Token 由管理员后台配置，前端启动时读取一次后直连服务
- 🌊 **掩膜分析（水体模拟）**：基于地形高程值域动态生成外包盒，支持点击点海拔初始水位、水位滑杆和水色调色板
- Custom terrain + WTFS labels (in-repo providers, no TDT Cesium plugins)
- 📊 多格式数据导入（GeoJSON/KML/SHP/GeoTIFF/CSV）与导出
- 🔎 **高德 AOI 手动注入**：支持粘贴详情 JSON / 搜索 AOI 结果，兼容 `@` 分隔的独立多区域边界
- 🔎 **纯坐标串 AOI 注入**：支持双引号包围的坐标文本，按 `;` 分隔坐标对、按 `@` 分隔多区域，自动闭合首尾
- 🎨 电影级视觉效果、数据可视化、首屏特效
- 风水罗盘（HUD 模式 + 传统模式）+ 行政区划选择（边界加载 + TOC 同步），默认无 `cs`/`cs=0` 时保持关闭不绘制，打开罗盘面板不会隐式启用
- 🔍 绘制、测量、路线规划、地点搜索、**卷帘分析**
- 🌤️ 实时天气 + 趋势预报
- 🤖 AI 空间助手（LLM 集成）
- ⚡ 30-50% 首屏性能优化
- 🎨 **全局主题系统**：CSS 变量驱动，支持绿色/蓝色主题一键切换
- 🗂️ **TOC 图层管理增强**：图层重命名、透明度控制、属性查看、搜索过滤
- 📐 **空间分析**：缓冲区/交集/并集/差集/凸包/**泰森多边形/空间聚合/多环缓冲区/几何简化/渔网分析**（后端 Shapely 精确计算，统一 EPSG:3857 平面坐标）

**后端功能**：
- 📡 地理数据处理与坐标系转换
- 🗺️ 底图数据下载
- 🌦️ 天气数据服务
- 🛣️ 路线规划与导航
- 📰 新闻爬虫与数据采集
- 💾 GIS 数据格式转换
- ⚙️ 异步后台任务
- 🔐 三类身份登录 + 会话鉴权（/data 持久化）
- 📧 **邮箱账号体系**：邮箱作为新用户唯一登录账号，支持验证码注册、密码重置、旧用户名登录后绑定邮箱迁移
- 📐 **空间分析 API**：基于 Shapely 2.x + pyproj 的精确几何运算（缓冲区/叠加分析/凸包/泰森多边形/空间聚合/多环缓冲区/几何简化/渔网分析），统一 EPSG:3857 平面坐标系
- 🔑 **前端运行时配置 API**：`/api/runtime-config/map-tokens` 下发天地图与 Cesium 浏览器直连 token，避免生产构建硬编码

## 🚀 快速开始

### 环境要求

- **Node.js 16+** —— 前端构建与开发服务器
- **Docker Desktop** —— 容器化后端环境（**强制要求**）
- **LocalDev.bat** —— Windows 快速启动脚本（推荐使用）

### 启动后端

```bash
# Windows 系统
双击 LocalDev.bat

# 脚本会自动执行：
# 1. 检测环境依赖（Node.js / Docker / docker compose）
# 2. 自动配置前端 .env.local
# 3. 智能检测 Docker 镜像状态：
#    - 首次运行（无镜像）→ 自动构建
#    - 仅修改代码 → 跳过构建，靠 volume + reload 热重载
#    - Dockerfile 变更 → 提示用户选择是否重建
# 4. 启动前端开发服务器（http://localhost:5173）
# 5. 自动打开浏览器
```

> **说明**：`LocalDev.bat` 为纯 ASCII 编码，兼容 GBK/UTF-8 系统；中文彩色输出由 `Write-Color.ps1` 提供，两个文件需在同一目录下。

**访问地址**：
- 前端：http://localhost:5173
- 后端 API 文档：http://localhost:7860/docs

### 手动启动（高级用户）

#### 前端本地开发

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 访问应用
# http://localhost:5173
```

#### 后端本地开发（需要 Docker Desktop 运行）

```bash
# 1. 启动 Docker Compose（包含后端服务）
docker-compose up --build 
# 首次运行需要 --build 参数构建镜像，文件较大需等待几分钟下载

docker-compose up

# 2. 等待容器启动完成

# 3. 访问 API 文档
# http://localhost:7860/docs
```

**注意**：后端已升级为 Docker Compose 容器化部署，需要 Docker Desktop 支持。不再支持直接运行 `uvicorn`。

### 使用 Docker Compose（生产部署）

```bash
# 一键启动前后端
docker-compose up

# 后端 Docker
cd backend
docker build -t webgis-backend .
```

---

## 📁 项目结构

目录树统一维护于 [`Docs/Guide/`](Docs/Guide/)（原子化，不在 README 重复维护）：

- 🗂️ [项目根级目录总览 + Docs 文档树](Docs/Guide/project-structure.md)
- 📂 [前端完整文件树 `frontend/src/`](Docs/Guide/frontend-structure.md)
- 📂 [后端完整文件树 `backend/`](Docs/Guide/backend-structure.md)

---

## 🏛️ 架构文档

平台八大核心功能的架构说明均沉淀于 [`Docs/Architecture/`](Docs/Architecture/)，点击下表文档名可一键跳转到对应的 Markdown 源文件：

| 功能 | 架构文档 | 一句话说明 |
|------|---------|-----------|
| 🗺️ 2D/3D 双引擎 | [`ol-cesium-dual-engine.md`](Docs/Architecture/ol-cesium-dual-engine.md) | OpenLayers × Cesium 一键切换、视图状态双向同步与 URL 分享还原（`view`/`z`/`cv` 参数编码） |
| 🌐 丰富底图源 | [`basemap-source-system.md`](Docs/Architecture/basemap-source-system.md) | 20+ 瓦片图源双配置描述、熔断回退、GCJ-02 纠偏与自定义 XYZ 接入 |
| 📥 多格式数据导入 | [`multi-format-data-import.md`](Docs/Architecture/multi-format-data-import.md) | GeoJSON/KML/SHP/GLB/CZML/3D Tiles 拖拽加载，2D/3D 双管线与 blob URL 方案 |
| 📐 空间分析 | [`spatial-analysis-backend.md`](Docs/Architecture/spatial-analysis-backend.md) | 单端点 + operation 分发，Shapely 后端计算（缓冲/叠加/泰森/聚合/渔网等 8 算子） |
| 🛣️ 路径规划 | [`route-planning.md`](Docs/Architecture/route-planning.md) | 天地图驾车（XML）/公交（JSON）双管线、搜索选点与路线渲染 |
| ✨ 三维特效 | [`cesium-3d-effects.md`](Docs/Architecture/cesium-3d-effects.md) | 体积云 ray marching、风场粒子、浅水叠加、地形与后处理（含 README 与代码现状差异说明） |
| 🧰 实用工具 | [`utility-tools.md`](Docs/Architecture/utility-tools.md) | 距离/面积测量、坐标拾取、风水罗盘、分享链接、在线底图 GeoTIFF 下载 |
| 🔐 账号体系 | [`account-system-ai-quota.md`](Docs/Architecture/account-system-ai-quota.md) | 邮箱注册登录、三级身份、双 AI 配额、模型选取优先级与动态配置 |

**相关架构文档**：

- 🌊 [`cesium-fluid-flood-simulation.md`](Docs/Architecture/cesium-fluid-flood-simulation.md) — Cesium 洪水淹没模拟（水体流体）GPU 管线详解，三维特效的配套深度文档

---

## 🧭 文档导航

为简化阅读，原 README 的长篇章节已拆分为独立文档，按需点击跳转：

| 文档 | 内容 |
|------|------|
| 📁 [项目结构详解](Docs/Guide/project-structure.md) | 完整目录树与各模块职责说明 |
| 📐 [开发约定](Docs/Guide/dev-conventions.md) | 强制规范、分层边界、坐标系统约定、提交前检查、兼容性说明 |
| 🛠️ [开发指南与贡献指南](Docs/Guide/dev-guide.md) | 新增页面/API 标准流程、前后端通信、代码风格、贡献流程 |
| 📞 [技术栈与常见问题](Docs/Guide/faq.md) | 前后端技术栈、参考资源、常见问题 FAQ、TODO |
| 📜 [更新日志 CHANGELOG](Docs/Guide/CHANGELOG.md) | 完整版本演进历史（V3.3.18 → V1.0.0） |

---

## 📜 版本演进

> 完整版本历史见 [`Docs/Guide/CHANGELOG.md`](Docs/Guide/CHANGELOG.md)，以下仅展示最近三个版本摘要。

### V3.3.20 (2026-07-22) — 体积云迁移缺陷修复 + 面板参数补全 + 邮件服务加固

- 🐛 **bottomRadius 统一**：`pipeline.params.bottomRadius` 改为从 `atmosphereParams.bottomRadius` 派生，消除云层基准球与相机偏移基准球 ~830m 错位，修复云漂浮高度错误与移动抖动
- 🐛 **BSM 纹理注入修复**：`_bsmResolveGetTexture` 不再返回自定义 `bind()` 裸句柄（Cesium PostProcessStage 不识别），改为返回 `_syncBSM` blit 写入的共享 `Cesium.Texture`，云影/丁达尔稳定生效
- 🐛 **Aerial 双 gamma 修复**：地面像素不再走 `tonemapDisplay`（ACES+gamma），消除底图过曝白雾；新增 `u_aerialPerspectiveScale` uniform 独立控制空中透视对地面的散射强度
- 🆕 **groundAerialScale 分离**：空中透视 stage 对地面的发白程度独立于 Cloud Stage 云体透视（`aerialPerspectiveScale`），面板新增「地面发白」滑杆
- ⬆️ **shadowFar 提升**：40km → 120km，对齐云可见距离量级，消除 cascade 边界硬切与移动时阴影弹出
- ⬆️ **默认性能档改为均衡**：`DEFAULT_CLOUD_QUALITY` 从 `smooth` 改为 `balanced`（云+轻 BSM/光晕），流畅档 maxSteps 140→220、windSpeed/evolutionSpeed 微调
- 🆕 **面板新增控件**：`groundAerialScale`、`magentaFixStrength`（去品红）、`scatterG1/G2`（HG 散射权重）、`distFadeStart/End`（距离衰减）、`maxRayDistance`（最大采样距离）、`shadowSplitLambda`（级联分配）、`shadowFadeScale`（衰减范围）；全部控件补全 tooltip 描述
- 🔧 **shader 来源统一**：`bundledShaders.js` 为唯一真源，`public/` 与 `lib/Shaders/` 标注为镜像；`aerialPerspectiveEffect.frag` 行尾统一 LF
- 🆕 **体积云加载提示**：开启体积云时弹出 toast 提示「需加载约 4 个 8MB 纹理文件，请稍候」，加载完成后自动切换为成功提示
- 🔒 **SMTP 安全加固**：`SMTP_PORT` 环境变量非数字时不再导致模块级崩溃（安全 int 转换 + 默认值 80）；`check_smtp_configured()` 扩展为 USER/PASSWORD/HOST/PORT 四要素校验
- 📧 **邮件发信重试**：`_send_email_sync` 增加 3 次指数退避重试（1s→2s），每次失败打 WARNING 日志
- 📧 **启动 SMTP 配置检查**：`app.py` lifespan 启动时检查 SMTP 配置并打日志（脱敏显示 SMTP_USER）
- 🐛 **体积云高度渐变淡出**：修复相机升过云顶后云层突然消失——raymarch 起点改为云层入口距离，新增 `altitudeFadeRange` 参数线性淡出
- 🐛 **云底颜色修复**：云底不再纯黑，提升底部天空光比例 + 环境光地板，云底呈自然浅灰色

详见 [`Docs/LLM_record/26-07/26-07-22/2026-07-22-cloud-migration-defect-fix.md`](Docs/LLM_record/26-07/26-07-22/2026-07-22-cloud-migration-defect-fix.md)

### V3.3.19 (2026-07-21) — Cesium 体积云·大气一体化模块（cesium-clouds-atmosphere 移植）

- 🆕 **体积云 + Bruneton 大气集成**：`Cloud/` 模块从空目录恢复实现，源码以 `Cloud/lib/**` 内联（21 文件 / ~173KB JS + ~60KB GLSL bundle）。覆盖体积云 raymarch（多层 + 形状/细节 3D 噪声 + weather 图 + 湍流）、Bruneton 预计算大气（天空 + 太阳圆盘）、空中透视、Beer Shadow Map（云地投影 + 丁达尔光柱）、可选镜头光晕 Bloom、原生 WebGL PBO TAA
- 🆕 **Vue 桥接**：`Cloud/setupCloudIntegration.js` 懒加载管线（`cloudsEnabled=true` 才加载资源），启用时关闭 Cesium `skyAtmosphere`/`skyBox` 由 Bruneton 接管，关闭 / 卸载时销毁管线并恢复天空快照；`Cloud/cloudParamsApply.js` 桥接工具面板参数到 `pipeline.params` 与 BSM 缩放（同步大气 + Aerial 两侧）
- 🆕 **静态资源**：`public/cloud-atmosphere/` 拷贝云 3D 纹理 ~3.8MB（复用 `public/textures/cloud/` 同源 + 补 `stbn.bin`）、Bruneton 大气 LUT ~24MB、蓝噪声、shader GLSL；路径通过 `import.meta.env.BASE_URL + 'cloud-atmosphere/'` 解析，兼容 GitHub Pages 子路径部署
- ⬆️ **Cesium CDN 升级 1.122 → 1.132**：`Cesium.Texture3D` 自 1.130 才引入，1.122 下体积云管线初始化抛 `TypeError: Cesium.Texture3D is not a constructor`；统一升到库官方验证的 1.132 以解锁大气 LUT 与 stbn 的 3D 纹理路径
- 🔧 **ESM 适配**：库源码使用裸 `Cesium.xxx`，ESM 打包后会未定义。通过 `Cloud/lib/getCesium.js` + 各模块顶部 `const Cesium = getCesium()` 绑定本地常量；移除对 `dat.gui` 的硬依赖（默认 `enableGui=false`，调试面板由工具面板取代）
- 🔧 **工具面板体积云卡片重写**：移除旧 `cloudCoverage` / `cloudQuality` / Frostbite 字段，改为三层云覆盖 + 层高/层厚、太阳/云曝光、BSM 阴影/丁达尔、LensFlare Bloom/鬼影/Halo 等共 ~28 个控件；状态文本改为「云+BSM/仅体积云/未启用」
- 📚 **文件结构同步**：`Docs/Guide/frontend-structure.md` 中 `Cloud/` 树从原 TypeScript 描述更新为新 lib 内联架构

详见 [`Docs/LLM_record/26-07/26-07-21/2026-07-21-cesium-clouds-atmosphere-integration.md`](Docs/LLM_record/26-07/26-07-21/2026-07-21-cesium-clouds-atmosphere-integration.md)

### V3.3.18 (2026-07-21) — Agent 系统提示词平台简介集成 + 八大功能架构文档

- 🆕 **平台简介注入系统提示词**：`agentToolsSchema.js` 的 `buildSystemPromptWithTools()` 在工具说明前新增「平台简介」章节（2D/3D 双引擎、20+ 底图源、多格式数据导入、空间分析、路径规划、三维特效、实用工具、账号体系），用户询问"平台有什么功能/特色"时 AI 助手可准确作答
- 🔧 **助手身份句扩写**：系统提示词开头由"你是一个 WebGIS 地图助手"改为"运行在「WebGIS 3.0」平台上"，并附加"平台问题简洁回答、操作问题引导使用面板"的行为指引
- ℹ️ **三种 AI 模式全覆盖**：平台简介经 `_injectToolPromptIntoHistory()` 注入 history，默认 AI / 个人 Key / 后端代理模式均生效；原有三个工具调用规范与 XYZ URL 表不变
- 📚 **八大功能架构文档**：`Docs/Architecture/` 新增 8 份功能架构说明（2D/3D 双引擎、底图源体系、多格式数据导入、空间分析、路径规划、三维特效、实用工具、账号体系），风格统一（功能定位/文件结构/算法原理/参数表/局限与升级方向）；README 新增「架构文档」章节与跳转表格。其中三维特效文档如实标注了 README 历史描述与当前代码的差异（TAAU/BSM Shadow TAA/大气散射 LUT/wind-core 等已不存在）

详见 [`Docs/LLM_record/26-07/26-07-21/2026-07-21-Agent系统提示词平台简介集成.md`](Docs/LLM_record/26-07/26-07-21/2026-07-21-Agent系统提示词平台简介集成.md)

> 📜 更早版本（V3.3.17 及以前，含 V3.0.7 性能优化、V3.0.0 前后端分离等）请查阅 [完整更新日志 →](Docs/Guide/CHANGELOG.md)

---

## 📄 许可证

MIT License - 可自由使用、修改、分发

### 告知义务：
如果你在任何公开环境（包括但不限于网站、服务器、论文、展览）运行或部署本项目或其衍生版本，请通过邮件 [yaonaigao@gmail.com] 或 GitHub Issue 告知作者。告知你的使用，表明本项目使你得到了帮助即可。

## 👤 作者

**NEGIAO** - [GitHub](https://github.com/NEGIAO) | [项目分析](https://deepwiki.com/NEGIAO/WebGIS-Dev)

---

**项目托管**：
- 源代码：https://github.com/NEGIAO/WebGIS_Dev
- 前端部署：https://NEGIAO.github.io/WebGIS
- 后端部署：https://NEGIAO-WebGIS.hf.space

**最后更新**：2026-07-22
**当前版本**：V3.3.20
**项目状态**：开发中 - 持续迭代优化
