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
    background: linear-gradient(145deg, rgba(12, 44, 31, 0.82), rgba(20, 77, 52, 0.76));
    border: 1px solid rgba(187, 247, 208, 0.26);
    color: #eefcf3;
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 12px;
    box-shadow: 0 10px 24px rgba(5, 30, 20, 0.3);
    backdrop-filter: blur(8px);
}

.coord-item {
    white-space: nowrap;
}

.coord-divider {
    color: rgba(220, 252, 231, 0.7);
}
</style>
