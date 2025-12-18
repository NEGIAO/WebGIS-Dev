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

        <!-- Mouse Position and Home Button Group -->
        <div class="map-controls-group">
            <div ref="mousePositionRef" class="mouse-position-content"></div>
            <div class="divider"></div>
            <button class="home-btn" @click="resetView" @dblclick="zoomToChina" title="单击复位 / 双击全图">
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
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { Draw, Modify, Snap } from 'ol/interaction';
import { getArea, getLength } from 'ol/sphere';
import Overlay from 'ol/Overlay';
import { unByKey } from 'ol/Observable';
import { LineString, Polygon } from 'ol/geom';

const emit = defineEmits(['location-change', 'update-news-image', 'feature-selected']);

const mapRef = ref(null);
const mousePositionRef = ref(null);
const mapContainerRef = ref(null);
const mapInstance = shallowRef(null);

// Interaction State
let draw; // global so we can remove it later
let snap;
let measureTooltipElement;
let measureTooltip;
let helpTooltipElement;
let helpTooltip;
let sketch;
let listener;
const source = new VectorSource(); // Source for drawings and measurements
const vector = new VectorLayer({
    source: source,
    style: new Style({
        fill: new Fill({
            color: 'rgba(255, 255, 255, 0.2)',
        }),
        stroke: new Stroke({
            color: '#ffcc33',
            width: 2,
        }),
        image: new CircleStyle({
            radius: 7,
            fill: new Fill({
                color: '#ffcc33',
            }),
        }),
    }),
    zIndex: 999
});

const selectedLayer = ref('google');
const showImageSet = ref(false);
const imageSetPosition = ref({ x: 0, y: 0 });
const showLargeImg = ref(false);
const largeImageSrc = ref('');
const largeImagePosition = ref({ x: 0, y: 0 });
const currentMousePosition = ref({ x: 0, y: 0 });
const isInTargetArea = ref(false);

const initialCenter = [114.302, 34.8146];
const initialZoom = 17;

// Sources definition
const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

const images = [
    `${normalizedBase}images/地理与环境学院标志牌.jpg`,
    `${normalizedBase}images/地理与环境学院入口.jpg`,
    `${normalizedBase}images/地学楼.jpg`,
    `${normalizedBase}images/教育部重点实验室.jpg`,
    `${normalizedBase}images/四楼逃生图.jpg`,
    `${normalizedBase}images/学院楼单侧.jpg`,
];

const sources = {
    local: new XYZ({
        url: `${normalizedBase}tiles/{z}/{x}/{y}.png`,
        crossOrigin: 'anonymous'
    }),
    osm: new OSM(),
    amap: new XYZ({ url: 'https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', maxZoom: 20 }),
    // 这个图源按年收费，一年500，已经过期了，暂时切换gggis的图源。
    // google: new XYZ({ url: 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 }),
    google: new XYZ({ url: 'https://mt3v.gggis.com/maps/vt?lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 }),
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
        });
        
        mapContainerRef.value.addEventListener('click', () => {
            showLargeImg.value = false;
            showImageSet.value = false;
        });
    }
});

function initMap() {
    baseLayer = new TileLayer({
        source: sources['google']
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
        layers: [baseLayer, labelLayer, vector],
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
        if (evt.dragging) {
            return;
        }
        
        // Help tooltip logic
        if (helpTooltipElement) {
            let helpMsg = 'Click to start drawing';
            if (sketch) {
                const geom = sketch.getGeometry();
                if (geom instanceof Polygon) {
                    helpMsg = 'Click to continue polygon, double click to finish';
                } else if (geom instanceof LineString) {
                    helpMsg = 'Click to continue line, double click to finish';
                }
            }
            helpTooltipElement.innerHTML = helpMsg;
            helpTooltip.setPosition(evt.coordinate);
            helpTooltipElement.classList.remove('hidden');
        }

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
        
        isInTargetArea.value = isInDihuan;
        checkZoomLevel();

        emit('location-change', { 
            isInDihuan,
            lonLat
        });
    });

    mapInstance.value.getViewport().addEventListener('mouseout', function () {
        if (helpTooltipElement) {
            helpTooltipElement.classList.add('hidden');
        }
    });

    // Attribute Query Click Listener
    mapInstance.value.on('singleclick', (evt) => {
        // Only if not drawing
        if (draw && draw.getActive()) return;

        const feature = mapInstance.value.forEachFeatureAtPixel(evt.pixel, (feature) => feature);
        if (feature) {
            const properties = feature.getProperties();
            // Filter out geometry and style
            const displayProps = {};
            for (const key in properties) {
                if (key !== 'geometry' && key !== 'style') {
                    displayProps[key] = properties[key];
                }
            }
            
            // Simple alert for now, or emit event
            // alert(JSON.stringify(displayProps, null, 2));
            emit('feature-selected', displayProps);
        }
    });
    
    checkZoomLevel();
}

