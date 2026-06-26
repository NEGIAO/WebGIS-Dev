/**
 * ArcGISTerrainProvider.js
 * ArcGIS 世界地形增强包装器
 *
 * ArcGISTiledElevationTerrainProvider 原生不暴露 availability / getTileDataAvailable，
 * 导致 sampleTerrainMostDetailed 无法正确查询最高精度层级。
 * 本包装器参照 GeoTerrainProvider（天地图）的模式，补充这两个接口，
 * 使 ArcGIS 地形与 Cesium/天地图地形行为一致。
 */

export default function createArcGISTerrainProvider(Cesium) {
    if (!Cesium) {
        throw new Error('Cesium is required to create ArcGISTerrainProvider.');
    }

    const { TileAvailability } = Cesium;

    /**
     * ArcGIS 地形增强包装类
     * 将 ArcGISTiledElevationTerrainProvider 包装为支持 availability 查询的 provider
     */
    class ArcGISTerrainProvider {
        /**
         * @param {Object} innerProvider - ArcGISTiledElevationTerrainProvider 实例
         */
        constructor(innerProvider) {
            this._inner = innerProvider;
            this._availability = null;
            // 延迟初始化 availability（需要 tilingScheme 就绪）
            this._initAvailability();
        }

        /**
         * 初始化 TileAvailability
         * 参照 GeoTerrainProvider 的 createAvailability 模式
         * 必须标记所有层级，否则 sampleTerrainMostDetailed 的
         * availability.getMaximumLevelAtPosition() 只会返回 0（最低精度）
         */
        _initAvailability() {
            const ts = this._inner.tilingScheme;
            if (!ts) return;

            const maxLevel = this._inner.maximumLevel ?? 15;
            this._availability = new TileAvailability(ts, maxLevel);

            // ArcGIS 是全球覆盖，逐级标记全部瓦片范围为可用
            // sampleTerrainMostDetailed 依赖此查询每个位置的最高精度层级
            for (let level = 0; level <= maxLevel; level++) {
                const count = 1 << level; // 2^level
                this._availability.addAvailableTileRange(
                    level,
                    0, 0,            // startX, startY
                    count - 1,       // endX
                    count - 1,       // endY
                );
            }
        }

        /** availability 属性 — sampleTerrainMostDetailed 依赖此属性查询最高精度 */
        get availability() {
            // 懒初始化：构造时 tilingScheme 可能未就绪
            if (!this._availability) this._initAvailability();
            return this._availability;
        }

        /** tilingScheme 委托 */
        get tilingScheme() {
            return this._inner.tilingScheme;
        }

        /** maximumLevel 委托 */
        get maximumLevel() {
            return this._inner.maximumLevel;
        }

        /** requestWaterMask 委托 — hasRealTerrain() 检测依赖此属性 */
        get requestWaterMask() {
            return this._inner.requestWaterMask;
        }

        /** requestVertexNormals 委托 — hasRealTerrain() 检测依赖此属性 */
        get requestVertexNormals() {
            return this._inner.requestVertexNormals;
        }

        /** ready 委托 */
        get ready() {
            return this._inner.ready;
        }

        /** readyPromise 委托 */
        get readyPromise() {
            return this._inner.readyPromise;
        }

        /** errorEvent 委托 */
        get errorEvent() {
            return this._inner.errorEvent;
        }

        /** credit 委托 */
        get credit() {
            return this._inner.credit;
        }

        /**
         * 判断某个瓦片是否有高程数据
         * 参照 GeoTerrainProvider 的 getTileDataAvailable 实现
         */
        getTileDataAvailable(_x, _y, level) {
            // ArcGIS 是全球覆盖，只要不超过 maximumLevel 就有数据
            const maxLevel = this._inner.maximumLevel ?? 15;
            return level <= maxLevel;
        }

        /** requestTileGeometry 委托 */
        requestTileGeometry(x, y, level, request) {
            return this._inner.requestTileGeometry(x, y, level, request);
        }

        /** getLevelMaximumGeometricError 委托 */
        getLevelMaximumGeometricError(level) {
            return this._inner.getLevelMaximumGeometricError(level);
        }

        /** loadTileDataAvailability 委托（如果存在） */
        loadTileDataAvailability(x, y, level) {
            if (typeof this._inner.loadTileDataAvailability === 'function') {
                return this._inner.loadTileDataAvailability(x, y, level);
            }
        }
    }

    /**
     * 工厂方法：从 URL 创建增强版 ArcGIS 地形 provider
     * @param {string} url - ArcGIS ImageServer URL
     * @returns {Promise<ArcGISTerrainProvider>}
     */
    async function fromUrl(url) {
        const inner = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(url);
        return new ArcGISTerrainProvider(inner);
    }

    ArcGISTerrainProvider.fromUrl = fromUrl;
    return ArcGISTerrainProvider;
}
