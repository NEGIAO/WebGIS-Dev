<template>
    <div class="map-container" ref="mapContainerRef">
        <div id="map" ref="mapRef"></div>

        <!-- 图片集覆盖层 (特定区域显示) -->
        <transition name="fade">
            <div v-if="shouldMountImageSet && showImageSet" class="imageset"
                :style="{ left: imageSetPosition.x + 'px', top: imageSetPosition.y + 'px' }">
                <img v-for="(img, index) in images" :key="index" :src="img" class="thumbnail"
                    loading="lazy" decoding="async"
                    @click.stop="showLargeImage(img)" />
            </div>
        </transition>

        <!-- 大图覆盖层 (改为全屏遮罩模式，体验更好) -->
        <div v-if="showLargeImg" class="lightbox" @click="closeLargeImage">
            <img :src="largeImageSrc" class="large-image" @click.stop />
            <button class="close-btn" @click="closeLargeImage">×</button>
        </div>

        <!-- 图层切换器 -->
        <div class="layer-switcher">
            <!-- 地名搜索功能     -->
            <LocationSearch
                :fetcher="fetchLocationResults"
                :amapKey="AMAP_WEB_SERVICE_KEY"
                :services="searchServiceOptions"
                storageKey="map_search_selected_service"
                @select-result="selectResult"
            />
            
            <div class="layer-label">选择底图</div>
            <select v-model="selectedLayer" class="layer-select">
                <option value="local">自定义瓦片</option>
                <option value="tianDiTu_vec">天地图矢量</option>
                <option value="tianDiTu">天地图影像</option>
                <option value="google">Google</option>
                <option value="google_standard">Google标准</option>
                <option value="google_clean">Google简洁</option>
                <option value="esri">ESRI</option>
                <option value="osm">OSM</option>
                <option value="amap">高德地图</option>
                <option value="tengxun">腾讯地图</option>
                <option value="esri_ocean">Esri海洋</option>
                <option value="esri_terrain">Esri地形</option>
                <option value="esri_physical">Esri物理</option>
                <option value="esri_hillshade">Esri山影</option>
                <option value="esri_gray">Esri灰度</option>
                <option value="gggis_time">谷谷地球最新</option>
                <option value="yandex_sat">Yandex卫星</option>
                <option value="geoq_gray">GeoQ灰色</option>
                <option value="geoq_hydro">GeoQ水系</option>
                <option value="custom">自定义URL</option>
            </select>
            <!-- 新增图层管理按钮 -->
             <button class="layer-manage-btn" @click="showLayerManager = !showLayerManager" title="图层管理">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8 9.5 9.25 12 11zm0 2.5l-5-2.5-2 1L12 15.5l7-3.5-2-1-5 2.5zm0 5l-5-2.5-2 1L12 21l7-3.5-2-1-5 2.5z"/>
                </svg>
            </button>

            <!-- 经纬度直线动态分割当前视图，并标注经纬度 -->
            <button
                class="graticule-btn"
                :class="{ active: showDynamicSplitLines }"
                @click="toggleDynamicSplitLines"
                title="经纬度分割线"
            >
                经纬线
            </button>

            <div v-if="selectedLayer === 'custom'" class="custom-url-wrapper">
                <input v-model="customMapUrl" class="custom-url-input" placeholder="输入 https://.../{z}/{x}/{y}.png" />
                <button class="custom-url-btn" @click="loadCustomMap" title="加载">ok</button>
            </div>
             <!-- 图层管理面板 -->
             <div v-if="showLayerManager" class="layer-manager-panel">
                <div class="panel-header">
                    <span>图层排序与显示</span>
                    <span class="close-panel-btn" @click="showLayerManager = false">×</span>
                </div>
                <div class="layer-list">
                    <div v-for="(layer, index) in layerList" :key="layer.id" 
                        class="layer-item"
                        draggable="true"
                        @dragstart="onDragStart($event, index)"
                        @dragover.prevent
                        @drop="onDrop($event, index)"
                        :class="{'dragging': draggingIndex === index}">
                        <div class="drag-handle">⋮⋮</div>
                        <input type="checkbox" v-model="layer.visible" @change="updateLayerVisibility(layer)">
                        <span class="layer-name">{{ layer.name }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 底部控制栏 -->
        <div class="map-controls-group">
            <div ref="mousePositionRef" class="mouse-position-content"></div>
            <div class="zoom-level-display">{{ currentZoom }}</div>
            <div class="divider"></div>
            <!-- 核心修改：移除 @dblclick，统一用 @click 处理 -->
            <button class="home-btn" @click="handleHomeInteract" title="单击复位 / 双击定位">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
            </button>
        </div>
    </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import debounce from 'lodash/debounce';
import { fetchLocationResultsByService } from '../api/locationSearch';
import { useManagedLayerRegistry } from '../composables/useManagedLayerRegistry';
import { useUserLocation } from '../composables/useUserLocation';
import { useAreaImageOverlay } from '../composables/useAreaImageOverlay';
import { useMessage } from '../composables/useMessage';

const LocationSearch = defineAsyncComponent(() => import('./LocationSearch.vue'));
const message = useMessage();

// OpenLayers 核心库
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Overlay from 'ol/Overlay';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls, ScaleLine, MousePosition, OverviewMap } from 'ol/control';
import { createStringXY } from 'ol/coordinate';
import { unByKey } from 'ol/Observable';
import { getArea, getLength } from 'ol/sphere';
import { createEmpty, extend as extendExtent, isEmpty as isExtentEmpty } from 'ol/extent';

// 图层与数据源
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';

// 几何与交互
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
import { LineString, Polygon } from 'ol/geom';
import { Draw, Snap } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';

// --- 配置常量 ---
const BASE_URL = import.meta.env.BASE_URL || '/';
const NORM_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const INITIAL_VIEW = { center: [114.302, 34.8146], zoom: 17 };
const AMAP_WEB_SERVICE_KEY = '3e6d96476b807126acbc59384aa13e51';

const route = useRoute();
const router = useRouter();

const URL_LAYER_OPTIONS = [
    'local',
    'tianDiTu_vec',
    'tianDiTu',
    'google',
    'google_standard',
    'google_clean',
    'esri',
    'osm',
    'amap',
    'tengxun',
    'esri_ocean',
    'esri_terrain',
    'esri_physical',
    'esri_hillshade',
    'esri_gray',
    'gggis_time',
    'yandex_sat',
    'geoq_gray',
    'geoq_hydro',
    'custom'
];

// 天地图 Token：优先使用环境变量，否则使用默认值
// 生产环境建议在 .env 文件中配置 VITE_TIANDITU_TK
const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';

const DIHUAN_BOUNDS = { minLon: 114.3020, maxLon: 114.3030, minLat: 34.8149, maxLat: 34.8154 };
const IMAGES = [
    '地理与环境学院标志牌.webp', '地理与环境学院入口.webp', '地学楼.webp',
    '教育部重点实验室.webp', '四楼逃生图.webp', '学院楼单侧.webp'
].map(img => `${NORM_BASE}images/${img}`);

// --- Refs ---
const mapRef = ref(null);
const mapContainerRef = ref(null);
const mousePositionRef = ref(null);
const mapInstance = shallowRef(null); // 使用 shallowRef 优化性能

const selectedLayer = ref('google');
const customMapUrl = ref('');
const showImageSet = ref(false);
const showLayerManager = ref(false);
const showDynamicSplitLines = ref(false);
const imageSetPosition = ref({ x: 0, y: 0 });
const showLargeImg = ref(false);
const largeImageSrc = ref('');
const shouldMountImageSet = ref(false);
const images = ref([]);
const currentZoom = ref(17); // 当前缩放级别

const isDomestic = ref(true); // 是否为国内用户（基于 IP 判断）
const searchServiceOptions = computed(() => ([
    { value: 'tianditu', label: isDomestic.value ? '天地图（推荐）' : '天地图' },
    { value: 'nominatim', label: !isDomestic.value ? '国际（推荐）' : '国际（Nominatim）' },
    { value: 'amap', label: '高德（Amap）' }
]));

let searchSource, searchLayer;
let customSource = null;
const SEARCH_RESULT_STYLE = {
    fillColor: '#ef4444',
    fillOpacity: 0.9,
    strokeColor: '#ffffff',
    strokeWidth: 2,
    pointRadius: 8
};

// 统一主机配置：在这里切换相关地图服务主机名。
const TILE_HOSTS = {
    tianditu: 't0.tianditu.gov.cn',
    googleCandidates: ['mt3v.gggis.com', 'gac-geo.googlecnapps.club']
};
// 可选：'manual' 固定主机；'fastest' 启动后测速并自动切换最快主机。
const GOOGLE_HOST_STRATEGY = 'manual';
const GOOGLE_MANUAL_HOST = TILE_HOSTS.googleCandidates[1];
const GOOGLE_PROBE_TIMEOUT_MS = 1200;
const CRITICAL_TILE_READY_TIMEOUT_MS = 1400;
const activeGoogleTileHost = ref(GOOGLE_MANUAL_HOST);

// [隶属] 图层切换-底图源地址构建
// [作用] 拼接 Google 瓦片服务 URL。
// [交互] 被 LAYER_CONFIGS 的 createSource 间接调用。
const buildGoogleTileUrl = (pathAndQuery) => `https://${activeGoogleTileHost.value}${pathAndQuery}`;
// [隶属] 图层切换-底图源地址构建
// [作用] 拼接天地图瓦片服务 URL。
// [交互] 被 LAYER_CONFIGS 的 createSource 间接调用。
const buildTiandituUrl = (pathAndQuery) => `https://${TILE_HOSTS.tianditu}${pathAndQuery}`;

// [隶属] 图层切换-底图连通性策略
// [作用] 通过图片探测估算候选 Google 主机延迟。
// [交互] 供 resolvePreferredGoogleHost 调用。
function probeGoogleHostLatency(host, timeoutMs = GOOGLE_PROBE_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const start = performance.now();
        const img = new Image();
        let settled = false;
        const end = (latency) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
            resolve(latency);
        };
        const timer = setTimeout(() => end(Number.POSITIVE_INFINITY), timeoutMs);
        img.onload = () => end(performance.now() - start);
        img.onerror = () => end(Number.POSITIVE_INFINITY);
        img.src = `https://${host}/maps/vt?lyrs=s&x=0&y=0&z=1&_probe=${Date.now()}`;
    });
}

// [隶属] 图层切换-底图连通性策略
// [作用] 选择可用且延迟最低的 Google 主机。
// [交互] 被 runDeferredStartupTasks 调用，随后触发 refreshGoogleLayerSources。
async function resolvePreferredGoogleHost() {
    if (GOOGLE_HOST_STRATEGY !== 'fastest') return GOOGLE_MANUAL_HOST;
    const candidates = TILE_HOSTS.googleCandidates || [];
    if (!candidates.length) return GOOGLE_MANUAL_HOST;

    const measured = await Promise.all(candidates.map(async (host) => ({
        host,
        latency: await probeGoogleHostLatency(host)
    })));

    measured.sort((a, b) => a.latency - b.latency);
    const best = measured[0];
    return Number.isFinite(best?.latency) ? best.host : GOOGLE_MANUAL_HOST;
}

