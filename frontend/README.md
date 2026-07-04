# WebGIS 前端项目 — V3.3

> 基于 Vue 3 + Vite + OpenLayers + Cesium 的专业级 WebGIS 前端工程

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

```text
frontend/src/
├── App.vue                                         # 根组件
├── main.js                                         # 应用入口（挂载 Router/Pinia）
├── cesium-shim.js                                  # Cesium ESM 垫片（CDN window.Cesium 桥接）
│
├── api/                                            # API 客户端封装
│   ├── backend.js                                  # 后端 API barrel re-export
│   ├── backend/                                    # 后端 API 按业务域拆分
│   │   ├── client.js                               # axios 实例、拦截器、错误处理
│   │   ├── auth.js                                 # 鉴权接口
│   │   ├── location.js                             # 地理编码/定位接口
│   │   ├── weather.js                              # 天气接口
│   │   ├── routing.js                              # 路线规划接口
│   │   ├── agent.js                                # AI Agent 接口
│   │   ├── statistics.js                           # 统计/消息/公告
│   │   ├── admin.js                                # 管理后台接口
│   │   ├── spatial.js                              # 空间分析接口
│   │   ├── runtime.js                              # 前端运行时地图 token 配置接口
│   │   └── index.js                                # barrel export
│   ├── download.js                                 # 底图下载任务 API
│   ├── geocoding.js                                # 天地图/高德地理编码
│   ├── httpStatusMap.js                            # HTTP 状态码 + 高德 infocode 统一映射
│   ├── index.js                                    # barrel export
│   ├── ipLocation.js                               # IP 定位 API
│   ├── locationSearch.js                           # 地点搜索 API
│   ├── map.js                                      # 地图业务 API
│   └── weather.js                                  # 天气 API
│
├── assets/                                         # 全局样式与静态数据
│   ├── logo.svg                                    # 项目 Logo
│   ├── theme.css                                   # 全局主题变量
│   ├── toc-theme.css                               # TOC 主题变量
│   └── data/compass-metadata/                      # 罗盘元数据
│       ├── compass-data.ts                         # 罗盘基础数据
│       └── twentyEightConstellations.ts            # 二十八宿数据
│
├── components/                                     # 业务组件
│   ├── Cesium/                                     # ===== 3D 地球模块 =====
│   │   ├── CesiumContainer.vue                     # Cesium 容器（底图/地形 + URL 追踪 + 工具面板 + 拖拽导入）
│   │   ├── CesiumAdvancedEffects.vue               # 高级视觉效果（高度雾/HBAO/移轴/大气）
│   │   ├── CesiumToolPanel.vue                     # 统一控制面板（场景/数据/特效/风场/流体/漫游）
│   │   ├── CesiumDataImportDialog.vue              # GLTF/GLB 模型放置坐标输入弹窗
│   │   ├── LilGuiControls.vue                      # lil-gui 动态控件渲染器
│   │   ├── Wind2D.js                               # 2D 风场渲染
│   │   │
│   │   ├── Wind/                                   # GPU 风场粒子可视化模块
│   │   │   ├── wind-core/                          # 核心源码（cesium-wind-layer 移植）
│   │   │   │   ├── index.ts                        # WindLayer 主类
│   │   │   │   ├── types.ts                        # 类型定义
│   │   │   │   ├── windParticleSystem.ts           # 粒子系统编排器
│   │   │   │   ├── windParticlesComputing.ts       # GPU 计算管线（3 ComputeCommand）
│   │   │   │   ├── windParticlesRendering.ts       # GPU 渲染管线（DrawCommand）
│   │   │   │   ├── customPrimitive.ts              # Cesium Primitive 桥接
│   │   │   │   ├── shaderManager.ts                # ShaderSource 工厂
│   │   │   │   └── shaders/                        # GLSL 300 es 着色器
│   │   │   ├── useWindLayer.js                     # Vue Composable（生命周期管理）
│   │   │   ├── windLayerController.js              # lil-gui 模块（参数控制面板）
│   │   │   └── windSampleData.js                   # 示例数据加载器
│   │   │
│   │   ├── Cloud/                                  # 体积云模块（TypeScript）
│   │   │   ├── index.ts                            # 模块入口
│   │   │   ├── CloudManager.ts                     # 体积云管理器（Stage 生命周期 + 质量切换）
│   │   │   ├── CloudPresets.ts                     # 质量预设（low/medium/high/ultra）
│   │   │   ├── CloudUniforms.ts                    # GPU Uniform 缓冲区管理
│   │   │   ├── cloudIntegration.ts                 # Cesium 场景集成（PostProcessStage）
│   │   │   └── composables/useVolumetricCloud.ts   # Vue composable
│   │   │
│   │   ├── PlayerController/                       # 人物漫游控制器
│   │   │   ├── index.js                            # 模块入口（懒加载导出）
│   │   │   ├── usePlayerController.js              # Vue composable（启停/状态/地形碰撞）
│   │   │   ├── playerDefaults.ts                   # 默认配置
│   │   │   ├── playerController.ts                 # 核心控制器类
│   │   │   ├── PlayerGuidePanel.vue                # 键位说明面板
│   │   │   ├── NavGuideHUD.vue                     # 漫游导航 HUD（方向箭头+距离）
│   │   │   ├── NavTargetPicker.vue                 # 导航目标选择器
│   │   │   ├── systems/                            # 子系统
│   │   │   │   ├── AnimationSystem.ts              # 动画状态机（crossfade + 跳跃超时）
│   │   │   │   ├── CameraSystem.ts                 # 相机系统（弹簧平滑 + 避障 + 越肩过渡）
│   │   │   │   ├── InputSystem.ts                  # 键鼠输入管理
│   │   │   │   └── PhysicsSystem.ts                # Rapier 物理碰撞
│   │   │   └── utils/                              # 工具函数
│   │   │       ├── frame.ts                        # ECEF/ENU/Rapier 坐标变换
│   │   │       ├── math.ts                         # lerp + smoothDamp 平滑阻尼
│   │   │       └── terrainHelper.ts                # 地形 provider 检测
│   │   │
│   │   ├── FluidSimulation/                        # 流体模拟（洪水 + 水位动画）
│   │   │   ├── FluidSimulationPanel.vue            # 流体控制面板
│   │   │   └── fluidruntime.js                     # WebGL 流体渲染引擎
│   │   │
│   │   ├── ShallowWater/                           # Three.js 热带浅水场景叠加
│   │   │   ├── ShallowWaterOverlay.vue             # 叠加层组件
│   │   │   ├── shaders/                            # GLSL 着色器
│   │   │   ├── composables/useShallowWater.js      # Three.js 生命周期
│   │   │   └── utils/textures.js                   # 程序化纹理
│   │   │
│   │   ├── composables/                            # Cesium composables
│   │   │   ├── cesiumRuntime.js                    # Cesium CDN 运行时加载
│   │   │   ├── useCesiumBasemapSwitcher.js         # 底图熔断/降级切换
│   │   │   ├── useCesiumBeautify.js                # 场景美化（HDR/FXAA/定向光）
│   │   │   ├── useCesiumCameraEnhanced.js          # 相机增强
│   │   │   ├── useCesiumDataImport.js              # 数据导入
│   │   │   ├── useCesiumFrameRate.js               # FPS 采样
│   │   │   ├── useCesiumHeightSampler.js           # 高度采样
│   │   │   ├── useCesiumInteractions.js            # 交互管理
│   │   │   ├── useCesiumLayers.js                  # 底图/地形/叠加层编排
│   │   │   ├── useCesiumModelManager.js            # 3D 模型管理
│   │   │   ├── useCesiumSceneActions.js            # 场景动作
│   │   │   ├── useCesiumToolModules.js             # 工具面板模块编排
│   │   │   └── useCesiumUrlTracking.js             # URL 追踪
│   │   │
│   │   └── terrain/                                # 自定义地形 Provider
│   │       ├── GeoTerrainProvider.js               # 天地图地形
│   │       ├── ArcGISTerrainProvider.js            # ArcGIS 地形
│   │       ├── GeoWTFS.js                          # WMTS 地形
│   │       └── util.js                             # 工具函数
│   │
│   ├── Chat/ChatPanelContent.vue                   # AI 聊天面板
│   ├── Common/ExtentPicker.vue                     # 框选范围组件
│   ├── Compass/
│   │   ├── CompassControlPanel.vue                 # 罗盘控制面板
│   │   └── PalaceExplanationPanel.vue              # 宫位解释面板
│   ├── ControlsPanel/
│   │   ├── ControlsPanel.vue                       # 总面板入口
│   │   ├── AdministrativeDivisionPanel.vue         # 行政区面板
│   │   ├── DrawPanel.vue                           # 绘制面板
│   │   ├── LogMonitor.vue                          # 日志监控
│   │   ├── MeasurePanel.vue                        # 测量面板
│   │   └── SpatialAnalysisPanel.vue                # 空间分析面板
│   ├── feng-shui-compass-svg/                      # 罗盘 SVG HUD
│   │   ├── feng-shui-compass-svg.vue               # 罗盘主组件
│   │   ├── Explanation/                            # 宫位解释 JSON 数据
│   │   ├── themes/                                 # 5 种主题配置
│   │   └── types/                                  # TypeScript 类型定义
│   ├── Layer/
│   │   ├── TOCPanel.vue                            # TOC 主面板
│   │   ├── LayerPanel.vue                          # TOC 树容器
│   │   ├── TOCTreeItem.vue                         # 递归树节点
│   │   ├── LayerControlPanel.vue                   # 底图控制面板
│   │   ├── LayerPropertiesDialog.vue               # 图层属性弹窗
│   │   ├── AttributeTable.vue                      # 属性表
│   │   └── SharedResourceTreeItem.vue              # 共享资源树节点
│   ├── Map/
│   │   ├── MapContainer.vue                        # 地图容器（能力暴露 + 罗盘 HUD）
│   │   ├── MapControlsBar.vue                      # 底部坐标/缩放工具栏
│   │   ├── MapSwipeController.vue                  # 卷帘对比滑块
│   │   ├── MapDownloader.vue                       # 底图下载面板
│   │   └── MapEasterEgg.vue                        # 彩蛋组件
│   ├── Routing/
│   │   ├── BusPlannerPanel.vue                     # 公交规划
│   │   ├── DrivingPlannerPanel.vue                 # 驾车规划
│   │   └── MapPointPickerCard.vue                  # 地图点选卡片
│   ├── Search/
│   │   ├── LocationSearch.vue                      # 地点搜索
│   │   └── AmapAoiInjectDialog.vue                 # 高德 AOI 注入弹窗
│   ├── Shell/
│   │   ├── TopBar.vue                              # 顶栏
│   │   ├── SidePanel.vue                           # 右侧综合侧栏
│   │   ├── ResizeHandle.vue                        # 可拖拽分割条
│   │   ├── GlobalLoading.vue                       # 全局加载遮罩
│   │   ├── Message.vue                             # 全局消息条
│   │   ├── PersistentAnnouncementBar.vue           # 顶部公告条
│   │   └── MagicCursor.vue                         # 首屏特效
│   ├── Weather/
│   │   ├── WeatherChartPanel.vue                   # 天气可视化主面板
│   │   ├── WeatherLiveCards.vue                    # 实况天气卡片
│   │   └── WeatherForecastTable.vue                # 预报表格
│   └── UserCenter/
│       ├── FloatingAccountPanel.vue                # 用户中心浮层壳
│       ├── AdminControlPanel.vue                   # 管理员控制台
│       ├── ApiKeysManagementPanel.vue              # API 密钥管理
│       ├── ApiManagementPanel.vue                  # API 使用管理
│       └── tabs/
│           ├── OverviewTab.vue                     # 总览标签
│           ├── SecurityTab.vue                     # 安全标签
│           └── PreferencesTab.vue                  # 偏好标签
│
├── composables/                                    # 组合式函数
│   ├── auth/useAuthIdentity.js                     # 认证身份校验
│   ├── Magic/                                      # 首屏视觉特效
│   │   ├── useDelaunay.js
│   │   ├── useFluid.js
│   │   ├── useGravity.js
│   │   ├── useRingExplosion.js
│   │   ├── useSingularity.js
│   │   └── useWave.js
│   ├── dataImport/                                 # 数据导入工具
│   │   ├── rasterUtils.js                          # 栅格工具
│   │   ├── vectorUtils.js                          # 矢量工具
│   │   ├── webglRasterRenderer.js                  # WebGL 栅格渲染
│   │   └── index.js
│   ├── map/                                        # 地图核心 composables
│   │   ├── features/                               # 功能模块（30+ 文件）
│   │   │   ├── basemapLayerFactory.js              # 底图图层工厂
│   │   │   ├── useBasemapLayerBootstrap.js         # 底图初始化
│   │   │   ├── useBasemapResilience.js             # 底图容错与降级
│   │   │   ├── useBasemapSelectionWatcher.js       # 底图选择监听
│   │   │   ├── useBasemapStateManagement.js        # 底图状态批处理
│   │   │   ├── useBasemapSwipe.js                  # 卷帘对比
│   │   │   ├── useBasemapUrlMapping.js             # 底图 URL 映射
│   │   │   ├── useTileHDRendering.js               # 高清渲染开关
│   │   │   ├── useCoordinateSystemConversion.js    # 坐标系转换
│   │   │   ├── useCreateManagedVectorLayer.js      # 托管矢量图层创建
│   │   │   ├── useDataManager.js                   # 数据管理
│   │   │   ├── useDeferredUserLayerApis.js         # 延迟用户图层 API
│   │   │   ├── useDistrictManager.js               # 行政区划管理
│   │   │   ├── useDrawMeasure.js                   # 绘制与测量
│   │   │   ├── useLayerContextMenuActions.js       # 图层右键菜单
│   │   │   ├── useLayerControlHandlers.js          # 图层控制处理
│   │   │   ├── useLayerMetadataNormalization.js    # 图层元数据规范化
│   │   │   ├── useManagedFeatureHighlight.js       # 要素高亮
│   │   │   ├── useManagedFeatureOperations.js      # 要素操作
│   │   │   ├── useManagedFeatureSerialization.js   # 要素序列化
│   │   │   ├── useManagedLayerStyle.js             # 图层样式管理
│   │   │   ├── useMapEventHandlers.js              # 地图事件处理
│   │   │   ├── useMapInteractionPickers.js         # 交互选点
│   │   │   ├── useMapSearchAndCoordinateInput.js   # 搜索与坐标输入
│   │   │   ├── useMapUIEventHandlers.js            # UI 事件处理
│   │   │   ├── useRightDragZoom.js                 # 右键拖拽缩放
│   │   │   ├── useRouteRendering.js                # 路线渲染
│   │   │   ├── useRouteStepInteraction.js          # 路线步骤交互
│   │   │   ├── useRouteStepStyles.js               # 路线步骤样式
│   │   │   ├── useSpatialAnalysis.js               # 空间分析
│   │   │   ├── useStartupTaskScheduler.js          # 启动任务调度
│   │   │   ├── useStartupUrlRestoreGuard.js        # URL 恢复守卫
│   │   │   ├── useUserLayerApiFacade.js            # 用户图层 API 门面
│   │   │   └── index.js
│   │   ├── toc/                                    # TOC 模块
│   │   │   ├── actions/                            # 右键菜单动作
│   │   │   ├── menu/                               # 菜单调度
│   │   │   ├── factory.js
│   │   │   ├── protocol.js
│   │   │   └── index.js
│   │   ├── basemapSystem.js                        # 底图系统入口
│   │   ├── GISCommander.js                         # Agent GIS 功能封装
│   │   ├── interactionHandlers.js                  # 交互处理器
│   │   ├── layerManager.js                         # 图层管理器
│   │   ├── routeService.js                         # 路线服务
│   │   ├── usePositionCodeTool.js                  # p 参数工具
│   │   └── index.js
│   ├── tileSource/                                 # 瓦片源工厂
│   │   ├── types.ts                                # 类型定义
│   │   ├── urlUtils.ts                             # URL 工具
│   │   ├── tileLifecycle.ts                        # 请求生命周期管理
│   │   ├── wmsSource.ts                            # WMS 源创建
│   │   ├── wmtsSource.ts                           # WMTS 源创建
│   │   ├── xyzSource.ts                            # XYZ 源 + 自动检测
│   │   └── index.ts
│   ├── weather/
│   │   ├── useWeatherData.js                       # 天气数据获取
│   │   └── useWeatherCharts.js                     # ECharts 图表渲染
│   ├── useAgentConfig.js                           # Agent 配置共享 composable
│   ├── useMarkdownRenderer.js                      # Agent 对话 Markdown 渲染（marked + hljs + GFM）
│   ├── useErrorHandler.ts                          # 错误处理
│   ├── useGisLoader.ts                             # GIS 加载器
│   ├── useKmzLoader.js                             # KMZ 加载器
│   ├── useLayerDataImport.js                       # 图层数据导入
│   ├── useManagedLayerRegistry.js                  # 托管图层注册
│   ├── useMapState.js                              # OL 地图状态
│   ├── useMapSwipe.ts                              # 卷帘核心逻辑
│   ├── useMapViewUrlState.js                       # 2D/3D URL 状态
│   ├── useMessage.js                               # 全局消息提示
│   ├── useMessageIslandMotion.js                   # 消息动画
│   ├── useSharedResourceLoader.ts                  # 共享资源加载器
│   ├── useStyleEditor.js                           # 样式编辑器
│   ├── useTileSourceFactory.ts                     # 瓦片源工厂 barrel
│   ├── useUserLayerActions.js                      # 用户图层动作
│   └── useUserLocation.js                          # 用户定位
│
├── config/env.ts                                   # 环境变量集中管理
│
├── constants/                                      # 常量配置
│   ├── basemap/
│   │   ├── basemapConfig.ts                        # 图源定义 + 预设配置
│   │   ├── basemapResolver.ts                      # 解析逻辑
│   │   ├── sourceDescriptors.ts                    # 引擎无关图层源描述符
│   │   ├── cesiumProviderFactory.ts                # Cesium ImageryProvider 工厂
│   │   └── index.ts
│   ├── agentToolsSchema.js                         # Agent Function Calling 工具声明
│   ├── index.js
│   ├── mapStyles.js                                # 地图样式常量
│   └── tileSourceAdapters.ts                       # 非标准瓦片源适配器
│
├── router/
│   ├── index.js                                    # 路由与守卫
│   └── lazyHomeViewLoader.js                       # HomeView 二段式懒加载
│
├── services/
│   ├── agent/AgentExecutor.js                      # Agent 响应拦截与工具调用
│   ├── compass/
│   │   ├── index.js
│   │   └── urlState.ts                             # 罗盘 URL 状态编解码
│   ├── CompassManager.ts                           # 罗盘管理器
│   ├── DistrictManager.ts                          # 行政区划管理器
│   ├── auth.js                                     # 鉴权工具
│   ├── runtimeMapTokens.js                         # 运行时地图 token 池
│   ├── userLocationContext.js                      # 用户定位上下文
│   └── userPositionCache.js                        # 用户位置缓存
│
├── stores/                                         # Pinia 状态管理
│   ├── layer/
│   │   ├── layerHelpers.ts                         # 图层工具函数
│   │   ├── layerTreeBuilder.ts                     # 图层树构建器
│   │   └── index.ts
│   ├── index.ts
│   ├── useAppStore.ts                              # 全局应用状态
│   ├── useAttrStore.ts                             # 属性表状态
│   ├── useAuthStore.ts                             # 鉴权状态
│   ├── useChatStore.ts                             # Chat 状态
│   ├── useCompassStore.ts                          # 罗盘状态
│   ├── useDownloadStore.ts                         # 下载任务状态
│   ├── useFeatureStyleStore.ts                     # 要素高亮样式
│   ├── useLayerStore.ts                            # 图层状态
│   ├── useSwipeConfigStore.ts                      # 卷帘配置
│   ├── useThemeStore.ts                            # 主题状态
│   ├── useTOCStore.ts                              # TOC 元数据状态
│   ├── useUrlParamStore.ts                         # URL 参数管理
│   ├── useUserPreferencesStore.ts                  # 用户偏好
│   └── useWeatherStore.ts                          # 天气状态
│
├── data/goldenSoupQuotes.js                        # 励志语录数据（懒加载）
│
├── utils/                                          # 工具函数
│   ├── abortManager.js                             # 请求中断管理器
│   ├── coordTransform.js                           # 坐标转换（GCJ-02/WGS84）
│   ├── coordinateFormatter.js                      # 坐标格式化
│   ├── coordinateInputHandler.js                   # 坐标输入处理
│   ├── crsUtils.js                                 # CRS 检测与注册
│   ├── drawTransitRoute.ts                         # 公交路线绘制
│   ├── driveXmlParser.ts                           # 驾车路线 XML 解析
│   ├── explanationLookup.ts                        # 罗盘宫位解释查询
│   ├── labelValidator.ts                           # 标签校验
│   ├── layerExportService.js                       # 图层导出服务
│   ├── loadTiandituSdk.js                          # 天地图 SDK 加载
│   ├── normalize.ts                                # 二值标记规范化
│   ├── pathUtils.js                                # 路径工具
│   ├── textDecoder.js                              # 文本解码
│   ├── themeExplanationMapper.ts                   # 主题-解释文件映射
│   ├── tifUtils.js                                 # TIF 工具
│   ├── transitRouteBuilder.js                      # 路线渲染数据构建
│   ├── vectorWorkerUtils.js                        # 矢量 Worker 工具
│   ├── index.js
│   ├── amapRectangle.js                            # 高德矩形范围解析
│   ├── biz/index.js                                # 业务工具 barrel
│   ├── echarts/
│   │   ├── cesiumFxRuntime.js                      # Cesium 图表运行时
│   │   └── weatherRuntime.js                       # 天气图表运行时
│   ├── geo/index.js                                # CRS barrel
│   ├── gis/                                        # GIS 工具库
│   │   ├── parsers/
│   │   │   ├── kmlParser.ts                        # KML/KMZ 解析
│   │   │   ├── kmlStyleParser.js                   # KML 样式解析
│   │   │   ├── shpParser.ts                        # Shapefile 解析
│   │   │   ├── tifLoader.ts                        # GeoTIFF 加载
│   │   │   ├── dbfParser.ts                        # DBF 解析
│   │   │   ├── amapAoiParser.js                    # 高德 AOI 解析
│   │   │   └── universalAmapParser.js              # 通用高德解析
│   │   ├── archiveProcessor.js                     # 归档解包
│   │   ├── batchProcessor.js                       # 批量数据分类
│   │   ├── crs-engine.ts                           # CRS 引擎
│   │   ├── crsAware.js                             # CRS 感知层
│   │   ├── dataDispatcher.js                       # 数据格式分发
│   │   ├── decompressFile.js                       # ZIP 解压
│   │   ├── decompressor.ts                         # 通用解压器
│   │   ├── deferredGisAssets.js                    # 延迟 GIS 资源
│   │   ├── deferredGisWarmupLauncher.js            # GIS 预热启动
│   │   ├── loadJsZip.ts                            # JSZip 动态加载
│   │   ├── mapRuntimeDeps.js                       # OL 运行时依赖
│   │   └── shpPacketBuilder.js                     # SHP 包构建
│   ├── io/index.js                                 # GIS IO barrel
│   ├── map/
│   │   ├── featureKey.js                           # FeatureKey 复合主键
│   │   └── viewScaleConverter.js                   # OL zoom ↔ Cesium height 换算
│   ├── ui/
│   │   ├── index.js
│   │   └── loading.js                              # 全局 loading 控制
│   ├── url/
│   │   ├── index.js
│   │   ├── crypto.js                               # URL 参数加解密
│   │   ├── urlConstants.js                         # URL 常量
│   │   └── urlQueryReader.js                       # hash/query 参数统一读取
│   └── weather/weatherUtils.js                     # 天气工具函数
│
├── views/
│   ├── HomeView.vue                                # 主页面
│   ├── RegisterView.vue                            # 注册/登录
│   ├── NotFoundView.vue                            # 404 页面
│   ├── TermsOfService.vue                          # 服务条款
│   ├── PrivacyPolicy.vue                           # 隐私政策
│   └── home/
│       ├── index.ts
│       ├── useDistrictLayer.ts                     # 行政区划图层
│       ├── useLayerOperations.ts                   # 图层操作
│       └── useSidePanel.ts                         # 侧边栏逻辑
│
└── workers/                                        # Web Worker
    ├── tiffWorker.js                               # TIF 解码 Worker
    └── shpWorker.js                                # Shapefile 解析 Worker
```

