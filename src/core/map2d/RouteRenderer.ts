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

const BUS_STEP_COLOR_PALETTE = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
const DRIVE_STEP_COLOR_PALETTE = ['#10B981', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'];

const busOverviewStyle = new Style({
    stroke: new Stroke({ color: 'rgba(37, 99, 235, 0.36)', width: 4, lineCap: 'round', lineJoin: 'round' })
});

const driveOverviewStyle = new Style({
    stroke: new Stroke({ color: 'rgba(5, 150, 105, 0.35)', width: 4, lineCap: 'round', lineJoin: 'round' })
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

function getBusStepColor(stepIndex: number): string {
    const idx = Math.abs(Number(stepIndex || 0)) % BUS_STEP_COLOR_PALETTE.length;
    return BUS_STEP_COLOR_PALETTE[idx];
}

function getDriveStepColor(stepIndex: number): string {
    const idx = Math.abs(Number(stepIndex || 0)) % DRIVE_STEP_COLOR_PALETTE.length;
    return DRIVE_STEP_COLOR_PALETTE[idx];
}

function hexToRgba(hexColor: string, alpha = 1): string {
    const hex = String(hexColor || '').replace('#', '').trim();
    if (hex.length !== 6) return `rgba(59, 130, 246, ${alpha})`;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const stepStyleCache = new globalThis.Map<string, Style>();

function getStepStyle(stepIndex: number, mode: 'bus' | 'drive', isWalk: boolean, isActive: boolean): Style {
    const key = `${mode}_${stepIndex}_${isWalk ? 'walk' : 'line'}_${isActive ? 'active' : 'normal'}`;
    const cached = stepStyleCache.get(key);
    if (cached) return cached;

    const baseColor = mode === 'drive' ? getDriveStepColor(stepIndex) : getBusStepColor(stepIndex);
    const strokeColor = isWalk
        ? hexToRgba(baseColor, isActive ? 0.92 : 0.62)
        : hexToRgba(baseColor, isActive ? 0.98 : 0.9);

    const style = new Style({
        stroke: new Stroke({
            color: strokeColor,
            width: isActive ? (isWalk ? 6 : 8) : (isWalk ? 4 : 6),
            lineDash: isWalk ? [8, 6] : undefined,
            lineCap: 'round',
            lineJoin: 'round'
        })
    });

    stepStyleCache.set(key, style);
    return style;
}

export class RouteRenderer {
    private readonly map: OlMap;
    private readonly routeStore = useRouteStore();

    private readonly routeSource = new VectorSource();
    private readonly stepSource = new VectorSource();
    private readonly activeStepSource = new VectorSource();
    private readonly startSource = new VectorSource();
    private readonly endSource = new VectorSource();

    private readonly routeLayer = new VectorLayer({
        source: this.routeSource,
        zIndex: 1400,
        style: () => (this.routeStore.mode === 'drive' ? driveOverviewStyle : busOverviewStyle)
    });
    private readonly stepLayer = new VectorLayer({
        source: this.stepSource,
        zIndex: 1410,
        style: (feature) => {
            const stepIndex = Number(feature.get('stepIndex') || 0);
            const mode = (feature.get('mode') === 'drive' ? 'drive' : 'bus') as 'bus' | 'drive';
            const isWalk = !!feature.get('isWalk');
            return getStepStyle(stepIndex, mode, isWalk, false);
        }
    });
    private readonly activeStepLayer = new VectorLayer({
        source: this.activeStepSource,
        zIndex: 1420,
        style: (feature) => {
            const stepIndex = Number(feature.get('stepIndex') || 0);
            const mode = (feature.get('mode') === 'drive' ? 'drive' : 'bus') as 'bus' | 'drive';
            const isWalk = !!feature.get('isWalk');
            return getStepStyle(stepIndex, mode, isWalk, true);
        }
    });
    private readonly startLayer = new VectorLayer({ source: this.startSource, style: startMarkerStyle, zIndex: 1420 });
    private readonly endLayer = new VectorLayer({ source: this.endSource, style: endMarkerStyle, zIndex: 1420 });

    private stopWatch: WatchStopHandle | null = null;

    constructor(map: OlMap) {
        this.map = map;
        this.map.addLayer(this.routeLayer);
        this.map.addLayer(this.stepLayer);
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
        this.map.removeLayer(this.stepLayer);
        this.map.removeLayer(this.activeStepLayer);
        this.map.removeLayer(this.startLayer);
        this.map.removeLayer(this.endLayer);

        this.routeSource.clear();
        this.stepSource.clear();
        this.activeStepSource.clear();
        this.startSource.clear();
        this.endSource.clear();
    }

    private syncFromStore(): void {
        const route = this.routeStore.activeRoute;

        this.routeSource.clear();
        this.stepSource.clear();
        this.activeStepSource.clear();
        this.startSource.clear();
        this.endSource.clear();

        if (!route) return;

        const routeFeature = buildLineFeature(route.coordinates);
        if (routeFeature) {
            this.routeSource.addFeature(routeFeature);
        }

        route.steps.forEach((step, stepIndex) => {
            const feature = buildLineFeature(step.coordinates);
            if (!feature) return;
            const modeText = String(step.modeText || '').toLowerCase();
            const isWalk = modeText.includes('步行') || modeText.includes('walk');
            feature.set('stepIndex', stepIndex);
            feature.set('mode', route.mode === 'drive' ? 'drive' : 'bus');
            feature.set('isWalk', isWalk);
            this.stepSource.addFeature(feature);
        });

        const selectedStep = this.routeStore.activeStep;
        const stepFeature = selectedStep ? buildLineFeature(selectedStep.coordinates) : null;
        if (stepFeature) {
            const stepModeText = String(selectedStep.modeText || '').toLowerCase();
            const isWalk = stepModeText.includes('步行') || stepModeText.includes('walk');
            stepFeature.set('stepIndex', Number(this.routeStore.activeStepIndex || 0));
            stepFeature.set('mode', route.mode === 'drive' ? 'drive' : 'bus');
            stepFeature.set('isWalk', isWalk);
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
