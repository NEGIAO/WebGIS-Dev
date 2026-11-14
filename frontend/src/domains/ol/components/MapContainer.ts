/**
 * 功能名称：OpenLayers 二维地图主容器组件逻辑层
 * 说    明：采用视图层（MapContainer.vue）与逻辑层（MapContainer.ts）分离范式；
 *           具体业务拆解至 domains/ol/composables/*（useMapBasemapPipeline、useMapLayerAndRoutePipeline、
 *           useMapBootstrap、useMapDrawingActions、useMapContainerActions 等），
 *           本文件仅承担依赖装配、状态聚合与统一对外接口暴露。
 */
import {
    defineComponent,
    ref,
    shallowRef,
    type ExtractPropTypes,
    type Ref,
    type SetupContext,
} from 'vue';
import { storeToRefs } from 'pinia';
import 'ol/ol.css';
import type Map from 'ol/Map';
import VectorSource from 'ol/source/Vector';

import { useSharedCustomBasemapUrl } from '@common/basemap/useSharedCustomBasemapUrl';
import { setCapabilitiesProxyBuilder } from '@common/basemap/capabilitiesProxy';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useGisDropZone } from '@common/data-import/useGisDropZone';
import { useUserLocation } from '@common/map-view/useUserLocation';
import { getRuntimeMapTokensSync } from '@common/services/runtimeMapTokens';
import { compassBgVars } from '@common/compass/utils/compassStyleUtils';
import FengShuiCompassSvg from '@common/compass/svg/feng-shui-compass-svg.vue';
import PalaceExplanationPanel from '@common/compass/components/PalaceExplanationPanel.vue';

import { createLayerControlHandlers } from '@ol/layer/composables/useLayerControlHandlers';
import { createOlRemoteServiceAdapter } from '@ol/services/olRemoteServiceAdapter';
import { createMapEventHandlers } from '@ol/composables/useMapEventHandlers';
import { createMapInteractionPickers } from '@ol/composables/useMapInteractionPickers';
import { createMapUIEventHandlers } from '@ol/composables/useMapUIEventHandlers';
import { INITIAL_VIEW, useMapBootstrap } from '@ol/composables/useMapBootstrap';
import { createMapDrawingActions } from '@ol/composables/useMapDrawingActions';
import { createMapContainerActions } from '@ol/composables/useMapContainerActions';
import { createMapBasemapPipeline } from '@ol/composables/useMapBasemapPipeline';
import { createMapLayerAndRoutePipeline } from '@ol/composables/useMapLayerAndRoutePipeline';
import {
    buildRequestProxyUrl,
    createAutoTileSourceFromUrl,
} from '@ol/tile-source/index';

import LayerControlPanel from '@ol/layer/components/LayerControlPanel.vue';
import MapSwipeController from './MapSwipeController.vue';
import MapControlsBar from './MapControlsBar.vue';

import {
    DEFAULT_BASEMAP_PRESET_ID,
    createLayerConfigs,
    createMapStylesObject,
} from '@/constants';
import {
    useAttrStore,
    useCompassStore,
    useLayerStore,
    useTOCStore,
    useUrlParamStore,
} from '@/stores';

// 一、Emits
type EmitsType = {
    'location-change': [payload?: any];
    'map-click': [payload?: any];
    'search-poi-selected': [payload?: any];
    'coordinate-jump': [payload?: any];
    'update-news-image': [payload?: any];
    'feature-selected': [payload?: any];
    'service-feature-query': [payload?: any];
    'user-layers-change': [payload?: any];
    'graphics-overview': [payload?: any];
    'base-layers-change': [payload?: any];
    'upload-progress-change': [payload?: any];
    'upload-data': [payload?: any];
    'map-core-ready': [];
    'map-core-failed': [payload?: any];
    'view-sync': [payload?: any];
};

// 二、Props
const propDefine = {
    urlSyncEnabled: {
        type: Boolean,
        default: true,
    },
} as const;

