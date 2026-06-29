# 2026-06-29 TOC 可见性勾选状态不同步修复

## 日期和时间
2026-06-29 16:00

## 修改内容
修复 TOC 树中图层/文件夹的可见性勾选状态与实际状态不一致的问题。

## 修改原因
用户切换图层可见性后，checkbox 的 checked 状态和文件夹的 indeterminate 状态未同步更新，导致 UI 显示与实际可见性不符。

## 影响范围
- 图层管理 store（useLayerStore）
- TOC 树渲染（layerTree computed）—— 文件夹 checked / indeterminate、图层 checked

## 问题分析（事件逻辑链路）

### 完整事件链路
```
TOCTreeItem checkbox click
  → handleToggleVisibility(event)
    → emitAction('toggle-layer-visibility', { layerId, visible })
      → LayerPanel → TOCPanel → SidePanel → HomeView
        → mapContainer.setUserLayerVisibility(layerId, visible)
          → target.visible = !!visible        ✅ (内存已更新)
          → target.layer?.setVisible(visible)  ✅ (地图已更新)
          → emitUserLayersChange()
            → HomeView.userLayers = layers     ✅ (prop 已更新)
              → TOCPanel watcher → layerStore.syncLayers(layers)
                → userLayers.value = normalizedLayers  ✅ (store 已更新)
                → layerTree computed → 缓存命中旧数据 ❌ ← 断链点
```

### 根本原因：与重命名 Bug 同源

`layerTree` computed（useLayerStore.ts:104-128）使用**图层 ID 序列**作为缓存键：

```ts
const currentIdSequence = [
    ...drawLayers.value.map(l => l.id),    // ← 只取 ID
    ...routeLayers.value.map(l => l.id),
    ...
].join(',');

if (currentIdSequence !== lastLayerIdSequence) {
    cachedLayerTree.value = buildLayerTree({...});  // ← 仅 ID 变化才重建
}
```

可见性变更**不改变 ID** → 缓存键不变 → `buildLayerTree()` 不会被重新调用 →
- 文件夹的 `visible`（全选）和 `indeterminate`（部分选）冻结在初始值
- 图层的 `visible` 在树节点中是旧快照值

### 修复方案
在 `syncLayers()` 开头重置 `lastLayerIdSequence = ''`，因为 `syncLayers` 是所有图层属性变更（可见性、透明度、重命名等）的统一入口，每次调用都应重建树。

## 测试方案
1. 切换单个图层可见性 → checkbox 状态立即更新
2. 切换子图层可见性 → 文件夹 checkbox 自动变为 indeterminate
3. 勾选文件夹 → 所有子图层 checkbox 同步勾选
4. 取消所有子图层勾选 → 文件夹 checkbox 变为未勾选

## 修改的文件路径
- `frontend/src/stores/useLayerStore.ts` — `syncLayers()` 添加 `lastLayerIdSequence = ''`
