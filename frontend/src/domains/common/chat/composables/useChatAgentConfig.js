/**
 * useChatAgentConfig - Agent 对话配置与路由模式管理
 *
 * 职责（从 ChatPanelContent.vue 拆出）：
 *   1. 三种路由模式：默认 AI（管理员 Key）/ 个人 Key（经后端代理）/ 后端代理
 *   2. 个人配置草稿的加载/保存/清除/恢复默认
 *   3. 模型列表加载与模型偏好持久化（localStorage + 后端）
 *   4. 服务状态与今日额度
 *
 * 用法: const config = createChatAgentConfig({ message, onModeChanged });
 *       返回 reactive 对象，模板可直接读写 config.xxx。
 */

import { computed, reactive } from 'vue';
import {
    apiAgentChatProxy,
    apiAgentChatDefaultProxy,
    apiAgentChatCompletions,
    apiAgentGetChatConfig,
    apiAgentGetUserConfig,
    apiAgentUpdateUserConfig,
    apiAgentListModels,
    apiAgentSaveModelPreference,
    apiGetDefaultAIConfig,
} from '@/api/backend';
import { readCachedPreferredAgentModel } from '@common/user/stores/useUserPreferencesStore';

/** localStorage 键名模板：按路由模式隔离（避免跨模式模型误用） */
const MODEL_STORAGE_KEY_DEFAULT_AI = 'chat:selectedModel:defaultAI';
const MODEL_STORAGE_KEY_PERSONAL = 'chat:selectedModel:personal';
const MODEL_STORAGE_KEY_PROXY = 'chat:selectedModel:proxy';

/** 根据当前路由模式返回对应的 localStorage key */
function getModelStorageKey(isDefaultAIMode, isPersonalMode) {
    if (isDefaultAIMode) return MODEL_STORAGE_KEY_DEFAULT_AI;
    if (isPersonalMode) return MODEL_STORAGE_KEY_PERSONAL;
    return MODEL_STORAGE_KEY_PROXY;
}

