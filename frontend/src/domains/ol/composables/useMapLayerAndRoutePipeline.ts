/**
 * 功能名称：OpenLayers 业务矢量图层、要素操作、坐标转换、搜索与路径渲染管线
 * 说    明：从 MapContainer.ts 抽离受管图层注册、图层样式、公交换乘/驾车路线绘制与步骤交互、
 *           要素序列化与高亮、CRS 转换与重声明、搜索落图、空间分析、行政区划及延迟加载图层 API。
 */
import type { Ref } from 'vue';
import type Map from 'ol/Map';
import type VectorSource from 'ol/source/Vector';

import { createLayerMetadataNormalizationFeature } from '@common/attribute/useLayerMetadataNormalization';
import { wgs84ToGcj02, gcj02ToWgs84 } from '@common/data-import/crs/coordTransform';
import { isVectorManagedLayer } from '@common/layer-tree/actions/layerExportService';

import { createRouteRenderingFeature } from '@ol/routing/renderers/useRouteRendering';
import { createRouteStepInteraction } from '@ol/routing/renderers/useRouteStepInteraction';
import { createRouteStepStyles } from '@ol/routing/renderers/useRouteStepStyles';
import { createSpatialAnalysisFeature } from '@ol/spatial-analysis/composables/useSpatialAnalysis';
import { createDistrictManagerFeature } from '@ol/spatial-analysis/composables/useDistrictManager';
import { createCoordinateSystemConversionFeature } from '@ol/utils/useCoordinateSystemConversion';
import { createLayerCrsRedeclareFeature } from '@ol/layer/composables/useLayerCrsRedeclare';
import { useCreateManagedVectorLayer } from '@ol/layer/composables/useCreateManagedVectorLayer';
import { createDeferredUserLayerApis } from '@ol/layer/composables/useDeferredUserLayerApis';
import { createManagedFeatureHighlightFeature } from '@ol/layer/feature/useManagedFeatureHighlight';
import { createManagedFeatureOperationsFeature } from '@ol/layer/feature/useManagedFeatureOperations';
import { createManagedFeatureSerializationFeature } from '@ol/layer/feature/useManagedFeatureSerialization';
import { createManagedLayerStyleFeature } from '@ol/layer/style/useManagedLayerStyle';
import { createUserLayerApiFacadeFeature } from '@ol/layer/composables/useUserLayerApiFacade';
import { useManagedLayerRegistry } from '@ol/layer/composables/useManagedLayerRegistry';
import { createMapSearchAndCoordinateInputFeature } from '@ol/search/composables/useMapSearchAndCoordinateInput';
import { INITIAL_VIEW } from '@ol/composables/useMapBootstrap';

import {
    SEARCH_AOI_STYLE,
    SEARCH_RESULT_STYLE,
    STYLE_TEMPLATES,
} from '@/constants';

export interface MapLayerAndRoutePipelineOptions {
    mapInstanceRef: Ref<Map | null>;
    selectedLayerRef: Ref<string>;
    layerListRef: Ref<any[]>;
    userDataLayers: any[];
    drawSource: VectorSource;
    busRouteSource: VectorSource;
    busRouteManagedLayerIdRef: Ref<string | null>;
    getBusRouteLayer: () => any;
    tocStore: any;
    emit: (event: any, ...args: any[]) => void;
    message: any;
    getLayerCategory: (layerId?: string) => any;
    refreshLayersState: () => void;
    setDrawStyle: (styleCfg: any) => void;
}

