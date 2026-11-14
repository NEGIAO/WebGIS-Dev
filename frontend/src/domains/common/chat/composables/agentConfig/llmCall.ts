/**
 * LLM 调用通道（按当前路由模式三选一）
 *
 * 从 useChatAgentConfig 拆出：默认 AI（管理员 Key）/ 个人 Key（后端代转发）/
 * 后端代理（收费通道），三者请求体不同但返回结构一致。
 */

import {
    apiAgentChatCompletions,
    apiAgentChatDefaultProxy,
    apiAgentChatProxy,
} from '@/api/backend';

/**
 * 创建 LLM 调用方法
 * @param config 共享的 reactive 配置对象（读取模式与直连参数）
 */
export function createLlmCallMethod(config: any) {
    return {
        /**
         * 调用 LLM API（按当前路由模式选择通道）
         * @param {{ message: string, history: Array, locationContext: string, mapContext?: Object, systemPrompt: string, tools: Array }} payload
         * @returns {Promise<{ reply: string, usedModel: string, rawData: Object, quota: Object|null, cost: number }>}
         */
        async callLLM({
            message: userMsg,
            history,
            locationContext,
            mapContext,
            systemPrompt,
            tools,
        }: {
            message: string;
            history: any[];
            locationContext?: string;
            mapContext?: Record<string, any>;
            systemPrompt?: string;
            tools?: any[];
        }) {
            let reply: any;
            let usedModel: any;
            let rawData: any;
            let quotaData: any = null;
            let callCost = 0;

            const enhancedHistory = systemPrompt
                ? [
                      {
                          role: 'user',
                          content: `[系统指令] 以下是你可以使用的工具说明，请严格按照此格式调用工具：\n\n${systemPrompt}`,
                      },
                      ...history,
                  ]
                : history;

            if (config.isDefaultAIMode) {
                const dc = config.directConfig;
                // 实际请求模型 = 用户在该模式下的选择（defaultAIModel）优先于管理员默认值；
                // 若只取 dc.model，面板里选的模型不保存（或保存后）都对请求无效——跨链路脱节回归。
                const finalModel = config.defaultAIModel || dc.model;
                const result = await apiAgentChatDefaultProxy({
                    message: userMsg,
                    history: enhancedHistory,
                    location_context: locationContext,
                    map_context: mapContext,
                    override_model: finalModel || undefined,
                    override_top_p: dc.top_p,
                    override_extra_body: dc.extra_body,
                    tools,
                    tool_choice: 'auto',
                });
                rawData = result?.data || result || {};
                reply = String(rawData?.reply || '').trim();
                usedModel = String(rawData?.model || finalModel || '');
                if (rawData?.quota) quotaData = rawData.quota;
                if (typeof rawData?.cost === 'number') callCost = rawData.cost;
            } else if (config.isPersonalMode) {
                const dc = config.directConfig;
                const mergedSystemPrompt = systemPrompt
                    ? dc.system_prompt
                        ? `${systemPrompt}\n\n---\n\n${dc.system_prompt}`
                        : systemPrompt
                    : dc.system_prompt || undefined;

                const result = await apiAgentChatProxy({
                    message: userMsg,
                    history: enhancedHistory,
                    location_context: locationContext,
                    map_context: mapContext,
                    api_key: dc.api_key,
                    base_url: dc.base_url,
                    model: dc.model,
                    system_prompt: mergedSystemPrompt,
                    timeout_seconds: dc.timeout_seconds,
                    max_tokens: dc.max_tokens,
                    temperature: dc.temperature,
                    top_p: dc.top_p,
                    extra_body: dc.extra_body,
                    tools,
                    tool_choice: 'auto',
                });
                rawData = result?.data || result || {};
                reply = String(rawData?.reply || '').trim();
                usedModel = String(rawData?.model || dc.model || '');
            } else {
                const chatPayload: any = {
                    message: userMsg,
                    history: enhancedHistory,
                    location_context: locationContext,
                    map_context: mapContext,
                    tools,
                    tool_choice: 'auto',
                };

                const d = config.userConfigDraft;
                const draftBaseUrl = String(d.base_url || '').trim();
                const draftApiKey = String(d.api_key || '').trim();
                const draftModel = String(d.model || '').trim();

                // 同 loadAvailableModels：base_url 与 api_key 成对才透传（防平台 Key 被发往草稿地址）
                if (draftBaseUrl && draftApiKey) {
                    chatPayload.override_base_url = draftBaseUrl;
                    chatPayload.override_api_key = draftApiKey;
                } else if (draftApiKey) {
                    chatPayload.override_api_key = draftApiKey;
                }
                if (draftModel) chatPayload.override_model = draftModel;
                if (typeof d.timeout_seconds === 'number' && d.timeout_seconds > 0)
                    chatPayload.override_timeout_seconds = d.timeout_seconds;
                if (typeof d.max_tokens === 'number' && d.max_tokens > 0)
                    chatPayload.override_max_tokens = d.max_tokens;
                if (typeof d.temperature === 'number') chatPayload.override_temperature = d.temperature;
                if (typeof d.top_p === 'number') chatPayload.override_top_p = d.top_p;
                if (d.extra_body !== undefined && d.extra_body !== null)
                    chatPayload.override_extra_body = d.extra_body;

                const result = await apiAgentChatCompletions(chatPayload);
                rawData = result?.data || result || {};
                reply = String(rawData?.reply || '').trim();
                usedModel = String(rawData?.model || '');
                if (rawData?.quota) quotaData = rawData.quota;
                if (typeof rawData?.cost === 'number') callCost = rawData.cost;
            }

            return { reply, usedModel, rawData, quota: quotaData, cost: callCost };
        },
    };
}
