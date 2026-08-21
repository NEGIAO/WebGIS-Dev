/**
 * 底图选项常量（纯数据，零 OL/Cesium 依赖）
 *
 * 从 ol/basemap/constants/basemapResolver.ts 抽离（V3.5.11 H7 跨层违规修复）：
 * DEFAULT_BASEMAP_LAYER_INDEX / BASEMAP_OPTIONS / URL_LAYER_OPTIONS 与 1-based URL
 * 图层编号 helper 均仅依赖 basemapPresets 纯数据，不涉及 OL 域 basemapConfig。
 * ol 域 basemapResolver 保持 re-export 兼容旧 import 路径。
 */

import { ALL_BASEMAP_PRESETS, DEFAULT_BASEMAP_PRESET_ID } from './basemapPresets';

/** 默认底图在 URL_LAYER_OPTIONS 中的索引 */
export const DEFAULT_BASEMAP_LAYER_INDEX = (() => {
    const index = ALL_BASEMAP_PRESETS.findIndex((preset) => preset.id === DEFAULT_BASEMAP_PRESET_ID);
    return index >= 0 ? index : 0;
})();

/** Public URL layer numbers are one-based: l=1 is local tiles and l=2 is custom/Wayback. */
export const DEFAULT_BASEMAP_URL_LAYER_NUMBER = DEFAULT_BASEMAP_LAYER_INDEX + 1;

export function getBasemapIdByUrlLayerNumber(value: unknown): string | null {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > ALL_BASEMAP_PRESETS.length) {
        return null;
    }
    return ALL_BASEMAP_PRESETS[number - 1]?.id || null;
}

export function getUrlLayerNumberByBasemapId(value: unknown): number | null {
    const id = String(value ?? '').trim();
    const index = ALL_BASEMAP_PRESETS.findIndex((preset) => preset.id === id);
    return index >= 0 ? index + 1 : null;
}

/** 预设底图选项列表（用于 UI 下拉菜单） */
export const BASEMAP_OPTIONS = ALL_BASEMAP_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label,
}));

/** URL 图层选项列表：用于 URL 参数 l 的图层索引映射（与 ALL_BASEMAP_PRESETS 同序） */
export { URL_LAYER_OPTIONS } from './basemapPresets';
