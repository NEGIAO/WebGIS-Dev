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
                'is-off': !isVisible,
            }"
            :draggable="!!node.draggable"
            @click="handlePrimaryClick"
            @contextmenu.prevent="openContextMenuFromEvent"
            @dragstart="handleDragStart"
            @dragover.prevent
            @drop="handleDrop"
        >
            <span
                v-if="node.draggable"
                class="drag-grip"
                title="拖拽排序"
            >
                <GripVertical
                    :size="12"
                    :stroke-width="2"
                />
            </span>

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
                <ChevronRight
                    class="chevron"
                    :class="{ open: !!node.expanded }"
                    :size="13"
                    :stroke-width="2.2"
                />
            </button>

            <!-- 类型图标：文件夹 / 图层 -->
            <span
                class="kind-icon"
                :class="{ 'is-folder': node.type === 'folder' }"
            >
                <FolderOpen
                    v-if="node.type === 'folder' && node.expanded"
                    :size="14"
                    :stroke-width="1.8"
                />
                <Folder
                    v-else-if="node.type === 'folder'"
                    :size="14"
                    :stroke-width="1.8"
                />
                <Layers
                    v-else
                    :size="13"
                    :stroke-width="1.8"
                />
            </span>

            <div
                class="row-label"
                @click.stop
            >
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
                ></span>
            </div>

            <span
                v-if="node.type === 'layer' && (node.featureCount || 0) > 0"
                class="feature-badge"
                >{{ node.featureCount }}</span
            >

            <!-- 可见性：ESRI 式眼睛开关（文件夹支持半选态） -->
            <button
                class="visibility-btn"
                :class="{ off: !isVisible, partial: isPartialVisible }"
                :aria-label="isVisible ? '隐藏图层' : '显示图层'"
                :title="isPartialVisible ? '部分子图层可见' : isVisible ? '隐藏图层' : '显示图层'"
                @click.stop="handleToggleVisibility"
            >
                <EyeOff
                    v-if="!isVisible"
                    :size="14"
                    :stroke-width="1.9"
                />
                <Eye
                    v-else
                    :size="14"
                    :stroke-width="1.9"
                />
            </button>

            <button
                v-if="menuItems.length"
                class="more-btn"
                aria-label="更多操作"
                @click.stop="openContextMenuFromButton"
            >
                <MoreHorizontal
                    :size="15"
                    :stroke-width="2"
                />
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
                        <component
                            :is="item.icon"
                            v-if="item.icon"
                            class="menu-icon"
                            :size="13"
                            :stroke-width="1.8"
                        />
                        <span>{{ item.label }}</span>
                    </button>
                </template>
            </div>
        </teleport>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
    ArrowLeftRight,
    ChevronRight,
    Copy,
    Droplet,
    Eye,
    EyeOff,
    FileDown,
    Focus,
    Folder,
    FolderOpen,
    GripVertical,
    Info,
    Layers,
    ListMinus,
    ListPlus,
    ListX,
    MapPin,
    MoreHorizontal,
    Paintbrush,
    Pencil,
    PencilLine,
    Table,
    Tag,
    Trash2,
    ZoomIn,
} from '@lucide/vue';
import { isValidLabel } from '@common/utils/labelValidator';
import { useMessage } from '@common/shell/useMessage';
import {
    resolveFolderSelectionState,
    buildContextMenuItems,
    dispatchContextMenuCommand,
} from '../';

defineOptions({ name: 'TOCTreeItem' });

const props = defineProps({
    node: { type: Object, required: true },
    activeLayerId: { type: String, default: null },
    selectedLayerIds: { type: Array, default: () => [] },
});

const emit = defineEmits(['action']);
const message = useMessage();
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

/* 可见性（ESRI 式眼睛开关）：off = 隐藏，partial = 文件夹部分可见 */
const isVisible = computed(() => props.node?.visible !== false);
const isPartialVisible = computed(() => !!props.node?.indeterminate && isVisible.value);

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
        canEdit: !!actions.edit,
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

