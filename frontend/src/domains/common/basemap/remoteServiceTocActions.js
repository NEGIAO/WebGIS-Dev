/**
 * remoteServiceTocActions.js
 * TOC 树动作的「在线服务」分流器（对齐 cesiumTocActions 模式）。
 *
 * TOCPanel.handleLayerTreeAction 顶部调用：凡 nodeId 带 `rsvc:` 前缀
 * （或「在线服务」分组头）的动作直调 remoteServices 注册表，返回 true 表示已消费；
 * 其余动作原路放行。
 *
 * 关键点：服务节点是 folder 类型 —— LayerPanel 对 folder 显隐默认会展开成
 * 逐叶子 toggle（丢失"整体开关"语义），因此本分流器必须在展开前接管，
 * 由 LayerPanel 对 rsvc 分组前缀做原样放行配合。
 */

import {
    RSVC_NODE_PREFIX,
    RSVC_GROUP_NODE_ID,
    RSVC_SUB_LAYER_SEP,
    parseRsvcNodeId,
    setRemoteServiceVisible,
    setRemoteServiceSublayer,
    reorderRemoteServiceSublayers,
    reorderRemoteServices,
    unregisterRemoteService,
    rsvcEngineApi,
} from './remoteServices';
import { useMessage } from '@common/shell/useMessage';

function extractNodeId(evt) {
    return String(evt?.nodeId ?? evt?.layerId ?? evt?.payload?.layerId ?? '').trim();
}

/** 判定是否为子图层叶子节点（rsvc:<id>:L:<name>） */
function isSubLayerNodeId(nodeId) {
    return nodeId.includes(RSVC_SUB_LAYER_SEP);
}

/** 引擎定位：优先注册了 zoomTo 的引擎，逐个尝试直到成功 */
function zoomViaEngine(serviceId) {
    const { warning } = useMessage();
    const apis = [rsvcEngineApi.ol, rsvcEngineApi.cesium].filter(Boolean);
    if (!apis.length) {
        warning('当前引擎不支持在线服务定位', { duration: 2500 });
        return true;
    }
    for (const api of apis) {
        try {
            if (api.zoomTo(serviceId)) return true;
        } catch {
            /* 尝试下一引擎 */
        }
    }
    warning('该服务未声明地理范围，无法定位', { duration: 2500 });
    return true;
}

export function handleRemoteServiceTreeAction(evt, store) {
    const type = String(evt?.type || '');
    if (type) console.debug('[RSVC][TOC]', type, evt.nodeId ?? evt.layerId ?? '');
    if (!type) return false;

    // ---- 引擎定位（缩放至图层）：服务节点 / 子图层叶子均支持，定位到服务范围 ----
    if (type === 'zoom-layer') {
        const nodeId = extractNodeId(evt);
        if (!nodeId.startsWith(RSVC_NODE_PREFIX)) return false;
        const { serviceId } = parseRsvcNodeId(nodeId);
        return zoomViaEngine(serviceId);
    }

    // ---- 移除：叶子=取消叠加；服务=注销整条记录（双引擎 adapter 自动卸载）----
    if (type === 'remove-layer') {
        const nodeId = extractNodeId(evt);
        if (!nodeId.startsWith(RSVC_NODE_PREFIX)) return false;
        const { serviceId, subLayerName } = parseRsvcNodeId(nodeId);
        if (subLayerName) setRemoteServiceSublayer(serviceId, subLayerName, false);
        else unregisterRemoteService(serviceId);
        return true;
    }

    // ---- folder 整体显隐（服务节点 / 分组头）----
    if (type === 'toggle-folder-visibility') {
        const nodeId = extractNodeId(evt);
        const visible = evt.visible !== false;
        if (nodeId === RSVC_GROUP_NODE_ID) {
            for (const record of store.records.value) {
                setRemoteServiceVisible(record.id, visible);
            }
            return true;
        }
        if (nodeId.startsWith(RSVC_NODE_PREFIX) && !isSubLayerNodeId(nodeId)) {
            setRemoteServiceVisible(nodeId.slice(RSVC_NODE_PREFIX.length), visible);
            return true;
        }
        return false;
    }

    // ---- 子图层叶子勾选（调整 LAYERS 组合，不改整体显隐）----
    if (type === 'toggle-layer-visibility') {
        const nodeId = extractNodeId(evt);
        if (!nodeId.startsWith(RSVC_NODE_PREFIX) || !isSubLayerNodeId(nodeId)) return false;
        const { serviceId, subLayerName } = parseRsvcNodeId(nodeId);
        setRemoteServiceSublayer(serviceId, subLayerName, evt.visible !== false);
        return true;
    }

    // ---- 拖拽排序：叶子=LAYERS 叠放次序；服务节点=服务间整体叠放 ----
    // 拖拽起点记录到 store 上的临时字段（TOCPanel 的 layerStore.draggingLayerId 存的是
    // 用户图层语义的 id，rsvc 节点 id 含 ':' 前缀无法复用其 reorder 链路）
    if (type === 'drag-layer-start') {
        const nodeId = extractNodeId(evt);
        if (!nodeId.startsWith(RSVC_NODE_PREFIX)) return false;
        handleRemoteServiceTreeAction.__rsvcDraggingNodeId = nodeId;
        return true;
    }

    if (type === 'drop-layer') {
        const fromNodeId = String(handleRemoteServiceTreeAction.__rsvcDraggingNodeId || '');
        const toNodeId = extractNodeId(evt);
        handleRemoteServiceTreeAction.__rsvcDraggingNodeId = '';
        if (!fromNodeId || !toNodeId.startsWith(RSVC_NODE_PREFIX)) return false;
        const fromParsed = parseRsvcNodeId(fromNodeId);
        const toParsed = parseRsvcNodeId(toNodeId);
        // 叶子→同服务内叶子：调整 LAYERS 叠放；服务→服务：调整服务间叠放；跨层级拖拽忽略
        if (fromParsed.subLayerName && toParsed.subLayerName && fromParsed.serviceId === toParsed.serviceId) {
            reorderRemoteServiceSublayers(fromParsed.serviceId, fromParsed.subLayerName, toParsed.subLayerName);
        } else if (!fromParsed.subLayerName && !toParsed.subLayerName && fromParsed.serviceId !== toParsed.serviceId) {
            reorderRemoteServices(fromParsed.serviceId, toParsed.serviceId);
            // 服务叠放次序变化由 adapter watch records 数组顺序自动重排 zIndex
        }
        return true;
    }

    // ---- 子图层叶子「取消叠加」：等价于从 LAYERS 组合中移除勾选 ----

    return false;
}
