<template>
    <div
        class="toc-item"
        :class="[`kind-${node.type}`, { expanded: !!node.expanded }]"
        :style="{ '--node-level': Number(node.level || 0) }"
    >
        <div
            class="toc-row"
            :class="{
                'is-folder': node.type === 'folder',
                'is-leaf': node.type === 'layer',
                'is-active': node.type === 'layer' && node.id === activeLayerId,
                'is-multi-selected': isLayerMultiSelected,
            }"
            @click="handlePrimaryClick"
            @contextmenu.prevent="openContextMenuFromEvent"
            :draggable="!!node.draggable"
            @dragstart="handleDragStart"
            @dragover.prevent="handleDragOver"
            @drop="handleDrop"
        >
            <button
                v-if="node.type === 'folder'"
                class="tree-toggle"
                :aria-label="node.expanded ? '折叠' : '展开'"
                @click.stop="
                    emitAction('toggle-folder-expand', {
                        nodeId: node.id,
                        expanded: !node.expanded,
                    })
                "
            >
                <span
                    class="chevron"
                    :class="{ open: !!node.expanded }"
                    >▸</span
                >
            </button>
            <span
                v-else
                class="tree-toggle tree-toggle-placeholder"
            ></span>

            <label
                class="row-label"
                @click.stop
            >
                <input
                    v-if="node.showCheckbox !== false"
                    type="checkbox"
                    :checked="!!node.visible"
                    :ref="node.type === 'folder' ? setFolderCheckboxRef : null"
                    @change="handleToggleVisibility"
                />
                <span
                    v-if="!isRenaming"
                    class="name"
                    :title="node.displayName || node.name"
                    @dblclick.stop="startRename"
                    >{{ node.displayName || node.name }}</span
                >
                <input
                    v-else
                    ref="renameInputRef"
                    class="rename-input"
                    type="text"
                    :value="renameValue"
                    @input="renameValue = $event.target.value"
                    @keydown.enter="commitRename"
                    @keydown.escape="cancelRename"
                    @blur="commitRename"
                    @click.stop
                />
                <span
                    v-if="node.type === 'layer' && node.id === activeLayerId"
                    class="active-indicator"
                    >●</span
                >
            </label>

            <span
                v-if="node.type === 'layer'"
                class="feature-badge"
                >{{ node.featureCount || 0 }}</span
            >

            <button
                v-if="menuItems.length"
                class="more-btn"
                aria-label="更多操作"
                @click.stop="openContextMenuFromButton"
            >
                •••
            </button>
        </div>

        <div
            v-if="node.type === 'folder' && node.expanded"
            class="toc-children"
        >
            <TOCTreeItem
                v-for="child in node.children || []"
                :key="child.id"
                :node="child"
                :active-layer-id="activeLayerId"
                :selected-layer-ids="selectedLayerIds"
                @action="emit('action', $event)"
            />
        </div>

        <teleport to="body">
            <div
                v-if="menuVisible"
                ref="menuRef"
                class="toc-context-menu"
                :style="{ left: `${menuX}px`, top: `${menuY}px` }"
                @contextmenu.prevent
            >
                <template
                    v-for="item in menuItems"
                    :key="item.key"
                >
                    <div
                        v-if="item.divider"
                        class="menu-divider"
                    ></div>
                    <div
                        v-else-if="item.key === 'opacity'"
                        class="menu-opacity-item"
                    >
                        <span class="menu-item-label">{{ item.label }}</span>
                        <input
                            type="range"
                            class="opacity-slider"
                            min="0"
                            max="1"
                            step="0.05"
                            :value="item.opacity ?? 1"
                            @input="handleOpacityChange($event.target.value)"
                        />
                        <span class="opacity-value">{{ Math.round((item.opacity ?? 1) * 100) }}%</span>
                    </div>
                    <button
                        v-else
                        class="menu-item"
                        :class="{ danger: !!item.danger }"
                        @click="handleMenuCommand(item.key)"
                    >
                        {{ item.label }}
                    </button>
                </template>
            </div>
        </teleport>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { isValidLabel } from '../../utils/biz';
import {
    resolveFolderSelectionState,
    buildContextMenuItems,
    dispatchContextMenuCommand,
} from '../../composables/map/toc';

/**
 * TOCTreeItem - 地理信息系统图层树节点组件
 *
 * 标注内容验证规则（isValidLabel）：
 * ✅ 显示标注菜单项的条件：
 *   - 标注内容不为 null/undefined
 *   - 不是空字符串
 *   - 长度不超过100字符（可配置）
 *   - 不包含乱码或过多特殊字符（特殊字符比例 < 50%）
 *   - 不包含过多连续的无效符号序列
 * ❌ 不予显示的情况：
 *   - 标注为 null 或 undefined
 *   - 空字符串或仅空格
 *   - 超过最大长度限制
 *   - 检测为乱码或控制字符过多
 *   - 特殊符号比例过高
 */

