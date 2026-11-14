/**
 * 功能名称：Cesium 高级视觉效果面板（高度雾 / HBAO / 移轴 / 大气增强 + 实时曲线）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：后处理 stage 的创建与逐帧 uniform 同步、场景默认值快照与恢复、
 *          渲染异常自动降级、ECharts 实时采样曲线。
 */
import { computed, defineComponent, onMounted, onUnmounted, ref, watch, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { useMessage } from '@common/shell/useMessage';
import {
	captureRealisticAtmosphereState,
	configureRealisticAtmosphere,
	restoreRealisticAtmosphere,
} from '../composables/scene/cesiumAtmosphere';
import { useCesiumEffectsChart } from '../composables/scene/useCesiumEffectsChart';
import LilGuiControls from './LilGuiControls.vue';
import { isCloudPipelineActive } from '@cesium-domain/modules/cloud';

/** 高度雾片元着色器 */
const FOG_FRAGMENT_SHADER = `
      uniform sampler2D colorTexture;
      uniform sampler2D depthTexture;
      uniform vec3 fogColor;
      uniform float fogDensity;
      uniform float cameraHeightFactor;

      #if __VERSION__ == 300
      in vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture
      #define FRAG_COLOR out_FragColor
      #else
      varying vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture2D
      #define FRAG_COLOR gl_FragColor
      #endif

      float getLinearDepth(vec2 uv) {
        float depth = czm_readDepth(depthTexture, uv);
        if (depth == 0.0) {
          return 0.0;
        }
        vec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        return max(0.0, -eyeCoordinate.z);
      }

      void main() {
        vec4 color = SAMPLE_TEX(colorTexture, v_textureCoordinates);
        float linearDepth = getLinearDepth(v_textureCoordinates);

        float depthFog = 1.0 - exp(-linearDepth * fogDensity);
        float groundBoost = clamp(1.0 - cameraHeightFactor, 0.0, 1.0);
        float fogAmount = clamp(depthFog * (0.22 + 1.28 * groundBoost), 0.0, 0.9);

        vec3 finalColor = mix(color.rgb, fogColor, fogAmount);
        FRAG_COLOR = vec4(finalColor, color.a);
      }
    `;

/** 移轴模糊片元着色器 */
const TILT_SHIFT_FRAGMENT_SHADER = `
      uniform sampler2D colorTexture;
      uniform float focusCenter;
      uniform float focusSpread;
      uniform float blurStrength;

      #if __VERSION__ == 300
      in vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture
      #define FRAG_COLOR out_FragColor
      #else
      varying vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture2D
      #define FRAG_COLOR gl_FragColor
      #endif

      void main() {
        vec2 uv = v_textureCoordinates;
        vec4 centerColor = SAMPLE_TEX(colorTexture, uv);

        float dist = abs(uv.y - focusCenter);
        float blurMix = smoothstep(focusSpread * 0.7, focusSpread * 2.1, dist) * blurStrength;

        vec2 o = vec2(0.0035 * blurMix, 0.0);
        vec4 blurColor = vec4(0.0);
        blurColor += SAMPLE_TEX(colorTexture, uv - 3.0 * o) * 0.12;
        blurColor += SAMPLE_TEX(colorTexture, uv - 2.0 * o) * 0.16;
        blurColor += SAMPLE_TEX(colorTexture, uv - 1.0 * o) * 0.18;
        blurColor += SAMPLE_TEX(colorTexture, uv) * 0.20;
        blurColor += SAMPLE_TEX(colorTexture, uv + 1.0 * o) * 0.18;
        blurColor += SAMPLE_TEX(colorTexture, uv + 2.0 * o) * 0.16;
        blurColor += SAMPLE_TEX(colorTexture, uv + 3.0 * o) * 0.12;

        FRAG_COLOR = mix(centerColor, blurColor, clamp(blurMix * 1.05, 0.0, 1.0));
      }
    `;

/** 大气增强触发的最小相机高度（低于此值自动关闭，避免与晨昏半球冲突） */
const ATMOSPHERE_MIN_HEIGHT = 80000;

// 一、Emits（本组件无对外事件）
type EmitsType = [];

// 二、Props
const propDefine = {
	headless: { type: Boolean, default: false },
	getViewer: { type: Function as PropType<any>, required: true },
	getCesium: { type: Function as PropType<any>, required: true },
	controls: { type: Object as PropType<any>, default: () => ({}) },
} as const;

export type CesiumAdvancedEffectsProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'CesiumAdvancedEffects',
	components: { LilGuiControls },
	props: propDefine,
	emits: [],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public chartRef;

	public fogEnabled = ref(false);
	public hbaoEnabled = ref(false);
	public tiltShiftEnabled = ref(false);
	public atmosphereEnabled = ref(false);
	public chartVisible;
	public toggleChartVisibility;
	private disposeChart: () => void;

	private message: ReturnType<typeof useMessage>;

	// ── 后处理 stage ──
	private fogStage: any = null;
	private tiltShiftStage: any = null;
	private ambientOcclusionStage: any = null;
	private createdAmbientOcclusionStage = false;

	// ── 定时器与监听 ──
	private bootstrapTimer: number | null = null;
	private preRenderListener: (() => void) | null = null;
	private renderErrorListener: (() => void) | null = null;
	private hasRenderErrorNotified = false;

	// ── 场景快照 ──
	private realisticAtmosphereSnapshot: any = null;
	/** 标记是否已恢复过大气状态（避免每帧重复恢复） */
	private atmosphereRestoredOnce = false;

	// ── FPS 统计 ──
	private frameCounter = 0;
	private fpsValue = 0;
	private fpsStamp = typeof performance !== 'undefined' ? performance.now() : Date.now();

	/** 场景默认值快照 */
	private originalSceneState: any = { hdr: null, bloom: null, sky: null };

	constructor(
		private props: CesiumAdvancedEffectsProps,
		_ctx: SetupContext<EmitsType>
	) {
		this.message = useMessage();
		const effectsChart = useCesiumEffectsChart({
			getViewer: () => this.props.getViewer?.(),
			getCesium: () => this.props.getCesium?.(),
			getFpsValue: () => this.fpsValue,
			getCameraHeight: (viewer: any) => this.getCameraHeight(viewer),
			message: this.message,
		});
		this.chartRef = effectsChart.chartRef;
		this.chartVisible = effectsChart.chartVisible;
		this.toggleChartVisibility = effectsChart.toggleChartVisibility;
		this.disposeChart = effectsChart.disposeChart;
		this.init();
	}

	get headless() {
		return this.props.headless;
	}

	//#region 派生

	public effectGuiControls = computed(() => [
		{ id: 'fog', label: 'Height Fog', type: 'toggle', value: this.fogEnabled.value },
		{ id: 'hbao', label: 'HBAO', type: 'toggle', value: this.hbaoEnabled.value },
		{ id: 'tiltShift', label: 'Tilt Shift', type: 'toggle', value: this.tiltShiftEnabled.value },
		{ id: 'atmosphere', label: 'Atmosphere + Bloom', type: 'toggle', value: this.atmosphereEnabled.value },
	]);

	//#endregion

	//#region 生命周期

	private init() {
		onMounted(() => this.bootstrapWhenReady());
		onUnmounted(() => this.cleanupEffects());

		watch(
			() => this.props.controls,
			(controls) => {
				this.syncExternalControls(controls || {});
			},
			{ deep: true, immediate: true }
		);
	}

	//#endregion

	//#region 外部控制与渲染请求

	public syncExternalControls = (controls: any) => {
		if (Object.prototype.hasOwnProperty.call(controls, 'fog')) this.fogEnabled.value = !!controls.fog;
		if (Object.prototype.hasOwnProperty.call(controls, 'hbao')) this.hbaoEnabled.value = !!controls.hbao;
		if (Object.prototype.hasOwnProperty.call(controls, 'tiltShift')) this.tiltShiftEnabled.value = !!controls.tiltShift;
		if (Object.prototype.hasOwnProperty.call(controls, 'atmosphere')) this.atmosphereEnabled.value = !!controls.atmosphere;
		this.requestSceneRender();
	};

	/**
	 * 请求一帧渲染：stage 的 enabled/uniform 在 preRender 里同步，
	 * 按需渲染下开关切换后需显式触发一帧；连续渲染模式下为无害 no-op。
	 */
	public requestSceneRender = () => {
		this.props.getViewer?.()?.scene?.requestRender?.();
	};

	public handleEffectGuiChange = ({ controlId, value }: any) => {
		const enabled = !!value;
		const controlMap: Record<string, typeof this.fogEnabled> = {
			fog: this.fogEnabled,
			hbao: this.hbaoEnabled,
			tiltShift: this.tiltShiftEnabled,
			atmosphere: this.atmosphereEnabled,
		};
		const target = controlMap[String(controlId)];
		if (target) {
			target.value = enabled;
			this.requestSceneRender();
		}
	};

	//#endregion

	//#region 启动与场景快照

	private bootstrapWhenReady() {
		let attempts = 0;
		this.bootstrapTimer = window.setInterval(async () => {
			attempts += 1;
			const viewer = this.props.getViewer?.();
			const Cesium = this.props.getCesium?.() || (window as any).Cesium;

			if (viewer && Cesium) {
				clearInterval(this.bootstrapTimer as number);
				this.bootstrapTimer = null;
				try {
					this.captureSceneDefaults(viewer);
					this.initRenderErrorGuard(viewer);
					this.initCinematicEffects(viewer, Cesium);
					this.bindFrameUpdates(viewer, Cesium);
					this.message.success('高级视觉效果已启用。');
				} catch (error) {
					this.message.error('高级视觉效果初始化失败', error as any);
					this.message.warning('高级视觉效果部分初始化失败，已自动降级。', { closable: true });
				}
				return;
			}

			if (attempts >= 150) {
				clearInterval(this.bootstrapTimer as number);
				this.bootstrapTimer = null;
				this.message.warning('高级视觉效果等待超时，未获取到 3D Viewer。');
			}
		}, 80);
	}

	private captureSceneDefaults(viewer: any) {
		const scene = viewer?.scene;
		if (!scene) return;

		if (typeof scene.highDynamicRange === 'boolean') this.originalSceneState.hdr = scene.highDynamicRange;
		if ('sunBloom' in scene) this.originalSceneState.sunBloom = scene.sunBloom;

		// 保存 Globe 关键属性（晨昏半球必需）
		const globe = scene.globe;
		if (globe) {
			this.originalSceneState.globe = {
				enableLighting: globe.enableLighting,
				showGroundAtmosphere: globe.showGroundAtmosphere,
				dynamicAtmosphereLighting: globe.dynamicAtmosphereLighting,
				dynamicAtmosphereLightingFromSun: globe.dynamicAtmosphereLightingFromSun,
				atmosphereLightIntensity: globe.atmosphereLightIntensity,
				atmosphereHueShift: globe.atmosphereHueShift,
				atmosphereSaturationShift: globe.atmosphereSaturationShift,
				atmosphereBrightnessShift: globe.atmosphereBrightnessShift,
				lightingFadeInDistance: globe.lightingFadeInDistance,
				lightingFadeOutDistance: globe.lightingFadeOutDistance,
				nightFadeInDistance: globe.nightFadeInDistance,
				nightFadeOutDistance: globe.nightFadeOutDistance,
			};
		}

		if (scene.light) this.originalSceneState.light = { intensity: scene.light.intensity };

		if (scene.postProcessStages?.bloom) {
			const bloom = scene.postProcessStages.bloom;
			this.originalSceneState.bloom = {
				enabled: !!bloom.enabled,
				contrast: bloom.uniforms?.contrast,
				brightness: bloom.uniforms?.brightness,
				delta: bloom.uniforms?.delta,
				sigma: bloom.uniforms?.sigma,
				stepSize: bloom.uniforms?.stepSize,
			};
		}

		if (scene.skyAtmosphere) {
			this.originalSceneState.sky = {
				show: scene.skyAtmosphere.show,
				hueShift: scene.skyAtmosphere.hueShift,
				saturationShift: scene.skyAtmosphere.saturationShift,
				brightnessShift: scene.skyAtmosphere.brightnessShift,
			};
		}

		this.originalSceneState.celestial = {
			sunShow: scene.sun?.show,
			moonShow: scene.moon?.show,
			skyBoxShow: scene.skyBox?.show,
		};
	}

	private initCinematicEffects(viewer: any, Cesium: any) {
		const stageCollection = viewer?.scene?.postProcessStages;
		if (!stageCollection || !Cesium?.PostProcessStage) return;

		this.initHeightFogStage(viewer, Cesium);
		this.initAmbientOcclusion(viewer, Cesium);
		this.initTiltShiftStage(viewer, Cesium);

		// 仅在用户已开启大气效果时应用，否则恢复原始状态
		if (this.atmosphereEnabled.value) this.applyAtmosphereEnhancement(viewer, Cesium, 1200);
		else this.restoreAtmosphereState(viewer);
	}

	private initRenderErrorGuard(viewer: any) {
		const scene = viewer?.scene;
		if (!scene?.renderError?.addEventListener) return;
		scene.rethrowRenderErrors = false;
		this.renderErrorListener = scene.renderError.addEventListener((_scene: any, error: any) => {
			this.message.error('Cesium 渲染异常，已触发降级保护', error);
			this.degradeEffectsAfterRenderError();
			if (!this.hasRenderErrorNotified) {
				this.hasRenderErrorNotified = true;
				this.message.warning('检测到当前设备图形兼容性问题，已自动降级高级特效以保证 3D 可用。', {
					closable: true,
					duration: 6000,
				});
			}
		});
	}

	private degradeEffectsAfterRenderError() {
		this.fogEnabled.value = false;
		this.tiltShiftEnabled.value = false;
		this.hbaoEnabled.value = false;
		this.atmosphereEnabled.value = false;
		if (this.fogStage) this.fogStage.enabled = false;
		if (this.tiltShiftStage) this.tiltShiftStage.enabled = false;
		if (this.ambientOcclusionStage) this.ambientOcclusionStage.enabled = false;
	}

	//#endregion

	//#region 后处理 stage

	private initHeightFogStage(viewer: any, Cesium: any) {
		if (this.fogStage) return;
		this.fogStage = new Cesium.PostProcessStage({
			name: 'cinematic_height_fog_stage',
			fragmentShader: FOG_FRAGMENT_SHADER,
			uniforms: {
				fogColor: new Cesium.Color(0.78, 0.85, 0.92, 1.0),
				fogDensity: 0.00065,
				cameraHeightFactor: 1.0,
			},
		});
		viewer.scene.postProcessStages.add(this.fogStage);
		this.fogStage.enabled = this.fogEnabled.value;
	}

	private initAmbientOcclusion(viewer: any, Cesium: any) {
		const sceneStages = viewer?.scene?.postProcessStages;
		if (!sceneStages) return;

		if (sceneStages.ambientOcclusion) {
			this.ambientOcclusionStage = sceneStages.ambientOcclusion;
			this.createdAmbientOcclusionStage = false;
		} else if (Cesium?.PostProcessStageLibrary?.createAmbientOcclusionStage) {
			this.ambientOcclusionStage = Cesium.PostProcessStageLibrary.createAmbientOcclusionStage();
			sceneStages.add(this.ambientOcclusionStage);
			this.createdAmbientOcclusionStage = true;
		}
		if (!this.ambientOcclusionStage) return;

		this.ambientOcclusionStage.enabled = this.hbaoEnabled.value;
		const u = this.ambientOcclusionStage.uniforms;
		if (u) {
			if ('intensity' in u) u.intensity = 4.2;
			if ('bias' in u) u.bias = 0.08;
			if ('lengthCap' in u) u.lengthCap = 0.35;
			if ('stepSize' in u) u.stepSize = 1.8;
			if ('frustumLength' in u) u.frustumLength = 1200.0;
		}
	}

	private initTiltShiftStage(viewer: any, Cesium: any) {
		if (this.tiltShiftStage) return;
		this.tiltShiftStage = new Cesium.PostProcessStage({
			name: 'cinematic_tilt_shift_stage',
			fragmentShader: TILT_SHIFT_FRAGMENT_SHADER,
			uniforms: { focusCenter: 0.56, focusSpread: 0.11, blurStrength: 0.0 },
		});
		viewer.scene.postProcessStages.add(this.tiltShiftStage);
		this.tiltShiftStage.enabled = false;
	}

	//#endregion

	//#region 逐帧同步

	private bindFrameUpdates(viewer: any, Cesium: any) {
		const scene = viewer?.scene;
		if (!scene) return;

		// 每帧冗余写入门控：requestRenderMode 下相机静止时 preRender 不应反复赋值
		let lastFogEnabled: boolean | null = null;
		let lastFogFactor = NaN;
		let lastHbaoEnabled: boolean | null = null;
		let lastTiltStateKey = '';
		let lastAtmoHeight = NaN;

		this.preRenderListener = scene.preRender.addEventListener(() => {
			const height = this.getCameraHeight(viewer);
			const pitch = Number(viewer?.camera?.pitch ?? -1.2);

			this.frameCounter += 1;
			const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
			if (now - this.fpsStamp >= 1000) {
				this.fpsValue = Math.round((this.frameCounter * 1000) / (now - this.fpsStamp));
				this.frameCounter = 0;
				this.fpsStamp = now;
			}

			if (this.fogStage) {
				if (lastFogEnabled !== this.fogEnabled.value) {
					this.fogStage.enabled = this.fogEnabled.value;
					lastFogEnabled = this.fogEnabled.value;
				}
				const factor = this.normalizeHeight(height, 150.0, 12000.0);
				if (!(Math.abs(factor - lastFogFactor) < 1e-4)) {
					this.fogStage.uniforms.cameraHeightFactor = factor;
					this.fogStage.uniforms.fogDensity = 0.00055 + (1.0 - factor) * 0.00125;
					lastFogFactor = factor;
				}
			}

			if (this.ambientOcclusionStage && lastHbaoEnabled !== this.hbaoEnabled.value) {
				this.ambientOcclusionStage.enabled = this.hbaoEnabled.value;
				lastHbaoEnabled = this.hbaoEnabled.value;
			}

			if (this.tiltShiftStage) {
				const lowAngleTrigger = pitch > -0.62;
				const blurStrength = lowAngleTrigger ? this.clamp01((pitch + 0.62) / 0.5) : 0;
				const stateKey = `${this.tiltShiftEnabled.value && lowAngleTrigger}|${blurStrength.toFixed(4)}`;
				if (stateKey !== lastTiltStateKey) {
					this.tiltShiftStage.enabled = this.tiltShiftEnabled.value && lowAngleTrigger;
					this.tiltShiftStage.uniforms.blurStrength = blurStrength;
					lastTiltStateKey = stateKey;
				}
			}

			if (this.atmosphereEnabled.value) {
				// 低于阈值时自动关闭大气增强，避免与晨昏半球冲突
				if (height >= ATMOSPHERE_MIN_HEIGHT) {
					const atmoH = this.normalizeHeight(height, 500.0, 120000.0);
					if (!(Math.abs(atmoH - lastAtmoHeight) < 1e-3)) {
						this.applyAtmosphereEnhancement(viewer, Cesium, height);
						lastAtmoHeight = atmoH;
					}
					this.atmosphereRestoredOnce = false;
				} else if (!this.atmosphereRestoredOnce) {
					this.restoreAtmosphereState(viewer);
					this.atmosphereRestoredOnce = true;
					lastAtmoHeight = NaN;
				}
			} else if (!this.atmosphereRestoredOnce) {
				this.restoreAtmosphereState(viewer);
				this.atmosphereRestoredOnce = true;
				lastAtmoHeight = NaN;
			}
		});
	}

	private applyAtmosphereEnhancement(viewer: any, Cesium: any, cameraHeight: number) {
		const scene = viewer?.scene;
		if (!scene) return;

		if (!this.realisticAtmosphereSnapshot) {
			this.realisticAtmosphereSnapshot = captureRealisticAtmosphereState(viewer);
		}
		configureRealisticAtmosphere(viewer, Cesium);

		if (typeof scene.highDynamicRange === 'boolean') scene.highDynamicRange = true;

		const bloom = scene.postProcessStages?.bloom;
		if (bloom) {
			bloom.enabled = true;
			const u = bloom.uniforms;
			if (u) {
				if ('contrast' in u) u.contrast = 149.0;
				if ('brightness' in u) u.brightness = -0.12;
				if ('delta' in u) u.delta = 1.0;
				if ('sigma' in u) u.sigma = 3.25;
				if ('stepSize' in u) u.stepSize = 5.0;
			}
		}

		const sky = scene.skyAtmosphere;
		if (!sky) return;
		const h = this.normalizeHeight(cameraHeight, 500.0, 120000.0);
		sky.hueShift = -0.035 + h * 0.035;
		sky.saturationShift = -0.14 + h * 0.09;
		sky.brightnessShift = 0.03 + (1.0 - h) * 0.08;
	}

	private restoreAtmosphereState(viewer: any) {
		const scene = viewer?.scene;
		if (!scene) return;

		const Cesium = this.props.getCesium?.() || (window as any).Cesium;
		if (this.realisticAtmosphereSnapshot) {
			restoreRealisticAtmosphere(viewer, Cesium, this.realisticAtmosphereSnapshot);
			this.realisticAtmosphereSnapshot = null;
			return;
		}

		const orig = this.originalSceneState;
		if (typeof scene.highDynamicRange === 'boolean' && orig.hdr !== null) scene.highDynamicRange = orig.hdr;
		if ('sunBloom' in scene && orig.sunBloom !== undefined) scene.sunBloom = orig.sunBloom;

		// 恢复 Globe 关键属性（晨昏半球必需）
		const globe = scene.globe;
		if (globe && orig.globe) {
			const g = orig.globe;
			if (g.enableLighting !== undefined) globe.enableLighting = g.enableLighting;
			if (g.showGroundAtmosphere !== undefined) globe.showGroundAtmosphere = g.showGroundAtmosphere;
			if (g.dynamicAtmosphereLighting !== undefined && 'dynamicAtmosphereLighting' in globe)
				globe.dynamicAtmosphereLighting = g.dynamicAtmosphereLighting;
			if (g.dynamicAtmosphereLightingFromSun !== undefined && 'dynamicAtmosphereLightingFromSun' in globe)
				globe.dynamicAtmosphereLightingFromSun = g.dynamicAtmosphereLightingFromSun;
			if (g.atmosphereLightIntensity !== undefined && 'atmosphereLightIntensity' in globe)
				globe.atmosphereLightIntensity = g.atmosphereLightIntensity;
			if (g.atmosphereHueShift !== undefined && 'atmosphereHueShift' in globe) globe.atmosphereHueShift = g.atmosphereHueShift;
			if (g.atmosphereSaturationShift !== undefined && 'atmosphereSaturationShift' in globe)
				globe.atmosphereSaturationShift = g.atmosphereSaturationShift;
			if (g.atmosphereBrightnessShift !== undefined && 'atmosphereBrightnessShift' in globe)
				globe.atmosphereBrightnessShift = g.atmosphereBrightnessShift;
			if (g.lightingFadeInDistance !== undefined && 'lightingFadeInDistance' in globe)
				globe.lightingFadeInDistance = g.lightingFadeInDistance;
			if (g.lightingFadeOutDistance !== undefined && 'lightingFadeOutDistance' in globe)
				globe.lightingFadeOutDistance = g.lightingFadeOutDistance;
			if (g.nightFadeInDistance !== undefined && 'nightFadeInDistance' in globe)
				globe.nightFadeInDistance = g.nightFadeInDistance;
			if (g.nightFadeOutDistance !== undefined && 'nightFadeOutDistance' in globe)
				globe.nightFadeOutDistance = g.nightFadeOutDistance;
		}

		if (scene.light && orig.light && orig.light.intensity !== undefined) scene.light.intensity = orig.light.intensity;

		const bloom = scene.postProcessStages?.bloom;
		if (bloom && orig.bloom) {
			bloom.enabled = orig.bloom.enabled;
			const u = bloom.uniforms;
			if (u) {
				if ('contrast' in u && orig.bloom.contrast !== undefined) u.contrast = orig.bloom.contrast;
				if ('brightness' in u && orig.bloom.brightness !== undefined) u.brightness = orig.bloom.brightness;
				if ('delta' in u && orig.bloom.delta !== undefined) u.delta = orig.bloom.delta;
				if ('sigma' in u && orig.bloom.sigma !== undefined) u.sigma = orig.bloom.sigma;
				if ('stepSize' in u && orig.bloom.stepSize !== undefined) u.stepSize = orig.bloom.stepSize;
			}
		}

		// 体积云管线存活期间原生 skyAtmosphere/skyBox 由 Bruneton 接管，恢复不得重开（白闪/双大气）
		const cloudOwnsSky = isCloudPipelineActive(viewer);
		if (scene.skyAtmosphere && orig.sky) {
			if (!cloudOwnsSky && orig.sky.show !== undefined) scene.skyAtmosphere.show = orig.sky.show;
			scene.skyAtmosphere.hueShift = orig.sky.hueShift;
			scene.skyAtmosphere.saturationShift = orig.sky.saturationShift;
			scene.skyAtmosphere.brightnessShift = orig.sky.brightnessShift;
		}

		if (orig.celestial) {
			const c = orig.celestial;
			if (scene.sun && c.sunShow !== undefined) scene.sun.show = c.sunShow;
			if (scene.moon && c.moonShow !== undefined) scene.moon.show = c.moonShow;
			if (scene.skyBox && !cloudOwnsSky && c.skyBoxShow !== undefined) scene.skyBox.show = c.skyBoxShow;
		}

		scene.requestRender?.();
	}

	//#endregion

	//#region 清理与工具

	private cleanupEffects() {
		if (this.bootstrapTimer) {
			clearInterval(this.bootstrapTimer);
			this.bootstrapTimer = null;
		}
		this.disposeChart();

		const viewer = this.props.getViewer?.();
		const sceneStages = viewer?.scene?.postProcessStages;

		if (this.preRenderListener) {
			this.preRenderListener();
			this.preRenderListener = null;
		}
		if (this.renderErrorListener) {
			this.renderErrorListener();
			this.renderErrorListener = null;
		}

		if (this.fogStage && sceneStages) sceneStages.remove(this.fogStage);
		this.fogStage = null;

		if (this.tiltShiftStage && sceneStages) sceneStages.remove(this.tiltShiftStage);
		this.tiltShiftStage = null;

		if (this.ambientOcclusionStage) {
			if (this.createdAmbientOcclusionStage && sceneStages) sceneStages.remove(this.ambientOcclusionStage);
			this.ambientOcclusionStage = null;
		}
		this.createdAmbientOcclusionStage = false;
		this.atmosphereRestoredOnce = false;

		if (viewer) this.restoreAtmosphereState(viewer);

		this.hasRenderErrorNotified = false;
	}

	private getCameraHeight(viewer: any) {
		const ellipsoid = viewer?.scene?.globe?.ellipsoid;
		const position = viewer?.camera?.positionWC;
		if (!ellipsoid || !position) return 0;
		const cartographic = ellipsoid.cartesianToCartographic(position);
		return Math.max(0, Number(cartographic?.height ?? 0));
	}

	private normalizeHeight(value: number, min: number, max: number) {
		if (!Number.isFinite(value) || max <= min) return 0;
		return this.clamp01((value - min) / (max - min));
	}

	private clamp01(value: number) {
		return Math.min(1, Math.max(0, Number(value) || 0));
	}

	//#endregion
}
