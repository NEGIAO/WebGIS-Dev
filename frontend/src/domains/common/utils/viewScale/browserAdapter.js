/**
 * viewScale/browserAdapter.js — 浏览器端射线测量适配
 *
 * 将 Cesium Viewer 的 pickRay / globe.pick / Cartesian3.distance 注入
 * 引擎无关的 measureCesiumGroundResolutionFromRays，得到当前视角下
 * 真实的地面分辨率（米/屏幕像素）。
 *
 * Terrain：globe.pick 内部优先命中地形表面——开/关 Terrain 自动生效。
 * 失败策略：按候选点顺序回退（中心 → 上下左右偏移），全部未命中返回 null。
 */

import { measureCesiumGroundResolutionFromRays } from './cesiumScale.js';
import { DEFAULT_PIXEL_DELTA } from './constants.js';

/**
 * 测量 Cesium 当前视角的真实地面分辨率
 *
 * @param {object} viewer Cesium Viewer（或暴露 scene/camera 的等价对象）
 * @param {object} [options]
 * @param {number} [options.deltaPixel=1] 采样像素步长
 * @param {Array<[number,number]>} [options.candidatePoints] 归一化候选点
 * @returns {{groundResolution:number, usedPoint:[number,number]}|null}
 */
export function getCesiumGroundResolution(viewer, options = {}) {
    if (!viewer?.scene || !viewer?.camera) return null;

    const canvas = viewer.scene.canvas;
    const width = Number(canvas?.clientWidth);
    const height = Number(canvas?.clientHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }

    const deltaPixel = Number.isFinite(options.deltaPixel)
        ? options.deltaPixel
        : DEFAULT_PIXEL_DELTA;

    const result = measureCesiumGroundResolutionFromRays({
        canvasWidth: width,
        canvasHeight: height,
        deltaPixel,
        candidatePoints: options.candidatePoints,
        pickRay: (pixel) => {
            try {
                return viewer.camera.getPickRay({
                    x: pixel.x,
                    y: pixel.y,
                });
            } catch {
                return null;
            }
        },
        globePick: (ray) => {
            try {
                // globe.pick 优先命中地形；无 Terrain 时命中椭球面
                return viewer.scene.globe.pick(ray, viewer.scene);
            } catch {
                return null;
            }
        },
        distance: (a, b) => {
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dz = a.z - b.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        },
    });

    return result ? { groundResolution: result.groundResolution, usedPoint: result.usedPoint } : null;
}
