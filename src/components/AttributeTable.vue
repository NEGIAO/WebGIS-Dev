<template>
    <transition name="attr-float-fade">
        <section
            v-if="isVisible"
            ref="panelRef"
            class="attr-float-window"
            :class="{ minimized: isMinimized }"
            :style="panelStyle"
        >
            <header class="attr-header" @pointerdown="startDrag">
                <div class="attr-title-wrap">
                    <div class="attr-title">属性表</div>
                    <div class="attr-subtitle">{{ layerName }} · {{ totalRows }} 条</div>
                </div>

                <div class="attr-header-actions">
                    <button class="attr-btn" type="button" @click.stop="toggleFieldPanel">
                        {{ showFieldPanel ? '隐藏字段' : '字段设置' }}
                    </button>
                    <button class="attr-btn" type="button" @click.stop="toggleMinimized">
                        {{ isMinimized ? '展开' : '最小化' }}
                    </button>
                    <button class="attr-btn danger" type="button" @click.stop="closeTable">关闭</button>
                </div>
            </header>

            <div v-show="!isMinimized" class="attr-body">
                <div class="attr-toolbar">
                    <label class="toolbar-check">
                        <input v-model="filterByCurrentView" type="checkbox" />
                        <span>当前视图筛选</span>
                    </label>

                    <div class="toolbar-meta">字段 {{ visibleFields.length }}/{{ allFields.length }}</div>

                    <div v-if="numericFields.length" class="toolbar-stats">
                        <span>快速统计</span>
                        <select v-model="statsField" class="stats-select">
                            <option v-for="field in numericFields" :key="field.key" :value="field.key">
                                {{ field.alias }}
                            </option>
                        </select>
                        <span>Σ {{ statSummary.sum }}</span>
                        <span>Avg {{ statSummary.avg }}</span>
                    </div>
                </div>

                <div v-if="showFieldPanel" class="field-panel">
                    <div class="field-panel-head">
                        <span>显示</span>
                        <span>字段名</span>
                        <span>别名</span>
                        <span>类型</span>
                    </div>
                    <div v-for="field in allFields" :key="field.key" class="field-row">
                        <input
                            class="field-visible"
                            type="checkbox"
                            :checked="field.visible"
                            @change="updateFieldVisibility(field.key, $event)"
                        />
                        <span class="field-key" :title="field.key">{{ field.key }}</span>
                        <input
                            class="field-alias"
                            type="text"
                            :value="field.alias"
                            @input="updateFieldAlias(field.key, $event)"
                        />
                        <span class="field-type">{{ field.type }}</span>
                    </div>
                </div>

                <div v-if="!totalRows" class="attr-empty">当前图层没有可展示的属性数据</div>

                <div v-else class="attr-grid-wrap">
                    <div class="attr-grid-head" :style="{ gridTemplateColumns }">
                        <div class="cell index sticky">#</div>
                        <div
                            v-for="field in visibleFields"
                            :key="`head_${field.key}`"
                            class="cell"
                            :title="field.key"
                        >
                            {{ field.alias }}
                        </div>
                    </div>

                    <div ref="scrollRef" class="attr-grid-scroll" @scroll="handleScroll">
                        <div class="virtual-phantom" :style="{ height: `${totalHeight}px` }">
                            <div
                                v-for="item in virtualRows"
                                :key="`row_${item.row.featureId}_${item.index}`"
                                class="attr-grid-row"
                                :class="{ selected: item.row.featureId === selectedFeatureId }"
                                :style="{
                                    transform: `translateY(${item.top}px)`,
                                    gridTemplateColumns
                                }"
                                @mouseenter="previewFeature(item.row)"
                                @click="focusFeature(item.row)"
                            >
                                <div class="cell index sticky">{{ item.index + 1 }}</div>
                                <div
                                    v-for="field in visibleFields"
                                    :key="`cell_${item.row.featureId}_${field.key}`"
                                    class="cell"
                                    :title="formatValue(item.row.properties[field.key], field.type)"
                                >
                                    {{ formatValue(item.row.properties[field.key], field.type) }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="resize-handle top" @pointerdown.stop.prevent="startResize('top', $event)"></div>
            <div class="resize-handle right" @pointerdown.stop.prevent="startResize('right', $event)"></div>
            <div class="resize-handle bottom" @pointerdown.stop.prevent="startResize('bottom', $event)"></div>
            <div class="resize-handle left" @pointerdown.stop.prevent="startResize('left', $event)"></div>
            <div class="resize-handle corner" @pointerdown.stop.prevent="startResize('bottom-right', $event)"></div>
        </section>
    </transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAttrStore, type AttrRow } from '../stores/useAttrStore';

