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
    background: linear-gradient(145deg, rgba(248, 253, 250, 0.95), rgba(235, 247, 240, 0.88));
    border: 1px solid rgba(21, 94, 54, 0.18);
    border-radius: 10px;
    padding: 8px 12px;
    box-shadow: 0 12px 24px rgba(8, 35, 25, 0.2);
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    backdrop-filter: blur(8px);
}

.scale-title {
    color: #35614a;
    font-weight: 700;
}

.scale-value {
    color: #153a28;
    font-weight: 700;
}
</style>
