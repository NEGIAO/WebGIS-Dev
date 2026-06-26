<template>
    <div
        id="cesiumContainer"
        class="cesium-container"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
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

    <ShallowWaterOverlay
        v-if="cesiumReady"
        :visible="shallowWaterVisible"
        v-bind="shallowWaterParams"
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
        :loaded-data-sources="loadedDataSourcesForPanel"
        @module-action="handleToolAction"
        @control-change="handleToolControlChange"
        @overlay-toggle="handleOverlayToggle"
        @custom-basemap-submit="handleCustomBasemapSubmit"
        @data-import="handleDataImport"
        @data-remove="handleDataRemove"
        @data-clear-all="handleDataClearAll"
    />

    <!-- GLTF/GLB 坐标输入弹窗 -->
    <CesiumDataImportDialog
        :visible="!!pendingGltfFile"
        :file-name="pendingGltfFile?.name || ''"
        @confirm="handleGltfCoordConfirm"
        @cancel="handleGltfCoordCancel"
    />

    <!-- 拖拽上传提示覆盖层 -->
    <div
        v-if="isDragOver && cesiumReady"
        class="drag-overlay"
    >
        <Upload
            :size="48"
            stroke-width="1.5"
        />
        <span class="drag-overlay-text">释放文件以导入到 3D 场景</span>
        <span class="drag-overlay-hint">GeoJSON / KML / SHP / GLB / CZML</span>
    </div>

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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { BACKEND_BASE_URL } from '../../api/backend';
import { useMessage } from '../../composables/useMessage';
import { showLoading, hideLoading } from '../../utils/ui/loading';
import { Upload } from 'lucide-vue-next';
import CesiumAdvancedEffects from './CesiumAdvancedEffects.vue';
import CesiumToolPanel from './CesiumToolPanel.vue';
import CesiumDataImportDialog from './CesiumDataImportDialog.vue';
import FluidSimulationPanel from './FluidSimulation/FluidSimulationPanel.vue';
import ShallowWaterOverlay from './ShallowWater/ShallowWaterOverlay.vue';
import { configureSolarLighting } from './composables/cesiumAtmosphere';
import { loadCesiumRuntime } from './composables/cesiumRuntime';
import { configureBeijingTimeSystem } from './composables/cesiumTimeSystem';
import { useCesiumCreditHider } from './composables/useCesiumCreditHider';
import { useCesiumInteractions } from './composables/useCesiumInteractions';
import { useCesiumLayers } from './composables/useCesiumLayers';
import { useCesiumSceneActions } from './composables/useCesiumSceneActions';
import { useCesiumDataImport } from './composables/useCesiumDataImport';
import { useCesiumToolModules } from './composables/useCesiumToolModules';
import { useCesiumUrlTracking } from './composables/useCesiumUrlTracking';
import { useCesiumWind } from './composables/useCesiumWind';
import { useCesiumModelManager } from './composables/useCesiumModelManager';
import { useCesiumCameraEnhanced } from './composables/useCesiumCameraEnhanced';
import { useCesiumHeightSampler } from './composables/useCesiumHeightSampler';
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

// 监听 activeBasemap 变化兜底：CesiumToolPanel 等其它入口也能触发 URL 同步
watch(activeBasemap, (next, prev) => {
    if (!next || next === prev) return;
    syncBasemapToUrl(next);
});

const { coordinateDisplay, setupInteractions, cleanupInteractions } = useCesiumInteractions({
    getViewer,
    getCesium,
});

