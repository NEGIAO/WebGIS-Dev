import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
import LineString from 'ol/geom/LineString';
import { defaults as defaultControls, OverviewMap } from 'ol/control';
import { fromLonLat, toLonLat } from 'ol/proj';
import { unByKey } from 'ol/Observable';
import type { EventsKey } from 'ol/events';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { watch, type WatchStopHandle } from 'vue';
import { useMapStateStore } from '../../stores/mapStateStore';
import { LayerRenderer } from './LayerRenderer';
import { RouteRenderer } from './RouteRenderer';
import { DrawController } from './DrawController';

const NORM_BASE = '/';
const TIANDITU_TK = '4267820f43926eaf808d61dc07269beb';

const VIEW_EPSILON = 1e-6;
const ZOOM_EPSILON = 1e-3;
const INITIAL_VIEW: [number, number] = [114.302, 34.8146];
const INITIAL_ZOOM = 16;

type BasemapId =
    | 'google'
    | 'google_standard'
    | 'google_clean'
    | 'tianDiTu'
    | 'tianDiTu_vec'
    | 'esri'
    | 'osm'
    | 'amap'
    | 'tengxun'
    | 'esri_ocean'
    | 'esri_terrain'
    | 'esri_physical'
    | 'esri_hillshade'
    | 'esri_gray'
    | 'gggis_time'
    | 'yandex_sat'
    | 'geoq_gray'
    | 'geoq_hydro'
    | 'custom'
    | 'local';

const SUPPORTED_BASEMAPS: BasemapId[] = [
    'google',
    'google_standard',
    'google_clean',
    'tianDiTu',
    'tianDiTu_vec',
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
    'custom',
    'local'
];

function normalizeBasemapId(rawId: string): BasemapId {
    const id = String(rawId || '').trim() as BasemapId;
    return SUPPORTED_BASEMAPS.includes(id) ? id : 'google';
}

function buildGoogleSource() {
    return new XYZ({
        url: 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}',
        maxZoom: 20
    });
}

function buildGoogleStandardSource() {
    return new XYZ({
        url: 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=m&x={x}&y={y}&z={z}',
        maxZoom: 20
    });
}

function buildGoogleCleanSource() {
    return new XYZ({
        url: 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=m&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off,s.t:3|s.e.g|p.v:off',
        maxZoom: 20
    });
}

function buildTiandituImageSource() {
    return new XYZ({
        url: `https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}`
    });
}

function buildTiandituVectorSource() {
    return new XYZ({
        url: `https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}`
    });
}

function buildTiandituImageLabelSource() {
    return new XYZ({
        url: `https://t0.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}`
    });
}

function buildTiandituVectorLabelSource() {
    return new XYZ({
        url: `https://t0.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}`
    });
}

function buildEsriSource() {
    return new XYZ({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 20
    });
}

function buildTengxunSource() {
    return new XYZ({
        url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0'
    });
}

function buildEsriOceanSource() {
    return new XYZ({
        url: 'https://server.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}'
    });
}

function buildEsriTerrainSource() {
    return new XYZ({
        url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}'
    });
}

function buildEsriPhysicalSource() {
    return new XYZ({
        url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}'
    });
}

function buildEsriHillshadeSource() {
    return new XYZ({
        url: 'https://server.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'
    });
}

function buildEsriGraySource() {
    return new XYZ({
        url: 'https://server.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
    });
}

function buildGggisTimeSource() {
    return new XYZ({
        url: 'https://mt3v.gggis.com/maps/vt?lyrs=s&x={x}&y={y}&z={z}',
        maxZoom: 20
    });
}

function buildYandexSatSource() {
    return new XYZ({
        url: 'https://sat02.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}'
    });
}

function buildGeoQGraySource() {
    return new XYZ({
        url: 'https://thematic.geoq.cn/arcgis/rest/services/ChinaOnlineStreetGray/MapServer/WMTS/tile/1.0.0/ChinaOnlineStreetGray/default/GoogleMapsCompatible/{z}/{y}/{x}.png'
    });
}

