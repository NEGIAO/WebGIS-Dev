/**
 * drawMeasureSpec.ts — 绘制 / 测量类型的元数据与交互模型分类
 *
 * 单一职责：只描述「有哪些类型、每种类型怎么交互、最少几个点、能否编辑」，
 * 不含任何 Cesium 调用与 UI 文案（文案走 i18n，实体构建走 drawEntityFactory）。
 *
 * 交互模型三分类（决定状态机分支）：
 *   MULTI_CLICK  逐点取点，双击 / 右击 / 面板「完成」结束
 *   ANCHOR       首次点击定锚点（矩形角点 / 圆心），移动预览，二次点击确认
 *   TWO_POINT    只取两点，第二点落下即自动完成（测高距 / 方位角）
 *
 * 本文件同时是「可编辑类型」的唯一事实来源：管理器（顶点编辑）与
 * TOC 节点能力位（右键菜单是否出现「编辑要素」）都从此处取，避免两套白名单漂移。
 */

/** 绘制类（落图形，不一定出测量值） */
export type DrawType = 'Point' | 'LineString' | 'Polygon' | 'Rectangle' | 'Circle';

/** 测量类（必出测量值，且带专属几何辅助线） */
export type MeasureType = 'MeasureDistance' | 'MeasureArea' | 'MeasureHeight' | 'MeasureAzimuth';

/** 全部可交互类型 */
export type ShapeType = DrawType | MeasureType;

/** 非图形类动作（由管理器直接消费） */
export type CommandType = 'Clear' | 'UndoLastDrawing';

/** 交互模型（决定状态机分支） */
export type InteractionModel = 'single' | 'multi' | 'anchor' | 'two-point';

/** 成品几何形态：决定实体构造方式与测量项归属 */
export type ShapeKind = 'point' | 'line' | 'area' | 'height' | 'azimuth';

/** 类型元数据 */
export interface TypeMeta {
    /** 成品几何形态 */
    kind: ShapeKind;
    /** TOC 建档名前缀（绘制 / 测量） */
    prefix: string;
}

/** 绘制类（落图形，不一定出测量值） */
export const DRAW_TYPES: readonly DrawType[] = [
    'Point',
    'LineString',
    'Polygon',
    'Rectangle',
    'Circle',
];

/** 测量类（必出测量值，且带专属几何辅助线） */
export const MEASURE_TYPES: readonly MeasureType[] = [
    'MeasureDistance',
    'MeasureArea',
    'MeasureHeight',
    'MeasureAzimuth',
];

/** 全部可交互类型 */
export const SHAPE_TYPES: readonly ShapeType[] = [...DRAW_TYPES, ...MEASURE_TYPES];

/** 两点即完成（无需双击 / 右击） */
export const TWO_POINT_TYPES: ReadonlySet<string> = new Set(['MeasureHeight', 'MeasureAzimuth']);

/** 锚点两点式（首点定锚，次点确认） */
export const ANCHOR_TYPES: ReadonlySet<string> = new Set(['Rectangle', 'Circle']);

/** 逐点式 */
export const MULTI_CLICK_TYPES: ReadonlySet<string> = new Set([
    'LineString',
    'Polygon',
    'MeasureDistance',
    'MeasureArea',
]);

/**
 * 支持顶点编辑的类型。
 * 测高距 / 方位角的载荷含派生几何（三角形顶点、正北参考点），
 * 改顶点需重算整条派生链，暂不开放；矩形 / 圆由「角点 / 圆心 + 半径」定义，
 * 顶点列表不是独立自由度，拖点会与载荷语义冲突。
 */
export const EDITABLE_TYPES: ReadonlySet<string> = new Set([
    'Point',
    'LineString',
    'Polygon',
    'MeasureDistance',
    'MeasureArea',
]);

/** 逐点式的最小取点数 */
export const MIN_POINTS: Readonly<Partial<Record<ShapeType, number>>> = {
    LineString: 2,
    MeasureDistance: 2,
    Polygon: 3,
    MeasureArea: 3,
};

/**
 * 类型别名：OL 侧沿用 `CircleOutline`，3D 侧统一叫 `Circle`。
 * 保留别名可让 HomeView 的引擎路由对两套命名无感。
 */
export const TYPE_ALIASES: Readonly<Record<string, string>> = {
    CircleOutline: 'Circle',
};

/** 类型元数据：kind 决定成品实体形态与测量项归属 */
export const TYPE_META: Readonly<Record<string, TypeMeta>> = {
    Point: { kind: 'point', prefix: '绘制' },
    LineString: { kind: 'line', prefix: '绘制' },
    Polygon: { kind: 'area', prefix: '绘制' },
    Rectangle: { kind: 'area', prefix: '绘制' },
    Circle: { kind: 'area', prefix: '绘制' },
    MeasureDistance: { kind: 'line', prefix: '测量' },
    MeasureArea: { kind: 'area', prefix: '测量' },
    MeasureHeight: { kind: 'height', prefix: '测量' },
    MeasureAzimuth: { kind: 'azimuth', prefix: '测量' },
};

/** 面板上的中文短名（TOC 建档名用；TOC 本身不参与 i18n） */
export const TYPE_SHORT_LABELS: Readonly<Record<string, string>> = {
    Point: '点',
    LineString: '线',
    Polygon: '面',
    Rectangle: '矩形',
    Circle: '圆',
    MeasureDistance: '距离',
    MeasureArea: '面积',
    MeasureHeight: '高距',
    MeasureAzimuth: '方位角',
};

/** 非图形类动作（由管理器直接消费） */
export const COMMAND_TYPES: ReadonlySet<string> = new Set(['Clear', 'UndoLastDrawing']);

/**
 * 归一化外部传入的类型名（兼容 OL 命名与大小写差异）。
 * @param type 外部类型名
 * @returns 归一化后的类型名；无法识别时返回空串
 */
export function normalizeType(type: unknown): string {
    const raw = String(type || '').trim();
    if (!raw) return '';
    const alias = TYPE_ALIASES[raw] || raw;
    if (SHAPE_TYPES.includes(alias as ShapeType) || COMMAND_TYPES.has(alias)) return alias;
    return '';
}

/**
 * 取某类型的交互模型。
 * @param type 已归一化的类型名
 * @returns 交互模型；未知类型返回 null
 */
export function interactionModelOf(type: string): InteractionModel | null {
    if (type === 'Point') return 'single';
    if (TWO_POINT_TYPES.has(type)) return 'two-point';
    if (ANCHOR_TYPES.has(type)) return 'anchor';
    if (MULTI_CLICK_TYPES.has(type)) return 'multi';
    return null;
}
