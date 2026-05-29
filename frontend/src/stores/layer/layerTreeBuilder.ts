/**
 * 图层树构建器
 * 负责构建 TOC 面板的树形结构
 */

import type { LayerStoreLayer, StandardTOCItem } from './layerHelpers';
import {
    formatLayerDisplayName,
    getLayerStandardItem,
    normalizeStandardLayerType,
    getLayerPoiId,
    resolveLayerCapabilities,
    hasAttributeFeatures,
    isRasterLayer,
    canToggleLabel,
    supportsCoordinateOperations,
    layerHasCoordinates,
} from './layerHelpers';

const UPLOAD_DYNAMIC_FOLDER_PREFIX = 'folder-upload-dyn:';

/**
 * 统计叶子节点可见性
 */
export function countLeafVisibility(nodes: any[] = []): { total: number; visible: number } {
    let total = 0;
    let visible = 0;
    for (const node of nodes) {
        if (node.type === 'folder') {
            const sub = countLeafVisibility(node.children || []);
            total += sub.total;
            visible += sub.visible;
            continue;
        }
        if (node.showCheckbox === false) continue;
        total += 1;
        if (node.visible) visible += 1;
    }
    return { total, visible };
}

/**
 * 创建文件夹节点
 */
export function folderNode({
    id,
    name,
    level,
    children,
    expandedState,
}: {
    id: string;
    name: string;
    level: number;
    children: any[];
    expandedState: Record<string, boolean>;
}): any {
    const summary = countLeafVisibility(children);
    const total = summary.total;
    const visible = summary.visible;
    return {
        id,
        name,
        displayName: name,
        type: 'folder',
        visible: total > 0 && visible === total,
        indeterminate: visible > 0 && visible < total,
        children,
        expanded: expandedState[id] !== false,
        level,
        showCheckbox: total > 0,
    };
}

/**
 * 标准化上传文件夹路径
 */
export function normalizeUploadFolderPath(rawParentId: unknown): string {
    let value = String(rawParentId || '').trim();
    if (!value) return '';

    if (value.startsWith(UPLOAD_DYNAMIC_FOLDER_PREFIX)) {
        value = value.slice(UPLOAD_DYNAMIC_FOLDER_PREFIX.length);
    }

    value = value
        .replace(/\\/g, '/')
        .replace(/\s*>\s*/g, '/')
        .replace(/\/+/g, '/');

    return value
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('/');
}

/**
 * 分割上传文件夹路径
 */
export function splitUploadFolderPath(rawPath: string): string[] {
    return normalizeUploadFolderPath(rawPath)
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
}

/**
 * 构建上传文件夹路径链
 */
export function buildUploadFolderPathChain(rawPath: string): string[] {
    const segments = splitUploadFolderPath(rawPath);
    const chain: string[] = [];

    segments.forEach((segment, index) => {
        if (index === 0) {
            chain.push(segment);
            return;
        }
        chain.push(`${chain[index - 1]}/${segment}`);
    });

    return chain;
}

/**
 * 将上传文件夹路径转换为节点 ID
 */
export function toUploadFolderNodeId(rawPath: string): string {
    return `${UPLOAD_DYNAMIC_FOLDER_PREFIX}${rawPath}`;
}

/**
 * 获取上传文件夹显示名称
 */
export function deriveUploadFolderDisplayName(segment: string): string {
    const raw = String(segment || '').trim();
    if (!raw) return '未命名分组';

    const compacted = raw.replace(/^folder[-_:]/i, '').trim();
    const display = formatLayerDisplayName(compacted || raw)
        .replace(/[_]+/g, ' ')
        .trim();

    return display || '未命名分组';
}

type UploadFolderChildRef = { kind: 'folder'; id: string } | { kind: 'layer'; node: any };

type UploadFolderEntry = {
    id: string;
    name: string;
    parentId: string | null;
    orderedChildren: UploadFolderChildRef[];
};

/**
 * 构建上传图层的子节点
 */
