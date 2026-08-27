/**
 * cesiumTocActions.js
 * TOC 树动作的 Cesium 分流器（统一图层管理·第二步）。
 *
 * TOCPanel.handleLayerTreeAction 顶部调用：凡 layerId 带 `cesium:` 前缀的
 * 动作直调 cesiumLayers store（经 adapter 触达场景句柄），返回 true 表示已消费；
 * 2D 图层动作原路放行，HomeView 事件链零改动。
 */

import { CESIUM_NODE_PREFIX, CESIUM_GROUP_NODE_ID } from '@cesium-domain/stores/cesiumLayerNodeBuilder';

/** 从动作事件中提取目标 id（emitAction 将 payload 平铺为 evt 顶层，兼容直挂形态） */
function extractLayerId(evt) {
    return String(evt?.layerId ?? evt?.payload?.layerId ?? evt?.nodeId ?? '').trim();
}

/**
 * 处理 Cesium 节点动作
 * @param {object} evt - TOCTreeItem 冒泡的动作事件 { type, layerId?, nodeId?, payload?, ... }
 * @param {object} cesiumStore - useCesiumLayersStore() 实例
 * @returns {boolean} true = 已消费（调用方直接 return）
 */
export function handleCesiumLayerTreeAction(evt, cesiumStore) {
    const nodeId = extractLayerId(evt);
    const isGroupNode = nodeId === CESIUM_GROUP_NODE_ID;
    if (!isGroupNode && !nodeId.startsWith(CESIUM_NODE_PREFIX)) return false;

    const id = nodeId.startsWith(CESIUM_NODE_PREFIX)
        ? nodeId.slice(CESIUM_NODE_PREFIX.length)
        : '';
    const type = String(evt?.type || '');

    switch (type) {
        case 'folder-clear-layers':
            // 「三维数据」组头清空：逐条走 remove（adapter 清场景 → syncFromImport 删档）
            [...(cesiumStore.records || [])].forEach((record) => cesiumStore.remove(record.id));
            return true;
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
        case 'data-set-height':
            cesiumStore.setBaseHeight(id, Number(evt.height ?? 0));
            return true;
        case 'data-set-material':
            cesiumStore.setMaterialMode(id, String(evt.mode || 'none'));
            return true;
        case 'data-reposition':
            // 打开 GLTF 坐标弹窗（弹窗 UI 挂在 CesiumContainer，由 adapter 触发）
            cesiumStore.requestReposition?.(id);
            return true;
        case 'data-stretch-height':
            // GeoTIFF 单波段拉伸至高程
            cesiumStore.requestStretchHeight?.(id);
            return true;
        case 'layer-selected':
            return true;
        default:
            return true;
    }
}
