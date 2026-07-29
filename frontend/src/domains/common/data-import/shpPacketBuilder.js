/**
 * 浏览器文件列表的 SHP 包构建
 *
 * 从 dataDispatcher.js 拆分（原 696 行）。
 */

import { detectShpProjectionFromPrj } from './crsAware.js';
import { normalizePath, extOf, stemOf, nameStemOf, SHP_EXTENSIONS, decodeBufferToText } from './archiveProcessor.js';

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

        const [shpBuffer, dbfBuffer, shxBuffer, prjBuffer, cpgBuffer, prjUtf8Text, cpgUtf8Text] =
            await Promise.all([
                group.shp.arrayBuffer(),
                group.dbf?.arrayBuffer?.() ?? Promise.resolve(undefined),
                group.shx?.arrayBuffer?.() ?? Promise.resolve(undefined),
                group.prj?.arrayBuffer?.() ?? Promise.resolve(undefined),
                group.cpg?.arrayBuffer?.() ?? Promise.resolve(undefined),
                group.prj?.text?.() ?? Promise.resolve(''),
                group.cpg?.text?.() ?? Promise.resolve(''),
            ]);

        const prjText = prjBuffer
            ? decodeBufferToText(prjBuffer).trim()
            : String(prjUtf8Text || '').trim();
        const cpgText = cpgBuffer
            ? decodeBufferToText(cpgBuffer).trim()
            : String(cpgUtf8Text || '').trim();
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
            needsReprojection: !['EPSG:4326', 'EPSG:3857'].includes(
                String(projectionResolved.projection || '').toUpperCase(),
            ),
            shpParts: {
                shp: shpBuffer,
                dbf: dbfBuffer,
                shx: shxBuffer,
                prj: prjBuffer,
                cpg: cpgBuffer,
                prjText,
                cpgText,
            },
        });
    }

    return {
        grouped,
        packets,
        warnings,
        taskCount: packets.length,
        groupCount: grouped.size,
    };
}
