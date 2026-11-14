/**
 * 功能名称：Agent 2D 地图指令适配器（OpenLayers）
 * 日    期：2026/11/13
 *
 * 从 mapCommandAdapters 拆出：把 Agent 指令翻译成 OL 视口动画 / 底图切换 /
 * 搜索结果建层，统一返回 MapCommandResult。
 */
import type Map from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import { getAgentBasemapPresetLabel } from '../agentMapPresets';
import {
    captureOlState,
    DEFAULT_TRANSITION_DURATION_MS,
    getTransitionError,
    parseFiniteNumber,
    runOlViewTransition,
    validateBasemapArg,
    validateBbox,
    validateLngLat,
} from './shared';
import type { GetRuntimeState, MapCommandResult, ValidatedBasemapArg } from './shared';

/** OL 适配器宿主依赖 */
export interface OlMapCommandAdapterOptions {
    /** 获取 OL 地图实例（可能尚未就绪） */
    getMap?: () => Map | null | undefined;
    /** 运行时状态快照读取器 */
    getRuntimeState?: GetRuntimeState;
    /** 底图切换 sink */
    setBasemap?: (validated: ValidatedBasemapArg) => any;
    /** 搜索结果建层 sink（写入 TOC） */
    addSearchLayer?: (payload: {
        name: string;
        lng: number;
        lat: number;
        service: string;
        raw: { address: string } | null;
    }) => any;
}

