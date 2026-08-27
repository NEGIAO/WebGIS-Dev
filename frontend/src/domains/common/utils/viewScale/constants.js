/**
 * viewScale/constants.js — 双引擎视图尺度系统常量（SSOT）
 *
 * 规范来源：Docs/TODO/ol2cesium.md §29
 */

export const EARTH_RADIUS = 6378137;

export const DEFAULT_TILE_SIZE = 256;

export const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798;

/** 屏幕像素采样步长（中心 vs 邻近像素） */
export const DEFAULT_PIXEL_DELTA = 1;

export const DEFAULT_ABSOLUTE_TOLERANCE = 1e-10;

export const DEFAULT_RELATIVE_TOLERANCE = 1e-10;

/** Web Mercator zoom=0 投影分辨率：2πR / tileSize ≈ 156543.03392804097 米/像素 */
export const WEB_MERCATOR_INITIAL_RESOLUTION =
    (2 * Math.PI * EARTH_RADIUS) / DEFAULT_TILE_SIZE;

/** Cesium 默认垂直视场角 60°（弧度） */
export const DEFAULT_FOVY_RAD = Math.PI / 3;

/** 未提供视口尺寸时的兜底高度（典型桌面端，像素） */
export const DEFAULT_VIEWPORT_HEIGHT = 768;

/** 相机离地高度边界（米） */
export const MIN_CAMERA_HEIGHT = 1;
export const MAX_CAMERA_HEIGHT = 50_000_000;

/** 兼容别名：旧 viewScaleConverter 命名 */
export const MIN_CESIUM_HEIGHT = MIN_CAMERA_HEIGHT;
export const MAX_CESIUM_HEIGHT = MAX_CAMERA_HEIGHT;

/** OL 缩放级别边界 */
export const MIN_OL_ZOOM = 0;
export const MAX_OL_ZOOM = 22;

/** 二分求解默认参数 */
export const SOLVE_MIN_HEIGHT = MIN_CAMERA_HEIGHT;
export const SOLVE_MAX_HEIGHT = MAX_CAMERA_HEIGHT;
export const SOLVE_TOLERANCE_RATIO = 1e-6;
export const SOLVE_MAX_ITERATIONS = 60;
