# 2026-05-29 暂存代码 Code Review

## 日期和时间
2026-05-29 22:15

## 审查范围
14 个已暂存（staged）文件，来自第一轮 Code Review 的修复

---

## 审查结论：需修复 3 项后方可提交

### BUG-1 [必须修复] `useDownloadStore` 的 `onUnmounted` 守卫无效

**文件:** `useDownloadStore.ts:189-194`

```ts
if (getCurrentInstance()) {   // <-- Pinia Store 中永远返回 null
    onUnmounted(() => {
        stopPolling();
    });
}
```

**问题:** Pinia 的 setup store 函数由 Pinia 内部调用，不在 Vue 组件的 `setup()` 上下文中执行，因此 `getCurrentInstance()` 始终返回 `null`。这个清理回调**永远不会注册**，`setInterval` 会持续泄漏。

**建议修复:** 改用 `tryOnScopeDispose`（VueUse）或暴露 `dispose()` 方法由消费组件调用：

```ts
// 方案 A：使用 VueUse
import { tryOnScopeDispose } from '@vueuse/core'
tryOnScopeDispose(() => { stopPolling(); });

// 方案 B：移除守卫，直接暴露清理方法
function dispose() { stopPolling(); }
return { ..., dispose };
```

---

### BUG-2 [必须修复] 4 个新 dispose 函数定义了但未接线

以下函数在 composable 中正确定义并导出，但 `MapContainer.vue` 的 `onUnmounted` 中**未调用**：

| 函数 | 来源文件 | 用途 | 状态 |
|------|----------|------|------|
| `disposeAllMonitors` | `useBasemapResilience.js:257` | 清理底图超时监测器的 timer + 事件监听 | **死代码** |
| `dispose` | `useBasemapSelectionWatcher.js:374` | 停止 watcher + 中止验证请求 | **未接线** |
| `batchEmitter.cancel()` | `useBasemapStateManagement.js:56` | 取消待执行的批量更新定时器 | **未接线** |
| `cancelScheduledTasks` | `useStartupTaskScheduler.js:62` | 取消 requestIdleCallback/setTimeout | **死代码** |

**修复方式:** 在 `MapContainer.vue` 的 `onUnmounted` 中补充调用：

```js
// MapContainer.vue onUnmounted 块中需添加：
disposeAllMonitors?.();
selectionWatcherDispose?.();  // 需从 createBasemapSelectionWatcher 解构
batchEmitter?.cancel?.();
cancelScheduledTasks?.();
```

同时需要在对应的解构处提取这些函数：
- `useBasemapResilience.js` 的解构（~line 357）需加入 `disposeAllMonitors`
- `useBasemapSelectionWatcher.js` 的解构需加入 `dispose`
- `useStartupTaskScheduler.js` 的解构需加入 `cancelScheduledTasks`

---

### BUG-3 [建议修复] `TOCPanel.vue` `bindHandlers()` 无参调用清除回调的隐式约定

**文件:** `TOCPanel.vue:1187-1189`

```js
onBeforeUnmount(() => {
    layerStore.bindHandlers();  // 无参数 → 所有回调设为 undefined
});
```

**问题:** 这依赖 `bindHandlers` 内部对 `undefined` 参数的处理逻辑。如果将来 `bindHandlers` 的实现改变（例如加了默认值），这个清理就会静默失效。

**建议:** 要么添加注释说明这是有意为之的清零模式，要么显式传空对象：

```js
onBeforeUnmount(() => {
    layerStore.bindHandlers({
        onZoomToLayer: undefined,
        onShowAttributeTable: undefined,
        onToggleLayerVisibility: undefined,
        onLayerRename: undefined,
        onViewFeature: undefined,
    });
});
```

---

## 以下修改审查通过 ✓

### ChatPanelContent.vue ✓
- 删除 `callDirectLLM`（45 行）、`fetchDirectModels`（37 行）、`formatModelOptionLabel`（6 行）死代码 — 正确
- 添加 `onBeforeUnmount` 清理 `clearConfirmTimer` — 正确

### TOCPanel.vue ✓
- 移除 `deep: true` — 正确，`syncLayers` 不需要深度监听 `overview`
- 添加 `onBeforeUnmount` unbind handlers — 逻辑正确（见 BUG-3 建议）

### MapContainer.vue ✓
- 删除重复的 `useCompassStore()` 调用 — 正确
- `detachSwipeFromLayers` → `disposeSwipe` — 正确，`dispose` 内部已调用 `detachFromLayers`
- 空格/缩进调整 — 纯格式，无功能影响

### FloatingAccountPanel.vue ✓
- `handleDocumentClick` 添加 `if (!isOpen.value) return` — 正确，关闭时跳过 DOM 查询
- 删除重复的全屏 CSS 块 — 正确

### useBasemapResilience.js ✓
- `activeMonitors` Map 追踪监测器 + `disposeAllMonitors()` — 逻辑正确（需接线到 onUnmounted）

### useBasemapSelectionWatcher.js ✓
- 保存 watch stop handle + `dispose()` 清理 — 逻辑正确（需接线）

### useBasemapStateManagement.js ✓
- `createBatchEmitter` 返回的函数添加 `.cancel()` 方法 — 逻辑正确（需接线）

### useBasemapSwipe.js ✓
- `restoreSwipe` 失败路径调用 `layerStore.disableSwipe()` — 正确，避免 UI 状态不一致
- 传递 `dispose` 给消费方 — 正确

### useDrawMeasure.js ✓
- 存储 `drawListenerKeys`，`clearInteractions` 中 `unByKey` — 正确的 OL 清理模式

### useMapEventHandlers.js ✓
- `postrender` 设置 `willReadFrequently` 后立即移除监听器 — 正确，避免每帧执行

### useRouteStepStyles.js ✓
- `MAX_CACHE_SIZE = 200` + `evictIfNeeded()` — 正确，Map 迭代顺序即插入顺序，驱逐最旧条目

### useStartupTaskScheduler.js ✓
- 追踪 idleCallback/setTimeout handle + `cancelScheduledTasks()` — 逻辑正确（需接线）

### useAttrStore.ts ✓
- `setFieldAlias`/`setFieldVisibility` 改为不可变更新 `{ ...spread, field }` — 正确

---

## 修复清单（提交前必须完成）

| # | 优先级 | 文件 | 操作 |
|---|--------|------|------|
| 1 | **P0** | `useDownloadStore.ts` | 替换 `getCurrentInstance()` 守卫为 `tryOnScopeDispose` 或暴露 `dispose()` |
| 2 | **P0** | `MapContainer.vue` | 在 `onUnmounted` 中调用 `disposeAllMonitors`, `dispose`, `cancelScheduledTasks` |
| 3 | **P0** | `MapContainer.vue` | 从 composable 解构中提取上述函数 |
| 4 | P1 | `TOCPanel.vue` | 添加注释或显式传空对象 |

---

*审查完成时间: 2026-05-29 22:15*
