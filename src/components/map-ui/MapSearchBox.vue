<template>
    <div class="map-ui-card map-search-box" ref="rootRef">
        <form class="search-form" @submit.prevent="handleSubmit">
            <input
                v-model.trim="keyword"
                class="keyword-input"
                placeholder="搜索地名，例如：郑州"
                @keydown.enter.prevent="handleSubmit"
            />
            <div class="action-wrap">
                <button class="search-btn" type="submit" :disabled="isSearching">
                    {{ isSearching ? '搜索中' : '搜索' }}
                </button>
                <button class="service-btn" type="button" @click.stop="toggleServiceMenu">
                    {{ activeServiceLabel }}
                </button>

                <ul v-if="showServiceMenu" class="service-menu" @click.stop>
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

        <div class="toolbar-row">
            <div class="basemap-wrap">
                <span class="toolbar-label">底图</span>
                <select v-model="selectedBasemap" class="basemap-select">
                    <option v-for="option in orderedBasemapOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </option>
                </select>
            </div>

            <button
                class="icon-action layer-manage-btn"
                :class="{ active: showBasemapManager }"
                type="button"
                title="底图排序与显示"
                @click.stop="toggleBasemapManager"
            >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path d="M12 3L3 7.5L12 12L21 7.5L12 3Z" fill="currentColor"></path>
                    <path d="M3 12.5L12 17L21 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                    <path d="M3 16.5L12 21L21 16.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                </svg>
            </button>

            <button class="icon-action" type="button" title="图层管理" @click="openLayerPanel">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 6h16"></path>
                    <path d="M4 12h16"></path>
                    <path d="M4 18h16"></path>
                </svg>
            </button>

            <button
                class="icon-action"
                :class="{ active: mapStateStore.showDynamicGraticule }"
                type="button"
                title="经纬线"
                @click="mapStateStore.toggleDynamicGraticule()"
            >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 12h18"></path>
                    <path d="M12 3v18"></path>
                    <path d="M3 7h18"></path>
                    <path d="M3 17h18"></path>
                </svg>
            </button>
        </div>

        <div v-if="showBasemapManager" class="layer-manager-panel" @click.stop>
            <div class="layer-manager-head">
                <span>底图排序与显示</span>
                <button type="button" class="close-btn" @click="showBasemapManager = false">关闭</button>
            </div>

            <div class="layer-manager-list">
                <div
                    v-for="option in orderedBasemapOptions"
                    :key="option.value"
                    class="layer-item"
                    :class="{ active: selectedBasemap === option.value }"
                    draggable="true"
                    @dragstart="onBasemapDragStart(option.value)"
                    @dragover.prevent
                    @drop="onBasemapDrop(option.value)"
                >
                    <input
                        type="checkbox"
                        class="layer-checkbox"
                        :checked="option.visible"
                        @change="onBasemapVisibleChange(option.value, $event.target.checked)"
                    />
                    <span class="layer-item-name" @click="selectBasemap(option.value)">{{ option.label }}</span>
                    <span class="drag-handle" title="拖拽排序">::</span>
                </div>
            </div>
        </div>

        <div v-if="selectedBasemap === 'custom'" class="custom-url-wrapper">
            <input
                v-model.trim="customUrlDraft"
                class="custom-url-input"
                placeholder="输入 https://.../{z}/{x}/{y}.png"
            />
            <button class="custom-url-btn" @click="applyCustomUrl">应用</button>
        </div>

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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { fetchLocationResultsByService } from '../../api/locationSearch';
import { useMapStateStore } from '../../stores/mapStateStore';
import { useLayerStore } from '../../stores/layerStore';
import { useAppStore } from '../../stores/appStore';

const mapStateStore = useMapStateStore();
const layerStore = useLayerStore();
const appStore = useAppStore();

const BASEMAP_ORDER_KEY = 'webgis_basemap_order_v1';

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
const showBasemapManager = ref(false);
const basemapDragging = ref('');
const customUrlDraft = ref('');

const serviceOptions = [
    { value: 'tianditu', label: '天地图' },
    { value: 'nominatim', label: 'Nominatim' },
    { value: 'amap', label: '高德' }
];

const orderedBasemapOptions = computed(() => {
    return mapStateStore.basemaps.map((item) => ({
        value: item.id,
        label: item.label,
        visible: item.visible
    }));
});

