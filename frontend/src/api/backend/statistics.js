/**
 * 统计、用户消息、公告接口
 */

import backendAPI from './client';

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
