/**
 * 几何与代表点：EPSG:3857 常量、墨卡托反算、几何类型/范围、要素代表经纬度
 *
 * 从 useLayerMetadataNormalization 拆出。**本模块不得 import ol**：
 * 原注释已说明，引入 ol 会把 vendor-ol-all 打进首屏（useAttrStore 在登录页消费）。
 * 这里保留与 ol/extent.getCenter、ol/proj.toLonLat 逐位等价的本地实现。
 */

/** EPSG:3857 常量:地球半径与半周长(与 ol/proj/epsg3857 一致) */
const EPSG3857_RADIUS = 6378137;
const EPSG3857_HALF_SIZE = Math.PI * EPSG3857_RADIUS;

/**
 * 计算 extent 中心点(等价 ol/extent 的 getCenter)
 * @param {number[]} extent - [minX, minY, maxX, maxY]
 * @returns {number[]} [centerX, centerY]
 */
export function getExtentCenter(extent: number[]): number[] {
    return [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
}

/**
 * Web Mercator(EPSG:3857)坐标转经纬度(等价 ol/proj 的 toLonLat,默认源投影 3857)
 * 核心逻辑:x 线性映射经度;y 经 Gudermannian 反变换得纬度;经度归一化到 [-180,180]
 * @param {number[]} coordinate - [x, y](米)
 * @returns {number[]} [lon, lat](度)
 */
export function toLonLat(coordinate: number[]): number[] {
    const lon = (180 * coordinate[0]) / EPSG3857_HALF_SIZE;
    const lat = (360 * Math.atan(Math.exp(coordinate[1] / EPSG3857_RADIUS))) / Math.PI - 90;
    // 与 ol toLonLat 一致:经度绕回 [-180, 180]
    const wrappedLon = lon < -180 || lon > 180 ? ((((lon + 180) % 360) + 360) % 360) - 180 : lon;
    return [wrappedLon, lat];
}

export function getGeometryType(feature: any): string {
    return (
        String(
            feature?.getGeometry?.()?.getType?.() ||
                feature?.geometry?.type ||
                feature?.geometryType ||
                feature?.type ||
                '',
        ).trim() || 'unknown'
    );
}

export function getGeometryExtent(feature: any): number[] | null {
    const geometry = feature?.getGeometry?.() || feature?.geometry || null;
    if (!geometry) return null;

    if (typeof geometry.getExtent === 'function') {
        const extent = geometry.getExtent();
        if (Array.isArray(extent) && extent.length >= 4 && extent.every(Number.isFinite)) {
            return extent.slice(0, 4);
        }
    }

    const coordinates = geometry?.coordinates;
    if (!coordinates) return null;

    const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
    };

    const visit = (node: any) => {
        if (!Array.isArray(node)) return;
        if (
            node.length >= 2 &&
            Number.isFinite(Number(node[0])) &&
            Number.isFinite(Number(node[1]))
        ) {
            const x = Number(node[0]);
            const y = Number(node[1]);
            bounds.minX = Math.min(bounds.minX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.maxY = Math.max(bounds.maxY, y);
            return;
        }
        node.forEach((child) => visit(child));
    };

    visit(coordinates);

    if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
        return null;
    }

    return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
}

export function getFeatureRepresentativeLonLat(feature: any): number[] | null {
    const geometry = feature?.getGeometry?.();
    if (!geometry) return null;

    const extent = geometry.getExtent?.();
    if (!extent || extent.some((value: any) => !Number.isFinite(value))) return null;

    const centerCoord =
        geometry.getType?.() === 'Point' ? geometry.getCoordinates?.() : getExtentCenter(extent);

    if (!Array.isArray(centerCoord) || centerCoord.length < 2) return null;

    const [lon, lat] = toLonLat(centerCoord);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

    return [lon, lat];
}

export function inferLayerRepresentativeLonLat(features: any[] = []): number[] | null {
    for (const feature of features || []) {
        const pair = getFeatureRepresentativeLonLat(feature);
        if (pair) return pair;
    }
    return null;
}