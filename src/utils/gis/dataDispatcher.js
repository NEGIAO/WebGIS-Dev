import { decompressBuffer, detectMagicType } from './decompressFile.js';
import { detectGeoJsonProjection, detectKmlProjectionHint, detectShpProjectionFromPrj, resolveProjectionOrDefault } from './crsAware.js';
import { buildResourcePool, classifyArchiveDatasets } from './batchProcessor.js';

const RESOURCE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'css', 'js', 'html', 'htm']);
const SHP_EXTENSIONS = new Set(['shp', 'dbf', 'shx', 'prj', 'cpg']);

function normalizeType(type, name = '') {
    const normalizedType = String(type || '').toLowerCase();
    const filename = String(name || '').trim().toLowerCase();
    const ext = filename.includes('.') ? filename.split('.').pop() : '';

    if (ext === 'kmz') return 'kmz';
    if (ext === 'kml') return 'kml';
    if (ext === 'zip') return 'zip';
    if (ext === 'shp') return 'shp';
    if (ext === 'tif' || ext === 'tiff') return ext;
    if (ext === 'geojson' || ext === 'json') return ext;
    return normalizedType;
}

function decodeBufferToText(buffer) {
    if (!(buffer instanceof ArrayBuffer)) return '';
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    if (!utf8.includes('\uFFFD')) return utf8;
    try {
        return new TextDecoder('gbk', { fatal: false }).decode(buffer);
    } catch {
        return utf8;
    }
}

function normalizePath(path = '') {
    return String(path || '').replace(/\\/g, '/').replace(/^\.\/?/, '').trim();
}

function extOf(path = '') {
    const normalized = normalizePath(path).toLowerCase();
    const idx = normalized.lastIndexOf('.');
    if (idx < 0 || idx === normalized.length - 1) return '';
    return normalized.slice(idx + 1);
}

function stemOf(path = '') {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('.');
    if (idx < 0) return normalized;
    return normalized.slice(0, idx);
}

function nameStemOf(path = '') {
    const normalized = normalizePath(path);
    const base = normalized.split('/').pop() || normalized;
    const idx = base.lastIndexOf('.');
    if (idx < 0) return base;
    return base.slice(0, idx);
}

function groupShpEntriesByBaseName(entries = []) {
    const groups = new Map();

    for (const entry of entries) {
        const rawPath = normalizePath(entry?.path || entry?.name || '');
        if (!rawPath) continue;

        const extension = String(entry?.extension || extOf(rawPath)).toLowerCase();
        if (!SHP_EXTENSIONS.has(extension)) continue;

        const key = stemOf(rawPath).toLowerCase();
        const current = groups.get(key) || {
            key,
            stem: nameStemOf(rawPath),
            shpEntry: null,
            dbfEntry: null,
            shxEntry: null,
            prjEntry: null,
            cpgEntry: null
        };

        const normalizedEntry = {
            ...entry,
            path: rawPath,
            extension
        };

        if (extension === 'shp') current.shpEntry = normalizedEntry;
        if (extension === 'dbf') current.dbfEntry = normalizedEntry;
        if (extension === 'shx') current.shxEntry = normalizedEntry;
        if (extension === 'prj') current.prjEntry = normalizedEntry;
        if (extension === 'cpg') current.cpgEntry = normalizedEntry;

        groups.set(key, current);
    }

    const warnings = [];
    const tasks = [];

    for (const group of groups.values()) {
        if (group.shpEntry && !group.dbfEntry) {
            warnings.push(`${group.shpEntry.path}: 缺少同名 .dbf，将按几何数据继续解析（属性字段可能为空）。`);
        }
        if (!group.shpEntry && group.dbfEntry) {
            warnings.push(`${group.dbfEntry.path}: 检测到单独 .dbf，缺少同名 .shp，已跳过该任务。`);
            continue;
        }
        if (!group.shpEntry) continue;

        if (!group.shxEntry) {
            warnings.push(`${group.shpEntry.path}: 缺少 .shx，将继续尝试导入。`);
        }
        if (!group.prjEntry) {
            warnings.push(`${group.shpEntry.path}: 缺少 .prj，尝试按 WGS84（EPSG:4326）渲染。`);
        }

        tasks.push(group);
    }

    return { tasks, warnings, groups };
}

