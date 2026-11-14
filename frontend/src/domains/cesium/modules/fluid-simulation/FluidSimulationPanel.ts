/**
 * 功能名称：水体流体模拟面板
 * 日    期：2026/11/13（范式化改造）
 * 说    明：地形高度图采样 → FluidRenderer 建水体 → 参数实时调参 → 洪水上涨动画。
 *          场景开关在「水体确定创建」时才翻转，失败时回滚，避免残留全局设置。
 */
import { computed, defineComponent, onBeforeUnmount, ref, watch, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { useMessage } from '@common/shell/useMessage';
import { hideLoading, showLoading } from '@common/ui/loading';
import { translate as t } from '@common/app/useLocale';
import { createFluidRuntime } from './fluidRuntime';
import LilGuiControls from '@cesium-domain/components/LilGuiControls.vue';
import { acquireContinuous, releaseContinuous } from '@cesium-domain/composables/interaction/useCesiumRenderMode';
import { isCloudPipelineActive } from '@cesium-domain/modules/cloud';
import {
	clampNumber,
	createCesiumRgb,
	createTerrainHeightMapSource,
	isValidHexColor,
	normalizeWaterLevel,
	parseHexColor,
	pickCartesianOnGlobe,
	resolveFluidVerticalRange,
	resolveInitialWaterLevel,
} from './terrainHeightMapSampler';

/** 按需渲染计数器 tag：流体 postRender 时间步逐帧执行，水体存活期间需连续渲染 */
const RENDER_MODE_TAG = 'fluid-sim';

const FLUID_TEXTURE_SIZE = 1024;
/** 水平范围尺寸：10KM */
const FLUID_HORIZONTAL_SIZE = 10000;

// 一、Emits
type EmitsType = ['close', 'state-change'];

// 二、Props
const propDefine = {
	headless: { type: Boolean, default: false },
	getViewer: { type: Function as PropType<any>, required: true },
	getCesium: { type: Function as PropType<any>, required: true },
	params: { type: Object as PropType<any>, default: () => ({}) },
} as const;

export type FluidSimulationPanelProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'FluidSimulationPanel',
	components: { LilGuiControls },
	props: propDefine,
	emits: ['close', 'state-change'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {


	public threshold = ref(10);
	public blend = ref(20);
	public lightStrength = ref(3);
	public waterColor = ref('#0d4fa3');
	public waterLevel = ref<number | null>(null);
	public waterLevelMin = ref<number | null>(null);
	public waterLevelMax = ref<number | null>(null);
	public isPicking = ref(false);
	public hasFluid = ref(false);
	public selectedLon = ref<number | null>(null);
	public selectedLat = ref<number | null>(null);

	// 洪水模拟状态
	public floodSimActive = ref(false);
	/** 洪水上涨速度（m/s），默认值会在水位值域确定后自动更新 */
	public floodSimSpeed = ref(5);

	public emit!: SetupContext<EmitsType>['emit'];
	private message: ReturnType<typeof useMessage>;

	// ── 渲染器与场景资源（跨调用持有） ──
	private FluidRenderer: any = null;
	private createSkyEffect: any = null;
	private pickHandler: any = null;
	private fluidRenderer: any = null;
	private skyStage: any = null;
	private sceneSnapshot: any = null;
	/** 创建序号：并发选点时丢弃旧结果 */
	private fluidCreationId = 0;
	private floodAnimFrameId: number | null = null;
	private floodLastTimestamp: number | null = null;

	constructor(
		private props: FluidSimulationPanelProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.message = useMessage();
		this.emit = this.ctx.emit;
		this.init();
	}

	get headless() {
		return this.props.headless;
	}
	get params() {
		return this.props.params;
	}

	//#region 派生

	public selectedText = computed(() => {
		if (!Number.isFinite(this.selectedLon.value) || !Number.isFinite(this.selectedLat.value)) return '';
		return `经度 ${(this.selectedLon.value as number).toFixed(6)} / 纬度 ${(this.selectedLat.value as number).toFixed(6)}`;
	});

	public hasWaterLevelRange = computed(
		() => Number.isFinite(this.waterLevelMin.value) && Number.isFinite(this.waterLevelMax.value)
	);

	public waterLevelStep = computed(() => {
		if (!this.hasWaterLevelRange.value) return 1;
		const span = Math.abs((this.waterLevelMax.value as number) - (this.waterLevelMin.value as number));
		return Math.max(span / 1000, 0.01);
	});

	public fluidGuiControls = computed(() => [
		{
			id: 'threshold',
			label: 'Threshold',
			type: 'range',
			min: 0,
			max: 500,
			step: 0.0001,
			value: this.threshold.value,
			displayValue: Number(this.threshold.value).toFixed(2),
		},
		{
			id: 'blend',
			label: 'Blend',
			type: 'range',
			min: 0,
			max: 50,
			step: 0.0001,
			value: this.blend.value,
			displayValue: Number(this.blend.value).toFixed(2),
		},
		{
			id: 'lightStrength',
			label: 'Light',
			type: 'range',
			min: 0,
			max: 10,
			step: 0.0001,
			value: this.lightStrength.value,
			displayValue: Number(this.lightStrength.value).toFixed(2),
		},
		{
			id: 'waterLevel',
			label: 'Water Level',
			type: 'range',
			min: this.hasWaterLevelRange.value ? this.waterLevelMin.value : 0,
			max: this.hasWaterLevelRange.value ? this.waterLevelMax.value : 1,
			step: this.waterLevelStep.value,
			value: Number.isFinite(Number(this.waterLevel.value)) ? Number(this.waterLevel.value) : 0,
			displayValue:
				this.hasWaterLevelRange.value && Number.isFinite(Number(this.waterLevel.value))
					? `${Number(this.waterLevel.value).toFixed(2)} m`
					: 'Pick terrain first',
			disabled: !this.hasWaterLevelRange.value,
		},
		{ id: 'waterColor', label: 'Water Color', type: 'color', value: this.waterColor.value },
	]);

	//#endregion

	//#region 生命周期

	private init() {
		watch([this.threshold, this.blend, this.lightStrength, this.waterColor], this.applyFluidParams);
		watch(this.waterLevel, this.applyWaterLevelParam);

		watch(
			() => this.props.params,
			(params) => {
				this.syncExternalParams(params || {});
			},
			{ deep: true, immediate: true }
		);

		watch(
			[
				this.isPicking,
				this.hasFluid,
				this.selectedText,
				this.waterLevel,
				this.waterLevelMin,
				this.waterLevelMax,
				this.floodSimActive,
				this.floodSimSpeed,
			],
			this.emitState,
			{ immediate: true }
		);

		onBeforeUnmount(() => {
			this.stopFloodSimulation();
			this.cleanup(true);
		});
	}

	//#endregion

	//#region 运行时与参数

	private getViewerAndCesium() {
		const viewer = this.props.getViewer?.();
		const Cesium = this.props.getCesium?.() || (window as any).Cesium;
		if (!viewer || !Cesium) {
			this.message.warning(t('cesium.fluidToast.sceneNotReady'));
			return null;
		}
		if (!this.FluidRenderer) {
			const runtime = createFluidRuntime(Cesium);
			this.FluidRenderer = runtime.FluidRenderer;
			this.createSkyEffect = runtime.createSkyEffect;
		}
		return { viewer, Cesium };
	}

	private syncExternalParams(params: any) {
		if (Number.isFinite(Number(params.threshold))) this.threshold.value = Number(params.threshold);
		if (Number.isFinite(Number(params.blend))) this.blend.value = Number(params.blend);
		if (Number.isFinite(Number(params.lightStrength))) this.lightStrength.value = Number(params.lightStrength);
		if (isValidHexColor(params.waterColor)) this.waterColor.value = params.waterColor;
		if (Number.isFinite(Number(params.waterLevel))) this.waterLevel.value = Number(params.waterLevel);
	}

	public handleFluidGuiChange = ({ controlId, value }: any) => {
		if (controlId === 'threshold') this.threshold.value = Number(value);
		else if (controlId === 'blend') this.blend.value = Number(value);
		else if (controlId === 'lightStrength') this.lightStrength.value = Number(value);
		else if (controlId === 'waterLevel') this.waterLevel.value = Number(value);
		else if (controlId === 'waterColor' && isValidHexColor(value)) this.waterColor.value = value;
	};

	public emitState = () => {
		this.emit('state-change', {
			isPicking: this.isPicking.value,
			hasFluid: this.hasFluid.value,
			selectedText: this.selectedText.value,
			waterLevel: this.waterLevel.value,
			waterLevelMin: this.waterLevelMin.value,
			waterLevelMax: this.waterLevelMax.value,
			floodSimActive: this.floodSimActive.value,
			floodSpeed: this.floodSimSpeed.value,
		});
	};

	//#endregion

	//#region 选点与建水体

	public startPickHeightMap = () => {
		const runtime = this.getViewerAndCesium();
		if (!runtime) return;
		const { viewer, Cesium } = runtime;
		this.stopPicking();
		// 场景开关与天空后处理延后到水体确定创建时（避免点按钮瞬间整屏变色）
		this.isPicking.value = true;
		this.pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
		this.pickHandler.setInputAction((movement: any) => {
			void this.createFluidAtScreenPosition(viewer, Cesium, movement.position);
		}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
	};

	private async createFluidAtScreenPosition(viewer: any, Cesium: any, position: any) {
		const cartesian = pickCartesianOnGlobe(viewer, position);
		if (!cartesian) {
			this.message.warning(t('cesium.fluidToast.noTerrainPick'));
			return;
		}

		const creationId = ++this.fluidCreationId;
		this.stopPicking();

		const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
		const lon = Cesium.Math.toDegrees(cartographic.longitude);
		const lat = Cesium.Math.toDegrees(cartographic.latitude);
		const pickedHeight = Number(cartographic.height);
		const centerHeight = Number.isFinite(pickedHeight) ? pickedHeight : 0;
		const horizontalDimensions = new Cesium.Cartesian3(FLUID_HORIZONTAL_SIZE, FLUID_HORIZONTAL_SIZE, 0);

		showLoading(t('loading.fluidHeights'));
		try {
			this.destroyFluidOnly();

			const th = Number(this.threshold.value) || 0;
			const b = Number(this.blend.value) || 0;
			const l = Number(this.lightStrength.value) || 0;
			const heightMapSource = await createTerrainHeightMapSource(viewer, Cesium, {
				lon,
				lat,
				centerHeight,
				dimensions: horizontalDimensions,
			});
			const verticalRange = resolveFluidVerticalRange(heightMapSource, centerHeight);
			const baseHeight = verticalRange.baseHeight;
			const fluidDepth = verticalRange.depth;
			const initialWaterLevel = resolveInitialWaterLevel(verticalRange, centerHeight);
			const dimensions = new Cesium.Cartesian3(FLUID_HORIZONTAL_SIZE, FLUID_HORIZONTAL_SIZE, fluidDepth);

			if (creationId !== this.fluidCreationId) return;

			// 水体创建已确定，此时才翻转场景开关并挂天空后处理
			this.prepareScene(viewer, Cesium);

			this.waterLevelMin.value = verticalRange.minHeight;
			this.waterLevelMax.value = verticalRange.maxHeight;
			this.waterLevel.value = initialWaterLevel;

			// 洪水速度默认值 = 值域 / 10，即默认 10s 完成模拟
			const rangeSpan = Math.abs(verticalRange.maxHeight - verticalRange.minHeight);
			if (rangeSpan > 0) this.floodSimSpeed.value = Math.max(rangeSpan / 10, 0.1);

			if (!heightMapSource) {
				this.message.warning(t('cesium.fluidToast.heightMapFallback'), { duration: 4200 });
			}

			this.fluidRenderer = new this.FluidRenderer(viewer, {
				lonLat: [lon, lat],
				width: FLUID_TEXTURE_SIZE,
				height: FLUID_TEXTURE_SIZE,
				dimensions,
				baseHeight,
				minHeight: verticalRange.minHeight,
				maxHeight: verticalRange.maxHeight,
				heightMapSource,
				waterColor: createCesiumRgb(Cesium, this.waterColor.value),
				// 渲染参数：雾距/高光强度/高光衰减
				customParams: new Cesium.Cartesian4(th, b, l, 10),
				// 模拟参数：attenuation/strength/minTotalFlow/initialWaterLevel
				fluidParams: new Cesium.Cartesian4(
					0.9 + (l / 10) * 0.099,
					Math.min(1, b / 50),
					th / 50000,
					normalizeWaterLevel(initialWaterLevel, verticalRange)
				),
			});

			// 水体渲染器就绪 → 声明连续渲染（与 destroyFluidOnly 的 release 成对）
			acquireContinuous(viewer, RENDER_MODE_TAG);

			this.selectedLon.value = lon;
			this.selectedLat.value = lat;
			this.hasFluid.value = true;
			viewer.scene.requestRender?.();
			this.message.success(t('cesium.fluidToast.created'));
		} catch (error) {
			this.message.error(t('cesium.fluidToast.createFailed'), error as any);
			this.message.warning(t('cesium.fluidToast.pipelineUnsupported'), { closable: true });
			// FluidRenderer 构建失败时恢复场景状态，避免全局设置残留
			try {
				this.restoreScene(viewer);
			} catch {
				/* ignore */
			}
		} finally {
			hideLoading();
		}
	}

	//#endregion

	//#region 参数同步

	private getCurrentWaterLevelRange() {
		if (!Number.isFinite(this.waterLevelMin.value) || !Number.isFinite(this.waterLevelMax.value)) return null;
		return {
			minHeight: Math.min(this.waterLevelMin.value as number, this.waterLevelMax.value as number),
			maxHeight: Math.max(this.waterLevelMin.value as number, this.waterLevelMax.value as number),
		};
	}

	private syncWaterColorConfig() {
		const rgb = parseHexColor(this.waterColor.value);
		const color = this.fluidRenderer?.config?.waterColor;
		if (!rgb || !color) return;
		color.x = rgb.red;
		color.y = rgb.green;
		color.z = rgb.blue;
	}

	/**
	 * 将 UI 参数同步到流体渲染器
	 * - customParam：渲染参数（雾距/高光强度/高光衰减）
	 * - fluidParam：模拟参数（衰减/流出强度/最小流量阈值/初始水深）
	 *   threshold → z(minTotalFlow)，blend → y(strength)，lightStrength → x(attenuation)
	 */
	public applyFluidParams = () => {
		if (!this.fluidRenderer?.config) return;
		const th = Number(this.threshold.value) || 0;
		const b = Number(this.blend.value) || 0;
		const l = Number(this.lightStrength.value) || 0;

		if (this.fluidRenderer.config.customParams) {
			this.fluidRenderer.config.customParams.x = th;
			this.fluidRenderer.config.customParams.y = b;
			this.fluidRenderer.config.customParams.z = l;
		}
		if (this.fluidRenderer.config.fluidParams) {
			// attenuation: lightStrength 0~10 → 0.9~0.999
			this.fluidRenderer.config.fluidParams.x = 0.9 + (l / 10) * 0.099;
			// strength: blend 0~50 → 0~1
			this.fluidRenderer.config.fluidParams.y = Math.min(1, b / 50);
			// minTotalFlow: threshold 0~500 → 0~0.01
			this.fluidRenderer.config.fluidParams.z = th / 50000;
		}

		this.syncWaterColorConfig();
		this.fluidRenderer.viewer?.scene?.requestRender?.();
	};

	public applyWaterLevelParam = () => {
		if (!this.fluidRenderer?.config?.fluidParams) return;
		const range = this.getCurrentWaterLevelRange();
		const rawWaterLevel = Number(this.waterLevel.value);
		if (!range || !Number.isFinite(rawWaterLevel)) return;

		const clampedWaterLevel = clampNumber(rawWaterLevel, range.minHeight, range.maxHeight);
		if (clampedWaterLevel !== rawWaterLevel) {
			this.waterLevel.value = clampedWaterLevel;
			return;
		}

		const normalizedWaterLevel = normalizeWaterLevel(clampedWaterLevel, range);
		if (typeof this.fluidRenderer.setInitialWaterLevel === 'function') {
			this.fluidRenderer.setInitialWaterLevel(normalizedWaterLevel);
		} else {
			this.fluidRenderer.config.fluidParams.w = normalizedWaterLevel;
			this.fluidRenderer.viewer?.scene?.requestRender?.();
		}
	};

	//#endregion

	//#region 场景开关

	private prepareScene(viewer: any, Cesium: any) {
		if (!this.sceneSnapshot) {
			const scene = viewer.scene;
			this.sceneSnapshot = {
				shadows: viewer.shadows,
				resolutionScale: viewer.resolutionScale,
				msaaSamples: scene.msaaSamples,
				depthTestAgainstTerrain: scene.globe.depthTestAgainstTerrain,
				logarithmicDepthBuffer: scene.logarithmicDepthBuffer,
				highDynamicRange: scene.highDynamicRange,
				fogEnabled: scene.fog?.enabled,
				showGroundAtmosphere: scene.globe.showGroundAtmosphere,
				skyAtmosphereShow: scene.skyAtmosphere?.show,
				enableLighting: scene.globe.enableLighting,
			};
		}

		viewer.shadows = true;
		viewer.resolutionScale = 1.0;
		viewer.scene.msaaSamples = 4;
		viewer.scene.globe.depthTestAgainstTerrain = true;
		viewer.scene.logarithmicDepthBuffer = true;
		viewer.scene.highDynamicRange = true;
		if (viewer.scene.fog) viewer.scene.fog.enabled = true;
		// 体积云管线存活期间原生天空由 Bruneton 接管，重开会双大气/白闪
		if (viewer.scene.skyAtmosphere && !isCloudPipelineActive(viewer)) viewer.scene.skyAtmosphere.show = true;
		viewer.scene.globe.enableLighting = true;

		if (!this.skyStage && this.createSkyEffect) {
			this.skyStage = this.createSkyEffect(Cesium);
			viewer.scene.postProcessStages.add(this.skyStage);
		}
	}

	private restoreScene(viewer: any) {
		if (!viewer || !this.sceneSnapshot) return;
		const snapshot = this.sceneSnapshot;
		const scene = viewer.scene;
		viewer.shadows = snapshot.shadows;
		viewer.resolutionScale = snapshot.resolutionScale;
		if (snapshot.msaaSamples !== undefined) scene.msaaSamples = snapshot.msaaSamples;
		scene.globe.depthTestAgainstTerrain = snapshot.depthTestAgainstTerrain;
		scene.logarithmicDepthBuffer = snapshot.logarithmicDepthBuffer;
		scene.highDynamicRange = snapshot.highDynamicRange;
		if (scene.fog && snapshot.fogEnabled !== undefined) scene.fog.enabled = snapshot.fogEnabled;
		// 体积云管线存活期间原生地面大气由互斥逻辑接管，恢复不得直写
		if (!isCloudPipelineActive(viewer)) scene.globe.showGroundAtmosphere = snapshot.showGroundAtmosphere;
		// 体积云管线存活期间原生天空由 Bruneton 接管，恢复也不得重开
		if (scene.skyAtmosphere && !isCloudPipelineActive(viewer) && snapshot.skyAtmosphereShow !== undefined) {
			scene.skyAtmosphere.show = snapshot.skyAtmosphereShow;
		}
		scene.globe.enableLighting = snapshot.enableLighting;
		this.sceneSnapshot = null;
	}

	//#endregion

	//#region 洪水模拟

	/** 切换洪水模拟：启动时水位从当前值开始上涨，到达最大值后停止 */
	public toggleFloodSimulation = () => {
		if (this.floodSimActive.value) this.stopFloodSimulation();
		else this.startFloodSimulation();
	};

	public startFloodSimulation = () => {
		const range = this.getCurrentWaterLevelRange();
		if (!range) return;

		// 当前水位已在最大值附近时，从最小值开始
		const currentLevel = Number(this.waterLevel.value);
		if (!Number.isFinite(currentLevel) || currentLevel >= range.maxHeight - 0.01) {
			this.waterLevel.value = range.minHeight;
		}

		this.floodSimActive.value = true;
		this.floodLastTimestamp = null;

		const step = (timestamp: number) => {
			if (!this.floodSimActive.value) return;
			if (this.floodLastTimestamp === null) this.floodLastTimestamp = timestamp;

			const deltaSeconds = Math.min((timestamp - this.floodLastTimestamp) / 1000, 0.1);
			this.floodLastTimestamp = timestamp;

			const currentRange = this.getCurrentWaterLevelRange();
			if (!currentRange) {
				this.stopFloodSimulation();
				return;
			}

			const level = Number(this.waterLevel.value);
			const nextLevel = level + this.floodSimSpeed.value * deltaSeconds;

			if (nextLevel >= currentRange.maxHeight) {
				this.waterLevel.value = currentRange.maxHeight;
				this.stopFloodSimulation();
				this.message.info(t('cesium.fluidToast.floodDone'));
				return;
			}

			this.waterLevel.value = nextLevel;
			this.floodAnimFrameId = requestAnimationFrame(step);
		};

		this.floodAnimFrameId = requestAnimationFrame(step);
		this.message.info(t('cesium.fluidToast.floodStart'));
	};

	public stopFloodSimulation = () => {
		this.floodSimActive.value = false;
		this.floodLastTimestamp = null;
		if (this.floodAnimFrameId !== null) {
			cancelAnimationFrame(this.floodAnimFrameId);
			this.floodAnimFrameId = null;
		}
	};

	/** 设置洪水上涨速度（供外部控制中心调用，单位 m/s） */
	public setFloodSpeed = (speed: number) => {
		const num = Number(speed);
		if (Number.isFinite(num) && num > 0) this.floodSimSpeed.value = num;
	};

	//#endregion

	//#region 清理

	public clearFluid = () => {
		this.stopFloodSimulation();
		// 必须传 true 触发 restoreScene：prepareScene 翻转了 8 个全场景开关并挂了全屏大气后处理，
		// 跳过还原会残留整屏效果层
		this.cleanup(true);
		this.message.success(t('cesium.fluidToast.cleared'));
	};

	private stopPicking() {
		if (this.pickHandler) {
			this.pickHandler.destroy();
			this.pickHandler = null;
		}
		this.isPicking.value = false;
	}

	private destroyFluidOnly() {
		if (!this.fluidRenderer) return;
		try {
			this.fluidRenderer.destroy();
		} catch (error) {
			console.warn('FluidRenderer destroy warning:', error);
		}
		this.fluidRenderer = null;
		this.hasFluid.value = false;
		// 归还连续渲染计数（与 acquire 恰好配对；重建路径会先经此处归还旧实例计数）
		releaseContinuous(this.props.getViewer?.(), RENDER_MODE_TAG);
	}

	private cleanup(restoreSceneState: boolean) {
		const viewer = this.props.getViewer?.();
		this.fluidCreationId += 1;
		this.stopFloodSimulation();
		this.stopPicking();
		this.destroyFluidOnly();
		this.selectedLon.value = null;
		this.selectedLat.value = null;
		this.waterLevel.value = null;
		this.waterLevelMin.value = null;
		this.waterLevelMax.value = null;

		if (viewer && this.skyStage) {
			try {
				viewer.scene.postProcessStages.remove(this.skyStage);
			} catch (error) {
				console.warn('Fluid sky stage remove warning:', error);
			}
			this.skyStage = null;
		}

		if (restoreSceneState && viewer) this.restoreScene(viewer);
		viewer?.scene?.requestRender?.();
	}

	public closePanel = () => {
		this.cleanup(true);
		this.emit('close');
	};

	//#endregion
}
