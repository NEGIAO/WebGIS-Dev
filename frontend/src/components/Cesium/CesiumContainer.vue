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
        v-model:active-basemap="activeBasemap"
        v-model:active-terrain="activeTerrain"
        :basemap-options="basemapOptions"
        :terrain-options="terrainOptions"
        :modules="toolModules"
        @module-action="handleToolAction"
        @control-change="handleToolControlChange"
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
// Cesium runtime is loaded on demand to keep the initial bundle lean.
// Terrain and label providers are registered after Cesium is available.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { BACKEND_BASE_URL } from '../../api/backend';
import { useMessage } from '../../composables/useMessage';
import { showLoading, hideLoading } from '../../utils/ui/loading';
import CesiumAdvancedEffects from './CesiumAdvancedEffects.vue';
import CesiumToolPanel from './CesiumToolPanel.vue';
import FluidSimulationPanel from './FluidSimulation/FluidSimulationPanel.vue';
import Wind2D from './Wind2D';
import createGeoTerrainProvider from './terrain/GeoTerrainProvider';
import createGeoWTFS from './terrain/GeoWTFS';

let Cesium = null;

// --- 配置常量区域 ---
const TDT_TOKEN = import.meta.env.VITE_TIANDITU_TK;
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;
const TDT_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7'];
const TDT_SERVICE_ROOT = 'https://t{s}.tianditu.gov.cn/';

const CESIUM_BASE_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.110/Build/Cesium/';
const CESIUM_JS_URL = `${CESIUM_BASE_URL}Cesium.js`;
const CESIUM_CSS_URL = `${CESIUM_BASE_URL}Widgets/widgets.css`;

const TDT_LABEL_METADATA = {
    boundBox: {
        minX: -180,
        minY: -90,
        maxX: 180,
        maxY: 90,
    },
    minLevel: 1,
    maxLevel: 20,
};

const TDT_LABEL_INIT_TILES = [
    { x: 6, y: 1, level: 2, boundBox: { minX: 90, minY: 0, maxX: 135, maxY: 45 } },
    { x: 7, y: 1, level: 2, boundBox: { minX: 135, minY: 0, maxX: 180, maxY: 45 } },
    { x: 6, y: 0, level: 2, boundBox: { minX: 90, minY: 45, maxX: 135, maxY: 90 } },
    { x: 7, y: 0, level: 2, boundBox: { minX: 135, minY: 45, maxX: 180, maxY: 90 } },
    { x: 5, y: 1, level: 2, boundBox: { minX: 45, minY: 0, maxX: 90, maxY: 45 } },
    { x: 4, y: 1, level: 2, boundBox: { minX: 0, minY: 0, maxX: 45, maxY: 45 } },
    { x: 5, y: 0, level: 2, boundBox: { minX: 45, minY: 45, maxX: 90, maxY: 90 } },
    { x: 4, y: 0, level: 2, boundBox: { minX: 0, minY: 45, maxX: 45, maxY: 90 } },
    { x: 6, y: 2, level: 2, boundBox: { minX: 90, minY: -45, maxX: 135, maxY: 0 } },
    { x: 6, y: 3, level: 2, boundBox: { minX: 90, minY: -90, maxX: 135, maxY: -45 } },
    { x: 7, y: 2, level: 2, boundBox: { minX: 135, minY: -45, maxX: 180, maxY: 0 } },
    { x: 5, y: 2, level: 2, boundBox: { minX: 45, minY: -45, maxX: 90, maxY: 0 } },
    { x: 4, y: 2, level: 2, boundBox: { minX: 0, minY: -45, maxX: 45, maxY: 0 } },
    { x: 3, y: 1, level: 2, boundBox: { minX: -45, minY: 0, maxX: 0, maxY: 45 } },
    { x: 3, y: 0, level: 2, boundBox: { minX: -45, minY: 45, maxX: 0, maxY: 90 } },
    { x: 2, y: 0, level: 2, boundBox: { minX: -90, minY: 45, maxX: -45, maxY: 90 } },
    { x: 0, y: 1, level: 2, boundBox: { minX: -180, minY: 0, maxX: -135, maxY: 45 } },
    { x: 1, y: 0, level: 2, boundBox: { minX: -135, minY: 45, maxX: -90, maxY: 90 } },
    { x: 0, y: 0, level: 2, boundBox: { minX: -180, minY: 45, maxX: -135, maxY: 90 } },
];