defineOptions({ name: 'TOCTreeItem' });

const props = defineProps({
    node: { type: Object, required: true },
    activeLayerId: { type: String, default: null },
    selectedLayerIds: { type: Array, default: () => [] },
});

const emit = defineEmits(['action']);
const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuRef = ref(null);
const isRenaming = ref(false);
const renameValue = ref('');
const renameInputRef = ref(null);

const selectedLayerIdSet = computed(() => {
    const ids = Array.isArray(props.selectedLayerIds) ? props.selectedLayerIds : [];
    return new Set(ids.map((id) => String(id || '').trim()).filter(Boolean));
});

const isLayerMultiSelected = computed(() => {
    if (props.node?.type !== 'layer') return false;
    const layerId = String(props.node?.id || '').trim();
    if (!layerId) return false;
    return selectedLayerIdSet.value.has(layerId);
});

const folderSelectionState = computed(() => {
    if (props.node?.type !== 'folder') {
        return {
            totalCount: 0,
            selectedCount: 0,
            isAllSelected: false,
            hasAnySelected: false,
            isPartialSelected: false,
        };
    }

    return resolveFolderSelectionState(props.node, selectedLayerIdSet.value);
});

const menuCapabilities = computed(() => {
    const actions = props.node?.actions || {};
    const canToggleLabel =
        !!actions.label && isValidLabel(props.node?.raw?.name || props.node?.name, 100).valid;
    const canExportData = !!actions.exportLayerData;
    const canExportCSV = actions.canExportCSV !== false && canExportData;
    const canExportTXT = actions.canExportTXT !== false && canExportData;
    const canExportGeoJSON = actions.canExportGeoJSON !== false && canExportData;
    const canExportKML = actions.canExportKML !== false && canExportData;

    return {
        canView: !!actions.viewEvent,
        canSolo: !!actions.soloEvent,
        canOpenAttributeTable: !!actions.attribute,
        canStyle: !!actions.style,
        canOpenAoiPanel: !!actions.openAoiPanel,
        canToggleLabel,
        isLabelVisible: props.node?.labelVisible !== false,
        canCopyCoordinates: !!actions.copyCoordinates,
        canToggleLayerCRS: !!actions.toggleLayerCRS,
        canExportData,
        canExportCSV,
        canExportTXT,
        canExportGeoJSON,
        canExportKML,
        canZoom: !!actions.zoom,
        canRemove: !!actions.remove,
        removeLabel: actions.removeTip || '移除图层',
        currentOpacity: props.node?.opacity ?? 1,
    };
});

const menuItems = computed(() => {
    return buildContextMenuItems({
        node: props.node,
        capabilities: menuCapabilities.value,
        selectionState: {
            selectedLayerIds: Array.from(selectedLayerIdSet.value),
            currentNodeId: props.node?.id,
            isCurrentLayerSelected: isLayerMultiSelected.value,
            folderSelectionState: folderSelectionState.value,
        },
    });
});

function emitAction(type, payload = {}) {
    emit('action', { type, ...payload });
}

function setFolderCheckboxRef(el) {
    if (!el) return;
    el.indeterminate = !!props.node?.indeterminate;
}

function closeContextMenu() {
    menuVisible.value = false;
}

function normalizeMenuPosition() {
    const el = menuRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;

    let x = menuX.value;
    let y = menuY.value;

    if (rect.right > window.innerWidth - gap) {
        x = Math.max(gap, window.innerWidth - rect.width - gap);
    }
    if (rect.bottom > window.innerHeight - gap) {
        y = Math.max(gap, window.innerHeight - rect.height - gap);
    }

    menuX.value = x;
    menuY.value = y;
}

function openContextMenuAt(x, y) {
    if (!menuItems.value.length) return;

    menuX.value = Number(x) || 0;
    menuY.value = Number(y) || 0;
    menuVisible.value = true;

    nextTick(() => {
        normalizeMenuPosition();
    });
}

function openContextMenuFromEvent(event) {
    openContextMenuAt(event.clientX, event.clientY);
}

function openContextMenuFromButton(event) {
    const rect = event.currentTarget?.getBoundingClientRect?.();
    if (rect) {
        openContextMenuAt(rect.right - 4, rect.bottom + 6);
        return;
    }
    openContextMenuAt(event.clientX, event.clientY);
}

