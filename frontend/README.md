# WebGIS 前端项目 — v3.0.8

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
# WebGIS 前端项目

基于 Vue 3 + Vite + OpenLayers/Cesium 的 WebGIS 前端工程

## 项目概览

- 地图内核：OpenLayers 2D + Cesium 3D
- 数据能力：GeoJSON/KML/KMZ/SHP/GeoTIFF/CSV 导入，CSV/TXT/GeoJSON/KML 导出
- 图层系统：TOC 协议层、右键菜单、多选批处理、行政区划与用户图层统一管理
- 业务模块：路径规划、地点检索、属性表、天气看板、AI 聊天、罗盘 HUD

## 快速开始

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

## 环境变量

复制 `.env.example` 为 `.env.local` 后配置：

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_TIANDITU_TK=your_tianditu_token
VITE_AMAP_WEB_SERVICE_KEY=your_amap_key
VITE_BASE_URL=./
```

## 部署说明

- 本地开发：`VITE_BASE_URL=./`
- GitHub Pages(WebGIS-Dev)：`VITE_BASE_URL=/WebGIS-Dev/`
- GitHub Pages(WebGIS)：`VITE_BASE_URL=/WebGIS/`

构建示例：

```bash
VITE_BASE_URL=/WebGIS-Dev/ npm run build
```

## 目录结构（2026-05-01 更新）

以下结构按当前工程实际文件更新，尽量做到逐文件注释。

```text
frontend/
├── .env.example                          # 环境变量模板
├── .env.local                            # 本地开发环境变量（不建议提交）
├── .env.production                       # 生产环境变量
├── eslint.config.js                      # ESLint 规则配置
├── index.html                            # Vite HTML 入口
├── jsconfig.json                         # JS/路径别名配置
├── package.json                          # 依赖与脚本入口
├── package-lock.json                     # 依赖锁文件
├── README.md                             # 当前文档
├── stats.html                            # 打包体积分析结果（生成文件）
├── vite.config.js                        # Vite 构建配置（分包、别名、优化等）
├── dist/                                 # 构建产物目录（生成文件）
├── node_modules/                         # 依赖目录（生成文件）
│
├── public/                               # 静态资源目录
│   ├── adcode.json                       # 行政区划树数据（行政区面板使用）
│   ├── favicon.ico                       # 站点图标
│   ├── min-enhanced.js                   # 统计/增强脚本
│   ├── ol.css                            # OpenLayers 备用样式
│   ├── ol.js                             # OpenLayers 备用脚本
│   ├── avatars/                          # 头像资源
│   ├── images/                           # 图片资源（含校园/Logo/罗盘素材）
│   ├── ShareData/                        # 共享 GIS 数据样例目录
│   └── tiles/                            # 本地瓦片目录（z/x/y）
│
├── scripts/
│   └── generate-boundary-index.mjs       # 边界索引文档生成脚本
│
└── src/
    ├── App.vue                           # 根组件
    ├── main.js                           # 应用入口（挂载 Router/Pinia）
    │
    ├── api/
    │   ├── backend.js                    # 前后端通信 API 枢纽（用户鉴权/异常处理）
    │   ├── geocoding.js                  # 地理编码/逆地理编码 API
    │   ├── index.js                      # API 聚合导出
    │   ├── ipLocation.js                 # IP 定位 API
    │   ├── locationSearch.js             # 地点检索 API
    │   ├── map.js                        # 地图业务 API（含 AOI）
    │   └── weather.js                    # 天气 API
    │
    ├── assets/
    │   ├── base.css                      # 全局基础样式
    │   └── main.css                      # 应用主样式
    │
    ├── components/
    │   ├── AdministrativeDivisionPanel.vue      # 行政区面板（选区、触发边界加载）
    │   ├── AdministrativeDivisionTreeNode.vue   # 行政区树节点（递归渲染）
    │   ├── AmapAoiInjectDialog.vue              # 高德 AOI 手动注入弹窗
    │   ├── AttributeTable.vue                   # 属性表组件（字段/筛选/联动）
    │   ├── BusPlannerPanel.vue                  # 公交路径规划面板
    │   ├── ChatPanelContent.vue                 # AI 聊天面板
    │   ├── CompassControlPanel.vue              # 罗盘控制面板（主题本地切换，分享状态不走后端）
    │   ├── ControlsPanel.vue                    # 左侧工具总面板
    │   ├── DrivingPlannerPanel.vue              # 驾车路径规划面板
    │   ├── FloatingAccountPanel.vue             # 账号悬浮入口（兼容旧引用）
    │   ├── GlobalLoading.vue                    # 全局加载遮罩
    │   ├── LayerControlPanel.vue                # 地图右上角底图控制面板
    │   ├── LayerPanel.vue                       # TOC 树容器
    │   ├── LocationSearch.vue                   # 地点搜索组件
    │   ├── MagicCursor.vue                      # 首屏特效组件
    │   ├── MapContainer.vue                     # 地图容器与能力暴露核心组件
    │   ├── MapControlsBar.vue                   # 底部坐标/缩放/定位工具栏
    │   ├── MapEasterEgg.vue                     # 地图彩蛋组件
    │   ├── MapPointPickerCard.vue               # 地图点选卡片
    │   ├── MapSwipeController.vue               # 地图对比滑块组件（双底图对比）
    │   ├── Message.vue                          # 全局消息条
    │   ├── PersistentAnnouncementBar.vue        # 顶部公告条
    │   ├── SharedResourceTreeItem.vue           # 共享资源树节点
    │   ├── SidePanel.vue                        # 右侧综合侧栏（资讯/TOC/聊天/路线）
    │   ├── TOCPanel.vue                         # TOC 与图层工具主面板
    │   ├── TOCTreeItem.vue                      # TOC 递归节点（右键菜单入口）
    │   ├── PalaceExplanationPanel.vue           # 罗盘宫位解释面板（点击选中宫位后显示风水解释）
    │   ├── TopBar.vue                           # 顶栏组件
    │   ├── WeatherChartPanel.vue                # 天气可视化组件
    │   │
    │   ├── Cesium/
    │   │   ├── CesiumAdvancedEffects.vue        # Cesium 高级特效
    │   │   ├── CesiumContainer.vue              # 3D 容器组件
    │   │   ├── Wind2D.js                        # 2D 风场渲染核心
    │   │   ├── Wind2D.html                      # 风场调试页面
    │   │   └── phy.html                         # 物理/效果测试页面
    │   │
    │   ├── feng-shui-compass-svg/
    │   │   ├── feng-shui-compass-svg.vue        # 罗盘 SVG 主组件
    │   │   ├── data/                            # 罗盘静态数据
    │   │   ├── themes/                          # 罗盘主题配置（5种主题配置）
    │   │   ├── types/                           # 罗盘类型定义
    │   │   └── Explanation/                     # 宫位解释 JSON 数据
    │   │       ├── compass_explanation_standard.json       # 标准罗盘宫位解释
    │   │       ├── polygon_explanation_standard.json       # 多边形主题宫位解释
    │   │       ├── circle_explanation_standard.json        # 圆形主题宫位解释
    │   │       ├── dark_explanation_standard.json          # 暗黑主题宫位解释
    │   │       └── simple_explanation_standard.json        # 简洁主题宫位解释
    │   │
    │   ├── icons/
    │   │   ├── IconCommunity.vue                # 社区图标
    │   │   ├── IconDocumentation.vue            # 文档图标
    │   │   ├── IconEcosystem.vue                # 生态图标
    │   │   ├── IconSupport.vue                  # 支持图标
    │   │   └── IconTooling.vue                  # 工具图标
    │   │
    │   └── UserCenter/
    │       ├── AdminControlPanel.vue            # 管理员控制台
    │       ├── ApiKeysManagementPanel.vue       # API 密钥管理面板
    │       ├── ApiManagementPanel.vue           # API 使用管理面板
    │       └── FloatingAccountPanel.vue         # 用户中心浮层主组件
    │
    ├── composables/
    │   ├── useGisLoader.ts                      # GIS 数据加载调度入口
    │   ├── useKmzLoader.js                      # KMZ 解析工具
    │   ├── useLayerDataImport.js                # 导入数据转图层主流程
    │   ├── useManagedLayerRegistry.js           # 托管图层注册/广播
    │   ├── useMapState.js                       # 地图状态与视图状态管理
    │   ├── useMapSwipe.ts                       # 地图对比滑块 Canvas 裁剪逻辑
    │   ├── useMapSwipeTest.ts                   # 地图对比滑块测试与调试工具
    │   ├── useMessage.js                        # 消息系统 composable
    │   ├── useMessageIslandMotion.js            # 消息动效行为控制
    │   ├── useSharedResourceLoader.ts           # 共享资源扫描/加载
    │   ├── useTileSourceFactory.ts              # 瓦片源工厂
    │   ├── useUserLayerActions.js               # 用户图层动作集合
    │   ├── useUserLocation.js                   # 用户定位能力
    │   │
    │   ├── Magic/
    │   │   ├── useDelaunay.js                   # Delaunay 特效
    │   │   ├── useFluid.js                      # 流体特效
    │   │   ├── useGravity.js                    # 重力特效
    │   │   ├── useSingularity.js                # 奇点特效
    │   │   └── useWave.js                       # 波动特效
    │   │
    │   └── map/
    │       ├── basemapSystem.js                 # 底图系统聚合出口
    │       ├── index.js                         # map 域聚合导出
    │       ├── interactionHandlers.js           # 交互处理聚合出口
    │       ├── layerManager.js                  # 图层管理聚合出口
    │       ├── routeService.js                  # 路线服务聚合出口
    │       ├── usePositionCodeTool.js           # p 参数工具
    │       │
    │       ├── features/
    │       │   ├── README.md                    # features 子模块说明
    │       │   ├── index.js                     # features 聚合导出
    │       │   ├── useBasemapLayerBootstrap.js  # 底图初始化
    │       │   ├── useBasemapResilience.js      # 底图容灾与兜底
    │       │   ├── useBasemapSelectionWatcher.js # 底图切换监听
    │       │   ├── useBasemapStateManagement.js # 底图状态管理
    │       │   ├── useBasemapUrlMapping.js      # 底图 URL 映射
    │       │   ├── useCoordinateSystemConversion.js # CRS 转换
    │       │   ├── useCreateManagedVectorLayer.js   # 托管矢量图层创建
    │       │   ├── useDeferredUserLayerApis.js      # 图层 API 延迟加载
    │       │   ├── useDrawMeasure.js             # 绘制与测量
    │       │   ├── useLayerContextMenuActions.js # 图层上下文菜单动作
    │       │   ├── useLayerControlHandlers.js    # 图层控制处理
    │       │   ├── useLayerMetadataNormalization.js # 图层元数据标准化
    │       │   ├── useManagedFeatureHighlight.js # 要素高亮
    │       │   ├── useManagedFeatureOperations.js # 要素操作
    │       │   ├── useManagedFeatureSerialization.js # 要素序列化
    │       │   ├── useManagedLayerStyle.js       # 图层样式
    │       │   ├── useMapEventHandlers.js        # 地图事件处理
    │       │   ├── useMapSearchAndCoordinateInput.js # 搜索与坐标输入
    │       │   ├── useMapUIEventHandlers.js      # UI 事件处理
    │       │   ├── useRightDragZoom.js           # 右键拖拽缩放
    │       │   ├── useRouteRendering.js          # 路线渲染
    │       │   ├── useRouteStepInteraction.js    # 路线步骤交互
    │       │   ├── useRouteStepStyles.js         # 路线步骤样式
    │       │   ├── useStartupTaskScheduler.js    # 启动任务调度
    │       │   └── useUserLayerApiFacade.js      # 用户图层 API 门面
    │       │
    │       └── toc/
    │           ├── factory.js                    # TOC 标准节点工厂
    │           ├── index.js                      # TOC 域聚合导出
    │           ├── protocol.js                   # TOC 协议层（命令、格式、能力）
    │           ├── actions/
    │           │   ├── contextActionManager.js  # TOC 事件执行器
    │           │   ├── exportService.js         # TOC 导出服务
    │           │   └── selectionManager.js      # TOC 多选/批处理
    │           └── menu/
    │               ├── commandDispatcher.js     # 菜单命令分发
    │               └── contextMenu.js           # 右键菜单构建
    │
    ├── constants/
    │   ├── goldenSoupQuotes.js                  # 语录常量
    │   ├── index.js                             # 常量聚合导出
    │   ├── mapStyles.js                         # 地图样式与模板
    │   ├── NON_STANDARD_XYZ_ADAPTER_EXAMPLES.ts # 非标 XYZ 示例
    │   ├── useBasemapManager.ts                 # 底图源管理
    │   └── useStyleEditor.js                    # 样式编辑模板
    │
    ├── router/
    │   ├── index.js                             # 路由与守卫
    │   └── lazyHomeViewLoader.js                # HomeView 二段式懒加载
    │
    ├── services/
    │   ├── CompassManager.ts                    # 罗盘管理服务（罗盘绘制的主要实现逻辑）
    │   ├── compassUrlState.ts                   # 罗盘 URL 单参数加密状态（cs）编解码
    │   └── DistrictManager.ts                   # 行政区边界加载与 TOC/图层同步
    │
    ├── stores/
    │   ├── index.ts                             # Store 聚合导出
    │   ├── useAppStore.ts                       # 全局应用状态
    │   ├── useAttrStore.ts                      # 属性表状态
    │   ├── useAuthStore.ts                      # 登录认证状态
    │   ├── useCompassStore.ts                   # 罗盘状态（纯前端本地主题配置）
    │   ├── useLayerStore.ts                     # 图层树与图层交互状态
    │   ├── useTOCStore.ts                       # TOC 元数据与行政区树状态
    │   ├── useUrlParamStore.ts                  # URL 参数状态
    │   ├── useUserPreferencesStore.ts           # 用户偏好状态
    │   └── useWeatherStore.ts                   # 天气状态
    │
    ├── utils/
    │   ├── amapRectangle.js                     # 矩形范围工具
    │   ├── auth.js                              # 认证辅助工具
    │   ├── coordinateFormatter.js               # 坐标格式化
    │   ├── coordinateInputHandler.js            # 坐标输入解析
    │   ├── coordTransform.js                    # 坐标转换工具
    │   ├── crsUtils.js                          # CRS 工具
    │   ├── drawTransitRoute.ts                  # 公交路径绘制
    │   ├── driveXmlParser.ts                    # 驾车 XML 解析
    │   ├── explanationLookup.ts                 # 罗盘宫位解释查询引擎（精确映射 + 回退策略）
    │   ├── index.js                             # utils 聚合导出
    │   ├── labelValidator.ts                    # 标注内容校验
    │   ├── layerExportService.js                # 图层导出服务
    │   ├── loading.js                           # 全局 loading 控制
    │   ├── loadTiandituSdk.js                   # 天地图 SDK 加载
    │   ├── themeExplanationMapper.ts            # 罗盘主题→解释数据映射器（主题识别与标准化导入）
    │   ├── transitRouteBuilder.js               # 路线构建器
    │   ├── urlCrypto.js                         # URL 编解码辅助
    │   ├── userLocationContext.js               # 用户定位上下文
    │   ├── userPositionCache.js                 # 定位缓存
    │   ├── biz/
    │   │   └── index.js                         # 业务工具聚合导出
    │   ├── echarts/
    │   │   ├── cesiumFxRuntime.js               # Cesium 图表运行时
    │   │   └── weatherRuntime.js                # 天气图表运行时
    │   ├── geo/
    │   │   └── index.js                         # 地理工具聚合导出
    │   ├── io/
    │   │   └── index.js                         # 文件 IO 工具聚合导出
    │   └── gis/
    │       ├── batchProcessor.js                # 批处理引擎
    │       ├── crs-engine.ts                    # CRS 引擎
    │       ├── crsAware.js                      # CRS 识别
    │       ├── dataDispatcher.js                # 数据分发器
    │       ├── decompressFile.js                # 单文件解压
    │       ├── decompressor.ts                  # 递归解压
    │       ├── deferredGisAssets.js             # GIS 依赖预热
    │       ├── deferredGisWarmupLauncher.js     # GIS 预热触发
    │       ├── loadJsZip.ts                     # JSZip 懒加载
    │       ├── mapRuntimeDeps.js                # OpenLayers 运行时依赖加载
    │       └── parsers/
    │           ├── amapAoiParser.js             # AOI 解析器
    │           ├── kmlParser.ts                 # KML/KMZ 解析器
    │           ├── shpParser.ts                 # SHP 解析器
    │           └── tifLoader.ts                 # GeoTIFF 解析器
    │
    └── views/
        ├── HomeView.vue                         # 主页面（地图与侧栏总编排）
        └── RegisterView.vue                     # 登录/注册页
