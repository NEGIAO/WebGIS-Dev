/**
 * useMarkdownRenderer - Agent 对话 Markdown 渲染 Composable
 *
 * 功能:
 *   1. 懒加载 marked / DOMPurify / katex / highlight.js（首屏零开销）
 *   2. marked v18 GFM 扩展：任务列表、表格、删除线
 *   3. 自定义 renderer：代码块带语言标签 + 复制按钮 + highlight.js 语法高亮
 *   4. LaTeX 数学公式渲染：行内 $...$ 与块级 $$...$$（KaTeX）
 *   5. Think 块格式化渲染（支持 markdown 嵌套）
 *   6. XSS 防护：DOMPurify sanitize
 *
 * 输入: rawContent (string) - 原始 LLM 回复文本
 * 输出: { renderAnswerHtml, renderThinkHtml, hasThinkContent, ready }
 */

import { ref } from 'vue';
import hljs from 'highlight.js/lib/core';

// 按需注册语言包（仅 GIS/开发常用语言，控制包体积）
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import markdown from 'highlight.js/lib/languages/markdown';
import shell from 'highlight.js/lib/languages/shell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import php from 'highlight.js/lib/languages/php';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('java', java);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('php', php);

// highlight.js 主题 CSS 通过全局 import 加载（在 ChatPanelContent.vue 中）

const markedLib = ref<any>(null);
const dompurifyLib = ref<any>(null);
const katexLib = ref<any>(null);
const libsReady = ref(false);

// ========== KaTeX 数学公式渲染 ==========

/**
 * 数学公式占位符前缀（避免 marked 破坏 LaTeX 语法）
 * 策略：在 marked 解析前将公式替换为占位符，解析后再用 KaTeX 渲染结果回代
 * 注意：占位符使用纯字母数字，避免 _ 被 marked 解析为 <em>
 */
const MATH_PLACEHOLDER_PREFIX = 'MATHPLACEHOLDER';

/**
 * 创建单次渲染的公式上下文（隔离并发渲染）
 * @returns {{ nextPlaceholder: () => string, store: Map }}
 */
function createMathContext() {
    let counter = 0;
    const store = new Map();
    return {
        nextPlaceholder() {
            counter += 1;
            return `${MATH_PLACEHOLDER_PREFIX}${counter}END`;
        },
        store,
    };
}

/**
 * 从 markdown 文本中提取数学公式并替换为占位符
 * 支持：块级 $$...$$ 和 行内 $...$（转义 \$ 除外）
 * @param {string} text - 原始 markdown 文本
 * @param {object} ctx - 公式上下文（createMathContext 返回值）
 * @returns {string} 提取公式后的文本
 */
function extractMathExpressions(
    text: string,
    ctx: { nextPlaceholder: () => string; store: Map<string, { latex: string; displayMode: boolean }> },
) {
    if (!text) return text;

    // 1. 块级公式 $$...$$（非贪婪，支持多行）
    let result = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match: string, latex: string) => {
        const placeholder = ctx.nextPlaceholder();
        ctx.store.set(placeholder, { latex: latex.trim(), displayMode: true });
        return placeholder;
    });

    // 2. 行内公式 $...$（排除 $$ 和转义 \$）
    //     规则：$ 后不紧跟 $，内容不含换行，结尾 $ 前不是 $
    result = result.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (_match: string, latex: string) => {
        const placeholder = ctx.nextPlaceholder();
        ctx.store.set(placeholder, { latex: latex.trim(), displayMode: false });
        return placeholder;
    });

    return result;
}

/**
 * 将占位符替换为 KaTeX 渲染后的 HTML
 * @param {string} html - marked 解析后的 HTML（含占位符）
 * @param {object} katex - KaTeX 库实例
 * @param {Map} mathStore - 公式存储
 * @returns {string} 替换后的 HTML
 */
function renderMathInHtml(
    html: string,
    katex: any,
    mathStore: Map<string, { latex: string; displayMode: boolean }>,
) {
    if (!katex || !mathStore.size) return html;

    let result = html;
    for (const [placeholder, { latex, displayMode }] of mathStore) {
        try {
            const rendered = katex.renderToString(latex, {
                displayMode,
                throwOnError: false,
                strict: false,
                trust: false,
            });
            result = result.split(placeholder).join(rendered);
            // 也尝试匹配 HTML 实体转义版本（& → &amp; 等）
            const htmlEscaped = placeholder
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            if (htmlEscaped !== placeholder) {
                result = result.split(htmlEscaped).join(rendered);
            }
        } catch (_e) {
            // KaTeX 解析失败时回退为原始文本
            const fallback = displayMode
                ? `<pre class="math-fallback">$$${latex}$$</pre>`
                : `<code class="math-fallback">$${latex}$</code>`;
            result = result.split(placeholder).join(fallback);
        }
    }
    return result;
}

