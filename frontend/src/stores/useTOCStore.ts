import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export type TOCLayerMetadata = {
    id: string;
    name: string;
    adcode: string;
    sourceType: string;
    sourceUrl: string;
    visible: boolean;
    featureCount: number;
    extent: number[];
    longitude?: number;
    latitude?: number;
    features?: any[];
    updatedAt: string;
    metadata: Record<string, any>;
};

export type DistrictTreeNode = {
    label: string;
    value: string;
    children: DistrictTreeNode[];
};

function normalizeExtent(rawExtent: unknown): number[] {
    if (!Array.isArray(rawExtent) || rawExtent.length < 4) return [];

    return rawExtent
        .slice(0, 4)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
}

function normalizeText(value: unknown, fallback = ''): string {
    const compact = String(value || '').trim();
    return compact || fallback;
}

function normalizeTreeNodes(inputNodes: any[] = []): DistrictTreeNode[] {
    if (!Array.isArray(inputNodes)) return [];

    return inputNodes
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
            const label = String(item.label || '').trim() || '未命名行政区';
            const value = String(item.value || '').trim();
            const children = normalizeTreeNodes(item.children);
            return {
                label,
                value,
                children
            };
        })
        .filter((node) => Boolean(node.value) || node.children.length > 0);
}

function countTreeNodes(nodes: DistrictTreeNode[] = []): number {
    let total = 0;
    for (const node of nodes) {
        total += 1;
        if (Array.isArray(node.children) && node.children.length) {
            total += countTreeNodes(node.children);
        }
    }
    return total;
}

