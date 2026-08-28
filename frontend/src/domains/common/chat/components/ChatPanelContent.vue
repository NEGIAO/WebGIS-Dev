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
                    <Settings :size="16" />
                </button>
                <button
                    class="icon-btn"
                    :title="t('chat.refreshStatus')"
                    @click="config.reloadAgentConfig(true)"
                >
                    <RefreshCw :size="16" />
                </button>
                <button
                    class="icon-btn"
                    :title="t('chat.exportMarkdown')"
                    @click="exportConversation"
                >
                    <Download :size="16" />
                </button>
                <button
                    class="icon-btn"
                    :title="t('chat.clearHistory')"
                    @click="clearHistory"
                >
                    <Trash2 :size="16" />
                </button>
                <button
                    class="icon-btn"
                    :title="t('chat.exitAI')"
                    @click="emit('close-chat')"
                >
                    <X :size="16" />
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

<script setup>
/**
 * ChatPanelContent - AI 助手对话面板（编排容器）
 *
 * 拆分后仅负责编排（原 2378 行 → 容器 + 4 子组件 + 3 个 composable）：
 *   - 子组件：ChatConfigPanel（个人配置）/ ChatServiceStatus（状态额度）/
 *             ChatMessageList（消息列表）/ ChatInputBar（输入栏）
 *   - composable：useChatAgentConfig（配置/模式/模型/LLM 通道）、
 *                 useChatSession（消息+持久化）、chatIntentFallback（GIS 意图兜底）
 *   - 本文件保留：发送编排（含工具两轮调用）、GIS Commander 初始化、
 *                 停止生成（软取消）、重新生成、位置上下文注入
 */
import { computed, inject, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { Bot as BotIcon, Download, RefreshCw, Settings, Trash2, X } from '@lucide/vue';

import ChatConfigPanel from './ChatConfigPanel.vue';
import ChatServiceStatus from './ChatServiceStatus.vue';
import ChatMessageList from './ChatMessageList.vue';
import ChatInputBar from './ChatInputBar.vue';

import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useMarkdownRenderer } from '@common/utils/useMarkdownRenderer';
import { createChatAgentConfig } from '@common/chat/composables/useChatAgentConfig';
import { useAgentMapContext } from '@common/chat/composables/useAgentMapContext';
import { createChatSession } from '@common/chat/composables/useChatSession';
import { detectGISIntent, getToolDisplayName } from '@common/chat/composables/chatIntentFallback';
import { createGISCommander } from '@common/command-bus/GISCommander';
import { AgentExecutor } from '@common/chat/agent/AgentExecutor';
import { readUserPositionFromCache } from '@common/map-view/services/userPositionCache';
import { getGlobalUserLocationContext } from '@common/map-view/services/userLocationContext';
import { AGENT_TOOLS, buildSystemPromptWithTools } from '@common/chat/constants/agentToolsSchema';
import { useChatStore } from '@common/chat/stores/useChatStore';

const emit = defineEmits(['close-chat']);

const props = defineProps({
    /** 当前激活的 tab，用于检测切回 chat 时刷新实时配额 */
    activeTab: { type: String, default: 'chat' },
});

const message = useMessage();
const { t } = useLocale();
const chatStore = useChatStore();
const { ensureMarkdownLibs } = useMarkdownRenderer();

const agentMapCommandBus = inject('agentMapCommandBus', null);

// ── 会话与配置 ──
const session = createChatSession();
const {
    buildMapContext,
    buildSettledMapContext,
    recordMapAction,
    resetMapContextSession,
} = useAgentMapContext();
const config = createChatAgentConfig({
    message,
    onModeChanged: () => session.updateWelcomeIfNeeded(buildWelcome),
});

// 配置对象以 provide 方式共享给 ChatConfigPanel（store 型对象，避免 prop 变异）
provide('chatAgentConfig', config);

/** 按当前服务状态构建欢迎语 */
function buildWelcome() {
    if (config.isDefaultAIMode) {
        return {
            role: 'assistant',
            content: t('chat.welcomeDefault', {
                model: config.modelName || config.directConfig.model,
            }),
        };
    }
    if (config.isPersonalMode) {
        return {
            role: 'assistant',
            content: t('chat.welcomeDirect', { url: config.directConfig.base_url }),
        };
    }
    return {
        role: 'assistant',
        content: config.serviceReady ? t('chat.welcomeReady') : t('chat.welcomeNotReady'),
    };
}

// 恢复本地历史（无历史时初始化欢迎语）
session.initFromStorage(buildWelcome);

// ── UI 状态 ──
const inputMessage = ref('');
const isLoading = ref(false);
const showUserConfig = ref(false);
const messageListRef = ref(null);