// 图层配置 (集中管理 id, name, source创建逻辑)
const LAYER_CONFIGS = [
    { 
        id: 'label', name: '天地图注记', visible: true,
        createSource: () => new XYZ({ url: `${buildTiandituUrl('/cia_w/wmts')}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}` }) 
    },
    { 
        id: 'label_vector', name: '天地图矢量注记', visible: false,
        createSource: () => new XYZ({ url: `${buildTiandituUrl('/cva_w/wmts')}?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cva&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}` }) 
    },
    { 
        id: 'Water', name: '水系', visible: false,
        createSource: () => new XYZ({ url: `https://idataapi.geovisearth.com/tiles/{z}/{x}/{-y}.png` }) 
    },
    { 
        id: 'google', name: 'Google', visible: true,
        createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=s&x={x}&y={y}&z={z}'), maxZoom: 20 }) 
    },
    { 
        id: 'custom', name: '自定义', visible: false,
        createSource: () => null 
    },
    { 
        id: 'local', name: '自定义瓦片', visible: false,
        createSource: () => new XYZ({ url: `${NORM_BASE}tiles/{z}/{x}/{y}.png` }) 
    },
    { 
        id: 'tianDiTu_vec', name: '天地图矢量', visible: false,
        createSource: () => new XYZ({ url: `${buildTiandituUrl('/vec_w/wmts')}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}` }) 
    },
    { 
        id: 'tianDiTu', name: '天地图影像', visible: false,
        createSource: () => new XYZ({ url: `${buildTiandituUrl('/img_w/wmts')}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}` }) 
    },
    { 
        id: 'google_standard', name: 'Google标准', visible: false,
        createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt/lyrs=m&x={x}&y={y}&z={z}') }) 
    },
    { 
        id: 'google_clean', name: 'Google简洁', visible: false,
        createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt/lyrs=m&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off,s.t:3|s.e.g|p.v:off') }) 
    },
    { 
        id: 'esri', name: 'ESRI', visible: false,
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 20 }) 
    },
    { 
        id: 'osm', name: 'OSM', visible: false,
        createSource: () => new OSM() 
    },
    { 
        id: 'amap', name: '高德地图', visible: false,
        createSource: () => new XYZ({ url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}' }) 
    },
    { 
        id: 'tengxun', name: '腾讯地图', visible: false,
        createSource: () => new XYZ({ url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0' }) 
    },
    {
        id: 'esri_ocean', name: 'Esri海洋', visible: false,
        createSource: () => new XYZ({ url: 'https://server.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'esri_terrain', name: 'Esri地形', visible: false,
        createSource: () => new XYZ({ url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'esri_physical', name: 'Esri物理', visible: false,
        createSource: () => new XYZ({ url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'esri_hillshade', name: 'Esri山影', visible: false,
        createSource: () => new XYZ({ url: 'https://server.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'esri_gray', name: 'Esri灰度', visible: false,
        createSource: () => new XYZ({ url: 'https://server.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'yandex_sat', name: 'Yandex卫星', visible: false,
        createSource: () => new XYZ({ url: 'https://sat02.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}' })
    },
    {
        id: 'geoq_gray', name: 'GeoQ灰色', visible: false,
        createSource: () => new XYZ({ url: 'https://thematic.geoq.cn/arcgis/rest/services/ChinaOnlineStreetGray/MapServer/WMTS/tile/1.0.0/ChinaOnlineStreetGray/default/GoogleMapsCompatible/{z}/{y}/{x}.png' })
    },
    {
        id: 'geoq_hydro', name: 'GeoQ水系', visible: false,
        createSource: () => new XYZ({ url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png' })
    }
];

// 初始化图层列表状态 (从配置生成)
const layerList = ref(LAYER_CONFIGS.map(cfg => ({ 
    id: cfg.id, 
    name: cfg.name, 
    visible: cfg.visible 
})));
const draggingIndex = ref(-1);
const layerInstances = {}; // 存储所有 TileLayer 实例

// --- 全局变量 (非响应式) ---
let drawInteraction, snapInteraction;
let measureTooltipEl, measureTooltipOverlay;
let helpTooltipEl, helpTooltipOverlay;
let sketchFeature;
let homeClickTimer = null; // 用于处理单击双击冲突
let componentUnmounted = false;
let dynamicSplitLinesLayer = null;
let dynamicSplitMoveKey = null;
let mapMoveEndKey = null;
let pendingBusPick = null;
let busRouteLayerRef = null;
let busRouteManagedLayerId = null;
let busActiveStepIndex = -1;
let busHoverStepIndex = -1;
let driveActiveStepIndex = -1;
let driveHoverStepIndex = -1;

// 图层引用
let baseLayer, labelLayer;
const drawSource = new VectorSource();
const userLocationSource = new VectorSource();
const busPickSource = new VectorSource();
const busRouteSource = new VectorSource();
const busStepStyleCache = new globalThis.Map();

const emit = defineEmits([
    'location-change',
    'update-news-image',
    'feature-selected',
    'user-layers-change',
    'graphics-overview',
    'base-layers-change',
    'upload-progress-change'
]);

const {
    isCoordinateInChina,
    detectIPLocale,
    getCurrentLocation,
    zoomToUser,
    updateUserPosition
} = useUserLocation({
    mapInstance,
    userLocationSource,
    isDomestic
});

const {
    checkAreaLogic,
    showLargeImage,
    closeLargeImage
} = useAreaImageOverlay({
    mapInstance,
    showImageSet,
    imageSetPosition,
    showLargeImg,
    largeImageSrc,
    bounds: DIHUAN_BOUNDS,
    emit
});

watch(showImageSet, (visible) => {
    if (!visible || shouldMountImageSet.value) return;
    shouldMountImageSet.value = true;
    images.value = IMAGES;
});

const isAttributeQueryEnabled = ref(true);
const userDataLayers = [];
let drawGraphicSeed = 1;
let drawLayerInstance = null;
let currentManagedFeatureHighlight = null;

const STYLE_TEMPLATES = {
    classic: {
        fillColor: '#5fbf7a',
        fillOpacity: 0.24,
        strokeColor: '#2f7d3c',
        strokeWidth: 2,
        pointRadius: 6
    },
    warning: {
        fillColor: '#f59e0b',
        fillOpacity: 0.2,
        strokeColor: '#b45309',
        strokeWidth: 2.5,
        pointRadius: 6
    },
    water: {
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        strokeColor: '#1d4ed8',
        strokeWidth: 2,
        pointRadius: 6
    },
    magenta: {
        fillColor: '#ec4899',
        fillOpacity: 0.18,
        strokeColor: '#be185d',
        strokeWidth: 2,
        pointRadius: 6
    }
};

const {
    createManagedLayerId,
    emitUserLayersChange,
    emitGraphicsOverview,
    refreshUserLayerZIndex,
    addManagedLayerRecord
} = useManagedLayerRegistry({
    emit,
    userDataLayers,
    drawSource,
    styleTemplates: STYLE_TEMPLATES
});

const drawStyleConfig = ref({ ...STYLE_TEMPLATES.classic });

// [隶属] 图层管理-样式系统
// [作用] 对样式配置做归一化，统一默认值和边界。
// [交互] 被 createStyleFromConfig / mergeStyleConfig 调用。
function normalizeStyleConfig(styleCfg = {}) {
    const base = { ...STYLE_TEMPLATES.classic, ...(styleCfg || {}) };
    return {
        fillColor: base.fillColor,
        fillOpacity: Math.min(1, Math.max(0, Number(base.fillOpacity ?? 0.2))),
        strokeColor: base.strokeColor,
        strokeWidth: Math.max(0.5, Number(base.strokeWidth ?? 2)),
        pointRadius: Math.max(3, Number(base.pointRadius ?? 6))
    };
}

// [隶属] 图层管理-样式系统
// [作用] 将样式配置转换为 OpenLayers Style 实例。
// [交互] 被绘图层、上传层、搜索层样式设置调用。
function createStyleFromConfig(styleCfg, options = {}) {
    const cfg = normalizeStyleConfig(styleCfg);
    const hex = cfg.fillColor?.replace('#', '') || '5fbf7a';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const labelText = String(options.labelText || '').trim();
    return new Style({
        stroke: new Stroke({ color: cfg.strokeColor, width: cfg.strokeWidth }),
        fill: new Fill({ color: `rgba(${r}, ${g}, ${b}, ${cfg.fillOpacity})` }),
        image: new CircleStyle({
            radius: cfg.pointRadius,
            fill: new Fill({ color: cfg.fillColor }),
            stroke: new Stroke({ color: cfg.strokeColor, width: Math.max(1, cfg.strokeWidth / 2) })
        }),
        text: labelText
            ? new Text({
                text: labelText.length > 48 ? `${labelText.slice(0, 48)}...` : labelText,
                font: '600 12px "Segoe UI", "Microsoft YaHei", sans-serif',
                fill: new Fill({ color: '#183a2a' }),
                stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 }),
                backgroundFill: new Fill({ color: 'rgba(255,255,255,0.82)' }),
                padding: [2, 6, 2, 6],
                offsetY: -14,
                textAlign: 'center'
            })
            : undefined
    });
}

// [隶属] 图层管理-样式系统
// [作用] 合并旧配置与新配置并输出标准化结果。
// [交互] 被 setDrawStyle 与图层样式编辑动作调用。
function mergeStyleConfig(prevCfg, newCfg) {
    return normalizeStyleConfig({ ...(prevCfg || {}), ...(newCfg || {}) });
}

// [隶属] 图层管理-样式系统
// [作用] 根据图层状态决定标签文本是否显示。
// [交互] 被 applyManagedLayerStyle 调用。
function getLayerLabelText(layerItem) {
    if (!layerItem?.autoLabel) return '';
    if (!layerItem?.labelVisible) return '';
    return String(layerItem.name || '').trim();
}

function getFeatureLabelText(feature, layerItem) {
    if (!layerItem?.autoLabel || !layerItem?.labelVisible) return '';

    const props = typeof feature?.getProperties === 'function' ? feature.getProperties() : null;
    if (!props) return getLayerLabelText(layerItem);

    const preferredField = String(layerItem?.metadata?.labelField || '').trim();
    if (preferredField) {
        const preferredValue = props[preferredField];
        if (preferredValue !== null && preferredValue !== undefined && String(preferredValue).trim()) {
            return String(preferredValue).trim();
        }
    }

    const candidateKeys = ['name', 'Name', 'NAME', '名称', 'title', 'Title', 'TITLE', 'label', 'Label'];
    for (const key of candidateKeys) {
        const value = props[key];
        if (value !== null && value !== undefined && String(value).trim()) {
            return String(value).trim();
        }
    }

    const firstUsableEntry = Object.entries(props).find(([key, value]) => (
        key !== 'geometry'
        && key !== 'style'
        && !String(key).startsWith('_')
        && value !== null
        && value !== undefined
        && String(value).trim()
    ));
    if (firstUsableEntry) {
        return String(firstUsableEntry[1]).trim();
    }

    return getLayerLabelText(layerItem);
}

function buildManagedLayerStyle(layerItem) {
    const baseStyleConfig = layerItem?.styleConfig || STYLE_TEMPLATES.classic;
    if (!layerItem?.autoLabel || !layerItem?.labelVisible) {
        return createStyleFromConfig(baseStyleConfig, {
            labelText: ''
        });
    }

    layerItem.labelStyleCache = layerItem.labelStyleCache || new globalThis.Map();
    return (feature) => {
        const rawLabel = getFeatureLabelText(feature, layerItem);
        const labelText = String(rawLabel || '').trim();
        const cacheKey = labelText || '__empty__';
        if (layerItem.labelStyleCache.has(cacheKey)) {
            return layerItem.labelStyleCache.get(cacheKey);
        }
        const style = createStyleFromConfig(baseStyleConfig, { labelText });
        layerItem.labelStyleCache.set(cacheKey, style);
        return style;
    };
}

// [隶属] 图层管理-样式系统
// [作用] 将当前样式配置应用到目标托管图层。
// [交互] 被 setDrawStyle / setUserLayerStyle / setUserLayerLabelVisibility 间接调用。
function applyManagedLayerStyle(layerItem) {
    if (!layerItem || typeof layerItem.layer?.setStyle !== 'function') return;
    layerItem.labelStyleCache = new globalThis.Map();
    layerItem.layer.setStyle(buildManagedLayerStyle(layerItem));
}

// --- 样式定义 ---
const styles = {
    draw: new Style({
        fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
        stroke: new Stroke({ color: '#ffcc33', width: 2 }),
        image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#ffcc33' }) }),
    }),
    userPoint: new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#1E90FF' }), stroke: new Stroke({ color: '#fff', width: 2 }) })
    }),
    userAccuracy: new Style({
        fill: new Fill({ color: 'rgba(30,144,255,0.12)' }),
        stroke: new Stroke({ color: 'rgba(30,144,255,0.3)', width: 1 })
    }),
    busStart: new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#22c55e' }), stroke: new Stroke({ color: '#fff', width: 2 }) })
    }),
    busEnd: new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#ef4444' }), stroke: new Stroke({ color: '#fff', width: 2 }) })
    }),
    busRouteTransit: new Style({
        stroke: new Stroke({ color: '#2563eb', width: 4, lineCap: 'round', lineJoin: 'round' })
    }),
    busRouteWalk: new Style({
        stroke: new Stroke({ color: '#6b7280', width: 3, lineDash: [8, 6], lineCap: 'round', lineJoin: 'round' })
    }),
    driveRoute: new Style({
        stroke: new Stroke({ color: 'rgba(34, 197, 94, 0.8)', width: 6, lineCap: 'round', lineJoin: 'round' })
    })
};

const BUS_STEP_COLOR_PALETTE = [
    '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'
];
const DRIVE_STEP_COLOR_PALETTE = [
    '#10B981', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'
];

// [隶属] 线路渲染-样式系统
// [作用] 十六进制颜色转 rgba 字符串。
// [交互] 被公交/驾车步骤样式函数复用。
function hexToRgba(hexColor, alpha = 1) {
    const hex = String(hexColor || '').replace('#', '').trim();
    if (hex.length !== 6) return `rgba(59, 130, 246, ${alpha})`;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// [隶属] 线路渲染-公交样式
// [作用] 获取公交步骤主色。
// [交互] 被 getBusStepStyle / getBusStepPointStyle 调用。
function getBusStepColor(stepIndex) {
    const idx = Math.abs(Number(stepIndex || 0)) % BUS_STEP_COLOR_PALETTE.length;
    return BUS_STEP_COLOR_PALETTE[idx];
}

// [隶属] 线路渲染-驾车样式
// [作用] 获取驾车步骤主色。
// [交互] 被 getDriveStepStyle 调用。
function getDriveStepColor(stepIndex) {
    const idx = Math.abs(Number(stepIndex || 0)) % DRIVE_STEP_COLOR_PALETTE.length;
    return DRIVE_STEP_COLOR_PALETTE[idx];
}

// [隶属] 线路渲染-公交样式
// [作用] 生成公交线段样式并做缓存。
// [交互] 被公交路线图层 style 回调调用。
function getBusStepStyle(stepIndex, isWalk = false, isActive = false) {
    const normalizedStep = Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0;
    const key = `${normalizedStep}_${isWalk ? 'walk' : 'transit'}_${isActive ? 'active' : 'normal'}`;
    if (busStepStyleCache.has(key)) return busStepStyleCache.get(key);

    const baseColor = getBusStepColor(normalizedStep);
    const color = isWalk
        ? hexToRgba(baseColor, isActive ? 0.9 : 0.6)
        : hexToRgba(baseColor, isActive ? 1 : 0.88);

    const style = new Style({
        stroke: new Stroke({
            color,
            width: isActive ? (isWalk ? 6 : 7) : (isWalk ? 4 : 5),
            lineDash: isWalk ? [8, 6] : undefined,
            lineCap: 'round',
            lineJoin: 'round'
        })
    });
    busStepStyleCache.set(key, style);
    return style;
}

// [隶属] 线路渲染-公交样式
// [作用] 生成公交站点样式（含站名文本）。
// [交互] 被公交路线图层 style 回调调用。
function getBusStepPointStyle(stepIndex, markerRole = 'segment-start', isActive = false, stationName = '') {
    const normalizedStep = Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0;
    const role = markerRole === 'segment-end' ? 'segment-end' : 'segment-start';

    const baseColor = getBusStepColor(normalizedStep);
    const fillColor = role === 'segment-end'
        ? hexToRgba(baseColor, isActive ? 1 : 0.88)
        : hexToRgba(baseColor, isActive ? 0.9 : 0.72);

    const labelText = String(stationName || '').trim();

    const style = new Style({
        image: new CircleStyle({
            radius: isActive ? 7 : 5,
            fill: new Fill({ color: fillColor }),
            stroke: new Stroke({ color: '#ffffff', width: 2 })
        }),
        text: labelText
            ? new Text({
                text: labelText,
                offsetY: role === 'segment-end' ? -14 : 14,
                font: isActive ? '600 12px "Microsoft YaHei", sans-serif' : '500 11px "Microsoft YaHei", sans-serif',
                fill: new Fill({ color: '#111827' }),
                stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 })
            })
            : undefined
    });
    return style;
}

// [隶属] 线路渲染-驾车样式
// [作用] 生成驾车总览线或步骤线样式并缓存。
// [交互] 被驾车路线图层 style 回调调用。
function getDriveStepStyle(stepIndex = 0, isActive = false, isStepSegment = false) {
    if (!isStepSegment) {
        const key = 'drive_overview';
        if (busStepStyleCache.has(key)) return busStepStyleCache.get(key);
        const style = new Style({
            stroke: new Stroke({
                color: 'rgba(5, 150, 105, 0.35)',
                width: 4,
                lineCap: 'round',
                lineJoin: 'round'
            })
        });
        busStepStyleCache.set(key, style);
        return style;
    }

    const normalizedStep = Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0;
    const key = `drive_step_${normalizedStep}_${isActive ? 'active' : 'normal'}`;
    if (busStepStyleCache.has(key)) return busStepStyleCache.get(key);

    const color = hexToRgba(getDriveStepColor(normalizedStep), isActive ? 0.98 : 0.9);

    const style = new Style({
        stroke: new Stroke({
            color,
            width: isActive ? 8 : 6,
            lineCap: 'round',
            lineJoin: 'round'
        })
    });
    busStepStyleCache.set(key, style);
    return style;
}

// [隶属] 线路交互-步骤状态
// [作用] 获取当前公交高亮步骤（悬停优先）。
// [交互] 被公交图层样式判定调用。
function getCurrentBusStepIndex() {
    return busHoverStepIndex >= 0 ? busHoverStepIndex : busActiveStepIndex;
}

// [隶属] 线路交互-步骤状态
// [作用] 获取当前驾车高亮步骤（悬停优先）。
// [交互] 被驾车图层样式判定调用。
function getCurrentDriveStepIndex() {
    return driveHoverStepIndex >= 0 ? driveHoverStepIndex : driveActiveStepIndex;
}

function getFirstQueryValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function parseQueryNumber(value) {
    const raw = Number(getFirstQueryValue(value));
    return Number.isFinite(raw) ? raw : null;
}

function readRouteViewState() {
    const lng = parseQueryNumber(route.query.lng);
    const lat = parseQueryNumber(route.query.lat);
    if (lng === null || lat === null) return null;

    const zoom = parseQueryNumber(route.query.z);
    return {
        center: [lng, lat],
        zoom: zoom === null ? INITIAL_VIEW.zoom : zoom
    };
}

function getLayerIdByIndex(index) {
    const normalizedIndex = Number(index);
    if (!Number.isInteger(normalizedIndex)) return null;
    if (normalizedIndex < 0 || normalizedIndex >= URL_LAYER_OPTIONS.length) return null;
    return URL_LAYER_OPTIONS[normalizedIndex] || null;
}

function getLayerIndexById(layerId) {
    const idx = URL_LAYER_OPTIONS.indexOf(String(layerId || ''));
    return idx >= 0 ? idx : null;
}

function readRouteLayerIndex() {
    const raw = parseQueryNumber(route.query.l ?? route.query.layer);
    if (raw === null || !Number.isInteger(raw)) return null;
    if (raw < 0 || raw >= URL_LAYER_OPTIONS.length) return null;
    return raw;
}

function readRouteLayerId() {
    const layerIndex = readRouteLayerIndex();
    if (layerIndex === null) return null;
    return getLayerIdByIndex(layerIndex);
}

function getInitialViewState() {
    return readRouteViewState() || INITIAL_VIEW;
}

function formatViewQueryValue(value, fractionDigits) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return null;
    return numberValue.toFixed(fractionDigits);
}

function buildMapQueryFromView() {
    const map = mapInstance.value;
    if (!map) return null;

    const view = map.getView?.();
    const center = view?.getCenter?.();
    if (!Array.isArray(center) || center.length < 2) return null;

    const lonLat = toLonLat(center);
    const zoom = view?.getZoom?.();
    const activeLayerIndex = getLayerIndexById(selectedLayer.value);
    if (activeLayerIndex === null) return null;

    return {
        lng: formatViewQueryValue(lonLat[0], 6),
        lat: formatViewQueryValue(lonLat[1], 6),
        z: formatViewQueryValue(zoom, 2),
        l: String(activeLayerIndex)
    };
}

function isSameMapQuery(nextQuery) {
    const currentLng = String(getFirstQueryValue(route.query.lng) ?? '');
    const currentLat = String(getFirstQueryValue(route.query.lat) ?? '');
    const currentZoom = String(getFirstQueryValue(route.query.z) ?? '');
    const currentLayer = String(getFirstQueryValue(route.query.l) ?? '');
    return currentLng === nextQuery.lng
        && currentLat === nextQuery.lat
        && currentZoom === nextQuery.z
        && currentLayer === nextQuery.l;
}

function replaceRouteQueryFromMapState() {
    const nextQuery = buildMapQueryFromView();
    if (!nextQuery || !nextQuery.lng || !nextQuery.lat || !nextQuery.z || !nextQuery.l) return;
    if (isSameMapQuery(nextQuery)) return;

    void router.replace({
        path: route.path,
        query: nextQuery
    }).catch(() => {});
}

const syncMapQueryFromView = debounce(() => {
    if (componentUnmounted) return;
    replaceRouteQueryFromMapState();
}, 500);

function applyRouteLayerStateToUI() {
    const routeLayerId = readRouteLayerId();
    if (!routeLayerId) return;
    if (selectedLayer.value === routeLayerId) return;
    selectedLayer.value = routeLayerId;
}

function applyRouteViewStateToMap() {
    const map = mapInstance.value;
    if (!map) return;

    const routeViewState = readRouteViewState();
    if (!routeViewState) return;

    const view = map.getView?.();
    if (!view) return;

    const targetCenter = fromLonLat(routeViewState.center);
    const targetZoom = routeViewState.zoom;

    const currentCenter = view.getCenter?.();
    const currentZoom = view.getZoom?.();

    const isSameCenter = Array.isArray(currentCenter)
        && currentCenter.length >= 2
        && Math.abs(currentCenter[0] - targetCenter[0]) < 1e-6
        && Math.abs(currentCenter[1] - targetCenter[1]) < 1e-6;

    const isSameZoom = Number(currentZoom ?? 0) === Number(targetZoom ?? 0);

    if (isSameCenter && isSameZoom) return;

    if (typeof view.animate === 'function') {
        view.animate({ center: targetCenter, zoom: targetZoom, duration: 600 });
    } else {
        view.setCenter?.(targetCenter);
        view.setZoom?.(targetZoom);
    }
}

watch(
    () => [
        getFirstQueryValue(route.query.lng),
        getFirstQueryValue(route.query.lat),
        getFirstQueryValue(route.query.z),
        getFirstQueryValue(route.query.l),
        getFirstQueryValue(route.query.layer)
    ],
    () => {
        if (componentUnmounted) return;
        applyRouteLayerStateToUI();
        applyRouteViewStateToMap();
    }
);

// --- 初始化 ---
onMounted(async () => {
    componentUnmounted = false;
    applyRouteLayerStateToUI();
    initMap();

    // 首屏优先：先让关键瓦片尽快加载，非关键任务延后到首次渲染后再执行。
    await waitForCriticalTileReady();
    scheduleLowPriorityTask(() => {
        runDeferredStartupTasks().catch(() => {});
    });

});

function scheduleLowPriorityTask(task) {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => {
            if (!componentUnmounted) task();
        }, { timeout: 1500 });
        return;
    }
    setTimeout(() => {
        if (!componentUnmounted) task();
    }, 0);
}

// [隶属] 启动流程-首屏优先
// [作用] 等待关键瓦片完成首次渲染，避免阻塞后续非关键任务。
// [交互] 被 onMounted 启动流程调用。
function waitForCriticalTileReady(timeoutMs = CRITICAL_TILE_READY_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const map = mapInstance.value;
        if (!map) {
            resolve();
            return;
        }
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            if (renderCompleteKey) unByKey(renderCompleteKey);
            clearTimeout(timer);
            resolve();
        };

        const renderCompleteKey = map.on('rendercomplete', finish);
        const timer = setTimeout(finish, timeoutMs);
    });
}

