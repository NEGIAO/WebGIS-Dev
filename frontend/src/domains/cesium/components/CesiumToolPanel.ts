/**
 * 功能名称：Cesium 工具面板
 * 日    期：2026/11/13（范式化改造）
 * 说    明：视图层逻辑入口。页签与折叠态持久化、WMS 图层枚举、模块/动作图标映射、
 *          叠加层与数据导入事件派发。
 */
import { computed, defineComponent, onBeforeUnmount, ref, watch, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import {
	Box,
	Building,
	Check,
	ChevronDown,
	Cloud,
	Crosshair,
	Download,
	Droplets,
	Eye,
	FastForward,
	FileArchive,
	FileDown,
	FileUp,
	Flag,
	FolderOpen,
	Globe,
	Home,
	Layers,
	Link as LinkIcon,
	LocateFixed,
	Maximize2,
	Minimize2,
	MapPin,
	Mountain,
	Navigation,
	Pause,
	PenLine,
	PersonStanding,
	Plane,
	Play,
	Rewind,
	RotateCcw,
	Route,
	ScanEye,
	Send,
	SlidersHorizontal,
	Square,
	Sun,
	Trash2,
	Upload,
	Waves,
	Wind,
	X,
} from '@lucide/vue';
import LilGuiControls from './LilGuiControls.vue';
import { useLocale } from '@common/app/useLocale';
import { looksLikeWmsSourceUrl, ensureWmsServiceInfo } from '@common/basemap/wmsService';

// 一、Emits 类型
type EmitsType = (
	| 'update:open'
	| 'update:activeBasemap'
	| 'update:activeTerrain'
	| 'module-action'
	| 'control-change'
	| 'overlay-toggle'
	| 'custom-basemap-submit'
	| 'remote-service-submit'
	| 'update:customIonHeightOffset'
	| 'data-import'
	| 'import-tileset-zip'
	| 'import-tileset-folder'
	| 'import-tileset-sample'
)[];

// 二、Props
const propDefine = {
	open: { type: Boolean, default: true },
	embedded: { type: Boolean, default: false },
	basemapOptions: { type: Array as PropType<any[]>, default: () : any => [] },
	terrainOptions: { type: Array as PropType<any[]>, default: () : any => [] },
	overlayOptions: { type: Array as PropType<any[]>, default: () : any => [] },
	activeBasemap: { type: String, default: '' },
	activeTerrain: { type: String, default: '' },
	customBasemapUrl: { type: String, default: '' },
	customIonHeightOffset: { type: Number, default: 0 },
	customIonTilesetReady: { type: Boolean, default: false },
	modules: { type: Array as PropType<any[]>, default: () : any => [] },
	storageKey: { type: String, default: 'cesium_tool_panel_ui' },
} as const;

export type CesiumToolPanelProps = ExtractPropTypes<typeof propDefine>;

/** UI 状态版本：升级后旧持久化数据不再恢复折叠态 */
const UI_STATE_VERSION = 3;

/** 数据导入接受的文件扩展名 */
const SUPPORTED_FORMATS = '.geojson,.json,.kml,.kmz,.shp,.dbf,.shx,.prj,.cpg,.glb,.gltf,.czml,.zip,.csv,.txt,.wkt';

// 三、组件注册入口
export default defineComponent({
	name: 'CesiumToolPanel',
	components: {
		Box,
		Building,
		Check,
		ChevronDown,
		Eye,
		FileArchive,
		FolderOpen,
		Globe,
		Layers,
		LilGuiControls,
		LinkIcon,
		LocateFixed,
		MapPin,
		Maximize2,
		Minimize2,
		Mountain,
		Navigation,
		Send,
		SlidersHorizontal,
		Upload,
		X,
	},
	props: propDefine,
	emits: [
		'update:open',
		'update:activeBasemap',
		'update:activeTerrain',
		'module-action',
		'control-change',
		'overlay-toggle',
		'custom-basemap-submit',
		'remote-service-submit',
		'update:customIonHeightOffset',
		'data-import',
		'import-tileset-zip',
		'import-tileset-folder',
		'import-tileset-sample',
	],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	/** 模板直接调用的 emit（对应原 <script setup> 中 defineEmits 的返回值） */
	public emit!: SetupContext<EmitsType>['emit'];
	public supportedFormats = SUPPORTED_FORMATS;

	// ── 页签与折叠态（初值依赖 localStorage 与 props，在构造函数内赋值） ──
	public activeTab = ref('scene');
	public compactMode = ref(true);
	public expandedLayerSectionIds = ref(new Set<string>());
	public expandedModuleIds = ref(new Set<string>());
	public customBasemapDraft = ref('');

	// ── 样例菜单 ──
	public fileInputRef = ref<HTMLInputElement | null>(null);
	public sampleDropdownRef = ref<HTMLElement | null>(null);
	public sampleMenuOpen = ref(false);
	public sampleMenuStyle = ref<Record<string, string>>({});
	public sceneSampleDropdownRef = ref<HTMLElement | null>(null);
	public sceneSampleMenuOpen = ref(false);
	public sceneSampleMenuStyle = ref<Record<string, string>>({});

	// ── 远程 3D 服务 ──
	public remoteServiceType = ref('ion');
	public remoteServiceUrl = ref('');

	// ── WMS 图层枚举 ──
	public wmsLayerOptions = ref<any[]>([]);
	public selectedWmsLayer = ref('');
	public wmsLayersLoading = ref(false);

	public t!: (key: string, params?: Record<string, any>) => string;

	/** 防止连续输入导致的竞态回填 */
	private wmsLayersFetchToken = 0;
	/** 场景样例菜单的延迟绑定定时器 */
	private sceneMenuListenerTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private props: CesiumToolPanelProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.emit = this.ctx.emit;
		const { t } = useLocale();
		this.t = t;

		const storedUiState: any = this.readStoredUiState();
		const shouldRestoreExpansionState = storedUiState.uiStateVersion === UI_STATE_VERSION;
		this.activeTab.value = storedUiState.activeTab || 'scene';
		this.compactMode.value = storedUiState.compactMode !== false;
		this.expandedLayerSectionIds.value = new Set<string>(
			shouldRestoreExpansionState ? storedUiState.expandedLayerSectionIds || [] : []
		);
		this.expandedModuleIds.value = new Set<string>(shouldRestoreExpansionState ? storedUiState.expandedModuleIds || [] : []);
		this.customBasemapDraft.value = this.props.customBasemapUrl || '';

		this.init();
	}

	//#region props 透传

	get open() {
		return this.props.open;
	}
	get embedded() {
		return this.props.embedded;
	}
	get basemapOptions() {
		return this.props.basemapOptions;
	}
	get terrainOptions() {
		return this.props.terrainOptions;
	}
	get overlayOptions() {
		return this.props.overlayOptions;
	}
	get activeBasemap() {
		return this.props.activeBasemap;
	}
	get activeTerrain() {
		return this.props.activeTerrain;
	}
	get customBasemapUrl() {
		return this.props.customBasemapUrl;
	}
	get customIonHeightOffset() {
		return this.props.customIonHeightOffset;
	}
	get customIonTilesetReady() {
		return this.props.customIonTilesetReady;
	}
	get modules() {
		return this.props.modules;
	}
	get storageKey() {
		return this.props.storageKey;
	}

	//#endregion

	//#region 派生

	public isPanelOpen = computed(() => this.props.embedded || this.props.open);
	public sceneModule = computed(() => (this.props.modules || []).find((m: any) => m.id === 'scene') || null);
	public sceneActions = computed(() => this.sceneModule.value?.actions || []);
	public featureModules = computed(() => (this.props.modules || []).filter((m: any) => m.id !== 'scene'));
	public activeModuleCount = computed(
		() => this.featureModules.value.filter((m: any) => m.statusTone === 'success' || m.statusTone === 'warning').length
	);
	public activeOverlayCount = computed(() => (this.props.overlayOptions || []).filter((o: any) => !!o.active).length);

	public panelTabs = computed(() => [
		{ id: 'scene', label: this.t('cesium.scene'), icon: Navigation },
		{ id: 'layers', label: this.t('cesium.layers'), icon: Layers },
		{ id: 'data', label: this.t('cesium.data'), icon: Upload },
		{ id: 'modules', label: this.t('cesium.modules'), icon: SlidersHorizontal },
	]);

	public activeBasemapLabel = computed(
		() => (this.props.basemapOptions || []).find((o: any) => o.value === this.props.activeBasemap)?.label || this.t('cesium.notSelected')
	);

	public activeTerrainLabel = computed(
		() => (this.props.terrainOptions || []).find((o: any) => o.value === this.props.activeTerrain)?.label || this.t('cesium.notSelected')
	);

	//#endregion

	//#region 生命周期

	private init() {
		/** 更新 Data Tab 样例菜单位置（fixed 定位，避免被 .panel-scroll overflow 裁切） */
		watch(this.sampleMenuOpen, (open) => {
			if (!open || !this.sampleDropdownRef.value) return;
			const rect = this.sampleDropdownRef.value.getBoundingClientRect();
			this.sampleMenuStyle.value = {
				position: 'fixed',
				top: `${rect.bottom + 4}px`,
				left: `${rect.left}px`,
				width: `${rect.width}px`,
			};
		});

		/** 更新场景 Tab 样例菜单位置（fixed 定位，避免被 .panel-scroll overflow 裁切） */
		watch(this.sceneSampleMenuOpen, (open) => {
			if (!open || !this.sceneSampleDropdownRef.value) return;
			const rect = this.sceneSampleDropdownRef.value.getBoundingClientRect();
			this.sceneSampleMenuStyle.value = {
				position: 'fixed',
				top: `${rect.bottom + 4}px`,
				left: `${rect.left}px`,
				width: `${rect.width}px`,
			};
		});

		/** 点击菜单外区域 → 关闭场景 Tab 样例菜单 */
		watch(this.sceneSampleMenuOpen, (open) => {
			if (open) {
				if (this.sceneMenuListenerTimer) clearTimeout(this.sceneMenuListenerTimer);
				this.sceneMenuListenerTimer = setTimeout(() => {
					this.sceneMenuListenerTimer = null;
					document.addEventListener('click', this.closeSceneSampleMenu);
				}, 0);
			} else {
				if (this.sceneMenuListenerTimer) {
					clearTimeout(this.sceneMenuListenerTimer);
					this.sceneMenuListenerTimer = null;
				}
				document.removeEventListener('click', this.closeSceneSampleMenu);
			}
		});

		// 面板卸载时若菜单开着，document 监听器会常驻——卸载前强制收口
		onBeforeUnmount(() => {
			if (this.sceneMenuListenerTimer) {
				clearTimeout(this.sceneMenuListenerTimer);
				this.sceneMenuListenerTimer = null;
			}
			document.removeEventListener('click', this.closeSceneSampleMenu);
		});

		watch(
			() => (this.props.modules || []).map((m: any) => m.id),
			(moduleIds: string[]) => {
				if (moduleIds.includes(this.activeTab.value)) return;
				if (['scene', 'layers', 'modules'].includes(this.activeTab.value)) return;
				this.activeTab.value = 'scene';
			},
			{ immediate: true }
		);

		watch([this.activeTab, this.compactMode, this.expandedLayerSectionIds, this.expandedModuleIds], this.persistUiState, {
			deep: true,
		});

		watch(
			() => this.props.customBasemapUrl,
			(url) => {
				if (url !== this.customBasemapDraft.value) this.customBasemapDraft.value = url || '';
			}
		);

		// WMS：输入变化即检测并枚举图层
		watch(this.customBasemapDraft, (draftUrl) => {
			const trimmed = String(draftUrl || '').trim();
			if (!trimmed || !looksLikeWmsSourceUrl(trimmed)) {
				this.resetWmsLayerSelection();
				return;
			}
			void this.fetchWmsLayerOptions(trimmed);
		});
	}

	//#endregion

	//#region 持久化

	private readStoredUiState(): any {
		if (typeof window === 'undefined') return {};
		try {
			const raw = window.localStorage.getItem(this.props.storageKey);
			return raw ? JSON.parse(raw) : {};
		} catch {
			return {};
		}
	}

	private persistUiState = () => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(
				this.props.storageKey,
				JSON.stringify({
					uiStateVersion: UI_STATE_VERSION,
					activeTab: this.activeTab.value,
					compactMode: this.compactMode.value,
					expandedLayerSectionIds: [...this.expandedLayerSectionIds.value],
					expandedModuleIds: [...this.expandedModuleIds.value],
				})
			);
		} catch {
			// Preference storage catch
		}
	};

	//#endregion

	//#region 样例菜单

	public closeSceneSampleMenu = (e: MouseEvent) => {
		if (this.sceneSampleDropdownRef.value && !this.sceneSampleDropdownRef.value.contains(e.target as Node)) {
			this.sceneSampleMenuOpen.value = false;
		}
	};

	//#endregion

	//#region WMS

	public resetWmsLayerSelection = () => {
		this.wmsLayersFetchToken += 1;
		this.wmsLayerOptions.value = [];
		this.selectedWmsLayer.value = '';
		this.wmsLayersLoading.value = false;
	};

	private async fetchWmsLayerOptions(url: string) {
		const token = ++this.wmsLayersFetchToken;
		this.wmsLayersLoading.value = true;
		this.wmsLayerOptions.value = [];
		this.selectedWmsLayer.value = '';

		const info: any = await ensureWmsServiceInfo(url);
		if (token !== this.wmsLayersFetchToken || !looksLikeWmsSourceUrl(this.customBasemapDraft.value)) return;

		this.wmsLayersLoading.value = false;
		if (info?.layerOptions?.length) {
			this.wmsLayerOptions.value = info.layerOptions;
			this.selectedWmsLayer.value = info.layers || info.layerOptions[0]?.name || '';
		}
	}

	/** 切换 WMS 图层下拉框后立即应用，无需再点「加载」 */
	public onWmsLayerChange = () => {
		if (this.wmsLayersLoading.value || !this.wmsLayerOptions.value.length) return;
		if (!looksLikeWmsSourceUrl(this.customBasemapDraft.value)) return;
		this.submitCustomBasemap();
	};

	//#endregion

	//#region 事件派发

	public submitRemoteService = () => {
		this.ctx.emit('remote-service-submit', { type: this.remoteServiceType.value, url: this.remoteServiceUrl.value.trim() });
	};

	public setPanelOpen = (value: boolean) => {
		this.ctx.emit('update:open', value);
	};

	public isLayerSectionExpanded = (sectionId: string) => this.expandedLayerSectionIds.value.has(sectionId);

	public toggleLayerSection = (sectionId: string) => {
		const next = new Set(this.expandedLayerSectionIds.value);
		if (next.has(sectionId)) next.delete(sectionId);
		else next.add(sectionId);
		this.expandedLayerSectionIds.value = next;
	};

	public isModuleExpanded = (moduleId: string) => this.expandedModuleIds.value.has(moduleId);

	public toggleModule = (moduleId: string) => {
		const next = new Set(this.expandedModuleIds.value);
		if (next.has(moduleId)) next.delete(moduleId);
		else next.add(moduleId);
		this.expandedModuleIds.value = next;
	};

	public selectBasemapOption = (option: any) => {
		if (option?.disabled) return;
		this.ctx.emit('update:activeBasemap', option.value);
	};

	public submitCustomBasemap = () => {
		this.ctx.emit('custom-basemap-submit', {
			url: this.customBasemapDraft.value,
			// WMS 时携带用户选择的图层；未选择则由加载逻辑回退默认首层
			wmsLayer: this.wmsLayerOptions.value.length ? this.selectedWmsLayer.value : undefined,
		});
	};

	public emitModuleAction = (moduleId: string, actionId: string) => {
		this.ctx.emit('module-action', { moduleId, actionId });
	};

	public emitControlChange = (moduleId: string, control: any, rawValue: any) => {
		const value = control.type === 'range' ? Number(rawValue) : rawValue;
		this.ctx.emit('control-change', { moduleId, controlId: control.id, value });
	};

	public emitOverlayToggle = (overlay: any) => {
		if (overlay.disabled) return;
		this.ctx.emit('overlay-toggle', { overlayId: overlay.value, value: !overlay.active });
	};

	// ── 叠加层扩展操作（当前 overlay 数据无 hasLocation 字段，按钮不会渲染；预留实现防 undefined） ──
	public emitOverlayFlyTo = (overlay: any) => {
		console.warn('[CesiumToolPanel] 叠加层定位未实现:', overlay?.value);
	};

	public updateOverlayOpacity = (overlay: any, event: any) => {
		const value = Number(event?.target?.value ?? event);
		if (!Number.isFinite(value)) return;
		this.ctx.emit('overlay-toggle', { overlayId: overlay.value, value: true, opacity: value });
	};

	public handleFileSelect = (event: Event) => {
		const files = (event.target as HTMLInputElement)?.files;
		if (!files || files.length === 0) return;
		this.ctx.emit('data-import', { files: Array.from(files) });
		if (this.fileInputRef.value) this.fileInputRef.value.value = '';
	};

	//#endregion

	//#region 图标映射

	public getModuleIcon = (moduleId: string) => {
		const icons: Record<string, any> = {
			scene: Globe,
			atmosphere: Sun,
			cloud: Cloud,
			wind: Wind,
			fluid: Droplets,
			shallowWater: Waves,
			player: PersonStanding,
			analysis: ScanEye,
			planarRoute: Plane,
			routeFly: Route,
		};
		return icons[moduleId] || SlidersHorizontal;
	};

	public getActionIcon = (moduleId: string, actionId: string) => {
		const icons: Record<string, Record<string, any>> = {
			scene: { home: Home, everest: Mountain },
			wind: { load: Play, clear: Trash2 },
			fluid: { pick: Crosshair, floodSim: Waves, clear: Trash2 },
			shallowWater: { toggle: Waves },
			player: { toggle: PersonStanding, changeView: Eye, setNavTarget: Flag, clearNavTarget: X },
			planarRoute: { setTakeoffPoint: MapPin, importKmz: Upload, saveKmz: Download, clearAll: Trash2 },
			routeFly: {
				drawRoute: PenLine,
				startFly: Play,
				suspend: Pause,
				speedUp: FastForward,
				speedDown: Rewind,
				stop: Square,
				importRoute: FileUp,
				exportRoute: FileDown,
				clearAll: Trash2,
			},
		};
		return icons[moduleId]?.[actionId] || RotateCcw;
	};

	//#endregion
}
