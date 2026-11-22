 /**
 * AI Agent / 聊天接口
 */

import backendAPI from './client';
import { AGENT_REQUEST_TIMEOUT_MS } from '../../config/publicRuntime';
import { getBackendBearerToken, getOrCreateGuestDeviceId, getPresenceClientId } from '@common/user/services/auth';
import { getGuestToken } from '@common/user/services/guestTokenStore';

/**
 * 管理员：获取默认 AI 专属配置（含 api_key 完整值）
 * @returns {Promise<{data: {api_key: string, base_url: string, model: string, is_configured: boolean}}>}
 */
export async function apiAdminGetDefaultAIConfig() {
    return backendAPI.get('/api/admin/agent/default-ai-config');
}

/**
 * 管理员：更新默认 AI 专属配置（api_key / base_url / model）
 * @param {Object} payload - { api_key?, base_url?, model? }
 * @returns {Promise}
 */
export async function apiAdminUpdateDefaultAIConfig(payload: any = {}) {
    const body: Record<string, any> = {};
    if (payload.api_key !== undefined) body.api_key = String(payload.api_key || '').trim();
    if (payload.base_url !== undefined) body.base_url = String(payload.base_url || '').trim();
    if (payload.model !== undefined) body.model = String(payload.model || '').trim();
    return backendAPI.post('/api/admin/agent/default-ai-config', body);
}

/**
 * 获取默认 AI 配置（不含 api_key，仅供前端展示和构建代理请求）
 * @returns {Promise<{data: {base_url: string, model: string, is_configured: boolean}}>}
 */
export async function apiGetDefaultAIConfig() {
    return backendAPI.get('/api/agent/default-ai-config');
}

/**
 * 使用管理员配置的默认 AI 专属 Key 代理聊天（api_key 存储在后端数据库，前端无需传 key）
 * @param {Object} payload - { message, history, location_context?, map_context?, override_model?, tools?, tool_choice? }
 * @param {Array} [payload.tools] - Function Calling 工具声明（OpenAI 格式），后端支持时透传给 LLM
 * @param {string} [payload.tool_choice] - 工具选择策略，如 'auto'、'none'、'required'
 * @returns {Promise}
 */
function buildDefaultProxyBody(payload: any = {}): Record<string, any> {
    const body: Record<string, any> = {
        message: String(payload.message || '').trim(),
        history: normalizeChatHistory(payload.history),
        location_context: String(payload.location_context || '').trim(),
    };

    if (payload.map_context && typeof payload.map_context === 'object') {
        const mapContext = sanitizeMapContext(payload.map_context);
        if (mapContext) body.map_context = mapContext;
    }

    if (payload.override_model) body.override_model = String(payload.override_model).trim();
    if (typeof payload.override_timeout_seconds !== 'undefined' && payload.override_timeout_seconds !== null)
        body.override_timeout_seconds = Number(payload.override_timeout_seconds);
    if (typeof payload.override_max_tokens !== 'undefined' && payload.override_max_tokens !== null)
        body.override_max_tokens = Number(payload.override_max_tokens);
    if (typeof payload.override_temperature !== 'undefined' && payload.override_temperature !== null)
        body.override_temperature = Number(payload.override_temperature);
    if (typeof payload.override_top_p !== 'undefined' && payload.override_top_p !== null)
        body.override_top_p = Number(payload.override_top_p);
    if (typeof payload.override_extra_body !== 'undefined' && payload.override_extra_body !== null)
        body.override_extra_body = payload.override_extra_body;

    // Function Calling 支持：透传工具声明给后端
    if (Array.isArray(payload.tools) && payload.tools.length > 0) {
        body.tools = payload.tools;
    }
    if (payload.tool_choice) {
        body.tool_choice = String(payload.tool_choice).trim();
    }

    return body;
}

/**
 * 使用管理员配置的默认 AI 专属 Key 代理聊天（api_key 存储在后端数据库，前端无需传 key）
 * @param {Object} payload - { message, history, location_context?, map_context?, override_model?, tools?, tool_choice? }
 * @returns {Promise}
 */
export async function apiAgentChatDefaultProxy(payload: any = {}) {
    const body = buildDefaultProxyBody(payload);
    return backendAPI.post('/api/agent/chat/default-proxy', body, {
        timeout: AGENT_REQUEST_TIMEOUT_MS,
    });
}

