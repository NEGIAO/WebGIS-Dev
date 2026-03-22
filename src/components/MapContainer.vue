<template>
    <div class="map-container" ref="mapContainerRef">
        <div id="map" ref="mapRef"></div>

        <!-- 图片集覆盖层 (特定区域显示) -->
        <transition name="fade">
            <div class="imageset" v-show="showImageSet"
                :style="{ left: imageSetPosition.x + 'px', top: imageSetPosition.y + 'px' }">
                <img v-for="(img, index) in images" :key="index" :src="img" class="thumbnail"
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
import { computed, ref, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import LocationSearch from './LocationSearch.vue';
import { searchAmapPlaces } from '../api/map';

// OpenLayers 核心库
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Overlay from 'ol/Overlay';
import { equivalent, fromLonLat, toLonLat, transform, transformExtent } from 'ol/proj';
import { defaults as defaultControls, ScaleLine, MousePosition, OverviewMap } from 'ol/control';
import { createStringXY } from 'ol/coordinate';
import { unByKey } from 'ol/Observable';
import { getArea, getLength } from 'ol/sphere';
import { createEmpty, extend as extendExtent, isEmpty as isExtentEmpty } from 'ol/extent';

// 图层与数据源
import TileLayer from 'ol/layer/Tile';
import WebGLTileLayer from 'ol/layer/WebGLTile';
import ImageLayer from 'ol/layer/Image';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import ImageStatic from 'ol/source/ImageStatic';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';

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

// 天地图 Token：优先使用环境变量，否则使用默认值
// 生产环境建议在 .env 文件中配置 VITE_TIANDITU_TK
const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';

const DIHUAN_BOUNDS = { minLon: 114.3020, maxLon: 114.3030, minLat: 34.8149, maxLat: 34.8154 };
const IMAGES = [
    '地理与环境学院标志牌.jpg', '地理与环境学院入口.jpg', '地学楼.jpg',
    '教育部重点实验室.jpg', '四楼逃生图.jpg', '学院楼单侧.jpg'
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
const images = ref(IMAGES);
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
const GOOGLE_HOST_STRATEGY = 'fastest';
const GOOGLE_MANUAL_HOST = TILE_HOSTS.googleCandidates[0];
const GOOGLE_PROBE_TIMEOUT_MS = 1200;
const activeGoogleTileHost = ref(GOOGLE_MANUAL_HOST);

const buildGoogleTileUrl = (pathAndQuery) => `https://${activeGoogleTileHost.value}${pathAndQuery}`;
const buildTiandituUrl = (pathAndQuery) => `https://${TILE_HOSTS.tianditu}${pathAndQuery}`;

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

let cachedShpParser = null;
let cachedJSZip = null;
let cachedGeotiffFromBlob = null;
let cachedGeoTIFFSourceCtor = null;

async function getShpParser() {
    if (!cachedShpParser) {
        const mod = await import('shpjs');
        cachedShpParser = mod.default || mod;
    }
    return cachedShpParser;
}

async function getJSZipCtor() {
    if (!cachedJSZip) {
        const mod = await import('jszip');
        cachedJSZip = mod.default || mod;
    }
    return cachedJSZip;
}

async function getGeotiffFromBlob() {
    if (!cachedGeotiffFromBlob) {
        const mod = await import('geotiff');
        cachedGeotiffFromBlob = mod.fromBlob;
    }
    return cachedGeotiffFromBlob;
}

async function getGeoTIFFSourceCtor() {
    if (!cachedGeoTIFFSourceCtor) {
        const mod = await import('ol/source/GeoTIFF');
        cachedGeoTIFFSourceCtor = mod.default;
    }
    return cachedGeoTIFFSourceCtor;
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
let dynamicSplitLinesLayer = null;
let dynamicSplitMoveKey = null;

// 图层引用
let baseLayer, labelLayer;
const drawSource = new VectorSource();
const userLocationSource = new VectorSource();

const emit = defineEmits([
    'location-change',
    'update-news-image',
    'feature-selected',
    'user-layers-change',
    'graphics-overview',
    'base-layers-change'
]);

const isAttributeQueryEnabled = ref(true);
const userDataLayers = [];
let userLayerSeed = 1;
let drawGraphicSeed = 1;
let drawLayerInstance = null;

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

const drawStyleConfig = ref({ ...STYLE_TEMPLATES.classic });

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

function mergeStyleConfig(prevCfg, newCfg) {
    return normalizeStyleConfig({ ...(prevCfg || {}), ...(newCfg || {}) });
}

function getLayerLabelText(layerItem) {
    if (!layerItem?.autoLabel) return '';
    if (!layerItem?.labelVisible) return '';
    return String(layerItem.name || '').trim();
}

function applyManagedLayerStyle(layerItem) {
    if (!layerItem || typeof layerItem.layer?.setStyle !== 'function') return;
    layerItem.layer.setStyle(createStyleFromConfig(layerItem.styleConfig, {
        labelText: getLayerLabelText(layerItem)
    }));
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
    })
};

// --- 初始化 ---
onMounted(async () => {
    initMap();

    resolvePreferredGoogleHost().then((host) => {
        if (!host || host === activeGoogleTileHost.value) return;
        activeGoogleTileHost.value = host;
        refreshGoogleLayerSources();
    }).catch(() => {});

    // 异步判断 IP 区域，不阻塞地图首屏初始化
    const ipInfo = await detectIPLocale();

    // 简单 UA 判定移动端（用于选择 GPS vs IP）；用户只需允许一次定位
    const ua = navigator.userAgent || '';
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

    if (isMobile) {
        // 移动端：请求一次高精度 GPS 定位并将位置写入图层（不循环）
        if (navigator.geolocation) {
            getCurrentLocation(true).then(pos => updateUserPosition(pos, true)).catch(() => {});
        }
    } else {
        // 桌面端：使用 IP 定位（如果 ipInfo 返回了坐标）
        if (ipInfo && ipInfo.lat && ipInfo.lon && mapInstance.value) {
            const coord = fromLonLat([ipInfo.lon, ipInfo.lat]);
            mapInstance.value.getView().animate({ center: coord, zoom: 12, duration: 800 });
        }
    }

});

// 简单的 IP 判定：调用第三方 IP->位置 服务（前端调用可能受 CORS 限制）
async function detectIPLocale() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) return { isDomestic: false };
        const data = await res.json();
        // ipapi 返回 country / country_code 或 country_name
        const cc = data.country || data.country_code || data.country_name;
        const isDom = typeof cc === 'string' && (cc.toString().toUpperCase().includes('CN') || cc.toString().toLowerCase().includes('china'));
        isDomestic.value = isDom;

        // 如果服务返回经纬度，则一并返回，供桌面端粗定位使用
        const lat = data.latitude ?? data.lat ?? data.latitude;
        const lon = data.longitude ?? data.lon ?? data.longitude;
        if (lat != null && lon != null) {
            return { isDomestic: isDom, lat: parseFloat(lat), lon: parseFloat(lon) };
        }
        return { isDomestic: isDom };
    } catch (e) {
        console.warn('IP locale detect failed', e);
        isDomestic.value = false;
        return { isDomestic: false };
    }
}

