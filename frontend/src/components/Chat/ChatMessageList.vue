<template>
    <div class="chat-body-wrap">
        <div
            ref="chatBody"
            class="chat-body"
            @scroll.passive="onScroll"
        >
            <template
                v-for="(msg, index) in messages"
                :key="index"
            >
                <template v-if="!heroMode">
                <!-- 日期分隔线（跨天时显示） -->
                <div
                    v-if="needDayDivider(index)"
                    class="day-divider"
                >
                    <span>{{ dayLabel(msg.time) }}</span>
                </div>

                <!-- ── 工具调用状态卡（助手侧布局） ── -->
                <div
                    v-if="msg.isToolStatus && msg.toolCalls"
                    class="msg-row assistant-row msg-enter"
                >
                    <div class="avatar bot-avatar">
                        <Wrench :size="15" />
                    </div>
                    <div class="msg-col">
                        <div class="tool-status-card">
                            <div
                                v-for="(tc, tcIdx) in msg.toolCalls"
                                :key="tcIdx"
                                class="tool-status-item"
                            >
                                <Loader2
                                    v-if="tc.status === 'executing'"
                                    :size="14"
                                    class="tool-icon spin"
                                />
                                <CircleCheck
                                    v-else-if="tc.status === 'success'"
                                    :size="14"
                                    class="tool-icon ok"
                                />
                                <CircleX
                                    v-else
                                    :size="14"
                                    class="tool-icon err"
                                />
                                <span class="tool-status-label">{{ tc.label }}</span>
                                <span
                                    v-if="tc.message"
                                    class="tool-status-message"
                                >{{ tc.message }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ── 助手消息：头像 + 文档式卡片 ── -->
                <div
                    v-else-if="msg.role === 'assistant'"
                    class="msg-row assistant-row msg-enter"
                >
                    <div class="avatar bot-avatar">
                        <Bot :size="16" />
                    </div>
                    <div class="msg-col">
                        <div class="sender-row">
                            <span class="sender-name">AI 助手</span>
                            <span
                                v-if="msg.time"
                                class="sender-time"
                            >{{ formatTime(msg.time) }}</span>
                        </div>

                        <!-- 思考过程（折叠药丸，位于回答上方，贴近网页版思维链呈现） -->
                        <details
                            v-if="hasThinkContent(msg.content)"
                            class="think-panel"
                        >
                            <summary>
                                <Brain
                                    :size="13"
                                    class="think-icon"
                                />
                                <span>思考过程</span>
                                <ChevronDown
                                    :size="13"
                                    class="think-chevron"
                                />
                            </summary>
                            <!-- eslint-disable-next-line vue/no-v-html -->
                            <div class="think-content markdown-body" v-html="renderThink(msg.content)"></div>
                        </details>

                        <!-- eslint-disable vue/no-v-html -->
                        <div
                            class="bubble assistant-bubble markdown-body"
                            :class="{ 'error-bubble': msg.isError }"
                            v-html="renderAnswer(msg.content)"
                        ></div>
                        <!-- eslint-enable vue/no-v-html -->

                        <div class="action-row">
                            <button
                                class="action-btn"
                                :title="copiedIndex === index ? '已复制' : '复制回复'"
                                @click="copyMessage(msg, index)"
                            >
                                <Check
                                    v-if="copiedIndex === index"
                                    :size="14"
                                    class="ok"
                                />
                                <Copy
                                    v-else
                                    :size="14"
                                />
                            </button>
                            <button
                                v-if="canRegenerate(index)"
                                class="action-btn"
                                title="重新生成"
                                @click="emit('regenerate')"
                            >
                                <RefreshCw :size="14" />
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ── 用户消息：右对齐渐变气泡 ── -->
                <div
                    v-else
                    class="msg-row user-row msg-enter"
                >
                    <div class="msg-col user-col">
                        <div class="bubble user-bubble">{{ msg.content }}</div>
                        <div class="action-row user-actions">
                            <button
                                class="action-btn"
                                :title="copiedIndex === index ? '已复制' : '复制'"
                                @click="copyMessage(msg, index)"
                            >
                                <Check
                                    v-if="copiedIndex === index"
                                    :size="13"
                                    class="ok"
                                />
                                <Copy
                                    v-else
                                    :size="13"
                                />
                            </button>
                            <span
                                v-if="msg.time"
                                class="sender-time"
                            >{{ formatTime(msg.time) }}</span>
                        </div>
                    </div>
                </div>
                </template>
            </template>

            <!-- 生成中：头像 + 跳动指示 -->
            <div
                v-if="isLoading"
                class="msg-row assistant-row msg-enter"
            >
                <div class="avatar bot-avatar breathing">
                    <Bot :size="16" />
                </div>
                <div class="msg-col">
                    <div class="bubble assistant-bubble typing-bubble">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                    </div>
                </div>
            </div>

            <!-- 空状态 Hero（网页版首屏形态：大头像 + 标题 + 建议词） -->
            <div
                v-if="heroMode"
                class="empty-hero"
            >
                <div class="hero-avatar">
                    <Bot :size="26" />
                </div>
                <div class="hero-title">AI 空间助手</div>
                <div class="hero-subtitle">{{ heroSubtitle }}</div>
                <div class="hero-hint">
                    <Sparkles :size="12" />
                    试试这些指令
                </div>
                <div class="hero-chips">
                    <button
                        v-for="s in suggestions"
                        :key="s"
                        class="suggestion-chip"
                        @click="emit('suggest', s)"
                    >
                        {{ s }}
                    </button>
                </div>
            </div>
        </div>

        <!-- 回到底部悬浮按钮（带未读徽标） -->
        <Transition name="fab">
            <button
                v-if="showScrollFab"
                class="scroll-fab"
                title="回到底部"
                @click="scrollToBottom(true)"
            >
                <ChevronDown :size="16" />
                <span
                    v-if="unseenCount"
                    class="fab-badge"
                >{{ unseenCount > 9 ? '9+' : unseenCount }}</span>
            </button>
        </Transition>
    </div>
</template>

<script setup>
/**
 * ChatMessageList - 对话消息列表（对标网页版对话气泡设计）
 *
 * 视觉结构（参考 ChatGPT/Claude/DeepSeek 网页版）：
 *   - 助手：品牌渐变圆头像 + 发送者行（名称·时间）+ 文档式白卡 + 图标操作条
 *   - 用户：右对齐品牌渐变气泡（无头像，窄面板下更紧凑），hover 显示复制与时间
 *   - 思考过程：折叠药丸置于回答上方（贴近思维链产品形态），chevron 随展开旋转
 *   - 工具调用：执行中旋转 loader / 成功绿勾 / 失败红叉
 *   - 跨天日期分隔线（历史持久化后跨天可读）、消息入场动画、智能粘底 + 回底悬浮钮
 * 代码块复制按钮与语言徽章由 useMarkdownRenderer 注入。
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
    Bot,
    Brain,
    Check,
    ChevronDown,
    CircleCheck,
    CircleX,
    Copy,
    Loader2,
    RefreshCw,
    Sparkles,
    Wrench,
} from 'lucide-vue-next';
import 'highlight.js/styles/github-dark-dimmed.css';
import { useMarkdownRenderer } from '../../composables/useMarkdownRenderer';

const props = defineProps({
    /** 会话消息列表（含时间戳/工具状态卡） */
    messages: { type: Array, required: true },
    /** 是否正在等待 LLM 回复 */
    isLoading: { type: Boolean, default: false },
});

