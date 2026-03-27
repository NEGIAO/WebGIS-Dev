import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import { defaults as defaultControls } from 'ol/control';
import { fromLonLat, toLonLat } from 'ol/proj';
import { unByKey } from 'ol/Observable';
import type { EventsKey } from 'ol/events';
import { watch, type WatchStopHandle } from 'vue';
import { useMapStateStore } from '../../stores/mapStateStore';
import { LayerRenderer } from './LayerRenderer';
import { RouteRenderer } from './RouteRenderer';
import { DrawController } from './DrawController';

const NORM_BASE = '/';
const TIANDITU_TK = '4267820f43926eaf808d61dc07269beb';

const VIEW_EPSILON = 1e-6;
const ZOOM_EPSILON = 1e-3;

type BasemapId =
    | 'google'
    | 'tianDiTu'
    | 'tianDiTu_vec'
    | 'esri'
    | 'osm'
    | 'amap'
    | 'local';

const SUPPORTED_BASEMAPS: BasemapId[] = ['google', 'tianDiTu', 'tianDiTu_vec', 'esri', 'osm', 'amap', 'local'];

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

        this.map = new Map({
            target: targetElement,
            layers: [this.baseLayer, this.labelLayer],
            view: new View({
                center: fromLonLat(this.mapStateStore.center),
                zoom: this.mapStateStore.zoom,
                minZoom: 0,
                maxZoom: 22
            }),
            controls: defaultControls({ rotate: false })
        });

        this.layerRenderer = new LayerRenderer(this.map);
        this.routeRenderer = new RouteRenderer(this.map);
        this.drawController = new DrawController(this.map);

        this.bindStoreWatchers();
        this.bindMapEvents();
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

        this.stopHandles.push(stopBasemapWatch, stopViewWatch);
    }

    private bindMapEvents(): void {
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
            this.isWritingFromMap = false;

            if (this.isApplyingStoreView) {
                this.isApplyingStoreView = false;
            }
        });
    }

    private applyBasemap(rawBasemapId: string): void {
        const basemapId = normalizeBasemapId(rawBasemapId);

        switch (basemapId) {
            case 'google':
                this.baseLayer.setSource(buildGoogleSource());
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
