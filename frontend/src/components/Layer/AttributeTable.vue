<template>
    <transition name="pro-float-fade">
        <section
            v-if="isVisible"
            ref="panelRef"
            class="pro-float-window"
            :class="{ minimized: isMinimized }"
            :style="panelStyle"
        >
            <!-- 顶部窗口标题栏 (紧凑桌面原生设计，匹配截图主体绿色系) -->
            <header
                class="pro-header"
                @pointerdown="startDrag"
            >
                <div class="pro-title-wrap">
                    <svg
                        class="pro-header-icon"
                        viewBox="0 0 16 16"
                    >
                        <path
                            d="M1 2v12h14V2H1zm1 1h12v2H2V3zm0 3h4v2H2V6zm5 0h7v2H7V6zm-5 3h4v2H2V9zm5 0h7v2H7V9zm-5 3h4v2H2v-2zm5 0h7v2H7v-2z"
                        />
                    </svg>
                    <span class="pro-title">{{ t('attrTable.title', { name: layerName, count: totalRows }) }}</span>
                </div>

                <!-- 右上角标准窗口控件 -->
                <div class="pro-window-controls">
                    <button
                        class="win-btn win-min"
                        type="button"
                        :title="t('attrTable.minimize')"
                        @click.stop="toggleMinimized"
                    >
                        <svg viewBox="0 0 10 10">
                            <rect
                                x="1"
                                y="4"
                                width="8"
                                height="2"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                    <button
                        class="win-btn win-close"
                        type="button"
                        :title="t('attrTable.close')"
                        @click.stop="closeTable"
                    >
                        <svg viewBox="0 0 10 10">
                            <path
                                d="M1.414.032L5 3.617 8.586.032l1.414 1.414L6.414 5l3.586 3.586-1.414 1.414L5 6.414l-3.586 3.586-1.414-1.414L3.586 5 .032 1.446 1.414.032z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                </div>
            </header>

            <!-- 主体面板 (折叠时隐藏) -->
            <div
                v-show="!isMinimized"
                class="pro-body"
            >
                <!-- GIS数据功能工具栏 (模仿ArcGIS Ribbon风格与扁平按钮) -->
                <div class="pro-toolbar">
                    <div class="toolbar-group">
                        <label
                            class="pro-toggle"
                            :class="{ unavailable: viewFilterUnavailable }"
                            :title="viewFilterUnavailable
                                ? t('attrTable.viewFilterUnavailableTip')
                                : t('attrTable.viewFilterTip')
                            "
                        >
                            <input
                                v-model="filterByCurrentView"
                                type="checkbox"
                            />
                            <span class="pro-toggle-box">
                                <svg
                                    v-show="filterByCurrentView"
                                    class="icon-check"
                                    viewBox="0 0 16 16"
                                >
                                    <path
                                        d="M5.5 12L2 8.5l1.5-1.5L5.5 9 12.5 2 14 3.5 5.5 12z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </span>
                            {{ t('attrTable.viewFilter') }}
                        </label>
                        <span class="divider"></span>
                        <button
                            class="pro-toolbar-btn"
                            :class="{ active: showFieldPanel }"
                            @click.stop="toggleFieldPanel"
                        >
                            <svg
                                class="pro-icon-field"
                                viewBox="0 0 16 16"
                            >
                                <path
                                    d="M2 1v14h12V1H2zm1 1h4v4H3V2zm0 5h4v7H3V7zm5-5h5v2H8V2zm0 3h5v2H8V5zm0 3h5v2H8V8zm0 3h5v2H8v-2zm0 3h5v2H8v-2z"
                                    fill="currentColor"
                                />
                            </svg>
                            {{ showFieldPanel ? t('attrTable.hideFields') : t('attrTable.showFields') }}
                        </button>
                        <span class="divider"></span>
                        <div class="pro-search-wrap">
                            <svg
                                class="pro-search-icon"
                                viewBox="0 0 16 16"
                            >
                                <path
                                    d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"
                                    fill="currentColor"
                                />
                            </svg>
                            <input
                                v-model="searchInput"
                                type="text"
                                class="pro-input pro-search-input"
                                :placeholder="t('attrTable.searchPlaceholder')"
                            />
                            <button
                                v-show="searchInput"
                                class="pro-search-clear"
                                type="button"
                                :title="t('attrTable.clearSearch')"
                                @click="clearSearch"
                            >
                                ×
                            </button>
                        </div>
                        <span class="divider"></span>
                        <button
                            class="pro-toolbar-btn"
                            type="button"
                            :disabled="!totalRows"
                            :title="t('attrTable.exportCsvTip')"
                            @click.stop="exportCsv"
                        >
                            <svg
                                class="pro-icon-field"
                                viewBox="0 0 16 16"
                            >
                                <path
                                    d="M7 1v7.586L4.707 6.293 3.293 7.707 8 12.414l4.707-4.707-1.414-1.414L9 8.586V1H7zM2 13v2h12v-2H2z"
                                    fill="currentColor"
                                />
                            </svg>
                            {{ t('attrTable.exportCsv') }}
                        </button>
                    </div>

                    <div
                        v-if="numericFields.length"
                        class="toolbar-group layout-end"
                    >
                        <div class="pro-stats-panel">
                            <span class="label">{{ t('attrTable.statsLabel') }}</span>
                            <select
                                v-model="statsField"
                                class="pro-select"
                            >
                                <option
                                    v-for="field in numericFields"
                                    :key="field.key"
                                    :value="field.key"
                                >
                                    {{ field.alias }}
                                </option>
                            </select>
                            <div class="pro-tags-wrap">
                                <span
                                    class="pro-stat-chip"
                                    :title="t('attrTable.sumTip')"
                                    ><strong>∑</strong>{{ statSummary.sum }}</span
                                >
                                <span
                                    class="pro-stat-chip"
                                    :title="t('attrTable.avgTip')"
                                    ><strong>μ</strong>{{ statSummary.avg }}</span
                                >
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 字段结构设置内页表 -->
                <div
                    v-if="showFieldPanel"
                    class="pro-field-panel-view"
                >
                    <div class="panel-desc">
                        {{ t('attrTable.fieldPanelDesc') }}
                    </div>
                    <div class="pro-field-grid">
                        <div class="field-header">
                            <span class="ch-wrap">✓</span>
                            <span>{{ t('attrTable.colOriginal') }}</span>
                            <span>{{ t('attrTable.colAlias') }}</span>
                            <span>{{ t('attrTable.colType') }}</span>
                        </div>
                        <div class="field-items">
                            <div
                                v-for="field in allFields"
                                :key="field.key"
                                class="field-row"
                            >
                                <span class="ch-wrap">
                                    <input
                                        type="checkbox"
                                        class="native-cb"
                                        :checked="field.visible"
                                        @change="updateFieldVisibility(field.key, $event)"
                                    />
                                </span>
                                <span
                                    class="code"
                                    :title="field.key"
                                    >{{ field.key }}</span
                                >
                                <span>
                                    <input
                                        type="text"
                                        class="pro-input pro-field-input"
                                        :value="field.alias"
                                        @input="updateFieldAlias(field.key, $event)"
                                    />
                                </span>
                                <span class="type-badge">{{ field.type }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 主表格容器 -->
                <div
                    v-if="!totalRows"
                    class="pro-table-empty"
                >
                    <div class="empty-icon">
                        <svg viewBox="0 0 16 16">
                            <path
                                fill="currentColor"
                                d="M3 14h10v-2H3v2zM1 14h2v-2H1v2zm2-4h10V8H3v2zM1 10h2V8H1v2zm2-4h10V4H3v2zM1 6h2V4H1v2zM15 1v12h1v2H0V15h15V1zM0 13H1V2H15v1h1V1v12H13v2zm1-4V2H13V1zm0-3v4h1V5zm0 6V9h1v3zm0-9v1h1V3zm2 6H13v3H3zm0-3v2h9V5H2v1h1z"
                            />
                        </svg>
                    </div>
                    {{ t('attrTable.empty') }}
                </div>

                <div
                    v-else
                    class="pro-data-grid"
                >
                    <div
                        ref="scrollRef"
                        class="pro-scroll-area"
                        @scroll="handleScroll"
                        @mouseleave="clearPreview"
                    >
                        <div
                            class="pro-grid-layout"
                            :style="{ width: `${gridTotalWidth}px` }"
                        >
                            <!-- 严格边界型表头 -->
                            <div
                                class="pro-th-group"
                                :style="{ gridTemplateColumns }"
                            >
                                <div
                                    class="cell header id-col"
                                    :class="{ sortable: !!sortKey }"
                                    :title="sortKey ? t('attrTable.clearSortTip') : t('attrTable.oid')"
                                    @click="sortKey && clearSort()"
                                >
                                    {{ t('attrTable.oid') }}
                                </div>
                                <div
                                    v-for="field in visibleFields"
                                    :key="`head_${field.key}`"
                                    class="cell header resizable sortable"
                                    :title="t('attrTable.sortByTip', { alias: field.alias || field.key })"
                                    @click="handleSortClick(field.key)"
                                >
                                    <div class="header-text">
                                        {{ field.alias || field.key }}
                                    </div>
                                    <span
                                        v-if="sortKey === field.key"
                                        class="header-sort-caret"
                                        >{{ sortDirection === 'asc' ? '▲' : '▼' }}</span
                                    >
                                    <span
                                        class="col-resize-grip"
                                        :title="t('attrTable.resizeColTip')"
                                        @click.stop
                                        @dblclick.stop
                                        @pointerdown.stop.prevent="startColResize(field, $event)"
                                    ></span>
                                </div>
                            </div>

                            <!-- 长数据渲染层级与幽灵高度承接 -->
                            <div
                                class="virtual-holder"
                                :style="{ height: `${totalHeight}px` }"
                            >
                                <!-- key 使用稳定行 id（不含 index），滚动位移时 Vue 可复用节点避免整片重挂载 -->
                                <div
                                    v-for="item in virtualRows"
                                    :key="`row_${item.row.id}`"
                                    class="pro-tr"
                                    :class="{
                                        selected: item.row.featureId === selectedFeatureId,
                                        'row-even': item.index % 2 === 1,
                                    }"
                                    :style="{
                                        transform: `translateY(${item.top}px)`,
                                        gridTemplateColumns,
                                    }"
                                    @mouseenter="previewFeature(item.row)"
                                    @click="focusFeature(item.row, $event)"
                                    @dblclick="zoomToFeatureRow(item.row)"
                                >
                                    <div class="cell id-col">{{ item.index + 1 }}</div>

                                    <div
                                        v-for="field in visibleFields"
                                        :key="`cell_${item.row.featureId}_${field.key}`"
                                        class="cell data"
                                        :class="{ 'numeric-data': field.type === 'number' }"
                                        :title="
                                            formatValue(item.row.properties[field.key], field.type)
                                        "
                                    >
                                        {{
                                            formatValue(item.row.properties[field.key], field.type)
                                        }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 底部辅助说明列条（模拟ArcgisPro信息横条） -->
                <footer class="pro-footer-bar">
                    {{ t('attrTable.footerRows', {
                        shown: totalRows,
                        total: totalSourceRows,
                        visible: visibleFields.length,
                        hidden: allFields.length - visibleFields.length,
                    }) }}
                    <span
                        v-if="viewFilterUnavailable"
                        class="filter-warn"
                        >{{ t('attrTable.filterWarn') }}</span
                    >
                    <span style="flex: 1"></span>
                    <span
                        v-show="selectedFeatureId !== ''"
                        class="sel-count"
                        >{{ t('attrTable.selectionActive') }}</span
                    >
                </footer>
            </div>

            <!-- 四周热区拖拽放大器 (标准边缘位置结构不变) -->
            <div
                class="resize-grip top"
                @pointerdown.stop.prevent="startResize('top', $event)"
            ></div>
            <div
                class="resize-grip right"
                @pointerdown.stop.prevent="startResize('right', $event)"
            ></div>
            <div
                class="resize-grip bottom"
                @pointerdown.stop.prevent="startResize('bottom', $event)"
            ></div>
            <div
                class="resize-grip left"
                @pointerdown.stop.prevent="startResize('left', $event)"
            ></div>
            <div
                class="resize-grip corner-xy"
                @pointerdown.stop.prevent="startResize('bottom-right', $event)"
            >
                <svg viewBox="0 0 10 10">
                    <path d="M10 10L10 6L9 6L9 9L6 9L6 10Z M6 10L6 8L8 8L8 6L9 6L9 9L6 9Z" />
                </svg>
            </div>
        </section>
    </transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAttrStore, type AttrRow } from '../../stores';
