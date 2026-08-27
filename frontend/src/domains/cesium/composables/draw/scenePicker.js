/**
 * viewScale 同级的场景取点工具（绘制 / 路线选点共用）
 *
 * pickEarthPoint 两级取点链：
 *   1. scene.pickPosition —— 命中地形 / 3D Tiles / 实体表面（需 depthBuffer 支持）
 *   2. camera.pickEllipsoid —— 兜底椭球面（天空 / 空白区域）
 * 返回 Cartesian3 或 null（两点均未命中）。
 */

/**
 * 屏幕像素坐标 → 地球表面 Cartesian3
 * @param {object} p
 * @param {Function} p.getCesium Cesium 命名空间 getter
 * @param {Function} p.getViewer Viewer getter
 * @param {{x:number,y:number}} p.pixel 屏幕坐标（Cesium.Cartesian2 形态）
 * @returns {import('@cesium/engine').Cartesian3|null}
 */
export function pickEarthPoint({ getCesium, getViewer, pixel }) {
    const viewer = getViewer?.();
    const Cesium = getCesium?.();
    if (!viewer || !Cesium || !viewer.scene || viewer.isDestroyed?.()) return null;

    const scene = viewer.scene;
    if (scene.pickPositionSupported) {
        try {
            const picked = scene.pickPosition(pixel);
            if (picked) return picked;
        } catch {
            /* 深度缓冲不可用时走椭球兜底 */
        }
    }
    try {
        return viewer.camera.pickEllipsoid(pixel, Cesium.Ellipsoid.WGS84) || null;
    } catch {
        return null;
    }
}

/**
 * Cartesian3 → { lng, lat }（度），失败返回 null
 */
export function cartesianToLngLat(Cesium, cartesian) {
    if (!Cesium || !cartesian) return null;
    try {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        if (!carto) return null;
        return {
            lng: Cesium.Math.toDegrees(carto.longitude),
            lat: Cesium.Math.toDegrees(carto.latitude),
        };
    } catch {
        return null;
    }
}