onUnmounted(() => {
    if (dynamicSplitMoveKey) {
        unByKey(dynamicSplitMoveKey);
        dynamicSplitMoveKey = null;
    }
    if (mapInstance.value) mapInstance.value.setTarget(null);
});

function emitUserLayersChange() {
    emit('user-layers-change', userDataLayers.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        sourceType: item.sourceType || 'upload',
        order: item.order ?? 0,
        visible: item.visible,
        featureCount: item.featureCount,
        opacity: item.opacity ?? 1,
        autoLabel: !!item.autoLabel,
        labelVisible: item.labelVisible !== false,
        longitude: Number.isFinite(item.metadata?.longitude) ? item.metadata.longitude : undefined,
        latitude: Number.isFinite(item.metadata?.latitude) ? item.metadata.latitude : undefined,
        styleConfig: item.styleConfig || { ...STYLE_TEMPLATES.classic }
    })));
}

function emitGraphicsOverview() {
    emit('graphics-overview', {
        drawCount: drawSource.getFeatures().length,
        uploadCount: userDataLayers.length,
        layers: userDataLayers.map(item => ({
            id: item.id,
            name: item.name,
            visible: item.visible,
            featureCount: item.featureCount
        }))
    });
}

function getLayerCategory(layerId) {
    if (['google', 'google_standard', 'google_clean', 'tianDiTu', 'tianDiTu_vec', 'esri', 'osm', 'amap', 'tengxun', 'esri_ocean', 'esri_terrain', 'esri_physical', 'esri_hillshade', 'esri_gray', 'yandex_sat', 'geoq_gray', 'geoq_hydro', 'local', 'custom'].includes(layerId)) {
        return 'base';
    }
    return 'overlay';
}

function getLayerGroup(layerId) {
    if (['google', 'tianDiTu', 'esri', 'yandex_sat'].includes(layerId)) return '影像';
    if (['google_standard', 'google_clean', 'tianDiTu_vec', 'osm', 'amap', 'tengxun', 'geoq_gray', 'geoq_hydro'].includes(layerId)) return '矢量';
    if (['esri_ocean', 'esri_terrain', 'esri_physical', 'esri_hillshade', 'esri_gray', 'local', 'custom'].includes(layerId)) return '专题';
    return '注记';
}

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

function refreshGoogleLayerSources() {
    const googleLayerIds = ['google', 'google_standard', 'google_clean'];
    googleLayerIds.forEach((id) => {
        const cfg = LAYER_CONFIGS.find(item => item.id === id);
        const layer = layerInstances[id];
        if (!cfg || !layer) return;
        layer.setSource(cfg.createSource());
    });
}

function refreshUserLayerZIndex() {
    userDataLayers.forEach((item, index) => {
        item.order = index;
        item.layer.setZIndex(120 + index);
    });
}

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
    const layerLabel = labelVisible ? name : '';
    const layer = new VectorLayer({
        source: new VectorSource({ features }),
        zIndex: 120,
        style: createStyleFromConfig(normalizedStyle, { labelText: layerLabel }),
        properties: { name }
    });

    mapInstance.value.addLayer(layer);

    const id = `layer_${userLayerSeed++}`;
    userDataLayers.push({
        id,
        name,
        type,
        sourceType,
        order: userDataLayers.length,
        visible: true,
        opacity: 1,
        featureCount: features.length,
        autoLabel: !!autoLabel,
        labelVisible,
        metadata: metadata || null,
        styleConfig: normalizedStyle,
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

function getBandMinMax(data) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return { min: 0, max: 1 };
    }
    return { min, max };
}

function stretchToByte(value, min, max) {
    if (!Number.isFinite(value)) return 0;
    const n = (value - min) / (max - min);
    return Math.max(0, Math.min(255, Math.round(n * 255)));
}

function isNoDataValue(value, nodataValue) {
    if (nodataValue === null || nodataValue === undefined || !Number.isFinite(value)) return false;
    const eps = Math.max(1e-9, Math.abs(nodataValue) * 1e-9);
    return Math.abs(value - nodataValue) <= eps;
}

function computePercentileStretch(data, nodataValue, lowPct = 2, highPct = 98) {
    if (!data?.length) return { min: 0, max: 1 };

    const maxSamples = 200000;
    const step = Math.max(1, Math.floor(data.length / maxSamples));
    const values = [];

    for (let i = 0; i < data.length; i += step) {
        const v = data[i];
        if (!Number.isFinite(v) || isNoDataValue(v, nodataValue)) continue;
        values.push(v);
    }

    if (!values.length) return { min: 0, max: 1 };

    values.sort((a, b) => a - b);
    const lowIndex = Math.max(0, Math.floor((values.length - 1) * (lowPct / 100)));
    const highIndex = Math.max(0, Math.floor((values.length - 1) * (highPct / 100)));

    let min = values[lowIndex];
    let max = values[highIndex];
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        min = values[0];
        max = values[values.length - 1];
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return { min: 0, max: 1 };
    }
    return { min, max };
}

