<template>
    <div class="scale-display">
        <span class="scale-title">比例尺</span>
        <span class="scale-value">1 : {{ formattedScale }}</span>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useMapStateStore } from '../../stores/mapStateStore';

const mapStateStore = useMapStateStore();

const formattedScale = computed(() => {
    const zoom = Number(mapStateStore.zoom);
    if (!Number.isFinite(zoom)) return 'N/A';

    const rawScale = 591657550.5 / Math.pow(2, zoom);
    const rounded = Math.max(1, Math.round(rawScale));
    return rounded.toLocaleString('zh-CN');
});
</script>

<style scoped>
.scale-display {
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(31, 41, 55, 0.12);
    border-radius: 10px;
    padding: 8px 12px;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
}

.scale-title {
    color: #6b7280;
    font-weight: 700;
}

.scale-value {
    color: #111827;
    font-weight: 700;
}
</style>
