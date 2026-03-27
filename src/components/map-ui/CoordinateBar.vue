<template>
    <div class="coordinate-bar">
        <span class="coord-item">经度 {{ lonText }}</span>
        <span class="coord-divider">|</span>
        <span class="coord-item">纬度 {{ latText }}</span>
        <span class="coord-divider">|</span>
        <span class="coord-item">缩放 {{ zoomText }}</span>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useMapStateStore } from '../../stores/mapStateStore';

const mapStateStore = useMapStateStore();

const lonText = computed(() => Number(mapStateStore.center?.[0] ?? 0).toFixed(6));
const latText = computed(() => Number(mapStateStore.center?.[1] ?? 0).toFixed(6));
const zoomText = computed(() => Number(mapStateStore.zoom ?? 0).toFixed(2));
</script>

<style scoped>
.coordinate-bar {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(17, 24, 39, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #f9fafb;
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 12px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24);
}

.coord-item {
    white-space: nowrap;
}

.coord-divider {
    color: rgba(249, 250, 251, 0.65);
}
</style>
