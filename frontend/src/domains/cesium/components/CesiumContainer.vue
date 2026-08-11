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
        v-if="cesiumReady && shallowWaterVisible"
        :visible="shallowWaterVisible"
        v-bind="shallowWaterParams"
    />

    <CesiumToolPanel
        v-if="cesiumReady"
        v-model:open="cesiumToolPanelOpen"
        v-model:active-basemap="activeBasemap"
        v-model:active-terrain="activeTerrain"
        v-model:custom-ion-height-offset="customIonHeightOffset"
        :basemap-options="basemapOptions"
        :terrain-options="terrainOptions"
        :overlay-options="overlayOptions"
        :custom-basemap-url="customXyzBasemapUrl"
        :custom-ion-tileset-ready="customIonTilesetReady"
        :modules="toolModules"
        :loaded-data-sources="loadedDataSourcesForPanel"
        @module-action="handleToolAction"
        @control-change="handleToolControlChange"
        @overlay-toggle="handleOverlayToggle"
        @custom-basemap-submit="handleCustomBasemapSubmit"
        @remote-service-submit="handleRemoteServiceSubmit"
        @data-import="handleDataImport"
        @data-remove="handleDataRemove"
        @data-clear-all="handleDataClearAll"
        @data-flyto="handleDataFlyTo"
        @data-reposition="handleDataReposition"
        @data-stretch-height="handleDataStretchHeight"
        @data-set-height="handleDataSetHeight"
        @import-tileset-zip="handleImportTilesetZip"
        @import-tileset-folder="handleImportTilesetFolder"
        @import-tileset-sample="(payload) => handleImportTilesetSample(payload)"
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
    <div
        v-if="bootComplete"
        class="coordinate-display"
    >{{ activeCoordinateDisplay }}</div>

</template>

<script setup>
import {
    computed,
    defineAsyncComponent,
    nextTick,
    onMounted,
    onUnmounted,
    ref,
    watch,
} from 'vue';
import { BACKEND_BASE_URL, apiGetRuntimeDefaults } from '@/api/backend';
import { URL_LAYER_OPTIONS } from '@ol/basemap/constants/basemapResolver';
import { useMessage } from '@common/shell/useMessage';
import { showLoading, hideLoading } from '@common/ui/loading';
import { translate as t } from '@common/app/useLocale';
import { Upload } from '@lucide/vue';
import CesiumAdvancedEffects from './CesiumAdvancedEffects.vue';
import CesiumToolPanel from './CesiumToolPanel.vue';
import CesiumDataImportDialog from './CesiumDataImportDialog.vue';
import FluidSimulationPanel from '@cesium-domain/modules/fluid-simulation/FluidSimulationPanel.vue';
const ShallowWaterOverlay = defineAsyncComponent(() =>
    import('@cesium-domain/modules/shallow-water/ShallowWaterOverlay.vue'),
);

// cesium-navigation 导航控件样式（含高对比度深色主题）
import '@cesium-domain/vendors/cesium-navigation/styles/cesium-navigation.css';

import { configureSolarLighting } from '../composables/scene/cesiumAtmosphere';
import { loadCesiumRuntime } from '../composables/core/cesiumRuntime';
import { configureBeijingTimeSystem } from '../composables/core/cesiumTimeSystem';
import { useCesiumCreditHider } from '../composables/scene/useCesiumCreditHider';
import { useCesiumNavigation } from '../composables/core/useCesiumNavigation';
import { useCesiumInteractions } from '../composables/interaction/useCesiumInteractions';
import { initRequestRenderMode } from '@cesium-domain/composables/interaction/useCesiumRenderMode';
import { useCesiumLayers } from '../composables/layers/useCesiumLayers';
import { useCesiumSceneActions } from '../composables/camera/useCesiumSceneActions';
import { useCesiumDataImport } from '../composables/dataImport/useCesiumDataImport';
import { createCesiumDataOpsHandlers } from '../composables/dataImport/useCesiumDataOpsHandlers';
import { useCesiumToolModules } from '../composables/toolModules/useCesiumToolModules';
import { useCesiumLayersStore } from '@cesium-domain/stores/cesiumLayers';
import { readCachedPreferredBasemap } from '@common/user/stores/useUserPreferencesStore';
import { setRecordVisible, setRecordOpacity } from '../composables/dataImport/dataSourceDisplay';
import { setupCloudIntegration } from '@cesium-domain/modules/cloud';
import { useCesiumUrlTracking } from '../composables/layers/useCesiumUrlTracking';
import { useCesiumWind } from '@cesium-domain/modules/wind/useCesiumWind';
import { useCesiumModelManager } from '../composables/models/useCesiumModelManager';
import { useCesiumCameraEnhanced } from '../composables/camera/useCesiumCameraEnhanced';
import { createCesiumAttrViewExtentSync } from '../composables/camera/useCesiumAttrViewExtentSync';
import { useCesiumHeightSampler } from '../composables/terrain/useCesiumHeightSampler';
import { usePlayerController } from '@cesium-domain/modules/player-controller/usePlayerController';
import PlayerGuidePanel from '@cesium-domain/modules/player-controller/PlayerGuidePanel.vue';
import NavGuideHUD from '@cesium-domain/modules/player-controller/NavGuideHUD.vue';
import NavTargetPicker from '@cesium-domain/modules/player-controller/NavTargetPicker.vue';
import {
    getRuntimeMapTokensSync,
    loadRuntimeMapTokens,
    markRuntimeMapTokenFailed,
} from '@common/services/runtimeMapTokens';

