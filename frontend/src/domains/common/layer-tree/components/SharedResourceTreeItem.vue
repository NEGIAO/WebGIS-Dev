<template>
    <div
        class="shared-tree-item"
        :style="{ '--node-level': Number(level || 0) }"
    >
        <div
            class="shared-tree-row"
            :class="{ 'is-folder': isFolder, 'is-file': !isFolder }"
        >
            <button
                v-if="isFolder"
                class="shared-tree-toggle"
                :aria-label="expanded ? '折叠' : '展开'"
                @click.stop="toggleFolder"
            >
                <ChevronRight
                    class="shared-tree-chevron"
                    :class="{ open: expanded }"
                    :size="13"
                    :stroke-width="2.2"
                />
            </button>

            <button
                v-if="!isFolder"
                class="shared-tree-file-btn"
                :title="node.path"
                @click="handleFileClick"
            >
                <span class="shared-tree-type">{{ fileTypeLabel }}</span>
                <span class="shared-tree-name">{{ displayName }}</span>
            </button>

            <div
                v-else
                class="shared-tree-folder-label"
                @click="toggleFolder"
            >
                <FolderOpen
                    v-if="expanded"
                    class="shared-tree-folder-icon"
                    :size="14"
                    :stroke-width="1.8"
                />
                <Folder
                    v-else
                    class="shared-tree-folder-icon"
                    :size="14"
                    :stroke-width="1.8"
                />
                <span class="shared-tree-name">{{ displayName }}</span>
                <span class="shared-tree-count">{{ node.fileCount || 0 }}</span>
            </div>
        </div>

        <div
            v-if="isFolder && expanded"
            class="shared-tree-children"
        >
            <SharedResourceTreeItem
                v-for="child in node.children || []"
                :key="child.id"
                :node="child"
                :level="Number(level || 0) + 1"
                @load-resource="forwardLoad"
            />
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { ChevronRight, Folder, FolderOpen } from '@lucide/vue';

defineOptions({ name: 'SharedResourceTreeItem' });

const props = defineProps({
    node: { type: Object, required: true },
    level: { type: Number, default: 0 },
});

const emit = defineEmits(['load-resource']);

const isFolder = computed(() => props.node?.type === 'folder');
const expanded = ref(true);

const fileTypeLabel = computed(() => {
    const type = String(props.node?.resource?.type || '').toUpperCase();
    return type || 'FILE';
});

const displayName = computed(() => {
    const raw = String(props.node?.name || '').trim();
    if (!raw) return '';
    try {
        return decodeURIComponent(raw.replace(/\+/g, '%20'));
    } catch {
        return raw;
    }
});

watch(
    () => props.node,
    (nextNode) => {
        if (!nextNode || nextNode.type !== 'folder') {
            expanded.value = false;
            return;
        }
        // 新节点默认展开，便于首次查看全部共享目录结构。
        expanded.value = true;
    },
    { immediate: true },
);

function toggleFolder() {
    if (!isFolder.value) return;
    expanded.value = !expanded.value;
}

function handleFileClick() {
    if (!props.node?.resource) return;
    emit('load-resource', props.node.resource);
}

function forwardLoad(resource) {
    emit('load-resource', resource);
}
</script>

<style scoped>
.shared-tree-item {
    position: relative;
}

.shared-tree-row {
    min-height: 28px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px 2px calc(4px + (var(--node-level, 0) * 16px));
    border-radius: var(--toc-radius-md);
    transition: background var(--toc-transition-fast);
}

.shared-tree-row:hover {
    background: var(--toc-primary-bg-hover);
}

.shared-tree-toggle {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: var(--toc-radius-sm);
    color: var(--toc-text-secondary);
    cursor: pointer;
    transition:
        color var(--toc-transition-fast),
        background var(--toc-transition-fast);
}

.shared-tree-toggle:hover {
    background: var(--toc-primary-bg);
    color: var(--toc-primary);
}

.shared-tree-chevron {
    transition: transform var(--toc-transition-normal);
}

.shared-tree-chevron.open {
    transform: rotate(90deg);
}

.shared-tree-folder-label {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-brand-dark);
    cursor: pointer;
    user-select: none;
}

.shared-tree-folder-icon {
    flex-shrink: 0;
    color: var(--brand-primary);
    opacity: 0.85;
    transition: opacity var(--toc-transition-fast), transform var(--toc-transition-normal);
}

.shared-tree-folder-label:hover .shared-tree-folder-icon {
    opacity: 1;
    transform: scale(1.08);
}

/* 文件行：去掉描边盒子，扁平化融入树 */
.shared-tree-file-btn {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: transparent;
    color: var(--text-brand-dark);
    border-radius: var(--toc-radius-md);
    padding: 4px 8px;
    cursor: pointer;
    text-align: left;
    transition:
        background var(--toc-transition-fast),
        color var(--toc-transition-fast),
        transform var(--toc-transition-fast);
}

.shared-tree-file-btn:hover {
    background: var(--toc-primary-bg);
    color: var(--text-brand);
}

.shared-tree-file-btn:hover .shared-tree-type {
    box-shadow: 0 2px 6px rgba(var(--brand-primary-dark-rgb), 0.3);
}

.shared-tree-file-btn:active {
    transform: scale(0.98);
}

.shared-tree-type {
    flex-shrink: 0;
    min-width: 36px;
    height: 16px;
    border-radius: 999px;
    background: var(--brand-gradient);
    color: #ffffff;
    font-size: 9px;
    line-height: 16px;
    letter-spacing: 0.3px;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    transition: box-shadow var(--toc-transition-fast);
}

.shared-tree-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--toc-font-sm);
}

.shared-tree-count {
    flex-shrink: 0;
    margin-left: auto;
    font-size: var(--toc-font-xs);
    font-variant-numeric: tabular-nums;
    color: var(--toc-primary);
    border: 1px solid var(--toc-border-light);
    border-radius: 999px;
    padding: 0 7px;
    line-height: 15px;
    background: var(--toc-primary-bg);
}

.shared-tree-children {
    position: relative;
}

.shared-tree-children::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 16px) + 12px);
    top: 0;
    bottom: 4px;
    border-left: 1px solid rgba(var(--brand-primary-rgb), 0.22);
}
</style>
