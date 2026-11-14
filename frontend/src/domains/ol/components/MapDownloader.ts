/**
 * 功能名称：底图下载面板
 * 日    期：2026/11/13（范式化改造）
 * 说    明：⚠️ 底图下载依赖 /api/download/*，后端 V3.6.5 已删除该模块，当前 HF Space 返回 404。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch, type ExtractPropTypes, type SetupContext } from 'vue';
import { apiDownloadCancelTask, apiDownloadTaskFile } from '@/api/download';
import { apiEstimateDownloadCost } from '@/api/backend/admin';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useDownloadStore } from '@common/data-import/stores/useDownloadStore';
import { triggerBrowserDownload, triggerUrlDownload } from '@common/utils/browserDownload';
import { DOWNLOAD_SERVICE_BASE_URL } from '@/config/publicRuntime';
import { copyToClipboard } from '@common/utils/clipboard';
import { BASEMAP_OPTIONS, createLayerConfigs, resolvePresetLayerIds } from '@/constants';
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';
import ExtentPicker from '@common/components/ExtentPicker.vue';
import MyDownloadTasks from './MyDownloadTasks.vue';

// 一、Emits
type EmitsType = ['close'];

// 二、Props
const propDefine = {
	visible: { type: Boolean, default: true },
} as const;

export type MapDownloaderProps = ExtractPropTypes<typeof propDefine>;

/** 前端可视化模式倒计时初值（30 分钟） */
const INITIAL_SECONDS = 1800;

