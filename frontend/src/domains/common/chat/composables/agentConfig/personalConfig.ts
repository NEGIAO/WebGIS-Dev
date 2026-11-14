/**
 * 个人配置与模型列表（加载 / 保存 / 清除 / 恢复默认）
 *
 * 从 useChatAgentConfig 拆出：个人 Key 的读写与后端同步、可用模型列表拉取、
 * 模型偏好持久化、恢复平台默认参数。
 */

import {
    apiAgentGetChatConfig,
    apiAgentGetUserConfig,
    apiAgentListModels,
    apiAgentSaveModelPreference,
    apiAgentUpdateUserConfig,
} from '@/api/backend';
import {
    USER_PREFERENCE_AGENT_MODEL_KEY,
    readCachedPreferredAgentModel,
    useUserPreferencesStore,
} from '@common/user/stores/useUserPreferencesStore';
import { defaultDraft, emptyDirectConfig, readSavedModel, saveModel } from './configState';

export interface PersonalConfigMethodDeps {
    message: any;
}

/**
 * 创建个人配置与模型列表相关方法
 * @param config 共享的 reactive 配置对象
 * @param deps 依赖注入（见 PersonalConfigMethodDeps）
 */
export function createPersonalConfigMethods(
    config: any,
    { message }: PersonalConfigMethodDeps,
) {
    return {
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
            } catch (error: unknown) {
                if (showToast) message.error(`加载个人配置失败：${(error as { message?: string })?.message || String(error)}`);
            }
        },

        /** 加载可用模型列表（区分个人 Key/代理模式） */
        async loadAvailableModels() {
            config.isLoadingModels = true;
            config.modelLoadHint = '正在加载模型列表...';

            try {
                let models: any[] = [];

                if (config.isDefaultAIMode) {
                    const response = await apiAgentListModels({ use_default_ai: true });
                    const data = response?.data || response || {};
                    models = Array.isArray(data?.models) ? data.models : [];
                    config.modelLoadHint = models.length
                        ? `✅ 已加载 ${models.length} 个模型（默认 AI 模式）`
                        : '未从默认 AI 上游返回可用模型，请检查管理员配置的 Base URL / API Key。';

                    // 恢复该模式下用户已保存的模型选择（仅当它在上游列表内，避免跨模式误用），
                    // 并同步到草稿回显——defaultAIModel 是该模式的实际请求模型源，面板必须如实显示
                    if (!config.defaultAIModel) {
                        const saved = readSavedModel(true, false);
                        if (saved && models.some((m: any) => m.id === saved)) {
                            config.defaultAIModel = saved;
                        }
                    }
                    if (config.defaultAIModel) {
                        config.userConfigDraft.model = config.defaultAIModel;
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
                    const overrideOptions: Record<string, any> = {};
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

                config.configuredModels = models.filter((m: any) => m?.source !== 'upstream');
                config.upstreamModels = models.filter((m: any) => m?.source === 'upstream');

                // 草稿无模型时按 账号偏好 → 后端配置 → localStorage 上次选择 → 首个可聊模型 补齐。
                // 仅后端代理模式执行：direct 模式（默认 AI/个人 Key）的请求模型源各有所属
                // （defaultAIModel / directConfig.model），草稿仅用于回显；若在此用"首个模型"
                // 兜底并写入 localStorage，下次打开面板会被当作"已保存选择"恢复为实际请求模型——
                // 即"仅点开设置、未点保存，模型就被悄悄改成列表第一项"的根因。
                if (!config.isDirectMode && !String(config.userConfigDraft.model || '').trim()) {
                    // 账号偏好模型（用户中心-偏好设置）
                    const prefModel = readCachedPreferredAgentModel();
                    if (prefModel && models.some((m: any) => m.id === prefModel)) {
                        config.userConfigDraft.model = prefModel;
                        saveModel(prefModel, false, false);
                        config.isLoadingModels = false;
                        return;
                    }

                    const currentModel = String(
                        (await apiAgentGetChatConfig().catch(() => ({})))?.data?.model || '',
                    ).trim();

                    if (currentModel) {
                        config.userConfigDraft.model = currentModel;
                    } else {
                        const saved = readSavedModel(false, false);
                        if (saved && models.some((m: any) => m.id === saved)) {
                            config.userConfigDraft.model = saved;
                        } else if (models.length > 0) {
                            const chatModels = models.filter((m: any) => m?.chat_compatible !== false);
                            if (chatModels.length > 0) {
                                config.userConfigDraft.model = String(chatModels[0]?.id || '');
                                if (config.userConfigDraft.model) {
                                    apiAgentSaveModelPreference(config.userConfigDraft.model).catch(() => {});
                                }
                            }
                        }
                        if (config.userConfigDraft.model) {
                            saveModel(config.userConfigDraft.model, false, false);
                        }
                    }
                }
            } catch (error: unknown) {
                config.modelLoadHint = `❌ 加载模型列表失败: ${(error as { message?: string })?.message || String(error)}`;
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

                const backendPayload: any = {
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
                    // 与默认 AI 模式同口径：个人 Key 模式的模型选择持久化到按模式隔离的
                    // localStorage。此前漏写导致 reloadAgentConfig 永远走"无已保存选择"
                    // 兜底链，配合旧优先级把保存后的模型覆盖成列表第一项。
                    if (backendPayload.model) {
                        saveModel(backendPayload.model, false, true);
                    }
                } else {
                    // 未填 Key：仅修改模型/参数，仍保持当前路由模式（后端代理），不算个人 Key
                    config.isPersonalMode = false;
                    config.directConfig = emptyDirectConfig();
                }

                try {
                    await apiAgentUpdateUserConfig(backendPayload);
                } catch (backendError: unknown) {
                    console.warn('[ChatConfig] 后端配置保存失败（直连模式不受影响）:', (backendError as { message?: string })?.message || String(backendError));
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
            } catch (error: unknown) {
                message.error(`保存配置失败：${(error as { message?: string })?.message || String(error)}`);
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
            } catch (error: unknown) {
                message.error(`清除失败：${(error as { message?: string })?.message || String(error)}`);
            } finally {
                config.userConfigSaving = false;
            }
        },

        /** 恢复平台默认参数 */
        async resetProviderOverrides() {
            config.userConfigSaving = true;
            try {
                // 默认 AI 模式：仅清除用户在该模式保存的模型选择，回到管理员配置的模型。
                // 必须提前返回：下方 fall-through 会清空 directConfig——而它在默认 AI 模式下
                // 存的是管理员的 base_url/model，清掉会破坏该通道；后端个人配置亦不可写。
                if (config.isDefaultAIMode) {
                    config.defaultAIModel = '';
                    saveModel('', true, false);
                    config.syncDraftFromDirectConfig();
                    await config.reloadAgentConfig(false);
                    await config.loadAvailableModels();
                    message.success('已恢复管理员配置的默认模型');
                    return;
                }

                config.isPersonalMode = false;
                config.directConfig = emptyDirectConfig();

                // 后端代理模式：模型有三处「用户上次选择」的来源，全部清空后重载，
                // 否则 loadAvailableModels/reloadAgentConfig 会把它们兜底回来，重置形同未做：
                //   1) localStorage 上次选择（proxy key）
                //   2) 账号偏好模型 preferred_agent_model（后端 + 本机运行时缓存）
                saveModel('', false, false);
                try {
                    await useUserPreferencesStore().savePreferences({ preferred_agent_model: '' });
                } catch {
                    // 接口失败也必须清本机缓存，避免 readCachedPreferredAgentModel 复活旧模型
                    try {
                        localStorage.removeItem(USER_PREFERENCE_AGENT_MODEL_KEY);
                    } catch {
                        /* noop */
                    }
                }

                try {
                    await apiAgentUpdateUserConfig({ reset_provider_overrides: true });
                } catch {
                    // ignore
                }

                await config.loadUserConfig(false);
                await config.reloadAgentConfig(false);
                await config.loadAvailableModels();
                message.success('已恢复平台默认参数');
            } catch (error: unknown) {
                message.error(`恢复失败：${(error as { message?: string })?.message || String(error)}`);
            } finally {
                config.userConfigSaving = false;
            }
        },
    };
}
