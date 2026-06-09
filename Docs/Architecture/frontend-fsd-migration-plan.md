# 前端 FSD 渐进迁移计划

日期：2026-06-09

适用范围：`frontend/src` 前端源码组织。

本文是长期参考文档，不是一次性任务日志。前端体量较大，迁移不能按“一天完成”设计，后续每次调整目录、拆分功能、迁移模块时，都应优先对照本文执行。

## 1. 背景

当前前端已经具备较好的基础分层：

- `components/` 按 UI/业务块分组。
- `composables/` 承载 Vue 组合逻辑。
- `stores/` 承载 Pinia 状态。
- `api/` 承载接口客户端。
- `utils/` 承载工具函数。
- `views/` 承载页面级组件。

这些结构在项目早期是合理的，但 WebGIS 项目继续增长后，纯技术分层开始出现维护压力：

- `composables/` 同时放 Vue composable、地图领域模块、瓦片源工厂、数据导入流程、视觉特效等，逐渐变成“第二个 src”。
- `utils/` 中混入 GIS 数据解析、路线绘制、图层导出、罗盘解释映射等业务逻辑，不再只是通用纯工具。
- 地图相关能力分散在 `components/Map`、`composables/map`、`composables/map/features`、根级 `composables/useMapState.js`、`services/DistrictManager.ts`、`stores/useLayerStore.ts` 等多个位置。
- 部分大组件仍承担过多职责，例如 `MapContainer.vue`、`TOCPanel.vue`、`ChatPanelContent.vue`、`RegisterView.vue`、`HomeView.vue`。
- README 文件树过细，随着目录调整会产生高维护成本。

因此，后续前端应从“按技术类型横向分层”逐步迁移到“按业务能力纵向组织”，即 Feature-Sliced Design（FSD）风格。

## 2. 目标

### 2.1 主要目标

1. 让业务功能域有明确归属，减少“这个文件该放哪里”的判断成本。
2. 降低 `components/`、`composables/`、`utils/` 的杂糅程度。
3. 让地图、图层、数据导入、底图、天气、罗盘、AI 助手等 WebGIS 核心能力形成独立边界。
4. 让每个 feature 内部可以自带 UI、状态、接口、工具、组合逻辑。
5. 迁移过程中尽量不改变业务行为，减少回归风险。
6. 迁移完成后，让根级目录表达“架构层级”，而不是堆放所有技术类型。

### 2.2 非目标

以下事项不应和目录迁移混在同一个步骤中：

- 不顺手重写业务逻辑。
- 不在迁移阶段大规模改 UI。
- 不在迁移阶段替换 OpenLayers、Cesium、Pinia、Router 等基础技术。
- 不在迁移阶段重写 API 协议。
- 不为了“纯 FSD”强行拆碎所有文件。
- 不一次性删除所有旧路径，除非确认没有引用。

## 3. 推荐目标结构

长期目标结构如下：

```text
frontend/src/
├── app/                    # 应用启动、路由、全局 provider、全局初始化
├── pages/                  # 路由页面入口，只做页面装配
├── widgets/                # 跨 feature 的页面级组合组件，可选但推荐
├── features/               # 业务功能域，项目核心
├── entities/               # 领域对象、领域类型、无 UI 的领域模型
├── shared/                 # 跨业务复用的基础设施和通用能力
├── assets/                 # 静态资源、图片、字体、全局可直接引用资源
└── styles/                 # 全局样式、主题变量、CSS reset
```

### 3.1 层级说明

#### app

应用级初始化层。

适合放：

- `main.js` / `main.ts`
- `App.vue`
- Router 创建与全局守卫
- Pinia/Vue 插件注册
- 全局 loading/message provider
- 应用级错误边界
- 全局 bootstrap 逻辑

不适合放：

- 地图业务逻辑
- 图层业务逻辑
- 具体页面 UI
- feature 内部状态

#### pages

页面入口层。页面只负责组装 widgets/features，不承载大量业务细节。

适合放：

- `home`
- `register`
- `terms`
- `privacy`
- `not-found`