const inputPlaceholder = computed(() => {
    if (config.quotaExhausted) return t('chat.placeholderQuotaExhausted');
    if (config.isDefaultAIMode) return t('chat.placeholderDefault');
    if (config.isPersonalMode) return t('chat.placeholderDirect');
    if (!config.serviceReady) return t('chat.placeholderNotReady');
    return t('chat.placeholderGeneral');
});

const sendDisabled = computed(() => {
    if (isLoading.value) return true;
    if (config.isPersonalMode) return false;
    return !config.serviceReady || config.quotaExhausted;
});

// ── GIS Commander / Agent 执行器 ──
const gisCommander = ref(null);
const agentExecutor = ref(null);

function initGISCommander() {
    if (!agentMapCommandBus) return;

    try {
        gisCommander.value = createGISCommander({
            commandBus: agentMapCommandBus,
        });

        agentExecutor.value = new AgentExecutor({
            gisCommander: gisCommander.value,
            onToolStart: () => {},
            onToolComplete: () => {},
            onError: () => {},
        });

        chatStore.setExecutor(agentExecutor.value);
    } catch (err) {
        console.warn('[ChatPanelContent] GIS Commander 初始化失败:', err);
    }
}

// ── 位置上下文（首条消息附带一次） ──
const firstMessageLocationInjected = ref(false);

async function buildFirstMessageLocationContext() {
    if (firstMessageLocationInjected.value) return '';

    const globalLocation = getGlobalUserLocationContext();
    if (
        globalLocation &&
        Number.isFinite(globalLocation.lon) &&
        Number.isFinite(globalLocation.lat)
    ) {
        const encoded = globalLocation.encodedLocation || {};
        const unknown = t('chat.unknown');
        const source = String(globalLocation.source || unknown).trim();
        const province = String(encoded.province || unknown).trim();
        const city = String(encoded.city || unknown).trim();
        const district = String(encoded.district || unknown).trim();
        const adcode = String(encoded.adcode || unknown).trim();
        const address = String(encoded.formattedAddress || '').trim();

        firstMessageLocationInjected.value = true;
        // 位置上下文作为协议文本注入 LLM，主体结构保持不变
        return `用户位置上下文（首条消息附带）：来源=${source}，经度=${globalLocation.lon.toFixed(6)}，纬度=${globalLocation.lat.toFixed(6)}，省=${province}，市=${city}，区县=${district}，编码=${adcode}，地址=${address || t('chat.addressPending')}。`;
    }

    const baseLocation = readUserPositionFromCache();
    if (baseLocation) {
        firstMessageLocationInjected.value = true;
        return `用户位置上下文（首条消息附带）：经度=${baseLocation.lon.toFixed(6)}，纬度=${baseLocation.lat.toFixed(6)}。`;
    }

    firstMessageLocationInjected.value = true;
    return '';
}

// ── 打字机呈现（非流式后端下的逐字体验） ──
let typewriterTimer = null;

/**
 * 将完整回复以打字机方式逐段写入指定消息
 * 停止/清除（seq 变化）时立即整段落盘，不丢内容
 * @param {number} index - 消息索引
 * @param {string} fullText - 完整回复文本
 * @param {number} seq - 本次请求序号（软取消守卫）
 * @returns {Promise<void>}
 */
function typewriterReveal(index, fullText, seq) {
    return new Promise((resolve) => {
        const list = session.messages.value;
        const text = String(fullText || '');
        // 短文本或不可见（think 全包裹）直接落盘，避免无意义动画
        if (text.length < 24) {
            if (list[index]) list[index].content = text;
            resolve();
            return;
        }

        let pos = 0;
        // 约 90 帧播完（长回复步进更大），每帧 ~16ms，整体 1.5s 内
        const step = Math.max(2, Math.ceil(text.length / 90));

        if (typewriterTimer) clearInterval(typewriterTimer);
        typewriterTimer = setInterval(() => {
            // 已停止/已清除：立即整段展示
            if (seq !== requestSeq || !list[index]) {
                clearInterval(typewriterTimer);
                typewriterTimer = null;
                if (list[index]) list[index].content = text;
                resolve();
                return;
            }

            pos += step;
            list[index].content = text.slice(0, pos);
            messageListRef.value?.scrollToBottom(false);

            if (pos >= text.length) {
                clearInterval(typewriterTimer);
                typewriterTimer = null;
                list[index].content = text;
                resolve();
            }
        }, 16);
    });
}

// ── 停止生成（软取消：请求序号守卫，晚到的响应被忽略） ──
let requestSeq = 0;