// --- 响应式变量 ---
let viewer = null;
let handler = null;
let wtfs = null;
let creditCheckIntervalId = null;
let creditOverrideStyleEl = null;
let terrainSwitchId = 0;
const wind2D = ref(null); // Wind2D 实例
const coordinateDisplay = ref('经度: 0.000000, 纬度: 0.000000, 海拔: 0.00米');
const cesiumReady = ref(false);
const fluidPanelRef = ref(null);
const activeBasemap = ref('tianditu');
const activeTerrain = ref('tianditu');
const imageryLayerHandles = [];
const message = useMessage();

const basemapOptions = [
    { value: 'tianditu', label: '天地图' },
    { value: 'google', label: 'Google' },
];

const terrainOptions = [
    { value: 'tianditu', label: '天地图地形' },
    { value: 'cesiumWorld', label: 'Cesium世界地形' },
    { value: 'ellipsoid', label: '平面地形' },
];

const advancedEffectControls = ref({
    fog: true,
    hbao: false,
    tiltShift: true,
    atmosphere: true,
});

// 风场参数绑定（与 Wind2D 实例同步）
const windParams = ref({
    speedFactor: 1.0,
    arrowLength: 15000,
    trailLength: 20000,
    alphaFactor: 1.0,
});

const fluidParams = ref({
    threshold: 10,
    blend: 20,
    lightStrength: 3,
});

const fluidState = ref({
    isPicking: false,
    hasFluid: false,
    selectedText: '',
});

const toolModules = computed(() => [
    {
        id: 'scene',
        title: '场景导航',
        description: '相机和演示数据',
        actions: [
            { id: 'home', label: '回到初始视角' },
            { id: 'everest', label: '飞越珠峰' },
            { id: 'tileset', label: '加载3D模型' },
        ],
    },
    {
        id: 'effects',
        title: '高级特效',
        description: '统一控制雾效、阴影和大气',
        status: advancedEffectControls.value.atmosphere || advancedEffectControls.value.fog ? '启用' : '关闭',
        statusTone: advancedEffectControls.value.atmosphere || advancedEffectControls.value.fog ? 'success' : 'neutral',
        controls: [
            { id: 'fog', label: '高度雾', type: 'toggle', value: advancedEffectControls.value.fog },
            { id: 'hbao', label: '微阴影', type: 'toggle', value: advancedEffectControls.value.hbao },
            { id: 'tiltShift', label: '移轴', type: 'toggle', value: advancedEffectControls.value.tiltShift },
            { id: 'atmosphere', label: '大气', type: 'toggle', value: advancedEffectControls.value.atmosphere },
        ],
    },
    {
        id: 'wind',
        title: '模拟风场',
        description: 'WebGL2 粒子风场',
        status: wind2D.value ? '已加载' : '未加载',
        statusTone: wind2D.value ? 'success' : 'neutral',
        actions: [
            { id: 'load', label: wind2D.value ? '重新加载' : '加载风场', variant: 'primary' },
            { id: 'clear', label: '清除', variant: 'danger', disabled: !wind2D.value },
        ],
        controls: [
            {
                id: 'speedFactor',
                label: '速度因子',
                type: 'range',
                min: 0.1,
                max: 5,
                step: 0.1,
                value: windParams.value.speedFactor,
                displayValue: windParams.value.speedFactor.toFixed(1),
                disabled: !wind2D.value,
            },
            {
                id: 'arrowLength',
                label: '箭头长度',
                type: 'range',
                min: 5000,
                max: 50000,
                step: 1000,
                value: windParams.value.arrowLength,
                displayValue: `${Math.round(windParams.value.arrowLength / 1000)} km`,
                disabled: !wind2D.value,
            },
            {
                id: 'trailLength',
                label: '尾迹长度',
                type: 'range',
                min: 5000,
                max: 80000,
                step: 1000,
                value: windParams.value.trailLength,
                displayValue: `${Math.round(windParams.value.trailLength / 1000)} km`,
                disabled: !wind2D.value,
            },
            {
                id: 'alphaFactor',
                label: '透明度',
                type: 'range',
                min: 0.1,
                max: 1,
                step: 0.05,
                value: windParams.value.alphaFactor,
                displayValue: windParams.value.alphaFactor.toFixed(2),
                disabled: !wind2D.value,
            },
        ],
    },
    {
        id: 'fluid',
        title: '水体流体',
        description: '点击地形捕捉高度图并生成水体',
        status: fluidState.value.isPicking ? '等待选点' : fluidState.value.hasFluid ? '已创建' : '未创建',
        statusTone: fluidState.value.isPicking ? 'warning' : fluidState.value.hasFluid ? 'success' : 'neutral',
        actions: [
            {
                id: 'pick',
                label: fluidState.value.isPicking ? '等待选点' : '捕捉高度图',
                variant: 'primary',
                active: fluidState.value.isPicking,
            },
            {
                id: 'clear',
                label: '清除',
                variant: 'danger',
                disabled: !fluidState.value.hasFluid && !fluidState.value.isPicking,
            },
        ],
        controls: [
            {
                id: 'threshold',
                label: '阈值',
                type: 'range',
                min: 0,
                max: 500,
                step: 0.0001,
                value: fluidParams.value.threshold,
                displayValue: Number(fluidParams.value.threshold).toFixed(2),
            },
            {
                id: 'blend',
                label: '混合',
                type: 'range',
                min: 0,
                max: 50,
                step: 0.0001,
                value: fluidParams.value.blend,
                displayValue: Number(fluidParams.value.blend).toFixed(2),
            },
            {
                id: 'lightStrength',
                label: '光强',
                type: 'range',
                min: 0,
                max: 10,
                step: 0.0001,
                value: fluidParams.value.lightStrength,
                displayValue: Number(fluidParams.value.lightStrength).toFixed(2),
            },
        ],
    },
]);

