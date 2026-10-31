/**
 * 地名/POI 搜索模块（高德 + 天地图 + Nominatim）
 *
 * ===== 坐标系统契约 =====
 * 本模块遵循统一约定：
 *   - 高德 POI 搜索返回的 GCJ-02 坐标自动转换为 WGS-84 输出
 *   - 天地图、Nominatim 直接返回 WGS-84，无需转换
 *   - 搜索关键词（文本）不涉及坐标系
 *   - 上层调用方始终拿到 WGS-84 坐标
 * =========================
 */

import backendAPI from './backend';
import { gcj02ToWgs84, wgs84ToGcj02 } from '@common/data-import/crs/coordTransform';
import { getAmapErrorMessage, getHttpStatusMessage } from './httpStatusMap';

const AMAP_SUCCESS_STATUS = '1';
const AMAP_SUCCESS_INFOCODE = '10000';

function normalizeTiandituItem(item) {
    if (!item) return null;

    const name =
        item.name ||
        item.poiName ||
        item.areaName ||
        item.displayName ||
        item.title ||
        item.address ||
        item.keyWord ||
        '未知地点';

    let lon = item.lon || item.lng || item.x;
    let lat = item.lat || item.latit || item.y;

    if ((!lon || !lat) && item.lonlat) {
        const parts = String(item.lonlat).split(',');
        if (parts.length >= 2) {
            lon = parts[0];
            lat = parts[1];
        }
    }

    if (!lon || !lat || Number.isNaN(parseFloat(lon)) || Number.isNaN(parseFloat(lat))) {
        return null;
    }

    return {
        display_name: name,
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        original: item,
    };
}

function parseTiandituResponse(data) {
    if (!data) return [];

    // 不预置空数组：下面每个分支都必然赋值，末尾 else 直接 return，
    // 预置值属于无用赋值（eslint no-useless-assignment）。
    let rawList;

    if (data.area) {
        rawList = [data.area];
    } else if (Array.isArray(data.areas)) {
        rawList = data.areas;
    } else if (Array.isArray(data.pois)) {
        rawList = data.pois;
    } else if (data.queryResults && Array.isArray(data.queryResults.results)) {
        rawList = data.queryResults.results;
    } else if (Array.isArray(data.results)) {
        rawList = data.results;
    } else if (Array.isArray(data.data)) {
        rawList = data.data;
    } else if (Array.isArray(data)) {
        rawList = data;
    } else {
        return [];
    }

    return rawList.map(normalizeTiandituItem).filter((item) => item !== null);
}