function buildGeoQHydroSource() {
    return new XYZ({
        url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png'
    });
}

function buildCustomSource(url: string): XYZ | null {
    const normalized = String(url || '').trim();
    if (!normalized) return null;
    return new XYZ({ url: normalized });
}

const searchPointStyle = new Style({
    image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: 'rgba(239, 68, 68, 0.92)' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
    })
});

const searchRingStyle = new Style({
    image: new CircleStyle({
        radius: 14,
        fill: new Fill({ color: 'rgba(239, 68, 68, 0.12)' }),
        stroke: new Stroke({ color: 'rgba(239, 68, 68, 0.82)', width: 2 })
    })
});

const userPositionStyle = new Style({
    image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: '#1E90FF' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
    })
});

const userAccuracyStyle = new Style({
    fill: new Fill({ color: 'rgba(30,144,255,0.12)' }),
    stroke: new Stroke({ color: 'rgba(30,144,255,0.3)', width: 1 })
});

function formatLongitude(lon: number): string {
    const abs = Math.abs(lon).toFixed(4);
    return `${abs}°${lon >= 0 ? 'E' : 'W'}`;
}

function formatLatitude(lat: number): string {
    const abs = Math.abs(lat).toFixed(4);
    return `${abs}°${lat >= 0 ? 'N' : 'S'}`;
}

function createDynamicSplitStyle(
    textLabel = '',
    textOptions: { offsetX?: number; offsetY?: number; textAlign?: CanvasTextAlign } = {}
): Style {
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
                textAlign: (textOptions.textAlign ?? 'center') as CanvasTextAlign
            })
            : undefined
    });
}

function buildAmapSource() {
    return new XYZ({
        url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
    });
}

function buildLocalSource() {
    return new XYZ({
        url: `${NORM_BASE}tiles/{z}/{x}/{y}.png`
    });
}

export class Map2DManager {
    private readonly mapStateStore = useMapStateStore();
    private readonly map: Map;
    private readonly baseLayer: TileLayer<XYZ | OSM>;
    private readonly labelLayer: TileLayer<XYZ>;
    private readonly dynamicSplitSource: VectorSource;
    private readonly dynamicSplitLayer: VectorLayer<VectorSource>;
    private readonly searchHighlightSource: VectorSource;
    private readonly searchHighlightLayer: VectorLayer<VectorSource>;
    private readonly userLocationSource: VectorSource;
    private readonly userLocationLayer: VectorLayer<VectorSource>;
    private readonly layerRenderer: LayerRenderer;
    private readonly routeRenderer: RouteRenderer;
    private readonly drawController: DrawController;

    private moveEndKey: EventsKey | null = null;
    private stopHandles: WatchStopHandle[] = [];
    private isWritingFromMap = false;
    private isApplyingStoreView = false;

