<template>
    <div class="chat-container">
        <div class="chat-header">
            <span class="chat-title">
                <bot-icon
                    :size="18"
                    color="Green"
                    :stroke-width="2"
                />
                AI 助手
            </span>
            <div class="header-controls">
                <button
                    class="icon-btn"
                    title="我的 Agent 配置"
                    @click="toggleUserConfig"
                >
                    ⚙️
                </button>
                <button
                    class="icon-btn"
                    title="刷新状态"
                    @click="reloadAgentConfig(true)"
                >
                    🔄
                </button>
                <button
                    class="icon-btn"
                    title="清除历史"
                    @click="clearHistory"
                >
                    🧹
                </button>
                <button
                    class="icon-btn"
                    title="退出AI"
                    @click="emit('close-chat')"
                >
                    ✖️
                </button>
            </div>
        </div>

        <div
            v-if="showUserConfig"
            class="user-config-panel"
        >
            <div class="user-config-grid">
                <label class="user-config-item user-config-item-full">
                    <span>我的 Agent API Key</span>
                    <input
                        v-model="userConfigDraft.api_key"
                        type="password"
                        placeholder="sk-...（填写后启用个人 Key 模式，消息经后端代理转发到 LLM）"
                    />
                </label>
                <label class="user-config-item">
                    <span>Base URL</span>
                    <input
                        v-model="userConfigDraft.base_url"
                        placeholder="https://api.xxx.com/v1"
                    />
                </label>
                <label class="user-config-item">
                    <span>Model</span>
                    <div style="display: flex; gap: 6px; align-items: center">
                        <input
                            v-model="userConfigDraft.model"
                            list="model-suggestions"
                            class="model-input"
                            placeholder="输入或选择模型名称"
                        />
                        <datalist id="model-suggestions">
                            <option
                                v-for="m in allModels"
                                :key="m.id"
                                :value="m.id"
                            >{{ m.name || m.id }}</option>
                        </datalist>
                        <button
                            class="refresh-models-btn"
                            :disabled="isLoadingModels"
                            title="刷新模型列表"
                            @click="reloadAgentConfig(true)"
                        >
                            {{ isLoadingModels ? '⏳' : '🔄' }}
                        </button>
                    </div>
                    <small class="hint">{{ modelLoadHint }}</small>
                </label>
                <label class="user-config-item">
                    <span>Timeout (秒)</span>
                    <input
                        v-model.number="userConfigDraft.timeout_seconds"
                        type="number"
                        min="5"
                        max="180"
                    />
                </label>
                <label class="user-config-item">
                    <span>Max Tokens</span>
                    <input
                        v-model.number="userConfigDraft.max_tokens"
                        type="number"
                        min="1"
                        max="128000"
                    />
                </label>
                <label class="user-config-item">
                    <span>Temperature</span>
                    <input
                        v-model.number="userConfigDraft.temperature"
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                    />
                </label>
                <label class="user-config-item user-config-item-full">
                    <span>System Prompt</span>
                    <textarea
                        v-model="userConfigDraft.system_prompt"
                        rows="3"
                        placeholder="仅覆盖你自己的系统提示词（可选）"
                    ></textarea>
                </label>
            </div>

            <div class="user-config-actions">
                <button
                    :disabled="userConfigSaving"
                    @click="saveUserConfig"
                >
                    {{ userConfigSaving ? '保存中...' : '保存我的配置' }}
                </button>
                <button
                    :disabled="userConfigSaving"
                    class="secondary"
                    @click="clearPersonalKey"
                >
                    清除我的 Key
                </button>
                <button
                    :disabled="userConfigSaving"
                    class="secondary"
                    @click="resetProviderOverrides"
                >
                    恢复平台默认参数
                </button>
            </div>

            <small class="hint">
                💡 个人 Key 模式下消息经后端代理转发到 LLM 服务，避免浏览器 CORS 限制。API Key 仅保存在当前页面会话中。
            </small>
        </div>

        <div class="service-status">
            <div class="status-line">
                <span class="status-label">路由模式:</span>
                <button
                    :class="['mode-toggle-btn', isDefaultAIMode ? 'mode-default-ai' : isDirectMode ? 'mode-direct' : 'mode-proxy']"
                    title="点击切换路由模式"
                    @click="toggleRoutingMode"
                >
                    {{ isDefaultAIMode ? '🤖 默认 AI 模式' : isDirectMode ? '🔑 个人 Key 模式' : '🛡️ 后端代理' }}
                    <span class="mode-toggle-hint">（点击切换）</span>
                </button>
            </div>
            <div class="status-line">
                <span class="status-label">服务状态:</span>
                <span :class="['status-value', serviceReady ? 'status-ready' : 'status-unready']">
                    {{ serviceReady ? (isDefaultAIMode ? '默认 AI 已就绪（管理员配置）' : isDirectMode ? '个人 API 已配置（经后端代理）' : '已连接后端 Agent') : '未就绪（请配置 API Key 或联系管理员）' }}
                </span>
            </div>
            <div class="status-line">
                <span class="status-label">当前模型:</span>
                <span class="status-value">{{ modelName || '未配置' }}
                    <span v-if="isDefaultAIMode" class="model-source-tag default-ai">管理员配置</span>
                    <span v-else-if="directConfig.model && isDirectMode" class="model-source-tag">个人Key</span>
                    <span v-else-if="modelName" class="model-source-tag proxy">代理</span>
                </span>
            </div>
            <div
                v-if="!isDirectMode"
                class="status-line"
            >
                <span class="status-label">今日对话额度:</span>
                <span class="status-value">{{ quotaText }}</span>
            </div>
            <div
                v-if="isDefaultAIMode"
                class="status-line"
            >
                <span class="status-label">额度:</span>
                <span class="status-value status-default-ai">管理员配额（经后端代理）</span>
            </div>
            <div
                v-else-if="isDirectMode"
                class="status-line"
            >
                <span class="status-label">额度:</span>
                <span class="status-value status-direct">无限制（使用个人 Key）</span>
            </div>
            <small class="hint">{{ statusHint }}</small>
        </div>

        <div
            ref="chatBody"
            class="chat-body"
        >
            <div
                v-for="(msg, index) in messages"
                :key="index"
                :class="['message', msg.role]"
            >
                <!-- 工具调用状态卡片 -->
                <template v-if="msg.isToolStatus && msg.toolCalls">
                    <div class="tool-status-card">
                        <div
                            v-for="(tc, tcIdx) in msg.toolCalls"
                            :key="tcIdx"
                            class="tool-status-item"
                        >
                            <span v-if="tc.status === 'executing'" class="tool-status-icon">🔧</span>
                            <span v-else-if="tc.status === 'success'" class="tool-status-icon">✅</span>
                            <span v-else class="tool-status-icon">❌</span>
                            <span class="tool-status-label">{{ tc.label }}</span>
                            <span
                                v-if="tc.message"
                                class="tool-status-message"
                            >
                                {{ tc.message }}
                            </span>
                        </div>
                    </div>
                </template>
                <!-- 普通 Assistant 消息 -->
                <template v-else-if="msg.role === 'assistant'">
                    <div class="message-content">{{ getAnswerContent(msg.content) }}</div>
                    <details
                        v-if="hasThinkContent(msg.content)"
                        class="think-panel"
                    >
                        <summary>展开思考过程</summary>
                        <pre class="think-content">{{ getThinkContent(msg.content) }}</pre>
                    </details>
                </template>
                <div
                    v-else
                    class="message-content"
                >
                    {{ msg.content }}
                </div>
            </div>
            <div
                v-if="isLoading"
                class="message assistant"
            >
                <div class="message-content typing">正在思考...</div>
            </div>
        </div>

        <div class="chat-footer">
            <textarea
                v-model="inputMessage"
                :placeholder="inputPlaceholder"
                rows="1"
                @keydown.enter.prevent="sendMessage"
            ></textarea>
            <button
                :disabled="sendDisabled"
                @click="sendMessage"
            >
                发送
            </button>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, nextTick, inject, watch } from 'vue';
