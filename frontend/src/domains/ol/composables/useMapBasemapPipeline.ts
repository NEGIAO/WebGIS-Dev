/**
 * 功能名称：OpenLayers 底图、视图状态、Token 韧性与卷帘装配管线
 * 说    明：从 MapContainer.ts 抽离底图 URL 映射、底图状态管理、视图状态同步、
 *           运行时 Token 池轮转、底图熔断回退、图层初始化、卷帘对比及底图选择监听。
 */
import type { Ref } from 'vue';
import type Map from 'ol/Map';

import { useLayerContextMenuActions } from '@common/layer-tree/actions/useLayerContextMenuActions';
import { createBasemapUrlMappingFeature } from '@common/url-state/useBasemapUrlMapping';
import {
    loadRuntimeMapTokens,
    markRuntimeMapTokenFailed,
} from '@common/services/runtimeMapTokens';

import { createBasemapLayerBootstrap } from '@ol/basemap/composables/useBasemapLayerBootstrap';
import { createBasemapResilience } from '@ol/basemap/resilience/useBasemapResilience';
import { createBasemapSelectionWatcher } from '@ol/basemap/composables/useBasemapSelectionWatcher';
import { createBasemapStateManagementFeature } from '@ol/basemap/composables/useBasemapStateManagement';
import { createBasemapSwipe } from '@ol/basemap/composables/useBasemapSwipe';
import { createBasemapLayerFromSource } from '@ol/basemap/composables/basemapLayerFactory';
import { createRuntimeMapTokenPool } from '@ol/composables/useRuntimeMapTokenPool';
import { useMapState } from '@ol/composables/useMapState';
import { INITIAL_VIEW } from '@ol/composables/useMapBootstrap';
import { abortTileSourceRequests } from '@ol/tile-source/index';

import {
    DEFAULT_BASEMAP_PRESET_ID,
    URL_LAYER_OPTIONS,
    createLayerConfigs,
    getBasemapOptionLabel,
    getLayerCategory as getLayerCategoryById,
    getLayerGroup as getLayerGroupById,
    resolvePresetLayerIds,
} from '@/constants';

export interface MapBasemapPipelineOptions {
    mapInstanceRef: Ref<Map | null>;
    selectedLayerRef: Ref<string>;
    customMapUrlRef: Ref<string>;
    basemapCircuitOpenRef: Ref<boolean>;
    tiandituTkRef: Ref<string>;
    ovitalTdtkeyRef: Ref<string>;
    getTiandituTk: () => string;
    setTiandituTk: (value: string) => void;
    getOvitalTdtkey: () => string;
    setOvitalTdtkey: (value: string) => void;
    layerListRef: Ref<any[]>;
    layerConfigs: any[];
    layerInstances: Record<string, any>;
    layerStore: any;
    emit: (event: any, ...args: any[]) => void;
    message: any;
    setCustomBasemapByUrl: (url: string) => Promise<any>;
    syncUrlFromActiveMap: () => void;
}

