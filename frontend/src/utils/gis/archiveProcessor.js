/**
 * 归档文件处理：ZIP/KMZ 解包、SHP 文件分组、资源 URL 管理
 *
 * 从 dataDispatcher.js 拆分（原 696 行）。
 */

import { detectGeoJsonProjection, detectKmlProjectionHint, detectShpProjectionFromPrj, resolveProjectionOrDefault } from './crsAware.js';
import { buildResourcePool, classifyArchiveDatasets } from './batchProcessor.js';

export const RESOURCE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'css', 'js', 'html', 'htm',
]);
export const SHP_EXTENSIONS = new Set(['shp', 'dbf', 'shx', 'prj', 'cpg']);

// ==================== 路径工具函数 ====================

export function normalizePath(path = '') {
    return String(path || '')
        .replace(/\\/g, '/')
        .replace(/^\.\/?/, '')
        .trim();
}

export function extOf(path = '') {
    const lower = String(path || '').trim().toLowerCase();
    return lower.includes('.') ? lower.split('.').pop() : '';
}

export function stemOf(path = '') {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('.');
    return idx > 0 ? normalized.slice(0, idx) : normalized;
}

export function nameStemOf(path = '') {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('.');
    const withoutExt = idx > 0 ? normalized.slice(0, idx) : normalized;
    const slashIdx = withoutExt.lastIndexOf('/');
    return slashIdx >= 0 ? withoutExt.slice(slashIdx + 1) : withoutExt;
}

// ==================== Buffer 解码 ====================

export function decodeBufferToText(buffer) {
    if (!(buffer instanceof ArrayBuffer)) return '';

    const candidates = [];
    const encodings = ['utf-8', 'utf-16le', 'utf-16be', 'gbk'];

    for (const encoding of encodings) {
        try {
            const text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
            const invalidCount = (text.match(/�/g) || []).length;
            candidates.push({ encoding, text, invalidCount });
        } catch { /* ignored */
            continue;
        }
    }

    if (!candidates.length) {
        console.warn('[dataDispatcher] 所有编码尝试均失败，返回空字符串');
        return '';
    }

    candidates.sort((a, b) => a.invalidCount - b.invalidCount);
    const best = candidates[0];

    if (best.invalidCount > 0) {
        console.warn(
            `[dataDispatcher] 使用编码 ${best.encoding}，包含 ${best.invalidCount} 个替代字符`,
            `候选: ${candidates.map((c) => `${c.encoding}(${c.invalidCount})`).join(', ')}`,
        );
    }

    return best.text;
}

// ==================== GeoJSON 解析 ====================

export function parseGeoJsonContent(content) {
    if (typeof content === 'string') return JSON.parse(content);
    if (typeof content === 'object' && content) return content;
    throw new Error('GeoJSON 内容无效');
}

// ==================== SHP 分组 ====================

export function groupShpEntriesByBaseName(entries = []) {
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
            cpgEntry: null,
        };

        const normalizedEntry = { ...entry, path: rawPath, extension };

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

export function groupBrowserFilesByBaseName(files = []) {
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
            cpg: null,
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

// ==================== 资源 URL 管理 ====================

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

export function buildResourceBlobUrls(entries) {
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

/**
 * Revokes an array of blob URLs to free memory.
 * @param {string[]} urls - Array of blob URLs to revoke
 */
export function revokeAllBlobUrls(urls) {
    if (!Array.isArray(urls)) return;
    for (const url of urls) {
        try {
            URL.revokeObjectURL(url);
        } catch {
            // ignore revoke failures (already revoked or invalid)
        }
    }
}

// ==================== 归档包构建 ====================

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
            geojson: tasks.geoJsonTasks.length,
        },
    };
}

/**
 * 递归分发函数的引用（延迟注入，避免循环依赖）
 */
let _dispatchGisData = null;
export function setDispatchGisData(fn) {
    _dispatchGisData = fn;
}

