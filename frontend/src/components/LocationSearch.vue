<template>
    <div class="location-search" ref="rootRef">
        <form class="search-form" @submit.prevent="handleSubmit">
            <input
                v-model.trim="keywords"
                class="search-input"
                type="text"
                :placeholder="placeholder"
            />
            <div class="search-action">
                <button class="search-btn" type="submit">搜索</button>
                <ul v-if="showServiceMenu" class="service-menu">
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

        <div v-if="loading" class="status loading">Loading...</div>
        <div v-else-if="searched && !items.length" class="status empty">未找到相关地点</div>

        <ul v-if="!loading && items.length" class="result-list">
            <li v-for="(item, index) in items" :key="`${item.id || item.display_name || item.name}_${index}`" @click="handleSelectResult(item)">
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
                <div v-if="resolvePoiId(item)" class="poi-id">ID: {{ resolvePoiId(item) }}</div>
            </li>
        </ul>

        <div v-if="!loading && totalPages > 1" class="pagination">
            <button class="page-btn" type="button" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
            <span class="page-text">{{ page }} / {{ totalPages }}</span>
            <button class="page-btn" type="button" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMessage } from '../composables/useMessage';

const props = defineProps({
    fetcher: {
        type: Function,
        required: true
    },
    placeholder: {
        type: String,
        default: '搜索地名，如：郑州'
    },
    pageSize: {
        type: Number,
        default: 10
    },
    storageKey: {
        type: String,
        default: ''
    },
    defaultService: {
        type: String,
        default: 'tianditu'
    },
    services: {
        type: Array,
        default: () => ([
            { value: 'tianditu', label: '天地图' },
            { value: 'nominatim', label: '国际（Nominatim）' },
            { value: 'amap', label: '高德（Amap）' }
        ])
    }
});

const emit = defineEmits(['select-result']);
const message = useMessage();

const rootRef = ref(null);
const keywords = ref('');
const page = ref(1);
const loading = ref(false);
const searched = ref(false);
const items = ref([]);
const total = ref(0);
const service = ref(props.defaultService);
const showServiceMenu = ref(false);
let debounceTimer = null;

const totalPages = computed(() => {
    const totalVal = Number(total.value || 0);
    const pageSize = Math.max(1, Number(props.pageSize || 10));
    return Math.max(1, Math.ceil(totalVal / pageSize));
});

function clearDebounceTimer() {
    if (!debounceTimer) return;
    clearTimeout(debounceTimer);
    debounceTimer = null;
}

function resolvePoiId(item) {
    return String(item?.id ?? item?.poiid ?? '').trim();
}

async function copyPoiId(item) {
    const poiId = resolvePoiId(item);
    if (!poiId) {
        message.warning('该结果不包含可复制的 POI ID');
        return;
    }

    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(poiId);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = poiId;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        message.success(`已复制 POI ID：${poiId}`);
    } catch {
        message.error('复制失败，请稍后重试');
    }
}

async function runSearch(targetPage = 1) {
    const q = String(keywords.value || '').trim();
    if (!q) {
        items.value = [];
        total.value = 0;
        searched.value = false;
        return;
    }

    loading.value = true;
    searched.value = true;
    page.value = targetPage;

    try {
        const result = await props.fetcher({
            service: service.value,
            keywords: q,
            page: targetPage,
            pageSize: props.pageSize
        });

        items.value = Array.isArray(result?.items) ? result.items : [];
        total.value = Number(result?.total || 0);
    } catch (error) {
        console.error('location search failed', error);
        message.warning('地点搜索失败，请稍后重试');
        items.value = [];
        total.value = 0;
    } finally {
        loading.value = false;
    }
}

function handleSubmit() {
    const q = String(keywords.value || '').trim();
    if (!q) {
        items.value = [];
        total.value = 0;
        searched.value = false;
        return;
    }
    showServiceMenu.value = !showServiceMenu.value;
}

function handleServicePick(nextService) {
    service.value = nextService;
    showServiceMenu.value = false;
    clearDebounceTimer();
    runSearch(1);
}

function handleOutsideClick(event) {
    if (!showServiceMenu.value) return;
    if (rootRef.value?.contains(event.target)) return;
    showServiceMenu.value = false;
}

function changePage(nextPage) {
    if (nextPage < 1 || nextPage > totalPages.value) return;
    runSearch(nextPage);
}

function handleSelectResult(item) {
    emit('select-result', {
        ...(item || {}),
        _service: service.value
    });
}

watch(keywords, (val) => {
    clearDebounceTimer();

    if (!String(val || '').trim()) {
        items.value = [];
        total.value = 0;
        searched.value = false;
        return;
    }

    debounceTimer = setTimeout(() => {
        runSearch(1);
    }, 500);
});

watch(service, (val) => {
    if (props.storageKey) {
        try {
            window.localStorage.setItem(props.storageKey, val);
        } catch {}
    }

    if (String(keywords.value || '').trim()) {
        clearDebounceTimer();
        runSearch(1);
    }
});

onMounted(() => {
    if (!props.storageKey) return;
    try {
        const val = window.localStorage.getItem(props.storageKey);
        if (val && props.services.some((item) => item.value === val)) {
            service.value = val;
        }
    } catch {}

    document.addEventListener('click', handleOutsideClick);
});

onBeforeUnmount(() => {
    clearDebounceTimer();
    document.removeEventListener('click', handleOutsideClick);
});
</script>

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
    color: #000000;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
}

.search-btn:hover {
    background: #195e3b;
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
    color: #2b3e34;
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
    color: #16553a;
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
    color: #213a2d;
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
    color: #2f4f3e;
    border-radius: 6px;
    padding: 2px 7px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
}

.copy-poi-btn:hover {
    border-color: #5ca67b;
    background: #eef8f2;
    color: #1f6e45;
}

.address {
    margin-top: 2px;
    font-size: 12px;
    color: #5f7266;
}

.poi-id {
    margin-top: 3px;
    font-size: 11px;
    color: #8fa399;
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
