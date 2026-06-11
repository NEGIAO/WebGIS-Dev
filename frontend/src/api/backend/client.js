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
} from '../../services/auth';
import { getHttpStatusMessage, buildHttpErrorMessage } from '../httpStatusMap';
import { useMessage } from '../../composables/useMessage';

const { error: showError } = useMessage();

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
    timeout: 20000,
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
        let message = '请求失败，请稍后重试';
        let status = 0;
        let isQuotaExceeded = false;

        if (error.response) {
            // ---- 服务器响应错误 ----
            const { status: httpStatus, data, config } = error.response;
            status = httpStatus;

            // 从响应体中提取 detail（后端 FastAPI 风格）
            const detail = data?.detail;
            let detailMsg = '';
            let detailCode = '';
            if (typeof detail === 'string' && detail.trim()) {
                detailMsg = detail.trim();
            } else if (detail && typeof detail === 'object') {
                detailMsg = String(detail?.message || detail?.detail || '').trim() || JSON.stringify(detail);
                detailCode = String(detail?.code || '').trim();
            }

            // 用状态码映射兜底，确保每个 HTTP 码都有可读描述
            message = detailMsg || data?.message || buildHttpErrorMessage(status, '', { endpoint: config?.url });

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

            // ⭐ 特殊处理 429 配额用完（友好提示，不报错）
            if (status === 429) {
                isQuotaExceeded = true;
                message = detailMsg || getHttpStatusMessage(429);
                const apiError = new Error(message);
                apiError.isQuotaExceeded = true;
                apiError.status = status;
                apiError.statusText = getHttpStatusMessage(status);
                apiError.originalError = error;
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
            const tag = status ? `[${status} ${getHttpStatusMessage(status)}]` : '[网络错误]';
            console.error(`[Backend API] ${tag}`, message, error);
            showError(`${tag} ${message}`, { duration: 6000 });
        }

        const apiError = new Error(message);
        apiError.isQuotaExceeded = isQuotaExceeded;
        apiError.status = status;
        apiError.statusText = getHttpStatusMessage(status);
        apiError.originalError = error;
        return Promise.reject(apiError);
    },
);

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
    } else {
        // 其他错误：正常报错，附带状态码
        messageHandler.error(`${errorMessage}${statusTag}`, {
            closable: true,
            duration: 6000,
        });
    }
}

export default backendAPI;
