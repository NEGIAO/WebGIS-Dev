<template>
    <li class="district-tree-node" :class="{ selected: isSelected }">
        <div class="node-row" :style="{ paddingLeft: `${Math.max(level, 0) * 12}px` }">
            <button
                v-if="hasChildren"
                class="expand-button"
                type="button"
                :aria-label="expanded ? '收起子节点' : '展开子节点'"
                @click.stop="toggleExpand"
            >
                {{ expanded ? '▾' : '▸' }}
            </button>
            <span v-else class="expand-placeholder"></span>

            <button class="node-select-button" type="button" @click.stop="selectNode">
                <span class="node-label">{{ node.label }}</span>
                <span class="node-value">{{ node.value }}</span>
            </button>
        </div>

        <ul v-if="hasChildren && expanded" class="node-children">
            <AdministrativeDivisionTreeNode
                v-for="child in node.children"
                :key="`${child.value}_${child.label}`"
                :node="child"
                :level="level + 1"
                :auto-expand="autoExpand"
                :selected-adcode="selectedAdcode"
                @select="emitSelect"
            />
        </ul>
    </li>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

defineOptions({ name: 'AdministrativeDivisionTreeNode' });

const props = defineProps({
    node: {
        type: Object,
        required: true
    },
    level: {
        type: Number,
        default: 0
    },
    autoExpand: {
        type: Boolean,
        default: false
    },
    selectedAdcode: {
        type: String,
        default: ''
    }
});

const emit = defineEmits(['select']);
const expanded = ref(false);

const hasChildren = computed(() => {
    return Array.isArray(props.node?.children) && props.node.children.length > 0;
});

const isSelected = computed(() => {
    const activeAdcode = String(props.selectedAdcode || '').trim();
    const currentAdcode = String(props.node?.value || '').trim();
    return !!activeAdcode && !!currentAdcode && activeAdcode === currentAdcode;
});

watch(
    () => props.autoExpand,
    (nextAutoExpand) => {
        if (nextAutoExpand) {
            expanded.value = true;
            return;
        }

        if (props.level >= 1) {
            expanded.value = false;
        }
    },
    { immediate: true }
);

function toggleExpand() {
    if (!hasChildren.value) return;
    expanded.value = !expanded.value;
}

function selectNode() {
    const label = String(props.node?.label || '').trim();
    const value = String(props.node?.value || '').trim();
    if (!value) return;

    emit('select', {
        label,
        value,
        level: Number(props.level) || 0
    });
}

function emitSelect(payload) {
    emit('select', payload);
}
</script>

<style scoped>
.district-tree-node {
    list-style: none;
}

.node-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
}

.expand-button,
.expand-placeholder {
    width: 18px;
    min-width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.expand-placeholder {
    opacity: 0;
}

.expand-button {
    border: none;
    background: transparent;
    color: #93b8a6;
    cursor: pointer;
    border-radius: 4px;
}

.expand-button:hover {
    background: rgba(62, 124, 96, 0.24);
    color: #d6f2e5;
}

.node-select-button {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: #d9ede4;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    cursor: pointer;
    text-align: left;
}

.node-select-button:hover {
    background: rgba(22, 148, 98, 0.24);
}

.node-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}

.node-value {
    font-size: 11px;
    color: #7ed9b8;
    opacity: 0.9;
}

.selected > .node-row > .node-select-button {
    background: rgba(23, 195, 126, 0.28);
    color: #f4fff9;
}

.node-children {
    margin: 0;
    padding: 0;
}
</style>
