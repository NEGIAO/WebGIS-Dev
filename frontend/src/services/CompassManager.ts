import { watch, type WatchStopHandle } from 'vue';
import type Map from 'ol/Map';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { fromLonLat, toLonLat } from 'ol/proj';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import { unByKey } from 'ol/Observable';
import type { useCompassStore } from '../stores/useCompassStore';
import { createCompassVectorStyleRenderer } from './compassVectorRenderer';
import { readCompassUrlState, writeCompassUrlState } from './compassUrlState';

type CompassStore = ReturnType<typeof useCompassStore>;

type CompassManagerOptions = {
    map: Map;
    store: CompassStore;
    mapContainerElement?: HTMLElement | null;
};

/**
 * CompassManager encapsulates all map-bound compass responsibilities:
 * - vector layer mount/unmount
 * - geographic feature placement
 * - resolution-based scaling via style renderer
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
    private viewResolutionKey: any = null;

    private singleClickHandler: ((event: MapBrowserEvent<UIEvent>) => void) | null = null;
    private moveEndHandler: (() => void) | null = null;
    private resizeHandler: (() => void) | null = null;

    private orientationHandler: ((event: DeviceOrientationEvent & { webkitCompassHeading?: number }) => void) | null = null;

    private urlSyncTimer: number | null = null;

    private clearStyleCache: (() => void) | null = null;

    constructor(options: CompassManagerOptions) {
        this.map = options.map;
        this.store = options.store;
        this.mapContainerElement = options.mapContainerElement || null;
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

        this.clearStyleCache?.();
        this.clearStyleCache = null;

        if (this.mapContainerElement) {
            this.mapContainerElement.classList.remove('compass-placement-mode');
        }
    }

    private ensureVectorLayer(): void {
        if (this.layer) return;

        const styleRenderer = createCompassVectorStyleRenderer(() => ({
            enabled: Boolean(this.store.enabled),
            mode: this.store.mode,
            opacity: Number(this.store.opacity || 0.9),
            rotation: Number(this.store.rotation || 0),
            physicalDiameterMeters: Number(this.store.physicalDiameterMeters || 220),
            minResolution: Number(this.store.minResolution || 450),
            config: this.store.vectorRenderConfig,
            renderCacheToken: String(this.store.renderCacheToken || '')
        }));

        this.clearStyleCache = styleRenderer.clearCache;

        this.source = new VectorSource();
        this.feature = new Feature<Point>(new Point(fromLonLat([this.store.position.lng, this.store.position.lat])));
        this.source.addFeature(this.feature);

        this.layer = new VectorLayer({
            source: this.source,
            style: styleRenderer.style,
            updateWhileAnimating: true,
            updateWhileInteracting: true,
            zIndex: 1205,
            visible: true
        });

        this.map.addLayer(this.layer);
    }

    private unbindMapListeners(): void {
        if (this.singleClickHandler) {
            this.map.un('singleclick', this.singleClickHandler);
            this.singleClickHandler = null;
        }

        if (this.moveEndHandler) {
            this.map.un('moveend', this.moveEndHandler);
            this.moveEndHandler = null;
        }

        if (this.viewResolutionKey) {
            unByKey(this.viewResolutionKey);
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
            this.map.on('singleclick', this.singleClickHandler);
        }

        if (!this.moveEndHandler) {
            this.moveEndHandler = () => {
                this.scheduleUrlSync();
                this.requestRender();
            };
            this.map.on('moveend', this.moveEndHandler);
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
                () => this.store.enabled && this.store.sensorEnabled,
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
                    this.clearStyleCache?.();
                    this.requestRender();
                    this.scheduleUrlSync();
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
    private handleMapSingleClick = (event: MapBrowserEvent<UIEvent>): void => {
        if (!this.store.enabled || this.store.mode !== 'vector' || !this.store.placementMode) return;

        const coordinate = event?.coordinate;
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
                rotation: Number(this.store.rotation || 0),
                cid: String(this.store.cid || ''),
                mode: this.store.mode
            });
        }, 120);
    }

    /**
     * Restore persisted compass state from URL, then load cid config if present.
     */
    private async restoreFromUrlState(): Promise<void> {
        const urlState = readCompassUrlState();

        if (urlState.cid) {
            await this.store.setCidAndLoad(urlState.cid);
        }

        if (Number.isFinite(Number(urlState.lng)) && Number.isFinite(Number(urlState.lat))) {
            this.store.setPosition(Number(urlState.lng), Number(urlState.lat));
            this.store.setEnabled(true);
        }

        if (Number.isFinite(Number(urlState.rotation))) {
            this.store.setRotation(Number(urlState.rotation));
        }

        if (urlState.mode === 'vector' || urlState.mode === 'hud') {
            this.store.setMode(urlState.mode);
        }
    }
}
