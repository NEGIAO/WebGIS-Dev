<template>
    <div class="layer-switcher">
        <LocationSearch
            :fetcher="fetchLocationResults"
            :services="serviceOptions"
            storage-key="map_search_selected_service"
            @select-result="handleSearchJump"
        />

        <!-- 主行：底图标签 + 选择器 + 控制钮（紧凑单行） -->
        <div class="main-row">
            <div class="layer-label-row">
                <span class="layer-label">底图</span>
                <button
                    type="button"
                    class="icon-toggle"
                    :class="{ 'hd-on': tileHDRendering }"
                    title="高清渲染：开启后请求上一瓦片层级并缩小渲染，牺牲性能与流量换取清晰度。"
                    @click.stop="onToggleHD"
                >
                    <ImageIcon
                        :size="14"
                        :stroke-width="2"
                    />
                </button>
            </div>

            <div
                ref="customSelectRef"
                class="custom-select-container"
                @click="toggleSelectDropdown"
            >
                <div class="custom-select-trigger">
                    <span class="preset-label-text"><span class="preset-index">{{ currentLayerLabel.split(' ')[0] }}</span> <span class="preset-name">{{ currentLayerLabel.slice(currentLayerLabel.indexOf(' ') + 1) }}</span></span>
                    <ChevronDown
                        class="dropdown-arrow"
                        :class="{ 'arrow-up': isSelectDropdownOpen }"
                        :size="12"
                        :stroke-width="2.2"
                    />
                </div>
            <div v-show="isSelectDropdownOpen" class="custom-select-dropdown">
                <div
                    v-for="option in regularBasemapOptions"
                    :key="option.value"
                    class="custom-select-option"
                    :class="{ 'selected': option.value === selectedLayer }"
                    @click.stop="selectOption(option)"
                >
                    <span class="preset-index">{{ option.label.split(' ')[0] }}</span>
                    <span class="preset-name">{{ option.label.slice(option.label.indexOf(' ') + 1) }}</span>
                </div>

                <div class="history-section-divider" aria-hidden="true"></div>
                <div class="history-section-title">历史影像</div>
                <div class="history-tabs">
                    <button
                        type="button"
                        class="history-tab"
                        :class="{ active: historicalProviderTab === 'sentinel' }"
                        @click.stop="historicalProviderTab = 'sentinel'"
                    >
                        Sentinel
                    </button>
                    <button
                        type="button"
                        class="history-tab"
                        :class="{ active: historicalProviderTab === 'esri' }"
                        @click.stop="selectHistoricalProviderTab('esri')"
                    >
                        ESRI Wayback
                    </button>
                </div>
                <template v-if="historicalProviderTab === 'sentinel'">
                    <div v-for="group in sentinelYearGroups" :key="group.year" class="history-year-group">
                        <button type="button" class="history-year-toggle" @click.stop="toggleHistoryYear('sentinel', group.year)">
                            <span>{{ group.year }}年</span>
                            <ChevronRight
                                class="year-chevron"
                                :class="{ open: isHistoryYearOpen('sentinel', group.year) }"
                                :size="12"
                                :stroke-width="2.2"
                            />
                        </button>
                        <template v-if="isHistoryYearOpen('sentinel', group.year)">
                            <div
                                v-for="option in group.items"
                                :key="option.value"
                                class="custom-select-option history-option"
                                :class="{ selected: option.value === selectedLayer }"
                                @click.stop="selectOption(option)"
                            >
                                <span class="preset-name">{{ String(option.label).replace(/^\d+\s+/, '') }}</span>
                            </div>
                        </template>
                    </div>
                </template>
                <template v-else>
                    <div v-if="historicalImageryLoading" class="history-empty">正在读取快照目录…</div>
                    <div v-else-if="!esriWaybackLayers.length" class="history-empty">
                        暂无数据，后端将在启动后自动同步
                    </div>
                    <div v-for="group in esriYearGroups" :key="group.year" class="history-year-group">
                        <button type="button" class="history-year-toggle" @click.stop="toggleHistoryYear('esri', group.year)">
                            <span>{{ group.year }}年</span>
                            <ChevronRight
                                class="year-chevron"
                                :class="{ open: isHistoryYearOpen('esri', group.year) }"
                                :size="12"
                                :stroke-width="2.2"
                            />
                        </button>
                        <template v-if="isHistoryYearOpen('esri', group.year)">
                            <div
                                v-for="snapshot in group.items"
                                :key="snapshot.id"
                                class="custom-select-option history-option"
                                :class="{ selected: selectedLayer === 'custom' && snapshot.xyz_url === customMapUrl }"
                                :title="snapshot.name || snapshot.id"
                                @click.stop="selectHistoricalSnapshot(snapshot)"
                            >
                                <span class="preset-name">{{ snapshot.date }}</span>
                            </div>
                        </template>
                    </div>
                    <div v-if="historicalImageryUpdatedAt" class="history-updated">
                        更新于 {{ formatHistoryDate(historicalImageryUpdatedAt) }}
                    </div>
                </template>
            </div>
        </div>

            <div
                v-if="engine === 'ol'"
                class="controls-row"
            >
                <button
                    ref="layerManageButtonRef"
                    class="icon-toggle"
                    title="底图排序与显示"
                    @click="toggleLayerManager"
                >
                    <Layers
                        :size="14"
                        :stroke-width="1.9"
                        :color="white"
                    />
                </button>
                <button
                    class="icon-toggle text-toggle"
                    :class="{ active: activeGraticule }"
                    title="经纬度分割线"
                    @click="emit('toggle-graticule')"
                >
                    <Grid3x3
                        :size="13"
                        :stroke-width="2"
                    />
                    <span>经纬线</span>
                </button>
                <button
                    v-if="basemapCircuitOpen"
                    class="icon-toggle danger"
                    title="当前网络异常，点击重置底图链路"
                    @click="emit('reset-basemap-chain')"
                >
                    <RotateCcw
                        :size="13"
                        :stroke-width="2"
                    />
                </button>
            </div>
        </div>

        <!-- Cesium 引擎：3D overlay 开关 -->
        <div
            v-if="engine === 'cesium' && cesiumOverlays.length"
            class="cesium-overlay-toggles"
        >
            <label
                v-for="overlay in cesiumOverlays"
                :key="overlay.value"
                class="cesium-overlay-item"
            >
                <span class="switch-label-text">{{ overlay.label }}</span>
                <input
                    type="checkbox"
                    class="mini-switch"
                    :checked="overlay.active"
                    @change="emit('cesium-overlay-toggle', { overlayId: overlay.value, value: $event.target.checked })"
                />
            </label>
        </div>

        <div
            v-if="selectedLayer === 'custom'"
            class="custom-url-wrapper"
        >
            <input
                v-model="customUrlInput"
                class="custom-url-input"
                placeholder="支持 XYZ / WMS / WMTS / 矢量切片 URL"
            />
            <button
                class="custom-url-btn"
                title="加载"
                @click="submitCustomUrl"
            >
                <Check
                    :size="14"
                    :stroke-width="2.4"
                />
            </button>
        </div>
        <div
            v-if="selectedLayer === 'custom' && detectedServiceInfo"
            class="detected-format-hint"
        >
            已识别: {{ detectedServiceInfo.name }}
        </div>

        <Teleport
            v-if="engine === 'ol'"
            defer
            to="#map-container"
        >
            <div
                v-if="showLayerManager"
                class="layer-manager-panel"
                :style="layerManagerPanelStyle"
            >
                <div class="panel-header">
                    <Layers
                        :size="13"
                        :stroke-width="2"
                    />
                    <span class="panel-header-title">底图排序与显隐</span>
                    <button
                        type="button"
                        class="close-panel-btn"
                        aria-label="关闭"
                        @click="showLayerManager = false"
                    >
                        <X
                            :size="13"
                            :stroke-width="2.2"
                        />
                    </button>
                </div>
                <div class="layer-list">
                    <div
                        v-for="(layer, index) in layerList"
                        :key="layer.id"
                        class="layer-item"
                        :draggable="!isTouchDevice"
                        :class="{ dragging: draggingIndex === index, 'is-off': !layer.visible }"
                        @dragstart="onDragStart($event, index)"
                        @dragend="onDragEnd"
                        @dragover.prevent
                        @drop="onDrop($event, index)"
                        @contextmenu.prevent="onLayerContextMenu(layer, index, $event)"
                        @touchstart="onLayerTouchStart(layer, index, $event)"
                        @touchmove="onLayerTouchMove"
                        @touchend="onLayerTouchEnd"
                    >
                        <span
                            v-if="!isTouchDevice"
                            class="drag-handle"
                            title="拖拽排序"
                        >
                            <GripVertical
                                :size="12"
                                :stroke-width="2"
                            />
                        </span>
                        <button
                            type="button"
                            class="visibility-btn"
                            :class="{ off: !layer.visible }"
                            :aria-label="layer.visible ? '隐藏图层' : '显示图层'"
                            :title="layer.visible ? '隐藏图层' : '显示图层'"
                            @click.stop="updateLayerVisibility(layer)"
                        >
                            <EyeOff
                                v-if="!layer.visible"
                                :size="15"
                                :stroke-width="2"
                            />
                            <Eye
                                v-else
                                :size="15"
                                :stroke-width="2"
                            />
                        </button>
                        <span class="layer-name">{{ layer.name }}</span>
                    </div>
                </div>
            </div>
        </Teleport>

        <Teleport
            v-if="engine === 'ol'"
            defer
            to="#map-container"
        >
            <div
                v-if="showLayerContextMenu"
                class="layer-context-menu"
                :style="layerContextMenuStyle"
                @contextmenu.prevent
            >
                <div
                    class="context-menu-item context-has-submenu"
                    @mouseenter="showUrlSubmenu = true"
                    @mouseleave="showUrlSubmenu = false"
                >
                    <span>URL 操作</span>
                    <ChevronRight
                        class="submenu-arrow"
                        :size="12"
                        :stroke-width="2.2"
                    />
                    <div
                        v-if="showUrlSubmenu"
                        class="context-submenu"
                        :style="layerContextSubmenuStyle"
                    >
                        <button
                            class="context-menu-item"
                            @click="triggerLayerContextAction('copy-url')"
                        >
                            复制 URL
                        </button>
                        <button
                            class="context-menu-item"
                            @click="triggerLayerContextAction('view-url')"
                        >
                            查看 URL
                        </button>
                    </div>
                </div>

                <!-- 透明度控制 -->
                <div class="context-menu-item context-opacity-control">
                    <span class="opacity-label">透明度</span>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        :value="Math.round((layerOpacityMap.get(contextMenuLayer?.id) ?? 1) * 100)"
                        class="opacity-slider"
                        title="调整图层透明度"
                        @input="updateLayerOpacity($event)"
                    />
                    <span class="opacity-value"
                        >{{
                            Math.round((layerOpacityMap.get(contextMenuLayer?.id) ?? 1) * 100)
                        }}%</span
                    >
                </div>

                <button
                    class="context-menu-item"
                    @click="moveContextLayerToTop"
                >
                    图层置顶
                </button>
                <button
                    class="context-menu-item"
                    @click="moveContextLayerToBottom"
                >
                    图层置底
                </button>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
