import { watch, type WatchStopHandle } from 'vue';
import type Map from 'ol/Map';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import { fromLonLat, toLonLat } from 'ol/proj';
import { offset as offsetLonLat } from 'ol/sphere';
import { unByKey } from 'ol/Observable';
import type { useCompassStore } from '../stores/useCompassStore';
import type { FengShuiCompassConfig, Layer } from '../components/feng-shui-compass-svg/types';
import { readCompassUrlState, writeCompassUrlState } from './compassUrlState';

type CompassStore = ReturnType<typeof useCompassStore>;

type CompassManagerOptions = {
    map: Map;
    store: CompassStore;
    mapContainerElement?: HTMLElement | null;
};

const BASE_CONFIG_SIZE = 800;

function clamp(value: number, minValue: number, maxValue: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return minValue;
    return Math.max(minValue, Math.min(maxValue, numeric));
}

function normalizeAngle(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const compact = numeric % 360;
    return compact < 0 ? compact + 360 : compact;
}

function toLayerArray(data: FengShuiCompassConfig['data']): Layer[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return [data as Layer];
    return [];
}

function resolveTextColor(layer: Layer, textIndex = 0): string {
    const fallback = '#F8FAFC';
    if (Array.isArray(layer?.textColor)) {
        return String(layer.textColor[textIndex] || layer.textColor[0] || fallback);
    }
    return String(layer?.textColor || fallback);
}

