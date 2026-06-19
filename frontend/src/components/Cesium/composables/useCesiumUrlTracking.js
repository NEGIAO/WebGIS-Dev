/**
 * Cesium URL 动态追踪。
 * - lng/lat/z 在 Cesium 模式下表示相机经纬度和高度。
 * - cv 只编码 Cesium 姿态（heading/pitch/roll），旧 full-camera cv 仍兼容解码。
 * - l 底图预设索引，与 OL 共享同一套 URL_LAYER_OPTIONS 映射。
 */
import { useRoute, useRouter } from 'vue-router';
import { MAP_VIEW_CESIUM, CAMERA_VIEW_PARAM_KEY, CAMERA_STATE_QUERY_KEYS } from '../../../utils/url/urlConstants';
import {
    decodeCesiumCameraState,
    decodeCesiumPoseState,
    encodeCesiumPoseState,
} from '../../../utils/url/crypto';
import { getCurrentQuerySnapshot, readQueryValue as readQueryFromSnapshot } from '../../../utils/url/urlQueryReader';
import { URL_LAYER_OPTIONS } from '../../../constants/basemap/basemapResolver';
import { createBasemapUrlMappingFeature } from '../../../composables/map/features/useBasemapUrlMapping';
import { getLayerCategory, getLayerGroup } from '../../../constants/basemap/basemapResolver';

export { MAP_VIEW_CESIUM, CAMERA_VIEW_PARAM_KEY };

// ========== 底图 URL 映射实例 ==========
// 复用 OL 侧的 getLayerIdByIndex / getLayerIndexById
const { getLayerIdByIndex, getLayerIndexById } = createBasemapUrlMappingFeature({
    urlLayerOptions: URL_LAYER_OPTIONS,
    getLayerCategoryById: getLayerCategory,
    getLayerGroupById: getLayerGroup,
});

const DEFAULT_CESIUM_HEIGHT = 6000000;
const DEFAULT_CESIUM_LNG = 104.1954;
const DEFAULT_CESIUM_LAT = 35.8617;
const DEFAULT_CESIUM_PITCH_DEGREES = -90;
const MIN_CAMERA_HEIGHT = 1;
const MAX_CAMERA_HEIGHT = 50000000;

/**
 * 创建 Cesium URL 追踪器。
 * @param {Object} options - 配置项
 * @param {Function} options.getViewer - 获取 Cesium Viewer
 * @param {Function} options.getCesium - 获取 Cesium 运行时
 * @returns {{restoreCameraFromUrl: Function, restoreBasemapFromUrl: Function, bindCameraViewSync: Function, syncBasemapToUrl: Function, cleanupCameraViewSync: Function}} URL 追踪 API
 */
