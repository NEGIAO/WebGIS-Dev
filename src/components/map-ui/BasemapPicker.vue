<template>
    <div class="map-ui-card basemap-picker">
        <label class="picker-label" for="basemap-picker-select">底图</label>
        <select id="basemap-picker-select" v-model="selectedBasemap" class="picker-select">
            <option v-for="option in options" :key="option.value" :value="option.value">
                {{ option.label }}
            </option>
        </select>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useMapStateStore } from '../../stores/mapStateStore';

const mapStateStore = useMapStateStore();

const options = [
    { value: 'google', label: 'Google 影像' },
    { value: 'tianDiTu', label: '天地图影像' },
    { value: 'tianDiTu_vec', label: '天地图矢量' },
    { value: 'esri', label: 'ESRI 影像' },
    { value: 'osm', label: 'OpenStreetMap' },
    { value: 'amap', label: '高德地图' },
    { value: 'local', label: '本地瓦片' }
];

const selectedBasemap = computed({
    get: () => mapStateStore.basemap,
    set: (value) => mapStateStore.setBasemap(value)
});
</script>

<style scoped>
.map-ui-card {
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(31, 41, 55, 0.12);
    border-radius: 12px;
    padding: 10px;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
    backdrop-filter: blur(8px);
}

.picker-label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 6px;
}

.picker-select {
    width: 100%;
    border: 1px solid rgba(55, 65, 81, 0.22);
    border-radius: 8px;
    padding: 8px;
    font-size: 13px;
    color: #111827;
    background: #ffffff;
}
</style>
