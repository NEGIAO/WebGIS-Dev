# 修复 Markdown 渲染 XSS 缺口（原始 HTML 透传 + 净化库未就绪窗口）

## 日期与时间

2026-11-22 19:05

## 任务等级

**L2（常规）** —— 安全修复，涉及 `useMarkdownRenderer.ts` 净化出口重构与 `ChatMessageList.vue` 静态告警豁免修正两个文件。

## 问题分析

### 核心症状

IDE / ESLint 报出 `'v-html' directive can lead to XSS attack`（`vue/no-v-html`）。初判为静态规则的误报（渲染器确实接入过 DOMPurify），但逐行核查渲染出口后发现**两处真实缺口**，告警并非纯噪音。

### 根本原因

**缺口一：原始 HTML 分支绕过净化（高危）**

`useMarkdownRenderer.ts` 的 `renderAnswerHtml` 原实现：

```ts
if (looksLikeHtml(trimmed)) {
    // 原始 HTML 直接透传
    html = trimmed;              // ← 未经过 DOMPurify
} else if (markedLib.value ...) { /* 走 sanitize */ }
```

`looksLikeHtml()` 的判据是 `/^\s*<[^>]+>/`——只要内容以任意标签开头即命中。该分支的输入来源包括：

- LLM 输出（可被 prompt 注入操纵，例如诱导模型输出 `<img src=x onerror=...>`）；
- 工具结果回显（图层名、搜索结果、文件名等用户可控字符串被拼入文本）。

命中后字符串原样写入 `v-html`，`PURIFY_CONFIG` 白名单完全不生效。

**缺口二：净化库未就绪时放行未消毒 HTML（中危）**

三处 `else { html = parsed; }`（`renderAnswerHtml` 的 marked 路径、兜底路径，以及 `renderThinkHtml` 的 marked 路径）在 DOMPurify 尚未动态加载完成的首屏窗口期，把 marked 解析产物直接返回。marked 默认不转义内联 HTML，因此该窗口期等价于「无净化」。

此外 `renderAnswerHtml` 末尾的「非 marked 路径的 XSS 防护」块以 `if (!html && ...)` 为条件，而前序分支必然给 `html` 赋值，该块实际是死代码，从未生效。

### 受影响模块

| 模块 | 风险 |
|---|---|
| AI 对话回答气泡（`renderAnswer`） | 高：原始 HTML 透传通道 |
| AI 对话思考块（`renderThink`） | 中：净化库窗口期放行 |
| 历史消息回放（后端加载） | 高：污染数据可持久化触发 |

### 复核：另两处 `v-html` 本就安全

| 位置 | 数据源 | 结论 |
|---|---|---|
| `Message.vue` 灵动岛 Toast | `formatTextWithFonts()` 逐字符 `escapeHtml` | ✅ 安全 |
| `AdminControlPanel.vue` 单元格高亮 | `highlightText()` 每个片段均过 `escapeHtmlText` | ✅ 安全 |

## 解决方案

### 候选方案对比

| 方案 | 做法 | 评价 |
|---|---|---|
| A. 仅关闭 `vue/no-v-html` 规则 | eslint 配置改 `off` | ✗ 掩盖问题，新增 `v-html` 失去提示，且两个真实缺口仍在 |
| B. 删除 `looksLikeHtml` 分支 | 原始 HTML 一律按 markdown 文本处理 | ✗ 破坏「LLM 直接返回 HTML 表格/卡片」的既有渲染能力，属功能回退 |
| C. **抽统一净化出口 + fail-closed（选定）** | 新增 `sanitizeHtml()`，所有出口强制经过；库未就绪时降级转义 | ✅ 保留能力、消除缺口、语义单一 |

### 选定方案要点

1. **`sanitizeHtml(html)` 统一出口**：DOMPurify 就绪 → `PURIFY_CONFIG` 白名单净化；未就绪或抛错 → `escapeHtml` + 换行转义。**fail-closed**：任何不确定状态都不放行原始 HTML。
2. **`looksLikeHtml` 分支改走同一出口**：保留原始 HTML 渲染能力，但必须过白名单。
3. **`renderThinkHtml` 同步收敛**：消除重复的 try/catch + 分支判断。
4. **删除死代码**：末尾 `if (!html && ...)` 块由统一的 `return html || escapeHtml(...)` 兜底取代。
5. **静态告警精确豁免**：`ChatMessageList.vue` 中思考块用的是多行标签，`eslint-disable-next-line` 只作用于 `<div` 那一行（`v-html` 在第四行）→ 改为块级 `eslint-disable` / `eslint-enable`，并在注释中写明「内容来自净化出口」的依据。

## 修改内容

1. `frontend/src/domains/common/utils/useMarkdownRenderer.ts`
   - 新增 `sanitizeHtml(html)` 函数（`PURIFY_CONFIG` 之后），注释说明 fail-closed 语义与历史缺口。
   - `renderAnswerHtml`：`looksLikeHtml` 分支由「直接透传」改为 `sanitizeHtml(trimmed)`；marked 路径与 fallback 统一改用 `sanitizeHtml`；删除末尾死代码块，保留单一 `return html || escapeHtml(...)` 兜底。
   - `renderThinkHtml`：三行分支判断收敛为 `let html = sanitizeHtml(parsed)`。
