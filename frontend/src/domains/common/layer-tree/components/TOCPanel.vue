<template>
    <div class="toolbox-panel">
        <!-- <input ref="fileInputRef" type="file" multiple class="hidden-input" accept=".geojson,.json,.kml,.kmz,.zip,.shp,.dbf,.shx,.prj,.cpg,.tif,.tiff" @change="handleFileUpload" /> -->
        <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden-input"
            accept="."
            @change="handleFileUpload"
        />
        <input
            ref="folderInputRef"
            type="file"
            multiple
            webkitdirectory
            directory
            class="hidden-input"
            @change="handleDirectoryUpload"
        />

        <div class="header">
            <div>
                <div class="title">{{ t('layer.toolbox') }}</div>
            </div>
            <button
                class="ghost-btn"
                @click="emit('close')"
            >
                {{ t('layer.close') }}
            </button>
        </div>

        <div
            class="tabs"
            :style="{ '--active-index': tabIndex }"
        >
            <button
                v-for="item in tabItems"
                :key="item.value"
                class="tab"
                :class="{ active: activeTab === item.value }"
                @click="activeTab = item.value"
            >
                <component
                    :is="item.icon"
                    :size="13"
                    stroke-width="2"
                />
                <span>{{ t(item.label) }}</span>
            </button>
        </div>

        <div
            v-if="activeTab === 'layers'"
            class="panel-scroll"
        >
            <LayerPanel
                :selected-layer-ids="multiSelectedLayerIds"
                @action="handleLayerTreeAction"
            />

            <AmapAoiInjectDialog
                :visible="manualAoiDialogVisible"
                :poi-id="manualAoiPoiId"
                :json-text="manualAoiJsonText"
                :detail-url="manualAoiDetailUrl"
                :source-layer-name="manualAoiSourceLayerName"
                :error-message="manualAoiError"
                @update:poi-id="manualAoiPoiId = $event"
                @update:json-text="manualAoiJsonText = $event"
                @open-detail="openManualAoiDetailLink"
                @submit="drawAmapAoiFromManualJson"
                @close="closeManualAoiDialog"
            />

            <div class="upload-zone-wrap">
                <div
                    class="upload-entry"
                    :class="{ dragging: isUploadDragging }"
                    @dragenter.prevent="handleUploadDragEnter"
                    @dragover.prevent="handleUploadDragOver"
                    @dragleave.prevent="handleUploadDragLeave"
                    @drop.prevent="handleUploadDrop"
                >
                    <div class="card-top">
                        <div class="card-title upload-title">
                            <span
                                class="upload-icon"
                                aria-hidden="true"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    width="16"
                                    height="16"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M12 16V5"></path>
                                    <path d="m8 9 4-4 4 4"></path>
                                    <path
                                        d="M20 16.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5"
                                    ></path>
                                </svg>
                            </span>
                            {{ t('layer.uploadLayer') }}
                        </div>
                        <div class="upload-btns">
                            <button
                                class="small-btn"
                                @click="triggerFileUpload"
                            >
                                {{ t('layer.uploadFile') }}
                            </button>
                            <button
                                class="small-btn ghost"
                                @click="triggerFolderUpload"
                            >
                                {{ t('layer.uploadFolder') }}
                            </button>
                        </div>
                    </div>
                    <div class="upload-tip">{{ t('layer.uploadTip') }}</div>
                    <div class="upload-crs-tip">
                        <span>{{ t('layer.fileSizeLimit', { size: MAX_FILE_SIZE_MB }) }}</span>
                        <span>{{ t('layer.dataFormats') }}</span>
                    </div>
                    <div
                        v-if="shouldShowUploadProgress"
                        class="upload-progress"
                        :class="`phase-${uploadProgressView.phase}`"
                    >
                        <div class="upload-progress-head">
                            <span>{{
                                t('layer.importStatus', {
                                    current: uploadProgressView.current,
                                    total: uploadProgressView.total || 1,
                                })
                            }}</span>
                            <span>{{ uploadProgressLabel }}</span>
                        </div>
                        <div class="upload-progress-bar">
                            <div
                                class="upload-progress-fill"
                                :style="{ width: `${uploadProgressPercent}%` }"
                            ></div>
                        </div>
                        <div class="upload-progress-meta">
                            <span>{{ t('layer.success', { count: uploadProgressView.success }) }}</span>
                            <span>{{ t('layer.failed', { count: uploadProgressView.failed }) }}</span>
                            <span v-if="uploadProgressView.warnings">{{
                                t('layer.warnings', { count: uploadProgressView.warnings })
                            }}</span>
                            <span v-if="uploadProgressView.errors">{{
                                t('layer.errors', { count: uploadProgressView.errors })
                            }}</span>
                        </div>
                        <div
                            v-if="uploadProgressView.message"
                            class="upload-progress-message"
                        >
                            {{ uploadProgressView.message }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 共享资源菜单 -->
            <div class="shared-resource-wrap">
                <div class="card shared-resource-card">
                    <div class="card-title shared-resource-title">
                        <span
                            class="share-icon"
                            aria-hidden="true"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <circle
                                    cx="18"
                                    cy="5"
                                    r="3"
                                ></circle>
                                <circle
                                    cx="6"
                                    cy="12"
                                    r="3"
                                ></circle>
                                <circle
                                    cx="18"
                                    cy="19"
                                    r="3"
                                ></circle>
                                <line
                                    x1="8.59"
                                    y1="13.51"
                                    x2="15.42"
                                    y2="17.49"
                                ></line>
                                <line
                                    x1="15.41"
                                    y1="6.51"
                                    x2="8.59"
                                    y2="10.49"
                                ></line>
                            </svg>
                        </span>
                        {{ t('layer.sharedResources') }}
                    </div>
                    <div class="shared-resource-menu">
                        <button
                            class="shared-resource-btn"
                            :class="{ loading: sharedLoader.isScanning.value }"
                            @click="scanSharedResources"
                        >
                            <span v-if="!sharedLoader.isScanning.value"><FolderOpen :size="14" /> {{ t('layer.loadResources') }}</span>
                            <span v-else>⏳ {{ t('layer.scanning') }}</span>
                        </button>
                        <div
                            v-if="sharedLoader.hasResources.value"
                            class="resource-tree-root"
                        >
                            <SharedResourceTreeItem
                                v-for="node in sharedLoader.resourceTree.value"
                                :key="node.id"
                                :node="node"
                                :level="0"
                                @load-resource="loadSharedResource"
                            />
                        </div>
                        <div
                            v-else-if="!sharedLoader.isScanning.value && lastScanAttempted"
                            class="resource-empty"
                        >
                            {{ t('layer.noResources') }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div
            v-else-if="activeTab === 'draw'"
            class="eco-panel-scroll"
        >
            <!-- 1. 核心绘图工具区 -->
            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon"><PenTool :size="12" /></span>
                    <span class="section-title">{{ t('layer.basicDraw') }}</span>
                    <span class="header-actions">
                        <button
                            class="mini-icon-btn"
                            :title="t('layer.zoomAll')"
                            @click="emit('interaction', 'ZoomToGraphics')"
                        >
                            <Maximize
                                :size="13"
                                :stroke-width="2"
                            />
                        </button>
                        <button
                            class="mini-icon-btn danger"
                            :title="t('layer.clearCanvas')"
                            @click="emit('interaction', 'Clear')"
                        >
                            <Eraser
                                :size="13"
                                :stroke-width="2"
                            />
                        </button>
                    </span>
                </div>
                <div class="eco-draw-grid">
                    <button
                        v-for="tool in drawTools"
                        :key="tool.value"
                        class="eco-tool-tile"
                        :class="{ active: selectedDrawTool === tool.value }"
                        @click="activateDrawTool(tool.value)"
                    >
                        <component
                            :is="tool.icon"
                            :size="16"
                            :stroke-width="1.8"
                        />
                        <span>{{ tool.label }}</span>
                    </button>
                </div>
            </div>

            <!-- 2. 精确坐标定位区 -->
            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon"><Crosshair :size="12" /></span>
                    <span class="section-title">{{ t('layer.coordLocate') }}</span>
                </div>

                <!-- 经纬度：一体化输入条 -->
                <div class="join-bar">
                    <input
                        v-model.trim="coordInputLon"
                        class="join-field"
                        :placeholder="t('layer.lonPlaceholder')"
                    />
                    <span class="join-sep"></span>
                    <input
                        v-model.trim="coordInputLat"
                        class="join-field"
                        :placeholder="t('layer.latPlaceholder')"
                    />
                    <select
                        v-model="coordInputCRS"
                        class="join-select"
                    >
                        <option value="wgs84">WGS-84</option>
                        <option value="gcj02">GCJ-02</option>
                    </select>
                    <button
                        class="join-go"
                        @click="drawPointByCoordinates"
                    >
                        {{ t('layer.draw') }}
                    </button>
                </div>

                <!-- P 参数码：同款输入条 -->
                <div class="join-bar mt-8">
                    <input
                        v-model.trim="coordInputP"
                        class="join-field"
                        :placeholder="t('layer.pParamPlaceholder')"
                    />
                    <button
                        class="join-go"
                        :disabled="isDecodePBusy"
                        @click="drawPointByPositionCode"
                    >
                        {{ isDecodePBusy ? '...' : t('layer.parse') }}
                    </button>
                </div>

                <div
                    v-if="coordInputError || coordInputPError"
                    class="eco-error-msg"
                >
                    {{ coordInputError || coordInputPError }}
                </div>
            </div>

            <!-- 3. 地理编码工具 -->
            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon"><Navigation :size="12" /></span>
                    <span class="section-title">{{ t('layer.geocode') }}</span>
                </div>

                <div class="join-bar">
                    <span class="join-lead">
                        <Search
                            :size="13"
                            :stroke-width="2"
                        />
                    </span>
                    <input
                        v-model.trim="geocodeAddressInput"
                        class="join-field grow-2"
                        :placeholder="t('layer.addressPlaceholder')"
                    />
                    <span class="join-sep"></span>
                    <input
                        v-model.trim="geocodeCityInput"
                        class="join-field"
                        :placeholder="t('layer.cityOptionalPlaceholder')"
                    />
                    <button
                        class="join-go"
                        :disabled="isGeocodeBusy"
                        @click="drawPointByGeocodeAddress"
                    >
                        {{ t('layer.encode') }}
                    </button>
                </div>

                <button
                    class="eco-btn-reverse mt-12"
                    @click="startReverseGeocodePick"
                >
                    <LocateFixed
                        :size="14"
                        :stroke-width="2"
                    />
                    {{ t('layer.reverseGeocode') }}
                </button>
            </div>

            <!-- 4. 底部操作提示 (改用气泡感设计) -->
            <div class="eco-hint-box">
                <div class="hint-item">
                    <span>{{ t('layer.hintLeftClickKey') }}</span> {{ t('layer.hintLeftClick') }}
                </div>
                <div class="hint-item">
                    <span>{{ t('layer.hintRightClickKey') }}</span> {{ t('layer.hintRightClick') }}
                </div>
                <div class="hint-item">
                    <span>{{ t('layer.hintMapRightClickKey') }}</span>
                    {{ t('layer.hintMapRightClick') }}
                </div>
            </div>
        </div>

        <div
            v-else-if="activeTab === 'download'"
            class="panel-scroll"
        >
            <MapDownloader
                :visible="true"
                @close="activeTab = 'layers'"
            />
        </div>

        <div
            v-else
            class="panel-scroll style-scroll"
        >
            <div class="style-panel">
                <!-- 样式模板 -->
                <div class="eco-section">
                    <div class="section-header">
                        <span class="section-icon"><Palette :size="12" /></span>
                        <span class="section-title">{{ t('layer.styleTemplates') }}</span>
                    </div>
                    <div class="template-swatch-grid">
                        <button
                            v-for="tpl in styleTemplates"
                            :key="tpl.id"
                            class="tpl-swatch"
                            :title="tpl.color"
                            @click="applyTemplate(tpl.id)"
                        >
                            <span
                                class="swatch-dot"
                                :style="{ background: tpl.color }"
                            ></span>
                            <span class="swatch-name">{{ tpl.name }}</span>
                        </button>
                    </div>
                </div>

                <!-- 样式编辑 -->
                <div class="eco-section">
                    <div class="section-header">
                        <span class="section-icon"><SlidersHorizontal :size="12" /></span>
                        <span class="section-title">{{ t('layer.styleEdit') }}</span>
                    </div>

                    <div class="join-bar">
                        <span class="join-lead">
                            <Layers
                                :size="13"
                                :stroke-width="1.9"
                            />
                        </span>
                        <select
                            v-model="selectedEditLayerId"
                            class="style-select"
                        >
                            <option
                                v-for="layer in editableLayers"
                                :key="layer.id"
                                :value="layer.id"
                            >
                                {{ layer.name }}
                            </option>
                        </select>
                    </div>

                    <div class="field-grid mt-8">
                        <label class="color-card">
                            <input
                                v-model="styleForm.fillColor"
                                type="color"
                                class="style-color"
                            />
                            <span class="color-meta">
                                <span class="color-label">{{ t('layer.fillColor') }}</span>
                                <span class="color-hex">{{ styleForm.fillColor }}</span>
                            </span>
                        </label>
                        <label class="color-card">
                            <input
                                v-model="styleForm.strokeColor"
                                type="color"
                                class="style-color"
                            />
                            <span class="color-meta">
                                <span class="color-label">{{ t('layer.strokeColor') }}</span>
                                <span class="color-hex">{{ styleForm.strokeColor }}</span>
                            </span>
                        </label>
                    </div>

                    <div class="field-grid mt-8">
                        <div class="field">
                            <div class="slider-head">
                                <label>{{ t('layer.fillOpacity') }}</label>
                                <span class="slider-value">{{ styleForm.fillOpacityPct }}%</span>
                            </div>
                            <input
                                v-model.number="styleForm.fillOpacityPct"
                                class="style-slider"
                                type="range"
                                min="0"
                                max="100"
                                :style="{ '--fill': `${styleForm.fillOpacityPct}%` }"
                            />
                        </div>
                        <div class="field">
                            <div class="slider-head">
                                <label>{{ t('layer.strokeWidth') }}</label>
                                <span class="slider-value">{{ styleForm.strokeWidth }}px</span>
                            </div>
                            <input
                                v-model.number="styleForm.strokeWidth"
                                class="style-slider"
                                type="range"
                                min="1"
                                max="8"
                                step="0.5"
                                :style="{ '--fill': `${((styleForm.strokeWidth - 1) / 7) * 100}%` }"
                            />
                        </div>
                    </div>
                </div>

                <button
                    class="apply-btn"
                    @click="applyStyle"
                >
                    <Paintbrush
                        :size="14"
                        :stroke-width="2"
                    />
                    {{ t('layer.applyStyle') }}
                </button>
            </div>
        </div>

        <LayerPropertiesDialog
            :visible="propertiesDialogVisible"
            :layer="propertiesDialogLayer"
            @close="propertiesDialogVisible = false"
        />
    </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
    CircleDot,
    Crosshair,
    Download,
    Eraser,
    FolderOpen,
    Hexagon,
    Layers,
    LocateFixed,
    Maximize,
    Navigation,
    Palette,
    Paintbrush,
    PenTool,
    Route,
    Ruler,
    Search,
    SlidersHorizontal,
    SquareDashed,
    Table,
} from '@lucide/vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useGisLoader } from '@common/data-import/useGisLoader';
import { useGisDropZone } from '@common/data-import/useGisDropZone';
import { RSVC_NODE_PREFIX, useRemoteServices, parseRsvcNodeId } from '@common/basemap/remoteServices';
import {
    fetchArcgisLayerAttributes,
    mergeSublayerAttributes,
} from '@common/basemap/arcgisAttributeQuery';
import { useLayerStore, useAttrStore } from '@/stores';
import { useCesiumLayersStore } from '@cesium-domain/stores/cesiumLayers';
import { useStyleEditor } from '@ol/layer/style/useStyleEditor';
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';
import LayerPanel from '@common/layer-tree/components/LayerPanel.vue';
import SharedResourceTreeItem from '@common/layer-tree/components/SharedResourceTreeItem.vue';
import AmapAoiInjectDialog from '@ol/search/components/AmapAoiInjectDialog.vue';
// 异步加载：下载器仅切到 download 标签页时才需要，不随 TOC 首次渲染加载
const MapDownloader = defineAsyncComponent(() => import('@ol/components/MapDownloader.vue'));
import LayerPropertiesDialog from '@common/layer-tree/components/LayerPropertiesDialog.vue';
import { useGeocoding } from '../composables/useGeocoding';
import { useFileUpload, MAX_FILE_SIZE_MB } from '../composables/useFileUpload';
import { useSharedResources } from '../composables/useSharedResources';
import { useTreeActionDispatcher } from '../composables/useTreeActionDispatcher';

const props = defineProps({
    userLayers: { type: Array, default: () => [] },
    baseLayers: { type: Array, default: () => [] },
    overview: { type: Object, default: () => ({ drawCount: 0, uploadCount: 0, layers: [] }) },
    uploadProgress: { type: Object, default: () => ({ phase: 'idle' }) },
    latestSearchPoi: { type: Object, default: () => ({}) },
    defaultTab: { type: String, default: 'layers' },
    // 当前渲染引擎：'ol' | 'cesium'（在线服务动作按此优先分发）
    activeEngine: { type: String, default: 'ol' },
});

const emit = defineEmits([
    'close',
    'upload-data',
    'interaction',
    'layer-selected',
    'toggle-layer-visibility',
    'change-layer-opacity',
    'zoom-layer',
    'view-layer',
    'remove-layer',
    'edit-layer',
    'reorder-user-layers',
    'solo-layer',
    'toggle-layer-label-visibility',
    'apply-style-template',
    'update-draw-style',
    'update-layer-style',
    'highlight-attribute-feature',
    'zoom-attribute-feature',
    'draw-point-by-coordinates',
    'draw-amap-aoi-from-json',
    'toggle-layer-crs',
    'export-layer-data',
    'rename-layer',
]);

const fileInputRef = ref(null);
const folderInputRef = ref(null);
const message = useMessage();
const { t } = useLocale();
const gisLoader = useGisLoader();
const layerStore = useLayerStore();
const attrStore = useAttrStore();
// Cesium 三维数据店：TOC「三维数据」分组的动作直调目标
const cesiumLayersStore = useCesiumLayersStore();
const styleEditor = useStyleEditor();
const activeTab = ref('layers');
const tiandituTk = ref(getRuntimeMapTokensSync().tiandituTk);

const tabItems = [
    { value: 'layers', label: 'layer.tabLayers', icon: Layers },
    { value: 'draw', label: 'layer.tabDraw', icon: PenTool },
    { value: 'style', label: 'layer.tabStyle', icon: Paintbrush },
    { value: 'download', label: 'layer.tabDownload', icon: Download },
];

const tabIndex = computed(() =>
    Math.max(0, tabItems.findIndex((item) => item.value === activeTab.value)),
);

// 图层属性弹窗（show-layer-properties 动作经 dispatcher 写入，模板 LayerPropertiesDialog 消费）
const propertiesDialogVisible = ref(false);
const propertiesDialogLayer = ref(null);

// ══════ P2 拆分：以下逻辑抽离至 composables（见 unified-layer-management-refactor-plan.md）══════
const {
    coordInputLon, coordInputLat, coordInputCRS, coordInputError,
    coordInputP, coordInputPError,
    geocodeAddressInput, geocodeCityInput,
    manualAoiPoiId, manualAoiJsonText, manualAoiError,
    manualAoiDialogVisible, manualAoiSourceLayerName, manualAoiDetailUrl,
    isDecodePBusy, isGeocodeBusy,
    copyLayerCoordinates,
    closeManualAoiDialog, openManualAoiDetailLink, openManualAoiDialogByPoi,
    drawAmapAoiFromManualJson, drawPointByCoordinates, drawPointByPositionCode,
    drawPointByGeocodeAddress, startReverseGeocodePick,
} = useGeocoding({ t, message, emit, tiandituTk });

const {
    uploadProgressView, shouldShowUploadProgress, uploadProgressPercent, uploadProgressLabel,
    triggerFileUpload, triggerFolderUpload, handleFileUpload, handleDirectoryUpload,
} = useFileUpload({
    t, message, emit,
    props,
    getGisLoader: () => gisLoader,
    getFileInputRef: () => fileInputRef.value,
    getFolderInputRef: () => folderInputRef.value,
});

const {
    sharedLoader, lastScanAttempted, scanSharedResources, loadSharedResource,
} = useSharedResources({
    t, message, emit,
    getGisLoader: () => gisLoader,
});

const {
    multiSelectedLayerIds, handleLayerTreeAction, syncUserLayers,
} = useTreeActionDispatcher({
    layerStore,
    cesiumLayersStore,
    useRemoteServices,
    // 整个响应式 props 直传：activeEngine 等字段随引擎切换保持最新（快照会导致 P0-2 回归）
    props,
    emit,
    message,
    t,
    uiState: { propertiesDialogVisible, propertiesDialogLayer },
    deps: {
        openAttributeTable,
        setStyleTarget,
        copyLayerCoordinates,
        openManualAoiDialogByPoi,
    },
});

const {
    isDragging: isUploadDragging,
    handleDragEnter: handleUploadDragEnter,
    handleDragOver: handleUploadDragOver,
    handleDragLeave: handleUploadDragLeave,
    handleDrop: handleUploadDrop,
} = useGisDropZone({
    onUpload: (payload) => emit('upload-data', payload),
});
// ══════ P2 拆分结束 ══════

function normalizeTab(value) {
    const normalized = String(value || '').trim();
    if (['layers', 'draw', 'style', 'download'].includes(normalized)) return normalized;
    return 'layers';
}

watch(
    () => props.defaultTab,
    (next) => {
        activeTab.value = normalizeTab(next);
    },
    { immediate: true },
);

onMounted(async () => {
    const tokens = await loadRuntimeMapTokens();
    const nextTiandituTk = String(tokens?.tiandituTk || '').trim();
    if (nextTiandituTk) {
        tiandituTk.value = nextTiandituTk;
    }
});

const styleTemplates = styleEditor.styleTemplates;

const drawTools = computed(() => [
    { value: 'AttributeQuery', label: t('layer.attributeQuery'), icon: Table },
    { value: 'Point', label: t('layer.drawPoint'), icon: CircleDot },
    { value: 'LineString', label: t('layer.drawLine'), icon: Route },
    { value: 'Polygon', label: t('layer.drawPolygon'), icon: Hexagon },
    { value: 'MeasureDistance', label: t('layer.measureDistance'), icon: Ruler },
    { value: 'MeasureArea', label: t('layer.measureArea'), icon: SquareDashed },
]);

const styleForm = styleEditor.styleForm;
const selectedDrawTool = computed(() => layerStore.selectedDrawTool);
const selectedEditLayerId = computed({
    get: () => layerStore.selectedEditLayerId,
    set: (value) => {
        layerStore.setStyleTarget(value);
    },
});
const editableLayers = computed(() => layerStore.editableLayers);

watch(
    () => props.userLayers,
    (layers) => {
        // layerStore 同步与多选修剪由 dispatcher.syncUserLayers 统一处理
        syncUserLayers(layers || [], props.overview || {});
        attrStore.syncLayers(layers || []);
    },
    { immediate: true },
);

watch(
    () => props.overview,
    (overview) => {
        // 使用 store 中的 userLayers 而非 props.userLayers，避免时序问题：
        // 图层移除时 user-layers-change 和 graphics-overview 先后触发，
        // 若 props.userLayers 尚未更新，会用旧列表重新同步导致已删除图层"恢复"
        layerStore.syncLayers(layerStore.userLayers || [], overview || {});
    },
    { immediate: true },
);

watch(
    () => [
        Number(props.latestSearchPoi?._syncAt || 0),
        String(props.latestSearchPoi?.poiid || props.latestSearchPoi?.id || '').trim(),
        String(props.latestSearchPoi?.service || '')
            .trim()
            .toLowerCase(),
        String(props.latestSearchPoi?.name || '').trim(),
    ],
    ([syncAt, nextPoiId, service, poiName]) => {
        if (!syncAt) return;
        if (service && service !== 'amap') return;
        if (manualAoiDialogVisible.value && nextPoiId === manualAoiPoiId.value) return;

        openManualAoiDialogByPoi(
            {
                poiid: nextPoiId,
                layerName: poiName,
            },
            {
                showMissingIdHint: true,
            },
        );
    },
    { immediate: true },
);

layerStore.bindHandlers({
    onReorder: (payload) => emit('reorder-user-layers', payload),
    onHighlightFeature: (payload) => emit('highlight-attribute-feature', payload),
    onZoomFeature: (payload) => emit('zoom-attribute-feature', payload),
    onViewFeature: (payload) => emit('zoom-attribute-feature', payload),
});

onBeforeUnmount(() => {
    // 无参调用 bindHandlers 将所有回调设为 undefined，清除事件绑定
    layerStore.bindHandlers();
});

async function openAttributeTable(layerId) {
    // ── 在线服务：拉取 ArcGIS Query 属性 → 灌入 attrStore → 打开属性表 ──
    if (String(layerId).startsWith(RSVC_NODE_PREFIX)) {
        const { serviceId, subLayerName } = parseRsvcNodeId(layerId);
        const store = useRemoteServices();
        const record = store.getRemoteService(serviceId);

        if (!record) {
            message?.warning?.('该在线服务已不存在');
            return;
        }
        if (record.kind !== 'arcgis' || !record.queryable) {
            message?.warning?.('该服务未开放查询能力（仅 ArcGIS 动态服务支持属性表）');
            return;
        }

        // 目标子图层集合：叶子节点=精确单层；服务节点=已勾选层（未勾选则全部）
        const targetNames = subLayerName
            ? [subLayerName]
            : (record.selectedIds?.length
                ? record.selectedIds
                : (record.sublayers || []).map((item) => item.name));
        if (!targetNames.length) {
            message?.warning?.('未找到可查询的子图层');
            return;
        }

        const titleOf = (name) =>
            record.sublayers?.find((item) => item.name === name)?.title || String(name);
        message?.info?.(`正在查询属性表（${targetNames.length} 个子图层）…`, { duration: 2500 });

        try {
            const results = await Promise.all(
                targetNames.map(async (name) => {
                    try {
                        const result = await fetchArcgisLayerAttributes({
                            endpoint: record.endpoint,
                            layerId: name,
                        });
                        return { ...result, layerId: name, layerTitle: titleOf(name) };
                    } catch (error) {
                        console.warn('[RSVC] 子层属性查询失败:', name, error);
                        return { error: error?.message || '查询失败', layerId: name, layerTitle: name };
                    }
                }),
            );

            const ok = results.filter((item) => !item.error && item.records?.length);
            if (!ok.length) {
                const firstError = results.find((item) => item.error);
                throw new Error(firstError?.error || '所有子图层均无要素');
            }

            const merged = mergeSublayerAttributes(ok);
            const datasetKey = `rsvc-attr:${serviceId}:${subLayerName || 'all'}`;
            const datasetName = `${record.title}${subLayerName ? ` · ${titleOf(subLayerName)}` : ''}`;

            attrStore.datasets[datasetKey] = {
                id: datasetKey,
                layerId: datasetKey,
                layerName: datasetName,
                sourceType: 'remote-service',
                geometryType: 'unknown',
                metadata: { endpoint: record.endpoint },
                rows: merged.records.map((record2, index) => ({
                    id: `${datasetKey}:${record2.featureId}`,
                    featureId: record2.featureId,
                    layerId: datasetKey,
                    layerName: datasetName,
                    sourceType: 'remote-service',
                    geometryType: 'unknown',
                    properties: record2.properties,
                    rawAttributes: {},
                    statistics: {},
                    geometry: record2.geometry || null,
                    extent: record2.extent || null,
                    searchText: Object.values(record2.properties)
                        .map((value) => String(value ?? ''))
                        .join(' ')
                        .toLowerCase(),
                    __index: index,
                })),
                fieldConfig: Object.fromEntries(
                    merged.fields.map((field) => [
                        field.key,
                        { key: field.key, alias: field.alias, visible: true, type: field.type },
                    ]),
                ),
                statistics: {},
            };

            attrStore.openTable(datasetKey, datasetName);
            if (merged.records.length >= 2000) {
                message?.info?.('数据量较大，属性表仅显示前 2000 条', { duration: 3000 });
            }
        } catch (error) {
            message?.error?.(`属性表查询失败：${error?.message || '未知错误'}`);
        }
        return;
    }

    const targetLayer = (props.userLayers || []).find((item) => item.id === layerId);
    attrStore.openTable(layerId, targetLayer?.name || t('layer.unnamedLayer'));
    activeTab.value = 'layers';
}

function setStyleTarget(layerId) {
    layerStore.setStyleTarget(layerId);
    activeTab.value = 'style';
}

function activateDrawTool(tool) {
    layerStore.setDrawTool(tool);
    emit('interaction', tool);
}

function applyTemplate(templateId) {
    // 1. 获取当前选中的目标 ID
    const targetId = selectedEditLayerId.value;
    if (!targetId) return; // 如果没有选中任何图层，直接返回

    // 2. 更新本地 styleForm (让界面底部的颜色选择器实时同步变色)
    const targetTemplate = styleTemplates.find((tpl) => tpl.id === templateId);
    if (targetTemplate) {
        styleForm.value.fillColor = targetTemplate.color;
        // 建议：描边色通常可以设为和填充色一致，或者加深一点
        styleForm.value.strokeColor = targetTemplate.color;
    }

    // 3. 执行原有的业务 emit (保持与父组件/地图引擎的通信)
    if (targetId === 'draw') {
        emit('apply-style-template', { target: 'draw', templateId });
    } else {
        emit('apply-style-template', { target: 'layer', layerId: targetId, templateId });
    }

    // 4. 【核心修复】关键：立即调用 applyStyle() 触发地图渲染
    // 这样用户点击模板按钮后，地图会立刻变色，不再需要二次点击“应用样式”
    applyStyle();
}

function applyStyle() {
    const payload = styleEditor.buildStylePayload();
    if (selectedEditLayerId.value === 'draw') {
        emit('update-draw-style', payload);
        return;
    }
    if (selectedEditLayerId.value) {
        emit('update-layer-style', { layerId: selectedEditLayerId.value, styleConfig: payload });
    }
}
</script>

<style scoped>
/* ===== 绘制面板布局 ===== */
.eco-panel-scroll {
    padding: 6px 4px;
    display: flex;
    flex-direction: column;
    gap: 18px;
}

/* 分组：去卡片化，仅靠标题与留白分区 */
.eco-section {
    display: flex;
    flex-direction: column;
}

/* 分组标题：渐变小徽章 + 标题 */
.section-header {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 10px;
}

.section-icon {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--brand-gradient);
    color: #ffffff;
    box-shadow:
        0 2px 6px rgba(var(--brand-primary-dark-rgb), 0.26),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.section-title {
    font-size: var(--toc-font-md);
    font-weight: 700;
    color: var(--toc-card-title-dark);
    letter-spacing: 0.3px;
}

/* 标题栏右侧动作区 */
.header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 3px;
}

