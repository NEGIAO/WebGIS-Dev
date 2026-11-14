/**
 * 功能名称：地图底部控制条（坐标显示/编辑/复制、缩放级别、主页按钮、格式菜单）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：坐标按选定格式实时格式化；主页按钮单击重置视图、双击定位用户（280ms 判定）。
 */
import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { ChevronRight, Copy, Eye, EyeOff, House } from '@lucide/vue';
import {
	COORDINATE_FORMATS,
	DECIMAL_PLACES,
	formatCoordinate,
	normalizeCoordinate,
	parseCoordinate,
} from '@ol/utils/biz/index';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';

/** 坐标占位符：无效坐标时显示 */
const COORDINATE_PLACEHOLDER = 'Lon, Lat';

const STORAGE_KEYS = {
	FORMAT_ID: 'gis_coord_format_id',
	DECIMAL_PLACES: 'gis_coord_decimal_places',
};

const DEFAULT_FORMAT_ID = 'format_3';
const DEFAULT_DECIMAL_PLACES = 6;

// 坐标格式/小数位配置项结构：源头是 JS 模块（无类型推导），此处补本地类型供模板使用
type CoordinateFormatConfig = {
	id: string;
	label: string;
	description: string;
	example: string;
};

type DecimalPlaceConfig = {
	label: string;
	value: number;
	example: string;
};

// 一、Emits
type EmitsType = ['reset-view', 'locate-me', 'jump-to'];

// 二、Props
const propDefine = {
	coordinate: { type: Object as PropType<any>, default: null },
	coordinateText: { type: String, default: 'Lon, Lat' },
	currentZoom: { type: [Number, String] as PropType<number | string>, default: '--' },
} as const;

