/**
 * Agent 瓦片语义预设表。
 *
 * 作用：把两篇瓦片实测文档压缩为「用户描述 → switch_basemap 参数」的
 * 可审计规则，避免模型自行发明 ltype / apistyle 数值。
 *
 * 边界：本表只负责生成 System Prompt；不改变工具声明，不新增工具。
 */

export type TileIntentConfidence = 'high' | 'medium';

export interface TileIntentRule {
    /** 规则 ID，仅用于提示词可追溯，不暴露给用户 */
    id: string;
    /** 用户可能的自然语言描述，供模型语义匹配 */
    userPhrases: string[];
    /** 瓦片服务来源 */
    provider: 'amap' | 'google';
    /** 人类可读的目标效果 */
    effect: string;
    /** 优先使用已登记预设；presetId 与 url 二选一 */
    presetId?: string;
    /** 仅在无现成预设时提供精确 URL 模板；占位符 __TILE_PROXY_BASE_URL__ 会运行时替换 */
    url?: string;
    /** 置信度：high=已登记预设或文档强证据；medium=apistyle 等非稳定服务参数 */
    confidence: TileIntentConfidence;
    /** 必须随结果告知用户的限制 */
    caveat?: string;
}

/**
 * 用户语义到瓦片底图的受控映射。
 *
 * 顺序即优先级：用户描述冲突时取靠前规则；没有匹配项时禁止构造 URL。
 */
