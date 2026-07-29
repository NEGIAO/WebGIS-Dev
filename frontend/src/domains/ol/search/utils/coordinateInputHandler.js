/**
 * Coordinate input processing helpers used by TOC draw panel.
 * Validation messages go through translate (layer.*) for UI language.
 */
import { translate as t } from '@common/app/useLocale';

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
            error: t('layer.coordEmptyRequired'),
        };
    }

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return {
            valid: false,
            error: t('layer.coordMustBeNumber'),
        };
    }

    if (lng < -180 || lng > 180) {
        return {
            valid: false,
            error: t('layer.coordLngOutOfRange'),
        };
    }

    if (lat < -90 || lat > 90) {
        return {
            valid: false,
            error: t('layer.coordLatOutOfRange'),
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
        lat: normalizeCoordinateValue(lat, precision),
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
            crsType: String(crsType || 'wgs84').toLowerCase(),
        };
    }

    const normalized = normalizeCoordinatePair(validation.lng, validation.lat, 6);
    if (!Number.isFinite(normalized.lng) || !Number.isFinite(normalized.lat)) {
        return {
            valid: false,
            message: t('layer.coordNormalizeFailed'),
            lng: null,
            lat: null,
            crsType: String(crsType || 'wgs84').toLowerCase(),
        };
    }

    return {
        valid: true,
        message: '',
        lng: normalized.lng,
        lat: normalized.lat,
        crsType: String(crsType || 'wgs84').toLowerCase(),
    };
}
