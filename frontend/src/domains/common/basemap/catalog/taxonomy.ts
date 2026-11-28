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
    'Bing',
    'NASA',
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
    'OpenSeaMap',
    'OpenRailwayMap',
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
    recommended: '精选底图',
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
    NONE: '未知',
    MIXED: '混合',
};

/** 服务商覆盖：显式纠正位置规则推断错误的服务商（arcgis 源定义已明确为 ESRI） */
const PROVIDER_OVERRIDES: Partial<Record<string, BasemapProvider>> = {
    arcgis_imagery_preset: 'ESRI',
};

/** 显式坐标覆盖：推断规则无法正确表达的少数条目 */
const COORD_OVERRIDES: Record<string, BasemapCoord> = {
    label_minedata_preset: 'WGS84',
    custom_China_Blender_preset: 'MIXED',
    custom_China_Blender_preset_2: 'MIXED',
    vector_amap_pure_roads_wgs_preset: 'MIXED',
};

/**
 * 显式分类覆盖：关键词规则会误判的少数条目。
 * MapTiler ocean-v4 / Stadia outdoors 是电子专题样式，但 ocean / terrain
 * 关键词会被影像或地形规则抢先命中；ESRI Ocean、Mapbox 户外等真影像/地形条目
 * 不受影响，故只覆盖具体条目而不删除全局规则。
 */
const CATEGORY_OVERRIDES: Partial<Record<string, BasemapCategory>> = {
    theme_maptiler_ocean: 'electronic',
    theme_maptiler_ocean_preset: 'electronic',
    terrain_outdoors: 'electronic',
    terrain_outdoors_preset: 'electronic',
    custom_China_Blender: 'terrain',
    custom_China_Blender_preset: 'terrain',
    custom_China_Blender_preset_2: 'terrain',
};

const PROVIDER_MATCHERS: readonly [BasemapProvider, RegExp][] = [
    ['ESRI Wayback', /wayback/i],
    ['Sentinel', /s2_cloudless/i],
    ['AMAP', /amap|gaode/i],
    ['Google', /google|(?<![a-z])gac(?![a-z])/i],
    ['Bing', /bing|virtualearth/i],
    ['NASA', /nasa|modis|viirs/i],
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
    ['OpenSeaMap', /openseamap|seamark/i],
    ['OpenRailwayMap', /openrailwaymap/i],
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
    // V3.7.16：动态项 number=0 是哨兵值，不进入搜索文本，避免搜 "0" 命中全部 Wayback 快照
    const numberToken = entry.number > 0 ? entry.number : null;
    return [numberToken, entry.id, entry.label, entry.provider, entry.coord, entry.description, ...entry.keywords]
        .filter((value) => value !== undefined && value !== null)
        .join(' ')
        .toLowerCase();
}
