/**
 * 功能名称：空间分析面板（缓冲区 / 叠加 / 凸包 / 泰森多边形 / 聚合 / 多环 / 简化 / 渔网）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：工具切换 + 参数表单 + 可运行判定 + 结果提示；分析计算全部经 emit 上抛。
 */
import { computed, defineComponent, ref, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import {
	AlertCircle,
	BoxSelect,
	CheckCircle2,
	CircleDot,
	Combine,
	Grid3x3,
	Info,
	LayoutGrid,
	Network,
	Play,
	Shrink,
	Target,
	X,
} from '@lucide/vue';
import ExtentPicker from '@common/components/ExtentPicker.vue';
import { formatCoordinateValue } from '@common/map-view/coordinateFormatter';
import { useLocale } from '@common/app/useLocale';

// 一、Emits
type EmitsType = ['analysis', 'close'];

// 二、Props
const propDefine = {
	availableLayers: { type: Array as PropType<any[]>, default: () : any => [] },
} as const;

export type SpatialAnalysisPanelProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'SpatialAnalysisPanel',
	components: {
		ExtentPicker,
		AlertCircle,
		BoxSelect,
		CheckCircle2,
		CircleDot,
		Combine,
		Grid3x3,
		Info,
		LayoutGrid,
		Network,
		Play,
		Shrink,
		Target,
		X,
	},
	props: propDefine,
	emits: ['analysis', 'close'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t!: (key: string, params?: Record<string, any>) => string;

	// ── 工具与参数 ──
	public activeTool = ref('');
	public bufferRadius = ref(1000);
	public targetLayerId = ref('');
	public layerA = ref('');
	public layerB = ref('');
	public overlayMode = ref('intersection');
	public resultMessage = ref('');
	public resultType = ref('');

	// ── 空间聚合 ──
	public gridType = ref('grid');
	public gridSize = ref(500);
	public bboxMinLon = ref<any>(null);
	public bboxMinLat = ref<any>(null);
	public bboxMaxLon = ref<any>(null);
	public bboxMaxLat = ref<any>(null);

	// ── 多环缓冲区 ──
	public distancesInput = ref('');

	// ── 几何简化 ──
	public simplifyTolerance = ref(100);

	// ── 渔网分析 ──
	public fishnetMinLon = ref<any>(null);
	public fishnetMinLat = ref<any>(null);
	public fishnetMaxLon = ref<any>(null);
	public fishnetMaxLat = ref<any>(null);
	public fishnetGridSize = ref<any>(null);
	public fishnetGeometryType = ref('polygon');
	public fishnetCreatePoints = ref(false);

	constructor(
		private props: SpatialAnalysisPanelProps,
		private ctx: SetupContext<EmitsType>
	) {
		const { t } = useLocale();
		this.t = t;
		this.emit = this.ctx.emit;
	}

	get availableLayers() {
		return this.props.availableLayers;
	}

	//#region 派生

	/** 分析工具列表：label/description 随语言切换 */
	public analysisTools = computed(() => [
		{ id: 'buffer', label: this.t('spatial.tools.buffer'), description: this.t('spatial.tools.bufferDesc'), icon: CircleDot, color: '#1890ff' },
		{ id: 'overlay', label: this.t('spatial.tools.overlay'), description: this.t('spatial.tools.overlayDesc'), icon: Combine, color: '#52c41a' },
		{ id: 'convexHull', label: this.t('spatial.tools.convexHull'), description: this.t('spatial.tools.convexHullDesc'), icon: BoxSelect, color: '#fa8c16' },
		{ id: 'voronoi', label: this.t('spatial.tools.voronoi'), description: this.t('spatial.tools.voronoiDesc'), icon: Network, color: '#722ed1' },
		{ id: 'aggregation', label: this.t('spatial.tools.aggregate'), description: this.t('spatial.tools.aggregateDesc'), icon: LayoutGrid, color: '#13c2c2' },
		{ id: 'multiRingBuffer', label: this.t('spatial.tools.multiRing'), description: this.t('spatial.tools.multiRingDesc'), icon: Target, color: '#eb2f96' },
		{ id: 'simplify', label: this.t('spatial.tools.simplify'), description: this.t('spatial.tools.simplifyDesc'), icon: Shrink, color: '#faad14' },
		{ id: 'fishnet', label: this.t('spatial.tools.fishnet'), description: this.t('spatial.tools.fishnetDesc'), icon: Grid3x3, color: '#8b5cf6' },
	]);

	public overlayModes = computed(() => [
		{ id: 'intersection', label: this.t('spatial.modes.intersection') },
		{ id: 'union', label: this.t('spatial.modes.union') },
		{ id: 'difference', label: this.t('spatial.modes.difference') },
	]);

	public canRun = computed(() => Boolean(this.targetLayerId.value) && this.bufferRadius.value > 0);
	public canRunOverlay = computed(() => Boolean(this.layerA.value && this.layerB.value && this.overlayMode.value));

	public canRunAggregation = computed(
		() =>
			Boolean(this.targetLayerId.value) &&
			this.isValidBboxVal(this.bboxMinLon.value) &&
			this.isValidBboxVal(this.bboxMinLat.value) &&
			this.isValidBboxVal(this.bboxMaxLon.value) &&
			this.isValidBboxVal(this.bboxMaxLat.value)
	);

	public canRunMultiRing = computed(() => {
		if (!this.targetLayerId.value || !this.distancesInput.value) return false;
		const parts = this.distancesInput.value.split(/[,，\s]+/).filter(Boolean);
		return parts.every((p) => !isNaN(Number(p)) && Number(p) > 0);
	});

	public canRunSimplify = computed(() => Boolean(this.targetLayerId.value) && this.simplifyTolerance.value > 0);

	public canRunFishnet = computed(
		() =>
			this.isValidBboxVal(this.fishnetMinLon.value) &&
			this.isValidBboxVal(this.fishnetMinLat.value) &&
			this.isValidBboxVal(this.fishnetMaxLon.value) &&
			this.isValidBboxVal(this.fishnetMaxLat.value) &&
			(this.fishnetGridSize.value as number) > 0
	);

	//#endregion

	//#region 工具与执行

	/** bbox 值必须是有效数字（null / 空串 / NaN 均视为未填） */
	private isValidBboxVal(v: any) {
		return v !== null && v !== '' && typeof v === 'number' && !isNaN(v);
	}

	public selectTool = (id: string) => {
		this.activeTool.value = this.activeTool.value === id ? '' : id;
		this.resultMessage.value = '';
	};

	public runBuffer = () => {
		if (!this.canRun.value) return;
		this.emit('analysis', { type: 'buffer', targetLayerId: this.targetLayerId.value, radius: this.bufferRadius.value });
		this.showResult('success', this.t('spatial.bufferSubmitted', { radius: this.bufferRadius.value }));
	};

	public runOverlay = () => {
		if (!this.canRunOverlay.value) return;
		if (this.layerA.value === this.layerB.value) {
			this.showResult('error', this.t('spatial.overlaySameLayer'));
			return;
		}
		this.emit('analysis', {
			type: 'overlay',
			operation: this.overlayMode.value,
			layerA: this.layerA.value,
			layerB: this.layerB.value,
		});
		const modeLabel = this.overlayModes.value.find((m) => m.id === this.overlayMode.value)?.label || this.overlayMode.value;
		this.showResult('success', this.t('spatial.overlaySubmitted', { mode: modeLabel }));
	};

	public runConvexHull = () => {
		if (!this.targetLayerId.value) return;
		this.emit('analysis', { type: 'convexHull', targetLayerId: this.targetLayerId.value });
		this.showResult('success', this.t('spatial.convexHullSubmitted'));
	};

	public runVoronoi = () => {
		if (!this.targetLayerId.value) return;
		this.emit('analysis', { type: 'voronoi', targetLayerId: this.targetLayerId.value });
		this.showResult('success', this.t('spatial.voronoiSubmitted'));
	};

	public runAggregation = () => {
		if (!this.canRunAggregation.value) return;
		this.emit('analysis', {
			type: 'aggregation',
			targetLayerId: this.targetLayerId.value,
			bbox: [this.bboxMinLon.value, this.bboxMinLat.value, this.bboxMaxLon.value, this.bboxMaxLat.value],
			gridType: this.gridType.value,
			gridSize: this.gridSize.value,
		});
		const gridLabel = this.gridType.value === 'hexbin' ? this.t('spatial.hexLabel') : this.t('spatial.squareLabel');
		this.showResult('success', this.t('spatial.aggregateSubmitted', { grid: gridLabel }));
	};

	public runMultiRingBuffer = () => {
		if (!this.canRunMultiRing.value) return;
		const distances = this.distancesInput.value
			.split(/[,，\s]+/)
			.filter(Boolean)
			.map(Number)
			.sort((a, b) => a - b);
		this.emit('analysis', { type: 'multiRingBuffer', targetLayerId: this.targetLayerId.value, distances });
		this.showResult('success', this.t('spatial.multiRingSubmitted', { count: distances.length }));
	};

	public runSimplify = () => {
		if (!this.canRunSimplify.value) return;
		this.emit('analysis', {
			type: 'simplify',
			targetLayerId: this.targetLayerId.value,
			tolerance: this.simplifyTolerance.value,
		});
		this.showResult('success', this.t('spatial.simplifySubmitted', { tolerance: this.simplifyTolerance.value }));
	};

	public runFishnet = () => {
		if (!this.canRunFishnet.value) return;
		this.emit('analysis', {
			type: 'fishnet',
			bbox: [this.fishnetMinLon.value, this.fishnetMinLat.value, this.fishnetMaxLon.value, this.fishnetMaxLat.value],
			gridSizeMeters: this.fishnetGridSize.value,
			geometryType: this.fishnetGeometryType.value,
			createCenterPoints: this.fishnetCreatePoints.value,
		});
		const typeLabel = this.fishnetGeometryType.value === 'polygon' ? this.t('spatial.fishnetPolygon') : this.t('spatial.fishnetLine');
		const pointLabel = this.fishnetCreatePoints.value ? this.t('spatial.fishnetWithCenter') : '';
		this.showResult(
			'success',
			this.t('spatial.fishnetSubmitted', {
				size: this.fishnetGridSize.value,
				geom: typeLabel,
				point: pointLabel,
			})
		);
	};

	//#endregion

	//#region BBox 填充

	/** 渔网：从 ExtentPicker 接收 [minLon, minLat, maxLon, maxLat] */
	public fillFishnetBbox = ({ extent }: any) => {
		if (extent?.length !== 4) return;
		this.fishnetMinLon.value = formatCoordinateValue(extent[0]);
		this.fishnetMinLat.value = formatCoordinateValue(extent[1]);
		this.fishnetMaxLon.value = formatCoordinateValue(extent[2]);
		this.fishnetMaxLat.value = formatCoordinateValue(extent[3]);
	};

	public clearFishnetBbox = () => {
		this.fishnetMinLon.value = null;
		this.fishnetMinLat.value = null;
		this.fishnetMaxLon.value = null;
		this.fishnetMaxLat.value = null;
	};

	/** 空间聚合：从 ExtentPicker 接收 [minLon, minLat, maxLon, maxLat] */
	public fillAggregationBbox = ({ extent }: any) => {
		if (extent?.length !== 4) return;
		this.bboxMinLon.value = formatCoordinateValue(extent[0]);
		this.bboxMinLat.value = formatCoordinateValue(extent[1]);
		this.bboxMaxLon.value = formatCoordinateValue(extent[2]);
		this.bboxMaxLat.value = formatCoordinateValue(extent[3]);
	};

	public clearAggregationBbox = () => {
		this.bboxMinLon.value = null;
		this.bboxMinLat.value = null;
		this.bboxMaxLon.value = null;
		this.bboxMaxLat.value = null;
	};

	//#endregion

	/** 结果提示 4 秒后自动消失 */
	public showResult = (type: string, msg: string) => {
		this.resultType.value = type;
		this.resultMessage.value = msg;
		setTimeout(() => {
			this.resultMessage.value = '';
		}, 4000);
	};
}
