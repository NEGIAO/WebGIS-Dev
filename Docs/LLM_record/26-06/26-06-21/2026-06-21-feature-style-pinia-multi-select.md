# 2026-06-21 要素高亮 Pinia 集中化 & 连续多选样式持久化

- **日期和时间**：2026-06-21 10:30
- **修改内容**：把要素高亮状态从 `useManagedFeatureHighlight.js` 闭包迁移到新建 Pinia store `useFeatureStyleStore`；支持连续多选（Ctrl/Shift）；把高亮样式的生命周期与 TOC 图层绑定；修复多个 `setStyle(null/undefined)` 导致 KML/自定义样式丢失的链路。
- **修改原因**：用户反馈"连续多选中几个要素后，仍旧会出现样式丢失"，且样式存储过少；闭包内 `currentHighlightedFeature` 仅存单一引用，无法支撑多选；样式备份使用 `WeakMap` 会在 feature 被 GC 时丢失；TOC 移除图层时不会清理高亮衍生数据，导致幽灵高亮与样式不可恢复。
- **影响范围**：托管矢量图层要素高亮系统、TOC 图层生命周期、用户图层样式编辑、KML 解析器、属性表选中交互。

---

## 🔍 问题逻辑链条分析

### 症状（用户反馈）
1. 连续点击 3 个要素进行高亮时，第 3 个要素样式丢失或前 1 个样式错乱。
2. 修改图层样式或删除图层后，之前高亮的要素样式无法恢复。
3. 不同要素的高亮样式属性信息不完整，仅保留极少字段。

### 核心症状定位
| # | 症状 | 代码位置 | 触发链路 |
|---|------|---------|---------|
| 1 | 连续多选仅保留最后一个 | `useManagedFeatureHighlight.js:21` `let currentHighlightedFeature = null;` | 单值变量覆盖 |
| 2 | 多选时 backup 互相覆盖 | `useManagedFeatureHighlight.js:54` `originalStyleByFeature.set(feature, ...)` WeakMap 不会串扰，但 `findManagedFeature` 返回的 feature 不一定是同一引用 | feature 实例替换 |
| 3 | KML 自定义样式被清空 | `useCreateManagedVectorLayer.js:118-119` `typeof s === 'function'` 时强制 `setStyle(null)` | 创建图层兜底分支 |
| 4 | 修改样式清空所有 per-feature 样式 | `useUserLayerActions.js:155-157` `features.forEach(f => f.setStyle(undefined))` | setUserLayerStyle |
| 5 | 清除高亮 fallback 丢失样式 | `useManagedFeatureHighlight.js:65-70` WeakMap 未命中时 `setStyle(null)` | clearManagedFeatureHighlight |
| 6 | TOC 移除图层不联动清理高亮 | `useTOCStore.ts:152` `removeLayerMeta` 只清 metadata | 没有衍生清理 |
| 7 | `forEachFeatureAtPixel` 只取第一个 | `useMapEventHandlers.js:172-178` `return false` 立即停止 | 连续多选不可能发生 |

### 根本原因
1. **样式数据所有权错位**：高亮状态保存在 `MapContainer.vue` setup 闭包中（普通 `let` + `WeakMap`），既不响应式也不跨组件共享。
2. **样式备份生命周期错位**：用 `WeakMap<OLFeature, Style>` 备份，但 feature 被销毁或重建（如 layer.styleFn 重建、`busRouteSource.clear()`）后备份就再也找不回。
3. **样式"修改"路径暴力覆盖**：`setUserLayerStyle` 和 `useCreateManagedVectorLayer` 在重建样式时主动 `setStyle(null/undefined)`，没有"先备份再清"的中间步骤。
4. **TOC store 不感知样式衍生数据**：`useTOCStore.removeLayerMeta` 只清元数据，不联动清理高亮引用与样式备份。
5. **多选语义缺失**：`singleclick` + `highlightManagedFeature` 是单选实现，没有 `Set`/`Map` 集合，没有 Ctrl/Shift 修饰键判断。

---

## 🛠️ 优化解决方案

### 方案概览
1. **新建 Pinia store `useFeatureStyleStore`** 作为高亮样式数据单一来源（Single Source of Truth）。
2. **重写 `useManagedFeatureHighlight.js` 为薄壳**（thin wrapper），所有状态读写都通过 store，composable 仅负责 OL 样式生成与 setStyle 副作用。
3. **改造 `useMapEventHandlers.js` 支持 Ctrl/Shift 多选**：单击替换、Ctrl+点击 toggle、Shift+点击区间选择。
4. **联动 TOC 生命周期**：`useTOCStore.removeLayerMeta` + `useLayerStore.syncLayers` 自动清理该图层的高亮数据。
5. **修复 `setStyle(null)` 兜底链路**：所有强制清空的位置都改为"先备份到 store，再清空"。
6. **可序列化的样式备份**：使用 `Map<FeatureKey, Style>` + `WeakRef<OLFeature>` 避免 GC 丢失引用，store 不持久化 OL 类，仅存引用。

### FeatureKey 设计
```js
// 格式：`${layerId}::${featureId}`
// 工具：utils/map/featureKey.js
export const buildFeatureKey = (layerId, featureId) => `${layerId}::${featureId}`;
export const parseFeatureKey = (key) => {
  const idx = key.indexOf('::');
  return { layerId: key.slice(0, idx), featureId: key.slice(idx + 2) };
};
```

### useFeatureStyleStore 状态设计
```ts
const highlightedFeatures = ref<Map<FeatureKey, WeakRef<OLFeature>>>(new Map());
const originalStylesByFeature = ref<Map<FeatureKey, Style | null>>(new Map());
const lastSelectedFeatureKey = ref<FeatureKey>('');
```

