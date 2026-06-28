# 2026-06-28 Agent 对话 Markdown 渲染优化

**日期**: 2026-06-28 16:00
**版本**: v3.3.13

---

## 📋 修改内容

- **新增 `useMarkdownRenderer.js` composable**：从 ChatPanelContent.vue 提取并重构 Markdown 渲染逻辑，集成 marked v18 + highlight.js + DOMPurify
- **代码语法高亮**：引入 highlight.js（core + 18 种常用语言），代码块支持语言着色
- **代码块语言标签**：左上角显示语言名徽章（如 `python`、`javascript`），便于快速识别
- **GFM 任务列表**：`- [x]` / `- [ ]` 渲染为带 checkbox 的任务列表
- **思考面板增强**：`<think>` 块改为 markdown 渲染（支持嵌套代码块/列表），可滚动最大高度 400px
- **去除 imperative DOM 操作**：移除 `enhanceRenderedMarkdown()` 的 `querySelectorAll` + `createElement` 注入，改为 marked renderer 直接输出 HTML
- **代码复制按钮优化**：由全局函数 `__copyCode()` 驱动，`onclick` 属性在 marked 渲染时注入

## 🔍 问题分析

### 根本原因
ChatPanelContent.vue 的 Markdown 渲染存在多个结构性问题：

1. **无语法高亮**：代码块仅用纯色背景 `#1e252b` + 浅色文字，`marked` 输出 `<code class="language-python">` 但无高亮库着色
2. **无语言标识**：用户无法快速识别代码类型
3. **DOM 操作注入 Copy 按钮**：`enhanceRenderedMarkdown()` 在 `watch(messages.length)` 后通过 `querySelectorAll` 注入，存在异步时序问题，且与 Vue 的声明式渲染范式冲突
4. **GFM 扩展未启用**：`marked.parse()` 使用默认配置，任务列表、删除线等 GFM 特性不生效
5. **Think 面板纯文本**：`<think>` 内容用 `<pre>` 展示，模型在思考中的列表/代码块无法格式化

### 受影响模块
- `ChatPanelContent.vue`：主聊天组件（渲染逻辑 + CSS）
- `composables/useMarkdownRenderer.js`：新增 composable
- `package.json`：新增 `highlight.js` 依赖

## 🛠️ 优化解决方案

### 架构变更

```
Before:
  ChatPanelContent.vue
  ├── markedLib / dompurifyLib (内部 ref)
  ├── escapeHtml / renderAnswerHtml / parseThinkAndAnswer (内联函数)
  ├── enhanceRenderedMarkdown (DOM 操作注入 Copy 按钮)
  └── watch(messages.length) → enhanceRenderedMarkdown()

After:
  composables/useMarkdownRenderer.js
  ├── highlight.js core + 18 语言包（静态 import）
  ├── marked v18 GFM 配置 + 自定义 renderer
  │   └── code() → 语言标签 + Copy 按钮 + highlight.js 高亮
  ├── parseThinkAndAnswer（多 think 块支持）
  ├── renderAnswerHtml / renderThinkHtml
  └── DOMPurify sanitize（允许 target/class/onclick/data-lang）

  ChatPanelContent.vue
  └── useMarkdownRenderer() → { renderAnswerHtml, renderThinkHtml, hasThinkContent }
```

### highlight.js 包体积优化
- 使用 `highlight.js/lib/core` + 按需注册语言包（非全量 import）
- 注册 18 种语言：javascript, typescript, python, json, xml/html, css, bash, sql, yaml, cpp, java, csharp, rust, go, markdown, shell, dockerfile, php
- vendor-libs chunk: **4,092 kB → 3,214 kB**（节省 877 kB）

### marked v18 自定义 Renderer
```js
code({ text, lang }) {
    const normalizedLang = normalizeLang(lang);     // 别名映射 (py→python, sh→bash)
    const highlighted = highlightCode(codeText, normalizedLang);  // highlight.js 高亮
    const langBadge = `<span class="code-lang-badge">${langLabel}</span>`;  // 语言标签
    const copyBtn = '<button class="code-copy-btn" onclick="__copyCode(this)">Copy</button>';
    return `<pre data-lang="${lang}">${langBadge}${copyBtn}<code class="hljs">${highlighted}</code></pre>`;
}
```

### DOMPurify 安全配置
```js
PURIFY_CONFIG = {
    ADD_ATTR: ['target', 'class', 'onclick', 'data-lang'],
    ALLOWED_TAGS: [..., 'input', 'span', 'button'],  // input: GFM checkbox, span: hljs token, button: Copy
}
```

## 📊 性能指标

| 指标 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| vendor-libs chunk | 4,092 kB | 3,214 kB | -877 kB (-21%) |
| gzip 后 | 1,389 kB | 1,106 kB | -283 kB (-20%) |
| Copy 按钮注入方式 | DOM 操作（异步） | HTML 内联（同步） | 消除时序问题 |
| 代码高亮 | 无 | highlight.js 18 语言 | ✅ 新增 |
| Think 面板 | 纯文本 `<pre>` | Markdown 渲染 | ✅ 增强 |

## 🧪 测试方案

1. 打开 ChatPanel，发送包含代码块的问题（如 "写一个 Python 函数"）
2. 验证代码块：语言标签显示、语法着色、Copy 按钮 hover 可见、点击复制成功
3. 发送包含任务列表的问题（如 "给我一个开发计划"），验证 checkbox 渲染
4. 验证 Think 面板：展开后显示格式化的 markdown（列表/代码块/段落）
5. 验证表格、引用块、链接等基础 markdown 功能不受影响

## 📁 修改的文件路径

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/package.json` | 修改 | 新增 `highlight.js` 依赖 |
| `frontend/src/composables/useMarkdownRenderer.js` | 新增 | Markdown 渲染 composable |
| `frontend/src/components/Chat/ChatPanelContent.vue` | 修改 | 移除旧渲染逻辑，接入 composable |

---

*"代码块有了颜色，就像地图有了图层——信息终于分得清了。"*
