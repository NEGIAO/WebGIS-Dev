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
 * 读取动作载荷字段：TOCTreeItem.emitAction 会平铺到顶层，
 * 而 menu/commandDispatcher 产出的是 { type, payload:{...} } 形态，两种都要兼容。
 * @param {object} evt 动作事件
 * @param {string} key 字段名
 * @returns {*} 顶层优先，其次 payload
 */
function readPayloadField(evt, key) {
    if (evt && evt[key] !== undefined) return evt[key];
    return evt?.payload?.[key];
}

/**
 * 处理 Cesium 节点动作
 * @param {object} evt - TOCTreeItem 冒泡的动作事件 { type, layerId?, nodeId?, payload?, ... }
 * @param {object} cesiumStore - useCesiumLayersStore() 实例
 * @returns {boolean} true = 已消费（调用方直接 return）；false = 交回通用分发器
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
            cesiumStore.setVisible(id, !!readPayloadField(evt, 'visible'));
            return true;
        case 'change-layer-opacity':
            cesiumStore.setOpacity(id, Number(readPayloadField(evt, 'opacity')));
            return true;
        case 'rename-layer':
            cesiumStore.rename(id, readPayloadField(evt, 'newName') ?? readPayloadField(evt, 'name') ?? '');
            return true;
        case 'zoom-layer':
        case 'view-layer':
            cesiumStore.flyTo(id);
            return true;
        case 'remove-layer':
            cesiumStore.remove(id);
            return true;
        case 'solo-layer':
            // 仅显示此图层：元数据店广播显隐，其它图层全部隐藏
            cesiumStore.solo?.(id);
            return true;
        case 'toggle-layer-label-visibility':
            cesiumStore.setLabelVisible?.(id, !!readPayloadField(evt, 'visible'));
            return true;
        case 'copy-layer-coordinates':
            cesiumStore.copyCoordinates?.(id);
            return true;
        case 'export-layer-data':
            cesiumStore.exportData?.(id, String(readPayloadField(evt, 'format') || 'geojson'));
            return true;
        case 'data-set-height':
            cesiumStore.setBaseHeight(id, Number(readPayloadField(evt, 'height') ?? 0));
            return true;
        case 'data-set-material':
            cesiumStore.setMaterialMode(id, String(readPayloadField(evt, 'mode') || 'none'));
            return true;
        case 'data-reposition':
            // 打开 GLTF 坐标弹窗（弹窗 UI 挂在 CesiumContainer，由 adapter 触发）
            cesiumStore.requestReposition?.(id);
            return true;
        case 'data-stretch-height':
            // GeoTIFF 单波段拉伸至高程
            cesiumStore.requestStretchHeight?.(id);
            return true;
        case 'terrain-fit':
            // 贴合地形：按类型分派（矢量 clamp / 3D Tiles 配准 / glTF 相对地形），异步
            void cesiumStore.fitToTerrain?.(id);
            return true;
        case 'terrain-fit-view':
            // 区域化贴合：只用当前视野内的基底采样估算偏移（大面积/大起伏首选）
            void cesiumStore.fitToTerrainInView?.(id);
            return true;
        case 'terrain-reset':
            // 恢复数据自带原始高程
            cesiumStore.resetTerrainFit?.(id);
            return true;
        case 'open-attribute-table':
            // 属性表：3D 侧为只读表格，UI 由 CesiumContainer 承载
            cesiumStore.requestAttributeTable?.(id);
            return true;
        case 'edit-layer':
            // 要素编辑：仅绘制成品可编辑（顶点拖拽），导入数据只读
            cesiumStore.editFeature?.(id);
            return true;
        // 2D 专属能力：3D 侧无实现（菜单里已按 actions 关闭，不会出现；此处兜底吞掉）
        case 'layer-selected':
        case 'toggle-layer-crs':
        case 'toggle-search-layer-crs':
        case 'import-to-3d':
            return true;
        default:
            // 其余动作交回通用分发器。
            // 历史实现此处 default: true，导致 cesium 节点的所有新动作（如 set-style-target
            // 打开样式页签）被静默吞掉——「右键没反应」的根因之一。
            return false;
    }
}
