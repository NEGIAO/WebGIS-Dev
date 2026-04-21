import { watch, type WatchStopHandle } from 'vue';
import type Map from 'ol/Map';
import Overlay from 'ol/Overlay';
import { fromLonLat, toLonLat } from 'ol/proj';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import { unByKey } from 'ol/Observable';
import type { useCompassStore } from '../../stores/useCompassStore';
import { readCompassPayloadFromUrl, writeCompassPayloadToUrl } from './compassUrlState';

type CompassStore = ReturnType<typeof useCompassStore>;

type CompassManagerOptions = {
    map: Map;
    store: CompassStore;
    overlayElement: HTMLElement;
    mapContainerElement?: HTMLElement | null;
};

/**
 * CompassManager encapsulates map overlay lifecycle, geographic scaling,
 * placement mode and orientation sensor sync for the compass feature.
 */
export class CompassManager {
    private readonly map: Map;
    private readonly store: CompassStore;
    private readonly overlayElement: HTMLElement;
    private readonly mapContainerElement: HTMLElement | null;

    private overlay: Overlay | null = null;
    private stopHandles: WatchStopHandle[] = [];
    private viewResolutionEventKey: any = null;

    private rafId: number | null = null;
    private urlSyncTimer: number | null = null;

    private placementClickHandler: ((event: MapBrowserEvent<UIEvent>) => void) | null = null;
    private moveEndHandler: (() => void) | null = null;
    private resizeHandler: (() => void) | null = null;
    private orientationHandler: ((event: DeviceOrientationEvent & { webkitCompassHeading?: number }) => void) | null = null;

    constructor(options: CompassManagerOptions) {
        this.map = options.map;
        this.store = options.store;
        this.overlayElement = options.overlayElement;
        this.mapContainerElement = options.mapContainerElement || null;
    }

    /**
     * Initialize manager by restoring URL state, mounting overlay and binding listeners.
     */
    init(): void {
        this.restoreStateFromUrl();
        this.mountOverlay();
        this.bindMapListeners();
        this.bindStoreListeners();
        this.updatePlacementCursor();
        this.scheduleFrameUpdate();
        this.updateOverlayPosition();
        this.scheduleUrlSync();
    }

    /**
     * Dispose all listeners, animation frames and overlay resources.
     */
    dispose(): void {
        this.stopHandles.forEach((stop) => stop());
        this.stopHandles = [];

        this.unbindMapListeners();
        this.stopDeviceOrientationSync();

        if (this.rafId !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        if (this.urlSyncTimer !== null && typeof window !== 'undefined') {
            window.clearTimeout(this.urlSyncTimer);
            this.urlSyncTimer = null;
        }

        this.unmountOverlay();
    }

    private normalizeHeading(value: number): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        const compact = numeric % 360;
        return compact < 0 ? compact + 360 : compact;
    }

    /**
     * Calculate compass pixel diameter from real-world meters and map resolution.
     */
    private updatePhysicalRenderSize(): void {
        const view = this.map.getView?.();
        if (!view) return;

        const resolution = Number(view.getResolution?.());
        if (!Number.isFinite(resolution) || resolution <= 0) return;

        const projection = view.getProjection?.();
        const metresPerUnitRaw = Number(projection?.getMetersPerUnit?.());
        const metresPerUnit = Number.isFinite(metresPerUnitRaw) && metresPerUnitRaw > 0
            ? metresPerUnitRaw
            : 1;

        const worldDiameterMeters = Number(this.store.realWorldDiameterMeters || 220);
        if (!Number.isFinite(worldDiameterMeters) || worldDiameterMeters <= 0) return;

        const scaledMeters = worldDiameterMeters * Number(this.store.scale || 1);
        const pixelDiameter = scaledMeters / (resolution * metresPerUnit);
        this.store.setRenderPixelDiameter(pixelDiameter);
    }

    private scheduleFrameUpdate(): void {
        if (typeof window === 'undefined') {
            this.updatePhysicalRenderSize();
            this.updateOverlayPosition();
            return;
        }

        if (this.rafId !== null) return;

        this.rafId = window.requestAnimationFrame(() => {
            this.rafId = null;
            this.updatePhysicalRenderSize();
            this.updateOverlayPosition();
        });
    }

    private mountOverlay(): void {
        if (this.overlay || !this.overlayElement) return;

        this.overlay = new Overlay({
            element: this.overlayElement,
            positioning: 'center-center',
            stopEvent: false
        });

        this.map.addOverlay(this.overlay);
    }

    private unmountOverlay(): void {
        if (!this.overlay) return;
        this.map.removeOverlay(this.overlay);
        this.overlay = null;
    }

    private updateOverlayPosition(): void {
        if (!this.overlay) return;

        if (!this.store.enabled || !this.store.hasValidPosition) {
            this.overlay.setPosition(undefined);
            return;
        }

        this.overlay.setPosition(fromLonLat([this.store.position.lng, this.store.position.lat]));
    }

