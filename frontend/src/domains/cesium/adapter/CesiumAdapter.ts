/**
 * Cesium 三维地图引擎适配器实现 (CesiumAdapter)
 *
 * 规范来源：Docs/Architecture/ 与 P2 跨引擎 UI 解耦统一架构蓝图
 * 职责：实现 IMapEngineAdapter，对接 Cesium 3D 球体底座，将通用命令翻译为三维视锥与实体/图层调用。
 */

import type {
    CameraViewOptions,
    EngineCapabilities,
    EngineType,
    IMapEngineAdapter,
    MapEngineEvent,
    MapEventListener,
    ToolType,
} from '@common/map-adapter';
import { getActiveMapEngineAdapter, mapCommandBus } from '@common/map-adapter';
import { olZoomToCesiumHeight } from '@common/utils/viewScale';

export interface CesiumAdapterOptions {
    /** 获取底层 Cesium.Viewer 实例的惰性求值函数 */
    getViewer: () => any;
    /** 可选的底图切换钩子 */
    onSetBasemap?: (id: string) => Promise<void> | void;
}

export class CesiumAdapter implements IMapEngineAdapter {
    readonly engineType: EngineType = 'cesium';

    readonly capabilities: Readonly<EngineCapabilities> = Object.freeze({
        supports3D: true,
        supportsTerrain: true,
        supportsViewshed: true,
        supportsShadows: true,
        supportsDrawing2D: true,
        supportsSwipe: false,
    });

    private getViewerInstance: () => any;
    private onSetBasemapHook?: (id: string) => Promise<void> | void;
    private activeTool: ToolType = 'none';
    private eventListeners = new Map<MapEngineEvent, Set<MapEventListener>>();
    private busUnsubscribeList: Array<() => void> = [];

    constructor(options: CesiumAdapterOptions) {
        this.getViewerInstance = options.getViewer;
        this.onSetBasemapHook = options.onSetBasemap;
        this.initBusListeners();
    }

    /**
     * 命令总线是全局单例，OL 与 Cesium 适配器会同时订阅同一批命令；
     * 仅当本引擎为当前活跃引擎时才响应，否则一次 dispatch 会驱动两个引擎同时动作。
     */
    private isActiveEngine(): boolean {
        return getActiveMapEngineAdapter() === this;
    }

    private initBusListeners(): void {
        const unCamera = mapCommandBus.subscribe<CameraViewOptions>('camera:flyTo', (cmd) => {
            if (!this.isActiveEngine() || !cmd.payload) return;
            void this.flyTo(cmd.payload);
        });
        this.busUnsubscribeList.push(unCamera);

        const unTool = mapCommandBus.subscribe<{ toolType: ToolType; options?: Record<string, unknown> }>(
            'tool:activate',
            (cmd) => {
                if (!this.isActiveEngine() || !cmd.payload) return;
                this.activateTool(cmd.payload.toolType, cmd.payload.options);
            },
        );
        const unDeactivate = mapCommandBus.subscribe('tool:deactivate', () => {
            if (!this.isActiveEngine()) return;
            this.deactivateTool();
        });
        this.busUnsubscribeList.push(unTool, unDeactivate);
    }

    isReady(): boolean {
        const viewer = this.getViewerInstance();
        return Boolean(viewer && !viewer.isDestroyed?.() && viewer.camera);
    }

    async flyTo(options: CameraViewOptions): Promise<void> {
        const viewer = this.getViewerInstance();
        const CesiumNs = (window as any).Cesium;
        if (!viewer || !viewer.camera || !CesiumNs) return;

        const [lng, lat] = options.center;
        const height =
            options.zoom !== undefined
                ? (olZoomToCesiumHeight({ zoom: options.zoom, centerLat: lat }) ?? 5000)
                : (viewer.camera.positionCartographic?.height ?? 5000);

        const headingRad =
            options.heading !== undefined
                ? CesiumNs.Math.toRadians(options.heading)
                : viewer.camera.heading;

        const pitchRad =
            options.pitch !== undefined
                ? CesiumNs.Math.toRadians(options.pitch)
                : viewer.camera.pitch;

        const durationSec = (options.duration ?? 800) / 1000;

        return new Promise<void>((resolve) => {
            try {
                viewer.camera.flyTo({
                    destination: CesiumNs.Cartesian3.fromDegrees(lng, lat, height),
                    orientation: {
                        heading: headingRad,
                        pitch: pitchRad,
                        roll: options.roll !== undefined ? CesiumNs.Math.toRadians(options.roll) : 0,
                    },
                    duration: durationSec,
                    complete: () => {
                        this.emit('view-change', { center: options.center, zoom: options.zoom, height });
                        resolve();
                    },
                    cancel: () => resolve(),
                });
            } catch (err) {
                // 视锥构造失败（如非法经纬度）时不得让 Promise 悬挂，否则调用方 await 永久挂起
                console.error('[CesiumAdapter] flyTo failed:', err);
                resolve();
            }
        });
    }

