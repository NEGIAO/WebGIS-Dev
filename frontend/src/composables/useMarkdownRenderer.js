/**
 * useMarkdownRenderer - Agent 对话 Markdown 渲染 Composable
 *
 * 功能:
 *   1. 懒加载 marked / DOMPurify / highlight.js（首屏零开销）
 *   2. marked v18 GFM 扩展：任务列表、表格、删除线
 *   3. 自定义 renderer：代码块带语言标签 + 复制按钮 + highlight.js 语法高亮
 *   4. Think 块格式化渲染（支持 markdown 嵌套）
 *   5. XSS 防护：DOMPurify sanitize
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

const markedLib = ref(null);
const dompurifyLib = ref(null);
const libsReady = ref(false);

// highlight.js 语言别名映射（常见缩写 → 正式语言名）
const HLJS_ALIAS_MAP = {
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
 * 将语言别名规范化为 highlight.js 能识别的语言名
 * @param {string} lang - 原始语言标识
 * @returns {string} 规范化后的语言名，无法识别时返回 ''
 */
function normalizeLang(lang) {
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
function highlightCode(code, lang) {
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
        code({ text, lang }) {
            const codeText = String(text ?? '').replace(/\n$/, '');
            const normalizedLang = normalizeLang(lang);
            const langLabel = normalizedLang || lang || '';
            const highlighted = highlightCode(codeText, normalizedLang);

            // 语言标签：显示在代码块左上角
            const langBadge = langLabel
                ? `<span class="code-lang-badge">${escapeHtmlAttr(langLabel)}</span>`
                : '';

            // 复制按钮：显示在右上角，hover 时可见
            const copyBtn = '<button class="code-copy-btn" onclick="__copyCode(this)">Copy</button>';

            // data-lang 属性供 CSS 和复制逻辑使用
            const langAttr = langLabel ? ` data-lang="${escapeHtmlAttr(langLabel)}"` : '';

            return `<pre${langAttr}>${langBadge}${copyBtn}<code class="hljs${normalizedLang ? ` language-${normalizedLang}` : ''}">${highlighted}</code></pre>`;
        },
    };
}

/**
 * HTML 属性值转义（防止 XSS）
 * @param {string} s - 待转义字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtmlAttr(s) {
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
function escapeHtml(s) {
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
function looksLikeHtml(text) {
    return /^\s*<[^>]+>/.test(text);
}

/**
 * 解析 <think>...</think> 块
 * 支持多个 think 块（拼接）和未闭合块（展示为思考中）
 * @param {string} rawContent - 原始 LLM 回复
 * @returns {{ think: string, answer: string }}
 */
function parseThinkAndAnswer(rawContent) {
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
            cursor = text.length;
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

    // marked 已通过静态 import 的 highlight.js 先行加载，这里只需动态加载 marked + dompurify
    if (!markedLib.value) {
        try {
            const mod = await import('marked');
            const lib = mod && (mod.marked || mod.default || mod);

            // 配置 marked：启用 GFM + 自定义 renderer
            if (lib && typeof lib.use === 'function') {
                lib.use({
                    gfm: true,           // GitHub Flavored Markdown（表格、删除线、任务列表）
                    breaks: false,       // 不将单 \n 转 <br>（标准 markdown 行为）
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

    libsReady.value = !!markedLib.value;
}

/**
 * DOMPurify sanitize 配置
 * 允许 target 属性（链接新窗口打开）+ class（hljs 需要）+ onclick（复制按钮）
 */
const PURIFY_CONFIG = {
    ADD_ATTR: ['target', 'class', 'onclick', 'data-lang'],
    ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'strong', 'em', 'del', 's', 'u', 'mark',
        'a', 'img',
        'ul', 'ol', 'li', 'input',          // input 用于 GFM 任务列表 checkbox
        'blockquote',
        'pre', 'code', 'span',                // span 用于 hljs token
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'div', 'details', 'summary',
        'button',                             // 复制按钮
    ],
};

/**
 * 渲染 Agent 回答内容为 HTML
 * @param {string} rawContent - 原始 LLM 回复文本
 * @returns {string} 安全的 HTML 字符串
 */
function renderAnswerHtml(rawContent) {
    const { answer } = parseThinkAndAnswer(rawContent);
    const trimmed = String(answer || '').trim();

    if (!trimmed) return '<p style="color:#999">（正在组织回答...）</p>';

    let html = '';

    if (looksLikeHtml(trimmed)) {
        // 原始 HTML 直接透传
        html = trimmed;
    } else if (markedLib.value && typeof markedLib.value.parse === 'function') {
        try {
            html = markedLib.value.parse(trimmed);
        } catch (_e) {
            html = `<div>${escapeHtml(trimmed).replace(/\n/g, '<br/>')}</div>`;
        }
    } else {
        // marked 未加载的 fallback
        html = `<div>${escapeHtml(trimmed).replace(/\n/g, '<br/>')}</div>`;
    }

    // XSS 防护
    if (dompurifyLib.value && typeof dompurifyLib.value.sanitize === 'function') {
        try {
            return dompurifyLib.value.sanitize(html, PURIFY_CONFIG);
        } catch (_e) {
            return escapeHtml(trimmed).replace(/\n/g, '<br/>');
        }
    }

    return html;
}

/**
 * 渲染 Think 内容为 HTML（支持嵌套 markdown）
 * @param {string} rawContent - 原始 LLM 回复文本
 * @returns {string} 格式化后的 HTML
 */
function renderThinkHtml(rawContent) {
    const { think } = parseThinkAndAnswer(rawContent);
    if (!think) return '';

    // Think 内容也支持 markdown 渲染（模型可能在思考中使用列表/代码块）
    if (markedLib.value && typeof markedLib.value.parse === 'function') {
        try {
            const html = markedLib.value.parse(think);
            if (dompurifyLib.value && typeof dompurifyLib.value.sanitize === 'function') {
                return dompurifyLib.value.sanitize(html, PURIFY_CONFIG);
            }
            return html;
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
function hasThinkContent(rawContent) {
    return !!parseThinkAndAnswer(rawContent).think;
}

/**
 * 注入全局复制函数（只需执行一次）
 * marked 的 onclick 属性需要一个全局可访问的函数
 */
let copyFnInjected = false;
function injectGlobalCopyFn() {
    if (copyFnInjected || typeof window === 'undefined') return;
    copyFnInjected = true;

    window.__copyCode = async (btn) => {
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
    };
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
