/**
 * 天气查询接口
 */

import backendAPI from './client';

/**
 * 获取实时天气
 * @param {string} adcode - 行政区代码
 * @returns {Promise<{weather, temperature, windDirection, windPower, humidity}>}
 */
export async function apiGetWeatherCurrent(adcode) {
    return backendAPI.get('/api/proxy/amap/weather', {
        params: {
            city: String(adcode || '').trim(),
            extensions: 'base',
        },
    });
}

/**
 * 获取天气预报
 * @param {string} adcode - 行政区代码
 * @param {number} days - 天数（默认7天）
 * @returns {Promise<Array>}
 */
export async function apiGetWeatherForecast(adcode, days = 7) {
    void days;
    return backendAPI.get('/api/proxy/amap/weather', {
        params: {
            city: String(adcode || '').trim(),
            extensions: 'all',
        },
    });
}