import { buildAttributeCsv, buildCsvFilename, downloadCsv } from '../../utils/attributeTableCsv';
import { useLocale } from '../../composables/useLocale';

type ResizeDirection = 'top' | 'right' | 'bottom' | 'left' | 'bottom-right';

const emit = defineEmits(['focus-feature', 'highlight-feature']);
const store = useAttrStore();
const { t } = useLocale();

const panelRef = ref<HTMLElement | null>(null);
const scrollRef = ref<HTMLElement | null>(null);
const showFieldPanel = ref(false);
const scrollTop = ref(0);
const viewportHeight = ref(220);
const statsField = ref('');

// 修改渲染紧凑性: 为更好的数据容纳力，改为30px标准的专业表格高度（更贴切ArcPro逻辑体验）
const ROW_HEIGHT = 30;
const OVERSCAN = 10;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 280;

const interaction = ref<{
    mode: 'drag' | 'resize';
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startRect: { x: number; y: number; width: number; height: number };
} | null>(null);

const isVisible = computed(() => store.visible && !!store.activeDataset);
const isMinimized = computed(() => store.minimized);
const layerName = computed(() => store.activeDataset?.layerName || t('attrTable.defaultLayerName'));
const allFields = computed(() => store.activeFields);
const visibleFields = computed(() => store.visibleFields);
const numericFields = computed(() => store.numericFields);
const selectedFeatureId = computed(() => String(store.selectedFeatureId || ''));
const filterByCurrentView = computed({
    get: () => store.filterByCurrentView,
    set: (val: boolean) => store.setFilterByCurrentView(!!val),
});
// 搜索输入 200ms 防抖：大数据集下避免每击键全量过滤
const searchInput = ref(store.searchQuery);
let searchDebounceTimer: number | null = null;