type ResizeDirection = 'top' | 'right' | 'bottom' | 'left' | 'bottom-right';

const emit = defineEmits(['focus-feature', 'highlight-feature']);
const store = useAttrStore();

const panelRef = ref<HTMLElement | null>(null);
const scrollRef = ref<HTMLElement | null>(null);
const showFieldPanel = ref(false);
const scrollTop = ref(0);
const viewportHeight = ref(220);
const statsField = ref('');

const ROW_HEIGHT = 38;
const OVERSCAN = 10;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 250;

const interaction = ref<{
    mode: 'drag' | 'resize';
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startRect: { x: number; y: number; width: number; height: number };
} | null>(null);

const isVisible = computed(() => store.visible && !!store.activeDataset);
const isMinimized = computed(() => store.minimized);
const layerName = computed(() => store.activeDataset?.layerName || '未命名图层');
const allFields = computed(() => store.activeFields);
const visibleFields = computed(() => store.visibleFields);
const numericFields = computed(() => store.numericFields);
const selectedFeatureId = computed(() => String(store.selectedFeatureId || ''));
const filterByCurrentView = computed({
    get: () => store.filterByCurrentView,
    set: (val: boolean) => store.setFilterByCurrentView(!!val)
});

const rows = computed(() => store.filteredRows);
const totalRows = computed(() => rows.value.length);

const gridTemplateColumns = computed(() => {
    const dynamicCols = visibleFields.value.map(() => 'minmax(160px, 1fr)');
    return ['72px', ...dynamicCols].join(' ');
});

const panelStyle = computed(() => ({
    left: `${store.panelRect.x}px`,
    top: `${store.panelRect.y}px`,
    width: `${store.panelRect.width}px`,
    height: isMinimized.value ? '56px' : `${store.panelRect.height}px`
}));

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN));
const endIndex = computed(() => {
    const safeEnd = Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT) + OVERSCAN;
    return Math.min(totalRows.value, safeEnd);
});

const totalHeight = computed(() => totalRows.value * ROW_HEIGHT);

const virtualRows = computed(() => {
    const start = startIndex.value;
    const end = endIndex.value;
    return rows.value.slice(start, end).map((row, idx) => {
        const index = start + idx;
        return {
            row,
            index,
            top: index * ROW_HEIGHT
        };
    });
});

const statSummary = computed(() => {
    const key = statsField.value;
    if (!key) {
        return { sum: '0', avg: '0.00' };
    }

    const values = rows.value
        .map((row) => Number(row.properties?.[key]))
        .filter((value) => Number.isFinite(value));

    if (!values.length) {
        return { sum: '0', avg: '0.00' };
    }

    const sum = values.reduce((acc, value) => acc + value, 0);
    const avg = sum / values.length;

    return {
        sum: sum.toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
        avg: avg.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    };
});

function getHostSize() {
    const host = panelRef.value?.parentElement;
    if (host) {
        return {
            width: host.clientWidth,
            height: host.clientHeight
        };
    }

    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}

