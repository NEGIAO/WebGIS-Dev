/**
 * useChatSession - 对话会话状态管理（多会话 + 本地持久化 + 上下文精简）
 *
 * V3.4.5x 升级为多会话（对标网页版会话列表）：
 *   1. 会话列表：新建/切换/重命名/删除，上限 MAX_SESSIONS，自动按首条用户消息命名
 *   2. 持久化 chat:sessions:v2（300ms 防抖）；旧单会话 chat:history:v1 自动迁移为一个会话
 *   3. `messages` 始终指向活动会话的消息数组（同一引用），容器/组件既有 API 零破坏
 *   4. 经济上下文构建、自动修剪、欢迎语维护、重新生成准备（均作用于活动会话）
 *
 * 用法: const session = createChatSession(); 需在 setup 上下文中调用（内部使用 watch）。
 */

import { ref, watch, onScopeDispose } from 'vue';

/** localStorage 键名：多会话存储（v2） */
const SESSIONS_STORAGE_KEY = 'chat:sessions:v2';
/** 旧版单会话键（v1，读到即迁移并移除） */
const LEGACY_HISTORY_KEY = 'chat:history:v1';

/** 会话数量上限（超出时删除最久未更新的非活动会话） */
const MAX_SESSIONS = 10;
/** 单会话持久化消息条数上限 */
const MAX_PERSISTED_MESSAGES = 200;
/** 新会话默认标题（用于判断是否需要自动命名） */
const DEFAULT_SESSION_TITLE = '新对话';
/** 自动命名截取长度 */
const AUTO_TITLE_LEN = 16;

/** 上下文构建参数 */
const MAX_CONTEXT_MESSAGES = 6;
const MAX_CHARS_PER_MESSAGE = 600;
const AUTO_PRUNE_AFTER_TURNS = 12;

/** 生成会话 id */
function newSessionId() {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 校验并归一化单条消息 */
function sanitizeMessages(list) {
    if (!Array.isArray(list)) return [];
    return list
        .filter((m) => m && typeof m === 'object' && typeof m.content !== 'undefined')
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-MAX_PERSISTED_MESSAGES);
}

