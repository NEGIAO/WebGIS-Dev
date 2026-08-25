# 在线服务子图层独立成层与统一排序管理（实施方案）

> 起草：2026-08-25 ｜ 状态：**待实施** ｜ 预估：净增 ~250 行 / 改 ~80 行 / 触碰 8 文件
> 前置阅读：`Docs/LLM_record/26-08/2026-08-25/2026-08-25-remote-service-toc-architecture-fixes.md`（三段式架构与 P0/P1 修复）

---

## 一、背景与问题

当前「在线服务」采用 **一条注册记录 = 一个服务 + LAYERS 组合参数** 的模型，导致：

| # | 用户诉求 | 现状缺陷 |
|---|---|---|
| 1 | 同时勾选 5 个子图层叠加显示 | 组合语义下可以，但渲染顺序由服务端决定，客户端不可控 |
| 2 | 每个子图层**单独显隐** | 只能改 LAYERS 组合并整层重渲染；透明度/闪烁等无法按子层控制 |
| 3 | **拖拽控制叠放级别** | 组合模式下物理上不可能——单图层无独立 zIndex |
| 4 | TOC 叶子右键「移除」语义混乱 | 当前是"取消勾选"，用户预期是"从地图移除该子层实例" |
| 5 | identify 多服务去重 | 展开后同 endpoint 多记录会重复查询 |

**结论：子图层必须升级为一等公民——每个勾选的子图层 = 注册表中一条独立记录 = 渲染端一个独立图层实例。**

## 二、目标数据流

```
面板提交 URL
   ↓ ensureWmsServiceInfo / f=json（现有）
元数据 { sublayers:[{name,title,label}], ... }
   ↓ registerRemoteServiceStack(payload, names[])   ← 新 API
注册表展开为 N 条记录（共享 serviceUrl，各带 subLayerName）
   ↓ deep watch（现有，零改动）
OL adapter: N 个 TileLayer（zIndex = REMOTE_SERVICES + 序号）
Cesium adapter: N 个 ImageryLayer（restack 按 records 序）
   ↓
TOC「在线服务」分组
   └─ 📁 服务A (url 分组)
        ├─ ☑ 子层 a  ← record.visible / opacity / draggable
        ├─ ☑ 子层 b
        └─ ☐ 子层 c  ← 未勾选 = 无记录（或 visible=false，见 §5.3）
```

## 三、数据模型变更

### 3.1 `RemoteServiceRecord` 新增字段

```ts
/** 本记录对应的单个子图层名（栈展开模式下的必填标识） */
subLayerName?: string;
/** 同服务排序键：注册时间 + 展开序号，重排时整体交换 */
stackOrder: number;
```

> 兼容：旧记录（无 subLayerName）视为"组合模式遗留"，渲染走原 computeLayersParam 兜底；
> 不做数据迁移，刷新后自然消失（会话态生命周期）。

### 3.2 新增导出（`remoteServices.ts`）

```ts
/**
 * 按子图层展开注册：names 中每个名字生成一条独立记录。
 * 去重键 = url + '\u0000' + name（同一服务的同一子层不会重复）。
 * 返回本次涉及的记录 id 数组（顺序即 stackOrder）。
 */
export function registerRemoteServiceStack(
    payload: Omit<RemoteServiceRecord, 'id' | 'visible' | 'opacity' | 'createdAt' | 'stackOrder'>,
    names: string[],
): string[];

/** 同 url 分组内相邻交换：delta=+1 下移 / -1 上移。跨组不允许。 */
export function moveRemoteService(id: string, delta: 1 | -1): boolean;

/** 拖拽落点重排：将 dragId 移动到 targetId 之后（同 url 约束可选放开） */
export function reorderRemoteServices(dragId: string, targetId: string): boolean;

/** 清空某服务的全部子层记录 */
export function clearRemoteServiceStack(url: string): void;
```

### 3.3 `computeLayersParam` 单层化判定

