/**
 * 底图分类判定（阶段 1：基于现有 preset id/label 生成元数据）。
 *
 * 原则：分类只改 metadata，不改 id / 顺序 / 编号。后续阶段 2 迁移完整图层
 * 定义后，这些函数只作为缺省推断，显式声明的字段优先。
 */
import type {
    BasemapCatalogEntry,
    BasemapCategory,
    BasemapCoord,
    BasemapProvider,
} from './types';

export const CATEGORY_ORDER: readonly BasemapCategory[] = [
    'service',
    'recommended',
    'imagery',
    'terrain',
    'electronic',
    'historical',
    'vector',
];

export const PROVIDER_ORDER: readonly BasemapProvider[] = [
    'AMAP',
    'Google',
    'Tianditu',
    'Tuxin',
    'Baidu',
    'Tencent',
    'ESRI',
    'ESRI Wayback',
    'Sentinel',
    'MapTiler',
    'Mapbox',
    'OSM',
    'Carto',
    'Stadia',
    'Stamen',
    'OpenFreeMap',
    'MFF',
    'MineMap',
    'GeoQ',
    'Windy',
    'Local',
    'Custom',
    'Other',
];

export const COORD_ORDER: readonly BasemapCoord[] = ['WGS84', 'GCJ02', 'BD09', 'NONE', 'MIXED'];

export const CATEGORY_LABELS: Record<BasemapCategory, string> = {
    service: 'WMS/WMTS/MVT/XYZ',
    recommended: '常用推荐底图',
    imagery: '影像底图',
    terrain: '地形底图',
    electronic: '电子底图',
    historical: '历史影像',
    vector: '矢量瓦片',
};

export const COORD_LABELS: Record<BasemapCoord, string> = {
    WGS84: 'WGS84',
    GCJ02: 'GCJ02',
    BD09: 'BD09',
    NONE: '无坐标系',
    MIXED: '混合',
};

/** 常用推荐暂定取 BASEMAP_PRESETS 原始顺序前 20 条，由 registry 按 index 覆盖 */
export const RECOMMENDED_FIRST_N = 20;

/** ESRI Wayback 静态兜底项：归入历史影像，避免只出现在影像底图里 */
const CATEGORY_OVERRIDES: Partial<Record<string, BasemapCategory>> = {
    arcgis_imagery_preset: 'historical',
    imagery_yandex_preset: 'imagery',
};

/** 服务商覆盖：Wayback 静态兜底与动态快照同组 */
const PROVIDER_OVERRIDES: Partial<Record<string, BasemapProvider>> = {
    arcgis_imagery_preset: 'ESRI Wayback',
};

/** 显式坐标覆盖：推断规则无法正确表达的少数条目 */
const COORD_OVERRIDES: Record<string, BasemapCoord> = {
    label_minedata_preset: 'WGS84',
    custom_China_Blender_preset: 'MIXED',
    custom_China_Blender_preset_2: 'MIXED',
    vector_amap_pure_roads_wgs_preset: 'MIXED',
};

const PROVIDER_MATCHERS: readonly [BasemapProvider, RegExp][] = [
    ['ESRI Wayback', /wayback/i],
    ['Sentinel', /s2_cloudless/i],
    ['AMAP', /amap|gaode/i],
    ['Google', /google|(?<![a-z])gac(?![a-z])/i],
    ['Tianditu', /tianditu|tdt/i],
    ['Tuxin', /tuxin|geovisearth/i],
    ['Baidu', /baidu/i],
    ['Tencent', /tengxun|gtimg/i],
    ['ESRI', /arcgis|esri/i],
    ['MapTiler', /maptiler/i],
    ['Mapbox', /mapbox/i],
    ['OpenFreeMap', /openfreemap/i],
    ['Carto', /carton|carto/i],
    ['Stadia', /stadia|alidade|outdoors/i],
    ['Stamen', /stamen|toner|watercolor/i],
    ['OSM', /osm/i],
    ['MFF', /mff|relief/i],
    ['MineMap', /minedata/i],
    ['GeoQ', /geoq/i],
    ['Windy', /windy/i],
];

export function classifyProvider(id: string): BasemapProvider {
    if (PROVIDER_OVERRIDES[id]) return PROVIDER_OVERRIDES[id]!;
    if (id === 'local_tiles_preset' || id.startsWith('local_tiles')) return 'Local';
    if (id === 'custom' || id.startsWith('custom_')) return 'Custom';
    for (const [provider, pattern] of PROVIDER_MATCHERS) {
        if (pattern.test(id)) return provider;
    }
    return 'Other';
}

export function classifyCategory(id: string, label: string, provider: BasemapProvider): BasemapCategory {
    if (CATEGORY_OVERRIDES[id]) return CATEGORY_OVERRIDES[id]!;
    if (id === 'custom' || id === 'local_tiles_preset') return 'service';
    if (/s2_cloudless|wayback/i.test(id)) return 'historical';
    if (/vector_tianditu_mvt|openfreemap_liberty|vector-tile/i.test(id)) return 'vector';
    if (/terrain|hillshade|relief|山体|地形|topo|contour|mff/i.test(`${id} ${label}`)) return 'terrain';
    if (/satellite|山体|影像|卫星|imagery|ocean|polar/i.test(`${id} ${label}`)) return 'imagery';
    if (/^(vector_|theme_|label_)/.test(id)) return 'electronic';
    if (provider === 'Sentinel' || provider === 'ESRI Wayback') return 'historical';
    return 'electronic';
}

export function classifyCoord(id: string, label: string, provider: BasemapProvider): BasemapCoord {
    if (COORD_OVERRIDES[id]) return COORD_OVERRIDES[id];
    const text = `${id} ${label}`;
    if (/_wgs|wgs84|\(WGS\)/i.test(text)) return 'WGS84';
    if (/_gcj|gcj02|\(GCJ\)/i.test(text)) return 'GCJ02';
    if (/bd09|\(BD\)/i.test(text)) return 'BD09';
    if (provider === 'Baidu') return 'BD09';
    if (provider === 'Custom' || provider === 'Local' || provider === 'Other') return 'NONE';
    // 天地图官方瓦片为 WGS84 / CGCS2000 体系，不做 GCJ 纠偏；其他国内商业源按 GCJ02 处理
    if (['AMAP', 'Tuxin', 'Tencent', 'MineMap', 'GeoQ'].includes(provider)) return 'GCJ02';
    return 'WGS84';
}

export function buildDescription(
    id: string,
    label: string,
    provider: BasemapProvider,
    coord: BasemapCoord,
): string {
    const year = id.match(/(20\d{2})/)?.[1];
    const suffix = year ? ` · ${year} 年快照` : '';
    return `${label} · ${provider} / ${COORD_LABELS[coord]}${suffix}`;
}

export function entryToSearchText(entry: BasemapCatalogEntry): string {
    return [entry.number, entry.id, entry.label, entry.provider, entry.coord, entry.description, ...entry.keywords]
        .filter((value) => value !== undefined && value !== null)
        .join(' ')
        .toLowerCase();
}
