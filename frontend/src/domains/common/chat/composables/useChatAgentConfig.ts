/**
 * useChatAgentConfig - Agent 对话配置与路由模式管理
 *
 * 职责（从 ChatPanelContent.vue 拆出）：
 *   1. 三种路由模式：默认 AI（管理员 Key）/ 个人 Key（经后端代理）/ 后端代理
 *   2. 个人配置草稿的加载/保存/清除/恢复默认
 *   3. 模型列表加载与模型偏好持久化（localStorage + 后端）
 *   4. 服务状态与今日额度
 *
 * 实现按职责分层在同目录 `agentConfig/` 下：
 * - `configState`      状态默认值、额度归一、模型存储键 + reactive 状态与 computed
 * - `routing`          模式判定/切换、服务状态与额度刷新
 * - `personalConfig`   个人配置读写、模型列表与偏好持久化
 * - `llmCall`          三种通道的 LLM 调用
 *
 * 用法: const config = createChatAgentConfig({ message, onModeChanged });
 *       返回 reactive 对象，模板可直接读写 config.xxx。
 */

import { createConfigState } from './agentConfig/configState';
import { createLlmCallMethod } from './agentConfig/llmCall';
import { createPersonalConfigMethods } from './agentConfig/personalConfig';
import { createRoutingMethods } from './agentConfig/routing';

export interface ChatAgentConfigDeps {
    /** useMessage 实例（toast 提示） */
    message: any;
    /** 路由模式切换后的回调（容器用于刷新欢迎语） */
    onModeChanged?: () => void;
}

/**
 * 工厂：创建 Agent 配置管理对象
 * @param deps 依赖注入（见 ChatAgentConfigDeps）
 * @returns reactive 配置对象（含状态 + 方法）
 */
export function createChatAgentConfig({ message, onModeChanged = () => {} }: ChatAgentConfigDeps) {
    const config: any = createConfigState();

    // 方法按域挂到同一 reactive 对象：内部 config.xxx() 互调无需额外接线
    Object.assign(config, createRoutingMethods(config, { message, onModeChanged }));
    Object.assign(config, createPersonalConfigMethods(config, { message }));
    Object.assign(config, createLlmCallMethod(config));

    return config;
}
