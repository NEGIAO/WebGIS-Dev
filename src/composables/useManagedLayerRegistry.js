export function useManagedLayerRegistry({
    emit,
    userDataLayers,
    drawSource,
    styleTemplates
}) {
    let userLayerSeed = 1;

    function createManagedLayerId() {
        return `layer_${userLayerSeed++}`;
    }

    function emitUserLayersChange() {
        emit('user-layers-change', userDataLayers.map(item => ({
            id: item.id,
            name: item.name,
            type: item.type,
            sourceType: item.sourceType || 'upload',
            order: item.order ?? 0,
            visible: item.visible,
            featureCount: item.featureCount,
            features: Array.isArray(item.features) ? item.features : [],
            opacity: item.opacity ?? 1,
            autoLabel: !!item.autoLabel,
            labelVisible: item.labelVisible !== false,
            category: item.metadata?.category,
            crs: item.metadata?.crs ? String(item.metadata.crs).toLowerCase() : undefined,
            longitude: Number.isFinite(item.metadata?.longitude) ? item.metadata.longitude : undefined,
            latitude: Number.isFinite(item.metadata?.latitude) ? item.metadata.latitude : undefined,
            styleConfig: item.styleConfig || { ...styleTemplates.classic }
        })));
    }

    function emitGraphicsOverview() {
        emit('graphics-overview', {
            drawCount: drawSource.getFeatures().length,
            uploadCount: userDataLayers.length,
            layers: userDataLayers.map(item => ({
                id: item.id,
                name: item.name,
                visible: item.visible,
                featureCount: item.featureCount,
                features: Array.isArray(item.features) ? item.features : []
            }))
        });
    }

    function refreshUserLayerZIndex() {
        userDataLayers.forEach((item, index) => {
            item.order = index;
            item.layer.setZIndex(120 + index);
        });
    }

    function addManagedLayerRecord({ name, type, sourceType, layer, featureCount = 1, features = [], styleConfig = null, metadata = null }) {
        const id = createManagedLayerId();
        userDataLayers.push({
            id,
            name,
            type,
            sourceType,
            order: userDataLayers.length,
            visible: true,
            opacity: 1,
            featureCount,
            features,
            styleConfig,
            metadata,
            layer
        });
        refreshUserLayerZIndex();
        emitUserLayersChange();
        emitGraphicsOverview();
        return id;
    }

    return {
        createManagedLayerId,
        emitUserLayersChange,
        emitGraphicsOverview,
        refreshUserLayerZIndex,
        addManagedLayerRecord
    };
}