<template>
    <div class="map-ui-card map-search-box" ref="rootRef">
        <form class="search-form" @submit.prevent="handleSubmit">
            <input
                v-model.trim="keyword"
                class="keyword-input"
                placeholder="搜索地名或兴趣点，例如：郑州"
                @keydown.enter.prevent="handleSubmit"
            />
            <div class="action-wrap">
                <button class="search-btn" type="submit" :disabled="isSearching">
                    {{ isSearching ? '搜索中' : '搜索' }}
                </button>
                <button class="service-btn" type="button" @click="toggleServiceMenu">
                    {{ activeServiceLabel }}
                </button>

                <ul v-if="showServiceMenu" class="service-menu">
                    <li
                        v-for="item in serviceOptions"
                        :key="item.value"
                        :class="{ active: service === item.value }"
                        @click="pickService(item.value)"
                    >
                        {{ item.label }}
                    </li>
                </ul>
            </div>
        </form>

        <div class="status loading" v-if="isSearching">搜索中...</div>
        <div class="status empty" v-else-if="searched && !items.length">未找到相关地点</div>
        <div class="status success" v-else-if="statusText">{{ statusText }}</div>

        <ul v-if="!isSearching && items.length" class="result-list">
            <li
                v-for="(item, index) in items"
                :key="`${item.id || item.display_name || item.name}_${index}`"
                @click="handleSelect(item)"
            >
                <div class="name">{{ item.name || item.display_name || '未知地点' }}</div>
                <div class="address">{{ item.address || item.display_name || '暂无地址信息' }}</div>
            </li>
        </ul>

        <div v-if="!isSearching && totalPages > 1" class="pagination">
            <button class="page-btn" type="button" :disabled="page <= 1" @click="changePage(page - 1)">
                上一页
            </button>
            <span class="page-text">{{ page }} / {{ totalPages }}</span>
            <button class="page-btn" type="button" :disabled="page >= totalPages" @click="changePage(page + 1)">
                下一页
            </button>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { fetchLocationResultsByService } from '../../api/locationSearch';
import { useMapStateStore } from '../../stores/mapStateStore';
import { useLayerStore } from '../../stores/layerStore';

const mapStateStore = useMapStateStore();
const layerStore = useLayerStore();

const rootRef = ref(null);
const keyword = ref('');
const service = ref('tianditu');
const isSearching = ref(false);
const statusText = ref('');
const searched = ref(false);
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 8;
const showServiceMenu = ref(false);

const serviceOptions = [
    { value: 'tianditu', label: '天地图' },
    { value: 'nominatim', label: 'Nominatim' },
    { value: 'amap', label: '高德' }
];

const activeServiceLabel = computed(() => {
    const current = serviceOptions.find((item) => item.value === service.value);
    return current?.label || '服务';
});

const totalPages = computed(() => {
    const totalValue = Number(total.value || 0);
    return Math.max(1, Math.ceil(totalValue / pageSize));
});

function toMapBoundText(extent) {
    if (!Array.isArray(extent) || extent.length !== 4) return undefined;
    const values = extent.map((v) => Number(v));
    if (values.some((v) => !Number.isFinite(v))) return undefined;
    return values.join(',');
}

async function handleSearch(targetPage = 1) {
    const text = String(keyword.value || '').trim();
    if (!text || isSearching.value) return;

    isSearching.value = true;
    searched.value = true;
    page.value = targetPage;
    statusText.value = '';
    showServiceMenu.value = false;

    try {
        const result = await fetchLocationResultsByService({
            service: service.value,
            keywords: text,
            page: targetPage,
            pageSize,
            tiandituTk: import.meta.env.VITE_TIANDITU_TK || '' ,
            amapKey: '3e6d96476b807126acbc59384aa13e51',
            mapBound: service.value === 'tianditu' ? toMapBoundText(mapStateStore.extent) : undefined
        });

        items.value = Array.isArray(result?.items) ? result.items : [];
        total.value = Number(result?.total || 0);
        statusText.value = items.value.length ? `找到 ${items.value.length} 条结果` : '';
    } catch (error) {
        console.error('地名搜索失败', error);
        items.value = [];
        total.value = 0;
        statusText.value = '搜索失败，请稍后重试';
    } finally {
        isSearching.value = false;
    }
}

function handleSubmit() {
    if (!String(keyword.value || '').trim()) {
        searched.value = false;
        statusText.value = '';
        items.value = [];
        total.value = 0;
        return;
    }
    handleSearch(1);
}

