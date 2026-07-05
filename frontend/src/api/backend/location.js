/**
 * 地理编码、位置搜索、IP 定位接口
 *
 * ===== 坐标系统契约 =====
 * 本模块所有公开函数遵循统一约定：
 *   - 输入：WGS-84 坐标（OpenLayers toLonLat 产出的标准）
 *   - 输出：WGS-84 坐标
 *   - 内部：调用高德 API 前自动 wgs84ToGcj02，收到结果后自动 gcj02ToWgs84
 *   - 上层调用方（组件/Composable/Store）无需感知 GCJ-02 的存在
 *
 * 后端代理 (external_proxy.py) 纯透传，不转换；
 * 后端服务端点 (location.py) 也在调用高德前做防御性转换。
 * =========================
 */

import backendAPI from './client';
import { useMessage } from '../../composables/useMessage';
import { wgs84ToGcj02, gcj02ToWgs84 } from '../../utils/coordTransform';

/**
 * 地理编码 - 地址→坐标（WGS-84）
 *
 * 高德 API 返回 GCJ-02 坐标，本函数自动转换为 WGS-84。
 *
 * @param {string} address - 地址
 * @param {string} city - 城市（可选）
 * @returns {Promise<{geocodes: Array<{location: string, lng: number, lat: number}>, ...}>} WGS-84 坐标
 */
export async function apiGeocode(address, city = '') {
    const data = await backendAPI.get('/api/proxy/amap/geocode/geo', {
        params: {
            address: String(address || '').trim(),
            city: String(city || '').trim(),
        },
    });

    // 高德返回 GCJ-02 坐标，转换为 WGS-84
    const geocodes = Array.isArray(data?.geocodes) ? data.geocodes : [];
    for (const geo of geocodes) {
        if (geo.location && typeof geo.location === 'string') {
            const parts = geo.location.split(',');
            const gcjLng = Number.parseFloat(parts[0]);
            const gcjLat = Number.parseFloat(parts[1]);
            if (Number.isFinite(gcjLng) && Number.isFinite(gcjLat)) {
                const [wgsLng, wgsLat] = gcj02ToWgs84(gcjLng, gcjLat);
                geo.location = `${wgsLng},${wgsLat}`;
            }
        }
    }

    return data;
}

/**
 * 反向地理编码 - 坐标→地址
 *
 * 接受 WGS-84 坐标，内部自动转换为 GCJ-02 后调用高德 API。
 *
 * @param {number} lng - WGS-84 经度
 * @param {number} lat - WGS-84 纬度
 * @returns {Promise<{address, province, city, district, adcode}>}
 */
export async function apiReverseGeocode(lng, lat) {
    // 高德 API 要求 GCJ-02 坐标，将 WGS-84 转换为 GCJ-02
    const [gcjLng, gcjLat] = wgs84ToGcj02(Number(lng), Number(lat));
    return backendAPI.get('/api/proxy/amap/geocode/regeo', {
        params: {
            location: `${gcjLng},${gcjLat}`,
            extensions: 'base',
            radius: 1000,
            batch: false,
        },
    });
}

/**
 * 地名搜索
 * @param {string} keywords - 搜索关键词
 * @param {string} region - 区域（可选）
 * @param {string} service - 服务商（可选: auto|amap|tianditu|nominatim）
 * @returns {Promise<Array>}
 */
export async function apiSearchLocations(keywords, region = '', service = 'auto') {
    const normalizedService = String(service || 'auto')
        .trim()
        .toLowerCase();
    const normalizedKeywords = String(keywords || '').trim();
    const normalizedRegion = String(region || '').trim();

    if (normalizedService === 'nominatim') {
        return backendAPI.get('/api/proxy/search/nominatim', {
            params: {
                keywords: normalizedKeywords,
                limit: 10,
            },
        });
    }

    return backendAPI.get('/api/proxy/amap/place/text', {
        params: {
            keywords: normalizedKeywords,
            city: normalizedRegion,
            page: 1,
            offset: 10,
            extensions: 'base',
        },
    });
}

/**
 * 搜索建议
 * @param {string} keywords - 搜索关键词
 * @param {string} city - 城市（可选）
 * @returns {Promise<Array>}
 */
export async function apiSearchSuggest(keywords, city = '') {
    return backendAPI.get('/api/proxy/amap/place/text', {
        params: {
            keywords: String(keywords || '').trim(),
            city: String(city || '').trim(),
            page: 1,
            offset: 8,
            extensions: 'base',
        },
    });
}

/**
 * IP 定位（已弃用，请使用 apiLocationIpLocate）
 * @deprecated 使用 apiLocationIpLocate 替代
 */
export async function apiGetLocationFromIP(ip = '') {
    return apiLocationIpLocate(ip);
}

/**
 * 统一 IP 定位 API
 * - 优先使用高德 API（精准定位，有用户配额限制）
 * - 高德失败或配额用完时，自动降级到免费服务（Nominatim、IP库等）
 * - 无用户级配额限制，用户可多次请求
 *
 * @param {string} ip - IP 地址（可选，不提供则使用请求 IP）
 * @param {Object} options - 选项
 * @param {boolean} options.preferFreeService - 是否优先使用免费服务（跳过高德，默认 false）
 * @param {boolean} options.silent - 是否静默模式（不显示错误信息，默认 false）
 */
export async function apiLocationIpLocate(ip = '', options = {}) {
    return backendAPI.post('/api/v1/location/ip-locate', {
        ip,
        prefer_free_service: options.preferFreeService || false,
        silent: options.silent || false,
    });
}

/**
 * 反向地理编码（后端代理）
 * - 通过后端统一调度多个服务（高德、天地图、Nominatim 等）
 * - 接受 WGS-84 坐标，后端内部自动转换为 GCJ-02 调用高德
 *
 * @param {number} lng - WGS-84 经度
 * @param {number} lat - WGS-84 纬度
 */
export async function apiLocationReverse(lng, lat, options = {}) {
    const config = {};
    // [Fix] 支持 AbortSignal 超时控制
    if (options.signal) {
        config.signal = options.signal;
    }
    return backendAPI.post('/api/v1/location/reverse', {
        lng,
        lat,
        prefer_service: options.preferService || 'auto',
        silent: options.silent || false,
    }, config);
}

/**
 * 用户初次访问时的自动定位
 * - 前端在用户进入登陆页面时调用
 * - 后端自动记录用户 IP、位置、访问时间等信息到数据库
 */
export async function apiLocationTrackVisit(options = {}) {
    return backendAPI
        .post('/api/v1/location/track-visit', {
            user_agent: options.userAgent || navigator?.userAgent || '',
            referrer: options.referrer || document?.referrer || '',
        }, {
            timeout: 3000, // 非关键请求，缩短超时避免阻塞首屏
        })
        .catch((error) => {
            // 定位追踪失败不影响正常业务流程，静默处理
            console.warn('[Location Tracking] 访问追踪失败:', error.message);
            const { warning: showWarning } = useMessage();
            showWarning(`访问追踪失败: ${error.message || '未知错误'}`);
            return null;
        });
}
