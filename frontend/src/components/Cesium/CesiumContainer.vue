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
        @data-flyto="handleDataFlyTo"
        @data-reposition="handleDataReposition"
        @data-stretch-height="handleDataStretchHeight"
        @data-set-height="handleDataSetHeight"
        @import-tileset-zip="handleImportTilesetZip"
        @import-tileset-folder="handleImportTilesetFolder"
        @import-tileset-sample="handleImportTilesetSample"
        @data-set-material="handleDataSetMaterial"
    />

    <!-- 人物漫游操作提示面板 -->
    <PlayerGuidePanel
        :visible="playerController.isActive.value && showPlayerGuide"
        :is-first-person="playerController.isFirstPerson.value"
        :is-flying="playerController.isFlying.value"
        @close="showPlayerGuide = false"
    />

    <!-- 漫游导航 HUD（科幻风格，有目标即显示） -->
    <NavGuideHUD
        v-if="playerController.navTarget.value"
        :nav-target="playerController.navTarget.value"
    />

    <!-- 导航目标选择弹窗（搜索/数据要素/地图点选） -->
    <NavTargetPicker
        :visible="navPickerVisible"
        @close="navPickerVisible = false"
        @select="handleNavTargetSelect"
    />

    <!-- GLTF/GLB 坐标输入/调整弹窗 -->
    <CesiumDataImportDialog
        :visible="!!pendingGltfFile || !!repositionTarget"
        :file-name="repositionTarget?.name || pendingGltfFile?.name || ''"
        :initial-coords="repositionTarget?.position || null"
        :mode="repositionTarget ? 'reposition' : 'import'"
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

    <!-- 坐标显示面板（固定右下角，只显示文字） -->
    <div v-if="bootComplete" class="coordinate-display">{{ activeCoordinateDisplay }}</div>

</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { BACKEND_BASE_URL, apiGetRuntimeDefaults } from '../../api/backend';
import { URL_LAYER_OPTIONS } from '../../constants/basemap/basemapResolver';
import { useMessage } from '../../composables/useMessage';
import { showLoading, hideLoading } from '../../utils/ui/loading';
import { Upload } from 'lucide-vue-next';
import CesiumAdvancedEffects from './CesiumAdvancedEffects.vue';
import CesiumToolPanel from './CesiumToolPanel.vue';
import CesiumDataImportDialog from './CesiumDataImportDialog.vue';
import FluidSimulationPanel from './FluidSimulation/FluidSimulationPanel.vue';
import ShallowWaterOverlay from './ShallowWater/ShallowWaterOverlay.vue';

// cesium-navigation 导航控件样式（含高对比度深色主题）
import './cesium-navigation/styles/cesium-navigation.css';

import { configureSolarLighting } from './composables/scene/cesiumAtmosphere';
import { loadCesiumRuntime } from './composables/core/cesiumRuntime';
import { configureBeijingTimeSystem } from './composables/core/cesiumTimeSystem';
import { useCesiumCreditHider } from './composables/scene/useCesiumCreditHider';
import { useCesiumNavigation } from './composables/core/useCesiumNavigation';
import { useCesiumInteractions } from './composables/interaction/useCesiumInteractions';
import { initRequestRenderMode } from './composables/interaction/useCesiumRenderMode';
import { useCesiumLayers } from './composables/layers/useCesiumLayers';
import { useCesiumSceneActions } from './composables/camera/useCesiumSceneActions';
import { useCesiumDataImport } from './composables/dataImport/useCesiumDataImport';
import { createCesiumDataOpsHandlers } from './composables/dataImport/useCesiumDataOpsHandlers';
import { useCesiumToolModules } from './composables/toolModules/useCesiumToolModules';
import { useCesiumLayersStore } from '../../stores/layer/cesiumLayers';
import { readCachedPreferredBasemap } from '../../stores/useUserPreferencesStore';
import { setRecordVisible, setRecordOpacity } from './composables/dataImport/dataSourceDisplay';
import { setupCloudIntegration } from './Cloud';
import { useCesiumUrlTracking } from './composables/layers/useCesiumUrlTracking';
import { useCesiumWind } from './cesium-wind-layer/useCesiumWind';
import { useCesiumModelManager } from './composables/models/useCesiumModelManager';
import { useCesiumCameraEnhanced } from './composables/camera/useCesiumCameraEnhanced';
import { createCesiumAttrViewExtentSync } from './composables/camera/useCesiumAttrViewExtentSync';
import { useCesiumHeightSampler } from './composables/terrain/useCesiumHeightSampler';
import { usePlayerController } from './PlayerController/usePlayerController';
import PlayerGuidePanel from './PlayerController/PlayerGuidePanel.vue';
import NavGuideHUD from './PlayerController/NavGuideHUD.vue';
import NavTargetPicker from './PlayerController/NavTargetPicker.vue';
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