// [隶属] 启动流程-首屏优化
// [作用] 在首屏完成后执行非关键任务（主机测速、定位兜底）。
// [交互] 调用 resolvePreferredGoogleHost / getCurrentLocation / detectIPLocale。
async function runDeferredStartupTasks() {
    if (componentUnmounted) return;

    const routeViewState = readRouteViewState();
    if (routeViewState) {
        message.success('欢迎来到NEGIAO分享的地点'+routeViewState.center.map(c => c.toFixed(6)).join(',')+'，正在加载地图...');
        return;
    }

    // 1) Google 主机测速切换（非关键，延后执行）。
    resolvePreferredGoogleHost().then((host) => {
        if (componentUnmounted) return;
        if (!host || host === activeGoogleTileHost.value) return;
        activeGoogleTileHost.value = host;
        refreshGoogleLayerSources();
    }).catch(() => {});

    // 2) 位置相关逻辑（非关键，延后执行）。
    // 优先使用浏览器真实定位；IP 仅用于国内外判定兜底，不再用于地图中心定位。
    if (navigator.geolocation) {
        try {
            const pos = await getCurrentLocation(true);
            if (componentUnmounted) return;
            updateUserPosition(pos, true);

            // 有真实坐标时，可直接基于坐标更新国内外判定，避免依赖第三方 IP 误差。
            isDomestic.value = isCoordinateInChina(pos.lon, pos.lat);
            return;
        } catch (e) {
            // 定位失败后再使用 IP 做兜底判定。
        }
    }

    await detectIPLocale();
}