const MENU_ICONS = {
    view: Eye,
    solo: Focus,
    edit: PencilLine,
    rename: Pencil,
    attribute: Table,
    style: Paintbrush,
    'open-aoi-panel': MapPin,
    label: Tag,
    copy: Copy,
    opacity: Droplet,
    properties: Info,
    zoom: ZoomIn,
    remove: Trash2,
    'batch-show': Eye,
    'batch-hide': EyeOff,
    'multi-select-add': ListPlus,
    'folder-multi-select-add': ListPlus,
    'multi-select-remove': ListMinus,
    'folder-multi-select-remove': ListMinus,
    'multi-select-clear': ListX,
};

function resolveMenuIcon(key) {
    const k = String(key || '');
    if (MENU_ICONS[k]) return MENU_ICONS[k];
    if (k.includes('export')) return FileDown;
    if (k.startsWith('convert-')) return ArrowLeftRight;
    return null;
}

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
    }).map((item) => (item.divider ? item : { ...item, icon: resolveMenuIcon(item.key) }));
});

function emitAction(type, payload = {}) {
    emit('action', { type, ...payload });
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

    try {
        const events = dispatchContextMenuCommand({
            key,
            node: props.node,
            selectedLayerIds: Array.from(selectedLayerIdSet.value),
        });

        events.forEach((evt) => {
            emitAction(evt.type, evt.payload || {});
        });
    } catch (_error) {
        // 右键菜单命令分发失败,以 message 提示用户
        message.error('菜单命令执行失败，请重试');
    } finally {
        closeContextMenu();
    }
}

function handleToggleVisibility() {
    const visible = !isVisible.value;
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

function _handleGlobalPointerDown(event) {
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

function handleDrop() {
    if (!props.node.droppable) return;
    emitAction('drop-layer', { layerId: props.node.id });
}

// 注册全局点击监听器：点击菜单外部时自动关闭
onMounted(() => {
    document.addEventListener('pointerdown', _handleGlobalPointerDown, true);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', _handleGlobalPointerDown, true);
});

// 暴露 closeContextMenu 给父组件使用（事件委托模式）
defineExpose({ closeContextMenu });
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

/* 隐藏的图层整行淡化（ESRI 惯例） */
.toc-row.is-off .name,
.toc-row.is-off .kind-icon {
    opacity: 0.5;
}

/* 提高特异性并排除激活/多选行，避免被 is-leaf/is-folder 的后置背景覆盖 */
.toc-row:not(.is-active):not(.is-multi-selected):hover {
    background: rgba(var(--brand-primary-rgb), 0.18);
    box-shadow: inset 0 0 0 1px rgba(var(--brand-primary-rgb), 0.14);
}

.toc-row.is-active {
    background: var(--toc-bg-active);
}

/* 激活态左侧强调条：伪元素实现，不产生布局位移 */
.toc-row.is-active::after {
    content: '';
    position: absolute;
    left: calc(var(--node-level, 0) * 18px + 2px);
    top: 7px;
    bottom: 7px;
    width: 3px;
    border-radius: 999px;
    background: var(--brand-gradient);
    box-shadow: 0 0 8px rgba(var(--brand-primary-dark-rgb), 0.35);
}

.toc-row.is-active .name {
    color: var(--toc-primary);
    font-weight: 600;
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
    border-top: 1px solid rgba(var(--brand-primary-rgb), 0.28);
    transform: translateY(-50%);
    opacity: calc(min(var(--node-level, 0), 1));
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

.chevron {
    transition: transform var(--toc-transition-normal);
}

.chevron.open {
    transform: rotate(90deg);
}

/* 拖拽排序把手：仅可拖拽行显示，悬停浮现 */
.drag-grip {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    margin-left: -4px;
    color: var(--toc-text-light);
    opacity: 0;
    cursor: grab;
    transition: opacity var(--toc-transition-normal);
}

.toc-row:hover .drag-grip {
    opacity: 0.85;
}

/* 类型图标：文件夹品牌色 / 图层中性色 */
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

/* 可见性：ESRI 式眼睛开关 */
.visibility-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--toc-primary);
    cursor: pointer;
    transition:
        color var(--toc-transition-fast),
        background var(--toc-transition-fast),
        transform var(--toc-transition-fast);
}

.visibility-btn:hover {
    background: var(--toc-primary-bg-hover);
    transform: scale(1.06);
}

.visibility-btn:active {
    transform: scale(0.9);
}

.visibility-btn.off {
    color: var(--toc-text-light);
}

.visibility-btn.partial {
    opacity: 0.55;
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

/* 激活态呼吸圆点 */
.active-indicator {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand-gradient);
    box-shadow: 0 0 6px rgba(var(--brand-primary-dark-rgb), 0.45);
    animation: activePulse 1.8s ease-in-out infinite;
}

@keyframes activePulse {
    50% {
        transform: scale(0.7);
        opacity: 0.55;
    }
}

.feature-badge {
    flex-shrink: 0;
    font-size: var(--toc-font-xs);
    font-variant-numeric: tabular-nums;
    color: var(--toc-text-secondary);
    border: 1px solid var(--toc-badge-border);
    background: rgba(255, 255, 255, 0.55);
    border-radius: 999px;
    padding: 1px 7px;
    line-height: 14px;
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
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--toc-text-secondary);
    border-radius: var(--toc-radius-md);
    width: 24px;
    height: 24px;
    padding: 0;
    cursor: pointer;
    opacity: 0;
    transform: translateX(4px);
    transition:
        opacity var(--toc-transition-normal),
        transform var(--toc-transition-normal),
        color var(--toc-transition-fast),
        background var(--toc-transition-fast);
}