```ts
if (record.subLayerName) {
    if (record.kind === 'wms') return record.subLayerName;
    if (record.tileMode === 'export') return `show:${record.subLayerName}`;
    return ''; // tiles 模式 LAYERS 无意义
}
// ……原有组合逻辑作为旧记录兜底保留
```

## 四、文件改动清单

### 4.1 `src/domains/common/basemap/remoteServices.ts`
- §3.2 四个新函数 + Record 字段
- `renderSignature()`（若仍在此处/已迁 adapter 则同步）：加入 `record.subLayerName`

### 4.2 `src/domains/common/basemap/remoteServiceNodeBuilder.ts`（重写分组逻辑）

```ts
// records 按 serviceUrl 分组（保持首现顺序）；每组 → 服务 folder
const groups = new Map<string, RemoteServiceRecord[]>();
for (const r of records) {
    const key = r.serviceUrl ?? r.url;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(r);
}
```

- **服务 folder 节点**：name=`${title} (${children.length})`；
  checkbox 聚合 children.visible（沿用 countLeafVisibility）；
  actions：zoom(有 bbox)/remove(clearRemoteServiceStack)/attribute=false；
  **不再生成 :L: 合成叶子**
- **子层叶子节点**（每条记录）：
  - id = `rsvc:${record.id}`（**去掉 ：L: 复合 id**，parseRsvcNodeId 的 :L: 分支可标记废弃）
  - type='layer'、`draggable:true, droppable:true`
  - visible/opacity 直取 record
  - actions：remove(removeTip:'移除此图层') / zoom(true) / attribute=false

### 4.3 `src/domains/common/basemap/remoteServiceTocActions.js`
新增分支（置于现有 toggle-folder 之前）：

```js
if (type === 'rsvc-move-up' || type === 'rsvc-move-down') {
    const { serviceId: id } = parseRsvcNodeId(extractNodeId(evt));
    moveRemoteService(id, type.endsWith('down') ? 1 : -1);
    return true;
}
if (type === 'drop-layer') {
    // 仅当 drag/target 都是 rsvc: 时接管，否则放行
    return reorderRemoteServices(dragId, targetId), true;
}
```

> `toggle-layer-visibility` / `remove-layer` / `zoom-layer` 现有分支不变——
> 因为叶子 id 已退化为普通 `rsvc:<recordId>`，自然命中。

### 4.4 `src/domains/common/layer-tree/menu/contextMenu.js`（增量 2 处）
在 layer 与 folder 两分支的 ops 组前插入（仅 nodeId 以 `rsvc:` 开头时）：

```js
ops.unshift(
    { key: 'RSVC_MOVE_UP',   label: '上移一层', commands: [{ type: 'rsvc-move-up',   payload: { layerId: nodeId } }] },
    { key: 'RSVC_MOVE_DOWN', label: '下移一层', commands: [{ type: 'rsvc-move-down', payload: { layerId: nodeId } }] },
);
```

> dispatcher（contextActionManager.dispatchContextMenuCommand）需确认对
> 未知 key 是否透传 commands；若为白名单 switch，则补两个 case 直接返回上述 events。

### 4.5 `src/domains/common/layer-tree/components/TOCTreeItem.vue`（拖拽目标识别，~10 行）

现状：`handleDragStart` 仅 emit、`handleDrop` 不知落点。最小增强：

```js
function handleDragStart(e) {
    if (!props.node.draggable) return;
    e.dataTransfer?.setData('text/plain', props.node.id); // ★ 新增
    emitAction('drag-layer-start', { layerId: props.node.id });
}
function handleDrop(e) {
    if (!props.node.droppable) return;
    const dragId = e.dataTransfer?.getData('text/plain') || '';
    emitAction('drop-layer', { layerId: dragId || props.node.id, targetId: props.node.id }); // ★ 带 targetId
}
```

### 4.6 注册钩子（`useLayerControlHandlers.js` wms/wmts 分支、`useCesiumLayers.js` submit）

替换现单条 `registerRemoteService(...)` 为：

