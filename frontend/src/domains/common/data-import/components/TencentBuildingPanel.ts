/**
 * 功能名称：建筑白模抓取面板（腾讯 / 高德 / 天地图三源）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：范围表单 + 合规确认 + 抓取进度 + 入库/下载。
 *          三个数据源各持一个 composable 实例，`cur` 按当前源路由，桥接后模板写法与单源一致。
 */
import { computed, defineComponent, onMounted, reactive, ref, watch, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { Building2, Download, MapPin, TriangleAlert, X } from '@lucide/vue';
import ExtentPicker from '@common/components/ExtentPicker.vue';
import CesiumExtentPicker from '@common/components/CesiumExtentPicker.vue';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import { AMAP_DEFAULT_ZOOM, estimateAmapTiles, useAmapBuildingFetch } from '../useAmapBuildingFetch';
import {
	estimateTdtVectorTiles,
	TDT_DEFAULT_ZOOM,
	TDT_ZOOM_OPTIONS,
	useTdtBuildingFetch,
} from '../useTdtBuildingFetch';
import { estimateTxbTiles, TXB_DEFAULT_ZOOM, TXB_ZOOM_OPTIONS, useTencentBuildingFetch } from '../useTencentBuildingFetch';
import { ALL_TDT_VECTOR_LAYERS, TDT_VECTOR_LAYER_META, tdtVectorLayerOptions } from '../parsers/tdtVectorLayers';

const COMPLIANCE_CONFIRM_STORAGE_KEY = 'webgis_building_fetch_compliance_confirmed_v1';
/** 临时凭证格式闸门：仅接受 24~64 位字母数字（高德 key / 天地图 tk 实测均为 32 位） */
const CREDENTIAL_PATTERN = /^[A-Za-z0-9]{24,64}$/;

// 一、Emits
type EmitsType = ['upload-data', 'close'];

// 二、Props
const propDefine = {
	/** 返回 Cesium Viewer（3D 框选，HomeView 经 SidePanel 注入） */
	getCesiumViewer: { type: Function as PropType<any>, default: null },
	/** 返回 Cesium 命名空间（3D 框选） */
	getCesium: { type: Function as PropType<any>, default: null },
	/** 当前引擎 'ol' | 'cesium'（决定用哪种框选） */
	activeEngine: { type: String, default: 'ol' },
} as const;

export type TencentBuildingPanelProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'TencentBuildingPanel',
	components: { ExtentPicker, CesiumExtentPicker, Building2, Download, MapPin, TriangleAlert, X },
	props: propDefine,
	emits: ['upload-data', 'close'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t!: (key: string, params?: Record<string, any>) => string;

	/** 数据源：tencent（腾讯）| amap（高德）| tianditu（天地图，走管理端 L2 tk） */
	public source = ref('tencent');

	// ── 三个源各自的抓取实例 ──
	private txb = useTencentBuildingFetch();
	private amb = useAmapBuildingFetch();
	private tdb = useTdtBuildingFetch();

	// ── 表单与凭证 ──
	public form = reactive({ minLng: '', minLat: '', maxLng: '', maxLat: '' });
	/** 三个数据源各自的临时凭证草稿（留空 = 用管理端 L2），分开存避免切 tab 串值 */
	private credentials = reactive({ tencent: '', amap: '', tianditu: '' });

	public zoom = ref(TXB_DEFAULT_ZOOM);
	public complianceAccepted = ref(false);
	public complianceConfirmed = ref(false);
	public complianceDialogOpen = ref(false);
	public complianceDialogTitleId = 'building-compliance-dialog-title';

	private complianceDialogResolve: ((confirmed: boolean) => void) | null = null;
	private message: ReturnType<typeof useMessage>;

	constructor(
		private props: TencentBuildingPanelProps,
		private ctx: SetupContext<EmitsType>
	) {
		const { t } = useLocale();
		this.t = t;
		this.message = useMessage();
		this.emit = this.ctx.emit;
		this.init();
	}

	//#region props 透传

	get getCesiumViewer() {
		return this.props.getCesiumViewer;
	}
	get getCesium() {
		return this.props.getCesium;
	}
	get activeEngine() {
		return this.props.activeEngine;
	}

	//#endregion

	//#region 派生

	public isAmap = computed(() => this.source.value === 'amap');
	public isTianditu = computed(() => this.source.value === 'tianditu');

	/** 当前源实例 */
	private cur = computed(() => (this.isAmap.value ? this.amb : this.isTianditu.value ? this.tdb : this.txb));

	/** 桥接：在 getter 内取内层 .value（computed 不拍平返回的 ref，不能直接透传） */
	public status = computed(() => this.cur.value.status.value);
	public isFetching = computed(() => this.cur.value.isFetching.value);
	public progress = computed(() => this.cur.value.progress.value);
	public error = computed(() => this.cur.value.error.value);
	public result = computed(() => this.cur.value.result.value);
	public fileName = computed(() => this.cur.value.fileName.value);

	/** 天地图多选选项（码 + 中文含义） */
	public vectorLayerOptions = computed(() => tdtVectorLayerOptions().filter((o: any) => o.value !== 'all'));
	/** 选中层码数组（模板直接消费，避免嵌套 ref 不解包） */
	public selectedLayerList = computed(() => this.tdb.selectedLayers.value || []);
	public allVectorLayersChecked = computed(
		() => this.tdb.selectedLayers.value.length === ALL_TDT_VECTOR_LAYERS.length
	);
	/** 全量结果判定（result 带 vector 标记才走分层展示/入库） */
	public isTiandituVectorResult = computed(() => this.isTianditu.value && !!this.result.value?.vector);
	public vectorLayerCount = computed(() =>
		this.result.value?.layerStats ? Object.keys(this.result.value.layerStats).length : 0
	);

	// ── 桥接当前源的方法（模板与逻辑写法与单源一致） ──
	public cancel = (...args: any[]) => (this.cur.value.cancel as any)(...args);
	public buildImportFile = (...args: any[]) => (this.cur.value.buildImportFile as any)(...args);
	public startFetch = (...args: any[]) => (this.cur.value.startFetch as any)(...args);
	public downloadResult = (...args: any[]) => {
		// 天地图全量走分层下载，其余走单文件下载
		if (this.isTianditu.value && this.tdb.vectorResult.value) return (this.tdb.downloadVectorResult as any)(...args);
		return (this.cur.value.downloadResult as any)(...args);
	};


	/** 当前数据源对应的输入框绑定：显示各自的草稿，切换 tab 不串值 */
	public sourceCredential = computed({
		get: () => this.credentials[this.source.value as 'tencent' | 'amap' | 'tianditu'] || '',
		set: (value: any) => {
			this.credentials[this.source.value as 'tencent' | 'amap' | 'tianditu'] = String(value ?? '');
		},
	});

	public zoomOptions = computed(() => (this.isTianditu.value ? TDT_ZOOM_OPTIONS : TXB_ZOOM_OPTIONS));
	public engineLabel = computed(() => (this.props.activeEngine === 'cesium' ? '3D' : '2D'));

	/** 抓取量估算（输入合法时显示，防手滑拉全城；按源走各自瓦片格网） */
	public estimate = computed(() => {
		const bbox = this.parsedBbox();
		if (!bbox) return null;
		try {
			if (this.isAmap.value) return estimateAmapTiles(bbox, this.zoom.value);
			if (this.isTianditu.value) return estimateTdtVectorTiles(bbox, this.zoom.value);
			return estimateTxbTiles(bbox, this.zoom.value);
		} catch {
			return null;
		}
	});

	public canFetch = computed(
		() =>
			!!this.parsedBbox() &&
			!this.isFetching.value &&
			(!this.isTianditu.value || this.selectedLayerList.value.length > 0)
	);

	public progressPercent = computed(() => {
		if (!this.progress.value.total) return 0;
		return Math.round((this.progress.value.done / this.progress.value.total) * 100);
	});

	/** 错误码转文案（composable 只抛短码，文案归 i18n） */
	public errorText = computed(() => {
		if (!this.error.value) return '';
		const known = [
			'empty',
			'nan',
			'order',
			'range',
			'oversize',
			'key_required',
			'tdt_key_required',
			'tdt_permission',
			'layers_required',
		];
		if (known.includes(this.error.value)) return this.t(`shell.buildings.err_${this.error.value}`);
		return this.t('shell.buildings.fetchFailed', { error: this.error.value });
	});

	//#endregion

	//#region 生命周期

	private init() {
		watch(this.source, (s) => {
			this.zoom.value = s === 'amap' ? AMAP_DEFAULT_ZOOM : s === 'tianditu' ? TDT_DEFAULT_ZOOM : TXB_DEFAULT_ZOOM;
		});

		onMounted(() => {
			try {
				this.complianceConfirmed.value = sessionStorage.getItem(COMPLIANCE_CONFIRM_STORAGE_KEY) === '1';
			} catch {
				this.complianceConfirmed.value = false;
			}
		});
	}

	//#endregion

	//#region 天地图图层多选

	public toggleVectorLayer = (code: string) => {
		// 允许清空到 0 层（抓取按钮禁用 + 提示，不再静默回退全量）
		const set = new Set(this.tdb.selectedLayers.value);
		if (set.has(code)) set.delete(code);
		else set.add(code);
		this.tdb.selectedLayers.value = ALL_TDT_VECTOR_LAYERS.filter((c: string) => set.has(c));
	};

	/** 全选 ⇄ 全不选 */
	public toggleAllVectorLayers = () => {
		this.tdb.selectedLayers.value = this.allVectorLayersChecked.value ? [] : ALL_TDT_VECTOR_LAYERS.slice();
	};

	public vectorLayerLabel = (code: string | number) => (TDT_VECTOR_LAYER_META as any)[code]?.label || String(code);

	public layerFeatureCount = (code: string | number) =>
		this.tdb.vectorResult.value?.layers?.[code as string]?.features?.length || 0;

	//#endregion

	//#region 合规确认

	private requestComplianceConfirmation() {
		this.complianceDialogOpen.value = true;
		return new Promise<boolean>((resolve) => {
			this.complianceDialogResolve = resolve;
		});
	}

	public resolveComplianceDialog = (confirmed: boolean) => {
		this.complianceDialogOpen.value = false;
		const resolve = this.complianceDialogResolve;
		this.complianceDialogResolve = null;
		if (resolve) resolve(confirmed);
	};

	//#endregion

	//#region 表单与校验

	/** 框选器点「清除」时同步清空表单（表单是抓取的事实来源） */
	public clearFormBbox = () => {
		this.form.minLng = '';
		this.form.minLat = '';
		this.form.maxLng = '';
		this.form.maxLat = '';
	};

	/** 解析表单为数值 bbox，非法返回 null */
	private parsedBbox() {
		const bbox = {
			minLng: Number.parseFloat(this.form.minLng),
			minLat: Number.parseFloat(this.form.minLat),
			maxLng: Number.parseFloat(this.form.maxLng),
			maxLat: Number.parseFloat(this.form.maxLat),
		};
		if (Object.values(bbox).some((v) => !Number.isFinite(v))) return null;
		return bbox;
	}

	/**
	 * 校验临时凭证格式。
	 * @returns 空串表示通过（含留空走 L2），否则返回提示文案
	 */
	private credentialFormatError(input: string) {
		const value = String(input || '').trim();
		if (!value) return '';
		return CREDENTIAL_PATTERN.test(value) ? '' : this.t('shell.buildings.err_credential_format');
	}

	/** 框选完成：ExtentPicker / CesiumExtentPicker 同形 payload，直接填表 */
	public onExtentPicked = ({ extent }: { extent?: number[] } = {}) => {
		if (!Array.isArray(extent) || extent.length !== 4) return;
		const [minLng, minLat, maxLng, maxLat] = extent;
		if ([minLng, minLat, maxLng, maxLat].some((v) => !Number.isFinite(Number(v)))) return;
		this.form.minLng = String(Number(minLng).toFixed(4));
		this.form.minLat = String(Number(minLat).toFixed(4));
		this.form.maxLng = String(Number(maxLng).toFixed(4));
		this.form.maxLat = String(Number(maxLat).toFixed(4));
	};

	//#endregion

	//#region 抓取与入库

	/** 开始抓取；成功后按当前引擎自动入库（上层 upload-data 按引擎路由） */
	public onFetch = async () => {
		if (!this.complianceAccepted.value) {
			this.message.warning(this.t('shell.buildings.err_compliance_required'));
			return;
		}
		if (!this.complianceConfirmed.value) {
			const ok = await this.requestComplianceConfirmation();
			if (!ok) return;
			this.complianceConfirmed.value = true;
			try {
				sessionStorage.setItem(COMPLIANCE_CONFIRM_STORAGE_KEY, '1');
			} catch {
				// ignore storage failures
			}
		}

		const bbox = this.parsedBbox();
		if (!bbox) {
			this.message.warning(this.t('shell.buildings.err_nan'));
			return;
		}

		// 临时凭证只做「本次使用」，留空回落到管理端 L2；格式不符时中止，绝不把可疑串发往第三方
		const credential = this.credentials[this.source.value as 'tencent' | 'amap' | 'tianditu'].trim();
		const credentialError = this.credentialFormatError(credential);
		if (credentialError) {
			this.message.warning(credentialError);
			return;
		}

		// 天地图走全量分层抓取（多选层码），腾讯/高德走各自单源抓取
		if (this.isTianditu.value) {
			const out = await this.tdb.startVectorFetch(bbox, this.zoom.value, credential, this.tdb.selectedLayers.value);
			if (!out) return;
			const files = this.tdb.buildVectorImportFiles();
			if (!files.length) {
				this.message.warning(this.t('shell.buildings.empty'));
				return;
			}
			this.emit('upload-data', { resources: files });
			this.message.success(
				this.t('shell.buildings.vectorImported', {
					layers: files.length,
					count: this.result.value?.featureCount || 0,
				})
			);
			return;
		}

		// 高德可带临时 key，留空由 composable 回落到管理端 L2；腾讯白模当前无需凭证，不传第三参
		const fc = this.isAmap.value
			? await this.amb.startFetch(bbox, this.zoom.value, credential)
			: await this.txb.startFetch(bbox, this.zoom.value);
		if (!fc) return;
		if (!fc.features.length) {
			this.message.warning(this.t('shell.buildings.empty'));
			return;
		}
		const file = this.txb.buildImportFile();
		if (file) {
			this.emit('upload-data', { resources: [file] });
			this.message.success(this.t('shell.buildings.imported', { name: this.fileName.value }));
		} else {
			this.message.success(
				this.t('shell.buildings.result', {
					count: fc.features.length,
					seconds: ((this.result.value?.elapsedMs || 0) / 1000).toFixed(1),
				})
			);
		}
	};

	//#endregion
}
