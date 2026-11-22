/**
 * 功能名称：对话消息列表（ChatMessageList）实例层
 * 日    期：2026/11/14
 * 说    明：负责消息流 Markdown 缓存渲染、思考块展开、跨天分隔线、复制消息、
 *          智能粘底滚动与未读计数徽标。
 */
import {
	computed,
	defineComponent,
	nextTick,
	onUnmounted,
	ref,
	watch,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
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
} from '@lucide/vue';
import 'highlight.js/styles/github-dark-dimmed.css';
import 'katex/dist/katex.min.css';
import { useMarkdownRenderer } from '@common/utils/useMarkdownRenderer';
import { formatTimeShort } from '@common/utils/datetime';
import { useLocale } from '@common/app/useLocale';

type EmitsType = ('suggest' | 'regenerate')[];

const propDefine = {
	/** 会话消息列表（含时间戳/工具状态卡） */
	messages: { type: Array as PropType<any[]>, required: true as const },
	/** 是否正在等待 LLM 回复 */
	isLoading: { type: Boolean, default: false },
} as const;

export type ChatMessageListProps = ExtractPropTypes<typeof propDefine>;

const NEAR_BOTTOM_PX = 80;
/** 思考块内层跟随阈值：距底超过此值视为用户主动上翻，本次增量不跟随 */
const THINK_FOLLOW_PX = 24;