    constructor(target: HTMLDivElement | string) {
        const targetElement = typeof target === 'string' ? document.getElementById(target) : target;
        if (!targetElement) {
            throw new Error('Map2DManager 初始化失败: 未找到地图挂载容器');
        }

        this.baseLayer = new TileLayer({
            source: buildGoogleSource(),
            zIndex: 0
        });

        this.labelLayer = new TileLayer({
            source: null,
            visible: false,
            zIndex: 10
        });

        this.dynamicSplitSource = new VectorSource();
        this.dynamicSplitLayer = new VectorLayer({
            source: this.dynamicSplitSource,
            visible: false,
            zIndex: 1320
        });

        this.searchHighlightSource = new VectorSource();
        this.searchHighlightLayer = new VectorLayer({
            source: this.searchHighlightSource,
            zIndex: 1350,
            style: (feature) => (feature.get('ring') ? searchRingStyle : searchPointStyle)
        });

        this.userLocationSource = new VectorSource();
        this.userLocationLayer = new VectorLayer({
            source: this.userLocationSource,
            zIndex: 1340,
            style: (feature) => (feature.get('kind') === 'accuracy' ? userAccuracyStyle : userPositionStyle)
        });

        this.map = new Map({
            target: targetElement,
            layers: [this.baseLayer, this.labelLayer, this.dynamicSplitLayer, this.userLocationLayer, this.searchHighlightLayer],
            view: new View({
                center: fromLonLat(this.mapStateStore.center),
                zoom: this.mapStateStore.zoom,
                minZoom: 0,
                maxZoom: 22
            }),
            controls: defaultControls({ rotate: false }).extend([
                new OverviewMap({
                    className: 'ol-overviewmap ol-custom-overviewmap',
                    layers: [new TileLayer({ source: buildGoogleSource() })],
                    collapseLabel: '«',
                    label: '»',
                    collapsed: false
                })
            ])
        });

        this.layerRenderer = new LayerRenderer(this.map);
        this.routeRenderer = new RouteRenderer(this.map);
        this.drawController = new DrawController(this.map);

        this.bindStoreWatchers();
        this.bindMapEvents();
        this.syncExtentToStore();
    }

    getMapInstance(): Map {
        return this.map;
    }

    destroy(): void {
        this.stopHandles.forEach((stop) => stop());
        this.stopHandles = [];

        if (this.moveEndKey) {
            unByKey(this.moveEndKey);
            this.moveEndKey = null;
        }

        this.layerRenderer.destroy();
        this.routeRenderer.destroy();
        this.drawController.destroy();
        this.dynamicSplitSource.clear();
        this.searchHighlightSource.clear();
        this.userLocationSource.clear();
        this.map.removeLayer(this.dynamicSplitLayer);
        this.map.removeLayer(this.searchHighlightLayer);
        this.map.removeLayer(this.userLocationLayer);

        this.map.setTarget(undefined);
    }

    private bindStoreWatchers(): void {
        const stopBasemapWatch = watch(
            () => this.mapStateStore.basemap,
            (nextBasemap) => {
                this.applyBasemap(nextBasemap);
            },
            { immediate: true }
        );

        const stopViewWatch = watch(
            () => [this.mapStateStore.center[0], this.mapStateStore.center[1], this.mapStateStore.zoom],
            ([lon, lat, zoom]) => {
                if (this.isWritingFromMap) return;

                const view = this.map.getView();
                const center = view.getCenter();
                const currentLonLat = Array.isArray(center) ? toLonLat(center) : null;
                const currentZoom = Number(view.getZoom() ?? 0);

                const sameCenter = !!currentLonLat
                    && Math.abs(currentLonLat[0] - lon) < VIEW_EPSILON
                    && Math.abs(currentLonLat[1] - lat) < VIEW_EPSILON;

                const sameZoom = Math.abs(currentZoom - Number(zoom)) < ZOOM_EPSILON;

                if (sameCenter && sameZoom) return;

                this.isApplyingStoreView = true;
                view.animate(
                    {
                        center: fromLonLat([lon, lat]),
                        zoom: Number(zoom),
                        duration: 350
                    },
                    () => {
                        this.isApplyingStoreView = false;
                    }
                );
            }
        );

        const stopSearchHighlightWatch = watch(
            () => this.mapStateStore.searchHighlight?.nonce,
            () => {
                this.applySearchHighlight();
            },
            { immediate: true }
        );

        const stopDynamicSplitWatch = watch(
            () => this.mapStateStore.showDynamicGraticule,
            (visible) => {
                this.applyDynamicSplitVisibility(visible);
            },
            { immediate: true }
        );

        const stopResetViewWatch = watch(
            () => this.mapStateStore.resetViewRequestNonce,
            (nonce) => {
                if (!nonce) return;
                this.resetView();
            }
        );

        const stopLocateUserWatch = watch(
            () => this.mapStateStore.locateUserRequestNonce,
            (nonce) => {
                if (!nonce) return;
                void this.locateUser();
            }
        );

        const stopCustomBasemapWatch = watch(
            () => this.mapStateStore.customBasemapUrl,
            () => {
                if (this.mapStateStore.basemap === 'custom') {
                    this.applyBasemap('custom');
                }
            }
        );

        this.stopHandles.push(
            stopBasemapWatch,
            stopViewWatch,
            stopSearchHighlightWatch,
            stopDynamicSplitWatch,
            stopResetViewWatch,
            stopLocateUserWatch,
            stopCustomBasemapWatch
        );
    }