.mini-icon-btn {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--toc-text-secondary);
    cursor: pointer;
    transition:
        color var(--toc-transition-fast),
        background var(--toc-transition-fast),
        transform var(--toc-transition-fast);
}

.mini-icon-btn:hover {
    color: var(--toc-primary);
    background: var(--toc-primary-bg-hover);
}

.mini-icon-btn.danger:hover {
    color: var(--toc-danger);
    background: rgba(184, 61, 61, 0.1);
}

.mini-icon-btn:active {
    transform: scale(0.9);
}

/* 绘图工具磁贴：图标在上、文字在下 */
.eco-draw-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
}

.eco-tool-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    padding: 11px 2px 9px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.18);
    background: rgba(255, 255, 255, 0.72);
    border-radius: 12px;
    font-size: 11px;
    color: var(--toc-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition:
        color 0.16s ease,
        border-color 0.16s ease,
        background 0.16s ease,
        transform 0.16s ease,
        box-shadow 0.16s ease;
}

.eco-tool-tile svg {
    transition: transform 0.16s ease;
}

.eco-tool-tile:hover:not(.active) {
    color: var(--toc-primary);
    border-color: rgba(var(--brand-primary-dark-rgb), 0.42);
    background: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 6px 14px rgba(var(--brand-primary-rgb), 0.15);
}

