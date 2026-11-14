/**
 * 运行时配置接口
 */

import backendAPI from './client';

export async function apiGetRuntimeMapTokens() {
    return backendAPI.get('/api/runtime-config/map-tokens');
}

/** 获取管理员配置的全局默认值（default_basemap_index 等） */
export async function apiGetRuntimeDefaults() {
    return backendAPI.get('/api/runtime-config/defaults');
}
