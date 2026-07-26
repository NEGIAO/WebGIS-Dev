/**
 * 高级 2D 绘制工具注册表
 * 统一维护绘制/编辑工具元数据、默认样式参数与类型判断。
 */

/** 默认绘制样式参数（要素级 styleParams） */
export const DEFAULT_DRAWING_STYLE_PARAMS = Object.freeze({
    strokeColor: '#27AE60',
    strokeWidth: 2,
    strokeOpacity: 1,
    strokeDashType: 'solid',
    dashLength: 8,
    dashGap: 4,
    fillColor: '#27AE60',
    fillOpacity: 0.2,
    radius: 6,
    arrowScale: 1,
    arrowHeadWidth: 5,
    gradientStartColor: '#E74C3C',
    gradientEndColor: '#F39C12',
    gradientStartOpacity: 0.7,
    gradientEndOpacity: 0.15,
});

/** 预设色板（匹配 WebGIS 品牌与 basemap 常用色） */
export const DRAWING_PRESET_COLORS = Object.freeze([
    '#27AE60',
    '#2980B9',
    '#E74C3C',
    '#F1C40F',
    '#9B59B6',
    '#1ABC9C',
    '#E67E22',
    '#000000',
    '#FFFFFF',
]);

/**
 * 全部绘制/编辑工具定义
 * group: basic | shape | arrow | edit
 */
export const DRAWING_TOOLS = Object.freeze([
    {
        type: 'Point',
        label: '点',
        group: 'basic',
        hint: '单击地图放置点标记',
        olDrawType: 'Point',
        geomType: 'Point',
    },
    {
        type: 'LineString',
        label: '线',
        group: 'basic',
        hint: '单击地图绘制折线，双击结束',
        olDrawType: 'LineString',
        geomType: 'LineString',
    },
    {
        type: 'Polygon',
        label: '面',
        group: 'basic',
        hint: '单击地图绘制多边形，双击结束',
        olDrawType: 'Polygon',
        geomType: 'Polygon',
    },
    {
        type: 'Rectangle',
        label: '矩形',
        group: 'shape',
        hint: '按住拖拽绘制矩形',
        olDrawType: 'Circle',
        geomType: 'Polygon',
        advanced: true,
    },
    {
        type: 'Ellipse',
        label: '椭圆',
        group: 'shape',
        hint: '按住拖拽绘制椭圆',
        olDrawType: 'Circle',
        geomType: 'Polygon',
        advanced: true,
    },
    {
        type: 'CircleOutline',
        label: '圆',
        group: 'shape',
        hint: '按住拖拽绘制圆轮廓',
        olDrawType: 'Circle',
        geomType: 'Circle',
        advanced: true,
    },
    {
        type: 'Arrow',
        label: '箭头',
        group: 'arrow',
        hint: '绘制折线，末端自动生成箭头',
        olDrawType: 'LineString',
        geomType: 'LineString',
        advanced: true,
    },
    {
        type: 'WindArrow',
        label: '风向',
        group: 'arrow',
        hint: '绘制路径，生成平滑风向箭头',
        olDrawType: 'LineString',
        geomType: 'LineString',
        advanced: true,
    },
    {
        type: 'BattleArrow',
        label: '军标',
        group: 'arrow',
        hint: '绘制路径，生成军标攻击箭头',
        olDrawType: 'LineString',
        geomType: 'LineString',
        advanced: true,
    },
    {
        type: 'SelectEdit',
        label: '选择编辑',
        group: 'edit',
        hint: '点击绘制图层要素后可拖动顶点修改',
        olDrawType: null,
        geomType: null,
        edit: true,
    },
]);

const TOOL_MAP = Object.freeze(
    DRAWING_TOOLS.reduce((acc, tool) => {
        acc[tool.type] = tool;
        return acc;
    }, {}),
);

/**
 * 按类型获取工具定义
 * @param {string} type
 * @returns {Object|null}
 */
export function getDrawingTool(type) {
    return TOOL_MAP[type] || null;
}

/**
 * 是否为高级绘制类型（非基础点线面/测量/编辑）
 * @param {string} type
 * @returns {boolean}
 */
export function isAdvancedDrawingType(type) {
    return !!TOOL_MAP[type]?.advanced;
}

/**
 * 是否为基础绘制类型
 * @param {string} type
 * @returns {boolean}
 */
export function isBasicDrawingType(type) {
    return TOOL_MAP[type]?.group === 'basic';
}

