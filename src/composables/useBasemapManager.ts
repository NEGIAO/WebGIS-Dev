/**
 * 底图管理 Composable
 * 所有底图/组合图层规则均在本文件集中维护
 */

import { ref } from 'vue';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';

// ========== 主机配置常量 ==========
export const TILE_HOSTS = {
    tianditu: 't0.tianditu.gov.cn',
    googleCandidates: ['mt3v.gggis.com', 'gac-geo.googlecnapps.club']
};

export const GOOGLE_HOST_STRATEGY = 'manual' as const;
export const GOOGLE_MANUAL_HOST = TILE_HOSTS.googleCandidates[1];
export const GOOGLE_PROBE_TIMEOUT_MS = 1200;

// ========== 类型定义 ==========
export type TileYNormalizeMode = 'auto' | 'direct' | 'invert-tms' | 'ol-negative';
export type LayerCategory = 'base' | 'label';
export type LayerGroup = '影像' | '矢量' | '专题' | '注记';

type TileSourceInstance = XYZ | OSM | null;

type LayerFactoryContext = {
    normBase: string;
    tiandituTk: string;
    customUrl: string;
};

type LayerSourceDefinition = {
    id: string;
    name: string;
    category: LayerCategory;
    group: LayerGroup;
    defaultVisible?: boolean;
    createSource: (ctx: LayerFactoryContext) => TileSourceInstance;
};

type BasemapPresetDefinition = {
    id: string;
    label: string;
    // 从下到上的图层顺序
    stack: string[];
};

type NonStandardXYZAdapter = {
    pattern: RegExp;
    name: string;
    urlFunction: (tc: number[]) => string;
};

// ========== 响应式状态 ==========
/** Google 主机选择状态（全局单例） */
export const activeGoogleTileHost = ref(GOOGLE_MANUAL_HOST);

// ========== 工具函数 ==========

/**
 * 通过图片探测估算候选 Google 主机延迟。
 * @param {string} host - 主机地址
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @returns {Promise<number>} 延迟时间或 Infinity
 */
export function probeGoogleHostLatency(host: string, timeoutMs: number = GOOGLE_PROBE_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const start = performance.now();
        const img = new Image();
        let settled = false;

        const end = (latency: number) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
            resolve(latency);
        };

        const timer = setTimeout(() => end(Number.POSITIVE_INFINITY), timeoutMs);
        img.onload = () => end(performance.now() - start);
        img.onerror = () => end(Number.POSITIVE_INFINITY);
        img.src = `https://${host}/maps/vt?lyrs=s&x=0&y=0&z=1&_probe=${Date.now()}`;
    });
}

/**
 * 选择可用且延迟最低的 Google 主机。
 * @returns {Promise<string>} 选中的主机地址
 */
export async function resolvePreferredGoogleHost() {
    if (GOOGLE_HOST_STRATEGY !== ('fastest' as any)) return GOOGLE_MANUAL_HOST;
    const candidates = TILE_HOSTS.googleCandidates || [];
    if (!candidates.length) return GOOGLE_MANUAL_HOST;

    const measured = await Promise.all(candidates.map(async (host) => ({
        host,
        latency: await probeGoogleHostLatency(host)
    })));

    measured.sort((a, b) => (a.latency as number) - (b.latency as number));
    const best = measured[0];
    return Number.isFinite(best?.latency as number) ? best.host : GOOGLE_MANUAL_HOST;
}

/**
 * 拼接 Google 瓦片服务 URL。
 * @param {string} pathAndQuery - 路径和查询字符串
 * @returns {string} 完整的 Google 瓦片 URL
 */
export const buildGoogleTileUrl = (pathAndQuery: string) => `https://${activeGoogleTileHost.value}${pathAndQuery}`;

/**
 * 拼接天地图瓦片服务 URL。
 * @param {string} pathAndQuery - 路径和查询字符串（包含 ? 或 不包含）
 * @param {string} tiandituTk - 天地图 Token
 * @returns {string} 完整的天地图 URL
 */
