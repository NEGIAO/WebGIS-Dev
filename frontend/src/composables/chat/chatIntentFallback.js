/**
 * chatIntentFallback - GIS 意图识别回退库（纯函数，无副作用）
 *
 * 当 LLM 未返回结构化工具调用时，用正则从用户消息中识别 GIS 意图，
 * 兜底生成 search_and_zoom / switch_basemap 工具调用。
 *
 * 输入: 用户原始消息 + 运行时天地图 token
 * 输出: 工具调用对象 { name, arguments } 或 null
 */

/** 底图关键词 → XYZ 图源映射（tiandituTk 由调用方注入） */
function buildBasemapUrlMapping(tiandituTk) {
    return {
        '高德卫星': {
            url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
            name: '高德卫星',
        },
        '高德': {
            url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
            name: '高德卫星',
        },
        'amap': {
            url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
            name: '高德卫星',
        },
        '高德路网': {
            url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            name: '高德路网',
        },
        'osm标准': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            name: 'OpenStreetMap',
        },
        'carto暗色': {
            url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            name: 'CartoDB 暗色',
        },
        'carto亮色': {
            url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            name: 'CartoDB 亮色',
        },
        '谷歌矢量': {
            url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            name: '谷歌矢量',
        },
        'google': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            name: '谷歌卫星',
        },
        '谷歌': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            name: '谷歌卫星',
        },
        '谷歌卫星': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            name: '谷歌卫星',
        },
        '卫星': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            name: '谷歌卫星',
        },
        '谷歌地形': {
            url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
            name: '谷歌地形',
        },
        '地形': {
            url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
            name: 'OpenTopoMap',
        },
        '矢量': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            name: 'OpenStreetMap',
        },
        'osm': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            name: 'OpenStreetMap',
        },
        'openstreetmap': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            name: 'OpenStreetMap',
        },
        '天地图': {
            url: `https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=img&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={level}&TILEROW={row}&TILECOL={col}&tk=${tiandituTk || ''}`,
            name: '天地图卫星',
        },
        '中国渲染': {
            url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
            name: '中国渲染',
        },
    };
}

/** 搜索定位类意图正则 */
const SEARCH_PATTERNS = [
    /(?:定位到?|搜索|查找?|去到?|飞到?|缩放到|前往|移动到?|显示)\s*[「"']?(.+?)[」"']?\s*(?:的位置|地方|在哪里|的范围)?$/,
    /^(.+?)(?:在哪里|在哪儿|怎么去|的坐标|的位置)$/,
    /(?:看看|查看)\s*(.+?)$/,
];

/** 底图切换类意图正则 */
const BASEMAP_PATTERNS = [
    /(?:切换到?|换成?|使用|启用|换上|加载)\s*[「"']?(.+?)[」"']?\s*(?:底图|地图|图源|卫星)?$/,
    /(?:底图|地图|图源)\s*(?:切换到?|换成?|使用)\s*[「"']?(.+?)[」"']?$/,
];

/** 搜索意图排除词（避免"看看这个"之类误触发） */
const SEARCH_EXCLUDE_WORDS = ['一下', '一下下', '这个', '那个', '什么', '怎么', '为什么', '地图', '底图'];

/**
 * 从用户消息识别 GIS 意图，生成兜底工具调用
 * @param {string} userMsg - 用户原始消息
 * @param {{ tiandituTk?: string }} [options] - 运行时依赖（天地图 token）
 * @returns {{ name: string, arguments: Object } | null}
 */
export function detectGISIntent(userMsg, options = {}) {
    const rawMsg = String(userMsg || '').trim();
    const msg = rawMsg.toLowerCase();
    if (!rawMsg) return null;

    // 1. 搜索定位意图
    for (const pattern of SEARCH_PATTERNS) {
        const match = msg.match(pattern);
        if (match && match[1] && match[1].length >= 2) {
            const query = match[1].trim();
            if (!SEARCH_EXCLUDE_WORDS.includes(query)) {
                return { name: 'search_and_zoom', arguments: { query, zoom: 16 } };
            }
        }
    }

    // 2. 自定义 XYZ URL 直贴意图
    const urlMatch = rawMsg.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
        const url = urlMatch[0];
        if (url.includes('{x}') || url.includes('{y}') || url.includes('{z}') || url.includes('{0-7}')) {
            const normalizedUrl = url.replace(/\{0-7\}/, '01');
            return {
                name: 'switch_basemap',
                arguments: { url: normalizedUrl, name: '自定义图源' },
            };
        }
    }

    // 3. 底图关键词切换意图
    const basemapUrlMapping = buildBasemapUrlMapping(options.tiandituTk);
    for (const pattern of BASEMAP_PATTERNS) {
        const match = msg.match(pattern);
        if (match && match[1]) {
            const target = match[1].trim().toLowerCase();
            for (const [keyword, xyzConfig] of Object.entries(basemapUrlMapping)) {
                if (target.includes(keyword.toLowerCase())) {
                    return {
                        name: 'switch_basemap',
                        arguments: { url: xyzConfig.url, name: xyzConfig.name },
                    };
                }
            }
        }
    }

    return null;
}

/**
 * 工具调用的用户友好显示名
 * @param {string} name - 工具名
 * @param {Object} [args] - 工具参数
 * @returns {string}
 */
export function getToolDisplayName(name, args = {}) {
    const displayNames = {
        zoom_to_extent: '缩放到指定范围',
        search_and_zoom: `定位到 "${args.query || '未知位置'}"`,
        switch_basemap: `切换到底图：${args.name || '自定义图源'}`,
    };
    return displayNames[name] || `执行工具：${name}`;
}