function handleMenuCommand(key) {
    if (key === 'rename') {
        closeContextMenu();
        startRename();
        return;
    }

    const events = dispatchContextMenuCommand({
        key,
        node: props.node,
        selectedLayerIds: Array.from(selectedLayerIdSet.value),
    });

    events.forEach((evt) => {
        emitAction(evt.type, evt.payload || {});
    });

    closeContextMenu();
}

function handleToggleVisibility(event) {
    const visible = !!event?.target?.checked;
    if (props.node.type === 'folder') {
        emitAction('toggle-folder-visibility', { nodeId: props.node.id, visible });
        return;
    }
    emitAction('toggle-layer-visibility', { layerId: props.node.id, visible });
}

function handlePrimaryClick() {
    if (props.node.type === 'layer') {
        emitAction('layer-selected', { layerId: props.node.id });
    }
}

function handleGlobalPointerDown(event) {
    if (!menuVisible.value) return;
    const menuEl = menuRef.value;
    if (menuEl && menuEl.contains(event.target)) {
        return;
    }
    closeContextMenu();
}

function startRename() {
    if (props.node.type !== 'layer') return;
    renameValue.value = props.node.displayName || props.node.name || '';
    isRenaming.value = true;
    nextTick(() => {
        renameInputRef.value?.select?.();
    });
}

function commitRename() {
    if (!isRenaming.value) return;
    const newName = renameValue.value.trim();
    isRenaming.value = false;
    if (newName && newName !== (props.node.displayName || props.node.name)) {
        emitAction('rename-layer', { layerId: props.node.id, newName });
    }
}

function cancelRename() {
    isRenaming.value = false;
}

function handleOpacityChange(value) {
    const opacity = Math.max(0, Math.min(1, Number(value) || 0));
    emitAction('change-layer-opacity', { layerId: props.node.id, opacity });
}

function handleDragStart() {
    if (!props.node.draggable) return;
    emitAction('drag-layer-start', { layerId: props.node.id });
}

function handleDragOver() {
    if (!props.node.droppable) return;
}

function handleDrop() {
    if (!props.node.droppable) return;
    emitAction('drop-layer', { layerId: props.node.id });
}

onMounted(() => {
    window.addEventListener('pointerdown', handleGlobalPointerDown);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
});

onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', handleGlobalPointerDown);
    window.removeEventListener('resize', closeContextMenu);
    window.removeEventListener('scroll', closeContextMenu, true);
});
</script>

<style scoped>
.toc-item {
    position: relative;
}

.toc-row {
    position: relative;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: var(--toc-spacing-sm);
    border-radius: var(--toc-radius-md);
    padding: var(--toc-spacing-xs) var(--toc-spacing-md) var(--toc-spacing-xs) calc(6px + (var(--node-level, 0) * 18px));
    transition: all var(--toc-transition-normal);
    cursor: pointer;
    user-select: none;
}

.toc-row:hover {
    background: var(--toc-bg-hover);
}

.toc-row.is-active {
    background: var(--toc-bg-active);
    border-left: 3px solid var(--toc-primary);
    padding-left: calc(3px + (var(--node-level, 0) * 18px));
}

.toc-row.is-active .name {
    color: var(--toc-primary);
    font-weight: 500;
}

.toc-row.is-active:hover {
    background: var(--toc-bg-active-hover);
}

.toc-row.is-multi-selected {
    background: var(--toc-bg-selected);
    box-shadow: inset 0 0 0 1px var(--toc-border-selected);
}

.toc-row.is-multi-selected .name {
    color: var(--toc-selected-text);
}

.toc-row::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 18px) - 9px);
    top: 50%;
    width: 10px;
    border-top: 1px solid var(--toc-tree-line);
    transform: translateY(-50%);
    opacity: calc(min(var(--node-level, 0), 0.6));
    transition: opacity var(--toc-transition-normal);
}

.toc-row.is-active::before {
    opacity: 0;
}

.tree-toggle {
    border: none;
    background: transparent;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    color: var(--toc-text-secondary);
    transition: color var(--toc-transition-normal);
    border-radius: var(--toc-radius-sm);
}

.tree-toggle:hover {
    background: var(--toc-primary-bg);
    color: var(--toc-primary);
}

.tree-toggle-placeholder {
    cursor: default;
}

.chevron {
    transition: transform var(--toc-transition-normal);
    font-size: 11px;
    line-height: 1;
}

.chevron.open {
    transform: rotate(90deg);
}

.row-label {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    transition: all var(--toc-transition-normal);
}

.name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--toc-font-sm);
    color: var(--toc-text-dark);
    transition: color var(--toc-transition-normal);
}

.active-indicator {
    flex-shrink: 0;
    font-size: 8px;
    color: var(--toc-primary);
    opacity: 0;
    transition: opacity var(--toc-transition-normal);
}