.eco-tool-tile:hover:not(.active) svg {
    transform: translateY(-1px) scale(1.06);
}

.eco-tool-tile:active:not(.active) {
    transform: scale(0.94);
}

.eco-tool-tile.active {
    background: var(--brand-gradient);
    color: #ffffff;
    border-color: transparent;
    font-weight: 600;
    box-shadow:
        0 5px 14px rgba(var(--brand-primary-dark-rgb), 0.34),
        inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

/* ===== 一体式输入条（joined bar）===== */
.join-bar {
    display: flex;
    align-items: stretch;
    min-height: 34px;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 11px;
    overflow: hidden;
    transition:
        border-color var(--toc-transition-slow),
        box-shadow var(--toc-transition-slow),
        background var(--toc-transition-slow);
}

.join-bar:focus-within {
    border-color: var(--toc-primary-light);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 0 3px var(--toc-primary-bg-hover);
}

.join-field {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 8px 10px;
    font-size: var(--toc-font-sm);
    color: var(--toc-text-primary);
    outline: none;
}

.grow-2 {
    flex: 2;
}

.join-field::placeholder {
    color: var(--toc-text-light);
}

.join-sep {
    flex-shrink: 0;
    width: 1px;
    margin: 7px 0;
    background: rgba(var(--brand-primary-rgb), 0.16);
}

.join-lead {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding-left: 11px;
    color: var(--toc-text-light);
    transition: color var(--toc-transition-normal);
}

.join-bar:focus-within .join-lead {
    color: var(--toc-primary);
}

.join-select {
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0 2px 0 8px;
    font-size: 11px;
    color: var(--toc-text-secondary);
    outline: none;
    cursor: pointer;
}

/* 条内渐变主操作段 */
.join-go {
    flex-shrink: 0;
    border: none;
    background: var(--brand-gradient);
    color: #ffffff;
    font-size: var(--toc-font-sm);
    font-weight: 600;
    padding: 0 13px;
    cursor: pointer;
    white-space: nowrap;
    transition:
        filter var(--toc-transition-fast),
        opacity var(--toc-transition-fast);
}

.join-go:hover:not(:disabled) {
    filter: brightness(1.06);
}

.join-go:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

/* 逆地理编码按钮：软着色实底 */
.eco-btn-reverse {
    width: 100%;
    padding: 9px;
    background: var(--toc-primary-bg);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.35);
    border-radius: 11px;
    color: var(--toc-primary);
    font-size: var(--toc-font-md);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition:
        background var(--toc-transition-normal),
        box-shadow var(--toc-transition-normal),
        transform var(--toc-transition-normal);
}