function addManagedLayerRecord({ name, type, sourceType, layer, featureCount = 1, styleConfig = null, metadata = null }) {
    const id = `layer_${userLayerSeed++}`;
    userDataLayers.push({
        id,
        name,
        type,
        sourceType,
        order: userDataLayers.length,
        visible: true,
        opacity: 1,
        featureCount,
        styleConfig,
        metadata,
        layer
    });
    refreshUserLayerZIndex();
    emitUserLayersChange();
    emitGraphicsOverview();
    return id;
}

function isRasterUploadLayer(item) {
    const t = String(item?.type || '').toLowerCase();
    return item?.sourceType === 'upload' && (t === 'tif' || t === 'tiff');
}

function createGeoTiffSampler({ image, projection, nodataValue = null }) {
    if (!image) return null;
    const width = image.getWidth();
    const height = image.getHeight();
    const bbox = image.getBoundingBox();
    if (!bbox || bbox.length < 4) return null;

    return async (mapCoordinate, mapProjection) => {
        let coord = mapCoordinate;
        if (projection && mapProjection && !equivalent(projection, mapProjection)) {
            coord = transform(mapCoordinate, mapProjection, projection);
        }

        const minX = bbox[0];
        const minY = bbox[1];
        const maxX = bbox[2];
        const maxY = bbox[3];
        if (coord[0] < minX || coord[0] > maxX || coord[1] < minY || coord[1] > maxY) {
            return null;
        }

        const xNorm = (coord[0] - minX) / Math.max(1e-12, maxX - minX);
        const yNorm = (maxY - coord[1]) / Math.max(1e-12, maxY - minY);
        const px = Math.min(width - 1, Math.max(0, Math.floor(xNorm * width)));
        const py = Math.min(height - 1, Math.max(0, Math.floor(yNorm * height)));

        const raster = await image.readRasters({ window: [px, py, px + 1, py + 1] });
        const bands = Array.isArray(raster) ? raster : [raster];
        const values = bands.map((band) => band?.[0]);
        const allNoData = nodataValue !== null && values.every((v) => isNoDataValue(v, nodataValue));

        return {
            values,
            pixel: [px, py],
            nodataValue,
            allNoData
        };
    };
}

function formatLongitude(lon) {
    const abs = Math.abs(lon).toFixed(4);
    return `${abs}°${lon >= 0 ? 'E' : 'W'}`;
}

function formatLatitude(lat) {
    const abs = Math.abs(lat).toFixed(4);
    return `${abs}°${lat >= 0 ? 'N' : 'S'}`;
}

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

function createExtentRasterSampler({ bands, width, height, extent, projection, nodataValue = null }) {
    if (!bands?.length || !width || !height || !extent) return null;

    return async (mapCoordinate, mapProjection) => {
        let coord = mapCoordinate;
        if (projection && mapProjection && !equivalent(projection, mapProjection)) {
            coord = transform(mapCoordinate, mapProjection, projection);
        }

        const [minX, minY, maxX, maxY] = extent;
        if (coord[0] < minX || coord[0] > maxX || coord[1] < minY || coord[1] > maxY) {
            return null;
        }

        const xNorm = (coord[0] - minX) / Math.max(1e-12, maxX - minX);
        const yNorm = (maxY - coord[1]) / Math.max(1e-12, maxY - minY);
        const px = Math.min(width - 1, Math.max(0, Math.floor(xNorm * width)));
        const py = Math.min(height - 1, Math.max(0, Math.floor(yNorm * height)));
        const idx = py * width + px;
        const values = bands.map((band) => band?.[idx]);
        const allNoData = nodataValue !== null && values.every((v) => isNoDataValue(v, nodataValue));

        return {
            values,
            pixel: [px, py],
            nodataValue,
            allNoData
        };
    };
}

async function queryRasterValueAtCoordinate(mapCoordinate) {
    if (!mapInstance.value) return null;
    const mapProjection = mapInstance.value.getView().getProjection();
    const rasterLayers = [...userDataLayers]
        .filter(item => item.visible && isRasterUploadLayer(item) && typeof item.metadata?.rasterSampler === 'function')
        .sort((a, b) => (b.order ?? 0) - (a.order ?? 0));

    for (const item of rasterLayers) {
        try {
            const sampled = await item.metadata.rasterSampler(mapCoordinate, mapProjection);
            if (!sampled) continue;

            const lonlat = toLonLat(mapCoordinate);
            const payload = {
                图层名称: item.name,
                图层类型: '栅格',
                像元列行: `${sampled.pixel[0]}, ${sampled.pixel[1]}`,
                点击经度: Number(lonlat[0].toFixed(6)),
                点击纬度: Number(lonlat[1].toFixed(6))
            };

            sampled.values.forEach((v, idx) => {
                const key = `波段${idx + 1}`;
                payload[key] = sampled.nodataValue !== null && isNoDataValue(v, sampled.nodataValue)
                    ? 'NoData'
                    : (Number.isFinite(v) ? Number(v.toFixed(6)) : String(v));
            });

            return payload;
        } catch (err) {
            console.warn('Raster sample failed', err);
        }
    }

    return null;
}

function projectExtentToMapView(extent, sourceProjection) {
    if (!mapInstance.value || !extent || extent.some(v => !Number.isFinite(v))) return null;
    const viewProjection = mapInstance.value.getView().getProjection();
    if (!sourceProjection || equivalent(sourceProjection, viewProjection)) {
        return extent;
    }
    try {
        return transformExtent(extent, sourceProjection, viewProjection);
    } catch (err) {
        console.warn('Extent projection transform failed, fallback to original extent', err);
        return extent;
    }
}