// --- 生命周期 ---
onMounted(() => {
    bootCesium();
});

watch(activeBasemap, (value) => {
    if (!viewer || !Cesium) return;
    applyBasemap(value);
});

watch(activeTerrain, async (value) => {
    if (!viewer || !Cesium) return;
    await applyTerrain(value);
});

function clearWind2D() {
    if (!wind2D.value) return;
    try {
        viewer?.scene?.primitives?.remove(wind2D.value);
    } catch (e) {
        console.warn('Wind2D primitive remove warning:', e);
    }
    wind2D.value.destroy();
    wind2D.value = null;
}

function clearWTFS() {
    if (!wtfs) return;
    try {
        wtfs.destroy();
    } catch (e) {
        console.warn('WTFS destroy warning:', e);
    }
    wtfs = null;
}

onUnmounted(() => {
    cesiumReady.value = false;
    if (handler) {
        handler.destroy();
        handler = null;
    }
    clearWind2D();
    clearWTFS();
    if (creditCheckIntervalId) {
        clearInterval(creditCheckIntervalId);
        creditCheckIntervalId = null;
    }
    if (creditOverrideStyleEl) {
        creditOverrideStyleEl.remove();
        creditOverrideStyleEl = null;
    }
    if (viewer) {
        try {
            viewer.destroy();
        } catch (e) {
            console.warn('Cesium viewer destroy warning:', e);
        }
        viewer = null;
    }
});

// --- 核心功能函数 ---

