/**
 * viewScale/precision.js — 浮点误差判定工具
 *
 * 规范来源：Docs/TODO/ol2cesium.md §25
 * 禁止 a === b 直接比较转换结果，统一走 nearlyEqual。
 */

import {
    MIN_CAMERA_HEIGHT,
    MAX_CAMERA_HEIGHT,
    MIN_OL_ZOOM,
    MAX_OL_ZOOM,
} from './constants.js';

/**
 * 近似相等判定（绝对容差优先，其次相对容差）
 * @param {number} a
 * @param {number} b
 * @param {number} [absoluteTolerance=1e-10]
 * @param {number} [relativeTolerance=1e-10]
 * @returns {boolean}
 */
export function nearlyEqual(a, b, absoluteTolerance = 1e-10, relativeTolerance = 1e-10) {
    const diff = Math.abs(a - b);
    if (diff <= absoluteTolerance) return true;
    return diff <= relativeTolerance * Math.max(Math.abs(a), Math.abs(b));
}

/** 负零归一化：|x| < epsilon 时返回 +0，避免序列化为 '-0.00' */
export function normalizeNegativeZero(x, epsilon = 1e-12) {
    return Math.abs(x) < epsilon ? 0 : x;
}

/** 相机高度边界钳制（米） */
export function clampCesiumHeight(height){
    const h=Number(height);
    if(!Number.isFinite(h)) return null;
    return Math.max(MIN_CAMERA_HEIGHT, Math.min(MAX_CAMERA_HEIGHT, h));
}

/** OL 缩放级别边界钳制 */
export function clampOlZoom(zoom){
    const z=Number(zoom);
    if(!Number.isFinite(z)) return null;
    return Math.max(MIN_OL_ZOOM, Math.min(MAX_OL_ZOOM, z));
}
