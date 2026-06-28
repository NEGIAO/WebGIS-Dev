/**
 * Agent 配置共享 Composable
 * 消除 AdminControlPanel.vue 和 ApiKeysManagementPanel.vue 之间的重复代码
 *
 * 设计说明：
 * - useMessage() 在各函数内部按需调用，避免模块顶层执行导致 Vue 注入上下文缺失
 * - DEFAULT_AGENT_CONFIG.extra_body 使用工厂函数，确保每次获取都是独立副本（避免引用共享）
 */

import { ref } from 'vue';
import { useMessage } from '../composables/useMessage';
import {
    apiAdminGetAgentConfig,
    apiAdminUpdateAgentConfig,
} from '../api/backend';

/**
 * 获取默认 extra_body 的深拷贝（避免多组件共享同一引用）
 * @returns {{ chat_template_kwargs: { enable_thinking: boolean }, reasoning_budget: number }}
 */
const getDefaultExtraBody = () => ({
    chat_template_kwargs: { enable_thinking: true },
    reasoning_budget: 16384,
});

// 默认配置常量（与后端 constants.py 保持一致）
export const DEFAULT_AGENT_CONFIG = {
    base_url: '',
    model: '',
    available_models_text: '',
    timeout_seconds: 45,
    max_tokens: 32768,
    temperature: 1,
    top_p: 0.95,
    extra_body: getDefaultExtraBody(),
    stream: true,
    system_prompt: '',
    guest_daily_quota: 10,
    registered_daily_quota: 100,
};

/**
 * 解析 Available Models 文本为数组
 */
export function parseAvailableModelsText(rawText) {
    return String(rawText || '')
        .split(/[,\n]/g)
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .filter((item, index, array) => array.indexOf(item) === index)
        .slice(0, 200);
}

/**
 * 将后端返回的配置对象转换为表单草稿格式
 */
export function hydrateAgentConfigDraft(agentConfig, agentConfigDraft) {
    const cfg = agentConfig || {};
    const provider = cfg.provider || {};
    const chatQuota = cfg.chat_quota || {};

    agentConfigDraft.value = {
        base_url: String(provider.base_url || ''),
        model: String(provider.model || ''),
        available_models_text: Array.isArray(provider.available_models)
            ? provider.available_models.join('\n')
            : '',
        timeout_seconds: Number(provider.timeout_seconds || 45),
        max_tokens: Number(provider.max_tokens || 32768),
        temperature: Number(provider.temperature ?? 1),
        top_p: Number(provider.top_p ?? 0.95),
        extra_body: provider.extra_body
            ? JSON.stringify(provider.extra_body, null, 2)
            : JSON.stringify({ chat_template_kwargs: { enable_thinking: true }, reasoning_budget: 16384 }, null, 2),
        stream: Boolean(provider.stream ?? true),
        system_prompt: String(provider.system_prompt || ''),
        guest_daily_quota: Number(chatQuota.guest || 10),
        registered_daily_quota: Number(chatQuota.registered || 100),
    };
}

/**
 * 验证并构建保存载荷
 */
export function buildSavePayload(agentConfigDraft) {
    const availableModels = parseAvailableModelsText(agentConfigDraft.value.available_models_text);
    const guestDailyQuota = Number(agentConfigDraft.value.guest_daily_quota || 0);
    const registeredDailyQuota = Number(agentConfigDraft.value.registered_daily_quota || 0);

    let extraBodyParsed = {};
    try {
        extraBodyParsed = JSON.parse(agentConfigDraft.value.extra_body || '{}');
    } catch (_e) {
        return { error: 'Extra Body 必须是合法的 JSON' };
    }

    const payload = {
        base_url: String(agentConfigDraft.value.base_url || '').trim(),
        model: String(agentConfigDraft.value.model || '').trim(),
        available_models: availableModels,
        timeout_seconds: Number(agentConfigDraft.value.timeout_seconds || 45),
        max_tokens: Number(agentConfigDraft.value.max_tokens || 32768),
        temperature: Number(agentConfigDraft.value.temperature ?? 1),
        top_p: Number(agentConfigDraft.value.top_p ?? 0.95),
        extra_body: extraBodyParsed,
        stream: Boolean(agentConfigDraft.value.stream ?? true),
        guest_daily_quota: guestDailyQuota,
        registered_daily_quota: registeredDailyQuota,
        system_prompt: String(agentConfigDraft.value.system_prompt || '').trim(),
    };

    // 验证必填字段
    if (!payload.base_url || !payload.system_prompt) {
        return { error: 'Base URL、System Prompt 不能为空' };
    }

    if (!payload.model && payload.available_models.length === 0) {
        return { error: '请至少配置一个固定 Model 或 available_models 列表' };
    }

    if (!Number.isFinite(guestDailyQuota) || guestDailyQuota < 1) {
        return { error: 'Guest 每日额度必须是大于 0 的整数' };
    }

    if (!Number.isFinite(registeredDailyQuota) || registeredDailyQuota < 1) {
        return { error: 'Registered 每日额度必须是大于 0 的整数' };
    }

    return { payload };
}

