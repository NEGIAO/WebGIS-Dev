/**
 * terrainSampling.js
 * Cesium 地形高度采样统一网关（纯函数，无 Vue 依赖）
 *
 * 架构方案：Docs/Architecture/2026-08-22-clamp-to-ground-strategy.md
 * 收编来源：tilesetLoader.sampleTerrainBatch 的完整兼容链 + useCesiumHeightSampler /
 * gltfLoader 的内联单点采样。全项目任何需要地形高程的代码只允许经由本模块采样。
 *
 * 兼容链策略：
 * - 本项目全部地形提供方（Cesium World Terrain / ArcGIS / 天地图 GeoTerrainProvider）
 *   均已实现 availability getter（见 providers/terrain/*.js），首选
 *   sampleTerrainMostDetailed 直达最高精度；
 * - 显式层级 sampleTerrain 阶梯仅作未知/第三方自定义 provider 的防御性兜底：
 *   无 availability 时 mostDetailed 会抛 DeveloperError，此时按层级阶梯降级重试；
 * - 批次内容忍地形空洞（≥30% 有效即采信），拒绝几乎全空的批次。
 */

/** 单点采样默认显式层级（无 availability 且无私有字段线索时的兜底） */
const DEFAULT_EXPLICIT_LEVEL = 12;

/**
 * 提供方感知的批量地形采样。
 *
 * @param {Cesium.Viewer} viewer
 * @param {Cesium} Cesium - Cesium 命名空间
 * @param {Cesium.Cartographic[]} cartographics - 待采样点（弧度）
 * @returns {Promise<Array|null>} 与入参同序的采样结果（height 可能含 NaN/undefined），全失败返回 null
 */
export async function sampleTerrainBatch(viewer, Cesium, cartographics) {
    if (!viewer?.terrainProvider || !Array.isArray(cartographics) || !cartographics.length) {
        return null;
    }
    const provider = viewer.terrainProvider;
    // 有效高程门槛：≥30%（上限 8 点）——容忍地形空洞，但拒绝几乎全空的批次
    const threshold = Math.max(1, Math.min(8, Math.ceil(cartographics.length * 0.3)));
    const enough = (arr) => Array.isArray(arr)
        && arr.filter((c) => Number.isFinite(Number(c?.height))).length >= threshold;

    // 1) availability 已就绪（本项目全部内置 provider 均支持）→ mostDetailed
    if (provider?.availability) {
        try {
            const results = await Cesium.sampleTerrainMostDetailed(provider, cartographics);
            if (enough(results)) return results;
            console.warn('[地形采样] mostDetailed 有效高程不足，转显式层级兜底');
        } catch (e) {
            console.warn('[地形采样] mostDetailed 采样异常，转显式层级兜底:', e.message || e);
        }
    }

    // 2) 防御性兜底：未知 provider 无 availability 时走显式层级阶梯，
    //    层级线索：_bottomLevel−1（天地图私有字段启发式）> maximumLevel > 12，失败每次降 3 级
    if (!Cesium || typeof Cesium.sampleTerrain !== 'function') return null;
    const bottomLevel = Number(provider?._bottomLevel);
    const preferred = Number.isFinite(bottomLevel)
        ? Math.max(0, bottomLevel - 1)
        : Math.min(Number(provider?.maximumLevel) || DEFAULT_EXPLICIT_LEVEL, DEFAULT_EXPLICIT_LEVEL);
    const ladder = [...new Set([preferred, Math.max(preferred - 3, 0), Math.max(preferred - 6, 0)])];

    for (const level of ladder) {
        try {
            const fresh = cartographics.map(
                (c) => new Cesium.Cartographic(c.longitude, c.latitude, 0));
            const results = await Cesium.sampleTerrain(provider, level, fresh);
            if (enough(results)) {
                console.warn('[地形采样] 显式层级采样成功: level', level);
                return results;
            }
            console.warn('[地形采样] level', level, '有效高程不足，降级重试');
        } catch (e) {
            console.warn('[地形采样] level', level, '采样失败，降级重试:', e.message || e);
        }
    }
    console.warn('[地形采样] 全部层级采样失败');
    return null;
}

/**
 * 单点地形高程采样（批量网关的便捷封装）
 *
 * @param {Cesium.Viewer} viewer
 * @param {Cesium} Cesium - Cesium 命名空间
 * @param {number} lng - 经度（度）
 * @param {number} lat - 纬度（度）
 * @returns {Promise<number|null>} 地面海拔（米）；采样失败返回 null（调用方自行决定兜底，
 *          严禁因单点采样失败改动全局地形设置）
 */
export async function sampleTerrainHeight(viewer, Cesium, lng, lat) {
    const carto = Cesium?.Cartographic ? Cesium.Cartographic.fromDegrees(lng, lat) : null;
    if (!carto) return null;
    const results = await sampleTerrainBatch(viewer, Cesium, [carto]);
    const h = Number(results?.[0]?.height);
    return Number.isFinite(h) ? h : null;
}
