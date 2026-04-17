<template>
    <div class="shared-tree-item" :style="{ '--node-level': Number(level || 0) }">
        <div class="shared-tree-row" :class="{ 'is-folder': isFolder, 'is-file': !isFolder }">
            <button
                v-if="isFolder"
                class="shared-tree-toggle"
                :aria-label="expanded ? '折叠' : '展开'"
                @click.stop="toggleFolder"
            >
                <span class="shared-tree-chevron" :class="{ open: expanded }">▸</span>
            </button>
            <span v-else class="shared-tree-toggle shared-tree-toggle-placeholder"></span>

            <button
                v-if="!isFolder"
                class="shared-tree-file-btn"
                :title="node.path"
                @click="handleFileClick"
            >
                <span class="shared-tree-type">{{ fileTypeLabel }}</span>
                <span class="shared-tree-name">{{ displayName }}</span>
            </button>

            <div v-else class="shared-tree-folder-label" @click="toggleFolder">
                <span class="shared-tree-name">{{ displayName }}</span>
                <span class="shared-tree-count">{{ node.fileCount || 0 }}</span>
            </div>
        </div>

        <div v-if="isFolder && expanded" class="shared-tree-children">
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

defineOptions({ name: 'SharedResourceTreeItem' });

const props = defineProps({
    node: { type: Object, required: true },
    level: { type: Number, default: 0 }
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
    { immediate: true }
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
    min-height: 30px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px 3px calc(6px + (var(--node-level, 0) * 16px));
    border-radius: 8px;
}

.shared-tree-row:hover {
    background: linear-gradient(135deg, rgba(116, 175, 144, 0.2) 0%, rgba(235, 247, 240, 0.7) 100%);
}

.shared-tree-toggle {
    border: none;
    background: transparent;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    color: #5f7e6d;
    cursor: pointer;
    padding: 0;
}

.shared-tree-toggle:hover {
    background: rgba(31, 123, 73, 0.08);
    color: #1f7b49;
}

.shared-tree-toggle-placeholder {
    cursor: default;
}

.shared-tree-chevron {
    font-size: 11px;
    line-height: 1;
    transition: transform 0.15s ease;
}

.shared-tree-chevron.open {
    transform: rotate(90deg);
}

.shared-tree-folder-label {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #2f4f3e;
    cursor: pointer;
}

.shared-tree-file-btn {
    min-width: 0;
    flex: 1;
    border: 1px solid rgba(153, 195, 170, 0.28);
    background: rgba(255, 255, 255, 0.68);
    color: #2f4f3e;
    border-radius: 7px;
    padding: 6px 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease;
}

.shared-tree-file-btn:hover {
    border-color: #2f9a57;
    background: #f4faf7;
    color: #1d7541;
}

.shared-tree-type {
    flex-shrink: 0;
    min-width: 34px;
    height: 18px;
    border-radius: 4px;
    background: linear-gradient(135deg, #68c282 0%, #4fb373 100%);
    color: #ffffff;
    font-size: 10px;
    line-height: 18px;
    text-align: center;
    font-weight: 700;
}

.shared-tree-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
}

.shared-tree-count {
    flex-shrink: 0;
    font-size: 10px;
    color: #5f7e6d;
    border: 1px solid #d4e6db;
    border-radius: 10px;
    padding: 1px 6px;
    line-height: 1.4;
    background: rgba(246, 252, 249, 0.9);
}

.shared-tree-children {
    position: relative;
}

.shared-tree-children::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 16px) + 12px);
    top: 0;
    bottom: 0;
    border-left: 1px solid rgba(87, 113, 100, 0.35);
}
</style>
