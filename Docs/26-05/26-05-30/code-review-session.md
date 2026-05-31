# Code Review — 2026-05-30 全部变更

**范围**: 36 files, +2642 / -2606
**类型**: ESLint 修复 + 模块拆分 + Bug 修复 + 性能优化

---

## 🟢 P0 — 无阻断性问题

ESLint 0 errors, TypeScript 0 errors, Build 通过。

---

## ✅ P1 — 已验证，无问题

### 1. `useLayerControlHandlers.js` — 可见性变更跳过 `refreshLayersState` ✅

`refreshLayerInstances` 内部逻辑：`ensureLayerSourceById`（层实例已存在时为空操作）+ `setVisible` + `setZIndex` + `setOpacity`。切换可见性时层实例必定已存在，直接调用 `setVisible` + `emitBaseLayersChange` 是正确的轻量路径。

### 2. `useMapState.js` — 浮点数比较阈值 ✅

0.001 阈值对 opacity (0-1) 合理，无问题。

### 3. `useRouteRendering.js` — `getBusRouteLayer()` 多次调用 ✅

两次调用之间图层不会变化，极低风险。可选优化为缓存，非必须。

### 4. `HomeView.vue` — CSS 变量变更 ✅

UI 变更，`--brand-primary-light` → `--brand-primary-dark`，预期行为。

---

## 🟢 P2 — 正确实现（无问题）

### 5. 路线 TOC 注册修复 — ✅ 正确

**根因**: `busRouteLayerRef` 是 `let` 变量，`createRouteRenderingFeature` 调用时为 `null`，闭包捕获了 `null`。

**修复**: 改为 `getBusRouteLayer: () => busRouteLayerRef`，闭包每次调用时读取当前值。

**验证**: `syncRouteManagedLayer` 现在能正确获取图层实例，调用 `addManagedLayerRecord` 注册到 TOC。

### 6. `refreshUserLayerZIndex` 空值保护 — ✅ 正确

```diff
- item.layer.setZIndex(zIndex);
+ item.layer?.setZIndex?.(zIndex);
```

防止 `removeUserLayer` 后遍历时 `item.layer` 为 `undefined` 导致崩溃。

### 7. DragBox 框选 UI — ✅ 正确

添加绿色主题的 `boxStyle`（虚线边框 + 半透明填充），与项目品牌色一致。

### 8. 模块拆分（backend/tileSource/dataDispatcher）— ✅ 正确

所有拆分均采用 barrel re-export 模式，消费方 import 路径不变。ESLint + TypeScript + Build 全部通过。

### 9. ESLint 全项目修复 — ✅ 正确

389 → 0 errors。配置了 `argsIgnorePattern: '^_'` 和 `varsIgnorePattern: '^_'`，Node.js 文件添加 `globals.node`。

### 10. 构建警告修复 — ✅ 正确

`useFluid.js` 和 `useMapUIEventHandlers.js` 的损坏导入已清理。

---

## 📊 变更统计

| 类别 | 文件数 | 行数变化 |
|------|--------|---------|
| 模块拆分（新建） | 18 | +2233 |
| 模块拆分（原文件变 barrel） | 3 | -2541 |
| Bug 修复 | 4 | +15 |
| 性能优化 | 2 | +22 |
| ESLint/TS 修复 | 50+ | ~0 (净) |
| 文档/配置 | 4 | +122 |

---

## 结论

全部 P1 已验证通过，无阻断性问题，可提交。
