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
    countGeoJsonFeatures,
    DEFAULT_TRANSITION_DURATION_MS,
    downloadTextFile,
    getTransitionError,
    normalizeLayerIdArg,
    parseFiniteNumber,
    runOlViewTransition,
    toMapCommandResult,
    truncateGeoJsonFeatures,
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
    /** 图层显隐 sink（由 MapContainer 注入，返回 LayerActionResult） */
    setLayerVisibility?: (layerId: string, visible: boolean) => any;
    /** 图层透明度 sink（0~1） */
    setLayerOpacity?: (layerId: string, opacity: number) => any;
    /** 图层定位 sink */
    zoomToLayer?: (layerId: string) => any;
    /** 单独显示 sink（隐藏其余用户图层） */
    soloLayer?: (layerId: string) => any;
    /** 图层导出 sink（返回 { name, text } 或 null） */
    exportLayerGeoJson?: (layerId: string) => any;
    /** 图层删除 sink（不可撤销） */
    removeLayer?: (layerId: string) => any;
}

export function createOlMapCommandAdapter({
    getMap,
    getRuntimeState,
    setBasemap,
    addSearchLayer,
    setLayerVisibility: setLayerVisibilitySink,
    setLayerOpacity: setLayerOpacitySink,
    zoomToLayer: zoomToLayerSink,
    soloLayer: soloLayerSink,
    exportLayerGeoJson: exportLayerGeoJsonSink,
    removeLayer: removeLayerSink,
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

    /**
     * 设置图层可见性。
     * @param layerId 裸图层 id（不含引擎前缀）
     * @param visible 目标可见性
     */
    async function setLayerVisibility({ layerId, visible } = {} as {
        layerId?: unknown;
        visible?: unknown;
    }): Promise<MapCommandResult> {
        const id = normalizeLayerIdArg(layerId);
        if (!id) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'layerId is required' };
        }
        if (typeof visible !== 'boolean') {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'visible must be a boolean' };
        }
        if (typeof setLayerVisibilitySink !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: '2D layer controls are not ready' };
        }
        const raw = await setLayerVisibilitySink(id, visible);
        return toMapCommandResult(raw, { layerId: id, visible });
    }

    /**
     * 设置图层透明度。
     * @param layerId 裸图层 id
     * @param opacity 0~1
     */
    async function setLayerOpacity({ layerId, opacity } = {} as {
        layerId?: unknown;
        opacity?: unknown;
    }): Promise<MapCommandResult> {
        const id = normalizeLayerIdArg(layerId);
        if (!id) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'layerId is required' };
        }
        const value = Number(opacity);
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'opacity must be a number within [0, 1]' };
        }
        if (typeof setLayerOpacitySink !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: '2D layer controls are not ready' };
        }
        const raw = await setLayerOpacitySink(id, value);
        return toMapCommandResult(raw, { layerId: id, opacity: value });
    }

    /**
     * 缩放到指定图层的范围（成功后回带 resultingMapState）。
     */
    async function zoomToLayer({ layerId } = {} as { layerId?: unknown }): Promise<MapCommandResult> {
        const id = normalizeLayerIdArg(layerId);
        if (!id) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'layerId is required' };
        }
        if (typeof zoomToLayerSink !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: '2D layer controls are not ready' };
        }
        const raw = await zoomToLayerSink(id);
        const result = toMapCommandResult(raw, { layerId: id });
        if (result.success) {
            result.resultingMapState = captureState();
        }
        return result;
    }

    /**
     * 单独显示指定图层（其余用户图层隐藏），回带被隐藏的图层名清单。
     */
    async function soloLayer({ layerId } = {} as { layerId?: unknown }): Promise<MapCommandResult> {
        const id = normalizeLayerIdArg(layerId);
        if (!id) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'layerId is required' };
        }
        if (typeof soloLayerSink !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: '2D layer controls are not ready' };
        }
        const raw = await soloLayerSink(id);
        return toMapCommandResult(raw, { layerId: id });
    }

    /**
     * 导出图层要素。
     *
     * 两种模式：
     * - `download`（默认）：把**全部**要素写成 `.geojson` 文件交给浏览器下载，
     *   结果里不返回 GeoJSON 正文（省上下文），只回文件名与要素数；
     * - `inline`：返回截断后的 GeoJSON 文本，供模型在对话内直接分析，
     *   受要素数（默认 500，上限 2000）与 60k 字符双闸门。
     *
     * 下载通道不可用时自动退回 inline，避免用户完全拿不到数据。
     */
    async function exportLayerGeoJson({ layerId, limit, mode } = {} as {
        layerId?: unknown;
        limit?: unknown;
        mode?: unknown;
    }): Promise<MapCommandResult> {
        const id = normalizeLayerIdArg(layerId);
        if (!id) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'layerId is required' };
        }
        if (typeof exportLayerGeoJsonSink !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: '2D layer export is not ready' };
        }

        const raw = await exportLayerGeoJsonSink(id);
        const text = String(raw?.text || '');
        if (!text) {
            return {
                success: false,
                code: 'LAYER_EXPORT_EMPTY',
                message: `Layer "${id}" has no exportable features or does not exist`,
                layerId: id,
            };
        }

        const layerName = String(raw?.name || id);
        const wantInline = mode === 'inline';

        if (!wantInline) {
            const total = countGeoJsonFeatures(text);
            const file = downloadTextFile(`${layerName}.geojson`, text, 'application/geo+json');
            if (file.success) {
                return {
                    success: true,
                    code: 'OK',
                    layerId: id,
                    layerName,
                    featureCount: total,
                    downloaded: true,
                    filename: file.filename,
                    message: `已导出图层「${layerName}」的 ${total} 个要素，文件名 ${file.filename}，已触发浏览器下载（若未出现，请检查浏览器是否拦截了本站下载）`,
                };
            }

            // V3.7.16：download 模式的唯一交付方式是浏览器下载。过去这里返回
            // success=true + 内联 GeoJSON，模型会据此总结「返回完整文本（未截断）」，
            // 用户却等不到下载任务——属于把失败伪装成成功。现在明确失败并给出处置指引，
            // 同时保留文本载荷供人工排查，但绝不声称导出已完成。
            const fallback = truncateGeoJsonFeatures(text, 500);
            return {
                success: false,
                code: 'DOWNLOAD_BLOCKED',
                layerId: id,
                layerName,
                featureCount: fallback.total,
                returnedFeatures: fallback.kept,
                truncated: fallback.truncated,
                downloaded: false,
                geojson: fallback.text,
                message: `${file.message || '浏览器下载被拦截'}。export 的 download 模式必须触发浏览器下载任务；请允许本站下载后重试。若确实只想在对话里看文本，请明确说「在回复中显示 GeoJSON 文本」并使用 mode=inline。`,
            };
        }

        const cap = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(2000, Number(limit))) : 500;
        const sliced = truncateGeoJsonFeatures(text, cap);
        if (!sliced.text) {
            return {
                success: false,
                code: 'LAYER_EXPORT_PARSE_FAILED',
                message: `Layer "${id}" export could not be parsed as GeoJSON`,
                layerId: id,
            };
        }

        return {
            success: true,
            code: sliced.truncated ? 'OK_TRUNCATED' : 'OK',
            layerId: id,
            layerName,
            featureCount: sliced.total,
            returnedFeatures: sliced.kept,
            truncated: sliced.truncated,
            geojson: sliced.text,
        };
    }

    /**
     * 删除图层（不可撤销）。
     *
     * 调用方（模型）须先用 list_layers 确认目标；本命令只负责执行与回报
     * 「删掉了什么」，不做二次确认 —— 确认责任在对话层。
     */
    async function removeLayer({ layerId } = {} as { layerId?: unknown }): Promise<MapCommandResult> {
        const id = normalizeLayerIdArg(layerId);
        if (!id) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'layerId is required' };
        }
        if (typeof removeLayerSink !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: '2D layer controls are not ready' };
        }
        const raw = await removeLayerSink(id);
        const result = toMapCommandResult(raw, { layerId: id });
        if (result.success) {
            result.resultingMapState = captureState();
        }
        return result;
    }

    return {
        captureState,
        setViewCenter,
        zoomToExtent,
        switchBasemap,
        addSearchResultLayer,
        setLayerVisibility,
        setLayerOpacity,
        zoomToLayer,
        soloLayer,
        exportLayerGeoJson,
        removeLayer,
    };
}