---

## 📜 版本记录

### V3.3.16 (2026-07-02) — GPS 定位授权逻辑修复

- 🐛 **修复定位授权逻辑**：仅当用户明确授权 GPS 定位（`source === 'gps'`）时，才在 URL 中设置 `loc=1` 并将坐标编码写入 `p` 参数
- 🐛 **IP 定位不再写入 `loc=1` 和 `p` 参数**：IP 定位仅保留全局定位上下文供内部使用
- 🔧 **`useUserLocation.js::markLocationSuccessFlagInUrl()`**：新增 `source` 参数，仅 GPS 定位时写入 `loc=1`
- 🔧 **`useMapState.js`**：重构定位授权状态解析逻辑，新增 `hasGpsAuthorization` / `urlHasLocFlag` 字段

详见 [`Docs/26-07/26-07-02/2026-07-02-gps-location-auth-fix.md`](../Docs/26-07/26-07-02/2026-07-02-gps-location-auth-fix.md)

### V3.3.15 (2026-06-29) — GPU 风场粒子可视化集成（cesium-wind-layer）

- 🆕 **GPU 风场粒子可视化**：集成 `cesium-wind-layer`，WebGL 2 ComputeCommand + GLSL 300 es 着色器驱动的高性能风场粒子动画
- 🆕 **wind-core 模块**：10 个核心 TS 源文件，含 GPU 计算管线（3 ComputeCommand）+ 渲染管线（DrawCommand）+ Runge-Kutta 二阶积分
- 🆕 **useWindLayer Composable** + **windLayerController lil-gui 模块** + **windSampleData 示例数据**
- 🔧 **Cesium Shim 扩展**：新增 28 个 Cesium API 导出

