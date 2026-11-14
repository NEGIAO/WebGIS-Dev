/**
 * 功能名称：路线规划面板（公交 / 驾车）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：视图层逻辑入口。天地图公交 JSON 与驾车 XML 两条链路的请求、解析、
 *          步骤渲染与地图联动均集中于此；无跨组件复用逻辑，暂不拆 composable。
 */
import { computed, defineComponent, reactive, ref, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import MapPointPickerCard from './MapPointPickerCard.vue';
import { Bus, Car, Route, TriangleAlert, X } from '@lucide/vue';
import { parseDriveRouteXml } from '@ol/routing/utils/driveXmlParser';
import { locationToAddress } from '@/api';
import { showLoading, hideLoading } from '@common/ui/loading';
import { useLocale } from '@common/app/useLocale';
import { formatDistanceMeasure } from '@common/map-view/units';
import { useMessage } from '@common/shell/useMessage';

// ── 类型定义 ──
export interface TransitStation {
	name: string;
	lonlat: string;
}

export interface TransitSegmentLine {
	linePoint: string;
	lineName: string;
	segmentTime?: number | string;
	segmentDistance?: number | string;
}

export interface TransitSegment {
	segmentType: 1 | 2 | number;
	stationStart: TransitStation;
	stationEnd: TransitStation;
	segmentLine: TransitSegmentLine[];
}

export interface TransitLine {
	lineName?: string;
	segments: TransitSegment[];
}

export interface TransitResultGroup {
	lineType?: string | number;
	lines?: TransitLine[];
}

export interface TransitResponse {
	resultCode?: string | number;
	msg?: string;
	message?: string;
	results?: TransitResultGroup[];
}

export interface StepInfo {
	index: number;
	segmentType: number;
	modeText: string;
	segmentName: string;
	startName: string;
	endName: string;
	time: number;
	/** 带单位的距离展示文本（跟随用户偏好单位制） */
	distanceText: string;
}

export interface RouteCandidate {
	id: string;
	lineName: string;
	time: number;
	/** 带单位的距离展示文本（跟随用户偏好单位制） */
	distanceText: string;
	segments: TransitSegment[];
	steps: StepInfo[];
}

export interface ParsedRouteResult {
	/** 带单位的距离展示文本（跟随用户偏好单位制） */
	distanceText: string;
	durationText: string;
	routelatlon: string;
	steps: Array<{ text: string; linePoint: string }>;
}

/** 天地图 Token 未配置或为空 */
class TokenMissingError extends Error {
	constructor() {
		super('TokenMissing');
		this.name = 'TokenMissingError';
	}
}

/** 驾车分段配色板（步骤序号取模） */
const DRIVE_STEP_COLOR_PALETTE = ['#10B981', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'];

// ── Props ──
const propDefine = {
	/** 触发模式：公交 / 驾车 */
	mode: { type: String as PropType<'bus' | 'drive'>, required: true },
	token: { type: String, default: '' },
	/** 地图取点（两个模式共用同一实现） */
	startPointPick: {
		type: Function as PropType<(type: 'start' | 'end') => Promise<{ lng: number; lat: number } | null>>,
	},
	// ---- 公交模式回调 ----
	drawRouteOnMap: { type: Function as PropType<(route: RouteCandidate) => Promise<void> | void> },
	zoomToBusRouteStep: { type: Function as PropType<(stepIndex: number) => Promise<void> | void> },
	previewBusRouteStep: { type: Function as PropType<(stepIndex: number) => Promise<void> | void> },
	clearBusRouteStepPreview: { type: Function as PropType<() => Promise<void> | void> },
	// ---- 驾车模式回调 ----
	drawDriveRouteOnMap: {
		type: Function as PropType<(payload: { routeLatLonStr: string; stepLinePoints: string[] }) => Promise<void> | void>,
	},
	zoomToDriveRouteStep: { type: Function as PropType<(stepIndex: number) => Promise<void> | void> },
	previewDriveRouteStep: { type: Function as PropType<(stepIndex: number) => Promise<void> | void> },
	clearDriveRouteStepPreview: { type: Function as PropType<() => Promise<void> | void> },
} as const;

export type RoutePlannerPanelProps = ExtractPropTypes<typeof propDefine>;

// ── 组件注册入口 ──
export default defineComponent({
	name: 'RoutePlannerPanel',
	components: { MapPointPickerCard, Bus, Car, Route, TriangleAlert, X },
	props: propDefine,
	emits: ['close'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// ── 组件实例 ──
export class Instance {


	// ── 共享状态 ──
	public pickMode = ref<'' | 'start' | 'end'>('');
	public startPoint = ref<{ lng: number; lat: number } | undefined>(undefined);
	public endPoint = ref<{ lng: number; lat: number } | undefined>(undefined);
	public startAddress = ref('');
	public endAddress = ref('');
	public planning = ref(false);
	public errorMsg = ref('');
	public strategy = ref('');

	// ── 调试信息（两模式字段并集，按模式渲染子集） ──
	public debug = reactive({
		status: 'idle',
		requestUrl: '',
		responseShape: '',
		candidateCount: 0,
		message: '',
		resultCode: '',
		groupCount: 0,
		lineCount: 0,
		rawDistance: '',
		rawDuration: '',
		stepCount: 0,
	});

	// ── 公交状态 ──
	public routes = ref<RouteCandidate[]>([]);
	public selectedRouteIndex = ref(-1);
	public selectedBusStepIndex = ref(-1);

	// ── 驾车状态 ──
	public routeResult = ref<ParsedRouteResult | null>(null);
	public selectedDriveStepIndex = ref(-1);

	public t!: (key: string, params?: Record<string, any>) => string;
	private message: ReturnType<typeof useMessage>;

	constructor(
		private props: RoutePlannerPanelProps,
		_ctx: SetupContext<['close']>
	) {
		this.message = useMessage();
		const { t } = useLocale();
		this.t = t;
		// 初始策略依赖 mode，必须在参数属性赋值后设置
		this.strategy.value = this.props.mode === 'bus' ? '1' : '0';
	}

	//#region props 透传

	get mode() {
		return this.props.mode;
	}
	get token() {
		return this.props.token;
	}
	get startPointPick() {
		return this.props.startPointPick;
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

	//#endregion

	//#region 派生

	public strategyOptions = computed(() =>
		this.props.mode === 'bus'
			? [
					{ value: '1', label: this.t('routing.strategy.fast') },
					{ value: '2', label: this.t('routing.strategy.lessTransfer') },
					{ value: '3', label: this.t('routing.strategy.lessWalk') },
					{ value: '4', label: this.t('routing.strategy.noMetro') },
				]
			: [
					{ value: '0', label: this.t('routing.strategy.fastest') },
					{ value: '1', label: this.t('routing.strategy.shortest') },
					{ value: '2', label: this.t('routing.strategy.avoidHighway') },
					{ value: '3', label: this.t('routing.strategy.walkMode') },
				]
	);

	public planButtonText = computed(() => {
		if (this.planning.value) return this.props.mode === 'bus' ? this.t('routing.planning') : this.t('routing.navigating');
		return this.props.mode === 'bus' ? this.t('routing.startBusPlan') : this.t('routing.startNav');
	});

	public selectedRoute = computed<RouteCandidate | null>(() => {
		const idx = Number(this.selectedRouteIndex.value);
		if (idx < 0 || idx >= this.routes.value.length) return null;
		return this.routes.value[idx] || null;
	});

	//#endregion

	//#region 调试

	private resetDebug() {
		this.debug.status = 'requesting';
		this.debug.requestUrl = '';
		this.debug.responseShape = '';
		this.debug.candidateCount = 0;
		this.debug.message = '';
		this.debug.resultCode = '';
		this.debug.groupCount = 0;
		this.debug.lineCount = 0;
		this.debug.rawDistance = '';
		this.debug.rawDuration = '';
		this.debug.stepCount = 0;
	}

	//#endregion

	//#region 公交解析

	private parseSegmentMetrics(segment: TransitSegment) {
		const firstLine = Array.isArray(segment?.segmentLine) ? segment.segmentLine[0] : undefined;
		const time = Number(firstLine?.segmentTime ?? 0);
		const distance = Number(firstLine?.segmentDistance ?? 0);
		return {
			time: Number.isFinite(time) ? time : 0,
			distance: Number.isFinite(distance) ? distance : 0,
		};
	}

	private resolveStationName(name: string | undefined, type: 'start' | 'end', index: number, total: number): string {
		const normalized = String(name || '').trim();
		if (normalized) return normalized;
		if (type === 'start' && index === 0) return this.t('routing.start');
		if (type === 'end' && index === total - 1) return this.t('routing.end');
		return this.t('routing.via');
	}

	private getSegmentDisplayName(segment: TransitSegment, stepIndex: number): string {
		const firstLine = Array.isArray(segment?.segmentLine) ? segment.segmentLine[0] : undefined;
		const lineName = String(firstLine?.lineName || '').trim();
		if (Number(segment?.segmentType ?? 0) === 1) return lineName || this.t('routing.walk');
		return lineName || this.t('routing.busSegment', { n: stepIndex + 1 });
	}

	private normalizeTransitResults(raw: TransitLine[]): RouteCandidate[] {
		if (!Array.isArray(raw)) return [];

		return raw.map((item, idx) => {
			const segmentList = Array.isArray(item?.segments) ? item.segments : [];
			const total = segmentList.reduce(
				(acc, segment) => {
					const metrics = this.parseSegmentMetrics(segment);
					return { time: acc.time + metrics.time, distance: acc.distance + metrics.distance };
				},
				{ time: 0, distance: 0 }
			);

			const lineName =
				String(item?.lineName || '')
					.replace(/\s*\|\s*$/, '')
					.trim() || this.t('routing.planIndex', { n: idx + 1 });

			const steps: StepInfo[] = segmentList.map((segment, segmentIndex) => {
				const metrics = this.parseSegmentMetrics(segment);
				const segmentType = Number(segment?.segmentType ?? 0);
				const startName = this.resolveStationName(segment?.stationStart?.name, 'start', segmentIndex, segmentList.length);
				const endName = this.resolveStationName(segment?.stationEnd?.name, 'end', segmentIndex, segmentList.length);
				const segmentName = this.getSegmentDisplayName(segment, segmentIndex);

				return {
					index: segmentIndex,
					segmentType,
					modeText: segmentType === 1 ? this.t('routing.walk') : this.t('routing.transitMode'),
					segmentName,
					startName,
					endName,
					time: Math.round(metrics.time),
					distanceText: formatDistanceMeasure(metrics.distance),
				};
			});

			return {
				id: `${idx}_${lineName}`,
				lineName,
				time: Math.round(total.time),
				distanceText: formatDistanceMeasure(total.distance),
				segments: segmentList,
				steps,
			};
		});
	}

	private extractLinesFromTransitResponse(data: TransitResponse) {
		const groups = Array.isArray(data?.results) ? data.results : [];
		const allLines: TransitLine[] = [];
		groups.forEach((group) => {
			const lines = Array.isArray(group?.lines) ? group.lines : [];
			lines.forEach((line) => allLines.push(line));
		});
		return { groups, lines: allLines };
	}

	//#endregion

	//#region 公交规划

	public startTransitPlan = async () => {
		if (!this.startPoint.value || !this.endPoint.value) {
			this.errorMsg.value = this.t('routing.needStartEnd');
			return;
		}

		this.planning.value = true;
		showLoading(this.t('loading.busRoute'));
		this.errorMsg.value = '';
		this.resetDebug();

		try {
			const tk = String(this.props.token || '').trim();
			if (!tk) throw new Error(this.t('routing.tokenMissing'));

			const postObj = {
				startposition: `${this.startPoint.value.lng},${this.startPoint.value.lat}`,
				endposition: `${this.endPoint.value.lng},${this.endPoint.value.lat}`,
				linetype: String(this.strategy.value),
			};

			const encodedPostStr = encodeURIComponent(JSON.stringify(postObj));
			const requestUrl = `https://api.tianditu.gov.cn/transit?tk=${encodeURIComponent(tk)}&type=busplan&postStr=${encodedPostStr}`;
			// 不在 debug 中记录含 Token 的 URL，防止 Token 泄露
			this.debug.requestUrl = `https://api.tianditu.gov.cn/transit?type=busplan`;

			const res = await fetch(requestUrl, { method: 'GET' });
			this.debug.status = `http ${res.status}`;
			if (!res.ok) throw new Error(this.t('routing.busRequestFailed', { status: res.status }));

			const data = (await res.json()) as TransitResponse;
			const shapeKeys = data && typeof data === 'object' ? Object.keys(data).slice(0, 8).join(', ') : typeof data;
			const extracted = this.extractLinesFromTransitResponse(data);
			const normalized = this.normalizeTransitResults(extracted.lines);

			this.debug.responseShape = shapeKeys || '-';
			this.debug.candidateCount = normalized.length;
			this.debug.message = data?.msg || data?.message || '';
			this.debug.resultCode = String(data?.resultCode ?? '');
			this.debug.groupCount = extracted.groups.length;
			this.debug.lineCount = extracted.lines.length;

			this.routes.value = normalized;
			this.selectedRouteIndex.value = normalized.length ? 0 : -1;
			this.selectedBusStepIndex.value = -1;

			if (normalized.length && this.props.drawRouteOnMap) await this.props.drawRouteOnMap(normalized[0]);

			if (!normalized.length) {
				this.errorMsg.value = this.t('routing.busNoPlan');
				this.debug.status = 'empty';
				if (Number(data?.resultCode) !== 0) this.debug.message = `resultCode=${data?.resultCode}`;
			}
		} catch (err: any) {
			const rawMessage = err?.message || '';
			const isNetworkError = /failed\s+to\s+fetch/i.test(String(rawMessage));
			const hint = isNetworkError ? this.t('routing.networkBlocked') : '';
			const failText = hint || rawMessage || this.t('routing.busPlanFailed');
			this.errorMsg.value = failText;
			this.routes.value = [];
			this.selectedRouteIndex.value = -1;
			this.selectedBusStepIndex.value = -1;
			this.debug.status = 'error';
			this.debug.message = failText;
			this.message.error(failText);
		} finally {
			this.planning.value = false;
			hideLoading();
		}
	};

	public handleSelectRoute = async (route: RouteCandidate, idx: number) => {
		this.selectedRouteIndex.value = idx;
		this.selectedBusStepIndex.value = -1;
		if (!this.props.drawRouteOnMap) return;
		try {
			await this.props.drawRouteOnMap(route);
		} catch (err: any) {
			this.errorMsg.value = err?.message || this.t('routing.drawRouteFailed');
		}
	};

	public handleSelectStep = async (stepIndex: number) => {
		this.selectedBusStepIndex.value = stepIndex;
		try {
			if (this.props.drawRouteOnMap && this.selectedRoute.value) await this.props.drawRouteOnMap(this.selectedRoute.value);
			if (!this.props.zoomToBusRouteStep) return;
			await this.props.zoomToBusRouteStep(stepIndex);
		} catch (err: any) {
			this.errorMsg.value = err?.message || this.t('routing.stepLocateFailed');
		}
	};

	public handlePreviewStep = async (stepIndex: number) => {
		try {
			if (!this.props.previewBusRouteStep) return;
			await this.props.previewBusRouteStep(stepIndex);
		} catch {
			// 预览失败不影响主流程
		}
	};

	public clearStepPreview = async () => {
		try {
			if (!this.props.clearBusRouteStepPreview) return;
			await this.props.clearBusRouteStepPreview();
		} catch {
			// 预览失败不影响主流程
		}
	};

	//#endregion

	//#region 驾车

	public getStepColor = (stepIndex: number): string => {
		const idx = Math.abs(Number(stepIndex || 0)) % DRIVE_STEP_COLOR_PALETTE.length;
		return DRIVE_STEP_COLOR_PALETTE[idx];
	};

	private isValidLngLat(lng: number, lat: number): boolean {
		return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
	}

	private formatDuration(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds <= 0) return this.t('routing.duration.zeroMin');
		const totalMinutes = Math.round(seconds / 60);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		if (hours <= 0) return this.t('routing.duration.minutes', { n: minutes });
		if (minutes <= 0) return this.t('routing.duration.hours', { n: hours });
		return this.t('routing.duration.hoursMinutes', { h: hours, m: minutes });
	}

	public handleSelectDriveStep = async (stepIndex: number): Promise<void> => {
		this.selectedDriveStepIndex.value = stepIndex;
		try {
			if (!this.routeResult.value) return;
			if (this.props.drawDriveRouteOnMap) {
				await this.props.drawDriveRouteOnMap({
					routeLatLonStr: this.routeResult.value.routelatlon,
					// 不过滤空项，保留步骤索引与分段索引的一一对应关系。
					stepLinePoints: this.routeResult.value.steps.map((step) => step.linePoint),
				});
			}
			if (!this.props.zoomToDriveRouteStep) return;
			await this.props.zoomToDriveRouteStep(stepIndex);
		} catch (e) {
			this.errorMsg.value = e instanceof Error ? e.message : this.t('routing.stepLocateFailed');
		}
	};

	public handlePreviewDriveStep = async (stepIndex: number): Promise<void> => {
		try {
			if (!this.props.previewDriveRouteStep) return;
			await this.props.previewDriveRouteStep(stepIndex);
		} catch {
			// 预览失败不影响主流程
		}
	};

	public clearDriveStepPreview = async (): Promise<void> => {
		try {
			if (!this.props.clearDriveRouteStepPreview) return;
			await this.props.clearDriveRouteStepPreview();
		} catch {
			// 预览失败不影响主流程
		}
	};

	public startDriveSearch = async (): Promise<void> => {
		this.errorMsg.value = '';
		this.routeResult.value = null;
		this.selectedDriveStepIndex.value = -1;

		const oLng = Number(this.startPoint.value?.lng);
		const oLat = Number(this.startPoint.value?.lat);
		const dLng = Number(this.endPoint.value?.lng);
		const dLat = Number(this.endPoint.value?.lat);

		if (!this.isValidLngLat(oLng, oLat) || !this.isValidLngLat(dLng, dLat)) {
			this.errorMsg.value = this.t('routing.needValidCoords');
			return;
		}

		this.planning.value = true;
		showLoading(this.t('loading.drivingRoute'));
		this.resetDebug();

		try {
			const token = String(this.props.token || '').trim();
			if (!token) throw new TokenMissingError();

			const postObj = {
				orig: `${oLng.toFixed(6)},${oLat.toFixed(6)}`,
				dest: `${dLng.toFixed(6)},${dLat.toFixed(6)}`,
				style: String(this.strategy.value),
			};

			const encodedPostStr = encodeURIComponent(JSON.stringify(postObj));
			const requestUrl = `https://api.tianditu.gov.cn/drive?tk=${encodeURIComponent(token)}&type=search&postStr=${encodedPostStr}`;
			// 不在 debug 中记录含 Token 的 URL，防止 Token 泄露
			this.debug.requestUrl = `https://api.tianditu.gov.cn/drive?type=search`;

			const response = await fetch(requestUrl, { method: 'GET' });
			this.debug.status = `http ${response.status}`;
			if (!response.ok) throw new Error(this.t('routing.requestFailedStatus', { status: response.status }));

			// 天地图 drive API 返回 XML，交给独立解析器处理。
			const xmlString = await response.text();
			const parsed = parseDriveRouteXml(xmlString);
			const steps = parsed.segments
				.map((seg) => ({ text: seg.guide, linePoint: seg.streetLatLon }))
				.filter((step) => step.text);

			this.routeResult.value = {
				distanceText: formatDistanceMeasure(Number.isFinite(parsed.distanceKm) ? parsed.distanceKm * 1000 : 0),
				durationText: parsed.durationText || this.formatDuration(parsed.durationSec),
				routelatlon: parsed.routeLatLon,
				steps,
			};

			this.debug.rawDistance = String(parsed.distanceKm || 0);
			this.debug.rawDuration = String(parsed.durationSec || 0);
			this.debug.stepCount = steps.length;
			this.debug.status = 'success';

			if (!steps.length) this.debug.message = this.t('routing.noStepsParsed');

			// 地图渲染（可能抛出错误，但不影响已解析的数据）
			if (parsed.routeLatLon && this.props.drawDriveRouteOnMap) {
				await this.props.drawDriveRouteOnMap({
					routeLatLonStr: parsed.routeLatLon,
					stepLinePoints: steps.map((step) => step.linePoint),
				});
			}
		} catch (e) {
			const rawMessage = e instanceof Error ? e.message : String(e || '');
			let text: string;
			if (e instanceof TokenMissingError) text = this.t('routing.tokenMissing');
			else if (/failed\s+to\s+fetch/i.test(rawMessage)) text = this.t('routing.networkBlocked');
			else text = rawMessage || this.t('routing.navFailed');

			this.errorMsg.value = text;
			this.debug.status = 'error';
			this.debug.message = text;
		} finally {
			this.planning.value = false;
			hideLoading();
		}
	};

	//#endregion

	//#region 地图取点与结果回填

	public enablePick = async (type: 'start' | 'end') => {
		if (!this.props.startPointPick) {
			this.errorMsg.value = this.t('routing.mapNotReady');
			return;
		}

		this.pickMode.value = type;
		this.errorMsg.value = '';

		try {
			const point = await this.props.startPointPick(type);
			if (!point) return;

			const lng = Number(point.lng);
			const lat = Number(point.lat);
			if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error(this.t('routing.invalidMapCoord'));

			if (type === 'start') this.startPoint.value = { lng, lat };
			else this.endPoint.value = { lng, lat };

			try {
				const reverse: any = await locationToAddress(lng, lat, 'base');
				const label = String(reverse?.formattedAddress || '').trim();
				if (type === 'start') this.startAddress.value = label;
				else this.endAddress.value = label;
			} catch {
				if (type === 'start') this.startAddress.value = '';
				else this.endAddress.value = '';
			}
		} catch (err: any) {
			this.errorMsg.value = err?.message || this.t('routing.mapPickFailed');
		} finally {
			this.pickMode.value = '';
		}
	};

	public onSelectStartResult = (result: { lng: number; lat: number; address: string }) => {
		this.startPoint.value = { lng: result.lng, lat: result.lat };
		this.startAddress.value = result.address || '';
		this.errorMsg.value = '';
	};

	public onSelectEndResult = (result: { lng: number; lat: number; address: string }) => {
		this.endPoint.value = { lng: result.lng, lat: result.lat };
		this.endAddress.value = result.address || '';
		this.errorMsg.value = '';
	};

	//#endregion
}
