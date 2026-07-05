import { h, reactive, render, readonly } from 'vue';
import Message from '../components/Shell/Message.vue';
import { GOLDEN_SOUP_QUOTES } from '../data/goldenSoupQuotes';

const MAX_VISIBLE = 3;
//默认持续时间，单位毫秒
const DEFAULT_DURATION_MS = 3000;
const DEFAULT_SOUP_DURATION_MS = 5200;
const FALLBACK_SOUP = Object.freeze({
    cn: '今天先不和世界较劲，先和自己和解。',
    en: 'Do not wrestle with the world today; make peace with yourself first.',
});

// ===== 方案 A：防抖合并 =====
const DEDUP_WINDOW_MS = 1000;
/** key="type|text" → { msgId, count, timer } */
const dedupCache = new Map();

function getDedupKey(type, text) {
    return `${type}|${String(text || '')}`;
}

/** 在所有消息中查找（先 visible 再 queue） */
function findMessageById(id) {
    let idx = state.messages.findIndex((m) => m.id === id);
    if (idx >= 0) return { msg: state.messages[idx], location: 'messages', idx };
    idx = state.queue.findIndex((m) => m.id === id);
    if (idx >= 0) return { msg: state.queue[idx], location: 'queue', idx };
    return null;
}

// ===== 方案 C：智能 draining =====
const QUEUE_DRAIN_THRESHOLD = 3;
const FAST_DURATION_MS = 800;
// 额外触发条件：短时间内大量消息涌入
const RATE_WINDOW_MS = 2000;
const RATE_THRESHOLD = 5;
const messageTimestamps = [];

function isHighRate() {
    const now = Date.now();
    // 只保留窗口内的记录
    while (messageTimestamps.length > 0 && messageTimestamps[0] < now - RATE_WINDOW_MS) {
        messageTimestamps.shift();
    }
    return messageTimestamps.length >= RATE_THRESHOLD;
}
function markMessageTimestamp() {
    messageTimestamps.push(Date.now());
}

function shouldUseFastDuration() {
    return isHighRate() || state.queue.length >= QUEUE_DRAIN_THRESHOLD;
}

const state = reactive({
    messages: [],
    queue: [],
});

let seed = 1;
let hostMounted = false;
let hostEl = null;
let soupPool = [];
let lastSoupIndex = -1;

function nextId() {
    seed += 1;
    return `msg_${Date.now()}_${seed}`;
}

function getDefaultDuration(type, inputDuration) {
    if (Number.isFinite(inputDuration) && inputDuration >= 0) return inputDuration;
    if (type === 'soup') return DEFAULT_SOUP_DURATION_MS;
    return DEFAULT_DURATION_MS;
}

function refillSoupPool() {
    const total = GOLDEN_SOUP_QUOTES.length;
    soupPool = Array.from({ length: total }, (_, index) => index);

    for (let i = soupPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [soupPool[i], soupPool[j]] = [soupPool[j], soupPool[i]];
    }

    // 轮询一圈后重洗牌时，尽量避免与上一句重复。
    if (soupPool.length > 1 && soupPool[soupPool.length - 1] === lastSoupIndex) {
        const swapIndex = Math.floor(Math.random() * (soupPool.length - 1));
        [soupPool[swapIndex], soupPool[soupPool.length - 1]] = [
            soupPool[soupPool.length - 1],
            soupPool[swapIndex],
        ];
    }
}

function pickSoupQuote() {
    if (GOLDEN_SOUP_QUOTES.length === 0) return FALLBACK_SOUP;
    if (soupPool.length === 0) refillSoupPool();

    const index = soupPool.pop();
    if (!Number.isInteger(index)) return FALLBACK_SOUP;

    lastSoupIndex = index;
    return GOLDEN_SOUP_QUOTES[index] || FALLBACK_SOUP;
}

function formatSoupQuote(quote) {
    const cn = String(quote?.cn || '').trim();
    const en = String(quote?.en || '').trim();

    if (cn && en) return `${cn}\n${en}`;
    if (cn) return cn;
    if (en) return en;
    return `${FALLBACK_SOUP.cn}\n${FALLBACK_SOUP.en}`;
}

function flushQueue() {
    while (state.messages.length < MAX_VISIBLE && state.queue.length > 0) {
        const next = state.queue.shift();
        // 方案 C：队列积压或短时大量涌入 → 加速清空
        if (shouldUseFastDuration()) {
            next.duration = Math.min(
                Number.isFinite(next.duration) ? next.duration : DEFAULT_DURATION_MS,
                FAST_DURATION_MS,
            );
        }
        state.messages.push(next);
    }
}

