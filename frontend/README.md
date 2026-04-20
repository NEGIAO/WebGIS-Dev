# WebGIS 前端项目

## 📋 项目概述

基于 **Vue 3 + Vite + OpenLayers** 构建的专业级 WebGIS 前端应用。历经多次优化迭代，现已发展成为功能丰富、架构清晰的 WebGIS 平台。

### 🎯 核心功能

- 🗺️ **地图引擎**：OpenLayers 6.x + Cesium 3D 地球
- 📊 **数据管理**：多格式导入（GeoJSON/KML/SHP/GeoTIFF/CSV），批量导出
- 🎨 **可视化**：热力图、等高线、3D 要素、电影级效果
- 🔍 **交互**：绘制、测量、路线规划、地点搜索
- 🌤️ **天气**：实时天气 + 趋势预报
- 🤖 **AI 助手**：LLM 集成地理问答
- ⚡ **性能**：ESM 分包、动态加载、30-50% 首屏加速

## 🚀 快速开始

### 前置要求
- Node.js 18+
- npm 或 yarn
- 现代浏览器

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 打开浏览器
http://localhost:5173
```

### 生产构建

```bash
# 构建优化产物
npm run build

# 生成体积分析报告
npm run build:analyze

# 预览构建结果
npm run preview
```

## 🌐 多部署环境配置

本项目支持在多个不同的部署环境中运行，使用统一的资源路径处理机制。

### 支持的部署环境

1. **本地开发** - `http://localhost:5173`
   ```bash
   VITE_BASE_URL=./
   npm run dev
   ```

2. **GitHub Pages (WebGIS-Dev 仓库)**
   - URL: `https://negiao.github.io/WebGIS-Dev/`
   ```bash
   VITE_BASE_URL=/WebGIS-Dev/ npm run build
   ```

3. **GitHub Pages (io 仓库)**
   - URL: `https://negiao.github.io/WebGIS/`
   ```bash
   VITE_BASE_URL=/WebGIS/ npm run build
   ```

4. **Posit Connect Cloud**
   - URL: `https://negiao-pages.share.connect.posit.cloud/WebGIS/`
   ```bash
   VITE_BASE_URL=/WebGIS/ npm run build
   ```

### 路径处理标准

**✅ 正确做法（使用相对路径或 resolvePublicAssetPath 函数）**

```javascript
// ✅ 方式 1: 使用 resolvePublicAssetPath 函数（推荐）
import { resolvePublicAssetPath } from '@/utils'
const avatarUrl = resolvePublicAssetPath('avatars/avatar-0.svg')

// ✅ 方式 2: 在模板中直接使用函数
<img :src="resolvePublicAssetPath('avatars/avatar-0.svg')" />

// ✅ 方式 3: 相对路径（需要确保从正确的起点）
<img src="./avatars/avatar-0.svg" />
```

**❌ 错误做法（绝对路径会导致部署失败）**

```javascript
// ❌ 不要使用绝对路径
<img src="/avatars/avatar-0.svg" />  // 在不同部署环境中会失败
```

### resolvePublicAssetPath 函数原理

该函数会自动根据 `BASE_URL` 环境变量来构建正确的资源路径：

```javascript
function resolvePublicAssetPath(relativePath) {
  const base = String(import.meta.env.BASE_URL || '/').trim()
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = String(relativePath || '').replace(/^\/+/, '')
  return `${normalizedBase}${normalizedPath}`
}

// 示例
BASE_URL='./':              './avatars/avatar-0.svg'
BASE_URL='/WebGIS-Dev/':    '/WebGIS-Dev/avatars/avatar-0.svg'
BASE_URL='/WebGIS/':        '/WebGIS/avatars/avatar-0.svg'
```

### 配置说明

编辑 `.env.local` 或 `.env.production` 文件配置 VITE_BASE_URL：

```env
# 本地开发
VITE_BASE_URL=./

# 生产部署
# VITE_BASE_URL=/WebGIS-Dev/
# VITE_BASE_URL=/WebGIS/
```

或者在构建命令中直接指定：

```bash
# 为 GitHub Pages WebGIS-Dev 部署
VITE_BASE_URL=/WebGIS-Dev/ npm run build

# 为 GitHub Pages WebGIS 部署
VITE_BASE_URL=/WebGIS/ npm run build

# 为 Posit Cloud 部署
VITE_BASE_URL=/WebGIS/ npm run build
```

## 🔐 登录系统使用说明

前端已接入真实后端登录，不再使用本地假登录。

### 三类登录方式

1. 游客
- 用户名：user
- 密码：123

2. 注册用户
- 在登录页切换到“注册”模式创建账号
- 注册成功后切回“登录”模式

3. 超级管理员
- 账号与密码由后端数据库维护
- 管理员凭据不在前端代码与提示中展示

### 强制登录拦截

- 路由 /home 已开启守卫
- 未登录直接访问 /#/home 会自动跳转 /#/register
- 前端请求受保护后端 API 时会自动附加 Authorization: Bearer <token>

### 依赖后端认证接口

- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/logout
- POST /api/auth/change-password

## 📁 项目目录结构

```
frontend/
├── .env.example
├── .env.local
├── .env.production
├── index.html
├── package.json
├── vite.config.js
├── eslint.config.js
├── jsconfig.json
├── public/                         # 静态资源（images / tiles / ShareData）
├── docs/                           # 前端开发文档
├── scripts/                        # 维护脚本
├── src/
│   ├── App.vue
│   ├── main.js
│   ├── Guideline.md
│   ├── api/                        # 后端接口封装
│   │   └── backend.js              # 统一 API 客户端（含 Agent 配额/模型偏好/错误语义）
│   ├── assets/                     # 图片/样式等资源
│   ├── components/                 # 主业务组件
│   │   ├── MapContainer.vue
│   │   ├── TopBar.vue
│   │   ├── SidePanel.vue
│   │   ├── ChatPanelContent.vue    # AI 助手面板（零配置即刻响应/模型自动选择/额度同步）
│   │   ├── WeatherChartPanel.vue
│   │   ├── CesiumContainer.vue
│   │   └── UserCenter/
│   │       ├── FloatingAccountPanel.vue
│   │       ├── AdminControlPanel.vue
│   │       ├── ApiManagementPanel.vue
│   │       └── ApiKeysManagementPanel.vue  # 管理员 Agent 参数与额度配置
│   ├── composables/                # 组合式逻辑
│   │   └── map/features/           # 地图功能模块化拆分
│   ├── constants/                  # 常量与配置
│   ├── router/                     # 路由与二段式页面懒加载
│   │   ├── index.js                # 路由守卫 + Loading Relay 接力（home 路由不提前 hideLoading）
│   │   └── lazyHomeViewLoader.js   # Home 页面二段式懒加载隔离器（避免登录首屏拉取 GIS 重资源）
│   ├── stores/                     # Pinia 状态管理
│   ├── utils/                      # 工具与 GIS 处理
│   │   └── gis/
│   │       ├── mapRuntimeDeps.js            # OpenLayers 运行时依赖延迟入口
│   │       ├── deferredGisAssets.js         # GIS 重资源预热编排
│   │       └── deferredGisWarmupLauncher.js # 登录页 3 秒后预热触发器
│   └── views/
│       ├── HomeView.vue            # 用户中心全屏由此文件管理（覆盖 map-wrapper，接管地图加载态收口）
│       └── RegisterView.vue
├── dist/                           # 构建产物（生成目录）
├── stats.html                      # 构建分析产物（生成文件）
└── README.md
```

## 📦 核心依赖

| 依赖 | 版本 | 用途 |
|-----|------|------|
| Vue | 3.3+ | 框架 |
| Vite | 5.0+ | 构建工具 |
| OpenLayers | 8.x | 地图库 |
| Pinia | 2.1+ | 状态管理 |
| Vue Router | 4.2+ | 路由 |
| Cesium | 1.x+ | 3D 地球 |
| ECharts | 5.x+ | 图表 |
| Axios/Fetch | - | HTTP 客户端 |

详见 `package.json`

## 🔑 环境变量配置

复制 `.env.example` 为 `.env`：

```bash
# 天地图 API
VITE_TIANDITU_TK=your_tianditu_token

# 高德 Web Service Key
VITE_AMAP_WEB_SERVICE_KEY=your_amap_key

# AI 助手已改为后端代理模式（前端无需配置 LLM Key）
# 由管理员在后端配置 Agent Key 与模型参数

# 后端 API 地址
VITE_BACKEND_URL=http://localhost:8000
```

## 🏗️ 项目特点

### 1. 性能优化

- **ESM 分包架构**：基于 `manualChunks` 将框架、地图、数据层拆分为独立 chunk
- **动态导入**：ECharts、Cesium 等大库触发后加载
- **Console 清理**：生产构建时自动删除 `console` 和 `debugger`
- **首屏加速**：30-50% 性能提升

### 2. 模块化设计

- **清晰分层**：组件、可组合函数、状态、工具
- **单一职责**：每个文件一个职责，易于维护
- **边界入口**：通过 barrel（index.js）统一暴露，避免深链导入
- **文档索引**：自动生成依赖关系文档

### 3. GIS 数据处理

- **多格式支持**：GeoJSON、KML/KMZ、SHP、GeoTIFF、CSV
- **智能识别**：自动识别格式与坐标系
- **递归解压**：支持嵌套 ZIP/KMZ
- **坐标转换**：WGS-84 ↔ GCJ-02 ↔ WebMercator

### 4. 前后端通信

- **API 层解耦**：统一 `src/api/index.js` 管理所有请求
- **错误处理**：全局错误捕获与用户提示
- **异步支持**：Promise/async-await 模式

## 🛠️ 开发指南

### 新增页面

```bash
# 1. 创建页面组件
src/views/MyPage.vue

# 2. 配置路由
src/router/index.js

# 3. 导航
<router-link to="/my-page">页面</router-link>
```

### 新增 Pinia Store

```typescript
// src/stores/useMyStore.ts
import { defineStore } from 'pinia'

export const useMyStore = defineStore('my', () => {
  // 状态
  const state = ref({})

  // 方法
  const updateState = (data) => {
    state.value = data
  }

  return { state, updateState }
})
```

### 新增 API 服务

```javascript
// src/api/myService.js
export const getMyData = async (params) => {
  const response = await fetch('/api/v1/my-endpoint', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return response.json()
}

// 在 src/api/index.js 中导出
export { getMyData } from './myService.js'
```

### 调用 API

```javascript
import { getMyData } from '@/api'

// 在组件中使用
const data = await getMyData({ id: 123 })
```

