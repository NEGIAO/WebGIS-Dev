import { computed, ref } from 'vue';
import { coreMessages } from '../locales/core.js';

const LANGUAGE_STORAGE_KEY = 'webgis_pref_language';

// 主语言 chunk 加载失败时的中性回退语言（与 getMessage 链保持一致）
const FALLBACK_LANG = 'en-US';

// 新增语言：在此注册 loader 即可，无需改其它逻辑
const LOCALE_LOADERS = {
    'en-US': () => import('../locales/en-US.js'),
    'zh-CN': () => import('../locales/zh-CN.js'),
};

/**
 * 深拷贝 core 语言节点，避免 deepMerge 污染模块级 coreMessages。
 * @param {object|null|undefined} value
 * @returns {object}
 */
function cloneLocaleNode(value) {
    if (!value || typeof value !== 'object') return {};
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            // fall through
        }
    }
    return JSON.parse(JSON.stringify(value));
}

// messages 初始仅含 core（common/auth 等首屏键）；完整包异步 merge 后触发响应式
const messages = ref({
    'zh-CN': cloneLocaleNode(coreMessages['zh-CN']),
    'en-US': cloneLocaleNode(coreMessages['en-US']),
});

const currentLanguage = ref(readInitialLanguage());

/** @type {Set<string>} 已成功加载完整 chunk 的语言 */
const loadedLocales = new Set();

/** 进行中的加载 Promise（按语言去重） */
const inflightLoads = new Map();

/** 最新一次请求的语言；异步完成时若不一致则丢弃结果 */
let loadingLang = null;

function readInitialLanguage() {
    try {
        return normalizeLocaleLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
    } catch {
        return 'zh-CN';
    }
}

/**
 * 归一化语言代码，仅支持 zh-CN / en-US。
 * @param {unknown} value
 * @returns {'zh-CN'|'en-US'}
 */
export function normalizeLocaleLanguage(value) {
    const compact = String(value || '')
        .trim()
        .toLowerCase()
        .replace('_', '-');
    return compact === 'en-us' ? 'en-US' : 'zh-CN';
}

/**
 * 设置当前界面语言，持久化到 localStorage，并自动触发对应完整语言包加载。
 * @param {unknown} value
 * @returns {'zh-CN'|'en-US'}
 */
export function setLocaleLanguage(value) {
    const next = normalizeLocaleLanguage(value);
    const changed = next !== currentLanguage.value;
    currentLanguage.value = next;
    if (typeof document !== 'undefined') {
        document.documentElement.lang = next;
    }
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
        // 同步完整偏好缓存中的 language，避免 bootstrap 读到旧的 zh-CN 整包缓存
        const fullKey = 'webgis_user_preferences_cache';
        const raw = localStorage.getItem(fullKey);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    parsed.language = next;
                    localStorage.setItem(fullKey, JSON.stringify(parsed));
                }
            } catch {
                /* ignore corrupt cache */
            }
        }
    } catch {
        /* private mode / quota — runtime language still applied */
    }
    // 语言变化或当前语言尚未加载时自动拉 chunk（调用方无需再 loadLocaleMessages）
    if (changed || !loadedLocales.has(next)) {
        void loadLocaleMessages(changed);
    }
    return next;
}

/**
 * 深度合并 source → target（就地修改 target）。
 * 仅递归纯对象；数组与其它值直接覆盖。
 * @param {object} target
 * @param {object} source
 * @returns {object}
 */
function deepMerge(target, source) {
    if (!target || typeof target !== 'object' || !source || typeof source !== 'object') {
        return target;
    }
    for (const key of Object.keys(source)) {
        const srcVal = source[key];
        const tgtVal = target[key];
        if (
            srcVal &&
            typeof srcVal === 'object' &&
            !Array.isArray(srcVal) &&
            tgtVal &&
            typeof tgtVal === 'object' &&
            !Array.isArray(tgtVal)
        ) {
            deepMerge(tgtVal, srcVal);
        } else {
            target[key] = srcVal;
        }
    }
    return target;
}

/**
 * 确保 messages 上存在指定语言槽位（基于 core 深拷贝）。
 * @param {string} lang
 */