import {
    apiAgentChatCompletions,
    apiAgentChatProxy,
    apiAgentChatDefaultProxy,
    apiAgentGetChatConfig,
    apiAgentGetUserConfig,
    apiAgentUpdateUserConfig,
    apiAgentListModels,
    apiAgentSaveModelPreference,
    apiGetDefaultAIConfig,
} from '../../api/backend';
import { readUserPositionFromCache } from '../../services/userPositionCache';
import { getGlobalUserLocationContext } from '../../services/userLocationContext';
import { useMessage } from '../../composables/useMessage';
import { Bot as BotIcon } from 'lucide-vue-next';
import { createGISCommander } from '../../composables/map/GISCommander';
import { AgentExecutor } from '../../services/agent/AgentExecutor';
import {
    AGENT_TOOLS,
    buildSystemPromptWithTools,
} from '../../constants/agentToolsSchema';
import { useChatStore } from '../../stores/useChatStore';

const emit = defineEmits(['close-chat']);
const message = useMessage();
const chatStore = useChatStore();

// ============================================================
//  GIS Commander & Agent Executor（工具调用基础设施）
// ============================================================

/** 通过 inject 获取地图实例和底图切换能力（由 HomeView provide） */
const olMapRef = inject('olMap', ref(null));
const setCustomBasemapByUrl = inject('setCustomBasemapByUrl', null);

/** GISCommander 实例 */
const gisCommander = ref(null);

/** AgentExecutor 实例 */
const agentExecutor = ref(null);

/** 工具调用状态消息（嵌入到消息流中） */
const toolCallStatusMessages = ref(new Map());

const inputMessage = ref('');
const isLoading = ref(false);
const chatBody = ref(null);
const modelName = ref('');
const statusHint = ref('正在初始化...');
const serviceReady = ref(false);
const showUserConfig = ref(false);
const userConfigSaving = ref(false);
const userConfigDraft = ref({
    api_key: '',
    base_url: '',
    model: '',
    system_prompt: '',
    timeout_seconds: 45,
    max_tokens: 8192,
    temperature: 0.2,
});
const quota = ref({
    limit: null,
    used: 0,
    remaining: null,
    usage_date: '',
    quota_subject: '',
});

// 模型列表相关
const isLoadingModels = ref(false);
const modelLoadHint = ref('');
const configuredModels = ref([]);
const upstreamModels = ref([]);

/** 合并所有可用模型列表，供 datalist 使用 */
const allModels = computed(() => {
    return [...configuredModels.value, ...upstreamModels.value];
});

/**
 * 直连模式配置（用户个人 Key 或管理员默认 AI 配置）
 * 用户个人 Key 仅保存在内存，不持久化；管理员默认配置从后端加载。
 */
const directConfig = ref({
    api_key: '',
    base_url: '',
    model: '',
    system_prompt: '',
    timeout_seconds: 45,
    max_tokens: 8192,
    temperature: 0.2,
});

/** 当前是否使用管理员配置的默认 AI 模式（api_key 存储在后端数据库，前端不持有） */
const isDefaultAIMode = ref(false);

/** 管理员默认 AI 配置是否已就绪（base_url + model + api_key 均已配置），内部使用 */
const _defaultAIReady = ref(false);

/**
 * 是否处于直连模式（包含默认 AI 模式和个人 Key 模式）
 * - 默认 AI 模式：管理员配置了专属 key/base_url/model，前端通过后端代理转发
 * - 个人 Key 模式：用户填写了自己的 API Key
 */
const isDirectMode = computed(() => {
    return isDefaultAIMode.value || !!(directConfig.value.api_key && directConfig.value.base_url);
});

/**
 * 切换路由模式
 * 在直连模式和代理模式之间切换，自动同步配置到配置面板
 */
const toggleRoutingMode = async () => {
    if (isDirectMode.value) {
        // 当前是直连 → 切换到代理：清空直连配置和默认 AI 模式
        isDefaultAIMode.value = false;
        directConfig.value = {
            api_key: '',
            base_url: '',
            model: '',
            system_prompt: '',
            timeout_seconds: 45,
            max_tokens: 8192,
            temperature: 0.2,
        };
        message.success('已切换为后端代理模式');
    } else {
        // 当前是代理 → 切换到默认 AI 模式（从后端加载管理员配置）
        await _loadDefaultAIConfig();
        if (isDefaultAIMode.value) {
            message.success('已切换为默认 AI 模式（使用管理员配置的专属 Key，经后端代理转发）');
        } else {
            message.warning('管理员尚未配置默认 AI 专属参数，请在个人配置中填写 API Key');
        }
    }
    // 同步到配置面板
    syncDraftFromDirectConfig();
    updateWelcomeMessageIfNeeded();
    // 重新加载 Agent 配置以同步模型名称（切换模式后 URL 和 Model 完全不同）
    await reloadAgentConfig(false);
};

/**
 * 将直连配置同步到配置面板（供用户查看和编辑）
 */
const syncDraftFromDirectConfig = () => {
    if (isDirectMode.value) {
        userConfigDraft.value = {
            api_key: directConfig.value.api_key,
            base_url: directConfig.value.base_url,
            model: directConfig.value.model,
            system_prompt: directConfig.value.system_prompt,
            timeout_seconds: directConfig.value.timeout_seconds,
            max_tokens: directConfig.value.max_tokens,
            temperature: directConfig.value.temperature,
        };
    }
};

const messages = ref([]);
const firstMessageLocationInjected = ref(false);
const clearConfirmArmed = ref(false);
let clearConfirmTimer = null;

const MAX_CONTEXT_MESSAGES = 6;
const MAX_CHARS_PER_MESSAGE = 600;
const AUTO_PRUNE_AFTER_TURNS = 12;

const initWelcomeMessage = () => {
    if (isDefaultAIMode.value) {
        return {
            role: 'assistant',
            content: `您好！当前为默认 AI 模式，使用管理员配置的 ${modelName.value || directConfig.value.model}，消息经后端代理转发。`,
        };
    }
    if (isDirectMode.value) {
        return {
            role: 'assistant',
            content: `您好！当前为个人 Key 模式，消息将经后端代理转发到 ${directConfig.value.base_url}。`,
        };
    }
    return {
        role: 'assistant',
        content: serviceReady.value
            ? '您好！我是由后端代理的 AI 助手，您可以直接开始提问。'
            : '您好！AI 服务暂未就绪。请在 ⚙️ 配置中填写个人 API Key 启用直连模式，或联系管理员配置后端。',
    };
};

messages.value = [initWelcomeMessage()];

const normalizeQuota = (raw) => {
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
};

const quotaText = computed(() => {
    const limit = quota.value.limit;
    const used = quota.value.used;
    const remaining = quota.value.remaining;

    if (limit === null) {
        return '管理员无限制';
    }

    return `${used}/${limit}（剩余 ${remaining ?? 0}）`;
});

const quotaExhausted = computed(() => {
    // 直连模式下不受后端配额限制
    if (isDirectMode.value) return false;
    return Number.isFinite(quota.value.remaining) && Number(quota.value.remaining) <= 0;
});

