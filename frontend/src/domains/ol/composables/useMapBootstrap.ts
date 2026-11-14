/**
 * 功能名称：OpenLayers 地图容器启动、初始化、监听与卸载清理编排 Composable
 * 说    明：统一承载 URL 启动恢复守卫、6 阶段 onMounted 启动流水线、initMap、
 *           ResizeObserver / 状态 watch 联动、统一 Action Router 注册与 onUnmounted 资源清理。
 */
import { onMounted, onUnmounted, watch, type Ref, type ShallowRef } from 'vue';
import Map from 'ol/Map';
import View from 'ol/View';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control';
import ScaleLine from 'ol/control/ScaleLine';
import OverviewMap from 'ol/control/OverviewMap';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';

import { createStartupViewResolver } from '@ol/startup/useStartupViewResolver';
import { createStartupTaskSchedulerFeature } from '@ol/startup/useStartupTaskScheduler';
import { createStartupUrlRestoreGuard } from '@ol/startup/useStartupUrlRestoreGuard';
import { createSharedEntryResolver } from '@ol/composables/useSharedEntryResolver';
import { createRightDragZoomController } from '@ol/composables/useRightDragZoom';
import { tileHDRendering } from '@ol/layer/composables/useTileHDRendering';
import { prioritizeTileSourceRequest } from '@ol/tile-source/index';
import { buildRasterBasemapSource } from '@ol/basemap/composables/basemapLayerFactory';
import { Z_BAND } from '@ol/layer/zIndexBands';

import { CompassManager } from '@common/compass/services/CompassManager';
import { looksLikeWmsSourceUrl } from '@common/basemap/wmsService';
import { getCurrentQuerySnapshot } from '@common/url-state/urlQueryReader';
import {
    registerEngineHandlers,
    unregisterEngineHandlers,
} from '@common/layer-tree/actions/unifiedActionRouter';

import { SEARCH_RESULT_STYLE, URL_LAYER_OPTIONS } from '@/constants';
import { apiGetRuntimeDefaults } from '@/api/backend';
import { readCachedPreferredBasemap } from '@/stores';

declare const __APP_VERSION__: string;

export const INITIAL_VIEW = { center: [114.302, 34.8146] as [number, number], zoom: 4 };
const CRITICAL_TILE_READY_TIMEOUT_MS = 15000;
const APP_DISPLAY_VERSION = __APP_VERSION__;

// 图层 z-index 分层方案（SSOT：@ol/layer/zIndexBands，值越大越在上层）
const Z_INDEX = {
    DRAW: Z_BAND.DATA + 200,
    USER_LOCATION: Z_BAND.SYSTEM + 20,
    BUS_ROUTE: Z_BAND.DATA + 300,
    BUS_PICK: Z_BAND.DATA + 310,
    SEARCH: Z_BAND.DATA + 150,
};