function handleSelect(item) {
    const lon = Number(item?.lon);
    const lat = Number(item?.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

    const displayName = item?.display_name || item?.name || '搜索结果';
    const feature = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
        type: 'search',
        名称: displayName,
        经度: Number(lon.toFixed(6)),
        纬度: Number(lat.toFixed(6))
    });

    layerStore.addLayer({
        id: `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: displayName,
        type: 'vector',
        visible: true,
        opacity: 1,
        olFeatures: [feature],
        style: {
            fillColor: '#ef4444',
            fillOpacity: 0.12,
            strokeColor: '#ffffff',
            strokeWidth: 2,
            pointRadius: 8
        },
        meta: {
            source: 'search',
            longitude: Number(lon.toFixed(6)),
            latitude: Number(lat.toFixed(6))
        }
    });

    const targetZoom = Math.max(15, Number(mapStateStore.zoom || 0));
    mapStateStore.focusSearchLocation([lon, lat], targetZoom);
    statusText.value = `已定位: ${displayName}`;
}

function changePage(nextPage) {
    if (nextPage < 1 || nextPage > totalPages.value) return;
    handleSearch(nextPage);
}

function toggleServiceMenu() {
    showServiceMenu.value = !showServiceMenu.value;
}

function pickService(nextService) {
    service.value = nextService;
    showServiceMenu.value = false;
    if (String(keyword.value || '').trim()) {
        handleSearch(1);
    }
}

function handleOutsideClick(event) {
    if (!showServiceMenu.value) return;
    if (rootRef.value?.contains(event.target)) return;
    showServiceMenu.value = false;
}

onMounted(() => {
    document.addEventListener('click', handleOutsideClick);
});

onBeforeUnmount(() => {
    document.removeEventListener('click', handleOutsideClick);
});
</script>

<style scoped>
.map-ui-card {
    background: linear-gradient(140deg, rgba(248, 253, 249, 0.92), rgba(238, 249, 242, 0.86));
    border: 1px solid rgba(22, 101, 52, 0.22);
    border-radius: 14px;
    padding: 10px;
    box-shadow: 0 14px 28px rgba(8, 35, 25, 0.24);
    backdrop-filter: blur(10px);
}

.search-form {
    display: flex;
    gap: 8px;
    align-items: center;
}

.keyword-input {
    flex: 1;
    min-width: 0;
    border: 1px solid rgba(22, 101, 52, 0.22);
    border-radius: 9px;
    padding: 8px 10px;
    font-size: 13px;
    background: rgba(255, 255, 255, 0.96);
}

.action-wrap {
    display: flex;
    position: relative;
    gap: 6px;
}

.search-btn,
.service-btn {
    border: 1px solid rgba(17, 79, 43, 0.2);
    border-radius: 9px;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    color: #f0fdf4;
    background: linear-gradient(145deg, #1f7a46, #155a34);
    cursor: pointer;
    white-space: nowrap;
}

.search-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.service-btn {
    color: #e2fbe9;
    background: linear-gradient(145deg, #2f8f55, #1f7a46);
}

.service-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    list-style: none;
    margin: 0;
    padding: 6px;
    min-width: 140px;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid rgba(15, 118, 62, 0.2);
    border-radius: 10px;
    box-shadow: 0 14px 22px rgba(8, 35, 25, 0.24);
    z-index: 1300;
}

.service-menu li {
    padding: 7px 8px;
    font-size: 12px;
    color: #1f4330;
    border-radius: 7px;
    cursor: pointer;
}

.service-menu li:hover,
.service-menu li.active {
    background: rgba(220, 248, 229, 0.9);
}

.status {
    margin-top: 8px;
    font-size: 12px;
    color: #065f46;
    line-height: 1.4;
    border-radius: 8px;
    padding: 6px 8px;
}

.status.loading {
    background: rgba(218, 245, 227, 0.9);
}

.status.empty {
    background: rgba(236, 248, 241, 0.95);
    color: #527061;
}

.status.success {
    background: rgba(217, 247, 227, 0.94);
}

.result-list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    max-height: 208px;
    overflow: auto;
    border-radius: 10px;
    border: 1px solid rgba(22, 101, 52, 0.14);
    background: rgba(255, 255, 255, 0.95);
}

.result-list li {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(21, 94, 54, 0.08);
    cursor: pointer;
}

.result-list li:last-child {
    border-bottom: none;
}

.result-list li:hover {
    background: rgba(227, 249, 236, 0.9);
}

.name {
    font-size: 13px;
    font-weight: 600;
    color: #1f4330;
}

.address {
    margin-top: 2px;
    font-size: 12px;
    color: #5b7164;
}

.pagination {
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
}

.page-btn {
    border: 1px solid rgba(17, 79, 43, 0.2);
    border-radius: 8px;
    padding: 5px 8px;
    background: rgba(255, 255, 255, 0.98);
    color: #1f4330;
    cursor: pointer;
    font-size: 12px;
}

.page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.page-text {
    font-size: 12px;
    color: #466152;
}
</style>
