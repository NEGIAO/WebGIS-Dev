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

/** Agent 可见的最小预设描述（不含 stack 等内部实现细节） */
export interface AgentBasemapPreset {
    id: string;
    label: string;
}

export const AGENT_BASEMAP_PRESETS: readonly AgentBasemapPreset[] = Object.freeze(
    BASEMAP_PRESETS.map((preset): AgentBasemapPreset => ({
        id: preset.id,
        label: preset.label
    })),
);

export const AGENT_BASEMAP_PRESET_IDS: readonly string[] = Object.freeze(
    AGENT_BASEMAP_PRESETS.map((preset) => preset.id),
);

const AGENT_BASEMAP_PRESET_ID_SET = new Set<string>(AGENT_BASEMAP_PRESET_IDS);
const AGENT_BASEMAP_PRESET_LABELS = new Map<string, string>(
    AGENT_BASEMAP_PRESETS.map((preset): [string, string] => [preset.id, preset.label]),
);

/** 判断值是否为已登记的底图预设 ID（自动裁剪首尾空白） */
export function isAgentBasemapPresetId(value: unknown): boolean {
    return typeof value === 'string' && AGENT_BASEMAP_PRESET_ID_SET.has(value.trim());
}

/** 取预设展示名；未登记返回 null */
export function getAgentBasemapPresetLabel(value: unknown): string | null {
    return AGENT_BASEMAP_PRESET_LABELS.get(String(value || '').trim()) || null;
}