export async function buildArchivePackets({ archive, sourceType, sourceName }) {
    const warnings = [];
    const errors = [];
    const packets = [];
    const blobUrls = [];

    const resourcePool = buildResourcePool(archive.entries);
    const tasks = classifyArchiveDatasets(archive.entries);
    const isKmzArchive = String(sourceType || '').toLowerCase() === 'kmz';
    const shpGrouping = groupShpEntriesByBaseName(archive.entries);

    if (Array.isArray(shpGrouping.warnings) && shpGrouping.warnings.length) {
        warnings.push(...shpGrouping.warnings);
    }
    const resources = buildResourceBlobUrls(archive.entries);
    blobUrls.push(...resources.urls);

    for (const task of tasks.kmlTasks) {
        try {
            const kmlText = decodeBufferToText(task.entry.buffer);
            const projectionResolved = await resolveProjectionOrDefault(
                detectKmlProjectionHint(kmlText),
                'KML/KMZ',
            );
            if (projectionResolved.warning)
                warnings.push(`${task.entry.path}: ${projectionResolved.warning}`);

            const preservedEntryName = isKmzArchive && sourceName ? sourceName : task.entry.path;

            packets.push({
                kind: 'kml',
                sourceType,
                sourceName,
                entryName: preservedEntryName,
                dispatchEntryName: task.entry.path,
                kmlString: kmlText,
                dataProjection: projectionResolved.projection,
                needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(
                    String(projectionResolved.projection || '').toUpperCase(),
                ),
            });
        } catch (error) {
            errors.push({
                entryName: task.entry.path,
                kind: 'kml',
                message: error?.message || String(error),
            });
        }
    }

    for (const task of tasks.kmzTasks) {
        try {
            if (!_dispatchGisData) throw new Error('dispatchGisData 未注入');
            const nested = await _dispatchGisData({
                content: task.entry.buffer,
                type: 'kmz',
                name: task.entry.path,
            });

            if (Array.isArray(nested.warnings)) warnings.push(...nested.warnings);
            if (Array.isArray(nested.errors)) errors.push(...nested.errors);
            if (Array.isArray(nested.blobUrls)) blobUrls.push(...nested.blobUrls);
            if (Array.isArray(nested.packets)) packets.push(...nested.packets);
        } catch (error) {
            errors.push({
                entryName: task.entry.path,
                kind: 'kmz',
                message: error?.message || String(error),
            });
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
                needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(
                    String(projectionResolved.projection || '').toUpperCase(),
                ),
                shpParts: {
                    shp: task.shpEntry.buffer,
                    shx: task.shxEntry?.buffer,
                    dbf: task.dbfEntry?.buffer,
                    prj: task.prjEntry?.buffer,
                    cpg: task.cpgEntry?.buffer,
                    prjText,
                    cpgText,
                },
                resourcePool,
                resources: resources.resources,
            });
        } catch (error) {
            errors.push({
                entryName: task.shpEntry?.path || task.stem,
                kind: 'shp',
                message: error?.message || String(error),
            });
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
                blobUrl,
            });
        } catch (error) {
            errors.push({
                entryName: task.entry.path,
                kind: 'tiff',
                message: error?.message || String(error),
            });
        }
    }

    for (const task of tasks.geoJsonTasks) {
        try {
            const text = decodeBufferToText(task.entry.buffer);
            const geojsonData = parseGeoJsonContent(text);
            const projectionResolved = await detectGeoJsonProjection(geojsonData);
            if (projectionResolved.warning)
                warnings.push(`${task.entry.path}: ${projectionResolved.warning}`);

            packets.push({
                kind: 'geojson',
                sourceType,
                sourceName,
                entryName: task.entry.path,
                geojsonData,
                dataProjection: projectionResolved.projection,
                needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(
                    String(projectionResolved.projection || '').toUpperCase(),
                ),
                resourcePool,
                resources: resources.resources,
            });
        } catch (error) {
            errors.push({
                entryName: task.entry.path,
                kind: 'geojson',
                message: error?.message || String(error),
            });
        }
    }

    return {
        packets,
        warnings,
        errors,
        blobUrls,
        resourcePool,
        summary: buildSummary(
            {
                ...tasks,
                shpTasks: shpGrouping.tasks,
                datasetCount:
                    tasks.kmlTasks.length +
                    tasks.kmzTasks.length +
                    shpGrouping.tasks.length +
                    tasks.tiffTasks.length +
                    tasks.geoJsonTasks.length,
            },
            packets,
            errors,
        ),
    };
}