/**
 * 加载 Agent 配置
 * @param {import('vue').Ref<Object>} agentConfig - 配置状态 ref
 * @param {import('vue').Ref<Object>} agentConfigDraft - 表单草稿 ref
 * @param {import('vue').Ref<boolean>} loadingRef - 加载状态 ref
 */
export async function loadAgentConfig(agentConfig, agentConfigDraft, loadingRef) {
    const message = useMessage();
    loadingRef.value = true;
    try {
        const result = await apiAdminGetAgentConfig();
        const data = result?.data || result || {};
        agentConfig.value = data;
        hydrateAgentConfigDraft(data, agentConfigDraft);
    } catch (error) {
        message.error(`加载 Agent 配置失败: ${error.message}`);
    } finally {
        loadingRef.value = false;
    }
}

/**
 * 保存 Agent 配置
 * @param {import('vue').Ref<Object>} agentConfig - 配置状态 ref
 * @param {import('vue').Ref<Object>} agentConfigDraft - 表单草稿 ref
 * @param {import('vue').Ref<boolean>} loadingRef - 加载状态 ref
 * @param {import('vue').Ref<boolean>} submittingRef - 提交状态 ref
 * @returns {Promise<boolean>} 是否保存成功
 */
export async function saveAgentConfig(agentConfig, agentConfigDraft, loadingRef, submittingRef) {
    const message = useMessage();
    const validation = buildSavePayload(agentConfigDraft);
    if (validation.error) {
        message.error(validation.error);
        return false;
    }

    submittingRef.value = true;
    try {
        const result = await apiAdminUpdateAgentConfig(validation.payload);
        const data = result?.data || result || {};
        // 使用服务端返回的完整配置，而不是本地 payload
        agentConfig.value = data;
        hydrateAgentConfigDraft(data, agentConfigDraft);
        message.success('Agent LLM 参数已保存，后端运行时动态读取，即时生效');
        return true;
    } catch (error) {
        message.error(`保存 Agent 配置失败: ${error.message}`);
        return false;
    } finally {
        submittingRef.value = false;
    }
}

/**
 * 重置对话额度
 * @param {import('vue').Ref<Object>} agentConfig - 配置状态 ref
 * @param {import('vue').Ref<Object>} agentConfigDraft - 表单草稿 ref
 * @param {import('vue').Ref<boolean>} loadingRef - 加载状态 ref
 */
export async function resetChatQuota(agentConfig, agentConfigDraft, loadingRef) {
    const message = useMessage();
    try {
        await apiAdminUpdateAgentConfig({ reset_chat_quota: true });
        await loadAgentConfig(agentConfig, agentConfigDraft, loadingRef);
        message.success('已恢复默认对话额度');
    } catch (error) {
        message.error(`恢复默认额度失败: ${error.message}`);
    }
}

/**
 * 创建 Agent 配置状态和方法的工厂函数
 * 每个组件调用一次获得独立的响应式状态
 */
export function useAgentConfig() {
    const agentConfig = ref({});
    const agentConfigDraft = ref({ ...DEFAULT_AGENT_CONFIG });
    const loading = ref(false);
    const submitting = ref(false);

    return {
        // 状态
        agentConfig,
        agentConfigDraft,
        loading,
        submitting,

        // 方法
        load: () => loadAgentConfig(agentConfig, agentConfigDraft, loading),
        save: () => saveAgentConfig(agentConfig, agentConfigDraft, loading, submitting),
        resetQuota: () => resetChatQuota(agentConfig, agentConfigDraft, loading),
        hydrate: () => hydrateAgentConfigDraft(agentConfig.value, agentConfigDraft),
    };
}