export const TILE_INTENT_RULES: readonly TileIntentRule[] = Object.freeze([
    {
        id: 'amap_full_vector',
        userPhrases: ['高德地图', '标准高德', '完整高德底图', '高德全要素'],
        provider: 'amap',
        effect: '高德标准中文电子底图（GCJ-02）',
        presetId: 'vector_amap_preset',
        confidence: 'high',
        caveat: 'GCJ-02；与 WGS-84 数据混用需注意偏移。',
    },
    {
        id: 'amap_clean_no_roads',
        userPhrases: [
            '高德不要道路',
            '不要道路',
            '高德无道路',
            '高德只要地貌',
            '高德只要底色',
            '高德干净底图',
            '高德简洁512',
            '高德无标注高清',
        ],
        provider: 'amap',
        effect: '高德简洁 512 底图：保留地貌/绿地/水系底色，不含道路与注记（GCJ-02）',
        presetId: 'vector_amap_clean_hd_preset',
        confidence: 'high',
        caveat: 'ltype=1 + scl=2；不能理解为「只显示水系」。',
    },
    {
        id: 'amap_clean_no_roads_wgs',
        userPhrases: [
            '高德无道路 WGS',
            '高德简洁纠偏',
            '高德干净底图 WGS',
            '高德地貌底图 WGS',
        ],
        provider: 'amap',
        effect: '高德简洁无道路底图，经代理纠偏为 WGS-84',
        presetId: 'vector_amap_clean_wgs_preset',
        confidence: 'high',
        caveat: '走纠偏代理；返回 256px 瓦片。',
    },
    {
        id: 'amap_roads_no_labels',
        userPhrases: [
            '高德只要道路',
            '高德纯道路',
            '高德有路无注记',
            '高德路网底图',
            '高德只要路网不要文字',
        ],
        provider: 'amap',
        effect: '高德地貌 + 道路，无文字注记（GCJ-02）',
        presetId: 'vector_amap_clean_roads_preset',
        confidence: 'high',
        caveat: 'ltype=3 + scl=2；不是透明叠加层。',
    },
    {
        id: 'amap_roads_wgs',
        userPhrases: [
            'WGS 下高德纯道路',
            '高德底图加纯道路 WGS',
            '高德道路叠加纠偏',
            '高德路网 WGS',
        ],
        provider: 'amap',
        effect: 'WGS-84 下高德简洁底图 + 透明纯道路叠加组合',
        presetId: 'vector_amap_pure_roads_wgs_preset',
        confidence: 'high',
        caveat: '组合底图；走纠偏代理。',
    },
    {
        id: 'amap_satellite',
        userPhrases: ['高德卫星', '高德影像', '高德纯卫星'],
        provider: 'amap',
        effect: '高德纯卫星影像（GCJ-02）',
        presetId: 'imagery_amap_preset',
        confidence: 'high',
        caveat: 'style=6；实测最高 z=18。',
    },
    {
        id: 'amap_satellite_wgs',
        userPhrases: ['高德卫星 WGS', '高德影像纠偏', '高德卫星纠偏'],
        provider: 'amap',
        effect: '高德卫星影像，经代理纠偏为 WGS-84',
        presetId: 'imagery_amap_wgs_preset',
        confidence: 'high',
        caveat: '走纠偏代理。',
    },
    {
        id: 'google_water',
        userPhrases: [
            'Google 水系',
            '谷歌水系',
            '只显示水系',
            '只显示湖泊',
            '只显示河流',
            '只显示海洋',
        ],
        provider: 'google',
        effect: 'Google 单要素水体底图（海/河/湖/水库）',
        presetId: 'imagery_google_water_preset',
        confidence: 'medium',
        caveat: 'apistyle 非稳定服务参数；高德无法单独拆出水系。',
    },
    {
        id: 'google_landuse',
        userPhrases: ['Google 土地利用', '谷歌土地利用', '只显示绿地用地', '只显示土地利用'],
        provider: 'google',
        effect: 'Google 单要素土地利用底图（公园、绿地、学校、机场等）',
        url: '__TILE_PROXY_BASE_URL__/proxy/mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=zh-CN&apistyle=s.t:0%7Cp.v:off,s.t:2%7Cp.v:on',
        confidence: 'medium',
        caveat: 'apistyle 非稳定服务参数；高德无法单独拆出土地利用。',
    },
    {
        id: 'google_roads',
        userPhrases: [
            'Google 纯路网',
            '谷歌纯路网',
            '只显示道路',
            '只显示公路',
            '只要道路骨架',
            '透明路网',
        ],
        provider: 'google',
        effect: 'Google 透明纯路网底图（无注记、无绿地水体背景）',
        url: '__TILE_PROXY_BASE_URL__/proxy/mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&apistyle=s.t:0%7Cp.v:off,s.t:3%7Cp.v:on,s.t:3%7Cs.e:l%7Cp.v:off',
        confidence: 'medium',
        caveat: 'apistyle 非稳定服务参数；透明底适合作为叠加层。',
    },
    {
        id: 'google_highways',
        userPhrases: ['Google 高速', '谷歌高速路', '只显示高速', '只显示快速路'],
        provider: 'google',
        effect: 'Google 核心干线/高速路网',
        url: '__TILE_PROXY_BASE_URL__/proxy/mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&apistyle=s.t:0%7Cp.v:off,s.t:4%7Cp.v:on',
        confidence: 'medium',
        caveat: 'apistyle 类型 ID 可能随服务端变化。',
    },
    {
        id: 'google_poi',
        userPhrases: ['Google POI', '谷歌兴趣点', '只显示 POI', '只显示兴趣点'],
        provider: 'google',
        effect: 'Google 单要素 POI 底图',
        url: '__TILE_PROXY_BASE_URL__/proxy/mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&apistyle=s.t:0%7Cp.v:off,s.t:5%7Cp.v:on',
        confidence: 'medium',
        caveat: 'apistyle 非稳定服务参数。',
    },
    {
        id: 'google_admin',
        userPhrases: ['Google 行政边界', '谷歌行政区', '只显示行政边界', '只显示行政区'],
        provider: 'google',
        effect: 'Google 单要素行政区划底图',
        url: '__TILE_PROXY_BASE_URL__/proxy/mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&apistyle=s.t:0%7Cp.v:off,s.t:1%7Cp.v:on',
        confidence: 'medium',
        caveat: 'apistyle 非稳定服务参数。',
    },
    {
        id: 'google_satellite',
        userPhrases: ['Google 卫星', '谷歌卫星', '谷歌纯卫星', 'WGS 卫星影像'],
        provider: 'google',
        effect: 'Google 纯卫星影像（WGS-84）',
        url: '__TILE_PROXY_BASE_URL__/proxy/mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        confidence: 'high',
    },
    {
        id: 'google_hybrid',
        userPhrases: ['Google 混合影像', '谷歌卫星带路网', '谷歌影像注记'],
        provider: 'google',
        effect: 'Google 卫星 + 中文路网/地名混合底图',
        url: '__TILE_PROXY_BASE_URL__/proxy/mt0.google.com/vt/lyrs=y&hl=zh-CN&x={x}&y={y}&z={z}',
        confidence: 'high',
    },
    {
        id: 'google_labels_only',
        userPhrases: ['Google 仅注记', '谷歌纯标注', '只显示注记', '只显示地名'],
        provider: 'google',
        effect: 'Google 透明注记/行政边界底图',
        url: '__TILE_PROXY_BASE_URL__/proxy/mt0.google.com/vt/lyrs=h&hl=zh-CN&x={x}&y={y}&z={z}',
        confidence: 'medium',
    },
    {
        id: 'google_clean_terrain',
        userPhrases: ['Google 干净地形', '谷歌地形去道路', '谷歌山体阴影简洁'],
        provider: 'google',
        effect: 'Google 地形混合简洁底图（关闭标签、行政区、土地利用、道路几何）',
        presetId: 'vector_Google_clean_preset',
        confidence: 'medium',
        caveat: 'apistyle 非稳定；不保证是严格纯 hillshade。',
    },
    {
        id: 'google_standard',
        userPhrases: ['Google 标准地图', '谷歌电子地图', 'Google 标准底图'],
        provider: 'google',
        effect: 'Google 标准中文电子地图',
        presetId: 'imagery_google_standard_preset',
        confidence: 'high',
    },
]);

