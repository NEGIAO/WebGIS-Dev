/**
 * 后端 API 客户端实例
 *
 * 提供 axios 实例、请求/响应拦截器、错误处理工具。
 * 所有 domain 模块通过此实例发起请求。
 */

import axios from 'axios';
import {
    markSessionExpired,
    getAuthToken,
    getBackendBearerToken,
    getOrCreateGuestDeviceId,
    getPresenceClientId,
    readShareModeFromUrl,
} from '@common/user/services/auth';
import { getHttpStatusMessage, buildHttpErrorMessage } from '../httpStatusMap';
import { getGuestToken } from '@common/user/services/guestTokenStore';
import { readErrorPayload } from '../blobError';
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

// ─── 用户公网 IP（V3.7.6 起：不再前端自取）───
// 原实现经第三方服务 api.ipify.org 取公网 IP 后以 X-Client-IP 自报给后端，存在三类问题：
// ① 广告拦截插件（uBlock/AdGuard）普遍封禁 ipify，请求以 ERR_BLOCKED_BY_CLIENT 失败，
//    DevTools 常驻红色报错；② 国内访问 ipify 慢/不稳，负缓存过期后每 30s 首请求空等 3s；
// ③ 自报 IP 本就可伪造（后端 _extract_client_ip 文档已声明「不是信任边界」）。
// 现后端经 X-Forwarded-For（HF 反代追加的真实末跳）取公网 IP，展示/审计/IP 国别/IP 定位
// 均更准且零第三方依赖；本地直连开发时 request.client.host 为回环地址属预期退化。

/**
 * 后端 API 客户端实例
 * 自动处理请求/响应拦截
 */
