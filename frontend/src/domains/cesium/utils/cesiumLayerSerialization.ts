/**
 * cesiumLayerSerialization.ts — Cesium 场景实体 → 坐标序列化
 *
 * 用途：TOC 右键「复制坐标 / 导出坐标(CSV/TXT/GeoJSON/KML)」的 3D 侧实现。
 * 输入为 `viewer.entities` 或 `DataSource.entities` 的实体集合，
 * 输出为纯数据（不触碰 DOM / 剪贴板 / 下载），便于单测与复用。
 *
 * 支持图元：point / polyline / polygon / rectangle。
 * 其余（billboard / model / tileset / ellipse 等）无坐标语义，跳过。
 * 属性可能是常量、CallbackProperty 或时间动态属性，统一按当前时刻取值。
 */

/** 单条几何（经纬度点序，WGS84 度） */
export interface LayerShape {
    type: 'point' | 'line' | 'polygon';
    lonLats: Array<[number, number]>;
}

/** 序列化元信息（写入 properties / Placemark 名） */
export interface SerializeMeta {
    id?: string;
    name?: string;
}

/** 可直接落盘的序列化结果 */
export interface SerializedExport {
    text: string;
    extension: string;
    mime: string;
}

/** 属性表行 */
export interface PropertyRow {
    entityId: string;
    name: string;
    values: Record<string, string>;
}

/** 属性表数据（列取并集，行按实体顺序） */
export interface PropertyTable {
    columns: string[];
    rows: PropertyRow[];
    truncated: boolean;
}

/**
 * 取属性在指定时刻的值（常量直接返回，动态属性求值，异常降级 undefined）。
 * @param property Cesium Property 或裸值
 * @param time Cesium.JulianDate
 */
function resolveValue(property: any, time: any): any {
    if (property === null || property === undefined) return undefined;
    if (typeof property.getValue === 'function') {
        try {
            return property.getValue(time);
        } catch {
            return undefined;
        }
    }
    return property;
}

/** Cartesian3 序列 → [[lon, lat], ...] */
function toLonLats(Cesium: any, positions: any): Array<[number, number]> {
    if (!Array.isArray(positions)) return [];
    const out: Array<[number, number]> = [];
    for (const position of positions) {
        try {
            const carto = Cesium.Cartographic.fromCartesian(position);
            if (!carto) continue;
            out.push([
                Cesium.Math.toDegrees(carto.longitude),
                Cesium.Math.toDegrees(carto.latitude),
            ]);
        } catch {
            /* 跳过非法坐标 */
        }
    }
    return out;
}

/**
 * 实体集合 → 几何形状清单。
 * @param Cesium Cesium 命名空间
 * @param entities 实体数组
 */
export function collectEntityShapes(Cesium: any, entities: any[]): LayerShape[] {
    if (!Cesium || !Array.isArray(entities)) return [];
    const time = Cesium.JulianDate?.now?.();
    const shapes: LayerShape[] = [];

    for (const entity of entities) {
        if (!entity) continue;
        try {
            if (entity.polygon) {
                const hierarchy = resolveValue(entity.polygon.hierarchy, time);
                const lonLats = toLonLats(Cesium, hierarchy?.positions);
                if (lonLats.length >= 3) shapes.push({ type: 'polygon', lonLats });
                continue;
            }
            if (entity.rectangle) {
                const rect = resolveValue(entity.rectangle.coordinates, time);
                if (rect) {
                    const w = Cesium.Math.toDegrees(rect.west);
                    const s = Cesium.Math.toDegrees(rect.south);
                    const e = Cesium.Math.toDegrees(rect.east);
                    const n = Cesium.Math.toDegrees(rect.north);
                    shapes.push({
                        type: 'polygon',
                        lonLats: [
                            [w, s],
                            [e, s],
                            [e, n],
                            [w, n],
                        ],
                    });
                }
                continue;
            }
            if (entity.polyline) {
                const positions = resolveValue(entity.polyline.positions, time);
                const lonLats = toLonLats(Cesium, positions);
                if (lonLats.length >= 2) shapes.push({ type: 'line', lonLats });
                continue;
            }
            if (entity.point) {
                // 位置只挂在 Entity 上（PointGraphics 无 position 字段），动态属性按当前时刻求值
                const position = resolveValue(entity.position, time);
                const lonLats = toLonLats(Cesium, position ? [position] : []);
                if (lonLats.length) shapes.push({ type: 'point', lonLats });
            }
        } catch {
            /* 单个实体失败不影响整体导出 */
        }
    }
    return shapes;
}