const inputPlaceholder = computed(() => {
    if (isDefaultAIMode.value) {
        return '请输入您的问题（默认 AI 模式，经后端代理）...';
    }
    if (isDirectMode.value) {
        return '请输入您的问题（个人 Key 模式，经后端代理）...';
    }
    if (!serviceReady.value) {
        return '服务未就绪，请在 ⚙️ 配置中填写 API Key 或联系管理员';
    }
    if (quotaExhausted.value) {
        return '今日额度已达上限，请明日再试';
    }
    return '请输入您的问题...';
});

const sendDisabled = computed(() => {
    if (isLoading.value || !inputMessage.value.trim()) return true;
    // 直连模式下只要 inputMessage 有内容就可发送
    if (isDirectMode.value) return false;
    return !serviceReady.value || quotaExhausted.value;
});

const updateWelcomeMessageIfNeeded = () => {
    if (!Array.isArray(messages.value) || messages.value.length === 0) {
        messages.value = [initWelcomeMessage()];
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
        messages.value[0] = initWelcomeMessage();
    }
};

/**
 * 构建带位置上下文的系统提示词
 *
 * @param {string} basePrompt - 基础系统提示词
 * @param {string} locationContext - 用户位置上下文信息
 * @returns {string} 合并后的完整系统提示词
 */
const _buildSystemPrompt = (basePrompt, locationContext) => {
    let prompt = basePrompt || 'You are a helpful AI assistant. Reply in concise Chinese unless the user asks for another language.';
    const locationText = String(locationContext || '').trim();
    if (locationText) {
        prompt += `\n\n【用户地理位置信息】\n${locationText}\n\n请基于用户的地理位置提供相关的WebGIS和地理空间信息服务。`;
    }
    return prompt;
};

/**
 * 从后端加载管理员配置的默认 AI 专属配置（base_url / model）。
 * api_key 存储在后端数据库中，前端仅获取 base_url 和 model 用于展示。
 * 聊天时通过 /chat/default-proxy 端点由后端读取 api_key 转发。
 */
const _loadDefaultAIConfig = async () => {
    try {
        const result = await apiGetDefaultAIConfig();
        const data = result?.data || result || {};
        if (data.is_configured && data.base_url && data.model) {
            isDefaultAIMode.value = true;
            _defaultAIReady.value = true;
            directConfig.value = {
                api_key: '', // 不持有 key，由后端读取
                base_url: String(data.base_url || ''),
                model: String(data.model || ''),
                system_prompt: '',
                timeout_seconds: 45,
                max_tokens: 8192,
                temperature: 0.2,
            };
            modelName.value = data.model;
            serviceReady.value = true;
            statusHint.value = `默认 AI 模式：使用管理员配置的 ${data.model}（经后端代理转发，Key 安全存储在后端）。`;
        } else {
            isDefaultAIMode.value = false;
            _defaultAIReady.value = false;
        }
    } catch {
        isDefaultAIMode.value = false;
        _defaultAIReady.value = false;
    }
};

const reloadAgentConfig = async (showToast = false) => {
    try {
        if (isDefaultAIMode.value) {
            // 默认 AI 模式：管理员已配置，无需获取模型列表，直接标记就绪
            serviceReady.value = true;
            modelName.value = directConfig.value.model || modelName.value || '未配置';
            statusHint.value = `默认 AI 模式：使用管理员配置的 ${modelName.value}（经后端代理转发，Key 安全存储在后端）。`;
        } else if (isDirectMode.value) {
            // 个人 Key 模式：从后端代理获取可用模型列表并随机选择一个
            serviceReady.value = true;
            statusHint.value = '个人 Key 模式：使用个人 API Key 经后端代理转发到 LLM 服务，避免浏览器 CORS 限制。';

            // 经后端代理获取当前端点的可用模型列表
            try {
                const dc = directConfig.value;
                const modelsResult = await apiAgentListModels({
                    override_base_url: dc.base_url,
                    override_api_key: dc.api_key,
                });
                const modelsData = modelsResult?.data || modelsResult || {};
                const models = Array.isArray(modelsData?.models) ? modelsData.models : [];

                if (models.length > 0) {
                    // 从可用聊天模型中随机选择一个
                    const chatModels = models.filter((m) => m?.chat_compatible !== false);
                    const pool = chatModels.length > 0 ? chatModels : models;
                    const randomModel = pool[Math.floor(Math.random() * pool.length)];
                    const selectedModel = String(randomModel?.id || dc.model || '');
                    if (selectedModel) {
                        directConfig.value.model = selectedModel;
                        modelName.value = selectedModel;
                    } else {
                        modelName.value = dc.model || '未配置';
                    }
                    statusHint.value = `个人 Key 模式：已随机选择模型 ${modelName.value}（共 ${pool.length} 个可用），经后端代理转发。`;
                } else {
                    // 获取模型列表失败，使用配置中的默认模型
                    modelName.value = dc.model || '未配置';
                    statusHint.value = '个人 Key 模式：未获取到可用模型列表，使用配置中的默认模型。';
                }
            } catch (modelError) {
                modelName.value = directConfig.value.model || '未配置';
                statusHint.value = `个人 Key 模式：模型列表获取失败（${modelError.message}），使用默认模型。`;
            }

            // 仍然尝试获取后端配额信息（供参考）
            try {
                const result = await apiAgentGetChatConfig();
                const data = result?.data || result || {};
                quota.value = normalizeQuota(data?.quota || {});
            } catch {
                // 直连模式下后端错误可忽略
            }
        } else {
            // 代理模式：从后端获取完整配置
            const result = await apiAgentGetChatConfig();
            const data = result?.data || result || {};

            serviceReady.value = !!data?.service_ready;
            modelName.value = String(data?.model || '');
            quota.value = normalizeQuota(data?.quota || {});

            if (serviceReady.value) {
                statusHint.value = quotaExhausted.value
                    ? '今日对话额度已达上限，请明日再试。'
                    : '后端 Agent 已连接，前端不会暴露任何对话密钥。';
            } else {
                statusHint.value = '后端 Agent 未完成配置。请在 ⚙️ 配置中填写个人 API Key 启用直连模式。';
            }
        }

        updateWelcomeMessageIfNeeded();

        if (showToast) {
            message.success('已刷新 AI 服务状态');
        }
    } catch (error) {
        if (!isDirectMode.value) {
            serviceReady.value = false;
        }
        statusHint.value = `状态获取失败：${error.message}`;
        if (showToast) {
            message.error(`刷新失败：${error.message}`);
        }
    }
};

const loadUserConfig = async (showToast = false) => {
    try {
        const result = await apiAgentGetUserConfig();
        const data = result?.data || result || {};
        const personal = data?.personal || {};
        const effective = data?.effective || {};

        // 如果当前是直连模式，优先显示直连配置
        if (isDirectMode.value) {
            syncDraftFromDirectConfig();
        } else {
            userConfigDraft.value = {
                api_key: '',
                base_url: String(personal?.base_url || effective?.base_url || ''),
                model: String(personal?.model || effective?.model || ''),
                system_prompt: String(personal?.system_prompt || ''),
                timeout_seconds: Number(personal?.timeout_seconds ?? effective?.timeout_seconds ?? 45),
                max_tokens: Number(personal?.max_tokens ?? effective?.max_tokens ?? 8192),
                temperature: Number(personal?.temperature ?? effective?.temperature ?? 0.2),
            };
        }

        if (showToast) {
            message.success('已加载你的 Agent 配置');
        }
    } catch (error) {
        if (showToast) {
            message.error(`加载个人配置失败：${error.message}`);
        }
    }
};