export type MapContainerProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
    name: 'MapContainer',
    components: {
        MapSwipeController,
        LayerControlPanel,
        FengShuiCompassSvg,
        PalaceExplanationPanel,
        MapControlsBar,
    },
    props: propDefine,
    emits: [
        'location-change',
        'map-click',
        'search-poi-selected',
        'coordinate-jump',
        'update-news-image',
        'feature-selected',
        'service-feature-query',
        'user-layers-change',
        'graphics-overview',
        'base-layers-change',
        'upload-progress-change',
        'upload-data',
        'map-core-ready',
        'map-core-failed',
        'view-sync',
    ],
    setup(props, ctx) {
        return new Instance(props, ctx);
    },
});

// 四、组件实例
export class Instance {
    // ── Stores / i18n / 辅助 ──
    public t!: (key: string, params?: Record<string, any>) => string;
    public compassStore = useCompassStore();
    public layerStore = useLayerStore();
    public selectedPalace!: Ref<any>;
    public compassBgVars = compassBgVars;

    // ── 核心 Refs ──
    public mapContainerRef = ref<HTMLElement | null>(null);
    public mapRef = ref<HTMLElement | null>(null);
    public mapInstance = shallowRef<Map | null>(null);
    public selectedLayer = ref<string>(DEFAULT_BASEMAP_PRESET_ID);
    public customMapUrl!: Ref<string>;
    public showDynamicSplitLines = ref(false);
    public basemapCircuitOpen = ref(false);
    public currentZoom = ref(17);
    public currentCoordinate = ref<{ lng: number; lat: number } | null>(null);
    public isDomestic = ref(true);
    public isReverseGeocodePickMode = ref(false);
    public tiandituTk!: Ref<string>;
    public layerList!: Ref<any[]>;
    public mapContainerRect!: Ref<any>;

    // ── 拖拽上传 ──
    public isMapUploadDragging!: Ref<boolean>;
    public handleMapUploadDragEnter!: (e: DragEvent) => void;
    public handleMapUploadDragOver!: (e: DragEvent) => void;
    public handleMapUploadDragLeave!: (e: DragEvent) => void;
    public handleMapUploadDrop!: (e: DragEvent) => void;

    // ── 卷帘交互 ──
    public mapContainerSwipeEnabled?: boolean;
    public enableBasemapSwipe!: (...args: any[]) => any;
    public handleSwipePositionUpdate!: (...args: any[]) => any;
    public handleSwipeModeUpdate!: (...args: any[]) => any;
    public handleSwipeClose!: (...args: any[]) => any;

    // ── 底图与图层管理回调（模板 + 暴露） ──
    public handleLayerChange!: (payload: any) => Promise<any>;
    public handleLayerOrderUpdate!: (...args: any[]) => any;
    public handleLayerContextAction!: (...args: any[]) => any;
    public handleResetBasemapChain!: () => void;
    public handleCloseExplanation!: () => void;
    public handleToggleGraticule!: (...args: any[]) => any;
    public handleSearchJump!: (...args: any[]) => any;
    public resetView!: () => void;
    public zoomToUser!: (opts?: any) => Promise<any>;
    public handleJumpToCoordinates!: (...args: any[]) => any;