.eco-btn-reverse:hover {
    background: var(--toc-primary-bg-hover);
    box-shadow: 0 4px 12px rgba(var(--brand-primary-rgb), 0.18);
    transform: translateY(-1px);
}

.eco-btn-reverse:active {
    transform: scale(0.98);
}

/* 错误提示条 */
.eco-error-msg {
    margin-top: 8px;
    font-size: 11px;
    line-height: 16px;
    color: var(--toc-danger);
    background: rgba(184, 61, 61, 0.07);
    border: 1px solid rgba(184, 61, 61, 0.22);
    border-radius: 9px;
    padding: 6px 10px;
}

/* 提示框：无框化，仅一层极浅底色聚拢 */
.eco-hint-box {
    background: rgba(var(--brand-primary-rgb), 0.05);
    border-radius: 10px;
    padding: 9px 12px;
}

.hint-item {
    font-size: 11px;
    color: var(--toc-hint-text);
    line-height: 22px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.hint-item span {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    background: #ffffff;
    color: var(--toc-text-secondary);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.28);
    border-bottom-width: 2px;
    padding: 0 6px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 10px;
    line-height: 16px;
    box-shadow: 0 1px 0 rgba(var(--brand-primary-rgb), 0.08);
}

.mt-8 {
    margin-top: 8px;
}

