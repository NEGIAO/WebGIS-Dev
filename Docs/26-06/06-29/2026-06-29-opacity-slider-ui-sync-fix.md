# 2026-06-29 透明度滑杆 UI 不跟随修复（同一缓存 Bug）

## 日期和时间
2026-06-29 16:30

## 修改内容
修复右键菜单透明度滑杆拖动后 UI 位置不更新的问题。与可见性 Bug 同源，由 `syncLayers` 缓存失效修复统一解决。

## 修改原因
用户通过右键菜单拖动透明度滑杆后，地图上图层透明度正确变化，但滑杆位置始终不动。

## 影响范围
- 图层管理 store（useLayerStore）layerTree 缓存
- TOC 树节点 opacity 属性
- 右键菜单透明度滑杆 UI

## 问题分析（事件逻辑链路）

### 根本原因：与可见性/重命名 Bug 同源

`layerTree` computed 的缓存键仅含图层 ID。透明度变更不改 ID → 缓存不失效 → 树节点 `opacity` 冻结在初始构建值 → 滑杆 `:value` 始终读取旧值。

### 修复方案
在 `syncLayers()` 开头重置 `lastLayerIdSequence = ''`，统一解决所有图层属性变更（可见性、透明度、重命名等）的缓存失效问题。已在上一个修复中完成。

### 事件链路
```
滑杆拖动 → handleOpacityChange → change-layer-opacity 事件
  → HomeView → MapContainer.setUserLayerOpacity
    → OL layer.setOpacity (地图变化) + emitUserLayersChange
  → TOCPanel watcher → syncLayers (lastLayerIdSequence = '')
  → layerTree 重建 (buildLayerTree) → node.opacity = 新值
  → menuCapabilities.currentOpacity → menuItems → slider :value 更新
```

## 测试方案
1. 右键图层 → 拖动透明度滑杆 → 滑杆跟随移动
2. 拖动过程中地图透明度实时变化
3. 松开后再次右键 → 滑杆显示正确位置

## 修改的文件路径
- `frontend/src/stores/useLayerStore.ts` — `syncLayers()` 缓存失效（已在上一修复中完成）
