/**
 * Agent Function Calling 工具声明配置
 *
 * 遵循 OpenAI Function Calling 规范，定义 Agent 可调用的 GIS 工具。
 * 前端通过系统提示词注入实现降级调用，后端就绪后可直接透传 tools 参数。
 *
 * @module agentToolsSchema
 */

// ============================================================
//  工具声明（OpenAI Function Calling 格式）
// ============================================================

/**
 * Agent 可用工具列表（OpenAI 格式）
 * 每个工具包含 type、function.name、function.description、function.parameters
 */
export const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'zoom_to_extent',
            description:
                '将地图缩放到指定的地理边界框范围。当用户要求查看某个区域、城市、国家的范围时使用。需要提供 [最小经度, 最小纬度, 最大经度, 最大纬度] 格式的边界框。',
            parameters: {
                type: 'object',
                properties: {
                    bbox: {
                        type: 'array',
                        items: { type: 'number' },
                        minItems: 4,
                        maxItems: 4,
                        description:
                            '地理边界框 [最小经度, 最小纬度, 最大经度, 最大纬度]，WGS84 坐标系。例如北京市约 [116.0, 39.6, 116.8, 40.3]',
                    },
                    padding: {
                        type: 'number',
                        description: '视图边距（像素），默认 80',
                        default: 80,
                    },
                    maxZoom: {
                        type: 'number',
                        description: '最大缩放级别（1-22），默认 11',
                        default: 11,
                    },
                },
                required: ['bbox'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_and_zoom',
            description:
                '根据地名或地址关键词搜索位置，并将地图缩放定位到该位置。支持中文地名、地址、POI 名称搜索，如"北京大学"、"天安门"、"西湖"等。搜索结果会自动缩放地图到目标位置。',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '搜索关键词，如地名、地址、POI 名称',
                    },
                    city: {
                        type: 'string',
                        description: '限定搜索的城市名称，如"北京"、"杭州"，可提高搜索精度',
                        default: '',
                    },
                    zoom: {
                        type: 'number',
                        description: '目标缩放级别（1-22），默认 16。城市级别约 12，街区级别约 16，建筑级别约 19',
                        default: 16,
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'switch_basemap',
            description: `【切换底图必调此工具】所有底图切换请求一律只能传入 HTTPS XYZ 瓦片 URL。禁止使用 presetId、禁止查询底图列表、禁止走预设底图。前端收到 url 后会统一切换到 custom 自定义底图，并同步地址栏图层索引 l=1。
当用于没有特定要求，切换底图选择天地图或者中国渲染；

常用 XYZ 瓦片 URL：
| 图源 | URL |
|------|-----|
| 中国渲染 | https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png |
| 高德卫星 | https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z} |
| 高德路网 | https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z} |
| 高德标注 | https://wprd01.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=7 |
| 腾讯路网 | https://rt0.map.gtimg.com/tile?z={z}&x={x}&y={y}&type=vector&styleid=0 |
| OpenStreetMap | https://tile.openstreetmap.org/{z}/{x}/{y}.png |
| OSM 法国 | https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png |
| OpenTopoMap | https://a.tile.opentopomap.org/{z}/{x}/{y}.png |
| Google 路网 | https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z} |
| Google 卫星 | https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z} |
| Google 混合 | https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z} |
| Google 地形 | https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z} |
| Esri 卫星 | https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x} |
| Esri 路网 | https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x} |
| Esri 地形 | https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x} |
| Esri 灰色 | https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x} |
| CartoDB 亮色 | https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png |
| CartoDB 暗色 | https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png |
| CartoDB Voyager | https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png |
| Stamen 水彩 | https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg |
| Stamen Toner | https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png |
| 天地图矢量 | https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=4267820f43926eaf808d61dc07269beb |
| 天地图卫星 | https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=4267820f43926eaf808d61dc07269beb |
| 天地图标注 | https://t0.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=4267820f43926eaf808d61dc07269beb |`,
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'HTTPS XYZ 瓦片 URL 模板，必须以 https:// 开头并包含 {x}、{y}、{z} 占位符。传入后会走 custom 自定义底图并同步为 l=1。',
                    },
                    name: {
                        type: 'string',
                        description: '图源显示名称，如"高德卫星"、"OSM标准"。仅 url 模式下有效。',
                        default: '自定义图源',
                    },
                },
                required: ['url'],
            },
        },
    },
];

// ============================================================
//  辅助函数
// ============================================================

/**
 * 构建带工具说明的系统提示词（降级模式使用）
 * 当后端不支持原生 Function Calling 时，通过系统提示词告知 LLM 工具调用格式
 *
 * @returns {string} 系统提示词
 */