/** 漫游模式操作提示面板显示状态 */
const showPlayerGuide = ref(true);
/** 导航目标选择弹窗可见性 */
const navPickerVisible = ref(false);
const cesiumReady = ref(false);
/** bootCesium 完成标志：完成后才显示右下角坐标 */
const bootComplete = ref(false);
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
const { initNavigation, cleanupNavigation } = useCesiumNavigation({ getViewer, getCesium });
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

// ==========================================
// tellux 移植模块：模型管理、相机增强、高度采样
// ==========================================
const modelManager = useCesiumModelManager({ getViewer, getCesium, message });
const cameraEnhanced = useCesiumCameraEnhanced({ getViewer, getCesium });
const heightSampler = useCesiumHeightSampler({ getViewer, getCesium });

// B4：相机视域 → 属性表「视图筛选范围」同步（moveEnd 喂 attrStore，3D 模式视图筛选生效）
const attrViewExtentSync = createCesiumAttrViewExtentSync({ getViewer, getCesium });

const dataImport = useCesiumDataImport({
    getViewer,
    getCesium,
    message,
    heightSampler,
});

// ==========================================
// 统一图层管理：元数据店同步 + 场景操作 adapter
// 「元数据入店、句柄留场」：store 只存元数据，句柄操作经此处注册的回调触达
// ==========================================
const cesiumLayersStore = useCesiumLayersStore();

/** 按 id 查 loadedDataSources 句柄记录 */
function findImportRecord(id) {
    return (dataImport.loadedDataSources.value || []).find((item) => item.id === id) || null;
}

// 导入列表 → 元数据店差量同步（新增建档/删除销档，保留用户改过的 visible/opacity）
watch(
    () => dataImport.loadedDataSources.value,
    (list) => {
        cesiumLayersStore.syncFromImport(
            (list || []).map((item) => ({ id: item.id, name: item.name, type: item.type })),
        );
    },
    { immediate: true, deep: false },
);

// 注册场景操作 adapter（store action → 句柄）
cesiumLayersStore.registerAdapter({
    setVisible(id, visible) {
        const record = findImportRecord(id);
        if (!record) return;
        setRecordVisible(getCesium(), record, visible);
        getViewer()?.scene?.requestRender?.();
    },
    setOpacity(id, opacity) {
        const record = findImportRecord(id);
        if (!record) return;
        // 矢量类经 rAF 合并异步应用，onApplied 补一次渲染保证按需渲染模式即时生效
        setRecordOpacity(getCesium(), record, opacity, () => {
            getViewer()?.scene?.requestRender?.();
        });
        getViewer()?.scene?.requestRender?.();
    },
    flyTo(id) {
        dataImport.flyToDataSource(id);
    },
    remove(id) {
        dataImport.removeDataSource(id);
    },
});

// ==========================================
// 人物漫游控制器（第一/第三人称视角）
// ==========================================
const playerController = usePlayerController({ getViewer, getCesium, message });

// 注册导航弹窗打开回调
playerController.setOpenNavDialogHandler(() => {
    navPickerVisible.value = true;
});

/**
 * 处理导航目标来源选择
 * @param {'search' | 'data' | 'pick'} type
 */