function groupBrowserFilesByBaseName(files = []) {
    const groups = new Map();

    for (const file of files || []) {
        if (!file) continue;
        const rawPath = normalizePath(file.webkitRelativePath || file.name || '');
        if (!rawPath) continue;

        const extension = extOf(rawPath);
        if (!SHP_EXTENSIONS.has(extension)) continue;

        const key = stemOf(rawPath).toLowerCase();
        const current = groups.get(key) || {
            key,
            stem: nameStemOf(rawPath),
            shp: null,
            dbf: null,
            shx: null,
            prj: null,
            cpg: null
        };

        if (extension === 'shp') current.shp = file;
        if (extension === 'dbf') current.dbf = file;
        if (extension === 'shx') current.shx = file;
        if (extension === 'prj') current.prj = file;
        if (extension === 'cpg') current.cpg = file;

        groups.set(key, current);
    }

    return groups;
}

export async function buildShpPacketsFromBrowserFiles(files = [], options = {}) {
    const grouped = groupBrowserFilesByBaseName(files);
    const packets = [];
    const warnings = [];

    for (const group of grouped.values()) {
        if (!group.shp) {
            warnings.push(`${group.stem}: 缺少 .shp，已跳过该任务。`);
            continue;
        }
        if (!group.dbf) {
            warnings.push(`${group.stem}: 缺少 .dbf，将按几何数据继续解析（属性字段可能为空）。`);
        }

        // 在解析前先并行读取 buffer/text，确保 PRJ 文本就绪。
        const [shpBuffer, dbfBuffer, shxBuffer, prjBuffer, cpgBuffer, prjUtf8Text, cpgUtf8Text] = await Promise.all([
            group.shp.arrayBuffer(),
            group.dbf?.arrayBuffer?.() ?? Promise.resolve(undefined),
            group.shx?.arrayBuffer?.() ?? Promise.resolve(undefined),
            group.prj?.arrayBuffer?.() ?? Promise.resolve(undefined),
            group.cpg?.arrayBuffer?.() ?? Promise.resolve(undefined),
            group.prj?.text?.() ?? Promise.resolve(''),
            group.cpg?.text?.() ?? Promise.resolve('')
        ]);

        const prjText = prjBuffer ? decodeBufferToText(prjBuffer).trim() : String(prjUtf8Text || '').trim();
        const cpgText = cpgBuffer ? decodeBufferToText(cpgBuffer).trim() : String(cpgUtf8Text || '').trim();
        const projectionResolved = await detectShpProjectionFromPrj(prjText);
        if (!group.prj) {
            warnings.push(`${group.stem}: 缺少 .prj，尝试按 WGS84（EPSG:4326）渲染。`);
        } else if (projectionResolved.warning) {
            warnings.push(`${group.stem}: ${projectionResolved.warning}`);
        }

        packets.push({
            kind: 'shp',
            sourceType: options.sourceType || 'browser-files',
            sourceName: options.sourceName || 'browser-file-list',
            entryName: `${group.stem}.shp`,
            dataProjection: projectionResolved.projection,
            needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(String(projectionResolved.projection || '').toUpperCase()),
            shpParts: {
                shp: shpBuffer,
                dbf: dbfBuffer,
                shx: shxBuffer,
                prj: prjBuffer,
                cpg: cpgBuffer,
                prjText,
                cpgText
            }
        });
    }

    return {
        grouped,
        packets,
        warnings,
        taskCount: packets.length,
        groupCount: grouped.size
    };
}

function parseGeoJsonContent(content) {
    if (typeof content === 'string') return JSON.parse(content);
    if (typeof content === 'object' && content) return content;
    throw new Error('GeoJSON 内容无效');
}

function buildSummary(tasks, packets, errors) {
    return {
        detectedDatasets: tasks.datasetCount,
        importedDatasets: packets.length,
        failedDatasets: errors.length,
        byType: {
            kml: tasks.kmlTasks.length,
            kmz: tasks.kmzTasks.length,
            shp: tasks.shpTasks.length,
            tiff: tasks.tiffTasks.length,
            geojson: tasks.geoJsonTasks.length
        }
    };
}

