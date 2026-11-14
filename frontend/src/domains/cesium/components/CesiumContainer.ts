/**
 * 功能名称：Cesium 三维地球主容器组件逻辑层
 * 说    明：采用视图层（CesiumContainer.vue）与逻辑层（CesiumContainer.ts）分离范式；
 *           具体实现下沉至 useCesiumBootstrap、useCesiumLayerAdapter、useCesiumAtmosphereAndHud
 *           与 useCesiumSceneFacade，本文件负责领域端口注册、依赖装配与对外统一暴露。
 */
import {
    computed,
    defineAsyncComponent,
    defineComponent,
    markRaw,
    onUnmounted,
    ref,
    type ComputedRef,
    type Ref,
    type SetupContext,
} from 'vue';
import { Copy, Eye, EyeOff, House, Upload } from '@lucide/vue';
import '@cesium-domain/vendors/cesium-navigation/styles/cesium-navigation.css';

import { BACKEND_BASE_URL } from '@/api/backend';
import { registerMapEngineAdapter, unregisterMapEngineAdapter } from '@common/map-adapter';
import { CesiumAdapter } from '@cesium-domain/adapter';
import { useMessage } from '@common/shell/useMessage';
import { translate as t } from '@common/app/useLocale';
import { getRuntimeMapTokensSync } from '@common/services/runtimeMapTokens';

import CesiumAdvancedEffects from './CesiumAdvancedEffects.vue';
import CesiumToolPanel from './CesiumToolPanel.vue';
import CesiumDataImportDialog from './CesiumDataImportDialog.vue';
import FluidSimulationPanel from '@cesium-domain/modules/fluid-simulation/FluidSimulationPanel.vue';
import PlayerGuidePanel from '@cesium-domain/modules/player-controller/PlayerGuidePanel.vue';
import NavGuideHUD from '@cesium-domain/modules/player-controller/NavGuideHUD.vue';
import NavTargetPicker from '@cesium-domain/modules/player-controller/NavTargetPicker.vue';

import { registerCesiumTreePort } from '../layers/toc-adapters/registerCesiumTreePort';
import { useCesiumLayersStore } from '@cesium-domain/stores/cesiumLayers';
import { useDrawMeasureStore } from '@cesium-domain/stores/useDrawMeasureStore';
import { useCesiumLayers } from '../composables/layers/useCesiumLayers';
import { useCesiumUrlTracking } from '../composables/layers/useCesiumUrlTracking';
import {
    PLANAR_SOURCE_ID,
    ROUTE_FLY_SOURCE_ID,
    useCesiumLayerAdapter,
} from '../composables/layers/useCesiumLayerAdapter';
import { useCesiumHeightSampler } from '../composables/terrain/useCesiumHeightSampler';
import { useCesiumDataImport } from '../composables/dataImport/useCesiumDataImport';
import { createCesiumDataOpsHandlers } from '../composables/dataImport/useCesiumDataOpsHandlers';
import { useCesiumInteractions } from '../composables/interaction/useCesiumInteractions';
import { useCesiumSceneFacade } from '../composables/interaction/useCesiumSceneFacade';
import { useCesiumSceneActions } from '../composables/camera/useCesiumSceneActions';
import { useCesiumCameraEnhanced } from '../composables/camera/useCesiumCameraEnhanced';
import { createCesiumAttrViewExtentSync } from '../composables/camera/useCesiumAttrViewExtentSync';
import { useCesiumModelManager } from '../composables/models/useCesiumModelManager';
import { createCesiumDrawMeasureFeature } from '../composables/draw/useCesiumDrawMeasure';
import { createCesiumRouteFeature } from '../composables/draw/useCesiumRouteRendering';
import { useCesiumToolModules } from '../composables/toolModules/useCesiumToolModules';
import { useCesiumAtmosphereAndHud } from '../composables/scene/useCesiumAtmosphereAndHud';
import { useCesiumBootstrap } from '../composables/core/useCesiumBootstrap';
import { useCesiumWind } from '@cesium-domain/modules/wind/useCesiumWind';
import { usePlayerController } from '@cesium-domain/modules/player-controller/usePlayerController';

