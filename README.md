# NEGIAO's WebGIS（HENU 地理科学学院）
[查看本项目的详细分析](https://deepwiki.com/NEGIAO/WebGIS-Dev)
[查看部署效果（国内）](https://negiao-pages.share.connect.posit.cloud/WebGIS/index.html)


基于 Vue 3 + Vite + OpenLayers 构建的 WebGIS 项目，历经多次优化迭代，现已发展成为一个功能丰富、架构清晰的WebGIS平台。项目采用模块化组件设计，集成了 AI 助手、三维地球、Cesium电影级视觉效果、丰富多样的底图、鹰眼视图、实时坐标显示、视角 URL 同步、图层管理、矢量、栅格数据导入、矢量数据导出为txt\csv\geojson格式、WGS-84坐标与GCJ-02坐标系一键转换等多项核心功能，满足了从基础地图浏览到数据管理的多样化需求，未来将逐步扩展空间分析等诸多高级功能，坚持每日更新迭代。

> 本项目最初为大二下学期课程作业，开发周期为 5 月 28 日至 6 月 13 日。交付后曾暂时搁置，直至 11 月 28 日在专业知识与实践经验积累之下，再次启动并持续迭代优化，至今（文档撰写日期）已达到 V2.8.0 版本，实用性和美观度均有显著提升。

## 主要特性

# 🌍 专业级 WebGIS 综合开发平台

## 🚀 核心特性 (Key Features)

### 📂 图层管理 (TOC)
* **ArcGIS 风格交互**：右键菜单管理，支持图层右键样式编辑、标注信息、拖拽管理。
* **坐标动态重构**：内置 `WGS-84` 与 `GCJ-02` 自动纠偏，支持全图层一键重绘同步。
* **全能数据导出**：支持点/线/面导出为 `GeoJSON`、`CSV`、 `TXT`。

### 📥 多源数据引擎 (Data Engine)
* **矢量全兼容**：支持 `SHP` (Zip)、`KML/KMZ`、`GeoJSON` 拖拽上传与自动标注。
* **栅格可视化**：`GeoTIFF`（单/多波段）渲染，支持色带拉伸、NoData 透明及像元查询。
* **容器批处理**：支持 `Zip/KMZ` 及本地文件夹（`webkitdirectory`）递归扫描与全量导入。

### 🛠️ 交互与三维 (Analysis & 3D)
* **精准绘测**：交互式点/线/面绘制、几何测量，支持经纬度精确键入生成要素。
* **二三维联动**：集成 `CesiumJS` 地形渲染， `ECharts` 图表交互。
* **全域搜索**：内置天地图与高德地名搜索API 双搜索引擎，支持 40+ XYZ 切片底图。
* **APPLE 灵动岛 信息提示栏**：仿照 Apple 灵动岛设计的全局消息系统，支持队列管理、悬停暂停、立即关闭等交互，附带心灵鸡汤语录，提升用户体验。
* **特效加持**：首屏 Delaunay、流体、重力、奇点、波动五大视觉特效，提升用户体验。

### ⚡ 极致性能与 AI (Optimization & AI)
* **AI 空间助手**：集成 LLM API，提供 GIS 专业问答、操作指引及脚本辅助。
* **极致性能**：侧边栏延迟加支持超大数据量载，首屏提速 30-50%；导出性能预警。
* **全平台自适应**：响应式布局设计，完美适配移动端与桌面端交互体验。

## 快速开始

### 环境变量配置

复制 `.env.example` 为 `.env` 并配置必要的环境变量：

```bash
cp .env.example .env
```

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `VITE_TIANDITU_TK` | 天地图 API Token，[申请地址](https://console.tianditu.gov.cn/) | 推荐 |
| `VITE_LLM_API_KEY` | AI 助手 API Key，[申请地址](https://cloud.siliconflow.cn/) | 推荐 |
| `VITE_LLM_ENDPOINT` | LLM API 端点 (默认 SiliconFlow) | 可选 |
| `VITE_LLM_MODEL` | LLM 模型名称 (默认 DeepSeek-V2.5) | 可选 |

### 安装与运行

```bash
npm install
npm run dev
npm run build
```

### 本地瓦片资源

将瓦片放置在 `public/tiles/{z}/{x}/{y}.png` 目录下即可自动读取，可使用QGIS制作切片，也可贡献到项目中共享。

## 目录结构

```text
WebGIS_Dev/
├── public/
│   ├── images/                         # 站点静态资源目录
│   ├── tiles/                          # QGIS自制XYZ瓦片目录，按 public/tiles/{z}/{x}/{y}.png 组织
│   ├── ShareDate/                      # 共享资源目录：放置 KML/KMZ/GeoJSON/SHP/TIF 等数据文件
│   ├── min-enhanced.js                 # 第三方统计脚本延迟加载入口
│   ├── ol.js / ol.css                  # OpenLayers 备用静态资源
│   └── favicon.ico                     # 网站图标
├── src/
│   ├── App.vue                         # 根组件，承载 RouterView 输出
│   ├── main.js                         # Vue 应用启动入口，挂载 Pinia、Router 与全局消息宿主
│   ├── api/
│   │   ├── locationSearch.js           # [路由/网络封装] 3种服务地名检索封装与结果标准化
│   │   └── map.js                      # [天地图 API] 天地图/高德检索与逆地理编码请求封装
│   ├── components/
│   │   ├── AttributeTable.vue          # 属性表组件：要素属性展示、分页、搜索与地图交互（高亮/定位）
│   │   ├── BusPlannerPanel.vue         # 公交路径规划组件：交互设置起终点、调用天地图 API、结果展示与地图交互
│   │   ├── CesiumAdvancedEffects.vue   # Cesium 视觉处理与 ECharts 动态图表（3D 启用后懒加载）
│   │   ├── CesiumContainer.vue         # Cesium 2D/3D 切换承接组件
│   │   ├── ChatPanelContent.vue        # AI 助手组件（API曾被盗用，已限额，请自行配置API KEY进行使用）
│   │   ├── DrivingPlannerPanel.vue     # 驾车、步行路径规划组件：交互设置起终点、调用天地图 API、结果展示与地图交互
│   │   ├── LayerControlPanel.vue       # 底图控制面板组件（右上）：地名搜索 API、底图切换、底图拖拽管理、经纬网开关
│   │   ├── LayerPanel.vue              # ⭐TOC构建器：扁平图层→递归树结构、文件夹级联、拖拽排序、标注管理
│   │   ├── LocationSearch.vue          # 地名搜索API输入组件：支持天地图、高德双引擎，输入联想与结果选择
│   │   ├── MagicCursor.vue             # 首屏特效按钮：Delaunay、流体、重力、奇点、波动五大特效，提升用户体验
│   │   ├── MapContainer.vue            # ⭐ 主地图：地图初始化 + 全局编排 + 组件桥接
│   │   ├── MapEasterEgg.vue            # 彩蛋图片组件：区域判定、像素定位、缩略图和 Lightbox（作业）
│   │   ├── MapControlsBar.vue          # 经纬度、瓦片级别面板（显示坐标、缩放级别、修改坐标格式与home按钮）
│   │   ├── MapPointPickerCard.vue      # 地图起终点拾取（供路径规划使用）
│   │   ├── Message.vue                 # 消息通知组件（灵动岛效果）
│   │   ├── SidePanel.vue               # 右侧总控容器（资讯/LLM/TOC/公交/驾车规划）
│   │   ├── TOCPanel.vue                # TOC图层管理与控制面板：图层树、右键菜单、标注信息、拖拽排序、坐标切换
│   │   ├── TOCTreeItem.vue             # 递归树节点组件：右键菜单、悬停按钮、级联可见性、Teleport 固定菜单
│   │   ├── TopBar.vue                  # 顶部菜单栏：TOC、分享地点、分享视图URL、
│   │   └── icons/
│   │       ├── IconCommunity.vue       # 社区入口图标组件(未启用)
│   │       ├── IconDocumentation.vue   # 文档入口图标组件(未启用)
│   │       ├── IconEcosystem.vue       # 生态入口图标组件(未启用)
│   │       ├── IconSupport.vue         # 支持入口图标组件(未启用)
│   │       └── IconTooling.vue         # 工具入口图标组件(未启用)
│   ├── composables/
│   │   ├── 📁 [全局通用工具库（Global Utilities）]
│   │   ├── useGisLoader.ts             # 数据导入调度主实现
│   │   ├── useKmzLoader.js             # KMZ 解压、KML 提取与内部资源重写
│   │   ├── useLayerDataImport.js       # 容器数据导入总线，消费 packet 并创建图层（矢量/栅格统一落图）
│   │   ├── useManagedLayerRegistry.js  # 托管图层注册与对外状态广播
│   │   ├── useMapState.js              # ⭐ 地图状态管理引擎，处理 URL 同步（防抖）、图层切换、地形线渲染与视图动画
│   │   ├── useMessage.js               # 全局消息系统（队列、默认时长、宿主挂载）
│   │   ├── useMessageIslandMotion.js   # Message 交互计时控制（悬停暂停/恢复、立即关闭）
│   │   ├── useSharedResourceLoader.ts  # 共享资源加载器：动态扫描 public/ShareDate 目录、支持 KML/KMZ/GeoJSON/SHP/TIF 等格式
│   │   ├── useTileSourceFactory.ts     # 瓦片源工厂：XYZ/WMS/WMTS 格式识别、嗅探与源创建
│   │   ├── useUserLayerActions.js      # 图层动作集合（显隐、删除、排序、缩放、样式）
│   │   ├── useUserLocation.js          # 用户定位、国内外判定与定位更新策略
│   │   ├── 📁 [地图业务特性库（自MapContainer中解耦剥离）]
│   │   └── map/
│   │       └── features/
│   │           ├── README.md           # 地图功能库拆分约束与职责说明（一个功能一个库）
│   │           ├── index.js            # map feature 统一导出入口（barrel）
│   │           ├── useBasemapLayerBootstrap.js     # Phase 24: 底图层初始化与首屏监控挂载
│   │           ├── useBasemapSelectionWatcher.js   # Phase 23: 底图切换监听与可用性校验/自动兜底
│   │           ├── useBasemapResilience.js         # Phase 2: 底图切换验证、超时监测、兜底降级
│   │           ├── useBasemapStateManagement.js    # Phase 15: 底图状态管理（状态广播、源刷新）
│   │           ├── useBasemapUrlMapping.js         # Phase 3: 底图网址映射（索引翻译、分类、分组）
│   │           ├── useCoordinateSystemConversion.js # Phase 5: 提供坐标系转换功能
│   │           ├── useCreateManagedVectorLayer.js  # Phase 19: 托管矢量图层创建工厂（创建/登记/视图适配）
│   │           ├── useDeferredUserLayerApis.js      # Phase 22: 用户图层延迟 API 门面（动态导入+动作代理）
│   │           ├── useDrawMeasure.js               # Phase 1 → Phase 13 迁移: 绘制图形、测量距离/面积、提示管理
│   │           ├── useLayerContextMenuActions.js   # Phase 4: 图层右键菜单 URL 动作库
│   │           ├── useLayerControlHandlers.js       # Phase 21: 图层面板事件（切换/排序/自定义URL）
│   │           ├── useLayerMetadataNormalization.js # Phase 13: 图层元数据规范化与坐标推断
│   │           ├── useManagedFeatureHighlight.js   # Phase 11: 要素高亮样式生成与状态管理
│   │           ├── useManagedFeatureOperations.js  # Phase 16: 托管要素操作（查找、缩放）
│   │           ├── useManagedFeatureSerialization.js # Phase 6: 要素 ID 管理与 GeoJSON 序列化转换
│   │           ├── useManagedLayerStyle.js         # Phase 7: 托管图层样式归一化、标签生成与样式应用
│   │           ├── useMapEventHandlers.js          # Phase 17: 地图事件绑定、坐标同步与交互统一
│   │           ├── useMapSearchAndCoordinateInput.js # Phase 8: 地名搜索与坐标输入功能
│   │           ├── useMapUIEventHandlers.js        # Phase 18: UI 事件转发与属性表同步
│   │           ├── useRightDragZoom.js            # Phase 9: 地图右键拖拽框选缩放控制器
│   │           ├── useRouteRendering.js           # Phase 12: 公交/驾车路线绘制与缩放
│   │           ├── useRouteStepInteraction.js     # Phase 10: 路线步骤激活/预览状态与步骤缩放
│   │           ├── useRouteStepStyles.js          # Phase 10: 公交/驾车路线步骤样式生成与缓存
│   │           ├── useStartupTaskScheduler.js     # Phase 14: 首屏关键瓦片加载与非关键任务调度
│   │           └── useUserLayerApiFacade.js       # Phase 14: 用户图层 API 委托门面
│   ├── constants/
│   │   ├── goldenSoupQuotes.js         # 心灵鸡汤语录常量
│   │   ├── index.js                    # 常量目录统一导出入口（barrel）
│   │   ├── mapStyles.js                # 地图样式常量与样式工厂
│   │   ├── NON_STANDARD_XYZ_ADAPTER_EXAMPLES.ts   # 非标准xyz切片配置示例
│   │   ├── useBasemapManager.ts        # XYZ 瓦片图源配置
│   │   └── useStyleEditor.js           # 图层样式模板配置
│   ├── stores/
│   │   ├── index.ts                    # Store 目录统一导出入口
│   │   ├── useAttrStore.ts             # 属性表状态仓库（extent、要素展示上下文）
│   │   └── useLayerStore.ts            # Pinia 图层状态仓库（显隐、排序、样式状态）
│   ├── router/
│   │   └── index.js                    # Vue Router 路由表与 hash history 配置
│   ├── views/
│   │   ├── HomeView.vue                # 主页面布局、事件中枢
│   │   └── RegisterView.vue            # 登录页面
│   ├── utils/
|   |   ├── coordinateFormatter.js      # 坐标显示与输入解析工具，支持多格式显示与智能输入识别
|   |   ├── layerExportService.js       # 矢量数据导出服务，支持 CSV/TXT/GeoJSON 格式，自动附带 UTF-8 BOM 提升兼容性
│   │   ├── coordTransform.js           # [坐标转换] 常见坐标系经纬度转换与纠偏工具
│   │   ├── coordinateInputHandler.js   # [坐标输入] 手动输入经纬度校验、归一化与命名工具
│   │   ├── crsUtils.js                 # [坐标转换] CRS 识别、归一化与投影注册工具
│   │   ├── drawTransitRoute.ts         # [通用工具] 公交路线分段绘制与步骤高亮样式工具
│   │   ├── driveXmlParser.ts           # [文件解析] 天地图驾车 XML 结果解析器
│   │   ├── loadTiandituSdk.js          # [天地图 API] 天地图 SDK 按需加载与注入守卫
│   │   ├── transitRouteBuilder.js      # [通用工具] 公交/驾车结果到地图要素的构建工具
│   │   ├── userPositionCache.js        # [通用工具] 用户定位结果缓存与读取策略
│   │   ├── labelValidator.ts           # [验证工具] 标注内容有效性判断，支持乱码/无意义值过滤
│   │   └── gis/
│   │       ├── batchProcessor.js       # [文件解析] 容器内数据集分组、统计与批处理编排
│   │       ├── crsAware.js             # [坐标转换] 历史 CRS 识别兼容逻辑
│   │       ├── crs-engine.ts           # [坐标转换] 投影识别与 proj4 重投影执行引擎
│   │       ├── dataDispatcher.js       # [文件解析] 导入流程分发器（多格式识别、SHP sidecar 聚合、错误聚合）
│   │       ├── decompressFile.js       # [文件解析] 归档文件解压兼容入口
│   │       ├── decompressor.ts         # [文件解析] ZIP/KMZ 递归解压与资源扫描（支持子文件夹递归）
│   │       └── parsers/
│   │           ├── kmlParser.ts        # [文件解析] KML 几何与属性解析器
│   │           ├── shpParser.ts        # [文件解析] SHP 解析器（头部校验、dbf/shx 回退、PRJ 重投影）
│   │           └── tifLoader.ts        # [文件解析] TIFF/GeoTIFF 栅格载入与波段读取
│   ├── App.vue                         # 根组件，承载 RouterView 输出
│   └── main.js                         # Vue 应用启动入口，挂载 Pinia、Router 与全局消息宿主
├── docs/
│   └── BOUNDARY_INDEX.md               # 目录边界索引（由 docs:index 自动生成）
├── scripts/
│   └── generate-boundary-index.mjs     # 文档索引自动化脚本
├── package.json                        # 脚本与依赖配置
├── vite.config.js                      # Vite 构建与部署配置
└── README.md                           # 项目说明文档
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

## 版本记录

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
