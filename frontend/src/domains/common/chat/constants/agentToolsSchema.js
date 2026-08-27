/**
 * Agent Function Calling tool declarations.
 * Map mutations are restricted to the fixed MapCommandBus command set.
 */

import { AGENT_BASEMAP_PRESET_IDS, formatAgentBasemapPresetCatalog } from '@common/chat/agent/agentMapPresets';
import { DEFAULT_SEARCH_ZOOM } from '@common/utils/mapDefaults';

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
            description: '在 OpenLayers 2D（ol）和 Cesium 3D（cesium）之间切换。视图尺度语义由现有同步链自动转换，禁止直接修改 URL。',
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
            description: '移动当前地图中心。2D 使用 zoom；3D 优先使用 height（米），若只给 zoom 会转换为近似相机高度。',
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
            description: '搜索地名、地址或 POI，并在当前 2D/3D 引擎中定位。自动根据地名归属选择地理编码引擎。',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', minLength: 1, description: '地名、地址或 POI。' },
                    city: { type: 'string', description: '可选城市限定（仅 Amap 引擎生效）。', default: '' },
                    zoom: { type: 'number', minimum: 0, maximum: 22, description: '目标缩放级别；3D 会转换为相机高度。', default: DEFAULT_SEARCH_ZOOM },
                    engine: {
                        type: 'string',
                        enum: ['auto', 'amap', 'nominatim'],
                        description: "地理编码引擎选择。auto（默认）= 国内用高德、国外降级到 Nominatim；amap = 强制高德（仅国内有效）；nominatim = 强制 Nominatim（国际地名推荐）。根据用户意图的地理位置选择：国内地址用 amap 或 auto，国外/国际地址用 nominatim 或 auto。",
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
            description: '切换当前 2D/3D 底图。二选一传入：presetId（项目内置稳定预设 ID，白名单）或 url（标准 XYZ 瓦片 URL 模板，必须含 {z}/{x}/{y} 占位符，协议仅 http/https，可携带服务所需的 key 参数；禁止其它任意字段）。',
            parameters: {
                type: 'object',
                properties: {
                    presetId: {
                        type: 'string',
                        enum: AGENT_BASEMAP_PRESET_IDS,
                        description: '项目内置稳定底图预设 ID（与 url 二选一）。',
                    },
                    url: {
                        type: 'string',
                        maxLength: 500,
                        description: '标准 XYZ 瓦片 URL 模板，如 https://tile.openstreetmap.org/{z}/{x}/{y}.png。必须包含 {z}/{x}/{y}，协议仅 http/https（与 presetId 二选一）。',
                    },
                },
                additionalProperties: false,
            },
        },
    },
];

export function buildSystemPromptWithTools() {
    return `你是 WebGIS 地图助手。涉及地图操作时，必须调用下面的固定白名单工具；不要只描述将要操作。

## 当前地图上下文
请求可能包含 AgentMapContextV1：
- view=ol 时，ol.zoom 是 2D 缩放级别。
- view=cesium 时，cesium.cameraHeight/heading/pitch/roll 是 3D 相机状态。
- source 含 runtime 时，center 和引擎状态来自发送瞬间运行时，应优先于 urlState。
- urlState 只用于恢复语义或运行时缺失时回退。
- resultingMapState 是工具完成后采样的实际状态，应优先于目标参数。
- changesSinceLastTurn 描述上一轮到本轮的字段级变化（view/center/zoom/basemap），用于回答"我刚才做了什么"。
- recentActions 是本会话内最近几次用户操作的简短摘要（最多 5 条），帮助区分"当前状态"与"用户动作"。

## 工具
1. set_map_view(view): 切换 ol/cesium。
2. set_view_center(lng, lat, zoom?, height?, duration?): 移动中心；2D 用 zoom，3D 用 height，3D 也可把 zoom 换算成高度。
3. set_camera_orientation(heading?, pitch?, roll?, duration?): 仅 Cesium；2D 会明确返回不支持。
4. zoom_to_extent(bbox, padding?, maxZoom?, duration?): 2D/3D 均支持。
5. search_and_zoom(query, city?, zoom?, engine?): 搜索并在当前引擎定位。engine 可选 'auto'（默认，国内高德+国外降级）、'amap'（仅国内）、'nominatim'（国际地名）。根据用户意图的所在地选择引擎。
6. switch_basemap(presetId | url): 2D/3D 均支持。presetId 为下方全量目录中的任意可用 id，按用户意图（卫星/街道/地形/暗色/品牌）合理归类选择；用户未提供 URL 时，也可根据需求自行构造公开免密钥的标准 XYZ 瓦片 URL 并传入 url 切换（构造示例见下方参考）。presetId 与 url 二选一，二者都提供时以 url 为准。url 必须含 {z}/{x}/{y} 占位符、协议 http/https。

## 常用公开 XYZ 瓦片源参考（免密钥，可直接构造为 url 参数）
- OpenStreetMap 标准街道: https://tile.openstreetmap.org/{z}/{x}/{y}.png
- Esri World Imagery 卫星影像: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}（注意是 {z}/{y}/{x} 顺序）
- Esri World Topo 地形: https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}（同上 y/x 倒序）
- CARTO Positron 明亮简约: https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png
- OpenTopoMap 等高线地形: https://tile.opentopomap.org/{z}/{x}/{y}.png
用户意图明确但未给 URL 时，优先从上方参考或下方全量目录按其意图选择；若选中的源切换失败或不可用，换一个源重试，不要中途放弃。

## Agent 可用底图预设（全量目录，按组分类）
以下是项目全部底图预设（含程序槽位与本地瓦片），按意图组分类；切换失败时以工具结果为准并尝试其他预设。
${formatAgentBasemapPresetCatalog()}

## 安全约束
- 不构造、传递或请求写入任意私有/付费服务的 URL；switch_basemap 的 url 字段仅限标准 XYZ 瓦片模板（含 {z}/{x}/{y} 占位符，协议 http/https），公开免密钥服务可自主构造。
- 不调用 set_url、set_query、navigate_to 或未声明的通用命令。
- switch_basemap 只接受 presetId（全量目录）或标准 XYZ 模板 url，不能传 token/provider 等其它配置字段；用户提供的私有密钥类 token 不应转述，可提醒用户该 URL 会出现在对话记录中。
- URL 中 lng/lat/z/l/view 的更新由地图运行时现有同步链自动完成。
- 当前视图不支持的命令应保留工具返回的结构化错误，不要伪称成功。

## 降级工具调用格式
\`\`\`tool_call
{"name":"工具名","arguments":{}}
\`\`\`
可连续输出多个 tool_call 块。工具结果会以 [工具结果] 返回，再据此向用户说明实际结果。`;
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