const ShallowWaterOverlay = defineAsyncComponent(() =>
    import('@cesium-domain/modules/shallow-water/ShallowWaterOverlay.vue'),
);

// 模块加载即注册图层树端口（早于组件挂载，图层树首帧即可见「三维数据」分组）
registerCesiumTreePort();

// 一、Emits
type EmitsType = {
    'view-sync': [payload?: any];
    ready: [];
    'load-failed': [payload?: any];
    'drop-ol-layer': [payload?: any];
};

// 二、Props
const propDefine = {} as const;

// 三、组件注册入口
export default defineComponent({
    name: 'CesiumContainer',
    components: {
        ShallowWaterOverlay,
        CesiumToolPanel,
        PlayerGuidePanel,
        NavGuideHUD,
        NavTargetPicker,
        CesiumDataImportDialog,
        Upload,
        Eye,
        EyeOff,
        Copy,
        House,
    },
    props: propDefine,
    emits: ['view-sync', 'ready', 'load-failed', 'drop-ol-layer'],
    setup(_props, ctx) {
        return new Instance(ctx);
    },
});

// 四、组件实例
export class Instance {
    // ── 动态组件引用（<component :is="..."> 绑定） ──
    public CesiumAdvancedEffects = markRaw(CesiumAdvancedEffects);
    public FluidSimulationPanel = markRaw(FluidSimulationPanel);
    public t = t;

    // ── 状态 Refs ──
    public showPlayerGuide = ref(true);
    public navPickerVisible = ref(false);
    public cesiumReady = ref(false);
    public bootComplete = ref(false);
    public fluidPanelRef = ref<any>(null);
    public isReverseGeocodePickMode!: Ref<boolean>;
    public isDragOver!: Ref<boolean>;
    public isTouch!: Ref<boolean>;
    public hudVisible!: Ref<boolean>;

    // ── 图层、地形、面板配置 ──
    public activeBasemap!: Ref<string>;
    public activeTerrain!: Ref<string>;
    public customIonHeightOffset!: Ref<number>;
    public customIonTilesetReady!: Ref<boolean>;
    public customXyzBasemapUrl!: Ref<string>;
    public basemapOptions!: Ref<any[]>;
    public terrainOptions!: any[];
    public overlayOptions!: Ref<any[]>;
    public cesiumToolPanelOpen!: Ref<boolean>;
    public advancedEffectControls!: Ref<any>;
    public fluidParams!: Ref<any>;
    public shallowWaterVisible!: Ref<boolean>;
    public shallowWaterParams!: Ref<any>;
    public toolModules!: Ref<any>;
    public routeFlyState!: Ref<any>;
    public routeFlyHudTip!: ComputedRef<string>;

    // ── 控制器与数据弹窗状态 ──
    public playerController!: any;
    public modelManager!: any;
    public cameraEnhanced!: any;
    public heightSampler!: any;
    public pendingGltfFile!: ComputedRef<any>;
    public repositionTarget!: ComputedRef<any>;
    public gltfLoading!: ComputedRef<boolean>;
    public gltfLoadError!: ComputedRef<string>;
    public coordinateGroups!: ComputedRef<any>;
    public mobileCoordinateText!: ComputedRef<string>;
    public hudToggleTitle!: ComputedRef<string>;
    public displayTileZoom!: ComputedRef<string>;

