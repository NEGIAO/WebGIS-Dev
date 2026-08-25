/**
 * remoteServiceNodeBuilder.ts
 * 在线服务注册表记录 → TOC 树节点映射。
 *
 * 结构：服务节点 = folder，其下每个可选子图层 = 叶子 checkbox
 * （勾选组合驱动 LAYERS 参数；服务级 checkbox 控制整体显隐）。
 *
 * id 约定：
 *   服务节点   rsvc:<id>
 *   子图层节点 rsvc:<id>:L:<encodeURIComponent(name)>
 * 记录为空时返回空数组 —— 分组自动消失。
 */

import type { RemoteServiceRecord } from './remoteServices';
import { RSVC_NODE_PREFIX, RSVC_GROUP_NODE_ID } from './remoteServices';

/** kind → 展示元信息（layerType / 格式标签），服务节点与子图层叶子共用 */
const KIND_META: Record<string, { layerType: string; formatLabel: string }> = {
    wms: { layerType: 'wms', formatLabel: 'WMS' },
    arcgis: { layerType: 'arcgis-rest', formatLabel: 'ArcGIS 切片' },
    xyz: { layerType: 'xyz-tiles', formatLabel: 'XYZ 瓦片' },
    wmts: { layerType: 'wmts', formatLabel: 'WMTS' },
};

function kindMeta(record: RemoteServiceRecord) {
    return (
        KIND_META[record.kind]
        || { layerType: record.kind, formatLabel: String(record.kind).toUpperCase() }
    );
}

function sublayerLeafNodeId(recordId: string, layerName: string): string {
    return `${RSVC_NODE_PREFIX}${recordId}:L:${encodeURIComponent(layerName)}`;
}

/**
 * 子图层展示顺序：与视觉叠放一致（列表上方 = 视觉上层）。
 * layerOrder 头部 = 视觉上层 → 直接作为 children 顺序；未入序者按 sublayers 声明顺序排在末尾。
 */
function orderedSublayers(record: RemoteServiceRecord): RemoteServiceRecord['sublayers'] {
    const subs = record.sublayers || [];
    const order = record.layerOrder || [];
    const ordered = order
        .map((name) => subs.find((sub) => sub.name === name))
        .filter(Boolean);
    const rest = subs.filter((sub) => !order.includes(sub.name));
    return [...ordered, ...rest];
}

/** 单条记录 → TOC folder 节点（children = 子图层叶子，按视觉叠放顺序排列） */
function toRemoteServiceNode(record: RemoteServiceRecord, expandedState: Record<string, boolean> = {}): any {
    const nodeId = `${RSVC_NODE_PREFIX}${record.id}`;

    // 子图层叶子：无声明（v1 记录/tiles 模式）时保持纯 folder 无 children；
    // 有声明时按视觉叠放顺序排列，勾选叶子可拖拽调整 LAYERS 叠放次序
    const hasSublayerOrdering = record.kind === 'wms' || (record.kind === 'arcgis' && record.tileMode !== 'tiles');
    const children = orderedSublayers(record).map((sub) => {
        const checked = (record.selectedIds || []).includes(sub.name);
        const leafId = sublayerLeafNodeId(record.id, sub.name);
        return {
            id: leafId,
            name: sub.label || sub.title || sub.name,
            displayName: sub.label || sub.title || sub.name,
            type: 'layer',
            visible: checked,
            children: [],
            expanded: false,
            level: 2,
            featureCount: 0,
            labelVisible: false,
            showCheckbox: true,
            engine: 'ol',
            sourceType: 'remote-service-sublayer',
            layerType: kindMeta(record).layerType,
            format: record.tileMode === 'tiles' ? kindMeta(record).formatLabel : kindMeta(record).formatLabel,
            opacity: 1,
            supportsOpacity: false,
            selected: false,
            parentId: nodeId,
            // LAYERS 组合语义的子图层可拖拽调整叠放次序（xyz/wmts/tiles 无组合概念，禁拖）
            draggable: hasSublayerOrdering,
            droppable: hasSublayerOrdering,
            actions: {
                // ArcGIS 动态子层：右键直接打开该子层自己的属性表（精确到单层）
                attribute: record.kind === 'arcgis' && record.queryable === true,
                zoom: true,
                zoomEvent: 'zoom-layer',
                zoomPayload: { layerId: leafId },
                // 每个子图层叶子都可"移除"（= 从 LAYERS 组合中取消叠加）
                remove: true,
                removeTip: '取消叠加',
                removeEvent: 'remove-layer',
                removePayload: { layerId: leafId },
            },
        };
    });

    return {
        id: nodeId,
        name: record.title || record.url,
        displayName: record.layerLabel ? `${record.title} · ${record.layerLabel}` : record.title || record.url,
        type: 'folder',
        visible: record.visible !== false,
        children,
        // 尊重 TOC 展开态存储：用户折叠/展开后由 setLayerTreeFolderExpanded 持久到本映射
        expanded: expandedState[nodeId] !== false,
        level: 1,
        featureCount: 0,
        labelVisible: false,
        showCheckbox: true,
        engine: 'ol',
        sourceType: 'remote-service',
        layerType: kindMeta(record).layerType,
        format: kindMeta(record).formatLabel,
        opacity: Number.isFinite(record.opacity) ? record.opacity : 1,
        supportsOpacity: true,
        selected: false,
        parentId: RSVC_GROUP_NODE_ID,
        // 服务节点可拖拽：调整与其它在线服务的整体叠放次序（头部 = 视觉上层）
        draggable: true,
        droppable: true,
        actions: {
            // ArcGIS 动态服务（Query 能力）支持拉取属性表；点选查询（identify）另行常驻
            attribute: record.kind === 'arcgis' && record.queryable === true,
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
            removeTip: '移除服务',
            viewEvent: '',
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
 * 构建「在线服务」分组节点（0 条记录返回空数组，分组不出现）
 */
export function buildRemoteServiceGroup(
    records: RemoteServiceRecord[] = [],
    expandedState: Record<string, boolean> = {},
): any[] {
    if (!records.length) return [];

    const children = records.map((record) => toRemoteServiceNode(record, expandedState));
    const visibleCount = children.filter((node) => node.visible).length;

    return [{
        id: RSVC_GROUP_NODE_ID,
        name: `在线服务 (${records.length})`,
        displayName: `在线服务 (${records.length})`,
        type: 'folder',
        visible: visibleCount === children.length,
        indeterminate: visibleCount > 0 && visibleCount < children.length,
        children,
        expanded: expandedState[RSVC_GROUP_NODE_ID] !== false,
        showCheckbox: children.length > 0,
    }];
}
