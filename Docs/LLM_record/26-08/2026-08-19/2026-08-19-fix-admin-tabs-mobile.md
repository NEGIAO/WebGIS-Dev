# V3.5.27 修复管理后台顶部 Tab 在移动端点按无效与不可横向滑动

## 日期与时间

2026-08-19（时间以会话内实际执行为准）

## 任务等级

L2

## 问题分析

**核心症状**（仅移动端出现，桌面端正常）：

1. 管理后台顶部四个 Tab 按钮点按无反应，无法切换面板；
2. Tab 文字显示不全（省略号截断），且 tabs-nav 不能左右滑动。

**根本原因**（`frontend/src/domains/common/user/components/AdminControlPanel.vue`）：

1. **点按无效**：`onTabsNavDragStart` 在 `touchstart` 上无条件调用 `e.preventDefault()`。
   移动端浏览器在 touchstart 被 preventDefault 后，不会派发后续合成鼠标事件（含 `click`），
   因此按钮上的 `@click` 永远不会触发。桌面端 `mousedown` 的 preventDefault 不抑制 `click`，
   所以只有移动端中招。
2. **不能横向滑动 + 文字截断**：`.tab-btn` 为 `flex: 1 1 0`（可无限收缩），四个按钮被
   强制均分宽度并压缩进容器，内容宽度永远不溢出 → `overflow-x: auto` 永不生效，
   既无滚动条也无法拖拽滑动，文字只能以省略号截断。对照组 API 面板
   （`ApiManagementPanel.vue`）用的是 `grid-template-columns: repeat(5, minmax(148px, 1fr))`，
   每格有最小宽度，窄屏自然溢出可滚动。

**受影响模块**：管理后台（admin 域）UI 交互 / 移动端适配。

## 修改内容

1. **拖拽逻辑重写**（script 段，`AdminControlPanel.vue`）：
   - `touchstart` 不再无条件 preventDefault，仅在 `mousedown`（桌面端）preventDefault 防止选中文本；
   - 新增位移阈值 `DRAG_MOVE_THRESHOLD = 10`：位移超过阈值才标记 `dragMoved` 并在
     `touchmove` 中 preventDefault（阻止拖拽时页面随手指纵向滚动）；
   - 新增捕获阶段 `@click.capture` 处理器：拖拽结束后吞掉浏览器补发的合成 click，
     避免拖动结束时误切 Tab；`touchend` 后通过宏任务复位 `dragMoved` 标志。
2. **CSS 修复**（`AdminControlPanel.vue` 样式段）：
   - `.tab-btn`：`flex: 1 1 0; min-width: 0` → `flex: 1 1 auto; min-width: 180px`。
     宽屏下依旧均分填满整行（视觉不变），窄屏下按钮无法缩到 180px 以下，
     总宽超出容器 → `overflow-x: auto` 生效，可横向滚动，文字完整显示；
   - 移动端媒体查询（≤768px）追加 `min-width: 150px`（4 格 150px + 间距约 640px，
     超过 375px 手机屏宽，滚动生效）。

## 修改原因

移动端是管理后台的日常使用场景之一，Tab 无法切换直接导致系统配置、数据管理等
面板在手机上完全不可用；文字截断与不可滑动是同一布局缺陷的表象。

## 影响范围

- 前端管理后台 `AdminControlPanel.vue`（Tab 导航交互与样式，单文件）。
- 桌面端行为不变（按钮均分填满、点击切换、拖拽滚动均保持）。

## 解决方案

方案对比：

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 去掉 touchstart preventDefault，保留其余 | 点按恢复，但页面会随拖拽纵向滚动 | 不完整 |
| B. 阈值判定 + 捕获吞 click（采用） | touchstart 不拦截，位移超阈值才 preventDefault；拖拽后吞合成 click | 点按与拖拽互不干扰，行为与原生横向滚动一致 |
| C. 改用 CSS grid minmax（同 API 面板） | 布局层解决溢出，但点击问题仍需脚本修复 | 可作为布局替代，本次以最小改动保留 flex 布局 |

选型理由：B 方案以最小改动同时解决「点按无效」与「拖拽误触」；布局沿用现有 flex，
仅调整 flex-basis 与 min-width，桌面端视觉零变化。

## 性能指标

未实测（纯交互逻辑与样式调整，无数据链路变更）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npx eslint src/domains/common/user/components/AdminControlPanel.vue` 通过（0 error，1 条既有 v-html 警告，非本次引入） | 手机浏览器打开管理后台，顶部四个 Tab 逐个点按，应能正常切换面板（重点验证原「点按无效」的 system / agent / database 三个 Tab） |
| `npx vite build` 构建通过（✓ built in 23.97s） | 窄屏（如 375px）下 Tab 文字完整显示，左右拖拽可滑动，松手不误切 Tab |
| — | 桌面端回归：四个 Tab 仍均分整行、点击切换、拖拽滚动正常 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/user/components/AdminControlPanel.vue` | Tab 拖拽逻辑重写（阈值判定 + 捕获吞 click）+ `.tab-btn` min-width 修复 + 移动端媒体查询补 min-width |

## 遗留与风险

- 无已知遗留。若极端窄屏（<320px）仍嫌 Tab 宽，可下调移动端 min-width（150px → 130px）。
- 顺带发现（已登记 TODO，按 §2.5 只记不改）：`AdminControlPanel.vue` 模板第 1250 行
  `<Globe :size="16" />`（底图配置卡片标题）使用的 `Globe` 组件未在 script 导入清单
  （3-14 行）中导入——经代码核对确认（grep 全文件仅模板一处出现 Globe，导入列表
  无此项），Vue 运行时会警告 "Failed to resolve component: Globe" 且图标渲染为空。
  修复仅需补一行导入（L1 级）。

## 下一步建议

- 用户实机验证移动端点按与滑动后，如确认无误即可提交（Git 写操作由用户执行）。
- 后续可将 `tabs-nav` 拖拽滚动抽为通用 composable（如 `useDragScroll`），
  AdminControlPanel 与 API 面板共用，避免两套实现漂移。