import {
    computed,
    defineAsyncComponent,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
} from 'vue';
import {
    toLonLat,
} from 'ol/proj';
import {
    Check,
    ChevronDown,
    ChevronRight,
    Eye,
    EyeOff,
    GripVertical,
    Image as ImageIcon,
    Layers,
    RotateCcw,
    Grid3x3,
    X,
} from '@lucide/vue';
import { apiGetHistoricalImageryLayers, apiSearchLocations } from '@/api';
import { BASEMAP_OPTIONS } from '@/constants';
import { detectCustomTileServiceKind } from '@ol/tile-source/index';
import { tileHDRendering, toggleTileHDRendering } from '@ol/basemap/basemapSystem';
import { groupBasemapsByYear } from '@common/basemap/basemapRegistry';

// ========== 异步导入子组件 ==========
/** 地名搜索组件，支持多个服务源（天地图、国际、高德） */
const LocationSearch = defineAsyncComponent(() => import('@ol/search/components/LocationSearch.vue'));

// BASEMAP_OPTIONS 已从 useBasemapManager 导入，无需本地重新定义

// ========== 组件 Props 定义 ==========
/**
 * @prop {Object} mapInstance - OpenLayers Map 实例（ShallowRef 包装）
 * @prop {Array} layerList - 当前图层列表，每项含 { id, name, visible }
 * @prop {Boolean} activeGraticule - 经纬网是否激活对象常用
 * @prop {String} selectedLayer - 当前选中底图的 ID
 * @prop {String} customMapUrl - 自定义 XYZ 底图 URL
 * @prop {String} tiandituTk - 天地图 Token
 * @prop {Boolean} isDomestic - 是否国内访问环境（用于服务推荐排序）
 * @prop {Array} services - 启用的地名检索服务列表（如 ['tianditu', 'nominatim']）
 */
