<template>
    <div class="layer-panel-container">
        <!-- 图层目录 -->
        <div class="layer-tree-wrap card">
            <div class="card-title">图层目录</div>
            <div class="layer-search-wrap">
                <input
                    v-model="searchQuery"
                    class="layer-search-input"
                    type="text"
                    placeholder="搜索图层..."
                />
                <span
                    v-if="searchQuery"
                    class="search-clear"
                    @click="clearSearch"
                >&times;</span>
            </div>
            <div
                v-if="filteredLayerTree.length"
                class="layer-tree-root"
            >
                <TOCTreeItem
                    v-for="node in filteredLayerTree"
                    :key="node.id"
                    :node="node"
                    :active-layer-id="activeLayerId"
                    :selected-layer-ids="selectedLayerIds"
                    @action="handleTreeAction"
                />
            </div>
            <div
                v-else
                class="empty"
            >
                {{ searchQuery ? '无匹配图层' : '暂无图层' }}
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useLayerStore } from '../../stores';
import TOCTreeItem from './TOCTreeItem.vue';

defineProps({
    drawLayers: { type: Array, default: () => [] },
    routeLayers: { type: Array, default: () => [] },
    searchLayers: { type: Array, default: () => [] },
    uploadLayers: { type: Array, default: () => [] },
    selectedLayerIds: { type: Array, default: () => [] },
    hasDrawCard: { type: Boolean, default: false },
    overview: { type: Object, default: () => ({ drawCount: 0 }) },
    isRasterLayer: { type: Function, required: true },
});

const emit = defineEmits(['action']);
const layerStore = useLayerStore();

const activeLayerId = ref(null);
const searchQuery = ref('');
const layerTree = computed(() => layerStore.layerTree);

function matchesSearch(node, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const name = String(node.displayName || node.name || '').toLowerCase();
    if (name.includes(q)) return true;
    if (node.type === 'folder' && node.children) {
        return node.children.some((child) => matchesSearch(child, query));
    }
    return false;
}

function filterTree(nodes, query) {
    if (!query) return nodes;
    const result = [];
    for (const node of nodes) {
        if (node.type === 'folder') {
            const filteredChildren = filterTree(node.children || [], query);
            const folderMatches = matchesSearch(node, query);
            if (folderMatches || filteredChildren.length > 0) {
                result.push({
                    ...node,
                    children: folderMatches ? (node.children || []) : filteredChildren,
                    expanded: true,
                });
            }
        } else if (matchesSearch(node, query)) {
            result.push(node);
        }
    }
    return result;
}

const filteredLayerTree = computed(() => {
    return filterTree(layerTree.value, searchQuery.value.trim());
});

function clearSearch() {
    searchQuery.value = '';
}

function handleTreeAction(evt) {
    if (!evt?.type) return;

    if (evt.type === 'layer-selected') {
        activeLayerId.value = evt.layerId;
        emit('action', evt);
        return;
    }

    if (evt.type === 'toggle-folder-expand') {
        layerStore.setLayerTreeFolderExpanded(evt.nodeId, !!evt.expanded);
        return;
    }

    if (evt.type === 'toggle-folder-visibility') {
        const leaves = layerStore.getLayerLeafNodesByFolder(evt.nodeId);
        leaves.forEach((leaf) => {
            emit('action', {
                type: 'toggle-layer-visibility',
                layerId: leaf.id,
                visible: !!evt.visible,
            });
        });
        return;
    }

    emit('action', evt);
}
</script>

<style scoped>
.layer-panel-container {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.layer-tree-wrap {
    padding: var(--toc-spacing-lg);
}

.layer-tree-root {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.card {
    border: 1px solid var(--toc-border-light);
    border-radius: var(--toc-radius-lg);
    background: var(--toc-bg-card);
    backdrop-filter: blur(8px);
    box-shadow: var(--toc-shadow-md), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.card-title {
    font-size: var(--toc-font-md);
    font-weight: 700;
    color: var(--toc-card-title);
    margin-bottom: var(--toc-spacing-md);
    letter-spacing: 0.3px;
}

.layer-search-wrap {
    position: relative;
    margin-bottom: var(--toc-spacing-md);
}

.layer-search-input {
    width: 100%;
    padding: var(--toc-spacing-sm) 28px var(--toc-spacing-sm) 10px;
    border: 1px solid var(--toc-border-light);
    border-radius: var(--toc-radius-md);
    font-size: var(--toc-font-sm);
    color: var(--toc-text-primary);
    background: var(--toc-bg-white);
    outline: none;
    transition: border-color var(--toc-transition-slow), box-shadow var(--toc-transition-slow);
    box-sizing: border-box;
}

.layer-search-input:focus {
    border-color: var(--toc-primary);
    box-shadow: 0 0 0 2px var(--toc-primary-bg-hover);
}

.layer-search-input::placeholder {
    color: var(--toc-text-light);
}

.search-clear {
    position: absolute;
    right: var(--toc-spacing-md);
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    color: var(--toc-text-light);
    font-size: 16px;
    line-height: 1;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--toc-radius-full);
    transition: color var(--toc-transition-normal), background var(--toc-transition-normal);
}

.search-clear:hover {
    color: var(--toc-text-primary);
    background: var(--toc-primary-bg);
}

.empty {
    color: var(--toc-text-muted);
    font-size: var(--toc-font-sm);
    padding: var(--toc-spacing-lg) var(--toc-spacing-md);
    text-align: center;
}
</style>
