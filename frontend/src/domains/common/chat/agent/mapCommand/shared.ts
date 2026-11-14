/**
 * 功能名称：Agent 地图指令公共层（参数校验 / 动画包装 / 运行时状态捕获）
 * 日    期：2026/11/13
 *
 * 从 mapCommandAdapters 拆出：OL 与 Cesium 两个适配器共用的校验函数、
 * 动画 Promise 包装与运行时状态捕获，不含具体指令实现。
 */
import type Map from 'ol/Map';
import type View from 'ol/View';
import type Cesium from 'cesium';
import { toLonLat } from 'ol/proj';
import { normalizeCustomXyzUrl } from '@domains/cesium/composables/layers/layerUtils';
import { isAgentBasemapPresetId } from '../agentMapPresets';

export const DEFAULT_TRANSITION_DURATION_MS = 700;
const TRANSITION_TIMEOUT_BUFFER_MS = 1500;

/** 运行时地图状态快照（由宿主 useMapState / useCesiumLayers 提供） */
export interface RuntimeMapState {
    view: 'ol' | 'cesium';
    center?: { lng: number; lat: number };
    ol?: {
        zoom: number;
        resolution: number | null;
        viewportWidth?: number;
        viewportHeight?: number;
    };
    basemap?: { index?: number | null } & Record<string, unknown>;
    [key: string]: unknown;
}

/** 宿主提供的运行时状态读取器 */
export type GetRuntimeState = () => RuntimeMapState | null | undefined;

/** 地图指令统一返回结构（透传给 Agent 对话结果） */
export interface MapCommandResult {
    success: boolean;
    code: string;
    message?: string;
    center?: { lng: number; lat: number };
    layerId?: string | null;
    layerName?: string;
    layerIndex?: number | null;
    url?: string;
    resultingMapState?: RuntimeMapState | null;
}

/** 经纬度校验结果（判别联合：ok=false 即失败） */
export type ValidatedLngLat =
    | { ok: false; error: string; lng: null; lat: null }
    | { ok: true; error: null; lng: number; lat: number };

/** bbox 校验结果（判别联合） */
export type ValidatedBbox =
    | { ok: false; error: string; bbox: null }
    | { ok: true; error: null; bbox: number[] };

/** 底图参数校验结果（判别联合） */
export interface ValidatedBasemapArg {
    /** 非空字符串即校验失败 */
    error?: string;
    presetId?: string;
    url?: string;
}

/** 动画包装结果 */
export interface TransitionResult {
    completed: boolean;
    reason?: string;
}

/** Cesium 运行时句柄（Viewer + 命名空间） */
export interface CesiumRuntime {
    viewer: import('cesium').Viewer;
    Cesium: typeof Cesium;
}

export function parseFiniteNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

export function validateLngLat(lngValue: unknown, latValue: unknown): ValidatedLngLat {
    const lng = parseFiniteNumber(lngValue);
    const lat = parseFiniteNumber(latValue);
    if (lng === null || lat === null) {
        return { ok: false, error: 'lng and lat must be finite numbers', lng: null, lat: null };
    }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return { ok: false, error: 'Coordinates are outside longitude [-180, 180] or latitude [-90, 90]', lng: null, lat: null };
    }
    return { ok: true, error: null, lng, lat };
}

export function validateBbox(bbox: unknown): ValidatedBbox {
    if (!Array.isArray(bbox) || bbox.length !== 4) {
        return { ok: false, error: 'bbox must contain exactly four numbers: [minLng, minLat, maxLng, maxLat]', bbox: null };
    }
    const values = bbox.map(parseFiniteNumber);
    if (values.some((value) => value === null)) {
        return { ok: false, error: 'Every bbox value must be a finite number', bbox: null };
    }
    const [lng1, lat1, lng2, lat2] = values as number[];
    const normalized = [
        Math.min(lng1, lng2),
        Math.min(lat1, lat2),
        Math.max(lng1, lng2),
        Math.max(lat1, lat2),
    ];
    if (normalized[0] < -180 || normalized[2] > 180 || normalized[1] < -90 || normalized[3] > 90) {
        return { ok: false, error: 'bbox is outside longitude [-180, 180] or latitude [-90, 90]', bbox: null };
    }
    return { ok: true, error: null, bbox: normalized };
}

