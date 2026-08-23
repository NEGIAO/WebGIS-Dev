<template>
    <li
        class="district-tree-node"
        :style="{ '--node-level': Number(level || 0) }"
    >
        <div
            class="node-row"
            :class="{ selected: isSelected }"
        >
            <button
                v-if="hasChildren"
                class="tree-toggle"
                type="button"
                :aria-label="expanded ? '收起子节点' : '展开子节点'"
                @click.stop="toggleExpand"
            >
                <ChevronRight
                    class="chevron"
                    :class="{ open: expanded }"
                    :size="13"
                    :stroke-width="2.2"
                />
            </button>

            <!-- 类型图标：有子级 = 文件夹，叶子 = 区划点 -->
            <span
                class="kind-icon"
                :class="{ 'is-folder': hasChildren }"
            >
                <FolderOpen
                    v-if="hasChildren && expanded"
                    :size="14"
                    :stroke-width="1.8"
                />
                <Folder
                    v-else-if="hasChildren"
                    :size="14"
                    :stroke-width="1.8"
                />
                <MapPin
                    v-else
                    :size="13"
                    :stroke-width="1.8"
                />
            </span>

            <button
                class="node-select-button"
                type="button"
                @click.stop="selectNode"
            >
                <span class="node-label">{{ node.label }}</span>
                <span
                    v-if="node.value"
                    class="node-value"
                    >{{ node.value }}</span
                >
            </button>
        </div>

        <ul
            v-if="hasChildren && expanded"
            class="node-children"
        >
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
import { ChevronRight, Folder, FolderOpen, MapPin } from '@lucide/vue';

defineOptions({ name: 'AdministrativeDivisionTreeNode' });

const props = defineProps({
    node: {
        type: Object,
        required: true,
    },
    level: {
        type: Number,
        default: 0,
    },
    autoExpand: {
        type: Boolean,
        default: false,
    },
    selectedAdcode: {
        type: String,
        default: '',
    },
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
    { immediate: true },
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
        level: Number(props.level) || 0,
    });
}

function emitSelect(payload) {
    emit('select', payload);
}
</script>

<style scoped>
/* 与 TOCTreeItem 同款行几何：18px 级进 + 引导线 */
.district-tree-node {
    list-style: none;
    position: relative;
}

.node-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    border-radius: var(--toc-radius-md);
    padding: 2px 6px 2px calc(4px + (var(--node-level, 0) * 18px));
    cursor: pointer;
    transition:
        background var(--toc-transition-fast),
        box-shadow var(--toc-transition-fast);
}

.node-row:hover:not(.selected) {
    background: rgba(var(--brand-primary-rgb), 0.14);
    box-shadow: inset 0 0 0 1px rgba(var(--brand-primary-rgb), 0.12);
}

/* 选中态：左侧渐变强调条 + 品牌底色（对齐 TOC 激活行） */
.node-row.selected {
    background: var(--toc-bg-active);
}

.node-row.selected::after {
    content: '';
    position: absolute;
    left: calc(var(--node-level, 0) * 18px + 2px);
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 999px;
    background: var(--brand-gradient);
    box-shadow: 0 0 8px rgba(var(--brand-primary-dark-rgb), 0.35);
}

/* 行连接线（二级以上显示） */
.node-row::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 18px) - 9px);
    top: 50%;
    width: 10px;
    border-top: 1px solid rgba(var(--brand-primary-rgb), 0.28);
    transform: translateY(-50%);
    opacity: calc(min(var(--node-level, 0), 1));
}

.tree-toggle {
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

.tree-toggle:hover {
    background: var(--toc-primary-bg);
    color: var(--toc-primary);
}

.chevron {
    transition: transform var(--toc-transition-normal);
}

.chevron.open {
    transform: rotate(90deg);
}

.kind-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    color: var(--toc-text-secondary);
}

.kind-icon.is-folder {
    color: var(--brand-primary);
}

.node-select-button {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 6px;
    border: none;
    background: transparent;
    color: var(--text-brand-dark);
    font: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: inherit;
}

.node-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--toc-font-sm);
    transition: color var(--toc-transition-fast);
}

.node-select-button:hover .node-label {
    color: var(--toc-primary);
}

/* adcode 数值胶囊（对齐 LayerPanel 计数胶囊） */
.node-value {
    flex-shrink: 0;
    font-size: var(--toc-font-xs);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    color: var(--toc-text-light);
    transition: color var(--toc-transition-fast);
}

.node-select-button:hover .node-value {
    color: var(--toc-primary);
}

.node-row.selected .node-label {
    color: var(--toc-primary);
    font-weight: 600;
}

.node-row.selected .node-value {
    color: var(--toc-primary);
}

/* 子级缩进引导线 */
.node-children {
    position: relative;
    margin: 0;
    padding: 0;
}

.node-children::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 18px) + 5px);
    top: 0;
    bottom: 4px;
    border-left: 1px solid rgba(var(--brand-primary-rgb), 0.22);
}
</style>