const props = defineProps({
    mapInstance: {
        type: Object,
        default: null,
    },
    layerList: {
        type: Array,
        default: () => [],
    },
    activeGraticule: {
        type: Boolean,
        default: false,
    },
    basemapCircuitOpen: {
        type: Boolean,
        default: false,
    },
    selectedLayer: {
        type: String,
        default: 'google',
    },
    customMapUrl: {
        type: String,
        default: '',
    },
    tiandituTk: {
        type: String,
        default: '',
    },
    isDomestic: {
        type: Boolean,
        default: true,
    },
    services: {
        type: Array,
        default: () => [],
    },
    /** 地图引擎类型：'ol' 或 'cesium'，用于条件隐藏引擎特定功能 */
    engine: {
        type: String,
        default: 'ol',
        validator: (v) => v === 'ol' || v === 'cesium',
    },
    /** Cesium 模式下的 overlay 选项列表（国界线/注记/OSM Buildings 等） */
    cesiumOverlays: {
        type: Array,
        default: () => [],
    },
});

/**
 * @event change-layer 触发底图切换，payload: { layerId, source, customUrl? }
 * @event update-order 触发图层排序/显隐更新，payload: { type, dragIndex?, dropIndex?, layerId?, visible?, opacity? }
 * @event toggle-graticule 触发经纬网开关
 * @event search-jump 触发搜索结果定位，payload: { lng, lat, zoom, name, raw }
 * @event layer-context-action 触发图层右键菜单动作，payload: { action, layerId, layerName, layerIndex }
 */
const emit = defineEmits([
    'change-layer',
    'update-order',
    'toggle-graticule',
    'search-jump',
    'reset-basemap-chain',
    'layer-context-action',
    'cesium-overlay-toggle',
]);

const layerManageButtonRef = ref(null);
const showLayerManager = ref(false);
const draggingIndex = ref(-1);
const customUrlInput = ref(props.customMapUrl || '');
const layerManagerAnchor = ref({ top: 0, left: 0 });
const detectedServiceInfo = ref(null); // 检测到的服务类型信息
const showLayerContextMenu = ref(false);
const showUrlSubmenu = ref(false);
const contextMenuLayer = ref(null);
const layerContextMenuAnchor = ref({ top: 0, left: 0 });
const layerOpacityMap = ref(new Map()); // 存储图层透明度，key: layerId, value: opacity (0-1)
const isTouchDevice = ref(false); // 是否是触摸设备

// 移动端长按检测
const longPressTimer = ref(null);
const longPressTouchStart = ref({ x: 0, y: 0, target: null });
const LONG_PRESS_DURATION = 500; // 长按时间阈值（毫秒）
const LONG_PRESS_DRIFT = 10; // 移动距离阈值（像素）

const PANEL_WIDTH = 200;
const PANEL_GAP = 6;
const PANEL_MARGIN = 8;
const CONTEXT_MENU_WIDTH = 152;
const CONTEXT_SUBMENU_WIDTH = 136;
const CONTEXT_MENU_ESTIMATED_HEIGHT = 150;
let anchorResizeObserver = null;

const serviceOptions = computed(() => {
    if (Array.isArray(props.services) && props.services.length) return props.services;
    return [
        { value: 'tianditu', label: props.isDomestic ? '天地图（推荐）' : '天地图' },
        { value: 'nominatim', label: props.isDomestic ? '国际（Nominatim）' : '国际（推荐）' },
        { value: 'amap', label: '高德（Amap）' },
    ];
});

