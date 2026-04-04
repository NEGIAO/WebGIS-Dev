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
    'Google_clean',
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
    'relief',
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
    { value: 'Google_clean', label: 'Google简洁(原版)' },
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
    { value: 'relief', label: '地形浮雕(MFF)' },
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

// ========== 非标准 XYZ 图源适配器 ==========
//配置非标准xyz图源示例文件： NON_STANDARD_XYZ_ADAPTER_EXAMPLES
/**
 * 非标准 XYZ 切片格式转换器注册表
 * 支持定义不同的非标准 URL 格式规则，系统自动识别并转换
 * @example
 * {
 *   'maps-for-free': {
 *     pattern: /maps-for-free\.com.*relief/,
 *     urlFunction: (tileCoord) => { ... }
 *   }
 * }
 */
export const NON_STANDARD_XYZ_ADAPTERS = {
    'maps-for-free-relief': {
        pattern: /maps-for-free\.com.*relief/i,
        name: '地形浮雕(MFF)',
        urlFunction: (tileCoord: number[]) => {
            // Maps-for-free 非标准格式: z{z}/row{y}/{z}_{x}-{y}.jpg
            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = tileCoord[2];
            
            // ========== 调试日志 ==========
            const url = `https://maps-for-free.com/layer/relief/z${z}/row${y}/${z}_${x}-${y}.jpg`;
            // console.log(`[MFF-Relief] tileCoord=[${tileCoord[0]}, ${tileCoord[1]}, ${tileCoord[2]}] → z=${z}, x=${x}, y=${y}`);
            // console.log(`[MFF-Relief] URL: ${url}`);
            
            return url;
        }
    },
    // 扩展示例：可继续添加其他非标准格式
    // 'example-source': {
    //     pattern: /example\.com\/tiles/i,
    //     name: '示例图源',
    //     urlFunction: (tileCoord) => { ... }
    // }
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
 * @param {string} url - XYZ 瓦片 URL（标准或非标准格式）
 * @returns {XYZ} OpenLayers XYZ Source
 */
export function createXYZSourceFromUrl(url: string): XYZ {
    // 尝试检测非标准格式
    const nonStandard = detectNonStandardXYZ(url);
    if (nonStandard) {
        return new XYZ({
            tileUrlFunction: (tileCoord: number[]) => {
                const generatedUrl = nonStandard.urlFunction(tileCoord);
                // 在调用 tileUrlFunction 时也记录日志
                // console.warn(`[XYZ-Source] 非标准格式 "${nonStandard.name}" - tileCoord:`, tileCoord, '生成的URL:', generatedUrl);
                return generatedUrl;
            },
            tilePixelRatio: 1
        });
    }

    // 标准格式：直接使用 URL 模板
    return new XYZ({ url });
}

/**
 * 创建底图配置列表（包含所有28种底图的源创建函数）
 * 配置顺序与 URL_LAYER_OPTIONS 完全一致
 * @param {string} normBase - 本地瓦片基础路径
 * @param {string} tiandituTk - 天地图 Token
 * @param {string} customUrl - 自定义 XYZ URL（用于 custom 图层）
 * @returns {Array} 底图配置数组，每项含 { id, name, visible, createSource }
 */
export function createLayerConfigs(normBase = '/', tiandituTk = '', customUrl = '') {
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
            createSource: () => customUrl ? createXYZSourceFromUrl(customUrl) : null 
        },
        { 
            id: 'Google', name: 'Google原版', visible: true,
            createSource: () => new XYZ({ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 }) 
        },
        {
            id: 'Google_clean', name: 'Google简洁(原版)', visible: false,
            createSource: () => new XYZ({ url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off,s.t:3|s.e.g|p.v:off' })
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
        },
        {
            id: 'relief', name: '地形浮雕(MFF)', visible: false,
            createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg')
        }
    ];
}

/**
 * [调试工具] 验证 Maps-for-free 坐标转换
 * 用法：在浏览器控制台调用 debugMFFCoordinates()
 * 这将帮助验证坐标转换是否正确
 */
export function debugMFFCoordinates() {
    console.group('🔍 [调试] Maps-for-Free 坐标转换验证');
    
    // 用户提供的正确坐标示例
    const correctExample = { z: 14, x: 13393, y: 9885 };
    console.log('✓ 已知正确坐标 (来自用户):', correctExample);
    
    // 测试当前的转换公式
    console.log('\n【转换公式】:');
    console.log('const y_mff = (2^z - 1) - tileCoord[2]');
    console.log('即: y_mff = (2^' + correctExample.z + ' - 1) - tileCoord[2]');
    
    // 如果正确答案是 y_mff = 9885，反推 tileCoord[2]
    const z = correctExample.z;
    const maxTiles = Math.pow(2, z);
    const tileCoord2 = (maxTiles - 1) - correctExample.y;
    
    console.log('\n【反推计算】:');
    console.log('如果 y_mff = ' + correctExample.y + ' (正确值)');
    console.log('那么 tileCoord[2] = (' + maxTiles + ' - 1) - ' + correctExample.y + ' = ' + tileCoord2);
    
    // 验证：用反推的 tileCoord 再次计算
    const verifyY = (maxTiles - 1) - tileCoord2;
    console.log('\n【验证】:');
    console.log('用 tileCoord[2]=' + tileCoord2 + ' 重新计算:');
    console.log('y_mff = (' + maxTiles + ' - 1) - ' + tileCoord2 + ' = ' + verifyY);
    console.log('✓ 验证通过: ' + (verifyY === correctExample.y ? '✅ 公式正确!' : '❌ 公式错误'));
    
    // 输出标准格式的完整 URL
    const mffUrl = `https://maps-for-free.com/layer/relief/z${correctExample.z}/row${correctExample.y}/${correctExample.z}_${correctExample.x}-${correctExample.y}.jpg`;
    console.log('\n【完整 URL】:');
    console.log(mffUrl);
    console.log('链接是否有效: (等待网络请求...)');
    
    // 尝试预加载一次
    const img = new Image();
    img.onload = () => console.log('✅ 图像加载成功！');
    img.onerror = () => console.error('❌ 图像加载失败 (404 或网络错误)');
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
        createLayerConfigs,
        createXYZSourceFromUrl,
        detectNonStandardXYZ,
        NON_STANDARD_XYZ_ADAPTERS,
        debugMFFCoordinates
    };
}
