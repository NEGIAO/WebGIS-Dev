/**
 * 要素记录：稳定 ID、原始属性抽取、字段配置、单条记录统计
 *
 * 从 useLayerMetadataNormalization 拆出。ID 解析同时兼容 OL Feature 访问器与
 * GeoJSON-like 平面属性（顺序与 map 侧 featureKey 保持一致），供属性表与高亮反解。
 */

import { flattenAttributes, inferValueType, isPlainObject, safeClone } from './valueUtils';
import { getGeometryExtent, getGeometryType } from './geometry';
import { normalizeHtmlAttributes } from './htmlAttributes';

/** B1：模块级自增种子，配合时间戳+随机段保证生成 ID 图层内外均唯一。 */
let generatedFeatureIdSeed = 0;

/**
 * 读取要素上已有的稳定 ID（不生成、不写回）。
 *
 * 候选顺序：先 OL Feature 访问器（getId → get('_gid') → get('id')，与
 * utils/map/featureKey.getFeatureIdFromFeature 的 map 侧解析顺序保持一致），
 * 再回退 GeoJSON-like 平面属性（id/_gid/properties.*）。
 *
 * 修复背景（B1）：旧 extractFeatureId 只查平面属性，裸 OL Feature 的
 * getId()/get('_gid') 读不到 → 有稳定 ID 的要素也会跌入 feature_${index}
 * 索引兜底，行序一变选中/高亮即错位，且 map 侧 findManagedFeature 无法
 * 反解索引 ID（高亮/缩放静默失效）。
 *
 * 注意：判空用 ?? 而非 ||，数值 0 是合法 ID（OBJECTID=0），与 map 侧语义对齐。
 *
 * @param {any} feature OL Feature 或 GeoJSON-like 对象
 * @returns {string} 已有 ID；不存在返回空串
 */
export function readExistingFeatureId(feature: any): string {
    if (!feature || typeof feature !== 'object') return '';
    const candidates = [
        typeof feature.getId === 'function' ? feature.getId() : null,
        typeof feature.get === 'function' ? feature.get('_gid') : null,
        typeof feature.get === 'function' ? feature.get('id') : null,
        feature.id,
        feature._gid,
        feature.properties?._gid,
        feature.properties?.id,
        feature.properties?.OBJECTID,
        feature.properties?.FID,
        feature.properties?.objectid,
        feature.properties?.fid,
    ];
    const matched = candidates.find((item) => String(item ?? '').trim().length > 0);
    return matched === undefined ? '' : String(matched).trim();
}

/**
 * 确保要素拥有稳定 ID：已有则直接返回；没有则生成一次并**写回要素本体**。
 *
 * 写回是 B1 修复的核心——ID 落在要素对象上后：
 * 1. 后续任意顺序的快照重建都解析出同一 ID（行序无关，选中/高亮不再错位）；
 * 2. map 侧 findManagedFeature（getFeatureById / get('_gid') 扫描）可解析同一
 *    ID，属性表 → 地图的高亮、缩放链路对原本无 ID 的数据也变为可达。
 *
 * 写回策略：OL Feature 走 setId + set('_gid', id, true)（第三参 silent，避免
 * 归一化过程触发要素 change 事件）；普通对象直写 _gid（并镜像到
 * properties._gid，使 ID 经属性展开类的浅重建后仍存活）。与导入侧
 * useManagedFeatureSerialization.ensureFeatureId 的 setId+_gid 约定同构，
 * 但本函数补齐了普通对象的持久化（导入侧只写 OL 实例）。
 *
 * @param {any} feature OL Feature 或 GeoJSON-like 对象
 * @param {number} index 要素索引（仅写回失败时用于退化兜底）
 * @returns {string} 稳定 ID；极端不可写（冻结对象）时退回 feature_${index+1}
 */
