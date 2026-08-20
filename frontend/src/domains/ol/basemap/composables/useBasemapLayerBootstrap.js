import { prioritizeTileSourceRequest } from '@ol/tile-source';
import { createBasemapLayerFromSource } from './basemapLayerFactory';
import { resolvePresetLayerIds } from '../constants/basemapResolver';
import { Z_BAND } from '@ol/layer/zIndexBands';

/**
 * Basemap layer bootstrap feature
 *
 * Responsibilities:
 * - Initialize base TileLayer instances from layer configs
 * - Attach timeout/error fallback monitoring for visible layers
 * - Keep layerInstances map in sync with layerList order
 * - Skip resilience monitoring for layers belonging to the runtime default basemap preset
 *   (admin-configured L2 default basemap; custom tiles only cover China → non-China tile failures are expected noise)
 *
 * 注意：默认底图不取 defaultLayerId 参数（静态常量），而取 selectedLayerRef.value（运行时动态值）。
 *       管理员在 Admin 面板设置的 L2 配置（system_config.default_basemap_index）通过 API 异步获取，
 *       在 initMap() 之前写入 selectedLayerRef，initializeBasemapLayers() 执行时即可读到。
 */
export function createBasemapLayerBootstrap({
    layerListRef,
    layerConfigs,
    layerInstances,
    monitorLayerTimeout,
    selectedLayerRef,
    message,
    defaultLayerId = 'google',
}) {
    function initializeBasemapLayers() {
        const list = layerListRef?.value;
        if (!Array.isArray(list)) return [];

        // 从 selectedLayerRef 读取实际的默认底图预设 ID（管理员 L2 配置 / 用户偏好）
        // fallback 到 defaultLayer_id 参数（静态默认值，仅在 ref 未初始化时使用）
        const actualDefaultLayerId = selectedLayerRef?.value || defaultLayerId;

        // 解析默认预设包含的具体图层 ID 集合，这些图层不做容灾监控
        const defaultPresetLayerIds = new Set(resolvePresetLayerIds(actualDefaultLayerId));

        list.forEach((item, index) => {
            const config = layerConfigs.find((cfg) => cfg.id === item.id);
            const rawSource = config && item.visible ? config.createSource() : null;
            const source = rawSource ? prioritizeTileSourceRequest(rawSource) : null;
            // zIndex 按显示带分配（与 refreshLayerInstances 同构）：标注类底图归标注带，其余归底图带
            const zBand = config?.category === 'label' ? Z_BAND.LABEL : Z_BAND.BASEMAP;
            const layer = createBasemapLayerFromSource(source, {
                visible: item.visible,
                zIndex: zBand + index,
                opacity: typeof item.opacity === 'number' ? item.opacity : 1,
            });

            if (item.visible && source) {
                // 仅对非默认预设图层启用容灾监控（默认底图瓦片不完整，报错无意义）
                if (!defaultPresetLayerIds.has(item.id)) {
                    monitorLayerTimeout?.(layer, item.id, false, {
                        onTimeout: () => message?.warning?.(`${item.id}响应过慢，建议手动切换底图。`),
                        onError: () => message?.error?.(`${item.id}服务异常，建议手动切换底图。`),
                        onSuccess: () => {},
                    });
                }
            }

            layerInstances[item.id] = layer;
        });

        return list.map((item) => layerInstances[item.id]);
    }

    return {
        initializeBasemapLayers,
    };
}
