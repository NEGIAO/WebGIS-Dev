<template>
    <transition name="attribute-fade">
        <section v-if="isVisible" class="attribute-table" :class="{ collapsed: isCollapsed, mobile: isMobile }">
            <header class="attribute-head" @click="toggleCollapse">
                <div class="attribute-title-wrap">
                    <div class="attribute-title">属性表</div>
                    <div class="attribute-subtitle">
                        {{ layerName }} · {{ totalRows }} 条
                    </div>
                </div>
                <div class="attribute-actions">
                    <button class="attribute-btn" type="button" @click.stop="toggleCollapse">
                        {{ isCollapsed ? '展开' : '收起' }}
                    </button>
                    <button class="attribute-btn danger" type="button" @click.stop="closeTable">关闭</button>
                </div>
            </header>

            <div v-show="!isCollapsed" class="attribute-body">
                <div v-if="!totalRows" class="attribute-empty">当前图层没有可展示的属性数据</div>
                <template v-else>
                    <div class="attribute-toolbar">
                        <div class="attribute-meta">字段 {{ columns.length }} 个</div>
                        <div v-if="needsPagination" class="attribute-pager">
                            <button class="pager-btn" type="button" :disabled="currentPage === 1" @click="prevPage">上一页</button>
                            <span class="pager-text">{{ currentPage }} / {{ totalPages }}</span>
                            <button class="pager-btn" type="button" :disabled="currentPage === totalPages" @click="nextPage">下一页</button>
                        </div>
                    </div>

                    <div class="table-scroll">
                        <table class="attribute-grid">
                            <thead>
                                <tr>
                                    <th class="sticky-col">#</th>
                                    <th v-for="column in columns" :key="column">{{ column }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="(row, index) in pagedRows"
                                    :key="rowKey(row, index)"
                                    :class="{ selected: rowKey(row, index) === selectedFeatureId }"
                                    @click="handleRowClick(row, index)"
                                    @dblclick.stop="handleRowDblClick(row, index)"
                                >
                                    <td class="sticky-col row-index">{{ (currentPage - 1) * pageSize + index + 1 }}</td>
                                    <td v-for="column in columns" :key="`${rowKey(row, index)}_${column}`">
                                        {{ formatValue(getProperty(row, column)) }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </template>
            </div>
        </section>
    </transition>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useLayerStore } from '../composables/useLayerStore';

const store = useLayerStore();
const isCollapsed = ref(false);
const isMobile = ref(false);
const currentPage = ref(1);

const activeLayer = computed(() => store.activeAttributeLayer);
const rows = computed(() => Array.isArray(store.activeAttributeTable) ? store.activeAttributeTable : []);
const isVisible = computed(() => store.attributeTableVisible && !!activeLayer.value);
const totalRows = computed(() => rows.value.length);
const selectedFeatureId = computed(() => String(store.selectedAttributeFeatureId || ''));
const layerName = computed(() => activeLayer.value?.name || '未命名图层');

const columns = computed(() => {
    const keys = new Set();
    rows.value.forEach((row) => {
        const properties = row?.properties && typeof row.properties === 'object' ? row.properties : row || {};
        Object.keys(properties).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
});

const pageSize = computed(() => (totalRows.value > 1000 ? 50 : Math.max(totalRows.value, 1)));
const totalPages = computed(() => Math.max(1, Math.ceil(totalRows.value / pageSize.value)));
const needsPagination = computed(() => totalRows.value > pageSize.value);
const pagedRows = computed(() => {
    if (!needsPagination.value) return rows.value;
    const start = (currentPage.value - 1) * pageSize.value;
    return rows.value.slice(start, start + pageSize.value);
});

function detectMobile() {
    isMobile.value = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
}

function rowKey(row, index) {
    return String(row?.id || row?._gid || row?.properties?._gid || row?.properties?.id || `${currentPage.value}_${index}`);
}

function getProperty(row, key) {
    const properties = row?.properties && typeof row.properties === 'object' ? row.properties : row || {};
    return properties?.[key];
}

function formatValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value;
}

function closeTable() {
    store.closeAttributeTable();
}

function handleRowClick(row) {
    store.highlightFeature(rowKey(row));
}

function handleRowDblClick(row) {
    store.zoomToFeature(rowKey(row));
}

function prevPage() {
    currentPage.value = Math.max(1, currentPage.value - 1);
}

function nextPage() {
    currentPage.value = Math.min(totalPages.value, currentPage.value + 1);
}

watch([activeLayer, rows], () => {
    currentPage.value = 1;
    isCollapsed.value = false;
}, { immediate: true });

onMounted(() => {
    detectMobile();
    window.addEventListener('resize', detectMobile, { passive: true });
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', detectMobile);
});
</script>

<style scoped>
.attribute-table {
    border: 1px solid rgba(118, 179, 135, 0.3);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(12px);
    box-shadow: 0 14px 30px rgba(53, 94, 64, 0.12);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    margin-top: 10px;
}

.attribute-table.mobile {
    position: fixed;
    left: 10px;
    right: 10px;
    bottom: 10px;
    z-index: 1200;
    max-height: 52vh;
}

.attribute-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: linear-gradient(135deg, rgba(49, 157, 88, 0.96), rgba(38, 128, 72, 0.96));
    color: #ffffff;
    cursor: pointer;
}

.attribute-title-wrap {
    min-width: 0;
}

.attribute-title {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
}

.attribute-subtitle {
    font-size: 11px;
    opacity: 0.88;
    margin-top: 3px;
}

.attribute-actions {
    display: inline-flex;
    gap: 8px;
    flex-shrink: 0;
}

.attribute-btn,
.pager-btn {
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
}

.attribute-btn.danger {
    background: rgba(255, 255, 255, 0.12);
}

.attribute-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 100%;
}