async function bootCesium() {
    showLoading('正在初始化 3D 场景...');
    try {
        await loadCesiumRuntime();
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
        if (activeBasemap.value === 'tianditu' && !wtfs) {
            console.warn('WTFS label initialization failed.');
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

function getViewer() {
    return viewer;
}

function getCesium() {
    return Cesium || window.Cesium;
}

async function loadCesiumRuntime() {
    if (!window.CESIUM_BASE_URL) {
        window.CESIUM_BASE_URL = CESIUM_BASE_URL;
    }
    await loadStyleOnce(CESIUM_CSS_URL, 'cesium-widgets-style');
    await loadScriptOnce(CESIUM_JS_URL, 'cesium-runtime-script');
    Cesium = window.Cesium;
    if (!Cesium) throw new Error('Cesium global 未找到');
}

function initViewer() {
    const mapCtor = typeof Cesium.Map === 'function' ? Cesium.Map : Cesium.Viewer;
    viewer = new mapCtor('cesiumContainer', {
        imageryProvider: false,
        terrainProvider: undefined,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        selectionIndicator: false,
        timeline: false,
        animation: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        shouldAnimate: true,
    });

    flyToHome(0);

    if (viewer._cesiumWidget?._creditContainer) {
        viewer._cesiumWidget._creditContainer.style.display = 'none';
    }

    viewer.scene.globe.terrainExaggeration = 1;
    viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.depthTestAgainstTerrain = true;

    const hideCreditsAggressive = () => {
        if (viewer._cesiumWidget?._creditContainer) {
            viewer._cesiumWidget._creditContainer.style.cssText =
                'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important;';
            viewer._cesiumWidget._creditContainer.innerHTML = '';
        }
        const creditElems = document.querySelectorAll(
            '[class*="credit"], [class*="geostar"], [class*="GeoStar"]',
        );
        creditElems.forEach((el) => {
            el.style.cssText = 'display: none !important; visibility: hidden !important;';
            el.innerHTML = '';
        });
        if (viewer.scene && viewer.scene.frameState && viewer.scene.frameState.creditDisplay) {
            viewer.scene.frameState.creditDisplay.hasCredits = () => false;
            viewer.scene.frameState.creditDisplay.destroy = () => {};
        }
    };
    hideCreditsAggressive();

    creditCheckIntervalId = setInterval(() => {
        const creditContainer = document.querySelector('.cesium-credit-container');
        if (creditContainer && creditContainer.innerHTML.length > 0) {
            creditContainer.innerHTML = '';
            creditContainer.style.cssText =
                'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important;';
        }
    }, 500);

    if (!document.getElementById('cesium-credit-override')) {
        const style = document.createElement('style');
        style.id = 'cesium-credit-override';
        style.textContent = `
      .cesium-credit-container { display: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; }
      .cesium-credit-text { display: none !important; visibility: hidden !important; }
      .cesium-credit-logo-link { display: none !important; visibility: hidden !important; }
      [class*="credit"] { display: none !important; visibility: hidden !important; }
    `;
        document.head.appendChild(style);
        creditOverrideStyleEl = style;
    }
}

function setupInteractions() {
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    
    // Mouse move: update coordinate display
    handler.setInputAction((movement) => {
        const ray = viewer.camera.getPickRay(movement.endPosition);
        if (!ray) return;
        const position = viewer.scene.globe.pick(ray, viewer.scene);
        if (position) {
            const cartographic = Cesium.Cartographic.fromCartesian(position);
            const lng = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
            const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
            const height = cartographic.height.toFixed(2);
            coordinateDisplay.value = `经度: ${lng}, 纬度: ${lat}, 海拔: ${height}米`;
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    
    // Right mouse drag: free camera rotation (no pitch constraints)
    handler.setInputAction((movement) => {
        const deltaMove = movement.endPosition;
        const startPosition = movement.startPosition;
        
        if (!Cesium.defined(viewer.terrainProvider)) {
            return;
        }
        
        const ellipsoid = viewer.scene.globe.ellipsoid;
        const cartesian = viewer.camera.pickEllipsoid(startPosition, ellipsoid);
        if (!cartesian) {
            // Rotate around center of globe
            const camera = viewer.camera;
            const moveRate = 0.002;
            camera.rotate(Cesium.Cartesian3.UNIT_X, -moveRate * (deltaMove.y - startPosition.y));
            camera.rotate(Cesium.Cartesian3.UNIT_Y, -moveRate * (deltaMove.x - startPosition.x));
        }
    }, Cesium.ScreenSpaceEventType.RIGHT_DRAG);
    
    // Disable default right-click zoom behavior by handling right-down and right-up
    handler.setInputAction(() => {
        // Prevent default zoom on right click
    }, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
    handler.setInputAction(() => {
        // Prevent default zoom on right click
    }, Cesium.ScreenSpaceEventType.RIGHT_UP);
}

function addBaseImageryLayers() {
    return applyBasemap(activeBasemap.value);
}

function clearBaseImageryLayers() {
    if (!viewer?.imageryLayers) return;

    while (imageryLayerHandles.length) {
        const layer = imageryLayerHandles.pop();
        try {
            viewer.imageryLayers.remove(layer, true);
        } catch (error) {
            console.warn('Imagery layer remove warning:', error);
        }
    }
}

function createTiandituImageryProviders() {
    return [
        new Cesium.UrlTemplateImageryProvider({
            url: `${TDT_SERVICE_ROOT}DataServer?T=img_w&x={x}&y={y}&l={z}&tk=${TDT_TOKEN}`,
            subdomains: TDT_SUBDOMAINS,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 18,
        }),
        new Cesium.UrlTemplateImageryProvider({
            url: `${TDT_SERVICE_ROOT}DataServer?T=ibo_w&x={x}&y={y}&l={z}&tk=${TDT_TOKEN}`,
            subdomains: TDT_SUBDOMAINS,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 10,
        }),
    ];
}

function createGoogleImageryProviders() {
    return [
        new Cesium.UrlTemplateImageryProvider({
            url: `${BACKEND_BASE_URL}/proxy/mt{s}.google.com/vt?lyrs=s&x={x}&y={y}&z={z}`,
            subdomains: ['0', '1', '2', '3'],
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 20,
        }),
    ];
}

function applyBasemap(value) {
    if (!viewer || !Cesium) return false;

    try {
        clearBaseImageryLayers();
        const providers = value === 'google' ? createGoogleImageryProviders() : createTiandituImageryProviders();
        providers.forEach((provider) => {
            imageryLayerHandles.push(viewer.imageryLayers.addImageryProvider(provider));
        });

        if (value === 'tianditu') {
            initTdtLabels();
        } else {
            clearWTFS();
        }

        viewer.scene.requestRender?.();
        return true;
    } catch (error) {
        message.error('地图源切换失败', error);
        return false;
    }
}

function initCustomTerrain() {
    return applyTerrain(activeTerrain.value);
}

async function applyTerrain(value) {
    if (!viewer || !Cesium) return false;

    const switchId = ++terrainSwitchId;

    if (value === 'ellipsoid') {
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.requestRender?.();
        return true;
    }

    if (value === 'cesiumWorld') {
        try {
            const worldTerrain = await createCesiumWorldTerrainProvider();
            if (switchId !== terrainSwitchId) return false;

            viewer.terrainProvider = worldTerrain;
            viewer.scene.globe.depthTestAgainstTerrain = true;
            viewer.scene.requestRender?.();
            return true;
        } catch (error) {
            if (switchId !== terrainSwitchId) return false;

            viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            viewer.scene.globe.depthTestAgainstTerrain = false;
            message.warning('Cesium 世界地形加载失败，已降级为平面地形。', { closable: true });
            message.error('Cesium 世界地形初始化失败', error);
            return false;
        }
    }

    const GeoTerrainProvider = createGeoTerrainProvider(Cesium);
    try {
        viewer.terrainProvider = new GeoTerrainProvider({
            url: `${TDT_SERVICE_ROOT}mapservice/swdx?T=elv_c&tk={token}&x={x}&y={y}&l={z}`,
            subdomains: TDT_SUBDOMAINS,
            token: TDT_TOKEN,
        });
        viewer.scene.globe.depthTestAgainstTerrain = true;
        viewer.scene.requestRender?.();
        return true;
    } catch (error) {
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        viewer.scene.globe.depthTestAgainstTerrain = false;
        message.warning('官方地形服务加载失败，已降级为椭球地形。', { closable: true });
        message.error('官方地形初始化失败', error);
        return false;
    }
}

async function createCesiumWorldTerrainProvider() {
    if (CESIUM_ION_TOKEN && Cesium.Ion) {
        Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
    }

    const terrainOptions = {
        requestWaterMask: false,
        requestVertexNormals: true,
    };

    if (typeof Cesium.createWorldTerrainAsync === 'function') {
        return Cesium.createWorldTerrainAsync(terrainOptions);
    }

    if (typeof Cesium.createWorldTerrain === 'function') {
        return Cesium.createWorldTerrain(terrainOptions);
    }

    if (typeof Cesium.CesiumTerrainProvider?.fromIonAssetId === 'function') {
        return Cesium.CesiumTerrainProvider.fromIonAssetId(1, terrainOptions);
    }

    if (Cesium.IonResource?.fromAssetId && Cesium.CesiumTerrainProvider) {
        const ionResource = await Cesium.IonResource.fromAssetId(1);
        return new Cesium.CesiumTerrainProvider({
            url: ionResource,
            ...terrainOptions,
        });
    }

    throw new Error('当前 Cesium 运行时不支持在线世界地形。');
}

function initTdtLabels() {
    if (wtfs) return true;

    try {
        const GeoWTFS = createGeoWTFS(Cesium);
        wtfs = new GeoWTFS(viewer, {
            subdomains: TDT_SUBDOMAINS,
            url: `${TDT_SERVICE_ROOT}mapservice/GetTiles?lxys={z},{x},{y}&tk=${TDT_TOKEN}&VERSION=1.0.0`,
            icoUrl: `${TDT_SERVICE_ROOT}mapservice/GetIcon?id={id}&tk=${TDT_TOKEN}`,
            metadata: TDT_LABEL_METADATA,
            aotuCollide: true,
            collisionPadding: [5, 10, 8, 5],
            serverFirstStyle: true,
            labelGraphics: {
                font: '28px sans-serif',
                fontSize: 28,
                fillColor: Cesium.Color.WHITE,
                scale: 0.5,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 5,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: false,
                backgroundColor: Cesium.Color.RED,
                backgroundPadding: new Cesium.Cartesian2(10, 10),
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                eyeOffset: new Cesium.Cartesian3(0, 0, 10),
                pixelOffset: Cesium.Cartesian2.ZERO,
            },
            billboardGraphics: {
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                eyeOffset: Cesium.Cartesian3.ZERO,
                pixelOffset: Cesium.Cartesian2.ZERO,
                alignedAxis: Cesium.Cartesian3.ZERO,
                color: Cesium.Color.WHITE,
                rotation: 0,
                scale: 1,
                width: 18,
                height: 18,
            },
        });
        wtfs.initTDT(TDT_LABEL_INIT_TILES, () => {
            viewer.scene.requestRender();
        });
        return true;
    } catch (error) {
        console.warn('WTFS init error:', error);
        return false;
    }
}

// --- 风场集成代码 ---
/**
 * 生成一个覆盖中国区域的模拟风场数据
 * 用于快速验证效果，实际项目中应替换为真实 API 数据
 */
function generateSimulatedWindData() {
    const centerLon = 104.0; // 中国几何中心
    const centerLat = 35.0;
    const layerCount = 5;
    const altitudes = [0, 2000, 5000, 10000, 15000]; // 不同高度层（海拔米）
    const sizeMesh = [30000, 30000, 25000, 25000, 20000]; // 网格间距（米）
    const counts = [30, 30, 25, 25, 20]; // 各层网格分辨率 (nx=ny)

    const totalPoints = counts.reduce((sum, c) => sum + c * c, 0);
    const hspeed = new Array(totalPoints);
    const hdir = new Array(totalPoints);
    const vspeed = new Array(totalPoints);

    let offset = 0;
    for (let k = 0; k < layerCount; k++) {
        const nx = counts[k];
        const ny = counts[k];
        const gridSize = sizeMesh[k];
        // 模拟一个旋转风场 + 噪声
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const idx = offset + j * nx + i;
                // 生成位置偏移（相对于中心，单位：度）
                const dx = (i - nx / 2) * (gridSize / 111320.0);
                const dy =
                    (j - ny / 2) *
                    (gridSize / 111320.0 / Math.cos(Cesium.Math.toRadians(centerLat)));
                // 风向：绕中心旋转 + 随机扰动
                const baseAngle = Math.atan2(dy, dx) + Math.PI / 2; // 逆时针旋转
                const angle = baseAngle + 0.2 * Math.sin(i * 0.5) * Math.cos(j * 0.5);
                hdir[idx] = Cesium.Math.toDegrees(angle) % 360;
                // 风速：随高度增加，中心附近更大
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = 15; // 约15度范围
                const factor = Math.max(0, 1 - dist / maxDist);
                hspeed[idx] = (5 + k * 2) * factor + 2 * Math.random();
                vspeed[idx] = 0.5 * Math.sin(i * 0.3) * Math.cos(j * 0.3);
            }
        }
        offset += nx * ny;
    }

    return {
        longitude: centerLon,
        latitude: centerLat,
        altitude: altitudes,
        sizeMesh: sizeMesh,
        count: counts,
        hspeed: hspeed,
        hdir: hdir,
        vspeed: vspeed,
    };
}

/**
 * 点击按钮加载风场
 */
function loadSimulatedWind() {
    if (!viewer || !Cesium) {
        message.error('Cesium 尚未初始化');
        return;
    }

    // 如果已有实例则先销毁
    clearWind2D();

    const data = generateSimulatedWindData();

    // 创建 Wind2D 实例（与面板参数同步）
    wind2D.value = new Wind2D(viewer, {
        maxWindSpeed: 20, // 最大风速（用于归一化）
        cesium: Cesium,
        speedFactor: windParams.value.speedFactor,
        arrowLength: windParams.value.arrowLength,
        trailLength: windParams.value.trailLength,
        alphaFactor: windParams.value.alphaFactor,
    });

    // 加载数据，内部会自动设置粒子数
    wind2D.value.loadData(data);

    // 按 Cesium Primitive 协议注册到场景渲染管线
    viewer.scene.primitives.add(wind2D.value);

    // 飞到风场中央
    wind2D.value.flyTo();

    message.success('风场加载成功，可通过下方滑块调节样式');
}

/**
 * 滑块参数变化时，实时更新 Wind2D 实例
 */
function applyWindParams() {
    if (!wind2D.value) return;
    wind2D.value.speedFactor = windParams.value.speedFactor;
    wind2D.value.arrowLength = windParams.value.arrowLength;
    wind2D.value.trailLength = windParams.value.trailLength;
    wind2D.value.alphaFactor = windParams.value.alphaFactor;
}

function handleToolAction({ moduleId, actionId }) {
    const actionMap = {
        scene: {
            home: () => flyToHome(),
            everest: flyToEverest,
            tileset: loadCustomTileset,
        },
        wind: {
            load: loadSimulatedWind,
            clear: clearWind2D,
        },
        fluid: {
            pick: () => fluidPanelRef.value?.startPickHeightMap?.(),
            clear: () => fluidPanelRef.value?.clearFluid?.(),
        },
    };

    actionMap[moduleId]?.[actionId]?.();
}

function handleToolControlChange({ moduleId, controlId, value }) {
    if (moduleId === 'effects' && controlId in advancedEffectControls.value) {
        advancedEffectControls.value = {
            ...advancedEffectControls.value,
            [controlId]: Boolean(value),
        };
        return;
    }

    if (moduleId === 'wind' && controlId in windParams.value) {
        windParams.value = {
            ...windParams.value,
            [controlId]: Number(value),
        };
        applyWindParams();
        return;
    }

    if (moduleId === 'fluid' && controlId in fluidParams.value) {
        fluidParams.value = {
            ...fluidParams.value,
            [controlId]: Number(value),
        };
    }
}

function handleFluidStateChange(state) {
    fluidState.value = {
        isPicking: !!state?.isPicking,
        hasFluid: !!state?.hasFluid,
        selectedText: state?.selectedText || '',
    };
}

// --- 辅助工具函数 ---
function loadScriptOnce(url, id) {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById(id);
        if (existing) {
            if (existing.getAttribute('data-loaded') === 'true') {
                resolve();
                return;
            }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`脚本加载失败: ${url}`)), {
                once: true,
            });
            return;
        }
        const script = document.createElement('script');
        script.id = id;
        script.src = url;
        script.async = true;
        script.onload = () => {
            script.setAttribute('data-loaded', 'true');
            resolve();
        };
        script.onerror = () => reject(new Error(`脚本加载失败: ${url}`));
        document.head.appendChild(script);
    });
}

