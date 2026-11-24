/**
 * Cesium URL 动态追踪。
 * - lng/lat/z 在 Cesium 模式下表示相机经纬度和高度。
 * - cv 只编码 Cesium 姿态（heading/pitch/roll），旧 full-camera cv 仍兼容解码。
 * - l 底图预设索引，与 OL 共享同一套 URL_LAYER_OPTIONS 映射。
 */
import { useRoute, useRouter } from 'vue-router';
import { MAP_VIEW_CESIUM, CAMERA_VIEW_PARAM_KEY, CAMERA_STATE_QUERY_KEYS } from '@common/url-state/urlConstants';
import {
    decodeCesiumCameraState,
    decodeCesiumPoseState,
    decodePos,
    encodeCesiumPoseState,
} from '@common/url-state/crypto';
import { getCurrentQuerySnapshot, readQueryValue as readQueryFromSnapshot } from '@common/url-state/urlQueryReader';
import { normalizeLocationFlag } from '@common/utils/normalize';
import { URL_LAYER_OPTIONS } from '@common/basemap/basemapOptions';
import { createBasemapUrlMappingFeature } from '@common/url-state/useBasemapUrlMapping';
import { getLayerCategory, getLayerGroup } from '@common/basemap/catalogProjection';
import { deserializeBasemapSelection, normalizeBasemapSelection } from '@common/basemap/basemapRegistry';

export { MAP_VIEW_CESIUM, CAMERA_VIEW_PARAM_KEY };

// ========== 底图 URL 映射实例 ==========
// 复用 OL 侧的 getLayerIdByIndex / getLayerIndexById。
// 惰性构建：映射依赖 common 的底图目录投影，模块求值期构建会早于投影发布。
let basemapUrlMapping: any = null;
function getBasemapUrlMapping() {
    if (!basemapUrlMapping) {
        basemapUrlMapping = createBasemapUrlMappingFeature({
            urlLayerOptions: URL_LAYER_OPTIONS,
            getLayerCategoryById: (layerId?: string) => (layerId ? getLayerCategory(layerId) : null),
            getLayerGroupById: (layerId?: string) => (layerId ? getLayerGroup(layerId) : null),
        });
    }
    return basemapUrlMapping;
}

const DEFAULT_CESIUM_HEIGHT = 6000000;
const DEFAULT_CESIUM_LNG = 104.1954;
const DEFAULT_CESIUM_LAT = 35.8617;
const DEFAULT_CESIUM_PITCH_DEGREES = -90;
const MIN_CAMERA_HEIGHT = 1;
const MAX_CAMERA_HEIGHT = 50000000;

/**
 * 读取当前地址栏的真实 query 快照（hash 优先、search 补缺）。
 * 罗盘 cs 等状态由 common 服务通过 history.replaceState 直接写入，Vue Router 的
 * route.query 可能仍是旧值；URL 写回必须以真实地址为准，否则旧 cs 会被重新合并进去。
 */
function readLocationQuerySnapshot(): Record<string, any> {
    const params = new URLSearchParams();
    const search = String(window.location.search || '').replace(/^\?/, '');
    new URLSearchParams(search).forEach((value, key) => params.set(key, value));

    const hash = String(window.location.hash || '');
    const queryIndex = hash.indexOf('?');
    if (queryIndex >= 0) {
        new URLSearchParams(hash.slice(queryIndex + 1)).forEach((value, key) => params.set(key, value));
    }

    return getCurrentQuerySnapshot(Object.fromEntries(params.entries()));
}

/**
 * 创建 Cesium URL 追踪器。
 * @param {Object} options - 配置项
 * @param {Function} options.getViewer - 获取 Cesium Viewer
 * @param {Function} options.getCesium - 获取 Cesium 运行时
 * @returns {{restoreCameraFromUrl: Function, restoreBasemapFromUrl: Function, bindCameraViewSync: Function, syncBasemapToUrl: Function, cleanupCameraViewSync: Function}} URL 追踪 API
 */
export interface CesiumUrlTrackingOptions {
    getViewer?: (...args: any[]) => any;
    getCesium?: (...args: any[]) => any;
    onCameraViewSync?: (...args: any[]) => any;
    onBasemapRestore?: (...args: any[]) => any;
}

