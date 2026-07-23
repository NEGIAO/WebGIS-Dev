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
 * 3. 零包装开销 —— requestTileGeometry 直接返回内部结果，不套 Promise 壳
 * 4. 增量 TileAvailability —— 瓦片加载成功后才标记（供 sampleTerrainMostDetailed）
 */

export default function createArcGISTerrainProvider(Cesium) {
    if (!Cesium) {
        throw new Error('Cesium is required to create ArcGISTerrainProvider.');
    }

    const { TileAvailability } = Cesium;

    /** 硬顶层级：11 级（~19m）对山区可视化足够，比 15 级请求量减少 ~93% */
    const MAX_LEVEL_CAP = 11;

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
         * 请求瓦片几何数据
         *
         * 直接返回内部 provider 的结果，不套 Promise 壳（零包装开销）。
         * 加载成功后 fire-and-forget 标记 TileAvailability。
         */
        requestTileGeometry(x, y, level, request) {
            if (level > this._maxLevel) {
                return undefined; // 超出硬顶：返回 undefined（无数据），不 reject
            }

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
