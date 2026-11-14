/**
 * 导出格式化工具集（CSV / TXT / GeoJSON / KML 共用）
 *
 * 从 `layerExportService.ts` 拆出：这些函数只做「几何顶点展开 / 文本格式化 / 下载」，
 * 与图层查找、格式分支无关，独立后原服务文件降到 300 行以内，便于单测与复用。
 */

/** 单个导出顶点（CSV / TXT 折点行的最小单元） */
export interface ExportVertex {
    lon: number;
    lat: number;
    geometryType: string;
    partIndex: number;
    ringIndex: number;
    vertexIndex: number;
}
/**
 * 递归收集 WGS84 几何体的所有顶点
 * 支持 Point/MultiPoint/LineString/MultiLineString/Polygon/MultiPolygon/GeometryCollection
 */
export function collectVerticesFromLonLatGeometry(geometry: any) {
    const type = String(geometry?.getType?.() || 'Unknown');
    const vertices: any[] = [];

    const pushVertex = (
        coord: any,
        { partIndex = 1, ringIndex = 0, vertexIndex = 1 }: { partIndex?: number; ringIndex?: number; vertexIndex?: number } = {},
    ) => {
        if (!Array.isArray(coord) || coord.length < 2) return;
        const lon = Number(coord[0]);
        const lat = Number(coord[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

        vertices.push({
            lon: Number(lon.toFixed(6)),
            lat: Number(lat.toFixed(6)),
            geometryType: type,
            partIndex,
            ringIndex,
            vertexIndex,
        });
    };

    if (type === 'Point') {
        pushVertex(geometry.getCoordinates?.(), { partIndex: 1, ringIndex: 0, vertexIndex: 1 });
        return vertices;
    }

    if (type === 'MultiPoint') {
        const coords = geometry.getCoordinates?.() || [];
        coords.forEach((coord: any, idx: number) => {
            pushVertex(coord, { partIndex: idx + 1, ringIndex: 0, vertexIndex: 1 });
        });
        return vertices;
    }

    if (type === 'LineString') {
        const coords = geometry.getCoordinates?.() || [];
        coords.forEach((coord: any, idx: number) => {
            pushVertex(coord, { partIndex: 1, ringIndex: 0, vertexIndex: idx + 1 });
        });
        return vertices;
    }

    if (type === 'MultiLineString') {
        const lines = geometry.getCoordinates?.() || [];
        lines.forEach((lineCoords: any, lineIdx: number) => {
            (lineCoords || []).forEach((coord: any, coordIdx: number) => {
                pushVertex(coord, {
                    partIndex: lineIdx + 1,
                    ringIndex: 0,
                    vertexIndex: coordIdx + 1,
                });
            });
        });
        return vertices;
    }

    if (type === 'Polygon') {
        const rings = geometry.getCoordinates?.() || [];
        rings.forEach((ringCoords: any, ringIdx: number) => {
            (ringCoords || []).forEach((coord: any, coordIdx: number) => {
                pushVertex(coord, {
                    partIndex: 1,
                    ringIndex: ringIdx + 1,
                    vertexIndex: coordIdx + 1,
                });
            });
        });
        return vertices;
    }

    if (type === 'MultiPolygon') {
        const polygons = geometry.getCoordinates?.() || [];
        polygons.forEach((polygonCoords: any, polygonIdx: number) => {
            (polygonCoords || []).forEach((ringCoords: any, ringIdx: number) => {
                (ringCoords || []).forEach((coord: any, coordIdx: number) => {
                    pushVertex(coord, {
                        partIndex: polygonIdx + 1,
                        ringIndex: ringIdx + 1,
                        vertexIndex: coordIdx + 1,
                    });
                });
            });
        });
        return vertices;
    }

    if (type === 'GeometryCollection') {
        const geometries = geometry.getGeometriesArray?.() || [];
        let partCursor = 1;
        geometries.forEach((subGeometry: any) => {
            const subVertices = collectVerticesFromLonLatGeometry(subGeometry);
            if (!subVertices.length) {
                partCursor += 1;
                return;
            }
            const maxPartIndex = Math.max(...subVertices.map((v) => Number(v.partIndex) || 1));
            subVertices.forEach((v) => {
                vertices.push({
                    ...v,
                    partIndex: Number(v.partIndex) + partCursor - 1,
                });
            });
            partCursor += Math.max(1, maxPartIndex);
        });
        return vertices;
    }

    return vertices;
}

/**
 * 为要素收集顶点（自动处理坐标系转换）
 */
export function collectFeatureVertices(feature: any): ExportVertex[] {
    const geometry = feature?.getGeometry?.();
    if (!geometry || typeof geometry.clone !== 'function') return [];

    const lonLatGeometry = geometry.clone();
    lonLatGeometry.transform('EPSG:3857', 'EPSG:4326');
    return collectVerticesFromLonLatGeometry(lonLatGeometry);
}

/**
 * 将字节数转换为可读的文件大小格式（B/KB/MB/GB/TB）
 */
export function formatBytes(bytes: number | string): string {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    if (size < 1024 * 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(size / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

/**
 * 清理文件名中的非法字符
 */
export function sanitizeExportFileName(name: string): string {
    const base = String(name || 'layer').trim() || 'layer';
    return base.replace(/[\\/:*?"<>|]+/g, '_');
}

/**
 * 将值转换为 CSV 单元格格式（处理引号和逗号）
 */
export function toCsvCell(value: unknown): string {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

/**
 * 触发文本文件下载并返回文件大小
 */
export function triggerTextDownload(fileName: string, content: string, mimeType?: string): number {
    const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return blob.size;
}

/**
 * 取要素原始属性并剔除 OL geometry 对象（不可序列化，且导出几何已单列）。
 * @returns {object} 可 JSON 序列化的属性浅拷贝
 */
export function stripGeometryFromProperties(feature: any): Record<string, any> {
    const props = feature?.getProperties?.() || {};
    const { geometry: _dropped, ...attrs } = props;
    return attrs;
}

/**
 * CSV 的固定列（与 `parsers/tabularParser.ts` 的解析契约一致，导出→导入可直接回读）。
 * 外部工具（QGIS / ArcGIS / Excel）按 `lng` / `lat` 即能识别为经纬度列。
 */
export const FIXED_EXPORT_COLUMNS = ['id', 'lng', 'lat', 'name', 'geometry_type', 'part', 'ring', 'vertex'];

/** 固定列已覆盖的属性键，避免表头出现两列同名 */
const NAME_ALIAS_KEYS = new Set(['ID', 'name', 'Name', 'NAME', '名称']);

/**
 * 功能：收集图层内所有要素的业务属性键（按首次出现顺序）。
 * 参数：features —— OL 要素数组。
 * 返回：string[]，已剔除 geometry、名称别名与固定列重名键。
 * 核心逻辑：CSV/TXT 原实现只写 8 个固定列，`height_m` / `floors` 等业务属性全部丢失；
 *   这里取「全部要素属性键的并集」动态扩列，某要素缺少该键时该格留空。
 */
export function collectAttributeColumns(features: any[]): string[] {
    const seen = new Set();
    const columns: string[] = [];
    (Array.isArray(features) ? features : []).forEach((feature) => {
        const props = stripGeometryFromProperties(feature);
        Object.keys(props).forEach((key) => {
            if (key === 'geometry' || NAME_ALIAS_KEYS.has(key) || seen.has(key)) return;
            seen.add(key);
            columns.push(key);
        });
    });
    return columns;
}

/**
 * 功能：把属性值格式化为单元格文本。
 * 参数：value —— 任意属性值。
 * 返回：字符串；null/undefined 为空串，对象/数组走 JSON。
 * 说明：建筑属性里可能有对象（如原始键集合），直接 String() 会得到 [object Object]。
 */
export function formatAttributeValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '';
        }
    }
    return String(value);
}

/**
 * 获取要素的显示名称（用于导出）
 */
export function getFeatureNameForExport(feature: any, fallbackName?: string): string {
    const candidates: any[] = [
        feature?.get?.('名称'),
        feature?.get?.('name'),
        feature?.get?.('Name'),
        feature?.get?.('NAME'),
        fallbackName,
    ];
    const hit = candidates.find((item) => String(item || '').trim().length > 0);
    return String(hit || fallbackName || '未命名要素');
}