async function buildArchivePackets({ archive, sourceType, sourceName }) {
    const warnings = [];
    const errors = [];
    const packets = [];
    const blobUrls = [];

    const resourcePool = buildResourcePool(archive.entries);
    const tasks = classifyArchiveDatasets(archive.entries);
    const shpGrouping = groupShpEntriesByBaseName(archive.entries);
    if (Array.isArray(shpGrouping.warnings) && shpGrouping.warnings.length) {
        warnings.push(...shpGrouping.warnings);
    }
    const resources = buildResourceBlobUrls(archive.entries);
    blobUrls.push(...resources.urls);

    for (const task of tasks.kmlTasks) {
        try {
            const kmlText = decodeBufferToText(task.entry.buffer);
            const projectionResolved = await resolveProjectionOrDefault(detectKmlProjectionHint(kmlText), 'KML/KMZ');
            if (projectionResolved.warning) warnings.push(`${task.entry.path}: ${projectionResolved.warning}`);

            packets.push({
                kind: 'kml',
                sourceType,
                sourceName,
                entryName: task.entry.path,
                kmlString: kmlText,
                dataProjection: projectionResolved.projection,
                needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(String(projectionResolved.projection || '').toUpperCase())
            });
        } catch (error) {
            errors.push({ entryName: task.entry.path, kind: 'kml', message: error?.message || String(error) });
        }
    }

    for (const task of tasks.kmzTasks) {
        try {
            const nested = await dispatchGisData({
                content: task.entry.buffer,
                type: 'kmz',
                name: task.entry.path
            });

            if (Array.isArray(nested.warnings)) warnings.push(...nested.warnings);
            if (Array.isArray(nested.errors)) errors.push(...nested.errors);
            if (Array.isArray(nested.blobUrls)) blobUrls.push(...nested.blobUrls);
            if (Array.isArray(nested.packets)) packets.push(...nested.packets);
        } catch (error) {
            errors.push({ entryName: task.entry.path, kind: 'kmz', message: error?.message || String(error) });
        }
    }

    for (const task of shpGrouping.tasks) {
        try {
            const prjText = task.prjEntry ? decodeBufferToText(task.prjEntry.buffer) : '';
            const cpgText = task.cpgEntry ? decodeBufferToText(task.cpgEntry.buffer) : '';
            const projectionResolved = await detectShpProjectionFromPrj(prjText);

            if (task.prjEntry && projectionResolved.warning) {
                warnings.push(`${task.shpEntry.path}: ${projectionResolved.warning}`);
            }

            packets.push({
                kind: 'shp',
                sourceType,
                sourceName,
                entryName: task.shpEntry.path,
                dataProjection: projectionResolved.projection,
                needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(String(projectionResolved.projection || '').toUpperCase()),
                shpParts: {
                    shp: task.shpEntry.buffer,
                    shx: task.shxEntry?.buffer,
                    dbf: task.dbfEntry?.buffer,
                    prj: task.prjEntry?.buffer,
                    cpg: task.cpgEntry?.buffer,
                    prjText,
                    cpgText
                },
                resourcePool,
                resources: resources.resources
            });
        } catch (error) {
            errors.push({ entryName: task.shpEntry?.path || task.stem, kind: 'shp', message: error?.message || String(error) });
        }
    }

    for (const task of tasks.tiffTasks) {
        try {
            const blob = new Blob([task.entry.buffer], { type: 'image/tiff' });
            const blobUrl = URL.createObjectURL(blob);
            blobUrls.push(blobUrl);

            packets.push({
                kind: 'tiff',
                sourceType,
                sourceName,
                entryName: task.entry.path,
                arrayBuffer: task.entry.buffer,
                blob,
                blobUrl
            });
        } catch (error) {
            errors.push({ entryName: task.entry.path, kind: 'tiff', message: error?.message || String(error) });
        }
    }

    for (const task of tasks.geoJsonTasks) {
        try {
            const text = decodeBufferToText(task.entry.buffer);
            const geojsonData = parseGeoJsonContent(text);
            const projectionResolved = await detectGeoJsonProjection(geojsonData);
            if (projectionResolved.warning) warnings.push(`${task.entry.path}: ${projectionResolved.warning}`);

            packets.push({
                kind: 'geojson',
                sourceType,
                sourceName,
                entryName: task.entry.path,
                geojsonData,
                dataProjection: projectionResolved.projection,
                needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(String(projectionResolved.projection || '').toUpperCase()),
                resourcePool,
                resources: resources.resources
            });
        } catch (error) {
            errors.push({ entryName: task.entry.path, kind: 'geojson', message: error?.message || String(error) });
        }
    }

    return {
        packets,
        warnings,
        errors,
        blobUrls,
        resourcePool,
        summary: buildSummary({
            ...tasks,
            shpTasks: shpGrouping.tasks,
            datasetCount: tasks.kmlTasks.length + tasks.kmzTasks.length + shpGrouping.tasks.length + tasks.tiffTasks.length + tasks.geoJsonTasks.length
        }, packets, errors)
    };
}

