/**
 * 功能名称：左侧控制面板（图层 / 新闻 / 绘制 / 测量 / 标注 / 更多 / 行政区 / 下载 / 分析 / 日志）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：菜单项统一经 handleSelect 分发；子面板显隐互斥；3D 引擎下绘制/测量切换为 Cesium 面板。
 */
import { computed, defineAsyncComponent, defineComponent, inject, ref, watch, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { storeToRefs } from 'pinia';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import AdministrativeDivisionPanel from './AdministrativeDivisionPanel.vue';
import {
	Activity,
	Boxes,
	Columns2,
	Download,
	Layers,
	LayoutGrid,
	MapPin,
	Newspaper,
	Pencil,
	Ruler,
} from '@lucide/vue';
import { useLayerStore } from '@ol/stores/useLayerStore';
import { useAppStore } from '@common/app/stores/useAppStore';
import { BASEMAP_OPTIONS } from '@/constants';

const DrawPanel = defineAsyncComponent(() => import('./DrawPanel.vue'));
const MeasurePanel = defineAsyncComponent(() => import('./MeasurePanel.vue'));
const SpatialAnalysisPanel = defineAsyncComponent(() => import('./SpatialAnalysisPanel.vue'));
/**
 * 3D 绘制/测量面板（引擎感知）：按当前引擎切换 UI 与功能集。
 * 域边界说明：侧栏 shell 历史上落在 @ol/components，此处按 engine 异步引入
 * @cesium-domain 面板，与 SidePanel.vue 异步引入 @ol 路由面板的既有做法一致。
 */
const CesiumDrawMeasurePanel = defineAsyncComponent(() => import('@cesium-domain/components/CesiumDrawMeasurePanel.vue'));

/** 卷帘分析支持的底图 */
const SWIPE_SUPPORTED_BASEMAPS = BASEMAP_OPTIONS;

// 一、Emits
type EmitsType = (
	| 'open-tab'
	| 'toggle-tab'
	| 'open-toolbox-tab'
	| 'map-interaction'
	| 'draw-style-change'
	| 'draw-edit-action'
	| 'cesium-draw-action'
	| 'district-select'
	| 'enable-basemap-swipe'
	| 'spatial-analysis'
)[];

// 二、Props
const propDefine = {
	userLayers: { type: Array as PropType<any[]>, default: () : any => [] },
	customBasemapUrl: { type: String, default: '' },
	/** 当前地图引擎：'ol'（2D）| 'cesium'（3D），决定绘制/测量子面板形态 */
	engine: { type: String, default: 'ol' },
} as const;

export type ControlsPanelProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'ControlsPanel',
	components: {
		AdministrativeDivisionPanel,
		CesiumDrawMeasurePanel,
		DrawPanel,
		MeasurePanel,
		SpatialAnalysisPanel,
		Activity,
		Boxes,
		Columns2,
		Download,
		Layers,
		LayoutGrid,
		MapPin,
		Newspaper,
		Pencil,
		Ruler,
	},
	props: propDefine,
	emits: [
		'open-tab',
		'toggle-tab',
		'open-toolbox-tab',
		'map-interaction',
		'draw-style-change',
		'draw-edit-action',
		'cesium-draw-action',
		'district-select',
		'enable-basemap-swipe',
		'spatial-analysis',
	],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public emit!: (
		event:
			| 'open-tab'
			| 'toggle-tab'
			| 'open-toolbox-tab'
			| 'map-interaction'
			| 'draw-style-change'
			| 'draw-edit-action'
			| 'cesium-draw-action'
			| 'district-select'
			| 'enable-basemap-swipe'
			| 'spatial-analysis',
		...args: any[]
	) => void;
	public t!: (key: string, params?: Record<string, any>) => string;

	// ── 子面板显隐 ──
	public activeId = ref('layers');
	public districtPanelVisible = ref(false);
	public drawPanelVisible = ref(false);
	public measurePanelVisible = ref(false);
	public spatialPanelVisible = ref(false);

	// ── 卷帘对话框 ──
	public swipeSupportedBasemaps = SWIPE_SUPPORTED_BASEMAPS;
	public showSwipeDialog = ref(false);
	public leftBasemap = ref(SWIPE_SUPPORTED_BASEMAPS[0]?.value || '');
	public rightBasemap = ref(SWIPE_SUPPORTED_BASEMAPS[1]?.value || '');
	public leftCustomUrl = ref('');
	public rightCustomUrl = ref('');
	public swipeMode = ref('horizontal');

	public layerStore: ReturnType<typeof useLayerStore>;
	private message: ReturnType<typeof useMessage>;
	private appStore: ReturnType<typeof useAppStore>;
	/** 标注模式状态（由 HomeView provide，反映 MapContainer 的 isReverseGeocodePickMode）；
	 *  模板 :class 高亮需读取，故为 public —— setup 返回值经 proxyRefs 后模板拿到的是其 .value */
	public isMarkModeActive: any;
	/** 侧边栏收起状态（用于二次点击关闭时重置 activeId） */
	private isSidePanelCollapsed: any;

	constructor(
		private props: ControlsPanelProps,
		private ctx: SetupContext<EmitsType>
	) {
		const { t } = useLocale();
		this.t = t;
		this.message = useMessage();
		this.emit = this.ctx.emit;
		this.layerStore = useLayerStore();
		this.appStore = useAppStore();
		const refs = storeToRefs(this.appStore);
		this.logMonitorVisible = refs.logMonitorVisible;

		this.isMarkModeActive = inject('isMarkModeActive', computed(() => false));
		this.isSidePanelCollapsed = inject('isSidePanelCollapsed', ref(true));

		// 外部自定义底图 URL 作为左右两侧的默认值（仅在为空时填充）
		watch(
			() => this.props.customBasemapUrl,
			(value) => {
				const normalized = String(value || '').trim();
				if (!this.leftCustomUrl.value) this.leftCustomUrl.value = normalized;
				if (!this.rightCustomUrl.value) this.rightCustomUrl.value = normalized;
			},
			{ immediate: true }
		);
	}

	public logMonitorVisible: any;

	//#region props 透传

	get userLayers() {
		return this.props.userLayers;
	}
	get customBasemapUrl() {
		return this.props.customBasemapUrl;
	}
	get engine() {
		return this.props.engine;
	}

	//#endregion

	//#region 派生

	/** 是否 3D 引擎（绘制 / 测量面板据此切换） */
	public isCesium = computed(() => this.props.engine === 'cesium');

	/** 侧栏菜单项：label 随语言切换 */
	public menuItems = computed(() => [
		{ id: 'layers', label: this.t('controls.layers'), icon: Layers, action: 'toggleLayers' },
		{ id: 'news', label: this.t('controls.news'), icon: Newspaper, action: 'toggleNews' },
		{ id: 'draw', label: this.t('controls.draw'), icon: Pencil, action: 'toggleDraw' },
		{ id: 'measure', label: this.t('controls.measure'), icon: Ruler, action: 'toggleMeasure' },
		{ id: 'mark', label: this.t('controls.mark'), icon: MapPin, action: 'toggleMark' },
		{ id: 'more', label: this.t('controls.more'), icon: Columns2, action: 'toggleMore' },
		{ id: 'adcode', label: this.t('controls.adcode'), icon: LayoutGrid, action: 'toggleAdcode' },
		{ id: 'download', label: this.t('controls.download'), icon: Download, action: 'toggleDownload' },
		{ id: 'analyze', label: this.t('controls.analyze'), icon: Boxes, action: 'toggleAnalyze' },
		{ id: 'log', label: this.t('controls.log'), icon: Activity, action: 'toggleLog' },
	]);

	//#endregion

	//#region 菜单分发

	/** 关闭与当前激活项不相关的子面板 */
	private closeIrrelevantPanels(activePanelId: string) {
		const panelMap = {
			adcode: this.districtPanelVisible,
			draw: this.drawPanelVisible,
			measure: this.measurePanelVisible,
			analyze: this.spatialPanelVisible,
		};
		for (const [panelId, visRef] of Object.entries(panelMap)) {
			if (panelId !== activePanelId && visRef.value) visRef.value = false;
		}
	}

	public handleSelect = (id: string) => {
		const currentItem: any = this.menuItems.value.find((item) => item.id === id);
		if (!currentItem) return;

		if (currentItem.action === 'toggleLog') {
			this.appStore.toggleLogMonitor();
			if (this.appStore.logMonitorVisible) this.activeId.value = 'log';
			else if (this.activeId.value === 'log') this.activeId.value = 'layers';
			this.message.info(
				this.appStore.logMonitorVisible ? this.t('controls.logMonitorOpened') : this.t('controls.logMonitorClosed')
			);
			return;
		}

		// layers/news/download 的高亮由 emit 的结果决定（二次点击收起时取消高亮）
		if (!['toggleLayers', 'toggleNews', 'toggleDownload'].includes(currentItem.action)) {
			this.activeId.value = id;
		}

		this.closeIrrelevantPanels(id);

		switch (currentItem.action) {
			case 'toggleNews':
				this.emit('toggle-tab', 'info');
				// emit 同步执行父组件 handleControlsToggleTab（决定展开/收起），据此同步高亮
				this.activeId.value = this.isSidePanelCollapsed.value ? 'layers' : 'news';
				break;

			case 'toggleLayers':
				this.emit('toggle-tab', 'toolbox');
				// layers 为默认选中项；展开/收起时高亮始终落在 layers
				this.activeId.value = 'layers';
				break;

			case 'toggleDraw':
				this.drawPanelVisible.value = !this.drawPanelVisible.value;
				if (this.drawPanelVisible.value) this.emit('open-tab', 'toolbox');
				break;

			case 'toggleMeasure':
				this.measurePanelVisible.value = !this.measurePanelVisible.value;
				if (this.measurePanelVisible.value) this.emit('open-tab', 'toolbox');
				break;

			case 'toggleMark':
				this.emit('map-interaction', 'ReverseGeocodePick');
				if (!this.isMarkModeActive.value) {
					// 进入标注模式
					this.emit('open-tab', 'toolbox');
					this.activeId.value = 'mark';
				} else if (this.activeId.value === 'mark') {
					// 退出标注模式
					this.activeId.value = 'layers';
				}
				break;

			case 'toggleAnalyze':
				this.spatialPanelVisible.value = !this.spatialPanelVisible.value;
				if (this.spatialPanelVisible.value) this.emit('open-tab', 'toolbox');
				break;

			case 'toggleAdcode':
				this.districtPanelVisible.value = !this.districtPanelVisible.value;
				this.message.info(
					this.districtPanelVisible.value
						? this.t('controls.districtPanelOpened')
						: this.t('controls.districtPanelClosed')
				);
				break;

			case 'toggleMore':
				// Map Swipe 双底图对比
				if (this.layerStore.swipeConfig.enabled) {
					this.layerStore.disableSwipe();
					this.activeId.value = 'layers';
					this.message.success(this.t('controls.swipeClosed'));
				} else {
					const sharedUrl = String(this.props.customBasemapUrl || '').trim();
					if (!this.leftCustomUrl.value) this.leftCustomUrl.value = sharedUrl;
					if (!this.rightCustomUrl.value) this.rightCustomUrl.value = sharedUrl;
					this.showSwipeDialog.value = true;
				}
				break;

			case 'toggleDownload':
				this.emit('open-toolbox-tab', 'download');
				this.activeId.value = this.isSidePanelCollapsed.value ? 'layers' : 'download';
				break;

			default:
				// 注意：useMessage 的第二参是 options 对象，不能把 action 当参数传（会被吞掉）
				this.message.warning(this.t('controls.unknownAction', { action: currentItem.action }));
				break;
		}
	};

	//#endregion

	//#region 子面板事件

	public handleDistrictSelect = (payload: any) => {
		this.emit('district-select', payload);
	};

	/** 绘制类型选择 */
	public handleDrawType = (type: string) => {
		this.emit('map-interaction', type);
		const labelMap: Record<string, string> = {
			Point: this.t('draw.tools.Point'),
			LineString: this.t('draw.tools.LineString'),
			Polygon: this.t('draw.tools.Polygon'),
			Rectangle: this.t('draw.tools.Rectangle'),
			Ellipse: this.t('draw.tools.Ellipse'),
			CircleOutline: this.t('draw.tools.CircleOutline'),
			Arrow: this.t('draw.tools.Arrow'),
			WindArrow: this.t('controls.windArrow'),
			BattleArrow: this.t('controls.battleArrow'),
			SelectEdit: this.t('draw.tools.SelectEdit'),
		};
		this.message.info(this.t('controls.drawToolActivated', { type: labelMap[type] || type }));
	};

	public handleDrawStyleChange = (stylePayload: any) => {
		this.emit('draw-style-change', stylePayload);
	};

	public handleDrawEditAction = (action: string) => {
		this.emit('draw-edit-action', action);
		if (action === 'delete-selected') this.message.info(this.t('controls.deleteSelectedRequested'));
		else if (action === 'undo-last') this.message.info(this.t('controls.undoLastRequested'));
	};

	/** 清除全部绘制图形（仅绘制图层；其他图层由图层目录统一管理） */
	public handleClearDraw = () => {
		this.emit('map-interaction', 'Clear');
		this.message.success(this.t('controls.clearDrawSuccess'));
	};

	public handleMeasureType = (type: string) => {
		this.emit('map-interaction', type);
		this.message.info(
			type === 'MeasureDistance' ? this.t('controls.measureDistanceActivated') : this.t('controls.measureAreaActivated')
		);
	};

	public handleClearMeasure = () => {
		this.emit('map-interaction', 'Clear');
		this.message.success(this.t('controls.clearMeasureSuccess'));
	};

	/**
	 * 3D 绘制 / 测量工具激活。
	 * 复用 map-interaction 通道，由 HomeView 作为唯一引擎裁决点路由到 CesiumContainer。
	 */
	public handleCesiumActivate = (type: string) => {
		this.emit('map-interaction', type);
	};

	/** 3D 面板动作上抛（完成 / 取消 / 撤销 / 清除 / 定位），面板不直连引擎 */
	public handleCesiumDrawAction = (action: string) => {
		this.emit('cesium-draw-action', action);
	};

	public handleSpatialAnalysis = (payload: any) => {
		this.emit('spatial-analysis', payload);
	};

	//#endregion

	//#region 卷帘对话框

	public confirmSwipeConfig = () => {
		if (!this.leftBasemap.value || !this.rightBasemap.value) {
			this.message.warning(this.t('controls.swipeSelectDifferent'));
			return;
		}

		if (
			this.leftBasemap.value === 'custom' &&
			this.rightBasemap.value === 'custom' &&
			this.leftCustomUrl.value.trim() !== this.rightCustomUrl.value.trim()
		) {
			// 两个 custom URL 不同，允许比较两张动态影像
		} else if (this.leftBasemap.value === this.rightBasemap.value) {
			this.message.warning(this.t('controls.swipeSameBasemap'));
			return;
		}

		if (this.leftBasemap.value === 'custom' && !this.leftCustomUrl.value.trim()) {
			this.message.warning('请输入左侧自定义底图 URL');
			return;
		}
		if (this.rightBasemap.value === 'custom' && !this.rightCustomUrl.value.trim()) {
			this.message.warning('请输入右侧自定义底图 URL');
			return;
		}

		this.emit('enable-basemap-swipe', {
			leftBasemap: this.leftBasemap.value,
			rightBasemap: this.rightBasemap.value,
			leftCustomUrl: this.leftBasemap.value === 'custom' ? this.leftCustomUrl.value.trim() : '',
			rightCustomUrl: this.rightBasemap.value === 'custom' ? this.rightCustomUrl.value.trim() : '',
			mode: this.swipeMode.value,
		});

		this.showSwipeDialog.value = false;
		this.message.success(
			this.t('controls.swipeLoading', {
				left: this.getBasemapLabel(this.leftBasemap.value),
				right: this.getBasemapLabel(this.rightBasemap.value),
			})
		);
	};

	public cancelSwipeDialog = () => {
		this.showSwipeDialog.value = false;
		this.leftBasemap.value = SWIPE_SUPPORTED_BASEMAPS[0]?.value || '';
		this.rightBasemap.value = SWIPE_SUPPORTED_BASEMAPS[1]?.value || '';
		this.leftCustomUrl.value = String(this.props.customBasemapUrl || '').trim();
		this.rightCustomUrl.value = String(this.props.customBasemapUrl || '').trim();
		this.swipeMode.value = 'horizontal';
	};

	/** 根据底图 ID 取显示名 */
	public getBasemapLabel = (id: string) => {
		const option: any = BASEMAP_OPTIONS.find((opt: any) => opt.value === id);
		return option?.label || id;
	};

	//#endregion
}
