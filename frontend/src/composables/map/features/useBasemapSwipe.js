/**
 * 底图卷帘分析功能
 * 支持双底图对比，拖拽分割线查看不同底图
 */

import { ref, watch } from 'vue';
import { useMapSwipe } from '../../useMapSwipe';

const SWIPE_COMPARE_LAYER_PREFIX = '__swipe_compare_layer__';
const SWIPE_UNSUPPORTED_PRESETS = new Set(['custom', 'local_tiles_preset']);

/**
 * 创建卷帘分析功能
 * @param {Object} deps - 依赖注入
 * @param {import('vue').Ref} deps.mapInstance - 地图实例
 * @param {Object} deps.layerStore - 图层 Store
 * @param {Function} deps.resolvePresetLayerIds - 解析预设图层 ID
 * @param {Function} deps.createBasemapLayerFromSource - 创建底图图层
 * @param {Object} deps.LAYER_CONFIGS - 图层配置列表
 * @param {string} deps.NORM_BASE - 标准化基础 URL
 * @param {string} deps.TIANDITU_TK - 天地图 Token
 * @param {import('vue').Ref} deps.customMapUrl - 自定义地图 URL
 * @param {Object} deps.layerInstances - 图层实例缓存
 * @param {Function} deps.switchLayerById - 切换图层
 * @param {Function} deps.emitBaseLayersChangeBatched - 批量发射底图变更事件
 * @param {import('vue').Ref} deps.selectedLayer - 当前选中图层
 * @param {Object} deps.message - 消息系统
 */
