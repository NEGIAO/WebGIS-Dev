/**
 * Agent Function Calling tool declarations.
 * Map mutations are restricted to the fixed MapCommandBus command set.
 */

import { TILE_PROXY_BASE_URL } from '@/config/publicRuntime';
import { AGENT_BASEMAP_PRESET_IDS } from '@common/chat/agent/agentMapPresets';
import { DEFAULT_SEARCH_ZOOM } from '@common/utils/mapDefaults';
import { COMPASS_MECHANISM_PROMPT, COMPASS_KNOWLEDGE_PROMPT } from '@common/chat/constants/agentCapabilityRegistry';

/**
 * 瓦片代理示例（写进 url 参数描述，让模型照样子构造）
 *
 * 规则只有一条：把上游瓦片地址的协议去掉，原样接在 `${TILE_PROXY_BASE_URL}/proxy/` 之后。
 * 与 `tileProxyUrl()`（config/publicRuntime.ts）同构，避免提示词与代码两份事实。
 */
const TILE_PROXY_EXAMPLE = `${TILE_PROXY_BASE_URL}/proxy/mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`;

const DURATION_PROPERTY = {
    type: 'number',
    minimum: 0,
    maximum: 10000,
    default: 700,
    description: '动画时长（毫秒），默认 700。',
};

/** 单条工具结果里 GeoJSON 文本进 LLM 的字符上限（约 2k token），超出即截断并标记 */
const GEOJSON_LLM_PREVIEW_CHARS = 6000;