export function ensureStableFeatureId(feature: any, index = 0): string {
    const existing = readExistingFeatureId(feature);
    if (existing) return existing;
    if (!feature || typeof feature !== 'object') return `feature_${index + 1}`;

    generatedFeatureIdSeed += 1;
    const generated = `gid_${Date.now().toString(36)}_${generatedFeatureIdSeed}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    let persisted;
    try {
        if (typeof feature.set === 'function') {
            // OL Feature：silent 写 _gid + setId（供 getFeatureById O(1) 命中）
            feature.set('_gid', generated, true);
            if (typeof feature.setId === 'function') feature.setId(generated);
            persisted = true;
        } else {
            feature._gid = generated;
            if (isPlainObject(feature.properties)) {
                feature.properties._gid = generated;
            }
            persisted = true;
        }
    } catch {
        // 冻结/密封对象等极端情况：放弃写回，退回索引兜底（行为不劣于修复前）
        persisted = false;
    }

    return persisted ? generated : `feature_${index + 1}`;
}

export function extractRawAttributes(feature: any): Record<string, any> {
    if (!feature) return {};

    if (typeof feature.getProperties === 'function') {
        let properties = safeClone(feature.getProperties() || {});
        if (properties && typeof properties === 'object') {
            delete properties.geometry;
            delete properties.style;
            delete properties._style;
            delete properties.ol_uid;
        }
        properties = normalizeHtmlAttributes(properties);
        return properties && typeof properties === 'object' ? properties : {};
    }

    if (isPlainObject(feature.properties)) {
        let properties = safeClone(feature.properties);
        delete properties.geometry;
        delete properties.style;
        properties = normalizeHtmlAttributes(properties);
        return properties;
    }

    if (isPlainObject(feature)) {
        let clone = safeClone(feature);
        delete clone.geometry;
        delete clone.style;
        clone = normalizeHtmlAttributes(clone);
        return clone;
    }

    return {};
}

function collectFieldValues(records: any[], fieldKey: string): any[] {
    return records.map((record) => record?.properties?.[fieldKey]);
}

export function buildFieldConfig(records: any[], previousMap: any = {}): Record<string, any> {
    const keys = new Set<string>();
    records.forEach((record) => {
        Object.keys(record.properties || {}).forEach((key) => keys.add(key));
    });

    const nextMap: Record<string, any> = {};
    Array.from(keys).forEach((fieldKey) => {
        const values = collectFieldValues(records, fieldKey);
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
            type:
                oldConfig?.type ||
                Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
                'string',
        };
    });

    return nextMap;
}

export function buildRecordStatistics(properties: any): any {
    const values = Object.values(properties || {});
    const typeCounts: Record<string, number> = { string: 0, number: 0, date: 0, boolean: 0, object: 0, null: 0 };
    const numericValues: any[] = [];

    values.forEach((value) => {
        if (value === null || value === undefined || value === '') {
            typeCounts.null += 1;
            return;
        }

        const type = inferValueType(value);
        if (type in typeCounts) typeCounts[type] += 1;
        else typeCounts.string += 1;

        if (type === 'number') {
            const num = Number(value);
            if (Number.isFinite(num)) numericValues.push(num);
        }
    });

    const sum = numericValues.reduce((acc, value) => acc + value, 0);
    return {
        valueCount: values.length,
        typeCounts,
        numericSummary: numericValues.length
            ? {
                  count: numericValues.length,
                  sum,
                  avg: sum / numericValues.length,
                  min: Math.min(...numericValues),
                  max: Math.max(...numericValues),
              }
            : {
                  count: 0,
                  sum: 0,
                  avg: 0,
                  min: null,
                  max: null,
              },
    };
}

export function normalizeFeatureRecord(feature: any, context: any = {}): any {
    const rawAttributes = extractRawAttributes(feature);
    const flattened = flattenAttributes(rawAttributes, '', {}, new WeakSet());
    const geometryType = getGeometryType(feature) || context.geometryType || 'unknown';
    const extent = getGeometryExtent(feature);
    const geometry = feature?.getGeometry?.() || feature?.geometry || null;

    return {
        id: String(context.id || ensureStableFeatureId(feature, context.index || 0)),
        featureId: String(context.id || ensureStableFeatureId(feature, context.index || 0)),
        layerId: String(context.layerId || ''),
        layerName: String(context.layerName || ''),
        sourceType: String(context.sourceType || 'upload'),
        geometryType,
        geometry,
        extent,
        properties: flattened,
        rawAttributes,
        statistics: buildRecordStatistics(flattened),
    };
}