const emit = defineEmits(['suggest', 'regenerate']);

const { renderAnswerHtml, renderThinkHtml, hasThinkContent, ready } = useMarkdownRenderer();

const chatBody = ref(null);
const showScrollFab = ref(false);
const copiedIndex = ref(-1);
const unseenCount = ref(0);
let copiedTimer = null;

/** 空状态 GIS 快捷建议词 */
const suggestions = [
    '定位到郑州大学',
    '切换到谷歌卫星底图',
    '搜索北京故宫',
    '把底图换成 Carto 暗色风格',
];

/** Hero 首屏：仅剩欢迎语且未在生成（隐藏欢迎气泡，展示大头像 + 建议词） */
const heroMode = computed(() => props.messages.length <= 1 && !props.isLoading);

/** Hero 副标题：取欢迎语正文 */
const heroSubtitle = computed(() => {
    const text = String(props.messages[0]?.content || '').trim();
    return text || '你可以让我定位地点、切换底图、检索兴趣点，或直接提问。';
});

/**
 * Markdown 渲染缓存：打字机高频更新单条消息时，
 * 其余消息命中缓存避免整列表重复 marked.parse（libs 就绪状态纳入 key，防冻结降级 HTML）
 */
const htmlCache = new Map();
function cachedRender(prefix, content, renderFn) {
    const key = `${ready.value ? 1 : 0}|${prefix}|${content}`;
    const hit = htmlCache.get(key);
    if (hit !== undefined) return hit;
    const html = renderFn(content);
    if (htmlCache.size > 400) htmlCache.clear();
    htmlCache.set(key, html);
    return html;
}
const renderAnswer = (content) => cachedRender('a', String(content || ''), renderAnswerHtml);
const renderThink = (content) => cachedRender('t', String(content || ''), renderThinkHtml);

