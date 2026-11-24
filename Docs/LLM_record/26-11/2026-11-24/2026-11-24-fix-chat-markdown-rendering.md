# 2026-11-24 修复 Agent 回复 Markdown 渲染（表格 / 换行 / 样式作用域）

- **日期与时间**：2026-11-24 12:01
- **任务等级**：L2（聊天渲染修复）
- **版本**：V3.7.32

## 问题分析

### 核心症状

Agent 回复中的复杂 Markdown（双列表格、单元格内 `<br>`、加粗、引用小结）在聊天气泡中
呈现为“解析能力不足”：表格无表头区分、无边框与滚动，长单元格挤压，单换行被吞掉，
整体可读性显著低于原始 Markdown。

用户示例：风水罗盘“九星—文”的专业解读（两列表格 + 单元格 `<br>` + `> 小结` 引用）。

### 根本原因

1. **CSS 作用域断裂（主因）**：`ChatMessageList.vue` 的 `.markdown-body` 元素样式
   （`p` / `table` / `th` / `td` / `blockquote` / `li` / `code` 等，原 `:819-982`）
   位于 `<style scoped>` 块。Vue 编译后选择器形如 `.markdown-body table[data-v-xxx]`，
   而 `v-html` 注入的 DOM 节点不携带 `data-v-xxx`，因此这些规则**全部不生效**。
   文件末尾非 scoped 块只覆盖了 `.code-block-wrapper`，所以代码块有样式、表格和引用没有。
2. **单换行不转 `<br>`**：`marked` 配置 `breaks: false`，Agent 常见的单行换行在气泡中被合并。
3. **表格缺少长文本与滚动细节**：即使样式命中，`display:block; overflow-x:auto` 之外仍缺
   `word-break`、`vertical-align`、最小列宽与 `<br>` 行高控制，长中文单元格易挤压。

**已排除**：`marked` 解析本身正常。用同一段示例验证，输出包含完整 `<table>` / `<br>` /
`<strong>` / `<blockquote>`；DOMPurify 白名单也已包含 table / br / blockquote 等标签。
因此问题在样式层与配置层，不在解析层。

### 受影响模块

| 模块 | 文件 | 影响 |
|---|---|---|
| 聊天消息样式 | `common/chat/components/ChatMessageList.vue` | Markdown 元素样式不生效 |
| Markdown 渲染配置 | `common/utils/useMarkdownRenderer.ts` | 单换行与表格细节处理不足 |

## 修改内容

1. 将 `.markdown-body` 全部元素样式从 `<style scoped>` 迁至文件末尾非 scoped `<style>` 块，
   保留组件根类限定，避免泄漏到其它组件。
2. 表格增强：`min-width` + `overflow-x:auto` + `word-break:break-word` +
   `vertical-align:top` + 单元格最小宽度与行高，使双列长文本表格可读。
3. `marked` 配置 `breaks: true`，让 Agent 回复中的单换行渲染为 `<br>`。
4. 保留 DOMPurify 出口消毒与 KaTeX 后置渲染顺序，安全模型不变。

## 修改原因

`common` 中的聊天渲染是 Agent 回复的唯一出口。解析正确但样式不命中等于功能不可用，
属于渲染链路的“最后一公里”缺陷；修复不改动消毒策略，不扩大 XSS 面。

## 影响范围

- 仅影响聊天消息气泡（answer / think）中的 Markdown 呈现。
- 代码块样式原有行为不变；其它组件不受影响（样式仍以 `.markdown-body` 根类限定）。
- 不涉及配置 key、场景数据、地图引擎与移动端交互。

## 解决方案

| 方案 | 做法 | 结论 |
|---|---|---|
| A. 在 scoped 块给每个选择器加 `:deep()` | 逐条改写约 40 个选择器 | 否决：改动大且易漏 |
| B. 把 Markdown 元素样式整体迁到非 scoped 块 | 用 `.markdown-body` 根类限定 | **采用**：一次迁移，覆盖全部 v-html 节点 |
| C. 改用独立 CSS 文件全局引入 | 新建样式文件 | 否决：新增文件与结构树维护成本，收益相同 |

实施步骤：验证 marked 解析 → 迁移样式 → 增强表格/换行 → 更新版本 → 门禁与构建检查。

### Mermaid 图

```mermaid
flowchart LR
  A[Agent 原始回复] --> B[parseThinkAndAnswer]
  B --> C[extractMathExpressions]
  C --> D[marked.parse]
  D --> E[DOMPurify sanitize]
  E --> F[v-html 注入 .markdown-body]
  F --> G{样式块作用域}
  G -->|旧: scoped / data-v 断裂| X[表格/引用无样式]
  G -->|新: 非 scoped / 根类限定| Y[表格/引用/换行正确呈现]
```

## 性能指标

不适用（样式与配置调整，未引入新依赖；构建结果在收尾记录）。

## 测试方案

### Agent 已执行

- 用用户示例同构的 Markdown 验证 `marked` 输出含完整 `<table>` / `<br>` / `<strong>` / `<blockquote>`，确认解析层无缺陷。
- `vue-tsc --noEmit`：0 报错；ESLint（改动 2 文件）：0 warning / 0 error。
- `CheckStructureTree.py` 746/746、`CheckConfigRegistry.py` 七项全绿、`CheckDomainDeps.py` 四个方向均 0。
- 生产构建成功（4771 modules，19.19s）；构建产物 `ChatPanelContent-*.css` 中确认存在
  `.markdown-body table{...min-width:420px...display:block;overflow-x:auto}`，样式已进入全局块。
- 版本：写入前 README V3.7.31，本任务占 V3.7.32；收尾时并行罗盘任务已推进至 V3.7.33，
  本任务条目仍为 V3.7.32，两号不重复，无需顺延。

### 待用户实机验证

1. 让 Agent 输出含双列表格、单元格 `<br>`、`> 小结` 引用的回复。
2. 预期：表头有底色、单元格有边框与行距，长文本自动折行，窄屏可横向滚动，引用有左边框与底色。
3. 回归：代码块语言标签与复制按钮、LaTeX 公式、任务列表样式保持正常。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/components/ChatMessageList.vue` | Markdown 样式迁移至非 scoped 块并增强表格 |
| `frontend/src/domains/common/utils/useMarkdownRenderer.ts` | `breaks: true`，单换行转 `<br>` |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本记录 |
| 本文件 | L2 维护日志 |

## 遗留与风险

- `looksLikeHtml()` 仍会让“以 HTML 标签开头”的回复跳过 Markdown 解析，仅做消毒；本次未改该分支，避免扩大范围。
- 非 scoped 样式以 `.markdown-body` 根类限定，理论上会影响其它同样使用该类名的组件；当前仓库仅聊天气泡使用。
- 版本写入时 README 为 V3.7.31（并行罗盘任务持续推进），收尾需复核撞车。