export function useCesiumUrlTracking({ getViewer, getCesium, onCameraViewSync, onBasemapRestore }: CesiumUrlTrackingOptions = {}) {
    const route = useRoute();
    const router = useRouter();
    let removeMoveEndListener: any = null;

    function readQueryValue(key: any) {
        return readQueryFromSnapshot(key, route.query);
    }

    /**
     * 从 URL 读取 Cesium 相机恢复状态，优先解析 cv 编码参数。
     * @returns {{lng:number, lat:number, height:number, heading:number|null, pitch:number|null, roll:number|null}|null} 相机状态
     */
    function parseCameraStateFromUrl() {
        const encodedCameraView = String(readQueryValue(CAMERA_VIEW_PARAM_KEY) || '').trim();
        let lng = parseFiniteNumber(readQueryValue('lng'));
        let lat = parseFiniteNumber(readQueryValue('lat'));
        let height = normalizeCameraHeight(readQueryValue('z'));

        // 2D 分享链接可能只带紧凑位置码 p；准入条件与 useMapState 保持一致。
        // cv / 明文 lng-lat 仍优先，不改写已能恢复的链接。
        const compactPosCode = String(readQueryValue('p') || '').trim();
        const locationSource = normalizeLocationFlag(readQueryValue('loc'), '0');
        if (
            (lng === null || lat === null) &&
            compactPosCode &&
            compactPosCode !== '0' &&
            (locationSource === 'gps' || locationSource === 'ip')
        ) {
            const decodedPos = decodePos(compactPosCode);
            if (decodedPos && Number.isFinite(decodedPos.lng) && Number.isFinite(decodedPos.lat)) {
                lng = decodedPos.lng;
                lat = decodedPos.lat;
                // 仅位置码、未带 z 的存量链接给一个合理的默认高度，否则仍会因高度缺失而放弃恢复。
                if (height === null) height = DEFAULT_CESIUM_HEIGHT;
            }
        }

        const decodedPose = decodeCesiumPoseState(encodedCameraView);
        if (decodedPose && lng !== null && lat !== null && height !== null) {
            const poseCameraState: Record<string, any> = { lng, lat, height, ...decodedPose };
            if (isValidCameraState(poseCameraState)) return poseCameraState;
        }

        const decodedCameraView = decodeCesiumCameraState(encodedCameraView);
        if (isValidCameraState(decodedCameraView)) return decodedCameraView;
        // cv 损坏时继续尝试 lng/lat/z 明文参数，避免一个坏编码让分享链接完全失效。

        if (lng === null || lat === null || height === null) return null;
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;

        return {
            lng,
            lat,
            height,
            heading: parseFiniteNumber(readQueryValue('heading')) ?? 0,
            pitch: parseFiniteNumber(readQueryValue('pitch')) ?? DEFAULT_CESIUM_PITCH_DEGREES,
            roll: parseFiniteNumber(readQueryValue('roll')) ?? 0,
        };
    }

    /**
     * 按 URL 参数恢复 Cesium 相机，优先用 cv 完整还原视角。
     * 同时读取 l 参数恢复底图预设。
     * @param {Object} options - 恢复选项
     * @param {number} [options.duration=0] - 飞行动画时长
     * @returns {boolean} 是否成功发起相机恢复
     */
    function restoreCameraFromUrl({ duration = 0 } = {}) {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        const cameraState = parseCameraStateFromUrl();
        if (!viewer?.camera || !Cesium || !cameraState) return false;

        const destination = Cesium.Cartesian3.fromDegrees(
            cameraState.lng,
            cameraState.lat,
            cameraState.height,
        );
        const orientation = {
            heading: toRadians(Cesium, cameraState.heading ?? 0),
            pitch: toRadians(Cesium, clampPitchDegrees(cameraState.pitch ?? DEFAULT_CESIUM_PITCH_DEGREES)),
            roll: toRadians(Cesium, cameraState.roll ?? 0),
        };

        if (Number(duration) > 0) {
            viewer.camera.flyTo({
                destination,
                orientation,
                duration: Number(duration),
            });
            return true;
        }

        viewer.camera.setView({ destination, orientation });
        return true;
    }

    /**
     * 将底图选择写入统一 URL 契约；Wayback 快照固定使用 custom。
     * @param {string|Object} selection - Preset/custom identity; actual custom URL is not serialized.
     * @returns {string|null} Public 1-based URL layer number.
     */
    function syncBasemapToUrl(selection: any) {
        const normalized = normalizeBasemapSelection(selection);
        if (!normalized.id) return null;

        const urlLayerNumber = getBasemapUrlMapping().getLayerIndexById(normalized.id);
        if (urlLayerNumber === null) return null;

        const nextQuery = {
            view: MAP_VIEW_CESIUM,
            l: String(urlLayerNumber),
            layerId: '',
            customUrl: '',
        };
        replaceUrlQuery(nextQuery);
        return String(urlLayerNumber);
    }

    /** Restore basemap identity from numeric l; layerId is legacy read compatibility only. */
    function restoreBasemapFromUrl() {
        const selection = deserializeBasemapSelection(
            getCurrentQuerySnapshot(route.query),
            (index) => getBasemapUrlMapping().getLayerIdByIndex(index),
        );
        if (!selection?.id) return null;
        onBasemapRestore?.(selection);
        return selection;
    }

    /** Bind camera moveEnd; URL writes explicitly remove the legacy customUrl field. */
    function bindCameraViewSync({ initialSync = false, getActivePresetId }: { initialSync?: boolean; getActivePresetId?: () => any } = {}) {
        const camera = getCamera();
        if (!camera?.moveEnd || removeMoveEndListener) return;
        removeMoveEndListener = camera.moveEnd.addEventListener(() => {
            syncCameraViewToUrl({ activePresetId: getActivePresetId?.() });
        });
        if (initialSync) {
            syncCameraViewToUrl({ activePresetId: getActivePresetId?.() });
        }
    }

    function cleanupCameraViewSync() {
        if (typeof removeMoveEndListener === 'function') removeMoveEndListener();
        removeMoveEndListener = null;
    }

    /** 将 Cesium 相机姿态和当前底图选择写回 URL。 */
    function syncCameraViewToUrl({ activePresetId }: { activePresetId?: any } = {}) {
        const Cesium = getCesium?.();
        const camera = getCamera();
        if (!Cesium || !camera?.position) return;

        const cartographic = Cesium.Cartographic.fromCartesian(camera.position);
        if (!cartographic) return;

        const lng = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const height = Number(cartographic.height);
        const heading = Cesium.Math.toDegrees(Number(camera.heading) || 0);
        const pitch = Cesium.Math.toDegrees(Number(camera.pitch) || 0);
        const roll = Cesium.Math.toDegrees(Number(camera.roll) || 0);
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(height)) return;

        const safeHeight = Math.max(MIN_CAMERA_HEIGHT, height);
        const encodedCameraView = encodeCesiumPoseState({ heading, pitch, roll });
        if (!encodedCameraView || encodedCameraView === '0') return;

        const nextQuery: { view: string; cv: string; lng: string; lat: string; z: string; layerId: string; customUrl: string; l?: any } = {
            view: MAP_VIEW_CESIUM,
            [CAMERA_VIEW_PARAM_KEY]: encodedCameraView,
            lng: formatNumber(lng, 6) || '',
            lat: formatNumber(lat, 6) || '',
            z: formatZParam(safeHeight) || '',
            layerId: '',
            customUrl: '',
        };

        const normalized = normalizeBasemapSelection({ id: activePresetId });
        if (normalized.id) {
            const urlLayerNumber = getBasemapUrlMapping().getLayerIndexById(normalized.id);
            if (urlLayerNumber !== null) nextQuery.l = String(urlLayerNumber);
        }

        replaceUrlQuery(nextQuery);
        onCameraViewSync?.({
            view: MAP_VIEW_CESIUM,
            camera: { lng, lat, height: safeHeight, heading, pitch, roll },
        });
    }

    function getCamera() {
        const viewer = getViewer?.();
        return viewer?.camera || viewer?.scene?.camera || null;
    }

    /**
     * 判断两个 query 快照是否完全一致。
     * @param {Record<string, string>} currentQuery - 当前 URL query
     * @param {Record<string, string>} nextQuery - 目标 URL query
     * @returns {boolean}
     */
    function isSameQuerySnapshot(currentQuery: any, nextQuery: any) {
        const currentKeys = Object.keys(currentQuery).filter((key) => currentQuery[key] !== undefined && currentQuery[key] !== null && currentQuery[key] !== '');
        const nextKeys = Object.keys(nextQuery).filter((key) => nextQuery[key] !== undefined && nextQuery[key] !== null && nextQuery[key] !== '');
        if (currentKeys.length !== nextKeys.length) return false;
        return nextKeys.every((key) => String(currentQuery[key] ?? '') === String(nextQuery[key] ?? ''));
    }

    /**
     * 使用 router.replace 统一写入 URL（与 OL 侧 useMapState 保持一致）。
     * 不使用 window.history.replaceState 以避免 route.query 与实际 hash 分裂。
     */
    function replaceUrlQuery(nextQuery: any) {
        const mergedQuery: Record<string, any> = {
            ...readLocationQuerySnapshot(),
            ...nextQuery,
        };

        // 清理不在本次写入范围内的 Cesium 独立姿态键
        CAMERA_STATE_QUERY_KEYS.forEach((key) => {
            if (!(key in nextQuery)) delete mergedQuery[key];
        });

        // 清洗空值；空字符串用于显式删除 cv 等字段
        Object.keys(mergedQuery).forEach((key) => {
            const value = mergedQuery[key];
            if (value === undefined || value === null || value === '') delete mergedQuery[key];
            else mergedQuery[key] = String(value);
        });

        const currentSnapshot = readLocationQuerySnapshot();
        if (isSameQuerySnapshot(currentSnapshot, mergedQuery)) return;

        void router
            .replace({ path: route.path || '/home', query: mergedQuery })
            .catch(() => {});
    }

    return {
        restoreCameraFromUrl,
        restoreBasemapFromUrl,
        syncBasemapToUrl,
        bindCameraViewSync,
        cleanupCameraViewSync,
    };
}