### V3.3.14 (2026-06-29) — Bug 修复 + TIF 渲染优化 + CesiumContainer Code Review

- 🐛 修复"下载底图"按钮跳转、标注功能（4 项）、TOC 缓存系统（3 项）、图层移除后 TOC 不更新
- 🚀 **单波段 TIF 渲染范围优化**：`detectDataRange()` 智能 nodata 检测（哨兵 3σ + GAP 离群）
- 🔍 **CesiumContainer.vue Code Review 修复（7 项）**：体积云清理解构错误、大气双写冲突、重试路径泄漏等

详见 [`Docs/06-29/`](../Docs/06-29/) 目录

### V3.3.13 (2026-06-28) — Agent Markdown 渲染优化 + LLM 参数动态配置管理

- 🆕 **代码语法高亮**：highlight.js（core + 18 语言），github-dark-dimmed 主题
- 🆕 **GFM 任务列表** + **思考面板增强**
- ♻️ **composable 化**：`useMarkdownRenderer.js`，ChatPanelContent.vue 精简 ~80 行
- 🆕 **LLM 参数动态配置**：管理员后台可修改所有 Agent 参数，修改后无需重启即时生效

详见 [`Docs/26-06/26-06-28/`](../Docs/26-06/26-06-28/)

### V3.3.12 (2026-06-27) — PlayerController 全面优化 + 体积云模块重构 + 洪水模拟 + 漫游导航

