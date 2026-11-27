/**
 * 底图切片预设快捷命令（V3.7.20；V3.7.27 加规则表一致性校验）
 *
 * 背景：tileIntentPresets.ts 已有 19 条高德/Google 切片语义规则，但聊天面板
 * 无可点击入口，用户必须记忆并手打「只显示水系」「高德不要道路」等表述。
 * 本文件把这些规则暴露为一组预设命令，点击后本地解析并直接执行，零 LLM 调用。
 *
 * 设计约束：
 * - intent 文本必须是 TILE_INTENT_RULES 中 userPhrases 的原文，保证规则表命中。
 * - 不硬编码 presetId/URL：解析与代理前缀拼接仍由 tileIntentPresets.ts 负责（SSOT）。
 * - V3.7.27：提供 validateQuickCommandsAgainstRules() 供回归脚本调用——校验
 *   所有 intent 命中规则表，避免重演 V3.7.21「改了规则表漏了兜底表」的静默断裂。
 *   V3.7.15：该函数已接入 router 模块加载期（仅开发期告警，生产零开销）。
 */

import { resolveTileIntentByText } from '@common/chat/constants/tileIntentPresets';

/** 单条预设命令：label 为面板显示名（走 i18n key），intent 为规则表原文 */
export interface BasemapQuickCommand {
    /** 稳定 id，用于 i18n key 与测试定位 */
    id: string;
    /** i18n key（chat.quickCommands.<id>） */
    labelKey: string;
    /** 传给 resolveTileBasemapArg 的原话，必须是规则表 userPhrases 原文 */
    intent: string;
}

export interface BasemapQuickGroup {
    /** 分组 i18n key（chat.quickGroups.<id>） */
    id: 'amap' | 'google';
    labelKey: string;
    commands: readonly BasemapQuickCommand[];
}

/**
 * 预设命令分组。按 provider 分组，避免用户混淆 GCJ-02 / WGS-84 与要素能力边界。
 * Google 组含全部 11 条规则；高德组含 7 条（高德不支持单拆水系/湖泊/土地利用）。
 */
export const BASEMAP_QUICK_GROUPS: readonly BasemapQuickGroup[] = Object.freeze([
    {
        id: 'amap',
        labelKey: 'chat.quickGroups.amap',
        commands: Object.freeze([
            { id: 'amap_full', labelKey: 'chat.quickCommands.amap_full', intent: '高德地图' },
            { id: 'amap_clean', labelKey: 'chat.quickCommands.amap_clean', intent: '高德不要道路' },
            { id: 'amap_clean_wgs', labelKey: 'chat.quickCommands.amap_clean_wgs', intent: '高德简洁纠偏' },
            { id: 'amap_roads', labelKey: 'chat.quickCommands.amap_roads', intent: '高德只要道路' },
            { id: 'amap_roads_wgs', labelKey: 'chat.quickCommands.amap_roads_wgs', intent: '高德路网 WGS' },
            { id: 'amap_satellite', labelKey: 'chat.quickCommands.amap_satellite', intent: '高德卫星' },
            { id: 'amap_satellite_wgs', labelKey: 'chat.quickCommands.amap_satellite_wgs', intent: '高德卫星纠偏' },
        ]),
    },
    {
        id: 'google',
        labelKey: 'chat.quickGroups.google',
        commands: Object.freeze([
            { id: 'google_water', labelKey: 'chat.quickCommands.google_water', intent: 'Google 水系' },
            { id: 'google_landuse', labelKey: 'chat.quickCommands.google_landuse', intent: 'Google 土地利用' },
            { id: 'google_roads', labelKey: 'chat.quickCommands.google_roads', intent: 'Google 纯路网' },
            { id: 'google_highways', labelKey: 'chat.quickCommands.google_highways', intent: 'Google 高速' },
            { id: 'google_poi', labelKey: 'chat.quickCommands.google_poi', intent: 'Google POI' },
            { id: 'google_admin', labelKey: 'chat.quickCommands.google_admin', intent: 'Google 行政边界' },
            { id: 'google_satellite', labelKey: 'chat.quickCommands.google_satellite', intent: 'Google 卫星' },
            { id: 'google_hybrid', labelKey: 'chat.quickCommands.google_hybrid', intent: 'Google 混合影像' },
            { id: 'google_labels', labelKey: 'chat.quickCommands.google_labels', intent: 'Google 仅注记' },
            { id: 'google_clean_terrain', labelKey: 'chat.quickCommands.google_clean_terrain', intent: 'Google 干净地形' },
            { id: 'google_standard', labelKey: 'chat.quickCommands.google_standard', intent: 'Google 标准地图' },
        ]),
    },
]);

/** 全部预设命令的扁平列表，便于按 id 查找 */
export const ALL_BASEMAP_QUICK_COMMANDS: readonly BasemapQuickCommand[] = Object.freeze(
    BASEMAP_QUICK_GROUPS.flatMap((group) => group.commands)
);

/** 判断文本是否为预设命令 intent（供执行路径做来源校验） */
export function isBasemapQuickIntent(text: unknown): boolean {
    const value = String(text || '').trim();
    if (!value) return false;
    return ALL_BASEMAP_QUICK_COMMANDS.some((cmd) => cmd.intent === value);
}

/**
 * V3.7.27：校验所有快捷命令 intent 都能被规则表解析，且 provider 与分组一致。
 * 规则表是 SSOT；此校验让「改了规则表漏了快捷命令」在加载期即暴露（开发期可见）。
 * @returns 失效命令列表，空数组表示全部一致
 */
export function validateQuickCommandsAgainstRules(): string[] {
    const broken: string[] = [];
    for (const cmd of ALL_BASEMAP_QUICK_COMMANDS) {
        const rule = resolveTileIntentByText(cmd.intent);
        const expectedProvider = cmd.id.startsWith('amap_') ? 'amap' : 'google';
        if (!rule || rule.provider !== expectedProvider) {
            broken.push(`${cmd.id} (${cmd.intent} → ${rule?.id || '未命中'})`);
        }
    }
    return broken;
}

// V3.7.15：校验函数由 agentToolRouter 在模块加载期调用（仅 DEV 告警），
// 也供回归脚本使用；生产构建下零开销。
