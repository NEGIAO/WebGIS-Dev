/**
 * Chat Store — 聊天与工具调用状态管理
 *
 * 管理 Agent 工具调用的生命周期状态，包括：
 * - 工具调用记录（历史与当前执行中）
 * - GISCommander 与 AgentExecutor 实例的生命周期
 * - 工具执行状态的响应式更新（供 UI 绑定）
 *
 * @module useChatStore
 */

import { ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { AgentExecutor } from '@/services/agent/AgentExecutor.js';

// ============================================================
//  类型定义
// ============================================================

/** 单条工具调用记录 */
export interface ToolCallRecord {
    /** 工具调用 ID（原生 Function Calling 或降级模式自动生成） */
    id: string;
    /** 工具名称 */
    name: string;
    /** 调用参数 */
    arguments: Record<string, unknown>;
    /** 执行状态 */
    status: 'pending' | 'executing' | 'success' | 'error';
    /** 执行结果消息 */
    resultMessage?: string;
    /** 错误信息 */
    error?: string;
    /** 开始时间戳 */
    startTime: number;
    /** 结束时间戳 */
    endTime?: number;
    /** 关联的消息索引（在 messages 数组中的位置） */
    messageIndex?: number;
}

// ============================================================
//  Store 定义
// ============================================================

export const useChatStore = defineStore('chat', () => {
    // ========== 状态 ==========

    /** 工具调用历史记录 */
    const toolCallHistory = ref<ToolCallRecord[]>([]);

    /** 当前正在执行的工具调用 */
    const activeToolCalls = ref<ToolCallRecord[]>([]);

    /** AgentExecutor 实例（由 ChatPanelContent 初始化后注入） */
    const executor = shallowRef<AgentExecutor | null>(null);

    /** GISCommander 是否已就绪 */
    const isCommanderReady = ref(false);

    /** 最近一次工具调用的错误信息 */
    const lastError = ref<string>('');

    // ========== 方法 ==========

    /**
     * 注入 AgentExecutor 实例
     * 由 ChatPanelContent 在初始化 GISCommander 和 AgentExecutor 后调用
     *
     * @param exec - AgentExecutor 实例
     */
    function setExecutor(exec: AgentExecutor) {
        executor.value = exec;
        isCommanderReady.value = true;
    }

    /**
     * 记录工具调用开始
     *
     * @param record - 工具调用记录（不含 status，默认为 'executing'）
     */
    function startToolCall(record: Omit<ToolCallRecord, 'status' | 'startTime'>) {
        const fullRecord: ToolCallRecord = {
            ...record,
            status: 'executing',
            startTime: Date.now(),
        };
        activeToolCalls.value.push(fullRecord);
    }

    /**
     * 更新工具调用状态为完成
     *
     * @param id - 工具调用 ID
     * @param result - 执行结果
     */
    function completeToolCall(id: string, result: { success: boolean; message: string }) {
        const record = _findActiveToolCall(id);
        if (!record) return;

        record.status = result.success ? 'success' : 'error';
        record.resultMessage = result.message;
        record.endTime = Date.now();
        if (!result.success) {
            record.error = result.message;
            lastError.value = result.message;
        }

        // 从 active 移到 history
        _moveToHistory(record);
    }

    /**
     * 更新工具调用状态为出错
     *
     * @param id - 工具调用 ID
     * @param error - 错误信息
     */
    function failToolCall(id: string, error: string) {
        const record = _findActiveToolCall(id);
        if (!record) return;

        record.status = 'error';
        record.error = error;
        record.resultMessage = error;
        record.endTime = Date.now();
        lastError.value = error;

        _moveToHistory(record);
    }

    /**
     * 清除所有工具调用记录
     */
    function clearHistory() {
        toolCallHistory.value = [];
        activeToolCalls.value = [];
        lastError.value = '';
    }

    /**
     * 获取指定消息索引关联的工具调用记录
     *
     * @param messageIndex - 消息索引
     * @returns 关联的工具调用记录列表
     */
    function getToolCallsForMessage(messageIndex: number): ToolCallRecord[] {
        return toolCallHistory.value.filter((r) => r.messageIndex === messageIndex);
    }

    // ========== 内部辅助 ==========

    /**
     * 在 activeToolCalls 中查找指定 ID 的记录
     * @private
     */
    function _findActiveToolCall(id: string): ToolCallRecord | undefined {
        return activeToolCalls.value.find((r) => r.id === id);
    }

    /**
     * 将完成的记录从 activeToolCalls 移动到 toolCallHistory
     * @private
     */
    function _moveToHistory(record: ToolCallRecord) {
        const idx = activeToolCalls.value.findIndex((r) => r.id === record.id);
        if (idx >= 0) {
            activeToolCalls.value.splice(idx, 1);
        }
        toolCallHistory.value.push(record);
    }

    // ========== 返回 ==========

    return {
        // 状态
        toolCallHistory,
        activeToolCalls,
        executor,
        isCommanderReady,
        lastError,
        // 方法
        setExecutor,
        startToolCall,
        completeToolCall,
        failToolCall,
        clearHistory,
        getToolCallsForMessage,
    };
});