function clampRect(rect: { x: number; y: number; width: number; height: number }) {
    const host = getHostSize();
    const minWidth = Math.min(MIN_WIDTH, Math.max(300, host.width - 16));
    const minHeight = Math.min(MIN_HEIGHT, Math.max(180, host.height - 16));

    const width = Math.max(minWidth, Math.min(rect.width, host.width - 8));
    const height = Math.max(minHeight, Math.min(rect.height, host.height - 8));
    const x = Math.max(0, Math.min(rect.x, host.width - width));
    const y = Math.max(0, Math.min(rect.y, host.height - height));

    return { x, y, width, height };
}

function ensureInitialPanelRect() {
    const host = getHostSize();

    if (!store.panelRect.initialized) {
        const width = Math.min(Math.max(760, Math.round(host.width * 0.72)), Math.max(320, host.width - 24));
        const height = Math.min(Math.max(320, Math.round(host.height * 0.42)), Math.max(220, host.height - 24));
        const x = Math.max(12, Math.round((host.width - width) / 2));
        const y = Math.max(12, host.height - height - 18);

        store.setPanelRect({ x, y, width, height, initialized: true });
        return;
    }

    const nextRect = clampRect({
        x: store.panelRect.x,
        y: store.panelRect.y,
        width: store.panelRect.width,
        height: store.panelRect.height
    });
    store.setPanelRect(nextRect);
}

function refreshViewportHeight() {
    viewportHeight.value = Math.max(120, Number(scrollRef.value?.clientHeight || 220));
}

function stopInteraction() {
    interaction.value = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopInteraction);
}

function onPointerMove(event: PointerEvent) {
    const state = interaction.value;
    if (!state) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.mode === 'drag') {
        const nextRect = clampRect({
            ...state.startRect,
            x: state.startRect.x + dx,
            y: state.startRect.y + dy
        });
        store.setPanelRect(nextRect);
        return;
    }

    const nextRect = { ...state.startRect };
    if (state.direction.includes('right')) {
        nextRect.width = state.startRect.width + dx;
    }
    if (state.direction.includes('left')) {
        nextRect.width = state.startRect.width - dx;
        nextRect.x = state.startRect.x + dx;
    }
    if (state.direction.includes('bottom')) {
        nextRect.height = state.startRect.height + dy;
    }
    if (state.direction.includes('top')) {
        nextRect.height = state.startRect.height - dy;
        nextRect.y = state.startRect.y + dy;
    }

    store.setPanelRect(clampRect(nextRect));
    refreshViewportHeight();
}

function startDrag(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) return;

    interaction.value = {
        mode: 'drag',
        direction: 'right',
        startX: event.clientX,
        startY: event.clientY,
        startRect: {
            x: store.panelRect.x,
            y: store.panelRect.y,
            width: store.panelRect.width,
            height: store.panelRect.height
        }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', stopInteraction, { passive: true, once: true });
}