export function buildUploadLayerChildren(
    uploadLayers: LayerStoreLayer[],
    expandedState: Record<string, boolean>,
): any[] {
    if (!uploadLayers.length) return [];

    const folderMap = new Map<string, UploadFolderEntry>();
    const rootChildren: UploadFolderChildRef[] = [];
    const rootFolderSeen = new Set<string>();

    function pushRootFolderOnce(folderId: string): void {
        if (!folderId || rootFolderSeen.has(folderId)) return;
        rootFolderSeen.add(folderId);
        rootChildren.push({ kind: 'folder', id: folderId });
    }

    function appendFolderChildOnce(parentEntry: UploadFolderEntry, folderId: string): void {
        if (!folderId) return;

        const exists = parentEntry.orderedChildren.some((child) => {
            return child.kind === 'folder' && child.id === folderId;
        });
        if (exists) return;

        parentEntry.orderedChildren.push({ kind: 'folder', id: folderId });
    }

    function ensureUploadFolderBySegments(segments: string[]): UploadFolderEntry | null {
        if (!segments.length) return null;

        let parentEntry: UploadFolderEntry | null = null;
        let currentPath = '';
        let deepestEntry: UploadFolderEntry | null = null;

        segments.forEach((segment) => {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            const folderId = toUploadFolderNodeId(currentPath);

            let entry = folderMap.get(folderId);
            if (!entry) {
                entry = {
                    id: folderId,
                    name: deriveUploadFolderDisplayName(segment),
                    parentId: parentEntry?.id || null,
                    orderedChildren: [],
                };
                folderMap.set(folderId, entry);
            }

            if (parentEntry) {
                appendFolderChildOnce(parentEntry, entry.id);
            }

            parentEntry = entry;
            deepestEntry = entry;
        });

        return deepestEntry;
    }

    uploadLayers.forEach((layer) => {
        const baseLayerNode = toLayerNode(layer, 1, 'upload');
        const rawParentPath = normalizeUploadFolderPath(layer.standardTocItem?.parentId);
        if (!rawParentPath) {
            rootChildren.push({
                kind: 'layer',
                node: { ...baseLayerNode, level: 1, parentId: null },
            });
            return;
        }

        const segments = splitUploadFolderPath(rawParentPath);
        const rootPath = segments[0] || '';
        const deepestEntry = ensureUploadFolderBySegments(segments);
        if (!deepestEntry) {
            rootChildren.push({
                kind: 'layer',
                node: { ...baseLayerNode, level: 1, parentId: null },
            });
            return;
        }

        deepestEntry.orderedChildren.push({ kind: 'layer', node: baseLayerNode });

        if (rootPath) {
            pushRootFolderOnce(toUploadFolderNodeId(rootPath));
        }
    });

    function buildUploadFolderNode(folderId: string, level: number): any | null {
        const entry = folderMap.get(folderId);
        if (!entry) return null;

        const children = entry.orderedChildren
            .map((child): any | null => {
                if (child.kind === 'folder') {
                    return buildUploadFolderNode(child.id, level + 1);
                }

                return {
                    ...child.node,
                    level: level + 1,
                    parentId: folderId,
                };
            })
            .filter(Boolean);

        return folderNode({
            id: entry.id,
            name: entry.name,
            level,
            children,
            expandedState,
        });
    }

    return rootChildren
        .map((child): any | null => {
            if (child.kind === 'folder') {
                return buildUploadFolderNode(child.id, 1);
            }
            return child.node;
        })
        .filter(Boolean);
}

/**
 * 创建行政区划图层节点
 */
