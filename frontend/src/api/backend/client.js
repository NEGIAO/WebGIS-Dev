/**
 * 后端 API 客户端实例
 *
 * 提供 axios 实例、请求/响应拦截器、错误处理工具。
 * 所有 domain 模块通过此实例发起请求。
 */

import axios from 'axios';
import {
    clearAuthSession,
    getAuthToken,
    getOrCreateGuestDeviceId,
    readShareModeFromUrl,
} from '@common/user/services/auth';
import { getHttpStatusMessage, buildHttpErrorMessage } from '../httpStatusMap';
import { BACKEND_BASE_URL as PUBLIC_BACKEND_BASE_URL, BACKEND_REQUEST_TIMEOUT_MS } from '../../config/publicRuntime';
import { useMessage } from '@common/shell/useMessage';

/** useMessage 错误提示函数（模块顶层调用安全：useMessage 为纯模块级实现，不依赖组件 inject；注意：若 useMessage.js 未来加入 inject 依赖，需改为延迟加载模式） */
const { error: showError } = useMessage();

/** 后端根地址（无尾部斜杠），统一来自 src/config/publicRuntime，供 axios 与 SSE 等共用 */
export const BACKEND_BASE_URL = PUBLIC_BACKEND_BASE_URL;

const backendURL = BACKEND_BASE_URL;

if (import.meta.env.DEV) {
    console.warn('[Backend] 后端 URL:', backendURL);
}

// 安全守卫：非 localhost 环境下，拒绝通过 HTTP 发送请求（防止密码等凭证明文传输）
if (typeof window !== 'undefined' && window.location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(window.location.hostname)) {
    console.warn('[Backend] 安全警告：当前通过 HTTP 连接后端，凭证将以明文传输。生产环境请启用 HTTPS。');
}

// ─── 用户公网 IP 获取 & 缓存（V3.4.63）───
// Docker 环境 request.client.host 是容器网关 IP（如 172.18.0.1），不是用户真实公网 IP。
// 前端通过 ipify 获取用户公网 IP 并缓存，每次请求通过 X-Client-IP header 传给后端。
let _cachedPublicIp = null;
let _ipFetchPromise = null;

async function getPublicIp() {
    if (_cachedPublicIp) return _cachedPublicIp;
    if (_ipFetchPromise) return _ipFetchPromise;

    _ipFetchPromise = (async () => {
        try {
            const resp = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
            const ip = resp?.data?.ip;
            if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
                _cachedPublicIp = ip;
                return ip;
            }
        } catch {
            // 获取失败不影响主流程，后端会用 fallback IP
        }
        return null;
    })();

    return _ipFetchPromise;
}

// 启动时预热（不阻塞）
void getPublicIp();

export { getPublicIp };

/**
 * 后端 API 客户端实例
 * 自动处理请求/响应拦截
 */