    // ── 模板事件回调 ──
    public onDragOver!: (event: DragEvent) => void;
    public onDragLeave!: (event: DragEvent) => void;
    public onDrop!: (event: DragEvent) => Promise<void>;
    public handleToolAction!: (...args: any[]) => any;
    public handleToolControlChange!: (...args: any[]) => any;
    public handleFluidStateChange!: (...args: any[]) => any;
    public handleOverlayToggle!: (...args: any[]) => any;
    public handleCustomBasemapSubmit!: (...args: any[]) => any;
    public handleRemoteServiceSubmit!: (...args: any[]) => any;
    public handleDataImport!: (...args: any[]) => Promise<any>;
    public handleImportTilesetZip!: (...args: any[]) => any;
    public handleImportTilesetFolder!: (...args: any[]) => any;
    public handleImportTilesetSample!: (...args: any[]) => any;
    public handleNavTargetSelect!: (type: string) => void;
    public handleGltfCoordConfirm!: (...args: any[]) => any;
    public handleGltfCoordCancel!: (...args: any[]) => any;
    public copyActiveCoordinateDisplay!: () => Promise<void>;
    public handleHomeClick!: () => void;

    // ── 对外暴露接口（原 defineExpose） ──
    public getViewer!: () => any;
    public getCesium!: () => any;
    public getCurrentViewState!: () => any;
    public waitForViewIdle!: (opts?: any) => Promise<any>;
    public setBasemapById!: (presetId: string) => Promise<boolean>;
    public focusDistrictByAdcode!: (payload?: any) => Promise<boolean>;
    public toggleReverseGeocodePick!: () => Promise<void>;
    public zoomToRemoteService!: (serviceId: string) => any;
    public importUserData!: (data: any) => Promise<any>;
    public focusAttributeFeature!: (entityId: string) => void;
    public redeclareLayerCrs!: (payload?: { layerId?: string; crs?: string }) => Promise<boolean>;
    public activateCesiumInteraction!: (type: string) => any;
    public updateCesiumDrawingStyle!: (patch: any) => any;
    public updateCesiumLayerStyle!: (id: string, patch: any) => boolean;
    public finishCesiumDraw!: () => any;
    public cancelCesiumDraw!: () => any;
    public flyToCesiumDrawing!: () => any;
    public getCesiumDrawState!: () => any;
    public startRoutePointPick!: (type: string) => any;
    public drawCesiumBusRoute!: (route: any) => any;
    public drawCesiumDriveRoute!: (payload: any) => any;
    public zoomToCesiumRouteStep!: (mode: string, stepIndex: number) => any;
    public previewCesiumRouteStep!: (mode: string, stepIndex: number) => any;
    public clearCesiumStepPreview!: (mode: string) => boolean;
    public jumpTo!: (lng: number, lat: number, heightMeters?: number) => boolean;
    public measureGroundResolution!: () => number | null;
    public getCameraHeight!: () => number | null;
    public setCameraHeightKeepOrientation!: (heightMeters: number) => void;

