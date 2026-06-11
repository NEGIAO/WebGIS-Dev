<template>
    <div
        v-if="!headless"
        class="fluid-root"
    >
        <div class="fluid-panel">
            <div class="panel-head">
                <span class="panel-title">水体流体</span>
                <button
                    class="panel-close"
                    title="关闭"
                    @click="closePanel"
                >
                    ×
                </button>
            </div>

            <div class="panel-actions">
                <button
                    class="action-btn primary"
                    :class="{ active: isPicking }"
                    @click="startPickHeightMap"
                >
                    {{ isPicking ? '等待选点' : '捕捉高度图' }}
                </button>
                <button
                    class="action-btn"
                    :disabled="!hasFluid && !isPicking"
                    @click="clearFluid"
                >
                    清除
                </button>
            </div>

            <div
                v-if="selectedText"
                class="selected-text"
            >
                {{ selectedText }}
            </div>

            <div class="param-list">
                <label class="param-row">
                    <span>阈值</span>
                    <input
                        v-model.number="threshold"
                        type="range"
                        min="0"
                        max="500"
                        step="0.0001"
                    />
                    <input
                        v-model.number="threshold"
                        class="number-input"
                        type="number"
                        min="0"
                        max="500"
                        step="0.0001"
                    />
                </label>

                <label class="param-row">
                    <span>混合</span>
                    <input
                        v-model.number="blend"
                        type="range"
                        min="0"
                        max="50"
                        step="0.0001"
                    />
                    <input
                        v-model.number="blend"
                        class="number-input"
                        type="number"
                        min="0"
                        max="50"
                        step="0.0001"
                    />
                </label>

                <label class="param-row">
                    <span>光强</span>
                    <input
                        v-model.number="lightStrength"
                        type="range"
                        min="0"
                        max="10"
                        step="0.0001"
                    />
                    <input
                        v-model.number="lightStrength"
                        class="number-input"
                        type="number"
                        min="0"
                        max="10"
                        step="0.0001"
                    />
                </label>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useMessage } from '../../../composables/useMessage';
import { createFluidRuntime } from './fluidRuntime';

const props = defineProps({
    headless: {
        type: Boolean,
        default: false,
    },
    getViewer: {
        type: Function,
        required: true,
    },
    getCesium: {
        type: Function,
        required: true,
    },
    params: {
        type: Object,
        default: () => ({}),
    },
});

const emit = defineEmits(['close', 'state-change']);

const message = useMessage();

const threshold = ref(10);
const blend = ref(20);
const lightStrength = ref(3);
const isPicking = ref(false);
const hasFluid = ref(false);
const selectedLon = ref(null);
const selectedLat = ref(null);

let FluidRenderer = null;
let createSkyEffect = null;
let pickHandler = null;
let fluidRenderer = null;
let skyStage = null;
let sceneSnapshot = null;

const selectedText = computed(() => {
    if (!Number.isFinite(selectedLon.value) || !Number.isFinite(selectedLat.value)) {
        return '';
    }

    return `经度 ${selectedLon.value.toFixed(6)} / 纬度 ${selectedLat.value.toFixed(6)}`;
});

watch([threshold, blend, lightStrength], applyFluidParams);

watch(
    () => props.params,
    (params) => {
        syncExternalParams(params || {});
    },
    { deep: true, immediate: true },
);

watch([isPicking, hasFluid, selectedText], emitState, { immediate: true });

onBeforeUnmount(() => {
    cleanup(true);
});

function getViewerAndCesium() {
    const viewer = props.getViewer?.();
    const Cesium = props.getCesium?.() || window.Cesium;

    if (!viewer || !Cesium) {
        message.warning('Cesium 场景尚未就绪。');
        return null;
    }

    if (!FluidRenderer) {
        const runtime = createFluidRuntime(Cesium);
        FluidRenderer = runtime.FluidRenderer;
        createSkyEffect = runtime.createSkyEffect;
    }

    return { viewer, Cesium };
}

function syncExternalParams(params) {
    if (Number.isFinite(Number(params.threshold))) {
        threshold.value = Number(params.threshold);
    }
    if (Number.isFinite(Number(params.blend))) {
        blend.value = Number(params.blend);
    }
    if (Number.isFinite(Number(params.lightStrength))) {
        lightStrength.value = Number(params.lightStrength);
    }
}

