/**
 * GeoJSON 坐标校验与投影调试快照
 * 日    期：2026/11/13
 */

export type ReprojectionDebugSnapshot = {
    before: [number, number] | null;
    after: [number, number] | null;
};
function validateCoordinatePair(
    lon: number,
    lat: number,
    targetCrs: 'EPSG:4326' | 'EPSG:3857',
): string | null {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return '坐标转换结果包含 NaN/Infinity';

    if (targetCrs === 'EPSG:4326') {
        if (Math.abs(lon) < 1e-12 && Math.abs(lat) < 1e-12) {
            return '坐标疑似转换失败 (0,0)，请检查 PRJ 编码（可能 GBK 乱码）';
        }
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
            return `坐标超出经纬度范围: (${lon}, ${lat})`;
        }
        return null;
    }

    if (targetCrs === 'EPSG:3857') {
        if (lon < -20037508.35 || lon > 20037508.35 || lat < -20037508.35 || lat > 20037508.35) {
            return `坐标超出 WebMercator 范围: (${lon}, ${lat})`;
        }
    }

    return null;
}
export function validateGeoJsonCoordinates(
    geojson: any,
    targetCrs: 'EPSG:4326' | 'EPSG:3857',
): string | null {
    const limit = 5000;
    let checked = 0;

    const visit = (node: any): string | null => {
        if (checked >= limit) return null;
        if (!Array.isArray(node) || !node.length) return null;

        if (typeof node[0] === 'number' && typeof node[1] === 'number') {
            checked += 1;
            return validateCoordinatePair(Number(node[0]), Number(node[1]), targetCrs);
        }

        for (const child of node) {
            const error = visit(child);
            if (error) return error;
            if (checked >= limit) break;
        }

        return null;
    };

    if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
        for (const feature of geojson.features) {
            const error = visit(feature?.geometry?.coordinates);
            if (error) return error;
            if (checked >= limit) break;
        }
        return null;
    }

    if (geojson?.type === 'Feature') return visit(geojson?.geometry?.coordinates);
    return visit(geojson?.coordinates);
}
export function buildProjectionFailureMessage(projectionName = ''): string {
    return `坐标系识别失败：[${projectionName || '未知投影'}]，请使用地理坐标`;
}
export function normalizeFeatureCollection(geojson: any): any {
    if (Array.isArray(geojson)) {
        return {
            type: 'FeatureCollection',
            features: geojson.flatMap((item) => item?.features || []),
        };
    }
    return geojson;
}
function pickFirstCoordinateRecursive(node: any): [number, number] | null {
    if (!Array.isArray(node) || !node.length) return null;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
        return [Number(node[0]), Number(node[1])];
    }
    for (const child of node) {
        const found = pickFirstCoordinateRecursive(child);
        if (found) return found;
    }
    return null;
}
export function getGeoJsonFirstCoordinatePair(geojson: any): [number, number] | null {
    if (!geojson) return null;

    if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
        for (const feature of geojson.features) {
            const found = pickFirstCoordinateRecursive(feature?.geometry?.coordinates);
            if (found) return found;
        }
        return null;
    }

    if (geojson?.type === 'Feature') {
        return pickFirstCoordinateRecursive(geojson?.geometry?.coordinates);
    }

    return pickFirstCoordinateRecursive(geojson?.coordinates);
}
export function buildReprojectionDebugSnapshot(
    beforeGeojson: any,
    afterGeojson: any,
): ReprojectionDebugSnapshot {
    return {
        before: getGeoJsonFirstCoordinatePair(beforeGeojson),
        after: getGeoJsonFirstCoordinatePair(afterGeojson),
    };
}
