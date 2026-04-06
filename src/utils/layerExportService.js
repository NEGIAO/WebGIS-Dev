/**
 * Layer Export Service
 * 独立的图层坐标导出服务，支持多种格式（CSV/TXT/GeoJSON）
 * 负责顶点收集、文件生成、下载等核心逻辑
 */

/**
 * 递归收集 WGS84 几何体的所有顶点
 * 支持 Point/MultiPoint/LineString/MultiLineString/Polygon/MultiPolygon/GeometryCollection
 */
export function collectVerticesFromLonLatGeometry(geometry) {
    const type = String(geometry?.getType?.() || 'Unknown');
    const vertices = [];

    const pushVertex = (coord, { partIndex = 1, ringIndex = 0, vertexIndex = 1 } = {}) => {
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
            vertexIndex
        });
    };

    if (type === 'Point') {
        pushVertex(geometry.getCoordinates?.(), { partIndex: 1, ringIndex: 0, vertexIndex: 1 });
        return vertices;
    }

    if (type === 'MultiPoint') {
        const coords = geometry.getCoordinates?.() || [];
        coords.forEach((coord, idx) => {
            pushVertex(coord, { partIndex: idx + 1, ringIndex: 0, vertexIndex: 1 });
        });
        return vertices;
    }

    if (type === 'LineString') {
        const coords = geometry.getCoordinates?.() || [];
        coords.forEach((coord, idx) => {
            pushVertex(coord, { partIndex: 1, ringIndex: 0, vertexIndex: idx + 1 });
        });
        return vertices;
    }

    if (type === 'MultiLineString') {
        const lines = geometry.getCoordinates?.() || [];
        lines.forEach((lineCoords, lineIdx) => {
            (lineCoords || []).forEach((coord, coordIdx) => {
                pushVertex(coord, { partIndex: lineIdx + 1, ringIndex: 0, vertexIndex: coordIdx + 1 });
            });
        });
        return vertices;
    }

    if (type === 'Polygon') {
        const rings = geometry.getCoordinates?.() || [];
        rings.forEach((ringCoords, ringIdx) => {
            (ringCoords || []).forEach((coord, coordIdx) => {
                pushVertex(coord, { partIndex: 1, ringIndex: ringIdx + 1, vertexIndex: coordIdx + 1 });
            });
        });
        return vertices;
    }

    if (type === 'MultiPolygon') {
        const polygons = geometry.getCoordinates?.() || [];
        polygons.forEach((polygonCoords, polygonIdx) => {
            (polygonCoords || []).forEach((ringCoords, ringIdx) => {
                (ringCoords || []).forEach((coord, coordIdx) => {
                    pushVertex(coord, {
                        partIndex: polygonIdx + 1,
                        ringIndex: ringIdx + 1,
                        vertexIndex: coordIdx + 1
                    });
                });
            });
        });
        return vertices;
    }

    if (type === 'GeometryCollection') {
        const geometries = geometry.getGeometriesArray?.() || [];
        let partCursor = 1;
        geometries.forEach((subGeometry) => {
            const subVertices = collectVerticesFromLonLatGeometry(subGeometry);
            if (!subVertices.length) {
                partCursor += 1;
                return;
            }
            const maxPartIndex = Math.max(...subVertices.map(v => Number(v.partIndex) || 1));
            subVertices.forEach((v) => {
                vertices.push({
                    ...v,
                    partIndex: Number(v.partIndex) + partCursor - 1
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
export function collectFeatureVertices(feature) {
    const geometry = feature?.getGeometry?.();
    if (!geometry || typeof geometry.clone !== 'function') return [];

    const lonLatGeometry = geometry.clone();
    lonLatGeometry.transform('EPSG:3857', 'EPSG:4326');
    return collectVerticesFromLonLatGeometry(lonLatGeometry);
}

/**
 * 将字节数转换为可读的文件大小格式（B/KB/MB）
 */
export function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 清理文件名中的非法字符
 */
export function sanitizeExportFileName(name) {
    const base = String(name || 'layer').trim() || 'layer';
    return base.replace(/[\\/:*?"<>|]+/g, '_');
}

/**
 * 将值转换为 CSV 单元格格式（处理引号和逗号）
 */
export function toCsvCell(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

/**
 * 触发文本文件下载并返回文件大小
 */
export function triggerTextDownload(fileName, content, mimeType) {
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
 * 获取要素的显示名称（用于导出）
 */
export function getFeatureNameForExport(feature, fallbackName) {
    const candidates = [
        feature?.get?.('名称'),
        feature?.get?.('name'),
        feature?.get?.('Name'),
        feature?.get?.('NAME'),
        fallbackName
    ];
    const hit = candidates.find(item => String(item || '').trim().length > 0);
    return String(hit || fallbackName || '未命名要素');
}

/**
 * 验证图层是否为矢量图层
 */
export function isVectorManagedLayer(layerData) {
    const source = layerData?.layer?.getSource?.();
    return !!source && typeof source.getFeatures === 'function';
}

/**
 * 导出图层坐标
 * CSV/TXT：折点导出（每条顶点一行）
 * GeoJSON：保持原始几何（Point/LineString/Polygon等）
 */
export function createLayerExporter({ message, gcj02ToWgs84, wgs84ToGcj02 }) {
    return function exportLayerCoordinates(payload, { userDataLayers }) {
        if (!payload?.layerId) return;

        const layerData = userDataLayers.find(item => item.id === payload.layerId);
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
        const format = ['csv', 'txt', 'geojson'].includes(rawFormat) ? rawFormat : 'csv';
        const currentCrs = String(layerData.metadata?.crs || 'wgs84').toLowerCase();
        const safeName = sanitizeExportFileName(layerData.name || 'layer');
        let content = '';
        let fileName = '';
        let mimeType = '';

        // GeoJSON 保持原始几何导出
        if (format === 'geojson') {
            const geojsonFeatures = [];
            features.forEach((feature, index) => {
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
                        ID: featureId,
                        名称: name,
                        几何类型: geomType || '未知',
                        坐标系: currentCrs
                    },
                    geometry: {
                        type: geomType || 'Point',
                        coordinates: coordinates
                    }
                });
            });

            const geojson = {
                type: 'FeatureCollection',
                metadata: {
                    crs: currentCrs,
                    sourceLayerId: layerData.id,
                    sourceLayerName: layerData.name,
                    featureCount: geojsonFeatures.length,
                    generatedAt: new Date().toISOString()
                },
                features: geojsonFeatures
            };

            content = JSON.stringify(geojson, null, 2);
            fileName = `${safeName}_${currentCrs}.geojson`;
            mimeType = 'application/geo+json;charset=utf-8';

            const fileSize = triggerTextDownload(fileName, content, mimeType);

            if (fileSize > 2 * 1024 * 1024) {
                message.warning(`导出文件较大：${formatBytes(fileSize)}，若浏览器卡顿可先筛选图层或减少要素后再导出`);
            }

            message.success(`已导出 ${geojsonFeatures.length} 个要素（${format.toUpperCase()} / ${currentCrs.toUpperCase()} / ${formatBytes(fileSize)}）`);
            return;
        }

        // CSV 和 TXT 使用折点导出
        const exportRows = [];
        features.forEach((feature, index) => {
            const rowId = index + 1;
            const name = getFeatureNameForExport(feature, `${layerData.name}_${rowId}`);
            const vertices = collectFeatureVertices(feature);

            if (!vertices.length) return;
            vertices.forEach((vertex) => {
                exportRows.push({
                    id: rowId,
                    lon: vertex.lon,
                    lat: vertex.lat,
                    name,
                    geometryType: vertex.geometryType,
                    partIndex: vertex.partIndex,
                    ringIndex: vertex.ringIndex,
                    vertexIndex: vertex.vertexIndex
                });
            });
        });

        if (!exportRows.length) {
            message.warning('图层中没有可导出的有效坐标');
            return;
        }

        if (format === 'csv') {
            const lines = ['ID,经度,纬度,名称,几何类型,部件,环,点序号'];
            exportRows.forEach((row) => {
                lines.push([
                    row.id,
                    row.lon,
                    row.lat,
                    row.name,
                    row.geometryType,
                    row.partIndex,
                    row.ringIndex,
                    row.vertexIndex
                ].map(toCsvCell).join(','));
            });
            content = `\uFEFF${lines.join('\n')}`;
            fileName = `${safeName}_${currentCrs}.csv`;
            mimeType = 'text/csv;charset=utf-8';
        } else if (format === 'txt') {
            const lines = ['ID\t经度\t纬度\t名称\t几何类型\t部件\t环\t点序号'];
            exportRows.forEach((row) => {
                lines.push(`${row.id}\t${row.lon}\t${row.lat}\t${row.name}\t${row.geometryType}\t${row.partIndex}\t${row.ringIndex}\t${row.vertexIndex}`);
            });
            content = lines.join('\n');
            fileName = `${safeName}_${currentCrs}.txt`;
            mimeType = 'text/plain;charset=utf-8';
        }

        const fileSize = triggerTextDownload(fileName, content, mimeType);

        if (fileSize > 2 * 1024 * 1024) {
            message.warning(`导出文件较大：${formatBytes(fileSize)}，若浏览器卡顿可先筛选图层或减少要素后再导出`);
        }

        message.success(`已导出 ${exportRows.length} 条折点记录（${format.toUpperCase()} / ${currentCrs.toUpperCase()} / ${formatBytes(fileSize)}）`);
    };
}
