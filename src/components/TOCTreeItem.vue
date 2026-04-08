<template>
    <div class="toc-item" :class="[`kind-${node.type}`, { expanded: !!node.expanded }]" :style="{ '--node-level': Number(node.level || 0) }">
        <div
            class="toc-row"
            :class="{ 
                'is-folder': node.type === 'folder', 
                'is-leaf': node.type === 'layer',
                'is-active': node.type === 'layer' && node.id === activeLayerId
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
                @click.stop="emitAction('toggle-folder-expand', { nodeId: node.id, expanded: !node.expanded })"
            >
                <span class="chevron" :class="{ open: !!node.expanded }">▸</span>
            </button>
            <span v-else class="tree-toggle tree-toggle-placeholder"></span>

            <label class="row-label" @click.stop>
                <input
                    v-if="node.showCheckbox !== false"
                    type="checkbox"
                    :checked="!!node.visible"
                    :ref="node.type === 'folder' ? setFolderCheckboxRef : null"
                    @change="handleToggleVisibility"
                />
                <span class="name" :title="node.displayName || node.name">{{ node.displayName || node.name }}</span>
                <span v-if="node.type === 'layer' && node.id === activeLayerId" class="active-indicator">●</span>
            </label>

            <span v-if="node.type === 'layer'" class="feature-badge">{{ node.featureCount || 0 }}</span>

            <button v-if="node.type === 'layer'" class="more-btn" aria-label="更多操作" @click.stop="openContextMenuFromButton">•••</button>
        </div>

        <div v-if="node.type === 'folder' && node.expanded" class="toc-children">
            <TOCTreeItem
                v-for="child in node.children || []"
                :key="child.id"
                :node="child"
                :active-layer-id="activeLayerId"
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
                <template v-for="item in menuItems" :key="item.key">
                    <div v-if="item.divider" class="menu-divider"></div>
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
    activeLayerId: { type: String, default: null }
});

const emit = defineEmits(['action']);
const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuRef = ref(null);

/**
 * 验证标注内容是否有效（本地版本）
 * 在此处可直接使用，也可从外部工具函数导入
 * 参考：src/utils/labelValidator.ts 获取更多功能
 * 
 * @param {string} label - 标注内容
 * @param {number} maxLength - 最大长度限制（默认100字符）
 * @returns {boolean} - 是否为有效标注
 */
function isValidLabel(label, maxLength = 100) {
    // 检查是否为 null 或 undefined
    if (label === null || label === undefined) {
        return false;
    }

    // 转换为字符串
    const labelStr = String(label).trim();

    // 检查是否为空字符串
    if (!labelStr) {
        return false;
    }

    // 检查长度是否过长
    if (labelStr.length > maxLength) {
        return false;
    }

    // 检查是否为乱码（检查是否包含过多的特殊字符或控制字符）
    // 计算特殊字符比例，如果超过50%则认为是乱码
    const specialCharMatch = labelStr.match(/[\x00-\x1F\x7F-\x9F\uD800-\uDFFF]/g);
    const specialCharRatio = specialCharMatch ? specialCharMatch.length / labelStr.length : 0;

    if (specialCharRatio > 0.5) {
        return false;
    }

    // 检查是否包含过多的连续特殊符号或无效序列
    const tooManySpecialChars = /[^\w\s\u4E00-\u9FA5\.\,\?\!\!\；:\-\(\)（）、，。？！；：\-—·].{2,}/g;
    if (tooManySpecialChars.test(labelStr)) {
        return false;
    }

    return true;
}