/** 距底部小于该阈值视为"贴底"，自动跟随滚动 */
const NEAR_BOTTOM_PX = 80;

function isNearBottom() {
    const el = chatBody.value;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
}

/**
 * 滚动到底部
 * @param {boolean} force - true 时无条件滚动；false 时仅在贴底状态跟随
 */
function scrollToBottom(force = false) {
    nextTick(() => {
        const el = chatBody.value;
        if (!el) return;
        if (force || isNearBottom()) {
            el.scrollTop = el.scrollHeight;
            unseenCount.value = 0;
        }
    });
}

function onScroll() {
    const near = isNearBottom();
    showScrollFab.value = !near;
    if (near) unseenCount.value = 0;
}

// 消息变化时智能粘底（用户上翻阅读历史时不打断）；上翻期间累计未读徽标
watch(
    () => props.messages.length,
    (next, prev) => {
        if (typeof prev === 'number' && next > prev && !isNearBottom()) {
            unseenCount.value += next - prev;
        }
        scrollToBottom(false);
    },
);

watch(
    () => props.isLoading,
    () => scrollToBottom(false),
);

/** 时间戳格式化为 HH:MM */
function formatTime(ts) {
    const d = new Date(Number(ts) || 0);
    if (Number.isNaN(d.getTime()) || !ts) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

/** 跨天时在消息前插入日期分隔线 */
function needDayDivider(index) {
    const cur = props.messages[index]?.time;
    if (!cur) return false;
    if (index === 0) return true;
    const prev = props.messages[index - 1]?.time;
    if (!prev) return false;
    return new Date(cur).toDateString() !== new Date(prev).toDateString();
}

/** 日期分隔线文案：今天/昨天/M月D日 */
function dayLabel(ts) {
    const d = new Date(Number(ts) || 0);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    if (d.toDateString() === today.toDateString()) return '今天';
    if (d.toDateString() === yesterday.toDateString()) return '昨天';
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 最后一条 assistant 消息（非欢迎语）可重新生成 */
function canRegenerate(index) {
    if (props.isLoading || index === 0) return false;
    if (index !== props.messages.length - 1) return false;
    return props.messages.some((m) => m.role === 'user');
}

/** 复制消息内容（assistant 回复剔除 think 块） */
async function copyMessage(msg, index) {
    const raw = String(msg?.content || '');
    const text = msg?.role === 'assistant'
        ? raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || raw
        : raw;
    try {
        await navigator.clipboard.writeText(text);
        copiedIndex.value = index;
        if (copiedTimer) clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => {
            copiedIndex.value = -1;
            copiedTimer = null;
        }, 1500);
    } catch {
        /* clipboard 不可用时静默忽略 */
    }
}

defineExpose({ scrollToBottom });
</script>

<style scoped>
.chat-body-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

/* ========== 滚动区域 ========== */
.chat-body {
    flex: 1;
    padding: 18px 14px 14px;
    overflow-y: auto;
    background: #f4f7f5;
    scroll-behavior: smooth;
}

.chat-body::-webkit-scrollbar {
    width: 6px;
}
.chat-body::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
}
.chat-body::-webkit-scrollbar-track {
    background-color: transparent;
}

/* ========== 日期分隔线 ========== */
.day-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 14px 0 12px;
    user-select: none;
}

.day-divider::before,
.day-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(0, 0, 0, 0.06);
}

.day-divider span {
    font-size: 11px;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.8);
    border-radius: 999px;
    padding: 2px 10px;
}

/* ========== 消息行骨架 ========== */
.msg-row {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    align-items: flex-start;
}

.assistant-row {
    justify-content: flex-start;
}

