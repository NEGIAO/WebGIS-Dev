/**
 * cesiumTocActions.js
 * TOC 树动作的 Cesium 分流器（统一图层管理·第二步）。
 *
 * TOCPanel.handleLayerTreeAction 顶部调用：凡 layerId 带 `cesium:` 前缀的
 * 动作直调 cesiumLayers store（经 adapter 触达场景句柄），返回 true 表示已消费；
 * 2D 图层动作原路放行，HomeView 事件链零改动。
 */

import { CESIUM_NODE_PREFIX } from '@cesium-domain/stores/cesiumLayerNodeBuilder';

/** 从动作事件中提取 layerId（兼容 payload 包裹与直挂两种形态） */
function extractLayerId(evt) {
    return String(evt?.layerId ?? evt?.payload?.layerId ?? '').trim();
}

/**
 * 处理 Cesium 节点动作
 * @param {object} evt - TOCTreeItem 冒泡的动作事件 { type, layerId?, payload?, ... }
 * @param {object} cesiumStore - useCesiumLayersStore() 实例
 * @returns {boolean} true = 已消费（调用方直接 return）
 */
export function handleCesiumLayerTreeAction(evt, cesiumStore) {
    const nodeId = extractLayerId(evt);
    if (!nodeId.startsWith(CESIUM_NODE_PREFIX)) return false;

    const id = nodeId.slice(CESIUM_NODE_PREFIX.length);
    const type = String(evt?.type || '');

    switch (type) {
        case 'toggle-layer-visibility':
            cesiumStore.setVisible(id, !!evt.visible);
            return true;
        case 'change-layer-opacity':
            cesiumStore.setOpacity(id, Number(evt.opacity));
            return true;
        case 'rename-layer':
            cesiumStore.rename(id, evt.newName ?? evt.name ?? '');
            return true;
        case 'zoom-layer':
        case 'view-layer':
            cesiumStore.flyTo(id);
            return true;
        case 'remove-layer':
            cesiumStore.remove(id);
            return true;
        case 'layer-selected':
            // 选中高亮暂无 3D 语义，静默消费防止 2D 链误处理
            return true;
        default:
            // 其余（导出/属性表等）能力已在节点 actions 关闭，理论不可达；兜底消费
            return true;
    }
}
