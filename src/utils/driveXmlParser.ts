/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DriveSegment {
    index: number;
    guide: string;
    streetDistanceMeter: number;
    streetDistanceText: string;
    streetLatLon: string;
}

export interface DriveResult {
    origText: string;
    destText: string;
    distanceKm: number;
    durationSec: number;
    durationText: string;
    routeLatLon: string;
    segments: DriveSegment[];
}

export interface DriveDrawResult {
    result: DriveResult;
    startMarker: any | null;
    endMarker: any | null;
    routePolyline: any | null;
}

function textFromTag(parent: Element | null | undefined, tagName: string): string {
    if (!parent) return '';
    return parent.getElementsByTagName(tagName)?.[0]?.textContent?.trim() || '';
}

function toMinuteText(durationSec: number): string {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return '0分钟';
    return `${Math.max(1, Math.round(durationSec / 60))}分钟`;
}

function parseLinePoint(linePoint: string): Array<{ lng: number; lat: number }> {
    return String(linePoint || '')
        .split(';')
        .filter(Boolean)
        .map((pair) => {
            const [lngText, latText] = pair.split(',');
            const lng = Number(lngText);
            const lat = Number(latText);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            return { lng, lat };
        })
        .filter((p): p is { lng: number; lat: number } => !!p);
}

/**
 * 解析天地图驾车 XML，提取起终点、总览信息、分段详情与整线坐标串。
 */
export function parseDriveRouteXml(xmlString: string): DriveResult {
    const xmlStr = String(xmlString || '').trim();
    if (!xmlStr) {
        throw new Error('XML 字符串为空');
    }

    const xmlDoc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    const parserError = xmlDoc.getElementsByTagName('parsererror')?.[0];
    if (parserError) {
        throw new Error('XML 解析失败');
    }

    const root = xmlDoc.documentElement;
    const parametersNode = root.getElementsByTagName('parameters')?.[0] || null;

    const origText = textFromTag(parametersNode, 'orig') || root.getAttribute('orig') || '';
    const destText = textFromTag(parametersNode, 'dest') || root.getAttribute('dest') || '';

    const distanceKm = Number(textFromTag(root, 'distance')) || 0;
    const durationSec = Number(textFromTag(root, 'duration')) || 0;
    const routeLatLon = textFromTag(root, 'routelatlon');

    const simpleNode = root.getElementsByTagName('simple')?.[0] || null;
    const items = simpleNode ? Array.from(simpleNode.getElementsByTagName('item')) : [];

    const segments: DriveSegment[] = items.map((item, index) => {
        const guide = textFromTag(item, 'strguide');
        const streetDistanceText = textFromTag(item, 'streetDistance');
        const streetLatLon = textFromTag(item, 'streetLatLon');
        const streetDistanceMeter = Number(streetDistanceText) || 0;

        return {
            index,
            guide,
            streetDistanceMeter,
            streetDistanceText,
            streetLatLon
        };
    });

    return {
        origText,
        destText,
        distanceKm,
        durationSec,
        durationText: toMinuteText(durationSec),
        routeLatLon,
        segments
    };
}

/**
 * 解析并直接在天地图实例上绘制起终点与整条路线。
 * 注意：该函数依赖全局 T（天地图 JS SDK）。
 */
export function parseAndDrawDriveRoute(xmlString: string, map: any): DriveDrawResult {
    if (!map) {
        throw new Error('地图实例为空');
    }

    const result = parseDriveRouteXml(xmlString);

    const TApi = (globalThis as any).T;
    if (!TApi?.LngLat || !TApi?.Marker || !TApi?.Polyline) {
        throw new Error('天地图 SDK 未就绪，无法绘制');
    }

    const toLngLat = (coordText: string) => {
        const [lngText, latText] = String(coordText || '').split(',');
        const lng = Number(lngText);
        const lat = Number(latText);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return new TApi.LngLat(lng, lat);
    };

    const start = toLngLat(result.origText);
    const end = toLngLat(result.destText);

    const startMarker = start ? new TApi.Marker(start) : null;
    const endMarker = end ? new TApi.Marker(end) : null;

    if (startMarker) map.addOverLay(startMarker);
    if (endMarker) map.addOverLay(endMarker);

    const routeLngLats = parseLinePoint(result.routeLatLon).map((p) => new TApi.LngLat(p.lng, p.lat));
    const routePolyline = routeLngLats.length >= 2
        ? new TApi.Polyline(routeLngLats, {
            color: '#10B981',
            weight: 6,
            opacity: 0.95,
            lineStyle: 'solid'
        })
        : null;

    if (routePolyline) {
        map.addOverLay(routePolyline);
        if (typeof map.setViewport === 'function') {
            map.setViewport(routeLngLats);
        }
    }

    return {
        result,
        startMarker,
        endMarker,
        routePolyline
    };
}
