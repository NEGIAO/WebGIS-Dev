 /**
 * AI Agent / 聊天接口
 */

import backendAPI from './client';

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
export async function apiAdminUpdateDefaultAIConfig(payload = {}) {
    const body = {};
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
 * @param {Object} payload - { message, history, location_context?, override_model? }
 * @returns {Promise}
 */
export async function apiAgentChatDefaultProxy(payload = {}) {
    const body = {
        message: String(payload.message || '').trim(),
        history: normalizeChatHistory(payload.history),
        location_context: String(payload.location_context || '').trim(),
    };

    if (payload.override_model) body.override_model = String(payload.override_model).trim();
    if (typeof payload.override_timeout_seconds !== 'undefined' && payload.override_timeout_seconds !== null)
        body.override_timeout_seconds = Number(payload.override_timeout_seconds);
    if (typeof payload.override_max_tokens !== 'undefined' && payload.override_max_tokens !== null)
        body.override_max_tokens = Number(payload.override_max_tokens);
    if (typeof payload.override_temperature !== 'undefined' && payload.override_temperature !== null)
        body.override_temperature = Number(payload.override_temperature);

    return backendAPI.post('/api/agent/chat/default-proxy', body, {
        timeout: 60000,
    });
}

/**
 * 规范化聊天历史：清洗、过滤无效消息、截断到最近 12 条
 * @param {Array} rawHistory - 原始历史消息
 * @returns {Array<{role: string, content: string}>}
 */
function normalizeChatHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) return [];
    return rawHistory
        .map((item) => ({
            role: String(item?.role || '').trim(),
            content: String(item?.content || '').trim(),
        }))
        .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.content)
        .slice(-12);
}

export async function apiAgentGetChatConfig() {
    return backendAPI.get('/api/agent/chat/config');
}

export async function apiAgentGetUserConfig() {
    return backendAPI.get('/api/agent/user-config');
}

export async function apiAgentUpdateUserConfig(payload = {}) {
    const safePayload = {};

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
    if (typeof payload.clear_personal_key !== 'undefined')
        safePayload.clear_personal_key = !!payload.clear_personal_key;
    if (typeof payload.reset_provider_overrides !== 'undefined')
        safePayload.reset_provider_overrides = !!payload.reset_provider_overrides;

    return backendAPI.post('/api/agent/user-config', safePayload);
}

export async function apiAgentChatCompletions(payload = {}) {
    const history = normalizeChatHistory(payload.history);

    const body = {
        message: String(payload.message || '').trim(),
        history,
        location_context: String(payload.location_context || '').trim(),
    };

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

    return backendAPI.post('/api/agent/chat/completions', body, {
        timeout: 60000, // LLM 推理可能需要较长时间
    });
}

export async function apiAgentListModels(options = {}) {
    const params = {};
    if (options.override_base_url) {
        params.override_base_url = String(options.override_base_url).trim();
    }
    if (options.override_api_key) {
        params.override_api_key = String(options.override_api_key).trim();
    }
    return backendAPI.get('/api/agent/models', { params });
}

export async function apiAgentSaveModelPreference(preferredModel) {
    return backendAPI.patch('/api/agent/user/preference', {
        preferred_model: String(preferredModel || '').trim(),
    });
}

/**
 * 用户个人 API Key 代理聊天（后端转发，绕过浏览器 CORS 限制）
 *
 * 当用户配置了个人 API Key 时，通过后端代理转发 LLM 请求，
 * 避免浏览器直接调用外部 LLM API 遇到 CORS 拦截。
 * 不消耗平台配额（用户使用自己的 API Key）。
 */
export async function apiAgentChatProxy(payload = {}) {
    const body = {
        message: String(payload.message || '').trim(),
        history: normalizeChatHistory(payload.history),
        location_context: String(payload.location_context || '').trim(),
        api_key: String(payload.api_key || '').trim(),
        base_url: String(payload.base_url || '').trim(),
        model: String(payload.model || '').trim(),
    };

    if (payload.system_prompt) body.system_prompt = String(payload.system_prompt).trim();
    if (typeof payload.timeout_seconds !== 'undefined' && payload.timeout_seconds !== null)
        body.timeout_seconds = Number(payload.timeout_seconds);
    if (typeof payload.max_tokens !== 'undefined' && payload.max_tokens !== null)
        body.max_tokens = Number(payload.max_tokens);
    if (typeof payload.temperature !== 'undefined' && payload.temperature !== null)
        body.temperature = Number(payload.temperature);

    return backendAPI.post('/api/agent/chat/proxy', body, {
        timeout: 60000, // LLM 推理可能需要较长时间
    });
}