const backendAPI = axios.create({
    baseURL: backendURL,
    timeout: BACKEND_REQUEST_TIMEOUT_MS,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * 请求拦截器
 * 用于添加全局请求头、认证信息等
 */
backendAPI.interceptors.request.use(
    async (config) => {
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

        // 传递用户公网 IP（V3.4.63）：后端在 Docker 环境拿到的 request.client.host 是容器网关 IP
        if (!config.headers['X-Client-IP']) {
            const publicIp = await getPublicIp();
            if (publicIp) {
                config.headers['X-Client-IP'] = publicIp;
            }
        }

        return config;
    },
    (error) => {
        // console.error('[Backend API] 请求错误:', error);
        showError(`请求发送失败: ${error.message || '未知错误'}`);
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
        // 但仍需检查 HTTP 状态码：401/403 等错误可能以 blob 形式返回（后端 FastAPI 默认行为）。
        if (response?.config?.responseType === 'blob' || response?.config?.responseType === 'arraybuffer') {
            if (response.status >= 200 && response.status < 300) {
                return response;
            }
            // 错误响应：尝试将 Blob 解析为 JSON 错误信息
            return parseBlobError(response).then((parsedError) => Promise.reject(parsedError));
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
        let message = '请求失败，请稍后重试';
        let status = 0;
        let isQuotaExceeded = false;
        let detailMsg = '';
        let detailCode = '';

        if (error.response) {
            // ---- 服务器响应错误 ----
            const { status: httpStatus, data, config } = error.response;
            status = httpStatus;

            // 从响应体中提取 detail（后端 FastAPI 风格）
            const detail = data?.detail;
            if (typeof detail === 'string' && detail.trim()) {
                detailMsg = detail.trim();
            } else if (detail && typeof detail === 'object') {
                detailMsg = String(detail?.message || detail?.detail || '').trim();
                detailCode = String(detail?.code || '').trim();
            }

            // 兜底：如果 detail 里没提取到 message，尝试 data?.message（字符串）
            if (!detailMsg && typeof data?.message === 'string') {
                detailMsg = data.message.trim();
            }

            // 兜底：detail 里没提取到 code 时，尝试 data.detail_code（app.py 结构化错误透传的业务 code）
            if (!detailCode && data?.detail_code) {
                detailCode = String(data.detail_code).trim();
            }

            // 用状态码映射兜底，确保每个 HTTP 码都有可读描述
            message = detailMsg || buildHttpErrorMessage(status, '', { endpoint: config?.url });

            if (status === 401) {
                // 区分会话过期 vs 游客权限不足
                // SESSION_EXPIRED / SESSION_ERROR → 清除会话，跳转登录
                // GUEST_NO_TOKEN → 仅提示，不清除会话，用 warning 而非 error
                const isGuestInsufficient = detailCode === 'GUEST_NO_TOKEN';
                if (!isGuestInsufficient) {
                    clearAuthSession();
                } else {
                    // 游客权限不足：以 warning 提示，不作为 error 抛出
                    showError(message, { duration: 4000 });
                    const apiError = new Error(message);
                    apiError.status = status;
                    apiError.statusText = getHttpStatusMessage(status);
                    apiError.isGuestInsufficient = true;
                    apiError.originalError = error;
                    return Promise.reject(apiError);
                }
            }

            if (status === 403 && detailCode === 'EMAIL_BINDING_REQUIRED') {
                const apiError = new Error(message);
                apiError.status = status;
                apiError.statusText = getHttpStatusMessage(status);
                apiError.isEmailBindingRequired = true;
                apiError.originalError = error;
                return Promise.reject(apiError);
            }

            // ⭐ 特殊处理 429 配额用完（含统一 API 配额池的下载额度不足）
            if (status === 429) {
                isQuotaExceeded = true;
                // 优先用后端返回的 message（结构化 detail），避免显示"请求过于频繁"误导用户
                message = detailMsg || getHttpStatusMessage(429);
                const apiError = new Error(message);
                apiError.isQuotaExceeded = true;
                apiError.detailCode = detailCode;
                apiError.status = status;
                apiError.statusText = getHttpStatusMessage(status);
                apiError.originalError = error;
                // 下载额度不足时标记为 isQuotaInsufficient，便于上层区分提示
                if (detailCode === 'DOWNLOAD_QUOTA_INSUFFICIENT') {
                    apiError.isQuotaInsufficient = true;
                }
                return Promise.reject(apiError);
            }
        } else if (error.request) {
            // ---- 请求已发出但没有收到响应 ----
            if (error.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) {
                message = '请求超时，请稍后重试';
                status = 408;
            } else {
                message = '网络异常，请检查您的连接';
                status = 0;
            }
        } else {
            // ---- 其他错误 ----
            message = error.message || '未知错误，请稍后重试';
        }

        // 只在非配额用完的情况下输出错误日志
        if (!isQuotaExceeded) {
            // 用户提示由下方 showError 负责；错误对象保留在 rejected 的 apiError.originalError 便于排查，不输出 console.error
            // console.error(`[Backend API] ${status ? `[${status} ${getHttpStatusMessage(status)}]` : '[网络错误]'}`, message, error);
            // 后端已返回结构化 message 时，拼接状态码前缀：「401，登录状态已失效，请重新登录」
            // 避免直接抛字典原始字符串或仅显示 HTTP 状态描述
            const toastMsg = detailMsg ? `${status}，${detailMsg}` : (typeof message === 'string' ? message : String(message?.message || JSON.stringify(message)));
            showError(toastMsg, { duration: 6000 });
        }

        const apiError = new Error(message);
        apiError.isQuotaExceeded = isQuotaExceeded;
        apiError.status = status;
        apiError.detailCode = detailCode;
        apiError.statusText = getHttpStatusMessage(status);
        apiError.originalError = error;
        return Promise.reject(apiError);
    },
);

/**
 * 尝试将错误响应的 Blob 解析为 JSON 错误信息。
 * 后端 FastAPI 返回 401/403 时，若前端请求设置了 responseType: 'blob'，
 * 响应体是 Blob 而非 JSON，需要手动读取并解析。
 * @param {import('axios').AxiosResponse} response
 * @returns {Promise<Error>}
 */
async function parseBlobError(response) {
    const data = response.data;
    let message = `请求失败 [${response.status}]`;
    let detailCode = '';

    if (data instanceof Blob && data.type?.includes('application/json')) {
        try {
            const text = await data.text();
            const json = JSON.parse(text);
            const detail = json?.detail;
            if (typeof detail === 'string') {
                message = detail;
            } else if (detail && typeof detail === 'object') {
                message = String(detail?.message || detail?.detail || json?.message || '请求失败');
                detailCode = String(detail?.code || '');
            } else if (json?.message) {
                message = json.message;
            }
            if (!detailCode && json?.detail_code) {
                detailCode = String(json.detail_code);
            }
        } catch {
            // JSON 解析失败，使用状态码兜底
            message = `请求失败 [${response.status}] ${getHttpStatusMessage(response.status)}`;
        }
    } else if (data instanceof Blob) {
        // 非 JSON Blob（如 HTML 错误页），尝试读取前 200 字符获取更多信息
        try {
            const text = await data.text();
            const snippet = text.slice(0, 200).trim();
            message = snippet
                ? `[${response.status}] ${snippet}`
                : `[${response.status}] ${getHttpStatusMessage(response.status)}`;
        } catch {
            message = `[${response.status}] ${getHttpStatusMessage(response.status)}`;
        }
    }

    // 注意：不在此处调用 showError，避免与调用方的错误处理重复弹窗。
    // 调用方可通过 apiError.detailCode / apiError.isGuestInsufficient / apiError.isQuotaInsufficient
    // 判断错误类型并自行提示用户。

    const apiError = new Error(message);
    apiError.status = response.status;
    apiError.statusText = getHttpStatusMessage(response.status);
    apiError.detailCode = detailCode;
    apiError.isGuestInsufficient = detailCode === 'GUEST_NO_TOKEN';
    apiError.isQuotaInsufficient = detailCode === 'DOWNLOAD_QUOTA_INSUFFICIENT';
    apiError.originalError = { response };
    return apiError;
}

/**
 * 错误处理工具函数
 * 用于区分配额用完（429）和其他错误
 *
 * @param {Error} error - API 错误对象（含 status / statusText 字段）
 * @param {Function} messageHandler - message 通知函数
 * @param {string} defaultErrorMsg - 默认错误信息
 * @returns {void}
 */
export function handleApiError(error, messageHandler, defaultErrorMsg = '操作失败，请稍后重试') {
    const isQuotaExceeded = error.isQuotaExceeded === true;
    const isGuestInsufficient = error.isGuestInsufficient === true;
    const isEmailBindingRequired = error.isEmailBindingRequired === true;
    const status = error.status || 0;
    const statusText = error.statusText || '';
    const errorMessage = error.message || defaultErrorMsg;

    // 附加状态码标签便于排查（仅在 message 本身不含状态码时追加）
    const statusTag = status && !errorMessage.includes(String(status))
        ? ` [${status} ${statusText}]`
        : '';

    if (isQuotaExceeded) {
        // 配额用完：显示友好提示，不报错
        messageHandler.warning(errorMessage, {
            closable: true,
            duration: 0, // 不自动关闭，让用户主动关闭
        });
    } else if (isGuestInsufficient) {
        // 游客权限不足：显示 warning，引导注册
        messageHandler.warning(errorMessage, {
            closable: true,
            duration: 4000,
        });
    } else if (isEmailBindingRequired) {
        messageHandler.warning(errorMessage, {
            closable: true,
            duration: 4000,
        });
    } else {
        // 其他错误：正常报错，附带状态码
        messageHandler.error(`${errorMessage}${statusTag}`, {
            closable: true,
            duration: 6000,
        });
    }
}

export default backendAPI;