export function createMapLayerAndRoutePipeline(options: MapLayerAndRoutePipelineOptions) {
    const {
        mapInstanceRef,
        selectedLayerRef,
        layerListRef,
        userDataLayers,
        drawSource,
        busRouteSource,
        busRouteManagedLayerIdRef,
        getBusRouteLayer,
        tocStore,
        emit,
        message,
        getLayerCategory,
        refreshLayersState,
        setDrawStyle,
    } = options;

    let routeBuilderApiPromise: Promise<any> | null = null;
    async function ensureRouteBuilderApi() {
        if (!routeBuilderApiPromise) {
            routeBuilderApiPromise = import('@ol/routing/utils/transitRouteBuilder');
        }
        return routeBuilderApiPromise;
    }

    function resetRouteBuilderApiCache() {
        routeBuilderApiPromise = null;
    }

    const {
        createManagedLayerId,
        emitUserLayersChange,
        emitGraphicsOverview,
        refreshUserLayerZIndex,
        addManagedLayerRecord,
    } = useManagedLayerRegistry({
        emit,
        userDataLayers,
        drawSource,
        styleTemplates: STYLE_TEMPLATES,
    });

    const {
        normalizeStyleConfig,
        createStyleFromConfig,
        mergeStyleConfig,
        buildManagedLayerStyle,
        buildGeometryStyle,
        buildLabelOnlyStyle,
        applyManagedLayerStyle,
    } = createManagedLayerStyleFeature({ styleTemplates: STYLE_TEMPLATES });

    const { getBusStepStyle, getBusStepPointStyle, getDriveStepStyle, clearRouteStepStyleCache } =
        createRouteStepStyles();

    const routeStepFeature = createRouteStepInteraction({
        mapInstanceRef,
        routeSource: busRouteSource,
        getRouteLayer: getBusRouteLayer,
        ensureRouteBuilderApi,
    });

    const { ensureFeatureId, serializeManagedFeatures } =
        createManagedFeatureSerializationFeature();
    const { getFeatureRepresentativeLonLat, normalizeLayerMetadata } =
        createLayerMetadataNormalizationFeature();

    const { toggleLayerCRS, toggleSearchLayerCRS } =
        createCoordinateSystemConversionFeature({
            userDataLayers,
            message,
            wgs84ToGcj02,
            gcj02ToWgs84,
            isVectorManagedLayer,
            serializeManagedFeatures,
            normalizeLayerMetadata,
            getFeatureRepresentativeLonLat,
            emitUserLayersChange,
        });

    const { redeclareLayerCrs } = createLayerCrsRedeclareFeature({
        mapInstanceRef,
        userDataLayers,
        message,
        ensureFeatureId,
        serializeManagedFeatures,
        normalizeLayerMetadata,
        emitUserLayersChange,
    });

    const { createManagedVectorLayer } = useCreateManagedVectorLayer({
        mapInstanceRef,
        userDataLayers,
        styleHelpers: {
            normalizeStyleConfig,
            buildManagedLayerStyle,
            buildGeometryStyle,
            buildLabelOnlyStyle,
        },
        featureHelpers: { serializeManagedFeatures, ensureFeatureId },
        metadataHelpers: { normalizeLayerMetadata },
        registryHelpers: {
            createManagedLayerId,
            emitUserLayersChange,
            emitGraphicsOverview,
            refreshUserLayerZIndex,
        },
        styleTemplates: STYLE_TEMPLATES,
    });

    const searchFeature = createMapSearchAndCoordinateInputFeature({
        message,
        mapInstanceRef,
        createManagedVectorLayer,
        gcj02ToWgs84,
        searchResultStyle: SEARCH_RESULT_STYLE,
        searchAoiStyle: SEARCH_AOI_STYLE,
        userDataLayers,
        ensureFeatureId,
        serializeManagedFeatures,
        emitUserLayersChange,
        emitGraphicsOverview,
        onSearchPoiResolved: (payload: any) => emit('search-poi-selected', payload),
    });

    const {
        createManagedFeatureHighlightStyle,
        clearManagedFeatureHighlight,
        highlightManagedFeature,
        batchHighlightManagedFeatures,
        getCurrentHighlightedFeature,
        setCurrentHighlightedFeature,
    } = createManagedFeatureHighlightFeature({
        findManagedFeature: (layerId: string, featureId: any) => {
            const layerRecord = userDataLayers.find((item) => item.id === layerId);
            if (!layerRecord || !layerRecord.layer || !layerRecord.layer.getSource) return null;
            const source = layerRecord.layer.getSource();
            const normalizedId = String(featureId || '');
            return (
                source.getFeatureById(normalizedId) ||
                source
                    .getFeatures?.()
                    ?.find(
                        (feature: any) =>
                            String(feature?.getId?.() ?? feature?.get?.('_gid') ?? '') ===
                            normalizedId,
                    ) ||
                null
            );
        },
    });

    const { zoomToManagedFeature, findManagedFeature } = createManagedFeatureOperationsFeature({
        mapInstanceRef,
        userDataLayers,
        getCurrentHighlightedFeature,
        setCurrentHighlightedFeature,
        clearManagedFeatureHighlight,
        createManagedFeatureHighlightStyle,
        highlightManagedFeature,
    });

    const { runSpatialAnalysis } = (createSpatialAnalysisFeature as (opts: any) => any)({
        createManagedVectorLayer,
        emitGraphicsOverview,
        emitUserLayersChange,
        userDataLayers,
        message,
    });

    const { drawRouteOnMap, drawDriveRouteOnMap } = createRouteRenderingFeature({
        mapInstanceRef,
        getBusRouteLayer,
        busRouteSource,
        resetRouteStepStates: routeStepFeature.resetRouteStepStates,
        ensureRouteBuilderApi,
        userDataLayers,
        addManagedLayerRecord,
        busRouteManagedLayerIdRef,
        emitUserLayersChange,
        emitGraphicsOverview,
    });

    const {
        ensureLayerDataImportApi,
        ensureUserLayerActionsApi,
        setBaseLayerActive: setBaseLayerActiveDeferred,
        setLayerVisibility,
        zoomToUserLayer,
        viewUserLayer,
    } = createDeferredUserLayerApis({
        mapInstanceRef,
        initialView: INITIAL_VIEW,
        drawSource,
        userDataLayers,
        addManagedLayerRecord,
        createManagedVectorLayer,
        styleTemplates: STYLE_TEMPLATES,
        onImportProgress: (payload: any) => emit('upload-progress-change', payload),
        refreshUserLayerZIndex,
        emitUserLayersChange,
        emitGraphicsOverview,
        mergeStyleConfig,
        applyManagedLayerStyle,
        setDrawStyle,
        layerListRef,
        selectedLayerRef,
        getLayerCategory,
        refreshLayersState,
        emitFeatureSelected: (payload: any) => emit('feature-selected', payload),
        isRouteManagedLayer: ({ layerId, removed }: { layerId: string; removed: any }) =>
            layerId === busRouteManagedLayerIdRef.value ||
            removed?.metadata?.category === 'bus-route' ||
            removed?.metadata?.category === 'drive-route' ||
            removed?.metadata?.category === 'route',
        onRouteManagedLayerRemoved: () => {
            busRouteManagedLayerIdRef.value = null;
            routeStepFeature.resetRouteStepStates();
            busRouteSource.clear();
        },
    });

    const userLayerFacade = createUserLayerApiFacadeFeature({
        ensureLayerDataImportApi,
        ensureUserLayerActionsApi,
    });

    const {
        focusDistrictByAdcode,
        setDistrictLayerVisibility,
        removeDistrictLayer,
        disposeDistrictManager,
    } = createDistrictManagerFeature({
        mapInstance: mapInstanceRef,
        tocStore,
        userDataLayers,
        emitUserLayersChange,
        emitGraphicsOverview,
        serializeManagedFeatures,
    });

    return {
        emitUserLayersChange,
        emitGraphicsOverview,
        refreshUserLayerZIndex,
        createStyleFromConfig,
        mergeStyleConfig,
        applyManagedLayerStyle,
        getBusStepStyle,
        getBusStepPointStyle,
        getDriveStepStyle,
        clearRouteStepStyleCache,
        routeStepFeature,
        resetRouteBuilderApiCache,
        serializeManagedFeatures,
        toggleLayerCRS,
        toggleSearchLayerCRS,
        redeclareLayerCrs,
        createManagedVectorLayer,
        searchFeature,
        clearManagedFeatureHighlight,
        highlightManagedFeature,
        batchHighlightManagedFeatures,
        getCurrentHighlightedFeature,
        setCurrentHighlightedFeature,
        zoomToManagedFeature,
        findManagedFeature,
        runSpatialAnalysis,
        drawRouteOnMap,
        drawDriveRouteOnMap,
        setBaseLayerActiveDeferred,
        setLayerVisibility,
        zoomToUserLayer,
        viewUserLayer,
        userLayerFacade,
        focusDistrictByAdcode,
        setDistrictLayerVisibility,
        removeDistrictLayer,
        disposeDistrictManager,
    };
}
