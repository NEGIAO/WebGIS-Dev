/**
 * 功能名称：WebGIS 主页面视图逻辑层（HomeView.ts）
 * 说    明：采用视图层（HomeView.vue）与逻辑层（HomeView.ts）分离范式；
 *           具体状态与路由分发下沉至 useHomePanels、useHomeEngineSwitch 与 useHomeLayerAndMapRouting，
 *           本文件负责组件注册、核心引用装配与模板统一暴露。
 */
import { defineAsyncComponent, defineComponent, ref, type Ref } from 'vue';
import { Leaf } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '@/stores';
import { translate as t, useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import { useSharedCustomBasemapUrl } from '@common/basemap/useSharedCustomBasemapUrl';
import { MAP_VIEW_CESIUM, useMapViewUrlState } from '@ol/url-state/useMapViewUrlState';

import TopBar from '@common/shell/TopBar.vue';
import ControlsPanel from '@ol/components/ControlsPanel.vue';
import MapContainer from '@ol/components/MapContainer.vue';
import MagicCursor from '@common/shell/MagicCursor.vue';
import FloatingAccountPanel from '@common/user/components/FloatingAccountPanel.vue';
import PersistentAnnouncementBar from '@common/shell/PersistentAnnouncementBar.vue';
import ResizeHandle from '@common/shell/ResizeHandle.vue';

import { loadSidePanelModule } from './composables/useLazyModules';
import {
    DEFAULT_SIDE_PANEL_RATIO,
    MAX_SIDE_PANEL_RATIO,
    MIN_SIDE_PANEL_RATIO,
    useHomePanels,
} from './composables/useHomePanels';
import { useHomeEngineSwitch } from './composables/useHomeEngineSwitch';
import { useHomeLayerAndMapRouting } from './composables/useHomeLayerAndMapRouting';

let notifySidePanelLoadError = (_msg: string) => {};

const LogMonitor = defineAsyncComponent(() => import('@ol/components/LogMonitor.vue'));
const AttributeTable = defineAsyncComponent(() => import('@ol/layer/components/AttributeTable.vue'));
const SidePanel = defineAsyncComponent({
    loader: loadSidePanelModule,
    delay: 0,
    timeout: 15000,
    onError(error: any, retry, fail, attempts) {
        const text = String(error?.message || error || '');
        const isStaleOptimizeDep =
            text.includes('Outdated Optimize Dep') ||
            text.includes('Failed to fetch dynamically imported module');
        if (isStaleOptimizeDep && attempts <= 1) {
            retry();
            return;
        }
        notifySidePanelLoadError(t('shell.loadPanelFailed'));
        fail();
    },
});

export default defineComponent({
    name: 'HomeView',
    components: {
        Leaf,
        MagicCursor,
        TopBar,
        PersistentAnnouncementBar,
        ControlsPanel,
        FloatingAccountPanel,
        MapContainer,
        ResizeHandle,
        LogMonitor,
        AttributeTable,
        SidePanel,
    },
    setup() {
        return new Instance();
    },
});

export class Instance {
    public t!: (key: string, params?: Record<string, any>) => string;
    public DEFAULT_SIDE_PANEL_RATIO = DEFAULT_SIDE_PANEL_RATIO;
    public MIN_SIDE_PANEL_RATIO = MIN_SIDE_PANEL_RATIO;
    public MAX_SIDE_PANEL_RATIO = MAX_SIDE_PANEL_RATIO;

    public logMonitorVisible!: Ref<boolean>;
    public sharedCustomBasemapUrl!: Ref<string>;
    public is3DMode!: Ref<boolean>;
    public mapContainerRef = ref<any>(null);
    public cesiumContainerRef = ref<any>(null);

    // ── 面板与状态 ──
    public locationInfo!: ReturnType<typeof useHomePanels>['locationInfo'];
    public selectedImage!: Ref<string>;
    public isWeatherBoardMode!: Ref<boolean>;
    public shouldLoadWeatherChartPanel!: Ref<boolean>;
    public isMagicMode!: Ref<boolean>;
    public magicEffectData!: Ref<string>;
    public isSidePanelCollapsed!: Ref<boolean>;
    public isPanelRevealing!: Ref<boolean>;
    public shouldLoadSidePanel!: Ref<boolean>;
    public activeSidePanelTab!: Ref<string>;
    public toolboxTab!: Ref<string>;
    public userLayers!: Ref<any[]>;
    public featureQueryResult!: Ref<Record<string, any> | null>;
    public featureQueryMeta!: Ref<{ title?: string } | null>;
    public showQueryPanel!: Ref<boolean>;
    public toolboxOverview!: Ref<{ drawCount: number; uploadCount: number; layers: any[] }>;
    public baseLayers!: Ref<any[]>;
    public uploadProgress!: Ref<{ phase: string; [key: string]: any }>;
    public latestSearchPoi!: Ref<Record<string, any>>;
    public activeFeature!: Ref<{ key: string; label: string }>;
    public isAccountPanelOpen!: Ref<boolean>;
    public isAccountPanelFullscreen!: Ref<boolean>;
    public sidePanelRatio!: Ref<number>;
    public isPanelDragging!: Ref<boolean>;

    // ── 引擎切换与异步加载 ──
    public CesiumContainer!: Ref<any>;
    public isEngineSwitching!: Ref<boolean>;
    public isCesiumLoaded!: Ref<boolean>;

    // ── 模板回调 ──
    public handlePanelResize!: (leftRatio: number) => void;
    public handlePanelResizeEnd!: () => void;
    public handleLocationChange!: (locationData: any) => void;
    public toggleSidePanel!: () => void;
    public openChat!: () => void;
    public openToolbox!: () => void;
    public openCompassPanel!: () => Promise<void>;
    public openBusPlanner!: () => void;
    public openDrivePlanner!: () => void;
    public openBuildingsPanel!: () => void;
    public handleActivateFeature!: (feature: any) => void;
    public handleSwitchSidePanelTab!: (tab: string) => void;
    public handleControlsOpenTab!: (tab: string) => void;
    public handleControlsToggleTab!: (tab: string) => void;
    public handleControlsToggleToolboxTab!: (tab: string) => void;
    public handleAccountPanelFullscreenChange!: (fullscreen: boolean) => void;
    public handleToggleAccountPanel!: () => void;
    public handleCloseChat!: () => void;
    public toggleWeatherBoardMode!: () => void;
    public handleActivateMagic!: (effectName: string) => void;
    public handleGraphicsOverview!: (data: any) => void;
    public handleUploadProgressChange!: (progress: any) => void;
    public handleSearchPoiSelected!: (poiPayload: any) => void;
    public closeQueryPanel!: () => void;
    public handleServiceFeatureQuery!: (payload: any) => void;

    public handleCesiumReady!: () => void;
    public handleCesiumLoadFailed!: () => void;
    public toggle3D!: () => Promise<void>;
    public handleViewSync!: (payload: any) => void;
    public handleTopBarJumpView!: (lng: number, lat: number, z: number, layer: any) => void;

    public getCesiumViewerForPicker!: () => any;
    public getCesiumNamespaceForPicker!: () => any;
    public getMapUserLocation!: (enableHighAccuracy?: boolean) => any;
    public startBusPointPick!: (type: string) => any;
    public drawRouteOnMap!: (route: any) => any;
    public zoomToBusRouteStep!: (stepIndex: number) => any;
    public previewBusRouteStep!: (stepIndex: number) => any;
    public clearBusRouteStepPreview!: () => any;
    public drawDriveRouteOnMap!: (routeLatLonStr: string) => any;
    public zoomToDriveRouteStep!: (stepIndex: number) => any;
    public previewDriveRouteStep!: (stepIndex: number) => any;
    public clearDriveRouteStepPreview!: () => any;

    public handleControlsMapInteraction!: (type: string) => void;
    public handleInteraction!: (type: string) => void;
    public handleControlsDrawStyleChange!: (stylePayload: any) => void;
    public handleControlsDrawEditAction!: (action: string) => void;
    public handleCesiumDrawAction!: (action: string) => void;
    public handleControlsShowAnalysis!: () => void;
    public handleSpatialAnalysis!: (payload: any) => void;
    public handleControlsDistrictSelect!: (payload: any) => Promise<void>;
    public handleEnableBasemapSwipe!: (payload: any) => Promise<void>;
    public handleUploadData!: (data: any) => Promise<void>;
    public handleToggleLayerVisibility!: (payload: { layerId: string; visible: boolean }) => void;
    public handleChangeLayerOpacity!: (payload: { layerId: string; opacity: number }) => void;
    public handleRenameLayer!: (payload: { layerId: string; newName: string }) => void;
    public handleZoomLayer!: (layerId: string) => void;
    public handleViewLayer!: (layerId: string) => void;
    public handleRemoveLayer!: (layerId: string) => void;
    public handleEditLayer!: (layerId: string) => void;
    public handleReorderUserLayers!: (payload: any) => void;
    public handleSoloLayer!: (layerId: string) => void;
    public handleApplyStyleTemplate!: (payload: any) => void;
    public handleUpdateDrawStyle!: (styleConfig: any) => void;
    public handleUpdateLayerStyle!: (payload: any) => void;
    public handleUpdateCesiumLayerStyle!: (payload: any) => void;
    public handleAttributeTableFocusFeature!: (payload: any) => void;
    public handleAttributeTableHighlightFeature!: (payload: any) => void;
    public handleAttributeTableCellEdit!: (payload: any) => void;
    public handleAttributeTableDeleteFeature!: (payload: any) => void;
    public handleHighlightAttributeFeature!: (payload: any) => void;
    public handleZoomAttributeFeature!: (payload: any) => void;
    public handleToggleLayerLabelVisibility!: (payload: any) => void;
    public handleDrawPointByCoordinates!: (payload: any) => void;
    public handleDrawAmapAoiFromJson!: (payload: any) => void;
    public handleToggleLayerCRS!: (payload: any) => void;
    public handleReprojectLayer!: (payload: any) => void;
    public handleExportLayerData!: (payload: any) => void;
    public handleImportOlLayerTo3D!: (payload?: any) => Promise<void>;
    public handleUserLayersChange!: (layers: any[]) => void;
    public handleBaseLayersChange!: (layers: any[]) => void;
    public handleLayerSelected!: (layerId: string) => void;
    public handleFeatureSelected!: (properties: any) => void;
    public handleMapCoreReady!: () => void;
    public handleMapCoreFailed!: (payload?: any) => void;

    constructor() {
        const message = useMessage();
        notifySidePanelLoadError = (msg: string) => message.error(msg);

        const locale = useLocale();
        this.t = locale.t;

        const { logMonitorVisible } = storeToRefs(useAppStore());
        this.logMonitorVisible = logMonitorVisible;

        const { customBasemapUrl: sharedCustomBasemapUrl } = useSharedCustomBasemapUrl();
        this.sharedCustomBasemapUrl = sharedCustomBasemapUrl;

        const { getCurrentMapView, replaceMapView } = useMapViewUrlState();
        this.is3DMode = ref(getCurrentMapView() === MAP_VIEW_CESIUM);

        const panels = useHomePanels({
            mapContainerRef: this.mapContainerRef,
            is3DMode: this.is3DMode,
            replaceMapView,
        });

        this.locationInfo = panels.locationInfo;
        this.selectedImage = panels.selectedImage;
        this.isWeatherBoardMode = panels.isWeatherBoardMode;
        this.shouldLoadWeatherChartPanel = panels.shouldLoadWeatherChartPanel;
        this.isMagicMode = panels.isMagicMode;
        this.magicEffectData = panels.magicEffectData;
        this.isSidePanelCollapsed = panels.isSidePanelCollapsed;
        this.isPanelRevealing = panels.isPanelRevealing;
        this.shouldLoadSidePanel = panels.shouldLoadSidePanel;
        this.activeSidePanelTab = panels.activeSidePanelTab;
        this.toolboxTab = panels.toolboxTab;
        this.userLayers = panels.userLayers;
        this.featureQueryResult = panels.featureQueryResult;
        this.featureQueryMeta = panels.featureQueryMeta;
        this.showQueryPanel = panels.showQueryPanel;
        this.toolboxOverview = panels.toolboxOverview;
        this.baseLayers = panels.baseLayers;
        this.uploadProgress = panels.uploadProgress;
        this.latestSearchPoi = panels.latestSearchPoi;
        this.activeFeature = panels.activeFeature;
        this.isAccountPanelOpen = panels.isAccountPanelOpen;
        this.isAccountPanelFullscreen = panels.isAccountPanelFullscreen;
        this.sidePanelRatio = panels.sidePanelRatio;
        this.isPanelDragging = panels.isPanelDragging;
        this.handlePanelResize = panels.handlePanelResize;
        this.handlePanelResizeEnd = panels.handlePanelResizeEnd;
        this.handleLocationChange = panels.handleLocationChange;
        this.toggleSidePanel = panels.toggleSidePanel;
        this.openChat = panels.openChat;
        this.openToolbox = panels.openToolbox;
        this.openCompassPanel = panels.openCompassPanel;
        this.openBusPlanner = panels.openBusPlanner;
        this.openDrivePlanner = panels.openDrivePlanner;
        this.openBuildingsPanel = panels.openBuildingsPanel;
        this.handleActivateFeature = panels.handleActivateFeature;
        this.handleSwitchSidePanelTab = panels.handleSwitchSidePanelTab;
        this.handleControlsOpenTab = panels.handleControlsOpenTab;
        this.handleControlsToggleTab = panels.handleControlsToggleTab;
        this.handleControlsToggleToolboxTab = panels.handleControlsToggleToolboxTab;
        this.handleAccountPanelFullscreenChange = panels.handleAccountPanelFullscreenChange;
        this.handleToggleAccountPanel = panels.handleToggleAccountPanel;
        this.handleCloseChat = panels.handleCloseChat;
        this.toggleWeatherBoardMode = panels.toggleWeatherBoardMode;
        this.handleActivateMagic = panels.handleActivateMagic;
        this.handleGraphicsOverview = panels.handleGraphicsOverview;
        this.handleUploadProgressChange = panels.handleUploadProgressChange;
        this.handleSearchPoiSelected = panels.handleSearchPoiSelected;
        this.closeQueryPanel = panels.closeQueryPanel;
        this.handleServiceFeatureQuery = panels.handleServiceFeatureQuery;

        const engineSwitch = useHomeEngineSwitch({
            mapContainerRef: this.mapContainerRef,
            cesiumContainerRef: this.cesiumContainerRef,
            is3DMode: this.is3DMode,
            isWeatherBoardMode: panels.isWeatherBoardMode,
            sharedCustomBasemapUrl,
            getCurrentMapView,
            replaceMapView,
        });

        this.CesiumContainer = engineSwitch.CesiumContainer;
        this.isEngineSwitching = engineSwitch.isEngineSwitching;
        this.isCesiumLoaded = engineSwitch.isCesiumLoaded;
        this.handleCesiumReady = engineSwitch.handleCesiumReady;
        this.handleCesiumLoadFailed = engineSwitch.handleCesiumLoadFailed;
        this.toggle3D = engineSwitch.toggle3D;
        this.handleViewSync = engineSwitch.handleViewSync;
        this.handleTopBarJumpView = engineSwitch.handleTopBarJumpView;

        const routing = useHomeLayerAndMapRouting({
            mapContainerRef: this.mapContainerRef,
            cesiumContainerRef: this.cesiumContainerRef,
            is3DMode: this.is3DMode,
            isCesiumLoading: engineSwitch.isCesiumLoading,
            shouldLoadSidePanel: panels.shouldLoadSidePanel,
            userLayers: panels.userLayers,
            baseLayers: panels.baseLayers,
            toolboxOverview: panels.toolboxOverview,
            featureQueryResult: panels.featureQueryResult,
            showQueryPanel: panels.showQueryPanel,
            getCurrentMapView,
            setMapView: engineSwitch.setMapView,
            waitForAgentMapViewReady: engineSwitch.waitForAgentMapViewReady,
            clearWatchdogOnUnmount: engineSwitch.clearWatchdogOnUnmount,
        });

        this.getCesiumViewerForPicker = routing.getCesiumViewerForPicker;
        this.getCesiumNamespaceForPicker = routing.getCesiumNamespaceForPicker;
        this.getMapUserLocation = routing.getMapUserLocation;
        this.startBusPointPick = routing.startBusPointPick;
        this.drawRouteOnMap = routing.drawRouteOnMap;
        this.zoomToBusRouteStep = routing.zoomToBusRouteStep;
        this.previewBusRouteStep = routing.previewBusRouteStep;
        this.clearBusRouteStepPreview = routing.clearBusRouteStepPreview;
        this.drawDriveRouteOnMap = routing.drawDriveRouteOnMap;
        this.zoomToDriveRouteStep = routing.zoomToDriveRouteStep;
        this.previewDriveRouteStep = routing.previewDriveRouteStep;
        this.clearDriveRouteStepPreview = routing.clearDriveRouteStepPreview;
        this.handleControlsMapInteraction = routing.handleControlsMapInteraction;
        this.handleInteraction = routing.handleInteraction;
        this.handleControlsDrawStyleChange = routing.handleControlsDrawStyleChange;
        this.handleControlsDrawEditAction = routing.handleControlsDrawEditAction;
        this.handleCesiumDrawAction = routing.handleCesiumDrawAction;
        this.handleControlsShowAnalysis = routing.handleControlsShowAnalysis;
        this.handleSpatialAnalysis = routing.handleSpatialAnalysis;
        this.handleControlsDistrictSelect = routing.handleControlsDistrictSelect;
        this.handleEnableBasemapSwipe = routing.handleEnableBasemapSwipe;
        this.handleUploadData = routing.handleUploadData;
        this.handleToggleLayerVisibility = routing.handleToggleLayerVisibility;
        this.handleChangeLayerOpacity = routing.handleChangeLayerOpacity;
        this.handleRenameLayer = routing.handleRenameLayer;
        this.handleZoomLayer = routing.handleZoomLayer;
        this.handleViewLayer = routing.handleViewLayer;
        this.handleRemoveLayer = routing.handleRemoveLayer;
        this.handleEditLayer = routing.handleEditLayer;
        this.handleReorderUserLayers = routing.handleReorderUserLayers;
        this.handleSoloLayer = routing.handleSoloLayer;
        this.handleApplyStyleTemplate = routing.handleApplyStyleTemplate;
        this.handleUpdateDrawStyle = routing.handleUpdateDrawStyle;
        this.handleUpdateLayerStyle = routing.handleUpdateLayerStyle;
        this.handleUpdateCesiumLayerStyle = routing.handleUpdateCesiumLayerStyle;
        this.handleAttributeTableFocusFeature = routing.handleAttributeTableFocusFeature;
        this.handleAttributeTableHighlightFeature = routing.handleAttributeTableHighlightFeature;
        this.handleAttributeTableCellEdit = routing.handleAttributeTableCellEdit;
        this.handleAttributeTableDeleteFeature = routing.handleAttributeTableDeleteFeature;
        this.handleHighlightAttributeFeature = routing.handleHighlightAttributeFeature;
        this.handleZoomAttributeFeature = routing.handleZoomAttributeFeature;
        this.handleToggleLayerLabelVisibility = routing.handleToggleLayerLabelVisibility;
        this.handleDrawPointByCoordinates = routing.handleDrawPointByCoordinates;
        this.handleDrawAmapAoiFromJson = routing.handleDrawAmapAoiFromJson;
        this.handleToggleLayerCRS = routing.handleToggleLayerCRS;
        this.handleReprojectLayer = routing.handleReprojectLayer;
        this.handleExportLayerData = routing.handleExportLayerData;
        this.handleImportOlLayerTo3D = routing.handleImportOlLayerTo3D;
        this.handleUserLayersChange = routing.handleUserLayersChange;
        this.handleBaseLayersChange = routing.handleBaseLayersChange;
        this.handleLayerSelected = routing.handleLayerSelected;
        this.handleFeatureSelected = routing.handleFeatureSelected;
        this.handleMapCoreReady = routing.handleMapCoreReady;
        this.handleMapCoreFailed = routing.handleMapCoreFailed;
    }

    public handleToggleMagicActive = (val: boolean): void => {
        this.isMagicMode.value = val;
    };
}
