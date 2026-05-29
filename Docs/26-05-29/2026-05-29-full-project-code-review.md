# 2026-05-29 全项目 Code Review 报告 + 修复记录

## 日期和时间
2026-05-29 18:30 ~ 20:00

## 审查范围
前端 composables、stores、components

---

## 一、Composables/Stores 审查（21 项）

### 严重 (CRITICAL) — 2 项

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| C1 | `useMapSwipe` 在工厂函数内调用 `onUnmounted`，hook 不生效 | `useMapSwipe.ts:304` | **已修复** |
| C2 | `useMapState` 同样在工厂函数内调用 `onUnmounted` | `useMapState.js:1082` | 跳过（从 setup 直接调用，不存在此问题） |

### 高优 (HIGH) — 3 项

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| C3 | `useMapState` 调用 `useRoute()`/`useRouter()` | `useMapState.js:160` | 跳过（从 setup 直接调用） |
| C4 | `monitorLayerTimeout` 无公开 dispose | `useBasemapResilience.js` | **已修复** |
| C5 | `bindBasemapSelectionWatcher` watch stop handle 无法停止 | `useBasemapSelectionWatcher.js` | **已修复** |

### 中等 (MEDIUM) — 12 项

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| C6 | `createBatchEmitter` 定时器无法取消 | `useBasemapStateManagement.js` | **已修复** |
| C7 | Draw 交互监听未显式移除 | `useDrawMeasure.js` | **已修复** |
| C8 | `postrender` 每帧运行，设置后未移除 | `useMapEventHandlers.js` | **已修复** |
| C9 | `styleCache` Map 无上限增长 | `useRouteStepStyles.js` | **已修复** |
| C10 | `requestIdleCallback` 未存储 handle | `useStartupTaskScheduler.js` | **已修复** |
| C11 | `useLayerDataImport` blob URL 无自动清理 | `useLayerDataImport.js` | 跳过（低影响） |
| C12 | `useKmzLoader` blob URL 无自动清理 | `useKmzLoader.js` | 跳过（低影响） |
| C13 | `useMessage` DOM 元素永不移除 | `useMessage.js` | 跳过（低影响） |
| C14 | `useDownloadStore` pollTimer 未清理 | `useDownloadStore.ts` | **已修复** |
| C15 | `useAttrStore` 直接修改嵌套对象 | `useAttrStore.ts` | **已修复** |
| C16 | `persistConfig` 拖拽时每秒 60+ 次 | `useSwipeConfigStore.ts` | **已修复** |
| C17 | `useLayerStore` 隐式依赖 | `useLayerStore.ts` | 跳过（文档关注） |

### 低优 (LOW) — 4 项

| # | 问题 | 状态 |
|---|------|------|
| C18 | `verifyPromptedPoiIds` Set 无上限 | 跳过 |
| C19 | 大段注释代码未清理 | 跳过 |
| C20 | `useAppStore` loading 超时未清理 | 跳过 |
| C21 | `useLayerStore` 缓存变量在模块作用域 | 跳过 |

---

## 二、Components 审查（13 项）

### 中等 (MEDIUM) — 5 项

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| D3 | TOCPanel 无 `onBeforeUnmount`，bindHandlers 回调泄漏 | `TOCPanel.vue` | **已修复** |
| D4 | `deep: true` 监听 `props.overview` 触发昂贵 syncLayers | `TOCPanel.vue` | **已修复** |
| D5 | `callDirectLLM` 45 行死代码 | `ChatPanelContent.vue` | **已修复** |
| D6 | `fetchDirectModels` 37 行死代码 | `ChatPanelContent.vue` | **已修复** |
| D7 | `clearConfirmTimer` 组件卸载时未清理 | `ChatPanelContent.vue` | **已修复** |

### 低优 (LOW) — 8 项

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| D8 | `useCompassStore()` 重复调用两次 | `MapContainer.vue` | **已修复** |
| D9 | Easter Egg 解构方法是死代码 | `MapContainer.vue` | 跳过 |
| D10 | `geocodeToolError` ref 赋值但模板未使用 | `TOCPanel.vue` | 跳过 |
| D11 | `pointerdown` 全局监听每次运行 closest() | `FloatingAccountPanel.vue` | **已修复** |
| D12 | CSS 全屏样式块重复定义 | `FloatingAccountPanel.vue` | **已修复** |
| D13 | `formatModelOptionLabel` 函数未使用 | `ChatPanelContent.vue` | **已修复** |
| D14 | API 错误信息直接展示给用户 | `ChatPanelContent.vue` | 跳过 |
| D15 | 模块级变量跨组件生命周期保持状态 | `WeatherChartPanel.vue` | 跳过 |

---

## 三、汇总

| 严重度 | 总计 | 已修复 | 跳过 |
|--------|------|--------|------|
| CRITICAL | 2 | 1 | 1 |
| HIGH | 3 | 2 | 1 |
| MEDIUM | 17 | 12 | 5 |
| LOW | 12 | 3 | 9 |
| **合计** | **34** | **18** | **16** |

跳过的项目均为低影响或需要更大范围重构的问题。

---

## 四、修改的文件清单

### Composables
- `frontend/src/composables/useMapSwipe.ts` — 移除 `onUnmounted`，暴露 `dispose()`
- `frontend/src/composables/map/features/useBasemapSwipe.js` — 传递 `dispose`，`restoreSwipe` 失败时自动关闭
- `frontend/src/composables/map/features/useBasemapResilience.js` — 添加 `disposeAllMonitors()`
- `frontend/src/composables/map/features/useBasemapSelectionWatcher.js` — 添加 `dispose()`
- `frontend/src/composables/map/features/useBasemapStateManagement.js` — `createBatchEmitter` 添加 `.cancel()`
- `frontend/src/composables/map/features/useDrawMeasure.js` — 存储 listener keys，`clearInteractions` 中 `unByKey`
- `frontend/src/composables/map/features/useMapEventHandlers.js` — `postrender` 设置后立即移除
- `frontend/src/composables/map/features/useRouteStepStyles.js` — styleCache 添加 200 条上限
- `frontend/src/composables/map/features/useStartupTaskScheduler.js` — 存储 idleCallback handle，暴露 `cancelScheduledTasks()`

### Stores
- `frontend/src/stores/useSwipeConfigStore.ts` — `setSwipeConfig` 改为逐属性修改；`updateSwipePosition` 添加 300ms 防抖
- `frontend/src/stores/useDownloadStore.ts` — 添加 `onUnmounted` 清理 pollTimer
- `frontend/src/stores/useAttrStore.ts` — `setFieldAlias`/`setFieldVisibility` 改为不可变更新

### Components
- `frontend/src/components/Map/MapContainer.vue` — 删除重复 `useCompassStore()`；接线 `disposeSwipe`
- `frontend/src/components/Layer/TOCPanel.vue` — 添加 `onBeforeUnmount`；移除 `deep: true`
- `frontend/src/components/Chat/ChatPanelContent.vue` — 删除 3 个死代码函数；添加 `onBeforeUnmount` 清理 timer
- `frontend/src/components/UserCenter/FloatingAccountPanel.vue` — `handleDocumentClick` 添加 early return；删除重复 CSS

---

*修复完成时间: 2026-05-29 20:00*
