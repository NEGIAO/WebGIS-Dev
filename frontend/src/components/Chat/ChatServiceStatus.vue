<template>
    <div class="service-status">
        <div class="status-line">
            <span class="status-label">路由模式:</span>
            <button
                :class="['mode-toggle-btn', config.isDefaultAIMode ? 'mode-default-ai' : config.isDirectMode ? 'mode-direct' : 'mode-proxy']"
                title="点击切换路由模式"
                @click="config.toggleRoutingMode()"
            >
                {{ config.isDefaultAIMode ? '🤖 默认 AI 模式' : config.isDirectMode ? '🔑 个人 Key 模式' : '🛡️ 后端代理' }}
                <span class="mode-toggle-hint">（点击切换）</span>
            </button>
        </div>
        <div class="status-line">
            <span class="status-label">服务状态:</span>
            <span :class="['status-value', config.serviceReady ? 'status-ready' : 'status-unready']">
                {{ config.serviceReady ? (config.isDefaultAIMode ? '默认 AI 已就绪（管理员配置）' : config.isDirectMode ? '个人 API 已配置（经后端代理）' : '已连接后端 Agent') : '未就绪（请配置 API Key 或联系管理员）' }}
            </span>
        </div>
        <div class="status-line">
            <span class="status-label">当前模型:</span>
            <span class="status-value">{{ config.modelName || '未配置' }}
                <span v-if="config.isDefaultAIMode" class="model-source-tag default-ai">管理员配置</span>
                <span v-else-if="config.directConfig.model && config.isDirectMode" class="model-source-tag">个人Key</span>
                <span v-else-if="config.modelName" class="model-source-tag proxy">代理</span>
            </span>
        </div>
        <div
            v-if="!config.isDirectMode"
            class="status-line"
        >
            <span class="status-label">今日对话额度:</span>
            <span class="status-value">{{ config.quotaText }}</span>
        </div>
        <div
            v-if="config.isDefaultAIMode"
            class="status-line"
        >
            <span class="status-label">额度:</span>
            <span class="status-value status-default-ai">管理员配额（经后端代理）</span>
        </div>
        <div
            v-else-if="config.isDirectMode"
            class="status-line"
        >
            <span class="status-label">额度:</span>
            <span class="status-value status-direct">无限制（使用个人 Key）</span>
        </div>
        <small class="hint">{{ config.statusHint }}</small>
    </div>
</template>

<script setup>
/**
 * ChatServiceStatus - 路由模式/服务状态/额度展示条（从 ChatPanelContent 拆出）
 * 纯展示 + 模式切换入口，状态全部来自 useChatAgentConfig 的 reactive 对象。
 */
defineProps({
    /** createChatAgentConfig 返回的 reactive 配置对象 */
    config: { type: Object, required: true },
});
</script>

<style scoped>
.service-status {
    border-bottom: 1px solid #eef2ef;
    background: #ffffff;
    padding: 10px 16px;
    flex: 0 0 auto;
}

.status-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85em;
    margin-bottom: 4px;
}

.status-line:last-of-type {
    margin-bottom: 0;
}

.status-label {
    color: #5f6d66;
}

.status-value {
    color: #2a3a32;
    font-weight: 600;
}

.status-ready {
    color: var(--brand-primary-dark);
}

.status-unready {
    color: #c62828;
}

.status-direct {
    color: #1565c0;
}

.status-proxy {
    color: #6a1b9a;
}

.status-default-ai {
    color: var(--brand-primary-dark);
}

.mode-toggle-btn {
    background: none;
    border: 1px solid #d7e5dc;
    border-radius: 12px;
    padding: 2px 10px;
    font-size: 0.85em;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.mode-toggle-btn.mode-direct {
    color: #1565c0;
    border-color: #90caf9;
    background: #e3f2fd;
}

.mode-toggle-btn.mode-direct:hover {
    background: #bbdefb;
    border-color: var(--info);
}

.mode-toggle-btn.mode-proxy {
    color: #6a1b9a;
    border-color: #ce93d8;
    background: #f3e5f5;
}

.mode-toggle-btn.mode-proxy:hover {
    background: #e1bee7;
    border-color: #ab47bc;
}

.mode-toggle-btn.mode-default-ai {
    color: var(--brand-primary-dark);
    border-color: var(--brand-primary-light);
    background: var(--bg-brand-light);
}

.mode-toggle-btn.mode-default-ai:hover {
    background: var(--bg-brand-lighter);
    border-color: #43a047;
}

.mode-toggle-hint {
    font-size: 0.85em;
    font-weight: 400;
    opacity: 0.7;
}

.model-source-tag {
    font-size: 0.7em;
    font-weight: 400;
    color: #1565c0;
    background: #e3f2fd;
    border-radius: 4px;
    padding: 1px 5px;
    margin-left: 4px;
}

.model-source-tag.proxy {
    color: #6a1b9a;
    background: #f3e5f5;
}

.model-source-tag.default-ai {
    color: var(--brand-primary-dark);
    background: var(--bg-brand-light);
}

.hint {
    color: var(--text-secondary);
    font-size: 0.85em;
    margin-top: 4px;
    display: block;
}
</style>
