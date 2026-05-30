# Code Review — 暂存区最终变更

**日期**: 2026-05-30
**范围**: 44 files, +2957 / -2612
**类型**: Bug 修复 + 新功能 + 性能优化 + 模块拆分

---

## 🔴 P0 — 无阻断性问题

---

## 🟡 P1 — 建议关注（2 个）

### 1. `useMapInteractionPickers.js` — previewStyle 与 overlayStyle 颜色不一致

```js
// 拖拽预览（绿色）
const PREVIEW_STYLE = new Style({
    stroke: new Stroke({ color: '#2f9a57', ... }),
    fill: new Fill({ color: 'rgba(47, 154, 87, 0.15)' }),
});

// 持久化覆盖层（蓝色）
style: new Style({
    stroke: new Stroke({ color: '#0e77b8', ... }),
    fill: new Fill({ color: 'rgba(145, 192, 209, 0.81)' }),
});
```

**问题**: 拖拽时显示绿色虚线，松手后变成蓝色半透明矩形。颜色跳变可能让用户困惑。

**建议**: 统一为同一色系，或让覆盖层继承预览颜色。

### 2. `MapDownloader.vue` — `hasExtent` 硬编码默认坐标

```js
const hasExtent = computed(() => {
    const b = store.bbox;
    return (
        Number.isFinite(b.minLon) && ...
        (b.minLon !== 116.2 || b.minLat !== 39.8 || b.maxLon !== 116.3 || b.maxLat !== 39.9)
    );
});
```

**问题**: 用硬编码坐标 `(116.2, 39.8, 116.3, 39.9)` 判断是否为默认值。如果默认值变化，这里需要同步修改。

**建议**: 改为检查 store 中是否有 `hasExtent` 标记，或检查 bbox 是否为 `null`/`undefined`。

---

## 🟢 P2 — 正确实现（无问题）

### 3. 路线 TOC 注册修复 — ✅

`busRouteLayerRef` 闭包 bug → `getBusRouteLayer` getter 函数。路线绘制后正确注册到 TOC。

### 4. `setZIndex` 崩溃修复 — ✅

`item.layer?.setZIndex?.(zIndex)` 空值保护。

### 5. 框选 UI 增强 — ✅

- 拖拽过程中实时预览（绿色虚线）
- 松手后转为持久化覆盖层（蓝色半透明）
- 新增"清除选区"按钮
- 框选状态文字提示

事件链完整：`MapDownloader → TOCPanel → SidePanel → HomeView → MapContainer → clearExtentOverlay()`

### 6. 性能优化：图层刷新 — ✅

`useLayerControlHandlers.js` 可见性/透明度变更跳过全量 `refreshLayersState`，直接调用 OL 方法。层实例已存在时安全。

### 7. 性能优化：OL 方法调用 — ✅

`useMapState.js` 在值未变化时跳过 `setVisible`/`setZIndex`/`setOpacity`。减少不必要的内部重排序。

### 8. 性能优化：标签缓存 — ✅

`useManagedLayerStyle.js` 新增 `forceRebuildStyle`，`applyManagedLayerStyle` 保留已有 `labelStyleCache`。样式配置变化时才清空缓存。

### 9. 性能优化：layerHelpers — ✅

`hasAttributeFeatures` 优先检查 `featureCount`（O(1)），`getLayerPoiId` 优先从 metadata 读取。

### 10. 模块拆分（backend/tileSource/dataDispatcher）— ✅

barrel re-export 模式，消费方路径不变。

### 11. `labelStyleCache` 清理 — ✅

`setDrawStyle` 和 `setUserLayerStyle` 在样式变化时清空 `labelStyleCache`，确保新样式生效。

### 12. CSS 变量变更 — ✅

`.eco-header` 背景色 `--brand-primary-light` → `--brand-primary-dark`，预期 UI 调整。

---

## 📊 变更分类

| 类别 | 文件数 | 说明 |
|------|--------|------|
| Bug 修复 | 3 | 路线 TOC 注册、setZIndex 崩溃、框选 UI |
| 新功能 | 5 | 框选覆盖层、清除选区、状态提示 |
| 性能优化 | 5 | 图层刷新、OL 调用、标签缓存、layerHelpers |
| 模块拆分 | 21 | backend/、tileSource/、archiveProcessor、shpPacketBuilder |
| 文档 | 3 | Code review 记录 |

---

## 结论

0 阻断性问题。2 个 P1 为视觉/设计层面建议，不影响功能。可提交。