function handleNavTargetSelect(type) {
    if (type === 'pick') {
        playerController.startNavPick();
    } else if (type === 'search') {
        message.info('请使用顶部搜索框搜索地点，搜索结果将自动设为导航目标');
    } else if (type === 'data') {
        message.info('请点击已导入的数据要素，将自动设为导航目标');
        // 进入数据要素点选模式（复用 startNavPick，它已支持 entity 检测）
        playerController.startNavPick();
    }
}

/**
 * 相机姿态（方位角/俯仰角/翻滚角），由 scene.postRender 每帧更新
 */
const cameraAttitude = ref({ heading: 0, pitch: 0, roll: 0, height: 0 });
let cleanupAttitudeListener = null;

/**
 * 坐标显示：漫游模式下显示人物三维坐标+实时速度，否则显示鼠标位置
 * 移动端固定拆为「位置 / 姿态 / 相机海拔」三行，避免窄屏自动折叠成两行。
 */
const activeCoordinateDisplay = computed(() => {
    const att = cameraAttitude.value;
    const attitudeLine = `方位: ${att.heading.toFixed(1)}° 俯仰: ${att.pitch.toFixed(1)}° 翻滚: ${att.roll.toFixed(1)}°`;
    const cameraHeightLine = `相机海拔: ${att.height.toFixed(1)}米`;
    const attStr = `${attitudeLine} | ${cameraHeightLine}`;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    const pos = playerController.playerPosition.value;
    if (pos) {
        const lng = pos.lng.toFixed(6);
        const lat = pos.lat.toFixed(6);
        const height = pos.height.toFixed(2);
        const speed = playerController.playerSpeed.value;
        const speedStr = speed > 0.1 ? ` | 速度: ${speed.toFixed(1)} m/s` : '';
        const coordLine = `经度: ${lng}, 纬度: ${lat}`;
        const altLine = `海拔: ${height}米${speedStr}`;
        if (isMobile) {
            return `${coordLine}, ${altLine}\n${attitudeLine}\n${cameraHeightLine} (漫游)`;
        }
        return `${coordLine}, ${altLine} | ${attStr} (漫游)`;
    }

    const coord = coordinateDisplay.value;
    if (isMobile) {
        return `${coord}\n${attitudeLine}\n${cameraHeightLine}`;
    }
    if (coord.includes('--')) {
        return attStr;
    }
    return `${coord} | ${attStr}`;
});

// 漫游模式启动时：关闭高级控制台 + 显示键位提示面板
watch(() => playerController.isActive.value, (active) => {
    if (active) {
        showPlayerGuide.value = true;
        cesiumToolPanelOpen.value = false;
    }
});

/**
 * Capture the Cesium camera and basemap directly from the runtime.
 * This intentionally does not wait for camera.moveEnd or URL synchronization.
 * @returns {Record<string, unknown>|null}
 */
function getCurrentViewState() {
    const runtimeViewer = getViewer();
    const runtimeCesium = getCesium();
    const camera = runtimeViewer?.camera;
    const position = camera?.positionCartographic;
    if (!runtimeViewer || !runtimeCesium || !camera || !position) return null;

    const basemapId = String(activeBasemap.value || '').trim() || null;
    const layerIndex = basemapId ? URL_LAYER_OPTIONS.indexOf(basemapId) : -1;
    const basemapLabel = basemapId
        ? basemapOptions.value.find((option) => option.value === basemapId)?.label || basemapId
        : null;

    return {
        view: 'cesium',
        center: {
            lng: runtimeCesium.Math.toDegrees(position.longitude),
            lat: runtimeCesium.Math.toDegrees(position.latitude),
        },
        cesium: {
            cameraHeight: position.height,
            heading: runtimeCesium.Math.toDegrees(camera.heading),
            pitch: runtimeCesium.Math.toDegrees(camera.pitch),
            roll: runtimeCesium.Math.toDegrees(camera.roll),
        },
        basemap: {
            index: layerIndex >= 0 ? layerIndex : null,
            id: basemapId,
            label: basemapLabel,
        },
    };
}

/**
 * Wait until consecutive Cesium camera samples remain stable.
 * This covers camera.flyTo, wheel inertia, cancellation and viewer destruction.
 * @param {{timeoutMs?: number, stableMs?: number}} options
 * @returns {Promise<{status: 'idle'|'timeout'|'destroyed'}>}
 */
