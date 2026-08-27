/**
 * viewScale/openlayersScale.js — OL 侧尺度解析
 *
 * 规范来源：Docs/TODO/ol2cesium.md §5/§9
 * 原则：zoom 只是表现层参数；resolution 才是尺度真值来源。
 * 优先消费显式 resolution（view.getResolution()），缺失时由 zoom 推导。
 */

import { olZoomToResolution } from './webMercator.js';

/**
 * 归一化 OL 尺度：优先显式 resolution，否则由 zoom 推导。
 * @param {object} p
 * @param {number} [p.zoom]
 * @param {number} [p.resolution]
 * @returns {{zoom:number|null, resolution:number|null}}
 */
export function resolveOlScale({ zoom, resolution } = {}) {
    const res = Number.isFinite(resolution) && resolution > 0 ? resolution : null;
    if (res !== null) {
        return { zoom: Number.isFinite(zoom) ? zoom : null, resolution: res };
    }
    return {
        zoom: Number.isFinite(zoom) ? zoom : null,
        resolution: Number.isFinite(zoom) ? olZoomToResolution(zoom) : null,
    };
}
