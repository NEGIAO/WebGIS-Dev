import axios from 'axios';
import { parseAmapAoiPayload } from '../utils/geo';

export {
    reverseGeocodeTianditu,
    addressToLocation,
    locationToAddress,
    reverseGeocodeByPriority
} from './geocoding';

const amapClient = axios.create({
    // Static deployment mode: call AMap REST API directly (no Vite proxy).
    baseURL: 'https://restapi.amap.com',
    timeout: 8000
});

function resolveAmapWebDetailBaseUrl() {
    if (import.meta.env.DEV) {
        return '/amap-web-detail';
    }

    if (typeof window === 'undefined') {
        return 'https://www.amap.com';
    }

    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
        return '/amap-web-detail';
    }

    return 'https://www.amap.com';
}

const amapWebDetailClient = axios.create({
    // AOI mining_shape 来源接口（无需 Web Service Key）
    baseURL: resolveAmapWebDetailBaseUrl(),
    timeout: 8000
});

function parseLngLatPair(text) {
    const parts = String(text || '').split(',');
    if (parts.length < 2) return null;

    const lng = Number.parseFloat(parts[0]);
    const lat = Number.parseFloat(parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    return [lng, lat];
}

function closeRingIfNeeded(ring = []) {
    if (ring.length < 3) return [];

    const first = ring[0];
    const last = ring[ring.length - 1];
    const isClosed = first[0] === last[0] && first[1] === last[1];
    if (!isClosed) {
        ring.push([first[0], first[1]]);
    }

    return ring.length >= 4 ? ring : [];
}

/**
 * 解析高德 AOI shape 字符串。
 * 支持格式："lng,lat;lng,lat;..." 或多环 "ring1|ring2|..."
 * @param {string} shape
 * @returns {number[][][]} GCJ-02 ring 列表
 */
function parseAmapMiningShape(shape) {
    const normalizedShape = String(shape || '').trim();
    if (!normalizedShape) return [];

    return normalizedShape
        .split('|')
        .map((ringText) => ringText.trim())
        .filter(Boolean)
        .map((ringText) => ringText
            .split(';')
            .map((pairText) => parseLngLatPair(pairText))
            .filter((point) => Array.isArray(point)))
        .map((ring) => closeRingIfNeeded(ring))
        .filter((ring) => Array.isArray(ring) && ring.length >= 4);
}

function extractAoiShapeFromDetail(data = {}) {
    return String(
        data?.data?.spec?.mining_shape?.shape
        || data?.spec?.mining_shape?.shape
        || data?.pois?.[0]?.spec?.mining_shape?.shape
        || data?.pois?.[0]?.biz_ext?.aoi
        || data?.pois?.[0]?.aoi
        || ''
    ).trim();
}

function extractBaseFromDetail(data = {}) {
    return data?.data?.base || data?.base || data?.pois?.[0] || {};
}

function normalizePrimitiveValue(value) {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        const normalizedArray = value
            .map((item) => normalizePrimitiveValue(item))
            .filter((item) => item !== null);
        return normalizedArray.length ? normalizedArray.join('; ') : null;
    }

    if (typeof value === 'object') {
        try {
            const text = JSON.stringify(value);
            return text && text !== '{}' ? text : null;
        } catch {
            return null;
        }
    }

    return null;
}

function extractMeaningfulAoiProperties(base = {}) {
    const result = {};
    Object.entries(base || {}).forEach(([key, value]) => {
        if (!key) return;
        if (/^pixel[xy]$/i.test(String(key))) return;

        const normalized = normalizePrimitiveValue(value);
        if (normalized === null) return;

        result[key] = normalized;
    });

    return result;
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function parseAmapWebDetailPayload(payload) {
    if (payload && typeof payload === 'object') return payload;

    const text = String(payload || '').trim();
    if (!text) return null;

    const direct = safeJsonParse(text);
    if (direct && typeof direct === 'object') return direct;

    const callbackStart = text.indexOf('(');
    const callbackEnd = text.lastIndexOf(')');
    if (callbackStart >= 0 && callbackEnd > callbackStart) {
        const inner = text.slice(callbackStart + 1, callbackEnd).trim();
        const jsonp = safeJsonParse(inner);
        if (jsonp && typeof jsonp === 'object') return jsonp;
    }

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const extracted = safeJsonParse(text.slice(jsonStart, jsonEnd + 1));
        if (extracted && typeof extracted === 'object') return extracted;
    }

    return null;
}

