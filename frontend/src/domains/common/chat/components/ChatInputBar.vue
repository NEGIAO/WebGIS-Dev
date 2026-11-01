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
        <div class="footer-hint">{{ t('chat.enterSend') }}</div>
    </div>
</template>

<script setup>
/**
 * ChatInputBar - 对话输入栏（对标网页版输入区）
 *
 * 网页版形态：
 *   - 一体化输入壳（textarea + 内嵌圆形发送钮），聚焦时品牌色描边
 *   - 输入框随内容自适应高度（1~6 行）
 *   - Enter 发送 / Shift+Enter 换行（输入法组合键期间不触发发送）
 *   - 生成中切换为方块「停止」圆钮，输入壳描边同步转危险色
 *   - 快捷键提示默认淡出、聚焦/悬停淡入（高度常驻，避免输入区跳动）
 */
import { computed, nextTick, ref } from 'vue';
import { SendHorizontal, Square } from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';

const { t } = useLocale();

const props = defineProps({
    /** v-model 输入文本 */
    modelValue: { type: String, default: '' },
    /** 占位提示（跟随服务状态；父组件通常会覆盖） */
    placeholder: { type: String, default: '' },
    /** 是否禁止发送（服务未就绪/额度用尽） */
    disabled: { type: Boolean, default: false },
    /** 是否正在生成（切换停止按钮） */
    isLoading: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'send', 'stop']);

const textareaRef = ref(null);

const text = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});

const sendDisabled = computed(() => props.disabled || !String(props.modelValue || '').trim());

/** 输入框高度自适应（上限约 6 行） */
function autoResize() {
    const el = textareaRef.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
}

/** Enter 发送 / Shift+Enter 换行；输入法组合期间放行 */
function onKeydown(event) {
    if (event.key !== 'Enter') return;
    if (event.shiftKey) return; // Shift+Enter 换行
    if (event.isComposing || event.keyCode === 229) return; // 输入法候选确认
    event.preventDefault();
    submit();
}

function submit() {
    if (sendDisabled.value || props.isLoading) return;
    emit('send');
    nextTick(autoResize);
}
</script>

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
    transition: all 0.18s ease;
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
}
</style>
