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

    <section
        v-if="cesiumReady"
        class="fps-chart-panel"
        aria-label="实时帧率折线图"
    >
        <div class="fps-chart-head">
            <span>FPS</span>
            <strong>{{ frameRateDisplay }}</strong>
        </div>
        <svg
            class="fps-chart"
            viewBox="0 0 160 48"
            preserveAspectRatio="none"
            aria-hidden="true"
        >
            <line
                class="fps-grid-line"
                x1="0"
                y1="12"
                x2="160"
                y2="12"
            />
            <line
                class="fps-grid-line"
                x1="0"
                y1="24"
                x2="160"
                y2="24"
            />
            <line
                class="fps-grid-line"
                x1="0"
                y1="36"
                x2="160"
                y2="36"
            />
            <polyline
                v-if="frameRateLinePoints"
                class="fps-line"
                :points="frameRateLinePoints"
            />
        </svg>
    </section>

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
import { useCesiumFrameRate } from './composables/useCesiumFrameRate';
import { useCesiumInteractions } from './composables/useCesiumInteractions';
import { useCesiumLayers } from './composables/useCesiumLayers';
import { useCesiumSceneActions } from './composables/useCesiumSceneActions';
import { useCesiumToolModules } from './composables/useCesiumToolModules';
import { useCesiumUrlTracking } from './composables/useCesiumUrlTracking';
import { useCesiumWind } from './composables/useCesiumWind';
import {
    getRuntimeMapTokensSync,
    loadRuntimeMapTokens,
    markRuntimeMapTokenFailed,
} from '../../services/runtimeMapTokens';

let Cesium = null;
let viewer = null;
let componentUnmounted = false;

const message = useMessage();
const emit = defineEmits(['view-sync']);
const cesiumReady = ref(false);
const fluidPanelRef = ref(null);
const runtimeMapTokens = ref(getRuntimeMapTokensSync());

const getViewer = () => viewer;
const getCesium = () => Cesium || window.Cesium;
const getTiandituToken = () => runtimeMapTokens.value.tiandituTk;
const getCesiumIonToken = () => runtimeMapTokens.value.cesiumIonToken;