页面内部可以有少量页面装配逻辑，但复杂流程应下沉到 feature 或 widget。

#### widgets

组合层，用来组织多个 feature 的大块 UI。对 WebGIS 项目推荐保留这一层，因为首页通常不是单一功能，而是地图、图层、搜索、天气、用户中心等能力的组合。

适合放：

- 应用壳层，如 TopBar、SidePanel、PersistentAnnouncementBar。
- 首页布局组合。
- 由多个 feature 组成的大面板。

不适合放：

- 单一 feature 的内部细节。
- 纯工具函数。

#### features

业务功能域层。WebGIS 前端的大多数代码最终应落在这里。

推荐 feature：

```text
features/
├── map/                    # 地图容器、地图实例、地图生命周期、地图交互
├── basemap/                # 底图源、瓦片源、XYZ/WMS/WMTS、底图容灾
├── layers/                 # 图层管理、TOC、属性表、样式、导出
├── data-import/            # SHP/KML/KMZ/TIF/CSV 导入、解压、解析、Worker 调度
├── spatial-analysis/       # 缓冲区、叠加、渔网、凸包等分析
├── draw-measure/           # 绘制、测量、编辑
├── search/                 # 地点搜索、AOI 注入、地理编码入口
├── routing/                # 公交/驾车路线规划、路线渲染
├── weather/                # 天气面板、天气图表、天气状态
├── compass/                # 罗盘、宫位解释、罗盘主题与元数据
├── chat-agent/             # AI 助手、工具调用、GIS Commander
├── auth/                   # 登录、注册、会话、密码重置
├── user-center/            # 用户中心、偏好设置、API Key 管理
├── admin/                  # 管理员控制台、API 管理
└── monitor/                # 日志监控、运行状态面板
```

#### entities

领域对象层。它描述业务概念，但不直接负责复杂交互 UI。

推荐实体：

```text
entities/
├── layer/                  # Layer 类型、Layer 元数据、Layer 树基础模型
├── dataset/                # 导入数据集、共享资源、文件包模型
├── geometry/               # 几何类型、坐标类型、空间分析基础类型
├── basemap-source/         # 底图源、瓦片源描述
├── user/                   # 用户、角色、偏好基础模型
├── route/                  # 路线、路径步骤、交通方式模型
├── weather/                # 天气数据模型
└── download-task/          # 下载任务模型
```

#### shared

跨业务共享层。只能放真正通用、无具体业务归属或被多个 feature 稳定复用的内容。

推荐结构：

```text
shared/
├── api/                    # HTTP client、请求拦截器、错误模型
├── config/                 # env.ts、应用配置读取
├── ui/                     # 通用 UI 组件
├── lib/                    # 通用纯函数和基础库
│   ├── gis/                # CRS、坐标转换、基础格式解析
│   ├── url/
│   ├── date/
│   ├── validators/
│   └── async/
├── workers/                # 被多个 feature 复用的 Worker
└── assets/                 # 多 feature 共享的小型资源
```

## 4. Feature 内部标准结构

每个 feature 推荐使用统一内部结构：

```text
features/<feature-name>/
├── ui/                     # Vue 组件
├── model/                  # store、state、types、领域状态
├── api/                    # 本 feature 使用的接口封装
├── lib/                    # 只服务本 feature 的工具函数
├── composables/            # 只服务本 feature 的组合逻辑
├── config/                 # 本 feature 的配置项、常量、preset
├── assets/                 # 本 feature 私有资源
└── index.ts                # 对外公开出口
```

不是每个 feature 都必须包含全部目录。目录只在需要时创建。

示例：

```text
features/weather/
├── ui/
│   ├── WeatherChartPanel.vue
│   ├── WeatherLiveCards.vue
│   └── WeatherForecastTable.vue
├── model/
│   └── useWeatherStore.ts
├── api/
│   └── weatherApi.js
├── lib/
│   └── weatherUtils.js
├── composables/
│   ├── useWeatherData.js
│   └── useWeatherCharts.js
└── index.ts
```

## 5. 依赖方向规则

依赖方向应保持单向：

