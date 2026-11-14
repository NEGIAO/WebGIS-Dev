# 前端文件结构

> 📌 本文件是前端 `frontend/src/` 的**唯一权威目录树**（Single Source of Truth）。
> 返回 [项目结构总览](project-structure.md) · [根 README](../../README.md) · [前端 README](../../frontend/README.md)
>
> ⚠️ **维护规则**：任何前端文件的增删改都必须同步更新本文件，保持树与实际代码一致。

---

```text
frontend/src/
├── App.vue
├── App.ts  # 根组件实例层（全局壳组件挂载）
├── cesium-shim.ts  # Cesium ESM 垫片（CDN window.Cesium 桥接）
├── cesium.d.ts  # Cesium CDN 模块类型声明（桥接 TypeScript 与 CDN 全局 window.Cesium）
├── main.ts  # 应用入口（挂载 Router/Pinia）
├── vue-shims.d.ts  # .vue 单文件组件模块声明（.ts 动态 import .vue 组件时使用）
├── shims-modules.d.ts  # 第三方无类型声明模块补充（echarts 等）
├── api/
│   ├── backend.ts  # ⚠️ DEPRECATED 转发壳（删除后 api/backend 自动解析目录 index，待 git rm）
│   ├── blobError.ts  # blob/JSON 错误体解析（后端文案还原；主站 client 与下载节点共用）
│   ├── download.ts  # 底图下载任务 API
│   ├── geocoding.ts  # 天地图/高德地理编码
│   ├── httpStatusMap.ts  # HTTP 状态码 + 高德 infocode 统一映射
│   ├── index.ts  # 路由与守卫
│   ├── ipLocation.ts  # IP 定位 API
│   ├── locationSearch.ts  # 地点搜索 API
│   ├── map.ts  # 地图业务 API
│   ├── weather.ts  # 高德天气业务封装（前端直连；与 backend/weather.ts 后端代理同名不同义）
│   └── backend/
│       ├── admin.ts  # 管理后台接口
│       ├── agent.ts  # AI Agent 接口（三通道：后端代理/默认 AI/个人 Key，override 成对透传）
│       ├── auth.ts  # 鉴权工具
│       ├── client.ts  # axios 实例、拦截器、错误处理
│       ├── index.ts  # 路由与守卫
│       ├── location.ts  # 地理编码/定位接口
│       ├── routing.ts  # 路线规划接口
│       ├── runtime.ts  # 前端运行时地图 token 配置接口
│       ├── spatial.ts  # 空间分析接口
│       ├── statistics.ts  # 统计/消息/公告
│       ├── historicalImagery.ts  # 历史影像（Wayback 等）接口封装
│       └── weather.ts  # 高德天气业务封装（前端直连；与 backend/weather.ts 后端代理同名不同义）
├── app/
│   ├── HomeView.vue  # 首页（由 lazyHomeViewLoader 加载）
│   ├── HomeView.ts  # 首页实例层（地图/图层/面板/认证状态编排）
│   ├── LandingView.vue  # 根路径宣传主页（南师大风格重构：SectionTitle 三件套 + 三环轨道纹样 + 数字滚动 + 三层技术栈卡 + 锚点导航/scrollspy + 移动端全屏菜单；自持滚动容器）
│   ├── LandingView.ts  # 落地页实例层（数据缓存先行 + 数字滚动 + 入场动效 + 锚点 scroll spy + 移动端菜单）
│   ├── NotFoundView.vue  # 404 页面（notFound.* i18n）
│   ├── NotFoundView.ts  # 404 页面实例层（倒计时与返回首页跳转）
│   ├── OAuthCallbackView.vue  # Google/GitHub/Hugging Face OAuth 回调会话落地
│   ├── OAuthCallbackView.ts  # OAuth 回调落地页实例层（token 解析、会话恢复与路由重定向）
│   ├── PrivacyPolicy.vue  # 隐私政策
│   ├── PrivacyPolicy.ts  # 隐私政策页面实例层（返回导航与国际化文案）
│   ├── RegisterView.ts  # 注册页逻辑脚本（从 RegisterView.vue 抽取的 setup 状态与方法，经 render proxy 调用）
│   ├── RegisterView.vue  # 注册/登录（邮箱 + Google/GitHub/Hugging Face OAuth，全量 i18n + 语言切换；背景装饰挂 AuthDecorBackground + AuthGlobeStage）
│   ├── TermsOfService.vue  # 服务条款
│   ├── TermsOfService.ts  # 服务条款页面实例层（返回导航与国际化文案）
│   ├── components/
│   │   ├── AuthDecorBackground.vue  # 认证页装饰层（底纹渐变 + 经纬网 + 等高线×2 + 散点/点位 + 天光 + 双轨异径逆向椭圆，每轨内套「外/中/核」三环综合圆环（同一 PNG 按 124%/96%/90% 缩放落在不同半径）+ 动态 SVG（流动轨迹 / 定位脉冲 / 自绘星座 / 漂浮宇航员：纯白填充 + 白色包边与落地投影，与脚下线框地球形成材质差）+ 光斑×3；`boost` prop 可加速双轨 PNG 圆环；≤768px 整层关闭）
│   │   ├── AuthDecorBackground.ts  # 认证页装饰背景实例层（轨道环加速与星轨动画参数）
│   │   ├── AuthGlobeStage.vue  # 认证页线框地球（3 条 rx 递减椭圆自转伪造球体 + 2 条纬线 ±5° 慢摆 + conic 扫掠光 + 三层脉冲环 + 差速轨道环 20s / 卫星 13s + 九道流星 3.8~6.7s 错峰；线稿走 --brand-primary-rgb alpha 以适配浅色底，整层透明度由 --globe-opacity 单一开关收敛，球底贴屏幕底边（left 9% + bottom 0 + translateX(-50%)，直径 min(230px,24vw,40vh)），≤1100px 收一档、≤768px 整层关闭）
│   │   └── SectionTitle.vue  # 通用节标题三件套（印章 + 衬线标题 + 罗盘水印；LandingView 各节复用）
│   │   └── SectionTitle.ts  # 通用节标题三件套实例层（印章/标题/副标题 Props）
│   └── composables/
│       ├── useAuthVerificationFlows.ts  # 注册/认证验证码与邮件确认倒计时状态机
│       ├── useGoogleOneTapAuth.ts  # Google One Tap 鉴权初始化与 SDK 轮询加载
│       ├── useHomeEngineSwitch.ts  # HomeView 2D/3D 引擎切换与 Agent 运行时状态适配器
│       ├── useHomeLayerAndMapRouting.ts  # HomeView 图层操作桥接、底图与地图路由编排
│       ├── useHomeTocAndAttributeActions.ts  # HomeView TOC 图层、行政区边界与属性表动作分发及访问记录上报
│       ├── useHomePanels.ts  # HomeView 面板互斥开关与响应式布局交互
│       ├── useLandingGithubAndVersion.ts  # 落地页 GitHub 开源指标、Star 趋势图降级与 README 版本号拉取/本地缓存
│       ├── useLazyModules.ts  # CesiumContainer / SidePanel 懒加载 + 重试逻辑（**重试必须复用同一静态字面量 specifier**：带 `?t=${Date.now()}` 的运行时变量 specifier 无法被 Vite 分析，dev 抛 Unknown variable dynamic import、prod 指向不存在路径；瞬态失败判据覆盖 Chromium/Firefox/Safari 三种措辞 + 150ms×n 退避）
│       ├── useRingPatternStyle.ts  # 轨道环旋转纹样 PNG 注入（文档级 `<style>` 承载相对 url()，绕开 scoped CSS 的 /assets/ 解析基准；Landing / 认证页共用，**单图源** `d-bg2_1.png` 桌面与移动共用（原 webp 双图源已合并），图源由 ASSET_BASE_URL 派生）
│       ├── useSpinBoost.ts  # 悬停加速：对已有 CSS 动画改 playbackRate，4× 起手、按停留时长线性递增（1.5/s、16× 封顶）、指数平滑跟随、页面隐藏归位；按动画名 `ring-spin` 过滤，解决「按钮与背景环是兄弟分支，CSS `:hover` 跨不过去」与「改 animation-duration 会跳帧」两个问题
│       ├── useViewTransitionNavigation.ts  # 跨页形变跳转：包 `document.startViewTransition` → `router.push` → `nextTick`（懒加载页必须等挂载，否则新快照是空白）；不支持 / reduced-motion / skip() 时降级为普通跳转
│       └── useRoutePrefetch.ts  # 注册页资源预取：落地页空闲时预取 `RegisterView` chunk、入口 pointerenter/focusin/touchstart 上补会话校验，并向过渡层暴露 `isRegisterRouteReady()`；解决的问题是「过渡回调里等 chunk / `/api/auth/me` 会冻结旧快照」导致的首次点击卡顿
├── assets/
│   ├── cesium-tool-theme.css
│   ├── logo.svg
│   ├── theme.css  # 全局主题令牌（含自托管思源宋体 @font-face + box-sizing 重置 + 移动端基线）
│   ├── toc-theme.css
│   ├── ui-panel-theme.css  # 通用 UI 面板模板（白色面板 + 品牌渐变横幅 + 经纬网格，全局面板观感基准）
│   └── fonts/
│       └── noto-serif-sc-700.woff2  # 思源宋体 700 子集（122 字符，落地页标题用字；相对路径经 Vite 打包）
├── config/
│   └── publicRuntime.ts  # 后端/瓦片代理基址单点派生（VITE_* → URL 拼接 helper，禁止硬编码域名）
├── constants/
│   └── index.ts  # 路由与守卫
├── data/
│   └── goldenSoupQuotes.ts
├── domains/
│   ├── cesium/
│   │   ├── index.ts  # 路由与守卫
│   │   ├── adapter/
│   │   │   ├── index.ts  # barrel export
│   │   │   └── CesiumAdapter.ts  # 三维地图引擎适配器实现（实现 IMapEngineAdapter 协议）
│   │   ├── components/
│   │   │   ├── CesiumAdvancedEffects.vue  # 高级视觉效果（高度雾/HBAO/移轴/大气）
│   │   │   ├── CesiumAdvancedEffects.ts  # 高级视觉效果实例层（高度雾/HBAO/移轴/大气）
│   │   │   ├── CesiumContainer.vue  # Cesium 容器（底图/地形 + URL 追踪 + 工具面板 + 拖拽导入；场景 Loading i18n；属性表改为注入 attrStore 复用 2D 组件）
│   │   │   ├── CesiumContainer.ts  # Cesium 容器实例层（引擎就绪、工具挂载、视图状态导出）
│   │   │   ├── CesiumDataImportDialog.vue  # GLTF/GLB 模型放置坐标输入弹窗
│   │   │   ├── CesiumDataImportDialog.ts  # GLTF/GLB 模型放置坐标弹窗实例层（表单校验与提交）
│   │   │   ├── CesiumDrawMeasurePanel.vue  # 3D 绘制/测量面板（引擎感知：variant=draw 绘制工具+样式 / measure 测量工具；测量项开关、结果读数、记录、GeoJSON 导出；触屏档 pointer:coarse 目标≥40px）
│   │   │   ├── CesiumDrawMeasurePanel.ts  # 3D 绘制/测量面板实例层（工具激活、样式事件、测量记录）
│   │   │   ├── CesiumToolPanel.vue  # 统一控制面板（场景/数据/特效/风场/流体/漫游）
│   │   │   ├── CesiumToolPanel.ts  # 面板实例层（页签/折叠态持久化、WMS 枚举、图标映射、事件派发）
│   │   │   └── LilGuiControls.vue  # lil-gui 动态控件渲染器
│   │   │   └── LilGuiControls.ts  # lil-gui 渲染器实例层（签名重建 / 原地同步）
│   │   ├── composables/
│   │   │   ├── index.ts  # 路由与守卫
│   │   │   ├── camera/
│   │   │   │   ├── useCesiumAttrViewExtentSync.ts  # 相机视域→属性表视图筛选范围（B4）
│   │   │   │   ├── useCesiumCameraEnhanced.ts  # 相机增强
│   │   │   │   └── useCesiumSceneActions.ts  # 场景动作
│   │   │   ├── core/
│   │   │   │   ├── cesiumRuntime.ts  # Cesium 运行时加载（await ensureCesiumLoaded()）
│   │   │   │   ├── useCesiumBootstrap.ts  # Cesium Viewer 创建、地形底图挂载与销毁生命周期
│   │   │   │   ├── cesiumStorage.ts  # Cesium 状态持久化
│   │   │   │   ├── cesiumTimeSystem.ts  # 时间系统
│   │   │   │   ├── useCesiumInfoBoxTheme.ts  # InfoBox 主题化（向描述 iframe 注入白底深字样式，跟随 data-theme 切换）
│   │   │   │   └── useCesiumNavigation.ts  # 导航控件集成（罗盘/缩放）
│   │   │   ├── dataImport/
│   │   │   │   ├── dataSourceDisplay.ts  # 显隐/透明度类型适配器（统一图层管理·句柄侧）
│   │   │   │   ├── display/  # 显隐/透明度拆出的实现分片
│   │   │   │   │   └── vectorColorScaling.ts  # 矢量颜色缩放内核（快照/默认色/动态属性包装）
│   │   │   │   ├── geoTiffUtils.ts  # GeoTIFF 工具函数
│   │   │   │   ├── importUtils.ts  # 导入工具函数
│   │   │   │   ├── dataSourceLifecycle.ts  # 数据源移除/清空（对象级宿主探测优先、type 分支兜底）
│   │   │   │   ├── dataSourceOps.ts  # 外部数据源注册/远程 GLB/定位/3D Tiles 贴地高度
│   │   │   │   ├── gltfReposition.ts  # GLTF 坐标弹窗与位置调整（失败回滚）
│   │   │   │   ├── rasterHeightMesh.ts  # 单波段 GeoTIFF → 高程网格
│   │   │   │   ├── useCesiumCrsRedeclare.ts  # 三维图层「重设源坐标系」：把快照原始数值按新 CRS 重新解释，重建走 loadGeoJSON 以复用贴地/拔高/样式链路（三维侧仅 GeoJSON 留存快照）
│   │   │   │   ├── useCesiumDataImport.ts  # 数据导入主逻辑（移除/清空走对象级宿主探测卸载 detachEntityFromScene，防 type 错配静默残留）
│   │   │   │   ├── useCesiumDataOpsHandlers.ts  # 数据操作事件转发层（面板/拖拽/GLTF 弹窗 → dataImport，自容器抽离）
│   │   │   │   └── loaders/
│   │   │   │       ├── czmlLoader.ts  # CZML 时序数据加载器
│   │   │   │       ├── geojsonLoader.ts  # GeoJSON 流式加载器
│   │   │   │       ├── geotiffLoader.ts  # GeoTIFF 影像加载器
│   │   │   │       ├── gltfLoader.ts  # GLTF/GLB 三维模型加载器
│   │   │   │       ├── kmlLoader.ts  # KML/KMZ 格式加载器
│   │   │   │       ├── shpLoader.ts  # Shapefile 格式加载器
│   │   │   │       ├── tilesetLoader.ts  # 3D Tiles 数据集加载器
│   │   │   │       │   └── tileset/  # 3D Tiles 加载分层
│   │   │   │       │       ├── tilesetMaterial.ts  # 材质模式（白模/高度伪色/自定义 shader，MATERIAL_MODES+applyTilesetMaterial）
│   │   │   │       │       ├── tilesetPath.ts  # 路径与目录递归工具（相对路径/Blob URL 重写/层级推断）
│   │   │   │       │       ├── tilesetLeafSampling.ts  # 瓦片树叶子包围盒基底采样与面积加权分位数计算
│   │   │   │       │       ├── tilesetSampleLoaders.ts  # 内置与 Cesium Ion 样例 3D Tiles 数据集加载器
│   │   │   │       │       └── tilesetTerrainFit.ts  # 地形自适应（贴地 2.0：叶子包围盒×地形中位数配准，fit/refit 契约）

│   │   │   │       └── utils.ts  # 加载器共享工具函数（flyTo/clamp/blobUrl + 数据源句柄对象级宿主探测卸载 detachEntityFromScene）
│   │   │   ├── interaction/
│   │   │   │   ├── useCesiumFrameRate.ts  # FPS 采样
│   │   │   │   ├── useCesiumSceneFacade.ts  # Cesium 场景外观协调（渲染/图层/视角导出统一门面）
│   │   │   │   ├── useCesiumInteractions.ts  # 交互管理
│   │   │   │   └── useCesiumRenderMode.ts  # 按需渲染计数器管理器（requestRenderMode，总开关一行可回退）
│   │   │   ├── layers/
│   │   │   │   ├── layerUtils.ts  # 图层工具函数/常量
│   │   │   │   ├── useCesiumLayerAdapter.ts  # Cesium 宿主图层适配器（叠加层/矢量/3D Tiles 与 Agent 对接）
│   │   │   │   ├── useCesiumBasemapSwitcher.ts  # 底图熔断/降级切换
│   │   │   │   ├── useCesiumLayers.ts  # 底图/地形/叠加层编排
│   │   │   │   ├── imageryProviderBuilders.ts  # Cesium 底图/WMS/ArcGIS/XYZ ImageryProvider 与 ViewModel 构建器
│   │   ├── layers/
│   │   │   ├── arcgisIdentify.ts  # ArcGIS identify 查询适配
│   │   │   ├── customIonLayer.ts  # 自定义 Ion 资源图层管理
│   │   │   ├── i3sWebMercator.ts  # I3S WebMercator 适配
│   │   │   ├── overlayTilesets.ts  # 叠加 3D Tiles 管理
│   │   │   ├── tdtOverlays.ts  # 天地图叠加层
│   │   │   └── terrainManager.ts  # 地形管理器
│   │   │   │   └── useCesiumUrlTracking.ts  # URL 追踪
│   │   │   ├── models/
│   │   │   │   └── useCesiumModelManager.ts  # 3D 模型管理
│   │   │   ├── scene/
│   │   │   │   ├── cesiumAtmosphere.ts  # 大气渲染
│   │   │   │   ├── useCesiumAtmosphereAndHud.ts  # 3D 大气光学开关与相机 HUD 读数同步
│   │   │   │   ├── useCesiumEffectsChart.ts  # 场景特效性能图表采样与 ECharts 生命周期
│   │   │   │   ├── useCesiumBeautify.ts  # 场景美化（HDR/FXAA/定向光）
│   │   │   │   └── useCesiumCreditHider.ts  # 版权信息隐藏
│   │   │   ├── terrain/
│   │   │   │   ├── groundPlacementCapabilities.ts  # 贴地能力**单一事实来源**（GROUND_MODE/REASON + 能力表 + getGroundCapability + VECTOR_GROUND_LOAD_OPTIONS；纯数据零依赖，TOC 与样式页签共用）
│   │   │   │   ├── groundPlacementRegistry.ts  # 类型 → 策略注册表（策略只提供行为，能力从能力表取；findMissingStrategies 供启动自检）
│   │   │   │   ├── groundPlacementService.ts  # 贴地统一门面（applyOnImport/fit/reset/setOffset/getOffset/reapplyAllOnTerrainChange/flushPending；调用方只认门面不认类型）
│   │   │   │   ├── terrainReadiness.ts  # 地形就绪判定与补做队列（唯一 isTerrainEnabled 调用点；地形未就绪时贴地请求按 recordId 去重入队）
│   │   │   │   ├── strategies/
│   │   │   │   │   ├── vectorGroundStrategy.ts  # 矢量贴地策略（geojson/kml/kmz/czml/shp/wayline：实体级 clamp + 恢复原始高程）
│   │   │   │   │   ├── tilesetGroundStrategy.ts  # 3D Tiles 贴地策略（基底采样配准 + modelMatrix 复位 + 基座海拔滑杆，只编排不重写内部实现）
│   │   │   │   │   └── modelGroundStrategy.ts  # glTF 贴地策略（RELATIVE_TO_GROUND + 高程偏移，修正原点在几何中心的半截入土）
│   │   │   │   ├── terrainClampService.ts  # 矢量/实体级贴地原语（isTerrainEnabled / clampEntityToGround / clampDataSourceToGround；仅供 vector 策略与 readiness 调用）
│   │   │   │   ├── terrainSampling.ts  # 地形高度采样统一网关（mostDetailed 优先 + 层级阶梯防御降级）
│   │   │   │   └── useCesiumHeightSampler.ts  # 高度采样增强器（缓存/批量/进度，内部走采样网关）
│   │   │   └── toolModules/
│   │   │       ├── atmosphereModule.ts  # 大气模块（晨昏/雾/HBAO/移轴+Tellux）
│   │   │       ├── cloudModule.ts  # 体积云模块（性能预设+参数控件）
│   │   │       ├── controlsUtils.ts  # 控件工具函数（toFiniteNumberOrNull）
│   │   │       ├── fluidModule.ts  # 流体模块（洪水模拟+水位动画）
│   │   │       ├── playerModule.ts  # 人物漫游模块（WASD移动+碰撞检测）
│   │   │       ├── planarRouteModule.ts  # 面状航线模块（lil-gui 声明式控件+动作，读 planarConfig 响应式单例）
│   │   │       ├── routeFlyModule.ts  # 路线漫游模块（手绘贴地线路+第一/第三人称相机漫游卡片）
│   │   │       ├── sceneModule.ts  # 场景导航模块（相机飞行+演示数据）
│   │   │       ├── shallowWaterModule.ts  # 热带浅水模块（三渲二水体+闪电）
│   │   │       ├── advancedControllers.ts  # 分析/面状航线/路线漫游控制器（懒加载 chunk + 动作分发）
│   │   │       ├── fxState.ts  # 特效与仿真参数状态（大气/云/流体/浅水/人物漫游 + 云↔地面大气互斥）
│   │   │       └── useCesiumToolModules.ts  # 装配层：面板开关 + 模块清单 + 动作/控件路由
│   │   │   ├── draw/
│   │   │       ├── drawEntityFactory.ts  # 绘制成品与测量标注实体构建器（TS：DrawPayload/StyledDescriptor/DrawHandle/MeasureOptions 接口，DrawStyleParams 复用 store 类型；面类 classificationType=TERRAIN + 贴地描边、测高距三线语义配色、方位角箭头+正北虚线；标注锚点：面积重心/线末端/垂线中点/箭头尖端；样式回放跳过语义色类型；baseAlpha 有限性兜底防 NaN 透明度整层不可见）
│   │   │       ├── drawMeasureSpec.ts  # 绘制/测量类型元数据（TS：DrawType/MeasureType/ShapeType/InteractionModel/TypeMeta；DRAW_TYPES/MEASURE_TYPES、三态交互模型 multi|anchor|two-point|single、MIN_POINTS、CircleOutline→Circle 别名、**EDITABLE_TYPES 可编辑判据唯一事实来源**，管理器与 TOC 能力位共用）
│   │   │       ├── scenePicker.ts  # 场景取点工具（pickEarthPoint 两级取点链 pickPosition→pickEllipsoid 兜底 + Cartesian3↔经纬度换算；绘制/测量与路线选点共用）
│   │   │       ├── drawMeasureCalc.ts  # 绘制测量读数计算层（测地线/测面/测高距/方位角载荷组装，Cesium 与测量开关工厂注入）
│   │   │       ├── drawHandleRegistry.ts  # 绘制与测量实体句柄构建、动态预览与 TOC 注册辅助
│   │   │       └── useCesiumDrawMeasure.ts  # 绘制/测量管理器（三态交互状态机：逐点/锚点两点/两点即完成；9 类型 Point/LineString/Polygon/Rectangle/Circle/MeasureDistance/MeasureArea/MeasureHeight/MeasureAzimuth；测距 EllipsoidGeodesic、测面 ENU shoelace、矩形/圆/方位角走 drawGeometry；测量开关实时重算标注；cancelActive 同步摘除预览 Label 防泄漏，removeHandle 带 contains 回执强校验）

│   │   │       └── useCesiumRouteRendering.ts  # P2 公交/驾车路线渲染（消费路线载荷 → 贴地折线/站点，含透明度缩放）
│   │   ├── constants/
│   │   │   └── basemapProviderFactory.ts  # Cesium ImageryProvider 工厂
│   │   ├── layers/
│   │   │   └── toc-adapters/
│   │   │       ├── cesiumAttrDataset.ts  # Cesium 实体集合 → attrStore 数据集（复用 2D AttributeTable；列取并集、字段类型采样推断、逐实体 extent 供视图筛选，5000 行上限）
│   │   │       ├── cesiumTocActions.ts  # cesium: 前缀动作直调元数据店（solo/label/copy/export/批量 全支持；未识别动作 return false 交回通用分发器——历史上 default:true 会吞掉样式页签等新动作）
│   │   │       └── registerCesiumTreePort.ts  # Cesium TOC 端口注册（图层树 ↔ 引擎树桥接）
│   │   ├── services/
│   │   │   └── cesiumRemoteServiceAdapter.ts  # 在线服务注册表 → Cesium ImageryLayer 渲染适配器（WMS/WMTS/XYZ/ArcGIS Provider 构建 + 显隐/叠放同步）
│   │   ├── modules/
│   │   │   ├── analysis/
│   │   │   │   ├── analysisMath.ts  # 共享纯函数：拾取兜底/大圆推算/扇形顶点（零 turf 依赖）
│   │   │   │   ├── analysisModule.ts  # 声明式 GUI 控件定义（vis*/limit* 前缀 + 按钮动作）
│   │   │   │   ├── heightLimitAnalysis.ts  # 限高分析器（ClassificationPrimitive 超限染色 + 截面框 + 自动框选/手绘）
│   │   │   │   ├── index.ts  # 路由与守卫
│   │   │   │   └── visibilityAnalysis.ts  # 通视分析器（pickFromRay 逐角度射线，可见/遮挡分色）
│   │   │   ├── cloud/
│   │   │   │   ├── assetConfig.ts  # public/cloud-atmosphere 路径 + 默认参数
│   │   │   │   ├── cloudParamsApply.ts  # 面板参数 → pipeline.params 映射（含性能标量键）
│   │   │   │   ├── cloudQualityPresets.ts  # 三档性能预设（画质采样 + 大气透视默认值）
│   │   │   │   ├── index.ts  # 路由与守卫
│   │   │   │   ├── setupCloudIntegration.ts  # Vue 桥接：懒加载/销毁/天空快照 + LensFlare 懒创建 + watch 帧级(RAF)合并
│   │   │   │   └── lib/
│   │   │   │       ├── assetPaths.ts  # 静态资源 URL 常量
│   │   │   │       ├── CloudShadowFrag.glsl.ts  # BSM 着色器内联
│   │   │   │       ├── CloudShadowPass.ts  # Beer Shadow Map 级联（Cesium clock 同步时间 + 矩阵每帧同步 + 颜色图集双缓冲）
│   │   │   │       ├── shadowMath.ts  # 阴影矩阵数学工具（lookAt/ortho/multiply/invert/lerp4 等）
│   │   │   │       ├── createCloudAtmosphere.ts  # 一行创建入口
│   │   │   │       ├── getCesium.ts  # 全局 Cesium 引用桥接
│   │   │   │       ├── index.ts  # 路由与守卫
│   │   │   │       ├── loadBinThreeGeospatial.ts
│   │   │   │       ├── shaderLoader.ts  # 着色器加载器（bundle 优先 + fetch 回退）
│   │   │   │       ├── ShadowResolvePass.ts  # BSM 时域 resolve（大运动 history reset + 持久 VBO/location 复用）
│   │   │   │       ├── ThreeGeospatialPipeline.ts
│   │   │   │       │   ├── cloudFragmentShader.ts  # 体积云片元着色器源码
│   │   │   │       ├── AtmosphereFromThreeGeospatial/
│   │   │   │       │   ├── AerialPerspectiveEffect.ts  # 空中透视（几何像素散射 + 可靠 depth→ECEF 地面云影）
│   │   │   │       │   ├── AtmosphereForClouds.ts  # 云专用大气接口
│   │   │   │       │   ├── AtmosphereParameters.ts  # 大气物理参数
│   │   │   │       │   ├── AtmospherePostProcess.ts  # 天空大气后处理
│   │   │   │       │   ├── atmosphereShaders.ts  # 大气着色器源码拼装
│   │   │   │       │   ├── atmosphereShader.ts  # 大气着色器源码（单文件版）
│   │   │   │       │   ├── LensFlareBloomStage.ts  # 镜头光晕 + Bloom
│   │   │   │       │   ├── PrecomputedTexturesLoader.ts
│   │   │   │       │   └── Shaders/
│   │   │   │       │       ├── aerialPerspectiveEffect.frag
│   │   │   │       │       ├── sky.glsl
│   │   │   │       │       └── bruneton/
│   │   │   │       │           ├── common.glsl
│   │   │   │       │           ├── definitions.glsl
│   │   │   │       │           └── runtime.glsl
│   │   │   │       └── shaders/
│   │   │   │           └── bundledShaders.ts  # 内联 shader bundle（运行时唯一真源；由 bundle-shaders.mjs 从 Shaders/ 生成，vite.config 求值期自动再生，CI 有 --check 门禁）
│   │   │   ├── fluid-simulation/
│   │   │   │   ├── fluidShaders.ts  # 流体着色器源码拼装
│   │   │   │   ├── fluidRuntime.ts  # WebGL 流体渲染引擎
│   │   │   │   ├── fluid/fluidRenderPrimitives.ts  # WebGL 自定义绘制/计算图元、帧缓冲与高度图着色器派生
│   │   │   │   ├── terrainHeightMapSampler.ts  # 基于 Cesium 地形采样生成流体高度场矩阵
│   │   │   │   ├── FluidSimulationPanel.vue  # 流体控制面板（高度请求 Loading i18n）
│   │   │   │   └── FluidSimulationPanel.ts  # 流体控制面板实例层（高度请求 Loading i18n）
│   │   │   ├── planar-route/
│   │   │   │   ├── planarRouteController.ts  # 无头运行时控制器（起飞点拾取/测区交互/航线规划/KMZ 导入导出/状态上报，面板直驱）
│   │   │   │   ├── global.d.ts  # window.mainViewer / miniViewer 全局类型声明
│   │   │   │   ├── composables/
│   │   │   │   │   ├── useCesiumRenderer.ts  # 航线预览渲染器（飞行路径实体 + 版本失效控制）
│   │   │   │   │   ├── useKmzImport.ts  # KMZ 导入（解析回填测区/航线/起飞点，useMessage 提示）
│   │   │   │   │   ├── useLineAngle.ts  # 主航线角度交互（滑块 + 方向指示器）
│   │   │   │   │   ├── usePolygonAreaEditor.ts  # 测区多边形面积编辑（顶点拖拽/面积重算）
│   │   │   │   │   └── useRouteCalc.ts  # 航线时长/高度/首航点/拍照数纯函数
│   │   │   │   ├── config/
│   │   │   │   │   ├── cameraConfig.ts  # 相机/画幅参数（M3TD 广角视场角）
│   │   │   │   │   └── planarConfig.ts  # 模块级响应式配置单例（纯数据，顶层禁触 Cesium）
│   │   │   │   ├── img/
│   │   │   │   │   └── start_point.svg  # 起飞点鼠标光标 / 实体图标
│   │   │   │   ├── utils/
│   │   │   │   │   ├── comm.ts  # 通用工具（深拷贝/防抖/序号图标/Blob 下载等）
│   │   │   │   │   ├── drawPolygon.ts  # 测区多边形绘制（顶点拖拽/自相交提示浮层/Esc 重绘）
│   │   │   │   │   ├── frustum.ts  # 相机视锥计算
│   │   │   │   │   ├── lineAngleIndicator.ts  # 航线方向指示器实体
│   │   │   │   │   ├── map.ts  # 地图/坐标工具（takeoffPoint 实体创建）
│   │   │   │   │   ├── obliqueRoute.ts  # 五向倾斜航线规划
│   │   │   │   │   ├── kmz/  # DJI KMZ 文档构建分层
│   │   │   │   │   │   ├── document.ts  # KML/WPML 文档构建（任务配置/动作组/样式/序列化）
│   │   │   │   │   │   ├── routeData.ts  # 选项校验、航点与范围计算、朝向与数值格式化
│   │   │   │   │   │   ├── types.ts  # 对外类型 + 内部数据结构
│   │   │   │   │   │   └── xml.ts  # KML/WPML XML 节点构建原语
│   │   │   │   │   ├── planarKmzExport.ts  # KMZ 导出入口（jszip 打包 wpmz/）
│   │   │   │   │   ├── planarKmzImport.ts  # KMZ 解析（WPML 解包）
│   │   │   │   │   ├── planarLine.ts  # 航线实体构建（弓字形折线 + 专用 handler 起飞点拾取）
│   │   │   │   │   ├── planarRouteKmzIO.ts  # 航线 KMZ 读写编排（面板侧入口）
│   │   │   │   │   ├── planarRoutePlanner.ts  # 航线规划纯计算（正射/倾斜航线生成）
│   │   │   │   │   ├── planarControllerSetup.ts  # 面状航线子处理器装配与数值参数应用辅助
│   │   │   │   │   ├── planarRouteTurn.ts  # 转弯圆角处理（预览）
│   │   │   │   │   ├── planarTerrain.ts  # 地形采样（AGL 仿地 + 最大地形高度）
│   │   │   │   │   ├── wayLine/  # 航线规划算法分层
│   │   │   │   │   │   ├── geometry.ts  # 几何原语（相交/面积/旋转还原/点积叉积/距离）
│   │   │   │   │   │   ├── path.ts  # 单角度方案、区间串接、区内最短路（Dijkstra）
│   │   │   │   │   │   └── scan.ts  # 相机间距、候选角、扫描行与区间排序
│   │   │   │   │   └── wayLineCalc.ts  # 规划入口（类型 + calculatePlanarRoute）
│   │   │   │   └── wpml/
│   │   │   │       ├── actionCodec.ts  # WPML 动作编码（KMZ 导出字节级打包，中文为文件格式载荷非 UI 文案）
│   │   │   │       ├── constants.ts  # WPML 常量
│   │   │   │       ├── orientedShoot.ts  # WPML 定向拍摄动作
│   │   │   │       └── types.ts  # WPML 类型定义
│   │   │   ├── player-controller/
│   │   │   │   ├── dynamicObject.ts  # 动态物体
│   │   │   │   ├── index.ts  # 路由与守卫
│   │   │   │   ├── NavGuideHUD.vue  # 漫游导航 HUD（方向箭头+距离）
│   │   │   │   ├── NavGuideHUD.ts  # 漫游导航 HUD 实例层（方位角箭头与目标距离实时计算）
│   │   │   │   ├── NavTargetPicker.vue  # 导航目标选择器
│   │   │   │   ├── NavTargetPicker.ts  # 导航目标选择器实例层（预设目标切换与地图选点）
│   │   │   │   ├── playerController.ts  # 核心控制器类
│   │   │   │   ├── playerDefaults.ts  # 默认配置
│   │   │   │   ├── PlayerGuidePanel.vue  # 键位说明面板
│   │   │   │   ├── PlayerGuidePanel.ts  # 键位说明面板实例层（展开收起与按键映射展示）
│   │   │   │   ├── types.ts  # 类型定义
│   │   │   │   ├── usePlayerController.ts  # Vue composable（启停/状态/地形碰撞）
│   │   │   │   ├── systems/
│   │   │   │   │   ├── AnimationSystem.ts  # 动画状态机（crossfade + 跳跃超时）
│   │   │   │   │   ├── CameraSystem.ts  # 相机系统（弹簧平滑 + 避障 + 越肩过渡）
│   │   │   │   │   ├── DebugColliderSystem.ts  # 物理碰撞体调试可视化
│   │   │   │   │   ├── InputSystem.ts  # 键鼠输入管理
│   │   │   │   │   ├── physicsDebugGeometry.ts  # 调试几何构建（碰撞体线框）
│   │   │   │   │   └── PhysicsSystem.ts  # Rapier 物理碰撞
│   │   │   │   └── utils/
│   │   │   │       ├── frame.ts  # ECEF/ENU/Rapier 坐标变换
│   │   │   │       ├── gltfGeometry.ts  # glTF 几何提取
│   │   │   │       ├── math.ts  # lerp + smoothDamp 平滑阻尼
│   │   │   │       ├── mobileControls.ts  # 移动端触控
│   │   │   │       ├── playerModelLoader.ts  # 玩家 glTF 模型加载、包围盒归一化缩放与头部世界坐标解算
│   │   │   │       └── terrainHelper.ts  # 地形 provider 检测
│   │   │   ├── route-fly/
│   │   │   │   ├── firstPersonFlyController.ts  # 路线漫游无头控制器（手绘贴地线路/表面三级采样/CZML 时间轴/camera.lookAt 第一·第三人称跟随）
│   │   │   │   ├── routeFlyTimelineAndIo.ts  # 路线漫游三级高程采样、CZML 时间轴构建、相机跟随与路线导入导出
│   │   │   │   └── routeSerialize.ts  # 路线数据序列化（导入/导出与本地持久化）
│   │   │   ├── shallow-water/
│   │   │   │   ├── ShallowWaterOverlay.vue  # 叠加层组件
│   │   │   │   ├── ShallowWaterOverlay.ts  # 热带浅水叠加层实例层（Three.js 渲染画布挂载与销毁）
│   │   │   │   ├── lightning.ts  # 闪电子系统（随机闪络几何 + 曝光脉冲）
│   │   │   │   ├── composables/
│   │   │   │   │   └── useShallowWater.ts  # 热带浅水场景生命周期（Three.js）
│   │   │   │   ├── shaders/
│   │   │   │   │   ├── caustics.glsl.ts  # 焦散着色器
│   │   │   │   │   ├── clouds.glsl.ts  # 云着色器
│   │   │   │   │   └── waterSurface.glsl.ts  # 水面着色器
│   │   │   │   └── utils/
│   │   │   │       └── textures.ts
│   │   │   └── wind/
│   │   │       ├── index.d.ts  # WindLayer 类型声明
│   │   │       ├── index.mjs  # WindLayer 核心（ComputeCommand 管线；监听引用缓存 + percentageChanged 快照恢复）
│   │   │       ├── useCesiumWind.ts  # Vue composable
│   │   │       ├── Wind2D.ts  # 2D 风场封装层（粒子数 clamp）
│   │   │       └── windModule.ts  # 面板控件定义
│   │   ├── providers/
│   │   │   └── terrain/
│   │   │       ├── ArcGISTerrainProvider.ts  # ArcGIS 地形（LERC Worker 解码 + availability 增强，硬顶 L12）
│   │   │       ├── decodeWorkerPool.ts  # 通用解码 Worker 池（LERC/天地图共用：Transferable + 失效回退）
│   │   │       ├── geoTerrainDecode.worker.ts  # 天地图瓦片解码 Worker（pako inflate + 高程编码）
│   │   │       ├── GeoTerrainProvider.ts  # 天地图地形（inflate+编码下放 Worker，失败回退主线程）
│   │   │       ├── lercDecode.worker.ts  # LERC 瓦片解码 Worker（主线程卡顿修复）
│   │   │       └── util.ts  # 工具函数
│   │   ├── stores/
│   │   │   ├── cesiumLayerNodeBuilder.ts  # Cesium 元数据 → TOC 树节点映射（TYPE_LABELS 含 draw/route；sourceType = cesium-draw / cesium-route / cesium-data；矢量类开放 style/label/copyCoordinates/exportLayerData（含 KML）+ soloEvent，贴合地形/恢复高程由 groundPlacementCapabilities 能力表驱动，**编辑要素判据读 drawMeasureSpec.EDITABLE_TYPES + record.shapeType**；坐标系/AOI 显式关闭）
│   │   │   ├── cesiumLayers.ts  # Cesium 三维数据元数据店（OPACITY_SUPPORTED_TYPES 含 draw；MANAGED_CATEGORIES = {'draw','route'} 免于 loadedDataSources 清除；setStyle/setLabelVisible/solo/copyCoordinates/exportData/fitToTerrain/resetTerrainFit/requestAttributeTable/editFeature + isCesiumStyleSupportedType/isCesiumVectorType 类型判据；record 增加 labelVisible/style/shapeType 留痕，registerDrawing 可携带具体几何类型）
│   │   │   └── useDrawMeasureStore.ts  # 3D 绘制/测量面板↔引擎共享状态（measureOptions/style/activeType/drawing/lastResult/records；只存可序列化数据，禁止 Cartesian3/Entity 入店）
│   │   ├── utils/
│   │   │   ├── browserIo.ts  # 浏览器侧文本剪贴与文件落盘（copyTextToClipboard 含非安全上下文 textarea 兜底 / downloadTextFile / sanitizeFileName；绘制面板与 TOC 坐标导出共用）
│   │   │   ├── cesiumLayerSerialization.ts  # Cesium 实体 → 坐标序列化（TS：LayerShape/SerializeMeta/SerializedExport/PropertyTable；point/polyline/polygon/rectangle 反解，动态属性按当前时刻取值；输出 GeoJSON FeatureCollection / CSV / TXT / KML 2.2，并提取属性表数据供 TOC「复制坐标」「导出坐标」「属性表」使用）
│   │   │   ├── drawGeometry.ts  # 绘制/测量纯几何（面积/周长/矩形跨度/圆环/方位角/重心/地面距离；零 Cesium 依赖，便于 tsc 与单测）
│   │   │   └── echartsFxRuntime.ts  # Cesium 图表运行时
│   │   └── vendors/
│   │       └── cesium-navigation/
│   │           ├── CesiumNavigation.ts  # 模块入口
│   │           ├── core/
│   │           │   ├── createFragmentFromTemplate.ts
│   │           │   ├── loadView.ts
│   │           │   └── Utils.ts
│   │           ├── styles/
│   │           │   └── cesium-navigation.css
│   │           ├── svgPaths/
│   │           │   ├── svgCompassGyro.ts
│   │           │   ├── svgCompassOuterRing.ts
│   │           │   ├── svgCompassRotationMarker.ts
│   │           │   └── svgReset.ts
│   │           └── viewModels/
│   │               ├── DistanceLegendViewModel.ts
│   │               ├── NavigationControl.ts
│   │               ├── NavigationViewModel.ts
│   │               ├── ResetViewNavigationControl.ts
│   │               ├── UserInterfaceControl.ts
│   │               └── ZoomNavigationControl.ts
│   ├── common/
│   │   ├── index.ts  # 路由与守卫
│   │   ├── attribute/
│   │   │   ├── useLayerMetadataNormalization.ts  # 公共入口（normalizeHtmlAttributes + feature 工厂）
│   │   │   ├── featureRecords.ts  # 稳定 ID、原始属性抽取、字段配置、单条记录统计
│   │   │   ├── geometry.ts  # 3857 反算、几何类型/范围、要素代表经纬度（禁止 import ol）
│   │   │   ├── htmlAttributes.ts  # 富文本属性（table/dl）解析 + 脚本清洗 + <Null> 归一
│   │   │   ├── layerSnapshot.ts  # 图层元数据补齐 + 属性快照聚合
│   │   │   └── valueUtils.ts  # 克隆/纯对象判定/值类型推断/类型计数/嵌套扁平化
│   │   │   └── stores/
│   │   │       ├── attrStoreHelpers.ts  # 属性表纯计算层（类型/几何范围/签名/字段配置/行构建）
│   │   │       └── useAttrStore.ts  # 属性表状态（跨引擎共享：2D / 3D 共用同一份数据）
│   │   ├── app/
│   │   │   ├── useLocale.ts
│   │   │   ├── visitorStats.ts  # 51.la 访客数据（第三方口径）的纯函数：接口地址 + fetchVisitorStats()（返回 { metrics, updatedAt }，8s 超时、失败返回 null）+ formatVisitorNumber()（千分位/过亿降级）+ formatUpdatedAt()（ISO → 访客本地时区 MM-DD HH:mm）；不持有状态、不做缓存 —— Worker 已输出结构化 JSON，各组件自行 fetch 与渲染
│   │   │   ├── home/
│   │   │   │   ├── index.ts  # barrel export
│   │   │   │   ├── useDistrictLayer.ts  # 行政区图层管理
│   │   │   │   ├── useLayerOperations.ts  # 图层操作桥接（HomeView→MapContainer）
│   │   │   │   └── useSidePanel.ts  # 侧边面板控制（展开/Tab切换）
│   │   │   └── stores/
│   │   │       ├── useAppStore.ts  # 全局应用状态
│   │   │       └── useThemeStore.ts  # 主题状态
│   │   ├── basemap/
│   │   │   ├── basemapPresets.ts  # 底图预设纯数据（BASEMAP_PRESETS + ALL_BASEMAP_PRESETS + URL_LAYER_OPTIONS，零 ol/cesium 依赖，自 ol 域迁入）
│   │   │   ├── basemapOptions.ts  # 底图选项常量 + 公开 1-based URL 图层编号双向 helper
│   │   │   ├── basemapRegistry.ts  # 双引擎底图选择规范化、旧路由兼容与历史年份分组
│   │   │   ├── remoteServices.ts  # 在线服务注册表（wms/arcgis/xyz/wmts 元数据 SSOT：computeLayersParam/renderSignature/parseRsvcNodeId/引擎定位 API 注册）
│   │   │   ├── remoteServiceNodeBuilder.ts  # 注册表记录 → TOC「在线服务」分组节点（folder + 子图层叶子）
│   │   │   ├── remoteServiceTocActions.ts  # rsvc: 前缀 TOC 动作分流器（显隐/子图层勾选/移除/引擎定位直调注册表）
│   │   │   ├── arcgisAttributeQuery.ts  # ArcGIS REST 属性查询（/{layerId}/query 点查 + 多子层合并 + esri 类型映射）
│   │   │   ├── identifyPresentation.ts  # 要素点查结果展示渲染（HTML 构建 + HTML 转义，OL/Cesium 双引擎共用）
│   │   │   ├── catalogProjection.ts  # 图源目录投影（磁盘目录 → 图源目录元数据）
│   │   │   ├── capabilitiesProxy.ts  # 能力文档拉取的后端代理兜底注入器（自签证书/CORS 直连失败时经 /proxy 重试）
│   │   │   ├── wms/  # WMS/ArcGIS 协议适配分层（入口只做编排与缓存）
│   │   │   │   ├── arcgisRest.ts  # ArcGIS REST 元数据/点查/切片与导出模板/WMS 端点探测
│   │   │   │   ├── capabilities.ts  # WMS GetCapabilities XML 解析（图层树/CRS 策略/范围）
│   │   │   │   ├── geoBbox.ts  # 经纬度 bbox 校验与并集、Web 墨卡托换算
│   │   │   │   ├── transport.ts  # Capabilities 文本与点查 JSON 取数通道（超时 + 代理兜底）
│   │   │   │   ├── types.ts  # 服务元信息 WmsServiceInfo 与请求策略契约
│   │   │   │   └── urlDetect.ts  # URL 形态识别、候选端点构建、查询参数工具
│   │   │   ├── wmsService.ts  # WMS/ArcGIS 服务解析入口（解析顺序编排 + 结果缓存）
│   │   │   ├── xyzWmtsCapabilities.ts  # XYZ 行序判定 + WMTS GetCapabilities 轻量解析（纯 JS 零 OL 依赖）
│   │   │   └── useSharedCustomBasemapUrl.ts  # OL/Cesium 共用的 custom/Wayback URL 运行时 SSOT 与本机持久化
│   │   ├── chat/
│   │   │   ├── agent/
│   │   │   │   ├── AgentExecutor.ts  # Agent 响应拦截与工具调用
│   │   │   │   ├── agentMapPresets.ts  # Agent 安全底图白名单（排除 custom/local，Agent 仅提交 presetId）
│   │   │   │   ├── mapCommandAdapters.ts  # Agent 地图指令适配器入口（维持既有导入路径的 re-export）
│   │   │   │   ├── mapCommand/  # 地图命令适配分层
│   │   │   │   │   ├── cesiumAdapter.ts  # Cesium 相机飞行/底图切换/GeoJSON 导入适配
│   │   │   │   │   ├── olAdapter.ts  # OL 视图动画/底图切换/搜索建层适配
│   │   │   │   │   └── shared.ts  # 两引擎共用的坐标/bbox 校验与动画 Promise 包装
│   │   │   │   ├── MapCommandBus.ts  # Agent 地图命令路由器（setMapView/zoomToExtent/switchBasemap 等白名单命令）
│   │   │   │   └── mapContextSnapshot.ts  # 发送时地图状态快照协议（runtime 主源 + URL 安全回退）
│   │   │   ├── components/
│   │   │   │   ├── ChatConfigPanel.vue
│   │   │   │   ├── ChatConfigPanel.ts  # AI 对话配置面板实例层（通道切换、API Key 校验与模型选择）
│   │   │   │   ├── ChatInputBar.vue
│   │   │   │   ├── ChatInputBar.ts  # 对话输入栏实例层（快捷键发送、高度自适应与停止生成）
│   │   │   │   ├── ChatMessageList.vue
│   │   │   │   ├── ChatMessageList.ts  # 对话消息列表实例层（Markdown 渲染、代码复制与自动滚底）
│   │   │   │   ├── ChatPanelContent.vue
│   │   │   │   ├── ChatPanelContent.ts  # 对话容器实例层（发送编排/工具两轮调用/打字机/软取消）
│   │   │   │   └── ChatServiceStatus.vue
│   │   │   │   └── ChatServiceStatus.ts  # 对话服务状态栏实例层（模式徽标、额度展示与面板唤醒）
│   │   │   ├── composables/
│   │   │   │   ├── chatIntentFallback.ts
│   │   │   │   ├── useAgentConfig.ts
│   │   │   │   ├── useAgentMapContext.ts
│   │   │   │   ├── agentConfig/  # 配置与模式分层（状态/路由/个人配置/LLM 调用）
│   │   │   │   │   ├── configState.ts  # 默认值、额度归一、模型存储键 + reactive 状态与 computed
│   │   │   │   │   ├── llmCall.ts  # 三通道 LLM 调用（默认 AI / 个人 Key / 后端代理）
│   │   │   │   │   ├── personalConfig.ts  # 个人配置读写、模型列表与偏好持久化
│   │   │   │   │   └── routing.ts  # 模式判定/切换、服务状态与额度刷新
│   │   │   │   ├── useChatAgentConfig.ts  # 工厂入口（装配四组方法到同一 reactive）
│   │   │   │   └── useChatSession.ts
│   │   │   ├── constants/
│   │   │   │   └── agentToolsSchema.ts  # Agent Function Calling 工具声明
│   │   │   └── stores/
│   │   │       └── useChatStore.ts  # Chat 状态
│   │   ├── command-bus/
│   │   │   ├── GISCommander.ts  # Agent 工具门面（检索/底图/相机/天气；地图变更经 MapCommandBus）
│   │   ├── compass/
│   │   │   ├── components/
│   │   │   │   ├── CompassControlPanel.vue
│   │   │   │   ├── CompassControlPanel.ts  # 罗盘控制面板实例层（主题切换、旋转锁与透明度调节）
│   │   │   │   └── PalaceExplanationPanel.vue
│   │   │   │   └── PalaceExplanationPanel.ts  # 罗盘宫位详解面板实例层（二十四山/二十八宿释义展示）
│   │   │   ├── services/
│   │   │   │   ├── CompassManager.ts  # 罗盘管理器（生命周期/事件/URL 同步薄壳）
│   │   │   │   ├── compassCanvasStyle.ts  # 罗盘原生 Canvas 渲染样式（像素量测/视口判定/分层绘制）
│   │   │   │   ├── compassDrawUtils.ts  # 罗盘绘制纯工具（颜色/角度/径向文字/共享常量）
│   │   │   │   ├── index.ts  # 路由与守卫
│   │   │   │   └── urlState.ts  # 罗盘 URL 状态编解码
│   │   │   ├── stores/
│   │   │   │   └── useCompassStore.ts  # 罗盘状态
│   │   │   ├── svg/
│   │   │   │   ├── feng-shui-compass-svg.ts  # 风水罗盘 SVG 渲染器（纯几何计算 + SVG 输出，模板经 render proxy 调用）
│   │   │   │   ├── feng-shui-compass-svg.vue
│   │   │   │   ├── feng-shui-compass-svg.ts  # 罗盘实例层（几何计算/路径生成/文字变换/刻度）
│   │   │   │   ├── Explanation/
│   │   │   │   │   ├── circle_explanation.json
│   │   │   │   │   ├── compass_explanation.json
│   │   │   │   │   ├── dark_explanation.json
│   │   │   │   │   ├── polygon_explanation.json
│   │   │   │   │   └── simple_explanation.json
│   │   │   │   ├── themes/
│   │   │   │   │   ├── index.ts  # barrel export
│   │   │   │   │   ├── theme-compass.ts
│   │   │   │   │   ├── theme-crice.ts
│   │   │   │   │   ├── theme-dark.ts
│   │   │   │   │   ├── theme-polygon.ts
│   │   │   │   │   ├── theme-simple.ts
│   │   │   │   │   └── images/
│   │   │   │   │       ├── theme-compass-preview.png  # 罗盘主题预览图
│   │   │   │   │       ├── theme-crice.png           # Crice 主题预览图
│   │   │   │   │       ├── theme-dark-preview.png    # 暗色主题预览图
│   │   │   │   │       └── theme-polygon-preview.png  # 多边形主题预览图
│   │   │   │   └── types/
│   │   │   │       ├── common.ts
│   │   │   │       ├── compass.ts
│   │   │   │       ├── index.ts  # barrel export
│   │   │   │       └── theme.ts
│   │   │   └── utils/
│   │   │       ├── compassStyleUtils.ts   # 罗盘背景 CSS 变量工具（纯函数）
│   │   │       ├── explanationLookup.ts  # 罗盘宫位解释查询
│   │   │       └── themeExplanationMapper.ts  # 主题-解释文件映射
│   │   ├── components/
│   │   │   ├── CesiumExtentPicker.vue  # 三维范围框选（ScreenSpace 左键拖拽 + 椭球拾取，ExtentPicker 镜像，V3.6.14）
│   │   │   ├── CesiumExtentPicker.ts  # 3D 框选实例层（椭球拾取/预览实体/相机旋转守卫）
│   │   │   ├── ExtentPicker.vue  # 地图范围框选（自包含 DragBox）
│   │   │   ├── ExtentPicker.ts  # 地图范围框选实例层（DragBox 交互与范围事件派发）
│   │   │   └── Magic/
│   │   │       ├── useDelaunay.ts
│   │   │       ├── useFluid.ts
│   │   │       ├── useGravity.ts
│   │   │       ├── useRingExplosion.ts
│   │   │       ├── useSingularity.ts
│   │   │       └── useWave.ts
│   │   ├── composables/
│   │   │   ├── useAnchoredMenu.ts  # 锚点弹层视口定位（菜单内联样式 + 子菜单左右展开判定）
│   │   │   ├── useCellEditing.ts  # 单元格就地编辑状态机
│   │   │   ├── useDragSort.ts  # 拖拽排序状态机（鼠标 + 触摸）
│   │   │   ├── useLongPress.ts  # 触摸长按识别（计时 / 漂移取消 / 多指取消）
│   │   │   ├── useRequestToken.ts  # 请求竞态令牌（递增序号 + 过期响应静默丢弃）
│   │   │   └── useTimerRegistry.ts  # 定时器/帧回调统一托管（卸载自动释放）
│   │   │   ├── usePanelDragResize.ts  # 浮层面板拖拽 + 八向缩放 + 视口夹取（移动端底部停靠）
│   │   │   ├── useVirtualRows.ts  # 定高行虚拟滚动窗口（可视区 + overscan → 渲染区间）
│   │   ├── data-import/
│   │   │   ├── archiveProcessor.ts  # 归档解包
│   │   │   ├── batchProcessor.ts  # 批量数据分类
│   │   │   ├── cesiumWarmup.ts  # Cesium 主脚本空闲预热（首屏就绪 6s + idle 后显式调用 ensureCesiumLoaded() 后台预载，saveData 跳过）
│   │   │   ├── crsAware.ts  # ⚠️ 转发壳（canonical 在 crs/crsAware.ts）
│   │   │   ├── crs-engine.ts  # ⚠️ 转发壳（canonical 在 crs/crs-engine.ts）
│   │   │   ├── dataDispatcher.ts  # 数据格式分发
│   │   │   ├── decompressFile.ts  # ZIP 解压
│   │   │   ├── decompressor.ts  # 通用解压器
│   │   │   ├── yieldUi.ts  # 导入 UI 让步与遮罩握手（nextPaint 双 rAF / yieldSlice / withImportMask 统一 GlobalLoading 导入遮罩）
│   │   │   ├── deferredGisAssets.ts  # 延迟 GIS 资源
│   │   │   ├── deferredGisWarmupLauncher.ts  # GIS 预热启动
│   │   │   ├── gisUploadPayload.ts  # GIS 载荷构建函数 SSOT（createUploadPayloadsFromFiles/Folder/Entries）
│   │   │   ├── index.ts  # 路由与守卫
│   │   │   ├── loadJsZip.ts  # JSZip 动态加载
│   │   │   ├── mapRuntimeDeps.ts  # OL 运行时依赖
│   │   │   ├── rasterUtils.ts  # 栅格工具（拉伸/NoData/数据范围）
│   │   │   ├── shpPacketBuilder.ts  # SHP 包构建
│   │   │   ├── textDecoder.ts  # 文本解码
│   │   │   ├── tifUtils.ts  # TIF 工具
│   │   │   ├── useGisDropZone.ts  # 通用 GIS 文件拖拽导入 composable（isDragging + 四事件处理器）
│   │   │   ├── useGisLoader.ts
│   │   │   ├── useKmzLoader.ts
│   │   │   ├── useSharedResourceLoader.ts
│   │   │   ├── useAmapBuildingFetch.ts  # 高德建筑白模抓取编排（管理端 amap_key + 固定 z14 + 框选裁剪，V3.6.12）
│   │   │   ├── useTdtBuildingFetch.ts  # 天地图抓取编排（建筑单层 + 全量多选分层 startVectorFetch + 分层出包，V3.6.17）
│   │   │   ├── useTencentBuildingFetch.ts  # 腾讯建筑白模抓取编排（范围→抓取→GeoJSON→包File入库，V3.6.11）
│   │   │   ├── vectorUtils.ts  # 矢量工具（文本解码/类型归一）
│   │   │   ├── webglRasterRenderer.ts  # WebGL 栅格渲染
│   │   │   ├── crs/
│   │   │   │   ├── coordTransform.ts  # 坐标转换（GCJ-02/WGS84）
│   │   │   │   ├── crsAware.ts  # CRS 感知层
│   │   │   │   ├── crs-engine.ts  # CRS 引擎（override > .prj > KML > 预探测 > 默认 4326；输出 confidence/ambiguous/hint）
│   │   │   │   ├── crsPresets.ts  # CGCS2000 高斯-克吕格带号 ↔ EPSG 映射（3/6 度带 × 带号前缀）与 proj4 定义生成；零依赖，中央经线 ↔ EPSG 互算
│   │   │   │   ├── sourceSnapshot.ts  # 导入前的源几何快照注册表（非响应式、有上限）：支撑「导入后重设源坐标系」；重投影一经执行原始数值即丢失，故必须在变换前留存
│   │   │   │   └── crsUtils.ts  # CRS 检测与注册（GeoJSON/KML 探测、量级推断、任意 EPSG 动态注册）
│   │   │   ├── parsers/
│   │   │   │   ├── amapAoiParser.ts  # 高德 AOI 解析
│   │   │   │   ├── amapBuildingFetcher.ts  # 高德建筑白模矢量抓取（管理端 amap_key，输出 WGS-84 GeoJSON，默认直连）
│   │   │   │   ├── dbfParser.ts  # DBF 解析
│   │   │   │   ├── kmlParser.ts  # KML/KMZ 解析
│   │   │   │   ├── kmlStyleParser.ts  # KML 样式解析
│   │   │   │   ├── shpParser.ts  # Shapefile 解析
│   │   │   │   ├── shp/  # Shapefile 解析分层
│   │   │   │   │   ├── datasets.ts  # 数据集组织与几何类型归一
│   │   │   │   │   ├── dbfAttributes.ts  # DBF 属性表读取与字段映射
│   │   │   │   │   ├── encoding.ts  # 编码探测（GBK / UTF-8 等）
│   │   │   │   │   └── geoValidation.ts  # 几何有效性校验与修复
│   │   │   │   ├── tabularParser.ts  # CSV / WKT → GeoJSON（本系统导出的 CSV/TXT 回读入口；列名与导出侧共用同一契约）
│   │   │   │   ├── tdtBuildingFetcher.ts  # 天地图建筑矢量抓取（浏览器 VTS 解码、权限错误处理）
│   │   │   │   ├── tdtBuildingTopology.ts  # 天地图建筑跨瓦片 Union（无第三方依赖、接缝窄带优化；clipRingToRectMulti 半平面多环裁剪，V3.6.17）
│   │   │   │   ├── tdt/  # 天地图矢量抓取与拓扑分层
│   │   │   │   │   ├── decode.ts  # 三种编码变体（标准/前导层/裸块）解析与统一出口
│   │   │   │   │   ├── fetch.ts  # 瓦片抓取（重试/限速/进度）+ GeoJSON 下载
│   │   │   │   │   ├── pbf.ts  # protobuf 底层（varint/字段/命令/值/标签/图层/要素）
│   │   │   │   │   ├── tileMath.ts  # 经纬度↔瓦片、pk 编码、瓦片数估算
│   │   │   │   │   └── topology/  # 分层拓扑（规则见 tdtVectorTopology 头注释）
│   │   │   │   │       ├── builders.ts  # 面/线/点拓扑构建与 S8 融合
│   │   │   │   │       ├── geometry.ts  # 瓦片坐标/裁剪/面积/包含判定
│   │   │   │   │       ├── props.ts  # 标签提取与属性稳定化
│   │   │   │   │       └── rings.ts  # 环嵌套 / 同 id 面合并 / 残余重叠审计
│   │   │   │   ├── tdtVectorFetcher.ts  # 入口（re-export 抓取/解码/拓扑）
│   │   │   │   ├── tdtVectorLayers.ts  # 天地图 12 层字典（码→中文含义→关键属性→拓扑策略，V3.6.17）
│   │   │   │   ├── tdtVectorTopology.ts  # 天地图全量分层拓扑（CE/AP 按 id 合：buffer 盒裁剪 + 瓦片核心裁剪恢复（多环化，V3.6.17） + 接缝条件 Union + 守恒回退 + 洞嵌套；CK/BM 按 S8 分组连通融合；点线裁剪去重；残余重叠洞感知审计，AP 豁免纯包含，V3.6.17）
│   │   │   │   ├── tencentBuildingFetcher.ts  # 腾讯建筑白模矢量抓取（浏览器直跑，输出 WGS-84 GeoJSON）
│   │   │   │   └── tifLoader.ts  # GeoTIFF 加载
│   │   │   ├── components/
│   │   │   │   └── TencentBuildingPanel.vue  # 建筑抓取面板（腾讯/高德/天地图 + 天地图 12 层多选分层 + 入库/下载，V3.6.17）
│   │   │   │   └── TencentBuildingPanel.ts  # 建筑抓取实例层（三源桥接/合规确认/范围表单/入库）
│   │   │   └── stores/
│   │   │       └── useDownloadStore.ts  # 下载任务状态
│   │   ├── data-protocol/
│   │   │   └── featureKey.ts  # 要素唯一键生成
│   │   ├── layer-tree/
│   │   │   ├── factory.ts  # 标准节点工厂
│   │   │   ├── index.ts  # 路由与守卫
│   │   │   ├── protocol.ts  # 图层树协议常量
│   │   │   ├── engineTreePort.ts  # 图层树引擎端口（引擎域注册动作/数据集桥接）
│   │   │   ├── actions/
│   │   │   │   ├── contextActionManager.ts  # 右键菜单动作调度
│   │   │   │   └── unifiedActionRouter.ts  # 统一图层操作路由器（OL/Cesium 双引擎处理器注册 + 按引擎分发）
│   │   │   ├── composables/
│   │   │   │   ├── useGeocoding.ts  # 坐标工具/地理编码/高德 AOI 对话框逻辑（自 TOCPanel 抽离，已接线）
│   │   │   │   ├── useTreeActionDispatcher.ts  # TOC 树动作分发 + 多选集 + 拖拽排序（已接线）
│   │   │   │   ├── useSharedResources.ts  # 共享资源扫描/加载（包装 useSharedResourceLoader）
│   │   │   │   ├── useFileUpload.ts  # 文件/文件夹上传触发与进度视图（已接线）
│   │   │   │   ├── exportService.ts  # KML 导出
│   │   │   │   ├── exportFormatting.ts  # 导出格式化工具（顶点展开/CSV 单元/下载）
│   │   │   │   ├── layerExportService.ts  # 图层导出服务
│   │   │   │   ├── selectionManager.ts  # 选择状态管理
│   │   │   │   └── useLayerContextMenuActions.ts
│   │   │   ├── components/
│   │   │   │   ├── LayerPanel.vue
│   │   │   │   ├── LayerPanel.ts  # 图层列表面板实例层（显隐切换、透明度滑杆与顺序调整）
│   │   │   │   ├── LayerPropertiesDialog.vue  # 图层属性弹窗
│   │   │   │   ├── LayerPropertiesDialog.ts  # 图层属性弹窗实例层（元数据、坐标系与范围信息展示）
│   │   │   │   ├── SharedResourceTreeItem.vue  # 共享资源树节点
│   │   │   │   ├── SharedResourceTreeItem.ts  # 共享资源树节点实例层（目录递归展开与一键加载）
│   │   │   │   ├── TOCPanel.vue  # TOC 宿主面板（仅模板与样式；逻辑见 TOCPanel.ts）
│   │   │   │   ├── TOCPanel.ts  # TOC 实例层（页签/样式应用/属性表打开/生命周期编排）
│   │   │   │   ├── TOCTreeItem.vue  # 递归树节点
│   │   │   │   └── TOCTreeItem.ts  # 节点实例层（展开态/多选/可见性/右键菜单定位/重命名）
│   │   │   ├── menu/
│   │   │   │   ├── commandDispatcher.ts  # 菜单命令分发
│   │   │   │   ├── contextMenu.ts  # 右键菜单项构建
│   │   │   │   └── types.ts  # 菜单项/能力/多选上下文类型
│   │   │   └── stores/
│   │   │       ├── layerRemovalHandler.ts  # 图层移除回调注册表（跨域解耦：引擎域注册、common 触发）
│   │   │       └── useTOCStore.ts  # TOC 元数据状态
│   │   │   ├── components/AmapAoiInjectDialog.vue  # 高德 AOI 注入弹窗（引擎无关，自 ol/search 上移）
│   │   │   ├── components/AmapAoiInjectDialog.ts  # 高德 AOI 注入弹窗实例层（JSON 解析校验与注入触发）
│   │   │   ├── style/
│   │   │   │   └── useStyleEditor.ts  # 样式模板目录 + 表单态 + 载荷构建（引擎无关，TOC 与 OL/Cesium 双侧消费）
│   │   ├── map-view/
│   │   │   ├── coordinateFormatter.ts  # 坐标格式化
│   │   │   ├── units.ts  # 单位制工具（距离/面积公英制格式化）
│   │   │   ├── useUserLocation.ts  # 用户定位 composable（GPS+IP 双通道编排）
│   │   │   ├── userLocationMath.ts  # 定位纯工具（几何估算/URL 标记/开发者开关）
│   │   │   ├── coordinateInputHandler.ts  # 地图坐标输入处理（拾取/键盘/表单联动）
│   │   │   ├── usePositionCodeTool.ts  # 位置编码工具 composable（坐标→行政区码/编码解析）
│   │   │   ├── geo/
│   │   │   │   └── index.ts  # 路由与守卫
│   │   │   └── services/
│   │   │       ├── userLocationContext.ts  # 用户定位上下文
│   │   │       └── userPositionCache.ts  # 用户位置缓存
│   │   ├── map-adapter/
│   │   │   ├── index.ts  # 跨引擎统一地图适配协议统一导出
│   │   │   ├── types.ts  # 引擎能力枚举与适配器类型定义
│   │   │   ├── IMapEngineAdapter.ts  # 统一地图引擎适配器抽象接口协议
│   │   │   ├── mapCommandBus.ts  # 统一地图命令总线（发布/订阅解耦）
│   │   │   └── useMapEngineAdapter.ts  # 适配器注册中心与响应式组合式函数
│   │   ├── shell/
│   │   │   ├── GlobalLoading.vue  # 全局 Loading 遮罩
│   │   │   ├── GlobalLoading.ts  # 全局 Loading 遮罩实例层（进度文案与显隐动画过渡）
│   │   │   ├── MagicCursor.vue  # 鼠标特效（粒子跟随）
│   │   │   ├── MagicCursor.ts  # 鼠标粒子特效实例层（六种物理/流体粒子效果切换与 Canvas 循环）
│   │   │   ├── Message.vue  # 消息提示 UI 组件
│   │   │   ├── Message.ts  # 全局消息提示灵动岛实例层（队列管理、脉冲动效与详情展开）
│   │   │   ├── PersistentAnnouncementBar.vue  # 持久公告条
│   │   │   ├── PersistentAnnouncementBar.ts  # 持久公告条实例层（跑马灯轮播与已读折叠）
│   │   │   ├── ResizeHandle.vue  # 面板拖拽调整手柄
│   │   │   ├── ResizeHandle.ts  # 面板拖拽手柄实例层（指针捕获与宽度阈值钳制）
│   │   │   ├── SidePanel.vue  # 侧边面板（Chat/工具箱/路线/罗盘/天气）
│   │   │   ├── SidePanel.ts  # 侧边面板实例层（新闻双通道竞速/缓存兜底/页签懒挂载）
│   │   │   ├── TopBar.vue  # 顶栏（Logo + 搜索 + 用户菜单 + 引擎切换）
│   │   │   ├── TopBar.ts  # 顶栏实例层（工具/魔法菜单、快捷地点、分享链接、日志监控开关）
│   │   │   ├── useMessage.ts
│   │   │   └── useMessageIslandMotion.ts
│   │   ├── services/
│   │   │   └── runtimeMapTokens.ts  # 运行时地图 token 池（纯基础设施，仅依赖 @/api/backend，自 ol 域迁入）
│   │   ├── ui/
│   │   │   ├── index.ts  # 路由与守卫
│   │   │   └── loading.ts  # 全局 loading 控制（文案由调用方 t('loading.*')）
│   │   ├── url-state/
│   │   │   ├── codec/  # 短码编解码分片
│   │   │   │   ├── cesiumPose.ts  # Cesium 相机位姿编解码
│   │   │   │   └── positions.ts  # 经纬度/罗盘状态编解码（含共享位宽常量）
│   │   │   ├── crypto.ts  # URL 状态短码编解码入口（re-export codec/*）
│   │   │   ├── index.ts  # 路由与守卫
│   │   │   ├── urlConstants.ts  # URL 常量
│   │   │   ├── urlQueryReader.ts  # hash/query 参数统一读取
│   │   │   ├── useBasemapUrlMapping.ts  # 底图 URL 参数映射
│   │   │   ├── useMapViewUrlState.ts  # 地图视图 URL 状态（2D/3D 切换）
│   │   │   └── stores/
│   │   │       └── useUrlParamStore.ts  # URL 参数管理
│   │   ├── user/
│   │   │   ├── components/
│   │   │   │   ├── AdminControlPanel.vue
│   │   │   │   ├── AdminControlPanel.ts  # 后台面板实例层（页签导航 + 横向拖拽滚动 + 生命周期编排）
│   │   │   │   ├── ApiKeysManagementPanel.vue
│   │   │   │   ├── ApiKeysManagementPanel.ts  # 密钥面板实例层（掩码显隐/复制/备份增删/默认 AI 配置）
│   │   │   │   ├── ApiManagementPanel.vue
│   │   │   │   ├── ApiManagementPanel.ts  # API 文档管理面板实例层（接口筛选与详情复制）
│   │   │   │   ├── FloatingAccountPanel.vue
│   │   │   │   ├── FloatingAccountPanel.ts  # 账户面板实例层（开关/全屏、15s 轮询、会话时长递增、分页懒加载）
│   │   │   │   └── tabs/
│   │   │   │       ├── OverviewTab.ts  # 用户中心概览页实例层（从 OverviewTab.vue 抽取的 setup 状态与方法）
│   │   │   │       ├── OverviewTab.vue
│   │   │   │       ├── PreferencesTab.vue
│   │   │   │       ├── PreferencesTab.ts  # 用户偏好设置页实例层（主题、头像与偏好草稿同步）
│   │   │   │       └── SecurityTab.vue
│   │   │   │       └── SecurityTab.ts  # 账户安全设置页实例层（密码修改、邮箱换绑与验证码倒计时）
│   │   │   ├── composables/
│   │   │   │   ├── adminTableFormat.ts  # 表格纯函数（单元格格式化/高亮/定位键/CSV 构建）
│   │   │   │   ├── useAccountPreferences.ts  # 账户面板偏好草稿、主题切换与头像同步
│   │   │   │   ├── useAccountSecurityAndActions.ts  # 账户安全（密码重置/验证码/邮箱绑定）与登出操作
│   │   │   │   ├── useAdminSettings.ts  # 后台配置能力层（概览/公告/联系方式/底图/TTL/限额/限流）
│   │   │   │   ├── useAdminTable.ts  # 后台表格能力层（列表/分页/排序/搜索/行内编辑/增删/导出）
│   │   │   │   ├── useAuthIdentity.ts
│   │   │   │   └── useRealtimeStats.ts  # SSE 在线统计（ticket + 指数退避 + auth 变化重连 + offline beacon + 断线 presence ping）
│   │   │   ├── services/
│   │   │   │   └── auth.ts  # 鉴权工具
│   │   │   └── stores/
│   │   │       ├── useAuthStore.ts  # 鉴权状态
│   │   │       └── useUserPreferencesStore.ts  # 用户偏好（语言 SSOT：setLanguagePreference + 本机 key 优先远端）
│   │   ├── utils/
│   │   │   ├── abortManager.ts  # 请求中断管理器
│   │   │   ├── browserDownload.ts  # 浏览器下载触发工具（Blob / URL 两种模式）
│   │   │   ├── clipboard.ts  # 剪贴板工具（复制文本，降级 execCommand）
│   │   │   ├── datetime.ts  # 日期时间格式化单源（parseDateValue/formatDateTime/formatTimeShort/formatDateEpoch）
│   │   │   ├── defineResilientAsync.ts  # 异步组件韧性工厂（占位 + 线性退避重试 + 超时兜底；内联样式占位不依赖样式分片）
│   │   │   ├── labelValidator.ts  # 标签校验
│   │   │   ├── mapDefaults.ts  # 跨域地图默认参数单源（DEFAULT_SEARCH_ZOOM/MAX_SEARCH_ZOOM）
│   │   │   ├── normalize.ts  # 二值标记规范化
│   │   │   ├── pathUtils.ts  # 路径工具
│   │   │   ├── tileRateLimitNotify.ts  # 瓦片 429 限流 toast（15s 防抖，OL/Cesium 共用）
│   │   │   ├── useMarkdownRenderer.ts
│   │   │   ├── viewScaleConverter.ts  # 兼容入口（再导出 viewScale/ 模块；旧 API 签名不变）
│   │   │   ├── viewScale/
│   │   │   │   ├── constants.ts  # 双引擎尺度系统常量（地球半径/容差/FOV 默认/相机高度与 OL zoom 边界，含兼容别名）
│   │   │   │   ├── constants-and-precision.ts  # 常量+浮点工具聚合（兼容入口）
│   │   │   │   ├── precision.ts  # nearlyEqual 浮点判定 + 负零归一化 + 边界钳制
│   │   │   │   ├── webMercator.ts  # EPSG:3857 zoom↔resolution + 纬度修正（groundResolution）
│   │   │   │   ├── openlayersScale.ts  # OL 尺度归一化（resolution 优先，zoom 推导兜底）
│   │   │   │   ├── cesiumScale.ts  # Cesium 解析模型（nadir/倾斜）+ 射线测量注入式封装 + 二分求解
│   │   │   │   ├── conversion.ts  # 高层转换：convertOlViewToCesium / convertCesiumViewToOl（UnifiedViewState）
│   │   │   │   ├── compat.ts  # 旧 API 兼容层（olZoomToCesiumHeight/cesiumHeightToOlZoom）
│   │   │   │   └── browserAdapter.ts  # 浏览器端射线测量适配（pickRay/globe.pick 注入）
│   │   └── weather/
│   │       ├── components/
│   │       │   ├── WeatherChartPanel.vue
│   │       │   ├── WeatherChartPanel.ts  # 天气图表面板实例层（气温趋势与风力仪表盘挂载）
│   │       │   ├── WeatherForecastTable.vue
│   │       │   ├── WeatherForecastTable.ts  # 天气预报表格实例层（多日昼夜天气与风向展示）
│   │       │   └── WeatherLiveCards.vue
│   │       │   └── WeatherLiveCards.ts  # 实时天气卡片实例层（温湿度、风力与更新时间展示）
│   │       ├── composables/
│   │       │   ├── charts/  # 图表规格与运行时分层（纯 option 构建 + 实例生命周期）
│   │       │   │   ├── layoutMetrics.ts  # 容器尺寸 → 字号/边距/仪表半径换算
│   │       │   │   ├── runtime.ts  # ECharts 懒加载、实例初始化/销毁、loading、resize 调度
│   │       │   │   ├── trendChart.ts  # 气温趋势图 option（白/夜双系列，纯函数）
│   │       │   │   └── windChart.ts  # 风力仪表盘 + 风级柱线 option（纯函数）
│   │       │   ├── useWeatherCharts.ts  # 装配层：refs + 运行时/布局/规格 组装与对外暴露
│   │       │   └── useWeatherData.ts  # 天气数据获取与派生
│   │       ├── stores/
│   │       │   └── useWeatherStore.ts  # 天气状态
│   │       └── utils/
│   │           ├── weatherRuntime.ts  # 天气图表运行时
│   │           └── weatherUtils.ts
│   └── ol/
│       ├── index.ts  # 路由与守卫
│       ├── adapter/
│       │   ├── index.ts  # barrel export
│       │   └── OpenLayersAdapter.ts  # 二维地图引擎适配器实现（实现 IMapEngineAdapter 协议）
│       ├── basemap/
│       │   ├── basemapSystem.ts  # 底图系统入口（barrel export）
│       │   ├── composables/
│       │   │   ├── basemapLayerFactory.ts  # 底图图层工厂（栅格/矢量瓦片自动识别 + source 类型安全挂载 applyBasemapSourceToLayer）
│       │   │   ├── vectorTileStyleAdapter.ts  # 矢量瓦片服务端样式适配器（ArcGIS root.json → OL StyleFunction，零依赖轻量实现）
│       │   │   ├── useBasemapLayerBootstrap.ts  # 底图图层初始化引导
│       │   │   ├── useBasemapSelectionWatcher.ts  # 底图选择监听
│       │   │   ├── useBasemapStateManagement.ts  # 底图状态管理
│       │   │   └── useBasemapSwipe.ts  # 卷帘对比
│       │   ├── constants/
│       │   │   ├── basemapConfig.ts  # 底图配置唯一真相源（SSOT）：图源定义 + url/serviceType 字段 + getDescriptorById() 自动派生 Cesium 描述符
│       │   │   ├── basemapCore.ts  # 底图配置内核（类型/主机常量/非标准适配器/URL 构建器）
│       │   │   ├── definitions/  # 图源定义分片（按原始顺序切片，聚合顺序不变）
│       │   │   │   ├── group-1.ts
│       │   │   │   ├── group-2.ts
│       │   │   │   ├── group-3.ts
│       │   │   │   └── group-4.ts
│       │   │   ├── basemapResolver.ts  # 解析逻辑（使用 ALL_BASEMAP_PRESETS；DEFAULT_BASEMAP_LAYER_INDEX/BASEMAP_OPTIONS/URL_LAYER_OPTIONS 纯数据常量 re-export 自 common/basemap）
│       │   │   └── index.ts  # barrel export
│       │   └── resilience/
│       │       └── useBasemapResilience.ts  # 底图熔断回退（超时/错误自动切换）
│       ├── components/
│       │   ├── AdministrativeDivisionPanel.vue
│       │   ├── AdministrativeDivisionPanel.ts  # 行政区划面板实例层（省市区树检索、面包屑与边界定位）
│       │   ├── AdministrativeDivisionTreeNode.vue
│       │   ├── AdministrativeDivisionTreeNode.ts  # 行政区划树节点实例层（递归展开与双击聚焦）
│       │   ├── ControlsPanel.vue  # 侧栏 shell（新增 engine prop：3D 时绘制/测量子面板切换为 CesiumDrawMeasurePanel，2D 保持 OL DrawPanel/MeasurePanel；cesium-draw-action 动作上抛 HomeView）
│       │   ├── ControlsPanel.ts  # 控制面板实例层（菜单分发/子面板互斥/卷帘配置）
│       │   ├── DrawPanel.vue
│       │   ├── DrawPanel.ts  # 2D 绘制面板实例层（几何类型选择、样式联动与撤销清空）
│       │   ├── LogMonitor.vue
│       │   ├── LogMonitor.ts  # 日志监控实例层（SSE 流式接收后端日志，rAF 批量冲刷 + 超限裁剪，断线 3s 自动重连、按级别着色）
│       │   ├── MapContainer.vue  # OL 地图容器（底图/图层/绘制/测量/启动任务）。**跨引擎契约**：`urlSyncEnabled` prop 控制是否随 moveend 写回 URL（引擎切换窗口内由父级置 false 冻结）；`isStartupViewSettled()` 暴露「启动恢复已完成且无动画/交互」判据，是 OL→Cesium 换算取实时视图的唯一前提（未稳定须改用 URL 语义参数，否则读到默认 zoom 4 或动画插值）
│       │   ├── MapContainer.ts  # OL 地图容器实例层（图层/底图/绘制/测量/视图状态导出）
│       │   ├── MapControlsBar.vue  # 地图控件栏（缩放/旋转/重置）
│       │   ├── MapControlsBar.ts  # 控件条实例层（坐标格式化/编辑/复制、缩放显示、主页单击双击）
│       │   ├── MapDownloader.vue  # 底图下载器（框选范围 + 任务提交）⚠️ /api/download/* 后端 V3.6.5 已删，HF 404；见 Docs/TODO/plan-download-feature-git-marker.md
│       │   ├── MapDownloader.ts  # 下载器实例层（配额估算/底图预设解析/倒计时/可视化传输）
│       │   ├── MyDownloadTasks.vue  # 我的下载任务列表（查看/取消/下载）⚠️ 同上，接口暂不可用
│       │   ├── MyDownloadTasks.ts  # 下载任务列表实例层（状态轮询、取消任务与文件下载）
│       │   ├── MapSwipeController.vue  # 卷帘对比控制器
│       │   ├── MapSwipeController.ts  # 卷帘对比控制器实例层（分屏分割位置与图层同步）
│       │   ├── MeasurePanel.vue  # OL 测量子面板（2D：测距/测面；3D 由 CesiumDrawMeasurePanel 接管）
│       │   ├── MeasurePanel.ts  # 2D 测量子面板实例层（测距/测面激活与单位切换）
│       │   └── SpatialAnalysisPanel.vue
│       │   └── SpatialAnalysisPanel.ts# 空间分析实例层（8 类工具参数与可运行判定）
│       ├── composables/
│       │   ├── useMapBasemapPipeline.ts  # OL 底图 URL 映射、状态管理、Token 池轮转、熔断回退与卷帘装配管线
│       │   ├── useMapBootstrap.ts  # OL Map 初始化、视图 URL 恢复与销毁生命周期
│       │   ├── useMapContainerActions.ts  # OL 地图容器动作派发（底图、图层、定位、导出）
│       │   ├── useMapDrawingActions.ts  # OL 绘制/测量工具切换与几何结果回调
│       │   ├── useMapEventHandlers.ts
│       │   ├── useMapInteractionPickers.ts
│       │   ├── useMapLayerAndRoutePipeline.ts  # OL 受管矢量图层、要素序列化/高亮、CRS 转换、路径渲染与空间分析管线
│       │   ├── useMapState.ts  # 2D 地图状态（URL 同步/图层切换/视图动画编排）
│       │   ├── useMapStateHelpers.ts  # 纯工具（debounce/参数解析格式化/默认底图序号）
│       │   ├── useMapDecorations.ts  # 地图装饰图层（经纬网 + 中心点标记）
│       │   ├── useMapBasemapInstances.ts  # 2D 底图图层实例管理（按需挂载源、显隐/ZIndex 刷新与隐藏层清理）
│       │   ├── useMapSwipe.ts
│       │   ├── useMapUIEventHandlers.ts
│       │   ├── useRightDragZoom.ts
│       │   ├── useRuntimeMapTokenPool.ts
│       │   ├── useSharedEntryResolver.ts
│       │   └── useTileSourceFactory.ts
│       ├── constants/
│       │   └── mapStyles.ts  # 地图样式常量
│       ├── data-import/
│       │   ├── composables/
│       │   │   └── useLayerDataImport.ts  # 导入主入口（串行闸门/格式分派/图层登记）
│       │   ├── raster/
│       │   │   ├── nonGeorefTiffLayer.ts  # 无坐标参考 TIF 兜底落图
│       │   │   ├── rasterLayerFactory.ts  # 受管 GeoTIFF 图层构造（波段合成/拉伸/登记）
│       │   │   └── rasterSamplers.ts  # 栅格采样/投影换算/geotiff 源与 Worker 池缓存
│       │   └── vector/
│       │       ├── kmlTextHelpers.ts  # KML 命名空间归一/绘制顺序/要素解析
│       │       └── vectorImportPipeline.ts  # 矢量单文件解析入库 + dispatch 逐包入库
│       ├── drawing/
│       │   ├── composables/
│       │   │   ├── useAdvancedDrawing.ts
│       │   │   ├── useDrawingFeatureStyle.ts
│       │   │   ├── useDrawMeasure.ts  # 绘制测量功能（点/线/面/测距/测面）
│       │   │   └── useGeometryEdit.ts
│       │   ├── geometry/
│       │   │   └── drawingGeometryUtils.ts  # 绘制几何工具函数
│       │   └── registry/
│       │       └── drawingToolRegistry.ts  # 绘制工具注册表
│       ├── layer/
│       │   ├── zIndexBands.ts  # zIndex 显示带 SSOT（夹心：数据几何 DATA < 瓦片标注 LABEL < 数据标注 DATA_LABEL；托管层 geometry+label 双层）
│       │   ├── components/
│       │   │   ├── AttributeTable.vue  # 属性表（引擎无关，挂在 HomeView 唯一实例；排序/字段配置/统计/导出/列宽拖拽；readonly 供 3D 无回写通道时禁改值删要素）
│       │   │   ├── AttributeTable.ts  # 属性表实例层（虚拟滚动/面板拖拽八向缩放/单元格编辑/多选高亮）
│       │   │   └── LayerControlPanel.vue
│       │   │   └── LayerControlPanel.ts  # 面板实例层（锚定/右键菜单/拖拽排序/触摸长按/检索转发）
│       │   ├── composables/
│       │   │   ├── useBasemapCatalog.ts  # 底图目录与历史影像
│       │   │   ├── usePlaceSearch.ts  # 地名联想搜索（防抖 + 请求中断 + 下拉高亮）
│       │   │   ├── useCreateManagedVectorLayer.ts
│       │   │   ├── useDeferredUserLayerApis.ts
│       │   │   ├── useLayerControlHandlers.ts
│       │   │   ├── useLayerCustomWmsAndSearch.ts  # 自定义 WMS/XYZ 图源加载、能力探测与地点检索转发
│       │   │   ├── useLayerCrsRedeclare.ts  # 图层「重设源坐标系」：按快照原始数值重新投影并替换要素（与 toggleLayerCRS 的 GCJ-02 偏移换算职责分离）
│       │   │   ├── useManagedLayerRegistry.ts
│       │   │   ├── useTileHDRendering.ts
│       │   │   ├── useUserLayerActions.ts
│       │   │   └── useUserLayerApiFacade.ts
│       │   ├── feature/
│       │   │   ├── useManagedFeatureHighlight.ts
│       │   │   ├── useManagedFeatureOperations.ts
│       │   │   └── useManagedFeatureSerialization.ts
│       │   └── style/
│       │       ├── useManagedLayerStyle.ts
│       ├── routing/
│       │   ├── components/
│       │   │   ├── RoutePlannerPanel.vue  # 路线规划统一面板（mode=bus/drive 双触发模式，含策略选择/调试信息/结果渲染）
│       │   │   ├── RoutePlannerPanel.ts  # 路线面板实例层（公交 JSON/驾车 XML 解析、步骤渲染、地图联动）
│       │   │   └── MapPointPickerCard.vue  # 地图点选卡片（起点/终点/途经点选择）
│       │   │   └── MapPointPickerCard.ts  # 取点卡片实例层（起终点联想搜索 + 选择回填）
│       │   ├── renderers/
│       │   │   ├── useRouteRendering.ts  # 路线渲染（天地图驾车/公交）
│       │   │   ├── useRouteStepInteraction.ts
│       │   │   └── useRouteStepStyles.ts
│       │   └── utils/
│       │       ├── driveXmlParser.ts  # 驾车路线 XML 解析
│       │       └── transitRouteBuilder.ts  # 路线渲染数据构建
│       ├── search/
│       │   ├── components/
│       │   │   └── LocationSearch.vue  # 地点搜索组件
│       │   │   └── LocationSearch.ts  # 地名搜索实例层（防抖/服务源切换/分页/配额反推）
│       │   ├── composables/
│       │   │   ├── aoiFeatureHelpers.ts  # 搜索 AOI 纯工具（环闭合/属性清洗/中心点解析）
│       │   │   └── useMapSearchAndCoordinateInput.ts  # 地图搜索与坐标输入（AMAP AOI 落图工厂）
│       ├── services/
│       │   ├── DistrictManager.ts  # 行政区划管理器
│       │   └── olRemoteServiceAdapter.ts  # 在线服务注册表 → OL 图层渲染适配器（WMS/WMTS/XYZ/ArcGIS source 构建 + zIndex 子带同步）
│       ├── spatial-analysis/
│       │   └── composables/
│       │       ├── useDistrictManager.ts
│       │       └── useSpatialAnalysis.ts  # 空间分析功能（缓冲区/叠加/泰森等）
│       ├── startup/
│       │   ├── useStartupTaskScheduler.ts  # 启动任务调度器
│       │   ├── useStartupUrlRestoreGuard.ts  # URL 状态恢复守卫
│       │   └── useStartupViewResolver.ts  # 视图状态解析
│       ├── stores/
│       │   ├── useFeatureStyleStore.ts  # 要素高亮样式
│       │   ├── useLayerStore.ts  # 图层状态
│       │   ├── useSwipeConfigStore.ts  # 卷帘配置
│       │   └── layer/
│       │       ├── index.ts  # barrel export
│       │       ├── layerHelpers.ts  # 图层工具函数
│       │       └── layerTreeBuilder.ts  # 图层树构建器
│       ├── tile-source/
│       │   ├── index.ts  # barrel export
│       │   ├── tileLifecycle.ts  # 瓦片生命周期（AbortController 中断）
│       │   ├── tileSourceAdapters.ts  # 非标准瓦片源适配器
│       │   ├── types.ts  # 类型定义
│       │   ├── urlUtils.ts  # URL 工具函数
│       │   ├── wmsSource.ts  # WMS 源工厂
│       │   ├── wmtsSource.ts  # WMTS 源工厂（自动识别 capabilities）
│       │   └── xyzSource.ts  # XYZ 源工厂
│       └── utils/
│           ├── amapRectangle.ts  # 高德矩形范围解析
│           ├── attributeTableCsv.ts  # 属性表 CSV 导出（RFC4180 转义 + BOM + 下载）
│           ├── useCoordinateSystemConversion.ts
│           └── biz/
│               └── index.ts  # 路由与守卫
├── locales/
│   ├── core/  # 同步核心语言包（首屏 chunk；按语言分片）
│   │   ├── en-US.ts
│   │   ├── index.ts  # coreMessages 聚合
│   │   └── zh-CN.ts
│   ├── en-US.ts  # 英文语言包入口（合并 en-US/* 命名空间分片）
│   ├── en-US/
│   │   ├── account.ts
│   │   ├── admin.ts
│   │   ├── cesium-basic.ts
│   │   ├── cesium-module-1.ts
│   │   ├── cesium-module-2.ts
│   │   ├── misc.ts
│   │   ├── search-shell.ts
│   │   └── ui.ts
│   ├── zh-CN.ts  # 中文语言包入口（合并 zh-CN/* 命名空间分片）
│   └── zh-CN/
│       ├── account.ts
│       ├── admin.ts
│       ├── cesium-basic.ts
│       ├── cesium-module-1.ts
│       ├── cesium-module-2.ts
│       ├── misc.ts
│       ├── search-shell.ts
│       └── ui.ts
├── router/
│   ├── index.ts  # 路由与守卫
│   └── lazyHomeViewLoader.ts  # HomeView 二段式懒加载
├── stores/
│   └── index.ts  # barrel export
├── utils/
│   └── index.ts  # 路由与守卫
└── workers/
    ├── shpWorker.ts  # Shapefile 解析 Worker（TS 类型化消息协议）
    ├── shpjs.d.ts  # shpjs 第三方模块类型垫片
    └── tiffWorker.ts  # TIF 解码 Worker（TS 类型化消息协议 + Transferable 契约）
```

> 注：`frontend/src/` 之外的 `frontend/scripts/` 存放构建辅助脚本（如 [bundle-shaders.mjs](../../frontend/scripts/bundle-shaders.mjs)：将体积云 Shaders/ 真源打包为 lib/shaders/bundledShaders.js 并同步 public 镜像，已由 vite.config 求值期自动调用——dev/build 全覆盖；`--check` 模式供 CI 与本地校验），不属于本树扫描范围，改动时仍需保持与本文件注释一致。