const { installCreditHider, cleanupCreditHider } = useCesiumCreditHider({ getViewer });
const {
    restoreCameraFromUrl,
    restoreBasemapFromUrl,
    syncBasemapToUrl,
    bindCameraViewSync,
    cleanupCameraViewSync,
} = useCesiumUrlTracking({
    getViewer,
    getCesium,
    onCameraViewSync: (payload) => emit('view-sync', payload),
    onBasemapRestore: (presetId) => {
        if (presetId && activeBasemap.value !== presetId) {
            activeBasemap.value = presetId;
        }
    },
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

const dataImport = useCesiumDataImport({
    getViewer,
    getCesium,
    message,
});

// ==========================================
// tellux 移植模块：模型管理、相机增强、高度采样
// ==========================================
const modelManager = useCesiumModelManager({ getViewer, getCesium, message });
const cameraEnhanced = useCesiumCameraEnhanced({ getViewer, getCesium });
const heightSampler = useCesiumHeightSampler({ getViewer, getCesium });

/** 暴露给子组件和外部调用 */
defineExpose({
    getViewer,
    getCesium,
    modelManager,
    cameraEnhanced,
    heightSampler,
});

/**
 * 响应式转发：使用 computed 包装 loadedDataSources，
 * 避免在模板里写 dataImport.loadedDataSources.value（解包时不会响应化）。
 */
const loadedDataSourcesForPanel = computed(() => dataImport.loadedDataSources.value);
const pendingGltfFile = computed(() => dataImport.pendingGltfFile.value);

/** 拖拽悬浮状态（用于显示拖拽提示覆盖层） */
const isDragOver = ref(false);

/** 拖拽进入 — 显示视觉提示 */
function onDragOver(event) {
    isDragOver.value = true;
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
    }
}

/** 拖拽离开 — 隐藏提示（忽略冒泡的子节点 leave，避免误隐藏） */
function onDragLeave(event) {
    // 仅当真正离开容器（relatedTarget 不在容器内）时才关闭覆盖层，
    // 否则子节点冒泡触发 leave 会闪烁。
    const related = event?.relatedTarget;
    const current = event?.currentTarget;
    if (related instanceof Node && current instanceof Node && current.contains(related)) {
        return;
    }
    isDragOver.value = false;
}

/** 拖拽释放 — 解析文件并导入 */
async function onDrop(event) {
    isDragOver.value = false;
    if (!cesiumReady.value) return;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
        try {
            await dataImport.loadDataFile(file);
        } catch {
            // loadDataFile 内部已通过 message.error 提示
        }
    }
}

const {
    toolPanelOpen: cesiumToolPanelOpen,
    advancedEffectControls,
    fluidParams,
    baseAtmosphereParams,
    shallowWaterVisible,
    shallowWaterParams,
    toolModules,
    handleToolAction,
    handleToolControlChange,
    handleFluidStateChange,
    cleanupTools,
} = useCesiumToolModules({
    fluidPanelRef,
    sceneActions,
    wind,
    modelManager,
    cameraEnhanced,
    heightSampler,
});

