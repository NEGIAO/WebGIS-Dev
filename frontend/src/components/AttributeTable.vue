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
            <header class="pro-header" @pointerdown="startDrag">
                <div class="pro-title-wrap">
                    <svg class="pro-header-icon" viewBox="0 0 16 16">
                        <path d="M1 2v12h14V2H1zm1 1h12v2H2V3zm0 3h4v2H2V6zm5 0h7v2H7V6zm-5 3h4v2H2V9zm5 0h7v2H7V9zm-5 3h4v2H2v-2zm5 0h7v2H7v-2z"/>
                    </svg>
                    <span class="pro-title">属性表：{{ layerName }} ({{ totalRows }}条)</span>
                </div>

                <!-- 右上角标准窗口控件 -->
                <div class="pro-window-controls">
                    <button class="win-btn win-min" type="button" title="折叠 / 展开" @click.stop="toggleMinimized">
                        <svg viewBox="0 0 10 10"><rect x="1" y="4" width="8" height="2" fill="currentColor"/></svg>
                    </button>
                    <button class="win-btn win-close" type="button" title="关闭" @click.stop="closeTable">
                        <svg viewBox="0 0 10 10">
                            <path d="M1.414.032L5 3.617 8.586.032l1.414 1.414L6.414 5l3.586 3.586-1.414 1.414L5 6.414l-3.586 3.586-1.414-1.414L3.586 5 .032 1.446 1.414.032z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            </header>

            <!-- 主体面板 (折叠时隐藏) -->
            <div v-show="!isMinimized" class="pro-body">
                <!-- GIS数据功能工具栏 (模仿ArcGIS Ribbon风格与扁平按钮) -->
                <div class="pro-toolbar">
                    <div class="toolbar-group">
                        <label class="pro-toggle" title="通过当前的地图视图对数据行进行限制">
                            <input v-model="filterByCurrentView" type="checkbox" />
                            <span class="pro-toggle-box">
                                <svg v-show="filterByCurrentView" class="icon-check" viewBox="0 0 16 16"><path d="M5.5 12L2 8.5l1.5-1.5L5.5 9 12.5 2 14 3.5 5.5 12z" fill="currentColor"/></svg>
                            </span>
                            视图筛选范围
                        </label>
                        <span class="divider"></span>
                        <button class="pro-toolbar-btn" :class="{ 'active': showFieldPanel }" @click.stop="toggleFieldPanel">
                            <svg class="pro-icon-field" viewBox="0 0 16 16"><path d="M2 1v14h12V1H2zm1 1h4v4H3V2zm0 5h4v7H3V7zm5-5h5v2H8V2zm0 3h5v2H8V5zm0 3h5v2H8V8zm0 3h5v2H8v-2zm0 3h5v2H8v-2z" fill="currentColor"/></svg>
                            {{ showFieldPanel ? '收起字段视图' : '设置可用字段' }}
                        </button>
                    </div>

                    <div class="toolbar-group layout-end" v-if="numericFields.length">
                        <div class="pro-stats-panel">
                            <span class="label">分析汇总：</span>
                            <select v-model="statsField" class="pro-select">
                                <option v-for="field in numericFields" :key="field.key" :value="field.key">
                                    {{ field.alias }}
                                </option>
                            </select>
                            <div class="pro-tags-wrap">
                                <span class="pro-stat-chip" title="求和 (SUM)"><strong>∑</strong>{{ statSummary.sum }}</span>
                                <span class="pro-stat-chip" title="平均值 (AVG)"><strong>μ</strong>{{ statSummary.avg }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 字段结构设置内页表 -->
                <div v-if="showFieldPanel" class="pro-field-panel-view">
                    <div class="panel-desc">可自由勾选与变更要素属性列别名，应用至下部属性表格展现。</div>
                    <div class="pro-field-grid">
                        <div class="field-header">
                            <span class="ch-wrap">✓</span>
                            <span>列原始名</span>
                            <span>列表头别名配置</span>
                            <span>数据结构类型</span>
                        </div>
                        <div class="field-items">
                            <div v-for="field in allFields" :key="field.key" class="field-row">
                                <span class="ch-wrap">
                                    <input type="checkbox" class="native-cb" :checked="field.visible" @change="updateFieldVisibility(field.key, $event)" />
                                </span>
                                <span class="code" :title="field.key">{{ field.key }}</span>
                                <span>
                                    <input type="text" class="pro-input pro-field-input" :value="field.alias" @input="updateFieldAlias(field.key, $event)"/>
                                </span>
                                <span class="type-badge">{{ field.type }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 主表格容器 -->
                <div v-if="!totalRows" class="pro-table-empty">
                    <div class="empty-icon"><svg viewBox="0 0 16 16"><path fill="currentColor" d="M3 14h10v-2H3v2zM1 14h2v-2H1v2zm2-4h10V8H3v2zM1 10h2V8H1v2zm2-4h10V4H3v2zM1 6h2V4H1v2zM15 1v12h1v2H0V15h15V1zM0 13H1V2H15v1h1V1v12H13v2zm1-4V2H13V1zm0-3v4h1V5zm0 6V9h1v3zm0-9v1h1V3zm2 6H13v3H3zm0-3v2h9V5H2v1h1z" /></svg></div>
                    空白要素，该条件暂无可展示项。
                </div>

                <div v-else class="pro-data-grid">
                    <div ref="scrollRef" class="pro-scroll-area" @scroll="handleScroll">
                        <div class="pro-grid-layout">
                            <!-- 严格边界型表头 -->
                            <div class="pro-th-group" :style="{ gridTemplateColumns }">
                                <div class="cell header id-col">OID/标识</div>
                                <div v-for="field in visibleFields" :key="`head_${field.key}`" class="cell header resizable">
                                    <div class="header-text" :title="field.alias || field.key">
                                        {{ field.alias || field.key }}
                                    </div>
                                    <span class="header-sort-grip"></span>
                                </div>
                            </div>

                            <!-- 长数据渲染层级与幽灵高度承接 -->
                            <div class="virtual-holder" :style="{ height: `${totalHeight}px` }">
                                <div
                                    v-for="item in virtualRows"
                                    :key="`row_${item.row.featureId}_${item.index}`"
                                    class="pro-tr"
                                    :class="{ selected: item.row.featureId === selectedFeatureId }"
                                    :style="{
                                        transform: `translateY(${item.top}px)`,
                                        gridTemplateColumns
                                    }"
                                    @mouseenter="previewFeature(item.row)"
                                    @click="focusFeature(item.row)"
                                >
                                    <div class="cell id-col">{{ item.index + 1 }}</div>

                                    <div
                                        v-for="field in visibleFields"
                                        :key="`cell_${item.row.featureId}_${field.key}`"
                                        class="cell data"
                                        :class="{'numeric-data': field.type === 'number'}"
                                        :title="formatValue(item.row.properties[field.key], field.type)"
                                    >
                                        {{ formatValue(item.row.properties[field.key], field.type) }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 底部辅助说明列条（模拟ArcgisPro信息横条） -->
                <footer class="pro-footer-bar">
                    展示数量 {{ visibleFields.length }}列 · 余可用字段数量 {{ allFields.length - visibleFields.length }}个
                    <span style="flex:1;"></span>
                    <span v-show="selectedFeatureId !== ''" class="sel-count">要素当前具备高亮活跃目标</span>
                </footer>
            </div>

            <!-- 四周热区拖拽放大器 (标准边缘位置结构不变) -->
            <div class="resize-grip top" @pointerdown.stop.prevent="startResize('top', $event)"></div>
            <div class="resize-grip right" @pointerdown.stop.prevent="startResize('right', $event)"></div>
            <div class="resize-grip bottom" @pointerdown.stop.prevent="startResize('bottom', $event)"></div>
            <div class="resize-grip left" @pointerdown.stop.prevent="startResize('left', $event)"></div>
            <div class="resize-grip corner-xy" @pointerdown.stop.prevent="startResize('bottom-right', $event)">
                <svg viewBox="0 0 10 10"><path d="M10 10L10 6L9 6L9 9L6 9L6 10Z M6 10L6 8L8 8L8 6L9 6L9 9L6 9Z"/></svg>
            </div>
        </section>
    </transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAttrStore, type AttrRow } from '../stores';

type ResizeDirection = 'top' | 'right' | 'bottom' | 'left' | 'bottom-right';

const emit = defineEmits(['focus-feature', 'highlight-feature']);
const store = useAttrStore();

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
const layerName = computed(() => store.activeDataset?.layerName || '新建工作流图层');
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
    // 稍微放低单元宽容以装载更多业务级信息内容
    const dynamicCols = visibleFields.value.map(() => 'minmax(140px, 1fr)');
    // 经典桌面GIS的序列号列表首字段占据大约 76像素宽度
    return['68px', ...dynamicCols].join(' ');
});

