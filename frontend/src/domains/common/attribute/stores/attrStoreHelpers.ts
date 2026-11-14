/**
 * 功能名称：属性表 store 纯计算层（类型 + 几何范围/签名/字段配置/行构建）
 * 日    期：2026/11/13
 *
 * 从 useAttrStore 拆出：不含 Pinia 状态，全部为可独立测试的纯函数。
 */

import { createLayerMetadataNormalizationFeature } from '@common/attribute/useLayerMetadataNormalization';

const {
    flattenAttributes: _flattenAttributes,
    inferValueType,
    normalizeLayerAttributeSnapshot,
    // B1：稳定 ID 单点实现收敛到归一化模块（含 OL 访问器候选 + 生成后写回要素本体），
    // 不再维护本地 toFeatureId 索引兜底副本——索引 ID 行序一变即错位，且 map 侧无法反解
    ensureStableFeatureId,
} = createLayerMetadataNormalizationFeature();
export type AttrFieldType = 'string' | 'number' | 'date' | 'boolean';
export type AttrFieldConfigItem = {
    key: string;
    alias: string;
    visible: boolean;
    type: AttrFieldType;
    /** 用户拖拽设定的列宽（px）；未设定时由表格用弹性宽度渲染 */
    width?: number;
};
export type AttrRow = {
    id: string;
    featureId: string;
    layerId: string;
    layerName: string;
    sourceType: string;
    geometryType: string;
    properties: Record<string, unknown>;
    rawAttributes: Record<string, unknown>;
    statistics: Record<string, unknown>;
    extent: [number, number, number, number] | null;
    searchText: string;
};
export type AttrLayerDataset = {
    id: string;
    layerId: string;
    layerName: string;
    sourceType: string;
    geometryType: string;
    metadata: Record<string, unknown>;
    rows: AttrRow[];
    fieldConfig: Record<string, AttrFieldConfigItem>;
    statistics: Record<string, unknown>;
};
export type PanelRect = {
    x: number;
    y: number;
    width: number;
    height: number;
    initialized: boolean;
};
function stringifySearchText(parts: unknown[]): string {
    return parts
        .map((part) => {
            if (part === null || part === undefined) return '';
            if (typeof part === 'string') return part;
            if (typeof part === 'number' || typeof part === 'boolean') return String(part);
            if (part instanceof Date) return part.toISOString();
            try {
                return JSON.stringify(part);
            } catch {
                return String(part);
            }
        })
        .join(' ')
        .toLowerCase();
}
function accumulateCoords(
    coord: any,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
) {
    if (!Array.isArray(coord)) return;

    if (
        coord.length >= 2 &&
        Number.isFinite(Number(coord[0])) &&
        Number.isFinite(Number(coord[1]))
    ) {
        const x = Number(coord[0]);
        const y = Number(coord[1]);
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
        return;
    }

    coord.forEach((child) => accumulateCoords(child, bounds));
}
function computeGeometryExtent(geometry: any): [number, number, number, number] | null {
    if (!geometry) return null;
    if (typeof geometry.getExtent === 'function') {
        const extent = geometry.getExtent();
        if (Array.isArray(extent) && extent.length >= 4 && extent.every(Number.isFinite)) {
            return [extent[0], extent[1], extent[2], extent[3]] as [number, number, number, number];
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

    accumulateCoords(coordinates, bounds);

    if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
        return null;
    }

    return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
}
export function intersectsExtent(
    a: [number, number, number, number],
    b: [number, number, number, number],
): boolean {
    return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
}
// ─── 范围坐标系归一（EPSG:3857 → EPSG:4326，纯数学无 OL 依赖）───
const WEB_MERCATOR_LIMIT = 20037508.342789244;
/**
 * 判断范围数值是否更像 Web Mercator 米制坐标。
 * EPSG:4326 合法值域不超过 ±180/±90，任一分量绝对值超过 360 视为 3857。
 * （±0.36~360 米的赤道原点微小范围存在理论歧义，实际业务数据不会落入。）
 */
function looksLikeWebMercatorExtent(extent: [number, number, number, number]): boolean {
    return extent.some((value) => Math.abs(value) > 360);
}
/** Web Mercator X（米） → 经度（度）。 */
function mercatorToLon(x: number): number {
    return (x / WEB_MERCATOR_LIMIT) * 180;
}
/** Web Mercator Y（米） → 纬度（度）。 */
function mercatorToLat(y: number): number {
    return (Math.atan(Math.exp((y / WEB_MERCATOR_LIMIT) * Math.PI)) * 360) / Math.PI - 90;
}
/**
 * 将任意来源的范围归一到 EPSG:4326 后返回。
 *
 * 背景：行数据来自 OL 要素时 extent 为 3857 米制，来自 GeoJSON 记录时为 4326
 * 经纬度；地图视图范围则始终是 3857。混用坐标系做相交判断会让「视图筛选范围」
 * 结果完全错乱，因此行侧与地图侧统一归一到 4326 再比较。
 */
export function normalizeExtentTo4326(
    extent: [number, number, number, number] | null,
): [number, number, number, number] | null {
    if (!extent || !extent.every(Number.isFinite)) return null;
    if (!looksLikeWebMercatorExtent(extent)) return extent;
    return [
        mercatorToLon(extent[0]),
        mercatorToLat(extent[1]),
        mercatorToLon(extent[2]),
        mercatorToLat(extent[3]),
    ];
}
/** FNV-1a 32 位哈希（可传入种子实现流式累计）。 */
function fnv1aHash(text: string, seed = 0x811c9dc5): number {
    let hash = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}
/**
 * 计算数据集内容签名：图层元信息 + 行数 + 逐行 featureId/searchText 哈希。
 * 签名一致 → 数据未实质变化 → 跳过替换，保持 rows 引用稳定，
 * 使属性表的虚拟滚动、选中态不因无关的图层事件被重置。
 */
export function computeDatasetSignature(dataset: AttrLayerDataset): string {
    let hash = 0x811c9dc5;
    dataset.rows.forEach((row) => {
        hash = fnv1aHash(`${row.featureId}|${row.searchText}`, hash);
    });
    return [
        dataset.layerName,
        dataset.sourceType,
        dataset.geometryType,
        dataset.rows.length,
        hash.toString(16),
    ].join('|');
}
function buildFieldConfig(
    rows: AttrRow[],
    previousMap: Record<string, AttrFieldConfigItem> = {},
): Record<string, AttrFieldConfigItem> {
    const keys = new Set<string>();
    rows.forEach((row) => {
        Object.keys(row.properties || {}).forEach((key) => keys.add(key));
    });

    const nextMap: Record<string, AttrFieldConfigItem> = {};
    Array.from(keys).forEach((fieldKey) => {
        const values = rows.map((row) => row.properties?.[fieldKey]);
        const oldConfig = previousMap[fieldKey];
        const typeCounts = values.reduce<Record<string, number>>((acc, value) => {
            const type = inferValueType(value);
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        nextMap[fieldKey] = {
            key: fieldKey,
            alias: String(oldConfig?.alias || fieldKey),
            visible: oldConfig?.visible !== false,
            type: (oldConfig?.type ||
                Object.entries(typeCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ||
                'string') as AttrFieldType,
            // 数据集重建时保留用户拖拽过的列宽
            ...(Number.isFinite(oldConfig?.width) ? { width: oldConfig?.width } : {}),
        };
    });

    return nextMap;
}
export function buildLayerDataset(
    layer: any,
    previousSnapshot: AttrLayerDataset | null = null,
): AttrLayerDataset {
    const snapshot = normalizeLayerAttributeSnapshot(layer);
    const rows: AttrRow[] = (snapshot.rows || snapshot.records || []).map(
        (record: any, index: number) => {
            const properties =
                record?.properties && typeof record.properties === 'object'
                    ? { ...record.properties }
                    : {};
            const rawAttributes =
                record?.rawAttributes && typeof record.rawAttributes === 'object'
                    ? { ...record.rawAttributes }
                    : {};
            const statistics =
                record?.statistics && typeof record.statistics === 'object'
                    ? { ...record.statistics }
                    : {};

            return {
                id: String(record?.id || record?.featureId || ensureStableFeatureId(record, index)),
                featureId: String(
                    record?.featureId || record?.id || ensureStableFeatureId(record, index),
                ),
                layerId: String(record?.layerId || snapshot.layerId || layer?.id || ''),
                layerName: String(
                    record?.layerName || snapshot.layerName || layer?.name || '未命名图层',
                ),
                sourceType: String(
                    record?.sourceType || snapshot.sourceType || layer?.sourceType || 'upload',
                ),
                geometryType: String(
                    record?.geometryType || snapshot.geometryType || layer?.type || 'unknown',
                ),
                properties,
                rawAttributes,
                statistics,
                geometry: record?.geometry || null,
                // 统一归一到 4326，与地图视图范围（同样归一）可靠相交比较
                extent: normalizeExtentTo4326(
                    record?.extent || computeGeometryExtent(record?.geometry),
                ),
                searchText: String(
                    record?.searchText ||
                        stringifySearchText([
                            record?.featureId,
                            record?.geometryType,
                            record?.properties,
                            record?.rawAttributes,
                            record?.statistics,
                            snapshot.layerName,
                            layer?.name,
                        ]),
                ),
            };
        },
    );

    return {
        id: String(snapshot.id || layer?.id || ''),
        layerId: String(snapshot.layerId || layer?.id || ''),
        layerName: String(snapshot.layerName || layer?.name || '未命名图层'),
        sourceType: String(snapshot.sourceType || layer?.sourceType || 'upload'),
        geometryType: String(snapshot.geometryType || layer?.type || 'unknown'),
        metadata: { ...(snapshot.metadata || {}) },
        rows,
        fieldConfig: buildFieldConfig(
            rows,
            (previousSnapshot?.fieldConfig || snapshot.fieldConfig || {}) as Record<
                string,
                AttrFieldConfigItem
            >,
        ),
        statistics: { ...(snapshot.statistics || {}) },
    };
}