function guessMimeByPath(path) {
    const lower = String(path || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.css')) return 'text/css';
    if (lower.endsWith('.js')) return 'application/javascript';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
    return 'application/octet-stream';
}

function buildResourceBlobUrls(entries) {
    const urls = [];
    const resources = [];
    for (const item of entries) {
        if (!RESOURCE_EXTENSIONS.has(item.extension)) continue;
        const blob = new Blob([item.buffer], { type: guessMimeByPath(item.path) });
        const blobUrl = URL.createObjectURL(blob);
        urls.push(blobUrl);
        resources.push({ path: item.path, blobUrl, mimeType: blob.type });
    }
    return { urls, resources };
}

export async function dispatchGisData(input = {}) {
    const { content, type, name = '' } = input;
    const warnings = [];
    const blobUrls = [];
    const errors = [];

    const normalizedType = normalizeType(type, name);
    const topMagic = content instanceof ArrayBuffer ? detectMagicType(content) : 'unknown';
    const shouldDecompress = normalizedType === 'zip' || normalizedType === 'kmz' || topMagic === 'zip';

    if (shouldDecompress) {
        if (!(content instanceof ArrayBuffer)) {
            throw new Error('压缩包解析失败：请上传 ArrayBuffer 类型数据');
        }

        const archive = await decompressBuffer(content);
        const batchResult = await buildArchivePackets({
            archive,
            sourceType: normalizedType,
            sourceName: name
        });

        warnings.push(...batchResult.warnings);
        blobUrls.push(...batchResult.blobUrls);
        errors.push(...batchResult.errors);

        if (!batchResult.packets.length) {
            if (errors.length) {
                const detail = errors.map((item) => `${item.entryName}: ${item.message}`).join('; ');
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
            summary: batchResult.summary
        };
    }

    if (normalizedType === 'kml') {
        const kmlText = typeof content === 'string' ? content : decodeBufferToText(content);
        const projectionResolved = await resolveProjectionOrDefault(detectKmlProjectionHint(kmlText), 'KML');
        if (projectionResolved.warning) warnings.push(projectionResolved.warning);

        const packet = {
            kind: 'kml',
            sourceType: normalizedType,
            entryName: name,
            kmlString: kmlText,
            dataProjection: projectionResolved.projection,
            needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(String(projectionResolved.projection || '').toUpperCase())
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
                byType: { kml: 1, kmz: 0, shp: 0, tiff: 0, geojson: 0 }
            }
        };
    }

    if (normalizedType === 'shp') {
        throw new Error('检测到单独 .shp 文件。请按同名文件组上传（至少 .shp，可选 .dbf/.shx/.prj/.cpg）或使用 ZIP。');
    }

    if ((normalizedType === 'geojson' || normalizedType === 'json')) {
        const geojsonData = parseGeoJsonContent(content);
        const projectionResolved = await detectGeoJsonProjection(geojsonData);
        if (projectionResolved.warning) warnings.push(projectionResolved.warning);

        const packet = {
            kind: 'geojson',
            sourceType: normalizedType,
            entryName: name,
            geojsonData,
            dataProjection: projectionResolved.projection,
            needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(String(projectionResolved.projection || '').toUpperCase())
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
                byType: { kml: 0, kmz: 0, shp: 0, tiff: 0, geojson: 1 }
            }
        };
    }

    if ((normalizedType === 'tif' || normalizedType === 'tiff' || topMagic === 'tiff') && content instanceof ArrayBuffer) {
        const blob = new Blob([content], { type: 'image/tiff' });
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.push(blobUrl);

        const packet = {
            kind: 'tiff',
            sourceType: normalizedType || 'tiff',
            entryName: name,
            arrayBuffer: content,
            blob,
            blobUrl
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
                byType: { kml: 0, kmz: 0, shp: 0, tiff: 1, geojson: 0 }
            }
        };
    }

    throw new Error('不支持的文件格式');
}