export function useCesiumUrlTracking({ getViewer, getCesium, onCameraViewSync, onBasemapRestore } = {}) {
    const route = useRoute();
    const router = useRouter();
    let removeMoveEndListener = null;

    function readQueryValue(key) {
        return readQueryFromSnapshot(key, route.query);
    }

    /**
     * 从 URL 读取 Cesium 相机恢复状态，优先解析 cv 编码参数。
     * @returns {{lng:number, lat:number, height:number, heading:number|null, pitch:number|null, roll:number|null}|null} 相机状态
     */
    function parseCameraStateFromUrl() {
        const encodedCameraView = String(readQueryValue(CAMERA_VIEW_PARAM_KEY) || '').trim();
        const lng = parseFiniteNumber(readQueryValue('lng'));
        const lat = parseFiniteNumber(readQueryValue('lat'));
        const height = normalizeCameraHeight(readQueryValue('z'));

        const decodedPose = decodeCesiumPoseState(encodedCameraView);
        if (decodedPose && lng !== null && lat !== null && height !== null) {
            const poseCameraState = { lng, lat, height, ...decodedPose };
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
     * 将当前活跃底图预设的索引写入 URL。
     * 与 OL 侧 useMapState 使用同一套 URL_LAYER_OPTIONS 映射，
     * 实现 2D ↔ 3D 切换时底图预设保持一致。
     *
     * @param {string} presetId - 当前 Cesium 活跃底图预设 ID
     * @returns {string|null} 实际写入的索引字符串，presetId 无效时返回 null
     */
    function syncBasemapToUrl(presetId) {
        if (!presetId) return null;
        const layerIndex = getLayerIndexById(presetId);
        if (layerIndex === null) return null;

        const nextQuery = {
            view: MAP_VIEW_CESIUM,
            l: String(layerIndex),
        };
        replaceUrlQuery(nextQuery);
        return String(layerIndex);
    }

    /**
     * 从 URL 参数 l 恢复底图预设
     * @returns {string|null} 预设 ID，无效时返回 null
     */
    function restoreBasemapFromUrl() {
        const layerIndex = parseFiniteNumber(readQueryValue('l'));
        if (layerIndex === null) return null;

        const presetId = getLayerIdByIndex(layerIndex);
        if (presetId) {
            onBasemapRestore?.(presetId);
        }
        return presetId;
    }

    /**
     * 绑定 Cesium 相机 moveEnd 事件，用户停下视角后写回 cv 编码参数。
     * @param {Object} [options]
     * @param {boolean} [options.initialSync=false] - 是否绑定后立即同步一次 URL
     * @param {Function} [options.getActivePresetId] - 获取当前活跃底图预设 ID 的函数
     */
    function bindCameraViewSync({ initialSync = false, getActivePresetId } = {}) {
        const camera = getCamera();
        if (!camera?.moveEnd || removeMoveEndListener) return;
        removeMoveEndListener = camera.moveEnd.addEventListener(() => {
            const activePresetId = getActivePresetId?.();
            syncCameraViewToUrl({ activePresetId });
        });
        if (initialSync) {
            const activePresetId = getActivePresetId?.();
            syncCameraViewToUrl({ activePresetId });
        }
    }

    /**
     * 清理 Cesium 相机视角 URL 监听。
     */
    function cleanupCameraViewSync() {
        if (typeof removeMoveEndListener === 'function') {
            removeMoveEndListener();
        }
        removeMoveEndListener = null;
    }

    /**
     * 将当前 Cesium 相机姿态编码写回 URL。
     * 同时写入 lng/lat/z 为相机位置，保证 cv 与明文坐标一致。
     * @param {Object} [options]
     * @param {string} [options.activePresetId] - 当前底图预设 ID，用于 l 参数写入
     */
    function syncCameraViewToUrl({ activePresetId } = {}) {
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
        const encodedCameraView = encodeCesiumPoseState({
            heading,
            pitch,
            roll,
        });
        if (!encodedCameraView || encodedCameraView === '0') return;

        const payload = {
            view: MAP_VIEW_CESIUM,
            camera: {
                lng,
                lat,
                height: safeHeight,
                heading,
                pitch,
                roll,
            },
        };

        // 构建 URL 查询参数
        const nextQuery = {
            view: MAP_VIEW_CESIUM,
            [CAMERA_VIEW_PARAM_KEY]: encodedCameraView,
            lng: formatNumber(lng, 6),
            lat: formatNumber(lat, 6),
            z: formatZParam(safeHeight),
        };

        // 写入底图 l 参数
        const presetId = activePresetId;
        if (presetId) {
            const layerIndex = getLayerIndexById(presetId);
            if (layerIndex !== null) {
                nextQuery.l = String(layerIndex);
            }
        }

        // 同时写入姿态 cv + 明文 lng/lat/z，保证 Cesium URL 语义完整一致。
        replaceUrlQuery(nextQuery);
        onCameraViewSync?.(payload);
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
    function isSameQuerySnapshot(currentQuery, nextQuery) {
        const currentKeys = Object.keys(currentQuery).filter((key) => currentQuery[key] !== undefined && currentQuery[key] !== null && currentQuery[key] !== '');
        const nextKeys = Object.keys(nextQuery).filter((key) => nextQuery[key] !== undefined && nextQuery[key] !== null && nextQuery[key] !== '');
        if (currentKeys.length !== nextKeys.length) return false;
        return nextKeys.every((key) => String(currentQuery[key] ?? '') === String(nextQuery[key] ?? ''));
    }

    /**
     * 使用 router.replace 统一写入 URL（与 OL 侧 useMapState 保持一致）。
     * 不使用 window.history.replaceState 以避免 route.query 与实际 hash 分裂。
     */
    function replaceUrlQuery(nextQuery) {
        const mergedQuery = {
            ...getCurrentQuerySnapshot(route.query),
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

        const currentSnapshot = getCurrentQuerySnapshot(route.query);
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

function parseFiniteNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeCameraHeight(value) {
    const height = parseFiniteNumber(value);
    if (height === null || height < MIN_CAMERA_HEIGHT || height > MAX_CAMERA_HEIGHT) return null;
    return height;
}

function isValidCameraState(cameraState) {
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

function clampPitchDegrees(value) {
    const pitch = Number(value);
    if (!Number.isFinite(pitch)) return DEFAULT_CESIUM_PITCH_DEGREES;
    return Math.max(-90, Math.min(90, pitch));
}

function formatNumber(value, fractionDigits) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(fractionDigits) : null;
}

/**
 * 将 URL 传输链路中的 z 参数格式化为统一两位小数字符串。
 * @param {*} value - Cesium camera height 数值
 * @returns {string|null} 两位小数字符串，或无效时返回 null
 */
function formatZParam(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : null;
}

function toRadians(Cesium, degrees) {
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