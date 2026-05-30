/**
 * 路线规划接口
 */

import backendAPI from './client';

/**
 * 驾车路线规划
 * @param {Array} origin - 起点 [lng, lat]
 * @param {Array} destination - 终点 [lng, lat]
 * @param {Array} waypoints - 途经点（可选）
 * @param {string} strategy - 策略（可选）
 * @returns {Promise<{distance, duration, steps}>}
 */
export async function apiPlanDrivingRoute(origin, destination, waypoints = [], strategy = '') {
    return backendAPI.post('/api/v1/routes/driving', {
        origin,
        destination,
        waypoints,
        strategy,
    });
}

/**
 * 公交路线规划
 * @param {Array} origin - 起点 [lng, lat]
 * @param {Array} destination - 终点 [lng, lat]
 * @returns {Promise<{transit_lines}>}
 */
export async function apiPlanTransitRoute(origin, destination) {
    return backendAPI.post('/api/v1/routes/transit', {
        origin,
        destination,
    });
}

/**
 * 步行路线规划
 * @param {Array} origin - 起点 [lng, lat]
 * @param {Array} destination - 终点 [lng, lat]
 * @returns {Promise<{distance, duration, steps}>}
 */
export async function apiPlanWalkingRoute(origin, destination) {
    return backendAPI.post('/api/v1/routes/walking', {
        origin,
        destination,
    });
}
