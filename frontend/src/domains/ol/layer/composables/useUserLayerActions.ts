import { useMessage } from '@common/shell/useMessage';
import { useFeatureStyleStore } from '@ol/stores/useFeatureStyleStore';
import { getFeatureIdFromFeature } from '@common/data-protocol/featureKey';
import { forgetSourceSnapshot } from '@common/data-import/crs/sourceSnapshot';

export interface UserLayerActionsDeps {
    mapInstance: any;
    drawSource: any;
    userDataLayers: any[];
    refreshUserLayerZIndex: () => void;
    emitUserLayersChange: () => void;
    emitGraphicsOverview: () => void;
    isRouteManagedLayer?: (options: { layerId: string; removed: any }) => boolean;
    onRouteManagedLayerRemoved?: (options: { layerId: string; removed: any }) => void;
    mergeStyleConfig: (currentConfig: any, patch: any) => any;
    applyManagedLayerStyle: (target: any) => void;
    styleTemplates?: Record<string, any>;
    setDrawStyle?: (style: any) => void;
    layerList?: any;
    selectedLayer?: any;
    getLayerCategory?: (layerId: any) => any;
    refreshLayersState?: () => void;
    projectExtentToMapView?: (extent: any, sourceProjection?: string) => any;
    emitFeatureSelected?: (payload?: any) => void;
}

