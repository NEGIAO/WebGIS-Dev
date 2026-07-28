# V3.4.75 — Draw / Measure / Spatial 子面板中英文 i18n

> 日期：2026-07-28  
> 任务等级：L2  
> 版本号：V3.4.75

---

## 问题分析

### 核心症状
- V3.4.73 已完成 TopBar / ControlsPanel sidebar 入口 i18n
- 子面板 `DrawPanel` / `MeasurePanel` / `SpatialAnalysisPanel` 标题、工具标签、参数表单、执行结果 toast 仍硬编码中文
- 偏好页切换 EN 后，绘制/测量/空间分析面板仍整页中文

### 根本原因
- 语言包已有 `draw.*` / `measure.*` / `spatial.*` 主体键，但组件未 `t()` 消费
- Spatial 结果消息（`*Submitted`）与叠加模式（`modes.*`）此前缺键，组件内直接拼中文字符串

### 受影响模块
- ControlsPanel 三个子面板 UI 文案
- 语言包 `zh-CN` / `en-US` 的 spatial 结果/模式键

---

## 修改内容

1. **语言包**：`spatial.modes` + 各算子 `*Submitted` / `fishnetWithCenter` / `squareLabel` / `hexLabel`；清理 `draw.hints` 中误放的测量 hint（测距/测面仅保留在 `measure.hints`）
2. **MeasurePanel.vue**：标题/关闭/工具/hint/清空全量 `t('measure.*')`
3. **DrawPanel.vue**：标题/样式区/操作按钮 + `toolGroups` 改为 `computed` 读 `draw.groups|tools|hints.*`；移除 UI 对 `getDrawingHint` 硬编码中文依赖
4. **SpatialAnalysisPanel.vue**：模板参数标签/按钮 + `analysisTools`/`overlayModes` computed + 全部 `showResult` 消息走 `spatial.*`

---

## 修改原因

Controls 子面板是日常操作高频区；与 V3.4.73 顶栏/侧栏语言切换行为对齐，避免「入口已英文化、子面板仍中文」的割裂。

---

## 影响范围

- 前端 ControlsPanel 三子面板文案层
- 无后端、无配置 key、无 API 变更

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 组件内双语 map | 与 useLocale 分叉 | ✗ |
| B. 扩展 locales + 组件 t()/computed | 与 TopBar/auth 一致 | ✓ |

---

## 性能指标

未实测（文案层；`analysisTools`/`toolGroups`/`overlayModes` 为轻量 computed）

---

## 测试方案

### Agent 已执行
- [x] zh/en 叶节点 key 对等：880 = 880
- [x] 关键键存在：`draw.hints.default`、`measure.hints.*`、`spatial.modes.*`、`spatial.*Submitted`
- [x] 三面板用户可见中文仅剩 HTML/JSDoc 注释（可接受）
- [x] `python CheckStructureTree.py` — 文档 398 / 磁盘 398
- [x] `python CheckConfigRegistry.py` — 7 项全绿

### 待用户实机验证
- [ ] 偏好页切 EN：绘制面板标题 / 工具分组 / 样式区 / 操作按钮英文
- [ ] 测量面板测距/测面标签与底部 hint 英文
- [ ] 空间分析工具列表、参数标签、「执行分析」、提交结果 toast 英文
- [ ] 叠加同层错误提示英文
- [ ] 切回中文全部恢复

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` | spatial 结果/模式键；draw.hints 清理测量键 |
| `frontend/src/locales/en-US.js` | 同上 |
| `frontend/src/components/ControlsPanel/DrawPanel.vue` | 全量 i18n + toolGroups computed |
| `frontend/src/components/ControlsPanel/MeasurePanel.vue` | 全量 i18n |
| `frontend/src/components/ControlsPanel/SpatialAnalysisPanel.vue` | 全量 i18n + tools/modes computed |
| `Docs/LLM_record/.../2026-07-28-v3475-draw-measure-spatial-i18n.md` | 本日志 |
| `README.md` | 版本三处 → V3.4.75 |
| `Docs/Guide/CHANGELOG.md` | 条目 |
| `Docs/Guide/frontend-structure.md` | 三面板注释 |

---

## 遗留与风险

- `drawingToolRegistry.getDrawingHint` 仍可能返回中文（非 DrawPanel UI 路径）；若其他调用方依赖需另开任务
- `AdministrativeDivisionPanel` / `LogMonitor` / `BASEMAP_OPTIONS` label 仍硬编码，属后续 i18n 批次
- 未浏览器实机验证