```text
app
  -> pages
    -> widgets
      -> features
        -> entities
          -> shared
```

允许：

- `pages` 引用 `widgets`、`features`。
- `widgets` 引用多个 `features`。
- `features` 引用 `entities` 和 `shared`。
- `entities` 引用 `shared`。
- `shared` 引用第三方库。

禁止或尽量避免：

- `shared` 引用 `features`。
- `entities` 引用 `features`。
- `features` 随意互相深层引用。
- feature A 直接 import feature B 的内部文件。
- 从 `features/foo/ui/xxx.vue` import `features/bar/model/internal.ts` 这类内部路径。

跨 feature 调用规则：

1. 优先通过 `index.ts` 暴露公共 API。
2. 如果两个 feature 强耦合，考虑抽取共同领域到 `entities` 或 `shared`。
3. 如果是页面组合关系，由 `widgets` 或 `pages` 负责调度，不让 feature 互相知道太多。

## 6. 当前项目到 FSD 的映射建议

### 6.1 app

当前候选：

```text
src/main.js
src/App.vue
src/router/*
```

目标：

```text
src/app/main.js
src/app/App.vue
src/app/router/*
```

注意：

- `index.html` 中入口需要从 `./src/main.js` 改为 `./src/app/main.js`。
- Router 中的页面 import 后续应指向 `@/pages/...`。
- 与登录、分享、URL 参数相关的守卫逻辑可以先保留在 router 中，后续再抽到 `features/auth` 或 `features/share`。

### 6.2 pages

当前候选：

```text
src/views/HomeView.vue
src/views/RegisterView.vue
src/views/TermsOfService.vue
src/views/PrivacyPolicy.vue
src/views/NotFoundView.vue
src/views/home/*
```

目标：

```text
src/pages/home/
src/pages/register/
src/pages/legal/
src/pages/not-found/
```

建议：

- `HomeView.vue` 作为首页装配层，逐步瘦身。
- `RegisterView.vue` 当前较大，后续应拆出 `features/auth/ui` 和 `features/auth/model`。
- `TermsOfService.vue`、`PrivacyPolicy.vue` 可归入 `pages/legal`。

### 6.3 widgets

当前候选：

```text
src/components/Shell/*
src/components/ControlsPanel/ControlsPanel.vue
```

目标：

```text
src/widgets/app-shell/
src/widgets/control-panel/
```

建议：

- `TopBar`、`SidePanel`、`GlobalLoading`、`Message` 更像应用壳层组件。
- `ControlsPanel.vue` 如果只是组合 Draw/Measure/Spatial/AdminDivision 等 feature，则更适合 widget。
- 单个功能面板，例如 `DrawPanel.vue`、`MeasurePanel.vue`，应迁到对应 feature。

### 6.4 features/map

当前候选：

```text
src/components/Map/*
src/composables/map/*
src/composables/useMapState.js
src/composables/useMapSwipe.ts
src/composables/useMapSwipeTest.ts
src/services/DistrictManager.ts
```

目标：

```text
src/features/map/
├── ui/
├── model/
├── composables/
├── lib/
└── index.ts
```

注意：

- `composables/map/toc` 不应留在 `map`，应归入 `features/layers`。
- `basemap` 相关应归入 `features/basemap`。
- `MapContainer.vue` 迁移时只改路径，不做大重构。

### 6.5 features/basemap

当前候选：

```text
src/composables/tileSource/*
src/composables/useTileSourceFactory.ts
src/constants/basemap/*
src/constants/tileSourceAdapters.ts
src/composables/map/features/useBasemap*
src/composables/map/features/basemapLayerFactory.js
```

目标：

```text
src/features/basemap/
├── model/
├── config/
├── tile-source/
├── composables/
├── lib/
└── index.ts
```

建议：

- `tileLifecycle.ts`、`xyzSource.ts`、`wmsSource.ts`、`wmtsSource.ts` 不属于 Vue composable，应迁出根级 `composables`。
- 底图配置、底图解析、底图容灾、底图图层工厂应统一归到 `basemap`。

### 6.6 features/layers

当前候选：