onUnmounted(() => {
    componentUnmounted = true;
    syncMapQueryFromView.cancel();
    if (pendingBusPick?.reject) {
        pendingBusPick.reject(new Error('地图已卸载'));
        pendingBusPick = null;
    }
    if (dynamicSplitMoveKey) {
        unByKey(dynamicSplitMoveKey);
        dynamicSplitMoveKey = null;
    }
    if (mapMoveEndKey) {
        unByKey(mapMoveEndKey);
        mapMoveEndKey = null;
    }
    if (mapInstance.value) mapInstance.value.setTarget(null);
});

// [隶属] 图层切换-底图分类
// [作用] 判断图层属于底图还是覆盖层。
// [交互] 被 emitBaseLayersChange 与图层动作过滤逻辑调用。
function getLayerCategory(layerId) {
    if (['google', 'google_standard', 'google_clean', 'tianDiTu', 'tianDiTu_vec', 'esri', 'osm', 'amap', 'tengxun', 'esri_ocean', 'esri_terrain', 'esri_physical', 'esri_hillshade', 'esri_gray', 'yandex_sat', 'geoq_gray', 'geoq_hydro', 'local', 'custom'].includes(layerId)) {
        return 'base';
    }
    return 'overlay';
}

// [隶属] 图层切换-底图分组
// [作用] 为底图面板提供分组标签（影像/矢量/专题/注记）。
// [交互] 被 emitBaseLayersChange 调用。
function getLayerGroup(layerId) {
    if (['google', 'tianDiTu', 'esri', 'yandex_sat'].includes(layerId)) return '影像';
    if (['google_standard', 'google_clean', 'tianDiTu_vec', 'osm', 'amap', 'tengxun', 'geoq_gray', 'geoq_hydro'].includes(layerId)) return '矢量';
    if (['esri_ocean', 'esri_terrain', 'esri_physical', 'esri_hillshade', 'esri_gray', 'local', 'custom'].includes(layerId)) return '专题';
    return '注记';
}

// [隶属] 图层切换-对外状态同步
// [作用] 广播底图列表状态，供外部组件展示或联动。
// [交互] emit: base-layers-change。
function emitBaseLayersChange() {
    emit('base-layers-change', layerList.value.map(item => ({
        id: item.id,
        name: item.name,
        visible: item.visible,
        category: getLayerCategory(item.id),
        group: getLayerGroup(item.id),
        active: selectedLayer.value === item.id
    })));
}

// [隶属] 图层切换-底图源刷新
// [作用] 当 Google 主机切换后重建相关图层 source。
// [交互] 被 runDeferredStartupTasks 调用。
function refreshGoogleLayerSources() {
    const googleLayerIds = ['google', 'google_standard', 'google_clean'];
    googleLayerIds.forEach((id) => {
        const cfg = LAYER_CONFIGS.find(item => item.id === id);
        const layer = layerInstances[id];
        if (!cfg || !layer) return;
        layer.setSource(cfg.createSource());
    });
}

