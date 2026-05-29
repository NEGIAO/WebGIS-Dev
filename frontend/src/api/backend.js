/**
 * 后端 API 客户端
 *
 * 此文件提供与后端 FastAPI 服务通信的客户端
 * 支持本地开发和生产环境切换
 *
 * 环境变量：
 *   - VITE_BACKEND_URL: 后端 API 地址
 *     本地开发: http://localhost:7860（与 Hugging Face Spaces 本地一致时可改 .env）
 *     生产环境: https://negiao-webgis.hf.space
 */

import axios from 'axios';
import {
    clearAuthSession,
    getAuthToken,
    getOrCreateGuestDeviceId,
    readShareModeFromUrl,
} from '../utils/auth';

/** 与 Vite 环境变量一致的后端根地址（无尾部斜杠），供 axios 与 SSE 等共用 */
export const BACKEND_BASE_URL = String(
    import.meta.env.VITE_BACKEND_URL || 'http://localhost:7860',
).replace(/\/$/, '');

const backendURL = BACKEND_BASE_URL;

if (import.meta.env.DEV) {
    console.warn('[Backend] 后端 URL:', backendURL);
}

/**
 * 后端 API 客户端实例
 * 自动处理请求/响应拦截
 */
const backendAPI = axios.create({
    baseURL: backendURL,
    timeout: 8000,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * 请求拦截器
 * 用于添加全局请求头、认证信息等
 */
backendAPI.interceptors.request.use(
    (config) => {
        const token = getAuthToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        if (!token && readShareModeFromUrl()) {
            config.headers['X-Share-Mode'] = '1';

            const guestDeviceId = getOrCreateGuestDeviceId();
            if (guestDeviceId) {
                config.headers['X-Guest-Device-Id'] = guestDeviceId;
            }
        }

        return config;
    },
    (error) => {
        console.error('[Backend API] 请求错误:', error);
        return Promise.reject(error);
    },
);

/**
 * 响应拦截器
 * 统一处理响应格式和错误
 */
backendAPI.interceptors.response.use(
    (response) => {
        // Keep full response for binary downloads so callers can read headers.
        if (response?.config?.responseType === 'blob' || response?.config?.responseType === 'arraybuffer') {
            return response;
        }

        // 返回数据中的 data 字段
        const { data } = response;

        // 检查是否是统一的 API 响应格式
        if (data && typeof data === 'object' && 'code' in data) {
            if (data.code === 200) {
                // 成功响应
                return data.data || data;
            } else {
                // 错误响应
                const error = new Error(data.message || '请求失败,额度可能已用完');
                error.code = data.code;
                error.data = data;
                return Promise.reject(error);
            }
        }

        // 返回原始数据
        return data;
    },
    (error) => {
        // 处理网络错误、超时等
        let message = '请求失败,请稍后重试';
        let isQuotaExceeded = false;

        if (error.response) {
            // 服务器响应错误
            const { status, data } = error.response;
            const detail = data?.detail;
            if (typeof detail === 'string' && detail.trim()) {
                message = detail.trim();
            } else if (detail && typeof detail === 'object') {
                const nestedMsg = String(detail?.message || detail?.detail || '').trim();
                message = nestedMsg || JSON.stringify(detail);
            } else {
                message = data?.message || `服务器错误 (${status})`;
            }

            if (status === 401) {
                clearAuthSession();
            }

            // ⭐ 特殊处理 429 配额用完（友好提示，不报错）
            if (status === 429) {
                isQuotaExceeded = true;
                // 不输出错误日志
                const apiError = new Error(message);
                apiError.isQuotaExceeded = true;
                apiError.status = status;
                apiError.originalError = error;
                return Promise.reject(apiError);
            }
        } else if (error.request) {
            // 请求已发出但没有收到响应
            // 区分超时错误和网络断开
            if (error.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) {
                message = '请求超时，请稍后重试';
            } else {
                message = '网络异常,请检查您的连接';
            }
        } else {
            // 其他错误
            message = error.message || '未知错误,请稍后重试';
        }

        // 只在非配额用完的情况下输出错误日志
        if (!isQuotaExceeded) {
            console.error('[Backend API] 响应错误:', message, error);
        }

        const apiError = new Error(message);
        apiError.isQuotaExceeded = isQuotaExceeded;
        apiError.originalError = error;
        return Promise.reject(apiError);
    },
);

/**
 * 错误处理工具函数
 * 用于区分配额用完（429）和其他错误
 *
 * @param {Error} error - API 错误对象
 * @param {Function} messageHandler - message 通知函数
 * @param {string} defaultErrorMsg - 默认错误信息
 * @returns {void}
 */
export function handleApiError(error, messageHandler, defaultErrorMsg = '操作失败，请稍后重试') {
    const isQuotaExceeded = error.isQuotaExceeded === true;
    const errorMessage = error.message || defaultErrorMsg;

    if (isQuotaExceeded) {
        // 配额用完：显示友好提示，不报错
        messageHandler.warning(errorMessage, {
            closable: true,
            duration: 0, // 不自动关闭，让用户主动关闭
        });
    } else {
        // 其他错误：正常报错
        messageHandler.error(errorMessage, {
            closable: true,
            duration: 6000,
        });
    }
}

/**
 * 导出 API 客户端实例
 * 使用方式:
 * import backendAPI from '@/api/backend'
 * const result = await backendAPI.get('/api/proxy/amap/geocode/geo', { params: { address } })
 */
export default backendAPI;

/**
 * 认证相关接口
 */
export async function apiAuthCheckUsername(username) {
    return backendAPI.get('/api/auth/check-username', {
        params: { username },
    });
}

export async function apiAuthRegister(username, password, avatarIndex = 0) {
    return backendAPI.post('/api/auth/register', {
        username,
        password,
        avatar_index: avatarIndex,
    });
}

export async function apiAuthLogin(payload) {
    return backendAPI.post('/api/auth/login', payload);
}

export async function apiAuthMe() {
    return backendAPI.get('/api/auth/me');
}

export async function apiAuthLogout() {
    return backendAPI.post('/api/auth/logout');
}

export async function apiAuthChangePassword(currentPassword, newPassword) {
    return backendAPI.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
    });
}