// highlight.js 语言别名映射（常见缩写 → 正式语言名）
const HLJS_ALIAS_MAP: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    'c#': 'csharp',
    cs: 'csharp',
    kt: 'kotlin',
    dockerfile: 'docker',
    html: 'xml',
    vue: 'xml',
    jsx: 'javascript',
    tsx: 'typescript',
    'c++': 'cpp',
    tex: 'latex',
};

/**
 * 归一化 LLM 常见的加粗瑕疵：** text**（星号内侧多空格）。
 *
 * CommonMark 规定 `**` 后紧跟空白不构成强调，故 `** favorable**` 会原样输出。
 * 但 LLM 高频产出这种格式（尤其中英混排时），需在 marked 解析前修正。
 *
 * 同时处理边界瑕疵：
 * - 左：`词字符**加粗**`（CommonMark 强调开符左侧不能是 word char，CJK 也算）；
 * - 右：`**加粗**词字符`（闭符右侧紧贴词字符同样导致配对失败）。
 * 例：「放在**“汇聚智慧”**而非**“征服自然”**」两个加粗都因此失效。
 *
 * 实现方式：逐行扫描 `**` 并按出现顺序两两配对（状态机），在每一对内部做归一化。
 * 早期版本用两个贪婪正则猜配对，会把「**A：** 文字，**B**」中 A 的闭符与 B 的开符
 * 误配成一对，反而破坏原本正常的加粗——故改为确定性配对。
 *
 * 安全约束：
 * - 只在已经过 extractMathExpressions 的文本上调用，公式已是占位符，不受影响；
 * - 先提取 fenced / inline code 为占位符，代码内的 `**` 保持原样（如 Python 幂运算）；
 * - 奇数个 `**` 时最后一个视为流式未闭合，跳过不处理，避免逐字渲染时文本漂移；
 * - 逐行处理，不跨行配对。
 *
 * @param {string} text - 已提取数学公式的 markdown 文本
 * @returns {string} 归一化后的 markdown 文本
 */