function waitForViewIdle({ timeoutMs = 2500, stableMs = 120 } = {}) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        let previousSignature = null;
        let stableSince = null;

        const check = () => {
            const runtimeViewer = getViewer();
            if (!runtimeViewer || runtimeViewer.isDestroyed?.()) {
                resolve({ status: 'destroyed' });
                return;
            }

            const state = getCurrentViewState();
            if (!state?.center || !state.cesium) {
                resolve({ status: 'destroyed' });
                return;
            }

            const signature = [
                state.center.lng,
                state.center.lat,
                state.cesium.cameraHeight,
                state.cesium.heading,
                state.cesium.pitch,
                state.cesium.roll,
            ];
            const stable = previousSignature
                && signature.every((value, index) => {
                    const tolerance = index === 2 ? 0.05 : index < 2 ? 0.0000001 : 0.005;
                    return Math.abs(value - previousSignature[index]) <= tolerance;
                });

            const now = Date.now();
            if (stable) {
                stableSince ??= now;
                if (now - stableSince >= stableMs) {
                    resolve({ status: 'idle' });
                    return;
                }
            } else {
                stableSince = null;
            }
            previousSignature = signature;

            if (now - startedAt >= timeoutMs) {
                resolve({ status: 'timeout' });
                return;
            }
            setTimeout(check, 32);
        };

        check();
    });
}

async function setBasemapById(presetId) {
    const normalizedPresetId = String(presetId || '').trim();
    const exists = basemapOptions.value.some((option) => option.value === normalizedPresetId);
    if (!exists || !getViewer() || !getCesium()) return false;

    if (activeBasemap.value === normalizedPresetId) {
        const applied = layers.applyBasemap(normalizedPresetId);
        if (applied) syncBasemapToUrl(normalizedPresetId);
        return !!applied;
    }

    activeBasemap.value = normalizedPresetId;
    await nextTick();
    return activeBasemap.value === normalizedPresetId;
}

defineExpose({
    getViewer,
    getCesium,
    getCurrentViewState,
    waitForViewIdle,
    setBasemapById,
    activeBasemap,
    modelManager,
    cameraEnhanced,
    heightSampler,
    playerController,
});

/**
 * 响应式转发：使用 computed 包装 loadedDataSources，
 * 避免在模板里写 dataImport.loadedDataSources.value（解包时不会响应化）。
 */
const loadedDataSourcesForPanel = computed(() => dataImport.loadedDataSources.value);
const pendingGltfFile = computed(() => dataImport.pendingGltfFile.value);
const repositionTarget = computed(() => dataImport.repositionTarget?.value);

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

    try {
        await dataImport.loadDataFiles(Array.from(files));
    } catch (err) {
        console.warn('[Cesium] file import error:', err);
    }
}

const {
    toolPanelOpen: cesiumToolPanelOpen,
    advancedEffectControls,
    fluidParams,
    baseAtmosphereParams,
    atmosphereParams,
    cloudParams,
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
    playerController,
    // 三维分析（通视/限高）运行时依赖：viewer 与 Cesium 命名空间注入
    getViewer,
    getCesium,
});

/** 启动中标志，防止并发 bootCesium 调用 */
let bootInProgress = false;

/** token 重试硬上限，防止动态 maxRetryCount 无限增长 */
const MAX_TOKEN_RETRY = 5;