export function createMapBasemapPipeline(options: MapBasemapPipelineOptions) {
    const {
        mapInstanceRef,
        selectedLayerRef,
        customMapUrlRef,
        basemapCircuitOpenRef,
        tiandituTkRef,
        ovitalTdtkeyRef,
        getTiandituTk,
        setTiandituTk,
        getOvitalTdtkey,
        setOvitalTdtkey,
        layerListRef,
        layerConfigs,
        layerInstances,
        layerStore,
        emit,
        message,
        setCustomBasemapByUrl,
        syncUrlFromActiveMap,
    } = options;

    const { getLayerIdByIndex, getLayerIndexById, getLayerCategory } =
        createBasemapUrlMappingFeature({
            urlLayerOptions: URL_LAYER_OPTIONS,
            getLayerCategoryById: (layerId?: string) =>
                layerId ? getLayerCategoryById(layerId) : null,
            getLayerGroupById: (layerId?: string) =>
                layerId ? getLayerGroupById(layerId) : null,
        });

    const { emitBaseLayersChangeBatched, refreshAllBasemapSourcesForHD } =
        createBasemapStateManagementFeature({
            layerList: layerListRef,
            selectedLayer: selectedLayerRef,
            getLayerCategory: getLayerCategoryById,
            getLayerGroup: getLayerGroupById,
            emit,
            LAYER_CONFIGS: layerConfigs,
            layerInstances,
            mapInstanceRef: mapInstanceRef as any,
        });

    const mapState = useMapState(mapInstanceRef, {
        defaultZoom: INITIAL_VIEW.zoom,
        layerListRef,
        layerInstances,
        layerConfigs,
        resolveVisibleLayerIds: (layerId: string) => resolvePresetLayerIds(layerId),
        getLayerIndex: () => getLayerIndexById(selectedLayerRef.value),
        getLayerId: () => selectedLayerRef.value,
        getCustomUrl: () => customMapUrlRef.value,
        onLayerIndexChange: (layerIndex: number) => {
            const layerId = getLayerIdByIndex(layerIndex);
            if (!layerId || selectedLayerRef.value === layerId) return;
            selectedLayerRef.value = layerId;
        },
    });

    const { hydrateRuntimeMapTokens, retryRuntimeTokenLayersWithNextToken } =
        createRuntimeMapTokenPool({
            getTiandituTk,
            setTiandituTk,
            tiandituTkRef,
            getOvitalTdtkey,
            setOvitalTdtkey,
            ovitalTdtkeyRef,
            layerListRef,
            customMapUrlRef,
            selectedLayerRef,
            mapInstanceRef,
            LAYER_CONFIGS: layerConfigs,
            layerInstances,
            DEFAULT_BASEMAP_PRESET_ID,
            createLayerConfigs,
            resolvePresetLayerIds,
            loadRuntimeMapTokens,
            markRuntimeMapTokenFailed,
            abortTileSourceRequests,
            getMonitorLayerTimeout: () => monitorLayerTimeout,
            getSwitchLayerById: () => mapState.switchLayerById,
            getEmitBaseLayersChangeBatched: () => emitBaseLayersChangeBatched,
            message,
        });

    const { validateBaseLayerSwitch, monitorLayerTimeout, disposeAllMonitors } =
        createBasemapResilience({
            message,
            onRuntimeTokenFailure: retryRuntimeTokenLayersWithNextToken,
        });

    const { initializeBasemapLayers } = createBasemapLayerBootstrap({
        layerListRef,
        layerConfigs,
        layerInstances,
        monitorLayerTimeout,
        selectedLayerRef,
        message,
        defaultLayerId: DEFAULT_BASEMAP_PRESET_ID,
    });

    const swipeFeature = createBasemapSwipe({
        mapInstance: mapInstanceRef,
        layerStore,
        resolvePresetLayerIds,
        createBasemapLayerFromSource,
        LAYER_CONFIGS: layerConfigs,
        TIANDITU_TK: tiandituTkRef,
        customMapUrl: customMapUrlRef,
        layerInstances,
        switchLayerById: (id: string, opts?: any) => mapState.switchLayerById?.(id, opts),
        setCustomBasemapByUrl,
        emitBaseLayersChangeBatched: () => emitBaseLayersChangeBatched?.(),
        selectedLayer: selectedLayerRef,
        message,
    });

    const { handleLayerContextAction } = useLayerContextMenuActions({
        layerInstances,
        getLayerConfigs: () => layerConfigs,
        customMapUrlRef,
        message,
    });

    const { bindBasemapSelectionWatcher, resetBasemapChain, dispose: disposeSelectionWatcher } =
        createBasemapSelectionWatcher({
            selectedLayerRef,
            switchLayerById: mapState.switchLayerById,
            resolvePresetLayerIds,
            isBasemapLayerId: (layerId: string) => {
                const category = getLayerCategoryById?.(String(layerId || '').trim());
                return (
                    category === 'label' ||
                    category === 'imagery' ||
                    category === 'vector' ||
                    category === 'terrain' ||
                    category === 'theme' ||
                    category === 'custom'
                );
            },
            emitBaseLayersChange: emitBaseLayersChangeBatched,
            mapInstanceRef,
            layerInstances,
            syncUrlFromMap: syncUrlFromActiveMap,
            validateBaseLayerSwitch,
            onRuntimeTokenFailure: retryRuntimeTokenLayersWithNextToken,
            getBasemapOptionLabel,
            message,
            defaultLayerId: DEFAULT_BASEMAP_PRESET_ID,
            validationTimeoutMs: 3000,
            circuitBreakThreshold: 3,
            onCircuitBreak: () => {
                basemapCircuitOpenRef.value = true;
            },
            onCircuitReset: () => {
                basemapCircuitOpenRef.value = false;
            },
        });

    return {
        getLayerIdByIndex,
        getLayerIndexById,
        getLayerCategory,
        emitBaseLayersChangeBatched,
        refreshAllBasemapSourcesForHD,
        ...mapState,
        hydrateRuntimeMapTokens,
        disposeAllMonitors,
        initializeBasemapLayers,
        swipeFeature,
        handleLayerContextAction,
        bindBasemapSelectionWatcher,
        resetBasemapChain,
        disposeSelectionWatcher,
    };
}