function ensureFeatureId(feature, layerName, index) {
    const existingId = feature?.getId?.() || feature?.get?.('_gid') || feature?.get?.('id');
    const featureId = String(existingId || `${layerName || 'layer'}_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    if (typeof feature?.setId === 'function') {
        feature.setId(featureId);
    }
    if (typeof feature?.set === 'function') {
        feature.set('_gid', featureId);
    }
    return featureId;
}

function serializeManagedFeature(feature, layerName, index) {
    const featureId = ensureFeatureId(feature, layerName, index);
    const geometry = feature?.getGeometry?.();
    const properties = { ...(feature?.getProperties?.() || {}) };
    delete properties.geometry;
    delete properties.style;

    const serializedGeometry = geometry
        ? {
            type: geometry.getType?.() || 'Geometry',
            coordinates: geometry.getCoordinates?.()
        }
        : null;

    properties._gid = featureId;

    return {
        type: 'Feature',
        id: featureId,
        _gid: featureId,
        properties,
        geometry: serializedGeometry
    };
}

function serializeManagedFeatures(features = [], layerName = '') {
    return (features || []).map((feature, index) => serializeManagedFeature(feature, layerName, index));
}

function findManagedFeature(layerId, featureId) {
    const target = userDataLayers.find(item => item.id === layerId);
    if (!target) return null;
    const source = target.layer?.getSource?.();
    const normalizedId = String(featureId || '');
    const sourceFeature = source?.getFeatureById?.(normalizedId)
        || source?.getFeatures?.()?.find((feature) => String(feature?.getId?.() || feature?.get?.('_gid') || '') === normalizedId);
    return sourceFeature || null;
}

function createManagedFeatureHighlightStyle(feature) {
    const geometryType = feature?.getGeometry?.()?.getType?.() || '';
    const isPointLike = /Point$/i.test(geometryType);

    if (isPointLike) {
        return new Style({
            image: new CircleStyle({
                radius: 8,
                fill: new Fill({ color: 'rgba(52, 211, 153, 0.95)' }),
                stroke: new Stroke({ color: '#ffffff', width: 2 })
            })
        });
    }

    return new Style({
        fill: new Fill({ color: 'rgba(48, 157, 88, 0.18)' }),
        stroke: new Stroke({ color: '#1f8a4c', width: 4 })
    });
}

function clearManagedFeatureHighlight(feature) {
    if (!feature) return;
    if (typeof feature.setStyle === 'function') {
        feature.setStyle(undefined);
    }
}

// [隶属] 图层管理-托管图层创建
// [作用] 将矢量要素创建为托管图层并登记到 userDataLayers。
// [交互] 调用 emitUserLayersChange / emitGraphicsOverview，与外部面板同步。
function createManagedVectorLayer({
    name,
    type,
    sourceType,
    features,
    styleConfig,
    autoLabel = false,
    metadata = null,
    fitView = false
}) {
    if (!mapInstance.value || !features?.length) return null;

    const normalizedStyle = normalizeStyleConfig(styleConfig || STYLE_TEMPLATES.classic);
    const labelVisible = !!autoLabel;
    const managedLayerState = {
        name,
        autoLabel: !!autoLabel,
        labelVisible,
        metadata: metadata || null,
        styleConfig: normalizedStyle,
        labelStyleCache: new globalThis.Map()
    };
    const layer = new VectorLayer({
        source: new VectorSource({ features }),
        zIndex: 120,
        style: buildManagedLayerStyle(managedLayerState),
        properties: { name }
    });

    const serializedFeatures = serializeManagedFeatures(features, name);
    features.forEach((feature, index) => ensureFeatureId(feature, name, index));

    mapInstance.value.addLayer(layer);

    const id = createManagedLayerId();
    userDataLayers.push({
        id,
        name,
        type,
        sourceType,
        order: userDataLayers.length,
        visible: true,
        opacity: 1,
        featureCount: features.length,
        features: serializedFeatures,
        autoLabel: managedLayerState.autoLabel,
        labelVisible,
        metadata: managedLayerState.metadata,
        styleConfig: normalizedStyle,
        labelStyleCache: managedLayerState.labelStyleCache,
        layer
    });

    refreshUserLayerZIndex();
    emitUserLayersChange();
    emitGraphicsOverview();

    if (fitView) {
        mapInstance.value.getView().fit(layer.getSource().getExtent(), {
            padding: [50, 50, 50, 50],
            duration: 1000
        });
    }

    return id;
}

function zoomToManagedFeature({ layerId, featureId }) {
    if (!mapInstance.value) return;
    const feature = findManagedFeature(layerId, featureId);
    if (!feature) return;
    const geometry = feature.getGeometry?.();
    const extent = geometry?.getExtent?.();
    if (!extent || extent.some(v => !Number.isFinite(v))) return;
    mapInstance.value.getView().fit(extent, {
        padding: [80, 80, 80, 80],
        duration: 800,
        maxZoom: 18
    });
    clearManagedFeatureHighlight(currentManagedFeatureHighlight);
    currentManagedFeatureHighlight = feature;
    feature.setStyle(createManagedFeatureHighlightStyle(feature));
}

function highlightManagedFeature({ layerId, featureId }) {
    const feature = findManagedFeature(layerId, featureId);
    if (!feature) return;
    clearManagedFeatureHighlight(currentManagedFeatureHighlight);
    currentManagedFeatureHighlight = feature;
    feature.setStyle(createManagedFeatureHighlightStyle(feature));
}

// [隶属] 图片覆盖-经纬线标注
// [作用] 格式化经度文本。
// [交互] 被 updateDynamicSplitLines 调用。
function formatLongitude(lon) {
    const abs = Math.abs(lon).toFixed(4);
    return `${abs}°${lon >= 0 ? 'E' : 'W'}`;
}

// [隶属] 图片覆盖-经纬线标注
// [作用] 格式化纬度文本。
// [交互] 被 updateDynamicSplitLines 调用。
function formatLatitude(lat) {
    const abs = Math.abs(lat).toFixed(4);
    return `${abs}°${lat >= 0 ? 'N' : 'S'}`;
}

// [隶属] 图片覆盖-经纬线样式
// [作用] 生成经纬分割线及标注文本样式。
// [交互] 被 updateDynamicSplitLines 调用。
function createDynamicSplitStyle(textLabel = '', textOptions = {}) {
    return new Style({
        stroke: new Stroke({ color: 'rgba(255,255,255,0.92)', width: 2 }),
        text: textLabel
            ? new Text({
                text: textLabel,
                font: 'bold 12px Consolas, Monaco, monospace',
                fill: new Fill({ color: '#124e28' }),
                backgroundFill: new Fill({ color: 'rgba(255,255,255,0.9)' }),
                padding: [2, 4, 2, 4],
                offsetX: textOptions.offsetX ?? 0,
                offsetY: textOptions.offsetY ?? -10,
                textAlign: textOptions.textAlign ?? 'center'
            })
            : undefined
    });
}

// [隶属] 图片覆盖-经纬线图层
// [作用] 确保动态经纬分割线图层存在。
// [交互] 被 updateDynamicSplitLines 调用。
function ensureDynamicSplitLayer() {
    if (!mapInstance.value) return null;
    if (dynamicSplitLinesLayer) return dynamicSplitLinesLayer;

    dynamicSplitLinesLayer = new VectorLayer({
        source: new VectorSource(),
        zIndex: 1080
    });
    mapInstance.value.addLayer(dynamicSplitLinesLayer);
    return dynamicSplitLinesLayer;
}

// [隶属] 图片覆盖-经纬线图层
// [作用] 按当前视图更新经纬分割线与标签。
// [交互] 响应 moveend 或按钮触发。
function updateDynamicSplitLines() {
    if (!mapInstance.value) return;
    const layer = ensureDynamicSplitLayer();
    const source = layer?.getSource?.();
    if (!source) return;

    source.clear();
    if (!showDynamicSplitLines.value) {
        layer.setVisible(false);
        return;
    }

    layer.setVisible(true);
    const view = mapInstance.value.getView();
    const size = mapInstance.value.getSize();
    if (!size) return;

    const extent = view.calculateExtent(size);
    const sw = toLonLat([extent[0], extent[1]]);
    const ne = toLonLat([extent[2], extent[3]]);

    const lonStep = (ne[0] - sw[0]) / 3;
    const latStep = (ne[1] - sw[1]) / 3;
    const lonList = [sw[0] + lonStep, sw[0] + lonStep * 2];
    const latList = [sw[1] + latStep, sw[1] + latStep * 2];
    const centerLon = (sw[0] + ne[0]) / 2;
    const centerLat = (sw[1] + ne[1]) / 2;

    const features = [];

    lonList.forEach((lon) => {
        const start = fromLonLat([lon, sw[1]]);
        const end = fromLonLat([lon, ne[1]]);
        const line = new Feature({ geometry: new LineString([start, end]) });
        line.setStyle(createDynamicSplitStyle());
        features.push(line);

        const topLabel = new Feature({ geometry: new Point(end) });
        topLabel.setStyle(createDynamicSplitStyle(formatLongitude(lon), { offsetY: 12 }));
        const bottomLabel = new Feature({ geometry: new Point(start) });
        bottomLabel.setStyle(createDynamicSplitStyle(formatLongitude(lon), { offsetY: -12 }));
        features.push(topLabel, bottomLabel);
    });

    latList.forEach((lat) => {
        const start = fromLonLat([sw[0], lat]);
        const end = fromLonLat([ne[0], lat]);
        const line = new Feature({ geometry: new LineString([start, end]) });
        line.setStyle(createDynamicSplitStyle());
        features.push(line);

        const leftLabel = new Feature({ geometry: new Point(start) });
        leftLabel.setStyle(createDynamicSplitStyle(formatLatitude(lat), { offsetX: 42, textAlign: 'left' }));
        const rightLabel = new Feature({ geometry: new Point(end) });
        rightLabel.setStyle(createDynamicSplitStyle(formatLatitude(lat), { offsetX: -42, textAlign: 'right' }));
        features.push(leftLabel, rightLabel);
    });

    // 中心标记：使用“+”符号，避免过长中心线干扰视图。
    const centerCoord = fromLonLat([centerLon, centerLat]);
    const centerPlus = new Feature({ geometry: new Point(centerCoord) });
    centerPlus.setStyle(new Style({
        text: new Text({
            text: '+',
            font: '700 26px "Segoe UI", "Arial", sans-serif',
            fill: new Fill({ color: 'rgba(255, 235, 130, 0.98)' }),
            stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.78)', width: 3 }),
            textAlign: 'center',
            textBaseline: 'middle'
        })
    }));

    features.push(centerPlus);

    source.addFeatures(features);
}

// [隶属] 图片覆盖-经纬线控制
// [作用] 开关经纬分割线，并挂载一次地图移动监听。
// [交互] 由 UI 按钮触发。
function toggleDynamicSplitLines() {
    showDynamicSplitLines.value = !showDynamicSplitLines.value;
    if (!mapInstance.value) return;

    if (!dynamicSplitMoveKey) {
        dynamicSplitMoveKey = mapInstance.value.on('moveend', () => {
            if (showDynamicSplitLines.value) {
                updateDynamicSplitLines();
            }
        });
    }

    updateDynamicSplitLines();
}

// [隶属] 外部数据导入-动作集接入
// [作用] 从 useLayerDataImport 注入上传入口与解析动作。
// [交互] addUserDataLayer 由 defineExpose 对外提供给父组件调用。
let layerDataImportApiPromise = null;
let userLayerActionsApiPromise = null;
let routeBuilderApiPromise = null;

async function ensureLayerDataImportApi() {
    if (!layerDataImportApiPromise) {
        layerDataImportApiPromise = import('../composables/useLayerDataImport').then(({ useLayerDataImport }) => (
            useLayerDataImport({
                mapInstance,
                initialView: INITIAL_VIEW,
                userDataLayers,
                addManagedLayerRecord,
                createManagedVectorLayer,
                styleTemplates: STYLE_TEMPLATES,
                onImportProgress: (payload) => emit('upload-progress-change', payload)
            })
        ));
    }
    return layerDataImportApiPromise;
}

async function ensureUserLayerActionsApi() {
    if (!userLayerActionsApiPromise) {
        userLayerActionsApiPromise = Promise.all([
            import('../composables/useUserLayerActions'),
            ensureLayerDataImportApi()
        ]).then(([actionsMod, dataImportApi]) => actionsMod.useUserLayerActions({
            mapInstance,
            userDataLayers,
            refreshUserLayerZIndex,
            emitUserLayersChange,
            emitGraphicsOverview,
            mergeStyleConfig,
            applyManagedLayerStyle,
            styleTemplates: STYLE_TEMPLATES,
            setDrawStyle,
            layerList,
            selectedLayer,
            getLayerCategory,
            refreshLayersState,
            projectExtentToMapView: dataImportApi.projectExtentToMapView,
            emitFeatureSelected: (payload) => emit('feature-selected', payload),
            isRouteManagedLayer: ({ layerId, removed }) => (
                layerId === busRouteManagedLayerId
                || removed?.metadata?.category === 'bus-route'
                || removed?.metadata?.category === 'drive-route'
                || removed?.metadata?.category === 'route'
            ),
            onRouteManagedLayerRemoved: () => {
                busRouteManagedLayerId = null;
                resetRouteStepStates();
                busRouteSource.clear();
            }
        }));
    }
    return userLayerActionsApiPromise;
}

async function ensureRouteBuilderApi() {
    if (!routeBuilderApiPromise) {
        routeBuilderApiPromise = import('../utils/transitRouteBuilder');
    }
    return routeBuilderApiPromise;
}

async function addUserDataLayer(payload) {
    const api = await ensureLayerDataImportApi();
    return api.addUserDataLayer(payload);
}

async function queryRasterValueAtCoordinate(coordinate) {
    const api = await ensureLayerDataImportApi();
    return api.queryRasterValueAtCoordinate(coordinate);
}

async function setUserLayerVisibility(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setUserLayerVisibility(...args);
}

async function setUserLayerOpacity(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setUserLayerOpacity(...args);
}

async function removeUserLayer(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.removeUserLayer(...args);
}

async function reorderUserLayers(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.reorderUserLayers(...args);
}

async function soloUserLayer(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.soloUserLayer(...args);
}

async function setUserLayerStyle(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setUserLayerStyle(...args);
}

async function setUserLayerLabelVisibility(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setUserLayerLabelVisibility(...args);
}

async function applyStyleTemplate(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.applyStyleTemplate(...args);
}

async function setBaseLayerActive(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setBaseLayerActive(...args);
}

async function setLayerVisibility(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setLayerVisibility(...args);
}

async function zoomToUserLayer(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.zoomToUserLayer(...args);
}

async function viewUserLayer(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.viewUserLayer(...args);
}

// --- 1. 地图核心逻辑 ---
// [隶属] 图层切换-地图初始化
// [作用] 初始化地图实例、底图层、业务图层与控件。
// [交互] 触发 bindEvents，并在 watch(selectedLayer) 中联动底图切换。
function initMap() {
    // 1.1 源定义与图层初始化 (由 LAYER_CONFIGS 动态驱动，不再硬编码 sources 对象)
    
    // 初始化所有底图层
    layerList.value.forEach((item, index) => {
        // 根据 id 查找配置并创建 source
        const config = LAYER_CONFIGS.find(cfg => cfg.id === item.id);
        // 首屏优先：仅为当前可见图层创建 source，其他图层按需懒创建。
        const source = (config && item.visible) ? config.createSource() : null;

        const layer = new TileLayer({
            source: source,
            visible: item.visible,
            zIndex: index // 初始层级通过列表顺序决定（0最底层）
        });
        layerInstances[item.id] = layer;
    });

    const layersToAdd = layerList.value.map(item => layerInstances[item.id]);

    drawLayerInstance = new VectorLayer({
        source: drawSource,
        style: createStyleFromConfig(drawStyleConfig.value),
        zIndex: 999
    });
    const userLayer = new VectorLayer({
        source: userLocationSource,
        zIndex: 1000,
        style: (feature) => feature.get('type') === 'accuracy' ? styles.userAccuracy : styles.userPoint
    });
    const busPickLayer = new VectorLayer({
        source: busPickSource,
        zIndex: 1085,
        style: (feature) => feature.get('busPickType') === 'end' ? styles.busEnd : styles.busStart
    });
    const busRouteLayer = new VectorLayer({
        source: busRouteSource,
        zIndex: 1080,
        style: (feature) => {
            if (feature.get('routeMode') === 'drive') {
                const stepIndex = Number(feature.get('stepIndex'));
                const isStepSegment = Number.isFinite(stepIndex) && stepIndex >= 0;
                const activeDriveStep = getCurrentDriveStepIndex();
                const isActive = activeDriveStep >= 0 && stepIndex === activeDriveStep;
                return getDriveStepStyle(stepIndex, isActive, isStepSegment);
            }
            if (feature.getGeometry()?.getType?.() === 'Point') {
                const stepIndex = Number(feature.get('stepIndex') ?? 0);
                const stepIndices = feature.get('stepIndices');
                const markerRole = String(feature.get('markerRole') || 'segment-start');
                const stationName = String(feature.get('stationName') || '');
                const activeBusStep = getCurrentBusStepIndex();
                const isActive = activeBusStep >= 0 && (
                    Array.isArray(stepIndices)
                        ? stepIndices.map((v) => Number(v)).includes(activeBusStep)
                        : activeBusStep === stepIndex
                );
                return getBusStepPointStyle(stepIndex, markerRole, isActive, stationName);
            }
            const segmentType = Number(feature.get('segmentType') ?? 0);
            const stepIndex = Number(feature.get('stepIndex') ?? 0);
            const activeBusStep = getCurrentBusStepIndex();
            const isActive = activeBusStep >= 0 && activeBusStep === stepIndex;
            return getBusStepStyle(stepIndex, segmentType === 1, isActive);
        }
    });
    busRouteLayerRef = busRouteLayer;

    // 搜索结果图层（点）
    searchSource = new VectorSource();
    searchLayer = new VectorLayer({
        source: searchSource,
        zIndex: 1100,
        style: createStyleFromConfig(SEARCH_RESULT_STYLE)
    });

    // 1.3 控件
    // 从 LAYER_CONFIGS 中获取 Google 配置，使鹰眼视图与坐标系保持一致
    const googleConfig = LAYER_CONFIGS.find(cfg => cfg.id === 'google');
    const controls = defaultControls({ zoom: false }).extend([
        new ScaleLine({ units: 'metric', bar: true, minWidth: 100 }),
        new MousePosition({
            coordinateFormat: createStringXY(4),
            projection: 'EPSG:4326',
            target: mousePositionRef.value,
            undefinedHTML: '&nbsp;'
        }),
        // 鹰眼视图控件 - 使用 googleConfig 动态引用，保持 URL 一致
        new OverviewMap({
            className: 'ol-overviewmap ol-custom-overviewmap',
            layers: [
                new TileLayer({
                    source: googleConfig ? googleConfig.createSource() : new XYZ({
                        url: buildGoogleTileUrl('/maps/vt?lyrs=s&x={x}&y={y}&z={z}'),
                        maxZoom: 20
                    })
                })
            ],
            collapseLabel: '«',
            label: '»',
            collapsed: false
        })
    ]);

    // 1.4 实例化地图
    const initialViewState = getInitialViewState();
    mapInstance.value = new Map({
        target: mapRef.value,
        layers: [...layersToAdd, drawLayerInstance, userLayer, busRouteLayer, busPickLayer, searchLayer],
        view: new View({
            center: fromLonLat(initialViewState.center),
            zoom: initialViewState.zoom,
            minZoom: 0,  // 允许缩放到最低级别
            maxZoom: 22
        }),
        controls
    });

    currentZoom.value = Number(mapInstance.value.getView()?.getZoom?.() ?? initialViewState.zoom);

    // 1.5 事件监听
    bindEvents();

    // 1.6 监听底图切换 (保留原Select功能，但改为操作 layerList)
    watch(selectedLayer, (val, prevVal) => {
        // 关闭所有（独占模式），除了注记层可能需要保留？
        // 按照原逻辑，Select 是互斥选择
        layerList.value.forEach(l => {
            if (l.id === 'label' || l.id === 'label_vector') return; // 注记层独立控制，或根据原逻辑联动
            l.visible = (l.id === val);
        });

        // 修正：区分卫星注记和矢量注记，互不混淆
        // 1. 卫星/影像底图 -> 配对 卫星注记 (label / cia)
        const needsSatelliteLabel = ['tianDiTu', 'google', 'esri'].includes(val);
        const labelItem = layerList.value.find(l => l.id === 'label');
        if (labelItem) labelItem.visible = needsSatelliteLabel;

        // 2. 矢量底图 -> 配对 矢量注记 (label_vector / cva)
        const needsVectorLabel = ['tianDiTu_vec'].includes(val);
        const vectorLabelItem = layerList.value.find(l => l.id === 'label_vector');
        if (vectorLabelItem) vectorLabelItem.visible = needsVectorLabel;
        
        // 强制刷新所有层状态
        refreshLayersState();
        if (prevVal !== undefined) {
            replaceRouteQueryFromMapState();
        }
    }, { immediate: true });

    // 1.7 初始化时也要刷新一次图层状态，确保初始配置正确应用
    refreshLayersState();
    emitUserLayersChange();
}

// [隶属] 图层切换-底图状态刷新
// [作用] 将 layerList 的可见性与顺序同步到真实图层。
// [交互] 调用 emitBaseLayersChange，与外部组件同步状态。
function refreshLayersState() {
     layerList.value.forEach((item, index) => {
        const layer = layerInstances[item.id];
        if (layer) {
            if (item.visible && !layer.getSource()) {
                const cfg = LAYER_CONFIGS.find(c => c.id === item.id);
                if (cfg) {
                    layer.setSource(cfg.createSource());
                }
            }
            layer.setVisible(item.visible);
            layer.setZIndex(index); // 列表越靠后，ZIndex越大（显示在越上层），符合"图层叠加"直觉
            // 或者是列表上面的是顶层？通常Layer Manager是上面遮盖下面。
            // 修正：通常UI上列表第一个元素在最上面（覆盖下面）。
            // 所以 ZIndex 应该 = total - index
            layer.setZIndex(layerList.value.length - index);
        }
    });
    emitBaseLayersChange();
}

// 拖拽相关逻辑
// [隶属] 图层切换-拖拽排序
// [作用] 记录当前被拖拽图层索引。
// [交互] 与 onDrop 配合使用。
function onDragStart(evt, index) {
    draggingIndex.value = index;
    evt.dataTransfer.effectAllowed = 'move';
}

// [隶属] 图层切换-拖拽排序
// [作用] 交换图层列表顺序并刷新地图层级。
// [交互] 由图层管理面板拖拽事件触发。
function onDrop(evt, dropIndex) {
    const dragIndex = draggingIndex.value;
    if (dragIndex === dropIndex) return;
    
    // 移动数组元素
    const item = layerList.value.splice(dragIndex, 1)[0];
    layerList.value.splice(dropIndex, 0, item);
    
    draggingIndex.value = -1;
    refreshLayersState();
}

// [隶属] 图层切换-可见性开关
// [作用] 复选框变更后的统一刷新入口。
// [交互] 由图层管理面板 checkbox 触发。
function updateLayerVisibility(layer) {
    // 只是触发刷新
    refreshLayersState();
}

// [隶属] 组件交互-地图事件绑定
// [作用] 统一绑定 pointermove、singleclick、contextmenu、resolution 事件。
// [交互] 多处 emit：feature-selected、location-change。
function bindEvents() {
    const map = mapInstance.value;

    // 统一处理鼠标移动：包括业务区域检测和工具提示
    map.on('pointermove', (evt) => {
        if (evt.dragging) return;

        const coordinate = evt.coordinate;
        const pixel = evt.pixel;

        // A. 测量提示逻辑
        if (helpTooltipEl) {
            helpTooltipEl.innerHTML = sketchFeature ?
                (sketchFeature.getGeometry() instanceof Polygon ? '双击结束多边形' : '双击结束测距') :
                '单击开始绘制';
            helpTooltipOverlay.setPosition(coordinate);
            helpTooltipEl.classList.remove('hidden');
        }

        // B. 特定区域图片显示逻辑
        checkAreaLogic(coordinate, pixel);
    });

    map.getViewport().addEventListener('mouseout', () => {
        if (helpTooltipEl) helpTooltipEl.classList.add('hidden');
    });

    map.on('singleclick', async (evt) => {
        if (pendingBusPick) {
            const lonLat = toLonLat(evt.coordinate);
            const pickType = pendingBusPick.type;

            busPickSource.getFeatures().forEach((feature) => {
                if (feature.get('busPickType') === pickType) {
                    busPickSource.removeFeature(feature);
                }
            });

            busPickSource.addFeature(new Feature({
                geometry: new Point(evt.coordinate),
                busPickType: pickType
            }));

            pendingBusPick.resolve({
                lng: Number(lonLat[0].toFixed(6)),
                lat: Number(lonLat[1].toFixed(6))
            });
            pendingBusPick = null;
            return;
        }

        if (!isAttributeQueryEnabled.value) return;
        if (drawInteraction && drawInteraction.getActive()) return;

        // 属性查询
        const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
        if (feature) {
            const { geometry, style, ...props } = feature.getProperties();
            emit('feature-selected', props);
            return;
        }

        const rasterInfo = await queryRasterValueAtCoordinate(evt.coordinate);
        if (rasterInfo) {
            emit('feature-selected', rasterInfo);
        }
    });

    map.getViewport().addEventListener('contextmenu', (e) => {
        if (!isAttributeQueryEnabled.value) return;
        e.preventDefault();
        const pixel = map.getEventPixel(e);
        const feature = map.forEachFeatureAtPixel(pixel, f => f);
        if (!feature) return;
        const { geometry, style, ...props } = feature.getProperties();
        emit('feature-selected', {
            ...props,
            操作提示: '右键选择，可在工具箱中编辑样式'
        });
    });

    // 缩放监听
    map.getView().on('change:resolution', () => {
        checkAreaLogic();
        // 更新缩放级别显示
        const zoom = map.getView().getZoom();
        if (zoom !== undefined) {
            currentZoom.value = Math.round(zoom);
        }
    });

    mapMoveEndKey = map.on('moveend', () => {
        syncMapQueryFromView();
    });
}

// --- 2. 业务逻辑 (区域图片) ---

// --- 3. 关键修复：复位与定位逻辑 ---

/**
 * 统一处理按钮点击交互
 * 逻辑：单击启动300ms定时器，如果期间再次点击，则取消定时器并执行双击逻辑(定位)
 * 否则执行单击逻辑(复位)
 */
// [隶属] 底部控制-Home 双击/单击识别
// [作用] 将点击行为分流为复位或定位。
// [交互] 调用 resetView / zoomToUser。
function handleHomeInteract() {
    if (homeClickTimer) {
        // --- 双击逻辑 (Double Click) ---
        clearTimeout(homeClickTimer);
        homeClickTimer = null;
        zoomToUser();
    } else {
        // --- 单击逻辑 (Single Click) ---
        homeClickTimer = setTimeout(() => {
            resetView();
            homeClickTimer = null;
        }, 300);
    }
}

// [隶属] 底部控制-Home 单击
// [作用] 地图复位到初始中心和缩放。
// [交互] 被 handleHomeInteract 调用。
function resetView() {
    mapInstance.value?.getView().animate({
        center: fromLonLat(INITIAL_VIEW.center),
        zoom: INITIAL_VIEW.zoom,
        duration: 800
    });
}

// [隶属] 图层切换-自定义底图
// [作用] 加载用户输入的 XYZ 地址并激活 custom 图层。
// [交互] 更新 layerList 并调用 refreshLayersState。
function loadCustomMap() {
    if (!customMapUrl.value) return;
    try {
        customSource = new XYZ({
            url: customMapUrl.value
        });
        // 更新 custom 层的 source
        if (layerInstances['custom']) {
            layerInstances['custom'].setSource(customSource);
            // 自动开启
            const item = layerList.value.find(l => l.id === 'custom');
            if (item) {
                item.visible = true;
                refreshLayersState();
            }
        }
    } catch (e) {
        message.error('URL格式错误或无法解析');
    }
}

// [隶属] 组件交互-路径选点
// [作用] 启动地图点选 Promise，用于公交起终点拾取。
// [交互] 由外部组件通过 defineExpose 调用。
function startBusPointPick(type) {
    if (!mapInstance.value) {
        return Promise.reject(new Error('地图尚未初始化'));
    }

    const pickType = type === 'end' ? 'end' : 'start';

    if (pendingBusPick?.reject) {
        pendingBusPick.reject(new Error('上一次选点已取消'));
    }

    return new Promise((resolve, reject) => {
        pendingBusPick = { type: pickType, resolve, reject };
    });
}

/**
 * 统一清理路线交互状态（选中步骤 + 悬停预览）。
 * 说明：公交与驾车共用一套路由图层，切换路线时必须同步复位状态，避免残留高亮。
 */
function resetRouteStepStates() {
    busActiveStepIndex = -1;
    busHoverStepIndex = -1;
    driveActiveStepIndex = -1;
    driveHoverStepIndex = -1;
}

/**
 * 按模式获取指定步骤对应要素。
 */
function getRouteStepFeatures(routeMode, stepIndex) {
    const targetStepIndex = Number(stepIndex);
    if (!Number.isFinite(targetStepIndex) || targetStepIndex < 0) return [];

    return busRouteSource.getFeatures().filter((feature) => (
        feature.get('routeMode') === routeMode && Number(feature.get('stepIndex')) === targetStepIndex
    ));
}

/**
 * 统一执行步骤缩放逻辑（公交/驾车复用）。
 */
async function zoomToRouteStep(routeMode, stepIndex, options = {}) {
    if (!mapInstance.value) {
        throw new Error('地图尚未初始化');
    }

    const { fitExtentToCoverage } = await ensureRouteBuilderApi();

    const targetStepIndex = Number(stepIndex);
    if (!Number.isFinite(targetStepIndex) || targetStepIndex < 0) {
        throw new Error('步骤索引无效');
    }

    const stepFeatures = getRouteStepFeatures(routeMode, targetStepIndex);
    if (!stepFeatures.length) {
        const routeLabel = routeMode === 'drive' ? '驾车' : '公交';
        throw new Error(`未找到${routeLabel}步骤 ${targetStepIndex + 1} 对应路段`);
    }

    if (routeMode === 'drive') {
        driveActiveStepIndex = targetStepIndex;
        driveHoverStepIndex = -1;
    } else {
        busActiveStepIndex = targetStepIndex;
        busHoverStepIndex = -1;
        driveActiveStepIndex = -1;
        driveHoverStepIndex = -1;
    }
    busRouteLayerRef?.changed?.();

    const stepExtent = createEmpty();
    stepFeatures.forEach((feature) => {
        const geometry = feature.getGeometry();
        if (!geometry) return;
        extendExtent(stepExtent, geometry.getExtent());
    });

    if (!isExtentEmpty(stepExtent)) {
        fitExtentToCoverage(mapInstance.value, stepExtent, {
            targetCoverage: options.targetCoverage ?? 0.84,
            bufferRatio: options.bufferRatio ?? 0.16,
            minBufferMeters: options.minBufferMeters ?? 120,
            maxBufferMeters: options.maxBufferMeters ?? 1200,
            padding: options.padding ?? [72, 72, 72, 72],
            duration: options.duration ?? 650,
            minZoom: options.minZoom ?? 10,
            maxZoom: options.maxZoom ?? 19
        });
    }
}

/**
 * 统一处理步骤悬停预览（公交/驾车复用）。
 */
function previewRouteStep(routeMode, stepIndex) {
    const targetStepIndex = Number(stepIndex);
    const normalized = Number.isFinite(targetStepIndex) && targetStepIndex >= 0 ? targetStepIndex : -1;

    if (routeMode === 'drive') {
        driveHoverStepIndex = normalized;
    } else {
        busHoverStepIndex = normalized;
    }
    busRouteLayerRef?.changed?.();
}

// [隶属] 路线规划-步骤预览
// [作用] 清空指定模式的悬停步骤高亮。
// [交互] 改变样式状态并触发 busRouteLayerRef.changed。
function clearRouteStepPreview(routeMode) {
    if (routeMode === 'drive') {
        driveHoverStepIndex = -1;
    } else {
        busHoverStepIndex = -1;
    }
    busRouteLayerRef?.changed?.();
}

// [隶属] 路线规划-公交渲染
// [作用] 将公交方案绘制到路线图层并自动缩放。
// [交互] 更新托管图层信息，影响外部图层管理面板。
async function drawRouteOnMap(route) {
    if (!mapInstance.value) {
        throw new Error('地图尚未初始化');
    }

    if (busRouteLayerRef && !mapInstance.value.getLayers().getArray().includes(busRouteLayerRef)) {
        mapInstance.value.addLayer(busRouteLayerRef);
    }

    // 只清理旧线路，保留起终点 marker。
    busRouteSource.clear();
    resetRouteStepStates();

    const { buildRouteRenderData, fitExtentToCoverage } = await ensureRouteBuilderApi();
    const { features, fitExtent, featureCount, hasGeometry } = buildRouteRenderData('bus', route);
    if (!featureCount) {
        throw new Error('公交方案中未找到分段信息（segments 为空）');
    }

    busRouteSource.addFeatures(features);

    const routeFeatureCount = busRouteSource.getFeatures().length;
    if (!routeFeatureCount || !hasGeometry || isExtentEmpty(fitExtent)) {
        throw new Error('公交方案存在，但未解析到可绘制的有效坐标点');
    }

    if (!isExtentEmpty(fitExtent)) {
        fitExtentToCoverage(mapInstance.value, fitExtent, {
            targetCoverage: 0.72,
            bufferRatio: 0.08,
            minBufferMeters: 120,
            maxBufferMeters: 1800,
            padding: [80, 80, 80, 80],
            duration: 700,
            minZoom: 6,
            maxZoom: 19
        });
    }

    busRouteLayerRef?.changed?.();

    syncRouteManagedLayer({
        name: '公交规划路线',
        type: 'bus_route',
        category: 'route',
        featureCount: routeFeatureCount
    });
}

// [隶属] 路线规划-驾车渲染
// [作用] 将驾车路径绘制到路线图层并自动缩放。
// [交互] 更新托管图层信息，影响外部图层管理面板。
async function drawDriveRouteOnMap(routeLatLonStr) {
    if (!mapInstance.value) {
        throw new Error('地图尚未初始化');
    }

    if (busRouteLayerRef && !mapInstance.value.getLayers().getArray().includes(busRouteLayerRef)) {
        mapInstance.value.addLayer(busRouteLayerRef);
    }

    // 清理旧路线，保留起终点 marker。
    busRouteSource.clear();
    resetRouteStepStates();

    const { buildRouteRenderData, fitExtentToCoverage } = await ensureRouteBuilderApi();
    const { features, fitExtent, hasGeometry } = buildRouteRenderData('drive', routeLatLonStr);
    if (!hasGeometry || !features.length) {
        throw new Error('驾车路线坐标不足，无法绘制');
    }

    busRouteSource.addFeatures(features);

    if (!isExtentEmpty(fitExtent)) {
        fitExtentToCoverage(mapInstance.value, fitExtent, {
            targetCoverage: 0.72,
            bufferRatio: 0.08,
            minBufferMeters: 120,
            maxBufferMeters: 1800,
            padding: [80, 80, 80, 80],
            duration: 700,
            minZoom: 6,
            maxZoom: 19
        });
    }

    busRouteLayerRef?.changed?.();

    syncRouteManagedLayer({
        name: '驾车规划路线',
        type: 'drive_route',
        category: 'route',
        featureCount: busRouteSource.getFeatures().length
    });
}

// [隶属] 路线规划-驾车步骤定位
// [作用] 聚焦到指定驾车步骤范围。
// [交互] 由外部步骤列表交互触发。
async function zoomToDriveRouteStep(stepIndex) {
    return zoomToRouteStep('drive', stepIndex, {
        targetCoverage: 0.84,
        bufferRatio: 0.16,
        minBufferMeters: 120,
        maxBufferMeters: 1200,
        padding: [72, 72, 72, 72],
        duration: 650,
        minZoom: 10,
        maxZoom: 19
    });
}

// [隶属] 路线规划-公交步骤定位
// [作用] 聚焦到指定公交步骤范围。
// [交互] 由外部步骤列表交互触发。
async function zoomToBusRouteStep(stepIndex) {
    return zoomToRouteStep('bus', stepIndex, {
        targetCoverage: 0.84,
        bufferRatio: 0.16,
        minBufferMeters: 120,
        maxBufferMeters: 1200,
        padding: [72, 72, 72, 72],
        duration: 650,
        minZoom: 10,
        maxZoom: 19
    });
}

// [隶属] 路线规划-托管图层同步
// [作用] 同步路线图层在 userDataLayers 中的记录。
// [交互] 调用 emitUserLayersChange / emitGraphicsOverview。
function syncRouteManagedLayer({ name, type, category, featureCount }) {
    const routeFeatureCount = Number(featureCount || 0);
    let managedItem = busRouteManagedLayerId
        ? userDataLayers.find(item => item.id === busRouteManagedLayerId)
        : null;

    if (!managedItem && busRouteLayerRef) {
        busRouteManagedLayerId = addManagedLayerRecord({
            name,
            type,
            sourceType: 'search',
            layer: busRouteLayerRef,
            featureCount: routeFeatureCount,
            styleConfig: null,
            metadata: { category }
        });
        managedItem = userDataLayers.find(item => item.id === busRouteManagedLayerId) || null;
    }

    if (managedItem) {
        managedItem.name = name;
        managedItem.type = type;
        managedItem.metadata = { ...(managedItem.metadata || {}), category };
        managedItem.featureCount = routeFeatureCount;
        managedItem.visible = true;
        managedItem.layer?.setVisible?.(true);
        emitUserLayersChange();
        emitGraphicsOverview();
    }
}

// [隶属] 路线规划-公交步骤预览
// [作用] 公交步骤 hover 预览入口。
// [交互] 由外部组件调用。
function previewBusRouteStep(stepIndex) {
    previewRouteStep('bus', stepIndex);
}

// [隶属] 路线规划-公交步骤预览
// [作用] 清除公交步骤 hover 预览。
// [交互] 由外部组件调用。
function clearBusRouteStepPreview() {
    clearRouteStepPreview('bus');
}

// [隶属] 路线规划-驾车步骤预览
// [作用] 驾车步骤 hover 预览入口。
// [交互] 由外部组件调用。
function previewDriveRouteStep(stepIndex) {
    previewRouteStep('drive', stepIndex);
}

// [隶属] 路线规划-驾车步骤预览
// [作用] 清除驾车步骤 hover 预览。
// [交互] 由外部组件调用。
function clearDriveRouteStepPreview() {
    clearRouteStepPreview('drive');
}

//地名搜索
// --- 5. 地名搜索功能 (主逻辑) ---
// [隶属] 组件交互-地名搜索
// [作用] 统一调用搜索服务并附带当前地图范围。
// [交互] 传给 LocationSearch 组件作为 fetcher。
async function fetchLocationResults({ service, keywords, page = 1, pageSize = 10, amapKey = '' }) {
    return fetchLocationResultsByService({
        service,
        keywords,
        page,
        pageSize,
        amapKey,
        tiandituTk: TIANDITU_TK,
        mapBound: getCurrentMapBound()
    });
}

// [隶属] 组件交互-地名搜索
// [作用] 获取当前地图范围字符串，作为搜索边界条件。
// [交互] 被 fetchLocationResults 调用。
function getCurrentMapBound() {
    try {
        if (!mapInstance.value) return undefined;
        const view = mapInstance.value.getView();
        const size = mapInstance.value.getSize();
        if (!size) return undefined;
        const ext = view.calculateExtent(size);
        const sw = toLonLat([ext[0], ext[1]]);
        const ne = toLonLat([ext[2], ext[3]]);
        return `${sw[0].toFixed(6)},${sw[1].toFixed(6)},${ne[0].toFixed(6)},${ne[1].toFixed(6)}`;
    } catch (e) {
        console.warn('计算 mapBound 失败，使用默认范围', e);
        return undefined;
    }
}

// [隶属] 组件交互-地名搜索
// [作用] 将搜索结果定位到地图并生成托管点图层。
// [交互] 由 LocationSearch 的 select-result 事件触发。
function selectResult(item) {
    if (!mapInstance.value || !item) return;
    // 支持不同来源字段（Nominatim 返回 lon/lat；天地图可能返回 lon/lat 或 x/y）
    const lonVal = item.lon ?? item.x ?? item.lng ?? item.lonlat?.split?.(',')?.[0];
    const latVal = item.lat ?? item.y ?? item.latit ?? item.lonlat?.split?.(',')?.[1];
    const lon = lonVal != null ? parseFloat(lonVal) : NaN;
    const lat = latVal != null ? parseFloat(latVal) : NaN;
    if (Number.isNaN(lon) || Number.isNaN(lat)) {
        message.warning('无法解析该结果的坐标');
        return;
    }
    const coord = fromLonLat([lon, lat]);

    const layerName = (item.display_name || item.name || `搜索结果_${lon.toFixed(5)}_${lat.toFixed(5)}`).trim();
    const f = new Feature({
        geometry: new Point(coord),
        type: 'search',
        名称: layerName,
        经度: Number(lon.toFixed(6)),
        纬度: Number(lat.toFixed(6))
    });
    createManagedVectorLayer({
        name: layerName,
        type: 'search',
        sourceType: 'search',
        features: [f],
        styleConfig: SEARCH_RESULT_STYLE,
        autoLabel: true,
        metadata: {
            longitude: Number(lon.toFixed(6)),
            latitude: Number(lat.toFixed(6))
        },
        fitView: false
    });

    // 动画缩放到位置
    mapInstance.value.getView().animate({ center: coord, zoom: 16, duration: 700 });

}

// --- 4. 外部接口 (文件导入/绘图) ---

// [隶属] 图层管理-绘图样式
// [作用] 更新绘图图层及历史绘制图层的样式。
// [交互] 影响绘图工具与图层管理面板样式显示。
function setDrawStyle(styleCfg) {
    drawStyleConfig.value = mergeStyleConfig(drawStyleConfig.value, styleCfg);
    if (drawLayerInstance) {
        drawLayerInstance.setStyle(createStyleFromConfig(drawStyleConfig.value));
    }
    userDataLayers
        .filter(item => item.sourceType === 'draw')
        .forEach(item => {
            item.styleConfig = mergeStyleConfig(item.styleConfig, styleCfg);
            applyManagedLayerStyle(item);
        });
    emitUserLayersChange();
}

// [隶属] 底部控制-图形视野
// [作用] 将视图缩放到所有绘制/上传图层的联合范围。
// [交互] 由工具栏 ZoomToGraphics 与外部调用触发。
function zoomToGraphics() {
    if (!mapInstance.value) return;
    const unionExtent = createEmpty();

    const drawExtent = drawSource.getExtent();
    if (drawExtent && drawExtent.every(v => Number.isFinite(v))) {
        extendExtent(unionExtent, drawExtent);
    }

    userDataLayers.forEach(item => {
        const ext = item.layer.getSource()?.getExtent();
        if (ext && ext.every(v => Number.isFinite(v))) {
            extendExtent(unionExtent, ext);
        }
    });

    if (isExtentEmpty(unionExtent)) return;

    mapInstance.value.getView().fit(unionExtent, {
        padding: [80, 80, 80, 80],
        duration: 900,
        maxZoom: 18
    });
}

// --- 交互工具 (Draw/Measure) ---
// [隶属] 组件交互-绘图与测量
// [作用] 根据工具类型激活绘图、测量、清理、属性查询等交互。
// [交互] 对外 emit(feature-selected/graphics-overview) 并被父组件工具箱调用。
function activateInteraction(type) {
    clearInteractions();
    if (!mapInstance.value) return;

    if (type === 'AttributeQuery') {
        isAttributeQueryEnabled.value = true;
        return;
    }

    if (type === 'CloseTools') {
        isAttributeQueryEnabled.value = false;
        return;
    }

    if (type === 'ZoomToGraphics') {
        zoomToGraphics();
        return;
    }

    if (type === 'ViewGraphics') {
        emitGraphicsOverview();
        emit('feature-selected', {
            绘制图形数量: drawSource.getFeatures().length,
            上传图层数量: userDataLayers.length,
            上传图层名称: userDataLayers.map(item => item.name).join('、') || '无'
        });
        return;
    }

    if (type === 'Clear') {
        drawSource.clear();
        for (let i = userDataLayers.length - 1; i >= 0; i--) {
            if (userDataLayers[i].sourceType === 'draw') {
                mapInstance.value.removeLayer(userDataLayers[i].layer);
                userDataLayers.splice(i, 1);
            }
        }
        refreshUserLayerZIndex();
        emitUserLayersChange();
        mapInstance.value.getOverlays().clear();
        emitGraphicsOverview();
        return;
    }

    const isMeasure = ['MeasureDistance', 'MeasureArea'].includes(type);
    const drawType = type === 'MeasureDistance' ? 'LineString' : (type === 'MeasureArea' ? 'Polygon' : type);

    drawInteraction = new Draw({
        source: drawSource,
        type: drawType,
        style: createStyleFromConfig(drawStyleConfig.value)
    });

    mapInstance.value.addInteraction(drawInteraction);
    snapInteraction = new Snap({ source: drawSource });
    mapInstance.value.addInteraction(snapInteraction);

    if (isMeasure) {
        createTooltips();
        drawInteraction.on('drawstart', (evt) => {
            sketchFeature = evt.feature;
            sketchFeature.getGeometry().on('change', (e) => {
                const geom = e.target;
                let output, tooltipCoord;
                if (geom instanceof Polygon) {
                    output = formatArea(geom);
                    tooltipCoord = geom.getInteriorPoint().getCoordinates();
                } else {
                    output = formatLength(geom);
                    tooltipCoord = geom.getLastCoordinate();
                }
                measureTooltipEl.innerHTML = output;
                measureTooltipOverlay.setPosition(tooltipCoord);
            });
        });
        drawInteraction.on('drawend', () => {
            measureTooltipEl.className = 'ol-tooltip ol-tooltip-static';
            measureTooltipOverlay.setOffset([0, -7]);
            sketchFeature = null;
            measureTooltipEl = null;
            createTooltips(); // 为下一次做准备
            emitGraphicsOverview();
        });
    } else {
        drawInteraction.on('drawend', (evt) => {
            const feature = evt.feature;
            const geom = feature.getGeometry();
            const geomType = geom?.getType?.() || drawType;
            drawSource.removeFeature(feature);

            createManagedVectorLayer({
                name: `绘制_${geomType}_${drawGraphicSeed++}`,
                type: geomType,
                sourceType: 'draw',
                features: [feature],
                styleConfig: drawStyleConfig.value,
                fitView: false
            });
            emitGraphicsOverview();
        });
    }
}

// [隶属] 组件交互-绘图与测量
// [作用] 清理当前激活的绘图/捕捉交互和提示覆盖物。
// [交互] 被 activateInteraction 与外部调用复用。
function clearInteractions() {
    if (!mapInstance.value) return;
    if (drawInteraction) mapInstance.value.removeInteraction(drawInteraction);
    if (snapInteraction) mapInstance.value.removeInteraction(snapInteraction);
    if (helpTooltipOverlay) mapInstance.value.removeOverlay(helpTooltipOverlay);
    drawInteraction = null;
    snapInteraction = null;
    helpTooltipEl = null;
}

// [隶属] 组件交互-绘图与测量
// [作用] 创建测量值提示和操作引导提示覆盖物。
// [交互] 被 activateInteraction(测量模式) 调用。
function createTooltips() {
    if (measureTooltipEl) measureTooltipEl.remove();
    if (helpTooltipEl) helpTooltipEl.remove();

    helpTooltipEl = document.createElement('div');
    helpTooltipEl.className = 'ol-tooltip hidden';
    helpTooltipOverlay = new Overlay({ element: helpTooltipEl, offset: [15, 0], positioning: 'center-left' });
    mapInstance.value.addOverlay(helpTooltipOverlay);

    measureTooltipEl = document.createElement('div');
    measureTooltipEl.className = 'ol-tooltip ol-tooltip-measure';
    measureTooltipOverlay = new Overlay({ element: measureTooltipEl, offset: [0, -15], positioning: 'bottom-center', stopEvent: false });
    mapInstance.value.addOverlay(measureTooltipOverlay);
}

// [隶属] 组件交互-绘图与测量
// [作用] 格式化线长度显示文本。
// [交互] 被测距绘制过程调用。
const formatLength = (line) => {
    const len = getLength(line);
    return len > 100 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(2)} m`;
};
// [隶属] 组件交互-绘图与测量
// [作用] 格式化面面积显示文本。
// [交互] 被测面绘制过程调用。
const formatArea = (poly) => {
    const area = getArea(poly);
    return area > 10000 ? `${(area / 1000000).toFixed(2)} km²` : `${area.toFixed(2)} m²`;
};

// [隶属] 组件交互-对外能力暴露
// [作用] 向父组件公开地图核心动作（导入、绘制、路线、图层管理等）。
// [交互] HomeView 等父组件通过 ref 调用这些方法。
defineExpose({
    addUserDataLayer,
    activateInteraction,
    clearInteractions,
    getCurrentLocation,
    startBusPointPick,
    drawRouteOnMap,
    zoomToBusRouteStep,
    previewBusRouteStep,
    clearBusRouteStepPreview,
    drawDriveRouteOnMap,
    zoomToDriveRouteStep,
    previewDriveRouteStep,
    clearDriveRouteStepPreview,
    setDrawStyle,
    setUserLayerStyle,
    applyStyleTemplate,
    setUserLayerVisibility,
    setUserLayerOpacity,
    setUserLayerLabelVisibility,
    setBaseLayerActive,
    setLayerVisibility,
    zoomToUserLayer,
    zoomToManagedFeature,
    highlightManagedFeature,
    removeUserLayer,
    reorderUserLayers,
    soloUserLayer,
    viewUserLayer,
    zoomToGraphics
});
</script>

<style scoped>
.map-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: #f0f2f5;
}

