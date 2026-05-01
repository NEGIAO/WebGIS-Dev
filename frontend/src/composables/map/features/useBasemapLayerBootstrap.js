import TileLayer from 'ol/layer/Tile';
import { prioritizeTileSourceRequest } from '../../useTileSourceFactory';

/**
 * Basemap layer bootstrap feature
 *
 * Responsibilities:
 * - Initialize base TileLayer instances from layer configs
 * - Attach timeout/error fallback monitoring for visible layers
 * - Keep layerInstances map in sync with layerList order
 */
export function createBasemapLayerBootstrap({
    layerListRef,
    layerConfigs,
    layerInstances,
    monitorLayerTimeout,
    selectedLayerRef,
    message,
    defaultLayerId = 'google'
}) {
    function initializeBasemapLayers() {
        const list = layerListRef?.value;
        if (!Array.isArray(list)) return [];

        list.forEach((item, index) => {
            const config = layerConfigs.find((cfg) => cfg.id === item.id);
            const source = (config && item.visible)
                ? prioritizeTileSourceRequest(config.createSource())
                : null;

            const layer = new TileLayer({
                source,
                visible: item.visible,
                zIndex: index
            });

            if (item.visible && source) {
                const isDefaultBaseLayer = item.id === defaultLayerId;
                monitorLayerTimeout?.(layer, item.id, isDefaultBaseLayer, {
                    onTimeout: () => {
                        if (isDefaultBaseLayer) {
                            message?.warning?.(`${item.id}响应过慢，正在切换备用底图...`);
                        } else {
                            message?.warning?.(`${item.id}响应过慢，建议手动切换底图。`);
                        }
                    },
                    onError: () => {
                        if (isDefaultBaseLayer) {
                            message?.error?.(`${item.id}服务异常，正在切换备用底图...`);
                        } else {
                            message?.error?.(`${item.id}服务异常，建议手动切换底图。`);
                        }
                    },
                    onSuccess: () => {
                        if (isDefaultBaseLayer) {
                            message?.success?.(`${item.id}加载成功。`);
                        }
                    },
                    onLayerSwitchRequired: (nextOption, reason) => {
                        if (selectedLayerRef) {
                            selectedLayerRef.value = nextOption;
                        }
                        message?.info?.(`已切换至${nextOption}底图（${reason}）`);
                    }
                });
            }

            layerInstances[item.id] = layer;
        });

        return list.map((item) => layerInstances[item.id]);
    }

    return {
        initializeBasemapLayers
    };
}