export const buildTiandituUrl = (pathAndQuery: string, tiandituTk: string): string => {
    const hasQuery = pathAndQuery.includes('?');
    const separator = hasQuery ? '&' : '?';
    return `https://${TILE_HOSTS.tianditu}${pathAndQuery}${separator}tk=${tiandituTk}`;
};

/**
 * 非标准xyz切片 URL 的 Y 坐标归一化。
 * 统一归一化 Y 坐标。
 * - auto: 若 rawY < 0 视为 OL 负号坐标，按 -rawY-1 转换；否则直接返回
 * - direct: 直接使用 rawY
 * - invert-tms: TMS -> XYZ，使用 (2^z - 1 - rawY)
 * - ol-negative: 强制按 OL 负号坐标转换（-rawY-1）
 */
export function normalizeTileY(z: number, rawY: number, mode: TileYNormalizeMode = 'auto'): number {
    if (!Number.isFinite(rawY)) return rawY;

    if (mode === 'direct') return rawY;
    if (mode === 'invert-tms') return (1 << z) - 1 - rawY;
    if (mode === 'ol-negative') return -rawY - 1;

    return rawY < 0 ? (-rawY - 1) : rawY;
}

/** Bing/QuadTree 常用：将 xyz 转 quadkey。 */
export function toQuadKey(x: number, y: number, z: number): string {
    let quadKey = '';
    for (let i = z; i > 0; i--) {
        let digit = 0;
        const mask = 1 << (i - 1);
        if ((x & mask) !== 0) digit += 1;
        if ((y & mask) !== 0) digit += 2;
        quadKey += digit.toString();
    }
    return quadKey;
}

// ========== 非标准 XYZ 图源适配器 ==========
function createMapsForFreeAdapter(layerName: string, displayName: string, ext: string = 'gif'): NonStandardXYZAdapter {
    return {
        pattern: new RegExp(`maps-for-free\\.com.*${layerName}`, 'i'),
        name: displayName,
        urlFunction: (tileCoord: number[]) => {
            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = normalizeTileY(z, tileCoord[2], 'auto');
            return `https://maps-for-free.com/layer/${layerName}/z${z}/row${y}/${z}_${x}-${y}.${ext}`;
        }
    };
}

export const NON_STANDARD_XYZ_ADAPTERS: Record<string, NonStandardXYZAdapter> = {
    'maps-for-free-relief': createMapsForFreeAdapter('relief', '地形浮雕(MFF)', 'jpg'),
    'maps-for-free-water': createMapsForFreeAdapter('water', '水体(MFF)'),
    'maps-for-free-admin': createMapsForFreeAdapter('admin', '行政边界(MFF)'),
    'maps-for-free-streets': createMapsForFreeAdapter('streets', '街道(MFF)'),
    'maps-for-free-country': createMapsForFreeAdapter('country', '国家边界(MFF)', 'png'),
    'maps-for-free-crop': createMapsForFreeAdapter('crop', '作物(MFF)'),
    'maps-for-free-grass': createMapsForFreeAdapter('grass', '草地(MFF)'),
    'maps-for-free-forest': createMapsForFreeAdapter('forest', '森林(MFF)'),
    'maps-for-free-tundra': createMapsForFreeAdapter('tundra', '冻土(MFF)'),
    'maps-for-free-sand': createMapsForFreeAdapter('sand', '沙地(MFF)'),
    'maps-for-free-swamp': createMapsForFreeAdapter('swamp', '沼泽(MFF)'),
    'maps-for-free-ice': createMapsForFreeAdapter('ice', '冰川(MFF)')
};

/**
 * 根据 URL 检测是否为已知的非标准格式，返回对应的转换函数
 * @param {string} url - 待检测的瓦片 URL
 * @returns {Object|null} { name, urlFunction } 或 null
 */
