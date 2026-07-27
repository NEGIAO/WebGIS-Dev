/**
 * Wind2D.js
 * 2D 风场粒子可视化 — 基于 cesium-wind-layer 的 WindLayer
 *
 * 内嵌于 cesium-wind-layer/ 模块，可直接修改。
 * 数据格式：wind_globe.json（GFS 全球风场 U/V 分量）
 */
import { WindLayer } from './index.mjs';

/** 粒子颜色带：从慢到快 */
const WIND_COLORS = ['#00ffff', '#00ff00', '#ffff00', '#ff8000', '#ff0000'];

/** 粒子纹理边长上限：size² 即粒子数，超过 512(26 万粒子) 段绘制顶点数会拖垮帧率 */
const MAX_PARTICLES_TEXTURE_SIZE = 512;
const MIN_PARTICLES_TEXTURE_SIZE = 16;

/**
 * 将 particlesTextureSize 钳制到安全区间，防止面板/调用方误设超大值。
 * @param {number} size - 期望的粒子纹理边长
 * @returns {number} 钳制后的边长
 */
function clampParticlesTextureSize(size) {
    const n = Number(size);
    if (!Number.isFinite(n)) return 256;
    return Math.max(MIN_PARTICLES_TEXTURE_SIZE, Math.min(MAX_PARTICLES_TEXTURE_SIZE, Math.round(n)));
}

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
            particlesTextureSize: 256,
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
            useViewerBounds: false,
        };

        const mergedOptions = { ...defaultOptions, ...options };
        mergedOptions.particlesTextureSize = clampParticlesTextureSize(mergedOptions.particlesTextureSize);
        this._windLayer = new WindLayer(viewer, windData, mergedOptions);
    }

    /** 是否可见 */
    get show() {
        return this._windLayer ? this._windLayer.show : false;
    }

    set show(v) {
        if (this._windLayer) this._windLayer.show = v;
    }

    /** 运行时更新参数（粒子数经 clamp，避免超载重建） */
    updateOptions(options) {
        if (!this._windLayer) return;
        const next = { ...options };
        if (next.particlesTextureSize !== undefined) {
            next.particlesTextureSize = clampParticlesTextureSize(next.particlesTextureSize);
        }
        this._windLayer.updateOptions(next);
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
