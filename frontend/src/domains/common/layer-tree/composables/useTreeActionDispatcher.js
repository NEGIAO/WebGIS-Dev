/**
 * useTreeActionDispatcher.js — TOC 树动作分发 + 多选集 + 拖拽排序
 *
 * 从 TOCPanel.vue 抽离（P2 拆分）。职责：
 * - cesium / rsvc 前缀节点直调各自分流器
 * - 文件夹级批量清空（folder-clear-layers）
 * - 其余动作经 handleLayerTreeContextAction / 向上 emit
 */

import { computed, ref } from 'vue';
import {
    applyRecursiveSelection,
    applyRecursiveSelectionChunked,
    pruneSelectedLayerIds,
    handleLayerTreeContextAction,
} from '@common/layer-tree';
import { handleCesiumLayerTreeAction } from '@cesium-domain/layers/toc-adapters/cesiumTocActions';
import { CESIUM_NODE_PREFIX } from '@cesium-domain/stores/cesiumLayerNodeBuilder';
import { normalizeTocLayerIdList } from '../protocol';
import { handleRemoteServiceTreeAction } from '@common/basemap/remoteServiceTocActions';
import { RSVC_NODE_PREFIX } from '@common/basemap/remoteServices';

/**
 * @param {object} ctx
 * @param {object} ctx.layerStore useLayerStore 实例
 * @param {object} ctx.cesiumLayersStore 三维数据 store
 * @param {Function} ctx.useRemoteServices 注册表组合函数工厂
 * @param {object} ctx.props 组件 props（userLayers/overview/activeEngine）
 * @param {Function} ctx.emit 组件 emit
 * @param {object} ctx.message 消息组件
 * @param {Function} ctx.t i18n
 * @param {object} ctx.uiState { propertiesDialogVisible, propertiesDialogLayer }（show-layer-properties 写入）
 * @param {object} ctx.deps { openAttributeTable, setStyleTarget, copyLayerCoordinates, openManualAoiDialogByPoi }
 */
