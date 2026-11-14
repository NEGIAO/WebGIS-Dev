/**
 * 功能名称：图层控制面板
 * 日    期：2026/11/13
 * 说    明：视图层逻辑入口。底图目录与历史影像由 useBasemapCatalog 承担，
 *          本类保留面板锚定、右键菜单、拖拽排序、触摸长按/拖拽与检索转发。
 */
import {
	computed,
	defineComponent,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
	type ComputedRef,
	type Ref,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import {
	Check,
	ChevronDown,
	ChevronRight,
	Eye,
	EyeOff,
	Grid3x3,
	GripVertical,
	Image as ImageIcon,
	Layers,
	RotateCcw,
	X,
} from '@lucide/vue';
import { defineResilientAsync } from '@common/utils/defineResilientAsync';
import { toggleTileHDRendering, tileHDRendering } from '@ol/basemap/basemapSystem';
import { useBasemapCatalog } from '../composables/useBasemapCatalog';
import { useLayerCustomWmsAndSearch } from '../composables/useLayerCustomWmsAndSearch';
import { useDragSort, resolveDropIndexByPointer } from '@common/composables/useDragSort';
import { useAnchoredMenu } from '@common/composables/useAnchoredMenu';
import { useLongPress } from '@common/composables/useLongPress';

// 一、Emits 类型（与下方运行时数组必须逐项一致）
type EmitsType = (
	| 'change-layer'
	| 'update-order'
	| 'toggle-graticule'
	| 'search-jump'
	| 'reset-basemap-chain'
	| 'layer-context-action'
	| 'cesium-overlay-toggle'
)[];

// 二、Props 运行时声明
const propDefine = {
	mapInstance: { type: Object as PropType<any>, default: null },
	layerList: { type: Array as PropType<any[]>, default: () : any => [] },
	activeGraticule: { type: Boolean, default: false },
	basemapCircuitOpen: { type: Boolean, default: false },
	selectedLayer: { type: String, default: 'google' },
	customMapUrl: { type: String, default: '' },
	tiandituTk: { type: String, default: '' },
	isDomestic: { type: Boolean, default: true },
	services: { type: Array as PropType<any[]>, default: () : any => [] },
	/** 地图引擎类型：'ol' 或 'cesium'，用于条件隐藏引擎特定功能 */
	engine: {
		type: String,
		default: 'ol',
		validator: (v: string) => v === 'ol' || v === 'cesium',
	},
	/** Cesium 模式下的 overlay 选项列表（国界线/注记/OSM Buildings 等） */
	cesiumOverlays: { type: Array as PropType<any[]>, default: () : any => [] },
} as const;

export type LayerControlPanelProps = ExtractPropTypes<typeof propDefine>;

/**
 * 地名搜索组件，支持多个服务源（天地图、国际、高德）。
 *
 * 用 defineResilientAsync 而非裸 defineAsyncComponent：本组件是图层面板顶部唯一的
 * 搜索入口，分片请求一旦挂起/中断，裸写法的表现是**整块搜索区空白**（含搜索图标），
 * 且不会自愈。包装后：180ms 后显示占位 → 失败自动重试 2 次 → 仍失败给出可读失败态。
 */
const LocationSearch = defineResilientAsync(() => import('@ol/search/components/LocationSearch.vue'), {
	label: '搜索框加载失败，请检查网络后重试',
	minHeight: 38,
});

// 三、组件注册入口
export default defineComponent({
	name: 'LayerControlPanel',
	components: {
		Check,
		ChevronDown,
		ChevronRight,
		Eye,
		EyeOff,
		Grid3x3,
		GripVertical,
		ImageIcon,
		Layers,
		LocationSearch,
		RotateCcw,
		X,
	},
	props: propDefine,
	emits: [
		'change-layer',
		'update-order',
		'toggle-graticule',
		'search-jump',
		'reset-basemap-chain',
		'layer-context-action',
		'cesium-overlay-toggle',
	],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	/** 模板直接调用的 emit（对应原 <script setup> 中 defineEmits 的返回值） */
	public emit!: (
		event:
			| 'change-layer'
			| 'update-order'
			| 'toggle-graticule'
			| 'search-jump'
			| 'reset-basemap-chain'
			| 'layer-context-action'
			| 'cesium-overlay-toggle',
		...args: any[]
	) => void;
	// ── 内部常量 ──
	private readonly PANEL_WIDTH = 200;
	private readonly PANEL_GAP = 6;
	private readonly PANEL_MARGIN = 8;
	private readonly CONTEXT_MENU_WIDTH = 152;
	private readonly CONTEXT_SUBMENU_WIDTH = 136;
	private readonly CONTEXT_MENU_ESTIMATED_HEIGHT = 150;

	// ── 面板与菜单 ──
	public layerManageButtonRef = ref<HTMLElement | null>(null);
	public showLayerManager = ref(false);
	public layerManagerAnchor = ref({ top: 0, left: 0 });
	public showLayerContextMenu = ref(false);
	public showUrlSubmenu = ref(false);
	public contextMenuLayer = ref<any>(null);
	public layerOpacityMap = ref(new Map<string, number>());

	// ── 拖拽排序（状态机在 common/composables/useDragSort） ──
	private dragSort = useDragSort();
	public layerListRef = ref<HTMLElement | null>(null);
	/** 模板沿用旧字段名 */
	public draggingIndex = this.dragSort.dragIndex;
	public touchDragActive = this.dragSort.touchActive;
	public touchDragIndex = this.dragSort.dragIndex;
	public touchDropIndex = this.dragSort.dropIndex;

	// ── 右键菜单视口定位（几何换算在 common/composables/useAnchoredMenu） ──
	private anchoredMenu = useAnchoredMenu({
		getContainerRect: () => this.getLayerOverlayContainerRect(),
		menuWidth: this.CONTEXT_MENU_WIDTH,
		submenuWidth: this.CONTEXT_SUBMENU_WIDTH,
	});
	public layerContextMenuStyle = this.anchoredMenu.menuStyle;
	public layerContextSubmenuStyle = this.anchoredMenu.submenuStyle;

	// ── 触摸长按（识别逻辑在 common/composables/useLongPress） ──
	private longPress = useLongPress({
		duration: 500,
		driftTolerance: 10,
		onTrigger: ({ x, y }) => {
			// 长按时间到达，显示右键菜单
			this.onLayerContextMenu(this.longPressLayer.value, this.longPressIndex, {
				clientX: x,
				clientY: y,
				preventDefault: () => {},
			});
		},
	});
	/** 长按待弹出菜单的目标图层（模板与事件层不直接消费） */
	private longPressLayer = ref<any>(null);
	private longPressIndex = -1;

	// ── 自定义 URL / WMS 与地名检索（useLayerCustomWmsAndSearch 能力层成员） ──
	public customUrlInput!: Ref<string>;
	public detectedServiceInfo!: Ref<any>;
	public wmsLayerOptions!: Ref<any[]>;
	public selectedWmsLayer!: Ref<string>;
	public wmsLayersLoading!: Ref<boolean>;
	public resetWmsLayerSelection!: () => void;
	public fetchWmsLayerOptions!: (url: string) => Promise<void>;
	public submitCustomUrl!: () => void;
	public onWmsLayerChange!: () => void;
	public getCurrentMapBound!: () => string | undefined;
	public fetchLocationResults!: (payload: any) => Promise<any>;
	public handleSearchJump!: (payload: any) => void;

	/** 高清渲染开关状态（模块级响应式单例，模板直接消费） */
	public tileHDRendering = tileHDRendering;

	// ── 自定义底图下拉 ──
	public isSelectDropdownOpen = ref(false);
	public customSelectRef = ref<HTMLElement | null>(null);

	// ── 触摸设备（长按识别由 common/composables/useLongPress 承担） ──
	public isTouchDevice = ref(false);

	// ── 底图目录与历史影像（useBasemapCatalog 能力层成员） ──
	/** 以上成员在构造函数中通过 Object.assign(this, catalog) 运行时挂载，此处仅声明类型，
	 * 使 Vue 模板编译器与 tsc 能对 template 中的同名引用做类型检查。 */
	public historicalProviderTab!: Ref<string>;
	public historicalImageryLoading!: Ref<boolean>;
	public esriWaybackLayers!: Ref<any[]>;
	public historicalImageryUpdatedAt!: Ref<string>;
	public openHistoryYears!: Ref<Set<string>>;
	public regularBasemapOptions!: ComputedRef<any[]>;
	public sentinelYearGroups!: ComputedRef<any[]>;
	public esriYearGroups!: ComputedRef<any[]>;
	public currentLayerLabel!: ComputedRef<string>;
	public selectHistoricalProviderTab!: (tab: string) => void;
	public toggleHistoryYear!: (provider: string, year: string | number) => void;
	public isHistoryYearOpen!: (provider: string, year: string | number) => boolean;
	public formatHistoryDate!: (value: string) => string;
	public loadHistoricalImageryCatalog!: () => Promise<void>;

	// ── 内部可变状态 ──
	/** URL 子菜单延迟关闭定时器（指针跨越父项与子菜单的间隙时需要） */
	private urlSubmenuCloseTimer: ReturnType<typeof setTimeout> | null = null;
	private anchorResizeObserver: ResizeObserver | null = null;

	constructor(
		private props: LayerControlPanelProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.emit = this.ctx.emit;

		// 底图目录能力层
		const catalog = useBasemapCatalog({
			selectedLayer: () => this.props.selectedLayer,
			customMapUrl: () => this.props.customMapUrl,
		});
		Object.assign(this, catalog);

		// 自定义 URL / WMS 与地名检索转发能力层
		const customWmsAndSearch = useLayerCustomWmsAndSearch({
			customMapUrl: () => this.props.customMapUrl,
			mapInstance: () => this.props.mapInstance,
			tiandituTk: () => this.props.tiandituTk,
			emitChangeLayer: (payload) => this.ctx.emit('change-layer', payload),
			emitSearchJump: (payload) => this.ctx.emit('search-jump', payload),
		});
		this.customUrlInput = customWmsAndSearch.customUrlInput;
		this.detectedServiceInfo = customWmsAndSearch.detectedServiceInfo;
		this.wmsLayerOptions = customWmsAndSearch.wmsLayerOptions;
		this.selectedWmsLayer = customWmsAndSearch.selectedWmsLayer;
		this.wmsLayersLoading = customWmsAndSearch.wmsLayersLoading;
		this.resetWmsLayerSelection = customWmsAndSearch.resetWmsLayerSelection;
		this.fetchWmsLayerOptions = customWmsAndSearch.fetchWmsLayerOptions;
		this.submitCustomUrl = customWmsAndSearch.submitCustomUrl;
		this.onWmsLayerChange = customWmsAndSearch.onWmsLayerChange;
		this.getCurrentMapBound = customWmsAndSearch.getCurrentMapBound;
		this.fetchLocationResults = customWmsAndSearch.fetchLocationResults;
		this.handleSearchJump = customWmsAndSearch.handleSearchJump;

		this.init();
	}

	//#region props 透传（模板直接使用同名变量）

	get mapInstance() {
		return this.props.mapInstance;
	}
	get layerList() {
		return this.props.layerList;
	}
	get activeGraticule() {
		return this.props.activeGraticule;
	}
	get basemapCircuitOpen() {
		return this.props.basemapCircuitOpen;
	}
	get selectedLayer() {
		return this.props.selectedLayer;
	}
	get customMapUrl() {
		return this.props.customMapUrl;
	}
	get tiandituTk() {
		return this.props.tiandituTk;
	}
	get isDomestic() {
		return this.props.isDomestic;
	}
	get services() {
		return this.props.services;
	}
	get engine() {
		return this.props.engine;
	}
	get cesiumOverlays() {
		return this.props.cesiumOverlays;
	}

	//#endregion

	//#region 派生

	/** 检索服务选项：外部传入优先，否则按国内外给默认推荐顺序 */
	public serviceOptions = computed(() => {
		if (Array.isArray(this.props.services) && this.props.services.length) return this.props.services;
		return [
			{ value: 'tianditu', label: this.props.isDomestic ? '天地图（推荐）' : '天地图' },
			{ value: 'nominatim', label: this.props.isDomestic ? '国际（Nominatim）' : '国际（推荐）' },
			{ value: 'amap', label: '高德（Amap）' },
		];
	});

	public layerManagerPanelStyle = computed(() => ({
		top: `${this.layerManagerAnchor.value.top}px`,
		left: `${this.layerManagerAnchor.value.left}px`,
	}));


	//#endregion

	//#region 生命周期

	private init() {
		watch(this.showLayerManager, async (visible) => {
			if (!visible) {
				this.unbindAnchorListeners();
				this.draggingIndex.value = -1;
				this.closeLayerContextMenu();
				return;
			}
			await nextTick();
			this.updateLayerManagerAnchor();
			this.bindAnchorListeners();
		});

		onMounted(() => {
			window.addEventListener('pointerdown', this.handleGlobalPointerDown);
			// 检测是否为触摸设备
			this.isTouchDevice.value =
				'ontouchstart' in window || navigator.maxTouchPoints > 0 || (navigator as any).msMaxTouchPoints > 0;
		});

		onBeforeUnmount(() => {
			this.unbindAnchorListeners();
			this.clearLongPressTimer();
			// URL 子菜单的延迟关闭定时器：卸载后仍在飞行会向已销毁的 ref 写值
			this.cancelUrlSubmenuClose();
			window.removeEventListener('pointerdown', this.handleGlobalPointerDown);
		});
	}

	//#endregion

	//#region URL 子菜单延迟关闭

	public openUrlSubmenu = () => {
		if (this.urlSubmenuCloseTimer) {
			clearTimeout(this.urlSubmenuCloseTimer);
			this.urlSubmenuCloseTimer = null;
		}
		this.showUrlSubmenu.value = true;
	};

	public scheduleUrlSubmenuClose = () => {
		if (this.urlSubmenuCloseTimer) clearTimeout(this.urlSubmenuCloseTimer);
		this.urlSubmenuCloseTimer = setTimeout(() => {
			this.urlSubmenuCloseTimer = null;
			this.showUrlSubmenu.value = false;
		}, 220);
	};

	public cancelUrlSubmenuClose = () => {
		if (this.urlSubmenuCloseTimer) {
			clearTimeout(this.urlSubmenuCloseTimer);
			this.urlSubmenuCloseTimer = null;
		}
	};

	//#endregion

	//#region 底图选择

	/** 高清渲染开关切换（hover tips 由 title 属性提供，无需确认弹窗） */
	public onToggleHD = () => {
		toggleTileHDRendering();
	};

	/** Cesium 覆盖层开关：从 change 事件读取 checked（模板不写 TS 断言） */
	public handleCesiumOverlayToggle = (overlay: any, event: Event) => {
		const target = event.target as HTMLInputElement;
		this.ctx.emit('cesium-overlay-toggle', { overlayId: overlay.value, value: target.checked });
	};

	public toggleSelectDropdown = (_event?: Event) => {
		this.isSelectDropdownOpen.value = !this.isSelectDropdownOpen.value;
	};

	public selectOption = (option: any) => {
		this.ctx.emit('change-layer', { layerId: option.value, source: 'dropdown' });
		this.isSelectDropdownOpen.value = false;
	};

	public selectHistoricalSnapshot = (snapshot: any) => {
		if (!snapshot?.xyz_url) return;
		this.historicalProviderTab.value = 'esri';
		this.isSelectDropdownOpen.value = false;
		this.ctx.emit('change-layer', {
			layerId: 'custom',
			source: 'custom-url',
			customUrl: snapshot.xyz_url,
		});
	};

	/** Cesium overlay 开关变更：在实例层做类型断言，避免在 Vue 模板中使用 TS `as` 语法导致运行时 SyntaxError */
	public onCesiumOverlayToggle = (event: Event, overlayId: string) => {
		const target = event.target as HTMLInputElement;
		this.emit('cesium-overlay-toggle', { overlayId, value: target.checked });
	};

	//#endregion

	//#region 桌面拖拽排序

	public onDragStart = (evt: DragEvent, index: number) => {
		// 移动端禁用拖动
		if (this.isTouchDevice.value) {
			evt.preventDefault();
			return;
		}
		this.dragSort.begin(index);
		if (evt.dataTransfer) evt.dataTransfer.effectAllowed = 'move';
	};

	public onDragEnd = () => {
		this.dragSort.reset();
	};

	public onDrop = (evt: DragEvent, dropIndex: number) => {
		if (this.isTouchDevice.value) {
			evt.preventDefault();
			return;
		}
		if (this.dragSort.dragIndex.value < 0) return;
		const dragIndex = this.dragSort.dragIndex.value;
		this.dragSort.reset();
		this.ctx.emit('update-order', { type: 'reorder', dragIndex, dropIndex });
	};

	//#endregion

	//#region 右键菜单

	public closeLayerContextMenu = () => {
		this.cancelUrlSubmenuClose();
		this.showLayerContextMenu.value = false;
		this.showUrlSubmenu.value = false;
		this.contextMenuLayer.value = null;
	};

	private clampToRange(value: number, min: number, max: number) {
		const safeMax = Math.max(min, max);
		return Math.min(Math.max(value, min), safeMax);
	}

	private getLayerOverlayContainerElement() {
		if (typeof document === 'undefined') return null;
		return (
			(this.layerManageButtonRef.value as any)?.closest?.('.map-container') ??
			document.getElementById('map-container')
		);
	}

	private getLayerOverlayContainerRect() {
		return this.getLayerOverlayContainerElement()?.getBoundingClientRect?.() ?? null;
	}

	public onLayerContextMenu = (layer: any, index: number, event: any) => {
		if (!layer?.id || !event) return;

		const containerRect = this.getLayerOverlayContainerRect();
		const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
		const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
		const originLeft = containerRect?.left ?? 0;
		const originTop = containerRect?.top ?? 0;
		const containerWidth = containerRect?.width ?? fallbackWidth;
		const containerHeight = containerRect?.height ?? fallbackHeight;
		const maxLeft = containerWidth - this.CONTEXT_MENU_WIDTH - this.PANEL_MARGIN;
		const maxTop = containerHeight - this.CONTEXT_MENU_ESTIMATED_HEIGHT - this.PANEL_MARGIN;

		this.anchoredMenu.place(
			Math.round(this.clampToRange(event.clientY - originTop, this.PANEL_MARGIN, maxTop)),
			Math.round(this.clampToRange(event.clientX - originLeft, this.PANEL_MARGIN, maxLeft))
		);

		this.contextMenuLayer.value = {
			id: String(layer.id),
			name: String(layer.name || layer.id),
			index: Number(index),
		};
		this.cancelUrlSubmenuClose();
		this.showUrlSubmenu.value = false;
		this.showLayerContextMenu.value = true;
	};

	public triggerLayerContextAction = (action: string) => {
		const layer = this.contextMenuLayer.value;
		if (!layer?.id) return;
		this.ctx.emit('layer-context-action', {
			action,
			layerId: layer.id,
			layerName: layer.name,
			layerIndex: layer.index,
		});
		this.closeLayerContextMenu();
	};

	/** 更新图层透明度（0–1，由滑块百分比换算） */
	public updateLayerOpacity = (event: Event) => {
		const opacity = Number((event.target as HTMLInputElement).value) / 100;
		const layer = this.contextMenuLayer.value;
		if (!layer?.id) return;
		this.layerOpacityMap.value.set(layer.id, opacity);
		this.ctx.emit('update-order', { type: 'opacity', layerId: layer.id, opacity });
	};

	public moveContextLayerToTop = () => {
		const index = Number(this.contextMenuLayer.value?.index);
		if (!Number.isInteger(index)) return;
		if (index <= 0) {
			this.closeLayerContextMenu();
			return;
		}
		this.ctx.emit('update-order', { type: 'reorder', dragIndex: index, dropIndex: 0 });
		this.closeLayerContextMenu();
	};

	public moveContextLayerToBottom = () => {
		const index = Number(this.contextMenuLayer.value?.index);
		const lastIndex = (this.props.layerList?.length ?? 0) - 1;
		if (!Number.isInteger(index) || lastIndex < 0) return;
		if (index >= lastIndex) {
			this.closeLayerContextMenu();
			return;
		}
		this.ctx.emit('update-order', { type: 'reorder', dragIndex: index, dropIndex: lastIndex });
		this.closeLayerContextMenu();
	};

	public handleGlobalPointerDown = (event: any) => {
		const target = event?.target;
		// 处理自定义底图选择器的外部点击
		if (this.isSelectDropdownOpen.value && target instanceof Element && !target.closest('.custom-select-container')) {
			this.isSelectDropdownOpen.value = false;
		}
		if (!this.showLayerContextMenu.value) return;
		if (target instanceof Element && target.closest('.layer-context-menu')) return;
		this.closeLayerContextMenu();
	};

	/** 切换图层显隐 */
	public updateLayerVisibility = (layer: any) => {
		this.ctx.emit('update-order', { type: 'visibility', layerId: layer.id, visible: !layer.visible });
	};

	//#endregion

	//#region 触摸长按与手柄拖拽

	/** 取消待触发的长按（供外部事件链复用） */
	public clearLongPressTimer = () => {
		this.longPress.cancel();
	};

	/** 重置触摸拖拽状态（不提交） */
	private resetTouchDrag() {
		this.dragSort.reset();
	}

	/** touchstart：起点在手柄上进拖拽，否则走长按计时（右键菜单） */
	public onLayerTouchStart = (layer: any, index: number, event: TouchEvent) => {
		if (!this.isTouchDevice.value) return;

		const touches = event.touches;
		if (touches.length !== 1) {
			this.longPress.cancel();
			this.resetTouchDrag();
			return;
		}

		// 手柄发起式拖拽：与长按菜单互斥，进拖拽就不起长按计时
		const fromHandle = !!(event.target as Element)?.closest?.('.drag-handle');
		if (fromHandle) {
			this.longPress.cancel();
			this.longPress.startPoint.value = { x: touches[0].clientX, y: touches[0].clientY };
			this.dragSort.begin(index, { touch: true });
			return;
		}

		this.resetTouchDrag();
		// 长按待弹菜单的目标：回调里读取，避免把 layer/index 塞进 composable
		this.longPressLayer.value = layer;
		this.longPressIndex = index;
		this.longPress.begin(event);
	};

	/** touchmove：拖拽中更新落点并阻止滚动；非拖拽时移动超阈值取消长按 */
	public onLayerTouchMove = (event: TouchEvent) => {
		if (!this.isTouchDevice.value) return;

		// 拖拽中：只锁本次手势的滚动，不影响平时列表滚动
		if (this.dragSort.touchActive.value) {
			if (event.cancelable) event.preventDefault();
			const touches = event.touches;
			if (!touches || touches.length !== 1) {
				this.resetTouchDrag();
				return;
			}
			const items = (this.layerListRef.value as any)?.querySelectorAll?.('.layer-item');
			this.dragSort.over(resolveDropIndexByPointer(items, touches[0].clientY));
			return;
		}

		// 非拖拽：交给长按做漂移判定（超阈值自动取消）
		this.longPress.move(event);
	};

	/** touchend：拖拽中按落点提交 reorder（与桌面 onDrop 同形），否则清长按计时 */
	public onLayerTouchEnd = () => {
		if (this.dragSort.touchActive.value) {
			const result = this.dragSort.commit();
			this.clearLongPressTimer();
			if (result) {
				const { dragIndex, dropIndex } = result;
				this.ctx.emit('update-order', { type: 'reorder', dragIndex, dropIndex });
			}
			return;
		}
		this.clearLongPressTimer();
	};

	/** touchcancel：手势被系统接管时直接重置，不提交 */
	public onLayerTouchCancel = () => {
		this.resetTouchDrag();
		this.clearLongPressTimer();
	};

	//#endregion

	//#region 面板锚定

	public updateLayerManagerAnchor = () => {
		const buttonEl = this.layerManageButtonRef.value;
		if (!buttonEl) return;
		const rect = buttonEl.getBoundingClientRect();
		const containerRect = this.getLayerOverlayContainerRect();
		const originLeft = containerRect?.left ?? 0;
		const originTop = containerRect?.top ?? 0;
		const containerWidth = containerRect?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
		const maxLeft = containerWidth - this.PANEL_WIDTH - this.PANEL_MARGIN;
		this.layerManagerAnchor.value = {
			top: Math.round(Math.max(this.PANEL_MARGIN, rect.bottom - originTop + this.PANEL_GAP)),
			left: Math.round(this.clampToRange(rect.right - originLeft - this.PANEL_WIDTH, this.PANEL_MARGIN, maxLeft)),
		};
	};

	public toggleLayerManager = () => {
		this.showLayerManager.value = !this.showLayerManager.value;
	};

	private bindAnchorListeners() {
		window.addEventListener('resize', this.updateLayerManagerAnchor);
		window.addEventListener('scroll', this.updateLayerManagerAnchor, true);

		if (typeof ResizeObserver !== 'undefined') {
			this.anchorResizeObserver = new ResizeObserver(this.updateLayerManagerAnchor);
			const containerEl = this.getLayerOverlayContainerElement();
			if (containerEl) this.anchorResizeObserver.observe(containerEl);
		}
	}

	private unbindAnchorListeners() {
		window.removeEventListener('resize', this.updateLayerManagerAnchor);
		window.removeEventListener('scroll', this.updateLayerManagerAnchor, true);
		this.anchorResizeObserver?.disconnect();
		this.anchorResizeObserver = null;
	}

	//#endregion
}
