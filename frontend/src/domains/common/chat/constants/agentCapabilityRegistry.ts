/**
 * Agent 能力注册表（V3.7.27，L3 架构重构）
 *
 * 定位：工具层元数据的单一事实来源（SSOT）。借鉴 Skill 的「渐进披露」——
 * 能力按组登记，触发关键词与交互机制集中在此，供工具路由与 System Prompt
 * 派生，避免同一语义散落多处、改一处漏一处（V3.7.21 代理卫星 bug 的根因）。
 *
 * 边界（见 Docs/TODO/2026-11-27-agent-capability-registry-plan.md）：
 * - 不纳入底图品牌映射（50+ 条数据字典，留在 chatIntentFallback.ts）；
 * - 不纳入单要素切片规则（19 条，留在 tileIntentPresets.ts 作 SSOT）；
 * - 不纳入工具 parameters JSON Schema（留在 agentToolsSchema.ts）；
 * - description 全文也留在 schema——今天 V3.7.22/23 证明措辞敏感，零漂移优先。
 *
 * 本注册表承载：分组、触发关键词（派生 router）、交互机制（按需注入 Prompt）。
 */

/** 工具分组：与 agentToolRouter 的分组一一对应 */
export type CapabilityGroup =
    | 'core'
    | 'weather'
    | 'geocode'
    | 'compass'
    | 'layer'
    | 'export'
    | 'view';

/** 单个工具的能力元数据 */
export interface AgentCapability {
    /** 工具名，与 AGENT_TOOLS / TOOL_REGISTRY 的 key 严格一致 */
    name: string;
    /** 所属分组；core 为常驻工具 */
    group: CapabilityGroup;
    /** 触发关键词（正则源字符串），仅用于本地工具路由，不进 LLM */
    triggers: readonly string[];
}

/** 核心工具：无明确意图时常驻，覆盖定位/换底图/读状态/图层前置 */
export const CORE_CAPABILITIES = [
    'search_and_zoom',
    'switch_basemap',
    'get_map_state',
    'list_layers',
] as const;

/**
 * 分组触发器：命中任一正则即把该组工具加入工具集。
 * 正则源从 V3.7.19 agentToolRouter.ts 原样迁入，行为零漂移。
 */
export const CAPABILITY_GROUPS: ReadonlyArray<{
    group: CapabilityGroup;
    names: readonly string[];
    triggers: readonly string[];
}> = Object.freeze([
    {
        group: 'weather',
        names: ['get_weather'],
        triggers: ['天气', '气温', '温度', '下雨', '降雨', '预报', '阴天', '晴天', '气候', 'weather'],
    },
    {
        group: 'geocode',
        names: ['geocode', 'reverse_geocode'],
        triggers: ['坐标', '经纬度', '地址解析', '反查', '在哪', '哪里', '地址转', 'coordinates'],
    },
    {
        group: 'compass',
        names: ['enable_compass'],
        triggers: ['风水', '罗盘', '卦', '堪舆', '阴宅', '阳宅', '朝向分析', '八宅', '玄空', 'compass'],
    },
    {
        group: 'layer',
        names: [
            'get_layer_info',
            'get_measure_result',
            'set_layer_visibility',
            'set_layer_opacity',
            'zoom_to_layer',
            'solo_layer',
            'remove_layer',
        ],
        triggers: ['图层', 'layer', '可见', '隐藏', '透明度', '单独显示', '缩放', '删除', '移除', '要素', '测量', '测距', '测面', '面积', '距离'],
    },
    {
        group: 'export',
        names: ['export_layer_geojson'],
        triggers: ['导出', '下载', '保存', 'geojson', 'csv', 'gpx', '文件给我'],
    },
    {
        group: 'view',
        names: ['set_map_view', 'set_view_center', 'set_camera_orientation', 'zoom_to_extent'],
        triggers: ['2d', '3d', '二维', '三维', '视图', '相机', '视角', '姿态', '航向', '俯仰', '翻滚', '旋转', 'heading', 'pitch', 'roll', '边界框', 'bbox', '范围', '中心', '移到', '移动到', '放大', '缩小', '缩放'],
    },
]);

