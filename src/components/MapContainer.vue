<template>
    <div class="map-container" ref="mapContainerRef">
        <div id="map" ref="mapRef"></div>
        
        <!-- 图片集覆盖层 -->
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

        <!-- 大图覆盖层 -->
        <img 
            v-if="largeImageSrc"
            v-show="showLargeImg"
            :src="largeImageSrc" 
            class="large-image"
            :style="{ left: largeImagePosition.x + 'px', top: largeImagePosition.y + 'px' }"
            alt="Large Image"
        >
        
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

        <!-- 鼠标位置与主页按钮组 -->
        <div class="map-controls-group">
            <div ref="mousePositionRef" class="mouse-position-content"></div>
            <div class="divider"></div>
            <button class="home-btn" @click="resetView" @dblclick="zoomToUser" title="单击复位 / 双击定位">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, watch, shallowRef, onUnmounted } from 'vue';
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
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
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

// 交互状态
let draw; // global so we can remove it later
let snap;
let measureTooltipElement;
let measureTooltip;
let helpTooltipElement;
let helpTooltip;
let sketch;
let listener;
const source = new VectorSource(); // 绘制与测量的矢量源
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

// 用户位置图层（标记 + 精度圈）
const userLocationSource = new VectorSource();
const userPointStyle = new Style({
    image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: '#1E90FF' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
    })
});
const accuracyStyle = new Style({
    fill: new Fill({ color: 'rgba(30,144,255,0.12)' }),
    stroke: new Stroke({ color: 'rgba(30,144,255,0.3)', width: 1 })
});
const userLocationLayer = new VectorLayer({
    source: userLocationSource,
    style: function (feature) {
        return feature.get('type') === 'accuracy' ? accuracyStyle : userPointStyle;
    },
    zIndex: 1000
});

// 保存最后已知用户位置（地图坐标与经纬度）
const lastUserCoord = ref(null);
const lastUserLonLat = ref(null);

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