```text
src/components/Layer/*
src/composables/map/toc/*
src/stores/useLayerStore.ts
src/stores/useTOCStore.ts
src/stores/layer/*
src/utils/layerExportService.js
src/composables/useManagedLayerRegistry.js
src/composables/useUserLayerActions.js
```

目标：

```text
src/features/layers/
├── ui/
├── model/
├── composables/
├── lib/
├── toc/
└── index.ts
```

建议：

- TOC、属性表、图层树、图层导出、图层样式、图层操作应在一个 feature 中。
- `stores/useLayerStore.ts` 可以迁到 `features/layers/model/useLayerStore.ts`，根级 `stores/index.ts` 先保留 re-export。
- `layerExportService.js` 不应留在全局 `utils`。

### 6.7 features/data-import

当前候选：

```text
src/composables/useLayerDataImport.js
src/composables/useGisLoader.ts
src/composables/useKmzLoader.js
src/composables/useSharedResourceLoader.ts
src/composables/dataImport/*
src/utils/gis/*
src/workers/tiffWorker.js
src/workers/shpWorker.js
src/utils/tifUtils.js
src/utils/vectorWorkerUtils.js
src/utils/textDecoder.js
src/utils/pathUtils.js
```

目标：

```text
src/features/data-import/
├── composables/
├── parsers/
├── workers/
├── lib/
├── model/
└── index.ts
```

注意：

- `textDecoder.js`、`pathUtils.js` 如果多个 feature 都稳定复用，可留在 `shared/lib`。
- KML/SHP/TIF 解析如果只服务数据导入，归入 `features/data-import`。
- Worker 如果只服务数据导入，可放入 `features/data-import/workers`；若多个 feature 直接复用，再放 `shared/workers`。

### 6.8 features/weather

当前候选：

```text
src/components/Weather/*
src/composables/weather/*
src/stores/useWeatherStore.ts
src/utils/weather/*
src/api/weather.js
src/api/backend/weather.js
```

目标：

```text
src/features/weather/
├── ui/
├── model/
├── api/
├── lib/
├── composables/
└── index.ts
```

建议作为第一批试点迁移。

原因：

- 边界清晰。
- 文件数量适中。
- 与地图核心耦合较低。
- 容易通过构建和页面功能验证。

### 6.9 features/routing

当前候选：

```text
src/components/Routing/*
src/utils/drawTransitRoute.ts
src/utils/driveXmlParser.ts
src/utils/transitRouteBuilder.js
src/composables/map/routeService.js
src/api/backend/routing.js
```

目标：

```text
src/features/routing/
├── ui/
├── api/
├── lib/
├── composables/
├── model/
└── index.ts
```

### 6.10 features/search

当前候选：

```text
src/components/Search/*
src/api/geocoding.js
src/api/locationSearch.js
src/api/ipLocation.js
src/utils/amapRectangle.js
src/utils/gis/parsers/amapAoiParser.js
src/utils/gis/parsers/universalAmapParser.js
```

目标：

```text
src/features/search/
├── ui/
├── api/
├── lib/
├── composables/
└── index.ts
```

注意：

- IP 定位如果被用户定位 feature 使用，也可以拆到 `features/location` 或 `shared/api/location`。

### 6.11 features/compass

当前候选：

```text
src/components/Compass/*
src/components/feng-shui-compass-svg/*
src/services/CompassManager.ts
src/services/compass/*
src/stores/useCompassStore.ts
src/utils/explanationLookup.ts
src/utils/themeExplanationMapper.ts
src/assets/data/compass-metadata/*
```

目标：

```text
src/features/compass/
├── ui/
├── model/
├── services/
├── lib/
├── data/
├── themes/
└── index.ts
```

建议：

- 罗盘 SVG 组件、主题、解释 JSON、元数据应整体收束。
- `CompassManager.ts` 与罗盘状态强相关，适合进入 `features/compass/services`。

### 6.12 features/chat-agent

当前候选：

```text
src/components/Chat/ChatPanelContent.vue
src/services/agent/AgentExecutor.js
src/composables/map/GISCommander.js
src/constants/agentToolsSchema.js
src/stores/useChatStore.ts
src/api/backend/agent.js
```