// 三、组件注册入口
export default defineComponent({
	name: 'MapDownloader',
	components: { ExtentPicker, MyDownloadTasks },
	props: propDefine,
	emits: ['close'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	/** 模板直接调用的 emit（对应原 <script setup> 中 defineEmits 的返回值） */
	public emit!: SetupContext<EmitsType>['emit'];
	public activeTab = ref('config');

	// ── 下载配额 ──
	public quotaRemaining = ref<number | null>(null);
	public quotaCost = ref<number | null>(null);
	public quotaChecking = ref(false);

	// ── 倒计时（progressive 模式） ──
	public timeLeft = ref(INITIAL_SECONDS);
	public timer = ref<ReturnType<typeof setInterval> | null>(null);

	// ── 传输状态 ──
	public transferState = ref({ active: false, downloaded: 0, total: 0, progress: 0, error: '' });
	public lastTransferredTaskId = ref('');

	// ── 底图预设 ──
	public selectedPreset = ref('');
	public useCustomBasemapName = ref(false);
	public layerConfigVersion = ref(0);
	public layerConfigs: any[] = [];
	public layerConfigMap = new Map<string, any>();

	// ── 任务查询 ──
	public lookupTaskId = ref('');

	/** 下载 store（模板大量直读 store.*，整体暴露） */
	public store: ReturnType<typeof useDownloadStore>;

	public t!: (key: string, params?: Record<string, any>) => string;
	private message: ReturnType<typeof useMessage>;

	/** 运行时地图 token（随运行时配置刷新） */
	private tiandituTk: string;
	private ovitalTdtkey: string;
	/** 前端可视化下载的中断句柄 */
	private abortController: AbortController | null = null;

	constructor(
		private props: MapDownloaderProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.emit = this.ctx.emit;
		this.message = useMessage();
		const { t } = useLocale();
		this.t = t;
		this.store = useDownloadStore();

		const tokens = getRuntimeMapTokensSync();
		this.tiandituTk = tokens.tiandituTk;
		this.ovitalTdtkey = tokens.ovitalTdtkey;
		this.layerConfigs = createLayerConfigs(this.tiandituTk, this.ovitalTdtkey);
		this.layerConfigMap = new Map(this.layerConfigs.map((item: any) => [item.id, item]));

		this.init();
	}

	get visible() {
		return this.props.visible;
	}

	//#region 派生

	public countdownText = computed(() => {
		if (this.timeLeft.value <= 0) return this.t('mapDownload.timedOut');
		const minutes = Math.floor(this.timeLeft.value / 60);
		const seconds = this.timeLeft.value % 60;
		return this.t('mapDownload.countdown', { m: minutes, s: String(seconds).padStart(2, '0') });
	});

	/** 可下载底图预设：能解析出 {z}/{x}/{y} 模板，或本身是自定义 URL */
	public tilePresets = computed(() => {
		const sourceOptions = this.layerConfigVersion.value >= 0 ? BASEMAP_OPTIONS : [];
		return sourceOptions
			.map((option: any) => {
				const template = this.resolvePresetTemplate(option.value);
				const isCustom = option.value === 'custom';
				const downloadable = isCustom || Boolean(template);
				return { id: option.value, label: option.label, template, downloadable, isCustom };
			})
			.filter((preset: any) => (preset.downloadable || preset.isCustom) && preset.id !== 'local_tiles_preset');
	});

	public activePreset = computed(() => this.tilePresets.value.find((item: any) => item.id === this.selectedPreset.value));
	public isCustomPreset = computed(() => this.activePreset.value?.isCustom || !this.activePreset.value?.template);

	public activePresetHint = computed(() => {
		if (!this.activePreset.value) return '';
		if (this.activePreset.value.isCustom) return this.t('mapDownload.customUrlHint');
		if (!this.activePreset.value.template) return this.t('mapDownload.basemapNotExportable');
		return '';
	});

	public statusText = computed(() => {
		if (this.transferState.value.active) return this.t('mapDownload.transferring');
		if (this.transferState.value.error) return this.t('mapDownload.transferFailed');

		const statusMap: Record<string, string> = {
			idle: this.t('mapDownload.statusIdle'),
			pending: this.t('mapDownload.statusPending'),
			downloading: this.t('mapDownload.statusDownloading'),
			stitching: this.t('mapDownload.statusStitching'),
			success: this.t('mapDownload.statusSuccess'),
			expired: this.t('mapDownload.statusExpired'),
			failed: this.t('mapDownload.statusFailed'),
		};
		return statusMap[this.store.status] || this.store.status;
	});

	public statusClass = computed(() => {
		if (this.transferState.value.active) return 'status-transferring';
		if (this.transferState.value.error) return 'status-failed';
		return `status-${this.store.status}`;
	});

	public progressWidth = computed(() => `${Math.min(100, Math.max(0, this.store.progress))}%`);
	public progressLabel = computed(() => `${Math.round(this.store.progress)}%`);

	/** 实时配额消耗：下载中按已处理瓦片比例实时计算，空闲时显示后端估算值 */
	public currentQuotaCost = computed(() => {
		if (this.quotaCost.value === null || this.quotaCost.value <= 0) return null;
		if (this.store.isRunning && this.store.tileCount > 0 && this.store.tilesDownloaded > 0) {
			const ratio = this.store.tilesDownloaded / this.store.tileCount;
			return Math.max(1, Math.round(this.quotaCost.value * ratio));
		}
		return this.quotaCost.value;
	});

	public displayLastError = computed(() => this.resolveStoreText(this.store.lastError));
	public displayStoreMessage = computed(() => this.resolveStoreText(this.store.message));

	public expiresHint = computed(() => {
		if (!this.store.expiresAt && !this.store.expiresInSeconds) return '';
		if (this.store.isExpired) return this.t('mapDownload.taskExpired');
		if (this.store.expiresInSeconds > 0) {
			const minutes = Math.max(1, Math.ceil(this.store.expiresInSeconds / 60));
			return this.t('mapDownload.taskExpiresIn', { minutes });
		}
		return '';
	});

	//#endregion

	//#region 生命周期

	private init() {
		// 配额消耗跟随 estimatedTileCount 变化（而非 bbox 变化），保证时序一致
		watch(
			() => this.store.estimatedTileCount,
			() => this.estimateCurrentCost()
		);

		// 监听后端状态：任务成功后根据用户选择的模式自动触发下载
		watch(
			() => this.store.status,
			(newStatus) => {
				if (
					newStatus === 'success' &&
					this.store.taskId &&
					!this.transferState.value.active &&
					this.lastTransferredTaskId.value !== this.store.taskId &&
					!this.transferState.value.error
				) {
					if (this.store.downloadMode === 'progressive') this.downloadFileToLocal();
					else this.browserManagedDownload(this.store.taskId);
				}
			}
		);

		watch(
			() => [this.store.bbox.minLon, this.store.bbox.minLat, this.store.bbox.maxLon, this.store.bbox.maxLat, this.store.resolutionM],
			() => this.store.updateEstimatedTileCount()
		);

		watch(
			this.tilePresets,
			(list: any[]) => {
				if (!list.length) return;
				if (!this.selectedPreset.value || !list.some((item) => item.id === this.selectedPreset.value)) {
					const first = list.find((item) => item.downloadable) || list[0];
					this.selectedPreset.value = first?.id || '';
				}
			},
			{ immediate: true }
		);

		watch(this.selectedPreset, (presetId) => {
			const preset: any = this.tilePresets.value.find((item: any) => item.id === presetId);
			if (preset && preset.template) this.store.setTileUrlTemplate(preset.template);
			if (!this.useCustomBasemapName.value) this.store.basemapName = preset?.label || '';
		});

		onMounted(async () => {
			this.loadDownloadQuota();
			const tokens: any = await loadRuntimeMapTokens();
			this.refreshLayerConfigs(tokens?.tiandituTk, tokens?.ovitalTdtkey);
			this.store.fetchMyTasks();
			this.store.updateEstimatedTileCount(0);
		});

		onBeforeUnmount(() => {
			this.store.dispose();
			this.cancelTransfer();
			this.stopCountdown();
		});
	}

	//#endregion

	//#region 配额

	private async loadDownloadQuota() {
		try {
			this.quotaChecking.value = true;
			const res: any = await apiEstimateDownloadCost(0);
			if (res?.status === 'success') this.quotaRemaining.value = Number(res.remaining ?? 0);
		} catch {
			this.quotaRemaining.value = null;
		} finally {
			this.quotaChecking.value = false;
		}
	}

	private async estimateCurrentCost() {
		const tileCount = this.store.estimatedTileCount;
		if (!tileCount || tileCount <= 0) {
			this.quotaCost.value = null;
			return;
		}
		this.quotaChecking.value = true;
		try {
			const res: any = await apiEstimateDownloadCost(tileCount);
			if (res?.status === 'success') this.quotaCost.value = Number(res.cost ?? 0);
		} catch {
			this.quotaCost.value = null;
		} finally {
			this.quotaChecking.value = false;
		}
	}

	//#endregion

	//#region 范围与底图配置

	public applyExtentFromPicker = ({ extent }: any) => {
		if (extent?.length === 4) this.store.applyBboxFromExtent(extent, 'EPSG:4326');
	};

	public handleClearExtent = () => {
		this.store.clearExtent();
	};

	/** 运行时 token 变化时重建图层配置（token 未变则跳过） */
	private refreshLayerConfigs(tiandituTk: any, ovitalTdtkey: any) {
		const nextTiandituTk = String(tiandituTk || '').trim();
		const nextOvitalTdtkey = String(ovitalTdtkey || '').trim();
		const tiandituChanged = nextTiandituTk && nextTiandituTk !== this.tiandituTk;
		const ovitalChanged = nextOvitalTdtkey && nextOvitalTdtkey !== this.ovitalTdtkey;
		if (!tiandituChanged && !ovitalChanged) return;

		if (tiandituChanged) this.tiandituTk = nextTiandituTk;
		if (ovitalChanged) this.ovitalTdtkey = nextOvitalTdtkey;
		const nextLayerConfigs = createLayerConfigs(this.tiandituTk, this.ovitalTdtkey);
		this.layerConfigs.splice(0, this.layerConfigs.length, ...nextLayerConfigs);
		this.layerConfigMap = new Map(this.layerConfigs.map((item: any) => [item.id, item]));
		this.layerConfigVersion.value += 1;
	}

	/** 从图层 source 中提取可用的 {z}/{x}/{y} 模板；含 {-y} 的不可用 */
	private extractTileTemplate(source: any) {
		if (!source) return '';
		const directUrl = typeof source.getUrl === 'function' ? source.getUrl() : '';
		const urls = typeof source.getUrls === 'function' ? source.getUrls() : null;
		const candidate = directUrl || (Array.isArray(urls) ? urls[0] : '');
		if (!candidate) return '';
		if (candidate.includes('{-y}')) return '';
		if (candidate.includes('{z}') && candidate.includes('{x}') && candidate.includes('{y}')) return candidate;
		return '';
	}

	private resolvePresetTemplate(presetId: string) {
		const layerIds = resolvePresetLayerIds(presetId);
		for (const layerId of layerIds) {
			const config = this.layerConfigMap.get(layerId);
			if (!config || config.category === 'label') continue;
			try {
				const source = config.createSource?.();
				const template = this.extractTileTemplate(source);
				if (template) return template;
			} catch {
				continue;
			}
		}
		return '';
	}

	public onBasemapNameToggle = (event: Event) => {
		this.useCustomBasemapName.value = (event.target as HTMLInputElement).checked;
		if (!this.useCustomBasemapName.value) {
			const preset: any = this.tilePresets.value.find((item: any) => item.id === this.selectedPreset.value);
			this.store.basemapName = preset?.label || '';
		}
	};

	//#endregion

	//#region 下载 URL 与浏览器托管下载

	/**
	 * 构建浏览器托管下载 URL（下载节点 /file 端点无需登录）
	 *
	 * 必须用 DOWNLOAD_SERVICE_BASE_URL 而不是 BACKEND_BASE_URL：
	 * 下载任务由独立节点（gis.negiao.cn）执行与存储，主后端（V3.6.5+）
	 * 已删除 /api/download/*，拼到 BACKEND_BASE_URL 会直接 404。
	 */
	private buildDownloadUrl(taskId: string) {
		const safeId = encodeURIComponent(String(taskId || '').trim());
		return `${DOWNLOAD_SERVICE_BASE_URL}/api/download/tasks/${safeId}/file`;
	}

	/** 通过浏览器原生下载文件（Chrome 右上角显示进度，无 Save As 弹窗） */
	public browserManagedDownload = (taskId: string) => {
		if (!taskId) {
			this.message.error(this.t('mapDownload.errNoTaskId'));
			return;
		}
		if (this.store.isExpired) {
			this.message.error(this.t('mapDownload.expiredCannotDownload'));
			return;
		}
		triggerUrlDownload(this.buildDownloadUrl(taskId));
	};

	//#endregion

	//#region 倒计时

	public startCountdown = () => {
		this.stopCountdown();
		this.timeLeft.value = INITIAL_SECONDS;
		this.timer.value = setInterval(() => {
			if (this.timeLeft.value > 0) this.timeLeft.value--;
			else this.stopCountdown();
		}, 1000);
	};

	public stopCountdown = () => {
		if (this.timer.value) {
			clearInterval(this.timer.value);
			this.timer.value = null;
		}
	};

	//#endregion

	//#region 前端可视化下载

	public formatBytes = (bytes: number, decimals = 2) => {
		if (!bytes) return '0 Bytes';
		const k = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
	};

	/** 生成可读文件名：预设名_分辨率_月_日_时.tif */
	private buildReadableFilename() {
		const activePreset = this.layerConfigMap.get(this.selectedPreset.value);
		const presetName = String(activePreset?.label || this.selectedPreset.value || 'basemap')
			.trim()
			.replace(/[/:*?"<>|]+/g, '_')
			.replace(/\s+/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/g, '');
		const resolution = Number(this.store.resolutionM || 0);
		const resolutionPart = Number.isFinite(resolution) ? `${resolution}m` : '0m';
		const now = new Date();
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const dd = String(now.getDate()).padStart(2, '0');
		const hh = String(now.getHours()).padStart(2, '0');
		return `${presetName}_${resolutionPart}_${mm}_${dd}_${hh}.tif`;
	}

	public cancelTransfer = () => {
		if (this.abortController) {
			this.abortController.abort('UserCancelled');
			this.abortController = null;
		}
		this.stopCountdown();
	};

	public downloadFileToLocal = async () => {
		if (!this.store.taskId) return;
		this.cancelTransfer();
		this.startCountdown();

		this.transferState.value = { active: true, downloaded: 0, total: 0, progress: 0, error: '' };
		this.abortController = new AbortController();

		try {
			const response: any = await apiDownloadTaskFile(
				this.store.taskId,
				(progress: number, meta: any) => {
					this.transferState.value.progress = progress;
					const loaded = Number(meta?.loaded || 0);
					const total = Number(meta?.total || 0);
					if (loaded > 0) this.transferState.value.downloaded = loaded;
					if (total > 0) this.transferState.value.total = total;
				},
				{ signal: this.abortController.signal }
			);

			const blob = response?.data;
			if (!(blob instanceof Blob) || blob.size <= 0) throw new Error(this.t('mapDownload.emptyFile'));

			const contentLength = Number(response?.headers?.['content-length'] || 0);
			if (contentLength > 0) {
				this.transferState.value.total = contentLength;
				this.transferState.value.downloaded = Math.max(this.transferState.value.downloaded, contentLength);
				this.transferState.value.progress = 100;
			}

			let filename = this.buildReadableFilename();
			const disposition = String(response?.headers?.['content-disposition'] || '');
			if (disposition.includes('attachment')) {
				const filenameRegex = /filename\*?=(?:UTF-8''|['"])?([^;'"\n]+)/i;
				const matches = filenameRegex.exec(disposition);
				if (matches && matches[1]) filename = decodeURIComponent(matches[1].replace(/['"]/g, '').trim());
			}

			triggerBrowserDownload(blob, filename);

			this.transferState.value.active = false;
			this.transferState.value.error = '';
			this.lastTransferredTaskId.value = this.store.taskId;
			this.message.success(this.t('mapDownload.downloadSuccess'));
			this.stopCountdown();
		} catch (err: any) {
			const canceledByUser = err?.code === 'ERR_CANCELED';
			if (canceledByUser) {
				this.transferState.value.error = this.t('mapDownload.canceledByUser');
			} else {
				this.transferState.value.error = this.t('mapDownload.transferFailedDetail', { msg: err?.message || '' });
				this.message.error(this.t('mapDownload.transferToLocalFailed'));
			}
			this.transferState.value.active = false;
			this.transferState.value.progress = 0;
			this.stopCountdown();
		} finally {
			this.abortController = null;
		}
	};

	//#endregion

	//#region 任务操作

	/** store 里的文案可能是 i18n key，也可能是纯文本 */
	private resolveStoreText(raw: any) {
		const s = String(raw || '').trim();
		if (!s) return '';
		if (s.startsWith('mapDownload.')) return this.t(s);
		return s;
	}

	public handleSubmit = async () => {
		this.transferState.value = { active: false, downloaded: 0, total: 0, progress: 0, error: '' };
		this.lastTransferredTaskId.value = '';
		this.stopCountdown();

		const ok = await this.store.submitTask();
		if (ok) {
			this.message.success(
				this.store.clipToExtent ? this.t('mapDownload.taskSubmittedClip') : this.t('mapDownload.taskSubmittedGrid')
			);
			this.loadDownloadQuota();
		} else if (this.store.lastError) {
			this.message.error(this.resolveStoreText(this.store.lastError));
		}
	};

	public handleReset = () => {
		this.store.resetTask();
		this.cancelTransfer();
		this.stopCountdown();
		this.transferState.value = { active: false, downloaded: 0, total: 0, progress: 0, error: '' };
		this.lastTransferredTaskId.value = '';
		const first: any = this.tilePresets.value.find((item: any) => item.downloadable) || this.tilePresets.value[0];
		this.selectedPreset.value = first?.id || '';
	};

	public handleRedownload = () => {
		if (!this.store.taskId) return;
		// 默认浏览器托管；若用户选了 progressive 则用前端可视化
		if (this.store.downloadMode === 'progressive') this.downloadFileToLocal();
		else this.browserManagedDownload(this.store.taskId);
	};

	public handleLookup = async () => {
		const ok = await this.store.fetchTaskById(this.lookupTaskId.value, true);
		if (ok) this.message.success(this.t('mapDownload.taskStatusUpdated'));
		else if (this.store.lastError) this.message.error(this.resolveStoreText(this.store.lastError));
	};

	public handleDownloadFromList = async (task: any) => {
		this.store.resetTask();
		this.store.setExternalTask(task.task_id);
		if (task.file_ready) {
			if (this.store.downloadMode === 'progressive') this.downloadFileToLocal();
			else this.browserManagedDownload(task.task_id);
		} else {
			this.message.warning(this.t('mapDownload.fileNotReady'));
		}
	};

	public handleViewFromList = async (task: any) => {
		this.lookupTaskId.value = task.task_id || '';
		this.activeTab.value = 'config';
		await this.handleLookup();
	};

	public handleCancelFromList = async (task: any) => {
		await apiDownloadCancelTask(task.task_id);
		this.message.success(this.t('mapDownload.cancelSuccess'));
		this.store.fetchMyTasks();
	};

	public copyTaskId = async (taskId: string) => {
		const id = String(taskId || '').trim();
		if (!id) return;
		await copyToClipboard(id);
		this.message.success(this.t('mapDownload.taskIdCopied'));
	};

	//#endregion
}
