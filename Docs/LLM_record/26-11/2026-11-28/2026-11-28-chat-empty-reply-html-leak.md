# 2026-11-28 聊天空回复字面 HTML 标签泄漏修复

- **日期与时间**：2026-11-28 16:06
- **任务等级**：L2（Bug 修复）

## 一、问题分析（阶段一：写代码前完成）

### 核心症状

用户实机截图（QQ_2026-11-28_16-00-58.png）：发送「查询北京的天气和温度」后，AI 助手回答气泡显示字面文本 `<p>（未返回有效内容）</p>`，而非正常段落文字；思考过程块本身渲染正常。

### 根本原因

`frontend/src/domains/common/utils/useMarkdownRenderer.ts` 的 `renderAnswerHtml()` 把 `marked.parse()` 的输出交给 `sanitizeHtml()` 消毒。当 DOMPurify 尚未就绪或动态 import 失败时，`sanitizeHtml()` 走 fail-closed 兜底 `escapeHtml(html)`——此时传入的 `html` 已经是 `<p>（未返回有效内容）</p>\n`，于是 `<p>` 被转义成可见字符，浏览器把字面标签显示出来。

排查依据：

1. `emptyReply` 文案在 `locales/zh-CN/search-shell.ts` 中是不含标签的纯文本 `（未返回有效内容）`；`marked.parse('（未返回有效内容）')` 实测输出 `<p>（未返回有效内容）</p>\n`。
2. 全仓唯一能把 `<p>` 变成可见字面量的分支是 `sanitizeHtml()` 的 `escapeHtml(html).replace(/\n/g,'<br/>')` 兜底（`useMarkdownRenderer.ts:513`）；`renderAnswerHtml` 其他 fallback 转义的是原始纯文本，不会产生标签。
3. 渲染出口 `ChatMessageList.vue:121` 使用 `v-html="renderAnswer(msg.content)"`，缓存键含 `ready` 标志（`ChatMessageList.ts:161`），故 DOMPurify 就绪后正常消息可恢复；但若库加载失败，转义结果会一直保留。

### 受影响模块

- `frontend/src/domains/common/utils/useMarkdownRenderer.ts`：HTML 消毒与纯文本降级路径（直接缺陷）。
- `frontend/src/domains/common/chat/components/ChatMessageList.ts` / `.vue`：渲染缓存与 `v-html` 出口（间接受影响）。
- `frontend/src/domains/common/chat/components/ChatPanelContent.ts`：空回复文案落盘路径（仅触发内容来源，非标签泄漏源）。

### 候选方案对比

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| A（选定） | `sanitizeHtml(html, plainFallback?)` 降级时转义**原始纯文本**而非已解析 HTML | 一处修复覆盖 marked 路径与思考块；保持 fail-closed（不输出未消毒 HTML）；库加载失败时仍可读 | 原始 HTML 输入分支仍按字面展示，属安全兜底预期 |
| B | 静态 import DOMPurify，消灭加载窗口 | 无降级窗口 | 增大首屏包体；无法覆盖 import 彻底失败场景 |
| C | 空回复绕开 markdown 直接写 DOM | 解决当前文案 | 治标不治本，其他消息仍会泄漏标签；破坏渲染分层 |

选定 A：最小改动、覆盖根因、不降低安全级别。

## 二、修改内容

1. `sanitizeHtml(html, plainFallback?)` 新增可选纯文本回退参数；DOMPurify 未就绪 / 净化抛错时，转义 `plainFallback ?? html`，不再转义 marked 已生成的 HTML。
2. `renderAnswerHtml()` 的 marked 分支：`sanitizeHtml(parsed, trimmed)`。
3. `renderThinkHtml()` 的 marked 分支：`sanitizeHtml(parsed, think)`。
4. 原始 HTML 分支保持 `sanitizeHtml(trimmed)`（无纯文本回退）——输入本身即 HTML，降级时按字面展示是 fail-closed 的预期行为。
5. 版本同步：README 三处 + `Docs/Guide/CHANGELOG.md` 新增 V3.7.17 条目。

