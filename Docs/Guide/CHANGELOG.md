# 更新日志（CHANGELOG）

> 📌 本文件由根 [README](../../README.md) 的「版本演进」章节拆分而来，记录项目完整版本历史。最新版本摘要见 README「版本演进」章节。返回 [README 首页](../../README.md)。

---

## 版本记录

### V3.5.35 (2026-08-29) — 暂存区多批次归并：体积云天际线白闪修复 + 云↔大气互斥 + 天空旁路封堵 + 工具面板下拉白底白字修复 + 全项目同类排查 + 散项修复

> 本版本为暂存区多批次不规范提交（原临时编号 V3.5.35~36，含未记录散项）经整合 Code Review 后归并的**单一版本**。审查日志：`Docs/LLM_record/26-08/2026-08-29/2026-08-29-code-review-staged-v3535.md`；分项分析：`2026-08-29-fix-cloud-sky-flicker-mutex.md`、`2026-08-29-fix-ctp-select-dropdown-ui.md`、`2026-08-28-fix-atmosphere-autofade-dependency.md`。

> **1、根因修复——体积云天际线白屏闪烁**：开启体积云后近地面/天际线掠射带白屏闪烁。根因为启动时 `scene.backgroundColor = WHITE` + `skyBox.show=false` 与 Bruneton 管线（three-geospatial 移植）的黑太空设计假设冲突——掠射带 `eyePos.z` 深度抖动使 `hasScene`/`isSky` 帧间翻转，天空辉光与白底透传交替即白闪；其"天际线黑带救援"（`lum<0.04`）在白背景下永不命中。修复：管线启用时快照并压黑 `backgroundColor`，关闭/卸载时恢复（`setupCloudIntegration.js`）。排查要点："操控大气面板就不闪"是红鲱鱼——真实机制为 `applyBaseAtmosphereParams` 副作用重开 skyBox 把白背景换暗；首版"双地面大气叠加"假设被实测证伪（互斥逻辑保留，属独立行为规范）。

> **2、体积云↔地面大气双向互斥**：两套大气模型同时渲染同一批地面像素属架构性双重渲染。规则：开体积云 → 记录并关闭原生地面大气（面板同步熄灭）；关体积云 → 恢复开启前状态；手动开地面大气 → 自动关闭体积云。Tellux 主开关（启用路径硬写 `showGroundAtmosphere=true`）纳入同一互斥；`updateGroundAtmosphereFade` preRender 回调对旁路直写逐帧兜底压制。

> **3、天空状态旁路封堵**：新增 `isCloudPipelineActive(viewer)` 查询接口（WeakSet，管线就绪/销毁/失败同步注册注销），穷举门控原生天空 show 写入点——大气面板 `applyBaseAtmosphereParams`（skyBox）、`cesiumAtmosphere.js` 三函数（configureSolarLighting/configureRealisticAtmosphere/restoreRealisticAtmosphere）、Tellux 恢复路径（CesiumAdvancedEffects）、洪水模拟 prepareScene/restoreScene（FluidSimulationPanel）。未来新增写原生天空状态的代码前必须先查该接口。**整合 Review 补强两处**：① `FluidSimulationPanel.restoreScene` 的 `showGroundAtmosphere` 快照恢复原无门控（与同函数 skyAtmosphere 守卫不对称）——洪水模拟运行期间开启体积云后结束模拟，会把快照旧值写回重开地面大气（依赖逐帧兜底存在单帧双大气窗口），已补 `!isCloudPipelineActive(viewer)` 门控；② WeakSet 注册时序提前——原在 `createCloudAtmosphere` 纹理加载（4×8MB 可达数秒）完成后才注册，加载窗口期门控失效（白闪可复现），提前至 `applySkyOwnedByPipeline` 之前使所有权即刻生效；并修复 disposed 路径（加载中关闭/卸载）WeakSet 残留 + 天空状态停留接管态 + 连续渲染计数泄漏。

> **4、修复大气高度渐隐前提依赖缺失**：`groundAtmosphereAutoFade` 依赖 `showGroundAtmosphere` 开启，但控件未设依赖——地面大气关闭后渐隐开关与两档高度滑杆仍可操作。修复：渐隐开关补 `disabled: showGroundAtmosphere === false`，两滑杆 disabled 改为双重条件。

> **5、修复 Cesium 工具面板下拉列表白底白字（option 弹出层 UI 接线）**：暗色浮层中下拉展开后 `<option>` 弹出层为浏览器默认白底，文字继承面板浅色字（`--ctp-text`）→ 白底白字不可读。涉及两类来源：① 模板级原生 `<select>`（WMS 图层选择器、远程 3D 服务类型）；② modules 模块卡片内嵌下拉——`LilGuiControls.vue` 内 lil-gui 运行时注入的 `<select class="lil-selector">`（全部 `type:'select'` 控件，Cinematic FX/流体面板复用）。修复：select 声明 `color-scheme: dark`；新增 option 配色块——暗底 `--ctp-option-bg`（激活主题预留悬空令牌）+ 浅色字 `--ctp-text`，hover/checked 复用「深绿选中族」令牌；模板级 select 另有 `.is-embedded` 嵌入亮色态回退白底深字。**全项目同类排查**：13 文件 22 处原生 select 逐一核验，其余均处亮色宿主（深色字）无同类缺陷，无新增修复项。

> **6、Chat 个人 Key 模式模型选择修复**：① reload 优先级修正——旧逻辑把 `pool[0]` 排在 `dc.model` 之前，localStorage 为空时 reload 用列表第一项覆盖用户已保存/刚选的模型，改为「已保存选择 → dc.model → 首个可聊模型」三级优先；② 个人 Key 模式补 `saveModel` 持久化（按模式隔离存储，与默认 AI 模式同口径），此前漏写导致 reload 永远走兜底链。

> **7、TOC 关闭按钮图标化 + 分享文案 emoji 清理**：TOCPanel 关闭按钮由文字按钮改为 Lucide `X` 图标（新增 `.toc-icon-btn` 样式，符合 UI 图标规范）；`shareCopied` 中英文文案移除 emoji 前缀（toast 文案规范化）。

> **涉及文件**：`frontend/src/domains/cesium/modules/cloud/{setupCloudIntegration,index,cloudQualityPresets}.js`、`modules/cloud/lib/ThreeGeospatialPipeline.js`（排查注释）、`modules/fluid-simulation/FluidSimulationPanel.vue`、`composables/toolModules/{useCesiumToolModules,atmosphereModule}.js`、`components/{CesiumContainer,CesiumAdvancedEffects,CesiumToolPanel,LilGuiControls}.vue`、`composables/scene/cesiumAtmosphere.js`、`domains/common/chat/composables/useChatAgentConfig.js`、`domains/common/layer-tree/components/TOCPanel.vue`、`locales/{zh-CN,en-US}.js`。

### V3.5.34 (2026-08-28) — 大气渲染修复与增强 + HENU 矢量瓦片全链修复 + Chat 配置面板改版

> 本版本为暂存区多批次不规范提交（原临时编号 V3.5.34~35）经整合 Code Review 后归并的**单一版本**。审查日志：`Docs/LLM_record/26-08/2026-08-28/2026-08-28-code-review-staged-v3534.md`；分项分析：`2026-08-28-fix-skyatmosphere-lightintensity.md`、`2026-08-28-fix-henu-vectortile-layer-type-mismatch.md`、`2026-08-28-feat-vectortile-server-style.md`。

> **1、修复天空大气光强参数失效**：Cesium 1.121（2024-09 大气系统统一重构）将 `SkyAtmosphere.lightIntensity` 更名为 `atmosphereLightIntensity`（引擎默认值 50）。项目使用 Cesium 1.132，`CesiumContainer.vue` 的 `applyBaseAtmosphereParams` 仍写旧属性名，且赋值前有 `if ('lightIntensity' in sky)` 防御检查——旧属性在实例上不存在，赋值被**静默跳过**（无报错），实际光强一直停留在引擎默认 50。修复：优先写入 `atmosphereLightIntensity` 并保留旧属性名 `else if` 兼容回退（支持 Cesium < 1.121）；`atmosphereModule.js` 滑杆上限 30 → 100（引擎默认 50 高于原上限）。修复后参数真实生效，配置默认值 16 低于引擎默认 50，光晕比失效期间略暗属预期；调到 >50 可获得更亮光晕。

> **2、修复 HENU 边界矢量瓦片在 OL 中渲染空白**：图层类型与 source 类型错配——启动引导期不可见图层以 `createRasterBasemapLayer(null)` 创建为 **TileLayer** 占位；切换挂载时 `useMapState.js` 的 `ensureLayerSourceById` 用 `cfg.createSource()` 产出 **VectorTileSource** 后直接 `layer.setSource()`——OL 的 TileLayer 渲染器只能消费 image 瓦片，VectorTileSource 的要素瓦片无 image 可画，导致**有网络请求、无画面**（网络/数据层因素已实测排除：瓦片 200、合法 MVT、无 gzip、CORS 正常、512px 网格吻合）。同型隐患存在于 `refreshAllBasemapSourcesForHD()`，且其"本系统暂无矢量瓦片、一律跳过 VectorTile"分支属错误假设。修复：① `basemapLayerFactory.js` 新增共享助手 `applyBasemapSourceToLayer()`——类型一致轻量 `setSource`，不一致按旧图层 visible/zIndex/opacity 经 `createBasemapLayerFromSource` 重建图层实例，调用方负责 `map.removeLayer/addLayer` 替换并同步 instanceMap；② `ensureLayerSourceById` 接入助手；③ `refreshAllBasemapSourcesForHD` 移除矢量跳过分支、接入助手并新增 `mapInstanceRef` 注入（MapContainer 同步传参）。

> **3、新增矢量瓦片服务端样式适配器（零依赖）**：矢量瓦片可加载后仍用通用兜底样式，未应用 ArcGIS 下发的 Mapbox 样式。新增 `vectorTileStyleAdapter.js`（项目无 ol-mapbox-style，不新增依赖）：从瓦片 URL 模板推导 `resources/styles/root.json`，编译为 OL StyleFunction（line/fill/circle 基础 paint + 最小 filter 表达式；symbol/text 与 paint 表达式明确降级），`createVectorTileBasemapLayer` 创建后异步拉取应用——成功前/失败时保持兜底样式渐进增强，未命中要素回退兜底保证不丢。HENU 边界渲染为"黑主线+紫晕线+浅色宽晕"，未定国界为虚线。**整合 Review 补强**：filter `==/!=` 改宽松相等（MVT 属性常以 string 编码，如 `_symbol: "0"` vs 数值 0，对齐 Mapbox legacy 语义）；`line-dasharray` 仅接受全有限数值数组常量，表达式形态安全忽略防 NaN 污染 Stroke。

> **4、新增地面大气相机高度渐隐 + 大气光强链路收敛**：地面大气按相机高度 smoothstep 渐隐（低于下限全关：市/城乡/建筑尺度；高于上限全开：省/国家级），`applyAtmosphereParams` 与渐隐共用 `computeGroundAtmosphereBaseIntensity()` 同一基准（基础滑块值 + Tellux 月光增益）。**整合 Review 修复两处**：① preRender 帧回调节流条件 `fadeStep < 0.002 && factor !== 0` 在低空视角（factor 恒 0）永不成立，导致每帧写属性 + `requestRender()`，把 requestRenderMode 按需渲染打回连续渲染——改为"系数未显著变化纯读返回，仅从正系数首次落到 0 强制落盘"，恢复空闲零开销；② 光强硬钳位 `Math.min(base + moonBoost, 12.0)` 在滑杆默认值提到 16（max 25）后把 12 以上行程静默吞掉——钳位下限改为随基准值抬升 `Math.max(base, 12.0)`，月光增益仍受软顶控制。另：`initViewer` 设 `useBrowserRecommendedResolution: false` 按物理像素渲染（Windows 125%/150% 缩放下瓦片不再被拉伸发虚；HiDPI 交互期填充成本上升，已有 requestRenderMode 按需渲染兜底）；`cesiumAtmosphere.js` 写实天空大气光强 12→20；大气面板补 hue/saturation/brightness shift 与天空大气光强/亮度/饱和度/瑞利标高滑杆（i18n 双语）。

> **5、Chat 配置面板改版**：四卡片（接入凭据/模型/生成参数/系统提示词）支持折叠（默认仅展开"模型"），`ChatPanelContent` 顶部滚动区封顶 max-height 55% 防止展开后挤占消息区；模型下拉改为独立过滤词 `modelQuery`（不再拿常驻的 draft.model 当过滤词），模型选择改为"仅改草稿、点保存设置后生效"语义（`defaultAIModel` 为默认 AI 模式实际请求模型源；v2 存储 key 使历史脏数据一次性失效）；`resetProviderOverrides` 修复默认 AI 模式误清 `directConfig`（存管理员 base_url/model）与后端代理模式重置形同未做（三处"上次选择"来源全清）。

> **涉及文件**：`frontend/src/domains/cesium/components/CesiumContainer.vue`、`frontend/src/domains/cesium/composables/scene/cesiumAtmosphere.js`、`frontend/src/domains/cesium/composables/toolModules/atmosphereModule.js`、`frontend/src/domains/cesium/composables/toolModules/useCesiumToolModules.js`、`frontend/src/domains/ol/basemap/composables/basemapLayerFactory.js`、`frontend/src/domains/ol/basemap/composables/vectorTileStyleAdapter.js`（新增）、`frontend/src/domains/ol/basemap/composables/useBasemapStateManagement.js`、`frontend/src/domains/ol/composables/useMapState.js`、`frontend/src/domains/ol/components/MapContainer.vue`、`frontend/src/domains/common/chat/components/ChatConfigPanel.vue`、`frontend/src/domains/common/chat/components/ChatPanelContent.vue`、`frontend/src/domains/common/chat/composables/useChatAgentConfig.js`、`frontend/src/locales/zh-CN.js`、`frontend/src/locales/en-US.js`。

### V3.5.33 (2026-08-27) — 全项目审查离散缺陷集中修复

> 本版本为 2026-08-27 四维全项目 Code Review（后端安全 / 前端质量 / 性能泄漏 / V3.5.30~32 回归风险）的离散缺陷集中修复，多会话产出归并为单一版本。完整分析：`Docs/LLM_record/26-08/2026-08-27/2026-08-27-full-project-code-review-and-fixes.md`。结构性重构（大文件拆分、API /api/v1 前缀迁移、TS strict、连接池）单独评估不在此列。

> 1、回归修复（V3.5.30~32 引入）：① TOCPanel 绘制页入口 `handleInteraction` 固定驱动 OL 地图 → 委托引擎感知的 `handleControlsMapInteraction`，HomeView 九个公交/驾车桥接统一 `callCesiumBridge()`（容器未就绪显式 reject，消除"静默成功"误判）；② viewer 重试重建后 TOC 僵尸档案——useCesiumDrawMeasure/useCesiumRouteRendering 的 reset() 补 purgeRecord 清档；③ unifiedActionRouter 检测 thenable 并 `.catch` 包装，异步 rejection 不再逃逸也不再被误记"已处理"；④ useChatSession 移除 sessions 深度 watch（流式期间逐字深遍历 + 全量 JSON.stringify 卡顿），改 11 个离散变更点显式 schedulePersist，ChatPanelContent 在流结束边界（完成/出错/停止）通知；onScopeDispose 时 pending 防抖先同步 flush 再清理（防关闭面板丢最近改动）；⑤ AttributeTable / MapDownloader 改 defineAsyncComponent 异步加载，移出首屏 chunk。
> 2、安全加固：① location.py 私有符号导入消除——新增公开鉴权依赖 `resolve_optional_session()`（auth/dependencies.py），删除本地重复实现；② DEV_DEFAULT_ADMIN_PASSWORD 单源 config/catalog.py。（管理端数据浏览器维持现状：admin 即最高权限，允许对任意表增删改，未引入表级写白名单）
> 3、性能与正确性：① loadedDataSources/wind2D 改 shallowRef（消除 Cesium 原生句柄双身份，写入点均为整组替换已核实安全）；② CesiumAdvancedEffects preRender uniform 变更检测门控（fog/HBAO/tiltShift/atmosphere 各自缓存上次值，requestRenderMode 下相机静止不再反复写入打断脏检查）；③ finishInteraction 成品落盘 try/catch 回滚半成品实体；detachEntityFromScene 地形分支补 Cesium 构造器守卫；clearAllDataSources 回退分支补可观测 warn；文件夹清空 toast 文案改为进行时语义（i18n 双语同步）。
> 4、单源收敛：① 新增 common/utils/datetime.js（parseDateValue/formatDateTime/formatTimeShort/formatDateEpoch），六处重复日期格式化全部接入薄包装并保留各自回退语义；② 新增 common/utils/mapDefaults.js（DEFAULT_SEARCH_ZOOM/MAX_SEARCH_ZOOM），GISCommander/useMapState.locateAddress/chatIntentFallback/agentToolsSchema 四处 zoom=16 魔法数字统一；③ compat.js nadir 公式委托 cesiumScale.js 单源。
> 5、死代码清理（均经零引用验证）：GeoWTFS.js(1053 行)、universalAmapParser(298)、MapEasterEgg.vue(285)、vectorWorkerUtils(128)、interactionHandlers(31)、useDataManager(341)、routeService(3)、loadTiandituSdk(95) 及 frontend/.tmp-test/*.mjs 调试脚本 ×4。

### V3.5.31 (2026-08-26) — 统一图层管理 P0~P2 全链落地 + OL↔Cesium 视图尺度系统

> 本版本整合原多批次中间提交（曾临时编号 V3.5.31~V3.5.34）为单一版本。计划文档：Docs/TODO/unified-layer-management-refactor-plan.md（L3，用户批准执行）、Docs/TODO/ol2cesium.md。

### V3.5.32 (2026-08-27) — 统一图层管理 P0~P2 全链落地与 OL↔Cesium 视图尺度系统（引擎感知迁移）

> 本版本落实 P0~P2 同时执行：绘制/测量引擎化、常用地点引擎化、公交/驾车规划引擎化；死代码清理；版本文档 SSOT 收敛至 V3.5.32。

> 1、绘制/测量：新增 useCesiumDrawMeasure.js 管理器，ScreenSpaceEventHandler 交互（点/线/面/测距/测面/清空/撤销），EllipsoidGeodesic 表面距离+ENU shoelace 面积，成品实体贴地（点 heightReference/polyline clampToGround/地面多边形）+测量结果标签，TOC 建档 category='draw' 进「三维数据」分组；HomeView 3处 handler 引擎分支；i18n 双语提示
> 2、常用地点：handleTopBarJumpView 引擎分支，3D 下用 olZoomToCesiumHeight 把 OL z 换算为 Cesium 相机高度，l 参数同步 activeBasemap.value；纯视口跳转，无 TOC 注册需求
> 3、公交/驾车规划：新增 useCesiumRouteRendering.js，解析天地图 route/payload 结果（纯函数，不导入 @ol），贴地折线（步行段细线+低透明度、驾车段实线brand色），站点点+label，步骤定位/预览/清理，注册 category='route' 进「三维数据」分组；SidePanel/RoutesPlannerPanel 9个桥接函数按引擎注入对应实现；startPointPick Promise 语义对齐

> 4、修复（渲染崩溃级）：`useCesiumDrawMeasure.js#updatePreviewText` 曾把 `Cartesian3` 点集误当 OpenLayers 的 `[lng,lat,h]` 数组下标访问（`positions[0][0]` 等全为 `undefined`），`Cartesian3.fromDegrees(NaN,…)` 生成 NaN position 预览 Label，导致 Cesium 渲染视锥裁剪 `createPotentiallyVisibleSet` 抛 `RangeError: Invalid array length` 停止渲染；已改为按 Cartesian3 `x/y/z` 语义计算点/线/面预览锚点并做有限性校验。

> 5、修复（数据同步级）：TOC 移除数据源后 Cesium 场景不同步移除——`registerExternalDataSource` type 缺省 `'3dtiles'`，Ion 影像（ImageryLayer）/Ion 地形（TerrainProvider）注册时未传 type 被错记，删除时按字符串分派走 `primitives.remove(...)` 静默 no-op，而 loadedDataSources 已无条件删档 → watch → syncFromImport 删 TOC 记录，形成「TOC 已删档、场景仍渲染」不同步；新增 `loaders/utils.js#detachEntityFromScene` 对象级宿主探测卸载（entities/dataSources/imageryLayers/primitives 的 contains 引用比较分派 + TerrainProvider 特判复位椭球地形），`removeDataSource` / `clearAllDataSources` 探测优先、未命中回退 type 分支；注册处补准确 type（'imagery'/'terrain'）；配套 TYPE_LABELS（影像/地形）、OPACITY_SUPPORTED_TYPES+'imagery'、setRecordOpacity case 'imagery'。

> 6、修复（绘制/测量标注残留，用户复测定位）：① `useCesiumDrawMeasure.js#cancelActive` 只清理 `active.sketch` 与事件句柄，独立创建的 `active.previewLabel`（预览 Label 实体）从未摘除——每次绘制/测量交互都向 viewer.entities 泄漏一个不入任何句柄表的孤儿实体，且 updatePreviewText 每帧把其 position 静态化，所有 TOC 移除/清空链路均无法触达 → 已在 cancelActive 显式移除并置 null；② 绘制管理器 removeHandle 增加删除回执强校验（remove 返回值 + contains 兜底判定，幸存实体二次强制移除并 console.warn），useCesiumRouteRendering.removeHandle 同款对齐——把「链路已走完但场景仍显示」从静默降级为显式可观测告警。

> 7、整合会话 Code Review（暂存区多批次归并为 V3.5.32 单一版本）：① 根 README「项目简介·当前版本」仍停留 V3.5.31（vite 构建自此行正则提取 `__APP_VERSION__`）→ 同步 V3.5.32；② frontend-structure.md 结构树 scenePicker.js 画在 composables 层级且注释张冠李戴（其真实职责是 pickEarthPoint 场景取点，非坐标串解析）→ 归位 draw/ 目录并修正注释，toolModules 注释恢复通顺表述；③ `activateInteraction('Clear')` 只清成品句柄表不终止进行中交互（sketch/handler 存活，清空后继续点击会向场景追加脏数据）→ Clear 分支先 cancelActive 再 clearAllDrawings；④ 双击结束绘制前 Cesium 先派发两次 LEFT_CLICK 致末端重复点（测距虚高、线面赘点，右击结束无此现象）→ 新增 clickPixels 屏幕像素记录，finishInteraction 对末两点 ≤3px 像素间距去重；⑤ TODO 方案文档状态行「待用户批准」与现实矛盾 → 更新为已实施并附裁决结论。

> <!--
> 待后续补充：
> - capabilitiesProxy 兜底逻辑
> - WMS 默认全选语义
> - 文件夹级清空图层
> - viewer 销毁链 creditDisplay 补丁
> -->

#### 二、视图尺度系统补缺（P0/P1/P2）

- **viewScale/ 八模块**：解析模型+射线实测 Precision 校正；修复射线实测双重解包、compat 层旧签名丢失(mapSize/cesiumFovy/clamp)、校正环绝对容差失真三处缺陷
- **OPACITY_SUPPORTED_TYPES**：新增 draw；route 材质透明度基线在创建时固化，暂不开放
- **MANAGED_CATEGORIES**：draw / route 类记录由管理器句柄表驱动生命周期，不随 loadedDataSources 变化被清除
- **registerDrawing / remove / purgeRecord**：新增/修正引擎感知路由记录生命周期管理

#### 一、统一图层管理架构（P0/P1）
- **P0-1 引擎状态贯通**：HomeView → SidePanel → TOCPanel 新增 active-engine prop 链（'ol' | 'cesium'），TOC 首次感知当前引擎。
- **P0-2 zoom 按引擎分发**：zoomViaEngine 支持优先引擎参数——3D 模式下在线服务定位走 cesiumRemoteAdapter.flyTo，不再误飞 v-show 隐藏的 OL 地图；失败自动回退另一引擎。
- **P0-3 identify 常驻绑定确认**：rsvcInitTimer 轮询 + 无早退守卫已由前置批次落地（本轮核验）。
- **P0-4 :L: 复合 id 移除：跳过** —— 与现状路由协议冲突，依赖「子图层独立记录」专项先行，见 remote-service-sublayer-independent-layers-plan.md。
- **P1 统一 Action Router**：新增 common/layer-tree/actions/unifiedActionRouter.js（registerEngineHandlers / unregisterEngineHandlers / dispatchLayerAction），MapContainer 与 CesiumContainer 各自注册处理器并在 onUnmounted 反注册；HomeView 四个高频 handler（显隐/透明度/移除/定位）切换按引擎路由。
- **同批审查修复**：CesiumContainer adapter 调用签名修正（ops 处理器为对象解构签名，位置传参导致调用空转）；TOCTreeItem drag/drop 载荷变更兼容（contextActionManager 与 rsvc 分流器补 targetId ?? layerId 兼容读取）。

#### 二、统一图层管理拆分与收编（P2 两批次）
- **组合式函数产出**：useGeocoding.js（坐标三件套/地理编码+逆编码属性拼装/AOI 对话框状态机）、useTreeActionDispatcher.js（树动作分发+多选集递归/分块+拖拽排序委托）、useFileUpload.js（上传触发+200MB 校验+进度视图）、useSharedResources.js（共享资源扫描/加载包装）。
- **TOCPanel 宿主接线**：2977 → 2327 行瘦身 22%；dispatcher 暴露 syncUserLayers 由宿主 watch 转调保持原同步语义。
- **死代码清理**：LayerPanel 删 7 个死 props、TOCPanel 删 3 个死 emits（show-layer-properties 改经 dispatcher 直写 uiState）、SidePanel 删 4 个死事件中继（request/clear-download-extent 等，MapDownloader 实际不发出）。
- **文件夹级「清空图层」全类型接入**：protocol 新增 FOLDER_CLEAR_LAYERS；contextMenu 文件夹分支渲染危险项；remoteServiceTocActions（组头=注销全部/单服务=注销该服务）、cesiumTocActions、TOCPanel 普通分组三路消费；三大分组组头补 actions.remove 能力声明。
- **子图层叶子「取消叠加」升级为「移除」**：remoteServices 新增 removeRemoteServiceSublayer（sublayers/selectedIds/layerOrder 三处剔除，删至最后一个自动注销）；effectiveSelectedIds 消费端唯一入口——WMS/ArcGIS 动态服务默认全选语义 + 存量空选记录自愈（selectionTouched 触碰标记）。
- **三维数据收编统一 TOC**：CesiumToolPanel data tab 只留导入（删除「已加载数据列表」整块 UI 与无人消费的 request-range-sample 采样链）；管理动作全部走 TOC 右键菜单——「调整高程」（菜单内嵌滑杆，范围=基座高±100m）、「材质模式」（五选一下拉）、「调整位置」（GLTF 重定位复用既有坐标弹窗）、「拉伸至高程」（GeoTIFF）；cesiumLayers store 补 baseHeight/heightRange/materialMode 建档与 setBaseHeight/setMaterialMode/requestReposition/requestStretchHeight 双向回写；syncFromImport 投影高程初值回退链。
- **i18n**：补齐 layer.nothingToClear / layer.folderCleared 中英文案。

#### 三、OL↔Cesium 视图尺度系统（Canonical Ground Resolution）
- **模块化架构**：common/utils/viewScale/ 八模块——constants（常量 SSOT）/ precision / webMercator / openlayersScale / cesiumScale / conversion / compat / browserAdapter + index 桶式入口；旧 viewScaleConverter.js 降级为兼容再导出 shim。
- **解析模型**：nadir 精确式 G=2h·tan(fovY/2)/vh；任意 pitch 斜距近似及逆变换；正俯视球面弦长闭式解 measureNadirSphereChord + 一次比例迭代将平面/球面系统差压至 ULP 级。
- **射线测量（Precision）**：pickRay→globe.pick 相邻像素距离采样（中心+四邻候选回退），Terrain 自动生效；solveCameraHeightBinary 二分求解供 Terrain 场景数值收敛；模式切换结束做一次比例校正消除曲率系统差。
- **HomeView 接入**：buildCesiumQueryPatchFromOl → convertOlViewToCesium（earthModel:'sphere'）；syncOlFromCesiumPayload → convertCesiumViewToOl（注入射线实测优先）；URL z 序列化三处统一保留两位小数（米级高度精度充裕，URL 简洁；中间换算全程全精度，仅序列化端量化）；负零归一化杜绝 '-0.00'。
- **启动白屏修复**：constants.js 补齐 MIN_CESIUM_HEIGHT/MAX_CESIUM_HEIGHT/MIN_OL_ZOOM/MAX_OL_ZOOM 兼容导出，修复 ESM 具名导出缺失导致的 main.js SyntaxError。
- **OL→Cesium 极近视角修复**：切引擎时换算失败不再残留 OL 缩放级别 z——useMapViewUrlState 无条件写入默认相机高度 + buildCesiumQueryPatchFromOl 失败兜底米制补丁。
- **验收**：z=4 往返 400 轮 max|Δzoom|=0（6dp 序列化下字符串级恒等；后按用户裁决收敛为 2dp 序列化，量化误差 ≤ 半米级高度 / 0.005 级 zoom，视觉无感）；小数 zoom（5.32/8.716/12.00453）×20 轮稳定；详见[维护日志](../LLM_record/26-08/26-08-26/2026-08-26-ol-cesium-z4-roundtrip-acceptance.md)。

#### 四、整合会话 Code Review 修复（本批次）
- **P1 射线实测双重解包**：HomeView.syncOlFromCesiumPayload 对 cesiumContainerRef.measureGroundResolution()（已返回 number）再取 `.groundResolution` 恒为 undefined → 3D→OL Precision 链路完全失效，静默退化为解析模型。已去除多余解包。
- **P1 compat 层旧签名回归**：viewScale 模块化后 olZoomToCesiumHeight 仅认 viewportHeight/fovY，而 mapCommandAdapters.js 仍传 mapSize/cesiumFovy/clamp → 视口高度恒回落 768、Cesium 实际 fovy 被忽略、clamp 失效。compat.js 补齐三个旧参数别名支持并恢复严格互逆（cesiumHeightToOlZoom 同步改走带纬度钳制的 groundResolutionToWebMercatorResolution）。Node 实测新旧两签名往返均零漂移。
- **P2 Precision 校正环容差失真**：setMapView 校正判定 nearlyEqual(measured, targetG, 1, 1e-6) 的绝对容差 1 m/px 在近距视角（G≈0.1~1 m/px）会吞掉全部校正需求，改为纯相对判定（1e-9, 1e-6）。
- **P2 SSOT 死代码清理**：删除 viewScale/canonicalScale.js——全仓零引用且与 conversion.js 存在同名导出（canonicalScaleToCesiumView/OlView），双事实源隐患。
- **P3**：precision.js 钳制函数改用 constants SSOT 边界（值不变）；useCesiumToolModules showGroundAtmosphere 注释与取值对齐（false=关闭）。

---

### V3.5.30 (2026-08-25) — 在线服务子图层独立管理与双引擎点击查询

> 本版本整合了 V3.5.30~V3.5.38 多个中间版本的在线服务功能开发，统一为一个提交。

- **WMS/ArcGIS/XYZ/WMTS 四协议统一注册 TOC**：新增 remoteServices 注册表（会话态）+ remoteServiceNodeBuilder（TOC 节点构建）+ remoteServiceTocActions（TOC 动作分流），支持服务 folder + 子图层叶子两级树结构。
- **ArcGIS 动态服务拆分渲染**：每个勾选子图层独立 export 请求（客户端 zIndex 控制叠放，拖拽即时生效）；`usesPerSublayerRequests` 判定 + `renderOrderedIds`/`visualOrderedSublayerIds` 视觉序。
- **点击查询弃用 identify 改用 query**：`/{layerId}/query` 精确点查替代 `/identify`（消除 top/all 语义歧义）；按视觉叠放序取第一个有要素的子层展示。
- **属性表精确拉取**：右键打开属性表按子层 `/{layerId}/query?outFields=*&returnGeometry=false` 拉取，字段别名映射、esri 类型转换、多子层合并含「子图层」来源列。
- **Cesium 适配器**：per-sublayer split 渲染 + viewer 就绪自愈挂载 + 常驻点击查询监听 + restack 方向修正。
- **OL adapter**：per-sublayer split 渲染 + splitZIndex 子带内排序 + custom 底图实例退位（渲染收口注册表）+ 地图就绪补挂 watch。
- **TOC 集成**：buildRemoteServiceGroup 注入 layerStore.layerTree；handleRemoteServiceTreeAction 分流器直调注册表；LayerPanel rsvc folder 显隐原样上抛。
- **会话态生命周期**：注册表不做 localStorage 持久化，刷新即清（对齐 cesiumLayers 容器卸载即清档模式）。

### V3.5.29 及更早

### V3.5.38 (2026-08-25) — 在线服务注册表 Code Review 修复与优化

- **背景**：对暂存区「在线服务 XYZ/WMTS 统一接入」批次（V3.5.36/37）全面 Code Review，发现 2 个 P0 功能缺陷、4 个 P1 及多项结构问题。
- **P0 修复**：① `computeLayersParam` 排除式分支 `kind !== 'wms'` 使 WMTS 记录误入 ArcGIS 分支被加 `show:` 前缀 → 双引擎 WMTS 渲染全失效；改为按 kind 显式枚举（arcgis export 才用 `show:` 语法），新增 kind 默认安全兜底。② Cesium zyx「占位符换位」基于对 UrlTemplateImageryProvider 具名替换机制的错误认知 → 换位反而破坏 `{z}/{y}/{x}` 模板致瓦片错位；删除换位逻辑原样传入。
- **P1 修复**：③ Cesium restack 循环方向修正为头→尾（后注册者居上），与 OL zIndex 正向映射语义对齐。④ WMS「全不勾」语义裁决为空 LAYERS（不复活初始组合），修正字段注释矛盾。⑤ 结构树门禁补录 7 个漏登记文件至 frontend-structure.md 并跑至绿。⑥ 版本号治理：V3.5.35 下两条「同日补充」追认为 V3.5.36/V3.5.37 独立条目。
- **结构优化（SSOT 收敛）**：`parseRsvcNodeId`（节点 id 协议解析）、`renderSignature`（渲染签名）、`RSVC_GROUP_NODE_ID`(分组 id) 下沉 remoteServices.ts 唯一实现——此前 id 解析三处重复、签名双份复制、常量双导出 + LayerPanel 字面量硬编码；双 adapter dispose 补 `unregisterRsvcEngineApi` 反注册消除引擎切换 stale closure；zoomTo 入参语义纯净化（serviceId 不再剥前缀）；detectTileYScheme 正则 Annex B 遗留写法 `[^]` → `[\s\S]`。
- **验证**：vite build 通过；CheckStructureTree / CheckConfigRegistry 双门禁绿。
- **日志**：[2026-08-25-remote-service-code-review-fixes](../LLM_record/26-08/2026-08-25/2026-08-25-remote-service-code-review-fixes.md)

### V3.5.37 (2026-08-25) — 在线服务 XYZ/WMTS 统一接入 TOC（追认）

> 原记录于 V3.5.35「同日补充 3」，按版本号规范（每个 L2 任务独立 +1 修订号）追认为独立版本。

- **内容**：kind 扩展至四协议（`wms|arcgis|xyz|wmts`），新增纯 JS 解析模块 `xyzWmtsCapabilities.js`（行序判定 + WMTS Capabilities 解析）；OL/Cesium 双 adapter 各增 xyz/wmts 分支（OL WMTS 走异步建源 + 矩阵集投影三级匹配）；loadCustomMap 扩展注册分支并抽取 custom 实例退位复用函数；随 Cesium 渲染端落地移除引擎过滤及 `activeTocEngine` 死代码；清理调试残留 probe_check.ts 与根目录 nul。
- **日志**：[2026-08-25-remote-service-xyz-wmts-toc](../LLM_record/26-08/2026-08-25/2026-08-25-remote-service-xyz-wmts-toc.md)
- **同日补充**：WMS queryable 提取缺失 + GetFeatureInfo 未实现双断点修复（identify 链路扩展）。见 [2026-08-25-fix-remote-service-query-preserve](../LLM_record/26-08/2026-08-25/2026-08-25-fix-remote-service-query-preserve.md)；OL adapter 补 viewer 就绪自愈 watch。

### V3.5.36 (2026-08-25) — 在线服务 TOC 架构加固（追认）

> 原记录于 V3.5.35「同日补充 2」，按版本号规范（每个 L2 任务独立 +1 修订号）追认为独立版本。

- **内容**：① 消除双通道重复渲染——WMS/ArcGIS 注册成功后 custom 底图实例退位，渲染统一收口注册表 adapter；② OL adapter 地图就绪补挂 watch；③ 新增 `activeTocEngine` 引擎过滤（V3.5.37 已随 Cesium 落地移除）；④ 函数签名格式修复。
- **日志**：[2026-08-25-remote-service-toc-architecture-fixes](../LLM_record/26-08/2026-08-25/2026-08-25-remote-service-toc-architecture-fixes.md)

### V3.5.35 (2026-08-25) — 图层面板层叠顺序反向修复

- **背景**：图层控制面板中，列表顶部的底图/叠加图层在地图上反而被压在最底层，拖拽排序/右键"移到顶部"的实际渲染效果与面板显示顺序相反。
- **根因**：两套 zIndex 分配语义不一致——TOC 数据托管图层（`refreshUserLayerZIndex`）用 `Z_BAND.DATA + (N - 1 - index)` 反向映射（index 0 = 顶部 = 最高 z，正确）；而底图/叠加列表面板的 `refreshLayerInstances`（useMapState.js）与 `initializeBasemapLayers`（useBasemapLayerBootstrap.js）用 `zBand + index` 正向映射，且面板 `v-for` 直接按数组序渲染、"移到顶部"即 `dropIndex: 0`，UI 语义与 z 语义相反 → 层叠颠倒。
- **方案**：两处统一改为 `zBand + (list.length - 1 - index)` 反向映射，面板顶部 = 带内最高 zIndex = 地图最上层。显示带方案（zIndexBands.js SSOT：底图带 0~199 / 卷帘偏移 150~199 / 数据带 200~799 / 标注带 800~899 / 系统带 900+）不变，常规底图 z 上界仍为 N-1，不侵入卷帘带。
- **验证**：多底图叠加时面板顶部层压盖最上；右键置顶/置底、拖拽排序实时跟随；TOC 数据图层排序、卷帘左右层级、标注恒顶于数据层等回归行为不变。
- **日志**：[2026-08-25-fix-basemap-panel-zorder-reverse](../LLM_record/26-08/2026-08-25/2026-08-25-fix-basemap-panel-zorder-reverse.md)
- **同日补充**：修复 HomeView.vue 对 `remoteServices.ts` 的具名导入错误（`setRemoteServiceVisibility` → 实际导出 `setRemoteServiceVisible`），消除启动期 ESM SyntaxError 白屏。日志见 [2026-08-25-fix-homeview-import-name-mismatch](../LLM_record/26-08/2026-08-25/2026-08-25-fix-homeview-import-name-mismatch.md)。同日的在线服务架构加固与 XYZ/WMTS 接入已独立为 V3.5.36/V3.5.37 条目。

### V3.5.34 (2026-08-24) — GeoServer 探索部署整体移除

- **背景**：GeoServer（V3.5.31~33 累计三层迭代：并入镜像 → 反代加固 → NPE 修复）经实际试用判定不符合当前需求——现有 FastAPI + OL 直连架构已覆盖数据服务场景，而 GeoServer 带来镜像 +700MB、JVM 常驻、HF ephemeral 数据持久化三重负担。
- **内容**：`deploy/Dockerfile` 删除 geoserver-dist 阶段、Tomcat/OpenJDK 拷贝、RemoteIpValve 注入与 start.sh 两个后台子壳，apt 移除 unzip/libfreetype6/fontconfig/fonts-dejavu-core；`deploy/nginx.conf` 删除 /geoserver 分流段与 X-Forwarded map 归一化块。保留 server 级安全响应头等通用加固。
- **回溯指引**：探索结论（COG/PostGIS 外部化形态建议、REST 配置接口完整对象图要求等）见 V3.5.31~33 各日志；重建时推荐直接采用外部化形态。

### V3.5.33 (2026-08-24) — GeoServer 状态页 NPE 修复：废除手写预置 global.xml

- **背景**：HF/本地部署访问 `/geoserver/web/` 服务器状态页报 `WicketRuntimeException`，根因 `NullPointerException: Cannot invoke "org.geoserver.config.JAIInfo.getJAI()" because "jaiInfo" is null`。
- **根因**（已核对 GeoServer 2.26.2 源码）：deploy/Dockerfile 构建期预置的极简 `data_dir/global.xml`（仅 `<proxyBase>`）被启动时直接加载、不再生成默认配置；XStream 反序列化走 Unsafe 实例化（绕过构造器与字段初始化器），缺失节点即为 null，而 `GeoServerInfoImpl.readResolve()` 只回填 `settings` 不回填 `jai`/`coverageAccess` → StatusPanel 渲染必崩。
- **方案**：
  - 删除预置 global.xml 的 printf 行，空 data_dir 交由 GeoServer 首启自生成完整默认配置；原位置补警示注释禁止未来再手写预置。
  - start.sh Proxy Base 注入改为「GET 完整 settings.xml → sed 改 `<proxyBaseUrl>` → PUT 整体回传」——直接 PUT 部分 payload 因配置对象图缺失被拒绝（实测 500）；整体回传保留完整对象图并触发全量持久化。Proxy Base 兜底链路不变（请求探测 + REST 注入）。
  - （同日补充）apt 运行时依赖补 `libfreetype6`/`fontconfig`/`fonts-dejavu-core`：slim 基础镜像缺 libfreetype，状态页字体枚举触发 `libfontmanager.so` 加载即抛 `UnsatisfiedLinkError`（global.xml 修复后实测暴露）。
- **验证**：start.sh 提取片段 `sh -n` 通过；Dockerfile `docker build --check` 无警告；待重建镜像后实测状态页渲染、容器内 global.xml 含 `<jai>`/`<coverageAccess>` 完整节点、proxyBaseUrl 注入日志。
- **日志**：[2026-08-24-geoserver-global-xml-npe-fix](../LLM_record/26-08/2026-08-24/2026-08-24-geoserver-global-xml-npe-fix.md)

### V3.5.32 (2026-08-24) — GeoServer 反代链路加固：Nginx 协议归一化转发 + 安全头 + Proxy Base URL 启动自动注入

- **背景**：V3.5.31 将 GeoServer 并入全栈镜像后，HF 边缘终结 TLS、容器内 nginx 收到明文 HTTP，`/geoserver/` 段若透传 `$scheme`（或硬编码 https 牺牲本地调试）都会让 GeoServer 生成的重定向/表单/Capabilities 在线资源协议错误；且数据目录 ephemeral，后台手改 Proxy Base URL 重启即丢失。
- **方案**：
  - `deploy/nginx.conf`：http 块新增 `map $http_x_forwarded_proto/$http_x_forwarded_port` 归一化（有头采信边缘代理的 https/443，无头回落本机值，HF 生产与本地 compose 仿真双兼容）；`/geoserver/` 段改传 `$forwarded_proto` 并补 `X-Forwarded-Host $host`；段内显式补齐三条安全响应头（nosniff / SAMEORIGIN / Referrer-Policy，对冲 add_header 继承失效）。
  - `deploy/Dockerfile`（start.sh）：新增后台注入子壳——就绪探测（轮询 `/geoserver/rest/about/version.json`，最长 ~150s）后经 REST API `PUT /rest/settings` 写入 `proxyBaseUrl=https://negiao-webgis.hf.space/geoserver`；支持 `GEOSERVER_PUBLIC_URL` / `GEOSERVER_ADMIN_USER` / `GEOSERVER_ADMIN_PASSWORD` 覆盖，失败仅记日志不阻塞主服务。
- **关键裁定**：「Nginx 层强制 HTTPS」以语义强制落地（协议头归一化 + Proxy Base URL 固化 https），不做全局 301——否则会打挂容器内 `curl http://127.0.0.1:7860/health` 健康检查与本地 http 调试。
- **验证**：nginx:1.27-alpine `nginx -t` 通过（syntax ok / test successful）；start.sh 片段 `sh -n` 通过；待实机验证 Proxy Base URL 回显与安全头。
- **日志**：[2026-08-24-geoserver-proxy-base-url](../LLM_record/26-08/2026-08-24/2026-08-24-geoserver-proxy-base-url.md)

### V3.5.31 (2026-08-24) — GeoServer 并入全栈镜像（探索部署）

> 注：本条目为补录（上任务日志声称已追加但文件中缺失，V3.5.32 任务时发现并修复）。

- **内容**：`deploy/Dockerfile` 新增 `geoserver-dist` 多阶段源——直接 `COPY --from docker.osgeo.org/geoserver:2.26.2` 取用 Tomcat + geoserver webapp + OpenJDK17，结构性规避 bin-zip 下载在部分构建环境的 DNS 污染/损坏包问题；start.sh 第三服务 catalina 后台启动（堆 256m~1g，日志 `/tmp/geoserver.log`）；`deploy/nginx.conf` 新增 `location = /geoserver` 301 与 `location ^~ /geoserver/` 反代 `127.0.0.1:8080`。原前端/FastAPI 行为零变化；数据目录暂 ephemeral（Space 重建即重置，探索期接受）。
- **日志**：[2026-08-24-geoserver-hf-deploy](../LLM_record/26-08/2026-08-24/2026-08-24-geoserver-hf-deploy.md)

### V3.5.29 补充 — nginx 瓦片磁盘缓存 (2026-08-24)
 — nginx 瓦片磁盘缓存

- **背景**：`/proxy/gcj2wgs`、`/proxy/wgs2gcj` 纠偏接口与 `/proxy/{url}`、`/tiles/ships66` 瓦片代理每次浏览地图均穿透 FastAPI；后端内部缓存仅免重算，请求仍占用 Python 进程。多人访问场景下热点区域重复回源。
- **方案**（失效策略三选一，用户选定短 TTL 自愈）：`deploy/nginx.conf` http 块新增 `proxy_cache_path /tmp/nginx_cache/tiles`（2GB LRU、7 天 inactive）；透传段按缓存性拆分——`/tiles/ /proxy/` 走 `proxy_cache tiles`（仅缓存 200、TTL 1h、`proxy_ignore_headers Cache-Control Expires` 保证确定性、`proxy_buffering on`、新增 `X-Cache` 观测头），`/api/ /monitor/` 维持 SSE 关缓冲不缓存。
- **关键核验**：三个代理接口路由实测自 `backend/api/proxy.py:415-587`（全 GET 幂等）；proxy.py:422 的 `Cache-Control: no-cache` 为发往上游的请求头，不影响 nginx 缓存决策。
- **日志**：[2026-08-24-nginx-tile-cache](../LLM_record/26-08/2026-08-24/2026-08-24-nginx-tile-cache.md)
- **验证**：nginx:1.27-alpine `nginx -t` 通过；待实机验证 X-Cache HIT 与纠偏参数变更 ≤1h 自愈。

### V3.5.29 (2026-08-23 ~ 08-24) — 部署架构重组 Code Review 与修复：deploy/ 收敛链路对齐 + P0 构建期 env 路径修复

- **背景**：暂存区完成部署架构重组（L3 已批准方案）——`backend/Dockerfile`/`backend/docker-compose.yml` 删除，新建全栈单容器 `deploy/Dockerfile`（nginx 前端静态 + FastAPI 同容器，单端口 7860，HF Space 与本地同源）；根 `.env`/`.env.local`/`.env.example` 迁入 `deploy/`；门禁脚本归档 `Scripts/`；`LocalDev.bat` 全容器化（Node 工具链不再必需）。本版本对该暂存变更做全面 Code Review 并修复发现的问题。
- **审查结论**（nginx 透传段与后端路由实测吻合 ✅、compose env 挂载经 load.py 三级回退验证通过 ✅）：
  - **P0**：`deploy/Dockerfile` 构建期 `COPY deploy/.env /src/.env`，但 vite `selectiveEnvPlugin` 的 envDir 固定解析 `<frontend>/../deploy`（容器内 `/src/deploy/.env`）——路径错位使构建期 env 读空，前端 API 基址回落 `http://localhost:7860` 硬编码默认值，HF 线上全部 API 请求必挂。已改为 `COPY deploy/.env /src/deploy/.env` 并同步 sed 路径。
  - **P1**：vite.config.js 新增的 `VITE_DEV_PROXY_TARGET` / `VITE_WATCH_USEPOLLING` / `VITE_WATCH_INTERVAL` 未登记 → 违反配置门禁 F2。已在 `deploy/.env.example` 补登记（dev server 运行时开关段），CheckConfigRegistry 恢复全绿。
  - **P1**：README「双轨部署」仍引用已删除的 `backend/Dockerfile`（手动构建命令必失败）且描述过时的 subtree 部署。已改写为 git archive 组装 + 单容器镜像手动等价命令。
  - **P2**：CI「Assemble HF Space context」只拷 `Dockerfile` 未拷 `Dockerfile.dockerignore` —— BuildKit 按 `<Dockerfile路径>.dockerignore` 配对，缺配对则白名单失效，`stats.html`(1.7MB)、`tileset/`(33MB) 等噪音全部进入 HF 构建上下文。已补拷。
  - **P3**：`LocalDev.bat` 死代码清理：`ERR_NODE`/`ERR_NPM`/`ERR_NPM_INSTALL` 无引用 goto 标签删除、重复 `FRONTEND_DIR` 赋值合并、「root .env」过时提示文案更正为 deploy/。
- **文档同步**（subtree→git archive、根 .env→deploy/.env 全量对齐）：[project-structure.md](../../Docs/Guide/project-structure.md) 补 `Write-Color.ps1` 条目；[backend-structure.md](../../Docs/Guide/backend-structure.md) 死条目（.dockerignore/Dockerfile/docker-compose/env 三件）已随重组移除；[cicd-pipeline.md](../../Docs/Architecture/cicd-pipeline.md) Job 5 改写为全栈单容器部署流程 + 时序图更新；[deployment-relationship.md](../../Docs/Architecture/deployment-relationship.md) 与 [system-architecture.md](../../Docs/Architecture/system-architecture.md) 部署来源矩阵更新；[configuration-three-tier.md](../../Docs/Architecture/configuration-three-tier.md) Mermaid 图 env 路径与门禁脚本路径更新；[Force_command.md](../../Docs/Force_command.md) 门禁命令与配置 key 登记路径更新为 Scripts/ + deploy/。
- **验证**：
  - Agent 已执行：`python Scripts/CheckConfigRegistry.py` ✅（catalog 122 key · VITE 使用 12 个，F2 修复后 7 项全绿）；`python Scripts/CheckStructureTree.py` ✅（459=459，0 缺 0 多）；nginx 透传段 vs 后端路由逐段核对（/api /proxy /tiles /monitor + /health /docs /redoc /openapi.json 全部存在）✅。
  - 待用户实机验证：① 本地 `docker compose -f deploy/docker-compose.yml up -d --build` 构建成功且 http://localhost:5173 HMR 正常、http://localhost:8080（--profile prod）页面 API 正常；② push main 后观察 GitHub Actions 五 Job 全绿、HF Space 构建成功且 https://negiao-webgis.hf.space 页面 API 基址为同源相对路径（浏览器 DevTools Network 无 localhost:7860 请求）。
- 维护日志：[2026-08-23-deploy-restructure-code-review](../LLM_record/26-08/2026-08-23/2026-08-23-deploy-restructure-code-review.md)。

### V3.5.28 (2026-08-23) — 全站 UI 设计语言统一：ESRI 式图层交互 + 组件合并 + 浅色玻璃拟态换肤

- **问题**：多会话并行迭代导致各面板 UI 风格割裂——文字字符充当图标（`▾ ▸ ▼ × ••• ▶ ⋮⋮ ok`）违反图标规范且跨平台渲染不一致；LayerControlPanel 深绿容器内白字输入框深浅混杂；行政区划树存在暗色主题残留色值；路线规划双面板 90% 代码重复；大量组件未引用已有的 toc-theme/theme 设计令牌。
- **重构**（纯展示层，业务逻辑零改动）：
  - **图层管理族**：[TOCTreeItem](../../frontend/src/domains/common/layer-tree/components/TOCTreeItem.vue) 参考 ESRI ArcGIS——checkbox 显隐改行右侧 Eye/EyeOff 开关（文件夹半选降透明度）、新增类型/拖拽把手图标、隐藏行整行淡化、右键菜单 20+ 命令全量 lucide 图标化、激活态强调条改伪元素消除布局抖动；[TOCPanel](../../frontend/src/domains/common/layer-tree/components/TOCPanel.vue) Tab 改 `--active-index` 驱动的滑动胶囊，绘制面板重构为磁贴工具格 + 一体式 join-bar 输入条，样式面板改色卡磁贴 + 渐变填充滑杆；LayerPanel/SharedResourceTreeItem 同构对齐。
  - **路线规划合并**：BusPlannerPanel + DrivingPlannerPanel → [RoutePlannerPanel](../../frontend/src/domains/ol/routing/components/RoutePlannerPanel.vue) 单组件 `mode="bus"|"drive"` 双触发（SidePanel 两 Tab 各渲染一实例）；差异收敛为配置（策略选项/按钮文案/debug 字段子集/结果区形态）；驾车配色接入全局 `--info/--info-rgb` 功能色令牌；对外回调 prop 名保持不变，仅消费方 SidePanel 调整取点函数名为 `start-point-pick`。
  - **天气看板**：主面板渐变徽章头部 + 一体式查询条（刷新忙碌旋转动画）；LiveCards/ForecastTable 硬编码绿色全量令牌化、元信息去边框盒、预报表去网格线改行分隔 hover 高亮。
  - **罗盘面板**：自绘拨动开关、模式分段控件、滑杆渐变填充 + m/km 智能格式化、颜色卡与状态 chip 圆点。
  - **地图浮层**：[LayerControlPanel](../../frontend/src/domains/ol/layer/components/LayerControlPanel.vue) 深绿容器→浅色玻璃拟态并恢复紧凑两行布局，全部文字字符图标化，图层显隐改眼睛开关，Cesium overlay 改 mini switch；[MapControlsBar](../../frontend/src/domains/ol/components/MapControlsBar.vue) 同步浅色换肤，内联 SVG→Copy/ChevronRight/House，主页按钮升级渐变实底圆钮（涟漪保留）；LocationSearch 图标 Search→Crosshair 并去除硬编码色。
  - **设计令牌**：`--brand-gradient` 绿主题调亮为同色系 `#5ec773→#35a44f`（蓝主题 `#64b5f6→#1e88e5`），全仓 12 处引用一次性受益。
  - **路线漫游新模块**：新增 [RouteFly](../../frontend/src/domains/cesium/modules/route-fly/firstPersonFlyController.js)——手绘贴地线路（预览直连防掉帧、定稿 clampToGround 真贴地）加入统一图层管理，相机沿线路第一/第三人称漫游（表面三级采样 + CZML 累积距离时间轴 + lookAt 跟随），经 lil-gui 声明式控件接入 CesiumToolPanel 卡片体系，与人物漫游时钟互斥；支持路线 JSON/KML/KMZ 三格式导入导出；方案文档获批后实施。
- **暂存区附带审查**（非本会话产物）：① 后端 Docker 瘦身三件套（移除 libgdal-dev/libgeos-dev/libgl1、supabase 依赖、.dockerignore 加 data/），已验证 backend 无任何 `import supabase`；② 体积云/shader 全链路——bundle-shaders.mjs 再生脚本逻辑健全，vite 求值期自动再生 + CI 门禁接线正确，**实跑 `shaders:check` 通过（5 个 shader 三副本零漂移）**，AtmospherePostProcess 曝光分支修复与 frag 地形感知分类均与文档一致。⚠️ 镜像构建与 GLSL 渲染观感待实机验证。
- **验证**：`npm run lint` 全绿；`CheckStructureTree.py` ✅ 457=457；vue-tsc 抽查无新增报错。实机待回归：图层树显隐/菜单、公交驾车全流程、天气/罗盘/底图控制条交互、后端瘦身镜像 build+启动。
- 维护日志：[2026-08-23-ui-unify-code-review](../LLM_record/26-08/2026-08-23/2026-08-23-ui-unify-code-review.md)。

### V3.5.27 追加批次 (2026-08-22) — 体积云与 shader 三项修复（原编号 V3.5.30 / 29 / 28，按用户裁决并入本条）

> 编号说明：以下三项因历史提交信息不规范，统一并入 V3.5.27 追加批次；各项维护日志链接保留可溯。

#### ① 体积云空中透视地形感知分类（原 V3.5.30）— 地平线黄雾带按真实地形轮廓收敛

- **问题**：V3.5.28 生效后的遗留观感缺陷——`aerialPerspectiveEffect.frag` 的地面/天空分类以「视线是否前向擦入海平面椭球（hitBottom）」为核心判据，隐含"地平线=理想平滑椭圆边"。开启地形后真实地平线高低起伏：①山脊之间的天空缝隙、切角以下的掠射视线照样会在远处擦入椭球，被强算「相机→椭球切点/远平面重建点」的全路径散射（掠射段 inscatter 过饱和呈暖黄），形成贴着理想椭圆边的**黄雾带**——盖住山脚，半透明云叠上显黄；②深度清空像素的散射终点经远平面重建后被 `ClampRadius` 顶到大气层顶，积分值无界放大。
- **修复**（仅 [aerialPerspectiveEffect.frag](../../frontend/src/domains/cesium/modules/cloud/lib/AtmosphereFromThreeGeospatial/Shaders/aerialPerspectiveEffect.frag) 分类块，BSM 云影/丁达尔链路零改动）：
  - 深度清空判定 `DEPTH_SKY_EPS` 1e-4 → **1e-7**（与体积云 stage 的 `DEPTH_SKY` 对齐；`czm_readDepth` 已做对数深度反转，任何有限距离几何都可靠 < 1-ε，远距地形不再落入"近似天空"灰区）；
  - 分类改为**深度优先三问**：① 深度非清空 ⇒ 真实几何一律地面管线（终点=深度重建点；旧 `SHELL_SKY_DEPTH_SLOP` 宽带透传删除）；② 深度清空且射线不碰椭球 ⇒ 山脊间纯天空，透传；③ 深度清空但射线命中椭球 ⇒ 掠射大气段，散射终点钳到 bottom 球**近交点**（有界临边辉光，等价原生行星渲染的地平线表现；该锚点不参与 BSM 地面云影防粘屏）。
- **验证**：bundle/public 镜像/dist 三处同步确认（vite 求值期自动再生）；`vite build` 通过；双门禁通过。实机待回归：开地形看山缝天空无黄带、山脚无雾墙、云不泛黄；关地形场景与贴地平线升降无回归。
- 维护日志：[2026-08-22-cloud-aerial-terrain-aware-classification](../LLM_record/26-08/2026-08-22/2026-08-22-cloud-aerial-terrain-aware-classification.md)。

#### ② shader bundle 漂移防护自动化（原 V3.5.29）— vite 求值期自动再生 + CI 门禁

- **问题**：V3.5.28 遗留风险——bundle 再生仍靠手动执行 `node frontend/scripts/bundle-shaders.mjs`，改 `Shaders/` 源文件后忘跑脚本会复现同类漂移（且 public fetch 回退镜像也需手动同步，同属机制缺口）。
- **修复**（三道防线，全部围绕「让忘跑不可能」）：
  - **自动再生**：[bundle-shaders.mjs](../../frontend/scripts/bundle-shaders.mjs) 重构为可导出模块 `bundleShaders()`，挂载 [vite.config.js](../../frontend/vite.config.js) 配置求值期（照 `generateShareDataManifest` 先例）——`dev` / `build` / `build:*` 启动即自动同步，产物确定性无 git 噪声；
  - **脚本增强**：新增 `--check` 校验模式（只读比对 bundle + 镜像与真源，漂移列明细并 exit 1）；写模式下顺带同步 `public/cloud-atmosphere/shaders/` 镜像并清理真源已删除的陈旧副本；比对前统一 CRLF→LF，免受 checkout 行尾转换干扰；
  - **门禁拦截**：`package.json` 新增 `shaders` / `shaders:check` 脚本；[deploy.yml](../../.github/workflows/deploy.yml) 在 Install 依赖之后、Build 之前插入 `npm run shaders:check` 步骤，把已提交的漂移拦截在部署前。
- **验证**：`--check` 通过；人为污染 bundle 与镜像后 `--check` 正确 exit 1 并列出两处漂移；重跑再生精确还原；`vite build` 通过且构建期自动再生幂等（git 无额外 diff）；dist 内 aerial frag 已含 Fix A/B/C 修复态。
- 维护日志：[2026-08-22-cloud-shader-bundle-auto-guard](../LLM_record/26-08/2026-08-22/2026-08-22-cloud-shader-bundle-auto-guard.md)。

#### ③ 体积云 shader 副本漂移修复（原 V3.5.28）— 补建 bundle 再生脚本 + 重同步

- **问题**：上一版（V3.5.27 时段内同日会话）的空中透视白蒙版修复（`compositeAerialDisplay` 统一 OETF 出口 + 分类带收窄 + 曝光按分支施加）**未生效**——用户实测症状依旧。根因是副本漂移：shader 运行时唯一真源为内联 `bundledShaders.js`（`shaderLoader.js` bundle 优先命中，fetch 仅回退），而其头部声明的再生脚本 `scripts/bundle-shaders.mjs` 在仓库中不存在，导致 `Shaders/aerialPerspectiveEffect.frag` 源文件的修复无法同步进运行时加载的旧 bundle。
- **修复**：
  - 新增 [frontend/scripts/bundle-shaders.mjs](../../frontend/scripts/bundle-shaders.mjs)：递归打包 `lib/AtmosphereFromThreeGeospatial/Shaders/` 全部 glsl/frag（CRLF→LF、JSON 转义安全写入），banner 更新为真实脚本路径与真源标注；
  - 执行重生成 `bundledShaders.js`（5 shader 全量重建，diff 校验 aerial frag 与源逐字节一致）；
  - 同步 `public/cloud-atmosphere/shaders/` 镜像 5 文件。
- **验证**：node 动态 import 校验 key 完整 + 双向 diff 通过；实机渲染表现待用户回归（交界无灰白带 / scale=0 恒等 / 升降无闪烁）。
- 维护日志：[2026-08-22-cloud-shader-bundle-drift-fix](../LLM_record/26-08/2026-08-22/2026-08-22-cloud-shader-bundle-drift-fix.md)（含前置修复日志 [2026-08-22-aerial-perspective-white-veil](../LLM_record/26-08/2026-08-22/2026-08-22-aerial-perspective-white-veil.md)）。

### V3.5.27 (2026-08-20~22) — 面状航线模块迁移：toolPanel 模块卡片直驱 + 全量 i18n

> 2026-08-20~22 的三轮会话增量（浮层整页方案 → 无头控制器重构 → 启动崩溃修复与本地化）按用户范式指示收敛为单一版本 V3.5.27。

#### 一、模块迁入与接入层重构（原 V3.5.30 浮层方案 → 本版收敛）

- **源工程迁入**：独立工程 `planar-wayline`（面状航线规划：测区绘制 / 弓字形航线 / 五向倾斜 / AGL 仿地 / DJI WPMZ-KMZ 导入导出）全量复制至 `frontend/src/domains/cesium/modules/planar-route/`，Cesium 导入适配为 CDN shim 默认 Proxy（15 文件 `import * as Cesium` → `import Cesium from 'cesium'`；`cesium.d.ts` 补默认导出）。
- **接入形态收敛**：初版「全屏浮层 + Element Plus 整页搬运」按用户指示重做为 toolPanel 原生范式——新增 `toolModules/PlanarRouteModule.js`（lil-gui 声明式控件：采集方式/高度模式/航高/速度/云台俯仰角/主航线角度/重叠率/拍照触发/航线名/五向切换 + 4 动作按钮），新增无头运行时 `planarRouteController.ts`（≈900 行：起飞点拾取专用 handler、测区绘制/顶点拖拽/右键删除自管理 DOM、规划编排、KMZ 导入导出、destroy 全量清理，`emitState()` 快照回流驱动卡片）；Element Plus / gsap 依赖整体移除（消息走 `useMessage`、确认弹窗 `window.confirm`、文件选择动态 input、保存命名面板 text 控件），vendor-element-plus chunk（gzip 252KB）消失。
- **共享宿主 Viewer**：复用唯一 Viewer 实例，不建第二个 WebGL 上下文；起飞点拾取用模块自有 `ScreenSpaceEventHandler` 隔离宿主左键逻辑。
- 方案文档：[TODO/2026-08-20-planar-route-migration-proposal.md](../TODO/2026-08-20-planar-route-migration-proposal.md)，维护日志：[2026-08-20 迁移](../LLM_record/26-08/2026-08-20/2026-08-20-migrate-planar-route.md)、[2026-08-22 面板集成](../LLM_record/26-08/2026-08-22/2026-08-22-planar-route-panel-integration.md)，架构说明：[Architecture/cesium-planar-route.md](Architecture/cesium-planar-route.md)。

#### 二、启动期 Cesium 求值崩溃修复

- `planarConfig.ts` / `utils/comm.ts` 位于启动静态加载链（被 `useCesiumToolModules.js` 静态引用），顶层 `import Cesium from 'cesium'` 使 `Cesium.Cartesian3.fromDegrees(...)` 在 CDN 就绪前求值，cesium-shim 抛 `[cesium-shim] window.Cesium 未就绪` 导致整个 3D 页打不开。修复：类型改 `import type { Cartesian3 }`，兜底经纬度常量改运行时惰性转换（`PLANAR_FALLBACK_POSITION_DEGREES`），`createTextCanvas` 函数体内取 `window.Cesium`。
- `global.d.ts` 补 `window.Cesium: any` 声明。

#### 三、全量本地化（≈150 key）

- 模块卡片/控件/选项/提示/动作、规划计算错误文案（33 条）、KMZ 导入导出文案（26 条）、实体名、测区边长单位、拾取提示、自相交警告条、导入 warnings 全部接 `cesium.module.planarRoute.*` 双语言包；`wpml/actionCodec.ts` 中文为 KMZ 文件格式载荷（司空生态约定）不做 i18n。

#### 四、构建与分包

- 新增依赖仅 `@turf/turf` 与 `@cesium-extends/subscriber`；`vendor-planar-route` 独立懒加载 chunk（turf/@cesium-extends，gzip ≈14.5KB）+ `planarRouteController` 动态 import chunk（88KB/gzip 24.7KB），均不入入口预加载清单。
- 验证：tsc 0 报错、eslint 模块目录 0 error 0 warning、vite build 通过、CheckStructureTree 458/458、CheckConfigRegistry 通过。

#### 五、统一图层管理接入（KMZ 导入可管理）

- 新增数据类型 `wayline`：元数据店透明度白名单放行（复用矢量 per-entity alpha 缩放）、数据页签卡片图标/标签 i18n。
- 控制器 `onWorkingSetChange` 生命周期钩子：首次生成有效航线（含 KMZ 导入回填）时以固定 id `planar_route_working` 将托管数据源注册进 loadedDataSources → 自动建档，支持 显隐/透明度/重命名/定位(flyTo)/移除；清除全部或控制器销毁时注销。
- 外部删除联动：adapter.remove 的 wayline 分支先调 `detachForExternalRemoval()` 复位控制器内部状态再走通用移除销毁句柄，避免悬空引用；下次交互重建全新数据源。
- 起飞点实体（startPoint / air_start_point）收敛写入托管 DataSource（原先散落 viewer.entities 不受显隐控制）。

#### 六、体积云空中透视（aerialStageEnabled）天际线白蒙版修复

- **根因三层叠加**：Stage1 直通地面被误乘曝光（sRGB 被抬亮）；aerial 分类宽带 0.014 把大片远地表误判为天空走二次 OETF（灰白蒙版带）；aerial 分支线性 inscatter 直加 sRGB 且无 tonemap 出口（近地平线饱和发白 + 交界缝）。
- **修复**：曝光按分支施加（直通=1.0）；新增 `compositeAerialDisplay` 统一「pow2.2 线性化→合成→mix(scale)→ACES+gamma」出口（scale=0 严格恒等）；分类参数与上游对齐收窄（0.0016 / -0.01），旧宽带防闪理由已因出口统一而消失。
- 详见[维护日志](../LLM_record/26-08/2026-08-22/2026-08-22-aerial-perspective-white-veil.md)。


### V3.5.26 (2026-08-22) — 综合版本：Cesium 本地化自托管 + 贴地策略统一重构 + 首屏 Loading 过渡 + 暂存区审查收敛

> 2026-08-22 的三轮暂存增量（原 V3.5.26 / V3.5.27 / V3.5.28）按用户指令合并收敛为单一版本 V3.5.26。下列小节以原版本号标注，供追溯。

#### 一、首屏 Loading 遮罩过早消失白屏修复（原 V3.5.26）

- **全链路排查**：确认遮罩生命周期为 router.beforeEach（Loading Relay）→ MapContainer.onMounted → `waitForCriticalTileReady()` → `map-core-ready` → HomeView `settleMapCoreLoading()` → `hideLoading()`；白屏根因是就绪门槛只等 1 张底图瓦片（tileloadend + rendercomplete + 双 rAF），第一张瓦片到位即隐藏遮罩，其余视口瓦片仍在加载。
- **hideDelayMs 过渡机制**：`useAppStore.showLoading` options 新增 `hideDelayMs` 隐藏延迟——`hideLoading()` 被调用后推迟该时长才真正隐藏（幂等定时器），15s 自动兜底超时走 `forceHideLoading` 不受拖延；`minDurationMs` 最短持续时间作为同轮实验的姊妹机制一并落地并与 hideDelayMs **可链式叠加**。未传参数的调用点行为完全不变。
- 首屏链路（/home 直达与 register→home 重定向）生产参数 **1000ms** 过渡缓冲。
- 详见[维护日志](../LLM_record/26-08/2026-08-22/2026-08-22-loading-overlay-premature-hide.md)。

#### 二、Cesium 本地化自托管 + Bruneton 天空单位修复 + 审查收敛（原 V3.5.27）

- **Cesium 主库本地化**：新增 devDependency `cesium@1.132`，`Build/Cesium/`（21MB）拷贝至 `frontend/public/cesium/` 随站点部署；`publicRuntime.ts` 以 `CESIUM_ASSET_BASE_URLS`（默认 `{BASE_URL}/cesium/`，env 可覆写）替代原 jsDelivr→BootCDN→unpkg 公共 CDN 候选链，BootCDN 因 2023 投毒前科彻底移除；`cesium-shim.js` 加载回退机制保留，Workers/Assets/Widgets 子资源继续跟随 `window.CESIUM_BASE_URL` 同源解析。
- **云大气资源死代码清理**：`assetPaths.js` 删除永不执行的 jsDelivr 分支、包名常量与废弃 API `getDefaultAssetPaths`（运行时实际路径由 `assetConfig.resolveWebgisCloudAssetPaths` 提供 `public/cloud-atmosphere/` 本地资源）。
- **Bug 修复：BSM 开启档天空变黑**——`AtmospherePostProcess.marchShadowLengthAtm` 以 km 累计却错误 `/METER_TO_LENGTH_UNIT` 放大 1000 倍，Bruneton 光柱分支中 `r_p` 被 ClampRadius 钉在大气层顶，散射≈0 → 均衡/极致档整片天空变黑；流畅档因 BSM 默认关闭幸免。修复为直接返回 km 值。
- **流畅档云影观感对齐**：手动开启 BSM 时阴影过黑过硬，预设参数对齐均衡档：`bsmGroundScale 0.18→0.12`、`shadowPcfTaps 1→4`、`shadowResolveEnabled false→true`。
- **Cesium 默认地形统一**：移除 `useCesiumLayers.js` 中 `import.meta.env.DEV ? 'ellipsoid' : 'tianditu'` 分支，本地开发与部署环境统一默认天地图世界地形（token 缺失仍自动降级平面并提示）。
- **Cesium 主脚本空闲预热**：新增 `cesiumWarmup.js`，首屏 map-core-ready 后延迟 10s 再等浏览器 idle 后台预载 ~6MB 主脚本，切换 3D 秒开；`saveData`/2G 自动跳过。
- **配置登记同步**：`.env.example` 的 `VITE_CESIUM_CDN_*` 两 key 更名为 `VITE_CESIUM_ASSET_*` 并更新缺省值。
- **静态资源基址统一相对化（多处部署兼容）**：`ASSET_BASE_URL` 源头重定义为保留 `BASE_URL` 原始形态（'./' 保持相对），修复 `./` 构建下 ShareData / cloud-atmosphere / adcode 树 / 静态图标等 10 处消费方产出绝对路径、子路径部署 404 的问题；已核验全部消费模式兼容尾斜杠形态。
- 详见[维护日志](../LLM_record/26-08/2026-08-22/2026-08-22-cesium-selfhost-and-review.md)。

#### 三、贴地策略统一重构：全面收敛官方 clampToGround（原 V3.5.28）

- **矢量数据全链路官方化**：geojson/kml/kmz/shp 统一在 `DataSource.load` 期显式 `clampToGround: true`（实证本地 Cesium 1.132 中 KmlDataSource 与 GeoJsonDataSource 该项默认均为 false，KML 湖泊面因此被埋入地下 70m）；面/线走 GroundPrimitive、点自动 heightReference，地形切换由 Cesium 自动跟随。删除加载后自定义补贴地 pass 与 terrainProviderChanged 矢量重贴监听。
- **危险兜底移除**：GLTF 数据导入采样失败不再「关闭全局地形」。
- **glTF/模型 Entity 化**：数据导入与模型管理器两条模型路径统一改用 Entity ModelGraphics + `heightReference`（语义高度 > 0 → RELATIVE_TO_GROUND 保留离地意图，否则 CLAMP_TO_GROUND 贴合地表），姿态统一 ENU 四元数；重定位/移除/清空/flyTo/透明度五条链路同步适配 Entity 句柄；非均匀缩放 {x,y,z} 退化等比并告警。方案文档中「维持采样抬升 + Entity 化立项 TODO」的中期裁决被第四轮迭代取代，以本条为准。
- **采样网关收敛**：新建 `terrain/terrainSampling.js` 合并三套并存实现（availability 首选 mostDetailed，层级阶梯仅作未知 provider 兜底），移除 `_bottomLevel` 私有字段依赖；`terrainClampService.js` 收敛为 CZML 实体贴地唯一入口（原 loaders/clampToGround.js 删除）。
- 方案文档：[Architecture/2026-08-22-clamp-to-ground-strategy.md](Architecture/2026-08-22-clamp-to-ground-strategy.md)，详见[维护日志](../LLM_record/26-08/2026-08-22/2026-08-22-clamp-to-ground-strategy.md)。

#### 四、暂存区终审修复（本次合并会话）

- **清空全部数据的 glTF 残留**：`clearAllDataSources` 仍按 primitive 移除 Entity 模型（静默 no-op），与已修的 `removeDataSource` 不一致——补齐 entities/primitives 分型移除。
- **透明度滑杆对 Entity 模型失效**：`setRecordOpacity` 的 gltf 分支对 Entity 直接赋 `.color` 是无效属性——分型写入 `entity.model.color`（ModelGraphics）/ 原路径（历史 primitive）。
- **Loading 双延迟机制叠加缺陷**：最短持续时间到期回调直接 `forceHideLoading` 会绕过 hideDelayMs——改为链式重入 `hideLoading()`。
- **采样网关空命名空间防御**：`sampleTerrainBatch` 显式层级兜底前补 `!Cesium` 守卫。


### V3.5.25 (2026-08-20~21) — 综合版本：双引擎底图统一契约 + 实时在线零轮询重构 + 历史影像后端 + 审查修复

> 2026-08-20~21 的三轮暂存增量（原 V3.5.25 / V3.5.26 / V3.5.27）按用户指令合并收敛为单一版本 V3.5.25。下列小节以原版本号标注，供追溯。
> 综合审查与收敛过程见 [V3.5.25 暂存区整合与代码审查](../LLM_record/26-08/2026-08-21/2026-08-21-v3.5.25-consolidated-code-review.md)。

#### 一、双引擎底图统一契约（原 V3.5.27 收敛 + 原 V3.5.25 主题一）：1-based `l` · 固定 custom · 共享运行时 store

- **公开 `l` 统一为 1-based 数字**：OL、Cesium、分享链接、快捷位置与 Agent 上下文使用同一套映射；`l=1` 为本地瓦片，`l=2` 固定为 custom/Wayback，拒绝 `l=custom` 等字符值；管理员 `default_basemap_index` 等内部数组访问保持 0-based 不变。
- **统一底图身份**：ESRI Wayback 快照不再动态注册 ID，统一使用固定 `custom` 身份表示，具体快照由其 XYZ URL 区分；旧 `layerId` 与 `l=1&customUrl=...` 链接仍可读取，后续 URL 写回与分享链接自动清理历史字段。
- **实际 URL 独立于路由（SSOT）**：新增 `useSharedCustomBasemapUrl.ts` 作为 OL/Cesium 共用的运行时唯一状态源；用户输入与系统选择的 Wayback URL 都写入同一共享 `ref`，不进入路由 query，也不经过组件 prop/event 双向绑定中转。
- **跨会话恢复**：最近一次有效 custom URL 通过 `localStorage`（`webgis_custom_basemap_url`，兼容旧 Cesium key）持久化；无 URL 的 custom 选择不会被反序列化为可恢复图层。
- **热更新闭环**：共享 URL 变化时，当前处于 custom 的 OL 会重建 source，Cesium 会强制重建 imagery provider；重复提交同一 Cesium URL 仍可主动强制刷新。
- **卷帘对比**：移除 custom 拒绝硬编码；左右比较项可分别携带独立 custom URL 并持久化恢复，支持对比两张动态影像。
- **历史影像 UI**：Sentinel/Wayback 按年份折叠，Wayback 条目只显示 `YYYY-MM-DD`，不再将每个快照加入底图注册表。
- 详见[维护日志](../LLM_record/26-08/2026-08-20/2026-08-20-shared-custom-basemap.md)与[架构说明](../Architecture/2026-08-20-unified-basemap-selection.md)。

#### 二、实时在线统计零轮询重构（原 V3.5.25 主题二；后端全权统计 + 事件驱动广播）

- **在线判定完全由后端承担**：`OnlineUserTracker` 以 SSE 连接引用计数为主信号（`mark_connection` / `drop_connection`，同身份多标签页只计一人）；SSE 不可达期间以"普通鉴权 API 请求搭车刷新的活跃记录"为兜底信号——前端不再发送任何心跳/轮询请求。
- **事件驱动广播**：连接/断开/活跃过期即刻触发推送，经 1s 合并窗口防风暴；保底周期广播放宽至 30s；DB 快照保留单层 10s 缓存。
- **过期扫描协程**：每 5s 扫描兜底活跃记录，过期即刻剔除并广播，消除下线显示的长静默期。
- **半开连接快速感知**：stream 生成器空闲期以 `request.is_disconnected()` 读路径探测断开，不再单纯依赖写失败。
- **游客身份去 IP**：`guest_uid` 种子仅含稳定设备 ID，网络切换（WiFi↔蜂窝）不再把同一访客拆成多个在线身份；缺失设备 ID 时退化为一次性随机身份。
- **前端瘦身**：删除心跳定时器与 visibilitychange 心跳补发，仅保留 SSE 永久指数退避重连、回前台 rAF 积压合并与重连触发；`/statistics/heartbeat` 端点向后兼容保留。
- **SSE 客户端兼容修复**：ticket/heartbeat 兼容 Axios 已解包与原始响应结构，EventSource 使用后端绝对基址；连接 generation 隔离过期 ticket 与旧连接回调。
- 详见[维护日志](../LLM_record/26-08/2026-08-21/2026-08-21-realtime-online-zero-polling.md)。

#### 三、暂存区审查问题修复（原 V3.5.26）：在线信号隔离 · Wayback 可恢复加载 · 北京时间展示

- **在线追踪信号隔离**：普通鉴权活跃仅在身份没有 SSE 连接时刷新兜底记录；`/statistics/heartbeat` 改为显式写入断线心跳，避免健康 SSE 期间的普通 API 请求在连接断开后继续保活 90 秒。
- **在线 tracker 回归测试**：新增健康 SSE + 普通鉴权 + 断开即时下线、显式降级心跳保活及公共活跃入口路由测试。
- **Wayback 目录可恢复加载**：首次请求失败或启动同步尚未完成返回空目录时不再永久标记为已加载，重新进入 ESRI 页签即可重试。
- **Wayback 北京时间展示**：更新时间固定按 `Asia/Shanghai` 格式化，避免凌晨 03:15 同步记录经 UTC 转换后显示为前一天。
- **文档一致性**：首屏关键瓦片超时统一为与代码一致的 15 秒。
- 详见[维护日志](../LLM_record/26-08/2026-08-21/2026-08-21-v3.5.26-review-bugfixes.md)。

#### 四、首屏调度优化与特性增强（原 V3.5.25 主题三）

- **`useStartupTaskScheduler.js`**：`waitForCriticalTileReady` 改版为 tileloadend + rendercomplete + 双帧 rAF 确认，超时 15s（原 3s 不够），确保首屏关键瓦片真正渲染完成才隐藏 loading。
- **`useBasemapSwipe.js`**：移除 `custom` 拒绝硬编码，支持左右 custom URL 分别加载对比。
- **`useMapState.js`**：URL 参数新增 `layerId` + `customUrl` 序列化，保留 `l` 兼容。
- **`useCesiumUrlTracking.js`**：适配统一 `deserializeBasemapSelection` / `serializeBasemapSelection` 契约，`syncCameraViewToUrl` 写入 `customUrl`。
- **`ControlsPanel.vue`**：二次点击收起侧边栏 + 卷帘 custom URL 输入框 + `toggle-tab` 事件。
- **`SidePanel.vue`**：工具箱预加载 10s 延迟。
- **`FloatingAccountPanel.vue`**：轮询启停绑定面板开合（`setOpen` 联动 `startCenterPolling`/`stopCenterPolling`）。
- **`PersistentAnnouncementBar.vue`**：页面可见性变化启停轮询。
- **`CesiumContainer.vue`**：`sharedCustomBasemapUrl` 双向绑定 + `customXyzBasemapUrl` watch 重建 source。
- **`HomeView.vue`**：`sharedCustomBasemapUrl` 单一状态 + `handleControlsToggleTab`/`handleControlsToggleToolboxTab` 二次点击收起 + `buildCesiumQueryPatchFromOl`/`buildOlQueryPatchFromCesium` 同步 `layerId`/`customUrl`。
- **`basemapConfig.ts`**：ESRI 影像图 URL 换为 `wayback-a.maptiles.arcgis.com` 域名（arcgisonline 被墙）。
- **`basemapRegistry.ts`**：新增双引擎底图选择规范化/URL 序列化/年份分组纯函数。
- **`useLayerControlHandlers.js`**：`handleLayerChange` 支持 `source: 'catalog'` + 处理 custom URL 切换。
- **`LayerControlPanel.vue`**：历史影像年份折叠 UI（Sentinel + ESRI Wayback 双页签）+ 懒加载目录。
- **`useSwipeConfigStore.ts`**：扩展 `leftCustomUrl`/`rightCustomUrl` 持久化。

#### 五、历史影像后端（ESRI Wayback 同步/调度/API）（原 V3.5.25 主题四）

- **`services/historical_imagery.py`**：元数据表创建、ESRI 目录拉取与原子替换、调度器（03:15 北京时每日 + 启动即时同步）；SQLite 连接均显式关闭，公开同步状态仅返回脱敏错误文案。
- **`api/historical_imagery.py`**：`/api/historical-imagery/esri-wayback/layers` 使用同步路由读取缓存，由 FastAPI 在线程池执行，避免同步 SQLite 阻塞事件循环。
- **`api/statistics.py`**：`_get_realtime_global_stats_sync` 加 10s 缓存。
- **`scripts/fetch_wayback_layers.py`**：ESRI 目录拉取 CLI 工具（`--json`/`--code`/`--urls`）。
- **`scripts/fetch_wayback_layers.js`**：Node.js 版 CLI 工具。
- **`tests/test_historical_imagery.py`**：`_normalize_entries` 单元测试。
- **`app.py`**：启动时初始化历史影像存储 + 调度器 + 路由注册。

### V3.5.24 (2026-08-19~20) — 综合版本：出站浏览器特征头泛化 · 图层 zIndex 分带治理 · 数据导入统一贴地 · 密钥池化增强 · 瓦片代理泛化

> 2026-08-19~20 的八个增量（原 V3.5.24–V3.5.31，多次不规范 commit 的暂存结果）按用户指示合并为单一版本 V3.5.24。下列小节以原版本号标注，供追溯。

#### 一、运行时密钥池失败自动轮换（备用 key 闭环，原 V3.5.31）

- **背景**：V3.5.30 奥维 tdtkey 池化交付时，失败自动轮换列为后续增强（原方案决策 2）——备用 key
  只能面板手动维护/切换，与「设置备用 key 就是为了主 key 挂了自动顶上」的意图不符。
- **方案**：把天地图专用的容灾轮换泛化为通用密钥池轮换：
  - `basemapConfig.ts` 新增 SSOT 判定函数 `resolveRuntimeTokenPoolKey`——依据图层 `needsContext`
    声明解析所属密钥池（`tianditu_tk` / `ovital_tdtkey`），杜绝字符串猜测（`opentopomap` 等
    含 `omap` 子串的图源不会误判为奥维）；
  - `useRuntimeMapTokenPool.js`：`retryTiandituLayersWithNextToken` → 泛化
    `retryRuntimeTokenLayersWithNextToken`。先解析失败图层/预设涉及的全部密钥池（直接图层命中
    优先，预设展开栈内去重；`useBasemapSelectionWatcher` 传的是预设 ID），逐池 `markRuntimeMapTokenFailed`
    轮换备用 key，任一切换成功即重置受影响图层 source → 重建当前底图 → 恢复超时监控并 toast 提示；
    池内仅 1 个 key 时返回未切换，不产生死循环；
  - 覆盖两条失败路径：`monitorLayerTimeout` 连续 3 错/服务无响应，以及手动切换底图验证失败；
  - Cesium boot 失败重试：`maxRetryCount` 纳入 `ovitalTdtkeys` 长度；底图栈含奥维图层且底图加载失败时
    依次轮换天地图 → 奥维 → Cesium Ion token；
  - MapContainer 两处引用同步改名。
- 详见[日志](Docs/LLM_record/26-08/2026-08-20/2026-08-20-ovital-tdtkey-failover.md)。

#### 二、奥维 tdtkey L2 密钥池化（原 V3.5.30）

- **根因**：奥维注记（`Omap_label`）与奥维等高线（`terrain_omap_contour`）的 `tdtkey` 硬编码在
  `basemapConfig.ts`（同一 key 4 处字面量）；奥维服务防范性强、key 频繁失效变更，每次变更需改代码
  重新部署，期间被 30+ 预设栈引用的奥维注记全部失效。
- **方案**：新增 `ovital_tdtkey` L2 密钥池，完整复用天地图 `tianditu_tk` 既有链路
  （api_keys 表 + 备用池 → `/api/runtime-config/map-tokens` → 前端运行时 token 池）：
  - 后端：`ALLOWED_API_KEYS` / `FRONTEND_RUNTIME_KEYS` 增加 `ovital_tdtkey`，map-tokens 下发
    主 key + 备用池 + is_set；
  - 前端运行时池：`runtimeMapTokens.js` 增加 `ovitalTdtkey` 归一化 / 轮换 / 清缓存；
  - 底图配置：新增 `buildOvitalUrl` 帮助函数，两图源 url 模板改 `{ovitalTdtkey}` 占位符（Cesium
    消费），createSource 运行时注入（OL 消费），**删除全部硬编码 key**；
  - 注入链：`createLayerConfigs(tiandituTk, ovitalTdtkey, customUrl)` 签名扩展，
    MapContainer / useRuntimeMapTokenPool / MapDownloader / CesiumContainer / useCesiumLayers /
    basemapProviderFactory 同步携带；
  - 管理员面板：天地图密钥卡片之后新增「奥维 TDT Key」卡片（含备用池、状态、删除），保存后自动
    清缓存、全站生效；
  - i18n zh-CN/en-US 文案 + `.env.example` [L2] 段登记说明。
- 详见[日志](Docs/LLM_record/26-08/2026-08-20/2026-08-20-ovital-tdtkey-l2.md)。

#### 三、导入数据统一贴地（借鉴 drawPolygon 贴地方案，原 V3.5.29）

- **根因**：KML/KMZ/CZML 加载器未对点/线/面实体施加任何贴地属性；Cesium 域代码无一处
  `heightReference`——开启地形后数据高度 0 落在椭球面，被地形埋没不可见。GeoJSON/SHP
  虽有 `clampToGround: true`，但未补 `disableDepthTestDistance`，地形/3D Tiles 起伏下
  点与标注仍可能被深度测试遮蔽；地形切换监听只处理 3D Tiles，不管矢量数据源。
- **修复**：新增 `loaders/clampToGround.js` 统一贴地工具（借鉴 `drawPolygon.ts` 属性组合）：
  - 先判断地形是否开启（terrainProvider 非 EllipsoidTerrainProvider）；开启才贴地，
    关闭保持数据原始绝对高度；
  - 点/标注 → `heightReference: CLAMP_TO_GROUND` + `disableDepthTestDistance: Infinity`；
    线 → `polyline.clampToGround: true`；面 → `perPositionHeight: false` +
    `heightReference: CLAMP_TO_GROUND`；billboard/corridor/rectangle/ellipse/model 同类处理；
  - 幂等（已贴地不重复改）、已设置非 NONE 高度引用（自带海拔语义）不覆盖、
    时间动态实体（CZML 采样轨迹）自动跳过；
  - KML/KMZ/CZML/GeoJSON/SHP 五个加载器统一接入；
  - `useCesiumDataImport` 地形切换监听扩展：开启/切换地形后矢量数据源自动补贴地。
- 详见[日志](Docs/LLM_record/26-08/2026-08-20/2026-08-20-unify-data-clamp-to-ground.md)。

#### 四、修复 KMZ/KML 标注不显示 + 数据层标注层级上移（原 V3.5.28）

- **根因**（node + esbuild 打包真实模块实证）：KMZ 数据（HENU 系列等 OSM 导出）的
  Placemark `<name>` 大量为 "NULL"（HENU道路 108/108、HENU建筑 58/116），回退链缺陷：
  - `styleUrl` 等元数据字段被当标签 → 显示 `#LineStyle00` 垃圾 ID；
  - 首个要素标签为空时污染 `__empty__` 样式缓存 → 后续要素全部无标注；
  - URL 编码图层名未解码即校验 → 回退链最后一环失效。
- **修复**（`useManagedLayerStyle.js`）：标签回退排除元数据字段（新增
  `IGNORED_LABEL_KEYS`）、空标签不写缓存、图层名先 `decodeURIComponent` 再校验。
- **标注层级**（`zIndexBands.js`）：`Z_BAND.LABEL 800 → 100`（标注瓦片带 100~149，
  底图之上、数据之下；底图带收敛 0~99，卷帘对比带 150~199 不变）——数据层标注文字
  不再被标注瓦片遮挡。
- 详见[日志](Docs/LLM_record/26-08/2026-08-19/2026-08-19-fix-kmz-label-render-and-zindex.md)。

#### 五、修复 TOC 标注开关失效（图层名误判闸门移除，原 V3.5.27）

- **根因**：`TOCTreeItem.vue` 用 `isValidLabel(图层名, 100)` 作为标注菜单显示闸门——
  URL 编码名（%XX>60%）、"无/未知"开头名被误判无效 → 标注菜单项消失；而标注内容实际
  来自要素属性字段，与图层名无关（渲染侧已有校验）。
- **修复**：`canToggleLabel` 改为仅 `!!actions.label`（只看图层能力），移除误加的
  图层名校验与不再使用的 import。
- **连带**：`useLayerOperations.ts` 标注方法名 `toggleLayerLabelVisibility` →
  `setUserLayerLabelVisibility`（对齐 MapContainer 暴露面，消除潜在静默失效）。
- 详见[日志](Docs/LLM_record/26-08/2026-08-19/2026-08-19-fix-toc-label-toggle.md)。

#### 六、TOC 拖拽顺序覆写图层 zIndex（统一数据带 + 跨类型排序生效，原 V3.5.26）

- **统一数据带**（`zIndexBands.js`）：删除 RASTER/VECTOR/DRAW/ROUTE 类型带与
  `Z_BAND_SIZE`，新增 `Z_BAND.DATA = 200`（容量 600，200~799）；保留
  BASEMAP / DISTRICT / LABEL / SYSTEM。
- **TOC 全序覆写**（`useManagedLayerRegistry.js`）：删除 `resolveUserLayerZBand` 与
  `isRasterUploadLayer` 依赖；`refreshUserLayerZIndex` 改为
  `zIndex = DATA + (N - 1 - index)`——TOC 顶部图层（index 0）zIndex 最高、最先显示，
  跨类型拖拽（TIF/矢量/KML）完全生效。
- **创建值与固定层接入**：`useLayerDataImport.js` / `useCreateManagedVectorLayer.js`
  创建 zIndex 接入 `Z_BAND.DATA`；`MapContainer.vue` Z_INDEX 常量从 DATA 带派生
  （搜索点 +150 / 绘制临时 +200 / 路线 +300 / 起终点 +310，数值不变）。
- **根治遗留风险**：跨带溢出（同类型 >100 层）与未知 sourceType 兜底——随类型带
  删除一并消除。
- 详见[日志](Docs/LLM_record/26-08/2026-08-19/2026-08-19-fix-toc-reorder-override-zindex.md)。

#### 七、图层 zIndex 分带治理（标注 > 数据 > 底图 系统级不变量，原 V3.5.25）

- **SSOT 常量**（新增 `frontend/src/domains/ol/layer/zIndexBands.js`）：`Z_BAND` 八显示带
  （底图 0~199 / 栅格 200 / 矢量 300 / 绘制 400 / 路线 500 / 区划 600 / 标注 800 / 系统 900+）、
  `Z_BAND_SIZE=100`、`Z_BASEMAP_SWIPE_OFFSET=150`（卷帘对比层预留带）。
- **统一分散赋值**：底图刷新/组合切换（`useMapState.js`，两条路径同一公式，label 感知）、
  初始化 bootstrap（与刷新同构）、卷帘（`useBasemapSwipe.js`）、工厂默认值
  （`basemapLayerFactory.js`）→ 一律由带常量派生。
- **数据图层按类型分带**：`useManagedLayerRegistry.js` 新增 `resolveUserLayerZBand`
  （区划→DISTRICT、路线→ROUTE、绘制→DRAW、TIF 上传→RASTER、其余→VECTOR）；
  TIF（`useLayerDataImport.js`）与托管矢量（`useCreateManagedVectorLayer.js`）删除本地裸常量。
- **系统层接入**：`MapContainer.vue` Z_INDEX 常量、`DistrictManager.ts` 区划层、经纬网/中心点。
- **修复**：切换底图组合遮挡数据、打开图层管理后数据置顶的不一致；标注瓦片图层恒顶于数据层、
  数据层恒顶于底图瓦片。
- 详见[日志](Docs/LLM_record/26-08/2026-08-19/2026-08-19-fix-layer-zindex-bands.md)。

#### 八、瓦片代理三接口出站请求头泛化（浏览器特征对齐 + 天地图企业域名防盗链，原 V3.5.24）

- **泛化核心**（`backend/utils/http_headers.py`）：新增 `SEC_CH_UA`（与
  `BROWSER_USER_AGENT` 的 Chrome/126 版本号严格一致，反爬交叉校验 UA 与 sec-ch-ua）、
  `DEFAULT_BROWSER_HEADERS` 完整浏览器特征集（`Accept: */*`、`Accept-Encoding` 含
  br/zstd、`sec-ch-ua*`、`Sec-Fetch-*` 共 10 项）、`build_browser_headers()` 与
  `build_browser_headers_no_br()` 两版本；`REFERER_BY_DOMAIN` 新增天地图企业域名
  `map-world.com.cn`（`omap.map-world.com.cn` 等子域全覆盖）。
- **通用代理**（`backend/api/proxy.py`）：默认头换浏览器特征集（`PROXY_USER_AGENT`
  保留为 UA 可配置覆盖）；透传集合扩展 Accept-Encoding / Sec-Fetch-* / sec-ch-ua*，
  **UA 仅 `Mozilla/` 前缀（真浏览器）透传**，脚本强制浏览器 UA。
- **纠偏代理**（`backend/gcj_rectify/fetch.py`）：`fetch_tile` 显式合并浏览器特征头
  （no_br 版，本面需 httpx 解压响应体，广告 br/zstd 而无 brotli/zstandard 解码库会
  抛 DecodingError）+ 白名单 Referer。
- 详见[日志](Docs/LLM_record/26-08/2026-08-19/2026-08-19-enhance-proxy-browser-headers.md)。

### V3.5.23 (2026-08-17~19) — 综合版本：Google 水系图层 · 瓦片解析通用化 · KML/KMZ 符号链路修复 · Sentinel-2 无云影像 · 管理后台移动端适配 · 出站浏览器特征头共享化

> 2026-08-17~19 的六个增量（原 V3.5.23–V3.5.28，多次不规范 commit 的暂存结果）按用户指示合并为单一版本 V3.5.23，分日志收敛为一份综合日志。

#### 一、Google 水系图层（纠偏叠加，原 V3.5.23）

- **图层定义**：`basemapConfig.ts` 新增 `imagery_google_water`（名称「Google水系(WGS)」，category=imagery / group=影像）。上游为 Google `lyrs=m`（道路图）瓦片，经 `apistyle=s.t:0|p.v:off,s.t:6|p.v:on` 过滤——关闭陆地（type 0）、仅保留水系特征（type 6），产出透明底的水系叠加瓦片；URL 通过 `gcj2wgsProxyUrl()` 由 `VITE_TILE_PROXY_BASE_URL` 派生（生产 = `https://negiao-webgis.hf.space/proxy/gcj2wgs/...`），完成 GCJ-02 → WGS-84 纠偏。沿用既有 `vector_Google_clean` 的 `%7C` 编码惯例；用户原始 URL 中的 `&&hl=zh-CN` 归一为单 `&`。
- **预设**：`basemapPresets.ts` 末尾追加 `imagery_google_water_preset`「Google影像水系」，stack = `['imagery_google', 'imagery_google_water']`（底部 Google 卫星影像 + 顶部水系叠加），末尾追加保证 URL 参数 `l` 的既有索引不变；默认预设（China Blender2）不动。
- **SSOT 联动**：Cesium 描述符由 `getDescriptorById()` 自动派生，零额外维护；图层管理面板由 `LAYER_SOURCE_DEFINITIONS` 驱动自动出现。
- 详见[日志](Docs/LLM_record/26-08/2026-08-18/2026-08-18-add-google-water-layer.md)。

#### 二、瓦片解析通用化 + 出站浏览器特征头共享化（原 V3.5.24 / V3.5.25）

- **Google pb 风格 URL 修复**：`/proxy/gcj2wgs/` 与 `/proxy/wgs2gcj/` 无法代理 Google `maps/vt` 瓦片（如 `https://www.google.com/maps/vt/pb=!1m4!1m3!1i10!2i500!3i800!2m1!1e6`），此前一律返回 400。根因：`parse_tile_url` 的 path 模式用「每路径段只取第一个数字 + 取末 3 段」识别 x/y/z，而 pb 格式把 z/x/y 以 `!1i10!2i500!3i800` 前缀式内嵌在**同一个** path 段中——段内首数字是前缀标记（`!1m4` 的 4），解析必然失败。
- **通用化方案**（不针对任何单一服务）：path 模式重写为「**全路径数字 token 扫描**」——`re.finditer` 取整条路径全部数字（含字符区间 spans），枚举全部有序三元组 (i<j<k)，zxy 序优先、其次 xyz 序做合法性校验（z≤30 且 x,y ≤ 2^z-1），合法候选中取 **x+y 最大**者（真实瓦片坐标量级必大于样式/版本等尾随参数数字，可同时兼容 `/z/x/y` 切片、`x{y}` 内嵌与 pb 前缀式）。重建改为按字符区间倒序替换，`! = { }` 等特殊字符零 urlencode 干扰。
- **注意**：pb 的 `!1i/!2i/!3i` 前缀自带数字 1/2/3 混入 token 流，真实三元组并非相邻 token，故必须枚举全部三元组而非仅连续三连（实现中已踩坑验证）。
- **测试**：`backend/tests/test_url_template.py` 扩至 9 用例：内嵌多数字（pb 风格）、尾随垃圾数字、内嵌 xyz 序、用户报告 URL 端到端、format/query/path 三模式回归、无 xyz 报错。全量后端 34 个测试通过。
- **天地图 418 修复**：`download_xyz/tile_engine.py` 注入浏览器 UA + 天地图 Referer 防盗链头，418 反爬拦截不再重试直接放弃。
- **出站浏览器特征头共享化**：新增 `backend/utils/http_headers.py`（`BROWSER_USER_AGENT` 常量 + `REFERER_BY_DOMAIN` 白名单 + `referer_headers_for()`），`download_xyz` / `gcj_rectify` / `api.proxy` 三瓦片出站面共用；`api/proxy.py` 的 `_build_proxy_request_headers` 改为按上游域名白名单附加 Referer（白名单源不透传客户端 Referer）。
- **download_xyz 内网放行开关**：新增 `DOWNLOAD_ALLOW_PRIVATE_HOSTS` 配置（默认 false），与 `/proxy` 面的 `PROXY_ALLOW_PRIVATE_HOSTS` 解耦，避免共用配置互相影响。
- 详见[日志1](Docs/LLM_record/26-08/2026-08-18/2026-08-18-fix-proxy-google-pb-url.md) · [日志2](Docs/LLM_record/26-08/2026-08-17/2026-08-17-tianditu-418-download-fix.md) · [日志3](Docs/LLM_record/26-08/2026-08-17/2026-08-17-shared-outbound-browser-headers.md) · [日志4](Docs/LLM_record/26-08/2026-08-17/2026-08-17-download-xyz-private-host-allowlist.md)。

#### 三、KML/KMZ 符号解析链路修复（原 V3.5.25）

- **编码探测加固（本轮最大发现）**：`textDecoder.js` 与 `useKmzLoader.js` 的编码判定
  原为「U+FFFD 替换字符最少」，但**任意字节流按 UTF-16 解码永不产生替换字符**——
  GBK 中文 KML/KMZ 被系统性误判为 UTF-16LE 而乱码（符号/样式全灭）。改为：
  BOM 权威判定（UTF-8/UTF-16LE/UTF-16BE）+ 无 BOM 打分制（U+FFFD 重罚 ×10000 +
  C0 控制字符罚分 + 字节级 0x00 支撑校验——真 UTF-16 的 ASCII 标记必然产生 0x00，
  LE 在奇位、BE 在偶位，据此排除单字节编码误读并区分无 BOM 字节序）。
- **KML 加载重构**：`kmlLoader.js` 不再把 blob URL 直接交给 `Cesium.KmlDataSource`
  （其内部固定 UTF-8 读取），改为 ArrayBuffer → 多编码解码 → 文本 Blob 加载；
- **KMZ 统一手动管线**：`extractKmlFromKmz(rewriteResourceBlobUrls=true)`——
  doc.kml 智能选择 + 多编码解码 + 内嵌资源 href **全量**重写为 blob URL
  （原实现仅重写图片且无容错；新 `lookupZipEntry` 三级容错：精确 → 大小写不敏感 →
  URL 解码，兼容 `./`、`../`、反斜杠、`%20` 等变体）；删除损坏的 `loadKMZFallback`
  （其字段名/返回结构全错，触发必崩 TypeError）与「原生优先」双路径；重写产生的
  blob URL 登记 `record.blobUrls`，由移除/清空数据源时统一回收；
- **`normalizePath` 修复**：`/^\.\/?/` → `/^\.\//`，`../x` 前缀不再被剥成 `./x`
  （上跳相对路径解析错位的共享缺陷，2D 管线同受益）；
- **TOC**：`TYPE_LABELS` 补 `kmz: 'KMZ'`，三维数据分组格式标签正常化。
- 详见[日志](Docs/LLM_record/26-08/2026-08-18/2026-08-18-fix-kml-kmz-symbol-parsing.md)。

#### 四、Sentinel-2 无云年度影像图层与预设（原 V3.5.26）

- **新增 10 个 Sentinel-2 无云年度图层**（`imagery_s2_cloudless_2016` ~ `_2025`，EOX tiles.maps.eox.at WMTS 公开服务零 token）：2016 对应官方聚合层 `s2cloudless_3857`（Capabilities 标题即 "Sentinel-2 cloudless layer for 2016"，经实测 2016 无独立年度层，400 验证），2017~2025 对应年度层 `s2cloudless-YYYY_3857`（Capabilities 逐层验证 200）；URL 采用 `{z}/{x}/{y}` 模板直连（GoogleMapsCompatible 矩阵集）。
- **图层生成器收敛**：10 个年度条目结构相同，`basemapConfig.ts` 新增 `buildS2CloudlessDef(year)` 生成器 + `EOX_WMTS_URL(layer)` 模板函数，url 与 createSource 共用同一模板串，杜绝两字段漂移（文件内已有 buildTiandituUrl 等函数先例）。
- **新增 10 个底图预设**（`imagery_s2_cloudless_YYYY_preset`，label「Sentinel无云YYYY」，stack = 年度图层 + `label_tianditu` 注记叠加），追加在 `BASEMAP_PRESETS` 尾部，既有 l 索引编号不受影响。
- 详见[日志](Docs/LLM_record/26-08/2026-08-18/2026-08-18-add-sentinel-cloudless-layers.md)。

#### 五、管理后台移动端适配（原 V3.5.27 / V3.5.28）

- **顶部 Tab 移动端点按无效修复**：`AdminControlPanel.vue` 的 `onTabsNavDragStart` 在 `touchstart` 上无条件 `e.preventDefault()`——移动端浏览器在 touchstart 被阻止后不再派发合成 click，按钮 `@click` 永远不触发（桌面端 mousedown 的 preventDefault 不吞 click，故仅移动端中招）。改为位移阈值（10px）判定 + 捕获阶段 click 处理器吞掉拖拽残留 click；`.tab-btn` 由 `flex: 1 1 0; min-width: 0` 改为 `flex: 1 1 auto; min-width: 180px`（移动端 ≤768px 为 150px），窄屏可横向滑动、文字不再截断。
- **「数据管理」子页移动端 UI 适配**：`.db-toolbar` 的 `flex-wrap` 对「单组自身即超宽」的子分组无效——切表/统计/分页三个分组各自单行排布（如分页组 select+上一页+页码+下一页+导出 ≈ 320px+），375px 手机扣外层 padding 后可用宽度仅约 287px，必然横向溢出被裁切。`@media (max-width: 768px)` 内新增：工具栏改竖排堆叠；切表下拉弹性撑满行宽；搜索框独占一行；页码信息居中成行；导出按钮独占一行靠右；卡片头（标题+刷新表）改纵向堆叠；表格容器 `max-height` 改 60vh（原固定 480px）。`#admin-panel-database` 前缀限定 card-header 规则只作用于本子页；桌面端样式零改动。
- 详见[日志1](Docs/LLM_record/26-08/2026-08-19/2026-08-19-fix-admin-tabs-mobile.md) · [日志2](Docs/LLM_record/26-08/2026-08-19/2026-08-19-fix-admin-database-tab-mobile.md)。

#### 六、顺带

- **HF 日志流 SSE 双重 data 前缀修复**：`backend/api/monitor.py` 的 `stream_logs` 在 SSE 帧行带 `data: ` 前缀时先剥离再尝试 JSON 解析，否则 `json.loads` 必失败、原样透传导致前端拿到 `data: {json}` 字符串无法解析。
- **注册页确认登录按钮**：`RegisterView.vue` 的「确认登录」按钮由 `type="button"` + `@click="handleSubmit"` 改为 `type="submit"`（表单原生提交，消除重复触发风险）。
- **图层管理面板下拉高度**：`LayerControlPanel.vue` 下拉菜单 `max-height` 450px → 480px（适配新增底图预设数量）。
- **底图注记切换**：`basemapPresets.ts` 多个预设的注记图层由 `label_tianditu` 切换为 `Omap_label`（奥维注记，`basemapConfig.ts` 新增 `Omap_label` 图层定义 + `terrain_omap_contour` 奥维等高线图层 + `imagery_tianditu_omap_contour_preset` 天地图影像+等高线预设）。
- 详见[日志](Docs/LLM_record/26-08/2026-08-17/2026-08-17-hf-log-stream-double-data-prefix.md)。

### V3.5.22 (2026-08-17) — 综合版本：首屏语言跟随浏览器 · 注册/法务页返回首页 · Hugging Face OAuth 接入 · L3 状态监控自动化 · 商标图标规范化

> 2026-08-16~17 的十个增量（原 V3.5.22–V3.5.31，多次不规范 commit 的暂存结果）按用户指示合并为单一版本 V3.5.22，分日志收敛为一份综合日志。

#### 一、语言体系：首屏跟随浏览器默认（detectSystemLanguage SSOT 三连）

- **首屏语言**：全新访客初始语言由硬编码 `zh-CN` 改为检测浏览器默认语言（`navigator.language` 以 `zh` 开头 → `zh-CN`，其它/异常 → `en-US`）；`useLocale.js` 新增导出 `detectSystemLanguage()`，`readInitialLanguage` 无存储值走检测（兜底 `zh-CN` → `en-US`）；偏好 store `DEFAULT_PREFERENCES.language` 与 `applyRuntimePreferences` 兜底同步改用检测（消除 `main.js` bootstrap 覆盖初始检测）；用户显式切换与登录偏好回写优先级不变；LandingView 零改动（SSOT 统一供给）。
- **空值/脏值收口**：远端空语言不再归 `zh-CN`；`normalizeLocaleLanguage` 非 `zh-CN`/`en-US`（空/缺失/历史脏数据如 `'fr'`）= 未设置有效偏好 → `detectSystemLanguage()`；偏好表单草稿初始值与 props default 跟随系统；删除冗余 `normalizePreferenceLanguage`，localStorage 脏 key / 远端脏数据 / 表单本地归一三链路行为统一。

#### 二、注册页 / 法务页导航闭环

- **注册页返回首页**：头部右侧操作区（语言切换器左侧）新增 34px 圆形房子图标按钮（lucide `Home` + `landing.backHome` 双语键，core 首屏即命中）；品牌区（logo + 标题）保留可点为隐藏强化入口；设计迭代 V1 独立 pill → V2 仅品牌区可点 → V3 右侧图标按钮（现行）。
- **品牌区显示修复**：`auth.appPurpose` 副标题单行截断 → 最多 2 行完整显示（`-webkit-line-clamp: 2`）；标题 ≤768px 17→16px。
- **法务页出口**：`/terms`、`/privacy` 顶部新增「返回首页 → /」+ 分隔符（flex 布局），与既有「返回登录页面」并排。

#### 三、Hugging Face OAuth 登录接入（L3，用户会话内明确指令豁免「先交方案批准」流程）

- **后端 HF provider**：`oauth.py` 新增 `huggingface` 分支——授权端点 `https://huggingface.co/oauth/authorize`、scope `openid profile email`；token 交换走 `Authorization: Basic base64(client_id:client_secret)` 头（HF 官方契约，Google/GitHub 保持 form 传参不变）；资料经 `https://huggingface.co/api/whoami-v2` 获取，`id` 为改名持久标识（存 `oauth_accounts.provider_user_id`）；`routes.py` ticket 试探列表 +huggingface。
- **配置登记**：catalog 新增 L1 端点（`HUGGINGFACE_OAUTH_REDIRECT_URI/AUTH_URL/TOKEN_URL/PROFILE_URL`）+ L3 `HUGGINGFACE_OAUTH_CLIENT_ID/SECRET`（`.env.example` 留空）；`load.py`/`public.py`/`admin.py` 同步（`features.oauth_huggingface` + 管理员环境密钥状态卡片）。
- **前端三入口**：注册页「使用 Hugging Face 继续」按钮、账号中心 OAuth 绑定/解绑列表、Landing CTA pill；`api/backend/auth.js` 四个 OAuth 函数 provider 白名单放开；i18n 三文件同步。
- **HF emailVerified 例外**：HF 注册强制邮箱验证，以「email 存在」作为已验证判据（`emailVerified` 字段仅反映隐私设置，false/缺失不再拦截自动注册/绑定，方向经用户确认）；Google/GitHub 严格规则不变；email 缺失仍走下游统一拦截。
- **文档**：`oauth-deployment.md` 新增「HF OAuth App 申请」章节（Redirect URI 逐字符一致、scope 必须勾 email）+ Secrets/排错表/安全要点；`configuration.md` / `handover.md` / 三份 structure / `README_EN.md` 特性文案同步。数据库零变更（provider 为 TEXT 无 CHECK 约束）。

#### 四、L3 状态监控自动化（catalog 元数据驱动，零手动维护）

- `catalog.py` L3 key 元数据新增 `status_label`（分组显示名：Google OAuth / GitHub OAuth / Hugging Face OAuth / SMTP / SUPABASE）/ `status_exclude`（Supabase 4 个历史兼容名仅登记不监控）+ `iter_l3_status_groups()`（无 label 且 L3 的 key 独立成组：SUPER_USER / OAUTH_STATE_SECRET / SMTP_REPLY / LOG）；`load.py` 新增 `l3_status_flags()`（组已配置 = 组内全部 key 非空，LOG 无 Settings 字段兜底 `get_str`）。
- `masked_summary`（启动日志 `[L3]`）与 `admin.py` `_get_l3_env_status`（管理员面板 API）改为自动遍历（9 组，含 Hugging Face OAuth）；前端 `AdminControlPanel.vue` 删除 `L3_STATUS_LABELS` 硬编码（本次 HF 漏加根因），直接遍历后端 `{label: bool}`（Python dict 保序）；zh-CN/en-US 死 i18n 键 `admin.envKeys.*` 清理。
- 新增 L3 key 只需在 catalog 登记即自动出现在两处监控。

#### 五、商标图标规范化

- **Google 官方四色 G**：FA 6.4.0 的 `fa-google` 为 2015 年前旧版单色字形 → Google 官方四色 SVG（蓝 `#4285F4` / 红 `#EA4335` / 黄 `#FBBC05` / 绿 `#34A853`，2015 起标准版，Wikimedia Commons Google LLC 官方文件）；注册页 OAuth 按钮（16px）与 Landing CTA pill（14px）两处同步，path 自带色值，CSS 只控尺寸。
- **HF 官方彩色 logo**：Simple Icons 单色笑脸 → 官方品牌资产彩色版——新增 `frontend/public/images/hf-logo.svg`（官方 `huggingface/brand-assets` 数据集，256×256；官方托管域本机访问受限，用户手动下载入库）；三处入口（注册页按钮 16px / 账号中心绑定列表 15px / Landing CTA pill 14px）改 `<img>` 引用（`ASSET_BASE_URL` 解析，与 icon.webp 同策略），CSS 删除 `fill: #ffd21e` 单色染色。

#### 六、顺带

- `frontend/vite.config.js`：dev server `allowedHosts` 白名单加 `demo.negiao.cn / negiao.cn / webgis.negiao.cn / localhost / 127.0.0.1`（内网穿透 ngrok/frp/Cloudflare Tunnel、局域网与移动端调试）。

- 验证：后端 `py_compile` 通过（V3.5.27 7 文件 + V3.5.29 4 文件 + V3.5.28 1 文件）；`tsc --noEmit` 通过（语言四任务）；ESLint 前端改动文件零告警；`l3_status_flags()` 实跑 9 组全 false（空环境）+ 组语义验证（GOOGLE 仅 ID → false，ID+SECRET 齐 → true）；双门禁通过（配置 121 key / 结构树 427 条目 0 漂移）。

详见 [综合变更日志](Docs/LLM_record/26-08/2026-08-16/2026-08-16-v3.5.22-consolidated.md)。

### V3.5.21 (2026-08-16) — 综合版本：管理面板数据表格增强 · Agent 底图能力开放 · CyclOSM 骑行底图 · Landing/注册页 Lucide 迁移

> 2026-08-15 的九个增量（原 V3.5.21–V3.5.29，多次不规范 commit 的暂存结果）按用户指示合并为单一版本 V3.5.21，分日志收敛为一份综合日志。

#### 一、管理面板数据表格增强（`backend/api/admin.py` + `AdminControlPanel.vue`）

- **分页 + 总数**：rows 接口响应 `data` 扩展为 `{ rows, total }`（COUNT 与 SELECT 共用 WHERE）；前端分页器（上一页/页码/下一页）+ page size（30/100/200/全部，「全部」前端 200 行/次循环拉取）。
- **跨页搜索**：`search` 参数全列 `LIKE ? ESCAPE` 过滤（`%`/`_`/`\` 转义，参数化防注入）；前端 300ms 防抖回第 1 页；CSV 导出携带搜索词（导出即当前搜索结果）。
- **跨页排序**：`sort_key`/`sort_dir`，列名命中 `PRAGMA table_info` 真实列集合（白名单防注入，ORDER BY 无法参数化绑定列名），非法回退 `rowid DESC`；切表自动重置。
- **加载竞态**：请求序号 `rowRequestSeq` 丢弃过期响应（快速翻页/防抖期间旧结果不覆盖新结果）。
- **行号列 + 浏览区间信息条**：首列连续序号（按页偏移）；sticky 信息条「第 X-Y 行 / 共 N 行」；行展开编辑保留行号列。
- **搜索命中高亮**：单元格先 HTML 转义再按命中区间包 `<mark>`（防 XSS、大小写不敏感、多段命中）+ 命中整行弱高亮。
- **CSV 全量导出**：循环拉全量 → UTF-8 BOM CSV → Blob 下载；i18n 新增分页/搜索/区间键（zh-CN / en-US）。

#### 二、Agent 底图能力开放（L3 方案均经用户批准）

- **url 通道**：`switch_basemap` 参数 `presetId | url` 二选一；url 复用 `normalizeCustomXyzUrl` 校验（强制 `{z}/{x}/{y}`、协议 http/https；token 类 query 允许，提示词警示私有密钥可见性）；`HomeView.vue` `setBasemap` 分流注入 OL/Cesium 既有 custom 链。
- **自主构造公开源**：系统提示词授权按意图自行构造免密钥 XYZ（附 OSM / Esri（{z}/{y}/{x} 倒序提示）/ CARTO / OpenTopoMap 参考 + 失败换源重试指导）。
- **预设目录全量动态派生**：`agentMapPresets.js` 废除 38 项手写白名单，从 `basemapPresets.ts` 全量派生（76 项、无黑名单），`formatAgentBasemapPresetCatalog()` 按语义分组（天地图/图新/Google/高德/腾讯/Mapbox/Yandex/MapTiler/ESRI/OSM 系/GeoQ/地形/程序槽位/本地瓦片），新增底图零维护同步；token 密钥仍由运行时注入。
- **回显适配**：`useAgentMapContext.js` / `chatIntentFallback.js` 支持 url 摘要显示（HTML 转义）。

#### 三、CyclOSM 骑行底图

- `basemapConfig.ts` 新增 `vector_cyclosm` 图源（`https://{a-c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`，xyz + `prioritizeTileSourceRequest`）；`basemapPresets.ts` 注册 `vector_cyclosm_preset`；Cesium 复用通用 xyz 分支（子域自动展开）；Agent 目录自动收录。

#### 四、Landing/注册页 Lucide 迁移与 OneTap 修复

- `LandingView.vue` / `RegisterView.vue` 全部 FontAwesome 图标迁移 `@lucide/vue`（26 + 30 处，含三态图标、`Loader2` + `spin` keyframes）；品牌图标（Google/GitHub/VueJS/Docker）Lucide 无对应保留 FontAwesome（批准例外）；清除 `✅` emoji 前缀；CTA 新增登录方式 pill（`landing.ctaMethods` 等双语键）；Hero 统计「20+」→「70+」（README/core.js 同步）。
- `initGoogleOneTap` 改 async + `waitForGsi()`（200ms 轮询 / 5s 超时），修复 GSI 脚本慢载时 OneTap 静默失效。

#### 五、`.env` OAuth Client ID 分级调整

- 后端 `GOOGLE_OAUTH_CLIENT_ID` 清空（生产值转 HF Secrets，不入仓）；前端 `VITE_GOOGLE_OAUTH_CLIENT_ID` 更新为新 App ID；两 key 均已在 `.env.example` 与 `catalog.py` 登记。

#### 验证与遗留

- 验证：`vite build` / `tsc --noEmit` / `py_compile admin.py` / 双门禁通过（各原会话 + 整合会话复跑）。
- 遗留：SQL dump 导出待决策（已记 TODO）；url 通道 token 可见性（用户已接受）；受限源失败靠结构化错误 + 换源兜底；Cesium custom 注入返回 void 无法反馈失败；第三方社区源无 SLA。

详见 [综合日志](Docs/LLM_record/26-08/2026-08-16/2026-08-16-v3.5.21-consolidated.md)。

### V3.5.20 (2026-08-15) — 宣传主页（LandingView）补全：中英文切换 · 品牌 logo · 滚动修复；注册页 Landing 同源背景；正式域名 webgis.negiao.cn 接入

#### 宣传主页（`frontend/src/app/LandingView.vue`）

- **中英文切换**：全量文案迁移至 i18n（新增 `landing.*` 双语键，入 `locales/core.js`——根路径首屏页须随首包同步加载）；导航栏增加与注册页同款「中文 / EN」切换器，走 `useUserPreferencesStore.setLanguagePreference` 全局偏好（与账号中心同开关）。
- **品牌 logo**：顶部品牌徽章由 FontAwesome 图标替换为 `public/images/icon.webp`（与 TopBar / favicon 同一资源，经 `ASSET_BASE_URL` 解析）。
- **滚动修复**：根因 `App.vue` 全局 `html, body { overflow: hidden }`（全屏地图布局）裁切了超出视口的内容；`landing-container` 改为 `height: 100dvh + overflow-y: auto` 自持滚动容器，sticky 导航与长页面滚动恢复正常。
- **结构优化**：9 张功能卡与 Hero 统计条收敛为数据驱动 `v-for`（图标 + i18n key），消除近似模板重复。

#### 注册页（`frontend/src/app/RegisterView.vue`）

- 新增 Landing 同源背景装饰层（`register-bg`：经纬网格 + 品牌色/强调色光晕，与 hero-bg 同一视觉语言），桌面/移动端均生效；卡片 `z-index` 提升以保持可读性。

#### 其他

- 代码无文件增删；结构树补录 `LandingView.vue` 登记（上会话创建时遗漏，门禁拦截后补齐）；`tsc --noEmit` 零报错。

#### 正式域名接入（webgis.negiao.cn 全链路落档）

- **UI 入口**：LandingView 页脚新增「个人主页」（`https://www.negiao.cn`）与「正式站点」（`https://webgis.negiao.cn`）链接，配 `landing.homepage` / `landing.officialSite` 双语键（入 core.js）；注册页品牌徽章同步 Logo 化（`images/icon.webp`，深绿渐变托底）。
- **配置默认值**：`backend/config/catalog.py` 的 `FRONTEND_URL_PROD` 更新为 `https://webgis.negiao.cn`（OAuth 前端回跳/派生基址随之后移）；根 `.env` 的 `FRONTEND_PUBLIC_URL` 同步。
- **文档落档**：`README.md` / `Docs/README_EN.md` 在线演示链接、域名拓扑表（新增正式域名行）、托管表前端部署列、作者行（个人主页链接）；`oauth-deployment.md`（Homepage URL + 内建默认值 + 变量示例）、`configuration.md`（部署示例两处）、`deployment-relationship.md`（WebGIS 前端域名表 7→8 行）、`account-system-ai-quota.md`（已注册域名列表 + 域名计数）。

详见 [本次日志](Docs/LLM_record/26-08/2026-08-15/2026-08-15-landing-i18n-scroll-background.md) · [正式域名日志](Docs/LLM_record/26-08/2026-08-15/2026-08-15-official-domain-webgis-negiao-cn.md)。
### V3.5.19 (2026-08-12) — 综合版本：实时在线统计体系（心跳模型）· 时区 UTC+8 修正 · IP 定位加固

> 暂存区多轮未提交改动（旧版本号 V3.5.19~27 + V3.4.63 遗留时区/IP 改动）按用户指示合并为单一版本 V3.5.19，代码注释、日志、README/CHANGELOG 全部收敛。

#### 实时在线统计（核心，最终形态 = 心跳模型）

- **心跳模型**：前端每 5s POST `/api/statistics/heartbeat`（身份 = 登录 username / 游客 device_id 派生 uid，同身份多标签去重），后端 15s 窗口内有心跳 = 在线，停心跳（下线/断网/关页）自动剔除，每 15s 广播人数。删除「请求活跃 ∪ SSE 连接保活」双信号、断开宽限、offline 上报等全部补丁。
- **SSE 推送通道**：一次性短时 ticket 鉴权（`/api/statistics/ticket` → `/api/statistics/stream`），完整 token 不再进 URL；登录与游客均可建立，连接/断开不影响在线判定。
- **游客接入**：未登录访客恒发 `X-Guest-Device-Id`（sessionStorage 每标签独立），guest allow 放行；`statistics.py` 的 `_merge_online_tracker` 使 center/realtime 轮询与 SSE 广播口径一致（含游客），游客侧在线数真实可见。
- **前端**：`useRealtimeStats.js` 模块级单例（HomeView 挂载全局启用），5s 心跳 + `visibilitychange` 前台补发 + SSE 消费；心跳定时器幂等（重连不累积，review 修复项）。
- **鉴权收口**：`_extract_token` 不再接受 query token。

#### 时区修正（V3.4.63 遗留，归并）

- 全站时间由 UTC 改为北京时间（UTC+8）：`auth/db.py`（`_utc_now`/`_iso`/`_parse_iso`/迁移备份命名）、`admin.py`、`api_management.py`、`api_keys_management.py`、`agent_chat/utils.py`、`api/location.py`、`download_xyz/*`、`utils/sqlite_maintenance.py`、`utils/sqlite_recovery.py`；`sessions.last_seen_at` 触活节流 60s→15s 适配实时推送。

#### IP 定位加固（V3.4.63 遗留，归并）

- `_extract_client_ip` 优先信任前端 `X-Client-IP`（前端 ipify 取公网 IP，3s 超时 + 30s 负缓存）；
- 私有 IP 检测（`_is_private_ip`），Docker 网关/内网 IP 直接跳过定位或返回 400；
- 定位服务新增 ipwho.is 优先（免费、HTTPS、不屏蔽数据中心 IP）；配置 `IP_GEO_IPWHO_ENDPOINT` 已登记。

#### 其他

- 端点变更：新增 `/api/statistics/heartbeat`、`ticket`、`stream`；删除 `/api/statistics/disconnect`（前后端需同步发布）。
- 结构树、README、CHANGELOG、综合日志同步。

详见 [综合日志](Docs/LLM_record/26-08/2026-08-12/2026-08-12-v3.5.19-consolidated.md)。

### V3.5.18 (2026-08-12) — 综合版本：Emoji→Lucide 图标迁移 · 管理面板数据表格化重构 · KaTeX 数学公式渲染 · 代码审查修复

> 暂存区多次改动合并为单一版本（含 Code Review 修复）。

#### 前端 — Emoji → Lucide 图标迁移

- 12 个 Vue 组件统一将模板中的 emoji 图标替换为 `@lucide/vue` 组件：`AdminControlPanel.vue`、`ApiManagementPanel.vue`、`ApiKeysManagementPanel.vue`、`TOCPanel.vue`、`Message.vue`、`NavTargetPicker.vue`、`PlayerGuidePanel.vue`、`HomeView.vue`、`AdministrativeDivisionPanel.vue`、`MapSwipeController.vue`。
- 规范写入 `Force_command.md` 第 3 节「实施」：UI 图标统一使用 `@lucide/vue`，禁止使用 emoji。

#### 前端 — AdminControlPanel 数据管理重构

- 数据表展示从行卡片改为**表格**（`.data-table`），支持表头排序（点击切换 asc/desc）+ 关键字搜索过滤。
- 新增**单元格行内编辑**：点击单元格直接进入编辑态，Enter 保存 / Esc 取消。
- 新增行展开 JSON 编辑模式（与单元格编辑互斥）。
- 新增行从 JSON textarea 改为**表单插入**（每列一个 input），支持展开/收起。
- 图标从 emoji 改为 Lucide 组件（LayoutDashboard/Settings/Bot/Database）。

#### 前端 — ApiManagementPanel 统计增强

- 端点统计表和日志表均新增**表头排序**（通用 `createSortedComputed` 工厂函数）。
- 图标从 emoji 改为 Lucide 组件（BarChart3/Link2/ScrollText/Settings/KeyRound）。

#### 前端 — Markdown 数学公式渲染

- `useMarkdownRenderer.js` 集成 **KaTeX**：支持行内 `$...$` 与块级 `$$...$$` 公式渲染。
- 占位符策略：marked 解析前提取公式 → 解析后用 KaTeX 渲染回代（避免 marked 破坏 LaTeX 语法）。
- **安全修复**：移除 `trust: true` 配置；KaTeX 输出标签加入 DOMPurify 白名单（math/semantics/mrow 等）。
- **并发修复**：将模块级 `mathStore`/`mathCounter` 改为每次渲染独立的 `createMathContext()`，避免并发渲染时数据互相覆盖。
- `ChatMessageList.vue`：代码块样式从 scoped 迁移至非 scoped `<style>` 块（v-html 注入的 `.code-block-wrapper` 无法携带 `data-v-xxx` 属性，scoped 选择器链断裂）。
- `package.json` / `package-lock.json`：新增 `katex@^0.16.11` 依赖。

#### 前端 — 聊天配置按路由模式隔离

- `useChatAgentConfig.js`：localStorage 键名按路由模式隔离（默认 AI / 个人 Key / 代理三套 key），避免跨模式模型误用。
- 默认 AI 模式保存模型不再写入全局账号偏好（`preferred_agent_model`），避免污染后端代理模式的模型选择。

#### 前端 — 新闻功能降级链路加固

- `SidePanel.vue`：`fetchNews` 直连失败后走代理时，使用**独立 AbortController**（原共享 controller 导致超时窗口不足）。
- HTTP 非 ok 响应也纳入降级判断（原只有网络错误才降级）。

#### 前端 — Code Review 问题修复

- `AdminControlPanel.vue`：修复 v-for 中 `ref="cellInputRef"` 只引用最后一个元素的问题（改为函数 ref `:ref="setCellInputRef"`）。
- `AdminControlPanel.vue`：添加单元格编辑与行展开编辑的互斥逻辑（行展开模式下禁止单元格编辑）。
- `AdminControlPanel.vue`：agent tab 图标从 `Globe` 改为 `Bot`（语义更准确）。
- `FloatingAccountPanel.vue`：移除点击外部关闭面板的逻辑，改为显式 X 按钮关闭。

#### 文档

- `Force_command.md`：新增「UI 图标规范」条款（禁止使用 emoji，统一使用 Lucide 组件）。
- 根 `README.md`：三处版本号更新（V3.5.17 → V3.5.18）。
- `Docs/Guide/CHANGELOG.md`：追加 V3.5.18 完整条目。

---

### V3.5.17 (2026-08-11) — 综合版本：Agent 模式大改（免费默认 AI + 路由模式隔离）· 管理面板升级 · 模型调用统计 · Cesium 贴地重构

> 暂存区多次不规范改动合并为单一版本（Review + Bug 修复 + 文档合并，详见[合并关账日志](LLM_record/26-08/2026-08-11/2026-08-11-v3.5.17-consolidated-review.md)；其中「配置保存跨模式污染修复」见[专项日志](LLM_record/26-08/2026-08-11/2026-08-11-fix-chatconfig-model-mode-scoped.md)）。

#### 前端 — Agent 对话路由模式重构

- **默认 AI 免费化**（前后端一致）：后端 `/chat/default-proxy` 移除配额预检与按 token 扣费，改为免费服务（`quota: null, cost: 0`）；前端默认 AI 模式不显示消耗、不判定配额耗尽、不拦截发送、状态条显示「免费（不扣额度）」（新增 `chat.freeQuota` i18n）。
- **个人 Key 模式独立判定**：新增 `isPersonalMode`（仅用户主动填写个人 api_key+base_url 才算），展示层与通道判定解耦，默认 AI 不再被误判为直连。
- **配置保存按路由模式隔离**（修复跨模式污染）：默认 AI 模式保存模型只写 `defaultAIModel` + localStorage + 账号偏好，不再写入后端个人配置（`agent_user_config`）；不再清空 `directConfig`；状态条展示实际请求模型；`loadAvailableModels` 恢复该模式上次选择；`syncDraftFromDirectConfig` 草稿对齐 `defaultAIModel`。
- **Review 回归修复**：`callLLM` 默认 AI 分支恢复 `finalModel = defaultAIModel || dc.model`（此前重构后请求永远用管理员默认模型，面板选择失效）；`ChatConfigPanel.pickModel` 恢复按模式写入（默认 AI → defaultAIModel / 个人 Key → directConfig.model）。
- `ChatServiceStatus.vue`：三模式状态展示重构（默认 AI=免费、个人 Key=不消耗平台配额、代理=消耗+额度）。
- `ChatPanelContent.vue`：发送/刷新配额/消耗累计的判定全部改为按 `isDefaultAIMode`/`isPersonalMode` 分流。

#### 前端 — 管理控制台升级

- `AdminControlPanel.vue`：整段重写（模板 1403 行）——顶部 Tab 支持拖拽/横向滚动定位；数据表行内 JSON 编辑（替代 window.prompt）；页脚状态指示；`useAgentConfig` 统一装配（Agent 配置表单）。

#### 前端/后端 — API 用量统计

- 后端 `api_management.py`：新增 `/api-management/usage/by-model`（管理员），按 `request_params` 中 base_url+model 维度聚合调用/成功/错误/响应耗时/最后使用时间；三通道（completions/default-proxy/proxy）的 `request_params` 均含 model+base_url。
- 前端 `api/backend/admin.js` 新增 `apiAdminApiUsageByModel`；`ApiManagementPanel.vue` 端点统计 Tab 改为「模型调用统计」（Base URL/模型列），用户配额表新增用户名搜索 + 表头排序。

#### 前端 — Cesium 贴地链路重构

- `buildVerticalTranslation` 改为按模型中心径向向量平移（弃用经纬度两点相减，修复非标准投影/精度问题）；`setTilesetHeight` 增加 `_originMatrix` 基准复合（首次调整缓存含贴地偏移的基准矩阵，后续左乘平移，避免累积漂移与右乘导致的斜移）。
- `fitTilesetToTerrain`/`refitTilesetToTerrain`：取消 2m 死区改**积极贴地**（中位偏移直接施加）；椭球地形（无真实地形）不再强制拉回 0 海拔（数据自带海拔即真实位置）；修正量超限仍跳过。
- `CesiumToolPanel.vue`：高程滑杆范围改造——新增基于采样回填的 `sampledRangeMap`（`request-range-sample` 事件 + `setSampledRange`），兜底策略最小下限 -10m；`emitSetHeight` 按范围 clamp。
- 新增武汉建筑白膜样例（`loadSampleBaimoTileset`，`3dtiles.negiao.cc.cd/baimo`CDN）+ 场景/数据双菜单入口（`sampleBaimo` i18n）。

#### 文档 / 依赖 / 其他

- 新增演示页 `Docs/Demo/first_person_fly.html`（Vue3 + Cesium 第一人称漫游，纯 CDN 无密钥）。
- `dompurify` 3.4.11 → 3.4.13（Dependabot）。
- `floatingaccountpanel.vue`：全屏模式 Tab 导航改 nowrap（修复换行挤压）；`useCesiumSceneActions` 移除未使用的 `message` 参数；`.github/traffic.json` 自动统计更新。

### V3.5.16 (2026-08-08) — 综合版本：远程 3D 服务 · 材质修复 · 透明度诊断 · UI 统一 · 开发体验

> 综合版本：聚合 4 项 L2 任务——远程 3D 服务加载（Ion/I3S/3D Tiles）+ 数据源统一注册；场景 Tab「加载 3D 模型」→ 下拉菜单（与 Data Tab 同范式）；3D Tiles 材质模式 5 项 Bug 修复；数据源透明度链路加固与诊断；以及若干未单独开版本的改动（HomeView Cesium 感知路由、vite 开发服务器代理配置、.env.local 后端 URL 相对路径化）。详见各[日志](LLM_record/26-08/2026-08-08/)。

#### 前端 — 远程 3D 服务加载 + 数据源统一注册

- `cesium-shim.js`：新增 `I3SDataProvider` 垫片导出。
- `composables/layers/useCesiumLayers.js`：新增 `loadCustomUrl3DTiles(type, url)` 统一处理 Ion/I3S/3D Tiles 三种远程加载；加载成功后调用 `dataImport.registerExternalDataSource()` 注册到统一列表；Ion 影像/地形加载器成功后同样注册到数据源列表；远程加载的 primitive 通过 `isRemoteServiceLoad` 标志走 `show` 属性切换（避免销毁重建）。
- `composables/dataImport/useCesiumDataImport.js`：新增 `registerExternalDataSource({ name, entity, ... })`，返回唯一 ID；高度偏移操作优先使用 `record.tileset`（I3S 等复合 primitive 的内部 tileset 引用）。
- `composables/dataImport/loaders/tilesetLoader.js`：新增 `loadSampleIonTileset`（Ion Asset 5115505 河南大学）+ `loadSampleI3sTileset`（Ion Asset 354759 美国摄影测量数据）；`fitTilesetToTerrain` 改为 `export` 供 useCesiumLayers 复用。
- `composables/dataImport/useCesiumDataOpsHandlers.js`：`handleImportTilesetSample` 按 `payload.type` 分发（city / ion / i3s / discreteLOD）。
- `components/CesiumToolPanel.vue`：样例数据按钮改为下拉菜单（Teleport + position: fixed 避免 HMR __vnode 错误）；新增「远程 3D 服务」卡片（类型选择 + URL 输入 + 加载按钮）移至数据 Tab；图层 Tab Ion 卡片移除（功能已整合到远程服务卡片）。
- `components/CesiumContainer.vue`：装配顺序调整（heightSampler → dataImport → useCesiumLayers），修复依赖注入顺序。
- `locales/zh-CN.js` / `en-US.js`：新增 `sampleDataTitle` / `sampleCity` / `sampleIon` / `sampleI3s` / `remoteService*` i18n key。

#### 前端 — 场景 Tab 3D 模型下拉菜单

- `composables/dataImport/loaders/tilesetLoader.js`：新增 `loadSampleDiscreteLODTileset`，加载 Cesium 官方 TilesetWithDiscreteLOD 样例（GitHub 远程 tileset.json），flyTo 定位。
- `composables/dataImport/useCesiumDataImport.js`：导入并导出 `loadSampleDiscreteLODTileset`。
- `components/CesiumToolPanel.vue`：场景 Tab 在 `quick-actions` 中新增「加载 3D 模型」下拉菜单（4 项：city / ion / i3s / discreteLOD），复用 Data Tab 同范式样式。
- `composables/toolModules/sceneModule.js`：移除 `tileset` 动作定义。
- `composables/toolModules/useCesiumToolModules.js`：移除 scene.tileset 映射。
- `composables/camera/useCesiumSceneActions.js`：移除已无调用者的 `loadCustomTileset` 函数。
- `locales/zh-CN.js` / `en-US.js`：新增 `sampleLod` / `load3DModel` i18n key。

#### 前端 — 3D Tiles 材质模式 5 项 Bug 修复

- `tilesetLoader.js` — `buildHeightStyle`：`isNaN()` 非 3D Tiles Styling 合法函数，替换为 `has_property('height')` 兜底，移除无效 `=== undefined` 检查。
- `tilesetLoader.js` — `buildCustomShader` (gradient)：硬编码 `bottomHeight=560, topHeight=750` 改为从 `tileset.boundingSphere` 动态计算；`positionMC.z` 改为 `positionWC.z`（世界坐标）；添加 `lightingModel: UNLIT` 使颜色不受光照影响。
- `tilesetLoader.js` — `applyTilesetMaterial`：向 `buildCustomShader` 传递包围球信息 `bsInfo`。
- `tilesetLoader.js` — `loadTilesetFromFileMap` / `loadTilesetJSON`：加载时应用默认 `baimo` 材质并设置 `record.materialMode = 'baimo'`，与 UI 默认值一致。
- `dataSourceDisplay.js` — `getTilesetState`：接受可选 `record` 参数，首次创建状态时从 `record.materialMode` 初始化 mode，alpha 优先读 `record.opacity`，避免透明度操作将材质重置为 `'none'`。
- `dataSourceDisplay.js` — `setTilesetMaterialMode` / `setRecordOpacity`：传入 `record` 给 `getTilesetState`；实体访问优先使用 `record.tileset`（I3S 等复合 primitive）。

#### 前端 — 数据源透明度链路加固与诊断

- `stores/cesiumLayers.ts` — `setOpacity`：记录缺失 / adapter 未注册时显式 `console.warn`（原静默 return）。
- `components/CesiumContainer.vue` — adapter `setVisible` / `setOpacity`：句柄记录缺失 / Cesium 命名空间未就绪时显式 `console.warn`。
- `dataSourceDisplay.js` — `getTilesetState`：初始 alpha 优先读 `record.opacity`（有限数时），与统一图层元数据对齐。

#### 前端 — HomeView Cesium 感知路由

- `app/HomeView.vue`：`isMarkModeActive` 改为根据 `is3DMode` 自动切换 OL/Cesium 容器引用；`handleControlsMapInteraction` 中 `ReverseGeocodePick` 类型根据当前视图路由到 OL 或 Cesium；`handleControlsDistrictSelect` 根据 `is3DMode` 决定调用 OL 或 Cesium 的 `focusDistrictByAdcode`。
- `components/CesiumContainer.vue`：新增 `focusDistrictByAdcode`（根据 adcode 加载行政区边界到 Cesium 场景，数据源与 OL 端一致）+ `toggleReverseGeocodePick`（逆地理编码标注模式，单击地球自动逆地理编码并放置标注点）；`defineExpose` 暴露这两个方法。

#### 前端 — 开发体验优化

- `vite.config.js`：代码格式化（2-space → 4-space 缩进）；新增 `server.host: '0.0.0.0'`、`server.cors: true`、`/api` 代理到本地 Docker 后端（`http://127.0.0.1:7860`），支持局域网移动端调试。
- `.env.local`：`VITE_BACKEND_URL` / `VITE_TILE_PROXY_BASE_URL` 从绝对 URL 改为相对路径 `/api`（配合 vite 代理，后端无需再配置跨域）。
- `composables/layers/useCesiumLayers.js`：`activeTerrain` 默认值改为 `import.meta.env.DEV ? 'ellipsoid' : 'tianditu'`（本地开发不再默认加载天地图地形，提升开发启动速度）。

#### 前端 — 其他

- `frontend/public/images/`：删除 9 个首页图片文件（四楼逃生图/地学楼/地球日活动/地学与环境学院入口/地学与环境学院标志牌/学部大会/楼单侧/年级大会/教育部重点实验室），减小仓库打包体积。
- `frontend/src/app/HomeView.vue`：首页图片引用同步清理。

#### 杂项

- `.github/traffic.json`：流量统计自动更新（2026-08-05 数据）。

### V3.5.15 (2026-08-06 ~ 2026-08-07) — Code Review 整改 · 下载链路 · 配额提示 · 自定义 Ion · 默认模型 · 大目录容错

> 综合版本：基于暂存区全面 Code Review 的 P1/P2 整改（下载链路、Chat 配额、后端兜底），新增自定义 Cesium Ion 资源加载 UI（自动识别 imagery/terrain/3D Tiles）+ 高度偏移滑块，默认样例模型更换为河南大学摄影测量数据（Ion asset 5115505，原始材质），本地 4351 文件目录 File System Access API 容错，WMTS 大写占位符兼容。详见[日志](Docs/LLM_record/26-08/2026-08-07/2026-08-07-v3.5.15-consolidated.md)。

#### 前端 — 下载链路

- `locales/zh-CN.js` / `en-US.js`：补充缺失的 `mapDownload.quotaInsufficient` 配额不足文案。
- `data-import/stores/useDownloadStore.ts`：`applyTaskResponse` 回填 `basemap_name`；清理 `markDownloaded` / `downloadedAt` 死代码；`dispose()` 内清除 `estimateTileTimer` 防泄漏。
- `ol/components/MapDownloader.vue`：`browserManagedDownload` 改用 `triggerUrlDownload`（隐藏锚点），避免 watch 非用户手势上下文下 `window.open` 被 Chrome 弹窗拦截，保证浏览器托管下载在 Chrome 下载栏可见进度；bbox watch 去重双估算（仅保留 `estimatedTileCount` watch 触发配额估算）。

#### 前端 — Chat 配额提示

- `chat/components/ChatPanelContent.vue`：第二轮 LLM 调用 catch 区分 `isQuotaExceeded`（提示 + 刷新配额）与其他错误（静默降级为成功摘要），消除 429 被吞为 false success；`dispatchSend` 开头重置 `lastCallCost`，避免跨请求残留。
- `chat/composables/useChatAgentConfig.js`：引入 `useLocale`，默认 AI 模式额度耗尽提示由硬编码中文改为 `t('chat.quotaExhaustedHint')` i18n key。

#### 前端 — 杂项

- `map-view/useUserLocation.js`：定位失败 `message.error` 补 `!silent` 门禁，与成功 toast 对称。
- `user/components/AdminControlPanel.vue`：`handleSaveAgentTokensPerUnit` 加 `loadingAgentTokensPerUnit` 门禁，避免加载与保存竞争。
- `ol/routing/components/BusPlannerPanel.vue`：删除空 `if (!isNetworkError)` 死条件分支。

#### 后端

- `Dockerfile`：entrypoint 改用 `sudo /usr/sbin/cron` 启动 cron 守护进程，修复非 root `user` 下 `cron` 静默失败（sudoers 规则已存在但未使用）。
- `api/api_management.py`：`_ensure_api_log_table_sync` 兜底创建 `api_usage_daily` 表，避免该模块先于 auth 初始化时查询报错。
- `api/agent_chat/routes.py`：`_get_agent_tokens_per_unit` 在 system_config 无记录时回退到 `get_int("AGENT_TOKENS_PER_UNIT")`（env/catalog 默认），移除写死的 `DEFAULT_AGENT_TOKENS_PER_UNIT` 常量。

#### 前端 — 自定义 Cesium Ion 资源
- `CesiumToolPanel.vue`：新增自定义 Ion Asset ID 输入 UI（输入框 + 提交按钮 + 当前状态显示 + 高度偏移滑块 -500~+500m）。
- `useCesiumLayers.js`：`ensureCustomIonLayer()` 三阶段自动识别（3D Tiles → 地形 → 影像），默认值 `'5115505'`，叠加模式（不隐藏底图，影像 alpha=0.7）；`handleCustomIonAssetSubmit` 修复 overlay 已开启时切换 asset 不触发 reload 的 bug；`clearCustomIonLayer` 地形回退改为恢复 `activeTerrain` 对应 Provider。

#### 前端 — 默认样例模型
- `tilesetLoader.js`：`loadSampleTileset` 从本地 `public/tileset/city/tileset.json` 改为 `fromIonAssetId(5115505)`，默认材质 `'none'`（原始纹理）；补充 `rootJsonUrl` 传入 `fitTilesetToTerrain` 提升贴地精度。

#### 前端 — 本地大目录容错
- `tilesetLoader.js`：`readDirRecursive` 双层 try-catch（单文件失败跳过不中断）；`importTilesetFromDirectoryNative` 部分收集成功时继续加载；`NotFoundError` 不弹窗；精简诊断日志（4 条 → 1 条汇总）。

#### 前端 — WMTS 兼容
- `basemapProviderFactory.ts`：WMTS 大写占位符转换（`{TILEMATRIX}`→`{z}`、`{TILEROW}`→`{y}`、`{TILECOL}`→`{x}`）；`{s}` 默认子域名从字母 `['a','b','c']` 改为数字 `['0','1','2']`（适配天地图/OSM/高德等主流服务）。

#### 前端 — Code Review 整改
- `tilesetLoader.js`：移除诊断性 blob URL 拦截器（`installBlobUrlInterceptor` / `installBlobImageInterceptor` / `installBlobFetchInterceptor`）及全局 `window.fetch` 替换。
- `useCesiumDataImport.js`：移除已废弃的 `_restoreResourceFetches` 清理逻辑。
- `useCesiumLayers.js`：移除 `customIonHeightOffset` watch 中冗余的 `originMatrix` 双处设置。
- `README.md`：修复「作者与托管」标题行尾多余空格。

### V3.5.14 (2026-08-06) — 综合版本：Agent 配额体系 · 配额池统计 · 下载增强 · 保活运维 · 错误处理重构

> 本版本由若干次未标注版本的提交记录 soft reset 后合并整理而成，统一归入单一版本 V3.5.14。核心：Agent Chat 扣费时序修复（仅成功调用按 token 扣额，杜绝双重/失败扣费）；统一配额池超限封顶（不再整单回滚白送）；tokens_per_unit 管理员配置；前端额度展示对齐；配额池按用户统计；下载任务底图名称；HF Space 双向保活；console.error → message 错误处理重构 + 结构化 detail_code 透传。详见[综合日志](Docs/LLM_record/26-08/2026-08-06/2026-08-06-v3.5.14-consolidated.md)。

#### 后端

- `api/auth/dependencies.py`：抽出鉴权核心 `_authenticate_login_or_guest`，新增 `require_api_access_or_guest_noconsume`（认证但不消耗配额）；`__init__.py` 导出。
- `api/auth/quota.py`：超限策略由「整单回滚 + allowed=False」改为「封顶到每日限额」（`calls = daily_limit`，`used=limit / remaining=0`）：本次照常交付、下次请求被配额预检 429 拦截，杜绝「余额不足仍可继续请求」白送。
- `api/agent_chat/routes.py`：`/chat/completions`、`/chat/default-proxy`、`/chat/proxy` 三功能端点改 noconsume 依赖，保留只读配额预检 + 上游**真正成功后**按 token 折算 `agent_cost` 扣费（`max(1, ceil(total_tokens/tokens_per_unit))`），个人 Key 直连不消耗平台配额；四个只读状态端点（config/user-config/models/update_pref）改 noconsume，消除 require_login 的游客回归；扣费补传 `quota_subject`（修复游客扣费主体错位）；`_get_agent_tokens_per_unit` 异步读 system_config。
- `api/admin.py`：新增 `GET/POST /api/admin/config/agent-tokens-per-unit` 端点 + `UpdateAgentTokensPerUnitRequest`（ge=100, le=100000）。
- `api/api_management.py`：新增 `GET /api-management/usage/quota-by-user` 端点 + `_get_quota_usage_by_user_sync`（总消耗/今日消耗/活跃天数/最后使用）。
- `download_xyz/download.py`：补回 `clip_geotiff_to_bbox` import（消除 NameError 静默失败）；新增 `_format_file_size` 可读文件大小。
- `download_xyz/download_task.py`：`DownloadTask` 新增 `basemap_name` 列（TEXT，迁移自动补齐）。
- `api/keepalive.py`：**新增** 双向保活模块——接收端 `POST/GET /api/heartbeat` + `GET /api/keepalive/ping`；asyncio 发送端随机 180~360s 模拟真实用户请求对端，随机 UA 池。
- `app.py`：全局异常处理器 dict-detail 分支保留业务 `code` → 输出独立 `detail_code` 字段，修复前端 401/403/429 特判失效。
- `Dockerfile`：uvicorn 增加 `--no-access-log`。
- `config/catalog.py` / `.env.example`：登记 `AGENT_TOKENS_PER_UNIT`（默认 1000，L2，非密钥）。

#### 前端

- `api/backend/client.js`：错误提取兜底 `data.detail_code` / `data.message`；`parseBlobError` 补 `json?.detail_code`；错误 toast 格式「状态码 + 结构化 message」。
- `api/backend/admin.js`：`apiAdminGet/UpdateAgentTokensPerUnit`、`apiAdminQuotaUsageByUser`。
- `chat/useChatAgentConfig.js`：默认 AI 分支加载用户配额/读取响应 `cost`；`quotaExhausted` 仅个人 Key 直连返回 false。
- `chat/ChatServiceStatus.vue`：默认 AI 模式展示本次消耗/今日额度；`quotaExhausted` 红色警示 + 一次性 warning toast。
- `chat/ChatPanelContent.vue`：`sendDisabled`/`dispatchSend` 覆盖默认 AI 模式；`lastCallCost` 按后端各轮 `cost` 汇总；切回 chat tab 5s 节流刷新配额。
- `user/AdminControlPanel.vue`：新增「Agent 配额折算」配置 UI。
- `user/ApiManagementPanel.vue`：「用户统计」改读 `apiAdminQuotaUsageByUser`（总消耗/今日消耗/活跃天数/最后使用）。
- `ol/MapDownloader.vue`：自定义底图名称 + 瓦片估算 + 进度显示；`ol/MyDownloadTasks.vue`：底图名称徽标。
- `search/LocationSearch.vue`：搜索配额条接入 i18n。
- **console.error → message 重构（65 处）**：无用户提示路径补 `message.error/warning` toast（useStartupViewResolver、auth.js、MagicCursor、LogMonitor、TOCTreeItem、basemapProviderFactory、kmlStyleParser、shpParser、useLayerDataImport、useShallowWater、useCesiumModelManager、useUserLocation 等）；A/B 类与 vendored/GPU 代码仅注释。
- **ESLint 清理（17 处归零）**：未使用 catch 参数 `^_` 重命名；`useSharedResourceLoader.ts` 删死变量 `message` 并移除无意义 try/catch；`playerController.ts` 移除裸重抛。
- `locales/zh-CN.js` / `en-US.js`：`agentTokensPerUnit*`、`chat.lastCostLabel/noCostYet`、`search.lastSearch/remaining` 等 key。

#### 文档与门禁

- `Docs/Architecture/keepalive-hf-space.md`：**新增** 双向保活架构（Mermaid）。
- `CheckConfigRegistry.py`：后端扫描排除目录新增 `tests`（单元测试直接操作 `os.environ` 属测试写法而非业务裸读）。

---

### V3.5.13 (2026-08-05) — 下载系统综合改动（异步化 + 配额 + 账号绑定 + TTL 动态配置）

> 🏗️ **架构级改动**：下载系统全面升级——移除 download_token（改用会话认证 Blob 下载）；统一 API 配额池（下载消耗=ceil(tile_count/tiles_per_unit)，预扣+多退少补）；任务绑定账号体系（"我的任务"列表）；TTL 从 L1 env 升级为 L2 数据库配置（管理员面板动态可调，基于 updated_at 续命）；前端新增 MyDownloadTasks 组件与过期提示；axios 拦截器增加 blob 错误解析。

#### 后端：下载令牌移除

- `backend/download_xyz/download.py`：删除令牌生成/验证/缓存全部逻辑（`_generate_download_token`、`_validate_download_token`、`_create_download_token_for_task`、`_download_tokens`）；`download_task_file` 端点移除 `token` 参数；`DownloadTaskStatusResponse` 移除 `download_token` 字段

#### 后端：统一 API 配额池

- `backend/api/auth/quota.py`：重构 `_consume_api_quota_sync` 支持 `cost` 参数和 `action` 标识；新增 `estimate_download_cost(tile_count)` 函数；新增 `_refund_api_quota_sync()` 退还配额
- `backend/download_xyz/download.py`：`create_download_task` 提交前校验配额并预扣估算额度；`_process_download_task` 成功时按实际瓦片数多退少补；失败/取消时全额退还
- `backend/api/auth/constants.py`：`get_role_daily_quota` 从 L2 system_config 读取配额，fallback 到硬编码常量

#### 后端：TTL 动态配置 + 账号绑定

- `backend/download_xyz/download.py`：新增 `_get_task_ttl_minutes()`（L2 → L1 → 30 三级 fallback）；`_get_expiration()` 基于 `updated_at` 续命；新增 `GET /api/download/tasks` 列表接口
- `backend/download_xyz/download_task.py`：`DownloadTask` 模型新增 `username`/`tile_count`/`tiles_downloaded`/`estimated_seconds` 字段；新增 `list_active_tasks_by_user()`；新增 SQLite 迁移逻辑（幂等安全）
- `backend/download_xyz/task_scheduler.py`：清理逻辑修正（仅清理终态任务，动态读取 TTL）
- `backend/api/admin.py`：新增 `GET/POST /api/admin/config/download-ttl` 和 `GET/POST /api/admin/config/api-quota` 端点

#### 后端：时间估算

- `backend/download_xyz/download.py`：新增 `_estimate_tile_count()` 和 `_estimate_duration()`；`DownloadTaskStatusResponse` 新增 `tile_count`/`tiles_downloaded`/`estimated_total_seconds`/`estimated_remaining_seconds` 字段；新增 `GET /api/download/estimate-tiles` 端点

#### 前端：下载任务 UI

- `frontend/src/api/download.js`：新增 `apiDownloadListMyTasks()` 和 `apiEstimateTileCount()` 函数
- `frontend/src/domains/common/data-import/stores/useDownloadStore.ts`：新增 `myTasks`/`loadingMyTasks` + `fetchMyTasks()`/`refreshTaskStatus()`；新增 `estimatedTileCount` + `updateEstimatedTileCount()`；删除 `downloadToken`
- `frontend/src/domains/ol/components/MyDownloadTasks.vue`：**新增**独立「我的任务」组件（任务列表 + 进度条 + 过期提示 + 复制/查看/下载/取消操作）
- `frontend/src/domains/ol/components/MapDownloader.vue`：重构下载流程（认证 Blob 下载替代 token URL）；新增「我的任务」面板集成；配额实时刷新；blob 错误解析

#### 前端：权限与错误处理

- `frontend/src/api/backend/client.js`：拦截器增加 blob 响应状态码检查；新增 `parseBlobError()` 函数（解析 Blob 中的 JSON 错误）；429 错误增加 `detailCode` 区分（`DOWNLOAD_QUOTA_INSUFFICIENT`）

#### 前端：管理员面板

- `frontend/src/domains/common/user/components/AdminControlPanel.vue`：新增 TTL 配置输入框 + 保存功能
- `frontend/src/domains/common/user/components/ApiManagementPanel.vue`：配额 tab 从只读升级为可编辑（统一 API 额度池）

#### 前端：公共工具

- `frontend/src/domains/common/utils/clipboard.ts`：**新增** `copyToClipboard` 工具函数

#### i18n + 结构树 + Code Review

- 中英文新增 `mapDownload.*`（myTasks / refreshList / noTasks / expiresIn / remainingApprox 等）；新增 `admin.*`（downloadTtlLabel / downloadTtlSaveSuccess 等）
- `Docs/Guide/frontend-structure.md`：补录 compass themes/images 下 4 个 PNG 预览图
- `CheckStructureTree.py`：修复 cesium-navigation/svgPaths 目录的虚假幽灵告警
- 全项目 Code Review：配置读取合规（无裸 os.getenv / 散落 import.meta.env）、无硬编码密钥、无 console.log 残留

### V3.5.12 (2026-08-04) — 代理瓦片缓存 + 日志重构 + 下载取消 + 缩放修正 + Star History

> 🏗️ **综合改动**：本次版本合并 5 项独立改动——后端纠偏瓦片新增内存 TTL 缓存；日志系统重构为序号化 + 本地时区；下载任务支持前端取消；地图缩放级别显示与高清渲染开关同步；GitHub 工作流替换为 Star History 图表。

#### 后端：代理瓦片内存 TTL 缓存

- `backend/api/proxy.py`：新增 `_TileCacheEntry` dataclass + `_TileCache` 类（TTL 过期惰性淘汰 + 满员批量清理 + 命中率统计）。**仅纠偏端点（`/proxy/gcj2wgs/`、`/proxy/wgs2gcj/`）集成内存缓存**——命中时跳过纠偏计算（省 CPU）；ships66 / 通用代理保持纯中转（设计决策：ships66 访问概率极低；`/proxy/{url}` 用途杂，缓存非瓦片响应风险大于收益）
- `backend/config/catalog.py`：新增 `PROXY_TILE_CACHE_TTL_SECONDS`（默认 300s）、`PROXY_TILE_CACHE_MAX_SIZE`（默认 100000）
- `.env.example` / `.env` / `.env.local`：同步登记（生产环境用户配置为 600s/200000 条）

#### 后端：日志系统重构（序号化 + 本地时区）

- `backend/app.py`：删除 `BeijingTimeFormatter`，新增 `_SeqFormatter`（线程安全的全局递增序号 `[000001]` 前缀，方便 Docker 日志排序追踪）；uvicorn logger 同步补丁；shutdown 阶段每个资源独立 try/except 异常隔离
- `backend/utils/time_utils.py`：`BeijingTimeFormatter` / `get_beijing_now` / `get_beijing_now_str` 全部移除，替换为 `get_local_now()` / `get_local_now_str()`（Docker 容器本地时区 `Asia/Shanghai`）；`hourly_chime_task` 新增 `startup_time` 参数，报时日志展示已运行时长
- `backend/api/monitor.py`：HF 日志代理新增 `_convert_utc_to_local()` 将 UTC 时间戳转为本地时间；移除 `BeijingTimeFormatter` 改用标准 `logging.Formatter`

#### 后端：下载任务可取消

- `backend/download_xyz/download.py`：新增 `POST /api/download/tasks/{id}/cancel` 端点；`_process_download_task` 执行前检查取消状态；`report_progress` 每次回写前检查取消状态并抛 `CancelledError`；捕获后清理半成品文件
- `backend/download_xyz/tile_engine.py`：`build_geotiff_from_tiles` 捕获 `CancelledError` 后先取消所有未完成的子任务，等待全部结束再向上传播
- `backend/download_xyz/task_scheduler.py`：`cleanup_expired_tasks` 新增轻量预判（`SELECT ... LIMIT 1`），无过期任务时跳过全量查询
- `frontend/src/api/download.js`：新增 `apiDownloadCancelTask(taskId)` 函数
- `frontend/src/domains/common/data-import/stores/useDownloadStore.ts`：`dispose()` / `resetTask()` 时调用取消端点通知后端中止

#### 前端：缩放级别显示修正

- `frontend/src/domains/ol/components/MapControlsBar.vue`：新增 `displayZoom` 计算属性，统一使用 `Math.ceil(zoom)` 显示，与实际加载的高清瓦片级别一致
- `frontend/src/domains/ol/composables/useMapEventHandlers.js`：`change:resolution` 回调跟随 `tileHDRendering` 开关——开启时 `Math.ceil`（高清上层），关闭时 `Math.floor`（默认下层）
- `frontend/src/domains/ol/components/MapContainer.vue`：总览图源包裹 `buildRasterBasemapSource()`，与底图配置 SSOT 对齐

#### 前端：LogMonitor SSE JSON 解析

- `frontend/src/domains/ol/components/LogMonitor.vue`：`onmessage` 新增 JSON 解析分支（后端 SSE data 为 `{"data":"...","timestamp":"..."}` 格式），提取 `data` 字段显示；非 JSON 行保持原样

#### 其他

- `.github/workflows/traffic-counter.yml`：移除原流量统计工作流（151 行），替换为 Star History 图表生成（`seladb/star-history-action`），每日 UTC 0 点自动生成明暗双图
- `frontend/index.html`：GitHub 链接修正为 `https://github.com/NEGIAO`
- `frontend/stats.html`：清理构建产物中的注释分隔符
- `README.md`：新增 Star History 图表章节 + 版本演进表更新

### V3.5.11 (2026-08-04) — Code Review 修复批次 + amap runtime token + 配额可编辑 + 视图切换白屏修复

> 🏗️ **架构 + 修复**：前端分层架构合规化——common→ol 跨层违规从 19 处降至 9 处；后端清理 `agent_token` 兼容名；`amap_key` 加入前端 runtime token 白名单；管理员面板配额从只读升级为可编辑器；修复 2D/3D 切换时 `_cesiumLoadPromise` 未清空导致的白屏。

#### 后端：agent_token 兼容名清理

- `backend/api/agent_chat/constants.py`：删除 `AGENT_API_KEY_LEGACY = "agent_token"`
- `backend/api/agent_chat/db.py`：删除 legacy 分支（`_get_api_key_row_sync(AGENT_API_KEY_LEGACY)` + candidates 回退逻辑）
- `backend/config/catalog.py`：删除 `AGENT_TOKEN` 登记项
- `backend/config/load.py`：`agent_api_key = get_str("AGENT_API_KEY", "")`（移除 `or get_str("AGENT_TOKEN", "")`）
- `backend/config/public.py`：`agent_env_key` 仅读 `agent_api_key`（移除 `agent_token` 回退）
- `.env.example`：删除 `# AGENT_TOKEN=` 行 + 注释更新为仅保留 `AGENT_API_KEY`

#### 后端：amap_key 加入 runtime token 白名单

- `backend/api/api_keys_management.py`：`FRONTEND_RUNTIME_KEYS` 新增 `amap_key`；`get_runtime_map_tokens` 响应添加 `amap_key` 字段与 `is_set.amap_key`；注释更新为 "Tianditu, Cesium, and Amap"

#### 后端：配额管理 API 配接

- `backend/api/agent_chat/routes.py`：`admin_get_agent_config` 返回 `chat_quota` 字段（`_get_agent_chat_quota_policy_sync`）；`admin_update_agent_config` 支持 `guest_daily_quota` / `registered_daily_quota`
- `backend/api/agent_chat/schemas.py`：`AgentConfigUpdateRequest` 新增 `guest_daily_quota` / `registered_daily_quota`（optional int, ge=1, le=100000）
- `backend/api/agent_chat/db.py`：`_set_agent_provider_config_sync` 处理 `guest_daily_quota` / `registered_daily_quota` → 写入 `system_config` 表

#### 前端：runtimeMapTokens 增强（amap 主备轮换）

- `frontend/src/domains/common/services/runtimeMapTokens.js`：新增 `amapKey/amapKeys` 空值；`normalizeRuntimeKeyName` 支持 `amap_key/amap/gaode` 映射；`normalizeRuntimeTokenPayload` 处理 `pools.amap_key`；`getRuntimeMapTokensSync('amap_key')` 返回主 key

#### 前端：ApiManagementPanel 配额面板可编辑化

- `frontend/src/domains/common/user/components/ApiManagementPanel.vue`：
  - 配额 tab 从只读升级为可编辑状态机（view → edit → save/cancel）
  - `loadQuotaConfig` 改调 `apiAdminGetAgentConfig()` → 读取 `chat_quota.guest/registered`
  - 新增 `saveQuotaConfig` → `apiAdminUpdateAgentConfig({ guest_daily_quota, registered_daily_quota })`
  - 输入校验：`Number.isFinite + ≥ 1`；前后端双重 clamp（1–100000）
  - 游客/注册用户双卡片展示 + 编辑/保存/取消按钮 + 说明文案更新

#### 前端：ApiKeysManagementPanel 清理 agent_token

- `frontend/src/domains/common/user/components/ApiKeysManagementPanel.vue`：
  - `agent_api_key` 状态读取移除 `data.agent_token` 回退
  - `frontendRuntimeKeyNames` 新增 `amap_key`（纳入前端 runtime 同步管理）

#### 前端：HomeView 视图切换白屏修复

- `frontend/src/app/HomeView.vue`：`setMapView` 切回 OL 时新增 `_cesiumLoadPromise = null`，防止下次切 3D 命中过期 promise 导致白屏

#### 分层架构修复（H7 跨层违规 19→9）

- 纯基础设施迁入 common 域：
  - `runtimeMapTokens.js`：`ol/services` → `common/services`（仅依赖 `@/api/backend`）；更新 9 个导入方
  - `viewScaleConverter.js`：`ol/utils` → `common/utils`（纯数学零依赖）；更新 2 个导入方
  - `basemapPresets.ts`：`ol/basemap/constants` → `common/basemap`（纯数据）；更新 4 个引用方
- 新增 `common/basemap/basemapOptions.ts`：抽离 `DEFAULT_BASEMAP_LAYER_INDEX` / `BASEMAP_OPTIONS`（re-export `URL_LAYER_OPTIONS`），basemapResolver 改从 common 导入并 re-export；`AdminControlPanel` 改 import common
- `useTOCStore` 去 OL 依赖：新增 `common/layer-tree/stores/layerRemovalHandler.ts`（回调注册表），`removeLayerMeta` 改调用 `notifyLayerRemoved(id)`；`useFeatureStyleStore`（ol 域）注册回调联动清理高亮
- `TOCTreeItem` 改直接 import `@common/utils/labelValidator`（该函数本就在 common）

#### 功能修复

- **H8 缩放开关**：`playerController.ts` `setEnableZoom(e)` 改为 `screenSpaceCameraController.enableZoom = e`（此前硬编码 `false`，传 `true` 也无法启用缩放）
- **GBK DBF 数据丢失**：`dbfParser.ts` `supportedEncodings` 增补 `GBK / GB2312 / CP936`，走原生 TextDecoder 解码（此前 GBK 走 fallback 分支全部替换为 `■` 方块符）
- **blob URL 内存泄漏**：`tileLifecycle.ts` 在 `img.src = url` 前绑定 `load`/`error` 一次性监听器，成功/失败均 `revokeObjectURL`
- **日志合规修补**：`2026-08-04-code-review-fix-batch.md` 补 `### 解决方案` 独立章节标题 + Mermaid sequenceDiagram（handler 注册/通知链路）+ 变更清单追加 `Docs/TODO/bugfix-optimization-plan.md`

#### 文档更正

- `2026-08-01-code-review-high-security-fixes.md` 顶部加更正横幅：登录限流与 `/api/info` 门控为同日 `config-fix-and-cr-final.md`（V3.5.5）用户刻意回滚，当前零限流即最终意图

#### 影响范围

- 底图选择 / URL 参数 / 管理面板（basemap 常量迁移，行为不变）
- TOC 图层移除 → 要素高亮联动（handler 注入，行为等价）
- DBF 数据导入（GBK 编码中文正确显示）
- Cesium 玩家滚轮缩放开关
- 瓦片加载生命周期（内存释放）
- 高德 amap_key runtime 同步（新增前端直连能力）
- 配额管理（管理员面板可实时修改，立即生效）
- 2D/3D 切换稳定性（白屏修复）

#### 延后项（L3 / 存疑，未施工）

- H7 剩余 9 处跨层违规（TOCPanel 7 + SidePanel 2）——随 God 组件拆解 L3
- `cesium.d.ts` 83 个 any（无官方类型，手写属臆造 API 风险；正确路径为迁移 npm cesium 包）
- `tsconfig strict:false`（开启暴露大量隐式 any，L3 重构）
- 罗盘旋转 90° / GPU 资源泄漏（静态读码无法确认，存疑待实机复现）

---

### V3.5.10 (2026-08-03) — 默认底图跳过容灾监控

> 🐛 **体验修复**：首屏加载时自定义瓦片（仅覆盖中国区域）大量非中国区域瓦片 404，触发 `[底图监测]`/`[底图降级]` message 轰炸。修复方案：默认预设图层完全跳过容灾监控和切换验证。

#### 问题根因

- `useBasemapLayerBootstrap.js` 中 `isDefaultBaseLayer = item.id === defaultLayerId`，但 `item.id` 是具体图层 ID（如 `custom_China_Blender`），`defaultLayerId` 是预设 ID（如 `custom_China_Blender_preset_2`），两者永不匹配 → 默认底图被当作"非默认"监控
- 自定义瓦片仅覆盖中国 → 非中国区域瓦片必然 404 → 连续错误触发降级/message 循环

#### 修改内容

- `frontend/src/domains/ol/basemap/composables/useBasemapLayerBootstrap.js`：
  - 引入 `resolvePresetLayerIds` 解析默认预设包含的具体图层 ID 集合
  - 属于默认预设的图层不调用 `monitorLayerTimeout`，完全跳过容灾监控

- `frontend/src/domains/ol/basemap/composables/useBasemapSelectionWatcher.js`：
  - 工厂内部通过 `getActualDefaultLayerId()` 读取管理员 L2 配置的默认预设 ID
  - `runLayerSwitch` 中通过 `val === getActualDefaultLayerId()` 判断是否为默认预设，跳过 `validateBaseLayerSwitch` 验证，直接静默切换成功

#### 影响范围

- 默认底图（管理员配置）：不再监控、不再验证、不再报错
- 非默认底图：行为不变，容灾机制完整保留

---

### V3.5.9 (2026-08-02) — 底图配置架构重构：单一真相源 + Cesium 自动派生

> 🏗️ **架构重构**：删除 `sourceDescriptors.ts`（887 行），Cesium 描述符由 `basemapConfig.ts` 的 `getDescriptorById()` / `getAllDescriptorIds()` 自动派生；`basemapPresets.ts` 新增 `ALL_BASEMAP_PRESETS`（label 加序号前缀，与 URL 参数 `l` 索引对齐）；废弃 Google 主机切换机制（`GOOGLE_MANUAL_HOST`/`activeGoogleTileHost`/`buildGoogleTileUrl`）彻底删除；`index.ts`/`basemapProviderFactory.ts`/`layerUtils.js` 的 import 路径统一指向 `basemapConfig`。

#### 架构变更

- `frontend/src/domains/ol/basemap/constants/basemapConfig.ts`：
  - 类型 `LayerSourceDefinition` 新增 `url`、`serviceType`、`maxZoom`、`tilePixelRatio`、`subdomains`、`needsContext`、`wms`、`wmts` 字段（Cesium 派生所需）
  - 新增 `TileSourceDescriptor` 类型 + `getDescriptorById()` + `getAllDescriptorIds()` 函数（从 `LAYER_SOURCE_DEFINITIONS` 自动派生）
  - 删除 `GOOGLE_MANUAL_HOST`、`activeGoogleTileHost`、`buildGoogleTileUrl`（废弃机制）
  - `imagery_gac` URL 改为硬编码 `https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}`
  - 90 个图层定义补充 `url` + `serviceType` 字段

- `frontend/src/domains/ol/basemap/constants/sourceDescriptors.ts`：**已删除**（功能由 `basemapConfig.ts` 自动派生替代）

- `frontend/src/domains/ol/basemap/constants/basemapPresets.ts`：
  - 新增 `ALL_BASEMAP_PRESETS`（`BASEMAP_PRESETS` 每条 label 加序号前缀 `"${index} ${label}"`，与 URL 参数 `l` 索引对齐）
  - `URL_LAYER_OPTIONS` 改为基于 `ALL_BASEMAP_PRESETS`

- `frontend/src/domains/ol/basemap/constants/basemapResolver.ts`：
  - 改用 `ALL_BASEMAP_PRESETS` 替代 `BASEMAP_PRESETS`
  - `LAYER_SOURCE_DEFINITIONS` 改为从 `basemapConfig` 导入

- `frontend/src/domains/ol/basemap/constants/index.ts`：
  - 删除 `GOOGLE_MANUAL_HOST`/`activeGoogleTileHost`/`buildGoogleTileUrl` 导出
  - `TileSourceDescriptor`/`getDescriptorById`/`getAllDescriptorIds` 改为从 `basemapConfig` 导出

- `frontend/src/domains/cesium/constants/basemapProviderFactory.ts`：import 路径从 `sourceDescriptors` 改为 `basemapConfig`
- `frontend/src/domains/cesium/composables/layers/layerUtils.js`：import 路径从 `sourceDescriptors` 改为 `basemapConfig`

#### 影响范围

- 底图配置：单一真相源，增删改只需维护 `basemapConfig.ts`
- Cesium 引擎：`getDescriptorById()` 行为不变（仍返回完整描述符），但数据源从手动维护改为自动派生
- UI 预设下拉：label 加序号前缀（`"0 本地瓦片"`），与 URL `l` 参数索引对齐

#### 兼容性

- `BASEMAP_PRESETS` 仍从 `basemapConfig` re-export（向后兼容），但推荐使用 `ALL_BASEMAP_PRESETS`
- `getDescriptorById` 接口签名不变，外部调用方零改动

### V3.5.8 (2026-08-02) — 暂存区 Review 修复：require() 崩溃 + 容器版本号 + 分层边界

> 🔧 **Bug 修复**：`client.js` 的 `require()` 在纯 ESM 浏览器环境必炸（ReferenceError，错误提示崩溃且吞原始错误），改回静态 import `useMessage`；`_read_app_version()` 在 Docker 容器内读不到根 README（subtree 推送）→ deploy.yml push 前 `cp README.md backend/README.md`（版本号仍 100% 来自根 README，无新配置 key）；删除与 `setStyleTarget` 完全重复的新 action；`browserDownload.ts` 移至 common 域消除 common→ol 反向依赖；新增 `vue-shims.d.ts` 修复 .ts import .vue 的 TS2307。

#### Bug 修复

- `frontend/src/api/backend/client.js`：移除 `require('@common/shell/useMessage')`（纯 ESM 环境 `require` 未定义），改回静态 `import { useMessage }` + 顶层解构（`useMessage.js` 为纯模块级实现，不依赖 `inject`，原顶层调用本就安全）
- `.github/workflows/deploy.yml`：push backend 前 `cp README.md backend/README.md`，让容器内自带根 README（`_read_app_version()` 原代码零改动，版本号仍 100% 来自根 README，无新配置 key）

#### 分层边界 / 去重

- `frontend/src/domains/ol/stores/useLayerStore.ts`：删除与 `setStyleTarget` 实现完全重复的 `setSelectedEditLayerId`；`TOCPanel.vue` 改回调用既有 `setStyleTarget`
- `frontend/src/domains/ol/utils/browserDownload.ts` → `frontend/src/domains/common/utils/browserDownload.ts`：消除 common 域 store 对 ol 域 utils 的反向依赖（common→common 平级）；`useDownloadStore.ts` / `MapDownloader.vue` 同步更新 import

#### 类型

- `frontend/src/vue-shims.d.ts`（新建）：`.vue` 模块声明，修复 `useLazyModules.ts` 等 .ts 文件动态 import .vue 的 TS2307（此前项目 .ts 从不直接引 .vue，本次首现）

#### 其他

- `MapContainer.vue`：`useLayerStore()` 声明移至其他 store 声明处（消除模板先于声明使用的隐患风格）
- `AdministrativeDivisionPanel.vue`：移除 `ASSET_BASE_URL || '/'` 冗余兜底
- `Docs/Guide/frontend-structure.md`：同步 browserDownload 迁移 + vue-shims.d.ts 新增

### V3.5.7 (2026-08-02) — Code Review 修复：SSOT + 分层边界 + 后端安全

> 🔧 **SSOT + 分层 + 安全**：文档治理（子 README 版本号去同步）；API 层 `useMessage()` 移除；后端静默 except 添加可观测性；Pydantic 输入校验；publicRuntime.ts ASSET_BASE_URL 收口。

#### SSOT 文档治理

- `frontend/README.md`：删除标题版本号 V3.4.67、删除重复分层边界表（改为链接到 dev-conventions.md）、删除尾部版本记录块
- `backend/README.md`：删除版本号记录行（V3.4.67 → 链接到根 CHANGELOG）
- `frontend/src/domains/common/compass/svg/types/README.md` → 迁移至 `Docs/Guide/compass-types-note.md`

#### 分层边界：API 层 useMessage() 移除

- `frontend/src/api/geocoding.js` / `ipLocation.js` / `locationSearch.js` / `weather.js`：移除 `useMessage()` import 和调用，改为 `console.warn()`（错误由调用方处理）
- `frontend/src/api/backend/client.js`：将模块顶层 `useMessage()` 改为延迟加载（首次错误时调用，避免 Vue 未挂载时 inject 失败）
- `frontend/src/api/backend/location.js`：移除 `useMessage()` import，`apiLocationTrackVisit` catch 块改为 `console.warn()`

#### 配置入口收口

- `frontend/src/config/publicRuntime.ts`：新增 `ASSET_BASE_URL` 常量（派生自 `import.meta.env.BASE_URL`，去除尾部斜杠）
- 7 个业务文件（RegisterView / setupCloudIntegration / AdministrativeDivisionPanel / TopBar / useSharedResourceLoader / FloatingAccountPanel / PreferencesTab）改为从 `publicRuntime` 导入 `ASSET_BASE_URL`

#### 后端安全：可观测性 + 输入校验

- `backend/api/monitor.py`：热路径（`_fanout_line` / `_LogBroadcastHandler.emit`）添加注释说明防递归；非热路径（`_ensure_broadcast_handler` handler 附加）添加 `logger.debug(exc_info=True)`
- `backend/api/location.py`：`ReverseGeocodeRequest` 添加 `ge=-180, le=180`（lng）和 `ge=-90, le=90`（lat）；`_resolve_amap_key` 和 `require_api_access_optional` 的静默 except 添加 `logger.debug`
- `backend/api/agent_chat/routes.py`：`override_base_url` 添加 `Query(max_length=500)`，`override_api_key` 添加 `Query(max_length=200)`

#### 其他

- `backend/app.py`：新增 `_read_app_version()` 从根 README 提取版本号注入 FastAPI（与前端 `__APP_VERSION__` 同源）
- `Docs/Architecture/account-system-ai-quota.md`：新增 §12「部署约束（多域名认证配置）」
- `Docs/LLM_record/26-07/26-07-25/2026-07-25-cesium-modules-migration.md`：补充缺失章节（问题分析 / 解决方案 / 性能指标 / 遗留与风险）

### V3.5.6 (2026-08-01) — Code Review 修复收尾与配置修正

> 🔧 **修正 + 收尾**：修正 Code Review 中不符合用户需求的改动（异常详情、/api/info、登录限速）；修复容器配置路径不匹配；修复游客密码不一致；清理残留 `as any` 和硬编码。

#### 修正项（回退 Code Review 中不合理的改动）

- `backend/app.py`：恢复异常详情始终返回（用户需要看到错误原因，不区分环境）
- `backend/app.py`：恢复 `/api/info` 开放访问（开源项目故意暴露 API 结构）
- `backend/api/auth/routes.py`：移除登录速率限制（用户明确要求无限次尝试）
- `backend/api/auth/verification.py`：移除 `check_login_rate_limit()` 和 `record_login_attempt()` 函数

#### Bug 修复

- `backend/docker-compose.yml`：`.env` 挂载路径从 `/app/.env` 改为 `/.env`，对齐容器内 `PROJECT_ROOT=/` 的路径解析（之前容器内读不到任何配置项）
- `frontend/src/app/RegisterView.vue`：游客密码从环境变量 `VITE_GUEST_PASSWORD` 读取，与后端 `.env` 保持一致（之前前端硬编码 `123`，后端改为 `123456`，导致 401）
- `.env` / `.env.local` / `.env.example`：新增 `VITE_GUEST_PASSWORD=123456`

#### 类型安全收尾

- `frontend/.../playerController.ts`：移除未使用参数 `e: any`，改为 `() =>`
- `frontend/.../PhysicsSystem.ts`：`undefined as any` → `null`，类型改为 `RAPIER.World | null` 等
- `frontend/.../AnimationSystem.ts`：`as any` → `as unknown as { animationRemoved: ... }` 显式事件接口

### V3.5.5 (2026-08-01) — 架构文档体系建设

> 📐 **架构可视化**：新增 3 篇系统级架构文档 + README 首页嵌入 Mermaid 分层架构图与域名映射表。

#### 新增文档

- 📐 [系统架构总览](Architecture/system-architecture.md)：五层分层架构图（源码 → CI/CD → 部署平台 → 运行时 → 用户），五层职责说明，域名全景，数据流总结
- 📐 [CI/CD 流水线](Architecture/cicd-pipeline.md)：五 Job 详解（Build → deploy-to-self → sync-to-main-repo → deploy-frontend-to-hf → sync-to-huggingface），部署时序图，Secrets 清单
- 📐 [部署关系与域名映射](Architecture/deployment-relationship.md)：域名清单（前端 7 + 后端 1 + 存储 1），部署来源矩阵，前后端通信链路，平台能力对比，中国大陆访问策略

#### README 更新

- 新增「🏗️ 系统架构」章节，嵌入 Mermaid 分层架构图
- 新增域名映射表（前端入口 + 后端 API + 瓦片存储）
- 架构文档导航拆分为「系统级架构」与「功能架构」两组
- 版本号 V3.5.4 → V3.5.5

### V3.5.4 (2026-08-01) — 全量 Code Review 修复：CRITICAL + HIGH + MEDIUM + LOW 共 166 项问题

> 🛡️ **安全 + 稳定性 + 可维护性**：2026-08-01 全项目 Code Review 后分 8 个 Batch 修复 166 项问题（12 CRITICAL + 25 HIGH + 50 MEDIUM + 79 LOW），覆盖认证系统、代理系统、Markdown 渲染、SHP 解析、流体模拟、API Key 管理、前端内存泄漏、类型安全、组件拆分等。

#### Batch 1：安全加固（CRITICAL + HIGH 安全类）

- 🔒 **代理 SSRF**：`host_matches_allowlist()` 空白名单改为拒绝所有（此前误返回允许所有）
- 🔒 **异常处理**：全局异常处理器生产环境不再泄露 `error_type`/`detail`
- 🔒 **认证 Token**：移除 query string 传递方式，仅接受 Header
- 🔒 **访客密码**：硬编码改为环境变量读取（`GUEST_PASSWORD`），catalog 登记
- 🔒 **Markdown XSS**：移除 DOMPurify `onclick` 白名单，DOMPurify 失败时 fallback 到 escapeHtml
- 🔒 **原型链污染**：SHP 解析器过滤 `__proto__`/`constructor` 字段名
- 🔒 **GPU 纹理**：fluidRuntime.destroy() 修复 outputTexture 泄漏
- 🔒 **API Key**：高德 Key 移出硬编码，改为动态获取
- 🔒 **Token 存储**：localStorage → sessionStorage
- 🔒 **明文传输**：HTTP 环境发送凭证时输出安全警告
- 🔒 **SSRF via redirect 防护**：`agent_chat/upstream.py` 和 `external_proxy.py` 的 httpx 客户端改为 `follow_redirects=False`
- 🔒 **API 信息泄露修复**：`app.py` 的 `/api/info` 端点添加环境检查，仅 `APP_ENV=development` 时可用
- 🔒 **日志级别控制**：`monitor.py` 的日志级别由 `get_settings().log_level` 控制，不再硬编码 DEBUG
- 🔒 **登录速率限制**：新增 `login_attempts` 表 + `check_login_rate_limit()`/`record_login_attempt()`，同一 IP 5 分钟内最多 10 次登录尝试

详见[日志](LLM_record/26-08/2026-08-01/2026-08-01-code-review-critical-fixes.md)

#### Batch 2：前端内存泄漏与定时器

- 🧹 **HomeView watchdogTimer 泄漏**：添加模块级 `activeWatchdogTimer` 变量，`onUnmounted` 时清理
- 🧹 **MapControlsBar 事件监听修正**：将清理逻辑从 `onMounted` 返回值移到 `onUnmounted` 钩子
- 🧹 **ChatMessageList copiedTimer 泄漏**：`onUnmounted` 清除复制提示定时器
- 🧹 **useSingularity SVG 泄漏**：`destroy()` 中移除注入的 SVG 滤镜 DOM 元素
- 🧹 **wind console.log 性能**：删除打印整个 Float32Array 的调试日志
- 🧹 **SidePanel fetch 超时**：添加 AbortController 8 秒超时保护

详见[日志](LLM_record/26-08/2026-08-01/2026-08-01-frontend-memory-leak-fixes.md)

#### Batch 3：前端 Race Condition 与类型安全

- 🔧 **playerController waitForModelReady 双重决议防护**：变量重命名 offReady/offErr，添加 `settled` 守卫确保只 resolve/reject 一次
- 🔧 **CameraSystem springTarget 消除 as any**：弹簧阻尼循环改为分量级运算，彻底移除 8 处字符串属性访问 + as any
- 🔧 **PhysicsSystem _bottomLevel 安全访问**：定义 `TerrainProviderWithBottomLevel` 显式接口声明私有字段依赖
- 🔧 **ensureCesiumLoaded Promise 锁语义修正**：`_cesiumLoadPromise = null` 从 finally 移入 catch，明确仅失败时清空锁

详见[日志](LLM_record/26-08/2026-08-01/2026-08-01-race-condition-type-safety.md)

#### Batch 4：后端输入校验与边界

- 🔒 **sqlite_recovery 路径遍历防护**：`recover_sqlite_database` 新增 `allowed_base_dir` 参数，校验 `db_path` 位于允许目录内
- 🔒 **location IP 输入验证**：`ip-locate` 接口使用 `ipaddress.ip_address()` 校验 IP 格式，非法格式返回 400
- 🔒 **确认邮件服务/验证码/CORS 安全**：email_service subject 使用固定映射无注入风险；verification 使用 secrets 模块 + 频率限制；CORS 已配置驱动

详见[日志](LLM_record/26-08/2026-08-01/2026-08-01-backend-input-validation.md)

#### Batch 5：前端类型安全（as any 清理）

- 🔧 **CompassManager**：`viewResolutionKey` 类型改为 `EventsKey`，定义 `VectorLayerWithTogetherStyle` 接口
- 🔧 **useCompassStore**：标准类型访问 + `DeviceOrientationEvent.requestPermission` 显式转换
- 🔧 **layerTreeBuilder**：移除 `toLayerNode` 返回值上的冗余 `as any`
- 🔧 **decompressor**：定义 `JsZipEntry` 接口，`isBlobLike` 返回 `input is Blob`
- 🔧 **tileLifecycle**：定义 `TileSourceWithInternals` 接口替代 `as any`
- 🔧 **driveXmlParser**：全局声明 `TiandituMapApi` 接口 + `Window.T` 类型
- 🔧 **useErrorHandler**：定义 `QuotaError extends Error` 接口
- 🔧 **useUserPreferencesStore/useAuthStore**：`(result as any).data` 改为 `(result as { data: unknown }).data`

详见[日志](LLM_record/26-08/2026-08-01/2026-08-01-frontend-type-safety.md)

#### Batch 6：死代码清理 + 杂项 LOW

- 🧹 **HomeView.vue**：移除废弃的 `currentNewsIndex` 变量
- 🧹 **CompassControlPanel.vue**：移除已完成的 `// TODO:√` 注释块
- 🧹 **useMapSearchAndCoordinateInput.js**：移除 67 行注释掉的废弃函数旧版本
- 🧹 **feng-shui-compass-svg.vue**：移除 65 行注释掉的废弃缓存函数

详见[日志](LLM_record/26-08/2026-08-01/2026-08-01-dead-code-cleanup.md)

#### Batch 7：剩余 MEDIUM 收尾

- 🔧 **basemapConfig.ts**：第三方 Token 统一收口至 `publicRuntime`（消除散落 `import.meta.env` 读取 + 硬编码 token 字符串），所有 Mapbox/MapTiler/GeoVisEarth URL 改用模板变量
- 🔧 **agent_chat/routes.py**：`preferred_model` 注入防护 — 后端校验用户偏好模型在可用模型列表内，不在列表则 400
- 🔧 **external_proxy.py**：`/ipapi/country` 端点添加 `ipaddress.ip_address()` 输入校验
- 🔧 **useMapSwipeTest.ts**：所有 console.log/warn 添加 `if (import.meta.env.DEV)` 门禁
- 🔧 **CesiumContainer.vue**：boot 路径 `console.warn` 添加 DEV 门禁
- 🔧 **ChatPanelContent.vue**：静默 catch 补充注释说明 Markdown 加载失败已有纯文本兜底

详见[日志](LLM_record/26-08/2026-08-01/2026-08-01-batch8-final-cleanup.md)

#### Batch 8：代码审查 Bug 修复

- 🐛 **wind/index.mjs**：`lowFrameRate` 事件监听中的 `console.warn` 添加 `if (import.meta.env.DEV)` 门禁，删除 `console.log(result)` 打印整个 Float32Array
- 🐛 **api/backend/client.js**：恢复同步 useMessage 导入（修复首次 API 错误 toast 丢失 — 异步动态导入导致竞态，首个 API 错误无法提示用户）
- 🐛 **PhysicsSystem.ts**：移除死代码 `_assertWorld()` 方法
- 🐛 **useCesiumLayers.js**：恢复地形自动切换（修复 OSM Buildings 开启后地形不自动切换的功能降级）
- 🐛 **useShallowWater.js**：animate 循环 catch 块内 `pause()` 添加 try/catch 保护
- 🐛 **locationSearch.js**：天地图搜索恢复原生 `fetch()`（后端无对应代理路由，天地图 API 支持 CORS，原始方案正确）

详见[日志](LLM_record/26-08/2026-08-01/2026-08-01-code-review-bug-fixes.md)

---

### V3.5.3 (2026-08-01) — 自定义瓦片底图简化：移除 normBase 动态上下文注入

> 🧹 **代码清理**：将 `local_tiles` 从动态 `normBase` 上下文注入改为标准静态 URL 图层，清理 8 个文件的冗余代码。

- 🔗 **静态 URL 化**：`sourceDescriptors.ts` 移除 `needsContext: ['normBase']`，直接使用 `https://tiles.negiao.cc.cd/tiles/{z}/{x}/{y}.png`
- 🏭 **工厂签名简化**：`createLayerConfigs()` 移除 `normBase` 参数，`LayerFactoryContext` 类型清理
- 🗑️ **死代码删除**：`MapContainer.vue` 移除 `BASE_URL`/`NORM_BASE` 常量定义
- 🔄 **调用链对齐**：`useBasemapSwipe.js`、`useRuntimeMapTokenPool.js`、`MapDownloader.vue` 全部清理传参
- 🎛️ **卷帘恢复**：`ControlsPanel.vue` 移除对 `local_tiles_preset` 的特殊排除，现支持卷帘对比
- 📄 **完整记录**：[2026-08-01 自定义瓦片底图简化日志](../LLM_record/26-08/2026-08-01/2026-08-01-simplify-local-tiles.md)

---
### V3.5.2 (2026-07-31) — HF 挂载 SQLite 保守恢复、备份与维护审计

> 🛡️ **数据库可靠性**：针对 Hugging Face Space 重启及 Bucket/NFS/FUSE 网络挂载下 SQLite WAL/SHM 锁与同步风险，重写鉴权库损坏处理流程；原损坏数据始终先归档保留，逻辑恢复失败后以经过校验的空 schema 降级运行，避免整个 auth 子系统持续返回 500。

- 🔍 **只读检测**：使用只读 URI 执行 `PRAGMA quick_check(1)`，避免检测阶段切换 journal mode、创建新库或修改损坏源文件
- 📦 **时间戳损坏备份**：首次发现损坏即按 UTC 时间创建恢复目录，完整复制主库、`-wal`、`-shm`、`-journal`，记录 SHA256、源文件 mtime、检测/恢复时间、错误和人工恢复说明
- 🧰 **容器本地重建**：把备份副本复制到 `TemporaryDirectory`，优先执行 `sqlite3 source.db .dump`，只把独立事务行 `ROLLBACK;` 清理为 `COMMIT;` 后导入全新候选库；失败时再尝试 `.recover --ignore-freelist`
- ✅ **分层校验**：候选库依次检查 `quick_check`、`integrity_check`、外键、必需表、必需列和行数，并在激活前导出经验证的二进制备份与 SQL 备份
- 🔄 **安全激活与回滚**：候选库先复制到挂载目录 staging 文件并复检，再校验在线源文件指纹未变化，最后 `os.replace` 激活；激活后验证失败会恢复原始备份 bundle
- 🛟 **空库降级兜底**：`.dump`/`.recover` 均失败时，只在时间戳损坏 bundle 已成功落盘的前提下创建完整空 schema 候选库；校验、备份并原子激活后以 `recovery_degraded_empty` 记录事件，使 auth 接口保持可用，原损坏库仍可人工修复
- 🧾 **维护审计**：新增 `database_maintenance_events` 表与原子 JSON manifest，同步记录损坏日期、恢复起止时间、恢复方法、校验结果、备份路径、恢复统计和错误信息
- ⚙️ **网络挂载策略**：默认 `journal_mode=DELETE`、`synchronous=FULL`、`busy_timeout=15000`、`foreign_keys=ON`；新增并登记 `AUTH_DB_JOURNAL_MODE`，删除 schema 初始化阶段强制 WAL 的逻辑
- 🐳 **运行环境**：Docker 镜像安装 `sqlite3` CLI，确保线上可执行与本地成功流程一致的 `.dump`/重建操作
- 🧪 **回归覆盖**：`test_sqlite_recovery.py` 覆盖 CRLF SQL 清理、SQL 文本防误替换、事件 UPSERT/manifest 同步、成功恢复、失败保源、备份失败记录、激活失败回滚与安全空库降级
- 📄 **完整记录**：[2026-07-31 V3.5.2 SQLite 恢复维护日志](../LLM_record/26-07/2026-07-31/2026-07-31-v352-sqlite-recovery.md)

---
### V3.5.1 (2026-07-30) — GIS 拖拽导入 Composable 提取 + 2D 地图整图拖拽覆盖层

> 🖱️ **交互增强**：将 TOCPanel 内联拖拽逻辑提取为独立 `useGisDropZone` composable，并在 MapContainer 新增整图拖拽覆盖层，用户拖拽文件到 2D 地图任意位置均可触发导入。

- 📦 **新增 `gisUploadPayload.ts`**：从 `useGisLoader.ts` 提取 `createUploadPayloadsFromFiles`、`createUploadPayloadFromFolder`、`createUploadPayloadFromEntries` 三个载荷构建函数 + `GisDispatchInput` 类型，成为独立 SSOT
- 🆕 **新增 `useGisDropZone.ts`**：通用 GIS 文件拖拽 composable，封装 `isDragging` 状态 + 四事件处理器（dragEnter/Over/Leave/Drop）+ `hasFileItems` 三重检测（items.kind / types / files.length），避免非文件拖拽误触发
- 🗺️ **MapContainer 覆盖层**：全屏 overlay（`backdrop-filter` 模糊 + 虚线边框 + SVG 上传图标 + i18n 提示），`gis-upload-dragging` class 触发时 `filter: saturate(0.8)` 视觉反馈
- 🧹 **TOCPanel 精简**：删除 ~40 行内联拖拽处理函数，改用 `useGisDropZone` composable，净减 ~30 行
- 🔗 **HomeView 事件链路**：`@upload-data="handleUploadData"` 同时绑定到 MapContainer 和 CesiumToolPanel
- 🌐 **i18n 新增**：`layer.dropToMap`（中："释放文件，导入到二维地图" / 英："Release to import into the 2D map"）
- 📄 **新增 Demo**：`Docs/Demo/submergeAnalysis.html`（淹没分析独立演示页，Vue 3 + Cesium CDN，532 行）
- 📋 **日志**：详见[日志](../LLM_record/26-07/2026-07-30/2026-07-30-gis-dropzone-composable.md)

### V3.5.0 (2026-07-29) — 前端 domains 架构重构完成（Phase 1~9）

> 🏗️ **架构级大版本**：前端 `src/` 从扁平 `components/`、`composables/`、`stores/`、`services/`、`utils/`、`constants/` 结构迁移至领域驱动三域架构（`domains/ol/`、`domains/cesium/`、`domains/common/`）。

- 📦 **迁移规模**：~160 个文件从旧路径迁入 `domains/` 三域，消费方全量改用 `@ol/`、`@cesium-domain/`、`@common/` alias
- 🗂️ **领域拆分**：
  - `domains/ol/`（OpenLayers 2D）：地图核心、底图、图层、绘制、测量、空间分析、路由、搜索、瓦片源
  - `domains/cesium/`（Cesium 3D）：3D 容器、地形、大气、风场、流体模拟、人物控制器、数据导入
  - `domains/common/`（跨引擎公共）：Chat、天气、罗盘、用户中心、图层树、数据导入、地图视图、Shell、国际化
- ⚙️ **vite.config.js**：补齐 `@domains`、`@ol`、`@cesium-domain`、`@common` 4 个 alias 条目
- 🧹 **旧路径清理**：`components/`（除 Routing/Search 外）、`composables/`、`stores/` 子目录、`utils/` 子目录、`constants/` 子目录、`services/` 子目录均清空删除
- 🔧 **构建验证**：`✓ built in 23.16s, 3763 modules transformed`
- 📋 **子任务日志**：
  - Phase 9 收尾（Routing/Search/views 迁移 + 结构树重建）：[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3500-phase9-final-cleanup.md)
  - Task 1（composables/map → ol）：[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3490-frontend-domains-phase1-2.md)
  - Task 2（Layer/ControlsPanel）：[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3497-task2-layer-controls-panel-migration.md)
  - Task 3（Chat/Weather/Compass/UserCenter）：[日志](../LLM_record/26-07/2026-07-29/2026-07-29-task3-common-domain-migration.md)
  - Task 4（composables 横切）：[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3498-task4-composables-reorganize.md)
  - Task 5（stores/services/utils/constants）：[日志](../LLM_record/26-07/2026-07-29/2026-07-29-task5-stores-services-utils-constants.md)

### V3.4.99 (2026-07-29) — 前端 domains 架构 Task 5：stores + services + utils + constants 整理

- 📦 **stores 迁移（14 文件）**：`useAttrStore`、`useLayerStore`、`useFeatureStyleStore` 等迁入 `domains/ol/stores/`；`useWeatherStore` 迁入 `domains/common/weather/stores/`；`useAuthStore`、`useUserPreferencesStore` 迁入 `domains/common/user/stores/`；`useAppStore`、`useThemeStore` 迁入 `domains/common/app/stores/`；`useUrlParamStore` 迁入 `domains/common/url-state/stores/`；`useTOCStore` 迁入 `domains/common/layer-tree/stores/`；`useCompassStore` 迁入 `domains/common/compass/stores/`；barrel `stores/index.ts` 改用 `@ol/stores/`、`@common/*/stores/` alias。
- 🔧 **services 迁移（13 文件）**：`auth.ts` 迁入 `domains/common/user/services/`；`userLocationContext.ts`、`userPositionCache.ts` 迁入 `domains/common/map-view/services/`；`CompassManager.ts` 迁入 `domains/common/compass/services/`；其余 services 按域归类。
- 🧩 **utils 迁移（28 文件）**：`coordinateFormatter.ts`、`units.js` 迁入 `domains/common/map-view/`；`pathUtils.ts`、`normalize.ts`、`labelValidator.ts`、`abortManager.ts` 迁入 `domains/common/utils/`；`textDecoder.ts`、`loading.ts` 迁入 `domains/common/` 子目录；`crypto.ts` 迁入 `domains/common/url-state/`；`amapRectangle.ts`、`coordinateInputHandler.ts` 迁入 `domains/ol/utils/`；biz barrel 统一。
- 🎨 **constants 迁移（5 文件）**：`mapStyles.ts` 迁入 `domains/ol/constants/`；basemap constants 迁入 `domains/ol/basemap/constants/`；barrel `constants/index.js` 改用 `@ol/` alias。
- 🔗 **消费方 alias 更新（30+ 文件）**：`App.vue`、`router/index.js`、`views/RegisterView.vue`、`views/OAuthCallbackView.vue`、`domains/common/shell/MagicCursor.vue`、`router/lazyHomeViewLoader.js` 等全量改用 `@ol/`、`@common/` alias。
- ⚙️ **vite.config.js 关键修复**：补齐 `@domains`、`@ol`、`@cesium-domain`、`@common` 4 个 alias 条目（此前仅 `@` 与 `cesium` 在 vite 中生效，IDE 用的 jsconfig alias 不影响构建）。
- 🧹 **旧目录清理**：`utils/gis/`、`utils/io/`、`utils/biz/`、`utils/echarts/`、`utils/geo/`、`utils/map/`、`utils/ui/`、`utils/url/`、`utils/weather/` 清空删除。
- 📋 **日志**：详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-task5-stores-services-utils-constants.md)

### V3.4.98 (2026-07-29) — 前端 domains 架构 Task 4：composables 横切整理

- 📦 **Chat composables 迁移（5 文件）**：`chatIntentFallback.js`、`useAgentMapContext.js`、`useChatAgentConfig.js`、`useChatSession.js`、`useAgentConfig.js` → `domains/common/chat/composables/`
- 🌤️ **Weather composables 迁移（2 文件）**：`useWeatherCharts.js`、`useWeatherData.js` → `domains/common/weather/composables/`
- 🔐 **Auth composable 迁移（1 文件）**：`useAuthIdentity.js` → `domains/common/user/composables/`
- ✨ **Magic composables 迁移（6 文件）**：`useDelaunay.js`、`useFluid.js`、`useGravity.js`、`useRingExplosion.js`、`useSingularity.js`、`useWave.js` → `domains/common/components/Magic/`
- 🐚 **Shell/Utils/App composables 迁移（7 文件）**：`useMessage.js` → `domains/common/shell/`，`useMessageIslandMotion.js` → `domains/common/shell/`，`useLocale.js` → `domains/common/app/`，`useMarkdownRenderer.js` → `domains/common/utils/`，`useErrorHandler.ts` → `domains/common/utils/`，`useUserLocation.js` → `domains/common/map-view/`
- 📥 **Data Import composables 迁移（4 文件）**：`useSharedResourceLoader.ts` → `domains/common/data-import/`，`useKmzLoader.js` → `domains/common/data-import/`，`useGisLoader.ts` → `domains/common/data-import/`，`useLayerDataImport.js` 内部引用更新
- 🗺️ **OL composables 迁移（5 文件）**：`useManagedLayerRegistry.js`、`useUserLayerActions.js` → `domains/ol/layer/composables/`，`useStyleEditor.js` → `domains/ol/layer/style/`，`useMapSwipe.ts` → `domains/ol/composables/`，`useTileSourceFactory.ts` → `domains/ol/composables/`
- 🔗 **消费方 import 更新（~150 处）**：useMessage（34 文件）、useLocale（55 文件）由子 Agent 批量处理；其余 ~20 文件手动更新
- 🧹 **旧路径清理**：`composables/` 目录（根 + 子目录）完全删除
- 🔧 **构建错误修复**：修复 Tasks 1-3 遗留的相对路径问题（biz/index.js、useGisLoader.ts、useLayerDataImport.js、useWeatherData.js 等）
- 📋 **日志**：详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3498-task4-composables-reorganize.md)

### V3.4.97 (2026-07-29) — 前端 domains 架构 Task 2：Layer/ControlsPanel 组件迁移

- 📦 **Layer 组件迁移（4 文件）**：`TOCPanel.vue`、`LayerPanel.vue` → `domains/common/layer-tree/components/`；`LayerControlPanel.vue`、`AttributeTable.vue` → `domains/ol/layer/components/`
- 🎛️ **ControlsPanel 组件迁移（7 文件）**：`ControlsPanel.vue`、`DrawPanel.vue`、`MeasurePanel.vue`、`SpatialAnalysisPanel.vue`、`LogMonitor.vue`、`AdministrativeDivisionPanel.vue`、`AdministrativeDivisionTreeNode.vue` → `domains/ol/components/`
- 🔗 **消费方 alias 更新**：`SidePanel.vue`、`HomeView.vue`、`MapContainer.vue` 改用 `@common/`、`@ol/` alias
- 🧹 **旧路径清理**：`components/Layer/`、`components/ControlsPanel/` 已清空删除
- 📋 **日志**：详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3497-task2-layer-controls-panel-migration.md)

### V3.4.96 (2026-07-29) — 前端 domains 架构 Phase 9：旧路径清理

- 🗑️ **删除已迁移旧目录**：`components/Shell/`（7 文件）、`components/Common/ExtentPicker.vue`、`components/Map/`（5 文件）、`views/HomeView.vue` + `views/home/`（5 文件）、`composables/tileSource/`（7 文件）均已迁入 domains/，旧路径无外部引用后删除。
- 🔗 **消费方 alias 收敛**：`App.vue`、`router/lazyHomeViewLoader.js`、`composables/useMessage.js`、`components/Map/MapDownloader.vue`、`components/ControlsPanel/SpatialAnalysisPanel.vue` 改用 `@common/` alias。
- 📜 **结构树同步**：`frontend-structure.md` 完全重写，删除重复内容、过期 `components/Cesium/` 段落，对齐磁盘实际状态（401/401 ✅）。
- ⚠️ **版本号顺延**：V3.4.95 已被 Agent 占用（Phase 8 utils/gis 下沉），本次顺延至 V3.4.96。
- 📋 **日志**：详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3496-frontend-domains-phase9.md)

### V3.4.95 (2026-07-29) — 前端 domains 架构 Phase 8（续）：utils/gis/ 剩余文件下沉

- 📦 **GIS 工具下沉**：`utils/gis/decompressor.ts`、`crs-engine.ts`、`crsAware.js`、`dataDispatcher.js`、`decompressFile.js`、`loadJsZip.ts`、`batchProcessor.js`、`archiveProcessor.js`、`shpPacketBuilder.js` 迁移至 `domains/common/data-import/`。
- ⏳ **延迟加载下沉**：`deferredGisAssets.js`、`deferredGisWarmupLauncher.js`、`mapRuntimeDeps.js` 迁移至 `domains/common/data-import/`。
- 🔀 **消费方 import 更新**：`utils/io/index.js`、`utils/geo/index.js`、`composables/useGisLoader.ts`、`domains/common/data-import/parsers/shpParser.ts`、`views/RegisterView.vue` 改用 `@common/data-import/` alias。
- ⚠️ **版本号顺延**：V3.4.94 已被 Agent A 占用（Cesium 域 stores/utils/constants 下沉），本次顺延至 V3.4.95。
- 📜 **结构树同步**：`frontend-structure.md` 更新为新领域树。详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3495-frontend-domains-phase8-utils.md)

### V3.4.94 (2026-07-29) — 前端 domains 架构 Phase 8：Cesium 域 stores/utils/constants 下沉

- 🏗️ **Cesium stores**：`cesiumLayers.ts`、`cesiumLayerNodeBuilder.ts` 从 `stores/layer/` 迁入 `domains/cesium/stores/`。
- 📦 **Cesium utils**：`cesiumFxRuntime.js` 从 `utils/echarts/` 迁入 `domains/cesium/utils/`。
- 📦 **Cesium constants**：`cesiumProviderFactory.ts` 从 `constants/basemap/` 迁入 `domains/cesium/constants/`。
- 📜 **结构树同步**：`frontend-structure.md` 更新。详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3494-frontend-domains-phase8.md)

### V3.4.93 (2026-07-29) — 前端 domains 架构 Phase 7：Data Import / GIS IO 拆分

- 📦 **通用解析器下沉**：`utils/gis/parsers/`（kmlParser、kmlStyleParser、shpParser、dbfParser、tifLoader、amapAoiParser、universalAmapParser）迁移至 `domains/common/data-import/parsers/`。
- 🔧 **CRS 工具下沉**：`utils/coordTransform.js`、`utils/crsUtils.js` 迁移至 `domains/common/data-import/crs/`。
- 🗂️ **Data Import composables 下沉**：`composables/dataImport/`（index.js、vectorUtils.js、rasterUtils.js、webglRasterRenderer.js）迁移至 `domains/common/data-import/`。
- 📥 **OL 数据导入下沉**：`composables/useLayerDataImport.js` 迁移至 `domains/ol/data-import/composables/`。
- 🔀 **消费方 import 更新**：`utils/geo/index.js`、`utils/gis/crsAware.js`、`utils/io/index.js`、`composables/map/features/useDeferredUserLayerApis.js`、`api/map.js`、`api/backend/location.js`、`api/geocoding.js`、`api/locationSearch.js`、`composables/useUserLocation.js`、`services/DistrictManager.ts`、`domains/ol/components/MapContainer.vue`、`domains/cesium/composables/dataImport/loaders/kmlLoader.js` 改用 `@common/data-import/` alias。
- 📜 **结构树同步**：`frontend-structure.md` 更新为新领域树。详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3493-frontend-domains-phase7.md)

### V3.4.92 (2026-07-29) — 前端 domains 架构 Phase 6：Layer/TOC 拆分

- 🏗️ **layer-tree 领域**：新增 `domains/common/layer-tree/`，迁入图层树协议 / 工厂 / 菜单 / 动作 / 导出 / 选择管理器。
- 📦 **TOC 组件下沉**：`TOCTreeItem.vue`、`SharedResourceTreeItem.vue`、`LayerPropertiesDialog.vue` 进 `domains/common/layer-tree/components/`。
- 📜 **结构树同步**：`frontend-structure.md` 更新。详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3492-frontend-domains-phase6.md)

### V3.4.91 (2026-07-29) — 前端 domains 架构 Phase 3：Cesium modules/vendors 迁移

- 🌲 **TOC UI/协议/菜单迁入 common**：将 `components/Layer/TOCTreeItem.vue`、`LayerPropertiesDialog.vue`、`SharedResourceTreeItem.vue` 与 `composables/map/toc/` 下的 protocol/factory/actions/menu 全部迁移至 `domains/common/layer-tree/`，通过 `domains/common/index.js` barrel re-export。
- 🔀 **Cesium TOC 动作分流器下沉**：`cesiumTocActions.js` 迁移至 `domains/cesium/layers/toc-adapters/`，内部 import 改用 `@/` alias。
- 📦 **消费方 import 更新**：`TOCPanel.vue`、`LayerPanel.vue`、`layerExportService.js` 改用 `@common/layer-tree` 与 `@cesium-domain/layers/toc-adapters/cesiumTocActions` alias；`composables/map/index.js` 移除已迁移 toc 模块 re-export。
- 📜 **结构树同步**：`frontend-structure.md` 更新为新领域树。详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3492-frontend-domains-phase6.md)

### V3.4.98 (2026-07-29) — 前端 domains 架构 Phase 4/5：Common Shell/Home + OL 地图核心迁移

- 🏠 **Common Shell/Home 迁移**：将 `views/HomeView.vue`、`views/home/*`、`components/Shell/*`、`components/Common/*` 迁移至 `domains/common/app/`、`domains/common/shell/`、`domains/common/components/`，并更新 `router/lazyHomeViewLoader.js`、`App.vue`、`useMessage.js`、`SpatialAnalysisPanel.vue`、`MapDownloader.vue` 的 import。
- 🗺️ **OL 地图核心迁移**：将 `components/Map/*`、`composables/map/basemapSystem.js`、`composables/map/features/useBasemap*.js`、`useBasemapResilience.js`、`useDrawMeasure.js`、`drawingToolRegistry.js`、`drawingGeometryUtils.js`、`useRouteRendering.js`、`routeService.js`、`useSpatialAnalysis.js`、`useStartup*.js`、`useBasemapUrlMapping.js`、`useMapViewUrlState.js`、`composables/tileSource/*`、`utils/map/*`、`basemapLayerFactory.js` 迁移至 `domains/ol/` 下对应子目录，并更新 `MapContainer.vue` 等文件的 import。
- 📜 **结构树同步**：`frontend-structure.md` 更新为新领域树。详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3491-frontend-domains-phase4-5.md)

### V3.4.90 (2026-07-29) — 前端 domains 架构 Phase 1/2：Cesium 入口下沉至领域根目录

- 🏗️ **domains 骨架**：新增 `frontend/src/domains/ol`、`domains/cesium`、`domains/common` 三领域根目录，配置 `@domains`、`@ol`、`@cesium-domain`、`@common` 路径别名。
- 📦 **Cesium 第一批迁移**：将 `CesiumContainer.vue`、`CesiumToolPanel.vue`、`CesiumAdvancedEffects.vue`、`CesiumDataImportDialog.vue`、`LilGuiControls.vue`、原 `composables/`、原 `terrain/` 迁移至 `domains/cesium/components`、`domains/cesium/composables`、`domains/cesium/providers/terrain`，并更新相关 import。
- 📜 **结构树同步**：`frontend-structure.md` 更新为新领域树。详见[日志](../LLM_record/26-07/2026-07-29/2026-07-29-v3490-frontend-domains-phase1-2.md)

### V3.4.89 (2026-07-28) — Cesium/流体 toast + 下载 store lastError i18n

- 🌐 **cesium.toast / fluidToast**：导航选点、底图地形、token 重试/耗尽、流体创建/洪水/清除 zh/en。
- 📥 **mapDownload 校验键**：`useDownloadStore` 抛 `mapDownload.err*` / `msg*`；`MapDownloader` `resolveStoreText` 展示。
- 📜 **Force**：L1 非密 `.env` 可改须 catalog/example 同步；L3 绝密仍禁。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3489-cesium-fluid-download-i18n.md)

### V3.4.88 (2026-07-28) — useAgentConfig + ApiKeysManagementPanel i18n

- 🌐 **admin agent 校验/toast**：Extra Body / 必填 / 超时 / tokens / model 列表 / 额度 / 保存与重置 zh/en。
- 🔑 **apiKeys 扩展**：Cesium、备用池、Agent 参数区、默认 AI、安全提示与 CRUD toast。
- 🧰 **接线**：`useAgentConfig` `translate`；`ApiKeysManagementPanel` 全量 `t()`。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3488-agent-apikeys-i18n.md)

### V3.4.87 (2026-07-28) — AttributeTable / MapControlsBar / AOI 弹窗可见 UI i18n

- 🌐 **attrTable / mapControls 键**：属性表标题/工具栏/字段面板/空态/页脚；坐标条编辑/复制/格式/复位 zh/en 对齐。
- 🧰 **AttributeTable + MapControlsBar**：`useLocale`；可见 UI 与 toast 全量 `t()`。
- 🗺️ **AmapAoiInjectDialog**：模板与抓取/粘贴 toast 接入 `layer.aoi*`（含 fetch/paste 扩展键）。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3487-attrtable-mapcontrols-aoi-i18n.md)

### V3.4.86 (2026-07-28) — CesiumToolPanel + 模块配置全量中英文 i18n

- 🌐 **cesium 键扩展**：壳层 UI / status / materials / 九大 module.* zh/en 叶 349 对齐。
- 🧰 **CesiumToolPanel**：`useLocale`；Tab/底图数据/材质/空态全量 `t('cesium.*')`。
- 🧩 **toolModules 工厂**：scene/atmosphere/cloud/tools/wind/fluid/shallowWater/player/analysis 的 title·label·tooltip·status 走 `translate`；`useCesiumToolModules` 订阅 `language` 重建。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3486-cesium-toolpanel-i18n.md)

### V3.4.85 (2026-07-28) — Admin 控制台 + Chat 导出空态 i18n

- 🌐 **admin 缺键**：`unknownError` / JSON 解析 / 无定位键删除 / 空表 / 插入示例 / basemap 选项等 zh/en 对齐。
- 🧰 **AdminControlPanel**：`useLocale`；模板与 CRUD toast 全量 `t('admin.*')`。
- 💬 **Chat 导出**：空对话 `chat.exportEmpty`；下载名 `chat.exportFilename`。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3485-admin-chat-i18n.md)

### V3.4.84 (2026-07-28) — ExtentPicker / 404 / HomeView 可见 UI i18n

- 🌐 **Vue UI 优先**：`ExtentPicker` 框选按钮与提示、`NotFoundView` 文案、`HomeView` 属性面板与地图/分析 toast 接入 `extent.*` / `notFound.*` / `home.*`。
- 📦 **full pack 对齐**：zh/en 叶节点一致；法律长文（服务条款/隐私）本刀不纳入。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3484-extent-notfound-home-i18n.md)

### V3.4.83 (2026-07-28) — 坐标输入 / p 参数校验错误 i18n

- 🌐 **layer 校验键**：经纬度空值/数字/范围/标准化、p 必填 zh/en 对齐；解码失败复用 `pDecodeFailed`。
- 🔧 **工具层 t()**：`coordinateInputHandler` / `usePositionCodeTool` 错误文案 `translate`；TOC 透传无需再改。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3483-coord-p-validation-i18n.md)

### V3.4.82 (2026-07-28) — TOCPanel 坐标 / 地理编码 / 共享资源 toast i18n

- 🌐 **layer toast 键**：坐标复制、弹窗拦截、AOI 粘贴、p 解码、地理编码、超大文件、共享资源扫描/加载 zh/en 对齐。
- 🧰 **TOCPanel 脚本**：上述路径 `message.*` / 表单错误一律 `t('layer.*')`；feature properties 中文键保持数据 SSOT。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3482-tocpanel-toast-i18n.md)

### V3.4.81 (2026-07-28) — Weather 看板消息 / 图表 / API 中英文 i18n

- 🌐 **weather 键扩展**：雨情卡片、查询失败、ECharts 系列/风力单位、`weekdays` zh/en 对齐。
- 🔌 **api + composable**：`getWeather` toast、`useWeatherData` 校验/雨情、`useWeatherCharts` 图例与 tooltip 全量 `t()`。
- 📅 **formatWeekLabel**：优先 `weather.weekdays.*`。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3481-weather-board-i18n.md)

### V3.4.80 (2026-07-28) — Bus / Driving 规划面板全量中英文 i18n

- 🌐 **routing 键扩展**：候选提示 / 无分段 / Token·网络错误 / `busNoPlan`·`busPlanFailed`·`transitMode` 等 zh/en 对齐。
- 🚌 **BusPlannerPanel**：模板与错误全量 `t()`；步行/公交 mode 修正；空方案与 catch 语义键分离。
- 🚗 **DrivingPlannerPanel**：策略/时长/调试/失败兜底全量 `t()`；Loading 沿用 `loading.drivingRoute`。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3480-routing-panel-i18n.md)

### V3.4.79 (2026-07-28) — showLoading 全链路中英文 i18n

- 🌐 **core `loading.*`**：鉴权 / 地图引擎 / Cesium / GIS 导入 / 流体高度 / 公交驾车规划文案进 core，路由守卫首屏可用。
- 🔗 **调用点统一 t()**：`router`、`HomeView`、`CesiumContainer`、`FluidSimulationPanel`、`Driving/BusPlannerPanel`。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3479-showloading-i18n.md)

### V3.4.78 (2026-07-28) — 语言 dirty 清除 + Message / GlobalLoading 首屏 i18n

- 🧹 **language 退出 dirty**：偏好「界面语言」即时 SSOT，不参与未保存标记与批量保存；描述文案改为无需点保存。
- 🌐 **Message.vue**：toast 标题 / 关闭 aria / 队列提示接入 `message.*`（core 首屏）。
- ⏳ **GlobalLoading.vue**：默认主/副文案 `common.loadingPleaseWait` / `loadingHard`。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3478-language-dirty-message-loading-i18n.md)

### V3.4.77 (2026-07-28) — SidePanel / HomeView 侧栏中英文 i18n

- 🌐 **侧栏占位与折叠**：`HomeView` 占位 `common.expand`；`SidePanel` 折叠 title 读 `shell.expandPanel` / `collapsePanel`。
- 📰 **新闻区全量 i18n**：平台 chip、`newsSubtitle` / loading / empty / footer；`platforms` 补 GitHub/HN/V2EX/StackOverflow。
- 🏷️ **activeFeature / 加载态**：默认新闻/天气/地图视图与懒加载失败 toast 走 `shell.*`。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3477-sidepanel-homeview-i18n.md)

### V3.4.76 (2026-07-28) — 全局语言开关 SSOT（注册页 ↔ 偏好页）

- 🌐 **本机语言 SSOT**：`webgis_pref_language` 优先于完整偏好缓存与远端默认 `zh-CN`；`loadPreferences` 合并时保留本机，并在登录后静默回写远端。
- 🔗 **统一入口**：`setLanguagePreference` 供注册页与账号中心偏好共用；`setLocaleLanguage` 同步完整缓存中的 `language`。
- 🩹 **修复**：注册页切英文后进首页被 bootstrap/远端默认冲回中文。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3476-global-language-ssot.md)

### V3.4.75 (2026-07-28) — Draw / Measure / Spatial 子面板中英文 i18n

- 🌐 **三子面板全量 i18n**：`DrawPanel` / `MeasurePanel` / `SpatialAnalysisPanel` 标题、工具、参数、操作与结果 toast 接入 `draw.*` / `measure.*` / `spatial.*`。
- 📦 **spatial 键补齐**：`modes`（交集/并集/差集）与各算子 `*Submitted`、`fishnetWithCenter`、`squareLabel` / `hexLabel`。
- 🧹 **hints 归位**：`draw.hints` 误放的测距/测面提示迁至 `measure.hints` 唯一来源。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3475-draw-measure-spatial-i18n.md)

### V3.4.74 (2026-07-28) — i18n 二轮 CR 残留修复

- 🔗 **force/inflight join**：`loadLocaleMessages(force)` 同语言先 await 进行中的加载，再真正重载，避免双 task 竞态。
- 🔤 **空串合法文案**：`getMessage` 改 `!== undefined`，`''` 不再被当缺失回退。
- 🌐 **昵称校验 i18n**：`validateDisplayName` 返回 `auth.displayName*` code；RegisterView / SecurityTab `t(code)`；`getUserDisplayName` 空兜底。
- ⚡ **首屏成功 toast**：core 同步 `guestLoginSuccess` / `loginSuccessWithRole` / `googleLoginSuccess`。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3474-i18n-cr-residual-fixes.md)

### V3.4.73 (2026-07-28) — TopBar / Sidebar 中英文 i18n

- 🌐 **TopBar 全量 i18n**：菜单、分享、AI、2D/3D、用户中心、屏幕特效、常用地点、分享 toast 接入 `topbar.*`。
- 🧭 **ControlsPanel sidebar**：侧栏标签改 `computed` 读 `controls.*`；卷帘对话框与绘制/测量/日志 toast 全量 `t()`。
- 📦 语言包 zh/en 同步增补 `topbar` 与 `controls` 对话框/消息键。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3473-topbar-sidebar-i18n.md)

### V3.4.72 (2026-07-28) — i18n Code Review 全量修复

- 🩹 **首屏防 key 泄漏**：`core.js` 同步纳入登录必需 `auth.*` + `preferences.language`；`main.js` 尽早 `loadLocaleMessages()`；`bootstrap` 在 preferences 网络请求前触发加载。
- 🔗 **fallback 读写统一**：失败时 merge 进**当前语言槽**；`getMessage` 链为 当前 → `en-US` → `zh-CN` → path。
- 🧬 **深拷贝 + per-lang 加载**：`cloneLocaleNode` 防污染 core；`loadedLocales`/`inflightLoads` 按语言去重；`setLocaleLanguage` 自动加载，调用方无需 force。
- ♿ **RegisterView a11y i18n**：`modeSwitchAria` / `avatarGroupAria` / `avatarOption`。
- ✅ zh/en 叶节点 801/801 对齐（剔除死键后）。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3472-i18n-review-fixes.md)

### V3.4.71 (2026-07-28) — 注册页语言切换 + OAuth 配置登记收口

- 🌐 **注册页中英文切换**：`RegisterView` 头部新增 `lang-toggle`（中文 / EN），行为与偏好页 Interface Language 等价（`setLanguage` 自动加载完整语言包）。
- 💾 **语言持久化统一**：`setLocaleLanguage` 同步写入 `webgis_pref_language`，登录前后刷新保持一致。
- ⚙️ **OAuth 配置登记收口**：catalog / `.env.example` 登记 `GOOGLE_OAUTH_TOKENINFO_URL`；`VITE_GOOGLE_OAUTH_CLIENT_ID` 经 `publicRuntime` 导出，RegisterView 不再散落 `import.meta.env`。
- ✅ **门禁**：`CheckConfigRegistry.py` 7 项全绿；zh-CN/en-US 叶节点 key 对齐。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3471-register-lang-oauth-config.md)

### V3.4.70 (2026-07-28) — i18n 国际化重构：语言包物理拆分 + 懒加载 + Bug 修复

- 🌐 **语言包物理拆分**：`useLocale.js` 从 365 行精简；新增 `frontend/src/locales/core.js`（同步核心 common 键）+ `zh-CN.js` / `en-US.js`（懒加载完整语言包）。主 bundle 语言包体积减少约 82%。
- ⚡ **懒加载架构**：`loadLocaleMessages(force)` 动态 `import()` 完整语言包，`deepMerge` 触发响应式更新。
- 🔧 **ref 访问同步修正**：`messages` 改为 `ref()` 时，`getMessage` 同步改为 `messages.value[lang]`（属本次重构配套修正，非线上既有故障）。
- 🔒 **竞态条件防护**：新增 `loadingLang` 标记，异步加载期间语言切换时丢弃过期结果。
- 🏗️ **开闭原则**：硬编码 `if/else import()` 提取为 `LOCALE_LOADERS` map，新增语言仅需添加一条记录。
- 🌍 **回退语言中性化**：fallback 目标改为 `en-US`（V3.4.72 再统一读写链）。
- 📝 **RegisterView 全量 i18n 化**：硬编码中文文案替换为 `t('auth.*')`；修复 `emailVerifiedSuccess` 的 `✅` 前缀。
- ✅ **验证**：触改 JS `node --check` 通过。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3470-i18n-refactor.md)

### V3.4.69 (2026-07-28) — Agent 地图命令总线安全重构

- 🗺️ **MapCommandBus 固定白名单命令集**：新增 `frontend/src/services/agent/MapCommandBus.js`（工厂函数 `createMapCommandBus`），Agent 地图操作收窄为 5 个白名单命令：`setMapView` / `setViewCenter` / `setCameraOrientation` / `zoomToExtent` / `switchBasemap`。无 `set_url`、`navigate` 或任意命令入口，URL 更新仍由现有 OL/Cesium 同步链自动完成。
- 🔒 **移除 URL 直贴与任意 XYZ 注入风险**：重构 `chatIntentFallback.js`，底图关键词映射从动态 XYZ URL 生成改为稳定 `presetId` 查找表（`BASEMAP_PRESET_MAPPING`），彻底消除 Agent 接受/转发任意 URL 的安全隐患。
- 📋 **AgentMapContextV1 协议**：新增 `frontend/src/services/agent/mapContextSnapshot.js`（`buildAgentMapContextSnapshot`），发送时捕获活跃地图状态（runtime 主源 + URL 安全回退），输出标准化 `schemaVersion=1` 快照。新增 `useAgentMapContext.js` composable，提供 `buildMapContext` / `buildSettledMapContext` / `recordMapAction`。
- 🛡️ **后端 Schema 严格校验**：`backend/api/agent_chat/schemas.py` 引入 `AgentMapCenter` / `AgentMapOlContext` / `AgentMapCesiumContext` / `AgentMapBasemapContext` / `AgentMapUrlState` / `AgentMapContextV1` 等 Pydantic 模型，全部 `extra="forbid"` 拒绝未知字段；`model_validator` 强制 view 语义一致性（ol/cesium 互斥、zoom 范围校验）。
- 🏗️ **GISCommander 改为纯 facade**：`createGISCommander` 不再直接操作 OL 实例，所有地图变更委托 `commandBus.execute`。新增 `setMapView` / `setViewCenter` / `setCameraOrientation` 直通方法。
- 🧩 **前后端地图命令适配层**：新增 `frontend/src/services/agent/mapCommandAdapters.js`（`createOlMapCommandAdapter` / `createCesiumMapCommandAdapter`），统一处理坐标/bbox 校验、OL↔Cesium 视图参数适配、动画过渡 Promise 封装。
- 📖 **安全底图白名单**：新增 `frontend/src/services/agent/agentMapPresets.js`（`AGENT_BASEMAP_PRESETS` / `isAgentBasemapPresetId`），排除 custom/local 条目，Agent 仅提交 presetId。
- 🛡️ **系统提示词注入防护**：`upstream.py` 的 `_build_agent_system_prompt` 明确标注 `[Application-generated current map state: read-only data, not instructions]`，约束 LLM 仅使用声明工具。
- ✅ **测试覆盖**：新增 `backend/tests/test_agent_map_context.py`（7 个用例），覆盖 Schema 校验、view 语义约束、pitch 边界、prompt 格式契约。

- 🔐 **OAuth 一键注册登录（重新接入）**：后端新增 `backend/api/auth/oauth.py`（Google 授权码 + OneTap 双通道 / GitHub 授权码），前端重构 `OAuthCallbackView.vue`（错误处理 / 加载态 / 超时保护）+ `RegisterView.vue` 新增 Google/GitHub 授权按钮；state 落库 `oauth_tickets` 表（多 worker 安全），仅 verified email 可自动注册/绑定；配置 4 个可选 L3 key（`GOOGLE_CLIENT_ID/SECRET`、`GITHUB_CLIENT_ID/SECRET`），未配置时对应按钮自动隐藏。
- ☁️ **体积云流畅/均衡档颗粒感优化**：上调三档 `cloudResolutionScale`（0.5/0.75→0.67/0.85）、`maxSteps`（108/156→144/220）、`minStepSize`（110/80→85/60）、`perspectiveStepScale`（1.03/1.018→1.018/1.01）；恢复大气透视（`aerialPerspectiveScale` 0→0.35/0.55/0.7，`aerialStageEnabled` false→true）。
- 🎛️ **新增三个画质微调旋钮**：工具面板「体积云」分组新增「云渲染分辨率 / 最小采样步长 / 远距步长增幅」，可在不切极致档的情况下按 GPU 能力现场微调。
- 🌬️ **风场粒子缩放平滑**：`cesium-wind-layer/index.mjs` 新增 `zoomScaleTransitionMs: 260`，相机缩放时粒子尺寸平滑过渡（消除瞬时跳变）；`percentageChanged` 阈值优化 + 注册/销毁时原值守卫。
- ⏱️ **云纹理偏移驱动源统一**：`_advanceOffsets()` 改为 `offset = speed × elapsed`（消除浮点累加误差），新增 `clockElapsedSeconds` 输出到 BSM 动态参数，云体与云影演化时相完全一致。
- ✅ **验证**：16 个触改文件 `node --check` 通过；新增 3 个 cloudModule 控件字段类型一致；`cloudQualityPresets.js` 预设格式校验通过。详见[日志](../LLM_record/26-07/2026-07-28/2026-07-28-v3468-oauth-cloud-optimization.md)

### V3.4.67 (2026-07-27) — 体积云时间轴同步与大气透视修复

- ☁️ **Cesium 时间倍率同步**：体积云风场漂移与云形态演化从 `performance.now()` 墙钟增量改为 `viewer.clock.currentTime` 仿真时间差；调整 Cesium 时间倍率即同步改变云演化速度，拖动时间轴会让云纹理跳到对应时间状态。
- 🌥️ **云影同源时间**：BSM `CloudShadowPass` 不再独立计算墙钟 `u_time`，改由主云管线传入同一 `clockElapsedSeconds`，云体与云影演化保持一致。
- 🌌 **大气透视恢复且保留地面阴影**：后处理链保持 Atmosphere → Aerial → Cloud，Aerial 继续负责几何像素与地面云影，Cloud 最后叠加云体；流畅档重新启用基础 Aerial，三档 `aerialPerspectiveScale` 改为非零默认，避免大气效果只显示一点点。
- ✅ **验证**：4 个触改 JS 文件 `node --check` 通过；定向 ESLint 通过。详见[日志](../LLM_record/26-07/2026-07-27/2026-07-27-cloud-time-atmosphere-sync.md)

### V3.4.66 (2026-07-27) — L1 tracked `.env` 与硬编码服务端点收敛

- ⚙️ **配置三层模型落地纠偏**：根目录 `.env` 改为 tracked L1 非涉密默认配置，`.env.example` 回归全集 registry；`.gitignore` 仅忽略 `.env.local`、`backend/.env` 等私密覆盖入口。文档同步删除“复制 `.env.example` 到忽略 `.env`”旧流程，明确 L1/L2/L3 边界。
- 🛰️ **监控日志链路拆分**：`LOG` 继续作为 L3 监控令牌，新增 L1 `HF_RUN_LOGS_URL` / `HF_BUILD_LOGS_URL`，Space owner/name/path 不再写死在 `backend/api/monitor.py`。
- 🔧 **后端部署相关常量收敛**：下载输出目录与任务库、ships66 海图模板、Amap/Nominatim/EPSG/IP 定位/OAuth provider 端点、代理连接池/超时/User-Agent 等统一登记到 `backend/config/catalog.py` + 根 env，并用 `get_str/get_int` 读取；`AGENT_BASE_URL` fallback 去重，仅保留 catalog/env 默认。
- 🌐 **前端公开 L1 派生**：`publicRuntime.ts` 集中导出后端请求超时、Agent/空间分析超时、瓦片超时、Cesium CDN 候选链、天地图/行政区公开端点与浏览器侧 public token 占位，业务代码不散落 `import.meta.env`。
- ✅ **已验证**：`CheckConfigRegistry.py` 7 项全绿（catalog 107 key、前端 VITE 使用 10 个）；编辑后端文件 `py_compile` 通过。详见[日志](../LLM_record/26-07/2026-07-27/2026-07-27-l1-env-config-hardcode-cleanup.md)

### V3.4.65 (2026-07-27) — 体积云颗粒感画质旋钮

- ☁️ 体积云流畅/均衡档颗粒感优化：提高低/中档 `cloudResolutionScale` 与主采样步数，降低最小采样步长和远距步长增幅；工具面板新增「云渲染分辨率 / 最小采样步长 / 远距步长增幅」三个画质旋钮，可在不切极致档的情况下现场微调颗粒感。详见 `Docs/LLM_record/26-07/2026-07-27/2026-07-27-cloud-quality-grain-ui-tuning.md`

### V3.4.64 (2026-07-27) — requestRenderMode P2+P3 收官：按需渲染正式生效（总开关置 true）

L3 延续（同方案 [`Docs/TODO/requestrendermode-plan.md`](../TODO/requestrendermode-plan.md)；用户明示「不用请求批准，直接全部执行」授权 P2/P3）。**按需渲染自本版起真实生效**：「3D 静止 + 四特效全关」渲染频率降至 ~0.2Hz（5s 时钟兜底重渲）、GPU 满载→近零；体积云/风场/流体/漫游任一开启即自动回连续渲染，关闭后回降载。

- ⚡ `useCesiumRenderMode.js` 总开关 `ENABLE_REQUEST_RENDER_MODE` false→**true**（回退方式不变：改回 false 一行恢复恒连续渲染）。
- 🔍 **全库高危写点静态普查**（沙盒无 GPU，以逐类读码核对替代实机冒烟）：大气/光照/美化/数据源显隐透明度/OSM 与谷歌 3D Tiles 开关/地形切换/太阳光照/高级特效/分析工具等 11 类直改点——除一处外均已带显式 `requestRender`（前几轮铺垫，全库约 50 处/15 文件）或走 Entity API 自动触发通道；**唯一缺口**：3D Tiles 材质模式切换直写 `tileset.style`（`useCesiumDataOpsHandlers`）→ 补 requestRender，配套 `useCesiumDataImport` 透出既有 `getViewer` 访问器。
- 🎛️ P3 定夺：`maximumRenderTimeChange` 维持 5s（命名常量即调参入口；时间轴拖动/高倍速播放因模拟时间越阈值自然回逐帧，跟手性无损）；`debugShowFramesPerSecond` **保留常开**并加语义注释——按需模式下空闲低 FPS = 省电特性非卡顿，交互回升，兼作生效验证仪表。
- ⚠️ 实机验收移交用户（冒烟清单见日志）：重点盯「操作后画面不刷新、动一下相机才变」，发现即补一处 requestRender 或总开关回退。详见 `Docs/LLM_record/26-07/2026-07-27/2026-07-27-requestrendermode-p2-enable.md`

### V3.4.63 (2026-07-27) — Agent `override_base_url` 平台 Key 外泄修复（规划 P1-4 [P0 安全]，L3）+ 07-26 版本账目对账

> L3 任务，方案文档 [`Docs/TODO/agent-override-key-leak-plan.md`](../TODO/agent-override-key-leak-plan.md)，用户批准口径「a+c，白名单默认关」。

- 🔐 **[P0] 平台 Key 外泄面切断**：任意**游客或登录用户**发一个带 `override_base_url` 但不带 `override_api_key` 的请求，后端即把平台 Key 以 `Authorization: Bearer` 发往调用方指定地址（`/chat/completions` 与 `/models` 两处 key/base_url 回退各自独立、无耦合校验）；更严重的是无 override key 时 candidates = 平台主 Key + **全部备用 Key**，上游返 401 触发 `_is_agent_key_retryable_error` 逐个换 Key 重发 → 攻击者恒返 401 即可**单次请求收割整个 Key 池**；`/models` 还是 GET query 形式且不耗配额，利用成本极低。新增 `utils._validate_override_base_url` 单点护栏：**成对校验**（无 key 即 400 fail-closed）+ 协议仅 https + 私网/回环/链路本地/保留段拒绝 + 可选 host 白名单，两端点接入。
- 🕳️ **IP 字面量绕过一并堵死**：新增 `_coerce_ip_literal` 按 C 库 `inet_aton` 语义归一——`2130706433` / `0x7f000001` / `127.1` / `0177.0.0.1` 全部还原为 `127.0.0.1`（P1-4 点名的绕过手法），另拒 `.local`/`.internal`/`.home.arpa`/`.localhost` 后缀与 `[::1]`。
- 🚪 **收尾审计发现的第二道门（方案文档未列，一并修复）**：`base_url` 还有「写库再读回」这条持久化入口——
  `POST /user-config` 的 `base_url` 原仅限长度且与 `api_key` **互相独立**，可只存 base_url 不存 Key，
  之后 runtime 以用户行优先返回该地址而 Key 落到平台 Key 全池 → **与 override 等价的泄漏，且一次写入长期生效**。
  修复：写入侧用**同一护栏函数**校验（key 取本次提交或库中已存）；读回侧 `_resolve_effective_agent_runtime_sync`
  改为个人 base_url **仅在配了个人 Key 时生效**（兜住护栏上线前的存量历史行，无 Key 时回退平台上游）。
- 🧹 **`/models` 全局缓存污染**：原无条件把上游返回写入全局 `system_config.agent_available_models`，
  调用方用自选服务商查询即可污染**其他用户**的 fallback 列表与 `/chat/config` 展示；改为仅在未使用 override 时缓存。
- 🖥️ **前端成对透传**（`useChatAgentConfig.js` 两处）：草稿模式原为两条独立 `if`，用户只填 Base URL 不填 Key 即命中泄漏路径；改为二者齐备才透传。
- ⚙️ **新增 L1 key（默认即安全）**：`AGENT_ALLOWED_BASE_URL_HOSTS`（留空=不限制服务商域名，保留「个人 Key 接任意 OpenAI 兼容服务商」能力）、`AGENT_ALLOW_INSECURE_BASE_URL`（默认 false，仅本地回环 http 调试用）；catalog + 根 `.env.example` 已登记。
- 📌 **规划口径纠偏**（逐行核实）：`/chat/default-proxy` **不成立**（只接受 `override_model`，key/base_url 恒读 DB）；规划漏列的 `/chat/proxy` 无 Key 泄漏（调用方必须自带 key）→ 归 P1-4 SSRF 项。已核实排除：httpx 锁定 0.28.1，跨源重定向会剥离 Authorization → 「白名单 host 302 偷 Key」不成立。
- 🧾 **07-26 版本账目对账**（附带 L1 文档修补）：五会话并行连环撞号致 CHANGELOG 空洞，按 §5 以完成时序统一重排补录（53′→**V3.4.55**、54′→**V3.4.56**、55′→**V3.4.57**、56′→**V3.4.58**），补 V3.4.52 漏写条目，为 **V3.4.48 登记空号说明**（无日志认领，永久空置）；四份日志头同步注记。规划文档三条顺带发现销项（含 P0-2 经全量 `tsc` 复核确认业务代码零错误）。
- ✅ **验证**：护栏定向单测 **23/23**（成对校验 / 协议 / 私网 11 例含各类绕过写法 / 白名单开关 / 回环 http / 空值透传）、四文件 `py_compile`、双门禁全绿（catalog 58 key、结构树 390/390）、ESLint 与全量 `tsc` 零问题。**⏭️ 待用户实机回归**：默认模式对话、个人 Key 模式模型列表与对话、只填 Base URL 应 400、本地 ollama 需置 `AGENT_ALLOW_INSECURE_BASE_URL=true`。详见[日志](../LLM_record/26-07/2026-07-27/2026-07-27-agent-override-base-url-key-leak-fix.md)

### V3.4.62 (2026-07-27) — 3D 属性表视图筛选接通核验收账（规划 P0-4 B4，B 簇全清）

- ✅ **B4 核验闭环（零代码改动，收账）**：前序会话已完成实现但收尾中断（与 B1/B3 同模式），本版补齐账目。五侧静态核验全绿——`useCesiumAttrViewExtentSync.js`（`camera.moveEnd` + start 首帧推送，`computeViewRectangle` scratch 复用 → 4326 度值直写 attrStore；望天/跨反经线诚实写 null 降级）→ `CesiumContainer` 生命周期（ready 后 start，retry-reset 与 unmount 双路 stop）→ `AttributeTable` 动态 `viewFilterUnavailable` 态（替代原「3D 不可用」硬提示，复选框不再按引擎门控）→ `setMapExtent` 归一层 4326 直传 → 2D 回喂三路径（init 尾/勾选 watch/moveend）。与 V3.4.61 requestRenderMode 交叉核验：moveEnd 系相机事件不受按需渲染影响。
- 🗑️ **并行撞车副本复核**：`useCesiumAttrExtentSync.js`（两会话各自实现 B4 的重复产物）全 src 引用扫描 = 0；当前文件系统已不存在该旧副本，结构树仅保留实际接线的 `useCesiumAttrViewExtentSync.js`。
- 🏁 **P0-4 B 簇（B1–B6）代码侧全清**。V3.5.0 里程碑建议在 B1/B3/B4 三份实机清单（4+7+6 步）验证通过后打线。实机 6 步清单见日志。详见 `Docs/LLM_record/26-07/2026-07-27/2026-07-27-b4-cesium-view-extent-sync-closeout.md`

### V3.4.61 (2026-07-27) — requestRenderMode 按需渲染 P1：计数器管理器 + 四特效接入（总开关默认关）

L3 任务（方案 [`Docs/TODO/requestrendermode-plan.md`](../TODO/requestrendermode-plan.md) 用户批准 P1；渲染/性能流水路线图 2.2）。应用此前恒连续渲染，静止无特效时 GPU 满负荷；本版铺好按需渲染接线，**总开关默认 false、零行为变化**，P2 置 true 后「3D 静止+四特效全关」GPU 满载→近零。

- ⚡ 新增 `frontend/src/components/Cesium/composables/interaction/useCesiumRenderMode.js`：连续渲染引用计数管理器——`acquireContinuous(viewer, tag)`/`releaseContinuous(viewer, tag)` 计数 >0 保持连续渲染，归零切 `requestRenderMode=true` + `maximumRenderTimeChange=5`（秒，时钟推进超阈值自动重渲：太阳光照 ~0.2Hz 低频刷新、时间轴拖动/播放跟手）+ 切换补渲一帧；保险四件套：总开关 `ENABLE_REQUEST_RENDER_MODE` 默认 false（一行回退）、异常 fail-open 回退连续、release 容忍未配对（失败清理路径安全）、WeakMap 按 viewer 隔离（token 重试重建无残留）。
- 🔗 四逐帧特效生命周期成对接入：体积云 `setupCloudIntegration`（管线就绪 acquire / teardown 与 init 失败 catch 双路 release）、风场 `useCesiumWind`（实例就绪 / clearWind2D）、流体 `FluidSimulationPanel`（FluidRenderer 构造后 / `destroyFluidOnly`——挂点自方案的 cleanup(true) 微调，因重建水体路径不经 cleanup 会泄漏计数）、人物漫游 `usePlayerController`（init 成功 / stopPlayer 实例分支）。
- 🔍 方案开放问题定性：`CesiumAdvancedEffects` 三 stage（高度雾/HBAO/移轴）相机驱动无时间动画→**不接计数**，仅在开关切换处补 `requestSceneRender()`（按需模式下开关立即生效，连续模式无害）；`useCesiumFrameRate` 被动采样不阻断（FPS 语义变化留 P3）；热带浅水为独立 Three.js canvas 不消费 Cesium 帧，无需接入。
- ✅ 验证：ESLint 8 触改文件 0 error/0 warning；tsc 无新增报错；6 处新 import 路径脚本解析全过；门禁双绿（结构树 390 项）。⚠️ 沙盒 vite build 因 Windows node_modules 缺 Linux rollup 二进制不可执行（环境限制），构建冒烟与全部 GPU 行为验证待用户实机。详见 `Docs/LLM_record/26-07/2026-07-27/2026-07-27-requestrendermode-p1.md`

### V3.4.60 (2026-07-27) — 在线人数真实化：会话活跃心跳（未过期 ≠ 在线）

- 🐛 用户反馈账号面板「X 人在线」如随机数。排查确认**非随机非 mock**，系统计语义缺陷：「在线」= `sessions` 未过期会话计数，而 TTL=72h → 3 天内登录未退出者恒被计在线。纯后端修复（前端零改动、零新端点）：`sessions` 表迁移新增 `last_seen_at` 活跃时间戳（存量回填 created_at + `idx_sessions_last_seen` 索引）；鉴权单点 `_get_session_sync` 节流触活（60s 内不重复写，防写放大）；`/statistics/realtime` 三条在线查询（`online_users`/`online_sessions`/`online_by_role`）改判「未过期 **且** 5 分钟内有鉴权请求」。心跳载体为现有轮询：公告栏 20s / 账号面板 30s（均 require_login），App 开着即在线、关闭 ≤5 分钟内消失。窗口(300s)≫节流(60s)+轮询(30s)，活跃用户无误判离线风险。沙盒临时 DB 实测 7 项断言全过（初始化/节流/触活/窗口判定/空串兜底/迁移幂等/旧库回填），门禁双绿。详见 `Docs/LLM_record/26-07/2026-07-27/2026-07-27-online-users-presence-fix.md`

### V3.4.59 (2026-07-27) — 属性表 Shift range 多选链路核验收账 + 高亮查找器扫描兜底（规划 P0-4 B3）

- ✅ **B3 核验闭环**：Shift range 端到端五环静态核验全绿——表侧锚点捕获与 `resolveRangeFeatureIds`（按排序/搜索/筛选后的 displayRows 展示顺序取区间，锚点失效降级 replace）→ MapContainer `@focus-feature` 接线 → `useMapUIEventHandlers` range+featureIds 批量分支 → `batchHighlightManagedFeatures` append → `featureStyleStore` range「保留旧高亮仅追加」契约；`resolveRangeTargets` 回调经全库扫描确认闲置属设计（表侧已自行解析区间）非断链。连续 Shift 为续接并集语义（含在待实机验证清单，见日志 7 步）。
- 🐛 **高亮链路查找器补扫描兜底**（核验中发现的真实缺口，本次唯一代码改动）：`MapContainer.vue` 内联 `findManagedFeature` 仅 `getFeatureById`，属性 ID（OBJECTID/FID）未写入 OL id 的存量要素高亮/多选**静默丢目标**（缩放链路早有扫描兜底不受影响）；补 `getId()/get('_gid')` 全量扫描退化路径（`??` 判空保数值 0，与 B1 语义对齐），命中路径零行为变化。**P0-4 B 簇仅剩 B4**，B4 完成且 B1/B3 实机验证通过后打 V3.5.0。详见 `Docs/LLM_record/26-07/2026-07-27/2026-07-27-b3-shift-range-verify-and-highlight-lookup-fix.md`

### V3.4.58 (2026-07-26) — CesiumToolPanel 组件域令牌收敛（观感零变化）

> 📌 2026-07-27 对账补录：本条及以下 V3.4.55–57 三条系 07-26 五会话并行连环撞号导致的 CHANGELOG 空洞，按 Force_command §5「后完成者顺延」以完成时序统一重排补录（53′→55、54′→56、55′→57、56′→58），各原始日志头已同步注记。

- 🎨 新增 `frontend/src/assets/cesium-tool-theme.css`（`--ctp-` 前缀：29 个 `-rgb` 基色 + 19 个实色令牌；文件头声明独立暗色身份不随绿/蓝主题联动）；`CesiumToolPanel.vue` style 块 **218 处色值字面量脚本化收编**（162 处 rgba 保 α 捕获回填 + 56 处 hex，5 处防御性 var 兜底豁免；规划原口径 56 处经实测纠偏为 232 处并获用户确认全量收编）；`App.vue` 一行 `@import`；`frontend-structure.md` 登记。**等值还原证明**：全部 var 反代回字面量后与改前文件逐字节一致 → 观感零变化。为 P3-1 拆分子组件预铺域令牌。详见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-cesium-tool-panel-token-merge.md`
- 📌 原记 V3.4.56（自注「以 README 实际为准」），对账正式取号 V3.4.58。

### V3.4.57 (2026-07-26) — 账号面板头部白字不可见修复（blur-bg 源序覆盖，死类清除）

- 🐛 用户实机回归首报（P0-1 欠账第一个兑现）：V3.4.28 遗留玻璃拟态死类 `.blur-bg { background: transparent }` 源序晚于 `.panel-header` 品牌渐变、同特异性后到者胜 → **头部渐变横幅自 V3.4.28 起即被清空**，昵称/邮箱/角色三行白字落白底不可读。选死类清除：模板 3 处 class 摘除 + 规则删除原位留注释防复发；页脚/头像经源序与特异性核验零变化，全屏态渐变同步恢复。详见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-account-panel-header-blurbg-fix.md`
- 📌 原记 V3.4.55，对账顺延。

### V3.4.56 (2026-07-26) — 属性表稳定要素 ID：兜底 ID 写回要素本体（规划 P0-4 B1）

- 🐛 无稳定 id 图层（无 OBJECTID/FID、导入未 setId）排序/筛选/刷新后行序变化 → 选中/高亮**错位到别的要素**，且行序兜底 ID map 侧无法反解、属性表→地图定位链路整体不可达。`useLayerMetadataNormalization.js` 新增 `readExistingFeatureId`（候选链 getId→`_gid`→id→properties 系，`??` 判空保 `OBJECTID=0`）与 `ensureStableFeatureId`（缺失则生成 `gid_` 唯一 ID 并**写回要素本体**：OL Feature `set('_gid',id,true)`+`setId`、普通对象直写 `_gid` 并镜像 properties；不可写场景退回原兜底不劣化）；`useAttrStore.ts` 删本地 toFeatureId 索引副本改走归一化单点导出。**P0-4 B 簇仅剩 B3/B4**。详见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-b1-stable-feature-id-writeback.md`
- 📌 原记 V3.4.54（与加载性能会话撞号），对账顺延。

### V3.4.55 (2026-07-26) — 账号中心浮层高度溢出修复 + 头部瘦身

- 🐛 非全屏账号面板 `.panel-body` 以视口 vh 定高（`min(58vh,540px)`）而实际约束在 `.map-wrapper` 内 + `min-height:280px` 硬地板 → 小窗口下总高溢出、页脚「退出系统」被 `overflow:hidden` 裁掉（功能缺陷）。高度基准换父容器：宿主 `:deep` 封顶 `calc(100% - 10px)`（全屏段 `max-height:none` 豁免、移动端对称 16px）、`.panel-body` 去 vh/去硬地板改唯一 `flex:1` 伸缩区、头/速览/导航/页脚四区块 `flex-shrink:0` 锁定；头部瘦身 92→60px（头像 56→44、`header-btns` 竖排→横排消 74px 支撑柱），全屏态零触碰。纯 `<style>` 改动。详见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-account-panel-height-fix.md`
- 📌 原记 V3.4.53（与后端安全批次撞号），对账顺延。

### V3.4.54 (2026-07-26) — 前端加载性能优化：登录页首屏 −79% + 部署死重清理 + Cesium 多源回退

L3 任务（方案文档 [`Docs/TODO/loading-performance-optimization-plan.md`](../TODO/loading-performance-optimization-plan.md)，用户批准批次 1+2 + 录屏关闭项）。真实构建实测：首屏（登录页）gzip JS **404KB → 86.5KB（−79%）**，阻塞 CSS 只剩 index.css 一项。

- 🚀 **切断 OpenLayers 混入登录页入口的两条打包链**：链 B——新建 `constants/basemap/basemapPresets.ts`（预设 id/label/stack + `URL_LAYER_OPTIONS` 纯数据抽离，零 ol 依赖），`useUrlParamStore` 改从纯数据层导入，`basemapConfig/basemapResolver` 原位 re-export 保持全部旧 import 路径兼容；链 A——`useAttrStore` 绕开 `composables/map/features` barrel（约 40 个 feature 全量 re-export）直连 `useLayerMetadataNormalization`，该模块内 `ol/extent getCenter`、`ol/proj toLonLat` 以本地纯函数替代（与 ol 原函数抽样比对**逐位等价**，偏差 0），符合「stores 禁止依赖 OL」分层边界。构建后 `dist/index.html` 不再 modulepreload `vendor-ol-all`（gzip 178KB）与 `vendor-libs`，ol CSS 退出阻塞列表。
- 📦 **vendor-libs 兜底桶拆分**（290KB→47KB）：`zstddec`（geotiff 传递依赖，manualChunks 漏配，gzip 63KB）归入 `vendor-geotiff`；`knockout`/`@math.gl`/`@probe.gl` 独立为懒加载 `vendor-cesium-deps`（gzip 32KB）并加入 SKIP_PRELOAD。
- 💤 **金句库懒加载**：`useMessage` 的 60KB 金句数据改动态 import（页面 load 后 2.5s 空闲预取 + 取句时兜底文案），退出入口 chunk。
- 🎨 **Font Awesome 非阻塞**：`media="print"` + onload 交换 + noscript 兜底，仍走 BootCDN；favicon 由 79.5KB webp 换 4.3KB favicon.ico（顶栏高清 logo 改为 TopBar 独立引用，互不影响）；`<html lang="zh-CN">` 补齐。
- 🧹 **ShareData 死重清理（dist −7.5MB）**：移除 `useSharedResourceLoader` 的 `import.meta.glob`（会把 ShareData 全目录再拷进 dist/assets 且哈希副本零引用），新建 `frontend/scripts/generate-sharedata-manifest.mjs` 于 vite 配置求值时自动生成 `public/ShareData/manifest.json`（dev/build/build:* 全覆盖，产物确定性无 git 噪声），loader 原 manifest 降级路径转正。
- 🛰️ **Cesium CDN 三源回退**（治国内加载）：cesium-shim 单一 jsDelivr（国内时常不可达，失败即 Cesium 永不加载）改为 jsDelivr → BootCDN（⚠️ 该源 1.132.0 可用性未验证，404 自动跳过）→ unpkg（已验证）逐源尝试，10s 超时切换，`window.CESIUM_BASE_URL` 随生效源同步保证 Workers/Assets/widgets.css 同源（`cesiumRuntime` 样式加载改用 `getActiveCesiumBaseUrl()`）。
- 📉 **51.la `screenRecord: true → false`**（用户批准）：录屏采集持续吃运行时性能。
- 📐 基线勘误：此前「dist ≈121MB」为目录清单 2000 条截断假象，真实 dist ≈388MB（tiles 307MB 为主，按需加载不影响首屏）。
- ⏭️ 待用户实机验证：登录页打开与登录跳转、2D/3D 地图、共享资源面板加载 KML/KMZ、断源模拟 Cesium 回退。`tsc --noEmit` 零新增报错、ESLint 零新增问题、双门禁通过（云端沙盒执行）。
- ⏭️ 版本号顺延说明：实施期间并行会话占用 V3.4.53（后端安全批次），按规范「撞车后完成者顺延」取 V3.4.54。


### V3.4.53 (2026-07-26) — 后端 code review 安全与正确性 Bug 批次（14 项，L2）

> 用户要求「后端代码 code review 一下，修复优化」，口径经确认为「明确 bug + 低风险优化」（中大型重构仅登记 TODO）。逐条读实际代码核实触发链后修复，无 schema 变更 / 无新增删除文件 / 无新增配置 key / 无依赖增删 → 两门禁与结构树不受影响。第一轮 S1–S11，第二轮（承「继续检查并优化」指令）追加 S12–S14。

- 🔐 **鉴权（P0×2）**：
  - **验证码耗尽即删（S1）**：`verify_code` 尝试次数耗尽由置 `used=1` 改为 `DELETE`——`is_email_verified_for_purpose` 把任意 `used=1` 视为「已验证成功」，攻击者对他人未注册邮箱连发 6 次错误码即可把码「烧成」`used=1`，再免验证码 `/register` 占用该邮箱（并因 OAuth 按已验证邮箱自动关联而放大为登录劫持）。改后 `used=1` 重新成为验证成功的唯一凭据。
  - **OAuth ticket 先校验后条件删（S2）**：`consume_oauth_ticket` 原「先无条件 DELETE 再判 provider」，登录换票按 (`google`,`github`) 试探同一 ticket → google 探测即删票并抛「类型不匹配」，github 探测已查无此票，**GitHub 登录 100% 失败**。改为先校验 kind/provider/过期、匹配后再带 `AND kind=? AND provider=?` 条件删除（保留 rowcount 唯一占有语义），不匹配不删。
- 🛡️ **系统监控（P0）**：`/monitor/logs/stream` 原无任何鉴权，匿名即可实时抓取全进程 logging（含 INFO 打印的邮箱等 PII、异常堆栈），线上还以 L3 `LOG` token 代理 Space 日志；CORS 又为 `*`。加 `Depends(require_admin)`（S3）。**前端管理员日志面板须在 EventSource URL 带 `?token=<会话令牌>`**（`_extract_token` 支持 query token）。
- 🐛 **崩溃与 fail-open**：
  - 非 ASCII 密码/验证码使 `hmac`/`secrets.compare_digest(str,str)` 抛 TypeError→500（并能借状态码区分保留账号）；改 bytes 比较（S4，login 2 处 + verify 1 处）。
  - `get_bool(default=False)` 无法区分「显式传 False」与「未传」，从不回退 catalog 默认 → 如 `PROXY_VERIFY_SSL` 未设环境变量时静默关闭 TLS 校验；改 `Optional[bool]=None` 并回退 catalog（S5，与 get_int/get_float 对齐）。
- 🤖 **AI 对话**：`_call_upstream_chat_with_key_candidates` 未透传 `top_p`/`extra_body`（thinking 配置从未到达上游）（S6）；`extra_body` 禁用键补 `stream`/`stream_options`（防覆盖 `stream=False` 致 `response.json()` 解析 502 但已计费）（S12）；`temperature/top_p=0` 被 `x or DEFAULT` 折叠回默认（确定性输出失效）（S7，4 处）；高德 IP 定位 URL 由 f-string 改 `params=`（`ip` 源自可控 XFF，`#`/`&` 会截断 key 或注入参数）（S13）。
- 🗺️ **空间分析**：不支持的 operation 主动抛的 `HTTPException(400)` 被同 `try` 的 `except Exception` 兜底重写为 500 + 误导堆栈，插 `except HTTPException: raise`（S8）；泰森多边形用 `convex_hull` 判退化——恰好 2 点/共线其凸包必为 LineString→命中退化分支必报错，违背「至少 2 点」契约，改用 `bounds` 构造带 padding 的 `box` envelope（S9）。
- 📊 **访问统计**：游客身份记录 `guest_uid UNIQUE` 用「先 SELECT 判存在再分支 INSERT」，并发首访双方均判不存在 → 后一 INSERT 触发 IntegrityError→500 且访问丢失，改单条 `ON CONFLICT(guest_uid) DO UPDATE` 原子 UPSERT（S10）；`online_by_role` 按 role 聚合并传 `normalize_role(role, None)`——admin 仅由用户名判定，故在线管理员恒被并入 registered、「在线管理员」计数恒 0，改 `GROUP BY username, role` 后带 username 归一（S14）。
- 🔁 **验证码节流（S11）**：30 秒发送节流仅统计 `used=0 且未过期` 的码，码被验证/烧毁置 `used=1` 后不再计入 → 「烧码后立即重发」可绕过节流刷邮件；改为统计 30 秒内任意发送记录。
- ✅ **验证**：10 改动文件 `py_compile` + 全 backend `compileall` 通过；`CheckConfigRegistry.py` 7/7 全绿；scratch 单测验证 UPSERT 语义（visit_count 累加 / first_seen 保留 / 无 IntegrityError）与 bytes 比较不再抛 TypeError。**待用户本机实机回归**（沙盒无 vite/uvicorn/shapely）：见日志 §7 逐条清单，尤其 S3 前端 token 联动、S2 GitHub 登录、S9 泰森 2 点/共线。
- 📌 **未纳入本批、已登记 `Docs/TODO/bugfix-optimization-plan.md`**（需设计决策 / 行为变更 / 实机验证）：代理 SSRF 加固（`/proxy/**`、`gcj2wgs`、`download_xyz` 无 host 白名单 + 私网 IP 过滤可被非点分十进制绕过 + 无响应体大小上限 + 无界磁盘缓存）、agent `override_base_url` 致平台 Key 外泄、Agent 配额 check-then-consume 竞态与可伪造 quota_subject、SQLite 每请求新建连接 + 重复 DDL、损坏恢复锁外竞态、SMTP 明文、`require_login` 的 `?s=1` 旁路、游客 uid 随机化配额旁路。**建议下一会话最高优先级：代理 SSRF 与 agent override 凭据外泄**。
- 📝 详见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-backend-security-bugfix-batch.md`。

### V3.4.52 (2026-07-26) — 规划 P2 双项收官 + 会话交接

> 📌 2026-07-27 对账补录：README 版本表已有本行而 CHANGELOG 漏写（原会话未收尾完整），据其日志补齐。

- 🎨 **P2-2 矢量透明度扩 `PolylineOutlineMaterialProperty`**：描边线材质 color+outlineColor 双通道原色快照缩放，材质白名单与写回分流泛化；贴图/特效材质维持防守跳过。
- ✅ **P2-1 罗盘元数据定性关闭（问题不成立）**：静态 import 链核验 `compass-data.ts` 与 `twentyEightConstellations.ts`（合计 ~4400 行）全 src 零引用——死文件不进任何 bundle，原「疑似进主包」假设不成立；物理清理归 P3-3 本机执行清单（挂载盘禁 rm）。
- 📋 新增跨会话启动提示词 `Docs/TODO/next-session-prompt.md`（后随 V3.4.46 规划合流删除）。详见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-p2-batch-and-session-handoff.md`

### V3.4.51 (2026-07-26) — 文档治理收口：任务启动模板重写 + 游离段落清理

- 📝 **`Docs/Example_prompt.md` 重写（43 → 约 140 行）**：定位为「用户怎么下达」，与 `Force_command.md`「Agent 怎么执行」形成闭环，不重复规范内容只做引用。含**通用开场白**（"完整阅读 Force_command.md + 先声明任务等级"，因未设自动加载入口，此句是规范生效的唯一开关）、**四类模板**（A Bug 修复 / B 功能开发含"不做什么"防范围膨胀 / C 重构 L3 显式"先出方案再动代码"+"只搬不改"+分批可回滚 / D 审计 L0 只读并按 P0–P3 汇入规划文档）、**8 项收尾验收表**（对照 DoD 与交接块）。模板类型与 L0–L3 分级一一对应，选模板即等于定级。
- 🧹 **清理三处过期指向**：原文第 3 行引用 **`/Docs/Force_prompt.md`（该文件不存在）**，与 V3.4.44 发现的 `CLAUDE.md` 幽灵引用同源；约束 3「强制更新三个 README 文件树」已随 V3.4.44 废除（三 README `grep -c "├──"` 均为 0）；约束 4 日志路径 `yy-mm-dd/` 缺一级。正文空标题为 2026-04-19 配额任务的一次性填空残留，无复用价值。
- 📐 **`Guide/dev-conventions.md`**：删除尾部 15 行游离段落（「✅ 使用者收益」「🔄 兼容性说明」——版本发布说明粘贴残留，按 SSOT 属 CHANGELOG 内容），替换为「相关文档」导航表（Force_command / Example_prompt / handover / dev-guide）。该删除于 V3.4.44 时按新规范硬边界「禁止删除范围外内容」列为遗留项，本次经用户确认后执行，为规范实际生效的一次记录。
- 🗂️ **`Guide/project-structure.md`** 两行注释纠偏：`Example_prompt.md` →「任务启动提示词模板（Bug/功能/重构/审计四类）」、`Force_command.md` →「Agent 强制执行规范（权威：分级/边界/DoD/交接块）」。
- ⏭️ 版本号顺延说明：本次任务期间并行会话连续占用 V3.4.45–V3.4.50，按规范「撞车后完成者顺延」取 V3.4.51。
- 📝 详见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-prompt-template-and-doc-cleanup.md`。

### V3.4.50 (2026-07-26) — TOC 主题变量与品牌令牌合流（规划 P2-3）

- 🎨 **24 项绿色系独立值合流**：`toc-theme.css` 中蓝主题无覆盖的绿色取值全部改为 `--brand-*` 派生——上传区 11 项（边框/拖拽/图标/进度/完成态）、边框族（light/medium/active/header/tab）、徽章四件套、卡片标题、页签激活描边、主色底 rgba；绿主题近似原值，蓝主题自动联动（此前切蓝这批全部残绿）。
- 🔒 **兼容保障**：既有 `[data-theme="blue"]` 手工覆盖块保留（优先级不受影响）；`--toc-text-primary` 与 `--text-brand-dark` 为同值直接引用化；危险色/中性灰主题无关值不动；剩余 3 个低饱和灰绿文本刻意保留（蓝主题下不刺眼）。
- 📐 **规划修正**：P2-1「Routing 面板令牌接入」经扫描证实为误判范围撤销（三面板系 SidePanel 页签内容卡而非浮层家族，无 0.95 框架签名与绿色家族残留，蓝色系为功能语义色）。
- ✅ 验证：CSS 括号配平、剩余绿色 hex 扫描（5 个均为合理保留项）、引用的 brand 变量存在性核对。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-toc-theme-token-merge.md`。

### V3.4.49 (2026-07-26) — 云分辨率运行时切换 + 流体场景准备时机 + 风场 uniform GC

- ⚡ **云分辨率切档免重开体积云**：init 预构建 split/legacy 双 shader 缓存，新增 `pipeline.setCloudResolutionScale()` 同步重建 cloud stage（remove→create→add）；重建标志经 `consumeCloudStageRebuilt()` 由集成层消费，销毁并按需重建 lensFlare 恢复 [atmosphere, aerial, cloud, flare] 链序；`cloudParamsApply` 的 cloudResolutionScale 改走该方法。切档即时生效，省一次云资源重载。
- 🎨 **流体 prepareScene 时机后移**：由"开始选点"（点按钮瞬间整屏变色）移至水体确定创建时（高度采样完成、FluidRenderer 构造前）；选点/取消阶段画面保持原样，清除/关闭还原路径不变。
- 🧹 **风场 uniform GC**：vendored index.mjs 计算/渲染 10 处 uniform 回调 `new Cartesian2` 改 scratch 复用，消除每帧小对象分配。
- 📝 日志：`Docs/LLM_record/26-07/2026-07-26/2026-07-26-round2-runtime-scale-fluid-timing.md`。

### V3.4.48 — 空号（无对应改动）

> 📌 2026-07-27 对账注记：全仓库无任何日志认领 V3.4.48——系 07-26 多会话并行期 V3.4.49 会话误判该号已被占用而跳号取 49 所致。本号**永久空置**，无对应代码或文档变更，特此登记防后续追查。

### V3.4.47 (2026-07-26) — 修复规划 P1 收官：CORS 收敛 + tileset 外观合成

- 🛡️ **P1-1 CORS 白名单收敛**：`app.py` 全局 CORS 由硬编码 `allow_origins=["*"]`（含一段废弃注释代码）收敛为经统一 loader 读取的 L1 key `CORS_ALLOWED_ORIGINS`——逗号分隔、strip + 去尾斜杠规整，留空回退 `["*"]` 保持本地零配置兼容；启用白名单时启动日志打印来源数量与清单；catalog 与根 `.env.example` 登记（生产建议：Pages 域名 + localhost 系）。
- 🎨 **P1-2 tileset「材质 × 透明度」单点合成**：`dataSourceDisplay.js` 新增 `tilesetAppearanceState`（WeakMap<tileset, {mode, alpha}> 二元状态）与 `setTilesetMaterialMode()`；`tilesetLoader.applyTilesetMaterial` 增 `alpha` 参数——heightStyle 各分层色经 `color('rgb(...)', a)` 融入透明度、pureWhite/baimo/gradient 三个 CustomShader 注入 `material.alpha = a` 并在 a<1 时显式 `CustomShaderTranslucencyMode.TRANSLUCENT`（否则不透明通道下 alpha 无效）、none+半透明走白色 style；透明度滑杆与材质切换任一变化均以完整二元组重建外观，**互不覆盖**（替代一期"最后操作生效"妥协）；`useCesiumDataOpsHandlers.handleDataSetMaterial` 收编走合成器。
- ✅ **验证**：py_compile（app/catalog）、配置门禁七项全绿、CORS 解析 3 场景断言、改动前端 3 文件 ESLint 零告警；规划文档 P1-1/P1-2 勾选——至此 P0-2/P0-3/P1-1/P1-2/P1-3 全部完成，仅剩 P0-1 实机回归（用户侧）与 P2/P3。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-p1-cors-style-batch.md`。

### V3.4.46 (2026-07-26) — 并行会话规划/交接文档合流（消除双套并存）

- 📋 **TODO 规划合一**：原并行会话 `Docs/TODO/next-sprint-bugfix-and-optimization.md` 全量并入 `Docs/TODO/bugfix-optimization-plan.md`（Force_command §2.5 指定正典）——属性表 B1–B6 落为 P0-4 簇（B2/B5/B6 标注 ✅V3.4.40，B1/B3/B4 待办）、容器二轮路线图（V3.4.29 日志）并入 P3-1、T2 分域/门禁 CI 落为 P3-3/P3-4、属性表性能项（searchText 惰性化/列宽持久化/列虚拟化）落为 P2-4；执行顺序更新并标注已完成项；确立「B 簇全清打 V3.5.0 里程碑」与「冒烟回归自动升最高优先级」口径。
- 📘 **交接文档合一**：`Docs/Guide/handover.md`（SSOT 接手导航）§7 并入并行线 6 条独有契约——Cowork 挂载盘禁 rm/mv 与 index.lock 处置、沙盒 ESLint 跑法（node 直呼 bin）、barrel 两层化单点登记与 `export *` 重名静默丢弃、属性表 revision 整体重赋值不变式、容器 factory 抽离 TDZ 核对模式、版本撞号 grep 复核；基线版本行更新。
- 🗑️ **冗余清理**：`2026-07-26-session-handover.md` 文头加「已合并」横幅转历史快照（保留防断链）；`next-sprint-bugfix-and-optimization.md` 与 `next-session-prompt.md` 删除（用户执行 git rm）。
- 📝 详见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-merge-parallel-planning-docs.md`。

### V3.4.45 (2026-07-26) — 单位制覆盖面扩展（规划 P1-2）

- 📏 **路线规划接入偏好单位制**：公交面板（候选线路里程 + 分段步行/公交距离）与驾车面板（总里程）改经 `formatDistanceMeasure`；`distanceKm: string` 字段更名 `distanceText`（带单位展示文本，TS 接口注释同步），模板硬编码 " km" 后缀清除；驾车 debug 原始值保留。
- 🚶 **3D 漫游导航 HUD 接入**：`NavGuideHUD.formatDistance` 改经统一工具，英制偏好下漫游目标距离显示 ft/mi。
- ✅ 验证：3 组件 compiler-sfc + ESLint 零告警；`distanceKm` 展示层零残留（仅存驾车解析器源数据字段，语义为 km 数值输入）。
- 📝 规划文档 P1-2 已标注部分完成（余下：空间分析参数提示/坐标面板为输入型单位，需换算逻辑另行处理）。详见 `Docs/LLM_record/26-07-26/2026-07-26-unit-system-coverage-expansion.md`。

### V3.4.44 (2026-07-26) — Agent 强制规范重写（Force_command.md v2：边界 / 流程 / DoD / 交接四段式）

- 📜 **`Docs/Force_command.md` 重写（59 → 210 行，十节结构）**：0 冲突裁决优先级（用户指令 > 本文件 > Guide 文档 > 代码惯例，发现矛盾必须停止上报）· 1 **任务分级 L0–L3**（咨询 / 微改 ≤20 行 / 常规 / 架构级须先批准方案）· 2 **8 条硬边界禁止清单** · 3 四阶段 SOP（分析 → 文档先行 → 实施 → 收尾）· 4 **SSOT 单一事实来源表**（9 类信息 → 唯一权威文件）· 5 版本号规则 · 6 日志唯一路径与 11 项必含章节 · 7 **DoD 完成清单**（10 项，含门禁必过）· 8 **会话交接块**固定格式 · 9–10 违规处置与规范自维护。
- 🔧 **修正四处与仓库脱节的过期条款**：① 原第 5 条"必须同步三个 README 的文件结构树"——实际三个 README `grep -c "├──"` 均为 0，权威树在 `Guide/project-structure.md` / `frontend-structure.md` / `backend-structure.md`，且原条款第 21 行又写"唯一文件树记录是 project-structure.md"，同一条内部自相矛盾；② 日志路径 `LLM_record/yy-mm-dd/` 缺一级，实际为两级且已漂移出 `26-05/26-05-01/`、`26-06/06-27/`（缺年）、`26-07-26/`（平铺 44 文件）三种写法；③ 仓库已有门禁脚本 `CheckStructureTree.py` / `CheckConfigRegistry.py`（`LocalDev.bat` 已接入）而规范全文未提，Agent 无从知晓；④ "同日大版本只更新一次"与同日 V3.4.38→43 连续递增的现状矛盾。
- 🛡️ **针对 LLM 失效模式设防**：禁止臆造 API / 字段 / 配置 key / 路径（未确认标 `⚠️ 未验证`）、禁止未实机运行即写"已测试通过"（日志测试方案强制拆「Agent 已执行」与「待用户验证」两栏）、禁止静默跳过做不到的事、禁止越权扩大范围（顺带发现记入 TODO 而非顺手改）。
- 🔁 **新增会话交接块**（版本 / 等级 / 改动清单 / 日志路径 / 门禁结果 / 待用户操作 / 遗留风险 / 下一步入手点），使下一会话可零成本接续——此前规范以"顺利交接"为目标却未规定交接产物。
- 📐 **`Docs/Guide/dev-conventions.md` 同步**：「强制规范」小节标题由「来自 CLAUDE.md」（该文件在仓库中不存在，长期错误指向）改为「摘要」并声明权威版本与冲突时的取舍，6 条扩为 11 条逐条对齐；「提交前检查」小节补入两个门禁脚本命令与"非零退出必须修到通过"要求（原小节仅有 `docker-compose up`）。
- 🗂️ **历史日志目录不迁移**：旧写法保持原样（CHANGELOG 已有大量指向链接，迁移将造成批量死链），以"新建一律合规"而非"存量重整"收敛漂移。
- ⏭️ 版本号顺延说明：本次任务进行期间另一会话已占用 V3.4.42 / V3.4.43，按规范"撞车后完成者顺延"取 V3.4.44。
- 📝 详见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-force-command-rewrite.md`（新格式首例）。

### V3.4.43 (2026-07-26) — 修复规划 Sprint 首批落地（P0-2 / P0-3 / P1-3）

- 🔧 **P0-2 类型断裂修复**：`stores/layer/layerHelpers.ts` 的 `StandardLayerCapabilities` 补 `edit?: boolean` 声明（V3.4.9 编辑泛化引入 `capabilities.edit` 消费但未声明，为全库唯一 tsc 业务错误）；`tsc --noEmit` 过滤 cesium 环境噪音后业务代码归零。
- 🗄️ **P0-3 OAuth ticket 落库（多 worker 安全）**：`api/auth/schema.py` 新增 `oauth_tickets` 表（ticket PK / kind / provider / payload JSON / expires_at + 过期索引）；`oauth.py` 的 `create_oauth_ticket` 落库并顺带清理过期行，`consume_oauth_ticket` 以 DELETE rowcount 判定唯一占有（并发/跨 worker 同票仅一方成功），过期与类型不匹配均 400 且票已销毁防重试爆破；移除进程内存 dict 与 threading 锁。内存 SQLite 语义单测 5 场景（正常消费/重复消费/类型不匹配/过期/创建时清理）全过。
- 🧹 **P1-3 日志卫生**：前端业务代码 `console.log` 归零——vendored `cesium-navigation/ResetViewNavigationControl` catch 分支 log→warn 并携带错误对象；`useMapSwipeTest.ts`（8 处）定性为自带 `eslint-disable no-console` 声明的开发测试工具（无生产引用），保留不改。
- ✅ **验证**：py_compile（oauth/schema）+ ESLint 改动文件零告警 + 配置门禁七项全绿 + 规划文档三项勾选（含版本与日志链接）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-p0-fixes-batch.md`。

### V3.4.42 (2026-07-26) — 天空 Tyndall 伪值输入修复 + GeoTerrain 语义 + BSM 层参数运行时同步

- 🐛 **天空 shadowLength 伪值(移植遗留正确性 bug)**:AtmospherePostProcess 默认 `_shadowLengthEnabled=true` 而管线从未注入纹理,uniform 兜底到 transmittance LUT → 天空辐射每帧被喂入"把透射率查找表当阴影长度"的伪值(0~2.5km 随屏幕 UV 变化)。修复:启用门控改为"开关且纹理存在";修复后 BSM 开启落入 march 兜底 → 仅消费像素(isSky/applyGround)执行、步数 64→24,天空丁达尔由垃圾输入变为正确 BSM 暗带。
- 🐛 **GeoTerrainProvider childTileMask 语义修正**:`_rectangles` 恒空 → mask 恒 0 与 getTileDataAvailable 恒 true 矛盾,靠 Cesium availability 优先才未出错;改为 `level+1 < bottomLevel ? 15 : 0` 明确语义并删除死代码。
- 🐛 **BSM 层高/密度剖面运行时同步**:面板改层高后云影层高不再错位(此前 pass 创建后固化);经 updateDynamicParams 值级检测接入签名门控,不变零开销。
- 📝 1.4 天地图 bottomLevel 放宽评估:留待真机验证,记录于日志。日志按 Force_command v2 新路径:`Docs/LLM_record/26-07/2026-07-26/2026-07-26-round1-tyndall-terrain-bsm.md`。

### V3.4.41 (2026-07-26) — P0 静态打靶：两项预判 bug 证实与修复

- 🐛 **偏好默认底图特殊 preset 过滤**：`custom`（需配套 URL）与 `local_tiles_preset`（依赖本地环境）不可作为偏好——store 新增 `isBasemapPreferenceSelectable` + `readCachedPreferredBasemap` 读取时过滤（已存脏值刷新即免疫，2D/3D 消费方零改动自动生效），偏好下拉同步过滤防再存；过滤断言 4/4 通过。
- 🐛 **账号中心全屏层级还原**：z-index 令牌化时 3000→2200 丢失整屏覆盖语义，扫描证实与三处浮层同层（其一 !important）；theme.css 新增 `--z-overlay-top: 2400` 档，全屏账号中心改用。
- ✅ 验证：compiler-sfc/TS transpile/ESLint 零告警；规划文档 P0 表已标注两项结论，其余三项待实机（Chrome 扩展连接后执行）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-p0-static-bugfixes.md`。

### V3.4.40 (2026-07-26) — Phase 1 速胜三项（B2 extent 滞后 / B5 注释纠偏 / B6 统计字段记忆）

- 🐛 **B2 · 几何编辑后视图筛选用过期范围**：features 重赋值 → revision 递增 → 慢路径重建，但内容签名不含几何 → 签名相同 → 新快照被守卫拒绝替换 → extent 残留。修复：`upsertDatasetSnapshot` 写回缓存前判定 `revisionChanged`，revision 已变化时以上游契约为准强制替换，签名兜底仅服务于无 revision 来源。
- 🆕 **B6 · 属性表统计字段按图层记忆**：组件内 `statsFieldMemory` Map，切回图层恢复上次选择（字段仍存在时），否则回退首个数值列。
- 📝 **B5 · email_service 注释纠偏**：`_smtp_config` 文档字符串改为 lru_cache 快照语义（配置变更需重启生效）。
- ✅ ESLint（useAttrStore.ts / AttributeTable.vue）零告警、py_compile 通过；详见 `Docs/LLM_record/26-07-26/2026-07-26-phase1-quickfix-b2-b5-b6.md`。

### V3.4.39 (2026-07-26) — 修 Bug 与优化规划落档（P0–P3 分级 + Sprint 排期）

- 📋 **新增 `Docs/TODO/bugfix-optimization-plan.md`（滚动维护）**：基于全库证据盘点——TODO/FIXME 扫描（5 处，均为 cesium-navigation 上游遗留）、`tsc --noEmit` 全量（1 个真实业务错误）、近日维护日志风险归集、大文件统计（5 个 2000+ 行）、后端安全面走查（CORS/`allow_origins=["*"]`、OAuth 内存 ticket）。
- 🔴 **P0（1 天内）**：实机回归欠账六项合并清单（当日大改验证闭环 → git 提交）；`layerTreeBuilder.ts:389` `capabilities.edit` 类型断裂修复；OAuth 内存 ticket 多 worker 隐患（方案：落 SQLite 短表 TTL 120s）。
- 🟠 **P1（本周）**：CORS 全开收敛为 L1 白名单 key `CORS_ALLOWED_ORIGINS`（走统一 loader + 门禁登记）；tileset 透明度×材质模式 style 单点合成收编；前端 9 处 `console.log` 清零。
- 🟡 **P2（下周）**：罗盘 4323 行元数据 JSON 化懒加载（先 analyze 定位 chunk）；矢量透明度扩 `PolylineOutlineMaterialProperty`；高德低级 API → v5 高级版（faq 遗留 TODO 收编）。
- 🔵 **P3（穿插）**：五大巨型文件渐进拆分表（CesiumToolPanel 2686 / TOCPanel 2499 / RegisterView 2198 / MapContainer 2041 / HomeView 2011，原则：只搬不改、每次一个一份日志）；cesium-navigation 上游 tracking TODO 挂起观察。
- 🗓️ 附三个 Sprint 执行顺序与逐项工作量/验收标准；每完成一项在计划文中勾选并链接日志。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-bugfix-optimization-plan.md`。

### V3.4.38 (2026-07-26) — 天地图地形解码下放 Worker + ArcGIS 二次调优 + 风场收尾

- ⚡ **天地图地形（默认地形）解码下放 Worker**：`GeoTerrainProvider` 的 pako inflate + 64×64 逐像素高程编码原在主线程（每瓦 0.6~2.5ms，瓦片风暴期堆积卡顿，与 ArcGIS LERC 同类问题）；抽通用 `decodeWorkerPool.js`（round-robin/Transferable/失效拒绝挂起并永久回退），新增 `geoTerrainDecode.worker.js`，ArcGIS 的 LERC 池迁移至共享实现（行为不变）；`_transformBuffer` 长度异常改显式 reject（原 null 直传 HeightmapTerrainData 会构造异常）。
- 🎚️ **ArcGIS 二次调优**：解码离开主线程后参数下探——层级硬顶 11→12（~9.5m）、SSE 静态4/移动8 → 3/6，山区细节提升一级。
- 🐛 **风场 vendored 库缺陷修复**：`removeEventListeners` 用 `.bind()` 新函数移除监听永远失败（销毁后 camera.changed/resize 监听残留泄漏）→ 缓存 bound 引用；`camera.percentageChanged=0.01` 全局副作用（影响全应用 camera.changed 频率且销毁不恢复）→ 快照并在销毁时还原。
- 🧹 **构建产物清理**：删除 cesium-wind-layer 未引用的 CJS 产物 index.js/index.js.map 与失真 sourcemap、重复类型声明（引用核查仅 index.mjs 在用）。
- 📝 **Force_command.md 纠偏**：写死的"当前版本 V3.4.1"改为以根 README 为唯一权威来源，避免误导后续会话。文件树已同步。详见 `Docs/LLM_record/26-07-26/2026-07-26-terrain-round2-wind-cleanup.md`。

### V3.4.37 (2026-07-26) — 交接文档 handover.md（接手必读入口）

- 📘 **新增 `Docs/Guide/handover.md`**：定位「导航 + 独家知识」，不重复既有文档——三十秒项目认知与十分钟跑起来；按问题类型的文档地图（配置/OAuth/结构/架构/改动溯源/规范六类入口）；三大核心架构速览（三层配置数据流与新增 key 流程、统一图层管理「元数据入店句柄留场」与双入口数据流、3D 功能模块文件夹范式含按钮控件约定）。
- 🗺️ **高频修改场景 → 代码坐标表**：加后端 API / 加底图源（双文件对称）/ 加 3D 工具模块 / 改 TOC / 改 Admin / 改 Agent / 版本号，七类场景直达入口文件。
- 🛡️ **门禁与提交五步流程**：两个 Check 脚本 + ESLint/tsc + Force_command 日志版本要求 + git 权限归属。
- ⚠️ **8 条「别处没写的坑」**：Cesium/OL 对象禁入 Vue 响应式、根 env 双端共读与容器重建、.env.production clone 必改、tileset 透明度与材质互写语义、JSDoc 内 `*/` 陷阱、多会话版本撞车顺延惯例、挂载盘慢命令、保留账号策略。
- 🔭 **已知边界与候选增强**：待实机回归汇总指引、存量 tsc 错误说明、TOC 三维属性表/分析导出/Demo 剩余候选。
- 🔗 **导航登记**：README 开发文档表新增行（置于结构详解之后）；project-structure Guide 树同步。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-handover-doc.md`。

### V3.4.36 (2026-07-26) — 面板设计令牌推广（UI 治理·续）

- 🧱 **四个地图浮层面板接入 --panel-\* 令牌**：SpatialAnalysisPanel、AdministrativeDivisionPanel、ControlsPanel（含卷帘底图选择对话框）、MapControlsBar 的面板框架统一替换为 `var(--panel-bg)` / `var(--panel-radius)` / `var(--panel-shadow)` + 品牌描边 `rgba(--brand-primary-rgb, 0.12)`（背景/圆角/投影为同值替换，默认主题零视觉差）。
- 🎨 **绿色家族语义归一**：沿用 DrawPanel 试点映射（#e8f0e8→--bg-brand-light、#f6faf6→rgba(brand,0.04)、#d44/#fff0f0/#ffd0d0→danger 系等），四文件共 30 处替换；蓝色主题下这批浮层面板首次完整联动。
- ✅ **验证**：4 个组件 compiler-sfc 编译通过、ESLint 零告警。至此 ControlsPanel 面板族群（Draw/Measure/SpatialAnalysis/District/主容器）令牌化全部完成；后续仅剩 Routing/Cesium 面板与 --toc-* 合流。
- 📝 补记于 `Docs/LLM_record/26-07-26/2026-07-26-ui-theme-token-unification.md`。
- 📦 **UI/UX 工作流交接文档**：新增 `Docs/LLM_record/26-07-26/2026-07-26-handover-ui-ux-workstream.md`（本线七个版本条目汇总、四组新架构约定〔设计令牌/Chat 结构/编辑引擎/偏好消费模式〕、关键文件坐标、六条核心实机回归项、分优先级待办、日志索引）；`Docs/Guide/handover.md` 同步挂接（新增 §4.4 UI 线速览 + 高频场景表两行），与同日「OAuth/属性表/架构治理」线交接文档互补。

### V3.4.35 (2026-07-26) — 矢量数据透明度（统一图层管理·二期收官）

- 🎚️ **矢量 DataSource 透明度落地**：`dataSourceDisplay.js` 新增 `applyVectorDataSourceOpacity`——遍历实体对 point/billboard/label/polyline/polygon 的颜色属性与 `ColorMaterialProperty` 材质做 alpha 缩放；geojson/kml/czml/shp 全类型生效。
- 🧠 **原色快照（可反复调节不衰减）**：`WeakMap<DataSource, Map<entityId, snapshot>>` 首次调节时快照原始颜色，之后始终以「原始 alpha × 系数」计算，杜绝二次缩放衰减；WeakMap 随句柄 GC 无泄漏。
- 🎬 **动态属性防守**：`isConstant === false` 的颜色属性（CZML 时间动画等）自动跳过保留动画语义；非 `ColorMaterialProperty` 材质（贴图/特效线）不触碰。
- ⚡ **rAF 合并**：滑杆高频拖动时同一 DataSource 一帧只重算一次（万级实体不卡顿），应用后经 `onApplied` 回调补 `requestRender`，按需渲染模式即时生效。
- 🔓 **能力放开**：`cesiumLayers` store 的 `OPACITY_SUPPORTED_TYPES` 扩至全部 7 类，卡片与 TOC「三维数据」节点透明度滑杆对矢量自动出现；设计文档能力矩阵同步（决策点 4 闭环）。
- ✅ **验证**：3 个改动文件 ESLint 零告警；实机回归清单见维护日志（反复 0↔100% 无衰减、CZML 动画不冻结、万级点拖动流畅）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-vector-datasource-opacity.md`。

### V3.4.34 (2026-07-26) — ControlsPanel 目录代码优化（日志监控性能 + 参数缺陷）

- ⚡ **LogMonitor 性能三连**：v-for key 由 index 改稳定自增 id（头部裁剪后 index 整体前移致全列表重 patch，高频日志每帧 diff 2500 行 DOM 的热点）；日志条目 `Object.freeze` 跳过深响应式代理（渲染读取零 proxy 开销）；裁剪改为超限 10% 批量执行（避免每帧 O(n) 头部搬移）。
- 🔌 **SSE 断线自动重连**：`onerror` 不再"一错即停"（旧逻辑连用户意图一并置停，需手动重开），保留 streamDesired、状态点转 pending、3s 退避自动重连；手动"停止"才真正关闭。LOCAL 判定补 127.0.0.1/::1。
- 🐛 **ControlsPanel 参数缺陷**：`message.warning('未识别的 Action:', action)` 第二参被当 options 吞掉 → 模板字符串；重复 vue import 合并。
- ✅ 审查通过不改动：DrawPanel/MeasurePanel（V3.4.5 注册表驱动）、SpatialAnalysisPanel（结构统一无热点）、AdministrativeDivision 两件套（纯函数过滤 + 懒加载）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-controlspanel-optimize.md`。

### V3.4.33 (2026-07-26) — Cesium 统一图层管理落地（两步走全量实施）

- 🗂️ **元数据店 `stores/layer/cesiumLayers.ts`**：CesiumLayerRecord（id/name/type/visible/opacity/supportsOpacity，禁含 Cesium 对象）+ `syncFromImport` 差量同步（保留用户改过的元数据）+ `registerAdapter/unregisterAdapter`（容器挂载注册场景回调、卸载注销并清档）；「元数据入店、句柄留场」原则落地，句柄仍由 `loadedDataSources` 持有。
- 🌲 **TOC「三维数据」分组（第二步）**：`cesiumLayerNodeBuilder.ts` 将记录映射为 `toLayerNode` 契约节点（id 前缀 `cesium:`，actions 只开 zoom/remove，attribute/edit/style/export 全关）；`useLayerStore.layerTree` 树顶拼接分组（records 空自动消失 → 2D 模式天然隐藏）；动作经 `composables/map/toc/actions/cesiumTocActions.js` 分流器在 `handleLayerTreeAction` 顶部拦截直调 store——可见性/透明度/重命名/`zoom-layer`/`remove-layer` 全接通，2D 链路与 HomeView 事件零改动。
- 🎛️ **数据页签卡片升级（第一步）**：Eye/EyeOff 显隐开关、透明度滑杆（仅 supportsOpacity 类型显示，复用 tileset-slider 设计语言）、双击标题重命名（Enter/blur 提交、Esc 取消）、隐藏态卡片降透明呈现；卡片与 TOC 同读一个 store，两处操作实时互通。
- 🔧 **类型适配器 `dataSourceDisplay.js`**：显隐统一 `.show`（TIF 同步 heightMesh 伴生网格）；透明度 tif→`ImageryLayer.alpha`、gltf→`Model.color` 白色乘 alpha、3dtiles→`Cesium3DTileStyle` 合成（alpha=1 清空还原交回材质模式，互写语义=最后操作生效）；矢量类透明度按设计留二期。
- 🔌 **容器接线**：`CesiumContainer` watch 导入列表差量入店 + 注册 adapter（setVisible/setOpacity/flyTo/remove，`requestRender` 即时生效）+ 卸载注销清档。
- ✅ **验证**：8 个新改文件 ESLint 零告警（修复 Eye 重复导入）；全项目 tsc 中本次 TS 文件零错误；设计文档状态更新为已实施。实机回归见维护日志测试方案。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-cesium-unified-layer-mgmt-impl.md`。

### V3.4.33 (2026-07-26) — 用户中心偏好设置真实落地

- 🗺️ **默认底图生效**：`MapContainer` 初始化底图优先级重排——URL `l=` 显式参数 > 用户偏好 `default_basemap`（runtime 缓存同步读取，不阻塞地图启动；经 `getLayerIndexById` 校验非法 id 自动回退）> 管理员全局默认 `default_basemap_index`。
- 📏 **单位制生效**：新增 `utils/units.js`（偏好 unit_system 的统一消费入口：`readPreferredUnitSystem / formatDistanceMeasure / formatAreaMeasure`）；测量工具 `useDrawMeasure` 的长度/面积格式化接入——公制 m/km、m²/km² ↔ 英制 ft/mi、ft²/acre；保存偏好后下一次测量即时生效；8 组换算断言单测通过。
- 🤖 **偏好 Agent 模型生效**：`useChatAgentConfig` 三条模型选择链路接入 `readCachedPreferredAgentModel`——个人 Key 模式模型挑选、后端代理模式模型回退、模型列表补齐链，优先级统一为「账号偏好（在可用列表中时锁定优先）> 后端配置 > 本地上次选择 > 首个可聊模型」。
- 🌐 **语言项如实化**：`html lang` 标记经 store 的 `applyRuntimePreferences` 已生效；完整多语言界面明确标注为后续建设，不做假实现。
- 🌍 **3D 侧默认底图同步生效（续）**：确认 2D/3D 底图共用同一 preset id 体系（`URL_LAYER_OPTIONS = BASEMAP_PRESETS.map(p => p.id)`，偏好存的就是 preset id，零换算）；store 新增导出 `readCachedPreferredBasemap()`（与 readCachedPreferredAgentModel 对称），2D `MapContainer` 改用该函数（删除私有 helper），3D `CesiumContainer` 启动链接入相同优先级——URL `l=` 恢复 > 用户偏好（`URL_LAYER_OPTIONS.includes` 校验）> 管理员 `default_basemap_index`；偏好命中时跳过管理员默认接口调用。
- ✍️ **偏好页描述纠偏**：四项描述改为准确生效范围（底图注明"分享链接参数优先"、单位制列明具体单位、模型注明"可用列表中时生效"、语言注明现状）。
- 🐛 **顺手修复**：账号中心头部全屏/刷新钮在品牌渐变横幅上对比度不足（半透明白 14% 几乎不可见）→ 实底白钮 + 品牌色图标 + 投影。
- ✅ **验证**：3 个 JS 模块语法 + 3 个 Vue 组件 compiler-sfc 编译通过；ESLint 全部改动文件零告警；units.js 公英制换算 8 断言全部通过。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-preferences-implementation.md`。

### V3.4.32 (2026-07-26) — 全局消息灵动岛二轮打磨（交互与队列策略）

- 🖱️ **整岛悬停暂停**：暂停语义从单条提升到整岛（指针入岛暂停全部计时、移出统一恢复），阅读时邻条不再在脚下消失；进度条经 `.toast-list:hover` play-state 与计时器同步冻结。
- ⏳ **自动关闭进度条**：每条底部 2px 进度线，动画时长绑定实际调度寿命 `_lifeMs`（含错峰偏移，与计时器严格同相位；resume 走剩余时长不改写）；纯 CSS transform 动画零 JS 逐帧成本；`prefers-reduced-motion` 隐藏。
- 🔢 **合并计数徽标**：dedup 命中不再改写文本追加"（共N条）"，改为图标角标 ×N；徽标与进度条按 `_dedupCount` 重键，合并时进度条重走一轮（续时可视化）。
- 🛡️ **快排豁免**：高压期 error/warning 至少保留 2500ms（原一刀切 800ms 闪过导致错误看不到），success/info/soup 仍 800ms 快排。
- 📦 **队列硬上限**：MAX_QUEUE=8，超限优先淘汰最旧的低优先级消息（保 error/warning），被淘汰消息触发 onClose 并清理 dedup 缓存——批量导入等极端 burst 不再无限积压。
- ✨ **进场级联**：同帧 burst 按列表序 45ms 错峰进场（transition-delay + CSS 变量），leave/move 不延迟。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-message-island-polish-round2.md`。

### V3.4.31 (2026-07-26) — 前端架构快赢三项（barrel 规范 + 结构树门禁 + api 收敛标注）

- 📐 **barrel 双层注册成文**：`composables/map/features/README.md` 新增强制规范——转发链为 map/index → 领域 barrel → 模块，`features/index.js` 不在链上；只注册单层会运行时 undefined 且 ESLint 不报错（V3.4.29 实踩成文）。
- 🛡️ **结构树漂移门禁**：新增根目录 `CheckStructureTree.py`（frontend-structure.md ⇄ frontend/src 按文件名双向 diff，漂移退出码 1），与 CheckConfigRegistry.py 同族；首跑即检出 26 项漏登记 + 3 项幽灵条目，价值当场验证。
- 🧹 **api/ 收敛标注**：`backend.js` 转发壳标注 DEPRECATED（删除后 `api/backend` 无后缀导入自动解析 `backend/index.js` 零改动兼容，待用户 `git rm`）；`api/weather.js`（高德天气前端业务封装）与 `api/backend/weather.js`（后端天气代理）同名两义以头注释 + 树注释消歧。挂载环境禁止 rm/mv，物理删除/改名降级为标注 + 用户命令。
- 🗺️ **评审路线分级**（详见日志）：T2 utils(21 文件)/features(41 文件) 平铺分域、dataImport 双目录消歧；T3 容器二轮拆分、Cesium 库级代码迁 src/lib、TS 化（js:ts=257:85）+ vue-tsc 门禁。
- 🔗 **barrel 链两层化（T1 后续落地）**：`map/index.js` 直接 `export * from './features'`，替代三个领域 barrel 的转发（重名项经核验均为 ESM 同源绑定不歧义；features/index 补齐 `tileHDRendering` 两项缺口）；新增模块注册从"双层"简化为"仅 features/index.js 一处"（README 规则同步改写，领域 barrel 保留给直接导入方）；覆盖性回归——旧链路全部导出在新链路可达（62 项）、ESLint 零告警。
- ✅ **漂移清零（后续补记）**：门禁首报的 26+3 项已全部处置——6 个真实新文件补录（cesiumTocActions/cesiumLayerNodeBuilder/cesiumLayers/dataSourceDisplay/index.d.ts/units.js）、1 处大小写修正（fluidRuntime.js）、20 个资产文件归入脚本「概括目录豁免」（Explanation/themes/types/svgPaths/shaders 保持目录级登记）、散文与注释误报（Three.js 等）通过"仅扫树条目本体"修复；终态 382 ⇄ 382 双向零漂移，退出码 0。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-frontend-architecture-quickwins.md`。

### V3.4.30 (2026-07-26) — 全局消息灵动岛首屏队列修复 + UI 打磨

- 🐛 **首屏队列滞留根因（串行化调度）**：`useMessageIslandMotion` 把每条新消息的关闭时刻排到"最晚关闭时刻 + 自身完整 duration"之后（严格串行），首屏 burst N 条时第 N 条停留 N×duration（5 条 3s 消息最后一条挂 15s+），岛屿长期占屏、消息一条条慢慢爬。改为**并行计时 + 250ms 错峰**（`closeAt = max(now+duration, latest+250ms)`），burst 3 条 3.0/3.25/3.5s 全清，保留先来先走顺序感。
- 🐛 **防抖合并不刷新计时器**：dedup 命中更新了 duration 但 motion 侧跳过已有 meta → 合并计数在涨、消息仍按首条时刻关闭。watcher 跟踪 `_dedupCount` 变化重启计时；hover 暂停中仅刷新剩余时长不打断暂停。
- 🎨 **UI**：岛底新增"还有 N 条提示…"队列积压徽标（传 `state.queue` 引用保持响应式）；补齐 `message-host-top-right` 兜底样式（此前默认 position 无 CSS，fixed 无偏移位置未定义）；enter/leave blur 8/10→4/6px、backdrop 28→20px（首屏多条同进出时模糊叠加是掉帧大户）；中文标题补字体栈避免 Cinzel 拉丁衬线不可控回退。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-message-island-queue-ui.md`。

### V3.4.29 (2026-07-26) — MapContainer / CesiumContainer 容器瘦身·第一轮

- 🧩 **抽离原则**：行为零变化的机械抽离——函数体逐行搬移，宿主作用域引用改为 factory 注入（ref 传引用、模块级 let 传 get/set 访问器）；`monitorLayerTimeout`/`switchLayerById`/`emitBaseLayersChangeBatched` 等声明晚于工厂调用点的依赖以 getter 延迟解析（沿用仓库既有晚绑定写法），全部注入依赖逐一核对 TDZ。
- 🗺️ **MapContainer 2222→2080 行**：新增 `composables/map/features/useRuntimeMapTokenPool.js`（运行时天地图 token 池：应用 token 并迁移图层可见性/透明度、启动水合、主 token 失效切备用并重试受影响图层）与 `useSharedEntryResolver.js`（分享链接入口识别 s=1/旧版 from·shared + 启动问候逆地理编码）。
- 🌐 **CesiumContainer 1053→915 行**：新增 `composables/dataImport/useCesiumDataOpsHandlers.js`——13 个数据操作事件处理器转发层（导入/移除/定位/清空/重定位/拉伸高程/贴地高度/样例城市/材质切换/ZIP·文件夹导入/GLTF 坐标弹窗确认取消）。
- 🔗 **barrel 双层注册**：`features/index.js` 与领域 barrel `basemapSystem.js` 同步登记（转发链 map/index → 领域 barrel → 模块，单层注册不可达）。
- ✅ **验证**：两容器 + 三新模块 + 两 barrel ESLint 零告警；barrel 转发链可达性校验通过。
- 🗺️ **后续路线图**（见日志）：MapContainer 剩余 runDeferredStartupTasks/getInitialViewState/activateInteraction/getMapExtent 等簇、CesiumContainer 启动簇与大气参数簇，可继续压至 ~1200/~500 行。
- 🧩 **二轮首簇落地（后续补记）**：抽离 `useStartupViewResolver.js`（getInitialViewState + applyDeferredUrlParams 启动视图解析簇），MapContainer 再 -57 行（2097→2040 区间）；两层 barrel 链下仅需登记 features/index.js 单处；`LocalDev.bat` 接入两个门禁脚本 advisory 运行（where python 守卫、不阻塞启动）；ESLint 零告警。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-container-components-slimming-round1.md`。

### V3.4.28 (2026-07-26) — 账号中心 UI 重设计（实用性 + 观感双修）

- 🧱 **实用性根因修复**：内容区固定 `height: 210px` 改为 `min-height: 280px; max-height: min(58vh, 540px)` 自适应视口——原先所有页签都挤在 210px 小窗里滚动，信息几乎不可读；全屏模式与移动端断点（52vh）同步适配。
- 🎨 **壳样式单套化**（`FloatingAccountPanel.vue`，模板零改动）：移除"暗色翡翠玻璃基底 + 浅色薄荷覆盖"两套样式叠罗汉与过时的 clip-path 切角，重写为白卡 16px 圆角 + `--panel-shadow`；头部升级品牌渐变横幅（经纬网格纹理与注册页同 DNA），头像白圈框、角色白胶囊徽章、全屏钮半透明白；导航改干净下划线式（品牌色圆条）；页脚退出钮红描边浅底；FAB 胶囊精简发光效果；Admin/API 面板引用的 `--acc-*` 变量映射到主题令牌保留兼容。
- 📊 **OverviewTab 重写**：三张大数字统计卡（图标底色块 + tabular-nums）；「今日 AI 配额」可视化进度条（用量 >80% 转警示橙、不限额显示半透明满条）；个人信息紧凑行（虚线分隔）；全站实时改四列 mini 网格 + 管理员联系行；留言板输入/按钮/列表全部卡片化。
- 🔐 **Security/Preferences 样式单套浅色化**（模板零改动）：分区标题品牌左条；输入框 42px 圆角 10 + 聚焦图标联动变色；OAuth 绑定钮白卡 + 品牌图标色（Google 蓝/GitHub 黑）；游客/管理员提示卡浅琥珀化；偏好项白卡行、主题选择卡选中环、头像圆环选中态 + 绿色勾角标、保存按钮渐变化。
- ✅ **验证**：4 个文件 compiler-sfc 编译通过、ESLint 零告警、模板类名与样式选择器覆盖复查通过（补齐 .message-time）。
- ⚡ **二轮实用性打磨**：头部新增手动刷新钮（统计/实时/留言一键拉齐，加载中旋转）；头部下方新增速览条（剩余配额 / 本次在线时长 / 全站在线人数三枚胶囊，不滚动即可看到最常查信息）；Esc 分级退出（先退全屏再关面板）；总览页——统计数字千分位、「已陪伴 N 天」徽章、留言相对时间（刚刚/x 分钟前/昨天，悬停看完整时间）、留言作者彩色首字头像、留言 200 字上限 + 字数计数（临近上限转警示色）+ 空内容禁用发布、管理员联系方式一键复制（✓ 反馈）；安全页——三个密码框均加明文显隐切换；修复上轮 splice 行尾检测转义 bug 造成的 Security/Preferences 混合行尾（三个 Tab 统一 CRLF）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-user-center-ui-redesign.md`。

### V3.4.27 (2026-07-26) — Cesium 统一图层管理设计文档（评审稿，未实施）

- 📘 **新增 `Docs/Architecture/cesium-unified-layer-management.md`**：针对「Cesium 导入数据缺统一图层管理、与 2D TOC 割裂」的完整设计——现状能力矩阵（2D TOC capabilities 契约 vs Cesium loadedDataSources 半套能力）、目标/非目标、两步走总体设计（①记录标准化 + 可见性/不透明度/重命名补齐 + Pinia 元数据店 ②cesiumLayerNodeBuilder 对齐 toLayerNode 契约挂进 TOC「三维数据」分组）。
- 🧱 **核心原则「元数据入店、句柄留场」**：Pinia 只存可序列化元数据，Cesium 对象由 useCesiumDataImport 内部 Map 持有，store action 经 CesiumContainer 注册的 adapter 回调触达句柄——杜绝 Vue 深代理 Cesium 对象。
- 🗺️ **类型×能力矩阵**：visible/opacity 按 DataSource.show / ImageryLayer.show+alpha / Model.show+color / Cesium3DTileset.show+style 分型实现；标注 tileset opacity 与既有材质模式互写 style 的风险与单点合成对策。
- 🔀 **动作路由设计**：TOCPanel 按 `node.engine==='cesium'` 分流直调 Pinia（沿用既有直更先例），HomeView 事件链与 2D 路径零改动；含 viewer 销毁时序、TIF 双句柄、TOCPanel 回归等风险对策与工作量评估（两步合计 1.5–2.5 天）。
- ❓ **4 个待评审决策点**：分组内平铺 vs 按类型二级分组、2D 模式隐藏 vs 置灰、切 2D 保留 vs 清空、矢量类 opacity 是否一期覆盖。评审通过后实施。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-cesium-unified-layer-mgmt-design.md`。

### V3.4.26 (2026-07-26) — 水体流体「清除」未还原场景状态修复

- 🐛 **根因**：`prepareScene` 在开始选点时即翻转 8 个全场景开关（HDR/阴影/全球光照/地面大气/天空大气/雾/MSAA 4/对数深度）并添加全屏大气后处理（"一打开就有一层效果"）；「清除」走 `cleanup(false)` 跳过 `restoreScene`，唯一还原入口 `closePanel` 在 headless 集成下不可达 → 清除后整屏效果层残留。
- ✅ **修复**：`clearFluid()` 改为 `cleanup(true)`——清除水体同时还原场景快照；快照在还原时置空，反复 捕捉/清除 无状态污染。`FluidRenderer.destroy()`（primitives/监听/纹理）经查完整无需改动。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-fix-fluid-clear-restore.md`。

### V3.4.25 (2026-07-26) — ArcGIS 地形卡顿底层修复（LERC 解码下放 Worker）

- 🐛 **根因**：Cesium 原生 `ArcGISTiledElevationTerrainProvider.requestTileGeometry` 在**主线程同步**执行 `LercDecode.decode`（每瓦 257² 约 2~6ms），缩放/飞行时 30~80 瓦并发使主线程被解码占满 100~400ms → 拖动/缩放明显卡顿；此前的层级硬顶/SSE 补丁只减少解码次数，未解决"解码在主线程"。
- ⚡ **修复**：`ArcGISTerrainProvider` 包装器重写 `requestTileGeometry`——主线程经 `inner._resource.getDerivedResource` 派生瓦片请求（保留 RequestScheduler 节流/取消）→ ArrayBuffer Transferable 零拷贝送 LERC Worker 池（npm lerc 3.0.0 纯 JS，2 实例 round-robin）解码、nodata 掩膜填 0 → 主线程仅构造 `HeightmapTerrainData`（structure 运行时读内部值兜底默认）。新增 `terrain/lercDecode.worker.js`。
- 🛡️ **健壮性**：Worker 池为模块级共享单例（反复切换地形不重复建 Worker）；Worker 创建失败或运行期 onerror → 拒绝全部挂起请求并永久回退原生主线程路径（行为同旧版）；解码失败 reject 交由 Cesium 正常瓦片失败/上采样处理；增量 TileAvailability 与层级硬顶 11 保留。
- 🎚️ **SSE 补丁放宽**：解码离开主线程后，`applyTerrainSceneFlags` 的 ArcGIS 专项 SSE 由 静态6/移动12 放宽为 静态4/移动8——地形更细且移动期不再有解码突发顾虑。
- 📝 文件树同步 frontend-structure.md；详见 `Docs/LLM_record/26-07-26/2026-07-26-arcgis-terrain-lerc-worker.md`。

### V3.4.24 (2026-07-26) — Cesium 三维分析模块：通视 + 限高（Demo 移植集成）

- 🆕 **`components/Cesium/Analysis/` 独立文件夹模块**（5 文件，viewer/Cesium 注入式零直接依赖）：`analysisMath.js` 共享纯函数（pickPosition→globe.pick 拾取兜底、大圆推算、扇形顶点生成，去 turf 依赖）；`visibilityAnalysis.js` 通视分析器；`heightLimitAnalysis.js` 限高分析器；`analysisModule.js` 声明式 GUI 控件；`index.js` 运行时工厂（懒实例化/控件分发/销毁）。
- 👁️ **通视分析**：「📍 地图选点」拾取观察点（自动 +1.5m 防嵌入）后，在起止方位角扇区内逐角度 `scene.pickFromRay` 射线求交（排除自身辅助实体），命中距离内拆分绿色可见段 + 红色遮挡段（depthFail 半透明），附半透明覆盖扇形；半径/步长/方位角/颜色/线宽实时可调，状态行报告射线与遮挡计数。
- 🏙️ **限高分析**：`ClassificationPrimitive`（CESIUM_3D_TILE）对分析区域内超过限高的建筑表面染色 + 黄色截面框（CallbackProperty 跟随参数）；「📦 自动框选」按场景第一个 3D Tileset 包围球生成矩形区域、推荐限高并飞行定位；「✍️ 手绘区域」左键加点右键结束（≥3 点）；限高/颜色/不透明度/截面框开关实时可调。
- 🎛️ **统一 GUI 接口接入**：模块经 `createAnalysisModule` 声明式控件注册进 3D 高级控制台「模块」页签（LilGuiControls 渲染），新增按钮型控件（type:'button'，value 为稳定空函数走 lil-gui 函数控件原生按钮，动作在 `useCesiumToolModules` 按 controlId 分发）；开关关闭即销毁分析器（实体/事件 handler 全量释放），`cleanupTools` 卸载时兜底销毁。
- ✅ **验证**：新增 5 文件 + 改动 2 文件 ESLint 零告警（修复 JSDoc 内 `*/` 提前终止块注释的解析错误）；事件链核对闭环（featureModules 仅排除 scene、emitControlChange 仅对 range Number 化、按钮函数值原样透传）。实机回归见维护日志测试方案。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-cesium-analysis-visibility-heightlimit.md`。

### V3.4.23 (2026-07-26) — 属性表表头/内容列对齐修复

- 🐛 **错位根因**：表头与每一数据行是独立 grid 容器，`minmax(140px,1fr)` 弹性轨道在各自容器宽度内解算；数据行绝对定位（不参与父级 intrinsic 尺寸）且带 `min-width: max-content`，长内容行被撑得比表头宽 → fr 轨道解算不一致 → 列边线系统性错开。
- ✅ **确定性像素列宽**：全列 px 轨道（用户拖拽宽 > 类型默认宽：number 120 / date 132 / boolean 100 / 其余 170），容器总宽由列宽求和内联设定（`min-width:100%` 保证窄表表头铺满）；两 grid 轨道逐像素一致，对齐与容器宽度彻底解耦；移除四处 `max-content` 与弹性轨道。
- 🦓 **斑马纹稳定**：`:nth-child(even)` 在虚拟滚动下只数可视切片、滚动时条纹漂移，改为数据行号驱动的 `row-even` 类。
- 🔧 列宽拖拽起始值改状态解析（删除 DOM 测量）；字段配置内页表双容器共享同一定宽滚动容器、不受此 bug 影响，保持原样。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-attribute-table-column-alignment-fix.md`。

### V3.4.22 (2026-07-26) — 属性表三轮优化：图层内容修订号契约 + CSV 导出

- ⚡ **修订号（revision）契约**：`useManagedLayerRegistry` 在唯一出站漏斗 `emitUserLayersChange` 处按「features 数组引用 + featureCount + name」单点判定内容变化并递增 revision 随 payload 下发——前置调查确认所有内容级变更（几何编辑/坐标转换/搜索聚合/路线）均整体重新赋值 features 数组，引用比较即可全覆盖，零变更点改动、零漏改风险；修订戳随图层删除清理。
- ⚡ **attrStore 快路径**：revision 未变的图层完全跳过快照构建（normalize + 行映射 + searchText 序列化），样式/可见性/透明度等无关操作对属性表 CPU 开销趋近于零；revision 缺失自动回退 V3.4.18「全量构建 + 内容签名」慢路径，双层防线保证正确性。
- 🆕 **CSV 导出**：新增独立工具模块 `utils/attributeTableCsv.ts`（RFC 4180 转义、UTF-8 BOM Excel 中文兼容、安全文件名、Blob 下载），工具栏「导出CSV」导出当前视图（筛选 + 排序 × 可见列别名表头），空表禁用。
- ✅ **验证**：四文件 ESLint 零告警；CSV 转义规则断言（空值/逗号/引号/换行/对象 JSON）通过；模块字节级无 BOM 字面量残留（`no-irregular-whitespace` 兼容，运行时 `String.fromCharCode(0xfeff)` 生成）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-attribute-table-revision-contract-and-csv.md`。

### V3.4.21 (2026-07-26) — AI 对话面板拆分重构与网页版体验增强

- 🧩 **组件拆分（2378 行 → 8 文件，单一职责）**：`ChatPanelContent.vue` 重写为编排容器（560 行，负责发送编排/工具两轮调用/GIS Commander 初始化），拆出 `ChatConfigPanel`（个人配置 + 模型下拉组合框）、`ChatServiceStatus`（路由模式/状态/额度）、`ChatMessageList`（消息渲染全量样式随行）、`ChatInputBar`（输入栏）4 个子组件；配置对象经 provide/inject 共享（store 型对象，规避 prop 变异告警）。
- 🧠 **逻辑下沉 composable**：新增 `composables/chat/useChatAgentConfig.js`（三种路由模式、配置加载/保存/清除、模型列表与偏好持久化、额度、LLM 三通道调用统一入口）、`useChatSession.js`（消息状态、上下文精简、自动修剪、欢迎语维护）、`chatIntentFallback.js`（定位/切底图正则意图 + 图源映射，纯函数可测试）。
- 💾 **会话持久化（新）**：消息（含时间戳/工具状态卡）写入 localStorage（上限 200 条），刷新或切页后自动恢复；清除历史同步清存储并取消在途请求。
- 💬 **消息操作（新）**：hover 出现操作条——任意消息一键复制（assistant 自动剔除 think 块）、最后一条回复可"重新生成"（丢弃旧回复重发同一问题、上下文去重）、时间戳展示。
- ⏹️ **停止生成（新）**：请求序号软取消——点击停止立即解锁输入，晚到的 LLM 响应被忽略，空占位气泡标记"已停止生成"。
- 📜 **智能滚动（新）**：仅在贴底状态自动跟随新消息（上翻阅读不被打断），配合"回到底部"悬浮按钮；生成中指示升级为三点跳动动画。
- ⌨️ **输入体验（新）**：输入框随内容自适应 1~6 行，Enter 发送 / Shift+Enter 换行，输入法组合键（keyCode 229）期间不误发；生成中切换为红色"停止"按钮。
- 🌱 **空状态建议词（新）**：仅剩欢迎语时展示 GIS 快捷指令 chips（定位/切底图/搜索），点击直接发送。
- 🐛 顺手修复：`pickModel` 重复调用 `saveModel` 两次的冗余写入。
- ⚙️ **四轮：Agent 配置面板重设计**：由平铺表单改为四张分组卡片（接入凭据 / 模型 / 生成参数 / 系统提示词，lucide 图标节头）；API Key 增加显隐切换（Eye/EyeOff）与「个人 Key 已启用」状态徽章；Temperature 改为滑杆 + 数值徽标 + 精确/平衡/发散刻度语义；模型下拉带选中态高亮与来源标签（当前/上游），刷新按钮加载中旋转，chevron 随展开翻转；操作区主次分层（渐变主按钮「保存配置」+ 文本次按钮「清除 Key / 恢复默认」hover 转危险色）；输入控件统一 8px 圆角 + 品牌聚焦光环。
- ⚡ **三轮体验打磨**：新增打字机逐字呈现（非流式后端下 ~1.5s 内播完、停止/清除立即整段落盘、序号守卫防错写）；消息列表 Markdown 渲染缓存（打字机高频更新时其余消息零重复 parse，libs 就绪状态纳入缓存键）；空状态升级 Hero 首屏（大渐变头像 + 标题 + 欢迎语副标题 + 建议词居中布局）；回到底部悬浮钮增加未读新消息徽标（上翻期间累计、回底清零）；错误回复红色边条气泡样式（isError 标记）；头部按钮全部 lucide 图标化并新增「导出对话为 Markdown」；会话持久化改 300ms 防抖（打字机期间避免高频序列化）。
- 🎨 **对话气泡对标网页版二轮重设计**：助手消息改为「品牌渐变圆头像 + 发送者行（AI 助手·时间）+ 文档式白卡」布局，用户消息为右对齐品牌渐变胶囊气泡（非对称设计，贴近 ChatGPT/Claude 网页版）；操作条全部图标化（lucide Copy/Check/RefreshCw，26px 方钮 hover 浮现）；思考过程改为折叠药丸（Brain 图标 + chevron 旋转，置于回答上方贴近思维链形态）；工具卡执行中旋转 Loader、成功绿勾/失败红叉、左侧 info 色条；新增跨天日期分隔线（今天/昨天/M月D日）、消息入场动画、生成中头像呼吸动效；输入区升级一体化输入壳（内嵌圆形渐变发送钮/脉冲红色停止钮、聚焦品牌描边、快捷键提示行）。
- ✅ **验证**：3 个 composable `node --check` 通过；5 个 Vue 组件 compiler-sfc（parse+compileScript+compileStyle）通过；`npx eslint` 对 `components/Chat/` 与 `composables/chat/` 全量零告警；文件树同步更新。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-chat-panel-split-and-enhance.md`。

### V3.4.20 (2026-07-26) — 属性表交互二轮优化

- ⚡ **hover 高亮零闪烁**：行 mouseenter 高亮改为 rAF 单帧合并 + 同值去重，清除时机由「每行 mouseleave」上移到「离开整个表格滚动区」——行间快速划过由 2N 次事件降为 ≤N 次，地图侧样式不再反复重建；切换图层重置去重基准。
- 🆕 **多选模式透传**：Ctrl/⌘ 点击 = toggle 多选、Shift 点击 = range 区间，透传给 `highlightManagedFeature` 既有 `mode` 契约（此前 UI 固定 replace，下游能力闲置）。
- 🆕 **双击行缩放到要素**：`focus-feature` 事件携带 `zoom: true` 时处理器调用 `zoomToManagedFeature` 视图 fit（此前仅 `void` 占位）；单击聚焦保持不缩放，避免与浏览操作冲突。
- 🆕 **列宽拖拽**：表头右缘 8px 热区拖拽调宽（80–600px 钳制），宽度存入 `fieldConfig.width` 随数据集生命周期保留（数据集重建合并保留、不参与内容签名，与 V3.4.18 增量同步正交）；未调整列保持 `minmax(140px,1fr)` 弹性。
- ⚡ **搜索 200ms 防抖**：本地输入缓冲 + store 外部变更回写，大数据集不再每击键全量过滤；清除按钮即时生效。
- ✅ **验证**：AttributeTable.vue / useAttrStore.ts / useMapUIEventHandlers.js ESLint 零告警。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-attribute-table-interaction-round2.md`。

### V3.4.19 (2026-07-26) — 前端 env 统一收敛到仓库根（单一 env 落地）

- 🎯 **envDir=仓库根**：`vite.config.js` 设置 `envDir` 指向仓库根并用 `loadEnv` 驱动 `VITE_BASE_URL`——本地开发直接读根 `.env`（与后端同一个文件），生产构建读新增的根 `.env.production`（提交 git，clone 唯一必改 `VITE_BACKEND_URL`）；Vite 仅注入 `VITE_*` 前缀变量，根 `.env` 中的后端/绝密项不会进入构建产物。
- 🧹 **双源清除**：`frontend/.env.production`、`frontend/.env.example` 降为指路存根（Vite 不再读取 frontend 目录 env）；`LocalDev.bat` 不再生成 `frontend/.env.local`，存量文件启动时自动清理。
- 📝 **文档与登记同步**：根 `.env.example` 前端段注明 envDir 语义；配置指南（5 分钟上手/相关文件表）、三层架构文档（架构图 ENVF 节点与前端消费段）、README 一键启动说明、`publicRuntime.ts` 头注释同步「前后端同读一个根 env」；`project-structure.md` 根树登记 `.env.production`。
- ✅ **验证**：ESLint（vite.config.js/publicRuntime.ts）零告警；vite.config.js ESM 语法解析通过；门禁七项全绿；`.env.production` 确认不被 .gitignore 忽略；旧路径话术全库清零。（沙盒无法跑 vite build——Windows 安装的 rollup 二进制不兼容，实机 `npm run dev`/`npm run build` 回归见测试方案。）
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-frontend-env-unify-root.md`。

### V3.4.18 (2026-07-26) — 属性表稳定性修复与功能补全

- 🐛 **滚动/配置莫名重置修复（增量同步）**：`useAttrStore.syncLayers` 引入 FNV-1a 内容签名（图层元信息 + 逐行 featureId/searchText），签名一致跳过 dataset 替换、保持 rows 引用稳定；属性表回顶仅在「切换图层」与「排序/搜索/筛选条件变化」时发生，数据增量刷新保持滚动位置并按行数钳制；虚拟行 key 去掉 index 依赖，滚动位移不再整片重挂载。
- 🐛 **「视图筛选范围」坐标系修复**：行范围来源混用（OL 要素 3857 米制 / GeoJSON 记录 4326 经纬度）与地图视图范围（3857）统一归一到 EPSG:4326 后再相交比较（纯数学转换，无 OL 依赖，阈值启发式 >360 判米制）；勾选筛选时 MapContainer 立即同步一次当前范围，不再等下一次 moveend；范围不可用（3D/视图未就绪）时勾选框虚线弱化 + footer 提示「范围筛选未生效」。
- 🧹 **状态泄漏修复**：syncLayers 按传入图层集合清理已删图层的幽灵 dataset 与签名（删除图层后属性表正确关闭）；`setActiveLayer` 切换图层清除 selectedFeatureId，避免跨图层同名 featureId 误高亮。
- 🆕 **表头排序 + 全字段搜索接线**：组件改用 store 既有 `displayRows`/`toggleSort`/`searchQuery`（此前为无 UI 死代码）——表头点击升/降序（▲/▼ 指示、OID 列点击恢复默认序），工具栏新增全字段搜索框（含清除按钮）；footer 改为「展示 X / 总 Y 行」。
- ✅ **验证**：三文件 ESLint 零告警；3857→4326 公式与阈值启发式独立断言通过（±180°/±85.051° 极值、武汉样例、4326 直通）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-attribute-table-stability-and-features.md`。

### V3.4.17 (2026-07-26) — SMTP_USER 分层校正（对齐用户三层模型原意）

- 🔁 **账号回归 L1、凭证独留 L3**：按三层模型的原始设计「邮箱账号写入 env、凭证写入 HF Secret，分开存取」，`SMTP_USER` 由 L3 调整为 L1（catalog layer/secret 标记更新，根 `.env.example` L1 邮件段新增 `SMTP_USER=`、L3 段仅留 `SMTP_PASSWORD=`，backend/.env.example 摘要同步）；HF Secrets 最小集合中 SMTP 组仅剩 `SMTP_PASSWORD`，`SMTP_USER` 归入 Variables 建议。
- 📐 **分层原则明确化**：「是否绝密看泄露后果，而非是否成对使用」——发件地址随每封邮件公开、无泄露增量风险；原则写入 catalog 描述、配置指南与架构文档（SMTP 标注为账号/凭证分开存取范例）。
- 🧾 **可观测同步**：启动摘要 `masked_summary()` 的 [L3] 状态行由合并的 `SMTP_USER/PASSWORD` 改为仅 `SMTP_PASSWORD`；admin 面板 `l3_env_status.smtp` 保持「账号+密码齐备」功能布尔不变。
- ✅ **兼容与验证**：loader 读取路径不变，存量把账号配在 HF Secrets 的部署零影响；`py_compile` + 门禁七项 + 行为断言（取值不变/摘要无明文/元数据 L1 非 secret）全部通过。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-smtp-user-tier-realign.md`。

### V3.4.16 (2026-07-26) — 体积云与 2D 风场性能优化

- ⚡ **风场粒子量修正（头号热点）**：`useCesiumWind`/`Wind2D` 默认 `particlesTextureSize` 600→256（36 万→6.5 万粒子，段绘制顶点 144 万→26 万，÷5.5），并加 [16,512] clamp 防误设超载；vendored `index.mjs` 的 `createSegmentsGeometry` 由 JS push 循环（600² 时 ~940 万次 push）改为预分配 TypedArray 直写，消除创建/改档时数百 ms 主线程卡顿。
- ⚡ **云主 raymarch 分辨率缩放**：新增 `cloudResolutionScale`（smooth 0.5 / balanced 0.75 / ultra 1.0）。<1 时管线拆分为 PostProcessStageComposite：低分辨率 raymarch stage（`textureScale`，`SPLIT_CLOUD_OUTPUT` 输出预乘云色）+ 全分辨率合成 stage（scene*(1-a)+cloud，底图/模型保持全分辨率清晰）；=1 走原单 stage 路径（ultra 零回归）。smooth 档 raymarch 像素成本 ÷4。开启体积云时按预设生效。
- ⚡ **BSM 内容签名门控**：`CloudShadowPass` 依据 snap 整数+量化半径+量化太阳方向签名与参数版本（`updateDynamicParams` 值级变更检测，演化偏移除外）决定是否重绘；相机平滑移动的未跳变帧与静止帧跳过整张 atlas raymarch，演化刷新按 `max(bsmUpdateInterval,8)` 帧兜底（无风/无演化时不刷）。取代 V3.4.7"运动即每帧重绘"，ultra 静止从每帧 → ~每 8 帧。
- ⚡ **blit 门控 + 地面 PCF 接入预设**：`_syncBSM` 仅在 BSM/resolve 本帧更新时 clear+blit 1024² 共享纹理；aerial/atmosphere 地面云影 PCF 由硬编码 16 tap 改 `u_cloudShadowPcfTaps`（setCloudShadow 注入 shadowPcfTaps：smooth 1 / balanced 4 / ultra 8）。
- 🔧 拆分模式下 in-shader TAA 与整屏 readPixels 回读强制关闭（三档预设本就 temporalEnabled=false）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-perf-cloud-and-wind.md`。

### V3.4.15 (2026-07-26) — 三层配置架构文档（系统运行全景）

- 📘 **新增 `Docs/Architecture/configuration-three-tier.md`**：Mermaid 总体架构图（三层来源 → backend/config 统一入口 → 后端业务 → API 边界 → 前端 publicRuntime → 门禁）+ 启动/请求 sequenceDiagram；正文覆盖 L1/L2/L3 职责边界表、config 四模块与两条优先级链、OAuth 推导 / Agent 密钥解析 / SMTP / 别名收敛四条关键链路、前端构建期+运行期双腿消费、4 条安全不变量、新增 key 门禁流程、V3.4.6→13 版本足迹。
- 🔗 **导航同步**：根 README「架构文档」表新增「三层配置架构」行；`project-structure.md` Architecture 注释更新并修复 Docs/Demo 两处重复行。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-architecture-doc-three-tier-config.md`。

### V3.4.14 (2026-07-26) — 前端 UI 主题令牌统一治理

- 🎨 **三组设计令牌落地 theme.css**：z-index 分层（`--z-float:100 / --z-panel:1000 / --z-popover:1200 / --z-modal:2000 / --z-modal-high:2200 / --z-toast:9999`，约定跨组件浮层必须用令牌、组件内局部堆叠 1~10 不用）；面板规范（`--panel-radius / --panel-radius-sm / --panel-shadow / --panel-border / --panel-bg / --panel-header-gradient`）；字号阶梯（`--fs-xs~--fs-xl` 六档，新代码使用、存量渐进迁移）。
- 🔁 **硬编码颜色同值替换（零视觉差）**：脚本仅处理 `.vue` 的 `<style>` 块，23 组与 theme.css 取值完全一致的 hex→var 映射（品牌绿系/中性灰/功能色），25 个组件共 44 处替换；默认绿主题渲染完全不变，蓝主题下这些组件首次正确联动。
- 🧮 **z-index 魔数清零**：100/1000/1200/1400/2000/2001/2200/9997/9998/9999 共 35 处同值令牌化（含 calc 偏移保序），杜绝浮层互相遮挡的隐性冲突；局部小值（1/2/5/10）按约定保留。
- 🧪 **DrawPanel/MeasurePanel 面板族群试点**：15 组绿色家族近似色归一到语义变量（#6b8c6b→--text-brand、#d7e4d7→--border-brand-light、浅绿水洗底→rgba(--brand-primary-rgb) 等），面板框架（圆角/投影/背景/描边）接入 `--panel-*` 令牌，补 `@media (max-width:768px)` 宽度自适应；作为其余面板后续迁移的参照实现。
- 🚫 **刻意排除**：vendored Cesium 模块（cesium-navigation / cesium-wind-layer）不动；LogMonitor 暗色终端配色为有意设计，保留。
- ✅ **验证**：30 个改动文件 compiler-sfc（parse + compileScript + compileStyle）全部通过；已映射色值在 style 块残留为 0；z-index 令牌 32+3 处落地复查通过；theme.css 花括号配平与新令牌存在性断言通过。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-ui-theme-token-unification.md`。

### V3.4.13 (2026-07-26) — 配置架构计划收官（阶段 5/6 完成）

- 🛡️ **登记门禁脚本 `CheckConfigRegistry.py`（仓库根）**：7 项检查——[B1] 后端裸 `os.getenv/os.environ`（AST 精确匹配，仅 `backend/config` 豁免）、[B2] config helper 字面量 key 未登记 catalog（平台变量白名单）、[B3] catalog key 未登记根 `.env.example`、[B4] `.env.example` 孤儿 key、[F1] 前端散落 `import.meta.env`（仅 `src/config/publicRuntime.ts` 豁免）、[F2] 前端 VITE_ key 未登记、[F3] 前端硬编码部署域名；`python CheckConfigRegistry.py` 违规 exit 1，可挂 CI/CR。
- 🔧 **门禁自测发现并修复 3 处遗漏**：`AMAP_KEY`/`GAODE_KEY` 兼容名补进根 `.env.example` L3 段；`api/download.js` 的 `VITE_DOWNLOAD_REQUEST_TIMEOUT` 散落读取收敛为 `publicRuntime.DOWNLOAD_REQUEST_TIMEOUT_MS`；修后 7 项全绿。
- 📋 **「HF Secrets 最小集合」复制清单**：`configuration.md` 新增按功能分组的 key 名清单（admin/OAuth/SMTP/Agent/高德/Supabase/LOG，与根 `.env.example` [L3] 段一一对应），附 Variables 建议（APP_ENV、PUBLIC_URL、SMTP_HOST/PORT）与「启动日志 [L3] 行 / admin 环境密钥状态卡片」自检指引；compose 根 `.env` env_file 注入与 LocalDev 自动生成已由 V3.4.11 完成，阶段 5 至此闭环。
- 🧹 **过时双写文档清理（阶段 6）**：`backend/README.md` 删除 super_admin 手工 SQL 建号整段（改为 admin + L3 `SUPER_USER` + dev 123456 的统一 loader 语义，标注 admin/user 禁绑 OAuth），管理员登录 curl 示例同步，并修正 23 处过时端口 `localhost:8000`→`localhost:7860`。
- ✅ **验证**：门禁脚本自测通过（catalog 55 key · 前端 VITE_ 5 个，7 项全绿）；全项目 `tsc --noEmit` 中本次改动文件零错误；文档侧 super_admin 过时引用清零（仅保留「不是 super_admin」类澄清与保留名列表）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-config-plan-phase5-6-gatekeeper.md`。

### V3.4.12 (2026-07-26) — 体积云地面阴影垂直移动残余抖动修复

- 🐛 **BSM 噪声世界锚定（核心）**：raymarch 蓝噪声此前锚定 `gl_FragCoord`（atlas 像素），texel snap 使 cascade 窗口随相机整 texel 跳变，每次跳变噪声相位相对世界滑动 1 texel → 该级 OD 场整场重噪；垂直移动时 4 级 cascade 错开跳变 → 阴影周期性"跳纹理"。现由 `updateShadowCascades` 记录 snap 后中心 texel 计数（mod 256）作 `u_jitterOffset` 传入，`getBlueNoise((gl_FragCoord+offset)/256)` 使噪声随纹理网格贴住世界（`fragCoord+center/texel` 与窗口位置无关），snap 跳变前后 BSM 内容严格一致。
- 🐛 **resolve 运动期恢复时域平滑**：V3.4.7 的 0.005 reset 阈值在锚定修复后成为新抖动源（垂直移动几乎每帧硬重置、平滑失效）；重投影已可信，reset 阈值回调 0.05（仅留给预设切换等真不连续），运动 alpha 上限 1.0→0.5，history 重投影 `prevUv` 增加 cascade tile 内 clamp 防跨 tile 污染；`_syncBSM` forceReset 同步 0.05。
- 🐛 **PCF 半径去视距耦合**：aerial/atmosphere 地面 PCF 半径由 `mix(1.5,3.0,viewDist/far)` 固定为 2.0 texel，消除升降时模糊宽度"呼吸"。
- 🐛 **cascade 边界去硬线**：`getFadedCascadeIndex` 硬阈值 0.35 改逐像素 IGN 抖动阈值（aerial/atmosphere 地面版），边界带空间蓝噪声式混合、PCF 自然平滑；云体版保持硬阈值（其 jitter 为逐帧 STBN，避免时域闪烁）。
- ✅ 已排除：主相机 `frustum.near/far` 动态变化（全库仅洪水模拟独立正交相机自改 frustum）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-fix-cloud-shadow-vertical-jitter.md`。

### V3.4.11 (2026-07-26) — 本地 admin 登录回归修复（APP_ENV 注入链路）

- 🐛 **根因**：配置统一 loader 后 `APP_ENV` 缺省改为 `production`（生产安全默认，本身正确），而本地根 `.env` 为空、宿主机根 `.env` 对容器不可见（仅挂载 `backend/`），且 compose 的 `environment` 只在**重建容器**时注入——当天重构代码经 uvicorn `--reload` 热加载进旧容器后按 production 运行，`admin/123456` 开发兜底被禁用，登录 503。
- 🔗 **env 注入链路补全（版本无关挂载方案）**：新增 `backend/.env` 开发桥接文件（仅 `APP_ENV=development` + 本地 URL，git 忽略），经既有 `.:/app` 挂载即时可见——`docker compose restart` 即生效、无需重建容器；`backend/docker-compose.yml` 增加 `../.env:/app/.env:ro` 单文件挂载，重建后根 `.env` 本地实值（OAuth 密钥、SMTP 等）接管容器配置。弃用初版 `env_file` long syntax（需 Compose v2.24+，旧版硬报错阻断启动）。
- 🧰 **LocalDev.bat 自愈**：启动时根 `.env` 缺失则自动从 `.env.example` 复制生成，修复 clone 后忘记 `cp .env.example .env` 的常见坑。
- 📢 **可诊断性**：`get_admin_password()` 非开发环境缺 `SUPER_USER` 的错误日志补充「当前 APP_ENV=xxx」与本地排查指引（改环境变量需重建容器）。
- ✅ **验证**：三场景断言通过（仅根 .env → development/123456；无任何配置 → production/禁用；环境变量注入 → development/123456）；compose YAML 解析、`py_compile` 通过。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-fix-local-admin-login-app-env.md`。

### V3.4.10 (2026-07-26) — 前端公开配置收敛（配置架构计划·阶段 4 完成）

- 🆕 **`src/config/publicRuntime.ts` 单点基址模块**：`BACKEND_BASE_URL`（VITE_BACKEND_URL，缺省 localhost:7860）、`TILE_PROXY_BASE_URL`（VITE_TILE_PROXY_BASE_URL → VITE_BACKEND_URL 链式回退）、`TILE_PROXY_MODE`，及 `backendUrl/tileProxyUrl/gcj2wgsProxyUrl/backendTilesUrl` 四个拼接 helper；规则：业务代码不硬编码后端域名、不散落 `import.meta.env` 读取。
- 🧹 **硬编码域名清零**：`basemapConfig.ts` 与 `sourceDescriptors.ts` 共 12 处 `https://negiao-webgis.hf.space/...`（高德 gcj2wgs 纠偏 ×3、Google 地形注记纠偏、Google 卫星通用代理、ships66 自托管瓦片，双文件对称）全部改为 helper 派生；`tileLifecycle.ts` 删除 HF 域名兜底（回退链终点改为 localhost）；`client.js` 的 `BACKEND_BASE_URL` 改由 publicRuntime 提供。`grep negiao-webgis frontend/src` 结果为 0——clone 用户只改 `.env.production` 的 `VITE_BACKEND_URL`，API/瓦片代理/纠偏/自托管瓦片全量跟随。
- 🆕 **后端 `GET /api/config/public`**：复用阶段 2 的 `config.public.build_public_config()`，下发非密公开配置（app_env、前后端基址、Agent 非密默认）与功能可用性布尔（oauth_google/oauth_github/email_verification/agent_env_key/amap/supabase），无任何 secret 明文。
- 📝 **env 模板同步**：`.env.production` 头部新增「clone 必改 VITE_BACKEND_URL」警示与根清单交叉链接，登记可选 `VITE_TILE_PROXY_BASE_URL/MODE`；`frontend/.env.example` 注明生产构建走 `.env.production` 与 publicRuntime 消费方式；`frontend-structure.md` 文件树补录 `src/config/`。
- ✅ **验证**：改动 5 文件 ESLint 通过；`tsc --noEmit` 全项目仅存量错误（cesium 类型解析与并行任务遗留），本次 4 个 TS 文件零类型错误；`backend/app.py` 编译通过；src 域名残留扫描为 0。构建产物 secret 扫描与实机底图回归待本地 `npm run build` 后复核（沙盒无法运行 Windows 安装的 esbuild 二进制）。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-frontend-public-config-phase4.md`。

### V3.4.9 (2026-07-26) — 图层管理统一与几何编辑全图层开放

- 🆕 **TOC「编辑要素」统一入口**：图层目录右键菜单新增「编辑要素」，对指定图层启动定向几何编辑会话（Select 过滤仅命中该图层）；事件链 `TOCTreeItem → commandDispatcher → contextActionManager → TOCPanel → SidePanel → HomeView → MapContainer.activateGeometryEditForLayer`，与绘制面板 SelectEdit 共用同一编辑引擎，消除两处编辑/图层管理逻辑各管各的冲突。
- 🔓 **编辑能力泛化（不再局限绘制图层）**：`useGeometryEdit.isEditableLayer` 由 `sourceType === 'draw'` 硬编码改为通用矢量判断——任意含矢量源的托管图层（绘制/上传/搜索/行政区划）均可编辑；排除路线图层（几何与规划步骤强绑定）、栅格/瓦片源与 WebGL 大数据图层；兼容行政区划托管记录的 `_layer` 字段（新增 `getOlLayerFromItem` 统一解析）。
- ⌨️ **编辑快捷键**：编辑会话内 Delete/Backspace 直接删除选中要素（输入框聚焦时不响应，防误删），Esc 取消选择/退出编辑。
- 🎨 **非绘制要素通用高亮**：新增 `createGenericSelectionHighlightStyle`（光晕 + 虚线描边叠加，不重建基础样式），选中上传/搜索/区划要素时不再被伪造的绿色 Polygon 样式覆盖；样式编辑时按几何类型推导 drawType（Point/LineString/Polygon），替代原先一律按 Polygon 处理。
- 🧹 **图层管理归口 TOC**：非绘制图层删空全部要素后保留空图层记录，是否移除交由图层目录统一决定（绘制图层维持删空即移除的原行为）；DrawPanel「清除所有」更名「清除绘制」并以 tooltip 注明只作用于绘制图层，SelectEdit 工具提示同步说明覆盖范围与 Delete 快捷键。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-unified-layer-editing.md`。

### V3.4.8 (2026-07-26) — L2 管理员面板对齐（配置架构计划·阶段 3 完成）

- 🔐 **L3 环境密钥状态可视化（只读布尔）**：`GET /api/admin/overview` 新增 `l3_env_status`（SUPER_USER / OAUTH_STATE_SECRET / Google OAuth / GitHub OAuth / SMTP / AGENT_API_KEY(环境) / 高德(环境) / Supabase 的 8 项布尔，来自统一 loader，绝不回显明文）；管理员控制台顶部新增「环境密钥状态（L3 · HF Secrets · 只读）」卡片徽章展示，并说明绝密只能在 HF Secrets / 本地 .env 修改、不进面板与 DB。
- 🧭 **L2 对照表落档**：`configuration.md` 新增「L2 对照表（配置项 ↔ Admin 菜单 ↔ 存储位置 ↔ 后端读取）」，覆盖地图 token 池（api_keys）、Agent 参数与默认 AI（system_config）、默认底图、联系方式、公告（announcements）、管理员头像，并列出「仅 env」例外（RUNTIME_CONFIG_ALLOWED_ORIGINS、PROXY_*、LOG 等）；根 `.env.example` [L2] 段补充 Admin 菜单位置注释与对照表链接。
- ✍️ **面板文案交叉链接**：API 密钥管理头部新增分层说明（密钥池存于 api_keys 表 L2、优先于环境变量、L3 绝密不进面板）；LLM 参数配置描述补充「L2 优先于 L1 默认，键名登记见根 .env.example [L2] 段」。
- ✅ **验证**：`api/admin.py` 编译通过；`l3_env_status` 逻辑独立断言（布尔类型、无明文泄漏、真值/假值场景）通过；改动的两个 Vue 组件 ESLint 零告警。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-admin-panel-l2-alignment-phase3.md`。

### V3.4.7 (2026-07-26) — 体积云地面阴影贴地锚定底层修复

- 🐛 **CSM 光空间矩阵配对修复（核心根因）**：`CloudShadowPass.updateShadowCascades()` 中 `cameraToLight` 误用 `invLightOrientation × camWorld`（光→世界 × 相机→世界，无几何意义），centerLS 回世界又误乘 `lightOrientation`——两处错误互相抵消使中心点连续，但 **texel snap 落在转置光框架中量化轴与阴影图 x/y 轴不重合，量化完全失效**，cascade 原点随相机亚 texel 滑动，BSM 每帧重栅格化漂移 + 静态 blue-noise jitter 绑定 atlas → 阴影跟相机走而非贴地（升降抖动/屏幕粘滞的直接原因）。修正为 `lightOrientation × camWorld` 与 `invLightOrientation` 回世界；snap 修复后每级 cascade 的 texel↔世界映射帧间分段恒定。
- 🐛 **旋转黑闪修复（运动度量角度化）**：`CloudShadowPass`/`ShadowResolvePass` 运动度量由 `1-dot`（小角度 θ²/2 二次方弱化）改为角度近似 `sqrt(2(1-dot))`，强制刷新阈值 0.003→0.001；旧度量下 ~12°/s 的慢旋转不触发强制刷新，smooth/balanced 预设（`bsmUpdateInterval=3~4`）旋转中 cascade 冻结 3~4 帧，旋入的新视野落在旧 cascade 盒外无阴影，更新帧阴影整块弹入。
- 🐛 **矩阵/atlas 错帧修复**：主云 stage `u_shadowMatrices/u_shadowFar` 改读 published 快照（与 atlas 内容配对），新增 `u_shadowNear` 供 cascade 选择（不再混用当前相机 near）；消除 interval>1 跳帧期云体 BSM 采样/丁达尔错位闪烁。
- 🐛 **atlas 跨 tile 渗色修复**：aerial / atmosphere / 主云三处消费 shader 的 BSM 采样增加 tile UV 半 texel gutter clamp，防止 PCF vogel 偏移越过 2×2 atlas tile 边界读到相邻 cascade（矩阵语义不同）产生边缘黑条。
- 🐛 **监听顺序 1 帧滞后修复**：`CloudShadowPass` 新增 `autoRender:false`，由 `_syncBSM` 显式驱动 `render()`，保证"矩阵→raymarch→publish→resolve→blit→setCloudShadow"同帧顺序确定；运行时切换质量预设重建 pass 后不再产生固定 1 帧滞后与重复 resolve。
- 🔧 光矩阵 up 向量在太阳方向近平行 Z 轴时退化 → `[0,1,0]` 兜底；resolve history reset 阈值 0.02→0.005。
- 📝 详见 `Docs/LLM_record/26-07-26/2026-07-26-fix-cloud-shadow-ground-anchoring.md`。

### V3.4.6 (2026-07-26) — 后端三层配置统一 loader 全面落地（配置架构计划·阶段 2 完成）

- 🧱 **backend/config 统一配置包**：`catalog.py`（配置全集登记：key/层级/默认值/是否绝密，与根 `.env.example` 一一对应）、`load.py`（L1 env + L3 Secrets 加载、`BackendSettings` 快照、公开 helper `get_str/get_int/get_float/get_bool`（catalog 默认感知 + 越界钳制）、Supabase/AGENT_TOKEN/AMAP 兼容别名解析、`masked_summary()` 脱敏摘要）、`runtime.py`（L2 Admin+system_config 运行时覆盖，绝密 key 走 DB 直接抛 ValueError 守卫）、`public.py`（前端安全公开配置：仅非密值 + 「是否已配置」布尔）；修复此前 `__init__.py` 导入不存在名称导致包不可用的问题。
- 🔗 **OAuth 回调地址自动推导**：`GOOGLE/GITHUB_OAUTH_REDIRECT_URI` 不再必配，缺省时由 `BACKEND_PUBLIC_URL` 推导为 `{base}/api/auth/oauth/{provider}/callback`；前端成功/失败回跳同理由 `FRONTEND_PUBLIC_URL` 推导，均可显式覆盖。修复 `_oauth_config` 强制要求 REDIRECT_URI 导致 503、`build_frontend_redirect` 生产环境硬编码 localhost 的缺口。
- 🧹 **全模块 os.getenv 收敛（业务代码零裸读）**：auth（constants/oauth/email_service/db）、agent_chat（constants/db/upstream）、location、services/ip_geo、statistics（Supabase 别名交由 loader）、proxy、external_proxy、monitor、api_keys_management、download_task、gcj_rectify 全部改经 `config` 读取；`email_service` 移除 dotenv 依赖并改为调用时读取 settings（HF Secrets 注入即时生效）。
- 📢 **启动可观测**：`app.py` 启动打印脱敏配置摘要（URL/SMTP 主机/Agent 默认 + 全部 L3 项「已配置/未配置」状态，绝不输出明文）；`LOG_LEVEL` 接入日志初始化；生产缺 L3 时错误明确（OAuth 503 精确到缺失 key 名、SUPER_USER 缺失禁用管理员并日志说明、SMTP 未配置启动警告）。
- 🗂️ **登记门禁补齐**：catalog 与根 `.env.example` 补登记 `PROXY_ALLOW_PRIVATE_HOSTS`、`PROXY_VERIFY_SSL`、`WEBGIS_ASSUME_*`、高德兼容名 `AMAP_KEY/GAODE_KEY`；监控令牌 `LOG` 归入 L3 段。
- ✅ **验证**：后端全树 `py_compile` 通过；配置层冒烟 30+ 断言（dev/prod 推导、显式覆盖、别名回退、越界钳制、生产缺 L3 行为、摘要/公开配置无明文泄漏、绝密 DB 守卫）全部通过；改动文件 AST 未定义名检查通过；业务目录 `os.getenv/os.environ` 残留为 0。
- 📝 **文档同步**：文件树补录 `backend/config/`（5 文件），`configuration.md` 后端读取说明由「建设中」更新为已落地，配置架构计划标注阶段 0–2 完成。详见 `Docs/LLM_record/26-07-26/2026-07-26-backend-unified-config-loader-phase2.md`。
- 📘 **OAuth 部署操作手册**：新增 [`Docs/Guide/oauth-deployment.md`](oauth-deployment.md) —— HF 生产环境 Google/GitHub 登录完整配置流程（两家控制台逐步申请、Secrets/Variables 配置、启动日志与 curl 验收自检、本地开发配置、排错速查表）；OAuth 推导链路另做 6 场景 12 断言独立验证，见 `Docs/LLM_record/26-07-26/2026-07-26-oauth-config-derivation-fix-and-verify.md`。

### V3.4.5 (2026-07-26) — 高级 2D 绘制与几何编辑集成

- 🎨 **DrawPanel 富绘制升级**：保留 WebGIS 品牌配色，新增基础/形状/箭头/编辑分组，支持矩形、椭圆、圆轮廓、箭头、风向箭头、军标箭头与选择编辑。
- 🧩 **模块化 feature 库**：新增 `drawingToolRegistry`、`drawingGeometryUtils`、`useDrawingFeatureStyle`、`useAdvancedDrawing`、`useGeometryEdit`，避免把业务逻辑堆进 `MapContainer.vue`。
- 🗺️ **托管图层统一管理**：高级/基础绘制结果均以 `sourceType: draw` 写入 managed layer，进入 TOC/LayerControl 统一显示、隐藏、定位、删除与导出。
- ✏️ **几何编辑会话**：Select + Modify 顶点编辑、删除选中、Escape 退出、撤销最近绘制图层；仅允许编辑 draw 托管图层，避免误改上传/分析数据。
- 🎯 **要素级样式**：边线/填充/虚线/半径/箭头参数/军标渐变，绘制前影响后续绘制，选中后可即时更新当前要素。
- 💄 **注册/登录页 UI 现代化精修**：头部新增品牌徽标 + GIS 经纬网格纹理并压缩高度、功能提示改为胶囊 chip、登录/注册改分段式滑块切换、「确认登陆」升级实色渐变主按钮（游客登陆降为描边次按钮）、输入框 10px 圆角 + 聚焦时图标/标签联动变色、错误提示横幅化、验证码/头像/绑定邮箱/重置弹窗全量对齐新风格；移除表单组 hover 位移抖动，兼容绿/蓝双主题与移动端，纯样式零逻辑改动（详见 `Docs/LLM_record/26-07-26/2026-07-26-register-ui-modernize.md`）。
- 📝 文档同步：版本升至 V3.4.5，补充维护日志与前后端/结构说明。

### V3.4.4 (2026-07-26) — Google/GitHub OAuth 一键注册登录与体积云阴影稳定性修复

- 🆕 **OAuth 一键注册登录**：新增 Google/GitHub 授权起点与回调，首次授权可自动创建本地 registered 用户，后续直接复用 WebGIS session token 登录。
- 🆕 **邮箱用户第三方绑定**：账号中心安全页支持已注册邮箱用户绑定/解绑 Google 或 GitHub 账号，同一 WebGIS 用户可复用第三方账号一键登录。
- 🗄️ **第三方身份表**：新增 `oauth_accounts` 表，使用 `(provider, provider_user_id)` 唯一绑定本地 `users.id`，不保存 provider access token。
- 🔐 **安全控制**：OAuth state 使用 HMAC 签名与短 TTL；GitHub 使用 primary verified email；仅 verified email 可自动绑定/注册，避免未验证邮箱导致账号接管。

- 🐛 **旋转黑闪修复**：`CloudShadowPass` 改为颜色图集 read/write 双缓冲，消费者只读取完整写完的 last-good atlas，避免 clear 中的空纹理被地面采样解码成大面积黑色阴影。
- 🐛 **矩阵/图集错配修复**：CSM `updateShadowCascades()` 每帧执行，仅昂贵 BSM raymarch 受 `bsmUpdateInterval` 节流；相机运动时强制刷新 raymarch，消除屏幕粘滞阴影。
- 🐛 **时域 history 污染修复**：`ShadowResolvePass` 增加 `setFrameState` / `u_resetHistory`，大运动或无效 history 时 hard-reset，避免旧 cascade 重投影造成黑块/拖影。
- 🐛 **贴地稳定性修复**：地面 BSM 仅在可靠 `depth → ECEF` 路径启用；bottom-sphere 兜底不再喂给云影采样；cascade 边界选择降低抖动，修复垂直升降时阴影不贴地的问题。
- 📝 文档同步：版本升至 V3.4.4，补充维护日志与前后端/结构说明。

### V3.4.2 (2026-07-25) — 体积云 BSM 地面阴影底层修复 + Cesium 导航控件集成 + 镇远市 3D Tiles 城市模型 + Demo 演示页面库

- 🐛 **BSM 地面阴影高度淡出**：Aerial/Atmosphere 地面云影新增 `u_cloudShadowAltitudeFadeStart/End`，由 `ThreeGeospatialPipeline` 同步为云顶高度到 `altitudeFadeRange`，相机接近或高于体积云时地面云影与云体同步渐隐，避免俯视云顶时云影遮盖云层上表面
- 🐛 **BSM 地面阴影自然度底层修复**：统一 Cloud/Aerial/Atmosphere 三条 BSM 采样链路的 atlas 解码；地面云影补用 `shadow.a` tail 光学厚度，修复边缘硬截断；移除距离驱动贴合 bottom 球的采样稳定逻辑，避免远处阴影被压平成不自然“贴球滑动”效果
- 🐛 **BSM 地面阴影运行时修复**：`ThreeGeospatialPipeline` 新增 BSM 资源签名与 `_ensureBSMPasses/_destroyBSMPasses` 生命周期管理，三档预设切换或从流畅档手动开启 `useShadowBuffer` 时自动创建/重建 `CloudShadowPass` + `ShadowResolvePass`，不再只依赖 init 时开关
- 🐛 **地面云影动态同步**：`_syncBSM()` 显式推进 wind/evolution offsets 并同步 `shadowTopHeight/shadowBottomHeight` 到 `CloudShadowPass`，地面 BSM atlas 随云形动态更新
- 🐛 **BSM atlas 尺寸残留修复**：`_blitBSM()` 按目标 Cesium.Texture 实际 width/height 设置 viewport，并在 blit 前清空整张共享 atlas，避免 512 → 1024 模式切换时旧阴影残留
- 🎚️ **三档预设云影可见性优化**：保留 smooth 默认关闭 BSM 的性能语义，同时提高 smooth/balanced 手动开启后的 `bsmGroundScale` 基础值
- 🆕 **镇远市 3D Tiles 城市模型**：`frontend/public/tileset/city/` 约 200+ b3dm/json 镇远市腾讯地图3dtiles数据
- 🆕 **Demo 演示页面库**：`Docs/Demo/` 新增 15 个独立演示页面（2D 风场、3D 热力图、大气渲染、北斗定位、OD 飞线、动态标签、海量点加载、地图主题、建筑阴影、近地面盒体、自定义虚线箭头、高德纠偏、通视分析、高度限制分析、聚合点）
- 🆕 **全球风场数据**：`frontend/public/json/wind_globe.json` 全球风场可视化数据
- 🔧 **CI/CD 优化**：`deploy.yml` 删除 tileset 碎片清理步骤、新增 3D 瓦片格式（b3dm/i3dm/pnts/cmpt）Git LFS 追踪、构建流程加速
- 🔧 **Cesium 模块源码内嵌**：cesium-navigation-es6 + cesium-wind-layer 从 npm 依赖迁移为 `src/components/Cesium/` 下内嵌模块，WIn2d 封装层归入 cesium-wind-layer，导航控件高对比度主题 CSS 合并进主样式文件，移除 patch-package 黑盒依赖
- 🆕 **2D 风场模块**：`Wind2D.js` 二维风场可视化独立模块


### V3.4.1 (2026-07-24) — 版本号自动同步：Vite define 从 README.md 注入

- 🔧 **版本号单一事实来源**：根目录 `README.md` 成为版本号的唯一权威来源，`MapContainer.vue` 的 `APP_DISPLAY_VERSION` 不再硬编码
- ⚙️ **Vite define 注入**：`vite.config.js` 构建时自动读取 `README.md`，用正则 `当前版本[^\d]*(\d+\.\d+\.\d+)` 提取版本号，注入为全局常量 `__APP_VERSION__`
- 🎯 **ESLint 兼容**：`eslint.config.js` 添加 `__APP_VERSION__: readonly` 全局声明，避免 no-undef 误报
- 📝 **LLM 工作流简化**：Agent 只需在 `README.md` 中更新版本号，Vue 侧构建时自动同步，无需额外操作

### V3.3.23 (2026-07-24) — 体积云性能优化（默认流畅档 60FPS 路径）

- 🚀 **默认档改为流畅（smooth）**：`DEFAULT_CLOUD_QUALITY` 由 `balanced` 改回 `smooth`，开启体积云即走性能优先路径（关 BSM/丁达尔/Aerial/光晕，低采样）
- 🎚️ **三档重调**：smooth `maxSteps=108`/无 BSM、balanced `maxSteps=156`/BSM 512·每 3 帧、ultra `maxSteps=340`/BSM 1024·每帧（由 500 下调避免极端卡顿），极致档保留全效果但不承诺 60FPS
- ⚡ **CloudShadowPass location 缓存 + 低频渲染**：`createProgram()` 后一次性缓存全部 uniform/attribute location，删除 render() 每帧数十次 `gl.getUniformLocation`；`render(force)` 按 `bsmUpdateInterval` 帧间隔早退，BSM 从每帧全量降为低频更新
- ⚡ **ShadowResolvePass 复用 VBO/location**：`init()` 一次性建 fullscreen VBO，去掉每帧 `createBuffer/deleteBuffer` 与 uniform 查找
- ⚡ **主 shader detail 跳过**：`shapeDetailAmounts` 全 0（流畅档）时 GLSL 整体跳过最重的 3D detail 纹理采样；`u_shadowPcfTaps` 按档位 1/4/8 taps
- 🧹 **每帧对象分配削减**：`_buildCloudUniforms` / `_syncBSM` 引入 `_scratch` 对象池，vec2/3/4 与 Matrix4 全部原地复用（`setCloudShadow` 存引用，复用安全），消除每帧数十个 `new Cartesian*` 的 GC 抖动
- 🎯 **LensFlare 懒创建**：默认档不再常驻镜头光晕全屏后处理 stage，仅面板打开时懒加载
- 🎯 **Vue 参数桥接帧级合并**：deep watch 稳态参数应用改为 `requestAnimationFrame` 合并，滑杆连续拖动同一帧只应用一次；teardown/cleanup 取消挂起回调

详见 [`../LLM_record/26-07-24/2026-07-24-cloud-performance-optimization.md`](../LLM_record/26-07-24/2026-07-24-cloud-performance-optimization.md)

### V3.3.22 (2026-07-23) — 3D Tiles 贴地修复 + ArcGIS 地形性能极致优化

- 🐛 **3D Tiles 贴地高度修复**：模型贴地用 `center.height - radius`（模型底部高度）替代 `center.height`（球心高度），解决模型半埋地下的问题
- 🆕 **ENU 参考系高程范围采样**：在 tileset 外包矩形的 ENU 空间（`eastNorthUpToFixedFrame`）生成均匀网格，`sampleTerrain` 批量采样高程值域，参考洪水模拟 FluidSimulation 采样逻辑
- 🆕 **手动贴地滑杆**：根据高程采样 min/max 生成滑杆范围，用户可手动微调贴地高度，`CesiumToolPanel.vue` 新增 `data-set-height` 事件 + 滑杆控件
- 🐛 **加载时序修复**：高程范围在设置 modelMatrix 之前采样，初始高度取高程中值（`(min+max)/2`），消除"先加载后采样"导致的视觉跳跃
- 🚀 **ArcGIS 地形性能极致优化（三轮迭代）**：
  - `_hasAvailability=false` 禁用内部 Tilemap 二次请求（-50% 网络请求量）
  - 动态 SSE：相机移动时 `maximumScreenSpaceError=12`（阻止 LERC 解码爆发），静止恢复 `=4`
  - 层级硬顶 11（有效 0-11 级 vs 原生 0-15 级，请求量减少 ~87%）
  - 无 Promise 壳开销：`requestTileGeometry` 直接返回内部结果，可用性标记 fire-and-forget
  - `tileCacheSize=500` 提升瓦片缓存命中率
- 🔧 **非 ArcGIS 地形回退默认值**：SSE=2、tileCacheSize=100，不影响其他地形性能

详见 [`../LLM_record/26-07/26-07-23/2026-07-23-terrain-clamping-arcgis-optimization.md`](../LLM_record/26-07/26-07-23/2026-07-23-terrain-clamping-arcgis-optimization.md)

### V3.3.21 (2026-07-23) — Cesium Composables 架构重构（按功能域分层）

- ♻️ **Cesium composables 架构重构**：将 `useCesium.js` 拆分为按功能域分层的 composables 体系——`core/`（viewer 生命周期）、`scene/`（场景参数）、`camera/`（相机控制）、`layers/`（图层管理）、`interaction/`（交互事件）、`terrain/`（地形切换）、`models/`（模型管理）、`dataImport/`（数据导入）、`toolModules/`（工具模块）
- 🆕 **toolModules 控件拆分**：将原先堆积在 `useCesiumToolModules.js` 中的工具模块拆分为独立 composables
- 🆕 **工具函数提取**：`importUtils.js`（导入工具函数）、`layerUtils.js`（图层工具函数），减少 composables 内部重复逻辑

### V3.3.20 (2026-07-22) — 体积云迁移缺陷修复 + 面板参数补全 + 邮件服务加固

- 🐛 **bottomRadius 统一**：`pipeline.params.bottomRadius` 改为从 `atmosphereParams.bottomRadius` 派生，消除云层基准球与相机偏移基准球 ~830m 错位，修复云漂浮高度错误与移动抖动
- 🐛 **BSM 纹理注入修复**：`_bsmResolveGetTexture` 不再返回自定义 `bind()` 裸句柄（Cesium PostProcessStage 不识别），改为返回 `_syncBSM` blit 写入的共享 `Cesium.Texture`，云影/丁达尔稳定生效
- 🐛 **Aerial 双 gamma 修复**：地面像素不再走 `tonemapDisplay`（ACES+gamma），消除底图过曝白雾；新增 `u_aerialPerspectiveScale` uniform 独立控制空中透视对地面的散射强度
- 🆕 **groundAerialScale 分离**：空中透视 stage 对地面的发白程度独立于 Cloud Stage 云体透视（`aerialPerspectiveScale`），面板新增「地面发白」滑杆
- ⬆️ **shadowFar 提升**：40km → 120km，对齐云可见距离量级，消除 cascade 边界硬切与移动时阴影弹出
- ⬆️ **默认性能档改为均衡**：`DEFAULT_CLOUD_QUALITY` 从 `smooth` 改为 `balanced`（云+轻 BSM/光晕），流畅档 maxSteps 140→220、windSpeed/evolutionSpeed 微调
- 🆕 **面板新增控件**：`groundAerialScale`、`magentaFixStrength`（去品红）、`scatterG1/G2`（HG 散射权重）、`distFadeStart/End`（距离衰减）、`maxRayDistance`（最大采样距离）、`shadowSplitLambda`（级联分配）、`shadowFadeScale`（衰减范围）；全部控件补全 tooltip 描述
- 🔧 **shader 来源统一**：`bundledShaders.js` 为唯一真源，`public/` 与 `lib/Shaders/` 标注为镜像；`aerialPerspectiveEffect.frag` 行尾统一 LF
- 🆕 **体积云加载提示**：开启体积云时弹出 toast 提示「需加载约 4 个 8MB 纹理文件，请稍候」，加载完成后自动切换为成功提示
- 🔒 **SMTP 安全加固**：`SMTP_PORT` 环境变量非数字时不再导致模块级崩溃（安全 int 转换 + 默认值 80）；`check_smtp_configured()` 扩展为 USER/PASSWORD/HOST/PORT 四要素校验
- 📧 **邮件发信重试**：`_send_email_sync` 增加 3 次指数退避重试（1s→2s），每次失败打 WARNING 日志
- 📧 **启动 SMTP 配置检查**：`app.py` lifespan 启动时检查 SMTP 配置并打日志（脱敏显示 SMTP_USER）
- 🐛 **体积云高度渐变淡出**：修复相机升过云顶后云层突然消失——`getRayNearFar` case3 的 near 改为射线进入云顶球面的实际距离（`first.z`），不再从相机近裁面出发耗尽步数；新增 `altitudeFadeRange` 参数（面板「高度淡出范围」），云顶以上线性淡出（流畅 6km / 均衡 8km / 极致 10km）
- 🐛 **云底颜色修复**：云底不再纯黑——`skyGradient` 底部最低值从 0.5 提升到 0.7，新增环境光地板（`skyColor * 0.2`）模拟地面反射与深层多次散射，云底呈自然浅灰色

详见 [`../LLM_record/26-07/26-07-22/2026-07-22-cloud-migration-defect-fix.md`](../LLM_record/26-07/26-07-22/2026-07-22-cloud-migration-defect-fix.md)

### V3.3.19 (2026-07-21) — Cesium 体积云·大气一体化模块（cesium-clouds-atmosphere 移植）

- 🆕 **体积云 + Bruneton 大气集成**：将 `cesium-clouds-atmosphere`（three-geospatial Cesium 移植版）作为正式三维特效模块接入。覆盖体积云 raymarch（多层 + 形状/细节 3D 噪声 + weather 图 + 湍流）、Bruneton 预计算大气（天空 + 太阳圆盘）、空中透视、Beer Shadow Map（云地投影 + 丁达尔光柱）、可选镜头光晕 Bloom、原生 WebGL PBO TAA
- 🆕 **`Cloud/` 模块重写**：原空目录恢复实现，源码以 `Cloud/lib/**` 内联（21 文件，~173KB JS + ~60KB GLSL bundle），新增 Vue 桥接 `setupCloudIntegration` / `cloudParamsApply` / `assetConfig` / `getCesium`，移除对 `dat.gui` 的硬依赖（默认 `enableGui=false`，调试面板由工具面板取代）
- 🆕 **静态资源**：拷贝云 3D 纹理 ~3.8MB（复用 `public/textures/cloud/` 同源 + 补 `stbn.bin`）、Bruneton 大气 LUT ~24MB、蓝噪声、shader GLSL 到 `public/cloud-atmosphere/`，路径通过 `import.meta.env.BASE_URL + 'cloud-atmosphere/'` 解析，兼容 GitHub Pages 子路径部署
- 🆕 **懒加载生命周期**：`cloudsEnabled=false` 时不加载任何资源、Cesium 原生大气保持开启；`true` 时关闭 `skyAtmosphere`/`skyBox` 由 Bruneton 接管，再次关闭 / 组件卸载销毁管线并恢复天空快照
- 🔧 **工具面板体积云卡片重写**：移除 `cloudCoverage` / `cloudQuality` / Frostbite 旧字段，改为三层云覆盖 + 层高/层厚、太阳/云曝光、BSM 阴影/丁达尔、LensFlare Bloom/鬼影/Halo 等共 ~28 个控件；状态文本改为「云+BSM/仅体积云/未启用」
- 🔧 **ESM 适配**：库源码使用裸 `Cesium.xxx`，ESM 打包后会未定义。通过 `Cloud/lib/getCesium.js` + 各模块顶部 `const Cesium = getCesium()` 绑定本地常量，避免对 `window.Cesium` 的隐式依赖
- ⬆️ **Cesium CDN 升级 1.122 → 1.132**：`Cesium.Texture3D` 自 1.130 才引入，1.122 下体积云管线初始化抛 `TypeError: Cesium.Texture3D is not a constructor`；统一升到库官方验证的 1.132 以解锁大气 LUT 与 stbn 的 3D 纹理路径
- 📚 **文件结构同步**：`Docs/Guide/frontend-structure.md` 中 `Cloud/` 树从原 TypeScript 描述更新为新 lib 内联架构

### V3.3.18 (2026-07-21) — Agent 系统提示词平台简介集成 + 八大功能架构文档

- 🆕 **平台简介注入系统提示词**：`agentToolsSchema.js` 的 `buildSystemPromptWithTools()` 在工具说明前新增「平台简介」章节（2D/3D 双引擎、20+ 底图源、多格式数据导入、空间分析、路径规划、三维特效、实用工具、账号体系），用户询问"平台有什么功能/特色"时 AI 助手可准确作答
- 🔧 **助手身份句扩写**：系统提示词开头由"你是一个 WebGIS 地图助手"改为"运行在「WebGIS 3.0」平台上"，并附加"平台问题简洁回答、操作问题引导使用面板"的行为指引
- ℹ️ **三种 AI 模式全覆盖**：平台简介经 `_injectToolPromptIntoHistory()` 注入 history，默认 AI / 个人 Key / 后端代理模式均生效；原有三个工具调用规范与 XYZ URL 表不变
- 📚 **八大功能架构文档**：`Docs/Architecture/` 新增 8 份功能架构说明（2D/3D 双引擎、底图源体系、多格式数据导入、空间分析、路径规划、三维特效、实用工具、账号体系），风格统一（功能定位/文件结构/算法原理/参数表/局限与升级方向）；README 新增「架构文档」章节与跳转表格。其中三维特效文档如实标注了 README 历史描述与当前代码的差异（TAAU/BSM Shadow TAA/大气散射 LUT/wind-core 等已不存在）

详见 [`../LLM_record/26-07/26-07-21/2026-07-21-Agent系统提示词平台简介集成.md`](../LLM_record/26-07/26-07-21/2026-07-21-Agent系统提示词平台简介集成.md)

### V3.3.17 (2026-07-19) — 分享链接隐私过滤 + 3D Tiles ZIP/文件夹导入 + 管理员密码安全加固 + 后端模型选取去随机化

- 🆕 **3D Tiles ZIP/文件夹导入**：`CesiumToolPanel.vue` 新增 ZIP导入/文件夹导入 按钮，`useCesiumDataImport.js` 实现 ZIP 解压（JSZip）→ blob URL 映射 → tileset.json content URL 重写→ Cesium3DTileset 加载，兼容 3D Tiles 1.0/1.1 content 格式
- 🆕 **3D Tiles 本地文件 file:// URL 优先**：`loadTileset` 优先使用 `file.path` 构造 file:// URL 保留相对路径解析能力（Electron），无路径时回退到 blob URL
- 🔒 **管理员密码安全加固**：移除硬编码 `DEFAULT_ADMIN_PASSWORD_LOCAL="123456"`，`_get_admin_password()` 仅在 `APP_ENV=development` 时使用开发默认密码，生产环境 SUPER_USER 未设置则禁用管理员登录（HTTP 503）
- 🐛 **后端模型选取去除随机化**：`_pick_runtime_model` 移除 `random.choice(pool)` 逻辑，管理员在数据库 `system_config.agent_model` 中配置的模型不再被随机选取覆盖，新的优先级为：用户覆盖 > 用户偏好 > 管理员配置 > 环境默认值
- 🗑️ **清理废弃代码**：移除 `import random`（已无其他用途），`model_source="provider-random"` 字符串不再出现
- 🔒 **分享链接隐私过滤**：点击「分享」生成的链接不再包含 `ut`（用户身份）、`loc`（定位授权来源）、`p`（GPS 编码位置）三个用户私有参数；`cs`（罗盘）仅在启用时保留；`cv`（Cesium 相机姿态）等视图还原参数全部保留

详见 [`../LLM_record/26-07/26-07-09/2026-07-09-后端代理模式模型随机选取修复.md`](../LLM_record/26-07/26-07-09/2026-07-09-后端代理模式模型随机选取修复.md)

### V3.3.16 (2026-07-06) — 路径规划搜索集成 + 注记图层 HD 兼容 + 错误处理优化

- 🆕 **驾车/公交规划集成天地图搜索**：`MapPointPickerCard.vue` 新增起点/终点关键词搜索输入框 + 下拉结果列表，AbortController 防竞态保护，支持键盘导航（方向键/Enter）和鼠标选择
- 🆕 **注记图层 HD 兼容**：新增 `withSkipHighResTile` 辅助函数，4 个 `category='label'` 图层（天地图 cia/cva、GeoVIS cia、高德注记）跳过 `zDirection` 高清瓦片优化，避免注记文字在非整数 zoom 时显示过小
- 🆕 **TokenMissingError 语义化错误**：驾车规划新增 `TokenMissingError` 自定义错误类，Token 缺失时显示明确配置提示
- 🔧 **错误判断修复**：移除 `e instanceof TypeError` 网络错误判断（误捕渲染链路 TypeError），改用 `/failed\s+to\s+fetch/i` 精准识别
- 🔧 **调试/渲染顺序调整**：驾车规划先更新调试信息再执行地图渲染，确保渲染失败后调试数据不丢失
- 🔧 **公交规划 Token 前置校验**：构建请求 URL 前检查 Token 是否为空，空则抛语义化错误
- 🐛 **Edit 工具重复内容修复**：清理 `MapPointPickerCard.vue` 中因连续 Edit 替换导致的重复 import/props/emits/代码块

详见 [`../LLM_record/26-07/26-07-06/2026-07-06-路径规划搜索集成与bug修复.md`](../LLM_record/26-07/26-07-06/2026-07-06-路径规划搜索集成与bug修复.md)

### V3.3.15 (2026-07-02) — GPS 定位授权逻辑修复

- 🐛 **修复定位授权逻辑**：仅当用户明确授权 GPS 定位（`source === 'gps'`）时，才在 URL 中设置 `loc=1` 并将坐标编码写入 `p` 参数
- 🐛 **IP 定位不再写入 `loc=1` 和 `p` 参数**：IP 定位仅保留全局定位上下文供内部使用，URL 参数保持 `loc=0`、`p=0`
- 🔧 **`useUserLocation.js::markLocationSuccessFlagInUrl()`**：新增 `source` 参数，仅 GPS 定位时写入 `loc=1`
- 🔧 **`useMapState.js::resolveLocationState()`**：重构为解析定位授权状态，新增 `hasGpsAuthorization` 和 `urlHasLocFlag` 字段
- 🔧 **`useMapState.js::resolvePositionCode()`**：仅 `hasGpsAuthorization` 为 true 时编码 GPS 坐标到 `p` 参数
- 🔧 **`useMapState.js::parseUrlToState()`**：仅 URL 中 `loc=1` 时解码 `p` 参数
- 🔧 **`useMapState.js::buildQuery()`**：基于 `shouldSetLoc` 同步设置 `loc` 和 `p` 参数

详见 [`../LLM_record/26-07/26-07-02/2026-07-02-gps-location-auth-fix.md`](../LLM_record/26-07/26-07-02/2026-07-02-gps-location-auth-fix.md)

### V3.3.14 (2026-06-29) — 下载底图跳转修复 + 标注功能修复 + TOC 缓存系统修复 + TIF 渲染优化 + CesiumContainer 全面 Code Review

- 🐛 **修复"下载底图"按钮无法跳转到工具箱下载Tab**：HomeView.vue 中 `<SidePanel>` 组件遗漏 `:toolbox-tab="toolboxTab"` 属性绑定
- 🐛 **修复标注功能 4 个问题**：重复 Toast 消息、catch 正则遗漏"地图已卸载"、await 后地图存活校验缺失、选点模式无 crosshair 光标指示
- 🐛 **修复 TOC 缓存系统（统一修复 3 个 Bug）**：`layerTree` 缓存键仅含图层 ID，导致重命名、可见性勾选、透明度滑杆的 UI 变更均不生效
- 🚀 **单波段 TIF 渲染范围优化**：从 2%-98% 百分位截断改为智能 nodata 检测 + 全有效范围渲染。新增 `detectDataRange()` 函数（哨兵值 3σ 检测 + GAP 离群检测），有效数据不再被截断
- 🔍 **CesiumContainer.vue 全面 Code Review（6 维度审查）**：修复 3 个严重 Bug（体积云清理解构错误、大气系统双写冲突、重试路径资源泄漏）+ 4 个中等问题（异步循环守卫、bootCesium 并发保护、重试上限硬顶、FPS 调试面板移至 DEV）+ 代码规范改进（JSDoc、死代码清理、回调清理）

详见 [`../LLM_record/26-06/06-29/`](../LLM_record/26-06/06-29/) 目录

### V3.3.13 (2026-06-28) — LLM 参数动态配置管理（管理员后台）

- 🆕 **管理员控制台新增 LLM 参数配置面板** (`AdminControlPanel.vue`)：支持动态修改后端运行时读取的 Agent 对话参数，修改后**无需重启服务即时生效**
- 🆕 **可配置参数**：Base URL、Model、Available Models 列表、Timeout、Max Tokens、Temperature (1.0)、Top P (0.95)、Extra Body (JSON)、System Prompt、Stream、Guest/Registered 每日额度
- 🆕 **后端动态读取机制**：所有参数存储在数据库 `system_config` 表，后端运行时通过 `_get_agent_provider_config_sync()` 实时读取，前端 AI 助手、Agent 对话、模型列表等功能统一使用这些配置
- 🔧 **默认参数已标准化**：Temperature=1、Top P=0.95、Max Tokens=32768、Extra Body 包含 `chat_template_kwargs.enable_thinking=true` 和 `reasoning_budget=16384`
- 🔧 **前后端链路一致性**：`ApiKeysManagementPanel.vue`、`ChatPanelContent.vue` 均从后端动态获取配置，彻底消除硬编码

### V3.3.12 (2026-06-27) — 体积云模块重构 + 洪水模拟 + 漫游导航指引

- 🆕 **体积云独立模块** (`Cloud/`)：从 `CesiumAdvancedEffects.vue` 提取为独立 TypeScript 模块（CloudManager / CloudPresets / CloudUniforms / cloudIntegration / useVolumetricCloud / 4 个 GLSL Shader / 纹理资源）
- 🆕 **洪水模拟功能**：通过 `useCesiumToolModules.js` 控制中心接入「洪水模拟」按钮 + 动态速度滑块（默认值域÷10，10s 完成），`FluidSimulationPanel.vue` 提供 `requestAnimationFrame` 水位自动上涨动画
- 🆕 **漫游导航指引** (`NavGuideHUD` + `NavTargetDialog`)：三选一对话框（搜索/数据要素/地图点选），屏幕顶部方向箭头 + 距离，Selection Indicator 持久聚焦，导航独立于漫游状态
- 🆕 **漫游坐标显示** (`PlayerController`)：漫游模式下实时显示人物世界坐标
- 🆕 **漫游相机速度同步** (`CameraSystem`)：相机移动速度与漫游速度参数联动
- 🔧 **CesiumAdvancedEffects.vue**：删除体积云相关代码，改为调用 Cloud/ 模块
- 🔧 **useCesiumToolModules.js**：体积云控件重构为独立 `cloudParams` + 洪水模拟/导航 action/control/state

### V3.3.11 (2026-06-26) — 人物漫游控制器集成（第一/第三人称 + Rapier 物理）

- 🆕 **人物漫游控制器** (`PlayerController/`)：集成 cesium-player-controller，支持第一/第三人称视角切换、WASD 移动、跳跃、飞行模式
- 🆕 **Rapier 物理碰撞**：胶囊体碰撞 + 地形碰撞 + 射线避障，角色可在 3D Tiles 和地形上行走
- 🆕 **动画状态机**：idle/walk/run/jump/fly 多动画自动切换，支持三段跳跃
- 🆕 **弹簧相机**：第三人称弹簧阻尼跟随 + 过肩视角 + 射线防穿墙
- 🆕 **操作提示面板** (`PlayerGuidePanel.vue`)：右上角悬浮键位说明，实时显示视角/飞行状态
- 🆕 **控制台调试参数**：行走速度、飞行速度、重力、跳跃高度、鼠标灵敏度滑块实时调节
- 🆕 **Cesium ESM 垫片** (`cesium-shim.js`)：桥接 CDN Cesium 与 npm ESM 导入，消除双实例冲突
- 🔧 **Vite 配置**：添加 `cesium` alias + `optimizeDeps.exclude`，确保单一 Cesium 实例
- 🐛 **修复人物漫游面板滑块类型**：控件 `type: 'slider'` → `type: 'range'`，与项目统一的 `lil-gui` 渲染管线对齐，修复滑块降级为文本输入框的问题
- 🐛 **修复 ArcGIS 地形无法被漫游系统识别**：新增 `ArcGISTerrainProvider` 增强包装器（参照天地图 `GeoTerrainProvider` 补充 `availability` + `getTileDataAvailable`），使 `sampleTerrainMostDetailed` 原生支持 ArcGIS 地形 + 降级兜底到 `sampleTerrain(17)`
- 🐛 **修复 ArcGIS 包装器 availability 精度问题**：逐级标记所有层级（0→maxLevel）全球可用，修复 `getMaximumLevelAtPosition` 返回 0 导致采样最低精度的 bug

详见 [`../LLM_record/26-06/26-06-26/2026-06-26-player-controller-integration.md`](../LLM_record/26-06/26-06-26/2026-06-26-player-controller-integration.md)

### V3.3.10 (2026-06-26) — 大气系统清理 + 场景美化 + 热带浅水 + Tellux 模块移植

- 🆕 **场景美化模块** (`useCesiumBeautify.js`)：HDR + PBR_NEUTRAL 色调映射 + FXAA + 定向光 + 天空大气微调，控制面板可调
- 🆕 **热带浅水场景** (`ShallowWater/`)：Three.js 叠加层，焦散/折射/物理吸色/体积云/闪电
- 🆕 **模型管理器** (`useCesiumModelManager.js`)：glTF/GLB 模型加载、地理坐标定位、动画控制
- 🆕 **增强相机** (`useCesiumCameraEnhanced.js`)：弹簧物理相机、自定义缓动、飞行队列
- 🆕 **高度采样器** (`useCesiumHeightSampler.js`)：地形高度查询、批量异步采样、屏幕坐标拾取
- 🆕 **大气高度阈值**：相机低于 800m 自动关闭大气增强，避免与晨昏半球冲突
- 🔧 **移除 AtmosphereManager**：删除 `atmosphere/` 目录（14 个文件），清理 CesiumContainer.vue
- 🔧 **移除旧体积云**：删除 `Clouds/` 目录（12 个文件），由 CesiumAdvancedEffects 内置体积云替代
- 🔧 **晨昏半球无限高度**：`lightingFadeOutDistance` / `nightFadeOutDistance` 改为 MAX_SAFE_INTEGER
- 🔧 **大气光照强度调优**：`atmosphereLightIntensity` 从 11.5 调整为 5.5
- 🐛 **修复 CesiumAdvancedEffects.vue BOM 头**
- 📝 **完整文档**：详细的移植日志和技术文档

详见 [`../LLM_record/26-06/26-06-26/2026-06-26-tellux-atmosphere-migration.md`](../LLM_record/26-06/26-06-26/2026-06-26-tellux-atmosphere-migration.md)

### V3.3.9 (2026-06-26) — 大气 LUT 纹理集成修复 + TAAU 时序上采样 + BSM Shadow TAA + 模块卡片 UI 清理

- 🐛 修复 `CesiumAdvancedEffects.vue` 和 `FluidSimulationPanel.vue` 文件开头的 UTF-8 BOM 头问题。
- 🐛 修复 `atmosphereLutResources.js` 资源销毁保护，添加 try-catch 防止单个纹理销毁失败阻断后续清理。
- 📝 为 GLSL 和 JS 中的大气散射物理常数添加详细注释（Rayleigh/Mie 散射系数、标高等）。
- ✅ 验证阶段三（大气保真）实现完整，包括 LUT 纹理创建、大气透视合成、天空辐照度计算。
- 🆕 新增 `useCesiumTemporalUpsampling.js` 模块，实现 TAAU 16x 上采样、方差裁剪、速度重投影、STBN 蓝噪声。
- 🆕 新增 `shadowResolveShaders.js` 模块，实现 BSM Shadow TAA 时序抗锯齿。
- 🔧 集成 TAAU Resolve Stage 到 Cesium PostProcessStage 渲染管线，实现完整生命周期管理。
- 🆕 完善质量预设系统，新增 `ultra` 档位（stepCount: 128, maxDistance: 720000）。
- 🧹 清理 CesiumToolPanel.vue 引入 lil-gui 后遗留的约 200 行废弃 CSS（`.control-row` / `.control-label` 等手写控制样式）
- 🎨 模块卡片视觉增强：左侧渐变色条 + 图标升级 + hover 阴影 + 展开动画 + 状态圆点指示器
- 🐛 隐藏 LilGuiControls 重复标题（lil-gui title 与 module-head 标题冲突）
- 🐛 **Code Review 三轮修复（30 个问题）**：shadowResolveShaders GLSL 兼容性（FRAG_COLOR/SAMPLE_TEX/version guard）；质量预设统一（useCesiumToolModules 导入 QUALITY_PRESETS）；TAAU 每帧 GC 优化（scratch Cartesian2）；resolution uniform 窗口缩放同步；atmosphereLutResources 移除 viewer 引用；cleanup 补全 matrices 置 null；移除未使用的 shader uniform/config/字段；FluidSimulationPanel 死 CSS 清理
- 🐛 **修复 Cesium → OL 图层同步**：`setBaseLayerActive` ID 类型不匹配（`layerList` 存储图层源 ID，`selectedLayer` 存储预设 ID），简化为直接设置 `selectedLayer.value`
- 🚀 **体积云性能优化**：减少阴影计算步数（-55%）、LOD 距离优化（-65%）、远处禁用昂贵阴影（-85%）、自适应步长、更激进的早期终止、分辨率缩放模块

详见 [`../LLM_record/26-06/26-06-26/2026-06-26-atmosphere-lut-integration-fix.md`](../LLM_record/26-06/26-06-26/2026-06-26-atmosphere-lut-integration-fix.md)、[`../LLM_record/26-06/26-06-26/2026-06-26-module-card-ui-cleanup.md`](../LLM_record/26-06/26-06-26/2026-06-26-module-card-ui-cleanup.md)、[`../LLM_record/26-06/26-06-26/2026-06-26-code-review-taau-lilgui-fix.md`](../LLM_record/26-06/26-06-26/2026-06-26-code-review-taau-lilgui-fix.md) 和 [`../LLM_record/26-06/26-06-26/2026-06-26-cloud-performance-optimization.md`](../LLM_record/26-06/26-06-26/2026-06-26-cloud-performance-optimization.md)

### V3.3.8 (2026-06-22) — 暂存区 Code Review 修复

- 🐛 修复 `useCreateManagedVectorLayer.js` 在图层 ID 创建前备份样式导致的 `id` 时序错误。
- 🐛 修复 `clearManagedFeatureHighlight(feature)` 旧调用链缺少 `layerId` 时无法通过 Pinia store 清理高亮的问题。
- 🐛 修复 `forEachFeatureAtPixel` 返回值语义误用，确保点击命中统计可继续遍历。
- 🧹 清理维护日志 trailing whitespace，保证 Git whitespace 检查通过。

详见 [`../LLM_record/26-06/26-06-22/2026-06-22-fix-staged-feature-highlight-review.md`](../LLM_record/26-06/26-06-22/2026-06-22-fix-staged-feature-highlight-review.md)

### V3.3.8 (2026-06-21) — 要素高亮 Pinia 化 & 连续多选样式持久化

#### ✨ 要素高亮系统重构

把高亮状态从 composable 闭包迁移到 Pinia store，彻底解决"连续多选样式丢失"问题。

| 改动 | 文件 |
|------|------|
| 🆕 新增 Pinia store | `frontend/src/stores/useFeatureStyleStore.ts` |
| 🆕 新增 FeatureKey 工具 | `frontend/src/utils/map/featureKey.js` |
| ♻️ 闭包变量 → 薄壳 store | `frontend/src/composables/map/features/useManagedFeatureHighlight.js` |
| ♻️ 支持 Ctrl/Shift 多选 | `frontend/src/composables/map/features/useMapEventHandlers.js` |
| 🐛 TOC 移除图层联动清理 | `frontend/src/stores/useTOCStore.ts` |
| 🐛 `syncLayers` 差量清理 | `frontend/src/stores/useLayerStore.ts` |
| 🐛 `setStyle(null)` 前备份样式 | `useCreateManagedVectorLayer.js` + `useUserLayerActions.js` |

详见 [`../LLM_record/26-06/26-06-21/2026-06-21-feature-style-pinia-multi-select.md`](../LLM_record/26-06/26-06-21/2026-06-21-feature-style-pinia-multi-select.md)

#### ✨ 增强要素属性 HTML 解析

`useLayerMetadataNormalization.js` 重写表格解析器：

- ✅ `<thead>` 列索引表头映射（`name`/`value` 列自动识别）
- ✅ `<dl>/<dt>/<dd>` 定义列表支持
- ✅ `<Null>` 占位符归一化（OSM / Cesium / GeoServer 约定）
- ✅ 嵌套表格命名空间（`parent.child`）
- ✅ 同名多值合并
- ✅ `<script>` / inline 事件 / `javascript:` URL 主动剥离

**修复用户截图**：属性表 `description` 字段从一长串乱码展开为多行字段。

详见 [`../LLM_record/26-06/26-06-21/2026-06-21-enhance-html-attribute-parser.md`](../LLM_record/26-06/26-06-21/2026-06-21-enhance-html-attribute-parser.md)

#### 🐛 高亮 Pinia 化后置修复（2026-06-21 同日补遗）

针对前两条改造的 Code Review 发现修复：

- 🐛 **`useFeatureStyleStore.ts` TS 类型缺失**：`highlightFeature` 内 `targets` 数组元素补充 `feature: any` 字段类型；`syncLayerHighlights` 的 `callbacks` 默认值类型显式声明 `cb = callbacks || {}`，消除 `Property 'restoreStyle'/'lookupFeature'/'applyHighlight' does not exist on type '{}'` 报错
- 🐛 **`useMapUIEventHandlers.js` 破坏性重命名回滚**：`zoomToManagedFeature` 恢复原参数名，`void zoomToManagedFeature` 保留契约引用，避免调用方传参静默失效
- 🐛 **`useLayerMetadataNormalization.js` dl 合并顺序反**：修正 `{ ...dlParsed, ...next }` → `{ ...next, ...dlParsed }`，避免解析值被原 attributes 覆盖
- ♻️ **`useManagedFeatureHighlight.js` 封装性回填**：删除对 store state 的直接操作（`store.highlightedFeatures.delete` 等），统一通过 `store.clearHighlight` 行动
- ♻️ **抽离 `getFeatureIdFromFeature` 工具函数**：消除 4 处重复的 `getId() ?? get('_gid') ?? get('id')` 回退逻辑，统一到 `utils/map/featureKey.js`

详见 [`../LLM_record/26-06/26-06-21/2026-06-21-fix-feature-style-store-types-and-bugs.md`](../LLM_record/26-06/26-06-21/2026-06-21-fix-feature-style-store-types-and-bugs.md)

---

### V3.3.8 (2026-06-19) — Cesium 数据导入 + 底图预设统一

- 🆕 Cesium 数据导入（GeoJSON / KML / KMZ / SHP / GLB / GLTF / CZML / 3D Tiles）
- 🆕 Cesium OSM Buildings + Google Photorealistic 3D Tiles 叠加层
- 🆕 底图预设统一接入（OL / Cesium 共用 `BASEMAP_PRESETS`）
- 🆕 字体栈 CSS 变量（`--font-*`）
- 🐛 `buildShareMarkedUrl` 中 `loc` 提前重置导致分享链接 `p` 参数丢失
- 🐛 Code Review 修复（响应式转发 / KMZ BlobURL 泄漏 / Dialog 重入 / 键盘可达性等）

详见 [`../LLM_record/26-06/26-06-19/`](../LLM_record/26-06/26-06-19/)

---

### V3.3.6 (2026-06-18) — OL / Cesium URL 双向视图同步

- 🆕 `view=ol|cesium` 引擎参数，刷新 / 分享可恢复 2D / 3D 面板
- 🆕 `viewScaleConverter.js`（OL zoom ↔ Cesium camera height 换算）
- 🆕 `urlConstants.js` + `urlQueryReader.js`（URL 统一管理）
- 🐛 Cesium 默认中国中心相机高度 `15,000,000m → 6,000,000m`

---

### V3.3.5 (2026-06-15) — 运行时 Token 池 + 备用 Token

- 🆕 `/api/runtime-config/map-tokens` 运行时下发天地图 / Cesium 主备 token 池
- 🆕 高德 / Agent / 天地图 / Cesium Ion 四类 API 备用 token 管理面板
- 🆕 2D / 3D 视图初始化失败自动尝试备用 token

---

### V3.3.0 (2026-06-05) — Chat Function Calling GIS + 404 兜底

- 🆕 Agent Function Calling 三层降级（原生 → 文本解析 → 关键词意图）
- 🆕 `agentToolsSchema.js` / `AgentExecutor.js` / `GISCommander.js`
- 🆕 `stores/useChatStore.ts` Chat 工具调用状态
- 🆕 `views/NotFoundView.vue` 404 兜底页面

---

### V3.2.9 (2026-06-04) — WebGL 栅格渲染器

- 🆕 `dataImport/webglRasterRenderer.js` GPU 并行像素处理
- 🚀 10000×10000 TIF 渲染 `3-5 秒 → <50ms`（60-100 倍提升）

---

### V3.1.0 — 在线底图下载

- 🆕 `MapDownloader.vue` 底图源选择 + 范围选择 + 异步任务
- 🆕 `useDownloadStore.ts` 下载任务 Pinia 状态
- 🆕 `api/download.js` 任务提交 / 轮询 / 文件下载

## 更早版本

### 🔄 V3.0.7 (2026-05-01)
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
