import type { FlattenedResource } from '../decompressor';
import {
    createUnsupportedProjectedCrsError,
    isUnsupportedProjectedCrsError,
    reprojectGeoJSON,
    resolveDatasetProjection,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
} from '../crs-engine';
import { parseDbfBuffer, type DbfData } from './dbfParser';
import { useMessage } from '../../../composables/useMessage';

export type ShpDataset = {
    key: string;
    shp: FlattenedResource;
    shx?: FlattenedResource;
    dbf?: FlattenedResource;
    prj?: FlattenedResource;
    cpg?: FlattenedResource;
};

export type ShpPartsInput = {
    shp: ArrayBuffer | Blob;
    dbf?: ArrayBuffer | Blob;
    shx?: ArrayBuffer | Blob;
    prj?: ArrayBuffer | Blob;
    cpg?: ArrayBuffer | Blob;
    prjText?: string;
    cpgText?: string;
};

export type ReprojectionDebugSnapshot = {
    before: [number, number] | null;
    after: [number, number] | null;
};

const SUPPORTED_SHP_TYPES = new Set([0, 1, 3, 5, 8, 11, 13, 15, 18, 21, 23, 25, 28]);

const SHP_TYPE_NAMES: Record<number, string> = {
    0: 'Null Shape',
    1: 'Point',
    3: 'Polyline',
    5: 'Polygon',
    8: 'MultiPoint',
    11: 'PointZ',
    13: 'PolylineZ',
    15: 'PolygonZ',
    18: 'MultiPointZ',
    21: 'PointM',
    23: 'PolylineM',
    25: 'PolygonM',
    28: 'MultiPointM',
};