/**
 * 使用管理员配置的默认 AI 专属 Key 流式代理聊天（V3.7.7 批次 E）。
 * SSE 事件协议：meta / delta / final / error，终止帧 data: [DONE]。
 * @param {Object} payload - 与 apiAgentChatDefaultProxy 相同
 * @param {Object} handlers - { onDelta?: (accumulated: string) => void, signal?: AbortSignal }
 * @returns {Promise<{reply: string, usedModel: string, rawData: Object|null, quota: null, cost: 0, streamed: true}>}
 */
async function agentChatStream(
    path: string,
    body: Record<string, any>,
    handlers: {
        onDelta?: (accumulated: string) => void;
        signal?: AbortSignal;
    } = {},
) {
    const base = String((backendAPI as any).defaults?.baseURL || '').replace(/\/$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getBackendBearerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const deviceId = getOrCreateGuestDeviceId();
    if (deviceId) headers['X-Guest-Device-Id'] = deviceId;
    // V3.7.7 批次 F 修正：游客签名身份随流式请求携带（X-Guest-Token），与 axios
    // 请求同身份——缺失时流式请求回落派生桶，同一游客在在线统计/配额桶中裂成两人
    const guestToken = getGuestToken();
    if (guestToken) headers['X-Guest-Token'] = guestToken;
    const clientId = getPresenceClientId();
    if (clientId) headers['X-Presence-Client-Id'] = clientId;

    const resp = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: handlers.signal,
    });
    if (!resp.ok || !resp.body) {
        let detail = `HTTP ${resp.status}`;
        try {
            const j = await resp.json();
            detail = String(j?.detail?.message || j?.detail || detail);
        } catch {
            /* 保留状态码文案 */
        }
        const err: any = new Error(detail);
        err.status = resp.status;
        throw err;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let reply = '';
    let usedModel = '';
    let rawData: any = null;
    let quota: any = null;
    let cost = 0;
    let streamError = '';
    let done = false;

    while (!done) {
        const { value, done: rdDone } = await reader.read();
        if (rdDone) break;
        buffer += decoder.decode(value, { stream: true });
        let frameEnd: number;
        while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, frameEnd);
            buffer = buffer.slice(frameEnd + 2);
            for (const line of frame.split('\n')) {
                if (!line.startsWith('data:')) continue;
                const dataStr = line.slice(5).trim();
                if (dataStr === '[DONE]') {
                    done = true;
                    break;
                }
                try {
                    const evt = JSON.parse(dataStr);
                    if (evt.type === 'delta') {
                        reply += String(evt.delta || '');
                        handlers.onDelta?.(reply);
                    } else if (evt.type === 'meta') {
                        usedModel = String(evt.model || usedModel);
                    } else if (evt.type === 'final') {
                        reply = String(evt.reply ?? reply);
                        rawData = evt.rawData || null;
                        usedModel = String(evt.model || usedModel);
                        quota = evt.quota ?? null;
                        cost = Number(evt.cost) || 0;
                    } else if (evt.type === 'error') {
                        streamError = String(evt.message || 'upstream error');
                    }
                } catch {
                    /* 无法解析的行静默跳过 */
                }
            }
            if (done) break;
        }
    }

    if (streamError) {
        const err: any = new Error(streamError);
        err.isStreamError = true;
        throw err;
    }
    return { reply: reply.trim(), usedModel, rawData, quota, cost, streamed: true as const };
}

/** 默认 AI 通道流式（V3.7.7 批次 E） */
export async function defaultProxyChatStream(payload: any = {}, handlers: {
    onDelta?: (accumulated: string) => void;
    signal?: AbortSignal;
} = {}) {
    return agentChatStream('/api/agent/chat/default-proxy/stream', buildDefaultProxyBody(payload), handlers);
}

/**
 * 个人 Key 通道流式（V3.7.7 批次 F）：使用自备 Key，不消耗平台配额。
 */
export async function apiAgentChatProxyStream(payload: any = {}, handlers: {
    onDelta?: (accumulated: string) => void;
    signal?: AbortSignal;
} = {}) {
    return agentChatStream('/api/agent/chat/proxy/stream', buildAgentProxyBody(payload), handlers);
}

/**
 * 后端代理通道流式（V3.7.7 批次 F）：配额语义与非流式一致（预检 429 + 按 usage 折算扣费）。
 */
