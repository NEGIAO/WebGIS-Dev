<template>
    <div class="map-ui-card basemap-picker">
        <label class="picker-label" for="basemap-picker-select">底图</label>
        <select id="basemap-picker-select" v-model="selectedBasemap" class="picker-select">
            <option v-for="option in options" :key="option.value" :value="option.value">
                {{ option.label }}
            </option>
        </select>

        <div v-if="selectedBasemap === 'custom'" class="custom-url-wrapper">
            <input
                v-model.trim="customUrlDraft"
                class="custom-url-input"
                placeholder="输入 https://.../{z}/{x}/{y}.png"
            />
            <button class="custom-url-btn" @click="applyCustomUrl">ok</button>
        </div>

        <div class="quick-actions">
            <button
                class="quick-btn"
                :class="{ active: mapStateStore.showDynamicGraticule }"
                @click="mapStateStore.toggleDynamicGraticule()"
            >
                经纬线
            </button>
            <button class="quick-btn" @click="openLayerPanel">
                图层管理
            </button>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useMapStateStore } from '../../stores/mapStateStore';
import { useAppStore } from '../../stores/appStore';

const mapStateStore = useMapStateStore();
const appStore = useAppStore();

const options = [
    { value: 'google', label: 'Google 影像' },
    { value: 'google_standard', label: 'Google 标准' },
    { value: 'google_clean', label: 'Google 简洁' },
    { value: 'tianDiTu', label: '天地图影像' },
    { value: 'tianDiTu_vec', label: '天地图矢量' },
    { value: 'esri', label: 'ESRI 影像' },
    { value: 'esri_ocean', label: 'ESRI 海洋' },
    { value: 'esri_terrain', label: 'ESRI 地形' },
    { value: 'esri_physical', label: 'ESRI 自然地理' },
    { value: 'esri_hillshade', label: 'ESRI 阴影' },
    { value: 'esri_gray', label: 'ESRI 浅灰' },
    { value: 'osm', label: 'OpenStreetMap' },
    { value: 'amap', label: '高德地图' },
    { value: 'tengxun', label: '腾讯矢量' },
    { value: 'gggis_time', label: '影像时相' },
    { value: 'yandex_sat', label: 'Yandex 影像' },
    { value: 'geoq_gray', label: 'GeoQ 灰色' },
    { value: 'geoq_hydro', label: 'GeoQ 水系' },
    { value: 'custom', label: '自定义 URL' },
    { value: 'local', label: '本地瓦片' }
];

const customUrlDraft = ref('');

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

function openLayerPanel() {
    if (appStore.activePanel !== 'layer' || !appStore.isSideBarOpen) {
        appStore.togglePanel('layer');
    }
}

function applyCustomUrl() {
    const nextUrl = String(customUrlDraft.value || '').trim();
    if (!nextUrl) return;
    mapStateStore.setCustomBasemapUrl(nextUrl);
    mapStateStore.setBasemap('custom');
}
</script>

<style scoped>
.map-ui-card {
    background: linear-gradient(145deg, rgba(248, 253, 250, 0.95), rgba(235, 247, 240, 0.9));
    border: 1px solid rgba(21, 94, 54, 0.18);
    border-radius: 12px;
    padding: 10px;
    box-shadow: 0 12px 24px rgba(8, 35, 25, 0.2);
    backdrop-filter: blur(8px);
}

.picker-label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #24523a;
    margin-bottom: 6px;
}

.picker-select {
    width: 100%;
    border: 1px solid rgba(22, 101, 52, 0.22);
    border-radius: 8px;
    padding: 8px;
    font-size: 13px;
    color: #153a28;
    background: rgba(255, 255, 255, 0.95);
}

.quick-actions {
    margin-top: 8px;
    display: flex;
    gap: 6px;
}

.quick-btn {
    border: 1px solid rgba(21, 94, 54, 0.26);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12px;
    color: #19412d;
    background: rgba(255, 255, 255, 0.96);
    cursor: pointer;
}

.quick-btn:hover {
    background: rgba(226, 247, 235, 0.9);
}

.quick-btn.active {
    background: #f6fff8;
    color: #1e6f34;
    border-color: #8ecf9f;
    font-weight: 700;
}

.custom-url-wrapper {
    margin-top: 8px;
    display: flex;
    gap: 6px;
}

.custom-url-input {
    flex: 1;
    min-width: 0;
    border: 1px solid rgba(22, 101, 52, 0.22);
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    color: #153a28;
    background: rgba(255, 255, 255, 0.95);
}

.custom-url-btn {
    border: 1px solid rgba(17, 79, 43, 0.2);
    border-radius: 8px;
    padding: 6px 9px;
    font-size: 12px;
    color: #f0fdf4;
    background: linear-gradient(145deg, #1f7a46, #155a34);
    cursor: pointer;
}
</style>
