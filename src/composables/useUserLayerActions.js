export function useUserLayerActions({
    mapInstance,
    userDataLayers,
    refreshUserLayerZIndex,
    emitUserLayersChange,
    emitGraphicsOverview,
    isRouteManagedLayer,
    onRouteManagedLayerRemoved,
    mergeStyleConfig,
    applyManagedLayerStyle,
    styleTemplates,
    setDrawStyle,
    layerList,
    selectedLayer,
    getLayerCategory,
    refreshLayersState,
    projectExtentToMapView,
    emitFeatureSelected
}) {
    function findUserLayer(layerId) {
        return userDataLayers.find(item => item.id === layerId);
    }

    function setUserLayerVisibility(layerId, visible) {
        const target = findUserLayer(layerId);
        if (!target) return;
        target.visible = !!visible;
        target.layer?.setVisible?.(target.visible);
        emitUserLayersChange();
    }

    function setUserLayerOpacity(layerId, opacity) {
        const target = findUserLayer(layerId);
        if (!target) return;
        const val = Math.min(1, Math.max(0, Number(opacity)));
        target.opacity = Number.isFinite(val) ? val : 1;
        target.layer?.setOpacity?.(target.opacity);
        emitUserLayersChange();
    }

    function removeUserLayer(layerId) {
        if (!mapInstance?.value) return;

        const idx = userDataLayers.findIndex(item => item.id === layerId);
        if (idx < 0) return;

        const removed = userDataLayers[idx];
        mapInstance.value.removeLayer(removed.layer);
        userDataLayers.splice(idx, 1);

        if (isRouteManagedLayer?.({ layerId, removed })) {
            onRouteManagedLayerRemoved?.({ layerId, removed });
        }

        refreshUserLayerZIndex();
        emitUserLayersChange();
        emitGraphicsOverview();
    }

    function reorderUserLayers({ fromId, toId }) {
        const fromIndex = userDataLayers.findIndex(item => item.id === fromId);
        const toIndex = userDataLayers.findIndex(item => item.id === toId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

        const moved = userDataLayers.splice(fromIndex, 1)[0];
        userDataLayers.splice(toIndex, 0, moved);
        refreshUserLayerZIndex();
        emitUserLayersChange();
    }

    function soloUserLayer(layerId) {
        userDataLayers.forEach(item => {
            item.visible = item.id === layerId;
            item.layer?.setVisible?.(item.visible);
        });
        emitUserLayersChange();
    }

    function setUserLayerStyle({ layerId, styleConfig }) {
        const target = findUserLayer(layerId);
        if (!target) return;
        if (typeof target.layer?.setStyle !== 'function') {
            alert('当前图层类型不支持矢量样式编辑');
            return;
        }

        target.styleConfig = mergeStyleConfig(target.styleConfig, styleConfig);
        const features = target.layer.getSource()?.getFeatures?.() || [];
        features.forEach(feature => {
            feature.setStyle(undefined);
        });
        applyManagedLayerStyle(target);
        emitUserLayersChange();
    }

    function setUserLayerLabelVisibility({ layerId, visible }) {
        const target = findUserLayer(layerId);
        if (!target || !target.autoLabel) return;
        target.labelVisible = !!visible;
        applyManagedLayerStyle(target);
        emitUserLayersChange();
    }

    function applyStyleTemplate({ target, layerId, templateId }) {
        const tpl = styleTemplates?.[templateId];
        if (!tpl) return;
        if (target === 'draw') {
            setDrawStyle?.(tpl);
            return;
        }
        if (target === 'layer' && layerId) {
            setUserLayerStyle({ layerId, styleConfig: tpl });
        }
    }

    function setBaseLayerActive(layerId) {
        const target = layerList?.value?.find(item => item.id === layerId);
        if (!target) return;
        if (getLayerCategory?.(layerId) !== 'base') return;
        if (selectedLayer) {
            selectedLayer.value = layerId;
        }
    }

    function setLayerVisibility(layerId, visible) {
        const target = layerList?.value?.find(item => item.id === layerId);
        if (!target) return;
        target.visible = !!visible;
        refreshLayersState?.();
    }

    function zoomToUserLayer(layerId) {
        if (!mapInstance?.value) return;

        const target = findUserLayer(layerId);
        if (!target) return;

        const source = target.layer.getSource?.();
        const fitExtent = (extent) => {
            if (!extent || extent.some(v => !Number.isFinite(v))) return;
            const projected = projectExtentToMapView
                ? (projectExtentToMapView(extent, target.metadata?.sourceProjection) || extent)
                : extent;
            mapInstance.value.getView().fit(projected, {
                padding: [80, 80, 80, 80],
                duration: 800,
                maxZoom: 18
            });
        };

        const extent = source?.getExtent?.();
        if (extent && extent.every(v => Number.isFinite(v))) {
            fitExtent(extent);
            return;
        }

        if (typeof source?.getView === 'function') {
            source.getView().then((viewCfg) => {
                if (viewCfg?.projection) {
                    target.metadata = { ...(target.metadata || {}), sourceProjection: viewCfg.projection };
                }
                fitExtent(viewCfg?.extent);
            }).catch(() => {});
        }
    }

    function viewUserLayer(layerId) {
        const target = findUserLayer(layerId);
        if (!target) return;
        const payload = {
            图层名称: target.name,
            图层类型: target.type,
            可见状态: target.visible ? '显示' : '隐藏',
            要素数量: target.featureCount
        };
        if (Number.isFinite(target.metadata?.longitude) && Number.isFinite(target.metadata?.latitude)) {
            payload.经度 = Number(target.metadata.longitude).toFixed(6);
            payload.纬度 = Number(target.metadata.latitude).toFixed(6);
        }
        emitFeatureSelected?.(payload);
    }

    return {
        setUserLayerVisibility,
        setUserLayerOpacity,
        removeUserLayer,
        reorderUserLayers,
        soloUserLayer,
        setUserLayerStyle,
        setUserLayerLabelVisibility,
        applyStyleTemplate,
        setBaseLayerActive,
        setLayerVisibility,
        zoomToUserLayer,
        viewUserLayer
    };
}