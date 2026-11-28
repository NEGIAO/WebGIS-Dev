<template>
    <div class="chat-footer">
        <div
            class="input-shell"
            :class="{ 'is-busy': isLoading }"
        >
            <textarea
                ref="textareaRef"
                v-model="text"
                :placeholder="placeholder"
                rows="1"
                @keydown="onKeydown"
                @input="autoResize"
            ></textarea>
            <!-- V3.7.16：底图切片预设快捷命令（本地解析+执行，零 LLM 调用） -->
            <button
                class="round-btn quick-btn"
                :class="{ 'is-open': quickOpen }"
                :title="t('chat.quickCommandsTitle')"
                :aria-expanded="quickOpen"
                :disabled="isLoading"
                @click="toggleQuick"
            >
                <Layers3 :size="16" />
            </button>
            <button
                v-if="isLoading"
                class="round-btn stop-btn"
                :title="t('chat.stop')"
                @click="emit('stop')"
            >
                <Square
                    :size="13"
                    fill="currentColor"
                />
            </button>
            <button
                v-else
                class="round-btn send-btn"
                :disabled="sendDisabled"
                :title="t('chat.send')"
                @click="submit"
            >
                <SendHorizontal :size="15" />
            </button>
        </div>

        <!-- 预设命令面板：分组列出高德/Google 切片配置 -->
        <Transition name="quick-pop">
            <div
                v-if="quickOpen"
                class="quick-panel"
                @click.stop
            >
                <div class="quick-panel-title">{{ t('chat.quickCommandsTitle') }}</div>
                <div
                    v-for="group in quickGroups"
                    :key="group.id"
                    class="quick-group"
                >
                    <div class="quick-group-title">{{ t(group.labelKey) }}</div>
                    <div class="quick-grid">
                        <button
                            v-for="cmd in group.commands"
                            :key="cmd.id"
                            class="quick-item"
                            :title="cmd.intent"
                            @click="pickQuick(cmd)"
                        >
                            {{ t(cmd.labelKey) }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>

        <div class="footer-hint">{{ t('chat.enterSend') }}</div>
    </div>
</template>

<script lang="ts" src="./ChatInputBar.ts"></script>

<style scoped>
.chat-footer {
    flex: 0 0 auto;
    padding: 8px 14px 6px;
    border-top: 1px solid #eef2ef;
    background: white;
    /* 极轻的向上投影，让输入区与消息区形成层次而不靠重描边 */
    box-shadow: 0 -3px 10px rgba(0, 0, 0, 0.02);
}

/* 一体化输入壳：textarea + 内嵌发送钮 */
.input-shell {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    border: 1px solid #dbe7df;
    border-radius: 16px;
    background: #fbfdfb;
    padding: 4px 4px 4px 12px;

    transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
}

.input-shell:hover {
    border-color: #c6dccd;
}

.input-shell:focus-within {
    border-color: var(--brand-primary);
    background: #fff;
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.1);
}

/* 生成中：描边转危险色，与停止钮呼应 */
.input-shell.is-busy {
    border-color: rgba(var(--danger-rgb), 0.34);
}

.input-shell.is-busy:focus-within {
    box-shadow: 0 0 0 3px rgba(var(--danger-rgb), 0.1);
}

textarea {
    flex: 1;
    border: none;
    outline: none;
    resize: none;
    background: transparent;
    font-family: inherit;
    font-size: 0.95em;
    line-height: 1.55;
    padding: 7px 0;
    min-height: 26px;
    max-height: 132px;
    box-sizing: border-box;
    color: var(--text-primary);
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.14) transparent;
}

textarea::-webkit-scrollbar {
    width: 5px;
}

textarea::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.14);
    border-radius: 3px;
}

textarea::placeholder {
    color: var(--text-muted);
}

/* 圆形发送/停止钮 */
.round-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    transition: background 0.18s ease, border-color 0.18s ease, border-radius 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, filter 0.18s ease, height 0.18s ease, transform 0.18s ease, width 0.18s ease;
}

