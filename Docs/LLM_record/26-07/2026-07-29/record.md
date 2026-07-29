如果你确认后要落地迁移，就是 L3 架构级任务：必须先写方案文档、取得你明确批准，再改代码。

推荐目标：domains/ol / domains/cesium / domains/common
我建议采用我前面说的方案 B，但稍微规范一下命名：


frontend/src/
├── domains/
│   ├── ol/                    # 二维地图领域：OpenLayers 相关 UI、逻辑、适配器
│   ├── cesium/                # 三维地图领域：Cesium 相关 UI、逻辑、运行时、provider、shader
│   └── common/                # 跨 OL / Cesium 的应用壳、公共 UI、协议、共享能力
│
├── api/                       # HTTP API 层，暂时保留
├── assets/                    # 全局样式、静态资源，暂时保留
├── config/                    # publicRuntime 等全局配置，暂时保留
├── constants/                 # 迁移期保留，后续逐步下沉/上移
├── locales/                   # i18n，暂时保留
├── router/                    # 路由，暂时保留
├── stores/                    # Pinia 全局 store，迁移期保留
├── workers/                   # Worker，迁移期保留
│
├── App.vue
├── main.js
└── cesium-shim.js
核心目标是：

src/ 不再默认等于 OL 应用，而是变成一个承载多个地图引擎领域的根目录。

OL、Cesium、Common 三个域平级，互相边界清晰。

总依赖方向
这是整个架构最重要的规则。


domains/ol      ─┐
                 ├──> domains/common
domains/cesium  ─┘

domains/common  不直接 import domains/ol
domains/common  不直接 import domains/cesium
domains/ol      不直接 import domains/cesium
domains/cesium  不直接 import domains/ol
也就是说：


ol      可以依赖 common
cesium  可以依赖 common
common  不能反向依赖 ol / cesium
ol      不能直接依赖 cesium
cesium  不能直接依赖 ol
如果 OL 和 Cesium 需要互通，不能互相 import，而是通过 common 里的协议层：


domains/common/map-view/
domains/common/layer-tree/
domains/common/command-bus/
domains/common/data-protocol/
目标结构总览

frontend/src/domains/
├── ol/
│   ├── components/
│   ├── basemap/
│   ├── layer/
│   ├── drawing/
│   ├── measure/
│   ├── routing/
│   ├── search/
│   ├── spatial-analysis/
│   ├── data-import/
│   ├── tile-source/
│   ├── startup/
│   ├── url-state/
│   ├── composables/
│   ├── services/
│   ├── adapters/
│   ├── utils/
│   └── index.js
│
├── cesium/
│   ├── components/
│   ├── modules/
│   ├── composables/
│   ├── layers/
│   ├── providers/
│   ├── runtime/
│   ├── vendors/
│   ├── shaders/
│   ├── data-import/
│   ├── adapters/
│   ├── utils/
│   ├── types/
│   └── index.js
│
└── common/
    ├── app/
    ├── shell/
    ├── components/
    ├── ui/
    ├── layer-tree/
    ├── map-view/
    ├── data-protocol/
    ├── data-import/
    ├── command-bus/
    ├── url-state/
    ├── user/
    ├── chat/
    ├── weather/
    ├── compass/
    ├── services/
    ├── stores/
    ├── utils/
    └── index.js
一、domains/cesium/：三维地图领域
定位
domains/cesium/ 是完整的三维地图子系统，不再挂在 components/Cesium/ 下面。

它里面可以有：

Cesium UI 组件；
Cesium composables；
Cesium runtime；
Cesium provider；
Cesium shader；
Cesium 内联第三方库；
Cesium 数据加载器；
Cesium 图层 adapter；
Cesium 工具面板模块。
这解决当前最大问题：

Cesium 不再伪装成 components 目录下的一个组件分支，而是正式成为和 OL 平级的三维领域。

推荐结构