/**
 * 是否为箭头类工具
 * @param {string} type
 * @returns {boolean}
 */
export function isArrowTool(type) {
    return TOOL_MAP[type]?.group === 'arrow';
}

/**
 * 是否为军标箭头
 * @param {string} type
 * @returns {boolean}
 */
export function isBattleArrowTool(type) {
    return type === 'BattleArrow';
}

/**
 * 是否为选择编辑工具
 * @param {string} type
 * @returns {boolean}
 */
export function isSelectEditTool(type) {
    return type === 'SelectEdit';
}

/**
 * 是否支持填充控制
 * @param {string} type
 * @returns {boolean}
 */
export function hasFill(type) {
    return ['Polygon', 'Rectangle', 'Ellipse', 'WindArrow'].includes(type);
}

/**
 * 是否支持半径控制
 * @param {string} type
 * @returns {boolean}
 */
export function hasRadius(type) {
    return type === 'Point' || type === 'CircleOutline';
}

/**
 * 是否显示边线类型（实线/虚线）
 * @param {string} type
 * @returns {boolean}
 */
export function hasStrokeDash(type) {
    return type && type !== 'Point' && type !== 'CircleOutline' && type !== 'SelectEdit';
}

/**
 * 获取 OpenLayers Draw interaction 的 type
 * @param {string} type
 * @returns {string|null}
 */
export function getOpenLayersDrawType(type) {
    return TOOL_MAP[type]?.olDrawType || null;
}

/**
 * 获取中文图层名片段
 * @param {string} type
 * @returns {string}
 */
export function getDrawingTypeLabel(type) {
    return TOOL_MAP[type]?.label || type || '图形';
}

/**
 * 获取工具提示文案
 * @param {string} type
 * @returns {string}
 */
export function getDrawingHint(type) {
    return TOOL_MAP[type]?.hint || '选择绘制类型后在地图上操作';
}

/**
 * 归一化绘制样式参数
 * @param {Object} [params]
 * @returns {Object}
 */
export function normalizeDrawingStyleParams(params = {}) {
    const base = { ...DEFAULT_DRAWING_STYLE_PARAMS, ...(params || {}) };
    return {
        strokeColor: String(base.strokeColor || DEFAULT_DRAWING_STYLE_PARAMS.strokeColor),
        strokeWidth: Math.max(0.5, Number(base.strokeWidth ?? 2)),
        strokeOpacity: clamp01(base.strokeOpacity, 1),
        strokeDashType: base.strokeDashType === 'dashed' ? 'dashed' : 'solid',
        dashLength: Math.max(1, Number(base.dashLength ?? 8)),
        dashGap: Math.max(1, Number(base.dashGap ?? 4)),
        fillColor: String(base.fillColor || DEFAULT_DRAWING_STYLE_PARAMS.fillColor),
        fillOpacity: clamp01(base.fillOpacity, 0.2),
        radius: Math.max(1, Number(base.radius ?? 6)),
        arrowScale: Math.max(0.2, Number(base.arrowScale ?? 1)),
        arrowHeadWidth: Math.max(1, Number(base.arrowHeadWidth ?? 5)),
        gradientStartColor: String(
            base.gradientStartColor || DEFAULT_DRAWING_STYLE_PARAMS.gradientStartColor,
        ),
        gradientEndColor: String(
            base.gradientEndColor || DEFAULT_DRAWING_STYLE_PARAMS.gradientEndColor,
        ),
        gradientStartOpacity: clamp01(base.gradientStartOpacity, 0.7),
        gradientEndOpacity: clamp01(base.gradientEndOpacity, 0.15),
    };
}

/**
 * 将要素级样式参数映射为托管图层 styleConfig（兼容现有图层级样式）
 * @param {Object} params
 * @returns {Object}
 */
export function toManagedStyleConfig(params = {}) {
    const normalized = normalizeDrawingStyleParams(params);
    return {
        fillColor: normalized.fillColor,
        fillOpacity: normalized.fillOpacity,
        strokeColor: normalized.strokeColor,
        strokeWidth: normalized.strokeWidth,
        pointRadius: normalized.radius,
    };
}

/**
 * 按分组获取工具列表
 * @param {string} group
 * @returns {Object[]}
 */
export function getDrawingToolsByGroup(group) {
    return DRAWING_TOOLS.filter((tool) => tool.group === group);
}

/**
 * 限制 0~1
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function clamp01(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(1, Math.max(0, num));
}