// 底图源定义
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
    
    // 鼠标移动监听用于弹窗定位
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
        layers: [baseLayer, labelLayer, vector, userLocationLayer],
        view: new View({
            center: fromLonLat(initialCenter),
            zoom: initialZoom
        }),
        controls: defaultControls().extend([
            mousePositionControl,
            scaleLineControl
        ])
    });

    // 地图事件
    mapInstance.value.getView().on('change:resolution', checkZoomLevel);
    
    mapInstance.value.on('pointermove', (evt) => {
        if (evt.dragging) {
            return;
        }
        
        // 帮助提示逻辑
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

    // 属性查询单击监听器
    mapInstance.value.on('singleclick', (evt) => {
        // 仅当未处于绘制模式时
        if (draw && draw.getActive()) return;

        const feature = mapInstance.value.forEachFeatureAtPixel(evt.pixel, (feature) => feature);
        if (feature) {
            const properties = feature.getProperties();
            // 过滤掉 geometry 和 style 属性
            const displayProps = {};
            for (const key in properties) {
                if (key !== 'geometry' && key !== 'style') {
                    displayProps[key] = properties[key];
                }
            }
            
            // 目前简单触发事件或弹窗
            // alert(JSON.stringify(displayProps, null, 2));
            emit('feature-selected', displayProps);
        }
    });
    
    checkZoomLevel();


// 地理定位辅助函数
let geolocationWatchId = null;

function clearUserLocation() {
    if (!userLocationSource) return;
    userLocationSource.clear(true);
}

function updateUserLocation(lon, lat, accuracy) {
    if (!mapInstance.value) return;
    const coord = fromLonLat([lon, lat]);

    // 清除之前的位置要素
    clearUserLocation();

    // 精度圈（地图单位，EPSG:3857，单位为米）
    const accuracyFeature = new Feature({
        geometry: new CircleGeom(coord, accuracy || 0),
        type: 'accuracy'
    });

    const pointFeature = new Feature({
        geometry: new Point(coord),
        type: 'position'
    });

    userLocationSource.addFeature(accuracyFeature);
    userLocationSource.addFeature(pointFeature);

    // 存储最后已知位置
    lastUserCoord.value = coord;
    lastUserLonLat.value = [lon, lat];

    // 平滑居中视图
    try {
        mapInstance.value.getView().animate({ center: coord, duration: 800 });
    } catch (e) {
        console.warn('Failed to animate view to user location', e);
    }

    emit('location-change', { lonLat: [lon, lat], accuracy });
}

function locateOnce() {
    return new Promise((resolve, reject) => {
        if (!navigator || !navigator.geolocation) return reject(new Error('Geolocation not available'));
        navigator.geolocation.getCurrentPosition((pos) => {
            const lon = pos.coords.longitude;
            const lat = pos.coords.latitude;
            const accuracy = pos.coords.accuracy;
            updateUserLocation(lon, lat, accuracy);
            resolve({ lon, lat, accuracy });
        }, (err) => {
            console.warn('Geolocation error:', err.message);
            reject(err);
        }, { enableHighAccuracy: true, timeout: 10000 });
    });
}

function startWatchPosition() {
    if (!navigator || !navigator.geolocation) return;
    if (geolocationWatchId !== null) return;
    geolocationWatchId = navigator.geolocation.watchPosition((pos) => {
        updateUserLocation(pos.coords.longitude, pos.coords.latitude, pos.coords.accuracy);
    }, (err) => {
        console.warn('Geolocation watch error:', err.message);
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
}

// 将视图缩放到用户最后已知位置（若未知则请求定位）
async function zoomToUser() {
    try {
        if (!mapInstance.value) return;
        // 如果存在单击定时器，清除它以避免双击后执行 resetView
        if (homeClickTimer) {
            clearTimeout(homeClickTimer);
            homeClickTimer = null;
        }
        if (!lastUserCoord.value) {
            // Request a one-shot location and then zoom
            const res = await locateOnce();
            const coord = fromLonLat([res.lon, res.lat]);
            mapInstance.value.getView().animate({ center: coord, zoom: Math.max(mapInstance.value.getView().getZoom(), 17), duration: 800 });
            return;
        }

        const targetZoom = Math.max(mapInstance.value.getView().getZoom(), 17);
        mapInstance.value.getView().animate({ center: lastUserCoord.value, zoom: targetZoom, duration: 800 });
    } catch (e) {
        console.warn('zoomToUser failed', e);
    }
}

// 处理双击：主动请求当前位置并居中地图
function doubleClickLocate() {
    // prevent single-click reset from firing
    if (homeClickTimer) {
        clearTimeout(homeClickTimer);
        homeClickTimer = null;
    }

    // Actively request a fresh position and center when received
    locateOnce().catch((err) => {
        console.warn('doubleClickLocate: locateOnce failed', err);
    });
}

function stopWatchPosition() {
    if (geolocationWatchId !== null && navigator && navigator.geolocation) {
        navigator.geolocation.clearWatch(geolocationWatchId);
        geolocationWatchId = null;
    }
}

onUnmounted(() => {
    stopWatchPosition();
});
    // 地图就绪后请求并显示一次用户位置
    if (navigator && navigator.geolocation) {
        locateOnce();
        // Optionally start watching position updates
        // startWatchPosition();
    } else {
        console.warn('Geolocation API not available in this browser');
    }
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

        // 先不做投影读取要素以检查原始坐标
        let features = format.readFeatures(content);
        
        if (features.length === 0) {
            alert('文件中没有找到有效的地理要素');
            return;
        }

        // 检查要素是否需要投影转换
        // 如果第一个要素的坐标在典型经纬度范围内 (-180 到 180)，
        // 且地图使用 Web Mercator (EPSG:3857)，则需要转换
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

        // 随机颜色用于区分多个上传图层
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

        // 缩放到要素范围
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

// --- 交互逻辑 ---

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
        // 也移除所有覆盖物（提示框）
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

            // 监听草图几何变化以更新测量提示
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
