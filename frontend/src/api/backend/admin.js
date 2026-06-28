/**
 * 管理员接口
 */

import backendAPI from './client';

export async function apiAdminOverview() {
    return backendAPI.get('/api/admin/overview');
}

// ==================== 访问事件管理 ====================

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

// ==================== 数据库管理 ====================

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

// ==================== 公告与配置 ====================

export async function apiAdminPublishAnnouncement(message) {
    return backendAPI.post('/api/admin/announcement/publish', { message });
}

export async function apiAdminUpdateContact(contact) {
    return backendAPI.post('/api/admin/config/contact', { contact });
}

// ==================== API 管理 ====================

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

// ==================== API 密钥管理 ====================

export async function apiAdminGetApiKeysStatus() {
    return backendAPI.get('/api/admin/api-keys/status');
}

export async function apiAdminSetApiKey(keyName, keyValue) {
    return backendAPI.post('/api/admin/api-keys/set', {
        key_name: keyName,
        key_value: keyValue,
    });
}

export async function apiAdminAppendApiKeyBackup(keyName, keyValue) {
    return backendAPI.post(`/api/admin/api-keys/${encodeURIComponent(keyName)}/backups`, {
        key_value: keyValue,
    });
}

export async function apiAdminReplaceApiKeyBackups(keyName, backupValues = []) {
    return backendAPI.put(`/api/admin/api-keys/${encodeURIComponent(keyName)}/backups`, {
        backup_values: Array.isArray(backupValues) ? backupValues : [],
    });
}

export async function apiAdminDeleteApiKeyBackup(keyName, backupId) {
    return backendAPI.delete(
        `/api/admin/api-keys/${encodeURIComponent(keyName)}/backups/${encodeURIComponent(backupId)}`,
    );
}

export async function apiAdminDeleteApiKey(keyName) {
    return backendAPI.delete(`/api/admin/api-keys/${encodeURIComponent(keyName)}`);
}

export async function apiAdminGetApiKey(keyName) {
    return backendAPI.get(`/api/admin/api-keys/${encodeURIComponent(keyName)}`);
}

// ==================== Agent 配置管理 ====================

export async function apiAdminGetAgentConfig() {
    return backendAPI.get('/api/admin/agent/config');
}

export async function apiAdminUpdateAgentConfig(payload = {}) {
    const safePayload = {};

    if ('base_url' in payload) safePayload.base_url = String(payload.base_url || '').trim();
    if ('model' in payload) safePayload.model = String(payload.model || '').trim();
    if (Array.isArray(payload.available_models)) {
        safePayload.available_models = payload.available_models
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 200);
    }
    if ('system_prompt' in payload) safePayload.system_prompt = String(payload.system_prompt || '').trim();
    if (typeof payload.timeout_seconds !== 'undefined')
        safePayload.timeout_seconds = Number(payload.timeout_seconds);
    if (typeof payload.max_tokens !== 'undefined')
        safePayload.max_tokens = Number(payload.max_tokens);
    if (typeof payload.temperature !== 'undefined')
        safePayload.temperature = Number(payload.temperature);
    if (typeof payload.top_p !== 'undefined' && payload.top_p !== null)
        safePayload.top_p = Number(payload.top_p);
    if (typeof payload.stream !== 'undefined' && payload.stream !== null)
        safePayload.stream = Boolean(payload.stream);
    if (typeof payload.extra_body !== 'undefined' && payload.extra_body !== null)
        safePayload.extra_body = payload.extra_body;
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
