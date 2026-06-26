/**
 * terrainHelper.ts
 * 统一地形 Provider 检测工具
 *
 * 解决 ArcGISTiledElevationTerrainProvider 没有 availability 属性
 * 导致被误判为"无地形"的问题。
 */

/**
 * 判断 terrainProvider 是否提供了真实的高程数据
 *
 * 三种地形 provider 对比：
 * - CesiumTerrainProvider (Ion)：有 availability 属性 ✓
 * - GeoTerrainProvider (天地图自定义)：有 availability 属性 ✓
 * - ArcGISTiledElevationTerrainProvider：无 availability 属性，但不是 EllipsoidTerrainProvider
 *
 * @param provider - viewer.terrainProvider
 * @returns true 表示有可用高程数据，false 表示椭球平面（无高程）
 */
export function hasRealTerrain(provider: any): boolean {
    if (!provider) return false;

    // EllipsoidTerrainProvider 是 Cesium 默认的"无地形"provider
    // 它的构造函数名固定为 'EllipsoidTerrainProvider'
    const name = provider.constructor?.name;
    if (name === 'EllipsoidTerrainProvider') return false;

    // 只要不是 EllipsoidTerrainProvider 且存在，就认为有地形
    // 兼容 availability 属性存在/不存在的所有 provider
    return true;
}
