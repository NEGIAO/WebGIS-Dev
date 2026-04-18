import axios from 'axios';
import backendAPI, { handleApiError } from './backend';
import { useMessage } from '@/composables/useMessage';
import { gcj02ToWgs84, wgs84ToGcj02 } from '@/utils/coordTransform.js';

const tiandituClient = axios.create({
    // 按天地图接口文档使用 geocoder 端点。
    // 若页面为 https 且遇到混合内容限制，可改为 https://api.tianditu.gov.cn
    baseURL: 'https://api.tianditu.gov.cn',
    timeout: 8000
});

function normalizeAmapCity(cityValue) {
    if (Array.isArray(cityValue)) {
        const first = cityValue.find((item) => typeof item === 'string' && item.trim());
        return first ? first.trim() : '';
    }
    if (typeof cityValue === 'string') {
        const normalized = cityValue.trim();
        return normalized === '[]' ? '' : normalized;
    }
    return '';
}

function parseLngLatText(locationText) {
    const parts = String(locationText || '').split(',');
    if (parts.length < 2) return null;
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lng, lat };
}

function normalizeTiandituAddressComponent(addressComponent = {}) {
    const province = String(addressComponent?.province || '').trim();
    const city = String(addressComponent?.city || addressComponent?.citycode || '').trim();
    const district = String(addressComponent?.county || addressComponent?.district || '').trim();
    const township = String(addressComponent?.town || addressComponent?.township || '').trim();
    const adcode = String(addressComponent?.adcode || addressComponent?.adCode || '').trim();

    return {
        province,
        city: city || province,
        district,
        township,
        adcode,
        businessAreas: []
    };
}

function resolveTiandituToken(preferredToken = '') {
    const preferred = String(preferredToken || '').trim();
    if (preferred) return preferred;

    const envToken = String(import.meta.env.VITE_TIANDITU_TK || '').trim();
    if (envToken) return envToken;

    return '';
}

/**
 * @typedef {Object} TiandituReverseGeocodeParams
 * @property {string|number} lon 经度，建议 WGS84，示例: 113.264385
 * @property {string|number} lat 纬度，建议 WGS84，示例: 23.129112
 * @property {string} tk 天地图 token（项目中的 VITE_TIANDITU_TK）
 * @property {string|number} [ver='1'] 接口版本，默认 1
 * @property {'geocode'} [type='geocode'] 固定值 geocode
 * @property {number} [timeout=8000] 超时时间（毫秒）
 * @property {AbortSignal} [signal] 可选取消信号
 */

/**
 * @typedef {Object} TiandituReverseGeocodeResult
 * @property {string} formattedAddress 格式化地址（result.formatted_address）
 * @property {Object} addressComponent 地址组件（result.addressComponent）
 * @property {Object} raw 原始返回数据
 */

/**
 * 天地图逆地理编码（Vue3 可直接 await 调用）
 *
 * API:
 * - Endpoint: https://api.tianditu.gov.cn/geocoder
 * - Method: GET
 * - Query: tk, type=geocode, postStr(JSON字符串)
 * - 约束: status === '0' 才视为成功
 *
 * @param {TiandituReverseGeocodeParams} params
 * @returns {Promise<TiandituReverseGeocodeResult>}
 * @throws {Error} status 非 0、参数缺失或网络异常时抛错
 */
export async function reverseGeocodeTianditu({
    lon,
    lat,
    tk,
    ver = '1',
    type = 'geocode',
    timeout = 8000,
    signal
}) {
    if (lon === undefined || lon === null || lon === '') {
        throw new Error('天地图逆地理编码缺少必填参数: lon');
    }
    if (lat === undefined || lat === null || lat === '') {
        throw new Error('天地图逆地理编码缺少必填参数: lat');
    }
    if (!tk || !String(tk).trim()) {
        throw new Error('天地图逆地理编码缺少必填参数: tk');
    }

    const postStrObject = {
        lon: String(lon),
        lat: String(lat),
        ver: String(ver)
    };

    const response = await tiandituClient.get('/geocoder', {
        params: {
            tk: String(tk).trim(),
            type,
            ver: String(ver),
            postStr: JSON.stringify(postStrObject)
        },
        timeout,
        signal
    });

    const data = response?.data || {};
    const status = String(data?.status ?? '');

    if (status !== '0') {
        const msg = data?.msg || data?.message || '天地图逆地理编码失败';
        throw new Error(`${msg} (status=${status || 'unknown'})`);
    }

    const result = data?.result || {};

    return {
        formattedAddress: result?.formatted_address || '',
        addressComponent: result?.addressComponent || {},
        raw: data
    };
}