export interface UseMapBootstrapDeps {
    getUrlSyncEnabled: () => boolean;
    emit: (event: any, ...args: any[]) => void;
    message: any;
    attrStore: any;
    urlParamStore: any;
    compassStore: any;
    layerStore: any;
    mapContainerRef: Ref<HTMLElement | null>;
    mapRef: Ref<HTMLElement | null>;
    mapInstance: ShallowRef<Map | null>;
    mapContainerRect: Ref<any>;
    selectedLayer: Ref<string>;
    customMapUrl: Ref<string>;
    showDynamicSplitLines: Ref<boolean>;
    currentZoom: Ref<number>;
    currentCoordinate: Ref<{ lng: number; lat: number } | null>;
    componentUnmountedRef: Ref<boolean>;
    tiandituTkRef: Ref<string>;
    getTiandituTk: () => string;
    drawSource: VectorSource;
    userLocationSource: VectorSource;
    busPickSource: VectorSource;
    busRouteSource: VectorSource;
    drawStyleConfig: Ref<any>;
    rightDragZoomControllerRef: ShallowRef<any>;
    styles: any;
    createStyleFromConfig: (...args: any[]) => any;
    parseUrlToState: (...args: any[]) => any;
    flyToView: (...args: any[]) => any;
    syncUrlFromMap: () => void;
    bindMapViewSync: () => void;
    stopMapViewSync: () => void;
    refreshLayerInstances: () => void;
    setGraticuleActive: (active: boolean) => void;
    stopGraticule: () => void;
    getLayerIdByIndex: (idx: number) => string | null | undefined;
    getLayerIndexById: (id: string) => number | null | undefined;
    initializeBasemapLayers: () => any[];
    hydrateRuntimeMapTokens: () => Promise<any>;
    restoreSwipe: () => Promise<any> | void;
    clearSwipeCompareLayers: () => void;
    detachSwipeFromLayers: () => void;
    disposeSwipe: () => void;
    disposeDistrictManager: () => void;
    disposeInteractionPickers: () => void;
    disposeAllMonitors: () => void;
    disposeSelectionWatcher: () => void;
    bindBasemapSelectionWatcher: () => void;
    refreshAllBasemapSourcesForHD: () => void;
    emitBaseLayersChangeBatched: (() => void) & { cancel?: () => void };
    emitUserLayersChange: () => void;
    syncAttributeTableMapExtent: () => void;
    bindMapEvents: () => (() => void) | null | undefined;
    getCurrentBusStepIndex: () => number;
    getCurrentDriveStepIndex: () => number;
    getBusStepStyle: (...args: any[]) => any;
    getBusStepPointStyle: (...args: any[]) => any;
    getDriveStepStyle: (...args: any[]) => any;
    clearRouteStepStyleCache: () => void;
    zoomToUser: (opts?: any) => Promise<any>;
    detectIPLocale: (opts?: any) => Promise<any>;
    setCustomBasemapByUrl: (url: string) => Promise<any>;
    setUserLayerVisibility: (layerId: string, visible: boolean) => any;
    setUserLayerOpacity: (layerId: string, opacity: number) => any;
    removeUserLayer: (layerId: string) => any;
    renameUserLayer: (layerId: string, newName: string) => boolean;
    zoomToUserLayer: (layerId: string) => any;
    redeclareLayerCrs: (payload: { layerId: string; crs: string }) => any;
    olRemoteServiceAdapter: any;
    setDrawLayerInstance: (layer: any) => void;
    setBusRouteLayer: (layer: any) => void;
    onResetRuntimeState?: () => void;
}