export function useTreeActionDispatcher({
    layerStore,
    cesiumLayersStore,
    useRemoteServices,
    props,
    emit,
    message,
    t,
    uiState,
    deps,
}) {
    const multiSelectedLayerIds = ref([]);
    let recursiveSelectionToken = 0;

    /**
     * 可参与多选的图层 id 全集。
     *
     * 必须包含三维记录：`applyRecursiveSelection` / `pruneSelectedLayerIds` 都会用本集合
     * 过滤候选 id，早先只收 `userLayers`（纯 2D）→ `cesium:*` 节点被静默剔除，
     * 表现为「右键加入多选没反应、批量菜单永远不出现」。
     */
    const availableLayerIds = computed(() => {
        const twoDIds = (props.userLayers || [])
            .map((layer) => String(layer?.id || '').trim())
            .filter(Boolean);
        const cesiumIds = (cesiumLayersStore.records || [])
            .map((record) => String(record?.id || '').trim())
            .filter(Boolean)
            .map((id) => `${CESIUM_NODE_PREFIX}${id}`);
        return [...twoDIds, ...cesiumIds];
    });

    const layerActionMap = computed(() => {
        const map = new Map();

        const walk = (nodes = []) => {
            (nodes || []).forEach((node) => {
                if (!node) return;

                if (node.type === 'layer') {
                    const nodeId = String(node.id || '').trim();
                    if (nodeId) {
                        map.set(nodeId, node.actions || {});
                    }
                }

                if (Array.isArray(node.children) && node.children.length > 0) {
                    walk(node.children);
                }
            });
        };

        walk(layerStore.layerTree || []);
        return map;
    });

    function resolveLayerActionsById(layerId) {
        const id = String(layerId || '').trim();
        if (!id) return null;
        return layerActionMap.value.get(id) || null;
    }

    function pruneMultiSelectedLayerIds() {
        multiSelectedLayerIds.value = pruneSelectedLayerIds(
            multiSelectedLayerIds.value,
            availableLayerIds.value,
        );
    }

    function setNodeRecursiveSelection(nodeId, checked) {
        multiSelectedLayerIds.value = applyRecursiveSelection({
            selectedLayerIds: multiSelectedLayerIds.value,
            treeNodes: layerStore.layerTree || [],
            targetNodeId: nodeId,
            checked,
            availableLayerIds: availableLayerIds.value,
        });
    }

    function addMultiSelectedLayer(layerId) {
        setNodeRecursiveSelection(layerId, true);
    }

    function removeMultiSelectedLayer(layerId) {
        setNodeRecursiveSelection(layerId, false);
    }

    function setFolderRecursiveSelection(nodeId, checked) {
        const currentToken = ++recursiveSelectionToken;
        applyRecursiveSelectionChunked({
            selectedLayerIds: multiSelectedLayerIds.value,
            treeNodes: layerStore.layerTree || [],
            targetNodeId: nodeId,
            checked,
            availableLayerIds: availableLayerIds.value,
            chunkSize: 180,
            shouldCancel: () => currentToken !== recursiveSelectionToken,
        }).then((nextSelection) => {
            if (currentToken !== recursiveSelectionToken) return;
            multiSelectedLayerIds.value = nextSelection;
        });
    }

    function clearMultiSelectedLayers() {
        multiSelectedLayerIds.value = [];
    }

    function onDragStart(layerId) {
        layerStore.onDragStart(layerId);
    }

    function onDrop(targetLayerId) {
        layerStore.onDrop(targetLayerId);
    }

    function handleLayerTreeAction(rawEvt) {
        let evt = rawEvt;
        const type = evt?.type;
        if (!type) return;

        /**
         * 批量操作可能同时勾选 2D 与 3D 图层：按前缀拆成两批分别下发。
         * 不拆的话，通用链路会把 `cesium:*` 目标当成 2D 图层 id 去 emit，
         * HomeView 侧找不到对应托管图层 → 整批静默失败。
         */
        if (type === 'batch-layer-operation') {
            const allIds = normalizeTocLayerIdList(evt.layerIds);
            const cesiumIds = allIds.filter((id) => id.startsWith(CESIUM_NODE_PREFIX));
            if (cesiumIds.length) {
                const consumed = handleCesiumLayerTreeAction(
                    { ...evt, layerIds: cesiumIds },
                    cesiumLayersStore,
                );
                const restIds = allIds.filter((id) => !id.startsWith(CESIUM_NODE_PREFIX));
                // 三维侧未识别该操作类型时整批放弃，避免「只处理了一半还报成功」
                if (!consumed) return;
                // 三维批量走元数据店，不经过 contextActionManager 的提示链路，此处补齐反馈
                const op = String(evt.operation || '')
                    .trim()
                    .toLowerCase();
                const label =
                    op === 'set-visible' ? (evt.visible ? '显示' : '隐藏') : op === 'remove' ? '移除' : '导出';
                message?.success?.(`已批量${label} ${cesiumIds.length} 个三维图层`);
                if (!restIds.length) return;
                evt = { ...evt, layerIds: restIds };
            }
        }

        // Cesium 三维数据节点（id 前缀 cesium:）：直调元数据店，2D 链零参与
        if (handleCesiumLayerTreeAction(evt, cesiumLayersStore)) return;

        // 在线服务节点（id 前缀 rsvc: / 分组头）：直调注册表（服务显隐 + 子图层 LAYERS 组合）
        if (
            handleRemoteServiceTreeAction(evt, useRemoteServices(), {
                engine: props.activeEngine,
            })
        )
            return;

        // 文件夹级批量清空（绘制/上传/搜索/路线/区划等普通分组）：
        // 收集文件夹下全部叶子，逐个走既有 remove-layer 链路（HomeView 按类型分流删除）
        if (type === 'folder-clear-layers') {
            const leaves = layerStore
                .getLayerLeafNodesByFolder(evt.nodeId)
                .filter((leaf) => !String(leaf.id).startsWith(RSVC_NODE_PREFIX));
            if (!leaves.length) {
                message?.info?.(t('layer.nothingToClear'));
                return;
            }
            leaves.forEach((leaf) => emit('remove-layer', leaf.id));
            message?.success?.(t('layer.folderCleared', { n: leaves.length }));
            return;
        }

        const contextHandled = handleLayerTreeContextAction({
            evt,
            selectedLayerIds: multiSelectedLayerIds.value,
            availableLayerIds: availableLayerIds.value,
            addMultiSelectedLayer,
            removeMultiSelectedLayer,
            clearMultiSelectedLayers,
            setFolderRecursiveSelection,
            emit,
            message,
            openAttributeTable: deps.openAttributeTable,
            setStyleTarget: deps.setStyleTarget,
            copyLayerCoordinates: deps.copyLayerCoordinates,
            openManualAoiDialogByPoi: deps.openManualAoiDialogByPoi,
            onDragStart,
            onDrop,
            resolveLayerActionsById,
        });
        if (contextHandled) return;

        if (type === 'layer-selected') {
            // 图层行被选中，可用于高亮地图上的图层等操作
            emit('layer-selected', evt.layerId);
            return;
        }
        if (type === 'toggle-layer-visibility') {
            emit('toggle-layer-visibility', { layerId: evt.layerId, visible: !!evt.visible });
            return;
        }
        if (type === 'rename-layer') {
            emit('rename-layer', { layerId: evt.layerId, newName: evt.newName });
            return;
        }
        if (type === 'change-layer-opacity') {
            emit('change-layer-opacity', { layerId: evt.layerId, opacity: evt.opacity });
            return;
        }
        if (type === 'show-layer-properties') {
            const node = layerStore.findLayerTreeNodeById(evt.layerId);
            if (node) {
                uiState.propertiesDialogLayer.value = node;
                uiState.propertiesDialogVisible.value = true;
            }
            return;
        }
    }

    /** userLayers 变化 → 同步 store 并修剪失效多选项（TOCPanel 的 watch 转调） */
    function syncUserLayers(layers, overview) {
        layerStore.syncLayers(layers || [], overview || {});
        pruneMultiSelectedLayerIds();
    }

    return {
        multiSelectedLayerIds,
        availableLayerIds,
        resolveLayerActionsById,
        handleLayerTreeAction,
        onDragStart,
        onDrop,
        addMultiSelectedLayer,
        removeMultiSelectedLayer,
        clearMultiSelectedLayers,
        setFolderRecursiveSelection,
        syncUserLayers,
    };
}