frontend/src/domains/cesium/
├── components/
│   ├── CesiumContainer.vue
│   ├── CesiumToolPanel.vue
│   ├── CesiumAdvancedEffects.vue
│   ├── CesiumDataImportDialog.vue
│   ├── LilGuiControls.vue
│   └── panels/
│
├── modules/
│   ├── analysis/
│   ├── cloud/
│   ├── fluid-simulation/
│   ├── shallow-water/
│   ├── wind/
│   ├── player-controller/
│   └── navigation/
│
├── composables/
│   ├── core/
│   ├── scene/
│   ├── camera/
│   ├── interaction/
│   ├── terrain/
│   ├── models/
│   ├── tool-modules/
│   └── index.js
│
├── layers/
│   ├── imagery/
│   ├── terrain/
│   ├── data-source/
│   ├── tileset/
│   ├── toc-adapters/
│   └── index.js
│
├── providers/
│   └── terrain/
│       ├── GeoTerrainProvider.js
│       ├── ArcGISTerrainProvider.js
│       ├── GeoWTFS.js
│       ├── decodeWorkerPool.js
│       ├── lercDecode.worker.js
│       ├── geoTerrainDecode.worker.js
│       └── util.js
│
├── runtime/
│   ├── cesiumRuntime.js
│   ├── cesiumStorage.js
│   ├── cesiumTimeSystem.js
│   └── getCesium.js
│
├── data-import/
│   ├── composables/
│   ├── loaders/
│   │   ├── czmlLoader.js
│   │   ├── geojsonLoader.js
│   │   ├── geotiffLoader.js
│   │   ├── gltfLoader.js
│   │   ├── kmlLoader.js
│   │   ├── shpLoader.js
│   │   └── tilesetLoader.js
│   ├── adapters/
│   └── utils/
│
├── vendors/
│   ├── cesium-navigation/
│   ├── cesium-wind-layer/
│   └── cloud-atmosphere/
│
├── shaders/
├── utils/
├── types/
└── index.js
当前文件大致归属
当前路径	新位置
components/Cesium/CesiumContainer.vue	domains/cesium/components/CesiumContainer.vue
components/Cesium/CesiumToolPanel.vue	domains/cesium/components/CesiumToolPanel.vue
components/Cesium/CesiumAdvancedEffects.vue	domains/cesium/components/CesiumAdvancedEffects.vue
components/Cesium/CesiumDataImportDialog.vue	domains/cesium/components/CesiumDataImportDialog.vue
components/Cesium/LilGuiControls.vue	domains/cesium/components/LilGuiControls.vue
components/Cesium/Analysis/	domains/cesium/modules/analysis/
components/Cesium/Cloud/	domains/cesium/modules/cloud/ 或 domains/cesium/vendors/cloud-atmosphere/
components/Cesium/FluidSimulation/	domains/cesium/modules/fluid-simulation/
components/Cesium/ShallowWater/	domains/cesium/modules/shallow-water/
components/Cesium/PlayerController/	domains/cesium/modules/player-controller/
components/Cesium/cesium-navigation/	domains/cesium/vendors/cesium-navigation/
components/Cesium/cesium-wind-layer/	domains/cesium/modules/wind/ 或 domains/cesium/vendors/cesium-wind-layer/
components/Cesium/composables/	domains/cesium/composables/，其中部分下沉到 runtime/layers/data-import
components/Cesium/terrain/	domains/cesium/providers/terrain/
二、domains/ol/：二维地图领域
定位
domains/ol/ 放所有 OpenLayers 二维地图相关内容。

包括：

OL 地图容器；
2D 图层；
2D 底图；
OL 绘制；
OL 测量；
OL 路线渲染；
OL 空间分析；
OL 数据导入 adapter；
OL tile source；
OL 事件交互；
OL 搜索联动。
推荐结构

