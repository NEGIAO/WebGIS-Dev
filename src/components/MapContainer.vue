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
            <select v-model="selectedLayer" class="layer-select">
                <option value="local">自定义瓦片</option>
                <option value="tianDiTu_vec">天地图矢量</option>
                <option value="tianDiTu">天地图影像</option>
                <option value="google">Google</option>
                <option value="esri">ESRI</option>
                <option value="osm">OSM</option>
                <option value="amap">高德地图</option>
                <option value="tengxun">腾讯地图</option>
            </select>
        </div>

        <!-- 底部控制栏 -->
        <div class="map-controls-group">
            <div ref="mousePositionRef" class="mouse-position-content"></div>
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
import { ref, onMounted, onUnmounted, shallowRef, watch } from 'vue';

// OpenLayers 核心库
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Overlay from 'ol/Overlay';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls, ScaleLine, MousePosition } from 'ol/control';
import { createStringXY } from 'ol/coordinate';
import { unByKey } from 'ol/Observable';
import { getArea, getLength } from 'ol/sphere';

// 图层与数据源
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';

// 几何与交互
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
import { LineString, Polygon } from 'ol/geom';
import { Draw, Snap } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';

// --- 配置常量 ---
const BASE_URL = import.meta.env.BASE_URL || '/';
const NORM_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const INITIAL_VIEW = { center: [114.302, 34.8146], zoom: 17 };
const CHINA_CENTER = [104.1954, 35.8617];

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
const showImageSet = ref(false);
const imageSetPosition = ref({ x: 0, y: 0 });
const showLargeImg = ref(false);
const largeImageSrc = ref('');
const images = ref(IMAGES);

// --- 全局变量 (非响应式) ---
let drawInteraction, snapInteraction;
let measureTooltipEl, measureTooltipOverlay;
let helpTooltipEl, helpTooltipOverlay;
let sketchFeature;
let geolocationWatchId = null;
let homeClickTimer = null; // 用于处理单击双击冲突

// 图层引用
let baseLayer, labelLayer;
const drawSource = new VectorSource();
const userLocationSource = new VectorSource();

const emit = defineEmits(['location-change', 'update-news-image', 'feature-selected']);

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
onMounted(() => {
    initMap();
    // 初始尝试定位并将默认视图设置为用户位置（若允许）
    getCurrentLocation(false).then((pos) => {
        if (mapInstance.value) {
            const coord = fromLonLat([pos.lon, pos.lat]);
            mapInstance.value.getView().animate({ center: coord, zoom: 18, duration: 800 });
        }
    }).catch(() => console.log('Initial location check skipped'));
});

onUnmounted(() => {
    if (geolocationWatchId) navigator.geolocation.clearWatch(geolocationWatchId);
    if (mapInstance.value) mapInstance.value.setTarget(null);
});