const toggleUserConfig = async () => {
    showUserConfig.value = !showUserConfig.value;
    if (showUserConfig.value) {
        await loadUserConfig(false);
        await loadAvailableModels();
    }
};

/**
 * 加载可用模型列表
 *
 * 直连模式：直接从用户配置的 LLM 端点获取模型列表
 * 代理模式：通过后端代理获取模型列表（支持 override 参数动态跟随面板设置）
 */
const loadAvailableModels = async () => {
    isLoadingModels.value = true;
    modelLoadHint.value = '正在加载模型列表...';

    try {
        let models = [];

        if (isDirectMode.value) {
            // 直连模式：经后端代理获取模型列表（避免浏览器 CORS 限制）
            const dc = directConfig.value;
            const overrideOptions = {
                override_base_url: dc.base_url,
                override_api_key: dc.api_key,
            };
            const response = await apiAgentListModels(overrideOptions);
            const data = response?.data || response || {};
            models = Array.isArray(data?.models) ? data.models : [];
            if (!models.length) {
                modelLoadHint.value = '未从上游返回可用模型，请检查 Base URL / API Key 是否正确。';
            } else {
                modelLoadHint.value = `✅ 已加载 ${models.length} 个模型（个人 Key 模式）`;
            }
        } else {
            // 代理模式：通过后端获取
            const overrideOptions = {};
            const draftBaseUrl = String(userConfigDraft.value.base_url || '').trim();
            const draftApiKey = String(userConfigDraft.value.api_key || '').trim();
            if (draftBaseUrl) {
                overrideOptions.override_base_url = draftBaseUrl;
            }
            if (draftApiKey) {
                overrideOptions.override_api_key = draftApiKey;
            }
            const response = await apiAgentListModels(overrideOptions);
            const data = response?.data || response || {};
            models = Array.isArray(data?.models) ? data.models : [];

            if (!models.length) {
                modelLoadHint.value = '未从上游返回可用模型，请检查 Base URL / API Key。';
                if (data?.fallback_reason) {
                    modelLoadHint.value += `（${data.fallback_reason}）`;
                }
            } else {
                modelLoadHint.value = `✅ 已加载 ${models.length} 个模型`;
            }
        }

        configuredModels.value = models.filter((m) => m?.source !== 'upstream');
        upstreamModels.value = models.filter((m) => m?.source === 'upstream');

        // 零配置即刻响应：如果用户未选择模型，自动从可用列表中选择
        if (!String(userConfigDraft.value.model || '').trim()) {
            const currentModel = isDirectMode.value
                ? ''
                : String(
                      (await apiAgentGetChatConfig().catch(() => ({})))?.data?.model || '',
                  ).trim();

            if (currentModel) {
                userConfigDraft.value.model = currentModel;
            } else if (models.length > 0) {
                const chatModels = models.filter((m) => m?.chat_compatible !== false);
                if (chatModels.length > 0) {
                    const randomModel = chatModels[Math.floor(Math.random() * chatModels.length)];
                    userConfigDraft.value.model = String(randomModel?.id || '');
                    // 异步保存为用户偏好
                    if (userConfigDraft.value.model && !isDirectMode.value) {
                        apiAgentSaveModelPreference(userConfigDraft.value.model).catch(() => {});
                    }
                }
            }
        }
    } catch (error) {
        modelLoadHint.value = `❌ 加载模型列表失败: ${error.message}`;
        configuredModels.value = [];
        upstreamModels.value = [];

        const fallbackModel = String(userConfigDraft.value.model || modelName.value || '').trim();
        if (fallbackModel) {
            configuredModels.value = [
                {
                    id: fallbackModel,
                    name: `当前模型：${fallbackModel}`,
                    source: 'configured',
                },
            ];
        }
    } finally {
        isLoadingModels.value = false;
    }
};

/**
 * 保存用户配置
 *
 * - 如果用户填写了 API Key + Base URL → 启用前端直连模式（Key 仅存内存，不发后端）
 * - 非敏感字段（base_url、model 等）始终同步保存到后端以保持跨设备一致性
 * - 如果用户未填写 API Key → 切换为后端代理模式
 */
const saveUserConfig = async () => {
    userConfigSaving.value = true;
    try {
        const personalApiKey = String(userConfigDraft.value.api_key || '').trim();
        const personalBaseUrl = String(userConfigDraft.value.base_url || '').trim();

        // 非敏感字段始终保存到后端（保持跨设备一致性）
        const backendPayload = {
            base_url: personalBaseUrl,
            model: String(userConfigDraft.value.model || '').trim(),
            system_prompt: String(userConfigDraft.value.system_prompt || '').trim(),
            timeout_seconds: Number(userConfigDraft.value.timeout_seconds || 45),
            max_tokens: Number(userConfigDraft.value.max_tokens || 8192),
            temperature: Number(userConfigDraft.value.temperature ?? 0.2),
        };

        // API Key 不发送到后端
        if (personalApiKey) {
            // 用户提供个人 Key → 退出默认 AI 模式，启用个人 Key 模式
            isDefaultAIMode.value = false;
            directConfig.value = {
                api_key: personalApiKey,
                ...backendPayload,
            };
        } else {
            // 代理模式：清空直连配置
            directConfig.value = {
                api_key: '',
                base_url: '',
                model: '',
                system_prompt: '',
                timeout_seconds: 45,
                max_tokens: 8192,
                temperature: 0.2,
            };
        }

        // 尝试保存到后端（非敏感字段），失败不影响直连模式
        try {
            await apiAgentUpdateUserConfig(backendPayload);
        } catch (backendError) {
            console.warn('[ChatPanel] 后端配置保存失败（直连模式不受影响）:', backendError.message);
        }

        // 保存模型偏好
        if (backendPayload.model) {
            try {
                await apiAgentSaveModelPreference(backendPayload.model);
            } catch {
                // 不中断主流程
            }
        }

        // 清空 draft 中的 API Key（安全考虑）
        userConfigDraft.value.api_key = '';

        await reloadAgentConfig(false);

        if (personalApiKey) {
            message.success('已启用前端直连模式（API Key 仅保存在当前会话，刷新后需重新输入）');
        } else {
            message.success('配置已保存到后端（后端代理模式）');
        }
    } catch (error) {
        message.error(`保存配置失败：${error.message}`);
    } finally {
        userConfigSaving.value = false;
    }
};

const clearPersonalKey = async () => {
    userConfigSaving.value = true;
    try {
        // 清空前端直连配置和默认 AI 模式
        isDefaultAIMode.value = false;
        directConfig.value = {
            api_key: '',
            base_url: '',
            model: '',
            system_prompt: '',
            timeout_seconds: 45,
            max_tokens: 8192,
            temperature: 0.2,
        };
        userConfigDraft.value.api_key = '';

        // 同时清除后端存储的 Key
        try {
            await apiAgentUpdateUserConfig({ clear_personal_key: true, api_key: '' });
        } catch {
            // 后端清除失败不影响本地清除
        }

        await reloadAgentConfig(false);
        message.success('已清除个人 API Key，切换为后端代理模式');
    } catch (error) {
        message.error(`清除失败：${error.message}`);
    } finally {
        userConfigSaving.value = false;
    }
};

const resetProviderOverrides = async () => {
    userConfigSaving.value = true;
    try {
        // 清空前端直连配置
        directConfig.value = {
            api_key: '',
            base_url: '',
            model: '',
            system_prompt: '',
            timeout_seconds: 45,
            max_tokens: 8192,
            temperature: 0.2,
        };

        // 重置后端配置
        try {
            await apiAgentUpdateUserConfig({ reset_provider_overrides: true });
        } catch {
            // 后端重置失败不影响本地重置
        }

        await loadUserConfig(false);
        await reloadAgentConfig(false);
        message.success('已恢复平台默认参数');
    } catch (error) {
        message.error(`恢复失败：${error.message}`);
    } finally {
        userConfigSaving.value = false;
    }
};

