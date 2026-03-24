import axios from 'axios';

const amapClient = axios.create({
    // Static deployment mode: call AMap REST API directly (no Vite proxy).
    baseURL: 'https://restapi.amap.com',
    timeout: 8000
});

const tiandituClient = axios.create({
    // 按天地图接口文档使用 geocoder 端点。
    // 若页面为 https 且遇到混合内容限制，可改为 https://api.tianditu.gov.cn
    baseURL: 'https://api.tianditu.gov.cn',
    timeout: 8000
});

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

export async function searchAmapPlaces({
    key,
    keywords,
    city = '',
    page = 1,
    offset = 10,
    extensions = 'base'
}) {
    const response = await amapClient.get('/v3/place/text', {
        params: {
            key,
            keywords,
            city,
            page,
            offset,
            extensions
        }
    });

    return response?.data || {};
}
