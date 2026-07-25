/**
 * Wind2D.js
 * 2D 风场粒子可视化 — 基于 cesium-wind-layer 的 WindLayer
 *
 * 替换了旧的自研 WebGL2 管线，使用 cesium-wind-layer 库实现 GPU 粒子风场。
 * 数据格式：wind_globe.json（GFS 全球风场 U/V 分量）
 */
import { WindLayer } from 'cesium-wind-layer';

/** 粒子颜色带：从慢到快 */
const WIND_COLORS = ['#00ffff', '#00ff00', '#ffff00', '#ff8000', '#ff0000'];

export default class Wind2D {
    /**
     * @param {import('cesium').Viewer} viewer - Cesium Viewer 实例
     * @param {object} windData - 归一化后的风场数据（{ u, v, bounds, width, height }）
     * @param {object} [options] - 可选配置
     */
    constructor(viewer, windData, options = {}) {
        this._viewer = viewer;
        this._windLayer = null;
        this._isDestroyed = false;

        const defaultOptions = {
            colors: WIND_COLORS,
            particlesTextureSize: 600,
            particleHeight: 1000,
            lineWidth: { min: 1, max: 10 },
            lineLength: { min: 20, max: 800 },
            speedFactor: 1.0,
            dropRate: 0.003,
            dropRateBump: 0.001,
            flipY: true,
            domain: undefined,
            displayRange: undefined,
            dynamic: true,
            useViewerBounds: true,
        };

        const mergedOptions = { ...defaultOptions, ...options };
        this._windLayer = new WindLayer(viewer, windData, mergedOptions);
    }

    /** 是否可见 */
    get show() {
        return this._windLayer ? this._windLayer.show : false;
    }

    set show(v) {
        if (this._windLayer) this._windLayer.show = v;
    }

    /** 运行时更新参数 */
    updateOptions(options) {
        if (this._windLayer) this._windLayer.updateOptions(options);
    }

    /** 飞至风场范围 */
    flyTo(duration = 3) {
        if (this._windLayer) this._windLayer.zoomTo(duration);
    }

    /** 销毁释放资源 */
    destroy() {
        if (this._isDestroyed) return;
        if (this._windLayer) {
            this._windLayer.remove();
            this._windLayer.destroy();
            this._windLayer = null;
        }
        this._isDestroyed = true;
    }

    isDestroyed() {
        return this._isDestroyed;
    }
}

export { WIND_COLORS };