function loadStyleOnce(url, id) {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById(id);
        if (existing) {
            resolve();
            return;
        }
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = url;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`样式加载失败: ${url}`));
        document.head.appendChild(link);
    });
}

function flyToHome(param) {
    if (!viewer) return;
    const duration = typeof param === 'number' ? param : 2;
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(104.1954, 35.8617, 15000000),
        orientation: {
            heading: 0.0,
            pitch: -Cesium.Math.PI_OVER_TWO,
            roll: 0.0,
        },
        duration: duration,
    });
}

function flyToEverest() {
    if (!viewer) return;
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(86.925, 27.9881, 9000),
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-25.0),
            roll: 0.0,
        },
        duration: 3,
    });
}

async function loadCustomTileset() {
    if (!viewer) return;
    try {
        const tileset = await Cesium.Cesium3DTileset.fromUrl(
            'https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/master/1.0/TilesetWithDiscreteLOD/tileset.json',
        );
        viewer.scene.primitives.add(tileset);
        viewer.flyTo(tileset, {
            duration: 3,
            offset: new Cesium.HeadingPitchRange(
                Cesium.Math.toRadians(0.0),
                Cesium.Math.toRadians(-25.0),
                tileset.boundingSphere.radius * 2.5,
            ),
        });
    } catch (error) {
        message.error(`加载模型失败: ${error}`);
        message.error('加载3D模型失败，可能是网络原因无法访问 GitHub 资源。', {
            closable: true,
            duration: 6500,
        });
    }
}
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
    bottom: 20px;
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
        bottom: 15px;
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
</style>