const layerManagerPanelStyle = computed(() => ({
    top: `${layerManagerAnchor.value.top}px`,
    left: `${layerManagerAnchor.value.left}px`,
}));

// 自定义 Select 状态
const isSelectDropdownOpen = ref(false);
const customSelectRef = ref(null);
const historicalProviderTab = ref('sentinel');
const historicalImageryLoading = ref(false);
const historicalCatalogLoaded = ref(false);
const esriWaybackLayers = ref([]);
const historicalImageryUpdatedAt = ref('');
const openHistoryYears = ref(new Set());

const sentinelBasemapOptions = computed(() =>
    BASEMAP_OPTIONS.filter((option) => String(option.value).startsWith('imagery_s2_cloudless_')),
);
const regularBasemapOptions = computed(() =>
    BASEMAP_OPTIONS.filter((option) => !String(option.value).startsWith('imagery_s2_cloudless_')),
);
const sentinelYearGroups = computed(() => Array.from(groupBasemapsByYear(sentinelBasemapOptions.value.map((item) => ({ ...item, date: String(item.value).match(/(\d{4})/)?.[1] })))).map(([year, items]) => ({ year, items })));
const esriYearGroups = computed(() => Array.from(groupBasemapsByYear(esriWaybackLayers.value)).map(([year, items]) => ({ year, items })));

function historyYearKey(provider, year) { return `${provider}:${year}`; }
function isHistoryYearOpen(provider, year) { return openHistoryYears.value.has(historyYearKey(provider, year)); }
function toggleHistoryYear(provider, year) {
    const key = historyYearKey(provider, year);
    const next = new Set(openHistoryYears.value);
    if (next.has(key)) next.delete(key); else next.add(key);
    openHistoryYears.value = next;
}

const currentLayerLabel = computed(() => {
    if (props.selectedLayer === 'custom' && props.customMapUrl) {
        const snapshot = esriWaybackLayers.value.find(
            (item) => item.xyz_url === props.customMapUrl,
        );
        if (snapshot) return `历史 ${snapshot.date}`;
    }
    const found = BASEMAP_OPTIONS.find(opt => opt.value === props.selectedLayer);
    return found ? found.label : '底图';
});

// 高清渲染开关切换（hover tips 由 title 属性提供，无需确认弹窗）
function onToggleHD() {
    toggleTileHDRendering();
}

function toggleSelectDropdown(_event) {
    isSelectDropdownOpen.value = !isSelectDropdownOpen.value;
}

function selectOption(option) {
    emit('change-layer', {
        layerId: option.value,
        source: 'dropdown',
    });
    isSelectDropdownOpen.value = false;
}

function selectHistoricalSnapshot(snapshot) {
    if (!snapshot?.xyz_url) return;
    historicalProviderTab.value = 'esri';
    isSelectDropdownOpen.value = false;
    emit('change-layer', {
        layerId: 'custom',
        source: 'custom-url',
        customUrl: snapshot.xyz_url,
    });
}

const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

function formatHistoryDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

    const dateParts = Object.fromEntries(
        historyDateFormatter.formatToParts(date).map(({ type, value: partValue }) => [type, partValue]),
    );
    return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

async function loadHistoricalImageryCatalog() {
    if (historicalCatalogLoaded.value || historicalImageryLoading.value) return;
    historicalImageryLoading.value = true;
    try {
        const data = await apiGetHistoricalImageryLayers();
        const layers = Array.isArray(data?.layers) ? data.layers : [];
        esriWaybackLayers.value = layers;
        historicalImageryUpdatedAt.value = data?.updated_at || data?.sync?.last_success_at || '';
        // 启动同步未完成时可能暂时返回空目录；保持可重试，避免 SQLite
        // 稍后写入快照后仍要求用户刷新整个页面。
        historicalCatalogLoaded.value = layers.length > 0;
    } catch {
        // 次要目录失败不阻断地图启动，并允许下次进入页签时重试。
        esriWaybackLayers.value = [];
        historicalCatalogLoaded.value = false;
    } finally {
        historicalImageryLoading.value = false;
    }
}

// Wayback 目录保持懒加载，仅在用户进入对应来源页签时请求。
function selectHistoricalProviderTab(tab) {
    historicalProviderTab.value = tab;
    if (tab === 'esri' && !historicalCatalogLoaded.value && !historicalImageryLoading.value) {
        void loadHistoricalImageryCatalog();
    }
}

const layerContextMenuStyle = computed(() => ({
    top: `${layerContextMenuAnchor.value.top}px`,
    left: `${layerContextMenuAnchor.value.left}px`,
}));

const layerContextSubmenuStyle = computed(() => {
    if (typeof window === 'undefined') {
        return { left: `${CONTEXT_MENU_WIDTH - 4}px`, top: '0px' };
    }

    const containerRect = getLayerOverlayContainerRect();
    const containerWidth = containerRect?.width ?? window.innerWidth;
    const availableRight = containerWidth - layerContextMenuAnchor.value.left;
    const canOpenRight = availableRight > CONTEXT_MENU_WIDTH + CONTEXT_SUBMENU_WIDTH + 20;

    return {
        left: canOpenRight ? `${CONTEXT_MENU_WIDTH - 4}px` : `-${CONTEXT_SUBMENU_WIDTH + 4}px`,
        top: '0px',
    };
});

watch(
    () => props.customMapUrl,
    (value) => {
        customUrlInput.value = value || '';
    },
);

/**
 * 监听自定义 URL 输入，实时检测服务类型
 */
