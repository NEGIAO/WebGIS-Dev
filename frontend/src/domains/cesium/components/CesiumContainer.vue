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

    <!-- 路线漫游状态 HUD（绘制/飞行期间悬浮显示） -->
    <div
        v-if="cesiumReady && (routeFlyState.isDrawing || routeFlyState.hasRoute || routeFlyState.isFlying)"
        class="route-fly-hud"
    >
        <span class="hud-tip">{{ routeFlyHudTip }}</span>
        <span>{{ t('cesium.module.routeFly.stats.points') }}: {{ routeFlyState.pointCount }}</span>
        <span
            v-if="routeFlyState.routeLengthText"
        >{{ t('cesium.module.routeFly.stats.length') }}: {{ routeFlyState.routeLengthText }}</span>
        <span
            v-if="routeFlyState.durationText"
        >{{ t('cesium.module.routeFly.stats.duration') }}: {{ routeFlyState.durationText }}</span>
        <span
            v-if="routeFlyState.isFlying"
        >{{ t('cesium.module.routeFly.control.speed') }}: {{ routeFlyState.multiplier }}x</span>
    </div>

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
        @module-action="handleToolAction"
        @control-change="handleToolControlChange"
        @overlay-toggle="handleOverlayToggle"
        @custom-basemap-submit="handleCustomBasemapSubmit"
        @remote-service-submit="handleRemoteServiceSubmit"
        @data-import="handleDataImport"
        @import-tileset-zip="handleImportTilesetZip"
        @import-tileset-folder="handleImportTilesetFolder"
        @import-tileset-sample="(payload) => handleImportTilesetSample(payload)"
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
        :busy="gltfLoading"
        :load-error="gltfLoadError"
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

    <!-- 坐标控制条（固定右下角，圆角胶囊）：显隐开关 + 坐标数据 + 瓦片级别 + 分隔线 + 主页。
         与 OL MapControlsBar 逐项对齐；桌面默认展开坐标、触屏默认收起，两端口均可切换。 -->
    <div
        v-if="bootComplete"
        class="coordinate-display"
        :class="{ 'is-roaming': coordinateGroups.roaming, 'coord-open': hudVisible }"
    >
        <button
            class="coord-toggle-btn"
            type="button"
            :title="hudToggleTitle"
            :aria-label="hudToggleTitle"
            :aria-pressed="hudVisible"
            @click.stop="hudVisible = !hudVisible"
        >
            <Eye
                v-if="hudVisible"
                :size="isTouch ? 20 : 17"
                :stroke-width="2"
            />
            <EyeOff
                v-else
                :size="isTouch ? 20 : 17"
                :stroke-width="2"
            />
        </button>
        <div
            v-if="hudVisible"
            class="coordinate-section"
        >
            <button
                class="coordinate-copy-area"
                type="button"
                :title="t('cesium.copyCoordinateTitle')"
                :aria-label="t('cesium.copyCoordinateAria')"
                @click.stop="copyActiveCoordinateDisplay"
            >
                <span
                    v-if="coordinateGroups.roaming"
                    class="coordinate-display-badge"
                >漫游</span>
                <!-- 触屏只显示经纬度+海拔单行；桌面保留位置/姿态/相机海拔三组 -->
                <span
                    v-if="isTouch"
                    class="coordinate-mobile-text"
                >{{ mobileCoordinateText }}</span>
                <span
                    v-else
                    class="coordinate-display-groups"
                >
                    <span
                        v-for="group in coordinateGroups.groups"
                        :key="group.key"
                        class="coordinate-group"
                    >
                        <span class="coordinate-group-label">{{ group.label }}</span>
                        <span class="coordinate-group-value">{{ group.value }}</span>
                    </span>
                </span>
                <!-- 复制提示图标：与 OL 控制条右侧的复制按钮同位同形（悬停浮现 / 触屏常显） -->
                <Copy
                    class="coordinate-copy-icon"
                    :size="14"
                    :stroke-width="2"
                    aria-hidden="true"
                />
            </button>
        </div>
        <!-- 瓦片请求级别（与 OL 缩放级别同义、同取整规则） -->
        <div
            class="zoom-level-display"
            :title="t('mapControls.zoomLevel')"
        >
            {{ displayTileZoom }}
        </div>
        <div class="divider"></div>
        <button
            class="home-btn"
            :title="t('cesium.homeTip')"
            type="button"
            @click.stop="handleHomeClick"
        >
            <House
                :size="isTouch ? 22 : 18"
                :stroke-width="1.8"
            />
        </button>
    </div>

    <!-- 三维矢量图层属性表（TOC 右键「打开属性表」，只读 + 行定位） -->
    <CesiumAttributeTableDialog
        :visible="attrTableVisible"
        :data="attrTableData"
        @close="attrTableVisible = false"
        @locate="locateAttributeEntity"
    />
</template>

<script setup>
import {
    computed,
    defineAsyncComponent,
    nextTick,
    onMounted,
    onUnmounted,
    ref,
    toRaw,
    watch,
} from 'vue';
import { BACKEND_BASE_URL, apiGetRuntimeDefaults } from '@/api/backend';
import { URL_LAYER_OPTIONS, resolvePresetLayerIds } from '@ol/basemap/constants/basemapResolver';
import { getUrlLayerNumberByBasemapId } from '@common/basemap/basemapOptions';
import { resolveRuntimeTokenPoolKey } from '@ol/basemap/constants/basemapConfig';
import { useMessage } from '@common/shell/useMessage';
import { showLoading, hideLoading } from '@common/ui/loading';
import { translate as t } from '@common/app/useLocale';
import { Copy, Eye, EyeOff, House, Upload } from '@lucide/vue';
import CesiumAdvancedEffects from './CesiumAdvancedEffects.vue';
import CesiumToolPanel from './CesiumToolPanel.vue';
import CesiumAttributeTableDialog from './CesiumAttributeTableDialog.vue';
import CesiumDataImportDialog from './CesiumDataImportDialog.vue';
import FluidSimulationPanel from '@cesium-domain/modules/fluid-simulation/FluidSimulationPanel.vue';
const ShallowWaterOverlay = defineAsyncComponent(() =>
    import('@cesium-domain/modules/shallow-water/ShallowWaterOverlay.vue'),
);

// cesium-navigation 导航控件样式（罗盘/缩放栏/比例尺，浅色玻璃 + 品牌主题）
import '@cesium-domain/vendors/cesium-navigation/styles/cesium-navigation.css';

import { configureSolarLighting } from '../composables/scene/cesiumAtmosphere';
import { loadCesiumRuntime } from '../composables/core/cesiumRuntime';
import { configureBeijingTimeSystem } from '../composables/core/cesiumTimeSystem';
import { useCesiumCreditHider } from '../composables/scene/useCesiumCreditHider';
import { useCesiumNavigation } from '../composables/core/useCesiumNavigation';
import { useCesiumInfoBoxTheme } from '../composables/core/useCesiumInfoBoxTheme';
import { useCesiumInteractions } from '../composables/interaction/useCesiumInteractions';
import { initRequestRenderMode } from '@cesium-domain/composables/interaction/useCesiumRenderMode';
import { useCesiumLayers } from '../composables/layers/useCesiumLayers';
// 地形 provider 的 Worker 池清理函数：这两个模块已被 useCesiumLayers 静态引入，
// 组件卸载时直接用静态导入调用即可。此前写成 import() 动态引入，Vite 会报
// INEFFECTIVE_DYNAMIC_IMPORT（同一模块既被静态又被动态引入 → 无法分包），
// 产物里还多出两个 0.09 kB 的空壳 chunk。
import { destroySharedLercPool } from '../providers/terrain/ArcGISTerrainProvider.js';
import { destroySharedGeoDecodePool } from '../providers/terrain/GeoTerrainProvider.js';
import { useCesiumSceneActions } from '../composables/camera/useCesiumSceneActions';
import { useCesiumDataImport } from '../composables/dataImport/useCesiumDataImport';
import { createCesiumDataOpsHandlers } from '../composables/dataImport/useCesiumDataOpsHandlers';
import { createCesiumCrsRedeclareFeature } from '../composables/dataImport/useCesiumCrsRedeclare';
import { useCesiumToolModules } from '../composables/toolModules/useCesiumToolModules';
import { useCesiumLayersStore } from '@cesium-domain/stores/cesiumLayers';
import { useDrawMeasureStore } from '@cesium-domain/stores/useDrawMeasureStore';
import { registerEngineHandlers, unregisterEngineHandlers } from '@common/layer-tree/actions/unifiedActionRouter';
import { TOC_LAYER_DRAG_MIME } from '@common/layer-tree/protocol';
import { getCesiumGroundResolution } from '@common/utils/viewScale/browserAdapter';
import { cesiumHeightToOlZoom } from '@common/utils/viewScale';
import { createCesiumDrawMeasureFeature } from '../composables/draw/useCesiumDrawMeasure';
import { createCesiumRouteFeature } from '../composables/draw/useCesiumRouteRendering';
import { readCachedPreferredBasemap } from '@common/user/stores/useUserPreferencesStore';
import { setRecordVisible, setRecordOpacity } from '../composables/dataImport/dataSourceDisplay';
import {
    applyVectorDataSourceStyle,
    setVectorLabelVisible,
} from '../composables/dataImport/dataSourceDisplay';
import {
    collectEntityProperties,
    collectEntityShapes,
    serializeShapes,
} from '../utils/cesiumLayerSerialization';
import {
    assertGroundPlacementRegistry,
    fitGroundPlacement,
    resetGroundPlacement,
    setGroundOffset,
} from '../composables/terrain/groundPlacementService';
import { copyTextToClipboard, downloadTextFile, sanitizeFileName } from '../utils/browserIo';
import { setupCloudIntegration, isCloudPipelineActive } from '@cesium-domain/modules/cloud';
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
const emit = defineEmits([
    'view-sync',
    'ready',
    'load-failed',
    'drop-ol-layer',
]);

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
const getOvitalTdtkey = () => runtimeMapTokens.value.ovitalTdtkey;
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
    ovitalTdtkeyToken: getOvitalTdtkey,
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
    zoomToRemoteService,
} = layers;

