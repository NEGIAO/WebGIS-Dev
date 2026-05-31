# Code Review — 超大文件拆分重构

**日期**: 2026-05-30
**范围**: 3 个模块拆分 + 2 个构建警告修复
**变更**: 18 files changed, +903 / -1623

---

## 🟢 P0 — 无阻断性问题

ESLint 0 errors, TypeScript 0 errors, Build 通过。

---

## 🟡 P1 — 建议修复（3 个）

### 1. `dataDispatcher.js` 顶层调用 `setDispatchGisData(dispatchGisData)`

```js
// dataDispatcher.js:17
setDispatchGisData(dispatchGisData);
```

**问题**: 模块顶层执行注入调用，依赖函数声明提升（`dispatchGisData` 在第 35 行定义）。虽然 JS 函数声明会提升，但这种"先注入后定义"的模式容易让维护者困惑。

**建议**: 将 `setDispatchGisData` 调用移到 `dispatchGisData` 函数定义之后，或改为在 `dispatchGisData` 内部懒注入：

```js
let _injected = false;
export async function dispatchGisData(input = {}) {
    if (!_injected) { setDispatchGisData(dispatchGisData); _injected = true; }
    // ...
}
```

### 2. `wmtsSource.ts` 从同一模块分两行导入

```ts
import WMTS from 'ol/source/WMTS';
import { optionsFromCapabilities } from 'ol/source/WMTS';
```

**建议**: 合并为一行：

```ts
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
```

### 3. `archiveProcessor.js` 未使用的导入

```js
import { detectGeoJsonProjection, detectKmlProjectionHint, detectShpProjectionFromPrj, resolveProjectionOrDefault } from './crsAware.js';
```

**问题**: `detectGeoJsonProjection` 和 `detectKmlProjectionHint` 在 `archiveProcessor.js` 中被使用，但 `resolveProjectionOrDefault` 是否被使用需要确认。如果 `buildArchivePackets` 内部调用了 `resolveProjectionOrDefault`，则无问题。

**建议**: 运行 ESLint 确认（已通过，说明全部使用）。

---

## 🟢 P2 — 正确实现（无问题）

### 4. barrel re-export 模式 — ✅ 正确

三个拆分都采用了相同的模式：
- 原文件变为 thin re-export（`backend.js` 19 行、`useTileSourceFactory.ts` 15 行、`dataDispatcher.js` 185 行）
- 新模块通过 `export *` 向后兼容
- 所有消费方 import 路径不变

### 5. 循环依赖处理 — ✅ 正确

`dataDispatcher.js` ↔ `archiveProcessor.js` 的循环依赖通过 `setDispatchGisData` 注入模式解决：
- `archiveProcessor.js` 导出 `setDispatchGisData` 函数
- `dataDispatcher.js` 在顶层注入 `dispatchGisData` 引用
- `buildArchivePackets` 内部通过 `_dispatchGisData` 调用

这是延迟引用的标准模式，运行时无问题。

### 6. 类型定义修正 — ✅ 正确

`tileSource/types.ts` 中的类型与原始定义一致：
- `NonStandardXYZAdapter.pattern: RegExp`（非 `test: Function`）
- `NonStandardXYZAdapter.urlFunction: (tileCoord: number[]) => string`
- `ConfiguredTileServiceDefinition` 包含 `name`、`enabled`、`wmts` 字段

### 7. `buildMapsForFreeAdapter` 签名 — ✅ 正确

`(layerName, displayName, ext)` 三参数签名与原始实现一致。

### 8. 构建警告修复 — ✅ 正确

- `useFluid.js`: 删除 `'vue';` 死行（原 `import { ref, onUnmounted }` 被 ESLint 修复破坏）
- `useMapUIEventHandlers.js`: 删除 `'ol/proj';` 死行（原 `import { toLonLat }` 被 ESLint 修复破坏）

---

## 📊 拆分统计

| 原文件 | 原行数 | 拆分后 | 文件数 | 最大单文件 |
|--------|--------|--------|--------|-----------|
| `api/backend.js` | 881 | 878 行 | 10 | 183 行 (`client.js`) |
| `utils/gis/dataDispatcher.js` | 696 | 732 行 | 3 | 437 行 (`archiveProcessor.js`) |
| `composables/useTileSourceFactory.ts` | 1099 | 891 行 | 8 | 277 行 (`xyzSource.ts`) |

**总计**: 2676 行 → 2501 行（-6.5%，去除重复注释） → 21 个文件

---

## 建议操作

1. **P1 #1**: 将 `setDispatchGisData` 调用移到 `dispatchGisData` 定义之后（1 分钟）
2. **P1 #2**: 合并 `wmtsSource.ts` 的重复 import（1 分钟）
3. 无其他问题