export async function apiAgentChatCompletionsStream(payload: any = {}, handlers: {
    onDelta?: (accumulated: string) => void;
    signal?: AbortSignal;
} = {}) {
    return agentChatStream('/api/agent/chat/completions/stream', buildAgentCompletionsBody(payload), handlers);
}

/**
 * 规范化聊天历史：清洗、过滤无效消息、截断到最近 20 条
 * 允许 user/assistant 两种角色（system 由后端统一管理，tool 角色暂未使用）
 * @param {Array} rawHistory - 原始历史消息
 * @returns {Array<{role: string, content: string}>}
 */
function normalizeChatHistory(rawHistory: any) {
    if (!Array.isArray(rawHistory)) return [];
    return rawHistory
        .map((item) => ({
            role: String(item?.role || '').trim(),
            content: String(item?.content || '').trim(),
        }))
        .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.content)
        .slice(-20);
}

/**
 * Limit the serialized AgentMapContextV1 payload and reject non-JSON values.
 * @param {Object} rawContext - normalized AgentMapContextV1 snapshot
 * @returns {Object|null} 安全 JSON 对象
 */
function sanitizeMapContext(rawContext: any) {
    try {
        const normalized = JSON.parse(JSON.stringify(rawContext || {}));
        const jsonText = JSON.stringify(normalized);
        return jsonText.length <= 4096 ? normalized : null;
    } catch {
        return null;
    }
}

export async function apiAgentGetChatConfig() {
    return backendAPI.get('/api/agent/chat/config');
}

export async function apiAgentGetUserConfig() {
    return backendAPI.get('/api/agent/user-config');
}

export async function apiAgentUpdateUserConfig(payload: any = {}) {
    const safePayload: Record<string, any> = {};

    if ('api_key' in payload) safePayload.api_key = String(payload.api_key || '');
    if (payload.base_url) safePayload.base_url = String(payload.base_url).trim();
    if (payload.model) safePayload.model = String(payload.model).trim();
    if (payload.system_prompt) safePayload.system_prompt = String(payload.system_prompt).trim();
    if (typeof payload.timeout_seconds !== 'undefined')
        safePayload.timeout_seconds = Number(payload.timeout_seconds);
    if (typeof payload.max_tokens !== 'undefined')
        safePayload.max_tokens = Number(payload.max_tokens);
    if (typeof payload.temperature !== 'undefined')
        safePayload.temperature = Number(payload.temperature);
    if (typeof payload.top_p !== 'undefined')
        safePayload.top_p = Number(payload.top_p);
    if (typeof payload.extra_body !== 'undefined')
        safePayload.extra_body = payload.extra_body;
    if (typeof payload.clear_personal_key !== 'undefined')
        safePayload.clear_personal_key = !!payload.clear_personal_key;
    if (typeof payload.reset_provider_overrides !== 'undefined')
        safePayload.reset_provider_overrides = !!payload.reset_provider_overrides;

    return backendAPI.post('/api/agent/user-config', safePayload);
}

/**
 * 后端代理模式聊天
 * @param {Object} payload - { message, history, location_context?, tools?, tool_choice?, ... }
 * @param {Array} [payload.tools] - Function Calling 工具声明（OpenAI 格式）
 * @param {string} [payload.tool_choice] - 工具选择策略
 * @returns {Promise}
 */
function buildAgentCompletionsBody(payload: any = {}): Record<string, any> {
    const history = normalizeChatHistory(payload.history);

    const body: Record<string, any> = {
        message: String(payload.message || '').trim(),
        history,
        location_context: String(payload.location_context || '').trim(),
    };

    if (payload.map_context && typeof payload.map_context === 'object') {
        const mapContext = sanitizeMapContext(payload.map_context);
        if (mapContext) body.map_context = mapContext;
    }

    // 传递用户配置面板中尚未保存的参数覆盖
    if (payload.override_base_url) {
        body.override_base_url = String(payload.override_base_url).trim();
    }
    if (payload.override_api_key) {
        body.override_api_key = String(payload.override_api_key).trim();
    }
    if (payload.override_model) {
        body.override_model = String(payload.override_model).trim();
    }
    if (typeof payload.override_timeout_seconds !== 'undefined' && payload.override_timeout_seconds !== null) {
        body.override_timeout_seconds = Number(payload.override_timeout_seconds);
    }
    if (typeof payload.override_max_tokens !== 'undefined' && payload.override_max_tokens !== null) {
        body.override_max_tokens = Number(payload.override_max_tokens);
    }
    if (typeof payload.override_temperature !== 'undefined' && payload.override_temperature !== null) {
        body.override_temperature = Number(payload.override_temperature);
    }
    if (typeof payload.override_top_p !== 'undefined' && payload.override_top_p !== null) {
        body.override_top_p = Number(payload.override_top_p);
    }
    if (typeof payload.override_extra_body !== 'undefined' && payload.override_extra_body !== null) {
        body.override_extra_body = payload.override_extra_body;
    }

    // Function Calling 支持：透传工具声明给后端
    if (Array.isArray(payload.tools) && payload.tools.length > 0) {
        body.tools = payload.tools;
    }
    if (payload.tool_choice) {
        body.tool_choice = String(payload.tool_choice).trim();
    }

    return body;
}

