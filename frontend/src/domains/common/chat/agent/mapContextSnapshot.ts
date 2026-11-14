import { BASEMAP_PRESETS, URL_LAYER_OPTIONS } from '@common/basemap/basemapPresets';
import { getBasemapIdByUrlLayerNumber } from '@common/basemap/basemapOptions';
import { decodeCesiumCameraState, decodeCesiumPoseState } from '@common/url-state/crypto';
import { MAP_VIEW_CESIUM, MAP_VIEW_OL, normalizeMapView } from '@common/url-state/urlConstants';
import { getCurrentQuerySnapshot } from '@common/url-state/urlQueryReader';

export const AGENT_MAP_CONTEXT_SCHEMA_VERSION = 1;

const MAX_OL_ZOOM = 30;
const MAX_CESIUM_HEIGHT = 100_000_000;
const MAX_BASEMAP_TEXT_LENGTH = 120;

// ============================================================
//  类型定义
// ============================================================

/** 归一化后的经纬度中心点 */
export interface AgentMapCenter {
    lng: number;
    lat: number;
}

/** 2D 视图上下文 */
export interface AgentOlContext {
    zoom?: number | null;
    resolution?: number | null;
    viewportWidth?: number | null;
    viewportHeight?: number | null;
}

/** 3D 相机上下文 */
export interface AgentCesiumContext {
    cameraHeight?: number | null;
    heading?: number | null;
    pitch?: number | null;
    roll?: number | null;
}

/** 底图上下文（运行时值与 URL 层号合并后的结果） */
export interface AgentBasemapContext {
    index: number | null;
    id: string | null;
    label: string | null;
}

/** URL 派生状态（无效字段由 pruneEmpty 剔除） */
export interface AgentMapUrlState {
    view?: string;
    lng?: number | null;
    lat?: number | null;
    z?: number | null;
    l?: number | null;
    [key: string]: unknown;
}

/** 发送给 Agent 的地图上下文快照（V1） */
export interface AgentMapContextV1 {
    schemaVersion: number;
    contextId: string;
    capturedAt: string;
    source: 'runtime+url' | 'runtime' | 'url';
    view: string;
    center: AgentMapCenter | null;
    basemap: AgentBasemapContext;
    urlState: AgentMapUrlState;
    cesium?: AgentCesiumContext | null;
    ol?: AgentOlContext | null;
}

export interface BuildAgentMapContextOptions {
    /** 宿主 useMapState / useCesiumLayers 提供的运行时状态 */
    runtimeState?: any;
    /** 路由 query（用于 URL 兜底） */
    routeQuery?: any;
}

interface NormalizedBasemap {
    index: number | null;
    id: string | null;
    label: string | null;
}

interface NormalizedRuntimeContext {
    available: boolean;
    center: AgentMapCenter | null;
    basemap: NormalizedBasemap | null;
    ol: AgentOlContext | null;
    cesium: AgentCesiumContext | null;
}

interface UrlFallbackContext {
    center: AgentMapCenter | null;
    cesium: AgentCesiumContext | null;
    ol: AgentOlContext | null;
}

// ============================================================
//  快照构建
// ============================================================

/** 无参调用时的共享空值（只读使用，等价于每次新建 {}） */
const DEFAULT_SNAPSHOT_OPTIONS: BuildAgentMapContextOptions = Object.freeze({});
const DEFAULT_ROUTE_QUERY: Record<string, unknown> = Object.freeze({});

