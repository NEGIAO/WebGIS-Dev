/**
 * 功能名称：TOC 图层树宿主面板
 * 日    期：2026/11/13（范式化改造）
 * 说    明：视图层逻辑入口。P2 拆分后上传 / 地理编码 / 共享资源 / 树动作分发
 *          已由 4 个 composable 承担，本类只保留页签、样式应用、属性表打开与生命周期编排。
 */
import {
	computed,
	defineAsyncComponent,
	defineComponent,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
	type ComputedRef,
	type ExtractPropTypes,
	type PropType,
	type Ref,
	type SetupContext,
} from 'vue';
import type { useSharedResourceLoader } from '@common/data-import/useSharedResourceLoader';
import {
	CircleDot,
	Crosshair,
	Download,
	Eraser,
	FolderOpen,
	Hexagon,
	Layers,
	LocateFixed,
	Maximize,
	Navigation,
	Palette,
	Paintbrush,
	PenTool,
	Route,
	Ruler,
	Search as SearchIcon,
	SlidersHorizontal,
	SquareDashed,
	Table,
	X,
} from '@lucide/vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useGisLoader } from '@common/data-import/useGisLoader';
import { useGisDropZone } from '@common/data-import/useGisDropZone';
import { RSVC_NODE_PREFIX, useRemoteServices, parseRsvcNodeId } from '@common/basemap/remoteServices';
import { fetchArcgisLayerAttributes, mergeSublayerAttributes } from '@common/basemap/arcgisAttributeQuery';
import { useLayerStore, useAttrStore } from '@/stores';
import { CESIUM_NODE_PREFIX } from '@common/layer-tree/protocol';
import { useStyleEditor } from '@common/layer-tree/style/useStyleEditor';
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';
import LayerPanel from '@common/layer-tree/components/LayerPanel.vue';
import SharedResourceTreeItem from '@common/layer-tree/components/SharedResourceTreeItem.vue';
import AmapAoiInjectDialog from '@common/layer-tree/components/AmapAoiInjectDialog.vue';
import LayerPropertiesDialog from '@common/layer-tree/components/LayerPropertiesDialog.vue';
// 异步加载：下载器仅切到 download 标签页时才需要，不随 TOC 首次渲染加载
const MapDownloader = defineAsyncComponent(() => import('@ol/components/MapDownloader.vue'));
import { useGeocoding } from '../composables/useGeocoding';
import { useFileUpload, MAX_FILE_SIZE_MB } from '../composables/useFileUpload';
import { BASIC_CRS_PRESETS, listCgcs2000Presets, listUtmPresets } from '@common/data-import/crs/crsPresets';
import { useSharedResources } from '../composables/useSharedResources';
import { useTreeActionDispatcher } from '../composables/useTreeActionDispatcher';

// 一、Emits 类型
type EmitsType = (
	| 'close'
	| 'upload-data'
	| 'interaction'
	| 'layer-selected'
	| 'toggle-layer-visibility'
	| 'change-layer-opacity'
	| 'zoom-layer'
	| 'view-layer'
	| 'remove-layer'
	| 'edit-layer'
	| 'reorder-user-layers'
	| 'solo-layer'
	| 'toggle-layer-label-visibility'
	| 'apply-style-template'
	| 'update-draw-style'
	| 'update-layer-style'
	| 'update-cesium-layer-style'
	| 'highlight-attribute-feature'
	| 'zoom-attribute-feature'
	| 'draw-point-by-coordinates'
	| 'draw-amap-aoi-from-json'
	| 'toggle-layer-crs'
	| 'export-layer-data'
	| 'import-to-3d'
	| 'reproject-layer'
	| 'rename-layer'
)[];

// 二、Props
const propDefine = {
	userLayers: { type: Array as PropType<any[]>, default: () : any => [] },
	baseLayers: { type: Array as PropType<any[]>, default: () : any => [] },
	overview: { type: Object as PropType<any>, default: () => ({ drawCount: 0, uploadCount: 0, layers: [] }) },
	uploadProgress: { type: Object as PropType<any>, default: () => ({ phase: 'idle' }) },
	latestSearchPoi: { type: Object as PropType<any>, default: () => ({}) },
	defaultTab: { type: String, default: 'layers' },
	// 当前渲染引擎：'ol' | 'cesium'（在线服务动作按此优先分发）
	activeEngine: { type: String, default: 'ol' },
} as const;

