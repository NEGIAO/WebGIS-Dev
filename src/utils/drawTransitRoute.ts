export interface TransitStation {
    name: string;
    lonlat: string;
}

export interface TransitSegmentLine {
    linePoint: string;
    lineName: string;
}

export interface TransitSegment {
    segmentType: 1 | 2 | number;
    stationStart: TransitStation;
    stationEnd: TransitStation;
    segmentLine: TransitSegmentLine[];
}

export interface TransitLine {
    segments: TransitSegment[];
}

const BUS_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'];

type TiandituMap = {
    addOverLay: (overlay: any) => void;
    setViewport: (points: any[]) => void;
};

function parseLonlat(value: string): [number, number] | null {
    const [lngStr, latStr] = String(value || '').split(',');
    const lng = Number(lngStr);
    const lat = Number(latStr);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
}

function makeDefaultName(rawName: string, kind: 'start' | 'end', index: number, total: number): string {
    const name = String(rawName || '').trim();
    if (name) return name;
    if (kind === 'start' && index === 0) return '起点';
    if (kind === 'end' && index === total - 1) return '终点';
    return '途经点';
}

function addMarkerWithLabel(map: TiandituMap, T: any, lng: number, lat: number, labelText: string): any {
    const point = new T.LngLat(lng, lat);
    const marker = new T.Marker(point);

    if (typeof marker.setLabel === 'function') {
        const label = new T.Label({ text: labelText, offset: new T.Point(12, -8) });
        marker.setLabel(label);
    }

    map.addOverLay(marker);

    if (typeof marker.setLabel !== 'function' && typeof T.Label === 'function') {
        const label = new T.Label({
            text: labelText,
            position: point,
            offset: new T.Point(12, -8)
        });
        map.addOverLay(label);
    }

    return point;
}

/**
 * 严格按 transit line.segments 结构绘制天地图路线。
 */
export function drawTransitRoute(line: TransitLine, map: TiandituMap): void {
    const T = (globalThis as any)?.T;
    if (!T || !map) {
        throw new Error('天地图对象未就绪，无法绘制公交方案');
    }

    const segments = Array.isArray(line?.segments) ? line.segments : [];
    if (!segments.length) {
        throw new Error('当前方案没有可绘制的 segments');
    }

    const allViewportPoints: any[] = [];
    let busColorIndex = 0;

    segments.forEach((segment, segmentIndex) => {
        const total = segments.length;
        const startName = makeDefaultName(segment?.stationStart?.name, 'start', segmentIndex, total);
        const endName = makeDefaultName(segment?.stationEnd?.name, 'end', segmentIndex, total);

        const startCoord = parseLonlat(segment?.stationStart?.lonlat);
        const endCoord = parseLonlat(segment?.stationEnd?.lonlat);

        if (startCoord) {
            const point = addMarkerWithLabel(map, T, startCoord[0], startCoord[1], startName);
            allViewportPoints.push(point);
        }

        if (endCoord) {
            const point = addMarkerWithLabel(map, T, endCoord[0], endCoord[1], endName);
            allViewportPoints.push(point);
        }

        // 严格按要求：只读取 segmentLine[0]
        const lineInfo = Array.isArray(segment?.segmentLine) ? segment.segmentLine[0] : null;
        const rawLinePoint = String(lineInfo?.linePoint || '');
        const lineName = String(lineInfo?.lineName || '').trim();

        const pointPairs = rawLinePoint.split(';').filter(Boolean);
        const lngLatList = pointPairs
            .map((pair) => {
                const parsed = parseLonlat(pair);
                return parsed ? new T.LngLat(parsed[0], parsed[1]) : null;
            })
            .filter(Boolean);

        if (lngLatList.length < 2) {
            return;
        }

        const isWalk = Number(segment?.segmentType) === 1;
        const routeName = isWalk ? '步行' : (lineName || `公交段 ${segmentIndex + 1}`);

        let color = '#888888';
        let lineStyle = 'dashed';
        if (!isWalk) {
            color = BUS_COLORS[busColorIndex % BUS_COLORS.length];
            busColorIndex += 1;
            lineStyle = 'solid';
        }

        const polyline = new T.Polyline(lngLatList, {
            color,
            weight: 6,
            opacity: 0.9,
            lineStyle
        });

        (polyline as any).__routeName = routeName;
        map.addOverLay(polyline);
        allViewportPoints.push(...lngLatList);
    });

    if (allViewportPoints.length) {
        map.setViewport(allViewportPoints);
    }
}
