# 2026-06-21 修复 useManagedFeatureHighlight.js import 路径错误

- **日期和时间**：2026-06-21 14:35
- **修改内容**：修复 `frontend/src/composables/map/features/useManagedFeatureHighlight.js` 中两条 `import` 路径因目录层级变更而失效的问题（Vite 报错 `[plugin:vite:import-analysis] Failed to resolve import "../../stores/useFeatureStyleStore"`）。
- **修改原因**：上一轮 Pinia 化重构（见同日日志 `2026-06-21-feature-style-pinia-multi-select.md`）把 store 拆到了 `src/stores/`、把工具函数搬到了 `src/utils/map/`。本文件位于 `src/composables/map/features/`（3 层子目录），重构时导入路径写成 `'../../stores/useFeatureStyleStore'` 和 `'../../utils/map/featureKey'`，实际应为 `'../../../stores/useFeatureStyleStore'` 和 `'../../../utils/map/featureKey'`。`useCreateManagedVectorLayer.js`（同目录）写对了路径，对比之下证实是本文件遗漏修改。
- **影响范围**：`useManagedFeatureHighlight` 模块（要素高亮功能），进而阻断整个前端 Vite 构建/启动。

---

## 🔍 问题逻辑链条分析

### 症状（用户反馈）
1. `npm run dev` 启动 Vite 时立即报错：`Failed to resolve import "../../stores/useFeatureStyleStore" from "src/composables/map/features/useManagedFeatureHighlight.js"`。
2. 编辑器（IDE）打开同文件时，`useFeatureStyleStore` / `buildFeatureKey` 标红。

### 核心症状定位
| # | 症状 | 代码位置 | 触发链路 |
|---|------|---------|---------|
| 1 | 相对路径少一层 `../` | `useManagedFeatureHighlight.js:20` | 期望 `../../../stores/...` 实际写到 `../../stores/...` |
| 2 | 相对路径少一层 `../` | `useManagedFeatureHighlight.js:21` | 期望 `../../../utils/map/...` 实际写到 `../../utils/map/...` |
| 3 | 同目录姊妹文件正常 | `useCreateManagedVectorLayer.js:3` | 写法是 `../../../stores/useFeatureStyleStore` ✅ |

### 根本原因
1. **目录层级假设错误**：把 `composables/map/features/` 当作 2 层子目录计算，实际是 `composables/` → `map/` → `features/`，需 3 级 `../` 才能回到 `src/`。
2. **重构期漏改**：Pinia 化重构同步修改了 store/工具文件的物理位置，并把姊妹文件 `useCreateManagedVectorLayer.js` 的 import 一并改对；唯独 `useManagedFeatureHighlight.js` 当时未做相对路径适配，留下了回归隐患。
3. **缺少导入冒烟**：重构完成后未触发 `npm run dev` 或 `vite build` 校验模块解析阶段，导致路径错误被掩盖到本地 dev 启动时。

---

## 🛠️ 优化解决方案

### 方案
仅做路径纠错，无逻辑改动。两条 import 各加一层 `../`：
- `../../stores/useFeatureStyleStore` → `../../../stores/useFeatureStyleStore`
- `../../utils/map/featureKey` → `../../../utils/map/featureKey`

### 为什么不做模块结构再调整
- 重构刚落地，单文件修复成本最低、风险最小。
- 后续如需统一改成别名（`@/stores/...`），应单独立项 + 配 `vite.config.js`，不在本修复中夹带。

---

## 📝 修改的文件路径

### 修改
- `frontend/src/composables/map/features/useManagedFeatureHighlight.js` — 修正两条 import 路径（line 20-21）

---

## 🧪 测试方案

### 构建验证
1. 在 `frontend/` 目录执行 `npm run dev`，确认 Vite 启动无 `[plugin:vite:import-analysis]` 报错。
2. 执行 `npx vite build`，确认构建成功，无相关告警。
3. 编辑器内确认 `useFeatureStyleStore` / `buildFeatureKey` 不再标红。

### 功能验证（参照同日 Pinia 日志的测试方案）
1. 导入一份含 KML 自定义样式的 KML，连续点击 3 个要素 → 全部高亮 ✅
2. 修改其中 1 个要素样式后清高亮 → 原始样式完整还原 ✅
3. TOC 删除图层 → `useFeatureStyleStore.highlightedFeatures.size === 0` ✅

---

## 📊 性能指标

无性能变化；纯路径纠错。

---

## ⚠️ 风险与回退

- **风险极低**：仅修改 import 字符串路径，未触碰任何运行逻辑。
- **回退**：将两条路径改回原 `../../stores/...` / `../../utils/map/featureKey` 即可恢复错误状态（用于定位是否为本修复引入）。

---

## 🔗 相关日志

- `2026-06-21-feature-style-pinia-multi-select.md` — 同日 Pinia 化重构主日志（背景来源）
- `2026-06-04 data-import-code-review-tif-perf-2026-06-04.md` — useLayerDataImport.js 重构（同类模块化拆分参考）