目标：

```text
src/features/chat-agent/
├── ui/
├── model/
├── api/
├── services/
├── lib/
└── index.ts
```

注意：

- `GISCommander` 介于 AI Agent 和地图能力之间。建议作为 chat-agent 的地图工具适配器，或者拆到 `features/map/tooling` 后由 chat-agent 通过公开接口调用。
- 不建议让 chat-agent 深入 import `features/map` 内部实现。

### 6.13 features/auth 与 features/user-center

当前候选：

```text
src/views/RegisterView.vue
src/services/auth.js
src/stores/useAuthStore.ts
src/components/UserCenter/*
src/stores/useUserPreferencesStore.ts
src/api/backend/auth.js
src/api/backend/admin.js
```

目标：

```text
src/features/auth/
src/features/user-center/
src/features/admin/
```

建议：

- 登录注册、会话、密码重置归 `auth`。
- 用户中心浮层、偏好、安全设置、API Key 管理归 `user-center`。
- 管理员控制台和 API 管理可以单独成 `admin`，也可先放在 `user-center/admin`，后续再拆。

## 7. shared 的收束建议

迁移后，`shared` 只放稳定复用能力。

### 7.1 shared/api

适合放：

```text
src/api/backend/client.js
src/api/httpStatusMap.js
```

原则：

- HTTP client 不应直接触发 UI message。
- API 层只负责请求、响应、错误结构。
- 错误提示应由 feature 或 page 决定。

### 7.2 shared/config

建议新增：

```text
src/shared/config/env.ts
```

作用：

- 集中读取 `import.meta.env`。
- 避免组件直接散落读取 `VITE_*`。
- 提供默认值和类型归一。

示例职责：

```text
TIANDITU_TOKEN
AMAP_WEB_KEY
BACKEND_BASE_URL
TILE_PROXY_BASE_URL
BASE_URL
```

### 7.3 shared/lib

适合放：

```text
normalize.ts
abortManager.js
pathUtils.js
textDecoder.js
coordTransform.js
crsUtils.js
url/crypto.js
labelValidator.ts
```

判断标准：

- 与具体业务 UI 无关。
- 不依赖 store。
- 不依赖 feature。
- 可以被多个 feature 独立复用。

### 7.4 shared/ui

适合放：

```text
components/Common/ExtentPicker.vue
utils/ui/loading.js
```

注意：

- `ExtentPicker.vue` 如果只服务地图/空间分析，也可放到 `features/map/ui` 或 `features/spatial-analysis/ui`。
- 若多个功能都需要框选范围，则放 `shared/ui`。

## 8. 迁移阶段计划

### Phase 0：确认规则与冻结行为

目标：

- 不移动代码。
- 确认 FSD 规则、目录命名、依赖方向。
- 将本文作为后续迁移参考。

验收：

- 本文档存在。
- 后续任务迁移前先引用本文。

### Phase 1：建立 FSD 骨架

目标：

```text
src/app/
src/pages/
src/widgets/
src/features/
src/entities/
src/shared/
```

建议动作：

1. 新增目录骨架。
2. 新增必要的 `index.ts`。
3. 暂不删除旧目录。
4. 新增 `shared/config/env.ts`。

验收：

- `npm run build` 通过。
- 旧功能不受影响。

### Phase 2：低风险试点迁移

建议优先：

1. `features/weather`
2. `features/basemap/tile-source`
3. `app` 与 `pages` 基础迁移

目标：

- 验证 feature 内部结构。
- 验证 import 更新策略。
- 验证文档写法。

注意：

- `weather` 是最好试点。
- `basemap/tile-source` 与当前打开的 `tileLifecycle.ts` 相关，适合作为第二个试点。
- 不要在此阶段重构地图核心流程。

验收：

- `npm run build` 通过。
- 天气面板可打开。
- 底图切换、XYZ/WMS/WMTS 基础逻辑不报错。

### Phase 3：地图核心迁移

目标：

迁移：