async function createNonGeorefTiffLayer({
    blob,
    name,
    type,
    sourceType,
    fitView = false,
    imageExtent = null,
    projection = null,
    alertMessage = '该 TIF 未检测到坐标参考，已按当前视图中心临时加载。',
    metadata = { noGeorefFallback: true },
    nodataValue = null,
    stretchRange = null
}) {
    if (!mapInstance.value) return null;

    const geotiffFromBlob = await getGeotiffFromBlob();
    const tiff = await geotiffFromBlob(blob);
    const image = await tiff.getImage();
    const width = image.getWidth();
    const height = image.getHeight();
    const rasters = await image.readRasters();

    const bands = Array.isArray(rasters) ? rasters : [rasters];
    const bandStats = bands.slice(0, 3).map(getBandMinMax);
    const alphaStats = bands.length >= 4 ? getBandMinMax(bands[3]) : null;
    const isSingleBand = bands.length === 1;
    const singleBandStretch = stretchRange && Number.isFinite(stretchRange.min) && Number.isFinite(stretchRange.max)
        ? stretchRange
        : (isSingleBand ? computePercentileStretch(bands[0], nodataValue) : null);

    const pixelCount = width * height;
    const rgba = new Uint8ClampedArray(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
        const hasRgb = bands.length >= 3;
        const rSrc = hasRgb ? bands[0][i] : bands[0]?.[i];
        const gSrc = hasRgb ? bands[1][i] : bands[0]?.[i];
        const bSrc = hasRgb ? bands[2][i] : bands[0]?.[i];

        let r;
        let g;
        let b;
        if (isSingleBand) {
            if (isNoDataValue(rSrc, nodataValue)) {
                const p = i * 4;
                rgba[p] = 0;
                rgba[p + 1] = 0;
                rgba[p + 2] = 0;
                rgba[p + 3] = 0;
                continue;
            }
            const v = stretchToByte(rSrc, singleBandStretch?.min ?? 0, singleBandStretch?.max ?? 1);
            // 单波段红绿拉伸：低值偏绿，高值偏红。
            r = v;
            g = 255 - v;
            b = 0;
        } else {
            r = stretchToByte(rSrc, bandStats[0]?.min ?? 0, bandStats[0]?.max ?? 1);
            g = stretchToByte(gSrc, bandStats[Math.min(1, bandStats.length - 1)]?.min ?? 0, bandStats[Math.min(1, bandStats.length - 1)]?.max ?? 1);
            b = stretchToByte(bSrc, bandStats[Math.min(2, bandStats.length - 1)]?.min ?? 0, bandStats[Math.min(2, bandStats.length - 1)]?.max ?? 1);
        }
        const a = bands.length >= 4
            ? stretchToByte(bands[3][i], alphaStats.min, alphaStats.max)
            : 255;

        const p = i * 4;
        rgba[p] = r;
        rgba[p + 1] = g;
        rgba[p + 2] = b;
        rgba[p + 3] = a;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布渲染上下文');
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);

    const pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((out) => {
            if (out) resolve(out);
            else reject(new Error('无法生成影像预览')); 
        }, 'image/png');
    });
    const pngUrl = URL.createObjectURL(pngBlob);

    const view = mapInstance.value.getView();
    const layerProjection = projection || view.getProjection();
    const center = view.getCenter() || fromLonLat(INITIAL_VIEW.center);
    const resolution = view.getResolution() || 1;
    const extent = imageExtent && imageExtent.every(v => Number.isFinite(v))
        ? imageExtent
        : [
            center[0] - (width * resolution) / 2,
            center[1] - (height * resolution) / 2,
            center[0] + (width * resolution) / 2,
            center[1] + (height * resolution) / 2
        ];

    const layer = new ImageLayer({
        source: new ImageStatic({
            url: pngUrl,
            imageExtent: extent,
            projection: layerProjection
        }),
        zIndex: 120,
        properties: { name }
    });

    mapInstance.value.addLayer(layer);
    const rasterSampler = createExtentRasterSampler({
        bands,
        width,
        height,
        extent,
        projection: layerProjection,
        nodataValue
    });
    const id = addManagedLayerRecord({
        name,
        type,
        sourceType,
        featureCount: 1,
        styleConfig: null,
        metadata: {
            ...(metadata || {}),
            rasterSampler,
            rasterBandCount: bands.length,
            sourceProjection: layerProjection,
            sourceExtent: extent
        },
        layer
    });

    if (fitView) {
        const fitExtent = projectExtentToMapView(extent, layerProjection) || extent;
        mapInstance.value.getView().fit(fitExtent, {
            padding: [50, 50, 50, 50],
            duration: 700,
            maxZoom: 18
        });
    }

    if (alertMessage) {
        alert(alertMessage);
    }
    return id;
}

