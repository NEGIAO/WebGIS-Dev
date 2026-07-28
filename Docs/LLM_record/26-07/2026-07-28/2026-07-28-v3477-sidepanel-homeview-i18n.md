# V3.4.77 — SidePanel / HomeView 侧栏中英文 i18n

> 日期：2026-07-28  
> 任务等级：L2  
> 版本号：V3.4.77

---

## 问题分析

### 核心症状
- `side-panel-wrapper` 未加载占位文案硬编码「展开」
- `SidePanel` 折叠手柄 title、激活功能 banner、新闻区平台/加载/空态/页脚硬编码中文
- HomeView 异步加载态与失败 toast、默认 `activeFeature.label` 硬编码中文

### 根本原因
- 语言包已有 `shell.expandPanel` / `collapsePanel` / `activeFeature` / 新闻相关键，组件未 `t()` 消费
- 平台列表 `github` / `hackernews` / `v2ex` / `stackoverflow` 未登记在 `shell.platforms`
- 缺 `shell.mapView` / `loadingPanel` / `loadPanelFailed`

### 受影响模块
- `HomeView.vue` 侧栏占位与 SidePanel 懒加载文案
- `SidePanel.vue` 折叠/激活/新闻 UI

---

## 修改内容

1. **语言包**：`shell.mapView` / `loadingPanel` / `loadPanelFailed`；`platforms` 补 4 个专有名平台键
2. **HomeView.vue**：`useLocale`；占位 `t('common.expand')`；Loading 组件 / 失败 toast / activeFeature 默认与天气切换 label 走 `shell.*`
3. **SidePanel.vue**：折叠 title、激活 banner、新闻 subtitle/loading/empty/footer 全量 `t()`；`NEWS_PLATFORM_KEYS` + `computed` 解析平台 label

---

## 修改原因

侧栏是首页右侧第一眼区域；与 TopBar / Controls 已英文化对齐，避免语言切换后仍残留中文占位。

---

## 影响范围

- 前端 Shell 侧栏文案层
- 无后端、无配置 key 变更

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 组件内双语 map | 与 useLocale 分叉 | ✗ |
| B. 扩展 shell.* + t() | 与既有 i18n 一致 | ✓ |

---

## 性能指标

未实测（文案层；`newsPlatforms` 为轻量 computed）

---

## 测试方案

### Agent 已执行
- [x] zh/en 叶节点 key 对等：887 = 887
- [x] SidePanel 用户可见中文仅剩注释
- [x] `python CheckStructureTree.py`
- [x] `python CheckConfigRegistry.py`

### 待用户实机验证
- [ ] 偏好切 EN：侧栏未展开占位显示 Expand
- [ ] 折叠手柄 title Expand panel / Collapse panel
- [ ] 新闻区 subtitle / loading / empty / footer 英文
- [ ] 平台 chip 中文名变英文（Weibo 等）；专有名 GitHub/HN 不变
- [ ] 激活功能 banner Active feature: …
- [ ] 切回中文恢复

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` | shell 增补 |
| `frontend/src/locales/en-US.js` | 同上 |
| `frontend/src/views/HomeView.vue` | 占位/加载/activeFeature i18n |
| `frontend/src/components/Shell/SidePanel.vue` | 折叠/新闻 i18n |
| `Docs/LLM_record/.../2026-07-28-v3477-sidepanel-homeview-i18n.md` | 本日志 |
| `README.md` | 版本三处 |
| `Docs/Guide/CHANGELOG.md` | 条目 |
| `Docs/Guide/frontend-structure.md` | SidePanel / HomeView 注释 |

---

## 遗留与风险

- SidePanel 内嵌的 TOC / 公交 / 驾车 / 罗盘 / 天气子面板文案未本次覆盖
- HomeView 属性信息面板等其它硬编码中文未本次覆盖
- 未浏览器实机验证