### 核心 Actions
| Action | 行为 | 调用方 |
|--------|------|--------|
| `highlightFeature({ layerId, featureId, mode })` | replace / toggle / range | useManagedFeatureHighlight |
| `clearHighlight(layerId?, featureId?)` | 传参清指定，否则清全部 | clearManagedFeatureHighlight |
| `clearHighlightsByLayer(layerId)` | 清该图层所有高亮 | TOC/Layer store 联动 |
| `saveOriginalStyle(layerId, featureId, style)` | 备份到 store | createLayer / setUserLayerStyle |
| `getOriginalStyle(layerId, featureId)` | 取回备份 | clearHighlight 还原 |
| `syncLayerHighlights(layerId, currentFeatureIds)` | 差量同步 | syncLayers |

### 联动点
- `useTOCStore.removeLayerMeta(layerId)` 末尾追加 `featureStyleStore.clearHighlightsByLayer(layerId);`
- `useLayerStore.syncLayers` 末尾计算 `nextLayerIds` 差量清理
- `useDataManager.removeLayer` 内部也调用一次（避免回流时序差）

---

## 📝 修改的文件路径

### 新增
- `frontend/src/stores/useFeatureStyleStore.ts` — Pinia store（高亮样式单一来源）
- `frontend/src/utils/map/featureKey.js` — FeatureKey 工具函数

### 修改
- `frontend/src/composables/map/features/useManagedFeatureHighlight.js` — 改为薄壳转发到 store
- `frontend/src/composables/map/features/useMapEventHandlers.js` — 支持 Ctrl/Shift 多选
- `frontend/src/composables/map/features/useMapUIEventHandlers.js` — mode 透传
- `frontend/src/composables/map/features/useManagedFeatureOperations.js` — 调用新接口
- `frontend/src/composables/map/features/useCreateManagedVectorLayer.js` — 备份到 store
- `frontend/src/composables/useUserLayerActions.js` — setUserLayerStyle 备份到 store
- `frontend/src/composables/useLayerDataImport.js` — KML 解析后写入 store
- `frontend/src/stores/useTOCStore.ts` — 联动清理高亮衍生数据
- `frontend/src/stores/useLayerStore.ts` — syncLayers 联动清理
- `frontend/src/stores/index.ts` — export 新 store
- `frontend/src/components/Map/MapContainer.vue` — 注入 store + 暴露新接口
- `frontend/src/components/Layer/AttributeTable.vue` — Ctrl/Shift 透传
- `frontend/src/composables/map/features/README.md` — highlight 模块更新
- `README.md`（项目根）— 文件结构树
- `frontend/README.md` — 文件结构树
- `backend/README.md` — 文件结构树（保持规范）

---

## 🧪 测试方案

### 单元测试
新增 `useFeatureStyleStore.spec.ts`（vitest）：
1. `highlightFeature replace 模式`：清空旧高亮 → 新要素高亮
2. `highlightFeature toggle 模式`：已高亮 → 取消；未高亮 → 追加
3. `highlightFeature range 模式`：从 anchor 到 target 全选
4. `clearHighlight(layerId, featureId)`：仅清该要素
5. `clearHighlightsByLayer(layerId)`：清该图层所有
6. `syncLayerHighlights`：差量更新
7. `saveOriginalStyle + getOriginalStyle`：备份还原

### 手动验证
1. 导入含 KML 自定义样式的 KML 文件 → 连续点击 3 个要素 → 全部高亮且各自样式独立
2. 修改其中一个要素的样式（draw 工具）→ 备份链路验证：原始 KML 样式完整恢复
3. 在 TOC 中删除该图层 → DevTools 检查 `useFeatureStyleStore.highlightedFeatures.size === 0` 且原图层无残留
4. Ctrl+点击同一要素 → 取消高亮
5. Shift+点击 → 区间选择（在属性表联动下）
6. WebGL 图层（>5000 要素）导入 → 多选样式通过 WebGL style 配置生效（feature-state）

### 端到端验证（若 E2E 已配置）
Playwright：模拟 click 序列，截图比对高亮元素数量。

---

## 📊 性能指标

- **多选操作**：单选替换 O(1) → 多选 toggle O(1)（Map 查询）；range O(n)（n = 区间要素数）
- **样式备份**：避免每次 setStyle 时 `feature.set('managedHighlightOriginalStyle', ...)` 内嵌字段污染 feature 属性
- **GC 友好**：WeakRef + 定期 cleanup 防止 store 内存膨胀
- **TOC 联动**：`removeLayerMeta` 同步触发 `clearHighlightsByLayer`，无 setTimeout 异步等待

---

## ⚠️ 风险与回退

- **Pinia 跨 store 引用**：`useTOCStore` 引用 `useFeatureStyleStore` 形成隐式依赖。Pinia 自动处理初始化顺序，无需手动注入。
- **WeakRef 兼容性**：现代浏览器均支持；旧浏览器（<Chrome 84 / Safari 14.1）降级为普通 Map + 显式 cleanup。
- **回退方案**：若新 store 出问题，注释掉 `useTOCStore.removeLayerMeta` 末尾的 `clearHighlightsByLayer` 调用即可恢复原行为（高亮数据残留但不报错）。
- **数据迁移**：无需迁移，旧版本高亮数据生命周期短（闭包变量），重启即清空。

---

## 🔗 相关日志

- `2026-06-04 tile-lifecycle-abort-fix.md` — 瓦片生命周期
- `2026-06-02 layer-control-visibility-fix.md` — 图层控制面板 visibility
- `2026-06-04 data-import-code-review-tif-perf-2026-06-04.md` — useLayerDataImport.js 重构
