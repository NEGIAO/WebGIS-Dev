<template>
    <div class="layer-panel-container">
        <!-- 图层目录 -->
        <div class="layer-tree-wrap card">
            <div class="card-head">
                <div class="head-left">
                    <span
                        class="title-badge"
                        aria-hidden="true"
                    >
                        <FolderTree :size="13" />
                    </span>
                    <span class="card-title">图层目录</span>
                </div>
                <span
                    v-if="matchedCount"
                    class="count-pill"
                >{{ matchedCount }}</span>
            </div>
            <div
                class="layer-search-wrap"
                :class="{ focused: isSearchFocused }"
            >
                <Search
                    class="search-icon"
                    :size="14"
                />
                <input
                    v-model="searchQuery"
                    class="layer-search-input"
                    type="text"
                    placeholder="搜索图层..."
                    @focus="isSearchFocused = true"
                    @blur="isSearchFocused = false"
                />
                <Transition name="clear-pop">
                    <button
                        v-if="searchQuery"
                        class="search-clear"
                        type="button"
                        aria-label="清除搜索"
                        @click="clearSearch"
                    >
                        <X :size="11" />
                    </button>
                </Transition>
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
                <component
                    :is="searchQuery ? SearchX : Inbox"
                    :size="26"
                    stroke-width="1.5"
                />
                <span>{{ searchQuery ? '无匹配图层' : '暂无图层' }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { FolderTree, Search, SearchX, Inbox, X } from '@lucide/vue';
import { useLayerStore } from '@/stores';
import TOCTreeItem from '@common/layer-tree/components/TOCTreeItem.vue';
import { RSVC_NODE_PREFIX, RSVC_GROUP_NODE_ID } from '@common/basemap/remoteServices';

defineProps({
    selectedLayerIds: { type: Array, default: () => [] },
});

const emit = defineEmits(['action']);
const layerStore = useLayerStore();

const activeLayerId = ref(null);
const searchQuery = ref('');
const isSearchFocused = ref(false);
const layerTree = computed(() => layerStore.layerTree);

function countLeaves(nodes) {
    return nodes.reduce((sum, node) => {
        if (node.type === 'folder') return sum + countLeaves(node.children || []);
        return sum + 1;
    }, 0);
}

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

const matchedCount = computed(() => countLeaves(filteredLayerTree.value));

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
        // 「在线服务」分组/服务节点：整体显隐语义必须原样上抛，
        // 由 TOCPanel 的 rsvc 分流器直调注册表（展开成叶子会丢失服务级开关）
        const nodeId = String(evt.nodeId || '');
        if (nodeId.startsWith(RSVC_NODE_PREFIX) || nodeId === RSVC_GROUP_NODE_ID) {
            emit('action', evt);
            return;
        }
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

// 事件委托：全局监听点击事件，关闭所有右键菜单
function handleGlobalPointerDown(event) {
    // 检查点击是否在菜单外部
    const menuElements = document.querySelectorAll('.toc-context-menu');
    for (const menuEl of menuElements) {
        if (menuEl.contains(event.target)) {
            return; // 点击在菜单内部，不关闭
        }
    }
    // 点击在菜单外部，关闭所有菜单
    // 通过 CSS 类选择器找到所有打开的菜单并隐藏
    menuElements.forEach((el) => {
        el.style.display = 'none';
    });
}

onMounted(() => {
    window.addEventListener('pointerdown', handleGlobalPointerDown);
});

onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', handleGlobalPointerDown);
});
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

.card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--toc-spacing-md);
}

.head-left {
    display: flex;
    align-items: center;
    gap: 7px;
}

.title-badge {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: var(--brand-gradient);
    color: #ffffff;
    box-shadow:
        0 3px 8px rgba(var(--brand-primary-dark-rgb), 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.card-title {
    font-size: var(--toc-font-md);
    font-weight: 700;
    color: var(--toc-card-title);
    letter-spacing: 0.3px;
}

.count-pill {
    font-size: var(--toc-font-xs);
    font-weight: 600;
    line-height: 15px;
    color: var(--toc-primary);
    background: var(--toc-primary-bg);
    border: 1px solid var(--toc-border-light);
    padding: 1px 8px;
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
}

.layer-search-wrap {
    position: relative;
    margin-bottom: var(--toc-spacing-md);
}

.layer-search-input {
    width: 100%;
    padding: 7px 30px 7px 32px;
    border: 1px solid var(--toc-border-light);
    border-radius: 999px;
    font-size: var(--toc-font-sm);
    color: var(--toc-text-primary);
    background: var(--toc-bg-white);
    outline: none;
    transition:
        border-color var(--toc-transition-slow),
        box-shadow var(--toc-transition-slow),
        background var(--toc-transition-slow);
    box-sizing: border-box;
}

.layer-search-input:focus {
    border-color: var(--toc-primary-light);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 0 3px var(--toc-primary-bg-hover);
}

.layer-search-input::placeholder {
    color: var(--toc-text-light);
}

.search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--toc-text-light);
    pointer-events: none;
    transition: color var(--toc-transition-normal);
}

.layer-search-wrap.focused .search-icon {
    color: var(--toc-primary);
}

.search-clear {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 17px;
    height: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    border-radius: 999px;
    background: rgba(var(--brand-primary-rgb), 0.12);
    color: var(--toc-text-secondary);
    transition:
        background var(--toc-transition-fast),
        color var(--toc-transition-fast),
        transform var(--toc-transition-fast);
}

.search-clear:hover {
    background: rgba(var(--brand-primary-dark-rgb), 0.22);
    color: var(--toc-text-dark);
    transform: translateY(-50%) scale(1.08);
}

.clear-pop-enter-active,
.clear-pop-leave-active {
    transition:
        opacity 0.15s ease,
        transform 0.15s ease;
}

.clear-pop-enter-from,
.clear-pop-leave-to {
    opacity: 0;
    transform: translateY(-50%) scale(0.6);
}

.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    color: var(--toc-text-muted);
    font-size: var(--toc-font-sm);
    padding: 22px var(--toc-spacing-md) 16px;
    text-align: center;
}

.empty svg {
    opacity: 0.45;
}
</style>
