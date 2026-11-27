/**
 * AMap / Google 组合底图的折叠展示辅助（纯数据，零 UI 依赖）。
 *
 * 组合底图在 BASEMAP_PRESETS 中逐条显式声明，这里只负责按
 * 「厂商（AMAP / Google）→ 坐标系（GCJ / WGS）」分组，并把长标签
 * 压成「土地利用/道路/建筑」这类简短要素标识，便于检索。
 */

export type ComboProvider = 'AMAP' | 'Google';
export type ComboCoord = 'GCJ' | 'WGS';

export type ComboOption = {
    value: string;
    label: string;
    shortLabel: string;
    [key: string]: unknown;
};

export type ComboCoordGroup = {
    coord: ComboCoord;
    options: ComboOption[];
};

export type ComboProviderGroup = {
    provider: ComboProvider;
    coords: ComboCoordGroup[];
};

/** 组合底图 id 前缀，命中者不进平铺底图列表 */
const COMBO_ID_PREFIXES = ['vector_amap_256_ltype_', 'vector_google_combo_'];

/** 高德 ltype → 简短要素标识 */
const AMAP_LTYPE_LABELS: Record<string, string> = {
    '1': '土地利用',
    '2': '道路',
    '3': '土地利用/道路',
    '4': '注记',
    '5': '土地利用/注记',
    '6': '道路/注记',
    '7': '土地利用/道路/注记',
    '8': '建筑',
    '11': '土地利用/道路/建筑',
    '15': '土地利用/道路/注记/建筑',
};

/** Google 组合 → 简短要素标识 */
const GOOGLE_COMBO_LABELS: Record<string, string> = {
    standard: '标准电子',
    hybrid: '影像混合',
    labels: '注记',
    road_labeled: '道路/注记',
    road_skeleton: '道路',
    road_text: '道路注记',
    water: '水系',
    pb_roadmap: 'PB标准',
    pb_roadline: 'PB道路',
    satellite: '卫星影像',
    terrain: '地形',
    terrain_hybrid: '地形混合',
    clean_terrain: '地形/无注记',
    clean_terrain_no_road: '地形/无道路',
    pb_hillshade: 'PB山体阴影',
};

export function isComboBasemapId(value: unknown): boolean {
    const id = String(value ?? '');
    return COMBO_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function comboProviderOf(value: unknown): ComboProvider {
    return String(value ?? '').startsWith('vector_amap_') ? 'AMAP' : 'Google';
}

export function comboCoordOf(value: unknown): ComboCoord {
    return String(value ?? '').endsWith('_gcj') ? 'GCJ' : 'WGS';
}

export function comboShortLabel(value: unknown): string {
    const id = String(value ?? '');
    const amap = id.match(/^vector_amap_256_ltype_(\d+)_(?:gcj|wgs)$/);
    if (amap) return AMAP_LTYPE_LABELS[amap[1]] || `ltype=${amap[1]}`;
    const google = id.match(/^vector_google_combo_(.+)_(?:gcj|wgs)$/);
    if (google) return GOOGLE_COMBO_LABELS[google[1]] || google[1];
    return '';
}

/** 从统一底图选项列表中拆出「厂商 → 坐标系 → 简短组合」三层结构 */
export function buildComboProviderGroups(options: readonly any[]): ComboProviderGroup[] {
    const combos = options.filter((option) => isComboBasemapId(option?.value));
    return (['AMAP', 'Google'] as const).map((provider) => ({
        provider,
        coords: (['GCJ', 'WGS'] as const).map((coord) => ({
            coord,
            options: combos
                .filter((option) => comboProviderOf(option.value) === provider && comboCoordOf(option.value) === coord)
                .map((option) => ({
                    ...option,
                    shortLabel: comboShortLabel(option.value),
                })) as ComboOption[],
        })),
    }));
}
