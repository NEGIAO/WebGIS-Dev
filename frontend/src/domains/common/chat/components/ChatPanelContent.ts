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
 *
 * 日    期：2026/11/13（范式化改造）
 */
import {
	computed,
	defineComponent,
	inject,
	onBeforeUnmount,
	onMounted,
	provide,
	ref,
	watch,
	type ExtractPropTypes,
	type SetupContext,
} from 'vue';
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

// 一、Emits
type EmitsType = ['close-chat'];

// 二、Props
const propDefine = {
	/** 当前激活的 tab，用于检测切回 chat 时刷新实时配额 */
	activeTab: { type: String, default: 'chat' },
} as const;

export type ChatPanelContentProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'ChatPanelContent',
	components: { ChatConfigPanel, ChatServiceStatus, ChatMessageList, ChatInputBar, BotIcon, Download, RefreshCw, Settings, Trash2, X },
	props: propDefine,
	emits: ['close-chat'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	/** 模板直接调用的 emit（对应原 <script setup> 中 defineEmits 的返回值） */
	public emit!: SetupContext<EmitsType>['emit'];
	// ── UI 状态 ──
	public inputMessage = ref('');
	public isLoading = ref(false);
	public showUserConfig = ref(false);
	public messageListRef = ref<any>(null);
	public clearConfirmArmed = ref(false);

	// ── 会话与配置（对象整体暴露给模板） ──
	public session: any;
	public config: any;

	// ── GIS Commander / Agent 执行器 ──
	public gisCommander = ref<any>(null);
	public agentExecutor = ref<any>(null);

	public t!: (key: string, params?: Record<string, any>) => string;

	private message: ReturnType<typeof useMessage>;
	private chatStore: ReturnType<typeof useChatStore>;
	private ensureMarkdownLibs!: () => Promise<void>;
	private agentMapCommandBus: any;
	private mapContextApi: any;

	/** 位置上下文是否已随首条消息注入（只注入一次） */
	private firstMessageLocationInjected = ref(false);
	/** 打字机定时器 */
	private typewriterTimer: ReturnType<typeof setInterval> | null = null;
	/** 请求序号：软取消守卫，晚到响应被忽略 */
	private requestSeq = 0;
	/** 清除历史的二次确认定时器 */
	private clearConfirmTimer: ReturnType<typeof setTimeout> | null = null;
	/** 配额刷新节流时间戳 */
	private lastQuotaRefreshAt = 0;

	constructor(
		private props: ChatPanelContentProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.emit = this.ctx.emit;
		this.message = useMessage();
		const { t } = useLocale();
		this.t = t;
		this.chatStore = useChatStore();
		const md = useMarkdownRenderer();
		this.ensureMarkdownLibs = md.ensureMarkdownLibs;
		this.agentMapCommandBus = inject('agentMapCommandBus', null);

		// ── 会话与配置 ──
		this.session = createChatSession();
		this.mapContextApi = useAgentMapContext();
		this.config = createChatAgentConfig({
			message: this.message,
			onModeChanged: () => this.session.updateWelcomeIfNeeded(this.buildWelcome),
		});

		// 配置对象以 provide 方式共享给 ChatConfigPanel（store 型对象，避免 prop 变异）
		provide('chatAgentConfig', this.config);

		// 恢复本地历史（无历史时初始化欢迎语）
		this.session.initFromStorage(this.buildWelcome);

		this.init();
	}

	get activeTab() {
		return this.props.activeTab;
	}

	//#region 派生

	public inputPlaceholder = computed(() => {
		if (this.config.quotaExhausted) return this.t('chat.placeholderQuotaExhausted');
		if (this.config.isDefaultAIMode) return this.t('chat.placeholderDefault');
		if (this.config.isPersonalMode) return this.t('chat.placeholderDirect');
		if (!this.config.serviceReady) return this.t('chat.placeholderNotReady');
		return this.t('chat.placeholderGeneral');
	});

	public sendDisabled = computed(() => {
		if (this.isLoading.value) return true;
		if (this.config.isPersonalMode) return false;
		return !this.config.serviceReady || this.config.quotaExhausted;
	});

	/** 按当前服务状态构建欢迎语 */
	public buildWelcome = () => {
		if (this.config.isDefaultAIMode) {
			return {
				role: 'assistant',
				content: this.t('chat.welcomeDefault', { model: this.config.modelName || this.config.directConfig.model }),
			};
		}
		if (this.config.isPersonalMode) {
			return {
				role: 'assistant',
				content: this.t('chat.welcomeDirect', { url: this.config.directConfig.base_url }),
			};
		}
		return {
			role: 'assistant',
			content: this.config.serviceReady ? this.t('chat.welcomeReady') : this.t('chat.welcomeNotReady'),
		};
	};

	//#endregion

	//#region 生命周期

	private init() {
		onMounted(async () => {
			this.mapContextApi.resetMapContextSession();
			await this.config.loadDefaultAIConfig();
			await this.config.reloadAgentConfig(false);
			await this.config.loadAvailableModels();
			this.session.updateWelcomeIfNeeded(this.buildWelcome);

			try {
				await this.ensureMarkdownLibs();
			} catch {
				// Markdown 库加载失败时使用纯文本渲染兜底（已在渲染层处理）
			}

			this.initGISCommander();
		});

		onBeforeUnmount(() => {
			if (this.clearConfirmTimer) {
				clearTimeout(this.clearConfirmTimer);
				this.clearConfirmTimer = null;
			}
			if (this.typewriterTimer) {
				clearInterval(this.typewriterTimer);
				this.typewriterTimer = null;
			}
			this.gisCommander.value?.dispose?.();
		});

		// 兜底：agentMapCommandBus 在 onMounted 时尚未就绪，则等其可用后补初始化一次
		watch(
			() => this.agentMapCommandBus,
			(bus) => {
				if (bus && !this.gisCommander.value) this.initGISCommander();
			}
		);

		// 切回 chat tab 时刷新实时配额（用户可能在其他 tab 消耗了额度）
		watch(
			() => this.props.activeTab,
			(tab) => {
				// 默认 AI / 个人 Key 模式不消耗平台配额，无需刷新
				if (tab === 'chat' && !this.config.isDefaultAIMode && !this.config.isPersonalMode) {
					this.requestQuotaRefresh();
				}
			}
		);
	}

	//#endregion

	//#region GIS Commander

	public initGISCommander = () => {
		if (!this.agentMapCommandBus) return;
		try {
			this.gisCommander.value = createGISCommander({
				commandBus: this.agentMapCommandBus,
				// 「附近的餐馆」需要当前视图中心做周边检索；这里传无副作用快照，避免推进 changesSinceLastTurn 基准
				getMapContext: this.mapContextApi.captureMapContext,
			});
			this.agentExecutor.value = new AgentExecutor({
				gisCommander: this.gisCommander.value,
				onToolStart: () => {},
				onToolComplete: () => {},
				onError: () => {},
			});
			this.chatStore.setExecutor(this.agentExecutor.value);
		} catch (err) {
			console.warn('[ChatPanelContent] GIS Commander 初始化失败:', err);
		}
	};

	//#endregion

	//#region 位置上下文

	/** 构建首条消息的位置上下文（只注入一次，无位置时返回空串） */
	private async buildFirstMessageLocationContext() {
		if (this.firstMessageLocationInjected.value) return '';

		const globalLocation = getGlobalUserLocationContext();
		if (globalLocation && Number.isFinite(globalLocation.lon) && Number.isFinite(globalLocation.lat)) {
			const encoded: any = (globalLocation as any).encodedLocation || {};
			const unknown = this.t('chat.unknown');
			const source = String(globalLocation.source || unknown).trim();
			const province = String(encoded.province || unknown).trim();
			const city = String(encoded.city || unknown).trim();
			const district = String(encoded.district || unknown).trim();
			const adcode = String(encoded.adcode || unknown).trim();
			const address = String(encoded.formattedAddress || '').trim();

			this.firstMessageLocationInjected.value = true;
			// 位置上下文作为协议文本注入 LLM，主体结构保持不变
			return `用户位置上下文（首条消息附带）：来源=${source}，经度=${globalLocation.lon.toFixed(6)}，纬度=${globalLocation.lat.toFixed(6)}，省=${province}，市=${city}，区县=${district}，编码=${adcode}，地址=${address || this.t('chat.addressPending')}。`;
		}

		const baseLocation = readUserPositionFromCache();
		if (baseLocation) {
			this.firstMessageLocationInjected.value = true;
			return `用户位置上下文（首条消息附带）：经度=${baseLocation.lon.toFixed(6)}，纬度=${baseLocation.lat.toFixed(6)}。`;
		}

		this.firstMessageLocationInjected.value = true;
		return '';
	}

	//#endregion

	//#region 打字机与停止

	/**
	 * 将完整回复以打字机方式逐段写入指定消息
	 * 停止/清除（seq 变化）时立即整段落盘，不丢内容
	 * @param index 消息索引
	 * @param fullText 完整回复文本
	 * @param seq 本次请求序号（软取消守卫）
	 */
	private typewriterReveal(index: number, fullText: string, seq: number) {
		return new Promise<void>((resolve) => {
			const list = this.session.messages.value;
			const text = String(fullText || '');
			// 短文本直接落盘，避免无意义动画
			if (text.length < 24) {
				if (list[index]) list[index].content = text;
				resolve();
				return;
			}

			let pos = 0;
			// 约 90 帧播完（长回复步进更大），每帧 ~16ms，整体 1.5s 内
			const step = Math.max(2, Math.ceil(text.length / 90));

			if (this.typewriterTimer) clearInterval(this.typewriterTimer);
			this.typewriterTimer = setInterval(() => {
				// 已停止/已清除：立即整段展示
				if (seq !== this.requestSeq || !list[index]) {
					clearInterval(this.typewriterTimer as any);
					this.typewriterTimer = null;
					if (list[index]) list[index].content = text;
					resolve();
					return;
				}

				pos += step;
				list[index].content = text.slice(0, pos);
				this.messageListRef.value?.scrollToBottom(false);

				if (pos >= text.length) {
					clearInterval(this.typewriterTimer as any);
					this.typewriterTimer = null;
					list[index].content = text;
					resolve();
				}
			}, 16);
		});
	}

	/** 停止生成（软取消：请求序号守卫，晚到的响应被忽略） */
	public stopGeneration = () => {
		if (!this.isLoading.value) return;
		this.requestSeq += 1;
		this.isLoading.value = false;

		const list = this.session.messages.value;
		const last = list[list.length - 1];
		if (last?.role === 'assistant' && !last.isToolStatus && !String(last.content || '').trim()) {
			last.content = this.t('chat.stopped');
		}
		this.session.schedulePersist();
		this.message.info(this.t('chat.stopGenerate'));
	};

	//#endregion

	//#region 工具执行编排

	/** 执行工具调用并更新 UI，返回结果摘要与执行后的地图上下文 */
	private async executeToolsAndUpdateUI(toolCalls: any[], assistantMsgIndex: number) {
		const list = this.session.messages.value;
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

		this.messageListRef.value?.scrollToBottom(true);
		const toolResults = await this.agentExecutor.value.executeToolCalls(toolCalls);

		list[statusMsgIndex].toolCalls = toolCalls.map((tc, idx) => {
			const result = toolResults[idx];
			return {
				name: tc.name,
				label: getToolDisplayName(tc.name, tc.arguments),
				status: result?.result?.success ? 'success' : 'error',
				message: result?.result?.message || '',
			};
		});

		if (!list[assistantMsgIndex].content) list.splice(assistantMsgIndex, 1);

		this.messageListRef.value?.scrollToBottom(false);
		const toolResultSummary = AgentExecutor.buildResultSummary(toolResults);

		// Record successful commands before building the settled snapshot so the
		// follow-up LLM request sees this turn's recentActions. Command arguments
		// belong to the original tool calls; adapter results intentionally omit them.
		toolResults.forEach((tr: any, idx: number) => {
			const toolCall = toolCalls[idx];
			const command = toolCall?.name || tr?.name;
			if (tr?.result?.success && command) {
				this.mapContextApi.recordMapAction({
					action: command,
					view: tr.result.view || toolCall?.arguments?.view || null,
					command,
					params: toolCall?.arguments || {},
				});
			}
		});

		const resultingMapContext = await this.mapContextApi.buildSettledMapContext();
		return { toolResultSummary, resultingMapContext };
	}

	//#endregion

	//#region 发送编排

	/**
	 * 发送一条消息（含工具两轮调用编排）
	 * @param rawText 消息文本
	 * @param options.skipUserPush 用于「重新生成」（用户消息已在列表中）
	 */
	private async dispatchSend(rawText: string, { skipUserPush = false } = {}) {
		const userMsg = String(rawText || '').trim();
		if (!userMsg || this.isLoading.value) return;
		// 默认 AI / 个人 Key 模式不受配额限制；仅后端代理模式受配额限制
		if (!this.config.isDefaultAIMode && !this.config.isPersonalMode && (!this.config.serviceReady || this.config.quotaExhausted)) return;

		if (this.session.pruneHistoryIfNeeded(this.buildWelcome)) {
			this.config.statusHint = this.t('chat.historyTrimmed');
		}

		let requestHistory = this.session.buildEconomyContext();
		// 重新生成时用户消息已在历史中，避免与 message 参数重复
		if (skipUserPush) {
			const lastCtx = requestHistory[requestHistory.length - 1];
			if (lastCtx?.role === 'user') requestHistory = requestHistory.slice(0, -1);
		}

		const locationContextText = await this.buildFirstMessageLocationContext();
		const mapContext = this.mapContextApi.buildMapContext();

		if (!skipUserPush) this.session.pushUser(userMsg);
		this.isLoading.value = true;
		this.messageListRef.value?.scrollToBottom(true);

		const seq = ++this.requestSeq;
		const assistantMsgIndex = this.session.pushAssistant('');
		const list = this.session.messages.value;

		// ── 累计本轮对话各轮次的真实消耗（后端返回的 cost 折算值）──
		// 默认 AI 模式使用免费 LLM，不扣用户额度，无需累计消耗
		let totalCallCost = 0;
		this.config.lastCallCost = 0;

		try {
			const systemPrompt = buildSystemPromptWithTools();

			const firstRound = await this.config.callLLM({
				message: userMsg,
				history: requestHistory,
				locationContext: locationContextText,
				mapContext,
				systemPrompt,
				tools: AGENT_TOOLS,
			});
			if (seq !== this.requestSeq) return; // 用户已停止，忽略晚到响应

			// 立即显示第一轮消耗，让用户第一时间看到反馈；后续轮次在最后用后端 cost 汇总校正。
			// quota 不在此处更新——避免额度数字在对话过程中乱跳，只在最后统一刷新。
			if (firstRound.cost && !this.config.isDefaultAIMode) {
				this.config.lastCallCost = firstRound.cost;
				totalCallCost += firstRound.cost;
			}
			if (firstRound.usedModel) this.config.modelName = firstRound.usedModel;

			const reply = firstRound.reply;
			let finalToolCalls = AgentExecutor.extractToolCalls(firstRound.rawData);
			let isIntentFallback = false;

			// LLM 未给出工具调用时，正则识别 GIS 意图兜底
			if ((!finalToolCalls || finalToolCalls.length === 0) && this.agentExecutor.value) {
				const intentToolCall = detectGISIntent(userMsg);
				if (intentToolCall) {
					finalToolCalls = [intentToolCall];
					isIntentFallback = true;
				}
			}

			if (finalToolCalls && finalToolCalls.length > 0 && this.agentExecutor.value) {
				const cleanReply = AgentExecutor.stripToolCallBlocks(reply);

				if (!isIntentFallback && cleanReply && cleanReply.length > 5) {
					list[assistantMsgIndex].content = cleanReply;
				}

				const { toolResultSummary, resultingMapContext } = await this.executeToolsAndUpdateUI(
					finalToolCalls,
					assistantMsgIndex
				);
				if (seq !== this.requestSeq) return;

				const toolExecuted = this.t('chat.toolExecuted');
				const toolResult = this.t('chat.toolResult');
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
					const secondRound = await this.config.callLLM({
						message: '请根据上述工具执行结果回复用户。',
						history: toolRoundHistory.slice(-6),
						locationContext: '',
						mapContext: resultingMapContext,
						systemPrompt: '',
						tools: AGENT_TOOLS,
					});
					if (seq !== this.requestSeq) return;

					// 累计第二轮消耗（同一轮对话内的多轮 LLM 调用）；quota 仍只在最后统一刷新
					if (secondRound.cost && !this.config.isDefaultAIMode) totalCallCost += secondRound.cost;
					if (secondRound.usedModel) this.config.modelName = secondRound.usedModel;

					if (secondRound.reply) {
						const finalIdx = this.session.pushAssistant('');
						await this.typewriterReveal(finalIdx, secondRound.reply, seq);
					} else {
						this.session.pushAssistant(`✅ ${this.t('chat.opDone')}：\n${toolResultSummary}`);
					}
				} catch (secondErr: any) {
					// 第二轮失败：区分额度耗尽（提示并刷新）与其他错误（静默降级为成功摘要）
					if (secondErr?.isQuotaExceeded) {
						this.config.statusHint = this.t('chat.quotaLimitHint');
						await this.config.reloadAgentConfig(false);
					} else {
						this.session.pushAssistant(`✅ ${this.t('chat.opDone')}：\n${toolResultSummary}`);
					}
				}
			} else {
				// 打字机逐字呈现（非流式后端下的网页版观感）
				await this.typewriterReveal(assistantMsgIndex, reply || this.t('chat.emptyReply'), seq);
			}

			if (!this.config.isDefaultAIMode && !this.config.isPersonalMode && this.config.quotaExhausted) {
				this.config.statusHint = this.t('chat.quotaExhaustedHint');
			}

			// 发消息完成后，从权威源重新拉取实时配额（与用户中心一致）
			// 必须用 reloadAgentConfig(false) 直接刷新，不能用 requestQuotaRefresh()——
			// 后者有 5 秒节流，连续对话时会被跳过，导致 quota 未更新。
			if (!this.config.isDefaultAIMode && !this.config.isPersonalMode) {
				await this.config.reloadAgentConfig(false);
				// 用后端返回的各轮 cost 之和覆盖 lastCallCost（比配额差值更精确）
				this.config.lastCallCost = Math.max(0, Math.round(totalCallCost));
			}
		} catch (error: any) {
			if (seq !== this.requestSeq) return;
			list[assistantMsgIndex].content = this.t('chat.requestFailed', { error: error.message });
			list[assistantMsgIndex].isError = true;

			if (error?.isQuotaExceeded) {
				this.config.statusHint = this.t('chat.quotaLimitHint');
				await this.config.reloadAgentConfig(false);
			}
		} finally {
			if (seq === this.requestSeq) {
				this.isLoading.value = false;
				this.messageListRef.value?.scrollToBottom(false);
				// 正常完成/出错均在此统一持久化（流式逐字期间不再触发序列化）
				this.session.schedulePersist();
			}
		}
	}

	public sendMessage = () => {
		const text = this.inputMessage.value;
		if (!String(text || '').trim()) return;
		this.inputMessage.value = '';
		this.dispatchSend(text);
	};

	/** 空状态建议词点击：直接发送 */
	public handleSuggest = (text: string) => {
		if (this.isLoading.value) return;
		this.dispatchSend(text);
	};

	/** 重新生成最后一条回复 */
	public handleRegenerate = () => {
		if (this.isLoading.value) return;
		const lastUser = this.session.prepareRegenerate();
		if (!lastUser) {
			this.message.warning(this.t('chat.noRegenerate'));
			return;
		}
		this.dispatchSend(lastUser, { skipUserPush: true });
	};

	//#endregion

	//#region 清除与导出

	/** 清除历史（双击确认） */
	public clearHistory = () => {
		if (!this.clearConfirmArmed.value) {
			this.clearConfirmArmed.value = true;
			this.message.warning(this.t('chat.clearConfirmHint'), { duration: 3000 });
			if (this.clearConfirmTimer) clearTimeout(this.clearConfirmTimer);
			this.clearConfirmTimer = setTimeout(() => {
				this.clearConfirmArmed.value = false;
				this.clearConfirmTimer = null;
			}, 3000);
			return;
		}

		if (this.clearConfirmTimer) {
			clearTimeout(this.clearConfirmTimer);
			this.clearConfirmTimer = null;
		}
		this.clearConfirmArmed.value = false;
		// 清除历史同时取消在途请求，避免晚到回复写入已丢弃的旧数组
		this.requestSeq += 1;
		this.isLoading.value = false;
		this.session.clearAll(this.buildWelcome);
		this.mapContextApi.resetMapContextSession();
		this.message.success(this.t('chat.historyCleared'));
	};

	/** 导出对话为 Markdown */
	public exportConversation = () => {
		const md = this.session.exportAsMarkdown();
		if (!md || this.session.messages.value.length <= 1) {
			this.message.warning(this.t('chat.exportEmpty'));
			return;
		}
		const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = this.t('chat.exportFilename', { date: new Date().toISOString().slice(0, 10) });
		a.click();
		URL.revokeObjectURL(url);
		this.message.success(this.t('chat.exported'));
	};

	//#endregion

	//#region 配置面板

	public toggleUserConfig = async () => {
		this.showUserConfig.value = !this.showUserConfig.value;
		if (this.showUserConfig.value) {
			await this.config.loadUserConfig(false);
			await this.config.loadAvailableModels();
		}
	};

	/** 切回 chat tab 时刷新实时配额（5 秒节流，与发送末尾的刷新互斥） */
	private requestQuotaRefresh() {
		const now = Date.now();
		if (now - this.lastQuotaRefreshAt < 5000) return;
		this.lastQuotaRefreshAt = now;
		this.config.reloadAgentConfig(false);
	}

	//#endregion
}