.user-row {
    justify-content: flex-end;
}

.msg-col {
    display: flex;
    flex-direction: column;
    max-width: calc(100% - 40px);
    min-width: 0;
    flex: 1;
}

.user-col {
    flex: 0 1 auto;
    max-width: 85%;
    align-items: flex-end;
}

/* 入场动画 */
.msg-enter {
    animation: msgIn 0.22s ease-out;
}

@keyframes msgIn {
    from {
        opacity: 0;
        transform: translateY(6px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* ========== 头像 ========== */
.avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;
}

.bot-avatar {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    box-shadow: 0 2px 6px rgba(var(--brand-primary-rgb), 0.35);
}

.bot-avatar.breathing {
    animation: breathe 1.6s ease-in-out infinite;
}

@keyframes breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
}

/* ========== 发送者行 ========== */
.sender-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 4px;
    padding-left: 2px;
}

.sender-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-brand);
}

.sender-time {
    font-size: 11px;
    color: var(--text-muted);
    user-select: none;
}

/* ========== 气泡 ========== */
.bubble {
    font-size: 0.93em;
    line-height: 1.65;
    word-wrap: break-word;
    box-sizing: border-box;
}

/* 助手：文档式白卡（近网页版全宽正文观感） */
.assistant-bubble {
    background: #ffffff;
    color: #2c3e50;
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 4px 14px 14px 14px;
    padding: 11px 14px;
    box-shadow: 0 1px 3px rgba(34, 50, 38, 0.05);
    width: 100%;
}

/* 错误回复：红色左边条 + 浅红底 */
.assistant-bubble.error-bubble {
    background: rgba(var(--danger-rgb), 0.05);
    border-color: rgba(var(--danger-rgb), 0.25);
    border-left: 3px solid var(--danger);
}

/* 用户：品牌渐变胶囊气泡 */
.user-bubble {
    background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    color: #fff;
    border-radius: 16px 16px 4px 16px;
    padding: 10px 14px;
    box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), 0.28);
    white-space: pre-wrap;
    max-width: 100%;
}

/* ========== 操作条（图标按钮，hover 浮现） ========== */
.action-row {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 4px;
    padding-left: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
}

.user-actions {
    justify-content: flex-end;
    padding-right: 2px;
    gap: 6px;
}

.msg-row:hover .action-row {
    opacity: 1;
}

.action-btn {
    border: none;
    background: none;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
}

.action-btn:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
}

.action-btn .ok {
    color: var(--brand-primary);
}

/* ========== 工具调用状态卡 ========== */
.tool-status-card {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 10px 13px;
    border-radius: 4px 12px 12px 12px;
    background: #ffffff;
    border: 1px solid rgba(24, 144, 255, 0.18);
    border-left: 3px solid var(--info);
    font-size: 0.86em;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.tool-status-item {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
}

.tool-icon {
    flex-shrink: 0;
}

.tool-icon.spin {
    color: var(--info);
    animation: spin 0.9s linear infinite;
}

.tool-icon.ok {
    color: var(--brand-primary);
}

.tool-icon.err {
    color: var(--danger);
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.tool-status-label {
    color: #1e3a5f;
    font-weight: 500;
}

.tool-status-message {
    color: #5c6b73;
    font-size: 0.92em;
    word-break: break-all;
}

/* ========== 生成中指示 ========== */
.typing-bubble {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: auto;
    padding: 13px 16px;
}

.typing-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--brand-primary);
    opacity: 0.35;
    animation: typingBounce 1.2s infinite ease-in-out;
}

.typing-dot:nth-child(2) {
    animation-delay: 0.15s;
}

.typing-dot:nth-child(3) {
    animation-delay: 0.3s;
}

@keyframes typingBounce {
    0%, 60%, 100% {
        transform: translateY(0);
        opacity: 0.35;
    }
    30% {
        transform: translateY(-4px);
        opacity: 1;
    }
}

/* ========== 空状态 Hero ========== */
.empty-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 44px 18px 20px;
    animation: msgIn 0.3s ease-out;
}

.hero-avatar {
    width: 56px;
    height: 56px;
    border-radius: 18px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(var(--brand-primary-rgb), 0.35);
    margin-bottom: 14px;
}

.hero-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 6px;
}

.hero-subtitle {
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--text-secondary);
    max-width: 300px;
    margin-bottom: 18px;
}