- 🆕 **动画混合**：crossfade 150ms 过渡 + 跳跃超时保护 + 输入哈希去z-ai/glm-5.2重
- 🆕 **移动手感**：smoothDamp 加速 + 空中控制衰减 + 跳跃速度叠加 + 落地缓冲
- 🆕 **相机平滑**：弹簧时间 smoothDamp + 越肩视角过渡 + 碰撞恢复优化
- 🆕 **体积云独立模块** (`Cloud/`)：TypeScript 重构，4 文件提取
- 🆕 **洪水模拟**：requestAnimationFrame 水位自动上涨 + 动态速度滑块
- 🆕 **漫游导航指引**：NavGuideHUD + NavTargetDialog + 三种目标来源

详见 [`Docs/26-06/26-06-27/`](../Docs/26-06/26-06-27/)

### V3.3.11 (2026-06-26) — 人物漫游控制器集成（第一/第三人称 + Rapier 物理碰撞）

- 🆕 **PlayerController 模块**：12 个源文件，核心控制器 + Rapier 物理 + 动画/相机/输入系统
- 🆕 **第一/第三人称切换** + **飞行模式** + **PlayerGuidePanel 键位说明**
- 🆕 **Cesium ESM 垫片** (`cesium-shim.js`)：桥接 CDN Cesium 与 npm ESM 导入
- 🐛 **修复 ArcGIS 地形无法识别**：新增 `ArcGISTerrainProvider` 增强包装器

