# 2026-06-22 暂存区 Code Review 修复：托管图层 ID 时序与高亮清理兼容

- **日期和时间**：2026-06-22 11:43
- **修改内容**：修复暂存区 Code Review 发现的托管矢量图层创建时 `id` 使用时序错误、旧高亮清理调用缺少 `layerId` 时无法清理的问题，并清理维护文档中的 trailing whitespace。
- **修改原因**：用户要求检查暂存区代码并直接修复；审查发现 V3.3.8 要素高亮 Pinia 化补丁中存在运行时回归风险和 Git whitespace 检查失败。
- **影响范围**：前端托管矢量图层创建链路、要素高亮/清理链路、属性查询点击命中统计、Docs 维护日志。
- **性能指标**：本次为正确性修复，不涉及性能优化；预期不增加地图交互复杂度。

---

## 问题逻辑链条分析

### 核心症状
1. `useCreateManagedVectorLayer.js` 在 `const id = createManagedLayerId()` 声明前调用 `featureStyleStore.saveOriginalStyle(id, ...)`。
2. `clearManagedFeatureHighlight(currentHighlighted)` 旧调用链只传入 `Feature`，新实现要求同时传入 `layerId`，导致兼容 API 语义退化。
3. `useMapEventHandlers.js` 中 `forEachFeatureAtPixel` 回调返回 `true`，OpenLayers 会停止遍历，无法累积所有命中要素。
4. `git diff --cached --check` 报告两份维护日志存在行尾空格。

### 根本原因
- Pinia 化改造将高亮状态从闭包迁移到 store 后，图层 ID 生成、要素 ID 生成、样式备份三个步骤的先后顺序没有重新校准。
- 兼容旧 API 时只保留函数签名，没有补齐“仅传 Feature 时从 store 反查 FeatureKey”的路径。
- OpenLayers `forEachFeatureAtPixel` 的回调返回值语义被误解：返回 truthy 会终止遍历，而不是继续遍历。
- 维护日志中 Markdown 硬换行和代码块行尾空格触发 Git whitespace 检查。

### 受影响模块
- `frontend/src/composables/map/features/useCreateManagedVectorLayer.js`
- `frontend/src/composables/map/features/useManagedFeatureHighlight.js`
- `frontend/src/composables/map/features/useMapEventHandlers.js`
- `Docs/26-06/26-06-21/*.md`
- `README.md`、`frontend/README.md`、`backend/README.md`

---

## 优化解决方案

1. 在创建托管图层时提前生成 `id`，并先执行 `ensureFeatureId`，再进行样式备份，确保 `layerId + featureId` 复合键稳定可用。
2. 扩展 `clearManagedFeatureHighlight`：
   - 支持传入 `FeatureKey` 字符串；
   - 支持仅传入 OL Feature 时，通过 `store.highlightedList` 反查对应 `layerId/featureId`；
   - 找不到匹配项时保持 no-op，避免误清其他高亮。
3. 将 `forEachFeatureAtPixel` 回调改为返回 `false`，累积所有命中要素但仍以第一个命中作为默认选中目标。
4. 清理维护日志行尾空格，保证 `git diff --check` 可通过。
5. 同步 README 结构与版本记录，保持文档可回溯。

---

## 测试方案

1. 运行 `npm --prefix d:\\Dev\\GitHub\\WebGIS_Dev\\frontend run build`，确认前端构建通过。
2. 运行 `git -C d:\\Dev\\GitHub\\WebGIS_Dev diff --check`，确认工作区无 whitespace 错误。
3. 运行 `git -C d:\\Dev\\GitHub\\WebGIS_Dev diff --cached --check`，确认暂存区原有 whitespace 问题已同步修复后不再出现。
4. 手动验证：导入 KML/GeoJSON 后点击要素高亮，切换选择、清空高亮、移除图层时样式可恢复且控制台无 `id` 相关异常。

---

## 修改的文件路径

- `D:\\Dev\\GitHub\\WebGIS_Dev\\Docs\\26-06\\26-06-22\\2026-06-22-fix-staged-feature-highlight-review.md`
- `D:\\Dev\\GitHub\\WebGIS_Dev\\frontend\\src\\composables\\map\\features\\useCreateManagedVectorLayer.js`
- `D:\\Dev\\GitHub\\WebGIS_Dev\\frontend\\src\\composables\\map\\features\\useManagedFeatureHighlight.js`
- `D:\\Dev\\GitHub\\WebGIS_Dev\\frontend\\src\\composables\\map\\features\\useMapEventHandlers.js`
- `D:\\Dev\\GitHub\\WebGIS_Dev\\Docs\\26-06\\26-06-21\\2026-06-21-enhance-html-attribute-parser.md`
- `D:\\Dev\\GitHub\\WebGIS_Dev\\Docs\\26-06\\26-06-21\\2026-06-21-fix-feature-style-store-types-and-bugs.md`
- `D:\\Dev\\GitHub\\WebGIS_Dev\\README.md`
- `D:\\Dev\\GitHub\\WebGIS_Dev\\frontend\\README.md`
- `D:\\Dev\\GitHub\\WebGIS_Dev\\backend\\README.md`