/** 闭合环（GeoJSON 要求首尾相同） */
function closeRing(lonLats: Array<[number, number]>): Array<[number, number]> {
    const ring = lonLats.map(([lon, lat]) => [lon, lat] as [number, number]);
    if (!ring.length) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
    return ring;
}

/**
 * 形状清单 → GeoJSON FeatureCollection。
 * @param shapes collectEntityShapes 的输出
 * @param meta 附加到 properties
 */
export function buildGeoJSONFeatureCollection(
    shapes: LayerShape[] | null | undefined,
    meta: SerializeMeta = {},
): any {
    const features = (shapes || []).map((shape, index) => {
        let geometry: any;
        if (shape.type === 'point') {
            geometry = { type: 'Point', coordinates: shape.lonLats[0] };
        } else if (shape.type === 'line') {
            geometry = { type: 'LineString', coordinates: shape.lonLats };
        } else {
            geometry = { type: 'Polygon', coordinates: [closeRing(shape.lonLats)] };
        }
        return {
            type: 'Feature',
            id: `${meta.id || 'feature'}-${index + 1}`,
            properties: {
                layerId: meta.id || null,
                layerName: meta.name || null,
                shapeType: shape.type,
                vertexCount: shape.lonLats.length,
            },
            geometry,
        };
    });

    return {
        type: 'FeatureCollection',
        properties: { layerId: meta.id || null, layerName: meta.name || null },
        features,
    };
}

/** 形状清单 → CSV（shape,seq,lng,lat 四列，一行一个顶点） */
export function buildCoordinateCSV(shapes: LayerShape[] | null | undefined): string {
    const lines = ['shape,seq,lng,lat'];
    (shapes || []).forEach((shape, shapeIndex) => {
        shape.lonLats.forEach(([lon, lat], i) => {
            lines.push(`${shape.type}_${shapeIndex + 1},${i + 1},${lon.toFixed(6)},${lat.toFixed(6)}`);
        });
    });
    return lines.join('\n');
}

/** 形状清单 → TXT（按形状分块，块内每行一个 "lng,lat"） */
export function buildCoordinateTXT(shapes: LayerShape[] | null | undefined): string {
    const blocks = (shapes || []).map((shape, index) => {
        const header = `# ${shape.type}_${index + 1} (${shape.lonLats.length} points)`;
        const body = shape.lonLats
            .map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
            .join('\n');
        return `${header}\n${body}`;
    });
    return blocks.join('\n\n');
}