async function bootCesium() {
    if (bootInProgress) {
        console.warn('[Cesium][boot] skipped — already in progress');
        return;
    }
    bootInProgress = true;
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
                maxRetryCount = Math.min(MAX_TOKEN_RETRY, Math.max(
                    maxRetryCount,
                    Array.isArray(runtimeMapTokens.value.tiandituTokens)
                        ? runtimeMapTokens.value.tiandituTokens.length
                        : 1,
                    Array.isArray(runtimeMapTokens.value.cesiumIonTokens)
                        ? runtimeMapTokens.value.cesiumIonTokens.length
                        : 1,
                    1,
                ));
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
                // B4：viewer 就绪后开始喂属性表视图筛选范围（start 内含首帧同步）
                attrViewExtentSync.start();
                // 1) 先从 URL 恢复底图预设：URL l= 参数优先级最高，确保分享链接可重现同一底图
                const restoredFromUrl = restoreBasemapFromUrl();
                // 2) 仅在 URL 无 l 时才应用默认底图，优先级：用户偏好 > 管理员全局默认
                //    （避免 activeBasemap 反复赋值造成的冗余 URL 写入与底图闪烁）
                if (!restoredFromUrl) {
                    // 2a) 用户偏好（账号中心-偏好设置；preset id 与 2D 共用同一体系）
                    const preferredBasemapId = readCachedPreferredBasemap();
                    if (preferredBasemapId && URL_LAYER_OPTIONS.includes(preferredBasemapId)) {
                        if (activeBasemap.value !== preferredBasemapId) {
                            activeBasemap.value = preferredBasemapId;
                        }
                    } else {
                        // 2b) 管理员配置的全局默认底图索引
                        try {
                            const defaultsRes = await apiGetRuntimeDefaults();
                            const serverIndex = defaultsRes?.data?.default_basemap_index;
                            if (serverIndex != null) {
                                const serverLayerId = URL_LAYER_OPTIONS[serverIndex] || null;
                                if (serverLayerId && activeBasemap.value !== serverLayerId) {
                                    activeBasemap.value = serverLayerId;
                                }
                            }
                        } catch { /* 静默失败，用硬编码兜底 */ }
                    }
                }
                // 3) 无条件写回 l：activeBasemap 默认值与初始底图相同时 watch 不触发，强制初始写入避免 URL l 缺失
                syncBasemapToUrl(activeBasemap.value);
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
    } catch (error) {
        console.error('[Cesium][boot] FATAL:', error);
        message.error('Cesium 运行时加载失败', error);
        message.error('Cesium 初始化失败，请检查网络环境。', { closable: true });
    } finally {
        bootInProgress = false;
        hideLoading();
        bootComplete.value = true;
    }
}

/**
 * 重置 Cesium viewer 以便 token 重试
 * 清理所有 composable 状态和 viewer 资源，为下一次 initViewer 做准备
 */
function resetCesiumViewerForRetry() {
    cesiumReady.value = false;
    attrViewExtentSync.stop();
    cleanupCameraViewSync();
    cleanupInteractions();
    cleanupTools();
    cleanupLayers();
    cleanupCreditHider();
    cleanupNavigation();
    // 清理人物漫游控制器
    try { playerController.stopPlayer(); } catch { /* ignore */ }
    try { playerController.clearNavTarget?.(); } catch { /* ignore */ }
    // 清理体积云（viewer 即将被销毁）
    if (cloudCleanup) {
        cloudCleanup();
        cloudCleanup = null;
    }
    // 清理 tellux 移植模块
    try { modelManager.dispose(); } catch { /* ignore */ }
    try { cameraEnhanced.cleanup(); } catch { /* ignore */ }
    try { heightSampler.cleanup(); } catch { /* ignore */ }
    // 清理已加载数据源（释放 Blob URL 等）
    dataImport.clearAllDataSources();
    if (!viewer) return;
    try {
        viewer.destroy();
    } catch (error) {
        console.warn('Cesium viewer retry cleanup warning:', error);
    }
    viewer = null;
}

/** 体积云集成清理函数 */
let cloudCleanup = null;