.toc-row.is-active .active-indicator {
    opacity: 1;
}

.feature-badge {
    flex-shrink: 0;
    font-size: var(--toc-font-xs);
    color: var(--toc-text-secondary);
    border: 1px solid var(--toc-badge-border);
    background: linear-gradient(135deg, rgba(242, 248, 244, 0.9) 0%, rgba(235, 244, 239, 0.9) 100%);
    border-radius: var(--toc-radius-lg);
    padding: 2px var(--toc-spacing-md);
    line-height: 1.4;
    transition: all var(--toc-transition-normal);
}

.toc-row:hover .feature-badge {
    border-color: var(--toc-badge-border-hover);
    background: var(--toc-badge-bg-hover);
}

.toc-row.is-active .feature-badge {
    color: var(--toc-primary);
    border-color: var(--toc-border-active);
    background: var(--toc-badge-bg-active);
}

.more-btn {
    margin-left: auto;
    border: 1px solid var(--toc-border-medium);
    background: transparent;
    color: var(--toc-text-secondary);
    border-radius: 6px;
    min-width: 28px;
    height: 28px;
    line-height: 1;
    padding: 0 6px;
    cursor: pointer;
    opacity: 0;
    transition: all var(--toc-transition-normal);
    font-size: var(--toc-font-lg);
    font-weight: bold;
}

.more-btn:hover {
    border-color: var(--toc-primary);
    color: var(--toc-primary);
    background: linear-gradient(135deg, rgba(31, 123, 72, 0.263) 0%, rgba(31, 123, 73, 0.05) 100%);
}

.more-btn:active {
    transform: scale(0.95);
}

.toc-row:hover .more-btn,
.toc-row:focus-within .more-btn,
.toc-row.is-active .more-btn {
    opacity: 1;
}

.toc-row.is-active .more-btn {
    border-color: var(--toc-primary);
    color: var(--toc-primary);
}

.toc-row.is-leaf {
    background-color: var(--toc-bg-leaf);
    transition: background-color var(--toc-transition-slow);
}
.toc-row.is-folder {
    background-color: var(--toc-bg-folder);
    transition: background-color var(--toc-transition-slow);
}

.toc-children {
    position: relative;
}

.toc-children::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 18px) + 5px);
    top: 0;
    bottom: 0px;
    border-left: 2px solid var(--toc-tree-guide);
}

.toc-context-menu {
    position: fixed;
    z-index: 1200;
    min-width: 180px;
    border: 1px solid var(--toc-menu-border);
    border-radius: var(--toc-radius-lg);
    background: var(--toc-bg-menu);
    box-shadow: var(--toc-shadow-lg);
    padding: var(--toc-spacing-sm);
    backdrop-filter: blur(4px);
}

.menu-item {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--toc-text-primary);
    text-align: left;
    border-radius: var(--toc-radius-md);
    padding: var(--toc-spacing-md) 11px;
    font-size: var(--toc-font-sm);
    cursor: pointer;
    transition: all var(--toc-transition-fast);
}

.menu-item:hover {
    background: linear-gradient(135deg, rgba(230, 218, 200, 0.4) 0%, rgba(190, 225, 215, 0.3) 100%);
    color: var(--toc-primary);
}

.menu-item:active {
    transform: scale(0.98);
}

.menu-item.danger {
    color: var(--toc-danger);
}

.menu-item.danger:hover {
    background: var(--toc-danger-bg);
    color: var(--toc-danger-hover);
}

.menu-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(67, 83, 69, 0.4) 50%, transparent 100%);
    margin: var(--toc-spacing-xs) 0;
}

.rename-input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--toc-primary);
    border-radius: var(--toc-radius-sm);
    padding: 1px var(--toc-spacing-xs);
    font-size: var(--toc-font-sm);
    color: var(--toc-text-dark);
    background: var(--toc-bg-input);
    outline: none;
    box-shadow: 0 0 0 2px var(--toc-primary-bg-hover);
}

.menu-opacity-item {
    display: flex;
    align-items: center;
    gap: var(--toc-spacing-md);
    padding: var(--toc-spacing-sm) 11px;
    font-size: var(--toc-font-sm);
    color: var(--toc-text-primary);
}

.menu-item-label {
    flex-shrink: 0;
    min-width: 42px;
}

.opacity-slider {
    flex: 1;
    height: 4px;
    accent-color: var(--toc-primary);
    cursor: pointer;
}

.opacity-value {
    flex-shrink: 0;
    width: 36px;
    text-align: right;
    font-size: 11px;
    color: var(--toc-text-secondary);
}
</style>
