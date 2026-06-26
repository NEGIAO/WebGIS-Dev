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

            <LilGuiControls
                class="param-list"
                title="Fluid Parameters"
                :controls="fluidGuiControls"
                @change="handleFluidGuiChange"
            />
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useMessage } from '../../../composables/useMessage';
import { showLoading, hideLoading } from '../../../utils/ui/loading';
import { createFluidRuntime } from './fluidRuntime';
import LilGuiControls from '../LilGuiControls.vue';

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

const FLUID_TEXTURE_SIZE = 1024;
// 水平范围尺寸：10KM
const FLUID_HORIZONTAL_SIZE = 10000;
const FLUID_FALLBACK_DEPTH = 1200;
const FLUID_FALLBACK_BOTTOM_PADDING = 100;
const FLUID_MIN_VERTICAL_SPAN = 0.01;
const FLUID_INITIAL_WATER_RATIO = 0.03;
const TERRAIN_SAMPLE_TARGET_SPACING = 60;
const TERRAIN_SAMPLE_MIN_SIZE = 64;
const TERRAIN_SAMPLE_MAX_SIZE = 160;

const threshold = ref(10);
const blend = ref(20);
const lightStrength = ref(3);
const waterColor = ref('#0d4fa3');
const waterLevel = ref(null);
const waterLevelMin = ref(null);
const waterLevelMax = ref(null);
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
let fluidCreationId = 0;

const selectedText = computed(() => {
    if (!Number.isFinite(selectedLon.value) || !Number.isFinite(selectedLat.value)) {
        return '';
    }

    return `经度 ${selectedLon.value.toFixed(6)} / 纬度 ${selectedLat.value.toFixed(6)}`;
});

const hasWaterLevelRange = computed(() => {
    return Number.isFinite(waterLevelMin.value) && Number.isFinite(waterLevelMax.value);
});

const waterLevelStep = computed(() => {
    if (!hasWaterLevelRange.value) return 1;
    const span = Math.abs(waterLevelMax.value - waterLevelMin.value);
    return Math.max(span / 1000, 0.01);
});

const fluidGuiControls = computed(() => [
    {
        id: 'threshold',
        label: 'Threshold',
        type: 'range',
        min: 0,
        max: 500,
        step: 0.0001,
        value: threshold.value,
        displayValue: Number(threshold.value).toFixed(2),
    },
    {
        id: 'blend',
        label: 'Blend',
        type: 'range',
        min: 0,
        max: 50,
        step: 0.0001,
        value: blend.value,
        displayValue: Number(blend.value).toFixed(2),
    },
    {
        id: 'lightStrength',
        label: 'Light',
        type: 'range',
        min: 0,
        max: 10,
        step: 0.0001,
        value: lightStrength.value,
        displayValue: Number(lightStrength.value).toFixed(2),
    },
    {
        id: 'waterLevel',
        label: 'Water Level',
        type: 'range',
        min: hasWaterLevelRange.value ? waterLevelMin.value : 0,
        max: hasWaterLevelRange.value ? waterLevelMax.value : 1,
        step: waterLevelStep.value,
        value: Number.isFinite(Number(waterLevel.value)) ? Number(waterLevel.value) : 0,
        displayValue: hasWaterLevelRange.value && Number.isFinite(Number(waterLevel.value))
            ? `${Number(waterLevel.value).toFixed(2)} m`
            : 'Pick terrain first',
        disabled: !hasWaterLevelRange.value,
    },
    {
        id: 'waterColor',
        label: 'Water Color',
        type: 'color',
        value: waterColor.value,
    },
]);

watch([threshold, blend, lightStrength, waterColor], applyFluidParams);
watch(waterLevel, applyWaterLevelParam);

watch(
    () => props.params,
    (params) => {
        syncExternalParams(params || {});
    },
    { deep: true, immediate: true },
);

