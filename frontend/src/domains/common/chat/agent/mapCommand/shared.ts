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
import { TILE_PROXY_BASE_URL } from '@/config/publicRuntime';
import { resolveTileBasemapArg } from '@common/chat/constants/tileIntentPresets';
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
    /**
     * 命令附加字段（随命令而异）：如图层操作的 visible / opacity / hiddenLayers，
     * 导出的 featureCount / returnedFeatures / truncated / geojson。
     */
    [key: string]: any;
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
export function validateBasemapArg({ presetId, url, intent }: { presetId?: string; url?: string; intent?: string } = {}): ValidatedBasemapArg {
    const intentValue = String(intent || '').trim();
    if (intentValue && !presetId && !url) {
        const resolved = resolveTileBasemapArg(intentValue, TILE_PROXY_BASE_URL);
        if (resolved.error) return { error: resolved.error };
        if (resolved.presetId) return validateBasemapArg({ presetId: resolved.presetId });
        if (resolved.url) return validateBasemapArg({ url: resolved.url });
    }

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

/**
 * 归一化图层 id：去空白，不接受空值。
 * 3D 侧图层在 TOC 中带 `cesium:` 前缀，调用前由调用方剥离；本函数只做字符串规整。
 */
export function normalizeLayerIdArg(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 把容器层的 LayerActionResult 归一为 MapCommandResult。
 *
 * fail-closed：sink 未返回结构化结果时判失败，避免把「没执行」当成功回传给模型。
 * 容器可能回带业务字段（如 `hiddenLayers`、`opacity`），这里原样保留给上层与模型。
 *
 * @param raw 容器方法返回值
 * @param extra 需要覆盖或补充的字段（如 visible / opacity）
 */
export function toMapCommandResult(raw: any, extra: Record<string, any> = {}): MapCommandResult {
    if (raw && typeof raw === 'object' && typeof raw.success === 'boolean') {
        const { success, code, message, layerId, ...rest } = raw;
        return {
            success: Boolean(success),
            code: String(code || (success ? 'OK' : 'LAYER_ACTION_FAILED')),
            ...(message ? { message: String(message) } : {}),
            ...(layerId ? { layerId: String(layerId) } : {}),
            ...rest,
            ...extra,
        };
    }
    return {
        success: false,
        code: 'LAYER_ACTION_NO_RESULT',
        message: 'Layer action returned no structured result',
        ...extra,
    };
}

/** 图层导出文本的硬上限（字符数）：约 15k token，防止单次工具结果撑爆上下文 */
export const LAYER_EXPORT_MAX_CHARS = 60000;

/**
 * 截断 GeoJSON FeatureCollection 到指定要素数与字符上限。
 *
 * 两道闸门：要素数（用户可选 1~2000）与序列化字符数（固定 60k）。
 * 后者优先，因为少量超大几何同样会撑爆上下文。
 *
 * @param text 原始 GeoJSON 文本
 * @param maxFeatures 要素数上限
 * @returns 截断后的文本与统计（解析失败时 text 为空串）
 */
export function truncateGeoJsonFeatures(text: string, maxFeatures: number) {
    let obj: any;
    try {
        obj = JSON.parse(text);
    } catch {
        return { total: 0, kept: 0, truncated: false, text: '' };
    }

    if (obj?.type !== 'FeatureCollection' || !Array.isArray(obj.features)) {
        return { total: 1, kept: 1, truncated: false, text };
    }

    const total = obj.features.length;
    const cap = Math.max(1, Math.min(2000, Number(maxFeatures) || 500));
    let kept = Math.min(total, cap);
    let out = JSON.stringify({ ...obj, features: obj.features.slice(0, kept) });

    while (out.length > LAYER_EXPORT_MAX_CHARS && kept > 1) {
        kept = Math.max(1, Math.floor(kept / 2));
        out = JSON.stringify({ ...obj, features: obj.features.slice(0, kept) });
    }

    return { total, kept, truncated: kept < total, text: out };
}

/** 统计 GeoJSON 要素数（解析失败返回 0） */
export function countGeoJsonFeatures(text: string): number {
    try {
        const obj = JSON.parse(text);
        if (Array.isArray(obj?.features)) return obj.features.length;
        return obj?.type ? 1 : 0;
    } catch {
        return 0;
    }
}

/**
 * 触发浏览器下载一段文本（GeoJSON 等）。
 *
 * 与「不自动写文件」的既有约定不冲突：本函数只在用户显式要求导出/下载时调用，
 * 且以 `a.download` 落盘（受浏览器下载策略约束，用户可在设置里拦截）。
 *
 * @param filename 下载文件名（会清洗非法字符并补齐扩展名）
 * @param text 文件内容
 * @param mime 内容类型
 * @returns `{ success, filename }`；DOM 不可用时返回 success=false
 */
export function downloadTextFile(
    filename: string,
    text: string,
    mime: string,
): { success: boolean; filename: string; message?: string } {
    const safeName =
        String(filename || 'export.geojson')
            .replace(/[\\/:*?"<>|]+/g, '_')
            .replace(/^\.+/, '')
            .slice(0, 120) || 'export.geojson';

    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
        return { success: false, filename: safeName, message: '当前运行环境不支持文件下载' };
    }

    try {
        const blob = new Blob([text], { type: mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = safeName;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // 延迟释放：立即 revoke 在部分浏览器会取消未开始的下载
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
        return { success: true, filename: safeName };
    } catch (error: unknown) {
        return {
            success: false,
            filename: safeName,
            message: `文件下载失败：${(error as { message?: string })?.message || 'unknown'}`,
        };
    }
}