// 统一 Action Router：注册 Cesium 引擎处理器（HomeView 高频操作按引擎分发）。
// 用户图层 id 带 'cesium:' 前缀时剥除后直调注册表 store；无前缀按原样尝试。
registerEngineHandlers('cesium', {
    setUserLayerVisibility: ({ layerId, visible }) => {
        cesiumLayersStore.setVisible(stripCesiumPrefix(layerId), !!visible);
    },
    setUserLayerOpacity: ({ layerId, opacity }) => {
        cesiumLayersStore.setOpacity(stripCesiumPrefix(layerId), Number(opacity));
    },
    removeUserLayer: ({ layerId }) => {
        cesiumLayersStore.remove(stripCesiumPrefix(layerId));
    },
    zoomToUserLayer: ({ layerId }) => {
        cesiumLayersStore.flyTo(stripCesiumPrefix(layerId));
    },
    zoomToRemoteService: ({ serviceId }) => zoomToRemoteService(serviceId),
    // 三维「重设源坐标系」：定义在本文件下方（依赖元数据店与前缀剥离），闭包在调用时才求值
    redeclareLayerCrs: ({ layerId, crs }) => redeclareLayerCrs({ layerId, crs }),
});

// 监听 activeBasemap 变化兜底：CesiumToolPanel 等其它入口也能触发 URL 同步
watch(activeBasemap, (next, prev) => {
    if (!next || next === prev) return;
    syncBasemapToUrl({ id: next });
});

const { coordinateDisplay, setupInteractions, cleanupInteractions } = useCesiumInteractions({
    getViewer,
    getCesium,
});

const { installCreditHider, cleanupCreditHider, restoreCreditDisplay } = useCesiumCreditHider({ getViewer });
const { initNavigation, cleanupNavigation } = useCesiumNavigation({ getViewer, getCesium });
const {
    bindInfoBoxTheme,
    watchThemeChange,
    cleanupInfoBoxTheme,
} = useCesiumInfoBoxTheme({ getViewer });
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
    onBasemapRestore: (selection) => {
        const normalized = typeof selection === 'string'
            ? { id: selection }
            : selection;
        if (!normalized?.id) return;

        if (normalized.id === 'custom') {
            if (
                customXyzBasemapUrl.value &&
                activeBasemap.value === 'custom' &&
                getViewer() &&
                getCesium()
            ) {
                layers.applyBasemap('custom', { forceReload: true });
            } else if (activeBasemap.value !== 'custom') {
                // l=2 always selects custom; its provider URL comes from shared runtime state.
                activeBasemap.value = 'custom';
            }
            return;
        }

        if (activeBasemap.value !== normalized.id) {
            activeBasemap.value = normalized.id;
        }
    },
});

watch(
    [customXyzBasemapUrl, activeBasemap],
    ([nextUrl, nextBasemap], [previousUrl, previousBasemap]) => {
        if (nextUrl === previousUrl || nextBasemap !== 'custom') return;
        syncBasemapToUrl({ id: 'custom' });

        // 已在 custom 上更换共享 URL 时立即重建 provider；初次切入 custom 由 activeBasemap watcher 加载。
        if (previousBasemap === 'custom' && nextUrl && getViewer() && getCesium()) {
            layers.applyBasemap('custom', { forceReload: true });
        }
    },
);

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

/** 剥离 TOC 节点 id 的 cesium: 前缀（无前缀原样返回） */
function stripCesiumPrefix(layerId) {
    const raw = String(layerId || '');
    return raw.startsWith('cesium:') ? raw.slice(7) : raw;
}

/** 按 id 查 loadedDataSources 句柄记录 */
function findImportRecord(id) {
    return (dataImport.loadedDataSources.value || []).find((item) => item.id === id) || null;
}

// ── 三维「重设源坐标系」：几何取自导入期快照，重建走导入链路（见 useCesiumCrsRedeclare）──
const { redeclareLayerCrs: redeclareCrsCore } = createCesiumCrsRedeclareFeature({
    getCesium,
    getViewer,
    message,
    loadedDataSources: dataImport.loadedDataSources,
    nextId: dataImport.nextId,
});

/**
 * TOC / 属性弹窗入口：按新源坐标系重建三维图层。
 * 重建会换掉数据源句柄，而显隐与透明度只存在元数据店（按 id 保留），新句柄的初始态
 * 恒为「显示 / 不透明」—— 故重建后必须按旧值再下发一次，否则隐藏过的图层会重新出现。
 * @param {{layerId: string, crs: string}} payload
 * @returns {Promise<boolean>} 是否完成
 */
async function redeclareLayerCrs({ layerId, crs } = {}) {
    const id = stripCesiumPrefix(layerId);
    const before = (cesiumLayersStore.records || []).find((item) => item.id === id);
    const ok = await redeclareCrsCore({ layerId: id, crs });
    if (!ok || !before) return ok;
    cesiumLayersStore.setVisible(id, before.visible !== false);
    cesiumLayersStore.setOpacity(id, Number.isFinite(before.opacity) ? before.opacity : 1);
    return ok;
}

/**
 * 收集某条三维图层记录的坐标几何（TOC 复制坐标 / 导出坐标用）。
 * 绘制成品直接取建档载荷；导入矢量从 DataSource 实体反解（属性可能为动态，按当前时刻取值）。
 * @param {string} id 图层 id（不含 cesium: 前缀）
 * @returns {Array<{type:'point'|'line'|'polygon', lonLats:Array<[number,number]>}>}
 */
function collectLayerShapes(id) {
    if (drawMeasureFeature.isManaged(id)) return drawMeasureFeature.getShapesById(id);
    if (routeFeature.isManaged(id)) return routeFeature.getShapesById?.(id) || [];
    const record = findImportRecord(id);
    const entities = toRaw(record?.entity)?.entities?.values;
    return Array.isArray(entities) ? collectEntityShapes(getCesium(), entities) : [];
}

// ────────────────────────── 属性表（只读） ──────────────────────────
const attrTableVisible = ref(false);
const attrTableData = ref(null);
/** 当前属性表对应的图层 id（行定位时回查实体） */
const attrTableRecordId = ref('');

/**
 * 打开某图层的属性表。
 * 3D 侧属性来自 `entity.properties`，只读——没有可回写的属性存储，
 * 提供编辑态会造成「改了但没保存」的静默丢失。
 * @param {string} id 图层 id（不含 cesium: 前缀）
 * @returns {boolean} 是否成功打开
 */
function showAttributeTable(id) {
    const record = findImportRecord(id);
    const entities = toRaw(record?.entity)?.entities?.values;
    if (!record || !Array.isArray(entities) || !entities.length) {
        message.warning(t('cesium.attributeTable.empty'));
        return false;
    }
    const { columns, rows, truncated } = collectEntityProperties(getCesium(), entities);
    attrTableRecordId.value = id;
    attrTableData.value = { title: record.name, columns, rows, truncated };
    attrTableVisible.value = true;
    return true;
}

/** 属性表行点击 → 相机飞到该要素 */
function locateAttributeEntity(entityId) {
    const record = findImportRecord(attrTableRecordId.value);
    const entity = toRaw(record?.entity)?.entities?.getById?.(entityId);
    if (!entity) return;
    getViewer()?.flyTo(entity, { duration: 0.8 });
}

// 导入列表 → 元数据店差量同步（新增建档/删除销档，保留用户改过的 visible/opacity）
watch(
    () => dataImport.loadedDataSources.value,
    (list) => {
        cesiumLayersStore.syncFromImport(
            (list || []).map((item) => {
                const base = { id: item.id, name: item.name, type: item.type };
                if (item.type === '3dtiles') {
                    // 建档初值：高程滑杆范围以当前基座高 ±100m（对齐原 data tab 逻辑）
                    const rawInitial = Number.isFinite(item.currentBaseHeight)
                        ? item.currentBaseHeight
                        : Number(item.tilesetGeo?.initialBaseHeight ?? item.tilesetGeo?.bottomH);
                    const center = Number.isFinite(rawInitial) ? rawInitial : 0;
                    base.baseHeight = center;
                    base.heightRange = {
                        min: Math.max(Math.floor(center - 100), -10),
                        max: Math.max(Math.ceil(center + 100), Math.floor(center - 100) + 1),
                    };
                    base.materialMode = String(item.materialMode || 'baimo');
                } else if (item.type === 'gltf') {
                    // glTF 的滑杆语义是「相对地形高度偏移」，初值取导入时的语义高度
                    base.baseHeight = Number(item.modelHeightOffset) || 0;
                }
                return base;
            }),
        );
    },
    { immediate: true, deep: false },
);

// ════════════════════════════════════════════
// 绘制/测量管理器 + 公交/驾车路线渲染器（引擎感知迁移 P0/P2）
// 方案：Docs/TODO/engine-aware-map-operations-migration-plan.md
// 全类型扩展：Docs/LLM_record/26-10/2026-10-25/2026-10-25-cesium-draw-measure-full-migration.md
// ════════════════════════════════════════════
const drawMeasureStore = useDrawMeasureStore();

const drawMeasureFeature = createCesiumDrawMeasureFeature({
    getCesium,
    getViewer,
    cesiumLayersStore,
    /** 场景标注前缀走 i18n（语言切换后新绘制的标注即时跟随） */
    getLabel: (key) => t(`cesium.drawMeasure.label.${key}`),
    /** 绘制完成 → 纯数据载荷入店，面板据此渲染读数与记录 */
    onResult: (result) => {
        drawMeasureStore.setResult(result, result.summary || '');
    },
    /** 交互态 → 面板高亮与「完成/取消」按钮显隐 */
    onStateChange: (state) => {
        drawMeasureStore.setActiveType(state.drawing ? state.mode : null);
    },
    /** 成品被移除（撤销 / TOC 删除 / 清空）→ 读数同步失效，避免面板展示已不存在的图形 */
    onRemoved: (id) => {
        if (drawMeasureStore.lastResult?.id === id) drawMeasureStore.setResult(null);
    },
    /** 手势结束失败（取点不足等）→ 明确提示，避免「右键了没反应」 */
    onReject: (code) => {
        if (code === 'need-more-points') {
            message.warning(t('cesium.drawMeasure.toast.needMorePoints'));
        } else if (code === 'need-second-click') {
            message.warning(t('cesium.drawMeasure.toast.needSecondClick'));
        } else if (code === 'failed') {
            message.warning(t('cesium.drawMeasure.toast.failed'));
        }
    },
});

// 初始同步：面板状态先于引擎存在（用户可能先改选项再开画）
drawMeasureFeature.setMeasureOptions(drawMeasureStore.measureOptions);
drawMeasureFeature.updateStyle(drawMeasureStore.style);

// 面板 → 引擎单向下推（面板只写 store，引擎只读 store，避免双向回环）
watch(
    () => drawMeasureStore.measureOptions,
    (options) => drawMeasureFeature.setMeasureOptions(options),
    { deep: true },
);
watch(
    () => drawMeasureStore.style,
    (style) => drawMeasureFeature.updateStyle(style),
    { deep: true },
);

