/**
 * tabularParser.ts — 表格 / WKT 文本 → GeoJSON
 *
 * 用途：让本系统「导出为 CSV / TXT」的文件能够被本系统原样导入，形成导入导出闭环。
 * 背景：此前导出侧产出的是折点表（CSV）与纯坐标文本（TXT），而导入侧只认
 *   GeoJSON / KML / SHP / TIF，导出的数据无法回读，外部工具也无法直接识别 TXT。
 *
 * 现约定（导出与解析共用同一套列名，两侧互为契约）：
 *   CSV 表头：id,lng,lat,name,geometry_type,part,ring,vertex,<业务属性列…>
 *   TXT 内容：标准 WKT（POINT / LINESTRING / POLYGON / MULTI*），
 *            几何前的 `# @键=值` 注释行归属下一个几何。
 *
 * 解析器同时兼容常见别名（lon/longitude/x/经度、lat/y/纬度 等），
 * 以便直接吃下 QGIS / Excel 导出的经纬度表。
 */

type Position = [number, number];

export interface FeatureCollectionLike {
    type: 'FeatureCollection';
    features: Array<{
        type: 'Feature';
        properties: Record<string, unknown>;
        geometry: {
            type: string;
            coordinates: unknown;
        };
    }>;
}

/** 本系统导出的固定列（解析时不再作为业务属性输出） */
const RESERVED_COLUMNS = new Set([
    'id',
    'lng',
    'lat',
    'name',
    'geometrytype',
    'part',
    'ring',
    'vertex',
]);

/** 列名别名 → 语义键。比较前统一小写、去空白与下划线 */
const COLUMN_ALIASES: Record<string, string[]> = {
    lng: ['lng', 'lon', 'long', 'longitude', 'x', '经度', '东经'],
    lat: ['lat', 'latitude', 'y', '纬度', '北纬'],
    id: ['id', 'fid', 'objectid', 'featureid'],
    name: ['name', 'title', '名称', '名字'],
    geometry_type: [
        'geometrytype',
        'geomtype',
        'geometry',
        'geometryname',
        'shapetype',
        'shape',
        '几何类型',
        '类型',
    ],
    part: ['part', 'partindex', '部件'],
    ring: ['ring', 'ringindex', '环'],
    vertex: ['vertex', 'vertexindex', 'seq', 'sequence', '点序号'],
};

/** 几何类型归一：中文 / 小写 / 3D 侧 shape 前缀统一成 GeoJSON 名称 */
const GEOMETRY_ALIASES: Record<string, string> = {
    point: 'Point',
    pointz: 'Point',
    multipoint: 'MultiPoint',
    line: 'LineString',
    linestring: 'LineString',
    multiline: 'MultiLineString',
    multilinestring: 'MultiLineString',
    polygon: 'Polygon',
    multipolygon: 'MultiPolygon',
    点: 'Point',
    线: 'LineString',
    线状: 'LineString',
    面: 'Polygon',
    面状: 'Polygon',
    多边形: 'Polygon',
};

/** 数值字符串 → number；非法值原样保留，避免丢字段 */
function coerceValue(text: string): unknown {
    const value = String(text ?? '').trim();
    if (!value) return undefined;
    if (/^-?\d+(\.\d+)?$/.test(value)) {
        const num = Number(value);
        return Number.isFinite(num) ? num : value;
    }
    return value;
}

/** 列名归一：小写、去空白 / 下划线 / 连字符，便于别名匹配 */
function normalizeColumnName(name: string): string {
    return String(name ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
}

/** 在表头中定位语义列索引；找不到返回 -1 */
function findColumn(headers: string[], aliases: string[]): number {
    const normalized = headers.map(normalizeColumnName);
    for (const alias of aliases) {
        const index = normalized.indexOf(normalizeColumnName(alias));
        if (index >= 0) return index;
    }
    return -1;
}

/**
 * 功能：解析一行 CSV（支持引号包裹、双引号转义、引号内逗号与换行）。
 * 参数：line —— 单行文本。
 * 返回：单元格数组。
 * 说明：导出侧对含逗号 / 引号 / 换行的值会加引号，此处必须成对解析，
 *   否则属性里的逗号会把列位冲散。
 */
function splitCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                current += ch;
            }
            continue;
        }
        if (ch === '"') {
            quoted = true;
        } else if (ch === ',') {
            cells.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    cells.push(current);
    return cells;
}