/** 个人配置草稿的默认值 */
function defaultDraft() {
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
function emptyDirectConfig(preservedModel = '') {
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
function readSavedModel(isDefaultAIMode, isPersonalMode) {
    try {
        return localStorage.getItem(getModelStorageKey(isDefaultAIMode, isPersonalMode)) || '';
    } catch {
        return '';
    }
}

/** 持久化模型名（按路由模式隔离） */
function saveModel(model, isDefaultAIMode, isPersonalMode) {
    try {
        localStorage.setItem(getModelStorageKey(isDefaultAIMode, isPersonalMode), model || '');
    } catch {
        /* noop */
    }
}

/** 归一化后端返回的额度对象 */
function normalizeQuota(raw) {
    const limit =
        raw?.limit === null || typeof raw?.limit === 'undefined' ? null : Number(raw.limit);
    const used = Number(raw?.used || 0);
    const remaining =
        raw?.remaining === null || typeof raw?.remaining === 'undefined'
            ? null
            : Number(raw.remaining);

    return {
        limit: Number.isFinite(limit) ? limit : null,
        used: Number.isFinite(used) ? Math.max(0, used) : 0,
        remaining: Number.isFinite(remaining) ? Math.max(0, remaining) : null,
        usage_date: String(raw?.usage_date || ''),
        quota_subject: String(raw?.quota_subject || ''),
    };
}

/**
 * 工厂：创建 Agent 配置管理对象
 * @param {Object} deps
 * @param {Object} deps.message - useMessage 实例（toast 提示）
 * @param {Function} [deps.onModeChanged] - 路由模式切换后的回调（容器用于刷新欢迎语）
 * @returns {Object} reactive 配置对象（含状态 + 方法）
 */
export function createChatAgentConfig({ message, onModeChanged = () => {} }) {
    const config = reactive({
        // ── 状态 ──
        userConfigDraft: defaultDraft(),
        directConfig: emptyDirectConfig(),
        isDefaultAIMode: false,
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

        // ── 方法 ──
        applyQuota(raw) {
            config.quota = normalizeQuota(raw || {});
        },

        saveModelPreference(model) {
            saveModel(model, config.isDefaultAIMode, config.isPersonalMode);
        },

        /** 从直连配置同步草稿（个人 Key/默认 AI 模式下打开配置面板时） */
        syncDraftFromDirectConfig() {
            if (!config.isDirectMode) return;
            const dc = config.directConfig;
            config.userConfigDraft = {
                api_key: dc.api_key,
                base_url: dc.base_url,
                // 默认 AI 模式下草稿模型展示用户在该模式的选择（defaultAIModel），
                // 避免面板重开后显示回管理员默认值、与真实请求模型不一致
                model: config.isDefaultAIMode && config.defaultAIModel ? config.defaultAIModel : dc.model,
                system_prompt: dc.system_prompt,
                timeout_seconds: dc.timeout_seconds,
                max_tokens: dc.max_tokens,
                temperature: dc.temperature,
                top_p: dc.top_p,
                extra_body: dc.extra_body,
            };
        },

        /** 加载管理员配置的默认 AI（成功则切入默认 AI 模式） */
        async loadDefaultAIConfig() {
            try {
                const result = await apiGetDefaultAIConfig();
                const data = result?.data || result || {};
                if (data.is_configured && data.base_url && data.model) {
                    config.isDefaultAIMode = true;
                    config.directConfig = {
                        ...emptyDirectConfig(),
                        base_url: String(data.base_url || ''),
                        model: String(data.model || ''),
                    };
                    config.modelName = data.model;
                    config.serviceReady = true;
                    config.statusHint = `默认 AI 模式：使用管理员配置的 ${data.model}（经后端代理转发，Key 安全存储在后端）。`;
                } else {
                    config.isDefaultAIMode = false;
                }
            } catch {
                config.isDefaultAIMode = false;
            }
        },

        /** 切换路由模式：默认 AI/个人 Key ←→ 后端代理 */
        async toggleRoutingMode() {
            if (config.isDirectMode) {
                const preservedModel = config.directConfig.model;
                config.isDefaultAIMode = false;
                config.isPersonalMode = false;
                config.directConfig = emptyDirectConfig(preservedModel);
                message.success('已切换为后端代理模式');
            } else {
                await config.loadDefaultAIConfig();
                if (config.isDefaultAIMode) {
                    message.success('已切换为默认 AI 模式（使用管理员配置的专属 Key，经后端代理转发）');
                } else {
                    message.warning('管理员尚未配置默认 AI 专属参数，请在个人配置中填写 API Key');
                }
            }
            config.syncDraftFromDirectConfig();
            onModeChanged();
            await config.reloadAgentConfig(false);
            await config.loadUserConfig(false);
            await config.loadAvailableModels();
        },

        /** 刷新服务状态（三种模式分别处理模型/额度/提示语） */
        async reloadAgentConfig(showToast = false) {
            try {
                if (config.isDefaultAIMode) {
                    config.serviceReady = true;
                    // 实际请求模型 = 用户在默认 AI 模式下的选择（defaultAIModel）优先于管理员默认值
                    config.modelName =
                        config.defaultAIModel ||
                        config.directConfig.model ||
                        config.modelName ||
                        '未配置';
                    // 默认 AI 模式使用免费 LLM，不扣用户额度、不受限制
                    config.statusHint = `默认 AI 模式：使用管理员配置的 ${config.modelName}（免费，不扣除您的对话额度）。`;
                } else if (config.isPersonalMode) {
                    config.serviceReady = true;
                    config.statusHint = '个人 Key 模式：使用个人 API Key 经后端代理转发到 LLM 服务，避免浏览器 CORS 限制。';

                    try {
                        const dc = config.directConfig;
                        const modelsResult = await apiAgentListModels({
                            override_base_url: dc.base_url,
                            override_api_key: dc.api_key,
                        });
                        const modelsData = modelsResult?.data || modelsResult || {};
                        const models = Array.isArray(modelsData?.models) ? modelsData.models : [];

                        if (models.length > 0) {
                            const chatModels = models.filter((m) => m?.chat_compatible !== false);
                            const pool = chatModels.length > 0 ? chatModels : models;
                            // 个人 Key 模式使用用户自己的 API Key，与账号偏好（后端代理模式）无关，
                            // 只使用按模式隔离的 localStorage，避免跨模式污染
                            const savedModel = readSavedModel(false, true);
                            const preferredModel =
                                (savedModel && pool.some((m) => m.id === savedModel) && savedModel) ||
                                '';
                            const selectedModel = preferredModel || String(pool[0]?.id || dc.model || '');
                            if (selectedModel) {
                                config.directConfig.model = selectedModel;
                                config.modelName = selectedModel;
                            } else {
                                config.modelName = dc.model || '未配置';
                            }
                            config.statusHint = `个人 Key 模式：已选择模型 ${config.modelName}（共 ${pool.length} 个可用），经后端代理转发。`;
                        } else {
                            config.modelName = dc.model || '未配置';
                            config.statusHint = '个人 Key 模式：未获取到可用模型列表，使用配置中的默认模型。';
                        }
                    } catch (modelError) {
                        config.modelName = config.directConfig.model || '未配置';
                        config.statusHint = `个人 Key 模式：模型列表获取失败（${modelError.message}），使用默认模型。`;
                    }

                    try {
                        const result = await apiAgentGetChatConfig();
                        const data = result?.data || result || {};
                        config.applyQuota(data?.quota);
                    } catch {
                        // ignore
                    }
                } else {
                    const result = await apiAgentGetChatConfig();
                    const data = result?.data || result || {};

                    config.serviceReady = !!data?.service_ready;
                    config.modelName = String(data?.model || '');
                    config.applyQuota(data?.quota);

                    // 后端代理模式：管理员配置的模型优先；后端未配置时回退 账号偏好模型 → localStorage 上次选择
                    if (!config.modelName) {
                        const fallbackModel = readCachedPreferredAgentModel() || readSavedModel(false, false);
                        if (fallbackModel) {
                            config.modelName = fallbackModel;
                            config.userConfigDraft.model = fallbackModel;
                        }
                    }

                    if (config.serviceReady) {
                        config.statusHint = config.quotaExhausted
                            ? '今日对话额度已达上限，请明日再试。'
                            : '后端 Agent 已连接，前端不会暴露任何对话密钥。';
                    } else {
                        config.statusHint = '后端 Agent 未完成配置。请在 ⚙️ 配置中填写个人 API Key 启用直连模式。';
                    }
                }

                if (showToast) message.success('已刷新 AI 服务状态');
            } catch (error) {
                if (!config.isDirectMode) config.serviceReady = false;
                config.statusHint = `状态获取失败：${error.message}`;
                if (showToast) message.error(`刷新失败：${error.message}`);
            }
        },

        /** 加载个人配置到草稿 */
        async loadUserConfig(showToast = false) {
            try {
                const result = await apiAgentGetUserConfig();
                const data = result?.data || result || {};
                const personal = data?.personal || {};
                const effective = data?.effective || {};

                if (config.isDirectMode) {
                    config.syncDraftFromDirectConfig();
                } else {
                    config.userConfigDraft = {
                        api_key: '',
                        base_url: String(personal?.base_url || effective?.base_url || ''),
                        model: String(personal?.model || effective?.model || ''),
                        system_prompt: String(personal?.system_prompt || ''),
                        timeout_seconds: Number(personal?.timeout_seconds ?? effective?.timeout_seconds ?? 45),
                        max_tokens: Number(personal?.max_tokens ?? effective?.max_tokens ?? 32768),
                        temperature: Number(personal?.temperature ?? effective?.temperature ?? 1),
                        top_p: Number(personal?.top_p ?? effective?.top_p ?? 0.95),
                        extra_body:
                            personal?.extra_body ??
                            effective?.extra_body ??
                            defaultDraft().extra_body,
                    };
                }

                if (showToast) message.success('已加载你的 Agent 配置');
            } catch (error) {
                if (showToast) message.error(`加载个人配置失败：${error.message}`);
            }
        },

        /** 加载可用模型列表（区分个人 Key/代理模式） */
        async loadAvailableModels() {
            config.isLoadingModels = true;
            config.modelLoadHint = '正在加载模型列表...';

            try {
                let models = [];

                if (config.isDefaultAIMode) {
                    const response = await apiAgentListModels({ use_default_ai: true });
                    const data = response?.data || response || {};
                    models = Array.isArray(data?.models) ? data.models : [];
                    config.modelLoadHint = models.length
                        ? `✅ 已加载 ${models.length} 个模型（默认 AI 模式）`
                        : '未从默认 AI 上游返回可用模型，请检查管理员配置的 Base URL / API Key。';

                    // 恢复该模式下用户上次选择的模型（仅当它在上游列表内，避免跨模式误用）
                    if (!config.defaultAIModel) {
                        const saved = readSavedModel(true, false);
                        if (saved && models.some((m) => m.id === saved)) {
                            config.defaultAIModel = saved;
                        }
                    }
                } else if (config.isPersonalMode) {
                    const dc = config.directConfig;
                    const response = await apiAgentListModels({
                        override_base_url: dc.base_url,
                        override_api_key: dc.api_key,
                    });
                    const data = response?.data || response || {};
                    models = Array.isArray(data?.models) ? data.models : [];
                    config.modelLoadHint = models.length
                        ? `✅ 已加载 ${models.length} 个模型（个人 Key 模式）`
                        : '未从上游返回可用模型，请检查 Base URL / API Key 是否正确。';
                } else {
                    const overrideOptions = {};
                    const draftBaseUrl = String(config.userConfigDraft.base_url || '').trim();
                    const draftApiKey = String(config.userConfigDraft.api_key || '').trim();
                    // base_url 与 api_key 必须成对透传：只传 base_url 会让后端把平台 Key 发往该地址，
                    // 后端已 fail-closed 返回 400（见 utils._validate_override_base_url），此处同口径避免无谓报错。
                    if (draftBaseUrl && draftApiKey) {
                        overrideOptions.override_base_url = draftBaseUrl;
                        overrideOptions.override_api_key = draftApiKey;
                    } else if (draftApiKey) {
                        overrideOptions.override_api_key = draftApiKey;
                    }

                    const response = await apiAgentListModels(overrideOptions);
                    const data = response?.data || response || {};
                    models = Array.isArray(data?.models) ? data.models : [];

                    if (!models.length) {
                        config.modelLoadHint = '未从上游返回可用模型，请检查 Base URL / API Key。';
                        if (data?.fallback_reason) {
                            config.modelLoadHint += `（${data.fallback_reason}）`;
                        }
                    } else {
                        config.modelLoadHint = `✅ 已加载 ${models.length} 个模型`;
                    }
                }

                config.configuredModels = models.filter((m) => m?.source !== 'upstream');
                config.upstreamModels = models.filter((m) => m?.source === 'upstream');

                // 草稿无模型时按 后端配置 → localStorage 上次选择 → 首个可聊模型 的顺序补齐。
                // 账号偏好模型（preferred_agent_model）仅在后端代理模式使用：
                // 默认 AI / 个人 Key 模式使用各自按模式隔离的 localStorage，避免跨模式污染。
                if (!String(config.userConfigDraft.model || '').trim()) {
                    // 账号偏好模型（用户中心-偏好设置）：仅后端代理模式（非 direct）下锁定优先
                    const prefModel = config.isDirectMode ? '' : readCachedPreferredAgentModel();
                    if (prefModel && models.some((m) => m.id === prefModel)) {
                        config.userConfigDraft.model = prefModel;
                        saveModel(prefModel, config.isDefaultAIMode, config.isPersonalMode);
                        config.isLoadingModels = false;
                        return;
                    }

                    const currentModel = config.isDirectMode
                        ? ''
                        : String(
                              (await apiAgentGetChatConfig().catch(() => ({})))?.data?.model || '',
                          ).trim();

                    if (currentModel) {
                        config.userConfigDraft.model = currentModel;
                    } else {
                        const saved = readSavedModel(config.isDefaultAIMode, config.isPersonalMode);
                        if (saved && models.some((m) => m.id === saved)) {
                            config.userConfigDraft.model = saved;
                        } else if (models.length > 0) {
                            const chatModels = models.filter((m) => m?.chat_compatible !== false);
                            if (chatModels.length > 0) {
                                config.userConfigDraft.model = String(chatModels[0]?.id || '');
                                if (config.userConfigDraft.model && !config.isDirectMode) {
                                    apiAgentSaveModelPreference(config.userConfigDraft.model).catch(() => {});
                                }
                            }
                        }
                        if (config.userConfigDraft.model) {
                            saveModel(config.userConfigDraft.model, config.isDefaultAIMode, config.isPersonalMode);
                        }
                    }
                }
            } catch (error) {
                config.modelLoadHint = `❌ 加载模型列表失败: ${error.message}`;
                config.configuredModels = [];
                config.upstreamModels = [];

                const fallbackModel = String(config.userConfigDraft.model || config.modelName || '').trim();
                if (fallbackModel) {
                    config.configuredModels = [
                        { id: fallbackModel, name: `当前模型：${fallbackModel}`, source: 'configured' },
                    ];
                }
            } finally {
                config.isLoadingModels = false;
            }
        },

        /** 保存个人配置（填 Key 则切入个人 Key 模式，同时同步后端） */
        async saveUserConfig() {
            config.userConfigSaving = true;
            try {
                const personalApiKey = String(config.userConfigDraft.api_key || '').trim();
                const draftBaseUrl = String(config.userConfigDraft.base_url || '').trim();

                // 默认 AI 模式（管理员 Key）：面板改动只属于该模式——
                // 模型选择持久化为 defaultAIModel（会话态）+ localStorage（按模式隔离）；
                // 禁止写入后端个人配置（agent_user_config 是「后端代理模式」的配置源，
                // 写入即造成"管理员模式选的模型变成后端代理模型"的跨模式污染）。
                // 同时不写入全局账号偏好（preferred_agent_model），避免污染后端代理模式的模型选择。
                if (config.isDefaultAIMode && !personalApiKey) {
                    config.defaultAIModel = String(config.userConfigDraft.model || '').trim();
                    if (config.defaultAIModel) {
                        saveModel(config.defaultAIModel, config.isDefaultAIMode, config.isPersonalMode);
                    }
                    config.userConfigDraft.api_key = '';
                    await config.reloadAgentConfig(false);
                    await config.loadAvailableModels();
                    message.success('已保存默认 AI 模式的模型选择（不影响后端代理配置）');
                    return;
                }

                const backendPayload = {
                    model: String(config.userConfigDraft.model || '').trim(),
                    system_prompt: String(config.userConfigDraft.system_prompt || '').trim(),
                    timeout_seconds: Number(config.userConfigDraft.timeout_seconds || 45),
                    max_tokens: Number(config.userConfigDraft.max_tokens || 32768),
                    temperature: Number(config.userConfigDraft.temperature ?? 1),
                    top_p: Number(config.userConfigDraft.top_p ?? 0.95),
                    extra_body: config.userConfigDraft.extra_body,
                };

                if (personalApiKey) {
                    // 个人 Key 必须同步提交给后端；否则后端校验 base_url 时会认为“只有 URL 没有 Key”，
                    // 从而触发 override_base_url/override_api_key 成对校验失败。
                    backendPayload.api_key = personalApiKey;
                    backendPayload.base_url = draftBaseUrl;
                    config.isDefaultAIMode = false;
                    config.isPersonalMode = true;
                    config.directConfig = { api_key: personalApiKey, ...backendPayload };
                } else {
                    // 未填 Key：仅修改模型/参数，仍保持当前路由模式（后端代理），不算个人 Key
                    config.isPersonalMode = false;
                    config.directConfig = emptyDirectConfig();
                }

                try {
                    await apiAgentUpdateUserConfig(backendPayload);
                } catch (backendError) {
                    console.warn('[ChatConfig] 后端配置保存失败（直连模式不受影响）:', backendError.message);
                }

                // 仅后端代理模式（非个人 Key）将模型写入全局账号偏好；
                // 个人 Key 模式使用用户自己的 API Key，模型选择只保存在按模式隔离的 localStorage。
                if (backendPayload.model && !personalApiKey) {
                    try {
                        await apiAgentSaveModelPreference(backendPayload.model);
                    } catch {
                        // ignore
                    }
                }

                config.userConfigDraft.api_key = '';
                await config.reloadAgentConfig(false);
                await config.loadAvailableModels();

                if (personalApiKey) {
                    message.success('已启用个人 Key 模式（API Key 仅保存在当前会话，刷新后需重新输入）');
                } else {
                    message.success('配置已保存到后端（后端代理模式）');
                }
            } catch (error) {
                message.error(`保存配置失败：${error.message}`);
            } finally {
                config.userConfigSaving = false;
            }
        },

        /** 清除个人 Key，回到后端代理模式 */
        async clearPersonalKey() {
            config.userConfigSaving = true;
            try {
                config.isDefaultAIMode = false;
                config.isPersonalMode = false;
                config.directConfig = emptyDirectConfig();
                config.userConfigDraft.api_key = '';

                try {
                    await apiAgentUpdateUserConfig({ clear_personal_key: true, api_key: '' });
                } catch {
                    // ignore
                }

                await config.reloadAgentConfig(false);
                await config.loadAvailableModels();
                message.success('已清除个人 API Key，切换为后端代理模式');
            } catch (error) {
                message.error(`清除失败：${error.message}`);
            } finally {
                config.userConfigSaving = false;
            }
        },

        /** 恢复平台默认参数 */
        async resetProviderOverrides() {
            config.userConfigSaving = true;
            try {
                config.isPersonalMode = false;
                config.directConfig = emptyDirectConfig();

                try {
                    await apiAgentUpdateUserConfig({ reset_provider_overrides: true });
                } catch {
                    // ignore
                }

                await config.loadUserConfig(false);
                await config.reloadAgentConfig(false);
                await config.loadAvailableModels();
                message.success('已恢复平台默认参数');
            } catch (error) {
                message.error(`恢复失败：${error.message}`);
            } finally {
                config.userConfigSaving = false;
            }
        },

        /**
         * 调用 LLM API（按当前路由模式选择通道）
         * @param {{ message: string, history: Array, locationContext: string, mapContext?: Object, systemPrompt: string, tools: Array }} payload
         * @returns {Promise<{ reply: string, usedModel: string, rawData: Object, quota: Object|null, cost: number }>}
         */
        async callLLM({ message: userMsg, history, locationContext, mapContext, systemPrompt, tools }) {
            let reply = '';
            let usedModel = '';
            let rawData = {};
            let quotaData = null;
            let callCost = 0;

            const enhancedHistory = systemPrompt
                ? [
                      {
                          role: 'user',
                          content: `[系统指令] 以下是你可以使用的工具说明，请严格按照此格式调用工具：\n\n${systemPrompt}`,
                      },
                      ...history,
                  ]
                : history;

            if (config.isDefaultAIMode) {
                const dc = config.directConfig;
                // 实际请求模型 = 用户在该模式下的选择（defaultAIModel）优先于管理员默认值；
                // 若只取 dc.model，面板里选的模型不保存（或保存后）都对请求无效——跨链路脱节回归。
                const finalModel = config.defaultAIModel || dc.model;
                const result = await apiAgentChatDefaultProxy({
                    message: userMsg,
                    history: enhancedHistory,
                    location_context: locationContext,
                    map_context: mapContext,
                    override_model: finalModel || undefined,
                    override_top_p: dc.top_p,
                    override_extra_body: dc.extra_body,
                    tools,
                    tool_choice: 'auto',
                });
                rawData = result?.data || result || {};
                reply = String(rawData?.reply || '').trim();
                usedModel = String(rawData?.model || finalModel || '');
                if (rawData?.quota) quotaData = rawData.quota;
                if (typeof rawData?.cost === 'number') callCost = rawData.cost;
            } else if (config.isPersonalMode) {
                const dc = config.directConfig;
                const mergedSystemPrompt = systemPrompt
                    ? dc.system_prompt
                        ? `${systemPrompt}\n\n---\n\n${dc.system_prompt}`
                        : systemPrompt
                    : dc.system_prompt || undefined;

                const result = await apiAgentChatProxy({
                    message: userMsg,
                    history: enhancedHistory,
                    location_context: locationContext,
                    map_context: mapContext,
                    api_key: dc.api_key,
                    base_url: dc.base_url,
                    model: dc.model,
                    system_prompt: mergedSystemPrompt,
                    timeout_seconds: dc.timeout_seconds,
                    max_tokens: dc.max_tokens,
                    temperature: dc.temperature,
                    top_p: dc.top_p,
                    extra_body: dc.extra_body,
                    tools,
                    tool_choice: 'auto',
                });
                rawData = result?.data || result || {};
                reply = String(rawData?.reply || '').trim();
                usedModel = String(rawData?.model || dc.model || '');
            } else {
                const chatPayload = {
                    message: userMsg,
                    history: enhancedHistory,
                    location_context: locationContext,
                    map_context: mapContext,
                    tools,
                    tool_choice: 'auto',
                };

                const d = config.userConfigDraft;
                const draftBaseUrl = String(d.base_url || '').trim();
                const draftApiKey = String(d.api_key || '').trim();
                const draftModel = String(d.model || '').trim();

                // 同 loadAvailableModels：base_url 与 api_key 成对才透传（防平台 Key 被发往草稿地址）
                if (draftBaseUrl && draftApiKey) {
                    chatPayload.override_base_url = draftBaseUrl;
                    chatPayload.override_api_key = draftApiKey;
                } else if (draftApiKey) {
                    chatPayload.override_api_key = draftApiKey;
                }
                if (draftModel) chatPayload.override_model = draftModel;
                if (typeof d.timeout_seconds === 'number' && d.timeout_seconds > 0)
                    chatPayload.override_timeout_seconds = d.timeout_seconds;
                if (typeof d.max_tokens === 'number' && d.max_tokens > 0)
                    chatPayload.override_max_tokens = d.max_tokens;
                if (typeof d.temperature === 'number') chatPayload.override_temperature = d.temperature;
                if (typeof d.top_p === 'number') chatPayload.override_top_p = d.top_p;
                if (d.extra_body !== undefined && d.extra_body !== null)
                    chatPayload.override_extra_body = d.extra_body;

                const result = await apiAgentChatCompletions(chatPayload);
                rawData = result?.data || result || {};
                reply = String(rawData?.reply || '').trim();
                usedModel = String(rawData?.model || '');
                if (rawData?.quota) quotaData = rawData.quota;
                if (typeof rawData?.cost === 'number') callCost = rawData.cost;
            }

            return { reply, usedModel, rawData, quota: quotaData, cost: callCost };
        },
    });

    return config;
}