export function useUserLayerActions({
    mapInstance,
    drawSource,
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
    getLayerCategory: _getLayerCategory,
    refreshLayersState,
    projectExtentToMapView,
    emitFeatureSelected,
}: UserLayerActionsDeps) {
    const message = useMessage();

    function normalizeLayerId(layerId: any) {
        return String(layerId || '').trim();
    }

    function findUserLayer(layerId: any) {
        const id = normalizeLayerId(layerId);
        return userDataLayers.find((item: any) => normalizeLayerId(item?.id) === id);
    }

    function findMapLayersByManagedId(layerId: any) {
        const id = normalizeLayerId(layerId);
        if (!id || !mapInstance?.value) return [];

        const layers = mapInstance.value.getLayers?.().getArray?.() || [];
        return layers.filter((layer: any) => normalizeLayerId(layer?.get?.('managedLayerId')) === id);
    }

    function getFeatureKey(feature: any) {
        return normalizeLayerId(
            feature?.getId?.() ||
                feature?.get?.('_gid') ||
                feature?.get?.('id') ||
                feature?.get?.('name'),
        );
    }

    function clearLayerSource(layer: any) {
        layer?.getSource?.()?.clear?.();
    }

    function removeDrawSourceFeatures(removed: any) {
        if (removed?.sourceType !== 'draw' || !drawSource) return;

        const layerFeatures = removed.layer?.getSource?.()?.getFeatures?.() || [];
        if (!layerFeatures.length) return;

        const featureSet = new Set(layerFeatures);
        const featureKeys = new Set(layerFeatures.map(getFeatureKey).filter(Boolean));

        (drawSource.getFeatures?.() || []).forEach((feature: any) => {
            const key = getFeatureKey(feature);
            if (featureSet.has(feature) || (key && featureKeys.has(key))) {
                drawSource.removeFeature?.(feature);
            }
        });
    }

    function setUserLayerVisibility(layerId: any, visible: boolean | number) {
        const target = findUserLayer(layerId);
        if (!target) return;
        target.visible = !!visible;
        target.layer?.setVisible?.(target.visible);
        if (target.labelLayer) {
            target.labelLayer.setVisible?.(target.visible && !!target.labelVisible);
        }
        emitUserLayersChange();
    }

    function setUserLayerOpacity(layerId: any, opacity: number | string) {
        const target = findUserLayer(layerId);
        if (!target) return;
        const val = Math.min(1, Math.max(0, Number(opacity)));
        target.opacity = Number.isFinite(val) ? val : 1;
        target.layer?.setOpacity?.(target.opacity);
        if (target.labelLayer) {
            target.labelLayer.setOpacity?.(target.opacity);
        }
        emitUserLayersChange();
    }

    function removeUserLayer(layerId: any) {
        if (!mapInstance?.value) return;

        const id = normalizeLayerId(layerId);
        if (!id) return;

        // 图层一旦移除，导入期留存的原始几何即失去归属：同步释放，避免 id 复用时张冠李戴。
        // 放在此处而非各 return 前，是因为下面两条分支（有记录 / 只剩地图图层）都以「该 id 已不存在」收场。
        forgetSourceSnapshot(id);

        const idx = userDataLayers.findIndex((item: any) => normalizeLayerId(item?.id) === id);
        if (idx < 0) {
            const managedLayers = findMapLayersByManagedId(id);
            if (!managedLayers.length) return;
            managedLayers.forEach((layer: any) => {
                clearLayerSource(layer);
                mapInstance.value.removeLayer(layer);
            });
            emitGraphicsOverview();
            return;
        }

        const removed = userDataLayers[idx];
        const layersToRemove = new Set(
            [removed.layer, removed.labelLayer, ...findMapLayersByManagedId(id)].filter(Boolean),
        );
        removeDrawSourceFeatures(removed);
        layersToRemove.forEach((layer) => {
            if (!layer) return;
            // 几何/标注共用 source：只清一次；clearLayerSource 内部应对二次调用安全
            clearLayerSource(layer);
            mapInstance.value.removeLayer(layer);
        });
        userDataLayers.splice(idx, 1);

        if (isRouteManagedLayer?.({ layerId: id, removed })) {
            onRouteManagedLayerRemoved?.({ layerId: id, removed });
        }

        refreshUserLayerZIndex();
        emitUserLayersChange();
        emitGraphicsOverview();
    }

    function reorderUserLayers({ fromId, toId }: { fromId: string; toId: string }) {
        const fromIndex = userDataLayers.findIndex((item: any) => item.id === fromId);
        const toIndex = userDataLayers.findIndex((item: any) => item.id === toId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

        const moved = userDataLayers.splice(fromIndex, 1)[0];
        userDataLayers.splice(toIndex, 0, moved);
        refreshUserLayerZIndex();
        emitUserLayersChange();
    }

    function soloUserLayer(layerId: any) {
        userDataLayers.forEach((item: any) => {
            item.visible = item.id === layerId;
            item.layer?.setVisible?.(item.visible);
            if (item.labelLayer) {
                item.labelLayer.setVisible?.(item.visible && !!item.labelVisible);
            }
        });
        emitUserLayersChange();
    }

    function setUserLayerStyle({ layerId, styleConfig }: { layerId: any; styleConfig: any }) {
        const target = findUserLayer(layerId);
        if (!target) return;
        if (typeof target.layer?.setStyle !== 'function') {
            message.warning('当前图层类型不支持矢量样式编辑');
            return;
        }

        target.styleConfig = mergeStyleConfig(target.styleConfig, styleConfig);

        const features = target.layer.getSource()?.getFeatures?.() || [];

        // ★ 改造（2026-06-21）：先备份原始样式到 useFeatureStyleStore，
        //    避免 setStyle(undefined) 后 KML/自定义样式永久丢失
        try {
            const featureStyleStore = useFeatureStyleStore();
            if (featureStyleStore && typeof featureStyleStore.saveOriginalStyle === 'function') {
                features.forEach((feature: any) => {
                    const featureId = getFeatureIdFromFeature(feature);
                    if (featureId) {
                        featureStyleStore.saveOriginalStyle(layerId, featureId, feature.getStyle?.() ?? null);
                    }
                });
            }
        } catch (error) {
            console.warn('[useUserLayerActions] setUserLayerStyle → saveOriginalStyle failed:', error);
        }

        features.forEach((feature: any) => {
            feature.setStyle(undefined);
        });
        // 样式配置变化时清空标签缓存，确保新样式生效
        target.labelStyleCache = new globalThis.Map();
        applyManagedLayerStyle(target);
        emitUserLayersChange();
    }

    function setUserLayerLabelVisibility({ layerId, visible }: { layerId: any; visible: boolean }) {
        const target = findUserLayer(layerId);
        if (!target) return;
        // 标注能力（autoLabel）与可见（labelVisible）已解耦：默认能力开、默认不可见，手动开关只改可见
        target.labelVisible = !!visible;
        if (target.labelLayer) {
            target.labelLayer.setVisible?.(!!target.visible && target.labelVisible);
        }
        applyManagedLayerStyle(target);
        // 重新钳制 zIndex：几何恒 < 瓦片标注 < 数据标注，避免开关标注后层级错乱
        try {
            refreshUserLayerZIndex?.();
        } catch {
            /* ignore */
        }
        emitUserLayersChange();
    }

    function applyStyleTemplate({ target, layerId, templateId }: { target: string; layerId?: any; templateId: string }) {
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

    /**
     * 设置底图激活状态
     * 当从 Cesium 切换到 OL 时，同步 URL 中的 l 参数到底图选择
     * 注意：layerId 是底图预设 ID（如 'imagery_google_preset'），不是图层源 ID（如 'imagery_google'）
     * @param {string} layerId - 底图预设 ID
     */
    function setBaseLayerActive(layerId: any) {
        if (!layerId || !selectedLayer) return;

        // 直接设置 selectedLayer，因为 selectedLayer 存储的是预设 ID
        // 不需要检查 layerList，因为 layerList 包含的是图层源 ID，不是预设 ID
        if (selectedLayer.value !== layerId) {
            selectedLayer.value = layerId;
        }
    }

    function setLayerVisibility(layerId: any, visible: boolean) {
        const target = layerList?.value?.find((item: any) => item.id === layerId);
        if (!target) return;
        target.visible = !!visible;
        refreshLayersState?.();
    }

    function zoomToUserLayer(layerId: any) {
        if (!mapInstance?.value) return;

        const target = findUserLayer(layerId);
        if (!target) return;

        const source = target.layer.getSource?.();
        const fitExtent = (extent: any) => {
            if (!extent || extent.some((v: any) => !Number.isFinite(v))) return;
            const projected = projectExtentToMapView
                ? projectExtentToMapView(extent, target.metadata?.sourceProjection) || extent
                : extent;
            mapInstance.value.getView().fit(projected, {
                padding: [80, 80, 80, 80],
                duration: 800,
                maxZoom: 18,
            });
        };

        const extent = source?.getExtent?.();
        if (extent && extent.every((v: any) => Number.isFinite(v))) {
            fitExtent(extent);
            return;
        }

        if (typeof source?.getView === 'function') {
            source
                .getView()
                .then((viewCfg: any) => {
                    if (viewCfg?.projection) {
                        target.metadata = {
                            ...(target.metadata || {}),
                            sourceProjection: viewCfg.projection,
                        };
                    }
                    fitExtent(viewCfg?.extent);
                })
                .catch(() => {});
        }
    }

    function viewUserLayer(layerId: any) {
        const target = findUserLayer(layerId);
        if (!target) return;
        const payload: { 图层名称: any; 图层类型: any; 可见状态: string; 要素数量: any; 纬度?: any; 经度?: any } = {
            图层名称: target.name,
            图层类型: target.type,
            可见状态: target.visible ? '显示' : '隐藏',
            要素数量: target.featureCount,
        };
        if (
            Number.isFinite(target.metadata?.longitude) &&
            Number.isFinite(target.metadata?.latitude)
        ) {
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
        viewUserLayer,
    };
}