/**
 * 高德地理编码：地址 -> 坐标（输出为 WGS-84）
 * @param {string} address
 * @param {string} [city='']
 * @param {{ silent?: boolean }} [options={}]
 * @returns {Promise<{lng:number,lat:number,adcode:string,level:string,formattedAddress:string}>}
 */
export async function addressToLocation(address, city = '', options = {}) {
    const message = useMessage();
    const normalizedAddress = String(address || '').trim();
    const silent = !!options?.silent;

    if (!normalizedAddress) {
        const error = new Error('地理编码缺少 address 参数');
        if (!silent) {
            message.warning(error.message, { closable: true, duration: 4500 });
        }
        throw error;
    }

    try {
        const response = await backendAPI.get('/api/proxy/amap/geocode/geo', {
            params: {
                address: normalizedAddress,
                city: String(city || '').trim()
            }
        });

        const data = response?.data || {};
        const status = String(data?.status ?? '0');

        if (status !== '1') {
            const reason = data?.info || data?.message || '高德地理编码失败';
            if (!silent) {
                message.error(`地理编码失败：${reason}`, { closable: true, duration: 5500 });
            }
            const notifiedError = new Error(`${reason} (status=${status})`);
            notifiedError.__notified = !silent;
            throw notifiedError;
        }

        const geocodes = Array.isArray(data?.geocodes) ? data.geocodes : [];
        const best = geocodes[0] || null;
        const gcjCoord = parseLngLatText(best?.location);
        if (!best || !gcjCoord) {
            const reason = '未找到有效的地址坐标结果';
            if (!silent) {
                message.warning(`地理编码失败：${reason}`, { closable: true, duration: 4500 });
            }
            const notifiedError = new Error(reason);
            notifiedError.__notified = !silent;
            throw notifiedError;
        }

        const [wgsLng, wgsLat] = gcj02ToWgs84(gcjCoord.lng, gcjCoord.lat);
        if (!Number.isFinite(wgsLng) || !Number.isFinite(wgsLat)) {
            throw new Error('坐标转换失败（GCJ-02 -> WGS-84）');
        }

        return {
            lng: wgsLng,
            lat: wgsLat,
            adcode: String(best?.adcode || ''),
            level: String(best?.level || ''),
            formattedAddress: String(best?.formatted_address || normalizedAddress)
        };
    } catch (error) {
        if (error?.isQuotaExceeded) {
            // 配额用完：使用友好提示
            handleApiError(error, message, '地理编码：API 调用额度已用完');
        } else {
            const detail = error instanceof Error ? error.message : '网络异常';
            if (!error?.__notified && !silent) {
                message.error(`地理编码请求异常：${detail}`, { closable: true, duration: 6000 });
            }
        }
        throw error instanceof Error ? error : new Error('地理编码失败');
    }
}

/**
 * 高德逆地理编码：坐标 -> 地址
 * 输入坐标为 WGS-84，内部自动转换为 GCJ-02 请求。
 * @param {number} lng WGS-84 经度
 * @param {number} lat WGS-84 纬度
 * @param {'base'|'all'} [extensions='base']
 * @param {{ silent?: boolean }} [options={}]
 * @returns {Promise<{formattedAddress:string,province:string,city:string,district:string,township:string,adcode:string,businessAreas:Array<{name:string,id?:string,location?:string}>,provider?:string}>}
 */