.mt-12 {
    margin-top: 12px;
}

.toolbox-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px;
    background: var(--toc-toolbox-bg);
    color: var(--toc-toolbox-text);
}

.hidden-input {
    display: none;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--toc-header-border);
    /* padding-bottom: 8px; */
}

.title {
    font-size: 20px;
    font-weight: 700;
    color: var(--toc-title);
    letter-spacing: 0.2px;
}

.subtitle {
    font-size: 12px;
    color: var(--toc-subtitle);
}

.tabs {
    --tab-pad: 3px;
    --tab-gap: 2px;
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--tab-gap);
    padding: var(--tab-pad);
    border-radius: 999px;
    border: 1px solid rgba(121, 174, 141, 0.28);
    background: rgba(235, 246, 240, 0.58);
    backdrop-filter: blur(10px);
}

/* 滑动指示胶囊：随激活 tab 平滑移动 */
.tabs::before {
    content: '';
    position: absolute;
    top: var(--tab-pad);
    bottom: var(--tab-pad);
    width: calc((100% - var(--tab-pad) * 2 - var(--tab-gap) * 3) / 4);
    left: calc(
        var(--tab-pad) + var(--active-index, 0) *
            ((100% - var(--tab-pad) * 2 - var(--tab-gap) * 3) / 4 + var(--tab-gap))
    );
    border-radius: 999px;
    background: var(--toc-tab-active-bg);
    box-shadow:
        0 4px 12px rgba(36, 125, 72, 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
    transition: left 0.32s cubic-bezier(0.34, 1.2, 0.44, 1);
}

.tab {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    border: none;
    background: transparent;
    border-radius: 999px;
    padding: 7px 2px;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    color: var(--toc-tab-text);
    transition: color 0.22s ease, transform 0.15s ease;
}

.tab span {
    overflow: hidden;
    text-overflow: ellipsis;
}

.tab svg {
    flex-shrink: 0;
    opacity: 0.72;
    transition:
        opacity 0.22s ease,
        transform 0.22s ease;
}

.tab:hover:not(.active) {
    color: var(--toc-tab-active-border);
}

.tab:hover:not(.active) svg {
    opacity: 1;
    transform: translateY(-1px);
}

.tab:active:not(.active) {
    transform: scale(0.95);
}

.tab.active {
    color: #ffffff;
    font-weight: 600;
}

.tab.active svg {
    opacity: 1;
    transform: scale(1.08);
}

.panel-scroll {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.card {
    border: 1px solid rgba(153, 195, 170, 0.38);
    border-radius: 10px;
    padding: 11px;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 20px rgba(58, 91, 67, 0.08);
}

.card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.upload-zone-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.card-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--toc-card-title-dark);
    margin-bottom: 6px;
}