const menuItems = computed(() => {
    if (props.node?.type !== 'layer') return [];

    const actions = props.node.actions || {};
    const groups = [];

    const primary = [];
    if (actions.viewEvent) primary.push({ key: 'view', label: '查看图层' });
    if (actions.soloEvent) primary.push({ key: 'solo', label: '仅显示此图层' });
    if (primary.length) groups.push(primary);

    const edit = [];
    if (actions.attribute) edit.push({ key: 'attribute', label: '打开属性表' });
    if (actions.style) edit.push({ key: 'style', label: '样式设置' });
    if (actions.label && isValidLabel(props.node?.raw?.labelFieldValue)) {
        edit.push({ key: 'label', label: props.node.labelVisible ? '关闭标注' : '开启标注' });
    }
    if (actions.copyCoordinates) edit.push({ key: 'copy', label: '复制坐标' });
    if (actions.toggleLayerCRS) {
        const currentCrs = String(props.node?.raw?.crs || 'wgs84').toLowerCase();
        const targetLabel = currentCrs === 'gcj02' ? 'WGS-84' : 'GCJ-02';
        edit.push({ divider: true, key: 'divider_crs' });//添加分割线
        edit.push({ key: 'toggle-crs', label: `切换坐标系至 ${targetLabel}` });
    }
    if (actions.exportLayerData) {
        edit.push({ divider: true, key: 'divider_export' });//添加分割线
        edit.push({ key: 'export-csv', label: '导出坐标(CSV)' });
        edit.push({ key: 'export-txt', label: '导出坐标(TXT)' });
        edit.push({ key: 'export-geojson', label: '导出坐标(GeoJSON)' });
    }
    if (edit.length) groups.push(edit);

    const ops = [];
    if (actions.zoom) ops.push({ key: 'zoom', label: '缩放至图层' });
    if (actions.remove) ops.push({ key: 'remove', label: actions.removeTip || '移除图层', danger: true });
    if (ops.length) groups.push(ops);

    const flattened = [];
    groups.forEach((group, idx) => {
        if (idx > 0) flattened.push({ key: `divider_${idx}`, divider: true });
        flattened.push(...group);
    });
    return flattened;
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
    if (props.node?.type !== 'layer') return;
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

function emitConfigured(eventName, payload) {
    if (!eventName) return;
    emitAction(eventName, payload);
}

function handleMenuCommand(key) {
    const actions = props.node.actions || {};

    if (key === 'view') {
        emitConfigured(actions.viewEvent, actions.viewPayload || { layerId: props.node.id });
        closeContextMenu();
        return;
    }
    if (key === 'solo') {
        emitConfigured(actions.soloEvent, actions.soloPayload || { layerId: props.node.id });
        closeContextMenu();
        return;
    }
    if (key === 'attribute') {
        emitAction('open-attribute-table', { layerId: props.node.id });
        closeContextMenu();
        return;
    }
    if (key === 'style') {
        emitAction('set-style-target', { layerId: actions.styleTarget || props.node.id });
        closeContextMenu();
        return;
    }
    if (key === 'label') {
        emitAction('toggle-layer-label-visibility', {
            layerId: props.node.id,
            visible: !props.node.labelVisible
        });
        closeContextMenu();
        return;
    }
    if (key === 'copy') {
        emitAction('copy-layer-coordinates', { layer: props.node.raw });
        closeContextMenu();
        return;
    }
    if (key === 'toggle-crs') {
        const currentCrs = String(props.node?.raw?.crs || 'wgs84').toLowerCase();
        const nextCrs = currentCrs === 'gcj02' ? 'wgs84' : 'gcj02';
        emitAction('toggle-layer-crs', {
            layerId: props.node.id,
            crs: nextCrs
        });
        closeContextMenu();
        return;
    }
    if (key === 'export-csv' || key === 'export-txt' || key === 'export-geojson') {
        emitAction('export-layer-data', {
            layerId: props.node.id,
            format: key === 'export-csv' ? 'csv' : (key === 'export-txt' ? 'txt' : 'geojson')
        });
        closeContextMenu();
        return;
    }
    if (key === 'zoom') {
        emitConfigured(actions.zoomEvent || 'zoom-layer', actions.zoomPayload || { layerId: props.node.id });
        closeContextMenu();
        return;
    }
    if (key === 'remove') {
        emitConfigured(actions.removeEvent || 'remove-layer', actions.removePayload || { layerId: props.node.id });
        closeContextMenu();
    }
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
    if (props.node.type === 'folder') return;
    if (props.node.actions?.viewEvent) {
        emitAction(props.node.actions.viewEvent, props.node.actions.viewPayload || { layerId: props.node.id });
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
    gap: 6px;
    border-radius: 8px;
    padding: 4px 8px 4px calc(6px + (var(--node-level, 0) * 18px));
    transition: all 0.16s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    user-select: none;
}

.toc-row:hover {
    background: linear-gradient(135deg, rgba(116, 175, 144, 0.545) 0%, rgba(235, 247, 240, 0.8) 100%);
}

.toc-row.is-active {
    background: linear-gradient(135deg, rgba(200, 230, 220, 0.5) 0%, rgba(190, 225, 215, 0.5) 100%);
    border-left: 3px solid #1f7b49;
    padding-left: calc(3px + (var(--node-level, 0) * 18px));
}

.toc-row.is-active .name {
    color: #1f7b49;
    font-weight: 500;
}

.toc-row.is-active:hover {
    background: linear-gradient(135deg, rgba(190, 225, 215, 0.7) 0%, rgba(180, 220, 210, 0.7) 100%);
}

.toc-row::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 18px) - 9px);
    top: 50%;
    width: 10px;
    border-top: 1px solid #171c19;
    transform: translateY(-50%);
    opacity: calc(min(var(--node-level, 0), 0.6));
    transition: opacity 0.16s ease;
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
    color: #5f7e6d;
    transition: color 0.16s ease;
    border-radius: 4px;
}