watch(searchInput, (val) => {
    if (searchDebounceTimer !== null) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
        searchDebounceTimer = null;
        store.setSearchQuery(String(val || ''));
    }, 200);
});

// store 侧被外部改动时回写输入框，保持双向一致
watch(
    () => store.searchQuery,
    (val) => {
        if (val !== searchInput.value) searchInput.value = val;
    },
);

/** 清除搜索：输入框与 store 同时立即清空（不等防抖） */
function clearSearch() {
    if (searchDebounceTimer !== null) {
        window.clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }
    searchInput.value = '';
    store.setSearchQuery('');
}
const sortKey = computed(() => store.sortKey);
const sortDirection = computed(() => store.sortDirection);
/** 视图筛选已勾选但地图范围不可用（视图未就绪或 3D 相机未对准地表）→ 筛选实际未生效 */
const viewFilterUnavailable = computed(
    () => store.filterByCurrentView && !store.currentMapExtent,
);

// 改用 displayRows：在 filteredRows（视图范围 + 搜索）之上叠加表头排序
const rows = computed(() => store.displayRows);
const totalRows = computed(() => rows.value.length);
const totalSourceRows = computed(() => store.activeRows.length);

/** 表头点击排序：同列切换升/降序，换列重置为升序 */
function handleSortClick(fieldKey: string) {
    store.toggleSort(fieldKey);
}

/** 恢复默认行序 */
function clearSort() {
    store.clearSort();
}

/** 导出当前视图（已筛选 + 已排序的行 × 可见列别名）为 CSV 文件 */
function exportCsv() {
    if (!totalRows.value) return;
    const csvText = buildAttributeCsv(rows.value, visibleFields.value);
    downloadCsv(buildCsvFilename(layerName.value), csvText);
}

// ─── 确定性像素列宽 ───
// 表头与每一行是独立的 grid 容器，弹性轨道（fr/minmax）会在各自容器内解算，
// 容器宽度稍有差异（行的长内容、表头长别名）列就会错位。
// 全列使用确定像素宽后，两边轨道逐像素一致，对齐与容器宽度彻底解耦。
const ID_COL_WIDTH = 68;
const DEFAULT_COL_WIDTH = 170;
const DEFAULT_COL_WIDTH_BY_TYPE: Record<string, number> = {
    number: 120,
    date: 132,
    boolean: 100,
};

function resolveFieldWidth(field: { width?: number; type?: string }): number {
    if (Number.isFinite(field.width)) return Number(field.width);
    return DEFAULT_COL_WIDTH_BY_TYPE[String(field.type || '')] ?? DEFAULT_COL_WIDTH;
}

const columnWidths = computed(() => visibleFields.value.map(resolveFieldWidth));

const gridTemplateColumns = computed(() =>
    [`${ID_COL_WIDTH}px`, ...columnWidths.value.map((width) => `${width}px`)].join(' '),
);

/** 表格内容总宽：驱动横向滚动条与两个 grid 容器的一致宽度 */
const gridTotalWidth = computed(
    () => ID_COL_WIDTH + columnWidths.value.reduce((sum, width) => sum + width, 0),
);

const panelStyle = computed(() => ({
    left: `${store.panelRect.x}px`,
    top: `${store.panelRect.y}px`,
    width: `${store.panelRect.width}px`,
    // 高度判定加入小收缩界面的调整机制(最小化到Window原生框高度级别 30像素附近)
    height: isMinimized.value ? '34px' : `${store.panelRect.height}px`,
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
            top: index * ROW_HEIGHT,
        };
    });
});