export type TOCPanelProps = ExtractPropTypes<typeof propDefine>;

/** 合法页签集合 */
const TAB_VALUES = ['layers', 'draw', 'style', 'download'];

// 三、组件注册入口
export default defineComponent({
	name: 'TOCPanel',
	components: {
		AmapAoiInjectDialog,
		Crosshair,
		Eraser,
		FolderOpen,
		LayerPanel,
		LayerPropertiesDialog,
		Layers,
		LocateFixed,
		MapDownloader,
		Maximize,
		Navigation,
		Paintbrush,
		Palette,
		PenTool,
		SearchIcon,
		SharedResourceTreeItem,
		SlidersHorizontal,
		X,
	},
	props: propDefine,
	emits: [
		'close',
		'upload-data',
		'interaction',
		'layer-selected',
		'toggle-layer-visibility',
		'change-layer-opacity',
		'zoom-layer',
		'view-layer',
		'remove-layer',
		'edit-layer',
		'reorder-user-layers',
		'solo-layer',
		'toggle-layer-label-visibility',
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
		'reproject-layer',
		'rename-layer',
	],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
//
// P2 拆分后的 4 个 composable 是 JS 模块，其返回值通过 Object.assign 注入实例；
// Object.assign 不会把成员并入类类型，故按本仓「视图 / 实例分离」范式在类上补
// public …! 声明（仅类型，运行时仍由构造函数注入）。

/** 上传进度视图模型（useFileUpload.uploadProgressView） */
interface UploadProgressView {
	phase: string;
	total: number;
	current: number;
	success: number;
	failed: number;
	warnings: number;
	errors: number;
	message: string;
}

export class Instance {


	/** 模板展示文件大小上限（模块常量需显式暴露才能进模板上下文） */
	public readonly MAX_FILE_SIZE_MB = MAX_FILE_SIZE_MB;

	// ── useGeocoding 注入 ──
	public coordInputLon!: Ref<string>;
	public coordInputLat!: Ref<string>;
	public coordInputCRS!: Ref<string>;
	public coordInputError!: Ref<string>;
	public coordInputP!: Ref<string>;
	public coordInputPError!: Ref<string>;
	public geocodeAddressInput!: Ref<string>;
	public geocodeCityInput!: Ref<string>;
	public geocodeToolError!: Ref<string>;
	public manualAoiPoiId!: Ref<string>;
	public manualAoiJsonText!: Ref<string>;
	public manualAoiError!: Ref<string>;
	public manualAoiDialogVisible!: Ref<boolean>;
	public manualAoiSourceLayerName!: Ref<string>;
	public isDecodePBusy!: Ref<boolean>;
	public isGeocodeBusy!: Ref<boolean>;
	public manualAoiDetailUrl!: ComputedRef<string>;
	public copyLayerCoordinates!: (layer: any) => Promise<void>;
	public getCurrentFormatConfig!: () => { formatId: string; decimalPlaces: number };
	public clearCoordinateInput!: () => void;
	public clearPositionCodeInput!: () => void;
	public clearGeocodeInput!: () => void;
	public closeManualAoiDialog!: () => void;
	public openManualAoiDetailLink!: () => void;
	public openManualAoiDialogByPoi!: (payload?: any, options?: any) => boolean;
	public drawAmapAoiFromManualJson!: () => void;
	public drawPointByCoordinates!: () => void;
	public drawPointByPositionCode!: () => Promise<void>;
	public drawPointByGeocodeAddress!: () => Promise<void>;
	public startReverseGeocodePick!: () => void;
	public normalizeManualAoiPoiId!: (rawValue: any, options?: any) => string;

	// ── useTreeActionDispatcher 注入 ──
	public multiSelectedLayerIds!: Ref<string[]>;
	public availableLayerIds!: ComputedRef<string[]>;
	public resolveLayerActionsById!: (layerId: string) => any;
	public handleLayerTreeAction!: (rawEvt: any) => void;
	public onDragStart!: (layerId: string) => void;
	public onDrop!: (targetLayerId: string) => void;
	public addMultiSelectedLayer!: (layerId: string) => void;
	public removeMultiSelectedLayer!: (layerId: string) => void;
	public clearMultiSelectedLayers!: () => void;
	public setFolderRecursiveSelection!: (nodeId: string, checked: boolean) => void;
	public syncUserLayers!: (layers?: any[], overview?: any) => void;

	// ── useFileUpload 注入 ──
	public uploadProgressView!: ComputedRef<UploadProgressView>;
	public shouldShowUploadProgress!: ComputedRef<boolean>;
	public uploadProgressPercent!: ComputedRef<number>;
	public uploadProgressLabel!: ComputedRef<string>;
	public triggerFileUpload!: () => void;
	public triggerFolderUpload!: () => void;
	public handleFileUpload!: (event: Event) => void;
	public handleDirectoryUpload!: (event: Event) => void;

	// ── useSharedResources 注入 ──
	public sharedLoader!: ReturnType<typeof useSharedResourceLoader>;
	public lastScanAttempted!: Ref<boolean>;
	public scanSharedResources!: () => Promise<void>;
	public loadSharedResource!: (resource: any) => Promise<void>;

	/** 模板直接调用的 emit（对应原 <script setup> 中 defineEmits 的返回值） */
	public emit!: SetupContext<EmitsType>['emit'];
	public fileInputRef = ref<HTMLInputElement | null>(null);
	public folderInputRef = ref<HTMLInputElement | null>(null);
	public activeTab = ref('layers');
	public tiandituTk = ref(getRuntimeMapTokensSync().tiandituTk);

	public tabItems = [
		{ value: 'layers', label: 'layer.tabLayers', icon: Layers },
		{ value: 'draw', label: 'layer.tabDraw', icon: PenTool },
		{ value: 'style', label: 'layer.tabStyle', icon: Paintbrush },
		{ value: 'download', label: 'layer.tabDownload', icon: Download },
	];

	// 图层属性弹窗（show-layer-properties 动作经 dispatcher 写入，模板消费）
	public propertiesDialogVisible = ref(false);
	public propertiesDialogLayer = ref<any>(null);

	/** 导入源坐标系：预设下拉 + 自定义 EPSG 输入（自定义优先，留空则用下拉） */
	public importCrsPreset = ref('');
	public importCrsCustom = ref('');
	public basicCrsPresets = BASIC_CRS_PRESETS;
	public cgcs2000CrsPresets = listCgcs2000Presets(3);
	/** UTM 只列覆盖中国的带号（43~53），全 60 带会让下拉过长 */
	public utmCrsPresets = listUtmPresets({ zoneFrom: 43, zoneTo: 53 });

	// ── 服务与状态 ──
	public layerStore: ReturnType<typeof useLayerStore>;
	public attrStore: ReturnType<typeof useAttrStore>;
	public styleEditor: ReturnType<typeof useStyleEditor>;
	public styleTemplates: any;
	public styleForm: any;

	public t!: (key: string, params?: Record<string, any>) => string;
	private message: ReturnType<typeof useMessage>;
	private gisLoader: ReturnType<typeof useGisLoader>;

	constructor(
		private props: TOCPanelProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.emit = this.ctx.emit;
		this.message = useMessage();
		const { t } = useLocale();
		this.t = t;
		this.gisLoader = useGisLoader();
		this.layerStore = useLayerStore();
		this.attrStore = useAttrStore();
		this.styleEditor = useStyleEditor();
		this.styleTemplates = this.styleEditor.styleTemplates;
		this.styleForm = this.styleEditor.styleForm;

		// ══════ P2 拆分：以下能力层注入（顺序有依赖，勿调换）══════
		const geocoding = useGeocoding({
			t,
			message: this.message,
			emit: this.ctx.emit,
			tiandituTk: this.tiandituTk,
		});
		Object.assign(this, geocoding);

		const dispatcher = useTreeActionDispatcher({
			layerStore: this.layerStore,
			useRemoteServices,
			// 整个响应式 props 直传：activeEngine 等字段随引擎切换保持最新（快照会导致 P0-2 回归）
			props: this.props,
			emit: this.ctx.emit,
			message: this.message,
			t,
			uiState: {
				propertiesDialogVisible: this.propertiesDialogVisible,
				propertiesDialogLayer: this.propertiesDialogLayer,
			},
			deps: {
				openAttributeTable: this.openAttributeTable,
				setStyleTarget: this.setStyleTarget,
				copyLayerCoordinates: (this as any).copyLayerCoordinates,
				openManualAoiDialogByPoi: (this as any).openManualAoiDialogByPoi,
			},
		});
		Object.assign(this, dispatcher);

		const fileUpload = useFileUpload({
			t,
			message: this.message,
			emit: this.ctx.emit,
			props: this.props,
			getGisLoader: () => this.gisLoader,
			getFileInputRef: () => this.fileInputRef.value,
			getFolderInputRef: () => this.folderInputRef.value,
			getOverrideCrs: () => this.importCrsOverride.value,
		});
		Object.assign(this, fileUpload);

		const sharedResources = useSharedResources({
			t,
			message: this.message,
			emit: this.ctx.emit,
			getGisLoader: () => this.gisLoader,
		});
		Object.assign(this, sharedResources);

		const dropZone = useGisDropZone({
			onUpload: (payload: any) => this.ctx.emit('upload-data', payload),
			// 拖到上传区与点击上传等价，源坐标系同样生效（拖到地图上则没有该下拉，保持自动识别）
			getOverrideCrs: () => this.importCrsOverride.value,
		});
		// isDragging 重命名为 isUploadDragging，避免与其它拖拽态混淆
		this.isUploadDragging = dropZone.isDragging;
		this.handleUploadDragEnter = dropZone.handleDragEnter;
		this.handleUploadDragOver = dropZone.handleDragOver;
		this.handleUploadDragLeave = dropZone.handleDragLeave;
		this.handleUploadDrop = dropZone.handleDrop;

		this.init();
	}

	// ── 拖拽上传（由 useGisDropZone 注入） ──
	public isUploadDragging: any;
	public handleUploadDragEnter: any;
	public handleUploadDragOver: any;
	public handleUploadDragLeave: any;
	public handleUploadDrop: any;

	//#region props 透传

	get userLayers() {
		return this.props.userLayers;
	}
	get baseLayers() {
		return this.props.baseLayers;
	}
	get overview() {
		return this.props.overview;
	}
	get uploadProgress() {
		return this.props.uploadProgress;
	}
	get latestSearchPoi() {
		return this.props.latestSearchPoi;
	}
	get defaultTab() {
		return this.props.defaultTab;
	}
	get activeEngine() {
		return this.props.activeEngine;
	}

	//#endregion

	//#region 派生

	public tabIndex = computed(() => Math.max(0, this.tabItems.findIndex((item) => item.value === this.activeTab.value)));

	public importCrsOverride = computed(() => String(this.importCrsCustom.value || '').trim() || this.importCrsPreset.value);

	public drawTools = computed(() => [
		{ value: 'AttributeQuery', label: this.t('layer.attributeQuery'), icon: Table },
		{ value: 'Point', label: this.t('layer.drawPoint'), icon: CircleDot },
		{ value: 'LineString', label: this.t('layer.drawLine'), icon: Route },
		{ value: 'Polygon', label: this.t('layer.drawPolygon'), icon: Hexagon },
		{ value: 'MeasureDistance', label: this.t('layer.measureDistance'), icon: Ruler },
		{ value: 'MeasureArea', label: this.t('layer.measureArea'), icon: SquareDashed },
	]);

	public selectedDrawTool = computed(() => this.layerStore.selectedDrawTool);

	public selectedEditLayerId = computed({
		get: () => this.layerStore.selectedEditLayerId,
		set: (value: string) => {
			this.layerStore.setStyleTarget(value);
		},
	});

	public editableLayers = computed(() => this.layerStore.editableLayers);

	//#endregion

	//#region 生命周期

	private init() {
		watch(
			() => this.props.defaultTab,
			(next) => {
				this.activeTab.value = this.normalizeTab(next);
			},
			{ immediate: true }
		);

		onMounted(async () => {
			const tokens: any = await loadRuntimeMapTokens();
			const nextTiandituTk = String(tokens?.tiandituTk || '').trim();
			if (nextTiandituTk) this.tiandituTk.value = nextTiandituTk;
		});

		watch(
			() => this.props.userLayers,
			(layers) => {
				// layerStore 同步与多选修剪由 dispatcher.syncUserLayers 统一处理
				(this as any).syncUserLayers(layers || [], this.props.overview || {});
				this.attrStore.syncLayers(layers || []);
			},
			{ immediate: true }
		);

		watch(
			() => this.props.overview,
			(overview) => {
				// 使用 store 中的 userLayers 而非 props.userLayers，避免时序问题：
				// 图层移除时 user-layers-change 和 graphics-overview 先后触发，
				// 若 props.userLayers 尚未更新，会用旧列表重新同步导致已删除图层「恢复」
				this.layerStore.syncLayers(this.layerStore.userLayers || [], overview || {});
			},
			{ immediate: true }
		);

		watch(
			() => [
				Number(this.props.latestSearchPoi?._syncAt || 0),
				String(this.props.latestSearchPoi?.poiid || this.props.latestSearchPoi?.id || '').trim(),
				String(this.props.latestSearchPoi?.service || '')
					.trim()
					.toLowerCase(),
				String(this.props.latestSearchPoi?.name || '').trim(),
			],
			([syncAt, nextPoiId, service, poiName]: any[]) => {
				if (!syncAt) return;
				if (service && service !== 'amap') return;
				const anySelf = this as any;
				if (anySelf.manualAoiDialogVisible?.value && nextPoiId === anySelf.manualAoiPoiId?.value) return;

				anySelf.openManualAoiDialogByPoi(
					{ poiid: nextPoiId, layerName: poiName },
					{ showMissingIdHint: true }
				);
			},
			{ immediate: true }
		);

		this.layerStore.bindHandlers({
			onReorder: (payload: any) => this.ctx.emit('reorder-user-layers', payload),
			onHighlightFeature: (payload: any) => this.ctx.emit('highlight-attribute-feature', payload),
			onZoomFeature: (payload: any) => this.ctx.emit('zoom-attribute-feature', payload),
			onViewFeature: (payload: any) => this.ctx.emit('zoom-attribute-feature', payload),
		});

		onBeforeUnmount(() => {
			// 无参调用 bindHandlers 将所有回调设为 undefined，清除事件绑定
			this.layerStore.bindHandlers();
		});
	}

	/** 页签归一化：非法值回落到 layers */
	private normalizeTab(value: any) {
		const normalized = String(value || '').trim();
		if (TAB_VALUES.includes(normalized)) return normalized;
		return 'layers';
	}

	//#endregion

	//#region 动作

	/** 属性弹窗「重设源坐标系」→ 上抛给容器层（快照与 OL 数据源都在引擎侧，本组件不持地图对象） */
	public handleReprojectLayer = (payload: any) => {
		if (!payload?.layerId || !payload?.crs) return;
		this.ctx.emit('reproject-layer', payload);
	};

	/**
	 * 打开属性表。
	 * 在线服务（rsvc:）走 ArcGIS Query → 灌入 attrStore → 打开；其余按本地图层处理。
	 */
	public openAttributeTable = async (layerId: string) => {
		// ── 在线服务：拉取 ArcGIS Query 属性 → 灌入 attrStore → 打开属性表 ──
		if (String(layerId).startsWith(RSVC_NODE_PREFIX)) {
			const { serviceId, subLayerName } = parseRsvcNodeId(layerId);
			const store = useRemoteServices();
			const record: any = store.getRemoteService(serviceId);

			if (!record) {
				this.message?.warning?.('该在线服务已不存在');
				return;
			}
			if (record.kind !== 'arcgis' || !record.queryable) {
				this.message?.warning?.('该服务未开放查询能力（仅 ArcGIS 动态服务支持属性表）');
				return;
			}

			// 目标子图层集合：叶子节点=精确单层；服务节点=已勾选层（未勾选则全部）
			const targetNames: string[] = subLayerName
				? [subLayerName]
				: record.selectedIds?.length
					? record.selectedIds
					: (record.sublayers || []).map((item: any) => item.name);
			if (!targetNames.length) {
				this.message?.warning?.('未找到可查询的子图层');
				return;
			}

			const titleOf = (name: string) => record.sublayers?.find((item: any) => item.name === name)?.title || String(name);
			this.message?.info?.(`正在查询属性表（${targetNames.length} 个子图层）…`, { duration: 2500 });

			try {
				const results: any[] = await Promise.all(
					targetNames.map(async (name) => {
						try {
							const result: any = await fetchArcgisLayerAttributes({ endpoint: record.endpoint, layerId: name });
							return { ...result, layerId: name, layerTitle: titleOf(name) };
						} catch (error: any) {
							console.warn('[RSVC] 子层属性查询失败:', name, error);
							return { error: error?.message || '查询失败', layerId: name, layerTitle: name };
						}
					})
				);

				const ok = results.filter((item) => !item.error && item.records?.length);
				if (!ok.length) {
					const firstError = results.find((item) => item.error);
					throw new Error(firstError?.error || '所有子图层均无要素');
				}

				const merged: any = mergeSublayerAttributes(ok);
				const datasetKey = `rsvc-attr:${serviceId}:${subLayerName || 'all'}`;
				const datasetName = `${record.title}${subLayerName ? ` · ${titleOf(subLayerName)}` : ''}`;

				this.attrStore.datasets[datasetKey] = {
					id: datasetKey,
					layerId: datasetKey,
					layerName: datasetName,
					sourceType: 'remote-service',
					geometryType: 'unknown',
					metadata: { endpoint: record.endpoint },
					rows: merged.records.map((record2: any, index: number) => ({
						id: `${datasetKey}:${record2.featureId}`,
						featureId: record2.featureId,
						layerId: datasetKey,
						layerName: datasetName,
						sourceType: 'remote-service',
						geometryType: 'unknown',
						properties: record2.properties,
						rawAttributes: {},
						statistics: {},
						geometry: record2.geometry || null,
						extent: record2.extent || null,
						searchText: Object.values(record2.properties)
							.map((value) => String(value ?? ''))
							.join(' ')
							.toLowerCase(),
						__index: index,
					})),
					fieldConfig: Object.fromEntries(
						merged.fields.map((field: any) => [
							field.key,
							{ key: field.key, alias: field.alias, visible: true, type: field.type },
						])
					),
					statistics: {},
				};

				this.attrStore.openTable(datasetKey, datasetName);
				if (merged.records.length >= 2000) {
					this.message?.info?.('数据量较大，属性表仅显示前 2000 条', { duration: 3000 });
				}
			} catch (error: any) {
				this.message?.error?.(`属性表查询失败：${error?.message || '未知错误'}`);
			}
			return;
		}

		const targetLayer = (this.props.userLayers || []).find((item: any) => item.id === layerId);
		this.attrStore.openTable(layerId, targetLayer?.name || this.t('layer.unnamedLayer'));
		this.activeTab.value = 'layers';
	};

	public setStyleTarget = (layerId: string) => {
		this.layerStore.setStyleTarget(layerId);
		this.activeTab.value = 'style';
	};

	public activateDrawTool = (tool: any) => {
		this.layerStore.setDrawTool(tool);
		this.ctx.emit('interaction', tool);
	};

	public applyTemplate = (templateId: string) => {
		// 1. 没有选中目标则直接返回
		const targetId = this.selectedEditLayerId.value;
		if (!targetId) return;

		// 2. 更新本地 styleForm（让界面底部的颜色选择器实时同步变色）
		const targetTemplate = this.styleTemplates.find((tpl: any) => tpl.id === templateId);
		if (targetTemplate) {
			this.styleForm.value.fillColor = targetTemplate.color;
			// 描边色通常设为与填充色一致
			this.styleForm.value.strokeColor = targetTemplate.color;
		}

		// 3. 业务 emit（三维图层走 update-cesium-layer-style，不参与 OL 的模板下发）
		if (!targetId.startsWith(CESIUM_NODE_PREFIX)) {
			if (targetId === 'draw') {
				this.ctx.emit('apply-style-template', { target: 'draw', templateId });
			} else {
				this.ctx.emit('apply-style-template', { target: 'layer', layerId: targetId, templateId });
			}
		}

		// 4. 立即触发渲染，用户点击模板后地图即时变色
		this.applyStyle();
	};

	/**
	 * 应用样式。按目标 id 分三路：
	 *   draw                → OL 绘制图层（emit update-draw-style）
	 *   cesium:<recordId>   → 三维图层（emit update-cesium-layer-style，经 HomeView 路由到 CesiumContainer）
	 *   其它                → OL 普通图层（emit update-layer-style）
	 */
	public applyStyle = () => {
		const payload = this.styleEditor.buildStylePayload();
		const targetId = this.selectedEditLayerId.value;
		if (!targetId) return;

		if (targetId === 'draw') {
			this.ctx.emit('update-draw-style', payload);
			return;
		}
		if (targetId.startsWith(CESIUM_NODE_PREFIX)) {
			this.ctx.emit('update-cesium-layer-style', {
				id: targetId.slice(CESIUM_NODE_PREFIX.length),
				styleConfig: payload,
			});
			return;
		}
		this.ctx.emit('update-layer-style', { layerId: targetId, styleConfig: payload });
	};

	//#endregion
}