let Cesium = null;
let viewer = null;
let componentUnmounted = false;

const message = useMessage();
const emit = defineEmits(['view-sync', 'ready', 'load-failed']);

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

// heightSampler 必须在 dataImport 之前声明（useCesiumDataImport 依赖它）
const heightSampler = useCesiumHeightSampler({ getViewer, getCesium });

// dataImport 必须在 useCesiumLayers 之前声明（远程服务加载需注册数据源）
const dataImport = useCesiumDataImport({
    getViewer,
    getCesium,
    message,
    heightSampler,
});

const layers = useCesiumLayers({
    getViewer,
    getCesium,
    message,
    backendBaseUrl: BACKEND_BASE_URL,
    tiandituToken: getTiandituToken,
    cesiumIonToken: getCesiumIonToken,
    dataImport,
});

const {
    activeBasemap,
    activeTerrain,
    customXyzBasemapUrl,
    customIonHeightOffset,
    customIonTilesetReady,
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
    handleRemoteServiceSubmit,
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

// B4：相机视域 → 属性表「视图筛选范围」同步（moveEnd 喂 attrStore，3D 模式视图筛选生效）
const attrViewExtentSync = createCesiumAttrViewExtentSync({ getViewer, getCesium });

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
        if (!record) {
            console.warn('[CesiumContainer] setVisible 找不到句柄记录', { id, visible });
            return;
        }
        setRecordVisible(getCesium(), record, visible);
        getViewer()?.scene?.requestRender?.();
    },
    setOpacity(id, opacity) {
        const record = findImportRecord(id);
        if (!record) {
            console.warn('[CesiumContainer] setOpacity 找不到句柄记录', { id, opacity });
            return;
        }
        const Cesium = getCesium();
        if (!Cesium) {
            console.warn('[CesiumContainer] setOpacity 场景未就绪（Cesium 命名空间缺失）', { id, opacity });
            return;
        }
        // 矢量类经 rAF 合并异步应用，onApplied 补一次渲染保证按需渲染模式即时生效
        setRecordOpacity(Cesium, record, opacity, () => {
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
        message.info(t('cesium.toast.navUseSearch'));
    } else if (type === 'data') {
        message.info(t('cesium.toast.navClickFeature'));
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

/**
 * 根据 adcode 加载行政区边界到 Cesium 场景。
 * 数据来源与 OL 端一致（阿里云 DataV），坐标同样做 GCJ-02 → WGS-84 转换。
 * @param {Object} payload
 * @param {string} payload.adcode - 6 位行政区代码
 * @param {string} [payload.name] - 行政区名称
 * @returns {Promise<boolean>} 是否成功加载
 */
async function focusDistrictByAdcode(payload = {}) {
    const adcode = String(payload?.adcode || payload?.value || '').trim();
    const districtName = String(payload?.name || payload?.label || '').trim() || `行政区-${adcode}`;

    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) {
        message.warning('Cesium 尚未初始化');
        return false;
    }

    const { gcj02ToWgs84 } = await import('@common/data-import/crs/coordTransform');

    const endpoint = 'https://geo.datav.aliyun.com/areas_v3/bound';
    const sourceUrl = `${endpoint}/${adcode}.json`;

    try {
        const response = await fetch(sourceUrl, {
            method: 'GET',
            referrerPolicy: 'no-referrer',
        });

        if (!response.ok) {
            message.warning(`行政区边界请求失败（${response.status}）`);
            return false;
        }

        const rawGeoJSON = await response.json();

        // 递归转换坐标：GCJ-02 → WGS-84
        function transformCoords(coords) {
            if (!Array.isArray(coords)) return coords;
            if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
                const [lon, lat] = gcj02ToWgs84(coords[0], coords[1]);
                return [lon, lat, ...(coords.length > 2 ? coords.slice(2) : [])];
            }
            return coords.map(transformCoords);
        }

        function transformGeometry(geom) {
            if (!geom || typeof geom !== 'object') return geom;
            if (geom.type === 'GeometryCollection') {
                return { ...geom, geometries: (geom.geometries || []).map(transformGeometry) };
            }
            if ('coordinates' in geom) {
                return { ...geom, coordinates: transformCoords(geom.coordinates) };
            }
            return geom;
        }

        const features = Array.isArray(rawGeoJSON?.features)
            ? rawGeoJSON.features
            : rawGeoJSON?.type === 'Feature' ? [rawGeoJSON] : [];

        if (!features.length) {
            message.warning('当前行政区没有可绘制边界要素');
            return false;
        }

        const wgs84GeoJSON = {
            type: 'FeatureCollection',
            features: features.map((f) => ({
                ...f,
                geometry: transformGeometry(f?.geometry),
            })),
        };

        const dataSource = await Cesium.GeoJsonDataSource.load(wgs84GeoJSON, {
            clampToGround: true,
            stroke: Cesium.Color.fromCssColorString('#21bcff'),
            fill: Cesium.Color.fromCssColorString('#21bcff').withAlpha(0.15),
            markerColor: Cesium.Color.fromCssColorString('#21bcff'),
            markerSize: 24,
        });

        dataSource.name = districtName;
        await viewer.dataSources.add(dataSource);

        // 注册到统一数据源管理（可通过 ToolPanel 控制显隐 / 删除）
        if (dataImport?.registerExternalDataSource) {
            dataImport.registerExternalDataSource({
                name: districtName,
                entity: dataSource,
                type: 'geojson',
            });
        }

        // 飞行定位
        const entities = dataSource.entities.values;
        if (entities.length) {
            await viewer.flyTo(entities, {
                duration: 1.2,
                maximumHeight: 50000,
            });
        }

        message.success(`已定位到行政区：${districtName}`);
        return true;
    } catch (error) {
        console.error('[Cesium] 行政区加载失败:', error);
        message.error(`行政区加载失败: ${error?.message || error}`);
        return false;
    }
}

// ========== 逆地理编码标注（地图选点） ==========

/** 标注模式激活标志 */
const isReverseGeocodePickMode = ref(false);
/** 选点模式的 ScreenSpaceEventHandler 回调引用（用于注销） */
let reverseGeocodeClickHandler = null;

/**
 * 激活 / 退出逆地理编码标注模式。
 * 激活后，用户在地球上单击一点，系统自动逆地理编码并放置标注点。
 */
async function toggleReverseGeocodePick() {
    if (isReverseGeocodePickMode.value) {
        // 退出标注模式
        isReverseGeocodePickMode.value = false;
        if (reverseGeocodeClickHandler) {
            reverseGeocodeClickHandler();
            reverseGeocodeClickHandler = null;
        }
        message.info('已退出标注模式');
        return;
    }

    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) {
        message.warning('Cesium 尚未初始化');
        return;
    }

    isReverseGeocodePickMode.value = true;
    message.info('请在地球上单击一个点，系统将自动逆地理编码并绘制。', {
        closable: true,
        duration: 4500,
    });

    // 动态导入逆地理编码 API
    const { apiReverseGeocodeWithFallback } = await import('@/api');

    // 注册一次性点击回调
    const canvas = viewer.scene.canvas;
    const handler = new Cesium.ScreenSpaceEventHandler(canvas);

    reverseGeocodeClickHandler = handler.setInputAction(async (click) => {
        // 立即退出选点模式（避免重复触发）
        isReverseGeocodePickMode.value = false;
        reverseGeocodeClickHandler = null;
        handler.destroy();

        try {
            // 拾取 WGS-84 坐标
            const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
            let lng, lat;

            if (cartesian) {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                lng = Cesium.Math.toDegrees(cartographic.longitude);
                lat = Cesium.Math.toDegrees(cartographic.latitude);
            } else {
                // fallback: globe.pick
                const ray = viewer.camera.getPickRay(click.position);
                const globePos = viewer.scene.globe.pick(ray, viewer.scene);
                if (!globePos) {
                    message.warning('无法获取点击位置的坐标');
                    return;
                }
                const cartographic = Cesium.Cartographic.fromCartesian(globePos);
                lng = Cesium.Math.toDegrees(cartographic.longitude);
                lat = Cesium.Math.toDegrees(cartographic.latitude);
            }

            // 逆地理编码（WGS-84 输入）
            let reverseResult = null;
            try {
                const reverseResponse = await apiReverseGeocodeWithFallback(lng, lat, { silent: true });
                reverseResult = reverseResponse?.data || null;
            } catch {
                reverseResult = null;
            }

            const formattedAddress = String(reverseResult?.formattedAddress || '').trim();
            const label = formattedAddress || `标注点_${lng.toFixed(6)}_${lat.toFixed(6)}`;

            // 用 CustomDataSource 包装标注点，便于统一数据源管理
            const markDataSource = new Cesium.CustomDataSource(label);
            markDataSource.entities.add({
                position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
                point: {
                    pixelSize: 12,
                    color: Cesium.Color.fromCssColorString('#21bcff'),
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                },
                label: {
                    text: label,
                    font: '600 13px "Microsoft YaHei", sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -16),
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                },
                // 存储逆地理编码信息供后续查看
                properties: {
                    来源: '逆地理编码标注',
                    地址: formattedAddress || '未解析',
                    经度: lng,
                    纬度: lat,
                    省: String(reverseResult?.province || '').trim() || '未知',
                    市: String(reverseResult?.city || '').trim() || '未知',
                    区县: String(reverseResult?.district || '').trim() || '未知',
                },
            });
            await viewer.dataSources.add(markDataSource);

            // 注册到统一数据源管理（可通过 ToolPanel 控制显隐 / 删除）
            if (dataImport?.registerExternalDataSource) {
                dataImport.registerExternalDataSource({
                    name: label,
                    entity: markDataSource,
                    type: 'geojson',
                });
            }

            if (formattedAddress) {
                message.success(`逆地理编码成功：${formattedAddress}`);
            } else {
                message.info('已放置标注点（逆地理编码未返回结果）');
            }
        } catch (error) {
            console.error('[Cesium] 逆地理编码选点失败:', error);
            message.warning(`逆地理编码选点失败: ${error?.message || error}`);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
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
    focusDistrictByAdcode,
    isReverseGeocodePickMode,
    toggleReverseGeocodePick,
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
/** 当前首屏等待的取消函数，由 onUnmounted 消费 */
let _cancelInitialSceneWait = null;

/**
 * 等待 Cesium 首屏真正可见：至少完成两次渲染，且当前视野的地形/影像瓦片已清空队列。
 * 不能只检查一次 tilesLoaded；Viewer 刚构造时它可能短暂为 true，但首帧请求尚未真正发出。
 */
function waitForInitialSceneReady({ timeoutMs = 30000 } = {}) {
    const activeViewer = viewer;
    const scene = activeViewer?.scene;
    const globe = scene?.globe;

    if (!activeViewer || !scene) {
        return Promise.reject(new Error('Cesium scene is unavailable'));
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        let renderedFrames = 0;
        let removePostRender = null;
        let removeTileProgress = null;
        let timeoutId = null;

        const cleanup = () => {
            removePostRender?.();
            removeTileProgress?.();
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };

        const finish = (error = null) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve();
        };

        const cancelWait = () => {
            finish(new Error('Cesium initial scene wait was cancelled'));
        };
        // 注册到 onUnmounted 的清理函数，避免模块级全局变量
        _cancelInitialSceneWait = cancelWait;

        const requestNextFrame = () => {
            if (componentUnmounted || activeViewer.isDestroyed?.()) {
                finish(new Error('Cesium component was destroyed before initial render'));
                return;
            }
            scene.requestRender?.();
        };

        const checkReady = () => {
            if (componentUnmounted || activeViewer.isDestroyed?.()) {
                finish(new Error('Cesium component was destroyed before initial render'));
                return;
            }

            const tilesLoaded = !globe || globe.tilesLoaded === true;
            if (renderedFrames >= 2 && tilesLoaded) {
                finish();
                return;
            }

            // requestRenderMode 下主动补帧，避免瓦片完成后没有第二帧触发。
            if (tilesLoaded && renderedFrames > 0) {
                window.requestAnimationFrame(requestNextFrame);
            }
        };

        removePostRender = scene.postRender.addEventListener(() => {
            renderedFrames += 1;
            checkReady();
        });

        if (globe?.tileLoadProgressEvent) {
            removeTileProgress = globe.tileLoadProgressEvent.addEventListener((pendingTiles) => {
                if (pendingTiles === 0) requestNextFrame();
            });
        }

        timeoutId = window.setTimeout(() => {
            finish(new Error(`Cesium initial scene load timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        requestNextFrame();
    });
}

async function bootCesium() {
    if (bootInProgress) {
        console.warn('[Cesium][boot] skipped — already in progress');
        return;
    }
    bootInProgress = true;
    componentUnmounted = false;
    showLoading(t('loading.cesiumScene'), { timeoutMs: 0 });
    if (import.meta.env.DEV) console.warn('[Cesium][boot] start', { ionTokenPresent: !!getCesiumIonToken(), tiandituPresent: !!getTiandituToken() });
    let bootSucceeded = false;
    let bootError = null;
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
                // 3D 视图已渲染出来，此时即可关闭遮罩，后续 token 重试/地形/底图加载不阻塞 UI
                hideLoading();

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
                    await waitForInitialSceneReady();
                    if (componentUnmounted) return;
                    bootSucceeded = true;
                    message.success(t('cesium.toast.basemapTerrainOk'));
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
                    bootError = new Error('Cesium basemap or terrain failed to initialize');
                    message.error(t('cesium.toast.basemapTerrainFail'), { closable: true });
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
                message.warning(t('cesium.toast.primaryTokenFailRetry'), { closable: true });
            } catch (error) {
                if (componentUnmounted) return;
                // 该 stage 错误由后续 token 重试 message.warning / FATAL message.error 兜底,此处不重复 console.error
                // console.error('[Cesium][boot] stage error:', error);
                const switchedCesium = markRuntimeMapTokenFailed('cesium_ion_token');
                if (!switchedCesium.switched) throw error;
                runtimeMapTokens.value = switchedCesium.tokens;
                resetCesiumViewerForRetry();
                retryCount += 1;
                message.warning(t('cesium.toast.ionTokenFailRetry'), { closable: true });
            }
        }
        // 下方 message.error(tokenPoolExhausted) 已提示用户,此处不再重复 console.error
        // console.error('[Cesium][boot] exhausted token pool');
        bootError = new Error('Cesium token pool exhausted');
        message.error(t('cesium.toast.tokenPoolExhausted'), { closable: true });
    } catch (error) {
        bootError = error instanceof Error ? error : new Error(String(error));
        // 下方按超时/通用分支的 message.warning/error 已提示用户,此处不重复 console.error
        // console.error('[Cesium][boot] FATAL:', error);
        // 首屏瓦片加载超时：单独提示，避免与通用 initFailed 混淆
        if (bootError.message?.includes('timed out after')) {
            message.warning(t('cesium.toast.sceneLoadTimeout'), { closable: true });
        } else {
            message.error(t('cesium.toast.runtimeLoadFailed'), error);
            message.error(t('cesium.toast.initFailed'), { closable: true });
        }
    } finally {
        bootInProgress = false;
        bootComplete.value = true;
        if (bootSucceeded) {
            emit('ready');
        } else if (!componentUnmounted) {
            emit('load-failed', { message: bootError?.message || 'Cesium initialization failed' });
        }
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
    bootCesium().catch((_err) => {
        // bootCesium 内部 try/catch/finally 已对失败路径 message toast 兜底,此 safety-net 仅注释保留
        // console.error('[Cesium][boot] unhandled rejection:', err);
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
    hideLoading();
    _cancelInitialSceneWait?.();
    _cancelInitialSceneWait = null;
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

    // 清理共享地形 Worker 池（释放 Worker 线程资源）
    import('../providers/terrain/ArcGISTerrainProvider.js').then((m) => m.destroySharedLercPool?.()).catch(() => { });
    import('../providers/terrain/GeoTerrainProvider.js').then((m) => m.destroySharedGeoDecodePool?.()).catch(() => { });

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
        bottom: 28px;
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
    top: 50px !important;
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