export function detectNonStandardXYZ(url: string): { name: string; urlFunction: (tc: number[]) => string } | null {
    for (const adapter of Object.values(NON_STANDARD_XYZ_ADAPTERS)) {
        if (adapter.pattern.test(url)) {
            return {
                name: adapter.name,
                urlFunction: adapter.urlFunction
            };
        }
    }
    return null;
}

/**
 * 根据 URL 创建 XYZ 源：
 * - 标准格式自动识别坐标占位符
 * - 非标准格式自动应用转换函数
 * - 自动清除 $ 通配符（如 ${z} -> {z}）
 * @param {string} url - XYZ 瓦片 URL（标准或非标准格式）
 * @returns {XYZ} OpenLayers XYZ Source
 */
export function createXYZSourceFromUrl(url: string): XYZ {
    // 清除 $ 通配符，将 ${x} ${y} ${z} 转换为 {x} {y} {z}
    const cleanUrl = String(url || '').replace(/\$\{([xyz])\}/gi, (_, axis: string) => `{${axis.toLowerCase()}}`);

    const nonStandard = detectNonStandardXYZ(cleanUrl);
    if (nonStandard) {
        return new XYZ({
            tileUrlFunction: nonStandard.urlFunction,
            tilePixelRatio: 1
        });
    }

    return new XYZ({ url: cleanUrl });
}

// ========== 单文件集中配置（图层源 + 选项组合） ==========
// 图源定义 + 顺序即底图图层管理的顺序

const MFF_RELIEF_URL = 'https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg';
const createMffLayerTemplateUrl = (layerName: string) =>
    `https://maps-for-free.com/layer/${layerName}/z{z}/row{y}/{z}_{x}-{y}.gif`;