const statSummary = computed(() => {
    const key = statsField.value;
    if (!key) {
        return { sum: '0.00', avg: '0.00' };
    }

    const values = rows.value
        .map((row) => Number(row.properties?.[key]))
        .filter((value) => Number.isFinite(value));

    if (!values.length) {
        return { sum: '0.00', avg: '0.00' };
    }

    const sum = values.reduce((acc, value) => acc + value, 0);
    const avg = sum / values.length;

    return {
        sum: sum.toLocaleString('zh-CN', { maximumFractionDigits: 3 }),
        avg: avg.toLocaleString('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 4 }),
    };
});

function getHostSize() {
    const host = panelRef.value?.parentElement;
    if (host) {
        return {
            width: host.clientWidth,
            height: host.clientHeight,
        };
    }
    return {
        width: window.innerWidth,
        height: window.innerHeight,
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
        // 重写起始大小使它倾向于是个横向开阔的面版表格框，Arc经典比例一般是在主视觉窗口的偏下层区或者三分之一处
        const width = Math.min(
            Math.max(900, Math.round(host.width * 0.8)),
            Math.max(480, host.width - 40),
        );
        const height = Math.min(
            Math.max(340, Math.round(host.height * 0.4)),
            Math.max(260, host.height - 30),
        );
        const x = Math.max(16, Math.round((host.width - width) / 2));
        const y = Math.max(16, host.height - height - 16);

        store.setPanelRect({ x, y, width, height, initialized: true });
        return;
    }

    const nextRect = clampRect({
        x: store.panelRect.x,
        y: store.panelRect.y,
        width: store.panelRect.width,
        height: store.panelRect.height,
    });
    store.setPanelRect(nextRect);
}

function refreshViewportHeight() {
    viewportHeight.value = Math.max(120, Number(scrollRef.value?.clientHeight || 220));
}

function stopInteraction() {
    interaction.value = null;
    document.body.style.cursor = 'auto'; // 防粘手套光标恢复操作
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
            y: state.startRect.y + dy,
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
    // 判断规避原生行为及事件阻止点元素
    if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('.win-btn')
    )
        return;

    interaction.value = {
        mode: 'drag',
        direction: 'right', // Placeholder 仅为drag不需要判定该指向值但维持其原模型匹配类型不变更即可
        startX: event.clientX,
        startY: event.clientY,
        startRect: { ...store.panelRect },
    };
    document.body.style.cursor = 'default';
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', stopInteraction, { passive: true, once: true });
}

function startResize(direction: ResizeDirection, event: PointerEvent) {
    interaction.value = {
        mode: 'resize',
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startRect: { ...store.panelRect },
    };

    // 更新实时交互光标防止漂移感觉变生涩。
    let cMode = 'ew-resize';
    if (direction.includes('top') || direction.includes('bottom')) cMode = 'ns-resize';
    if (direction.includes('-')) cMode = 'nwse-resize';
    document.body.style.cursor = cMode;

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', stopInteraction, { passive: true, once: true });
}

function handleScroll() {
    scrollTop.value = Number(scrollRef.value?.scrollTop || 0);
}

