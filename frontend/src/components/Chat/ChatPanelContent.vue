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

        <!-- 可滚动区域：配置面板 + 服务状态 -->
        <div class="scroll-top-section">
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
                        <div class="model-input-row">
                            <input
                                ref="modelInputRef"
                                v-model="userConfigDraft.model"
                                class="model-input"
                                placeholder="输入或选择模型名称"
                                autocomplete="off"
                                @focus="showModelDropdown = true"
                                @blur="onModelInputBlur"
                            />
                            <button
                                class="model-dropdown-btn"
                                title="展开模型列表"
                                @click.stop="toggleModelDropdown"
                            >▾</button>
                            <div
                                v-if="showModelDropdown && filteredModels.length"
                                class="model-dropdown"
                                @mousedown.prevent
                            >
                                <div
                                    v-for="m in filteredModels"
                                    :key="m.id"
                                    class="model-dropdown-item"
                                    @mousedown.prevent="pickModel(m.id)"
                                >{{ m.name || m.id }}{{ m._isFallback ? '（当前）' : '' }}</div>
                            </div>
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
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div class="message-content markdown-body" v-html="renderAnswerHtml(msg.content)"></div>
                    <details
                        v-if="hasThinkContent(msg.content)"
                        class="think-panel"
                    >
                        <summary>🧠 思考过程</summary>
                        <!-- eslint-disable-next-line vue/no-v-html -->
                        <div class="think-content markdown-body" v-html="renderThinkHtml(msg.content)"></div>
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

// highlight.js 核心 + 常用语言包（按需添加更多）
import 'highlight.js/styles/github-dark-dimmed.css';
import { useMarkdownRenderer } from '../../composables/useMarkdownRenderer';

const {
    renderAnswerHtml,
    renderThinkHtml,
    hasThinkContent,
    ensureMarkdownLibs,
} = useMarkdownRenderer();
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
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '../../services/runtimeMapTokens';
import {
    AGENT_TOOLS,
    buildSystemPromptWithTools,
} from '../../constants/agentToolsSchema';
import { useChatStore } from '../../stores/useChatStore';

const emit = defineEmits(['close-chat']);
const message = useMessage();
const chatStore = useChatStore();

const olMapRef = inject('olMap', ref(null));
const setCustomBasemapByUrl = inject('setCustomBasemapByUrl', null);

const gisCommander = ref(null);
const agentExecutor = ref(null);
const toolCallStatusMessages = ref(new Map());

const inputMessage = ref('');
const isLoading = ref(false);
const chatBody = ref(null);
const modelName = ref('');
const statusHint = ref('正在初始化...');
const serviceReady = ref(false);
const runtimeTiandituTk = ref(getRuntimeMapTokensSync().tiandituTk);
const showUserConfig = ref(false);
const userConfigSaving = ref(false);
const userConfigDraft = ref({
    api_key: '',
    base_url: '',
    model: '',
    system_prompt: '',
    timeout_seconds: 45,
    max_tokens: 32768,
    temperature: 1,
    top_p: 0.95,
    extra_body: { chat_template_kwargs: { enable_thinking: true }, reasoning_budget: 16384 },
});
const quota = ref({
    limit: null,
    used: 0,
    remaining: null,
    usage_date: '',
    quota_subject: '',
});

const isLoadingModels = ref(false);
const modelLoadHint = ref('');
const configuredModels = ref([]);
const upstreamModels = ref([]);

/**
 * Model 下拉选项列表
 * 若当前 draft.model 不在已获取的模型列表中，追加一条"当前"兜底选项
 */
const selectModels = computed(() => {
    const list = [...configuredModels.value, ...upstreamModels.value];
    const current = String(userConfigDraft.value.model || '').trim();
    if (current && !list.some((m) => m.id === current)) {
        list.unshift({ id: current, name: current, _isFallback: true });
    }
    return list;
});

/** Model 输入框下拉组合框状态 */
const modelInputRef = ref(null);
const showModelDropdown = ref(false);

/** 根据输入文本过滤下拉列表（忽略大小写，匹配 id 或 name） */
const filteredModels = computed(() => {
    const q = String(userConfigDraft.value.model || '').trim().toLowerCase();
    if (!q) return selectModels.value;
    return selectModels.value.filter(
        (m) => m.id.toLowerCase().includes(q) || String(m.name || '').toLowerCase().includes(q),
    );
});

/** 从下拉列表选中某个模型 */
function pickModel(id) {
    userConfigDraft.value.model = id;
    saveModel(id);
    saveModel(id);
    showModelDropdown.value = false;
}

/** 切换下拉显示 */
function toggleModelDropdown() {
    showModelDropdown.value = !showModelDropdown.value;
    if (showModelDropdown.value) modelInputRef.value?.focus();
}

