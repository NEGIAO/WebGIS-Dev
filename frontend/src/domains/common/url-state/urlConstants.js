/**
 * URL 参数共享常量。
 * 所有 OL / Cesium / UI 组件统一从此 import，避免常量重复定义。
 */

/** 地图视图引擎常量 */
export const MAP_VIEW_OL = 'ol';
export const MAP_VIEW_CESIUM = 'cesium';

/** Cesium 相机视角 URL 参数键名 */
export const CAMERA_VIEW_PARAM_KEY = 'cv';

/** Cesium 相机姿态单独 query 键（会被编码进 cv，URL 独立展示时不保留） */
export const CAMERA_STATE_QUERY_KEYS = ['heading', 'pitch', 'roll'];

/**
 * 规范化地图视图参数。
 * @param {*} value - URL 或业务侧传入的视图值
 * @returns {'ol'|'cesium'} 规范化后的视图值
 */
export function normalizeMapView(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === MAP_VIEW_CESIUM || normalized === '3d') return MAP_VIEW_CESIUM;
    return MAP_VIEW_OL;
}