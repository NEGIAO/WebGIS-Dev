import { ref, shallowRef } from 'vue';
import JSZip from 'jszip';
import { dispatchGisData } from '../utils/gis/dataDispatcher';
import { flattenUploadInput, type FlattenedResource } from '../utils/gis/decompressor';
import { parseKmlBuffer } from '../utils/gis/parsers/kmlParser';
import { groupShpDatasets } from '../utils/gis/parsers/shpParser';
import { loadTifBuffer } from '../utils/gis/parsers/tifLoader';
import {
    createUnsupportedProjectedCrsError,
    isUnsupportedProjectedCrsError,
    reprojectGeoJSON,
    resolveDatasetProjection,
    UNSUPPORTED_PROJECTED_CRS_CODE,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE
} from '../utils/gis/crs-engine';
import { useMessage } from './useMessage';

type GisDispatchInput = {
    resources?: Array<File | Blob | any>;
    content?: unknown;
    type?: string;
    name?: string;
};

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

const SHP_SIDECAR_EXTENSIONS = new Set(['shp', 'shx', 'dbf', 'prj', 'cpg']);

function extOf(path = ''): string {
    const normalized = String(path || '').toLowerCase();
    const idx = normalized.lastIndexOf('.');
    if (idx < 0 || idx === normalized.length - 1) return '';
    return normalized.slice(idx + 1);
}

function stemOf(path = ''): string {
    const normalized = String(path || '').replace(/\\/g, '/');
    const base = normalized.split('/').pop() || normalized;
    const idx = base.lastIndexOf('.');
    if (idx < 0) return base;
    return base.slice(0, idx);
}

function stemKeyOf(path = ''): string {
    const normalized = String(path || '').replace(/\\/g, '/').trim();
    const idx = normalized.lastIndexOf('.');
    return (idx > 0 ? normalized.slice(0, idx) : normalized).toLowerCase();
}

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
    return ['kml', 'geojson', 'json', 'shp', 'shx', 'dbf', 'prj', 'cpg', 'tif', 'tiff', 'zip', 'kmz'].includes(normalized);
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
        byType
    };
}