async function tryLoadTreeFile(fileName: string, baseUrl: string): Promise<DistrictTreeNode[]> {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = `${normalizedBase}${String(fileName || '').replace(/^\/+/, '')}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
        throw new Error(`请求失败（${response.status}）: ${fileName}`);
    }

    const payload = await response.json();
    const normalized = normalizeTreeNodes(payload);
    if (!normalized.length) {
        throw new Error(`文件存在但内容为空：${fileName}`);
    }

    return normalized;
}

/**
 * TOC Store: 记录额外图层元信息（例如行政区边界）和行政区划树数据，供 TOC 组件或调试面板消费。
 */
export const useTOCStore = defineStore('tocStore', () => {
    // ========== 图层元数据管理 ==========
    const layerMetadataMap = ref<Record<string, TOCLayerMetadata>>({});

    const layerMetadataList = computed(() => {
        return Object.values(layerMetadataMap.value)
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    });

    function upsertLayerMeta(meta: Partial<TOCLayerMetadata> & { id: string }): TOCLayerMetadata {
        const layerId = normalizeText(meta.id);
        if (!layerId) {
            throw new Error('upsertLayerMeta 需要有效的 id');
        }

        const previous = layerMetadataMap.value[layerId];
        const longitude = Number.isFinite(meta.longitude)
            ? Number(meta.longitude)
            : Number.isFinite(previous?.longitude)
                ? Number(previous.longitude)
                : undefined;
        const latitude = Number.isFinite(meta.latitude)
            ? Number(meta.latitude)
            : Number.isFinite(previous?.latitude)
                ? Number(previous.latitude)
                : undefined;

        const nextItem: TOCLayerMetadata = {
            id: layerId,
            name: normalizeText(meta.name, previous?.name || '未命名图层'),
            adcode: normalizeText(meta.adcode, previous?.adcode || ''),
            sourceType: normalizeText(meta.sourceType, previous?.sourceType || 'unknown'),
            sourceUrl: normalizeText(meta.sourceUrl, previous?.sourceUrl || ''),
            visible: meta.visible !== undefined ? Boolean(meta.visible) : previous?.visible !== false,
            featureCount: Number.isFinite(meta.featureCount)
                ? Number(meta.featureCount)
                : Number(previous?.featureCount || 0),
            extent: normalizeExtent(meta.extent ?? previous?.extent ?? []),
            longitude,
            latitude,
            features: Array.isArray(meta.features) ? meta.features : (Array.isArray(previous?.features) ? previous.features : []),
            updatedAt: normalizeText(meta.updatedAt, new Date().toISOString()),
            metadata: {
                ...(previous?.metadata || {}),
                ...((meta.metadata && typeof meta.metadata === 'object') ? meta.metadata : {})
            }
        };

        layerMetadataMap.value = {
            ...layerMetadataMap.value,
            [layerId]: nextItem
        };

        return nextItem;
    }

    function removeLayerMeta(layerId: string): void {
        const id = normalizeText(layerId);
        if (!id || !layerMetadataMap.value[id]) return;

        const nextMap = { ...layerMetadataMap.value };
        delete nextMap[id];
        layerMetadataMap.value = nextMap;
    }

    function clearLayerMeta(): void {
        layerMetadataMap.value = {};
    }

    function getLayerMeta(layerId: string): TOCLayerMetadata | null {
        const id = normalizeText(layerId);
        return layerMetadataMap.value[id] || null;
    }

    // ========== 行政区划树数据管理 ==========
    const districtTree = ref<DistrictTreeNode[]>([]);
    const districtTreeLoading = ref(false);
    const districtTreeError = ref('');
    const districtTreeHasLoaded = ref(false);
    const selectedDistrictNodes = ref<Record<string, DistrictTreeNode>>({});

    const districtTreeTotalNodeCount = computed(() => countTreeNodes(districtTree.value));

    const selectedDistrictNodesList = computed(() => {
        return Object.values(selectedDistrictNodes.value)
            .sort((a, b) => String(b.value).localeCompare(String(a.value)));
    });

    async function loadDistrictTree(baseUrl: string = '/', forceReload: boolean = false): Promise<void> {
        if (districtTreeLoading.value) return;
        if (districtTreeHasLoaded.value && !forceReload) return;

        districtTreeLoading.value = true;
        districtTreeError.value = '';

        const candidates = ['adcode_tree.json', 'adcode.json'];

        try {
            let loaded: DistrictTreeNode[] = [];

            for (const fileName of candidates) {
                try {
                    loaded = await tryLoadTreeFile(fileName, baseUrl);
                    break;
                } catch {
                    loaded = [];
                }
            }

            if (!loaded.length) {
                throw new Error('未能加载行政区划树文件（adcode_tree.json / adcode.json），请检查 public 目录数据文件。');
            }

            districtTree.value = loaded;
            districtTreeHasLoaded.value = true;
        } catch (error: unknown) {
            let detail = '行政区划树加载失败。';
            if (error instanceof Error) {
                detail = error.message;
            }
            districtTreeError.value = detail;
        } finally {
            districtTreeLoading.value = false;
        }
    }

    function selectDistrictNode(node: DistrictTreeNode): void {
        const layerId = `district_${node.value}`;
        if (selectedDistrictNodes.value[layerId]) {
            delete selectedDistrictNodes.value[layerId];
            removeLayerMeta(layerId);
        } else {
            selectedDistrictNodes.value = {
                ...selectedDistrictNodes.value,
                [layerId]: node
            };
        }
    }

    function deselectDistrictNode(adcode: string): void {
        const layerId = `district_${adcode}`;
        if (selectedDistrictNodes.value[layerId]) {
            delete selectedDistrictNodes.value[layerId];
            removeLayerMeta(layerId);
        }
    }

    function getSelectedDistrictNode(adcode: string): DistrictTreeNode | null {
        const layerId = `district_${adcode}`;
        return selectedDistrictNodes.value[layerId] || null;
    }

    function clearDistrictTree(): void {
        districtTree.value = [];
        districtTreeHasLoaded.value = false;
        districtTreeError.value = '';
    }

    function clearSelectedDistricts(): void {
        const adcodes = Object.keys(selectedDistrictNodes.value);
        adcodes.forEach((layerId) => {
            removeLayerMeta(layerId);
        });
        selectedDistrictNodes.value = {};
    }

    return {
        // 图层元数据
        layerMetadataMap,
        layerMetadataList,
        upsertLayerMeta,
        removeLayerMeta,
        clearLayerMeta,
        getLayerMeta,

        // 行政区划树
        districtTree,
        districtTreeLoading,
        districtTreeError,
        districtTreeHasLoaded,
        districtTreeTotalNodeCount,
        loadDistrictTree,
        clearDistrictTree,

        // 行政区划 TOC 管理
        selectedDistrictNodes,
        selectedDistrictNodesList,
        selectDistrictNode,
        deselectDistrictNode,
        getSelectedDistrictNode,
        clearSelectedDistricts,

        // 辅助转换函数（供外部使用）
        districtNodeToLayerMeta: (node: DistrictTreeNode, featureCount: number = 0) => ({
            id: `district_${node.value}`,
            name: node.label,
            adcode: node.value,
            sourceType: 'district-boundary',
            sourceUrl: `https://geo.datav.aliyun.com/areas_v3/bound/${node.value}.json`,
            visible: true,
            featureCount,
            extent: [],
            longitude: undefined,
            latitude: undefined,
            features: [],
            updatedAt: new Date().toISOString(),
            metadata: {
                nodeType: 'layer',
                category: 'administrative-division',
                parentNodeLabel: node.label
            }
        })
    };
});