watch(customUrlInput, (newUrl) => {
    if (!newUrl || !newUrl.trim()) {
        detectedServiceInfo.value = null;
        return;
    }

    const detected = detectCustomTileServiceKind(newUrl);
    detectedServiceInfo.value = detected.kind === 'unknown' ? null : detected;
});

/**
 * 获取当前地图范围（SW,NE）用于后端搜索裁剪。
 * @returns {string|undefined} 形如 "minLon,minLat,maxLon,maxLat"
 */
function getCurrentMapBound() {
    try {
        const map = props.mapInstance?.value;
        if (!map) return undefined;
        const view = map.getView?.();
        const size = map.getSize?.();
        if (!view || !size) return undefined;

        const extent = view.calculateExtent(size);
        const sw = toLonLat([extent[0], extent[1]]);
        const ne = toLonLat([extent[2], extent[3]]);
        return `${sw[0].toFixed(6)},${sw[1].toFixed(6)},${ne[0].toFixed(6)},${ne[1].toFixed(6)}`;
    } catch {
        return undefined;
    }
}

/**
 * 面板内部接管地名检索请求，统一接入天地图/高德/Nominatim。
 */
function fetchLocationResults({ service, keywords, page = 1, pageSize = 10 }) {
    return apiSearchLocations({
        service,
        keywords,
        page,
        pageSize,
        tiandituTk: props.tiandituTk,
        mapBound: getCurrentMapBound(),
    }).then((response) => response?.data || { items: [], total: 0 });
}

function submitCustomUrl() {
    emit('change-layer', {
        layerId: 'custom',
        source: 'custom-url',
        customUrl: customUrlInput.value,
    });
}

function onDragStart(evt, index) {
    // 移动端禁用拖动
    if (isTouchDevice.value) {
        evt.preventDefault();
        return;
    }
    draggingIndex.value = index;
    evt.dataTransfer.effectAllowed = 'move';
}

function onDragEnd() {
    draggingIndex.value = -1;
}

function onDrop(evt, dropIndex) {
    if (isTouchDevice.value) {
        evt.preventDefault();
        return;
    }
    if (draggingIndex.value < 0) return;
    emit('update-order', {
        type: 'reorder',
        dragIndex: draggingIndex.value,
        dropIndex,
    });
    draggingIndex.value = -1;
}

function closeLayerContextMenu() {
    showLayerContextMenu.value = false;
    showUrlSubmenu.value = false;
    contextMenuLayer.value = null;
}

function clampToRange(value, min, max) {
    const safeMax = Math.max(min, max);
    return Math.min(Math.max(value, min), safeMax);
}

function getLayerOverlayContainerElement() {
    if (typeof document === 'undefined') return null;

    return (
        layerManageButtonRef.value?.closest?.('.map-container') ??
        document.getElementById('map-container')
    );
}

function getLayerOverlayContainerRect() {
    return getLayerOverlayContainerElement()?.getBoundingClientRect?.() ?? null;
}

function onLayerContextMenu(layer, index, event) {
    if (!layer?.id || !event) return;

    const containerRect = getLayerOverlayContainerRect();
    const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const originLeft = containerRect?.left ?? 0;
    const originTop = containerRect?.top ?? 0;
    const containerWidth = containerRect?.width ?? fallbackWidth;
    const containerHeight = containerRect?.height ?? fallbackHeight;
    const maxLeft = containerWidth - CONTEXT_MENU_WIDTH - PANEL_MARGIN;
    const maxTop = containerHeight - CONTEXT_MENU_ESTIMATED_HEIGHT - PANEL_MARGIN;

    layerContextMenuAnchor.value = {
        left: Math.round(clampToRange(event.clientX - originLeft, PANEL_MARGIN, maxLeft)),
        top: Math.round(clampToRange(event.clientY - originTop, PANEL_MARGIN, maxTop)),
    };

    contextMenuLayer.value = {
        id: String(layer.id),
        name: String(layer.name || layer.id),
        index: Number(index),
    };
    showUrlSubmenu.value = false;
    showLayerContextMenu.value = true;
}

function triggerLayerContextAction(action) {
    const layer = contextMenuLayer.value;
    if (!layer?.id) return;

    emit('layer-context-action', {
        action,
        layerId: layer.id,
        layerName: layer.name,
        layerIndex: layer.index,
    });
    closeLayerContextMenu();
}

/**
 * 清除长按计时器
 */
function clearLongPressTimer() {
    if (longPressTimer.value) {
        clearTimeout(longPressTimer.value);
        longPressTimer.value = null;
    }
}

/**
 * 处理 touchstart 事件，启动长按计时
 */
function onLayerTouchStart(layer, index, event) {
    if (!isTouchDevice.value) return;

    const touches = event.touches;
    if (touches.length !== 1) {
        clearLongPressTimer();
        return;
    }

    longPressTouchStart.value = {
        x: touches[0].clientX,
        y: touches[0].clientY,
        target: event.currentTarget,
    };

    clearLongPressTimer();
    longPressTimer.value = setTimeout(() => {
        // 长按时间到达，显示右键菜单
        const touch = event.touches[0];
        onLayerContextMenu(layer, index, {
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => {},
        });
    }, LONG_PRESS_DURATION);
}

/**
 * 处理 touchmove 事件，如果移动距离过大则取消长按
 */
function onLayerTouchMove(event) {
    if (!isTouchDevice.value || !longPressTimer.value) return;

    const touches = event.touches;
    if (touches.length !== 1) {
        clearLongPressTimer();
        return;
    }

    const dx = touches[0].clientX - longPressTouchStart.value.x;
    const dy = touches[0].clientY - longPressTouchStart.value.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > LONG_PRESS_DRIFT) {
        clearLongPressTimer();
    }
}