watch([isPicking, hasFluid, selectedText, waterLevel, waterLevelMin, waterLevelMax], emitState, { immediate: true });

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
    if (isValidHexColor(params.waterColor)) {
        waterColor.value = params.waterColor;
    }
    if (Number.isFinite(Number(params.waterLevel))) {
        waterLevel.value = Number(params.waterLevel);
    }
}

function handleFluidGuiChange({ controlId, value }) {
    if (controlId === 'threshold') {
        threshold.value = Number(value);
    } else if (controlId === 'blend') {
        blend.value = Number(value);
    } else if (controlId === 'lightStrength') {
        lightStrength.value = Number(value);
    } else if (controlId === 'waterLevel') {
        waterLevel.value = Number(value);
    } else if (controlId === 'waterColor' && isValidHexColor(value)) {
        waterColor.value = value;
    }
}

function emitState() {
    emit('state-change', {
        isPicking: isPicking.value,
        hasFluid: hasFluid.value,
        selectedText: selectedText.value,
        waterLevel: waterLevel.value,
        waterLevelMin: waterLevelMin.value,
        waterLevelMax: waterLevelMax.value,
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
        void createFluidAtScreenPosition(viewer, Cesium, movement.position);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

async function createFluidAtScreenPosition(viewer, Cesium, position) {
    const cartesian = pickCartesian(viewer, position);
    if (!cartesian) {
        message.warning('未选中可用地形位置。');
        return;
    }

    const creationId = ++fluidCreationId;
    stopPicking();

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const pickedHeight = Number(cartographic.height);
    const centerHeight = Number.isFinite(pickedHeight) ? pickedHeight : 0;
    const horizontalDimensions = new Cesium.Cartesian3(
        FLUID_HORIZONTAL_SIZE,
        FLUID_HORIZONTAL_SIZE,
        0,
    );

    showLoading('正在请求模拟范围高度数据...');
    try {
        destroyFluidOnly();

        const t = Number(threshold.value) || 0;
        const b = Number(blend.value) || 0;
        const l = Number(lightStrength.value) || 0;
        const heightMapSource = await createTerrainHeightMapSource(viewer, Cesium, {
            lon,
            lat,
            centerHeight,
            dimensions: horizontalDimensions,
        });
        const verticalRange = resolveFluidVerticalRange(heightMapSource, centerHeight);
        const baseHeight = verticalRange.baseHeight;
        const fluidDepth = verticalRange.depth;
        const initialWaterLevel = resolveInitialWaterLevel(verticalRange, centerHeight);
        const dimensions = new Cesium.Cartesian3(
            FLUID_HORIZONTAL_SIZE,
            FLUID_HORIZONTAL_SIZE,
            fluidDepth,
        );

        if (creationId !== fluidCreationId) return;

        waterLevelMin.value = verticalRange.minHeight;
        waterLevelMax.value = verticalRange.maxHeight;
        waterLevel.value = initialWaterLevel;

        if (!heightMapSource) {
            message.warning('范围高度预请求不可用，已回退到当前场景捕捉。', {
                duration: 4200,
            });
        }

        fluidRenderer = new FluidRenderer(viewer, {
            lonLat: [lon, lat],
            width: FLUID_TEXTURE_SIZE,
            height: FLUID_TEXTURE_SIZE,
            dimensions,
            baseHeight,
            minHeight: verticalRange.minHeight,
            maxHeight: verticalRange.maxHeight,
            heightMapSource,
            waterColor: createCesiumRgb(Cesium, waterColor.value),
            // 渲染参数：雾距/高光强度/高光衰减
            customParams: new Cesium.Cartesian4(t, b, l, 10),
            // 模拟参数：attenuation/strength/minTotalFlow/initialWaterLevel
            fluidParams: new Cesium.Cartesian4(
                0.9 + (l / 10) * 0.099,   // attenuation
                Math.min(1, b / 50),        // strength
                t / 50000,                   // minTotalFlow
                normalizeWaterLevel(initialWaterLevel, verticalRange),
            ),
        });

        selectedLon.value = lon;
        selectedLat.value = lat;
        hasFluid.value = true;
        viewer.scene.requestRender?.();
        message.success('水体流体已创建。');
    } catch (error) {
        message.error('水体流体创建失败', error);
        message.warning('当前显卡或 Cesium 版本可能不支持该流体渲染管线。', { closable: true });
    } finally {
        hideLoading();
    }
}

async function createTerrainHeightMapSource(viewer, Cesium, options) {
    const terrainProvider = viewer?.terrainProvider;
    const size = chooseTerrainSampleSize(options.dimensions);

    if (!terrainProvider) return null;

    if (Cesium.EllipsoidTerrainProvider && terrainProvider instanceof Cesium.EllipsoidTerrainProvider) {
        return createFlatHeightMapSource(size);
    }

    if (typeof Cesium.sampleTerrain !== 'function' && typeof Cesium.sampleTerrainMostDetailed !== 'function') {
        return null;
    }

    try {
        return await sampleTerrainHeightMapSource(viewer, Cesium, options, size);
    } catch (error) {
        console.warn('Fluid terrain sampling warning:', error);
        if (size <= TERRAIN_SAMPLE_MIN_SIZE) throw error;
        return sampleTerrainHeightMapSource(viewer, Cesium, options, TERRAIN_SAMPLE_MIN_SIZE);
    }
}

async function sampleTerrainHeightMapSource(viewer, Cesium, options, size) {
    const positions = createTerrainSamplePositions(Cesium, options, size);
    const sampledPositions = await sampleTerrainPositions(
        Cesium,
        viewer.terrainProvider,
        positions,
    );
    return createSampledHeightMapSource(sampledPositions || positions, { size });
}

function chooseTerrainSampleSize(dimensions) {
    const horizontalSize = Math.max(Number(dimensions?.x) || 0, Number(dimensions?.y) || 0);
    const targetSize = Math.ceil(horizontalSize / TERRAIN_SAMPLE_TARGET_SPACING) + 1;
    return clampInteger(targetSize, TERRAIN_SAMPLE_MIN_SIZE, TERRAIN_SAMPLE_MAX_SIZE);
}

function clampInteger(value, min, max) {
    return Math.max(min, Math.min(max, Math.round(value)));
}

function createTerrainSamplePositions(Cesium, { lon, lat, centerHeight, dimensions }, size) {
    const center = Cesium.Cartesian3.fromDegrees(lon, lat, centerHeight);
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const positions = [];
    const denominator = Math.max(1, size - 1);

    for (let row = 0; row < size; row++) {
        const v = row / denominator;
        const north = (0.5 - v) * dimensions.y;

        for (let col = 0; col < size; col++) {
            const u = col / denominator;
            const east = (u - 0.5) * dimensions.x;
            const local = new Cesium.Cartesian3(east, north, 0);
            const world = Cesium.Matrix4.multiplyByPoint(
                enuMatrix,
                local,
                new Cesium.Cartesian3(),
            );
            positions.push(Cesium.Cartographic.fromCartesian(world));
        }
    }

    return positions;
}

async function sampleTerrainPositions(Cesium, terrainProvider, positions) {
    // 统一用 sampleTerrain 指定层级，避免 sampleTerrainMostDetailed 请求过高精度导致瓦片过载
    // 天地图 _bottomLevel=11 走 level 10，ArcGIS/Cesium 走 level 12
    const explicitLevel = getExplicitTerrainSampleLevel(terrainProvider);
    const sampleLevel = Number.isInteger(explicitLevel)
        ? explicitLevel
        : Math.min(terrainProvider?.maximumLevel ?? 12, 12);

    if (typeof Cesium.sampleTerrain === 'function') {
        return Cesium.sampleTerrain(terrainProvider, sampleLevel, positions);
    }

    // 兜底：sampleTerrain 不可用时才用 sampleTerrainMostDetailed
    return Cesium.sampleTerrainMostDetailed(terrainProvider, positions);
}

function getExplicitTerrainSampleLevel(terrainProvider) {
    const bottomLevel = Number(terrainProvider?._bottomLevel);
    if (Number.isFinite(bottomLevel)) {
        return Math.max(0, bottomLevel - 1);
    }
    return null;
}

function createSampledHeightMapSource(positions, { size }) {
    const range = getTerrainHeightRange(positions);
    if (!range) return null;

    const data = new Float32Array(size * size * 4);

    for (let i = 0; i < size * size; i++) {
        const height = Number(positions[i]?.height);
        const offset = i * 4;
        data[offset] = Number.isFinite(height)
            ? clampNumber(height, range.minHeight, range.maxHeight)
            : range.minHeight;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 1;
    }

    return {
        width: size,
        height: size,
        arrayBufferView: data,
        minHeight: range.minHeight,
        maxHeight: range.maxHeight,
    };
}

function createFlatHeightMapSource(size) {
    return {
        width: size,
        height: size,
        arrayBufferView: new Float32Array(size * size * 4),
        minHeight: 0,
        maxHeight: 0,
    };
}

function getTerrainHeightRange(positions) {
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;

    for (const position of positions || []) {
        const height = Number(position?.height);
        if (!Number.isFinite(height)) continue;
        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
    }

    if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) {
        return null;
    }

    return { minHeight, maxHeight };
}

function resolveFluidVerticalRange(heightMapSource, centerHeight) {
    const sampledMinHeight = Number(heightMapSource?.minHeight);
    const sampledMaxHeight = Number(heightMapSource?.maxHeight);

    if (Number.isFinite(sampledMinHeight) && Number.isFinite(sampledMaxHeight)) {
        const pickedHeight = Number(centerHeight);
        const minHeight = Number.isFinite(pickedHeight)
            ? Math.min(sampledMinHeight, sampledMaxHeight, pickedHeight)
            : Math.min(sampledMinHeight, sampledMaxHeight);
        const maxHeight = Number.isFinite(pickedHeight)
            ? Math.max(sampledMinHeight, sampledMaxHeight, pickedHeight)
            : Math.max(sampledMinHeight, sampledMaxHeight);
        const depth = Math.max(maxHeight - minHeight, FLUID_MIN_VERTICAL_SPAN);

        return {
            baseHeight: minHeight,
            depth,
            minHeight,
            maxHeight: minHeight + depth,
        };
    }

    const fallbackCenterHeight = Number(centerHeight);
    const fallbackBaseHeight = Number.isFinite(fallbackCenterHeight)
        ? fallbackCenterHeight - FLUID_FALLBACK_BOTTOM_PADDING
        : 0;

    return {
        baseHeight: fallbackBaseHeight,
        depth: FLUID_FALLBACK_DEPTH,
        minHeight: fallbackBaseHeight,
        maxHeight: fallbackBaseHeight + FLUID_FALLBACK_DEPTH,
    };
}

function resolveInitialWaterLevel(verticalRange, pickedWaterLevel) {
    const fallbackLevel = verticalRange.minHeight + verticalRange.depth * FLUID_INITIAL_WATER_RATIO;
    const picked = Number(pickedWaterLevel);
    const nextWaterLevel = Number.isFinite(picked) ? picked : fallbackLevel;
    return clampNumber(nextWaterLevel, verticalRange.minHeight, verticalRange.maxHeight);
}

function normalizeWaterLevel(absoluteWaterLevel, verticalRange) {
    const span = verticalRange.maxHeight - verticalRange.minHeight;
    if (!Number.isFinite(span) || span <= 0) return 0;
    return clampNumber((absoluteWaterLevel - verticalRange.minHeight) / span, 0, 1);
}

function getCurrentWaterLevelRange() {
    if (!Number.isFinite(waterLevelMin.value) || !Number.isFinite(waterLevelMax.value)) {
        return null;
    }

    return {
        minHeight: Math.min(waterLevelMin.value, waterLevelMax.value),
        maxHeight: Math.max(waterLevelMin.value, waterLevelMax.value),
    };
}

function createCesiumRgb(Cesium, hexColor) {
    const rgb = parseHexColor(hexColor) || parseHexColor('#0d4fa3');
    return new Cesium.Cartesian3(rgb.red, rgb.green, rgb.blue);
}

function syncWaterColorConfig() {
    const rgb = parseHexColor(waterColor.value);
    const color = fluidRenderer?.config?.waterColor;
    if (!rgb || !color) return;

    color.x = rgb.red;
    color.y = rgb.green;
    color.z = rgb.blue;
}

function isValidHexColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function parseHexColor(value) {
    if (!isValidHexColor(value)) return null;

    return {
        red: Number.parseInt(value.slice(1, 3), 16) / 255,
        green: Number.parseInt(value.slice(3, 5), 16) / 255,
        blue: Number.parseInt(value.slice(5, 7), 16) / 255,
    };
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

/**
 * 将 UI 参数同步到流体渲染器
 * - customParam: 渲染参数（雾距/高光强度/高光衰减）
 * - fluidParam: 模拟参数（衰减/流出强度/最小流量阈值/初始水深）
 *
 * UI 映射关系：
 *   threshold  → fluidParam.z (minTotalFlow)    → 值越大，越难开始流动
 *   blend      → fluidParam.y (strength)        → 值越大，流出越强
 *   lightStrength → fluidParam.x (attenuation)  → 值越大，衰减越慢（水走得更远）
 */
function applyFluidParams() {
    if (!fluidRenderer?.config) return;

    const t = Number(threshold.value) || 0;
    const b = Number(blend.value) || 0;
    const l = Number(lightStrength.value) || 0;

    // 渲染参数（customParam 控制雾距/高光）
    if (fluidRenderer.config.customParams) {
        fluidRenderer.config.customParams.x = t;
        fluidRenderer.config.customParams.y = b;
        fluidRenderer.config.customParams.z = l;
    }

    // 模拟参数（fluidParam 控制流体行为）
    if (fluidRenderer.config.fluidParams) {
        // attenuation: 0.9~0.999，lightStrength 0~10 → 映射到 0.9~0.999
        fluidRenderer.config.fluidParams.x = 0.9 + (l / 10) * 0.099;
        // strength: blend 0~50 → 映射到 0~1
        fluidRenderer.config.fluidParams.y = Math.min(1, b / 50);
        // minTotalFlow: threshold 0~500 → 映射到 0~0.01
        fluidRenderer.config.fluidParams.z = t / 50000;
    }

    syncWaterColorConfig();
    fluidRenderer.viewer?.scene?.requestRender?.();
}

function applyWaterLevelParam() {
    if (!fluidRenderer?.config?.fluidParams) return;

    const range = getCurrentWaterLevelRange();
    const rawWaterLevel = Number(waterLevel.value);
    if (!range || !Number.isFinite(rawWaterLevel)) return;

    const clampedWaterLevel = clampNumber(rawWaterLevel, range.minHeight, range.maxHeight);
    if (clampedWaterLevel !== rawWaterLevel) {
        waterLevel.value = clampedWaterLevel;
        return;
    }

    const normalizedWaterLevel = normalizeWaterLevel(clampedWaterLevel, range);
    if (typeof fluidRenderer.setInitialWaterLevel === 'function') {
        fluidRenderer.setInitialWaterLevel(normalizedWaterLevel);
    } else {
        fluidRenderer.config.fluidParams.w = normalizedWaterLevel;
        fluidRenderer.viewer?.scene?.requestRender?.();
    }
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
    viewer.scene.globe.showGroundAtmosphere = true;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
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

    fluidCreationId += 1;
    stopPicking();
    destroyFluidOnly();
    selectedLon.value = null;
    selectedLat.value = null;
    waterLevel.value = null;
    waterLevelMin.value = null;
    waterLevelMax.value = null;

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