function normalizeEmphasisSpacing(text: string): string {
    if (!text || !text.includes('**')) return text;

    // 1. 保护代码块：fenced (```...```) 与 inline (`...`) 提取为占位符
    const codeBlocks: string[] = [];
    const CODE_TOKEN = 'CODEEMPHASISTOKEN';
    const mask = (code: string) => {
        codeBlocks.push(code);
        return `${CODE_TOKEN}${codeBlocks.length - 1}END`;
    };
    let masked = text.replace(/```[\s\S]*?```/g, (m) => mask(m));
    masked = masked.replace(/`[^`\n]+`/g, (m) => mask(m));

    // 2. 逐行、按顺序两两配对 `**`，在每对内部归一化
    const isWordChar = (ch: string) => /[\u4e00-\u9fff\w]/.test(ch);
    const normalized = masked.split('\n').map((line) => {
        const marks: number[] = [];
        const re = /\*\*/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) marks.push(m.index);

        // 奇数个：最后一个未闭合（流式中间态），不参与配对
        const pairCount = Math.floor(marks.length / 2);
        if (pairCount === 0) return line;

        let out = '';
        let cursor = 0;
        for (let i = 0; i < pairCount; i++) {
            const open = marks[i * 2];
            const close = marks[i * 2 + 1];
            const leftChar = open > 0 ? line[open - 1] : '';
            const rightChar = close + 2 < line.length ? line[close + 2] : '';
            // 去内侧空格：`** word**` / `**word **` → `**word**`
            const inner = line.slice(open + 2, close).replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');

            out += line.slice(cursor, open);
            if (isWordChar(leftChar)) out += ' ';
            out += `**${inner}**`;
            if (isWordChar(rightChar)) out += ' ';
            cursor = close + 2;
        }
        return out + line.slice(cursor);
    }).join('\n');

    // 3. 还原代码块
    let result = normalized;
    codeBlocks.forEach((code, idx) => {
        result = result.split(`${CODE_TOKEN}${idx}END`).join(code);
    });
    return result;
}

/**
 * 将语言别名规范化为 highlight.js 能识别的语言名
 * @param {string} lang - 原始语言标识
 * @returns {string} 规范化后的语言名，无法识别时返回 ''
 */
function normalizeLang(lang: any) {
    if (!lang) return '';
    const lower = lang.trim().toLowerCase();
    const mapped = HLJS_ALIAS_MAP[lower] || lower;
    return hljs.getLanguage(mapped) ? mapped : '';
}

/**
 * 对代码文本执行 highlight.js 高亮
 * @param {string} code - 原始代码文本
 * @param {string} lang - 语言标识（已规范化）
 * @returns {string} 高亮后的 HTML
 */
function highlightCode(code: string, lang: string) {
    if (lang) {
        try {
            return hljs.highlight(code, { language: lang }).value;
        } catch (_e) {
            // 某些语言包可能缺失，降级处理
        }
    }
    // 自动检测（仅对较长代码启用，避免短片段误判）
    if (code.length > 40) {
        try {
            return hljs.highlightAuto(code).value;
        } catch (_e) {
            // noop
        }
    }
    // 最终兜底：仅 HTML 转义
    return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * 构建 marked 自定义 renderer
 * 覆写 code() 方法，注入语言标签 + 复制按钮 + 语法高亮
 * @returns {object} marked renderer 配置
 */
function buildCustomRenderer() {
    return {
        /**
         * 自定义代码块渲染：暗色主题 + 语言标签 + 复制按钮 + highlight.js 高亮
         * @param {object} params - marked v18 传入的 { text, lang, escaped } 对象
         * @returns {string} 渲染后的 HTML
         */
        code({ text, lang }: { text?: string; lang?: string }) {
            const codeText = String(text ?? '').replace(/\n$/, '');
            const normalizedLang = normalizeLang(lang);
            const langLabel = normalizedLang || lang || '';
            const highlighted = highlightCode(codeText, normalizedLang);

            // 语言标签：显示在代码块左上角
            const langBadge = langLabel
                ? `<span class="code-lang-badge">${escapeHtmlAttr(langLabel)}</span>`
                : '';

            // 复制按钮：显示在右上角，hover 时可见
            const copyBtn = '<button class="code-copy-btn" data-copy-btn="true">Copy</button>';

            // data-lang 属性供 CSS 和复制逻辑使用
            const langAttr = langLabel ? ` data-lang="${escapeHtmlAttr(langLabel)}"` : '';

            // 使用 wrapper div 作为定位容器，避免 pre 的 overflow-x 裁剪绝对定位子元素
            return `<div class="code-block-wrapper"${langAttr}>${langBadge}${copyBtn}<pre><code class="hljs${normalizedLang ? ` language-${normalizedLang}` : ''}">${highlighted}</code></pre></div>`;
        },
    };
}

/**
 * HTML 属性值转义（防止 XSS）
 * @param {string} s - 待转义字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtmlAttr(s: any) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * HTML 正文转义（用于 fallback 渲染）
 * @param {string} s - 待转义字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(s: any) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 判断文本是否看起来像原始 HTML（防止二次解析）
 * @param {string} text - 待检查文本
 * @returns {boolean}
 */
function looksLikeHtml(text: any) {
    return /^\s*<[^>]+>/.test(text);
}

/**
 * 解析 <think>...</think> 块
 * 支持多个 think 块（拼接）和未闭合块（展示为思考中）
 * @param {string} rawContent - 原始 LLM 回复
 * @returns {{ think: string, answer: string }}
 */
function parseThinkAndAnswer(rawContent: any) {
    const text = String(rawContent || '');
    const startTag = '<think>';
    const endTag = '</think>';

    // 收集所有 think 块（支持多个）
    const thinkParts = [];
    const answerParts = [];
    let cursor = 0;

    while (cursor < text.length) {
        const start = text.indexOf(startTag, cursor);
        if (start === -1) {
            answerParts.push(text.slice(cursor));
            break;
        }

        // start 之前的文本属于 answer
        answerParts.push(text.slice(cursor, start));

        const end = text.indexOf(endTag, start + startTag.length);
        if (end === -1) {
            // 未闭合：剩余全部视为思考中
            thinkParts.push(text.slice(start + startTag.length).trim());
            break;
        }

        thinkParts.push(text.slice(start + startTag.length, end).trim());
        cursor = end + endTag.length;
    }

    return {
        think: thinkParts.join('\n\n').trim(),
        answer: answerParts.join('').trim(),
    };
}

/**
 * 确保所有 markdown 渲染库已加载
 * 采用懒加载策略，仅在首次调用时 import
 */
async function ensureMarkdownLibs() {
    if (libsReady.value) return;

    // marked 已通过静态 import 的 highlight.js 先行加载，这里只需动态加载 marked + dompurify + katex
    if (!markedLib.value) {
        try {
            const mod = await import('marked');
            const lib = mod && ((mod as any).marked || (mod as any).default || mod);

            // 配置 marked：启用 GFM + 自定义 renderer
            if (lib && typeof lib.use === 'function') {
                lib.use({
                    gfm: true,           // GitHub Flavored Markdown（表格、删除线、任务列表）
                    breaks: true,        // 聊天场景：单 \n 转 <br>，避免 Agent 分行被吞
                    renderer: buildCustomRenderer(),
                });
            }
            markedLib.value = lib;
        } catch (_e) {
            markedLib.value = null;
        }
    }

    if (!dompurifyLib.value) {
        try {
            const mod = await import('dompurify');
            dompurifyLib.value = mod && (mod.default || mod);
        } catch (_e) {
            dompurifyLib.value = null;
        }
    }

    // KaTeX 懒加载（数学公式渲染）
    if (!katexLib.value) {
        try {
            const mod = await import('katex');
            katexLib.value = mod && (mod.default || mod);
        } catch (_e) {
            katexLib.value = null;
        }
    }

    libsReady.value = !!markedLib.value && !!dompurifyLib.value;
}

/**
 * DOMPurify sanitize 配置
 * 允许 target 属性（链接新窗口打开）+ class（hljs 需要）+ data-lang
 * 注意：不再允许 onclick，复制按钮改用容器事件委托
 * KaTeX 渲染在 sanitize 之后执行，故 KaTeX 相关标签需加入白名单
 */
const PURIFY_CONFIG = {
    ADD_ATTR: ['target', 'class', 'data-lang'],
    ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'strong', 'em', 'del', 's', 'u', 'mark',
        'a', 'img',
        'ul', 'ol', 'li', 'input',
        'blockquote',
        'pre', 'code', 'span',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'div', 'details', 'summary',
        'button',
        // KaTeX 输出标签
        'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub',
        'mfrac', 'msqrt', 'mroot', 'mover', 'munder', 'munderover',
        'mtable', 'mtr', 'mtd', 'mspace', 'mtext', 'annotation',
        'svg', 'path', 'line', 'rect', 'circle', 'polygon',
    ],
};

/**
 * HTML 出口统一消毒（fail-closed）
 * 所有最终写入 v-html 的字符串都必须经过本函数：
 * - DOMPurify 就绪 → 按 PURIFY_CONFIG 白名单净化；
 * - 未就绪或净化抛错 → 降级为纯文本转义，**绝不放行原始 HTML**。
 * 原实现中「DOMPurify 未加载」分支直接返回未消毒 HTML，构成首屏窗口期 XSS 缺口。
 * @param {string} html - 待消毒的 HTML 片段
 * @returns {string} 可安全交给 v-html 的字符串
 */
function sanitizeHtml(html: string) {
    const lib = dompurifyLib.value;
    if (lib && typeof lib.sanitize === 'function') {
        try {
            return lib.sanitize(html, PURIFY_CONFIG);
        } catch (_e) {
            /* 净化异常 → 落到下方转义兜底 */
        }
    }
    return escapeHtml(html).replace(/\n/g, '<br/>');
}

/**
 * 渲染 Agent 回答内容为 HTML
 * @param {string} rawContent - 原始 LLM 回复文本
 * @returns {string} 安全的 HTML 字符串
 */
function renderAnswerHtml(rawContent: any) {
    const { answer } = parseThinkAndAnswer(rawContent);
    const trimmed = String(answer || '').trim();

    if (!trimmed) return '<p style="color:#999">（正在组织回答...）</p>';

    let html;

    if (looksLikeHtml(trimmed)) {
        // 原始 HTML 分支：内容可能来自 LLM 输出（可被 prompt 注入操纵）或工具结果回显
        // （图层名、搜索关键字等用户可控字符串），因此与 markdown 路径同等对待，
        // 必须过白名单净化——原「直接透传」等于绕过 DOMPurify。
        html = sanitizeHtml(trimmed);
    } else if (markedLib.value && typeof markedLib.value.parse === 'function') {
        try {
            // 数学公式提取 → marked 解析 → DOMPurify 消毒 → KaTeX 渲染回代
            // 顺序：KaTeX 渲染在 sanitize 之后，避免其 output 的 style/mathML 标签被误杀
            const ctx = createMathContext();
            const mathMasked = extractMathExpressions(trimmed, ctx);
            // V3.7.16：LLM 常在加粗星号内侧多打空格（如 `** favorable**`），
            // CommonMark 不认这种语法；在 marked 解析前归一化（公式已遮蔽、代码受保护）
            const preprocessed = normalizeEmphasisSpacing(mathMasked);
            const parsed = markedLib.value.parse(preprocessed);
            // 先消毒（占位符是纯文本，安全通过）
            html = sanitizeHtml(parsed);
            // 再用 KaTeX 渲染数学公式（在 sanitize 之后，避免 KaTeX HTML 被杀）
            if (katexLib.value) {
                html = renderMathInHtml(html, katexLib.value, ctx.store);
            }
        } catch (_e) {
            html = escapeHtml(trimmed).replace(/\n/g, '<br/>');
        }
    } else {
        // marked 未加载的 fallback
        html = escapeHtml(trimmed).replace(/\n/g, '<br/>');
    }

    // 兜底：净化后为空（内容全被白名单过滤）时降级为纯文本，避免空气泡
    return html || escapeHtml(trimmed).replace(/\n/g, '<br/>');
}

/**
 * 渲染 Think 内容为 HTML（支持嵌套 markdown）
 * @param {string} rawContent - 原始 LLM 回复文本
 * @returns {string} 格式化后的 HTML
 */
function renderThinkHtml(rawContent: any) {
    const { think } = parseThinkAndAnswer(rawContent);
    if (!think) return '';

    // Think 内容也支持 markdown 渲染（模型可能在思考中使用列表/代码块）
    if (markedLib.value && typeof markedLib.value.parse === 'function') {
        try {
            // 数学公式提取 → marked 解析 → DOMPurify 消毒 → KaTeX 渲染回代
            const ctx = createMathContext();
            const mathMasked = extractMathExpressions(think, ctx);
            const preprocessed = normalizeEmphasisSpacing(mathMasked);
            const parsed = markedLib.value.parse(preprocessed);
            // 先消毒（占位符是纯文本，安全通过）
            let html = sanitizeHtml(parsed);
            // 再用 KaTeX 渲染数学公式（在 sanitize 之后）
            if (katexLib.value) {
                html = renderMathInHtml(html, katexLib.value, ctx.store);
            }
            return html || escapeHtml(think).replace(/\n/g, '<br/>');
        } catch (_e) {
            // fallback
        }
    }

    return escapeHtml(think).replace(/\n/g, '<br/>');
}

/**
 * 判断内容是否包含 Think 块
 * @param {string} rawContent - 原始 LLM 回复文本
 * @returns {boolean}
 */
function hasThinkContent(rawContent: any) {
    return !!parseThinkAndAnswer(rawContent).think;
}

/**
 * 注入复制按钮事件委托（只需执行一次）
 * 通过容器 click 事件委托到 [data-copy-btn] 按钮，避免 onclick 属性 XSS
 */
let copyFnInjected = false;
function injectGlobalCopyFn() {
    if (copyFnInjected || typeof window === 'undefined') return;
    copyFnInjected = true;

    document.addEventListener('click', async (e: any) => {
        const btn = e.target.closest('[data-copy-btn]');
        if (!btn) return;
        try {
            const pre = btn.closest('pre');
            const codeEl = pre?.querySelector('code');
            const text = codeEl ? codeEl.innerText : pre?.innerText || '';
            await navigator.clipboard.writeText(text);
            btn.classList.add('copied');
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.textContent = 'Copy';
            }, 1500);
        } catch (_e) {
            // clipboard API 失败时静默忽略
        }
    });
}

/**
 * 主入口：useMarkdownRenderer Composable
 * @returns {{
 *   renderAnswerHtml: (raw: string) => string,
 *   renderThinkHtml: (raw: string) => string,
 *   hasThinkContent: (raw: string) => boolean,
 *   ensureMarkdownLibs: () => Promise<void>,
 *   ready: import('vue').Ref<boolean>,
 * }}
 */
export function useMarkdownRenderer() {
    // 立即注入全局复制函数
    injectGlobalCopyFn();

    return {
        renderAnswerHtml,
        renderThinkHtml,
        hasThinkContent,
        ensureMarkdownLibs,
        ready: libsReady,
    };
}