export function toDistrictLayerNode(meta: any, level: number): any {
    const id = String(meta?.id || '').trim();
    const name = String(meta?.name || meta?.adcode || '行政区划').trim() || '行政区划';
    const visible = meta?.visible !== false;
    const featureCount = Number(meta?.featureCount || 0);

    const capabilities = {
        attribute: true,
        style: true,
        label: true,
        copyCoordinates: true,
        toggleLayerCRS: true,
        exportLayerData: true,
        canExportCSV: true,
        canExportTXT: true,
        canExportGeoJSON: true,
        canExportKML: true,
        openAoiPanel: false,
        zoom: true,
        remove: true,
    };

    return toLayerNode(
        {
            id,
            name,
            type: 'geojson',
            sourceType: 'district-boundary',
            visible,
            featureCount,
            opacity: 1,
            capabilities,
            standardTocItem: {
                id,
                name,
                nodeType: 'layer',
                layerType: 'geojson',
                sourceType: 'district-boundary',
                format: 'geojson',
                parentId: 'folder-district',
                visible,
                opacity: 1,
                selected: false,
                expanded: false,
                featureCount,
                capabilities,
                children: [],
                metadata: {
                    ...(meta?.metadata || {}),
                    adcode: String(meta?.adcode || ''),
                    sourceUrl: String(meta?.sourceUrl || ''),
                    updatedAt: String(meta?.updatedAt || ''),
                    sourceType: 'district-boundary',
                },
            },
        } as any,
        level,
        'district',
    );
}

/**
 * 创建图层节点
 */
export function toLayerNode(layer: LayerStoreLayer, level: number, group: string): any {
    const standardItem = getLayerStandardItem(layer);
    const layerType = normalizeStandardLayerType(standardItem?.layerType || layer?.type || '');
    const poiid = getLayerPoiId(layer);
    const isSearchPointLayer = group === 'search' && layerType === 'search';
    const capabilities = resolveLayerCapabilities(layer, group, standardItem);

    const baseNode = {
        id: layer.id,
        name: String(standardItem?.name || layer.name || ''),
        displayName: formatLayerDisplayName(standardItem?.name || layer.name || ''),
        type: 'layer',
        visible: standardItem?.visible !== false && layer.visible !== false,
        children: [],
        expanded: false,
        level,
        featureCount: Number(standardItem?.featureCount) || Number(layer.featureCount) || 0,
        labelVisible: layer.labelVisible !== false,
        showCheckbox: true,
        raw: layer,
        standardTocItem: standardItem,
        layerType,
        sourceType: String(standardItem?.sourceType || layer.sourceType || group),
        format: String(standardItem?.format || layerType || ''),
        opacity: Number.isFinite(layer.opacity)
            ? Number(layer.opacity)
            : Number.isFinite(standardItem?.opacity)
              ? Number(standardItem?.opacity)
              : 1,
        selected: !!standardItem?.selected,
        parentId: standardItem?.parentId || null,
        draggable: group === 'upload',
        droppable: group === 'upload',
        actions: {
            attribute: capabilities.attribute !== false && hasAttributeFeatures(layer),
            style: capabilities.style !== false && group !== 'route' && !isRasterLayer(layer),
            label:
                capabilities.label !== false &&
                (group === 'search' || group === 'upload' || group === 'district') &&
                canToggleLabel(layer),
            copyCoordinates:
                capabilities.copyCoordinates !== false &&
                supportsCoordinateOperations(layer) &&
                layerHasCoordinates(layer),
            toggleLayerCRS:
                capabilities.toggleLayerCRS !== false && supportsCoordinateOperations(layer),
            exportLayerData: capabilities.exportLayerData === true,
            canExportCSV: capabilities.canExportCSV === true,
            canExportTXT: capabilities.canExportTXT === true,
            canExportGeoJSON: capabilities.canExportGeoJSON === true,
            canExportKML: capabilities.canExportKML === true,
            openAoiPanel: capabilities.openAoiPanel === true || isSearchPointLayer,
            aoiPanelPayload: {
                layerId: layer.id,
                layerName: String(layer.name || ''),
                poiid,
            },
            zoom: capabilities.zoom !== false,
            remove: capabilities.remove !== false,
            removeTip: group === 'search' ? '清空' : '移除',
            viewEvent: 'view-layer',
            viewPayload: { layerId: layer.id },
            zoomEvent: 'zoom-layer',
            zoomPayload: { layerId: layer.id },
            removeEvent: 'remove-layer',
            removePayload: { layerId: layer.id },
            soloEvent:
                group === 'draw' || group === 'upload' || group === 'district' ? 'solo-layer' : '',
            soloPayload: { layerId: layer.id },
        },
    };

    if (group === 'route') {
        baseNode.actions.style = false;
        baseNode.actions.label = false;
    }
    return baseNode;
}

