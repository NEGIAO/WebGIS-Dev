# 属性表鼠标悬停高亮修复

- **日期和时间**：2026-05-28 23:00
- **修改内容**：修复属性表鼠标悬停后高亮不恢复的 Bug
- **修改原因**：用户反馈鼠标经过属性表行时，地图上对应要素被高亮，但鼠标移开后高亮样式永久保留，不会恢复原样
- **影响范围**：属性表组件、要素高亮模块、地图 UI 事件处理器

---

## 修复前的问题

**具体表现**：
1. 鼠标移入属性表某一行 → 地图上对应要素高亮显示（绿色填充/描边）✅ 正常
2. 鼠标移出该行 → 高亮样式**不消失**，要素保持高亮状态 ❌ 异常
3. 鼠标依次划过多行 → 地图上**多个要素同时高亮**，样式混乱 ❌ 异常
4. 只有点击其他要素或重新加载页面才能清除高亮

**用户感知**：属性表的鼠标悬停变成了"点击选中"的效果，交互体验不符合预期

---

## 根本原因分析

### 原因 1：`setStyle(undefined)` 不等于清除样式

`useManagedFeatureHighlight.js` 中的 `clearManagedFeatureHighlight` 函数：

```javascript
// 修复前
function clearManagedFeatureHighlight(feature) {
    if (!feature) return;
    if (typeof feature.setStyle === 'function') {
        feature.setStyle(undefined);  // ← 问题所在
    }
}
```

OpenLayers 中：
- `feature.setStyle(null)` → 清除要素级样式，**恢复为图层默认样式函数**
- `feature.setStyle(undefined)` → 设置样式为 undefined，**不触发图层样式函数回退**

图层的 `buildManagedLayerStyle` 样式函数会检查 `feature.getStyle()`：
```javascript
const existingStyle = feature.getStyle();
if (existingStyle && !(existingStyle instanceof Function)) {
    return existingStyle;  // 如果有自定义样式，直接返回
}
```

当 `setStyle(undefined)` 后，`feature.getStyle()` 返回 `undefined`，条件不满足，理论上应走默认样式。但 OpenLayers 内部对 `undefined` 的处理与 `null` 不同，导致样式未正确恢复。

### 原因 2：缺少 `@mouseleave` 事件处理

`AttributeTable.vue` 的表格行只有 `@mouseenter`，没有 `@mouseleave`：

```html
<!-- 修复前 -->
<div class="pro-tr" @mouseenter="previewFeature(item.row)" @click="focusFeature(item.row)">
```

鼠标移入时触发高亮，但鼠标移出时**没有任何事件**通知清除高亮。

### 原因 3：`currentHighlightedFeature` 引用未重置

即使样式被清除，`currentHighlightedFeature` 闭包变量仍持有旧要素引用。下次高亮新要素时，`clearManagedFeatureHighlight(currentHighlightedFeature)` 尝试清除旧要素，但旧要素可能已经不在视图中或引用已失效。

---

## 修复方案

### 改动 1：`setStyle(undefined)` → `setStyle(null)`

**文件**：`frontend/src/composables/map/features/useManagedFeatureHighlight.js`

```javascript
// 修复后
function clearManagedFeatureHighlight(feature) {
    if (!feature) return;
    if (typeof feature.setStyle === 'function') {
        feature.setStyle(null);  // ← 使用 null 正确清除
    }
}
```

**效果**：`setStyle(null)` 告诉 OpenLayers "此要素无自定义样式"，渲染时回退到图层的 `buildManagedLayerStyle` 样式函数，恢复默认绿色填充/描边。

### 改动 2：添加 `@mouseleave` 事件处理

**文件**：`frontend/src/components/Layer/AttributeTable.vue`

```html
<!-- 修复后 -->
<div class="pro-tr"
     @mouseenter="previewFeature(item.row)"
     @mouseleave="clearPreview"
     @click="focusFeature(item.row)">
```

新增 `clearPreview` 函数：
```javascript
function clearPreview() {
    const layerId = store.activeLayerId;
    if (!layerId) return;
    emit('highlight-feature', { layerId, featureId: null });
}
```

**效果**：鼠标移出行时，发送 `featureId: null` 通知清除高亮。

### 改动 3：处理器支持清除操作

**文件**：`frontend/src/composables/map/features/useMapUIEventHandlers.js`

```javascript
// 修复后
function handleAttributeTableHighlightFeature(payload) {
    if (!payload?.layerId) return;
    if (!payload.featureId) {
        // featureId 为 null → 清除当前高亮
        const current = getCurrentHighlightedFeature?.();
        if (current) {
            clearManagedFeatureHighlight?.(current);
            setCurrentHighlightedFeature?.(null);
        }
        return;
    }
    highlightManagedFeature?.(payload);
}
```

**效果**：收到 `featureId: null` 时，清除当前高亮要素的样式并重置引用。

### 改动 4：传递清除函数到事件处理器

**文件**：`frontend/src/components/Map/MapContainer.vue`

```javascript
createMapUIEventHandlers({
    // ...
    clearManagedFeatureHighlight,    // ← 新增
    getCurrentHighlightedFeature,    // ← 新增
    setCurrentHighlightedFeature,    // ← 新增
    // ...
});
```

---

## 修复后的效果

1. 鼠标移入属性表行 → 地图要素高亮 ✅
2. 鼠标移出属性表行 → 高亮**立即清除**，恢复默认样式 ✅
3. 快速划过多行 → 始终只有一个要素高亮 ✅
4. 点击行 → 聚焦要素（原有功能不受影响）✅

---

## 修改的文件路径

- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useManagedFeatureHighlight.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useMapUIEventHandlers.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Layer\AttributeTable.vue`