export function buildSystemPromptWithTools() {
    return `你是一个 WebGIS 地图助手，可以通过调用工具操控地图。用户的请求涉及地图操作时，你必须调用相应工具来完成。

## 可用工具

### 1. zoom_to_extent(bbox, padding?, maxZoom?)
将地图缩放到指定的经纬度边界框。
- bbox: [最小经度, 最小纬度, 最大经度, 最大纬度]，WGS84 坐标系

### 2. search_and_zoom(query, city?, zoom?)
根据地名搜索并定位地图。搜索结果会自动缩放，无需手动计算 bbox。
- query: 搜索关键词（地名、地址、POI）
- city: 可选，限定城市提高精度
- zoom: 可选，缩放级别 1-22，默认 16（城市 12、街区 16、建筑 19）

### 3. switch_basemap(url, name?) — 【切换底图必调此工具】
当用户说"切换底图"、"换地图"、"换成XXX"、"用XXX"、"随机换"等任何涉及更换底图的请求时，必须调用此工具。
- url: HTTPS XYZ 瓦片 URL（必须以 https:// 开头并含 {x},{y},{z}）。这是切换底图的唯一参数通道。
- name: 可选显示名。
- 禁止使用 presetId，禁止查询底图列表，禁止使用任何预设底图。传入 url 后前端会切换到 custom 自定义底图，并同步地址栏图层索引 l=1。

常用 XYZ 瓦片 URL（可直接传入 url 参数）：
| 图源 | URL |
|------|-----|
| 高德卫星 | https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z} |
| 高德路网 | https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z} |
| 高德标注 | https://wprd01.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=7 |
| 腾讯路网 | https://rt0.map.gtimg.com/tile?z={z}&x={x}&y={y}&type=vector&styleid=0 |
| OpenStreetMap | https://tile.openstreetmap.org/{z}/{x}/{y}.png |
| OSM 法国 | https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png |
| OpenTopoMap | https://a.tile.opentopomap.org/{z}/{x}/{y}.png |
| Google 路网 | https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z} |
| Google 卫星 | https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z} |
| Google 混合 | https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z} |
| Google 地形 | https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z} |
| Esri 卫星 | https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x} |
| Esri 路网 | https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x} |
| Esri 地形 | https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x} |
| Esri 灰色 | https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x} |
| CartoDB 亮色 | https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png |
| CartoDB 暗色 | https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png |
| CartoDB Voyager | https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png |
| Stamen 水彩 | https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg |
| Stamen Toner | https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png |
| 天地图矢量 | https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=4267820f43926eaf808d61dc07269beb |
| 天地图卫星 | https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=4267820f43926eaf808d61dc07269beb |
| 天地图标注 | https://t0.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=4267820f43926eaf808d61dc07269beb |

## 调用格式
需要调用工具时，在回复中包含 JSON 块：

\`\`\`tool_call
{"name": "工具名", "arguments": {参数}}
\`\`\`

可一次调用多个工具（每个一个 JSON 块）。工具结果以 [工具结果] 返回，你需根据结果给用户友好回复。

## 工作流指南

### 底图切换
用户说"切换osm底图" → 直接调 switch_basemap(url="https://tile.openstreetmap.org/{z}/{x}/{y}.png", name="OpenStreetMap")
用户说"切换到高德卫星" → 直接调 switch_basemap(url="https://webst01.is.autonavi.com/...")

### 位置搜索
用户说"定位到北京大学" → 直接调 search_and_zoom(query="北京大学")
用户说"看看北京市的范围" → 调 zoom_to_extent(bbox=[116.0,39.6,116.8,40.3])

## 注意事项
- 坐标系：WGS84（GPS），经度 -180~180，纬度 -90~90
- 用户说"放大"/"缩小"但没说区域时 → 询问具体位置
- **切换底图时必须调用 switch_basemap 工具，不能只回复文字**
- **switch_basemap 只能传 url，不能传 presetId**
- **所有底图切换最终都必须走 custom 底图，URL 图层索引必须是 l=1**`;
}

/**
 * 构建工具执行结果的消息内容（用于回传给 LLM）
 *
 * @param {string} toolName - 工具名称
 * @param {Object} result - 执行结果
 * @param {boolean} result.success - 是否成功
 * @param {string} result.message - 结果消息
 * @returns {string} 格式化的结果文本
 */
export function formatToolResultForLLM(toolName, result) {
    const status = result.success ? '成功' : '失败';
    // 基础信息
    let output = `[工具结果] ${toolName} 执行${status}：${result.message}`;
    // 附加结构化数据（如搜索结果和底图切换结果），使 LLM 能直接使用
    const extraKeys = ['results', 'currentBasemap', 'layerName', 'layerId', 'layerIndex', 'url'];
    const extras = {};
    for (const key of extraKeys) {
        if (result[key] !== undefined) {
            extras[key] = result[key];
        }
    }
    if (Object.keys(extras).length > 0) {
        output += `\n${JSON.stringify(extras)}`;
    }
    return output;
}

/**
 * 从 LLM 文本回复中解析工具调用指令（降级模式）
 *
 * 支持多种 LLM 输出格式：
 * 1. ```tool_call\n{...}\n```
 * 2. ```tool_call {...}```
 * 3. ```json\n{"name": "...", "arguments": {...}}\n````
 * 4. {"name": "search_and_zoom", "arguments": {...}} （裸 JSON）
 *
 * @param {string} text - LLM 回复文本
 * @returns {Array<{name: string, arguments: object}>|null} 解析出的工具调用列表，无则返回 null
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