const getCachedMapPosition = () => readUserPositionFromCache();

const buildFirstMessageLocationContext = async () => {
    if (firstMessageLocationInjected.value) return '';

    const globalLocation = getGlobalUserLocationContext();
    if (
        globalLocation &&
        Number.isFinite(globalLocation.lon) &&
        Number.isFinite(globalLocation.lat)
    ) {
        const encoded = globalLocation.encodedLocation || {};
        const source = String(globalLocation.source || '未知').trim();
        const province = String(encoded.province || '未知').trim();
        const city = String(encoded.city || '未知').trim();
        const district = String(encoded.district || '未知').trim();
        const adcode = String(encoded.adcode || '未知').trim();
        const address = String(encoded.formattedAddress || '').trim();

        firstMessageLocationInjected.value = true;
        return `用户位置上下文（首条消息附带）：来源=${source}，经度=${globalLocation.lon.toFixed(6)}，纬度=${globalLocation.lat.toFixed(6)}，省=${province}，市=${city}，区县=${district}，编码=${adcode}，地址=${address || '待完善'}。`;
    }

    const baseLocation = getCachedMapPosition();
    if (baseLocation) {
        firstMessageLocationInjected.value = true;
        return `用户位置上下文（首条消息附带）：经度=${baseLocation.lon.toFixed(6)}，纬度=${baseLocation.lat.toFixed(6)}。`;
    }

    firstMessageLocationInjected.value = true;
    return '';
};

