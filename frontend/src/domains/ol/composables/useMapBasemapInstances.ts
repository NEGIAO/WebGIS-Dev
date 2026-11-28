import { buildRasterBasemapSource, applyBasemapSourceToLayer } from '@ol/basemap/composables/basemapLayerFactory';
import { Z_BAND, allocateBasemapZIndex } from '@ol/layer/zIndexBands';

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

        // 带内 zIndex 只按「可见层」编号：全量列表现有 110 项，标注瓦片带仅 50 槽位，
        // 沿用全量索引（length-1-index）会溢出到数据几何带。语义不变：列表靠前 = 带内更高 z。
        const zIndexById = allocateBasemapZIndex(
            layerList,
            (id: string) => configs.find((cfg: any) => cfg?.id === id)?.zBand,
        );

        layerList.forEach((item) => {
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

            const band = configs.find((cfg: any) => cfg?.id === item.id)?.zBand;
            const zBand = band === 'label' ? Z_BAND.LABEL : Z_BAND.BASEMAP;
            const targetZIndex = zIndexById.get(String(item.id)) ?? zBand;
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
                // layerConfigs 本身就是底图配置全集，命中即底图层，无需旧 category 白名单
                if (configs.some((cfg: any) => cfg?.id === item.id)) {
                    clearLayerSourceForced(item.id);
                }
            }
        });

        refreshLayerInstances({ layerList, instanceMap, configs });

        if (Array.isArray(normalizedResolvedIds) && normalizedResolvedIds.length && instanceMap) {
            normalizedResolvedIds.forEach((id, index) => {
                const layer = instanceMap[id];
                if (!layer || typeof layer.setZIndex !== 'function') return;
                const band = configs.find((cfg: any) => cfg?.id === id)?.zBand;
                const zBand = band === 'label' ? Z_BAND.LABEL : Z_BAND.BASEMAP;
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
