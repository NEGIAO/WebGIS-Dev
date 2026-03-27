import { ref, shallowRef } from 'vue';
import JSZip from 'jszip';
import { dispatchGisData } from '../core/gis-parser/dataDispatcher';
import { flattenUploadInput, type FlattenedResource } from '../core/gis-parser/decompressor';
import { parseKmlBuffer } from '../core/gis-parser/parsers/kmlParser';
import { groupShpDatasets, parseShpPartsToGeoJSON } from '../core/gis-parser/parsers/shpParser';
import { loadTifBuffer } from '../core/gis-parser/parsers/tifLoader';
import { reprojectGeoJSON, resolveDatasetProjection } from '../core/gis-parser/crs-engine';
import { useLayerStore, type AddLayerInput } from '../stores/layerStore';

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

function parseJsonBuffer(buffer: ArrayBuffer): any {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    return JSON.parse(text);
}

function isSupportedExt(ext = ''): boolean {
    const normalized = String(ext || '').toLowerCase();
    return ['kml', 'geojson', 'json', 'shp', 'tif', 'tiff', 'zip', 'kmz'].includes(normalized);
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

function packetToLayerId(packet: any, index: number): string {
    const raw = String(packet?.entryName || packet?.sourceName || packet?.kind || `layer_${index}`);
    const safe = raw.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 64);
    return `${safe}_${Date.now()}_${index}`;
}

function packetToLayerName(packet: any, index: number): string {
    const raw = String(packet?.entryName || packet?.sourceName || '').trim();
    if (!raw) return `导入图层_${index + 1}`;
    const slashIdx = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
    const filename = slashIdx >= 0 ? raw.slice(slashIdx + 1) : raw;
    const dotIdx = filename.lastIndexOf('.');
    return dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
}

function normalizeProjectionCode(rawProjection: unknown): string {
    const normalized = String(rawProjection || '').trim().toUpperCase();
    if (!normalized) return '';
    if (/^EPSG:\d+$/.test(normalized)) return normalized;
    if (/^\d+$/.test(normalized)) return `EPSG:${normalized}`;
    return normalized;
}

function resolveRenderDataProjection(rawProjection: unknown): 'EPSG:4326' | 'EPSG:3857' {
    const normalized = normalizeProjectionCode(rawProjection);
    if (normalized === 'EPSG:3857') return 'EPSG:3857';
    return 'EPSG:4326';
}

function pickGeojsonLabelField(geojsonData: any): string {
    const feature = Array.isArray(geojsonData?.features) ? geojsonData.features[0] : null;
    const props = feature?.properties;
    if (!props || typeof props !== 'object') return '';

    const candidates = ['name', 'Name', 'NAME', '名称', 'title', 'Title', 'TITLE', 'label', 'Label'];
    for (const key of candidates) {
        const value = (props as Record<string, unknown>)[key];
        if (value !== null && value !== undefined && String(value).trim()) {
            return key;
        }
    }

    const fallback = Object.keys(props).find((key) => {
        if (key === 'geometry' || key === 'style' || key.startsWith('_')) return false;
        const value = (props as Record<string, unknown>)[key];
        return value !== null && value !== undefined && String(value).trim();
    });

    return fallback || '';
}