.upload-tip {
    margin-bottom: 8px;
    font-size: 11px;
    color: var(--toc-text-secondary);
    padding: 0 2px;
}

.upload-crs-tip {
    margin-bottom: 6px;
    font-size: 11px;
    color: #1877f2;
    padding: 6px 8px;
    background: #e7f1ff;
    border-radius: 4px;
    border-left: 3px solid #1877f2;
}

.upload-crs-tip span {
    display: block;
    line-height: 1.4;
}

.upload-entry {
    border: 1.5px dashed var(--toc-upload-border);
    border-radius: 8px;
    background: var(--toc-upload-bg);
    padding: 10px;
    transition:
        border-color 0.15s ease,
        background-color 0.15s ease,
        box-shadow 0.15s ease;
}

.upload-entry.dragging {
    border-color: var(--toc-upload-drag-border);
    background: var(--toc-upload-drag-bg);
    box-shadow: 0 0 0 3px rgba(90, 169, 122, 0.15);
}

.upload-title {
    display: flex;
    align-items: center;
    gap: 6px;
}

.upload-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    color: var(--toc-upload-icon);
    background: var(--toc-upload-drag-bg);
}

.upload-progress {
    border: 1px solid var(--toc-upload-progress-border);
    background: var(--toc-upload-progress-bg);
    border-radius: 8px;
    padding: 7px;
}

