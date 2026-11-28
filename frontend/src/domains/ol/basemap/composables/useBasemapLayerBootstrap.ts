import { prioritizeTileSourceRequest } from '@ol/tile-source';
import { createBasemapLayerFromSource, createVectorTileBasemapLayer } from './basemapLayerFactory';
import { resolvePresetLayerIds } from '../constants/basemapResolver';
import { Z_BAND, allocateBasemapZIndex } from '@ol/layer/zIndexBands';

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
export interface BasemapLayerBootstrapDeps {
    layerListRef: any;
    layerConfigs: any[];
    layerInstances: Record<string, any>;
    monitorLayerTimeout: (layer: any, layerId: any, isDefaultBaseLayer?: boolean, callbacks?: any) => void;
    selectedLayerRef?: any;
    message?: any;
    defaultLayerId?: string;
}

export function createBasemapLayerBootstrap({
    layerListRef,
    layerConfigs,
    layerInstances,
    monitorLayerTimeout,
    selectedLayerRef,
    message,
    defaultLayerId = 'google',
}: BasemapLayerBootstrapDeps) {
    function initializeBasemapLayers() {
        const list = layerListRef?.value;
        if (!Array.isArray(list)) return [];

        // 从 selectedLayerRef 读取实际的默认底图预设 ID（管理员 L2 配置 / 用户偏好）
        // fallback 到 defaultLayer_id 参数（静态默认值，仅在 ref 未初始化时使用）
        const actualDefaultLayerId = selectedLayerRef?.value || defaultLayerId;

        // 解析默认预设包含的具体图层 ID 集合，这些图层不做容灾监控
        const defaultPresetLayerIds = new Set(resolvePresetLayerIds(actualDefaultLayerId));

        // 带内 zIndex 只按「可见层」编号（见 allocateBasemapZIndex）：
        // 全量列表现有 110 项，而标注瓦片带仅 50 槽位，用全量索引会溢出到数据几何带。
        // 语义不变：列表顶部（index 0）= 面板"置顶"目标 → 带内最高 z。
        const zIndexById = allocateBasemapZIndex(
            list,
            (id: string) => layerConfigs.find((cfg: any) => cfg.id === id)?.zBand,
        );

        list.forEach((item) => {
            const config = layerConfigs.find((cfg: any) => cfg.id === item.id);
            const rawSource = config && item.visible ? config.createSource() : null;
            const source = rawSource ? prioritizeTileSourceRequest(rawSource) : null;
            // 显示带：标注类底图归标注带（150~199），其余归底图带（0~99）；
            // 不可见层不参与编号，回落至带基准值（不渲染，无视觉影响）
            const zBand = config?.zBand === 'label' ? Z_BAND.LABEL : Z_BAND.BASEMAP;
            const zIndex = zIndexById.get(String(item.id)) ?? zBand;
            const isVectorTile = config?.serviceType === 'vector-tile';
            const layer = isVectorTile
                ? createVectorTileBasemapLayer(source, {
                      visible: item.visible,
                      zIndex,
                      opacity: typeof item.opacity === 'number' ? item.opacity : 1,
                      styleUrl: config?.styleUrl,
                  })
                : createBasemapLayerFromSource(source, {
                      visible: item.visible,
                      zIndex,
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
