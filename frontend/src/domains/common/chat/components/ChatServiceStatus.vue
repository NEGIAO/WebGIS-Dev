<template>
    <div :class="['service-status', { 'is-exhausted': config.quotaExhausted }]">
        <!-- 状态条：固定两行分组（第一行 就绪/模式/模型，第二行 消耗/额度），
             不依赖 flex-wrap 的偶然换行位置 -->
        <div class="status-strip">
            <div class="status-row">
                <!-- 就绪指示：色点 + 短标签；完整文案（含未就绪原因）挂在 title 上 -->
                <span
                    :class="['status-pill', 'ready-pill', config.serviceReady ? 'is-ready' : 'is-unready']"
                    :title="readyFullText"
                >
                    <span
                        class="dot"
                        aria-hidden="true"
                    />
                    <span class="pill-text">{{ config.serviceReady ? t('chat.readyShort') : t('chat.notReadyShort') }}</span>
                </span>

                <!-- 路由模式：点击切换（toggleRoutingMode 行为不变），尾部交换图标提示可切换 -->
                <button
                    :class="['status-pill', 'mode-pill', modeTone]"
                    :title="t('chat.clickToSwitchMode')"
                    @click="config.toggleRoutingMode()"
                >
                    <span class="pill-text">{{ modeLabel }}</span>
                    <ArrowLeftRight
                        :size="10"
                        class="pill-icon swap-icon"
                    />
                </button>

                <!-- 当前模型 + 来源标记 -->
                <span
                    class="status-pill model-pill"
                    :title="modelTitle"
                >
                    <Cpu
                        :size="11"
                        class="pill-icon"
                    />
                    <span class="pill-text">{{ modelText }}</span>
                    <span
                        v-if="sourceLabel"
                        :class="['src-tag', modeTone]"
                    >{{ sourceLabel }}</span>
                </span>
            </div>

            <div class="status-row">
                <!-- 本次消耗：仅后端代理计费模式出现 -->
                <span
                    v-if="isProxyMode"
                    class="status-pill cost-pill"
                    :title="t('chat.lastCostLabel')"
                >
                    <Coins
                        :size="11"
                        class="pill-icon"
                    />
                    <span class="pill-text">{{ costText }}</span>
                </span>

                <!-- 额度：默认 AI=免费 / 个人 Key=无限制 / 代理=今日已用/上限 -->
                <span
                    :class="['status-pill', 'quota-pill', modeTone, { 'is-exhausted': config.quotaExhausted }]"
                    :title="t('chat.todayQuota')"
                >
                    <Gauge
                        :size="11"
                        class="pill-icon"
                    />
                    <span class="pill-text">{{ quotaLabel }}</span>
                </span>
            </div>
        </div>

        <!-- 说明文案：默认最多两行，额度耗尽时解除折叠并高亮 -->
        <p :class="['status-note', { 'is-exhausted': config.quotaExhausted }]">
            {{ config.statusHint }}
        </p>
    </div>
</template>

<script setup>
/**
 * ChatServiceStatus - 路由模式/服务状态/额度状态条（从 ChatPanelContent 拆出）
 *
 * 纯展示 + 模式切换入口，状态全部来自 useChatAgentConfig 的 reactive 对象。
 *
 * 布局（V3.6.42 重排）：
 *   原先是 3~5 行「标签: 值」纵向堆叠 + 一行说明，侧栏 300px 下说明文案常占 3~4 行，
 *   且每行的标签用户看一次就记住了，属于长期占位的无效信息。
 *   现改为**固定两行** pill 组：
 *     第一行：就绪点 · 路由模式(可点) · 模型(+来源)
 *     第二行：本次消耗(仅代理模式) · 今日额度
 *   两行用 nowrap + 收缩实现，不依赖 flex-wrap 的偶然换行位置——否则 360px 与 300px
 *   会得到不同的分组（代理模式 5 个 pill 必须稳定为 3+2）。
 *   说明文案压到 2 行并附原生 title 全文，额度耗尽时自动展开。
 *   信息项与旧版一一对应，未增删任何状态位；点击行为仍只有 toggleRoutingMode。
 */
import { computed, watch } from 'vue';
import { ArrowLeftRight, Coins, Cpu, Gauge } from '@lucide/vue';

import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';

const props = defineProps({
    /** createChatAgentConfig 返回的 reactive 配置对象 */
    config: { type: Object, required: true },
});

const message = useMessage();
const { t } = useLocale();

/** 后端代理计费模式（既非默认 AI，也非个人 Key）：仅此模式展示「本次消耗」 */
const isProxyMode = computed(() => !props.config.isDefaultAIMode && !props.config.isPersonalMode);

/** 色调类：只负责 color，容器底色由 .mode-pill.tone-* 单独叠加 */
const modeTone = computed(() => {
    if (props.config.isDefaultAIMode) return 'tone-default-ai';
    return props.config.isPersonalMode ? 'tone-direct' : 'tone-proxy';
});

const modeLabel = computed(() => {
    if (props.config.isDefaultAIMode) return t('chat.defaultAIMode');
    return props.config.isPersonalMode ? t('chat.personalKeyMode') : t('chat.backendProxy');
});

const modelText = computed(() => props.config.modelName || t('chat.notConfigured'));

/** 模型来源标记（与旧版三个分支一致） */
const sourceLabel = computed(() => {
    if (props.config.isDefaultAIMode) return t('chat.adminConfigured');
    if (props.config.directConfig.model && props.config.isPersonalMode) return t('chat.personalKey');
    if (props.config.modelName) return t('chat.proxy');
    return '';
});

const modelTitle = computed(() => {
    const base = `${t('chat.currentModel')} ${modelText.value}`;
    return sourceLabel.value ? `${base} · ${sourceLabel.value}` : base;
});