    private bindMapEvents(): void {
        this.map.on('pointermove', (evt) => {
            const lonLat = toLonLat(evt.coordinate);
            this.mapStateStore.setPointerCoord([lonLat[0], lonLat[1]]);
        });

        this.map.getViewport().addEventListener('mouseout', () => {
            this.mapStateStore.setPointerCoord(null);
        });

        this.moveEndKey = this.map.on('moveend', () => {
            const view = this.map.getView();
            const center = view.getCenter();
            if (!Array.isArray(center)) return;

            const lonLat = toLonLat(center);
            const zoom = Number(view.getZoom() ?? this.mapStateStore.zoom);
            const [currentLon, currentLat] = this.mapStateStore.center;

            const centerChanged = Math.abs(currentLon - lonLat[0]) >= VIEW_EPSILON
                || Math.abs(currentLat - lonLat[1]) >= VIEW_EPSILON;
            const zoomChanged = Math.abs(Number(this.mapStateStore.zoom) - zoom) >= ZOOM_EPSILON;

            if (!centerChanged && !zoomChanged) return;

            this.isWritingFromMap = true;
            this.mapStateStore.setCenter([lonLat[0], lonLat[1]]);
            this.mapStateStore.setZoom(zoom);

            this.syncExtentToStore();

            this.isWritingFromMap = false;

            if (this.isApplyingStoreView) {
                this.isApplyingStoreView = false;
            }

            if (this.mapStateStore.showDynamicGraticule) {
                this.updateDynamicSplitLines();
            }
        });
    }

    private applyDynamicSplitVisibility(visible: boolean): void {
        if (!visible) {
            this.dynamicSplitLayer.setVisible(false);
            this.dynamicSplitSource.clear();
            return;
        }

        this.dynamicSplitLayer.setVisible(true);
        this.updateDynamicSplitLines();
    }

    private syncExtentToStore(): void {
        const view = this.map.getView();
        const size = this.map.getSize();
        if (!size) return;

        const mapExtent = view.calculateExtent(size);
        const sw = toLonLat([mapExtent[0], mapExtent[1]]);
        const ne = toLonLat([mapExtent[2], mapExtent[3]]);
        this.mapStateStore.setExtent([sw[0], sw[1], ne[0], ne[1]]);
    }

