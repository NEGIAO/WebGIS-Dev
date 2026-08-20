/**
 * Agent 底图预设目录（全量动态派生，无黑名单）
 *
 * 直接派生自 basemapPresets.ts 的 BASEMAP_PRESETS 全量清单（V3.5.24，user 决策）：
 *   - 新增 / 删除 / 改名 preset 自动同步，零漂移；
 *   - 不移除任何条目（含 custom 槽位、local_tiles 本地瓦片、google_Backend_Proxy、
 *     custom_China_Blender 等），切换失败 / 无瓦片由结构化错误与运行时兜底；
 *   - token 类预设（天地图等）密钥由运行时注入，Agent 只见 presetId，不进对话上下文；
 *   - url 通道（标准 XYZ 模板）仍独立开放，见 agentToolsSchema.js 安全约束。
 */
import { BASEMAP_PRESETS } from '@common/basemap/basemapPresets';

export const AGENT_BASEMAP_PRESETS = Object.freeze(
    BASEMAP_PRESETS.map((preset) => ({ id: preset.id, label: preset.label })),
);

export const AGENT_BASEMAP_PRESET_IDS = Object.freeze(
    AGENT_BASEMAP_PRESETS.map((preset) => preset.id),
);

const AGENT_BASEMAP_PRESET_ID_SET = new Set(AGENT_BASEMAP_PRESET_IDS);
const AGENT_BASEMAP_PRESET_LABELS = new Map(
    AGENT_BASEMAP_PRESETS.map((preset) => [preset.id, preset.label]),
);

export function isAgentBasemapPresetId(value) {
    return typeof value === 'string' && AGENT_BASEMAP_PRESET_ID_SET.has(value.trim());
}

export function getAgentBasemapPresetLabel(value) {
    return AGENT_BASEMAP_PRESET_LABELS.get(String(value || '').trim()) || null;
}

/**
 * 按 preset id 语义分组规则（首个命中即归属，顺序即分组优先级）。
 * @type {Array<{keyword: string, name: string}>}
 */
const GROUP_RULES = [
    { keyword: 'tianditu', name: '天地图' },
    { keyword: 'tuxin', name: '图新' },
    { keyword: 'amap', name: '高德' },
    { keyword: 'tengxun', name: '腾讯' },
    { keyword: 'mapbox', name: 'Mapbox' },
    { keyword: 'yandex', name: 'Yandex' },
    { keyword: 'maptiler', name: 'MapTiler' },
    { keyword: 'osm', name: 'OSM 系街道' },
    { keyword: 'carton', name: 'OSM 系街道' },
    { keyword: 'toner', name: 'OSM 系街道' },
    { keyword: 'alidade_satellite', name: '其他' },
    { keyword: 'alidade', name: 'OSM 系街道' },
    { keyword: 'geoq', name: 'GeoQ' },
    { keyword: 'terrain', name: '地形' },
    { keyword: 'hillshade', name: '地形' },
    { keyword: 'topo', name: '地形' },
    { keyword: 'topomap', name: '地形' },
    { keyword: 'esa', name: '地形' },
    { keyword: 'google', name: 'Google' },
    { keyword: '_gac', name: 'Google' },
    { keyword: 'arcgis', name: 'ESRI/ArcGIS' },
    { keyword: 'custom', name: '程序槽位/自定义' },
    { keyword: 'local', name: '本地瓦片' },
];

function matchGroupName(presetId) {
    // 大小写不敏感匹配（id 中存在 Google 等大写品牌段，敏感匹配会漏归组）
    const lowerId = String(presetId).toLowerCase();
    for (const rule of GROUP_RULES) {
        if (lowerId.includes(rule.keyword)) return rule.name;
    }
    return '其他';
}

/**
 * 生成按组分类的多行提示词目录文本（组内保持 BASEMAP_PRESETS 原始顺序）。
 * @returns {string}
 */
export function formatAgentBasemapPresetCatalog() {
    const groups = [];
    const groupIndex = new Map();
    for (const preset of AGENT_BASEMAP_PRESETS) {
        const name = matchGroupName(preset.id);
        if (!groupIndex.has(name)) {
            groupIndex.set(name, groups.length);
            groups.push({ name, lines: [] });
        }
        groups[groupIndex.get(name)].lines.push(`- ${preset.id}: ${preset.label}`);
    }
    return groups.map(({ name, lines }) => `### ${name}\n${lines.join('\n')}`).join('\n');
}
