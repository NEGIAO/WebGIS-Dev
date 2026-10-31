/**
 * Agent Function Calling tool declarations.
 * Map mutations are restricted to the fixed MapCommandBus command set.
 */

import { TILE_PROXY_BASE_URL } from '@/config/publicRuntime';
import { AGENT_BASEMAP_PRESET_IDS } from '@common/chat/agent/agentMapPresets';
import { DEFAULT_SEARCH_ZOOM } from '@common/utils/mapDefaults';

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
            description: '移动地图中心。2D 用 zoom，3D 用 height（米），只给 zoom 时换算为相机高度。',
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
            description: '搜索地名/地址/POI 并在当前视图定位。',
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
            description: '切换底图。内置源用 presetId；其余你已知的公开瓦片源用 url 传标准 XYZ 模板。',
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
                        description: `标准 XYZ 模板，须含 {z}/{x}/{y}，可带 key 等参数。国内不可达的源加代理前缀（上游地址去掉协议后原样拼接），如 ${TILE_PROXY_EXAMPLE}`,
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
                        description: 'base（默认）= 当前实况：天气现象、气温、湿度、风向风力；用户问「现在多少度/今天天气」用此项。all = 未来 4 天预报（含昼夜天气与最高最低温）；用户问「明天/未来几天/这周」用此项。',
                        default: 'base',
                    },
                },
                additionalProperties: false,
            },
        },
    },
];

export function buildSystemPromptWithTools() {
    return `你是 WebGIS 地图助手。涉及地图操作时必须调用白名单工具，不要只描述。

## 上下文
AgentMapContextV1 含 view(ol|cesium)、center、zoom 或相机、basemap、recentActions。
source=runtime 优先于 urlState；resultingMapState 优先于目标参数；recentActions 回答「我刚才做了什么」。

## 工具
1 set_map_view(view) 2D/3D 切换
2 set_view_center(lng,lat,zoom?,height?) 2D 用 zoom，3D 用 height
3 set_camera_orientation(heading?,pitch?,roll?) 仅 3D
4 zoom_to_extent(bbox,padding?,maxZoom?)
5 search_and_zoom(query,city?,engine?) engine: auto|amap|nominatim
6 switch_basemap(presetId|url) 内置源优先；无对应预设时传标准 XYZ 模板
7 get_weather(city,type?) type: base=实况，all=未来 4 天

## 选型
- 定位某地 → search_and_zoom
- 换底图 → switch_basemap：有内置预设用 presetId；没有但你已知瓦片地址的源（OSM/ESRI/Google 各图层等）用 url 传标准 XYZ 模板，国内直连会空白的源加代理前缀
- 3D + 搜索 → 先 set_map_view("cesium")，再 search_and_zoom
- 天气 → get_weather；问「明天/未来几天」用 type="all"

## 常用底图（其余 id 见 switch_basemap 的 enum，可直接使用）
- google_Backend_Proxy_preset: 谷歌代理（卫星影像，国内可用）
- osm_Backend_Proxy_preset: OSM 代理（街道）
- imagery_amap_wgs_preset / vector_amap_wgs_preset: 高德影像 / 高德地图（已纠偏 WGS84）
- imagery_tianditu_preset / vector_tianditu_preset: 天地图影像 / 天地图矢量
- arcgis_imagery_preset / arcgis_topo_preset: ESRI 影像 / ESRI 地形
- vector_carton_dark_preset: Carto 深色
- vector_Google_clean_preset: Google 简洁

## 约束
- 只调用上表已声明的工具；set_url / navigate_to / set_query 等未声明命令一律不调用
- url 只填公开免密钥的标准 XYZ 模板（含 {z}/{x}/{y}）
- 用户贴出的带 key/token 的 URL 不要原样复述（会留在对话记录里），只说「将用它切换底图」
- 天气仅覆盖中国行政区（高德数据源）；境外城市或查询失败时如实说明，禁止编造数值
- 工具返回结构化错误时如实转述，不要伪称成功

## 降级格式
\`\`\`tool_call
{"name":"工具名","arguments":{}}
\`\`\`
可连续输出多个块。`;
}

export function formatToolResultForLLM(toolName, result) {
    const status = result.success ? '成功' : '失败';
    let output = `[工具结果] ${toolName} 执行${status}：${result.message}`;
    const extraKeys = [
        'code',
        'command',
        'view',
        'supportedViews',
        'results',
        'location',
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
    ];
    const extras = {};
    for (const key of extraKeys) {
        if (result[key] !== undefined) extras[key] = result[key];
    }
    if (Object.keys(extras).length > 0) output += `\n${JSON.stringify(extras)}`;
    return output;
}

/**
 * Parse tool calls from text fallback output.
 */
export function parseToolCallsFromText(text) {
    if (!text || typeof text !== 'string') return null;

    const toolCalls = [];

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
function _tryParseToolCallBlock(block, results) {
    const trimmed = block.trim();
    if (!trimmed) return;

    // 处理可能的多个 JSON 对象（数组或连续对象）
    const candidates = [];

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