/** 输入框失焦时延迟关闭下拉（给 @mousedown.prevent 留时间） */
function onModelInputBlur() {
    setTimeout(() => { showModelDropdown.value = false; }, 150);
}

/** localStorage 键名：用户选择的模型名称 */
const MODEL_STORAGE_KEY = 'chat:selectedModel';

/** 读取持久化的模型名 */
function readSavedModel() {
    try { return localStorage.getItem(MODEL_STORAGE_KEY) || ''; } catch { return ''; }
}

/** 持久化模型名 */
function saveModel(model) {
    try { localStorage.setItem(MODEL_STORAGE_KEY, model || ''); } catch { /* noop */ }
}

/** localStorage 键名：用户选择的模型名称 */
const MODEL_STORAGE_KEY = 'chat:selectedModel';

/** 读取持久化的模型名 */
function readSavedModel() {
    try { return localStorage.getItem(MODEL_STORAGE_KEY) || ''; } catch { return ''; }
}

/** 持久化模型名 */
function saveModel(model) {
    try { localStorage.setItem(MODEL_STORAGE_KEY, model || ''); } catch { /* noop */ }
}

const directConfig = ref({
    api_key: '',
    base_url: '',
    model: '',
    system_prompt: '',
    timeout_seconds: 45,
    max_tokens: 32768,
    temperature: 1,
    top_p: 0.95,
    extra_body: { chat_template_kwargs: { enable_thinking: true }, reasoning_budget: 16384 },
});

const isDefaultAIMode = ref(false);
const _defaultAIReady = ref(false);

const isDirectMode = computed(() => {
    return isDefaultAIMode.value || !!(directConfig.value.api_key && directConfig.value.base_url);
});

const toggleRoutingMode = async () => {
    if (isDirectMode.value) {
        // 保留模型引用，让 reloadAgentConfig 后续根据 localStorage 恢复
        const preservedModel = directConfig.value.model;
        // 保留模型引用，让 reloadAgentConfig 后续根据 localStorage 恢复
        const preservedModel = directConfig.value.model;
        isDefaultAIMode.value = false;
        directConfig.value = {
            api_key: '',
            base_url: '',
            model: preservedModel,
            model: preservedModel,
            system_prompt: '',
            timeout_seconds: 45,
            max_tokens: 32768,
            temperature: 1,
        };
        message.success('已切换为后端代理模式');
    } else {
        await _loadDefaultAIConfig();
        if (isDefaultAIMode.value) {
            message.success('已切换为默认 AI 模式（使用管理员配置的专属 Key，经后端代理转发）');
        } else {
            message.warning('管理员尚未配置默认 AI 专属参数，请在个人配置中填写 API Key');
        }
    }
    syncDraftFromDirectConfig();
    updateWelcomeMessageIfNeeded();
    await reloadAgentConfig(false);
    // 模式切换后刷新 userConfigDraft 和模型列表，避免残留旧模式的配置
    await loadUserConfig(false);
    await loadAvailableModels();
};

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
            top_p: directConfig.value.top_p,
            extra_body: directConfig.value.extra_body,
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

const _buildSystemPrompt = (basePrompt, locationContext) => {
    let prompt = basePrompt || 'You are a helpful AI assistant. Reply in concise Chinese unless the user asks for another language.';
    const locationText = String(locationContext || '').trim();
    if (locationText) {
        prompt += `\n\n【用户地理位置信息】\n${locationText}\n\n请基于用户的地理位置提供相关的WebGIS和地理空间信息服务。`;
    }
    return prompt;
};

