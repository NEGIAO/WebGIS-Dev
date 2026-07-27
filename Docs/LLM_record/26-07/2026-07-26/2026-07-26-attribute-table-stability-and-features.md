# 属性表稳定性修复与功能补全（V3.4.18）

## 日期和时间

2026-07-26 19:15

## 修改内容

- 修复属性表「滚动/字段配置莫名重置」：`useAttrStore.syncLayers` 引入内容签名做增量同步，数据未变时保持 dataset/rows 引用稳定；组件回顶仅发生在切换图层或排序/搜索/筛选条件变化时，数据刷新保持滚动位置。
- 修复「视图筛选范围」结果错乱：行范围与地图视图范围统一归一到 EPSG:4326 后再相交比较；勾选筛选时立即同步一次当前地图范围；范围不可用（3D/未就绪）时明确提示。
- 修复删除图层后属性表残留「幽灵图层」、跨图层切换选中残留误高亮两处状态泄漏。
- 补全 store 已有但无 UI 的功能：表头点击排序（▲/▼ 指示、OID 列恢复默认序）、工具栏全字段搜索框；footer 改为「展示 X / 总 Y 行」。
- 虚拟列表行 key 去掉 index 依赖，滚动位移时 Vue 可复用节点，消除整片重挂载开销。

## 修改原因

用户反馈属性表与各类图层属性的接口和 UI「经常出现混乱」，经症状确认为三类：看表中途滚动/配置莫名重置、视图范围筛选结果不准、表格功能不全（无排序/搜索）。

## 事件逻辑链条分析

### 核心症状

1. 浏览属性表时滚动位置突然跳回顶部，与用户操作无关；
2. 勾选「视图筛选范围」后过滤结果明显不符合当前地图视野（时而全显、时而乱过滤）；
3. store 中已实现排序（`displayRows/toggleSort`）与搜索（`searchQuery`）逻辑，但组件从未接线，属于不可达死代码，用户侧感知为"功能不全"。

### 根本原因

1. **全量重建 + 无差别回顶**：`HomeView.handleLayersChange` 在任何图层事件（含样式调整等与数据无关的变化）时调用 `attrStore.syncLayers`，旧实现无条件重建所有 dataset（新对象引用）→ 组件 `watch(rows)` 无条件回顶。
2. **坐标系混用**：行 extent 来源两条路——OL 要素 `getExtent()` 给 EPSG:3857 米制、GeoJSON 记录原始坐标给 EPSG:4326 经纬度；而地图视图范围恒为 3857。米制与度制直接做相交判断，对 4326 来源的行完全失真。另有勾选瞬间依赖「下一次 moveend」才拿到范围的时序缺口。
3. **状态泄漏**：`syncLayers` 只增不删（删除图层后 dataset 残留，active 关闭判断永不触发）；`setActiveLayer` 不清 `selectedFeatureId`（跨图层残留选中）。

### 受影响模块

- `frontend/src/stores/useAttrStore.ts`（数据契约核心）
- `frontend/src/components/Layer/AttributeTable.vue`（表格 UI）
- `frontend/src/components/Map/MapContainer.vue`（extent 同步接线）
- 数据链路：HomeView.syncLayers ← 各类图层（绘制/上传/搜索/行政区划）；TOC 右键 openTable；表格 hover/click → highlightManagedFeature

### 优化处理

- store 增量化：FNV-1a 32 位流式哈希（图层名/类型/行数 + 逐行 `featureId|searchText`）生成数据集签名，签名一致跳过替换；签名缓存为非响应式闭包对象。
- 坐标系归一：`normalizeExtentTo4326` 纯数学转换（无 OL 依赖），启发式判定（任一分量绝对值 > 360 视为 3857）；行侧构建时归一，地图侧 `setMapExtent` 归一。
- 状态收敛：syncLayers 按传入集合清理幽灵 dataset；setActiveLayer 换层清选中。
- UI 接线：rows 改用 `displayRows`；表头/搜索框/提示按现有 store API 接入，未新增 store 概念。

## 优化解决方案（实施步骤）

1. 全链路梳理（组件 → store → HomeView/TOC/MapContainer/useMapUIEventHandlers/useMapEventHandlers），确认 moveend 已接线、extent 坐标系混用证据（`useLayerMetadataNormalization` 两条几何来源）。
2. 通过 AskUserQuestion 与用户确认症状范围与改动边界（修稳定性 + 理顺接口 + 补全功能）。
3. 按「优化处理」实施 store 四处、组件六处、MapContainer 一处修改。
4. ESLint 与数学断言验证。

## 性能指标

- 无关图层事件触发的属性表重渲染从「每次全量」降为「签名一致零重渲染」；签名计算为 O(总字符数) 单遍哈希，与原 `stringifySearchText` 同量级。
- 虚拟行 key 稳定化后，滚动位移不再因 index 变化重挂载可视区行节点。

## 测试方案

**静态与逻辑验证（已执行，全部通过）**：

- ESLint：`useAttrStore.ts`、`AttributeTable.vue`、`MapContainer.vue` 零告警；
- 3857→4326 公式断言：x=LIMIT→180°、y=LIMIT→85.05112878°、原点→0、武汉样例（12727039, 3579066）→（114.32°E, 30.58°N）容差内；阈值启发式对 4326/3857 样本判定正确。

**人工验收步骤**：

1. 上传一个 GeoJSON 图层 + 绘制若干要素，分别打开属性表；调整任一图层样式/透明度 → 表格滚动位置与字段勾选应保持不动。
2. 勾选「视图筛选范围」→ 立即（无需拖动地图）按当前视野过滤；平移地图 → 行集合随视野更新；对上传（4326 源）与绘制（3857 源）图层结果均应正确。
3. 切到 3D 模式勾选筛选 → footer 出现「视图范围不可用，范围筛选未生效」提示，全行显示。
4. 点击表头循环 升序→降序，▲/▼ 指示随动；点击 OID 列恢复默认序；搜索框输入任意字段值实时过滤，× 清除。
5. 删除一个已打开属性表的图层 → 属性表自动关闭且不再出现在可选数据集中；A 图层选中某行后切到 B 图层 → 无残留高亮。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\useAttrStore.ts
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Layer\AttributeTable.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Map\MapContainer.vue
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.18）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.18 版本段）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-attribute-table-stability-and-features.md（本日志）

（无文件增删，前端文件树无结构变更。）
