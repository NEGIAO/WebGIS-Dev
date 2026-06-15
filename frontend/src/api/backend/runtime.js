/**
 * 运行时配置接口
 */

import backendAPI from './client';

export async function apiGetRuntimeMapTokens() {
    return backendAPI.get('/api/runtime-config/map-tokens');
}