/** 就绪状态的完整文案（旧版整行文本，现降级为色点的 title） */
const readyFullText = computed(() => {
    if (!props.config.serviceReady) return t('chat.serviceNotReady');
    if (props.config.isDefaultAIMode) return t('chat.defaultAIReady');
    if (props.config.isPersonalMode) return t('chat.personalAPIReady');
    return t('chat.serviceReady');
});

/** 额度文案：三种模式分支与旧版一一对应（不能直接用 config.quotaText，个人 Key 会被算成平台配额） */
const quotaLabel = computed(() => {
    if (props.config.isDefaultAIMode) return t('chat.freeQuota');
    if (props.config.isPersonalMode) return t('chat.unlimitedQuota');
    return props.config.quotaText;
});

const costText = computed(() => (
    props.config.lastCallCost > 0 ? `-${props.config.lastCallCost}` : t('chat.noCostYet')
));

// 额度耗尽瞬间弹一次 toast 提醒（仅 false→true 跳变触发，避免反复弹窗）
watch(
    () => props.config.quotaExhausted,
    (exhausted) => {
        if (exhausted) message.warning(t('chat.quotaExhaustedHint'));
    },
);
</script>

<style scoped>
.service-status {
    border-bottom: 1px solid #eef2ef;
    background: #ffffff;
    padding: 8px 12px 7px;
    flex: 0 0 auto;
}

/* ========== 状态条：固定两行分组 ========== */
/* 第一行恒放 就绪/模式/模型，第二行恒放 消耗/额度——分组由 DOM 结构决定，
   而不是靠 flex-wrap 的偶然换行位置（否则 360px 与 300px 会切出不同分组）。
   行内仍允许 wrap：360px 下三个 pill 恰好一行（3+2）；300px 装不下时模型 pill
   整颗下移，而不是把每个 pill 都压成「已就…」「deepsee…」。 */
.status-strip {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.status-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    min-width: 0;
}

.status-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    /* 不收缩：宁可整颗换行，也不要把短标签挤成省略号 */
    flex: 0 0 auto;
    min-width: 0;
    max-width: 100%;
    padding: 2px 8px;
    border: 1px solid #e4ece7;
    border-radius: 999px;
    background: #f7faf8;
    font-size: 11.5px;
    line-height: 1.65;
    color: #44554b;
    white-space: nowrap;
    box-sizing: border-box;
}

.pill-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.pill-icon {
    flex: 0 0 auto;
    opacity: 0.62;
}

/* ========== 就绪色点 ========== */
.dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: 0 0 auto;
    background: currentColor;
}

.ready-pill.is-ready {
    color: var(--brand-primary-dark);
    border-color: var(--brand-primary-light);
    background: var(--bg-brand-light);
}

.ready-pill.is-ready .dot {
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.18);
}

.ready-pill.is-unready {
    color: #c62828;
    border-color: #f2c9c9;
    background: #fdf3f3;
}

.ready-pill.is-unready .dot {
    box-shadow: 0 0 0 2px rgba(198, 40, 40, 0.16);
}

/* ========== 色调（仅文字色） ========== */
.tone-default-ai {
    color: var(--brand-primary-dark);
}

.tone-direct {
    color: #1565c0;
}

.tone-proxy {
    color: #6a1b9a;
}

/* ========== 路由模式 pill（可点击） ========== */
.mode-pill {
    cursor: pointer;
    font-weight: 600;
    font-family: inherit;
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.mode-pill.tone-default-ai {
    border-color: var(--brand-primary-light);
    background: var(--bg-brand-light);
}

.mode-pill.tone-direct {
    border-color: #bcdcf8;
    background: #eaf4fd;
}

.mode-pill.tone-proxy {
    border-color: #e0c7ea;
    background: #f6ecfa;
}

.mode-pill:hover {
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.09);
}

.mode-pill:focus-visible {
    outline: 2px solid var(--brand-primary);
    outline-offset: 1px;
}

.swap-icon {
    opacity: 0.38;
    transition: opacity 0.15s;
}

.mode-pill:hover .swap-icon {
    opacity: 0.85;
}

/* ========== 模型 pill ========== */
.model-pill .pill-text {
    max-width: 132px;
}

.src-tag {
    flex: 0 0 auto;
    font-size: 9.5px;
    font-weight: 500;
    line-height: 1.55;
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.05);
}

.src-tag.tone-default-ai {
    background: rgba(var(--brand-primary-rgb), 0.14);
}

.src-tag.tone-direct {
    background: rgba(21, 101, 192, 0.12);
}

.src-tag.tone-proxy {
    background: rgba(106, 27, 154, 0.12);
}

/* ========== 消耗 / 额度 pill ========== */
.cost-pill .pill-text {
    font-weight: 700;
}

.quota-pill .pill-text {
    font-weight: 600;
}

/* 额度 pill 只保留文字色，容器回到中性底，避免与模式 pill 撞色 */
.quota-pill.tone-default-ai,
.quota-pill.tone-direct,
.quota-pill.tone-proxy {
    border-color: #e4ece7;
    background: #f7faf8;
}

.quota-pill.is-exhausted,
.quota-pill.is-exhausted .pill-text {
    color: #c62828;
    font-weight: 700;
    border-color: #f2c9c9;
    background: #fdf3f3;
}

/* ========== 说明文案 ========== */
.status-note {
    margin: 5px 0 0;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* 额度耗尽：解除折叠，完整显示警告 */
.status-note.is-exhausted {
    display: block;
    color: #c62828;
    font-weight: 600;
}

/* 移动端：放宽 pill 触控高度 */
@media (max-width: 700px) {
    .status-pill {
        padding: 3px 9px;
        font-size: 12px;
    }

    .mode-pill {
        min-height: 26px;
    }
}
</style>
