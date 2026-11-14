/**
 * AgentExecutor — Agent 响应拦截与执行路由器
 *
 * 职责：
 * 1. 检测 Agent 响应中的 tool_calls（原生 Function Calling 格式）
 * 2. 解析文本中的工具调用指令（降级模式，```tool_call JSON 块）
 * 3. 将工具调用路由到 GISCommander 对应函数
 * 4. 收集执行结果并格式化回传
 *
 * 支持双模式自动切换：优先使用原生 tool_calls，降级到文本解析。
 *
 * @module AgentExecutor
 */

import { parseToolCallsFromText, formatToolResultForLLM } from '@common/chat/constants/agentToolsSchema';

// ============================================================
//  类型定义
// ============================================================

/** 工具调用参数：LLM 返回的动态 JSON */
export type ToolArguments = Record<string, any>;

/** 归一化后的工具调用（原生 tool_calls 与文本降级模式统一形状） */
export interface AgentToolCall {
    /** 原生 Function Calling 提供；降级模式自动生成 */
    id?: string;
    name: string;
    arguments: ToolArguments;
}

/** 单个工具的执行结果（回传给 LLM） */
export interface ToolExecutionResult {
    toolCallId: string;
    name: string;
    result: Record<string, any>;
}

/** Agent API 响应（不同服务商字段略有差异） */
export interface AgentResponse {
    tool_calls?: any[];
    reply?: string;
    content?: string;
    [key: string]: any;
}

export interface ToolStartEvent {
    toolCallId: string;
    name: string;
    arguments: ToolArguments;
    [key: string]: unknown;
}

export interface ToolCompleteEvent {
    toolCallId: string;
    name: string;
    /** GISCommander 方法的返回值，形状随工具而异 */
    result?: unknown;
    [key: string]: unknown;
}

export interface ToolErrorEvent {
    toolCallId: string;
    name: string;
    error: string;
    [key: string]: unknown;
}

export interface AgentExecutorOptions {
    /** GISCommander 门面实例（createGISCommander 返回值） */
    gisCommander?: any;
    /** 工具开始执行的回调（用于 UI 状态更新） */
    onToolStart?: (payload: ToolStartEvent) => void;
    /** 工具执行完成的回调 */
    onToolComplete?: (payload: ToolCompleteEvent) => void;
    /** 执行出错的回调 */
    onError?: (payload: ToolErrorEvent) => void;
}

// ============================================================
//  工具注册表：名称 → GISCommander 方法映射
// ============================================================

/**
 * 工具名称到 GISCommander 方法的映射
 * key: tool_call 中的 function.name
 * value: GISCommander 实例上的方法名
 */
const TOOL_REGISTRY: Record<string, string> = {
    set_map_view: 'setMapView',
    set_view_center: 'setViewCenter',
    set_camera_orientation: 'setCameraOrientation',
    zoom_to_extent: 'zoomToExtent',
    search_and_zoom: 'searchAndZoom',
    switch_basemap: 'switchBasemap',
    // 只读数据查询，不经过 MapCommandBus（见 GISCommander.getWeather 注释）
    get_weather: 'getWeather',
};

// ============================================================
//  AgentExecutor 类
// ============================================================

/** 无配置构造时的共享空选项（只读使用，等价于每次新建 {}） */
const DEFAULT_EXECUTOR_OPTIONS: AgentExecutorOptions = Object.freeze({});

export class AgentExecutor {
    declare private commander: any;
    declare private onToolStart: (payload: ToolStartEvent) => void;
    declare private onToolComplete: (payload: ToolCompleteEvent) => void;
    declare private onError: (payload: ToolErrorEvent) => void;

    constructor(options: AgentExecutorOptions = DEFAULT_EXECUTOR_OPTIONS) {
        const { gisCommander, onToolStart, onToolComplete, onError } = options;
        this.commander = gisCommander;
        this.onToolStart = onToolStart || (() => {});
        this.onToolComplete = onToolComplete || (() => {});
        this.onError = onError || (() => {});
    }

