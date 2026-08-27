/**
 * viewScale/conversion.js — 高层完整转换接口（规范 §31/§32/§34/§35）
 *
 * 提供 UnifiedViewState 级别的双向转换：
 *   convertOlViewToCesium  : OL 视图 → Canonical + 目标 Cesium 相机
 *   convertCesiumViewToOl  : Cesium 相机（或射线实测）→ Canonical + OL 视图
 *
 * 精度策略（§43）：
 * - Realtime：解析模型即时计算（零渲染开销）
 * - Precision：注入 measureGroundResolution（浏览器端射线测量）做最终校正
 */

import {
    webMercatorResolutionToGroundResolution,
    groundResolutionToWebMercatorResolution,
} from './webMercator.js';
import { olZoomToResolution, olResolutionToZoom } from './webMercator.js';
import {
    cesiumCameraToGroundResolution,
    groundResolutionToTiltedCameraHeight,
} from './cesiumScale.js';
import { normalizeNegativeZero } from './precision.js';

/** EPSG:3857 [x,y] → [lng,lat]（球面墨卡托逆投影） */
function toLonLatPair(center) {
    if (Array.isArray(center)) {
        const x = Number(center[0]);
        const y = Number(center[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const R = 6378137;
        const lng = (x / R) * (180 / Math.PI);
        const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
        return [lng, lat];
    }
    const lng = Number(center?.longitude);
    const lat = Number(center?.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
}

function normalizeViewport(viewport) {
    const w = Number(viewport?.width);
    const h = Number(viewport?.height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { width: w, height: h };
}

/**
 * OL 视图 → Canonical + Cesium 派生相机态
 *
 * @param {object} p
 * @param {number} p.zoom                 OL 缩放级别（resolution 缺失时使用）
 * @param {number} [p.resolution]         OL EPSG:3857 分辨率（优先于 zoom）
 * @param {[number,number]|{longitude:number,latitude:number}} p.center 视图中心
 * @param {{width:number,height:number}} [p.viewport]   视口尺寸
 * @param {number} [p.fovY]               垂直视场角（弧度；缺省 60°）
 * @param {number} [p.targetPitch=-90]    目标俯仰角（°）
 * @param {number} [p.targetHeading=0]
 * @param {number} [p.targetRoll=0]
 * @param {'flat'|'sphere'} [p.earthModel='flat'] 正俯视高度解算的地球模型；
 *        'sphere' 与 Cesium 射线实测（Precision）同几何，往返可逆性最优
 * @returns {{
 *   center:{longitude:number, latitude:number},
 *   canonicalResolution:number,
 *   ol:{zoom:number|null, resolution:number},
 *   cesium:{height:number, heading:number, pitch:number, roll:number}
 * }|null}
 */
export function olViewToCanonical(p = {}) {
    const center = toLonLatPair(p.center);
    if (!center) return null;
    const [longitude, latitude] = center;

    let resolution =
        Number.isFinite(p.resolution) && p.resolution > 0 ? p.resolution : null;
    if (resolution === null && Number.isFinite(p.zoom)) {
        resolution = olZoomToResolution(p.zoom);
    }
    if (resolution === null || resolution <= 0) return null;

    const canonicalResolution = webMercatorResolutionToGroundResolution(resolution, latitude);

    const viewport = normalizeViewport(p.viewport);
    const pitch = Number.isFinite(p.targetPitch) ? p.targetPitch : -90;
    const heading = Number.isFinite(p.targetHeading) ? p.targetHeading : 0;
    const roll = Number.isFinite(p.targetRoll) ? p.targetRoll : 0;

    const height = groundResolutionToTiltedCameraHeight({
        groundResolution: canonicalResolution,
        pitch,
        fovY: p.fovY,
        viewportHeight: viewport ? viewport.height : undefined,
        earthModel: p.earthModel,
    });

    return {
        center: { longitude, latitude },
        canonicalResolution,
        ol: {
            zoom: Number.isFinite(p.zoom) ? normalizeNegativeZero(p.zoom) : null,
            resolution,
        },
        cesium: { height, heading, pitch, roll },
    };
}

/**
 * Cesium 相机 → Canonical + OL 视图片段
 *
 * @param {object} p
 * @param {number} p.height     相机海拔（米）
 * @param {number} [p.pitch=-90]
 * @param {{width:number,height:number}} [p.viewport]
 * @param {number} [p.fovY]
 * @param {Function} [p.measureGroundResolution] Precision 注入：
 *        () => number|null —— 浏览器端射线实测值优先于解析模型
 * @returns {{
 *   canonicalResolution:number,
 *   measured:boolean,
 *   cesium:{height:number}
 * }|null}
 */
export function cesiumViewToCanonical(p = {}) {
    const height = Number(p.height);
    if (!Number.isFinite(height) || height <= 0) return null;

    // Precision：射线实测优先（Terrain/任意 pitch 的真值来源）
    const measured = typeof p.measureGroundResolution === 'function'
        ? p.measureGroundResolution()
        : null;
    if (Number.isFinite(measured) && measured > 0) {
        return { canonicalResolution: measured, measured: true, cesium: { height } };
    }

    // Realtime：解析近似（平面地表 + 斜距模型）
    const canonicalResolution = cesiumCameraToGroundResolution({
        height,
        pitch: p.pitch,
        fovY: p.fovY,
        viewportHeight: p.viewportHeight ?? p.viewport?.height,
    });
    if (!Number.isFinite(canonicalResolution) || canonicalResolution <= 0) return null;
    return { canonicalResolution, measured: false, cesium: { height } };
}

/**
 * Canonical → 正俯视 Cesium 高度
 */
export function canonicalScaleToCesiumView({
    canonicalResolution,
    pitch = -90,
    fovY = undefined,
    viewportHeight,
} = {}) {
    if (!Number.isFinite(canonicalResolution) || canonicalResolution <= 0) return null;
    return {
        height: groundResolutionToTiltedCameraHeight({
            groundResolution: canonicalResolution,
            pitch,
            fovY,
            viewportHeight,
        }),
    };
}

/**
 * Canonical → OL 视图片段（zoom 由分辨率反推并负零归一化）
 */
export function canonicalScaleToOlView({ canonicalResolution, latitude } = {}) {
    if (!Number.isFinite(canonicalResolution) || canonicalResolution <= 0) return null;
    const resolution = groundResolutionToWebMercatorResolution(canonicalResolution, latitude);
    if (!Number.isFinite(resolution) || resolution <= 0) return null;
    return { resolution, zoom: normalizeNegativeZero(olResolutionToZoom(resolution)) };
}

/**
 * convertOlViewToCesium — 规范 §31 完整接口：OL 视图 → 目标 Cesium 相机态
 *
 * @param {object} p olViewToCanonical 的入参
 *        {zoom, resolution?, center, viewport?, fovY?, targetPitch?, targetHeading?, targetRoll?}
 * @returns {{
 *   center:{longitude:number,latitude:number},
 *   canonicalResolution:number,
 *   ol:{zoom:number|null,resolution:number},
 *   cesium:{height:number,heading:number,pitch:number,roll:number}
 * }|null}
 */
export function convertOlViewToCesium(p = {}) {
    return olViewToCanonical(p);
}

/**
 * convertCesiumViewToOl — 规范 §32 完整接口：Cesium 相机 → Canonical
 *
 * Precision 优先：注入 measureGroundResolution 时以射线实测为真值；
 * 否则退化为解析模型（Realtime）。
 *
 * @param {object} p cesiumViewToCanonical 的入参
 *        {height, pitch?, viewport?, fovY?, measureGroundResolution?}
 * @returns {{
 *   canonicalResolution:number,
 *   measured:boolean,
 *   cesium:{height:number}
 * }|null}
 */
export function convertCesiumViewToOl(p = {}) {
    return cesiumViewToCanonical(p);
}