function normalizePath(path = ''): string {
    return String(path || '')
        .replace(/\\/g, '/')
        .trim();
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
        const key = dir ? `${dir}/${stem}` : stem;
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

function inspectShpHeader(shpBuffer: ArrayBuffer): {
    shapeType: number;
    version: number;
    declaredByteLength: number;
} {
    if (!(shpBuffer instanceof ArrayBuffer) || shpBuffer.byteLength < 100) {
        throw new Error('无效的 .shp 文件：头部长度不足（< 100 bytes）');
    }

    const view = new DataView(shpBuffer);
    const signature = view.getInt32(0, false);
    if (signature !== 9994) {
        throw new Error(`无效的 .shp 文件：文件签名异常（${signature}）`);
    }

    const declaredByteLength = view.getInt32(24, false) * 2;
    const version = view.getInt32(28, true);
    const shapeType = view.getInt32(32, true);

    if (!SUPPORTED_SHP_TYPES.has(shapeType)) {
        const shapeTypeName = SHP_TYPE_NAMES[shapeType] || 'Unknown';
        throw new Error(`暂不支持的 SHP 几何类型：${shapeType} (${shapeTypeName})`);
    }

    return {
        shapeType,
        version,
        declaredByteLength,
    };
}

function normalizeEncodingName(raw = ''): string {
    const text = String(raw || '')
        .trim()
        .replace(/^['"]|['"]$/g, '');
    if (!text) return '';
    return text.toUpperCase().replace(/[^A-Z0-9_-]+/g, '');
}

function detectDbfEncodingHint(cpgText = '', dbfBuffer?: ArrayBuffer): string {
    const normalizedCpg = normalizeEncodingName(cpgText);
    if (normalizedCpg) return normalizedCpg;
    if (!(dbfBuffer instanceof ArrayBuffer) || dbfBuffer.byteLength < 32) return '';

    const ldid = new DataView(dbfBuffer).getUint8(29);
    const map: Record<number, string> = {
        0x03: 'CP1252',
        0x4d: 'CP936',
        0x4f: 'CP950',
        0x57: 'CP1252',
        0x78: 'CP950',
        0x7a: 'CP936',
    };
    return map[ldid] || '';
}

async function toArrayBuffer(input?: ArrayBuffer | Blob): Promise<ArrayBuffer | undefined> {
    if (!input) return undefined;
    if (input instanceof ArrayBuffer) return input;
    if (input instanceof Blob && typeof (input as any).arrayBuffer === 'function') {
        try {
            return await (input as any).arrayBuffer();
        } catch (err) {
            console.warn('[SHP] Blob 转换为 ArrayBuffer 失败:', err);
            return undefined;
        }
    }
    return undefined;
}

function validateCoordinatePair(
    lon: number,
    lat: number,
    targetCrs: 'EPSG:4326' | 'EPSG:3857',
): string | null {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return '坐标转换结果包含 NaN/Infinity';

    if (targetCrs === 'EPSG:4326') {
        if (Math.abs(lon) < 1e-12 && Math.abs(lat) < 1e-12) {
            return '坐标疑似转换失败 (0,0)，请检查 PRJ 编码（可能 GBK 乱码）';
        }
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
            return `坐标超出经纬度范围: (${lon}, ${lat})`;
        }
        return null;
    }

    if (targetCrs === 'EPSG:3857') {
        if (lon < -20037508.35 || lon > 20037508.35 || lat < -20037508.35 || lat > 20037508.35) {
            return `坐标超出 WebMercator 范围: (${lon}, ${lat})`;
        }
    }

    return null;
}

function validateGeoJsonCoordinates(
    geojson: any,
    targetCrs: 'EPSG:4326' | 'EPSG:3857',
): string | null {
    const limit = 5000;
    let checked = 0;

    const visit = (node: any): string | null => {
        if (checked >= limit) return null;
        if (!Array.isArray(node) || !node.length) return null;

        if (typeof node[0] === 'number' && typeof node[1] === 'number') {
            checked += 1;
            return validateCoordinatePair(Number(node[0]), Number(node[1]), targetCrs);
        }

        for (const child of node) {
            const error = visit(child);
            if (error) return error;
            if (checked >= limit) break;
        }

        return null;
    };

    if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
        for (const feature of geojson.features) {
            const error = visit(feature?.geometry?.coordinates);
            if (error) return error;
            if (checked >= limit) break;
        }
        return null;
    }

    if (geojson?.type === 'Feature') return visit(geojson?.geometry?.coordinates);
    return visit(geojson?.coordinates);
}

function buildProjectionFailureMessage(projectionName = ''): string {
    return `坐标系识别失败：[${projectionName || '未知投影'}]，请使用地理坐标`;
}

function normalizeFeatureCollection(geojson: any): any {
    if (Array.isArray(geojson)) {
        return {
            type: 'FeatureCollection',
            features: geojson.flatMap((item) => item?.features || []),
        };
    }
    return geojson;
}

function pickFirstCoordinateRecursive(node: any): [number, number] | null {
    if (!Array.isArray(node) || !node.length) return null;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
        return [Number(node[0]), Number(node[1])];
    }
    for (const child of node) {
        const found = pickFirstCoordinateRecursive(child);
        if (found) return found;
    }
    return null;
}

export function getGeoJsonFirstCoordinatePair(geojson: any): [number, number] | null {
    if (!geojson) return null;

    if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
        for (const feature of geojson.features) {
            const found = pickFirstCoordinateRecursive(feature?.geometry?.coordinates);
            if (found) return found;
        }
        return null;
    }

    if (geojson?.type === 'Feature') {
        return pickFirstCoordinateRecursive(geojson?.geometry?.coordinates);
    }

    return pickFirstCoordinateRecursive(geojson?.coordinates);
}

export function buildReprojectionDebugSnapshot(
    beforeGeojson: any,
    afterGeojson: any,
): ReprojectionDebugSnapshot {
    return {
        before: getGeoJsonFirstCoordinatePair(beforeGeojson),
        after: getGeoJsonFirstCoordinatePair(afterGeojson),
    };
}

