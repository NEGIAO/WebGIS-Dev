/**
 * ArcGISTerrainProvider.js
 * ArcGIS 世界地形增强包装器（性能优化版）
 *
 * 原生 ArcGISTiledElevationTerrainProvider 不暴露 availability / getTileDataAvailable，
 * 导致 sampleTerrainMostDetailed 无法正确查询最高精度层级。
 *
 * 性能优化（对照天地图 GeoTerrainProvider）：
 * 1. 禁用内部 Tilemap 二次请求 —— 原生 provider 每个瓦片额外发一次 Tilemap 可用性请求，
 *    包装器已自行提供 getTileDataAvailable，无需内部再查
 * 2. 层级硬顶 11 —— 阻止 12~15 级海量请求
 * 3. LERC 解码下放 Worker 池（卡顿根因修复）—— 原生 provider 在主线程同步
 *    LercDecode.decode（每瓦 2~6ms），瓦片风暴期主线程被解码占满导致卡顿。
 *    本包装器改为：主线程 fetchArrayBuffer（保留 RequestScheduler 节流/取消）
 *    → Transferable 送 Worker 解码 → 主线程仅构造 HeightmapTerrainData。
 *    Worker 不可用时整体回退原生路径。
 * 4. 增量 TileAvailability —— 瓦片加载成功后才标记（供 sampleTerrainMostDetailed）
 */

import { DecodeWorkerPool } from './decodeWorkerPool.js';

/** 硬顶层级：12 级（~9.5m）。V3.4.x：LERC 解码已下放 Worker，从 11 放宽一级换取山区细节 */
const MAX_LEVEL_CAP = 12;

/** LERC 解码 Worker 数量：解码为短任务，2 个足以吞下瓦片风暴 */
const LERC_WORKER_COUNT = 2;

/** ArcGIS Terrain3D LERC 高程的 HeightmapTerrainData structure 默认值（与 Cesium 内部一致） */
const DEFAULT_TERRAIN_STRUCTURE = {
    heightScale: 1.0,
    heightOffset: 0.0,
    elementsPerHeight: 1,
    stride: 1,
    elementMultiplier: 256.0,
    isBigEndian: false,
};

/**
 * 模块级共享 LERC 解码 Worker 池（池实现抽至 decodeWorkerPool.js，
 * 与天地图地形解码共用同一实现；行为不变——round-robin/Transferable/失效永久回退）。
 * @type {DecodeWorkerPool | null}
 */
let sharedLercPool = null;
function getSharedLercPool() {
    if (!sharedLercPool) {
        sharedLercPool = new DecodeWorkerPool(
            () => new Worker(new URL('./lercDecode.worker.js', import.meta.url), { type: 'module' }),
            LERC_WORKER_COUNT,
            'ArcGISTerrain-LERC',
        );
    }
    return sharedLercPool;
}