    private handlePlacementClick = (event: MapBrowserEvent<UIEvent>): void => {
        if (!this.store.enabled || !this.store.placementMode) return;

        const coordinate = event?.coordinate;
        if (!Array.isArray(coordinate) || coordinate.length < 2) return;

        const [lng, lat] = toLonLat(coordinate);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

        this.store.setPosition(lng, lat);
        this.scheduleUrlSync();
    };

    private bindMapListeners(): void {
        if (!this.placementClickHandler) {
            this.placementClickHandler = this.handlePlacementClick;
            this.map.on('singleclick', this.placementClickHandler);
        }

        if (!this.moveEndHandler) {
            this.moveEndHandler = () => {
                this.scheduleFrameUpdate();
                this.scheduleUrlSync();
            };
            this.map.on('moveend', this.moveEndHandler);
        }

        const view = this.map.getView?.();
        if (view && !this.viewResolutionEventKey) {
            this.viewResolutionEventKey = view.on('change:resolution', () => {
                this.scheduleFrameUpdate();
            });
        }

        if (!this.resizeHandler && typeof window !== 'undefined') {
            this.resizeHandler = () => {
                this.scheduleFrameUpdate();
            };
            window.addEventListener('resize', this.resizeHandler);
        }
    }

    private unbindMapListeners(): void {
        if (this.placementClickHandler) {
            this.map.un('singleclick', this.placementClickHandler);
            this.placementClickHandler = null;
        }

        if (this.moveEndHandler) {
            this.map.un('moveend', this.moveEndHandler);
            this.moveEndHandler = null;
        }

        if (this.viewResolutionEventKey) {
            unByKey(this.viewResolutionEventKey);
            this.viewResolutionEventKey = null;
        }

        if (this.resizeHandler && typeof window !== 'undefined') {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
    }

    private updatePlacementCursor(): void {
        if (!this.mapContainerElement) return;

        const active = this.store.enabled && this.store.placementMode;
        this.mapContainerElement.classList.toggle('compass-placement-mode', active);
    }

    private handleDeviceOrientation = (event: DeviceOrientationEvent & { webkitCompassHeading?: number }): void => {
        if (!this.store.enabled || !this.store.sensorEnabled) return;

        const headingFromWebkit = Number(event?.webkitCompassHeading);
        if (Number.isFinite(headingFromWebkit)) {
            this.store.setRotation(this.normalizeHeading(headingFromWebkit));
            this.scheduleUrlSync();
            return;
        }

        const alpha = Number(event?.alpha);
        if (!Number.isFinite(alpha)) return;

        const heading = (360 - alpha) % 360;
        this.store.setRotation(this.normalizeHeading(heading));
        this.scheduleUrlSync();
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

    private bindStoreListeners(): void {
        this.stopHandles.push(
            watch(
                () => this.store.enabled,
                (enabled) => {
                    if (!enabled) {
                        this.store.setPlacementMode(false);
                        this.store.setSensorEnabled(false);
                    }
                    this.updateOverlayPosition();
                    this.updatePlacementCursor();
                    this.scheduleUrlSync();
                },
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => [this.store.position.lng, this.store.position.lat],
                () => {
                    this.updateOverlayPosition();
                    this.scheduleUrlSync();
                },
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.scale,
                () => {
                    this.scheduleFrameUpdate();
                    this.scheduleUrlSync();
                },
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.realWorldDiameterMeters,
                () => {
                    this.scheduleFrameUpdate();
                    this.scheduleUrlSync();
                },
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.rotation,
                () => this.scheduleUrlSync()
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.urlStyleSyncToken,
                () => this.scheduleUrlSync()
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.enabled && this.store.placementMode,
                () => this.updatePlacementCursor(),
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
    }

    private buildUrlPayload() {
        return {
            lng: Number(this.store.position?.lng),
            lat: Number(this.store.position?.lat),
            rotation: Number(this.store.rotation || 0),
            scale: Number(this.store.scale || 1),
            enabled: Boolean(this.store.enabled),
            diameterMeters: Number(this.store.realWorldDiameterMeters || 220),
            themeId: String(this.store.activeThemeId || ''),
            style: this.store.exportUrlStyleState()
        };
    }

    private scheduleUrlSync(): void {
        if (typeof window === 'undefined') return;

        if (this.urlSyncTimer !== null) {
            window.clearTimeout(this.urlSyncTimer);
        }

        this.urlSyncTimer = window.setTimeout(() => {
            this.urlSyncTimer = null;
            writeCompassPayloadToUrl(this.buildUrlPayload());
        }, 120);
    }

    private restoreStateFromUrl(): void {
        const payload = readCompassPayloadFromUrl();
        if (payload) {
            this.store.hydrateFromUrlPayload(payload);
        }

        if (!this.store.hasValidPosition) {
            const center = this.map.getView?.()?.getCenter?.();
            if (Array.isArray(center) && center.length >= 2) {
                const [lng, lat] = toLonLat(center);
                if (Number.isFinite(lng) && Number.isFinite(lat)) {
                    this.store.setPosition(lng, lat);
                }
            }
        }
    }
}