.upload-progress.phase-error {
    border-color: var(--toc-upload-error-border);
    background: var(--toc-upload-error-bg);
}

.upload-progress.phase-done {
    border-color: var(--toc-upload-done-border);
    background: var(--toc-upload-done-bg);
}

.upload-progress-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #2d4f3a;
    margin-bottom: 5px;
}

.upload-progress-bar {
    height: 8px;
    background: var(--toc-border-light);
    border-radius: 999px;
    overflow: hidden;
}

.upload-progress-fill {
    height: 100%;
    width: 0;
    background: linear-gradient(90deg, var(--toc-primary-lighter) 0%, var(--toc-primary) 100%);
    transition: width 0.24s ease;
}

.upload-progress.phase-error .upload-progress-fill {
    background: linear-gradient(90deg, #f1a2a2 0%, #ca4d4d 100%);
}

.upload-progress-meta {
    margin-top: 5px;
    font-size: 10px;
    color: var(--toc-text-muted);
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.upload-progress-message {
    margin-top: 3px;
    font-size: 10px;
    color: var(--toc-text-secondary);
    word-break: break-word;
}

.row-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}

.layer-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.layer-item {
    border-bottom: 1px solid var(--toc-border-light);
    padding: 8px 4px;
    background: transparent;
    cursor: pointer;
    transition: background-color 0.15s ease;
}

.layer-item:hover {
    background: var(--toc-primary-bg);
}

.layer-main {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
}

.layer-title-wrap {
    min-width: 0;
    flex: 1;
}

.name {
    display: inline-block;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.feature-badge {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--toc-text-secondary);
    border: 1px solid var(--toc-badge-border);
    background: var(--toc-badge-bg-hover);
    border-radius: 999px;
    padding: 1px 7px;
    line-height: 1.5;
}

.layer-actions {
    margin-left: auto;
}

.icon-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.action-icon-btn {
    position: relative;
    border: 1px solid var(--toc-border-medium);
    background: var(--toc-bg-white);
    color: var(--toc-text-dark);
    border-radius: 7px;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 12px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.action-icon-btn:hover {
    background: var(--toc-primary-bg);
    border-color: var(--toc-border-active);
    color: var(--toc-primary);
}

.action-icon-btn.danger {
    border-color: var(--toc-upload-error-border);
    background: var(--toc-upload-error-bg);
    color: var(--toc-danger);
}

.action-icon-btn.danger:hover {
    border-color: var(--toc-danger);
    background: var(--toc-danger-bg);
    color: var(--toc-danger-hover);
}

.action-icon-btn[data-tip]:hover::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    color: #fff;
    background: rgba(35, 49, 42, 0.92);
    padding: 3px 6px;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 3;
}

.draw-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.actions-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 20px;
}

.coord-input-panel {
    margin-top: 12px;
    border: 1px solid var(--toc-border-light);
    border-radius: 8px;
    padding: 10px;
    background: var(--toc-bg-card);
}

.coord-input-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
}

.coord-input-field {
    width: 100%;
    border: 1px solid var(--toc-border-active);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    color: var(--toc-text-dark);
    background: var(--toc-bg-input);
    box-sizing: border-box;
}

.coord-input-field:focus {
    outline: none;
    border-color: var(--toc-primary-light);
    box-shadow: 0 0 0 2px var(--toc-primary-bg-hover);
}

.coord-divider {
    height: 1px;
    margin: 10px 0;
    background: var(--toc-border-light);
}

.coord-crs-row {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.coord-crs-label {
    font-size: 12px;
    color: var(--toc-text-secondary);
    white-space: nowrap;
}

.coord-crs-select {
    flex: 1;
    border: 1px solid var(--toc-border-active);
    border-radius: 8px;
    padding: 6px 8px;
    background: var(--toc-bg-input);
    color: var(--toc-text-dark);
}

.coord-input-actions {
    margin-top: 10px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.coord-input-actions.single-action {
    grid-template-columns: 1fr;
}

.geocode-tool-panel {
    margin-top: 10px;
}

.geocode-subtitle {
    font-size: 12px;
    font-weight: 600;
    color: var(--toc-text-dark);
    margin-bottom: 6px;
}

.geocode-tip {
    margin-top: 8px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--toc-text-secondary);
}

.coord-input-error {
    margin-top: 8px;
    color: var(--toc-danger);
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
}

.template-row,
.field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
}

.field select,
.field input[type='range'],
.field input[type='color'] {
    width: 100%;
}

.upload-btns {
    display: inline-flex;
    gap: 6px;
}

.ghost-btn,
.small-btn,
.template {
    border: 1px solid var(--toc-border-medium);
    background: var(--toc-bg-white);
    color: var(--toc-text-dark);
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
}

.draw-tool-btn {
    min-height: 34px;
    border: 1px solid var(--toc-border-active);
    background: var(--toc-bg-white);
    color: var(--toc-text-dark);
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.draw-tool-btn:hover {
    background: var(--toc-primary-bg);
}

.draw-tool-btn.active {
    border-color: var(--toc-primary-light);
    background: var(--toc-primary-light);
    color: #ffffff;
    font-weight: 600;
}

.draw-op-btn {
    border: 1px solid transparent;
    border-radius: 8px;
    min-height: 34px;
    background: var(--toc-bg-white);
    padding: 6px 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}

.draw-op-primary {
    border-color: var(--toc-border-active);
    background: var(--toc-primary-bg);
    color: var(--toc-primary);
}

.btn-accent {
    border-color: var(--toc-border-active);
    background: var(--toc-primary-bg);
    color: var(--toc-primary-dark);
}

.draw-op-warning {
    border-color: var(--toc-btn-warning);
    background: var(--toc-upload-drag-bg);
    color: var(--toc-btn-warning-hover);
}

.btn-danger {
    border-color: var(--toc-upload-error-border);
    background: var(--toc-upload-error-bg);
    color: var(--toc-danger);
}

.ghost-btn:hover,
.small-btn:hover,
.template:hover {
    background: var(--toc-primary-bg);
    border-color: var(--toc-border-active);
    color: var(--toc-primary-dark);
}

.small-btn:disabled {
    opacity: 0.62;
    cursor: not-allowed;
}

.small-btn.ghost {
    background: var(--toc-bg-input);
    border-color: var(--toc-border-medium);
    color: var(--toc-text-secondary);
}

.style-scroll {
    padding-top: 2px;
}

.style-panel {
    padding: 2px 2px 4px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

/* ===== 模板色卡磁贴 ===== */
.template-swatch-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
}

.tpl-swatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 10px 2px 8px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.18);
    background: rgba(255, 255, 255, 0.72);
    border-radius: 12px;
    cursor: pointer;
    transition:
        transform 0.16s ease,
        border-color 0.16s ease,
        background 0.16s ease,
        box-shadow 0.16s ease;
}