const LAYER_SOURCE_DEFINITIONS: LayerSourceDefinition[] = [
    // 注记图层
    {
        id: 'label',
        name: '天地图注记',
        category: 'label',
        group: '注记',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id: 'label_vector',
        name: '天地图矢量注记',
        category: 'label',
        group: '注记',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/cva_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cva&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },

    // 主图层
    {
        id: 'local',
        name: '自定义瓦片',
        category: 'base',
        group: '专题',
        createSource: ({ normBase }) => new XYZ({ url: `${normBase}tiles/{z}/{x}/{y}.png` })
    },
    {
        id: 'custom',
        name: '自定义URL',
        category: 'base',
        group: '专题',
        createSource: ({ customUrl }) => customUrl ? createXYZSourceFromUrl(customUrl) : null
    },
    {
        id: 'Google',
        name: 'Google原版',
        category: 'base',
        group: '影像',
        createSource: () => new XYZ({ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 })
    },
    {
        id: 'Google_clean',
        name: 'Google简洁(原版)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off,s.t:3|s.e.g|p.v:off'
        })
    },
    {
        id: 'tianDiTu_vec',
        name: '天地图矢量',
        category: 'base',
        group: '矢量',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id: 'tianDiTu',
        name: '天地图影像',
        category: 'base',
        group: '影像',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id: 'google',
        name: 'Google(gac)',
        category: 'base',
        group: '影像',
        defaultVisible: true,
        createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=s&x={x}&y={y}&z={z}'), maxZoom: 20 })
    },
    {
        id: 'google_standard',
        name: 'Google标准',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=m&x={x}&y={y}&z={z}') })
    },
    {
        id: 'google_clean',
        name: 'Google简洁',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: buildGoogleTileUrl('/maps/vt?lyrs=m&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off,s.t:3|s.e.g|p.v:off')
        })
    },
    {
        id: 'osm',
        name: 'OSM(需梯子)',
        category: 'base',
        group: '矢量',
        createSource: () => new OSM()
    },
    {
        id: 'yandex_sat',
        name: 'Yandex卫星',
        category: 'base',
        group: '影像',
        createSource: () => new XYZ({ url: 'https://sat02.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}' })
    },
    {
        id: 'geoq_gray',
        name: 'GeoQ灰(GCJ)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldGrayMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldGrayMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png'
        })
    },
    {
        id: 'geoq_hydro',
        name: 'GeoQ水(GCJ)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png'
        })
    },
    {
        id: 'amap',
        name: '高德地图(GCJ)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
        })
    },
    {
        id: 'amap_image',
        name: '高德影像(GCJ)',
        category: 'base',
        group: '影像',
        createSource: () => new XYZ({ url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}' })
    },
    {
        id: 'tengxun',
        name: '腾讯地图(GCJ)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0'
        })
    },
    {
        id: 'topo',
        name: '地形图',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' })
    },
    {
        id: 'opentopomap',
        name: 'OpenTopoMap',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' })
    },
    {
        id: 'esa_topo',
        name: '欧空局地形',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png' })
    },
    {
        id: 'windy',
        name: 'windy',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}/?lang=en' })
    },
    {
        id: 'windy2',
        name: 'windy2',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/v1/maptiles/winter/256/{z}/{x}/{y}/?lang=en' })
    },
    {
        id: 'windy_outer',
        name: 'windy轮廓',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/tiles/v10.0/darkmap-retina/{z}/{x}/{y}.png' })
    },
    {
        id: 'windy_greenland',
        name: 'windy Gray',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/tiles/v10.0/grayland/{z}/{x}/{y}.png' })
    },
    {
        id: 'carton_light',
        name: 'CartoDB',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png' })
    },
    {
        id: 'carton_dark',
        name: 'CartoDB Dark',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' })
    },
    {
        id: 'wikepedia',
        name: 'Wikipedia',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png' })
    },
    {
        id: 'toner',
        name: 'Stamen Toner',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png' })
    },
    {
        id: 'alidade',
        name: 'Alidade Sm',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png' })
    },
    {
        id: 'mff_water',
        name: 'MFF水体',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('water'))
    },
    {
        id: 'mff_admin',
        name: 'MFF行政边界',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('admin'))
    },
    {
        id: 'mff_streets',
        name: 'MFF街道',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('streets'))
    },
    {
        id: 'mff_country',
        name: 'MFF国家边界',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/country/z{z}/row{y}/{z}_{x}-{y}.png')
    },
    {
        id: 'mff_crop',
        name: 'MFF作物',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('crop'))
    },
    {
        id: 'mff_grass',
        name: 'MFF草地',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('grass'))
    },
    {
        id: 'mff_forest',
        name: 'MFF森林',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('forest'))
    },
    {
        id: 'mff_tundra',
        name: 'MFF冻土',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('tundra'))
    },
    {
        id: 'mff_sand',
        name: 'MFF沙地',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('sand'))
    },
    {
        id: 'mff_swamp',
        name: 'MFF沼泽',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('swamp'))
    },
    {
        id: 'mff_ice',
        name: 'MFF冰川',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(createMffLayerTemplateUrl('ice'))
    },
    {
        id: 'relief',
        name: '地形浮雕(MFF)',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl(MFF_RELIEF_URL)
    },
];