function stopGeneration() {
    if (!isLoading.value) return;
    requestSeq += 1;
    isLoading.value = false;

    const list = session.messages.value;
    const last = list[list.length - 1];
    if (last?.role === 'assistant' && !last.isToolStatus && !String(last.content || '').trim()) {
        last.content = t('chat.stopped');
    }
    session.schedulePersist();
    message.info(t('chat.stopGenerate'));
}

// ── 工具执行编排 ──
async function executeToolsAndUpdateUI(toolCalls, assistantMsgIndex) {
    const list = session.messages.value;
    const statusMsgIndex =
        list.push({
            role: 'assistant',
            content: '',
            time: Date.now(),
            isToolStatus: true,
            toolCalls: toolCalls.map((tc) => ({
                name: tc.name,
                label: getToolDisplayName(tc.name, tc.arguments),
                status: 'executing',
            })),
        }) - 1;

    messageListRef.value?.scrollToBottom(true);
    const toolResults = await agentExecutor.value.executeToolCalls(toolCalls);

    list[statusMsgIndex].toolCalls = toolCalls.map((tc, idx) => {
        const result = toolResults[idx];
        return {
            name: tc.name,
            label: getToolDisplayName(tc.name, tc.arguments),
            status: result?.result?.success ? 'success' : 'error',
            message: result?.result?.message || '',
        };
    });

    if (!list[assistantMsgIndex].content) {
        list.splice(assistantMsgIndex, 1);
    }

    messageListRef.value?.scrollToBottom(false);
    const toolResultSummary = AgentExecutor.buildResultSummary(toolResults);

    // Record successful commands before building the settled snapshot so the
    // follow-up LLM request sees this turn's recentActions. Command arguments
    // belong to the original tool calls; adapter results intentionally omit them.
    toolResults.forEach((tr, idx) => {
        const toolCall = toolCalls[idx];
        const command = toolCall?.name || tr?.name;
        if (tr?.result?.success && command) {
            recordMapAction({
                action: command,
                view: tr.result.view || toolCall?.arguments?.view || null,
                command,
                params: toolCall?.arguments || {},
            });
        }
    });

    const resultingMapContext = await buildSettledMapContext();

    return { toolResultSummary, resultingMapContext };
}

// ── 发送编排 ──
/**
 * 发送一条消息（含工具两轮调用编排）
 * @param {string} rawText - 消息文本
 * @param {{ skipUserPush?: boolean }} [options] - skipUserPush 用于"重新生成"（用户消息已在列表中）
 */
