# 前端文件结构

> 📌 本文件是前端 `frontend/src/` 的**唯一权威目录树**（Single Source of Truth）。
> 返回 [项目结构总览](project-structure.md) · [根 README](../../README.md) · [前端 README](../../frontend/README.md)
>
> ⚠️ **维护规则**：任何前端文件的增删改都必须同步更新本文件，保持树与实际代码一致。

---

```text
frontend/src/
├── App.vue                                         # 根组件
├── main.js                                         # 应用入口（挂载 Router/Pinia）
├── cesium-shim.js                                  # Cesium ESM 垫片（CDN window.Cesium 桥接）
│
├── api/                                            # API 客户端封装
│   ├── backend.js                                  # ⚠️ DEPRECATED 转发壳（删除后 api/backend 自动解析目录 index，待 git rm）
│   ├── backend/                                    # 后端 API 按业务域拆分
│   │   ├── client.js                               # axios 实例、拦截器、错误处理
│   │   ├── auth.js                                 # 鉴权接口
│   │   ├── location.js                             # 地理编码/定位接口
│   │   ├── weather.js                              # 天气接口
│   │   ├── routing.js                              # 路线规划接口
│   │   ├── agent.js                                # AI Agent 接口（三通道：后端代理/默认 AI/个人 Key，override 成对透传）
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
│   └── weather.js                                  # 高德天气业务封装（前端直连；与 backend/weather.js 后端代理同名不同义）
│
├── assets/                                         # 全局样式与静态数据
│   ├── cesium-tool-theme.css                       # Cesium 工具面板主题变量（--ctp-* 独立暗色域）
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
│   │   │
│   │   ├── Analysis/                                # 三维分析模块（通视 + 限高，独立文件夹 + 统一 GUI 接口）
│   │   │   ├── index.js                             # 模块出口：createAnalysisRuntime 懒实例化/控件分发/销毁
│   │   │   ├── analysisModule.js                    # 声明式 GUI 控件定义（vis*/limit* 前缀 + 按钮动作）
│   │   │   ├── analysisMath.js                      # 共享纯函数：拾取兜底/大圆推算/扇形顶点（零 turf 依赖）
│   │   │   ├── visibilityAnalysis.js                # 通视分析器（pickFromRay 逐角度射线，可见/遮挡分色）
│   │   │   └── heightLimitAnalysis.js               # 限高分析器（ClassificationPrimitive 超限染色 + 截面框 + 自动框选/手绘）
│   │   │
│   │   ├── cesium-navigation/                       # 导航控件（罗盘/缩放/比例尺，原 npm 包内嵌）
│   │   │   ├── CesiumNavigation.js                  # 模块入口
│   │   │   ├── core/Utils.js                        # 相机焦点计算（惰性 getter 防竞态）
│   │   │   ├── core/createFragmentFromTemplate.js    # 模板片段创建
│   │   │   ├── core/loadView.js                     # 视图加载器
│   │   │   ├── viewModels/NavigationViewModel.js    # 导航视图模型
│   │   │   ├── viewModels/NavigationControl.js      # 导航控件
│   │   │   ├── viewModels/ZoomNavigationControl.js  # 缩放控件（惰性 getter 防竞态）
│   │   │   ├── viewModels/ResetViewNavigationControl.js # 重置视图控件
│   │   │   ├── viewModels/DistanceLegendViewModel.js# 比例尺视图模型（惰性 getter 防竞态）
│   │   │   ├── viewModels/UserInterfaceControl.js   # UI 控件基类
│   │   │   ├── svgPaths/                            # SVG 图标路径
│   │   │   └── styles/cesium-navigation.css         # 样式（含高对比度深色主题）
│   │   │
│   │   ├── cesium-wind-layer/                       # GPU 风场粒子（原 npm 包内嵌，纯 ESM：已清理未引用 CJS 产物）
│   │   │   ├── index.mjs                            # WindLayer 核心（ComputeCommand 管线；监听引用缓存 + percentageChanged 快照恢复）
│   │   │   ├── index.d.ts                           # WindLayer 类型声明
│   │   │   ├── Wind2D.js                            # 2D 风场封装层（粒子数 clamp）
│   │   │   ├── useCesiumWind.js                     # Vue composable
│   │   │   └── windModule.js                        # 面板控件定义
│   │   │
│   │   ├── Cloud/                                  # 体积云·大气（移植 cesium-clouds-atmosphere）
│   │   │   ├── index.js                            # 模块统一出口
│   │   │   ├── setupCloudIntegration.js            # Vue 桥接：懒加载/销毁/天空快照 + LensFlare 懒创建 + watch 帧级(RAF)合并
│   │   │   ├── cloudParamsApply.js                 # 面板参数 → pipeline.params 映射（含性能标量键）
│   │   │   ├── cloudQualityPresets.js              # 三档性能预设（BSM 仅节流 raymarch；运动中强制刷新）
│   │   │   ├── assetConfig.js                      # public/cloud-atmosphere 路径 + 默认参数
│   │   │   └── lib/                                # 库核心源码（内联，非 npm）
│   │   │       ├── createCloudAtmosphere.js        # 一行创建入口
│   │   │       ├── ThreeGeospatialPipeline.js      # 云+大气+BSM+TAA 主编排（BSM 运行时启停/重建 + latest-good 纹理同步）
│   │   │       ├── CloudShadowFrag.glsl.js         # BSM 着色器内联
│   │   │       ├── CloudShadowPass.js              # Beer Shadow Map 级联（矩阵每帧同步 + 颜色图集双缓冲 + 运动强制刷新）
│   │   │       ├── ShadowResolvePass.js            # BSM 时域 resolve（大运动 history reset + 持久 VBO/location 复用）
│   │   │       ├── loadBinThreeGeospatial.js       # three Data3DTexture 解析 .bin
│   │   │       ├── shaderLoader.js                 # 着色器加载器（bundle 优先 + fetch 回退）
│   │   │       ├── shaders/bundledShaders.js       # 自动生成的 GLSL 内联 bundle
│   │   │       ├── getCesium.js                    # 全局 Cesium 引用桥接
│   │   │       ├── assetPaths.js                   # 静态资源 URL 常量
│   │   │       ├── index.js                        # lib barrel export
│   │   │       └── AtmosphereFromThreeGeospatial/  # Bruneton 大气管线模块
│   │   │           ├── AtmosphereParameters.js     # 大气物理参数
│   │   │           ├── AtmospherePostProcess.js    # 天空大气后处理
│   │   │           ├── AerialPerspectiveEffect.js  # 空中透视（几何像素散射 + 可靠 depth→ECEF 地面云影）
│   │   │           ├── AtmosphereForClouds.js      # 云专用大气接口
│   │   │           ├── LensFlareBloomStage.js      # 镜头光晕 + Bloom
│   │   │           ├── PrecomputedTexturesLoader.js# Bruneton LUT 加载器
│   │   │           └── Shaders/                    # 大气 + 空中透视 GLSL 源码
│   │   │               ├── aerialPerspectiveEffect.frag
│   │   │               ├── sky.glsl
│   │   │               └── bruneton/
│   │   │                   ├── definitions.glsl
│   │   │                   ├── common.glsl
│   │   │                   └── runtime.glsl
│   │   │
│   │   ├── PlayerController/                       # 人物漫游控制器
│   │   │   ├── index.js                            # 模块入口（懒加载导出）
│   │   │   ├── usePlayerController.js              # Vue composable（启停/状态/地形碰撞）
│   │   │   ├── playerController.ts                 # 核心控制器类
│   │   │   ├── playerDefaults.ts                   # 默认配置
│   │   │   ├── dynamicObject.ts                    # 动态物体
│   │   │   ├── types.ts                            # 类型定义
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
│   │   │       ├── gltfGeometry.ts                 # glTF 几何提取
│   │   │       ├── math.ts                         # lerp + smoothDamp 平滑阻尼
│   │   │       ├── mobileControls.ts               # 移动端触控
│   │   │       └── terrainHelper.ts                # 地形 provider 检测
│   │   │
│   │   ├── FluidSimulation/                        # 流体模拟（洪水 + 水位动画）
│   │   │   ├── FluidSimulationPanel.vue            # 流体控制面板
│   │   │   └── fluidRuntime.js                     # WebGL 流体渲染引擎
│   │   │
│   │   ├── ShallowWater/                           # Three.js 热带浅水场景叠加
│   │   │   ├── ShallowWaterOverlay.vue             # 叠加层组件
│   │   │   ├── shaders/                            # GLSL 着色器
│   │   │   ├── composables/useShallowWater.js      # Three.js 生命周期
│   │   │   └── utils/textures.js                   # 程序化纹理
│   │   │
│   │   ├── composables/                            # Cesium composables（按功能模块分层）
│   │   │   ├── index.js                            # 统一导出入口
│   │   │   ├── core/                               # 核心层（运行时、时间、状态持久化）
│   │   │   │   ├── cesiumRuntime.js                # Cesium 运行时加载（await cesiumReady）
│   │   │   │   ├── cesiumStorage.js                # Cesium 状态持久化
│   │   │   │   ├── cesiumTimeSystem.js             # 时间系统
│   │   │   │   └── useCesiumNavigation.js          # 导航控件集成（罗盘/缩放）
│   │   │   ├── scene/                              # 场景层（大气、美化、版权隐藏）
│   │   │   │   ├── cesiumAtmosphere.js             # 大气渲染
│   │   │   │   ├── useCesiumBeautify.js            # 场景美化（HDR/FXAA/定向光）
│   │   │   │   └── useCesiumCreditHider.js         # 版权信息隐藏
│   │   │   ├── camera/                             # 相机层（增强、场景动作、视域同步）
│   │   │   │   ├── useCesiumAttrViewExtentSync.js  # 相机视域→属性表视图筛选范围（B4）
│   │   │   │   ├── useCesiumCameraEnhanced.js      # 相机增强
│   │   │   │   └── useCesiumSceneActions.js        # 场景动作
│   │   │   ├── layers/                             # 图层层（底图、叠加层、URL追踪）
│   │   │   │   ├── useCesiumLayers.js              # 底图/地形/叠加层编排
│   │   │   │   ├── useCesiumBasemapSwitcher.js     # 底图熔断/降级切换
│   │   │   │   ├── useCesiumUrlTracking.js         # URL 追踪
│   │   │   │   └── layerUtils.js                   # 图层工具函数/常量
│   │   │   ├── interaction/                        # 交互层（鼠标交互、FPS采样、渲染模式）
│   │   │   │   ├── useCesiumInteractions.js        # 交互管理
│   │   │   │   ├── useCesiumFrameRate.js           # FPS 采样
│   │   │   │   └── useCesiumRenderMode.js          # 按需渲染计数器管理器（requestRenderMode，总开关一行可回退）
│   │   │   ├── terrain/                            # 地形/高度采样层
│   │   │   │   └── useCesiumHeightSampler.js       # 高度采样
│   │   │   ├── models/                             # 模型管理层
│   │   │   │   └── useCesiumModelManager.js        # 3D 模型管理
│   │   │   ├── dataImport/                         # 数据导入模块（含工具函数）
│   │   │   │   ├── useCesiumDataImport.js          # 数据导入主逻辑
│   │   │   │   ├── dataSourceDisplay.js            # 显隐/透明度类型适配器（统一图层管理·句柄侧）
│   │   │   │   ├── useCesiumDataOpsHandlers.js     # 数据操作事件转发层（面板/拖拽/GLTF 弹窗 → dataImport，自容器抽离）
│   │   │   │   ├── importUtils.js                  # 导入工具函数
│   │   │   │   ├── geoTiffUtils.js                 # GeoTIFF 工具函数
│   │   │   │   └── loaders/                        # 数据加载器（按格式拆分）
│   │   │   │       ├── utils.js                    # 加载器共享工具函数
│   │   │   │       ├── czmlLoader.js               # CZML 时序数据加载器
│   │   │   │       ├── geojsonLoader.js            # GeoJSON 流式加载器
│   │   │   │       ├── geotiffLoader.js            # GeoTIFF 影像加载器
│   │   │   │       ├── gltfLoader.js               # GLTF/GLB 三维模型加载器
│   │   │   │       ├── kmlLoader.js                # KML/KMZ 格式加载器
│   │   │   │       ├── shpLoader.js                # Shapefile 格式加载器
│   │   │   │       └── tilesetLoader.js            # 3D Tiles 数据集加载器
│   │   │   └── toolModules/                        # 工具面板模块（v3.0.2 扁平化重构）
│   │   │       ├── useCesiumToolModules.js         # 工具面板模块编排（核心）
│   │   │       ├── controlsUtils.js                # 控件工具函数（toFiniteNumberOrNull）
│   │   │       ├── sceneModule.js                  # 场景导航模块（相机飞行+演示数据）
│   │   │       ├── atmosphereModule.js             # 大气模块（晨昏/雾/HBAO/移轴+Tellux）
│   │   │       ├── cloudModule.js                  # 体积云模块（性能预设+参数控件）
│   │   │       ├── fluidModule.js                  # 流体模块（洪水模拟+水位动画）
│   │   │       ├── shallowWaterModule.js           # 热带浅水模块（三渲二水体+闪电）
│   │   │       ├── playerModule.js                 # 人物漫游模块（WASD移动+碰撞检测）
│   │   │       └── toolsModule.js                  # 空间工具模块（模型管理+增强相机）
│   │   │
│   │   └── terrain/                                # 自定义地形 Provider
│   │       ├── GeoTerrainProvider.js               # 天地图地形（inflate+编码下放 Worker，失败回退主线程）
│   │       ├── ArcGISTerrainProvider.js            # ArcGIS 地形（LERC Worker 解码 + availability 增强，硬顶 L12）
│   │       ├── decodeWorkerPool.js                 # 通用解码 Worker 池（LERC/天地图共用：Transferable + 失效回退）
│   │       ├── lercDecode.worker.js                # LERC 瓦片解码 Worker（主线程卡顿修复）
│   │       ├── geoTerrainDecode.worker.js          # 天地图瓦片解码 Worker（pako inflate + 高程编码）
│   │       ├── GeoWTFS.js                          # WMTS 地形
│   │       └── util.js                             # 工具函数
│   │
│   ├── Chat/
│   │   ├── ChatPanelContent.vue                    # AI 聊天面板（编排容器：发送/工具两轮/停止/重新生成）
│   │   ├── ChatConfigPanel.vue                     # 个人 Agent 配置面板（Key/模型下拉/参数）
│   │   ├── ChatServiceStatus.vue                   # 路由模式/服务状态/额度展示条
│   │   ├── ChatMessageList.vue                     # 消息列表（复制/重新生成/时间戳/回到底部/建议词）
│   │   └── ChatInputBar.vue                        # 输入栏（自适应高度/Enter 发送/停止生成）
│   ├── Common/ExtentPicker.vue                     # 框选范围组件
│   ├── Compass/
│   │   ├── CompassControlPanel.vue                 # 罗盘控制面板
│   │   └── PalaceExplanationPanel.vue              # 宫位解释面板
│   ├── ControlsPanel/
│   │   ├── ControlsPanel.vue                       # 总面板入口
│   │   ├── AdministrativeDivisionPanel.vue         # 行政区面板
│   │   ├── AdministrativeDivisionTreeNode.vue      # 行政区树节点
│   │   ├── DrawPanel.vue                           # 富绘制面板（基础/形状/箭头/编辑 + 要素样式）
│   │   ├── LogMonitor.vue                          # 日志监控
│   │   ├── MeasurePanel.vue                        # 测量面板
│   │   └── SpatialAnalysisPanel.vue                # 空间分析面板
│   ├── feng-shui-compass-svg/                      # 罗盘 SVG HUD
│   │   ├── feng-shui-compass-svg.vue               # 罗盘主组件
│   │   ├── Explanation/                            # 宫位解释 JSON 数据（5 种解释）
│   │   ├── themes/                                 # 5 种主题配置 + 预览图
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
│   │   └── MapPointPickerCard.vue                  # 地图点选卡片（含搜索选点）
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
│       ├── FloatingAccountPanel.vue                # 用户中心浮层壳（含第三方账号绑定入口）
│       ├── AdminControlPanel.vue                   # 管理员控制台
│       ├── ApiKeysManagementPanel.vue              # API 密钥管理
│       ├── ApiManagementPanel.vue                  # API 使用管理
│       └── tabs/
│           ├── OverviewTab.vue                     # 总览标签
│           ├── SecurityTab.vue                     # 安全标签（密码修改 + Google/GitHub 绑定）
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
│   │   │   ├── README.md
│   │   │   ├── basemapLayerFactory.js              # 底图图层工厂
│   │   │   ├── useBasemapLayerBootstrap.js         # 底图初始化
│   │   │   ├── useBasemapResilience.js             # 底图容错与降级
│   │   │   ├── useBasemapSelectionWatcher.js       # 底图选择监听
│   │   │   ├── useBasemapStateManagement.js        # 底图状态批处理
│   │   │   ├── useRuntimeMapTokenPool.js           # 运行时天地图 token 池（应用/水合/失效切换重试，自 MapContainer 抽离）
│   │   │   ├── useSharedEntryResolver.js           # 分享链接入口解析 + 启动问候逆地理（自 MapContainer 抽离）
│   │   │   ├── useStartupViewResolver.js           # 启动视图解析：URL 初始视图 + 延迟参数应用（二轮抽离）
│   │   │   ├── useBasemapSwipe.js                  # 卷帘对比
│   │   │   ├── useBasemapUrlMapping.js             # 底图 URL 映射
│   │   │   ├── useTileHDRendering.js               # 高清渲染开关
│   │   │   ├── useCoordinateSystemConversion.js    # 坐标系转换
│   │   │   ├── useCreateManagedVectorLayer.js      # 托管矢量图层创建
│   │   │   ├── useDataManager.js                   # 数据管理
│   │   │   ├── useDeferredUserLayerApis.js         # 延迟用户图层 API
│   │   │   ├── useDistrictManager.js               # 行政区划管理
│   │   │   ├── useDrawMeasure.js                   # 基础绘制与测量
│   │   │   ├── drawingToolRegistry.js              # 高级绘制工具注册表与默认样式
│   │   │   ├── drawingGeometryUtils.js             # 矩形/椭圆/箭头几何纯函数
│   │   │   ├── useDrawingFeatureStyle.js           # 绘制要素级样式与选中高亮
│   │   │   ├── useAdvancedDrawing.js               # 高级 Draw 交互（矩形/椭圆/圆/箭头）
│   │   │   ├── useGeometryEdit.js                  # Select/Modify 几何编辑会话（全矢量图层，支持定向编辑与 Delete 删除）
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
│   │   │   │   ├── contextActionManager.js
│   │   │   │   ├── cesiumTocActions.js             # TOC 动作 Cesium 分流器（cesium: 前缀直调元数据店）
│   │   │   │   ├── exportService.js
│   │   │   │   └── selectionManager.js
│   │   │   ├── menu/                               # 菜单调度
│   │   │   │   ├── commandDispatcher.js
│   │   │   │   └── contextMenu.js
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
│   ├── chat/
│   │   ├── useChatAgentConfig.js                   # Agent 对话配置/路由模式/模型列表/额度 + LLM 三通道调用（后端代理不携带孤立 base_url）
│   │   ├── useChatSession.js                       # 会话消息状态 + localStorage 持久化 + 上下文精简
│   │   └── chatIntentFallback.js                   # GIS 意图识别兜底（定位/切底图正则 + 图源映射，纯函数）
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
│   ├── useMapSwipeTest.ts                          # 卷帘测试
│   ├── useMapViewUrlState.js                       # 2D/3D URL 状态
│   ├── useMessage.js                               # 全局消息提示
│   ├── useMessageIslandMotion.js                   # 消息动画
│   ├── useSharedResourceLoader.ts                  # 共享资源加载器
│   ├── useStyleEditor.js                           # 样式编辑器
│   ├── useTileSourceFactory.ts                     # 瓦片源工厂 barrel
│   ├── useUserLayerActions.js                      # 用户图层动作
│   └── useUserLocation.js                          # 用户定位
│
├── config/                                         # 前端公开运行时配置
│   └── publicRuntime.ts                            # 后端/瓦片代理基址单点派生（VITE_* → URL 拼接 helper，禁止硬编码域名）
│
├── constants/                                      # 常量配置
│   ├── basemap/
│   │   ├── basemapConfig.ts                        # 图源定义（基址经 publicRuntime 派生；预设已抽离 basemapPresets）
│   │   ├── basemapPresets.ts                       # 底图预设纯数据（id/label/stack + URL_LAYER_OPTIONS，零 ol 依赖，供登录页入口链安全消费）
│   │   ├── basemapResolver.ts                      # 解析逻辑（URL_LAYER_OPTIONS 自 presets re-export）
│   │   ├── sourceDescriptors.ts                    # 引擎无关图层源描述符（基址经 publicRuntime 派生）
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
│   │   ├── cesiumLayers.ts                         # Cesium 三维数据元数据店（元数据入店、句柄留场 + adapter）
│   │   ├── cesiumLayerNodeBuilder.ts               # Cesium 记录 → TOC「三维数据」分组节点映射
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
│   ├── index.js
│   ├── abortManager.js                             # 请求中断管理器
│   ├── amapRectangle.js                            # 高德矩形范围解析
│   ├── attributeTableCsv.ts                        # 属性表 CSV 导出（RFC4180 转义 + BOM + 下载）
│   ├── units.js                                    # 单位制工具（距离/面积公英制格式化）
│   ├── biz/index.js                                # 业务工具 barrel
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
│   ├── echarts/
│   │   ├── cesiumFxRuntime.js                      # Cesium 图表运行时
│   │   └── weatherRuntime.js                       # 天气图表运行时
│   ├── geo/index.js                                # CRS barrel
│   ├── gis/                                        # GIS 工具库
│   │   ├── parsers/
│   │   │   ├── kmlParser.ts                        # KML/KMZ 解析
│   │   │   ├── kmlStyleParser.js                   # KML 样式解析
│   │   │   ├── kmlStyleParser.doc.md               # KML 样式文档
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
│   ├── RegisterView.vue                            # 注册/登录（邮箱 + Google/GitHub OAuth）
│   ├── OAuthCallbackView.vue                       # Google/GitHub OAuth 回调会话落地
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
