import {
    createUnsupportedProjectedCrsError,
    isUnsupportedProjectedCrsError,
    reprojectGeoJSON,
    resolveDatasetProjection,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
} from '../crs-engine';
import { parseDbfBuffer } from './dbfParser';
import { detectGeoJSONProjectionDetailed } from '../crs/crsUtils';
import { useMessage } from '@common/shell/useMessage';
import { ShpPartsInput } from './shp/datasets';
import { decodeMaybeText, detectDbfEncodingHint, inspectShpHeader, toArrayBuffer } from './shp/encoding';
import { buildProjectionFailureMessage, normalizeFeatureCollection, validateGeoJsonCoordinates } from './shp/geoValidation';
import { assignFeatureIds, enrichFeaturesWithDbfAttributes } from './shp/dbfAttributes';

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

export async function parseShpPartsToGeoJSON(
    parts: ShpPartsInput,
    options: {
        overrideCrs?: string;
        /**
         * 交出「重投影之前」的原始几何与判定结果。
         * 供上层登记源几何快照，用于导入后重设坐标系——变换过就追不回来了。
         */
        onSourceGeometry?: (geojson: any, sourceCrs: string) => void;
    } = {},
): Promise<any> {
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
    if (dbfBuffer instanceof ArrayBuffer && !usedAttempt?.usesDbf) {
        try {
            console.warn('[SHP] 启动自定义 DBF 解析...');
            const dbfData = parseDbfBuffer(dbfBuffer, cpgText);
            
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
        } catch (_err: any) {
            // 自定义 DBF 解析失败:回退 shpjs 属性,不阻断导入;以 warning 提示用户
            message.warning('自定义 DBF 解析失败，已回退使用 shpjs 属性。');
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

    // 无 .prj 时按坐标量级推断：平面坐标（米）不能默认当 4326，
    // 否则会静默落到错误位置；判不出就停下，由用户在导入区指定带号 / EPSG。
    const detected = prjText ? null : detectGeoJSONProjectionDetailed(featureCollection);
    const projection = resolveDatasetProjection({
        prjText,
        overrideCrs: options?.overrideCrs || '',
        sourceCrs: detected?.code || '',
        sourceConfidence:
            detected?.confidence === 'declared'
                ? 'declared'
                : detected?.confidence === 'ambiguous'
                  ? 'ambiguous'
                  : detected && detected.confidence !== 'none'
                    ? 'inferred'
                    : 'none',
        sourceHint: detected?.hint || '',
        targetCrs: 'EPSG:4326',
    });
    const projectionName = projection.prjName || projection.sourceCrs || '未知投影';
    // 诊断：投影判定结果直接打出来，便于用户/维护者确认「到底认成了什么」
    console.warn('[SHP][CRS]', {
        prjProvided: projection.prjProvided,
        sourceCrs: projection.sourceCrs,
        confidence: projection.confidence,
        needsTransform: projection.needsTransform,
        prjName: projection.prjName,
    });

    if (projection.ambiguous && !options?.overrideCrs) {
        const hintText = projection.hint || '缺少 .prj，且坐标像平面坐标（米），无法自动判定';
        message.error(`${hintText}。请在导入区「源坐标系」指定带号或 EPSG 后重试。`, {
            closable: true,
            duration: 0,
        });
        throw createUnsupportedProjectedCrsError(hintText, true);
    }

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

    // 无论是否真的需要变换，都把原始几何交出去：判成 4326 也可能判错
    options?.onSourceGeometry?.(featureCollection, projection.sourceCrs);

    if (!projection.needsTransform) return featureCollection;

    try {
        let droppedFeatures = 0;
        const projected = reprojectGeoJSON(
            featureCollection,
            projection.sourceCrs,
            projection.targetCrs,
            {
                onInvalid: (stats) => {
                    droppedFeatures = stats.droppedFeatures;
                },
            },
        );
        if (droppedFeatures > 0) {
            message.warning(
                `坐标系转换时有 ${droppedFeatures} 个要素落在有效范围外，已跳过（其余要素已正常导入）。`,
                { duration: 5200 },
            );
        }
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
        throw new Error(error?.message || UNSUPPORTED_PROJECTED_CRS_MESSAGE, { cause: error });
    }
}

export { groupShpDatasets } from './shp/datasets';
