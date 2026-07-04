/**
 * useBasemapStateManagement.js
 *
 * [作用] 提取底图状态管理功能，包括状态广播和图层源刷新
 * [特点] 支持底图列表对外同步、Google 主机切换后的源更新
 * [模式] Factory 函数，依赖注入状态和方法
 *
 * 中文注释遵循原有约定，保持代码可读性。
 */

import { abortTileSourceRequests } from '../../useTileSourceFactory';
import { buildRasterBasemapSource, isVectorTileSource } from './basemapLayerFactory';

/**
 * 创建底图状态管理特性工厂函数
 *
 * @param {Object} options - 工厂选项
 * @param {Ref} options.layerList - 底图列表响应式变量
 * @param {Ref} options.selectedLayer - 当前选中底图响应式变量
 * @param {Function} options.getLayerCategory - 获取底图分类函数
 * @param {Function} options.getLayerGroup - 获取底图分组函数
 * @param {Function} options.emit - Vue emit 函数
 * @param {Array} options.LAYER_CONFIGS - 图层配置列表
 * @param {Object} options.layerInstances - 图层实例映射表
 *
 * @returns {Object} 返回底图状态管理功能对象
 */
export function createBasemapStateManagementFeature({
    layerList,
    selectedLayer,
    getLayerCategory,
    getLayerGroup,
    emit,
    LAYER_CONFIGS,
    layerInstances,
}) {
    /**
     * [改进] 批量 emit 包装器，减少频繁的事件广播
     * 50ms 窗口内的多个 emit 调用会被合并为一次
     */
    const createBatchEmitter = (fn, { batchWindow = 50 } = {}) => {
        let pending = false;
        let timer = null;

        const batched = (...args) => {
            if (pending) return;

            pending = true;
            clearTimeout(timer);

            timer = setTimeout(() => {
                fn(...args);
                pending = false;
            }, batchWindow);
        };

        // [C6] 暴露 cancel 方法，支持组件卸载时取消待执行的批量任务
        batched.cancel = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            pending = false;
        };

        return batched;
    };

    /**
     * 广播底图列表状态
     *
     * 将当前底图列表的完整状态（ID、名称、可见性、分类、分组、激活状态）
     * 广播给外部组件，用于面板展示或其他组件联动。
     *
     * [交互] emit: base-layers-change
     * [改进] 使用批量 emit 减少重绘
     */
    function emitBaseLayersChange() {
        emit(
            'base-layers-change',
            layerList.value.map((item) => ({
                id: item.id,
                name: item.name,
                visible: item.visible,
                category: getLayerCategory(item.id),
                group: getLayerGroup(item.id),
                active: selectedLayer.value === item.id,
            })),
        );
    }

    // 创建批量版本的 emit
    const emitBaseLayersChangeBatched = createBatchEmitter(emitBaseLayersChange, {
        batchWindow: 50,
    });

    /**
     * 刷新 Google 图层源
     *
     * 当 Google 主机切换后，重建相关的 Google 图层 source。
     * 支持标准版、清洁版等不同 Google 底图变体。
     * 被 runDeferredStartupTasks 调用。
     */
    function refreshGoogleLayerSources() {
        const googleLayerIds = ['google', 'google_standard', 'google_clean'];
        googleLayerIds.forEach((id) => {
            const cfg = LAYER_CONFIGS.find((item) => item.id === id);
            const layer = layerInstances[id];
            if (!cfg || !layer) return;
            // cfg.createSource() 已内含 prioritizeTileSourceRequest，再走 buildRasterBasemapSource 套 zDirection
            const newSource = buildRasterBasemapSource(cfg.createSource());
            if (newSource) {
                layer.setSource(newSource);
            }
        });
    }

    /**
     * 高清渲染开关翻转后，重建所有 raster 底图 source。
     *
     * 机制：buildRasterBasemapSource 在构造期读取 tileHDRendering 决定是否设置 zDirection（自定义函数，非整数 zoom 一律取上层）；
     * 已建图层的 source 不会自动跟随开关变化，故翻转后需遍历 layerInstances 重建 source。
     * 旧 source 先 abort 释放 fetch 连接，再 setSource 新 source，避免泄漏/挂起请求。
     * VectorTile 图层不受高清开关影响（矢量瓦片本身可缩放，无模糊问题），跳过。
     */
    function refreshAllBasemapSourcesForHD() {
        Object.keys(layerInstances).forEach((id) => {
            const layer = layerInstances[id];
            if (!layer || typeof layer.getSource !== 'function') return;
            const cfg = LAYER_CONFIGS.find((item) => item.id === id);
            if (!cfg || typeof cfg.createSource !== 'function') return;

            // 仅 raster 底图需要重建（VectorTile 跳过）
            const prevSource = layer.getSource();
            if (prevSource && isVectorTileSource(prevSource)) return;

            // 先 abort 旧 source 的所有 fetch，释放 TCP 连接，再挂新 source
            if (prevSource) abortTileSourceRequests(prevSource);
            // 走与构造期同一套 zDirection 设置逻辑
            const newSource = buildRasterBasemapSource(cfg.createSource());
            if (newSource) {
                layer.setSource(newSource);
            }
        });
    }

    return {
        emitBaseLayersChange,
        emitBaseLayersChangeBatched,
        refreshGoogleLayerSources,
        refreshAllBasemapSourcesForHD,
    };
}
