import type { FlattenedResource } from '../decompressor';
import { reprojectGeoJSON, resolveDatasetProjection } from '../crs-engine';

export type ShpDataset = {
    key: string;
    shp: FlattenedResource;
    shx?: FlattenedResource;
    dbf?: FlattenedResource;
    prj?: FlattenedResource;
    cpg?: FlattenedResource;
};

export type ShpPartsInput = {
    shp: ArrayBuffer;
    dbf: ArrayBuffer;
    shx?: ArrayBuffer;
    prj?: ArrayBuffer;
};

function normalizePath(path = ''): string {
    return String(path || '').replace(/\\/g, '/').trim();
}

function pathDir(path = ''): string {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('/');
    if (idx < 0) return '';
    return normalized.slice(0, idx);
}

function stemOf(path = ''): string {
    const normalized = normalizePath(path);
    const base = normalized.split('/').pop() || normalized;
    const idx = base.lastIndexOf('.');
    if (idx < 0) return base;
    return base.slice(0, idx);
}

export function groupShpDatasets(resources: FlattenedResource[]): ShpDataset[] {
    const groups = new Map<string, Partial<ShpDataset>>();

    for (const resource of resources) {
        const ext = String(resource.ext || '').toLowerCase();
        if (!['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(ext)) continue;

        const dir = pathDir(resource.path);
        const stem = stemOf(resource.path);
        const key = `${dir}/${stem}`;
        const current = groups.get(key) || { key };

        if (ext === 'shp') current.shp = resource;
        if (ext === 'shx') current.shx = resource;
        if (ext === 'dbf') current.dbf = resource;
        if (ext === 'prj') current.prj = resource;
        if (ext === 'cpg') current.cpg = resource;

        groups.set(key, current);
    }

    return Array.from(groups.values())
        .filter((item): item is ShpDataset => !!item.shp)
        .sort((a, b) => a.key.localeCompare(b.key));
}

function decodeMaybeText(buffer?: ArrayBuffer): string {
    if (!(buffer instanceof ArrayBuffer)) return '';
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    if (!utf8.includes('\uFFFD')) return utf8;
    try {
        return new TextDecoder('gbk', { fatal: false }).decode(buffer);
    } catch {
        return utf8;
    }
}

function normalizeFeatureCollection(geojson: any): any {
    if (Array.isArray(geojson)) {
        return {
            type: 'FeatureCollection',
            features: geojson.flatMap((item) => item?.features || [])
        };
    }
    return geojson;
}

function assignFeatureIds(featureCollection: any): any {
    if (!featureCollection) return featureCollection;
    const clone = JSON.parse(JSON.stringify(featureCollection));
    const features = Array.isArray(clone?.features) ? clone.features : [];

    features.forEach((feature: any, index: number) => {
        const gid = feature?.id || feature?.properties?._gid || feature?.properties?.id || `feature_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        feature.id = gid;
        feature.properties = feature.properties && typeof feature.properties === 'object' ? feature.properties : {};
        feature.properties._gid = gid;
    });

    return clone;
}

async function getShpParserLib(): Promise<any> {
    const mod = await import('shpjs');
    return mod.default || mod;
}

export async function parseShpPartsToGeoJSON(parts: ShpPartsInput): Promise<any> {
    if (!(parts?.shp instanceof ArrayBuffer) || !(parts?.dbf instanceof ArrayBuffer)) {
        throw new Error('Shapefile 数据不完整：至少需要 .shp 与 .dbf');
    }

    const shp = await getShpParserLib();
    const raw = await shp({
        shp: parts.shp,
        dbf: parts.dbf,
        shx: parts.shx,
        prj: parts.prj
    });

    const featureCollection = assignFeatureIds(normalizeFeatureCollection(raw));
    const prjText = decodeMaybeText(parts.prj);
    const projection = resolveDatasetProjection({ prjText, targetCrs: 'EPSG:4326' });
    if (!projection.needsTransform) return featureCollection;

    return reprojectGeoJSON(featureCollection, projection.sourceCrs, projection.targetCrs);
}