function emitState() {
    emit('state-change', {
        isPicking: isPicking.value,
        hasFluid: hasFluid.value,
        selectedText: selectedText.value,
    });
}

function startPickHeightMap() {
    const runtime = getViewerAndCesium();
    if (!runtime) return;

    const { viewer, Cesium } = runtime;
    stopPicking();
    prepareScene(viewer, Cesium);

    isPicking.value = true;
    pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    pickHandler.setInputAction((movement) => {
        createFluidAtScreenPosition(viewer, Cesium, movement.position);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function createFluidAtScreenPosition(viewer, Cesium, position) {
    const cartesian = pickCartesian(viewer, position);
    if (!cartesian) {
        message.warning('未选中可用地形位置。');
        return;
    }

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const groundHeight = Math.max(0, Number(cartographic.height) || 0);
    const bottomPadding = 100;
    const fluidDepth = 1200;
    const baseHeight = Math.max(0, groundHeight - bottomPadding);

    try {
        destroyFluidOnly();

        fluidRenderer = new FluidRenderer(viewer, {
            lonLat: [lon, lat],
            width: 1024,
            height: 1024,
            dimensions: new Cesium.Cartesian3(10000, 10000, fluidDepth),
            baseHeight,
            minHeight: 0,
            maxHeight: fluidDepth,
            customParams: new Cesium.Cartesian4(
                Number(threshold.value),
                Number(blend.value),
                Number(lightStrength.value),
                10,
            ),
        });

        selectedLon.value = lon;
        selectedLat.value = lat;
        hasFluid.value = true;
        stopPicking();
        viewer.scene.requestRender?.();
        message.success('水体流体已创建。');
    } catch (error) {
        stopPicking();
        message.error('水体流体创建失败', error);
        message.warning('当前显卡或 Cesium 版本可能不支持该流体渲染管线。', { closable: true });
    }
}

function pickCartesian(viewer, position) {
    if (!position) return null;

    if (viewer.scene.pickPositionSupported && typeof viewer.scene.pickPosition === 'function') {
        const picked = viewer.scene.pickPosition(position);
        if (picked) return picked;
    }

    const ray = viewer.camera.getPickRay(position);
    if (!ray) return null;
    return viewer.scene.globe.pick(ray, viewer.scene);
}

function applyFluidParams() {
    if (!fluidRenderer?.config?.customParams) return;

    fluidRenderer.config.customParams.x = Number(threshold.value) || 0;
    fluidRenderer.config.customParams.y = Number(blend.value) || 0;
    fluidRenderer.config.customParams.z = Number(lightStrength.value) || 0;
}

function prepareScene(viewer, Cesium) {
    if (!sceneSnapshot) {
        const scene = viewer.scene;
        sceneSnapshot = {
            shadows: viewer.shadows,
            resolutionScale: viewer.resolutionScale,
            msaaSamples: scene.msaaSamples,
            depthTestAgainstTerrain: scene.globe.depthTestAgainstTerrain,
            logarithmicDepthBuffer: scene.logarithmicDepthBuffer,
            highDynamicRange: scene.highDynamicRange,
            fogEnabled: scene.fog?.enabled,
            showGroundAtmosphere: scene.globe.showGroundAtmosphere,
            skyAtmosphereShow: scene.skyAtmosphere?.show,
            enableLighting: scene.globe.enableLighting,
        };
    }

    viewer.shadows = true;
    viewer.resolutionScale = 1.0;
    viewer.scene.msaaSamples = 4;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.logarithmicDepthBuffer = true;
    viewer.scene.highDynamicRange = true;
    if (viewer.scene.fog) viewer.scene.fog.enabled = true;
    viewer.scene.globe.showGroundAtmosphere = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    viewer.scene.globe.enableLighting = true;

    if (!skyStage && createSkyEffect) {
        skyStage = createSkyEffect(Cesium);
        viewer.scene.postProcessStages.add(skyStage);
    }
}

function restoreScene(viewer) {
    if (!viewer || !sceneSnapshot) return;

    const scene = viewer.scene;
    viewer.shadows = sceneSnapshot.shadows;
    viewer.resolutionScale = sceneSnapshot.resolutionScale;
    if (sceneSnapshot.msaaSamples !== undefined) scene.msaaSamples = sceneSnapshot.msaaSamples;
    scene.globe.depthTestAgainstTerrain = sceneSnapshot.depthTestAgainstTerrain;
    scene.logarithmicDepthBuffer = sceneSnapshot.logarithmicDepthBuffer;
    scene.highDynamicRange = sceneSnapshot.highDynamicRange;
    if (scene.fog && sceneSnapshot.fogEnabled !== undefined) scene.fog.enabled = sceneSnapshot.fogEnabled;
    scene.globe.showGroundAtmosphere = sceneSnapshot.showGroundAtmosphere;
    if (scene.skyAtmosphere && sceneSnapshot.skyAtmosphereShow !== undefined) {
        scene.skyAtmosphere.show = sceneSnapshot.skyAtmosphereShow;
    }
    scene.globe.enableLighting = sceneSnapshot.enableLighting;
    sceneSnapshot = null;
}

function clearFluid() {
    cleanup(false);
    message.success('水体流体已清除。');
}

function stopPicking() {
    if (pickHandler) {
        pickHandler.destroy();
        pickHandler = null;
    }
    isPicking.value = false;
}

function destroyFluidOnly() {
    if (!fluidRenderer) return;

    try {
        fluidRenderer.destroy();
    } catch (error) {
        console.warn('FluidRenderer destroy warning:', error);
    }
    fluidRenderer = null;
    hasFluid.value = false;
}

function cleanup(restoreSceneState) {
    const viewer = props.getViewer?.();

    stopPicking();
    destroyFluidOnly();
    selectedLon.value = null;
    selectedLat.value = null;

    if (viewer && skyStage) {
        try {
            viewer.scene.postProcessStages.remove(skyStage);
        } catch (error) {
            console.warn('Fluid sky stage remove warning:', error);
        }
        skyStage = null;
    }

    if (restoreSceneState && viewer) {
        restoreScene(viewer);
    }

    viewer?.scene?.requestRender?.();
}

function closePanel() {
    cleanup(true);
    emit('close');
}

defineExpose({
    startPickHeightMap,
    clearFluid,
});
</script>

<style scoped>
.fluid-root {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1250;
    pointer-events: none;
}

.fluid-panel {
    width: 360px;
    border: 1px solid rgba(148, 210, 255, 0.32);
    border-radius: 8px;
    background: rgba(9, 27, 42, 0.86);
    color: #e8f6ff;
    box-shadow: 0 12px 28px rgba(2, 10, 18, 0.34);
    backdrop-filter: blur(10px);
    pointer-events: auto;
}

.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(148, 210, 255, 0.18);
}

.panel-title {
    font-size: 13px;
    font-weight: 700;
}

.panel-close {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #e8f6ff;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
}

.panel-close:hover {
    background: rgba(255, 255, 255, 0.12);
}

.panel-actions {
    display: flex;
    gap: 10px;
    padding: 12px 14px 4px;
}

.action-btn {
    height: 32px;
    border: 1px solid rgba(148, 210, 255, 0.36);
    border-radius: 8px;
    background: rgba(12, 46, 70, 0.72);
    color: #e8f6ff;
    padding: 0 14px;
    cursor: pointer;
}

.action-btn.primary {
    background: rgba(33, 118, 172, 0.82);
}

.action-btn.active {
    background: rgba(230, 164, 55, 0.88);
}

.action-btn:disabled {
    cursor: not-allowed;
    opacity: 0.48;
}

.selected-text {
    padding: 6px 14px 2px;
    color: rgba(232, 246, 255, 0.82);
    font-size: 12px;
}

.param-list {
    display: grid;
    gap: 12px;
    padding: 12px 14px 14px;
}

.param-row {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) 72px;
    align-items: center;
    gap: 10px;
    font-size: 12px;
}

.param-row input[type='range'] {
    width: 100%;
    accent-color: #4fb3ff;
}

.number-input {
    min-width: 0;
    height: 28px;
    border: 1px solid rgba(148, 210, 255, 0.28);
    border-radius: 6px;
    background: rgba(5, 18, 29, 0.72);
    color: #e8f6ff;
    padding: 0 6px;
}

@media (max-width: 768px) {
    .fluid-root {
        top: 10px;
        left: 10px;
        right: 10px;
    }

    .fluid-panel {
        width: 100%;
    }
}
</style>