frontend/src/domains/ol/
├── components/
│   ├── MapContainer.vue
│   ├── MapControlsBar.vue
│   ├── MapSwipeController.vue
│   ├── MapDownloader.vue
│   └── MapEasterEgg.vue
│
├── basemap/
│   ├── composables/
│   ├── constants/
│   ├── factories/
│   ├── resilience/
│   └── index.js
│
├── layer/
│   ├── components/
│   ├── composables/
│   ├── managers/
│   ├── style/
│   ├── feature/
│   ├── export/
│   └── index.js
│
├── drawing/
│   ├── components/
│   ├── composables/
│   ├── registry/
│   ├── geometry/
│   └── index.js
│
├── measure/
│   ├── components/
│   ├── composables/
│   └── index.js
│
├── routing/
│   ├── components/
│   ├── composables/
│   ├── renderers/
│   ├── services/
│   └── index.js
│
├── search/
│   ├── components/
│   ├── composables/
│   ├── services/
│   └── index.js
│
├── spatial-analysis/
│   ├── components/
│   ├── composables/
│   ├── services/
│   └── index.js
│
├── data-import/
│   ├── composables/
│   ├── adapters/
│   ├── renderers/
│   └── index.js
│
├── tile-source/
│   ├── types.ts
│   ├── urlUtils.ts
│   ├── tileLifecycle.ts
│   ├── wmsSource.ts
│   ├── wmtsSource.ts
│   ├── xyzSource.ts
│   └── index.ts
│
├── startup/
│   ├── useStartupTaskScheduler.js
│   ├── useStartupUrlRestoreGuard.js
│   ├── useStartupViewResolver.js
│   └── index.js
│
├── url-state/
│   ├── useBasemapUrlMapping.js
│   ├── useMapViewUrlState.js
│   └── index.js
│
├── composables/
├── services/
├── adapters/
├── utils/
└── index.js
当前文件大致归属
当前路径	新位置
components/Map/	domains/ol/components/
composables/map/basemapSystem.js	domains/ol/basemap/
composables/map/features/useBasemapLayerBootstrap.js	domains/ol/basemap/composables/
composables/map/features/useBasemapResilience.js	domains/ol/basemap/resilience/
composables/map/features/useDrawMeasure.js	domains/ol/drawing/composables/ 或 domains/ol/measure/composables/
composables/map/features/drawingToolRegistry.js	domains/ol/drawing/registry/
composables/map/features/drawingGeometryUtils.js	domains/ol/drawing/geometry/
components/Routing/	domains/ol/routing/components/
composables/map/features/useRouteRendering.js	domains/ol/routing/renderers/
composables/map/routeService.js	domains/ol/routing/services/
components/Search/	domains/ol/search/components/
composables/map/features/useSpatialAnalysis.js	domains/ol/spatial-analysis/composables/
composables/tileSource/	domains/ol/tile-source/，如果 Cesium 不复用
utils/map/	domains/ol/utils/ 或 domains/common/map-view/，按复用情况决定
三、domains/common/：公共应用与跨引擎协议
定位
common 不是垃圾桶。

它只放：

应用壳；
跨 OL / Cesium 的公共 UI；
跨 OL / Cesium 的协议；
通用服务；
全局用户、聊天、天气、罗盘等非单一地图引擎逻辑；
通用工具函数；
公共状态协调。
推荐结构

