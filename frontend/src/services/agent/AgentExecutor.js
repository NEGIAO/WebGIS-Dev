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

import { parseToolCallsFromText, formatToolResultForLLM } from '@/constants/agentToolsSchema.js';

// ============================================================
//  工具注册表：名称 → GISCommander 方法映射
// ============================================================

/**
 * 工具名称到 GISCommander 方法的映射
 * key: tool_call 中的 function.name
 * value: GISCommander 实例上的方法名
 */
const TOOL_REGISTRY = {
    zoom_to_extent: 'zoomToExtent',
    search_and_zoom: 'searchAndZoom',
    switch_basemap: 'switchBasemap',
};

// ============================================================
//  AgentExecutor 类
// ============================================================

export class AgentExecutor {
    /**
     * @param {Object} options
     * @param {import('@/composables/map/GISCommander.js').GISCommanderAPI} options.gisCommander - GISCommander 实例
     * @param {Function} [options.onToolStart] - 工具开始执行的回调（用于 UI 状态更新）
     * @param {Function} [options.onToolComplete] - 工具执行完成的回调
     * @param {Function} [options.onError] - 执行出错的回调
     */
    constructor({ gisCommander, onToolStart, onToolComplete, onError } = {}) {
        this.commander = gisCommander;
        this.onToolStart = onToolStart || (() => {});
        this.onToolComplete = onToolComplete || (() => {});
        this.onError = onError || (() => {});
    }

    /**
     * 执行单个工具调用
     *
     * @param {Object} toolCall - 工具调用对象
     * @param {string} toolCall.id - 调用 ID（原生 Function Calling 提供，降级模式自动生成）
     * @param {string} toolCall.name - 工具名称
     * @param {Object} toolCall.arguments - 调用参数
     * @returns {Promise<{toolCallId: string, name: string, result: Object}>}
     */
    async executeToolCall(toolCall) {
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
            const errorMsg = `工具 "${name}" 执行异常：${err.message || '未知错误'}`;
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
     * 多个工具调用并发执行（Promise.allSettled）
     *
     * @param {Array<{id?: string, name: string, arguments: Object}>} toolCalls - 工具调用列表
     * @returns {Promise<Array<{toolCallId: string, name: string, result: Object}>>}
     */
    async executeToolCalls(toolCalls) {
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
            return [];
        }

        // 并发执行所有工具调用，保留原始 toolCall 信息用于错误回退
        const results = await Promise.allSettled(
            toolCalls.map((tc) => this.executeToolCall(tc)),
        );

        return results.map((r, idx) => {
            if (r.status === 'fulfilled') return r.value;
            const originalTc = toolCalls[idx] || {};
            return {
                toolCallId: originalTc.id || `tool_error_${Date.now()}`,
                name: originalTc.name || 'unknown',
                result: { success: false, message: `执行失败：${r.reason?.message || '未知错误'}` },
            };
        });
    }

    /**
     * 从 Agent 响应中提取工具调用（双模式）
     *
     * 优先检查原生 tool_calls 字段，若无则解析文本中的 JSON 块。
     *
     * @param {Object} response - Agent API 响应
     * @param {Array} [response.tool_calls] - 原生 tool_calls（OpenAI 格式）
     * @param {string} [response.reply] - 文本回复（降级模式解析来源）
     * @returns {Array<{id?: string, name: string, arguments: Object}>|null} 工具调用列表，无则返回 null
     */
    static extractToolCalls(response) {
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

    /**
     * 检查响应是否包含工具调用
     *
     * @param {Object} response - Agent API 响应
     * @returns {boolean}
     */
    static hasToolCalls(response) {
        return AgentExecutor.extractToolCalls(response) !== null;
    }

    /**
     * 从文本回复中移除 tool_call JSON 块（用于显示给用户）
     * 支持多种格式：tool_call 代码块、json 代码块、裸 JSON
     *
     * @param {string} text - 原始回复文本
     * @returns {string} 清理后的文本
     */
    static stripToolCallBlocks(text) {
        if (!text) return '';
        return text
            .replace(/```(?:tool_call|tool_calls?)\s*\n?[\s\S]*?\n?\s*```/g, '')
            .replace(/```json\s*\n?\{[\s\S]*?\}\s*\n?\s*```/g, '')
            // 移除裸 JSON tool_call（含 "name" 和 "arguments" 字段的对象）
            .replace(/\{[^{}]*"name"\s*:\s*"[^"]+?"[^{}]*"arguments"\s*:\s*\{[^]*?\}\s*\}/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * 构建工具执行结果消息（用于回传给 LLM）
     *
     * @param {Array<{toolCallId: string, name: string, result: Object}>} results - 执行结果数组
     * @returns {string} 格式化的结果文本
     */
    static buildResultSummary(results) {
        if (!Array.isArray(results) || results.length === 0) return '';

        return results
            .map((r) => formatToolResultForLLM(r.name, r.result))
            .join('\n');
    }
}

// ============================================================
//  内部辅助函数
// ============================================================

/**
 * 解析工具调用参数（兼容字符串和对象格式）
 * @private
 * @param {string|Object} rawArgs - 原始参数
 * @returns {Object} 解析后的参数对象
 */
function _parseArguments(rawArgs) {
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
