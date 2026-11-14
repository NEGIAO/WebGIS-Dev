/**
 * 功能名称：手绘路线序列化（KML 构建 / JSON・KML 解析）
 * 日    期：2026/11/13
 *
 * 从 FirstPersonFlyController 拆出：与控制器状态解耦的纯转换函数，
 * Cesium 命名空间由调用方注入（token 就绪后传入）。
 */
import type Cesium from 'cesium';

type CesiumNamespace = typeof Cesium;
type Cartographic = import('cesium').Cartographic;

/** 生成 KML 文本（LineString + tessellate，坐标含高程） */
export function buildRouteKml(Cesium: CesiumNamespace, name: string, cartos: Cartographic[]): string {
            const coords = cartos
        .map(
            (c) =>
                `${Cesium.Math.toDegrees(c.longitude).toFixed(8)},${Cesium.Math.toDegrees(
                    c.latitude,
                ).toFixed(8)},${c.height.toFixed(2)}`,
        )
        .join(' ');
    return (
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<kml xmlns="http://www.opengis.net/kml/2.0"><Document><name>${name}</name>` +
        `<Placemark><name>${name}</name>` +
        '<LineString><tessellate>true</tessellate>' +
        `<coordinates>${coords}</coordinates></LineString></Placemark>` +
        '</Document></kml>'
    );
}

/**
 * 解析 JSON 文本：优先 GeoJSON（FeatureCollection/Feature/LineString），
 * 兼容旧版 { points: [{lng,lat,height?}] } 与 [[lng,lat],...] 数组形态
 */
export function parseRouteJson(Cesium: CesiumNamespace, text: string): Cartographic[] {
            try {
        const data = JSON.parse(text);
        let rawPoints: any = null;

        if (Array.isArray(data)) {
            rawPoints = data;
        } else if (data?.type === 'FeatureCollection') {
            rawPoints = data.features?.[0]?.geometry?.coordinates;
        } else if (data?.type === 'Feature') {
            rawPoints = data.geometry?.coordinates;
        } else if (data?.geometry?.type === 'LineString') {
            rawPoints = data.geometry.coordinates;
        } else if (Array.isArray(data?.points)) {
            rawPoints = data.points;
        }
        if (!Array.isArray(rawPoints)) return [];

        return rawPoints
            .map((p) => {
                const lng = Number(Array.isArray(p) ? p[0] : p?.lng);
                const lat = Number(Array.isArray(p) ? p[1] : p?.lat);
                const height = Number(Array.isArray(p) ? p[2] : p?.height ?? 0);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                return new Cesium.Cartographic(
                    Cesium.Math.toRadians(lng),
                    Cesium.Math.toRadians(lat),
                    Number.isFinite(height) ? height : 0,
                );
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}

/** 解析 KML 文本：取首个 LineString 的 coordinates */
export function parseRouteKml(Cesium: CesiumNamespace, text: string): Cartographic[] {
            try {
        const doc = new DOMParser().parseFromString(text, 'text/xml');
        const node = doc.getElementsByTagName('coordinates')[0];
        const raw = String(node?.textContent || '').trim();
        if (!raw) return [];
        return raw
            .split(/\s+/)
            .map((triplet) => {
                const [lngText, latText, hText] = triplet.split(',');
                const lng = Number(lngText);
                const lat = Number(latText);
                const height = Number(hText ?? 0);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                return new Cesium.Cartographic(
                    Cesium.Math.toRadians(lng),
                    Cesium.Math.toRadians(lat),
                    Number.isFinite(height) ? height : 0,
                );
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}
