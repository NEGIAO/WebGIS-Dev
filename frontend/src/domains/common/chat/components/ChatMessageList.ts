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

	public scrollToBottom = (force = false) => {
		nextTick(() => {
			const el = this.chatBody.value;
			if (!el) return;
			if (force || this.isNearBottom()) {
				el.scrollTop = el.scrollHeight;
				this.unseenCount.value = 0;
			}
		});
	};

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