#map {
    width: 100%;
    height: 100%;
}

/* 图片集弹窗 */
.imageset {
    position: absolute;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #ddd;
    padding: 6px;
    width: 310px;
    z-index: 1000;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    /* 允许点击 */
}

.thumbnail {
    width: 96px;
    height: 64px;
    object-fit: cover;
    cursor: zoom-in;
    border-radius: 4px;
    transition: all 0.2s;
}

.thumbnail:hover {
    transform: scale(1.05);
}

/* 全屏大图 Lightbox */
.lightbox {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: center;
}

.large-image {
    max-width: 90%;
    max-height: 90%;
    border: 2px solid #fff;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
}

.close-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    background: none;
    border: none;
    color: #fff;
    font-size: 40px;
    cursor: pointer;
}

/* 控件样式 */
.layer-switcher {
    position: absolute;
    top: 15px;
    right: 15px;
    background: #309441;
    padding: 4px;
    border-radius: 4px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    z-index: 10;
}

.search-box {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    position: relative;
}

.search-input {
    padding: 6px 8px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    width: 200px;
}

.search-btn {
    padding: 6px 8px;
    border-radius: 4px;
    border: none;
    background: #fff;
    cursor: pointer;
}

.search-action {
    position: relative;
}

.search-service-menu,
.search-results {
    list-style: none;
    margin: 6px 0 0 0;
    padding: 6px;
    width: 100%;
    max-height: 180px;
    overflow: auto;
    background: #fff;
    border-radius: 4px;
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.12);
}