function formatValue(value: unknown, type: string) {
    if (value === null || value === undefined || value === '') return '<Null>'; // ArcGIS 原则常采用 <Null> 占据没有数据的点区或直接置空,此处改作更纯正占位文本模式.

    if (type === 'number') {
        const num = Number(value);
        if (Number.isFinite(num)) {
            // 专业表默认对多倍精数的格式对齐
            return num.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
        }
    }

    if (type === 'date') {
        const time = new Date(String(value));
        if (Number.isFinite(time.getTime())) {
            // 改为较典型的ISO形态的简单呈现规则用于长行排布效果
            return `${time.getFullYear()}/${String(time.getMonth() + 1).padStart(2, '0')}/${String(time.getDate()).padStart(2, '0')}`;
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

// ─── hover 高亮：rAF 合并 + 同值去重（消除行间快速划过的事件风暴与闪烁）───
let hoverFrameId: number | null = null;
let pendingHoverFeatureId: string | null = null;
let hasPendingHover = false;
let lastSentHoverFeatureId: string | null = null;

function flushHoverHighlight() {
    hoverFrameId = null;
    if (!hasPendingHover) return;
    hasPendingHover = false;
    const layerId = store.activeLayerId;
    if (!layerId) return;
    if (pendingHoverFeatureId === lastSentHoverFeatureId) return;
    lastSentHoverFeatureId = pendingHoverFeatureId;
    emit('highlight-feature', { layerId, featureId: pendingHoverFeatureId });
}

function scheduleHoverHighlight(featureId: string | null) {
    pendingHoverFeatureId = featureId;
    hasPendingHover = true;
    if (hoverFrameId === null) {
        hoverFrameId = window.requestAnimationFrame(flushHoverHighlight);
    }
}

/** B3：Ctrl/Shift 多选进行中标志——期间暂停 hover 预览防集合被 replace 覆盖；普通单击退出 */
let multiSelectActive = false;

// 图层切换 / 面板重开时重置多选态（store 侧选中锚点已被清空，续用旧状态会误判进入时机）
watch(
    () => [store.activeLayerId, store.visible],
    () => {
        multiSelectActive = false;
    },
);

function previewFeature(row: AttrRow) {
    // B3：多选进行中暂停 hover 预览——预览走 replace 语义，会清空 Ctrl/Shift 累积的高亮集合
    if (multiSelectActive) return;
    scheduleHoverHighlight(row.featureId);
}

/** 仅在鼠标离开整个表格滚动区时清除（行间移动由下一行的 replace 覆盖，不再闪烁） */
function clearPreview() {
    if (multiSelectActive) return;
    scheduleHoverHighlight(null);
}

/** Ctrl/⌘=toggle 多选、Shift=range 区间，默认 replace——透传给下游高亮引擎既有契约 */
function resolveClickMode(event?: MouseEvent): 'replace' | 'toggle' | 'range' {
    if (event?.ctrlKey || event?.metaKey) return 'toggle';
    if (event?.shiftKey) return 'range';
    return 'replace';
}

/**
 * B3：按当前表格展示顺序（排序/搜索/视图筛选后的 displayRows）解析 Shift 区间。
 * 返回锚点→目标的连续 featureId 列表（含两端）；锚点或目标不在当前展示集时返回空数组，
 * 由调用方降级 replace 单选。
 */
function resolveRangeFeatureIds(anchorId: string, targetId: string): string[] {
    if (!anchorId || !targetId) return [];
    const list = rows.value;
    const anchorIndex = list.findIndex((item) => item.featureId === anchorId);
    const targetIndex = list.findIndex((item) => item.featureId === targetId);
    if (anchorIndex < 0 || targetIndex < 0) return [];
    const from = Math.min(anchorIndex, targetIndex);
    const to = Math.max(anchorIndex, targetIndex);
    return list.slice(from, to + 1).map((item) => item.featureId);
}

function focusFeature(row: AttrRow, event?: MouseEvent) {
    const layerId = store.activeLayerId;
    if (!layerId) return;
    const mode = resolveClickMode(event);
    // B3：锚点 = 上一次点击选中的行，须在 setSelectedFeature 覆盖前捕获
    const anchorId = String(store.selectedFeatureId || '');
    store.setSelectedFeature(row.featureId);
    // 点击已确定高亮目标，同步 hover 去重基准避免后续重复发送
    lastSentHoverFeatureId = row.featureId;

    // 普通单击：退出多选，replace 单选。高亮只经 focus-feature 触发一次——
    // 修复前同一次点击还并发 highlight-feature，下游对同一目标高亮两次（toggle 直接抵消）
    if (mode === 'replace') {
        multiSelectActive = false;
        emit('focus-feature', { layerId, featureId: row.featureId, mode: 'replace' });
        return;
    }

    const entering = !multiSelectActive;
    multiSelectActive = true;

    if (mode === 'toggle') {
        // 首次进入多选先把集合规整为 {锚点行}：此刻下游集合可能是 hover 预览残留，
        // 不规整则 toggle 结果不可预期（预览恰为目标行时表现为"点了没反应"）
        if (entering) {
            if (!anchorId) {
                emit('focus-feature', { layerId, featureId: row.featureId, mode: 'replace' });
                return;
            }
            emit('focus-feature', { layerId, featureId: anchorId, mode: 'replace' });
        }
        emit('focus-feature', { layerId, featureId: row.featureId, mode: 'toggle' });
        return;
    }

    // range：按表格当前展示顺序取锚点→目标连续区间，featureIds 交下游批量追加
    const rangeFeatureIds = resolveRangeFeatureIds(anchorId, row.featureId);
    if (!rangeFeatureIds.length) {
        multiSelectActive = false;
        emit('focus-feature', { layerId, featureId: row.featureId, mode: 'replace' });
        return;
    }
    if (entering) {
        emit('focus-feature', { layerId, featureId: rangeFeatureIds[0], mode: 'replace' });
    }
    emit('focus-feature', {
        layerId,
        featureId: row.featureId,
        mode: 'range',
        featureIds: rangeFeatureIds,
    });
}

/** 双击行：缩放到要素范围（下游 zoomToManagedFeature 契约） */
function zoomToFeatureRow(row: AttrRow) {
    const layerId = store.activeLayerId;
    if (!layerId) return;
    emit('focus-feature', { layerId, featureId: row.featureId, mode: 'replace', zoom: true });
}

// ─── 列宽拖拽 ───
const colResize = ref<{ fieldKey: string; startX: number; startWidth: number } | null>(null);

function onColResizeMove(event: PointerEvent) {
    const state = colResize.value;
    if (!state) return;
    store.setFieldWidth(state.fieldKey, state.startWidth + (event.clientX - state.startX));
}

function stopColResize() {
    colResize.value = null;
    document.body.style.cursor = 'auto';
    window.removeEventListener('pointermove', onColResizeMove);
    window.removeEventListener('pointerup', stopColResize);
}

function startColResize(field: { key: string; width?: number; type?: string }, event: PointerEvent) {
    // 列宽完全由状态决定（用户宽度或类型默认宽），无需测量 DOM
    const startWidth = resolveFieldWidth(field);
    colResize.value = { fieldKey: field.key, startX: event.clientX, startWidth };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onColResizeMove, { passive: true });
    window.addEventListener('pointerup', stopColResize, { passive: true, once: true });
}

function handleWindowResize() {
    ensureInitialPanelRect();
    refreshViewportHeight();
}

/** 各图层统计字段记忆：切走再切回时恢复上次选择（B6） */
const statsFieldMemory = new Map<string, string>();

watch(statsField, (key) => {
    if (store.activeLayerId && key) {
        statsFieldMemory.set(store.activeLayerId, key);
    }
});

watch(
    () => [store.activeLayerId, numericFields.value] as const,
    () => {
        const fields = numericFields.value;
        if (!fields.length) {
            statsField.value = '';
            return;
        }
        // 优先恢复该图层上次记忆的统计字段（仍存在数值列中才生效）
        const remembered = statsFieldMemory.get(store.activeLayerId);
        if (remembered && fields.some((item) => item.key === remembered)) {
            if (statsField.value !== remembered) statsField.value = remembered;
            return;
        }
        if (!fields.find((item) => item.key === statsField.value)) {
            statsField.value = fields[0].key;
        }
    },
    { immediate: true },
);

function scrollBackToTop() {
    scrollTop.value = 0;
    if (scrollRef.value) {
        scrollRef.value.scrollTop = 0;
    }
}

// 仅在「切换图层」时回到顶部；数据增量刷新保持当前滚动位置（修复看表中途莫名回顶）
watch(
    () => store.activeLayerId,
    () => {
        scrollBackToTop();
        // 图层上下文变化，hover 去重基准失效，重置以保证新图层首次悬停必发送
        lastSentHoverFeatureId = null;
    },
);

// 排序 / 搜索 / 视图筛选条件变化等价于重新查询，回顶符合使用直觉
watch(
    () => [store.sortKey, store.sortDirection, store.searchQuery, store.filterByCurrentView],
    () => scrollBackToTop(),
);

// 行数变化（数据被删/被筛掉）时钳制滚动位置，避免悬停在空白虚拟区域
watch(totalRows, () => {
    const maxTop = Math.max(0, totalHeight.value - viewportHeight.value);
    if (scrollTop.value > maxTop) {
        scrollTop.value = maxTop;
        if (scrollRef.value) {
            scrollRef.value.scrollTop = maxTop;
        }
    }
});

watch(
    () => isVisible.value,
    async (visibleNow) => {
        if (!visibleNow) return;
        await nextTick();
        ensureInitialPanelRect();
        refreshViewportHeight();
    },
    { immediate: true },
);

watch(
    () => [store.panelRect.width, store.panelRect.height, showFieldPanel.value, isMinimized.value],
    () => {
        nextTick(() => refreshViewportHeight());
    },
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
    stopColResize();
    if (hoverFrameId !== null) {
        window.cancelAnimationFrame(hoverFrameId);
        hoverFrameId = null;
    }
    if (searchDebounceTimer !== null) {
        window.clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }
});
</script>

<style>
/** GIS 主题控制配色映射：以截图中The Science of Where标准绿色和GIS专业应用为原形搭配色块 **/
:root {
    --arc-pro-bg: var(--bg-primary);
    --arc-pro-panel-base: #f0f3f2;
    --arc-pro-topbar-green: var(--brand-accent); /* 主题Logo顶板色系 */
    --arc-pro-win-hover-red: var(--danger);
    --arc-pro-toolbar-line: #cdcece;
    --arc-pro-ribbon-btn-bg: transparent;
    --arc-pro-ribbon-hover: #dbefdc; /* 操作栏按住焦点和光标指引浅亮主绿区搭配 */

    /* Grid 标准表格级表现配置 */
    --arc-pro-border-color: #d1d4d3;
    --arc-pro-header-bg: #ecefec;
    --arc-pro-grid-lines: #dfdfdf;

    --arc-pro-select-cyan: #d2ecdc; /* 数据被选目标绿色亮圈，原系其实略偏浅绿蓝色交织系。因截图为纯正绿色定制做调整对应兼容  */
    --arc-pro-row-hover: #eaf1e8;

    --arc-pro-font-def: 'Segoe UI', 'Microsoft Yahei', sans-serif;
    --arc-pro-text: #2a342f;
}
</style>

<style scoped>

.pro-float-window {
    position: absolute;
    z-index: calc(var(--z-popover) + 200);
    display: flex;
    flex-direction: column;
    min-width: 520px;
    min-height: 280px;

    /* 强切面原生操作外边样式设计而非圆滑过渡浮片体系。这更迎合工业设计质感。 */
    background: var(--bg-primary);
    border-radius: 4px;
    box-shadow:
        0 4px 18px rgba(0, 0, 0, 0.18),
        0 1px 4px rgba(0, 0, 0, 0.1),
        0 0 1px rgba(0, 0, 0, 0.4);
    font-family: var(--arc-pro-font-def, 'Segoe UI', Tahoma, sans-serif);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
    overflow: hidden;
}

.pro-float-window.minimized {
    min-height: 34px !important;
}

/* --------------- */
/* Header： 桌面OS级的标题顶板设计 */
/* --------------- */
.pro-header {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--brand-accent); /* 完全替换成同UI的纯实体偏饱和标准图文配色主题绿顶横线! 不要光玻璃和繁杂花色渲染! */
    color: #fff;
    user-select: none;
    flex-shrink: 0;
}
.pro-title-wrap {
    display: inline-flex;
    align-items: center;
    padding-left: 10px;
    gap: 8px;
}
.pro-header-icon {
    width: 14px;
    height: 14px;
    fill: currentColor;
    opacity: 0.95;
}
.pro-title {
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
}
.pro-window-controls {
    display: flex;
    align-items: center;
    height: 100%;
}
.win-btn {
    height: 100%;
    width: 36px;
    background: transparent;
    border: none;
    color: inherit;
    cursor: default;
    display: flex;
    justify-content: center;
    align-items: center;
    outline: none;
    transition: background 0.1s;
}
.win-btn svg {
    width: 10px;
    height: 10px;
    stroke: none;
    fill: white;
}
.win-btn:hover {
    background: rgba(255, 255, 255, 0.18);
}
.win-btn:active {
    background: rgba(255, 255, 255, 0.3);
}
.win-close:hover {
    background: var(--danger);
} /* Standard close behavior (Red on OS) */

