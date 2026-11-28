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
import { createCompassAgentTool } from '@common/chat/agent/agentCompassTool';
import { useCompassStore } from '@/stores';
import { readUserPositionFromCache } from '@common/map-view/services/userPositionCache';
import { getGlobalUserLocationContext } from '@common/map-view/services/userLocationContext';
import { buildSystemPromptWithTools } from '@common/chat/constants/agentToolsSchema';
import { selectToolsForMessage } from '@common/chat/constants/agentToolRouter';
import { resolveTileBasemapArg } from '@common/chat/constants/tileIntentPresets';
import { TILE_PROXY_BASE_URL } from '@/config/publicRuntime';
import type { BasemapQuickCommand } from '@common/chat/constants/basemapQuickCommands';
import { useChatStore } from '@common/chat/stores/useChatStore';

// 一、Emits
type EmitsType = ['close-chat'];

/**
 * 工具调用的稳定签名（V3.7.10）：键按字典序排序后序列化。
 *
 * 用于多轮编排的「重复调用」检测。直接 `JSON.stringify(args)` 对键顺序敏感，
 * 模型把 `{layerId, visible}` 写成 `{visible, layerId}` 就会被判为不同调用，
 * 护栏失效 → 原地打转烧 token。
 */
function stableToolSignature(
    calls: Array<{ name?: string; arguments?: unknown }>,
    view = '',
): string {
    const canon = (value: any): string => {
        if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
        if (value && typeof value === 'object') {
            return `{${Object.keys(value)
                .sort()
                .map((key) => `${key}:${canon(value[key])}`)
                .join(',')}}`;
        }
        return JSON.stringify(value ?? null);
    };
    return `${view}::${calls.map((call) => `${call?.name ?? ''}${canon(call?.arguments ?? {})}`).join('|')}`;
}

/**
 * V3.7.16：用户明确要求「导出/下载/保存文件」时，强制 export_layer_geojson 走
 * download 模式。模型偶尔会把「导出」误判为 inline 取文本，结果只返回一段
 * GeoJSON 而不触发浏览器下载；这里在编排层按用户原话兜底，避免误判。
 * 「看看要素/坐标/文本」等纯查看意图不强制，保留 inline。
 */