export function createOlMapCommandAdapter({
    getMap,
    getRuntimeState,
    setBasemap,
    addSearchLayer,
} = {} as OlMapCommandAdapterOptions) {
    const captureState = () => captureOlState(getMap?.(), getRuntimeState);

    async function setViewCenter({
        lng: lngValue,
        lat: latValue,
        zoom: zoomValue,
        height,
        duration = DEFAULT_TRANSITION_DURATION_MS,
    } = {} as {
        lng?: unknown;
        lat?: unknown;
        zoom?: unknown;
        height?: unknown;
        duration?: unknown;
    }): Promise<MapCommandResult> {
        const coordinate = validateLngLat(lngValue, latValue);
        if (coordinate.error || coordinate.lng === null || coordinate.lat === null) {
            return { success: false, code: 'INVALID_ARGUMENT', message: coordinate.error ?? 'Invalid coordinate' };
        }
        if (height !== undefined && zoomValue === undefined) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'OpenLayers uses zoom; height cannot be supplied on its own' };
        }

        const map = getMap?.();
        const view = map?.getView?.();
        if (!map || !view) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'OpenLayers runtime is not ready' };

        const zoom = zoomValue === undefined
            ? parseFiniteNumber(view.getZoom?.())
            : parseFiniteNumber(zoomValue);
        if (zoom === null || zoom < 0 || zoom > 22) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'zoom must be a finite number from 0 to 22' };
        }
        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const transition = await runOlViewTransition({
            map,
            view,
            duration: durationMs,
            start: (callback) => view.animate({
                center: fromLonLat([coordinate.lng, coordinate.lat]),
                zoom,
                duration: durationMs,
            }, callback),
        });
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: `Moved the 2D map center to (${coordinate.lng.toFixed(6)}, ${coordinate.lat.toFixed(6)}), zoom=${zoom}`,
            center: { lng: coordinate.lng, lat: coordinate.lat },
            resultingMapState,
        };
    }

    async function zoomToExtent({
        bbox: bboxValue,
        padding = 80,
        maxZoom = 11,
        duration = DEFAULT_TRANSITION_DURATION_MS,
    } = {} as {
        bbox?: unknown;
        padding?: unknown;
        maxZoom?: unknown;
        duration?: unknown;
    }): Promise<MapCommandResult> {
        const normalized = validateBbox(bboxValue);
        if (normalized.error || !normalized.bbox) {
            return { success: false, code: 'INVALID_ARGUMENT', message: normalized.error ?? 'Invalid bbox' };
        }
        const [minLng, minLat, maxLng, maxLat] = normalized.bbox;
        const maxZoomValue = parseFiniteNumber(maxZoom);
        if (maxZoomValue === null || maxZoomValue < 0 || maxZoomValue > 22) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'maxZoom must be a finite number from 0 to 22' };
        }

        const map = getMap?.();
        const view = map?.getView?.();
        if (!map || !view) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'OpenLayers runtime is not ready' };

        const lowerLeft = fromLonLat([minLng, minLat]);
        const upperRight = fromLonLat([maxLng, maxLat]);
        const extent = [lowerLeft[0], lowerLeft[1], upperRight[0], upperRight[1]];
        const width = Math.abs(upperRight[0] - lowerLeft[0]);
        const height = Math.abs(upperRight[1] - lowerLeft[1]);
        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const normalizedPadding = Array.isArray(padding)
            ? padding.slice(0, 4).map((value) => Math.max(0, parseFiniteNumber(value) ?? 0))
            : Array(4).fill(Math.max(0, parseFiniteNumber(padding) ?? 80));

        const transition = await runOlViewTransition({
            map,
            view,
            duration: durationMs,
            start: (callback) => {
                if (width < 1e-6 || height < 1e-6) {
                    view.animate({
                        center: [(lowerLeft[0] + upperRight[0]) / 2, (lowerLeft[1] + upperRight[1]) / 2],
                        zoom: maxZoomValue,
                        duration: durationMs,
                    }, callback);
                    return;
                }
                view.fit(extent, {
                    duration: durationMs,
                    padding: normalizedPadding,
                    maxZoom: maxZoomValue,
                    callback,
                });
            },
        });
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: `Fit the 2D map to [${normalized.bbox.map((value) => value.toFixed(4)).join(', ')}]`,
            resultingMapState,
        };
    }

    async function switchBasemap({ presetId, url } = {} as { presetId?: unknown; url?: unknown }): Promise<MapCommandResult> {
        const validated = validateBasemapArg({ presetId: presetId as string | undefined, url: url as string | undefined });
        if (validated.error) return { success: false, code: 'INVALID_BASEMAP_PRESET', message: validated.error };
        if (typeof setBasemap !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'OpenLayers basemap switching is not ready' };
        }
        const switched = await setBasemap(validated);
        const resultingMapState = captureState();
        const isCustomUrl = Boolean(validated.url);
        if (switched?.success === false) {
            return {
                success: false,
                code: 'BASEMAP_SWITCH_FAILED',
                message: `OpenLayers failed to switch basemap: ${isCustomUrl ? validated.url : validated.presetId}`,
                resultingMapState,
            };
        }
        return {
            success: true,
            code: 'OK',
            message: isCustomUrl
                ? `Switched to custom XYZ basemap: ${validated.url}`
                : `Switched to preset basemap: ${getAgentBasemapPresetLabel(validated.presetId) || validated.presetId}`,
            layerId: isCustomUrl ? 'custom' : validated.presetId,
            url: isCustomUrl ? validated.url : undefined,
            layerIndex: resultingMapState?.basemap?.index ?? null,
            resultingMapState,
        };
    }

    /**
     * 把搜索结果落到「搜索结果图层」（写入 TOC），不移动视口。
     *
     * 复用 2D 搜索面板同一条建层逻辑（sourceType='search' + 系统默认样式 + 自动标注），
     * 因此符号化由既有图层体系完成，本命令只负责传坐标与名称。
     */
    async function addSearchResultLayer({ name, lng, lat, address } = {} as {
        name?: unknown;
        lng?: unknown;
        lat?: unknown;
        address?: unknown;
    }): Promise<MapCommandResult> {
        const coordinate = validateLngLat(lng, lat);
        if (coordinate.error || coordinate.lng === null || coordinate.lat === null) {
            return { success: false, code: 'INVALID_ARGUMENT', message: coordinate.error ?? 'Invalid coordinate' };
        }
        if (typeof addSearchLayer !== 'function') {
            return {
                success: false,
                code: 'MAP_RUNTIME_NOT_READY',
                message: 'OpenLayers search layer sink is not ready',
            };
        }

        const layerName = String(name || '').trim() || `搜索结果_${coordinate.lng.toFixed(5)}_${coordinate.lat.toFixed(5)}`;
        let created: { layerId?: string; layerName?: string } | null | undefined;
        try {
            created = await addSearchLayer({
                name: layerName,
                lng: coordinate.lng,
                lat: coordinate.lat,
                service: 'agent',
                raw: address ? { address: String(address) } : null,
            });
        } catch (error) {
            return {
                success: false,
                code: 'SEARCH_LAYER_FAILED',
                message: `Failed to add search result layer: ${(error as { message?: string })?.message || 'unknown error'}`,
                resultingMapState: captureState(),
            };
        }
        if (!created) {
            return {
                success: false,
                code: 'SEARCH_LAYER_FAILED',
                message: 'OpenLayers rejected the search result coordinates',
                resultingMapState: captureState(),
            };
        }
        // 坐标合法但建层被拒（map 未就绪 / 要素为空）：不能报成功，否则 TOC 里根本没有这条
        if (!created.layerId) {
            return {
                success: false,
                code: 'SEARCH_LAYER_FAILED',
                message: `OpenLayers failed to register layer "${created.layerName}" in the layer tree`,
                resultingMapState: captureState(),
            };
        }
        return {
            success: true,
            code: 'OK',
            message: `Added search result layer: ${created.layerName}`,
            layerId: created.layerId,
            layerName: created.layerName,
            resultingMapState: captureState(),
        };
    }

    return {
        captureState,
        setViewCenter,
        zoomToExtent,
        switchBasemap,
        addSearchResultLayer,
    };
}
