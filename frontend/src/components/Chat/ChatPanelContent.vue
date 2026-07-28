<template>
    <div class="chat-container">
        <div class="chat-header">
            <span class="chat-title">
                <bot-icon
                    :size="18"
                    color="Green"
                    :stroke-width="2"
                />
                AI 助手
            </span>
            <div class="header-controls">
                <button
                    class="icon-btn"
                    :class="{ active: showUserConfig }"
                    title="我的 Agent 配置"
                    @click="toggleUserConfig"
                >
                    <Settings :size="16" />
                </button>
                <button
                    class="icon-btn"
                    title="刷新状态"
                    @click="config.reloadAgentConfig(true)"
                >
                    <RefreshCw :size="16" />
                </button>
                <button
                    class="icon-btn"
                    title="导出对话为 Markdown"
                    @click="exportConversation"
                >
                    <Download :size="16" />
                </button>
                <button
                    class="icon-btn"
                    title="清除历史（双击确认）"
                    @click="clearHistory"
                >
                    <Trash2 :size="16" />
                </button>
                <button
                    class="icon-btn"
                    title="退出AI"
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
import { Bot as BotIcon, Download, RefreshCw, Settings, Trash2, X } from 'lucide-vue-next';

import ChatConfigPanel from './ChatConfigPanel.vue';
import ChatServiceStatus from './ChatServiceStatus.vue';
import ChatMessageList from './ChatMessageList.vue';
import ChatInputBar from './ChatInputBar.vue';

import { useMessage } from '../../composables/useMessage';
import { useMarkdownRenderer } from '../../composables/useMarkdownRenderer';
import { createChatAgentConfig } from '../../composables/chat/useChatAgentConfig';
import { useAgentMapContext } from '../../composables/chat/useAgentMapContext';
import { createChatSession } from '../../composables/chat/useChatSession';
import { detectGISIntent, getToolDisplayName } from '../../composables/chat/chatIntentFallback';
import { createGISCommander } from '../../composables/map/GISCommander';
import { AgentExecutor } from '../../services/agent/AgentExecutor';
import { readUserPositionFromCache } from '../../services/userPositionCache';
import { getGlobalUserLocationContext } from '../../services/userLocationContext';
import { AGENT_TOOLS, buildSystemPromptWithTools } from '../../constants/agentToolsSchema';
import { useChatStore } from '../../stores/useChatStore';

const emit = defineEmits(['close-chat']);
const message = useMessage();
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
            content: `您好！当前为默认 AI 模式，使用管理员配置的 ${config.modelName || config.directConfig.model}，消息经后端代理转发。`,
        };
    }
    if (config.isDirectMode) {
        return {
            role: 'assistant',
            content: `您好！当前为个人 Key 模式，消息将经后端代理转发到 ${config.directConfig.base_url}。`,
        };
    }
    return {
        role: 'assistant',
        content: config.serviceReady
            ? '您好！我是由后端代理的 AI 助手，您可以直接开始提问。'
            : '您好！AI 服务暂未就绪。请在 ⚙️ 配置中填写个人 API Key 启用直连模式，或联系管理员配置后端。',
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
    if (config.isDefaultAIMode) return '请输入您的问题（默认 AI 模式，经后端代理）...';
    if (config.isDirectMode) return '请输入您的问题（个人 Key 模式，经后端代理）...';
    if (!config.serviceReady) return '服务未就绪，请在 ⚙️ 配置中填写 API Key 或联系管理员';
    if (config.quotaExhausted) return '今日额度已达上限，请明日再试';
    return '请输入您的问题（Enter 发送，Shift+Enter 换行）...';
});

const sendDisabled = computed(() => {
    if (isLoading.value) return true;
    if (config.isDirectMode) return false;
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
        const source = String(globalLocation.source || '未知').trim();
        const province = String(encoded.province || '未知').trim();
        const city = String(encoded.city || '未知').trim();
        const district = String(encoded.district || '未知').trim();
        const adcode = String(encoded.adcode || '未知').trim();
        const address = String(encoded.formattedAddress || '').trim();

        firstMessageLocationInjected.value = true;
        return `用户位置上下文（首条消息附带）：来源=${source}，经度=${globalLocation.lon.toFixed(6)}，纬度=${globalLocation.lat.toFixed(6)}，省=${province}，市=${city}，区县=${district}，编码=${adcode}，地址=${address || '待完善'}。`;
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
        last.content = '⏹️ 已停止生成';
    }
    message.info('已停止生成');
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
    if (!config.isDirectMode && (!config.serviceReady || config.quotaExhausted)) return;

    if (session.pruneHistoryIfNeeded(buildWelcome)) {
        config.statusHint = '🧹 已自动精简历史，仅保留最近一轮对话以节省上下文开销';
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

        if (firstRound.quota) config.applyQuota(firstRound.quota);
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

            const toolRoundHistory = [
                ...requestHistory,
                { role: 'user', content: userMsg },
                {
                    role: 'assistant',
                    content: cleanReply ? `${cleanReply}\n\n[工具调用已执行]` : '[工具调用已执行]',
                },
                {
                    role: 'user',
                    content: `[工具执行结果]\n${toolResultSummary}\n\n请根据工具执行结果给用户一个简洁友好的回复。如果工具执行成功，告诉用户已完成什么操作；如果失败，告诉用户失败原因和建议。`,
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

                if (secondRound.quota) config.applyQuota(secondRound.quota);
                if (secondRound.usedModel) config.modelName = secondRound.usedModel;

                if (secondRound.reply) {
                    const finalIdx = session.pushAssistant('');
                    await typewriterReveal(finalIdx, secondRound.reply, seq);
                } else {
                    session.pushAssistant(`✅ 操作完成：\n${toolResultSummary}`);
                }
            } catch {
                session.pushAssistant(`✅ 操作完成：\n${toolResultSummary}`);
            }
        } else {
            // 打字机逐字呈现（非流式后端下的网页版观感）
            await typewriterReveal(assistantMsgIndex, reply || '（未返回有效内容）', seq);
        }

        if (!config.isDirectMode && config.quotaExhausted) {
            config.statusHint = '今日对话额度已用完，请明日再试或切换更高权限账号。';
        }
    } catch (error) {
        if (seq !== requestSeq) return;
        list[assistantMsgIndex].content = `请求失败：${error.message}`;
        list[assistantMsgIndex].isError = true;

        if (error?.isQuotaExceeded) {
            config.statusHint = '今日额度已达上限，请明日再试。';
            await config.reloadAgentConfig(false);
        }
    } finally {
        if (seq === requestSeq) {
            isLoading.value = false;
            messageListRef.value?.scrollToBottom(false);
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
        message.warning('没有可重新生成的对话');
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
        message.warning('再次点击清除按钮可删除聊天历史', { duration: 3000 });
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
    message.success('聊天历史已清除');
}

// ── 导出对话为 Markdown ──
function exportConversation() {
    const md = session.exportAsMarkdown();
    if (!md || session.messages.value.length <= 1) {
        message.warning('暂无可导出的对话内容');
        return;
    }
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WebGIS-AI对话-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('对话已导出为 Markdown');
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
        // ignore
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

/* 配置面板 + 服务状态的可滚动包裹层 */
.scroll-top-section {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
}
</style>
