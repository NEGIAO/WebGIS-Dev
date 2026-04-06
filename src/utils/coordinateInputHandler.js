/**
 * Coordinate input processing helpers used by TOC draw panel.
 */

function toNumberLike(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    const trimmed = value.trim();
    if (!trimmed) return NaN;
    return Number(trimmed);
}

export function validateCoordinateInput(rawLng, rawLat) {
    const lng = toNumberLike(rawLng);
    const lat = toNumberLike(rawLat);

    if (!String(rawLng ?? '').trim() || !String(rawLat ?? '').trim()) {
        return {
            valid: false,
            error: '请输入完整的经纬度（经度、纬度均不能为空）'
        };
    }

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return {
            valid: false,
            error: '经纬度必须是有效数字'
        };
    }

    if (lng < -180 || lng > 180) {
        return {
            valid: false,
            error: '经度超出范围（-180 ~ 180）'
        };
    }

    if (lat < -90 || lat > 90) {
        return {
            valid: false,
            error: '纬度超出范围（-90 ~ 90）'
        };
    }

    return { valid: true, lng, lat };
}

export function normalizeCoordinateValue(value, precision = 6) {
    const num = Number(value);
    if (!Number.isFinite(num)) return NaN;
    return Number(num.toFixed(precision));
}

export function normalizeCoordinatePair(lng, lat, precision = 6) {
    return {
        lng: normalizeCoordinateValue(lng, precision),
        lat: normalizeCoordinateValue(lat, precision)
    };
}

export function generatePointName(lng, lat, crsType = 'wgs84') {
    const prefix = String(crsType || 'wgs84').toUpperCase();
    return `${prefix}_${Number(lng).toFixed(6)}_${Number(lat).toFixed(6)}`;
}

export function processCoordinateInput(rawLng, rawLat, crsType = 'wgs84') {
    const validation = validateCoordinateInput(rawLng, rawLat);
    if (!validation.valid) {
        return {
            valid: false,
            message: validation.error,
            lng: null,
            lat: null,
            crsType: String(crsType || 'wgs84').toLowerCase()
        };
    }

    const normalized = normalizeCoordinatePair(validation.lng, validation.lat, 6);
    if (!Number.isFinite(normalized.lng) || !Number.isFinite(normalized.lat)) {
        return {
            valid: false,
            message: '坐标标准化失败，请重新输入',
            lng: null,
            lat: null,
            crsType: String(crsType || 'wgs84').toLowerCase()
        };
    }

    return {
        valid: true,
        message: '',
        lng: normalized.lng,
        lat: normalized.lat,
        crsType: String(crsType || 'wgs84').toLowerCase()
    };
}
