import { gcj02ToWgs84 } from '../../coordTransform';

function createParserError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function parsePayloadToObject(payload) {
    if (payload && typeof payload === 'object') return payload;

    const text = String(payload || '').trim();
    if (!text) {
        throw createParserError('AMAP_AOI_EMPTY_PAYLOAD', '请输入高德详情 JSON');
    }

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

    throw createParserError('AMAP_AOI_INVALID_JSON', '输入内容不是有效的 JSON 对象');
}

function extractAoiShape(data = {}) {
    return String(
        data?.data?.spec?.mining_shape?.shape
        || data?.spec?.mining_shape?.shape
        || data?.pois?.[0]?.spec?.mining_shape?.shape
        || data?.pois?.[0]?.biz_ext?.aoi
        || data?.pois?.[0]?.aoi
        || ''
    ).trim();
}

function extractBaseNode(data = {}) {
    const base = data?.data?.base || data?.base || data?.pois?.[0] || {};
    return base && typeof base === 'object' ? base : {};
}

function extractPoiId(data = {}) {
    return String(
        data?.data?.base?.poiid
        || data?.base?.poiid
        || data?.pois?.[0]?.id
        || data?.pois?.[0]?.poiid
        || data?.id
        || ''
    ).trim();
}

function extractPoiName(data = {}, base = {}) {
    return String(
        base?.name
        || data?.data?.base?.name
        || data?.base?.name
        || data?.pois?.[0]?.name
        || ''
    ).trim();
}

function normalizeBaseProperties(base = {}) {
    const result = {};
    Object.entries(base || {}).forEach(([key, value]) => {
        if (!key) return;

        if (value === null || value === undefined) return;

        if (typeof value === 'string') {
            result[key] = value;
            return;
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            result[key] = value;
            return;
        }

        if (Array.isArray(value) || typeof value === 'object') {
            try {
                result[key] = JSON.stringify(value);
            } catch {
                result[key] = String(value);
            }
            return;
        }

        result[key] = String(value);
    });
    return result;
}

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

function parseShapeToGcjRings(shape = '') {
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

function convertGcjRingsToWgs84(gcjRings = []) {
    return (gcjRings || [])
        .map((ring) => {
            const convertedRing = (ring || [])
                .map((point) => {
                    const gcjLng = Number(point?.[0]);
                    const gcjLat = Number(point?.[1]);
                    if (!Number.isFinite(gcjLng) || !Number.isFinite(gcjLat)) return null;
                    const [wgsLng, wgsLat] = gcj02ToWgs84(gcjLng, gcjLat);
                    if (!Number.isFinite(wgsLng) || !Number.isFinite(wgsLat)) return null;
                    return [wgsLng, wgsLat];
                })
                .filter((point) => Array.isArray(point) && point.length === 2);

            return closeRingIfNeeded(convertedRing);
        })
        .filter((ring) => Array.isArray(ring) && ring.length >= 4);
}

function extractCenter(data = {}, base = {}) {
    const centerText = String(
        data?.data?.spec?.mining_shape?.center
        || data?.spec?.mining_shape?.center
        || ''
    ).trim();

    if (centerText) {
        const centerPair = parseLngLatPair(centerText);
        if (centerPair) {
            const [wgsLng, wgsLat] = gcj02ToWgs84(centerPair[0], centerPair[1]);
            if (Number.isFinite(wgsLng) && Number.isFinite(wgsLat)) {
                return {
                    gcj: centerPair,
                    wgs84: [wgsLng, wgsLat]
                };
            }
        }
    }

    const x = Number.parseFloat(base?.x);
    const y = Number.parseFloat(base?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
        const [wgsLng, wgsLat] = gcj02ToWgs84(x, y);
        if (Number.isFinite(wgsLng) && Number.isFinite(wgsLat)) {
            return {
                gcj: [x, y],
                wgs84: [wgsLng, wgsLat]
            };
        }
    }

    return { gcj: null, wgs84: null };
}

export function parseAmapAoiPayload(payload) {
    const data = parsePayloadToObject(payload);
    const shape = extractAoiShape(data);
    if (!shape) {
        throw createParserError('AMAP_AOI_NO_SHAPE', '未发现边界数据');
    }

    const ringsGcj02 = parseShapeToGcjRings(shape);
    if (!ringsGcj02.length) {
        throw createParserError('AMAP_AOI_INVALID_SHAPE', '未发现边界数据');
    }

    const ringsWgs84 = convertGcjRingsToWgs84(ringsGcj02);
    if (!ringsWgs84.length) {
        throw createParserError('AMAP_AOI_CONVERT_FAILED', '边界坐标转换失败');
    }

    const baseNode = extractBaseNode(data);
    const base = normalizeBaseProperties(baseNode);
    const poiid = extractPoiId(data);
    const name = extractPoiName(data, baseNode);
    const center = extractCenter(data, baseNode);

    return {
        raw: data,
        shape,
        poiid,
        name,
        base,
        center,
        ringsGcj02,
        ringsWgs84
    };
}

export function extractAmapPoiId(payload) {
    try {
        const data = parsePayloadToObject(payload);
        return extractPoiId(data);
    } catch {
        return '';
    }
}