export function getTransitionError(reason?: string): { code: string; message: string } {
    if (reason === 'cancelled') return { code: 'TRANSITION_CANCELLED', message: 'Map animation was cancelled before completion' };
    if (reason === 'destroyed') return { code: 'MAP_RUNTIME_DESTROYED', message: 'Map runtime was destroyed before the animation completed' };
    if (reason === 'timeout') return { code: 'TRANSITION_TIMEOUT', message: 'Timed out waiting for map animation completion' };
    return { code: 'TRANSITION_FAILED', message: `Map animation failed: ${reason || 'unknown error'}` };
}

export function runOlViewTransition({
    map,
    view,
    start,
    duration = DEFAULT_TRANSITION_DURATION_MS,
}: {
    map: Map | null | undefined;
    view: View | null | undefined;
    duration?: number;
    start: (callback: (completed?: boolean) => void) => void;
}): Promise<TransitionResult> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result: TransitionResult) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            clearInterval(disposeCheckId);
            resolve(result);
        };

        const timeoutId = setTimeout(
            () => finish({ completed: false, reason: 'timeout' }),
            Math.max(0, duration) + TRANSITION_TIMEOUT_BUFFER_MS,
        );
        const disposeCheckId = setInterval(() => {
            if (!map?.getView?.() || map.getView() !== view || !map.getTargetElement?.()) {
                finish({ completed: false, reason: 'destroyed' });
            }
        }, 50);

        try {
            start((completed) => finish({
                completed: completed !== false,
                reason: completed === false ? 'cancelled' : undefined,
            }));
        } catch (error) {
            finish({ completed: false, reason: (error as { message?: string })?.message || 'error' });
        }
    });
}

export function runCesiumCameraFlight({
    viewer,
    start,
    duration = DEFAULT_TRANSITION_DURATION_MS,
}: {
    viewer: import('cesium').Viewer | null | undefined;
    duration?: number;
    start: (hooks: { complete: () => void; cancel: () => void }) => void;
}): Promise<TransitionResult> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result: TransitionResult) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            clearInterval(disposeCheckId);
            resolve(result);
        };
        const timeoutId = setTimeout(
            () => finish({ completed: false, reason: 'timeout' }),
            Math.max(0, duration) + TRANSITION_TIMEOUT_BUFFER_MS,
        );
        const disposeCheckId = setInterval(() => {
            if (!viewer || viewer.isDestroyed?.() || !viewer.camera) {
                finish({ completed: false, reason: 'destroyed' });
            }
        }, 50);

        try {
            start({
                complete: () => finish({ completed: true }),
                cancel: () => finish({ completed: false, reason: 'cancelled' }),
            });
        } catch (error) {
            finish({ completed: false, reason: (error as { message?: string })?.message || 'error' });
        }
    });
}

export function captureOlState(map: Map | null | undefined, getRuntimeState?: GetRuntimeState): RuntimeMapState | null {
    const providedState = getRuntimeState?.();
    if (providedState?.view === 'ol') return providedState;

    const view = map?.getView?.();
    const center = view?.getCenter?.();
    const zoom = parseFiniteNumber(view?.getZoom?.());
    if (!view || !Array.isArray(center) || center.length < 2 || zoom === null) return null;
    const [lng, lat] = toLonLat(center);
    const resolution = parseFiniteNumber(view.getResolution?.());
    return {
        view: 'ol',
        center: { lng: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)) },
        ol: {
            zoom: Number(zoom.toFixed(3)),
            resolution: resolution === null ? null : Number(resolution.toFixed(6)),
        },
    };
}

/**
 * 校验底图切换参数：presetId 走白名单，url 走标准 XYZ 模板校验（二选一）
 * @param args presetId 或 url
 */
export function validateBasemapArg({ presetId, url }: { presetId?: string; url?: string } = {}): ValidatedBasemapArg {
    const urlValue = String(url || '').trim();
    if (urlValue) {
        const config = normalizeCustomXyzUrl(urlValue);
        if (!config.valid) {
            return { error: `Invalid XYZ tile URL: ${config.message}` };
        }
        return { url: config.url };
    }

    const normalizedPresetId = String(presetId || '').trim();
    if (normalizedPresetId) {
        if (!isAgentBasemapPresetId(normalizedPresetId)) {
            return {
                error: 'presetId is not in the Agent basemap allowlist; provide a standard XYZ tile URL via the url field instead',
            };
        }
        return { presetId: normalizedPresetId };
    }

    return { error: 'Must provide either an allowlisted presetId or a standard XYZ tile URL template' };
}
