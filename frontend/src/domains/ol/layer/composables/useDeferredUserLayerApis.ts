/**
 * Deferred user-layer APIs feature
 *
 * Responsibilities:
 * - Lazy-load useLayerDataImport and useUserLayerActions modules
 * - Cache loaded API instances
 * - Provide thin async wrappers for user-layer actions
 */
export interface DeferredUserLayerApisDeps {
    mapInstanceRef: any;
    initialView: any;
    drawSource: any;
    userDataLayers: any[];
    addManagedLayerRecord: (record: any) => void;
    createManagedVectorLayer: (options: any) => any;
    styleTemplates?: Record<string, any>;
    onImportProgress?: (progress: any) => void;
    refreshUserLayerZIndex: () => void;
    emitUserLayersChange: () => void;
    emitGraphicsOverview: () => void;
    mergeStyleConfig: (currentConfig: any, patch: any) => any;
    applyManagedLayerStyle: (target: any) => void;
    setDrawStyle?: (style: any) => void;
    layerListRef?: any;
    selectedLayerRef?: any;
    getLayerCategory?: (layerId: any) => any;
    refreshLayersState?: () => void;
    isRouteManagedLayer?: (options: { layerId: string; removed: any }) => boolean;
    onRouteManagedLayerRemoved?: (options: { layerId: string; removed: any }) => void;
    emitFeatureSelected?: (payload?: any) => void;
}

export function createDeferredUserLayerApis({
    mapInstanceRef,
    initialView,
    drawSource,
    userDataLayers,
    addManagedLayerRecord,
    createManagedVectorLayer,
    styleTemplates,
    onImportProgress,
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
    isRouteManagedLayer,
    onRouteManagedLayerRemoved,
    emitFeatureSelected,
}: DeferredUserLayerApisDeps) {
    let layerDataImportApiPromise: any = null;
    let userLayerActionsApiPromise: any = null;

    async function ensureLayerDataImportApi() {
        if (!layerDataImportApiPromise) {
            layerDataImportApiPromise = import('@ol/data-import/composables/useLayerDataImport').then(
                ({ useLayerDataImport }) =>
                    useLayerDataImport({
                        mapInstance: mapInstanceRef,
                        initialView,
                        userDataLayers,
                        addManagedLayerRecord,
                        createManagedVectorLayer,
                        styleTemplates: styleTemplates || {},
                        onImportProgress,
                    }),
            );
        }
        return layerDataImportApiPromise;
    }

    async function ensureUserLayerActionsApi() {
        if (!userLayerActionsApiPromise) {
            userLayerActionsApiPromise = Promise.all([
                import('./useUserLayerActions'),
                ensureLayerDataImportApi(),
            ]).then(([actionsMod, dataImportApi]) =>
                actionsMod.useUserLayerActions({
                    mapInstance: mapInstanceRef,
                    drawSource,
                    userDataLayers,
                    refreshUserLayerZIndex,
                    emitUserLayersChange,
                    emitGraphicsOverview,
                    mergeStyleConfig,
                    applyManagedLayerStyle,
                    styleTemplates,
                    setDrawStyle,
                    layerList: layerListRef,
                    selectedLayer: selectedLayerRef,
                    getLayerCategory,
                    refreshLayersState,
                    projectExtentToMapView: dataImportApi.projectExtentToMapView,
                    emitFeatureSelected,
                    isRouteManagedLayer,
                    onRouteManagedLayerRemoved,
                }),
            );
        }

        return userLayerActionsApiPromise;
    }

    async function callUserLayerAction(method: any, ...args: any[]) {
        const api = await ensureUserLayerActionsApi();
        if (typeof api?.[method] !== 'function') return undefined;
        return api[method](...args);
    }

    function setBaseLayerActive(...args: any[]) {
        return callUserLayerAction('setBaseLayerActive', ...args);
    }

    function setLayerVisibility(...args: any[]) {
        return callUserLayerAction('setLayerVisibility', ...args);
    }

    function zoomToUserLayer(...args: any[]) {
        return callUserLayerAction('zoomToUserLayer', ...args);
    }

    function viewUserLayer(...args: any[]) {
        return callUserLayerAction('viewUserLayer', ...args);
    }

    return {
        ensureLayerDataImportApi,
        ensureUserLayerActionsApi,
        setBaseLayerActive,
        setLayerVisibility,
        zoomToUserLayer,
        viewUserLayer,
    };
}
