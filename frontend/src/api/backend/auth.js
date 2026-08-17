/**
 * 认证相关接口
 * 包含：登录、注册、验证码、密码重置、用户偏好等
 */

import backendAPI, { BACKEND_BASE_URL } from './client';

export async function apiAuthCheckUsername(username) {
    return backendAPI.get('/api/auth/check-username', {
        params: { username },
    });
}

export async function apiAuthRegister(arg1, password, avatarIndex = 0, email = '', emailCode = '') {
    const payload = typeof arg1 === 'object' && arg1 !== null
        ? {
            email: String(arg1.email || '').trim(),
            email_code: String(arg1.email_code || arg1.emailCode || '').trim(),
            password: String(arg1.password || ''),
            display_name: String(arg1.display_name || arg1.displayName || arg1.username || '').trim(),
            avatar_index: Number(arg1.avatar_index ?? arg1.avatarIndex ?? 0),
        }
        : {
            email: String(email || '').trim(),
            email_code: String(emailCode || '').trim(),
            password: String(password || ''),
            display_name: String(arg1 || '').trim(),
            avatar_index: Number(avatarIndex || 0),
        };
    return backendAPI.post('/api/auth/register', payload);
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

export async function apiAuthChangeDisplayName(displayName) {
    return backendAPI.post('/api/auth/change-display-name', {
        display_name: String(displayName || '').trim(),
    });
}

export async function apiAuthBindEmail(email, code, currentPassword) {
    return backendAPI.post('/api/auth/bind-email', {
        email: String(email || '').trim(),
        code: String(code || '').trim(),
        current_password: String(currentPassword || ''),
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
 * 发送邮箱验证码。
 * @param {string} email - 目标邮箱地址
 * @param {string} purpose - 用途：'register' | 'reset_password' | 'bind_email'
 * @param {string} [username] - 关联用户名（注册时可选）
 * @returns {Promise<{status: string, message: string}>}
 */
export async function apiAuthSendCode(email, purpose, username) {
    const payload = {
        email: String(email || '').trim(),
        purpose: String(purpose || '').trim(),
    };
    if (username) {
        payload.username = String(username).trim();
    }
    return backendAPI.post('/api/auth/send-code', payload, { timeout: 30000 });
}

/**
 * 校验邮箱验证码。
 * @param {string} email - 邮箱地址
 * @param {string} code - 6 位验证码
 * @param {string} purpose - 用途标识
 * @returns {Promise<{status: string, message: string}>}
 */

export async function apiAuthVerifyCode(email, code, purpose) {
    return backendAPI.post('/api/auth/verify-code', {
        email: String(email || '').trim(),
        code: String(code || '').trim(),
        purpose: String(purpose || '').trim(),
    });
}

/**
 * 跳转到 Google/GitHub/Hugging Face OAuth 登录入口。
 * @param {'google'|'github'|'huggingface'} provider - 第三方登录提供商
 */
export function redirectToOAuthProvider(provider) {
    const safeProvider = provider === 'github' ? 'github' : provider === 'huggingface' ? 'huggingface' : 'google';
    window.location.href = `${BACKEND_BASE_URL}/api/auth/oauth/${safeProvider}/start`;
}

/**
 * 跳转到当前已登录用户的 Google/GitHub/Hugging Face OAuth 绑定入口。
 * 绑定接口由 axios token 负责提供 Authorization，最终仍通过浏览器跳转完成授权。
 * @param {'google'|'github'|'huggingface'} provider - 第三方登录提供商
 */
export async function redirectToOAuthBindProvider(provider) {
    const safeProvider = provider === 'github' ? 'github' : provider === 'huggingface' ? 'huggingface' : 'google';
    const result = await backendAPI.get(`/api/auth/oauth/${safeProvider}/bind/start`);
    const authUrl = String(result?.auth_url || '').trim();
    if (!authUrl) throw new Error('第三方绑定入口生成失败');
    window.location.href = authUrl;
}

export async function apiAuthExchangeOAuthLoginTicket(ticket) {
    return backendAPI.post('/api/auth/oauth/login/exchange', {
        ticket: String(ticket || '').trim(),
    });
}

export async function apiAuthCompleteOAuthBind(provider, ticket) {
    const safeProvider = provider === 'github' ? 'github' : provider === 'huggingface' ? 'huggingface' : 'google';
    return backendAPI.post(`/api/auth/oauth/${safeProvider}/bind/complete`, {
        ticket: String(ticket || '').trim(),
    });
}

export async function apiAuthListOAuthAccounts() {
    return backendAPI.get('/api/auth/oauth/accounts');
}

export async function apiAuthUnlinkOAuthAccount(provider) {
    const safeProvider = provider === 'github' ? 'github' : provider === 'huggingface' ? 'huggingface' : 'google';
    return backendAPI.delete(`/api/auth/oauth/${safeProvider}/bind`);
}


/**
 * 通过邮箱验证码重置密码（无需登录）。
 * @param {string} email - 绑定的邮箱地址
 * @param {string} code - 6 位验证码
 * @param {string} newPassword - 新密码
 * @returns {Promise<{status: string, message: string}>}
 */
export async function apiAuthResetPassword(email, code, newPassword) {
    return backendAPI.post('/api/auth/reset-password', {
        email: String(email || '').trim(),
        code: String(code || '').trim(),
        new_password: String(newPassword || ''),
    });
}

/**
 * Google One Tap / Sign In With Google 登录。
 * 将 Google 返回的 credential（JWT ID Token）发送到后端验证并换取 WebGIS session。
 * @param {string} credential - Google One Tap 返回的 credential（JWT）
 * @returns {Promise<{status: string, token: string, user: object, quota: object}>}
 */
export async function apiAuthGoogleOneTap(credential) {
    return backendAPI.post('/api/auth/oauth/google/onetap', {
        credential: String(credential || '').trim(),
    });
}