/**
 * 初始化 Cesium Viewer 实例
 * 构造 viewer → 配置时间系统 → 太阳光照 → 信用隐藏 → 底图同步 → 相机恢复 → 体积云集成
 * 设置模块级 viewer 变量，供所有 composable 通过 getViewer() 访问
 */
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
    // FPS 面板保留常开：按需渲染（requestRenderMode）下低 FPS = 空闲降载省电（预期行为，非卡顿），
    // 交互瞬间回升——恰是验证按需渲染生效的直接仪表；如嫌干扰可改 false，不影响功能
    viewer.scene.debugShowFramesPerSecond = true;
    viewer.scene.globe.terrainExaggeration = 1;
    viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0;
    configureBeijingTimeSystem(viewer, Cesium);
    configureSolarLighting(viewer);
    // 按需渲染管理器：逐帧特效经 acquire/release 计数接管，计数归零进入按需渲染
    // （总开关在 useCesiumRenderMode.js，改 false 可一行回退恒连续渲染）
    initRequestRenderMode(viewer);

    installCreditHider();
    bindLayerPickerStateSync();
    if (!restoreCameraFromUrl({ duration: 0 })) {
        flyToHome(0);
    }

    // 体积云集成（cesium-clouds-atmosphere 懒加载管线）
    // setupCloudIntegration 在内部按 cloudParams.cloudsEnabled 决定是否加载资源；
    // 直接返回 cleanup 函数（非 { cleanup } 结构）
    try {
        cloudCleanup = setupCloudIntegration({
            viewer,
            cloudParams,
            atmosphereParams,
            // Bruneton 大气接管天空时，与 Tellux 大气/Cesium 原生大气叠加会让底图过曝涂白。
            // 启用体积云时临时关闭 Tellux 大气，关闭时恢复。
            advancedEffectControls,
            message,
        });
    } catch (err) {
        console.warn('[Cesium] Cloud integration skipped:', err);
    }

    // 相机姿态/高度每帧更新
    cleanupAttitudeListener = viewer.scene.postRender.addEventListener(() => {
        const cam = viewer.camera;
        const carto = cam.positionCartographic;
        cameraAttitude.value = {
            heading: Cesium.Math.toDegrees(cam.heading),
            pitch: Cesium.Math.toDegrees(cam.pitch),
            roll: Cesium.Math.toDegrees(cam.roll),
            height: carto.height,
        };
    });

    // 导航控件（罗盘 / 缩放 / 比例尺）— 动态加载，不阻塞主流程
    initNavigation();
}

onMounted(() => {
    bootCesium().catch((err) => {
        console.error('[Cesium][boot] unhandled rejection:', err);
    });
});

// ==========================================
// 数据导入事件处理
// ==========================================

/**
 * 处理文件导入事件（由 CesiumToolPanel data tab 触发）
 * 多文件选择时自动分组（SHP 配套文件 .dbf/.shx/.prj 合并加载）
 * @param {{ files: File[] }} payload
 */
// ========== 数据导入/操作事件处理（via composable：useCesiumDataOpsHandlers） ==========
// 面板/拖拽/GLTF 弹窗事件 → useCesiumDataImport 的转发层，容器只做一次装配。
const {
    handleDataImport,
    handleDataRemove,
    handleDataFlyTo,
    handleDataClearAll,
    handleDataReposition,
    handleDataStretchHeight,
    handleDataSetHeight,
    handleImportTilesetSample,
    handleDataSetMaterial,
    handleImportTilesetZip,
    handleImportTilesetFolder,
    handleGltfCoordConfirm,
    handleGltfCoordCancel,
} = createCesiumDataOpsHandlers({
    dataImport,
    repositionTargetRef: repositionTarget,
    getCesium,
    isComponentUnmounted: () => componentUnmounted,
});

