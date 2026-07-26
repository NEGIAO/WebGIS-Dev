/**
 * useChatSession - 对话会话状态管理（消息列表 + 本地持久化 + 上下文精简）
 *
 * 职责（从 ChatPanelContent.vue 拆出并增强）：
 *   1. 消息列表状态（含时间戳、工具状态卡）
 *   2. 会话本地持久化（localStorage，刷新/切页不丢历史）★ 新增
 *   3. 经济上下文构建（截断 + 压缩，控制 token 开销）
 *   4. 历史自动精简与欢迎语维护
 *
 * 用法: const session = createChatSession(); 需在 setup 上下文中调用（内部使用 watch）。
 */

import { ref, watch } from 'vue';

/** localStorage 键名：会话历史 */
const HISTORY_STORAGE_KEY = 'chat:history:v1';
/** 本地持久化的消息条数上限 */
const MAX_PERSISTED_MESSAGES = 200;

/** 上下文构建参数 */
const MAX_CONTEXT_MESSAGES = 6;
const MAX_CHARS_PER_MESSAGE = 600;
const AUTO_PRUNE_AFTER_TURNS = 12;

/** 校验并还原持久化的消息数组 */
function restoreMessages() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((m) => m && typeof m === 'object' && typeof m.content !== 'undefined')
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-MAX_PERSISTED_MESSAGES);
    } catch {
        return [];
    }
}

/** 压缩单条消息文本（去多余空白 + 截断） */
function compactText(text, maxChars = MAX_CHARS_PER_MESSAGE) {
    const normalized = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars)}...`;
}

/**
 * 工厂：创建会话状态对象
 * @returns {Object} { messages, ...方法 }
 */
export function createChatSession() {
    const messages = ref([]);

    /** 持久化当前消息（截去超限的最早消息；序列化失败静默忽略） */
    function persist() {
        try {
            const snapshot = messages.value.slice(-MAX_PERSISTED_MESSAGES);
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(snapshot));
        } catch {
            /* 存储满/隐私模式等场景静默忽略 */
        }
    }

    // 消息变化自动持久化（防抖 300ms：打字机逐字更新期间避免高频序列化）
    let persistTimer = null;
    function schedulePersist() {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            persistTimer = null;
            persist();
        }, 300);
    }
    watch(messages, schedulePersist, { deep: true });

    /** 尝试从本地恢复历史；无历史时用 buildWelcome 初始化 */
    function initFromStorage(buildWelcome) {
        const restored = restoreMessages();
        if (restored.length > 0) {
            messages.value = restored;
        } else {
            messages.value = [withTime(buildWelcome())];
        }
    }

    /** 为消息补充时间戳 */
    function withTime(msg) {
        return { time: Date.now(), ...msg };
    }

    /** 追加用户消息 */
    function pushUser(content) {
        messages.value.push(withTime({ role: 'user', content }));
    }

    /** 追加 assistant 消息，返回其索引 */
    function pushAssistant(content = '', extra = {}) {
        return messages.value.push(withTime({ role: 'assistant', content, ...extra })) - 1;
    }

    /** 清空历史（含本地存储），重置为欢迎语 */
    function clearAll(buildWelcome) {
        messages.value = [withTime(buildWelcome())];
        try {
            localStorage.removeItem(HISTORY_STORAGE_KEY);
        } catch {
            /* noop */
        }
    }

    /** 欢迎语跟随服务状态更新（仅当首条仍是模板欢迎语时替换） */
    function updateWelcomeIfNeeded(buildWelcome) {
        if (!Array.isArray(messages.value) || messages.value.length === 0) {
            messages.value = [withTime(buildWelcome())];
            return;
        }
        const first = messages.value[0];
        if (first?.role !== 'assistant') return;

        const text = String(first?.content || '');
        const shouldReplace =
            text.includes('AI 服务暂未就绪') ||
            text.includes('由后端代理的 AI 助手') ||
            text.includes('个人 Key 模式') ||
            text.includes('默认 AI 模式') ||
            text.includes('初始化中');

        if (shouldReplace) {
            messages.value[0] = withTime(buildWelcome());
        }
    }

    /** 构建发送给 LLM 的经济上下文（跳过欢迎语，截断压缩） */
    function buildEconomyContext() {
        return messages.value
            .filter((_, idx) => idx !== 0)
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .filter((m) => !m.isToolStatus)
            .filter((m) => m.content && m.content.trim())
            .map((m) => ({ role: m.role, content: compactText(m.content) }))
            .slice(-MAX_CONTEXT_MESSAGES);
    }

    /** 用户轮次计数 */
    function userTurnsCount() {
        return messages.value.filter((m) => m.role === 'user').length;
    }

    /** 超过阈值时自动精简历史（保留欢迎语 + 最近一轮） */
    function pruneHistoryIfNeeded(buildWelcome) {
        if (userTurnsCount() < AUTO_PRUNE_AFTER_TURNS) return false;

        const welcome =
            messages.value[0]?.role === 'assistant' ? messages.value[0] : withTime(buildWelcome());

        const recentDialogue = messages.value
            .filter((_, idx) => idx !== 0)
            .filter(
                (m) => (m.role === 'user' || m.role === 'assistant') && m.content && m.content.trim(),
            )
            .slice(-2);

        messages.value = [welcome, ...recentDialogue];
        return true;
    }

    /**
     * 导出会话为 Markdown 文本（剔除 think 块，工具调用以引用块记录）
     * @returns {string}
     */
    function exportAsMarkdown() {
        const lines = ['# WebGIS AI 助手对话记录', ''];
        messages.value.forEach((m) => {
            if (m.isToolStatus) {
                const items = (m.toolCalls || []).map((tc) => {
                    const mark = tc.status === 'success' ? '✅' : tc.status === 'error' ? '❌' : '⏳';
                    return `> - ${mark} ${tc.label}${tc.message ? `：${tc.message}` : ''}`;
                });
                lines.push('> 工具调用', ...items, '');
                return;
            }
            const content = String(m.content || '')
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .trim();
            if (!content) return;
            const who = m.role === 'user' ? '🙋 用户' : '🤖 AI 助手';
            const time = m.time ? ` · ${new Date(m.time).toLocaleString()}` : '';
            lines.push(`## ${who}${time}`, '', content, '');
        });
        return lines.join('\n');
    }

    /**
     * 重新生成准备：找到最后一条用户消息，丢弃其后的所有回复
     * @returns {string} 最后一条用户消息内容；无则返回空串
     */
    function prepareRegenerate() {
        const lastUserIdx = messages.value.map((m) => m.role).lastIndexOf('user');
        if (lastUserIdx < 0) return '';
        const content = String(messages.value[lastUserIdx].content || '');
        messages.value = messages.value.slice(0, lastUserIdx + 1);
        return content;
    }

    return {
        messages,
        initFromStorage,
        pushUser,
        pushAssistant,
        clearAll,
        updateWelcomeIfNeeded,
        buildEconomyContext,
        pruneHistoryIfNeeded,
        prepareRegenerate,
        userTurnsCount,
        exportAsMarkdown,
    };
}