/** Build AgentMapContextV1 at send time. Runtime state wins; URL state is a safe fallback. */
export function buildAgentMapContextSnapshot(
    options: BuildAgentMapContextOptions = DEFAULT_SNAPSHOT_OPTIONS,
): AgentMapContextV1 {
    const { runtimeState = null, routeQuery = DEFAULT_ROUTE_QUERY } = options;
    const querySnapshot = getCurrentQuerySnapshot(routeQuery);
    const runtimeView = normalizeRuntimeView(runtimeState?.view);
    const urlView = normalizeMapView(readScalar(querySnapshot.view));
    const view = runtimeView || urlView || MAP_VIEW_OL;
    const urlState = buildUrlState(querySnapshot, view);
    const runtimeContext = normalizeRuntimeState(runtimeState, view);
    const urlContext = buildUrlFallbackContext(querySnapshot, urlState, view);
    const center = runtimeContext.center || urlContext.center || null;
    const basemap = resolveBasemapContext(runtimeContext.basemap, urlState.l);

    const context: AgentMapContextV1 = {
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

function normalizeRuntimeState(runtimeState: any, view: string): NormalizedRuntimeContext {
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

function buildUrlState(querySnapshot: any, view: string): AgentMapUrlState {
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

function buildUrlFallbackContext(
    querySnapshot: any,
    urlState: AgentMapUrlState,
    view: string,
): UrlFallbackContext {
    const rawLng = urlState.lng;
    const rawLat = urlState.lat;
    const center = typeof rawLng === 'number' && Number.isFinite(rawLng)
        && typeof rawLat === 'number' && Number.isFinite(rawLat)
        ? { lng: rawLng, lat: rawLat }
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

function resolveBasemapContext(runtimeBasemap: any, urlLayerIndex: any): AgentBasemapContext {
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

function normalizeBasemap(value: any): NormalizedBasemap | null {
    if (!value || typeof value !== 'object') return null;
    const index = parseLayerIndex(value.index);
    const id = clipText(value.id, MAX_BASEMAP_TEXT_LENGTH) || null;
    const label = clipText(value.label, MAX_BASEMAP_TEXT_LENGTH) || null;
    if (index === null && !id && !label) return null;
    return { index, id, label };
}

function normalizeCenter(value: any): AgentMapCenter | null {
    if (!value || typeof value !== 'object') return null;
    const lng = parseRange(value.lng, -180, 180);
    const lat = parseRange(value.lat, -90, 90);
    if (lng === null || lat === null) return null;
    const roundedLng = round(lng, 6);
    const roundedLat = round(lat, 6);
    if (roundedLng === null || roundedLat === null) return null;
    return { lng: roundedLng, lat: roundedLat };
}

function hasMeaningfulUrlState(urlState: AgentMapUrlState): boolean {
    return ['lng', 'lat', 'z', 'l'].some((key) => urlState[key] !== undefined);
}

function resolveSource(hasRuntime: boolean, hasUrl: boolean): AgentMapContextV1['source'] {
    if (hasRuntime && hasUrl) return 'runtime+url';
    if (hasRuntime) return 'runtime';
    return 'url';
}

function normalizeRuntimeView(value: any): string | null {
    const text = String(value || '').trim().toLowerCase();
    return text === MAP_VIEW_OL || text === MAP_VIEW_CESIUM ? text : null;
}

let contextIdCounter = 0;

function createContextId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    contextIdCounter = (contextIdCounter + 1) % 1_000_000;
    return `map-${Date.now().toString(36)}-${contextIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readScalar(value: any): any {
    return Array.isArray(value) ? value[value.length - 1] : value;
}

function parseRange(value: any, min: number, max: number): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function parsePositive(value: any): number | null {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function parsePositiveInteger(value: any): number | null {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && number <= 100_000 ? number : null;
}

function parseLayerIndex(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= URL_LAYER_OPTIONS.length
        ? number
        : null;
}

function round(value: any, digits: number): number | null {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function clipText(value: any, maxLength: number): string {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, maxLength) : '';
}

/** 剔除 null / undefined / 空串字段；返回类型保持入参形状 */
function pruneEmpty<T extends Record<string, any>>(value: T): T {
    if (!value || typeof value !== 'object') return value;
    const output: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, item]) => {
        if (item === null || item === undefined || item === '') return;
        output[key] = item;
    });
    return output as T;
}