async function normalizePacketToLayer(packet: any, index: number): Promise<AddLayerInput | null> {
    const id = packetToLayerId(packet, index);
    const name = packetToLayerName(packet, index);
    const style = {
        strokeColor: '#2f7d3c',
        strokeWidth: 2,
        fillColor: '#5fbf7a',
        fillOpacity: 0.2,
        pointRadius: 6
    };

    if (packet?.kind === 'tiff') {
        const sourceUrl = String(packet?.blobUrl || '').trim();
        return {
            id,
            name,
            type: 'raster',
            isRequested: true,
            visible: true,
            opacity: 1,
            olSource: sourceUrl ? { url: sourceUrl } : packet,
            style,
            meta: {
                kind: packet.kind,
                source: 'upload',
                sourceType: 'upload',
                entryName: packet.entryName
            }
        };
    }

    if (packet?.kind === 'geojson') {
        const sourceProjection = normalizeProjectionCode(packet.dataProjection || 'EPSG:4326');
        const needsReproject = !!sourceProjection && !['EPSG:4326', 'EPSG:3857'].includes(sourceProjection);
        const geojsonData = needsReproject
            ? reprojectGeoJSON(packet.geojsonData, sourceProjection, 'EPSG:4326')
            : packet.geojsonData;
        const labelField = pickGeojsonLabelField(geojsonData);

        return {
            id,
            name,
            type: 'vector',
            isRequested: true,
            visible: true,
            opacity: 1,
            olFeatures: geojsonData,
            style,
            meta: {
                kind: packet.kind,
                format: 'geojson',
                source: 'upload',
                sourceType: 'upload',
                autoLabel: true,
                labelField,
                dataProjection: needsReproject ? 'EPSG:4326' : resolveRenderDataProjection(sourceProjection)
            }
        };
    }

    if (packet?.kind === 'kml') {
        return {
            id,
            name,
            type: 'vector',
            isRequested: true,
            visible: true,
            opacity: 1,
            olFeatures: packet.kmlString,
            style,
            meta: {
                kind: packet.kind,
                format: 'kml',
                source: 'upload',
                sourceType: 'upload',
                autoLabel: true,
                dataProjection: normalizeProjectionCode(packet.dataProjection || 'EPSG:4326') || 'EPSG:4326'
            }
        };
    }

    if (packet?.kind === 'shp') {
        const shpParts = packet?.shpParts || {};
        if (!(shpParts.shp instanceof ArrayBuffer) || !(shpParts.dbf instanceof ArrayBuffer)) {
            return null;
        }

        const geojsonData = await parseShpPartsToGeoJSON({
            shp: shpParts.shp,
            dbf: shpParts.dbf,
            shx: shpParts.shx,
            prj: shpParts.prj
        });
        const labelField = pickGeojsonLabelField(geojsonData);

        return {
            id,
            name,
            type: 'vector',
            isRequested: true,
            visible: true,
            opacity: 1,
            olFeatures: geojsonData,
            style,
            meta: {
                kind: packet.kind,
                format: 'geojson',
                source: 'upload',
                sourceType: 'upload',
                autoLabel: true,
                labelField,
                dataProjection: resolveRenderDataProjection(packet.dataProjection)
            }
        };
    }

    return null;
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

    const prjText = group.prj
        ? new TextDecoder('utf-8', { fatal: false }).decode(group.prj.content)
        : '';
    resolveDatasetProjection({ prjText, targetCrs: 'EPSG:4326' });

    const zipped = await zip.generateAsync({ type: 'arraybuffer' });
    return {
        content: zipped,
        type: 'zip',
        name: `${group.key}.zip`
    };
}

function createUploadPayloadsFromFiles(files: File[]): GisDispatchInput[] {
    return (files || []).filter(Boolean).map((file) => ({
        resources: [file],
        type: 'directory',
        name: (file as any).webkitRelativePath || file.name
    }));
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
    const layerStore = useLayerStore();
    const isLoading = ref(false);
    const lastError = ref<unknown>(null);
    const warnings = ref<string[]>([]);
    const errors = ref<any[]>([]);
    const summary = shallowRef<PacketSummary | null>(null);
    const lastPackets = shallowRef<any[]>([]);
    const lastPacket = shallowRef<any>(null);
    const blobUrls = ref<string[]>([]);

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

        try {
            const flattened = await flattenUploadInput(input);
            const supported = flattened.filter((item) => isSupportedExt(item.ext));
            const ignored = flattened.filter((item) => !isSupportedExt(item.ext));

            if (ignored.length) {
                warnings.value.push(`已跳过 ${ignored.length} 个不支持的数据文件`);
            }

            const shpGroups = groupShpDatasets(supported);
            const shpKeys = new Set(shpGroups.map((group) => group.key));

            const nonShpResources = supported.filter((resource) => {
                const ext = String(resource.ext || '').toLowerCase();
                if (!['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(ext)) return true;
                const key = resource.path.replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
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
                            message: error?.message || String(error)
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

            const normalizedLayers = (await Promise.all(
                mergedPackets.map((packet, index) => normalizePacketToLayer(packet, index))
            )).filter(Boolean) as AddLayerInput[];

            normalizedLayers.forEach((layer) => {
                layerStore.addLayer(layer);
            });

            warnings.value = mergedWarnings;
            errors.value = mergedErrors;
            blobUrls.value = mergedBlobUrls;
            lastPackets.value = mergedPackets;
            lastPacket.value = mergedPackets[0] || null;
            summary.value = summarizePackets(mergedPackets, mergedErrors);

            return {
                packet: lastPacket.value,
                packets: mergedPackets,
                layers: normalizedLayers,
                warnings: warnings.value,
                errors: errors.value,
                summary: summary.value,
                blobUrls: blobUrls.value
            };
        } catch (error) {
            lastError.value = error;
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