export async function apiAuthChangeAvatar(newAvatarIndex) {
    return backendAPI.post('/api/auth/change-avatar', {
        new_avatar_index: newAvatarIndex,
    });
}

export async function apiAuthGetPreferences() {
    return backendAPI.get('/api/auth/preferences');
}

export async function apiAuthUpdatePreferences(payload = {}) {
    const safePayload = {};
    if ('default_basemap' in payload)
        safePayload.default_basemap = String(payload.default_basemap || '').trim();
    if ('language' in payload) safePayload.language = String(payload.language || '').trim();
    if ('unit_system' in payload)
        safePayload.unit_system = String(payload.unit_system || '').trim();
    if ('preferred_agent_model' in payload)
        safePayload.preferred_agent_model = String(payload.preferred_agent_model || '').trim();

    return backendAPI.post('/api/auth/preferences', safePayload);
}

/**
 * 便捷方法集合
 * 使用这些方法可以更简洁地调用后端 API
 */

/**
 * 地理编码 - 地址→坐标
 * @param {string} address - 地址
 * @param {string} city - 城市（可选）
 * @returns {Promise<{lng, lat, address, adcode}>}
 */
export async function apiGeocode(address, city = '') {
    return backendAPI.get('/api/proxy/amap/geocode/geo', {
        params: {
            address: String(address || '').trim(),
            city: String(city || '').trim(),
        },
    });
}

/**
 * 反向地理编码 - 坐标→地址
 * @param {number} lng - 经度
 * @param {number} lat - 纬度
 * @returns {Promise<{address, province, city, district, adcode}>}
 */
