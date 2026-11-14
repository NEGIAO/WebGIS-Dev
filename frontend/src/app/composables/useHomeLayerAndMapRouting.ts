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
import { apiLogVisit } from '@/api/backend';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import { showLoading, hideLoading } from '@common/ui/loading';
import {
    dispatchLayerAction,
    lastDispatchError,
} from '@common/layer-tree/actions/unifiedActionRouter';
import { scheduleCesiumWarmup } from '@common/data-import/cesiumWarmup';
import {
    RSVC_NODE_PREFIX,
    parseRsvcNodeId,
    unregisterRemoteService,
    setRemoteServiceVisible,
    setRemoteServiceSublayer,
    setRemoteServiceOpacity,
    removeRemoteServiceSublayer,
} from '@common/basemap/remoteServices';
import { useRealtimeStats } from '@common/user/composables/useRealtimeStats';
import { MAP_VIEW_CESIUM } from '@ol/url-state/useMapViewUrlState';

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
    const isImporting = ref(false);

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

    // ────────────────────────── 行政区边界图层元数据辅助 ──────────────────────────
    function getLayerMetaById(layerId: string) {
        const id = String(layerId || '').trim();
        if (!id) return null;
        return tocStore.getLayerMeta(id);
    }

    function isDistrictLayer(layerId: string): boolean {
        return String(getLayerMetaById(layerId)?.sourceType || '') === 'district-boundary';
    }

    function getDistrictMeta(layerId: string) {
        const meta = getLayerMetaById(layerId);
        if (!meta || String(meta.sourceType || '') !== 'district-boundary') return null;
        return meta;
    }

    function focusDistrictLayer(layerId: string): boolean {
        const meta = getDistrictMeta(layerId);
        if (!meta) return false;

        mapContainerRef.value?.focusDistrictByAdcode?.({
            adcode: meta.adcode,
            name: meta.name,
            fit: true,
        });
        return true;
    }

    function handleDistrictLayerVisibility(layerId: string, visible: boolean): boolean {
        const meta = getDistrictMeta(layerId);
        if (!meta) return false;

        mapContainerRef.value?.setDistrictLayerVisibility?.(meta.adcode, !!visible);
        return true;
    }

    function handleDistrictLayerRemove(layerId: string): boolean {
        const meta = getDistrictMeta(layerId);
        if (!meta) return false;

        mapContainerRef.value?.removeDistrictLayer?.(meta.adcode);
        message.success(t('home.districtRemoved', { name: meta.name }));
        return true;
    }

    function syncDistrictLayerVisibility(layerId: string): void {
        const activeId = String(layerId || '').trim();
        const districtLayers = tocStore.layerMetadataList.filter(
            (meta: any) => String(meta.sourceType || '') === 'district-boundary',
        );
        if (!districtLayers.length) return;

        districtLayers.forEach((meta: any) => {
            const shouldShow = meta.id === activeId;
            if (meta.visible === shouldShow) return;
            tocStore.upsertLayerMeta({
                ...meta,
                visible: shouldShow,
            });
        });
    }

    // ────────────────────────── 数据导入 / TOC 图层操作 / 属性表转发 ──────────────────────────
    async function handleUploadData(data: any): Promise<void> {
        if (isImporting.value) {
            message.warning('上一次导入尚未完成，请稍候再试');
            return;
        }
        isImporting.value = true;
        showLoading(t('loading.gisImport'));
        try {
            if (is3DMode.value) {
                await Promise.resolve(cesiumContainerRef.value?.importUserData?.(data));
                return;
            }
            await Promise.resolve(mapContainerRef.value?.addUserDataLayer(data));
        } finally {
            hideLoading();
            isImporting.value = false;
        }
    }

    function handleToggleLayerVisibility({
        layerId,
        visible,
    }: {
        layerId: string;
        visible: boolean;
    }): void {
        if (String(layerId).startsWith(RSVC_NODE_PREFIX)) {
            const { serviceId, subLayerName } = parseRsvcNodeId(layerId);
            if (subLayerName) {
                setRemoteServiceSublayer(serviceId, subLayerName, !!visible);
            } else {
                setRemoteServiceVisible(serviceId, !!visible);
            }
            return;
        }
        if (isDistrictLayer(layerId)) {
            handleDistrictLayerVisibility(layerId, visible);
            return;
        }
        dispatchLayerAction({
            method: 'setUserLayerVisibility',
            payload: { layerId, visible },
            engine: 'ol',
        });
    }

    function handleChangeLayerOpacity({
        layerId,
        opacity,
    }: {
        layerId: string;
        opacity: number;
    }): void {
        if (String(layerId).startsWith(RSVC_NODE_PREFIX)) {
            setRemoteServiceOpacity(
                String(layerId).slice(RSVC_NODE_PREFIX.length),
                Number(opacity),
            );
            return;
        }
        dispatchLayerAction({
            method: 'setUserLayerOpacity',
            payload: { layerId, opacity },
            engine: 'ol',
        });
    }

    function handleRenameLayer({
        layerId,
        newName,
    }: {
        layerId: string;
        newName: string;
    }): void {
        const id = String(layerId || '').trim();
        const name = String(newName || '').trim();
        if (!id || !name) return;

        if (isDistrictLayer(id)) {
            tocStore.upsertLayerMeta({ id, name });
            return;
        }

        const dispatched = dispatchLayerAction({
            method: 'renameUserLayer',
            payload: { layerId: id, newName: name },
            engine: 'ol',
        });
        if (!dispatched) {
            layerStore.renameLayer(id, name);
        }
    }

    function handleZoomLayer(layerId: string): void {
        if (String(layerId).startsWith(RSVC_NODE_PREFIX)) {
            const { serviceId } = parseRsvcNodeId(layerId);
            if (is3DMode.value) {
                cesiumContainerRef.value?.zoomToRemoteService?.(serviceId);
            } else {
                mapContainerRef.value?.zoomToRemoteService?.(serviceId);
            }
            return;
        }
        if (focusDistrictLayer(layerId)) return;
        dispatchLayerAction({
            method: 'zoomToUserLayer',
            payload: { layerId },
            engine: 'ol',
        });
    }

    function handleViewLayer(layerId: string): void {
        if (focusDistrictLayer(layerId)) return;
        mapContainerRef.value?.viewUserLayer(layerId);
    }

    function handleRemoveLayer(layerId: string): void {
        if (String(layerId).startsWith(RSVC_NODE_PREFIX)) {
            const { serviceId, subLayerName } = parseRsvcNodeId(layerId);
            if (subLayerName) {
                removeRemoteServiceSublayer(serviceId, subLayerName);
            } else {
                unregisterRemoteService(serviceId);
            }
            return;
        }
        if (handleDistrictLayerRemove(layerId)) return;

        const dispatched = dispatchLayerAction({
            method: 'removeUserLayer',
            payload: { layerId },
            engine: 'ol',
        });
        if (!dispatched) {
            const reason = lastDispatchError?.message || String(lastDispatchError || '未知原因');
            message?.warning?.(
                `图层移除未被地图引擎处理：${layerId}（${reason}），请截图控制台 [ActionRouter] 日志`,
            );
            return;
        }
        layerStore.removeLayerById(layerId);
    }

    function handleEditLayer(layerId: string): void {
        mapContainerRef.value?.activateGeometryEditForLayer?.(layerId);
    }

    function handleReorderUserLayers(payload: any): void {
        mapContainerRef.value?.reorderUserLayers(payload);
    }

    function handleSoloLayer(layerId: string): void {
        mapContainerRef.value?.soloUserLayer(layerId);
        syncDistrictLayerVisibility(layerId);
    }

    function handleApplyStyleTemplate(payload: any): void {
        mapContainerRef.value?.applyStyleTemplate(payload);
    }

    function handleUpdateDrawStyle(styleConfig: any): void {
        mapContainerRef.value?.setDrawStyle(styleConfig);
    }

    function handleUpdateLayerStyle(payload: any): void {
        mapContainerRef.value?.setUserLayerStyle(payload);
    }

    function handleUpdateCesiumLayerStyle(payload: any): void {
        const id = String(payload?.id || '').trim();
        if (!id) return;
        const applied = cesiumContainerRef.value?.updateCesiumLayerStyle?.(
            id,
            payload?.styleConfig || {},
        );
        if (applied === false) message.warning(t('cesium.styleNotApplicable'));
    }

    function handleAttributeTableFocusFeature(payload: any): void {
        if (is3DMode.value) {
            cesiumContainerRef.value?.focusAttributeFeature?.(payload?.featureId);
            return;
        }
        mapContainerRef.value?.handleAttributeTableFocusFeature?.(payload);
    }

    function handleAttributeTableHighlightFeature(payload: any): void {
        mapContainerRef.value?.handleAttributeTableHighlightFeature?.(payload);
    }

    function handleAttributeTableCellEdit(payload: any): void {
        mapContainerRef.value?.handleAttributeTableCellEdit?.(payload);
    }

    function handleAttributeTableDeleteFeature(payload: any): void {
        mapContainerRef.value?.handleAttributeTableDeleteFeature?.(payload);
    }

    function handleHighlightAttributeFeature(payload: any): void {
        mapContainerRef.value?.highlightManagedFeature?.(payload);
    }

    function handleZoomAttributeFeature(payload: any): void {
        mapContainerRef.value?.zoomToManagedFeature?.(payload);
    }

    function handleToggleLayerLabelVisibility(payload: any): void {
        mapContainerRef.value?.setUserLayerLabelVisibility(payload);
    }

    function handleDrawPointByCoordinates(payload: any): void {
        mapContainerRef.value?.drawPointByCoordinatesInput(payload);
    }

    function handleDrawAmapAoiFromJson(payload: any): void {
        try {
            mapContainerRef.value?.drawAmapAoiByDetailJsonInput?.(payload);
        } catch (error) {
            const detail = error instanceof Error ? error.message : t('home.aoiParseFailed');
            message.warning(t('home.aoiParseFailedDetail', { detail }));
        }
    }

    function handleToggleLayerCRS(payload: any): void {
        mapContainerRef.value?.toggleLayerCRS?.(payload);
    }

    function handleReprojectLayer(payload: any): void {
        const layerId = String(payload?.layerId || '').trim();
        const crs = String(payload?.crs || '').trim();
        if (!layerId || !crs) return;
        if (layerId.startsWith('cesium:')) {
            cesiumContainerRef.value?.redeclareLayerCrs?.({ layerId, crs });
            return;
        }
        mapContainerRef.value?.redeclareLayerCrs?.({ layerId, crs });
    }

    function handleExportLayerData(payload: any): void {
        mapContainerRef.value?.exportLayerCoordinates?.(payload);
    }

    async function handleImportOlLayerTo3D(payload: any = {}): Promise<void> {
        const layerId = String(payload?.layerId || '').trim();
        if (!layerId) return;

        const snapshot = mapContainerRef.value?.exportUserLayerGeoJSON?.({ layerId });
        if (!snapshot?.text) {
            message.warning('该图层没有可导入 3D 的矢量要素');
            return;
        }

        if (!is3DMode.value || !cesiumContainerRef.value) {
            const switched = await setMapView(MAP_VIEW_CESIUM);
            if (!switched) {
                message.error('3D 视图加载失败，无法导入该图层');
                return;
            }
        }

        const ready = await waitForAgentMapViewReady(MAP_VIEW_CESIUM, { timeoutMs: 30000 });
        if (!ready || !cesiumContainerRef.value) {
            message.error('3D 视图尚未就绪，请稍后重试');
            return;
        }

        const safeName =
            String(snapshot.name || 'layer').replace(/[\\/:*?"<>|]+/g, '_') || 'layer';
        const file = new File([snapshot.text], `${safeName}.geojson`, {
            type: 'application/geo+json',
        });
        await Promise.resolve(
            cesiumContainerRef.value?.importUserData?.({ resources: [file] }),
        );
    }

    function handleUserLayersChange(layers: any[]): void {
        userLayers.value = layers || [];
        layerStore.syncLayers(userLayers.value, toolboxOverview.value);
        attrStore.syncLayers(userLayers.value);
    }

    function handleBaseLayersChange(layers: any[]): void {
        baseLayers.value = layers || [];
    }

    function handleLayerSelected(layerId: string): void {
        if (focusDistrictLayer(layerId)) return;
        mapContainerRef.value?.highlightUserLayer?.(layerId);
    }

    function handleFeatureSelected(properties: any): void {
        if (!properties) return;
        featureQueryResult.value = properties;
        showQueryPanel.value = true;

        if (
            properties.layerId &&
            properties.featureId &&
            attrStore.activeLayerId === String(properties.layerId)
        ) {
            attrStore.setSelectedFeature(String(properties.featureId));
        }
    }

    // ────────────────────────── MapCore 就绪、访问记录上报与生命周期 ──────────────────────────
    async function buildVisitLogPayload() {
        const payload = {
            geo_permission: 'unknown',
            gps_lng: null as number | null,
            gps_lat: null as number | null,
            gps_accuracy: null as number | null,
            gps_timestamp: '',
            gps_error: '',
        };

        if (typeof window === 'undefined' || typeof navigator === 'undefined') {
            return payload;
        }

        if (!navigator.geolocation) {
            payload.geo_permission = 'unsupported';
            payload.gps_error = 'geolocation-not-supported';
            return payload;
        }

        try {
            if (navigator.permissions && typeof navigator.permissions.query === 'function') {
                const permissionStatus = await navigator.permissions.query({
                    name: 'geolocation',
                });
                payload.geo_permission = String(permissionStatus?.state || 'unknown');
            }
        } catch {
            // ignore permission API read errors
        }

        const shouldTryGps =
            payload.geo_permission === 'granted' ||
            payload.geo_permission === 'prompt' ||
            payload.geo_permission === 'unknown';

        if (!shouldTryGps) {
            return payload;
        }

        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 3500,
                    maximumAge: 60000,
                });
            });

            payload.geo_permission = 'granted';
            payload.gps_lng = Number(position?.coords?.longitude);
            payload.gps_lat = Number(position?.coords?.latitude);
            payload.gps_accuracy = Number(position?.coords?.accuracy);
            payload.gps_timestamp = new Date(position?.timestamp || Date.now()).toISOString();
        } catch (error: any) {
            const code = Number(error?.code || 0);
            if (code === 1) {
                payload.geo_permission = 'denied';
            }
            payload.gps_error = String(error?.message || `geolocation-error-${code}`).slice(0, 250);
        }

        return payload;
    }

    function syncVisitPosCodeToUrl(encodedPos: string, geoPermission = 'unknown'): void {
        if (typeof window === 'undefined') return;

        const normalizedCode = String(encodedPos || '').trim() || '0';

        try {
            const hash = String(window.location.hash || '#/home');
            const hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
            const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
            const hashPath = hashPathRaw || '/home';
            const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
            const params = new URLSearchParams(hashQueryRaw);

            if (geoPermission === 'granted' && normalizedCode !== '0') {
                params.set('p', normalizedCode);
                params.set('loc', 'gps');
            } else {
                params.set('p', '0');
                params.set('loc', '0');
            }

            const nextHashQuery = params.toString();
            const nextHash = nextHashQuery
                ? `#${normalizedHashPath}?${nextHashQuery}`
                : `#${normalizedHashPath}`;

            const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
            window.history.replaceState(window.history.state, '', nextUrl);
        } catch {
            // URL 写入失败时不阻断主流程
        }
    }

    async function executeVisitLogAsync(): Promise<void> {
        try {
            const visitPayload = await buildVisitLogPayload();
            const visitResponse = await apiLogVisit(visitPayload);
            const encodedPos = String(visitResponse?.data?.encoded_pos || '0');
            syncVisitPosCodeToUrl(encodedPos, visitPayload.geo_permission);
        } catch {
            // 访问记录失败不影响主页面使用
        }
    }

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
