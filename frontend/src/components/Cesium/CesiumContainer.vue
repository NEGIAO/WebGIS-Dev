<template>
    <div
        id="cesiumContainer"
        class="cesium-container"
    ></div>

    <component
        :is="CesiumAdvancedEffects"
        v-if="cesiumReady"
        headless
        :get-viewer="getViewer"
        :get-cesium="getCesium"
        :controls="advancedEffectControls"
    />

    <component
        :is="FluidSimulationPanel"
        v-if="cesiumReady"
        ref="fluidPanelRef"
        headless
        :get-viewer="getViewer"
        :get-cesium="getCesium"
        :params="fluidParams"
        @state-change="handleFluidStateChange"
    />

    <CesiumToolPanel
        v-if="cesiumReady"
        v-model:open="cesiumToolPanelOpen"
        v-model:active-basemap="activeBasemap"
        v-model:active-terrain="activeTerrain"
        :basemap-options="basemapOptions"
        :terrain-options="terrainOptions"
        :overlay-options="overlayOptions"
        :custom-basemap-url="customXyzBasemapUrl"
        :modules="toolModules"
        @module-action="handleToolAction"
        @control-change="handleToolControlChange"
        @overlay-toggle="handleOverlayToggle"
        @custom-basemap-submit="handleCustomBasemapSubmit"
    />

    <!-- 坐标显示面板 -->
    <div class="map-controls-group">
        <div class="mouse-position-content">{{ coordinateDisplay }}</div>
        <div class="divider"></div>
        <button
            class="home-btn"
            title="回到初始位置"
            @click="flyToHome"
        >
            <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
            >
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
        </button>
    </div>

</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { BACKEND_BASE_URL } from '../../api/backend';
import { useMessage } from '../../composables/useMessage';
import { showLoading, hideLoading } from '../../utils/ui/loading';
import CesiumAdvancedEffects from './CesiumAdvancedEffects.vue';
import CesiumToolPanel from './CesiumToolPanel.vue';
import FluidSimulationPanel from './FluidSimulation/FluidSimulationPanel.vue';
import { configureSolarLighting } from './composables/cesiumAtmosphere';
import { loadCesiumRuntime } from './composables/cesiumRuntime';
import { configureBeijingTimeSystem } from './composables/cesiumTimeSystem';
import { useCesiumCreditHider } from './composables/useCesiumCreditHider';
import { useCesiumInteractions } from './composables/useCesiumInteractions';
import { useCesiumLayers } from './composables/useCesiumLayers';
import { useCesiumSceneActions } from './composables/useCesiumSceneActions';
import { useCesiumToolModules } from './composables/useCesiumToolModules';
import { useCesiumWind } from './composables/useCesiumWind';

let Cesium = null;
let viewer = null;

const TDT_TOKEN = import.meta.env.VITE_TIANDITU_TK;
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;

const message = useMessage();
const cesiumReady = ref(false);
const fluidPanelRef = ref(null);

const getViewer = () => viewer;
const getCesium = () => Cesium || window.Cesium;

const layers = useCesiumLayers({
    getViewer,
    getCesium,
    message,
    backendBaseUrl: BACKEND_BASE_URL,
    tiandituToken: TDT_TOKEN,
    cesiumIonToken: CESIUM_ION_TOKEN,
});

const {
    activeBasemap,
    activeTerrain,
    customXyzBasemapUrl,
    basemapOptions,
    terrainOptions,
    overlayOptions,
    createImageryProviderViewModels,
    createTerrainProviderViewModels,
    getSelectedImageryProviderViewModel,
    getSelectedTerrainProviderViewModel,
    bindLayerPickerStateSync,
    addBaseImageryLayers,
    initCustomTerrain,
    handleOverlayToggle,
    handleCustomBasemapSubmit,
    cleanupLayers,
} = layers;

const { coordinateDisplay, setupInteractions, cleanupInteractions } = useCesiumInteractions({
    getViewer,
    getCesium,
});

const { installCreditHider, cleanupCreditHider } = useCesiumCreditHider({ getViewer });
const sceneActions = useCesiumSceneActions({
    getViewer,
    getCesium,
    message,
});
const { flyToHome } = sceneActions;

const wind = useCesiumWind({
    getViewer,
    getCesium,
    message,
});

