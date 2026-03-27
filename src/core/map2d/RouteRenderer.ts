import { watch, type WatchStopHandle } from 'vue';
import type OlMap from 'ol/Map';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { fromLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { createEmpty, extend, isEmpty } from 'ol/extent';
import { useRouteStore, type LngLat } from '../../stores/routeStore';

function toMapCoordinates(path: LngLat[]): number[][] {
    return (Array.isArray(path) ? path : [])
        .map((point) => {
            const lng = Number(point?.[0]);
            const lat = Number(point?.[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            return fromLonLat([lng, lat]);
        })
        .filter(Boolean) as number[][];
}

function buildLineFeature(path: LngLat[]): Feature<LineString> | null {
    const coords = toMapCoordinates(path);
    if (coords.length < 2) return null;
    return new Feature({ geometry: new LineString(coords) });
}

function buildPointFeature(point: LngLat | null): Feature<Point> | null {
    if (!Array.isArray(point) || point.length < 2) return null;
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return new Feature({ geometry: new Point(fromLonLat([lng, lat])) });
}

const routeStyle = new Style({
    stroke: new Stroke({
        color: '#2563eb',
        width: 5
    })
});

const activeStepStyle = new Style({
    stroke: new Stroke({
        color: '#f97316',
        width: 7
    })
});

const startMarkerStyle = new Style({
    image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: '#16a34a' }),
        stroke: new Stroke({ color: '#14532d', width: 2 })
    })
});

const endMarkerStyle = new Style({
    image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: '#dc2626' }),
        stroke: new Stroke({ color: '#7f1d1d', width: 2 })
    })
});

export class RouteRenderer {
    private readonly map: OlMap;
    private readonly routeStore = useRouteStore();

    private readonly routeSource = new VectorSource();
    private readonly activeStepSource = new VectorSource();
    private readonly startSource = new VectorSource();
    private readonly endSource = new VectorSource();

    private readonly routeLayer = new VectorLayer({ source: this.routeSource, style: routeStyle, zIndex: 1400 });
    private readonly activeStepLayer = new VectorLayer({ source: this.activeStepSource, style: activeStepStyle, zIndex: 1410 });
    private readonly startLayer = new VectorLayer({ source: this.startSource, style: startMarkerStyle, zIndex: 1420 });
    private readonly endLayer = new VectorLayer({ source: this.endSource, style: endMarkerStyle, zIndex: 1420 });

    private stopWatch: WatchStopHandle | null = null;

    constructor(map: OlMap) {
        this.map = map;
        this.map.addLayer(this.routeLayer);
        this.map.addLayer(this.activeStepLayer);
        this.map.addLayer(this.startLayer);
        this.map.addLayer(this.endLayer);

        this.stopWatch = watch(
            () => [this.routeStore.activeRoute, this.routeStore.activeStepIndex],
            () => this.syncFromStore(),
            { immediate: true, deep: true }
        );
    }

    destroy(): void {
        if (this.stopWatch) {
            this.stopWatch();
            this.stopWatch = null;
        }

        this.map.removeLayer(this.routeLayer);
        this.map.removeLayer(this.activeStepLayer);
        this.map.removeLayer(this.startLayer);
        this.map.removeLayer(this.endLayer);

        this.routeSource.clear();
        this.activeStepSource.clear();
        this.startSource.clear();
        this.endSource.clear();
    }

    private syncFromStore(): void {
        const route = this.routeStore.activeRoute;

        this.routeSource.clear();
        this.activeStepSource.clear();
        this.startSource.clear();
        this.endSource.clear();

        if (!route) return;

        const routeFeature = buildLineFeature(route.coordinates);
        if (routeFeature) {
            this.routeSource.addFeature(routeFeature);
        }

        const selectedStep = this.routeStore.activeStep;
        const stepFeature = selectedStep ? buildLineFeature(selectedStep.coordinates) : null;
        if (stepFeature) {
            this.activeStepSource.addFeature(stepFeature);
        }

        const resolvedStart = route.start || route.coordinates[0] || null;
        const resolvedEnd = route.end || route.coordinates[route.coordinates.length - 1] || null;

        const startFeature = buildPointFeature(resolvedStart);
        const endFeature = buildPointFeature(resolvedEnd);

        if (startFeature) this.startSource.addFeature(startFeature);
        if (endFeature) this.endSource.addFeature(endFeature);

        this.smoothMoveToTarget(stepFeature || routeFeature);
    }

    private smoothMoveToTarget(feature: Feature<LineString> | null): void {
        if (!feature) return;

        const geometry = feature.getGeometry();
        if (!geometry) return;

        const extent = createEmpty();
        extend(extent, geometry.getExtent());
        if (isEmpty(extent)) return;

        this.map.getView().fit(extent, {
            padding: [80, 80, 80, 80],
            duration: 460,
            maxZoom: 17
        });
    }
}
