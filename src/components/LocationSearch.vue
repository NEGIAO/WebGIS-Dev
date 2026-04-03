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
            <li v-for="(item, index) in items" :key="`${item.id || item.display_name || item.name}_${index}`" @click="$emit('select-result', item)">
                <div class="name">{{ item.name || item.display_name }}</div>
                <div class="address">{{ item.address || item.display_name || '暂无地址信息' }}</div>
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

const props = defineProps({
    fetcher: {
        type: Function,
        required: true
    },
    amapKey: {
        type: String,
        default: ''
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
            pageSize: props.pageSize,
            amapKey: props.amapKey
        });

        items.value = Array.isArray(result?.items) ? result.items : [];
        total.value = Number(result?.total || 0);
    } catch (error) {
        message.warning('location search failed', error);
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
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    background: #fff;
}

.search-input {
    flex: 1;
    min-width: 150px;
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

.address {
    margin-top: 2px;
    font-size: 12px;
    color: #5f7266;
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