const _loadDefaultAIConfig = async () => {
    try {
        const result = await apiGetDefaultAIConfig();
        const data = result?.data || result || {};
        if (data.is_configured && data.base_url && data.model) {
            isDefaultAIMode.value = true;
            _defaultAIReady.value = true;
            directConfig.value = {
                api_key: '',
                base_url: String(data.base_url || ''),
                model: String(data.model || ''),
                system_prompt: '',
                timeout_seconds: 45,
                max_tokens: 32768,
                temperature: 1,
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
            serviceReady.value = true;
            modelName.value = directConfig.value.model || modelName.value || '未配置';
            statusHint.value = `默认 AI 模式：使用管理员配置的 ${modelName.value}（经后端代理转发，Key 安全存储在后端）。`;
        } else if (isDirectMode.value) {
            serviceReady.value = true;
            statusHint.value = '个人 Key 模式：使用个人 API Key 经后端代理转发到 LLM 服务，避免浏览器 CORS 限制。';

            try {
                const dc = directConfig.value;
                const modelsResult = await apiAgentListModels({
                    override_base_url: dc.base_url,
                    override_api_key: dc.api_key,
                });
                const modelsData = modelsResult?.data || modelsResult || {};
                const models = Array.isArray(modelsData?.models) ? modelsData.models : [];

                if (models.length > 0) {
                    const chatModels = models.filter((m) => m?.chat_compatible !== false);
                    const pool = chatModels.length > 0 ? chatModels : models;
                    const savedModel = readSavedModel();
                    const preferredModel = savedModel && pool.some((m) => m.id === savedModel)
                        ? savedModel
                        : '';
                    const selectedModel = preferredModel || String(pool[0]?.id || dc.model || '');
                    const savedModel = readSavedModel();
                    const preferredModel = savedModel && pool.some((m) => m.id === savedModel)
                        ? savedModel
                        : '';
                    const selectedModel = preferredModel || String(pool[0]?.id || dc.model || '');
                    if (selectedModel) {
                        directConfig.value.model = selectedModel;
                        modelName.value = selectedModel;
                    } else {
                        modelName.value = dc.model || '未配置';
                    }
                    statusHint.value = `个人 Key 模式：已选择模型 ${modelName.value}（共 ${pool.length} 个可用），经后端代理转发。`;
                } else {
                    modelName.value = dc.model || '未配置';
                    statusHint.value = '个人 Key 模式：未获取到可用模型列表，使用配置中的默认模型。';
                }
            } catch (modelError) {
                modelName.value = directConfig.value.model || '未配置';
                statusHint.value = `个人 Key 模式：模型列表获取失败（${modelError.message}），使用默认模型。`;
            }

            try {
                const result = await apiAgentGetChatConfig();
                const data = result?.data || result || {};
                quota.value = normalizeQuota(data?.quota || {});
            } catch {
                // ignore
            }
        } else {
            const result = await apiAgentGetChatConfig();
            const data = result?.data || result || {};

            serviceReady.value = !!data?.service_ready;
            modelName.value = String(data?.model || '');
            quota.value = normalizeQuota(data?.quota || {});

            // 如果管理员在后端配置了模型，优先使用数据库的配置；
            // 仅当后端没有配置模型时，才回退到用户 localStorage 中保存的偏好
            if (!modelName.value) {
                const savedModel = readSavedModel();
                if (savedModel) {
                    modelName.value = savedModel;
                    userConfigDraft.value.model = savedModel;
                }
            }

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

        if (isDirectMode.value) {
            syncDraftFromDirectConfig();
        } else {
            userConfigDraft.value = {
                api_key: '',
                base_url: String(personal?.base_url || effective?.base_url || ''),
                model: String(personal?.model || effective?.model || ''),
                system_prompt: String(personal?.system_prompt || ''),
                timeout_seconds: Number(personal?.timeout_seconds ?? effective?.timeout_seconds ?? 45),
                max_tokens: Number(personal?.max_tokens ?? effective?.max_tokens ?? 32768),
                temperature: Number(personal?.temperature ?? effective?.temperature ?? 1),
                top_p: Number(personal?.top_p ?? effective?.top_p ?? 0.95),
                extra_body: personal?.extra_body ?? effective?.extra_body ?? { chat_template_kwargs: { enable_thinking: true }, reasoning_budget: 16384 },
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

const loadAvailableModels = async () => {
    isLoadingModels.value = true;
    modelLoadHint.value = '正在加载模型列表...';

    try {
        let models = [];

        if (isDirectMode.value) {
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

        if (!String(userConfigDraft.value.model || '').trim()) {
            const currentModel = isDirectMode.value
                ? ''
                : String(
                      (await apiAgentGetChatConfig().catch(() => ({})))?.data?.model || '',
                  ).trim();

            if (currentModel) {
                userConfigDraft.value.model = currentModel;
            } else {
                // 优先用 localStorage 中保存的用户偏好模型
                const saved = readSavedModel();
                if (saved && models.some((m) => m.id === saved)) {
                    userConfigDraft.value.model = saved;
                } else if (models.length > 0) {
                    const chatModels = models.filter((m) => m?.chat_compatible !== false);
                    if (chatModels.length > 0) {
                        const firstModel = chatModels[0];
                        userConfigDraft.value.model = String(firstModel?.id || '');
                        if (userConfigDraft.value.model && !isDirectMode.value) {
                            apiAgentSaveModelPreference(userConfigDraft.value.model).catch(() => {});
                        }
                    }
                }
                if (userConfigDraft.value.model) {
                    saveModel(userConfigDraft.value.model);
            } else {
                // 优先用 localStorage 中保存的用户偏好模型
                const saved = readSavedModel();
                if (saved && models.some((m) => m.id === saved)) {
                    userConfigDraft.value.model = saved;
                } else if (models.length > 0) {
                    const chatModels = models.filter((m) => m?.chat_compatible !== false);
                    if (chatModels.length > 0) {
                        const firstModel = chatModels[0];
                        userConfigDraft.value.model = String(firstModel?.id || '');
                        if (userConfigDraft.value.model && !isDirectMode.value) {
                            apiAgentSaveModelPreference(userConfigDraft.value.model).catch(() => {});
                        }
                    }
                }
                if (userConfigDraft.value.model) {
                    saveModel(userConfigDraft.value.model);
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

const saveUserConfig = async () => {
    userConfigSaving.value = true;
    try {
        const personalApiKey = String(userConfigDraft.value.api_key || '').trim();
        const personalBaseUrl = String(userConfigDraft.value.base_url || '').trim();

        const backendPayload = {
            base_url: personalBaseUrl,
            model: String(userConfigDraft.value.model || '').trim(),
            system_prompt: String(userConfigDraft.value.system_prompt || '').trim(),
            timeout_seconds: Number(userConfigDraft.value.timeout_seconds || 45),
            max_tokens: Number(userConfigDraft.value.max_tokens || 32768),
            temperature: Number(userConfigDraft.value.temperature ?? 1),
            top_p: Number(userConfigDraft.value.top_p ?? 0.95),
            extra_body: userConfigDraft.value.extra_body,
        };

        if (personalApiKey) {
            isDefaultAIMode.value = false;
            directConfig.value = {
                api_key: personalApiKey,
                ...backendPayload,
            };
        } else {
            directConfig.value = {
                api_key: '',
                base_url: '',
                model: '',
                system_prompt: '',
                timeout_seconds: 45,
                max_tokens: 32768,
                temperature: 1,
            };
        }

        try {
            await apiAgentUpdateUserConfig(backendPayload);
        } catch (backendError) {
            console.warn('[ChatPanel] 后端配置保存失败（直连模式不受影响）:', backendError.message);
        }

        if (backendPayload.model) {
            try {
                await apiAgentSaveModelPreference(backendPayload.model);
            } catch {
                // ignore
            }
        }

        userConfigDraft.value.api_key = '';
        await reloadAgentConfig(false);
        // 保存配置后刷新模型列表，使下拉框与当前模式一致
        await loadAvailableModels();

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
        isDefaultAIMode.value = false;
        directConfig.value = {
            api_key: '',
            base_url: '',
            model: '',
            system_prompt: '',
            timeout_seconds: 45,
            max_tokens: 32768,
            temperature: 1,
        };
        userConfigDraft.value.api_key = '';

        try {
            await apiAgentUpdateUserConfig({ clear_personal_key: true, api_key: '' });
        } catch {
            // ignore
        }

        await reloadAgentConfig(false);
        await loadAvailableModels();
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
        directConfig.value = {
            api_key: '',
            base_url: '',
            model: '',
            system_prompt: '',
            timeout_seconds: 45,
            max_tokens: 32768,
            temperature: 1,
        };

        try {
            await apiAgentUpdateUserConfig({ reset_provider_overrides: true });
        } catch {
            // ignore
        }

        await loadUserConfig(false);
        await reloadAgentConfig(false);
        await loadAvailableModels();
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

const _injectToolPromptIntoHistory = (history, toolPrompt) => {
    if (!toolPrompt) return history;
    return [{ role: 'user', content: `[系统指令] 以下是你可以使用的工具说明，请严格按照此格式调用工具：\n\n${toolPrompt}` }, ...history];
};

const _detectGISIntent = (userMsg) => {
    const rawMsg = String(userMsg || '').trim();
    const msg = rawMsg.toLowerCase();
    if (!rawMsg) return null;

    const searchPatterns = [
        /(?:定位到?|搜索|查找?|去到?|飞到?|缩放到|前往|移动到?|显示)\s*[「"']?(.+?)[」"']?\s*(?:的位置|地方|在哪里|的范围)?$/,
        /^(.+?)(?:在哪里|在哪儿|怎么去|的坐标|的位置)$/,
        /(?:看看|查看)\s*(.+?)$/,
    ];

    for (const pattern of searchPatterns) {
        const match = msg.match(pattern);
        if (match && match[1] && match[1].length >= 2) {
            const query = match[1].trim();
            const excludeWords = ['一下', '一下下', '这个', '那个', '什么', '怎么', '为什么', '地图', '底图'];
            if (!excludeWords.includes(query)) {
                return { name: 'search_and_zoom', arguments: { query, zoom: 16 } };
            }
        }
    }

    const basemapPatterns = [
        /(?:切换到?|换成?|使用|启用|换上|加载)\s*[「"']?(.+?)[」"']?\s*(?:底图|地图|图源|卫星)?$/,
        /(?:底图|地图|图源)\s*(?:切换到?|换成?|使用)\s*[「"']?(.+?)[」"']?$/,
    ];

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
            url: `https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=img&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={level}&TILEROW={row}&TILECOL={col}&tk=${runtimeTiandituTk.value}`,
            name: '天地图卫星',
        },
        '中国渲染':{
            url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
            name:'中国渲染'
        }
    };

    const urlMatch = rawMsg.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
        const url = urlMatch[0];
        if (url.includes('{x}') || url.includes('{y}') || url.includes('{z}') || url.includes('{0-7}')) {
            const normalizedUrl = url.replace(/\{0-7\}/, '01');
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

const _executeToolsAndUpdateUI = async (toolCalls, assistantMsgIndex) => {
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
    const toolResults = await agentExecutor.value.executeToolCalls(toolCalls);

    messages.value[statusMsgIndex].toolCalls = toolCalls.map((tc, idx) => {
        const result = toolResults[idx];
        return {
            name: tc.name,
            label: _getToolDisplayName(tc.name, tc.arguments),
            status: result?.result?.success ? 'success' : 'error',
            message: result?.result?.message || '',
        };
    });

    if (!messages.value[assistantMsgIndex].content) {
        messages.value.splice(assistantMsgIndex, 1);
    }

    scrollToBottom();
    const toolResultSummary = AgentExecutor.buildResultSummary(toolResults);
    return { toolResults, toolResultSummary };
};

const _callLLMAPI = async ({ message: userMsg, history, locationContext, systemPrompt }) => {
    let reply = '';
    let usedModel = '';
    let toolCalls = null;
    let quotaData = null;

    const enhancedHistory = systemPrompt
        ? _injectToolPromptIntoHistory(history, systemPrompt)
        : history;

    if (isDefaultAIMode.value) {
        const dc = directConfig.value;
        const result = await apiAgentChatDefaultProxy({
            message: userMsg,
            history: enhancedHistory,
            location_context: locationContext,
            override_model: dc.model || undefined,
            override_top_p: dc.top_p,
            override_extra_body: dc.extra_body,
            tools: AGENT_TOOLS,
            tool_choice: 'auto',
        });
        const data = result?.data || result || {};
        reply = String(data?.reply || '').trim();
        usedModel = String(data?.model || dc.model || '');
        toolCalls = AgentExecutor.extractToolCalls(data);
    } else if (isDirectMode.value) {
        const dc = directConfig.value;
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
            top_p: dc.top_p,
            extra_body: dc.extra_body,
            tools: AGENT_TOOLS,
            tool_choice: 'auto',
        });
        const data = result?.data || result || {};
        reply = String(data?.reply || '').trim();
        usedModel = String(data?.model || dc.model || '');
        toolCalls = AgentExecutor.extractToolCalls(data);
    } else {
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
        const draftTopP = userConfigDraft.value.top_p;
        const draftExtraBody = userConfigDraft.value.extra_body;

        if (draftBaseUrl) chatPayload.override_base_url = draftBaseUrl;
        if (draftApiKey) chatPayload.override_api_key = draftApiKey;
        if (draftModel) chatPayload.override_model = draftModel;
        if (typeof draftTimeout === 'number' && draftTimeout > 0)
            chatPayload.override_timeout_seconds = draftTimeout;
        if (typeof draftMaxTokens === 'number' && draftMaxTokens > 0)
            chatPayload.override_max_tokens = draftMaxTokens;
        if (typeof draftTemperature === 'number')
            chatPayload.override_temperature = draftTemperature;
        if (typeof draftTopP === 'number')
            chatPayload.override_top_p = draftTopP;
        if (draftExtraBody !== undefined && draftExtraBody !== null)
            chatPayload.override_extra_body = draftExtraBody;

        const result = await apiAgentChatCompletions(chatPayload);
        const data = result?.data || result || {};
        reply = String(data?.reply || '').trim();
        usedModel = String(data?.model || '');
        toolCalls = AgentExecutor.extractToolCalls(data);
        if (data?.quota) quotaData = data.quota;
    }

    return { reply, usedModel, toolCalls, quota: quotaData };
};

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
        const systemPrompt = buildSystemPromptWithTools();

        const { reply, usedModel, toolCalls: llmToolCalls, quota: quotaData } = await _callLLMAPI({
            message: userMsg,
            history: requestHistory,
            locationContext: locationContextText,
            systemPrompt,
        });

        if (quotaData) quota.value = normalizeQuota(quotaData);
        if (usedModel) modelName.value = usedModel;

        let finalToolCalls = llmToolCalls;
        let isIntentFallback = false;

        if ((!finalToolCalls || finalToolCalls.length === 0) && agentExecutor.value) {
            const intentToolCall = _detectGISIntent(userMsg);
            if (intentToolCall) {
                finalToolCalls = [intentToolCall];
                isIntentFallback = true;
            }
        }

        if (finalToolCalls && finalToolCalls.length > 0 && agentExecutor.value) {
            const cleanReply = AgentExecutor.stripToolCallBlocks(reply);

            if (!isIntentFallback && cleanReply && cleanReply.length > 5) {
                messages.value[assistantMsgIndex].content = cleanReply;
            }

            const { toolResultSummary } = await _executeToolsAndUpdateUI(finalToolCalls, assistantMsgIndex);

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
                    messages.value.push({ role: 'assistant', content: `✅ 操作完成：\n${toolResultSummary}` });
                }
            } catch {
                messages.value.push({ role: 'assistant', content: `✅ 操作完成：\n${toolResultSummary}` });
            }
        } else {
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
    gisCommander.value?.dispose?.();
});

const initGISCommander = () => {
    if (!olMapRef?.value) return;

    try {
        gisCommander.value = createGISCommander({
            mapInstanceRef: olMapRef,
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

const _getToolDisplayName = (name, args = {}) => {
    const displayNames = {
        zoom_to_extent: '缩放到指定范围',
        search_and_zoom: `定位到 "${args.query || '未知位置'}"`,
        switch_basemap: `切换到底图：${args.name || '自定义图源'}`,
    };
    return displayNames[name] || `执行工具：${name}`;
};

onMounted(async () => {
    const tokens = await loadRuntimeMapTokens();
    const nextTiandituTk = String(tokens?.tiandituTk || '').trim();
    if (nextTiandituTk) {
        runtimeTiandituTk.value = nextTiandituTk;
    }

    await _loadDefaultAIConfig();
    await reloadAgentConfig(false);
    await loadAvailableModels();

    try {
        await ensureMarkdownLibs();
    } catch (_e) {
        // ignore
    }

    initGISCommander();
});

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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background-color: #f9fbf9;
}

.chat-header {
    background: white;
    color: var(--text-primary);
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eef2ef;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.service-status {
    border-bottom: 1px solid #eef2ef;
    background: #ffffff;
    padding: 10px 16px;
    flex: 0 0 auto;
}

/* 配置面板 + 服务状态的可滚动包裹层，
   避免配置面板展开时 service-status 被 overflow:hidden 裁切 */
.scroll-top-section {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.user-config-panel {
    border-bottom: 1px solid #eef2ef;
    background: #fbfdfb;
    padding: 12px 16px;
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
.user-config-item select,
.user-config-item .model-input {
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

/* Model 输入框 + 下拉按钮组合行 */
.model-input-row {
    position: relative;
    display: flex;
    gap: 4px;
    align-items: center;
}

/* 下拉切换按钮（▾） */
.model-dropdown-btn {
    padding: 6px 8px;
    border: 1px solid #d7e5dc;
    border-radius: 6px;
    background-color: white;
    cursor: pointer;
    font-size: 12px;
    color: #4a6b57;
    transition: all 0.2s;
    line-height: 1;
}

.model-dropdown-btn:hover {
    border-color: var(--brand-primary);
    background-color: #f0f7f2;
}

/* 下拉列表面板 */
.model-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 40px;
    margin-top: 4px;
    background: white;
    border: 1px solid #d7e5dc;
    border-radius: 6px;
    max-height: 220px;
    overflow-y: auto;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

/* 下拉列表项 */
.model-dropdown-item {
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.15s;
}

.model-dropdown-item:hover {
    background: #f0f7f2;
    color: var(--brand-primary-dark);
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

/* ========== 优化滚动条与背景 ========== */
.chat-body {
    flex: 1;
    padding: 20px 16px;
    overflow-y: auto;
    background: #f4f7f5;
    scroll-behavior: smooth;
}

.chat-body::-webkit-scrollbar {
    width: 6px;
}
.chat-body::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
}
.chat-body::-webkit-scrollbar-track {
    background-color: transparent;
}

.message {
    margin-bottom: 16px;
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
    padding: 10px 14px;
    border-radius: 10px;
    background: #f0f7ff;
    border: 1px solid #d0e3f7;
    font-size: 0.88em;
    max-width: 85%;
    box-shadow: 0 2px 6px rgba(0,0,0,0.02);
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
    color: #1e3a5f;
    font-weight: 500;
}

.tool-status-message {
    color: #5c6b73;
    font-size: 0.9em;
    word-break: break-all;
}

/* ========== 普通气泡样式基础 ========== */
.message-content {
    max-width: 85%;
    padding: 12px 16px;
    border-radius: 16px;
    font-size: 0.95em;
    line-height: 1.6;
    box-shadow: 0 2px 8px rgba(34, 50, 38, 0.04);
    word-wrap: break-word;
}

.message.user .message-content {
    background: var(--brand-primary);
    color: white;
    border-bottom-right-radius: 4px;
    white-space: pre-wrap; /* 用户原生输入保持换行 */
}

/* ========== AI Assistant 深度优化（Markdown渲染容器） ========== */
.message.assistant .message-content {
    background: #ffffff;
    color: #2c3e50;
    border-bottom-left-radius: 4px;
    border: 1px solid rgba(215, 229, 220, 0.5);
    width: 100%; /* 防止表格等块级元素撑宽失败 */
    box-sizing: border-box;
}

/* 当作为 Markdown 渲染容器时，覆盖 white-space 以免与 HTML 结构冲突 */
.markdown-body {
    white-space: normal !important;
}

.think-panel {
    max-width: 85%;
    margin-top: 8px;
    border: 1px dashed #cbdad0;
    border-radius: 10px;
    padding: 8px 14px;
    background: #f8faf9;
    color: #617468;
    font-size: 0.88em;
}

.think-panel summary {
    cursor: pointer;
    user-select: none;
    font-weight: 600;
    color: #4a5d51;
    padding: 2px 0;
    transition: color 0.2s;
}
.think-panel summary:hover {
    color: var(--brand-primary);
}
.think-panel[open] summary {
    margin-bottom: 6px;
}

.think-content {
    margin: 0;
    padding: 10px 14px;
    background: #f8faf9;
    border-radius: 8px;
    border: 1px solid #e8efea;
    max-height: 400px;
    overflow-y: auto;
    line-height: 1.6;
    font-size: 0.9em;
    color: #4a5d51;
}

/* Think 内部的 markdown 也应继承排版 */
.think-content p { margin: 0 0 8px 0; }
.think-content p:last-child { margin-bottom: 0; }
.think-content code:not(pre code) {
    background: #e8efea;
    color: #5a6e62;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.88em;
}
.think-content pre {
    background: #2d3740;
    color: #e6edf3;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 0.85em;
    margin: 6px 0;
}

/* ============================================================
    Markdown 元素精细排版美化 (Beautiful Text Rendering)
============================================================ */

/* 标题样式 */
.markdown-body :where(h1, h2, h3, h4, h5, h6) {
    margin-top: 14px;
    margin-bottom: 8px;
    color: #1a2a20;
    font-weight: 600;
    line-height: 1.4;
}
.markdown-body h1 { font-size: 1.4em; border-bottom: 1px solid #eef2ef; padding-bottom: 4px; }
.markdown-body h2 { font-size: 1.25em; border-bottom: 1px solid #eef2ef; padding-bottom: 3px; }
.markdown-body h3 { font-size: 1.15em; }
.markdown-body h4 { font-size: 1em; }

/* 段落间距 */
.markdown-body p {
    margin: 0 0 10px 0;
    color: #2c3e50;
}
.markdown-body p:last-child {
    margin-bottom: 0;
}

/* 超链接 */
.markdown-body a {
    color: var(--brand-primary);
    text-decoration: none;
    font-weight: 500;
    border-bottom: 1px dashed var(--brand-primary);
    transition: color 0.2s;
}
.markdown-body a:hover {
    color: var(--brand-primary-dark);
}

/* 列表排版 */
.markdown-body ul,
.markdown-body ol {
    margin: 0 0 10px 0;
    padding-left: 1.5em;
}
.markdown-body li {
    margin-bottom: 4px;
}
.markdown-body li:last-child {
    margin-bottom: 0;
}

/* 行内代码 */
.markdown-body code:not(pre code) {
    background: #f0f4f1;
    color: #c0392b;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    font-weight: 500;
}

/* 全局代码块 - 暗色主题匹配 highlight.js github-dark-dimmed */
.markdown-body pre {
    background: #22272e;
    color: #adbac7;
    padding: 14px 14px 14px 14px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.88em;
    line-height: 1.6;
    margin: 12px 0;
    box-shadow: inset 0 1px 4px rgba(0,0,0,0.25);
    position: relative;
    border: 1px solid #373e47;
}
.markdown-body pre code.hljs {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
}

/* 语言标签徽章 - 左上角 */
.markdown-body pre .code-lang-badge {
    position: absolute;
    top: 0;
    left: 0;
    background: #373e47;
    color: #768390;
    padding: 2px 10px;
    font-size: 0.72em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: 0.04em;
    text-transform: lowercase;
    border-radius: 8px 0 6px 0;
    border-bottom: 1px solid #444c56;
    border-right: 1px solid #444c56;
    user-select: none;
    line-height: 1.6;
}

/* 当有语言标签时，代码内容需要顶部留白 */
.markdown-body pre[data-lang] {
    padding-top: 30px;
}

/* 代码复制按钮 */
.markdown-body pre .code-copy-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: #768390;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 0.76em;
    cursor: pointer;
    transition: all 0.2s;
    opacity: 0; /* 默认隐藏，鼠标滑过显示 */
    z-index: 1;
}

.markdown-body pre:hover .code-copy-btn {
    opacity: 1;
}

.markdown-body pre .code-copy-btn:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #cdd9e5;
}

.markdown-body pre .code-copy-btn.copied {
    background: #347d39;
    border-color: #347d39;
    color: #cdd9e5;
    opacity: 1;
}

/* highlight.js github-dark-dimmed 主题 token 颜色覆盖（scoped 内需穿透） */
.markdown-body pre .hljs-comment,
.markdown-body pre .hljs-quote { color: #768390; font-style: italic; }
.markdown-body pre .hljs-keyword,
.markdown-body pre .hljs-selector-tag { color: #f47067; }
.markdown-body pre .hljs-string,
.markdown-body pre .hljs-addition { color: #6cb6ff; }
.markdown-body pre .hljs-number,
.markdown-body pre .hljs-literal { color: #6cb6ff; }
.markdown-body pre .hljs-built_in,
.markdown-body pre .hljs-type { color: #f69d50; }
.markdown-body pre .hljs-function,
.markdown-body pre .hljs-title { color: #dcbdfb; }
.markdown-body pre .hljs-attr,
.markdown-body pre .hljs-attribute { color: #6cb6ff; }
.markdown-body pre .hljs-variable,
.markdown-body pre .hljs-template-variable { color: #f69d50; }
.markdown-body pre .hljs-regexp,
.markdown-body pre .hljs-link { color: #96d0ff; }
.markdown-body pre .hljs-symbol,
.markdown-body pre .hljs-bullet { color: #f69d50; }
.markdown-body pre .hljs-meta { color: #6cb6ff; }
.markdown-body pre .hljs-deletion { color: #f47067; }
.markdown-body pre .hljs-selector-class { color: #6cb6ff; }
.markdown-body pre .hljs-selector-id { color: #dcbdfb; }
.markdown-body pre .hljs-tag { color: #8ddb8c; }
.markdown-body pre .hljs-name { color: #8ddb8c; }
.markdown-body pre .hljs-params { color: #adbac7; }

/* GFM 任务列表 checkbox 样式 */
.markdown-body ul.contains-task-list {
    list-style: none;
    padding-left: 0.5em;
}
.markdown-body li.task-list-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}
.markdown-body li.task-list-item input[type="checkbox"] {
    margin-top: 5px;
    accent-color: var(--brand-primary, #2d5016);
    width: 15px;
    height: 15px;
    flex-shrink: 0;
}

/* 水平分割线 */
.markdown-body hr {
    border: none;
    height: 1px;
    background: linear-gradient(to right, transparent, #d7e5dc, transparent);
    margin: 16px 0;
}

/* 引用块 (Blockquote) */
.markdown-body blockquote {
    border-left: 4px solid var(--brand-primary);
    margin: 12px 0;
    padding: 8px 14px;
    background: #f4f9f5;
    color: #4f6f5c;
    border-radius: 0 6px 6px 0;
}
.markdown-body blockquote p {
    color: #4f6f5c;
    margin: 0;
}

/* 现代精致表格 (Modern Elegant Table) */
.markdown-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 0.92em;
    overflow-x: auto;
    display: block; /* 移动端/窄屏自适应 */
}

.markdown-body th,
.markdown-body td {
    border: 1px solid #e1e8e3;
    padding: 8px 12px;
    text-align: left;
    line-height: 1.4;
}

.markdown-body thead th {
    background-color: #f5f8f6;
    color: #1a2a20;
    font-weight: 600;
}

.markdown-body tbody tr:nth-child(even) {
    background-color: #fbfdfb;
}

.markdown-body tbody tr:hover {
    background-color: #f2f7f3;
}

.markdown-body img {
    max-width: 100%;
    border-radius: 8px;
    margin: 8px 0;
    box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}

/* ========== 页脚区域 ========== */
.chat-footer {
    padding: 12px 16px;
    border-top: 1px solid #eef2ef;
    background: white;
    display: flex;
    gap: 8px;
    align-items: flex-end;
}

textarea {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid #d7e5dc;
    border-radius: 8px;
    resize: none;
    outline: none;
    font-family: inherit;
    font-size: 0.95em;
    transition: all 0.2s;
    min-height: 40px;
    box-sizing: border-box;
}

textarea:focus {
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.08);
}

.chat-footer button {
    padding: 0 18px;
    height: 38px;
    background: var(--brand-primary);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.92em;
    transition: background 0.2s;
}

.chat-footer button:hover {
    background: var(--brand-primary-dark, #1b3522);
}

.chat-footer button:disabled {
    background: #cbdad0;
    cursor: not-allowed;
}

.hint {
    color: var(--text-secondary);
    font-size: 0.85em;
    margin-top: 4px;
    display: block;
}
</style>