export function createBasemapSwipe({
    mapInstance,
    layerStore,
    resolvePresetLayerIds,
    createBasemapLayerFromSource,
    LAYER_CONFIGS,
    NORM_BASE,
    TIANDITU_TK,
    customMapUrl,
    layerInstances,
    switchLayerById,
    emitBaseLayersChangeBatched,
    selectedLayer,
    message,
}) {
    const {
        attachToLayers: attachSwipeToLayers,
        detachFromLayers: detachSwipeFromLayers,
        updateSwipePosition,
        updateSwipeMode,
        dispose: disposeSwipe,
    } = useMapSwipe();

    const mapContainerRect = ref(null);

    function resolveSwipeLayerIds(presetId) {
        const layerIds = resolvePresetLayerIds(presetId).filter((id) => {
            const layerConfig = LAYER_CONFIGS.find((cfg) => cfg.id === id);
            return !!layerConfig?.createSource;
        });
        return layerIds;
    }

    function createSwipeSourceByLayerId(layerId) {
        const layerConfig = LAYER_CONFIGS.find((cfg) => cfg.id === layerId);
        if (!layerConfig) return null;

        const layerFactoryContext = {
            normBase: NORM_BASE,
            tiandituTk: TIANDITU_TK,
            customUrl: customMapUrl.value || '',
        };

        return layerConfig.createSource?.(layerFactoryContext) || null;
    }

    function clearSwipeCompareLayers() {
        if (!mapInstance.value) return;

        const toRemove = mapInstance.value
            .getLayers()
            .getArray()
            .filter((layer) =>
                String(layer.get('name') || '').startsWith(SWIPE_COMPARE_LAYER_PREFIX),
            );

        toRemove.forEach((layer) => mapInstance.value.removeLayer(layer));
    }

    function resolveVisibleTileLayersByIds(layerIds) {
        if (!mapInstance.value) return [];

        const mapLayers = mapInstance.value.getLayers().getArray();
        const result = [];

        (layerIds || []).forEach((layerId) => {
            let layer = layerInstances[layerId];
            if (layer) {
                result.push(layer);
                return;
            }

            layer = mapLayers.find((l) => {
                const name = l.get?.('name');
                const id = l.get?.('id');
                return name === layerId || id === layerId;
            });
            if (layer) {
                layerInstances[layerId] = layer;
                result.push(layer);
            }
        });

        return result;
    }

    async function enableBasemapSwipe(config = {}) {
        const { leftBasemapId, rightBasemapId, mode = 'horizontal' } = config;

        if (!mapInstance.value) {
            throw new Error('地图尚未初始化');
        }

        if (!leftBasemapId || !rightBasemapId) {
            throw new Error('左右底图 ID 不能为空');
        }

        if (
            SWIPE_UNSUPPORTED_PRESETS.has(leftBasemapId) ||
            SWIPE_UNSUPPORTED_PRESETS.has(rightBasemapId)
        ) {
            const errorMsg = '不支持的底图类型。卷帘分析仅支持标准在线底图，请选择其他底图选项。';
            console.error('[enableBasemapSwipe] Error:', errorMsg);
            message.error(errorMsg);
            throw new Error(errorMsg);
        }

        try {
            if (typeof switchLayerById === 'function') {
                switchLayerById(leftBasemapId, {
                    onUpdated: () => {
                        selectedLayer.value = leftBasemapId;
                    },
                });
                if (typeof emitBaseLayersChangeBatched === 'function') {
                    emitBaseLayersChangeBatched();
                }
            }

            detachSwipeFromLayers();
            clearSwipeCompareLayers();

            const leftLayerIds = resolveSwipeLayerIds(leftBasemapId);
            const rightLayerIds = resolveSwipeLayerIds(rightBasemapId);

            if (!leftLayerIds.length) {
                throw new Error(`左侧底图组 ${leftBasemapId} 没有可用图层`);
            }
            if (!rightLayerIds.length) {
                throw new Error(`右侧底图组 ${rightBasemapId} 没有可用图层`);
            }

            await new Promise((resolve) => {
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(resolve);
                } else {
                    setTimeout(resolve, 0);
                }
            });

            const leftTileLayers = resolveVisibleTileLayersByIds(leftLayerIds);
            if (!leftTileLayers.length) {
                throw new Error(`左侧底图组 ${leftBasemapId} 未找到`);
            }

            const rightCompareLayers = [];

            rightLayerIds.forEach((layerId, index) => {
                const source = createSwipeSourceByLayerId(layerId);
                if (!source) {
                    throw new Error(`无法为右侧图层 ${layerId} 创建 source`);
                }

                const compareLayer = createBasemapLayerFromSource(source, {
                    visible: true,
                    zIndex: 100 + index,
                });

                compareLayer.setProperties({
                    name: `${SWIPE_COMPARE_LAYER_PREFIX}_${index}_${layerId}`,
                    layerType: 'basemap-swipe-compare',
                    swipeCompareLayer: true,
                    swipeSide: 'right',
                    swipeLayerId: layerId,
                });
                mapInstance.value.addLayer(compareLayer);
                rightCompareLayers.push(compareLayer);
            });

            if (!rightCompareLayers.length) {
                throw new Error('右侧底图组创建失败');
            }

            const swipeBindings = [
                ...leftTileLayers.map((layer) => ({ layer, side: 'left' })),
                ...rightCompareLayers.map((layer) => ({ layer, side: 'right' })),
            ];

            attachSwipeToLayers(mapInstance.value, swipeBindings);
            updateSwipeMode(mode);

            layerStore.setSwipeConfig({
                enabled: true,
                position: 0.5,
                mode,
                targetLayerIds: [...leftLayerIds, ...rightLayerIds],
            });

            mapInstance.value.render();

            message.success('卷帘分析已启用，拖拽分割线对比两个底图组');

            return { success: true, message: '已启用卷帘分析对比' };
        } catch (error) {
            console.error('[enableBasemapSwipe] Error:', error);
            clearSwipeCompareLayers();
            detachSwipeFromLayers();
            layerStore.disableSwipe();
            message.error(String(error?.message || error || '启用失败'));
            throw error;
        }
    }

    function handleSwipePositionUpdate(position) {
        layerStore.updateSwipePosition(position);
        updateSwipePosition(position);
    }

    function handleSwipeModeUpdate(mode) {
        layerStore.updateSwipeMode(mode);
        updateSwipeMode(mode);
    }

    function handleSwipeClose() {
        layerStore.disableSwipe();
        detachSwipeFromLayers();
        clearSwipeCompareLayers();
        mapInstance.value?.render?.();
    }

    /**
     * 恢复持久化的卷帘状态
     * 地图初始化后调用，如果 store 中 swipeConfig.enabled 为 true，
     * 则根据持久化的 targetLayerIds 重新附加裁剪效果
     */
    function restoreSwipe() {
        const config = layerStore.swipeConfig;
        if (!config?.enabled || !mapInstance.value) return;

        const targetLayerIds = config.targetLayerIds || [];
        if (!targetLayerIds.length) {
            layerStore.disableSwipe();
            return;
        }

        // 从 targetLayerIds 中区分左右图层（前半为左，后半为右）
        const midIndex = Math.ceil(targetLayerIds.length / 2);
        const leftLayerIds = targetLayerIds.slice(0, midIndex);
        const rightLayerIds = targetLayerIds.slice(midIndex);

        try {
            const leftTileLayers = resolveVisibleTileLayersByIds(leftLayerIds);
            if (!leftTileLayers.length) {
                layerStore.disableSwipe();
                return;
            }

            const rightCompareLayers = [];
            rightLayerIds.forEach((layerId, index) => {
                const source = createSwipeSourceByLayerId(layerId);
                if (!source) return;
                const compareLayer = createBasemapLayerFromSource(source, {
                    visible: true,
                    zIndex: 100 + index,
                });
                compareLayer.setProperties({
                    name: `${SWIPE_COMPARE_LAYER_PREFIX}_${index}_${layerId}`,
                    layerType: 'basemap-swipe-compare',
                    swipeCompareLayer: true,
                    swipeSide: 'right',
                    swipeLayerId: layerId,
                });
                mapInstance.value.addLayer(compareLayer);
                rightCompareLayers.push(compareLayer);
            });

            if (!rightCompareLayers.length) {
                layerStore.disableSwipe();
                return;
            }

            const swipeBindings = [
                ...leftTileLayers.map((layer) => ({ layer, side: 'left' })),
                ...rightCompareLayers.map((layer) => ({ layer, side: 'right' })),
            ];

            attachSwipeToLayers(mapInstance.value, swipeBindings);
            updateSwipeMode(config.mode || 'horizontal');
            mapInstance.value.render();
        } catch (e) {
            console.warn('[restoreSwipe] 恢复卷帘状态失败:', e);
            clearSwipeCompareLayers();
            detachSwipeFromLayers();
            layerStore.disableSwipe();
        }
    }

    return {
        mapContainerRect,
        enableBasemapSwipe,
        restoreSwipe,
        clearSwipeCompareLayers,
        detachSwipeFromLayers,
        handleSwipePositionUpdate,
        handleSwipeModeUpdate,
        handleSwipeClose,
        dispose: disposeSwipe,
    };
}
