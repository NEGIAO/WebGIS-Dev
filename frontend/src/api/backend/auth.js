/**
 * 认证相关接口
 */

import backendAPI from './client';

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
