/**
 * chatIntentFallback - GIS 意图识别回退库（纯函数，无副作用）
 *
 * 当 LLM 未返回结构化工具调用时，用正则从用户消息中识别 GIS 意图，
 * 兜底生成 search_and_zoom / switch_basemap 工具调用。
 * Agent 底图回退只返回稳定 presetId，不接受或转发任意 URL。
 */

import { DEFAULT_SEARCH_ZOOM } from '@common/utils/mapDefaults';

/** 底图关键词 → 稳定预设 ID */
const BASEMAP_PRESET_MAPPING = Object.freeze({
    '高德卫星': { presetId: 'imagery_amap_preset', name: '高德影像' },
    '高德影像': { presetId: 'imagery_amap_preset', name: '高德影像' },
    '高德': { presetId: 'vector_amap_preset', name: '高德地图' },
    'amap': { presetId: 'vector_amap_preset', name: '高德地图' },
    '高德路网': { presetId: 'vector_amap_preset', name: '高德地图' },
    'osm标准': { presetId: 'vector_osm_preset', name: 'OSM标准' },
    'osm': { presetId: 'vector_osm_preset', name: 'OSM标准' },
    'openstreetmap': { presetId: 'vector_osm_preset', name: 'OSM标准' },
    'carto暗色': { presetId: 'vector_carton_dark_preset', name: 'Carto深色' },
    'carto亮色': { presetId: 'vector_carton_light_preset', name: 'Carto浅色' },
    '谷歌矢量': { presetId: 'vector_tuxin_preset', name: '图新矢量' },
    'google': { presetId: 'imagery_google_preset', name: 'Google影像' },
    '谷歌': { presetId: 'imagery_google_preset', name: 'Google影像' },
    '谷歌卫星': { presetId: 'imagery_google_preset', name: 'Google影像' },
    '卫星': { presetId: 'imagery_tianditu_preset', name: '天地图影像' },
    '地形': { presetId: 'arcgis_topo_preset', name: 'ESRI世界地形' },
    '矢量': { presetId: 'vector_tianditu_preset', name: '天地图矢量' },
    '天地图': { presetId: 'imagery_tianditu_preset', name: '天地图影像' },
    '天地图矢量': { presetId: 'vector_tianditu_preset', name: '天地图矢量' },
    'esri影像': { presetId: 'arcgis_imagery_preset', name: 'ESRI影像' },
    'esri街道': { presetId: 'arcgis_street_preset', name: 'ESRI街道' },
});

const SEARCH_PATTERNS = [
    /(?:定位到?|搜索|查找?|去到?|飞到?|缩放到|前往|移动到?|显示)\s*[「"']?(.+?)[」"']?\s*(?:的位置|地方|在哪里|的范围)?$/,
    /^(.+?)(?:在哪里|在哪儿|怎么去|的坐标|的位置)$/,
    /(?:看看|查看)\s*(.+?)$/,
];

const BASEMAP_PATTERNS = [
    /(?:切换到?|换成?|使用|启用|换上|加载)\s*[「"']?(.+?)[」"']?\s*(?:底图|地图|图源|卫星)?$/,
    /(?:底图|地图|图源)\s*(?:切换到?|换成?|使用)\s*[「"']?(.+?)[」"']?$/,
];

const SEARCH_EXCLUDE_WORDS = ['一下', '一下下', '这个', '那个', '什么', '怎么', '为什么', '地图', '底图'];

/**
 * @param {string} userMsg
 * @returns {{ name: string, arguments: Object } | null}
 */
export function detectGISIntent(userMsg) {
    const rawMsg = String(userMsg || '').trim();
    const msg = rawMsg.toLowerCase();
    if (!rawMsg) return null;

    // Never turn pasted URLs into Agent tool calls.
    if (/https?:\/\/[^\s]+/i.test(rawMsg)) return null;

    for (const pattern of SEARCH_PATTERNS) {
        const match = msg.match(pattern);
        if (match && match[1] && match[1].length >= 2) {
            const query = match[1].trim();
            if (!SEARCH_EXCLUDE_WORDS.includes(query)) {
                return { name: 'search_and_zoom', arguments: { query, zoom: DEFAULT_SEARCH_ZOOM } };
            }
        }
    }

    for (const pattern of BASEMAP_PATTERNS) {
        const match = msg.match(pattern);
        if (!match?.[1]) continue;
        const target = match[1].trim().toLowerCase();
        for (const [keyword, preset] of Object.entries(BASEMAP_PRESET_MAPPING)) {
            if (target.includes(keyword.toLowerCase())) {
                return {
                    name: 'switch_basemap',
                    arguments: { presetId: preset.presetId },
                };
            }
        }
    }

    return null;
}

export function getToolDisplayName(name, args = {}) {
    // HTML 实体转义，防止用户输入破坏 DOM 结构
    const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
    const displayNames = {
        set_map_view: args.view === 'cesium' ? '切换到 3D 地图' : '切换到 2D 地图',
        set_view_center: '移动地图中心',
        set_camera_orientation: '调整 3D 相机姿态',
        zoom_to_extent: '缩放到指定范围',
        search_and_zoom: `定位到 "${escapeHtml(args.query || '未知位置')}"`,
        switch_basemap: args.url
            ? `切换底图：${escapeHtml(args.url)}`
            : `切换到底图：${escapeHtml(args.presetId || '未知预设')}`,
    };
    return displayNames[name] || `执行工具：${escapeHtml(name)}`;
}
