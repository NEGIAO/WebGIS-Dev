/**
 * Layer Export Service
 * 图层数据导出服务（CSV / TXT / GeoJSON / KML）
 * 只负责：定位图层 → 取要素 → 按格式分支 → 交格式化工具与下载；
 * 顶点展开、文本格式、下载等纯函数见 `exportFormatting.ts`。
 */

import WKT from 'ol/format/WKT';
import { exportFeaturesAsKml } from '@common/layer-tree';
import {
    FIXED_EXPORT_COLUMNS,
    collectAttributeColumns,
    collectFeatureVertices,
    formatAttributeValue,
    formatBytes,
    getFeatureNameForExport,
    sanitizeExportFileName,
    stripGeometryFromProperties,
    toCsvCell,
    triggerTextDownload,
} from './exportFormatting';
/**
 * 验证图层是否为矢量图层
 */
export function isVectorManagedLayer(layerData: any): boolean {
    const source = layerData?.layer?.getSource?.();
    return !!source && typeof source.getFeatures === 'function';
}

/**
 * 导出图层坐标
 * CSV/TXT：折点导出（每条顶点一行）
 * GeoJSON/KML：保持原始几何导出（Point/LineString/Polygon等）
 */
export interface LayerExporterDeps {
    message: any;
    gcj02ToWgs84?: (...args: any[]) => any;
    wgs84ToGcj02?: (...args: any[]) => any;
}

