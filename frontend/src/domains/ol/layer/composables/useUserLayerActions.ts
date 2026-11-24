import { useMessage } from '@common/shell/useMessage';
import { useFeatureStyleStore } from '@ol/stores/useFeatureStyleStore';
import { getFeatureIdFromFeature } from '@common/data-protocol/featureKey';
import { forgetSourceSnapshot } from '@common/data-import/crs/sourceSnapshot';
import { layerActionFailed, layerActionOk, type LayerActionResult } from '@common/map-adapter/types';

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

    /**
     * 设置用户图层可见性。
     * @returns 统一结果；找不到图层时返回 `LAYER_NOT_FOUND`（原实现为静默 no-op）
     */
    function setUserLayerVisibility(layerId: any, visible: boolean | number): LayerActionResult {
        const target = findUserLayer(layerId);
        if (!target) {
            return layerActionFailed(
                'LAYER_NOT_FOUND',
                `No user layer matches id "${String(layerId ?? '')}"`,
                normalizeLayerId(layerId),
            );
        }
        target.visible = !!visible;
        target.layer?.setVisible?.(target.visible);
        if (target.labelLayer) {
            target.labelLayer.setVisible?.(target.visible && !!target.labelVisible);
        }
        emitUserLayersChange();
        return layerActionOk(target.id, { visible: target.visible });
    }

    /**
     * 设置用户图层透明度（0~1，内部 clamp）。
     * @returns 统一结果；找不到图层时返回 `LAYER_NOT_FOUND`
     */
    function setUserLayerOpacity(layerId: any, opacity: number | string): LayerActionResult {
        const target = findUserLayer(layerId);
        if (!target) {
            return layerActionFailed(
                'LAYER_NOT_FOUND',
                `No user layer matches id "${String(layerId ?? '')}"`,
                normalizeLayerId(layerId),
            );
        }
        const val = Math.min(1, Math.max(0, Number(opacity)));
        target.opacity = Number.isFinite(val) ? val : 1;
        target.layer?.setOpacity?.(target.opacity);
        if (target.labelLayer) {
            target.labelLayer.setOpacity?.(target.opacity);
        }
        emitUserLayersChange();
        return layerActionOk(target.id, { opacity: target.opacity });
    }

    /**
     * 删除用户图层（**不可撤销**）。
     *
     * @returns 统一结果，并回带被删图层的名称与要素数 —— Agent 需要据此如实汇报
     *          「删了什么」，而不是只说「已完成」。
     */
    function removeUserLayer(layerId: any): LayerActionResult {
        if (!mapInstance?.value) {
            return layerActionFailed(
                'ADAPTER_NOT_READY',
                'Map instance is not ready',
                normalizeLayerId(layerId),
            );
        }

        const id = normalizeLayerId(layerId);
        if (!id) {
            return layerActionFailed('LAYER_ID_INVALID', 'layerId is required');
        }

        // 删除前先记录身份信息：删完就取不到了
        const idx = userDataLayers.findIndex((item: any) => normalizeLayerId(item?.id) === id);
        const before = idx >= 0 ? userDataLayers[idx] : null;
        const removedName = String(before?.name || id);
        const removedFeatureCount = Number(before?.featureCount ?? 0);

        // 图层一旦移除，导入期留存的原始几何即失去归属：同步释放，避免 id 复用时张冠李戴。
        // 放在此处而非各 return 前，是因为下面两条分支（有记录 / 只剩地图图层）都以「该 id 已不存在」收场。
        forgetSourceSnapshot(id);

        if (idx < 0) {
            const managedLayers = findMapLayersByManagedId(id);
            if (!managedLayers.length) {
                return layerActionFailed('LAYER_NOT_FOUND', `No user layer matches id "${id}"`, id);
            }
            managedLayers.forEach((layer: any) => {
                clearLayerSource(layer);
                mapInstance.value.removeLayer(layer);
            });
            emitGraphicsOverview();
            return layerActionOk(id, {
                name: removedName,
                featureCount: removedFeatureCount,
                deleted: true,
            });
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

        return layerActionOk(id, {
            name: String(removed?.name || removedName),
            featureCount: Number(removed?.featureCount ?? removedFeatureCount),
            deleted: true,
        });
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

    /**
     * 单独显示某图层（其余全部隐藏）。
     * @returns 统一结果 + 被隐藏的图层名清单（便于模型如实汇报）
     */
    function soloUserLayer(layerId: any): LayerActionResult {
        const targetId = normalizeLayerId(layerId);
        const target = findUserLayer(targetId);
        if (!target) {
            return layerActionFailed(
                'LAYER_NOT_FOUND',
                `No user layer matches id "${targetId}"`,
                targetId,
            );
        }

        const hiddenLayers: string[] = [];
        userDataLayers.forEach((item: any) => {
            const isTarget = normalizeLayerId(item?.id) === targetId;
            item.visible = isTarget;
            item.layer?.setVisible?.(item.visible);
            if (item.labelLayer) {
                item.labelLayer.setVisible?.(item.visible && !!item.labelVisible);
            }
            if (!isTarget) hiddenLayers.push(String(item?.name || item?.id || ''));
        });
        emitUserLayersChange();
        return layerActionOk(targetId, { visible: true, hiddenLayers, hiddenCount: hiddenLayers.length });
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
        // 重新钳制 zIndex：注记瓦片 < 几何 < 数据标注，避免开关标注后层级错乱
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

    /**
     * 缩放到用户图层范围。
     *
     * 原实现为 fire-and-forget（`source.getView().then(...)` 后无回传），Agent 无法知道
     * 是否真的定位成功；现改为 await 并把结果归一为 `LayerActionResult`。
     * UI 侧原有调用不 await 亦兼容（仅不再静默吞掉失败）。
     *
     * @returns 成功时携带实际 extent；无可用范围时返回 `EXTENT_UNAVAILABLE`
     */
    async function zoomToUserLayer(layerId: any): Promise<LayerActionResult> {
        if (!mapInstance?.value) {
            return layerActionFailed(
                'ADAPTER_NOT_READY',
                'Map instance is not ready',
                normalizeLayerId(layerId),
            );
        }

        const target = findUserLayer(layerId);
        if (!target) {
            return layerActionFailed(
                'LAYER_NOT_FOUND',
                `No user layer matches id "${String(layerId ?? '')}"`,
                normalizeLayerId(layerId),
            );
        }

        const source = target.layer.getSource?.();
        const fitExtent = (extent: any): boolean => {
            if (!extent || typeof extent.some !== 'function') return false;
            if (extent.some((v: any) => !Number.isFinite(v))) return false;
            const projected = projectExtentToMapView
                ? projectExtentToMapView(extent, target.metadata?.sourceProjection) || extent
                : extent;
            mapInstance.value.getView().fit(projected, {
                padding: [80, 80, 80, 80],
                duration: 800,
                maxZoom: 18,
            });
            return true;
        };

        const extent = source?.getExtent?.();
        if (extent && extent.every?.((v: any) => Number.isFinite(v))) {
            fitExtent(extent);
            return layerActionOk(target.id, { extent: Array.from(extent) });
        }

        if (typeof source?.getView === 'function') {
            try {
                const viewCfg = await source.getView();
                if (viewCfg?.projection) {
                    target.metadata = {
                        ...(target.metadata || {}),
                        sourceProjection: viewCfg.projection,
                    };
                }
                if (fitExtent(viewCfg?.extent)) {
                    return layerActionOk(target.id, { extent: Array.from(viewCfg.extent) });
                }
            } catch {
                /* 落到下方统一失败返回 */
            }
        }

        return layerActionFailed(
            'EXTENT_UNAVAILABLE',
            `Layer "${target.name || target.id}" exposes no usable extent`,
            target.id,
        );
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