```text
components/Map
composables/map
useMapState
useMapSwipe
```

但排除：

```text
composables/map/toc
composables/map/features/useBasemap*
```

原因：

- `toc` 属于 layers。
- `basemap` 属于 basemap。

验收：

- 首页地图正常初始化。
- 底图显示正常。
- 定位、缩放、坐标显示正常。
- 卷帘功能正常。
- 分享链接参数基础恢复正常。

### Phase 4：图层与 TOC 迁移

目标：

迁移：

```text
components/Layer
composables/map/toc
stores/useLayerStore.ts
stores/useTOCStore.ts
stores/layer
layerExportService.js
```

这是高风险阶段，应单独执行。

验收：

- TOC 展示正常。
- 图层显示/隐藏正常。
- 图层排序正常。
- 图层属性表正常。
- 图层导出正常。
- 多选和右键菜单正常。

### Phase 5：数据导入迁移

目标：

迁移：

```text
useLayerDataImport.js
useGisLoader.ts
useKmzLoader.js
useSharedResourceLoader.ts
utils/gis
workers/tiffWorker.js
workers/shpWorker.js
composables/dataImport
```

这是高风险阶段，应独立于 Phase 4。

验收：

- GeoJSON 导入正常。
- KML/KMZ 导入正常。
- SHP 导入正常。
- GeoTIFF 导入正常。
- CSV 或其他已支持格式正常。
- 大文件导入不明显回退。
- Worker 路径在 Vite 构建后可用。

### Phase 6：其余业务域迁移

可按优先级逐步迁移：

1. `features/compass`
2. `features/routing`
3. `features/search`
4. `features/chat-agent`
5. `features/auth`
6. `features/user-center`
7. `features/admin`
8. `features/monitor`
9. `features/draw-measure`
10. `features/spatial-analysis`

每个 feature 独立迁移、独立验证。

### Phase 7：清理旧目录

在确认旧引用全部迁走后，再清理：

```text
src/components
src/composables
src/services
src/utils
src/views
src/api
src/stores
```

注意：

- 不一定要完全删除这些目录。
- 如果仍保留，也应只作为兼容出口或极少数通用入口。
- 最终目标是让新增代码优先进入 FSD 目录，而不是继续扩大旧目录。

## 9. 每次迁移的标准流程

每迁一个 feature，应按以下步骤执行：

1. 确定迁移范围。
2. 使用 `rg` 查清所有引用点。
3. 创建目标 feature 目录。
4. 移动文件，只改路径，不改业务逻辑。
5. 建立 `index.ts` 公共出口。
6. 更新引用路径。
7. 对 JS/TS 模块可临时保留旧路径 re-export。
8. 对 Vue SFC 优先直接更新 import，不建议大量创建 wrapper 组件。
9. 运行 `npm run build`。
10. 手动验证核心交互。
11. 更新本 feature 对应文档或 README 简要说明。
12. 确认没有旧路径引用后，再考虑删除兼容出口。

推荐查引用命令：

```powershell
rg -n "components/Weather|composables/weather|useWeatherStore|utils/weather" frontend/src
```

推荐查旧目录残留：

```powershell
rg -n "@/components|@/composables|@/utils|@/services|@/views" frontend/src
```

## 10. 兼容出口策略

### 10.1 JS/TS 文件

可临时保留旧路径：

```ts
export * from '@/features/weather';
```

或：

```ts
export { useWeatherStore } from '@/features/weather/model/useWeatherStore';
```

目的：

- 减少一次性改动范围。
- 支持分阶段迁移。

限制：

- 兼容出口必须有计划删除。
- 不应长期让新代码继续 import 旧路径。

### 10.2 Vue 组件

Vue SFC 不推荐长期做 wrapper。优先直接更新调用方：

```ts
import WeatherChartPanel from '@/features/weather/ui/WeatherChartPanel.vue';
```

如果引用点特别多，可以短期创建 wrapper，但要在迁移日志中标注清理计划。

### 10.3 Store

Pinia store 可以迁到 feature 内部：

```text
features/weather/model/useWeatherStore.ts
```

