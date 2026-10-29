import { ref, shallowRef } from 'vue';
import { dispatchGisData } from '@common/data-import/dataDispatcher';
import { flattenUploadInput } from '@common/data-import/decompressor';
import { loadJsZip } from '@common/data-import/loadJsZip';
import { groupShpDatasets } from '@common/data-import/parsers/shpParser';
import { parseKmlBuffer } from '@common/data-import/parsers/kmlParser';
import { loadTifBuffer } from '@common/data-import/parsers/tifLoader';
import type { FlattenedResource } from '@common/data-import/decompressor';
import {
    isUnsupportedProjectedCrsError,
    reprojectGeoJSON,
    resolveDatasetProjection,
    UNSUPPORTED_PROJECTED_CRS_CODE,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
} from '@common/map-view/geo/index';
import { useMessage } from '@common/shell/useMessage';
import { detectGeoJSONProjectionDetailed } from '@common/data-import/crs/crsUtils';
import {
    createUploadPayloadFromEntries,
    createUploadPayloadFromFolder,
    createUploadPayloadsFromFiles,
    type GisDispatchInput,
} from '@common/data-import/gisUploadPayload';

type PacketSummary = {
    detectedDatasets: number;
    importedDatasets: number;
    failedDatasets: number;
    byType: {
        kml: number;
        kmz: number;
        shp: number;
        tiff: number;
        geojson: number;
    };
};

import { getNameStem } from '@common/utils/pathUtils';

const SHP_SIDECAR_EXTENSIONS = new Set(['shp', 'shx', 'dbf', 'prj', 'cpg']);

// 向后兼容的别名
const stemOf = getNameStem;

