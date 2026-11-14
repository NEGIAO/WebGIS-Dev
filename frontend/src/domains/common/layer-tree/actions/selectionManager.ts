import { normalizeTocLayerId, normalizeTocLayerIdList } from '../protocol';

function scheduleSelectionChunk() {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        return new Promise<void>((resolve) => {
            window.requestIdleCallback(() => resolve(), { timeout: 16 });
        });
    }

    return new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}

export function normalizeLayerIdList(ids: any = []) {
    return normalizeTocLayerIdList(ids);
}

export function findTreeNodeByIdRecursive(nodes: any = [], nodeId = '') : any {
    const targetId = normalizeTocLayerId(nodeId);
    if (!targetId) return null;

    for (const node of Array.isArray(nodes) ? nodes : []) {
        if (!node) continue;
        if (normalizeTocLayerId(node.id) === targetId) return node;

        const children = Array.isArray(node.children) ? node.children : [];
        if (!children.length) continue;

        const found = findTreeNodeByIdRecursive(children, targetId);
        if (found) return found;
    }

    return null;
}

export function collectLeafLayerIdsRecursive(node: any, bucket: string[] = []) {
    if (!node) return bucket;

    if (node.type === 'layer') {
        const nodeId = normalizeTocLayerId(node.id);
        if (nodeId) bucket.push(nodeId);
        return bucket;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
        collectLeafLayerIdsRecursive(child, bucket);
    }

    return bucket;
}

function summarizeFolderSelectionRecursive(node: any, selectedSet: Set<string>) {
    if (!node) return { total: 0, selected: 0 };

    if (node.type === 'layer') {
        const nodeId = normalizeTocLayerId(node.id);
        if (!nodeId) return { total: 0, selected: 0 };
        return {
            total: 1,
            selected: selectedSet.has(nodeId) ? 1 : 0,
        };
    }

    let total = 0;
    let selected = 0;
    const children = Array.isArray(node.children) ? node.children : [];

    for (const child of children) {
        const childSummary = summarizeFolderSelectionRecursive(child, selectedSet);
        total += childSummary.total;
        selected += childSummary.selected;
    }

    return { total, selected };
}

export function resolveFolderSelectionState(node: any, selectedLayerIdsOrSet: string[] | Set<string> = []) {
    const selectedSet =
        selectedLayerIdsOrSet instanceof Set
            ? selectedLayerIdsOrSet
            : new Set(normalizeLayerIdList(selectedLayerIdsOrSet));

    const summary = summarizeFolderSelectionRecursive(node, selectedSet);

    return {
        totalCount: summary.total,
        selectedCount: summary.selected,
        isAllSelected: summary.total > 0 && summary.total === summary.selected,
        hasAnySelected: summary.selected > 0,
        isPartialSelected: summary.selected > 0 && summary.selected < summary.total,
    };
}

export function pruneSelectedLayerIds(selectedLayerIds: any = [], availableLayerIds: any[] = []) {
    const availableSet = new Set(normalizeLayerIdList(availableLayerIds));
    if (!availableSet.size) return [];

    return normalizeLayerIdList(selectedLayerIds).filter((id) => availableSet.has(id));
}

export function applyRecursiveSelection({
    selectedLayerIds = [],
    treeNodes = [],
    targetNodeId = '',
    checked = true,
    availableLayerIds = [],
}: {
    selectedLayerIds?: any[];
    treeNodes?: any[];
    targetNodeId?: string;
    checked?: boolean;
    availableLayerIds?: any[];
} = {}) {
    const selectedSet = new Set(normalizeLayerIdList(selectedLayerIds));
    const targetNode = findTreeNodeByIdRecursive(treeNodes, targetNodeId);
    if (!targetNode) return Array.from(selectedSet);

    const candidateIds = normalizeLayerIdList(collectLeafLayerIdsRecursive(targetNode, []));
    if (!candidateIds.length) return Array.from(selectedSet);

    const availableSet = new Set(normalizeLayerIdList(availableLayerIds));

    // 递归遍历仅执行一次，状态只在最后提交一次，避免大 KML（数百要素）触发多次响应式重渲染。
    candidateIds.forEach((id) => {
        if (availableSet.size > 0 && !availableSet.has(id)) return;
        if (checked) {
            selectedSet.add(id);
            return;
        }
        selectedSet.delete(id);
    });

    return Array.from(selectedSet);
}

export interface RecursiveSelectionOptions {
    selectedLayerIds?: any[];
    treeNodes?: any[];
    targetNodeId?: string;
    checked?: boolean;
    availableLayerIds?: any[];
    chunkSize?: number;
    shouldCancel?: () => boolean;
}

export async function applyRecursiveSelectionChunked({
    selectedLayerIds = [],
    treeNodes = [],
    targetNodeId = '',
    checked = true,
    availableLayerIds = [],
    chunkSize = 180,
    shouldCancel,
}: RecursiveSelectionOptions = {}) {
    const selectedSet = new Set(normalizeLayerIdList(selectedLayerIds));
    if (typeof shouldCancel === 'function' && shouldCancel()) {
        return Array.from(selectedSet);
    }

    const targetNode = findTreeNodeByIdRecursive(treeNodes, targetNodeId);
    if (!targetNode) return Array.from(selectedSet);

    const candidateIds = normalizeLayerIdList(collectLeafLayerIdsRecursive(targetNode, []));
    if (!candidateIds.length) return Array.from(selectedSet);

    const availableSet = new Set(normalizeLayerIdList(availableLayerIds));
    const size = Math.max(1, Number(chunkSize) || 1);

    for (let i = 0; i < candidateIds.length; i += size) {
        if (typeof shouldCancel === 'function' && shouldCancel()) {
            return Array.from(selectedSet);
        }

        const chunk = candidateIds.slice(i, i + size);

        chunk.forEach((id) => {
            if (availableSet.size > 0 && !availableSet.has(id)) return;
            if (checked) {
                selectedSet.add(id);
                return;
            }
            selectedSet.delete(id);
        });

        if (i + size < candidateIds.length) {
            // 分帧处理大批量节点，避免单帧长任务造成 UI 卡顿。
            // 常见场景：KML 文件夹包含上百个要素节点。
            await scheduleSelectionChunk();
        }
    }

    return Array.from(selectedSet);
}

export function resolveBatchTargetLayerIds({
    inputLayerIds = [],
    fallbackLayerId = '',
    selectedLayerIds = [],
    availableLayerIds = [],
}: {
    inputLayerIds?: any[];
    fallbackLayerId?: any;
    selectedLayerIds?: any[];
    availableLayerIds?: any[];
} = {}) {
    const availableSet = new Set(normalizeLayerIdList(availableLayerIds));

    const inputTargets = normalizeLayerIdList(inputLayerIds).filter((id) => availableSet.has(id));
    if (inputTargets.length > 0) return inputTargets;

    const fallback = normalizeTocLayerId(fallbackLayerId);
    if (fallback && availableSet.has(fallback)) {
        const selectedSet = new Set(normalizeLayerIdList(selectedLayerIds));
        if (selectedSet.has(fallback) && selectedSet.size > 0) {
            return Array.from(selectedSet).filter((id) => availableSet.has(id));
        }
        return [fallback];
    }

    return [];
}