const panelStyle = computed(() => ({
    left: `${store.panelRect.x}px`,
    top: `${store.panelRect.y}px`,
    width: `${store.panelRect.width}px`,
    // 高度判定加入小收缩界面的调整机制(最小化到Window原生框高度级别 30像素附近)
    height: isMinimized.value ? '34px' : `${store.panelRect.height}px`
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
        avg: avg.toLocaleString('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 4 })
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
        // 重写起始大小使它倾向于是个横向开阔的面版表格框，Arc经典比例一般是在主视觉窗口的偏下层区或者三分之一处
        const width = Math.min(Math.max(900, Math.round(host.width * 0.8)), Math.max(480, host.width - 40));
        const height = Math.min(Math.max(340, Math.round(host.height * 0.40)), Math.max(260, host.height - 30));
        const x = Math.max(16, Math.round((host.width - width) / 2));
        const y = Math.max(16, host.height - height - 16);

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
    // 判断规避原生行为及事件阻止点元素
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('.win-btn')) return;

    interaction.value = {
        mode: 'drag',
        direction: 'right', // Placeholder 仅为drag不需要判定该指向值但维持其原模型匹配类型不变更即可
        startX: event.clientX,
        startY: event.clientY,
        startRect: { ...store.panelRect }
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
        startRect: { ...store.panelRect }
    };
    
    // 更新实时交互光标防止漂移感觉变生涩。
    let cMode = 'ew-resize';
    if(direction.includes('top')||direction.includes('bottom')) cMode='ns-resize';
    if(direction.includes('-')) cMode='nwse-resize';
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
        try { return JSON.stringify(value); } 
        catch { return String(value); }
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

watch(() => numericFields.value, (fields) => {
    if (!fields.length) {
        statsField.value = '';
        return;
    }
    if (!fields.find((item) => item.key === statsField.value)) {
        statsField.value = fields[0].key;
    }
}, { immediate: true });

watch(() => rows.value, () => {
    scrollTop.value = 0;
    if (scrollRef.value) {
        scrollRef.value.scrollTop = 0;
    }
});

watch(() => isVisible.value, async (visibleNow) => {
    if (!visibleNow) return;
    await nextTick();
    ensureInitialPanelRect();
    refreshViewportHeight();
}, { immediate: true });

watch(() =>[store.panelRect.width, store.panelRect.height, showFieldPanel.value, isMinimized.value], () => {
    nextTick(() => refreshViewportHeight());
});

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
/** GIS 主题控制配色映射：以截图中The Science of Where标准绿色和GIS专业应用为原形搭配色块 **/
:root {
    --arc-pro-bg: #fefefe;
    --arc-pro-panel-base: #f0f3f2;
    --arc-pro-topbar-green: #52a751;   /* 主题Logo顶板色系 */
    --arc-pro-win-hover-red: #d13c41;
    --arc-pro-toolbar-line: #cdcece;
    --arc-pro-ribbon-btn-bg: transparent;
    --arc-pro-ribbon-hover: #dbefdc;   /* 操作栏按住焦点和光标指引浅亮主绿区搭配 */
    
    /* Grid 标准表格级表现配置 */
    --arc-pro-border-color: #d1d4d3;
    --arc-pro-header-bg: #ecefec;
    --arc-pro-grid-lines: #dfdfdf;
    
    --arc-pro-select-cyan: #d2ecdc;     /* 数据被选目标绿色亮圈，原系其实略偏浅绿蓝色交织系。因截图为纯正绿色定制做调整对应兼容  */
    --arc-pro-row-hover: #eaf1e8;
    
    --arc-pro-font-def: "Segoe UI", "Microsoft Yahei", sans-serif;
    --arc-pro-text: #2a342f;
}

.pro-float-window {
    position: absolute;
    z-index: 1400;
    display: flex;
    flex-direction: column;
    min-width: 520px;
    min-height: 280px;
    
    /* 强切面原生操作外边样式设计而非圆滑过渡浮片体系。这更迎合工业设计质感。 */
    background: #fefefe;
    border-radius: 4px;
    box-shadow: 0 4px 18px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.1), 0 0 1px rgba(0,0,0,0.4);
    font-family: var(--arc-pro-font-def, "Segoe UI", Tahoma, sans-serif);
    color: #2b302c;
    border: 1px solid #758679; 
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
    background: #4ea84c; /* 完全替换成同UI的纯实体偏饱和标准图文配色主题绿顶横线! 不要光玻璃和繁杂花色渲染! */
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
.win-btn svg { width: 10px; height: 10px; stroke: none; fill: white;}
.win-btn:hover { background: rgba(255,255,255,0.18); }
.win-btn:active { background: rgba(255,255,255,0.3); }
.win-close:hover { background: #d71526; } /* Standard close behavior (Red on OS) */


/* --------------- */
/* Layout Wrapper */
/* --------------- */
.pro-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fdfdfd;
}

/* --------------- */
/* 工具箱排铺/主面板工具集合区与桌面控件标准设计样式 (ArcGIS经典直列) */
/* --------------- */
.pro-toolbar {
    height: 42px;
    flex-shrink: 0;
    background: #f1f3f1;
    border-bottom: 1px solid #dcdfdc;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 12px;
    color: #38423b;
    /* BoxShadow形成微微分离深度视觉表现力：类似顶部Ribbon板和正内容间分隔。  */
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
}

.toolbar-group {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 100%;
}
.layout-end { margin-left: auto; }

.divider {
    height: 24px;
    width: 1px;
    background-color: #cdcfcd;
    box-shadow: 1px 0 0 #fdfdfd;
}

/* 自定义选框和普通Button呈现极简化无厚黑边款的高逼格专业控制按钮特征 */
.pro-toggle {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    padding: 4px;
    user-select: none;
}
.pro-toggle input { display: none; }
.pro-toggle-box {
    width: 14px;
    height: 14px;
    margin-right: 6px;
    border: 1px solid #728178;
    background: #fff;
    border-radius: 2px; /* Pro微小转角方方格 */
    display: flex;
    justify-content: center;
    align-items: center;
}
.icon-check { width: 10px; height: 10px; fill: #4ea84c;}
.pro-toggle input:checked + .pro-toggle-box { border-color: #4ea84c; background: #eef7ee;}
.pro-toggle:hover .pro-toggle-box { border-color: #278627;}

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
    color: #38403b;
    cursor: pointer;
    outline: none;
    transition: all 0.15s ease-out;
}
.pro-icon-field { width: 14px; height: 14px; fill: currentColor;}
.pro-toolbar-btn:hover { background: #e3efea; border-color: #afceba; color: #2d6b35;}
.pro-toolbar-btn.active { background: #dcece1; border-color: #a4cead; color: #17541f; }


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
.pro-select:hover { border-color: #559154; }
.pro-select:focus { border-color: #46a246; box-shadow: 0 0 2px rgba(78, 168, 76, 0.4);}
.pro-tags-wrap {
    display: inline-flex;
    gap: 6px;
    background: rgba(0,0,0,0.02);
    border: 1px inset rgba(0,0,0,0.06);
    padding: 2px 4px;
}
.pro-stat-chip {
    font-size: 11px;
    color: #505d53;
    background: rgba(255,255,255,0.85);
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
    background: rgba(255,255,255,0.7);
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
.pro-field-grid::-webkit-scrollbar { width: 12px; }
.pro-field-grid::-webkit-scrollbar-thumb { border: 2px solid #fff; border-radius:6px; background-color: #c0c6c1; }

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
.ch-wrap { justify-self: center; }
.native-cb { accent-color: #48a649; width: 13px; height: 13px;}

.field-row {
    display: grid;
    grid-template-columns: 46px minmax(140px, 1.2fr) minmax(180px, 1fr) 90px;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #f1f2f0;
    padding: 3px 0;
}
.field-row:hover { background: #f2f7f2; }
.code { color: #116239; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size:12px; }
.type-badge { font-size: 11px; font-weight: 500; color: #72847c; text-transform: capitalize;}

.pro-input {
    width: 90%;
    height: 24px;
    padding: 0 6px;
    font-size: 12px;
    border: 1px solid #cccbcb;
    outline: none;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
}
.pro-input:focus { border-color: #5bb25a; background:#fafffa;}

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
.empty-icon svg { width: 32px; height: 32px; color: #a4beac;}

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
.pro-scroll-area::-webkit-scrollbar { width: 14px; height: 14px; }
.pro-scroll-area::-webkit-scrollbar-track { background: #f4f5f4; border-left: 1px solid #dfe1df; border-top: 1px solid #dfe1df; }
.pro-scroll-area::-webkit-scrollbar-thumb { background: #bfc5c1; background-clip: content-box; border: 3px solid transparent;}
.pro-scroll-area::-webkit-scrollbar-thumb:hover { background-color: #9ea7a0; }

.pro-grid-layout { min-width: max-content; }
.virtual-holder { position: relative; min-width: max-content;}

.pro-th-group {
    display: grid;
    position: sticky;
    top: 0;
    z-index: 3;
    min-width: max-content;
    border-bottom: 1px solid #a3aca4; /* 顶部分裂横栏通常比下层分隔要沉粗显见!这是很细节特征!*/
    background: #ebefec; /* Esri 标准默认灰色调数据背景或微极色配出冷清肃冷的感觉而非强干扰颜色.*/
}
.pro-tr {
    display: grid;
    position: absolute;
    left: 0; right: 0;
    /* 行距调整在行主板里执行。当前行是30所以定义固实值 */
    height: 30px; 
    min-width: max-content;
    border-bottom: 1px solid #e1e3e0;
    background: #ffffff;
    transition: none; /* Native UI不带拖拉效果的瞬间改变才是常态.*/
}
.pro-tr:nth-child(even) {
    background: #fafbfa; /* GIS经典的交错条背景带极细差距用于校眼 */
}
.pro-tr:hover { background: #e5efe8; cursor: default; }

.pro-tr.selected {
    background: #bcebc1; /* 高亮的青荧绿：对齐系统特主题且具备穿透数据的明确标识能力*/
    color: #0b4f17;
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

.cell.data.numeric-data { justify-content: flex-end;} /* 表列中原厂型特征往往让数字进行底边后方平靠来统一齐对度.*/
.pro-tr.selected .cell { border-right-color: rgba(69, 148, 77, 0.22); } 

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
    box-shadow: inset -1px -1px 0 rgba(255,255,255,0.6), inset 1px 1px 0 rgba(255,255,255,0.7);
}
.header-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap;}
.header-sort-grip { position: absolute; right: 4px; display: none; } 
/* Reserved spot to simulate Arc "A-Z sorting caret visual triggers if future wanted" */


/* IDs Fix Column Special Standard Native Behavior (always gray or differently filled visually left bounder box!)  */
.id-col {
    position: sticky;
    left: 0;
    z-index: 2; /* 浮前确保不会因过远推入隐退背景而消失数据序列对准力  */
    background: #f1f4f1; /* 常驻固态边款侧行，原灰色设计*/
    color: #4a544c;
    border-right: 1px solid #cbcfcd;
}
.cell.header.id-col { z-index: 4; box-shadow: inset 0 -1px 0 #9ca39d; font-weight: bold;}


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
.sel-count { background: #b1e0b5; border: 1px solid #6cb170; border-radius:10px; padding:0 8px; color: #164a1a;}

/* Resize Standard Generic Handling setup as structural bounding transparent grips */
.resize-grip {
    position: absolute;
    z-index: 500;
}
.resize-grip.top, .resize-grip.bottom { left: 4px; right: 4px; height: 5px; }
.resize-grip.top { top: -2px;}
.resize-grip.bottom { bottom: -2px;}
.resize-grip.left, .resize-grip.right { top: 4px; bottom: 4px; width: 5px; }
.resize-grip.left { left: -2px;}
.resize-grip.right { right: -2px;}
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
    width: 12px; height: 12px;
    margin: 1px;
    fill: #9fa4a0; /* typical discrete subtle icon element bound marker right bot spot*/
}

.pro-float-fade-enter-active,
.pro-float-fade-leave-active {
    transition: opacity 0.12s ease-out, transform 0.1s ease-out; /* native 窗口启动往往迅捷无缝直接展开更干脆 */
}
.pro-float-fade-enter-from,
.pro-float-fade-leave-to {
    opacity: 0;
    transform: translateY(5px); /* Minimal vertical bounce not highly scaling.*/
}
</style>