async function dispatchSend(rawText, { skipUserPush = false } = {}) {
    const userMsg = String(rawText || '').trim();
    if (!userMsg || isLoading.value) return;
    // 默认 AI / 个人 Key 模式不受配额限制；仅后端代理模式受配额限制
    if (!config.isDefaultAIMode && !config.isPersonalMode && (!config.serviceReady || config.quotaExhausted)) return;

    if (session.pruneHistoryIfNeeded(buildWelcome)) {
        config.statusHint = t('chat.historyTrimmed');
    }

    let requestHistory = session.buildEconomyContext();
    // 重新生成时用户消息已在历史中，避免与 message 参数重复
    if (skipUserPush) {
        const lastCtx = requestHistory[requestHistory.length - 1];
        if (lastCtx?.role === 'user') requestHistory = requestHistory.slice(0, -1);
    }

    const locationContextText = await buildFirstMessageLocationContext();
    const mapContext = buildMapContext();

    if (!skipUserPush) session.pushUser(userMsg);
    isLoading.value = true;
    messageListRef.value?.scrollToBottom(true);

    const seq = ++requestSeq;
    const assistantMsgIndex = session.pushAssistant('');
    const list = session.messages.value;

    // ── 累计本轮对话各轮次的真实消耗（后端返回的 cost 折算值）──
    // 默认 AI 模式使用免费 LLM，不扣用户额度，无需累计消耗
    let totalCallCost = 0;
    config.lastCallCost = 0;

    try {
        const systemPrompt = buildSystemPromptWithTools();

        const firstRound = await config.callLLM({
            message: userMsg,
            history: requestHistory,
            locationContext: locationContextText,
            mapContext,
            systemPrompt,
            tools: AGENT_TOOLS,
        });
        if (seq !== requestSeq) return; // 用户已停止，忽略晚到响应

        // 立即显示第一轮消耗，让用户第一时间看到反馈；后续轮次在最后用后端 cost 汇总校正。
        // quota 不在此处更新——避免额度数字在对话过程中乱跳，只在最后统一刷新。
        // 默认 AI 模式使用免费 LLM，不扣用户额度，不显示消耗
        if (firstRound.cost && !config.isDefaultAIMode) {
            config.lastCallCost = firstRound.cost;
            totalCallCost += firstRound.cost;
        }
        if (firstRound.usedModel) config.modelName = firstRound.usedModel;

        const reply = firstRound.reply;
        let finalToolCalls = AgentExecutor.extractToolCalls(firstRound.rawData);
        let isIntentFallback = false;

        // LLM 未给出工具调用时，正则识别 GIS 意图兜底
        if ((!finalToolCalls || finalToolCalls.length === 0) && agentExecutor.value) {
            const intentToolCall = detectGISIntent(userMsg);
            if (intentToolCall) {
                finalToolCalls = [intentToolCall];
                isIntentFallback = true;
            }
        }

        if (finalToolCalls && finalToolCalls.length > 0 && agentExecutor.value) {
            const cleanReply = AgentExecutor.stripToolCallBlocks(reply);

            if (!isIntentFallback && cleanReply && cleanReply.length > 5) {
                list[assistantMsgIndex].content = cleanReply;
            }

            const { toolResultSummary, resultingMapContext } = await executeToolsAndUpdateUI(
                finalToolCalls,
                assistantMsgIndex,
            );
            if (seq !== requestSeq) return;

            const toolExecuted = t('chat.toolExecuted');
            const toolResult = t('chat.toolResult');
            const toolRoundHistory = [
                ...requestHistory,
                { role: 'user', content: userMsg },
                {
                    role: 'assistant',
                    content: cleanReply ? `${cleanReply}\n\n${toolExecuted}` : toolExecuted,
                },
                {
                    role: 'user',
                    // 后续指令为 LLM 协议提示，不作为 UI 文案
                    content: `${toolResult}\n${toolResultSummary}\n\n请根据工具执行结果给用户一个简洁友好的回复。如果工具执行成功，告诉用户已完成什么操作；如果失败，告诉用户失败原因和建议。`,
                },
            ];

            try {
                const secondRound = await config.callLLM({
                    message: '请根据上述工具执行结果回复用户。',
                    history: toolRoundHistory.slice(-6),
                    locationContext: '',
                    mapContext: resultingMapContext,
                    systemPrompt: '',
                    tools: AGENT_TOOLS,
                });
                if (seq !== requestSeq) return;

                // 累计第二轮消耗（同一轮对话内的多轮 LLM 调用）；quota 仍只在最后统一刷新
                // 默认 AI 模式使用免费 LLM，不扣用户额度，不累计消耗
                if (secondRound.cost && !config.isDefaultAIMode) totalCallCost += secondRound.cost;
                if (secondRound.usedModel) config.modelName = secondRound.usedModel;

                if (secondRound.reply) {
                    const finalIdx = session.pushAssistant('');
                    await typewriterReveal(finalIdx, secondRound.reply, seq);
                } else {
                    session.pushAssistant(`✅ ${t('chat.opDone')}：\n${toolResultSummary}`);
                }
            } catch (secondErr) {
                // 第二轮 LLM 调用失败：区分额度耗尽（提示并刷新）与其他错误（静默降级为成功摘要）
                if (secondErr?.isQuotaExceeded) {
                    config.statusHint = t('chat.quotaLimitHint');
                    await config.reloadAgentConfig(false);
                } else {
                    session.pushAssistant(`✅ ${t('chat.opDone')}：\n${toolResultSummary}`);
                }
            }
        } else {
            // 打字机逐字呈现（非流式后端下的网页版观感）
            await typewriterReveal(assistantMsgIndex, reply || t('chat.emptyReply'), seq);
        }

        if (!config.isDefaultAIMode && !config.isPersonalMode && config.quotaExhausted) {
            config.statusHint = t('chat.quotaExhaustedHint');
        }

        // 发消息完成后，从权威源重新拉取实时配额（与用户中心一致）
        // 注意：必须用 reloadAgentConfig(false) 直接刷新，不能用 requestQuotaRefresh()——
        // 后者有 5 秒节流，连续对话时会被跳过，导致 quota 未更新。
        // 默认 AI 模式使用免费 LLM，不扣用户额度，无需刷新配额；
        // 仅个人 Key 直连（用户自己的 Key）不消耗平台配额，无需刷新；
        // 仅后端代理模式使用收费 LLM，按 token 扣用户额度，需刷新配额并显示本次消耗。
        if (!config.isDefaultAIMode && !config.isPersonalMode) {
            await config.reloadAgentConfig(false);
            // 用后端返回的各轮 cost 之和覆盖 lastCallCost（比配额差值更精确：
            // 并发对话/其他配额操作不会污染本次消耗计算）。
            config.lastCallCost = Math.max(0, Math.round(totalCallCost));
        }
    } catch (error) {
        if (seq !== requestSeq) return;
        list[assistantMsgIndex].content = t('chat.requestFailed', { error: error.message });
        list[assistantMsgIndex].isError = true;

        if (error?.isQuotaExceeded) {
            config.statusHint = t('chat.quotaLimitHint');
            await config.reloadAgentConfig(false);
        }
    } finally {
        if (seq === requestSeq) {
            isLoading.value = false;
            messageListRef.value?.scrollToBottom(false);
            // 正常完成/出错均在此统一持久化（流式逐字期间不再触发序列化）
            session.schedulePersist();
        }
    }
}

