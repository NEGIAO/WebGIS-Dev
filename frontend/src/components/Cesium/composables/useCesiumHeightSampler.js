/**
 * useCesiumHeightSampler.js
 *
 * Cesium 高度采样增强器 —— 参考 tellux 项目 HeightSampler + CartographicPicker
 *
 * 核心功能：
 *  1. 地形高度查询（单点同步采样）
 *  2. 批量异步"最详细"高度采样（sampleHeightMostDetailed）
 *  3. 屏幕坐标 → 地理坐标转换（CartographicPicker）
 *  4. 带重试和 tile 细化等待的采样逻辑
 *  5. 结果缓存与过期策略
 *  6. 高度采样进度回调
 *
 * 设计模式参考 tellux：
 *  - HeightSampler：核心采样引擎，区分同步/异步两种模式
 *  - CartographicPicker：屏幕坐标 → 地理坐标（raycast）
 *  - 重试机制：等待 3D Tiles 加载后再采样
 *
 * @module useCesiumHeightSampler
 */

import { ref } from 'vue'

// ======================== 辅助工具 ========================

/**
 * Cartographic 坐标标准化
 * 将 Cesium.Cartographic 对象转为纯数据对象
 *
 * @param {Object} Cesium
 * @param {Object} carto - Cesium.Cartographic
 * @returns {{ longitude: number, latitude: number, height: number }}
 *           经纬度为度，高度为米
 */
function cartoToPlain(Cesium, carto) {
    return {
        longitude: Cesium.Math.toDegrees(carto.longitude),
        latitude: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height,
    }
}

/**
 * 将各种坐标格式统一为 Cesium.Cartographic（弧度）
 *
 * 支持格式：
 *  - [lng, lat, height?] — 数组
 *  - { longitude, latitude, height } — 度制对象
 *  - { lng, lat, height } — 简写
 *  - Cesium.Cartographic — 直接返回
 *
 * @param {Object} Cesium
 * @param {*} input
 * @returns {Object|null} Cesium.Cartographic 或 null
 */
function toCartographic(Cesium, input) {
    if (!input) return null

    // 已经是 Cartographic
    if (input instanceof Cesium.Cartographic) return input

    // 数组格式 [lng, lat, height?]
    if (Array.isArray(input)) {
        const [lng, lat, height = 0] = input
        return Cesium.Cartographic.fromDegrees(lng, lat, height)
    }

    // 对象格式
    const lng = input.longitude ?? input.lng
    const lat = input.latitude ?? input.lat
    if (typeof lng === 'number' && typeof lat === 'number') {
        return Cesium.Cartographic.fromDegrees(lng, lat, input.height ?? 0)
    }

    return null
}

/**
 * 缓存条目
 */
class CacheEntry {
    /**
     * @param {Object} data - 采样结果 { longitude, latitude, height }
     * @param {number} timestamp - 创建时间戳
     */
    constructor(data, timestamp) {
        this.data = data
        this.timestamp = timestamp
    }

    /**
     * 条目是否过期
     * @param {number} ttl - 过期时间（毫秒）
     * @returns {boolean}
     */
    isExpired(ttl) {
        return Date.now() - this.timestamp > ttl
    }
}

// ======================== 主 Composable ========================

/**
 * Cesium 高度采样增强器
 *
 * @param {Object} deps
 * @param {Function} deps.getViewer - 返回 Cesium.Viewer 实例的闭包
 * @param {Function} deps.getCesium - 返回 Cesium 全局对象的闭包
 * @returns {Object} 高度采样 API
 */