function isLikelyHtmlPayload(payload) {
    const text = String(payload || '').trim().toLowerCase();
    if (!text) return false;
    return text.startsWith('<!doctype html') || text.startsWith('<html');
}

function createAmapVerifyRequiredError(poiid, detail = '') {
    const normalizedPoiId = String(poiid || '').trim();
    const error = new Error(detail || '高德触发人机验证，请先完成验证后重试');
    error.code = 'AMAP_VERIFY_REQUIRED';
    error.poiid = normalizedPoiId;
    error.verifyUrl = normalizedPoiId
        ? `https://www.amap.com/detail/get/detail?id=${encodeURIComponent(normalizedPoiId)}`
        : 'https://www.amap.com';
    return error;
}

/**
 * 解析高德详情载荷（对象/JSON 字符串/JSONP 字符串）并提取 AOI。
 * @param {unknown} payload
 * @returns {{poiid:string,shape:string,rings:number[][][],ringsWgs84:number[][][],name:string,center:Object,base:Object,raw:Object,source:string}}
 */
export function parseAmapDetailAoiFromPayload(payload) {
    const parsed = parseAmapAoiPayload(payload);

    return {
        poiid: parsed.poiid,
        shape: parsed.shape,
        rings: parsed.ringsGcj02,
        ringsWgs84: parsed.ringsWgs84,
        name: parsed.name,
        base: parsed.base,
        center: parsed.center,
        raw: parsed.raw,
        source: 'amap-manual-json'
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

/**
 * 高德 POI 详情（含 AOI shape）
 * 优先接口：/detail/get/detail?id={poiid}（无需 token）
 * 兼容回退：/v3/place/detail（当提供 key 且 web 详情失败时）
 * 目标路径：data.spec.mining_shape.shape
 */
export async function fetchAmapPoiDetailAoi({
    key = '',
    poiid,
    extensions = 'all'
}) {
    const normalizedPoiId = String(poiid || '').trim();
    const normalizedKey = String(key || '').trim();

    if (!normalizedPoiId) {
        throw new Error('高德详情查询缺少 poiid 参数');
    }

    let data = null;
    let source = 'amap-web-detail';
    let lastError = null;

    try {
        const webResponse = await amapWebDetailClient.get('/detail/get/detail', {
            params: { id: normalizedPoiId },
            responseType: 'text',
            transformResponse: [(value) => value]
        });
        const rawPayload = webResponse?.data;
        const webData = parseAmapWebDetailPayload(rawPayload);
        if (webData && typeof webData === 'object') {
            const status = String(webData?.status ?? '1');
            if (status !== '1') {
                const reason = webData?.info || webData?.message || '高德 Web 详情查询失败';
                throw new Error(`${reason} (status=${status})`);
            }
            data = webData;
        } else if (isLikelyHtmlPayload(rawPayload)) {
            throw createAmapVerifyRequiredError(
                normalizedPoiId,
                '高德 Web 详情返回验证页面，未获取到 JSON（触发人机校验）'
            );
        } else {
            throw new Error('高德 Web 详情响应无法解析为 JSON 对象');
        }
    } catch (error) {
        lastError = error;
    }

    // 当 web 详情失败时，且调用方提供了 key，则尝试 REST 详情作为兜底。
    if (!data && normalizedKey) {
        try {
            const restResponse = await amapClient.get('/v3/place/detail', {
                params: {
                    key: normalizedKey,
                    id: normalizedPoiId,
                    extensions
                }
            });

            const restData = restResponse?.data || {};
            const status = String(restData?.status ?? '0');
            if (status !== '1') {
                const reason = restData?.info || restData?.message || '高德详情查询失败';
                throw new Error(`${reason} (status=${status})`);
            }

            data = restData;
            source = 'amap-rest-detail';
        } catch (error) {
            lastError = error;
        }
    }

    if (!data) {
        if (lastError instanceof Error) {
            throw lastError;
        }
        throw new Error('高德详情请求失败');
    }

    const shape = extractAoiShapeFromDetail(data);
    const rings = parseAmapMiningShape(shape);
    const base = extractMeaningfulAoiProperties(extractBaseFromDetail(data));

    return {
        poiid: normalizedPoiId,
        shape,
        rings,
        base,
        source,
        raw: data
    };
}