const layers = useCesiumLayers({
    getViewer,
    getCesium,
    message,
    backendBaseUrl: BACKEND_BASE_URL,
    tiandituToken: getTiandituToken,
    cesiumIonToken: getCesiumIonToken,
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
const {
    frameRateDisplay,
    frameRateLinePoints,
    setupFrameRateMonitor,
    cleanupFrameRateMonitor,
} = useCesiumFrameRate({ getViewer });

const { installCreditHider, cleanupCreditHider } = useCesiumCreditHider({ getViewer });
const {
    restoreCameraFromUrl,
    bindCameraViewSync,
    cleanupCameraViewSync,
} = useCesiumUrlTracking({
    getViewer,
    getCesium,
    onCameraViewSync: (payload) => emit('view-sync', payload),
});
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
    componentUnmounted = false;
    showLoading('正在初始化 3D 场景...');
    try {
        let retryCount = 0;
        let maxRetryCount = 1;
        while (retryCount < maxRetryCount) {
            try {
                runtimeMapTokens.value = await loadRuntimeMapTokens({
                    silent: false,
                    force: retryCount > 0,
                });
                maxRetryCount = Math.max(
                    maxRetryCount,
                    Array.isArray(runtimeMapTokens.value.tiandituTokens)
                        ? runtimeMapTokens.value.tiandituTokens.length
                        : 1,
                    Array.isArray(runtimeMapTokens.value.cesiumIonTokens)
                        ? runtimeMapTokens.value.cesiumIonTokens.length
                        : 1,
                    1,
                );
                Cesium = await loadCesiumRuntime({ ionToken: getCesiumIonToken() });
                if (componentUnmounted || !Cesium || !document.getElementById('cesiumContainer')) return;

                initViewer();
                setupInteractions();
                setupFrameRateMonitor();

                const basemapReady = addBaseImageryLayers();
                const terrainReady = await initCustomTerrain();
                if (componentUnmounted) {
                    resetCesiumViewerForRetry();
                    return;
                }
                cesiumReady.value = true;
                bindCameraViewSync({ initialSync: false });
                if (basemapReady && terrainReady) {
                    message.success('天地图基础影像与地形加载成功。');
                    return;
                }

                const switchedTianditu = !basemapReady
                    ? markRuntimeMapTokenFailed('tianditu_tk')
                    : { switched: false };
                const switchedCesium = !terrainReady
                    ? markRuntimeMapTokenFailed('cesium_ion_token')
                    : { switched: false };
                const switched = switchedTianditu.switched || switchedCesium.switched;
                if (!switched) {
                    message.error('默认地图源或地形加载失败，请检查 token 或网络。', { closable: true });
                    return;
                }

                runtimeMapTokens.value = switchedCesium.switched
                    ? switchedCesium.tokens
                    : switchedTianditu.tokens;
                resetCesiumViewerForRetry();
                retryCount += 1;
                message.warning('主 token 初始化失败，正在尝试备用 token。', { closable: true });
            } catch (error) {
                const switchedCesium = markRuntimeMapTokenFailed('cesium_ion_token');
                if (!switchedCesium.switched) throw error;
                runtimeMapTokens.value = switchedCesium.tokens;
                resetCesiumViewerForRetry();
                retryCount += 1;
                message.warning('Cesium ion token 失败，正在尝试备用 token。', { closable: true });
            }
        }
        message.error('备用 token 已全部尝试，Cesium 初始化仍失败。', { closable: true });
        // 风场在初始化完毕后即可准备加载（但需要手动点击按钮或自动加载）
        // 这里不自动加载，避免占满视野，等待用户点击“加载模拟风场”
    } catch (error) {
        message.error('Cesium 运行时加载失败', error);
        message.error('Cesium 初始化失败，请检查网络环境。', { closable: true });
    } finally {
        hideLoading();
    }
}

function resetCesiumViewerForRetry() {
    cesiumReady.value = false;
    cleanupCameraViewSync();
    cleanupInteractions();
    cleanupFrameRateMonitor();
    cleanupLayers();
    cleanupCreditHider();
    if (!viewer) return;
    try {
        viewer.destroy();
    } catch (error) {
        console.warn('Cesium viewer retry cleanup warning:', error);
    }
    viewer = null;
}

function initViewer() {
    const mapCtor = typeof Cesium.Map === 'function' ? Cesium.Map : Cesium.Viewer;
    const imageryProviderViewModels = createImageryProviderViewModels();
    const terrainProviderViewModels = createTerrainProviderViewModels();
    viewer = new mapCtor('cesiumContainer', {
        baseLayerPicker: true,
        geocoder: Cesium.IonGeocodeProviderType?.GOOGLE || true,
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
    if (!restoreCameraFromUrl({ duration: 0 })) {
        flyToHome(0);
    }
}

onMounted(() => {
    bootCesium();
});

onUnmounted(() => {
    componentUnmounted = true;
    cesiumReady.value = false;
    cleanupCameraViewSync();
    cleanupInteractions();
    cleanupFrameRateMonitor();
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

.fps-chart-panel {
    position: absolute;
    top: 58px;
    right: 12px;
    z-index: 1150;
    width: 188px;
    border: 1px solid rgba(155, 216, 255, 0.26);
    border-radius: 8px;
    padding: 9px 10px 10px;
    background: rgba(8, 25, 36, 0.86);
    color: #eefbf3;
    box-shadow: 0 14px 34px rgba(0, 7, 14, 0.32);
    backdrop-filter: blur(14px);
    pointer-events: none;
}

.fps-chart-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 7px;
}

.fps-chart-head span {
    color: rgba(220, 243, 255, 0.66);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0;
}

.fps-chart-head strong {
    color: #a7f3d0;
    font-size: 20px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
}

.fps-chart {
    display: block;
    width: 100%;
    height: 48px;
    overflow: visible;
}

.fps-grid-line {
    stroke: rgba(155, 216, 255, 0.16);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
}

.fps-line {
    fill: none;
    stroke: #5eead4;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 4px rgba(94, 234, 212, 0.45));
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

    .fps-chart-panel {
        top: 104px;
        right: 10px;
        width: 164px;
    }

}

.mouse-position-content {
    font-size: 14px;
    font-weight: bold;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
}

.mouse-position-content {
    min-width: 120px;
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