export function createLayerExporter({ message }: LayerExporterDeps) {
    return function exportLayerCoordinates(payload: any, { userDataLayers }: { userDataLayers: any[] }) {
        if (!payload?.layerId) return;

        const layerData = userDataLayers.find((item: any) => item.id === payload.layerId);
        if (!layerData) {
            message.warning('未找到目标图层');
            return;
        }

        if (!isVectorManagedLayer(layerData)) {
            message.warning('该图层不是矢量图层，无法导出坐标');
            return;
        }

        const source = layerData.layer?.getSource?.();
        const features = source?.getFeatures?.() || [];
        if (!features.length) {
            message.warning('图层中没有可导出的要素');
            return;
        }

        const rawFormat = String(payload.format || 'csv').toLowerCase();
        const format = ['csv', 'txt', 'geojson', 'kml'].includes(rawFormat) ? rawFormat : 'csv';
        const currentCrs = String(layerData.metadata?.crs || 'wgs84').toLowerCase();
        const safeName = sanitizeExportFileName(layerData.name || 'layer');
        let content = '';
        let fileName = '';
        let mimeType = '';

        if (format === 'kml') {
            const kmlResult = exportFeaturesAsKml({
                features,
                layerId: layerData.id,
                layerName: layerData.name || 'layer',
                sourceCrs: currentCrs,
                featureProjection: 'EPSG:3857',
                dataProjection: 'EPSG:4326',
                decimals: 6,
                triggerDownload: true,
            });

            if (!kmlResult.featureCount) {
                message.warning('图层中没有可导出的有效几何');
                return;
            }
            const fileSize = Number(kmlResult.sizeBytes) || 0;

            if (fileSize > 2 * 1024 * 1024) {
                message.warning(
                    `导出文件较大：${formatBytes(fileSize)}，若浏览器卡顿可先筛选图层或减少要素后再导出`,
                );
            }

            message.success(
                `已导出 ${kmlResult.featureCount} 个要素（KML / ${currentCrs.toUpperCase()} / ${formatBytes(fileSize)}）`,
            );
            return;
        }

        // GeoJSON 保持原始几何导出
        if (format === 'geojson') {
            const geojsonFeatures: any[] = [];
            features.forEach((feature: any, index: number) => {
                const featureId = index + 1;
                const name = getFeatureNameForExport(feature, `${layerData.name}_${featureId}`);
                const geometry = feature?.getGeometry?.();
                if (!geometry) return;

                const lonLatGeometry = geometry.clone();
                lonLatGeometry.transform('EPSG:3857', 'EPSG:4326');
                const geomType = geometry.getType?.();

                let coordinates;
                if (geomType === 'Point') {
                    coordinates = lonLatGeometry.getCoordinates();
                } else if (geomType === 'MultiPoint' || geomType === 'LineString') {
                    coordinates = lonLatGeometry.getCoordinates();
                } else if (geomType === 'MultiLineString' || geomType === 'Polygon') {
                    coordinates = lonLatGeometry.getCoordinates();
                } else if (geomType === 'MultiPolygon') {
                    coordinates = lonLatGeometry.getCoordinates();
                } else {
                    coordinates = [];
                }

                geojsonFeatures.push({
                    type: 'Feature',
                    properties: {
                        // 原要素属性优先带出（如 height_m/tile），缺了 Cesium 侧白模就没高度
                        ...stripGeometryFromProperties(feature),
                        ID: featureId,
                        名称: name,
                        几何类型: geomType || '未知',
                        坐标系: currentCrs,
                    },
                    geometry: {
                        type: geomType || 'Point',
                        coordinates: coordinates,
                    },
                });
            });

            const geojson = {
                type: 'FeatureCollection',
                metadata: {
                    crs: currentCrs,
                    sourceLayerId: layerData.id,
                    sourceLayerName: layerData.name,
                    featureCount: geojsonFeatures.length,
                    generatedAt: new Date().toISOString(),
                },
                features: geojsonFeatures,
            };

            content = JSON.stringify(geojson, null, 2);
            fileName = `${safeName}_${currentCrs}.geojson`;
            mimeType = 'application/geo+json;charset=utf-8';

            const fileSize = triggerTextDownload(fileName, content, mimeType);

            if (fileSize > 2 * 1024 * 1024) {
                message.warning(
                    `导出文件较大：${formatBytes(fileSize)}，若浏览器卡顿可先筛选图层或减少要素后再导出`,
                );
            }

            message.success(
                `已导出 ${geojsonFeatures.length} 个要素（${format.toUpperCase()} / ${currentCrs.toUpperCase()} / ${formatBytes(fileSize)}）`,
            );
            return;
        }

        // CSV 和 TXT 使用折点导出：固定列（几何定位）+ 属性列（图层已有字段的并集）。
        // 原实现只写固定 8 列，建筑的高度 / 楼层等业务属性全部丢失。
        const attributeColumns = collectAttributeColumns(features);
        const exportRows: any[] = [];
        features.forEach((feature: any, index: number) => {
            const rowId = index + 1;
            const name = getFeatureNameForExport(feature, `${layerData.name}_${rowId}`);
            const vertices = collectFeatureVertices(feature);

            if (!vertices.length) return;
            // 同一要素的所有顶点共享一份属性快照（折点行只是几何展开）
            const attributes = stripGeometryFromProperties(feature);
            vertices.forEach((vertex) => {
                exportRows.push({
                    id: rowId,
                    lon: vertex.lon,
                    lat: vertex.lat,
                    name,
                    geometryType: vertex.geometryType,
                    partIndex: vertex.partIndex,
                    ringIndex: vertex.ringIndex,
                    vertexIndex: vertex.vertexIndex,
                    attributes,
                });
            });
        });

        if (!exportRows.length) {
            message.warning('图层中没有可导出的有效坐标');
            return;
        }

        if (format === 'csv') {
            const header = [...FIXED_EXPORT_COLUMNS, ...attributeColumns];
            const lines = [header.map(toCsvCell).join(',')];
            exportRows.forEach((row) => {
                lines.push(
                    [
                        row.id,
                        row.lon,
                        row.lat,
                        row.name,
                        row.geometryType,
                        row.partIndex,
                        row.ringIndex,
                        row.vertexIndex,
                        ...attributeColumns.map((key) => formatAttributeValue(row.attributes?.[key])),
                    ]
                        .map(toCsvCell)
                        .join(','),
                );
            });
            content = `\uFEFF${lines.join('\n')}`;
            fileName = `${safeName}_${currentCrs}.csv`;
            mimeType = 'text/csv;charset=utf-8';
        } else if (format === 'txt') {
            // TXT 输出标准 WKT（OGC 文本格式，QGIS / ArcGIS / PostGIS 可直接识别），
            // 不再输出纯坐标 —— 纯坐标没有几何类型与属性，外部工具与本系统都无法回读。
            const wktFormat = new WKT();
            const lines: string[] = [];
            features.forEach((feature: any, index: number) => {
                const geometry = feature?.getGeometry?.();
                if (!geometry) return;
                const name = getFeatureNameForExport(feature, `${layerData.name}_${index + 1}`);
                lines.push(`# @name=${String(name).replace(/[\r\n]+/g, ' ')}`);
                const attrs = stripGeometryFromProperties(feature);
                Object.entries(attrs).forEach(([key, value]) => {
                    if (/^(name|Name|NAME|名称)$/.test(key)) return; // 已作为 # @name 输出
                    lines.push(`# @${key}=${formatAttributeValue(value).replace(/[\r\n]+/g, ' ')}`);
                });
                let wkt;
                try {
                    wkt = wktFormat.writeGeometry(geometry, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: 'EPSG:3857',
                    });
                } catch {
                    return;
                }
                lines.push(wkt, '');
            });
            if (!lines.length) {
                message.warning('图层中没有可导出的有效几何');
                return;
            }
            content = lines.join('\n');
            fileName = `${safeName}_${currentCrs}.txt`;
            mimeType = 'text/plain;charset=utf-8';
        }

        const fileSize = triggerTextDownload(fileName, content, mimeType);

        if (fileSize > 2 * 1024 * 1024) {
            message.warning(
                `导出文件较大：${formatBytes(fileSize)}，若浏览器卡顿可先筛选图层或减少要素后再导出`,
            );
        }

        message.success(
            `已导出 ${exportRows.length} 条折点记录（${format.toUpperCase()} / ${currentCrs.toUpperCase()} / ${formatBytes(fileSize)}）`,
        );
    };
}