function ensureLanguageSlot(lang) {
    if (!messages.value[lang]) {
        messages.value[lang] = cloneLocaleNode(coreMessages[lang] || coreMessages[FALLBACK_LANG] || {});
    }
}

/**
 * 懒加载当前（或指定）语言的完整消息表并 merge 进 reactive messages。
 * 按语言去重；force=true 时即使已加载也重新 import merge。
 * 同语言 inflight 始终 join，避免 force 并发双 task 竞态。
 * @param {boolean} [force=false]
 * @returns {Promise<void>}
 */
export async function loadLocaleMessages(force = false) {
    const lang = currentLanguage.value;

    // 同语言进行中：一律 join。force 时等当前完成后再起一次真正的重载。
    if (inflightLoads.has(lang)) {
        const pending = inflightLoads.get(lang);
        if (!force) return pending;
        await pending;
        // 若 await 期间语言已切走，不再 force 重载旧语言
        if (currentLanguage.value !== lang) return;
    }

    if (!force && loadedLocales.has(lang)) return;

    loadingLang = lang;
    ensureLanguageSlot(lang);

    const task = (async () => {
        try {
            const loader = LOCALE_LOADERS[lang] ?? LOCALE_LOADERS[FALLBACK_LANG];
            if (!loader) return;

            const mod = await loader();
            if (loadingLang !== lang) return;

            const fullMessages = mod.default || mod;
            deepMerge(messages.value[lang], fullMessages);
            // 触发顶层依赖 messages 的响应（deepMerge 就地改嵌套时更稳妥）
            messages.value = { ...messages.value };
            loadedLocales.add(lang);
        } catch (error) {
            console.warn(`[useLocale] Failed to load locale "${lang}":`, error);
            // 失败时把 fallback 文案写入**当前语言槽**，getMessage 仍能命中
            if (lang !== FALLBACK_LANG && LOCALE_LOADERS[FALLBACK_LANG]) {
                try {
                    const mod = await LOCALE_LOADERS[FALLBACK_LANG]();
                    if (loadingLang !== lang) return;
                    ensureLanguageSlot(lang);
                    deepMerge(messages.value[lang], mod.default || mod);
                    messages.value = { ...messages.value };
                } catch {
                    /* 仅剩 core messages */
                }
            }
        } finally {
            if (inflightLoads.get(lang) === task) {
                inflightLoads.delete(lang);
            }
        }
    })();

    inflightLoads.set(lang, task);
    return task;
}

/**
 * 按 path 取文案；顺序：当前语言 → FALLBACK_LANG → zh-CN → 原始 path。
 * @param {string} path
 * @returns {unknown}
 */
function getMessage(path) {
    const keys = String(path || '')
        .split('.')
        .filter(Boolean);
    const pick = (lang) =>
        keys.reduce(
            (node, key) => (node && typeof node === 'object' ? node[key] : undefined),
            messages.value[lang],
        );
    // 用 !== undefined：空字符串 '' 是合法文案，不能当缺失
    const current = pick(currentLanguage.value);
    if (current !== undefined) return current;
    if (currentLanguage.value !== FALLBACK_LANG) {
        const fallback = pick(FALLBACK_LANG);
        if (fallback !== undefined) return fallback;
    }
    if (currentLanguage.value !== 'zh-CN' && FALLBACK_LANG !== 'zh-CN') {
        const zh = pick('zh-CN');
        if (zh !== undefined) return zh;
    }
    return path;
}

/**
 * 简单 `{name}` 插值。
 * @param {unknown} template
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
function interpolate(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) => {
        return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`;
    });
}

/**
 * 翻译入口。
 * @param {string} path
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function translate(path, params) {
    return interpolate(getMessage(path), params);
}

/**
 * Vue 组合式 API 封装。
 * @returns {{ language: import('vue').ComputedRef<string>, setLanguage: typeof setLocaleLanguage, t: typeof translate, loadLocaleMessages: typeof loadLocaleMessages }}
 */
export function useLocale() {
    return {
        language: computed(() => currentLanguage.value),
        setLanguage: setLocaleLanguage,
        t: translate,
        loadLocaleMessages,
    };
}