/**
 * 构建完整的图层树
 */
export function buildLayerTree({
    drawLayers,
    routeLayers,
    searchLayers,
    uploadLayers,
    districtLayers,
    hasDrawCard,
    drawCount,
    expandedState,
}: {
    drawLayers: LayerStoreLayer[];
    routeLayers: LayerStoreLayer[];
    searchLayers: LayerStoreLayer[];
    uploadLayers: LayerStoreLayer[];
    districtLayers: any[];
    hasDrawCard: boolean;
    drawCount: number;
    expandedState: Record<string, boolean>;
}): any[] {
    const tree: any[] = [];

    if (hasDrawCard) {
        const drawChildren = drawLayers.length
            ? drawLayers.map((layer) => toLayerNode(layer, 1, 'draw'))
            : [
                  {
                      id: 'draw_virtual',
                      name: '绘制图形集合',
                      displayName: '绘制图形集合',
                      type: 'layer',
                      visible: true,
                      children: [],
                      expanded: false,
                      level: 1,
                      featureCount: Number(drawCount) || 0,
                      showCheckbox: false,
                      draggable: false,
                      droppable: false,
                      actions: {
                          attribute: false,
                          style: true,
                          styleTarget: 'draw',
                          label: false,
                          copyCoordinates: false,
                          toggleLayerCRS: false,
                          exportLayerData: false,
                          canExportCSV: false,
                          canExportTXT: false,
                          canExportGeoJSON: false,
                          canExportKML: false,
                          zoom: true,
                          zoomEvent: 'interaction',
                          zoomPayload: { interaction: 'ZoomToGraphics' },
                          remove: true,
                          removeTip: '清空',
                          removeEvent: 'interaction',
                          removePayload: { interaction: 'Clear' },
                          viewEvent: 'interaction',
                          viewPayload: { interaction: 'ViewGraphics' },
                          soloEvent: 'interaction',
                          soloPayload: { interaction: 'ZoomToGraphics' },
                      },
                  },
              ];

        tree.push(
            folderNode({
                id: 'folder-draw',
                name: '绘制图层',
                level: 0,
                children: drawChildren,
                expandedState,
            }),
        );
    }

    if (routeLayers.length) {
        const routeChildren = routeLayers.map((layer) => toLayerNode(layer, 1, 'route'));
        tree.push(
            folderNode({
                id: 'folder-route',
                name: '路线图层',
                level: 0,
                children: routeChildren,
                expandedState,
            }),
        );
    }

    if (searchLayers.length) {
        const searchChildren = searchLayers.map((layer) => toLayerNode(layer, 1, 'search'));
        tree.push(
            folderNode({
                id: 'folder-search',
                name: '搜索结果图层',
                level: 0,
                children: searchChildren,
                expandedState,
            }),
        );
    }

    if (uploadLayers.length) {
        const uploadChildren = buildUploadLayerChildren(uploadLayers, expandedState);
        tree.push(
            folderNode({
                id: 'folder-upload',
                name: '上传图层',
                level: 0,
                children: uploadChildren,
                expandedState,
            }),
        );
    }

    if (districtLayers.length) {
        const districtChildren = districtLayers.map((meta) => toDistrictLayerNode(meta, 1));
        tree.push(
            folderNode({
                id: 'folder-district',
                name: '行政区划',
                level: 0,
                children: districtChildren,
                expandedState,
            }),
        );
    }

    return tree;
}