// 每个 option 对应一个组合（单层也视为组合）
// stack 中图层顺序即底图图层管理的顺序（从下到上）
// option 顺序即显示顺序
const BASEMAP_PRESETS: BasemapPresetDefinition[] = [
    { id: 'local', label: '自定义瓦片', stack: ['local'] },
    { id: 'tianDiTu_vec', label: '天地图矢量', stack: ['tianDiTu_vec', 'label_vector'] },
    { id: 'tianDiTu', label: '天地图影像', stack: ['tianDiTu', 'label'] },
    { id: 'google', label: 'Google(gac)', stack: ['google', 'label'] },
    { id: 'Google', label: 'Google原版', stack: ['Google', 'label'] },
    { id: 'google_standard', label: 'Google标准', stack: ['google_standard'] },
    { id: 'google_clean', label: 'Google简洁', stack: ['google_clean'] },
    { id: 'Google_clean', label: 'Google简洁(原版)', stack: ['Google_clean'] },
    { id: 'osm', label: 'OSM(需梯子)', stack: ['osm'] },
    { id: 'relief', label: '地形浮雕(MFF)', stack: ['relief', 'label'] },
    { id: 'mff_water', label: 'MFF水体', stack: ['relief', 'mff_water', 'label'] },
    { id: 'mff_admin', label: 'MFF行政边界', stack: ['relief', 'mff_admin', 'label'] },
    { id: 'mff_streets', label: 'MFF街道', stack: ['relief', 'mff_streets', 'label'] },
    { id: 'mff_country', label: 'MFF国家边界', stack: ['relief', 'mff_country', 'label'] },
    { id: 'mff_crop', label: 'MFF作物', stack: ['relief', 'mff_crop', 'label'] },
    { id: 'mff_grass', label: 'MFF草地', stack: ['relief', 'mff_grass', 'label'] },
    { id: 'mff_forest', label: 'MFF森林', stack: ['relief', 'mff_forest', 'label'] },
    { id: 'mff_tundra', label: 'MFF冻土', stack: ['relief', 'mff_tundra', 'label'] },
    { id: 'mff_sand', label: 'MFF沙地', stack: ['relief', 'mff_sand', 'label'] },
    { id: 'mff_swamp', label: 'MFF沼泽', stack: ['relief', 'mff_swamp', 'label'] },
    { id: 'mff_ice', label: 'MFF冰川', stack: ['relief', 'mff_ice', 'label'] },
    { id: 'yandex_sat', label: 'Yandex卫星', stack: ['yandex_sat'] },
    { id: 'geoq_gray', label: 'GeoQ灰(GCJ)', stack: ['geoq_gray'] },
    { id: 'geoq_hydro', label: 'GeoQ水(GCJ)', stack: ['geoq_hydro'] },
    { id: 'amap', label: '高德地图(GCJ)', stack: ['amap'] },
    { id: 'amap_image', label: '高德影像(GCJ)', stack: ['amap_image'] },
    { id: 'tengxun', label: '腾讯地图(GCJ)', stack: ['tengxun'] },
    { id: 'topo', label: '地形图', stack: ['topo'] },
    { id: 'opentopomap', label: 'OpenTopoMap', stack: ['opentopomap'] },
    { id: 'esa_topo', label: '欧空局地形', stack: ['esa_topo'] },
    { id: 'windy', label: 'windy', stack: ['windy'] },
    { id: 'windy2', label: 'windy2', stack: ['windy2'] },
    { id: 'windy_outer', label: 'windy轮廓', stack: ['windy_outer'] },
    { id: 'windy_greenland', label: 'windy Gray', stack: ['windy_greenland'] },
    { id: 'carton_light', label: 'CartoDB', stack: ['carton_light'] },
    { id: 'carton_dark', label: 'CartoDB Dark', stack: ['carton_dark'] },
    { id: 'wikepedia', label: 'Wikipedia', stack: ['wikepedia'] },
    { id: 'toner', label: 'Stamen Toner', stack: ['toner'] },
    { id: 'alidade', label: 'Alidade Sm', stack: ['alidade'] },

    { id: 'custom', label: '自定义URL', stack: ['custom'] }
];

const LAYER_SOURCE_MAP = new Map(LAYER_SOURCE_DEFINITIONS.map((item) => [item.id, item]));
const BASEMAP_PRESET_MAP = new Map(BASEMAP_PRESETS.map((item) => [item.id, item]));

// ========== 导出给 UI 的 option 与索引 ==========
/**
 * URL 图层选项列表：用于 URL 参数中的图层索引映射
 * 顺序与 BASEMAP_OPTIONS 完全一致
 */
export const URL_LAYER_OPTIONS = BASEMAP_PRESETS.map((preset) => preset.id);

/**
 * 预设底图选项列表（用于 UI 下拉菜单）
 */
export const BASEMAP_OPTIONS = BASEMAP_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label
}));

/**
 * 获取一个 option 对应的真实图层堆叠（去重，保序）
 * @param {string} optionId - 下拉 option 的值
 * @returns {string[]} 图层 ID 列表（从下到上）
 */