function resolvePoint(pixelCoordinates: unknown): [number, number] | null {
    if (!Array.isArray(pixelCoordinates)) return null;

    if (Array.isArray(pixelCoordinates[0])) {
        const first = pixelCoordinates[0];
        if (!Array.isArray(first) || first.length < 2) return null;
        const x = Number(first[0]);
        const y = Number(first[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return [x, y];
    }

    if (pixelCoordinates.length < 2) return null;
    const x = Number(pixelCoordinates[0]);
    const y = Number(pixelCoordinates[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y];
}

function drawRadialText(
    ctx: CanvasRenderingContext2D,
    angleRad: number,
    radiusPx: number,
    text: string,
    fontSize: number,
    color: string
): void {
    const content = String(text || '').trim();
    if (!content) return;

    const x = Math.cos(angleRad) * radiusPx;
    const y = Math.sin(angleRad) * radiusPx;

    ctx.save();
    ctx.translate(x, y);

    let rotate = angleRad + Math.PI / 2;
    if (rotate > Math.PI / 2 && rotate < (Math.PI * 3) / 2) {
        rotate += Math.PI;
    }

    ctx.rotate(rotate);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(fontSize)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.75, fontSize * 0.12);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.52)';
    ctx.strokeText(content, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(content, 0, 0);
    ctx.restore();
}

/**
 * CompassManager encapsulates all map-bound compass responsibilities:
 * - vector layer mount/unmount
 * - geographic feature placement
 * - native canvas vector rendering in OpenLayers renderer pipeline
 * - sensor heading synchronization
 * - URL state synchronization
 */
export class CompassManager {
    private readonly map: Map;
    private readonly store: CompassStore;
    private readonly mapContainerElement: HTMLElement | null;

    private source: VectorSource | null = null;
    private feature: Feature<Point> | null = null;
    private layer: VectorLayer<VectorSource> | null = null;

    private stopHandles: WatchStopHandle[] = [];
    private viewResolutionKey: unknown = null;

    private singleClickHandler: ((event: MouseEvent) => void) | null = null;
    private resizeHandler: (() => void) | null = null;

    private orientationHandler: ((event: DeviceOrientationEvent & { webkitCompassHeading?: number }) => void) | null = null;

    private urlSyncTimer: number | null = null;

    private readonly style: Style;

    constructor(options: CompassManagerOptions) {
        this.map = options.map;
        this.store = options.store;
        this.mapContainerElement = options.mapContainerElement || null;
        this.style = this.createNativeCanvasStyle();
    }

    /**
     * Initialize manager lifecycle, restore URL state and mount vector compass layer.
     */
    async init(): Promise<void> {
        await this.store.ensureConfigLoaded();
        await this.restoreFromUrlState();
        this.ensureVectorLayer();
        this.syncFeatureGeometry();
        this.bindMapListeners();
        this.bindStoreWatchers();
        this.updateLayerVisibility();
        this.updatePlacementCursor();
        this.scheduleUrlSync();
        this.requestRender();
    }

    /**
     * Dispose manager and release all listeners/resources.
     */
    dispose(): void {
        this.stopHandles.forEach((stop) => stop());
        this.stopHandles = [];

        this.unbindMapListeners();
        this.stopDeviceOrientationSync();

        if (this.urlSyncTimer !== null && typeof window !== 'undefined') {
            window.clearTimeout(this.urlSyncTimer);
            this.urlSyncTimer = null;
        }

        if (this.layer) {
            this.map.removeLayer(this.layer);
            this.layer = null;
        }

        this.source = null;
        this.feature = null;

        if (this.mapContainerElement) {
            this.mapContainerElement.classList.remove('compass-placement-mode');
        }
    }

    private ensureVectorLayer(): void {
        if (this.layer) return;

        this.source = new VectorSource();
        this.feature = new Feature<Point>(new Point(fromLonLat([this.store.position.lng, this.store.position.lat])));
        this.source.addFeature(this.feature);

        this.layer = new VectorLayer({
            source: this.source,
            style: this.style,
            updateWhileAnimating: true,
            updateWhileInteracting: true,
            zIndex: 1205,
            visible: true
        });

        this.map.addLayer(this.layer);
    }

    private unbindMapListeners(): void {
        if (this.singleClickHandler) {
            this.map.getViewport().removeEventListener('click', this.singleClickHandler);
            this.singleClickHandler = null;
        }

        if (this.viewResolutionKey) {
            unByKey(this.viewResolutionKey as any);
            this.viewResolutionKey = null;
        }

        if (this.resizeHandler && typeof window !== 'undefined') {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
    }

    private bindMapListeners(): void {
        if (!this.singleClickHandler) {
            this.singleClickHandler = this.handleMapSingleClick;
            this.map.getViewport().addEventListener('click', this.singleClickHandler);
        }

        const view = this.map.getView?.();
        if (view && !this.viewResolutionKey) {
            this.viewResolutionKey = view.on('change:resolution', () => {
                this.requestRender();
            });
        }

        if (!this.resizeHandler && typeof window !== 'undefined') {
            this.resizeHandler = () => {
                this.requestRender();
            };
            window.addEventListener('resize', this.resizeHandler);
        }
    }

    private bindStoreWatchers(): void {
        this.stopHandles.push(
            watch(
                () => [this.store.position.lng, this.store.position.lat],
                () => {
                    this.syncFeatureGeometry();
                    this.scheduleUrlSync();
                },
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => [
                    this.store.enabled,
                    this.store.mode,
                    this.store.minResolution,
                    this.store.physicalDiameterMeters,
                    this.store.opacity,
                    this.store.rotation,
                    this.store.renderCacheToken
                ],
                () => {
                    this.updateLayerVisibility();
                    this.requestRender();
                    this.scheduleUrlSync();
                },
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.enabled && this.store.sensorEnabled && this.store.mode === 'hud',
                (active) => {
                    if (active) {
                        this.startDeviceOrientationSync();
                        return;
                    }
                    this.stopDeviceOrientationSync();
                },
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.enabled && this.store.mode === 'vector' && this.store.placementMode,
                () => this.updatePlacementCursor(),
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.cid,
                () => {
                    this.requestRender();
                }
            )
        );
    }

    /**
     * Update feature point geometry from store lon/lat state.
     */
    private syncFeatureGeometry(): void {
        if (!this.feature) return;

        if (!this.store.hasValidPosition) {
            const center = this.map.getView?.()?.getCenter?.();
            if (Array.isArray(center) && center.length >= 2) {
                const [lng, lat] = toLonLat(center);
                if (Number.isFinite(lng) && Number.isFinite(lat)) {
                    this.store.setPosition(lng, lat);
                }
            }
        }

        if (!this.store.hasValidPosition) return;

        const point = fromLonLat([this.store.position.lng, this.store.position.lat]);
        this.feature.setGeometry(new Point(point));
    }

    /**
     * Apply layer-level visibility and auto-hide threshold for zoomed-out views.
     */
    private updateLayerVisibility(): void {
        if (!this.layer) return;
        const visible = Boolean(this.store.enabled) && this.store.mode === 'vector';
        this.layer.setVisible(visible);

        // Auto-hide while zooming out: layer remains hidden above this max resolution.
        this.layer.setMaxResolution(Number(this.store.minResolution || 450));
    }

    private requestRender(): void {
        this.map.render();
    }

    /**
     * Handle map click placement while in vector placement mode.
     */
    private handleMapSingleClick = (event: MouseEvent): void => {
        if (!this.store.enabled || this.store.mode !== 'vector' || !this.store.placementMode) return;

        const coordinate = this.map.getEventCoordinate(event);
        if (!Array.isArray(coordinate) || coordinate.length < 2) return;

        const [lng, lat] = toLonLat(coordinate);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

        this.store.setPosition(lng, lat);
        this.scheduleUrlSync();
    };

    private updatePlacementCursor(): void {
        if (!this.mapContainerElement) return;

        const active = Boolean(this.store.enabled)
            && this.store.mode === 'vector'
            && Boolean(this.store.placementMode);

        this.mapContainerElement.classList.toggle('compass-placement-mode', active);
    }

    private normalizeHeading(value: number): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        const compact = numeric % 360;
        return compact < 0 ? compact + 360 : compact;
    }

    /**
     * Fuse hardware heading (webkitCompassHeading/alpha) into store rotation.
     */
    private handleDeviceOrientation = (
        event: DeviceOrientationEvent & { webkitCompassHeading?: number }
    ): void => {
        if (!this.store.enabled || !this.store.sensorEnabled) return;

        const iosHeading = Number(event?.webkitCompassHeading);
        if (Number.isFinite(iosHeading)) {
            this.store.setRotation(this.normalizeHeading(iosHeading));
            return;
        }

        const alpha = Number(event?.alpha);
        if (!Number.isFinite(alpha)) return;
        const heading = (360 - alpha) % 360;
        this.store.setRotation(this.normalizeHeading(heading));
    };

    private startDeviceOrientationSync(): void {
        if (typeof window === 'undefined' || this.orientationHandler) return;

        if (typeof DeviceOrientationEvent === 'undefined') {
            this.store.setSensorPermission('unsupported');
            this.store.setSensorEnabled(false);
            return;
        }

        this.orientationHandler = this.handleDeviceOrientation;
        window.addEventListener('deviceorientation', this.orientationHandler, true);
    }

    private stopDeviceOrientationSync(): void {
        if (typeof window === 'undefined' || !this.orientationHandler) return;
        window.removeEventListener('deviceorientation', this.orientationHandler, true);
        this.orientationHandler = null;
    }

    private scheduleUrlSync(): void {
        if (typeof window === 'undefined') return;

        if (this.urlSyncTimer !== null) {
            window.clearTimeout(this.urlSyncTimer);
        }

        this.urlSyncTimer = window.setTimeout(() => {
            this.urlSyncTimer = null;

            writeCompassUrlState({
                lng: Number(this.store.position?.lng),
                lat: Number(this.store.position?.lat),
                radius: Number(this.store.physicalDiameterMeters || 220) / 2
            });
        }, 120);
    }

    /**
     * Restore persisted compass state from URL, then load cid config if present.
     */
    private async restoreFromUrlState(): Promise<void> {
        const urlState = readCompassUrlState();

        if (Number.isFinite(Number(urlState.lng)) && Number.isFinite(Number(urlState.lat))) {
            const lng = Number(urlState.lng);
            const lat = Number(urlState.lat);

            this.store.setPosition(lng, lat);
            this.store.setEnabled(true);

            const center = fromLonLat([lng, lat]);
            this.map.getView()?.setCenter(center);
        }

        if (Number.isFinite(Number(urlState.radius))) {
            this.store.setPhysicalDiameterMeters(Number(urlState.radius) * 2);
        }
    }

    /**
     * Convert geographic meter radius to current pixel radius with geodesic sampling.
     */
    private samplePixelRadius(centerCoord: [number, number], radiusMeters: number): number {
        if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return Number.NaN;

        const view = this.map.getView?.();
        const projection = view?.getProjection?.();
        if (!projection) return Number.NaN;

        const centerLonLat = toLonLat(centerCoord, projection);
        if (!Array.isArray(centerLonLat) || centerLonLat.length < 2) return Number.NaN;

        // Build a geodesic point at due-east bearing so that ring size is meter-true.
        const edgeLonLat = offsetLonLat(
            [Number(centerLonLat[0]), Number(centerLonLat[1])],
            radiusMeters,
            Math.PI / 2
        );
        const edgeCoord = fromLonLat(edgeLonLat, projection);

        const centerPixel = this.map.getPixelFromCoordinate(centerCoord);
        const edgePixel = this.map.getPixelFromCoordinate(edgeCoord);
        if (!Array.isArray(centerPixel) || !Array.isArray(edgePixel)) return Number.NaN;

        const dx = Number(edgePixel[0]) - Number(centerPixel[0]);
        const dy = Number(edgePixel[1]) - Number(centerPixel[1]);
        const radiusPx = Math.hypot(dx, dy);

        if (!Number.isFinite(radiusPx) || radiusPx < 1) return Number.NaN;
        return radiusPx;
    }

    /**
     * Build OpenLayers custom canvas style renderer for native compass drawing.
     * All rings/text/crosshair are rendered directly in map canvas per frame.
     */
    private createNativeCanvasStyle(): Style {
        return new Style({
            renderer: (pixelCoordinates: unknown, renderState: any) => {
                if (!this.store.enabled || this.store.mode !== 'vector') return;

                const context = renderState?.context as CanvasRenderingContext2D | undefined;
                if (!context) return;

                const pointPixel = resolvePoint(pixelCoordinates);
                if (!pointPixel) return;

                const geometry = this.feature?.getGeometry?.() as Point | undefined;
                const centerCoordRaw = geometry?.getCoordinates?.();
                if (!Array.isArray(centerCoordRaw) || centerCoordRaw.length < 2) return;

                const centerCoord: [number, number] = [Number(centerCoordRaw[0]), Number(centerCoordRaw[1])];
                const centerX = Number(pointPixel[0]);
                const centerY = Number(pointPixel[1]);
                if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;

                const minResolution = Number(this.store.minResolution || 450);
                const resolution = Number(renderState?.resolution);
                if (Number.isFinite(minResolution) && Number.isFinite(resolution) && resolution > minResolution) {
                    return;
                }

                const radiusMeters = Number(this.store.physicalDiameterMeters || 220) / 2;
                const radiusPx = this.samplePixelRadius(centerCoord, radiusMeters);
                if (!Number.isFinite(radiusPx) || radiusPx < 2) return;

                const config = this.store.vectorRenderConfig;
                const layers = toLayerArray(config?.data);
                if (!layers.length) return;

                const line = config?.line || {
                    borderColor: '#AAAAAA',
                    scaleColor: '#AAAAAA',
                    scaleHighlightColor: '#FF0000'
                };

                const opacity = clamp(Number(this.store.opacity || 0.9), 0.1, 1);
                const rotationRad = (normalizeAngle(Number(this.store.rotation || 0)) * Math.PI) / 180;

                const configWidth = Number(config?.compassSize?.width || BASE_CONFIG_SIZE);
                const tianChiRadiusRaw = Number(config?.compassSize?.tianChiRadius || configWidth * 0.1);
                const tianChiRatio = clamp(tianChiRadiusRaw / Math.max(1, configWidth), 0.06, 0.22);
                const tianChiRadius = radiusPx * tianChiRatio;

                const hasScale = config?.isShowScale !== false;
                const contentOuterRadius = hasScale ? radiusPx * 0.82 : radiusPx * 0.95;
                const layerBand = Math.max(1, (contentOuterRadius - tianChiRadius) / Math.max(1, layers.length));

                context.save();
                context.globalAlpha = opacity;
                context.translate(centerX, centerY);
                context.rotate(rotationRad);

                const strokeWidth = Math.max(0.8, radiusPx / 260);
                context.lineWidth = strokeWidth;
                context.strokeStyle = String(line.borderColor || '#AAAAAA');

                // Tianchi core circle.
                context.beginPath();
                context.arc(0, 0, tianChiRadius, 0, Math.PI * 2);
                context.stroke();

                // LOD gate for dense layers.
                const showUltraDenseText = radiusPx >= 130;
                const showDenseText = radiusPx >= 95;

                layers.forEach((layer, layerIndex) => {
                    const innerR = tianChiRadius + layerBand * layerIndex;
                    const outerR = innerR + layerBand;

                    const countRaw = Array.isArray(layer?.data) ? layer.data.length : 0;
                    const segmentCount = Math.max(1, countRaw);
                    const startOffset = (Number(layer?.startAngle || 0) * Math.PI) / 180;

                    // Ring boundary.
                    context.beginPath();
                    context.arc(0, 0, outerR, 0, Math.PI * 2);
                    context.stroke();

                    // Segment dividers.
                    for (let i = 0; i < segmentCount; i += 1) {
                        const angle = -Math.PI / 2 + startOffset + (i * Math.PI * 2) / segmentCount;
                        const sx = Math.cos(angle) * innerR;
                        const sy = Math.sin(angle) * innerR;
                        const ex = Math.cos(angle) * outerR;
                        const ey = Math.sin(angle) * outerR;

                        context.beginPath();
                        context.moveTo(sx, sy);
                        context.lineTo(ex, ey);
                        context.stroke();
                    }

                    const shouldSkipText = (
                        (segmentCount >= 60 && !showUltraDenseText)
                        || (segmentCount >= 24 && !showDenseText)
                    );
                    if (shouldSkipText) return;

                    const defaultFont = clamp(Number(layer?.fontSize || 16), 8, 34) * (radiusPx / (BASE_CONFIG_SIZE / 2));

                    for (let i = 0; i < segmentCount; i += 1) {
                        const angleMid = -Math.PI / 2 + startOffset + ((i + 0.5) * Math.PI * 2) / segmentCount;
                        const label = Array.isArray(layer?.data) ? layer.data[i] : '';

                        if (Array.isArray(label)) {
                            const rows = label.map((item) => String(item || '').trim()).filter(Boolean);
                            const rowCount = Math.max(1, rows.length);
                            rows.forEach((rowText, rowIndex) => {
                                const rr = innerR + layerBand * ((rowIndex + 1) / (rowCount + 1));
                                drawRadialText(
                                    context,
                                    angleMid,
                                    rr,
                                    rowText,
                                    defaultFont * 0.76,
                                    resolveTextColor(layer, rowIndex)
                                );
                            });
                            continue;
                        }

                        drawRadialText(
                            context,
                            angleMid,
                            innerR + layerBand * 0.52,
                            String(label || ''),
                            defaultFont,
                            resolveTextColor(layer, i)
                        );
                    }
                });

                // Scale ring.
                if (hasScale) {
                    const scale = config?.scaclStyle || {
                        minLineHeight: 10,
                        midLineHeight: 20,
                        maxLineHeight: 25,
                        numberFontSize: 13
                    };

                    const baseScale = radiusPx / (BASE_CONFIG_SIZE / 2);
                    const shortLen = clamp(Number(scale.minLineHeight || 10) * baseScale, 2, 20);
                    const midLen = clamp(Number(scale.midLineHeight || 20) * baseScale, 3, 28);
                    const longLen = clamp(Number(scale.maxLineHeight || 25) * baseScale, 4, 36);
                    const numberFont = clamp(Number(scale.numberFontSize || 13) * baseScale, 8, 18);
                    const scaleInner = contentOuterRadius + 2;

                    for (let degree = 0; degree < 360; degree += 1) {
                        const angle = -Math.PI / 2 + (degree * Math.PI) / 180;
                        const ten = degree % 10 === 0;
                        const five = degree % 5 === 0;
                        const markLen = ten ? longLen : five ? midLen : shortLen;
                        const color = ten
                            ? String(line.scaleHighlightColor || '#FF0000')
                            : String(line.scaleColor || '#AAAAAA');

                        context.strokeStyle = color;
                        context.beginPath();
                        context.moveTo(Math.cos(angle) * scaleInner, Math.sin(angle) * scaleInner);
                        context.lineTo(Math.cos(angle) * (scaleInner + markLen), Math.sin(angle) * (scaleInner + markLen));
                        context.stroke();

                        if (ten && showDenseText) {
                            drawRadialText(
                                context,
                                angle,
                                scaleInner + markLen + numberFont,
                                String(degree),
                                numberFont,
                                color
                            );
                        }
                    }
                }

                // Tianxin cross: exactly 1/3 radius.
                if (config?.isShowTianxinCross !== false) {
                    context.strokeStyle = String(config?.tianxinCrossColor || '#FF0000');
                    context.lineWidth = clamp(Number(config?.tianxinCrossWidth || 2), 1, 8) * (radiusPx / (BASE_CONFIG_SIZE / 2));

                    const crossHalf = radiusPx / 3;
                    context.beginPath();
                    context.moveTo(-crossHalf, 0);
                    context.lineTo(crossHalf, 0);
                    context.stroke();

                    context.beginPath();
                    context.moveTo(0, -crossHalf);
                    context.lineTo(0, crossHalf);
                    context.stroke();
                }

                context.restore();
            }
        });
    }
}