function startResize(direction: ResizeDirection, event: PointerEvent) {
    interaction.value = {
        mode: 'resize',
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startRect: {
            x: store.panelRect.x,
            y: store.panelRect.y,
            width: store.panelRect.width,
            height: store.panelRect.height
        }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', stopInteraction, { passive: true, once: true });
}

function handleScroll() {
    scrollTop.value = Number(scrollRef.value?.scrollTop || 0);
}

function formatValue(value: unknown, type: string) {
    if (value === null || value === undefined || value === '') return '—';

    if (type === 'number') {
        const num = Number(value);
        if (Number.isFinite(num)) {
            return num.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
        }
    }

    if (type === 'date') {
        const time = new Date(String(value));
        if (Number.isFinite(time.getTime())) {
            return `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')}`;
        }
    }

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    return String(value);
}

function toggleFieldPanel() {
    showFieldPanel.value = !showFieldPanel.value;
    nextTick(() => refreshViewportHeight());
}

function toggleMinimized() {
    store.toggleMinimized();
    nextTick(() => refreshViewportHeight());
}

function closeTable() {
    showFieldPanel.value = false;
    store.closeTable();
}

function updateFieldAlias(fieldKey: string, event: Event) {
    const target = event.target as HTMLInputElement;
    store.setFieldAlias(fieldKey, target.value);
}

function updateFieldVisibility(fieldKey: string, event: Event) {
    const target = event.target as HTMLInputElement;
    store.setFieldVisibility(fieldKey, target.checked);
}

function previewFeature(row: AttrRow) {
    const layerId = store.activeLayerId;
    if (!layerId) return;
    emit('highlight-feature', { layerId, featureId: row.featureId });
}

function focusFeature(row: AttrRow) {
    const layerId = store.activeLayerId;
    if (!layerId) return;

    store.setSelectedFeature(row.featureId);
    const payload = { layerId, featureId: row.featureId };
    emit('highlight-feature', payload);
    emit('focus-feature', payload);
}

function handleWindowResize() {
    ensureInitialPanelRect();
    refreshViewportHeight();
}

watch(
    () => numericFields.value,
    (fields) => {
        if (!fields.length) {
            statsField.value = '';
            return;
        }
        if (!fields.find((item) => item.key === statsField.value)) {
            statsField.value = fields[0].key;
        }
    },
    { immediate: true }
);

watch(
    () => rows.value,
    () => {
        scrollTop.value = 0;
        if (scrollRef.value) {
            scrollRef.value.scrollTop = 0;
        }
    }
);

watch(
    () => isVisible.value,
    async (visibleNow) => {
        if (!visibleNow) return;
        await nextTick();
        ensureInitialPanelRect();
        refreshViewportHeight();
    },
    { immediate: true }
);

watch(
    () => [store.panelRect.width, store.panelRect.height, showFieldPanel.value, isMinimized.value],
    () => {
        nextTick(() => refreshViewportHeight());
    }
);

onMounted(() => {
    window.addEventListener('resize', handleWindowResize, { passive: true });
    nextTick(() => {
        ensureInitialPanelRect();
        refreshViewportHeight();
    });
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleWindowResize);
    stopInteraction();
});
</script>

<style scoped>
.attr-float-window {
    position: absolute;
    z-index: 1400;
    border: 1px solid rgba(255, 255, 255, 0.42);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.58);
    backdrop-filter: blur(14px) saturate(1.2);
    box-shadow: 0 16px 48px rgba(10, 28, 20, 0.3);
    min-width: 300px;
    min-height: 180px;
}

.attr-float-window.minimized {
    min-height: 56px;
}

.attr-header {
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 12px;
    background: linear-gradient(120deg, rgba(33, 126, 72, 0.92), rgba(20, 96, 56, 0.9));
    color: #f4fff8;
    user-select: none;
    cursor: grab;
}

.attr-header:active {
    cursor: grabbing;
}

.attr-title-wrap {
    min-width: 0;
}

.attr-title {
    font-size: 14px;
    font-weight: 700;
}

.attr-subtitle {
    margin-top: 2px;
    font-size: 11px;
    opacity: 0.88;
}

.attr-header-actions {
    display: inline-flex;
    gap: 8px;
    flex-shrink: 0;
}

.attr-btn {
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    font-size: 12px;
    padding: 5px 10px;
    cursor: pointer;
}

.attr-btn.danger {
    background: rgba(200, 42, 42, 0.35);
    border-color: rgba(255, 233, 233, 0.45);
}

.attr-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: rgba(248, 255, 251, 0.5);
}

.attr-toolbar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(75, 121, 95, 0.18);
    font-size: 12px;
    color: #315240;
    flex-wrap: wrap;
}

.toolbar-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.toolbar-meta {
    color: #4b6d59;
}

.toolbar-stats {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #2d4b3b;
}

.stats-select {
    border: 1px solid rgba(64, 122, 88, 0.28);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.88);
    color: #2d4b3b;
    font-size: 12px;
    height: 28px;
    padding: 0 8px;
}