function sendMessage() {
    const text = inputMessage.value;
    if (!String(text || '').trim()) return;
    inputMessage.value = '';
    dispatchSend(text);
}

/** 空状态建议词点击：直接发送 */
function handleSuggest(text) {
    if (isLoading.value) return;
    dispatchSend(text);
}

/** 重新生成最后一条回复 */
function handleRegenerate() {
    if (isLoading.value) return;
    const lastUser = session.prepareRegenerate();
    if (!lastUser) {
        message.warning(t('chat.noRegenerate'));
        return;
    }
    dispatchSend(lastUser, { skipUserPush: true });
}

// ── 清除历史（双击确认） ──
const clearConfirmArmed = ref(false);
let clearConfirmTimer = null;

function clearHistory() {
    if (!clearConfirmArmed.value) {
        clearConfirmArmed.value = true;
        message.warning(t('chat.clearConfirmHint'), { duration: 3000 });
        if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
        clearConfirmTimer = setTimeout(() => {
            clearConfirmArmed.value = false;
            clearConfirmTimer = null;
        }, 3000);
        return;
    }

    if (clearConfirmTimer) {
        clearTimeout(clearConfirmTimer);
        clearConfirmTimer = null;
    }
    clearConfirmArmed.value = false;
    // 清除历史同时取消在途请求，避免晚到回复写入已丢弃的旧数组
    requestSeq += 1;
    isLoading.value = false;
    session.clearAll(buildWelcome);
    resetMapContextSession();
    message.success(t('chat.historyCleared'));
}

// ── 导出对话为 Markdown ──
function exportConversation() {
    const md = session.exportAsMarkdown();
    if (!md || session.messages.value.length <= 1) {
        message.warning(t('chat.exportEmpty'));
        return;
    }
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t('chat.exportFilename', { date: new Date().toISOString().slice(0, 10) });
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('chat.exported'));
}

// ── 配置面板开关 ──
async function toggleUserConfig() {
    showUserConfig.value = !showUserConfig.value;
    if (showUserConfig.value) {
        await config.loadUserConfig(false);
        await config.loadAvailableModels();
    }
}

// ── 生命周期 ──
onMounted(async () => {
    resetMapContextSession();
    await config.loadDefaultAIConfig();
    await config.reloadAgentConfig(false);
    await config.loadAvailableModels();
    session.updateWelcomeIfNeeded(buildWelcome);

    try {
        await ensureMarkdownLibs();
    } catch {
        // Markdown 库加载失败时使用纯文本渲染兜底（已在渲染层处理）
    }

    initGISCommander();
});

onBeforeUnmount(() => {
    if (clearConfirmTimer) {
        clearTimeout(clearConfirmTimer);
        clearConfirmTimer = null;
    }
    if (typewriterTimer) {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
    }
    gisCommander.value?.dispose?.();
});

// Defensive: if agentMapCommandBus was not yet available during onMounted,
// retry initialization once it becomes available.
watch(
    () => agentMapCommandBus,
    (bus) => {
        if (bus && !gisCommander.value) {
            initGISCommander();
        }
    },
);

// 切回 chat tab 时刷新实时配额（用户可能在其他 tab 消耗了额度）
// 节流：与 dispatchSend 末尾的刷新互斥，避免短时间内重复请求
let lastQuotaRefreshAt = 0;
function requestQuotaRefresh() {
    const now = Date.now();
    if (now - lastQuotaRefreshAt < 5000) return;
    lastQuotaRefreshAt = now;
    config.reloadAgentConfig(false);
}

watch(
    () => props.activeTab,
    (tab) => {
        // 默认 AI 模式使用免费 LLM，不扣用户额度，无需刷新配额；
        // 仅后端代理模式使用收费 LLM，切回 chat 时刷新实时配额
        if (tab === 'chat' && !config.isDefaultAIMode && !config.isPersonalMode) {
            requestQuotaRefresh();
        }
    },
);
</script>

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