const {
    toolPanelOpen: cesiumToolPanelOpen,
    advancedEffectControls,
    fluidParams,
    toolModules,
    handleToolAction,
    handleToolControlChange,
    handleFluidStateChange,
    cleanupTools,
} = useCesiumToolModules({
    fluidPanelRef,
    sceneActions,
    wind,
});

async function bootCesium() {
    showLoading('正在初始化 3D 场景...');
    try {
        Cesium = await loadCesiumRuntime({ ionToken: CESIUM_ION_TOKEN });
        if (!Cesium || !document.getElementById('cesiumContainer')) return;

        initViewer();
        setupInteractions();

        const basemapReady = addBaseImageryLayers();
        const terrainReady = await initCustomTerrain();
        cesiumReady.value = true;
        if (basemapReady && terrainReady) {
            message.success('天地图基础影像与地形加载成功。');
        } else {
            message.error('默认地图源或地形加载失败，请检查 token 或网络。', { closable: true });
        }
        // 风场在初始化完毕后即可准备加载（但需要手动点击按钮或自动加载）
        // 这里不自动加载，避免占满视野，等待用户点击“加载模拟风场”
    } catch (error) {
        message.error('Cesium 运行时加载失败', error);
        message.error('Cesium 初始化失败，请检查网络环境。', { closable: true });
    } finally {
        hideLoading();
    }
}

function initViewer() {
    const mapCtor = typeof Cesium.Map === 'function' ? Cesium.Map : Cesium.Viewer;
    const imageryProviderViewModels = createImageryProviderViewModels();
    const terrainProviderViewModels = createTerrainProviderViewModels();
    viewer = new mapCtor('cesiumContainer', {
        baseLayerPicker: true,
        geocoder: true,
        homeButton: true,
        infoBox: true,
        selectionIndicator: true,
        timeline: true,
        animation: true,
        sceneModePicker: true,
        navigationHelpButton: false,
        imageryProviderViewModels,
        selectedImageryProviderViewModel: getSelectedImageryProviderViewModel(imageryProviderViewModels),
        terrainProviderViewModels,
        selectedTerrainProviderViewModel: getSelectedTerrainProviderViewModel(terrainProviderViewModels),
        shouldAnimate: true,
    });
    viewer.scene.globe.terrainExaggeration = 1;
    viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0;
    configureBeijingTimeSystem(viewer, Cesium);
    configureSolarLighting(viewer);
    installCreditHider();
    bindLayerPickerStateSync();
    flyToHome(0);
}

onMounted(() => {
    bootCesium();
});

onUnmounted(() => {
    cesiumReady.value = false;
    cleanupInteractions();
    cleanupTools();
    cleanupLayers();
    cleanupCreditHider();
    if (viewer) {
        try {
            viewer.destroy();
        } catch (e) {
            console.warn('Cesium viewer destroy warning:', e);
        }
        viewer = null;
    }
});
</script>

<style scoped>
.cesium-container {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
}

.map-controls-group {
    position: absolute;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(to right, rgba(10, 121, 51, 0.9), rgba(8, 96, 41, 0.9));
    color: white;
    padding: 5px 10px;
    border-radius: 6px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
}

/* 平板适配 */
@media (max-width: 1024px) {
    .map-controls-group {
        width: 85%;
    }
}

@media (max-width: 768px) {
    .map-controls-group {
        width: 90%;
        justify-content: center;
        bottom: 58px;
    }

    .mouse-position-content {
        font-size: 12px;
        min-width: auto;
    }

}

.mouse-position-content {
    font-size: 14px;
    font-weight: bold;
    min-width: 120px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
}

.divider {
    width: 1px;
    height: 20px;
    background-color: rgba(255, 255, 255, 0.4);
}

.home-btn {
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.home-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
}

:global(.cesium-viewer-toolbar),
:global(.cesium-baseLayerPicker-dropDown),
:global(.cesium-geocoder-searchButton),
:global(.cesium-geocoder-searchButton:hover) {
    z-index: 1400;
}

:global(.cesium-viewer-toolbar) {
    top: 12px !important;
    right: 12px !important;
}

:global(.cesium-baseLayerPicker-dropDown) {
    top: calc(100% + 4px);
    max-height: calc(100vh - 82px);
    overflow-y: auto;
}

:global(.cesium-geocoder .search-results) {
    z-index: 1401;
}
</style>
