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
} from '../../utils/auth';

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

export default backendAPI;