/** 清理 dedupCache 中指定 msgId 的条目 */
function cleanDedupCache(id) {
    for (const [key, entry] of dedupCache.entries()) {
        if (entry.msgId === id) {
            clearTimeout(entry.timer);
            dedupCache.delete(key);
            return;
        }
    }
}

function createMessage(type, text, options = {}) {
    const normalizedText = String(text || '');
    const dedupKey = getDedupKey(type, normalizedText);

    // 标记消息速率（在防抖合并之前，因为被合并的消息也应计入速率）
    markMessageTimestamp();

    // 方案 A：防抖合并 — 1 秒内同 type+text 的消息合并计数
    const existing = dedupCache.get(dedupKey);
    if (existing) {
        // 延长合并窗口
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => {
            dedupCache.delete(dedupKey);
        }, DEDUP_WINDOW_MS);

        // 找到并更新已存在的消息
        const found = findMessageById(existing.msgId);
        if (found) {
            existing.count++;
            found.msg._dedupCount = existing.count;
            found.msg.text = `${normalizedText}（共${existing.count}条）`;
            // 刷新 duration：使 auto-close timer 按新的 duration 走
            found.msg.duration = getDefaultDuration(type, options.duration);
        }

        return existing.msgId;
    }

    const payload = {
        id: nextId(),
        type,
        text: normalizedText,
        duration: getDefaultDuration(type, options.duration),
        closable: options.closable ?? true,
        showTitle: options.showTitle ?? true,
        onClose: options.onClose,
    };

    // 方案 C：短时大量涌入或队列积压 → 快速闪过
    if (shouldUseFastDuration()) {
        payload.duration = Math.min(payload.duration, FAST_DURATION_MS);
    }

    if (state.messages.length >= MAX_VISIBLE) {
        state.queue.push(payload);
    } else {
        state.messages.push(payload);
    }

    // 注册防抖缓存
    dedupCache.set(dedupKey, {
        msgId: payload.id,
        count: 1,
        timer: setTimeout(() => {
            dedupCache.delete(dedupKey);
        }, DEDUP_WINDOW_MS),
    });

    return payload.id;
}

function remove(id) {
    const found = findMessageById(id);
    if (!found) return;

    const msg = found.msg;
    if (typeof msg.onClose === 'function') {
        msg.onClose();
    }

    // 从 dedupCache 清理
    cleanDedupCache(id);

    if (found.location === 'messages') {
        state.messages.splice(found.idx, 1);
        flushQueue();
    } else {
        state.queue.splice(found.idx, 1);
    }
}

function clearAll() {
    // 清理所有 dedup 定时器
    for (const entry of dedupCache.values()) {
        clearTimeout(entry.timer);
    }
    dedupCache.clear();

    state.messages = [];
    state.queue = [];
}

function ensureMessageHost(position = 'top-right') {
    if (hostMounted && hostEl) {
        render(
            h(Message, {
                messages: state.messages,
                position,
                onClose: remove,
            }),
            hostEl,
        );
        return;
    }

    hostEl = document.createElement('div');
    hostEl.id = 'global-message-host';
    document.body.appendChild(hostEl);
    render(
        h(Message, {
            messages: state.messages,
            position,
            onClose: remove,
        }),
        hostEl,
    );
    hostMounted = true;
}

function notifyBatch({ success = 0, failed = 0, warnings = 0, label = '导入任务' } = {}) {
    const summary = `${label}：成功 ${success}，失败 ${failed}${warnings ? `，警告 ${warnings}` : ''}`;
    if (failed > 0) {
        return createMessage('warning', summary, { closable: true, duration: 6000 });
    }
    return createMessage('success', summary);
}

function soup(options = {}) {
    const quote = pickSoupQuote();
    const text = formatSoupQuote(quote);

    return createMessage('soup', text, {
        ...options,
        showTitle: false,
    });
}

export function useMessage() {
    return {
        state: readonly(state),
        ensureMessageHost,
        remove,
        clearAll,
        notifyBatch,
        soup,
        success: (text, options) => createMessage('success', text, options),
        error: (text, options) => createMessage('error', text, options),
        warning: (text, options) => createMessage('warning', text, options),
        info: (text, options) => createMessage('info', text, options),
    };
}
