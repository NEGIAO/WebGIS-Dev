/**
 * 地图视图 URL 参数管理。
 * 负责读取和写入 view=ol|cesium，保持 2D/3D 面板状态可刷新、可分享。
 */
import { useRoute, useRouter } from 'vue-router';
import {
    CAMERA_VIEW_PARAM_KEY,
    MAP_VIEW_CESIUM,
    MAP_VIEW_OL,
    normalizeMapView,
} from '../utils/url/urlConstants';
export { CAMERA_VIEW_PARAM_KEY, MAP_VIEW_CESIUM, MAP_VIEW_OL, normalizeMapView } from '../utils/url/urlConstants';
import { readHashQueryValue, getCurrentQuerySnapshot } from '../utils/url/urlQueryReader';

const DEFAULT_CESIUM_URL_HEIGHT = '6000000.00';
const MIN_CAMERA_HEIGHT = 1;
const MAX_CAMERA_HEIGHT = 50000000;

/**
 * 判断 z 参数是否应替换为 Cesium 默认相机高度。
 * 当 z 为空、非有限数、≤0 或超过最大高度时返回 true。
 * @param {*} z - URL z 参数值
 * @returns {boolean}
 */
function shouldUseDefaultCesiumHeight(z) {
    if (z === null || z === undefined || z === '') return true;
    const num = Number(z);
    if (!Number.isFinite(num)) return true;
    return num < MIN_CAMERA_HEIGHT || num >= MAX_CAMERA_HEIGHT;
}

/**
 * 判断两个 query 快照是否完全一致。
 * @param {Record<string, string>} currentQuery - 当前 query
 * @param {Record<string, string>} nextQuery - 目标 query
 * @returns {boolean}
 */
function isSameQuerySnapshot(currentQuery, nextQuery) {
    const currentKeys = Object.keys(currentQuery).filter((key) => currentQuery[key] !== undefined && currentQuery[key] !== null && currentQuery[key] !== '');
    const nextKeys = Object.keys(nextQuery).filter((key) => nextQuery[key] !== undefined && nextQuery[key] !== null && nextQuery[key] !== '');
    if (currentKeys.length !== nextKeys.length) return false;
    return nextKeys.every((key) => String(currentQuery[key] ?? '') === String(nextQuery[key] ?? ''));
}

/**
 * 创建地图视图 URL 状态控制器。
 * @returns {{getCurrentMapView: Function, replaceMapView: Function}} 视图读取与写入方法
 */
export function useMapViewUrlState() {
    const route = useRoute();
    const router = useRouter();

    function getCurrentMapView() {
        const routeValue = Array.isArray(route.query?.view)
            ? route.query.view[0]
            : route.query?.view;
        return normalizeMapView(readHashQueryValue('view') || routeValue);
    }

    /**
     * 切换地图视图并同步 URL 参数（使用 router.replace 保证 route.query 一致性）。
     * @param {'ol'|'cesium'} view - 目标地图视图
     * @param {Object} [options={}] - 写入选项
     * @param {Record<string, string|number|null|undefined>} [options.queryPatch] - 视图切换时一并写入的 URL 参数
     */
    function replaceMapView(view, { queryPatch = {} } = {}) {
        const normalizedView = normalizeMapView(view);
        const nextQuery = {
            ...getCurrentQuerySnapshot(route.query),
            ...queryPatch,
            view: normalizedView,
        };

        const currentView = getCurrentMapView();
        if (normalizedView === MAP_VIEW_OL) {
            delete nextQuery[CAMERA_VIEW_PARAM_KEY];
            delete nextQuery.heading;
            delete nextQuery.pitch;
            delete nextQuery.roll;
        } else if (
            normalizedView === MAP_VIEW_CESIUM &&
            currentView !== normalizedView &&
            (!queryPatch || !Object.prototype.hasOwnProperty.call(queryPatch, 'z')) &&
            shouldUseDefaultCesiumHeight(nextQuery.z)
        ) {
            // 视图从 OL 切到 Cesium 时不能复用 OL 缩放级别 z，必须改成 Cesium 相机高度。
            nextQuery.z = DEFAULT_CESIUM_URL_HEIGHT;
        }

        // 清洗空值
        Object.keys(nextQuery).forEach((key) => {
            const value = nextQuery[key];
            if (value === undefined || value === null || value === '') delete nextQuery[key];
            else nextQuery[key] = String(value);
        });

        const currentSnapshot = getCurrentQuerySnapshot(route.query);
        if (isSameQuerySnapshot(currentSnapshot, nextQuery)) {
            return;
        }

        void router
            .replace({ path: route.path || '/home', query: nextQuery })
            .catch(() => {});
    }

    return {
        getCurrentMapView,
        replaceMapView,
    };
}