export function resolvePresetLayerIds(optionId: string): string[] {
    const preset = BASEMAP_PRESET_MAP.get(String(optionId || ''));
    const stack = Array.isArray(preset?.stack) && preset.stack.length ? preset.stack : [String(optionId || '')];

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

/**
 * 获取 option 的展示名称
 */
export function getBasemapOptionLabel(optionId: string): string {
    const preset = BASEMAP_PRESET_MAP.get(String(optionId || ''));
    return preset?.label || String(optionId || '');
}

/**
 * 获取图层分类（用于外部状态同步）
 */
export function getLayerCategory(layerId: string): LayerCategory {
    return LAYER_SOURCE_MAP.get(String(layerId || ''))?.category || 'base';
}

/**
 * 获取图层分组（用于外部状态同步）
 */
export function getLayerGroup(layerId: string): LayerGroup {
    return LAYER_SOURCE_MAP.get(String(layerId || ''))?.group || '专题';
}

/**
 * 创建底图配置列表（由本文件集中配置驱动）
 * @param {string} normBase - 本地瓦片基础路径
 * @param {string} tiandituTk - 天地图 Token
 * @param {string} customUrl - 自定义 XYZ URL（用于 custom 图层）
 * @returns {Array} 底图配置数组，每项含 { id, name, visible, category, group, createSource }
 */
export function createLayerConfigs(normBase: string = '/', tiandituTk: string = '', customUrl: string = '') {
    const context: LayerFactoryContext = {
        normBase,
        tiandituTk,
        customUrl
    };

    return LAYER_SOURCE_DEFINITIONS.map((definition) => ({
        id: definition.id,
        name: definition.name,
        category: definition.category,
        group: definition.group,
        visible: !!definition.defaultVisible,
        createSource: () => definition.createSource(context)
    }));
}

/**
 * [调试工具] 验证 Maps-for-free 坐标转换
 * 用法：在浏览器控制台调用 debugMFFCoordinates()
 */
export function debugMFFCoordinates() {
    console.group('[调试] Maps-for-Free 坐标转换验证');

    const correctExample = { z: 14, x: 13393, y: 9885 };
    console.log('已知正确坐标 (来自用户):', correctExample);

    const z = correctExample.z;
    const maxTiles = Math.pow(2, z);
    const tileCoord2 = (maxTiles - 1) - correctExample.y;

    console.log('\n[策略对比]');
    console.log('rawY(推算) =', tileCoord2);
    console.log('direct:', normalizeTileY(z, tileCoord2, 'direct'));
    console.log('invert-tms:', normalizeTileY(z, tileCoord2, 'invert-tms'));
    console.log('ol-negative:', normalizeTileY(z, -tileCoord2 - 1, 'ol-negative'));

    const mffUrl = `https://maps-for-free.com/layer/relief/z${correctExample.z}/row${correctExample.y}/${correctExample.z}_${correctExample.x}-${correctExample.y}.jpg`;
    console.log('\n[完整 URL]:');
    console.log(mffUrl);

    const img = new Image();
    img.onload = () => console.log('图像加载成功');
    img.onerror = () => console.error('图像加载失败 (404 或网络错误)');
    img.src = mffUrl;

    console.groupEnd();
}

/**
 * Composable：底图管理器
 * 返回所有底图相关功能的公开 API
 */
export function useBasemapManager() {
    return {
        activeGoogleTileHost,
        probeGoogleHostLatency,
        resolvePreferredGoogleHost,
        buildGoogleTileUrl,
        buildTiandituUrl,
        normalizeTileY,
        toQuadKey,
        createLayerConfigs,
        createXYZSourceFromUrl,
        detectNonStandardXYZ,
        NON_STANDARD_XYZ_ADAPTERS,
        resolvePresetLayerIds,
        getBasemapOptionLabel,
        getLayerCategory,
        getLayerGroup,
        debugMFFCoordinates
    };
}