const compactText = (text, maxChars = MAX_CHARS_PER_MESSAGE) => {
    const normalized = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars)}...`;
};

const buildEconomyContext = () => {
    return messages.value
        .filter((_, idx) => idx !== 0)
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.content && m.content.trim())
        .slice(-MAX_CONTEXT_MESSAGES)
        .map((m) => ({ role: m.role, content: compactText(m.content) }));
};

const parseThinkAndAnswer = (rawContent) => {
    const text = String(rawContent || '');
    const startTag = '<think>';
    const endTag = '</think>';
    const start = text.indexOf(startTag);

    if (start === -1) {
        return {
            answer: text,
            think: '',
        };
    }

    const end = text.indexOf(endTag, start + startTag.length);

    if (end === -1) {
        return {
            answer: text.slice(0, start).trim(),
            think: text.slice(start + startTag.length).trim(),
        };
    }

    return {
        answer: `${text.slice(0, start)}${text.slice(end + endTag.length)}`.trim(),
        think: text.slice(start + startTag.length, end).trim(),
    };
};

const getAnswerContent = (rawContent) => {
    const answer = parseThinkAndAnswer(rawContent).answer;
    return answer || '（正在组织回答...）';
};

const getThinkContent = (rawContent) => parseThinkAndAnswer(rawContent).think;

const hasThinkContent = (rawContent) => !!getThinkContent(rawContent);

const getUserTurnsCount = () => messages.value.filter((m) => m.role === 'user').length;

const pruneHistoryIfNeeded = () => {
    if (getUserTurnsCount() < AUTO_PRUNE_AFTER_TURNS) return;

    const welcome =
        messages.value[0]?.role === 'assistant' ? messages.value[0] : initWelcomeMessage();

    const recentDialogue = messages.value
        .filter((m, idx) => idx !== 0)
        .filter(
            (m) => (m.role === 'user' || m.role === 'assistant') && m.content && m.content.trim(),
        )
        .slice(-2);

    messages.value = [welcome, ...recentDialogue];
    statusHint.value = '🧹 已自动精简历史，仅保留最近一轮对话以节省上下文开销';
};

const scrollToBottom = () => {
    nextTick(() => {
        if (chatBody.value) {
            chatBody.value.scrollTop = chatBody.value.scrollHeight;
        }
    });
};

const clearHistory = () => {
    if (!clearConfirmArmed.value) {
        clearConfirmArmed.value = true;
        message.warning('再次点击清除按钮可删除聊天历史', { duration: 3000 });
        if (clearConfirmTimer) {
            clearTimeout(clearConfirmTimer);
        }
        clearConfirmTimer = setTimeout(() => {
            clearConfirmArmed.value = false;
            clearConfirmTimer = null;
        }, 3000);
        return;
    }

    if (clearConfirmTimer) {
        clearTimeout(clearConfirmTimer);
        clearConfirmTimer = null;
    }
    clearConfirmArmed.value = false;
    messages.value = [initWelcomeMessage()];
    message.success('聊天历史已清除');
};

/**
 * 将工具说明注入到消息历史中（降级方案）
 *
 * 当后端 API 不支持 system_prompt 参数时，将工具说明作为第一条用户消息
 * 注入到历史记录中，确保 LLM 能感知到可用工具。
 *
 * @private
 * @param {Array} history - 原始对话历史
 * @param {string} toolPrompt - 工具说明提示词
 * @returns {Array} 注入工具说明后的历史
 */
const _injectToolPromptIntoHistory = (history, toolPrompt) => {
    if (!toolPrompt) return history;
    // 后端 _sanitize_history 会过滤 system 角色（避免与后端 system prompt 重复），
    // 因此工具说明以 user 角色注入，确保能通过后端校验并送达 LLM
    return [{ role: 'user', content: `[系统指令] 以下是你可以使用的工具说明，请严格按照此格式调用工具：\n\n${toolPrompt}` }, ...history];
};

/**
 * GIS 意图关键词检测（降级方案）
 *
 * 当 LLM 未输出 tool_call JSON 块时，通过关键词匹配检测用户的 GIS 操作意图。
 * 这是工具调用的最后防线，确保即使后端/LLM 不支持 Function Calling，地图也能响应。
 *
 * @private
 * @param {string} userMsg - 用户消息
 * @returns {{name: string, arguments: Object}|null} 检测到的工具调用，无则返回 null
 */
const _detectGISIntent = (userMsg) => {
    const rawMsg = String(userMsg || '').trim();
    const msg = rawMsg.toLowerCase();
    if (!rawMsg) return null;

    // 模式 1：搜索/定位意图
    // 匹配：定位到XXX、搜索XXX、找到XXX、去到XXX、飞到XXX、显示XXX位置、XXX在哪里
    const searchPatterns = [
        /(?:定位到?|搜索|查找?|去到?|飞到?|缩放到|前往|移动到?|显示)\s*[「"']?(.+?)[」"']?\s*(?:的位置|地方|在哪里|的范围)?$/,
        /^(.+?)(?:在哪里|在哪儿|怎么去|的坐标|的位置)$/,
        /(?:看看|查看)\s*(.+?)$/,
    ];

    for (const pattern of searchPatterns) {
        const match = msg.match(pattern);
        if (match && match[1] && match[1].length >= 2) {
            const query = match[1].trim();
            // 排除常见非地名词汇
            const excludeWords = ['一下', '一下下', '这个', '那个', '什么', '怎么', '为什么', '地图', '底图'];
            if (!excludeWords.includes(query)) {
                return { name: 'search_and_zoom', arguments: { query, zoom: 16 } };
            }
        }
    }

    // 模式 2：底图切换意图
    // 匹配：切换到XXX底图、换成XXX地图、使用XXX图源
    const basemapPatterns = [
        /(?:切换到?|换成?|使用|启用|换上|加载)\s*[「"']?(.+?)[」"']?\s*(?:底图|地图|图源|卫星)?$/,
        /(?:底图|地图|图源)\s*(?:切换到?|换成?|使用)\s*[「"']?(.+?)[」"']?$/,
    ];

    // Chat 底图切换只允许走 HTTPS XYZ URL -> custom 底图（l=1）。
    const basemapUrlMapping = {
        '高德卫星': {
            url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
            name: '高德卫星',
        },
        '高德': {
            url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
            name: '高德卫星',
        },
        'amap': {
            url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
            name: '高德卫星',
        },
        '高德路网': {
            url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            name: '高德路网',
        },
        'osm标准': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            name: 'OpenStreetMap',
        },
        'carto暗色': {
            url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            name: 'CartoDB 暗色',
        },
        'carto亮色': {
            url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            name: 'CartoDB 亮色',
        },
        '谷歌矢量': {
            url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            name: '谷歌矢量',
        },
        'google': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            name: '谷歌卫星',
        },
        '谷歌': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            name: '谷歌卫星',
        },
        '谷歌卫星': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            name: '谷歌卫星',
        },
        '卫星': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            name: '谷歌卫星',
        },
        '谷歌地形': {
            url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
            name: '谷歌地形',
        },
        '地形': {
            url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
            name: 'OpenTopoMap',
        },
        '矢量': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            name: 'OpenStreetMap',
        },
        'osm': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            name: 'OpenStreetMap',
        },
        'openstreetmap': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            name: 'OpenStreetMap',
        },
        '天地图': {
            url: 'https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=img&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={level}&TILEROW={row}&TILECOL={col}&tk=4267820f43926eaf808d61dc07269beb',
            name: '天地图卫星',
        },
        '中国渲染':{
            url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
            name:'中国渲染'
        }
    };

    // 模式 2a：用户直接提供了 URL
    const urlMatch = rawMsg.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
        const url = urlMatch[0];
        // 检查是否是 XYZ URL（包含 {x} {y} {z} 或类似模式）
        if (url.includes('{x}') || url.includes('{y}') || url.includes('{z}') || url.includes('{0-7}')) {
            const normalizedUrl = url.replace(/\{0-7\}/, '01'); // 天地图服务器编号降级
            return {
                name: 'switch_basemap',
                arguments: { url: normalizedUrl, name: '自定义图源' },
            };
        }
    }

    for (const pattern of basemapPatterns) {
        const match = msg.match(pattern);
        if (match && match[1]) {
            const target = match[1].trim().toLowerCase();

            for (const [keyword, xyzConfig] of Object.entries(basemapUrlMapping)) {
                if (target.includes(keyword.toLowerCase())) {
                    return {
                        name: 'switch_basemap',
                        arguments: { url: xyzConfig.url, name: xyzConfig.name },
                    };
                }
            }
        }
    }

    return null;
};

/**
 * 执行工具调用并更新 UI 状态
 *
 * @private
 * @param {Array} toolCalls - 工具调用列表
 * @param {number} assistantMsgIndex - 占位 assistant 消息的索引
 * @returns {Promise<{toolResults: Array, toolResultSummary: string}>}
 */
const _executeToolsAndUpdateUI = async (toolCalls, assistantMsgIndex) => {
    // 插入工具执行状态消息
    const statusMsgIndex =
        messages.value.push({
            role: 'assistant',
            content: '',
            isToolStatus: true,
            toolCalls: toolCalls.map((tc) => ({
                name: tc.name,
                label: _getToolDisplayName(tc.name, tc.arguments),
                status: 'executing',
            })),
        }) - 1;

    scrollToBottom();

    // 执行工具调用
    const toolResults = await agentExecutor.value.executeToolCalls(toolCalls);

    // 更新工具状态消息
    messages.value[statusMsgIndex].toolCalls = toolCalls.map((tc, idx) => {
        const result = toolResults[idx];
        return {
            name: tc.name,
            label: _getToolDisplayName(tc.name, tc.arguments),
            status: result?.result?.success ? 'success' : 'error',
            message: result?.result?.message || '',
        };
    });

    // 清理空的占位 assistant 消息
    if (!messages.value[assistantMsgIndex].content) {
        messages.value.splice(assistantMsgIndex, 1);
    }

    scrollToBottom();

    const toolResultSummary = AgentExecutor.buildResultSummary(toolResults);
    return { toolResults, toolResultSummary };
};

/**
 * 调用 LLM API（统一入口，支持三种模式）
 *
 * @private
 * @param {Object} params
 * @param {string} params.message - 用户消息
 * @param {Array} params.history - 对话历史
 * @param {string} params.locationContext - 位置上下文
 * @param {string} [params.systemPrompt] - 系统提示词（含工具说明）
 * @returns {Promise<{reply: string, usedModel: string, toolCalls?: Array, quota?: Object}>}
 */
const _callLLMAPI = async ({ message: userMsg, history, locationContext, systemPrompt }) => {
    let reply = '';
    let usedModel = '';
    let toolCalls = null;
    let quotaData = null;

    // 将工具说明注入历史（确保 LLM 感知工具，即使后端不支持 system_prompt）
    const enhancedHistory = systemPrompt
        ? _injectToolPromptIntoHistory(history, systemPrompt)
        : history;

    if (isDefaultAIMode.value) {
        // ============= 管理员默认 AI 模式 =============
        const dc = directConfig.value;
        const result = await apiAgentChatDefaultProxy({
            message: userMsg,
            history: enhancedHistory,
            location_context: locationContext,
            override_model: dc.model || undefined,
            tools: AGENT_TOOLS,
            tool_choice: 'auto',
        });
        const data = result?.data || result || {};
        reply = String(data?.reply || '').trim();
        usedModel = String(data?.model || dc.model || '');
        toolCalls = AgentExecutor.extractToolCalls(data);
    } else if (isDirectMode.value) {
        // ==================== 个人 Key 模式 ====================
        const dc = directConfig.value;
        // 合并工具说明与用户自定义 system prompt
        const mergedSystemPrompt = systemPrompt
            ? (dc.system_prompt ? `${systemPrompt}\n\n---\n\n${dc.system_prompt}` : systemPrompt)
            : dc.system_prompt || undefined;

        const result = await apiAgentChatProxy({
            message: userMsg,
            history: enhancedHistory,
            location_context: locationContext,
            api_key: dc.api_key,
            base_url: dc.base_url,
            model: dc.model,
            system_prompt: mergedSystemPrompt,
            timeout_seconds: dc.timeout_seconds,
            max_tokens: dc.max_tokens,
            temperature: dc.temperature,
            tools: AGENT_TOOLS,
            tool_choice: 'auto',
        });
        const data = result?.data || result || {};
        reply = String(data?.reply || '').trim();
        usedModel = String(data?.model || dc.model || '');
        toolCalls = AgentExecutor.extractToolCalls(data);
    } else {
        // ==================== 后端代理模式 ====================
        const chatPayload = {
            message: userMsg,
            history: enhancedHistory,
            location_context: locationContext,
            tools: AGENT_TOOLS,
            tool_choice: 'auto',
        };

        const draftBaseUrl = String(userConfigDraft.value.base_url || '').trim();
        const draftApiKey = String(userConfigDraft.value.api_key || '').trim();
        const draftModel = String(userConfigDraft.value.model || '').trim();
        const draftTimeout = userConfigDraft.value.timeout_seconds;
        const draftMaxTokens = userConfigDraft.value.max_tokens;
        const draftTemperature = userConfigDraft.value.temperature;

        if (draftBaseUrl) chatPayload.override_base_url = draftBaseUrl;
        if (draftApiKey) chatPayload.override_api_key = draftApiKey;
        if (draftModel) chatPayload.override_model = draftModel;
        if (typeof draftTimeout === 'number' && draftTimeout > 0)
            chatPayload.override_timeout_seconds = draftTimeout;
        if (typeof draftMaxTokens === 'number' && draftMaxTokens > 0)
            chatPayload.override_max_tokens = draftMaxTokens;
        if (typeof draftTemperature === 'number')
            chatPayload.override_temperature = draftTemperature;

        const result = await apiAgentChatCompletions(chatPayload);
        const data = result?.data || result || {};
        reply = String(data?.reply || '').trim();
        usedModel = String(data?.model || '');
        toolCalls = AgentExecutor.extractToolCalls(data);
        if (data?.quota) quotaData = data.quota;
    }

    return { reply, usedModel, toolCalls, quota: quotaData };
};

/**
 * 发送消息（支持工具调用 + 降级意图检测）
 *
 * 三级工具调用策略：
 * 1. 原生 Function Calling：后端返回 tool_calls 字段
 * 2. 降级文本解析：LLM 在回复中输出 ```tool_call JSON 块
 * 3. 关键词意图检测：从用户消息中直接识别 GIS 操作意图（最终防线）
 *
 * 工具执行后，将结果回传 LLM 获取自然语言回复。
 */