## 三、修改原因

截图中的字面标签不仅难看，还会让用户误以为系统输出了坏 HTML。根因是安全兜底（fail-closed）作用对象错位：防 XSS 的转义必须施加在**不可信原文**上，而不是施加在**已由 marked 生成的结构化 HTML**上。修正后既不降低安全性（仍不放行未消毒 HTML），又保证库加载失败时消息可读。

## 四、影响范围

- 聊天消息渲染（回答气泡、思考过程块）——所有经 marked 解析的 AI 回复。
- 不改变 Agent 工具编排、LLM 请求链路、后端与部署配置。

## 五、解决方案

采用候选方案 A。实施步骤：先写本日志的分析段落 → 修改 `useMarkdownRenderer.ts` 三个调用点 → `vue-tsc --noEmit` → 生产构建 → 门禁与红线自查 → 版本/日志收尾。

## 六、性能指标

未实测（本次为纯渲染逻辑修正，无算法/IO 变化；构建耗时约 34s，属既有构建规模）。

## 七、测试方案

### Agent 已执行

1. `npm run typecheck`（`vue-tsc --noEmit`）：0 错误、0 告警。
2. `npx vite build --outDir dist-verify`：构建成功（4798 modules transformed，✓ built in 33.74s）。默认 `npm run build` 因环境批量删除保护拦截 `dist/assets` 清空（260 文件 > 阈值 50）而失败，改用全新输出目录绕过，属环境限制而非代码错误。
3. `python Scripts/CheckStructureTree.py`：769/769，漏登记 0、幽灵条目 0。
4. `python Scripts/CheckConfigRegistry.py`：B1–B4 / F1–F3 全绿。
5. 平台红线自查：仅命中既有 `maxRayDistance` 已知误报（`xray` 子串），无真实禁项；`deploy/.env` 生产基线三项未破坏。
6. 静态验证：`marked.parse('（未返回有效内容）')` 实测输出 `<p>（未返回有效内容）</p>\n`，确认字面标签来自对解析结果的二次转义。

### 待用户实机验证

1. 重新打开聊天面板，发送「查询北京的天气和温度」：回答气泡应显示纯文本 `（未返回有效内容）`（或正常回复），**不得出现** `<p>` / `</p>` 字面量。
2. 发送含 Markdown 的回复（列表、加粗、代码块、公式），确认正常渲染未被破坏。
3. 若仍见字面标签，请在浏览器控制台确认 `purify.es-*.js` 分片是否 404；本修复保证即使该分片加载失败也只是纯文本降级，不会泄漏标签。

## 八、变更文件清单

- `frontend/src/domains/common/utils/useMarkdownRenderer.ts`：消毒兜底改用原始纯文本，修正回答与思考两块调用。
- `README.md`：版本号三处更新（当前版本 / 版本演进表 / 页脚）。
- `Docs/Guide/CHANGELOG.md`：新增 V3.7.17 条目。
- `Docs/LLM_record/26-11/2026-11-28/2026-11-28-chat-empty-reply-html-leak.md`：本日志。

## 九、遗留与风险

- 若线上仍显示空回复，说明根因转为「模型只输出思考过程 / 零正文」，属于模型与 max_tokens 层面问题，与本渲染修复正交；已在日志中记录排查方向（浏览器确认 purify 分片、检查 SSE final.reply 是否为空）。
- 工作区同时存在另一批次未提交的架构文档核查改动（`Docs/Architecture/*`、`Docs/Guide/frontend-structure.md`、`Docs/Guide/handover.md` 等）及未跟踪日志 `2026-11-28-architecture-docs-audit.md`，**非本任务改动**，未触碰、未覆盖；用户提交前需自行区分。
- 未执行任何 Git 写操作。