frontend/src/domains/common/
├── app/
│   ├── HomeView.vue
│   ├── home/
│   │   ├── useSidePanel.ts
│   │   ├── useLayerOperations.ts
│   │   └── useDistrictLayer.ts
│   └── layout/
│
├── shell/
│   ├── TopBar.vue
│   ├── SidePanel.vue
│   ├── ResizeHandle.vue
│   ├── GlobalLoading.vue
│   ├── Message.vue
│   ├── PersistentAnnouncementBar.vue
│   └── MagicCursor.vue
│
├── components/
│   ├── ExtentPicker.vue
│   └── shared/
│
├── ui/
│   ├── loading.js
│   ├── message/
│   └── motion/
│
├── layer-tree/
│   ├── components/
│   ├── protocol/
│   ├── adapters/
│   ├── actions/
│   ├── menu/
│   └── index.js
│
├── map-view/
│   ├── protocol/
│   ├── viewScaleConverter.js
│   ├── coordinateFormatter.js
│   ├── units.js
│   └── index.js
│
├── data-protocol/
│   ├── featureKey.js
│   ├── layerMetadata.js
│   ├── sourceDescriptor.js
│   └── index.js
│
├── data-import/
│   ├── parsers/
│   ├── readers/
│   ├── archive/
│   ├── crs/
│   ├── workers-protocol/
│   └── index.js
│
├── command-bus/
│   ├── MapCommandBus.js
│   ├── mapCommandAdapters.js
│   ├── mapContextSnapshot.js
│   └── index.js
│
├── url-state/
│   ├── crypto.js
│   ├── urlConstants.js
│   ├── urlQueryReader.js
│   └── index.js
│
├── user/
│   ├── components/
│   ├── composables/
│   ├── services/
│   └── tabs/
│
├── chat/
│   ├── components/
│   ├── composables/
│   ├── services/
│   └── agent/
│
├── weather/
│   ├── components/
│   ├── composables/
│   ├── services/
│   └── utils/
│
├── compass/
│   ├── components/
│   ├── svg/
│   ├── services/
│   ├── stores/
│   └── data/
│
├── services/
├── stores/
├── utils/
└── index.js
当前文件大致归属
当前路径	新位置
views/HomeView.vue	domains/common/app/HomeView.vue
views/home/	domains/common/app/home/
components/Shell/	domains/common/shell/
components/Common/ExtentPicker.vue	domains/common/components/ExtentPicker.vue
components/UserCenter/	domains/common/user/components/
components/Chat/	domains/common/chat/components/
composables/chat/	domains/common/chat/composables/
services/agent/	domains/common/chat/agent/ 或 domains/common/command-bus/，按职责拆
components/Weather/	domains/common/weather/components/
composables/weather/	domains/common/weather/composables/
components/Compass/	domains/common/compass/components/
components/feng-shui-compass-svg/	domains/common/compass/svg/
services/CompassManager.ts	domains/common/compass/services/CompassManager.ts
utils/url/	domains/common/url-state/
utils/units.js	domains/common/map-view/units.js
utils/coordinateFormatter.js	domains/common/map-view/coordinateFormatter.js
utils/map/featureKey.js	domains/common/data-protocol/featureKey.js
四、Layer / TOC 的特殊处理
这块不能简单归到 OL。

你现在已经有 Cesium 图层元数据，例如 stores/layer/cesiumLayers.ts。所以 TOC / 图层树本质上已经变成跨 2D / 3D 的公共层。

我建议这样拆：


domains/common/layer-tree/
├── components/
│   ├── TOCPanel.vue
│   ├── LayerPanel.vue
│   ├── TOCTreeItem.vue
│   ├── LayerPropertiesDialog.vue
│   └── SharedResourceTreeItem.vue
│
├── protocol/
│   ├── layerNode.ts
│   ├── layerAction.ts
│   └── layerAdapter.ts
│
├── actions/
├── menu/
└── index.js
然后：


domains/ol/layer/
├── adapters/
├── feature/
├── style/
├── export/
└── components/
    └── LayerControlPanel.vue

domains/cesium/layers/
├── adapters/
├── data-source/
├── tileset/
├── terrain/
└── toc-adapters/
也就是说：

图层树 UI：Common；
图层协议：Common；
OL 图层能力：OL；
Cesium 图层能力：Cesium。
这样不会让 Cesium 反向依赖 OL 的 layer 目录。

五、Data Import / GIS IO 的特殊处理
数据导入目前也跨 OL / Cesium，不能粗暴归一边。

建议最终拆成：


