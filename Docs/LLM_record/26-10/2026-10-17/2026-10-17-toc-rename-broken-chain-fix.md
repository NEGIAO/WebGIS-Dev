# TOC 右键「重命名」失效排查与修复记录

- 日期：2026-10-17
- 版本：V3.6.20
- 用户诉求：「图层管理中的右键功能的action重命名，现在是失效的，无法真的使用，查找链路，给我修复他」
- 涉及文件：
  - `frontend/src/domains/ol/components/MapContainer.vue`（新增 `renameUserLayer`，挂 defineExpose + OL 引擎处理器表）
  - `frontend/src/app/HomeView.vue`（`handleRenameLayer` 改走 ActionRouter 分发 + 降级兜底 + 区划分支）
  - `README.md` / `Docs/Guide/CHANGELOG.md`（V3.6.20 记档）

## 一、链路逐跳核验（结论：事件链本身完好）

| # | 位置 | 行为 |
|---|------|------|
| 1 | `menu/contextMenu.js` `buildContextMenuItems` | layer 节点无条件挂 `TOC_MENU_COMMANDS.RENAME`（`edit.push({ key: RENAME, label: '重命名' })`，113 行） |
| 2 | `TOCTreeItem.vue` `handleMenuCommand` | 特判 `key === 'rename'` → `closeContextMenu()` + `startRename()`（**不经** commandDispatcher，行内编辑） |
| 3 | `TOCTreeItem.vue` `startRename/commitRename` | 行内 input（`@keydown.enter` / `@blur` 提交，escape 取消）；`commitRename` → `emitAction('rename-layer', { layerId: props.node.id, newName })` |
| 4 | `LayerPanel.vue` `handleTreeAction` | 非特殊类型 → `emit('action', evt)` 原样透传 |
| 5 | `TOCPanel.vue` `handleLayerTreeAction` | `handleCesiumLayerTreeAction` / `handleRemoteServiceTreeAction` / `handleLayerTreeContextAction` 均**不消费** rename-layer → 到达 193 行显式分支 `emit('rename-layer', { layerId, newName })` |
| 6 | `SidePanel.vue` | 模板 110 行 `@rename-layer="$emit('rename-layer', $event)"`；defineEmits 540 行含 `'rename-layer'` |
| 7 | `HomeView.vue` | `@rename-layer="handleRenameLayer"`（2007 行，挂 `<SidePanel>`） |

补充事实：
- `commandDispatcher.js` 216-219 行的 rename 分支（`{ type:'rename-layer', payload:{ layerId } }`，**缺 newName**）因第 2 跳特判而为死代码，暂无触发方。
- cesium:* 三维节点重命名由 `cesiumTocActions.js` 44-45 行消费（`cesiumStore.rename(id, evt.newName)`），正常。
- 运行期探针（真实 TOCPanel + 真实 store，上一会话）证明：emit 载荷 `{layerId, newName}` 正确；`layerStore.renameLayer` 后树名/DOM 名即时刷新。

## 二、根因：rename 是唯一「只改 store、不经过地图侧」的图层变更

`HomeView.handleRenameLayer` 旧实现仅 `layerStore.renameLayer(layerId, newName)`。而本仓图层变更的正确模式（可见性/透明度/移除/缩放）全部经 `dispatchLayerAction({ method, engine:'ol' })` → MapContainer 处理器 → 改托管记录 → `emitUserLayersChange()` 广播回流：

```
dispatchLayerAction → MapContainer.setUserLayerVisibility
  → 改 userDataLayers[i] → emitUserLayersChange()
  → HomeView.handleUserLayersChange → userLayers.value = layers
  → TOCPanel watch(props.userLayers) → syncUserLayers → layerStore.syncLayers
```

rename 绕过地图侧的后果：

1. **被广播冲掉（用户可见的「无法真正应用」）**：托管记录名字不变，任何其他图层操作（显隐/透明度/样式/排序/标注/坐标转换/要素编辑——`MapContainer.vue` 内 14 处 `emitUserLayersChange` 调用点）都会用旧名 layers 整体替换 `HomeView.userLayers`，TOC  watch → store 同步 → 新名字被还原。
2. **地图侧消费方读到旧名**：导出文件名（`exportUserLayerGeoJSON` 用 `target.name`）、属性表、图层属性弹窗等。
3. **区划节点静默无操作**：district-boundary 名称存于 `tocStore.layerMetadataMap`，不在 `store.userLayers`，`renameLayer` 查无此人即 return。

## 三、修复（与可见性/透明度同构的单一事实源）

1. `MapContainer.vue` 新增 `renameUserLayer(layerId, newName)`（defineExpose 前）：
   - 归一化 id/name；`userDataLayers.find` 命中即更新 `target.name`，并同步 `standardTocItem` / `metadata.standardTocItem` 的 `name`（`normalizeEmittedStandardTocItem` 两处都读，但其 name 以 `item.name` 覆盖，故改 `name` 即生效）；
   - 调用 `emitUserLayersChange()` 回流；返回 boolean 供调用方降级判断；重名/空名短路。
   - 挂入 `defineExpose({ … renameUserLayer … })` 与 `registerEngineHandlers('ol', { renameUserLayer: ({layerId, newName}) => … })`。
2. `HomeView.handleRenameLayer` 重写：
   - 区划节点 → `tocStore.upsertLayerMeta({ id, name })`；
   - plain id（OL 命名空间，cesium:*/rsvc:* 已被上游分流器消费）→ `dispatchLayerAction({ method:'renameUserLayer', payload:{layerId,newName}, engine:'ol' })`，`dispatched === false`（引擎未注册/无托管记录）时降级 `layerStore.renameLayer(id, name)`（至少 TOC 即时显示，与旧行为一致）。

回流后 `resolveLayerRevision` 因 name 变化递增 revision，`attrStore.syncLayers` 同步重建，属性表标题跟随新名。

## 四、验证

- `eslint MapContainer.vue HomeView.vue`：0 error（3 条既有 no-console warning，位于 HomeView 其他函数，与本次无关）。
- `vue/compiler-sfc` 编译两文件通过（script bindings 355 / 228，完整）。
- 动态验证依赖 dev server（用户已手动关闭 :5199；本次未再启动浏览器/模拟，按要求仅做逻辑链路静态核验）。建议人工回归：上传图层 → 右键重命名 → 切换该图层显隐（触发广播）→ 名称应保持；导出文件名/属性表标题应跟随新名。

## 五、备注

- `useLayerOperations.ts`（`@common/app/home`）为死代码（无消费方），其 `handleRenameLayer` 预调的 `mapContainerRef.renameUserLayer` 因本次 expose 已名义可用，未改动。
- `LayerPropertiesDialog.vue` UI 重写（上一会话遗留，未提交）随本版 V3.6.20 一并记档。