export type MapControlsBarProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'MapControlsBar',
	components: { ChevronRight, Copy, Eye, EyeOff, House },
	props: propDefine,
	emits: ['reset-view', 'locate-me', 'jump-to'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t!: (key: string, params?: Record<string, any>) => string;

	// ── 坐标编辑 ──
	public coordinateInputRef = ref<HTMLInputElement | null>(null);
	public coordinateInputValue = ref('');
	public isCoordinateHover = ref(false);
	public isCoordinateEditing = ref(false);
	public isInputInvalid = ref(false);

	// ── 复制与主页按钮 ──
	public copyTooltipText = ref('Copy');
	public homeButtonRippling = ref(false);

	// ── 格式菜单 ──
	public isFormatMenuVisible = ref(false);
	public currentFormatId = ref(DEFAULT_FORMAT_ID);
	public currentDecimalPlaces = ref(DEFAULT_DECIMAL_PLACES);
	public coordinateFormats = COORDINATE_FORMATS as Record<string, CoordinateFormatConfig>;
	public decimalPlaces = DECIMAL_PLACES as Record<string, DecimalPlaceConfig>;
	/** 预展开为定型数组：模板直接遍历，不在模板内对 any 调 Object.values（TS 6 下会得到 unknown[]）。
	 *  显式标注元素类型：一旦 Object.values 的推断因 TS 版本或上游类型变化退化为 unknown[]，
	 *  此处会在 tsc 阶段直接报错，而不是让 .vue 模板静默退化为 unknown（tsc 不解析 SFC 模板）。 */
	public formatOptions: CoordinateFormatConfig[] = Object.values(this.coordinateFormats);

	/** 触屏设备标记：与重构前顶层 isTouch 同义，模板据此判定复制按钮是否常显 */
	public isTouch = this.isTouchDevice();

	/** 坐标显示开关：触屏默认收起、桌面默认显示 */
	public coordPanelOpen = ref(!this.isTouch);

	private message: ReturnType<typeof useMessage>;

	private homeClickTimer: ReturnType<typeof setTimeout> | null = null;
	private homeRippleTimer: ReturnType<typeof setTimeout> | null = null;
	private copyTooltipTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private props: MapControlsBarProps,
		private ctx: SetupContext<EmitsType>
	) {
		const { t } = useLocale();
		this.t = t;
		this.message = useMessage();
		this.emit = this.ctx.emit;
		this.init();
	}

	/** 触屏设备判定（pointer: coarse） */
	private isTouchDevice() {
		return (
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(pointer: coarse)').matches
		);
	}

	//#region props 透传

	get coordinate() {
		return this.props.coordinate;
	}
	get coordinateText() {
		return this.props.coordinateText;
	}
	get currentZoom() {
		return this.props.currentZoom;
	}

	//#endregion

	//#region 派生

	/** 显示的坐标文本（按选定格式格式化） */
	public displayCoordinateText = computed(() => {
		const lng = Number(this.props.coordinate?.lng);
		const lat = Number(this.props.coordinate?.lat);
		if (Number.isFinite(lng) && Number.isFinite(lat)) {
			return formatCoordinate(lng, lat, this.currentFormatId.value, this.currentDecimalPlaces.value);
		}
		const text = String(this.props.coordinateText || '').trim();
		return text || COORDINATE_PLACEHOLDER;
	});

	public canCopyCoordinate = computed(() => this.displayCoordinateText.value !== COORDINATE_PLACEHOLDER);

	/**
	 * 缩放级别显示：
	 * - 中高缩放与 HDR 上层瓦片策略一致（ceil）
	 * - 低缩放（<4）与 useMapEventHandlers 的 round 一致，能显示到 z=1
	 */
	public displayZoom = computed(() => {
		const z = Number(this.props.currentZoom);
		if (!Number.isFinite(z)) return '--';
		if (z < 4) return Math.round(z);
		return Math.ceil(z);
	});

	//#endregion

	//#region 生命周期

	private init() {
		onMounted(() => {
			this.loadFormatPreferences();
			document.addEventListener('click', this.handleClickOutside);
		});

		onUnmounted(() => {
			document.removeEventListener('click', this.handleClickOutside);
			if (this.homeClickTimer) {
				clearTimeout(this.homeClickTimer);
				this.homeClickTimer = null;
			}
			if (this.homeRippleTimer) {
				clearTimeout(this.homeRippleTimer);
				this.homeRippleTimer = null;
			}
			if (this.copyTooltipTimer) {
				clearTimeout(this.copyTooltipTimer);
				this.copyTooltipTimer = null;
			}
			this.closeFormatMenu();
		});
	}

	/** 点击菜单外部时关闭格式菜单 */
	private handleClickOutside = (event: MouseEvent) => {
		if (!this.isFormatMenuVisible.value) return;
		const menu = document.querySelector('.format-menu');
		const button = document.querySelector('.format-config-btn');
		const target = event.target as Node;
		if (menu && !menu.contains(target) && button && !button.contains(target)) this.closeFormatMenu();
	};

	//#endregion

	//#region 坐标编辑

	public startCoordinateInput = () => {
		if (this.isCoordinateEditing.value) return;
		this.isInputInvalid.value = false;
		this.isCoordinateEditing.value = true;
		this.coordinateInputValue.value = this.canCopyCoordinate.value ? this.displayCoordinateText.value : '';
		nextTick(() => {
			this.coordinateInputRef.value?.focus?.();
			this.coordinateInputRef.value?.select?.();
		});
	};

	public cancelCoordinateInput = () => {
		this.isCoordinateEditing.value = false;
		this.isInputInvalid.value = false;
	};

	/**
	 * 解析用户输入：支持十进制、带方向、度分秒与中文逗号。
	 * 纯十进制时按当前格式 ID 判断经纬顺序。
	 */
	private parseCoordinateInput(rawText: string) {
		const parsed = parseCoordinate(rawText, this.currentFormatId.value as any);
		if (!parsed) return null;
		return normalizeCoordinate(parsed.lng, parsed.lat);
	}

	public submitCoordinateInput = () => {
		const parsed = this.parseCoordinateInput(this.coordinateInputValue.value);
		if (!parsed) {
			this.isInputInvalid.value = true;
			return;
		}
		this.isCoordinateEditing.value = false;
		this.isInputInvalid.value = false;
		this.emit('jump-to', parsed);
	};

	/** 复制坐标：优先 Clipboard API，回退 execCommand（兼容非 HTTPS / 老浏览器） */
	public copyCurrentCoordinate = async () => {
		if (!this.canCopyCoordinate.value || !this.displayCoordinateText.value) return;
		const textToCopy = this.displayCoordinateText.value;

		try {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(textToCopy);
				this.message.success(this.t('mapControls.coordCopied'));
			} else {
				throw new Error('Clipboard API unavailable');
			}
		} catch {
			const fallbackInput = document.createElement('textarea');
			fallbackInput.value = textToCopy;
			fallbackInput.style.position = 'fixed';
			fallbackInput.style.left = '-9999px';
			fallbackInput.style.top = '0';
			fallbackInput.style.opacity = '0';

			document.body.appendChild(fallbackInput);
			fallbackInput.focus();
			fallbackInput.select();
			try {
				document.execCommand('copy');
			} catch {
				this.message.error(this.t('mapControls.copyFailed'));
			}
			document.body.removeChild(fallbackInput);
		}

		this.copyTooltipText.value = 'Copied';
		if (this.copyTooltipTimer) clearTimeout(this.copyTooltipTimer);
		this.copyTooltipTimer = setTimeout(() => {
			this.copyTooltipText.value = 'Copy';
			this.copyTooltipTimer = null;
		}, 900);
	};

	//#endregion

	//#region 主页按钮

	/** 涟漪效果：按点击位置动态设置 CSS 变量 */
	public triggerHomeRipple = (event: MouseEvent) => {
		const target = event?.currentTarget as HTMLElement | null;
		if (target?.style) {
			const rect = target.getBoundingClientRect();
			const x = (event.clientX ?? rect.width / 2) - rect.left;
			const y = (event.clientY ?? rect.height / 2) - rect.top;
			target.style.setProperty('--ripple-x', `${x}px`);
			target.style.setProperty('--ripple-y', `${y}px`);
		}

		this.homeButtonRippling.value = false;
		if (this.homeRippleTimer) clearTimeout(this.homeRippleTimer);
		this.homeRippleTimer = setTimeout(() => {
			this.homeButtonRippling.value = true;
			this.homeRippleTimer = setTimeout(() => {
				this.homeButtonRippling.value = false;
				this.homeRippleTimer = null;
			}, 420);
		}, 0);
	};

	/** 单击（280ms）：重置视图；双击：定位用户 */
	public handleHomeInteract = (event: MouseEvent) => {
		this.triggerHomeRipple(event);
		if (this.homeClickTimer) {
			clearTimeout(this.homeClickTimer);
			this.homeClickTimer = null;
			this.emit('locate-me');
			return;
		}
		this.homeClickTimer = setTimeout(() => {
			this.emit('reset-view');
			this.homeClickTimer = null;
		}, 280);
	};

	//#endregion

	//#region 格式菜单

	private loadFormatPreferences() {
		try {
			const savedFormatId = localStorage.getItem(STORAGE_KEYS.FORMAT_ID);
			const savedDecimalPlaces = localStorage.getItem(STORAGE_KEYS.DECIMAL_PLACES);
			if (savedFormatId && (COORDINATE_FORMATS as any)[savedFormatId]) {
				this.currentFormatId.value = savedFormatId;
			}
			if (savedDecimalPlaces) {
				const places = Number(savedDecimalPlaces);
				if ((DECIMAL_PLACES as any)[places]) this.currentDecimalPlaces.value = places;
			}
		} catch (error) {
			console.warn('无法加载坐标格式配置:', error);
		}
	}

	private saveFormatPreferences() {
		try {
			localStorage.setItem(STORAGE_KEYS.FORMAT_ID, this.currentFormatId.value);
			localStorage.setItem(STORAGE_KEYS.DECIMAL_PLACES, String(this.currentDecimalPlaces.value));
		} catch (error) {
			console.warn('无法保存坐标格式配置:', error);
		}
	}

	public toggleFormatMenu = () => {
		this.isFormatMenuVisible.value = !this.isFormatMenuVisible.value;
	};

	public closeFormatMenu = () => {
		this.isFormatMenuVisible.value = false;
	};

	public selectFormat = (formatId: string) => {
		this.currentFormatId.value = formatId;
		this.saveFormatPreferences();
		this.closeFormatMenu();
	};

	public selectDecimalPlaces = (places: number) => {
		this.currentDecimalPlaces.value = places;
		this.saveFormatPreferences();
	};

	//#endregion
}
