# Code Review — 暂存区变更

**日期**: 2026-05-30
**范围**: 80 files, +481 / -450
**类型**: ESLint 全项目修复 + TypeScript 配置

---

## 🔴 P0 — 必须修复（阻断性问题）

### 1. `useFluid.js` 导入语句被破坏
```diff
-import { ref, onUnmounted } from 'vue';
+ 'vue';
```
**文件**: `src/composables/Magic/useFluid.js:2`
**问题**: `import { ref, onUnmounted }` 被替换成了字面量 `'vue';`，这是一个**语法错误**，会导致模块无法加载。
**原因**: 批量修复脚本在移除 `ref` 和 `onUnmounted` 时，把整个 import 语句破坏了。
**修复**: 删除该行或改为 `// 'vue' - unused import removed`。

### 2. `useAttrStore.ts` 解构别名不一致
```diff
-const { flattenAttributes, inferValueType, ... } = createLayerMetadataNormalizationFeature();
+const { flattenAttributes: _flattenAttributes, inferValueType, ... } = createLayerMetadataNormalizationFeature();
```
**文件**: `src/stores/useAttrStore.ts:49`
**问题**: 添加了 `: _flattenAttributes` 别名，但如果函数体中其他地方引用 `flattenAttributes`（不带下划线），会找不到。
**建议**: 确认该变量确实完全未使用，或改用 `eslint-disable` 注释。

---

## 🟡 P1 — 建议修复（潜在风险）

### 3. `_` 前缀变量仍然被声明但未使用
多个文件中，未使用的变量被加上 `_` 前缀后仍然保留在代码中：
- `_buildSystemPrompt` (ChatPanelContent.vue:491)
- `_switchDebounceMs` (useBasemapSelectionWatcher.js:28)
- `_emitFeatureSelected` (useDrawMeasure.js:150)
- `_mapInstanceRef`, `_refreshUserLayerZIndex`, `_gridSize` (useSpatialAnalysis.js)
- `_TIANDITU_TK` (useUserLocation.js:11)
- `_flattenAttributes` (useAttrStore.ts:49)
- `_DBF_FIELD_TYPE_NAMES`, `_byte1`, `_byte2`, `_headerBytes`, `_ldid` (dbfParser.ts)
- `_polyStyleExample`, `_lineStyleExample`, `_iconStyleExample` (kmlStyleParser.doc.js)
- `_isPoint` (kmlStyleParser.js)
- `_originalPropsCount` (shpParser.ts)
- `_segmentIndex` (explanationLookup.ts)
- `_readShareModeFromUrl` (router/index.js)

**建议**: 如果确认这些变量完全无用，应该直接删除声明，而不是加 `_` 前缀。`_` 前缀方案适合函数参数（调用方需要保持签名一致），但不适合局部变量。

### 4. `catch (err)` 中 `err` 未使用但 catch 块有逻辑
```diff
-} catch (err) {
+} catch { /* ignored */
     continue;
```
**文件**: `vectorUtils.js:36`, `useBasemapSelectionWatcher.js:355`
**问题**: catch 块中有 `continue` 或其他逻辑，说明错误被"有意忽略"。但移除 `err` 参数后，如果未来需要添加日志，需要重新加回参数。
**建议**: 保留 `catch (_)` 或 `catch (_err)` 以表明有意忽略，比空 `catch {}` 更清晰。

### 5. `console.debug` → `console.warn` 语义变化
```diff
-console.debug('[OL-Queue-Clear] Error clearing source:', e);
+console.warn('[OL-Queue-Clear] Error clearing source:', e);
```
**文件**: `useMapState.js:754`, `useTileSourceFactory.ts:420`
**问题**: `console.debug` 是调试级别，`console.warn` 是警告级别。将调试信息提升为警告会在生产环境中产生不必要的噪声。
**建议**: 对于非关键错误，考虑使用 `console.error`（更语义化）或添加 ESLint 配置允许 `console.debug`。

---

## 🟢 P2 — 无问题（正确修复）

### 6. Vue 属性排序 — ✅ 正确
所有 `v-if`、`v-for`、`ref`、`v-model` 移到 `class`、`@click` 之前。符合 Vue 官方风格指南。

### 7. `let` → `const` — ✅ 正确
所有从未重新赋值的变量改为 `const`。包括：
- Magic composable 中的 `mouse`、`ripples`、`colorTable` 等
- 各处循环中的 `idx`、`dist`、`falloff` 等

### 8. 未使用导入移除 — ✅ 正确
- `api/index.js`: 移除 `apiLocationIpLocate`、`apiLocationReverse`、`apiLocationTrackVisit`
- `PalaceExplanationPanel.vue`: 移除 `ref`、`watch`
- `LogMonitor.vue`: 移除 `nextTick`
- `useBasemapSwipe.js`: 移除 `watch`
- `useMapUIEventHandlers.js`: 移除 `toLonLat`
- `theme.ts`: 移除 `Layer`
- `useGisLoader.ts`: 移除 `createUnsupportedProjectedCrsError`

### 9. ESLint 配置改进 — ✅ 正确
- 添加 `globals.node` 支持 Node.js 脚本
- 配置 `@typescript-eslint/no-unused-vars` 忽略 `_` 前缀
- `tsconfig.json` 创建合理

### 10. TypeScript 修复 — ✅ 正确
- `DistrictManager.ts`: `ol/_layer/Vector` → `ol/layer/Vector`
- `decompressor.ts`: 添加 `as any` 类型断言
- `loadJsZip.ts`: 修复 `typeof import('jszip')['default']` → `typeof import('jszip')`
- `dbfParser.ts`: catch 块中补充 `err` 参数
- `crs-engine.ts`: `<T extends any>` → `<T>`

### 11. `defineProps`/`defineEmits` 无赋值 — ✅ 正确
```diff
-const props = defineProps({...});
+defineProps({...});
```
Vue 3.3+ 支持宏函数不赋值给变量，模板中直接使用解构后的属性名。

---

## 📊 统计

| 类别 | 数量 | 状态 |
|------|------|------|
| P0 阻断性问题 | 2 | 🔴 需修复 |
| P1 建议修复 | 3 | 🟡 建议处理 |
| P2 正确修复 | 6 | ✅ 无问题 |

---

## 建议操作

1. **立即修复** P0 #1（useFluid.js 导入破坏）
2. **确认** P0 #2（useAttrStore.ts 变量是否真的无用）
3. **考虑** P1 #3 中的 `_` 前缀变量是否应该直接删除
4. **评估** P1 #5 的 console.warn 语义是否合适