const backendAPI: any = axios.create({
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
    async (config: any) => {
        const token = getBackendBearerToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // 恒发浏览器级稳定设备身份（localStorage 多标签页共享）与单页签实例 ID，
        // 登录/未登录都要带上，后端据此准确去重同人多标签与同浏览器访客兜底。
        const guestDeviceId = getOrCreateGuestDeviceId();
        if (guestDeviceId) {
            config.headers['X-Guest-Device-Id'] = guestDeviceId;
        }
        // 游客身份签名 token（V3.7.6 游客身份治理）：无登录态时经 X-Guest-Token 头
        // 携带后端签发的 HMAC 身份（稳定配额桶）；无 token 时后端按确定性派生桶兜底。
        // guest token 与登录 token 完全隔离，永不进入 Authorization 头。
        const guestToken = !token ? (getGuestToken() || '') : '';
        if (guestToken) {
            config.headers['X-Guest-Token'] = guestToken;
        }
        const clientId = getPresenceClientId();
        if (clientId && !config.headers['X-Presence-Client-Id']) {
            config.headers['X-Presence-Client-Id'] = clientId;
        }
        if (readShareModeFromUrl()) {
            config.headers['X-Share-Mode'] = '1';
            config.headers['X-Guest-Allow'] = '1';
        }

        // V3.7.6：不再发送 X-Client-IP（自报值可伪造且依赖第三方 ipify 服务）；
        // 后端 _extract_client_ip 回落 XFF 末跳取真实公网 IP。
        // V3.7.12 Code Review：快照请求实际使用的身份凭证。响应 401 若是过期请求迟到到达，
        // 当前凭证可能已被重新登录替换，此时不得清掉新会话——否则用户刚登录即被踢回注册页。
        (config as any)._issuedAuthToken = token || '';
        (config as any)._issuedGuestToken = (!token ? guestToken : '') || '';
        return config;
    },
    (error: any) => {
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
    (response: any) => {
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
                (error as any).code = data.code;
                (error as any).data = data;
                return Promise.reject(error);
            }
        }

        // 返回原始数据
        return data;
    },
    (error: any) => {
        // 处理网络错误、超时等
        // 不预置文案：下方 error.response / error.request / 其他 三条分支必然赋值后才读取（eslint no-useless-assignment）
        let message;
        let status = 0;
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
                // 区分会话过期 vs 游客/未登录权限不足
                // SESSION_EXPIRED / SESSION_ERROR / 其它非游客 401 → 统一走 markSessionExpired：
                // 清本地会话 + 派发事件，由 main.ts 弹「会话过期，请重新登陆」并跳 /register。
                // 此处提前 reject，避免下方通用 toast 再弹一次「401，登录状态已失效...」。
                // GUEST_NO_TOKEN（历史码） / LOGIN_REQUIRED（未带 token 的 require_login）
                // → 仅提示，不清会话，不跳注册页。
                const isGuestInsufficient = detailCode === 'GUEST_NO_TOKEN' || detailCode === 'LOGIN_REQUIRED';
                // V3.7.12 Code Review：仅当触发 401 的凭证仍是当前凭证时才清理。
                // 迟到的旧请求若携带已被替换的 token，清会话会误伤刚重建的登录态。
                const issuedAuth = String((config as any)?._issuedAuthToken || '');
                const issuedGuest = String((config as any)?._issuedGuestToken || '');
                const currentAuth = getAuthToken() || '';
                const currentGuest = getGuestToken() || '';
                const credentialStillCurrent = issuedAuth
                    ? issuedAuth === currentAuth
                    : issuedGuest === currentGuest;
                if (!isGuestInsufficient) {
                    if (credentialStillCurrent) {
                        markSessionExpired();
                    }
                    const apiError = new Error(message);
                    (apiError as any).status = status;
                    (apiError as any).detailCode = detailCode;
                    (apiError as any).statusText = getHttpStatusMessage(status);
                    (apiError as any).isSessionExpired = true;
                    (apiError as any).originalError = error;
                    return Promise.reject(apiError);
                } else {
                    // 游客权限不足：以 warning 提示，不作为 error 抛出
                    showError(message, { duration: 4000 });
                    const apiError = new Error(message);
                    (apiError as any).status = status;
                    (apiError as any).statusText = getHttpStatusMessage(status);
                    (apiError as any).isGuestInsufficient = true;
                    (apiError as any).originalError = error;
                    return Promise.reject(apiError);
                }
            }

            if (status === 403 && detailCode === 'EMAIL_BINDING_REQUIRED') {
                const apiError = new Error(message);
                (apiError as any).status = status;
                (apiError as any).statusText = getHttpStatusMessage(status);
                (apiError as any).isEmailBindingRequired = true;
                (apiError as any).originalError = error;
                return Promise.reject(apiError);
            }

            // ⭐ 特殊处理 429 配额用完（含统一 API 配额池的下载额度不足）
            if (status === 429) {
                // 本分支在下方立即 reject 返回，故不再置 isQuotaExceeded 标记
                // （赋值后无任何读取点，属 eslint no-useless-assignment）；标记由 apiError.isQuotaExceeded 直接给出
                // 优先用后端返回的 message（结构化 detail），避免显示"请求过于频繁"误导用户
                message = detailMsg || getHttpStatusMessage(429);
                const apiError = new Error(message);
                (apiError as any).isQuotaExceeded = true;
                (apiError as any).detailCode = detailCode;
                (apiError as any).status = status;
                (apiError as any).statusText = getHttpStatusMessage(status);
                (apiError as any).originalError = error;
                // 下载额度不足时标记为 isQuotaInsufficient，便于上层区分提示
                if (detailCode === 'DOWNLOAD_QUOTA_INSUFFICIENT') {
                    (apiError as any).isQuotaInsufficient = true;
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

        // 配额用完（429）已在上面提前 reject 返回，能走到这里的都不是配额错误，
        // 故不再用 isQuotaExceeded 做分支判断（该标记此前恒为 false，属死逻辑）。
        // 用户提示由下方 showError 负责；错误对象保留在 rejected 的 apiError.originalError 便于排查，不输出 console.error
        // 后端已返回结构化 message 时，拼接状态码前缀：「401，登录状态已失效，请重新登录」
        // 避免直接抛字典原始字符串或仅显示 HTTP 状态描述
        // config.silent 允许调用方关闭这条全局提示：多引擎降级链路（如搜索先试 Amap、
        // 失败再转 Nominatim）里，中间那次失败不该以红色报错的形式呈现给用户。
        const shouldToast = !error.config?.silent;
        const toastMsg = detailMsg ? `${status}，${detailMsg}` : (typeof message === 'string' ? message : String(message?.message || JSON.stringify(message)));
        if (shouldToast) showError(toastMsg, { duration: 6000 });

        const apiError = new Error(message);
        (apiError as any).isQuotaExceeded = false;
        (apiError as any).status = status;
        (apiError as any).detailCode = detailCode;
        (apiError as any).statusText = getHttpStatusMessage(status);
        (apiError as any).originalError = error;
        return Promise.reject(apiError);
    },
);

/**
 * 将错误响应体解析为 Error 对象。
 * 后端 FastAPI 返回 4xx 时，若前端请求设置了 responseType: 'blob'，
 * 响应体是 Blob 而非 JSON，需要先读文本再解析。
 * 解析逻辑已抽到 `api/blobError.ts`，与独立下载节点客户端共用同一套文案契约。
 * @param {import('axios').AxiosResponse} response
 * @returns {Promise<Error>}
 */
async function parseBlobError(response: any) {
    const { message, detailCode } = await readErrorPayload(response.data, response.status);

    // 注意：不在此处调用 showError，避免与调用方的错误处理重复弹窗。
    // 调用方可通过 apiError.detailCode / apiError.isGuestInsufficient / apiError.isQuotaInsufficient
    // 判断错误类型并自行提示用户。

    const apiError = new Error(message);
    (apiError as any).status = response.status;
    (apiError as any).statusText = getHttpStatusMessage(response.status);
    (apiError as any).detailCode = detailCode;
    (apiError as any).isGuestInsufficient =
        detailCode === 'GUEST_NO_TOKEN' || detailCode === 'LOGIN_REQUIRED';
    (apiError as any).isQuotaInsufficient = detailCode === 'DOWNLOAD_QUOTA_INSUFFICIENT';
    (apiError as any).originalError = { response };
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
export function handleApiError(error: any, messageHandler: any, defaultErrorMsg = '操作失败，请稍后重试') {
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
