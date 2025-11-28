<template>
    <div class="map-container" ref="mapContainerRef">
        <div id="map" ref="mapRef"></div>
        
        <!-- Image Set Overlay -->
        <div 
            class="imageset" 
            v-show="showImageSet"
            :style="{ left: imageSetPosition.x + 'px', top: imageSetPosition.y + 'px' }"
        >
            <img 
                v-for="(img, index) in images" 
                :key="index"
                :src="img"
                class="thumbnail"
                @click.stop="showLargeImage(img, $event)"
            />
        </div>

        <!-- Large Image Overlay -->
        <img 
            v-if="largeImageSrc"
            v-show="showLargeImg"
            :src="largeImageSrc" 
            class="large-image"
            :style="{ left: largeImagePosition.x + 'px', top: largeImagePosition.y + 'px' }"
            alt="Large Image"
        >
        
        <!-- Layer Switcher -->
        <div class="layer-switcher">
            <select v-model="selectedLayer" class="layer-select">
                <option value="local">本地瓦片</option>
                <option value="tianDiTu_vec">天地图矢量</option>
                <option value="tianDiTu">天地图影像</option>
                <option value="google">Google</option>
                <option value="esri">ESRI</option>
                <option value="osm">OSM</option>
                <option value="amap">高德地图</option>
                <option value="tengxun">腾讯地图</option>
            </select>
        </div>

        <!-- Mouse Position and Home Button Group -->
        <div class="map-controls-group">
            <div ref="mousePositionRef" class="mouse-position-content"></div>
            <div class="divider"></div>
            <button class="home-btn" @click="resetView" title="回到初始位置">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, watch, shallowRef } from 'vue';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import { fromLonLat, toLonLat } from 'ol/proj';
import MousePosition from 'ol/control/MousePosition';
import { createStringXY } from 'ol/coordinate';
import ScaleLine from 'ol/control/ScaleLine';
import { defaults as defaultControls } from 'ol/control';

const emit = defineEmits(['location-change', 'update-news-image']);

const mapRef = ref(null);
const mousePositionRef = ref(null);
const mapContainerRef = ref(null);
const mapInstance = shallowRef(null);

const selectedLayer = ref('local');
const showImageSet = ref(false);
const imageSetPosition = ref({ x: 0, y: 0 });
const showLargeImg = ref(false);
const largeImageSrc = ref('');
const largeImagePosition = ref({ x: 0, y: 0 });
const currentMousePosition = ref({ x: 0, y: 0 });

const initialCenter = [114.302, 34.8146];
const initialZoom = 17;

const images = [
    '/images/地理与环境学院标志牌.jpg',
    '/images/地理与环境学院入口.jpg',
    '/images/地学楼.jpg',
    '/images/教育部重点实验室.jpg',
    '/images/四楼逃生图.jpg',
    '/images/学院楼单侧.jpg',
];

// Sources definition
const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

