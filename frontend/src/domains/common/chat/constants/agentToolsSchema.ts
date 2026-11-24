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
    // ── 双向地理编码（V3.7.10）───────────────────────────────────────
    // 均为只读数据查询：不移动地图、不建图层、不经 MapCommandBus。
    {
        type: 'function',
        function: {
            name: 'reverse_geocode',
            description: '把 WGS-84 经纬度解析为具体地名（省/市/区/乡镇、详细地址、行政区划码）。高德优先、天地图兜底。只读，不改变地图状态；已知坐标想知道「这是哪里」时用。',
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
            description: '把地名/地址/POI 解析为 WGS-84 经纬度。高德地址编码 → 高德 POI → Nominatim 依次兜底。只读，只返回坐标，不移动地图也不建图层（要顺带定位请用 search_and_zoom）。',
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
            description: '在当前地图视图中心启用风水罗盘（不移动地图）。用于「分析当前或已定位范围风水条件」类请求。分析指定地点时必须先用 search_and_zoom 定位到该地，不能只用 geocode 后停止。调用后提示用户点击想分析的卦象；用户点击会自动回传，届时再分析，不要重复启用。',
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
                        description: '分析半径（米），必须显式传入。优先采用 map_context.compassRadiusHintMeters；字段缺失时根据 ol.zoom 或 cesium.cameraHeight 估算。不要沿用默认小半径。',
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
                        description:
                            'download（默认）= 生成 .geojson 文件供用户保存，适合「导出/下载给我」；inline = 在回复中返回 GeoJSON 文本，适合「看看这些要素/坐标」。',
                        default: 'download',
                    },
                    limit: {
                        type: 'number',
                        minimum: 1,
                        maximum: 2000,
                        description: '仅 mode=inline 生效：最多返回多少要素，默认 500。download 模式总是导出全部要素。',
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

export function buildSystemPromptWithTools() {
    return `你是 WebGIS 地图助手，名字叫做NEGIAO。涉及地图操作时必须调用白名单工具，不要只描述。

## 上下文
AgentMapContextV1 含 view(ol|cesium)、center、zoom 或相机、basemap、compassRadiusHintMeters、recentActions。
source=runtime 优先于 urlState；resultingMapState 优先于目标参数；recentActions 回答「我刚才做了什么」。

## 工具
1 set_map_view(view) 2D/3D 切换
2 set_view_center(lng,lat,zoom?,height?) 2D 用 zoom，3D 用 height
3 set_camera_orientation(heading?,pitch?,roll?) 仅 3D
4 zoom_to_extent(bbox,padding?,maxZoom?)
5 search_and_zoom(query,city?,engine?) engine: auto|amap|nominatim
6 switch_basemap(presetId|url) 内置源优先；无对应预设时传标准 XYZ 模板
7 get_weather(city,type?) type: base=实况，all=未来 4 天
8 get_map_state(includeLayerNames?) 读当前引擎/中心/底图/图层数
9 list_layers(engine?,visibleOnly?,keyword?,limit?) 列图层并拿到 id
10 get_layer_info(layerId) 单个图层详情
11 get_measure_result() 最近一次测量结果（2D/3D 均可）
12 set_layer_visibility(layerId,visible) 显示/隐藏
13 set_layer_opacity(layerId,opacity) 透明度 0~1
14 zoom_to_layer(layerId) 缩放到图层范围
15 solo_layer(layerId) 只显示该图层（2D / 3D 均可用）
16 export_layer_geojson(layerId,mode?,limit?) 导出图层要素（仅 2D）：mode=download 生成文件下载（默认），inline 返回文本
17 remove_layer(layerId) 删除图层（不可撤销，2D/3D）
18 reverse_geocode(lng,lat) 坐标→地名/地址（只读；WGS-84）
19 geocode(address,city?) 地名/地址→坐标（只读；WGS-84，不移动地图）
20 enable_compass(themeId?,radiusMeters?) 在当前地图中心启用罗盘（不移动地图）

## 选型
- 定位某地 → search_and_zoom
- **分析指定地点/村/小区/POI 的风水**（如「分析峰下村的风水」）是串行任务，不得只解析坐标后停止：
  1. 第一轮调用 search_and_zoom 把地图定位到该地；不要用 geocode 冒充定位，geocode 只返回坐标、不移动地图；
  2. 拿到工具结果后，下一轮必须调用 enable_compass，并显式传 radiusMeters；优先取 map_context.compassRadiusHintMeters，缺失时按 ol.zoom / cesium.cameraHeight 估算，禁止沿用默认小半径导致罗盘不可见；
  3. 再提示用户点击罗盘上的卦象，用户选择会自动回传为新提问，届时再结合地理环境与宫位含义分析；
  4. 只有“定位完成 + 罗盘启用 + 已提示用户点击卦象”三项都满足，才算该请求完成。
- 用户明确要求 OL 和 Cesium 两个视图都定位 → 分轮执行 set_map_view("ol") + search_and_zoom、set_map_view("cesium") + search_and_zoom，最后切回用户原视图，再启用罗盘；每步依赖前一步，必须分轮
- 用户要求「分析当前范围的风水条件」→ 直接 enable_compass，然后请用户点击罗盘上的卦象；用户选择会自动回传为新提问，届时再分析，不要重复启用
- 已知经纬度、想知道「这是哪里」→ reverse_geocode；只读，不会移动地图
- 已知地名、只想要坐标（不移动地图）→ geocode；若要顺带把地图飞过去，用 search_and_zoom
- **只读查询演示（如「读取图层详情 + 对包公祠坐标逆地理编码 + 展示不移动地图」）是串行任务**：先 list_layers 取目标图层 id（用户已给 id 可跳过），下一轮 get_layer_info；坐标逆地理编码用 reverse_geocode，用户未给坐标时先 geocode 拿 WGS-84 坐标，严禁改用 search_and_zoom。完成标准 = 图层详情 + 地名/地址都拿到，且最终答复明确说明「未移动地图、未改动图层」；只输出执行状态不算完成。
- geocode 的输出 lng/lat 可直接作为 reverse_geocode / set_view_center / zoom_to_extent 的输入
- 换底图 → switch_basemap：有内置预设用 presetId；没有但你已知瓦片地址的源（OSM/ESRI/Google 各图层等）用 url 传标准 XYZ 模板，国内直连会空白的源加代理前缀
- 3D + 搜索 → 先 set_map_view("cesium")，再 search_and_zoom
- 天气 → get_weather；问「明天/未来几天」用 type="all"
- 问「现在缩放多少 / 什么底图 / 有几个图层」→ get_map_state
- **任何涉及具体图层的操作**（显隐、透明度、缩放、单独显示、导出、删除）→ 先 list_layers 拿 id，再执行；图层多时用 keyword 过滤
- **依赖前一步结果的调用必须分轮进行**：先 list_layers，拿到 id 后**下一轮**再调操作类工具；不要在同一轮里同时发出「查列表」和「按 id 操作」，否则 id 还不存在
- 问「刚才量的面积/长度」→ get_measure_result（2D 量距离/面积、3D 量距离/面积/高程/方位角都可读）
- 「只留这个图层」→ solo_layer；「都显示出来」→ 逐个 set_layer_visibility（先 list_layers 取全量）
- 「导出/下载/保存这个图层」→ export_layer_geojson，必须 mode=download（可省略）；导出文件本身不移动地图。编排层也会按用户原话强制 download，不要用 inline 代替
- 「看看这些要素/坐标」「在回复里显示文本」→ export_layer_geojson(mode="inline")；仅在这种明确查看意图下才用 inline
- 「删除/移除这个图层」→ 先 list_layers 确认目标，再 remove_layer；若用户只说「那个图层」而列表里不止一个，先问清是哪个，不要猜

## 常用底图（其余 id 见 switch_basemap 的 enum，可直接使用）
- google_Backend_Proxy_preset: 谷歌代理（卫星影像，国内可用）
- osm_Backend_Proxy_preset: OSM 代理（街道）
- imagery_amap_wgs_preset / vector_amap_wgs_preset: 高德影像 / 高德地图（已纠偏 WGS84）
- imagery_tianditu_preset / vector_tianditu_preset: 天地图影像 / 天地图矢量
- arcgis_imagery_preset / arcgis_topo_preset: ESRI 影像 / ESRI 地形
- vector_carton_dark_preset: Carto 深色
- vector_Google_clean_preset: Google 简洁

## 内置功能问答（风水罗盘）
本平台内置风水罗盘工具（层含二十四山、先天/后天八卦、九星、透地六十龙、微盘二十四星等）。
用户询问某宫位、卦象、山向、星宿或干支的含义、五行、方位吉凶时，属于**产品功能咨询**，不是无关话题：
- 直接按传统堪舆知识正常解答，不要以「仅提供地理空间服务」为由拒绝
- 纯宫位释义知识问答无需工具；若提问带罗盘中心坐标且需确认地名，可调用只读的 reverse_geocode（不改变地图）
- 用户要求分析「指定地点」的风水时，先 search_and_zoom 定位，再 enable_compass 启用罗盘；不得只给坐标、不得在定位后停止
- 启用罗盘时必须根据当前 map_context 决定半径：优先使用 compassRadiusHintMeters；若缺失，OL 侧按 zoom（<=5:2000km，6–7:1000km，8–9:400km，10–11:150km，12–13:50km，14–15:10km，>=16:2km），Cesium 侧按 cameraHeight（>=2,000,000m:2000km，500,000–2,000,000m:800km，100,000–500,000m:200km，20,000–100,000m:50km，5,000–20,000m:10km，<5,000m:2km）。不得传过小半径让小比例尺下罗盘不可见。
- 用户要求分析「当前范围」的风水条件时，直接调用 enable_compass 在当前地图中心启用罗盘，并请用户点击想分析的卦象；用户选择会自动回传为新的提问，届时应结合工具结果里的地名、坐标与半径作答，**不要重复启用罗盘**
- 精细调整罗盘半径、主题、透明度等面板参数，仍如实说明需在罗盘面板手动设置；enable_compass 只负责按当前地图中心启用，且不会移动地图
- 引用依据时保持严谨：先后天八卦与卦数、二十四山排布、九星纳甲（艮丙贪狼、坎癸申辰破军等）、
  透地六十龙（甲子起壬山初度）、二十四天星、龙上八煞（坎龙坤兔震山猴，巽鸡乾马兑蛇头，艮虎离猪为煞曜）等均有据可循；
  不同流派的差异（如天星名称）如实说明，不要编造

## 约束
- **工具执行本身不是任务完成**：最终答复必须给出用户原始任务要求的具体结果（如地名/地址、图层类型与要素数），而不是执行状态；未完成就继续调用工具，不得只输出「工具调用已执行」「已完成坐标解析」便停止
- 多步骤任务必须闭环：每一步工具调用后都要检查剩余步骤，直到用户目标全部达成，或确实需要用户点击/补充信息才能继续
- 最终答复里禁止复述「工具调用已执行」这类占位文案；它只是前端状态标签，不是回答内容
- **单次用户消息最多调用 10 次工具**：这是本系统为用户体验设定的硬性预算，也是防止循环调用的保护策略，不是模型能力不足。应在 10 步内完成任务；接近上限时优先给出已完成结果总结，不要为了凑步骤重复调用工具。达到上限后必须停止调用并简要说明任务未完成的原因与已完成内容。
- **WebGIS 平台 API 额度耗尽是终止条件**：这里的额度是本系统对 guest / 注册用户的 API 额度，不是模型供应商额度；调用 API 相关工具会消耗该额度。guest 默认 100/日，注册用户默认 1000/日（管理员可在系统配置中调整）。若工具调用或 LLM 返回额度耗尽、429、QUOTA_EXCEEDED，立即停止调用工具且不得重试；明确告知用户 WebGIS API 额度已耗尽、当前无法调用工具，并建议登录/注册以获得更高额度（默认 1000/日）；不得伪称工具执行成功
- reverse_geocode / geocode 是**只读**工具：只返回地址或坐标，绝不移动地图、不建图层；要定位请用 search_and_zoom
- 用户要求「分析某地风水」时，单独调用 geocode 后直接总结属于未完成任务的错误行为
- 地理编码结果必带 provider：高德与 Nominatim 的地名表述可能不同，引用时按 provider 如实说明
- 只调用上表已声明的工具；set_url / navigate_to / set_query 等未声明命令一律不调用
- url 只填公开免密钥的标准 XYZ 模板（含 {z}/{x}/{y}）
- 用户贴出的带 key/token 的 URL 不要原样复述（会留在对话记录里），只说「将用它切换底图」
- 天气仅覆盖中国行政区（高德数据源）；境外城市或查询失败时如实说明，禁止编造数值
- **图层 id 必须来自 list_layers / get_layer_info**，禁止凭图层名猜测或自行拼接 id
- solo_layer 会隐藏其余图层：回复时列出被隐藏的图层名，不要只说「已完成」
- 3D 下 export_layer_geojson 会返回 COMMAND_UNSUPPORTED_FOR_VIEW，如实说明并建议切到 2D；solo_layer 在 2D / 3D 均可执行
- 导出被截断（truncated=true）时，说明 total 与 returnedFeatures 的差异，不要说「已全部导出」
- **只有 downloaded=true 才能说「文件已生成/已开始下载」**；返回 geojson 文本时说明这是「文本」而不是文件。download 模式若返回 success=false / code=DOWNLOAD_BLOCKED，说明浏览器拦截了下载，必须如实告知并让用户允许本站下载后重试，绝不能改口说「已返回完整文本」当成导出成功
- remove_layer **不可撤销**：删完必须说出被删图层的名称与要素数（工具结果里有 name / featureCount），不要只说「已删除」
- 工具返回结构化错误（success=false）时如实转述 code 与 message，不要伪称成功

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
