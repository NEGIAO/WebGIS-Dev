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