.field-panel {
    margin: 8px 12px;
    border: 1px solid rgba(65, 119, 89, 0.2);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.72);
    max-height: 160px;
    overflow: auto;
}

.field-panel-head,
.field-row {
    display: grid;
    grid-template-columns: 52px minmax(140px, 1fr) minmax(160px, 1.1fr) 76px;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    font-size: 12px;
}

.field-panel-head {
    position: sticky;
    top: 0;
    background: rgba(226, 244, 233, 0.96);
    color: #39614a;
    font-weight: 700;
    z-index: 1;
}

.field-row {
    border-top: 1px solid rgba(75, 121, 95, 0.12);
}

.field-key {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.field-alias {
    width: 100%;
    height: 28px;
    border-radius: 8px;
    border: 1px solid rgba(65, 119, 89, 0.25);
    background: rgba(255, 255, 255, 0.94);
    padding: 0 8px;
    font-size: 12px;
    color: #274235;
}

.field-type {
    color: #4e6f5a;
    text-transform: uppercase;
}

.attr-grid-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin: 8px 12px 10px;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid rgba(75, 121, 95, 0.18);
    background: rgba(253, 255, 254, 0.9);
}

.attr-grid-head,
.attr-grid-row {
    display: grid;
    min-width: max-content;
}

.attr-grid-head {
    position: sticky;
    top: 0;
    z-index: 2;
    border-bottom: 1px solid rgba(75, 121, 95, 0.2);
    background: #2b8a56;
    color: #fff;
    font-weight: 700;
    font-size: 12px;
}

.attr-grid-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    position: relative;
}

.virtual-phantom {
    position: relative;
    min-width: max-content;
}

.attr-grid-row {
    position: absolute;
    left: 0;
    right: 0;
    height: 38px;
    border-bottom: 1px solid rgba(75, 121, 95, 0.12);
    cursor: pointer;
    background: rgba(244, 254, 248, 0.94);
}

.attr-grid-row:nth-child(even) {
    background: rgba(255, 255, 255, 0.94);
}

.attr-grid-row:hover {
    background: rgba(219, 245, 228, 0.95);
}

.attr-grid-row.selected {
    background: rgba(180, 235, 201, 0.95);
}

.cell {
    height: 38px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #244133;
}

.cell.index {
    justify-content: center;
    font-weight: 700;
    color: #1f5e3d;
}

.cell.sticky {
    position: sticky;
    left: 0;
    z-index: 1;
    background: inherit;
    border-right: 1px solid rgba(75, 121, 95, 0.12);
}

.attr-empty {
    margin: 14px 12px;
    padding: 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.7);
    color: #587463;
    font-size: 13px;
}

.resize-handle {
    position: absolute;
    z-index: 5;
}

.resize-handle.top,
.resize-handle.bottom {
    left: 10px;
    right: 10px;
    height: 8px;
}

.resize-handle.top {
    top: -4px;
    cursor: ns-resize;
}

.resize-handle.bottom {
    bottom: -4px;
    cursor: ns-resize;
}

.resize-handle.left,
.resize-handle.right {
    top: 10px;
    bottom: 10px;
    width: 8px;
}

.resize-handle.left {
    left: -4px;
    cursor: ew-resize;
}

.resize-handle.right {
    right: -4px;
    cursor: ew-resize;
}

.resize-handle.corner {
    width: 14px;
    height: 14px;
    right: 0;
    bottom: 0;
    cursor: nwse-resize;
}

.attr-float-fade-enter-active,
.attr-float-fade-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.attr-float-fade-enter-from,
.attr-float-fade-leave-to {
    opacity: 0;
    transform: translateY(8px);
}

@media (max-width: 900px) {
    .attr-header-actions {
        gap: 6px;
    }

    .attr-btn {
        padding: 4px 8px;
        font-size: 11px;
    }

    .toolbar-stats {
        width: 100%;
        margin-left: 0;
        justify-content: flex-start;
    }
}
</style>