function assignFeatureIds(featureCollection: any): any {
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
function enrichFeaturesWithDbfAttributes(featureCollection: any, dbfData: DbfData): any {
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
            const _originalPropsCount = Object.keys(feature.properties || {}).length;
            
            // 保留原有属性，使用 DBF 属性进行补充和覆盖
            feature.properties = {
                ...feature.properties,
                ...dbfRecord.values,
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

async function getShpParserLib(): Promise<any> {
    const mod = await import('shpjs');
    return mod.default || mod;
}

type ParseAttempt = {
    label: string;
    input: Record<string, ArrayBuffer>;
    usesDbf: boolean;
    usesShx: boolean;
};

function buildParseAttempts(params: {
    shpBuffer: ArrayBuffer;
    dbfBuffer?: ArrayBuffer;
    shxBuffer?: ArrayBuffer;
    cpgBuffer?: ArrayBuffer;
}): ParseAttempt[] {
    const attempts: ParseAttempt[] = [];

    const pushAttempt = (label: string, options: { withDbf: boolean; withShx: boolean }) => {
        const input: Record<string, ArrayBuffer> = {
            shp: params.shpBuffer,
        };
        if (options.withDbf && params.dbfBuffer instanceof ArrayBuffer) {
            input.dbf = params.dbfBuffer;
        }
        if (options.withShx && params.shxBuffer instanceof ArrayBuffer) {
            input.shx = params.shxBuffer;
        }
        if (params.cpgBuffer instanceof ArrayBuffer) {
            input.cpg = params.cpgBuffer;
        }

        attempts.push({
            label,
            input,
            usesDbf: !!input.dbf,
            usesShx: !!input.shx,
        });
    };

    if (params.dbfBuffer instanceof ArrayBuffer && params.shxBuffer instanceof ArrayBuffer) {
        pushAttempt('shp+dbf+shx', { withDbf: true, withShx: true });
    }
    if (params.dbfBuffer instanceof ArrayBuffer) {
        pushAttempt('shp+dbf', { withDbf: true, withShx: false });
    }
    if (params.shxBuffer instanceof ArrayBuffer) {
        pushAttempt('shp+shx', { withDbf: false, withShx: true });
    }
    pushAttempt('shp-only', { withDbf: false, withShx: false });

    return attempts;
}

export async function parseShpPartsToGeoJSON(parts: ShpPartsInput): Promise<any> {
    const [shpBuffer, dbfBuffer, shxBuffer, prjBuffer, cpgBuffer] = await Promise.all([
        toArrayBuffer(parts?.shp),
        toArrayBuffer(parts?.dbf),
        toArrayBuffer(parts?.shx),
        toArrayBuffer(parts?.prj),
        toArrayBuffer(parts?.cpg),
    ]);

    if (!(shpBuffer instanceof ArrayBuffer)) {
        throw new Error('Shapefile 数据不完整：至少需要 .shp');
    }

    const message = useMessage();
    const shpHeader = inspectShpHeader(shpBuffer);

    // 容忍头部文件长度与实际长度存在少量偏差，避免误伤历史数据；仅在偏差较大时提示。
    const sizeDiff = Math.abs(shpHeader.declaredByteLength - shpBuffer.byteLength);
    if (shpHeader.declaredByteLength > 0 && sizeDiff > 32) {
        message.warning('检测到 .shp 头部长度与实际文件长度存在较大差异，已尝试兼容解析。', {
            duration: 3600,
        });
    }

    const shp = await getShpParserLib();

    const attempts = buildParseAttempts({ shpBuffer, dbfBuffer, shxBuffer, cpgBuffer });
    const failures: Array<{ attempt: ParseAttempt; message: string }> = [];
    let raw: any = null;
    let usedAttempt: ParseAttempt | null = null;

    for (const attempt of attempts) {
        try {
            raw = await shp(attempt.input);
            usedAttempt = attempt;
            break;
        } catch (error: any) {
            failures.push({
                attempt,
                message: error?.message || String(error),
            });
        }
    }

    if (!usedAttempt || !raw) {
        const detail = failures.map((item) => `${item.attempt.label}: ${item.message}`).join(' | ');
        throw new Error(`Shapefile 解析失败：${detail || '未知错误'}`);
    }

    const hasDbfFailure = failures.some((item) => item.attempt.usesDbf);
    const hasShxFailure = failures.some((item) => item.attempt.usesShx);
    if (dbfBuffer instanceof ArrayBuffer && hasDbfFailure && !usedAttempt.usesDbf) {
        message.warning('属性表(.dbf)解析失败，已回退为仅几何导入。', { duration: 4200 });
    }
    if (shxBuffer instanceof ArrayBuffer && hasShxFailure && !usedAttempt.usesShx) {
        message.warning('索引文件(.shx)解析异常，已回退为顺序扫描 .shp 导入。', { duration: 4200 });
    }

    let featureCollection = assignFeatureIds(normalizeFeatureCollection(raw));
    const prjText = String(parts?.prjText || '').trim() || decodeMaybeText(prjBuffer).trim();
    const cpgText = String(parts?.cpgText || '').trim() || decodeMaybeText(cpgBuffer).trim();
    
    console.warn('[SHP] 开始属性解析链路 -', {
        hasDbf: dbfBuffer instanceof ArrayBuffer,
        hasCpg: cpgBuffer instanceof ArrayBuffer,
        cpgText: cpgText ? cpgText.substring(0, 20) : 'none',
        usedDbfFromShpjs: usedAttempt?.usesDbf ? 'yes' : 'no',
        featureCount: Array.isArray(featureCollection?.features) ? featureCollection.features.length : 0,
    });
    
    // 尝试使用增强的 DBF 解析器获取更完整的属性信息
    // 仅在 shpjs 解析时未包含 DBF 的情况下尝试
    let dbfData: DbfData | null = null;
    if (dbfBuffer instanceof ArrayBuffer && !usedAttempt?.usesDbf) {
        try {
            console.warn('[SHP] 启动自定义 DBF 解析...');
            dbfData = parseDbfBuffer(dbfBuffer, cpgText);
            
            if (dbfData.warnings.length > 0) {
                console.warn('[SHP] DBF 解析警告:', dbfData.warnings);
            }
            
            // 将 DBF 属性与 GeoJSON feature 关联
            featureCollection = enrichFeaturesWithDbfAttributes(featureCollection, dbfData);
            console.warn(
                `[SHP] ✓ 完成属性增强\n` +
                `  - 记录数: ${dbfData.records.length}\n` +
                `  - 字段数: ${dbfData.fields.length}\n` +
                `  - 编码: ${dbfData.encoding}`
            );
        } catch (err: any) {
            console.error('[SHP] 自定义 DBF 解析失败，将尝试使用 shpjs 属性:', err?.message || err);
            dbfData = null;
            // 不中断流程，继续使用 shpjs 的属性
        }
    } else if (dbfBuffer instanceof ArrayBuffer && usedAttempt?.usesDbf) {
        console.warn('[SHP] shpjs 已成功解析 DBF，使用其提供的属性');
    } else if (!dbfBuffer) {
        console.warn('[SHP] 未提供 DBF 文件，仅导入几何数据');
    }
    
    const encodingHint = detectDbfEncodingHint(cpgText, dbfBuffer);
    if (encodingHint && dbfBuffer instanceof ArrayBuffer && !usedAttempt.usesDbf) {
        message.warning(`检测到 DBF 编码提示(${encodingHint})，但属性表未成功解析。`, {
            duration: 3600,
        });
    }

    const projection = resolveDatasetProjection({ prjText, targetCrs: 'EPSG:4326' });
    const projectionName = projection.prjName || projection.sourceCrs || '未知投影';

    if (projection.prjProvided && !projection.prjResolved) {
        message.error(buildProjectionFailureMessage(projectionName), {
            closable: true,
            duration: 0,
        });
        throw createUnsupportedProjectedCrsError(
            projection.prjName || projection.prjError || 'PRJ 解析失败',
            true,
        );
    }

    if (!projection.needsTransform) return featureCollection;

    try {
        const projected = reprojectGeoJSON(
            featureCollection,
            projection.sourceCrs,
            projection.targetCrs,
        );
        const validationError = validateGeoJsonCoordinates(projected, projection.targetCrs);
        if (validationError) {
            message.error(buildProjectionFailureMessage(projectionName), {
                closable: true,
                duration: 0,
            });
            throw createUnsupportedProjectedCrsError(
                `${projectionName} / ${validationError}`,
                true,
            );
        }
        return projected;
    } catch (error: any) {
        if (projection.prjProvided) {
            if (!isUnsupportedProjectedCrsError(error)) {
                message.error(buildProjectionFailureMessage(projectionName), {
                    closable: true,
                    duration: 0,
                });
            }
            throw createUnsupportedProjectedCrsError(
                projection.prjName || projection.prjError || error?.message || '重投影失败',
                true,
            );
        }
        if (isUnsupportedProjectedCrsError(error)) {
            throw error;
        }
        throw new Error(error?.message || UNSUPPORTED_PROJECTED_CRS_MESSAGE);
    }
}