.attribute-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 10px 12px 8px;
    border-bottom: 1px solid #dcefe2;
}

.attribute-meta {
    font-size: 12px;
    color: #4f6a58;
}

.attribute-pager {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.pager-btn {
    color: #2c6f45;
    border-color: rgba(53, 144, 82, 0.24);
    background: rgba(240, 255, 244, 0.82);
}

.pager-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.pager-text {
    font-size: 12px;
    color: #587263;
}

.table-scroll {
    overflow: auto;
    max-height: 42vh;
}

.attribute-grid {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    min-width: max-content;
}

.attribute-grid thead th {
    position: sticky;
    top: 0;
    background: #2f9a57;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    padding: 10px 12px;
    text-align: left;
    white-space: nowrap;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    z-index: 2;
}

.attribute-grid tbody td {
    font-size: 12px;
    color: #2d4034;
    padding: 9px 12px;
    border-bottom: 1px solid #e6f2e9;
    white-space: nowrap;
}

.attribute-grid tbody tr:nth-child(odd) td {
    background: #f0fff4;
}

.attribute-grid tbody tr:nth-child(even) td {
    background: rgba(255, 255, 255, 0.88);
}

.attribute-grid tbody tr:hover td {
    background: #e7f8ec;
}

.attribute-grid tbody tr.selected td {
    background: #d8f3df !important;
}

.sticky-col {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 64px;
}

.attribute-grid thead .sticky-col {
    z-index: 3;
}

.row-index {
    font-weight: 700;
    color: #27613d;
}

.attribute-empty {
    padding: 18px 14px;
    color: #67806d;
    font-size: 13px;
}

.attribute-fade-enter-active,
.attribute-fade-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}

.attribute-fade-enter-from,
.attribute-fade-leave-to {
    opacity: 0;
    transform: translateY(8px);
}

@media (max-width: 768px) {
    .attribute-table {
        border-radius: 16px 16px 14px 14px;
    }

    .attribute-head {
        padding: 12px 12px;
    }

    .table-scroll {
        max-height: 38vh;
    }

    .attribute-grid thead th,
    .attribute-grid tbody td {
        padding: 8px 10px;
    }
}
</style>