/** 把坐标序列按 vertex 列排序后输出 */
function sortByVertex<T extends { vertex: number; order: number; position: Position }>(items: T[]): Position[] {
    return [...items]
        .sort((a, b) => (a.vertex - b.vertex) || (a.order - b.order))
        .map((item) => item.position);
}

/** 闭合环（GeoJSON 要求首尾相同） */
function closeRing(ring: Position[]): Position[] {
    if (ring.length < 3) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return ring;
    return [...ring, [first[0], first[1]]];
}

/**
 * 功能：CSV 文本 → GeoJSON FeatureCollection。
 * 参数：text —— CSV 原文（可含 BOM）。
 * 返回：FeatureCollection；无有效坐标时 features 为空数组。
 * 核心逻辑：
 *   1. 表头按别名识别经纬度 / 几何类型 / 分组列，其余列作为业务属性；
 *   2. Point 每行一个要素；LineString 按 id+part 分组；Polygon 再按 ring 分环；
 *   3. 顶点按 vertex（缺省用行序）排序，面自动闭合；
 *   4. 数值型属性转 number，其余保持字符串。
 */
export function parseCsvToGeoJSON(text: string): FeatureCollectionLike {
    const source = String(text ?? '').replace(/^\uFEFF/, '');
    const lines = source.split(/\r?\n/);
    const rows: string[][] = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        if (line.trimStart().startsWith('#')) continue;
        rows.push(splitCsvLine(line));
    }
    if (rows.length < 2) return { type: 'FeatureCollection', features: [] };

    const headers = rows[0].map((cell) => String(cell ?? '').trim());
    const lngIndex = findColumn(headers, COLUMN_ALIASES.lng);
    const latIndex = findColumn(headers, COLUMN_ALIASES.lat);
    if (lngIndex < 0 || latIndex < 0) {
        throw new Error('CSV 缺少经纬度列（需包含 lng/lat、lon/lat 或 经度/纬度）');
    }
    const idIndex = findColumn(headers, COLUMN_ALIASES.id);
    const nameIndex = findColumn(headers, COLUMN_ALIASES.name);
    const geomIndex = findColumn(headers, COLUMN_ALIASES.geometry_type);
    const partIndex = findColumn(headers, COLUMN_ALIASES.part);
    const ringIndex = findColumn(headers, COLUMN_ALIASES.ring);
    const vertexIndex = findColumn(headers, COLUMN_ALIASES.vertex);

    /** 业务属性列：排除固定列与已识别的语义列 */
    const attributeColumns = headers
        .map((header, index) => ({ header, index }))
        .filter(({ header, index }) => {
            if (!header) return false;
            if (RESERVED_COLUMNS.has(normalizeColumnName(header))) return false;
            return ![lngIndex, latIndex, idIndex, nameIndex, geomIndex, partIndex, ringIndex, vertexIndex].includes(index);
        });

    /** 按几何类型分组的顶点容器：key = id|part|ring */
    const pointFeatures: FeatureCollectionLike['features'] = [];
    const grouped = new Map<string, {
        geometryType: string;
        properties: Record<string, unknown>;
        rings: Map<number, Array<{ vertex: number; order: number; position: Position }>>;
    }>();

    rows.slice(1).forEach((cells, rowIndex) => {
        const lng = Number(cells[lngIndex]);
        const lat = Number(cells[latIndex]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

        const properties: Record<string, unknown> = {};
        attributeColumns.forEach(({ header, index }) => {
            const value = coerceValue(cells[index] ?? '');
            if (value !== undefined) properties[header] = value;
        });

        const rawGeom = geomIndex >= 0 ? String(cells[geomIndex] ?? '').trim() : '';
        const normalizedGeom = GEOMETRY_ALIASES[normalizeColumnName(rawGeom)] || '';
        const geometryType = normalizedGeom || 'Point';

        if (geometryType === 'Point' || geometryType === 'MultiPoint') {
            const featureProperties: Record<string, unknown> = { ...properties };
            const name = nameIndex >= 0 ? String(cells[nameIndex] ?? '').trim() : '';
            if (name) featureProperties.name = name;
            pointFeatures.push({
                type: 'Feature',
                properties: featureProperties,
                geometry: { type: 'Point', coordinates: [lng, lat] },
            });
            return;
        }

        const id = idIndex >= 0 ? String(cells[idIndex] ?? '').trim() : String(rowIndex + 1);
        const part = partIndex >= 0 ? Number(cells[partIndex]) || 0 : 0;
        const ring = ringIndex >= 0 ? Number(cells[ringIndex]) || 0 : 0;
        const vertex = vertexIndex >= 0 ? Number(cells[vertexIndex]) || 0 : rowIndex + 1;
        const key = `${id}|${part}`;

        let entry = grouped.get(key);
        if (!entry) {
            const featureProperties: Record<string, unknown> = { ...properties };
            const name = nameIndex >= 0 ? String(cells[nameIndex] ?? '').trim() : '';
            if (name) featureProperties.name = name;
            entry = {
                geometryType,
                properties: featureProperties,
                rings: new Map(),
            };
            grouped.set(key, entry);
        }
        const ringVertices = entry.rings.get(ring) || [];
        ringVertices.push({ vertex, order: rowIndex, position: [lng, lat] });
        entry.rings.set(ring, ringVertices);
    });

    const features = [...pointFeatures];
    grouped.forEach((entry) => {
        const ringKeys = [...entry.rings.keys()].sort((a, b) => a - b);
        if (entry.geometryType === 'Polygon' || entry.geometryType === 'MultiPolygon') {
            const rings = ringKeys.map((ringKey) => closeRing(sortByVertex(entry.rings.get(ringKey) || [])));
            const usable = rings.filter((ring) => ring.length >= 3);
            if (!usable.length) return;
            features.push({
                type: 'Feature',
                properties: entry.properties,
                geometry:
                    entry.geometryType === 'MultiPolygon'
                        ? { type: 'MultiPolygon', coordinates: usable.map((ring) => [ring]) }
                        : { type: 'Polygon', coordinates: usable },
            });
            return;
        }
        // LineString / MultiLineString：每个 part 一条线
        const lineParts = ringKeys
            .map((ringKey) => sortByVertex(entry.rings.get(ringKey) || []))
            .filter((line) => line.length >= 2);
        if (!lineParts.length) return;
        features.push({
            type: 'Feature',
            properties: entry.properties,
            geometry:
                lineParts.length > 1 || entry.geometryType === 'MultiLineString'
                    ? { type: 'MultiLineString', coordinates: lineParts }
                    : { type: 'LineString', coordinates: lineParts[0] },
        });
    });

    return { type: 'FeatureCollection', features };
}