    // ── defineExpose 对外完整能力 ──
    public updateViewByParams!: (...args: any[]) => any;
    public locateAddress!: (...args: any[]) => any;
    public addUserDataLayer!: (...args: any[]) => any;
    public exportUserLayerGeoJSON!: (payload?: { layerId?: string }) => any;
    public activateInteraction!: (type: string) => void;
    public clearInteractions!: () => void;
    public getCurrentLocation!: (...args: any[]) => any;
    public startBusPointPick!: (...args: any[]) => any;
    public drawRouteOnMap!: (...args: any[]) => any;
    public zoomToBusRouteStep!: (...args: any[]) => any;
    public previewBusRouteStep!: (...args: any[]) => any;
    public clearBusRouteStepPreview!: (...args: any[]) => any;
    public drawDriveRouteOnMap!: (...args: any[]) => any;
    public zoomToDriveRouteStep!: (...args: any[]) => any;
    public previewDriveRouteStep!: (...args: any[]) => any;
    public clearDriveRouteStepPreview!: (...args: any[]) => any;
    public setDrawStyle!: (styleCfg: any) => void;
    public updateDrawingStyleParams!: (stylePatch?: Record<string, any>) => void;
    public deleteSelectedDrawingFeature!: (...args: any[]) => any;
    public updateSelectedDrawingStyle!: (...args: any[]) => any;
    public activateGeometryEditForLayer!: (layerId?: string) => boolean;
    public setUserLayerStyle!: (...args: any[]) => any;
    public applyStyleTemplate!: (...args: any[]) => any;
    public setUserLayerVisibility!: (...args: any[]) => any;
    public setUserLayerOpacity!: (...args: any[]) => any;
    public setUserLayerLabelVisibility!: (...args: any[]) => any;
    public setBaseLayerActive!: (layerId: string) => Promise<void>;
    public setLayerVisibility!: (...args: any[]) => any;
    public zoomToUserLayer!: (...args: any[]) => any;
    public zoomToManagedFeature!: (...args: any[]) => any;
    public removeUserLayer!: (...args: any[]) => any;
    public reorderUserLayers!: (...args: any[]) => any;
    public handleAttributeTableFocusFeature!: (...args: any[]) => any;
    public handleAttributeTableHighlightFeature!: (...args: any[]) => any;
    public handleAttributeTableCellEdit!: (...args: any[]) => any;
    public handleAttributeTableDeleteFeature!: (...args: any[]) => any;
    public soloUserLayer!: (...args: any[]) => any;
    public renameUserLayer!: (layerId: string, newName: string) => boolean;
    public viewUserLayer!: (...args: any[]) => any;
    public zoomToGraphics!: () => void;
    public focusDistrictByAdcode!: (...args: any[]) => any;
    public setDistrictLayerVisibility!: (...args: any[]) => any;
    public removeDistrictLayer!: (...args: any[]) => any;
    public drawPointByCoordinatesInput!: (...args: any[]) => any;
    public drawAmapAoiByDetailJsonInput!: (...args: any[]) => any;
    public addSearchResultLayer!: (...args: any[]) => any;
    public toggleLayerCRS!: (...args: any[]) => any;
    public toggleSearchLayerCRS!: (...args: any[]) => any;
    public redeclareLayerCrs!: (...args: any[]) => any;
    public exportLayerCoordinates!: (payload: any) => void;
    public runSpatialAnalysis!: (...args: any[]) => any;
    public getMapExtent!: () => any;
    public getCurrentViewState!: () => any;
    public isStartupViewSettled!: () => boolean;
    public syncViewFromCesium!: (...args: any[]) => any;
    public getMapSize!: () => any;
    public getOlView!: () => any;
    public setCustomBasemapByUrl!: (url: string) => Promise<any>;
    public zoomToRemoteService!: (id: string) => any;