let homeClickTimer = null;

function resetView() {
    if (homeClickTimer) clearTimeout(homeClickTimer);
    
    homeClickTimer = setTimeout(() => {
        if (mapInstance.value) {
            mapInstance.value.getView().animate({
                center: fromLonLat(initialCenter),
                zoom: initialZoom,
                duration: 1000
            });
        }
        homeClickTimer = null;
    }, 300);
}

function zoomToChina() {
    if (homeClickTimer) {
        clearTimeout(homeClickTimer);
        homeClickTimer = null;
    }

    if (mapInstance.value) {
        mapInstance.value.getView().animate({
            center: fromLonLat([104.1954, 35.8617]),
            zoom: 4,
            duration: 1000
        });
    }
}

function checkZoomLevel() {
    if (!mapInstance.value) return;
    const zoom = mapInstance.value.getView().getZoom();
    
    if (zoom >= 18 && isInTargetArea.value) {
        showImageSet.value = true;
        const x = currentMousePosition.value.x || 100;
        const y = currentMousePosition.value.y || 100;
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

function addUserDataLayer(fileData) {
    if (!mapInstance.value) return;

    const { content, type, name } = fileData;
    let format;

    try {
        if (type === 'geojson' || type === 'json') {
            format = new GeoJSON();
        } else if (type === 'kml') {
            format = new KML({ extractStyles: true });
        } else {
            console.warn('Unsupported file type:', type);
            alert('不支持的文件格式: ' + type);
            return;
        }

        // Try to read features without projection first to check their raw coordinates
        let features = format.readFeatures(content);
        
        if (features.length === 0) {
            alert('文件中没有找到有效的地理要素');
            return;
        }

        // Check if features need projection transform
        // If the first feature's coordinates are within typical lat/lon range (-180 to 180),
        // and the map is in Web Mercator (EPSG:3857), we need to transform.
        // If they are large numbers, they might already be in 3857.
        
        const extent = features[0].getGeometry().getExtent();
        const isLatLon = extent[0] >= -180 && extent[0] <= 180 && extent[1] >= -90 && extent[1] <= 90;
        
        if (isLatLon) {
            // Re-read with featureProjection to transform automatically
            features = format.readFeatures(content, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });
        } else {
            // Assume they are already in the target projection (likely 3857) or unknown
            // If they are 3857, we don't need to do anything as the view is 3857.
            // If they are something else, we can't help much without proj4.
            console.log('Features appear to be already projected or outside lat/lon range.');
        }

        const vectorSource = new VectorSource({
            features: features
        });

        // Random color for the layer to distinguish multiple uploads
        const color = '#' + Math.floor(Math.random()*16777215).toString(16);

        const vectorLayer = new VectorLayer({
            source: vectorSource,
            zIndex: 100, // Ensure it's on top
            style: function(feature) {
                // Use feature style if available (e.g. from KML), otherwise use default
                // Note: KML styles are automatically handled if extractStyles is true, 
                // but we can provide a fallback or override if needed.
                // For simplicity, we'll use a default style for GeoJSON or unstyled features.
                return new Style({
                    fill: new Fill({
                        color: 'rgba(255, 255, 255, 0.2)'
                    }),
                    stroke: new Stroke({
                        color: color,
                        width: 2
                    }),
                    image: new CircleStyle({
                        radius: 5,
                        fill: new Fill({
                            color: color
                        })
                    })
                });
            },
            properties: {
                name: name
            }
        });

        mapInstance.value.addLayer(vectorLayer);

        // Zoom to extent
        const sourceExtent = vectorSource.getExtent();
        if (sourceExtent && !vectorSource.isEmpty()) {
            mapInstance.value.getView().fit(sourceExtent, {
                padding: [50, 50, 50, 50],
                duration: 1000
            });
        }
    } catch (error) {
        console.error('Error adding user data layer:', error);
        alert('解析文件时出错: ' + error.message);
    }
}

defineExpose({
    addUserDataLayer,
    activateInteraction,
    clearInteractions
});

// --- Interaction Logic ---

function clearInteractions() {
    if (mapInstance.value) {
        mapInstance.value.removeInteraction(draw);
        mapInstance.value.removeInteraction(snap);
        
        // Remove tooltips
        if (helpTooltipElement) {
            if (helpTooltipElement.parentNode) helpTooltipElement.parentNode.removeChild(helpTooltipElement);
            helpTooltipElement = null;
        }
        if (measureTooltipElement) {
            // Don't remove finished measure tooltips, only the current one if incomplete?
            // Actually, let's keep finished ones.
            if (sketch) {
                 if (measureTooltipElement.parentNode) measureTooltipElement.parentNode.removeChild(measureTooltipElement);
            }
            measureTooltipElement = null;
        }
        
        sketch = null;
        draw = null;
        snap = null;
    }
}

function activateInteraction(type) {
    clearInteractions();
    if (!mapInstance.value) return;

    if (type === 'Clear') {
        source.clear();
        // Also remove all overlays (tooltips)
        mapInstance.value.getOverlays().clear();
        return;
    }

    if (type === 'MeasureDistance' || type === 'MeasureArea') {
        addInteraction(type === 'MeasureArea' ? 'Polygon' : 'LineString', true);
    } else if (type === 'Point' || type === 'LineString' || type === 'Polygon') {
        addInteraction(type, false);
    }
}

function addInteraction(type, isMeasure) {
    draw = new Draw({
        source: source,
        type: type,
        style: new Style({
            fill: new Fill({
                color: 'rgba(255, 255, 255, 0.2)',
            }),
            stroke: new Stroke({
                color: 'rgba(0, 0, 0, 0.5)',
                lineDash: [10, 10],
                width: 2,
            }),
            image: new CircleStyle({
                radius: 5,
                stroke: new Stroke({
                    color: 'rgba(0, 0, 0, 0.7)',
                }),
                fill: new Fill({
                    color: 'rgba(255, 255, 255, 0.2)',
                }),
            }),
        }),
    });
    
    mapInstance.value.addInteraction(draw);

    snap = new Snap({ source: source });
    mapInstance.value.addInteraction(snap);

    if (isMeasure) {
        createMeasureTooltip();
        createHelpTooltip();

        draw.on('drawstart', function (evt) {
            sketch = evt.feature;
            let tooltipCoord = evt.coordinate;

            listener = sketch.getGeometry().on('change', function (evt) {
                const geom = evt.target;
                let output;
                if (geom instanceof Polygon) {
                    output = formatArea(geom);
                    tooltipCoord = geom.getInteriorPoint().getCoordinates();
                } else if (geom instanceof LineString) {
                    output = formatLength(geom);
                    tooltipCoord = geom.getLastCoordinate();
                }
                measureTooltipElement.innerHTML = output;
                measureTooltip.setPosition(tooltipCoord);
            });
        });

        draw.on('drawend', function () {
            measureTooltipElement.className = 'ol-tooltip ol-tooltip-static';
            measureTooltip.setOffset([0, -7]);
            sketch = null;
            measureTooltipElement = null;
            createMeasureTooltip();
            unByKey(listener);
        });
    }
}

function createHelpTooltip() {
    if (helpTooltipElement) {
        helpTooltipElement.parentNode.removeChild(helpTooltipElement);
    }
    helpTooltipElement = document.createElement('div');
    helpTooltipElement.className = 'ol-tooltip hidden';
    helpTooltip = new Overlay({
        element: helpTooltipElement,
        offset: [15, 0],
        positioning: 'center-left',
    });
    mapInstance.value.addOverlay(helpTooltip);
}

function createMeasureTooltip() {
    if (measureTooltipElement) {
        measureTooltipElement.parentNode.removeChild(measureTooltipElement);
    }
    measureTooltipElement = document.createElement('div');
    measureTooltipElement.className = 'ol-tooltip ol-tooltip-measure';
    measureTooltip = new Overlay({
        element: measureTooltipElement,
        offset: [0, -15],
        positioning: 'bottom-center',
        stopEvent: false,
        insertFirst: false,
    });
    mapInstance.value.addOverlay(measureTooltip);
}

const formatLength = function (line) {
    const length = getLength(line);
    let output;
    if (length > 100) {
        output = Math.round((length / 1000) * 100) / 100 + ' ' + 'km';
    } else {
        output = Math.round(length * 100) / 100 + ' ' + 'm';
    }
    return output;
};

const formatArea = function (polygon) {
    const area = getArea(polygon);
    let output;
    if (area > 10000) {
        output = Math.round((area / 1000000) * 100) / 100 + ' ' + 'km<sup>2</sup>';
    } else {
        output = Math.round(area * 100) / 100 + ' ' + 'm<sup>2</sup>';
    }
    return output;
};

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
    z-index: 10;
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

/* Tooltip Styles */
:deep(.ol-tooltip) {
    position: relative;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    color: white;
    padding: 4px 8px;
    opacity: 0.7;
    white-space: nowrap;
    font-size: 12px;
    cursor: default;
    user-select: none;
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

:deep(.ol-tooltip-measure:before),
:deep(.ol-tooltip-static:before) {
    border-top: 6px solid rgba(0, 0, 0, 0.5);
    border-right: 6px solid transparent;
    border-left: 6px solid transparent;
    content: "";
    position: absolute;
    bottom: -6px;
    margin-left: -7px;
    left: 50%;
}

:deep(.ol-tooltip-static:before) {
    border-top-color: #ffcc33;
}
</style>
