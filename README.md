# NEGIAO's WebGIS

> 专业级前后端分离 WebGIS 平台 · Vue 3 + OpenLayers + Cesium +  FastAPI

[![Vue](https://img.shields.io/badge/Vue-3.5+-4FC08D?logo=vuedotjs)](https://vuejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![OpenLayers](https://img.shields.io/badge/OpenLayers-10.5-FFD700?logo=openlayers)](https://openlayers.org/)
[![Cesium](https://img.shields.io/badge/Cesium-1.122+-64B5F6?logo=cesium)](https://cesium.com/)
[![Deployment](https://img.shields.io/badge/Frontend-GitHub%20Pages-black?logo=github)](https://pages.github.com/)
[![Docker](https://img.shields.io/badge/Docker-24.x-2496ED?logo=docker)](https://www.docker.com/)
[![Deployment](https://img.shields.io/badge/Backend-Hugging%20Face-FFD21E?logo=huggingface)](https://huggingface.co/)
[![License](https://img.shields.io/badge/License-MIT-blue)](#许可证)

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

## 📖 项目简介
<img width="1248" height="723" alt="界面预览" src="https://github.com/user-attachments/assets/90255184-7623-46f5-97f3-115e07f4f917" />

## [LLM 项目详细分析](https://deepwiki.com/NEGIAO/WebGIS-Dev)[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/NEGIAO/WebGIS-Dev)
> 不知如何下手？向大语言模型了解本项目的具体内容：(https://deepwiki.com/NEGIAO/WebGIS-Dev)

**NEGIAO's WebGIS** 是一个功能完整、架构清晰的**前后端分离** WebGIS 平台，历经多次优化迭代，现已进入 V3.3.17 阶段，新增 3D Tiles ZIP/文件夹导入、管理员密码安全加固、后端模型选取去随机化

---
## 📑 目录

- [项目简介](#-项目简介)
- [核心能力](#-核心能力)
- [快速开始](#-快速开始)
- [项目结构](#-项目结构)
- [版本演进](#-版本演进)
- [开发约定](#-开发约定)
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

```
WebGIS_Dev/
├── .github/workflows/                 # CI/CD（前端 GitHub Pages 自动部署）
│
├── frontend/                         # 前端工程（Vue 3 + Vite）
│   ├── src/
│   │   ├── api/                      # 后端 API 客户端（axios + 拦截器）
│   │   ├── assets/                   # 全局样式与静态数据
│   │   ├── components/               # 业务组件（按功能域分组）
│   │   │   ├── Cesium/               # 3D 地球模块
│   │   │   │   ├── Cloud/            # 体积云模块（Ray Marching + 散射 + 纹理）
│   │   │   │   ├── PlayerController/ # 人物漫游控制器（第一/第三人称 + Rapier 物理 + 导航指引 + 动画混合 + 移动手感优化）
│   │   │   │   ├── FluidSimulation/  # 流体模拟（洪水模拟 + 水位动画）
│   │   │   │   ├── Wind/             # （原 GPU 风场模块，已清空）
│   │   │   │   ├── ShallowWater/     # Three.js 热带浅水（焦散/折射/吸色/体积云/闪电）
│   │   │   │   ├── composables/      # Cesium composables（图层/底图/URL 追踪等）
│   │   │   │   └── terrain/          # 地形 provider
│   │   │   ├── Chat/                 # AI 聊天
│   │   │   ├── Common/               # 通用组件（ExtentPicker 等）
│   │   │   ├── Compass/              # 罗盘控制 + 宫位解释
│   │   │   ├── ControlsPanel/        # 左侧控制栏
│   │   │   ├── Layer/                # 图层 / TOC / 属性表
│   │   │   ├── Map/                  # 主地图容器
│   │   │   ├── Routing/              # 路线规划
│   │   │   ├── Search/               # 搜索与数据注入
│   │   │   ├── Shell/                # 顶层壳（TopBar / SidePanel / Loading）
│   │   │   ├── UserCenter/           # 用户中心
│   │   │   ├── Weather/              # 天气面板
│   │   │   └── feng-shui-compass-svg/  # 罗盘 SVG 组件
│   │   ├── composables/              # 组合式函数（业务编排层）
│   │   │   ├── auth/                 # 鉴权身份校验
│   │   │   ├── dataImport/           # 数据导入工具
│   │   │   ├── Magic/                # 首屏视觉特效
│   │   │   ├── map/                  # 地图核心 composables
│   │   │   │   ├── features/         # 30+ 功能模块（高亮/样式/序列化/导出等）
│   │   │   │   └── toc/              # TOC 协议层
│   │   │   ├── tileSource/           # 瓦片源工厂
│   │   │   ├── weather/              # 天气 composables
│   │   │   ├── useAgentConfig.js     # Agent 配置共享
│   │   │   ├── useMarkdownRenderer.js # Agent Markdown 渲染（marked + hljs）
│   │   │   └── ...                   # 其他业务 composable（20+ 文件）
│   │   ├── config/                   # 环境变量集中管理
│   │   ├── constants/                # 常量配置（底图 / Agent Schema）
│   │   ├── router/                   # Vue Router
│   │   ├── services/                 # 服务层（外部 SDK 集成）
│   │   ├── stores/                   # Pinia 状态管理
│   │   │   ├── useAppStore.ts        # 全局应用状态
│   │   │   ├── useAttrStore.ts       # 属性表状态
│   │   │   ├── useAuthStore.ts       # 鉴权状态
│   │   │   ├── useChatStore.ts       # Chat 工具调用状态
│   │   │   ├── useCompassStore.ts    # 罗盘状态
│   │   │   ├── useDownloadStore.ts   # 下载任务状态
│   │   │   ├── useFeatureStyleStore.ts  # ★ 要素高亮样式（多选 + TOC 联动）
│   │   │   ├── useLayerStore.ts      # 图层状态
│   │   │   ├── useSwipeConfigStore.ts   # 卷帘配置
│   │   │   ├── useThemeStore.ts      # 主题状态
│   │   │   ├── useTOCStore.ts        # TOC 元数据
│   │   │   ├── useUrlParamStore.ts   # URL 参数
│   │   │   ├── useUserPreferencesStore.ts
│   │   │   └── useWeatherStore.ts    # 天气状态
│   │   ├── data/                     # 应用数据（懒加载）
│   │   ├── workers/                  # Web Worker（TIF / SHP 后台解析）
│   │   ├── utils/                    # 工具函数
│   │   │   ├── map/                  # 地图工具（featureKey / viewScaleConverter）
│   │   │   ├── gis/                  # GIS 工具（KML / SHP / TIF 解析）
│   │   │   ├── url/                  # URL 编解码
│   │   │   └── ...
│   │   ├── views/                    # 页面级组件
│   │   │   ├── HomeView.vue          # 主页面
│   │   │   ├── RegisterView.vue      # 注册 / 登录
│   │   │   ├── NotFoundView.vue      # 404 兜底
│   │   │   └── home/                 # HomeView 拆分模块
│   │   ├── App.vue
│   │   └── main.js
│   ├── public/                       # 静态资源
│   ├── package.json
│   ├── vite.config.js
│   └── README.md                     # 前端详细文档
│
├── backend/                          # 后端工程（FastAPI + Docker）
│   ├── api/                          # API 路由模块
│   │   ├── auth/                     # 鉴权子系统（14 个模块：邮箱/会话/配额/系统配置）
│   │   ├── agent_chat/               # LLM Agent 对话代理（动态配置/配额/上游调用）
│   │   ├── spatial/                  # 空间分析 API（Shapely 2.x，operations/ 8 个算子）
│   │   ├── api_keys_management.py    # 主/备密钥管理 + 运行时 token 池下发
│   │   ├── proxy.py                  # 通用代理 + GCJ-02 纠偏
│   │   └── ...                       # admin / location / monitor / statistics
│   ├── download_xyz/                 # 在线底图下载引擎（瓦片/任务/调度）
│   ├── gcj_rectify/                  # GCJ-02 坐标纠偏模块
│   ├── services/                     # 共享业务服务（ip_geo 等）
│   ├── utils/                        # 通用工具（北京时间/整点报时）
│   ├── data/                         # 运行时数据（SQLite 数据库）
│   ├── app.py                        # FastAPI 主入口
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── pyproject.toml
│   └── README.md                     # 后端详细文档
│
├── Docs/                             # 维护日志（按年月归档）
│   ├── 26-04/                        # 2026-04 日志（6 个子目录）
│   ├── 26-05/                        # 2026-05 日志（11 个子目录）
│   ├── 26-06/                        # 2026-06 日志
│   │   ├── 26-06-02/ ~ 26-06-06/     # 6 月上旬日志
│   │   ├── 26-06-09/ ~ 26-06-11/     # 日志
│   │   ├── 26-06-14/ ~ 26-06-15/     # 日志
│   │   ├── 26-06-17/ ~ 26-06-22/     # 日志
│   │   ├── 26-06-24/                 # 体积云设计文档
│   │   ├── 26-06-26/                 # 大气 LUT + 模块卡片 + 浅水 + 漫游控制器
│   │   ├── 26-06-27/                 # 体积云重构 + 洪水模拟 + 漫游优化
│   │   ├── 26-06-28/                 # LLM 动态配置管理
│   │   └── 26-06-30/                 # SQLite 损坏恢复命令记录
│   ├── 26-07/                        # 2026-07 日志
│   │   ├── 26-07-01/ ~ 26-07-06/     # 7 月上旬日志
│   │   ├── 26-07-09/                 # 后端模型选取去随机化 + 管理员密码加固 + 3D Tiles 导入
│   ├── 06-28/                        # useAgentConfig 编辑模式修复 + Chat 面板修复
│   ├── 06-29/                        # 下载底图跳转 + 标注链路 + TOC 缓存 + TIF 渲染优化
│   ├── Architecture/                  # 架构设计文档
│   ├── Example_prompt.md
│   ├── Force_command.md
│   └── TODO/
│
├── .gitignore
├── LICENSE
└── README.md                         # 本文件
```

---

## 📜 版本演进

### V3.3.17 (2026-07-09) — 3D Tiles ZIP/文件夹导入 + 管理员密码安全加固 + 后端模型选取去随机化

- 🆕 **3D Tiles ZIP/文件夹导入**：`CesiumToolPanel.vue` 新增 ZIP导入/文件夹导入 按钮，`useCesiumDataImport.js` 实现 ZIP 解压（JSZip）→ blob URL 映射 → tileset.json content URL 重写→ Cesium3DTileset 加载，兼容 3D Tiles 1.0/1.1 content 格式
- 🆕 **3D Tiles 本地文件 file:// URL 优先**：`loadTileset` 优先使用 `file.path` 构造 file:// URL 保留相对路径解析能力（Electron），无路径时回退到 blob URL
- 🔒 **管理员密码安全加固**：移除硬编码 `DEFAULT_ADMIN_PASSWORD_LOCAL="123456"`，`_get_admin_password()` 仅在 `APP_ENV=development` 时使用开发默认密码，生产环境 SUPER_USER 未设置则禁用管理员登录（HTTP 503）
- 🐛 **后端模型选取去除随机化**：`_pick_runtime_model` 移除 `random.choice(pool)` 逻辑，管理员在数据库 `system_config.agent_model` 中配置的模型不再被随机选取覆盖，新的优先级为：用户覆盖 > 用户偏好 > 管理员配置 > 环境默认值
- 🗑️ **清理废弃代码**：移除 `import random`（已无其他用途），`model_source="provider-random"` 字符串不再出现

详见 [`Docs/26-07/26-07-09/2026-07-09-后端代理模式模型随机选取修复.md`](Docs/26-07/26-07-09/2026-07-09-后端代理模式模型随机选取修复.md)

### V3.3.16 (2026-07-06) — 路径规划搜索集成 + 注记图层 HD 兼容 + 错误处理优化

- 🆕 **驾车/公交规划集成天地图搜索**：`MapPointPickerCard.vue` 新增起点/终点关键词搜索输入框 + 下拉结果列表，AbortController 防竞态保护，支持键盘导航（方向键/Enter）和鼠标选择
- 🆕 **注记图层 HD 兼容**：新增 `withSkipHighResTile` 辅助函数，4 个 `category='label'` 图层（天地图 cia/cva、GeoVIS cia、高德注记）跳过 `zDirection` 高清瓦片优化，避免注记文字在非整数 zoom 时显示过小
- 🆕 **TokenMissingError 语义化错误**：驾车规划新增 `TokenMissingError` 自定义错误类，Token 缺失时显示明确配置提示
- 🔧 **错误判断修复**：移除 `e instanceof TypeError` 网络错误判断（误捕渲染链路 TypeError），改用 `/failed\s+to\s+fetch/i` 精准识别
- 🔧 **调试/渲染顺序调整**：驾车规划先更新调试信息再执行地图渲染，确保渲染失败后调试数据不丢失
- 🔧 **公交规划 Token 前置校验**：构建请求 URL 前检查 Token 是否为空，空则抛语义化错误
- 🐛 **Edit 工具重复内容修复**：清理 `MapPointPickerCard.vue` 中因连续 Edit 替换导致的重复 import/props/emits/代码块

详见 [`Docs/26-07/26-07-06/2026-07-06-路径规划搜索集成与bug修复.md`](Docs/26-07/26-07-06/2026-07-06-路径规划搜索集成与bug修复.md)

### V3.3.15 (2026-07-02) — GPS 定位授权逻辑修复

- 🐛 **修复定位授权逻辑**：仅当用户明确授权 GPS 定位（`source === 'gps'`）时，才在 URL 中设置 `loc=1` 并将坐标编码写入 `p` 参数
- 🐛 **IP 定位不再写入 `loc=1` 和 `p` 参数**：IP 定位仅保留全局定位上下文供内部使用，URL 参数保持 `loc=0`、`p=0`
- 🔧 **`useUserLocation.js::markLocationSuccessFlagInUrl()`**：新增 `source` 参数，仅 GPS 定位时写入 `loc=1`
- 🔧 **`useMapState.js::resolveLocationState()`**：重构为解析定位授权状态，新增 `hasGpsAuthorization` 和 `urlHasLocFlag` 字段
- 🔧 **`useMapState.js::resolvePositionCode()`**：仅 `hasGpsAuthorization` 为 true 时编码 GPS 坐标到 `p` 参数
- 🔧 **`useMapState.js::parseUrlToState()`**：仅 URL 中 `loc=1` 时解码 `p` 参数
- 🔧 **`useMapState.js::buildQuery()`**：基于 `shouldSetLoc` 同步设置 `loc` 和 `p` 参数

详见 [`Docs/26-07/26-07-02/2026-07-02-gps-location-auth-fix.md`](Docs/26-07/26-07-02/2026-07-02-gps-location-auth-fix.md)

### V3.3.14 (2026-06-29) — 下载底图跳转修复 + 标注功能修复 + TOC 缓存系统修复 + TIF 渲染优化 + CesiumContainer 全面 Code Review

- 🐛 **修复"下载底图"按钮无法跳转到工具箱下载Tab**：HomeView.vue 中 `<SidePanel>` 组件遗漏 `:toolbox-tab="toolboxTab"` 属性绑定
- 🐛 **修复标注功能 4 个问题**：重复 Toast 消息、catch 正则遗漏"地图已卸载"、await 后地图存活校验缺失、选点模式无 crosshair 光标指示
- 🐛 **修复 TOC 缓存系统（统一修复 3 个 Bug）**：`layerTree` 缓存键仅含图层 ID，导致重命名、可见性勾选、透明度滑杆的 UI 变更均不生效
- 🚀 **单波段 TIF 渲染范围优化**：从 2%-98% 百分位截断改为智能 nodata 检测 + 全有效范围渲染。新增 `detectDataRange()` 函数（哨兵值 3σ 检测 + GAP 离群检测），有效数据不再被截断
- 🔍 **CesiumContainer.vue 全面 Code Review（6 维度审查）**：修复 3 个严重 Bug（体积云清理解构错误、大气系统双写冲突、重试路径资源泄漏）+ 4 个中等问题（异步循环守卫、bootCesium 并发保护、重试上限硬顶、FPS 调试面板移至 DEV）+ 代码规范改进（JSDoc、死代码清理、回调清理）

详见 [`Docs/06-29/`](Docs/06-29/) 目录

### V3.3.13 (2026-06-28) — LLM 参数动态配置管理（管理员后台）

- 🆕 **管理员控制台新增 LLM 参数配置面板** (`AdminControlPanel.vue`)：支持动态修改后端运行时读取的 Agent 对话参数，修改后**无需重启服务即时生效**
- 🆕 **可配置参数**：Base URL、Model、Available Models 列表、Timeout、Max Tokens、Temperature (1.0)、Top P (0.95)、Extra Body (JSON)、System Prompt、Stream、Guest/Registered 每日额度
- 🆕 **后端动态读取机制**：所有参数存储在数据库 `system_config` 表，后端运行时通过 `_get_agent_provider_config_sync()` 实时读取，前端 AI 助手、Agent 对话、模型列表等功能统一使用这些配置
- 🔧 **默认参数已标准化**：Temperature=1、Top P=0.95、Max Tokens=32768、Extra Body 包含 `chat_template_kwargs.enable_thinking=true` 和 `reasoning_budget=16384`
- 🔧 **前后端链路一致性**：`ApiKeysManagementPanel.vue`、`ChatPanelContent.vue` 均从后端动态获取配置，彻底消除硬编码

### V3.3.12 (2026-06-27) — 体积云模块重构 + 洪水模拟 + 漫游导航指引

- 🆕 **体积云独立模块** (`Cloud/`)：从 `CesiumAdvancedEffects.vue` 提取为独立 TypeScript 模块（CloudManager / CloudPresets / CloudUniforms / cloudIntegration / useVolumetricCloud / 4 个 GLSL Shader / 纹理资源）
- 🆕 **洪水模拟功能**：通过 `useCesiumToolModules.js` 控制中心接入「洪水模拟」按钮 + 动态速度滑块（默认值域÷10，10s 完成），`FluidSimulationPanel.vue` 提供 `requestAnimationFrame` 水位自动上涨动画
- 🆕 **漫游导航指引** (`NavGuideHUD` + `NavTargetDialog`)：三选一对话框（搜索/数据要素/地图点选），屏幕顶部方向箭头 + 距离，Selection Indicator 持久聚焦，导航独立于漫游状态
- 🆕 **漫游坐标显示** (`PlayerController`)：漫游模式下实时显示人物世界坐标
- 🆕 **漫游相机速度同步** (`CameraSystem`)：相机移动速度与漫游速度参数联动
- 🔧 **CesiumAdvancedEffects.vue**：删除体积云相关代码，改为调用 Cloud/ 模块
- 🔧 **useCesiumToolModules.js**：体积云控件重构为独立 `cloudParams` + 洪水模拟/导航 action/control/state

### V3.3.11 (2026-06-26) — 人物漫游控制器集成（第一/第三人称 + Rapier 物理）

- 🆕 **人物漫游控制器** (`PlayerController/`)：集成 cesium-player-controller，支持第一/第三人称视角切换、WASD 移动、跳跃、飞行模式
- 🆕 **Rapier 物理碰撞**：胶囊体碰撞 + 地形碰撞 + 射线避障，角色可在 3D Tiles 和地形上行走
- 🆕 **动画状态机**：idle/walk/run/jump/fly 多动画自动切换，支持三段跳跃
- 🆕 **弹簧相机**：第三人称弹簧阻尼跟随 + 过肩视角 + 射线防穿墙
- 🆕 **操作提示面板** (`PlayerGuidePanel.vue`)：右上角悬浮键位说明，实时显示视角/飞行状态
- 🆕 **控制台调试参数**：行走速度、飞行速度、重力、跳跃高度、鼠标灵敏度滑块实时调节
- 🆕 **Cesium ESM 垫片** (`cesium-shim.js`)：桥接 CDN Cesium 与 npm ESM 导入，消除双实例冲突
- 🔧 **Vite 配置**：添加 `cesium` alias + `optimizeDeps.exclude`，确保单一 Cesium 实例
- 🐛 **修复人物漫游面板滑块类型**：控件 `type: 'slider'` → `type: 'range'`，与项目统一的 `lil-gui` 渲染管线对齐，修复滑块降级为文本输入框的问题
- 🐛 **修复 ArcGIS 地形无法被漫游系统识别**：新增 `ArcGISTerrainProvider` 增强包装器（参照天地图 `GeoTerrainProvider` 补充 `availability` + `getTileDataAvailable`），使 `sampleTerrainMostDetailed` 原生支持 ArcGIS 地形 + 降级兜底到 `sampleTerrain(17)`
- 🐛 **修复 ArcGIS 包装器 availability 精度问题**：逐级标记所有层级（0→maxLevel）全球可用，修复 `getMaximumLevelAtPosition` 返回 0 导致采样最低精度的 bug

详见 [`Docs/26-06/26-06-26/2026-06-26-player-controller-integration.md`](Docs/26-06/26-06-26/2026-06-26-player-controller-integration.md)

### V3.3.10 (2026-06-26) — 大气系统清理 + 场景美化 + 热带浅水 + Tellux 模块移植

- 🆕 **场景美化模块** (`useCesiumBeautify.js`)：HDR + PBR_NEUTRAL 色调映射 + FXAA + 定向光 + 天空大气微调，控制面板可调
- 🆕 **热带浅水场景** (`ShallowWater/`)：Three.js 叠加层，焦散/折射/物理吸色/体积云/闪电
- 🆕 **模型管理器** (`useCesiumModelManager.js`)：glTF/GLB 模型加载、地理坐标定位、动画控制
- 🆕 **增强相机** (`useCesiumCameraEnhanced.js`)：弹簧物理相机、自定义缓动、飞行队列
- 🆕 **高度采样器** (`useCesiumHeightSampler.js`)：地形高度查询、批量异步采样、屏幕坐标拾取
- 🆕 **大气高度阈值**：相机低于 800m 自动关闭大气增强，避免与晨昏半球冲突
- 🔧 **移除 AtmosphereManager**：删除 `atmosphere/` 目录（14 个文件），清理 CesiumContainer.vue
- 🔧 **移除旧体积云**：删除 `Clouds/` 目录（12 个文件），由 CesiumAdvancedEffects 内置体积云替代
- 🔧 **晨昏半球无限高度**：`lightingFadeOutDistance` / `nightFadeOutDistance` 改为 MAX_SAFE_INTEGER
- 🔧 **大气光照强度调优**：`atmosphereLightIntensity` 从 11.5 调整为 5.5
- 🐛 **修复 CesiumAdvancedEffects.vue BOM 头**
- 📝 **完整文档**：详细的移植日志和技术文档

详见 [`Docs/26-06-26/2026-06-26-tellux-atmosphere-migration.md`](Docs/26-06-26/2026-06-26-tellux-atmosphere-migration.md)

### V3.3.9 (2026-06-26) — 大气 LUT 纹理集成修复 + TAAU 时序上采样 + BSM Shadow TAA + 模块卡片 UI 清理

- 🐛 修复 `CesiumAdvancedEffects.vue` 和 `FluidSimulationPanel.vue` 文件开头的 UTF-8 BOM 头问题。
- 🐛 修复 `atmosphereLutResources.js` 资源销毁保护，添加 try-catch 防止单个纹理销毁失败阻断后续清理。
- 📝 为 GLSL 和 JS 中的大气散射物理常数添加详细注释（Rayleigh/Mie 散射系数、标高等）。
- ✅ 验证阶段三（大气保真）实现完整，包括 LUT 纹理创建、大气透视合成、天空辐照度计算。
- 🆕 新增 `useCesiumTemporalUpsampling.js` 模块，实现 TAAU 16x 上采样、方差裁剪、速度重投影、STBN 蓝噪声。
- 🆕 新增 `shadowResolveShaders.js` 模块，实现 BSM Shadow TAA 时序抗锯齿。
- 🔧 集成 TAAU Resolve Stage 到 Cesium PostProcessStage 渲染管线，实现完整生命周期管理。
- 🆕 完善质量预设系统，新增 `ultra` 档位（stepCount: 128, maxDistance: 720000）。
- 🧹 清理 CesiumToolPanel.vue 引入 lil-gui 后遗留的约 200 行废弃 CSS（`.control-row` / `.control-label` 等手写控制样式）
- 🎨 模块卡片视觉增强：左侧渐变色条 + 图标升级 + hover 阴影 + 展开动画 + 状态圆点指示器
- 🐛 隐藏 LilGuiControls 重复标题（lil-gui title 与 module-head 标题冲突）
- 🐛 **Code Review 三轮修复（30 个问题）**：shadowResolveShaders GLSL 兼容性（FRAG_COLOR/SAMPLE_TEX/version guard）；质量预设统一（useCesiumToolModules 导入 QUALITY_PRESETS）；TAAU 每帧 GC 优化（scratch Cartesian2）；resolution uniform 窗口缩放同步；atmosphereLutResources 移除 viewer 引用；cleanup 补全 matrices 置 null；移除未使用的 shader uniform/config/字段；FluidSimulationPanel 死 CSS 清理
- 🐛 **修复 Cesium → OL 图层同步**：`setBaseLayerActive` ID 类型不匹配（`layerList` 存储图层源 ID，`selectedLayer` 存储预设 ID），简化为直接设置 `selectedLayer.value`
- 🚀 **体积云性能优化**：减少阴影计算步数（-55%）、LOD 距离优化（-65%）、远处禁用昂贵阴影（-85%）、自适应步长、更激进的早期终止、分辨率缩放模块

详见 [`Docs/26-06/26-06-26/2026-06-26-atmosphere-lut-integration-fix.md`](Docs/26-06/26-06-26/2026-06-26-atmosphere-lut-integration-fix.md)、[`Docs/26-06/26-06-26/2026-06-26-module-card-ui-cleanup.md`](Docs/26-06/26-06-26/2026-06-26-module-card-ui-cleanup.md)、[`Docs/26-06/26-06-26/2026-06-26-code-review-taau-lilgui-fix.md`](Docs/26-06/26-06-26/2026-06-26-code-review-taau-lilgui-fix.md) 和 [`Docs/26-06/26-06-26/2026-06-26-cloud-performance-optimization.md`](Docs/26-06/26-06-26/2026-06-26-cloud-performance-optimization.md)

### V3.3.8 (2026-06-22) — 暂存区 Code Review 修复

- 🐛 修复 `useCreateManagedVectorLayer.js` 在图层 ID 创建前备份样式导致的 `id` 时序错误。
- 🐛 修复 `clearManagedFeatureHighlight(feature)` 旧调用链缺少 `layerId` 时无法通过 Pinia store 清理高亮的问题。
- 🐛 修复 `forEachFeatureAtPixel` 返回值语义误用，确保点击命中统计可继续遍历。
- 🧹 清理维护日志 trailing whitespace，保证 Git whitespace 检查通过。

详见 [`Docs/26-06/26-06-22/2026-06-22-fix-staged-feature-highlight-review.md`](Docs/26-06/26-06-22/2026-06-22-fix-staged-feature-highlight-review.md)

### V3.3.8 (2026-06-21) — 要素高亮 Pinia 化 & 连续多选样式持久化

#### ✨ 要素高亮系统重构

把高亮状态从 composable 闭包迁移到 Pinia store，彻底解决"连续多选样式丢失"问题。

| 改动 | 文件 |
|------|------|
| 🆕 新增 Pinia store | `frontend/src/stores/useFeatureStyleStore.ts` |
| 🆕 新增 FeatureKey 工具 | `frontend/src/utils/map/featureKey.js` |
| ♻️ 闭包变量 → 薄壳 store | `frontend/src/composables/map/features/useManagedFeatureHighlight.js` |
| ♻️ 支持 Ctrl/Shift 多选 | `frontend/src/composables/map/features/useMapEventHandlers.js` |
| 🐛 TOC 移除图层联动清理 | `frontend/src/stores/useTOCStore.ts` |
| 🐛 `syncLayers` 差量清理 | `frontend/src/stores/useLayerStore.ts` |
| 🐛 `setStyle(null)` 前备份样式 | `useCreateManagedVectorLayer.js` + `useUserLayerActions.js` |

详见 [`Docs/26-06/26-06-21/2026-06-21-feature-style-pinia-multi-select.md`](Docs/26-06/26-06-21/2026-06-21-feature-style-pinia-multi-select.md)

#### ✨ 增强要素属性 HTML 解析

`useLayerMetadataNormalization.js` 重写表格解析器：

- ✅ `<thead>` 列索引表头映射（`name`/`value` 列自动识别）
- ✅ `<dl>/<dt>/<dd>` 定义列表支持
- ✅ `<Null>` 占位符归一化（OSM / Cesium / GeoServer 约定）
- ✅ 嵌套表格命名空间（`parent.child`）
- ✅ 同名多值合并
- ✅ `<script>` / inline 事件 / `javascript:` URL 主动剥离

**修复用户截图**：属性表 `description` 字段从一长串乱码展开为多行字段。

详见 [`Docs/26-06/26-06-21/2026-06-21-enhance-html-attribute-parser.md`](Docs/26-06/26-06-21/2026-06-21-enhance-html-attribute-parser.md)

#### 🐛 高亮 Pinia 化后置修复（2026-06-21 同日补遗）

针对前两条改造的 Code Review 发现修复：

- 🐛 **`useFeatureStyleStore.ts` TS 类型缺失**：`highlightFeature` 内 `targets` 数组元素补充 `feature: any` 字段类型；`syncLayerHighlights` 的 `callbacks` 默认值类型显式声明 `cb = callbacks || {}`，消除 `Property 'restoreStyle'/'lookupFeature'/'applyHighlight' does not exist on type '{}'` 报错
- 🐛 **`useMapUIEventHandlers.js` 破坏性重命名回滚**：`zoomToManagedFeature` 恢复原参数名，`void zoomToManagedFeature` 保留契约引用，避免调用方传参静默失效
- 🐛 **`useLayerMetadataNormalization.js` dl 合并顺序反**：修正 `{ ...dlParsed, ...next }` → `{ ...next, ...dlParsed }`，避免解析值被原 attributes 覆盖
- ♻️ **`useManagedFeatureHighlight.js` 封装性回填**：删除对 store state 的直接操作（`store.highlightedFeatures.delete` 等），统一通过 `store.clearHighlight` 行动
- ♻️ **抽离 `getFeatureIdFromFeature` 工具函数**：消除 4 处重复的 `getId() ?? get('_gid') ?? get('id')` 回退逻辑，统一到 `utils/map/featureKey.js`

详见 [`Docs/26-06/26-06-21/2026-06-21-fix-feature-style-store-types-and-bugs.md`](Docs/26-06/26-06-21/2026-06-21-fix-feature-style-store-types-and-bugs.md)

---

### V3.3.8 (2026-06-19) — Cesium 数据导入 + 底图预设统一

- 🆕 Cesium 数据导入（GeoJSON / KML / KMZ / SHP / GLB / GLTF / CZML / 3D Tiles）
- 🆕 Cesium OSM Buildings + Google Photorealistic 3D Tiles 叠加层
- 🆕 底图预设统一接入（OL / Cesium 共用 `BASEMAP_PRESETS`）
- 🆕 字体栈 CSS 变量（`--font-*`）
- 🐛 `buildShareMarkedUrl` 中 `loc` 提前重置导致分享链接 `p` 参数丢失
- 🐛 Code Review 修复（响应式转发 / KMZ BlobURL 泄漏 / Dialog 重入 / 键盘可达性等）

详见 [`Docs/26-06/26-06-19/`](Docs/26-06/26-06-19/)

---

### V3.3.6 (2026-06-18) — OL / Cesium URL 双向视图同步

- 🆕 `view=ol|cesium` 引擎参数，刷新 / 分享可恢复 2D / 3D 面板
- 🆕 `viewScaleConverter.js`（OL zoom ↔ Cesium camera height 换算）
- 🆕 `urlConstants.js` + `urlQueryReader.js`（URL 统一管理）
- 🐛 Cesium 默认中国中心相机高度 `15,000,000m → 6,000,000m`

---

### V3.3.5 (2026-06-15) — 运行时 Token 池 + 备用 Token

- 🆕 `/api/runtime-config/map-tokens` 运行时下发天地图 / Cesium 主备 token 池
- 🆕 高德 / Agent / 天地图 / Cesium Ion 四类 API 备用 token 管理面板
- 🆕 2D / 3D 视图初始化失败自动尝试备用 token

---

### V3.3.0 (2026-06-05) — Chat Function Calling GIS + 404 兜底

- 🆕 Agent Function Calling 三层降级（原生 → 文本解析 → 关键词意图）
- 🆕 `agentToolsSchema.js` / `AgentExecutor.js` / `GISCommander.js`
- 🆕 `stores/useChatStore.ts` Chat 工具调用状态
- 🆕 `views/NotFoundView.vue` 404 兜底页面

---

### V3.2.9 (2026-06-04) — WebGL 栅格渲染器

- 🆕 `dataImport/webglRasterRenderer.js` GPU 并行像素处理
- 🚀 10000×10000 TIF 渲染 `3-5 秒 → <50ms`（60-100 倍提升）

---

### V3.1.0 — 在线底图下载

- 🆕 `MapDownloader.vue` 底图源选择 + 范围选择 + 异步任务
- 🆕 `useDownloadStore.ts` 下载任务 Pinia 状态
- 🆕 `api/download.js` 任务提交 / 轮询 / 文件下载

---

## 📐 开发约定

### 强制规范（来自 CLAUDE.md）

1. **每次任务必须创建日志**到 `Docs/yyyy-mm/yyyy-mm-dd-topic.md`
2. **先写文档，再实施代码改动**
3. **三个 README 同步更新**（根目录 / `frontend/` / `backend/`）的文件结构树
4. **不执行** `git commit` / `git push` —— 版本控制决策权归用户
5. **新功能必须封装**为独立 `.js` / `.ts` 文件，组件内不堆叠业务逻辑
6. **新增代码必须有注释**（功能 / 参数 / 核心逻辑）

### 分层边界

| 层 | 职责 | 禁止 |
|----|------|------|
| `components/` | UI 渲染 + 事件 | 业务逻辑 |
| `composables/` | 编排流程 + 地图动作 | 直接操作 store state |
| `stores/` | 状态维护 + 派生 | 依赖 OL / Cesium 类 |
| `utils/` | 纯函数 + 解析 | 副作用 |
| `services/` | 外部 SDK 集成 | UI 逻辑 |

### 坐标系统约定

本项目涉及国内地图服务（高德/天地图）与全球标准（OpenLayers/Cesium/Nominatim），遵循以下统一规则：

```
前端 UI/组件/Composable —— 始终使用 WGS-84
         ↓
  前端 API 包装层 (frontend/src/api/)
    ├─ geocoding.js              —— WGS-84 in, WGS-84 out（内部 wgs84ToGcj02 → AMap → gcj02ToWgs84）
    ├─ backend/location.js       —— WGS-84 in, WGS-84 out（同上）
    ├─ locationSearch.js         —— 高德 POI 搜索结果的 GCJ-02 坐标自动转 WGS-84
    └─ map.js / amapAoiParser / universalAmapParser —— AOI/详情 GCJ-02 自动转 WGS-84
         ↓
  后端代理 (external_proxy.py) —— 透传，不转换
         ↓
  后端服务端点 (location.py)    —— 调用高德前做 wgs2gcj 转换
         ↓
  高德 API                    —— 始终接收/返回 GCJ-02
```

**核心原则**：
1. 前端所有组件、Composable、Store 统一使用 **WGS-84**（OpenLayers `toLonLat`/`fromLonLat` 产出/消费的就是 WGS-84）
2. WGS-84 ↔ GCJ-02 转换仅发生在 **调用高德 API 的前一刻**（前端 API 包装层或后端服务端点），对上层代码完全透明
3. 天地图接受 WGS-84、Nominatim 使用 WGS-84，无需转换
4. 用户手动输入坐标时可通过 `crsType` 参数指定输入坐标系（wgs84/gcj02），系统自动转换后以 WGS-84 进入内部管线
5. 瓦片图层通过后端 `/proxy/gcj2wgs/` 纠偏代理将高德 GCJ-02 瓦片实时转为 WGS-84 瓦片

### 提交前检查

```bash
# Windows: 双击 LocalDev.bat
# 自动启动：
#   - npm install && npm run dev （前端）
#   - docker-compose up （后端）

# 或手动启动
docker-compose up
```

---

#### ✅ 使用者收益

1. **专业地图导出**：生成标准 GeoTIFF，可直接用于 GIS 分析
2. **坐标系无缝支持**：自动纠偏 GCJ-02，避免国内地图叠加偏移
3. **简化部署**：Docker Compose 统一环境，减少配置复杂度
4. **开发体验升级**：LocalDev.bat 一键启动，无需手动配置

---

#### 🔄 兼容性说明

- ✅ **无破坏性变更**：现有功能完全保持
- ✅ **渐进式增强**：新功能可选使用
- ✅ **向后兼容**：旧版本接口仍可用

---

### �🔄 V3.0.7 (2026-05-01)
#### 🔹 在线地图性能优化与功能完善

本次版本聚焦**底图/图层切换体验、内存稳定性、弱网兼容性**，全面解决卡顿、延迟、闪烁、内存泄漏等问题，图层操作响应速度、界面流畅度、长期运行稳定性实现大幅提升，同时保持功能兼容、无感升级。

---

#### 🚀 核心优化（重点）
##### 1. 图层切换性能极致优化
- 移除**多层防抖嵌套**，统一防抖策略，切换响应延迟从 **600ms → 300ms**，提速 50%
- 优化地图渲染逻辑，合并冗余重绘操作，切换时界面**无闪烁、无抖动**
- 新增快速失败机制，底图验证超时从 **3s → 1.5s**，弱网环境反馈更及时

##### 2. 内存泄漏 & 资源管控
- 新增 `AbortController` 异步请求中断控制，切换时自动清理未完成请求
- 实现 LRU 缓存限制，错误状态集合固定容量 50 条，杜绝内存无限增长
- 优化图层实例生命周期管理，长期运行地图不卡顿、不崩溃

##### 3. 交互体验升级
- 图层切换、底图加载、顺序调整全程**丝滑流畅**
- 避免重复触发、重复加载、重复渲染，操作更跟手
- 状态更新批处理，界面响应更统一、无跳变

##### 4. 可靠性 & 稳定性增强
- 移除危险的“跳过验证直接加载”逻辑，底图状态判断准确率提升至 99%+
- 完善异常捕获、加载失败提示，避免控制台报错
- 兼容国内外地图服务、天地图、自定义底图服务

---

#### 📊 优化前后对比
| 体验指标 | 优化前 | 优化后 | 提升效果 |
|--------|--------|--------|----------|
| 图层切换响应延迟 | 600ms | 300ms | 速度提升 50% |
| 底图服务验证超时 | 3000ms | 1500ms | 弱网体验大幅改善 |
| 页面重绘次数 | 3~4 次/次操作 | 1 次/次操作 | 无闪烁、更流畅 |
| 内存占用趋势 | 持续增长 | 恒定稳定 | 长期使用不卡顿 |
| 功能成功率 | 85% | 99%+ | 几乎零失败 |

---

#### 📦 涉及文件
- `useLayerControlHandlers.js` —— 图层切换核心逻辑
- `useBasemapSelectionWatcher.js` —— 底图选择监听
- `useBasemapResilience.js` —— 底图验证与容错
- `useBasemapStateManagement.js` —— 状态与事件批处理

---

#### ⚠️ 兼容说明
- **无破坏性变更**：对外 props / events 完全保持不变
- 父组件、子组件调用逻辑无需修改
- 可直接升级，支持一键回滚

---

#### ✅ 使用者收益
1. **操作更流畅**：图层切换秒响应，无延迟、无卡顿
2. **长期更稳定**：地图长时间运行不崩溃、不内存溢出
3. **网络更兼容**：弱网环境下加载更快、提示更准确
4. **维护更简单**：逻辑统一、代码健壮，减少线上问题


### V3.0.0 (2026-04-17)
#### 🔹 前后端分离架构完整版

**新增**：
- ✅ 独立 frontend 和 backend 子目录
- ✅ FastAPI 后端框架搭建
- ✅ Docker 容器化部署
- ✅ GitHub Actions CI/CD 自动化（前后端分离部署）
- ✅ Hugging Face Spaces 自动部署
- ✅ 详细的项目文档（README）

**改进**：
- ✅ 前后端 API 解耦
- ✅ 后端依赖管理（使用 uv）
- ✅ 构建流程优化

**文档**：
- ✅ 根目录整体项目文档（本文件）
- ✅ 前端详细开发指南
- ✅ 后端详细开发指南

### 历史版本
- V2.8.9+：单一全栈应用，持续迭代优化
- V1.0.0：初始版本

## 🛠️ 开发指南

### 添加新功能的标准流程

#### 前端新增页面

```bash
# 1. 创建页面组件
touch frontend/src/components/MyFeaturePage.vue

# 2. 配置路由
# frontend/src/router/index.js 或在views/HomeView.vue中引入

# 3. 添加菜单项
# 在 TopBar 或 SidePanel 中添加导航
```

#### 后端新增 API

```python
# backend/app.py 或 backend/api/my_router.py
@app.get("/api/v1/my-endpoint")
async def my_endpoint():
    """API 文档"""
    return {"status": "success", "data": {}}
```

#### 前后端通信

```javascript
// frontend/src/api/backend.js
// 前端端通信桥梁
export const getMyData = async (params) => {
  const response = await fetch('/api/v1/my-endpoint', {
    method: 'GET'
  })
  return response.json()
}
```

### 代码风格

- **前端**：ESLint + Prettier（JavaScript 社区标准）
- **后端**：Black + Ruff（Python 社区标准）
- **提交**：Conventional Commits

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'Add xxx'`)
4. 推送分支 (`git push origin feature/xxx`)
5. 提交 Pull Request

## 📞 技术栈与支持

### 前端技术栈
- **框架**：Vue 3.3+
- **构建**：Vite 5.0+
- **地图**：OpenLayers 8.x + Cesium 1.x
- **状态**：Pinia 2.1+
- **路由**：Vue Router 4.2+
- **图表**：ECharts 5.x+
- **工具**：Axios, Moment.js, JSZip, 等

### 后端技术栈
- **框架**：FastAPI 0.104+
- **服务器**：Uvicorn 0.24+
- **验证**：Pydantic 2.0+
- **异步**：asyncio, httpx, aiohttp
- **数据**：Pandas 2.0+
- **几何**：Shapely 2.0+
- **栅格**：Rasterio 1.3+
- **包管理**：uv（推荐）或 pip

## 📚 参考资源

- [Vue 3 官方文档](https://vuejs.org/)
- [Vite 官方文档](https://vitejs.dev/)
- [OpenLayers 官方文档](https://openlayers.org/)
- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Hugging Face Spaces 文档](https://huggingface.co/docs/hub/spaces)

## ⚠️ 常见问题

### Q: 前后端如何本地联调？
**A**：前端 `localhost:5173` → 后端 `localhost:7860`，确保 CORS 配置正确。

### Q: 如何修改后端技术栈？
**A**：后端仍在测试阶段，可随时调整。在 `backend/README.md` 中有详细的扩展指南。

### Q: 如何部署到自己的服务器？
**A**：
- 前端：构建后上传到任何静态托管（Nginx、Apache、CDN）
- 后端：使用 Docker 或直接运行 Uvicorn，配合 Nginx 反向代理

### Q: 数据导入支持哪些格式？
**A**：GeoJSON、KML/KMZ、Shapefile、GeoTIFF、CSV、XYZ 瓦片等。详见 [前端文档](./frontend/README.md)。

## TODO
参考高德api的md文档，将现有的低级api切换为高级api并解析出数据进行查看

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

**最后更新**：2026-07-09
**当前版本**：V3.3.17
**项目状态**：开发中 - 持续迭代优化
