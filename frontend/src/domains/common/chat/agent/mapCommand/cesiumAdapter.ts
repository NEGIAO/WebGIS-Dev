/**
 * 功能名称：Agent 3D 地图指令适配器（Cesium）
 * 日    期：2026/11/13
 *
 * 从 mapCommandAdapters 拆出：把 Agent 指令翻译成 Cesium 相机飞行 / 底图切换 /
 * GeoJSON 搜索结果导入，统一返回 MapCommandResult。
 */
import type Cesium from 'cesium';
import type { Viewer } from 'cesium';
import { olZoomToCesiumHeight } from '@common/utils/viewScaleConverter';
import { getAgentBasemapPresetLabel } from '../agentMapPresets';
import {
    DEFAULT_TRANSITION_DURATION_MS,
    getTransitionError,
    parseFiniteNumber,
    runCesiumCameraFlight,
    validateBasemapArg,
    validateBbox,
    validateLngLat,
} from './shared';
import type { CesiumRuntime, GetRuntimeState, MapCommandResult, ValidatedBasemapArg } from './shared';

/** 相机飞行目标构造器（由各指令按当前运行时拼装 destination/orientation） */
type FlyTargetFactory = (runtime: CesiumRuntime) => {
    destination: import('cesium').Cartesian3 | import('cesium').Rectangle;
    orientation?: any;
};

/** Cesium 适配器宿主依赖 */
export interface CesiumMapCommandAdapterOptions {
    /** 获取三维 Viewer（可能尚未就绪或已销毁） */
    getViewer?: () => Viewer | null | undefined;
    /** 获取 Cesium 命名空间（token 初始化后可用） */
    getCesium?: () => typeof Cesium | null | undefined;
    /** 运行时状态快照读取器 */
    getRuntimeState?: GetRuntimeState;
    /** 底图切换 sink */
    setBasemap?: (validated: ValidatedBasemapArg) => any;
    /** GeoJSON 导入 sink（复用统一导入管线） */
    importGeoJson?: (payload: { resources: File[]; silent: boolean }) => any;
}

