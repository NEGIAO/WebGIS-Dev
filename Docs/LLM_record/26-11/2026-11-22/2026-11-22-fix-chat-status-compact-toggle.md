# 2026-11-22 AI 对话状态信息栏简洁/详情折叠控件（移动端瘦身）

- **日期与时间**：2026-11-22 12:50 前后（实施中补记）
- **任务等级**：L2（UI 功能开发）
- **版本**：V3.7.10

## 问题分析

### 核心症状（用户移动端截图反馈）

AI 对话面板顶部状态信息栏（`ChatServiceStatus`）在移动端过于臃肿：就绪/模式/模型/来源/额度 pill 两行 + 两行说明文案，占据竖向空间过多；其中模型名（如 nvidia/nemotron-3.5-s…）与「免费（不扣额度）」、说明文案属于低频信息。

### 根本原因

组件将「高频一眼信息」（就绪态、路由模式）与「低频详情信息」（具体模型、消耗/额度、说明）固定同屏渲染，无任何信息分层手段；移动端竖向空间最敏感，臃肿感最强。

### 受影响模块

`frontend/src/domains/common/chat/components/ChatServiceStatus.vue/.ts`；locale 文件 zh-CN / en-US `search-shell.ts`（新增 2 键）。

### 候选方案对比

| 方案 | 做法 | 取舍 |
|---|---|---|
| A（选定） | 折叠控件：默认简洁模式只留 就绪/模式 徽章一行 + 尾部切换按钮；点击展开模型/消耗/额度/说明 | 两种诉求兼顾（用户明确选定方案 B）；偏好持久化后桌面端也一致受益 |
| B（用户方案一，未选） | 移动端直接隐藏模型/额度/说明 | 简单但用户无法按需查看详情，桌面端不受益 |
| C | 移动端断点下整体隐藏该栏 | 信息全失，未就绪/额度耗尽时缺少关键反馈，放弃 |

### 解决方案（选定 A，用户方案二）

1. **简洁模式（默认）**：第一行仅保留「已就绪」+「默认 AI 模式」两颗徽章，尾部一枚圆形 chevron 切换按钮（`margin-left: auto` 靠右）；模型 pill、消耗/额度行、说明文案 `v-show` 隐藏。
2. **详情模式**：点击切换按钮展开全部信息（模型/来源、消耗、额度、说明文案），图标切换 ChevronDown↔ChevronUp。
3. **例外（警告不可被折叠吞掉）**：额度耗尽（`quotaExhausted`）时说明文案在简洁模式下**仍强制显示**（红色高亮），避免关键警告被折叠；额度耗尽 toast 提醒逻辑不变。
4. **偏好持久化**：`localStorage` 键 `webgis.chat.statusDetailExpanded`，默认收起；读写均 try/catch 兜底（隐私模式静默降级为不持久化）。
5. **移动端基线（Force_command §3）**：切换按钮新增 `@media (pointer: coarse)` 档——可点击目标放大到 40×40px（负 margin 抵消不撑高状态行）、图标 glyph 14→20px、按钮恒常显（非悬停浮现）；判据用触屏能力不用宽度断点。存量 `@media (max-width: 700px)` 块为既有代码，不强制改写。
6. **可访问性**：按钮带 `aria-expanded` / `aria-label`（随态切换 i18n 文案）与 `:focus-visible` 焦点环；图标为 `@lucide/vue` 组件（ChevronDown/ChevronUp），无 emoji。
7. 桌面端同样默认简洁模式——信息分层逻辑与端无关，行为统一。

## 修改内容

1. `ChatServiceStatus.ts`：新增 `STATUS_DETAIL_PREF_KEY` + `readDetailExpandedPref()`（localStorage 读取，缺省/异常回退收起）；实例新增 `detailExpanded`（ref）与 `detailToggleLabel`（随态 i18n）；新增 `toggleDetail()`（切换 + 持久化，存储异常静默）；组件注册 `ChevronDown` / `ChevronUp`。
2. `ChatServiceStatus.vue`：模型 pill 加 `v-show="detailExpanded"`；消耗/额度行整体 `v-show="detailExpanded"`；说明文案 `v-show="detailExpanded || config.quotaExhausted"`；第一行尾部新增 `.detail-toggle` 切换按钮（aria 全套）；新增按钮样式与 `@media (pointer: coarse)` 触屏档。
3. `locales/zh-CN/search-shell.ts`、`locales/en-US/search-shell.ts`：新增 `chat.statusDetailShow` / `chat.statusDetailHide` 两键。