/* --------------- */
/* Layout Wrapper */
/* --------------- */
.pro-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
}

/* --------------- */
/* 工具箱排铺/主面板工具集合区与桌面控件标准设计样式 (ArcGIS经典直列) */
/* --------------- */
.pro-toolbar {
    height: 42px;
    flex-shrink: 0;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 12px;
    color: var(--text-primary);
    /* BoxShadow形成微微分离深度视觉表现力：类似顶部Ribbon板和正内容间分隔。  */
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.toolbar-group {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 100%;
}
.layout-end {
    margin-left: auto;
}

.divider {
    height: 24px;
    width: 1px;
    background-color: var(--border-light);
    box-shadow: 1px 0 0 var(--bg-primary);
}

/* 自定义选框和普通Button呈现极简化无厚黑边款的高逼格专业控制按钮特征 */
.pro-toggle {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    padding: 4px;
    user-select: none;
}
.pro-toggle input {
    display: none;
}
.pro-toggle-box {
    width: 14px;
    height: 14px;
    margin-right: 6px;
    border: 1px solid var(--border-light);
    background: #fff;
    border-radius: 2px; /* Pro微小转角方方格 */
    display: flex;
    justify-content: center;
    align-items: center;
}
.icon-check {
    width: 10px;
    height: 10px;
    fill: var(--brand-accent);
}
.pro-toggle input:checked + .pro-toggle-box {
    border-color: var(--brand-accent);
    background: var(--bg-brand-light);
}
.pro-toggle:hover .pro-toggle-box {
    border-color: var(--brand-primary-dark);
}

.pro-toolbar-btn {
    height: 28px;
    background: transparent;
    border: 1px solid transparent;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 2px;
    font-size: 12px;
    color: var(--text-primary);
    cursor: pointer;
    outline: none;
    transition: all 0.15s ease-out;
}
.pro-icon-field {
    width: 14px;
    height: 14px;
    fill: currentColor;
}
.pro-toolbar-btn:hover:not(:disabled) {
    background: var(--bg-brand-light);
    border-color: var(--border-brand-light);
    color: var(--text-brand);
}
.pro-toolbar-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.pro-toolbar-btn.active {
    background: var(--bg-brand-light);
    border-color: var(--border-brand);
    color: var(--text-brand-dark);
}

/* 分组聚合级运算小组件面板展示优化方案,匹配传统软件状态反馈栏质地 */
.pro-stats-panel {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.pro-select {
    height: 24px;
    border: 1px solid #abadab;
    background: #fff;
    border-radius: 1px;
    font-size: 12px;
    color: #2a312c;
    padding: 0 6px;
    outline: none;
    box-sizing: border-box;
    width: 140px;
}
.pro-select:hover {
    border-color: #559154;
}
.pro-select:focus {
    border-color: #46a246;
    box-shadow: 0 0 2px rgba(78, 168, 76, 0.4);
}
.pro-tags-wrap {
    display: inline-flex;
    gap: 6px;
    background: rgba(0, 0, 0, 0.02);
    border: 1px inset rgba(0, 0, 0, 0.06);
    padding: 2px 4px;
}
.pro-stat-chip {
    font-size: 11px;
    color: #505d53;
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid #cacdcb;
    border-radius: 1px;
    padding: 1px 6px;
    min-width: 60px;
}
.pro-stat-chip strong {
    font-weight: 500;
    color: #1a6d2c;
    margin-right: 4px;
}

/* --------------- */
/* 面板二:设置视窗与内页功能调整 - 直接融入到桌面风格而不是轻卡片上漂在内 */
/* --------------- */
.pro-field-panel-view {
    height: 200px;
    border-bottom: 2px solid #589c56; /* 此处增加视觉强化以分割操作与主干内容之间的层界效果(体现主导关联设定优先地位); */
    background: #f7f9f7;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
}
.panel-desc {
    padding: 6px 12px;
    font-size: 11px;
    color: #717d74;
    border-bottom: 1px solid #d4ddd7;
    background: rgba(255, 255, 255, 0.7);
}
.pro-field-grid {
    flex: 1;
    overflow-y: auto;
    font-size: 12px;
    color: #2b332d;
    background: #fff;
    /* 本模块内自定义滑轮色调 */
    scrollbar-width: thin;
    scrollbar-color: #c0c6c1 #f0f0f0;
}
.pro-field-grid::-webkit-scrollbar {
    width: 12px;
}
.pro-field-grid::-webkit-scrollbar-thumb {
    border: 2px solid #fff;
    border-radius: 6px;
    background-color: #c0c6c1;
}

.field-header {
    display: grid;
    grid-template-columns: 46px minmax(140px, 1.2fr) minmax(180px, 1fr) 90px;
    align-items: center;
    gap: 8px;
    background: #e9ece9;
    border-bottom: 1px solid #cdcfcc;
    padding: 5px 0;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 5;
    font-size: 11.5px;
    color: #4b524c;
}
.ch-wrap {
    justify-self: center;
}
.native-cb {
    accent-color: #48a649;
    width: 13px;
    height: 13px;
}

.field-row {
    display: grid;
    grid-template-columns: 46px minmax(140px, 1.2fr) minmax(180px, 1fr) 90px;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #f1f2f0;
    padding: 3px 0;
}
.field-row:hover {
    background: #f2f7f2;
}
.code {
    color: #116239;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 12px;
}
.type-badge {
    font-size: 11px;
    font-weight: 500;
    color: #72847c;
    text-transform: capitalize;
}

.pro-input {
    width: 90%;
    height: 24px;
    padding: 0 6px;
    font-size: 12px;
    border: 1px solid #cccbcb;
    outline: none;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
}
.pro-input:focus {
    border-color: #5bb25a;
    background: #fafffa;
}

/* --------------- */
/* Empty与Table核心逻辑表 - 主属性表网格显示优化 (贴靠极致的数据直呈现需求没有不必须的空间多层包装和装饰层) */
/* --------------- */
.pro-table-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #727b73;
    background: #fbfdfa;
    font-style: italic;
    gap: 12px;
}
.empty-icon svg {
    width: 32px;
    height: 32px;
    color: #a4beac;
}

.pro-data-grid {
    flex: 1;
    min-height: 0;
    position: relative;
    border: 0; /* No heavy boundary needed. Frame is border enough. */
}
.pro-scroll-area {
    width: 100%;
    height: 100%;
    overflow: auto;
    background: #fff;
    /* The classical generic os layout standard native looking style: */
    scrollbar-width: auto;
    scrollbar-color: #bfc6c1 #ededed;
}
.pro-scroll-area::-webkit-scrollbar {
    width: 14px;
    height: 14px;
}
.pro-scroll-area::-webkit-scrollbar-track {
    background: #f4f5f4;
    border-left: 1px solid #dfe1df;
    border-top: 1px solid #dfe1df;
}
.pro-scroll-area::-webkit-scrollbar-thumb {
    background: #bfc5c1;
    background-clip: content-box;
    border: 3px solid transparent;
}
.pro-scroll-area::-webkit-scrollbar-thumb:hover {
    background-color: #9ea7a0;
}

.pro-grid-layout {
    /* 宽度由内联样式按列宽总和精确设定；不小于可视区以保证表头背景铺满 */
    min-width: 100%;
}
.virtual-holder {
    position: relative;
}

.pro-th-group {
    display: grid;
    position: sticky;
    top: 0;
    z-index: 3;
    border-bottom: 1px solid #a3aca4; /* 顶部分裂横栏通常比下层分隔要沉粗显见!这是很细节特征!*/
    background: #ebefec; /* Esri 标准默认灰色调数据背景或微极色配出冷清肃冷的感觉而非强干扰颜色.*/
}
.pro-tr {
    display: grid;
    position: absolute;
    left: 0;
    right: 0;
    /* 行距调整在行主板里执行。当前行是30所以定义固实值 */
    height: 30px;
    border-bottom: 1px solid #e1e3e0;
    background: #ffffff;
    transition: none; /* Native UI不带拖拉效果的瞬间改变才是常态.*/
}
/* 斑马纹按数据行号驱动（row-even 类）：虚拟滚动下 nth-child 只数可视切片，
   滚动时同一行的奇偶会漂移导致条纹"游动"，故不使用 nth-child */
.pro-tr.row-even {
    background: #fafbfa; /* GIS经典的交错条背景带极细差距用于校眼 */
}
.pro-tr:hover {
    background: #e5efe8;
    cursor: default;
}

.pro-tr.selected {
    background: #ffebe9; /* 与地图高亮一致的红色主题 */
    color: #7f1d1d;
}

.pro-tr.selected .cell {
    border-right-color: rgba(255, 69, 58, 0.22);
}

/* Column cell generic setup. GIS Tables are typically deeply straight edge boxed per row-item separation with hard lines.*/
.cell {
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 10px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-right: 1px solid #dedfde; /* 每行的侧垂划列！最典型的软件网状分割方式  */
    box-sizing: border-box;
}

.cell.data.numeric-data {
    justify-content: flex-end;
} /* 表列中原厂型特征往往让数字进行底边后方平靠来统一齐对度.*/
.pro-tr.selected .cell {
    border-right-color: rgba(69, 148, 77, 0.22);
}

/* Table Header Custom Details */
.cell.header {
    height: 28px; /* Slightly squish down row-bar top for structural feeling vs tall row data bounds*/
    padding: 0 10px;
    color: #273029;
    font-weight: 500;
    justify-content: flex-start;
    box-sizing: border-box;
    position: relative;
    border-right: 1px solid #cbcfcd;
    /* 给出一个高强高精面效果用于产生按钮化视效凸感模拟顶行操作排版*/
    box-shadow:
        inset -1px -1px 0 rgba(255, 255, 255, 0.6),
        inset 1px 1px 0 rgba(255, 255, 255, 0.7);
}
.header-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* 表头排序：可点击 + 当前排序列 caret 指示 */
.cell.header.sortable {
    cursor: pointer;
    user-select: none;
}
.cell.header.sortable:hover {
    background: #e2e8e3;
}
.header-sort-caret {
    margin-left: 4px;
    font-size: 9px;
    color: #2f7a3d;
    flex-shrink: 0;
}

/* 列宽拖拽热区（覆盖表头右缘，悬停显示指示线） */
.col-resize-grip {
    position: absolute;
    right: -4px;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: col-resize;
    z-index: 2;
}
.col-resize-grip:hover,
.col-resize-grip:active {
    background: linear-gradient(
        to right,
        transparent 3px,
        var(--brand-accent) 3px,
        var(--brand-accent) 5px,
        transparent 5px
    );
}

/* 工具栏搜索框（接通 store.searchQuery 全字段检索） */
.pro-search-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
}
.pro-search-icon {
    position: absolute;
    left: 6px;
    width: 12px;
    height: 12px;
    color: #7a857c;
    pointer-events: none;
}
.pro-search-input {
    width: 180px;
    height: 24px;
    padding: 0 22px 0 24px;
    border-radius: 2px;
}
.pro-search-clear {
    position: absolute;
    right: 2px;
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #7a857c;
    font-size: 14px;
    line-height: 1;
}
.pro-search-clear:hover {
    color: var(--danger);
}