export async function apiReverseGeocode(lng, lat) {
    return backendAPI.get('/api/proxy/amap/geocode/regeo', {
        params: {
            location: `${Number(lng)},${Number(lat)}`,
            extensions: 'base',
            radius: 1000,
            batch: false,
        },
    });
}

/**
 * 获取实时天气
 * @param {string} adcode - 行政区代码
 * @returns {Promise<{weather, temperature, windDirection, windPower, humidity}>}
 */
export async function apiGetWeatherCurrent(adcode) {
    return backendAPI.get('/api/proxy/amap/weather', {
        params: {
            city: String(adcode || '').trim(),
            extensions: 'base',
        },
    });
}

/**
 * 获取天气预报
 * @param {string} adcode - 行政区代码
 * @param {number} days - 天数（默认7天）
 * @returns {Promise<Array>}
 */
export async function apiGetWeatherForecast(adcode, days = 7) {
    void days;
    return backendAPI.get('/api/proxy/amap/weather', {
        params: {
            city: String(adcode || '').trim(),
            extensions: 'all',
        },
    });
}

/**
 * 地名搜索
 * @param {string} keywords - 搜索关键词
 * @param {string} region - 区域（可选）
 * @param {string} service - 服务商（可选: auto|amap|tianditu|nominatim）
 * @returns {Promise<Array>}
 */
export async function apiSearchLocations(keywords, region = '', service = 'auto') {
    const normalizedService = String(service || 'auto')
        .trim()
        .toLowerCase();
    const normalizedKeywords = String(keywords || '').trim();
    const normalizedRegion = String(region || '').trim();

    if (normalizedService === 'nominatim') {
        return backendAPI.get('/api/proxy/search/nominatim', {
            params: {
                keywords: normalizedKeywords,
                limit: 10,
            },
        });
    }

    return backendAPI.get('/api/proxy/amap/place/text', {
        params: {
            keywords: normalizedKeywords,
            city: normalizedRegion,
            page: 1,
            offset: 10,
            extensions: 'base',
        },
    });
}

/**
 * 搜索建议
 * @param {string} keywords - 搜索关键词
 * @param {string} city - 城市（可选）
 * @returns {Promise<Array>}
 */
export async function apiSearchSuggest(keywords, city = '') {
    return backendAPI.get('/api/proxy/amap/place/text', {
        params: {
            keywords: String(keywords || '').trim(),
            city: String(city || '').trim(),
            page: 1,
            offset: 8,
            extensions: 'base',
        },
    });
}

/**
 * IP 定位（已弃用，请使用 apiLocationIpLocate）
 * @deprecated 使用 apiLocationIpLocate 替代
 */
export async function apiGetLocationFromIP(ip = '') {
    return apiLocationIpLocate(ip);
}

/**
 * 统一 IP 定位 API
 * - 优先使用高德 API（精准定位，有用户配额限制）
 * - 高德失败或配额用完时，自动降级到免费服务（Nominatim、IP库等）
 * - 无用户级配额限制，用户可多次请求
 *
 * @param {string} ip - IP 地址（可选，不提供则使用请求 IP）
 * @param {Object} options - 选项
 * @param {boolean} options.preferFreeService - 是否优先使用免费服务（跳过高德，默认 false）
 * @param {boolean} options.silent - 是否静默模式（不显示错误信息，默认 false）
 * @returns {Promise<{
 *   ok: boolean,
 *   status: '0'|'1',
 *   city: string,
 *   province: string,
 *   adcode: string,
 *   extent: [number, number, number, number],
 *   source: 'amap'|'free',
 *   errorMessage?: string
 * }>}
 */
export async function apiLocationIpLocate(ip = '', options = {}) {
    return backendAPI.post('/api/v1/location/ip-locate', {
        ip,
        prefer_free_service: options.preferFreeService || false,
        silent: options.silent || false,
    });
}