async function createManagedRasterLayer({
    name,
    type,
    sourceType,
    data,
    fitView = false
}) {
    if (!mapInstance.value || !(data instanceof ArrayBuffer)) return null;

    const blob = new Blob([data], { type: 'image/tiff' });
    const geotiffFromBlob = await getGeotiffFromBlob();
    const GeoTIFFSource = await getGeoTIFFSourceCtor();

    let sampleBandCount = 0;
    let nodataValue = null;
    let singleBandStretch = null;
    let firstImageRef = null;
    try {
        const tiff = await geotiffFromBlob(blob);
        const firstImage = await tiff.getImage();
        firstImageRef = firstImage;
        sampleBandCount = Number(
            firstImage?.getSamplesPerPixel?.() ?? firstImage?.fileDirectory?.SamplesPerPixel ?? 0
        );
        const nd = firstImage?.getGDALNoData?.();
        nodataValue = Number.isFinite(nd) ? nd : null;

        if (sampleBandCount === 1) {
            const singleBandData = await firstImage.readRasters({ samples: [0], interleave: true });
            singleBandStretch = computePercentileStretch(singleBandData, nodataValue, 2, 98);
        }
    } catch (e) {
        sampleBandCount = 0;
        nodataValue = null;
        singleBandStretch = null;
    }

    const sourceInfo = { blob };
    if (sampleBandCount === 1 && nodataValue !== null) {
        sourceInfo.nodata = nodataValue;
    }
    const source = new GeoTIFFSource({
        convertToRGB: 'auto',
        normalize: sampleBandCount === 1 ? false : undefined,
        sources: [sourceInfo]
    });

    let viewCfg = null;
    let hasGeorefExtent = false;
    try {
        viewCfg = await source.getView();
        hasGeorefExtent = !!(viewCfg?.extent && viewCfg.extent.every(v => Number.isFinite(v)));
    } catch (e) {
        hasGeorefExtent = false;
    }

    if (!hasGeorefExtent) {
        return createNonGeorefTiffLayer({
            blob,
            name,
            type,
            sourceType,
            fitView,
            alertMessage: sampleBandCount === 1
                ? '该 TIF 为单波段且未检测到坐标参考，已按当前视图中心临时加载。'
                : '该 TIF 未检测到坐标参考，已按当前视图中心临时加载。',
            metadata: {
                noGeorefFallback: true,
                singleBandRendered: sampleBandCount === 1
            },
            nodataValue,
            stretchRange: singleBandStretch
        });
    }

    const layerOptions = {
        source,
        zIndex: 120,
        properties: { name }
    };
    if (sampleBandCount === 1) {
        // 单波段红绿拉伸：低值绿，高值红；保持 GeoTIFF 原生地理参考定位。
        const minVal = Number.isFinite(singleBandStretch?.min) ? singleBandStretch.min : 0;
        const maxVal = Number.isFinite(singleBandStretch?.max) ? singleBandStretch.max : 1;
        const midVal = (minVal + maxVal) / 2;
        const baseColorExpr = [
            'interpolate',
            ['linear'],
            ['band', 1],
            minVal, ['color', 32, 164, 72, 1],
            midVal, ['color', 254, 224, 139, 1],
            maxVal, ['color', 215, 25, 28, 1]
        ];
        layerOptions.style = {
            color: nodataValue !== null
                ? ['case', ['==', ['band', 1], nodataValue], ['color', 0, 0, 0, 0], baseColorExpr]
                : baseColorExpr
        };
    }

    const layer = new WebGLTileLayer(layerOptions);

    mapInstance.value.addLayer(layer);
    const rasterSampler = createGeoTiffSampler({
        image: firstImageRef,
        projection: viewCfg?.projection,
        nodataValue
    });
    const id = addManagedLayerRecord({
        name,
        type,
        sourceType,
        featureCount: 1,
        styleConfig: null,
        metadata: {
            rasterSampler,
            rasterBandCount: sampleBandCount,
            nodataValue,
            sourceProjection: viewCfg?.projection,
            sourceExtent: viewCfg?.extent
        },
        layer
    });

    if (fitView && mapInstance.value) {
        const fitExtent = projectExtentToMapView(viewCfg.extent, viewCfg.projection) || viewCfg.extent;
        mapInstance.value.getView().fit(fitExtent, {
            padding: [50, 50, 50, 50],
            duration: 900,
            maxZoom: 18
        });
    }

    return id;
}

function isTiffType(type) {
    const normalized = String(type || '').toLowerCase();
    return normalized === 'tif' || normalized === 'tiff';
}

// --- 1. 地图核心逻辑 ---
function initMap() {
    // 1.1 源定义与图层初始化 (由 LAYER_CONFIGS 动态驱动，不再硬编码 sources 对象)
    
    // 初始化所有底图层
    layerList.value.forEach((item, index) => {
        // 根据 id 查找配置并创建 source
        const config = LAYER_CONFIGS.find(cfg => cfg.id === item.id);
        const source = config ? config.createSource() : null;

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
    mapInstance.value = new Map({
        target: mapRef.value,
        layers: [...layersToAdd, drawLayerInstance, userLayer, searchLayer],
        view: new View({
            center: fromLonLat(INITIAL_VIEW.center),
            zoom: INITIAL_VIEW.zoom,
            minZoom: 0,  // 允许缩放到最低级别
            maxZoom: 22
        }),
        controls
    });

    // 1.5 事件监听
    bindEvents();

    // 1.6 监听底图切换 (保留原Select功能，但改为操作 layerList)
    watch(selectedLayer, (val) => {
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
    });

    // 1.7 初始化时也要刷新一次图层状态，确保初始配置正确应用
    refreshLayersState();
    emitUserLayersChange();
}

function refreshLayersState() {
     layerList.value.forEach((item, index) => {
        const layer = layerInstances[item.id];
        if (layer) {
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
function onDragStart(evt, index) {
    draggingIndex.value = index;
    evt.dataTransfer.effectAllowed = 'move';
}

function onDrop(evt, dropIndex) {
    const dragIndex = draggingIndex.value;
    if (dragIndex === dropIndex) return;
    
    // 移动数组元素
    const item = layerList.value.splice(dragIndex, 1)[0];
    layerList.value.splice(dropIndex, 0, item);
    
    draggingIndex.value = -1;
    refreshLayersState();
}

function updateLayerVisibility(layer) {
    // 只是触发刷新
    refreshLayersState();
}

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
}

// --- 2. 业务逻辑 (区域图片) ---
function checkAreaLogic(coord, pixel) {
    if (!mapInstance.value) return;
    const view = mapInstance.value.getView();

    // 如果没有传入坐标（例如只是缩放触发），获取中心点或鼠标最后位置，这里简化处理
    if (!coord) return;

    const zoom = view.getZoom();
    const lonLat = toLonLat(coord);
    const [lon, lat] = lonLat;

    const isInArea =
        lon >= DIHUAN_BOUNDS.minLon && lon <= DIHUAN_BOUNDS.maxLon &&
        lat >= DIHUAN_BOUNDS.minLat && lat <= DIHUAN_BOUNDS.maxLat;

    // 只有在特定区域且层级够大时才显示
    if (zoom >= 17 && isInArea) {
        showImageSet.value = true;
        // 使用 OpenLayers 的像素位置，比 clientX 更准，且相对于地图容器
        if (pixel) {
            imageSetPosition.value = { x: pixel[0] + 15, y: pixel[1] + 15 };
        }
    } else {
        showImageSet.value = false;
        if (!showLargeImg.value) showImageSet.value = false;
    }

    emit('location-change', { isInDihuan: isInArea, lonLat });
}

function showLargeImage(src) {
    largeImageSrc.value = src;
    showLargeImg.value = true;
    emit('update-news-image', src);
}

function closeLargeImage() {
    showLargeImg.value = false;
    largeImageSrc.value = '';
}

// --- 3. 关键修复：复位与定位逻辑 ---

/**
 * 统一处理按钮点击交互
 * 逻辑：单击启动300ms定时器，如果期间再次点击，则取消定时器并执行双击逻辑(定位)
 * 否则执行单击逻辑(复位)
 */
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

function resetView() {
    mapInstance.value?.getView().animate({
        center: fromLonLat(INITIAL_VIEW.center),
        zoom: INITIAL_VIEW.zoom,
        duration: 800
    });
}

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
        alert('URL格式错误或无法解析');
    }
}

// Promise 化获取当前位置
function getCurrentLocation(enableHighAccuracy = true) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));

        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
                lon: pos.coords.longitude,
                lat: pos.coords.latitude,
                accuracy: pos.coords.accuracy
            }),
            (err) => reject(err),
            { enableHighAccuracy, timeout: 5000 }
        );
    });
}

