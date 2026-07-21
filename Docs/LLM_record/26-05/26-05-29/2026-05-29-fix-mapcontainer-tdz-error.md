# 2026-05-29 MapContainer.vue 功能模块提取 + 全链路修复

## 日期和时间
2026-05-29 16:00 ~ 18:30

## 修改内容
1. 修复 MapContainer.vue 暂时性死区（TDZ）运行时错误
2. 完成三个功能模块的 barrel 导出链接线
3. Code Review 修复 3 个严重 + 1 个高优问题（内存泄漏、交互泄漏、卸载清理遗漏）
4. 修复卷帘 UI 与裁剪效果不同步问题（持久化状态恢复 + Pinia 响应式代理丢失）

---

## 问题事件逻辑链条分析

### 问题 A：暂时性死区（TDZ）

**核心症状**：
```
Uncaught (in promise) ReferenceError: Cannot access 'LAYER_CONFIGS' before initialization
```

**根本原因**：`createBasemapSwipe()` 调用在第 252 行，但依赖的 `LAYER_CONFIGS`（第 336 行）和 `layerInstances`（第 347 行）尚未声明。

**修复**：将 `createBasemapSwipe()` 调用移到 `LAYER_CONFIGS` 和 `layerInstances` 定义之后。

### 问题 B：DistrictManager 内存泄漏（严重）

**核心症状**：`createDistrictManagerFeature` 内部持有 `DistrictManager` 实例，但未暴露 `dispose` 方法。MapContainer.vue 的 `onUnmounted` 调用作用于永远为 null 的本地变量。

**修复**：`useDistrictManager.js` 添加 `disposeDistrictManager()`，MapContainer.vue 接线并在 `onUnmounted` 调用。

### 问题 C：pickDownloadExtent DragBox 泄漏（严重）

**核心症状**：`pickDownloadExtent()` 重复调用时未从地图移除旧 `downloadBoxInteraction`。

**修复**：改用 `cancelDownloadBoxPick()` 统一清理。

### 问题 D：onUnmounted 遗漏清理（严重）

**核心症状**：`onUnmounted` 遗漏 `pendingDownloadBoxPickRef` 和 `downloadBoxInteraction`。

**修复**：`useMapInteractionPickers.js` 添加 `disposeAll()` 方法，MapContainer.vue `onUnmounted` 调用。

### 问题 E：选点时未取消活跃的 DragBox（高优）

**核心症状**：`startBusPointPick()` / `startReverseGeocodePick()` 未取消进行中的 `downloadBoxInteraction`。

**修复**：在两个函数开头调用 `cancelDownloadBoxPick()`。

### 问题 F：卷帘 UI 与裁剪效果不同步（严重）

**核心症状**：
- 首次启用卷帘：裁剪效果生效，但滑块/控制按钮 UI 不显示
- 刷新页面后：UI 显示，但裁剪效果不生效
- 关闭再启用：同首次，无 UI

**根本原因**：存在两个独立的 `enabled` 状态未同步：
1. `layerStore.swipeConfig.enabled` — 持久化在 localStorage，控制 UI 显示
2. `useMapSwipe` 内部 `enabled` ref — 不持久化，控制 Canvas 裁剪

刷新后 store 为 `true`（UI 显示），但 composable 为 `false`（无裁剪）。

**修复**：
- `useBasemapSwipe.js` 添加 `restoreSwipe()` 函数，从持久化配置恢复裁剪效果
- MapContainer.vue Phase 3（地图就绪）后调用 `restoreSwipe()`

### 问题 G：setSwipeConfig 响应式代理丢失（严重）

**核心症状**：`setSwipeConfig({ enabled: true })` 调用后 `layerStore.swipeConfig.enabled` 仍为 `false`。

**根本原因**：`setSwipeConfig` 用 `swipeConfig.value = { ...swipeConfig.value, ...config }` **整体替换** ref 的 `.value`。但 `useLayerStore` 通过 `const { swipeConfig } = swipeStore` 解构时，拿到的是 ref 对象引用。整体替换 `.value` 后，新对象脱离了 Pinia 的响应式代理追踪，导致通过 `layerStore.swipeConfig` 读到的仍是旧对象。

**修复**：改为逐属性就地修改：
```typescript
// 修改前（整体替换，丢失代理）
swipeConfig.value = { ...swipeConfig.value, ...config };

// 修改后（就地修改，保持代理）
if (config.enabled !== undefined) swipeConfig.value.enabled = config.enabled;
if (config.position !== undefined) swipeConfig.value.position = config.position;
if (config.mode !== undefined) swipeConfig.value.mode = config.mode;
if (config.targetLayerIds !== undefined) swipeConfig.value.targetLayerIds = config.targetLayerIds;
```

---

## 修改的文件路径

### 修改文件
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue`
  - 移动 `createBasemapSwipe()` 调用到 `LAYER_CONFIGS`/`layerInstances` 定义之后
  - 接线 `disposeDistrictManager`、`disposeInteractionPickers`、`restoreSwipe`
  - 删除废弃的 `let districtManagerRef = null`
  - 重写 `onUnmounted` 使用 composable 的 dispose 方法
  - Phase 3 后调用 `restoreSwipe()` 恢复持久化卷帘状态
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useDistrictManager.js`
  - 添加 `disposeDistrictManager()` 方法
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useMapInteractionPickers.js`
  - `pickDownloadExtent` 改用 `cancelDownloadBoxPick` 清理旧交互
  - `startBusPointPick` / `startReverseGeocodePick` 开头调用 `cancelDownloadBoxPick`
  - 添加 `disposeAll()` 方法
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useBasemapSwipe.js`
  - 添加 `restoreSwipe()` 函数，从持久化配置恢复裁剪效果
  - 新增 `import { ref, watch } from 'vue'`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useSwipeConfigStore.ts`
  - `setSwipeConfig` 改为逐属性就地修改，避免替换 ref.value 导致 Pinia 代理丢失
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\basemapSystem.js` — 新增 `createBasemapSwipe` 导出
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\interactionHandlers.js` — 新增 `createMapInteractionPickers` 导出
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\layerManager.js` — 新增 `createDistrictManagerFeature` 导出

### 新增文件（任务 2.1 前置工作）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useBasemapSwipe.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useDistrictManager.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useMapInteractionPickers.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\index.js` — 新增 3 个 barrel export

---

## 测试方案
1. `npm run build` 编译成功，无 `ReferenceError`、无 `unused variable` 警告
2. 底图卷帘分析：首次启用 UI + 裁剪同时生效 ✓
3. 底图卷帘分析：刷新页面后 UI + 裁剪同步恢复 ✓
4. 底图卷帘分析：关闭再启用正常工作 ✓
5. 行政区划边界加载和聚焦功能正常
6. 公交选点、逆地理编码选点、下载框选功能正常
7. 连续调用 `pickDownloadExtent` 不出现残留 DragBox
8. 组件卸载后无 `DistrictManager` 实例泄漏

---

*修复完成时间: 2026-05-29 18:30*
