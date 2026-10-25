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
import { isCesiumStyleSupportedType, isCesiumVectorType } from './cesiumLayers';
import { getGroundCapability } from '../composables/terrain/groundPlacementCapabilities';
import { EDITABLE_TYPES } from '../composables/draw/drawMeasureSpec';

/** TOC 节点 id 前缀（动作分流依据） */
export const CESIUM_NODE_PREFIX = 'cesium:';

/** 「三维数据」分组节点 id（展开态持久化键） */
export const CESIUM_GROUP_NODE_ID = 'cesium-data-group';

/** 类型 → 展示标签 */
const TYPE_LABELS: Record<string, string> = {
    geojson: 'GeoJSON',
    kml: 'KML',
    kmz: 'KMZ',
    czml: 'CZML',
    shp: 'SHP',
    tif: 'GeoTIFF',
    gltf: '模型',
    '3dtiles': '3D Tiles',
    imagery: '影像',
    terrain: '地形',
    draw: '绘制',
    route: '路线',
    wayline: '航线',
};

/** 单条记录 → TOC layer 节点（形状对齐 toLayerNode 输出） */
function toCesiumLayerNode(record: CesiumLayerRecord): any {
    const nodeId = `${CESIUM_NODE_PREFIX}${record.id}`;
    const is3DTiles = record.type === '3dtiles';
    const isGltf = record.type === 'gltf';
    const isTif = record.type === 'tif';
    /**
     * 能力判定按「类型语义」而非「引擎」：
     * - 矢量类（geojson/kml/kmz/czml/shp/wayline/draw/route）→ 可改样式、可切标注、可导坐标
     * - 栅格 / 模型 / 3D Tiles → 无填充色语义，外观由透明度与材质模式承载
     * 属性表 / 要素编辑 / 坐标系转换 / AOI 面板为 2D 专属，3D 侧无实现，保持关闭
     * （菜单不出现，避免「点了没反应」）。
     */
    const styleSupported = isCesiumStyleSupportedType(record.type);
    const vector = isCesiumVectorType(record.type);
    /**
     * 贴地能力统一取自 `groundPlacementCapabilities`（单一事实来源），
     * 不再在此手写 if (is3DTiles) / if (isGltf) —— 新增类型只改能力表 + 策略即可。
     */
    const groundCap = getGroundCapability(record.type);
    const supportsFit = groundCap?.supportsFit === true;
    const supportsReset = groundCap?.supportsReset === true;
    const supportsOffset = groundCap?.supportsOffset === true;
    // 3D Tiles 的值域由基底采样回填 record.heightRange；glTF 用能力表里的静态值域
    const offsetRange = is3DTiles ? record.heightRange : groundCap?.offsetRange;

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
        labelVisible: record.labelVisible === true,
        showCheckbox: true,
        engine: 'cesium',
        sourceType:
            record.category === 'draw'
                ? 'cesium-draw'
                : record.category === 'route'
                  ? 'cesium-route'
                  : 'cesium-data',
        layerType: record.type,
        format: TYPE_LABELS[record.type] || record.type,
        opacity: Number.isFinite(record.opacity) ? record.opacity : 1,
        supportsOpacity: record.supportsOpacity === true,
        selected: false,
        parentId: CESIUM_GROUP_NODE_ID,
        draggable: false,
        droppable: false,
        // 扩展能力标记（供 TOC 右键菜单渲染条件控件）
        heightRange: supportsOffset ? offsetRange ?? undefined : undefined,
        // 滑杆值统一取 store 的 baseHeight：3D Tiles 为基座海拔、glTF 为相对地形偏移，
        // 二者都由 CesiumContainer 的导入投影写入，节点构建不再关心类型差异
        baseHeight: supportsOffset && Number.isFinite(record.baseHeight) ? record.baseHeight : 0,
        materialMode: record.materialMode ?? undefined,
        actions: {
            // 属性表：矢量类可读 entity.properties（只读表格 + 行定位）
            attribute: vector,
            // 要素编辑：仅「有独立顶点自由度」的绘制成品（判据与管理器共用 EDITABLE_TYPES）；
            // 矩形 / 圆 / 测高距 / 方位角无此自由度，菜单不出现，避免「点了提示不支持」
            edit: record.category === 'draw' && EDITABLE_TYPES.has(String(record.shapeType || '')),
            style: styleSupported,
            label: vector,
            copyCoordinates: vector,
            toggleLayerCRS: false,
            exportLayerData: vector,
            canExportCSV: vector,
            canExportTXT: vector,
            canExportGeoJSON: vector,
            // KML 导出已由 cesiumLayerSerialization.buildKML 提供（统一 2.2 样式）
            canExportKML: vector,
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
            // 仅显示此图层：由 cesiumTocActions 在元数据店层广播显隐，无需引擎专属实现
            soloEvent: 'solo-layer',
            soloPayload: { layerId: nodeId },
            // 高程调节：由能力表声明（3D Tiles 基座海拔 / glTF 相对地形偏移，共用滑杆）
            setHeight: supportsOffset,
            setMaterial: is3DTiles,
            // 地形贴合：由能力表声明（矢量 clamp / 3D Tiles 配准 / glTF 相对地形）
            fitTerrain: supportsFit,
            // 区域化贴合仅对 3D Tiles 有意义（按视野内基底采样估算，缓解大面积/大起伏失配）
            fitTerrainInView: supportsFit && record.type === '3dtiles',
            resetTerrain: supportsReset,
            // GLTF 独有：重定位
            reposition: isGltf,
            // TIF 独有：拉伸
            stretchHeight: isTif,
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
        // 组头右键能力：清空全部三维数据（folder-clear-layers 由 cesiumTocActions 消费）
        actions: {
            remove: records.length > 0,
            removeTip: '清空全部数据',
        },
    }];
}