/* 视图筛选不可用状态（视图未就绪 / 相机未对地） */
.pro-toggle.unavailable .pro-toggle-box {
    border-style: dashed;
    opacity: 0.75;
}
.filter-warn {
    background: #fdecdb;
    border: 1px solid #e2b07e;
    border-radius: 10px;
    padding: 0 8px;
    color: #8a4b12;
    margin-left: 8px;
}

/* IDs Fix Column Special Standard Native Behavior (always gray or differently filled visually left bounder box!)  */
.id-col {
    position: sticky;
    left: 0;
    z-index: 2; /* 浮前确保不会因过远推入隐退背景而消失数据序列对准力  */
    background: #f1f4f1; /* 常驻固态边款侧行，原灰色设计*/
    color: #4a544c;
    border-right: 1px solid #cbcfcd;
}
.cell.header.id-col {
    z-index: 4;
    box-shadow: inset 0 -1px 0 #9ca39d;
    font-weight: bold;
}

/* --------------- */
/* FOOTER 标准属性说明 */
/* --------------- */
.pro-footer-bar {
    height: 24px;
    flex-shrink: 0;
    background: #eaedeb;
    border-top: 1px solid #c9cdca;
    display: flex;
    align-items: center;
    padding: 0 10px;
    font-size: 11.5px;
    color: #555b57;
    font-family: inherit;
}
.sel-count {
    background: #b1e0b5;
    border: 1px solid #6cb170;
    border-radius: 10px;
    padding: 0 8px;
    color: #164a1a;
}

