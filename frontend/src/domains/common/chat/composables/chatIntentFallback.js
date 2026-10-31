/**
 * chatIntentFallback - GIS 意图识别回退库（纯函数，无副作用）
 *
 * 当 LLM 未返回结构化工具调用时，用正则从用户消息中识别 GIS 意图，
 * 兜底生成 search_and_zoom / switch_basemap / get_weather 工具调用。
 * Agent 底图回退只返回稳定 presetId，不接受或转发任意 URL。
 */

import { DEFAULT_SEARCH_ZOOM } from '@common/utils/mapDefaults';

/**
 * 底图关键词 → 稳定预设 ID
 *
 * 匹配规则：按关键词长度降序命中最长关键词（见 BASEMAP_MAPPING_ENTRIES），
 * 不再依赖对象插入顺序——旧实现「谷歌」会抢先截胡「谷歌代理卫星」。
 *
 * 选型规则：同一家数据有「代理」与「直连」两条路时一律指向代理版。
 * switch_basemap 成功只代表图层栈切换完成，不代表瓦片能加载：国内直连
 * Google/OSM 会「切换成功但满屏空白」；gcj2wgs / bd2wgs 代理除保证可达，
 * 还把 GCJ-02 / BD-09 瓦片纠偏到 WGS84，与地图中心坐标一致。
 * 需要直连原始版本时用「高德原版」「谷歌原版」这类显式关键词。
 */
const BASEMAP_PRESET_MAPPING = Object.freeze({
    // ── 代理型：后端 https://vpn.negiao.cn/proxy/ 取瓦片，国内稳定可达 ──
    '谷歌代理': { presetId: 'google_Backend_Proxy_preset', name: '谷歌代理' },
    '代理卫星': { presetId: 'google_Backend_Proxy_preset', name: '谷歌代理' },
    '代理影像': { presetId: 'google_Backend_Proxy_preset', name: '谷歌代理' },
    '代理底图': { presetId: 'google_Backend_Proxy_preset', name: '谷歌代理' },
    '谷歌卫星': { presetId: 'google_Backend_Proxy_preset', name: '谷歌代理' },
    '谷歌影像': { presetId: 'google_Backend_Proxy_preset', name: '谷歌代理' },
    '谷歌': { presetId: 'google_Backend_Proxy_preset', name: '谷歌代理' },
    'google': { presetId: 'google_Backend_Proxy_preset', name: '谷歌代理' },
    '谷歌原版': { presetId: 'imagery_google_preset', name: 'Google原版' },
    '谷歌标准': { presetId: 'imagery_google_standard_preset', name: 'Google标准' },
    'gac': { presetId: 'imagery_gac_preset', name: 'Google(gac)' },
    'osm代理': { presetId: 'osm_Backend_Proxy_preset', name: 'OSM代理' },
    'osm': { presetId: 'osm_Backend_Proxy_preset', name: 'OSM代理' },
    'openstreetmap': { presetId: 'osm_Backend_Proxy_preset', name: 'OSM代理' },
    '高德卫星': { presetId: 'imagery_amap_wgs_preset', name: '高德影像(WGS)' },
    '高德影像': { presetId: 'imagery_amap_wgs_preset', name: '高德影像(WGS)' },
    '高德地图': { presetId: 'vector_amap_wgs_preset', name: '高德地图(WGS)' },
    '高德矢量': { presetId: 'vector_amap_wgs_preset', name: '高德地图(WGS)' },
    '高德原版': { presetId: 'vector_amap_preset', name: '高德地图' },
    '高德': { presetId: 'vector_amap_wgs_preset', name: '高德地图(WGS)' },
    'amap': { presetId: 'vector_amap_wgs_preset', name: '高德地图(WGS)' },
    '腾讯': { presetId: 'vector_tengxun_wgs_preset', name: '腾讯地图(WGS)' },
    '百度': { presetId: 'vector_baidu_wgs_preset', name: '百度地图(WGS)' },
    '船舶': { presetId: 'ship66_preset', name: '船舶网' },

    // ── 国内直连：服务本身在国内 ──
    '天地图卫星': { presetId: 'imagery_tianditu_preset', name: '天地图影像' },
    '天地图影像': { presetId: 'imagery_tianditu_preset', name: '天地图影像' },
    '天地图矢量': { presetId: 'vector_tianditu_preset', name: '天地图矢量' },
    '天地图': { presetId: 'imagery_tianditu_preset', name: '天地图影像' },
    '星图影像': { presetId: 'imagery_tuxin_preset', name: '星图影像' },
    '星图矢量': { presetId: 'vector_tuxin_preset', name: '星图矢量' },
    '图新': { presetId: 'vector_tuxin_preset', name: '星图矢量' },
    'esri影像': { presetId: 'arcgis_imagery_preset', name: 'ESRI影像' },
    'esri卫星': { presetId: 'arcgis_imagery_preset', name: 'ESRI影像' },
    'esri街道': { presetId: 'arcgis_street_preset', name: 'ESRI街道' },
    'esri地形': { presetId: 'arcgis_topo_preset', name: 'ESRI世界地形' },
    'esri': { presetId: 'arcgis_imagery_preset', name: 'ESRI影像' },
    'arcgis': { presetId: 'arcgis_imagery_preset', name: 'ESRI影像' },

    // ── 通用语义：无品牌指向时的兜底归属 ──
    '卫星图': { presetId: 'imagery_tianditu_preset', name: '天地图影像' },
    '卫星影像': { presetId: 'imagery_tianditu_preset', name: '天地图影像' },
    '卫星': { presetId: 'imagery_tianditu_preset', name: '天地图影像' },
    '影像': { presetId: 'imagery_tianditu_preset', name: '天地图影像' },
    '地形': { presetId: 'arcgis_topo_preset', name: 'ESRI世界地形' },
    '等高线': { presetId: 'arcgis_topo_preset', name: 'ESRI世界地形' },
    '矢量': { presetId: 'vector_tianditu_preset', name: '天地图矢量' },
    '暗色': { presetId: 'vector_carton_dark_preset', name: 'Carto深色' },
    '深色': { presetId: 'vector_carton_dark_preset', name: 'Carto深色' },
    '浅色': { presetId: 'vector_carton_light_preset', name: 'Carto浅色' },
    '简洁': { presetId: 'vector_Google_clean_preset', name: 'Google简洁' },
    '水彩': { presetId: 'theme_stamen_watercolor_preset', name: 'Stamen水彩' },
});