export const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'set_map_view',
            description: '在 2D(ol) 与 3D(cesium) 之间切换，视图尺度由同步链自动换算。',
            parameters: {
                type: 'object',
                properties: {
                    view: { type: 'string', enum: ['ol', 'cesium'], description: '目标地图引擎。' },
                },
                required: ['view'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'set_view_center',
            description: '移动地图中心。2D 用 zoom，3D 用 height（米）；只给 zoom 时换算为相机高度。',
            parameters: {
                type: 'object',
                properties: {
                    lng: { type: 'number', minimum: -180, maximum: 180, description: 'WGS84 经度。' },
                    lat: { type: 'number', minimum: -90, maximum: 90, description: 'WGS84 纬度。' },
                    zoom: { type: 'number', minimum: 0, maximum: 22, description: 'OpenLayers 缩放级别；Cesium 中会换算为相机高度。' },
                    height: { type: 'number', minimum: 1, maximum: 50000000, description: 'Cesium 相机高度（米）；OpenLayers 不接受仅提供 height。' },
                    duration: DURATION_PROPERTY,
                },
                required: ['lng', 'lat'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'set_camera_orientation',
            description: '调整 Cesium 相机姿态。仅适用于 3D；在 2D 中会返回结构化不支持错误。',
            parameters: {
                type: 'object',
                properties: {
                    heading: { type: 'number', description: '航向角（度）。' },
                    pitch: { type: 'number', minimum: -90, maximum: 90, description: '俯仰角（度）。' },
                    roll: { type: 'number', description: '翻滚角（度）。' },
                    duration: DURATION_PROPERTY,
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'zoom_to_extent',
            description: '将当前 2D 或 3D 地图缩放到 WGS84 边界框。2D 使用 padding/maxZoom；3D 使用矩形相机飞行。',
            parameters: {
                type: 'object',
                properties: {
                    bbox: {
                        type: 'array',
                        items: { type: 'number' },
                        minItems: 4,
                        maxItems: 4,
                        description: '[最小经度, 最小纬度, 最大经度, 最大纬度]。',
                    },
                    padding: { type: 'number', minimum: 0, description: '2D 视图边距（像素），默认 80。', default: 80 },
                    maxZoom: { type: 'number', minimum: 0, maximum: 22, description: '2D 最大缩放级别，默认 11。', default: 11 },
                    duration: DURATION_PROPERTY,
                },
                required: ['bbox'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_and_zoom',
            description: '搜索地名/地址/POI 并在当前视图定位；仅作用于当前激活的 OL/Cesium 视图。若用户要求两个视图都定位，必须切换视图后分别调用。',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', minLength: 1, description: '地名、地址或 POI。' },
                    city: { type: 'string', description: '可选城市限定（仅 Amap 引擎生效）。', default: '' },
                    zoom: { type: 'number', minimum: 0, maximum: 22, description: '目标缩放级别；3D 会转换为相机高度。', default: DEFAULT_SEARCH_ZOOM },
                    engine: {
                        type: 'string',
                        enum: ['auto', 'amap', 'nominatim'],
                        description: 'auto=国内高德、国外降级 Nominatim；amap=仅高德；nominatim=国际地名。',
                        default: 'auto',
                    },
                },
                required: ['query'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'switch_basemap',
            description: '切换底图。内置源用 presetId；公开 XYZ 模板用 url；用户只描述地图要素时用 intent。',
            parameters: {
                type: 'object',
                properties: {
                    presetId: {
                        type: 'string',
                        enum: AGENT_BASEMAP_PRESET_IDS,
                        description: '内置预设 ID。',
                    },
                    url: {
                        type: 'string',
                        maxLength: 500,
                        description: `标准 XYZ 模板，须含 {z}/{x}/{y}。国内不可达的源加代理前缀（上游地址去协议后原样拼接），如 ${TILE_PROXY_EXAMPLE}`,
                    },
                    intent: {
                        type: 'string',
                        maxLength: 300,
                        description: '用户只描述地图要素时传原话，如「只显示水系」「高德不要道路」。由本地规则表解析，禁止自行拼接 ltype/apistyle/scl。',
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_weather',
            description: '查询中国境内城市天气（高德数据源）。只读，不改变地图状态。',
            parameters: {
                type: 'object',
                properties: {
                    city: {
                        type: 'string',
                        minLength: 1,
                        description: '城市名或「省+市/区县」，如「北京」「南京市玄武区」；用户说「附近/这里」时取当前地图所在城市。',
                    },
                    type: {
                        type: 'string',
                        enum: ['base', 'all'],
                        description: 'base=当前实况（问「今天/现在多少度」用）；all=未来4天预报（问「明天/这周/未来几天」用）。',
                        default: 'base',
                    },
                },
                additionalProperties: false,
            },
        },
    },
    // ── 双向地理编码（V3.7.10）───────────────────────────────────────
    // 均为只读数据查询：不移动地图、不建图层、不经 MapCommandBus。
    {
        type: 'function',
        function: {
            name: 'reverse_geocode',
            description: 'WGS84 经纬度→地名（省市区乡镇/详址/区划码），高德优先天地图兜底。只读；已知坐标问「这是哪里」时用。',
            parameters: {
                type: 'object',
                properties: {
                    lng: { type: 'number', minimum: -180, maximum: 180, description: 'WGS-84 经度。可直接取用户给出的坐标或 AgentMapContextV1.center.lng。' },
                    lat: { type: 'number', minimum: -90, maximum: 90, description: 'WGS-84 纬度。' },
                },
                required: ['lng', 'lat'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'geocode',
            description: '地名/地址/POI→WGS84 坐标，高德→POI→Nominatim 兜底。只读、不移动地图（要定位请改用 search_and_zoom）。',
            parameters: {
                type: 'object',
                properties: {
                    address: { type: 'string', minLength: 1, description: '地名、地址或 POI 名称，如「杭州市西湖区」「西湖」「Tokyo」。' },
                    city: { type: 'string', description: '可选城市限定（仅高德生效），用于消除同名地名歧义。', default: '' },
                },
                required: ['address'],
                additionalProperties: false,
            },
        },
    },
    // ── 罗盘控制（V3.7.10）────────────────────────────────────────
    // 只启用在当前地图中心，不移动地图；用户点卦象后由面板自动回传分析提问。
    {
        type: 'function',
        function: {
            name: 'enable_compass',
            description: '在当前视图中心启用风水罗盘（不移动地图）。「分析当前范围」直接用当前中心，不问地点半径；「分析指定地点」须先 search_and_zoom 定位（geocode 不够）。半径自行按 compassRadiusHintMeters 或 zoom/cameraHeight 估算，不反问用户。这是多轮交互第一步：启用后提示用户点击卦象，本轮到此为止；用户点击后平台会自动回传一条带宫位名与中心坐标的新提问，届时直接分析作答，不要重复启用本工具。',
            parameters: {
                type: 'object',
                properties: {
                    themeId: {
                        type: 'string',
                        enum: ['compass', 'circle', 'dark', 'polygon', 'simple'],
                        description: '可选罗盘主题 cid；不传则沿用当前主题。',
                    },
                    radiusMeters: {
                        type: 'number',
                        minimum: 100,
                        maximum: 2000000,
                        description: '分析半径（米），由你根据上下文自行决定并填入。优先取 map_context.compassRadiusHintMeters；缺失时按 ol.zoom / cesium.cameraHeight 估算一个合理值，不要询问用户，也不要沿用默认小半径。',
                    },
                },
                additionalProperties: false,
            },
        },
    },
    // ── 图层管理（V3.7.9）──────────────────────────────────────────
    // 4 个只读 + 4 个可逆变更 + 1 个导出。只读工具不走 MapCommandBus。
    {
        type: 'function',
        function: {
            name: 'get_map_state',
            description: '读取当前地图状态：引擎、中心、缩放或相机姿态、底图、图层数量。只读，不改变地图。',
            parameters: {
                type: 'object',
                properties: {
                    includeLayerNames: {
                        type: 'boolean',
                        description: '是否附带图层名称清单（默认 false；图层多时响应会变长）。',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_layers',
            description: '列出当前可操作的图层（含 2D 与 3D）。改图层前先调本工具拿到准确 id，不要臆造。',
            parameters: {
                type: 'object',
                properties: {
                    engine: {
                        type: 'string',
                        enum: ['all', 'ol', 'cesium'],
                        description: '按引擎过滤：all=全部（默认），ol=2D，cesium=3D。',
                        default: 'all',
                    },
                    visibleOnly: {
                        type: 'boolean',
                        description: '仅返回当前可见的图层。',
                        default: false,
                    },
                    keyword: {
                        type: 'string',
                        description: '按图层名称或 id 模糊匹配（可选）。',
                        default: '',
                    },
                    limit: {
                        type: 'number',
                        minimum: 1,
                        maximum: 200,
                        description: '返回条数上限，默认 50；被截断时响应里 truncated=true 并给出 total。',
                        default: 50,
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_layer_info',
            description: '读取单个图层的详情（类型、可见性、透明度、要素数、所属引擎）。只读。',
            parameters: {
                type: 'object',
                properties: {
                    layerId: {
                        type: 'string',
                        description: '图层 id，取 list_layers 返回值，不要自己拼。',
                    },
                },
                required: ['layerId'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_measure_result',
            description: '读取最近一次测量的结果。2D 返回距离或面积与顶点坐标；3D 额外含高程与方位角。只读，不改变地图。',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
    },
    {
        type: 'function',
        function: {
            name: 'set_layer_visibility',
            description: '显示或隐藏指定图层。可逆操作。',
            parameters: {
                type: 'object',
                properties: {
                    layerId: { type: 'string', description: '图层 id，取 list_layers 返回值。' },
                    visible: { type: 'boolean', description: 'true=显示，false=隐藏。' },
                },
                required: ['layerId', 'visible'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'set_layer_opacity',
            description: '调整图层透明度。可逆操作。3D 下部分类型（如 3D Tiles 之外的影像）可能不支持。',
            parameters: {
                type: 'object',
                properties: {
                    layerId: { type: 'string', description: '图层 id，取 list_layers 返回值。' },
                    opacity: {
                        type: 'number',
                        minimum: 0,
                        maximum: 1,
                        description: '0=完全透明，1=不透明。',
                    },
                },
                required: ['layerId', 'opacity'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'zoom_to_layer',
            description: '把视图缩放到指定图层的范围。可逆操作。',
            parameters: {
                type: 'object',
                properties: {
                    layerId: { type: 'string', description: '图层 id，取 list_layers 返回值。' },
                },
                required: ['layerId'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'solo_layer',
            description: '只显示指定图层、隐藏其余用户图层（2D / 3D 均可用）。会返回被隐藏的图层清单，转述给用户时请一并说明。',
            parameters: {
                type: 'object',
                properties: {
                    layerId: { type: 'string', description: '图层 id，取 list_layers 返回值。' },
                },
                required: ['layerId'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'export_layer_geojson',
            description: '导出图层要素（仅 2D）。默认生成 .geojson 文件并触发浏览器下载；mode=inline 时改为在回复中返回文本供分析。',
            parameters: {
                type: 'object',
                properties: {
                    layerId: { type: 'string', description: '图层 id，取 list_layers 返回值。' },
                    mode: {
                        type: 'string',
                        enum: ['download', 'inline'],
                        description: 'download（默认）= 生成 .geojson 文件；inline = 回复中返回要素文本（「看看要素/坐标」用）。',
                        default: 'download',
                    },
                    limit: {
                        type: 'number',
                        minimum: 1,
                        maximum: 2000,
                        description: '仅 mode=inline 生效：最多返回要素数，默认 500。',
                        default: 500,
                    },
                },
                required: ['layerId'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'remove_layer',
            description: '删除指定图层（不可撤销，2D/3D 均可）。执行前必须先用 list_layers 确认目标。',
            parameters: {
                type: 'object',
                properties: {
                    layerId: { type: 'string', description: '图层 id，取 list_layers 返回值。' },
                },
                required: ['layerId'],
                additionalProperties: false,
            },
        },
    },
];

export function buildSystemPromptWithTools(toolNames?: ReadonlySet<string> | readonly string[]) {
    // V3.7.16：罗盘交互机制从注册表按需注入——仅在工具集含 enable_compass 时发送。
    // 原文逐字保留在 agentCapabilityRegistry.COMPASS_MECHANISM_PROMPT，避免措辞漂移。
    const names = toolNames
        ? (toolNames instanceof Set ? toolNames : new Set(toolNames))
        : null;
    const withCompass = !names || names.has('enable_compass');
    const mechanism = withCompass ? COMPASS_MECHANISM_PROMPT : '';

    return `你是 WebGIS 地图助手 NEGIAO。涉及地图操作必须调用白名单工具，不要只描述。工具签名以 tools 参数为准。

## 上下文
AgentMapContextV1 给出当前 view/center/zoom 或相机、basemap、compassRadiusHintMeters、recentActions。runtime 优先于 urlState；resultingMapState 优先于目标参数。

## 能力边界（自行判断怎么用）
工具签名以 tools 为准，按用户意图自由组合与分轮，不必套固定流程：
- 检索：定位地名用 search_and_zoom；已知坐标问地点用 reverse_geocode；只取坐标不移动地图用 geocode。
- 底图：switch_basemap 接受 presetId（内置预设）、url（明确 XYZ 模板）、intent（用户描述「只显示水系」「高德不要道路」等要素时传原话，本地规则解析）。禁止自行拼接 ltype/apistyle/scl 等参数。
- 图层：list_layers 列可操作图层；拿到 id 后按需调用显隐、透明度、缩放、单独显示、导出或删除。删除不可撤销，执行后报告名称与要素数。导出默认生成文件（download），仅「在回复里看文本」用 inline；只有 downloaded=true 才算生成成功。
- 单次用户消息最多 10 次工具；依赖前一步结果的调用分轮进行，每轮核对剩余目标直到闭环。
- 工具失败或额度耗尽时如实转述 code/message；额度耗尽立即停止，不重试、不伪称成功。
- 最终答复给出用户要的具体结果，不要说「工具已执行」这类占位语。
${COMPASS_KNOWLEDGE_PROMPT}
${mechanism}
## 降级格式
\`\`\`tool_call
{"name":"工具名","arguments":{}}
\`\`\`
可连续输出多个块。`;
}

export function formatToolResultForLLM(toolName: string, result: Record<string, any>) {
    const status = result.success ? '成功' : '失败';
    let output = `[工具结果] ${toolName} 执行${status}：${result.message}`;
    const extraKeys = [
        'code',
        'command',
        'view',
        'supportedViews',
        'results',
        'location',
        // 双向地理编码（V3.7.10）：结构化地名/坐标便于模型追问时复用，不必再调一次工具
        'address',
        'region',
        // enable_compass（V3.7.10）：主题与半径供后续分析追问复用
        'theme',
        'radiusMeters',
        'center',
        'currentBasemap',
        'layerName',
        'layerId',
        'layerIndex',
        'resultingMapState',
        'url',
        // get_weather 的结构化载荷：不放进 extras 的话，LLM 只能看到 message 里的一句摘要，
        // 追问「明天呢」「湿度多少」时会被迫重新调一次工具
        'weather',
        // 图层管理（V3.7.9）：清单与变更结果的结构化字段
        'layers',
        'total',
        'returned',
        'truncated',
        'layer',
        'result',
        'visible',
        'opacity',
        'hiddenLayers',
        'hiddenCount',
        'featureCount',
        'returnedFeatures',
        'downloaded',
        'filename',
        // remove_layer 的身份回执：模型据此说明「删了哪个图层的多少要素」
        'name',
        'deleted',
        'sceneApplied',
        'geojson',
    ];
    const extras: Record<string, any> = {};
    for (const key of extraKeys) {
        if (result[key] !== undefined) extras[key] = result[key];
    }
    // GeoJSON 体积可能到 60k 字符：进 LLM 前再截一道，避免单条工具结果吃光上下文
    if (typeof extras.geojson === 'string' && extras.geojson.length > GEOJSON_LLM_PREVIEW_CHARS) {
        extras.geojson = `${extras.geojson.slice(0, GEOJSON_LLM_PREVIEW_CHARS)}…(truncated)`;
        extras.geojsonPreviewTruncated = true;
    }
    if (Object.keys(extras).length > 0) output += `\n${JSON.stringify(extras)}`;
    return output;
}

/**
 * 用户可见版工具结果摘要：只取人读的 message 一行，不含 LLM 专用的
 * 结构化 JSON 载荷（extras 由 formatToolResultForLLM 单独供给模型）。
 * 用于聊天面板的空回复/失败回退展示——V3.7.8 修复 JSON 载荷原文直出。
 */
export function formatToolResultForUser(toolName: string, result: Record<string, any>) {
    const status = result?.success ? '成功' : '失败';
    return `${toolName} 执行${status}：${String(result?.message || '')}`;
}

/**
 * Parse tool calls from text fallback output.
 */
export function parseToolCallsFromText(text: any) {
    if (!text || typeof text !== 'string') return null;

    const toolCalls: any[] = [];

    // 模式 1：```tool_call ... ``` 格式（标准降级格式）
    const blockRegex = /```(?:tool_call|tool_calls?)\s*\n?([\s\S]*?)\n?\s*```/g;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
        _tryParseToolCallBlock(match[1], toolCalls);
    }

    // 模式 2：```json ... ``` 格式（部分 LLM 可能用 json 标记）
    if (toolCalls.length === 0) {
        const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?\s*```/g;
        while ((match = jsonBlockRegex.exec(text)) !== null) {
            _tryParseToolCallBlock(match[1], toolCalls);
        }
    }

    // 模式 3：裸 JSON 对象（包含 "name" 和 "arguments" 字段）
    if (toolCalls.length === 0) {
        const bareJsonRegex = /\{[^{}]*"name"\s*:\s*"[^"]+?"[^{}]*"arguments"\s*:\s*\{[^]*?\}\s*\}/g;
        while ((match = bareJsonRegex.exec(text)) !== null) {
            _tryParseToolCallBlock(match[0], toolCalls);
        }
    }

    return toolCalls.length > 0 ? toolCalls : null;
}

/**
 * 尝试从文本块中解析工具调用 JSON
 * @private
 * @param {string} block - 文本块
 * @param {Array} results - 结果数组（直接修改）
 */
function _tryParseToolCallBlock(block: string, results: any[]) {
    const trimmed = block.trim();
    if (!trimmed) return;

    // 处理可能的多个 JSON 对象（数组或连续对象）
    const candidates: any[] = [];

    // 尝试作为数组解析
    if (trimmed.startsWith('[')) {
        try {
            const arr = JSON.parse(trimmed);
            if (Array.isArray(arr)) candidates.push(...arr);
        } catch { /* 不是数组，继续 */ }
    }

    // 尝试作为单个对象解析
    if (candidates.length === 0) {
        try {
            candidates.push(JSON.parse(trimmed));
        } catch { /* 解析失败 */ }
    }

    // 处理连续的 JSON 对象（非数组格式）
    if (candidates.length === 0) {
        const objRegex = /\{[^{}]*\}/g;
        let objMatch;
        while ((objMatch = objRegex.exec(trimmed)) !== null) {
            try {
                candidates.push(JSON.parse(objMatch[0]));
            } catch { /* 跳过 */ }
        }
    }

    for (const parsed of candidates) {
        if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
            results.push({
                name: parsed.name.trim(),
                arguments: (typeof parsed.arguments === 'object' && parsed.arguments !== null)
                    ? parsed.arguments
                    : {},
            });
        }
    }
}