/** XML 文本转义（KML 的 name / description 必须转义，否则含 & < > 即生成非法 XML） */
function escapeXml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** KML 坐标串：lon,lat,alt 以空格分隔；面类需首尾闭合 */
function kmlCoordinates(lonLats: Array<[number, number]>, close: boolean): string {
    const ring = close ? closeRing(lonLats) : lonLats;
    return ring.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)},0`).join(' ');
}

/**
 * 形状清单 → KML 2.2 文档。
 * 与 OL 侧「导出为 KML」语义对齐：一图形一 Placemark，统一样式（不保留原色，
 * 3D 实体的颜色来自运行时材质，反推会得到与源数据无关的值）。
 */
export function buildKML(shapes: LayerShape[] | null | undefined, meta: SerializeMeta = {}): string {
    const placemarks = (shapes || []).map((shape, index) => {
        const name = `${meta.name || 'layer'}-${index + 1}`;
        let geometry: string;
        if (shape.type === 'point') {
            const [lon, lat] = shape.lonLats[0];
            geometry = `      <Point><coordinates>${lon.toFixed(6)},${lat.toFixed(6)},0</coordinates></Point>`;
        } else if (shape.type === 'line') {
            geometry = `      <LineString><tessellate>1</tessellate><coordinates>${kmlCoordinates(shape.lonLats, false)}</coordinates></LineString>`;
        } else {
            geometry = `      <Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlCoordinates(shape.lonLats, true)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
        }
        return `    <Placemark>
      <name>${escapeXml(name)}</name>
      <styleUrl>#cesium-layer-style</styleUrl>
${geometry}
    </Placemark>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(meta.name || 'cesium-layer')}</name>
    <Style id="cesium-layer-style">
      <LineStyle><color>ff35e0f0</color><width>2</width></LineStyle>
      <PolyStyle><color>4d35e0f0</color></PolyStyle>
    </Style>
${placemarks.join('\n')}
  </Document>
</kml>`;
}

/**
 * 按格式产出「可直接落盘」的文本。
 * @param shapes 几何清单
 * @param format 导出格式（未识别值按 geojson 处理）
 * @param meta 元信息
 * @returns 序列化结果；无几何时返回 null（调用方据此提示「无可导出坐标」）
 */
export function serializeShapes(
    shapes: LayerShape[] | null | undefined,
    format: string,
    meta: SerializeMeta = {},
): SerializedExport | null {
    const list = Array.isArray(shapes) ? shapes : [];
    if (!list.length) return null;

    const normalized = String(format || 'geojson').toLowerCase();
    if (normalized === 'csv') {
        return { text: buildCoordinateCSV(list), extension: 'csv', mime: 'text/csv' };
    }
    if (normalized === 'txt') {
        return { text: buildCoordinateTXT(list), extension: 'txt', mime: 'text/plain' };
    }
    if (normalized === 'kml') {
        return {
            text: buildKML(list, meta),
            extension: 'kml',
            mime: 'application/vnd.google-earth.kml+xml',
        };
    }
    return {
        text: JSON.stringify(buildGeoJSONFeatureCollection(list, meta), null, 2),
        extension: 'geojson',
        mime: 'application/geo+json',
    };
}

/**
 * 实体集合 → 属性表数据（列取并集，行按实体顺序）。
 *
 * `entity.properties` 可能是 PropertyBag / 普通对象 / 时间动态属性，
 * 统一按当前时刻取值；对象值序列化为 JSON 文本，保证表格可读。
 *
 * @param Cesium Cesium 命名空间
 * @param entities 实体数组
 * @param limit 行数上限（防超大图层卡死表格），默认 5000
 */
export function collectEntityProperties(
    Cesium: any,
    entities: any[],
    limit = 5000,
): PropertyTable {
    const rows: PropertyRow[] = [];
    const columnSet = new Set<string>();
    const time = Cesium?.JulianDate?.now?.();
    let truncated = false;

    for (const entity of entities || []) {
        if (!entity) continue;
        if (rows.length >= limit) {
            truncated = true;
            break;
        }

        const values: Record<string, string> = {};
        try {
            const raw = resolveValue(entity.properties, time);
            if (raw && typeof raw === 'object') {
                Object.keys(raw).forEach((key) => {
                    const value = raw[key];
                    if (value === null || value === undefined) return;
                    values[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
                });
            }
        } catch {
            /* 属性解析失败：保留空属性行，仍可通过名称定位 */
        }

        Object.keys(values).forEach((key) => columnSet.add(key));
        rows.push({
            entityId: entity.id,
            name: String(entity.name || values.name || values.Name || entity.id),
            values,
        });
    }

    return { columns: [...columnSet], rows, truncated };
}
