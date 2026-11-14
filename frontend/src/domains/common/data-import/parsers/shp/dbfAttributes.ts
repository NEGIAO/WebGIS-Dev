/**
 * DBF 属性并入 GeoJSON 要素（含要素 ID 分配）
 * 日    期：2026/11/13
 */

import { DbfData } from '../dbfParser';
export function assignFeatureIds(featureCollection: any): any {
    if (!featureCollection) return featureCollection;
    const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];

    features.forEach((feature: any, index: number) => {
        const gid =
            feature?.id ||
            feature?.properties?._gid ||
            feature?.properties?.id ||
            `feature_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        feature.id = gid;
        feature.properties =
            feature.properties && typeof feature.properties === 'object' ? feature.properties : {};
        feature.properties._gid = gid;
    });

    return featureCollection;
}
/**
 * 使用 DBF 属性数据增强 GeoJSON features
 * 将完整的属性信息与几何数据关联
 * 
 * @param featureCollection 原始 GeoJSON FeatureCollection
 * @param dbfData 解析后的 DBF 属性表数据
 * @returns 增强后的 FeatureCollection
 */
export function enrichFeaturesWithDbfAttributes(featureCollection: any, dbfData: DbfData): any {
    if (!featureCollection || !Array.isArray(featureCollection?.features)) {
        console.warn('[SHP] GeoJSON 无效，无法进行属性关联');
        return featureCollection;
    }

    const features = featureCollection.features;
    const dbfRecords = dbfData.records;

    if (features.length === 0) {
        console.warn('[SHP] 无任何 feature，无法进行属性关联');
        return featureCollection;
    }

    if (dbfRecords.length === 0) {
        console.warn('[SHP] 无任何 DBF 记录，属性关联失败');
        return featureCollection;
    }

    let successCount = 0;
    let mismatchWarnings = 0;

    // 按索引关联：第 i 个几何 = 第 i 个属性
    features.forEach((feature: any, index: number) => {
        if (index < dbfRecords.length) {
            const dbfRecord = dbfRecords[index];
            
            // 保留原有属性，使用 DBF 属性进行补充和覆盖
            // 过滤危险字段名防止原型链污染（__proto__ / constructor 等）
            const safeValues: Record<string, any> = Object.create(null);
            for (const key of Object.keys(dbfRecord.values)) {
                if (key === '__proto__' || key === 'constructor' || key === '__defineGetter__') continue;
                safeValues[key] = dbfRecord.values[key];
            }
            feature.properties = {
                ...feature.properties,
                ...safeValues,
                _dbf_fields: dbfData.fields.map(f => f.name),
                _dbf_encoding: dbfData.encoding,
            };
            
            const newPropsCount = Object.keys(dbfRecord.values).length;
            if (newPropsCount > 0) {
                successCount += 1;
            }
        } else if (index < features.length) {
            // feature 数量超过 DBF 记录数，记录警告
            mismatchWarnings += 1;
        }
    });

    if (mismatchWarnings > 0) {
        console.warn(
            `[SHP] ${mismatchWarnings} 个 feature 没有对应的 DBF 记录\n` +
            `feature 总数: ${features.length}, DBF 记录数: ${dbfRecords.length}`
        );
    }

    console.warn(
        `[SHP] 属性增强完成：${successCount}/${features.length} 个 feature 获得 DBF 属性\n` +
        `字段数: ${dbfData.fields.length}, 编码: ${dbfData.encoding}`
    );

    return featureCollection;
}
