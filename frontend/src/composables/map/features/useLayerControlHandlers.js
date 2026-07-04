/**
 * 图层控制面板事件处理库（Phase 21 - 性能优化版）
 *
 * 主要改进：
 * 1. 引入 AbortController 机制阻断无用的底图切片请求
 * 2. 优化并发槽位释放，解决国外底图加载导致的“卡死”问题
 */
import { abortTileSourceRequests } from '../../useTileSourceFactory'; // 确保路径指向你存放工厂函数的地方
import { createBasemapLayerFromSource, isVectorTileLayer, buildRasterBasemapSource } from './basemapLayerFactory';

export function createLayerControlHandlers({
    selectedLayerRef,
    customMapUrlRef,
    layerListRef,
    layerInstances,
    refreshLayersState,
    createAutoTileSourceFromUrl,
    message,
    mapInstanceRef,
    emitBaseLayersChange,
}) {
    /**
     * 【关键改动 1】：内部助手函数
     * 作用：在物理层面掐断指定图层正在进行的 HTTP 请求[cite: 2]
     */
    function stopLayerNetworkRequests(layerId) {
        if (!layerId || !layerInstances) return;
        const layer = layerInstances[layerId];
        const source = layer?.getSource?.();
        if (source) {
            // 立即停止所有 pending 的 fetch 请求，释放浏览器 6 个并发槽位[cite: 2]
            abortTileSourceRequests(source);
        }
    }

    // Resolve layer visibility, opacity, and zIndex for replacement.
    function resolveLayerPresentation(layerId, fallbackLayer) {
        const list = layerListRef?.value;
        const item = Array.isArray(list) ? list.find((entry) => entry.id === layerId) : null;

        const visible =
            fallbackLayer?.getVisible?.() ??
            (typeof item?.visible === 'boolean' ? item.visible : true);
        const opacity =
            fallbackLayer?.getOpacity?.() ??
            (typeof item?.opacity === 'number' ? item.opacity : 1);
        const zIndex =
            fallbackLayer?.getZIndex?.() ??
            (item && Array.isArray(list) ? list.length - list.indexOf(item) : 0);

        return { visible, opacity, zIndex };
    }

    // Swap the layer instance in map and cache when type changes.
    function replaceLayerInstance(layerId, nextLayer) {
        if (!layerId || !nextLayer) return;
        const map = mapInstanceRef?.value;
        const currentLayer = layerInstances?.[layerId];

        if (map && currentLayer) {
            map.removeLayer(currentLayer);
        }

        if (map) {
            map.addLayer(nextLayer);
        }

        if (layerInstances) {
            layerInstances[layerId] = nextLayer;
        }
    }

    /**
     * 应用底图选择
     */
    function applyBasemapSelection(layerId) {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId || !selectedLayerRef) return;

        if (selectedLayerRef.value === normalizedLayerId) {
            return;
        }

        /**
         * 【关键改动 2】：先阻断，再切换
         * 如果不调用这一步，旧底图（如 Google）没加载完的瓦片会继续占用网络通道[cite: 2]
         */
        stopLayerNetworkRequests(selectedLayerRef.value);

        selectedLayerRef.value = normalizedLayerId;
    }

    /**
     * 加载自定义 URL 底图
     */
    async function loadCustomMap() {
        const normalizedUrl = String(customMapUrlRef?.value || '').trim();
        if (!normalizedUrl) {
            const emptyMessage = '自定义图源 URL 为空';
            message?.warning?.(emptyMessage);
            return {
                success: false,
                message: emptyMessage,
                layerId: 'custom',
            };
        }

        try {
            /**
             * 【关键改动 3】：清理 custom 图层的残留请求
             * 防止用户连续快速点击“加载”按钮导致请求堆积[cite: 2]
             */
            stopLayerNetworkRequests('custom');

            const detected = await createAutoTileSourceFromUrl(normalizedUrl);
            const customLayer = layerInstances?.custom;
            const layerState = resolveLayerPresentation('custom', customLayer);

            const kindTextMap = {
                xyz: '标准XYZ',
                'non-standard-xyz': '非标准XYZ',
                wms: 'WMS',
                wmts: 'WMTS',
                'vector-tile': '矢量切片',
            };

            const kindText = kindTextMap[detected.kind] || detected.kind || '未知图源';
            const successMessage = `自动识别图源: ${kindText}（${detected.detail}）`;
            message?.success?.(successMessage);

            const isVectorTile = detected.kind === 'vector-tile';

            if (isVectorTile) {
                if (customLayer && isVectorTileLayer(customLayer) && customLayer.setSource) {
                    customLayer.setSource(detected.source);
                } else {
                    const nextLayer = createBasemapLayerFromSource(detected.source, layerState);
                    replaceLayerInstance('custom', nextLayer);
                }
            } else {
                if (customLayer && !isVectorTileLayer(customLayer) && customLayer.setSource) {
                    customLayer.setSource(buildRasterBasemapSource(detected.source));
                } else {
                    const nextLayer = createBasemapLayerFromSource(detected.source, layerState);
                    replaceLayerInstance('custom', nextLayer);
                }
            }

            const target = layerListRef?.value?.find((item) => item.id === 'custom');
            if (target) {
                target.visible = true;
                refreshLayersState?.();
            }

            emitBaseLayersChange?.();

            return {
                success: true,
                message: successMessage,
                layerId: 'custom',
                kind: detected.kind,
                detail: detected.detail,
                url: normalizedUrl,
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error || 'URL格式错误或无法解析');
            const failedMessage = `加载自定义图源失败: ${errorMessage}`;
            message?.error?.(failedMessage);
            return {
                success: false,
                message: failedMessage,
                layerId: 'custom',
                url: normalizedUrl,
            };
        }
    }

    /**
     * 统一接收图层切换与自定义 URL 加载
     */
    async function handleLayerChange(payload = {}) {
        const nextLayerId = String(payload.layerId || '').trim();
        let customLoadResult = null;

        if (payload.source === 'custom-url' && customMapUrlRef) {
            customMapUrlRef.value = String(payload.customUrl || '').trim();
            if (customMapUrlRef.value) {
                customLoadResult = await loadCustomMap();
            } else {
                customLoadResult = {
                    success: false,
                    message: '自定义图源 URL 为空',
                    layerId: 'custom',
                };
            }

            if (customLoadResult?.success === false) {
                return {
                    success: false,
                    message: customLoadResult.message,
                    layerId: nextLayerId || selectedLayerRef?.value || '',
                    customLoadResult,
                };
            }
        }

        if (nextLayerId) {
            applyBasemapSelection(nextLayerId);
        }

        if (
            nextLayerId === 'custom' &&
            customMapUrlRef?.value &&
            payload.source !== 'custom-url'
        ) {
            customLoadResult = await loadCustomMap();
        }

        return {
            success: customLoadResult?.success ?? true,
            message: customLoadResult?.message || '图层状态已更新',
            layerId: nextLayerId || selectedLayerRef?.value || '',
            customLoadResult,
        };
    }

    /**
     * 处理图层排序、可见性和透明度更新
     * [性能优化] 按操作类型走不同刷新路径，避免全量刷新
     */
    function handleLayerOrderUpdate(payload = {}) {
        const list = layerListRef?.value;
        if (!Array.isArray(list)) return;

        if (payload.type === 'reorder') {
            const dragIndex = Number(payload.dragIndex);
            const dropIndex = Number(payload.dropIndex);
            if (!Number.isInteger(dragIndex) || !Number.isInteger(dropIndex)) return;
            if (dragIndex < 0 || dropIndex < 0) return;
            if (dragIndex >= list.length || dropIndex >= list.length) return;
            if (dragIndex === dropIndex) return;

            const moved = list.splice(dragIndex, 1)[0];
            list.splice(dropIndex, 0, moved);
            // 排序需要全量刷新 zIndex
            refreshLayersState?.();
            return;
        }

        if (payload.type === 'visibility') {
            const target = list.find((item) => item.id === payload.layerId);
            if (!target) return;
            target.visible = !!payload.visible;

            // [Bug Fix] 当图层被设置为可见时，需要确保 source 已初始化。
            // 问题背景：switchLayerById 会调用 clearLayerSourceForced 清除非当前底图的 source，
            // 导致后续在面板中勾选图层时，即使设置了 visible = true，由于 source 已被清除，
            // 图层无法显示内容。
            // 解决方案：调用 refreshLayersState 确保所有图层的 source 被正确初始化，
            // 同时同步 zIndex 和可见性状态。
            if (target.visible) {
                refreshLayersState?.();
            } else {
                // 只设置 OL 图层可见性，不遍历全部图层（隐藏时无需初始化 source）
                const layer = layerInstances?.[payload.layerId];
                layer?.setVisible?.(false);
            }
            // 通知底图面板状态变化
            emitBaseLayersChange?.();
            return;
        }

        if (payload.type === 'opacity') {
            const layerId = String(payload.layerId);
            const opacity = Number(payload.opacity);
            if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) return;

            const target = list.find((item) => item.id === layerId);
            if (!target) return;
            target.opacity = opacity;
            // 只设置 OL 图层透明度，最轻量路径
            const layer = layerInstances?.[layerId];
            layer?.setOpacity?.(opacity);
        }
    }

    return {
        loadCustomMap,
        handleLayerChange,
        handleLayerOrderUpdate,
    };
}