/**
 * 反向地理编码（后端代理）
 * - 通过后端统一调度多个服务（高德、天地图、Nominatim 等）
 * - 高德 API 受用户配额限制（单日精准定位请求）
 * - 其他服务无限制
 *
 * @param {number} lng - 经度
 * @param {number} lat - 纬度
 * @param {Object} options - 选项
 * @param {string} options.preferService - 优先服务 ('amap'|'tianditu'|'nominatim'，默认自动选择)
 * @param {boolean} options.silent - 是否静默模式
 * @returns {Promise<{
 *   formattedAddress: string,
 *   province: string,
 *   city: string,
 *   district: string,
 *   township: string,
 *   adcode: string,
 *   source: 'amap'|'tianditu'|'nominatim',
 *   businessAreas?: Array
 * }>}
 */
export async function apiLocationReverse(lng, lat, options = {}) {
    return backendAPI.post('/api/v1/location/reverse', {
        lng,
        lat,
        prefer_service: options.preferService || 'auto',
        silent: options.silent || false,
    });
}

/**
 * 用户初次访问时的自动定位
 * - 前端在用户进入登陆页面时调用
 * - 后端自动记录用户 IP、位置、访问时间等信息到数据库
 * - 无需用户交互，自动发送请求
 *
 * @param {Object} options - 选项
 * @param {string} options.userAgent - 用户代理（可选）
 * @param {string} options.referrer - 来源页面（可选）
 * @returns {Promise<{
 *   ip: string,
 *   city: string,
 *   province: string,
 *   country: string,
 *   timestamp: string,
 *   tracked: boolean
 * }>}
 */
export async function apiLocationTrackVisit(options = {}) {
    return backendAPI
        .post('/api/v1/location/track-visit', {
            user_agent: options.userAgent || navigator?.userAgent || '',
            referrer: options.referrer || document?.referrer || '',
        }, {
            timeout: 3000, // 非关键请求，缩短超时避免阻塞首屏
        })
        .catch((error) => {
            // 定位追踪失败不影响正常业务流程，静默处理
            console.warn('[Location Tracking] 访问追踪失败:', error.message);
            return null;
        });
}

/**
 * 驾车路线规划
 * @param {Array} origin - 起点 [lng, lat]
 * @param {Array} destination - 终点 [lng, lat]
 * @param {Array} waypoints - 途经点（可选）
 * @param {string} strategy - 策略（可选）
 * @returns {Promise<{distance, duration, steps}>}
 */
export async function apiPlanDrivingRoute(origin, destination, waypoints = [], strategy = '') {
    return backendAPI.post('/api/v1/routes/driving', {
        origin,
        destination,
        waypoints,
        strategy,
    });
}

/**
 * 公交路线规划
 * @param {Array} origin - 起点 [lng, lat]
 * @param {Array} destination - 终点 [lng, lat]
 * @returns {Promise<{transit_lines}>}
 */
export async function apiPlanTransitRoute(origin, destination) {
    return backendAPI.post('/api/v1/routes/transit', {
        origin,
        destination,
    });
}

/**
 * 步行路线规划
 * @param {Array} origin - 起点 [lng, lat]
 * @param {Array} destination - 终点 [lng, lat]
 * @returns {Promise<{distance, duration, steps}>}
 */
export async function apiPlanWalkingRoute(origin, destination) {
    return backendAPI.post('/api/v1/routes/walking', {
        origin,
        destination,
    });
}

/**
 * ========== 用户中心与统计接口 ==========
 */

export async function apiLogVisit(payload = {}) {
    return backendAPI.post('/api/log-visit', {
        gps_lng: payload.gps_lng ?? null,
        gps_lat: payload.gps_lat ?? null,
        gps_accuracy: payload.gps_accuracy ?? null,
        gps_timestamp: payload.gps_timestamp || '',
        geo_permission: payload.geo_permission || 'unknown',
        gps_error: payload.gps_error || '',
    });
}