function forceDownloadModeForExport(calls: any[] | null, userMsg: string): any[] | null {
    if (!Array.isArray(calls) || calls.length === 0) return calls;
    const wantsFile = /(导出|下载|保存|存成|生成文件|\.geojson|geojson\s*文件)/i.test(userMsg);
    const wantsPlainText =
        /(看看|查看|显示|预览|文本|内容|坐标)/.test(userMsg) &&
        !/(下载|保存|文件|导出为|生成文件)/.test(userMsg);
    if (!wantsFile || wantsPlainText) return calls;

    return calls.map((call: any) =>
        call?.name === 'export_layer_geojson'
            ? { ...call, arguments: { ...(call.arguments || {}), mode: 'download' } }
            : call,
    );
}

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
		/**
		 * 消费其他面板投递的预置提问（如罗盘宫位面板的「问 AI 解释」）。
		 *
		 * 三个前置条件缺一不可，否则消息会被静默丢弃，故任一不满足时**不消费**、保留在队列：
		 * 1. 当前无在途请求（dispatchSend 遇 isLoading 会直接 return）
		 * 2. 服务已就绪（后端代理模式下 serviceReady=false 时同样 return）
		 * 3. 存在待发送文本
		 */
		const flushPendingPrompt = () => {
			if (this.isLoading.value) return;
			// 与 dispatchSend 的前置守卫保持一致：配额耗尽时不能被消费，否则提问静默丢失
			if (!this.config.isDefaultAIMode && !this.config.isPersonalMode && !this.config.serviceReady) return;
			if (!this.config.isDefaultAIMode && !this.config.isPersonalMode && this.config.quotaExhausted) return;
			const text = this.chatStore.consumePrompt();
			if (!text) return;
			void this.dispatchSend(text);
		};

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

			// 面板挂载前投递的提问在此消费（配置已就绪）
			flushPendingPrompt();
		});

		// 面板已挂载时：新投递的提问立即消费
		watch(() => this.chatStore.pendingPrompt, flushPendingPrompt);
		// 请求结束 / 服务就绪后补消费此前被条件拦下的提问
		watch(this.isLoading, (loading) => {
			if (!loading) flushPendingPrompt();
		});
		watch(
			() => this.config.serviceReady,
			(ready) => {
				if (ready) flushPendingPrompt();
			},
		);
		// 配额耗尽时保留队列，恢复后补发（与 dispatchSend 守卫对称）
		watch(
			() => this.config.quotaExhausted,
			(exhausted) => {
				if (!exhausted) flushPendingPrompt();
			},
		);

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
			// 罗盘工具由 chat 域装配：工具实现不反向依赖 compass store，
			// 这里注入 store 与无副作用地图快照即可（V3.7.10）
			const compassTool = createCompassAgentTool({
				compassStore: useCompassStore(),
				getMapContext: this.mapContextApi.captureMapContext,
			});
			this.gisCommander.value = createGISCommander({
				commandBus: this.agentMapCommandBus,
				compassEnable: compassTool.enableCompass,
				// 「附近的餐馆」需要当前视图中心做周边检索；这里传无副作用快照，避免推进 changesSinceLastTurn 基准
				getMapContext: this.mapContextApi.captureMapContext,
				// V3.7.9 只读能力：图层清单与 3D 测量结果由运行时桥聚合，
				// 命令总线只管变更，读取不产生任何画布副作用
				getLayers: this.mapContextApi.listLayers,
				getMeasureResult: this.mapContextApi.getMeasureResult,
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

	/** 中止当前流式请求的控制器（批次 E：stop 时真正断开上游连接） */
	public activeAbortController: AbortController | null = null;

	/** 停止生成（软取消：请求序号守卫，晚到的响应被忽略） */
	public stopGeneration = () => {
		if (!this.isLoading.value) return;
		this.requestSeq += 1;
		this.activeAbortController?.abort();
		this.activeAbortController = null;
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
		// V3.7.8：用户可见版摘要（无 JSON 载荷）——仅供空回复/失败回退展示；LLM 摘要仅供回传
		const userResultSummary = AgentExecutor.buildUserResultSummary(toolResults);

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
		return { toolResultSummary, userResultSummary, resultingMapContext };
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
		// 默认 AI / 个人 Key 模式不受配额限制；仅后端代理模式受配额限制。
		// V3.7.12：额度耗尽不得静默丢弃提问，必须给用户可见的终止提示。
		if (!this.config.isDefaultAIMode && !this.config.isPersonalMode && (!this.config.serviceReady || this.config.quotaExhausted)) {
			const quotaMsg = this.t('chat.quotaToolUnavailable');
			this.config.statusHint = quotaMsg;
			const idx = this.session.pushAssistant(quotaMsg);
			this.session.messages.value[idx].isError = true;
			this.session.schedulePersist();
			return;
		}

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
		const abort = new AbortController();
		this.activeAbortController = abort;
		const assistantMsgIndex = this.session.pushAssistant('');
		const list = this.session.messages.value;
		// V3.7.8：思考型模型的思考过程容器（onReasoning 增量写入，think-panel 渲染）
		list[assistantMsgIndex].reasoning = '';

		// ── 累计本轮对话各轮次的真实消耗（后端返回的 cost 折算值）──
		// 默认 AI 模式使用免费 LLM，不扣用户额度，无需累计消耗
		let totalCallCost = 0;
		this.config.lastCallCost = 0;

		try {
			// V3.7.16：按本轮用户意图选择工具子集，首轮与后续编排轮次复用同一集合。
			// 避免中途工具集变化导致模型引用不存在工具；空消息由路由返回全量兜底。
			const activeTools = selectToolsForMessage(userMsg);
			// V3.7.16：System Prompt 按工具集生成——罗盘机制段仅在含 enable_compass 时注入
			const systemPrompt = buildSystemPromptWithTools(
				new Set(activeTools.map((t: any) => t.function.name))
			);

			const firstRound = await this.config.callLLM({
				message: userMsg,
				history: requestHistory,
				locationContext: locationContextText,
				mapContext,
				systemPrompt,
				tools: activeTools,
				// V3.7.7 批次 E：默认 AI 通道走流式——增量直接写入消息列表渐进渲染
				onDelta: (accumulated: string) => {
					if (seq !== this.requestSeq) return;
					list[assistantMsgIndex].content = accumulated;
					this.messageListRef.value?.scrollToBottom(true);
				},
				// V3.7.8：思考型模型的思考增量 → 实时写入思考块
				onReasoning: (accumulated: string) => {
					if (seq !== this.requestSeq) return;
					list[assistantMsgIndex].reasoning = accumulated;
					this.messageListRef.value?.scrollToBottom(true);
				},
				signal: abort.signal,
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

			// 用户说「导出/下载」时，即使模型误选 inline 也强制走文件下载
			finalToolCalls = forceDownloadModeForExport(finalToolCalls, userMsg);

			if (finalToolCalls && finalToolCalls.length > 0 && this.agentExecutor.value) {
				const cleanReply = AgentExecutor.stripToolCallBlocks(reply);

				// V3.7.8 修复：流式期间原文（含 ```tool_call 块）已渐进写入气泡，落定时必须
				// 无条件以清洗结果覆盖（可为空）——回复仅由工具块组成时清洗结果为空串，
				// 旧逻辑跳过覆盖导致块原文永久残留；空串由 executeToolsAndUpdateUI 的
				// 空内容回收逻辑移除气泡。意图兜底时模型本就输出普通文本，保持原文。
				if (!isIntentFallback) {
					list[assistantMsgIndex].content = cleanReply;
				}

				const { toolResultSummary, userResultSummary, resultingMapContext } = await this.executeToolsAndUpdateUI(
					finalToolCalls,
					assistantMsgIndex
				);
				if (seq !== this.requestSeq) return;

				const toolResult = this.t('chat.toolResult');
				// V3.7.16：前端状态标签绝不能作为模型的历史发言。旧实现把
				// t('chat.toolExecuted')（即「[工具调用已执行]」）写进 assistant
				// 消息，模型会模仿自己的上一句，把占位标签当成最终答复并提前停止。
				const toolHandoffForLLM = `我已调用工具：${finalToolCalls.map((tc: any) => tc.name).join('、')}。工具结果见下一条消息。`;
				const toolRoundHistory = [
					...requestHistory,
					{ role: 'user', content: userMsg },
					{
						role: 'assistant',
						content: cleanReply ? `${cleanReply}\n\n${toolHandoffForLLM}` : toolHandoffForLLM,
					},
					{
						role: 'user',
						// 后续指令为 LLM 协议提示，不作为 UI 文案
						content: `${toolResult}\n${toolResultSummary}\n\n原始任务：${userMsg}\n请逐项核对原始任务：若仍有步骤未执行，下一步只输出下一个 tool_call 块；若全部完成，输出包含具体结果（地名、地址、图层详情等）的最终答复，并说明该任务是否改变了地图状态。不要输出执行状态占位语。`,
					},
				];

				// V3.7.10：由「一轮工具 + 一轮总结」改为多轮编排。
				// 原实现只把第二轮当最终回复：模型若在第二轮继续请求工具（典型的
				// list_layers → remove_layer），其 tool_calls 会被 stripToolCallBlocks
				// 清掉，表现为「列完图层就停」。现循环执行，直到模型不再请求工具。
				// V3.7.11：双视图定位（OL+Cesium）+ 启用罗盘需要 5~6 步，4 轮不足以闭环。
				// V3.7.15：复杂任务（多轮定位 + 图层核验 + 罗盘/分析）仍会超过 6 步，提升到 10；
				// 重复调用检测仍然保留，避免同一组参数原地打转。
				const MAX_TOOL_ROUNDS = 10;
				let pendingCalls: any[] = finalToolCalls;
				let pendingHistory: any[] = toolRoundHistory;
				let pendingMapContext = resultingMapContext;
				let lastUserResultSummary = userResultSummary;
				let roundNo = 1;
				let previousSignature = stableToolSignature(finalToolCalls, String(mapContext?.view || ''));

				while (pendingCalls.length > 0 && roundNo <= MAX_TOOL_ROUNDS) {
					// 每轮新建回复气泡；若本轮模型只返回工具调用，该空气泡会被
					// executeToolsAndUpdateUI 回收，避免残留
					const finalIdx = this.session.pushAssistant('');
					list[finalIdx].reasoning = '';

					let nextRound: any;
					try {
						nextRound = await this.config.callLLM({
							message: `原始任务：${userMsg}\n当前工具结果已在历史中。若仍有未完成步骤，下一步只输出下一个 tool_call 块；若全部完成，输出包含具体结果的最终答复，并说明是否改变了地图状态。不要输出执行状态占位语。`,
							history: pendingHistory.slice(-8),
							locationContext: '',
							mapContext: pendingMapContext,
							// 每轮都带完整系统提示词：约束（先 list_layers、不得伪称成功）必须跨轮一致
							systemPrompt: systemPrompt,
							// V3.7.16：复用首轮工具集，中途不重新筛选（防止模型引用不存在工具）
							tools: activeTools,
							onDelta: (accumulated: string) => {
								if (seq !== this.requestSeq) return;
								list[finalIdx].content = accumulated;
								this.messageListRef.value?.scrollToBottom(true);
							},
							onReasoning: (accumulated: string) => {
								if (seq !== this.requestSeq) return;
								list[finalIdx].reasoning = accumulated;
								this.messageListRef.value?.scrollToBottom(true);
							},
							signal: abort.signal,
						});
					} catch (roundErr: any) {
						if (roundErr?.isQuotaExceeded) {
							const quotaMsg = this.t('chat.quotaToolUnavailable');
							this.config.statusHint = quotaMsg;
							list[finalIdx].content = quotaMsg;
							list[finalIdx].isError = true;
							await this.config.reloadAgentConfig(false);
						} else if (!list[finalIdx]?.content) {
							list[finalIdx].content = `✅ ${this.t('chat.opDone')}：\n${lastUserResultSummary}`;
						}
						break;
					}
					if (seq !== this.requestSeq) return;

					if (nextRound.cost && !this.config.isDefaultAIMode) totalCallCost += nextRound.cost;
					if (nextRound.usedModel) this.config.modelName = nextRound.usedModel;

					const nextCalls = forceDownloadModeForExport(
						AgentExecutor.extractToolCalls(nextRound.rawData) || [],
						userMsg,
					) || [];
					const nextText = AgentExecutor.stripToolCallBlocks(nextRound.reply || '');

					// 模型不再请求工具 → 本次任务结束
					if (nextCalls.length === 0) {
						if (nextText) {
							if (nextRound.streamed) {
								list[finalIdx].content = nextText;
							} else {
								await this.typewriterReveal(finalIdx, nextText, seq);
							}
						} else {
							list[finalIdx].content = `✅ ${this.t('chat.opDone')}：\n${lastUserResultSummary}`;
						}
						pendingCalls = [];
						break;
					}

					// 还有后续工具：先落地本轮文本，再检查护栏
					if (nextText) list[finalIdx].content = nextText;

					const signature = stableToolSignature(
						nextCalls,
						String(pendingMapContext?.view || ''),
					);
					if (signature === previousSignature) {
						// 同一组调用重复出现 = 模型在原地打转，继续只会烧 token
						console.warn('[Chat] 检测到重复的工具调用，终止多轮编排');
						list[finalIdx].content =
							'⚠️ 检测到重复的工具调用，已中止以避免死循环。已执行结果见上方卡片；如需继续，请补充信息后再试。';
						break;
					}
					previousSignature = signature;

					if (roundNo >= MAX_TOOL_ROUNDS) {
						list[finalIdx].content =
							`⚠️ 已达单次对话最多 ${MAX_TOOL_ROUNDS} 步工具调用，任务可能尚未完成。已执行结果见上方卡片；如需继续，请再发一条指令。`;
						break;
					}
					roundNo++;

					const executed = await this.executeToolsAndUpdateUI(nextCalls, finalIdx);
					if (seq !== this.requestSeq) return;
					lastUserResultSummary = executed.userResultSummary;

					const toolResultLabel = this.t('chat.toolResult');
					const nextToolHandoff = `我已调用工具：${nextCalls.map((tc: any) => tc.name).join('、')}。工具结果见下一条消息。`;
					pendingHistory = [
						...pendingHistory,
						{
							role: 'assistant',
							content: nextText ? `${nextText}\n\n${nextToolHandoff}` : nextToolHandoff,
						},
						{
							role: 'user',
							content: `${toolResultLabel}\n${executed.toolResultSummary}\n\n原始任务：${userMsg}\n逐项核对原始任务：若仍有步骤未执行，下一步只输出下一个 tool_call 块；若全部完成，输出包含具体结果的最终答复，并说明是否改变了地图状态。不要输出执行状态占位语。`,
						},
					];
					pendingMapContext = executed.resultingMapContext;
					pendingCalls = nextCalls;
				}
			} else {
				// V3.7.7 批次 E：流式批次的内容已渐进呈现，直接落定；非流式保留打字机观感
				if (firstRound.streamed) {
					list[assistantMsgIndex].content = reply || this.t('chat.emptyReply');
				} else {
					await this.typewriterReveal(assistantMsgIndex, reply || this.t('chat.emptyReply'), seq);
				}
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
			if (error?.isQuotaExceeded) {
				const quotaMsg = this.t('chat.quotaToolUnavailable');
				list[assistantMsgIndex].content = quotaMsg;
				this.config.statusHint = quotaMsg;
				await this.config.reloadAgentConfig(false);
			} else {
				list[assistantMsgIndex].content = this.t('chat.requestFailed', { error: error.message });
			}
			list[assistantMsgIndex].isError = true;
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

	/**
	 * V3.7.16：底图切片预设快捷命令——本地解析 + 直接执行，零 LLM 调用。
	 * intent 文本取自规则表原文，解析仍走 tileIntentPresets（SSOT），
	 * 执行复用 executeToolsAndUpdateUI（TOC 注册、工具状态回显、地图上下文快照）。
	 */
	public handleQuickCommand = async (cmd: BasemapQuickCommand) => {
		if (this.isLoading.value || !cmd) return;

		// 1. 本地解析（与 switch_basemap(intent) 完全同一路径）
		const resolved = resolveTileBasemapArg(cmd.intent, TILE_PROXY_BASE_URL);
		if (resolved.error) {
			this.message.warning(`${this.t('chat.quickCommandFailed')}：${resolved.error}`);
			return;
		}
		if (!this.agentExecutor.value) {
			this.message.warning(this.t('chat.quickCommandFailed'));
			return;
		}

		// 2. 用户可见的命令回执：打 isQuickCommand 标记，
		//    buildEconomyContext / userTurnsCount 均排除，不污染 LLM 历史与轮次计数
		const label = this.t(cmd.labelKey);
		this.session.pushUser(label, { isQuickCommand: true });

		// 3. 直接执行 switch_basemap(intent)，复用工具链与结果回显
		//    V3.7.15：复用 requestSeq 守卫，避免"停止生成"后旧流程继续写消息
		const seq = ++this.requestSeq;
		this.isLoading.value = true;
		const assistantIdx = this.session.pushAssistant('');
		try {
			const { userResultSummary } = await this.executeToolsAndUpdateUI(
				[{ name: 'switch_basemap', arguments: { intent: cmd.intent } }],
				assistantIdx
			);
			if (seq !== this.requestSeq) return;
			// 取最后一条工具状态消息，避免误匹配历史中旧的 switch_basemap 回执
			const messages = this.session.messages.value;
			let statusMsg: any = null;
			for (let i = messages.length - 1; i >= 0; i--) {
				if (messages[i]?.role === 'assistant' && messages[i]?.isToolStatus) {
					statusMsg = messages[i];
					break;
				}
			}
			if (statusMsg?.toolCalls?.[0]?.status === 'success') {
				this.message.success(`${this.t('chat.quickCommandDone')}：${label}`);
			} else {
				this.message.warning(`${this.t('chat.quickCommandFailed')}：${userResultSummary}`);
			}
		} catch (err) {
			if (seq !== this.requestSeq) return;
			this.message.warning(`${this.t('chat.quickCommandFailed')}：${(err as Error)?.message || ''}`);
		} finally {
			if (seq === this.requestSeq) {
				this.isLoading.value = false;
				this.session.schedulePersist();
				this.messageListRef.value?.scrollToBottom(false);
			}
		}
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
