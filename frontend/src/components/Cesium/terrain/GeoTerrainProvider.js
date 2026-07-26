import { inflate } from 'pako/lib/inflate.js';
import { DecodeWorkerPool } from './decodeWorkerPool.js';

/**
 * 模块级共享解码 Worker 池（V3.4.x：inflate + 逐像素编码原在主线程，
 * 瓦片风暴期堆积卡顿，与 ArcGIS LERC 同类问题，同思路下放 Worker）。
 * @type {DecodeWorkerPool | null}
 */
let sharedGeoDecodePool = null;
function getSharedGeoDecodePool() {
    if (!sharedGeoDecodePool) {
        sharedGeoDecodePool = new DecodeWorkerPool(
            () => new Worker(new URL('./geoTerrainDecode.worker.js', import.meta.url), { type: 'module' }),
            2,
            'GeoTerrain',
        );
    }
    return sharedGeoDecodePool;
}

export default function createGeoTerrainProvider(Cesium) {
    if (!Cesium) {
        throw new Error('Cesium is required to create GeoTerrainProvider.');
    }

    const {
        defined,
        DeveloperError,
        Ellipsoid,
        Resource,
        HeightmapTerrainData,
        Rectangle,
        TileAvailability,
        CustomHeightmapTerrainProvider,
    } = Cesium;

    function tileIntersects(tilingScheme, rectangle, x, y, level, scratchRect) {
        const tileRectangle = tilingScheme.tileXYToRectangle(x, y, level);
        return defined(Rectangle.intersection(tileRectangle, rectangle, scratchRect));
    }

    function createAvailability(provider) {
        const overallAvailability = [[[0, 0, 1, 0]]];
        const availability = new TileAvailability(provider.tilingScheme, 19);
        for (let level = 0; level < overallAvailability.length; level++) {
            const levelRanges = overallAvailability[level];
            for (let i = 0; i < levelRanges.length; i++) {
                const range = levelRanges[i];
                availability.addAvailableTileRange(
                    level,
                    range[0],
                    range[1],
                    range[2],
                    range[3],
                );
            }
        }
        return availability;
    }

    /**
     * 由已完成"高程→RGBA 编码"的像素构造地形数据。
     * @param {object} provider
     * @param {Uint8Array|null} pixels - 编码后的 RGBA 像素（null 表示源数据非法）
     * @param {number} level
     * @param {number} x
     * @param {number} y
     * @returns {object} HeightmapTerrainData
     */
    function createHeightmapTerrainData(provider, pixels, level, x, y) {
        // 原实现把 null 直接传给 HeightmapTerrainData 会在内部崩溃；显式抛出交给瓦片失败处理
        if (!pixels) {
            throw new Error('Invalid terrain payload.');
        }
        const terrainData = new HeightmapTerrainData({
            buffer: pixels,
            width: provider._width,
            height: provider._height,
            childTileMask: provider._getChildTileMask(x, y, level),
            structure: provider._terrainDataStructure,
        });
        terrainData._skirtHeight = 6000;
        provider.availability.addAvailableTileRange(level, x, y, x, y);
        return terrainData;
    }

    class GeoTerrainProvider extends CustomHeightmapTerrainProvider {
        constructor(options = {}) {
            super({
                ...options,
                ellipsoid: Ellipsoid.WGS84,
                width: 64,
                height: 64,
                callback() {
                    return new Float32Array(32 * 32);
                },
            });

            if (!defined(options.url)) {
                throw new DeveloperError('options.url is required.');
            }

            this._dataType = options.dataType ?? 'int16';
            this._url = options.url;
            this._subdomains = options.subdomains;
            this._token = options.token;

            this._rectangles = [];
            this._topLevel = 5;
            this._bottomLevel = 11;
            this._terrainDataStructure = {
                heightScale: 0.001,
                heightOffset: -1000,
                elementsPerHeight: 3,
                stride: 4,
                elementMultiplier: 256,
                isBigEndian: true,
            };
            this._availability = createAvailability(this);
        }

        get availability() {
            return this._availability;
        }

        requestTileGeometry(x, y, level, request) {
            if (level >= this._bottomLevel) {
                return Promise.reject(new Error(`Level ${level} is outside supported range.`));
            }
            if (level < this._topLevel) {
                return Promise.resolve(
                    new HeightmapTerrainData({
                        buffer: this._getVHeightBuffer(),
                        width: this._width,
                        height: this._height,
                        childTileMask: this._getChildTileMask(x, y, level),
                        structure: this._terrainDataStructure,
                    }),
                );
            }

            let url = this._url;
            if (Array.isArray(this._subdomains) && this._subdomains.length) {
                const subdomain = this._subdomains[(x + y) % this._subdomains.length];
                url = url.replace('{s}', subdomain);
            }
            url = url
                .replace('{token}', this._token)
                .replace('{x}', x)
                .replace('{y}', y)
                .replace('{z}', level + 1);

            const tileResource = Resource.fetchArrayBuffer({ url, request });
            if (!tileResource) {
                return undefined;
            }

            // V3.4.x：inflate + 逐像素编码下放 Worker（Transferable 零拷贝），
            // 主线程仅构造 HeightmapTerrainData；Worker 不可用回退原主线程路径。
            const pool = getSharedGeoDecodePool();
            if (pool.available()) {
                return tileResource
                    .then((buffer) =>
                        pool.submit(
                            {
                                buffer,
                                dataType: this._dataType,
                                width: this._width,
                                height: this._height,
                            },
                            [buffer],
                        ),
                    )
                    .then(({ pixels }) => createHeightmapTerrainData(this, pixels, level, x, y));
            }

            return tileResource
                .then((buffer) => {
                    if (buffer.byteLength < 1000) {
                        return Promise.reject(new Error('Invalid terrain data.'));
                    }
                    return inflate(buffer);
                })
                .then((uint8Array) =>
                    createHeightmapTerrainData(this, this._transformBuffer(uint8Array), level, x, y),
                );
        }

        getTileDataAvailable(x, y, level) {
            if (level < this._bottomLevel) {
                return true;
            }
            return false;
        }

        _transformBuffer(buffer) {
            let bytesPerSample = 2;
            if (this._dataType === 'float') {
                bytesPerSample = 4;
            }

            const data = buffer;
            if (data.length !== 22500 * bytesPerSample) {
                return null;
            }

            const scratch = new ArrayBuffer(bytesPerSample);
            const view = new DataView(scratch);
            const width = this._width;
            const height = this._height;
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
                    output[outIndex + 1] =
                        (scaled - 256 * output[outIndex] * 256) / 256;
                    output[outIndex + 2] =
                        scaled - 256 * output[outIndex] * 256 - 256 * output[outIndex + 1];
                    output[outIndex + 3] = 255;
                }
            }

            return output;
        }

        _getVHeightBuffer() {
            let buffer = this._vHeightBuffer;
            if (!defined(buffer)) {
                buffer = new Uint8ClampedArray(this._width * this._height * 4);
                for (let i = 0; i < this._width * this._height * 4; ) {
                    buffer[i++] = 15;
                    buffer[i++] = 66;
                    buffer[i++] = 64;
                    buffer[i++] = 255;
                }
                this._vHeightBuffer = buffer;
            }
            return buffer;
        }

        _getChildTileMask(x, y, level) {
            const scratchRect = new Rectangle();
            const tilingScheme = this._tilingScheme;
            const rectangles = this._rectangles;
            const tileRect = tilingScheme.tileXYToRectangle(x, y, level);
            let mask = 0;

            for (let i = 0; i < rectangles.length && mask !== 15; i++) {
                const rectInfo = rectangles[i];
                if (rectInfo.maxLevel <= level) {
                    continue;
                }
                const rect = rectInfo.rectangle;
                const intersection = Rectangle.intersection(rect, tileRect, scratchRect);
                if (defined(intersection)) {
                    if (tileIntersects(tilingScheme, rect, 2 * x, 2 * y, level + 1, scratchRect)) {
                        mask |= 4;
                    }
                    if (
                        tileIntersects(
                            tilingScheme,
                            rect,
                            2 * x + 1,
                            2 * y,
                            level + 1,
                            scratchRect,
                        )
                    ) {
                        mask |= 8;
                    }
                    if (
                        tileIntersects(
                            tilingScheme,
                            rect,
                            2 * x,
                            2 * y + 1,
                            level + 1,
                            scratchRect,
                        )
                    ) {
                        mask |= 1;
                    }
                    if (
                        tileIntersects(
                            tilingScheme,
                            rect,
                            2 * x + 1,
                            2 * y + 1,
                            level + 1,
                            scratchRect,
                        )
                    ) {
                        mask |= 2;
                    }
                }
            }

            return mask;
        }
    }

    return GeoTerrainProvider;
}
