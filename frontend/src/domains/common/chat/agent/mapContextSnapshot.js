import { BASEMAP_PRESETS, URL_LAYER_OPTIONS } from '@common/basemap/basemapPresets';
import { getBasemapIdByUrlLayerNumber } from '@common/basemap/basemapOptions';
import { decodeCesiumCameraState, decodeCesiumPoseState } from '@common/url-state/crypto';
import { MAP_VIEW_CESIUM, MAP_VIEW_OL, normalizeMapView } from '@common/url-state/urlConstants';
import { getCurrentQuerySnapshot } from '@common/url-state/urlQueryReader';

export const AGENT_MAP_CONTEXT_SCHEMA_VERSION = 1;

const MAX_OL_ZOOM = 30;
const MAX_CESIUM_HEIGHT = 100_000_000;
const MAX_BASEMAP_TEXT_LENGTH = 120;

/**
 * Build AgentMapContextV1 at send time. Runtime state wins; URL state is a safe fallback.
 * @returns {Record<string, unknown>}
 */
export function buildAgentMapContextSnapshot({ runtimeState = null, routeQuery = {} } = {}) {
    const querySnapshot = getCurrentQuerySnapshot(routeQuery);
    const runtimeView = normalizeRuntimeView(runtimeState?.view);
    const urlView = normalizeMapView(readScalar(querySnapshot.view));
    const view = runtimeView || urlView || MAP_VIEW_OL;
    const urlState = buildUrlState(querySnapshot, view);
    const runtimeContext = normalizeRuntimeState(runtimeState, view);
    const urlContext = buildUrlFallbackContext(querySnapshot, urlState, view);
    const center = runtimeContext.center || urlContext.center || null;
    const basemap = resolveBasemapContext(runtimeContext.basemap, urlState.l);

    const context = {
        schemaVersion: AGENT_MAP_CONTEXT_SCHEMA_VERSION,
        contextId: createContextId(),
        capturedAt: new Date().toISOString(),
        source: resolveSource(runtimeContext.available, hasMeaningfulUrlState(urlState)),
        view,
        center,
        basemap,
        urlState,
    };

    if (view === MAP_VIEW_CESIUM) {
        const cesium = runtimeContext.cesium || urlContext.cesium;
        if (cesium) context.cesium = cesium;
    } else {
        const ol = runtimeContext.ol || urlContext.ol;
        if (ol) context.ol = ol;
    }

    return context;
}

function normalizeRuntimeState(runtimeState, view) {
    if (!runtimeState || typeof runtimeState !== 'object' || runtimeState.view !== view) {
        return { available: false, center: null, basemap: null, ol: null, cesium: null };
    }

    const center = normalizeCenter(runtimeState.center);
    const basemap = normalizeBasemap(runtimeState.basemap);

    if (view === MAP_VIEW_CESIUM) {
        const raw = runtimeState.cesium && typeof runtimeState.cesium === 'object'
            ? runtimeState.cesium
            : {};
        const cameraHeight = parseRange(raw.cameraHeight, 0, MAX_CESIUM_HEIGHT);
        const heading = parseRange(raw.heading, -360, 360);
        const pitch = parseRange(raw.pitch, -90, 90);
        const roll = parseRange(raw.roll, -360, 360);
        const cesium = cameraHeight === null
            ? null
            : pruneEmpty({
                cameraHeight: round(cameraHeight, 2),
                heading: round(heading, 2),
                pitch: round(pitch, 2),
                roll: round(roll, 2),
            });
        return {
            available: !!(center || cesium || basemap),
            center,
            basemap,
            ol: null,
            cesium,
        };
    }

    const raw = runtimeState.ol && typeof runtimeState.ol === 'object' ? runtimeState.ol : {};
    const zoom = parseRange(raw.zoom, 0, MAX_OL_ZOOM);
    const resolution = parsePositive(raw.resolution);
    const viewportWidth = parsePositiveInteger(raw.viewportWidth);
    const viewportHeight = parsePositiveInteger(raw.viewportHeight);
    const ol = zoom === null
        ? null
        : pruneEmpty({
            zoom: round(zoom, 3),
            resolution: round(resolution, 6),
            viewportWidth,
            viewportHeight,
        });
    return {
        available: !!(center || ol || basemap),
        center,
        basemap,
        ol,
        cesium: null,
    };
}

