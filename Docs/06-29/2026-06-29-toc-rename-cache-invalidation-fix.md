# 2026-06-29 TOC 重命名功能失效修复

## 日期和时间
2026-06-29 15:30

## 修改内容
修复图层右键菜单"重命名"功能修改名称后无法生效（UI 不刷新）的问题。

## 修改原因
用户通过右键菜单重命名图层后，输入新名称按回车确认，但 TOC 树中的图层名称未更新，仍显示旧名称。

## 影响范围
- 图层管理 store（useLayerStore）
- TOC 树渲染（layerTree computed）

## 问题分析（事件逻辑链路）

### 完整事件链路
```
TOCTreeItem 右键菜单 "重命名"
  → handleMenuCommand('rename')
    → startRename()           [显示 inline input]
    → 用户输入新名称 + Enter
    → commitRename()
      → emitAction('rename-layer', { layerId, newName })
        → LayerPanel → TOCPanel → SidePanel → HomeView
          → layerStore.renameLayer(layerId, newName)
            → 更新 userLayers[idx].name / displayName / standardTocItem.name
            → userLayers.value = updated  ✅ (数据已更新)
```

### 根本原因：layerTree 缓存不失效

**useLayerStore.ts** 中 `layerTree` computed 使用**图层 ID 序列**作为缓存键：

```ts
const currentIdSequence = [
    ...drawLayers.value.map(l => l.id),
    ...routeLayers.value.map(l => l.id),
    ...searchLayers.value.map(l => l.id),
    ...uploadLayers.value.map(l => l.id),
    ...districtLayers.value.map(l => l.id),
].join(',');

if (currentIdSequence !== lastLayerIdSequence) {
    // 只有 ID 序列变化才重建树
    cachedLayerTree.value = buildLayerTree({...});
}
```

重命名只修改 `name` / `displayName`，**不改变 `id`**，因此 `currentIdSequence === lastLayerIdSequence` 始终为 true，**缓存永远不失效**，TOC 树节点持续显示旧的 `displayName`。

### 修复方案
在 `renameLayer()` 函数末尾添加 `lastLayerIdSequence = ''`，强制下次 `layerTree` computed 求值时重建树。

## 测试方案
1. 右键图层 → 重命名 → 输入新名称 → Enter
2. 预期：TOC 树立即显示新名称
3. 再次重命名回原名称 → 确认双向切换正常
4. 页面刷新 → 确认名称仍为内存中的新值（注：非持久化，刷新后恢复原名属已知行为）

## 修改的文件路径
- `frontend/src/stores/useLayerStore.ts` — `renameLayer()` 添加 `lastLayerIdSequence = ''` 缓存失效