/**
 * 处理 touchend 事件，清除长按计时
 */
function onLayerTouchEnd() {
    clearLongPressTimer();
}

/**
 * 更新图层透明度
 */
function updateLayerOpacity(event) {
    const opacity = Number(event.target.value) / 100;
    const layer = contextMenuLayer.value;
    if (!layer?.id) return;

    layerOpacityMap.value.set(layer.id, opacity);
    emit('update-order', {
        type: 'opacity',
        layerId: layer.id,
        opacity,
    });
}

function moveContextLayerToTop() {
    const index = Number(contextMenuLayer.value?.index);
    if (!Number.isInteger(index)) return;
    if (index <= 0) {
        closeLayerContextMenu();
        return;
    }

    emit('update-order', {
        type: 'reorder',
        dragIndex: index,
        dropIndex: 0,
    });
    closeLayerContextMenu();
}

function moveContextLayerToBottom() {
    const index = Number(contextMenuLayer.value?.index);
    const lastIndex = props.layerList.length - 1;
    if (!Number.isInteger(index) || lastIndex < 0) return;
    if (index >= lastIndex) {
        closeLayerContextMenu();
        return;
    }

    emit('update-order', {
        type: 'reorder',
        dragIndex: index,
        dropIndex: lastIndex,
    });
    closeLayerContextMenu();
}

function handleGlobalPointerDown(event) {
    const target = event?.target;
    // 处理自定义底图选择器的外部点击
    if (isSelectDropdownOpen.value && target instanceof Element && !target.closest('.custom-select-container')) {
        isSelectDropdownOpen.value = false;
    }

    if (!showLayerContextMenu.value) return;
    if (target instanceof Element && target.closest('.layer-context-menu')) return;
    closeLayerContextMenu();
}

function updateLayerVisibility(layer) {
    emit('update-order', {
        type: 'visibility',
        layerId: layer.id,
        visible: !layer.visible,
    });
}

/**
 * 将 LocationSearch 原始结果解析成标准地图定位载荷。
 * 支持 lon/lat、x/y、lng/lat、lonlat 字符串等多来源字段。
 */
function handleSearchJump(payload) {
    const lonVal = payload?.lon ?? payload?.x ?? payload?.lng ?? payload?.lonlat?.split?.(',')?.[0];
    const latVal =
        payload?.lat ?? payload?.y ?? payload?.latit ?? payload?.lonlat?.split?.(',')?.[1];
    const sourceService = String(payload?._service || (payload?.id ? 'amap' : ''))
        .trim()
        .toLowerCase();

    const lng = lonVal != null ? Number.parseFloat(lonVal) : NaN;
    const lat = latVal != null ? Number.parseFloat(latVal) : NaN;

    emit('search-jump', {
        lng,
        lat,
        zoom: 16,
        name: String(payload?.display_name || payload?.name || '').trim(),
        service: sourceService,
        poiid: payload?.id ? String(payload.id).trim() : '',
        raw: payload,
    });
}

function updateLayerManagerAnchor() {
    const buttonEl = layerManageButtonRef.value;
    if (!buttonEl) return;
    const rect = buttonEl.getBoundingClientRect();
    const containerRect = getLayerOverlayContainerRect();
    const originLeft = containerRect?.left ?? 0;
    const originTop = containerRect?.top ?? 0;
    const containerWidth = containerRect?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
    const maxLeft = containerWidth - PANEL_WIDTH - PANEL_MARGIN;
    layerManagerAnchor.value = {
        top: Math.round(Math.max(PANEL_MARGIN, rect.bottom - originTop + PANEL_GAP)),
        left: Math.round(
            clampToRange(rect.right - originLeft - PANEL_WIDTH, PANEL_MARGIN, maxLeft),
        ),
    };
}

function toggleLayerManager() {
    showLayerManager.value = !showLayerManager.value;
}

function bindAnchorListeners() {
    window.addEventListener('resize', updateLayerManagerAnchor);
    window.addEventListener('scroll', updateLayerManagerAnchor, true);

    if (typeof ResizeObserver !== 'undefined') {
        anchorResizeObserver = new ResizeObserver(updateLayerManagerAnchor);
        const containerEl = getLayerOverlayContainerElement();
        if (containerEl) anchorResizeObserver.observe(containerEl);
    }
}

function unbindAnchorListeners() {
    window.removeEventListener('resize', updateLayerManagerAnchor);
    window.removeEventListener('scroll', updateLayerManagerAnchor, true);
    anchorResizeObserver?.disconnect();
    anchorResizeObserver = null;
}

watch(showLayerManager, async (visible) => {
    if (!visible) {
        unbindAnchorListeners();
        draggingIndex.value = -1;
        closeLayerContextMenu();
        return;
    }

    await nextTick();
    updateLayerManagerAnchor();
    bindAnchorListeners();
});

onMounted(() => {
    window.addEventListener('pointerdown', handleGlobalPointerDown);

    // 检测是否为触摸设备
    isTouchDevice.value =
        'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
});

onBeforeUnmount(() => {
    unbindAnchorListeners();
    clearLongPressTimer();
    window.removeEventListener('pointerdown', handleGlobalPointerDown);
});
</script>

<style scoped>
/* 浅色玻璃拟态浮层：与全站面板语言一致 */
.layer-switcher {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--brand-primary-dark);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    padding: 5px;
    border-radius: 10px;
    box-shadow:
        var(--toc-shadow-md),
        inset 0 1px 0 rgba(255, 255, 255, 0.6);
    z-index: 10;
}

