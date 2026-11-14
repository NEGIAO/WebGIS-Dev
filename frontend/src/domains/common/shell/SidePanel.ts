/**
 * SidePanel.vue - 可折叠侧边栏组件
 *
 * 功能：
 * - 新闻展示模式 (info)
 * - AI 聊天模式 (chat)
 * - 支持折叠/展开
 * - 移动端自适应
 *
 * 日    期：2026/11/13（范式化改造）
 */
import {
	computed,
	defineAsyncComponent,
	defineComponent,
	onMounted,
	onUnmounted,
	reactive,
	ref,
	watch,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';
import { useLocale } from '@common/app/useLocale';
import { tileProxyUrl } from '@/config/publicRuntime';

// Load non-default tabs on first use; keep them mounted afterward to preserve state.
const ChatPanelContent = defineAsyncComponent(() => import('@common/chat/components/ChatPanelContent.vue'));
// ToolboxPanel 预加载：与 defineAsyncComponent 共享同一个模块 Promise。
// 首屏就绪后延迟预取资源（不打开面板），用户点击工具箱时无需再等待动态分块加载。
let toolboxModulePromise: Promise<any> | null = null;
function preloadToolboxPanel() {
	if (!toolboxModulePromise) {
		toolboxModulePromise = import('@common/layer-tree/components/TOCPanel.vue');
	}
	return toolboxModulePromise;
}
const ToolboxPanel = defineAsyncComponent(() => preloadToolboxPanel());
const RoutePlannerPanel = defineAsyncComponent(() => import('@ol/routing/components/RoutePlannerPanel.vue'));
const CompassControlPanel = defineAsyncComponent(() => import('@common/compass/components/CompassControlPanel.vue'));
const TencentBuildingPanel = defineAsyncComponent(() => import('@common/data-import/components/TencentBuildingPanel.vue'));
const WeatherChartPanel = defineAsyncComponent(() => import('@common/weather/components/WeatherChartPanel.vue'));

// ========== 1. 热点新闻平台配置（label 随语言切换）==========
const NEWS_PLATFORM_KEYS = [
	'weibo', 'zhihu', 'baidu', 'bilibili', '36kr', 'github', 'juejin', 'hackernews',
	'douyin', 'v2ex', 'tieba', 'jinritoutiao', 'shaoshupai', '52pojie', 'douban',
	'hupu', 'tenxunwang', 'stackoverflow', 'sina_finance', 'eastmoney', 'xueqiu', 'cls',
];

const NEWS_DIRECT_URL = 'https://news.orz.ai/api/v1/dailynews/';
const NEWS_API_TARGET = 'news.orz.ai/api/v1/dailynews/';
const NEWS_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 min
/** 直连超时：正常 1.6s 内可返回，超时即视为不可达，交由代理分支胜出 */
const NEWS_DIRECT_TIMEOUT = 2500;
/** 代理超时：实测 0.6–2.4s；上游抖动时可到数秒，故给到 8s（tile-proxy 自身上限 20s） */
const NEWS_PROXY_TIMEOUT = 8000;
/** 列表最多展示条数（上游通常返回 20–60 条） */
const NEWS_ITEM_LIMIT = 25;
/** 上次成功结果缓存键：刷新失败时用于兜底展示，避免列表被抹空 */
const NEWS_CACHE_KEY = 'webgis:news-cache:v1';
const NEWS_CACHE_MAX_PLATFORMS = 24;
/** 工具箱资源延迟预取时长 */
const TOOLBOX_PRELOAD_DELAY_MS = 10000;

// ========== 2. Props ==========
const propDefine = {
	locationInfo: { type: Object as PropType<any>, default: () => ({ isInDihuan: false, lonLat: [0, 0] }) },
	activeTab: { type: String, default: 'info' },
	toolboxTab: { type: String, default: 'layers' },
	isCollapsed: { type: Boolean, default: false },
	/** 展开瞬间置 true：放一次渐变扫光（由 HomeView 控制时长） */
	revealing: { type: Boolean, default: false },
	userLayers: { type: Array as PropType<any[]>, default: () : any => [] },
	baseLayers: { type: Array as PropType<any[]>, default: () : any => [] },
	toolboxOverview: { type: Object as PropType<any>, default: () => ({ drawCount: 0, uploadCount: 0, layers: [] }) },
	uploadProgress: { type: Object as PropType<any>, default: () => ({ phase: 'idle' }) },
	latestSearchPoi: { type: Object as PropType<any>, default: () => ({}) },
	// 当前渲染引擎：'ol' | 'cesium'（TOC 动作按此分发到对应引擎）
	activeEngine: { type: String, default: 'ol' },
	activeFeature: { type: Object as PropType<any>, default: () => ({ key: 'info', label: '' }) },
	getUserLocation: { type: Function as PropType<any>, default: null },
	/** 三维框选的 Viewer 提供器（HomeView 注入，透传给建筑抓取面板） */
	getCesiumViewer: { type: Function as PropType<any>, default: null },
	/** 三维框选的 Cesium 命名空间提供器 */
	getCesiumNamespace: { type: Function as PropType<any>, default: null },
	startBusPointPick: { type: Function as PropType<any>, default: null },
	drawRouteOnMap: { type: Function as PropType<any>, default: null },
	zoomToBusRouteStep: { type: Function as PropType<any>, default: null },
	previewBusRouteStep: { type: Function as PropType<any>, default: null },
	clearBusRouteStepPreview: { type: Function as PropType<any>, default: null },
	drawDriveRouteOnMap: { type: Function as PropType<any>, default: null },
	zoomToDriveRouteStep: { type: Function as PropType<any>, default: null },
	previewDriveRouteStep: { type: Function as PropType<any>, default: null },
	clearDriveRouteStepPreview: { type: Function as PropType<any>, default: null },
	/** 是否加载天气看板组件（延迟加载优化） */
	shouldLoadWeather: { type: Boolean, default: false },
} as const;

export type SidePanelProps = ExtractPropTypes<typeof propDefine>;

// 一、Emits
type EmitsType = [
	'toggle-panel',
	'close-chat',
	'switch-tab',
	'upload-data',
	'interaction',
	'toggle-layer-visibility',
	'change-layer-opacity',
	'toggle-layer-label-visibility',
	'zoom-layer',
	'view-layer',
	'remove-layer',
	'edit-layer',
	'reorder-user-layers',
	'solo-layer',
	'apply-style-template',
	'update-draw-style',
	'update-layer-style',
	'update-cesium-layer-style',
	'highlight-attribute-feature',
	'zoom-attribute-feature',
	'draw-point-by-coordinates',
	'draw-amap-aoi-from-json',
	'toggle-layer-crs',
	'export-layer-data',
	'import-to-3d',
	'rename-layer',
	'layer-selected',
];

// 三、组件注册入口
export default defineComponent({
	name: 'SidePanel',
	components: { ChatPanelContent, ToolboxPanel, RoutePlannerPanel, CompassControlPanel, TencentBuildingPanel, WeatherChartPanel },
	props: propDefine,
	emits: [
		'toggle-panel',
		'close-chat',
		'switch-tab',
		'upload-data',
		'interaction',
		'toggle-layer-visibility',
		'change-layer-opacity',
		'toggle-layer-label-visibility',
		'zoom-layer',
		'view-layer',
		'remove-layer',
		'edit-layer',
		'reorder-user-layers',
		'solo-layer',
		'apply-style-template',
		'update-draw-style',
		'update-layer-style',
		'update-cesium-layer-style',
		'highlight-attribute-feature',
		'zoom-attribute-feature',
		'draw-point-by-coordinates',
		'draw-amap-aoi-from-json',
		'toggle-layer-crs',
		'export-layer-data',
		'import-to-3d',
		'rename-layer',
		'layer-selected',
	],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {


	/** 已访问过的页签集合：非默认页签首次使用后保持挂载以保留状态 */
	public loadedTabs = reactive(new Set<string>());
	public tiandituToken = ref(getRuntimeMapTokensSync().tiandituTk);

	// ── 新闻状态 ──
	public currentPlatform = ref('weibo');
	public newsItems = ref<any[]>([]);
	public newsLoading = ref(false);
	public lastNewsUpdate = ref('');

	public t!: (key: string, params?: Record<string, any>) => string;

	private newsTimer: ReturnType<typeof setInterval> | null = null;
	/** 当前在途请求的取消句柄：切平台/卸载时中断旧请求 */
	private newsAbortController: AbortController | null = null;
	/** 请求序号：递增后旧请求的响应自动失效，防止慢响应覆盖新平台数据 */
	private newsRequestSeq = 0;
	/** 上次成功获取的时间戳，用于回到前台时判断是否需要补刷 */
	private newsLastFetchedAt = 0;
	/** 工具箱预取定时器 */
	private toolboxPreloadTimer: number | null = null;

	constructor(
		private props: SidePanelProps,
		_ctx: SetupContext<EmitsType>
	) {
		const { t } = useLocale();
		this.t = t;
		this.init();
	}

	//#region props 透传

	get locationInfo() {
		return this.props.locationInfo;
	}
	get activeTab() {
		return this.props.activeTab;
	}
	get toolboxTab() {
		return this.props.toolboxTab;
	}
	get isCollapsed() {
		return this.props.isCollapsed;
	}
	get revealing() {
		return this.props.revealing;
	}
	get userLayers() {
		return this.props.userLayers;
	}
	get baseLayers() {
		return this.props.baseLayers;
	}
	get toolboxOverview() {
		return this.props.toolboxOverview;
	}
	get uploadProgress() {
		return this.props.uploadProgress;
	}
	get latestSearchPoi() {
		return this.props.latestSearchPoi;
	}
	get activeEngine() {
		return this.props.activeEngine;
	}
	get activeFeature() {
		return this.props.activeFeature;
	}
	get getUserLocation() {
		return this.props.getUserLocation;
	}
	get getCesiumViewer() {
		return this.props.getCesiumViewer;
	}
	get getCesiumNamespace() {
		return this.props.getCesiumNamespace;
	}
	get startBusPointPick() {
		return this.props.startBusPointPick;
	}
	get drawRouteOnMap() {
		return this.props.drawRouteOnMap;
	}
	get zoomToBusRouteStep() {
		return this.props.zoomToBusRouteStep;
	}
	get previewBusRouteStep() {
		return this.props.previewBusRouteStep;
	}
	get clearBusRouteStepPreview() {
		return this.props.clearBusRouteStepPreview;
	}
	get drawDriveRouteOnMap() {
		return this.props.drawDriveRouteOnMap;
	}
	get zoomToDriveRouteStep() {
		return this.props.zoomToDriveRouteStep;
	}
	get previewDriveRouteStep() {
		return this.props.previewDriveRouteStep;
	}
	get clearDriveRouteStepPreview() {
		return this.props.clearDriveRouteStepPreview;
	}
	get shouldLoadWeather() {
		return this.props.shouldLoadWeather;
	}

	//#endregion

	//#region 派生

	public newsPlatforms = computed(() =>
		NEWS_PLATFORM_KEYS.map((key) => ({ key, label: this.t(`shell.platforms.${key}`) }))
	);

	public currentPlatformLabel = computed(() => {
		const p = this.newsPlatforms.value.find((item) => item.key === this.currentPlatform.value);
		return p?.label || this.currentPlatform.value;
	});

	/** 数字格式化：≥1w 用 w，≥1k 用 k */
	public formatScore = (raw: any) => {
		const n = Number(raw);
		if (!Number.isFinite(n)) return '';
		if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
		if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
		return String(n);
	};

	/** 榜单前三名样式类 */
	public rankClass = (idx: number) => {
		if (idx === 0) return 'rank-top1';
		if (idx === 1) return 'rank-top2';
		if (idx === 2) return 'rank-top3';
		return '';
	};

	//#endregion

	//#region 生命周期

	private init() {
		watch(
			() => this.props.activeTab,
			(tab) => {
				if (tab && tab !== 'info') this.loadedTabs.add(tab);
			},
			{ immediate: true }
		);

		onMounted(() => {
			loadRuntimeMapTokens().then((tokens: any) => {
				const nextTiandituTk = String(tokens?.tiandituTk || '').trim();
				if (nextTiandituTk) this.tiandituToken.value = nextTiandituTk;
			});

			// 缓存优先：先渲染上次结果，避免首屏空白
			const hasCache = this.hydrateNewsFromCache(this.currentPlatform.value);
			this.fetchNews(this.currentPlatform.value, { silent: hasCache });
			this.newsTimer = setInterval(() => {
				if (document.hidden) return; // 后台标签页不占带宽与代理配额
				this.fetchNews(this.currentPlatform.value, { silent: true });
			}, NEWS_REFRESH_INTERVAL);
			document.addEventListener('visibilitychange', this.handleNewsVisibilityChange);

			// 挂载时即安排工具箱资源预加载（10s 后异步执行）
			this.scheduleToolboxPreload();
		});

		onUnmounted(() => {
			if (this.newsTimer) clearInterval(this.newsTimer);
			this.newsAbortController?.abort(); // 中断在途请求，防止卸载后写状态
			document.removeEventListener('visibilitychange', this.handleNewsVisibilityChange);
			// 组件卸载时取消未执行的预加载定时器，防止内存泄漏
			if (this.toolboxPreloadTimer) {
				clearTimeout(this.toolboxPreloadTimer);
				this.toolboxPreloadTimer = null;
			}
		});
	}

	/** 工具箱资源延迟预取（不占用首屏带宽） */
	private scheduleToolboxPreload() {
		if (this.toolboxPreloadTimer) return;
		this.toolboxPreloadTimer = window.setTimeout(() => {
			this.toolboxPreloadTimer = null;
			preloadToolboxPanel().catch((error) => {
				// 预加载失败不影响用户后续点击（defineAsyncComponent 会按需重试）
				console.warn('ToolboxPanel 预加载失败，用户点击时自动重试', error);
				toolboxModulePromise = null;
			});
		}, TOOLBOX_PRELOAD_DELAY_MS);
	}

	//#endregion

	//#region 新闻缓存

	/** 格式化为 HH:mm:ss（面板右上角「更新于」展示用） */
	private formatNewsClock(date: Date) {
		return [date.getHours(), date.getMinutes(), date.getSeconds()]
			.map((value) => String(value).padStart(2, '0'))
			.join(':');
	}

	/** 读取本地缓存（隐私模式或配额异常时静默失效） */
	private readNewsCache(): Record<string, any> | null {
		try {
			const raw = localStorage.getItem(NEWS_CACHE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			return parsed?.platforms && typeof parsed.platforms === 'object' ? parsed.platforms : null;
		} catch {
			return null;
		}
	}

	/** 写入成功结果；按最近使用时间淘汰超量平台，避免长期堆积占满存储 */
	private writeNewsCache(platform: string, items: any[], updatedAt: string) {
		try {
			const platforms: Record<string, any> = this.readNewsCache() || {};
			platforms[platform] = { items, updatedAt, ts: Date.now() };
			const keys = Object.keys(platforms);
			if (keys.length > NEWS_CACHE_MAX_PLATFORMS) {
				keys
					.sort((a, b) => (platforms[a]?.ts || 0) - (platforms[b]?.ts || 0))
					.slice(0, keys.length - NEWS_CACHE_MAX_PLATFORMS)
					.forEach((key) => delete platforms[key]);
			}
			localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ version: 1, platforms }));
		} catch {
			// 写缓存失败不影响主流程
		}
	}

	/** 用缓存先渲染一帧，网络刷新完成后再覆盖；返回是否命中缓存 */
	private hydrateNewsFromCache(platform: string) {
		const entry = this.readNewsCache()?.[platform];
		if (!entry || !Array.isArray(entry.items) || !entry.items.length) return false;
		this.newsItems.value = entry.items.slice(0, NEWS_ITEM_LIMIT);
		this.lastNewsUpdate.value = entry.updatedAt || '';
		// 以缓存写入时间作为「上次获取时间」，避免刚打开页面就重复补刷
		this.newsLastFetchedAt = Number(entry.ts) || 0;
		return true;
	}

	//#endregion

	//#region 新闻请求

	/**
	 * 发起一次新闻请求并返回解析后的 JSON。
	 * 超时由独立 AbortController 控制（父 signal 取消时同步中断）；响应按文本读取后再
	 * JSON.parse —— 网关或 Cloudflare 出错时返回的是纯文本 504 页，直接 resp.json()
	 * 抛出的 SyntaxError 无法与网络错误区分，日志会误导排查方向。
	 */
	private async requestNewsJson(url: string, timeoutMs: number, parentSignal?: AbortSignal) {
		const controller = new AbortController();
		const abortFromParent = () => controller.abort();
		if (parentSignal) {
			if (parentSignal.aborted) controller.abort();
			else parentSignal.addEventListener('abort', abortFromParent, { once: true });
		}
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const resp = await fetch(url, { signal: controller.signal, cache: 'no-store' });
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			return JSON.parse(await resp.text());
		} finally {
			clearTimeout(timeoutId);
			parentSignal?.removeEventListener('abort', abortFromParent);
		}
	}

	/**
	 * Promise.any 的最小兜底实现。
	 * Promise.any 属 ES2021 运行时 API，构建工具不会转译；少数内嵌 WebView 缺失时
	 * 会直接抛 TypeError，导致新闻永远空白。这里仅在缺失时降级为等价实现。
	 */
	private anyResolve(promises: Promise<any>[]) {
		if (typeof (Promise as any).any === 'function') return (Promise as any).any(promises);
		return new Promise<any>((resolve, reject) => {
			let pending = promises.length;
			const errors: any[] = [];
			if (!pending) {
				reject(new Error('no candidate'));
				return;
			}
			promises.forEach((promise, index) => {
				Promise.resolve(promise).then(resolve, (error) => {
					errors[index] = error;
					pending -= 1;
					if (!pending) reject(new Error(errors.map((e) => e?.message || e).join(' | ')));
				});
			});
		});
	}

	/**
	 * 双通道竞速：直连与 VPS 代理同时发起，谁先拿到「status=200 且 data 非空」谁胜出。
	 * 落败分支在 finally 中 abort，不留悬挂请求；10 分钟一次，对代理限流与上游压力可忽略。
	 */
	private async fetchNewsFromChannels(platform: string, parentSignal?: AbortSignal) {
		const query = `?platform=${encodeURIComponent(platform)}`;
		const branches = [
			{ channel: 'direct', url: `${NEWS_DIRECT_URL}${query}`, timeoutMs: NEWS_DIRECT_TIMEOUT },
			{ channel: 'proxy', url: `${tileProxyUrl(NEWS_API_TARGET)}${query}`, timeoutMs: NEWS_PROXY_TIMEOUT },
		];
		const controllers = branches.map(() => new AbortController());
		const abortAll = () => controllers.forEach((controller) => controller.abort());
		if (parentSignal) {
			if (parentSignal.aborted) abortAll();
			else parentSignal.addEventListener('abort', abortAll, { once: true });
		}

		const attempts = branches.map((branch, index) => {
			const attempt = (async () => {
				const json: any = await this.requestNewsJson(branch.url, branch.timeoutMs, controllers[index].signal);
				const list = Array.isArray(json?.data) ? json.data : [];
				if (String(json?.status ?? '') !== '200' || !list.length) {
					throw new Error(`${branch.channel}: 上游无有效数据（status=${json?.status}）`);
				}
				return { channel: branch.channel, list };
			})();
			// 落败分支的拒绝由竞速聚合统一处理，这里再挂一次空 catch 避免未处理拒绝告警
			attempt.catch(() => {});
			return attempt;
		});

		try {
			return await this.anyResolve(attempts);
		} finally {
			abortAll();
			parentSignal?.removeEventListener('abort', abortAll);
		}
	}

	/**
	 * 拉取指定平台新闻。
	 * 成功：覆盖列表 + 记录时间 + 落缓存；失败：保留上一次结果只记告警；被取代：直接丢弃。
	 */
	private async fetchNews(platform: string, { silent = false } = {}) {
		const requestSeq = ++this.newsRequestSeq;
		const isLatest = () => requestSeq === this.newsRequestSeq;

		this.newsAbortController?.abort();
		const controller = new AbortController();
		this.newsAbortController = controller;

		// 已有数据时的静默刷新不切加载态，避免每 10 分钟整块闪一次
		if (!silent || !this.newsItems.value.length) this.newsLoading.value = true;

		try {
			const { list } = await this.fetchNewsFromChannels(platform, controller.signal);
			if (!isLatest()) return; // 已被更新的请求取代，丢弃本条结果

			this.newsItems.value = list.slice(0, NEWS_ITEM_LIMIT);
			this.lastNewsUpdate.value = this.formatNewsClock(new Date());
			this.newsLastFetchedAt = Date.now();
			this.writeNewsCache(platform, this.newsItems.value, this.lastNewsUpdate.value);
		} catch (error: any) {
			// 主动取消（切平台/卸载/被新请求取代）不告警；真实失败保留旧数据
			if (!controller.signal.aborted) {
				console.warn(`[news] ${platform} 获取失败，保留上次结果：`, error?.message || error);
			}
		} finally {
			if (isLatest()) this.newsLoading.value = false;
		}
	}

	public switchNewsPlatform = (platform: string) => {
		if (this.currentPlatform.value === platform) {
			// 再次点击当前平台视为手动刷新（失败后可重试）
			this.fetchNews(platform);
			return;
		}
		this.currentPlatform.value = platform;
		this.newsItems.value = [];
		// 有缓存则先出图，再静默刷新，切换平台不出现空白页
		const hasCache = this.hydrateNewsFromCache(platform);
		this.fetchNews(platform, { silent: hasCache });
	};

	/** 回到前台时：仅当距上次成功获取已超过刷新间隔才补刷 */
	public handleNewsVisibilityChange = () => {
		if (document.hidden) return;
		if (Date.now() - this.newsLastFetchedAt < NEWS_REFRESH_INTERVAL) return;
		this.fetchNews(this.currentPlatform.value, { silent: this.newsItems.value.length > 0 });
	};

	//#endregion
}
