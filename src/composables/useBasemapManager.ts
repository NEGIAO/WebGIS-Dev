/**
 * 底图管理 Composable
 * 集中管理所有底图配置、Google 主机选择、URL 构建等逻辑
 * 供 MapContainer 和 LayerControlPanel 共享使用
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

// ========== 底图索引列表 ==========
/**
 * URL 图层选项列表：用于 URL 参数中的图层索引映射
 * 与 BASEMAP_OPTIONS 顺序一致，用于 URL 分享中的图层位置查询
 */
export const URL_LAYER_OPTIONS = [
    'local',
    'tianDiTu_vec',
    'tianDiTu',
    'google',
    'Google',
    'google_standard',
    'google_clean',
    'osm',
    'yandex_sat',
    'geoq_gray',
    'geoq_hydro',
    'amap',
    'amap_image',
    'tengxun',
    'topo',
    'opentopomap',
    'esa_topo',
    'windy',
    'windy2',
    'windy_outer',
    'windy_greenland',
    'carton_light',
    'carton_dark',
    'wikepedia',
    'toner',
    'alidade',
    'custom'
];

// ========== 底图选择面板选项 ==========
/**
 * 预设底图选项列表（用于 UI 下拉菜单）
 * 包含本地瓦片、天地图、Google、OSM、高德、腾讯、Yandex 等全球服务
 * 支持自定义 URL 底图输入
 * @note 新增在线底图时：1. 在此添加 UI 选项 2. 在 URL_LAYER_OPTIONS 中添加对应 ID 3. 在 createLayerConfigs 中添加源创建函数
 */