.search-service-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    width: 176px;
    margin: 0;
    z-index: 20;
}

.search-service-menu li,
.search-results li {
    padding: 6px 8px;
    cursor: pointer;
}

.search-service-menu li:hover,
.search-results li:hover {
    background: #f2f2f2;
}

.layer-select {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    outline: none;
    display: inline-block;
    /* 与 label 同行 */
    margin: 0 0 0 6px;
    /* 与文字保持间距 */
    vertical-align: middle;
}

.layer-label {
    color: #fff;
    font-size: 13px;
    display: inline-block;
    margin: 0;
    vertical-align: middle;
}

/* --- 底部控制栏容器 --- */
.map-controls-group {
    position: absolute;
    bottom: 25px;
    right: 15px;
    background: #3a873e;
    /* 深绿色半透明背景 */
    backdrop-filter: blur(4px);
    /* 毛玻璃效果 */
    color: white;
    padding: 6px 12px;
    border-radius: 20px;
    /* 圆角加大，像胶囊 */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;

    /* 核心布局：Flex 使得内部元素横向排列，垂直居中 */
    display: flex;
    align-items: center;
    gap: 12px;
    /* 元素之间的间距 */
    white-space: nowrap;
    /* 防止内容换行 */
}

/* --- 经纬度文本容器 --- */
.mouse-position-content {
    font-family: 'Consolas', 'Monaco', monospace;
    /* 使用等宽字体，数字不跳动 */
    font-size: 15px;
    color: #e0e0e0;
    /* 关键：不需要固定 min-width，让内容撑开，或者给一个基础宽度 */
    min-width: 140px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* --- 缩放级别显示 --- */
.zoom-level-display {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 16px;
    font-weight: bold;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.15);
    padding: 2px 10px;
    border-radius: 12px;
    min-width: 28px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* --- 强制覆盖 OpenLayers 默认生成的样式 (核心修复) --- */
/* OpenLayers 默认会给这个类加 position: absolute，必须覆盖掉 */
:deep(.ol-mouse-position) {
    position: static !important;
    /* 强制改为静态定位，遵循 Flex 流 */
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    left: auto !important;
    background: transparent !important;
    padding: 0 !important;
    margin: 0 !important;
    color: inherit !important;
    /* 继承父级文字颜色 */
    font-size: inherit !important;
}

/* --- 分隔符 --- */
.divider {
    width: 1px;
    height: 18px;
    background-color: rgba(255, 255, 255, 0.4);
    flex-shrink: 0;
    /* 防止分隔符被挤压没了 */
}

/* --- Home 按钮 --- */
.home-btn {
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    /* 圆形按钮体验更好 */
    transition: background-color 0.2s, transform 0.2s;
    flex-shrink: 0;
    /* 防止按钮被挤压 */
}

.home-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
    transform: scale(1.1);
}

