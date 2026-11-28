/**
 * 瓦片底图定义聚合（V3.7.16 层定义驱动重构）
 *
 * 底图定义的唯一真相源（SSOT）：六类定义文件在此聚合为
 * TILE_LAYER_DEFINITIONS（按 order 排序），OL 与 Cesium 双引擎共用。
 * 旧聚合点 ol/basemap/constants/basemapConfig.ts 已删除。
 *
 * 本模块同时完成两件事：
 * 1. 向统一目录（catalog/layers）登记完整定义，供目录 UI 与 Cesium
 *    读取 category/provider/coord/description（字段已对齐，仅
 *    method → serviceType 一处映射：mvt → 'vector-tile'）；
 * 2. 加载时校验全部定义（见 validate.ts）：警告打印，错误直接抛错。
 */

import { registerLayerDefinitions } from '../catalog/layers';
import type { BasemapLayerDefinition, BasemapServiceType } from '../catalog/types';
import service from './category-service';
import imagery from './category-imagery';
import terrain from './category-terrain';
import electronic from './category-electronic';
import historical from './category-historical';
import vector from './category-vector';
import type { TileLayerDefinition } from './types';
import { validateTileLayerDefinitions } from './validate';

export type {
    CoordCorrection,
    LayerCategory,
    LayerGroup,
    ProxyMode,
    TileLayerContext,
    TileLayerDefinition,
    TileLoadMethod,
} from './types';
export { resolveContextPlaceholders, resolveTileUrl } from './resolveTileUrl';
export type { TileUrlContext } from './resolveTileUrl';
export { validateTileLayerDefinitions } from './validate';
export type { TileLayerValidationResult } from './validate';

/** 全部图层定义（按 order 排序；order 禁改——排序即旧 LAYER_SOURCE_DEFINITIONS 顺序；
 *  URL 参数 l 的 1-based 序号另由 ALL_BASEMAP_PRESETS 顺序决定，本文件不动预设） */
export const TILE_LAYER_DEFINITIONS: TileLayerDefinition[] = [
    ...service,
    ...imagery,
    ...terrain,
    ...electronic,
    ...historical,
    ...vector,
].sort((a, b) => a.order - b.order);

/** 加载时校验：警告打印，错误抛错（定义损坏必须启动即暴露） */
const validation = validateTileLayerDefinitions(TILE_LAYER_DEFINITIONS);
for (const warning of validation.warnings) {
    console.warn(`[basemap-definitions] ${warning}`);
}
if (validation.errors.length > 0) {
    throw new Error(
        `[basemap-definitions] 图层定义校验失败：\n${validation.errors.join('\n')}`,
    );
}

const LAYER_DEFINITION_MAP = new Map(TILE_LAYER_DEFINITIONS.map((d) => [d.id, d]));

/** 按 id 取图层定义（描述符 = 定义本身，全量透传，不再做字段子集复制） */
export function getTileLayerDefinitionById(id: string): TileLayerDefinition | undefined {
    return LAYER_DEFINITION_MAP.get(String(id || '').trim());
}

/** 描述符入口：与旧 getDescriptorById 同名同义，现返回完整定义本身 */
export function getDescriptorById(id: string): TileLayerDefinition | undefined {
    return getTileLayerDefinitionById(id);
}

/** 所有图层定义的 ID 列表（与 TILE_LAYER_DEFINITIONS 同序） */
export function getAllTileLayerIds(): string[] {
    return TILE_LAYER_DEFINITIONS.map((d) => d.id);
}

/** 运行时密钥池类型：与后端 api_keys 表 key_name 一一对应 */
export type RuntimeTokenPoolKey = 'tianditu_tk' | 'ovital_tdtkey';

/**
 * 根据图层 ID 解析其运行时密钥池（SSOT：依据 needsContext 声明判定，杜绝字符串猜测）
 * 供容灾轮换使用：图层失败 → 判定所属密钥池 → 轮换该池备用 key
 * @param layerId 图层源 ID
 * @returns 密钥池 key；非 token 依赖图层返回 null
 */
export function resolveRuntimeTokenPoolKey(layerId: string): RuntimeTokenPoolKey | null {
    const def = LAYER_DEFINITION_MAP.get(String(layerId || '').trim());
    if (!def?.needsContext?.length) return null;
    if (def.needsContext.includes('tiandituTk')) return 'tianditu_tk';
    if (def.needsContext.includes('ovitalTdtkey')) return 'ovital_tdtkey';
    return null;
}

/** method → 统一目录 serviceType 的唯一映射点（mvt → 'vector-tile'，其余同名） */
function toCatalogServiceType(method: TileLayerDefinition['method']): BasemapServiceType {
    return method === 'mvt' ? 'vector-tile' : method;
}

/**
 * 将图层定义登记到统一目录：所有分类/坐标/描述均来自每条源定义
 * 的显式字段，不再运行时推断或二次映射。
 */
registerLayerDefinitions(
    TILE_LAYER_DEFINITIONS.map((definition): BasemapLayerDefinition => ({
        ...definition,
        serviceType: toCatalogServiceType(definition.method),
        legacyCategory: definition.category,
        category: definition.catalogCategory,
        keywords: [definition.id, definition.name, definition.provider, definition.coord],
        tags: [] as string[],
    })),
);
