/**
 * Agent 配置的初始状态与默认值工具
 *
 * 从 useChatAgentConfig 拆出：一份 reactive 状态（含 4 个 computed）与
 * 「草稿/直连配置/额度/模型存储键」这些纯函数。方法由 routing / personalConfig /
 * llmCall 三个模块分别装配到同一对象上。
 */

import { computed, reactive } from 'vue';

/** localStorage 键名模板：按路由模式隔离（避免跨模式模型误用）。
 * direct 模式（默认 AI/个人 Key）使用 :v2 后缀——旧 key 曾被"选中即生效"与
 * "首个模型"兜底在未点击保存的情况下写入，换 key 使这批脏数据一次性失效，
 * 让所有用户回到管理员配置的模型，直至用户主动保存新的选择。 */
const MODEL_STORAGE_KEY_DEFAULT_AI = 'chat:selectedModel:defaultAI:v2';
const MODEL_STORAGE_KEY_PERSONAL = 'chat:selectedModel:personal:v2';
const MODEL_STORAGE_KEY_PROXY = 'chat:selectedModel:proxy';

/** 根据当前路由模式返回对应的 localStorage key */
export function getModelStorageKey(isDefaultAIMode: boolean, isPersonalMode: boolean) {
    if (isDefaultAIMode) return MODEL_STORAGE_KEY_DEFAULT_AI;
    if (isPersonalMode) return MODEL_STORAGE_KEY_PERSONAL;
    return MODEL_STORAGE_KEY_PROXY;
}

/** 个人配置草稿的默认值 */
export function defaultDraft() {
    return {
        api_key: '',
        base_url: '',
        model: '',
        system_prompt: '',
        timeout_seconds: 45,
        max_tokens: 32768,
        temperature: 1,
        top_p: 0.95,
        extra_body: {},
    };
}

/** 直连配置的空值（退出个人 Key 模式时重置用） */
export function emptyDirectConfig(preservedModel = '') {
    return {
        api_key: '',
        base_url: '',
        model: preservedModel,
        system_prompt: '',
        timeout_seconds: 45,
        max_tokens: 32768,
        temperature: 1,
    };
}

/** 读取持久化的模型名（按路由模式隔离） */
export function readSavedModel(isDefaultAIMode: boolean, isPersonalMode: boolean) {
    try {
        return localStorage.getItem(getModelStorageKey(isDefaultAIMode, isPersonalMode)) || '';
    } catch {
        return '';
    }
}

/** 持久化模型名（按路由模式隔离） */
export function saveModel(model: string, isDefaultAIMode: boolean, isPersonalMode: boolean) {
    try {
        localStorage.setItem(getModelStorageKey(isDefaultAIMode, isPersonalMode), model || '');
    } catch {
        /* noop */
    }
}

/** 归一化后端返回的额度对象 */
export function normalizeQuota(raw: any) {
    const limit =
        raw?.limit === null || typeof raw?.limit === 'undefined' ? null : Number(raw.limit);
    const used = Number(raw?.used || 0);
    const remaining =
        raw?.remaining === null || typeof raw?.remaining === 'undefined'
            ? null
            : Number(raw.remaining);

    return {
        limit: limit !== null && Number.isFinite(limit) ? limit : null,
        used: Number.isFinite(used) ? Math.max(0, used) : 0,
        remaining: remaining !== null && Number.isFinite(remaining) ? Math.max(0, remaining) : null,
        usage_date: String(raw?.usage_date || ''),
        quota_subject: String(raw?.quota_subject || ''),
    };
}
/**
 * 创建 Agent 配置的响应式状态（仅状态与计算属性，不含方法）
 * @returns reactive 状态对象
 */
export function createConfigState(): any {
    const config: any = reactive({
        // ── 状态 ──
        userConfigDraft: defaultDraft(),
        directConfig: emptyDirectConfig(),
        isDefaultAIMode: false,
        /** 默认 AI 模式的实际请求模型（用户保存过的选择），空值表示跟随管理员配置 */
        defaultAIModel: '',
        serviceReady: false,
        modelName: '',
        statusHint: '正在初始化...',
        quota: normalizeQuota({}),
        lastCallCost: 0,
        userConfigSaving: false,
        isLoadingModels: false,
        modelLoadHint: '',
        configuredModels: [],
        upstreamModels: [],

        // ── 计算属性（reactive 内自动解包） ──
        /**
         * 是否用户主动配置的个人 Key 模式：
         * 仅当用户填写/保存了个人 api_key + base_url 时才算，管理员默认 AI 不算。
         * isDirectMode（内部通道判定）仍包含默认 AI 模式，但展示层必须用 isPersonalMode
         * 来区分「用户个人 Key」与「管理员路由模式」。
         */
        isPersonalMode: false,
        isDirectMode: computed(() => {
            return config.isDefaultAIMode || config.isPersonalMode;
        }),
        quotaText: computed(() => {
            // 默认 AI 模式使用免费 LLM，不扣用户额度
            if (config.isDefaultAIMode) return '免费（不扣额度）';
            const { limit, used, remaining } = config.quota;
            if (limit === null) return '管理员无限制';
            return `${used}/${limit}（剩余 ${remaining ?? 0}）`;
        }),
        quotaExhausted: computed(() => {
            // 默认 AI 模式使用免费 LLM，不扣用户额度、不受限制；
            // 个人 Key 直连（用户自己的 Key）不消耗平台配额，永不耗尽；
            // 仅后端代理模式使用收费 LLM，按 token 扣用户自身额度，须按配额判定
            if (config.isDefaultAIMode) return false;
            if (config.isDirectMode) return false;
            return Number.isFinite(config.quota.remaining) && Number(config.quota.remaining) <= 0;
        }),
        /** Model 下拉选项：draft.model 不在列表中时追加"当前"兜底项 */
        selectModels: computed(() => {
            const list = [...config.configuredModels, ...config.upstreamModels];
            const current = String(config.userConfigDraft.model || '').trim();
            if (current && !list.some((m) => m.id === current)) {
                list.unshift({ id: current, name: current, _isFallback: true });
            }
            return list;
        }),
    });

    return config;
}
