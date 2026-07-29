/**
 * GIS 数据格式分发器
 *
 * 根据输入格式（ZIP/KMZ/KML/SHP/GeoJSON/TIFF）路由到对应的解析流程。
 * 原 696 行已拆分：
 *   archiveProcessor.js — 归档解包、SHP 分组、资源 URL 管理
 *   shpPacketBuilder.js — 浏览器文件列表的 SHP 包构建
 */

import { decompressBuffer, detectMagicType } from './decompressFile.js';
import { detectGeoJsonProjection, detectKmlProjectionHint, resolveProjectionOrDefault } from './crsAware.js';
import { buildArchivePackets, decodeBufferToText, parseGeoJsonContent, setDispatchGisData } from './archiveProcessor.js';

export { revokeAllBlobUrls } from './archiveProcessor.js';
export { buildShpPacketsFromBrowserFiles } from './shpPacketBuilder.js';

function normalizeType(type, name = '') {
    const normalizedType = String(type || '').toLowerCase();
    const filename = String(name || '')
        .trim()
        .toLowerCase();
    const ext = filename.includes('.') ? filename.split('.').pop() : '';

    if (ext === 'kmz') return 'kmz';
    if (ext === 'kml') return 'kml';
    if (ext === 'zip') return 'zip';
    if (ext === 'shp') return 'shp';
    if (ext === 'tif' || ext === 'tiff') return ext;
    if (ext === 'geojson' || ext === 'json') return ext;
    return normalizedType;
}

export async function dispatchGisData(input = {}) {
    const { content, type, name = '' } = input;
    const warnings = [];
    const blobUrls = [];
    const errors = [];

    const normalizedType = normalizeType(type, name);
    const topMagic = content instanceof ArrayBuffer ? detectMagicType(content) : 'unknown';
    const shouldDecompress =
        normalizedType === 'zip' || normalizedType === 'kmz' || topMagic === 'zip';

    if (shouldDecompress) {
        if (!(content instanceof ArrayBuffer)) {
            throw new Error('压缩包解析失败：请上传 ArrayBuffer 类型数据');
        }

        const archive = await decompressBuffer(content);
        const batchResult = await buildArchivePackets({
            archive,
            sourceType: normalizedType,
            sourceName: name,
        });

        warnings.push(...batchResult.warnings);
        blobUrls.push(...batchResult.blobUrls);
        errors.push(...batchResult.errors);

        if (!batchResult.packets.length) {
            if (errors.length) {
                const detail = errors
                    .map((item) => `${item.entryName}: ${item.message}`)
                    .join('; ');
                throw new Error(`压缩包中未导入任何有效数据集。${detail}`);
            }
            throw new Error('压缩包中未识别到有效 GIS 数据集');
        }

        return {
            packet: batchResult.packets[0],
            packets: batchResult.packets,
            warnings,
            errors,
            blobUrls,
            resourcePool: batchResult.resourcePool,
            summary: batchResult.summary,
        };
    }

    if (normalizedType === 'kml') {
        const kmlText = typeof content === 'string' ? content : decodeBufferToText(content);
        const projectionResolved = await resolveProjectionOrDefault(
            detectKmlProjectionHint(kmlText),
            'KML',
        );
        if (projectionResolved.warning) warnings.push(projectionResolved.warning);

        const packet = {
            kind: 'kml',
            sourceType: normalizedType,
            entryName: name,
            kmlString: kmlText,
            dataProjection: projectionResolved.projection,
            needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(
                String(projectionResolved.projection || '').toUpperCase(),
            ),
        };
        return {
            packet,
            packets: [packet],
            warnings,
            errors,
            blobUrls,
            summary: {
                detectedDatasets: 1,
                importedDatasets: 1,
                failedDatasets: 0,
                byType: { kml: 1, kmz: 0, shp: 0, tiff: 0, geojson: 0 },
            },
        };
    }

    if (normalizedType === 'shp') {
        throw new Error(
            '检测到单独 .shp 文件。请按同名文件组上传（至少 .shp，可选 .dbf/.shx/.prj/.cpg）或使用 ZIP。',
        );
    }

    if (normalizedType === 'geojson' || normalizedType === 'json') {
        const geojsonData = parseGeoJsonContent(content);
        const projectionResolved = await detectGeoJsonProjection(geojsonData);
        if (projectionResolved.warning) warnings.push(projectionResolved.warning);

        const packet = {
            kind: 'geojson',
            sourceType: normalizedType,
            entryName: name,
            geojsonData,
            dataProjection: projectionResolved.projection,
            needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(
                String(projectionResolved.projection || '').toUpperCase(),
            ),
        };
        return {
            packet,
            packets: [packet],
            warnings,
            errors,
            blobUrls,
            summary: {
                detectedDatasets: 1,
                importedDatasets: 1,
                failedDatasets: 0,
                byType: { kml: 0, kmz: 0, shp: 0, tiff: 0, geojson: 1 },
            },
        };
    }

    if (
        (normalizedType === 'tif' || normalizedType === 'tiff' || topMagic === 'tiff') &&
        content instanceof ArrayBuffer
    ) {
        const blob = new Blob([content], { type: 'image/tiff' });
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.push(blobUrl);

        const packet = {
            kind: 'tiff',
            sourceType: normalizedType || 'tiff',
            entryName: name,
            arrayBuffer: content,
            blob,
            blobUrl,
        };
        return {
            packet,
            packets: [packet],
            warnings,
            errors,
            blobUrls,
            summary: {
                detectedDatasets: 1,
                importedDatasets: 1,
                failedDatasets: 0,
                byType: { kml: 0, kmz: 0, shp: 0, tiff: 1, geojson: 0 },
            },
        };
    }

    throw new Error('不支持的文件格式');
}

// 延迟注入递归引用，避免循环依赖（函数声明已提升，此处赋值安全）
setDispatchGisData(dispatchGisData);
