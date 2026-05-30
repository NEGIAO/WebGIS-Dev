/**
 * 空间分析接口
 */

import backendAPI from './client';

/**
 * 调用后端空间分析 API
 * @param {Object} payload - 分析参数
 * @param {string} payload.operation - 分析类型：buffer/intersection/union/difference/convexHull
 * @param {number} [payload.radius] - 缓冲半径（米），buffer 专用
 * @param {Object} payload.features_a - 图层 A 的 GeoJSON FeatureCollection
 * @param {Object} [payload.features_b] - 图层 B 的 GeoJSON FeatureCollection
 * @returns {Promise<Object>} { code, data: FeatureCollection, message }
 */
export async function apiSpatialAnalysis(payload) {
    return backendAPI.post('/api/v1/spatial/analysis', payload, {
        timeout: 30000, // 空间分析为重计算操作，给予 30 秒超时
    });
}