.tpl-swatch:hover {
    background: #ffffff;
    border-color: rgba(var(--brand-primary-dark-rgb), 0.42);
    transform: translateY(-2px);
    box-shadow: 0 6px 14px rgba(var(--brand-primary-rgb), 0.15);
}

.tpl-swatch:active {
    transform: scale(0.94);
}

.swatch-dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.65),
        0 2px 6px rgba(0, 0, 0, 0.18);
}

.swatch-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    color: var(--toc-text-secondary);
}

/* ===== 目标图层选择：复用一体条 ===== */
.style-select {
    flex: 1;
    min-width: 0;
    appearance: none;
    border: none;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238faa9b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding: 8px 26px 8px 4px;
    font-size: var(--toc-font-sm);
    color: var(--toc-text-primary);
    outline: none;
    cursor: pointer;
}

/* ===== 颜色卡片 ===== */
.color-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    background: rgba(255, 255, 255, 0.72);
    border-radius: 11px;
    cursor: pointer;
    transition:
        border-color var(--toc-transition-fast),
        background var(--toc-transition-fast);
}

.color-card:hover {
    border-color: rgba(var(--brand-primary-dark-rgb), 0.42);
    background: #ffffff;
}

.style-color {
    -webkit-appearance: none;
    appearance: none;
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
}

.style-color::-webkit-color-swatch-wrapper {
    padding: 0;
}

.style-color::-webkit-color-swatch {
    border-radius: 8px;
    border: 2px solid #ffffff;
    box-shadow:
        0 0 0 1px rgba(var(--brand-primary-rgb), 0.28),
        0 2px 5px rgba(0, 0, 0, 0.14);
}

.style-color::-moz-color-swatch {
    border-radius: 8px;
    border: 2px solid #ffffff;
    box-shadow:
        0 0 0 1px rgba(var(--brand-primary-rgb), 0.28),
        0 2px 5px rgba(0, 0, 0, 0.14);
}

.color-meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}

.color-label {
    font-size: 11px;
    color: var(--toc-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.color-hex {
    font-size: 10px;
    color: var(--toc-text-light);
    text-transform: uppercase;
    font-variant-numeric: tabular-nums;
}

.slider-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--toc-font-sm);
    color: var(--toc-text-secondary);
}

.slider-value {
    font-size: 10px;
    font-weight: 600;
    line-height: 14px;
    color: var(--toc-primary);
    background: var(--toc-primary-bg);
    border-radius: 999px;
    padding: 1px 7px;
    font-variant-numeric: tabular-nums;
}

/* 滑块：轨道随值渐变填充（--fill 由模板注入） */
.style-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 999px;
    outline: none;
    cursor: pointer;
    background: linear-gradient(
        90deg,
        var(--brand-primary-light) var(--fill, 50%),
        rgba(var(--brand-primary-rgb), 0.16) var(--fill, 50%)
    );
}

.style-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid var(--brand-primary);
    box-shadow: 0 1px 4px rgba(var(--brand-primary-dark-rgb), 0.32);
    transition: transform 0.15s ease;
}

.style-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
}

.style-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid var(--brand-primary);
    box-shadow: 0 1px 4px rgba(var(--brand-primary-dark-rgb), 0.32);
}

/* ===== 共享资源样式 ===== */
.shared-resource-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.shared-resource-card {
    border: 1px solid rgba(153, 195, 170, 0.38);
    border-radius: 10px;
    padding: 11px;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 20px rgba(58, 91, 67, 0.08);
}

.shared-resource-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--toc-card-title-dark);
    margin-bottom: 8px;
}

.share-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    color: var(--toc-primary-light);
    background: var(--toc-primary-bg);
}

.shared-resource-menu {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.shared-resource-btn {
    border: 1px solid var(--toc-border-active);
    background: var(--toc-primary-bg);
    color: var(--toc-primary-dark);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 34px;
}

.shared-resource-btn svg {
    color: var(--toc-primary-dark);
}

.shared-resource-btn:hover {
    border-color: var(--toc-primary-light);
    background: var(--toc-primary-bg-hover);
    color: var(--toc-primary-dark);
    transform: translateY(-1px);
}

.shared-resource-btn.loading {
    opacity: 0.7;
    cursor: not-allowed;
}

.resource-tree-root {
    max-height: 320px;
    overflow-y: auto;
    padding: 6px;
    border: 1px solid var(--toc-primary-bg-hover);
    border-radius: 8px;
    background: var(--toc-primary-bg);
}

.resource-empty {
    text-align: center;
    padding: 12px 8px;
    font-size: 11px;
    color: var(--toc-text-muted);
    font-style: italic;
}

.style-slider {
    accent-color: var(--toc-primary-light);
}

.apply-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    border: none;
    border-radius: 12px;
    background: var(--brand-gradient);
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow:
        0 4px 12px rgba(var(--brand-primary-dark-rgb), 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.25);
    transition:
        filter var(--toc-transition-normal),
        transform var(--toc-transition-normal),
        box-shadow var(--toc-transition-normal);
}

.apply-btn:hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
    box-shadow: 0 6px 15px rgba(var(--brand-primary-dark-rgb), 0.36);
}

.apply-btn:active {
    transform: scale(0.98);
}

.hint {
    font-size: 12px;
    color: var(--toc-text-secondary);
    line-height: 1.9;
    padding: 2px 2px 0;
}

.draw-hint {
    border: none;
    background: transparent;
}

.empty {
    color: var(--toc-text-muted);
    font-size: 12px;
}

@media (max-width: 768px) {
    .toolbox-panel {
        padding: 10px;
    }

    .draw-grid {
        grid-template-columns: 1fr 1fr;
    }

    .actions-row,
    .coord-input-actions,
    .field-grid {
        grid-template-columns: 1fr;
    }

    .template-swatch-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .name {
        max-width: 120px;
    }

    .feature-badge {
        padding: 1px 6px;
    }

    .action-icon-btn {
        width: 22px;
        height: 22px;
        font-size: 11px;
    }
}
</style>
