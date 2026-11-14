/**
 * 功能名称：落地页（宣传主页）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：首屏 Hero / 核心功能 / 技术栈 / 开源认可 / CTA / 页脚。
 *          逻辑集中在：语言切换、访客与 GitHub 数据（缓存先行 + 后台 revalidate）、
 *          数字滚动、入场动效、锚点 scroll spy、移动端全屏菜单。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, type ExtractPropTypes, type SetupContext } from 'vue';
import { useRouter } from 'vue-router';
import { useLocale } from '@common/app/useLocale';
// 深导入：落地页是首屏路由，禁止经 '../stores' 聚合桶（`export *` 14 个 store）取 store，
// 否则 OL / chat / data-import 等无关 store 图会被整体拖进入口 chunk。
import { useUserPreferencesStore } from '@common/user/stores/useUserPreferencesStore';
import { useRingPatternStyle } from './composables/useRingPatternStyle';
import { useSpinBoost } from './composables/useSpinBoost';
import { useViewTransitionNavigation } from './composables/useViewTransitionNavigation';
import { armRegisterPrefetch, isRegisterRouteReady, prefetchRegisterRoute } from './composables/useRoutePrefetch';
import { fetchVisitorStats, formatUpdatedAt, formatVisitorNumber } from '@common/app/visitorStats';
import { ASSET_BASE_URL } from '../config/publicRuntime';
import {
	GITHUB_MARK_PATH,
	GITHUB_PAGE_URL,
	STAR_HISTORY_PAGE_URL,
	useLandingGithubAndVersion,
} from './composables/useLandingGithubAndVersion';
import {
	Bot,
	Building2,
	ChartArea,
	ChevronRight,
	Cloud,
	CloudSun,
	Crosshair,
	ExternalLink,
	FileUp,
	GitFork,
	Globe,
	IdCard,
	Layers,
	LogIn,
	Mail,
	Map,
	MapPinned,
	Rocket,
	Route,
	Send,
	ShieldCheck,
	Star,
	UserRound,
	Wrench,
	X,
	Zap,
} from '@lucide/vue';
import SectionTitle from './components/SectionTitle.vue';

// 一、Emits（本组件无对外事件）
type EmitsType = [];

// 二、Props（本组件无入参）
const propDefine = {} as const;

export type LandingViewProps = ExtractPropTypes<typeof propDefine>;

// 语言切换器标签用固定文案（各自母语书写），不依赖懒加载 i18n chunk
const LANGUAGE_OPTIONS = Object.freeze([
	{ value: 'zh-CN', label: '中文' },
	{ value: 'en-US', label: 'EN' },
]);

/** 访客指标顺序由字面量顺序决定，不依赖 JSON 键序（键序在 JS 里不是契约） */
const VISITOR_LABEL_KEYS: Record<string, string> = {
	activeRecent: 'visitorActiveRecent',
	todayUsers: 'visitorTodayUsers',
	todayPv: 'visitorTodayPv',
	yesterdayUsers: 'visitorYesterdayUsers',
	yesterdayPv: 'visitorYesterdayPv',
	monthPv: 'visitorMonthPv',
	totalPv: 'visitorTotalPv',
};

/** 核心功能卡片：图标 + i18n key，避免 10 段近似模板重复 */
const FEATURES = Object.freeze([
	// hero = 桌面 3 列网格里的主卡：跨 2 列 2 行，让 10 张等宽卡出现主次
	{ key: 'feature1', icon: Globe, hero: true },
	{ key: 'feature2', icon: Layers },
	{ key: 'feature3', icon: FileUp },
	{ key: 'feature4', icon: ChartArea },
	{ key: 'feature5', icon: CloudSun },
	{ key: 'feature6', icon: Route },
	{ key: 'feature7', icon: Bot },
	{ key: 'feature8', icon: ShieldCheck },
	{ key: 'feature9', icon: Wrench },
	// 末尾两张卡各跨满整行，呈横向汇总卡：3 列下 4（主卡 2×2）+ 8 + 3 + 3 = 18 格
	{ key: 'feature10', icon: Building2, wide: true },
	{ key: 'feature11', icon: Crosshair, wide: true },
]);

/** Hero 统计条：可量化项（num 非空）进入视口时从 0 滚到目标值 */
const HERO_STATS = Object.freeze([
	{ value: '2D/3D', labelKey: 'landing.statDualEngine' },
	{ num: 80, suffix: '+', labelKey: 'landing.statBasemaps' },
	{ num: 8, suffix: '', labelKey: 'landing.statAnalysis' },
	{ value: 'AI', labelKey: 'landing.statAi' },
]);

