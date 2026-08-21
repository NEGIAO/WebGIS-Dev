/**
 * 底图卷帘分析功能
 * 支持双底图对比，拖拽分割线查看不同底图
 */

import { ref } from 'vue';
import { useMapSwipe } from '@ol/composables/useMapSwipe';
import { Z_BAND, Z_BASEMAP_SWIPE_OFFSET } from '@ol/layer/zIndexBands';

const SWIPE_COMPARE_LAYER_PREFIX = '__swipe_compare_layer__';

/**
 * 创建卷帘分析功能
 * @param {Object} deps - 依赖注入
 * @param {import('vue').Ref} deps.mapInstance - 地图实例
 * @param {Object} deps.layerStore - 图层 Store
 * @param {Function} deps.resolvePresetLayerIds - 解析预设图层 ID
 * @param {Function} deps.createBasemapLayerFromSource - 创建底图图层
 * @param {Object} deps.LAYER_CONFIGS - 图层配置列表
 * @param {string|Function|import('vue').Ref<string>} deps.TIANDITU_TK - 天地图 Token
 * @param {import('vue').Ref} deps.customMapUrl - 自定义地图 URL
 * @param {Object} deps.layerInstances - 图层实例缓存
 * @param {Function} deps.switchLayerById - 切换图层
 * @param {Function} deps.setCustomBasemapByUrl - 加载并激活共享 custom 图层
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
    TIANDITU_TK,
    customMapUrl,
    layerInstances,
    switchLayerById,
    setCustomBasemapByUrl,
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
    const getTiandituTk = () => readRuntimeValue(TIANDITU_TK);

    function resolveSwipeLayerIds(presetId) {
        const layerIds = resolvePresetLayerIds(presetId).filter((id) => {
            const layerConfig = LAYER_CONFIGS.find((cfg) => cfg.id === id);
            return !!layerConfig?.createSource;
        });
        return layerIds;
    }

    function createSwipeSourceByLayerId(layerId, customUrl) {
        const layerConfig = LAYER_CONFIGS.find((cfg) => cfg.id === layerId);
        if (!layerConfig) return null;

        const effectiveCustomUrl = layerId === 'custom'
            ? customUrl === undefined
                ? String(customMapUrl.value || '').trim()
                : String(customUrl || '').trim()
            : '';

        const layerFactoryContext = {
            tiandituTk: getTiandituTk(),
            customUrl: effectiveCustomUrl,
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
        const {
            leftBasemapId,
            rightBasemapId,
            leftCustomUrl = '',
            rightCustomUrl = '',
            mode = 'horizontal',
        } = config;

        if (!mapInstance.value) {
            throw new Error('地图尚未初始化');
        }

        if (!leftBasemapId || !rightBasemapId) {
            throw new Error('左右底图 ID 不能为空');
        }

        if (leftBasemapId === 'custom' && !String(leftCustomUrl).trim()) {
            throw new Error('左侧自定义底图 URL 不能为空');
        }
        if (rightBasemapId === 'custom' && !String(rightCustomUrl).trim()) {
            throw new Error('右侧自定义底图 URL 不能为空');
        }

        try {
            if (leftBasemapId === 'custom' && typeof setCustomBasemapByUrl === 'function') {
                const result = await setCustomBasemapByUrl(String(leftCustomUrl).trim());
                if (result?.success === false) throw new Error(result.message || '左侧自定义底图加载失败');
                selectedLayer.value = 'custom';
            } else if (typeof switchLayerById === 'function') {
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
                const source = createSwipeSourceByLayerId(
                    layerId,
                    rightBasemapId === 'custom' ? rightCustomUrl : '',
                );
                if (!source) {
                    throw new Error(`无法为右侧图层 ${layerId} 创建 source`);
                }

                const compareLayer = createBasemapLayerFromSource(source, {
                    visible: true,
                    zIndex: Z_BAND.BASEMAP + Z_BASEMAP_SWIPE_OFFSET + index,
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
                leftLayerIds,
                rightLayerIds,
                leftCustomUrl: leftBasemapId === 'custom' ? String(leftCustomUrl).trim() : '',
                rightCustomUrl: rightBasemapId === 'custom' ? String(rightCustomUrl).trim() : '',
            });

            mapInstance.value.render();

            message.success('卷帘分析已启用，拖拽分割线对比两个底图组');

            return { success: true, message: '已启用卷帘分析对比' };
        } catch (error) {
            // 下方 message.error 已提示用户,此处不再重复 console.error
            // console.error('[enableBasemapSwipe] Error:', error);
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
    async function restoreSwipe() {
        const config = layerStore.swipeConfig;
        if (!config?.enabled || !mapInstance.value) return;

        const targetLayerIds = config.targetLayerIds || [];
        if (!targetLayerIds.length) {
            layerStore.disableSwipe();
            return;
        }

        // 优先使用显式持久化的左右列表，兼容旧数据回退到 midIndex 拆分
        let leftLayerIds, rightLayerIds;
        if (config.leftLayerIds?.length && config.rightLayerIds?.length) {
            leftLayerIds = config.leftLayerIds;
            rightLayerIds = config.rightLayerIds;
        } else {
            const midIndex = Math.ceil(targetLayerIds.length / 2);
            leftLayerIds = targetLayerIds.slice(0, midIndex);
            rightLayerIds = targetLayerIds.slice(midIndex);
        }

        try {
            const leftBasemapId = leftLayerIds.includes('custom') ? 'custom' : '';
            if (leftBasemapId && config.leftCustomUrl && typeof setCustomBasemapByUrl === 'function') {
                const result = await setCustomBasemapByUrl(config.leftCustomUrl);
                if (result?.success === false) throw new Error(result.message || '左侧自定义底图恢复失败');
            }
            const leftTileLayers = resolveVisibleTileLayersByIds(leftLayerIds);
            if (!leftTileLayers.length) {
                layerStore.disableSwipe();
                return;
            }

            const rightCompareLayers = [];
            rightLayerIds.forEach((layerId, index) => {
                const source = createSwipeSourceByLayerId(
                    layerId,
                    layerId === 'custom' ? config.rightCustomUrl : '',
                );
                if (!source) return;
                const compareLayer = createBasemapLayerFromSource(source, {
                    visible: true,
                    zIndex: Z_BAND.BASEMAP + Z_BASEMAP_SWIPE_OFFSET + index,
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

function readRuntimeValue(source) {
    if (typeof source === 'function') {
        return String(source() || '').trim();
    }

    if (source && typeof source === 'object' && 'value' in source) {
        return String(source.value || '').trim();
    }

    return String(source || '').trim();
}
