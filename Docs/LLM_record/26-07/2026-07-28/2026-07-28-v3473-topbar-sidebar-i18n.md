# V3.4.73 — TopBar / Sidebar 中英文 i18n

> 日期：2026-07-28 20:40  
> 任务等级：L2  
> 版本号：V3.4.73

---

## 问题分析

### 核心症状
- 主界面 `TopBar` 与 `ControlsPanel`（`sidebar-container`）大量硬编码中文标签、title、toast
- 偏好页 / 注册页切换语言后，顶栏与左侧工具栏仍固定中文

### 根本原因
- i18n 重构（V3.4.70–72）优先覆盖登录与账号体系；Shell / Controls 入口尚未接线
- `controls.*` 语言包已有侧栏标签与部分 toast 键，但组件未 `t()` 消费；`topbar.*` 整段缺失

### 受影响模块
- 顶栏导航与功能/特效菜单
- 左侧工具栏标签、卷帘配置对话框、绘制/测量相关 toast

---

## 修改内容

1. **语言包**：`zh-CN` / `en-US` 新增 `topbar.*`（菜单、分享、2D/3D、屏幕特效、常用地点等）；`controls.*` 补齐卷帘对话框与绘制/测量 toast 键
2. **TopBar.vue**：`useLocale`；模板与 `activate-feature` label、分享文案、日志 toast 全部 `t()`；常用地点 `computed` 按 `labelKey` 解析
3. **ControlsPanel.vue**：`menuItems` 改为 `computed` 读 `controls.*`；卷帘对话框与业务 toast 全量 i18n；绘制类型 label 复用 `draw.tools.*`

---

## 修改原因

登录后主壳 UI 是语言切换的第一眼区域；与 Interface Language 行为对齐。

---

## 影响范围

- 前端 Shell / ControlsPanel 文案
- 无后端、无配置 key 变更

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 组件内 hardcode 双语 map | 与现有 useLocale 分叉 | ✗ |
| B. 扩展 locales + 组件 t() | 与 auth/shell 一致 | ✓ |

---

## 性能指标

未实测（文案层；`menuItems`/`quickLocations` 为轻量 computed）

---

## 测试方案

### Agent 已执行
- [x] zh/en 叶节点 key 对等脚本：864 = 864（topbar 45 键）
- [x] `python CheckStructureTree.py` — 398/398
- [x] `python CheckConfigRegistry.py` — 7 项全绿

### 待用户实机验证
- [ ] 偏好页切 EN：顶栏 Menu / Share / AI / 2D·3D / Account / Screen effects 英文
- [ ] 左侧 sidebar 标签 Layers / News / Draw… 英文
- [ ] 卷帘对话框标题与按钮英文
- [ ] 分享成功 toast 英文；日志监控开/关 toast 英文
- [ ] 切回中文全部恢复

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` | topbar + controls 增补 |
| `frontend/src/locales/en-US.js` | 同上 |
| `frontend/src/components/Shell/TopBar.vue` | 全量 i18n |
| `frontend/src/components/ControlsPanel/ControlsPanel.vue` | sidebar + swipe + toast i18n |
| `Docs/LLM_record/.../2026-07-28-v3473-topbar-sidebar-i18n.md` | 本日志 |
| `README.md` | 版本三处 |
| `Docs/Guide/CHANGELOG.md` | 条目 |
| `Docs/Guide/frontend-structure.md` | TopBar / ControlsPanel 注释 |

---

## 遗留与风险

- 卷帘对话框内底图 `option.label` 仍来自 `BASEMAP_OPTIONS` 常量（多为中文或专有名），未本次翻译
- DrawPanel / MeasurePanel / SpatialAnalysisPanel 等子面板若仍有硬编码，属后续任务（可记 TODO）
- 未浏览器实机验证