const routeFeature = createCesiumRouteFeature({
    getCesium,
    getViewer,
    cesiumLayersStore,
});

// 注册场景操作 adapter（store action → 句柄）
    // 惰性引用：ops 处理器在后方解构，adapter 方法调用时已就绪

    let _rsvcSetMaterial = null;
    let _rsvcReposition = null;
    let _rsvcStretchHeight = null;

    cesiumLayersStore.registerAdapter({
    setVisible(id, visible) {
        // 绘制 / 路线句柄优先分流（引擎感知迁移：TOC 显隐直达管理器）
        if (drawMeasureFeature.isManaged(id)) {
            drawMeasureFeature.setVisible(id, visible);
            return;
        }
        if (routeFeature.isManaged(id)) {
            routeFeature.setVisible(id, visible);
            return;
        }
        const record = findImportRecord(id);
        if (!record) {
            console.warn('[CesiumContainer] setVisible 找不到句柄记录', { id, visible });
            return;
        }
        setRecordVisible(getCesium(), record, visible);
        getViewer()?.scene?.requestRender?.();
    },
    setOpacity(id, opacity) {
        if (drawMeasureFeature.isManaged(id)) {
            drawMeasureFeature.setOpacity(id, opacity);
            return;
        }
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
        if (drawMeasureFeature.isManaged(id)) {
            drawMeasureFeature.flyTo(id);
            return;
        }
        if (routeFeature.isManaged(id)) {
            routeFeature.flyTo(id);
            return;
        }
        dataImport.flyToDataSource(id);
    },
    remove(id) {
        // 绘制 / 路线句柄优先分流（store 已同步删档，无需 loadedDataSources 回声）
        if (drawMeasureFeature.isManaged(id)) {
            drawMeasureFeature.removeHandle(id);
            return;
        }
        if (routeFeature.isManaged(id)) {
            routeFeature.removeHandle(id);
            return;
        }
        // 模块托管数据源（面状航线 / 路线漫游）：先让对应控制器复位内部状态，
        // 避免控制器持有已销毁 DataSource 引用导致后续写入失效容器
        if (id === PLANAR_SOURCE_ID) {
            detachPlanarWorkingSet?.();
        } else if (id === ROUTE_FLY_SOURCE_ID) {
            detachRouteFlyWorkingSet?.();
        }
        dataImport.removeDataSource(id);
    },
    setBaseHeight(id, height) {
        const record = findImportRecord(id);
        if (!record) {
            console.warn('[CesiumContainer] setBaseHeight 找不到句柄记录（loadedDataSources 中无此 id）', { id, height });
            return;
        }
        /**
         * 统一走门面：3D Tiles 由数据导入层记账基座海拔，glTF 走相对地形偏移，
         * 容器不再按类型 if/else（这正是「贴地逻辑散落」的根源）。
         * 注意：不得在此回调里再调 cesiumLayersStore.setBaseHeight —— store 已在调用 adapter
         * 前置写 record.baseHeight，回调内再调会形成无限递归。
         */
        const result = setGroundOffset(
            { record, viewer: getViewer(), Cesium: getCesium(), dataImport },
            Number(height) || 0,
        );
        if (!result.ok) message.warning(t('cesium.terrainOffsetUnsupported'));
        getViewer()?.scene?.requestRender?.();
    },
    /** 贴合地形（门面按类型分派：矢量 clamp / 3D Tiles 配准 / glTF 相对地形） */
    async fitToTerrain(id) {
        const record = findImportRecord(id);
        const Cesium = getCesium();
        if (!record || !Cesium) return { ok: false, reason: 'no-handle' };
        const result = await fitGroundPlacement({ record, viewer: getViewer(), Cesium, dataImport });
        if (result.ok) {
            message.success(t('cesium.terrainFitDone', { name: record.name }));
        } else if (result.reason === 'terrain-off') {
            message.warning(t('cesium.terrainFitNeedTerrain'));
        } else if (result.reason === 'unsupported') {
            message.info(t('cesium.terrainFitUnsupported'));
        } else {
            message.warning(t('cesium.terrainFitFailed'));
        }
        getViewer()?.scene?.requestRender?.();
        return result;
    },
    /**
     * 贴合到当前视野（区域化贴合，3D Tiles）。
     *
     * 为什么需要：单一刚性平移的下界由基底-地形高差跨度决定，大面积且起伏大的数据
     * 必然「一半埋、一半悬」。把估算范围收敛到当前视野内的采样点后，跨度显著变小，
     * 用户关注的那一片才能真正贴合。
     */
    async fitToTerrainInView(id) {
        const record = findImportRecord(id);
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!record || !Cesium || !viewer) return { ok: false, reason: 'no-handle' };

        const rect = viewer.camera?.computeViewRectangle?.(viewer.scene.globe.ellipsoid);
        if (!rect) {
            // 相机俯视地面失败（贴地平视 / 看向太空）时无有效视野范围
            message.warning(t('cesium.terrainFitUnsupported'));
            return { ok: false, reason: 'no-region' };
        }
        const region = {
            west: Cesium.Math.toDegrees(rect.west),
            south: Cesium.Math.toDegrees(rect.south),
            east: Cesium.Math.toDegrees(rect.east),
            north: Cesium.Math.toDegrees(rect.north),
        };
        const result = await fitGroundPlacement({ record, viewer, Cesium, dataImport, region });
        if (result.ok) {
            message.success(t('cesium.terrainFitDone', { name: record.name }));
        } else if (result.reason === 'terrain-off') {
            message.warning(t('cesium.terrainFitNeedTerrain'));
        } else {
            message.warning(t('cesium.terrainFitFailed'));
        }
        viewer.scene?.requestRender?.();
        return result;
    },
    /** 恢复数据自带原始高程（取消贴地） */
    resetTerrainFit(id) {
        const record = findImportRecord(id);
        const Cesium = getCesium();
        if (!record || !Cesium) return { ok: false, reason: 'no-handle' };
        const result = resetGroundPlacement({ record, viewer: getViewer(), Cesium, dataImport });
        if (result.ok) message.success(t('cesium.terrainResetDone', { name: record.name }));
        else message.warning(t('cesium.terrainResetFailed'));
        return result;
    },
    setMaterialMode(id, mode) {
        _rsvcSetMaterial?.({ id, mode });
    },
    reposition(id) {
        _rsvcReposition?.({ id });
    },
    stretchToHeight(id) {
        _rsvcStretchHeight?.({ id });
    },
    /**
     * 矢量样式应用（TOC 右键「样式设置」/ 样式页签定向修改）。
     * 分流：绘制成品走管理器句柄（按 id 定向，不污染后续绘制默认样式）；
     * 导入矢量走 DataSource 逐实体换色。
     */
    setStyle(id, patch) {
        if (drawMeasureFeature.isManaged(id)) {
            const ok = drawMeasureFeature.updateStyleById(id, patch);
            getViewer()?.scene?.requestRender?.();
            if (!ok) message.warning(t('cesium.drawMeasure.toast.failed'));
            return;
        }
        const Cesium = getCesium();
        const record = findImportRecord(id);
        if (!Cesium || !record) {
            console.warn('[CesiumContainer] setStyle 找不到可着色句柄', { id });
            return;
        }
        const applied = applyVectorDataSourceStyle(Cesium, toRaw(record.entity), patch, () => {
            getViewer()?.scene?.requestRender?.();
        });
        if (!applied) message.info(t('cesium.styleNotApplicable'));
    },
    /** 标注显隐（矢量类） */
    setLabelVisible(id, visible) {
        if (drawMeasureFeature.isManaged(id)) {
            const ok = drawMeasureFeature.setLabelVisible(id, visible);
            if (!ok) message.info(t('cesium.noLabelToToggle'));
            getViewer()?.scene?.requestRender?.();
            return;
        }
        const record = findImportRecord(id);
        const applied = setVectorLabelVisible(toRaw(record?.entity), visible);
        if (!applied) message.info(t('cesium.noLabelToToggle'));
        getViewer()?.scene?.requestRender?.();
    },
    /** 打开属性表（只读表格 + 行定位） */
    openAttributeTable(id) {
        return showAttributeTable(id);
    },
    /** 进入 / 退出要素编辑（仅绘制成品，顶点拖拽） */
    editFeature(id) {
        if (!drawMeasureFeature.isManaged(id)) {
            message.info(t('cesium.editReadOnly'));
            return false;
        }
        if (drawMeasureFeature.isEditing(id)) {
            drawMeasureFeature.stopVertexEdit();
            message.info(t('cesium.editStopped'));
            return true;
        }
        const started = drawMeasureFeature.startVertexEdit(id);
        if (started) message.info(t('cesium.editStarted'));
        else message.warning(t('cesium.editUnsupported'));
        return started;
    },
    /** 复制坐标为文本（成功返回 true） */
    copyCoordinates(id) {
        const shapes = collectLayerShapes(id);
        if (!shapes.length) {
            message.warning(t('cesium.noCoordinates'));
            return false;
        }
        const text = shapes
            .map((shape) => shape.lonLats.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join('\n'))
            .join('\n\n');
        void copyTextToClipboard(text).then((ok) => {
            if (ok) message.success(t('cesium.coordinatesCopied', { count: shapes.length }));
            else message.warning(t('cesium.copyCoordinatesFailed'));
        });
        return true;
    },
    /** 导出坐标为文件（geojson / csv / txt） */
    exportData(id, format) {
        const shapes = collectLayerShapes(id);
        const record = cesiumLayersStore.getRecord(id);
        const serialized = serializeShapes(shapes, format, { id, name: record?.name });
        if (!serialized) {
            message.warning(t('cesium.noCoordinates'));
            return false;
        }
        const baseName = sanitizeFileName(record?.name || id, 'cesium-layer');
        downloadTextFile(serialized.text, `${baseName}.${serialized.extension}`, serialized.mime);
        message.success(t('cesium.exported', { name: `${baseName}.${serialized.extension}` }));
        return true;
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
 * 地面大气相机高度渐隐（scene.preRender 每帧驱动）：
 * 低于渐隐下限全关（市/城乡/建筑尺度），高于上限全开（省/国家级视角），中间按 smoothstep 过渡
 */
let cleanupGroundAtmosphereFade = null;

/**
 * 触屏能力判定（pointer: coarse）：触屏默认隐藏坐标 HUD，桌面默认显示
 */
const isTouch = ref(
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches,
);

/**
 * 坐标显示：漫游模式下显示人物三维坐标+实时速度，否则显示鼠标位置。
 * 结构化为「位置 / 姿态 / 相机海拔」三组（标签与值分离，便于样式分层）：
 * 桌面端横向排布；触屏只取经纬度+海拔，单行展示，避免冗余。
 */
const coordinateGroups = computed(() => {
    const att = cameraAttitude.value;
    const pos = playerController.playerPosition.value;

    let positionValue;
    if (pos) {
        const speed = playerController.playerSpeed.value;
        const speedText = speed > 0.1 ? ` · 速度 ${speed.toFixed(1)} m/s` : '';
        positionValue = `经度 ${pos.lng.toFixed(6)}, 纬度 ${pos.lat.toFixed(6)}, 海拔 ${pos.height.toFixed(2)}米${speedText}`;
    } else {
        const coord = coordinateDisplay.value;
        // 未取到点时给出可读提示，而不是把 "--" 占位符直接甩给用户
        positionValue = coord.includes('--')
            ? '移动鼠标取点'
            : coord.replace(/:\s*/g, ' ');
    }

    return {
        roaming: !!pos,
        groups: [
            { key: 'position', label: '位置', value: positionValue },
            {
                key: 'attitude',
                label: '姿态',
                value: `方位 ${att.heading.toFixed(1)}° 俯仰 ${att.pitch.toFixed(1)}° 翻滚 ${att.roll.toFixed(1)}°`,
            },
            { key: 'camera', label: '相机海拔', value: `${att.height.toFixed(1)} 米` },
        ],
    };
});

/**
 * 触屏紧凑坐标：只保留经纬度 + 海拔，单行展示（模仿 OL 控制条）
 */
const mobileCoordinateText = computed(() => {
    const pos = playerController.playerPosition.value;
    if (pos) {
        return `${pos.lng.toFixed(4)}, ${pos.lat.toFixed(4)}, ${pos.height.toFixed(0)}m`;
    }

    const coord = coordinateDisplay.value;
    if (coord.includes('--')) return '移动鼠标取点';

    // 从「经度: x, 纬度: y, 海拔: z米」中提取数值，压缩为「x, y, zm」
    const nums = coord.match(/-?\d+(?:\.\d+)?/g) || [];
    if (nums.length >= 3) {
        return `${Number(nums[0]).toFixed(4)}, ${Number(nums[1]).toFixed(4)}, ${Number(nums[2]).toFixed(0)}m`;
    }
    return coord.replace(/:\s*/g, ' ');
});

/** 复制到剪贴板的纯文本：桌面逐行「标签: 值」，触屏用紧凑单行 */
const coordinateCopyText = computed(() => {
    if (isTouch.value) return mobileCoordinateText.value;
    return coordinateGroups.value.groups
        .map(group => `${group.label}: ${group.value}`)
        .join('\n');
});

async function copyActiveCoordinateDisplay() {
    const ok = await copyTextToClipboard(coordinateCopyText.value);
    if (ok) {
        message.success(t('cesium.copyCoordinateSuccess'));
    } else {
        message.warning(t('cesium.copyCoordinateFailed'));
    }
}

/** 坐标 HUD 显示开关：桌面默认显示、触屏默认隐藏；桌面与触屏均可切换 */
const hudVisible = ref(!isTouch.value);

/** 开关按钮标题：随显示状态切换语义 */
const hudToggleTitle = computed(() => (
    hudVisible.value ? t('cesium.collapseCoordHud') : t('cesium.expandCoordHud')
));

// ────────────────────────── 瓦片请求级别（与 OL zoom 同义） ──────────────────────────
/**
 * 当前视口的瓦片请求级别原始值（可为小数）。
 * 由相机离地高度经 viewScale canonical 链路反解为 OL zoom，保证同一视野下
 * 二维/三维显示同一个级别数；`initViewer` 的 postRender 逐帧刷新，量化后才写回。
 */
const tileZoomLevel = ref(null);

/**
 * 展示用的瓦片请求级别，取整规则与 OL `MapControlsBar.displayZoom` 完全一致：
 * z < 4 取 round（低层级可显示到 z=1），z ≥ 4 取 ceil（与 HDR 上层瓦片策略对齐）。
 */
const displayTileZoom = computed(() => {
    const z = Number(tileZoomLevel.value);
    if (!Number.isFinite(z)) return '--';
    if (z < 4) return String(Math.round(z));
    return String(Math.ceil(z));
});

/**
 * 按当前相机反解瓦片请求级别并写回（仅在整数量化值变化时触发响应式更新，避免逐帧渲染）。
 * @param {object} cam Cesium Camera
 * @param {object} viewer Cesium Viewer（取画布高度与视场角）
 */
function syncTileZoomLevel(cam, viewer) {
    const height = cam?.positionCartographic?.height;
    if (!Number.isFinite(height) || height <= 0) {
        if (tileZoomLevel.value !== null) tileZoomLevel.value = null;
        return;
    }
    const next = cesiumHeightToOlZoom({
        height,
        viewportHeight: viewer?.canvas?.clientHeight || undefined,
        fovY: Number(cam?.frustum?.fov) || undefined,
    });
    if (!Number.isFinite(next)) return;
    // 量化到 0.1 级：相机连续移动时避免每帧都触发 Vue 更新
    const quantized = Math.round(next * 10) / 10;
    if (tileZoomLevel.value !== quantized) tileZoomLevel.value = quantized;
}

/** 主页按钮：回到与 2D 一致的中国全境默认视角 */
function handleHomeClick() {
    flyToHome(1.2);
}

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
    const layerIndex = basemapId ? getUrlLayerNumberByBasemapId(basemapId) : null;
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
            index: Number.isInteger(layerIndex) ? layerIndex : null,
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
        if (applied) {
            syncBasemapToUrl({ id: normalizedPresetId, source: 'preset' });
        }
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

/**
 * 统一导入入口（3D 模式下 SidePanel 上传/共享资源/拖拽的落点）：
 * 接收 gisLoader 载荷（resources 即原始 File[]），转入 Cesium 导入管线。
 * 导入成功后经 syncFromImport 自动建档 → TOC「三维数据」分组接管管理。
 *
 * 返回值用 `loadedDataSources` **差集回读**：`handleDataImport` 内部会吞掉异常
 * （失败提示由 loader 自己发），因此「调用返回」不等于「真的建档」。只回 true/false
 * 会让调用方把「解析失败、什么都没加载」报成成功——Agent 搜索结果落图正是这种场景。
 *
 * @param {{resources?: File[], name?: string, overrideCrs?: string, silent?: boolean}} data
 * @returns {Promise<Object|null>} 本次新增的导入记录；未加载出任何数据时返回 null
 */
async function importUserData(data) {
    const files = Array.isArray(data?.resources) ? data.resources : [];
    if (!files.length) return null;
    const beforeIds = new Set(dataImport.loadedDataSources.value.map((item) => item.id));
    // 源坐标系覆盖值随载荷透传（TOC 上传区下拉），空串表示自动识别；
    // silent=true 供 Agent 搜索结果落图使用：不挂导入遮罩、不弹提示
    await handleDataImport({
        files,
        overrideCrs: data?.overrideCrs || '',
        silent: !!data?.silent,
    });
    return dataImport.loadedDataSources.value.find((item) => !beforeIds.has(item.id)) || null;
}

defineExpose({
    getViewer,
    getCesium,
    getCurrentViewState,
    waitForViewIdle,
    setBasemapById,
    activeBasemap,
    customXyzBasemapUrl,
    handleCustomBasemapSubmit,
    modelManager,
    cameraEnhanced,
    heightSampler,
    playerController,
    focusDistrictByAdcode,
    isReverseGeocodePickMode,
    toggleReverseGeocodePick,
    zoomToRemoteService,
    importUserData,
    /** 三维「重设源坐标系」：按导入期快照把原始数值重新解释为指定 CRS（仅 GeoJSON） */
    redeclareLayerCrs,
    /** ── 引擎感知迁移 P0/P2：绘制/测量 + 路线能力接口（HomeView 按引擎路由） ── */
    /** 交互激活：Point/LineString/Polygon/MeasureDistance/MeasureArea/Clear/UndoLastDrawing；不支持类型返回 false */
    activateCesiumInteraction: (type) => drawMeasureFeature.activateInteraction(type),
    /** 更新后续绘制默认样式（对齐 OL「影响后续绘制」语义） */
    updateCesiumDrawingStyle: (patch) => drawMeasureFeature.updateStyle(patch),
    /**
     * 按 id 修改单条三维图层样式（TOC 右键「样式设置」与侧栏样式页签共用入口）。
     * 经元数据店下发，保证 record.style 留痕与场景同步一致。
     * @param {string} id 图层 id（不含 cesium: 前缀）
     * @param {object} patch { fillColor, strokeColor, fillOpacity, strokeWidth }
     * @returns {boolean} 是否受理（类型不支持时 false）
     */
    updateCesiumLayerStyle: (id, patch) => cesiumLayersStore.setStyle(id, patch),
    /** 面板「完成」：返回 'ok' | 'need-more-points' | 'need-second-click' | 'not-drawing' | 'failed' */
    finishCesiumDraw: () => drawMeasureFeature.finish(),
    /** 面板「取消」：放弃进行中的交互，成品不受影响 */
    cancelCesiumDraw: () => drawMeasureFeature.cancel(),
    /** 定位到最近一条成品；无成品返回 false（宿主据此提示） */
    flyToCesiumDrawing: () => drawMeasureFeature.flyToLast(),
    /** 当前交互态快照 { drawing, mode, clickCount } */
    getCesiumDrawState: () => drawMeasureFeature.getState(),
    /** 公交起终点选点（Promise<{lng,lat}|null>，右击取消） */
    startRoutePointPick: (type) => routeFeature.startPointPick(type),
    /** 渲染公交方案（载荷为 RoutePlannerPanel 解析后的 route 对象） */
    drawCesiumBusRoute: (route) => routeFeature.drawBusRoute(route),
    /** 渲染驾车方案（载荷 { routeLatLonStr, stepLinePoints[] }） */
    drawCesiumDriveRoute: (payload) => routeFeature.drawDriveRoute(payload),
    zoomToCesiumRouteStep: (mode, stepIndex) => routeFeature.zoomToRouteStep(mode, stepIndex),
    previewCesiumRouteStep: (mode, stepIndex) => routeFeature.previewRouteStep(mode, stepIndex),
    clearCesiumStepPreview: (mode) => {
        if (mode === 'bus' || mode === 'drive') routeFeature.clearPreview();
        return true;
    },
    /** 视口跳转（常用地点 P1）：lng/lat 度 + 相机海拔米 */
    jumpTo(lng, lat, heightMeters) {
        const v = typeof viewer === 'object' ? viewer : null;
        const C = getCesium?.();
        if (!v?.camera || !C || !Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return false;
        v.camera.flyTo({
            destination: C.Cartesian3.fromDegrees(Number(lng), Number(lat), Math.max(1, Number(heightMeters) || 1)),
            duration: 1.2,
        });
        return true;
    },
    /** 射线实测当前视角地面分辨率（米/像素）；Precision 校正与 §44 误差报告数据源 */
    measureGroundResolution: () =>
        getCesiumGroundResolution(viewer)?.groundResolution ?? null,
    /** 当前相机海拔（米）；Precision 校正环读取用 */
    getCameraHeight() {
        const v = typeof viewer === 'object' ? viewer : null;
        const h = v?.camera?.positionCartographic?.height;
        return Number.isFinite(h) ? h : null;
    },
    /** 保持当前姿态，仅调整相机海拔（Precision 校正回写用） */
    setCameraHeightKeepOrientation(heightMeters) {
        const v = typeof viewer === 'object' ? viewer : null;
        const C = getCesium?.();
        if (!v?.camera || !C || !Number.isFinite(Number(heightMeters))) return;
        const carto = C.Cartographic.fromCartesian(v.camera.position);
        if (!carto) return;
        v.camera.setView({
            destination: C.Cartesian3.fromRadians(carto.longitude, carto.latitude, Number(heightMeters)),
            orientation: {
                heading: v.camera.heading,
                pitch: v.camera.pitch,
                roll: v.camera.roll,
            },
        });
    },
});

/**
 * 响应式转发：使用 computed 包装 loadedDataSources，
 * 避免在模板里写 dataImport.loadedDataSources.value（解包时不会响应化）。
 */
const pendingGltfFile = computed(() => dataImport.pendingGltfFile.value);
const repositionTarget = computed(() => dataImport.repositionTarget?.value);
/** GLTF 坐标弹窗的 busy / 失败信息（失败保留弹窗与输入，行内展示） */
const gltfLoading = computed(() => !!dataImport.gltfLoading.value);
const gltfLoadError = computed(() => dataImport.gltfLoadError.value || '');

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

/** 拖拽释放 — TOC 图层优先，其次文件导入 */
async function onDrop(event) {
    isDragOver.value = false;
    if (!cesiumReady.value) return;

    const transfer = event.dataTransfer;
    const hasFiles = !!transfer?.files?.length;
    // TOC 二维图层拖入（无文件 + 自定义 MIME）：直接上抛，由 HomeView 走右键导入同一投递链路；
    // cesium:/rsvc: 节点不在此通道（右键菜单同样没有该项），静默忽略
    if (!hasFiles && Array.from(transfer?.types || []).includes(TOC_LAYER_DRAG_MIME)) {
        const layerId = String(transfer.getData(TOC_LAYER_DRAG_MIME) || '').trim();
        if (layerId && !layerId.startsWith('cesium:') && !layerId.startsWith('rsvc:')) {
            emit('drop-ol-layer', { layerId });
        }
        return;
    }

    const files = transfer?.files;
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
    routeFlyState,
    cleanupTools,
    detachPlanarWorkingSet,
    detachRouteFlyWorkingSet,
} = useCesiumToolModules({
        fluidPanelRef,
        sceneActions,
        wind,
        playerController,
        // 三维分析（通视/限高）运行时依赖：viewer 与 Cesium 命名空间注入
        getViewer,
        getCesium,
        // 面状航线工作集注册桥：写入/移出统一图层管理（数据页签卡片 + TOC 同源）
        syncPlanarSource: syncPlanarSourceRecord,
        // 路线漫游工作集注册桥（同模式复用 wayline 图层分支）
        syncRouteFlySource: syncRouteFlySourceRecord,
});

// 面状航线托管数据源的固定 id（模块单工作集：测区+航线+起飞点）
const PLANAR_SOURCE_ID = 'planar_route_working';

// 路线漫游托管数据源的固定 id（手绘贴地线路 + CZML 漫游实体）
const ROUTE_FLY_SOURCE_ID = 'route_fly_working';

/**
 * 将面状航线工作集同步进 loadedDataSources（统一图层管理入口）。
 * 仅增删元数据记录，不动句柄——句柄由控制器自持；
 * 外部删除走 adapter.remove 的 wayline 分支先复位控制器。
 * @param {{ present: boolean, name: string, dataSource: object | null }} info 控制器上报
 */
function syncPlanarSourceRecord(info) {
    const list = dataImport.loadedDataSources.value || [];
    const exists = list.some((item) => item.id === PLANAR_SOURCE_ID);
    if (info?.present && info.dataSource && !exists) {
        dataImport.loadedDataSources.value = [
            ...list,
            {
                id: PLANAR_SOURCE_ID,
                name: info.name || t('cesium.module.planarRoute.msg.defaultRouteName'),
                type: 'wayline',
                entity: info.dataSource,
                managedByModule: true,
            },
        ];
    } else if (!info?.present && exists) {
        dataImport.loadedDataSources.value = list.filter((item) => item.id !== PLANAR_SOURCE_ID);
    }
}

/**
 * 路线漫游工作集同步（同 syncPlanarSourceRecord 模式）：
 * 仅增删元数据记录，句柄由控制器自持；外部删除先经 remove() 复位控制器。
 * @param {{ present: boolean, name: string, dataSource: object | null }} info 控制器上报
 */
function syncRouteFlySourceRecord(info) {
    const list = dataImport.loadedDataSources.value || [];
    const exists = list.some((item) => item.id === ROUTE_FLY_SOURCE_ID);
    if (info?.present && info.dataSource && !exists) {
        dataImport.loadedDataSources.value = [
            ...list,
            {
                id: ROUTE_FLY_SOURCE_ID,
                name: info.name || t('cesium.module.routeFly.sourceName'),
                type: 'wayline',
                entity: info.dataSource,
                managedByModule: true,
            },
        ];
    } else if (!info?.present && exists) {
        dataImport.loadedDataSources.value = list.filter((item) => item.id !== ROUTE_FLY_SOURCE_ID);
    }
}

/** 路线漫游 HUD 提示语（按状态切换）；语言包未热更新时逐级退回，最终空串隐藏 */
const routeFlyHudTip = computed(() => {
    const s = routeFlyState.value;
    const stateKey = s.isDrawing ? 'drawing' : s.isPaused ? 'paused' : s.isFlying ? 'flying' : 'ready';
    const tip = String(t(`cesium.module.routeFly.hud.${stateKey}`));
    if (!tip.startsWith('cesium.module.')) return tip;
    const statusText = String(t(`cesium.module.routeFly.status.${stateKey}`));
    return statusText.startsWith('cesium.module.') ? '' : statusText;
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
                    Array.isArray(runtimeMapTokens.value.ovitalTdtkeys)
                        ? runtimeMapTokens.value.ovitalTdtkeys.length
                        : 1,
                    Array.isArray(runtimeMapTokens.value.cesiumIonTokens)
                        ? runtimeMapTokens.value.cesiumIonTokens.length
                        : 1,
                    1,
                ));
                console.warn('[Cesium][boot] runtime tokens loaded', {
                    td: !!runtimeMapTokens.value.tiandituTk,
                    ovital: !!runtimeMapTokens.value.ovitalTdtkey,
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
                bindCameraViewSync({
                    initialSync: false,
                    getActivePresetId: () => activeBasemap.value,
                });
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
                syncBasemapToUrl({ id: activeBasemap.value });
                if (basemapReady && terrainReady) {
                    await waitForInitialSceneReady();
                    if (componentUnmounted) return;
                    bootSucceeded = true;
                    message.success(t('cesium.toast.basemapTerrainOk'));
                    return;
                }

                // 当前底图栈是否包含奥维（token 依赖）图层
                const activeStackHasOvital = resolvePresetLayerIds(activeBasemap.value)
                    .some((id) => resolveRuntimeTokenPoolKey(id) === 'ovital_tdtkey');

                const switchedTianditu = !basemapReady
                    ? markRuntimeMapTokenFailed('tianditu_tk')
                    : { switched: false };
                const switchedOvital = !basemapReady && activeStackHasOvital
                    ? markRuntimeMapTokenFailed('ovital_tdtkey')
                    : { switched: false };
                const switchedCesium = !terrainReady
                    ? markRuntimeMapTokenFailed('cesium_ion_token')
                    : { switched: false };
                const switched = switchedTianditu.switched || switchedOvital.switched || switchedCesium.switched;
                if (!switched) {
                    bootError = new Error('Cesium basemap or terrain failed to initialize');
                    message.error(t('cesium.toast.basemapTerrainFail'), { closable: true });
                    return;
                }

                runtimeMapTokens.value = switchedCesium.switched
                    ? switchedCesium.tokens
                    : switchedOvital.switched
                        ? switchedOvital.tokens
                        : switchedTianditu.tokens;
                resetCesiumViewerForRetry();
                retryCount += 1;
                console.warn('[Cesium][boot] token switch retry', {
                    retryCount,
                    tdSwitched: !!switchedTianditu.switched,
                    ovitalSwitched: !!switchedOvital.switched,
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
    cleanupInfoBoxTheme();
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
    // 恢复 creditDisplay 原生方法，避免 destroy 链中断后渲染循环带着空 _scene 残留
    restoreCreditDisplay(viewer);
    try {
        viewer.destroy();
    } catch (error) {
        console.warn('Cesium viewer retry cleanup warning:', error);
        haltViewerRenderLoop(viewer);
    }
    viewer = null;
}

/**
 * 强制停掉 viewer 内部渲染循环。
 * destroy() 中途抛异常时 destroyObject 未执行、isDestroyed() 仍返回 false，
 * 渲染循环会在下一帧 resize() 里读已销毁的 _scene 而崩溃（Rendering has stopped）。
 */
function haltViewerRenderLoop(v) {
    try {
        const widget = v?.cesiumWidget || v?._cesiumWidget;
        if (widget && !widget.isDestroyed()) {
            widget._useDefaultRenderLoop = false;
            widget._renderLoopRunning = false;
        }
    } catch { /* ignore */ }
}

/** 体积云集成清理函数 */
let cloudCleanup = null;

/**
 * 初始化 Cesium Viewer 实例
 * 构造 viewer → 配置时间系统 → 太阳光照 → 信用隐藏 → 底图同步 → 相机恢复 → 体积云集成
 * 设置模块级 viewer 变量，供所有 composable 通过 getViewer() 访问
 */
function initViewer() {
    // 贴地策略注册自检：能力表声明需要贴地却没有策略实现的类型会在此告警，
    // 避免「菜单有按钮、点了没反应」的静默失效
    assertGroundPlacementRegistry();

    // viewer 重建（重试链路）：复位绘制/路线句柄表，防止残留旧 viewer 的死实体引用
    try { drawMeasureFeature.reset(); } catch { /* ignore */ }
    try { drawMeasureStore.reset(); } catch { /* ignore */ }
    try { routeFeature.reset(); } catch { /* ignore */ }

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
        // 按 devicePixelRatio（物理像素）渲染。Cesium ≥1.62 默认 true：画布只按 CSS 像素渲染，
        // Windows 125%/150% 显示缩放下瓦片被浏览器整体拉伸 → 影像发虚（同屏 OL 按物理像素渲染，
        // 对比明显更清晰）。代价是 HiDPI 下填充像素增多，已有 requestRenderMode 按需渲染兜底。
        //改善cesium瓦片渲染质量
        useBrowserRecommendedResolution: false,
    });
    // FPS 面板保留常开：按需渲染（requestRenderMode）下低 FPS = 空闲降载省电（预期行为，非卡顿），
    // 交互瞬间回升——恰是验证按需渲染生效的直接仪表；如嫌干扰可改 false，不影响功能
    viewer.scene.debugShowFramesPerSecond = true;
    viewer.scene.globe.terrainExaggeration = 1;
    viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0;
    // 影像未加载/瓦片缺失时露出的球体底色：Cesium 默认深蓝，改白
    viewer.scene.globe.baseColor = Cesium.Color.WHITE;
    // 纯白画布背景：关闭默认深蓝星空盒，空间区域与透明瓦片底色统一为白色
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    viewer.scene.backgroundColor = Cesium.Color.WHITE;
    // 地面大气效果：Cesium 库默认开启（globe.showGroundAtmosphere 初始 true），
    // 按需求默认改为关闭；如需开启可在「高级效果」面板动态切换
    viewer.scene.globe.showGroundAtmosphere = false;
    configureBeijingTimeSystem(viewer, Cesium);
    configureSolarLighting(viewer);
    // 按需渲染管理器：逐帧特效经 acquire/release 计数接管，计数归零进入按需渲染
    // （总开关在 useCesiumRenderMode.js，改 false 可一行回退恒连续渲染）
    initRequestRenderMode(viewer);

    installCreditHider();
    bindLayerPickerStateSync();
    // InfoBox 主题化：向其 iframe 注入白底深字样式，并跟随主题切换
    bindInfoBoxTheme();
    watchThemeChange();
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
        // 瓦片请求级别（与 OL zoom 同义）：量化写回，仅在整数量化值变化时触发渲染
        syncTileZoomLevel(cam, viewer);
    });

    // 地面大气相机高度渐隐：每帧按相机高度插值（市/建筑尺度自动关闭，省/国家级自动开启）
    cleanupGroundAtmosphereFade = viewer.scene.preRender.addEventListener(updateGroundAtmosphereFade);
    if (import.meta.env.DEV) console.warn('[大气渐隐] preRender 监听已注册');

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
    handleDataReposition,
    handleDataStretchHeight,
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

// 惰性引用回填：adapter 闭包在调用时通过这些引用触达 ops 处理器
_rsvcSetMaterial = handleDataSetMaterial;
_rsvcReposition = handleDataReposition;
_rsvcStretchHeight = handleDataStretchHeight;

onUnmounted(() => {
    componentUnmounted = true;
    hideLoading();
    _cancelInitialSceneWait?.();
    _cancelInitialSceneWait = null;
    cesiumReady.value = false;
    unregisterEngineHandlers('cesium');

    // 绘制/路线管理器复位（取消进行中交互、清空句柄表；实体随下方 viewer.destroy 释放）
    try { drawMeasureFeature.reset(); } catch { /* ignore */ }
    // 面板状态同步清空：3D 场景已销毁，残留读数 / 记录会成为无法定位的孤儿数据
    try { drawMeasureStore.reset(); } catch { /* ignore */ }
    try { routeFeature.reset(); } catch { /* ignore */ }

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

    // 清理共享地形 Worker 池（释放 Worker 线程资源）。
    // 用静态导入调用，不再 import()：那两个模块本就在静态图里，
    // 动态引入无法分包，只会触发 INEFFECTIVE_DYNAMIC_IMPORT 与空 chunk
    destroySharedLercPool?.();
    destroySharedGeoDecodePool?.();

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

    // 清理地面大气高度渐隐
    if (cleanupGroundAtmosphereFade) {
        cleanupGroundAtmosphereFade();
        cleanupGroundAtmosphereFade = null;
    }

    cleanupCreditHider();
    cleanupNavigation();
    cleanupInfoBoxTheme();
    dataImport.clearAllDataSources();
    if (viewer) {
        restoreCreditDisplay(viewer);
        try {
            viewer.destroy();
        } catch (e) {
            console.warn('Cesium viewer destroy warning:', e);
            haltViewerRenderLoop(viewer);
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
 * 地面大气有效光强：基础滑块值 + Tellux 月光增益，钳位防过曝。
 * applyAtmosphereParams（直控）与高度渐隐（逐帧）共用，保证两处写入同一基准。
 */
function computeGroundAtmosphereBaseIntensity() {
    const p = baseAtmosphereParams.value;
    const tp = atmosphereParams.value;
    const base = p.atmosphereLightIntensity ?? 5.5;
    const MOON_BOOST_MAX = 4.0;
    const moonBoost = tp.moonLightEnabled !== false ? (tp.moonLightIntensity ?? 0.18) * MOON_BOOST_MAX : 0;
    // 钳位下限不得低于用户基准值：滑杆量程 0~25（默认 16），若硬钳 12 会把滑杆上半段静默吞掉；
    // 月光增益叠加时仍受软顶控制防过曝
    return Math.min(base + moonBoost, Math.max(base, 12.0));
}

// 渐隐系数缓存：系数未显著变化时不重复写属性/触发渲染
let lastGroundAtmosphereFadeFactor = -1;

/**
 * 相机高度驱动的地面大气渐隐（scene.preRender 每帧回调）。
 * showGroundAtmosphere 与 AutoFade 均开启时接管 globe.atmosphereLightIntensity / showGroundAtmosphere；
 * 散射颜色随光强线性缩放（见 computeAtmosphereColor.glsl），渐隐到 0 即无痕消失，不会出现暗带。
 */
function updateGroundAtmosphereFade() {
    const globe = viewer?.scene?.globe;
    if (!globe) return;
    const p = baseAtmosphereParams.value;
    // 体积云互斥兜底：Bruneton Aerial 与原生地面大气叠加会白屏闪烁。
    // 多条路径（Tellux 大气启用/洪水面板/Tellux 快照恢复）绕过参数直写 globe，
    // 体积云存活期间逐帧压制，确保原生地面大气始终关闭（UI 参数不动，关闭体积云后自动恢复）
    if (cloudParams.value.cloudsEnabled === true && globe.showGroundAtmosphere) {
        globe.showGroundAtmosphere = false;
    }
    const fadeActive = p.groundAtmosphereAutoFade === true && p.showGroundAtmosphere === true;
    if (!fadeActive) {
        // 从「渐隐接管」切回直控后恢复一次即可，避免每帧重复写
        if (lastGroundAtmosphereFadeFactor >= 0) {
            lastGroundAtmosphereFadeFactor = -1;
            if ('atmosphereLightIntensity' in globe) globe.atmosphereLightIntensity = computeGroundAtmosphereBaseIntensity();
            globe.showGroundAtmosphere = p.showGroundAtmosphere === true;
            viewer.scene.requestRender?.();
        }
        return;
    }
    const low = p.groundAtmosphereFadeLowHeight ?? 100000;
    const high = p.groundAtmosphereFadeHighHeight ?? 500000;
    const height = viewer.camera.positionCartographic.height;
    const t = Cesium.Math.clamp((height - low) / Math.max(high - low, 1), 0, 1);
    // smoothstep 缓动：两端平滑、中段近似线性，视觉过渡更自然
    const factor = t * t * (3 - 2 * t);
    const fadeStep = Math.abs(factor - lastGroundAtmosphereFadeFactor);
    // 系数未显著变化时不写属性、不触发渲染（requestRenderMode 下避免每帧空转连续重绘）；
    // 仅「从正系数首次落到 0」这一次强制落盘，确保最后一帧残留清零，其余 factor=0 帧直接返回
    if (fadeStep < 0.002 && !(factor === 0 && lastGroundAtmosphereFadeFactor > 0)) return;
    if (import.meta.env.DEV && fadeStep >= 0.1) {
        console.warn(`[大气渐隐] 高度=${(height / 1000).toFixed(0)}km 系数=${factor.toFixed(2)} 地面大气=${factor > 0 ? '开' : '关'}`);
    }
    lastGroundAtmosphereFadeFactor = factor;
    if ('atmosphereLightIntensity' in globe) {
        globe.atmosphereLightIntensity = computeGroundAtmosphereBaseIntensity() * factor;
    }
    // 完全渐隐时直接关闭渲染：近地面无残留，也省掉地面大气的着色开销
    globe.showGroundAtmosphere = factor > 0;
    viewer.scene.requestRender?.();
}

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

    // 天空大气（地球外环光晕）：光强按比例放大延伸渐隐尾部（厚度且保渐变）；
    // 亮度偏移过大会压平渐变并在壳边界形成硬边；Rayleigh 标高控制渐变衰减距离
    const sky = scene.skyAtmosphere;
    if (sky) {
        // Cesium 1.121+ 属性更名：SkyAtmosphere.lightIntensity → atmosphereLightIntensity（引擎默认 50）
        // 旧属性名在 1.132 中不存在，会被下方 `'lightIntensity' in sky` 防御检查静默跳过，导致参数"不生效"
        if ('atmosphereLightIntensity' in sky) sky.atmosphereLightIntensity = params.skyAtmosphereLightIntensity;
        else if ('lightIntensity' in sky) sky.lightIntensity = params.skyAtmosphereLightIntensity; // 兼容 Cesium < 1.121 旧属性名
        if ('brightnessShift' in sky) sky.brightnessShift = params.skyAtmosphereBrightnessShift;
        if ('saturationShift' in sky) sky.saturationShift = params.skyAtmosphereSaturationShift;
        if ('atmosphereRayleighScaleHeight' in sky) sky.atmosphereRayleighScaleHeight = params.skyAtmosphereRayleighScaleHeight;
    }

    if (scene.sun) scene.sun.show = params.sunShow;
    if (scene.moon) scene.moon.show = params.moonShow;
    // 体积云管线存活期间原生 skyBox/skyAtmosphere 由 Bruneton 接管，
    // 面板任何参数变动都不得重开（否则复现白屏闪烁/双大气）
    if (!isCloudPipelineActive(viewer) && scene.skyBox) {
        scene.skyBox.show = params.skyBoxShow;
    }

    // 渐隐激活时本函数会覆盖渐隐的写入，强制下一帧无条件重写恢复
    lastGroundAtmosphereFadeFactor = -1;

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
function applyAtmosphereParams(_params) {
    if (!viewer || !Cesium) return;
    const scene = viewer.scene;
    const globe = scene.globe;

    // 月光强度贡献：叠加到 atmosphereLightIntensity 基础值之上（与高度渐隐共用同一基准计算）
    if (globe && 'atmosphereLightIntensity' in globe) {
        globe.atmosphereLightIntensity = computeGroundAtmosphereBaseIntensity();
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

/* 坐标 HUD（右下角，圆角胶囊）：左侧显隐开关 + 右侧「位置 / 姿态 / 相机海拔」三组数据。
   桌面端默认显示、触屏默认隐藏；桌面与触屏均可通过开关切换。
   视觉基线对齐 OL MapControlsBar：同款浅色玻璃外壳 + 内层品牌色胶囊 + 等宽数值字体，
   两套引擎的坐标面板应看起来几乎无差别。 */
.coordinate-display {
    position: absolute;
    bottom: 35px;
    right: 8px;
    z-index: var(--z-panel);
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 4px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--text-brand-dark);
    font-family: 'JetBrains Mono', 'Fira Code', 'Roboto Mono', monospace;
    font-size: 13px;
    line-height: 1.5;
    box-shadow:
        var(--toc-shadow-md),
        inset 0 1px 0 rgba(255, 255, 255, 0.6);
    user-select: none;
    max-width: calc(100vw - 48px);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

/* 显隐开关：与 OL 控制条保持一致的圆形按钮 */
.coord-toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.92);
    color: var(--brand-accent-dark);
    cursor: pointer;
    flex-shrink: 0;
    transition:
        transform 0.15s ease,
        background 0.15s ease,
        color 0.15s ease;
}

.coord-toggle-btn:hover {
    background: var(--toc-primary-bg-hover);
}

.coord-toggle-btn:active {
    transform: scale(0.94);
}

.coord-toggle-btn svg {
    width: 17px;
    height: 17px;
}

/* 坐标段包裹层：与 OL .coordinate-section 同构，负责关闭态整体让位与触屏收缩 */
.coordinate-section {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
}

/* 数据区：内层品牌色胶囊，点击复制当前坐标（对齐 OL .coordinate-display） */
.coordinate-copy-area {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    height: 36px;
    padding: 0 14px;
    border: 1px solid transparent;
    border-radius: 9999px;
    background: rgba(var(--brand-primary-rgb), 0.06);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.coordinate-copy-area:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
}

/* 复制图标：默认隐去，悬停/聚焦浮现；触屏常显（触屏无 hover 态） */
.coordinate-copy-icon {
    flex-shrink: 0;
    color: var(--toc-text-secondary);
    opacity: 0;
    transition: opacity 0.15s ease, color 0.15s ease;
}

.coordinate-copy-area:hover .coordinate-copy-icon,
.coordinate-copy-area:focus-visible .coordinate-copy-icon {
    color: var(--brand-accent-dark);
    opacity: 1;
}

/* 触屏紧凑坐标文本：经纬度 + 海拔单行展示 */
.coordinate-mobile-text {
    min-width: 0;
    color: var(--text-brand-dark);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.03em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

/* 漫游态徽标 */
.coordinate-display-badge {
    padding: 1px 6px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.4);
    border-radius: 9999px;
    background: var(--brand-primary-bg);
    color: var(--brand-primary-dark);
    font-family: var(--font-zh);
    font-size: 10px;
    font-weight: 700;
    line-height: 1.5;
    white-space: nowrap;
}

/* 数据组：桌面横排，组间细竖线分隔；空间不足时收缩并省略，避免撑破胶囊 */
.coordinate-display-groups {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    overflow: hidden;
}

.coordinate-group {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
}

.coordinate-group + .coordinate-group {
    padding-left: 10px;
    border-left: 1px solid rgba(var(--brand-primary-rgb), 0.18);
}

/* 组名用无衬线品牌色，与等宽数值形成主次对比（字重/字距对齐 OL 坐标文本） */
.coordinate-group-label {
    flex-shrink: 0;
    color: var(--brand-primary);
    font-family: var(--font-zh);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
}

.coordinate-group-value {
    /* flex 子项默认 min-width:auto 会拒绝收缩到内容宽度以下，
       移动端换行时必须显式置 0，否则长坐标会撑破卡片 */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-brand-dark);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.03em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

/* 瓦片请求级别：与 OL .zoom-level-display 同尺寸同配色 */
.zoom-level-display {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #ffffff;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    color: var(--brand-accent-dark);
    font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
}

/* 竖发丝分隔线：与 OL .divider 同规格 */
.divider {
    width: 1px;
    height: 20px;
    background-color: rgba(var(--brand-primary-rgb), 0.18);
    flex-shrink: 0;
}

/* 主页按钮：与 OL .home-btn 同款品牌渐变圆形按钮 */
.home-btn {
    width: 36px;
    height: 36px;
    position: relative;
    overflow: hidden;
    border-radius: 50%;
    background: var(--brand-gradient);
    border: none;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    box-shadow:
        0 3px 9px rgba(var(--brand-primary-dark-rgb), 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
    transition:
        transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
        filter 0.2s ease,
        box-shadow 0.2s ease;
}

.home-btn:hover {
    filter: brightness(1.07);
    transform: scale(1.06);
    box-shadow:
        0 5px 14px rgba(var(--brand-primary-dark-rgb), 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.home-btn:active {
    transform: scale(0.94);
}

@media (pointer: coarse) {
    /* 触屏默认右侧竖列：只保留缩放级别 / 主页 / 坐标开关（对齐 OL 收起态） */
    .coordinate-display {
        bottom: 38px;
        right: 12px;
        max-width: calc(100vw - 24px);
        font-size: 12px;
        flex-direction: column;
        gap: 8px;
        padding: 8px 6px;
        border-radius: 999px;
    }

    /* 展开坐标时恢复桌面式横向一行；收起时保持竖列 */
    .coordinate-display.coord-open {
        flex-direction: row;
        gap: 8px;
        padding: 4px;
        border-radius: 9999px;
    }

    .coordinate-display.coord-open .coordinate-section,
    .coordinate-display.coord-open .coordinate-copy-area {
        min-width: 0;
        flex: 1 1 auto;
    }

    /* 触屏开关 ≥40px，图标同步放大 */
    .coord-toggle-btn {
        width: 40px;
        height: 40px;
    }

    .coord-toggle-btn svg {
        width: 20px;
        height: 20px;
    }

    /* 触屏保持与 OL 一致的横向胶囊；紧凑文本单行，窄屏省略。
       字号收到 12px：横向展开时固定控件已占 ~123px，需为「经度, 纬度, 海拔」留足宽度 */
    .coordinate-mobile-text {
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* 触屏无 hover 态：复制图标常显（对齐 OL 触屏展开时复制按钮常显） */
    .coordinate-copy-icon {
        opacity: 0.55;
    }

    /* 触屏数据区高度 ≥40px（规范 §3 移动端基线），内边距/间距收紧避免挤占文本宽度 */
    .coordinate-copy-area {
        height: 40px;
        gap: 6px;
        padding: 0 10px;
    }

    /* 竖列态分隔线转横线，宽度跟随容器（对齐 OL 触屏竖列） */
    .divider {
        width: 60%;
        height: 1px;
    }

    /* 横向展开态分隔线改回竖发丝线 */
    .coordinate-display.coord-open .divider {
        width: 1px;
        height: 20px;
    }

    /* 触屏可点击目标 ≥40px，图标 glyph 同步放大（规范 §3 移动端基线） */
    .zoom-level-display {
        width: 40px;
        height: 40px;
        font-size: 16px;
    }

    .home-btn {
        width: 42px;
        height: 42px;
    }

    .home-btn svg {
        width: 22px;
        height: 22px;
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

/* 主题化：白底 + 品牌绿实色（原为深海军蓝 + 青/绿字） */
:global(.cesium-performanceDisplay) {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    padding: 3px 11px !important;
    background: #fff !important;
    border: 1px solid var(--brand-primary) !important;
    border-radius: 999px !important;
    color: var(--brand-primary-dark) !important;
    font: 600 11px 'Consolas', 'Courier New', monospace !important;
    line-height: 1.5;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}

/* FPS 用固定蓝（#2563eb，对白约 5.2:1 过 AA），MS 用品牌暖金深色 ——
   两者色相明显不同、一眼可辨；
   --brand-gold-dark 是主题专门为「浅底上的金色文字」准备的档位（对白约 4.9:1，过 AA），
   且金与绿、金与蓝都是经典配对，两套主题通用，无需按主题分化。
   FPS 用常量蓝而非 --brand-primary，是为了保证绿/蓝两套主题下 FPS 始终是同一个蓝、
   不随主题主色变来变去。 */
:global(.cesium-performanceDisplay-fps) {
    color: #2563eb !important;
    font-weight: 800 !important;
    font-size: 12px !important;
}

:global(.cesium-performanceDisplay-ms) {
    color: var(--brand-gold-dark) !important;
    font-weight: 800 !important;
    font-size: 12px !important;
}

/* 渲染被节流（throttled）：告警态用红，与上面两色都不同 */
:global(.cesium-performanceDisplay-throttled) {
    color: #dc2626 !important;
    font-weight: 800 !important;
}

/* —— InfoBox 属性卡片：白底 + 品牌绿（Cesium 原生为暗色卡片）——
   InfoBox 位于右侧抽屉，与右上角 FPS 胶囊同处一片区域。
   注意 .cesium-viewer-infoBoxContainer 本身是 static 元素（z-index 不生效），
   故层级必须加在 position:absolute 的 .cesium-infoBox 上，
   让卡片完整盖住 FPS 胶囊而非两者交叠。 */
:global(.cesium-infoBox) {
    z-index: calc(var(--z-panel) + 5);
    background: #fff !important;
    color: var(--text-primary) !important;
    border: 1px solid var(--brand-primary) !important;
    border-right: none !important;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18) !important;
}

:global(.cesium-infoBox-title) {
    background: var(--brand-gradient) !important;
    color: #fff !important;
    font-weight: 700;
}

/* 相机定位按钮：白底品牌描边 + 品牌色图标（挂在绿色标题栏上） */
:global(button.cesium-infoBox-camera) {
    background: #fff !important;
    border: 1px solid var(--brand-primary) !important;
    color: var(--brand-primary) !important;
    fill: var(--brand-primary) !important;
}

/* 关闭按钮：标题栏为品牌渐变，故用白字；hover 转品牌深色实底 */
:global(button.cesium-infoBox-close) {
    color: #fff !important;
    background: transparent !important;
}

:global(button.cesium-infoBox-close:hover) {
    background: var(--brand-primary-dark) !important;
    color: #fff !important;
}

:global(button.cesium-infoBox-close:focus) {
    background: var(--brand-primary-dark) !important;
    outline: none !important;
}

/* 描述 iframe 本体为白底（iframe 内文字颜色由 useCesiumInfoBoxTheme 注入） */
:global(.cesium-infoBox-iframe) {
    background: #fff !important;
}

/* 移动端导航样式已迁移至 vendors/cesium-navigation/styles/cesium-navigation.css（"移动端适配"段），勿在此重复定义 */


:global(.cesium-geocoder .search-results) {
    z-index: 1401;
}

/* ============================================================
   Cesium 原生控件主题化：统一使用应用品牌主题色
   覆盖 顶部工具栏按钮 / 搜索框 / 左下动画控件 / 底部时间轴 / 底图选择器。
   全部使用「白色底 + 品牌实色」覆写，不使用半透明玻璃效果
   （Cesium 控件层级复杂，半透明叠加后发灰失真，故一律实色）。
   颜色取自 --brand-* 令牌，随 [data-theme] 联动（绿/蓝主题自动跟随）。
   widgets.css 在运行时注入、晚于本组件 CSS，故统一加 !important 确保生效。
   ============================================================ */

/* —— 顶部工具栏按钮（home / 2D-3D / 底图 / 全屏，共用 .cesium-button）—— */
:global(.cesium-button) {
    background: #fff !important;
    border: 1px solid var(--brand-primary) !important;
    color: var(--brand-primary-dark) !important;
    fill: var(--brand-primary) !important;
    border-radius: 8px !important;
}
:global(.cesium-button:hover) {
    color: #fff !important;
    fill: #fff !important;
    background: var(--brand-primary) !important;
    border-color: var(--brand-primary-dark) !important;
    box-shadow: 0 0 8px rgba(var(--brand-primary-rgb), 0.45) !important;
}
:global(.cesium-button:focus) {
    color: var(--brand-primary-dark) !important;
    fill: var(--brand-primary) !important;
    border-color: var(--brand-primary-dark) !important;
    outline: none !important;
}
:global(.cesium-toolbar-button) {
    border-radius: 9px !important;
}

/* —— 搜索（Geocoder）输入框与按钮 —— */
:global(.cesium-viewer-geocoderContainer .cesium-geocoder-input) {
    background-color: #fff !important;
    border: 1px solid var(--brand-primary) !important;
    color: var(--text-primary) !important;
}
:global(.cesium-viewer-geocoderContainer:hover .cesium-geocoder-input) {
    border-color: var(--brand-primary-dark) !important;
    box-shadow: 0 0 8px rgba(var(--brand-primary-rgb), 0.35) !important;
}
:global(.cesium-viewer-geocoderContainer .cesium-geocoder-input:focus) {
    border-color: var(--brand-primary-dark) !important;
    background-color: #fff !important;
    box-shadow: none !important;
    outline: none !important;
}
:global(.cesium-geocoder-searchButton) {
    background-color: var(--brand-primary) !important;
    fill: #fff !important;
}
:global(.cesium-geocoder-searchButton:hover) {
    background-color: var(--brand-primary-dark) !important;
}
:global(.cesium-viewer-geocoderContainer .search-results) {
    background-color: #fff !important;
    color: var(--text-primary) !important;
    border: 1px solid var(--brand-primary) !important;
    border-radius: 8px !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18) !important;
    opacity: 1 !important;
}
:global(.cesium-viewer-geocoderContainer .search-results ul li:hover) {
    background: var(--brand-primary-bg) !important;
    color: var(--brand-primary-dark) !important;
}
:global(.cesium-viewer-geocoderContainer .search-results ul li.active) {
    background: var(--brand-primary) !important;
    color: #fff !important;
}

/* —— 左下角动画控件（Animation）重新设计 ——
   原生控件是「深色圆盘 + 深色文字」，套主题色后绿底绿字几乎不可读。
   现改为：白色外圈(品牌绿描边) → 品牌浅绿内环 → 纯白表盘(深色时间文字)，
   按钮为品牌绿实底 + 白色图标，昼夜弧线与指针用品牌绿，整体为实色。
   注意 Cesium 会给该控件注入 SVG 渐变 fill，故需直接覆写 fill 才能压过渐变。 */
:global(.cesium-animation-themeNormal) { color: var(--brand-primary) !important; }
:global(.cesium-animation-themeHover) { color: var(--brand-primary-dark) !important; }
:global(.cesium-animation-themeSelect) { color: var(--brand-primary-dark) !important; }
:global(.cesium-animation-themeDisabled) { color: var(--text-muted) !important; }
:global(.cesium-animation-themeKnob) { color: var(--brand-primary-bg) !important; }
:global(.cesium-animation-themePointer) { color: var(--brand-primary-dark) !important; }
:global(.cesium-animation-themeSwoosh) { color: var(--brand-primary) !important; }
:global(.cesium-animation-themeSwooshHover) { color: var(--brand-primary-dark) !important; }

/* 表盘三层：外圈白底 / 内环浅绿 / 中心纯白 —— 保证深色时间文字清晰 */
:global(.cesium-animation-shuttleRingBack) {
    fill: #fff !important;
    fill-opacity: 1 !important;
    stroke: var(--brand-primary) !important;
    stroke-width: 2 !important;
}
:global(.cesium-animation-knobOuter) {
    fill: var(--brand-primary-bg) !important;
    stroke: var(--brand-primary) !important;
    stroke-width: 1.5 !important;
}
:global(.cesium-animation-knobInner) { fill: #fff !important; }
:global(.cesium-animation-svgText) { fill: var(--text-primary) !important; }

/* 昼夜弧线与时间指针 */
:global(.cesium-animation-shuttleRingG .cesium-animation-shuttleRingSwoosh) { fill: var(--brand-primary) !important; }
:global(.cesium-animation-shuttleRingG:hover .cesium-animation-shuttleRingSwoosh) { fill: var(--brand-primary-dark) !important; }
:global(.cesium-animation-shuttleRingSwoosh line) {
    stroke: var(--brand-primary-dark) !important;
    stroke-opacity: 1 !important;
}
:global(.cesium-animation-shuttleRingPointer) { fill: var(--brand-primary-dark) !important; }

/* 播放/暂停/倍速按钮：品牌绿实底 + 白色图标 */
:global(.cesium-animation-rectButton .cesium-animation-buttonMain) {
    fill: var(--brand-primary) !important;
    stroke: var(--brand-primary-dark) !important;
    stroke-width: 1 !important;
}
:global(.cesium-animation-rectButton:hover .cesium-animation-buttonMain) {
    fill: var(--brand-primary-dark) !important;
    stroke: var(--brand-primary-dark) !important;
}
:global(.cesium-animation-rectButton .cesium-animation-buttonPath) { fill: #fff !important; }
:global(.cesium-animation-rectButton .cesium-animation-buttonGlow) { fill: var(--brand-primary-light) !important; }
:global(.cesium-animation-buttonToggled .cesium-animation-buttonMain) { fill: var(--brand-primary-dark) !important; }
:global(.cesium-animation-buttonDisabled .cesium-animation-buttonMain) { fill: var(--text-muted) !important; }
:global(.cesium-animation-buttonDisabled .cesium-animation-buttonPath) { fill: #fff !important; }

/* —— 底部时间轴（Timeline）：白色实底 + 品牌刻度 —— */
:global(.cesium-timeline-main) { border: solid 1px var(--brand-primary) !important; }
:global(.cesium-timeline-trackContainer) { border-top: solid 1px var(--brand-primary) !important; }
:global(.cesium-timeline-bar) { background: #fff !important; }
:global(.cesium-timeline-ticLabel) { color: var(--text-primary) !important; }
:global(.cesium-timeline-ticMain) { background: var(--brand-primary) !important; }
:global(.cesium-timeline-ticSub) { background: var(--brand-primary-light) !important; }
:global(.cesium-timeline-ticTiny) { background: var(--brand-primary-lighter) !important; }
:global(.cesium-timeline-highlight) { background: var(--brand-primary-bg) !important; }
:global(.cesium-timeline-needle) { background: var(--brand-primary-dark) !important; }

/* —— 底图选择器下拉面板（工具栏「图层」按钮展开）—— */
:global(.cesium-baseLayerPicker-dropDown) {
    background-color: #fff !important;
    border: 1px solid var(--brand-primary) !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2) !important;
}
:global(.cesium-baseLayerPicker-sectionTitle),
:global(.cesium-baseLayerPicker-categoryTitle) {
    color: var(--text-primary) !important;
}
:global(.cesium-baseLayerPicker-choices) {
    border: 1px solid var(--brand-primary-light) !important;
}
:global(.cesium-baseLayerPicker-itemLabel) {
    color: var(--text-secondary) !important;
}
:global(.cesium-baseLayerPicker-item:hover .cesium-baseLayerPicker-itemLabel),
:global(.cesium-baseLayerPicker-item:focus .cesium-baseLayerPicker-itemLabel) {
    color: var(--brand-primary-dark) !important;
}
:global(.cesium-baseLayerPicker-itemIcon) {
    border: 1px solid var(--brand-primary) !important;
}
:global(.cesium-baseLayerPicker-item:hover .cesium-baseLayerPicker-itemIcon) {
    border-color: var(--brand-primary-dark) !important;
    box-shadow: 0 0 8px rgba(var(--brand-primary-rgb), 0.45) !important;
}
:global(.cesium-baseLayerPicker-selectedItem .cesium-baseLayerPicker-itemLabel) {
    color: var(--brand-primary-dark) !important;
}
:global(.cesium-baseLayerPicker-selectedItem .cesium-baseLayerPicker-itemIcon) {
    border: double 3px var(--brand-primary) !important;
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

/* 路线漫游状态 HUD：底部居中悬浮，避开左右面板 */
.route-fly-hud {
    position: fixed;
    left: 50%;
    top:70px;
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: calc(100vw - 48px);
    padding: 8px 18px;
    border-radius: 999px;
    background: rgba(12, 18, 28, 0.78);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #e8f1ff;
    font-size: 12px;
    line-height: 1.6;
    white-space: nowrap;
    pointer-events: none;
}

.route-fly-hud .hud-tip {
    color: #7fd4ff;
    font-weight: 600;
}
</style>