/* Resize Standard Generic Handling setup as structural bounding transparent grips */
.resize-grip {
    position: absolute;
    z-index: 500;
}
.resize-grip.top,
.resize-grip.bottom {
    left: 4px;
    right: 4px;
    height: 5px;
}
.resize-grip.top {
    top: -2px;
}
.resize-grip.bottom {
    bottom: -2px;
}
.resize-grip.left,
.resize-grip.right {
    top: 4px;
    bottom: 4px;
    width: 5px;
}
.resize-grip.left {
    left: -2px;
}
.resize-grip.right {
    right: -2px;
}
.resize-grip.corner-xy {
    width: 14px;
    height: 14px;
    right: 0;
    bottom: 0;
    /* Instead of simple block transparent handler setup, show realistic dragging diagonal mark.  */
    cursor: nwse-resize;
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
}
.corner-xy svg {
    width: 12px;
    height: 12px;
    margin: 1px;
    fill: #9fa4a0; /* typical discrete subtle icon element bound marker right bot spot*/
}

.pro-float-fade-enter-active,
.pro-float-fade-leave-active {
    transition:
        opacity 0.12s ease-out,
        transform 0.1s ease-out; /* native 窗口启动往往迅捷无缝直接展开更干脆 */
}
.pro-float-fade-enter-from,
.pro-float-fade-leave-to {
    opacity: 0;
    transform: translateY(5px); /* Minimal vertical bounce not highly scaling.*/
}
</style>
