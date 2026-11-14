/**
 * 功能名称：HomeView 双引擎交互路由、图层动作分发、路线规划桥接与生命周期 Composable
 * 说    明：统一承载 OL/Cesium 交互分发、绘制样式与编辑动作、TOC 图层与属性表联动、
 *           二维图层转三维导入、公交/驾车路线规划桥接、MapCore 就绪预热及访问上报。
 */
import { computed, onMounted, onUnmounted, provide, ref, type Ref } from 'vue';
import {
    useAppStore,
    useAttrStore,
    useLayerStore,
    useTOCStore,
} from '@/stores';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import { hideLoading } from '@common/ui/loading';
import { scheduleCesiumWarmup } from '@common/data-import/cesiumWarmup';
import { useRealtimeStats } from '@common/user/composables/useRealtimeStats';
import { useHomeTocAndAttributeActions } from './useHomeTocAndAttributeActions';

export interface UseHomeLayerAndMapRoutingDeps {
    mapContainerRef: Ref<any>;
    cesiumContainerRef: Ref<any>;
    is3DMode: Ref<boolean>;
    isCesiumLoading: Ref<boolean>;
    shouldLoadSidePanel: Ref<boolean>;
    userLayers: Ref<any[]>;
    baseLayers: Ref<any[]>;
    toolboxOverview: Ref<{ drawCount: number; uploadCount: number; layers: any[] }>;
    featureQueryResult: Ref<Record<string, any> | null>;
    showQueryPanel: Ref<boolean>;
    getCurrentMapView: () => string;
    setMapView: (view: string, opts?: { writeUrl?: boolean }) => Promise<boolean>;
    waitForAgentMapViewReady: (view: string, opts?: { timeoutMs?: number }) => Promise<boolean>;
    clearWatchdogOnUnmount: () => void;
}