// --- 1. 地图核心逻辑 ---
function initMap() {
    // 1.1 源定义
    const sources = {
        local: new XYZ({ url: `${NORM_BASE}tiles/{z}/{x}/{y}.png` }),
        osm: new OSM(),
        amap: new XYZ({ url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}' }),
        google: new XYZ({ url: 'https://mt3v.gggis.com/maps/vt?lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 }),
        esri: new XYZ({ url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 20 }),
        tengxun: new XYZ({ url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0' }),
        tianDiTu: new XYZ({ url: 'https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb' }),
        tianDiTu_vec: new XYZ({ url: 'https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb' }),
        label: new XYZ({ url: 'https://t0.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb' }),
    };

    // 1.2 图层初始化
    baseLayer = new TileLayer({ source: sources['google'] });
    labelLayer = new TileLayer({ source: null, visible: false, zIndex: 1 });
    const drawLayer = new VectorLayer({ source: drawSource, style: styles.draw, zIndex: 999 });
    const userLayer = new VectorLayer({
        source: userLocationSource,
        zIndex: 1000,
        style: (feature) => feature.get('type') === 'accuracy' ? styles.userAccuracy : styles.userPoint
    });

    // 1.3 控件
    const controls = defaultControls({ zoom: false }).extend([
        new ScaleLine({ units: 'metric', bar: true, minWidth: 100 }),
        new MousePosition({
            coordinateFormat: createStringXY(4),
            projection: 'EPSG:4326',
            target: mousePositionRef.value,
            undefinedHTML: '&nbsp;'
        })
    ]);

    // 1.4 实例化地图
    mapInstance.value = new Map({
        target: mapRef.value,
        layers: [baseLayer, labelLayer, drawLayer, userLayer],
        view: new View({
            center: fromLonLat(INITIAL_VIEW.center),
            zoom: INITIAL_VIEW.zoom,
            maxZoom: 22
        }),
        controls
    });

    // 1.5 事件监听
    bindEvents();

    // 1.6 监听底图切换
    watch(selectedLayer, (val) => {
        const needsLabel = ['tianDiTu_vec', 'tianDiTu', 'google', 'esri'].includes(val);
        labelLayer.setVisible(needsLabel);
        if (needsLabel) labelLayer.setSource(sources.label);
        baseLayer.setSource(sources[val] || sources.osm);
    });
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

    map.on('singleclick', (evt) => {
        if (drawInteraction && drawInteraction.getActive()) return;

        // 属性查询
        const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
        if (feature) {
            const { geometry, style, ...props } = feature.getProperties();
            emit('feature-selected', props);
        }
    });

    // 缩放监听
    map.getView().on('change:resolution', () => checkAreaLogic());
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
        const coord = fromLonLat([pos.lon, pos.lat]);

        // 更新用户位置图层
        userLocationSource.clear();
        userLocationSource.addFeature(new Feature({
            geometry: new CircleGeom(coord, pos.accuracy),
            type: 'accuracy'
        }));
        userLocationSource.addFeature(new Feature({
            geometry: new Point(coord),
            type: 'position'
        }));

        // 缩放跳转
        if (mapInstance.value) {
            mapInstance.value.getView().animate({
                center: coord,
                zoom: 18,
                duration: 1000
            });
        }
    } catch (err) {
        console.warn('定位失败:', err.message);
        alert('无法获取您的位置，请确保允许定位权限。');
    }
}

// --- 4. 外部接口 (文件导入/绘图) ---

function addUserDataLayer({ content, type, name }) {
    if (!mapInstance.value) return;
    try {
        const format = type === 'kml' ? new KML({ extractStyles: true }) : new GeoJSON();
        // 自动转换坐标系 EPSG:4326 -> EPSG:3857
        const features = format.readFeatures(content, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });

        if (!features.length) throw new Error('无有效数据');

        const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
        const layer = new VectorLayer({
            source: new VectorSource({ features }),
            zIndex: 100,
            style: new Style({
                stroke: new Stroke({ color: randomColor, width: 2 }),
                fill: new Fill({ color: 'rgba(255,255,255,0.2)' }),
                image: new CircleStyle({ radius: 5, fill: new Fill({ color: randomColor }) })
            }),
            properties: { name }
        });

        mapInstance.value.addLayer(layer);
        mapInstance.value.getView().fit(layer.getSource().getExtent(), { padding: [50, 50, 50, 50], duration: 1000 });
    } catch (e) {
        alert('文件解析失败: ' + e.message);
    }
}

// --- 交互工具 (Draw/Measure) ---
function activateInteraction(type) {
    clearInteractions();
    if (!mapInstance.value) return;
    if (type === 'Clear') {
        drawSource.clear();
        mapInstance.value.getOverlays().clear();
        return;
    }

    const isMeasure = ['MeasureDistance', 'MeasureArea'].includes(type);
    const drawType = type === 'MeasureDistance' ? 'LineString' : (type === 'MeasureArea' ? 'Polygon' : type);

    drawInteraction = new Draw({
        source: drawSource,
        type: drawType,
        style: styles.draw
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

defineExpose({ addUserDataLayer, activateInteraction, clearInteractions });
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

.layer-select {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    outline: none;
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
</style>