onUnmounted(() => {
    componentUnmounted = true;
    cesiumReady.value = false;

    // 统一图层管理：注销 adapter 并清档（TOC「三维数据」分组随之消失）
    try { cesiumLayersStore.unregisterAdapter(); } catch { /* ignore */ }

    // 清理人物漫游控制器（移除 scene.preRender / selectedEntityChanged 监听）
    try { playerController.stopPlayer(); } catch { /* ignore */ }
    try { playerController.clearNavTarget?.(); } catch { /* ignore */ }
    try { playerController.setOpenNavDialogHandler?.(null); } catch { /* ignore */ }

    // B4：解除相机监听并清空属性表范围（回退「范围不可用」，2D 挂载后由 OL 侧重新喂入）
    attrViewExtentSync.stop();
    cleanupCameraViewSync();
    cleanupInteractions();
    cleanupTools();
    cleanupLayers();

    // 清理 tellux 移植模块
    modelManager.dispose();
    cameraEnhanced.cleanup();
    heightSampler.cleanup();

    // 清理体积云
    if (cloudCleanup) {
        cloudCleanup();
        cloudCleanup = null;
    }

    // 清理相机姿态更新
    if (cleanupAttitudeListener) {
        cleanupAttitudeListener();
        cleanupAttitudeListener = null;
    }

    cleanupCreditHider();
    cleanupNavigation();
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
        // 初始应用 Tellux 大气渲染参数（日夜/月光/星空）
        applyAtmosphereParams(atmosphereParams.value);
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

/**
 * 应用 Tellux 大气渲染参数到 Cesium 场景
 * 控制月光强度贡献（日夜/月光/星空的 enableLighting、moon.show、skyBox.show
 * 由 applyBaseAtmosphereParams 统一管理，此处不再重复写入，避免双写冲突）
 */
function applyAtmosphereParams(params) {
    if (!viewer || !Cesium) return;
    const scene = viewer.scene;
    const globe = scene.globe;

    // 月光强度贡献：叠加到 atmosphereLightIntensity 基础值之上
    if (globe && 'atmosphereLightIntensity' in globe) {
        const baseIntensity = baseAtmosphereParams.value.atmosphereLightIntensity ?? 5.5;
        // 月光增益系数：slider 0~1 → 实际贡献 0~MOON_BOOST_MAX
        const MOON_BOOST_MAX = 4.0;
        const moonBoost = (params.moonLightEnabled !== false)
            ? (params.moonLightIntensity ?? 0.18) * MOON_BOOST_MAX
            : 0;
        // 钳位防止过曝：总强度上限 12.0
        globe.atmosphereLightIntensity = Math.min(baseIntensity + moonBoost, 12.0);
    }

    scene.requestRender?.();
}

// 监听 Tellux 大气渲染参数变化
watch(
    atmosphereParams,
    (params) => {
        applyAtmosphereParams(params);
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

.coordinate-display {
    position: absolute;
    bottom: 30px;
    right: 24px;
    z-index: var(--z-panel);
    color: #00f0ff;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.45;
    text-shadow: 0 0 6px rgba(0, 240, 255, 0.4);
    pointer-events: none;
    user-select: none;
    white-space: pre-line;
    text-align: right;
    max-width: calc(100vw - 48px);
}

@media (max-width: 767px) {
    .coordinate-display {
        bottom: 18px;
        right: 12px;
        max-width: calc(100vw - 24px);
        line-height: 1.6;
    }
}

:global(.cesium-viewer-toolbar),
:global(.cesium-baseLayerPicker-dropDown),
:global(.cesium-geocoder-searchButton),
:global(.cesium-geocoder-searchButton:hover) {
    z-index: calc(var(--z-popover) + 200);
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

/* FPS 面板（debugShowFramesPerSecond）：Cesium 默认 top:50 双行盒子会压住
   罗盘（top:100, right:0）。压成单行紧凑胶囊后放回罗盘正上方、贴右缘——
   上不碰工具栏行（约 y≤52），下不碰罗盘（y≥100）；z 用 --z-panel 且
   pointer-events:none，任何侧栏/下拉都盖在它上面，永不遮挡交互 */
:global(.cesium-performanceDisplay-defaultContainer) {
    top: 68px !important;
    right: 10px !important;
    text-align: right;
    pointer-events: none;
    z-index: var(--z-panel);
}

:global(.cesium-performanceDisplay) {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 9px !important;
    background: rgba(15, 23, 42, 0.75) !important;
    border: 1px solid rgba(0, 229, 255, 0.22) !important;
    border-radius: 999px !important;
    font: 600 11px 'Consolas', 'Courier New', monospace !important;
    line-height: 1.5;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}

:global(.cesium-performanceDisplay-fps) {
    color: #4ade80 !important;
}

:global(.cesium-performanceDisplay-ms) {
    color: #67e8f9 !important;
}


:global(.cesium-geocoder .search-results) {
    z-index: 1401;
}

/* 拖拽上传覆盖层 */
.drag-overlay {
    position: absolute;
    inset: 0;
    z-index: var(--z-modal);
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
