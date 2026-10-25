/**
 * groundPlacementCapabilities.ts — 贴地能力的**唯一事实来源**（纯数据 + 类型，零运行时依赖）
 *
 * 为什么单独成文件：
 * - TOC 节点构建（`cesiumLayerNodeBuilder`）与样式页签只关心「这个类型能不能贴地 / 有没有高程滑杆」，
 *   不需要把 3D Tiles 配准、DataSource 遍历等重实现拖进主包；
 * - 策略实现（`strategies/*`）只提供行为，能力元数据统一从这里取，
 *   避免「菜单说有、实现没有」的漂移。
 *
 * 新增数据类型的接入成本：本文件加一条能力 + 写一个策略 + 注册一行。
 */

/** 贴地模式 */
export const GROUND_MODE = {
    /** 导入即自动贴地（矢量 / glTF） */
    AUTO: 'auto',
    /** 需用户显式触发（3D Tiles 配准依赖采样，失败要让用户重试） */
    MANUAL: 'manual',
    /** 无高程语义（tif / imagery） */
    NONE: 'none',
} as const;

export type GroundMode = (typeof GROUND_MODE)[keyof typeof GROUND_MODE];

/** 统一结果原因码（宿主据此给不同提示，禁止静默） */
export const GROUND_REASON = {
    OK: 'ok',
    UNSUPPORTED: 'unsupported',
    TERRAIN_OFF: 'terrain-off',
    NO_HANDLE: 'no-handle',
    SAMPLE_FAILED: 'sample-failed',
    DEFERRED: 'deferred',
    NO_ADAPTER: 'no-adapter',
} as const;

export type GroundReason = (typeof GROUND_REASON)[keyof typeof GROUND_REASON];

/** 贴地能力描述 */
export interface GroundCapability {
    /** 负责的数据类型 */
    types: string[];
    /** 贴地模式 */
    mode: GroundMode;
    /** 能否「贴合地形」 */
    supportsFit: boolean;
    /** 能否「恢复原始高程」 */
    supportsReset: boolean;
    /** 是否提供高程偏移（TOC 高程滑杆） */
    supportsOffset: boolean;
    /** 高程滑杆值域（米）；3D Tiles 为运行时采样值，故不声明 */
    offsetRange?: { min: number; max: number };
    /** true = 滑杆值取自 record（3D Tiles 的 currentBaseHeight / glTF 的 modelHeightOffset） */
    offsetFromRecord?: boolean;
}

/** 策略执行上下文 */
export interface GroundCtx {
    /** loadedDataSources 记录（含 id / type / entity / tilesetGeo 等） */
    record: any;
    viewer: any;
    Cesium: any;
    /** 3D Tiles 高程滑杆需要数据导入层的 setTilesetHeight 记账 */
    dataImport?: any;
}

/** 统一结果 */
export interface GroundResult {
    ok: boolean;
    reason: GroundReason;
    detail?: any;
}

/** 策略契约：只提供行为，能力从能力表取 */
export interface GroundStrategy {
    types: string[];
    fit: (ctx: GroundCtx) => Promise<GroundResult>;
    reset: (ctx: GroundCtx) => GroundResult;
    setOffset?: (ctx: GroundCtx, meters: number | null) => GroundResult;
    getOffset?: (ctx: GroundCtx) => number;
}

/** 构造成功结果 */
export function groundOk(detail?: any): GroundResult {
    return { ok: true, reason: GROUND_REASON.OK, detail };
}

/** 构造失败结果 */
export function groundFail(reason: GroundReason, detail?: any): GroundResult {
    return { ok: false, reason, detail };
}

/**
 * 能力表。
 * 每条声明「哪些类型 + 能做什么」，`mode: none` 表示不参与导入贴地链路。
 */
const CAPABILITIES: GroundCapability[] = [
    {
        types: ['geojson', 'kml', 'kmz', 'czml', 'shp', 'wayline'],
        mode: GROUND_MODE.AUTO,
        supportsFit: true,
        supportsReset: true,
        supportsOffset: false,
    },
    {
        types: ['3dtiles'],
        mode: GROUND_MODE.MANUAL,
        supportsFit: true,
        supportsReset: true,
        supportsOffset: true,
        offsetFromRecord: true,
        // 3D Tiles 的滑杆值域由基底采样回填到 record.heightRange，此处不给静态值
    },
    {
        types: ['gltf'],
        mode: GROUND_MODE.AUTO,
        supportsFit: true,
        supportsReset: true,
        supportsOffset: true,
        offsetFromRecord: true,
        // 「相对地形的高度偏移」保守值域：用于修正原点在几何中心的模型半截入土
        offsetRange: { min: -20, max: 200 },
    },
    {
        types: ['draw', 'route'],
        // 引擎内生成物自身已贴地（classificationType / clampToGround），不参与导入贴地链路
        mode: GROUND_MODE.NONE,
        supportsFit: false,
        supportsReset: false,
        supportsOffset: false,
    },
];

/** type → capability 索引 */
const INDEX = new Map<string, GroundCapability>();
CAPABILITIES.forEach((capability) => {
    capability.types.forEach((type) => INDEX.set(type, capability));
});

/**
 * 取某类型的能力描述。
 * @param type 数据类型（geojson / 3dtiles / gltf / draw …）
 * @returns 未登记类型返回 null（调用方据此不渲染相关菜单）
 */
export function getGroundCapability(type: string): GroundCapability | null {
    return INDEX.get(String(type || '')) || null;
}

/** 该类型是否登记了贴地能力 */
export function isGroundPlacementType(type: string): boolean {
    return INDEX.has(String(type || ''));
}

/**
 * 矢量类「加载期官方贴地」选项。
 * 决策权归策略（本模块），loader 只消费——避免 4 个 loader 各写一份 `clampToGround: true`。
 */
export const VECTOR_GROUND_LOAD_OPTIONS = Object.freeze({ clampToGround: true });

/** 已登记的全部类型（用于启动自检） */
export function listGroundPlacementTypes(): string[] {
    return [...INDEX.keys()];
}

/** 已登记的全部能力（文档 / 调试用） */
export function listGroundPlacementCapabilities(): GroundCapability[] {
    return CAPABILITIES.slice();
}