export async function locationToAddress(lng, lat, extensions = 'base', options = {}) {
    const message = useMessage();
    const wgsLng = Number(lng);
    const wgsLat = Number(lat);
    const silent = !!options?.silent;

    if (!Number.isFinite(wgsLng) || !Number.isFinite(wgsLat)) {
        const error = new Error('逆地理编码缺少有效坐标参数');
        if (!silent) {
            message.warning(error.message, { closable: true, duration: 4500 });
        }
        throw error;
    }

    const [gcjLng, gcjLat] = wgs84ToGcj02(wgsLng, wgsLat);
    if (!Number.isFinite(gcjLng) || !Number.isFinite(gcjLat)) {
        throw new Error('坐标转换失败（WGS-84 -> GCJ-02）');
    }

    try {
        const response = await backendAPI.get('/api/proxy/amap/geocode/regeo', {
            params: {
                location: `${gcjLng},${gcjLat}`,
                extensions,
                radius: 1000,
                batch: false
            }
        });

        const data = response?.data || {};
        const status = String(data?.status ?? '0');

        if (status !== '1') {
            const reason = data?.info || data?.message || '高德逆地理编码失败';
            if (!silent) {
                message.error(`逆地理编码失败：${reason}`, { closable: true, duration: 5500 });
            }
            const notifiedError = new Error(`${reason} (status=${status})`);
            notifiedError.__notified = !silent;
            throw notifiedError;
        }

        const regeocode = data?.regeocode || {};
        const ac = regeocode?.addressComponent || {};
        const province = String(ac?.province || '').trim();
        const city = normalizeAmapCity(ac?.city) || province;
        const district = String(ac?.district || '').trim();
        const township = String(ac?.township || '').trim();
        const adcode = String(ac?.adcode || '').trim();
        const businessAreasRaw = Array.isArray(ac?.businessAreas) ? ac.businessAreas : [];

        return {
            formattedAddress: String(regeocode?.formatted_address || '').trim(),
            province,
            city,
            district,
            township,
            adcode,
            businessAreas: businessAreasRaw.map((item) => ({
                name: String(item?.name || '').trim(),
                id: String(item?.id || '').trim(),
                location: String(item?.location || '').trim()
            })).filter((item) => item.name),
            provider: 'amap'
        };
    } catch (error) {
        if (error?.isQuotaExceeded) {
            // 配额用完：使用友好提示
            handleApiError(error, message, '逆地理编码：API 调用额度已用完');
        } else {
            const detail = error instanceof Error ? error.message : '网络异常';
            if (!error?.__notified && !silent) {
                message.error(`逆地理编码请求异常：${detail}`, { closable: true, duration: 6000 });
            }
        }
        throw error instanceof Error ? error : new Error('逆地理编码失败');
    }
}

/**
 * 统一逆地理编码（高德优先，天地图兜底）
 * @param {number|string} lng WGS-84 经度
 * @param {number|string} lat WGS-84 纬度
 * @param {{
 *   extensions?: 'base'|'all',
 *   tiandituTk?: string,
 *   tiandituTimeout?: number,
 *   silent?: boolean
 * }} [options={}]
 * @returns {Promise<{formattedAddress:string,province:string,city:string,district:string,township:string,adcode:string,businessAreas:Array<{name:string,id?:string,location?:string}>,provider:string}>}
 */
export async function reverseGeocodeByPriority(lng, lat, options = {}) {
    const {
        extensions = 'base',
        tiandituTk = '',
        tiandituTimeout = 8000,
        silent = false
    } = options || {};

    const wgsLng = Number(lng);
    const wgsLat = Number(lat);
    if (!Number.isFinite(wgsLng) || !Number.isFinite(wgsLat)) {
        throw new Error('逆地理编码缺少有效坐标参数');
    }

    try {
        return await locationToAddress(wgsLng, wgsLat, extensions, { silent });
    } catch (amapError) {
        const tk = resolveTiandituToken(tiandituTk);
        if (!tk) {
            throw amapError;
        }

        const tianditu = await reverseGeocodeTianditu({
            lon: wgsLng,
            lat: wgsLat,
            tk,
            timeout: Number(tiandituTimeout) > 0 ? Number(tiandituTimeout) : 8000
        });

        const normalized = normalizeTiandituAddressComponent(tianditu?.addressComponent || {});
        return {
            formattedAddress: String(tianditu?.formattedAddress || '').trim(),
            ...normalized,
            provider: 'tianditu'
        };
    }
}
