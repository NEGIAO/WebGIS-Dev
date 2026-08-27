/**
 * viewScale/constants-and-precision.js — 常量 + 浮点工具聚合（兼容入口）
 */

export {
    EARTH_RADIUS,
    DEFAULT_TILE_SIZE,
    WEB_MERCATOR_MAX_LATITUDE,
    DEFAULT_PIXEL_DELTA,
    DEFAULT_ABSOLUTE_TOLERANCE,
    DEFAULT_RELATIVE_TOLERANCE,
    DEFAULT_FOVY_RAD,
    DEFAULT_FOVY_RAD as DEFAULT_FOVY,
    DEFAULT_VIEWPORT_HEIGHT,
    MIN_CESIUM_HEIGHT,
    MAX_CESIUM_HEIGHT,
    MIN_OL_ZOOM,
    MAX_OL_ZOOM,
} from './constants.js';

export {
    nearlyEqual,
    normalizeNegativeZero,
    clampCesiumHeight,
    clampOlZoom,
} from './precision.js';