async function zoomToUser() {
    try {
        const pos = await getCurrentLocation();
        updateUserPosition(pos, true);
    } catch (err) {
        console.warn('定位失败:', err.message);
        alert('无法获取您的位置，请确保允许定位权限。');
    }
}

// 将位置写入用户图层；animate 为 true 时会平滑缩放到该位置
function updateUserPosition(pos, animate = false) {
    if (!pos || !mapInstance.value) return;
    const coord = fromLonLat([pos.lon, pos.lat]);

    userLocationSource.clear();
    userLocationSource.addFeature(new Feature({
        geometry: new CircleGeom(coord, pos.accuracy || 30),
        type: 'accuracy'
    }));
    userLocationSource.addFeature(new Feature({
        geometry: new Point(coord),
        type: 'position'
    }));

    if (animate && mapInstance.value) {
        mapInstance.value.getView().animate({ center: coord, zoom: 18, duration: 1000 });
    }
}

//地名搜索
// --- 辅助函数：标准化单个天地图数据项 ---
// 天地图 API 返回的字段非常不统一（lon/lng/x, name/title/address），这里统一清洗为标准格式
function normalizeTiandituItem(item) {
    if (!item) return null;

    // 1. 解析名称
    const name = item.name || item.poiName || item.areaName || item.displayName || item.title || item.address || item.keyWord || '未知地点';

    // 2. 解析坐标
    let lon = item.lon || item.lng || item.x;
    let lat = item.lat || item.latit || item.y;

    // 处理 "113.5,34.5" 这种字符串格式的 lonlat
    if ((!lon || !lat) && item.lonlat) {
        const parts = String(item.lonlat).split(',');
        if (parts.length >= 2) {
            lon = parts[0];
            lat = parts[1];
        }
    }

    // 3. 确保坐标有效
    if (!lon || !lat || isNaN(parseFloat(lon)) || isNaN(parseFloat(lat))) {
        return null;
    }

    return {
        display_name: name,
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        original: item // 保留原始数据以备不时之需
    };
}

