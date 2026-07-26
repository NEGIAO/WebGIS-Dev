# 更新日志（CHANGELOG）

> 📌 本文件由根 [README](../../README.md) 的「版本演进」章节拆分而来，记录项目完整版本历史。最新版本摘要见 README「版本演进」章节。返回 [README 首页](../../README.md)。

---

## 版本记录

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