export default defineComponent({
	name: 'ChatMessageList',
	components: {
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
	},
	props: propDefine,
	emits: ['suggest', 'regenerate'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t: ReturnType<typeof useLocale>['t'];
	public hasThinkContent: ReturnType<typeof useMarkdownRenderer>['hasThinkContent'];
	private renderAnswerHtml: ReturnType<typeof useMarkdownRenderer>['renderAnswerHtml'];
	private renderThinkHtml: ReturnType<typeof useMarkdownRenderer>['renderThinkHtml'];
	private ready: ReturnType<typeof useMarkdownRenderer>['ready'];

	public chatBody = ref<HTMLElement | null>(null);
	public showScrollFab = ref(false);
	public scrolledFromTop = ref(false);
	public copiedIndex = ref(-1);
	public unseenCount = ref(0);
	private copiedTimer: ReturnType<typeof setTimeout> | null = null;
	private htmlCache = new Map<string, string>();
	/** 思考块内层滚动容器登记表（key = 消息下标，由模板函数式 ref 维护） */
	private thinkBodies = new Map<number, HTMLElement>();
	/** 已完成首次贴底的容器：首次出现时无条件跟随，避免首个超长增量被误判为用户上翻 */
	private thinkPrimed = new Set<number>();

	public formatTime = formatTimeShort;

	get messages() {
		return this.props.messages;
	}
	get isLoading() {
		return this.props.isLoading;
	}

	public suggestions = computed(() => [
		this.t('chat.suggestions.locate'),
		this.t('chat.suggestions.switchBase'),
		this.t('chat.suggestions.search'),
		this.t('chat.suggestions.weather'),
	]);

	public heroMode = computed(() => this.props.messages.length <= 1 && !this.props.isLoading);

	public heroSubtitle = computed(() => {
		const text = String(this.props.messages[0]?.content || '').trim();
		return text || this.t('chat.heroSubtitle');
	});

	constructor(
		private props: ChatMessageListProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		const { t } = useLocale();
		this.t = t;
		const md = useMarkdownRenderer();
		this.renderAnswerHtml = md.renderAnswerHtml;
		this.renderThinkHtml = md.renderThinkHtml;
		this.hasThinkContent = md.hasThinkContent;
		this.ready = md.ready;

		this.init();
	}

	private init() {
		watch(
			() => this.props.messages.length,
			(next, prev) => {
				if (typeof prev === 'number' && next > prev && !this.isNearBottom()) {
					this.unseenCount.value += next - prev;
				}
				this.scrollToBottom(false);
			},
		);

		watch(
			() => this.props.isLoading,
			() => this.scrollToBottom(false),
		);

		onUnmounted(() => {
			if (this.copiedTimer) {
				clearTimeout(this.copiedTimer);
				this.copiedTimer = null;
			}
			this.thinkBodies.clear();
			this.thinkPrimed.clear();
		});
	}

	private cachedRender(prefix: string, content: string, renderFn: (c: string) => string) {
		const key = `${this.ready.value ? 1 : 0}|${prefix}|${content}`;
		const hit = this.htmlCache.get(key);
		if (hit !== undefined) return hit;
		const html = renderFn(content);
		if (this.htmlCache.size > 400) this.htmlCache.clear();
		this.htmlCache.set(key, html);
		return html;
	}

	public renderAnswer = (content: any) =>
		this.cachedRender('a', String(content || ''), this.renderAnswerHtml);

	public renderThink = (content: any) =>
		this.cachedRender('t', String(content || ''), this.renderThinkHtml);

	private isNearBottom() {
		const el = this.chatBody.value;
		if (!el) return true;
		return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
	}

	/**
	 * 登记 / 注销思考块内层滚动容器（模板函数式 ref 回调）。
	 * @param index 消息下标（v-for index），作为容器唯一键
	 * @param el    DOM 元素；元素卸载时 Vue 传入 null，此时从登记表移除
	 */
	public bindThinkBody = (index: number, el: unknown) => {
		if (el instanceof HTMLElement) {
			this.thinkBodies.set(index, el);
			return;
		}
		this.thinkBodies.delete(index);
		this.thinkPrimed.delete(index);
	};

	/**
	 * 采样各思考容器「当前是否已贴底」。
	 * 必须在 DOM 更新前调用——此时 scrollHeight 仍是本轮增量写入前的旧值，
	 * 才能把「内容一次变长很多」与「用户主动上翻」区分开。
	 * @param force 为 true 时无条件判定跟随（「回到底部」按钮语义）
	 * @returns 消息下标 → 下一次 DOM 更新后是否继续跟随
	 */
	private captureThinkFollowFlags(force = false) {
		const flags = new Map<number, boolean>();
		this.thinkBodies.forEach((node, index) => {
			if (!node.isConnected) return;
			const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
			// 首次出现的容器尚未被驱动过，无条件贴底；折叠态（scrollHeight=0）距离为负，
			// 亦天然判为跟随，写入无副作用
			flags.set(index, force || !this.thinkPrimed.has(index) || distance < THINK_FOLLOW_PX);
		});
		return flags;
	}

	/**
	 * DOM 更新完成后，把仍处于跟随状态的思考容器滚到最底部。
	 * @param flags captureThinkFollowFlags 的采样结果
	 */
	private applyThinkFollow(flags: Map<number, boolean>) {
		flags.forEach((follow, index) => {
			if (!follow) return;
			const node = this.thinkBodies.get(index);
			if (!node?.isConnected) return;
			node.scrollTop = node.scrollHeight;
			this.thinkPrimed.add(index);
		});
	}

	/**
	 * 滚动消息列表到底部，并同步思考块内层滚动位置。
	 * @param force      无视「近底」判断强制外层到底（流式增量调用）
	 * @param forceThink 同时强制思考块内层到底（用户点「回到底部」时调用）
	 */
	public scrollToBottom = (force = false, forceThink = false) => {
		// 同步阶段 DOM 尚未更新：先按旧内容采样内层跟随状态
		const thinkFlags = this.captureThinkFollowFlags(forceThink);
		nextTick(() => {
			const el = this.chatBody.value;
			if (el) {
				if (force || this.isNearBottom()) {
					el.scrollTop = el.scrollHeight;
					this.unseenCount.value = 0;
				}
			}
			this.applyThinkFollow(thinkFlags);
		});
	};

	/** 「回到底部」悬浮钮入口：外层消息流与思考块内层一并强制到底 */
	public scrollToLatest = () => this.scrollToBottom(true, true);

	public onScroll = () => {
		const near = this.isNearBottom();
		this.showScrollFab.value = !near;
		if (near) this.unseenCount.value = 0;
		const el = this.chatBody.value;
		this.scrolledFromTop.value = !!el && el.scrollTop > 4;
	};

	public needDayDivider = (index: number) => {
		const cur = this.props.messages[index]?.time;
		if (!cur) return false;
		if (index === 0) return true;
		const prev = this.props.messages[index - 1]?.time;
		if (!prev) return false;
		return new Date(cur).toDateString() !== new Date(prev).toDateString();
	};

	public dayLabel = (ts: any) => {
		const d = new Date(Number(ts) || 0);
		if (Number.isNaN(d.getTime())) return '';
		const today = new Date();
		const yesterday = new Date(today.getTime() - 86400000);
		if (d.toDateString() === today.toDateString()) return this.t('chat.today');
		if (d.toDateString() === yesterday.toDateString()) return this.t('chat.yesterday');
		return this.t('chat.monthDay', { m: d.getMonth() + 1, d: d.getDate() });
	};

	public canRegenerate = (index: number) => {
		if (this.props.isLoading || index === 0) return false;
		if (index !== this.props.messages.length - 1) return false;
		return this.props.messages.some((m: any) => m.role === 'user');
	};

	public copyMessage = async (msg: any, index: number) => {
		const raw = String(msg?.content || '');
		const text =
			msg?.role === 'assistant'
				? raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || raw
				: raw;
		try {
			await navigator.clipboard.writeText(text);
			this.copiedIndex.value = index;
			if (this.copiedTimer) clearTimeout(this.copiedTimer);
			this.copiedTimer = setTimeout(() => {
				this.copiedIndex.value = -1;
				this.copiedTimer = null;
			}, 1500);
		} catch {
			/* clipboard 不可用时静默忽略 */
		}
	};
}
