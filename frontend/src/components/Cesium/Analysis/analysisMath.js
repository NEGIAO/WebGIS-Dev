/**
 * analysisMath.js
 * 三维分析共享纯函数：坐标拾取、大地测量推算、扇形顶点生成。
 * 无状态、不持有 viewer 引用，供通视/限高两个分析器复用。
 */

/** 地球平均半径（米），用于大圆推算 */
const EARTH_RADIUS_M = 6371000;

/**
 * 屏幕坐标拾取世界坐标（优先 3D Tiles 表面，兜底地形/椭球）
 * @param {object} Cesium - Cesium 命名空间（注入，不直接 import）
 * @param {object} viewer - Cesium.Viewer 实例
 * @param {object} windowPosition - 屏幕坐标 {x, y}
 * @returns {object|null} Cartesian3 或 null
 */
export function pickCartesian(Cesium, viewer, windowPosition) {
    if (!Cesium || !viewer || !windowPosition) return null;

    let cartesian = null;
    // 1. pickPosition 能精准拾取 3D Tiles / 模型表面
    if (viewer.scene.pickPositionSupported) {
        cartesian = viewer.scene.pickPosition(windowPosition);
    }
    // 2. 兜底：相机射线与地形/椭球求交
    if (!Cesium.defined(cartesian)) {
        const ray = viewer.camera.getPickRay(windowPosition);
        if (ray) {
            cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        }
    }
    return Cesium.defined(cartesian) ? cartesian : null;
}

/**
 * Cartesian3 → 经纬度/高程（度、米）
 * @returns {{ longitude: number, latitude: number, height: number }|null}
 */
export function cartesianToDegrees(Cesium, cartesian) {
    if (!Cesium || !cartesian) return null;
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    return {
        longitude: Cesium.Math.toDegrees(carto.longitude),
        latitude: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height,
    };
}

/**
 * 大圆推算：从起点沿方位角前进指定距离后的经纬度
 * @param {number} lat - 起点纬度（度）
 * @param {number} lon - 起点经度（度）
 * @param {number} bearingDeg - 方位角（度，正北为 0 顺时针）
 * @param {number} distanceM - 距离（米）
 * @returns {{ latitude: number, longitude: number }}
 */
export function destinationPoint(lat, lon, bearingDeg, distanceM) {
    const radLat = (lat * Math.PI) / 180;
    const radLon = (lon * Math.PI) / 180;
    const radBearing = (bearingDeg * Math.PI) / 180;
    const dr = distanceM / EARTH_RADIUS_M;

    const newLat = Math.asin(
        Math.sin(radLat) * Math.cos(dr) + Math.cos(radLat) * Math.sin(dr) * Math.cos(radBearing),
    );
    const newLon =
        radLon +
        Math.atan2(
            Math.sin(radBearing) * Math.sin(dr) * Math.cos(radLat),
            Math.cos(dr) - Math.sin(radLat) * Math.sin(newLat),
        );

    return {
        latitude: (newLat * 180) / Math.PI,
        longitude: (newLon * 180) / Math.PI,
    };
}

/**
 * 生成扇形（含圆心闭合）的经纬度扁平数组 [lon, lat, lon, lat, ...]
 * 用于通视分析的覆盖范围多边形（替代 turf.sector，零依赖）。
 * @param {number} lon - 圆心经度（度）
 * @param {number} lat - 圆心纬度（度）
 * @param {number} radiusM - 半径（米）
 * @param {number} startDeg - 起始方位角（度）
 * @param {number} endDeg - 结束方位角（度）
 * @param {number} stepDeg - 弧段采样步长（度）
 * @returns {number[]} 扁平经纬度数组（圆心 → 弧 → 圆心闭合）
 */
export function sectorRingDegrees(lon, lat, radiusM, startDeg, endDeg, stepDeg = 4) {
    const ring = [lon, lat];
    const safeStep = Math.max(0.5, Math.abs(stepDeg));
    const from = Math.min(startDeg, endDeg);
    const to = Math.max(startDeg, endDeg);

    for (let angle = from; angle <= to; angle += safeStep) {
        const p = destinationPoint(lat, lon, angle, radiusM);
        ring.push(p.longitude, p.latitude);
    }
    // 保证弧段末端精确落在 endDeg 上
    const last = destinationPoint(lat, lon, to, radiusM);
    ring.push(last.longitude, last.latitude);
    ring.push(lon, lat);
    return ring;
}
