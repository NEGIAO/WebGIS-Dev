# 前端文件结构

> 📌 本文件是前端 `frontend/src/` 的**唯一权威目录树**（Single Source of Truth）。
> 返回 [项目结构总览](project-structure.md) · [根 README](../../README.md) · [前端 README](../../frontend/README.md)
>
> ⚠️ **维护规则**：任何前端文件的增删改都必须同步更新本文件，保持树与实际代码一致。

---

```text
frontend/src/
├── api
│   ├── backend
│   │   ├── admin.js  # 管理后台接口
│   │   ├── agent.js  # AI Agent 接口（三通道：后端代理/默认 AI/个人 Key，override 成对透传）
│   │   ├── auth.js  # 鉴权工具
│   │   ├── client.js  # axios 实例、拦截器、错误处理
│   │   ├── index.js  # 路由与守卫
│   │   ├── location.js  # 地理编码/定位接口
│   │   ├── routing.js  # 路线规划接口
│   │   ├── runtime.js  # 前端运行时地图 token 配置接口
│   │   ├── spatial.js  # 空间分析接口
│   │   ├── statistics.js  # 统计/消息/公告
│   │   └── weather.js  # 高德天气业务封装（前端直连；与 backend/weather.js 后端代理同名不同义）
│   ├── backend.js  # ⚠️ DEPRECATED 转发壳（删除后 api/backend 自动解析目录 index，待 git rm）
│   ├── download.js  # 底图下载任务 API
│   ├── geocoding.js  # 天地图/高德地理编码
│   ├── httpStatusMap.js  # HTTP 状态码 + 高德 infocode 统一映射
│   ├── index.js  # 路由与守卫
│   ├── ipLocation.js  # IP 定位 API
│   ├── locationSearch.js  # 地点搜索 API
│   ├── map.js  # 地图业务 API
│   └── weather.js  # 高德天气业务封装（前端直连；与 backend/weather.js 后端代理同名不同义）
├── app
│   ├── HomeView.vue  # 首页（由 lazyHomeViewLoader 加载）
│   ├── NotFoundView.vue  # 404 页面（notFound.* i18n）
│   ├── OAuthCallbackView.vue  # Google/GitHub OAuth 回调会话落地
│   ├── PrivacyPolicy.vue  # 隐私政策
│   ├── RegisterView.vue  # 注册/登录（邮箱 + Google/GitHub OAuth，全量 i18n + 语言切换）
│   └── TermsOfService.vue  # 服务条款
├── assets
│   ├── data
│   │   └── compass-metadata
│   │       ├── compass-data.ts  # 罗盘基础数据
│   │       └── twentyEightConstellations.ts  # 二十八宿数据
│   ├── cesium-tool-theme.css
│   ├── logo.svg
│   ├── theme.css
│   └── toc-theme.css
├── config
│   └── publicRuntime.ts  # 后端/瓦片代理基址单点派生（VITE_* → URL 拼接 helper，禁止硬编码域名）
├── cesium.d.ts  # Cesium CDN 模块类型声明（桥接 TypeScript 与 CDN 全局 window.Cesium）
├── constants
│   └── index.js  # 路由与守卫
├── data
│   └── goldenSoupQuotes.js
├── domains
│   ├── cesium
│   │   ├── components
│   │   │   ├── CesiumAdvancedEffects.vue  # 高级视觉效果（高度雾/HBAO/移轴/大气）
│   │   │   ├── CesiumContainer.vue  # Cesium 容器（底图/地形 + URL 追踪 + 工具面板 + 拖拽导入；场景 Loading i18n）
│   │   │   ├── CesiumDataImportDialog.vue  # GLTF/GLB 模型放置坐标输入弹窗
│   │   │   ├── CesiumToolPanel.vue  # 统一控制面板（场景/数据/特效/风场/流体/漫游）
│   │   │   └── LilGuiControls.vue  # lil-gui 动态控件渲染器
│   │   ├── composables
│   │   │   ├── camera
│   │   │   │   ├── useCesiumAttrViewExtentSync.js  # 相机视域→属性表视图筛选范围（B4）
│   │   │   │   ├── useCesiumCameraEnhanced.js  # 相机增强
│   │   │   │   └── useCesiumSceneActions.js  # 场景动作
│   │   │   ├── core
│   │   │   │   ├── cesiumRuntime.js  # Cesium 运行时加载（await cesiumReady）
│   │   │   │   ├── cesiumStorage.js  # Cesium 状态持久化
│   │   │   │   ├── cesiumTimeSystem.js  # 时间系统
│   │   │   │   └── useCesiumNavigation.js  # 导航控件集成（罗盘/缩放）
│   │   │   ├── dataImport
│   │   │   │   ├── loaders
│   │   │   │   │   ├── czmlLoader.js  # CZML 时序数据加载器
│   │   │   │   │   ├── geojsonLoader.js  # GeoJSON 流式加载器
│   │   │   │   │   ├── geotiffLoader.js  # GeoTIFF 影像加载器
│   │   │   │   │   ├── gltfLoader.js  # GLTF/GLB 三维模型加载器
│   │   │   │   │   ├── kmlLoader.js  # KML/KMZ 格式加载器
│   │   │   │   │   ├── shpLoader.js  # Shapefile 格式加载器
│   │   │   │   │   ├── tilesetLoader.js  # 3D Tiles 数据集加载器
│   │   │   │   │   └── utils.js  # 加载器共享工具函数
│   │   │   │   ├── dataSourceDisplay.js  # 显隐/透明度类型适配器（统一图层管理·句柄侧）
│   │   │   │   ├── geoTiffUtils.js  # GeoTIFF 工具函数
│   │   │   │   ├── importUtils.js  # 导入工具函数
│   │   │   │   ├── useCesiumDataImport.js  # 数据导入主逻辑
│   │   │   │   └── useCesiumDataOpsHandlers.js  # 数据操作事件转发层（面板/拖拽/GLTF 弹窗 → dataImport，自容器抽离）
│   │   │   ├── interaction
│   │   │   │   ├── layers
│   │   │   │   ├── useCesiumFrameRate.js  # FPS 采样
│   │   │   │   ├── useCesiumInteractions.js  # 交互管理
│   │   │   │   └── useCesiumRenderMode.js  # 按需渲染计数器管理器（requestRenderMode，总开关一行可回退）
│   │   │   ├── layers
│   │   │   │   ├── layerUtils.js  # 图层工具函数/常量
│   │   │   │   ├── useCesiumBasemapSwitcher.js  # 底图熔断/降级切换
│   │   │   │   ├── useCesiumLayers.js  # 底图/地形/叠加层编排
│   │   │   │   └── useCesiumUrlTracking.js  # URL 追踪
│   │   │   ├── models
│   │   │   │   └── useCesiumModelManager.js  # 3D 模型管理
│   │   │   ├── scene
│   │   │   │   ├── cesiumAtmosphere.js  # 大气渲染
│   │   │   │   ├── useCesiumBeautify.js  # 场景美化（HDR/FXAA/定向光）
│   │   │   │   └── useCesiumCreditHider.js  # 版权信息隐藏
│   │   │   ├── terrain
│   │   │   │   └── useCesiumHeightSampler.js  # 高度采样
│   │   │   ├── toolModules
│   │   │   │   ├── atmosphereModule.js  # 大气模块（晨昏/雾/HBAO/移轴+Tellux）
│   │   │   │   ├── cloudModule.js  # 体积云模块（性能预设+参数控件）
│   │   │   │   ├── controlsUtils.js  # 控件工具函数（toFiniteNumberOrNull）
│   │   │   │   ├── fluidModule.js  # 流体模块（洪水模拟+水位动画）
│   │   │   │   ├── playerModule.js  # 人物漫游模块（WASD移动+碰撞检测）
│   │   │   │   ├── sceneModule.js  # 场景导航模块（相机飞行+演示数据）
│   │   │   │   ├── shallowWaterModule.js  # 热带浅水模块（三渲二水体+闪电）
│   │   │   │   ├── toolsModule.js  # 空间工具模块（模型管理+增强相机）
│   │   │   │   └── useCesiumToolModules.js  # 工具面板模块编排（核心）
│   │   │   └── index.js  # 路由与守卫
│   │   ├── constants
│   │   │   └── basemapProviderFactory.ts  # Cesium ImageryProvider 工厂
│   │   ├── layers
│   │   │   └── toc-adapters
│   │   │       └── cesiumTocActions.js  # cesium: 前缀动作直调元数据店
│   │   ├── modules
│   │   │   ├── analysis
│   │   │   │   ├── analysisMath.js  # 共享纯函数：拾取兜底/大圆推算/扇形顶点（零 turf 依赖）
│   │   │   │   ├── analysisModule.js  # 声明式 GUI 控件定义（vis*/limit* 前缀 + 按钮动作）
│   │   │   │   ├── heightLimitAnalysis.js  # 限高分析器（ClassificationPrimitive 超限染色 + 截面框 + 自动框选/手绘）
│   │   │   │   ├── index.js  # 路由与守卫
│   │   │   │   └── visibilityAnalysis.js  # 通视分析器（pickFromRay 逐角度射线，可见/遮挡分色）
│   │   │   ├── cloud
│   │   │   │   ├── lib
│   │   │   │   │   ├── AtmosphereFromThreeGeospatial
│   │   │   │   │   │   ├── Shaders
│   │   │   │   │   │   │   ├── bruneton
│   │   │   │   │   │   │   │   ├── common.glsl
│   │   │   │   │   │   │   │   ├── definitions.glsl
│   │   │   │   │   │   │   │   └── runtime.glsl
│   │   │   │   │   │   │   ├── aerialPerspectiveEffect.frag
│   │   │   │   │   │   │   └── sky.glsl
│   │   │   │   │   │   ├── AerialPerspectiveEffect.js  # 空中透视（几何像素散射 + 可靠 depth→ECEF 地面云影）
│   │   │   │   │   │   ├── AtmosphereForClouds.js  # 云专用大气接口
│   │   │   │   │   │   ├── AtmosphereParameters.js  # 大气物理参数
│   │   │   │   │   │   ├── AtmospherePostProcess.js  # 天空大气后处理
│   │   │   │   │   │   ├── LensFlareBloomStage.js  # 镜头光晕 + Bloom
│   │   │   │   │   │   └── PrecomputedTexturesLoader.js
│   │   │   │   │   ├── shaders
│   │   │   │   │   │   └── bundledShaders.js
│   │   │   │   │   ├── CloudShadowFrag.glsl.js  # BSM 着色器内联
│   │   │   │   │   ├── CloudShadowPass.js  # Beer Shadow Map 级联（Cesium clock 同步时间 + 矩阵每帧同步 + 颜色图集双缓冲）
│   │   │   │   │   ├── ShadowResolvePass.js  # BSM 时域 resolve（大运动 history reset + 持久 VBO/location 复用）
│   │   │   │   │   ├── ThreeGeospatialPipeline.js
│   │   │   │   │   ├── assetPaths.js  # 静态资源 URL 常量
│   │   │   │   │   ├── createCloudAtmosphere.js  # 一行创建入口
│   │   │   │   │   ├── getCesium.js  # 全局 Cesium 引用桥接
│   │   │   │   │   ├── index.js  # 路由与守卫
│   │   │   │   │   ├── loadBinThreeGeospatial.js
│   │   │   │   │   └── shaderLoader.js  # 着色器加载器（bundle 优先 + fetch 回退）
│   │   │   │   ├── assetConfig.js  # public/cloud-atmosphere 路径 + 默认参数
│   │   │   │   ├── cloudParamsApply.js  # 面板参数 → pipeline.params 映射（含性能标量键）
│   │   │   │   ├── cloudQualityPresets.js  # 三档性能预设（画质采样 + 大气透视默认值）
│   │   │   │   ├── index.js  # 路由与守卫
│   │   │   │   └── setupCloudIntegration.js  # Vue 桥接：懒加载/销毁/天空快照 + LensFlare 懒创建 + watch 帧级(RAF)合并
│   │   │   ├── fluid-simulation
│   │   │   │   ├── FluidSimulationPanel.vue  # 流体控制面板（高度请求 Loading i18n）
│   │   │   │   └── fluidRuntime.js  # WebGL 流体渲染引擎
│   │   │   ├── player-controller
│   │   │   │   ├── systems
│   │   │   │   │   ├── AnimationSystem.ts  # 动画状态机（crossfade + 跳跃超时）
│   │   │   │   │   ├── CameraSystem.ts  # 相机系统（弹簧平滑 + 避障 + 越肩过渡）
│   │   │   │   │   ├── InputSystem.ts  # 键鼠输入管理
│   │   │   │   │   └── PhysicsSystem.ts  # Rapier 物理碰撞
│   │   │   │   ├── utils
│   │   │   │   │   ├── frame.ts  # ECEF/ENU/Rapier 坐标变换
│   │   │   │   │   ├── gltfGeometry.ts  # glTF 几何提取
│   │   │   │   │   ├── math.ts  # lerp + smoothDamp 平滑阻尼
│   │   │   │   │   ├── mobileControls.ts  # 移动端触控
│   │   │   │   │   └── terrainHelper.ts  # 地形 provider 检测
│   │   │   │   ├── NavGuideHUD.vue  # 漫游导航 HUD（方向箭头+距离）
│   │   │   │   ├── NavTargetPicker.vue  # 导航目标选择器
│   │   │   │   ├── PlayerGuidePanel.vue  # 键位说明面板
│   │   │   │   ├── dynamicObject.ts  # 动态物体
│   │   │   │   ├── index.js  # 路由与守卫
│   │   │   │   ├── playerController.ts  # 核心控制器类
│   │   │   │   ├── playerDefaults.ts  # 默认配置
│   │   │   │   ├── types.ts  # 类型定义
│   │   │   │   └── usePlayerController.js  # Vue composable（启停/状态/地形碰撞）
│   │   │   ├── shallow-water
│   │   │   │   ├── composables
│   │   │   │   │   └── useShallowWater.js
│   │   │   │   ├── shaders
│   │   │   │   │   ├── caustics.glsl.js  # 焦散着色器
│   │   │   │   │   ├── clouds.glsl.js  # 云着色器
│   │   │   │   │   └── waterSurface.glsl.js  # 水面着色器
│   │   │   │   ├── utils
│   │   │   │   │   └── textures.js
│   │   │   │   └── ShallowWaterOverlay.vue  # 叠加层组件
│   │   │   └── wind
│   │   │       ├── Wind2D.js  # 2D 风场封装层（粒子数 clamp）
│   │   │       ├── index.d.ts  # WindLayer 类型声明
│   │   │       ├── index.mjs  # WindLayer 核心（ComputeCommand 管线；监听引用缓存 + percentageChanged 快照恢复）
│   │   │       ├── useCesiumWind.js  # Vue composable
│   │   │       └── windModule.js  # 面板控件定义
│   │   ├── providers
│   │   │   └── terrain
│   │   │       ├── ArcGISTerrainProvider.js  # ArcGIS 地形（LERC Worker 解码 + availability 增强，硬顶 L12）
│   │   │       ├── GeoTerrainProvider.js  # 天地图地形（inflate+编码下放 Worker，失败回退主线程）
│   │   │       ├── GeoWTFS.js  # WMTS 地形
│   │   │       ├── decodeWorkerPool.js  # 通用解码 Worker 池（LERC/天地图共用：Transferable + 失效回退）
│   │   │       ├── geoTerrainDecode.worker.js  # 天地图瓦片解码 Worker（pako inflate + 高程编码）
│   │   │       ├── lercDecode.worker.js  # LERC 瓦片解码 Worker（主线程卡顿修复）
│   │   │       └── util.js  # 工具函数
│   │   ├── stores
│   │   │   ├── cesiumLayerNodeBuilder.ts  # Cesium 元数据 → TOC 树节点映射
│   │   │   └── cesiumLayers.ts  # Cesium 三维数据元数据店
│   │   ├── utils
│   │   │   └── echartsFxRuntime.js  # Cesium 图表运行时
│   │   ├── vendors
│   │   │   └── cesium-navigation
│   │   │       ├── core
│   │   │       │   ├── Utils.js
│   │   │       │   ├── createFragmentFromTemplate.js
│   │   │       │   └── loadView.js
│   │   │       ├── styles
│   │   │       │   └── cesium-navigation.css
│   │   │       ├── svgPaths
│   │   │       ├── viewModels
│   │   │       │   ├── DistanceLegendViewModel.js
│   │   │       │   ├── NavigationControl.js
│   │   │       │   ├── NavigationViewModel.js
│   │   │       │   ├── ResetViewNavigationControl.js
│   │   │       │   ├── UserInterfaceControl.js
│   │   │       │   └── ZoomNavigationControl.js
│   │   │       └── CesiumNavigation.js  # 模块入口
│   │   └── index.js  # 路由与守卫
│   ├── common
│   │   ├── app
│   │   │   ├── home
│   │   │   │   ├── index.ts  # barrel export
│   │   │   │   ├── useDistrictLayer.ts  # 行政区图层管理
│   │   │   │   ├── useLayerOperations.ts  # 图层操作桥接（HomeView→MapContainer）
│   │   │   │   └── useSidePanel.ts  # 侧边面板控制（展开/Tab切换）
│   │   │   ├── stores
│   │   │   │   ├── useAppStore.ts  # 全局应用状态
│   │   │   │   └── useThemeStore.ts  # 主题状态
│   │   │   └── useLocale.js
│   │   ├── chat
│   │   │   ├── agent
│   │   │   │   ├── AgentExecutor.js  # Agent 响应拦截与工具调用
│   │   │   │   ├── MapCommandBus.js  # Agent 地图命令路由器（setMapView/zoomToExtent/switchBasemap 等白名单命令）
│   │   │   │   ├── agentMapPresets.js  # Agent 安全底图白名单（排除 custom/local，Agent 仅提交 presetId）
│   │   │   │   ├── mapCommandAdapters.js  # 坐标/bbox 校验 + OL↔Cesium 视图参数适配
│   │   │   │   └── mapContextSnapshot.js  # 发送时地图状态快照协议（runtime 主源 + URL 安全回退）
│   │   │   ├── components
│   │   │   │   ├── ChatConfigPanel.vue
│   │   │   │   ├── ChatInputBar.vue
│   │   │   │   ├── ChatMessageList.vue
│   │   │   │   ├── ChatPanelContent.vue
│   │   │   │   └── ChatServiceStatus.vue
│   │   │   ├── composables
│   │   │   │   ├── chatIntentFallback.js
│   │   │   │   ├── useAgentConfig.js
│   │   │   │   ├── useAgentMapContext.js
│   │   │   │   ├── useChatAgentConfig.js
│   │   │   │   └── useChatSession.js
│   │   │   ├── constants
│   │   │   │   └── agentToolsSchema.js  # Agent Function Calling 工具声明
│   │   │   └── stores
│   │   │       └── useChatStore.ts  # Chat 状态
│   │   ├── command-bus
│   │   │   └── GISCommander.js
│   │   ├── compass
│   │   │   ├── components
│   │   │   │   ├── CompassControlPanel.vue
│   │   │   │   └── PalaceExplanationPanel.vue
│   │   │   ├── services
│   │   │   │   ├── CompassManager.ts  # 罗盘管理器
│   │   │   │   ├── index.js  # 路由与守卫
│   │   │   │   └── urlState.ts  # 罗盘 URL 状态编解码
│   │   │   ├── stores
│   │   │   │   └── useCompassStore.ts  # 罗盘状态
│   │   │   ├── svg
│   │   │   │   ├── Explanation
│   │   │   │   │   ├── circle_explanation.json
│   │   │   │   │   ├── compass_explanation.json
│   │   │   │   │   ├── dark_explanation.json
│   │   │   │   │   ├── polygon_explanation.json
│   │   │   │   │   └── simple_explanation.json
│   │   │   │   ├── themes
│   │   │   │   │   ├── images
│   │   │   │   │   ├── index.ts  # barrel export
│   │   │   │   │   ├── theme-compass.ts
│   │   │   │   │   ├── theme-crice.ts
│   │   │   │   │   ├── theme-dark.ts
│   │   │   │   │   ├── theme-polygon.ts
│   │   │   │   │   └── theme-simple.ts
│   │   │   │   ├── types
│   │   │   │   │   ├── README.md
│   │   │   │   │   ├── common.ts
│   │   │   │   │   ├── compass.ts
│   │   │   │   │   ├── index.ts  # barrel export
│   │   │   │   │   └── theme.ts
│   │   │   │   └── feng-shui-compass-svg.vue
│   │   │   └── utils
│   │   │       ├── explanationLookup.ts  # 罗盘宫位解释查询
│   │   │       └── themeExplanationMapper.ts  # 主题-解释文件映射
│   │   ├── components
│   │   │   ├── Magic
│   │   │   │   ├── useDelaunay.js
│   │   │   │   ├── useFluid.js
│   │   │   │   ├── useGravity.js
│   │   │   │   ├── useRingExplosion.js
│   │   │   │   ├── useSingularity.js
│   │   │   │   └── useWave.js
│   │   │   └── ExtentPicker.vue  # 地图范围框选（自包含 DragBox）
│   │   ├── data-import
│   │   │   ├── crs
│   │   │   │   ├── coordTransform.js  # 坐标转换（GCJ-02/WGS84）
│   │   │   │   ├── crs-engine.ts  # CRS 引擎
│   │   │   │   ├── crsAware.js  # CRS 感知层
│   │   │   │   └── crsUtils.js  # CRS 检测与注册
│   │   │   ├── parsers
│   │   │   │   ├── amapAoiParser.js  # 高德 AOI 解析
│   │   │   │   ├── dbfParser.ts  # DBF 解析
│   │   │   │   ├── kmlParser.ts  # KML/KMZ 解析
│   │   │   │   ├── kmlStyleParser.js  # KML 样式解析
│   │   │   │   ├── shpParser.ts  # Shapefile 解析
│   │   │   │   ├── tifLoader.ts  # GeoTIFF 加载
│   │   │   │   └── universalAmapParser.js  # 通用高德解析
│   │   │   ├── stores
│   │   │   │   └── useDownloadStore.ts  # 下载任务状态
│   │   │   ├── archiveProcessor.js  # 归档解包
│   │   │   ├── batchProcessor.js  # 批量数据分类
│   │   │   ├── crs-engine.ts  # ⚠️ 转发壳（canonical 在 crs/crs-engine.ts）
│   │   │   ├── crsAware.js  # ⚠️ 转发壳（canonical 在 crs/crsAware.js）
│   │   │   ├── dataDispatcher.js  # 数据格式分发
│   │   │   ├── decompressFile.js  # ZIP 解压
│   │   │   ├── decompressor.ts  # 通用解压器
│   │   │   ├── deferredGisAssets.js  # 延迟 GIS 资源
│   │   │   ├── deferredGisWarmupLauncher.js  # GIS 预热启动
│   │   │   ├── gisUploadPayload.ts  # GIS 载荷构建函数 SSOT（createUploadPayloadsFromFiles/Folder/Entries）
│   │   │   ├── index.js  # 路由与守卫
│   │   │   ├── loadJsZip.ts  # JSZip 动态加载
│   │   │   ├── mapRuntimeDeps.js  # OL 运行时依赖
│   │   │   ├── rasterUtils.js  # 栅格工具（拉伸/NoData/数据范围）
│   │   │   ├── shpPacketBuilder.js  # SHP 包构建
│   │   │   ├── textDecoder.js  # 文本解码
│   │   │   ├── tifUtils.js  # TIF 工具
│   │   │   ├── useGisDropZone.ts  # 通用 GIS 文件拖拽导入 composable（isDragging + 四事件处理器）
│   │   │   ├── useGisLoader.ts
│   │   │   ├── useKmzLoader.js
│   │   │   ├── useSharedResourceLoader.ts
│   │   │   ├── vectorUtils.js  # 矢量工具（文本解码/类型归一）
│   │   │   ├── vectorWorkerUtils.js  # 矢量 Worker 工具
│   │   │   └── webglRasterRenderer.js  # WebGL 栅格渲染
│   │   ├── data-protocol
│   │   │   └── featureKey.js  # 要素唯一键生成
│   │   ├── layer-tree
│   │   │   ├── actions
│   │   │   │   ├── contextActionManager.js  # 右键菜单动作调度
│   │   │   │   ├── exportService.js  # KML 导出
│   │   │   │   ├── layerExportService.js  # 图层导出服务
│   │   │   │   ├── selectionManager.js  # 选择状态管理
│   │   │   │   └── useLayerContextMenuActions.js
│   │   │   ├── components
│   │   │   │   ├── LayerPanel.vue
│   │   │   │   ├── LayerPropertiesDialog.vue  # 图层属性弹窗
│   │   │   │   ├── SharedResourceTreeItem.vue  # 共享资源树节点
│   │   │   │   ├── TOCPanel.vue
│   │   │   │   └── TOCTreeItem.vue  # 递归树节点
│   │   │   ├── menu
│   │   │   │   ├── commandDispatcher.js  # 菜单命令分发
│   │   │   │   └── contextMenu.js  # 右键菜单项构建
│   │   │   ├── stores
│   │   │   │   └── useTOCStore.ts  # TOC 元数据状态
│   │   │   ├── factory.js  # 标准节点工厂
│   │   │   ├── index.js  # 路由与守卫
│   │   │   └── protocol.js  # 图层树协议常量
│   │   ├── map-view
│   │   │   ├── geo
│   │   │   │   └── index.js  # 路由与守卫
│   │   │   ├── services
│   │   │   │   ├── userLocationContext.js  # 用户定位上下文
│   │   │   │   └── userPositionCache.js  # 用户位置缓存
│   │   │   ├── coordinateFormatter.js  # 坐标格式化
│   │   │   ├── units.js  # 单位制工具（距离/面积公英制格式化）
│   │   │   └── useUserLocation.js
│   │   ├── shell
│   │   │   ├── GlobalLoading.vue  # 全局 Loading 遮罩
│   │   │   ├── MagicCursor.vue  # 鼠标特效（粒子跟随）
│   │   │   ├── Message.vue  # 消息提示 UI 组件
│   │   │   ├── PersistentAnnouncementBar.vue  # 持久公告条
│   │   │   ├── ResizeHandle.vue  # 面板拖拽调整手柄
│   │   │   ├── SidePanel.vue  # 侧边面板（Chat/工具箱/路线/罗盘/天气）
│   │   │   ├── TopBar.vue  # 顶栏（Logo + 搜索 + 用户菜单 + 引擎切换）
│   │   │   ├── useMessage.js
│   │   │   └── useMessageIslandMotion.js
│   │   ├── ui
│   │   │   ├── index.js  # 路由与守卫
│   │   │   └── loading.js  # 全局 loading 控制（文案由调用方 t('loading.*')）
│   │   ├── url-state
│   │   │   ├── stores
│   │   │   │   └── useUrlParamStore.ts  # URL 参数管理
│   │   │   ├── crypto.js  # URL 参数加解密
│   │   │   ├── index.js  # 路由与守卫
│   │   │   ├── urlConstants.js  # URL 常量
│   │   │   └── urlQueryReader.js  # hash/query 参数统一读取
│   │   ├── user
│   │   │   ├── components
│   │   │   │   ├── tabs
│   │   │   │   │   ├── OverviewTab.vue
│   │   │   │   │   ├── PreferencesTab.vue
│   │   │   │   │   └── SecurityTab.vue
│   │   │   │   ├── AdminControlPanel.vue
│   │   │   │   ├── ApiKeysManagementPanel.vue
│   │   │   │   ├── ApiManagementPanel.vue
│   │   │   │   └── FloatingAccountPanel.vue
│   │   │   ├── composables
│   │   │   │   └── useAuthIdentity.js
│   │   │   ├── services
│   │   │   │   └── auth.js  # 鉴权工具
│   │   │   └── stores
│   │   │       ├── useAuthStore.ts  # 鉴权状态
│   │   │       └── useUserPreferencesStore.ts  # 用户偏好（语言 SSOT：setLanguagePreference + 本机 key 优先远端）
│   │   ├── utils
│   │   │   ├── abortManager.js  # 请求中断管理器
│   │   │   ├── labelValidator.ts  # 标签校验
│   │   │   ├── normalize.ts  # 二值标记规范化
│   │   │   ├── pathUtils.js  # 路径工具
│   │   │   ├── useErrorHandler.ts
│   │   │   └── useMarkdownRenderer.js
│   │   ├── weather
│   │   │   ├── components
│   │   │   │   ├── WeatherChartPanel.vue
│   │   │   │   ├── WeatherForecastTable.vue
│   │   │   │   └── WeatherLiveCards.vue
│   │   │   ├── composables
│   │   │   │   ├── useWeatherCharts.js
│   │   │   │   └── useWeatherData.js
│   │   │   ├── stores
│   │   │   │   └── useWeatherStore.ts  # 天气状态
│   │   │   └── utils
│   │   │       ├── weatherRuntime.js  # 天气图表运行时
│   │   │       └── weatherUtils.js
│   │   └── index.js  # 路由与守卫
│   └── ol
│       ├── basemap
│       │   ├── composables
│       │   │   ├── basemapLayerFactory.js  # 底图图层工厂（栅格/矢量瓦片自动识别）
│       │   │   ├── useBasemapLayerBootstrap.js  # 底图图层初始化引导
│       │   │   ├── useBasemapSelectionWatcher.js  # 底图选择监听
│       │   │   ├── useBasemapStateManagement.js  # 底图状态管理
│       │   │   └── useBasemapSwipe.js  # 卷帘对比
│       │   ├── constants
│       │   │   ├── basemapConfig.ts  # 图源定义（基址经 publicRuntime 派生；预设已抽离 basemapPresets）
│       │   │   ├── basemapPresets.ts  # 底图预设纯数据（id/label/stack + URL_LAYER_OPTIONS，零 ol 依赖，供登录页入口链安全消费）
│       │   │   ├── basemapResolver.ts  # 解析逻辑（URL_LAYER_OPTIONS 自 presets re-export）
│       │   │   ├── index.ts  # barrel export
│       │   │   └── sourceDescriptors.ts  # 引擎无关图层源描述符（基址经 publicRuntime 派生）
│       │   ├── resilience
│       │   │   └── useBasemapResilience.js  # 底图熔断回退（超时/错误自动切换）
│       │   └── basemapSystem.js  # 底图系统入口（barrel export）
│       ├── components
│       │   ├── AdministrativeDivisionPanel.vue
│       │   ├── AdministrativeDivisionTreeNode.vue
│       │   ├── ControlsPanel.vue
│       │   ├── DrawPanel.vue
│       │   ├── LogMonitor.vue
│       │   ├── MapContainer.vue  # OL 地图容器（底图/图层/绘制/测量/启动任务）
│       │   ├── MapControlsBar.vue  # 地图控件栏（缩放/旋转/重置）
│       │   ├── MapDownloader.vue  # 底图下载器（框选范围 + 任务提交）
│       │   ├── MapEasterEgg.vue  # 地图彩蛋（隐藏交互）
│       │   ├── MapSwipeController.vue  # 卷帘对比控制器
│       │   ├── MeasurePanel.vue
│       │   └── SpatialAnalysisPanel.vue
│       ├── composables
│       │   ├── interactionHandlers.js
│       │   ├── useMapEventHandlers.js
│       │   ├── useMapInteractionPickers.js
│       │   ├── useMapState.js
│       │   ├── useMapSwipe.ts
│       │   ├── useMapSwipeTest.ts
│       │   ├── useMapUIEventHandlers.js
│       │   ├── useRightDragZoom.js
│       │   ├── useRuntimeMapTokenPool.js
│       │   ├── useSharedEntryResolver.js
│       │   └── useTileSourceFactory.ts
│       ├── constants
│       │   └── mapStyles.js  # 地图样式常量
│       ├── data-import
│       │   └── composables
│       │       └── useLayerDataImport.js
│       ├── drawing
│       │   ├── composables
│       │   │   ├── useAdvancedDrawing.js
│       │   │   ├── useDrawMeasure.js  # 绘制测量功能（点/线/面/测距/测面）
│       │   │   ├── useDrawingFeatureStyle.js
│       │   │   └── useGeometryEdit.js
│       │   ├── geometry
│       │   │   └── drawingGeometryUtils.js  # 绘制几何工具函数
│       │   └── registry
│       │       └── drawingToolRegistry.js  # 绘制工具注册表
│       ├── layer
│       │   ├── components
│       │   │   ├── AttributeTable.vue
│       │   │   └── LayerControlPanel.vue
│       │   ├── composables
│       │   │   ├── useCreateManagedVectorLayer.js
│       │   │   ├── useDataManager.js
│       │   │   ├── useDeferredUserLayerApis.js
│       │   │   ├── useLayerControlHandlers.js
│       │   │   ├── useLayerMetadataNormalization.js
│       │   │   ├── useManagedLayerRegistry.js
│       │   │   ├── useTileHDRendering.js
│       │   │   ├── useUserLayerActions.js
│       │   │   └── useUserLayerApiFacade.js
│       │   ├── feature
│       │   │   ├── useManagedFeatureHighlight.js
│       │   │   ├── useManagedFeatureOperations.js
│       │   │   └── useManagedFeatureSerialization.js
│       │   ├── style
│       │   │   ├── useManagedLayerStyle.js
│       │   │   └── useStyleEditor.js
│       │   └── layerManager.js
│       ├── routing
│       │   ├── components
│       │   │   ├── BusPlannerPanel.vue  # 公交路线规划面板
│       │   │   ├── DrivingPlannerPanel.vue  # 驾车路线规划面板
│       │   │   └── MapPointPickerCard.vue  # 地图点选卡片（起点/终点/途经点选择）
│       │   ├── renderers
│       │   │   ├── useRouteRendering.js  # 路线渲染（天地图驾车/公交）
│       │   │   ├── useRouteStepInteraction.js
│       │   │   └── useRouteStepStyles.js
│       │   ├── services
│       │   │   └── routeService.js  # 路线服务（re-export + 步骤交互）
│       │   └── utils
│       │       ├── drawTransitRoute.ts  # 公交路线绘制
│       │       ├── driveXmlParser.ts  # 驾车路线 XML 解析
│       │       └── transitRouteBuilder.js  # 路线渲染数据构建
│       ├── search
│       │   ├── components
│       │   │   ├── AmapAoiInjectDialog.vue  # 高德 AOI 注入弹窗
│       │   │   └── LocationSearch.vue  # 地点搜索组件
│       │   ├── composables
│       │   │   └── useMapSearchAndCoordinateInput.js  # 地图搜索与坐标输入
│       │   └── utils
│       │       └── coordinateInputHandler.js  # 坐标输入处理
│       ├── services
│       │   ├── DistrictManager.ts  # 行政区划管理器
│       │   └── runtimeMapTokens.js  # 运行时地图 token 池
│       ├── spatial-analysis
│       │   └── composables
│       │       ├── useDistrictManager.js
│       │       └── useSpatialAnalysis.js  # 空间分析功能（缓冲区/叠加/泰森等）
│       ├── startup
│       │   ├── useStartupTaskScheduler.js  # 启动任务调度器
│       │   ├── useStartupUrlRestoreGuard.js  # URL 状态恢复守卫
│       │   └── useStartupViewResolver.js  # 视图状态解析
│       ├── stores
│       │   ├── layer
│       │   │   ├── index.ts  # barrel export
│       │   │   ├── layerHelpers.ts  # 图层工具函数
│       │   │   └── layerTreeBuilder.ts  # 图层树构建器
│       │   ├── useAttrStore.ts  # 属性表状态
│       │   ├── useFeatureStyleStore.ts  # 要素高亮样式
│       │   ├── useLayerStore.ts  # 图层状态
│       │   └── useSwipeConfigStore.ts  # 卷帘配置
│       ├── tile-source
│       │   ├── index.ts  # barrel export
│       │   ├── loadTiandituSdk.js  # 天地图 SDK 加载
│       │   ├── tileLifecycle.ts  # 瓦片生命周期（AbortController 中断）
│       │   ├── tileSourceAdapters.ts  # 非标准瓦片源适配器
│       │   ├── types.ts  # 类型定义
│       │   ├── urlUtils.ts  # URL 工具函数
│       │   ├── wmsSource.ts  # WMS 源工厂
│       │   ├── wmtsSource.ts  # WMTS 源工厂（自动识别 capabilities）
│       │   └── xyzSource.ts  # XYZ 源工厂
│       ├── url-state
│       │   ├── useBasemapUrlMapping.js  # 底图 URL 参数映射（domains/ol 版）
│       │   └── useMapViewUrlState.js  # 地图视图 URL 状态（2D/3D 切换）
│       ├── utils
│       │   ├── biz
│       │   │   └── index.js  # 路由与守卫
│       │   ├── amapRectangle.js  # 高德矩形范围解析
│       │   ├── attributeTableCsv.ts  # 属性表 CSV 导出（RFC4180 转义 + BOM + 下载）
│       │   ├── featureKey.js  # 要素唯一键生成
│       │   ├── useCoordinateSystemConversion.js
│       │   ├── usePositionCodeTool.js
│       │   └── viewScaleConverter.js  # OL zoom ↔ Cesium height 换算
│       └── index.js  # 路由与守卫
├── locales
│   ├── core.js  # 同步核心语言包（common + 登录 auth 首屏键 + preferences.language）
│   ├── en-US.js  # 英文完整语言包（懒加载 chunk）
│   └── zh-CN.js  # 中文完整语言包（懒加载 chunk）
├── router
│   ├── index.js  # 路由与守卫
│   └── lazyHomeViewLoader.js  # HomeView 二段式懒加载
├── stores
│   └── index.ts  # barrel export
├── utils
│   └── index.js  # 路由与守卫
├── workers
│   ├── shpWorker.js  # Shapefile 解析 Worker
│   └── tiffWorker.js  # TIF 解码 Worker
├── App.vue  # 根组件
├── cesium-shim.js  # Cesium ESM 垫片（CDN window.Cesium 桥接）
└── main.js  # 应用入口（挂载 Router/Pinia）
```