详见 [`Docs/26-06/26-06-26/2026-06-26-player-controller-integration.md`](../Docs/26-06/26-06-26/2026-06-26-player-controller-integration.md)

### V3.3.10 (2026-06-26) — 大气系统清理 + 场景美化 + 热带浅水 + Tellux 模块移植

- 🗑️ **删除 atmosphere 目录**（14 个文件）+ 旧 `Clouds/` 目录（12 个文件）
- 🆕 **useCesiumBeautify.js**：HDR + PBR_NEUTRAL 色调映射 + FXAA + 定向光
- 🆕 **ShallowWater/**：Three.js 热带浅水场景叠加（焦散/折射/体积云/闪电）
- 🆕 **大气高度阈值**：相机低于 800m 自动关闭大气增强

详见 [`Docs/26-06/26-06-26/`](../Docs/26-06/26-06-26/)

### V3.3.9 (2026-06-26) — 大气 LUT 纹理集成 + TAAU 时序上采样 + BSM Shadow TAA + 模块卡片 UI 清理

- 🆕 TAAU 16x 上采样 + BSM Shadow TAA 时序抗锯齿 + 质量预设 ultra 档位
- 🧹 CesiumToolPanel 清理 ~200 行废弃 CSS + 模块卡片视觉增强
- 🐛 Code Review 三轮修复（30 个问题）+ 体积云性能优化（阴影 -55%、LOD -65%）
- 🐛 修复 Cesium → OL 图层同步 ID 类型不匹配

详见 [`Docs/26-06/26-06-26/`](../Docs/26-06/26-06-26/)

### V3.3.8 (2026-06-19~22) — Cesium 数据导入 + 底图预设统一 + 要素高亮 Pinia 化

- 🆕 **Cesium 数据导入**：GeoJSON/KML/KMZ/SHP/GLB/GLTF/CZML/3D Tiles，支持文件选择 + 拖拽上传
- 🆕 **底图预设统一接入**：`sourceDescriptors.ts` + `cesiumProviderFactory.ts`，OL/Cesium 共享 `BASEMAP_PRESETS`
- 🆕 **Cesium OSM Buildings + Google Photorealistic 3D Tiles** 叠加层
- ✨ **要素高亮 Pinia 集中化**：`useFeatureStyleStore.ts` + Ctrl/Shift 多选 + TOC 联动清理
- ✨ **HTML 属性解析增强**：列索引表头映射 + `<dl>` 定义列表 + `<Null>` 归一化 + 嵌套表格命名空间
- 🐛 Code Review 修复：响应式转发、KMZ BlobURL 泄漏、Dialog 重入残留、高亮 Pinia 化后置修复等

详见 [`Docs/26-06/26-06-19/`](../Docs/26-06/26-06-19/) 与 [`Docs/26-06/26-06-21/`](../Docs/26-06/26-06-21/)

### V3.3.7 (2026-06-19) — 暂存区 Code Review & Bug 修复

- 🐛 **严重 Bug 修复**：`buildShareMarkedUrl` 中 `loc` 提前重置导致分享链接 `p` 参数丢失
- 🐛 TopBar 主题适配、CSS 变量统一、罗盘初始化防循环、定位上下文安全检查

详见 [`Docs/26-06/26-06-19/2026-06-19-staged-code-review.md`](../Docs/26-06/26-06-19/2026-06-19-staged-code-review.md)

### V3.3.6 (2026-06-17~18) — OL / Cesium URL 双向视图同步 + z 参数精度修复

- 🆕 `view=ol|cesium` 引擎参数，刷新/分享可恢复 2D/3D 面板
- 🆕 `viewScaleConverter.js`：OL zoom ↔ Cesium camera height 换算
- 🆕 `urlConstants.js` + `urlQueryReader.js`：URL 统一管理
- 🆕 Cesium `cv=p.<pose>` 姿态-only 编码
- 🐛 Cesium 默认中国中心相机高度 `15,000,000m → 6,000,000m`
- 🐛 z 参数精度链路修复：统一保留两位小数，`formatZParam()` 集中管理

详见 [`Docs/26-06/26-06-18/`](../Docs/26-06/26-06-18/)

### V3.3.5 (2026-06-15) — 运行时地图 Token 池 + 四类 API 备用 Token

- 🆕 `/api/runtime-config/map-tokens` 运行时下发天地图/Cesium 主备 token 池
- 🆕 高德/Agent/天地图/Cesium Ion 四类 API 备用 token 管理面板
- 🆕 2D/3D 视图初始化失败自动尝试备用 token

详见 [`Docs/26-06/26-06-15/`](../Docs/26-06/26-06-15/)

### V3.3.4 (2026-06-14) — Cesium 三维分析控制面板增强 + 掩膜分析（水体模拟）

- 🆕 控制项 `?` 提示气泡 + 图层配置折叠卡片
- 🆕 地形新增 ArcGIS World Elevation 3D + 叠加层新增 Cesium OSM Buildings
- 🆕 水体模拟：动态高程值域外包盒 + 点击点初始水位 + 水位滑杆 + 水色调色板

详见 [`Docs/26-06/26-06-14/`](../Docs/26-06/26-06-14/)

### V3.3.3 (2026-06-11) — 邮箱账号化 + Cesium 统一工具面板 + 水体流体模拟

- 🆕 **邮箱账号体系**：邮箱注册/登录/验证码/密码重置/旧用户绑定迁移
- 🆕 **CesiumToolPanel.vue**：统一控制台（场景导航/高级特效/风场/流体）
- 🆕 **FluidSimulation/**：WebGL 流体渲染引擎 + 控制面板
- 🆕 底图支持天地图/Google 一键切换 + 三种地形源

详见 [`Docs/26-06/26-06-11/`](../Docs/26-06/26-06-11/)

### V3.3.2 (2026-06-09) — 天气组件动态适配 + 风力仪表 UI 优化 + 罗盘 HUD 增强

- 🆕 CSS 容器查询 `container-type: inline-size` + `ResizeObserver` 响应式图表
- 🆕 风力图上下 50% 分区（仪表 + 柱线图）+ 动态值域纵轴
- 🆕 罗盘 HUD 小尺寸专用渲染配置 + 瓦片代理直连优先/后端兜底

详见 [`Docs/26-06/26-06-09/`](../Docs/26-06/26-06-09/)

### V3.3.1 (2026-06-06) — LogMonitor 移动端/Pad 适配修复 + 卷帘移动端控件

- 🐛 TopBar 新增日志监控入口 + LogMonitor 响应式重构（iPad/移动端/极窄屏）
- 🆕 MapSwipeController 移动端控制面板（预设位置按钮 + 滑块控件）

详见 [`Docs/06-06/2026-06-06-log-monitor-mobile-pad-fix.md`](../Docs/06-06/2026-06-06-log-monitor-mobile-pad-fix.md)

### V3.3.0 (2026-06-05) — Chat Function Calling GIS 架构 + 前端 404 兜底页面

- 🆕 **Function Calling 三层降级**：原生 → 文本解析 → 关键词意图检测
- 🆕 `agentToolsSchema.js` / `AgentExecutor.js` / `GISCommander.js`
- 🆕 `stores/useChatStore.ts` Chat 工具调用状态 + `ResizeHandle.vue` 可拖拽分割条
- 🆕 `NotFoundView.vue` 404 兜底页面（赛博朋克风格）

---

### V3.2.x 系列（2026-06-03~04）

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| V3.2.9 | 06-04 | WebGL 栅格渲染器（GPU 并行，TIF 渲染 60-100x 提升）+ Gzip/Brotli 预压缩 |
| V3.2.7 | 06-04 | Agent Chat 默认 AI 专属配置模式（管理员配置/个人 Key/后端代理 三种路由） |
| V3.2.6 | 06-04 | 可复用 ExtentPicker 框选组件（统一下载/分析框选交互） |
| V3.2.5 | 06-04 | 空间分析统一 EPSG:3857 + 渔网分析 + spatial.py 模块化拆分 |
| V3.2.2 | 06-04 | 统一 HTTP 状态码映射（80+ 标准码 + 40+ 高德 infocode）+ 瓦片请求中断修复 |
| V3.2.1 | 06-03 | 邮箱验证码系统 + 密码重置 + 认证安全增强 |
| V3.2.0 | 06-03 | 圆环粒子特效鼠标交互 + GCJ-02 纠偏模块优化 |

### V3.1.x 系列（2026-05-29~06-02）

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| V3.1.9 | 06-02 | 项目文件重构 — 清理死代码（-1.5MB）/去重/拆分/重组（Phase 1-6） |
| V3.1.8 | 05-30 | ESLint 全项目修复（389→0 errors）+ 超大文件拆分（api/backend.js、useTileSourceFactory.ts） |
| V3.1.7 | 05-29 | Code Review 修复（34 项）+ ESLint TypeScript 支持 + 环境变量集中管理 |
| V3.1.6 | 05-29 | 超大文件拆分 + 图层拖拽性能优化（响应速度提升 90%+） |
| V3.1.2 | — | MapDownloader 下载模式选择（native/progressive）+ downloadToken |
| V3.1.0 | — | 在线底图下载模块（MapDownloader + useDownloadStore + 异步任务） |

### V3.0.x 系列（2026-04~05）

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| V3.0.7 | 05-01 | 底图/图层切换性能优化（响应延迟 600ms→300ms，提速 50%）+ 内存泄漏修复 |
| V3.0.6 | 04-30 | 罗盘宫位解释系统 + 5 种主题 JSON 解释库 + 性能重构 |
| V3.0.0 | 04-17 | 前后端分离架构完整版（独立 frontend/backend + Docker + CI/CD） |

### V2.x 系列（2025-11~2026-04）

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| V2.8.8 | 04-17 | ParentId 驱动的上传层次结构 + TOC 协议层中心化 + 右键菜单架构收敛 |
| V2.8.7 | 04-16 | 全局 Loading 遮罩 + 高耗时流程统一反馈 |
| V2.8.6 | 04-15 | 高德 AOI 半自动提取 + POI-AOI 手动导入 + 天气看板图表优化 |
| V2.8.5 | 04-15 | 多源地理服务 API 集成（高德/天地图双引擎）+ URL 参数体系（s/loc/p） |
| V2.8.4 | 04-11 | MapContainer 解耦（Phase 18-25，-221 行）+ 移动端交互升级 |
| V2.8.3 | 04-08 | 标注菜单修复 + 文件结构重构 + 共享资源递归扫描 |
| V2.8.2 | 04-06 | 矢量图层坐标切换（GCJ-02⇔WGS-84）+ 数据轻量导出 + 坐标显示格式优化 |
| V2.8.1 | 04-04 | SHP 导入链路强化（同名 sidecar 组装 + 解析容错 + 编码兼容） |
| V2.8.0 | 04-03 | 图层 TOC 升级为递归树结构 + ArcGIS 风格上下文菜单 |
| V2.7.2 | 04-01 | Cesium 高级视觉组件化（按需加载）+ ECharts 动态交互图表 |
| V2.7.1 | 04-01 | Great Decoupling（深度解耦）：MapContainer 最小化 + 底图配置集中管理 |
| V2.7.0 | 04-01 | MapContainer 组件架构重构：顶部面板分离 + 底部控制条分离 + 状态管理升级 |
| V2.6.1 | 03-26 | 视角初始化优先级优化（URL 参数优先 → 自动定位兜底） |
| V2.6.0 | 03-25 | 交互与 UI 革命：非阻塞通知系统 + 侧边栏逻辑重构 + 万能容器层 |
| V2.5.2 | 03-22 | 地图主文件可维护性整合 + 公交/驾车步骤交互统一 |
| V2.5.1 | 03-22 | 首屏性能优化（动态加载 shpjs/jszip/geotiff）+ 搜索交互优化 |
| V2.5.0 | 03-17 | 工具箱与 TOC 重构 + 样式系统增强 + SHP/ZIP/KMZ 导入 |
| V2.4.1 | 02-01 | 安全性优化（移除硬编码 API Key）+ JSDoc 文档注释 |
| V2.4.0 | 01-14 | AI 智能助手（DeepSeek V2.5 + 流式响应 + 个性化设置） |
| V2.3.2 | 01-12 | SidePanel 延迟加载 + 缩放级别显示 + 完整缩放范围 |
| V2.3.1 | 01-11 | 鹰眼视图（OverviewMap 控件） |
| V2.3.0 | 01-07 | 图层管理增强（拖拽排序 + 多图层叠加 + 自定义 URL）+ 图源库扩充 |
| V2.2.3 | 12-29 | 延迟统计脚本集成（min-enhanced.js） |
| V2.2.2 | 12-29 | 移动端适配 + 用户定位/IP + Lightbox 大图预览 |
| V2.2.1 | 12-12 | CDN 源切换（bootcdn → cdnjs.loli.net） |
| V2.2.0 | 12-12 | 侧边栏折叠/展开 + MagicCursor 鼠标特效 |
| V2.1.0 | 11-30 | 3D 地图集成（CesiumJS）+ 智能地形切换 |
| V2.0.0 | 11-28 | 架构重构：Vue 3 + Vite + Vue Router SPA + 登录/注册 |
| V1.0.0 | 06-13 | 初始发布：OpenLayers 地图展示 + 底图切换 |

---

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

最后更新：2026-07-04
当前版本：V3.3
说明：`GlobalLoading.vue` 已在 `App.vue` 全局挂载，业务组件仅需调用 `showLoading(text)` 与 `hideLoading()` 即可。