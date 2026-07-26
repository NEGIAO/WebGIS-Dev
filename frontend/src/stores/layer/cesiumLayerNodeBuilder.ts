/**
 * cesiumLayerNodeBuilder.ts
 * Cesium 元数据记录 → TOC 树节点映射（统一图层管理·第二步）。
 *
 * 对齐 layerTreeBuilder.toLayerNode 的节点契约：id 加 `cesium:` 前缀供
 * 动作分流识别；actions 只开 zoom/remove（+ 内建的显隐/透明度/重命名），
 * 属性表/样式/编辑/导出等 2D 专属能力全部关闭。
 * 记录为空时返回空数组 —— 容器卸载即清档，分组自动消失（2D 模式天然隐藏）。
 */

import type { CesiumLayerRecord } from './cesiumLayers';

/** TOC 节点 id 前缀（动作分流依据） */
export const CESIUM_NODE_PREFIX = 'cesium:';

/** 「三维数据」分组节点 id（展开态持久化键） */
export const CESIUM_GROUP_NODE_ID = 'cesium-data-group';

/** 类型 → 展示标签 */
const TYPE_LABELS: Record<string, string> = {
    geojson: 'GeoJSON',
    kml: 'KML',
    czml: 'CZML',
    shp: 'SHP',
    tif: 'GeoTIFF',
    gltf: '模型',
    '3dtiles': '3D Tiles',
};

/** 单条记录 → TOC layer 节点（形状对齐 toLayerNode 输出） */
function toCesiumLayerNode(record: CesiumLayerRecord): any {
    const nodeId = `${CESIUM_NODE_PREFIX}${record.id}`;
    return {
        id: nodeId,
        name: record.name,
        displayName: record.name,
        type: 'layer',
        visible: record.visible !== false,
        children: [],
        expanded: false,
        level: 1,
        featureCount: 0,
        labelVisible: false,
        showCheckbox: true,
        engine: 'cesium',
        sourceType: 'cesium-data',
        layerType: record.type,
        format: TYPE_LABELS[record.type] || record.type,
        opacity: Number.isFinite(record.opacity) ? record.opacity : 1,
        supportsOpacity: record.supportsOpacity === true,
        selected: false,
        parentId: CESIUM_GROUP_NODE_ID,
        draggable: false,
        droppable: false,
        actions: {
            attribute: false,
            edit: false,
            style: false,
            label: false,
            copyCoordinates: false,
            toggleLayerCRS: false,
            exportLayerData: false,
            canExportCSV: false,
            canExportTXT: false,
            canExportGeoJSON: false,
            canExportKML: false,
            openAoiPanel: false,
            zoom: true,
            remove: true,
            removeTip: '移除',
            viewEvent: 'view-layer',
            viewPayload: { layerId: nodeId },
            zoomEvent: 'zoom-layer',
            zoomPayload: { layerId: nodeId },
            removeEvent: 'remove-layer',
            removePayload: { layerId: nodeId },
            soloEvent: '',
            soloPayload: { layerId: nodeId },
        },
    };
}

/**
 * 构建「三维数据」分组节点（0 条记录返回空数组，分组不出现）
 * @param records - cesiumLayers store 的元数据记录
 * @param expandedState - TOC 展开态映射（复用 layerStore.layerTreeExpandedState）
 */
export function buildCesiumDataGroup(
    records: CesiumLayerRecord[] = [],
    expandedState: Record<string, boolean> = {},
): any[] {
    if (!records.length) return [];

    const children = records.map(toCesiumLayerNode);
    const visibleCount = children.filter((node) => node.visible).length;

    return [{
        id: CESIUM_GROUP_NODE_ID,
        name: `三维数据 (${records.length})`,
        displayName: `三维数据 (${records.length})`,
        type: 'folder',
        visible: visibleCount === children.length,
        indeterminate: visibleCount > 0 && visibleCount < children.length,
        children,
        expanded: expandedState[CESIUM_GROUP_NODE_ID] !== false,
        showCheckbox: children.length > 0,
    }];
}