watch(
    () => mapStateStore.basemaps,
    (nextStack) => {
        try {
            const ids = nextStack.map((item) => item.id);
            window.localStorage.setItem(BASEMAP_ORDER_KEY, JSON.stringify(ids));
        } catch {
            // ignore storage failures
        }
    },
    { deep: true }
);

watch(
    () => mapStateStore.customBasemapUrl,
    (nextUrl) => {
        customUrlDraft.value = String(nextUrl || '');
    },
    { immediate: true }
);

const selectedBasemap = computed({
    get: () => mapStateStore.basemap,
    set: (value) => mapStateStore.setBasemap(value)
});

const activeServiceLabel = computed(() => {
    const current = serviceOptions.find((item) => item.value === service.value);
    return current?.label || '服务';
});

const totalPages = computed(() => {
    const totalValue = Number(total.value || 0);
    return Math.max(1, Math.ceil(totalValue / pageSize));
});

function buildBasemapOrder(rawValues) {
    const allValues = mapStateStore.basemaps.map((item) => item.id);
    const ordered = [];

    rawValues.forEach((value) => {
        if (allValues.includes(value) && !ordered.includes(value)) {
            ordered.push(value);
        }
    });

    allValues.forEach((value) => {
        if (!ordered.includes(value)) {
            ordered.push(value);
        }
    });

    return ordered;
}

function readBasemapOrder() {
    if (typeof window === 'undefined') {
        return mapStateStore.basemaps.map((item) => item.id);
    }

    try {
        const raw = window.localStorage.getItem(BASEMAP_ORDER_KEY);
        if (!raw) {
            return mapStateStore.basemaps.map((item) => item.id);
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return mapStateStore.basemaps.map((item) => item.id);
        }

        return buildBasemapOrder(parsed.map((item) => String(item)));
    } catch {
        return mapStateStore.basemaps.map((item) => item.id);
    }
}

const persistedOrder = readBasemapOrder();
if (persistedOrder.length) {
    mapStateStore.setBasemapOrder(persistedOrder);
}

function openLayerPanel() {
    if (appStore.activePanel !== 'layer' || !appStore.isSideBarOpen) {
        appStore.togglePanel('layer');
    }
}

function toggleBasemapManager() {
    showBasemapManager.value = !showBasemapManager.value;
    if (showBasemapManager.value) {
        showServiceMenu.value = false;
    }
}

function selectBasemap(value) {
    mapStateStore.setBasemapVisible(value, true);
    selectedBasemap.value = value;
}

function onBasemapVisibleChange(value, checked) {
    mapStateStore.setBasemapVisible(value, checked);
}

function onBasemapDragStart(value) {
    basemapDragging.value = value;
}

function onBasemapDrop(targetValue) {
    const sourceValue = basemapDragging.value;
    basemapDragging.value = '';

    if (!sourceValue || sourceValue === targetValue) {
        return;
    }

    mapStateStore.reorderBasemaps(sourceValue, targetValue);
}

function applyCustomUrl() {
    const nextUrl = String(customUrlDraft.value || '').trim();
    if (!nextUrl) return;
    mapStateStore.setCustomBasemapUrl(nextUrl);
    mapStateStore.setBasemap('custom');
}

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
            tiandituTk: import.meta.env.VITE_TIANDITU_TK || '',
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
            sourceType: 'search',
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
    if (showServiceMenu.value) {
        showBasemapManager.value = false;
    }
}

function pickService(nextService) {
    service.value = nextService;
    showServiceMenu.value = false;
    if (String(keyword.value || '').trim()) {
        handleSearch(1);
    }
}

function handleOutsideClick(event) {
    if (rootRef.value?.contains(event.target)) return;
    showServiceMenu.value = false;
    showBasemapManager.value = false;
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
    position: relative;
    background: var(--glass-bg-strong, rgba(255, 255, 255, 0.88));
    border: 1px solid var(--glass-border, rgba(210, 250, 226, 0.3));
    border-radius: 10px;
    padding: 10px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(var(--glass-blur, 10px));
    -webkit-backdrop-filter: blur(var(--glass-blur, 10px));
    z-index: 10;
}

.search-form {
    display: flex;
    gap: 8px;
    align-items: center;
}

.keyword-input {
    flex: 1;
    min-width: 0;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 13px;
    background: #fff;
}