.home-btn:active {
    transform: scale(0.95);
}

/* --- 移动端适配 --- */
@media (max-width: 768px) {
    /* .mouse-position-content { */
    /* display: none; */
    /* 手机屏幕太小，建议直接隐藏经纬度，只保留按钮 */
    /* } */

    .divider {
        display: none;
    }

    .map-controls-group {
        padding: 8px;
        /* 缩小内边距 */
        bottom: 40px;
        /* 避开可能存在的底部导航或Logo */
    }
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* OpenLayers Tooltips Override */
:deep(.ol-tooltip) {
    position: relative;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    color: white;
    padding: 4px 8px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
}

:deep(.ol-tooltip-measure) {
    opacity: 1;
    font-weight: bold;
}

:deep(.ol-tooltip-static) {
    background-color: #ffcc33;
    color: black;
    border: 1px solid white;
}

.custom-url-wrapper {
    margin-top: 6px;
    display: flex;
    gap: 4px;
}

.custom-url-input {
    flex: 1;
    width: 160px;
    padding: 4px;
    border-radius: 4px;
    border: 1px solid #ccc;
    font-size: 12px;
}

.custom-url-btn {
    padding: 2px 6px;
    border-radius: 4px;
    border: none;
    background: #fff;
    cursor: pointer;
    font-size: 12px;
}

/* 图层管理样式 */
.layer-manage-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: white;
    padding: 4px;
    margin-left: 4px;
    vertical-align: middle;
}
.layer-manage-btn:hover {
    color: #eee;
}

.graticule-btn {
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.45);
    color: #fff;
    border-radius: 4px;
    cursor: pointer;
    padding: 3px 8px;
    margin-left: 4px;
    font-size: 12px;
    vertical-align: middle;
}

.graticule-btn:hover {
    background: rgba(255, 255, 255, 0.24);
}

.graticule-btn.active {
    background: #f6fff8;
    color: #1e6f34;
    border-color: #f6fff8;
    font-weight: 700;
}

.layer-manager-panel {
    position: absolute;
    top: 100%; /* 改为 100% 确保显示在父容器下方，不遮挡内容 */
    right: 0;
    margin-top: 6px;
    width: 200px;
    background: white;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    padding: 0; /* padding 移到内部或具体元素 */
    max-height: 300px;
    overflow-y: auto;
    z-index: 2000;
}
.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    background: #f0f0f0;
    border-bottom: 1px solid #ddd;
    border-radius: 4px 4px 0 0;
    font-size: 13px;
    font-weight: bold;
    color: #333;
}
.close-panel-btn {
    cursor: pointer;
    font-size: 16px;
    color: #999;
    line-height: 1;
}
.close-panel-btn:hover {
    color: #ff4444;
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
    background: #f9f9f9;
    border: 1px solid #eee;
    border-radius: 4px;
    cursor: move;
    font-size: 13px;
    user-select: none;
}
.layer-item:hover {
    background: #f0f0f0;
}
.layer-item.dragging {
    opacity: 0.5;
    background: #e0e0e0;
}
.drag-handle {
    cursor: grab;
    color: #999;
    font-weight: bold;
    padding-right: 4px;
}
.layer-name {
    flex: 1;
}

/* 鹰眼视图样式 */
:deep(.ol-custom-overviewmap) {
    position: absolute;
    left: 10px;
    top: 10px;
    right: auto;
    bottom: auto;
}

:deep(.ol-custom-overviewmap:not(.ol-collapsed)) {
    border: 2px solid rgba(20, 156, 49, 0.729);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.9);
}

:deep(.ol-custom-overviewmap .ol-overviewmap-map) {
    border: none;
    width: 200px;
    height: 200px;
}

:deep(.ol-custom-overviewmap .ol-overviewmap-box) {
    border: 2px solid #00aaff;
    background: rgba(0, 170, 255, 0.2);
}

:deep(.ol-custom-overviewmap button) {
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 16px;
    font-weight: bold;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    padding: 2px 6px;
}

:deep(.ol-custom-overviewmap button:hover) {
    background-color: rgba(0, 0, 0, 0.8);
}

/* 移动端适配鹰眼视图 */
@media (max-width: 768px) {
    :deep(.ol-custom-overviewmap .ol-overviewmap-map) {
        width: 120px;
        height: 120px;
    }
}
</style>