export const BASEMAP_OPTIONS = [
    { value: 'local', label: '自定义瓦片' },
    { value: 'tianDiTu_vec', label: '天地图矢量' },
    { value: 'tianDiTu', label: '天地图影像' },
    { value: 'google', label: 'Google(gac)' },
    { value: 'Google', label: 'Google原版' },
    { value: 'google_standard', label: 'Google标准' },
    { value: 'google_clean', label: 'Google简洁' },
    { value: 'osm', label: 'OSM(需梯子)' },
    { value: 'yandex_sat', label: 'Yandex卫星' },
    { value: 'geoq_gray', label: 'GeoQ灰(GCJ)' },
    { value: 'geoq_hydro', label: 'GeoQ水(GCJ)' },
    { value: 'amap', label: '高德地图(GCJ)' },
    { value: 'amap_image', label: '高德影像(GCJ)' },
    { value: 'tengxun', label: '腾讯地图(GCJ)' },
    { value: 'topo', label: '地形图' },
    { value: 'opentopomap', label: 'OpenTopoMap' },
    { value: 'esa_topo', label: '欧空局地形' },
    { value: 'windy', label: 'windy' },
    { value: 'windy2', label: 'windy2' },
    { value: 'windy_outer', label: 'windy轮廓' },
    { value: 'windy_greenland', label: 'windy Gray' },
    { value: 'carton_light', label: 'CartoDB' },
    { value: 'carton_dark', label: 'CartoDB Dark' },
    { value: 'wikepedia', label: 'Wikipedia' },
    { value: 'toner', label: 'Stamen Toner' },
    { value: 'alidade', label: 'Alidade Sm' },
    { value: 'custom', label: '自定义URL' }
];

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
export function probeGoogleHostLatency(host, timeoutMs = GOOGLE_PROBE_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const start = performance.now();
        const img = new Image();
        let settled = false;
        const end = (latency) => {
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
export const buildGoogleTileUrl = (pathAndQuery) => `https://${activeGoogleTileHost.value}${pathAndQuery}`;

/**
 * 拼接天地图瓦片服务 URL。
 * @param {string} pathAndQuery - 路径和查询字符串（包含 ? 或 不包含）
 * @param {string} tiandituTk - 天地图 Token
 * @returns {string} 完整的天地图 URL
 */
export const buildTiandituUrl = (pathAndQuery, tiandituTk) => {
    const hasQuery = pathAndQuery.includes('?');
    const separator = hasQuery ? '&' : '?';
    return `https://${TILE_HOSTS.tianditu}${pathAndQuery}${separator}tk=${tiandituTk}`;
};

/**
 * 创建底图配置列表（包含所有27种底图的源创建函数）
 * 配置顺序与 URL_LAYER_OPTIONS 完全一致
 * @param {string} normBase - 本地瓦片基础路径
 * @param {string} tiandituTk - 天地图 Token
 * @returns {Array} 底图配置数组，每项含 { id, name, visible, createSource }
 */
export function createLayerConfigs(normBase = '/', tiandituTk = '') {
    return [
        // ========== 注记图层（置顶，支持拖拽控制显示层级） ==========
        { 
            id: 'label', name: '天地图注记', visible: true,
            createSource: () => new XYZ({ url: `${buildTiandituUrl('/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)}` }) 
        },
        { 
            id: 'label_vector', name: '天地图矢量注记', visible: false,
            createSource: () => new XYZ({ url: `${buildTiandituUrl('/cva_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cva&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)}` }) 
        },
        // ========== 主底图层（顺序与 URL_LAYER_OPTIONS 一致） ==========
        { 
            id: 'local', name: '自定义瓦片', visible: false,
            createSource: () => new XYZ({ url: `${normBase}tiles/{z}/{x}/{y}.png` }) 
        },
        { 
            id: 'custom', name: '自定义URL', visible: false,
            createSource: () => null 
        },
        { 
            id: 'Google', name: 'Google原版', visible: true,
            createSource: () => new XYZ({ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 }) 
        },
        { 
            id: 'tianDiTu_vec', name: '天地图矢量', visible: false,
            createSource: () => new XYZ({ url: `${buildTiandituUrl('/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)}` }) 
        },
        { 
            id: 'tianDiTu', name: '天地图影像', visible: false,
            createSource: () => new XYZ({ url: `${buildTiandituUrl('/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)}` }) 
        },
        { 
            id: 'google', name: 'Google(gac)', visible: true,
            createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=s&x={x}&y={y}&z={z}'), maxZoom: 20 }) 
        },
        { 
            id: 'google_standard', name: 'Google标准', visible: false,
            createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=m&x={x}&y={y}&z={z}') }) 
        },
        { 
            id: 'google_clean', name: 'Google简洁', visible: false,
            createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=m&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off,s.t:3|s.e.g|p.v:off') }) 
        },
        { 
            id: 'osm', name: 'OSM(需梯子)', visible: false,
            createSource: () => new OSM() 
        },
        {
            id: 'yandex_sat', name: 'Yandex卫星', visible: false,
            createSource: () => new XYZ({ url: 'https://sat02.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}' })
        },
        {
            id: 'geoq_gray', name: 'GeoQ灰(GCJ)', visible: false,
            createSource: () => new XYZ({ url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldGrayMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldGrayMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png' })
        },
        {
            id: 'geoq_hydro', name: 'GeoQ水(GCJ)', visible: false,
            createSource: () => new XYZ({ url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png' })
        },
        { 
            id: 'amap', name: '高德地图(GCJ)', visible: false,
            createSource: () => new XYZ({ url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}' }) 
        },
        {
            id: 'amap_image', name: '高德影像(GCJ)', visible: false,
            createSource: () => new XYZ({ url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}' })
        },
        { 
            id: 'tengxun', name: '腾讯地图(GCJ)', visible: false,
            createSource: () => new XYZ({ url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0' }) 
        },
        {
            id: 'topo', name: '地形图', visible: false,
            createSource: () => new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' })
        },
        {
            id: 'opentopomap', name: 'OpenTopoMap', visible: false,
            createSource: () => new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' })
        },
        {
            id: 'esa_topo', name: '欧空局地形', visible: false,
            createSource: () => new XYZ({ url: 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png' })
        },
        {
            id: 'windy', name: 'windy', visible: false,
            createSource: () => new XYZ({ url: 'https://tiles.windy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}/?lang=en' })
        },
        {
            id: 'windy2', name: 'windy2', visible: false,
            createSource: () => new XYZ({ url: 'https://tiles.windy.com/v1/maptiles/winter/256/{z}/{x}/{y}/?lang=en' })
        },
        {
            id: 'windy_outer', name: 'windy轮廓', visible: false,
            createSource: () => new XYZ({ url: 'https://tiles.windy.com/tiles/v10.0/darkmap-retina/{z}/{x}/{y}.png' })
        },
        {
            id: 'windy_greenland', name: 'windy Gray', visible: false,
            createSource: () => new XYZ({ url: 'https://tiles.windy.com/tiles/v10.0/grayland/{z}/{x}/{y}.png' })
        },
        {
            id: 'carton_light', name: 'CartoDB', visible: false,
            createSource: () => new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png' })
        },
        {
            id: 'carton_dark', name: 'CartoDB Dark', visible: false,
            createSource: () => new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' })
        },
        {
            id: 'wikepedia', name: 'Wikipedia', visible: false,
            createSource: () => new XYZ({ url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png' })
        },
        {
            id: 'toner', name: 'Stamen Toner', visible: false,
            createSource: () => new XYZ({ url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png' })
        },
        {
            id: 'alidade', name: 'Alidade Sm', visible: false,
            createSource: () => new XYZ({ url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png' })   
        }
    ];
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
        createLayerConfigs
    };
}
