/**
 * mapDefaults.js — 跨域地图默认参数单源
 *
 * 地名搜索/定位链路（GISCommander、useMapState.locateAddress、chat 意图兜底、工具 Schema）
 * 共用同一落点缩放级别；改动时全链路自动一致。
 */

/** 地名搜索/地址定位默认落点缩放级别（街道级） */
export const DEFAULT_SEARCH_ZOOM = 16;

/** OL zoom 钳制上限 */
export const MAX_SEARCH_ZOOM = 22;