const sources = {
    local: new XYZ({
        url: `${normalizedBase}tiles/{z}/{x}/{y}.png`,
        crossOrigin: 'anonymous'
    }),
    osm: new OSM(),
    amap: new XYZ({ url: 'https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', maxZoom: 20 }),
    google: new XYZ({ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 }),
    esri: new XYZ({ url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 20 }),
    tengxun: new XYZ({ url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0', maxZoom: 20 }),
    tianDiTu: new XYZ({ url: 'https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb', maxZoom: 20 }),
    tianDiTu_vec: new XYZ({ url: 'https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb', maxZoom: 20 }),
    label_tianditu: new XYZ({ url: 'https://t0.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb', maxZoom: 20 }),
};

let baseLayer;
let labelLayer;

onMounted(() => {
    initMap();
    
    // Mouse move listener for popup positioning
    if (mapContainerRef.value) {
        mapContainerRef.value.addEventListener('mousemove', (e) => {
            currentMousePosition.value = { x: e.clientX, y: e.clientY };
            // If image set is visible, update its position (optional, or keep it fixed where it appeared)
            // The original code updated it on zoom check, but here we might want it to follow or stay put.
            // Let's keep the original logic: it appears based on zoom.
        });
        
        mapContainerRef.value.addEventListener('click', () => {
            showLargeImg.value = false;
            showImageSet.value = false;
        });
    }
});

function initMap() {
    baseLayer = new TileLayer({
        source: sources['local']
    });
    
    labelLayer = new TileLayer({
        source: null,
        zIndex: 1,
        visible: false
    });

    const mousePositionControl = new MousePosition({
        coordinateFormat: createStringXY(4),
        projection: 'EPSG:4326',
        target: mousePositionRef.value,
        undefinedHTML: '&nbsp;'
    });

    const scaleLineControl = new ScaleLine({
        units: 'metric',
        bar: true,
        steps: 4,
        minWidth: 140
    });

    mapInstance.value = new Map({
        target: mapRef.value,
        layers: [baseLayer, labelLayer],
        view: new View({
            center: fromLonLat(initialCenter),
            zoom: initialZoom
        }),
        controls: defaultControls().extend([
            mousePositionControl,
            scaleLineControl
        ])
    });

    // Map events
    mapInstance.value.getView().on('change:resolution', checkZoomLevel);
    
    mapInstance.value.on('pointermove', (evt) => {
        const coordinate = evt.coordinate;
        const lonLat = toLonLat(coordinate);
        
        const dihuanBounds = {
            minLon: 114.3020,
            maxLon: 114.3030,
            minLat: 34.8149,
            maxLat: 34.8154,
        };
        
        const isInDihuan = 
            lonLat[0] >= dihuanBounds.minLon && 
            lonLat[0] <= dihuanBounds.maxLon &&
            lonLat[1] >= dihuanBounds.minLat && 
            lonLat[1] <= dihuanBounds.maxLat;
        
        emit('location-change', { 
            isInDihuan,
            lonLat
        });
    });
    
    checkZoomLevel();
}

function resetView() {
    if (mapInstance.value) {
        mapInstance.value.getView().animate({
            center: fromLonLat(initialCenter),
            zoom: initialZoom,
            duration: 1000
        });
    }
}

function checkZoomLevel() {
    if (!mapInstance.value) return;
    const zoom = mapInstance.value.getView().getZoom();
    
    if (zoom >= 18) {
        showImageSet.value = true;
        // Position it near the mouse or center? Original code used mouse position.
        // But mouse position might be 0,0 if not moved yet.
        // Let's use a fixed position relative to map or last mouse position.
        // Since we are inside map-container with relative positioning, we need relative coordinates.
        // For simplicity, let's just center it or put it in a corner if mouse isn't available.
        // But to match original behavior:
        // Note: original code used clientX/Y which is screen coordinates.
        // If we use absolute positioning inside relative container, we need offset coordinates.
        // Let's just put it in the center for now if we can't track mouse perfectly, 
        // or use the last known mouse position.
        
        // Actually, let's just fix it to a specific location on the screen for better UX
        // or keep it following the mouse (which is annoying).
        // The original code: dihuan_imageset.style.left = currentMousePosition.x + 'px';
        // This implies it follows the mouse? No, `startListening` is called on zoom change.
        // So it pops up at the LAST mouse position when zoom threshold is crossed.
        
        // We'll use a safe default if 0,0
        const x = currentMousePosition.value.x || 100;
        const y = currentMousePosition.value.y || 100;
        
        // We need to convert client coordinates to relative coordinates if the container is relative.
        // But the original code used fixed/absolute positioning likely relative to body or map container.
        // If map-container is relative, absolute children are relative to it.
        // clientX is viewport. We need to subtract container offset.
        if (mapContainerRef.value) {
            const rect = mapContainerRef.value.getBoundingClientRect();
            imageSetPosition.value = {
                x: x - rect.left,
                y: y - rect.top
            };
        }
    } else {
        showImageSet.value = false;
        showLargeImg.value = false;
    }
}

function showLargeImage(src, event) {
    largeImageSrc.value = src;
    showLargeImg.value = true;
    
    // Position near the click
    // Again, convert to relative
    if (mapContainerRef.value) {
        const rect = mapContainerRef.value.getBoundingClientRect();
        largeImagePosition.value = {
            x: event.clientX - rect.left + 20, // Offset a bit
            y: event.clientY - rect.top + 20
        };
    }
    
    emit('update-news-image', src);
}

watch(selectedLayer, (newVal) => {
    if (!baseLayer || !labelLayer) return;
    
    labelLayer.setVisible(false);
    labelLayer.setSource(null);
    
    switch(newVal) {
        case 'tianDiTu_vec':
        case 'tianDiTu':
        case 'google':
        case 'esri':
            baseLayer.setSource(sources[newVal]);
            labelLayer.setSource(sources['label_tianditu']);
            labelLayer.setVisible(true);
            break;
        default:
            baseLayer.setSource(sources[newVal]);
            break;
    }
});
</script>

<style scoped>
.map-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}

#map {
    width: 100%;
    height: 100%;
}

.imageset {
    position: absolute;
    background-color: white;
    border: 1px solid #ccc;
    padding: 5px;
    width: 320px; /* Slightly wider to fit */
    z-index: 1000;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
}

.thumbnail {
    width: 100px;
    height: 70px;
    object-fit: cover;
    cursor: pointer;
    border-radius: 2px;
    transition: transform 0.2s;
}

.thumbnail:hover {
    transform: scale(1.05);
}

.large-image {
    position: absolute;
    width: 400px; /* Reduced from 600px for better fit */
    height: auto;
    max-height: 400px;
    border: 2px solid white;
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    z-index: 1001;
    object-fit: contain;
    background: black;
}

.layer-switcher {
    position: absolute;
    top: 10px;
    right: 10px;
    background: white;
    padding: 5px;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    z-index: 1000;
}

.layer-select {
    padding: 5px;
    border: 2px solid #2cab54;
    border-radius: 3px;
    font-size: 14px;
    width: 150px;
    outline: none;
}

.map-controls-group {
    position: absolute;
    bottom: 20px;
    right: 10px;
    background: linear-gradient(to right, rgba(10, 121, 51, 0.9), rgba(8, 96, 41, 0.9));
    color: white;
    padding: 5px 10px;
    border-radius: 6px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    z-index: 1000;
    border: 1px solid rgba(255,255,255,0.2);
    display: flex;
    align-items: center;
    gap: 10px;
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

/* Override OpenLayers default absolute positioning */
:deep(.ol-mouse-position) {
    position: static !important;
    top: auto !important;
    right: auto !important;
    background: transparent !important;
    padding: 0 !important;
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

/* Mobile adjustments */
@media (max-width: 768px) {
    .large-image {
        width: 90%;
        left: 5% !important;
        top: 50% !important;
        transform: translateY(-50%);
    }
    
    .imageset {
        width: 90%;
        left: 5% !important;
        top: 10% !important;
    }
    
    .map-controls-group {
        font-size: 12px;
        padding: 3px 8px;
        bottom: 35px; /* Make room for attribution/scale */
    }
    
    .mouse-position-content {
        min-width: 100px;
    }
}
</style>