domains/common/data-import/
├── parsers/
│   ├── kmlParser.ts
│   ├── kmlStyleParser.js
│   ├── shpParser.ts
│   ├── dbfParser.ts
│   ├── tifLoader.ts
│   ├── amapAoiParser.js
│   └── universalAmapParser.js
│
├── archive/
│   ├── archiveProcessor.js
│   ├── batchProcessor.js
│   ├── decompressFile.js
│   ├── decompressor.ts
│   └── loadJsZip.ts
│
├── crs/
│   ├── crs-engine.ts
│   ├── crsAware.js
│   ├── crsUtils.js
│   └── coordTransform.js
│
├── protocol/
└── index.js

domains/ol/data-import/
├── composables/
│   └── useLayerDataImport.js
├── adapters/
├── renderers/
│   ├── rasterUtils.js
│   ├── vectorUtils.js
│   └── webglRasterRenderer.js
└── index.js

domains/cesium/data-import/
├── composables/
│   └── useCesiumDataImport.js
├── loaders/
│   ├── czmlLoader.js
│   ├── geojsonLoader.js
│   ├── geotiffLoader.js
│   ├── gltfLoader.js
│   ├── kmlLoader.js
│   ├── shpLoader.js
│   └── tilesetLoader.js
├── adapters/
└── index.js
判断标准：

内容类型	放哪里
解析 KML/SHP/TIF/DBF/ZIP	common/data-import
生成 OL Layer / Feature	ol/data-import
生成 Cesium DataSource / Entity / Tileset	cesium/data-import
通用格式识别、CRS、解压	common/data-import
UI 面板	看入口属于 2D 还是 3D
六、API / Stores / Config 暂时不要一上来动
为了降低风险，我建议第一轮迁移时这些目录先保留：


api/
config/
locales/
router/
stores/
assets/
workers/
原因：

api/ 现在是 HTTP 层，迁移它收益不高；
config/publicRuntime.ts 是配置单点入口，保持稳定更好；
stores/ 是 Pinia 集中状态，贸然拆会影响全局；
locales/ 体积大，但不是当前主要架构痛点；
workers/ 要等 data-import 分层稳定后再动。
后续可以再演进成：


domains/common/stores/
domains/ol/stores/
domains/cesium/stores/
但不要第一阶段就做。

七、路径别名建议
如果采用 domains，我建议配置这些 alias：


@/              -> frontend/src/
@domains/       -> frontend/src/domains/
@ol/            -> frontend/src/domains/ol/
@cesium-domain/ -> frontend/src/domains/cesium/
@common/        -> frontend/src/domains/common/
为什么不建议直接用 @cesium？

因为项目里有真实 Cesium 库概念，@cesium 可能让人误会是第三方 Cesium 包。

所以建议：


@cesium-domain/
或者：


@webgis-cesium/
如果你喜欢短一点，也可以用：


@d3/
@d2/
@common/
但可读性不如：


@ol/
@cesium-domain/
@common/
八、最终目录树示意版
这是我建议你最终确认的版本：


frontend/src/
├── domains/
│   ├── ol/
│   │   ├── components/
│   │   ├── basemap/
│   │   ├── layer/
│   │   ├── drawing/
│   │   ├── measure/
│   │   ├── routing/
│   │   ├── search/
│   │   ├── spatial-analysis/
│   │   ├── data-import/
│   │   ├── tile-source/
│   │   ├── startup/
│   │   ├── url-state/
│   │   ├── composables/
│   │   ├── services/
│   │   ├── adapters/
│   │   ├── utils/
│   │   └── index.js
│   │
│   ├── cesium/
│   │   ├── components/
│   │   ├── modules/
│   │   │   ├── analysis/
│   │   │   ├── cloud/
│   │   │   ├── fluid-simulation/
│   │   │   ├── shallow-water/
│   │   │   ├── wind/
│   │   │   ├── player-controller/
│   │   │   └── navigation/
│   │   ├── composables/
│   │   ├── layers/
│   │   ├── providers/
│   │   ├── runtime/
│   │   ├── data-import/
│   │   ├── vendors/
│   │   ├── shaders/
│   │   ├── adapters/
│   │   ├── utils/
│   │   ├── types/
│   │   └── index.js
│   │
│   └── common/
│       ├── app/
│       ├── shell/
│       ├── components/
│       ├── ui/
│       ├── layer-tree/
│       ├── map-view/
│       ├── data-protocol/
│       ├── data-import/
│       ├── command-bus/
│       ├── url-state/
│       ├── user/
│       ├── chat/
│       ├── weather/
│       ├── compass/
│       ├── services/
│       ├── stores/
│       ├── utils/
│       └── index.js
│
├── api/
├── assets/
├── config/
├── constants/
├── locales/
├── router/
├── stores/
├── workers/
├── App.vue
├── main.js
└── cesium-shim.js
九、我建议的落地顺序
不要一次性全搬。建议分 6 步。