/** 技术栈：按「渲染画面 → 提供服务 → 交付上线」三层组织 */
const TECH_LAYERS = Object.freeze([
	{
		no: '01',
		en: 'Map Rendering',
		nameKey: 'landing.techLayerRender',
		roleKey: 'landing.techLayerRenderRole',
		tagsKey: 'landing.techLayerRenderTags',
		items: Object.freeze([
			{ fa: 'fab fa-vuejs', label: 'Vue 3.5', dutyKey: 'landing.techVue' },
			{ icon: Map, label: 'OpenLayers 10', dutyKey: 'landing.techOpenLayers' },
			{ icon: Globe, label: 'Cesium 1.132', dutyKey: 'landing.techCesium' },
		]),
	},
	{
		no: '02',
		en: 'Geospatial Service',
		nameKey: 'landing.techLayerService',
		roleKey: 'landing.techLayerServiceRole',
		tagsKey: 'landing.techLayerServiceTags',
		items: Object.freeze([
			{ icon: Zap, label: 'FastAPI', dutyKey: 'landing.techFastapi' },
			{ icon: Cloud, label: 'Hugging Face', dutyKey: 'landing.techHuggingFace' },
		]),
	},
	{
		no: '03',
		en: 'Build & Delivery',
		nameKey: 'landing.techLayerShip',
		roleKey: 'landing.techLayerShipRole',
		tagsKey: 'landing.techLayerShipTags',
		items: Object.freeze([
			{ fa: 'fab fa-docker', label: 'Docker', dutyKey: 'landing.techDocker' },
			{ fa: 'fab fa-github', label: 'GitHub Pages', dutyKey: 'landing.techGithubPages' },
		]),
	},
]);

/** 导航锚点 */
const NAV_ANCHORS = Object.freeze([
	{ id: 'features', labelKey: 'landing.navFeatures' },
	{ id: 'tech', labelKey: 'landing.navTech' },
	{ id: 'oss', labelKey: 'landing.navOss' },
]);

/** 与 CSS scroll-margin-top 派生值保持一致：导航栏定高 + 12px 呼吸位 */
const NAV_SCROLL_OFFSET = 76;