export function useHomeLayerAndMapRouting(deps: UseHomeLayerAndMapRoutingDeps) {
    const {
        mapContainerRef,
        cesiumContainerRef,
        is3DMode,
        isCesiumLoading,
        shouldLoadSidePanel,
        userLayers,
        baseLayers,
        toolboxOverview,
        featureQueryResult,
        showQueryPanel,
        getCurrentMapView,
        setMapView,
        waitForAgentMapViewReady,
        clearWatchdogOnUnmount,
    } = deps;

    const message = useMessage();
    const { t } = useLocale();
    const attrStore = useAttrStore();
    const tocStore = useTOCStore();
    const layerStore = useLayerStore();

    const mapCoreLoadingSettled = ref(false);
    const visitLogScheduled = ref(false);

    // 标注模式状态：兼容子组件 ref 未解包或被 proxyRefs 解包为 boolean 的两种形态
    const isMarkModeActive = computed(() => {
        const raw = is3DMode.value
            ? cesiumContainerRef.value?.isReverseGeocodePickMode
            : mapContainerRef.value?.isReverseGeocodePickMode;
        return !!(typeof raw === 'object' && raw !== null ? raw.value : raw);
    });
    provide('isMarkModeActive', isMarkModeActive);

    // ────────────────────────── Cesium Viewer / Picker / 路线规划桥接 ──────────────────────────
    function getCesiumViewerForPicker() {
        return cesiumContainerRef.value?.getViewer?.() || null;
    }

    function getCesiumNamespaceForPicker() {
        return cesiumContainerRef.value?.getCesium?.() || null;
    }

    function getMapUserLocation(enableHighAccuracy = true) {
        return mapContainerRef.value?.getCurrentLocation?.(enableHighAccuracy);
    }

    function callCesiumBridge(methodName: string, ...args: any[]) {
        const host = cesiumContainerRef.value;
        const fn = host?.[methodName];
        if (typeof fn !== 'function') {
            return Promise.reject(new Error('三维容器未就绪'));
        }
        return Promise.resolve(fn.apply(host, args));
    }

    function startBusPointPick(type: string) {
        if (is3DMode.value) {
            return callCesiumBridge('startRoutePointPick', type);
        }
        return mapContainerRef.value?.startBusPointPick?.(type);
    }

    function drawRouteOnMap(route: any) {
        if (is3DMode.value) {
            return callCesiumBridge('drawCesiumBusRoute', route);
        }
        return mapContainerRef.value?.drawRouteOnMap?.(route);
    }

    function zoomToBusRouteStep(stepIndex: number) {
        if (is3DMode.value) {
            return callCesiumBridge('zoomToCesiumRouteStep', 'bus', stepIndex);
        }
        return mapContainerRef.value?.zoomToBusRouteStep?.(stepIndex);
    }

    function previewBusRouteStep(stepIndex: number) {
        if (is3DMode.value) {
            return callCesiumBridge('previewCesiumRouteStep', 'bus', stepIndex);
        }
        return mapContainerRef.value?.previewBusRouteStep?.(stepIndex);
    }

    function clearBusRouteStepPreview() {
        if (is3DMode.value) {
            return callCesiumBridge('clearCesiumStepPreview', 'bus');
        }
        return mapContainerRef.value?.clearBusRouteStepPreview?.();
    }

    function drawDriveRouteOnMap(routeLatLonStr: string) {
        if (is3DMode.value) {
            return callCesiumBridge('drawCesiumDriveRoute', routeLatLonStr);
        }
        return mapContainerRef.value?.drawDriveRouteOnMap?.(routeLatLonStr);
    }

    function zoomToDriveRouteStep(stepIndex: number) {
        if (is3DMode.value) {
            return callCesiumBridge('zoomToCesiumRouteStep', 'drive', stepIndex);
        }
        return mapContainerRef.value?.zoomToDriveRouteStep?.(stepIndex);
    }

    function previewDriveRouteStep(stepIndex: number) {
        if (is3DMode.value) {
            return callCesiumBridge('previewCesiumRouteStep', 'drive', stepIndex);
        }
        return mapContainerRef.value?.previewDriveRouteStep?.(stepIndex);
    }

    function clearDriveRouteStepPreview() {
        if (is3DMode.value) {
            return callCesiumBridge('clearCesiumStepPreview', 'drive');
        }
        return mapContainerRef.value?.clearDriveRouteStepPreview?.();
    }

    // ────────────────────────── 地图交互 / 绘制 / 分析 / 行政区 / 卷帘路由 ──────────────────────────
    function handleControlsMapInteraction(type: string): void {
        const nextType = String(type || '').trim();
        if (!nextType) return;

        if (nextType === 'ReverseGeocodePick') {
            if (is3DMode.value) {
                void cesiumContainerRef.value?.toggleReverseGeocodePick?.();
            } else {
                mapContainerRef.value?.activateInteraction?.(nextType);
            }
            return;
        }

        if (is3DMode.value) {
            const handled = cesiumContainerRef.value?.activateCesiumInteraction?.(nextType);
            if (!handled) {
                message.warning(t('cesium.interaction3dUnsupported', { type: nextType }));
            }
            return;
        }

        mapContainerRef.value?.activateInteraction?.(nextType);
    }

    function handleInteraction(type: string): void {
        handleControlsMapInteraction(type);
    }

    function handleControlsDrawStyleChange(stylePayload: any): void {
        if (is3DMode.value) {
            cesiumContainerRef.value?.updateCesiumDrawingStyle?.(stylePayload);
            return;
        }
        mapContainerRef.value?.updateDrawingStyleParams?.(stylePayload);
    }

    function handleControlsDrawEditAction(action: string): void {
        if (is3DMode.value) {
            if (action === 'delete-selected') {
                message.info(t('cesium.draw3dNoSelectionDelete'));
                return;
            }
            if (action === 'undo-last') {
                cesiumContainerRef.value?.activateCesiumInteraction?.('UndoLastDrawing');
            }
            return;
        }
        if (action === 'delete-selected') {
            mapContainerRef.value?.deleteSelectedDrawingFeature?.();
            return;
        }
        if (action === 'undo-last') {
            mapContainerRef.value?.activateInteraction?.('UndoLastDrawing');
        }
    }

    function handleCesiumDrawAction(action: string): void {
        if (!is3DMode.value) return;
        const container = cesiumContainerRef.value;

        switch (action) {
            case 'finish': {
                const code = container?.finishCesiumDraw?.();
                if (code === 'need-more-points') {
                    message.warning(t('cesium.drawMeasure.toast.needMorePoints'));
                } else if (code === 'need-second-click') {
                    message.warning(t('cesium.drawMeasure.toast.needSecondClick'));
                } else if (code === 'failed') {
                    message.warning(t('cesium.drawMeasure.toast.failed'));
                } else if (code === 'not-drawing') {
                    message.info(t('cesium.drawMeasure.toast.notDrawing'));
                }
                break;
            }
            case 'cancel':
                container?.cancelCesiumDraw?.();
                break;
            case 'undo':
                container?.activateCesiumInteraction?.('UndoLastDrawing');
                break;
            case 'clear':
                container?.activateCesiumInteraction?.('Clear');
                message.success(t('cesium.drawMeasure.toast.cleared'));
                break;
            case 'flyTo': {
                const moved = container?.flyToCesiumDrawing?.();
                if (!moved) message.info(t('cesium.drawMeasure.toast.noShape'));
                break;
            }
            default:
                break;
        }
    }

    function handleControlsShowAnalysis(): void {
        message.info(t('home.analysisEntryReady'));
    }

    function handleSpatialAnalysis(payload: any): void {
        const analysisType = String(payload?.type || '').trim();
        if (!analysisType) {
            message.warning(t('home.analysisTypeMissing'));
            return;
        }
        mapContainerRef.value?.runSpatialAnalysis?.(payload);
    }

    async function handleControlsDistrictSelect(payload: any): Promise<void> {
        const adcode = String(payload?.value || '').trim();
        const districtName = String(payload?.label || '').trim() || adcode;

        if (!/^\d{6}$/.test(adcode)) {
            message.warning(t('home.districtAdcodeInvalid'));
            return;
        }

        try {
            let result: any;
            if (is3DMode.value) {
                result = await cesiumContainerRef.value?.focusDistrictByAdcode?.({
                    adcode,
                    name: districtName,
                });
            } else {
                result = await mapContainerRef.value?.focusDistrictByAdcode?.({
                    adcode,
                    name: districtName,
                    fit: true,
                });
            }

            if (!result) {
                message.warning(t('home.mapNotReady'));
                return;
            }

            message.success(t('home.districtLoaded', { name: districtName }));
        } catch (error: any) {
            const detail = String(error?.message || '').trim();
            message.error(detail || t('home.districtLoadFailed'));
        }
    }

    async function handleEnableBasemapSwipe(payload: any): Promise<void> {
        const { leftBasemap, rightBasemap, leftCustomUrl, rightCustomUrl, mode } = payload || {};

        if (!mapContainerRef.value) {
            message.error(t('home.mapContainerNotReady'));
            return;
        }

        try {
            await mapContainerRef.value?.enableBasemapSwipe?.({
                leftBasemapId: leftBasemap,
                rightBasemapId: rightBasemap,
                leftCustomUrl: leftCustomUrl || '',
                rightCustomUrl: rightCustomUrl || '',
                mode: mode || 'horizontal',
            });
        } catch (error: any) {
            const detail = String(error?.message || '').trim();
            message.error(detail || t('home.swipeEnableFailed'));
        }
    }

    // ────────────────────────── TOC 图层 / 属性表 / 访问记录子模块 ──────────────────────────
    const {
        handleUploadData,
        handleToggleLayerVisibility,
        handleChangeLayerOpacity,
        handleRenameLayer,
        handleZoomLayer,
        handleViewLayer,
        handleRemoveLayer,
        handleEditLayer,
        handleReorderUserLayers,
        handleSoloLayer,
        handleApplyStyleTemplate,
        handleUpdateDrawStyle,
        handleUpdateLayerStyle,
        handleUpdateCesiumLayerStyle,
        handleAttributeTableFocusFeature,
        handleAttributeTableHighlightFeature,
        handleAttributeTableCellEdit,
        handleAttributeTableDeleteFeature,
        handleHighlightAttributeFeature,
        handleZoomAttributeFeature,
        handleToggleLayerLabelVisibility,
        handleDrawPointByCoordinates,
        handleDrawAmapAoiFromJson,
        handleToggleLayerCRS,
        handleReprojectLayer,
        handleExportLayerData,
        handleImportOlLayerTo3D,
        handleUserLayersChange,
        handleBaseLayersChange,
        handleLayerSelected,
        handleFeatureSelected,
        executeVisitLogAsync,
    } = useHomeTocAndAttributeActions({
        mapContainerRef,
        cesiumContainerRef,
        is3DMode,
        userLayers,
        baseLayers,
        toolboxOverview,
        featureQueryResult,
        showQueryPanel,
        setMapView,
        waitForAgentMapViewReady,
        message,
        t,
        attrStore,
        tocStore,
        layerStore,
    });

    // ────────────────────────── MapCore 就绪与生命周期 ──────────────────────────
    function settleMapCoreLoading(payload: any = {}): void {
        if (mapCoreLoadingSettled.value) return;
        mapCoreLoadingSettled.value = true;

        const appStore = useAppStore();
        appStore.markGisInitComplete();

        if (!is3DMode.value && !isCesiumLoading.value) {
            hideLoading();
        }

        if (payload?.isError) {
            const detail = String(payload?.message || '').trim();
            message.error(detail || t('home.mapResourceLoadFailed'));
        }
    }

    function handleMapCoreReady(): void {
        settleMapCoreLoading();

        if (!shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }

        if (!visitLogScheduled.value) {
            visitLogScheduled.value = true;
            void executeVisitLogAsync();
        }

        scheduleCesiumWarmup();
    }

    function handleMapCoreFailed(payload: any = {}): void {
        settleMapCoreLoading({
            isError: true,
            message: String(payload?.message || '').trim() || t('home.mapInitFailed'),
        });
    }

    const { reconnect: sseReconnect, disconnect: sseDisconnect } = useRealtimeStats();

    onUnmounted(() => {
        if (typeof window === 'undefined') return;
        clearWatchdogOnUnmount();
        sseDisconnect();
    });

    onMounted(async () => {
        await setMapView(getCurrentMapView(), { writeUrl: false });
        sseReconnect();
    });

    return {
        getCesiumViewerForPicker,
        getCesiumNamespaceForPicker,
        getMapUserLocation,
        startBusPointPick,
        drawRouteOnMap,
        zoomToBusRouteStep,
        previewBusRouteStep,
        clearBusRouteStepPreview,
        drawDriveRouteOnMap,
        zoomToDriveRouteStep,
        previewDriveRouteStep,
        clearDriveRouteStepPreview,
        handleControlsMapInteraction,
        handleInteraction,
        handleControlsDrawStyleChange,
        handleControlsDrawEditAction,
        handleCesiumDrawAction,
        handleControlsShowAnalysis,
        handleSpatialAnalysis,
        handleControlsDistrictSelect,
        handleEnableBasemapSwipe,
        handleUploadData,
        handleToggleLayerVisibility,
        handleChangeLayerOpacity,
        handleRenameLayer,
        handleZoomLayer,
        handleViewLayer,
        handleRemoveLayer,
        handleEditLayer,
        handleReorderUserLayers,
        handleSoloLayer,
        handleApplyStyleTemplate,
        handleUpdateDrawStyle,
        handleUpdateLayerStyle,
        handleUpdateCesiumLayerStyle,
        handleAttributeTableFocusFeature,
        handleAttributeTableHighlightFeature,
        handleAttributeTableCellEdit,
        handleAttributeTableDeleteFeature,
        handleHighlightAttributeFeature,
        handleZoomAttributeFeature,
        handleToggleLayerLabelVisibility,
        handleDrawPointByCoordinates,
        handleDrawAmapAoiFromJson,
        handleToggleLayerCRS,
        handleReprojectLayer,
        handleExportLayerData,
        handleImportOlLayerTo3D,
        handleUserLayersChange,
        handleBaseLayersChange,
        handleLayerSelected,
        handleFeatureSelected,
        handleMapCoreReady,
        handleMapCoreFailed,
    };
}