.action-wrap {
    position: relative;
    display: flex;
    gap: 6px;
}

.search-btn,
.service-btn,
.custom-url-btn,
.close-btn,
.page-btn {
    border: 1px solid rgba(0, 0, 0, 0.22);
    border-radius: 6px;
    background: #fff;
    color: #1a1a1a;
    cursor: pointer;
    font-size: 12px;
}

.search-btn,
.service-btn {
    padding: 7px 10px;
    font-weight: 600;
}

.search-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.toolbar-row {
    margin-top: 8px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 8px;
}

.basemap-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.toolbar-label {
    font-size: 12px;
    color: #374151;
    white-space: nowrap;
}

.basemap-select {
    width: 100%;
    min-width: 0;
    height: 30px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    background: #fff;
    font-size: 12px;
    color: #111827;
    padding: 4px 6px;
}

.icon-action {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.22);
    background: #fff;
    color: #374151;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.icon-action.active {
    background: color-mix(in srgb, var(--gis-primary-green-soft, #22c55e) 16%, white);
    border-color: color-mix(in srgb, var(--gis-primary-green, #166534) 68%, white);
    color: var(--gis-primary-green-strong, #14532d);
}

.layer-manage-btn {
    color: #1f2937;
}

.layer-manager-panel {
    position: absolute;
    right: 58px;
    top: 82px;
    width: 260px;
    max-height: 320px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.18);
    border-radius: 8px;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
    z-index: 1400;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.layer-manager-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    font-size: 12px;
    font-weight: 600;
    color: #1f2937;
}

.close-btn {
    padding: 4px 7px;
}

.layer-manager-list {
    padding: 8px;
    overflow-y: auto;
}

.layer-item {
    height: 32px;
    border-radius: 6px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    cursor: default;
}

.layer-item + .layer-item {
    margin-top: 4px;
}

.layer-item.active {
    background: rgba(79, 70, 229, 0.1);
}

.layer-item:hover {
    background: rgba(17, 24, 39, 0.06);
}

.layer-checkbox {
    margin: 0;
}

.layer-item-name {
    font-size: 12px;
    color: #111827;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

.drag-handle {
    font-size: 12px;
    color: #6b7280;
    user-select: none;
    cursor: grab;
}

.custom-url-wrapper {
    margin-top: 8px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
}

.custom-url-input {
    min-width: 0;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    padding: 7px 8px;
    font-size: 12px;
}

.custom-url-btn {
    padding: 6px 10px;
}

.service-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    list-style: none;
    margin: 0;
    padding: 6px;
    min-width: 140px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.16);
    border-radius: 8px;
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.2);
    z-index: 1300;
}

.service-menu li {
    padding: 6px 8px;
    font-size: 12px;
    color: #1f2937;
    border-radius: 6px;
    cursor: pointer;
}

.service-menu li:hover,
.service-menu li.active {
    background: rgba(79, 70, 229, 0.1);
}

.status {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.4;
    border-radius: 6px;
    padding: 6px 8px;
}

.status.loading {
    background: rgba(59, 130, 246, 0.12);
    color: #1e3a8a;
}

.status.empty {
    background: rgba(107, 114, 128, 0.12);
    color: #374151;
}

.status.success {
    background: rgba(16, 185, 129, 0.14);
    color: #065f46;
}

.result-list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    max-height: 208px;
    overflow: auto;
    border-radius: 8px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    background: #fff;
}

.result-list li {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    cursor: pointer;
}

.result-list li:last-child {
    border-bottom: none;
}

.result-list li:hover {
    background: rgba(79, 70, 229, 0.08);
}

.name {
    font-size: 13px;
    font-weight: 600;
    color: #111827;
}

.address {
    margin-top: 2px;
    font-size: 12px;
    color: #4b5563;
}

.pagination {
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
}

.page-btn {
    padding: 5px 8px;
}

.page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.page-text {
    font-size: 12px;
    color: #4b5563;
}

@media (max-width: 900px) {
    .search-form {
        display: grid;
        grid-template-columns: 1fr;
    }

    .action-wrap {
        justify-content: space-between;
    }

    .toolbar-row {
        grid-template-columns: 1fr auto auto auto;
    }

    .toolbar-label {
        display: none;
    }

    .layer-manager-panel {
        right: 10px;
        width: calc(100% - 20px);
    }
}
</style>
