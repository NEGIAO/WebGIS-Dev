import { buildRasterBasemapSource, applyBasemapSourceToLayer } from '@ol/basemap/composables/basemapLayerFactory';
import { Z_BAND } from '@ol/layer/zIndexBands';

/**
 * OpenLayers 底图图层实例管理（按需挂载数据源、刷新显隐/层级/透明度、切换底图并回收隐藏层队列）
 */
export function useMapBasemapInstances(
    mapInstance: any,
    {
        layerListRef = null,
        layerInstances = null,
        layerConfigs = null,
        resolveVisibleLayerIds = null,
        satelliteLayers = ['tianDiTu', 'Google', 'esri', 'google'],
        vectorLayers = ['tianDiTu_vec'],
    }: {
        layerListRef?: any;
        layerInstances?: any;
        layerConfigs?: any;
        resolveVisibleLayerIds?: ((...args: any[]) => any) | null;
        satelliteLayers?: string[];
        vectorLayers?: string[];
    } = {},
) {
    function findLayerConfigById(layerId: any, configs = layerConfigs) {
        if (!Array.isArray(configs)) return null;
        return configs.find((cfg) => cfg?.id === layerId) || null;
    }

    function ensureLayerSourceById(
        layerId: any,
        instanceMap = layerInstances,
        configs = layerConfigs,
        isVisible = true,
    ) {
        if (!instanceMap || !layerId) return null;
        const layer = instanceMap[layerId];
        if (!layer || layer.getSource?.()) return layer;
        const cfg = findLayerConfigById(layerId, configs);
        if (!cfg || typeof cfg.createSource !== 'function') return layer;
        const newSource = buildRasterBasemapSource(cfg.createSource());
        if (!newSource) return layer;

        const replacedLayer = applyBasemapSourceToLayer({
            layer,
            source: newSource,
            map: mapInstance?.value ?? null,
            visible: isVisible,
        });
        if (replacedLayer) {
            instanceMap[layerId] = replacedLayer;
            return replacedLayer;
        }
        return layer;
    }

    function refreshLayerInstances({
        layerList = layerListRef?.value,
        instanceMap = layerInstances,
        configs = layerConfigs,
    } = {}) {
        if (!Array.isArray(layerList) || !instanceMap) return;

        layerList.forEach((item, index) => {
            let layer = instanceMap[item.id];
            if (!layer) return;

            if (item.visible) {
                layer =
                    ensureLayerSourceById(item.id, instanceMap, configs, true) ||
                    instanceMap[item.id] ||
                    layer;
            }

            const targetVisible = !!item.visible;
            if (layer.getVisible() !== targetVisible) {
                layer.setVisible(targetVisible);
            }

            const category = configs.find((cfg: any) => cfg?.id === item.id)?.category;
            const zBand = category === 'label' ? Z_BAND.LABEL : Z_BAND.BASEMAP;
            const targetZIndex = zBand + (layerList.length - 1 - index);
            if (layer.getZIndex() !== targetZIndex) {
                layer.setZIndex(targetZIndex);
            }

            if (typeof item.opacity === 'number' && item.opacity >= 0 && item.opacity <= 1) {
                if (Math.abs((layer.getOpacity() ?? 1) - item.opacity) > 0.001) {
                    layer.setOpacity(item.opacity);
                }
            }
        });
    }

    function clearLayerSourceForced(layerId: any) {
        if (!layerInstances || !layerId) return;
        const layer = layerInstances[layerId];
        if (!layer) return;
        const source = layer.getSource?.();
        if (!source) return;
        if (typeof source.clear === 'function') {
            try {
                source.clear();
            } catch (e) {
                console.warn('[OL-Queue-Clear] Error clearing source:', e);
            }
        }
        if (typeof layer.setSource === 'function') {
            layer.setSource(null);
        }
    }

    function switchLayerById(
        layerId: string,
        {
            layerList = layerListRef?.value,
            instanceMap = layerInstances,
            configs = layerConfigs,
            visibleLayerResolver = resolveVisibleLayerIds,
            satelliteIds = satelliteLayers,
            vectorIds = vectorLayers,
            onUpdated,
        } = {} as {
            layerList?: any;
            instanceMap?: any;
            configs?: any;
            visibleLayerResolver?: any;
            satelliteIds?: string[];
            vectorIds?: string[];
            onUpdated?: (...args: any[]) => void;
        },
    ) {
        if (!Array.isArray(layerList) || !layerId) return;
        let normalizedResolvedIds: any = null;

        const resolvedIds =
            typeof visibleLayerResolver === 'function'
                ? visibleLayerResolver(layerId, { layerList, instanceMap, configs })
                : null;

        const visibleIdSet = new Set();

        if (Array.isArray(resolvedIds) && resolvedIds.length) {
            normalizedResolvedIds = resolvedIds.map((id) => String(id));
            normalizedResolvedIds.forEach((id: any) => visibleIdSet.add(id));
            let matchedCount = 0;

            layerList.forEach((item) => {
                const visible = visibleIdSet.has(item.id);
                if (visible) matchedCount += 1;
                item.visible = visible;
            });

            if (matchedCount === 0) {
                layerList.forEach((item) => {
                    if (item.id === 'label' || item.id === 'label_vector') return;
                    item.visible = item.id === layerId;
                });

                const needsSatelliteLabel = satelliteIds.includes(layerId);
                const labelItem = layerList.find((item) => item.id === 'label');
                if (labelItem) labelItem.visible = needsSatelliteLabel;

                const needsVectorLabel = vectorIds.includes(layerId);
                const vectorLabelItem = layerList.find((item) => item.id === 'label_vector');
                if (vectorLabelItem) vectorLabelItem.visible = needsVectorLabel;
            }
        } else {
            layerList.forEach((item) => {
                if (item.id === 'label' || item.id === 'label_vector') return;
                item.visible = item.id === layerId;
            });

            const needsSatelliteLabel = satelliteIds.includes(layerId);
            const labelItem = layerList.find((item) => item.id === 'label');
            if (labelItem) labelItem.visible = needsSatelliteLabel;

            const needsVectorLabel = vectorIds.includes(layerId);
            const vectorLabelItem = layerList.find((item) => item.id === 'label_vector');
            if (vectorLabelItem) vectorLabelItem.visible = needsVectorLabel;
        }

        layerList.forEach((item) => {
            if (!item.visible && item.id !== 'custom') {
                const cfg = configs.find((c: any) => c.id === item.id);
                const category = cfg?.category;
                const isBasemap =
                    category === 'label' ||
                    category === 'imagery' ||
                    category === 'vector' ||
                    category === 'terrain' ||
                    category === 'theme' ||
                    category === 'custom';
                if (isBasemap) {
                    clearLayerSourceForced(item.id);
                }
            }
        });

        refreshLayerInstances({ layerList, instanceMap, configs });

        if (Array.isArray(normalizedResolvedIds) && normalizedResolvedIds.length && instanceMap) {
            normalizedResolvedIds.forEach((id, index) => {
                const layer = instanceMap[id];
                if (!layer || typeof layer.setZIndex !== 'function') return;
                const category = configs.find((cfg: any) => cfg?.id === id)?.category;
                const zBand = category === 'label' ? Z_BAND.LABEL : Z_BAND.BASEMAP;
                layer.setZIndex(zBand + index);
            });
        }

        if (typeof onUpdated === 'function') {
            onUpdated(layerId);
        }
    }

    return {
        refreshLayerInstances,
        switchLayerById,
    };
}