## 🔄 更新日志

### V3.0.1 (2026-04-18)
#### 🔹 AI 对话前端改造（后端代理化）

**新增**：
- ✅ 聊天面板接入后端 Agent 接口（`/api/agent/chat/*`）
- ✅ 聊天面板展示后端返回的服务状态、模型与额度
- ✅ 管理后台新增 Agent 对话参数编辑能力（Base URL / Model / Prompt 等）

**改进**：
- ✅ 前端不再持有和直连 LLM token/key
- ✅ 对话额度按后端策略控制（游客 10、注册 100、管理员不限）

### V3.0.0 (2026-04-17)
#### 🔹 前后端分离架构完整版

**新增**：
- ✅ 独立 frontend 子目录
- ✅ 完整的 Guideline 开发约定
- ✅ TOC 协议层中心化（protocol.js）
- ✅ ParentId 驱动的层次结构

**改进**：
- ✅ 前端与后端 API 解耦
- ✅ 构建体积优化 35%+
- ✅ 类型检查与文档生成完善

**维护**：
- ✅ 依赖更新至最新稳定版
- ✅ ESLint 与 Prettier 配置同步

### 历史版本
- V2.8.9：TOC 协议层中心化
- V2.8.6：功能完善、性能优化
- V2.0.0：模块化架构
- V1.0.0：初始版本

## 🧪 测试

```bash
# 运行测试
npm run test

# 覆盖率报告
npm run test:coverage
```

## 📚 文档与资源