/** 全部已登记工具名（核心 + 分组），用于未登记工具兜底常驻 */
export const REGISTERED_TOOL_NAMES: ReadonlySet<string> = new Set([
    ...CORE_CAPABILITIES,
    ...CAPABILITY_GROUPS.flatMap((g) => g.names),
]);

/**
 * 把触发词编译为正则（模块加载期一次，非每次对话开销）。
 * 保留原 router 的关键字语义：plain 子串匹配；`\bxxx\b` 用于英文词避免误命中。
 */
export function buildTriggerPatterns(group: CapabilityGroup): RegExp[] {
    const def = CAPABILITY_GROUPS.find((g) => g.group === group);
    if (!def) return [];
    return def.triggers.map((t) => {
        // 英文字母触发词用单词边界，中文/数字直接子串匹配
        const isAscii = /^[a-z0-9]+$/i.test(t);
        return new RegExp(isAscii ? `\\b${t}\\b` : t, 'i');
    });
}

/**
 * 罗盘交互机制段（V3.7.23 原文，逐字保留）。
 * 仅当本轮工具集包含 enable_compass 时才注入 System Prompt——
 * 这是 Skill 的「渐进披露」：机制只在需要时可见，其余轮次不占 token。
 */
export const COMPASS_MECHANISM_PROMPT = `
## 风水罗盘交互协议（平台内置机制，非可选流程）
罗盘是「Agent 启用 → 用户点卦象 → 系统自动回传新提问 → Agent 分析」的多轮交互。用户点击卦象后，平台会把带主题/层数/宫位名/中心坐标/半径的提问**自动发给你作为新一轮用户消息**，这是客观机制，你无需也无法自行发明。

**第一轮（启用）**
- 「分析当前视图范围」：直接 enable_compass 在当前中心启用，不问地点、不问半径。
- 「分析指定地点/村/小区/POI」：先 search_and_zoom 定位（geocode 只给坐标、不移动地图，不能代替），拿到结果后下一轮再 enable_compass。仅给坐标不算完成。
- 半径由你按上下文决定：优先 map_context.compassRadiusHintMeters；缺失时按当前视图估算——OL 侧按 zoom（≤5→2000km，6–7→1000km，8–9→400km，10–11→150km，12–13→50km，14–15→10km，≥16→2km），Cesium 侧按 cameraHeight（≥2,000,000m→2000km，500,000–2,000,000m→800km，100,000–500,000m→200km，20,000–100,000m→50km，5,000–20,000m→10km，<5,000m→2km）。不要反问用户，不要沿用默认值导致小比例尺下罗盘不可见。
- 启用后提示用户点击想分析的卦象，**这一轮到此为止**——卦象未选时没有可分析的对象。

**第二轮（用户点击卦象后自动回传）**
- 回传提问形如「请解释风水罗盘「X」第 N 层…中「某宫位」的含义…」，并附罗盘中心地名/坐标/半径。这是知识解答，直接作答：结合地理环境与宫位含义给出方位意义、吉凶取向与实践建议。
- **不要重复启用罗盘**（已启用）；仅当需要确认地点时可调只读的 reverse_geocode，不调用其它地图操作工具。
- 精细调整半径/主题/透明度等面板参数需用户在罗盘面板手动设置，如实说明；enable_compass 只按当前中心启用、不移动地图。
`;

/**
 * 罗盘内置知识问答指引（V3.7.15 从交互协议中拆出，常驻注入）。
 *
 * 原实现把这段与三段式交互协议放在同一个 COMPASS_MECHANISM_PROMPT，
 * 而后者仅在工具集含 enable_compass 时注入；用户直接问「坎宫是什么含义」
 * 不命中 compass 触发词，整段知识指引丢失，会回退到「拒绝回答宫位咨询」。
 * 知识问答不需要工具，故本段无条件常驻。
 */
export const COMPASS_KNOWLEDGE_PROMPT = `
## 内置风水知识问答
宫位/卦象/山向/星宿/干支释义、五行方位吉凶属平台罗盘功能的内置咨询，按传统堪舆知识正常解答，不要以「只提供地理空间服务」为由拒绝。纯知识问答无需工具；仅当提问带罗盘中心坐标且需确认地名时，可调用只读的 reverse_geocode（不改变地图）。引用保持严谨（先后天八卦、二十四山、九星纳甲、透地六十龙等有据可循），流派差异如实说明，不编造。
`;
