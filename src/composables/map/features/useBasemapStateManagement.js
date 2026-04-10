/**
 * useBasemapStateManagement.js
 * 
 * [作用] 提取底图状态管理功能，包括状态广播和图层源刷新
 * [特点] 支持底图列表对外同步、Google 主机切换后的源更新
 * [模式] Factory 函数，依赖注入状态和方法
 * 
 * 中文注释遵循原有约定，保持代码可读性。
 */


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
    layerInstances
}) {

    /**
     * 广播底图列表状态
     * 
     * 将当前底图列表的完整状态（ID、名称、可见性、分类、分组、激活状态）
     * 广播给外部组件，用于面板展示或其他组件联动。
     * 
     * [交互] emit: base-layers-change
     */
    function emitBaseLayersChange() {
        emit('base-layers-change', layerList.value.map(item => ({
            id: item.id,
            name: item.name,
            visible: item.visible,
            category: getLayerCategory(item.id),
            group: getLayerGroup(item.id),
            active: selectedLayer.value === item.id
        })));
    }

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
            const cfg = LAYER_CONFIGS.find(item => item.id === id);
            const layer = layerInstances[id];
            if (!cfg || !layer) return;
            layer.setSource(cfg.createSource());
        });
    }

    return {
        emitBaseLayersChange,
        refreshGoogleLayerSources
    };
}