function parseJsonBuffer(buffer: ArrayBuffer): any {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    return JSON.parse(text);
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

function isSupportedExt(ext = ''): boolean {
    const normalized = String(ext || '').toLowerCase();
    return [
        'kml',
        'geojson',
        'json',
        'shp',
        'shx',
        'dbf',
        'prj',
        'cpg',
        'tif',
        'tiff',
        'zip',
        'kmz',
    ].includes(normalized);
}

function summarizePackets(packets: any[], errors: any[]): PacketSummary {
    const byType = { kml: 0, kmz: 0, shp: 0, tiff: 0, geojson: 0 };
    packets.forEach((packet) => {
        if (!packet?.kind) return;
        if (packet.kind in byType) byType[packet.kind as keyof typeof byType] += 1;
    });

    return {
        detectedDatasets: packets.length + errors.length,
        importedDatasets: packets.length,
        failedDatasets: errors.length,
        byType,
    };
}

/**
 * 功能：把单个资源构建成可下发的载荷（KML / GeoJSON / TIF / 压缩包）。
 * 参数：resource —— 扁平化后的资源
 *       overrideCrs —— 人工指定的源坐标系（空串=自动识别）
 *       warningSink —— 告警收集数组（坐标系歧义 / 推断提示写入这里）
 * 返回：载荷对象；不支持的扩展名返回 null。
 * 说明：GeoJSON 在此处完成「探测 → 重投影到 WGS84」——3D 管线只认 4326；
 *       2D 管线另有 dataProjection 机制，互不影响。
 */
function buildSingleUploadPayload(
    resource: FlattenedResource,
    overrideCrs = '',
    warningSink?: string[],
): { content: unknown; type: string; name: string } | null {
    const ext = String(resource.ext || '').toLowerCase();

    if (ext === 'kml') {
        const parsed = parseKmlBuffer(resource.content);
        // KML 只透传文本：坐标重投影发生在消费端（2D 的 parseKmlTextToFeatures /
        // 3D 的 prepareKmlText），那边会以人工指定优先于 srsName，故此处无需改写内容，
        // 也不再误报「手动指定未生效」——该告警在 KML 支持 override 之后已不成立。
        return { content: parsed.content, type: 'kml', name: resource.path };
    }

    if (ext === 'geojson' || ext === 'json') {
        const raw = parseJsonBuffer(resource.content);
        const detected = detectGeoJSONProjectionDetailed(raw);
        const projection = resolveDatasetProjection({
            overrideCrs,
            sourceCrs: detected.code || '',
            sourceConfidence:
                detected.confidence === 'declared'
                    ? 'declared'
                    : detected.confidence === 'high' || detected.confidence === 'medium'
                      ? 'inferred'
                      : detected.confidence === 'ambiguous'
                        ? 'ambiguous'
                        : 'none',
            sourceHint: detected.hint,
            targetCrs: 'EPSG:4326',
        });

        if (projection.ambiguous) {
            warningSink?.push(
                `${resource.path}: ${projection.hint}；可在导入区的「源坐标系」中指定带号或 EPSG。`,
            );
        } else if (projection.confidence === 'inferred' && projection.sourceCrs !== 'EPSG:4326') {
            warningSink?.push(
                `${resource.path}: ${projection.hint || `按量级推断为 ${projection.sourceCrs}`}，如位置不符请手动指定。`,
            );
        }

        const projected = projection.needsTransform
            ? reprojectGeoJSON(raw, projection.sourceCrs, projection.targetCrs)
            : raw;
        return {
            content: JSON.stringify(projected),
            type: ext,
            name: resource.path,
        };
    }

    if (ext === 'tif' || ext === 'tiff') {
        const parsed = loadTifBuffer(resource.content);
        return { content: parsed.arrayBuffer, type: ext, name: resource.path };
    }

    if (ext === 'zip' || ext === 'kmz') {
        return { content: resource.content, type: ext, name: resource.path };
    }

    return null;
}

async function buildShpArchivePayload(
    group: ReturnType<typeof groupShpDatasets>[number],
    overrideCrs = '',
): Promise<{ content: ArrayBuffer; type: string; name: string }> {
    const JSZip = await loadJsZip();
    const zip = new JSZip();
    const baseName = stemOf(group.shp.path);

    zip.file(`${baseName}.shp`, group.shp.content);
    if (group.shx) zip.file(`${baseName}.shx`, group.shx.content);
    if (group.dbf) zip.file(`${baseName}.dbf`, group.dbf.content);
    if (group.prj) zip.file(`${baseName}.prj`, group.prj.content);
    if (group.cpg) zip.file(`${baseName}.cpg`, group.cpg.content);

    const prjText = decodeMaybeText(group.prj?.content);
    const projection = resolveDatasetProjection({ prjText, overrideCrs, targetCrs: 'EPSG:4326' });

    // Warn if PRJ exists but could not be resolved, but allow import to continue
    // The actual reproject will happen during parsing
    if (group.prj && !projection.prjResolved && prjText.trim()) {
        const message = useMessage();
        message.warning(
            `数据 "${baseName}" 使用了未识别的投影坐标系: ${projection.prjName || '未知'}。将尝试自动转换为 WGS84，如有偏差请重新配置。`,
            { duration: 6000 },
        );
    }

    const zipped = await zip.generateAsync({ type: 'arraybuffer' });
    return {
        content: zipped,
        type: 'zip',
        name: `${group.key}.zip`,
    };
}

export function useGisLoader() {
    const isLoading = ref(false);
    const lastError = ref<unknown>(null);
    const warnings = ref<string[]>([]);
    const errors = ref<any[]>([]);
    const summary = shallowRef<PacketSummary | null>(null);
    const lastPackets = shallowRef<any[]>([]);
    const lastPacket = shallowRef<any>(null);
    const blobUrls = ref<string[]>([]);
    const message = useMessage();

    function revokeBlobUrls(): void {
        blobUrls.value.forEach((url) => {
            try {
                URL.revokeObjectURL(url);
            } catch {
                // ignore revoke failures
            }
        });
        blobUrls.value = [];
    }

    async function dispatch(input: GisDispatchInput = {}): Promise<any> {
        isLoading.value = true;
        lastError.value = null;
        warnings.value = [];
        errors.value = [];
        summary.value = null;
        lastPackets.value = [];
        lastPacket.value = null;
        revokeBlobUrls();
        let projectionPopupShown = false;
        // 人工指定的源坐标系（上传区下拉），空串表示自动识别
        const overrideCrs = String(input?.overrideCrs || '').trim();

        try {
            const flattened = await flattenUploadInput(input);
            const supported = flattened.filter((item) => isSupportedExt(item.ext));
            const ignored = flattened.filter((item) => !isSupportedExt(item.ext));
            // 包内附带资源（如 KMZ 里的 ArcGIS 弹窗 .xsl 模板/图标）非用户数据，静默跳过；
            // 仅用户直接选择的不支持文件才告警，避免“成功导入却报错”的困惑
            const ignoredTopLevel = ignored.filter((item) => !item.nested);

            if (ignoredTopLevel.length) {
                warnings.value.push(`已跳过 ${ignoredTopLevel.length} 个不支持的数据文件`);
            }

            const shpGroups = groupShpDatasets(supported);

            // 已被某个 .shp 组认领的 sidecar（含 groupShpDatasets 内部的「单 .shp 兜底合并」）
            const attachedSidecarPaths = new Set<string>();
            shpGroups.forEach((group) => {
                [group.shx, group.dbf, group.prj, group.cpg].forEach((item) => {
                    if (item?.path) attachedSidecarPaths.add(item.path);
                });
            });

            const orphanSidecars = supported.filter((resource) => {
                const ext = String(resource.ext || '').toLowerCase();
                if (!SHP_SIDECAR_EXTENSIONS.has(ext)) return false;
                return !attachedSidecarPaths.has(resource.path);
            });

            if (orphanSidecars.length) {
                const names = orphanSidecars
                    .slice(0, 5)
                    .map((item) => item.path)
                    .join('、');
                const suffix =
                    orphanSidecars.length > 5 ? ` 等 ${orphanSidecars.length} 个` : '';
                warnings.value.push(
                    `以下 sidecar 未匹配到同名 .shp，已跳过：${names}${suffix}。若同属一个数据集，请保持文件名一致或打包为 ZIP。`,
                );
            }

            shpGroups
                .filter((group) => !group.dbf)
                .forEach((group) => {
                    warnings.value.push(
                        `${group.shp.path}: 缺少同名 .dbf，将按几何数据继续解析（属性字段可能为空）。`,
                    );
                });

            const nonShpResources = supported.filter((resource) => {
                const ext = String(resource.ext || '').toLowerCase();
                if (!SHP_SIDECAR_EXTENSIONS.has(ext)) return true;
                return !attachedSidecarPaths.has(resource.path);
            });

            const individualPayloads = nonShpResources
                .map((resource) => buildSingleUploadPayload(resource, overrideCrs, warnings.value))
                .filter(Boolean) as Array<{ content: unknown; type: string; name: string }>;

            const shpPayloads = await Promise.all(
                shpGroups.map((group) => buildShpArchivePayload(group, overrideCrs)),
            );
            const payloads = [...individualPayloads, ...shpPayloads];

            if (!payloads.length) {
                throw new Error('未识别到可导入的数据集');
            }

            const settled = await Promise.all(
                payloads.map(async (payload) => {
                    try {
                        const dispatched = await dispatchGisData(payload);
                        return { ok: true as const, dispatched };
                    } catch (error: any) {
                        return {
                            ok: false as const,
                            error: {
                                entryName: payload.name,
                                kind: payload.type,
                                message: error?.message || String(error),
                                code: error?.code,
                                userMessage: error?.userMessage,
                                notified: !!error?.notified,
                            },
                        };
                    }
                }),
            );

            const mergedPackets: any[] = [];
            const mergedWarnings: string[] = [...warnings.value];
            const mergedErrors: any[] = [];
            const mergedBlobUrls: string[] = [];

            settled.forEach((item) => {
                if (!item.ok) {
                    mergedErrors.push(item.error);
                    return;
                }
                const dispatched = item.dispatched;
                if (Array.isArray(dispatched?.packets)) mergedPackets.push(...dispatched.packets);
                if (Array.isArray(dispatched?.warnings))
                    mergedWarnings.push(...dispatched.warnings);
                if (Array.isArray(dispatched?.errors)) mergedErrors.push(...dispatched.errors);
                if (Array.isArray(dispatched?.blobUrls))
                    mergedBlobUrls.push(...dispatched.blobUrls);
            });

            warnings.value = mergedWarnings;
            errors.value = mergedErrors;

            const hasUnsupportedProjection = mergedErrors.some(
                (item) => String(item?.code || '').toUpperCase() === UNSUPPORTED_PROJECTED_CRS_CODE,
            );
            if (hasUnsupportedProjection && !projectionPopupShown) {
                const alreadyNotified = mergedErrors.some(
                    (item) =>
                        String(item?.code || '').toUpperCase() === UNSUPPORTED_PROJECTED_CRS_CODE &&
                        !!item?.notified,
                );
                projectionPopupShown = true;
                if (!alreadyNotified) {
                    message.error(UNSUPPORTED_PROJECTED_CRS_MESSAGE, {
                        closable: true,
                        duration: 0,
                    });
                }
            }

            blobUrls.value = mergedBlobUrls;
            lastPackets.value = mergedPackets;
            lastPacket.value = mergedPackets[0] || null;
            summary.value = summarizePackets(mergedPackets, mergedErrors);

            return {
                packet: lastPacket.value,
                packets: mergedPackets,
                warnings: warnings.value,
                errors: errors.value,
                summary: summary.value,
                blobUrls: blobUrls.value,
            };
        } catch (error) {
            lastError.value = error;
            if (isUnsupportedProjectedCrsError(error) && !projectionPopupShown) {
                // 这里不置 projectionPopupShown：紧接着就 throw，之后不会再读它
                if (!(error as any)?.notified) {
                    message.error(UNSUPPORTED_PROJECTED_CRS_MESSAGE, {
                        closable: true,
                        duration: 0,
                    });
                }
            }
            throw error;
        } finally {
            isLoading.value = false;
        }
    }

    return {
        isLoading,
        lastError,
        warnings,
        errors,
        summary,
        lastPackets,
        lastPacket,
        blobUrls,
        dispatch,
        revokeBlobUrls,
        createUploadPayloadsFromFiles,
        createUploadPayloadFromFolder,
        createUploadPayloadFromEntries,
    };
}