/**
 * 明确不支持的语义。模型遇到这些需求必须如实说明，不得改写参数强行满足。
 */
export const TILE_INTENT_UNSUPPORTED: readonly string[] = Object.freeze([
    '高德单独显示水系/湖泊：ltype 的 Bit0 把地貌、绿地、水系和底色打包，无法单拆；推荐 Google 水系预设。',
    '高德单独显示土地利用：无法从 Bit0 中可靠拆分；推荐 Google 土地利用规则。',
    '任意带 key/token 的第三方瓦片 URL：本预设表不覆盖。',
    '把瓦片作为新增叠加图层：本轮仅支持 switch_basemap 替换底图槽位。',
]);

/**
 * 把用户自然语言解析为本地瓦片规则；命中失败返回 null。
 *
 * 规则不进入 System Prompt，只在 switch_basemap(intent=...) 被调用时执行。
 * 采用「完整短语 > 关键词片段 > provider 提示」的打分，避免模型自行拼参数。
 *
 * @param text 用户原话或 Agent 转述的瓦片意图
 * @returns 命中的规则；未命中返回 null
 */
export function resolveTileIntentByText(text: unknown): TileIntentRule | null {
    const raw = String(text || '').trim().toLowerCase();
    if (!raw) return null;

    const wantsAmap = /高德|amap/.test(raw);
    const wantsGoogle = /google|谷歌/.test(raw);
    let best: TileIntentRule | null = null;
    let bestScore = 0;

    for (const rule of TILE_INTENT_RULES) {
        // 用户明确指定服务商时只在该服务商内部匹配；不能把「高德只显示湖泊」
        // 静默改判为 Google 水系，必须交给不支持规则如实反馈。
        if (wantsAmap && !wantsGoogle && rule.provider !== 'amap') continue;
        if (wantsGoogle && !wantsAmap && rule.provider !== 'google') continue;

        let score = 0;
        for (const phrase of rule.userPhrases) {
            const normalized = phrase.toLowerCase();
            if (!normalized) continue;
            if (!raw.includes(normalized)) continue;
            // 「高德地图」「Google 标准地图」这类只标识来源/全图的短语权重低，
            // 避免压过「不要道路」「只显示水系」等真正区分要素的语义。
            const isGeneric = /^(高德地图|标准高德|完整高德底图|高德全要素|google 标准地图|谷歌电子地图|google 标准底图)$/i.test(normalized);
            score += isGeneric ? 1 : normalized.length * normalized.length;
        }
        if (!score) continue;
        if (wantsAmap && rule.provider === 'amap') score += 12;
        if (wantsGoogle && rule.provider === 'google') score += 12;
        if (wantsAmap && rule.provider === 'google') score -= 8;
        if (wantsGoogle && rule.provider === 'amap') score -= 8;
        if (score > bestScore) {
            best = rule;
            bestScore = score;
        }
    }

    return bestScore >= 6 ? best : null;
}

/**
 * 将命中规则解析为 switch_basemap 的安全参数。
 *
 * @param text 用户原始意图
 * @param tileProxyBaseUrl 瓦片代理基址，运行时来自 publicRuntime
 * @returns presetId / url 二选一，或错误信息
 */
export function resolveTileBasemapArg(text: unknown, tileProxyBaseUrl?: string): {
    presetId?: string;
    url?: string;
    error?: string;
} {
    const rule = resolveTileIntentByText(text);
    if (!rule) {
        const raw = String(text || '').toLowerCase();
        const wantsAmap = /高德|amap/.test(raw);
        if (wantsAmap && /水系|湖泊|河流|海洋|土地利用/.test(raw)) {
            return {
                error: '高德 ltype 无法单独拆分水系/湖泊或土地利用；如需要单要素图层，请改用 Google 水系/土地利用。',
            };
        }
        return { error: '未识别的瓦片语义；请提供明确的 presetId 或标准 XYZ url，不要自行拼接参数。' };
    }
    if (rule.presetId) return { presetId: rule.presetId };
    const proxyBase = String(tileProxyBaseUrl || '').replace(/\/+$/, '');
    return {
        url: String(rule.url || '').replace(/__TILE_PROXY_BASE_URL__/g, proxyBase),
    };
}

/**
 * 兼容旧调用：规则表不再注入 System Prompt。
 * 保留导出避免外部引用报错，返回空字符串。
 */
export function formatTileIntentRulesForPrompt(): string {
    return '';
}
