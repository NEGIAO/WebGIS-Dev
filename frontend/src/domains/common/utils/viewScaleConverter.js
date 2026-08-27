/**
 * viewScaleConverter.js — 兼容入口（已重构为 viewScale/ 模块化实现）
 *
 * 规范来源：Docs/TODO/ol2cesium.md
 * 历史调用方（HomeView / agent 适配器等）无需改动：
 *   olZoomToCesiumHeight / cesiumHeightToOlZoom 签名保持不变，
 *   实现已迁移至 canonical ground resolution 链路（viewScale/index.js）。
 *
 * 新代码请直接使用：
 *   import { ... } from '@common/utils/viewScale';
 */

export {
    // 常量
    EARTH_RADIUS,
    DEFAULT_TILE_SIZE,
    WEB_MERCATOR_MAX_LATITUDE,
    DEFAULT_PIXEL_DELTA,
    DEFAULT_ABSOLUTE_TOLERANCE,
    DEFAULT_RELATIVE_TOLERANCE,
    DEFAULT_FOVY_RAD as DEFAULT_FOVY,
    DEFAULT_VIEWPORT_HEIGHT,
    MIN_CESIUM_HEIGHT,
    MAX_CESIUM_HEIGHT,
    MIN_OL_ZOOM,
    MAX_OL_ZOOM,
    // 工具
    nearlyEqual,
    normalizeNegativeZero,
    clampCesiumHeight,
    clampOlZoom,
} from './viewScale/constants-and-precision.js';
export {
    olZoomToResolution,
    olResolutionToZoom,
    webMercatorResolutionToGroundResolution,
    groundResolutionToWebMercatorResolution,
} from './viewScale/webMercator.js';
export { getCesiumGroundResolution } from './viewScale/browserAdapter.js';
export {
    olZoomToCesiumHeight,
    cesiumHeightToOlZoom,
} from './viewScale/compat.js';