export function useCesiumHeightSampler({ getViewer, getCesium }) {
    // ---- 缓存 ----
    /** @type {Map<string, CacheEntry>} 经纬度 → 缓存条目 */
    const _cache = new Map()
    const CACHE_TTL = 5 * 60 * 1000 // 5 分钟过期
    const CACHE_KEY_PRECISION = 5 // 经纬度小数位

    // ---- 响应式状态 ----
    /** 是否正在采样 */
    const isSampling = ref(false)
    /** 最后一次采样的进度 [0, 1] */
    const samplingProgress = ref(0)

    // ======================== 缓存工具 ========================

    /**
     * 生成缓存键
     * @param {number} lng - 经度（度）
     * @param {number} lat - 纬度（度）
     * @returns {string}
     */
    function cacheKey(lng, lat) {
        return `${lng.toFixed(CACHE_KEY_PRECISION)},${lat.toFixed(CACHE_KEY_PRECISION)}`
    }

    /**
     * 从缓存中查询
     * @param {number} lng
     * @param {number} lat
     * @returns {Object|null} 采样结果或 null
     */
    function getFromCache(lng, lat) {
        const key = cacheKey(lng, lat)
        const entry = _cache.get(key)
        if (entry && !entry.isExpired(CACHE_TTL)) {
            return { ...entry.data }
        }
        if (entry) _cache.delete(key)
        return null
    }

    /**
     * 写入缓存
     * @param {Object} data
     */
    function setCache(data) {
        const key = cacheKey(data.longitude, data.latitude)
        _cache.set(key, new CacheEntry({ ...data }, Date.now()))
    }

    /**
     * 清空缓存
     */
    function clearCache() {
        _cache.clear()
    }

    // ======================== 屏幕坐标拾取 ========================

    /**
     * 屏幕坐标 → 地理坐标
     * 参考 tellux CartographicPicker，通过 raycast 将屏幕点转换为地表坐标。
     *
     * @param {Object} screenPosition - { x: number, y: number } 屏幕像素坐标
     * @returns {{ longitude: number, latitude: number, height: number }|null}
     */
    function pickCartographic(screenPosition) {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        if (!viewer || !Cesium || !screenPosition) return null

        const { x, y } = screenPosition
        const ray = viewer.camera.getPickRay(new Cesium.Cartesian2(x, y))
        if (!ray) return null

        // 优先尝试拾取地形/3DTiles 上的精确位置
        const cartesian = viewer.scene.pickPositionSupported
            ? viewer.scene.pickPosition(new Cesium.Cartesian2(x, y))
            : viewer.scene.globe.pick(ray, viewer.scene)

        if (!cartesian) {
            // 降级：射线与椭球体相交
            const ellipsoid = viewer.scene.globe.ellipsoid
            const ellipsoidCartesian = viewer.scene.camera.pickEllipsoid(
                new Cesium.Cartesian2(x, y),
                ellipsoid
            )
            if (!ellipsoidCartesian) return null
            const carto = Cesium.Cartographic.fromCartesian(ellipsoidCartesian)
            return cartoToPlain(Cesium, carto)
        }

        const carto = Cesium.Cartographic.fromCartesian(cartesian)
        return cartoToPlain(Cesium, carto)
    }

    /**
     * 多次尝试拾取（增加精度，适用于地形瓦片未完全加载时）
     *
     * @param {Object} screenPosition - { x, y }
     * @param {Object} [options={}]
     * @param {number} [options.maxRetries=3]    - 最大重试次数
     * @param {number} [options.retryDelay=200]  - 重试间隔（毫秒）
     * @returns {Promise<Object|null>} { longitude, latitude, height }
     */
    async function pickCartographicWithRetry(screenPosition, options = {}) {
        const { maxRetries = 3, retryDelay = 200 } = options

        for (let i = 0; i < maxRetries; i++) {
            const result = pickCartographic(screenPosition)
            if (result) return result

            if (i < maxRetries - 1) {
                await new Promise(r => setTimeout(r, retryDelay))
            }
        }
        return null
    }

    // ======================== 单点高度采样 ========================

    /**
     * 同步采样单点地形高度
     * 参考 tellux HeightSampler.sampleHeight（同步模式）。
     *
     * 使用 Cesium.sampleTerrain 进行采样，结果精度取决于当前加载的地形 LOD。
     *
     * @param {*} position - 位置（数组 / 对象 / Cartographic）
     * @param {Object} [options={}]
     * @param {number} [options.terrainDetailLevel=0] - 地形细节级别（0=默认, 17=最详细）
     * @param {boolean} [options.useCache=true] - 是否使用缓存
     * @returns {{ longitude: number, latitude: number, height: number }|null}
     */
    function sampleHeight(position, options = {}) {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        if (!viewer || !Cesium) return null

        const carto = toCartographic(Cesium, position)
        if (!carto) return null

        const lng = Cesium.Math.toDegrees(carto.longitude)
        const lat = Cesium.Math.toDegrees(carto.latitude)

        // 缓存查询
        if (options.useCache !== false) {
            const cached = getFromCache(lng, lat)
            if (cached) return cached
        }

        try {
            const level = options.terrainDetailLevel ?? 0
            const positions = [carto]
            const sampled = level === 0
                ? Cesium.sampleTerrain(viewer.terrainProvider, 0, positions)
                : Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positions)

            if (sampled && sampled.length > 0) {
                const result = cartoToPlain(Cesium, sampled[0])
                setCache(result)
                return result
            }
        } catch (e) {
            console.warn('[HeightSampler] 采样失败:', e)
        }
        return null
    }

    // ======================== 批量异步采样 ========================

    /**
     * 批量异步"最详细"高度采样
     * 参考 tellux HeightSampler.sampleHeightMostDetailed。
     *
     * 核心逻辑：
     *  1. 将输入位置列表转换为 Cartographic 数组
     *  2. 调用 Cesium.sampleTerrainMostDetailed（触发 tile 请求）
     *  3. 返回带高度的结果列表
     *
     * @param {Array<*>} positions - 位置列表（每个元素支持 sampleHeight 的格式）
     * @param {Object} [options={}]
     * @param {boolean} [options.useCache=true]    - 是否使用缓存
     * @param {boolean} [options.skipCached=false]  - 跳过已缓存的点（仅采样新点）
     * @param {Function} [options.onProgress]       - 进度回调 (completed, total)
     * @returns {Promise<Array<{ longitude: number, latitude: number, height: number }>>}
     */
    async function sampleHeightMostDetailed(positions, options = {}) {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        if (!viewer || !Cesium || !positions?.length) return []

        isSampling.value = true
        samplingProgress.value = 0

        try {
            const results = []
            const toSample = []
            const toSampleIndices = []

            // 分离已缓存和待采样的点
            for (let i = 0; i < positions.length; i++) {
                const carto = toCartographic(Cesium, positions[i])
                if (!carto) {
                    results.push(null)
                    continue
                }

                const lng = Cesium.Math.toDegrees(carto.longitude)
                const lat = Cesium.Math.toDegrees(carto.latitude)

                if (options.useCache !== false && !options.skipCached) {
                    const cached = getFromCache(lng, lat)
                    if (cached) {
                        results.push(cached)
                        continue
                    }
                }

                results.push(null)
                toSample.push(carto)
                toSampleIndices.push(i)
            }

            // 无待采样点
            if (toSample.length === 0) {
                samplingProgress.value = 1
                return results
            }

            // 执行批量采样
            try {
                const sampled = Cesium.sampleTerrainMostDetailed(
                    viewer.terrainProvider,
                    toSample
                )

                // sampleTerrainMostDetailed 可能返回 Promise 或直接返回数组
                const resolved = sampled instanceof Promise ? await sampled : sampled

                for (let j = 0; j < resolved.length; j++) {
                    const result = cartoToPlain(Cesium, resolved[j])
                    results[toSampleIndices[j]] = result
                    setCache(result)

                    // 进度回调
                    if (options.onProgress) {
                        options.onProgress(j + 1, toSample.length)
                    }
                    samplingProgress.value = (j + 1) / toSample.length
                }
            } catch (e) {
                console.warn('[HeightSampler] 批量采样失败，降级为逐点采样:', e)

                // 降级：逐点采样（使用较低精度的 sampleTerrain）
                for (let j = 0; j < toSample.length; j++) {
                    try {
                        const carto = toSample[j]
                        const sampled = Cesium.sampleTerrain(
                            viewer.terrainProvider,
                            17,
                            [carto]
                        )
                        const resolved = sampled instanceof Promise ? await sampled : sampled
                        if (resolved?.length > 0) {
                            const result = cartoToPlain(Cesium, resolved[0])
                            results[toSampleIndices[j]] = result
                            setCache(result)
                        }
                    } catch {
                        // 单点失败不影响其它点
                    }

                    if (options.onProgress) {
                        options.onProgress(j + 1, toSample.length)
                    }
                    samplingProgress.value = (j + 1) / toSample.length
                }
            }

            return results
        } finally {
            isSampling.value = false
        }
    }

    // ======================== 区域高度查询 ========================

    /**
     * 查询指定矩形区域内的地形高度范围
     * 通过在区域内均匀采样点来估算最小/最大高度。
     *
     * @param {Object} rectangle - { west, south, east, north }（度）
     * @param {Object} [options={}]
     * @param {number} [options.sampleCount=9] - 采样点数量（取平方根作为每边点数）
     * @returns {Promise<{ min: number, max: number, avg: number }|null>}
     *           高度值（米）
     */
    async function queryHeightRange(rectangle, options = {}) {
        const Cesium = getCesium?.()
        if (!Cesium) return null

        const { west, south, east, north } = rectangle
        const gridSide = Math.max(2, Math.ceil(Math.sqrt(options.sampleCount ?? 9)))
        const positions = []

        // 生成网格采样点
        for (let yi = 0; yi < gridSide; yi++) {
            for (let xi = 0; xi < gridSide; xi++) {
                const lng = west + (east - west) * (xi / (gridSide - 1))
                const lat = south + (north - south) * (yi / (gridSide - 1))
                positions.push([lng, lat])
            }
        }

        const results = await sampleHeightMostDetailed(positions, { useCache: true })
        const validHeights = results
            .filter(r => r !== null)
            .map(r => r.height)

        if (validHeights.length === 0) return null

        const min = Math.min(...validHeights)
        const max = Math.max(...validHeights)
        const avg = validHeights.reduce((s, h) => s + h, 0) / validHeights.length

        return { min, max, avg }
    }

    // ======================== 清理 ========================

    /** 清理缓存和状态 */
    function cleanup() {
        clearCache()
        isSampling.value = false
        samplingProgress.value = 0
    }

    // ======================== 返回 ========================
    return {
        // 状态
        isSampling,
        samplingProgress,

        // 屏幕坐标拾取
        pickCartographic,
        pickCartographicWithRetry,

        // 单点采样
        sampleHeight,

        // 批量采样
        sampleHeightMostDetailed,

        // 区域查询
        queryHeightRange,

        // 缓存管理
        clearCache,
        cleanup,
    }
}