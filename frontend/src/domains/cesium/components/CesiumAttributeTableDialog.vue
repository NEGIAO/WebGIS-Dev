<template>
    <Teleport to="body">
        <div v-if="visible" class="attr-overlay" @click.self="$emit('close')">
            <div class="attr-dialog" role="dialog" aria-modal="true" :aria-label="data?.title || '属性表'">
                <header class="attr-header">
                    <div class="attr-title-row">
                        <Table :size="16" stroke-width="2" />
                        <span class="attr-title">{{ data?.title || t('cesium.attributeTable.title') }}</span>
                    </div>
                    <div class="attr-meta">
                        <span class="attr-count">
                            {{ t('cesium.attributeTable.rowCount', { count: filteredRows.length }) }}
                        </span>
                        <span v-if="data?.truncated" class="attr-truncated">
                            {{ t('cesium.attributeTable.truncated') }}
                        </span>
                    </div>
                    <button class="attr-close" :title="t('common.close')" @click="$emit('close')">
                        <X :size="15" />
                    </button>
                </header>

                <div class="attr-toolbar">
                    <div class="attr-search">
                        <Search :size="13" />
                        <input
                            v-model="keyword"
                            class="attr-search-input"
                            type="search"
                            :placeholder="t('cesium.attributeTable.searchPlaceholder')"
                        />
                    </div>
                </div>

                <div class="attr-body">
                    <table v-if="filteredRows.length" class="attr-table">
                        <thead>
                            <tr>
                                <th class="col-index">#</th>
                                <th class="col-name">{{ t('cesium.attributeTable.nameColumn') }}</th>
                                <th v-for="col in data.columns" :key="col">{{ col }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="(row, index) in visibleRows"
                                :key="row.entityId"
                                :title="t('cesium.attributeTable.locateTip')"
                                @click="$emit('locate', row.entityId)"
                            >
                                <td class="col-index">{{ index + 1 }}</td>
                                <td class="col-name">{{ row.name }}</td>
                                <td v-for="col in data.columns" :key="col">{{ row.values[col] ?? '' }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else class="attr-empty">
                        {{ data?.rows?.length ? t('cesium.attributeTable.noMatch') : t('cesium.attributeTable.empty') }}
                    </div>
                </div>

                <footer v-if="filteredRows.length > PAGE_SIZE" class="attr-footer">
                    <button class="page-btn" :disabled="page === 0" @click="page -= 1">‹</button>
                    <span class="page-info">{{ page + 1 }} / {{ pageCount }}</span>
                    <button class="page-btn" :disabled="page >= pageCount - 1" @click="page += 1">›</button>
                </footer>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
/**
 * CesiumAttributeTableDialog.vue — 三维矢量图层属性表（只读）
 *
 * 数据来源：`collectEntityProperties(Cesium, dataSource.entities.values)`，
 * 由 CesiumContainer 在 TOC 右键「打开属性表」时构建并下发。
 *
 * 交互约定：
 * - 表格只读（3D 侧没有可回写的属性存储，写入会静默丢失，故不提供编辑态）
 * - 点击行 → 上抛 locate(entityId)，由容器 flyTo 该要素
 * - 行数上限 5000（容器侧截断），前端再按 PAGE_SIZE 分页，避免万级 DOM 卡顿
 */
import { computed, ref, watch } from 'vue';
import { Search, Table, X } from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';

const props = defineProps({
    visible: { type: Boolean, default: false },
    /** { title, columns: string[], rows: [{entityId,name,values}], truncated: boolean } */
    data: { type: Object, default: null },
});

defineEmits(['close', 'locate']);

const { t } = useLocale();

const PAGE_SIZE = 100;

const keyword = ref('');
const page = ref(0);

// 打开新图层或换关键词时回到第一页，避免停在越界页码上
watch(
    () => [props.data, keyword.value],
    () => {
        page.value = 0;
    },
);

const filteredRows = computed(() => {
    const rows = props.data?.rows || [];
    const kw = keyword.value.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((row) => {
        if (String(row.name).toLowerCase().includes(kw)) return true;
        return Object.values(row.values || {}).some((value) =>
            String(value ?? '').toLowerCase().includes(kw),
        );
    });
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / PAGE_SIZE)));

const visibleRows = computed(() => {
    const start = page.value * PAGE_SIZE;
    return filteredRows.value.slice(start, start + PAGE_SIZE);
});
</script>

<style scoped>
.attr-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-toast);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.42);
    backdrop-filter: blur(2px);
    padding: 24px;
}

.attr-dialog {
    width: min(1080px, 100%);
    max-height: min(78vh, 720px);
    display: flex;
    flex-direction: column;
    background: var(--panel-bg, #fff);
    border-radius: var(--panel-radius, 12px);
    box-shadow: var(--panel-shadow, 0 18px 48px rgba(15, 23, 42, 0.28));
    overflow: hidden;
}

.attr-header {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 44px 12px 16px;
    background: var(--brand-gradient-header);
    color: #fff;
}

.attr-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.attr-title {
    font-size: 14px;
    font-weight: 600;
}

.attr-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    opacity: 0.9;
}

.attr-truncated {
    color: #ffe08a;
}

.attr-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    cursor: pointer;
    transition: background 0.2s;
}

.attr-close:hover {
    background: rgba(255, 255, 255, 0.4);
}

.attr-toolbar {
    padding: 10px 16px;
    border-bottom: 1px solid var(--bg-brand-light, #e8eef3);
    background: #fff;
}

.attr-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 1px solid var(--bg-brand-light, #e8eef3);
    border-radius: 8px;
    color: var(--text-secondary, #6b7280);
    background: #fafcfe;
}

.attr-search-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: var(--text-primary, #111827);
}

.attr-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}

.attr-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
}

.attr-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
    white-space: nowrap;
    color: var(--text-brand, #374151);
    background: #f3f7fa;
    border-bottom: 1px solid var(--bg-brand-light, #e8eef3);
}

.attr-table td {
    padding: 6px 10px;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-bottom: 1px dashed var(--bg-brand-light, #e8eef3);
    color: var(--text-primary, #111827);
}

.attr-table tbody tr {
    cursor: pointer;
}

.attr-table tbody tr:hover td {
    background: var(--bg-hover, #f1f7ff);
}

.col-index {
    width: 44px;
    color: var(--text-secondary, #6b7280);
    text-align: right;
}

.col-name {
    font-weight: 600;
}

.attr-empty {
    padding: 40px 16px;
    text-align: center;
    color: var(--text-secondary, #6b7280);
    font-size: 12px;
}

.attr-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 16px;
    border-top: 1px solid var(--bg-brand-light, #e8eef3);
    background: #fff;
    font-size: 12px;
    color: var(--text-secondary, #6b7280);
}

.page-btn {
    width: 26px;
    height: 26px;
    border: 1px solid var(--bg-brand-light, #e8eef3);
    border-radius: 6px;
    background: #fff;
    color: var(--text-brand, #374151);
    cursor: pointer;
}

.page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* 移动端：表格横向滚动、按钮放大到触屏基线 */
@media (pointer: coarse) {
    .attr-overlay {
        padding: 10px;
    }

    .attr-dialog {
        max-height: 88vh;
    }

    .attr-close {
        width: 32px;
        height: 32px;
    }

    .page-btn {
        width: 40px;
        height: 40px;
    }
}
</style>