    private updateDynamicSplitLines(): void {
        const source = this.dynamicSplitSource;
        source.clear();
        if (!this.mapStateStore.showDynamicGraticule) return;

        const view = this.map.getView();
        const size = this.map.getSize();
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

        const features: Feature[] = [];

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

    private applySearchHighlight(): void {
        this.searchHighlightSource.clear();

        const point = this.mapStateStore.searchHighlight;
        if (!point) return;

        const coordinate = fromLonLat([point.lon, point.lat]);

        const ringFeature = new Feature({ geometry: new Point(coordinate), ring: true });
        const pointFeature = new Feature({ geometry: new Point(coordinate), ring: false });

        this.searchHighlightSource.addFeatures([ringFeature, pointFeature]);
    }

    private resetView(): void {
        this.map.getView().animate({
            center: fromLonLat(INITIAL_VIEW),
            zoom: INITIAL_ZOOM,
            duration: 800
        });
    }

    private async locateUser(): Promise<void> {
        if (!navigator.geolocation) return;

        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 5000
                });
            });

            const lon = position.coords.longitude;
            const lat = position.coords.latitude;
            const accuracy = Number(position.coords.accuracy || 30);
            const coordinate = fromLonLat([lon, lat]);

            this.userLocationSource.clear();
            this.userLocationSource.addFeature(new Feature({
                geometry: new CircleGeom(coordinate, accuracy),
                kind: 'accuracy'
            }));
            this.userLocationSource.addFeature(new Feature({
                geometry: new Point(coordinate),
                kind: 'position'
            }));

            this.map.getView().animate({
                center: coordinate,
                zoom: 18,
                duration: 900
            });
        } catch {
            // Keep silent: UI layer can decide whether to notify errors.
        }
    }

    private applyBasemap(rawBasemapId: string): void {
        const basemapId = normalizeBasemapId(rawBasemapId);

        switch (basemapId) {
            case 'google':
                this.baseLayer.setSource(buildGoogleSource());
                this.labelLayer.setVisible(false);
                break;
            case 'google_standard':
                this.baseLayer.setSource(buildGoogleStandardSource());
                this.labelLayer.setVisible(false);
                break;
            case 'google_clean':
                this.baseLayer.setSource(buildGoogleCleanSource());
                this.labelLayer.setVisible(false);
                break;
            case 'tianDiTu':
                this.baseLayer.setSource(buildTiandituImageSource());
                this.labelLayer.setSource(buildTiandituImageLabelSource());
                this.labelLayer.setVisible(true);
                break;
            case 'tianDiTu_vec':
                this.baseLayer.setSource(buildTiandituVectorSource());
                this.labelLayer.setSource(buildTiandituVectorLabelSource());
                this.labelLayer.setVisible(true);
                break;
            case 'esri':
                this.baseLayer.setSource(buildEsriSource());
                this.labelLayer.setVisible(false);
                break;
            case 'osm':
                this.baseLayer.setSource(new OSM());
                this.labelLayer.setVisible(false);
                break;
            case 'amap':
                this.baseLayer.setSource(buildAmapSource());
                this.labelLayer.setVisible(false);
                break;
            case 'tengxun':
                this.baseLayer.setSource(buildTengxunSource());
                this.labelLayer.setVisible(false);
                break;
            case 'esri_ocean':
                this.baseLayer.setSource(buildEsriOceanSource());
                this.labelLayer.setVisible(false);
                break;
            case 'esri_terrain':
                this.baseLayer.setSource(buildEsriTerrainSource());
                this.labelLayer.setVisible(false);
                break;
            case 'esri_physical':
                this.baseLayer.setSource(buildEsriPhysicalSource());
                this.labelLayer.setVisible(false);
                break;
            case 'esri_hillshade':
                this.baseLayer.setSource(buildEsriHillshadeSource());
                this.labelLayer.setVisible(false);
                break;
            case 'esri_gray':
                this.baseLayer.setSource(buildEsriGraySource());
                this.labelLayer.setVisible(false);
                break;
            case 'gggis_time':
                this.baseLayer.setSource(buildGggisTimeSource());
                this.labelLayer.setVisible(false);
                break;
            case 'yandex_sat':
                this.baseLayer.setSource(buildYandexSatSource());
                this.labelLayer.setVisible(false);
                break;
            case 'geoq_gray':
                this.baseLayer.setSource(buildGeoQGraySource());
                this.labelLayer.setVisible(false);
                break;
            case 'geoq_hydro':
                this.baseLayer.setSource(buildGeoQHydroSource());
                this.labelLayer.setVisible(false);
                break;
            case 'custom': {
                const source = buildCustomSource(this.mapStateStore.customBasemapUrl);
                this.baseLayer.setSource(source || buildGoogleSource());
                this.labelLayer.setVisible(false);
                break;
            }
            case 'local':
                this.baseLayer.setSource(buildLocalSource());
                this.labelLayer.setVisible(false);
                break;
            default:
                this.baseLayer.setSource(buildGoogleSource());
                this.labelLayer.setVisible(false);
                break;
        }
    }
}