function buildSingleUploadPayload(resource: FlattenedResource): { content: unknown; type: string; name: string } | null {
    const ext = String(resource.ext || '').toLowerCase();

    if (ext === 'kml') {
        const parsed = parseKmlBuffer(resource.content);
        resolveDatasetProjection({ kmlText: parsed.content, targetCrs: 'EPSG:4326' });
        return { content: parsed.content, type: 'kml', name: resource.path };
    }

    if (ext === 'geojson' || ext === 'json') {
        const raw = parseJsonBuffer(resource.content);
        const projection = resolveDatasetProjection({ targetCrs: 'EPSG:4326' });
        const projected = projection.needsTransform
            ? reprojectGeoJSON(raw, projection.sourceCrs, projection.targetCrs)
            : raw;
        return {
            content: JSON.stringify(projected),
            type: ext,
            name: resource.path
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

async function buildShpArchivePayload(group: ReturnType<typeof groupShpDatasets>[number]): Promise<{ content: ArrayBuffer; type: string; name: string }> {
    const zip = new JSZip();
    const baseName = stemOf(group.shp.path);

    zip.file(`${baseName}.shp`, group.shp.content);
    if (group.shx) zip.file(`${baseName}.shx`, group.shx.content);
    if (group.dbf) zip.file(`${baseName}.dbf`, group.dbf.content);
    if (group.prj) zip.file(`${baseName}.prj`, group.prj.content);
    if (group.cpg) zip.file(`${baseName}.cpg`, group.cpg.content);

    const prjText = decodeMaybeText(group.prj?.content);
    const projection = resolveDatasetProjection({ prjText, targetCrs: 'EPSG:4326' });
    
    // Warn if PRJ exists but could not be resolved, but allow import to continue
    // The actual reproject will happen during parsing
    if (group.prj && !projection.prjResolved && prjText.trim()) {
        const message = useMessage();
        message.warning(
            `数据 "${baseName}" 使用了未识别的投影坐标系: ${projection.prjName || '未知'}。将尝试自动转换为 WGS84，如有偏差请重新配置。`,
            { duration: 6000 }
        );
    }

    const zipped = await zip.generateAsync({ type: 'arraybuffer' });
    return {
        content: zipped,
        type: 'zip',
        name: `${group.key}.zip`
    };
}

function createUploadPayloadsFromFiles(files: File[]): GisDispatchInput {
    const normalizedFiles = (files || []).filter(Boolean);
    const firstName = normalizedFiles[0]
        ? ((normalizedFiles[0] as any).webkitRelativePath || normalizedFiles[0].name)
        : '多文件上传';

    return {
        resources: normalizedFiles,
        type: 'directory',
        name: firstName || '多文件上传'
    };
}

function createUploadPayloadFromFolder(files: File[]): GisDispatchInput {
    return {
        resources: files || [],
        type: 'directory',
        name: files?.[0]?.webkitRelativePath?.split('/')?.[0] || '文件夹上传'
    };
}

function createUploadPayloadFromEntries(entries: any[]): GisDispatchInput {
    return {
        resources: entries || [],
        type: 'directory',
        name: '拖拽导入'
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

        try {
            const flattened = await flattenUploadInput(input);
            const supported = flattened.filter((item) => isSupportedExt(item.ext));
            const ignored = flattened.filter((item) => !isSupportedExt(item.ext));

            if (ignored.length) {
                warnings.value.push(`已跳过 ${ignored.length} 个不支持的数据文件`);
            }

            const shpGroups = groupShpDatasets(supported);
            const shpKeys = new Set(shpGroups.map((group) => String(group.key || '').toLowerCase()));

            const orphanSidecars = supported.filter((resource) => {
                const ext = String(resource.ext || '').toLowerCase();
                if (!SHP_SIDECAR_EXTENSIONS.has(ext)) return false;
                return !shpKeys.has(stemKeyOf(resource.path));
            });

            if (orphanSidecars.length) {
                warnings.value.push(`检测到 ${orphanSidecars.length} 个未匹配 .shp 的 sidecar 文件（.dbf/.shx/.prj/.cpg），已自动跳过。`);
            }

            shpGroups
                .filter((group) => !group.dbf)
                .forEach((group) => {
                    warnings.value.push(`${group.shp.path}: 缺少同名 .dbf，将按几何数据继续解析（属性字段可能为空）。`);
                });

            const nonShpResources = supported.filter((resource) => {
                const ext = String(resource.ext || '').toLowerCase();
                if (!SHP_SIDECAR_EXTENSIONS.has(ext)) return true;
                const key = stemKeyOf(resource.path);
                return !shpKeys.has(key);
            });

            const individualPayloads = nonShpResources
                .map((resource) => buildSingleUploadPayload(resource))
                .filter(Boolean) as Array<{ content: unknown; type: string; name: string }>;

            const shpPayloads = await Promise.all(shpGroups.map((group) => buildShpArchivePayload(group)));
            const payloads = [...individualPayloads, ...shpPayloads];

            if (!payloads.length) {
                throw new Error('未识别到可导入的数据集');
            }

            const settled = await Promise.all(payloads.map(async (payload) => {
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
                            notified: !!error?.notified
                        }
                    };
                }
            }));

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
                if (Array.isArray(dispatched?.warnings)) mergedWarnings.push(...dispatched.warnings);
                if (Array.isArray(dispatched?.errors)) mergedErrors.push(...dispatched.errors);
                if (Array.isArray(dispatched?.blobUrls)) mergedBlobUrls.push(...dispatched.blobUrls);
            });

            warnings.value = mergedWarnings;
            errors.value = mergedErrors;

            const hasUnsupportedProjection = mergedErrors.some((item) => String(item?.code || '').toUpperCase() === UNSUPPORTED_PROJECTED_CRS_CODE);
            if (hasUnsupportedProjection && !projectionPopupShown) {
                const alreadyNotified = mergedErrors.some((item) => String(item?.code || '').toUpperCase() === UNSUPPORTED_PROJECTED_CRS_CODE && !!item?.notified);
                projectionPopupShown = true;
                if (!alreadyNotified) {
                    message.error(UNSUPPORTED_PROJECTED_CRS_MESSAGE, { closable: true, duration: 0 });
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
                blobUrls: blobUrls.value
            };
        } catch (error) {
            lastError.value = error;
            if (isUnsupportedProjectedCrsError(error) && !projectionPopupShown) {
                projectionPopupShown = true;
                if (!(error as any)?.notified) {
                    message.error(UNSUPPORTED_PROJECTED_CRS_MESSAGE, { closable: true, duration: 0 });
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
        createUploadPayloadFromEntries
    };
}