.send-btn {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), 0.35);
}

.send-btn:hover:not(:disabled) {
    filter: brightness(1.08);
    transform: translateY(-1px);
}

.send-btn:disabled {
    background: #cbdad0;
    color: #fff;
    box-shadow: none;
    cursor: not-allowed;
}

.stop-btn {
    background: var(--danger);
    color: #fff;
    box-shadow: 0 2px 8px rgba(var(--danger-rgb), 0.35);
    animation: stopPulse 1.4s ease-in-out infinite;
}

.stop-btn:hover {
    filter: brightness(0.92);
}

@keyframes stopPulse {
    0%, 100% { box-shadow: 0 2px 8px rgba(var(--danger-rgb), 0.35); }
    50% { box-shadow: 0 2px 12px rgba(var(--danger-rgb), 0.55); }
}

/* V3.7.16：底图切片预设快捷命令 */
.quick-btn {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid transparent;
}

.quick-btn:hover:not(:disabled),
.quick-btn.is-open {
    color: var(--brand-primary);
    background: rgba(var(--brand-primary-rgb), 0.08);
    border-color: rgba(var(--brand-primary-rgb), 0.2);
}

.quick-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.quick-panel {
    position: absolute;
    bottom: calc(100% - 4px);
    left: 14px;
    right: 14px;
    max-height: min(52vh, 420px);
    overflow-y: auto;
    z-index: 20;
    padding: 12px;
    border: 1px solid var(--border-light, #e3ece7);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.12);
}

.quick-panel-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
}

.quick-group + .quick-group {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border-light, #eef2ef);
}

.quick-group-title {
    font-size: 10.5px;
    color: var(--text-muted);
    margin-bottom: 6px;
}

.quick-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: 6px;
}

.quick-item {
    padding: 7px 9px;
    min-height: 32px;
    border: 1px solid var(--border-light, #e3ece7);
    border-radius: 8px;
    background: #fbfdfb;
    color: var(--text-primary);
    font-size: 11.5px;
    text-align: left;
    cursor: pointer;

    transition: background 0.16s, border-color 0.16s;
}

.quick-item:hover {
    background: rgba(var(--brand-primary-rgb), 0.08);
    border-color: rgba(var(--brand-primary-rgb), 0.35);
}

.quick-pop-enter-active,
.quick-pop-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.quick-pop-enter-from,
.quick-pop-leave-to {
    opacity: 0;
    transform: translateY(6px);
}

.chat-footer {
    position: relative;
}

/* 快捷键提示：常驻高度保留（避免出现/消失时输入区跳动），
   默认淡出，聚焦或悬停时淡入 —— 熟悉后不再长期占用视觉注意力 */
.footer-hint {
    margin-top: 4px;
    height: 13px;
    line-height: 13px;
    text-align: center;
    font-size: 10.5px;
    color: var(--text-muted);
    user-select: none;
    opacity: 0;

    transition: opacity 0.18s ease;
}

.chat-footer:hover .footer-hint,
.chat-footer:focus-within .footer-hint {
    opacity: 1;
}

/* 移动端：按钮放宽到 38（触控），输入字号 16 规避 iOS 聚焦自动缩放 */
@media (max-width: 700px) {
    .chat-footer {
        padding: 8px 12px 6px;
    }

    .round-btn {
        width: 38px;
        height: 38px;
    }

    textarea {
        font-size: 16px;
    }

    /* 触屏无 hover，提示常显 */
    .footer-hint {
        opacity: 1;
    }

    .quick-item {
        min-height: 40px;
        font-size: 12px;
    }
}

/* 触屏能力基线：不依赖宽度断点，命中区 ≥40px */
@media (pointer: coarse) {
    .quick-btn,
    .quick-item {
        min-width: 40px;
        min-height: 40px;
    }
}
</style>
