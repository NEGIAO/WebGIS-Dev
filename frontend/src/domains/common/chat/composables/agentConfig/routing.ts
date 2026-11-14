/**
 * 路由模式与服务状态（默认 AI / 个人 Key / 后端代理）
 *
 * 从 useChatAgentConfig 拆出：模式判定、切换、服务状态与额度刷新。
 * 方法挂在同一个 reactive 对象上，内部通过 config.xxx() 互调。
 */

import {
    apiAgentGetChatConfig,
    apiAgentListModels,
    apiGetDefaultAIConfig,
} from '@/api/backend';
import { readCachedPreferredAgentModel } from '@common/user/stores/useUserPreferencesStore';
import { emptyDirectConfig, normalizeQuota, readSavedModel } from './configState';

export interface RoutingMethodDeps {
    /** useMessage 实例（toast 提示） */
    message: any;
    /** 路由模式切换后的回调（容器用于刷新欢迎语） */
    onModeChanged?: () => void;
}

/**
 * 创建路由模式相关方法
 * @param config 共享的 reactive 配置对象
 * @param deps 依赖注入（见 RoutingMethodDeps）
 */
export function createRoutingMethods(
    config: any,
    { message, onModeChanged = () => {} }: RoutingMethodDeps,
) {
    return {
        applyQuota(raw: any) {
            config.quota = normalizeQuota(raw || {});
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
                            const chatModels = models.filter((m: any) => m?.chat_compatible !== false);
                            const pool = chatModels.length > 0 ? chatModels : models;
                            // 个人 Key 模式使用用户自己的 API Key，与账号偏好（后端代理模式）无关，
                            // 只使用按模式隔离的 localStorage，避免跨模式污染
                            const savedModel = readSavedModel(false, true);
                            const preferredModel =
                                (savedModel && pool.some((m: any) => m.id === savedModel) && savedModel) ||
                                '';
                            // 优先级：已保存选择 → dc.model（用户保存过的配置）→ 首个可聊模型兜底。
                            // 旧逻辑把 pool[0] 排在 dc.model 之前，只要 localStorage 为空，
                            // reload 就会用列表第一项覆盖用户已保存/刚选择的模型。
                            const selectedModel =
                                preferredModel || String(dc.model || '') || String(pool[0]?.id || '');
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
                    } catch (modelError: unknown) {
                        config.modelName = config.directConfig.model || '未配置';
                        config.statusHint = `个人 Key 模式：模型列表获取失败（${(modelError as { message?: string })?.message || String(modelError)}），使用默认模型。`;
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
            } catch (error: unknown) {
                if (!config.isDirectMode) config.serviceReady = false;
                const msg = (error as { message?: string })?.message || String(error);
                config.statusHint = `状态获取失败：${msg}`;
                if (showToast) message.error(`刷新失败：${msg}`);
            }
        },
    };
}