.tree-toggle:hover {
    background: rgba(31, 123, 73, 0.06);
    color: #1f7b49;
}

.tree-toggle-placeholder {
    cursor: default;
}

.chevron {
    transition: transform 0.16s cubic-bezier(0.4, 0, 0.2, 1);
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
    transition: all 0.16s ease;
}

.name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: #2f4a3b;
    transition: color 0.16s ease;
}

.active-indicator {
    flex-shrink: 0;
    font-size: 8px;
    color: #1f7b49;
    opacity: 0;
    transition: opacity 0.16s ease;
}

.toc-row.is-active .active-indicator {
    opacity: 1;
}

.feature-badge {
    flex-shrink: 0;
    font-size: 10px;
    color: #5f7e6d;
    border: 1px solid #d4e6db;
    background: linear-gradient(135deg, rgba(242, 248, 244, 0.9) 0%, rgba(235, 244, 239, 0.9) 100%);
    border-radius: 12px;
    padding: 2px 8px;
    line-height: 1.4;
    transition: all 0.16s ease;
}

.toc-row:hover .feature-badge {
    border-color: #b8d9c8;
    background: #e8f4ed;
}

.toc-row.is-active .feature-badge {
    color: #1f7b49;
    border-color: #a8d4c0;
    background: #ddf0e8;
}

.more-btn {
    margin-left: auto;
    border: 1px solid #d6e5dc;
    background: transparent;
    color: #5f7e6d;
    border-radius: 6px;
    min-width: 28px;
    height: 28px;
    line-height: 1;
    padding: 0 6px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.16s cubic-bezier(0.4, 0, 0.2, 1);
    font-size: 14px;
    font-weight: bold;
}

.more-btn:hover {
    border-color: #1f7b49;
    color: #1f7b49;
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
    border-color: #1f7b49;
    color: #1f7b49;
}

.toc-row.is-leaf {
    background-color: rgba(255, 255, 255, 0.6); /* 淡淡的白色透明，适合暗色模式 */
    /* 或者具体的颜色 */
    /* background-color: #fafafa; */ 
    
    transition: background-color 0.2s ease; /* 添加平滑过渡 */
}
.toc-row.is-folder {
    background-color: rgba(26, 163, 60, 0.566); /* 淡淡的白色透明，适合暗色模式 */
    /* 或者具体的颜色 */
    /* background-color: #f5f5f5; */ 
    
    transition: background-color 0.2s ease; /* 添加平滑过渡 */
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
    border-left: 2px solid rgba(87, 113, 100, 0.621);
}

.toc-context-menu {
    position: fixed;
    z-index: 1200;
    min-width: 180px;
    border: 1px solid rgb(20, 22, 21);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(247, 252, 249, 0.98) 100%);
    box-shadow: 0 12px 32px rgba(45, 85, 63, 0.15), 0 4px 12px rgba(45, 85, 63, 0.08);
    padding: 6px;
    backdrop-filter: blur(4px);
}

.menu-item {
    width: 100%;
    border: none;
    background: transparent;
    color: #2c4638;
    text-align: left;
    border-radius: 8px;
    padding: 8px 11px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s ease;
}

.menu-item:hover {
    background: linear-gradient(135deg, rgba(230, 218, 200, 0.4) 0%, rgba(190, 225, 215, 0.3) 100%);
    color: #1f7b49;
}

.menu-item:active {
    transform: scale(0.98);
}

.menu-item.danger {
    color: #b83d3d;
}

.menu-item.danger:hover {
    background: linear-gradient(135deg, rgba(255, 240, 240, 0.5) 0%, rgba(255, 235, 235, 0.4) 100%);
    color: #a53a3a;
}

.menu-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(67, 83, 69, 0.4) 50%, transparent 100%);
    margin: 4px 0;
}
</style>