/** 统计括号层级，用于判断一段 WKT 是否已完整（跨行 WKT 需要累积到配平） */
function bracketBalance(text: string): number {
    let balance = 0;
    for (const ch of text) {
        if (ch === '(') balance += 1;
        else if (ch === ')') balance -= 1;
    }
    return balance;
}

/**
 * 功能：解析 WKT 坐标段为嵌套点数组。
 * 参数：input —— 括号内的文本，如 `114.3 30.5, 114.4 30.6`。
 * 返回：按括号层级嵌套的坐标数组（最内层为 [x, y]）。
 */
function parseWktCoordinates(input: string): any {
    const text = String(input ?? '').trim();
    if (!text) return null;
    if (text.startsWith('(')) {
        const depth = bracketBalance(text);
        if (depth !== 0) throw new Error('WKT 括号不匹配');
        // 去掉最外层括号后按顶层逗号切分
        const inner = text.slice(1, text.lastIndexOf(')'));
        const parts: string[] = [];
        let level = 0;
        let current = '';
        for (const ch of inner) {
            if (ch === '(') level += 1;
            if (ch === ')') level -= 1;
            if (ch === ',' && level === 0) {
                parts.push(current);
                current = '';
                continue;
            }
            current += ch;
        }
        if (current.trim()) parts.push(current);
        return parts.map((part) => parseWktCoordinates(part.trim()));
    }
    // 最内层：`x y [z]`
    const numbers = text
        .split(/\s+/)
        .map((item) => Number(item))
        .filter((num) => Number.isFinite(num));
    if (numbers.length < 2) return null;
    return [numbers[0], numbers[1]];
}

