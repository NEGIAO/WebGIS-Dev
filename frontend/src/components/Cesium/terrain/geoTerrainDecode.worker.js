/**
 * geoTerrainDecode.worker.js
 * 天地图地形瓦片解码 Worker：pako inflate(zlib) + 高程 → RGBA 编码
 *
 * 背景:GeoTerrainProvider 原在主线程执行 inflate(每瓦 0.5~2ms)与 64×64 逐像素
 * 编码变换,瓦片风暴期堆积造成卡顿(与 ArcGIS LERC 同类问题,V3.4.25 同思路下放)。
 *
 * 协议:
 *  in : { id, buffer: ArrayBuffer, dataType: 'int16'|'float', width, height }  (buffer transfer)
 *  out: { id, ok: true, pixels: Uint8Array }                                    (pixels.buffer transfer)
 *       { id, ok: false, error }
 *
 * 变换逻辑与 GeoTerrainProvider._transformBuffer 保持一致(150×150 源采样 →
 * width×height RGBA,heightScale 0.001 / heightOffset -1000 编码)。
 */
import { inflate } from 'pako/lib/inflate.js';

function transformBuffer(data, dataType, width, height) {
    const bytesPerSample = dataType === 'float' ? 4 : 2;
    if (data.length !== 22500 * bytesPerSample) {
        throw new Error(`invalid terrain payload: ${data.length}`);
    }

    const scratch = new ArrayBuffer(bytesPerSample);
    const view = new DataView(scratch);
    const output = new Uint8Array(width * height * 4);

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const srcRow = Math.floor((149 * row) / (height - 1));
            const srcCol = Math.floor((149 * col) / (width - 1));
            const offset = bytesPerSample * (150 * srcRow + srcCol);

            let value;
            if (bytesPerSample === 4) {
                view.setInt8(0, data[offset]);
                view.setInt8(1, data[offset + 1]);
                view.setInt8(2, data[offset + 2]);
                view.setInt8(3, data[offset + 3]);
                value = view.getFloat32(0, true);
            } else {
                value = data[offset] + 256 * data[offset + 1];
            }

            if (value > 10000 || value < -2000) {
                value = 0;
            }

            const scaled = (value + 1000) / 0.001;
            const outIndex = 4 * (row * width + col);
            output[outIndex] = scaled / 65536;
            output[outIndex + 1] = (scaled - 256 * output[outIndex] * 256) / 256;
            output[outIndex + 2] =
                scaled - 256 * output[outIndex] * 256 - 256 * output[outIndex + 1];
            output[outIndex + 3] = 255;
        }
    }

    return output;
}

self.onmessage = (event) => {
    const { id, buffer, dataType, width, height } = event.data || {};
    try {
        if (!buffer || buffer.byteLength < 1000) {
            throw new Error('invalid terrain data');
        }
        const inflated = inflate(new Uint8Array(buffer));
        const pixels = transformBuffer(inflated, dataType, width, height);
        self.postMessage({ id, ok: true, pixels }, [pixels.buffer]);
    } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
    }
};
