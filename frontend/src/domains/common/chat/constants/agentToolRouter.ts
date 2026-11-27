/**
 * Agent 工具按意图分发（V3.7.19；V3.7.27 改为从能力注册表派生）
 *
 * 背景：20 个工具的完整 JSON Schema 约 8,817 字符 / 11,915 字节，
 * 是 System Prompt（962 字符）的 9.2 倍，且首轮与每个编排轮次都全量发送，
 * 构成首轮延迟的结构性瓶颈。本模块按用户消息关键词选择工具子集：
 * 核心工具常驻，命中分组整组追加。
 *
 * V3.7.27：分组定义与触发词迁入 agentCapabilityRegistry.ts（SSOT），
 * 本文件只保留路由算法——注册表改一处，router 与 Prompt 同步。
 *
 * 设计约束：
 * - 纯函数、零副作用；不修改 AGENT_TOOLS，只返回原数组元素的引用。
 * - 宽进策略：关键词宁可多发也不错过；未命中任何分组时仍返回核心集。
 * - 工具总数不变（20），TOOL_REGISTRY / 执行链零改动。
 * - 多轮编排复用首轮算出的工具集，避免中途变更导致模型引用不存在工具。
 */

import { AGENT_TOOLS } from '@common/chat/constants/agentToolsSchema';
import {
    CORE_CAPABILITIES,
    CAPABILITY_GROUPS,
    REGISTERED_TOOL_NAMES,
    buildTriggerPatterns,
} from '@common/chat/constants/agentCapabilityRegistry';
import { validateQuickCommandsAgainstRules } from '@common/chat/constants/basemapQuickCommands';

type AgentTool = (typeof AGENT_TOOLS)[number];

// V3.7.15：开发期校验快捷命令 intent 仍能被切片规则表解析。
// 规则表改动导致快捷命令失效时立即在控制台暴露，防止 V3.7.21 类静默断裂。
if (import.meta.env.DEV) {
    const broken = validateQuickCommandsAgainstRules();
    if (broken.length > 0) {
        console.warn('[agentToolRouter] 快捷命令 intent 未命中规则表:', broken);
    }
}

/** 编译后的分组路由表（模块加载期一次） */
const ROUTES = CAPABILITY_GROUPS.map((def) => ({
    names: def.names,
    patterns: buildTriggerPatterns(def.group),
}));

/**
 * 按用户消息选择工具子集。
 * @param userMsg 本轮用户消息；空串返回全量（重新生成等场景兜底）
 * @returns 工具定义数组，元素为 AGENT_TOOLS 原引用（保持声明顺序）
 */
export function selectToolsForMessage(userMsg: string): AgentTool[] {
    const text = String(userMsg || '').trim();
    // 空消息无法判定意图（重试/重新生成），退化为全量保证能力不丢
    if (!text) return AGENT_TOOLS.slice();

    const selected = new Set<string>(CORE_CAPABILITIES);
    for (const route of ROUTES) {
        if (route.patterns.some((pattern) => pattern.test(text))) {
            for (const name of route.names) selected.add(name);
        }
    }
    // 兜底：未登记工具一律常驻，能力永不因路由遗漏而丢失
    for (const tool of AGENT_TOOLS) {
        if (!REGISTERED_TOOL_NAMES.has(tool.function.name)) selected.add(tool.function.name);
    }

    // 保持 AGENT_TOOLS 声明顺序，模型看到的工具顺序稳定
    return AGENT_TOOLS.filter((tool) => selected.has(tool.function.name));
}
