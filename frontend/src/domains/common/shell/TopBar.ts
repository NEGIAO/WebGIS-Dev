/**
 * 功能名称：顶部导航栏
 * 日    期：2026/11/13
 * 说    明：视图层逻辑入口。工具菜单 / 魔法菜单、快捷地点跳转、分享链接构建与
 *          日志监控开关集中于此；无跨组件复用逻辑，故不额外拆 composable。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, type ExtractPropTypes, type SetupContext } from 'vue';
import { storeToRefs } from 'pinia';
import {
	Activity as ActivityIcon,
	Aperture as ApertureIcon,
	Bot as BotIcon,
	Building2 as Building2Icon,
	Bus as BusIcon,
	Car as CarIcon,
	Circle as CircleIcon,
	CircleDot as CircleDotIcon,
	CircleX as CircleXIcon,
	Compass as CompassIcon,
	CloudSun as CloudSunIcon,
	Globe as GlobeIcon,
	Layers as LayersIcon,
	List as ListIcon,
	Map as MapIcon,
	MapPin as MapPinIcon,
	Orbit as OrbitIcon,
	Share2 as Share2Icon,
	Smile as SmileIcon,
	Sparkles as SparklesIcon,
	User as UserIcon,
	Waves as WavesIcon,
	Wind as WindIcon,
} from '@lucide/vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useAppStore } from '@common/app/stores/useAppStore';
import { ASSET_BASE_URL } from '@/config/publicRuntime';
import { DEFAULT_BASEMAP_URL_LAYER_NUMBER, getBasemapIdByUrlLayerNumber } from '@common/basemap/basemapOptions';

// 一、Emits 类型
type EmitsType = (
	| 'toggle-magic'
	| 'activate-magic'
	| 'toggle-3d'
	| 'open-chat'
	| 'open-toolbox'
	| 'open-compass'
	| 'open-bus'
	| 'open-drive'
	| 'open-buildings'
	| 'toggle-weather-board'
	| 'activate-feature'
	| 'jump-view'
	| 'toggle-account-center'
)[];

// 二、Props
const propDefine = {
	isWeatherBoardMode: { type: Boolean, default: false },
} as const;

export type TopBarProps = ExtractPropTypes<typeof propDefine>;

/** 常用地点坐标常量；label 经 i18n 计算，随语言切换更新 */
const QUICK_LOCATION_COORDS = Object.freeze([
	{ key: 'dengzhou', labelKey: 'topbar.locations.dengzhou', lng: 112.089596, lat: 32.690537, z: 12.01, layer: 1 },
	{ key: 'hedu', labelKey: 'topbar.locations.hedu', lng: 114.30796, lat: 34.813566, z: 11.83, layer: 1 },
	{ key: 'home', labelKey: 'topbar.locations.home', lng: 111.843768, lat: 32.723897, z: 14.67, layer: 1 },
	{ key: '51Area', labelKey: 'topbar.locations.area51', lng: -115.808771, lat: 37.238119, z: 14.98, layer: 7 },
	{ key: 'China', labelKey: 'topbar.locations.china', lng: 116.397451, lat: 39.908722, z: 4.5, layer: 27 },
]);

/**
 * 分享链接剥离清单：用户私有信息，分享时一律清空。
 * ut  = 用户类型标签（guest/admin/registered）
 * loc = 定位授权来源（gps/ip）
 * p   = 编码后的 GPS 精准位置
 * 其余参数（lng、lat、z、l、view、cv、cs 等）全部保留，用于还原分享者的视图与位置状态。
 */
const SHARE_EXCLUDED_PARAMS = ['ut', 'loc', 'p', 'customUrl', 'layerId'];

