<template>
    <div class="layer-tree-wrap card">
        <div class="card-title">图层目录</div>
        <div v-if="layerTree.length" class="layer-tree-root">
            <TOCTreeItem
                v-for="node in layerTree"
                :key="node.id"
                :node="node"
                :active-layer-id="activeLayerId"
                @action="handleTreeAction"
            />
        </div>
        <div v-else class="empty">暂无图层</div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import TOCTreeItem from './TOCTreeItem.vue';

const props = defineProps({
    drawLayers: { type: Array, default: () => [] },
    routeLayers: { type: Array, default: () => [] },
    searchLayers: { type: Array, default: () => [] },
    uploadLayers: { type: Array, default: () => [] },
    hasDrawCard: { type: Boolean, default: false },
    overview: { type: Object, default: () => ({ drawCount: 0 }) },
    isRasterLayer: { type: Function, required: true }
});

const emit = defineEmits(['action']);

const expandedState = ref({
    'folder-draw': true,
    'folder-route': true,
    'folder-search': true,
    'folder-upload': true
});

const activeLayerId = ref(null);

function formatLayerDisplayName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '未命名图层';
    try {
        return decodeURIComponent(raw.replace(/\+/g, '%20'));
    } catch {
        return raw;
    }
}

function hasAttributeFeatures(layer) {
    return Array.isArray(layer?.features) && layer.features.length > 0;
}

function canToggleLabel(layer) {
    return !!layer?.autoLabel;
}

function layerHasCoordinates(layer) {
    return Number.isFinite(layer?.longitude) && Number.isFinite(layer?.latitude);
}

function supportsCoordinateOperations(layer) {
    if (!layer) return false;
    if (props.isRasterLayer(layer)) return false;
    return true;
}

function toLayerNode(layer, level, group) {
    const baseNode = {
        id: layer.id,
        name: String(layer.name || ''),
        displayName: formatLayerDisplayName(layer.name),
        type: 'layer',
        visible: layer.visible !== false,
        children: [],
        expanded: false,
        level,
        featureCount: Number(layer.featureCount) || 0,
        labelVisible: layer.labelVisible !== false,
        showCheckbox: true,
        raw: layer,
        draggable: group === 'upload',
        droppable: group === 'upload',
        actions: {
            attribute: hasAttributeFeatures(layer),
            style: group !== 'route' && !props.isRasterLayer(layer),
            label: (group === 'search' || group === 'upload') && canToggleLabel(layer),
            copyCoordinates: supportsCoordinateOperations(layer) && layerHasCoordinates(layer),
            toggleLayerCRS: supportsCoordinateOperations(layer),
            exportLayerData: supportsCoordinateOperations(layer),
            zoom: true,
            remove: true,
            removeTip: group === 'search' ? '清空' : '移除',
            viewEvent: 'view-layer',
            viewPayload: { layerId: layer.id },
            zoomEvent: 'zoom-layer',
            zoomPayload: { layerId: layer.id },
            removeEvent: 'remove-layer',
            removePayload: { layerId: layer.id },
            soloEvent: (group === 'draw' || group === 'upload') ? 'solo-layer' : '',
            soloPayload: { layerId: layer.id }
        }
    };
    if (group === 'route') {
        baseNode.actions.style = false;
        baseNode.actions.label = false;
    }
    return baseNode;
}

function countLeafVisibility(nodes = []) {
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

function folderNode({ id, name, level, children }) {
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
        expanded: expandedState.value[id] !== false,
        level,
        showCheckbox: total > 0
    };
}

function convertToTree() {
    const tree = [];

    if (props.hasDrawCard) {
        const drawChildren = props.drawLayers.length
            ? props.drawLayers.map((layer) => toLayerNode(layer, 1, 'draw'))
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
                    featureCount: Number(props.overview?.drawCount) || 0,
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
                        soloPayload: { interaction: 'ZoomToGraphics' }
                    }
                }
            ];
        tree.push(folderNode({ id: 'folder-draw', name: '绘制图层', level: 0, children: drawChildren }));
    }

    if (props.routeLayers.length) {
        const routeChildren = props.routeLayers.map((layer) => toLayerNode(layer, 1, 'route'));
        tree.push(folderNode({ id: 'folder-route', name: '路线图层', level: 0, children: routeChildren }));
    }

    if (props.searchLayers.length) {
        const searchChildren = props.searchLayers.map((layer) => toLayerNode(layer, 1, 'search'));
        tree.push(folderNode({ id: 'folder-search', name: '搜索结果图层', level: 0, children: searchChildren }));
    }

    if (props.uploadLayers.length) {
        const uploadChildren = props.uploadLayers.map((layer) => toLayerNode(layer, 1, 'upload'));
        tree.push(folderNode({ id: 'folder-upload', name: '上传图层', level: 0, children: uploadChildren }));
    }

    return tree;
}

const layerTree = computed(() => convertToTree());

function findNodeById(nodes, nodeId) {
    for (const node of nodes || []) {
        if (node.id === nodeId) return node;
        if (node.children?.length) {
            const found = findNodeById(node.children, nodeId);
            if (found) return found;
        }
    }
    return null;
}

function collectLeafNodes(node, bucket = []) {
    if (!node) return bucket;
    if (node.type === 'layer') {
        if (node.showCheckbox !== false) bucket.push(node);
        return bucket;
    }
    (node.children || []).forEach((child) => collectLeafNodes(child, bucket));
    return bucket;
}

function handleTreeAction(evt) {
    if (!evt?.type) return;

    if (evt.type === 'layer-selected') {
        activeLayerId.value = evt.layerId;
        return;
    }

    if (evt.type === 'toggle-folder-expand') {
        expandedState.value = {
            ...expandedState.value,
            [evt.nodeId]: !!evt.expanded
        };
        return;
    }

    if (evt.type === 'toggle-folder-visibility') {
        const target = findNodeById(layerTree.value, evt.nodeId);
        const leaves = collectLeafNodes(target);
        leaves.forEach((leaf) => {
            emit('action', {
                type: 'toggle-layer-visibility',
                layerId: leaf.id,
                visible: !!evt.visible
            });
        });
        return;
    }

    emit('action', evt);
}
</script>

<style scoped>
.layer-tree-wrap {
    padding: 12px;
}

.layer-tree-root {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.card {
    border: 1px solid rgba(153, 195, 170, 0.35);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.75) 0%, rgba(248, 253, 250, 0.75) 100%);
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 24px rgba(45, 85, 63, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.card-title {
    font-size: 13px;
    font-weight: 700;
    color: #1f4d36;
    margin-bottom: 8px;
    letter-spacing: 0.3px;
}

.empty {
    color: #8a9d92;
    font-size: 12px;
    padding: 12px 8px;
    text-align: center;
}
</style>
