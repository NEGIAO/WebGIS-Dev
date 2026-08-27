/**
 * viewScale/compat.js — 旧 API 兼容层
 *
 * olZoomToCesiumHeight / cesiumHeightToOlZoom：
 *   OL zoom ↔ Cesium 相机高度（正俯视语义）。
 *   内部走 canonical 链路（zoom → resolution → G → height 及其逆），
 *   与 convertOlViewToCesium / convertCesiumViewToOl 尺度完全一致。
 *
 * 旧签名参数别名（v1 viewScaleConverter 时代，既有调用方仍在使用）：
 *   - mapSize: [宽px, 高px]        → 视口高度（取 [1]，降级 [0]）
 *   - cesiumFovy: 弧度             → 垂直视场角
 *   - clamp: true                  → 结果钳制到 [MIN_CAMERA_HEIGHT, MAX_CAMERA_HEIGHT]
 */

import {
    olZoomToResolution,
    olResolutionToZoom,
    webMercatorResolutionToGroundResolution,
    groundResolutionToWebMercatorResolution,
} from './webMercator.js';
import { normalizeNegativeZero, clampCesiumHeight } from './precision.js';
import { DEFAULT_VIEWPORT_HEIGHT, DEFAULT_FOVY_RAD } from './constants.js';

/**
 * 解析视口高度：viewportHeight → viewport.height → mapSize[1] → mapSize[0] → 默认值
 */
function resolveViewportHeight(o) {
    const direct = Number(o.viewportHeight);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const vh = Number(o.viewport?.height);
    if (Number.isFinite(vh) && vh > 0) return vh;
    if (Array.isArray(o.mapSize)) {
        const h = Number(o.mapSize[1]);
        if (Number.isFinite(h) && h > 0) return h;
        const w = Number(o.mapSize[0]);
        if (Number.isFinite(w) && w > 0) return w;
    }
    return DEFAULT_VIEWPORT_HEIGHT;
}

/** 解析垂直视场角：fovY → cesiumFovy（旧名）→ 默认 60°；合法区间 (0, π) */
function resolveFovY(o) {
    for (const raw of [o.fovY, o.cesiumFovy]) {
        const f = Number(raw);
        if (Number.isFinite(f) && f > 0 && f < Math.PI) return f;
    }
    return DEFAULT_FOVY_RAD;
}

/**
 * OL zoom → Cesium 相机离地高度（米）
 * @param {object} o { zoom, centerLat?, viewport?, viewportHeight?, fovY?, cesiumFovy?, mapSize?, clamp? }
 * @returns {number|null}
 */
export function olZoomToCesiumHeight(o = {}) {
    const zoom = Number(o.zoom);
    if (!Number.isFinite(zoom)) return null;
    const res = olZoomToResolution(zoom);
    // 纬度修正：centerLat（度）缺省视为 0°（不做修正）；严禁把 cos 值传入纬度形参
    const ground = webMercatorResolutionToGroundResolution(res, Number.isFinite(Number(o.centerLat)) ? Number(o.centerLat) : 0);
    const vh = resolveViewportHeight(o);
    const height = (ground * vh) / (2 * Math.tan(resolveFovY(o) / 2));
    return o.clamp ? clampCesiumHeight(height) : height;
}

/**
 * Cesium 高度 → OL zoom（olZoomToCesiumHeight 的严格逆变换）
 * @param {object} o { height, centerLat?, viewport?, viewportHeight?, fovY?, cesiumFovy?, mapSize? }
 * @returns {number|null}
 */
export function cesiumHeightToOlZoom(o = {}) {
    const h = Number(o.height);
    if (!Number.isFinite(h) || h <= 0) return null;
    const ground = (h * 2 * Math.tan(resolveFovY(o) / 2)) / resolveViewportHeight(o);
    const res = groundResolutionToWebMercatorResolution(
        ground,
        Number.isFinite(Number(o.centerLat)) ? Number(o.centerLat) : 0,
    );
    if (!Number.isFinite(res) || res <= 0) return null;
    return normalizeNegativeZero(olResolutionToZoom(res));
}