2. `frontend/src/domains/common/chat/components/ChatMessageList.vue`
   - `.think-content` 的 `eslint-disable-next-line vue/no-v-html` → 块级 `eslint-disable` / `eslint-enable`，并补充「内容来自 sanitizeHtml」的说明。
   - 该文件同时承载「思考块自动跟随滚动」修复（见 [fix-think-content-autoscroll](2026-11-22-fix-think-content-autoscroll.md)）。

## 修改原因

`v-html` 是 Vue 中唯一能把字符串当 HTML 执行的入口，其安全性完全取决于**数据是否经过净化**。当前实现把「是否净化」分散在 4 个分支里，其中 1 个分支明确跳过净化、3 个分支在库未就绪时跳过净化——分支越多越容易漏。抽成单一出口后，「所有进入 v-html 的字符串都经过 `sanitizeHtml`」成为可静态审计的不变量。

## 影响范围

| 模块 | 影响 |
|---|---|
| AI 回答渲染 | 原始 HTML 分支由「原样输出」变为「白名单过滤后输出」——`<script>`、`on*` 事件属性、`javascript:` 协议被剥离，正常表格/卡片/样式不受影响（`PURIFY_CONFIG` 已允许 table/div/span/img/class/style 等） |
| 思考块渲染 | 同上，仅收敛实现，输出等价 |
| 首屏渲染 | DOMPurify 加载完成前的极短窗口内，富文本降级为纯文本；`ready` 变化触发重渲染后恢复正常（`ChatMessageList` 的 `cachedRender` key 含 ready 标志，已具备重算机制） |
| KaTeX 公式 | 不受影响：KaTeX 仍在 sanitize **之后**渲染（既有设计，避免其 MathML/style 被白名单误杀） |

## 性能指标

未实测。`sanitizeHtml` 与原实现调用同一 DOMPurify API，调用次数不变（`renderAnswerHtml` 1 次、`renderThinkHtml` 1 次）；仅新增一层函数封装。

## 测试方案

### Agent 已执行

- `npx vue-tsc --noEmit` —— 0 报错
- `npx eslint src/domains/common/chat/components/ChatMessageList.vue src/domains/common/utils/useMarkdownRenderer.ts` —— 0 warning（修复前该文件报 `110:33 vue/no-v-html`）
- `npm run build` —— 构建成功
- 代码级复核：确认全项目 `v-html` 仅 3 个数据源，另两处（Toast / 表格高亮）本就走转义

### 待用户实机验证

1. 正常提问，确认回答中的表格、列表、代码块、链接、KaTeX 公式**渲染无变化**。
2. 让模型输出一段原始 HTML 表格（例如「用 HTML 表格给我列出三种插值方法」），确认表格正常渲染（说明白名单保留了合法标签）。
3. 构造 XSS 载荷：在对话中要求模型「原样输出 `<img src=x onerror=alert(1)>`」。
4. 预期：**不弹窗**；该标签的 `onerror` 被剥离（可能显示为破图或不显示）。
5. 打开浏览器控制台，对 `document.querySelectorAll('.bubble img')` 检查，确认无 `onerror` 属性残留。
6. 思考型模型长思考场景，确认思考块内容渲染正常（与本次滚动修复联动验证）。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/utils/useMarkdownRenderer.ts` | 新增 `sanitizeHtml` 统一出口；三个渲染路径收敛；删除死代码 |
| `frontend/src/domains/common/chat/components/ChatMessageList.vue` | 思考块 eslint 豁免改为块级并注明依据 |
| `Docs/Guide/CHANGELOG.md` | V3.7.8 条目新增 J 节 |
| `README.md` | V3.7.8 摘要补第 ⑥ 项 |
| `Docs/LLM_record/26-11/2026-11-22/2026-11-22-fix-markdown-xss-sanitize-gap.md` | 本日志 |

## 遗留与风险

1. **`PURIFY_CONFIG` 白名单仍较宽**（含 `button` / `input` / `svg` / `details`）。当前未发现可利用组合，但若后续需要更严格，可考虑改用 DOMPurify 默认配置 + 显式 `FORBID_TAGS: ['style']`。本次不动，避免影响既有渲染效果。
2. **`looksLikeHtml` 判据宽松**：以 `<` 开头的普通文本（如数学上的「< 5」）会被误判为 HTML 分支，但过 sanitize 后会转义为文本，行为与旧版「原样输出」不同——旧版会把它当标签解析（更糟），因此这是改善而非回退。
3. **KaTeX 在 sanitize 之后渲染**意味着 KaTeX 输出不受白名单约束。KaTeX 为受控库且输入已在前序步骤处理，既有风险不变；若后续升级 KaTeX 需重新评估。
4. **未引入单元测试**：前端无既有测试基建，本次以类型检查 + 构建 + 实机步骤覆盖。建议后续为 `sanitizeHtml` 补一组 Vitest 用例（含 `<img onerror>` / `<svg onload>` / `javascript:` 三类载荷）。