const sendMessage = async () => {
    if (sendDisabled.value) return;

    pruneHistoryIfNeeded();

    const userMsg = inputMessage.value.trim();
    const requestHistory = buildEconomyContext();
    const locationContextText = await buildFirstMessageLocationContext();

    messages.value.push({ role: 'user', content: userMsg });
    inputMessage.value = '';
    isLoading.value = true;
    scrollToBottom();

    const assistantMsgIndex = messages.value.push({ role: 'assistant', content: '' }) - 1;

    try {
        // 构建含工具说明的系统提示词
        const systemPrompt = buildSystemPromptWithTools();

        // ===== 第一轮：调用 LLM =====
        const { reply, usedModel, toolCalls: llmToolCalls, quota: quotaData } = await _callLLMAPI({
            message: userMsg,
            history: requestHistory,
            locationContext: locationContextText,
            systemPrompt,
        });

        if (quotaData) quota.value = normalizeQuota(quotaData);
        if (usedModel) modelName.value = usedModel;

        // ===== 工具调用检测（三级策略） =====
        let finalToolCalls = llmToolCalls;
        let isIntentFallback = false;

        // 策略 1+2：LLM 返回了 tool_calls（原生或文本解析）
        // 策略 3：LLM 未返回 tool_calls，尝试关键词意图检测
        if ((!finalToolCalls || finalToolCalls.length === 0) && agentExecutor.value) {
            const intentToolCall = _detectGISIntent(userMsg);
            if (intentToolCall) {
                finalToolCalls = [intentToolCall];
                isIntentFallback = true;
            }
        }

        // ===== 执行工具调用 =====
        if (finalToolCalls && finalToolCalls.length > 0 && agentExecutor.value) {
            // 从回复文本中移除 tool_call JSON 块（降级模式清理）
            const cleanReply = AgentExecutor.stripToolCallBlocks(reply);

            // 仅当工具调用来自 LLM 自身时才显示其文字回复
            // Strategy 3（意图检测）时 LLM 未真正调用工具，其文字可能是误导性的
            if (!isIntentFallback && cleanReply && cleanReply.length > 5) {
                messages.value[assistantMsgIndex].content = cleanReply;
            }

            // 执行工具并更新 UI
            const { toolResultSummary } = await _executeToolsAndUpdateUI(finalToolCalls, assistantMsgIndex);

            // ===== 第二轮：将工具结果回传 LLM 获取自然语言回复 =====
            const toolRoundHistory = [
                ...requestHistory,
                { role: 'user', content: userMsg },
                {
                    role: 'assistant',
                    content: cleanReply
                        ? `${cleanReply}\n\n[工具调用已执行]`
                        : '[工具调用已执行]',
                },
                {
                    role: 'user',
                    content: `[工具执行结果]\n${toolResultSummary}\n\n请根据工具执行结果给用户一个简洁友好的回复。如果工具执行成功，告诉用户已完成什么操作；如果失败，告诉用户失败原因和建议。`,
                },
            ];

            try {
                const secondRound = await _callLLMAPI({
                    message: '请根据上述工具执行结果回复用户。',
                    history: toolRoundHistory.slice(-6),
                    locationContext: '',
                    systemPrompt: '',
                });

                const finalReply = secondRound.reply || '';
                if (secondRound.quota) quota.value = normalizeQuota(secondRound.quota);
                if (secondRound.usedModel) modelName.value = secondRound.usedModel;

                if (finalReply) {
                    messages.value.push({ role: 'assistant', content: finalReply });
                } else {
                    // LLM 未返回回复，用工具结果摘要作为兜底
                    messages.value.push({ role: 'assistant', content: `✅ 操作完成：\n${toolResultSummary}` });
                }
            } catch {
                // 第二轮失败时，用工具结果作为回复
                messages.value.push({ role: 'assistant', content: `✅ 操作完成：\n${toolResultSummary}` });
            }
        } else {
            // 无工具调用：直接显示 LLM 回复
            messages.value[assistantMsgIndex].content = reply || '（未返回有效内容）';
        }

        if (!isDirectMode.value && quotaExhausted.value) {
            statusHint.value = '今日对话额度已用完，请明日再试或切换更高权限账号。';
        }
    } catch (error) {
        messages.value[assistantMsgIndex].content = `出错啦: ${error.message}`;

        if (error?.isQuotaExceeded) {
            statusHint.value = '今日额度已达上限，请明日再试。';
            await reloadAgentConfig(false);
        }
    } finally {
        isLoading.value = false;
        scrollToBottom();
    }
};

onBeforeUnmount(() => {
    if (clearConfirmTimer) {
        clearTimeout(clearConfirmTimer);
        clearConfirmTimer = null;
    }
    // 清理 GISCommander 资源
    gisCommander.value?.dispose?.();
});

/**
 * 初始化 GIS Commander 和 Agent Executor
 * 在地图实例就绪后创建，提供工具调用能力
 */
const initGISCommander = () => {
    if (!olMapRef?.value) return;

    try {
        gisCommander.value = createGISCommander({
            mapInstanceRef: olMapRef,
            // 注入自定义 XYZ 底图切换方法（复用 custom 图层机制）
            onCustomXYZSwitch: setCustomBasemapByUrl,
        });

        agentExecutor.value = new AgentExecutor({
            gisCommander: gisCommander.value,
            onToolStart: ({ toolCallId, name, arguments: args }) => {
                const label = _getToolDisplayName(name, args);
                toolCallStatusMessages.value.set(toolCallId, {
                    status: 'executing',
                    label,
                    startTime: Date.now(),
                });
            },
            onToolComplete: ({ toolCallId, name: _name, result }) => {
                const existing = toolCallStatusMessages.value.get(toolCallId);
                if (existing) {
                    existing.status = result.success ? 'success' : 'error';
                    existing.message = result.message;
                    existing.endTime = Date.now();
                }
            },
            onError: ({ toolCallId, error }) => {
                const existing = toolCallStatusMessages.value.get(toolCallId);
                if (existing) {
                    existing.status = 'error';
                    existing.message = error;
                    existing.endTime = Date.now();
                }
            },
        });

        chatStore.setExecutor(agentExecutor.value);
    } catch (err) {
        console.warn('[ChatPanelContent] GIS Commander 初始化失败:', err);
    }
};

/**
 * 获取工具的中文显示名称
 * @private
 */