/** 从 localStorage 还原会话列表（含 v1 → v2 迁移） */
function restoreSessions() {
    try {
        const rawV2 = localStorage.getItem(SESSIONS_STORAGE_KEY);
        if (rawV2) {
            const parsed = JSON.parse(rawV2);
            const sessions = Array.isArray(parsed?.sessions)
                ? parsed.sessions
                      .filter((s) => s && typeof s === 'object')
                      .map((s) => ({
                          id: String(s.id || newSessionId()),
                          title: String(s.title || DEFAULT_SESSION_TITLE).slice(0, 40),
                          updatedAt: Number(s.updatedAt) || Date.now(),
                          messages: sanitizeMessages(s.messages),
                      }))
                      .slice(0, MAX_SESSIONS)
                : [];
            return { sessions, activeId: String(parsed?.activeId || '') };
        }

        // v1 迁移：旧单会话包装为一个会话
        const rawV1 = localStorage.getItem(LEGACY_HISTORY_KEY);
        if (rawV1) {
            const legacy = sanitizeMessages(JSON.parse(rawV1));
            localStorage.removeItem(LEGACY_HISTORY_KEY);
            if (legacy.length > 0) {
                const firstUser = legacy.find((m) => m.role === 'user');
                const title = firstUser
                    ? String(firstUser.content || '').trim().slice(0, AUTO_TITLE_LEN) || '历史对话'
                    : '历史对话';
                const migrated = {
                    id: newSessionId(),
                    title,
                    updatedAt: Date.now(),
                    messages: legacy,
                };
                return { sessions: [migrated], activeId: migrated.id };
            }
        }
    } catch {
        /* 解析失败按空处理 */
    }
    return { sessions: [], activeId: '' };
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
 * 工厂：创建多会话状态对象
 * @returns {Object} { messages, sessions, activeSessionId, ...方法 }
 */
export function createChatSession() {
    /** 会话列表（含各自 messages） */
    const sessions = ref([]);
    /** 活动会话 id */
    const activeSessionId = ref('');
    /** 活动会话的消息数组（与 session.messages 保持同一引用） */
    const messages = ref([]);

    function findSession(id) {
        return sessions.value.find((s) => s.id === id) || null;
    }

    function activeSession() {
        return findSession(activeSessionId.value);
    }

    /** 持久化（防抖 300ms；打字机逐字更新期间避免高频序列化） */
    function persist() {
        try {
            const snapshot = {
                activeId: activeSessionId.value,
                sessions: sessions.value.map((s) => ({
                    id: s.id,
                    title: s.title,
                    updatedAt: s.updatedAt,
                    messages: s.messages.slice(-MAX_PERSISTED_MESSAGES),
                })),
            };
            localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(snapshot));
        } catch {
            /* 存储满/隐私模式等场景静默忽略 */
        }
    }

    let persistTimer = null;
    function schedulePersist() {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            persistTimer = null;
            persist();
        }, 300);
    }
    watch([sessions, activeSessionId], schedulePersist, { deep: true });

    // 组件作用域销毁时清理持久化定时器
    onScopeDispose(() => {
        if (persistTimer) {
            clearTimeout(persistTimer);
            persistTimer = null;
        }
    });

    /** 为消息补充时间戳 */
    function withTime(msg) {
        return { time: Date.now(), ...msg };
    }

    /** 触碰活动会话更新时间 */
    function touchActive() {
        const current = activeSession();
        if (current) current.updatedAt = Date.now();
    }

    /** 会话数量超限时删除最久未更新的非活动会话 */
    function evictIfNeeded() {
        while (sessions.value.length > MAX_SESSIONS) {
            const candidates = sessions.value
                .filter((s) => s.id !== activeSessionId.value)
                .sort((a, b) => a.updatedAt - b.updatedAt);
            if (!candidates.length) break;
            const victim = candidates[0];
            sessions.value = sessions.value.filter((s) => s.id !== victim.id);
        }
    }

    /**
     * 新建会话并激活
     * @param {Function} buildWelcome - 欢迎语构建器
     * @returns {string} 新会话 id
     */
    function createSession(buildWelcome) {
        const created = {
            id: newSessionId(),
            title: DEFAULT_SESSION_TITLE,
            updatedAt: Date.now(),
            messages: [withTime(buildWelcome())],
        };
        sessions.value.unshift(created);
        evictIfNeeded();
        activeSessionId.value = created.id;
        messages.value = created.messages;
        return created.id;
    }

    /**
     * 切换到指定会话
     * @param {string} id
     * @returns {boolean} 是否切换成功
     */
    function switchSession(id) {
        const target = findSession(id);
        if (!target || id === activeSessionId.value) return false;
        activeSessionId.value = target.id;
        messages.value = target.messages;
        return true;
    }

    /**
     * 重命名会话
     * @param {string} id
     * @param {string} title
     */
    function renameSession(id, title) {
        const target = findSession(id);
        const normalized = String(title || '').trim().slice(0, 40);
        if (!target || !normalized) return;
        target.title = normalized;
        target.updatedAt = Date.now();
    }

    /**
     * 删除会话；删除活动会话时切换到最近会话（无剩余则新建）
     * @param {string} id
     * @param {Function} buildWelcome
     */
    function deleteSession(id, buildWelcome) {
        const exists = findSession(id);
        if (!exists) return;
        sessions.value = sessions.value.filter((s) => s.id !== id);

        if (id === activeSessionId.value) {
            const next = [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            if (next) {
                activeSessionId.value = next.id;
                messages.value = next.messages;
            } else {
                createSession(buildWelcome);
            }
        }
    }

    /** 初始化：还原多会话（含 v1 迁移）；无历史时新建会话 */
    function initFromStorage(buildWelcome) {
        const { sessions: restored, activeId } = restoreSessions();
        sessions.value = restored;

        if (restored.length > 0) {
            const target = findSession(activeId) || restored[0];
            activeSessionId.value = target.id;
            messages.value = target.messages;
            if (target.messages.length === 0) {
                target.messages.push(withTime(buildWelcome()));
            }
        } else {
            createSession(buildWelcome);
        }
    }

    /** 追加用户消息（默认标题时按首条用户消息自动命名） */
    function pushUser(content) {
        messages.value.push(withTime({ role: 'user', content }));
        const current = activeSession();
        if (current && current.title === DEFAULT_SESSION_TITLE) {
            const auto = String(content || '').trim().slice(0, AUTO_TITLE_LEN);
            if (auto) current.title = auto;
        }
        touchActive();
    }

    /** 追加 assistant 消息，返回其索引 */
    function pushAssistant(content = '', extra = {}) {
        const index = messages.value.push(withTime({ role: 'assistant', content, ...extra })) - 1;
        touchActive();
        return index;
    }

    /** 清空当前会话（重置为欢迎语，标题还原默认） */
    function clearAll(buildWelcome) {
        const current = activeSession();
        if (!current) return;
        current.messages.splice(0, current.messages.length, withTime(buildWelcome()));
        current.title = DEFAULT_SESSION_TITLE;
        current.updatedAt = Date.now();
        // messages 与 current.messages 为同一引用，无需重新指向
    }

    /** 欢迎语跟随服务状态更新（仅当首条仍是模板欢迎语时替换） */
    function updateWelcomeIfNeeded(buildWelcome) {
        if (messages.value.length === 0) {
            messages.value.push(withTime(buildWelcome()));
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
            messages.value.splice(0, 1, withTime(buildWelcome()));
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

        messages.value.splice(0, messages.value.length, welcome, ...recentDialogue);
        return true;
    }

    /**
     * 导出当前会话为 Markdown 文本（剔除 think 块，工具调用以引用块记录）
     * @returns {string}
     */
    function exportAsMarkdown() {
        const title = activeSession()?.title || 'AI 助手对话';
        const lines = [`# WebGIS AI 助手对话记录 — ${title}`, ''];
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
        messages.value.splice(lastUserIdx + 1);
        return content;
    }

    return {
        messages,
        sessions,
        activeSessionId,
        initFromStorage,
        createSession,
        switchSession,
        renameSession,
        deleteSession,
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