/** WKT 类型 → GeoJSON geometry（坐标结构已在 parseWktCoordinates 中分层） */
function buildWktGeometry(type: string, coordinates: any): { type: string; coordinates: unknown } | null {
    switch (type) {
        case 'POINT': {
            // parseWktCoordinates 对外层括号统一包了一层，POINT 需要降一层
            const point =
                Array.isArray(coordinates) &&
                coordinates.length === 1 &&
                Array.isArray(coordinates[0]) &&
                typeof coordinates[0][0] === 'number'
                    ? coordinates[0]
                    : coordinates;
            return Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number'
                ? { type: 'Point', coordinates: point }
                : null;
        }
        case 'MULTIPOINT': {
            // WKT 允许 ((x y),(x y)) 与 (x y, x y) 两种写法，统一降一层
            const points = Array.isArray(coordinates)
                ? coordinates
                      .map((item: any) => (Array.isArray(item?.[0]) ? item[0] : item))
                      .filter((item: any) => Array.isArray(item) && typeof item[0] === 'number')
                : [];
            return points.length ? { type: 'MultiPoint', coordinates: points } : null;
        }
        case 'LINESTRING':
            return { type: 'LineString', coordinates };
        case 'MULTILINESTRING':
            return { type: 'MultiLineString', coordinates };
        case 'POLYGON':
            return { type: 'Polygon', coordinates };
        case 'MULTIPOLYGON':
            return { type: 'MultiPolygon', coordinates };
        default:
            return null;
    }
}

/**
 * 功能：WKT 文本 → GeoJSON FeatureCollection。
 * 参数：text —— WKT 原文；支持 `# @键=值` 注释行（归属紧随其后的几何）。
 * 返回：FeatureCollection；无可解析几何时 features 为空数组。
 * 核心逻辑：
 *   1. 逐行累积，`# @k=v` 进属性暂存，`#` 其它注释忽略；
 *   2. 命中 `POINT/LINESTRING/POLYGON/MULTI*` 后继续累积直到括号配平（长面会跨行）；
 *   3. 解析完成后清空属性暂存，避免串到下一个几何。
 */
export function parseWktToGeoJSON(text: string): FeatureCollectionLike {
    const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const features: FeatureCollectionLike['features'] = [];
    let pendingProperties: Record<string, unknown> = {};
    let buffer = '';

    const flush = () => {
        const value = buffer.trim();
        buffer = '';
        if (!value) return;
        const match = /^(POINT|MULTIPOINT|LINESTRING|MULTILINESTRING|POLYGON|MULTIPOLYGON)\s*(\([\s\S]*\))$/i.exec(value);
        if (!match) return;
        const type = match[1].toUpperCase();
        const coordinates = parseWktCoordinates(match[2]);
        const geometry = buildWktGeometry(type, coordinates);
        if (!geometry) return;
        features.push({
            type: 'Feature',
            properties: { ...pendingProperties },
            geometry,
        });
        pendingProperties = {};
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            if (buffer) flush();
            continue;
        }
        if (!buffer && line.startsWith('#')) {
            const attr = /^#\s*@([^=]+)=(.*)$/.exec(line);
            if (attr) pendingProperties[attr[1].trim()] = coerceValue(attr[2]);
            continue;
        }
        if (!buffer && /^(POINT|MULTIPOINT|LINESTRING|MULTILINESTRING|POLYGON|MULTIPOLYGON)\s*\(/i.test(line)) {
            buffer = line;
        } else if (buffer) {
            buffer += ` ${line}`;
        } else {
            continue;
        }
        if (bracketBalance(buffer) === 0) flush();
    }
    if (buffer) flush();

    return { type: 'FeatureCollection', features };
}
