/**
 * Deferred user-layer APIs feature
 *
 * Responsibilities:
 * - Lazy-load useLayerDataImport and useUserLayerActions modules
 * - Cache loaded API instances
 * - Provide thin async wrappers for user-layer actions
 */
export function createDeferredUserLayerApis({
    mapInstanceRef,
    initialView,
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
    emitFeatureSelected
}) {
    let layerDataImportApiPromise = null;
    let userLayerActionsApiPromise = null;

    async function ensureLayerDataImportApi() {
        if (!layerDataImportApiPromise) {
            layerDataImportApiPromise = import('../../useLayerDataImport').then(({ useLayerDataImport }) => (
                useLayerDataImport({
                    mapInstance: mapInstanceRef,
                    initialView,
                    userDataLayers,
                    addManagedLayerRecord,
                    createManagedVectorLayer,
                    styleTemplates,
                    onImportProgress
                })
            ));
        }
        return layerDataImportApiPromise;
    }

    async function ensureUserLayerActionsApi() {
        if (!userLayerActionsApiPromise) {
            userLayerActionsApiPromise = Promise.all([
                import('../../useUserLayerActions'),
                ensureLayerDataImportApi()
            ]).then(([actionsMod, dataImportApi]) => actionsMod.useUserLayerActions({
                mapInstance: mapInstanceRef,
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
                onRouteManagedLayerRemoved
            }));
        }

        return userLayerActionsApiPromise;
    }

    async function callUserLayerAction(method, ...args) {
        const api = await ensureUserLayerActionsApi();
        if (typeof api?.[method] !== 'function') return undefined;
        return api[method](...args);
    }

    function setBaseLayerActive(...args) {
        return callUserLayerAction('setBaseLayerActive', ...args);
    }

    function setLayerVisibility(...args) {
        return callUserLayerAction('setLayerVisibility', ...args);
    }

    function zoomToUserLayer(...args) {
        return callUserLayerAction('zoomToUserLayer', ...args);
    }

    function viewUserLayer(...args) {
        return callUserLayerAction('viewUserLayer', ...args);
    }

    return {
        ensureLayerDataImportApi,
        ensureUserLayerActionsApi,
        setBaseLayerActive,
        setLayerVisibility,
        zoomToUserLayer,
        viewUserLayer
    };
}