根级 `stores/index.ts` 可以暂时 re-export：

```ts
export { useWeatherStore } from '@/features/weather/model/useWeatherStore';
```

这样旧代码仍可：

```ts
import { useWeatherStore } from '@/stores';
```

新代码应优先：

```ts
import { useWeatherStore } from '@/features/weather';
```

## 11. Import 规范

推荐：

```ts
import { WeatherChartPanel } from '@/features/weather';
import { useLayerStore } from '@/features/layers';
import { normalizeBinaryFlag } from '@/shared/lib/normalize';
```

不推荐：

```ts
import WeatherChartPanel from '@/features/weather/ui/internal/WeatherChartPanel.vue';
import { something } from '@/features/layers/model/private/helper';
```

允许例外：

- feature 内部文件可以用相对路径引用同 feature 内部模块。
- 大型库、性能敏感模块可以避免过度 barrel export。

## 12. 命名规范

目录：

- feature 名使用 kebab-case：`data-import`、`chat-agent`、`user-center`。
- Vue 组件使用 PascalCase：`WeatherChartPanel.vue`。
- composable 使用 `useXxx`。
- store 使用 `useXxxStore`。
- 纯工具函数文件用业务名或能力名：`tileLifecycle.ts`、`routeBuilder.ts`。

文件出口：

- 每个 feature 可以有一个 `index.ts`。
- `index.ts` 只暴露公共 API，不暴露内部临时实现。
- 内部模块不要全部无脑 export。

## 13. 高风险区域

以下文件或目录迁移时要特别小心：

```text
src/components/Map/MapContainer.vue
src/components/Layer/TOCPanel.vue
src/components/Chat/ChatPanelContent.vue
src/views/HomeView.vue
src/views/RegisterView.vue
src/composables/useLayerDataImport.js
src/composables/useMapState.js
src/services/CompassManager.ts
src/constants/basemap/basemapConfig.ts
```

原则：

- 高风险文件只迁路径，不顺手拆逻辑。
- 拆逻辑要单独任务、单独验证。
- 迁移前后必须跑构建。
- 地图、图层、导入链路要手动验证。

## 14. 验收清单

每个迁移阶段至少验证：

```text
[ ] npm run build 通过
[ ] 首页可进入
[ ] 地图可初始化
[ ] 默认底图可加载
[ ] 底图切换正常
[ ] 图层面板可打开
[ ] TOC 基础操作正常
[ ] 搜索/定位基础操作正常
[ ] 控制台无明显 import/path 错误
```

涉及特定 feature 时追加：

Weather：

```text
[ ] 天气面板可打开
[ ] 实况卡片正常
[ ] 图表正常 resize
[ ] 城市查询正常
```

Basemap：

```text
[ ] XYZ 正常
[ ] WMS 正常
[ ] WMTS 正常
[ ] 外部瓦片代理逻辑正常
[ ] AbortController 中断逻辑正常
```

Layers：

```text
[ ] 图层显示/隐藏正常
[ ] 图层排序正常
[ ] 属性表正常
[ ] 右键菜单正常
[ ] 导出正常
```

Data Import：

```text
[ ] GeoJSON 正常
[ ] KML/KMZ 正常
[ ] SHP 正常
[ ] GeoTIFF 正常
[ ] Worker 正常
```

Compass：

```text
[ ] HUD 显示正常
[ ] 尺寸/透明度配置正常
[ ] 宫位解释正常
[ ] URL 状态恢复正常
```

Chat Agent：

```text
[ ] 聊天面板正常
[ ] 工具调用正常
[ ] 地图指令正常
[ ] 配额/鉴权逻辑正常
```

## 15. 文档策略

迁移后，README 不应再维护超细文件树。

建议：

- `frontend/README.md` 保留 FSD 总览、目录职责、开发规则。
- 详细迁移路线以本文为准。
- 每次 feature 迁移写一篇日期日志，记录迁移范围、验证结果、遗留兼容出口。
- 不要在 README 中列每个具体文件，避免漂移。

推荐 README 目录树粒度：

