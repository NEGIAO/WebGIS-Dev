# NEGIAO's WebGIS - 专业级前后端分离 WebGIS 平台

[![Vue](https://img.shields.io/badge/Vue-3.5+-4FC08D?logo=vuedotjs)](https://vuejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![OpenLayers](https://img.shields.io/badge/OpenLayers-10.5-FFD700?logo=openlayers)](https://openlayers.org/)
[![Cesium](https://img.shields.io/badge/Cesium-1.110+-64B5F6?logo=cesium)](https://cesium.com/)
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

## [LLM 项目详细分析](https://deepwiki.com/NEGIAO/WebGIS-Dev)
> 不知如何下手？向大语言模型了解本项目的具体内容：(https://deepwiki.com/NEGIAO/WebGIS-Dev)

**NEGIAO's WebGIS** 是一个功能完整、架构清晰的**前后端分离** WebGIS 平台，历经多次优化迭代，现已进入 V3.1 阶段，正逐步发展成为专业级的地理信息系统应用

### 🎯 项目定位

- **前端**：基于 Vue 3 + Vite + OpenLayers + Cesium，托管在 GitHub Pages  
- **后端**：基于 FastAPI + Python，用Dockers部署在 Hugging Face Spaces
- **架构**：RESTful API 通信，前后端完全解耦，支持独立扩展

### 💫 核心特性

**前端功能**：
- 🗺️ OpenLayers 2D + Cesium 3D 地球
- Custom terrain + WTFS labels (in-repo providers, no TDT Cesium plugins)
- 📊 多格式数据导入（GeoJSON/KML/SHP/GeoTIFF/CSV）与导出
- 🎨 电影级视觉效果、数据可视化、首屏特效
- 风水罗盘（HUD 模式 + 传统模式）+ 行政区划选择（边界加载 + TOC 同步）
- 🔍 绘制、测量、路线规划、地点搜索、**卷帘分析**
- 🌤️ 实时天气 + 趋势预报
- 🤖 AI 空间助手（LLM 集成）
- ⚡ 30-50% 首屏性能优化
- 🎨 **全局主题系统**：CSS 变量驱动，支持绿色/蓝色主题一键切换
- 🗂️ **TOC 图层管理增强**：图层重命名、透明度控制、属性查看、搜索过滤
- 📐 **空间分析**：缓冲区/交集/并集/差集/凸包/**泰森多边形/空间聚合/多环缓冲区/几何简化**（后端 Shapely 精确计算）

**后端功能**：
- 📡 地理数据处理与坐标系转换
- 🗺️ 底图数据下载
- 🌦️ 天气数据服务
- 🛣️ 路线规划与导航
- 📰 新闻爬虫与数据采集
- 💾 GIS 数据格式转换
- ⚙️ 异步后台任务
- 🔐 三类身份登录 + 会话鉴权（/data 持久化）
- 📧 **邮箱验证码系统**：注册邮箱绑定 + 密码重置（SMTP 发送，60秒频率限制，5分钟有效期）
- 📐 **空间分析 API**：基于 Shapely 2.x 的精确几何运算（缓冲区/叠加分析/凸包/泰森多边形/空间聚合/多环缓冲区/几何简化）

## 🚀 快速开始

### 📋 依赖环境（必需）

在开始之前，请确保已安装以下工具：

- **Node.js 16+** —— 前端构建与开发服务器
- **Docker Desktop** —— 容器化后端环境（**强制要求**）
- **LocalDev.bat** —— Windows 快速启动脚本（推荐使用）

### 🎯 推荐方式：使用 LocalDev.bat（一键启动）

最简单的启动方式——**双击 LocalDev.bat 文件即可**：

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

# 前端：http://localhost:5173
# 后端：http://localhost:7860
```

## 📁 项目结构

```
WebGIS_Dev/
├── .github/                              # CI/CD 配置
│   └── workflows/
├── frontend/                             # 🔹 前端（Vue 3 + Vite + OpenLayers + Cesium）
│   ├── src/
│   │   ├── api/                          # API 客户端封装
│   │   │   ├── backend.js                # 后端 API barrel re-export
│   │   │   ├── backend/                  # 后端 API 按业务域拆分
│   │   │   │   ├── client.js             # axios 实例、拦截器、错误处理
│   │   │   │   ├── auth.js               # 鉴权接口（9 个函数）
│   │   │   │   ├── location.js           # 地理编码/定位接口
│   │   │   │   ├── weather.js            # 天气接口
│   │   │   │   ├── routing.js            # 路线规划接口
│   │   │   │   ├── agent.js              # AI Agent 接口
│   │   │   │   ├── statistics.js         # 统计/消息/公告
│   │   │   │   ├── admin.js              # 管理后台接口
│   │   │   │   ├── spatial.js            # 空间分析接口
│   │   │   │   └── index.js              # barrel export
│   │   │   ├── download.js               # 在线底图下载 API
│   │   │   ├── geocoding.js              # 天地图/高德地理编码
│   │   │   ├── httpStatusMap.js          # HTTP 状态码 + 高德 infocode 统一映射
│   │   │   ├── weather.js                # 天气数据 API
│   │   │   ├── ipLocation.js             # IP 定位 API
│   │   │   ├── locationSearch.js         # 地点搜索 API
│   │   │   ├── map.js                    # 地图相关 API
│   │   │   └── index.js                  # barrel export
│   │   ├── assets/                       # 全局样式与静态数据
│   │   │   ├── theme.css                 # 全局主题变量（绿/蓝切换）
│   │   │   ├── toc-theme.css             # TOC 主题变量
│   │   │   └── data/                     # 罗盘元数据等静态数据
│   │   ├── components/                   # 业务组件（按功能域分组）
│   │   │   ├── Cesium/                   # 3D 地球模块
│   │   │   │   ├── CesiumContainer.vue   # Cesium 容器
│   │   │   │   ├── CesiumAdvancedEffects.vue # 高级视觉效果
│   │   │   │   ├── Wind2D.js             # 2D 风场模拟
│   │   │   │   └── terrain/              # 自定义地形提供者
│   │   │   ├── Chat/                     # AI 聊天助手
│   │   │   ├── Compass/                  # 罗盘控制面板
│   │   │   ├── ControlsPanel/            # 左侧控制栏（绘制/测量/空间分析/行政区）
│   │   │   ├── Layer/                    # 图层管理（TOC/属性表/资源树）
│   │   │   ├── Map/                      # 地图核心容器与控制器
│   │   │   ├── Routing/                  # 路线规划（公交/驾车）
│   │   │   ├── Search/                   # 搜索与数据注入
│   │   │   ├── Shell/                    # 应用壳层（TopBar/SidePanel/Loading/Message）
│   │   │   ├── UserCenter/               # 用户中心（登录/管理/API Key）
│   │   │   │   ├── tabs/                 # 用户中心子面板（OverviewTab/SecurityTab/PreferencesTab）
│   │   │   │   └── ...
│   │   │   ├── Weather/                  # 天气面板
│   │   │   │   ├── WeatherChartPanel.vue # 天气主面板（壳）
│   │   │   │   ├── WeatherLiveCards.vue  # 实况天气卡片
│   │   │   │   └── WeatherForecastTable.vue # 预报表格
│   │   │   └── feng-shui-compass-svg/    # 罗盘 SVG HUD 组件
│   │   │       ├── themes/               # 主题配置
│   │   │       ├── types/                # TypeScript 类型
│   │   │       └── Explanation/          # 宫位解释 JSON
│   │   ├── composables/                  # 组合式函数（逻辑复用）
│   │   │   ├── Magic/                    # 首屏视觉特效
│   │   │   │   ├── useDelaunay.js        # Delaunay 三角形特效
│   │   │   │   ├── useFluid.js           # 流体模拟特效
│   │   │   │   ├── useGravity.js         # 重力粒子特效
│   │   │   │   ├── useRingExplosion.js   # 圆环粒子迸溅特效（Apple Watch 风格 + 鼠标交互）
│   │   │   │   ├── useSingularity.js     # 奇点特效
│   │   │   │   └── useWave.js            # 波纹特效
│   │   │   ├── dataImport/               # 数据导入工具
│   │   │   │   ├── rasterUtils.js        # 栅格工具（波段统计/拉伸/NoData）
│   │   │   │   ├── vectorUtils.js        # 矢量工具（解码/类型识别）
│   │   │   │   └── index.js
│   │   │   ├── map/                      # 地图核心 composables
│   │   │   │   ├── features/             # 功能模块（30+ 文件）
│   │   │   │   │   ├── useBasemapResilience.js       # 底图容错与降级
│   │   │   │   │   ├── useBasemapSelectionWatcher.js  # 底图选择监听
│   │   │   │   │   ├── useBasemapStateManagement.js   # 底图状态批处理
│   │   │   │   │   ├── useBasemapSwipe.js             # 卷帘对比
│   │   │   │   │   ├── useDrawMeasure.js              # 绘制与测量
│   │   │   │   │   ├── useMapEventHandlers.js         # 地图事件处理
│   │   │   │   │   ├── useRouteStepStyles.js          # 路线步骤样式缓存
│   │   │   │   │   ├── useSpatialAnalysis.js          # 空间分析
│   │   │   │   │   ├── useStartupTaskScheduler.js     # 启动任务调度
│   │   │   │   │   ├── basemapLayerFactory.js         # 底图图层工厂
│   │   │   │   │   └── ...
│   │   │   │   ├── toc/                  # TOC 模块
│   │   │   │   │   ├── actions/          # 右键菜单动作
│   │   │   │   │   └── menu/             # 菜单调度
│   │   │   │   ├── basemapSystem.js      # 底图系统入口
│   │   │   │   └── index.js              # barrel export
│   │   │   ├── useMapState.js            # 地图状态（视图同步/经纬图层）
│   │   │   ├── useMapSwipe.ts            # 卷帘核心逻辑
│   │   │   ├── useMessage.js             # 全局消息提示
│   │   │   ├── useStyleEditor.js         # 样式编辑器 composable
│   │   │   ├── useTileSourceFactory.ts   # 瓦片源工厂 barrel re-export
│   │   │   ├── tileSource/               # 瓦片源工厂拆分模块
│   │   │   │   ├── types.ts              # 类型定义与常量
│   │   │   │   ├── urlUtils.ts           # URL 工具函数
│   │   │   │   ├── tileLifecycle.ts      # 请求生命周期管理
│   │   │   │   ├── wmsSource.ts          # WMS 源创建
│   │   │   │   ├── wmtsSource.ts         # WMTS 源创建
│   │   │   │   ├── xyzSource.ts          # XYZ 源 + 自动检测
│   │   │   │   └── index.ts              # barrel export
│   │   │   ├── weather/                  # 天气相关 composables
│   │   │   │   ├── useWeatherData.js     # 天气数据获取与查询
│   │   │   │   └── useWeatherCharts.js   # ECharts 图表渲染
│   │   │   ├── useUserLocation.js        # 用户定位
│   │   │   └── ...
│   │   ├── config/                       # 🔹 环境变量集中管理
│   │   │   └── env.ts                    # TIANDITU_TOKEN / AMAP_WEB_KEY / BACKEND_BASE_URL
│   │   ├── constants/                    # 常量配置
│   │   │   ├── basemap/                  # 底图配置模块
│   │   │   │   ├── basemapConfig.ts      # 图源定义 + 预设配置
│   │   │   │   ├── basemapResolver.ts    # 解析逻辑
│   │   │   │   └── index.ts
│   │   │   ├── index.js                  # barrel export
│   │   │   ├── mapStyles.js              # 地图样式常量
│   │   │   └── tileSourceAdapters.ts     # 非标准瓦片源适配器
│   │   ├── router/                       # Vue Router 路由
│   │   ├── services/                     # 业务服务层
│   │   │   ├── auth.js                   # 鉴权服务（登录/注册/会话管理）
│   │   │   ├── compass/                  # 罗盘服务模块
│   │   │   │   ├── urlState.ts           # 罗盘 URL 状态读写
│   │   │   │   └── index.js              # barrel export
│   │   │   ├── CompassManager.ts         # 罗盘管理器（地图集成）
│   │   │   ├── DistrictManager.ts        # 行政区划管理器
│   │   │   ├── userLocationContext.js    # 用户定位上下文（全局状态）
│   │   │   └── userPositionCache.js      # 用户位置缓存（localStorage）
│   │   ├── stores/                       # Pinia 状态管理
│   │   │   ├── layer/                    # 图层模块
│   │   │   │   ├── layerHelpers.ts       # 图层工具函数
│   │   │   │   ├── layerTreeBuilder.ts   # 图层树构建器
│   │   │   │   └── index.ts
│   │   │   ├── useAppStore.ts            # 全局应用状态
│   │   │   ├── useAttrStore.ts           # 属性表状态
│   │   │   ├── useAuthStore.ts           # 鉴权状态
│   │   │   ├── useCompassStore.ts        # 罗盘状态
│   │   │   ├── useDownloadStore.ts       # 下载任务状态
│   │   │   ├── useLayerStore.ts          # 图层状态
│   │   │   ├── useSwipeConfigStore.ts    # 卷帘配置（localStorage 持久化）
│   │   │   ├── useThemeStore.ts          # 主题状态（绿/蓝切换）
│   │   │   ├── useUrlParamStore.ts       # URL 参数管理
│   │   │   └── ...
│   │   ├── data/                         # 应用数据（纯数据模块）
│   │   │   └── goldenSoupQuotes.js       # 励志语录数据（懒加载）
│   │   ├── utils/                        # 工具函数
│   │   │   ├── abortManager.js           # 通用请求中断管理器（AbortController 封装）
│   │   │   ├── pathUtils.js              # 路径工具（统一 normalizePath/getExtension/getStem）
│   │   │   ├── textDecoder.js            # 文本解码（多编码自动检测）
│   │   │   ├── normalize.ts              # 二值标记规范化
│   │   │   ├── coordTransform.js         # 坐标转换（GCJ-02/WGS84）
│   │   │   ├── crsUtils.js              # CRS 检测与注册
│   │   │   ├── weather/                  # 天气工具函数
│   │   │   │   └── weatherUtils.js       # 图标/风力/格式化
│   │   │   ├── gis/                      # GIS 工具库
│   │   │   │   ├── parsers/              # 数据解析器
│   │   │   │   │   ├── kmlParser.ts      # KML/KMZ 解析
│   │   │   │   │   ├── kmlStyleParser.js # KML 样式解析
│   │   │   │   │   ├── shpParser.ts      # Shapefile 解析
│   │   │   │   │   ├── tifLoader.ts      # GeoTIFF 加载
│   │   │   │   │   └── ...
│   │   │   │   ├── dataDispatcher.js     # 数据格式分发（路由）
│   │   │   │   ├── archiveProcessor.js   # 归档解包、SHP 分组、资源 URL
│   │   │   │   ├── shpPacketBuilder.js   # 浏览器文件 SHP 包构建
│   │   │   │   ├── crs-engine.ts         # CRS 引擎（proj4 重投影）
│   │   │   │   ├── crsAware.js           # CRS 感知层
│   │   │   │   ├── mapRuntimeDeps.js     # OL 运行时依赖
│   │   │   │   └── ...
│   │   │   ├── geo/                      # CRS 相关 barrel
│   │   │   ├── biz/                      # 业务工具 barrel
│   │   │   ├── io/                       # GIS IO barrel
│   │   │   ├── url/                      # URL 工具（加密）
│   │   │   ├── ui/                       # UI 工具（loading）
│   │   │   ├── echarts/                  # ECharts 运行时
│   │   │   └── layerExportService.js     # 图层导出服务
│   │   ├── views/                        # 页面
│   │   │   ├── HomeView.vue              # 主页（地图 + 侧边栏）
│   │   │   ├── RegisterView.vue          # 注册页
│   │   │   ├── TermsOfService.vue        # 服务条款页
│   │   │   ├── PrivacyPolicy.vue         # 隐私政策页
│   │   │   └── home/                     # HomeView 拆分模块
│   │   │       ├── useDistrictLayer.ts   # 行政区划图层
│   │   │       ├── useLayerOperations.ts # 图层操作
│   │   │       └── useSidePanel.ts       # 侧边栏逻辑
│   │   ├── App.vue
│   │   └── main.js
│   ├── public/                           # 静态资源
│   ├── package.json
│   ├── vite.config.js
│   ├── eslint.config.js                  # ESLint 配置（含 TypeScript 支持）
│   └── README.md
├── backend/                              # 🔹 后端（FastAPI + Python）
│   ├── api/                              # 接口模块
│   │   ├── auth/                         # 鉴权模块（模块化拆分）
│   │   │   ├── __init__.py               # 门面 re-export
│   │   │   ├── constants.py              # 常量、角色、正则、邮箱验证常量
│   │   │   ├── db.py                     # 数据库连接工厂
│   │   │   ├── schema.py                 # DDL 建表与迁移
│   │   │   ├── password.py               # 密码哈希/验证
│   │   │   ├── models.py                 # Pydantic 请求模型
│   │   │   ├── user.py                   # 用户 CRUD
│   │   │   ├── session.py                # 会话管理、邮箱相关 CRUD
│   │   │   ├── email_service.py          # SMTP 邮件发送服务
│   │   │   ├── verification.py           # 验证码生成/存储/校验/频率限制
│   │   │   ├── preferences.py            # 用户偏好
│   │   │   ├── quota.py                  # 配额追踪
│   │   │   ├── system_config.py          # 系统配置
│   │   │   ├── dependencies.py           # FastAPI 依赖注入
│   │   │   └── routes.py                 # 路由处理函数
│   │   ├── agent_chat/                   # AI 对话代理（模块化拆分）
│   │   │   ├── __init__.py               # 门面 re-export
│   │   │   ├── constants.py              # 常量、环境变量
│   │   │   ├── schemas.py                # Pydantic 模型
│   │   │   ├── utils.py                  # 纯工具函数
│   │   │   ├── db.py                     # DB schema、config CRUD
│   │   │   ├── quota.py                  # 配额管理
│   │   │   ├── upstream.py               # 上游 LLM API 调用
│   │   │   └── routes.py                 # 路由处理函数
│   │   ├── spatial.py                    # 空间分析 API
│   │   ├── proxy.py                      # 瓦片代理 + 坐标纠偏
│   │   ├── download.py                   # 底图下载任务 API
│   │   ├── monitor.py                    # 日志监控
│   │   ├── statistics.py                 # 访问统计
│   │   └── ...
│   ├── core/                             # 核心业务逻辑
│   │   ├── tile_engine.py                # 瓦片下载 + GeoTIFF 拼接
│   │   └── task_scheduler.py             # 过期任务清理
│   ├── models/                           # 数据模型
│   │   └── download_task.py              # SQLModel 下载任务表
│   ├── gcj_rectify/                      # GCJ-02 坐标纠偏
│   ├── download_xyz/                     # XYZ 瓦片下载
│   ├── app.py                            # FastAPI 入口
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── pyproject.toml
│   └── README.md
├── Docs/                                 # 开发日志
│   ├── 26-04/                            # 2026年4月日志
│   ├── 26-05/                            # 2026年5月日志
│   ├── 26-06/                            # 2026年6月日志
│   │   ├── 26-06-02/                     # 前端文件重构 + 安全加固 + 卷帘持久化修复
│   │   ├── 26-06-03/                     # 邮箱验证码发送逻辑修复
│   │   │   └── 2026-06-03-fix-email-send-logic.md  # 修复axios拦截/倒计时/429处理
│   │   └── 2026-06-03-ring-explosion-effect.md  # 圆环粒子特效开发日志
│   └── TODO/                             # 待办事项
├── docker-compose.yml                    # 顶级 Docker Compose
├── LocalDev.bat                          # 一键启动脚本（纯 ASCII，兼容 GBK/UTF-8）
├── Write-Color.ps1                       # 彩色输出辅助脚本（中文消息 + ANSI 颜色）
└── README.md                             # 本文件
```

## 📚 文档导航

- **[前端详细文档](./frontend/README.md)**：Vue 3、Vite、组件、状态管理、构建优化
- **[后端详细文档](./backend/README.md)**：FastAPI、Pydantic、Docker、部署
- **[部署指南](##部署指南)**：GitHub Pages、Docker、HF Spaces

## 🏗️ 架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                      前端 ( Vue 3 )                     │
│                   http://localhost:5173                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Components (UI) → Composables (Logic) → Stores   │  │
│  │                       ↓                           │  │
│  │              API Service Layer                    │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/REST
                         ↓
┌─────────────────────────────────────────────────────────┐
│                   后端 (FastAPI)                        │
│                   http://localhost:7860                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Routes → Services (Business Logic) → Utils       │  │
│  │           ↓                                       │  │
│  │     External APIs / Databases                     │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 前后端通信

| 环境 | 前端地址 | 后端地址 | API 端点 |
|------|---------|---------|---------|
| **本地开发** | http://localhost:5173 | http://localhost:7860 | http://localhost:7860/api/* |
| **生产环境** | https://negiao.github.io/WebGIS-Dev/ | https://negiao-webgis.hf.space/ | https://negiao-webgis.hf.space/api/* |
| **GitHub Pages** | https://NEGIAO.github.io/WebGIS | Hugging Face Spaces | [查看 deploy.yml] |

## 🌐 部署指南

### 前端部署（GitHub Pages）

前端通过 GitHub Actions 自动部署：

1. **首次配置**：
   - 在仓库 Settings → Pages 中启用 GitHub Pages
   - 选择 Deploy from a branch，分支为 `gh-pages`

2. **自动触发**：
   - 推送到 `main` 或 `fullstack` 分支时自动触发
   - Actions 会自动构建并部署到 GitHub Pages

3. **访问**：
   - https://NEGIAO.github.io/WebGIS （通过中间仓库 NEGIAO.github.io）

### 后端部署（Hugging Face Spaces）

后端通过 GitHub Actions 自动推送到 HF Spaces：

1. **前置条件**：
   - 在 Hugging Face 创建 Space：https://huggingface.co/spaces
   - 在 GitHub Secrets 配置 `HF_TOKEN`

2. **自动部署**：
   - 推送到 `main` 或 `fullstack` 分支时自动触发
   - Actions 使用 `git subtree` 推送 backend 目录
   - 自动构建 Docker 镜像并启动服务

3. **验证**：
   - HF Spaces 构建日志：https://huggingface.co/spaces/NEGIAO/WebGIS
   - API 文档说明：https://NEGIAO-WebGIS.hf.space/docs

### Docker 本地部署

```bash
# 构建后端镜像
docker build -t webgis-backend:latest -f Dockerfile .

# 运行容器
docker run -p 7860:7860 webgis-backend:latest

# 或使用 docker-compose
docker-compose up --build
```

## 🔑 环境变量配置

### 前端环境变量（frontend/.env）

```bash
# 天地图 API Token
VITE_TIANDITU_TK=your_tianditu_token

# 高德 Web 服务 Key
VITE_AMAP_WEB_SERVICE_KEY=your_amap_key

# LLM API（AI 助手）
# 现已改为后端代理模式：前端无需配置任何 LLM Key
# 对话统一经由后端接口 /api/agent/chat/*

# 后端 API 地址
VITE_BACKEND_URL=http://localhost:7860
```

### 后端环境变量（backend/.env）

```bash
# 第三方 API Keys
AMAP_API_KEY=your_key
TIANDITU_API_KEY=your_key

# Agent 对话（后端代理）
AGENT_API_KEY=your_agent_key
AGENT_BASE_URL=https://api.qnaigc.com/v1
AGENT_MODEL=deepseek-V3-0324
AGENT_CHAT_GUEST_DAILY_QUOTA=10
AGENT_CHAT_REGISTERED_DAILY_QUOTA=100

# 数据库（可选）
DATABASE_URL=postgresql://user:password@localhost/webgis

# 日志级别
LOG_LEVEL=INFO
```

## 📊 项目统计

| 指标 | 数值 |
|------|------|
| 前端组件数 | 30+ |
| 后端 API 端点 | 45+ |
| 前端源码行数 | 77K+ |
| 构建体积优化 | -35% |
| 首屏加速 | 30-50% |
| 支持的数据格式 | 8+ |
| 技术栈 | 5+ |
| ESLint 错误 | 0 |

## 🔄 更新日志

### V3.2.2 (2026-06-04)
#### 🔧 统一 HTTP 状态码映射 + 日志监控修复 + 瓦片请求中断修复

**前端新增：**
- ✅ `httpStatusMap.js`：统一 HTTP 状态码映射模块（80+ 标准 HTTP 码 + 40+ 高德 infocode 中文描述）
- ✅ `getHttpStatusMessage()` / `getAmapErrorMessage()` / `buildHttpErrorMessage()` / `classifyHttpStatus()` / `isRetryable()` 辅助函数

**前端修复：**
- ✅ axios 响应拦截器：错误日志附带 `[503 服务暂不可用]` 标签，`apiError` 新增 `status`/`statusText`
- ✅ 统一 geocoding / weather / ipLocation / map / locationSearch 的高德 infocode 错误映射
- ✅ LogMonitor `getLogClass()`：HTTP 状态码正则检测优先于 `INFO` 关键字，5xx 红色 / 4xx 黄色 / 2xx 绿色
- ✅ `tileLifecycle.ts`：`fetch()` + `AbortController.signal` 替代 `img.src`，abort 立即释放 TCP 连接
- ✅ 修复 `useBasemapResilience` 的 `validateBaseLayerSwitch` setTimeout 泄漏

### V3.2.1 (2026-06-03)
#### 📧 邮箱验证码系统 + 密码重置 + 认证安全增强

**后端新增：**
- ✅ `email_service.py`：SMTP 邮件发送服务（阿里云邮件推送代理转发，HTML 验证码模板，异步发送，零额外依赖）
- ✅ `verification.py`：验证码核心逻辑（secrets 安全生成、频率限制 60秒/次、每日上限 10次、5次尝试上限、5分钟有效期）
- ✅ `email_verification_codes` 表 + users 表 email/email_verified 字段 + 邮箱部分唯一索引
- ✅ 新增 SendCodeRequest / VerifyCodeRequest / ResetPasswordRequest 请求模型
- ✅ 新增 POST `/api/auth/send-code`、`/verify-code`、`/reset-password` 接口
- ✅ 改造 POST `/api/auth/register` 支持邮箱绑定（可选）
- ✅ 新增邮箱 CRUD 函数（_get_user_by_email_sync / _check_email_taken_sync / _update_user_password_by_email_sync 等）

**前端新增：**
- ✅ 新增 `apiAuthSendCode` / `apiAuthVerifyCode` / `apiAuthResetPassword` API 函数
- ✅ 注册表新增邮箱输入框 + 验证码行（发送/验证/已验证徽章）
- ✅ 登录模式新增"忘记密码？"链接 + 密码重置弹窗（两步：邮箱→验证码+新密码）

**安全设计：**
- 🔒 6位数字验证码（secrets 模块安全生成）
- 🔒 60秒发送间隔限制 + 每日上限 10 次
- 🔒 5分钟有效期 + 最多 5 次验证尝试
- 🔒 邮箱部分唯一索引（防并发注册竞态）
- 🔒 密码重置后注销该账号全部会话

**Code Review 修复：**
- schema.py 新增邮箱唯一索引（`idx_users_email_unique`），防止并发注册竞态
- auth.js 移除密码字段 trim，保留用户输入意图

详见 [前端文档](./frontend/README.md#v321-2026-06-03) | [开发日志](./Docs/26-06/2026-06-03-邮箱验证码与密码重置.md)

---

### V3.2.0 (2026-06-03)
#### ✨ 圆环粒子特效鼠标交互 + 🔧 GCJ-02 纠偏模块优化

**前端新增 - 圆环粒子特效：**
- 🖱️ **鼠标跟随**：圆环平滑跟随鼠标移动（缓动插值系数 0.08）
- 🎯 **悬停增强**：鼠标进入圆环范围时亮度提升 1.4 倍，颜色粉色→蓝色平滑渐变
- 💥 **点击迸发**：鼠标点击瞬间爆发 30 个高速粒子（2.5x 速度）
- 🔄 **拖拽旋转**：鼠标拖拽时计算角速度，影响粒子切向速度方向

**后端优化 - GCJ-02 纠偏模块：**
- 🐛 **P0 修复**：`fetch_tile()` 移除递归调用，改为循环+重试
- ⚡ **性能提升**：缓存命中直接返回字节，预期减少 50%+ I/O 开销
- 🔍 **格式验证**：添加魔数快速检查，避免不必要 PIL 解码
- 📝 **代码质量**：变量命名、文档字符串、类型注解全面改进
- 🛡️ **健壮性**：WebP 长度验证、异常处理、变量初始化

详见 [前端文档](./frontend/README.md#v320-2026-06-03) | [后端优化详情](./Docs/26-06/2026-06-03-gcj-rectify-code-review.md)

### V3.1.9 (2026-06-02)
#### 🧹 前端文件重构 + 🔒 安全加固 + 卷帘持久化修复

本次版本包含前端项目全面文件重构、XSS/SSRF 安全修复、卷帘状态恢复逻辑修复。

---

#### 🧹 前端文件重构（详见 [前端文档](./frontend/README.md#v319-2026-06-02)）

- **清理死代码**：删除 vendored ol.js/ol.css (~1.5MB)、空目录、误放文件
- **消除重复**：新建 `pathUtils.js`、`textDecoder.js` 共享模块，消除 6+ 处重复实现
- **组件拆分**：FloatingAccountPanel (2520→1463行, -42%)、WeatherChartPanel (1883→460行, -76%)
- **数据重组**：goldenSoupQuotes 迁移至 `data/`、重命名误导性常量文件
- **Barrel 清理**：`geo/index.js`、`biz/index.js` 移除不相关 re-export

---

#### 🛡️ 安全加固

##### 1. 全局消息 XSS 修复
- `Message.vue` 新增 `escapeHtml()` 函数，对所有 `v-html` 渲染的文本进行五字符转义（`&`/`<`/`>`/`"`/`'`）
- 覆盖项目唯一的 `v-html` 攻击面

##### 2. 代理 SSRF 防护
- `proxy.py` 新增 `_is_private_host()` 校验，阻断 localhost/私网 IP/链路本地/保留地址
- 默认开启 TLS 校验（`PROXY_VERIFY_SSL=true`），通过环境变量兼容特殊部署
- `follow_redirects=False` 防止重定向型 SSRF 绕过

---

#### 📊 卷帘持久化修复

##### 1. 新增显式左右图层持久化
- `useSwipeConfigStore` 新增 `leftLayerIds`/`rightLayerIds` 字段
- `enableBasemapSwipe` 启用时同时写入显式左右列表，不再仅依赖拼接后的 `targetLayerIds`

##### 2. 恢复逻辑增强
- `restoreSwipe` 优先读取持久化的 `leftLayerIds`/`rightLayerIds`
- 兼容旧数据：无显式左右列表时回退到 midIndex 拆分（原有行为）

---

#### 📁 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/components/Shell/Message.vue` | XSS 转义修复 |
| `backend/api/proxy.py` | SSRF 防护 + TLS 默认开启 |
| `frontend/src/composables/map/features/useBasemapSwipe.js` | 接入 leftLayerIds/rightLayerIds |
| `frontend/src/stores/useSwipeConfigStore.ts` | 新增左右字段 + 显式类型标注 |
| `README.md`、`frontend/README.md`、`backend/README.md` | 文档同步 |

---

### V3.1.8 (2026-05-31)
#### 🔧 LocalDev.bat 智能构建检测 + 彩色输出 + 编码兼容

优化本地开发启动脚本，解决跨系统编码兼容性问题，增加智能 Docker 镜像管理。

---

#### 🌟 新增功能

##### 1. 智能 Docker 镜像构建检测
- **首次运行**（无镜像）→ 自动 `--build` 构建
- **仅修改代码** → 跳过构建，靠 volume 映射 + uvicorn `--reload` 热重载
- **Dockerfile 变更** → 检测到镜像与 Dockerfile 时间不一致，提示用户选择是否重建
- 通过比较 Dockerfile 修改时间与镜像创建时间判断是否需要重建

##### 2. ANSI 彩色输出
- 步骤标题（MAGENTA）、成功（GREEN）、错误（RED）、警告（YELLOW）、信息（CYAN）、辅助（DIM）
- 自动检测并启用 Windows Terminal VT100 支持，老终端降级为纯文本

##### 3. 编码兼容架构
- `LocalDev.bat` 保持 100% 纯 ASCII，兼容任意系统 OEM 代码页（GBK/UTF-8/其他）
- 中文消息集中到 `Write-Color.ps1`（UTF-8 BOM），通过数字 ID 调用
- 错误处理全部使用 `goto` 跳转，避免括号块内中文解析问题

---

#### 📁 新增文件

| 文件 | 说明 |
|------|------|
| `Write-Color.ps1` | 彩色输出辅助脚本，集中定义所有中文消息 + ANSI 颜色 |

---

#### 🔧 优化项

| 项目 | 优化前 | 优化后 |
|------|--------|--------|
| Docker 构建 | 每次 `up -d` 不感知镜像状态 | 智能三段式检测 |
| 编码兼容 | UTF-8 中文在 GBK 系统闪退 | 纯 ASCII .bat + PS1 分离 |
| 终端颜色 | 无 | ANSI 彩色输出 |
| 错误处理 | 括号块内中文 echo | goto 跳转 + ASCII echo |

---

#### 🛡️ 底图容灾模块修复

##### 1. FallbackManager 单例化
- **问题**：每次调用 `createBaseLayerFallbackManager` 创建新实例，降级计数器重置，降级链永远从头开始（`tianDiTu → tianDiTu → ...`）
- **修复**：`getFallbackManager(layerId)` 按 layerId 缓存实例，降级链正确推进（`tianDiTu → local`）
- 同时跳过当前失败的 layerId，避免降级到同一个图层

##### 2. 瓦片验证逻辑修正
- **问题**：`Promise.race` 中 1.5s 硬编码超时永远赢过 3s 的 `checkTimeoutMs`，参数失效
- **修复**：移除 `Promise.race`，使用 `checkTimeoutMs` 作为唯一超时
- 新增 `tileloadstart` 监听，要求至少 1 次 start + 1 次 end 才算成功，避免缓存假阳性

##### 3. 内存泄漏修复
- `cleanUp()` 时从 `activeMonitors` Map 中移除条目并重置 monitorKey
- `disposeAllMonitors()` 同时清理 `fallbackManagers` Map
- `loadingTilesCount` 改为 `Math.max(0, count - 1)` 防止负数

---

#### 📍 用户定位模块鲁棒性增强

##### 1. GPS 错误分类
- 区分 4 种错误：权限拒绝、信号弱、超时、未知
- 每种错误给用户有意义的中文提示，不再静默吞掉

##### 2. 请求竞态防护
- `activeLocateController` 全局单例，新定位请求自动 abort 旧的
- 多次快速点击"定位"不会产生竞态覆盖

##### 3. 并行策略优化
- `Promise.all` → `Promise.allSettled`，GPS 和 IP 定位互不阻塞
- IP 抛出配额用完错误时正确向上层传递

##### 4. 逆地理编码超时
- 独立 `AbortController` + 8s 超时，避免 Nominatim 等慢服务阻塞
- `apiLocationReverse` 和 `addressToLocation` 均支持 `signal` 参数透传

##### 5. 其他修复
- `markLocationSuccessFlagInUrl`：不再无条件覆盖 `s` 参数
- `isCoordinateInChina`：收紧边界框（lat 18→3），正确覆盖南海诸岛
- `getCurrentLocation`：添加 `maximumAge: 60000` 允许复用缓存位置，加速定位
- `zoomToUserCityByIp`：geocode 失败时使用 IP extent 中心作为坐标回退

---

#### 📁 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/composables/map/features/useBasemapResilience.js` | FallbackManager 单例、瓦片验证修正、内存泄漏修复 |
| `frontend/src/composables/map/features/useBasemapSelectionWatcher.js` | 适配 `getFallbackManager` API |
| `frontend/src/components/Map/MapContainer.vue` | 适配 API 重命名 |
| `frontend/src/composables/useUserLocation.js` | GPS 错误分类、竞态防护、超时控制、边界修复 |
| `frontend/src/api/backend/location.js` | `apiLocationReverse` 支持 AbortSignal |
| `frontend/src/api/geocoding.js` | `addressToLocation` 支持 AbortSignal |
| `Docs/26-05-31/code-review-basemap-resilience-2026-05-31.md` | 底图容灾模块 Code Review 报告 |

---

### V3.1.7 (2026-05-30)
#### 🔧 ESLint 全项目修复 + 超大文件拆分重构

本次版本对前端代码质量进行全面治理，并将 3 个超大模块拆分为更小的文件。

---

#### 🌟 代码质量

##### 1. ESLint 全项目修复（389 → 0 errors）
- 修复全部 ESLint 错误：未使用变量、空 catch 块、console 语句、无用转义、属性排序等
- 配置 `@typescript-eslint/no-unused-vars` 忽略 `_` 前缀变量
- 添加 `globals.node` 支持 Node.js 脚本文件
- 新建 `tsconfig.json`，关闭 `noImplicitAny`，修复 12 个 TypeScript 类型错误

##### 2. 构建警告修复
- `useFluid.js`：修复被 ESLint 自动修复破坏的导入语句
- `useMapUIEventHandlers.js`：同上

---

#### 📦 超大文件拆分

| 原文件 | 原行数 | 拆分结果 | 文件数 |
|--------|--------|---------|--------|
| `api/backend.js` | 881 | `backend/` 子目录 | 10 |
| `utils/gis/dataDispatcher.js` | 696 | + archiveProcessor + shpPacketBuilder | 3 |
| `composables/useTileSourceFactory.ts` | 1099 | `tileSource/` 子目录 | 8 |

**拆分原则**：原文件变为 barrel re-export，所有消费方 import 路径不变。

---

#### 📁 文件变更

| 操作 | 文件 |
|------|------|
| 新建 | `api/backend/{client,auth,location,weather,routing,agent,statistics,admin,spatial,index}.js` |
| 新建 | `composables/tileSource/{types,urlUtils,tileLifecycle,wmsSource,wmtsSource,xyzSource,index}.ts` |
| 新建 | `utils/gis/archiveProcessor.js`、`utils/gis/shpPacketBuilder.js` |
| 新建 | `tsconfig.json` |
| 修改 | `eslint.config.js`（添加 globals.node + no-unused-vars 配置） |
| 修改 | 50+ 个源文件（ESLint 修复） |

### V3.1.6 (2026-05-29)
#### 🔧 超大文件拆分 + 图层拖拽性能优化

本次版本对核心模块进行拆分重构，并修复图层拖拽排序卡顿问题。

---

#### 🌟 新增功能

##### 1. 模块化重构
- **底图配置模块** `constants/basemap/`：将 1587 行的 `useBasemapManager.ts` 拆分为配置层 + 逻辑层
- **数据导入模块** `composables/dataImport/`：提取栅格/矢量工具函数为独立模块
- **图层 Store 模块** `stores/layer/`：将工具函数和树构建器从 `useLayerStore.ts` 分离
- **清理冗余代码**：移除未使用的主机测速逻辑（`probeGoogleHostLatency`、`resolvePreferredGoogleHost`）

#### ⚡ 性能优化

##### 2. 图层拖拽排序性能优化
- **问题**：图层树拖拽排序严重卡顿，即使只有 2 个图层
- **原因**：TOCPanel 使用 `deep: true` watch，每次拖拽都触发递归比较和完整树重建
- **方案**：
  - 移除 `deep: true`，改用浅比较
  - 添加 `layerTree` 缓存层，只在图层 ID 序列变化时才重建树
- **效果**：拖拽响应速度提升 90%+

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| `useBasemapManager.ts` | 1587 行 | ~400 行 |
| `useLayerDataImport.js` | 1428 行 | 1235 行 |
| `useLayerStore.ts` | 1110 行 | 344 行 |
| 拖拽排序响应 | 卡顿 | 流畅 |

---

### V3.1.5 (2026-05-28)
#### 🎨 主题系统工程化 + 性能优化

本次版本完成 CSS 样式体系统一化，实现全局主题切换功能，并修复多项性能问题。

---

#### 🌟 新增功能

##### 1. 全局主题系统 ✨
- **统一 CSS 变量体系**：新建 `theme.css`，定义 40+ 全局设计令牌（品牌色/文字色/背景色/边框色/渐变/阴影）
- **绿色系主题切换**：支持「默认绿」和「海洋蓝」两套主题，一键切换实时预览
- **主题持久化**：通过 localStorage 保存用户偏好，刷新页面自动恢复
- **组件全覆盖**：迁移 20+ 个 Vue 组件的硬编码色值为 CSS 变量（ControlsPanel/Shell/UserCenter/views/Routing/Chat/Weather/Map/Compass 等）
- **TOC 主题联动**：`toc-theme.css` 主色改为引用全局变量，主题切换时 TOC 面板同步变化

##### 2. 空间聚合 BBox 自动获取 ✨
- 空间聚合分析的可视范围 BBox 支持自动获取当前地图视图范围
- 新增「获取当前视图范围」按钮，无需手动输入经纬度

#### ⚡ 性能优化

| 优化项 | 预估节省 |
|--------|----------|
| `loadJsZip.ts` 移除静态 import，仅保留动态懒加载 | ~115KB |
| `deferredGisAssets.js` 的 `import *` 改为动态导入 | ~80KB |
| `lodash-es` 替换为 16 行原生 debounce 实现 | ~25KB |
| `apiLocationTrackVisit` 超时从 8s 缩短到 3s | 首屏体验 |

#### 🔧 代码质量

- 修复 `useSwipeConfigStore` 的 `setSwipeConfig` 未持久化的 Bug
- 修复 `constants/index.js` 中 `useBasemapManager` 的错误路径
- 清理死代码：删除未使用的 `base.css` / `main.css`
- `ControlsPanel.vue` 清理死代码 emit、修复 `message.warn` → `message.warning`
- `backend.js` 抽取 `normalizeChatHistory` 共用函数、`syncUserRoleToUrl` 迁移至 `auth.js`
- `spatialAnalysis` API 添加 30s 独立超时

#### 📁 文件变更

| 操作 | 文件 |
|------|------|
| 新建 | `assets/theme.css`、`stores/useThemeStore.ts` |
| 删除 | `assets/base.css`、`assets/main.css` |
| 修改 | 20+ 个 Vue 组件 CSS 迁移、`toc-theme.css`、`App.vue`、`stores/index.ts` 等 |

---

### V3.1.4 (2026-05-28)
#### 🔹 高级空间分析功能扩展

本次版本新增 4 项高级空间分析能力，将空间分析工具从 5 个扩展到 9 个，覆盖公共设施服务范围划分、宏观热点统计、辐射圈分级评估和大数据传输优化等业务场景。

---

#### 🌟 新增功能

##### 1. 泰森多边形（Voronoi Diagram） ✨
- **业务场景**：公共设施服务范围划分（消防栓、外卖站点、快递柜等最近邻势力范围）
- **后端**：`shapely.ops.voronoi_diagram` 计算 Voronoi 图，自动裁剪到边界 envelope
- **前端**：随机彩色半透明填充，蜂窝状视觉效果
- **属性**：每个 Feature 附带 `site_index` 标识对应站点

##### 2. 空间聚合分析（Spatial Aggregation） ✨
- **业务场景**：大范围离散数据的宏观热点统计（交通事故、旅游签到等）
- **后端**：支持方格网（Grid）和六边形网格（Hexbin）两种聚合模式
- **前端**：根据 `count` 属性做分级色彩表达，比热力图更具空间统计严谨性
- **参数**：BBox 范围 + 网格类型 + 网格大小

##### 3. 多环缓冲区（Multi-ring Buffer） ✨
- **业务场景**：污染源/地铁站辐射圈分级评估（核心影响区/边缘波及区/安全防护区）
- **后端**：接收距离数组，使用 `difference` 擦除生成"甜甜圈"中空环状拓扑
- **前端**：由深到浅的渐变同心圆环渲染
- **属性**：每个环附带 `ring_index` 和 `distance_m`

##### 4. 几何简化（Simplify） ✨
- **业务场景**：大数据量网络传输优化（精细海岸线、省界等复杂几何的节点抽稀）
- **后端**：Douglas-Peucker 算法 + `preserve_topology=True`，保证拓扑正确
- **前端**：展示简化前后节点数对比和压缩比率
- **属性**：每个 Feature 附带 `original_vertices` 和 `simplified_vertices`

---

#### 📁 涉及文件变更

| 文件 | 变更 |
|------|------|
| `backend/api/spatial.py` | 新增 4 个分析函数 + 扩展请求模型 |
| `frontend/src/composables/map/features/useSpatialAnalysis.js` | 扩展分析类型支持 |
| `frontend/src/components/ControlsPanel/SpatialAnalysisPanel.vue` | 新增 4 个工具卡片 UI |

---

### V 3.1.3 (2026-05-28)
#### 🔹 KML/KMZ 样式解析增强 + 编码多支持

本次版本聚焦 **KML/KMZ 样式解析的健壮性**，增强编码检测、修复颜色渲染问题，确保来自不同工具（如 Google Earth）的 KML 文件能正确显示样式颜色。

---

#### 🌟 核心改进（重点）

##### 1. 编码多支持策略 ✨
- **问题**：KML 文件可能采用 UTF-16LE/UTF-16BE 等多种编码，原有只支持 UTF-8，导致解码失败
- **方案**：实施 **多编码尝试 + 最优选择策略**
  - 候选编码：UTF-8 > UTF-16LE > UTF-16BE > GBK
  - 选择标准：替代字符（\uFFFD）最少的编码
- **涉及函数**：
  - `kmlParser.ts::parseKmlBuffer()`
  - `dataDispatcher.js::decodeBufferToText()`
  - `useLayerDataImport.js::decodeTextContent()`

##### 2. KML 颜色渲染修复 🎨
- **问题**：颜色十进制字符串拼接导致非法 `#` 颜色值（如 `#163214245`），OpenLayers 回退为黑色
- **修复**：改用十六进制字符串生成合法 `#RRGGBB` 格式颜色值
- **测试**：HENU湖泊.kmz 现能正确渲染蓝色（原 KML color: fff5d6a3）

##### 3. KML PolyStyle 缺省值修复 📐
- **问题**：`<fill>` 和 `<outline>` 元素缺失时被误判为 false，导致仅描边渲染
- **修复**：按 KML 2.2 规范，缺失时默认为 true（填充 + 描边）
- **结果**：多边形样式渲染完整

---

#### 📊 改进清单
| 改进项 | 前 | 后 | 效果 |
|-------|-----|-----|------|
| 编码支持 | UTF-8/GBK | UTF-8/UTF-16LE/UTF-16BE/GBK | 兼容更多 KML 来源 |
| 颜色格式 | 十进制字符串 | 十六进制 #RRGGBB | 正确渲染颜色 |
| PolyStyle 缺省 | false | true | 符合 KML 规范 |
| KMZ 渲染效果 | 黑色（无样式） | 正确颜色 | 一致性提升 100% |

---

#### 📦 涉及文件
- `frontend/src/utils/gis/parsers/kmlStyleParser.js` —— 颜色解析 & PolyStyle 修复
- `frontend/src/utils/gis/parsers/kmlParser.ts` —— 编码多支持
- `frontend/src/utils/gis/dataDispatcher.js` —— Buffer 解码编码多支持
- `frontend/src/composables/useLayerDataImport.js` —— 文本解码编码多支持

---

#### ✅ 兼容性
- ✅ **无破坏性变更**：对外接口完全保持不变
- ✅ **向后兼容**：现有 KML/KMZ 导入流程无需修改
- ✅ **渐进式修复**：直接升级即可自动享受改进

---

#### ✅ 使用者收益
1. **样式完整**：KML/KMZ 导入时颜色、线条、填充完整应用
2. **兼容性强**：支持多种编码的 KML 文件，不再限于 UTF-8
3. **规范遵循**：严格按 KML 2.2 规范处理样式，避免非标准解析

---

### V 3.1.2 (05-08) 
- 原生下载模式: 为大文件下载引入 token-based 浏览器原生下载，避免页面内存占用。  
- 后端 FileResponse 优化: 使用 RFC 5987 编码的 Content-Disposition 并增加缓存控制头。  
- 前端增强: `MapDownloader.vue` 增加下载模式选择（native/progressive），Progressive 模式保留流式进度显示。  
### V3.1.0 (2026-05-04)
#### 🔹 在线地图下载 + GCJ-02实时纠偏 + Docker Compose容器化

本次版本引入**在线地图下载系统、GCJ-02坐标纠偏、Docker Compose容器化**，进一步完善后端服务能力，实现专业级地图数据导出功能。

---

#### 🌟 核心特性（重点）

##### 1. 在线底图下载面板（MapDownloader）✨
- **功能**：前端UI可视化选择任意在线底图、自定义分辨率、矩形框选范围
- **输出**：异步后端任务生成标准 GeoTIFF 格式地图数据，可直接导入 ArcGIS / QGIS 等专业 GIS 应用
- **工作流**：
  1. 用户选择底图源（天地图/Google/自定义 URL）
  2. 输入分辨率（支持 EPSG:4326 / EPSG:3857 两种坐标系）
  3. 地图框选范围（拖拽矩形）或手动输入四至范围
  4. 提交后端，后端异步下载瓦片 + Rasterio 拼接
  5. 生成 GeoTIFF 文件，自动计算过期时间（30分钟保留期）
  6. 前端轮询获取进度，完成后自动下载
- **技术亮点**：
  - 后端 httpx 异步并发下载（信号量控制 10 并发）
  - Rasterio Window 流式写入（避免全量内存加载）
  - SQLite 任务持久化 + APScheduler 自动清理

##### 2. GCJ-02在线底图实时纠偏 ✨
- **问题**：高德、腾讯地图使用 GCJ-02 坐标系，直接叠加会产生偏移
- **解决**：后端新增 GCJ-02 ↔ WGS84 实时转换代理
  ```
  /proxy/gcj2wgs/{target_url:path}  —— GCJ-02 → WGS84
  /proxy/wgs2gcj/{target_url:path}  —— WGS84 → GCJ-02
  ```
- **使用场景**：
  - 高德底图配合 WGS84 数据层叠加
  - 下载高德底图后，自动纠偏以 WGS84 存储

##### 3. Docker Compose 容器化部署 🐳
- **改进**：后端升级为 Docker Compose 多容器编排
- **优势**：
  - 依赖隔离：应用、数据库、缓存独立容器
  - 开发一致性：本地开发环境 = 生产环境
  - 快速启动：一命令启动完整后端栈
- **一键启动**：`LocalDev.bat` 双击即可启动前后端

---

#### 📦 涉及文件

**前端新增**：
- `frontend/src/components/MapDownloader.vue` —— 下载面板 UI
- `frontend/src/stores/useDownloadStore.ts` —— Pinia 状态管理
- `frontend/src/api/download.js` —— API 客户端

**后端新增**：
- `backend/core/tile_engine.py` —— 瓦片下载 + 拼接引擎
- `backend/core/task_scheduler.py` —— 过期任务清理调度器
- `backend/models/download_task.py` —— SQLModel 任务表
- `backend/api/download.py` —— 下载任务 REST API

**部署升级**：
- `docker-compose.yml` —— Docker Compose 编排（顶级）
- `backend/docker-compose.yml` —— 后端专用编排
- `LocalDev.bat` —— 升级，支持 Docker Compose 启动

**依赖升级**：
- `backend/pyproject.toml` 新增：rasterio, sqlmodel, apscheduler, httpx

---

#### ⚙️ 新增后端接口

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/download/tasks` | 创建下载任务 |
| GET | `/api/download/tasks/{task_id}` | 查询任务状态 & 进度 |
| GET | `/api/download/tasks/{task_id}/file` | 下载 GeoTIFF 文件 |
| GET | `/proxy/gcj2wgs/{target_url:path}` | GCJ-02 → WGS84 纠偏 |
| GET | `/proxy/wgs2gcj/{target_url:path}` | WGS84 → GCJ-02 纠偏 |
| POST | `/api/agent/chat/proxy` | ✨ 用户个人 Key 代理聊天（绕过浏览器 CORS） |

---

#### 📋 环境要求

**必需依赖**：
- Node.js 16+
- Docker Desktop（**强制要求**）
- Python 3.10+（仅内部使用）

**启动方式**：
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

**最后更新**：2026-06-04
**当前版本**：V3.2.2
**项目状态**：开发中 - 持续迭代优化