function parseFiniteNumber(value: any) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeCameraHeight(value: any) {
    const height = parseFiniteNumber(value);
    if (height === null || height < MIN_CAMERA_HEIGHT || height > MAX_CAMERA_HEIGHT) return null;
    return height;
}

function isValidCameraState(cameraState: any) {
    if (!cameraState) return false;
    const lng = Number(cameraState.lng);
    const lat = Number(cameraState.lat);
    const height = Number(cameraState.height);
    const heading = Number(cameraState.heading);
    const pitch = Number(cameraState.pitch);
    const roll = Number(cameraState.roll);
    return (
        Number.isFinite(lng) &&
        lng >= -180 &&
        lng <= 180 &&
        Number.isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        Number.isFinite(height) &&
        height >= MIN_CAMERA_HEIGHT &&
        height <= MAX_CAMERA_HEIGHT &&
        Number.isFinite(heading) &&
        Number.isFinite(pitch) &&
        pitch >= -90 &&
        pitch <= 90 &&
        Number.isFinite(roll)
    );
}

function clampPitchDegrees(value: any) {
    const pitch = Number(value);
    if (!Number.isFinite(pitch)) return DEFAULT_CESIUM_PITCH_DEGREES;
    return Math.max(-90, Math.min(90, pitch));
}

function formatNumber(value: any, fractionDigits: number) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(fractionDigits) : null;
}

/**
 * 将 URL 传输链路中的 z 参数格式化为统一两位小数字符串。
 * @param {*} value - Cesium camera height 数值
 * @returns {string|null} 两位小数字符串，或无效时返回 null
 */
function formatZParam(value: any) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : null;
}

function toRadians(Cesium: any, degrees: any) {
    const num = Number(degrees);
    if (!Number.isFinite(num)) return 0;
    return Cesium.Math.toRadians(num);
}

/** Cesium 默认相机状态（中国中心，6000km 高度） */
export const DEFAULT_CESIUM_CAMERA = {
    lng: DEFAULT_CESIUM_LNG,
    lat: DEFAULT_CESIUM_LAT,
    height: DEFAULT_CESIUM_HEIGHT,
};