    constructor(props: MapContainerProps, ctx: SetupContext<EmitsType>) {
        const message = useMessage();
        const { t } = useLocale();
        this.t = t;
        const emit = ctx.emit as (event: any, ...args: any[]) => void;

        const attrStore = useAttrStore();
        const urlParamStore = useUrlParamStore();
        const tocStore = useTOCStore();
        const { selectedPalace } = storeToRefs(this.compassStore);
        this.selectedPalace = selectedPalace;

        this.handleCloseExplanation = () => {
            this.compassStore.setSelectedPalace(null);
        };

        let TIANDITU_TK = getRuntimeMapTokensSync().tiandituTk;
        const tiandituTk = ref(TIANDITU_TK);
        this.tiandituTk = tiandituTk;
        let OVITAL_TDTKEY = getRuntimeMapTokensSync().ovitalTdtkey;
        const ovitalTdtkey = ref(OVITAL_TDTKEY);

        const { customBasemapUrl: customMapUrl } = useSharedCustomBasemapUrl();
        this.customMapUrl = customMapUrl;

        const LAYER_CONFIGS = createLayerConfigs(TIANDITU_TK, OVITAL_TDTKEY);
        const layerList = ref(
            LAYER_CONFIGS.map((cfg: any) => ({
                id: cfg.id,
                name: cfg.name,
                visible: cfg.visible,
                opacity: 1,
            })),
        );
        this.layerList = layerList;
        const layerInstances: Record<string, any> = {};

        const componentUnmountedRef = ref(false);
        const isAttributeQueryEnabled = ref(true);
        const userDataLayers: any[] = [];
        const drawSource = new VectorSource();
        const userLocationSource = new VectorSource();
        const busPickSource = new VectorSource();
        const busRouteSource = new VectorSource();

        let busRouteLayerRef: any = null;
        let drawLayerInstance: any = null;
        const busRouteManagedLayerIdRef = ref<string | null>(null);
        const rightDragZoomControllerRef = shallowRef<any>(null);
        const queryRasterValueAtCoordinateRef = ref<any>(null);

        // 延迟解析桥梁，解决相互引用
        let bootstrapApi: ReturnType<typeof useMapBootstrap> | null = null;
        let containerActions: ReturnType<typeof createMapContainerActions> | null = null;
        let removeManagedLayerById: (...args: any[]) => any = () => undefined;
        let setDrawStyleBridge: (styleCfg: any) => void = () => undefined;

        const basemapPipeline = createMapBasemapPipeline({
            mapInstanceRef: this.mapInstance,
            selectedLayerRef: this.selectedLayer,
            customMapUrlRef: customMapUrl,
            basemapCircuitOpenRef: this.basemapCircuitOpen,
            tiandituTkRef: tiandituTk,
            ovitalTdtkeyRef: ovitalTdtkey,
            getTiandituTk: () => TIANDITU_TK,
            setTiandituTk: (value: string) => {
                TIANDITU_TK = value;
            },
            getOvitalTdtkey: () => OVITAL_TDTKEY,
            setOvitalTdtkey: (value: string) => {
                OVITAL_TDTKEY = value;
            },
            layerListRef: layerList,
            layerConfigs: LAYER_CONFIGS,
            layerInstances,
            layerStore: this.layerStore,
            emit,
            message,
            setCustomBasemapByUrl: (url: string) =>
                containerActions
                    ? containerActions.setCustomBasemapByUrl(url)
                    : Promise.resolve({ success: false }),
            syncUrlFromActiveMap: () => bootstrapApi?.syncUrlFromActiveMap(),
        });

        this.mapContainerRect = basemapPipeline.swipeFeature.mapContainerRect;
        this.enableBasemapSwipe = basemapPipeline.swipeFeature.enableBasemapSwipe;
        this.handleSwipePositionUpdate = basemapPipeline.swipeFeature.handleSwipePositionUpdate;
        this.handleSwipeModeUpdate = basemapPipeline.swipeFeature.handleSwipeModeUpdate;
        this.handleSwipeClose = basemapPipeline.swipeFeature.handleSwipeClose;
        this.handleLayerContextAction = basemapPipeline.handleLayerContextAction;
        this.handleResetBasemapChain = () => {
            basemapPipeline.resetBasemapChain?.({ targetLayerId: this.selectedLayer.value });
        };

        const {
            pendingBusPickRef,
            pendingReverseGeocodePickRef,
            startBusPointPick,
            startReverseGeocodePick,
            disposeAll: disposeInteractionPickers,
        } = createMapInteractionPickers({ mapInstance: this.mapInstance });

        const dropZone = useGisDropZone({
            onUpload: (payload: any) => emit('upload-data', payload),
        });
        this.isMapUploadDragging = dropZone.isDragging;
        this.handleMapUploadDragEnter = dropZone.handleDragEnter;
        this.handleMapUploadDragOver = dropZone.handleDragOver;
        this.handleMapUploadDragLeave = dropZone.handleDragLeave;
        this.handleMapUploadDrop = dropZone.handleDrop;

        const { detectIPLocale, getCurrentLocation, zoomToUser } = useUserLocation({
            mapInstance: this.mapInstance,
            userLocationSource,
            isDomestic: this.isDomestic,
            fitToLonLatExtent: (...args: any[]) =>
                (basemapPipeline.fitToLonLatExtent as (...a: any[]) => any)(...args),
        });

        const layerAndRoute = createMapLayerAndRoutePipeline({
            mapInstanceRef: this.mapInstance,
            selectedLayerRef: this.selectedLayer,
            layerListRef: layerList,
            userDataLayers,
            drawSource,
            busRouteSource,
            busRouteManagedLayerIdRef,
            getBusRouteLayer: () => busRouteLayerRef,
            tocStore,
            emit,
            message,
            getLayerCategory: basemapPipeline.getLayerCategory,
            refreshLayersState: () => bootstrapApi?.refreshLayersState(),
            setDrawStyle: (styleCfg: any) => setDrawStyleBridge(styleCfg),
        });

        const drawingActions = createMapDrawingActions({
            mapInstanceRef: this.mapInstance,
            drawSource,
            userDataLayers,
            isAttributeQueryEnabled,
            isReverseGeocodePickMode: this.isReverseGeocodePickMode,
            pendingReverseGeocodePickRef,
            tiandituTkRef: tiandituTk,
            message,
            emit,
            createStyleFromConfig: layerAndRoute.createStyleFromConfig,
            mergeStyleConfig: layerAndRoute.mergeStyleConfig,
            applyManagedLayerStyle: layerAndRoute.applyManagedLayerStyle,
            createManagedVectorLayer: layerAndRoute.createManagedVectorLayer,
            serializeManagedFeatures: layerAndRoute.serializeManagedFeatures,
            refreshUserLayerZIndex: layerAndRoute.refreshUserLayerZIndex,
            emitUserLayersChange: layerAndRoute.emitUserLayersChange,
            emitGraphicsOverview: layerAndRoute.emitGraphicsOverview,
            startReverseGeocodePick,
            drawPointByCoordinatesInput: layerAndRoute.searchFeature.drawPointByCoordinatesInput,
            getDrawLayerInstance: () => drawLayerInstance,
            getRemoveManagedLayerById: () => removeManagedLayerById,
        });
        setDrawStyleBridge = drawingActions.setDrawStyle;

        const { handleLayerChange, handleLayerOrderUpdate } = createLayerControlHandlers({
            selectedLayerRef: this.selectedLayer,
            customMapUrlRef: customMapUrl,
            layerListRef: layerList,
            layerInstances,
            refreshLayersState: () => bootstrapApi?.refreshLayersState(),
            createAutoTileSourceFromUrl,
            message,
            mapInstanceRef: this.mapInstance,
            emitBaseLayersChange: basemapPipeline.emitBaseLayersChangeBatched,
            onIdentifyResult: (payload: any) => emit('service-feature-query', payload),
        });
        this.handleLayerChange = handleLayerChange;
        this.handleLayerOrderUpdate = handleLayerOrderUpdate;

        setCapabilitiesProxyBuilder((url: string) => buildRequestProxyUrl(url), 'ol');
        const olRemoteServiceAdapter = createOlRemoteServiceAdapter({
            mapInstanceRef: this.mapInstance,
        });

        let syncAttributeTableMapExtentImpl = () => {};
        const syncAttributeTableMapExtent = () => {
            syncAttributeTableMapExtentImpl();
        };

        const { bindMapEvents } = createMapEventHandlers({
            mapInstanceRef: this.mapInstance,
            currentCoordinateRef: this.currentCoordinate,
            currentZoomRef: this.currentZoom,
            emit,
            getDrawInteraction: drawingActions.getDrawInteraction,
            getSketchFeature: drawingActions.getSketchFeature,
            queryRasterValueAtCoordinateRef,
            rightDragZoomControllerRef,
            isAttributeQueryEnabledRef: isAttributeQueryEnabled,
            tooltipRef: drawingActions.tooltipRef,
            syncAttributeTableMapExtent,
            pendingBusPickRef,
            pendingReverseGeocodePickRef,
            busPickSource,
            highlightManagedFeature: layerAndRoute.highlightManagedFeature,
        });

        const uiHandlers = createMapUIEventHandlers({
            mapInstanceRef: this.mapInstance,
            attrStoreRef: attrStore,
            emit,
            highlightManagedFeature: layerAndRoute.highlightManagedFeature,
            batchHighlightManagedFeatures: layerAndRoute.batchHighlightManagedFeatures,
            clearManagedFeatureHighlight: layerAndRoute.clearManagedFeatureHighlight,
            getCurrentHighlightedFeature: layerAndRoute.getCurrentHighlightedFeature,
            setCurrentHighlightedFeature: layerAndRoute.setCurrentHighlightedFeature,
            zoomToManagedFeature: layerAndRoute.zoomToManagedFeature,
            findManagedFeature: layerAndRoute.findManagedFeature,
            getUserDataLayers: () => userDataLayers,
            toggleGraticule: (...args: any[]) =>
                (basemapPipeline.toggleGraticule as (...a: any[]) => any)(...args),
            showDynamicSplitLinesRef: this.showDynamicSplitLines,
            selectedLayerRef: this.selectedLayer,
            INITIAL_VIEW,
            flyToView: (...args: any[]) =>
                (basemapPipeline.flyToView as (...a: any[]) => any)(...args),
            getLayerIndexById: basemapPipeline.getLayerIndexById,
        });
        syncAttributeTableMapExtentImpl = uiHandlers.syncAttributeTableMapExtent;

        removeManagedLayerById = layerAndRoute.userLayerFacade.removeUserLayer;
        queryRasterValueAtCoordinateRef.value =
            layerAndRoute.userLayerFacade.queryRasterValueAtCoordinate;

        containerActions = createMapContainerActions({
            mapInstanceRef: this.mapInstance,
            selectedLayerRef: this.selectedLayer,
            userDataLayers,
            message,
            getLayerIndexById: basemapPipeline.getLayerIndexById,
            handleLayerChange,
            syncUrlFromActiveMap: () => bootstrapApi?.syncUrlFromActiveMap(),
            setBaseLayerActiveDeferred: layerAndRoute.setBaseLayerActiveDeferred,
            switchLayerById: basemapPipeline.switchLayerById,
            emitBaseLayersChangeBatched: basemapPipeline.emitBaseLayersChangeBatched,
            emitUserLayersChange: layerAndRoute.emitUserLayersChange,
        });

        bootstrapApi = useMapBootstrap({
            getUrlSyncEnabled: () => props.urlSyncEnabled,
            emit,
            message,
            attrStore,
            urlParamStore,
            compassStore: this.compassStore,
            layerStore: this.layerStore,
            mapContainerRef: this.mapContainerRef,
            mapRef: this.mapRef,
            mapInstance: this.mapInstance,
            mapContainerRect: this.mapContainerRect,
            selectedLayer: this.selectedLayer,
            customMapUrl,
            showDynamicSplitLines: this.showDynamicSplitLines,
            currentZoom: this.currentZoom,
            currentCoordinate: this.currentCoordinate,
            componentUnmountedRef,
            tiandituTkRef: tiandituTk,
            getTiandituTk: () => TIANDITU_TK,
            drawSource,
            userLocationSource,
            busPickSource,
            busRouteSource,
            drawStyleConfig: drawingActions.drawStyleConfig,
            rightDragZoomControllerRef,
            styles: createMapStylesObject(),
            createStyleFromConfig: layerAndRoute.createStyleFromConfig,
            parseUrlToState: basemapPipeline.parseUrlToState,
            flyToView: basemapPipeline.flyToView,
            syncUrlFromMap: basemapPipeline.syncUrlFromMap,
            bindMapViewSync: basemapPipeline.bindMapViewSync,
            stopMapViewSync: basemapPipeline.stopMapViewSync,
            refreshLayerInstances: basemapPipeline.refreshLayerInstances,
            setGraticuleActive: basemapPipeline.setGraticuleActive,
            stopGraticule: basemapPipeline.stopGraticule,
            getLayerIdByIndex: basemapPipeline.getLayerIdByIndex,
            getLayerIndexById: basemapPipeline.getLayerIndexById,
            initializeBasemapLayers: basemapPipeline.initializeBasemapLayers,
            hydrateRuntimeMapTokens: basemapPipeline.hydrateRuntimeMapTokens,
            restoreSwipe: basemapPipeline.swipeFeature.restoreSwipe,
            clearSwipeCompareLayers: basemapPipeline.swipeFeature.clearSwipeCompareLayers,
            detachSwipeFromLayers: basemapPipeline.swipeFeature.detachSwipeFromLayers,
            disposeSwipe: basemapPipeline.swipeFeature.dispose,
            disposeDistrictManager: layerAndRoute.disposeDistrictManager,
            disposeInteractionPickers,
            disposeAllMonitors: basemapPipeline.disposeAllMonitors,
            disposeSelectionWatcher: basemapPipeline.disposeSelectionWatcher,
            bindBasemapSelectionWatcher: basemapPipeline.bindBasemapSelectionWatcher,
            refreshAllBasemapSourcesForHD: basemapPipeline.refreshAllBasemapSourcesForHD,
            emitBaseLayersChangeBatched: basemapPipeline.emitBaseLayersChangeBatched,
            emitUserLayersChange: layerAndRoute.emitUserLayersChange,
            syncAttributeTableMapExtent,
            bindMapEvents,
            getCurrentBusStepIndex: layerAndRoute.routeStepFeature.getCurrentBusStepIndex,
            getCurrentDriveStepIndex: layerAndRoute.routeStepFeature.getCurrentDriveStepIndex,
            getBusStepStyle: layerAndRoute.getBusStepStyle,
            getBusStepPointStyle: layerAndRoute.getBusStepPointStyle,
            getDriveStepStyle: layerAndRoute.getDriveStepStyle,
            clearRouteStepStyleCache: layerAndRoute.clearRouteStepStyleCache,
            zoomToUser,
            detectIPLocale,
            setCustomBasemapByUrl: containerActions.setCustomBasemapByUrl,
            setUserLayerVisibility: layerAndRoute.userLayerFacade.setUserLayerVisibility,
            setUserLayerOpacity: layerAndRoute.userLayerFacade.setUserLayerOpacity,
            removeUserLayer: layerAndRoute.userLayerFacade.removeUserLayer,
            renameUserLayer: containerActions.renameUserLayer,
            zoomToUserLayer: layerAndRoute.zoomToUserLayer,
            redeclareLayerCrs: layerAndRoute.redeclareLayerCrs,
            olRemoteServiceAdapter,
            setDrawLayerInstance: (layer) => {
                drawLayerInstance = layer;
            },
            setBusRouteLayer: (layer) => {
                busRouteLayerRef = layer;
            },
            onResetRuntimeState: () => {
                removeManagedLayerById = layerAndRoute.userLayerFacade.removeUserLayer;
                layerAndRoute.resetRouteBuilderApiCache();
            },
        });

        // ── 绑定全部公共方法与对外接口 ──
        this.handleToggleGraticule = uiHandlers.handleToggleGraticule;
        this.handleSearchJump = layerAndRoute.searchFeature.handleSearchJump;
        this.resetView = uiHandlers.resetView;
        this.zoomToUser = zoomToUser;
        this.handleJumpToCoordinates = uiHandlers.handleJumpToCoordinates;

        this.updateViewByParams = uiHandlers.updateViewByParams;
        this.locateAddress = basemapPipeline.locateAddress;
        this.addUserDataLayer = layerAndRoute.userLayerFacade.addUserDataLayer;
        this.exportUserLayerGeoJSON = containerActions.exportUserLayerGeoJSON;
        this.activateInteraction = drawingActions.activateInteraction;
        this.clearInteractions = drawingActions.clearInteractions;
        this.getCurrentLocation = getCurrentLocation;
        this.startBusPointPick = startBusPointPick;
        this.drawRouteOnMap = layerAndRoute.drawRouteOnMap;
        this.zoomToBusRouteStep = layerAndRoute.routeStepFeature.zoomToBusRouteStep;
        this.previewBusRouteStep = layerAndRoute.routeStepFeature.previewBusRouteStep;
        this.clearBusRouteStepPreview = layerAndRoute.routeStepFeature.clearBusRouteStepPreview;
        this.drawDriveRouteOnMap = layerAndRoute.drawDriveRouteOnMap;
        this.zoomToDriveRouteStep = layerAndRoute.routeStepFeature.zoomToDriveRouteStep;
        this.previewDriveRouteStep = layerAndRoute.routeStepFeature.previewDriveRouteStep;
        this.clearDriveRouteStepPreview = layerAndRoute.routeStepFeature.clearDriveRouteStepPreview;
        this.setDrawStyle = drawingActions.setDrawStyle;
        this.updateDrawingStyleParams = drawingActions.updateDrawingStyleParams;
        this.deleteSelectedDrawingFeature = drawingActions.deleteSelectedDrawingFeature;
        this.updateSelectedDrawingStyle = drawingActions.updateSelectedDrawingStyle;
        this.activateGeometryEditForLayer = drawingActions.activateGeometryEditForLayer;
        this.setUserLayerStyle = layerAndRoute.userLayerFacade.setUserLayerStyle;
        this.applyStyleTemplate = layerAndRoute.userLayerFacade.applyStyleTemplate;
        this.setUserLayerVisibility = layerAndRoute.userLayerFacade.setUserLayerVisibility;
        this.setUserLayerOpacity = layerAndRoute.userLayerFacade.setUserLayerOpacity;
        this.setUserLayerLabelVisibility = layerAndRoute.userLayerFacade.setUserLayerLabelVisibility;
        this.setBaseLayerActive = containerActions.setBaseLayerActive;
        this.setLayerVisibility = layerAndRoute.setLayerVisibility;
        this.zoomToUserLayer = layerAndRoute.zoomToUserLayer;
        this.zoomToManagedFeature = layerAndRoute.zoomToManagedFeature;
        this.removeUserLayer = layerAndRoute.userLayerFacade.removeUserLayer;
        this.reorderUserLayers = layerAndRoute.userLayerFacade.reorderUserLayers;
        this.handleAttributeTableFocusFeature = uiHandlers.handleAttributeTableFocusFeature;
        this.handleAttributeTableHighlightFeature = uiHandlers.handleAttributeTableHighlightFeature;
        this.handleAttributeTableCellEdit = uiHandlers.handleAttributeTableCellEdit;
        this.handleAttributeTableDeleteFeature = uiHandlers.handleAttributeTableDeleteFeature;
        this.soloUserLayer = layerAndRoute.userLayerFacade.soloUserLayer;
        this.renameUserLayer = containerActions.renameUserLayer;
        this.viewUserLayer = layerAndRoute.viewUserLayer;
        this.zoomToGraphics = drawingActions.zoomToGraphics;
        this.focusDistrictByAdcode = layerAndRoute.focusDistrictByAdcode;
        this.setDistrictLayerVisibility = layerAndRoute.setDistrictLayerVisibility;
        this.removeDistrictLayer = layerAndRoute.removeDistrictLayer;
        this.drawPointByCoordinatesInput = layerAndRoute.searchFeature.drawPointByCoordinatesInput;
        this.drawAmapAoiByDetailJsonInput = layerAndRoute.searchFeature.drawAmapAoiByDetailJsonInput;
        this.addSearchResultLayer = layerAndRoute.searchFeature.createSearchResultLayer;
        this.toggleLayerCRS = layerAndRoute.toggleLayerCRS;
        this.toggleSearchLayerCRS = layerAndRoute.toggleSearchLayerCRS;
        this.redeclareLayerCrs = layerAndRoute.redeclareLayerCrs;
        this.exportLayerCoordinates = containerActions.exportLayerCoordinates;
        this.runSpatialAnalysis = layerAndRoute.runSpatialAnalysis;
        this.getMapExtent = containerActions.getMapExtent;
        this.getCurrentViewState = basemapPipeline.getCurrentViewState;
        this.isStartupViewSettled = bootstrapApi.isStartupViewSettled;
        this.syncViewFromCesium = basemapPipeline.syncViewFromCesium;
        this.getMapSize = basemapPipeline.getMapSize;
        this.getOlView = basemapPipeline.getOlView;
        this.setCustomBasemapByUrl = containerActions.setCustomBasemapByUrl;
        this.zoomToRemoteService = (id: string) => olRemoteServiceAdapter?.zoomTo?.(id) ?? false;
    }
}
