/**
 * 功能名称：账户中心 · 总览页签
 * 日    期：2026/11/13（范式化改造）
 * 说    明：个人统计 / 配额进度 / 站点实时数据 / 第三方访客口径 / 最近留言 / 管理员联系方式。
 */
import { computed, defineComponent, onMounted, ref, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { useLocale } from '@common/app/useLocale';
import { formatDateTime as formatDateTimeUtil } from '@common/utils/datetime';
import { fetchVisitorStats, formatUpdatedAt, formatVisitorNumber } from '@common/app/visitorStats';

/** 留言最大长度 */
const MESSAGE_MAX_LEN = 200;

/** 留言作者彩色首字头像的取色板 */
const AUTHOR_COLORS = ['#4caf50', '#2980b9', '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c'];

// 一、Emits
type EmitsType = ['submit-message'];

// 二、Props
const propDefine = {
	selfStats: { type: Object as PropType<any>, default: () => ({}) },
	quotaInfo: { type: Object as PropType<any>, default: () => ({}) },
	realtimeStats: { type: Object as PropType<any>, default: () => ({}) },
	adminContact: { type: String, default: '' },
	recentMessages: { type: Array as PropType<any[]>, default: () : any => [] },
	quotaText: { type: String, default: '' },
	sessionDurationText: { type: String, default: '' },
	isPostingMessage: { type: Boolean, default: false },
	/** 首次统计加载中（骨架屏；30s 轮询刷新不触发） */
	initialLoading: { type: Boolean, default: false },
} as const;

export type OverviewTabProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'OverviewTab',
	props: propDefine,
	emits: ['submit-message'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t!: (key: string, params?: Record<string, any>) => string;

	public messageMaxLen = MESSAGE_MAX_LEN;
	public newMessageText = ref('');
	public contactCopied = ref(false);
	public visitorSnapshot = ref<any>(null);

	public language: any;
	private contactCopiedTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private props: OverviewTabProps,
		private ctx: SetupContext<EmitsType>
	) {
		const { language, t } = useLocale();
		this.language = language;
		this.t = t;
		this.emit = this.ctx.emit;

		onMounted(async () => {
			this.visitorSnapshot.value = await fetchVisitorStats();
		});
	}

	//#region props 透传

	get selfStats() {
		return this.props.selfStats;
	}
	get quotaInfo() {
		return this.props.quotaInfo;
	}
	get realtimeStats() {
		return this.props.realtimeStats;
	}
	get adminContact() {
		return this.props.adminContact;
	}
	get recentMessages() {
		return this.props.recentMessages;
	}
	get quotaText() {
		return this.props.quotaText;
	}
	get sessionDurationText() {
		return this.props.sessionDurationText;
	}
	get isPostingMessage() {
		return this.props.isPostingMessage;
	}
	get initialLoading() {
		return this.props.initialLoading;
	}

	//#endregion

	//#region 派生

	public intlLocale = computed(() => (this.language.value === 'en-US' ? 'en-US' : 'zh-CN'));

	/** 注册陪伴天数（注册时间无效时返回 null） */
	public daysSinceRegister = computed(() => {
		const raw = String(this.props.selfStats?.registered_at || '').trim();
		if (!raw) return null;
		const registered = new Date(raw);
		if (Number.isNaN(registered.getTime())) return null;
		return Math.max(1, Math.ceil((Date.now() - registered.getTime()) / 86400000));
	});

	/** 在线用户数：优先实时 tracker 口径（含游客）；其次统一 online_users；最后 DB 会话数 */
	public displayOnlineUsers = computed(() => {
		const rt = this.props.realtimeStats || {};
		if (rt.realtime_online_users !== null && rt.realtime_online_users !== undefined) return rt.realtime_online_users;
		if (rt.online_users !== null && rt.online_users !== undefined) return rt.online_users;
		return rt.online_users_db || 0;
	});

	/**
	 * 第三方口径（51.la）：与后端口径并列展示。
	 * 两者统计范围不同（后端只覆盖本站 API 与已登录会话，51.la 覆盖全站 UV/PV），
	 * 必须分行并标注来源，避免被误读成「同一指标的两个不同数值」。
	 */
	public visitorLine = computed(() => {
		const metrics = this.visitorSnapshot.value?.metrics;
		if (!metrics) return null;
		const pick = (key: string) => (Number.isFinite(metrics[key]) ? formatVisitorNumber(metrics[key]) : '-');
		const line = { todayUsers: pick('todayUsers'), todayPv: pick('todayPv'), totalPv: pick('totalPv') };
		// 三个指标全缺时不渲染这一行，避免页面上出现一排「-」
		return Object.values(line).some((value) => value !== '-') ? line : null;
	});

	/** 数据新鲜度：与指标同行展示，让用户知道这组第三方数字是什么时候抓的 */
	public visitorUpdatedAt = computed(() => formatUpdatedAt(this.visitorSnapshot.value?.updatedAt));

	/** 配额使用百分比（不限额时返回 null） */
	public quotaPercent = computed(() => {
		const limit = Number(this.props.quotaInfo?.limit);
		if (!Number.isFinite(limit) || limit <= 0) return null;
		const used = Math.max(0, Number(this.props.quotaInfo?.used || 0));
		return Math.min(100, Math.round((used / limit) * 100));
	});

	/** 配额是否接近耗尽（>80% 转警示色） */
	public quotaWarning = computed(() => this.quotaPercent.value !== null && this.quotaPercent.value >= 80);

	//#endregion

	//#region 格式化

	/** 数字千分位格式化 */
	public formatNumber = (value: any) => {
		const num = Number(value || 0);
		return Number.isFinite(num) ? num.toLocaleString(this.intlLocale.value) : '0';
	};

	/** 相对时间：刚刚 / x 分钟前 / x 小时前 / 昨天 / 日期 */
	public formatRelativeTime = (value: any) => {
		const raw = String(value || '').trim();
		if (!raw) return '-';
		const parsed = new Date(raw);
		if (Number.isNaN(parsed.getTime())) return raw;

		const diff = Date.now() - parsed.getTime();
		if (diff < 60000) return this.t('overview.justNow');
		if (diff < 3600000) return this.t('overview.minutesAgo', { count: Math.floor(diff / 60000) });
		if (diff < 86400000 && new Date().toDateString() === parsed.toDateString()) {
			return this.t('overview.hoursAgo', { count: Math.floor(diff / 3600000) });
		}
		const yesterday = new Date(Date.now() - 86400000);
		if (parsed.toDateString() === yesterday.toDateString()) return this.t('overview.yesterday');
		return parsed.toLocaleDateString(this.intlLocale.value, { month: '2-digit', day: '2-digit' });
	};

	public formatDateTime = (value: any) => {
		// 空值显示 '-'，非法值原样展示（模板多处引用此名，保留本地包装）
		return formatDateTimeUtil(value, {
			locale: this.intlLocale.value,
			emptyText: '-',
			invalidText: null,
		} as any);
	};

	//#endregion

	//#region 留言作者头像

	/** 按用户名哈希取色，保证同一作者颜色稳定 */
	public authorColor = (name: any) => {
		const text = String(name || this.t('overview.anonymousInitial'));
		let hash = 0;
		for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 997;
		return AUTHOR_COLORS[hash % AUTHOR_COLORS.length];
	};

	public authorInitial = (name: any) => {
		const text = String(name || '').trim();
		return text ? text.slice(0, 1).toUpperCase() : this.t('overview.anonymousInitial');
	};

	//#endregion

	//#region 联系方式复制

	/** 复制成功后的按钮态切换（1.5s 还原） */
	private markContactCopied() {
		this.contactCopied.value = true;
		if (this.contactCopiedTimer) clearTimeout(this.contactCopiedTimer);
		this.contactCopiedTimer = setTimeout(() => {
			this.contactCopied.value = false;
			this.contactCopiedTimer = null;
		}, 1500);
	}

	/** 一键复制管理员联系方式（clipboard API 不可用时降级 execCommand） */
	public copyAdminContact = async () => {
		const text = String(this.props.adminContact || '').trim();
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			this.markContactCopied();
		} catch {
			// 非安全上下文（http 局域网访问）等场景 clipboard API 不可用，降级隐藏 textarea + execCommand
			try {
				const helper = document.createElement('textarea');
				helper.value = text;
				helper.setAttribute('readonly', '');
				helper.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
				document.body.appendChild(helper);
				helper.select();
				document.execCommand('copy');
				document.body.removeChild(helper);
				this.markContactCopied();
			} catch {
				/* 双通道均不可用则静默（联系方式仍可手动选中复制） */
			}
		}
	};

	//#endregion

	//#region 留言

	/** 第二参为成功回调：父组件 API 成功后才清空输入框，发布失败时保留草稿 */
	public handleSubmit = () => {
		const content = String(this.newMessageText.value || '').trim();
		if (!content) return;
		this.emit('submit-message', content, () => {
			this.newMessageText.value = '';
		});
	};

	//#endregion
}