```js
registerRemoteServiceStack(
    { kind, url: normalizedUrl, endpoint: svcInfo.endpoint, title: svcInfo.title,
      layersParam: '', format: svcInfo.format, version: svcInfo.version, srs: svcInfo.srs,
      tileMode: svcInfo.tileMode, maxLevel: svcInfo.maxLevel,
      geographicBbox: svcInfo.geographicBbox, queryable: svcInfo.queryable === true },
    preferredNames.length ? preferredNames : svcInfo.layerOptions.map(o => o.name), // 默认全部
);
```

- WMS：preferredNames = wmsLayers?.split(',')
- ArcGIS：preferredNames = wmsLayers ? [wmsLayers] : 全部（'' 默认可见 ≈ 全部近似，文档注明）
- XYZ（无 sublayers）：维持现有单条注册分支不动
- WMTS：matrixSet/style 字段随 payload 平铺进每条记录

### 4.7 identify 去重（两处 collect 函数）

展开后多记录共享 endpoint，需按 endpoint 去重候选：

```js
const seen = new Set();
for (const record of ...) {
    if (seen.has(record.endpoint)) continue;
    seen.add(record.endpoint);
    candidates.push(...);
}
```

## 五、交互语义总表（实现后）

| 操作 | 行为 |
|---|---|
| 提交服务 URL | 自动展开 N 条子层记录，默认全选上图 |
| 勾选/取消服务 folder | 该服务**所有**子层整体显隐 |
| 勾选/取消子层叶子 | 仅该子层显隐（独立 OL/Cesium 图层） |
| 右键 上移/下移一层 | 同服务内交换 zIndex 序 |
| 拖拽叶子到另一位置 | 重排（先支持同服务内；跨服务二期） |
| 右键移除（叶子） | 注销该子层记录 |
| 右键移除（服务 folder） | 清空该服务全部记录 |
| 点击地图 | 对**可见且 queryable** 的服务按 endpoint 去重查询 |
| 刷新页面 | 会话态清空（既定结论，不变） |

## 六、验收清单

1. 加载北斗环疆 roadrail（2 子层）→ TOC 出现 1 folder + 2 叶子；取消其一 → 地图仅剩另一子层
2. 黄陵 VectorProduct（4 子层）→ 全选叠加 → 逐个取消 → Network 中 export 请求 `LAYERS=show:` 仅含剩余 id
3. 右键上移/下移 → Cesium/OL 两侧叠放次序同步变化
4. 拖拽 A 到 B 位置 → 记录顺序交换且 zIndex 更新
5. 点击地图 → 控制台仅一次 identify 请求/服务（非每子层一次）
6. 移除服务 folder → 该 url 全部记录消失、图层卸载、分组条目数更新
7. 刷新 → 全部清空（会话态）
8. 旧版 v1 localStorage 记录存在时不报错（兜底路径）
9. eslint/build 通过

## 七、风险与回滚

- **风险 1**：nodeBuilder 为并发高频修改区（本周期已被多次覆盖）。缓解：本方案落地时以单 commit 提交，并在 commit message 引用本文档路径。
- **风险 2**：TOCTreeItem 拖拽改造涉及共享组件。缓解：改动限定 handleDragStart/handleDrop 两函数内的增量行；不影响既有 user-layer 拖拽（其未启用 draggable 时行为不变）。
- **风险 3**：identify 并发翻倍（多服务）。缓解：endpoint 去重 + 容忍上限 5 服务；如仍超限，后续加 200ms debounce。
- **回滚**：整个特性收敛于「stack 展开」单一入口——回滚时 hooks 改回调旧 `registerRemoteService(单条)` 即可恢复组合模式，渲染端因兼容兜底无需回退。

## 八、明确不做（本期范围外）

- WMTS 非标准矩阵集（维持跳过策略）
- 子图层级样式/调色（需 SLD/WMS Styling，另立专项）
- 跨服务拖拽混排（zIndex 全局带内允许，但 UI 先限制同服务内提示）
- 服务持久化恢复（维持会话态结论）