- [开发指南](./src/Guideline.md)
- [TOC 维护指南](./docs/TOC_MAINTENANCE_GUIDE.md)
- [边界索引](./docs/BOUNDARY_INDEX.md)
- [Vue 3 文档](https://vuejs.org/)
- [OpenLayers 文档](https://openlayers.org/)
- [Vite 文档](https://vitejs.dev/)

## 📝 代码规范

- **风格**：ESLint + Prettier
- **类型**：JSDoc 注释
- **文档字符串**：Google 风格
- **提交**：遵循 Conventional Commits

## 🐛 常见问题

### 1. 依赖安装失败
```bash
npm cache clean --force
npm install
```

### 2. 端口被占用
```bash
# 修改 vite.config.js 中的 port
npm run dev -- --port 5174
```

### 3. 地图瓦片加载失败
- 检查 API Key 配置
- 验证网络连接
- 查看浏览器控制台错误

### 4. 数据导入失败
- 确保文件格式正确
- 检查坐标系是否被正确识别
- 查看控制台错误信息

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'Add xxx'`)
4. 推送到分支 (`git push origin feature/xxx`)
5. 提交 Pull Request

## 📄 许可证

MIT License

---

**最后更新**：2026-04-18  
**当前版本**：V3.0.1  
**维护者**：NEGIAO  
**技术栈**：Vue 3 + Vite + OpenLayers + Cesium

```bash
cp .env.example .env
```

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `VITE_TIANDITU_TK` | 天地图 API Token，[申请地址](https://console.tianditu.gov.cn/) | 推荐 |
| `VITE_AMAP_WEB_SERVICE_KEY` | 高德 Web 服务 Key（地理编码、逆地理编码、IP定位、天气查询），[申请地址](https://lbs.amap.com/) | 推荐 |
| `VITE_BACKEND_URL` | WebGIS 后端地址（含 Agent 对话代理） | 必填 |

### 开发与构建

```bash
npm install
npm run dev
npm run build
```

### 体积诊断（推荐）

```bash
npm run build:analyze
```

执行后会在项目根目录生成 `stats.html`，可直接在浏览器打开并使用 treemap 查看各依赖与模块体积占比，定位超大 chunk 来源。

### 部署说明（GitHub Pages）

1. 本项目为纯前端静态架构，构建产物位于 `dist/`，无需后端运行时。
2. 执行 `npm run build` 后，可将 `dist/` 内容通过 GitHub Actions 或 `gh-pages` 分支发布到 GitHub Pages。
3. 当前构建配置使用相对资源路径，适配仓库路径型托管场景（例如 `https://<user>.github.io/<repo>/`）。

### 本地瓦片资源

将瓦片放置在 `public/tiles/{z}/{x}/{y}.png` 目录下即可自动读取，可使用QGIS制作切片，也可贡献到项目中共享。

## 目录结构

```text
WebGIS_Dev/
├── .env.example                        # 环境变量示例
├── .github/                            # GitHub Actions 工作流配置
├── .gitignore                          # Git 忽略文件配置
├── eslint.config.js                    # ESLint 配置文件
├── index.html                          # 应用入口 HTML
├── jsconfig.json                       # JavaScript 项目配置
├── package.json                        # NPM 脚本与依赖管理
├── package-lock.json                   # NPM 依赖锁定文件
├── vite.config.js                      # Vite 构建配置（manualChunks、analyzer、drop console/debugger）
├── README.md                           # 项目说明文档
├── start_server.bat                    # 启动服务脚本（Windows）
├── stats.html                          # 构建体积分析报告（生成目标）
│
├── public/                             # 静态资源根目录
│   ├── favicon.ico                     # 网站图标
│   ├── min-enhanced.js                 # 第三方统计脚本入口
│   ├── ol.js / ol.css                  # OpenLayers 备用静态资源
│   ├── images/                         # 站点静态图片资源
│   ├── tiles/                          # 本地 XYZ 瓦片存储目录（public/tiles/{z}/{x}/{y}.png）
│   └── ShareData/                      # 共享数据目录（KML/KMZ/GeoJSON/SHP/TIF 等用户上传资源）
│
├── src/                                # 源代码根目录
│   ├── App.vue                         # 根组件
│   ├── main.js                         # 应用入口（挂载 Vue、Pinia、Router、消息系统）
│   ├── Guideline.md                    # 项目内部开发约定与设计指南
│   │
│   ├── api/                            # ⭐ API 服务层（地理编码、天气、IP 定位等）
│   │   ├── index.js                    # 统一出口（推荐唯一导入入口）
│   │   ├── geocoding.js                # 地理编码/逆地理编码（高德 + 天地图双引擎）
│   │   ├── ipLocation.js               # IP 定位服务
│   │   ├── locationSearch.js           # 地名搜索（天地图/高德/Nominatim）
│   │   ├── map.js                      # 地图相关 API（含 AOI 提取）
│   │   └── weather.js                  # 天气查询服务
│   │
│   ├── components/                     # Vue 组件层
│   │   ├── UserCenter/                 # 用户中心与 API 管理面板
│   │   │   ├── FloatingAccountPanel.vue # 悬浮账号/登录入口
│   │   │   ├── AdminControlPanel.vue   # 管理员总览面板
│   │   │   ├── ApiManagementPanel.vue  # API 接口使用情况统计
│   │   │   └── ApiKeysManagementPanel.vue # API Keys 管理面板
│   │   ├── AmapAoiInjectDialog.vue     # 高德 AOI 手动注入对话框
│   │   ├── AttributeTable.vue          # 属性表：要素属性展示、分页、搜索与地图交互
│   │   ├── BusPlannerPanel.vue         # 公交路径规划面板：起终点设置、API 调用、结果展示
│   │   ├── CesiumAdvancedEffects.vue   # Cesium 3D 视觉效果与 ECharts 动态图表（3D 启用后懒加载）
│   │   ├── CesiumContainer.vue         # Cesium 2D/3D 切换容器
│   │   ├── ChatPanelContent.vue        # AI 空间助手组件（LLM API 集成）
│   │   ├── DrivingPlannerPanel.vue     # 驾车、步行路径规划面板：起终点、路线结果展示
│   │   ├── GlobalLoading.vue           # 全局加载遮罩：毛玻璃背景 + 绿色主题环形动画
│   │   ├── LayerControlPanel.vue       # 底图控制面板（右上）：地名搜索、底图切换、经纬网控制
│   │   ├── LayerPanel.vue              # TOC 树形展示层（数据由 Store 提供）
│   │   ├── LocationSearch.vue          # 地名搜索输入组件：联想下拉、双引擎选择
│   │   ├── MagicCursor.vue             # 首屏特效按钮：Delaunay、流体、重力、奇点、波动五大特效
│   │   ├── MapContainer.vue            # ⭐ 主地图容器：地图初始化、核心就绪/失败事件上报、组件桥接
│   │   ├── MapControlsBar.vue          # 坐标显示、缩放级别、坐标格式转换面板
│   │   ├── MapEasterEgg.vue            # 彩蛋交互区域：区域判定、像素定位、Lightbox 展示
│   │   ├── MapPointPickerCard.vue      # 地图点位拾取卡片（供路径规划使用）
│   │   ├── Message.vue                 # 消息通知组件（仿 Apple 灵动岛效果）
│   │   ├── SharedResourceTreeItem.vue  # 共享资源树形节点组件
│   │   ├── SidePanel.vue               # 右侧容器总控：资讯/LLM/TOC/路径规划等功能区
│   │   ├── TOCPanel.vue                # TOC 图层管理与工具面板：图层树、坐标工具、地理编码
│   │   ├── TOCTreeItem.vue             # 递归树节点组件：右键菜单、悬停按钮、级联可见性控制
│   │   ├── TopBar.vue                  # 顶部菜单栏：TOC 开关、分享地点、分享视图 URL
│   │   ├── WeatherChartPanel.vue       # 天气看板：温度趋势图 + 风力仪表、移动端自适应
│   │   └── icons/                      # 图标组件目录（大部分未启用）
│   │       ├── IconCommunity.vue       # 社区入口图标
│   │       ├── IconDocumentation.vue   # 文档入口图标
│   │       ├── IconEcosystem.vue       # 生态入口图标
│   │       ├── IconSupport.vue         # 支持入口图标
│   │       └── IconTooling.vue         # 工具入口图标
│   │
│   ├── composables/                    # ⭐ 可组合函数层（业务逻辑与状态管理）
│   │   ├── useGisLoader.ts             # GIS 数据导入调度器（多格式识别、解析、落图）
│   │   ├── useKmzLoader.js             # KMZ 解压、KML 提取与内部资源重写
│   │   ├── useLayerDataImport.js       # 数据导入总线：消费 packet、创建图层、应用样式
│   │   ├── useManagedLayerRegistry.js  # 托管图层注册表与状态广播
│   │   ├── useMapState.js              # ⭐ 地图状态管理引擎：URL 同步、视图动画、坐标工具
│   │   ├── useMessage.js               # 全局消息系统（队列、时长控制、宿主挂载）
│   │   ├── useMessageIslandMotion.js   # Message 交互控制（悬停暂停、立即关闭）
│   │   ├── useSharedResourceLoader.ts  # 共享资源加载器：扫描 public/ShareData、支持多格式
│   │   ├── useTileSourceFactory.ts     # 瓦片源工厂：XYZ/WMS/WMTS 格式识别、嗅探、创建
│   │   ├── useUserLayerActions.js      # 图层动作集合（显隐、删除、排序、缩放、样式）
│   │   ├── useUserLocation.js          # 用户定位、国内外判定、定位更新策略
│   │   ├── Magic/                      # 首屏特效库
│   │   │   ├── useWave.js              # 波动效果
│   │   │   ├── useGravity.js           # 重力效果
│   │   │   ├── useDelaunay.js          # Delaunay 三角剖分效果
│   │   │   ├── useFluid.js             # 流体效果
│   │   │   └── useSingularity.js       # 奇点效果
│   │   └── map/                        # ⭐ 地图功能域出口
│   │       ├── index.js                # map 域统一出口
│   │       ├── basemapSystem.js        # 底图系统功能出口
│   │       ├── layerManager.js         # 图层管理功能出口
│   │       ├── interactionHandlers.js  # 交互处理功能出口
│   │       ├── routeService.js         # 路线服务功能出口
│   │       ├── usePositionCodeTool.js  # p 参数编解码业务
│   │       ├── toc/                     # TOC 领域（标准模型、右键菜单、多选、导出、协议层）
│   │       │   ├── index.js             # toc 领域统一出口
│   │       │   ├── protocol.js          # 🔹 TOC 协议层（菜单命令常量、导出格式标准化、能力解析）
│   │       │   ├── factory.js           # StandardTOCItem 工厂（图层标准化）
│   │       │   ├── actions/
│   │       │   │   ├── contextActionManager.js     # TOC 面板右键动作管理器（统一处理批量/导出/图层动作）
│   │       │   │   ├── exportService.js            # KML 导出服务（OpenLayers KML format 封装）
│   │       │   │   └── selectionManager.js         # 递归多选与批量目标解析（含分帧大树选择）
│   │       │   └── menu/
│   │       │       ├── commandDispatcher.js        # 右键命令分发器（key -> 事件协议）
│   │       │       └── contextMenu.js              # 右键菜单构建器（capabilities 驱动）
│   │       └── features/               # 地图细粒度功能库（单一职责）
│   │           ├── README.md           # feature 库职责约束
│   │           ├── index.js            # feature 统一导出入口
│   │           ├── useBasemapLayerBootstrap.js      # 底图层初始化
│   │           ├── useBasemapResilience.js          # 底图自动兜底逻辑
│   │           ├── useBasemapSelectionWatcher.js    # 底图切换监听
│   │           ├── useBasemapStateManagement.js     # 底图状态管理
│   │           ├── useBasemapUrlMapping.js          # 底图 URL 映射
│   │           ├── useCoordinateSystemConversion.js # 坐标系转换
│   │           ├── useCreateManagedVectorLayer.js   # 创建托管矢量图层
│   │           ├── useDeferredUserLayerApis.js      # 用户图层延迟 API
│   │           ├── useDrawMeasure.js                # 绘制测量交互
│   │           ├── useLayerContextMenuActions.js    # 图层右键菜单动作
│   │           ├── useLayerControlHandlers.js       # 图层控制处理
│   │           ├── useLayerMetadataNormalization.js # 图层元数据标准化
│   │           ├── useManagedFeatureHighlight.js    # 要素高亮
│   │           ├── useManagedFeatureOperations.js   # 要素操作（新增/删除/编辑）
│   │           ├── useManagedFeatureSerialization.js # 要素序列化
│   │           ├── useManagedLayerStyle.js          # 图层样式管理
│   │           ├── useMapEventHandlers.js           # 地图事件处理
│   │           ├── useMapSearchAndCoordinateInput.js # 地图搜索与坐标输入
│   │           ├── useMapUIEventHandlers.js         # UI 事件处理
│   │           ├── useRightDragZoom.js             # 右键拖拽缩放
│   │           ├── useRouteRendering.js             # 路线渲染
│   │           ├── useRouteStepInteraction.js       # 路线节点交互
│   │           ├── useRouteStepStyles.js            # 路线步骤样式
│   │           ├── useStartupTaskScheduler.js       # 启动任务调度
│   │           └── useUserLayerApiFacade.js         # 用户图层 API 门面
│   │
│   ├── constants/                      # 常量与配置
│   │   ├── index.js                    # 常量统一导出（barrel 入口）
│   │   ├── goldenSoupQuotes.js         # 心灵鸡汤语录常量
│   │   ├── mapStyles.js                # 地图样式常量与工厂
│   │   ├── NON_STANDARD_XYZ_ADAPTER_EXAMPLES.ts    # 非标准 XYZ 瓦片配置示例
│   │   ├── useBasemapManager.ts        # XYZ 瓦片源配置管理
│   │   └── useStyleEditor.js           # 图层样式编辑模板配置
│   │
│   ├── stores/                         # ⭐ Pinia 状态仓库
│   │   ├── index.ts                    # Store 统一导出入口
│   │   ├── useAppStore.ts              # 应用级状态：Loading 状态管理、15s 超时保护、GIS 初始化锁
│   │   ├── useAttrStore.ts             # 属性表状态：extent、要素展示上下文
│   │   ├── useLayerStore.ts            # 🔹 图层状态：layerTree 构建、展开状态、parentId 驱动的层次结构、操作行为
│   │   └── useWeatherStore.ts          # 天气状态：当前 adcode、来源、地图联动
│   │
│   ├── router/                         # Vue Router 路由
│   │   ├── index.js                    # 路由表、鉴权守卫、Loading Relay + 路径比较守卫 + GIS 初始化锁
│   │   └── lazyHomeViewLoader.js       # HomeView 二段式懒加载入口（隔离 GIS 依赖）
│   │
│   ├── views/                          # 页面级组件
│   │   ├── HomeView.vue                # 主页面布局、事件中枢、地图加载态收口 + GIS 初始化锁标记
│   │   └── RegisterView.vue            # 登录/注册页面
│   │
│   ├── utils/                          # ⭐ 工具函数层（领域化分层）
│   │   ├── index.js                    # utils 总入口（re-export 所有域）
│   │   ├── loading.js                  # 全局 Loading 工具函数（showLoading / hideLoading）
│   │   ├── echarts/                    # ECharts 运行时最小注册模块
│   │   │   ├── cesiumFxRuntime.js      # Cesium FX 图表运行时按需注册
│   │   │   └── weatherRuntime.js       # 天气图表运行时按需注册
│   │   ├── geo/                        # 坐标、投影、几何工具域
│   │   │   └── index.js                # 坐标/投影相关统一导出
│   │   ├── io/                         # 文件 I/O、解析、解压域
│   │   │   └── index.js                # 解析/解压相关统一导出
│   │   ├── biz/                        # 业务规则域
│   │   │   └── index.js                # 业务规则统一导出（坐标格式、p 参数、标注校验）
│   │   │
│   │   ├── gis/                        # GIS 底层实现（坐标系、数据解析、压缩）
│   │   │   ├── batchProcessor.js       # 批处理逻辑
│   │   │   ├── crs-engine.ts           # 坐标参考系引擎（投影、WKT 处理）
│   │   │   ├── crsAware.js             # CRS 识别与检测
│   │   │   ├── dataDispatcher.js       # 数据分发器
│   │   │   ├── deferredGisAssets.js    # GIS 重资产预热编排（OL + GeoTIFF）
│   │   │   ├── deferredGisWarmupLauncher.js # 预热触发器（登录页定时后调用）
│   │   │   ├── decompressFile.js       # 文件解压
│   │   │   ├── decompressor.ts         # 递归解压引擎（ZIP/KMZ 嵌套处理）
│   │   │   ├── loadJsZip.ts            # jszip 加载与初始化
│   │   │   ├── mapRuntimeDeps.js       # OpenLayers 运行时依赖延迟模块
│   │   │   └── parsers/                # 数据格式解析器
│   │   │       ├── amapAoiParser.js    # 高德 AOI JSON 解析
│   │   │       ├── kmlParser.ts        # KML/KMZ 解析
│   │   │       ├── shpParser.ts        # SHP（含 sidecar 文件）解析
│   │   │       └── tifLoader.ts        # GeoTIFF（单/多波段）加载
│   │   │
│   │   ├── coordTransform.js           # 历史坐标转换实现（由 geo 域暴露）
│   │   ├── crsUtils.js                 # 历史 CRS 工具（由 geo 域暴露）
│   │   ├── coordinateFormatter.js      # 历史坐标格式化（由 biz 域暴露）
│   │   ├── coordinateInputHandler.js   # 历史坐标输入处理（由 biz 域暴露）
│   │   ├── urlCrypto.js                # 历史 URL 加密（由 biz 域暴露）
│   │   ├── labelValidator.ts           # 历史标注校验（由 biz 域暴露）
│   │   ├── amapRectangle.js            # 高德矩形范围工具
│   │   ├── layerExportService.js       # 图层导出服务（GeoJSON/CSV/TXT/KML）
│   │   ├── drawTransitRoute.ts         # 公交路线绘制
│   │   ├── driveXmlParser.ts           # 驾车路线 XML 解析
│   │   ├── transitRouteBuilder.js      # 路线构建器
│   │   ├── userLocationContext.js      # 用户定位上下文管理
│   │   ├── userPositionCache.js        # 用户位置缓存
│   │   └── loadTiandituSdk.js          # 天地图 SDK 加载
│   │
│   └── assets/                         # 静态资源（图片、字体等）
│
├── docs/                               # 文档目录
│   ├── BOUNDARY_INDEX.md               # 目录边界索引（由 docs:index 自动生成）
│   └── TOC_MAINTENANCE_GUIDE.md        # TOC 架构维护指南（风险、优化、升级路线）
│
├── scripts/                            # 构建脚本
│   └── generate-boundary-index.mjs     # 文档索引自动化生成脚本
│
└── dist/                               # 构建产物目录（生成目标）
    └── assets/                         # 打包后的 JS/CSS 资源
```

## 模块化架构（Great Decoupling）

`MapContainer.vue` 采用“最小外壳”模式，主职责仅保留：

1. 地图初始化与 OpenLayers 生命周期管理。
2. 全局状态编排（底图状态、图层实例、绘图/路线等核心流程）。
3. 与子组件的事件桥接（Props 下发，Emits 回传）。

### map 功能库拆分（feature-per-library）

1. 地图交互与底图稳定性逻辑统一迁移到 `src/composables/map/features/`。
2. 每个功能单独一个库文件，避免在 `MapContainer.vue` 继续堆积实现细节。
3. 跨层引用优先走目录边界入口（`stores/`、`constants/`、`map/features/` 的 barrel），减少散点依赖。
4. 新增 map 功能时，要求新增独立 feature 文件并同步更新目录文档。

### 文档索引自动化

1. 执行 `npm run docs:index` 自动生成 `docs/BOUNDARY_INDEX.md`。
2. 索引覆盖 `src/stores`、`src/constants`、`src/composables/map/features` 三个边界目录。
3. 目录重构或新增边界文件后，提交前建议重新生成一次索引。

### mapInstance 通信技术摘要

1. `MapContainer.vue` 创建唯一 `mapInstance`（`shallowRef`）并向子组件下发。
2. `LayerControlPanel.vue` 通过 `mapInstance` 读取当前视图范围，拼装 `mapBound`，内部直连天地图/高德/Nominatim 搜索 API。
3. `MapEasterEgg.vue` 通过 `mapInstance` 订阅 `pointermove`，执行区域命中与像素定位，并通过 `Teleport` 渲染全屏 Lightbox。
4. `MapControlsBar.vue` 聚焦坐标输入/复制与 Home 交互，仅通过事件指令父组件执行地图动作。
5. 数据流统一为：父组件持有地图写能力，子组件负责业务输入与 UI 反馈，避免“状态散落 + 地图实例多点写入”。

### GISDataInlet 数据流（容器层-解析层-坐标层-调度层）

1. `src/utils/gis/decompressor.ts`：递归扫描文件、文件夹、ZIP/KMZ，自动展开“压缩包套压缩包”并拉平资源。
2. `src/utils/gis/parsers/*.ts`：按格式解析数据（KML/SHP/TIFF），其中 SHP 采用同名 sidecar 聚合（`.shp/.dbf/.shx/.prj/.cpg`）并支持回退解析（dbf/shx 异常时保留几何导入）。
3. `src/utils/gis/crs-engine.ts`：对每个识别数据集执行 CRS 识别与投影策略决策，支持 WKT 注册与 `proj4` 重投影。
4. `src/composables/useGisLoader.ts`：统一调度入口，处理多格式识别、SHP sidecar 组装、批处理解析，并聚合 `packets + warnings + errors + summary`。
5. `src/composables/useLayerDataImport.js`：消费 packet，创建图层并接入样式、标注与交互。
6. `src/stores/useLayerStore.ts`：维护图层 UI 状态与操作行为（显隐、缩放、移除、排序）。

批处理反馈示例：`已识别到 n 个数据集，正在同步导入...`。当某一数据集损坏时，系统会记录错误并继续导入剩余数据，最后统一汇总提示。

## 本次变更特点（V2.8.9 ParentId 驱动的上传层次结构 + TOC 协议层中心化）

1. **TOC 协议层中心化**：新增 `src/composables/map/toc/protocol.js` 作为 TOC 领域的协议枢纽，统一定义 `TOC_MENU_COMMANDS`（菜单命令常量 30+ 条）、导出格式标准化、图层 ID 解析、能力位定义等，使菜单、命令分发、动作执行三层完全解耦且易于维护。

2. **ParentId 驱动的上传层次构建**：在 `useLayerStore.ts` 中实现完整的层次结构生成引擎，核心函数包括：
   - `buildUploadLayerChildren()` - 从 parentId 路径链递归构建文件夹树与层级关系
   - `normalizeUploadFolderPath()` - 支持多种分隔符（`/`、`\`、`>`）的路径规范化
   - `buildUploadFolderPathChain()` - 递归生成完整的祖先路径链（用于展开状态初始化）
   - `toUploadFolderNodeId()` - 动态文件夹 ID 生成（前缀 `folder-upload-dyn:` 避免冲突）
   - `UploadFolderEntry` 类型定义 - 提供类型安全的层级树节点结构

3. **展开状态智能初始化**：上传图层树的所有祖先文件夹在 `syncLayers()` 时自动标记为展开，用户无需手动展开深层文件夹即可直观查看数据组织，大幅提升用户体验。

4. **兼容性与容错策略**：
   - 保留对遗留 parentId 格式的降级支持
   - 路径规范化支持多种输入格式自动识别
   - 动态文件夹 ID 使用特定前缀确保与层 ID 无冲突

5. **构建验证与性能**：
   - `npm run build` 成功（1266 modules transformed）
   - SidePanel bundle 体积：109.48 kB / 36.81 kB (gzipped)
   - 无编译错误和性能下降

## 后续使用方式（推荐）

### 🔧 TOC 协议层详解（protocol.js）

`src/composables/map/toc/protocol.js` 是 TOC 领域的协议枢纽，集中定义了三大类协议：

#### 1) 菜单命令常量 `TOC_MENU_COMMANDS`（30+ 条）
```js
import { TOC_MENU_COMMANDS } from '@/composables/map/toc';

// 示例：显隐、导出、样式、删除等操作键
const command = TOC_MENU_COMMANDS.TOGGLE_VISIBILITY; // 'toc-menu-toggle-visibility'
```
所有右键菜单项都使用这些常量作为唯一标识，避免字符串散落在各模块。

#### 2) 导出格式标准化 `normalizeTocExportFormat(command)`
```js
import { normalizeTocExportFormat } from '@/composables/map/toc';

const format = normalizeTocExportFormat(TOC_MENU_COMMANDS.EXPORT_AS_GEOJSON);
// 返回值：{ format: 'GeoJSON', mimeType: 'application/geo+json', ext: '.geojson' }
```
将菜单命令映射到标准化的导出格式对象，支持 GeoJSON/CSV/TXT/KML 四种格式。

#### 3) 图层 ID 规范化 `normalizeTocLayerId(nodeId, sourceType)`
```js
import { normalizeTocLayerId } from '@/composables/map/toc';

// 解析上传层 ID：识别动态文件夹 vs 实际图层
const isFolder = normalizeTocLayerId('folder-upload-dyn:path/to/folder', 'upload');
```

#### 4) 能力位定义与解析
```js
// 导出格式支持能力位
const canExportGeoJSON = capabilities.canExportGeoJSON;
const canExportKML = capabilities.canExportKML;
```

### 后续使用方式（推荐）

### 1) 统一从边界入口导入

```js
import { apiReverseGeocodeWithFallback } from '@/api';
import { usePositionCodeTool, createMapEventHandlers } from '@/composables/map';
import { bizUtils, geoUtils } from '@/utils';
import { useLayerStore } from '@/stores';
import { createMapStylesObject } from '@/constants';
```

说明：除同目录内部实现外，避免跨层深链导入（例如直接跨层引用 `features/useXxx.js` 或 `utils` 内部历史文件）。

### 2) 新增 map 功能的标准流程

1. 在 `src/composables/map/features/` 新增 `useXxx.js`（单一职责）。
2. 在对应领域入口（`basemapSystem.js` / `layerManager.js` / `interactionHandlers.js` / `routeService.js`）导出新能力。
3. 如需跨域复用，再在 `src/composables/map/index.js` 汇总导出。
4. 由 `MapContainer.vue` 进行注入与编排，不在子组件里分散地图写操作。

### 2.2) 上传层次结构使用指南（parentId 驱动）

当上传 ZIP/KMZ 等容器文件或多层文件夹结构时，系统自动根据 `parentId` 路径链生成层级树：

```js
// 上传文件夹结构示例：
// ShareData/
//   ├── 2024年数据/
//   │   ├── 北京.geojson          // parentId: "北京"
//   │   └── 上海.geojson          // parentId: "上海"
//   └── 2023年数据/
//       └── 广州.geojson          // parentId: "广州"

// 生成的图层树（TOC 中展示）：
// 📂 2024年数据
//   ├─ 北京.geojson
//   └─ 上海.geojson
// 📂 2023年数据
//   └─ 广州.geojson

// 关键实现函数：
import { buildUploadLayerChildren, normalizeUploadFolderPath } from '@/stores/useLayerStore';

// 1) 规范化路径（支持 `/`、`\`、`>` 等多种分隔符）
const normalizedPath = normalizeUploadFolderPath('path/to/subfolder'); // -> ['path', 'to', 'subfolder']

// 2) 从 parentId 路径链构建完整的文件夹树
const uploadChildren = buildUploadLayerChildren(uploadLayers);

// 3) 所有祖先文件夹自动标记为展开状态（syncLayers() 内自动处理）
// 用户打开 TOC 时会看到完整的层级结构，无需手动展开
```

#### 支持的路径格式
- Unix 风格：`"2024/北京/数据"`
- Windows 风格：`"2024\\北京\\数据"`
- 自定义分隔符：`"2024>北京>数据"`
- 混合分隔符（自动规范化）：`"2024/北京\\数据"`

#### 动态文件夹 ID 生成规则
```js
// 动态文件夹使用特殊前缀避免与图层 ID 冲突
const folderId = 'folder-upload-dyn:2024/北京'; // 前缀 + 规范化路径
```

### 2.1) 新增 TOC 右键菜单能力的标准流程

1. **协议层先行**：在 `src/composables/map/toc/protocol.js` 中声明新的菜单命令常量（如 `TOC_MENU_COMMANDS.MY_ACTION = 'toc-menu-myaction'`）与导出格式（如 `TOC_EXPORT_FORMATS.MY_FORMAT`）。
2. **菜单项声明**：在 `src/composables/map/toc/menu/contextMenu.js` 增加菜单项声明（只做显示策略，不写业务副作用），使用 protocol 中定义的常量作为菜单 key。
3. **命令分发**：在 `src/composables/map/toc/menu/commandDispatcher.js` 增加命令分发规则（`key -> 标准化事件协议`），使用 protocol 的 `TOC_MENU_COMMANDS` 常量。
4. **事件落地**：在 `src/composables/map/toc/actions/contextActionManager.js` 增加事件处理逻辑（批量操作、导出、动作转发），通过 `normalizeTocExportFormat()` 等 protocol 辅助函数简化实现。
5. **选择逻辑**（如涉及树选择）：统一在 `src/composables/map/toc/actions/selectionManager.js` 维护，避免组件内出现递归遍历。

### 3) 新增 utils 能力的标准流程

1. 底层算法/解析优先放入对应领域实现（如 `utils/gis` 或已有工具文件）。
2. 在 `src/utils/geo/index.js`、`src/utils/io/index.js`、`src/utils/biz/index.js` 中按领域导出。
3. 最后经 `src/utils/index.js` 暴露给上层，保持导入路径稳定。

### 4) 全局 Loading 遮罩调用方式

```js
import { showLoading, hideLoading } from '@/utils';

async function runTask() {
    showLoading('正在加载地图资源...');
    try {
        await doSomethingAsync();
    } finally {
        hideLoading();
    }
}
```

说明：`GlobalLoading.vue` 已在 `App.vue` 全局挂载，业务组件仅需调用 `showLoading(text)` 与 `hideLoading()` 即可。

## 后续变更程序准则（贡献者约定）

1. **边界优先**：新增能力先确定归属目录，再决定导出入口；禁止为“快速可用”绕过边界。
2. **职责单一**：
    - 组件层（`components/`）：只处理 UI 与事件。
    - 编排层（`composables/map`）：组织流程与地图动作。
    - 状态层（`stores/`）：维护业务状态与派生树。
    - 工具层（`utils/`）：纯函数与解析逻辑。
    - 服务层（`api/`）：外部服务调用与结果标准化。
3. **新增文件必须补齐出口**：新增 `api`/`store`/`constant`/`map feature`/`utils` 文件后，同步更新对应 `index` barrel。
4. **文档同步更新**：目录变化、职责迁移、公共入口变更必须同步更新 README 的目录结构与本章节。
5. **提交前最小验收**：
    - 运行 `npm run docs:index`（边界索引同步）。
    - 运行 `npm run build`（构建校验通过）。
    - 检查是否出现跨层深链导入与重复实现。

## 版本记录

### V2.8.8 (2026-04-17)
#### 🌲 ParentId 驱动的上传层次结构实现 + TOC 协议层中心化
* **协议层中心化**：新增 `src/composables/map/toc/protocol.js`，集中管理 TOC_MENU_COMMANDS、导出格式标准化（normalizeTocExportFormat）、图层 ID 解析（normalizeTocLayerId）、能力解析等协议定义。
* **上传层次化构建**：在 `useLayerStore.ts` 中新增上传层次结构相关函数：
  * `buildUploadLayerChildren()` - 从 parentId 路径链构建文件夹 + 层级关系
  * `normalizeUploadFolderPath()` - 支持多种分隔符（`/`、`\`、`>`）的路径规范化
  * `buildUploadFolderPathChain()` - 递归生成完整的祖先路径链（用于展开状态初始化）
  * `toUploadFolderNodeId()` - 动态文件夹 ID 生成（前缀 `folder-upload-dyn:`）
  * `deriveUploadFolderDisplayName()` - 文件夹显示名称推导
  * `UploadFolderEntry` 类型定义 - 层级树节点结构
* **展开状态智能初始化**：上传图层树的所有祖先文件夹在 `syncLayers()` 时自动标记为展开，提供直观的默认 UX
* **兼容性保证**：保留对遗留 parentId 格式的降级支持，不破坏现有上传流程
* **构建验证**：`npm run build` 成功（1266 modules transformed，SidePanel 109.48 kB / 36.81 kB gzipped）

#### 🌳 TOC 右键菜单架构收敛 + KML 增强
* **右键命令迁移完成**：将 TOC 右键命令解析从组件中迁移到 `src/composables/map/toc/menu/commandDispatcher.js`，组件仅负责渲染与事件透传。
* **右键动作集中管理**：新增 `src/composables/map/toc/actions/contextActionManager.js`，统一处理多选、批量显示/隐藏、批量导出、批量移除及图层动作转发。
* **KML 导出服务独立**：新增 `src/composables/map/toc/actions/exportService.js`，通过 OpenLayers `KML` format 直接写出，`layerExportService.js` 改为调用该服务。
* **大树多选性能优化**：`selectionManager.js` 增加 `applyRecursiveSelectionChunked`，对上百要素 KML 文件夹执行分帧递归勾选，减少主线程阻塞。
* **TOC 领域边界成型**：新增 `src/composables/map/toc/index.js`，并由 `src/composables/map/index.js` 汇总导出，便于后续统一维护。
* **构建验证通过**：`npm run build` 成功（1265 modules transformed）。

### V2.8.7 (2026-04-16)
#### 🌿 全局 Loading 遮罩 + 高耗时流程统一反馈
* **新增全局遮罩组件**：`src/components/GlobalLoading.vue`，采用绿色主题、毛玻璃背景（`backdrop-filter: blur(4px)`）、CSS3 环形动画与动态提示语。
* **新增应用级状态仓库**：`src/stores/useAppStore.ts`，统一管理 `loading` 与 `loadingText` 状态。
* **新增全局工具接口**：`src/utils/loading.js` 暴露 `showLoading(text)` / `hideLoading()`，并通过 `src/utils/index.js` 统一导出。
* **关键流程完成接入**：`src/views/HomeView.vue` 接入 3D 模块懒加载和 GIS 数据导入；`src/components/CesiumContainer.vue` 接入 3D 运行时初始化阶段。
* **部署体验优化**：遮罩组件在根组件同步挂载，兼容 GitHub Pages，避免异步加载造成的首帧闪烁。

### V2.8.6 (2026-04-15)
#### 🧭 基于用户协助的高德 AOI 提取（半自动）
* **POI 点击直达注入流程**：用户点击高德搜索结果 POI 条目后，自动弹出 AOI 注入窗口，不再依赖 TOC 右键操作。
* **AOI 数据注入弹窗组件**：新增 `src/components/AmapAoiInjectDialog.vue`，提供 POI ID 输入、详情跳转、JSON 粘贴与解析绘制按钮，交互从“POI 点击”闭环完成。
* **解析逻辑解耦**：新增 `src/utils/gis/parsers/amapAoiParser.js`，统一封装 JSON 校验、`data.spec.mining_shape.shape` 提取、边界拆解与 `gcj02ToWgs84` 纠偏，组件层仅负责交互。
* **落图与 TOC 联动**：解析后自动创建独立 AOI 图层，命名格式为 `POI名称 - AOI范围`，并通过托管图层机制自动入 TOC 可管理。
* **样式与定位**：AOI 默认样式为半透明蓝填充（`rgba(0,153,255,0.2)`）+ 深蓝描边；绘制完成后自动 `fit` 到 AOI 范围。
* **属性同步与反馈**：完整写入高德 `base` 节点属性到要素属性表；成功后统一提示 `AOI 提取成功，属性已同步至属性表`。
* **鲁棒性增强**：对无效 JSON、缺失 shape、异常结构等场景进行友好提示（如 `未发现边界数据`），避免流程中断。
#### 🧩 POI-AOI 手动导入体验增强 + 搜索链路收敛
* **搜索结果新增「复制ID」按钮**：`LocationSearch.vue` 在每条结果中新增一键复制 POI ID，支持剪贴板 API 与降级复制方案，方便快速粘贴到 AOI 手动导入流程。
* **POI ID 自动回填 TOC**：地图搜索结果落图后，自动将当前 POI ID 同步到 TOC 的「高德 AOI 手动导入」输入框，详情链接实时联动更新，无需二次手动填写。
* **手动 AOI 命名统一**：手动粘贴高德详情 JSON 绘制 AOI 时，图层命名统一为 `POI名称_AOI`（若可解析到名称）。
* **事件链路增强**：新增 `search-poi-selected` 事件由 `MapContainer -> HomeView -> SidePanel -> TOCPanel` 透传，实现搜索与工具箱状态同步。
* **冗余代码清理**：
    * `LocationSearch.vue`：清理重复样式定义，修复未注入 `message` 的异常分支。
    * `TOCPanel.vue`：合并 POI ID 解析逻辑，移除重复提取函数。
    * `useMapSearchAndCoordinateInput.js`：简化单任务 `Promise.allSettled` 为直接异步捕获，减少无效层级。
    * `SidePanel.vue`：移除未使用的组件导入，降低噪声。
#### 🌦️ 天气看板图表优化 + 多设备适配
* **ECharts 配置升级**：气温图增强 tooltip、动态温度范围、最高/最低点标识、移动端图例与坐标标签自适应。
* **风力图可读性提升**：由“仪表 + 气泡”优化为“实况仪表 + 白天/夜间分组柱 + 平均风力线”，同时保留风向信息提示。
* **性能优化**：窗口尺寸变化加入防抖，避免连续 resize 导致图表频繁重绘。
* **响应式完善**：天气看板在桌面/平板/移动端分别优化卡片栅格、图表高度、按钮与输入布局；移动端进入天气模式时主内容区高度分配更合理。
* **文档同步**：README 增加天气 API、天气组件与天气 store 的目录说明，并更新高德 Key 用途。

### V2.8.5 (2026-04-15)
#### 🌐 多源地理服务 API 深度集成
* **统一 API 封装库**：新增 `src/api/geocoding.js` 与 `src/api/ipLocation.js`，深度集成 **高德 (AMap)** 与 **天地图 (Tianditu)** 双引擎。
    * **地理/逆地理编码**：支持结构化地址与经纬度双向转换，内置 WGS-84 (天地图) 与 GCJ-02 (高德) 坐标纠偏逻辑。
    * **IP 定位服务**：实现基于 IPv4 的城市级定位，支持获取行政区划编码（adcode）及城市矩形外包框（Rectangle）。

#### 🔐 URL 参数体系架构升级
* **新增三位一体参数协议**：
    * **`s` (Share ID)**：链接共享标识符，用于追踪分享来源与特定的业务会话上下文。
    * **`loc` (Location Status)**：用户实时定位标识，记录用户当前的定位授权状态。
    * **`p` (Private Encoded Data)**：加密地理位置参数。默认值为 `0`，用于存放基于 Base62 算法加密的短码信息。

#### 🧪 坐标加解密与隐私安全
* **可逆混淆算法**：于 `src/utils/urlCrypto.js` 中实现基于位封包（Bit-packing）与自定义 Base62 字符集的加解密逻辑。
* **信息保护**：将敏感的高精度信息浮点数转换为 8-10 位的混淆短串，非对称逻辑确保分享链接中的地理隐私安全。
* **参数绘制增强**：在坐标绘制面板新增 `p` 参数解析接口，实现“短码输入 -> 解码落图 -> 自动逆编码 -> 属性归档”的一键化链路。

#### 🛠️ 交互逻辑与绘图引擎优化
* **地理编码交互工具栏**：在绘制 Tab 中新增专属功能面板：
    * **地理编码（地址落图）**：支持模糊地址检索，自动解析坐标并加入 TOC 图层管理，原始地址自动同步为点位标注。
    * **逆地理编码（拾点识地）**：激活拾点模式后，

### V2.8.4 (2026-04-11)
#### 🧩 结构优化复盘 + MapContainer 解耦（Phase 18-25）
* **MapContainer 持续瘦身**：
    * 新增 `useLayerControlHandlers.js`，提取图层面板相关逻辑：`handleLayerChange`、`handleLayerOrderUpdate`、`loadCustomMap`。
    * 将地图交互样式切换到 `src/constants/mapStyles.js` 的 `createMapStylesObject()` 工厂统一生成。
    * 新增 `useDeferredUserLayerApis.js`，抽离用户图层延迟 API 门面（动态导入 + 动作代理）。
    * 新增 `useBasemapSelectionWatcher.js`，抽离底图切换监听与自动兜底逻辑。
    * 新增 `useBasemapLayerBootstrap.js`，抽离底图层初始化与首屏监控挂载。
    * 修复多处 setup 初始化顺序导致的引用问题（桥接函数 + 依赖顺序整理）。
    * 本轮持续重构后 MapContainer 行数约 `1263 -> 1042`（减少 221 行）。
* **feature 库补全**：
    * 新增并接入 `useMapUIEventHandlers.js`（Phase 18）。
    * 新增并接入 `useCreateManagedVectorLayer.js`（Phase 19）。
    * 新增并接入 `useLayerControlHandlers.js`（Phase 21）。
    * 新增并接入 `useDeferredUserLayerApis.js`（Phase 22）。
    * 新增并接入 `useBasemapSelectionWatcher.js`（Phase 23）。
    * 新增并接入 `useBasemapLayerBootstrap.js`（Phase 24）。
* **项目结构现代化整理（Phase 25）**：
    * 新增 `src/composables/map/features/index.js`，MapContainer 改为统一 barrel 导入，降低 import 分散度。
    * `useLayerStore` 主实现迁移至 `src/stores/useLayerStore.ts`。
    * 删除冗余旧入口：`src/composables/useAreaImageOverlay.js`、`src/composables/useGisLoader.js`。
* **目录边界收口（Phase 26）**：
    * 新增 `src/stores/index.ts` 与 `src/constants/index.js`，统一跨层导入到目录边界。
    * 规范化本地导入，移除 `./xxx.ts` 显式后缀写法。
    * 清退空壳兼容层 `src/composables/useLayerStore.ts`。
    * 新增 `scripts/generate-boundary-index.mjs` 与 `npm run docs:index`，自动维护 `docs/BOUNDARY_INDEX.md`。
* **构建验证**：
    * `npm run build` 持续通过，1229-1233 模块范围内稳定构建，无编译错误。

#### 🎯 移动端优化 + 地图事件处理提取 + MapContainer 重构
* **移动端交互升级**：
  * 替换双击为长按（500ms）打开上下文菜单，提升移动端体验。
  * 禁用移动端拖拽排序（Drag-Drop），保留 checkbox 显隐控制。
  * 添加触摸防漂移检测，移动超过 10px 自动取消长按。
  * Long-press 菜单支持完整操作（透明度、置顶/置底、URL 操作）。
* **地图事件处理提取（Phase 17）**：
  * 创建 `useMapEventHandlers.js`，统一处理所有地图事件（pointermove、singleclick、contextmenu、坐标更新等）。
  * 坐标同步逻辑从 3 处分散位置合并到单一 `updateCurrentCoordinate` 函数。
  * MapContainer 代码量减少 130+ 行（从 1420 → 1280 行）。
  * 构建验证：1226 modules，20.06s，✅ 无错误。
* **LayerControlPanel 增强**：
  * 新增 `clearLongPressTimer` 函数，支持触摸取消与自动清理。
  * CSS 增强：`-webkit-user-select: none` + `-webkit-touch-callout: none`，防止长按出现文本选择菜单。
  * 移动端显示绿色"⋯"图标代替"⋮⋮"，视觉清晰提示长按操作。

### V2.8.3 (2026-04-08)
#### 🐛 标注菜单修复 + 文件结构优化 + 共享资源递归扫描
* **标注菜单 Bug 修复**：修正 TOCTreeItem.vue 中标注菜单判断逻辑，使用正确的属性 `props.node?.raw?.name` 替代不存在的 `labelFieldValue`，解决标注开启/关闭菜单无法显示的问题。
* **文件结构重构**：
  * 将非标准切片适配器等常量迁移至 `src/constants/` 目录，使 `composables` 职责聚焦于业务逻辑。
  * 新增 `src/views/` 目录，集中管理页面级组件（HomeView、RegisterView）。
  * `src/router/` 独立路由配置，支持未来的页面路由拓展。
  * `src/stores/` 集中 Pinia 状态管理（useLayerStore.ts）。
* **共享资源支持递归子文件夹**：
  * `useSharedResourceLoader` 中 glob pattern 从 `/public/ShareDate/*` 升级为 `/public/ShareDate/**/*`，支持无限深度嵌套文件夹。
  * TOCPanel 显示效果同步，多级目录以"📂 文件夹名"标题分组展示。
  * 优化文件夹排序策略，"根目录"始终排前，其余按字母顺序排列。
* **项目文档同步**：更新 README 目录树结构部分，新增 `constants/`、`views/`、`stores/` 目录说明与文件清单。

#### 📦 共享资源快速加载 + 样式优化
* **共享资源加载器**：新增 `useSharedResourceLoader` composable，自动扫描 `public/ShareDate` 目录中的 KML/KMZ/GeoJSON/JSON/SHP/TIF/TIFF 文件。
* **TOCPanel 集成共享资源**：在"图层"标签页下方添加"共享资源"菜单，用户点击"加载资源"按钮自动扫描，扫描结果以子菜单形式展示。
* **复用上传逻辑**：每个共享资源将被转换为 File 对象，通过现有的导入流程处理，保证与手动上传完全一致的行为和错误处理。
* **零代码维护**：不需要修改代码，只需将 KML/SHP 等文件放入 `public/ShareDate` 文件夹即可自动发现和二次利用。
* **样式适配绿色主题**：共享资源菜单、按钮和资源项采用项目绿色主题（#2f9a57 等），与整体 UI 风格一致。
* **可扩展架构**：支持两种扫描实现方式（import.meta.glob 编译时 + 动态 API 降级），便于后续集成真实后端服务或 CDN manifest 文件。
* **生产最适方案**：优先使用 import.meta.glob（可靠稳定），无法使用时自动降级，确保开发和生产环境的一致性。

### V2.8.2 (2026-04-06)
#### 🔁 矢量图层坐标切换（GCJ-02 <=> WGS-84） + 数据轻量导出 + 坐标显示格式优化
* **坐标切换范围扩展**：凡纳入 TOC 的矢量点/线/面图层均可右键切换 `WGS-84/GCJ-02` 并重绘。
* **几何级遍历转换**：对矢量几何执行统一转换流程，覆盖 Point/LineString/Polygon 及其多部件形式，自动同步图层元数据与 TOC 展示坐标。
* **性能约束保持**：未引入新的重型依赖，导出与转换均使用浏览器原生能力与现有 OpenLayers/工具函数实现，维持首屏加载策略不变。
* **导出 ID 重排策略**：导出时对要素重新顺序编号 `1..n`，同一要素的所有折点共享同一 ID（便于回溯源要素）。
* **点线面统一折点导出**：Point/LineString/Polygon 及多部件几何统一展开为十进制经纬度折点记录，GeoJSON保留点线面格式，默认四列（ID、经度、纬度、名称），并追加几何类型/部件/环/点序号辅助列。
* **CSV 防乱码**：`CSV` 导出内容默认写入 UTF-8 BOM 头，减少 Excel 打开中文乱码问题。
* **大文件提示**：导出后显示文件体积，超大体积给出卡顿风险提示，便于用户先筛选图层再导出。
* **坐标显示优化**：地图右下坐标显示支持经纬度格式切换（十进制/度分秒），用户可自定义坐标显示格式，并在输入框中智能识别用户输入格式进行解析。

### V2.8.1 (2026-04-04)
#### 🧭 SHP 导入链路强化（参考 mapshaper 设计思路）
* **同名 sidecar 组装修复**：修复多文件导入时 `.dbf/.shx/.prj/.cpg` 被误过滤的问题，统一按 stem 分组后再进入解析流程。
* **解析容错增强**：`shpParser.ts` 新增 SHP 头部校验与分级回退策略（`shp+dbf+shx -> shp+dbf -> shp+shx -> shp-only`），降低异常数据导致的全量失败概率。
* **属性编码兼容提示**：接入 `.cpg` 与 DBF `LDID` 编码提示逻辑，在属性解析失败时给出可理解告警并保留几何导入。
* **导入路径统一**：移除导入层的直连 `shpjs` 分支，统一走 `dataDispatcher + shpParser`，避免 ZIP/文件夹/单文件行为不一致。
* **文档同步**：更新 README 文件树与 GISDataInlet 说明，补充 `Magic/*` 子模块与最新导入策略说明。

### V2.8.0 (2026-04-03)
#### 🌳 图层 TOC 升级为递归树结构 + ArcGIS 风格上下文菜单
* **递归树组件**：
    * 新增 **TOCTreeItem.vue** 递归树节点组件（294 行），支持无限深度嵌套、文件夹展开/折叠。
    * 文件夹复选框支持三态（全选/部分选/未选），点击自动级联控制所有子层级可见性。
    * 完整的生命周期管理（onMounted/onBeforeUnmount）负责全局指针、滚动事件监听与菜单关闭。
* **树构建容器**：
    * 新增 **LayerPanel.vue** 树转换逻辑（280 行），自动将扁平的四层图层组（绘制/上传/搜索/未命名）转换为层级结构。
    * 在线文件夹自动应用特殊标记（如 `[draw_virtual]` 当数据存在但列表为空时自动占位）。
    * 拖拽排序、标注可见性、图层删除等操作优化为树节点事件驱动模式。
* **ArcGIS 风格上下文菜单**：
    * 右键单击或悬停"•••"按钮弹出固定位置菜单，包含 8 项操作（查看/仅显示/属性/样式/标注/复制/缩放/删除）。
    * 菜单自动贴边（normalizeMenuPosition），点击外部、滚动、窗口 resize 时自动关闭。
    * 使用 Teleport 避免层叠上下文干扰，完整键盘与鼠标事件处理。
* **事件契约保持**：
    * 新增 **handleLayerTreeAction** 派发器（TOCPanel 43 行），将树内部事件（toggle-folder-visibility、zoom-layer 等）精确映射到原有 9 种 emit 类型。
    * 上传面板保持不变，确保下游组件（HomeView、MapContainer）无感知迁移。
* **性能优化**：
    * 移除 81 行冗余的扁平卡片模板，替换为 13 行树组件调用，代码减少 68 行。
    * 移除 4 个重复的格式化辅助函数（formatLayerDisplayName、formatFileSize 等），集中在 LayerPanel。
    * Pinia 图层状态、事件链路完整保持，无需调整下游存储或控制器。

### V2.7.2 (2026-04-01)
#### 🎬 Cesium 高级视觉组件化（按需加载）
* 新增 **CesiumAdvancedEffects.vue**：封装电影级高度雾（GLSL PostProcessStage）、HBAO 微阴影、低仰角移轴摄影（Tilt-Shift）、动态天空大气与 Bloom 增强。
* 新增 **ECharts 动态交互图表**：实时展示 3D 相机高度、俯仰角与帧率趋势，支持图例交互与响应式缩放。
* `CesiumContainer.vue` 保持最小改动：仅增加异步子组件挂载入口，原有飞行、地形、坐标与模型加载能力保持不变。
* 资源加载策略优化：在 `CesiumContainer` 未启用前，不请求高级特效与图表资源；仅当进入 3D 视角并完成 Viewer 初始化后才按需加载。

### V2.7.1 (2026-04-01)
#### 🧩 Great Decoupling（深度解耦）
* **MapContainer 最小化**：将图片彩蛋、搜索 API 集成、图层面板交互进一步外移，父组件回归“地图初始化 + 编排桥接”职责。
* **底图配置集中管理**：
    * 新增 **useBasemapManager.ts** 为底图管理单一源，集中 27 种在线底图配置、URL_LAYER_OPTIONS、BASEMAP_OPTIONS、Google 主机选择逻辑。
    * 消除 MapContainer 与 LayerControlPanel 间底图配置同步问题，简化新增底图的扩展流程（仅需在 useBasemapManager 中修改）。
    * MapContainer 导入 URL_LAYER_OPTIONS、createLayerConfigs 等方法而无需本地定义，减少代码 ~38 行。
    * LayerControlPanel 导入 BASEMAP_OPTIONS 而无需本地定义，减少代码 ~45 行，总计删除 ~83 行重复配置。
    * 新增 JSDoc 清晰标记扩展步骤：新增底图时需同步更新 BASEMAP_OPTIONS、URL_LAYER_OPTIONS、createLayerConfigs。
* **MapEasterEgg 升级为自驱组件**：
    * 内聚区域命中、像素定位、缩略图显示、Lightbox 大图预览。
    * 全屏遮罩层使用 `Teleport to="body"`，避免地图容器层叠上下文干扰。
* **LayerControlPanel 深迁移**：
    * 面板内部接管多服务地名搜索 API（天地图/高德/Nominatim）与 `mapBound` 拼装。
    * 搜索结果在面板内完成坐标解析后再向父组件发出标准化定位事件。
    * 图层管理面板改为 `Teleport to="body"`，并基于按钮锚点固定定位，提升复杂布局下的稳定性。
* **MapControlsBar 主题统一**：品牌绿主色统一为 `#309441`，并保持坐标编辑、复制、双击 Home 交互一致。
* **文档同步**：README 更新文件树注释与 `mapInstance` 组件通信说明，便于后续扩展和团队协作。

### V2.7.0 (2026-04-01)
#### 🎨 MapContainer 组件架构重构 (Component Decoupling)
* **顶部面板分离**：
    * 新增 **LayerControlPanel.vue** 独立组件，封装所有图层控制逻辑（底图切换、TOC 管理、拖拽排序、地名搜索）。
    * 支持 27 种预设底图供应商，覆盖本地瓦片、天地图、ESRI、OSM、高德等全球服务。
    * 自动代理 LocationSearch 搜索结果，通过 `search-jump` 事件回传至父组件。
    * 应用 Glassmorphism（磨砂玻璃）绿色主题（rgba(45,138,78,0.8)）。
* **底部控制条分离**：
    * 新增 **MapControlsBar.vue** 独立组件，替代老旧 MapControls.vue，专注于坐标/缩放/主页交互。
    * 实时显示鼠标坐标与地图缩放级别，支持坐标复制、编辑与跳转功能。
    * 主页按钮支持单击重置视图、双击快速定位用户（280ms 时间窗口）。
    * 包含完整生命周期管理（onUnmounted 清理所有计时器，避免内存泄漏）。
    * 应用绿色主题 Glassmorphism 样式。
* **状态管理升级**：
    * 增强 **useMapState.js** 为完整状态引擎，集成 URL 同步、图层切换、地形线渲染与视图动画。
    * **防抖 URL 同步**：pan/zoom 事件每 500ms 批处理一次，显著降低 hash 更新频率。
    * **统一图层切换 API**：`switchLayerById(layerId, config)` 集成标注逻辑（卫星图显示标注、矢量图隐藏）。
    * **地形线渲染引擎**：`setGraticuleActive()` 和 `toggleGraticule()` 统一管理经纬网生命周期。
    * **延迟图层初始化**：`refreshLayerInstances()` 仅在需要时创建 VectorSource，优化首屏加载。
* **事件驱动集成**：
    * MapContainer 新增适配器函数：`handleLayerChange()` 处理图层切换、`handleLayerOrderUpdate()` 处理顺序变化、`handleToggleGraticule()` 同步地形线状态。
    * 完全移除 MapContainer 中冗余的拖拽、可见性、格线渲染逻辑（减少 ~400 行代码）。
    * 所有子组件通过 emits 与父组件通信，保证数据流向清晰可控。
* **性能优化**：
    * 移除重复的 lng/lat 格式化函数与样式定义（集中在 useMapState 与对应组件）。
    * 图层源创建延迟至使用时，减少初始化内存占用。
    * Glassmorphism 样式集中管理，减少跨组件样式修改成本。

### V2.6.1 (2026-03-26)
#### 🔗 视角初始化优先级优化
* **URL 参数优先**：当 `lng`、`lat` 参数有效时，地图会优先使用 URL 指定的中心点和缩放级别初始化。
* **自动定位兜底**：只有在 URL 参数缺失或非法时，才会触发浏览器定位与自动缩放逻辑。
* **分享即恢复**：地图视角可通过查询参数直接复现，便于快速分享当前浏览位置。
* **历史记录更干净**：地图移动后的 URL 更新继续使用 `replace`，避免拖拽和缩放污染浏览器后退历史。
* **文件组织优化**：对项目文件结构进行优化，提升代码可维护性和开发效率。

### V2.6.0 (2026-03-25)
#### 🛠️ 交互与 UI 革命 (UX/UI Refactor)
* **非阻塞通知系统**：全面抛弃原生 `alert()`，上线自研 **Glassmorphism（磨砂玻璃）响应式 Message 系统**。支持消息队列，平滑处理批量导入时的多状态反馈。
* **侧边栏逻辑重构**：默认激活面板由“资讯”改为“工具箱（Toolbox）”，实现“开箱即用”的图层操作与数据管理体验。
* **卡片智能显示**：绘制、路线、搜索结果图层采用“数据驱动显示”策略（v-if 逻辑优化），无数据时不占位，确保界面视觉聚焦。
* **会话状态保活**：路径规划（公交/驾车）面板支持状态保持，关闭或切换后再次打开，历史规划结果与步骤依然留存。

#### 📦 核心引擎升级 (Data Engine)
* **万能容器层 (Data Inlet)**：
    * **深度解压**：基于 `JSZip` 实现 ZIP/KMZ 容器的递归扫描，支持多层级嵌套文件夹识别。
    * **自动化批处理**：突破单一文件限制，支持一次性识别并队列化导入包内所有的 `.shp`, `.kml`, `.tif`, `.json` 资源。
* **坐标系中心 (CRS Engine)**：
    * **空间感知**：自动解析 `.prj` 投影文件或 KML 内部元数据定义。
    * **动态重投影**：集成 `proj4` 算法，实现非标坐标系（如北京54/西安80/CGCS2000）向 `EPSG:4326/3857` 的自动转换。
* **内存优化管理**：建立 **Blob 资源生命周期管控机制**，自动执行 `revokeObjectURL`，完美适配 **1.4GB+** 级大规模空间数据导入场景。

### V2.5.2 (2026-03-22)
- **🧩 地图主文件可维护性整合（MapContainer）**：
    - 将公交/驾车的步骤交互核心抽为统一函数：步骤状态复位、步骤要素检索、步骤缩放、步骤预览。
    - 保持现有功能不变的前提下，减少重复逻辑，降低后续拆分风险。
    - 为关键交互函数补充功能注释，便于团队协作与后续重构。
- **🧭 公交+驾车步骤交互统一**：
    - 两类规划均支持步骤悬停预览高亮 + 点击定位缩放。
    - 驾车分段颜色区分与步骤列表颜色保持一致，提升步骤-线路映射可读性。
- **📘 结构文档更新**：
    - README 目录结构补充并细化到关键文件职责。
    - 新增路线解析与构建工具文件说明（transitRouteBuilder、driveXmlParser）。

### V2.5.1 (2026-03-22)
- **🚀 性能优化（首屏与交互）**：
    - 将 `shpjs`、`jszip`、`geotiff` 改为按需动态加载，仅在导入对应数据类型时下载与解析，显著减少首屏主包体积与解析开销。
    - 地图初始化改为优先渲染地图，再异步执行 IP 区域判断，避免首屏等待网络请求。
    - `min-enhanced.js` 调整为生产环境空闲时延迟注入（`requestIdleCallback` / `setTimeout` 兜底），减少关键渲染路径阻塞。
- **🔎 搜索交互优化**：
    - 地名搜索改为“单一搜索按钮 + 悬浮服务菜单”，用户点击搜索后可自由选择天地图或国际（Nominatim）。
    - 增加点击空白区域自动关闭服务菜单，交互更贴近原生下拉体验。
- **🔎 实时测度加载瓦片**：
    - 增加判断函数，对比两个主机的加载速度，自动选择最快速的瓦片服务

### V2.5.0 (2026-03-17)
- **🧰 工具箱与 TOC 重构**：
    - 工具箱迁移至侧边栏，与新闻/聊天面板风格统一。
    - 图层面板按业务拆分为绘制图层、上传图层与搜索结果图层。
    - 每次绘制结束自动生成独立图层并加入 TOC，便于单独控制。
- **🎨 样式系统增强**：
    - 新增样式模板（经典绿、警示橙、水系蓝、品红）。
    - 支持填充色、边框色、填充透明度、边框宽度编辑。
    - 样式编辑可应用到绘制图层、上传图层和搜索结果图层。
- **🖱️ 交互优化**：
    - 图层项支持左键查看、右键仅显。
    - 地图支持右键快速属性查询。
    - 上传图层与搜索结果图层自动附带名称标注。
- **📦 数据导入能力扩展**：
    - 新增 SHP/ZIP 导入支持（基于 `shpjs` 解析）。
    - 新增 KMZ 导入支持（自动解压并解析其中 KML）。
    - 上传入口支持点击/拖拽一体化上传，并复用统一文件大小与类型校验（支持多选）。
    - 优化 KML 导入后样式覆盖逻辑，避免样式编辑不生效。
    - 新增 TIFF/GeoTIFF 导入，支持无坐标参考回退显示。
- **🧭 栅格能力增强**：
    - 单波段支持分位数拉伸与 NoData 透明处理。
    - 地图单击可查询当前点击位置的栅格波段值（多波段逐波段返回）。
- **🧱 经纬分割辅助线优化**：
    - 九宫格分割模式保留边缘经纬标注（N/S/E/W 方向语义）。
    - 视图中心标记改为“+”号符号，减少中心区域视觉干扰。

### V2.4.1 (2026-02-01)
- **🔒 安全性优化**：
    - 移除代码中硬编码的 API Key，改为环境变量配置。
    - 天地图 Token 和 AI API Key 现在通过 `.env` 文件配置。
    - 新增 `.env.example` 环境变量配置模板。
- **📝 代码质量优化**：
    - 为所有主要组件添加 JSDoc 文档注释。
    - 统一代码区域标记格式，提升可读性。
    - 移除未使用的常量和冗余注释。
- **🤖 AI 助手优化**：
    - 未配置 API Key 时显示友好提示，引导用户前往设置。
    - 优化欢迎消息初始化逻辑。
- **📖 文档更新**：
    - README 新增环境变量配置表格说明。
    - 更新目录结构，添加 `.env.example` 文件说明。
    - 完善开发建议，强调环境变量安全实践。

### V2.4.0 (2026-01-14)
- **🤖 AI 智能助手**：
    - **集成 DeepSeek V2.5**：通过 SiliconFlow API 接入先进的 GIS 领域大语言模型，提供实时、准确的专业问答服务。
    - **流式响应**：实现在线打字机效果，大幅提升对话流畅度与用户体验。
    - **无缝集成**：AI 面板内置于 `SidePanel`，通过顶部导航栏一键唤起，不遮挡地图主界面，支持与新闻面板快速切换。
    - **个性化设置**：支持自定义 API Endpoint、Key 和模型名称，且能在本地自动持久化保存。
    - **历史管理**：支持一键清除聊天记录。
- **UI/UX 优化**：
    - **侧边栏重构**：升级 `SidePanel` 组件，使其支持多 Tab 模式（信息/聊天），在保持原有新闻展示功能的同时扩展了 AI 交互能力，避免了弹窗遮挡问题。
    - **TopBar 升级**：新增 AI 助手入口按钮，优化了按钮布局。

### V2.3.2 (2026-01-12)
- **性能优化**：
    - **SidePanel 延迟加载**：侧边栏改为异步组件 + v-if 策略，初始化时不加载，首次展开时才加载组件及图片资源，显著提升首屏加载速度。
    - **优化占位符**：侧边栏折叠时显示现代化的占位符按钮，支持 SVG 图标、渐变背景、光晕动画和多设备自适应。
- **地图增强**：
    - **缩放级别显示**：底部控制栏新增实时缩放级别数字显示，方便了解当前地图层级。
    - **完整缩放范围**：移除最小缩放限制，支持从 0 级（全球视图）到 22 级（街道级）的完整缩放范围。
    - **初始图层优化**：默认同时加载 Google 影像和天地图注记，提供更好的地理信息展示。
- **Bug 修复**：
    - 修复天地图注记层初始化时虽勾选但不显示的问题。
    - 修复初始状态图层可见性未正确应用的问题。

### V2.3.1 (2026-01-11)
- **鹰眼视图**：
    - 新增 OverviewMap 控件，位于地图左上角，实时显示当前视图范围。
    - 支持展开/折叠，提供全局视野导航。
    - 桌面端尺寸 200x200px，移动端自适应为 120x120px。
    - 当前视图范围用蓝色半透明框高亮显示。

### V2.3.0 (2026-01-07)
- **图层管理增强**：
    - **全新图层管理器**：新增独立的图层管理面板，支持拖拽排序（Drag & Drop）和更细粒度的图层显隐控制。
    - **多图层叠加**：重构底层逻辑，从单一底图切换改为多图层叠加模式，支持通过拖拽调整 Z-Index 遮盖顺序。
    - **自定义底图**：新增自定义 URL 功能，用户可直接输入 XYZ 格式（如 `https://.../{z}/{x}/{y}.png`）加载外部瓦片服务。
- **图源库扩充**：
    - 新增 **Esri** 系列（海洋、地形、物理、山影、灰度）。
    - 新增 **Google Earth**（最新影像）、**Yandex** 卫星地图。
    - 新增 **GeoQ**（灰色底图、水系图）及 **腾讯地图**。
    - 修复天地图矢量注记（cva）与影像注记（cia）的混合冲突问题，现在各类底图会自动匹配正确的注记层。
- **UI/UX 改进**：
    - 优化图层切换器布局，增加面板关闭按钮与交互动画。
    - 修复部分 UI 在特定分辨率下的遮挡问题。

### V2.2.3 (2025-12-29)
- **延迟统计脚本集成（min-enhanced.js）：**
    - 将第三方统计/展示脚本集中到 `public/min-enhanced.js`，在 `index.html` 以延迟方式引入。
    - 脚本在 `window.load` 后延时执行（默认 3s），再按顺序加载 Supabase、MapMyVisitors、Google Analytics、51.la（国内/国际）等 SDK，并对目标 DOM 元素存在性做检查。

### V2.2.2 (2025-12-29)
- **重大 UI 更新：**
    - 适配移动端，代码组织重新优化。
    - 增加获取用户定位/IP的功能，显示用户的位置。
    - 初始视图改为优先尝试获取并居中到用户定位（若用户允许，缩放到 18）。
    - 底部"主页"按钮交互重构为统一处理：单击复位视图，双击（快速两次点击）请求定位并缩放到用户位置（内部使用 300ms 防抖）。
    - 优化 `zoomToUser` 行为：优先使用最后已知位置，若无则执行一次定位并居中。
    - 大图预览改为 Lightbox（全屏遮罩）模式，点击遮罩或关闭按钮收起，改善移动端体验。
    - 鼠标位置显示控件样式调整为 flex 居中，更好地垂直对齐显示内容。

### V2.2.1 (2025-12-12)
- **性能优化**：
    - 将 Font Awesome 的 CDN 源从 `bootcdn` 切换至 `cdnjs.loli.net`，提升国内访问速度与稳定性。

### V2.2.0 (2025-12-12)
- **侧边栏优化**：
    - 新增侧边栏折叠/展开功能，支持点击按钮快速切换。
    - 优化侧边栏在移动端的显示效果，折叠时自动吸底。
    - 调整折叠按钮样式，支持垂直/水平居中显示。
- **地图交互增强**：
    - 优化复位按钮交互：单击复位视图，双击跳转至中国全图。
    - 新增 `MagicCursor` 鼠标特效组件。
- **文档更新**：更新项目目录结构说明。

### V2.1.0 (2025-11-30)
- **3D 地图集成**：引入 CesiumJS 实现三维地球展示，支持二三维视图切换。
- **智能地形切换**：实现基于视点位置的动态地形加载策略——中国境内加载天地图地形，境外自动切换为 Cesium World Terrain。
- **UI 统一**：统一了 2D/3D 视图下的坐标显示面板样式与交互体验。
- **体验优化**：
    - 修复了本地瓦片加载路径问题。
    - 优化了鼠标位置追踪与坐标实时显示功能。

### V2.0.0 (2025-11-28)
- **架构重构**：迁移至 Vue 3 + Vite + Vue Router 的 SPA 架构。
- **功能新增**：
    - 新增登录/注册页面。
    - 新增地图复位按钮。
    - 优化经纬度显示控件 UI。
- **移动端适配**：实现响应式布局，支持手机端访问（上下布局）。
- **代码优化**：
    - 移除 jQuery 风格的 DOM 操作，全面拥抱 Vue 响应式数据流。
    - 组件拆分（MapContainer, SidePanel, TopBar），降低耦合度。
    - 修复 OpenLayers 地图初始化与定位问题。

### V1.0.0 (2024-06-13)
- **初始发布**：作为课程作业提交。
- **基础功能**：
    - OpenLayers 地图展示与底图切换。
    - 简单的图文联动功能。
    - 基础的 HTML/CSS/JS 结构。

## 开发建议

- 建议使用 VS Code + Volar 插件，配合 ESLint 保持代码风格一致。
- 大比例尺时请求的瓦片较多，可按需控制缩放阈值或裁剪瓦片范围。
- **环境变量配置**：复制 `.env.example` 为 `.env`，配置你的 API Key，不要将 `.env` 提交到版本控制。
- **新增 API Key**：在 `.env` 文件中配置 `VITE_` 前缀变量，使用 `import.meta.env.VITE_XXX` 读取。
- **生产部署**：确保配置天地图 Token 和 AI API Key，否则相关功能将不可用。

欢迎继续扩展功能，例如添加更多兴趣点、天气信息或 3D 建筑模型。若遇到问题，欢迎提 Issue 讨论。祝学习 顺利！
```


## 🤖 后端 Agent Chat 系统（V3.0.2）

后端提供了完整的 LLM Agent 对话服务，前端可通过 `/api/agent/chat/*` 接口调用：

- **权限管理**：区分 Guest（每日 10 次）、Registered（每日 100 次）、Admin（无限次）
- **配置管理**：Admin 可通过前端面板配置 LLM Provider（如 DeepSeek-V3）
- **个性化配置**：用户可保存个人参数配置（温度、系统提示等）
- **配额消费**：实时跟踪用户配额使用情况

更多详情见 [后端详细文档 - Agent Chat](../backend/README.md#%EF%B8%8F-v302-agent-chat-配置同步修复)