export async function apiStatisticsCenter() {
    return backendAPI.get('/api/statistics/center');
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
 *
 * @param {Object} payload - 聊天参数
 * @param {string} payload.message - 用户本轮问题
 * @param {Array} payload.history - 历史消息 [{role, content}]
 * @param {string} payload.location_context - 位置上下文
 * @param {string} payload.api_key - 用户个人 LLM API Key
 * @param {string} payload.base_url - LLM API 基础地址
 * @param {string} payload.model - 模型名称
 * @param {string} [payload.system_prompt] - 系统提示词覆盖
 * @param {number} [payload.timeout_seconds] - 超时秒数
 * @param {number} [payload.max_tokens] - 最大 token 数
 * @param {number} [payload.temperature] - 采样温度
 * @returns {Promise<Object>} {reply, model, usage, mode}
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

export async function apiStatisticsRealtime() {
    return backendAPI.get('/api/statistics/realtime');
}

export async function apiListUserMessages() {
    return backendAPI.get('/api/statistics/messages');
}

export async function apiCreateUserMessage(content) {
    return backendAPI.post('/api/statistics/messages', { content });
}

export async function apiGetCurrentAnnouncement() {
    return backendAPI.get('/api/announcement/current');
}

export async function apiDismissAnnouncement(announcementId) {
    return backendAPI.post('/api/announcement/dismiss', {
        announcement_id: announcementId,
    });
}

/**
 * ========== 管理员接口 ==========
 */

export async function apiAdminOverview() {
    return backendAPI.get('/api/admin/overview');
}

export async function apiAdminListVisitEvents(params = {}) {
    return backendAPI.get('/api/statistics/admin/visit-events', { params });
}

export async function apiAdminGetVisitEvent(eventId) {
    return backendAPI.get(`/api/statistics/admin/visit-events/${encodeURIComponent(eventId)}`);
}

export async function apiAdminCreateVisitEvent(payload) {
    return backendAPI.post('/api/statistics/admin/visit-events', payload);
}

export async function apiAdminUpdateVisitEvent(eventId, payload) {
    return backendAPI.put(
        `/api/statistics/admin/visit-events/${encodeURIComponent(eventId)}`,
        payload,
    );
}

export async function apiAdminDeleteVisitEvent(eventId) {
    return backendAPI.delete(`/api/statistics/admin/visit-events/${encodeURIComponent(eventId)}`);
}

export async function apiAdminSyncVisitEventToSupabase(eventId) {
    return backendAPI.post(
        `/api/statistics/admin/visit-events/${encodeURIComponent(eventId)}/sync-supabase`,
    );
}

export async function apiAdminListTables() {
    return backendAPI.get('/api/admin/db/tables');
}

export async function apiAdminGetTableRows(tableName, limit = 30, offset = 0) {
    return backendAPI.get(`/api/admin/db/table/${encodeURIComponent(tableName)}/rows`, {
        params: { limit, offset },
    });
}

export async function apiAdminInsertRow(tableName, row) {
    return backendAPI.post(`/api/admin/db/table/${encodeURIComponent(tableName)}/insert`, {
        row,
    });
}

export async function apiAdminUpdateRows(tableName, where, values) {
    return backendAPI.post(`/api/admin/db/table/${encodeURIComponent(tableName)}/update`, {
        where,
        values,
    });
}

export async function apiAdminDeleteRows(tableName, where) {
    return backendAPI.post(`/api/admin/db/table/${encodeURIComponent(tableName)}/delete`, {
        where,
    });
}

export async function apiAdminPublishAnnouncement(message) {
    return backendAPI.post('/api/admin/announcement/publish', { message });
}

export async function apiAdminUpdateContact(contact) {
    return backendAPI.post('/api/admin/config/contact', { contact });
}

/**
 * ========== API 管理接口 ==========
 */

export async function apiAdminApiUsageByUser(days = 7, limit = 100) {
    return backendAPI.get('/api/admin/api-management/usage/by-user', {
        params: { days, limit },
    });
}

export async function apiAdminApiUsageByEndpoint(days = 7, limit = 50) {
    return backendAPI.get('/api/admin/api-management/usage/by-endpoint', {
        params: { days, limit },
    });
}

export async function apiAdminApiLogs(limit = 500, offset = 0, username, endpoint, days = 7) {
    const params = { limit, offset, days };
    if (username) params.username = username;
    if (endpoint) params.endpoint = endpoint;
    return backendAPI.get('/api/admin/api-management/logs', { params });
}

export async function apiAdminQuotaConfig() {
    return backendAPI.get('/api/admin/api-management/quota-config');
}

export async function apiAdminUserTodayUsage(username) {
    return backendAPI.get(
        `/api/admin/api-management/user/${encodeURIComponent(username)}/today-usage`,
    );
}

// ==================== API 密钥管理接口 ====================

export async function apiAdminGetApiKeysStatus() {
    return backendAPI.get('/api/admin/api-keys/status');
}

export async function apiAdminSetApiKey(keyName, keyValue) {
    return backendAPI.post('/api/admin/api-keys/set', {
        key_name: keyName,
        key_value: keyValue,
    });
}

export async function apiAdminDeleteApiKey(keyName) {
    return backendAPI.delete(`/api/admin/api-keys/${encodeURIComponent(keyName)}`);
}

export async function apiAdminGetApiKey(keyName) {
    return backendAPI.get(`/api/admin/api-keys/${encodeURIComponent(keyName)}`);
}

export async function apiAdminGetAgentConfig() {
    return backendAPI.get('/api/admin/agent/config');
}

export async function apiAdminUpdateAgentConfig(payload = {}) {
    const safePayload = {};

    if (payload.base_url) safePayload.base_url = String(payload.base_url).trim();
    if ('model' in payload) safePayload.model = String(payload.model || '').trim();
    if (Array.isArray(payload.available_models)) {
        safePayload.available_models = payload.available_models
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 200);
    }
    if (payload.system_prompt) safePayload.system_prompt = String(payload.system_prompt).trim();
    if (typeof payload.timeout_seconds !== 'undefined')
        safePayload.timeout_seconds = Number(payload.timeout_seconds);
    if (typeof payload.max_tokens !== 'undefined')
        safePayload.max_tokens = Number(payload.max_tokens);
    if (typeof payload.temperature !== 'undefined')
        safePayload.temperature = Number(payload.temperature);
    if (typeof payload.guest_daily_quota !== 'undefined' && payload.guest_daily_quota !== null) {
        safePayload.guest_daily_quota = Number(payload.guest_daily_quota);
    }
    if (
        typeof payload.registered_daily_quota !== 'undefined' &&
        payload.registered_daily_quota !== null
    ) {
        safePayload.registered_daily_quota = Number(payload.registered_daily_quota);
    }
    if (payload.reset_chat_quota === true) {
        safePayload.reset_chat_quota = true;
    }

    return backendAPI.post('/api/admin/agent/config', safePayload);
}

// ==================== 空间分析接口 ====================

/**
 * 调用后端空间分析 API
 * @param {Object} payload - 分析参数
 * @param {string} payload.operation - 分析类型：buffer/intersection/union/difference/convexHull
 * @param {number} [payload.radius] - 缓冲半径（米），buffer 专用
 * @param {Object} payload.features_a - 图层 A 的 GeoJSON FeatureCollection
 * @param {Object} [payload.features_b] - 图层 B 的 GeoJSON FeatureCollection
 * @returns {Promise<Object>} { code, data: FeatureCollection, message }
 */
export async function apiSpatialAnalysis(payload) {
    return backendAPI.post('/api/v1/spatial/analysis', payload, {
        timeout: 30000, // 空间分析为重计算操作，给予 30 秒超时
    });
}

// syncUserRoleToUrl 已迁移至 utils/auth.js