.hero-hint {
    font-size: 11.5px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
}

.hero-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    max-width: 320px;
}

.suggestion-chip {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.35);
    background: rgba(255, 255, 255, 0.85);
    color: var(--brand-primary-dark);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
}

.suggestion-chip:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
    border-color: var(--brand-primary);
    transform: translateY(-1px);
}

/* ========== 回到底部悬浮按钮 ========== */
.scroll-fab {
    position: absolute;
    right: 14px;
    bottom: 12px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--border-light);
    background: rgba(255, 255, 255, 0.96);
    color: var(--text-secondary);
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.scroll-fab:hover {
    color: var(--brand-primary-dark);
    border-color: var(--brand-primary);
    transform: translateY(-1px);
}

/* 未读新消息徽标 */
.fab-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    box-sizing: border-box;
    box-shadow: 0 2px 6px rgba(var(--danger-rgb), 0.4);
}

.fab-enter-active,
.fab-leave-active {
    transition: opacity 0.15s, transform 0.15s;
}

.fab-enter-from,
.fab-leave-to {
    opacity: 0;
    transform: translateY(6px);
}

/* ========== 思考过程（折叠药丸） ========== */
.think-panel {
    margin-bottom: 6px;
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 10px;
    background: #fbfcfb;
    font-size: 0.86em;
    overflow: hidden;
}

.think-panel summary {
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    user-select: none;
    font-weight: 500;
    color: var(--text-secondary);
    padding: 6px 12px;
    transition: color 0.2s;
    width: 100%;
    box-sizing: border-box;
}

.think-panel summary::-webkit-details-marker {
    display: none;
}

.think-panel summary:hover {
    color: var(--brand-primary-dark);
}

.think-icon {
    color: var(--brand-accent-muted);
}

.think-chevron {
    margin-left: auto;
    transition: transform 0.2s ease;
}

.think-panel[open] .think-chevron {
    transform: rotate(180deg);
}

.think-content {
    margin: 0 8px 8px;
    padding: 10px 12px;
    background: #f4f7f4;
    border-radius: 8px;
    max-height: 360px;
    overflow-y: auto;
    line-height: 1.6;
    font-size: 0.95em;
    color: #4a5d51;
}

.think-content p { margin: 0 0 8px 0; }
.think-content p:last-child { margin-bottom: 0; }
.think-content code:not(pre code) {
    background: #e8efea;
    color: #5a6e62;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.88em;
}
.think-content pre {
    background: #2d3740;
    color: #e6edf3;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 0.85em;
    margin: 6px 0;
}

/* ============================================================
    Markdown 元素精细排版
============================================================ */
.markdown-body {
    white-space: normal !important;
}

.markdown-body :where(h1, h2, h3, h4, h5, h6) {
    margin-top: 14px;
    margin-bottom: 8px;
    color: #1a2a20;
    font-weight: 600;
    line-height: 1.4;
}
.markdown-body h1 { font-size: 1.4em; border-bottom: 1px solid #eef2ef; padding-bottom: 4px; }
.markdown-body h2 { font-size: 1.25em; border-bottom: 1px solid #eef2ef; padding-bottom: 3px; }
.markdown-body h3 { font-size: 1.15em; }
.markdown-body h4 { font-size: 1em; }

.markdown-body p {
    margin: 0 0 10px 0;
    color: #2c3e50;
}
.markdown-body p:last-child {
    margin-bottom: 0;
}

.markdown-body a {
    color: var(--brand-primary);
    text-decoration: none;
    font-weight: 500;
    border-bottom: 1px dashed var(--brand-primary);
    transition: color 0.2s;
}
.markdown-body a:hover {
    color: var(--brand-primary-dark);
}

.markdown-body ul,
.markdown-body ol {
    margin: 0 0 10px 0;
    padding-left: 1.5em;
}
.markdown-body li {
    margin-bottom: 4px;
}
.markdown-body li:last-child {
    margin-bottom: 0;
}

.markdown-body code:not(pre code) {
    background: #f0f4f1;
    color: #c0392b;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    font-weight: 500;
}

.markdown-body pre {
    background: #22272e;
    color: #adbac7;
    padding: 14px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.88em;
    line-height: 1.6;
    margin: 12px 0;
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.25);
    position: relative;
    border: 1px solid #373e47;
}
.markdown-body pre code.hljs {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
}

.markdown-body pre .code-lang-badge {
    position: absolute;
    top: 0;
    left: 0;
    background: #373e47;
    color: #768390;
    padding: 2px 10px;
    font-size: 0.72em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: 0.04em;
    text-transform: lowercase;
    border-radius: 8px 0 6px 0;
    border-bottom: 1px solid #444c56;
    border-right: 1px solid #444c56;
    user-select: none;
    line-height: 1.6;
}

.markdown-body pre[data-lang] {
    padding-top: 30px;
}

.markdown-body pre .code-copy-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: #768390;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 0.76em;
    cursor: pointer;
    transition: all 0.2s;
    opacity: 0;
    z-index: 1;
}

