function normalizePath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function getExtension(path) {
    const normalized = normalizePath(path).toLowerCase();
    const idx = normalized.lastIndexOf('.');
    if (idx < 0 || idx === normalized.length - 1) return '';
    return normalized.slice(idx + 1);
}

function getStem(path) {
    const normalized = normalizePath(path).toLowerCase();
    const idx = normalized.lastIndexOf('.');
    return idx > 0 ? normalized.slice(0, idx) : normalized;
}

function getDir(path) {
    const normalized = normalizePath(path).toLowerCase();
    const idx = normalized.lastIndexOf('/');
    return idx > 0 ? normalized.slice(0, idx) : '';
}

function getBaseStem(path) {
    const normalized = normalizePath(path).toLowerCase();
    const base = normalized.split('/').pop() || normalized;
    const idx = base.lastIndexOf('.');
    return idx > 0 ? base.slice(0, idx) : base;
}

function makeShpGroupKey(path) {
    const dir = getDir(path);
    const stem = getBaseStem(path);
    return dir ? `${dir}/${stem}` : stem;
}

export function buildResourcePool(entries = []) {
    const pool = new Map();
    for (const item of entries) {
        if (!item?.path || !(item.buffer instanceof ArrayBuffer)) continue;
        pool.set(normalizePath(item.path), item.buffer);
    }
    return pool;
}

export function classifyArchiveDatasets(entries = []) {
    const kmlTasks = [];
    const kmzTasks = [];
    const tiffTasks = [];
    const geoJsonTasks = [];
    const shpGroups = new Map();
    const shpWarnings = [];

    for (const entry of entries) {
        if (!entry?.path) continue;

        const path = normalizePath(entry.path);
        const extension = (entry.extension || getExtension(path)).toLowerCase();
        const normalizedEntry = { ...entry, path, extension };

        if (extension === 'kml') {
            kmlTasks.push({ entry: normalizedEntry });
            continue;
        }

        if (extension === 'kmz') {
            kmzTasks.push({ entry: normalizedEntry });
            continue;
        }

        if (extension === 'tif' || extension === 'tiff' || normalizedEntry.magicType === 'tiff') {
            tiffTasks.push({ entry: normalizedEntry });
            continue;
        }

        if (extension === 'geojson' || extension === 'json' || normalizedEntry.magicType === 'json') {
            geoJsonTasks.push({ entry: normalizedEntry });
            continue;
        }

        if (['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(extension)) {
            const stem = getStem(path);
            const groupKey = makeShpGroupKey(path);
            const group = shpGroups.get(groupKey) || {
                stem,
                groupKey,
                shpEntry: null,
                shxEntry: null,
                dbfEntry: null,
                prjEntry: null,
                cpgEntry: null
            };

            if (extension === 'shp') group.shpEntry = normalizedEntry;
            if (extension === 'shx') group.shxEntry = normalizedEntry;
            if (extension === 'dbf') group.dbfEntry = normalizedEntry;
            if (extension === 'prj') group.prjEntry = normalizedEntry;
            if (extension === 'cpg') group.cpgEntry = normalizedEntry;

            shpGroups.set(groupKey, group);
        }
    }

    const shpTasks = [];
    for (const group of shpGroups.values()) {
        if (!group.shpEntry) continue;
        if (!group.dbfEntry || !group.shxEntry) {
            const missingParts = [
                group.dbfEntry ? null : '.dbf',
                group.shxEntry ? null : '.shx'
            ].filter(Boolean);
            shpWarnings.push(`${group.shpEntry.path}: Shapefile 数据不完整，缺少 ${missingParts.join(' 和 ')}，将尝试继续解析。`);
        }
        shpTasks.push(group);
    }

    return {
        kmlTasks,
        kmzTasks,
        shpTasks,
        shpWarnings,
        tiffTasks,
        geoJsonTasks,
        datasetCount: kmlTasks.length + kmzTasks.length + shpTasks.length + tiffTasks.length + geoJsonTasks.length
    };
}

export function getDatasetNameFromPath(path, fallback = '上传数据集') {
    const normalized = normalizePath(path);
    if (!normalized) return fallback;

    const filename = normalized.split('/').pop() || normalized;
    const idx = filename.lastIndexOf('.');
    if (idx > 0) return filename.slice(0, idx);
    return filename || fallback;
}