const _getToolDisplayName = (name, args = {}) => {
    const displayNames = {
        zoom_to_extent: '缩放到指定范围',
        search_and_zoom: `定位到 "${args.query || '未知位置'}"`,
        switch_basemap: `切换到底图：${args.name || '自定义图源'}`,
    };
    return displayNames[name] || `执行工具：${name}`;
};

onMounted(async () => {
    // 启动时先尝试加载管理员配置的默认 AI 配置
    await _loadDefaultAIConfig();
    // 自动预加载模型列表
    loadAvailableModels();
    await reloadAgentConfig(false);

    // 初始化 GIS Commander（如果地图已就绪）
    initGISCommander();
});

// 监听地图实例变化，延迟初始化 GIS Commander
// 地图可能在 Chat 组件挂载后才完成初始化
watch(
    () => olMapRef?.value,
    (newMap) => {
        if (newMap && !gisCommander.value) {
            initGISCommander();
        }
    },
    { immediate: false },
);
</script>

<style scoped>
.chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    font-family: 'Segoe UI', sans-serif;
}

.chat-header {
    background: white;
    color: var(--text-primary);
    padding: 10px 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #f0f0f0;
}

.service-status {
    border-bottom: 1px solid #e9ecef;
    background: #fdfefe;
    padding: 10px 14px;
}

.user-config-panel {
    border-bottom: 1px solid #e9ecef;
    background: #fcfffd;
    padding: 10px 14px 12px;
}

.user-config-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(140px, 1fr));
    gap: 8px;
}

.user-config-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #315142;
}

.user-config-item-full {
    grid-column: 1 / -1;
}

.user-config-item input,
.user-config-item textarea,
.user-config-item select {
    width: 100%;
    border: 1px solid #d7e5dc;
    border-radius: 6px;
    padding: 6px 8px;
    box-sizing: border-box;
    font-family: inherit;
}

.model-input {
    flex: 1;
    border: 1px solid #d7e5dc;
    border-radius: 6px;
    padding: 6px 8px;
    box-sizing: border-box;
    font-family: inherit;
    background-color: white;
}

.model-input:hover {
    border-color: var(--brand-primary);
}

.model-input:focus {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.1);
}

.refresh-models-btn {
    padding: 6px 10px;
    border: 1px solid #d7e5dc;
    border-radius: 6px;
    background-color: white;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
}

.refresh-models-btn:hover:not(:disabled) {
    border-color: var(--brand-primary);
    background-color: #f0f7f2;
}

.refresh-models-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.user-config-actions {
    margin-top: 8px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.user-config-actions button {
    border: none;
    border-radius: 6px;
    padding: 6px 10px;
    background: var(--brand-primary);
    color: #fff;
    cursor: pointer;
    font-size: 12px;
}

.user-config-actions button.secondary {
    background: #8aa39a;
}

.user-config-actions button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.status-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85em;
    margin-bottom: 4px;
}

.status-line:last-of-type {
    margin-bottom: 0;
}

.status-label {
    color: #5f6d66;
}

.status-value {
    color: #2a3a32;
    font-weight: 600;
}

.status-ready {
    color: var(--brand-primary-dark);
}

.status-unready {
    color: #c62828;
}

.status-direct {
    color: #1565c0;
}

.status-proxy {
    color: #6a1b9a;
}

.status-default-ai {
    color: #2e7d32;
}

.mode-toggle-btn {
    background: none;
    border: 1px solid #d7e5dc;
    border-radius: 12px;
    padding: 2px 10px;
    font-size: 0.85em;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.mode-toggle-btn.mode-direct {
    color: #1565c0;
    border-color: #90caf9;
    background: #e3f2fd;
}

.mode-toggle-btn.mode-direct:hover {
    background: #bbdefb;
    border-color: var(--info);
}

.mode-toggle-btn.mode-proxy {
    color: #6a1b9a;
    border-color: #ce93d8;
    background: #f3e5f5;
}

.mode-toggle-btn.mode-proxy:hover {
    background: #e1bee7;
    border-color: #ab47bc;
}

.mode-toggle-btn.mode-default-ai {
    color: #2e7d32;
    border-color: #81c784;
    background: #e8f5e9;
}

.mode-toggle-btn.mode-default-ai:hover {
    background: #c8e6c9;
    border-color: #43a047;
}

.mode-toggle-hint {
    font-size: 0.85em;
    font-weight: 400;
    opacity: 0.7;
}

.model-source-tag {
    font-size: 0.7em;
    font-weight: 400;
    color: #1565c0;
    background: #e3f2fd;
    border-radius: 4px;
    padding: 1px 5px;
    margin-left: 4px;
}

.model-source-tag.proxy {
    color: #6a1b9a;
    background: #f3e5f5;
}

.model-source-tag.default-ai {
    color: #2e7d32;
    background: #e8f5e9;
}

.chat-title {
    font-weight: bold;
    font-size: 1em;
    color: var(--brand-primary);
}

.header-controls .icon-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    margin-left: 15px;
    font-size: 1.1em;
    opacity: 0.8;
    transition: opacity 0.2s;
}

.header-controls .icon-btn:hover {
    opacity: 1;
    color: var(--text-primary);
}

.chat-body {
    flex: 1;
    padding: 15px;
    overflow-y: auto;
    background: #f8f9fa;
}

.message {
    margin-bottom: 15px;
    display: flex;
    flex-direction: column;
}

.message.user {
    align-items: flex-end;
}

.message.assistant {
    align-items: flex-start;
}

/* ========== 工具调用状态卡片 ========== */
.tool-status-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 10px;
    background: #f0f7ff;
    border: 1px solid #d0e3f7;
    font-size: 0.88em;
    max-width: 90%;
}

.tool-status-item {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.tool-status-icon {
    font-size: 1em;
    flex-shrink: 0;
}

.tool-status-label {
    color: #333;
    font-weight: 500;
}

.tool-status-message {
    color: #666;
    font-size: 0.9em;
    word-break: break-all;
}

.message-content {
    max-width: 90%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 0.95em;
    line-height: 1.5;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    word-wrap: break-word;
    white-space: pre-wrap;
}

.message.user .message-content {
    background: var(--brand-primary);
    color: white;
    border-bottom-right-radius: 2px;
}

.message.assistant .message-content {
    background: white;
    color: var(--text-primary);
    border-bottom-left-radius: 2px;
    border: 1px solid var(--border-light);
}

.think-panel {
    max-width: 90%;
    margin-top: 6px;
    border: 1px dashed #c7d7cc;
    border-radius: 10px;
    padding: 6px 10px;
    background: #f7fbf8;
    color: #4f5b53;
    font-size: 0.85em;
}

.think-panel summary {
    cursor: pointer;
    user-select: none;
    font-weight: 600;
}

.think-content {
    margin: 8px 0 2px;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.45;
    font-family: inherit;
}

.chat-footer {
    padding: 10px;
    border-top: 1px solid #eee;
    background: white;
    display: flex;
    gap: 8px;
    align-items: flex-end;
}

textarea {
    flex: 1;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
    resize: none;
    outline: none;
    font-family: inherit;
    transition: border-color 0.2s;
    min-height: 40px;
}

textarea:focus {
    border-color: var(--brand-primary);
}

.chat-footer button {
    padding: 0 16px;
    height: 40px;
    background: var(--brand-primary);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.2s;
}

.chat-footer button:hover {
    background: var(--brand-primary);
}

.chat-footer button:disabled {
    background: #ccc;
    cursor: not-allowed;
}

.hint {
    color: var(--text-secondary);
    font-size: 0.85em;
    margin-top: 4px;
    display: block;
}
</style>
