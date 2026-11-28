/**
 * 底图解析器
 * 提供图层配置解析、预设解析等功能
 *
 * V3.7.16：图层定义已迁入 common/basemap/definitions（SSOT 不再是
 * ol/basemap/constants/basemapConfig.ts，该文件已删除）；本模块仍是
 * OL 侧的解析入口，并继续向 common/basemap/catalogProjection 发布
 * 只读目录投影（时序保证不变：HomeView 静态引入本模块）。
 */

import type { TileLayerContext } from '@common/basemap/definitions/types';
import {
    TILE_LAYER_DEFINITIONS,
    getDescriptorById,
    resolveRuntimeTokenPoolKey,
} from '@common/basemap/definitions';
import { createOlSource } from '@ol/basemap/loaders/createOlSource';
import { publishBasemapCatalogProjection } from '@common/basemap/catalogProjection';
import {
    ALL_BASEMAP_PRESETS,
    DEFAULT_BASEMAP_PRESET_ID,
} from '@common/basemap/basemapPresets';

// ========== 内部索引 ==========
const LAYER_SOURCE_MAP = new Map(TILE_LAYER_DEFINITIONS.map((item) => [item.id, item]));
const BASEMAP_PRESET_MAP = new Map(ALL_BASEMAP_PRESETS.map((item) => [item.id, item]));

// ========== 解析函数 ==========
function resolveDefaultVisibleLayerIdSet(): Set<string> {
    const preset = BASEMAP_PRESET_MAP.get(String(DEFAULT_BASEMAP_PRESET_ID || ''));
    const stack =
        Array.isArray(preset?.stack) && preset.stack.length
            ? preset.stack
            : [String(DEFAULT_BASEMAP_PRESET_ID || '')];

    const visibleLayerIdSet = new Set<string>();
    stack.forEach((id) => {
        const normalized = String(id || '').trim();
        if (!normalized) return;
        if (!LAYER_SOURCE_MAP.has(normalized)) return;
        visibleLayerIdSet.add(normalized);
    });

    return visibleLayerIdSet;
}

const DEFAULT_VISIBLE_LAYER_ID_SET = resolveDefaultVisibleLayerIdSet();

/** 纯数据常量已迁至 common 域（@common/basemap/basemapOptions），此处 re-export 保持旧 import 路径兼容 */
export { DEFAULT_BASEMAP_LAYER_INDEX, URL_LAYER_OPTIONS, BASEMAP_OPTIONS } from '@common/basemap/basemapOptions';

/** 获取一个 option 对应的真实图层堆叠（去重，保序） */
export function resolvePresetLayerIds(optionId: string): string[] {
    const preset = BASEMAP_PRESET_MAP.get(String(optionId || ''));
    const stack =
        Array.isArray(preset?.stack) && preset.stack.length
            ? preset.stack
            : [String(optionId || '')];

    const deduped: string[] = [];
    const seen = new Set<string>();

    stack.forEach((id) => {
        const normalized = String(id || '').trim();
        if (!normalized || seen.has(normalized)) return;
        if (!LAYER_SOURCE_MAP.has(normalized)) return;

        seen.add(normalized);
        deduped.push(normalized);
    });

    return deduped;
}

/** 获取 option 的展示名称 */
export function getBasemapOptionLabel(optionId: string): string {
    const preset = BASEMAP_PRESET_MAP.get(String(optionId || ''));
    return preset?.label || String(optionId || '');
}

/**
 * 创建底图配置列表（由配置文件集中驱动）
 * @param tiandituTk 天地图 Token
 * @param ovitalTdtkey 奥维 TDT Key（L2 密钥，管理员写入数据库后运行时注入）
 * @param customUrl 自定义 URL
 * @returns 图层配置列表
 */
export function createLayerConfigs(
    tiandituTk: string = '',
    ovitalTdtkey: string = '',
    customUrl: string = '',
) {
    const context: TileLayerContext = {
        tiandituTk,
        ovitalTdtkey,
        customUrl,
    };

    return TILE_LAYER_DEFINITIONS.map((definition) => ({
        id: definition.id,
        name: definition.name,
        zBand: definition.zBand,
        visible:
            DEFAULT_VISIBLE_LAYER_ID_SET.size > 0
                ? DEFAULT_VISIBLE_LAYER_ID_SET.has(definition.id)
                : !!definition.defaultVisible,
        createSource: () => createOlSource(definition, context),
    }));
}

/** 导出主要管理功能 */
export function useBasemapManager() {
    return {
        createLayerConfigs,
        resolvePresetLayerIds,
        getBasemapOptionLabel,
    };
}

// ========== 向 common 发布只读目录投影 ==========
// 三维域只需要元数据查询，不应静态 import OL 加载器。
// 本模块作为目录门面，加载即发布投影；任何 import 本模块的入口都会顺带完成发布。
publishBasemapCatalogProjection({
    resolvePresetLayerIds,
    getDescriptorById,
    resolveRuntimeTokenPoolKey,
});