```text
src/
├── app/
├── pages/
├── widgets/
├── features/
├── entities/
├── shared/
├── assets/
└── styles/
```

## 16. 第一轮建议执行范围

第一轮迁移应保持小步：

1. 创建 FSD 目录骨架。
2. 新增 `shared/config/env.ts`。
3. 迁移 `features/weather`。
4. 迁移 `features/basemap/tile-source`。
5. 将 `App.vue`、`main.js`、`router` 迁入 `app`。
6. 将 `views` 迁入 `pages`，但不拆大页面逻辑。
7. 更新 import。
8. 运行 `npm run build`。
9. 更新 `frontend/README.md` 的结构说明。

第一轮暂不迁：

```text
MapContainer.vue
TOCPanel.vue
useLayerDataImport.js
ChatPanelContent.vue
RegisterView.vue 的内部逻辑拆分
```

原因：

- 这些是高风险核心文件。
- 适合在骨架稳定后逐个拆。

## 17. 判断文件归属的简易规则

当不确定文件放哪里时，按以下问题判断：

1. 它是否只属于一个业务能力？
   - 是：放到对应 `features/<name>`。
2. 它是否是路由页面入口？
   - 是：放到 `pages`。
3. 它是否组合多个 feature 构成大块 UI？
   - 是：放到 `widgets`。
4. 它是否是领域对象、类型、模型，但不关心 UI？
   - 是：放到 `entities`。
5. 它是否完全通用、无业务状态、可被多个 feature 复用？
   - 是：放到 `shared`。
6. 它是否是应用启动、router、provider？
   - 是：放到 `app`。

如果仍不确定，优先不要放 `shared`。宁愿先放到更具体的 feature，后续发现多个 feature 复用后再上移。

## 18. 反模式清单

后续应避免：

- 新增文件继续默认塞进根级 `composables`。
- 新增业务工具继续默认塞进根级 `utils`。
- feature A 直接引用 feature B 的深层内部文件。
- API 文件直接触发 UI message。
- 大组件继续堆业务流程。
- README 继续维护几百行完整文件树。
- 迁移目录时顺手改业务逻辑。
- 未构建验证就继续迁下一个 feature。

## 19. 推荐提交/任务粒度

每次迁移建议只做一个明确范围：

- 一个小 feature，例如 weather。
- 一个基础层，例如 app/pages。
- 一个独立子域，例如 basemap/tile-source。
- 一个高风险核心域，例如 layers/TOC。

不建议一个任务同时迁：

- map + layers + data-import。
- auth + user-center + admin。
- compass + chat-agent + map。

## 20. 长期完成状态

迁移最终完成时，应满足：

```text
[ ] 新功能默认进入 features/entities/shared/app/pages/widgets
[ ] 根级 components/composables/utils/services/views 不再继续增长
[ ] shared 中没有业务 feature 反向依赖
[ ] 主要 store 已按 feature 收束
[ ] API client 与业务 API 分离
[ ] 地图、底图、图层、数据导入边界清楚
[ ] frontend/README.md 只维护高层结构
[ ] 构建稳定通过
```

完成后，项目结构应更接近：

```text
frontend/src/
├── app/
├── pages/
├── widgets/
├── features/
│   ├── map/
│   ├── basemap/
│   ├── layers/
│   ├── data-import/
│   ├── spatial-analysis/
│   ├── draw-measure/
│   ├── search/
│   ├── routing/
│   ├── weather/
│   ├── compass/
│   ├── chat-agent/
│   ├── auth/
│   ├── user-center/
│   ├── admin/
│   └── monitor/
├── entities/
├── shared/
├── assets/
└── styles/
```

## 21. 备注

FSD 是组织原则，不是目的本身。这个项目的核心是 WebGIS 能力稳定、可维护、可继续扩展。迁移过程中，如果“更像 FSD”与“更安全稳定”冲突，优先选择安全稳定。

本计划建议长期采用渐进迁移：

- 新代码按 FSD 写。
- 高频修改的旧模块优先迁。
- 低频稳定模块不急着搬。
- 每次迁移都保持可构建、可回退、可验证。
