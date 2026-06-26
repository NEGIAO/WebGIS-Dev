# 2026-06-26 修复 Cesium → OL 图层同步问题 (V3.3.9)

## 日期和时间
2026-06-26 18:00

## 问题描述

当 URL 面板是 Cesium 时，`l` 参数（图层索引）不能同步到 OpenLayers 中的 `l` 参数，但 OL 中的 `l` 参数却可以同步到 Cesium 面板中。

## 问题分析

### 事件逻辑链条

1. **Cesium 模式**：URL 中包含 `l=0`（或其他图层索引）
2. **切换到 OL**：调用 `buildOlQueryPatchFromCesium()` 读取 URL 中的 `l` 参数
3. **视图同步**：调用 `syncViewFromCesium()` 同步经纬度和缩放级别
4. **图层同步**：调用 `setBaseLayerActive()` 设置底图激活状态

### 根本原因

在 `useUserLayerActions.js` 中，`setBaseLayerActive()` 函数存在两个问题：

1. **类别检查错误**：检查 `getLayerCategory?.(layerId) !== 'base'`，但实际的图层类别是 `'imagery'`、`'vector'`、`'label'`、`'terrain'`、`'theme'`、`'custom'` 等，**没有 `'base'` 这个类别**。

2. **ID 类型不匹配**：`setBaseLayerActive()` 检查 `layerList` 中是否存在该图层：
   ```javascript
   const target = layerList?.value?.find((item) => item.id === layerId);
   if (!target) return;
   ```
   但 `layerList` 包含的是**图层源 ID**（如 `'imagery_google'`），而 `selectedLayer` 存储的是**预设 ID**（如 `'imagery_google_preset'`）。这导致 `target` 始终为 `undefined`，函数提前返回。

## 受影响的模块

- **前端图层系统**：`useUserLayerActions.js`
- **URL 同步**：`useMapState.js`
- **视图切换**：`HomeView.vue`

## 修复方案

简化 `setBaseLayerActive()` 函数，直接设置 `selectedLayer.value`：

```javascript
function setBaseLayerActive(layerId) {
    if (!layerId || !selectedLayer) return;

    // 直接设置 selectedLayer，因为 selectedLayer 存储的是预设 ID
    // 不需要检查 layerList，因为 layerList 包含的是图层源 ID，不是预设 ID
    if (selectedLayer.value !== layerId) {
        selectedLayer.value = layerId;
    }
}
```

## 测试方案

1. 在 Cesium 模式下切换底图
2. 切换到 OL 模式
3. 验证 OL 底图是否与 Cesium 一致
4. 在 OL 模式下切换底图
5. 切换到 Cesium 模式
6. 验证 Cesium 底图是否与 OL 一致

## 修改的文件路径

1. `d:/Dev/GitHub/WebGIS_Dev/frontend/src/composables/useUserLayerActions.js`

---

*"代码是写给机器看的，但文档是写给未来的自己看的。"*