/**
 * 关键词按长度降序预排序（构建期一次，非每次对话开销）。
 * 长词优先是「最长匹配」规则：'谷歌代理'(4) 先于 '谷歌'(2) 被判中。
 */
const BASEMAP_MAPPING_ENTRIES = Object.entries(BASEMAP_PRESET_MAPPING)
    .map(([keyword, preset]) => ({ keyword: keyword.toLowerCase(), preset }))
    .sort((a, b) => b.keyword.length - a.keyword.length);


const SEARCH_PATTERNS = [
    // 「查(?!询)」：'查找?' 原会匹配单个「查」，把「**查**询北京的天气」解析成
    // query="询北京的天气和温度"。负向前瞻排除「查询」这个动词，其余「查」「查找」不受影响。
    /(?:定位到?|搜索|查(?!询)找?|去到?|飞到?|缩放到|前往|移动到?|显示)\s*[「"']?(.+?)[」"']?\s*(?:的位置|地方|在哪里|的范围)?$/,
    /^(.+?)(?:在哪里|在哪儿|怎么去|的坐标|的位置)$/,
    /(?:看看|查看)\s*(.+?)$/,
];

const BASEMAP_PATTERNS = [
    // 末尾不再吞「卫星」：它是有效的底图关键词（影像类），吞掉会把「高德卫星」降级成「高德」矢量
    /(?:切换到?|切到|换成?|使用|启用|换上|加载)\s*[「"']?(.+?)[」"']?\s*(?:底图|地图|图源)?$/,
    /(?:底图|地图|图源)\s*(?:切换到?|换成?|使用)\s*[「"']?(.+?)[」"']?$/,
];

const SEARCH_EXCLUDE_WORDS = ['一下', '一下下', '这个', '那个', '什么', '怎么', '为什么', '地图', '底图'];

/**
 * 天气意图兜底：要求出现明确动词，不做「XX天气」这种无动词宽松匹配。
 * 无动词的「今天天气怎么样」会把「今天」当成城市名，比不兜底更糟（会走到 ADCODE_NOT_FOUND），
 * 这类句子留给 LLM 处理。
 */
const WEATHER_PATTERNS = [
    /(?:查询|查一下|查看|查查|看看|问一下)\s*([\u4e00-\u9fa5]{2,8}?)\s*的?\s*(?:天气|气温|温度)/,
];
/** 非地名占位词：命中即放弃兜底，交回 LLM */
const WEATHER_CITY_EXCLUDE = [
    '一下', '今天', '明天', '后天', '现在', '目前', '最近', '这周', '下周', '这里', '附近', '当地',
];
/**
 * 时间副词剥离：正则捕获会把时间词一起吃进城市名
 * （「查询上海未来几天的天气」→ "上海未来几天"，「查一下明天北京的天气」→ "明天北京"），
 * 直接送进地理编码会 ADCODE_NOT_FOUND，故先剔除再校验。
 */
const WEATHER_TIME_TOKENS = /未来\s*[一二三四五六七八九十\d]+\s*天|未来几天|未来|明天|后天|今天|现在|目前|这周|下周|最近/g;
/** 预报意图判据 */
const FORECAST_HINT = /(未来|明天|后天|这周|下周|预报)/;

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

    // 天气必须排在搜索之前：SEARCH_PATTERNS 的「查找?」会把「**查**询北京的天气」里的
    // 单个「查」当作搜索动词，解析出 "询北京的天气和温度" 这种垃圾 query。
    for (const pattern of WEATHER_PATTERNS) {
        const match = msg.match(pattern);
        if (!match?.[1]) continue;
        // 剥掉被一并捕获的时间词（前缀与后缀都要处理）：
        // 「明天北京」→「北京」；「上海未来几天」→「上海」；「今天」这类纯时间词剥离后为空，直接放弃兜底
        const city = match[1].replace(WEATHER_TIME_TOKENS, '').trim();
        if (city.length < 2 || WEATHER_CITY_EXCLUDE.includes(city)) continue;
        return {
            name: 'get_weather',
            arguments: { city, type: FORECAST_HINT.test(rawMsg) ? 'all' : 'base' },
        };
    }

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
        for (const { keyword, preset } of BASEMAP_MAPPING_ENTRIES) {
            if (target.includes(keyword)) {
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
        // 天气是只读查询，不改变画布；城市可能只给 adcode，故两者都做兜底
        get_weather: `查询天气：${escapeHtml(args.city || args.adcode || '未知城市')}${
            args.type === 'all' ? '（未来预报）' : '（实况）'
        }`,
    };
    return displayNames[name] || `执行工具：${escapeHtml(name)}`;
}
