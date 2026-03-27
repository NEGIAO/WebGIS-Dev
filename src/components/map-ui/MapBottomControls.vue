<template>
    <div class="map-controls-group">
        <div class="mouse-position-content">{{ pointerText }}</div>
        <div class="zoom-level-display">{{ zoomText }}</div>
        <div class="divider"></div>
        <button class="home-btn" @click="handleHomeInteract" title="单击复位 / 双击定位">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
        </button>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { useMapStateStore } from '../../stores/mapStateStore';

const mapStateStore = useMapStateStore();
const clickTimer = ref(null);

const pointerText = computed(() => {
    const coord = mapStateStore.pointerCoord;
    if (!Array.isArray(coord) || coord.length < 2) {
        return 'Lon ---, Lat ---';
    }

    return `Lon ${Number(coord[0]).toFixed(4)}, Lat ${Number(coord[1]).toFixed(4)}`;
});

const zoomText = computed(() => {
    const value = Number(mapStateStore.zoom);
    if (!Number.isFinite(value)) return '--';
    return Math.round(value).toString();
});

function handleHomeInteract() {
    if (clickTimer.value) {
        clearTimeout(clickTimer.value);
        clickTimer.value = null;
        mapStateStore.requestLocateUser();
        return;
    }

    clickTimer.value = setTimeout(() => {
        mapStateStore.requestResetView();
        clickTimer.value = null;
    }, 300);
}

onBeforeUnmount(() => {
    if (!clickTimer.value) return;
    clearTimeout(clickTimer.value);
    clickTimer.value = null;
});
</script>

<style scoped>
.map-controls-group {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
    background: linear-gradient(145deg, rgba(13, 77, 44, 0.88), rgba(34, 122, 69, 0.78));
    backdrop-filter: blur(8px);
    color: #f3fff6;
    padding: 6px 12px;
    border-radius: 22px;
    border: 1px solid rgba(187, 247, 208, 0.28);
    box-shadow: 0 10px 24px rgba(5, 30, 20, 0.32);
}

.mouse-position-content {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 14px;
    min-width: 180px;
    text-align: center;
}

.zoom-level-display {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.16);
    padding: 2px 10px;
    border-radius: 12px;
    min-width: 24px;
    text-align: center;
}

.divider {
    width: 1px;
    height: 18px;
    background-color: rgba(255, 255, 255, 0.42);
    flex-shrink: 0;
}

.home-btn {
    background: transparent;
    border: none;
    color: #ffffff;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 0.2s ease, transform 0.2s ease;
    flex-shrink: 0;
}

.home-btn:hover {
    background-color: rgba(255, 255, 255, 0.22);
    transform: scale(1.08);
}

.home-btn:active {
    transform: scale(0.95);
}

@media (max-width: 900px) {
    .mouse-position-content {
        min-width: 136px;
        font-size: 12px;
    }

    .map-controls-group {
        gap: 8px;
        padding: 6px 10px;
    }
}
</style>
