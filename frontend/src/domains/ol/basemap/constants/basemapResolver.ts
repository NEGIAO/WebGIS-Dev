/**
 * 底图解析器
 * 提供图层配置解析、预设解析等功能
 */

import type { LayerCategory, LayerGroup, LayerFactoryContext } from './basemapConfig';
import { LAYER_SOURCE_DEFINITIONS } from './basemapConfig';
import {
    ALL_BASEMAP_PRESETS,
    DEFAULT_BASEMAP_PRESET_ID,
} from '@common/basemap/basemapPresets';

// ========== 内部索引 ==========
const LAYER_SOURCE_MAP = new Map(LAYER_SOURCE_DEFINITIONS.map((item) => [item.id, item]));
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

/** 获取图层分类（用于外部状态同步） */
export function getLayerCategory(layerId: string): LayerCategory {
    return LAYER_SOURCE_MAP.get(String(layerId || ''))?.category || 'theme';
}

/** 获取图层分组（用于外部状态同步） */
export function getLayerGroup(layerId: string): LayerGroup {
    return LAYER_SOURCE_MAP.get(String(layerId || ''))?.group || '专题';
}

/**
 * 创建底图配置列表（由配置文件集中驱动）
 * @param tiandituTk 天地图 Token
 * @param customUrl 自定义 URL
 * @returns 图层配置列表
 */
export function createLayerConfigs(
    tiandituTk: string = '',
    customUrl: string = '',
) {
    const context: LayerFactoryContext = {
        tiandituTk,
        customUrl,
    };

    return LAYER_SOURCE_DEFINITIONS.map((definition) => ({
        id: definition.id,
        name: definition.name,
        category: definition.category,
        group: definition.group,
        visible:
            DEFAULT_VISIBLE_LAYER_ID_SET.size > 0
                ? DEFAULT_VISIBLE_LAYER_ID_SET.has(definition.id)
                : !!definition.defaultVisible,
        createSource: () => definition.createSource(context),
    }));
}

/** 导出主要管理功能 */
export function useBasemapManager() {
    return {
        createLayerConfigs,
        resolvePresetLayerIds,
        getBasemapOptionLabel,
        getLayerCategory,
        getLayerGroup,
    };
}
