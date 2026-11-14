<template>
    <div
        ref="rootRef"
        class="location-search"
    >
        <form
            class="search-form"
            @submit.prevent="handleSubmit"
        >
            <input
                v-model.trim="keywords"
                class="search-input"
                type="text"
                :placeholder="placeholder"
            />
            <div class="search-action">
                <button
                    class="search-btn"
                    type="submit"
                >
                    <span class="btn-icon">
                        <search-icon
                            :size="17"
                            :stroke-width="3"
                        />
                    </span>
                </button>
                <ul
                    v-if="showServiceMenu"
                    class="service-menu"
                >
                    <li
                        v-for="item in services"
                        :key="item.value"
                        @click="handleServicePick(item.value)"
                    >
                        {{ item.label }}
                    </li>
                </ul>
            </div>
        </form>

        <div
            v-if="loading"
            class="status loading"
        >
            Loading...
        </div>
        <div
            v-else-if="searched && !items.length"
            class="status empty"
        >
            未找到相关地点
        </div>

        <div
            v-if="!loading && searched && items.length"
            class="search-quota-bar"
        >
            <span class="quota-label">{{ t('search.lastSearch') }}</span>
            <span class="quota-cost">{{ lastSearchCost > 0 ? `-${lastSearchCost}` : '—' }}</span>
            <span class="quota-separator">|</span>
            <span class="quota-label">{{ t('search.remaining') }}</span>
            <span class="quota-remaining">{{ quotaRemaining }}</span>
        </div>

        <ul
            v-if="!loading && items.length"
            class="result-list"
        >
            <li
                v-for="(item, index) in items"
                :key="`${item.id || item.display_name || item.name}_${index}`"
                @click="handleSelectResult(item)"
            >
                <div class="result-head">
                    <div class="name">{{ item.name || item.display_name }}</div>
                    <button
                        v-if="resolvePoiId(item)"
                        class="copy-poi-btn"
                        type="button"
                        @click.stop="copyPoiId(item)"
                    >
                        复制ID
                    </button>
                </div>
                <div class="address">{{ item.address || item.display_name || '暂无地址信息' }}</div>
                <div
                    v-if="resolvePoiId(item)"
                    class="poi-id"
                >
                    ID: {{ resolvePoiId(item) }}
                </div>
            </li>
        </ul>

        <div
            v-if="!loading && totalPages > 1"
            class="pagination"
        >
            <button
                class="page-btn"
                type="button"
                :disabled="page <= 1"
                @click="changePage(page - 1)"
            >
                上一页
            </button>
            <span class="page-text">{{ page }} / {{ totalPages }}</span>
            <button
                class="page-btn"
                type="button"
                :disabled="page >= totalPages"
                @click="changePage(page + 1)"
            >
                下一页
            </button>
        </div>
    </div>
</template>

<script lang="ts" src="./LocationSearch.ts"></script>

<style scoped>
.location-search {
    width: 100%;
    padding-bottom: 1%;
}

.search-form {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
}

.search-input {
    flex: 1;
    min-width: 150px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    background: #fff;
}

.search-action {
    position: relative;
}

.search-btn {
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    background: #ffffff;
    color: var(--brand-primary-dark);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition:
        background 0.15s ease,
        color 0.15s ease,
        transform 0.12s ease;
}

.search-btn:hover {
    background: rgba(255, 255, 255, 0.521);
    color: var(--brand-accent-dark);
}

.search-btn:active {
    transform: scale(0.94);
}

.service-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    list-style: none;
    margin: 0;
    padding: 6px;
    min-width: 164px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.14);
    z-index: 30;
}

.service-menu li {
    border-radius: 6px;
    padding: 7px 8px;
    font-size: 12px;
    color: var(--text-brand-dark);
    cursor: pointer;
}

.service-menu li:hover {
    background: rgba(232, 246, 238, 0.9);
}

.status {
    margin-top: 8px;
    font-size: 12px;
    border-radius: 8px;
    padding: 8px 10px;
}

.status.loading {
    color: var(--text-brand);
    background: rgba(221, 247, 232, 0.9);
}

.status.empty {
    color: #6d7f73;
    background: rgba(240, 246, 242, 0.95);
}

.result-list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    max-height: 210px;
    overflow: auto;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid rgba(0, 0, 0, 0.08);
}

/* 搜索扣费状态条 */
.search-quota-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    padding: 4px 10px;
    font-size: 11px;
    color: #5f6d66;
    background: rgba(232, 246, 238, 0.7);
    border-radius: 6px;
}

.quota-label {
    color: #6d7f73;
}

.quota-cost {
    color: #c62828;
    font-weight: 700;
}

.quota-separator {
    color: #c7d3cc;
    margin: 0 2px;
}

.quota-remaining {
    color: #2a3a32;
    font-weight: 600;
}

.result-list li {
    padding: 9px 10px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    cursor: pointer;
}

.result-list li:last-child {
    border-bottom: none;
}

.result-list li:hover {
    background: rgba(232, 246, 238, 0.9);
}

.name {
    font-size: 13px;
    color: var(--text-brand-dark);
    font-weight: 600;
}

.result-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.copy-poi-btn {
    border: 1px solid rgba(0, 0, 0, 0.14);
    background: #ffffff;
    color: var(--text-brand-dark);
    border-radius: 6px;
    padding: 2px 7px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
}

.copy-poi-btn:hover {
    border-color: var(--border-brand);
    background: var(--bg-brand-light);
    color: var(--text-brand);
}

.address {
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-secondary);
}

.poi-id {
    margin-top: 3px;
    font-size: 11px;
    color: var(--text-muted);
    font-family: 'Courier New', monospace;
    word-break: break-all;
}

.pagination {
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
}

.page-btn {
    border: 1px solid rgba(0, 0, 0, 0.14);
    background: #fff;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
}

.page-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.page-text {
    font-size: 12px;
    color: #4f6157;
}
</style>