export default function createArcGISTerrainProvider(Cesium) {
    if (!Cesium) {
        throw new Error('Cesium is required to create ArcGISTerrainProvider.');
    }

    const { TileAvailability } = Cesium;

    /**
     * ArcGIS 地形增强包装类
     */
    class ArcGISTerrainProvider {
        /**
         * @param {Object} innerProvider - ArcGISTiledElevationTerrainProvider 实例
         */
        constructor(innerProvider) {
            this._inner = innerProvider;
            this._availability = null;
            this._maxLevel = Math.min(innerProvider.maximumLevel ?? 15, MAX_LEVEL_CAP);
            this._lercPool = getSharedLercPool();
            // HeightmapTerrainData structure：运行时读内部值（跨 Cesium 版本稳妥），无则用默认
            this._structure = innerProvider._terrainDataStructure ?? DEFAULT_TERRAIN_STRUCTURE;

            // ★ 关键优化：禁用内部 Tilemap 可用性查询
            // 原生 provider 的 requestTileGeometry 会对每个瓦片额外发一次
            // Tilemap 请求来查子瓦片可用性（Promise.all([data, availability])），
            // 导致网络请求量翻倍。包装器已自行提供 getTileDataAvailable，
            // 内部无需再查。设为 false 后 childTileMask 默认 15（全部子瓦片可用），
            // 由包装器的 getTileDataAvailable 控制实际细分。
            innerProvider._hasAvailability = false;

            this._initAvailability();
        }

        /**
         * 初始化 TileAvailability
         * 只标记 level 0，更高层级在瓦片加载成功后增量标记。
         * 仅供 sampleTerrainMostDetailed 查询最高精度层级。
         */
        _initAvailability() {
            const ts = this._inner.tilingScheme;
            if (!ts) return;
            this._availability = new TileAvailability(ts, this._maxLevel);
            this._availability.addAvailableTileRange(0, 0, 0, 0, 0);
        }

        /** availability — sampleTerrainMostDetailed 依赖此属性 */
        get availability() {
            if (!this._availability) this._initAvailability();
            return this._availability;
        }

        get tilingScheme() { return this._inner.tilingScheme; }
        get maximumLevel() { return this._maxLevel; }
        get requestWaterMask() { return this._inner.requestWaterMask; }
        get requestVertexNormals() { return this._inner.requestVertexNormals; }
        get ready() { return this._inner.ready; }
        get readyPromise() { return this._inner.readyPromise; }
        get errorEvent() { return this._inner.errorEvent; }
        get credit() { return this._inner.credit; }

        /**
         * 判断瓦片是否有高程数据
         *
         * 对有效层级（<= maxLevel）一律返回 true —— 与天地图一致。
         * 不能返回 undefined（会阻塞四叉树细分）或查 availability（鸡生蛋死锁）。
         */
        getTileDataAvailable(_x, _y, level) {
            return level <= this._maxLevel;
        }

        /**
         * 请求瓦片几何数据（卡顿根因修复：LERC 解码走 Worker 池）
         *
         * 主线程只负责：经内部 Resource 派生瓦片请求（保留 RequestScheduler
         * 节流与取消语义）→ 拿到 ArrayBuffer 后 Transferable 送 Worker 解码
         * → 用解码结果构造 HeightmapTerrainData。
         * Worker 不可用时回退原生 inner.requestTileGeometry（主线程解码，行为同旧版）。
         */
        requestTileGeometry(x, y, level, request) {
            if (level > this._maxLevel) {
                return undefined; // 超出硬顶：返回 undefined（无数据），不 reject
            }

            const baseResource = this._inner._resource;
            if (!this._lercPool.available() || !baseResource?.getDerivedResource) {
                return this._requestTileGeometryLegacy(x, y, level, request);
            }

            // 与 Cesium 内部一致的瓦片 URL：{ImageServer}/tile/{level}/{row}/{col}
            const tileResource = baseResource.getDerivedResource({
                url: `tile/${level}/${y}/${x}`,
                request,
            });
            const fetchPromise = tileResource.fetchArrayBuffer();
            if (!fetchPromise) return undefined; // 被 RequestScheduler 节流

            const childTileMask = level >= this._maxLevel ? 0 : 15;
            return fetchPromise
                .then((buffer) => this._lercPool.submit({ buffer }, [buffer]))
                .then(({ pixels, width, height }) => {
                    this._availability.addAvailableTileRange(level, x, y, x, y);
                    return new Cesium.HeightmapTerrainData({
                        buffer: pixels,
                        width,
                        height,
                        structure: this._structure,
                        childTileMask,
                    });
                });
        }

        /**
         * 回退路径：原生 provider 主线程解码（Worker 不可用时）。
         * @param {number} x
         * @param {number} y
         * @param {number} level
         * @param {Object} request
         * @returns {Promise<Object>|undefined}
         */
        _requestTileGeometryLegacy(x, y, level, request) {
            const result = this._inner.requestTileGeometry(x, y, level, request);
            if (!result) return undefined; // 被 RequestScheduler 节流

            // 增量标记 availability（fire-and-forget，不阻塞返回）
            if (typeof result.then === 'function') {
                result.then(() => {
                    this._availability.addAvailableTileRange(level, x, y, x, y);
                }).catch(() => { /* 加载失败不标记 */ });
            }

            return result;
        }

        // 注：LERC Worker 池为模块级共享（随应用生命周期），包装器无需 destroy。

        getLevelMaximumGeometricError(level) {
            return this._inner.getLevelMaximumGeometricError(level);
        }

        loadTileDataAvailability(x, y, level) {
            if (typeof this._inner.loadTileDataAvailability === 'function') {
                return this._inner.loadTileDataAvailability(x, y, level);
            }
        }
    }

    /**
     * 工厂方法：从 URL 创建增强版 ArcGIS 地形 provider
     */
    async function fromUrl(url) {
        const inner = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(url);
        return new ArcGISTerrainProvider(inner);
    }

    ArcGISTerrainProvider.fromUrl = fromUrl;
    return ArcGISTerrainProvider;
}