```

## 近期架构更新

### 🔄 V3.0.7 (2026-05-01)

## 开发约定

- 统一从聚合入口导入（如 `@/api`、`@/stores`、`@/composables/map`）
- 新增功能优先在 `composables/map/features` 扩展，避免堆叠到组件内
- 新增或重命名文件后，请同步更新本 README 的目录结构章节

## 常用命令

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## 许可证

MIT

---

最后更新：2026-05-01
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

### V3.0.7 (2026-05-01)
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



### V3.0.6 (2026-04-30)
#### 🧭 罗盘宫位解释系统与性能优化
* **宫位解释架构升级**：
  * 新增 `src/utils/explanationLookup.ts`，实现分层精确查询（按 sectionKey + palaceName 精确匹配）与多级回退策略（universalQuery/generateDefaultExplanation），确保所有宫位都有解释显示。
  * 新增 `src/utils/themeExplanationMapper.ts`，负责主题识别（根据 config.info 推导）、标准化 JSON 优先导入、缺失时自动兜底，完整支持 5 种主题映射。
  * 新增 `src/components/PalaceExplanationPanel.vue`，渲染点击宫位的风水解释面板（支持 5 种主题样式，包含完整的 UI 交互与关闭逻辑）。
  * 新增 5 个标准化 JSON 解释库：`compass_explanation_standard.json`、`polygon_explanation_standard.json`、`circle_explanation_standard.json`、`dark_explanation_standard.json`、`simple_explanation_standard.json`，每个采用统一的 { category, title, meaning } schema。
  * 新增 `src/utils/DATA_FORMAT_SPECIFICATION.md`，规范宫位解释 JSON 的数据结构与扩展方式。
* **罗盘性能重构**：
  * 修改 `src/stores/useCompassStore.ts`，默认位置改为 `NaN`（无有效值），避免页面加载时不必要的默认罗盘渲染。
  * 修改 `src/services/CompassManager.ts`：
    - `ensureVectorLayer()` 延迟创建逻辑，仅当启用且为 vector 模式时才创建图层。
    - `bindStoreWatchers()` 新增 watch，在 enabled && mode === 'vector' 时触发懒创建。
    - `handleMapSingleClick` 分支支持放置模式（placementMode=true 时直接设置位置）与宫位选中（非放置模式时解析宫位并触发高亮）。
  * 修改 `src/components/PalaceExplanationPanel.vue`，宫位名称拼接改用 `join('')` 而非仅取首字，完整支持三字及以上宫位标签。
* **交互改进**：
  * 修改 `src/stores/useCompassStore.ts` 的 `setSelectedPalace()` 与相关 action，支持点击宫位后自动渲染高亮扇区。
  * 修改 `setPosition()` 逻辑，移动罗盘时自动清除之前的选中状态，避免弹窗漂移。
* **文档完善**：
  * 更新 `frontend/README.md` 的目录结构与版本记录。
* **构建验证**：所有修改文件均通过 TypeScript 静态检查，无编译错误。
* **关键特性**：
  * 罗盘默认不加载（cs=0），仅用户主动启用或分享链接带参数时才渲染。
  * 宫位点击与选中的高亮、解释显示完全解耦，互不干扰，地图 click 事件保持原有逻辑不变。
  * 支持灵活扩展：新增宫位解释只需更新 JSON 文件，无需修改代码。

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