@media (max-width: 768px) {
    .layer-switcher {
        right: 5px;
        top: 10px;
        padding: 6px;
    }
}

/* ===== 主行：标签 + 选择器 + 控制钮 ===== */
.main-row {
    display: flex;
    align-items: center;
    gap: 4px;
}

.layer-label-row {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
}

.layer-label{
    color: #f0f0f0;
}

/* 幽灵图标钮（HD / 图层管理 / 经纬线 / 重置） */
.icon-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 24px;
    height: 24px;
    padding: 0 4px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: white;
    cursor: pointer;
    font-size: 12px;
    transition:
        color var(--toc-transition-fast),
        background var(--toc-transition-fast),
        transform var(--toc-transition-fast);
}

.icon-toggle:hover {
    color: #ffffff92;
    background: var(--toc-primary-bg-hover);
}

.icon-toggle:active {
    transform: scale(0.92);
}

.icon-toggle.hd-on,
.icon-toggle.active {
    color:#38BDF8;
    background: #38bff836;
    box-shadow: 0 2px 6px rgba(var(--brand-primary-dark-rgb), 0.3);
}

.icon-toggle.text-toggle span {
    white-space: nowrap;
}

.icon-toggle.danger {
    color: var(--danger);
    background: rgba(var(--danger-rgb), 0.08);
}

.icon-toggle.danger:hover {
    background: rgba(var(--danger-rgb), 0.16);
}

/* ===== 底图选择器 ===== */
.custom-select-container {
    position: relative;
    flex: 1;
    min-width: 0;
    user-select: none;
}

.custom-select-trigger {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 7px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 8px;
    background: #ffffff;
    cursor: pointer;
    transition:
        border-color var(--toc-transition-slow),
        box-shadow var(--toc-transition-slow);
}

.custom-select-trigger:hover {
    color:rgb(16, 161, 40);
    border-color: rgba(var(--brand-primary-rgb), 0.32);
    box-shadow: 0 3px 9px rgba(var(--brand-primary-rgb), 0.14);
}

.preset-label-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.controls-row {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
}

.dropdown-arrow {
    flex-shrink: 0;
    margin-left: auto;
    color: var(--toc-text-secondary);
    transition: transform 0.25s ease;
}

.dropdown-arrow.arrow-up {
    transform: rotate(180deg);
}

.custom-select-dropdown {
    position: absolute;
    top: calc(100% + 5px);
    left: 0;
    right: 0;
    width: max-content;
    min-width: 100%;
    max-height: 450px;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 11px;
    box-shadow: var(--toc-shadow-lg);
    z-index: var(--z-modal-high);
    overflow-y: auto;
    animation: fadeIn 0.15s ease-out;
}

.custom-select-dropdown::-webkit-scrollbar {
    width: 6px;
}

.custom-select-dropdown::-webkit-scrollbar-track {
    background: transparent;
}

.custom-select-dropdown::-webkit-scrollbar-thumb {
    background: rgba(var(--brand-primary-rgb), 0.35);
    border-radius: 4px;
}

.custom-select-option {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    color: var(--toc-text-primary);
    cursor: pointer;
    font-size: 12px;
    transition: background var(--toc-transition-fast);
}

.preset-index {
    color: var(--brand-primary);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.preset-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.custom-select-option:hover {
    background: var(--toc-primary-bg-hover);
}

.custom-select-option.selected {
    background: var(--toc-primary-bg-hover);
    color: var(--brand-accent-dark);
    font-weight: 600;
}

.custom-select-option.selected .preset-index {
    color: var(--brand-accent-dark);
}

/* 历史影像区 */
.history-section-divider {
    height: 1px;
    margin: 5px 8px;
    background: rgba(var(--brand-primary-rgb), 0.14);
}

.history-section-title {
    padding: 6px 11px 4px;
    color: var(--brand-accent-dark);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
}

.history-tabs {
    display: flex;
    gap: 3px;
    margin: 0 8px 6px;
    padding: 3px;
    border-radius: 9px;
    background: rgba(var(--brand-primary-rgb), 0.08);
}

.history-tab {
    flex: 1;
    padding: 4px 6px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--toc-text-secondary);
    cursor: pointer;
    font-size: 11px;
    transition:
        background var(--toc-transition-fast),
        color var(--toc-transition-fast);
}

.history-tab.active {
    background: #ffffff;
    color: var(--brand-accent-dark);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(var(--brand-primary-dark-rgb), 0.18);
}

.history-option .preset-name {
    white-space: nowrap;
}

.history-year-group + .history-year-group {
    border-top: 1px solid rgba(var(--brand-primary-rgb), 0.09);
}

.history-year-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border: 0;
    background: transparent;
    color: var(--toc-text-secondary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    transition: background var(--toc-transition-fast);
}

.history-year-toggle:hover {
    background: var(--toc-primary-bg);
}

.year-chevron {
    color: var(--toc-text-light);
    transition: transform var(--toc-transition-normal);
}

.year-chevron.open {
    transform: rotate(90deg);
}

.history-empty,
.history-updated {
    padding: 6px 12px;
    color: var(--toc-text-muted);
    font-size: 11px;
}

.history-updated {
    border-top: 1px solid rgba(var(--brand-primary-rgb), 0.12);
    color: var(--toc-text-light);
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
}

/* ===== 自定义 URL ===== */
.custom-url-wrapper {
    display: flex;
    gap: 5px;
}