// 三、组件注册入口
export default defineComponent({
	name: 'LandingView',
	// 模板以标签形式直接使用的图标，必须显式注册（<script src> 无编译期自动注入）
	components: { SectionTitle, Bot, Building2, ChartArea, ChevronRight, Cloud, CloudSun, Crosshair, ExternalLink, FileUp, GitFork, Globe, IdCard, Layers, LogIn, Mail, MapPinned, Rocket, Route, Send, ShieldCheck, Star, UserRound, Wrench, X, Zap },
	props: propDefine,
	emits: [],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {


	// ── 静态数据（模板直接消费） ──
	public languageOptions = LANGUAGE_OPTIONS;
	public navAnchors = NAV_ANCHORS;
	public githubMarkPath = GITHUB_MARK_PATH;
	public githubPageUrl = GITHUB_PAGE_URL;
	public starHistoryPageUrl = STAR_HISTORY_PAGE_URL;
	public navScrollOffset = NAV_SCROLL_OFFSET;

	// ── 品牌资源 ──
	public logoUrl = '';
	public previewUrl = '';
	public hfLogoUrl = '';
	public brandBadgeStyle: Record<string, string> = {};

	// ── 访客统计 ──
	public visitorSnapshot = ref<any>(null);

	// ── 数字滚动 ──
	public statDisplay = ref<number[]>([]);
	public heroStatsEl = ref<HTMLElement | null>(null);
	public heroBgEl = ref<HTMLElement | null>(null);
	public ctaBgEl = ref<HTMLElement | null>(null);
	public featuresGridEl = ref<HTMLElement | null>(null);
	public landingEl = ref<HTMLElement | null>(null);

	// ── GitHub 与版本号（委托 useLandingGithubAndVersion） ──
	public githubStars!: ReturnType<typeof useLandingGithubAndVersion>['githubStars'];
	public githubForks!: ReturnType<typeof useLandingGithubAndVersion>['githubForks'];
	public githubUpdatedAt!: ReturnType<typeof useLandingGithubAndVersion>['githubUpdatedAt'];
	public githubIsLive!: ReturnType<typeof useLandingGithubAndVersion>['githubIsLive'];
	public isNarrowViewport = ref(
		typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches
	);
	public chartUseFallback!: ReturnType<typeof useLandingGithubAndVersion>['chartUseFallback'];
	public chartDead!: ReturnType<typeof useLandingGithubAndVersion>['chartDead'];
	public appVersion!: ReturnType<typeof useLandingGithubAndVersion>['appVersion'];
	public formattedStars!: ReturnType<typeof useLandingGithubAndVersion>['formattedStars'];
	public formattedForks!: ReturnType<typeof useLandingGithubAndVersion>['formattedForks'];
	public starChartSrc!: ReturnType<typeof useLandingGithubAndVersion>['starChartSrc'];
	public githubUpdatedParts!: ReturnType<typeof useLandingGithubAndVersion>['githubUpdatedParts'];
	public ossOriginText!: ReturnType<typeof useLandingGithubAndVersion>['ossOriginText'];
	public formatCount!: ReturnType<typeof useLandingGithubAndVersion>['formatCount'];
	public onChartError!: ReturnType<typeof useLandingGithubAndVersion>['onChartError'];
	public fetchGithubStats!: ReturnType<typeof useLandingGithubAndVersion>['fetchGithubStats'];
	public parseVersionFromReadme!: ReturnType<typeof useLandingGithubAndVersion>['parseVersionFromReadme'];
	public fetchAppVersion!: ReturnType<typeof useLandingGithubAndVersion>['fetchAppVersion'];
	public applyLocalCaches!: ReturnType<typeof useLandingGithubAndVersion>['applyLocalCaches'];
	public fetchViaWorker!: ReturnType<typeof useLandingGithubAndVersion>['fetchViaWorker'];

	// ── 导航与菜单 ──
	public activeAnchor = ref('');
	public navScrolled = ref(false);
	public menuOpen = ref(false);
	public expandedMobileMenuGroups = ref(new Set<string>());

	// ── 动效 composable ──
	public heroSpin: any;
	public ctaSpin: any;
	public goRegister: any;

	public t!: (key: string, params?: Record<string, any>) => string;
	public language: any;

	private userPreferencesStore: ReturnType<typeof useUserPreferencesStore>;
	private router: ReturnType<typeof useRouter>;

	private statObserver: IntersectionObserver | null = null;
	private statRafId = 0;
	private featureObserver: IntersectionObserver | null = null;
	private revealObserver: IntersectionObserver | null = null;
	private anchorObserver: IntersectionObserver | null = null;
	private viewportMediaQuery: MediaQueryList | null = null;
	/** 空闲预取的取消函数（卸载时清理，避免回调打到已卸载页面） */
	private cancelRegisterPrefetch: (() => void) | null = null;

	constructor(
		_props: LandingViewProps,
		_ctx: SetupContext<EmitsType>
	) {
		const { t, language } = useLocale();
		this.t = t;
		this.language = language;
		this.userPreferencesStore = useUserPreferencesStore();
		this.router = useRouter();

		const normalizedBase = ASSET_BASE_URL.endsWith('/') ? ASSET_BASE_URL : `${ASSET_BASE_URL}/`;
		this.logoUrl = `${normalizedBase}images/icon.webp`;
		this.previewUrl = `${normalizedBase}images/preview.webp`;
		this.hfLogoUrl = `${normalizedBase}images/hf-logo.svg`;
		// URL 不进自定义属性：品牌徽牌 mask-image 走行内样式，轨道环纹样走文档级 <style> 注入
		this.brandBadgeStyle = {
			'-webkit-mask-image': `url('${this.logoUrl}')`,
			'mask-image': `url('${this.logoUrl}')`,
		};

		// 轨道环纹样：与认证页共用注入实现，styleId / 选择器保持历史原值
		useRingPatternStyle({
			styleId: 'landing-ring-pattern-style',
			scope: '.hero-bg__rings',
			ringClass: 'hero-bg__ring',
		});

		this.heroSpin = useSpinBoost(() => this.heroBgEl.value);
		this.ctaSpin = useSpinBoost(() => this.ctaBgEl.value);
		this.goRegister = useViewTransitionNavigation(this.router, { ready: isRegisterRouteReady });

		const gh = useLandingGithubAndVersion({ language: this.language, t: this.t });
		this.githubStars = gh.githubStars;
		this.githubForks = gh.githubForks;
		this.githubUpdatedAt = gh.githubUpdatedAt;
		this.githubIsLive = gh.githubIsLive;
		this.chartUseFallback = gh.chartUseFallback;
		this.chartDead = gh.chartDead;
		this.appVersion = gh.appVersion;
		this.formattedStars = gh.formattedStars;
		this.formattedForks = gh.formattedForks;
		this.starChartSrc = gh.starChartSrc;
		this.githubUpdatedParts = gh.githubUpdatedParts;
		this.ossOriginText = gh.ossOriginText;
		this.formatCount = gh.formatCount;
		this.onChartError = gh.onChartError;
		this.fetchGithubStats = gh.fetchGithubStats;
		this.parseVersionFromReadme = gh.parseVersionFromReadme;
		this.fetchAppVersion = gh.fetchAppVersion;
		this.applyLocalCaches = gh.applyLocalCaches;
		this.fetchViaWorker = gh.fetchViaWorker;

		this.init();
	}

	//#region 派生

	public visitorStats = computed(() => {
		const metrics = this.visitorSnapshot.value?.metrics;
		if (!metrics) return [];
		return Object.keys(VISITOR_LABEL_KEYS)
			.filter((key) => Number.isFinite(metrics[key]))
			.map((key) => ({
				key,
				label: this.t(`landing.${VISITOR_LABEL_KEYS[key]}`),
				text: formatVisitorNumber(metrics[key]),
			}));
	});

	/** 数据新鲜度：接口时间是北京时间，按访客本地时区渲染；不可解析时为空串 → 整段不渲染 */
	public visitorUpdatedAt = computed(() => formatUpdatedAt(this.visitorSnapshot.value?.updatedAt));

	public features = computed(() =>
		FEATURES.map((feature, index) => ({
			...feature,
			// 序号章：两位补零，纯装饰性，模板配 aria-hidden
			no: String(index + 1).padStart(2, '0'),
			title: this.t(`landing.${feature.key}Title`),
			desc: this.t(`landing.${feature.key}Desc`),
		}))
	);

	/** 徽章行：拍平三层，顺序与卡片一致 */
	public TECH_STACK = computed(() => TECH_LAYERS.flatMap((layer) => layer.items));

	public techLayers = computed(() =>
		TECH_LAYERS.map((layer) => ({
			no: layer.no,
			en: layer.en,
			name: this.t(layer.nameKey),
			role: this.t(layer.roleKey),
			tags: this.t(layer.tagsKey),
			items: layer.items.map((item: any) => ({ ...item, duty: this.t(item.dutyKey) })),
		}))
	);

	public heroStats = computed(() => HERO_STATS.map((stat: any) => ({ ...stat, label: this.t(stat.labelKey) })));

	/** 移动端两级菜单：子项都指向页面上真实存在的锚点 */
	public MOBILE_MENU = computed(() => [
		{
			id: 'features',
			label: this.t('landing.navFeatures'),
			children: this.features.value.map((f: any) => ({ id: `feature-${f.no}`, label: f.title })),
		},
		{
			id: 'tech',
			label: this.t('landing.navTech'),
			children: this.techLayers.value.map((layer: any) => ({ id: `tech-layer-${layer.no}`, label: layer.name })),
		},
		// 开源支持是叶子：内部只有一条求 Star/Fork 的引导条，没有可再分的锚点
		{ id: 'oss', label: this.t('landing.navOss'), children: [] },
	]);

	//#endregion

	//#region 生命周期

	private init() {
		onMounted(() => {
			this.applyLocalCaches(); // 本地缓存秒开，首屏不等待任何网络
			this.cancelRegisterPrefetch = armRegisterPrefetch();
			this.observeAnchors();
			this.observeStats();
			this.observeFeatures();
			this.observeReveal();
			this.observeViewportQuery();
			window.addEventListener('keydown', this.onMenuKeydown);
			// 导航透明/玻璃底的滚动判定：passive，不参与滚动主流程
			this.landingEl.value?.addEventListener('scroll', this.onLandingScroll, { passive: true });
			this.onLandingScroll(); // 首帧同步（带 hash 直接落在锚点时，初值不能是「未滚动」）
			// 51.la 访客数据：装饰性取数，与 GitHub 链路并行且不受 Worker 命中分支影响；
			// 失败返回 null，页脚 v-if 自动不渲染（与重构前 onMounted 行为一致）
			void fetchVisitorStats().then((snapshot) => {
				this.visitorSnapshot.value = snapshot;
			});
			void (async () => {
				if (await this.fetchViaWorker()) return; // Worker 命中则不再打扰 GitHub
				void this.fetchGithubStats();
				void this.fetchAppVersion();
			})();
		});

		onBeforeUnmount(() => {
			if (this.cancelRegisterPrefetch) {
				this.cancelRegisterPrefetch();
				this.cancelRegisterPrefetch = null;
			}
			this.anchorObserver?.disconnect();
			this.anchorObserver = null;
			this.disconnectStats();
			this.disconnectFeatures();
			this.disconnectReveal();
			window.removeEventListener('keydown', this.onMenuKeydown);
			this.landingEl.value?.removeEventListener('scroll', this.onLandingScroll);
			this.disconnectViewportQuery();
			if (this.landingEl.value) this.landingEl.value.style.overflowY = '';
		});
	}

	//#endregion

	//#region 语言与入口

	/** 与账号中心偏好同一全局开关：本机 SSOT + 登录后回写远端 */
	public switchLanguage = (nextLanguage: string) => {
		if (!nextLanguage || nextLanguage === this.language.value) return;
		void this.userPreferencesStore.setLanguagePreference(nextLanguage);
	};

	/** 三个入口的意图预取：hover / 聚焦 / 触摸按下时提前拉注册页资源（幂等） */
	public warmRegisterOnIntent = () => {
		prefetchRegisterRoute({ withSession: true });
	};

	/** 只拦截左键无修饰键的点击，其余保留浏览器原生行为（新标签打开等） */
	public onRegisterClick = (event: MouseEvent) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
		event.preventDefault();
		void this.goRegister('/register', event.currentTarget);
	};

	//#endregion

	//#region 数字滚动

	private rollStatsToFinal() {
		const targets = this.heroStats.value.map((stat: any) => (stat.num != null ? stat.num : null));
		const duration = 1100;
		const startTime = performance.now();
		const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
		const tick = (now: number) => {
			const progress = Math.min(1, (now - startTime) / duration);
			const eased = easeOutCubic(progress);
			this.statDisplay.value = targets.map((target: number | null) => (target == null ? 0 : Math.round(target * eased)));
			if (progress < 1) this.statRafId = requestAnimationFrame(tick);
		};
		this.statRafId = requestAnimationFrame(tick);
	}

	/**
	 * 进入视口才滚动。初始化即终值：reduced-motion / 无 IntersectionObserver 直接看到正确数字；
	 * 允许动效时在首帧绘制前归零，也无可见闪烁。
	 */
	public observeStats = () => {
		const prefersReduced =
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const canObserve = typeof IntersectionObserver === 'function';
		if (prefersReduced || !canObserve || !this.heroStatsEl.value) return;
		this.statDisplay.value = this.heroStats.value.map(() => 0);
		this.statObserver = new IntersectionObserver(
			(entries, observer) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					this.rollStatsToFinal();
					observer.disconnect();
					this.statObserver = null;
				}
			},
			{ threshold: 0.4 }
		);
		this.statObserver.observe(this.heroStatsEl.value);
	};

	public disconnectStats = () => {
		if (this.statObserver) {
			this.statObserver.disconnect();
			this.statObserver = null;
		}
		if (this.statRafId) {
			cancelAnimationFrame(this.statRafId);
			this.statRafId = 0;
		}
	};

	//#endregion

	//#region 入场动效

	/** 核心功能卡：三栏分左右对称入场；reduced-motion / 无 IO 时不加隐藏类，卡片常显 */
	public observeFeatures = () => {
		const prefersReduced =
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const el = this.featuresGridEl.value;
		if (prefersReduced || typeof IntersectionObserver !== 'function' || !el) return;
		el.classList.add('features-reveal');
		this.featureObserver = new IntersectionObserver(
			(entries, observer) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					const cards = el.querySelectorAll('.feature-card');
					cards.forEach((card: Element, i: number) => {
						// 错峰：列向 0/0.06/0.12s + 行向每排 +0.08s，呈对角线展开
						const col = i % 3;
						const row = Math.floor(i / 3);
						(card as HTMLElement).style.transitionDelay = `${col * 0.06 + row * 0.08}s`;
					});
					el.classList.add('in-view');
					observer.disconnect();
					this.featureObserver = null;
				}
			},
			{ threshold: 0.12 }
		);
		this.featureObserver.observe(el);
	};

	public disconnectFeatures = () => {
		if (this.featureObserver) {
			this.featureObserver.disconnect();
			this.featureObserver = null;
		}
	};

	/** 统一入场动效（fadeInUp once）：进入视口加 .reveal-in 后解除观察 */
	public observeReveal = () => {
		const prefersReduced =
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReduced || typeof IntersectionObserver !== 'function') return;
		const targets = document.querySelectorAll(
			'.section-head, .tech-badges, .oss-support, .cta-card, .footer-quick, .footer-rule, .footer-meta'
		);
		if (!targets.length) return;
		targets.forEach((target) => target.classList.add('reveal-pending'));
		this.revealObserver = new IntersectionObserver(
			(entries, observer) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						entry.target.classList.add('reveal-in');
						observer.unobserve(entry.target);
					}
				});
			},
			{ threshold: 0.12 }
		);
		targets.forEach((target) => this.revealObserver?.observe(target));
	};

	public disconnectReveal = () => {
		if (this.revealObserver) {
			this.revealObserver.disconnect();
			this.revealObserver = null;
		}
	};

	/** 锚点 scroll spy：以视口为 root，占住带状区比例最大者高亮 */
	public observeAnchors = () => {
		if (typeof IntersectionObserver !== 'function') return;
		const sections = NAV_ANCHORS.map((anchor) => document.getElementById(anchor.id)).filter(Boolean) as HTMLElement[];
		if (!sections.length) return;
		this.anchorObserver = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
				if (visible.length > 0) this.activeAnchor.value = visible[0].target.id;
			},
			{ rootMargin: `-${NAV_SCROLL_OFFSET}px 0px -55% 0px` }
		);
		sections.forEach((section) => this.anchorObserver?.observe(section));
	};

	//#endregion

	//#region 导航与移动端菜单

	public scrollToSection = (id: string) => {
		const target = document.getElementById(id);
		if (!target) return;
		target.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	/** 滚过 6px 才补玻璃底：6px 而非 0，避开触控板亚像素回弹导致的反复闪 */
	public onLandingScroll = () => {
		const el = this.landingEl.value;
		this.navScrolled.value = !!el && el.scrollTop > 6;
	};

	public toggleMenu = () => {
		this.menuOpen.value = !this.menuOpen.value;
		if (this.menuOpen.value) this.expandedMobileMenuGroups.value = new Set();
		this.syncMenuScrollLock();
	};

	public closeMenu = () => {
		if (!this.menuOpen.value) return;
		this.menuOpen.value = false;
		this.expandedMobileMenuGroups.value = new Set();
		this.syncMenuScrollLock();
	};

	public toggleMobileMenuGroup = (groupId: string) => {
		const expandedGroups = new Set(this.expandedMobileMenuGroups.value);
		if (expandedGroups.has(groupId)) expandedGroups.delete(groupId);
		else expandedGroups.add(groupId);
		this.expandedMobileMenuGroups.value = expandedGroups;
	};

	public handleMobileMenuHead = (group: any) => {
		if (group.children.length > 0) {
			this.toggleMobileMenuGroup(group.id);
			return;
		}
		this.closeMenu();
		this.scrollToSection(group.id);
	};

	/** 打开菜单时锁定滚动容器，避免背景穿透滚动 */
	private syncMenuScrollLock() {
		const el = this.landingEl.value;
		if (!el) return;
		el.style.overflowY = this.menuOpen.value ? 'hidden' : '';
	}

	public onMenuKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && this.menuOpen.value) this.closeMenu();
	};

	//#endregion

	//#region 视口断点与页脚断行

	public onViewportQueryChange = (event: MediaQueryListEvent) => {
		this.isNarrowViewport.value = event.matches;
	};

	private observeViewportQuery() {
		if (typeof window.matchMedia !== 'function') return;
		this.viewportMediaQuery = window.matchMedia('(max-width: 768px)');
		this.isNarrowViewport.value = this.viewportMediaQuery.matches;
		this.viewportMediaQuery.addEventListener('change', this.onViewportQueryChange);
	}

	private disconnectViewportQuery() {
		if (this.viewportMediaQuery) {
			this.viewportMediaQuery.removeEventListener('change', this.onViewportQueryChange);
			this.viewportMediaQuery = null;
		}
	}

	/**
	 * 页脚中文短语按两字插入换行符：窄屏下四字中文被 flex 子项挤压会折成「3+1」。
	 * 仅对纯 CJK 且 ≥3 字的文本生效；英文短语按词自然折行，原样返回。纯插值，不走 v-html。
	 */
	public cjkBreak = (text: string, twoLine = this.isNarrowViewport.value) => {
		if (!twoLine) return text;
		if (typeof text !== 'string' || !/^[\u4e00-\u9fa5]{3,}$/.test(text)) return text;
		return text.replace(/(.{2})(?=.)/g, '$1\n');
	};

	//#endregion
}
