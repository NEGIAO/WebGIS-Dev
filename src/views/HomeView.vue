<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';

import TopBar from '../components/TopBar.vue';
import SidePanel from '../components/SidePanel.vue';
import MapContainer from '../components/MapContainer.vue';
import CesiumContainer from '../components/CesiumContainer.vue';
import MagicCursor from '../components/MagicCursor.vue';
import BasemapPicker from '../components/map-ui/BasemapPicker.vue';
import CoordinateBar from '../components/map-ui/CoordinateBar.vue';
import MapSearchBox from '../components/map-ui/MapSearchBox.vue';
import ScaleDisplay from '../components/map-ui/ScaleDisplay.vue';

import { useUrlSync } from '../composables/useUrlSync';
import { useAppStore } from '../stores/appStore';
import { useMapStateStore } from '../stores/mapStateStore';

const appStore = useAppStore();
const mapStateStore = useMapStateStore();
const { isSideBarOpen } = storeToRefs(appStore);

useUrlSync();
const Map2DContainer = MapContainer;
const is3DMode = computed(() => mapStateStore.viewMode === '3D');
const isMagicMode = ref(false);

const sidePanelClass = computed(() => ({
    collapsed: !isSideBarOpen.value
}));

function updateMobileState() {
    appStore.isMobile = window.innerWidth <= 900;
}

async function toggle3D() {
    mapStateStore.setViewMode(is3DMode.value ? '2D' : '3D');
}

function toggleMagic() {
    isMagicMode.value = !isMagicMode.value;
}

onMounted(() => {
    updateMobileState();
    window.addEventListener('resize', updateMobileState);
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', updateMobileState);
});
</script>

<template>
    <div class="home-container">
        <MagicCursor :active="isMagicMode" />

        <div class="top-section">
            <TopBar @toggle-magic="toggleMagic" @toggle-3d="toggle3D" />
        </div>

        <div class="content-section">
            <div class="map-wrapper">
                <Map2DContainer v-if="mapStateStore.viewMode === '2D'" />
                <CesiumContainer v-else />

                <div v-if="mapStateStore.viewMode === '2D'" class="map-ui-overlay">
                    <div class="search-slot">
                        <MapSearchBox />
                    </div>
                    <div class="basemap-slot">
                        <BasemapPicker />
                    </div>
                    <div class="scale-slot">
                        <ScaleDisplay />
                    </div>
                    <div class="coord-slot">
                        <CoordinateBar />
                    </div>
                </div>
            </div>

            <div class="side-panel-wrapper" :class="sidePanelClass">
                <SidePanel />
            </div>
        </div>
    </div>
</template>

<style scoped>
.home-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: linear-gradient(165deg, #0f3b2e 0%, #125f49 45%, #1f7a46 100%);
}

.top-section {
    height: 60px;
    flex-shrink: 0;
    width: 100%;
    z-index: 50;
}

.content-section {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 10px;
    padding: 10px;
    box-sizing: border-box;
}

.map-wrapper {
    flex: 1;
    min-width: 0;
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: #dbeafe;
}

.map-ui-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1100;
}

.map-ui-overlay > div {
    position: absolute;
    pointer-events: auto;
}

.search-slot {
    left: 14px;
    top: 14px;
    width: min(460px, calc(100% - 28px));
}

.basemap-slot {
    right: 14px;
    top: 14px;
    width: 220px;
}

.scale-slot {
    right: 14px;
    bottom: 58px;
}

.coord-slot {
    left: 14px;
    bottom: 14px;
}

.side-panel-wrapper {
    width: 360px;
    flex-shrink: 0;
    transition: width 0.22s ease;
}

.side-panel-wrapper.collapsed {
    width: 0;
    overflow: hidden;
}

.cesium-loading {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    color: #fff;
    font-size: 16px;
    font-weight: 600;
}

@media (max-width: 900px) {
    .content-section {
        flex-direction: column;
        gap: 8px;
        padding: 8px;
    }

    .side-panel-wrapper {
        width: 100%;
        max-height: 50vh;
    }

    .side-panel-wrapper.collapsed {
        width: 100%;
        max-height: 0;
    }

    .basemap-slot {
        width: 180px;
    }

    .coord-slot {
        left: 10px;
        right: 10px;
    }
}
</style>