.custom-url-input {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    border-radius: 9px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    font-size: 12px;
    background: #ffffff;
    color: var(--text-brand-dark);
    outline: none;
    transition:
        border-color var(--toc-transition-slow),
        box-shadow var(--toc-transition-slow);
}

.custom-url-input::placeholder {
    color: var(--toc-text-light);
}

.custom-url-input:focus {
    border-color: var(--brand-primary-light);
    box-shadow: 0 0 0 3px var(--toc-primary-bg-hover);
}

.custom-url-btn {
    flex-shrink: 0;
    width: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    border: none;
    background: var(--brand-gradient);
    color: #ffffff;
    cursor: pointer;
    transition:
        filter 0.12s ease,
        transform 0.12s ease;
}

.custom-url-btn:hover {
    filter: brightness(1.06);
}

.custom-url-btn:active {
    transform: scale(0.94);
}

.detected-format-hint {
    margin-top: -1px;
    padding: 4px 9px;
    background: var(--toc-primary-bg);
    border-left: 3px solid var(--brand-primary);
    border-radius: 6px;
    color: var(--brand-accent-dark);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ===== 图层管理浮层 ===== */
.layer-manager-panel {
    position: absolute;
    width: 216px;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.18);
    border-radius: 12px;
    box-shadow: var(--toc-shadow-lg);
    padding: 0;
    max-height: 300px;
    overflow-y: auto;
    z-index: var(--z-modal);
}

.layer-manager-panel::-webkit-scrollbar {
    width: 8px;
}

.layer-manager-panel::-webkit-scrollbar-track {
    background: rgba(240, 245, 240, 0.8);
}

.layer-manager-panel::-webkit-scrollbar-thumb {
    background: var(--brand-primary-light);
    border-radius: 4px;
}

.layer-manager-panel::-webkit-scrollbar-thumb:hover {
    background: var(--brand-primary-light);
}

.panel-header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    background: var(--bg-brand-light);
    border-bottom: 1px solid var(--brand-primary-lighter);
    border-radius: 4px 4px 0 0;
    font-size: 13px;
    font-weight: bold;
    color: var(--brand-accent-dark);
}

.panel-header-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.close-panel-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--toc-text-secondary);
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease,
        transform 0.12s ease;
}

.close-panel-btn:hover {
    background: rgba(var(--danger-rgb), 0.12);
    color: var(--danger);
    transform: scale(1.06);
}

.close-panel-btn:active {
    transform: scale(0.9);
}

.layer-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
}

.layer-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 4px;
    cursor: move;
    font-size: 13px;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
}

.layer-item:hover {
    background: #f0f0f0;
}

.layer-item.dragging {
    opacity: 0.5;
    background: var(--border-light);
}

/* 隐藏图层整行淡化 */
.layer-item.is-off {
    background: rgba(0, 0, 0, 0.03);
}

.layer-item.is-off .layer-name {
    opacity: 0.55;
}

.drag-handle {
    cursor: grab;
    color: var(--text-muted);
    font-weight: bold;
    padding-right: 4px;
}

.drag-handle.mobile-hint {
    cursor: pointer;
    color: var(--brand-primary);
    font-weight: bold;
    padding-right: 4px;
    font-size: 16px;
}

/* 眼睛显隐开关 */
.visibility-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--brand-primary);
    cursor: pointer;
    transition:
        color var(--toc-transition-fast),
        background var(--toc-transition-fast),
        transform var(--toc-transition-fast);
}

.visibility-btn:hover {
    background: rgba(var(--brand-primary-rgb), 0.12);
    transform: scale(1.05);
}

.visibility-btn:active {
    transform: scale(0.9);
}

.visibility-btn.off {
    color: var(--text-muted);
}

.visibility-btn.off:hover {
    background: rgba(0, 0, 0, 0.06);
}

.layer-name {
    flex: 1;
}

.layer-context-menu {
    position: absolute;
    min-width: 152px;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid var(--border-brand-light);
    border-radius: 6px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.25);
    padding: 4px;
    z-index: 2100;
}

.context-menu-item {
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
    font-size: 12px;
    color: #0f172a;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.context-menu-item:hover {
    background: var(--bg-brand-light);
    color: var(--brand-accent-dark);
}

.context-has-submenu {
    position: relative;
}

.context-opacity-control {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: var(--bg-brand-light);
}

.opacity-label {
    font-size: 12px;
    color: #0f172a;
    white-space: nowrap;
    flex-shrink: 0;
}

.opacity-slider {
    flex: 1;
    min-width: 80px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--bg-brand-lighter);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}

.opacity-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--brand-primary);
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.opacity-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--brand-primary);
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.opacity-value {
    font-size: 11px;
    color: #0f172a;
    min-width: 30px;
    text-align: right;
    font-weight: 600;
    flex-shrink: 0;
}

.context-submenu {
    position: absolute;
    min-width: 136px;
    background: rgba(255, 255, 255, 0.99);
    border: 1px solid var(--border-brand-light);
    border-radius: 6px;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.2);
    padding: 4px;
    z-index: 2110;
}

.submenu-arrow {
    color: #4b5563;
    font-size: 10px;
}

@media (max-width: 768px) {
    .layer-switcher {
        top: 5px;
        right: 3px;
    }
}

/* Cesium overlay 开关 */
.cesium-overlay-toggles {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.cesium-overlay-item {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--bg-brand-light);
    font-size: 12px;
    cursor: pointer;
}

.cesium-overlay-item input[type="checkbox"] {
    width: 14px;
    height: 14px;
    cursor: pointer;
}
</style>