    /** 执行单个工具调用 */
    async executeToolCall(toolCall: AgentToolCall): Promise<ToolExecutionResult> {
        const { id, name, arguments: args } = toolCall;
        const toolCallId = id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // 查找对应的 Commander 方法
        const commanderMethod = TOOL_REGISTRY[name];
        if (!commanderMethod || typeof this.commander[commanderMethod] !== 'function') {
            const errorMsg = `未知的工具：${name}。可用工具：${Object.keys(TOOL_REGISTRY).join(', ')}`;
            this.onError({ toolCallId, name, error: errorMsg });
            return {
                toolCallId,
                name,
                result: { success: false, message: errorMsg },
            };
        }

        // 通知 UI 工具开始执行
        this.onToolStart({ toolCallId, name, arguments: args });

        try {
            // 调用 GISCommander 对应方法
            const result = await this.commander[commanderMethod](args || {});

            // 通知 UI 工具执行完成
            this.onToolComplete({ toolCallId, name, result });

            return { toolCallId, name, result };
        } catch (err) {
            const errorMsg = `工具 "${name}" 执行异常：${(err as { message?: string })?.message || '未知错误'}`;
            this.onError({ toolCallId, name, error: errorMsg });
            return {
                toolCallId,
                name,
                result: { success: false, message: errorMsg },
            };
        }
    }

    /**
     * 批量执行 tool_calls 数组
     * 多个工具按顺序串行执行，避免地图动画竞争（如 set_map_view -> set_view_center）
     */
    async executeToolCalls(toolCalls: AgentToolCall[]): Promise<ToolExecutionResult[]> {
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
            return [];
        }

        // Map mutations are intentionally serialized. This preserves call order for
        // sequences such as set_map_view -> set_view_center and avoids animation races.
        const results: ToolExecutionResult[] = [];
        for (const toolCall of toolCalls) {
            try {
                results.push(await this.executeToolCall(toolCall));
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'unknown error';
                results.push({
                    toolCallId: toolCall?.id || `tool_error_${Date.now()}`,
                    name: toolCall?.name || 'unknown',
                    result: {
                        success: false,
                        message: `Tool execution failed: ${msg}`,
                    },
                });
            }
        }
        return results;
    }

    /**
     * 从 Agent 响应中提取工具调用（双模式）
     *
     * 优先检查原生 tool_calls 字段，若无则解析文本中的 JSON 块。
     * 无工具调用时返回 null。
     */
    static extractToolCalls(response: AgentResponse | null | undefined): AgentToolCall[] | null {
        if (!response) return null;

        // 模式 1：原生 tool_calls（OpenAI Function Calling 格式）
        if (Array.isArray(response.tool_calls) && response.tool_calls.length > 0) {
            return response.tool_calls.map((tc) => ({
                id: tc.id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: tc.function?.name || tc.name || '',
                arguments: _parseArguments(tc.function?.arguments || tc.arguments || {}),
            }));
        }

        // 模式 2：从文本中解析 tool_call JSON 块（降级模式）
        const reply = String(response.reply || response.content || '');
        const textToolCalls = parseToolCallsFromText(reply);
        if (textToolCalls) {
            return textToolCalls.map((tc, idx) => ({
                id: `text_tc_${Date.now()}_${idx}`,
                name: tc.name,
                arguments: tc.arguments,
            }));
        }

        return null;
    }

    /** 检查响应是否包含工具调用 */
    static hasToolCalls(response: AgentResponse | null | undefined): boolean {
        return AgentExecutor.extractToolCalls(response) !== null;
    }

    /**
     * 从文本回复中移除 tool_call JSON 块（用于显示给用户）
     * 支持多种格式：tool_call 代码块、json 代码块、裸 JSON
     */
    static stripToolCallBlocks(text: string): string {
        if (!text) return '';
        return text
            .replace(/```(?:tool_call|tool_calls?)\s*\n?[\s\S]*?\n?\s*```/g, '')
            .replace(/```json\s*\n?\{[\s\S]*?\}\s*\n?\s*```/g, '')
            // 移除裸 JSON tool_call（含 "name" 和 "arguments" 字段的对象）
            .replace(/\{[^{}]*"name"\s*:\s*"[^"]+?"[^{}]*"arguments"\s*:\s*\{[^]*?\}\s*\}/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /** 构建工具执行结果消息（用于回传给 LLM） */
    static buildResultSummary(results: ToolExecutionResult[]): string {
        if (!Array.isArray(results) || results.length === 0) return '';

        return results
            .map((r) => formatToolResultForLLM(r.name, r.result))
            .join('\n');
    }
}

// ============================================================
//  内部辅助函数
// ============================================================

/** 解析工具调用参数（兼容字符串和对象格式） */
function _parseArguments(rawArgs: string | ToolArguments | null | undefined): ToolArguments {
    if (typeof rawArgs === 'string') {
        try {
            return JSON.parse(rawArgs);
        } catch {
            return {};
        }
    }
    if (typeof rawArgs === 'object' && rawArgs !== null) {
        return rawArgs;
    }
    return {};
}