function buildUrlState(querySnapshot, view) {
    const lng = parseRange(readScalar(querySnapshot.lng), -180, 180);
    const lat = parseRange(readScalar(querySnapshot.lat), -90, 90);
    const z = view === MAP_VIEW_CESIUM
        ? parseRange(readScalar(querySnapshot.z), 0, MAX_CESIUM_HEIGHT)
        : parseRange(readScalar(querySnapshot.z), 0, MAX_OL_ZOOM);
    const l = parseLayerIndex(readScalar(querySnapshot.l));

    return pruneEmpty({
        view,
        lng: round(lng, 6),
        lat: round(lat, 6),
        z: round(z, view === MAP_VIEW_CESIUM ? 2 : 3),
        l,
    });
}

function buildUrlFallbackContext(querySnapshot, urlState, view) {
    const center = Number.isFinite(urlState.lng) && Number.isFinite(urlState.lat)
        ? { lng: urlState.lng, lat: urlState.lat }
        : null;

    if (view === MAP_VIEW_CESIUM) {
        const cv = readScalar(querySnapshot.cv);
        const decodedCamera = decodeCesiumCameraState(cv);
        const decodedPose = decodeCesiumPoseState(cv) || decodedCamera;
        const cameraHeight = parseRange(decodedCamera?.height ?? urlState.z, 0, MAX_CESIUM_HEIGHT);
        const cesiumCenter = normalizeCenter(decodedCamera
            ? { lng: decodedCamera.lng, lat: decodedCamera.lat }
            : center);
        const cesium = cameraHeight === null
            ? null
            : pruneEmpty({
                cameraHeight: round(cameraHeight, 2),
                heading: round(parseRange(decodedPose?.heading, -360, 360), 2),
                pitch: round(parseRange(decodedPose?.pitch, -90, 90), 2),
                roll: round(parseRange(decodedPose?.roll, -360, 360), 2),
            });
        return { center: cesiumCenter, cesium, ol: null };
    }

    const zoom = parseRange(urlState.z, 0, MAX_OL_ZOOM);
    return {
        center,
        ol: zoom === null ? null : { zoom: round(zoom, 3) },
        cesium: null,
    };
}

function resolveBasemapContext(runtimeBasemap, urlLayerIndex) {
    const normalizedRuntime = normalizeBasemap(runtimeBasemap);
    const runtimeIndex = parseLayerIndex(normalizedRuntime?.index);
    const index = runtimeIndex ?? parseLayerIndex(urlLayerIndex);
    const idFromIndex = getBasemapIdByUrlLayerNumber(index);
    const id = clipText(normalizedRuntime?.id || idFromIndex, MAX_BASEMAP_TEXT_LENGTH) || null;
    const preset = id ? BASEMAP_PRESETS.find((item) => item.id === id) : null;
    const label = clipText(normalizedRuntime?.label || preset?.label || id, MAX_BASEMAP_TEXT_LENGTH) || null;

    return {
        index: Number.isInteger(index) ? index : null,
        id,
        label,
    };
}

function normalizeBasemap(value) {
    if (!value || typeof value !== 'object') return null;
    const index = parseLayerIndex(value.index);
    const id = clipText(value.id, MAX_BASEMAP_TEXT_LENGTH) || null;
    const label = clipText(value.label, MAX_BASEMAP_TEXT_LENGTH) || null;
    if (index === null && !id && !label) return null;
    return { index, id, label };
}

function normalizeCenter(value) {
    if (!value || typeof value !== 'object') return null;
    const lng = parseRange(value.lng, -180, 180);
    const lat = parseRange(value.lat, -90, 90);
    if (lng === null || lat === null) return null;
    return { lng: round(lng, 6), lat: round(lat, 6) };
}

function hasMeaningfulUrlState(urlState) {
    return ['lng', 'lat', 'z', 'l'].some((key) => urlState[key] !== undefined);
}

function resolveSource(hasRuntime, hasUrl) {
    if (hasRuntime && hasUrl) return 'runtime+url';
    if (hasRuntime) return 'runtime';
    return 'url';
}

function normalizeRuntimeView(value) {
    const text = String(value || '').trim().toLowerCase();
    return text === MAP_VIEW_OL || text === MAP_VIEW_CESIUM ? text : null;
}

let contextIdCounter = 0;

function createContextId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    contextIdCounter = (contextIdCounter + 1) % 1_000_000;
    return `map-${Date.now().toString(36)}-${contextIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readScalar(value) {
    return Array.isArray(value) ? value[value.length - 1] : value;
}

function parseRange(value, min, max) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function parsePositive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function parsePositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && number <= 100_000 ? number : null;
}

function parseLayerIndex(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= URL_LAYER_OPTIONS.length
        ? number
        : null;
}

function round(value, digits) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function clipText(value, maxLength) {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, maxLength) : '';
}

function pruneEmpty(value) {
    if (!value || typeof value !== 'object') return value;
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
        if (item === null || item === undefined || item === '') return;
        output[key] = item;
    });
    return output;
}
