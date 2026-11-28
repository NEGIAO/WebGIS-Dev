/**
 * 组合底图 id 判定（纯数据，零 UI 依赖）。
 *
 * AMAP 256 ltype / Google 全组合两类组合预设已随统一目录树直接展示
 * （catalog registry 以 `combo` tag 归类）；本模块仅保留「组合 id 判定」，
 * 供引擎侧从平铺选项列表中剔除组合条目，避免与目录树重复出现。
 * 厂商→坐标系折叠展示辅助已随 V3.7.16 死代码清理移除（历史见 git）。
 */

/** 组合底图 id 前缀，命中者不进平铺底图列表 */
const COMBO_ID_PREFIXES = ['vector_amap_256_ltype_', 'vector_google_combo_'];

export function isComboBasemapId(value: unknown): boolean {
    const id = String(value ?? '');
    return COMBO_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}
