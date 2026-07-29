/**
 * lercDecode.worker.js
 * ArcGIS 地形 LERC 瓦片解码 Worker
 *
 * 背景:Cesium 原生 ArcGISTiledElevationTerrainProvider 在主线程同步执行
 * LercDecode.decode(每瓦 257² 约 2~6ms),缩放/飞行时瓦片风暴会把主线程
 * 占满 100~400ms → 明显卡顿。本 Worker 把解码移出主线程,
 * 输入输出均走 Transferable 零拷贝。
 *
 * 协议:
 *  in : { id: number, buffer: ArrayBuffer }           (buffer transfer)
 *  out: { id, ok: true, width, height, pixels }        (pixels.buffer transfer)
 *       { id, ok: false, error: string }
 */
import LercModule from 'lerc';

// lerc 3.0.0 为 UMD(module.exports = Lerc);兼容打包器可能的 default 包装
const Lerc = (LercModule && typeof LercModule.decode === 'function')
    ? LercModule
    : (LercModule?.default ?? LercModule);

self.onmessage = (event) => {
    const { id, buffer } = event.data || {};
    try {
        const decoded = Lerc.decode(buffer);
        /** @type {Float32Array} 高程数组(第一波段) */
        const pixels = decoded.pixels[0];
        // nodata 掩膜:空洞填 0(海洋/无数据),避免 NaN 进入地形网格
        const mask = decoded.mask;
        if (mask) {
            for (let i = 0; i < pixels.length; i++) {
                if (!mask[i]) pixels[i] = 0;
            }
        }
        self.postMessage(
            { id, ok: true, width: decoded.width, height: decoded.height, pixels },
            [pixels.buffer],
        );
    } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
    }
};
