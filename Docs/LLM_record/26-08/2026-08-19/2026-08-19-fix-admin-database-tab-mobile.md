# V3.5.28 管理后台「数据管理」子页移动端 UI 适配

## 日期与时间

2026-08-19（承接当日 V3.5.27 Tab 移动端修复会话）

## 任务等级

L2

## 问题分析

**核心症状**：管理后台「数据管理」子页在移动端（窄屏 ≤768px）布局溢出/错位——
工具栏（表选择 + 统计 + 分页三个分组）横向超出屏幕被截断，卡片头部的「刷新表」
按钮与标题挤在一行，操作控件无法完整点按。

**根本原因**（`frontend/src/domains/common/user/components/AdminControlPanel.vue`）：

1. `.db-toolbar` 虽带 `flex-wrap: wrap`，但其三个子分组（`.select-wrapper` /
   `.toolbar-stats` / `.toolbar-pager`）内部控件排成单行，**单组自身宽度就超过
   窄屏可用宽度**（如分页组：页大小 select 88px + 上一页 + 页码 + 下一页 + 导出
   ≈ 320px+，而 375px 手机扣除外层 padding 后仅约 287px），flex-wrap 对「超宽
   单行子项」无能为力，只能横向溢出被裁切。
2. `.toolbar-search` 固定 `width: 180px`，与两个 badge + 刷新按钮同排，窄屏必然溢出。
3. `.card-header` 为横排（标题 + 按钮），窄屏下刷新按钮被挤压。
4. `.rows-container` 固定 `max-height: 480px`，竖屏手机（667px 高）下单屏可滚动
   区域过大，操作按钮（编辑/删除）需要滚很久才能点到。

**受影响模块**：管理后台（admin 域）数据管理子页 / 移动端适配（纯 CSS，单文件）。

## 修改内容

在既有 `@media (max-width: 768px)` 媒体查询内追加「数据管理子页」规则（全部为 scoped
CSS，作用域仅限该组件）：

| 规则 | 说明 |
|---|---|
| `#admin-panel-database .card-header` | 改为纵向堆叠，刷新按钮独占一行靠右 |
| `.db-toolbar` | `flex-direction: column; align-items: stretch`，三组控件竖排，不再横向溢出 |
| `.select-wrapper` + `.inline-select` | 允许换行，select 弹性撑满剩余宽度（min-width 归零） |
| `.toolbar-stats` | 允许换行；`.toolbar-search` 首行独占 100% 宽 |
| `.toolbar-pager` | 允许换行；页码信息独占一行居中（order: 10），导出按钮独占一行靠右（order: 20 + margin-left: auto），上一页/下一页/页大小首行排布 |
| `.rows-container` | `max-height: 60vh`（原固定 480px），小屏下减少滚动距离 |

数据表格/插入表格本身已有 `data-table-wrapper { overflow-x: auto }`，横向滚动保持
不变（多列表格在移动端的标准交互）。

## 修改原因

管理后台是移动端高频使用场景；数据管理子页的工具栏是操作入口（切表、搜索、翻页、
导出、增删改），窄屏截断直接导致关键操作不可达。

## 影响范围

- `AdminControlPanel.vue` 数据管理子页的移动端布局（纯样式，桌面端不受影响，
  media query 仅 ≤768px 生效）。
- 其他子页（概览 / 系统配置 / 模型与地图）样式零改动；`#admin-panel-database`
  前缀保证 card-header 规则只作用于本子页。

## 解决方案

方案对比：

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 工具栏整体横向滚动（overflow-x: auto） | 实现简单，但横向滚动栏藏操作控件，体验差 | 不采用 |
| B. 竖排堆叠 + 分组内部换行 + 关键控件独立成行（采用） | 三组全宽竖排；搜索框/页码/导出各自成行，点按面积大 | 与移动端惯例一致，零 JS 改动 |
| C. 抽出移动端重排为抽屉式二级菜单 | 改动大、需交互设计，超出本次 Bug 修复范畴 | 记入后续建议 |

选型理由：B 方案纯 CSS 最小改动，把「单行必溢出」的组拆成「窄屏可换行」的流式布局，
所有控件保持原位可见可点。

## 性能指标

未实测（纯样式调整，无数据链路变更）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npx eslint src/domains/common/user/components/AdminControlPanel.vue` 通过（0 error，1 条既有 v-html 警告非本次引入） | 手机（375px 档）打开管理后台 → 数据管理：切表下拉应撑满行宽；搜索框独占一行；页码居中成行；导出按钮靠右成行；无任何横向溢出/截断 |
| `npx vite build` 构建通过（✓ built in 21.19s） | 表格多列时左右滑动正常；编辑/删除按钮可点按；行展开编辑 JSON 框宽度正常 |
| — | 桌面端回归：工具栏仍为单行横向排布（space-between），刷新按钮仍与标题同行 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/user/components/AdminControlPanel.vue` | `@media (max-width: 768px)` 内新增数据管理子页移动端布局规则 |

## 遗留与风险

- 无已知遗留。极端窄屏（<320px）下「切换当前操作表」标签与下拉同行可能偏紧，
  标签允许换行兜底。
- 承接 V3.5.27 已登记的顺带发现（`<Globe>` 未导入，L1）仍未处理，待用户决策。

## 下一步建议

- 用户实机验证通过后执行 git 提交（V3.5.27 与 V3.5.28 可一并提交，Git 操作归用户）。
- 后续若想进一步优化移动端表格体验，可规划「数据管理」子页在移动端由表格改卡片
  流式布局（多列表格横向滚动 + 卡片化详情），属功能增强，建议单独立项。