// 三、组件注册入口
export default defineComponent({
	name: 'TopBar',
	components: {
		ActivityIcon,
		ApertureIcon,
		BotIcon,
		Building2Icon,
		BusIcon,
		CarIcon,
		CircleIcon,
		CircleDotIcon,
		CircleXIcon,
		CompassIcon,
		CloudSunIcon,
		GlobeIcon,
		LayersIcon,
		ListIcon,
		MapIcon,
		MapPinIcon,
		OrbitIcon,
		Share2Icon,
		SmileIcon,
		SparklesIcon,
		UserIcon,
		WavesIcon,
		WindIcon,
	},
	props: propDefine,
	emits: [
		'toggle-magic',
		'activate-magic',
		'toggle-3d',
		'open-chat',
		'open-toolbox',
		'open-compass',
		'open-bus',
		'open-drive',
		'open-buildings',
		'toggle-weather-board',
		'activate-feature',
		'jump-view',
		'toggle-account-center',
	],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {


	public showToolMenu = ref(false);
	public showMagicMenu = ref(false);
	public menuHostRef = ref<HTMLElement | null>(null);
	public magicMenuHostRef = ref<HTMLElement | null>(null);
	public is3DMode = ref(false);

	/** 站点图标地址（本组件在 HomeView 懒加载链路中，79.5KB webp 不影响登录页首屏） */
	public faviconUrl = `${ASSET_BASE_URL.endsWith('/') ? ASSET_BASE_URL : `${ASSET_BASE_URL}/`}images/icon.webp`;

	/** 模板以 :is 形式消费的图标 */
	public CloudSunIcon = CloudSunIcon;
	public GlobeIcon = GlobeIcon;
	public MapIcon = MapIcon;

	public t!: (key: string, params?: Record<string, any>) => string;
	public logMonitorVisible!: any;

	private message: ReturnType<typeof useMessage>;
	private appStore: ReturnType<typeof useAppStore>;

	constructor(
		private props: TopBarProps,
		private ctx: SetupContext<EmitsType>
	) {
		const { t } = useLocale();
		this.t = t;
		this.message = useMessage();
		this.appStore = useAppStore();
		const refs = storeToRefs(this.appStore);
		this.logMonitorVisible = refs.logMonitorVisible;

		this.init();
	}

	get isWeatherBoardMode() {
		return this.props.isWeatherBoardMode;
	}

	/** 快捷地点列表（label 随语言切换） */
	public quickLocations = computed(() =>
		QUICK_LOCATION_COORDS.map((loc) => ({ ...loc, label: this.t(loc.labelKey) }))
	);

	/** 生命周期集中注册 */
	private init() {
		onMounted(() => {
			document.addEventListener('click', this.handleDocumentClick);
		});
		onBeforeUnmount(() => {
			document.removeEventListener('click', this.handleDocumentClick);
		});
	}

	//#region 工具菜单

	public handleOpenToolbox = () => {
		this.showToolMenu.value = false;
		this.ctx.emit('activate-feature', { key: 'toolbox', label: this.t('topbar.layerManage') });
		this.ctx.emit('open-toolbox');
	};

	public handleOpenCompass = () => {
		this.showToolMenu.value = false;
		this.ctx.emit('activate-feature', { key: 'compass', label: this.t('topbar.compass') });
		this.ctx.emit('open-compass');
	};

	public handleOpenBusPlanner = () => {
		this.showToolMenu.value = false;
		this.ctx.emit('activate-feature', { key: 'bus', label: this.t('topbar.busPlanner') });
		this.ctx.emit('open-bus');
	};

	public handleOpenDrivePlanner = () => {
		this.showToolMenu.value = false;
		this.ctx.emit('activate-feature', { key: 'drive', label: this.t('topbar.drivePlanner') });
		this.ctx.emit('open-drive');
	};

	public handleOpenBuildings = () => {
		this.showToolMenu.value = false;
		this.ctx.emit('activate-feature', { key: 'buildings', label: this.t('topbar.buildings') });
		this.ctx.emit('open-buildings');
	};

	public handleToggleWeatherBoard = () => {
		this.showToolMenu.value = false;
		this.ctx.emit('activate-feature', {
			key: this.props.isWeatherBoardMode ? 'map' : 'weather-board',
			label: this.props.isWeatherBoardMode ? this.t('topbar.mapView') : this.t('topbar.weatherBoard'),
		});
		this.ctx.emit('toggle-weather-board');
	};

	public handleOpenChat = () => {
		this.ctx.emit('activate-feature', { key: 'chat', label: this.t('topbar.aiAssistant') });
		this.ctx.emit('open-chat');
	};

	public handleToggle3D = () => {
		this.is3DMode.value = !this.is3DMode.value;
		this.ctx.emit('activate-feature', {
			key: '3d',
			label: this.is3DMode.value ? this.t('topbar.view3d') : this.t('topbar.view2d'),
		});
		this.ctx.emit('toggle-3d');
	};

	public handleToggleAccountCenter = () => {
		this.ctx.emit('toggle-account-center');
	};

	public toggleMagicMenu = () => {
		this.showMagicMenu.value = !this.showMagicMenu.value;
		this.showToolMenu.value = false;
	};

	public handleActivateMagic = (effectName: string) => {
		this.showMagicMenu.value = false;
		this.ctx.emit('activate-feature', { key: 'magic', label: this.t('topbar.effectLabel') });
		this.ctx.emit('activate-magic', effectName);
	};

	public toggleToolMenu = () => {
		this.showToolMenu.value = !this.showToolMenu.value;
		this.showMagicMenu.value = false;
	};

	/** 跳转到快捷地点（飞行 + URL replace 统一交给 MapContainer） */
	public handleJump = (location: any) => {
		const lng = Number(location.lng);
		const lat = Number(location.lat);
		const z = Number(location.z);
		const layerIndexRaw = Number(location.layer);
		const layerIndex = Number.isInteger(layerIndexRaw) ? layerIndexRaw : DEFAULT_BASEMAP_URL_LAYER_NUMBER;

		if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(z)) return;

		this.showToolMenu.value = false;
		this.ctx.emit('jump-view', lng, lat, z, layerIndex);
	};

	public handleSoup = () => {
		this.showToolMenu.value = false;
		(this.message as any).soup();
	};

	public handleToggleLogMonitor = () => {
		this.showToolMenu.value = false;
		this.appStore.toggleLogMonitor();
		this.message.info(
			this.logMonitorVisible.value ? this.t('controls.logMonitorOpened') : this.t('controls.logMonitorClosed')
		);
	};

	/** 点击空白处收起两个下拉菜单 */
	public handleDocumentClick = (event: MouseEvent) => {
		const target = event.target as Node;
		if (this.showToolMenu.value && !this.menuHostRef.value?.contains(target)) this.showToolMenu.value = false;
		if (this.showMagicMenu.value && !this.magicMenuHostRef.value?.contains(target)) this.showMagicMenu.value = false;
	};

	//#endregion

	//#region 分享

	private canUseNativeShare() {
		if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
		const ua = navigator.userAgent || '';
		return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
	}

	/** execCommand 兜底复制（保留并恢复用户原有选区） */
	private fallbackCopyViaExecCommand(text: string) {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'absolute';
		textarea.style.left = '-9999px';
		document.body.appendChild(textarea);

		const selection = window.getSelection();
		const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

		textarea.select();

		let succeeded: boolean;
		try {
			succeeded = document.execCommand('copy');
		} catch (_e) {
			succeeded = false;
		}

		document.body.removeChild(textarea);

		if (originalRange && selection) {
			selection.removeAllRanges();
			selection.addRange(originalRange);
		}

		if (!succeeded) throw new Error('execCommand copy failed');
	}

	/** 底图 URL 层号归一化：非法值回落到传入 fallback，再回落默认层号 */
	private normalizeLayerIndex(value: any, fallback = DEFAULT_BASEMAP_URL_LAYER_NUMBER) {
		const parsed = Number(String(value ?? '').trim());
		if (getBasemapIdByUrlLayerNumber(parsed)) return String(parsed);

		const fallbackParsed = Number(fallback);
		if (getBasemapIdByUrlLayerNumber(fallbackParsed)) return String(fallbackParsed);
		return String(DEFAULT_BASEMAP_URL_LAYER_NUMBER);
	}

	/** 在浏览器地址栏就地写入分享标记（不刷新页面） */
	private syncShareFlagInCurrentUrl() {
		if (typeof window === 'undefined') return;

		try {
			const hash = String(window.location.hash || '#/home');
			const hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
			const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
			const hashPath = hashPathRaw || '/home';
			const hashParams = new URLSearchParams(hashQueryRaw);

			for (const key of SHARE_EXCLUDED_PARAMS) hashParams.delete(key);
			// layer 是 l 的历史别名，统一归一化为 l
			hashParams.set(
				'l',
				this.normalizeLayerIndex(hashParams.get('l') ?? hashParams.get('layer'), DEFAULT_BASEMAP_URL_LAYER_NUMBER)
			);
			hashParams.delete('layer');
			hashParams.set('s', '1');

			const nextHashQuery = hashParams.toString();
			const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
			const nextHash = nextHashQuery ? `#${normalizedHashPath}?${nextHashQuery}` : `#${normalizedHashPath}`;
			const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;

			window.history.replaceState(window.history.state, '', nextUrl);
		} catch {
			// 忽略 URL 更新失败，保持分享流程不受影响
		}
	}

	/** 构建分享链接：清空私有参数，其余参数全部保留以还原视图状态 */
	private buildShareMarkedUrl(rawHref: string) {
		try {
			const url = new URL(rawHref, window.location.origin);
			const hashText = String(url.hash || '');
			const hashWithoutSharp = hashText.startsWith('#') ? hashText.slice(1) : hashText;
			const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
			const hashPath = hashPathRaw || '/home';
			const hashParams = new URLSearchParams(hashQueryRaw);

			for (const key of SHARE_EXCLUDED_PARAMS) hashParams.delete(key);
			hashParams.set(
				'l',
				this.normalizeLayerIndex(hashParams.get('l') ?? hashParams.get('layer'), DEFAULT_BASEMAP_URL_LAYER_NUMBER)
			);
			hashParams.delete('layer');
			hashParams.set('s', '1');

			const nextHashQuery = hashParams.toString();
			const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
			url.hash = nextHashQuery ? `${normalizedHashPath}?${nextHashQuery}` : normalizedHashPath;
			return url.toString();
		} catch {
			// 降级：无法解析 URL 时，直接在原始链接上追加最小标记
			const text = String(rawHref || '');
			return text.includes('?')
				? `${text}&s=1&l=${DEFAULT_BASEMAP_URL_LAYER_NUMBER}`
				: `${text}?s=1&l=${DEFAULT_BASEMAP_URL_LAYER_NUMBER}`;
		}
	}

	/** 分享当前视图：优先系统分享，其次剪贴板，最后 execCommand */
	public handleShareView = async () => {
		const url = this.buildShareMarkedUrl(window.location.href);
		try {
			if (this.canUseNativeShare()) {
				await (navigator as any).share({
					title: this.t('topbar.shareNativeTitle'),
					text: this.t('topbar.shareNativeText'),
					url,
				});
				this.syncShareFlagInCurrentUrl();
				this.message.success(this.t('topbar.sharePanelOpened'));
				return;
			}
		} catch (error: any) {
			if (error && (error.name === 'AbortError' || error.name === 'NotAllowedError')) return;
			// 其他错误则回退到剪贴板逻辑
		}

		try {
			if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
				await navigator.clipboard.writeText(url);
			} else {
				this.fallbackCopyViaExecCommand(url);
			}
			this.syncShareFlagInCurrentUrl();
			this.message.success(this.t('topbar.shareCopied'));
		} catch (error: any) {
			this.message.error(this.t('topbar.shareCopyFailed'), error);
			this.message.error(this.t('topbar.shareManualCopy'));
		}
	};

	//#endregion
}