.markdown-body pre:hover .code-copy-btn {
    opacity: 1;
}

.markdown-body pre .code-copy-btn:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #cdd9e5;
}

.markdown-body pre .code-copy-btn.copied {
    background: #347d39;
    border-color: #347d39;
    color: #cdd9e5;
    opacity: 1;
}

/* highlight.js github-dark-dimmed 主题 token 颜色覆盖 */
.markdown-body pre .hljs-comment,
.markdown-body pre .hljs-quote { color: #768390; font-style: italic; }
.markdown-body pre .hljs-keyword,
.markdown-body pre .hljs-selector-tag { color: #f47067; }
.markdown-body pre .hljs-string,
.markdown-body pre .hljs-addition { color: #6cb6ff; }
.markdown-body pre .hljs-number,
.markdown-body pre .hljs-literal { color: #6cb6ff; }
.markdown-body pre .hljs-built_in,
.markdown-body pre .hljs-type { color: #f69d50; }
.markdown-body pre .hljs-function,
.markdown-body pre .hljs-title { color: #dcbdfb; }
.markdown-body pre .hljs-attr,
.markdown-body pre .hljs-attribute { color: #6cb6ff; }
.markdown-body pre .hljs-variable,
.markdown-body pre .hljs-template-variable { color: #f69d50; }
.markdown-body pre .hljs-regexp,
.markdown-body pre .hljs-link { color: #96d0ff; }
.markdown-body pre .hljs-symbol,
.markdown-body pre .hljs-bullet { color: #f69d50; }
.markdown-body pre .hljs-meta { color: #6cb6ff; }
.markdown-body pre .hljs-deletion { color: #f47067; }
.markdown-body pre .hljs-selector-class { color: #6cb6ff; }
.markdown-body pre .hljs-selector-id { color: #dcbdfb; }
.markdown-body pre .hljs-tag { color: #8ddb8c; }
.markdown-body pre .hljs-name { color: #8ddb8c; }
.markdown-body pre .hljs-params { color: #adbac7; }

/* GFM 任务列表 */
.markdown-body ul.contains-task-list {
    list-style: none;
    padding-left: 0.5em;
}
.markdown-body li.task-list-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}
.markdown-body li.task-list-item input[type="checkbox"] {
    margin-top: 5px;
    accent-color: var(--brand-primary, #2d5016);
    width: 15px;
    height: 15px;
    flex-shrink: 0;
}

.markdown-body hr {
    border: none;
    height: 1px;
    background: linear-gradient(to right, transparent, #d7e5dc, transparent);
    margin: 16px 0;
}

.markdown-body blockquote {
    border-left: 4px solid var(--brand-primary);
    margin: 12px 0;
    padding: 8px 14px;
    background: #f4f9f5;
    color: #4f6f5c;
    border-radius: 0 6px 6px 0;
}
.markdown-body blockquote p {
    color: #4f6f5c;
    margin: 0;
}

.markdown-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 0.92em;
    overflow-x: auto;
    display: block;
}

.markdown-body th,
.markdown-body td {
    border: 1px solid #e1e8e3;
    padding: 8px 12px;
    text-align: left;
    line-height: 1.4;
}

.markdown-body thead th {
    background-color: #f5f8f6;
    color: #1a2a20;
    font-weight: 600;
}

.markdown-body tbody tr:nth-child(even) {
    background-color: #fbfdfb;
}

.markdown-body tbody tr:hover {
    background-color: #f2f7f3;
}

.markdown-body img {
    max-width: 100%;
    border-radius: 8px;
    margin: 8px 0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
</style>