async function searchWithTianditu({ keywords, page = 1, pageSize = 10, tiandituTk, mapBound, signal }) {
    if (!tiandituTk) {
        throw new Error('天地图配置错误：Token 未配置');
    }

    // 如果没有提供 mapBound，使用全国范围的默认值
    // mapBound 格式: "minLon,minLat,maxLon,maxLat"
    const defaultBound = '73.5,18.2,135.0,53.5'; // 中国大约范围
    const finalMapBound = String(mapBound || '').trim() || defaultBound;

    const postObj = {
        keyWord: keywords,
        level: 12,
        mapBound: finalMapBound,
        queryType: 1,
        start: Math.max(0, (page - 1) * pageSize),
        count: pageSize,
    };

    const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(JSON.stringify(postObj))}&type=query&tk=${encodeURIComponent(tiandituTk)}`;

    try {
        // 天地图 API 支持 CORS，浏览器直接请求（无需走后端代理）
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const data = await res.json();

        const items = parseTiandituResponse(data);
        const total = Number(data?.count ?? items.length);

        return {
            items,
            total: Number.isFinite(total) ? total : items.length,
        };
    } catch (error) {
        if (error?.name === 'AbortError') throw error;

        const errorMsg = error.message || '搜索失败';
        const httpStatus = error.status || 0;

        if (errorMsg.includes('Token')) {
            console.warn('天地图配置错误：Token 未配置');
            throw new Error('天地图配置错误：Token 未配置', { cause: error });
        }
        if ([502, 503, 504].includes(httpStatus)) {
            const msg = `天地图服务暂不可用 [${httpStatus} ${getHttpStatusMessage(httpStatus)}]，请稍后重试`;
            console.warn(msg);
            throw new Error(msg, { cause: error });
        }
        if (httpStatus >= 400) {
            const msg = `天地图搜索失败 [${httpStatus} ${getHttpStatusMessage(httpStatus)}]: ${errorMsg}`;
            console.warn(msg);
            throw new Error(msg, { cause: error });
        }
        if (errorMsg.includes('无法连接')) {
            console.warn('天地图搜索：网络连接失败，请检查网络设置');
            throw new Error('天地图搜索：网络连接失败，请检查网络设置', { cause: error });
        }
        if (errorMsg.includes('超时')) {
            console.warn('天地图搜索：请求超时，请稍后重试');
            throw new Error('天地图搜索：请求超时，请稍后重试', { cause: error });
        }

        console.warn(`天地图搜索失败: ${errorMsg}`);
        throw new Error(`天地图搜索失败: ${errorMsg}`, { cause: error });
    }
}

export async function searchWithNominatim({ keywords, pageSize = 10, page = 1, signal }) {
    try {
        const data = await backendAPI.get('/api/proxy/search/nominatim', {
            params: {
                keywords,
                limit: pageSize,
            },
            signal,
        });

        // 后端返回的是 Nominatim API 的原始响应（数组）
        const items = Array.isArray(data)
            ? data
                  .map((item) => ({
                      name: item.display_name,
                      address: item.display_name,
                      display_name: item.display_name,
                      lon: parseFloat(item.lon),
                      lat: parseFloat(item.lat),
                      poiid: item.place_id, // Nominatim 用 place_id 作为唯一标识
                  }))
                  .filter((item) => !isNaN(item.lon) && !isNaN(item.lat))
            : [];

        const total =
            page === 1
                ? items.length
                : Math.max(items.length + (page - 1) * pageSize, items.length);
        return { items, total };
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        // 处理错误并提供详细的错误信息
        // 错误经 throw 交由调用方(LocationSearch.vue 等)以 message toast 提示,此处不重复 console.error
        // console.error('Nominatim search error:', error);
        const errorMsg = error.message || '搜索失败';
        const httpStatus = error.status || error.originalError?.response?.status || 0;

        // 使用统一状态码映射
        if ([502, 503, 504].includes(httpStatus)) {
            const msg = `国际地名服务暂不可用 [${httpStatus} ${getHttpStatusMessage(httpStatus)}]，请稍后重试`;
            console.warn(msg);
            throw new Error(msg, { cause: error });
        }
        if (httpStatus >= 400) {
            const msg = `国际地名搜索失败 [${httpStatus} ${getHttpStatusMessage(httpStatus)}]: ${errorMsg}`;
            console.warn(msg);
            throw new Error(msg, { cause: error });
        }

        if (errorMsg.includes('无法连接')) {
            console.warn('网络连接失败，请检查网络设置');
            throw new Error('网络连接失败，请检查网络设置', { cause: error });
        }
        if (errorMsg.includes('超时')) {
            console.warn('搜索超时，请稍后重试');
            throw new Error('搜索超时，请稍后重试', { cause: error });
        }

        console.warn(`国际地名搜索失败: ${errorMsg}`);
        throw new Error(`国际地名搜索失败: ${errorMsg}`, { cause: error });
    }
}

/**
 * 将高德 POI 数组归一化为统一条目（坐标转 WGS-84，丢弃无坐标项）。
 * @param {Array<Object>} pois 高德 `pois` 原始数组
 * @returns {Array<Object>}
 */
function mapAmapPoiItems(pois) {
    const list = Array.isArray(pois) ? pois : [];
    return list
        .map((poi) => {
            const location = String(poi.location || '').split(',');
            const gcjLon = Number.parseFloat(location[0]);
            const gcjLat = Number.parseFloat(location[1]);
            const [wgsLon, wgsLat] = gcj02ToWgs84(gcjLon, gcjLat);
            // 距离为 0 是合法值（圆心本身命中），不能用 `|| undefined` 吞掉
            const distance = Number.parseFloat(poi.distance);
            return {
                id: poi.id,
                name: poi.name,
                address: poi.address || poi.pname || '',
                display_name: `${poi.name}${poi.address ? ` - ${poi.address}` : ''}`,
                lon: Number.isFinite(wgsLon) ? wgsLon : undefined,
                lat: Number.isFinite(wgsLat) ? wgsLat : undefined,
                gcjLon: Number.isFinite(gcjLon) ? gcjLon : undefined,
                gcjLat: Number.isFinite(gcjLat) ? gcjLat : undefined,
                distance: Number.isFinite(distance) ? distance : undefined,
                coordSystem: 'wgs84',
            };
        })
        .filter((item) => item.lon !== undefined && item.lat !== undefined);
}

/**
 * 高德周边检索（类目词 + 空间约束）。
 *
 * 与 `searchWithAmap`（place/text，全国范围）的区别：本函数以给定圆心做圆形区域检索，
 * 结果按距离排序，因此「附近的餐馆」这类意图只能由它正确表达。
 * 坐标契约：入参 WGS-84，请求前转 GCJ-02；返回条目统一转回 WGS-84。
 *
 * @param {Object} params
 * @param {string} params.keywords 关键词（可为空，表示按分类取全部）
 * @param {number} params.lng 圆心经度（WGS-84）
 * @param {number} params.lat 圆心纬度（WGS-84）
 * @param {number} [params.radius=3000] 半径（米）
 * @param {number} [params.pageSize=10]
 * @returns {Promise<{items: Array<Object>, total: number}>}
 */
export async function searchWithAmapAround({ keywords, lng, lat, radius = 3000, page = 1, pageSize = 10, signal } = {}) {
    const [gcjLng, gcjLat] = wgs84ToGcj02(Number(lng), Number(lat));
    if (!Number.isFinite(gcjLng) || !Number.isFinite(gcjLat)) {
        throw new Error('周边搜索缺少有效的中心坐标');
    }

    const data = await backendAPI.get('/api/proxy/amap/place/around', {
        params: {
            location: `${gcjLng.toFixed(6)},${gcjLat.toFixed(6)}`,
            keywords: String(keywords || '').trim(),
            radius: Math.min(Math.max(Number(radius) || 3000, 0), 50000),
            page,
            offset: pageSize,
        },
        signal,
        // 周边搜索是「主路径的一次尝试」，失败由上层降级接管；
        // 不静默会在无结果场景下弹出误导性的红色 400 提示。
        silent: true,
    });

    const status = String(data?.status ?? '0');
    const infocode = String(data?.infocode ?? '');
    const isSuccess = status === AMAP_SUCCESS_STATUS && (!infocode || infocode === AMAP_SUCCESS_INFOCODE);
    if (!isSuccess) {
        throw new Error(`高德周边搜索失败: ${data?.info || data?.message || '未知错误'} (status=${status}, infocode=${infocode || 'unknown'})`);
    }

    const items = mapAmapPoiItems(data?.pois);
    const total = Number(data?.count ?? items.length);
    return { items, total: Number.isFinite(total) ? total : items.length };
}

async function searchWithAmap({ keywords, page = 1, pageSize = 10, city = '', signal }) {
    try {
        // 调用后端代理而不是直接调用高德 API
        const data = await backendAPI.get('/api/proxy/amap/place/text', {
            params: {
                keywords,
                page,
                offset: pageSize,
                // city/citylimit 用于把结果约束在指定城市：不带位置偏置时，
                // 「餐馆」这类类目词会返回全国首条（常常落在北京）
                city: String(city || '').trim(),
                citylimit: city ? 'true' : undefined,
            },
            signal,
        });

        // 检查高德 API 响应状态
        const status = String(data?.status ?? '0');
        const infocode = String(data?.infocode ?? '');
        const isSuccess =
            status === AMAP_SUCCESS_STATUS && (!infocode || infocode === AMAP_SUCCESS_INFOCODE);

        if (!isSuccess) {
            const failInfocode = data?.infocode || 'unknown';
            const errorMsg = data?.info || data?.message || '搜索失败';

            // 使用统一的高德 infocode 映射
            const detailedMsg = getAmapErrorMessage(failInfocode).includes('未知')
                ? errorMsg
                : getAmapErrorMessage(failInfocode);

            throw new Error(`高德搜索失败: ${detailedMsg} (status=${status}, 错误码=${failInfocode})`);
        }

        // 解析 POI 列表
        const items = mapAmapPoiItems(data?.pois);

        const total = Number(data?.count ?? items.length);
        return { items, total: Number.isFinite(total) ? total : items.length };
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        // 处理后端或 API 错误
        // 错误经 throw 交由调用方以 message toast 提示,此处不重复 console.error
        // console.error('Amap search error:', error);
        const errorMsg = error.message || '搜索失败';
        const httpStatus = error.status || error.originalError?.response?.status || 0;

        if (error.isQuotaExceeded) {
            // 拦截器已提示配额用完，此处仅重新抛出，避免双重 toast
            throw new Error('高德API配额已用完，请升级账户或稍后重试', { cause: error });
        }

        // 使用统一状态码映射处理 HTTP 错误
        if (httpStatus === 401) {
            const msg = `权限不足 [401 ${getHttpStatusMessage(401)}]，请确保已正确配置高德API Key，如问题持续请联系管理员`;
            console.warn(msg);
            throw new Error(msg, { cause: error });
        }
        if (httpStatus === 403) {
            const msg = `高德API访问被拒绝 [403 ${getHttpStatusMessage(403)}]，请检查API Key是否有效`;
            console.warn(msg);
            throw new Error(msg, { cause: error });
        }
        if (httpStatus === 503) {
            const msg = `高德服务暂不可用 [503 ${getHttpStatusMessage(503)}]，后端可能未配置API Key，请联系管理员`;
            console.warn(msg);
            throw new Error(msg, { cause: error });
        }
        if (httpStatus >= 400) {
            const msg = `高德搜索请求失败 [${httpStatus} ${getHttpStatusMessage(httpStatus)}]: ${errorMsg}`;
            console.warn(msg);
            throw new Error(msg, { cause: error });
        }

        if (errorMsg.includes('错误码')) {
            throw error; // 重新抛出带有错误码的错误
        }

        if (errorMsg.includes('无法连接')) {
            console.warn('无法连接到高德服务，请检查网络');
            throw new Error('无法连接到高德服务，请检查网络', { cause: error });
        }

        if (errorMsg.includes('超时')) {
            console.warn('搜索请求超时，请稍后重试');
            throw new Error('搜索请求超时，请稍后重试', { cause: error });
        }

        console.warn(`高德地名搜索失败: ${errorMsg}`);
        throw new Error(`高德地名搜索失败: ${errorMsg}`, { cause: error });
    }
}

export async function fetchLocationResultsByService({
    service,
    keywords,
    page = 1,
    pageSize = 10,
    tiandituTk = '',
    mapBound,
    city = '',
    signal,
}) {
    if (!keywords) {
        return { items: [], total: 0 };
    }

    if (service === 'tianditu') {
        return searchWithTianditu({ keywords, page, pageSize, tiandituTk, mapBound, signal });
    }
    if (service === 'nominatim') {
        return searchWithNominatim({ keywords, page, pageSize, signal });
    }
    if (service === 'amap') {
        return searchWithAmap({ keywords, page, pageSize, city, signal });
    }
    throw new Error(`未知搜索服务: ${service}`);
}