// 高德返回的坐标是 GCJ-02，这里转换为 WGS84 后再用于绘制。
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lon, lat) {
    return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lon, lat) {
    let ret = -100.0 + 2.0 * lon + 3.0 * lat + 0.2 * lat * lat + 0.1 * lon * lat + 0.2 * Math.sqrt(Math.abs(lon));
    ret += (20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lat * PI) + 40.0 * Math.sin(lat / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(lat / 12.0 * PI) + 320 * Math.sin(lat * PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLon(lon, lat) {
    let ret = 300.0 + lon + 2.0 * lat + 0.1 * lon * lon + 0.1 * lon * lat + 0.1 * Math.sqrt(Math.abs(lon));
    ret += (20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lon * PI) + 40.0 * Math.sin(lon / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(lon / 12.0 * PI) + 300.0 * Math.sin(lon / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
}

function gcj02ToWgs84(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [lon, lat];
    if (outOfChina(lon, lat)) return [lon, lat];
    let dLat = transformLat(lon - 105.0, lat - 35.0);
    let dLon = transformLon(lon - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLon = (dLon * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
    const mgLat = lat + dLat;
    const mgLon = lon + dLon;
    return [lon * 2 - mgLon, lat * 2 - mgLat];
}

// --- 核心封装：解析天地图复杂的 JSON 响应 ---
function parseTiandituResponse(data) {
    if (!data) return [];

    let rawList = [];

    // 优先级 1: 行政区划 (精确匹配) - resultType 可能为 3
    if (data.area) {
        rawList = [data.area];
    }
    // 优先级 2: 行政区划列表
    else if (Array.isArray(data.areas)) {
        rawList = data.areas;
    }
    // 优先级 3: POI 列表 (最常见) - resultType 可能为 1
    else if (Array.isArray(data.pois)) {
        rawList = data.pois;
    }
    // 优先级 4: 统计结果中的详细列表
    else if (data.queryResults && Array.isArray(data.queryResults.results)) {
        rawList = data.queryResults.results;
    }
    // 优先级 5: 通用结果列表
    else if (Array.isArray(data.results)) {
        rawList = data.results;
    }
    // 优先级 6: data 字段
    else if (Array.isArray(data.data)) {
        rawList = data.data;
    }
    // 兜底：如果 data 本身就是数组
    else if (Array.isArray(data)) {
        rawList = data;
    }
    // 最后的兜底：如果上面都没命中，且 data 看起来不像是一个错误信息，可以考虑打印日志
    else {
        // 如果需要调试，可以取消注释
        // console.warn('未识别的天地图响应结构', data); 
        return [];
    }

    // 统一清洗数据，并过滤掉无效坐标
    return rawList
        .map(normalizeTiandituItem)
        .filter(item => item !== null);
}

// --- 5. 地名搜索功能 (主逻辑) ---
async function fetchLocationResults({ service, keywords, page = 1, pageSize = 10, amapKey = '' }) {
    if (!keywords) {
        return { items: [], total: 0 };
    }

    return searchByService(service, keywords, page, pageSize, amapKey);
}

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

async function searchWithTianditu(q, page = 1, pageSize = 10) {
    const postObj = {
        keyWord: q,
        level: 12,
        mapBound: getCurrentMapBound(),
        queryType: 1,
        start: Math.max(0, (page - 1) * pageSize),
        count: pageSize
    };

    const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(JSON.stringify(postObj))}&type=query&tk=${TIANDITU_TK}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const data = await res.json();
    const items = parseTiandituResponse(data);
    const total = Number(data?.count ?? items.length);
    return { items, total: Number.isFinite(total) ? total : items.length };
}

async function searchWithNominatim(q, page = 1, pageSize = 10) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=${pageSize}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim Error: ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data)
        ? data.map(item => ({
            name: item.display_name,
            address: item.display_name,
            display_name: item.display_name,
            lon: parseFloat(item.lon),
            lat: parseFloat(item.lat)
        }))
        : [];
    const total = page === 1 ? items.length : Math.max(items.length + (page - 1) * pageSize, items.length);
    return { items, total };
}

async function searchWithAmap(q, page = 1, pageSize = 10, amapKey = '') {
    const apiKey = String(amapKey || '').trim();
    if (!apiKey) {
        throw new Error('高德 Web 服务 Key 未配置');
    }

    const data = await searchAmapPlaces({
        key: apiKey,
        keywords: q,
        page,
        offset: pageSize
    });

    const pois = Array.isArray(data?.pois) ? data.pois : [];
    const items = pois.map((poi) => {
        const location = String(poi.location || '').split(',');
        const gcjLon = Number.parseFloat(location[0]);
        const gcjLat = Number.parseFloat(location[1]);
        const [wgsLon, wgsLat] = gcj02ToWgs84(gcjLon, gcjLat);
        return {
            id: poi.id,
            name: poi.name,
            address: poi.address || poi.pname || '',
            display_name: `${poi.name}${poi.address ? ` - ${poi.address}` : ''}`,
            lon: Number.isFinite(wgsLon) ? wgsLon : undefined,
            lat: Number.isFinite(wgsLat) ? wgsLat : undefined,
            gcjLon: Number.isFinite(gcjLon) ? gcjLon : undefined,
            gcjLat: Number.isFinite(gcjLat) ? gcjLat : undefined,
            coordSystem: 'wgs84'
        };
    });

    const total = Number(data?.count ?? items.length);
    return { items, total: Number.isFinite(total) ? total : items.length };
}

async function searchByService(service, q, page = 1, pageSize = 10, amapKey = '') {
    if (service === 'tianditu') {
        return searchWithTianditu(q, page, pageSize);
    }
    if (service === 'nominatim') {
        return searchWithNominatim(q, page, pageSize);
    }
    if (service === 'amap') {
        return searchWithAmap(q, page, pageSize, amapKey);
    }
    throw new Error(`未知搜索服务: ${service}`);
}

function selectResult(item) {
    if (!mapInstance.value || !item) return;
    // 支持不同来源字段（Nominatim 返回 lon/lat；天地图可能返回 lon/lat 或 x/y）
    const lonVal = item.lon ?? item.x ?? item.lng ?? item.lonlat?.split?.(',')?.[0];
    const latVal = item.lat ?? item.y ?? item.latit ?? item.lonlat?.split?.(',')?.[1];
    const lon = lonVal != null ? parseFloat(lonVal) : NaN;
    const lat = latVal != null ? parseFloat(latVal) : NaN;
    if (Number.isNaN(lon) || Number.isNaN(lat)) {
        alert('无法解析该结果的坐标');
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

async function parseUploadedFeatures({ content, type }) {
    if (type === 'kml') {
        const kmlFormat = new KML({ extractStyles: false });
        return kmlFormat.readFeatures(content, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
    }

    if (type === 'kmz') {
        const kmzBuffer = content instanceof ArrayBuffer ? content : null;
        if (!kmzBuffer) throw new Error('KMZ 数据读取失败');

        const JSZipCtor = await getJSZipCtor();
        const zip = await JSZipCtor.loadAsync(new Uint8Array(kmzBuffer));
        const kmlEntries = Object.values(zip.files).filter(
            (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.kml')
        );
        const kmlEntry = kmlEntries.find((entry) => entry.name.split('/').pop()?.toLowerCase() === 'doc.kml')
            || kmlEntries.sort((a, b) => a.name.length - b.name.length)[0];
        if (!kmlEntry) throw new Error('KMZ 中未找到 KML 文件');

        const kmlBuffer = await kmlEntry.async('arraybuffer');
        const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(kmlBuffer);
        const hasReplacementChar = utf8Text.includes('\uFFFD');
        const kmlText = hasReplacementChar
            ? (() => {
                try {
                    return new TextDecoder('gbk', { fatal: false }).decode(kmlBuffer);
                } catch {
                    return utf8Text;
                }
            })()
            : utf8Text;

        const kmlFormat = new KML({ extractStyles: false });
        return kmlFormat.readFeatures(kmlText, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
    }

    if (type === 'geojson' || type === 'json') {
        const gjFormat = new GeoJSON();
        return gjFormat.readFeatures(content, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
    }

    if (type === 'zip') {
        const shp = await getShpParser();
        const geojson = await shp(content);
        const gjFormat = new GeoJSON();
        const featureCollection = Array.isArray(geojson)
            ? { type: 'FeatureCollection', features: geojson.flatMap(item => item.features || []) }
            : geojson;
        return gjFormat.readFeatures(featureCollection, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
    }

    if (type === 'shp') {
        const shp = await getShpParser();
        const geojson = await shp({ shp: content });
        const gjFormat = new GeoJSON();
        return gjFormat.readFeatures(geojson, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
    }

    throw new Error(`不支持的文件类型: ${type}`);
}

async function addUserDataLayer({ content, type, name }) {
    if (!mapInstance.value) return;
    try {
        if (isTiffType(type)) {
            const tifName = name || `栅格_${Date.now()}.tif`;
            const buffer = content instanceof ArrayBuffer ? content : null;
            if (!buffer) throw new Error('TIF 数据读取失败');

            await createManagedRasterLayer({
                name: tifName,
                type,
                sourceType: 'upload',
                data: buffer,
                fitView: true
            });
            return;
        }

        const features = await parseUploadedFeatures({ content, type });

        if (!features.length) throw new Error('无有效数据');

        createManagedVectorLayer({
            name,
            type,
            sourceType: 'upload',
            features,
            styleConfig: STYLE_TEMPLATES.classic,
            autoLabel: true,
            fitView: true
        });
    } catch (e) {
        const kmzHint = String(type || '').toLowerCase() === 'kmz'
            ? '\n提示：请将 KMZ 文件解压为 KML 后再上传。'
            : '';
        alert('文件解析失败: ' + e.message + kmzHint);
    }
}

function setUserLayerVisibility(layerId, visible) {
    const target = userDataLayers.find(item => item.id === layerId);
    if (!target) return;
    target.visible = !!visible;
    target.layer.setVisible(target.visible);
    emitUserLayersChange();
}

function setUserLayerOpacity(layerId, opacity) {
    const target = userDataLayers.find(item => item.id === layerId);
    if (!target) return;
    const val = Math.min(1, Math.max(0, Number(opacity)));
    target.opacity = Number.isFinite(val) ? val : 1;
    target.layer.setOpacity(target.opacity);
    emitUserLayersChange();
}

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

function setUserLayerStyle({ layerId, styleConfig }) {
    const target = userDataLayers.find(item => item.id === layerId);
    if (!target) return;
    if (typeof target.layer?.setStyle !== 'function') {
        alert('当前图层类型不支持矢量样式编辑');
        return;
    }
    target.styleConfig = mergeStyleConfig(target.styleConfig, styleConfig);
    const features = target.layer.getSource()?.getFeatures?.() || [];
    features.forEach(feature => {
        feature.setStyle(undefined);
    });
    applyManagedLayerStyle(target);
    emitUserLayersChange();
}

function setUserLayerLabelVisibility({ layerId, visible }) {
    const target = userDataLayers.find(item => item.id === layerId);
    if (!target || !target.autoLabel) return;
    target.labelVisible = !!visible;
    applyManagedLayerStyle(target);
    emitUserLayersChange();
}

function applyStyleTemplate({ target, layerId, templateId }) {
    const tpl = STYLE_TEMPLATES[templateId];
    if (!tpl) return;
    if (target === 'draw') {
        setDrawStyle(tpl);
        return;
    }
    if (target === 'layer' && layerId) {
        setUserLayerStyle({ layerId, styleConfig: tpl });
    }
}

function setBaseLayerActive(layerId) {
    const target = layerList.value.find(item => item.id === layerId);
    if (!target) return;
    if (getLayerCategory(layerId) !== 'base') return;
    selectedLayer.value = layerId;
}

function setLayerVisibility(layerId, visible) {
    const target = layerList.value.find(item => item.id === layerId);
    if (!target) return;
    target.visible = !!visible;
    refreshLayersState();
}

function zoomToUserLayer(layerId) {
    if (!mapInstance.value) return;

    const target = userDataLayers.find(item => item.id === layerId);
    if (!target) return;
    const source = target.layer.getSource?.();
    const fitExtent = (extent) => {
        if (!extent || extent.some(v => !Number.isFinite(v))) return;
        const projected = projectExtentToMapView(extent, target.metadata?.sourceProjection) || extent;
        mapInstance.value.getView().fit(projected, {
            padding: [80, 80, 80, 80],
            duration: 800,
            maxZoom: 18
        });
    };

    const extent = source?.getExtent?.();
    if (extent && extent.every(v => Number.isFinite(v))) {
        fitExtent(extent);
        return;
    }

    if (typeof source?.getView === 'function') {
        source.getView().then((viewCfg) => {
            if (viewCfg?.projection) {
                target.metadata = { ...(target.metadata || {}), sourceProjection: viewCfg.projection };
            }
            fitExtent(viewCfg?.extent);
        }).catch(() => {});
    }
}

function removeUserLayer(layerId) {
    if (!mapInstance.value) return;

    const idx = userDataLayers.findIndex(item => item.id === layerId);
    if (idx < 0) return;
    mapInstance.value.removeLayer(userDataLayers[idx].layer);
    userDataLayers.splice(idx, 1);
    refreshUserLayerZIndex();
    emitUserLayersChange();
    emitGraphicsOverview();
}

function reorderUserLayers({ fromId, toId }) {
    const fromIndex = userDataLayers.findIndex(item => item.id === fromId);
    const toIndex = userDataLayers.findIndex(item => item.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const moved = userDataLayers.splice(fromIndex, 1)[0];
    userDataLayers.splice(toIndex, 0, moved);
    refreshUserLayerZIndex();
    emitUserLayersChange();
}

function soloUserLayer(layerId) {
    userDataLayers.forEach(item => {
        item.visible = item.id === layerId;
        item.layer.setVisible(item.visible);
    });
    emitUserLayersChange();
}

function viewUserLayer(layerId) {
    const target = userDataLayers.find(item => item.id === layerId);
    if (!target) return;
    const payload = {
        图层名称: target.name,
        图层类型: target.type,
        可见状态: target.visible ? '显示' : '隐藏',
        要素数量: target.featureCount
    };
    if (Number.isFinite(target.metadata?.longitude) && Number.isFinite(target.metadata?.latitude)) {
        payload.经度 = Number(target.metadata.longitude).toFixed(6);
        payload.纬度 = Number(target.metadata.latitude).toFixed(6);
    }
    emit('feature-selected', payload);
}

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

function clearInteractions() {
    if (!mapInstance.value) return;
    if (drawInteraction) mapInstance.value.removeInteraction(drawInteraction);
    if (snapInteraction) mapInstance.value.removeInteraction(snapInteraction);
    if (helpTooltipOverlay) mapInstance.value.removeOverlay(helpTooltipOverlay);
    drawInteraction = null;
    snapInteraction = null;
    helpTooltipEl = null;
}

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

const formatLength = (line) => {
    const len = getLength(line);
    return len > 100 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(2)} m`;
};
const formatArea = (poly) => {
    const area = getArea(poly);
    return area > 10000 ? `${(area / 1000000).toFixed(2)} km²` : `${area.toFixed(2)} m²`;
};

defineExpose({
    addUserDataLayer,
    activateInteraction,
    clearInteractions,
    setDrawStyle,
    setUserLayerStyle,
    applyStyleTemplate,
    setUserLayerVisibility,
    setUserLayerOpacity,
    setUserLayerLabelVisibility,
    setBaseLayerActive,
    setLayerVisibility,
    zoomToUserLayer,
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