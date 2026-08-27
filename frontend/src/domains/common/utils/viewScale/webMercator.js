/**
 * viewScale/webMercator.js — Web Mercator 投影层
 *
 * 规范来源：Docs/TODO/ol2cesium.md §6/§7
 * 职责：EPSG:3857 zoom ↔ resolution 互转、纬度修正（groundResolution）。
 */

import {
    EARTH_RADIUS,
    DEFAULT_TILE_SIZE,
    WEB_MERCATOR_MAX_LATITUDE,
} from './constants.js';

/** Web Mercator zoom=0 投影分辨率（米/像素） */
export function webMercatorInitialResolution(
    tileSize = DEFAULT_TILE_SIZE,
    earthRadius = EARTH_RADIUS,
) {
    return (2 * Math.PI * earthRadius) / tileSize;
}

/**
 * OL 缩放级别 → EPSG:3857 投影分辨率（米/像素）
 * @param {number} zoom
 * @param {number} [tileSize=256]
 * @param {number} [earthRadius=6378137]
 */
export function olZoomToResolution(zoom, tileSize = DEFAULT_TILE_SIZE, earthRadius = EARTH_RADIUS) {
    const worldSize = 2 * Math.PI * earthRadius;
    return worldSize / (tileSize * Math.pow(2, zoom));
}

/**
 * EPSG:3857 投影分辨率 → OL 缩放级别（与 olZoomToResolution 严格互逆）
 * @param {number} resolution
 * @param {number} [tileSize=256]
 * @param {number} [earthRadius=6378137]
 */
export function olResolutionToZoom(resolution, tileSize = DEFAULT_TILE_SIZE, earthRadius = EARTH_RADIUS) {
    const worldSize = 2 * Math.PI * earthRadius;
    return Math.log2(worldSize / (tileSize * resolution));
}

/** 纬度钳制到 Web Mercator 合法范围 */
export function clampWebMercatorLatitude(latitude) {
    return Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude));
}

function latRad(latitude) {
    return (clampWebMercatorLatitude(latitude) * Math.PI) / 180;
}

/**
 * 投影分辨率 → 真实地面分辨率（米/像素），纬度修正
 *   groundResolution = resolution₃₈₅₇ · cos(φ)
 * @param {number} resolution EPSG:3857 分辨率
 * @param {number} latitude 纬度（°）
 */
export function webMercatorResolutionToGroundResolution(resolution, latitude) {
    return resolution * Math.cos(latRad(latitude));
}

/**
 * 真实地面分辨率 → 投影分辨率（逆变换）
 * @param {number} groundResolution 地面分辨率（米/像素）
 * @param {number} latitude 纬度（°）
 */
export function groundResolutionToWebMercatorResolution(groundResolution, latitude) {
    return groundResolution / Math.cos(latRad(latitude));
}
