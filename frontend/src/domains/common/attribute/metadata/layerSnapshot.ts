/**
 * 图层元数据与属性快照归一化
 *
 * 从 useLayerMetadataNormalization 拆出：把「图层对象 + 要素列表」压成属性表可直接消费的
 * 快照（rows / fieldConfig / statistics），并在 CRS 与代表经纬度缺失时补齐。
 */

import { buildFieldConfig, ensureStableFeatureId, normalizeFeatureRecord } from './featureRecords';
import { inferLayerRepresentativeLonLat } from './geometry';
import { flattenAttributes, isPlainObject, mergeTypeCounts, safeClone } from './valueUtils';

export function normalizeLayerMetadata(metadata: any, features: any[] = []): any {
    const nextMetadata = { ...(metadata || {}) };
    const normalizedCrs = String(nextMetadata.crs || 'wgs84').toLowerCase();
    nextMetadata.crs = normalizedCrs === 'gcj02' ? 'gcj02' : 'wgs84';

    if (!(Number.isFinite(nextMetadata.longitude) && Number.isFinite(nextMetadata.latitude))) {
        const pair = inferLayerRepresentativeLonLat(features);
        if (pair) {
            nextMetadata.longitude = Number(pair[0].toFixed(6));
            nextMetadata.latitude = Number(pair[1].toFixed(6));
        }
    }

    return nextMetadata;
}

export function normalizeLayerAttributeSnapshot(layer: Record<string, any> = {}, previousSnapshot: any = null): any {
    const layerId = String(layer?.id || layer?.layerId || '').trim();
    const layerName = String(layer?.name || layer?.layerName || '未命名图层');
    const sourceType = String(layer?.sourceType || previousSnapshot?.sourceType || 'upload');
    const features = Array.isArray(layer?.features) ? layer.features : [];
    const layerMetadata = isPlainObject(layer?.metadata) ? layer.metadata : {};
    const fallbackMetadata = isPlainObject(layer?.standardTocItem?.metadata)
        ? layer.standardTocItem.metadata
        : {};
    const metadata = normalizeLayerMetadata(
        {
            ...(fallbackMetadata || {}),
            ...(layerMetadata || {}),
        },
        features,
    );

    const records = features.length
        ? features.map((feature, index) =>
              normalizeFeatureRecord(feature, {
                  id: ensureStableFeatureId(feature, index),
                  index,
                  layerId,
                  layerName,
                  sourceType,
                  geometryType: layer?.geometryType || metadata?.geometryType || 'unknown',
              }),
          )
        : [];

    if (!records.length) {
        const syntheticAttributes = flattenAttributes({
            ...(fallbackMetadata || {}),
            ...(layerMetadata || {}),
            ...(layer?.statistics || {}),
        });

        if (Object.keys(syntheticAttributes).length) {
            records.push({
                id: `${layerId || 'layer'}__metadata`,
                featureId: `${layerId || 'layer'}__metadata`,
                layerId,
                layerName,
                sourceType,
                geometryType: String(
                    layer?.geometryType || layer?.type || metadata?.geometryType || 'raster',
                ).toLowerCase(),
                geometry: null,
                extent: null,
                properties: syntheticAttributes,
                rawAttributes: safeClone({
                    ...(fallbackMetadata || {}),
                    ...(layerMetadata || {}),
                    ...(layer?.statistics || {}),
                }),
                statistics: {
                    valueCount: Object.keys(syntheticAttributes).length,
                    typeCounts: { string: 0, number: 0, date: 0, boolean: 0, object: 0, null: 0 },
                    numericSummary: { count: 0, sum: 0, avg: 0, min: null, max: null },
                },
            });
        }
    }

    const previousFieldConfig: any = previousSnapshot?.fieldConfig || layer?.fieldConfig || {};
    const fieldConfig = buildFieldConfig(records, previousFieldConfig);
    const geometryTypeCounts = records.reduce((acc, record) => {
        const key = String(record.geometryType || 'unknown');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const aggregatedStatistics = records.reduce(
        (acc, record) => {
            acc.valueCount += Number(record.statistics?.valueCount || 0);
            acc.typeCounts = mergeTypeCounts(acc.typeCounts, record.statistics?.typeCounts || {});
            acc.numericSummary.count += Number(record.statistics?.numericSummary?.count || 0);
            acc.numericSummary.sum += Number(record.statistics?.numericSummary?.sum || 0);
            if (record.statistics?.numericSummary?.min !== null) {
                acc.numericSummary.min =
                    acc.numericSummary.min === null
                        ? record.statistics.numericSummary.min
                        : Math.min(acc.numericSummary.min, record.statistics.numericSummary.min);
            }
            if (record.statistics?.numericSummary?.max !== null) {
                acc.numericSummary.max =
                    acc.numericSummary.max === null
                        ? record.statistics.numericSummary.max
                        : Math.max(acc.numericSummary.max, record.statistics.numericSummary.max);
            }
            return acc;
        },
        {
            rowCount: records.length,
            valueCount: 0,
            fieldCount: Object.keys(fieldConfig).length,
            geometryTypeCounts,
            typeCounts: { string: 0, number: 0, date: 0, boolean: 0, object: 0, null: 0 },
            numericSummary: { count: 0, sum: 0, avg: 0, min: null, max: null },
        },
    );

    if (aggregatedStatistics.numericSummary.count > 0) {
        aggregatedStatistics.numericSummary.avg =
            aggregatedStatistics.numericSummary.sum / aggregatedStatistics.numericSummary.count;
    }

    return {
        id: layerId,
        layerId,
        layerName,
        sourceType,
        geometryType: String(
            layer?.geometryType || metadata?.geometryType || records[0]?.geometryType || 'unknown',
        ),
        metadata,
        rows: records,
        records,
        fieldConfig,
        statistics: aggregatedStatistics,
    };
}