第 1 步：只建架构骨架和 alias

src/domains/ol/
src/domains/cesium/
src/domains/common/
先不搬业务。

只验证 Vite、ESLint、路径别名都正常。

第 2 步：迁移 Cesium 域
优先迁移：


components/Cesium/
→ domains/cesium/
这是收益最高、边界最清晰的一步。

迁完后，当前最别扭的结构就被解决：


components/Cesium/
不再存在，Cesium 成为正式一级领域。

第 3 步：迁移 Common Shell / Home
迁移：


views/HomeView.vue
views/home/
components/Shell/
components/Common/
到：


domains/common/app/
domains/common/shell/
domains/common/components/
这样应用壳和地图引擎分开。

第 4 步：迁移 OL Map 核心
迁移：


components/Map/
composables/map/
composables/tileSource/
到：


domains/ol/components/
domains/ol/*
但 composables/map/features/ 不要原样搬，要拆到：


ol/basemap/
ol/drawing/
ol/routing/
ol/spatial-analysis/
ol/startup/
ol/url-state/
ol/layer/
第 5 步：拆 Layer / TOC
迁移：


components/Layer/
composables/map/toc/
stores/layer/
拆成：


common/layer-tree/
ol/layer/
cesium/layers/
这一步风险较高，应该单独做。

第 6 步：拆 Data Import / GIS IO
迁移：


utils/gis/
composables/dataImport/
composables/useLayerDataImport.js
components/Cesium/composables/dataImport/
workers/
拆成：


common/data-import/
ol/data-import/
cesium/data-import/
这是最复杂的一步，最后做。

十、我建议你现在先确认的几个点
在我写正式 L3 方案文档前，你只需要决定这几个问题：

1. 顶层目录名是否接受 domains
我建议：


src/domains/ol
src/domains/cesium
src/domains/common
而不是：


src/Ol
src/Cesium
src/Common
原因是 domains 可以明确表示这是领域分层，不是随便建了三个大目录。

2. Cesium alias 用什么
我建议：


@ol/
@cesium-domain/
@common/
如果你觉得 @cesium-domain 太长，也可以：


@ol/
@cesium/
@common/
但 @cesium/ 可能和第三方 Cesium 概念混淆。

3. TOC / Layer 是否同意放 Common 为主
我建议：


common/layer-tree/   # 图层树 UI + 协议
ol/layer/            # OL 实现
cesium/layers/       # Cesium 实现
这比把 components/Layer/ 整个放 OL 更稳。

4. Data Import 是否同意拆三层
我建议：


common/data-import/  # parser / crs / archive / protocol
ol/data-import/      # OL adapter / renderer
cesium/data-import/  # Cesium loader / adapter
这样后续 KML、SHP、TIF 不会再散落四处。

我的建议版本
如果让我拍板，我建议采用这个：


frontend/src/domains/
├── ol/
├── cesium/
└── common/
并且先只做：


第一批：components/Cesium → domains/cesium
第二批：Shell/Home → domains/common
第三批：Map/composables/map → domains/ol
第四批：Layer/TOC
第五批：Data Import/GIS IO
这比一次性全项目大搬家安全很多，也符合你当前的主要痛点：

先把 Cesium 从 components 里解放出来。