## 影响范围

- AI 对话面板状态信息栏（三模式共用组件，桌面 + 移动端行为一致）；路由切换/未就绪提示/额度耗尽警告等既有交互全部保留。
- 不涉及后端、不涉及配置 key、不涉及场景数据与 TOC。

## 性能指标

不适用（展示层信息分层；简洁模式减少移动端首屏渲染节点，无量化必要）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npx vue-tsc --noEmit` 通过；eslint（改动文件）通过；结构树/配置登记门禁通过；红线扫描无新增命中 | ① 移动端（或 DevTools 触屏模拟 + 真机）：默认只见「已就绪 + 默认 AI 模式 + 展开按钮」一行；② 点展开按钮 → 模型/额度/说明出现、箭头翻转；再点收起；③ 刷新页面 → 偏好保持；④ 后端代理模式触发额度耗尽 → 简洁模式下红色警告文案仍显示；⑤ 路由模式点击切换、未就绪态等既有交互不回归；⑥ 桌面端行为一致 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/components/ChatServiceStatus.vue` | 模板折叠 + 切换按钮 + 样式与触屏档 |
| `frontend/src/domains/common/chat/components/ChatServiceStatus.ts` | 折叠状态/持久化/切换方法/图标注册 |
| `frontend/src/locales/zh-CN/search-shell.ts` | 新增 statusDetailShow/Hide |
| `frontend/src/locales/en-US/search-shell.ts` | 同上（英文） |
| `README.md` | 版本号三处 |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.7.10 条目 |
| `Docs/LLM_record/26-11/2026-11-22/2026-11-22-fix-chat-status-compact-toggle.md` | 本日志（**新建**） |

## 遗留与风险

1. 简洁模式下「当前模型」不可见——展开即得，且有 mode-pill 标识模式；若用户希望简洁模式也带超短模型提示可再迭代。
2. 顶部绿色「当前激活功能：AI 助手」横幅不在本次范围（截图所框区域为状态信息栏），未动。
3. localStorage 偏好按浏览器存储隔离（跨设备不同步），符合预期。

## 零散修补（L1 追记）

- **2026-11-22 12:55 · 配置/状态区底部界限标识**（`ChatPanelContent.vue` 单文件 +5 行）：`.scroll-top-section` 增加 `border-bottom: 1px solid var(--brand-primary-light)` 与轻投影，与消息区形成界限分明的分区线；CSS 变量取自 `theme.css`（明暗主题自适应）。L1：无版本号；vue-tsc/eslint 通过。
- **2026-11-22 13:00 · 界限标识移动端适配**（同文件，净 +6 行）：① 发现 700px 宽度断点内被并行加入与基础规则逐字重复的 `.scroll-top-section` 声明——基础规则本就不分端生效，属冗余，已移除；② 按 §3 基线（判据 `pointer: coarse`，不用宽度断点）新增触屏档：投影加深为 `0 2px 6px rgba(var(--brand-primary-rgb), 0.16)`，小竖屏上分区感知更强。lint/vue-tsc 通过。
- **2026-11-22 13:05 · 界限标识观感优化**（`ChatPanelContent.vue` + `ChatServiceStatus.vue`，净 ~10 行）：用户反馈品牌绿实线+彩色投影「太突兀」。参考 Linear/Vercel 渐变分隔线风格改为**两端渐隐的中性细线**（`border-bottom: 1px solid` + `border-image: linear-gradient(...)`，中心 rgba(15,42,29,0.16)、触屏档 0.22），移除投影；同时删除 `.service-status` 自带浅色内边线，消除与分区线的双线叠影，边界统一。lint/vue-tsc 通过。
