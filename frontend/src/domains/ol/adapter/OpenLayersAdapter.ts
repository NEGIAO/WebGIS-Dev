/**
 * OpenLayers 地图引擎适配器实现 (OpenLayersAdapter)
 *
 * 规范来源：Docs/Architecture/ 与 P2 跨引擎 UI 解耦统一架构蓝图
 * 职责：实现 IMapEngineAdapter，对接 OpenLayers 2D 地图底座，将通用命令翻译为 OL 原生调用。
 */

import type { Map as OlMap } from 'ol';
import { fromLonLat, toLonLat } from 'ol/proj';
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

export interface OpenLayersAdapterOptions {
    /** 获取底层 OpenLayers Map 实例的惰性求值函数 */
    getMap: () => OlMap | null | undefined;
    /** 可选的底图切换钩子 */
    onSetBasemap?: (id: string) => Promise<void> | void;
}

export class OpenLayersAdapter implements IMapEngineAdapter {
    readonly engineType: EngineType = 'openlayers';

    readonly capabilities: Readonly<EngineCapabilities> = Object.freeze({
        supports3D: false,
        supportsTerrain: false,
        supportsViewshed: false,
        supportsShadows: false,
        supportsDrawing2D: true,
        supportsSwipe: true,
    });

    private getMapInstance: () => OlMap | null | undefined;
    private onSetBasemapHook?: (id: string) => Promise<void> | void;
    private activeTool: ToolType = 'none';
    private eventListeners = new Map<MapEngineEvent, Set<MapEventListener>>();
    private busUnsubscribeList: Array<() => void> = [];

    constructor(options: OpenLayersAdapterOptions) {
        this.getMapInstance = options.getMap;
        this.onSetBasemapHook = options.onSetBasemap;
        this.initBusListeners();
    }

    /**
     * 命令总线为全局单例，二维与三维适配器会同时订阅；只有当前活跃引擎才可响应，
     * 否则一次 camera:flyTo 会同时驱动 2D 与 3D 两个底座。
     */
    private isActiveEngine(): boolean {
        return getActiveMapEngineAdapter() === this;
    }

    private initBusListeners(): void {
        // 监听来自命令总线的相机飞行动作
        const unCamera = mapCommandBus.subscribe<CameraViewOptions>('camera:flyTo', (cmd) => {
            if (!this.isActiveEngine() || !cmd.payload) return;
            void this.flyTo(cmd.payload);
        });
        this.busUnsubscribeList.push(unCamera);

        // 监听来自命令总线的工具激活/关闭动作
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
        const map = this.getMapInstance();
        return Boolean(map && map.getTargetElement());
    }

    async flyTo(options: CameraViewOptions): Promise<void> {
        const map = this.getMapInstance();
        if (!map) return;
        const view = map.getView();
        if (!view) return;

        const center3857 = fromLonLat(options.center);
        const targetZoom = options.zoom ?? view.getZoom() ?? 10;
        const duration = options.duration ?? 800;

        return new Promise<void>((resolve) => {
            view.animate(
                {
                    center: center3857,
                    zoom: targetZoom,
                    duration,
                },
                () => {
                    this.emit('view-change', { center: options.center, zoom: targetZoom });
                    resolve();
                },
            );
        });
    }

    getViewExtent(): [number, number, number, number] {
        const map = this.getMapInstance();
        if (!map) return [-180, -90, 180, 90];
        const view = map.getView();
        const size = map.getSize();
        if (!view || !size) return [-180, -90, 180, 90];

        const extent = view.calculateExtent(size);
        const [minLng, minLat] = toLonLat([extent[0], extent[1]]);
        const [maxLng, maxLat] = toLonLat([extent[2], extent[3]]);
        return [minLng, minLat, maxLng, maxLat];
    }

    async setBasemap(id: string): Promise<void> {
        if (this.onSetBasemapHook) {
            await this.onSetBasemapHook(id);
        }
        this.emit('basemap-change', { id });
    }

    setLayerVisibility(layerId: string, visible: boolean): void {
        const map = this.getMapInstance();
        if (!map) return;

        map.getLayers().forEach((layer) => {
            const id = layer.get('id') || layer.get('name');
            if (id === layerId) {
                layer.setVisible(visible);
            }
        });
        this.emit('layer-change', { layerId, visible });
    }

    setLayerOpacity(layerId: string, opacity: number): void {
        const map = this.getMapInstance();
        if (!map) return;

        map.getLayers().forEach((layer) => {
            const id = layer.get('id') || layer.get('name');
            if (id === layerId) {
                layer.setOpacity(Math.max(0, Math.min(1, opacity)));
            }
        });
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
                    console.error(`[OpenLayersAdapter] Error in event listener "${event}":`, e);
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