async function bootCesium() {
    componentUnmounted = false;
    showLoading('正在初始化 3D 场景...');
    console.warn('[Cesium][boot] start', { ionTokenPresent: !!getCesiumIonToken(), tiandituPresent: !!getTiandituToken() });
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
                console.warn('[Cesium][boot] runtime tokens loaded', {
                    td: !!runtimeMapTokens.value.tiandituTk,
                    ion: !!runtimeMapTokens.value.cesiumIonToken,
                });
                Cesium = await loadCesiumRuntime({ ionToken: getCesiumIonToken() });
                if (componentUnmounted || !Cesium || !document.getElementById('cesiumContainer')) return;
                console.warn('[Cesium][boot] Cesium global ready', {
                    hasViewer: typeof Cesium.Viewer,
                    hasMap: typeof Cesium.Map,
                    hasIon: !!Cesium.Ion,
                });

                initViewer();
                console.warn('[Cesium][boot] viewer constructed');
                setupInteractions();

                const basemapReady = addBaseImageryLayers();
                const terrainReady = await initCustomTerrain();
                console.warn('[Cesium][boot] base layers', { basemapReady, terrainReady });
                if (componentUnmounted) {
                    resetCesiumViewerForRetry();
                    return;
                }
                cesiumReady.value = true;
                bindCameraViewSync({ initialSync: false, getActivePresetId: () => activeBasemap.value });
                // 从 URL 恢复底图预设
                restoreBasemapFromUrl();
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
                console.warn('[Cesium][boot] token switch retry', {
                    retryCount,
                    tdSwitched: !!switchedTianditu.switched,
                    ionSwitched: !!switchedCesium.switched,
                });
                message.warning('主 token 初始化失败，正在尝试备用 token。', { closable: true });
            } catch (error) {
                console.error('[Cesium][boot] stage error:', error);
                const switchedCesium = markRuntimeMapTokenFailed('cesium_ion_token');
                if (!switchedCesium.switched) throw error;
                runtimeMapTokens.value = switchedCesium.tokens;
                resetCesiumViewerForRetry();
                retryCount += 1;
                message.warning('Cesium ion token 失败，正在尝试备用 token。', { closable: true });
            }
        }
        console.error('[Cesium][boot] exhausted token pool');
        message.error('备用 token 已全部尝试，Cesium 初始化仍失败。', { closable: true });
        // 风场在初始化完毕后即可准备加载（但需要手动点击按钮或自动加载）
        // 这里不自动加载，避免占满视野，等待用户点击“加载模拟风场”
    } catch (error) {
        console.error('[Cesium][boot] FATAL:', error);
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
    viewer.scene.debugShowFramesPerSecond = true;
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

// ==========================================
// 数据导入事件处理
// ==========================================

/**
 * 处理文件导入事件（由 CesiumToolPanel data tab 触发）
 * 支持多文件选择，逐个加载
 * @param {{ files: File[] }} payload
 */
async function handleDataImport({ files }) {
    for (const file of files) {
        try {
            await dataImport.loadDataFile(file);
        } catch {
            // loadDataFile 内部已通过 message.error 提示用户
        }
    }
}

/**
 * 移除单个已加载数据源
 * @param {{ id: string }} payload
 */
function handleDataRemove({ id }) {
    dataImport.removeDataSource(id);
}

/** 清除所有已加载数据源 */
function handleDataClearAll() {
    dataImport.clearAllDataSources();
}

/**
 * GLTF 坐标弹窗确认回调
 * @param {{ lng: number, lat: number, height: number }} coords
 */
async function handleGltfCoordConfirm(coords) {
    try {
        await dataImport.loadGltfWithUserCoords(coords);
    } catch {
        // loadGltfWithUserCoords 内部已通过 message.error 提示用户
    }
}

/** GLTF 坐标弹窗取消回调 */
function handleGltfCoordCancel() {
    dataImport.cancelPendingGltf();
}

onUnmounted(() => {
    componentUnmounted = true;
    cesiumReady.value = false;
    cleanupCameraViewSync();
    cleanupInteractions();
    cleanupTools();
    cleanupLayers();

    // 清理 tellux 移植模块
    modelManager.dispose();
    cameraEnhanced.cleanup();
    heightSampler.cleanup();

    cleanupCreditHider();
    dataImport.clearAllDataSources();
    if (viewer) {
        try {
            viewer.destroy();
        } catch (e) {
            console.warn('Cesium viewer destroy warning:', e);
        }
        viewer = null;
    }
});

// 在 Cesium 初始化完成后调用
watch(cesiumReady, (ready) => {
    if (ready) {
        // 初始应用基础大气参数
        applyBaseAtmosphereParams(baseAtmosphereParams.value);
    }
});

/**
 * 应用基础大气参数到 Cesium 场景
 * @param {Object} params - 基础大气参数
 */
function applyBaseAtmosphereParams(params) {
    if (!viewer || !Cesium) return;
    const scene = viewer.scene;
    const globe = scene.globe;

    if (globe) {
        globe.enableLighting = params.enableLighting;
        globe.showGroundAtmosphere = params.showGroundAtmosphere;
        if ('dynamicAtmosphereLighting' in globe) globe.dynamicAtmosphereLighting = params.dynamicAtmosphereLighting;
        if ('dynamicAtmosphereLightingFromSun' in globe) globe.dynamicAtmosphereLightingFromSun = params.dynamicAtmosphereLightingFromSun;
        if ('atmosphereLightIntensity' in globe) globe.atmosphereLightIntensity = params.atmosphereLightIntensity;
        if ('atmosphereHueShift' in globe) globe.atmosphereHueShift = params.atmosphereHueShift;
        if ('atmosphereSaturationShift' in globe) globe.atmosphereSaturationShift = params.atmosphereSaturationShift;
        if ('atmosphereBrightnessShift' in globe) globe.atmosphereBrightnessShift = params.atmosphereBrightnessShift;
        if ('lightingFadeInDistance' in globe) globe.lightingFadeInDistance = params.lightingFadeInDistance;
        if ('lightingFadeOutDistance' in globe) globe.lightingFadeOutDistance = params.lightingFadeOutDistance;
        if ('nightFadeInDistance' in globe) globe.nightFadeInDistance = params.nightFadeInDistance;
        if ('nightFadeOutDistance' in globe) globe.nightFadeOutDistance = params.nightFadeOutDistance;
    }

    if (scene.fog) {
        scene.fog.enabled = params.fogEnabled;
        if ('density' in scene.fog) scene.fog.density = params.fogDensity;
        if ('minimumBrightness' in scene.fog) scene.fog.minimumBrightness = params.fogMinimumBrightness;
    }

    if (scene.sun) scene.sun.show = params.sunShow;
    if (scene.moon) scene.moon.show = params.moonShow;
    if (scene.skyBox) scene.skyBox.show = params.skyBoxShow;

    scene.requestRender?.();
}

// 监听基础大气参数变化，应用到 Cesium 场景
watch(
    baseAtmosphereParams,
    (params) => {
        applyBaseAtmosphereParams(params);
    },
    { deep: true },
);
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

/* 拖拽上传覆盖层 */
.drag-overlay {
    position: absolute;
    inset: 0;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    background: rgba(8, 25, 36, 0.88);
    border: 3px dashed rgba(74, 222, 128, 0.56);
    border-radius: 12px;
    pointer-events: none;
    color: #a7f3d0;
}

.drag-overlay-text {
    font-size: 18px;
    font-weight: 800;
    color: #f6fffb;
}

.drag-overlay-hint {
    font-size: 13px;
    color: rgba(220, 243, 255, 0.56);
}
</style>