export function createCesiumMapCommandAdapter({
    getViewer,
    getCesium,
    getRuntimeState,
    setBasemap,
    importGeoJson,
} = {} as CesiumMapCommandAdapterOptions) {
    const captureState = () => getRuntimeState?.() || null;

    function getRuntime(): CesiumRuntime | null {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || viewer.isDestroyed?.() || !viewer.camera || !Cesium) return null;
        return { viewer, Cesium };
    }

    async function flyTo(options: FlyTargetFactory, durationMs: number): Promise<{ completed: boolean; reason?: string }> {
        const runtime = getRuntime();
        if (!runtime) return { completed: false, reason: 'destroyed' };
        return runCesiumCameraFlight({
            viewer: runtime.viewer,
            duration: durationMs,
            start: ({ complete, cancel }) => runtime.viewer.camera.flyTo({
                ...options(runtime),
                duration: durationMs / 1000,
                complete,
                cancel,
            }),
        });
    }

    async function setViewCenter({
        lng: lngValue,
        lat: latValue,
        height: heightValue,
        zoom: zoomValue,
        duration = DEFAULT_TRANSITION_DURATION_MS,
    } = {} as {
        lng?: unknown;
        lat?: unknown;
        height?: unknown;
        zoom?: unknown;
        duration?: unknown;
    }): Promise<MapCommandResult> {
        const coordinate = validateLngLat(lngValue, latValue);
        if (!coordinate.ok) {
            return { success: false, code: 'INVALID_ARGUMENT', message: coordinate.error };
        }
        const runtime = getRuntime();
        if (!runtime) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'Cesium runtime is not ready' };

        let height: number | null = heightValue === undefined ? null : parseFiniteNumber(heightValue);
        if (heightValue !== undefined && (height === null || height <= 0 || height > 50_000_000)) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'height must be a finite number from 1 to 50000000 meters' };
        }
        if (height === null && zoomValue !== undefined) {
            const zoom = parseFiniteNumber(zoomValue);
            if (zoom === null || zoom < 0 || zoom > 22) {
                return { success: false, code: 'INVALID_ARGUMENT', message: 'zoom must be a finite number from 0 to 22' };
            }
            height = olZoomToCesiumHeight({
                zoom,
                mapSize: [runtime.viewer.canvas?.clientWidth, runtime.viewer.canvas?.clientHeight],
                centerLat: coordinate.lat,
                cesiumFovy: runtime.viewer.camera.frustum?.fovy,
                clamp: true,
            });
        }
        const currentHeight = parseFiniteNumber(runtime.viewer.camera.positionCartographic?.height);
        height ??= currentHeight !== null && currentHeight > 0 ? currentHeight : 1_000_000;

        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const transition = await flyTo(
            ({ Cesium }) => ({
                destination: Cesium.Cartesian3.fromDegrees(coordinate.lng, coordinate.lat, height),
                orientation: {
                    heading: runtime.viewer.camera.heading,
                    pitch: runtime.viewer.camera.pitch,
                    roll: runtime.viewer.camera.roll,
                },
            }),
            durationMs,
        );
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: `Moved the 3D camera center to (${coordinate.lng.toFixed(6)}, ${coordinate.lat.toFixed(6)}), height=${Math.round(height)}m`,
            center: { lng: coordinate.lng, lat: coordinate.lat },
            resultingMapState,
        };
    }

    async function zoomToExtent({ bbox: bboxValue, duration = DEFAULT_TRANSITION_DURATION_MS } = {} as {
        bbox?: unknown;
        duration?: unknown;
    }): Promise<MapCommandResult> {
        const normalized = validateBbox(bboxValue);
        if (normalized.error || !normalized.bbox) {
            return { success: false, code: 'INVALID_ARGUMENT', message: normalized.error ?? 'Invalid bbox' };
        }
        const runtime = getRuntime();
        if (!runtime) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'Cesium runtime is not ready' };
        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const transition = await flyTo(
            ({ Cesium }) => ({
                destination: Cesium.Rectangle.fromDegrees(...(normalized.bbox as [number, number, number, number])),
            }),
            durationMs,
        );
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: `Fit the 3D camera to [${normalized.bbox.map((value) => value.toFixed(4)).join(', ')}]`,
            resultingMapState,
        };
    }

    async function setCameraOrientation({
        heading: headingValue,
        pitch: pitchValue,
        roll: rollValue,
        duration = DEFAULT_TRANSITION_DURATION_MS,
    } = {} as {
        heading?: unknown;
        pitch?: unknown;
        roll?: unknown;
        duration?: unknown;
    }): Promise<MapCommandResult> {
        const runtime = getRuntime();
        if (!runtime) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'Cesium runtime is not ready' };
        if (headingValue === undefined && pitchValue === undefined && rollValue === undefined) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'At least one of heading, pitch, or roll is required' };
        }
        const headingDegrees = headingValue === undefined ? null : parseFiniteNumber(headingValue);
        const pitchDegrees = pitchValue === undefined ? null : parseFiniteNumber(pitchValue);
        const rollDegrees = rollValue === undefined ? null : parseFiniteNumber(rollValue);
        if (
            (headingValue !== undefined && headingDegrees === null)
            || (pitchValue !== undefined && pitchDegrees === null)
            || (rollValue !== undefined && rollDegrees === null)
            || (pitchDegrees !== null && (pitchDegrees < -90 || pitchDegrees > 90))
        ) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'Camera angles must be finite; pitch must be in [-90, 90] degrees' };
        }
        const heading = headingDegrees === null
            ? runtime.viewer.camera.heading
            : runtime.Cesium.Math.toRadians(headingDegrees);
        const pitch = pitchDegrees === null
            ? runtime.viewer.camera.pitch
            : runtime.Cesium.Math.toRadians(pitchDegrees);
        const roll = rollDegrees === null
            ? runtime.viewer.camera.roll
            : runtime.Cesium.Math.toRadians(rollDegrees);
        if (![heading, pitch, roll].every(Number.isFinite)) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'Camera angles must be finite; pitch must be in [-90, 90] degrees' };
        }
        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const transition = await flyTo(
            () => ({
                destination: runtime.viewer.camera.position.clone?.() || runtime.viewer.camera.position,
                orientation: { heading, pitch, roll },
            }),
            durationMs,
        );
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: 'Updated the Cesium camera orientation',
            resultingMapState,
        };
    }

    async function switchBasemap({ presetId, url } = {} as { presetId?: unknown; url?: unknown }): Promise<MapCommandResult> {
        const validated = validateBasemapArg({ presetId: presetId as string | undefined, url: url as string | undefined });
        if (validated.error) return { success: false, code: 'INVALID_BASEMAP_PRESET', message: validated.error };
        if (typeof setBasemap !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'Cesium basemap switching is not ready' };
        }
        const switched = await setBasemap(validated);
        const resultingMapState = captureState();
        const isCustomUrl = Boolean(validated.url);
        if (switched === false) {
            return {
                success: false,
                code: 'BASEMAP_SWITCH_FAILED',
                message: `Cesium failed to switch basemap: ${isCustomUrl ? validated.url : validated.presetId}`,
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
     * 把搜索结果落到 3D 图层树（TOC「三维数据」分组），不移动相机。
     *
     * 走的是既有 GeoJSON 导入通道（与面板上传同一条管线），因此符号化沿用导入默认样式；
     * `silent: true` 让这次导入不挂遮罩、不弹提示——搜索是高频轻操作，
     * 不该被一个导入进度浮层打断。
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
        if (typeof importGeoJson !== 'function') {
            return {
                success: false,
                code: 'MAP_RUNTIME_NOT_READY',
                message: 'Cesium data import sink is not ready',
            };
        }
        if (typeof File !== 'function') {
            return {
                success: false,
                code: 'SEARCH_LAYER_FAILED',
                message: 'File API is unavailable in this environment',
            };
        }

        const layerName = String(name || '').trim() || `搜索结果_${coordinate.lng.toFixed(5)}_${coordinate.lat.toFixed(5)}`;
        const featureCollection = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [coordinate.lng, coordinate.lat] },
                    properties: {
                        name: layerName,
                        ...(address ? { address: String(address) } : {}),
                    },
                },
            ],
        };

        try {
            const file = new File(
                [JSON.stringify(featureCollection)],
                `${layerName}.geojson`,
                { type: 'application/geo+json' },
            );
            // importGeoJson 返回本次新增的导入记录（null = 没加载出任何数据），
            // 不能只看「调用是否抛错」——loader 内部会吞异常，那样会把失败报成成功
            const record = await importGeoJson({ resources: [file], silent: true });
            if (!record) {
                return {
                    success: false,
                    code: 'SEARCH_LAYER_FAILED',
                    message: 'Cesium data import produced no layer (the GeoJSON payload was rejected or empty)',
                    resultingMapState: captureState(),
                };
            }
            return {
                success: true,
                code: 'OK',
                // TOC 名称取自文件名（含 .geojson 后缀），回传实际建档名而不是本地拼的名字
                message: `Added search result layer: ${record.name || layerName}`,
                layerId: record.id || null,
                layerName: record.name || layerName,
                resultingMapState: captureState(),
            };
        } catch (error) {
            return {
                success: false,
                code: 'SEARCH_LAYER_FAILED',
                message: `Failed to add search result layer: ${(error as { message?: string })?.message || 'unknown error'}`,
                resultingMapState: captureState(),
            };
        }
    }

    return {
        captureState,
        setViewCenter,
        setCameraOrientation,
        zoomToExtent,
        switchBasemap,
        addSearchResultLayer,
    };
}