    getViewExtent(): [number, number, number, number] {
        const viewer = this.getViewerInstance();
        const CesiumNs = (window as any).Cesium;
        if (!viewer || !viewer.camera || !CesiumNs) return [-180, -90, 180, 90];

        try {
            const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
            if (rect) {
                const minLng = CesiumNs.Math.toDegrees(rect.west);
                const minLat = CesiumNs.Math.toDegrees(rect.south);
                const maxLng = CesiumNs.Math.toDegrees(rect.east);
                const maxLat = CesiumNs.Math.toDegrees(rect.north);
                return [minLng, minLat, maxLng, maxLat];
            }
        } catch {
            // fallback
        }
        return [-180, -90, 180, 90];
    }

    async setBasemap(id: string): Promise<void> {
        if (this.onSetBasemapHook) {
            await this.onSetBasemapHook(id);
        }
        this.emit('basemap-change', { id });
    }

    setLayerVisibility(layerId: string, visible: boolean): void {
        const viewer = this.getViewerInstance();
        if (!viewer) return;

        // 1. 尝试匹配 ImageryLayers
        if (viewer.imageryLayers) {
            const layers = viewer.imageryLayers;
            for (let i = 0; i < layers.length; i++) {
                const layer = layers.get(i);
                if (layer?.id === layerId || layer?.name === layerId) {
                    layer.show = visible;
                }
            }
        }

        // 2. 尝试匹配 3D Tileset 原语
        if (viewer.scene?.primitives) {
            const primitives = viewer.scene.primitives;
            for (let i = 0; i < primitives.length; i++) {
                const p = primitives.get(i);
                if (p?.id === layerId || p?.name === layerId) {
                    p.show = visible;
                }
            }
        }

        this.emit('layer-change', { layerId, visible });
    }

    setLayerOpacity(layerId: string, opacity: number): void {
        const viewer = this.getViewerInstance();
        if (!viewer || !viewer.imageryLayers) return;

        const layers = viewer.imageryLayers;
        const alpha = Math.max(0, Math.min(1, opacity));
        for (let i = 0; i < layers.length; i++) {
            const layer = layers.get(i);
            if (layer?.id === layerId || layer?.name === layerId) {
                layer.alpha = alpha;
            }
        }
    }

    getActiveTool(): ToolType {
        return this.activeTool;
    }

    activateTool(toolType: ToolType, options?: Record<string, unknown>): void {
        this.activeTool = toolType;
        this.emit('tool-change', { toolType, options });
    }

    deactivateTool(): void {
        this.activeTool = 'none';
        this.emit('tool-change', { toolType: 'none' });
    }

    on(event: MapEngineEvent, handler: MapEventListener): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event)!.add(handler);
    }

    off(event: MapEngineEvent, handler: MapEventListener): void {
        const set = this.eventListeners.get(event);
        if (set) {
            set.delete(handler);
            if (set.size === 0) {
                this.eventListeners.delete(event);
            }
        }
    }

    private emit(event: MapEngineEvent, payload: unknown): void {
        const set = this.eventListeners.get(event);
        if (set) {
            set.forEach((h: MapEventListener) => {
                try {
                    h(payload);
                } catch (e) {
                    console.error(`[CesiumAdapter] Error in event listener "${event}":`, e);
                }
            });
        }
    }

    destroy(): void {
        this.busUnsubscribeList.forEach((unsub) => unsub());
        this.busUnsubscribeList = [];
        this.eventListeners.clear();
    }
}
