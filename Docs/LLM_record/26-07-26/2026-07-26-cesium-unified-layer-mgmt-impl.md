# Cesium 统一图层管理落地：两步走全量实施（V3.4.33）

## 日期和时间

2026-07-26 20:24（北京时间）

## 事件逻辑链条分析

- **核心症状**：Cesium 导入数据无可见性/透明度控制，且不进侧栏 TOC——与 2D 图层管理割裂（详见设计文档问题章节）。
- **根本原因**：导入记录为组件内私有 ref、无元数据层；Cesium 对象不能进响应式系统使其无法直接复用 2D store。
- **受影响模块**：stores/layer（新增 2 文件 + useLayerStore 拼树）、TOC 动作链（新增分流器 + TOCPanel 两处加法）、Cesium 容器与数据页签、dataImport（新增类型适配器，主逻辑零改动）。
- **解决思路**：按已评审设计文档 `Docs/Architecture/cesium-unified-layer-management.md` 实施；4 个决策点拍板——分组内平铺、2D 隐藏、数据生命周期跟随容器（卸载即清档，"2D 隐藏"由此自动成立）、矢量透明度二期。

## 修改内容

**新增（4 文件）**
1. `stores/layer/cesiumLayers.ts`：Pinia 元数据店——`CesiumLayerRecord`（可序列化，禁含 Cesium 对象）；`syncFromImport` 差量同步（新增建档默认可见/不透明、消失删档、保留用户改过的 visible/opacity/name）；`setVisible/setOpacity/rename/flyTo/remove` actions（先改元数据再转发 adapter，无 adapter 降级纯元数据）；`registerAdapter/unregisterAdapter`（注销即清档）。
2. `stores/layer/cesiumLayerNodeBuilder.ts`：记录 → TOC 节点映射——`CESIUM_NODE_PREFIX='cesium:'`；节点形状对齐 `toLayerNode` 契约（actions 只开 zoom/remove + 内建显隐/透明度/重命名，`zoomEvent:'zoom-layer'`/`removeEvent:'remove-layer'`）；`buildCesiumDataGroup` 生成「三维数据 (N)」folder 节点（展开态持久化键 `cesium-data-group`，0 记录返回空数组）。
3. `composables/map/toc/actions/cesiumTocActions.js`：TOC 动作分流器——`handleCesiumLayerTreeAction(evt, store)` 按 id 前缀拦截，映射 toggle-layer-visibility/change-layer-opacity/rename-layer/zoom-layer/view-layer/remove-layer → store actions，未知 cesium 前缀动作兜底消费防误入 2D 链。
4. `components/Cesium/composables/dataImport/dataSourceDisplay.js`：句柄侧类型适配器——`setRecordVisible`（统一 `.show`，TIF 同步 heightMesh）；`setRecordOpacity`（tif→ImageryLayer.alpha；gltf→Model.color 白乘 alpha；3dtiles→Cesium3DTileStyle 合成，alpha≥1 清 style 还原交回材质模式；矢量类留二期）。

**改动（4 文件）**
5. `stores/useLayerStore.ts`：`layerTree` computed 树顶拼接 `buildCesiumDataGroup(cesiumLayersStore.records, expandedState)`。
6. `components/Layer/TOCPanel.vue`：`handleLayerTreeAction` 顶部（context handler 之前）接入分流器；imports + store 实例两处加法，2D 路径零改动。
7. `components/Cesium/CesiumContainer.vue`：watch `loadedDataSources` 差量入店（immediate）；注册 adapter（setVisible/setOpacity 走类型适配器 + `requestRender`，flyTo/remove 复用 dataImport 既有 API）；`onUnmounted` 注销并清档。
8. `components/Cesium/CesiumToolPanel.vue`：卡片渲染源改为 `displaySources`（句柄记录 + store 元数据合并视图，特化功能字段不受影响）；卡片头新增 Eye/EyeOff 显隐按钮；标题双击重命名（Enter/blur 提交、Esc 取消，maxlength 60）；`supportsOpacity` 类型显示透明度滑杆行（复用 control-row/tileset-slider 设计语言）；隐藏态卡片 `.is-hidden` 降透明 + 标题弱化；新增行内输入框样式。

## 修改原因

执行已评审的统一图层管理设计文档（用户批准"选最优方案执行"），消除 3D 数据管理割裂；实现方式严格贴合项目既有架构（toLayerNode 契约、TOCPanel capabilities 驱动、Pinia 直更先例、lucide 图标、主题变量设计语言）。

## 影响范围

3D 数据管理体验（卡片 + TOC 双入口同源互通）；2D 图层全链路零行为变化（分流器在最前返回，未命中前缀直接放行）；导入 loaders 零改动（watch 差量同步）。风险面收敛在设计文档 §8 已列各项。

## 优化解决方案

相对设计稿的实施优化：①「2D 模式隐藏分组」无需引入响应式 mapView 状态——数据生命周期跟随容器的决策使 records 在切 2D 时自动清空、分组自然消失；②卡片渲染用"句柄记录 + 元数据"合并视图而非替换数据源，保住高程/材质/重定位/拉伸等特化功能零回归；③adapter 的 setVisible/setOpacity 后显式 `requestRender`，兼容按需渲染模式。

## 性能指标

元数据店操作 O(n) 于数据源数量（通常 <20），可忽略；watch 差量同步仅在导入/删除时触发；无每帧逻辑。

## 测试方案

- **已验（静态）**：8 个新改文件 ESLint 零告警（修复 CesiumToolPanel Eye 图标重复导入）；全项目 `tsc --noEmit` 中 cesiumLayers/cesiumLayerNodeBuilder/useLayerStore 零错误；文件树 3 处补录与实际一致。
- **待实机回归**：
  1. 3D 导入 GeoJSON/GLB/TIF/3D Tiles 各一 → 数据页签卡片出现眼睛/滑杆（按类型）、TOC 树顶出现「三维数据 (4)」；
  2. 卡片关眼睛 → 场景隐藏 + TOC 复选框同步；TOC 改透明度/重命名/定位/移除 → 卡片与场景同步（双入口互通）；
  3. TIF 拉伸高程后关显隐 → heightMesh 同步隐藏；tileset 调透明度后切材质模式 → 最后操作生效、alpha 拉回 100% 还原；
  4. 切 2D → TOC 分组消失；回 3D 重新导入正常；反复导入/删除无幽灵记录；
  5. 2D 回归：绘制/上传/搜索/区划图层的可见性、右键菜单、属性表、拖拽分组全部原行为。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\layer\cesiumLayers.ts（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\layer\cesiumLayerNodeBuilder.ts（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\toc\actions\cesiumTocActions.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\dataImport\dataSourceDisplay.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\useLayerStore.ts
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Layer\TOCPanel.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\CesiumContainer.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\CesiumToolPanel.vue
- D:\Dev\GitHub\WebGIS-Dev\Docs\Architecture\cesium-unified-layer-management.md（状态更新为已实施 + 决策点记录）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md（文件树补录 4 文件）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.33 三处 + 版本表保留最新三条）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.33 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-cesium-unified-layer-mgmt-impl.md（本日志）

> 备注：未执行任何 git 操作，提交由用户决策。