.more-btn:hover {
    color: var(--toc-primary);
    background: var(--toc-primary-bg-hover);
}

.more-btn:active {
    transform: scale(0.92);
}

.toc-row:hover .more-btn,
.toc-row:focus-within .more-btn,
.toc-row.is-active .more-btn {
    opacity: 1;
    transform: translateX(0);
}

.toc-row.is-active .more-btn {
    color: var(--toc-primary);
}

/* 图层行：干净透明，靠 hover/激活态反馈 */
.toc-row.is-leaf {
    background-color: transparent;
    transition: background-color var(--toc-transition-slow);
}

/* 文件夹行：轻品牌色着色 + 加粗标题 */
.toc-row.is-folder {
    background: linear-gradient(
        135deg,
        rgba(var(--brand-primary-rgb), 0.13) 0%,
        rgba(var(--brand-primary-rgb), 0.04) 100%
    );
    transition: background-color var(--toc-transition-slow);
}

.toc-row.is-folder .name {
    font-weight: 600;
    color: var(--toc-text-dark);
}

.toc-children {
    position: relative;
}

.toc-children::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 18px) + 5px);
    top: 0;
    bottom: 6px;
    border-left: 1px solid rgba(var(--brand-primary-rgb), 0.22);
}

.toc-context-menu {
    position: fixed;
    z-index: var(--z-popover);
    min-width: 190px;
    border: 1px solid var(--toc-border-light);
    border-radius: var(--toc-radius-lg);
    background: var(--toc-bg-menu);
    box-shadow: var(--toc-shadow-lg);
    padding: var(--toc-spacing-sm);
    backdrop-filter: blur(10px);
}

.menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: transparent;
    color: var(--toc-text-primary);
    text-align: left;
    border-radius: var(--toc-radius-md);
    padding: var(--toc-spacing-md) 10px;
    font-size: var(--toc-font-sm);
    cursor: pointer;
    transition: all var(--toc-transition-fast);
}

.menu-icon {
    flex-shrink: 0;
    color: var(--toc-text-secondary);
    transition: color var(--toc-transition-fast);
}

.menu-item:hover {
    background: var(--toc-primary-bg-hover);
    color: var(--toc-primary);
}

.menu-item:hover .menu-icon {
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
