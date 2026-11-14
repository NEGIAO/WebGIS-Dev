<template>
    <div class="chat-container">
        <div class="chat-header">
            <span class="chat-title">
                <bot-icon
                    :size="18"
                    color="Green"
                    :stroke-width="2"
                />
                {{ t('chat.title') }}
            </span>
            <div class="header-controls">
                <button
                    class="icon-btn"
                    :class="{ active: showUserConfig }"
                    :title="t('chat.myAgentConfig')"
                    @click="toggleUserConfig"
                >
                    <Settings :size="20" />
                </button>
                <button
                    class="icon-btn"
                    :title="t('chat.refreshStatus')"
                    @click="config.reloadAgentConfig(true)"
                >
                    <RefreshCw :size="20" />
                </button>
                <button
                    class="icon-btn"
                    :title="t('chat.exportMarkdown')"
                    @click="exportConversation"
                >
                    <Download :size="20" />
                </button>
                <button
                    class="icon-btn"
                    :title="t('chat.clearHistory')"
                    @click="clearHistory"
                >
                    <Trash2 :size="20" />
                </button>
                <button
                    class="icon-btn"
                    :title="t('chat.exitAI')"
                    @click="emit('close-chat')"
                >
                    <X :size="20" />
                </button>
            </div>
        </div>

        <!-- 可滚动区域：配置面板 + 服务状态 -->
        <div class="scroll-top-section">
            <ChatConfigPanel v-if="showUserConfig" />
            <ChatServiceStatus :config="config" />
        </div>

        <!-- 消息列表（复制/重新生成/回到底部/建议词） -->
        <ChatMessageList
            ref="messageListRef"
            :messages="session.messages.value"
            :is-loading="isLoading"
            @suggest="handleSuggest"
            @regenerate="handleRegenerate"
        />

        <!-- 输入栏（自适应高度 / Enter 发送 / 停止生成） -->
        <ChatInputBar
            v-model="inputMessage"
            :placeholder="inputPlaceholder"
            :disabled="sendDisabled"
            :is-loading="isLoading"
            @send="sendMessage"
            @stop="stopGeneration"
        />
    </div>
</template>


<script lang="ts" src="./ChatPanelContent.ts"></script>

<style scoped>
.chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background-color: #f9fbf9;
}

.chat-header {
    background: white;
    color: var(--text-primary);
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eef2ef;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.chat-title {
    font-weight: bold;
    font-size: 1em;
    color: var(--brand-primary);
}

.header-controls {
    display: flex;
    align-items: center;
    gap: 2px;
}

.header-controls .icon-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
}

.header-controls .icon-btn:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
}

.header-controls .icon-btn.active {
    background: rgba(var(--brand-primary-rgb), 0.12);
    color: var(--brand-primary-dark);
}

/* 移动端：按钮略收至 30、图标 18（单边留白 6px，与桌面一致） */
@media (max-width: 700px) {
    .header-controls {
        gap: 2px;
    }

    .header-controls .icon-btn {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        padding: 0;
    }

    .header-controls .icon-btn :deep(svg) {
        width: 18px;
        height: 18px;
    }
}

/* 配置面板 + 服务状态的可滚动包裹层：封顶防止展开后挤占消息区，
   超出部分在内部滚动 */
.scroll-top-section {
    flex: 0 1 auto;
    min-height: 0;
    max-height: 55%;
    overflow-y: auto;
    overscroll-behavior: contain;
}
</style>