/**
 * 后端代理模式聊天（非流式）
 */
export async function apiAgentChatCompletions(payload: any = {}) {
    const body = buildAgentCompletionsBody(payload);
    return backendAPI.post('/api/agent/chat/completions', body, {
        timeout: AGENT_REQUEST_TIMEOUT_MS, // LLM 推理可能需要较长时间
    });
}

export async function apiAgentListModels(options: any = {}) {
    const params: Record<string, any> = {};
    if (options.use_default_ai) {
        params.use_default_ai = true;
    }
    if (options.override_base_url) {
        params.override_base_url = String(options.override_base_url).trim();
    }
    if (options.override_api_key) {
        params.override_api_key = String(options.override_api_key).trim();
    }
    return backendAPI.get('/api/agent/models', { params });
}

export async function apiAgentSaveModelPreference(preferredModel: any) {
    return backendAPI.patch('/api/agent/user/preference', {
        preferred_model: String(preferredModel || '').trim(),
    });
}

/**
 * 用户个人 API Key 聊天（后端转发，解决浏览器跨域调用限制）
 *
 * 当用户配置了个人 API Key 时，通过后端代理转发 LLM 请求，
 * 避免浏览器直接调用外部 LLM API 遇到 CORS 拦截。
 * 不消耗平台配额（用户使用自己的 API Key）。
 *
 * @param {Object} payload - { message, history, api_key, base_url, model, tools?, tool_choice?, ... }
 * @param {Array} [payload.tools] - Function Calling 工具声明（OpenAI 格式）
 * @param {string} [payload.tool_choice] - 工具选择策略
 * @returns {Promise}
 */
function buildAgentProxyBody(payload: any = {}): Record<string, any> {
    const body: Record<string, any> = {
        message: String(payload.message || '').trim(),
        history: normalizeChatHistory(payload.history),
        location_context: String(payload.location_context || '').trim(),
        api_key: String(payload.api_key || '').trim(),
        base_url: String(payload.base_url || '').trim(),
        model: String(payload.model || '').trim(),
    };

    if (payload.map_context && typeof payload.map_context === 'object') {
        const mapContext = sanitizeMapContext(payload.map_context);
        if (mapContext) body.map_context = mapContext;
    }

    if (payload.system_prompt) body.system_prompt = String(payload.system_prompt).trim();
    if (typeof payload.timeout_seconds !== 'undefined' && payload.timeout_seconds !== null)
        body.timeout_seconds = Number(payload.timeout_seconds);
    if (typeof payload.max_tokens !== 'undefined' && payload.max_tokens !== null)
        body.max_tokens = Number(payload.max_tokens);
    if (typeof payload.temperature !== 'undefined' && payload.temperature !== null)
        body.temperature = Number(payload.temperature);
    if (typeof payload.top_p !== 'undefined' && payload.top_p !== null)
        body.top_p = Number(payload.top_p);
    if (typeof payload.extra_body !== 'undefined' && payload.extra_body !== null)
        body.extra_body = payload.extra_body;

    // Function Calling 支持：透传工具声明给后端
    if (Array.isArray(payload.tools) && payload.tools.length > 0) {
        body.tools = payload.tools;
    }
    if (payload.tool_choice) {
        body.tool_choice = String(payload.tool_choice).trim();
    }

    return body;
}

/**
 * 个人 Key 聊天（后端转发，非流式）
 */
export async function apiAgentChatProxy(payload: any = {}) {
    const body = buildAgentProxyBody(payload);
    return backendAPI.post('/api/agent/chat/proxy', body, {
        timeout: AGENT_REQUEST_TIMEOUT_MS, // LLM 推理可能需要较长时间
    });
}