    constructor(ctx: SetupContext<EmitsType>) {
        const message = useMessage();
        const emit = ctx.emit as (event: any, ...args: any[]) => void;

        let cesiumNs: any = null;
        let viewerInstance: any = null;
        const runtimeMapTokens = ref(getRuntimeMapTokensSync());

        const getViewer = () => viewerInstance;
        const setViewer = (v: any) => {
            viewerInstance = v;
        };
        const getCesium = () => cesiumNs || (window as any).Cesium;
        const setCesium = (ns: any) => {
            cesiumNs = ns;
        };
        const getTiandituToken = () => runtimeMapTokens.value.tiandituTk;
        const getOvitalTdtkey = () => runtimeMapTokens.value.ovitalTdtkey;
        const getCesiumIonToken = () => runtimeMapTokens.value.cesiumIonToken;

        this.getViewer = getViewer;
        this.getCesium = getCesium;

        // ── 注册统一三维地图引擎适配器 (Phase 1 跨引擎架构) ──
        const cesiumAdapter = new CesiumAdapter({
            getViewer,
        });
        registerMapEngineAdapter(cesiumAdapter);

        onUnmounted(() => {
            unregisterMapEngineAdapter('cesium');
        });

        const heightSampler = useCesiumHeightSampler({ getViewer, getCesium });
        this.heightSampler = heightSampler;

        const dataImport = useCesiumDataImport({
            getViewer,
            getCesium,
            message,
            heightSampler,
        });

        const layers = useCesiumLayers({
            getViewer,
            getCesium,
            message,
            backendBaseUrl: BACKEND_BASE_URL,
            tiandituToken: getTiandituToken,
            ovitalTdtkeyToken: getOvitalTdtkey,
            cesiumIonToken: getCesiumIonToken,
            dataImport,
        });

        this.activeBasemap = layers.activeBasemap;
        this.activeTerrain = layers.activeTerrain;
        this.customXyzBasemapUrl = layers.customXyzBasemapUrl;
        this.customIonHeightOffset = layers.customIonHeightOffset;
        this.customIonTilesetReady = layers.customIonTilesetReady;
        this.basemapOptions = layers.basemapOptions;
        this.terrainOptions = layers.terrainOptions;
        this.overlayOptions = layers.overlayOptions;
        this.handleOverlayToggle = layers.handleOverlayToggle;
        this.handleCustomBasemapSubmit = layers.handleCustomBasemapSubmit;
        this.handleRemoteServiceSubmit = layers.handleRemoteServiceSubmit;
        this.zoomToRemoteService = layers.zoomToRemoteService;

        const interactions = useCesiumInteractions({ getViewer, getCesium } as any);
        const urlTracking = useCesiumUrlTracking({
            getViewer,
            getCesium,
            onCameraViewSync: (payload: any) => emit('view-sync', payload),
            onBasemapRestore: (selection: any) => {
                const normalized = typeof selection === 'string' ? { id: selection } : selection;
                if (!normalized?.id) return;

                if (normalized.id === 'custom') {
                    if (
                        layers.customXyzBasemapUrl.value &&
                        layers.activeBasemap.value === 'custom' &&
                        getViewer() &&
                        getCesium()
                    ) {
                        layers.applyBasemap('custom', { forceReload: true });
                    } else if (layers.activeBasemap.value !== 'custom') {
                        layers.activeBasemap.value = 'custom';
                    }
                    return;
                }

                if (layers.activeBasemap.value !== normalized.id) {
                    layers.activeBasemap.value = normalized.id;
                }
            },
        });

        const sceneActions = useCesiumSceneActions({ getViewer, getCesium });
        const wind = useCesiumWind({ getViewer, getCesium, message });
        const modelManager = useCesiumModelManager({ getViewer, getCesium, message });
        const cameraEnhanced = useCesiumCameraEnhanced({ getViewer, getCesium });
        const attrViewExtentSync = createCesiumAttrViewExtentSync({ getViewer, getCesium });
        this.modelManager = modelManager;
        this.cameraEnhanced = cameraEnhanced;

        const cesiumLayersStore = useCesiumLayersStore();
        const drawMeasureStore = useDrawMeasureStore();
        const drawMeasureFeature = createCesiumDrawMeasureFeature({
            getCesium,
            getViewer,
            cesiumLayersStore,
            getLabel: (key: string) => t(`cesium.drawMeasure.label.${key}`),
            onResult: (result: any) => {
                drawMeasureStore.setResult(result, result.summary || '');
            },
            onStateChange: (state: any) => {
                drawMeasureStore.setActiveType(state.drawing ? state.mode : null);
            },
            onRemoved: (id: string) => {
                if (drawMeasureStore.lastResult?.id === id) drawMeasureStore.setResult(null);
            },
            onReject: (code: string) => {
                if (code === 'need-more-points') {
                    message.warning(t('cesium.drawMeasure.toast.needMorePoints'));
                } else if (code === 'need-second-click') {
                    message.warning(t('cesium.drawMeasure.toast.needSecondClick'));
                } else if (code === 'failed') {
                    message.warning(t('cesium.drawMeasure.toast.failed'));
                }
            },
        });

        drawMeasureFeature.setMeasureOptions(drawMeasureStore.measureOptions);
        drawMeasureFeature.updateStyle(drawMeasureStore.style);

        const routeFeature = createCesiumRouteFeature({
            getCesium,
            getViewer,
            cesiumLayersStore,
        });

        const playerController = usePlayerController({ getViewer, getCesium, message });
        this.playerController = playerController;
        playerController.setOpenNavDialogHandler(() => {
            this.navPickerVisible.value = true;
        });

        this.handleNavTargetSelect = (type: string) => {
            if (type === 'pick') {
                playerController.startNavPick();
            } else if (type === 'search') {
                message.info(t('cesium.toast.navUseSearch'));
            } else if (type === 'data') {
                message.info(t('cesium.toast.navClickFeature'));
                playerController.startNavPick();
            }
        };

        this.pendingGltfFile = computed(() => dataImport.pendingGltfFile.value);
        this.repositionTarget = computed(() => dataImport.repositionTarget?.value);
        this.gltfLoading = computed(() => !!dataImport.gltfLoading.value);
        this.gltfLoadError = computed(() => dataImport.gltfLoadError.value || '');

        function syncPlanarSourceRecord(info: any) {
            const loadedSources = dataImport.loadedDataSources as Ref<any[]>;
            const list = loadedSources.value || [];
            const exists = list.some((item: any) => item.id === PLANAR_SOURCE_ID);
            if (info?.present && info.dataSource && !exists) {
                loadedSources.value = [
                    ...list,
                    {
                        id: PLANAR_SOURCE_ID,
                        name: info.name || t('cesium.module.planarRoute.msg.defaultRouteName'),
                        type: 'wayline',
                        entity: info.dataSource,
                        managedByModule: true,
                    },
                ];
            } else if (!info?.present && exists) {
                loadedSources.value = list.filter(
                    (item: any) => item.id !== PLANAR_SOURCE_ID,
                );
            }
        }

        function syncRouteFlySourceRecord(info: any) {
            const loadedSources = dataImport.loadedDataSources as Ref<any[]>;
            const list = loadedSources.value || [];
            const exists = list.some((item: any) => item.id === ROUTE_FLY_SOURCE_ID);
            if (info?.present && info.dataSource && !exists) {
                loadedSources.value = [
                    ...list,
                    {
                        id: ROUTE_FLY_SOURCE_ID,
                        name: info.name || t('cesium.module.routeFly.sourceName'),
                        type: 'wayline',
                        entity: info.dataSource,
                        managedByModule: true,
                    },
                ];
            } else if (!info?.present && exists) {
                loadedSources.value = list.filter(
                    (item: any) => item.id !== ROUTE_FLY_SOURCE_ID,
                );
            }
        }

        const toolModulesFeature = useCesiumToolModules({
            fluidPanelRef: this.fluidPanelRef,
            sceneActions,
            wind,
            playerController,
            getViewer,
            getCesium,
            syncPlanarSource: syncPlanarSourceRecord,
            syncRouteFlySource: syncRouteFlySourceRecord,
        });

        this.cesiumToolPanelOpen = toolModulesFeature.toolPanelOpen;
        this.advancedEffectControls = toolModulesFeature.advancedEffectControls;
        this.fluidParams = toolModulesFeature.fluidParams;
        this.shallowWaterVisible = toolModulesFeature.shallowWaterVisible;
        this.shallowWaterParams = toolModulesFeature.shallowWaterParams;
        this.toolModules = toolModulesFeature.toolModules;
        this.handleToolAction = toolModulesFeature.handleToolAction;
        this.handleToolControlChange = toolModulesFeature.handleToolControlChange;
        this.handleFluidStateChange = toolModulesFeature.handleFluidStateChange;
        this.routeFlyState = toolModulesFeature.routeFlyState;

        this.routeFlyHudTip = computed(() => {
            const s = toolModulesFeature.routeFlyState.value;
            const stateKey = s.isDrawing
                ? 'drawing'
                : s.isPaused
                  ? 'paused'
                  : s.isFlying
                    ? 'flying'
                    : 'ready';
            const tip = String(t(`cesium.module.routeFly.hud.${stateKey}`));
            if (!tip.startsWith('cesium.module.')) return tip;
            const statusText = String(t(`cesium.module.routeFly.status.${stateKey}`));
            return statusText.startsWith('cesium.module.') ? '' : statusText;
        });

        let bootstrapApi: ReturnType<typeof useCesiumBootstrap> | null = null;

        const dataOpsHandlers = createCesiumDataOpsHandlers({
            dataImport,
            repositionTargetRef: this.repositionTarget,
            getCesium,
            isComponentUnmounted: () => bootstrapApi?.isComponentUnmounted() ?? false,
        });
        this.handleDataImport = dataOpsHandlers.handleDataImport;
        this.handleImportTilesetSample = dataOpsHandlers.handleImportTilesetSample;
        this.handleImportTilesetZip = dataOpsHandlers.handleImportTilesetZip;
        this.handleImportTilesetFolder = dataOpsHandlers.handleImportTilesetFolder;
        this.handleGltfCoordConfirm = dataOpsHandlers.handleGltfCoordConfirm;
        this.handleGltfCoordCancel = dataOpsHandlers.handleGltfCoordCancel;

        const layerAdapter = useCesiumLayerAdapter({
            getCesium,
            getViewer,
            message,
            dataImport,
            cesiumLayersStore,
            drawMeasureFeature,
            routeFeature,
            zoomToRemoteService: layers.zoomToRemoteService,
            getRsvcHandlers: () => ({
                setMaterial: dataOpsHandlers.handleDataSetMaterial,
                reposition: dataOpsHandlers.handleDataReposition,
                stretchHeight: dataOpsHandlers.handleDataStretchHeight,
            }),
            getDetachCallbacks: () => ({
                detachPlanarWorkingSet: toolModulesFeature.detachPlanarWorkingSet,
                detachRouteFlyWorkingSet: toolModulesFeature.detachRouteFlyWorkingSet,
            }),
        });
        this.redeclareLayerCrs = layerAdapter.redeclareLayerCrs;
        this.focusAttributeFeature = layerAdapter.focusAttributeFeature;

        const hudAndAtmosphere = useCesiumAtmosphereAndHud({
            getCesium,
            getViewer,
            message,
            cesiumReady: this.cesiumReady,
            coordinateDisplay: interactions.coordinateDisplay,
            playerController,
            flyToHome: sceneActions.flyToHome,
            baseAtmosphereParams: toolModulesFeature.baseAtmosphereParams,
            atmosphereParams: toolModulesFeature.atmosphereParams,
            cloudParams: toolModulesFeature.cloudParams,
        });
        this.isTouch = hudAndAtmosphere.isTouch;
        this.coordinateGroups = hudAndAtmosphere.coordinateGroups;
        this.mobileCoordinateText = hudAndAtmosphere.mobileCoordinateText;
        this.copyActiveCoordinateDisplay = hudAndAtmosphere.copyActiveCoordinateDisplay;
        this.hudVisible = hudAndAtmosphere.hudVisible;
        this.hudToggleTitle = hudAndAtmosphere.hudToggleTitle;
        this.displayTileZoom = hudAndAtmosphere.displayTileZoom;
        this.handleHomeClick = hudAndAtmosphere.handleHomeClick;

        const sceneFacade = useCesiumSceneFacade({
            getCesium,
            getViewer,
            emit,
            message,
            cesiumReady: this.cesiumReady,
            activeBasemap: layers.activeBasemap,
            basemapOptions: layers.basemapOptions,
            layers,
            syncBasemapToUrl: urlTracking.syncBasemapToUrl,
            dataImport,
            handleDataImport: dataOpsHandlers.handleDataImport,
        });
        this.getCurrentViewState = sceneFacade.getCurrentViewState;
        this.waitForViewIdle = sceneFacade.waitForViewIdle;
        this.setBasemapById = sceneFacade.setBasemapById;
        this.focusDistrictByAdcode = sceneFacade.focusDistrictByAdcode;
        this.isReverseGeocodePickMode = sceneFacade.isReverseGeocodePickMode;
        this.toggleReverseGeocodePick = sceneFacade.toggleReverseGeocodePick;
        this.importUserData = sceneFacade.importUserData;
        this.isDragOver = sceneFacade.isDragOver;
        this.onDragOver = sceneFacade.onDragOver;
        this.onDragLeave = sceneFacade.onDragLeave;
        this.onDrop = sceneFacade.onDrop;
        this.jumpTo = sceneFacade.jumpTo;
        this.measureGroundResolution = sceneFacade.measureGroundResolution;
        this.getCameraHeight = sceneFacade.getCameraHeight;
        this.setCameraHeightKeepOrientation = sceneFacade.setCameraHeightKeepOrientation;

        bootstrapApi = useCesiumBootstrap({
            getCesium,
            setCesium,
            getViewer,
            setViewer,
            getCesiumIonToken,
            getTiandituToken,
            emit,
            message,
            cesiumReady: this.cesiumReady,
            bootComplete: this.bootComplete,
            showPlayerGuide: this.showPlayerGuide,
            cesiumToolPanelOpen: toolModulesFeature.toolPanelOpen,
            runtimeMapTokens,
            activeBasemap: layers.activeBasemap,
            customXyzBasemapUrl: layers.customXyzBasemapUrl,
            advancedEffectControls: toolModulesFeature.advancedEffectControls,
            atmosphereParams: toolModulesFeature.atmosphereParams,
            cloudParams: toolModulesFeature.cloudParams,
            layers,
            cesiumLayersStore,
            drawMeasureStore,
            drawMeasureFeature,
            routeFeature,
            playerController,
            dataImport,
            modelManager,
            cameraEnhanced,
            heightSampler,
            attrViewExtentSync,
            cameraAttitude: hudAndAtmosphere.cameraAttitude,
            syncTileZoomLevel: hudAndAtmosphere.syncTileZoomLevel,
            updateGroundAtmosphereFade: hudAndAtmosphere.updateGroundAtmosphereFade,
            setupInteractions: interactions.setupInteractions,
            cleanupInteractions: interactions.cleanupInteractions,
            cleanupTools: toolModulesFeature.cleanupTools,
            restoreCameraFromUrl: urlTracking.restoreCameraFromUrl,
            restoreBasemapFromUrl: urlTracking.restoreBasemapFromUrl,
            syncBasemapToUrl: urlTracking.syncBasemapToUrl,
            bindCameraViewSync: urlTracking.bindCameraViewSync,
            cleanupCameraViewSync: urlTracking.cleanupCameraViewSync,
            flyToHome: sceneActions.flyToHome,
            cleanupAdapter: layerAdapter.cleanupAdapter,
            cleanupReverseGeocodePick: sceneFacade.cleanupReverseGeocodePick,
        });

        // ── 绘制/测量/路线对外转发 ──
        this.activateCesiumInteraction = (type: string) => drawMeasureFeature.activateInteraction(type);
        this.updateCesiumDrawingStyle = (patch: any) => drawMeasureFeature.updateStyle(patch);
        this.updateCesiumLayerStyle = (id: string, patch: any) => cesiumLayersStore.setStyle(id, patch);
        this.finishCesiumDraw = () => drawMeasureFeature.finish();
        this.cancelCesiumDraw = () => drawMeasureFeature.cancel();
        this.flyToCesiumDrawing = () => drawMeasureFeature.flyToLast();
        this.getCesiumDrawState = () => drawMeasureFeature.getState();
        this.startRoutePointPick = (type: string) => routeFeature.startPointPick(type);
        this.drawCesiumBusRoute = (route: any) => routeFeature.drawBusRoute(route);
        this.drawCesiumDriveRoute = (payload: any) => routeFeature.drawDriveRoute(payload);
        this.zoomToCesiumRouteStep = (mode: string, stepIndex: number) =>
            routeFeature.zoomToRouteStep(mode, stepIndex);
        this.previewCesiumRouteStep = (mode: string, stepIndex: number) =>
            routeFeature.previewRouteStep(mode, stepIndex);
        this.clearCesiumStepPreview = (mode: string) => {
            if (mode === 'bus' || mode === 'drive') routeFeature.clearPreview();
            return true;
        };
    }
}