export function useMapBootstrap(deps: UseMapBootstrapDeps) {
    const {
        getUrlSyncEnabled,
        emit,
        message,
        attrStore,
        urlParamStore,
        compassStore,
        layerStore,
        mapContainerRef,
        mapRef,
        mapInstance,
        mapContainerRect,
        selectedLayer,
        customMapUrl,
        showDynamicSplitLines,
        currentZoom,
        currentCoordinate,
        componentUnmountedRef,
        tiandituTkRef,
        getTiandituTk,
        drawSource,
        userLocationSource,
        busPickSource,
        busRouteSource,
        drawStyleConfig,
        rightDragZoomControllerRef,
        styles,
        createStyleFromConfig,
        parseUrlToState,
        flyToView,
        syncUrlFromMap,
        bindMapViewSync,
        stopMapViewSync,
        refreshLayerInstances,
        setGraticuleActive,
        stopGraticule,
        getLayerIdByIndex,
        getLayerIndexById,
        initializeBasemapLayers,
        hydrateRuntimeMapTokens,
        restoreSwipe,
        clearSwipeCompareLayers,
        detachSwipeFromLayers,
        disposeSwipe,
        disposeDistrictManager,
        disposeInteractionPickers,
        disposeAllMonitors,
        disposeSelectionWatcher,
        bindBasemapSelectionWatcher,
        refreshAllBasemapSourcesForHD,
        emitBaseLayersChangeBatched,
        emitUserLayersChange,
        syncAttributeTableMapExtent,
        bindMapEvents,
        getCurrentBusStepIndex,
        getCurrentDriveStepIndex,
        getBusStepStyle,
        getBusStepPointStyle,
        getDriveStepStyle,
        clearRouteStepStyleCache,
        zoomToUser,
        detectIPLocale,
        setCustomBasemapByUrl,
        setUserLayerVisibility,
        setUserLayerOpacity,
        removeUserLayer,
        renameUserLayer,
        zoomToUserLayer,
        redeclareLayerCrs,
        olRemoteServiceAdapter,
        setDrawLayerInstance,
        setBusRouteLayer,
        onResetRuntimeState,
    } = deps;

    let searchSource: VectorSource | null = null;
    let searchLayer: VectorLayer<VectorSource> | null = null;
    let rightDragZoomController: any = null;
    let compassManagerRef: CompassManager | null = null;
    let _cleanupMapEventHandlers: (() => void) | null = null;
    let _resizeObserver: ResizeObserver | null = null;

    // ========== 分享入口解析（via composable：useSharedEntryResolver） ==========
    const { parseSharedEntryFlagFromUrl, resolveSharedAddressByLonLat } =
        createSharedEntryResolver({
            tiandituTkRef,
        });

    const { scheduleLowPriorityTask, waitForCriticalTileReady, cancelScheduledTasks } =
        createStartupTaskSchedulerFeature({
            componentUnmountedRef,
            criticalTileReadyTimeoutMs: CRITICAL_TILE_READY_TIMEOUT_MS,
            mapInstanceRef: mapInstance as any,
        });

    const startupUrlRestoreGuard = createStartupUrlRestoreGuard({
        parseUrlToState,
        getPendingParams: () => urlParamStore.getPendingParams(),
        isUrlSyncEnabled: getUrlSyncEnabled,
    });

    /**
     * 仅在 OL 面板处于当前视图且启动 URL 已恢复后写回 URL，避免覆盖分享链接或 Cesium 相机状态。
     */
    function syncUrlFromActiveMap(): void {
        if (!startupUrlRestoreGuard.canSyncNow()) return;
        syncUrlFromMap();
        emit('view-sync', { view: 'ol' });
    }

    function bindActiveMapViewSync(): void {
        if (!getUrlSyncEnabled() || startupUrlRestoreGuard.hasPendingRestore()) return;
        bindMapViewSync();
    }

    // ========== 启动视图解析（via composable：useStartupViewResolver） ==========
    const { applyDeferredUrlParams, getInitialViewState } = createStartupViewResolver({
        mapInstanceRef: mapInstance,
        urlParamStore,
        startupUrlRestoreGuard,
        bindActiveMapViewSync,
        flyToView: (...args: any[]) => flyToView(...args),
        parseUrlToState,
        INITIAL_VIEW,
    });

    // --- URL 参数初始化 ---
    const initialUrlState = parseUrlToState();
    const initialLayerId =
        initialUrlState?.layerId || getLayerIdByIndex(initialUrlState?.layerIndex);
    if (initialLayerId === 'custom' && !customMapUrl.value) {
        // 保持默认预设底图，避免引导出空瓦片源的 custom 图层
    } else if (initialUrlState?.layerId === 'custom' && customMapUrl.value) {
        selectedLayer.value = 'custom';
    } else if (initialLayerId) {
        selectedLayer.value = initialLayerId;
    }

    // [隶属] 图层切换-底图状态刷新
    function refreshLayersState(): void {
        refreshLayerInstances();
        emitBaseLayersChangeBatched();
    }

    // [隶属] 图层切换-地图初始化
    function initMap(): void {
        const layersToAdd = initializeBasemapLayers();

        const drawLayerInstance = new VectorLayer({
            source: drawSource,
            style: createStyleFromConfig(drawStyleConfig.value),
            zIndex: Z_INDEX.DRAW,
        });
        setDrawLayerInstance(drawLayerInstance);

        const userLayer = new VectorLayer({
            source: userLocationSource,
            zIndex: Z_INDEX.USER_LOCATION,
            style: (feature) =>
                feature.get('type') === 'accuracy' ? styles.userAccuracy : styles.userPoint,
        });
        const busPickLayer = new VectorLayer({
            source: busPickSource,
            zIndex: Z_INDEX.BUS_PICK,
            style: (feature) =>
                feature.get('busPickType') === 'end' ? styles.busEnd : styles.busStart,
        });
        const busRouteLayer = new VectorLayer({
            source: busRouteSource,
            zIndex: Z_INDEX.BUS_ROUTE,
            style: (feature) => {
                if (feature.get('routeMode') === 'drive') {
                    const stepIndex = Number(feature.get('stepIndex'));
                    const isStepSegment = Number.isFinite(stepIndex) && stepIndex >= 0;
                    const activeDriveStep = getCurrentDriveStepIndex();
                    const isActive = activeDriveStep >= 0 && stepIndex === activeDriveStep;
                    return getDriveStepStyle(stepIndex, isActive, isStepSegment);
                }
                if (feature.getGeometry()?.getType?.() === 'Point') {
                    const stepIndex = Number(feature.get('stepIndex') ?? 0);
                    const stepIndices = feature.get('stepIndices');
                    const markerRole = String(feature.get('markerRole') || 'segment-start');
                    const stationName = String(feature.get('stationName') || '');
                    const activeBusStep = getCurrentBusStepIndex();
                    const isActive =
                        activeBusStep >= 0 &&
                        (Array.isArray(stepIndices)
                            ? stepIndices.map((v: any) => Number(v)).includes(activeBusStep)
                            : activeBusStep === stepIndex);
                    return getBusStepPointStyle(stepIndex, markerRole, isActive, stationName);
                }
                const segmentType = Number(feature.get('segmentType') ?? 0);
                const stepIndex = Number(feature.get('stepIndex') ?? 0);
                const activeBusStep = getCurrentBusStepIndex();
                const isActive = activeBusStep >= 0 && activeBusStep === stepIndex;
                return getBusStepStyle(stepIndex, segmentType === 1, isActive);
            },
        });
        setBusRouteLayer(busRouteLayer);

        // 搜索结果图层（点）
        searchSource = new VectorSource();
        searchLayer = new VectorLayer({
            source: searchSource,
            zIndex: Z_INDEX.SEARCH,
            style: createStyleFromConfig(SEARCH_RESULT_STYLE),
        });

        // 1.3 控件
        const controls = defaultControls({ zoom: false }).extend([
            new OverviewMap({
                className: 'ol-overviewmap ol-custom-overviewmap',
                layers: [
                    new TileLayer({
                        source: buildRasterBasemapSource(
                            prioritizeTileSourceRequest(
                                new XYZ({
                                    url: `https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${getTiandituTk()}`,
                                    maxZoom: 20,
                                }),
                            ),
                        ),
                    }),
                ],
                collapseLabel: '«',
                label: '»',
                collapsed: false,
            }),
        ]);

        // 1.4 实例化地图（先清理旧实例防止泄漏）
        if (mapInstance.value) {
            try {
                mapInstance.value.setTarget(undefined);
            } catch {
                /* ignore */
            }
        }
        const initialViewState = getInitialViewState();
        mapInstance.value = new Map({
            target: mapRef.value || undefined,
            layers: [
                ...layersToAdd,
                drawLayerInstance,
                userLayer,
                busRouteLayer,
                busPickLayer,
                searchLayer,
            ],
            view: new View({
                center: fromLonLat(initialViewState.center),
                zoom: initialViewState.zoom,
                minZoom: 1,
                maxZoom: 22,
                multiWorld: true,
            }),
            controls,
        });

        const scaleline = new ScaleLine({
            units: 'metric',
            bar: true,
            minWidth: 160,
            maxWidth: 240,
            steps: 4,
            text: true,
        });
        mapInstance.value.addControl(scaleline);

        currentZoom.value = Number(
            mapInstance.value.getView()?.getZoom?.() ?? initialViewState.zoom,
        );

        compassManagerRef?.dispose?.();
        compassManagerRef = new CompassManager({
            map: mapInstance.value,
            store: compassStore,
            mapContainerElement: mapContainerRef.value,
        });
        void compassManagerRef.init();

        const initialCenter = mapInstance.value.getView().getCenter();
        if (initialCenter) {
            const initialLonLat = toLonLat(initialCenter);
            currentCoordinate.value = { lng: initialLonLat[0], lat: initialLonLat[1] };
        }

        // 1.5 初始化右拖缩放控制器
        rightDragZoomController?.dispose?.();
        rightDragZoomController = createRightDragZoomController(mapInstance.value);
        rightDragZoomControllerRef.value = rightDragZoomController;

        // 1.6 事件监听
        _cleanupMapEventHandlers = bindMapEvents() ?? null;
        bindBasemapSelectionWatcher();

        // 1.7 初始化刷新图层状态
        refreshLayersState();
        emitUserLayersChange();
        syncAttributeTableMapExtent();
    }

    async function runDeferredStartupTasks(): Promise<void> {
        if (componentUnmountedRef.value) return;

        const routeViewState = parseUrlToState();
        const isSharedEntry = parseSharedEntryFlagFromUrl();

        // ========== 分享或欢迎消息 ==========
        if (isSharedEntry) {
            const shareAddress = await resolveSharedAddressByLonLat(
                routeViewState?.lng,
                routeViewState?.lat,
            );
            message.success(`分享地点：${shareAddress || '地址解析失败，请稍后重试'}`, {
                duration: 3000,
            });
            message.soup();
        } else {
            message.success(`欢迎使用NEGIAO的WebGIS!(${APP_DISPLAY_VERSION})`, { duration: 3000 });
        }

        // ========== 用户定位 ==========
        const locatedResult = isSharedEntry
            ? await zoomToUser({ animate: false, silent: true })
            : await zoomToUser();
        if (componentUnmountedRef.value) return;

        if (!locatedResult) {
            if (isSharedEntry) {
                await detectIPLocale({ silent: true });
            } else {
                await detectIPLocale();
            }
        }
    }

    function isStartupViewSettled(): boolean {
        if (startupUrlRestoreGuard.hasPendingRestore()) return false;
        if (!mapInstance?.value) return false;
        const view = mapInstance?.value?.getView?.();
        if (typeof view?.getAnimating === 'function' && view.getAnimating()) return false;
        if (typeof view?.getInteracting === 'function' && view.getInteracting()) return false;
        return true;
    }

    // ========== Watchers ==========
    watch(customMapUrl, (nextUrl, previousUrl) => {
        if (!nextUrl || nextUrl === previousUrl) return;
        if (looksLikeWmsSourceUrl(nextUrl)) return;
        if (selectedLayer.value === 'custom' && mapInstance.value) {
            void setCustomBasemapByUrl(nextUrl);
        }
    });

    watch(
        () => attrStore.filterByCurrentView,
        (enabled) => {
            if (enabled) syncAttributeTableMapExtent();
        },
    );

    watch(getUrlSyncEnabled, (enabled) => {
        if (enabled) {
            bindMapViewSync();
            if (startupUrlRestoreGuard.canSyncNow()) {
                syncUrlFromMap();
                emit('view-sync', { view: 'ol' });
            }
        } else {
            stopMapViewSync();
        }
    });

    watch(
        () => layerStore.swipeConfig.enabled,
        (enabled) => {
            if (enabled) return;
            detachSwipeFromLayers();
            clearSwipeCompareLayers();
            if (mapInstance.value) {
                mapInstance.value.render();
            }
        },
        { immediate: false },
    );

    watch(
        tileHDRendering,
        () => {
            if (!mapInstance.value) return;
            refreshAllBasemapSourcesForHD();
            mapInstance.value.render();
        },
        { immediate: false },
    );

    watch(
        () => mapContainerRef.value,
        (el) => {
            if (_resizeObserver) {
                _resizeObserver.disconnect();
                _resizeObserver = null;
            }
            if (el) {
                mapContainerRect.value = el.getBoundingClientRect();
                _resizeObserver = new ResizeObserver(() => {
                    mapContainerRect.value = el.getBoundingClientRect();
                    mapInstance.value?.updateSize?.();
                });
                _resizeObserver.observe(el);
            }
        },
        { immediate: true },
    );

    // ========== 生命周期钩子 ==========
    onMounted(async () => {
        componentUnmountedRef.value = false;

        searchSource = null;
        searchLayer = null;
        setBusRouteLayer(null);
        setDrawLayerInstance(null);
        rightDragZoomController = null;
        rightDragZoomControllerRef.value = null;
        compassManagerRef = null;
        _cleanupMapEventHandlers = null;
        onResetRuntimeState?.();

        try {
            const [, defaultsRes] = await Promise.all([
                hydrateRuntimeMapTokens(),
                apiGetRuntimeDefaults().catch(() => null),
            ]);

            const startupQuery = getCurrentQuerySnapshot();
            const startupSearchParams = new URLSearchParams(window.location.search || '');
            const hasExplicitLayerParam = ['l', 'layer', 'layerId'].some(
                (key) => startupQuery[key] !== undefined || startupSearchParams.has(key),
            );
            if (!hasExplicitLayerParam) {
                const preferredBasemapId = readCachedPreferredBasemap();
                const preferredValid =
                    preferredBasemapId && getLayerIndexById(preferredBasemapId) != null;

                if (preferredValid) {
                    selectedLayer.value = preferredBasemapId;
                } else {
                    const serverIndex = defaultsRes?.data?.default_basemap_index;
                    if (serverIndex != null) {
                        const serverLayerId = URL_LAYER_OPTIONS[serverIndex] || null;
                        if (serverLayerId) selectedLayer.value = serverLayerId;
                    }
                }
            }

            // Phase 1: 同步初始化
            initMap();
            bindActiveMapViewSync();
            setGraticuleActive(showDynamicSplitLines.value);
            syncUrlFromActiveMap();

            // Phase 2: 等待真实底图首屏完成
            try {
                await waitForCriticalTileReady();
            } catch {
                // 超时兜底继续流程
            }

            // Phase 3: 通知父组件地图核心就绪
            if (!componentUnmountedRef.value) {
                emit('map-core-ready');
            }

            // Phase 3.1: 恢复持久化卷帘状态
            if (!componentUnmountedRef.value) {
                void restoreSwipe();
            }

            // Phase 5: 应用延迟 URL 参数
            if (!componentUnmountedRef.value && !urlParamStore.isParamApplied) {
                applyDeferredUrlParams();
            }

            // Phase 6: 非关键初始化任务
            scheduleLowPriorityTask(() => {
                runDeferredStartupTasks().catch(() => {});
            });
        } catch (error: any) {
            const detail = String(error?.message || error || '地图核心初始化异常').trim();
            message.error(`地图核心初始化失败：${detail}`);
            if (!componentUnmountedRef.value) {
                emit('map-core-failed', { message: detail });
            }
        }
    });

    // 统一 Action Router：注册 OL 引擎处理器
    registerEngineHandlers('ol', {
        setUserLayerVisibility: ({ layerId, visible }: { layerId: string; visible: boolean }) =>
            setUserLayerVisibility(layerId, visible),
        setUserLayerOpacity: ({ layerId, opacity }: { layerId: string; opacity: number }) =>
            setUserLayerOpacity(layerId, opacity),
        removeUserLayer: ({ layerId }: { layerId: string }) => removeUserLayer(layerId),
        renameUserLayer: ({ layerId, newName }: { layerId: string; newName: string }) =>
            renameUserLayer(layerId, newName),
        zoomToUserLayer: ({ layerId }: { layerId: string }) => zoomToUserLayer(layerId),
        redeclareLayerCrs: ({ layerId, crs }: { layerId: string; crs: string }) =>
            redeclareLayerCrs({ layerId, crs }),
        zoomToRemoteService: ({ serviceId }: { serviceId: string }) =>
            olRemoteServiceAdapter?.zoomTo?.(serviceId) ?? false,
    });

    onUnmounted(() => {
        unregisterEngineHandlers('ol');
        componentUnmountedRef.value = true;
        if (_resizeObserver) {
            _resizeObserver.disconnect();
            _resizeObserver = null;
        }
        stopMapViewSync();
        stopGraticule();
        disposeSwipe();
        disposeDistrictManager();
        disposeInteractionPickers();
        compassManagerRef?.dispose?.();
        compassManagerRef = null;
        rightDragZoomController?.dispose?.();
        clearRouteStepStyleCache?.();
        rightDragZoomController = null;
        rightDragZoomControllerRef.value = null;
        disposeAllMonitors?.();
        disposeSelectionWatcher?.();
        emitBaseLayersChangeBatched.cancel?.();
        cancelScheduledTasks?.();
        _cleanupMapEventHandlers?.();
        _cleanupMapEventHandlers = null;
        attrStore.setMapExtent(null);
        if (mapInstance.value) mapInstance.value.setTarget(undefined);
    });

    return {
        syncUrlFromActiveMap,
        refreshLayersState,
        initMap,
        runDeferredStartupTasks,
        isStartupViewSettled,
        parseUrlToState,
    };
}
