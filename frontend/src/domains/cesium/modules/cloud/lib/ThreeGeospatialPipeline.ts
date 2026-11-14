/**
 * ThreeGeospatialPipeline - 精炼版体积云 + Bruneton 大气 + 空中透视一体化管线。
 *
 * 渲染顺序（WebGIS 后处理链）：
 *  1. PostProcessStage: AtmospherePostProcess 天空
 *  2. PostProcessStage: AerialPerspectiveEffect 几何透视 + 地面云影
 *  3. PostProcessStage: 体积云 raymarch（含 BSM 采样、shadowLength、haze）
 *
 * BSM（Beer Shadow Map）和 TAA 通过原生 WebGL 在 preRender/postRender 执行。
 * BSM 数据通过 setCloudShadow 同步到大气和 Aerial 两侧，实现丁达尔与地面云影。
 */

/* eslint-disable @typescript-eslint/no-this-alias, no-constant-binary-expression */

// dat.gui 为可选依赖：生产环境由 WebGIS 工具面板调参，默认不加载
// import * as dat from "dat.gui";
import { AtmosphereParameters } from "./AtmosphereFromThreeGeospatial/AtmosphereParameters";
import { AtmospherePostProcess } from "./AtmosphereFromThreeGeospatial/AtmospherePostProcess";
import { AerialPerspectiveEffect } from "./AtmosphereFromThreeGeospatial/AerialPerspectiveEffect";
import { loadBinThreeGeospatial, bindData3DTextureToCesiumContext } from "./loadBinThreeGeospatial";
import { loadShaderSource } from "./shaderLoader";
import { CloudShadowPass } from "./CloudShadowPass";
import { ShadowResolvePass } from "./ShadowResolvePass";
import {
  DEFAULT_CLOUDS_ASSETS_BASE,
  DEFAULT_BRUNETON_SHADER_BASE,
  DEFAULT_BLUE_NOISE_URL,
  DEFAULT_ATMOSPHERE_ASSETS_BASE,
  DEFAULT_ATMOSPHERE_SHADER_BASE,
} from "./assetPaths";
import { getCesium } from "./getCesium";
import { createGLProgram, getCloudFragmentShader } from "./cloudFragmentShader";

const Cesium = getCesium();

const SHADOW_MAP_SIZE = 1024;
const BSM_BLIT_SIZE = 1024;

// ─── Helper: compile & link GL program ─────────────────────────────────────


// ─── Main pipeline class ──────────────────────────────────────────────────

export class ThreeGeospatialPipeline {
  // ==================== 状态字段（原 JS 动态字段收拢声明，一律 any 保持行为） ====================
  viewer: any;
  atmosphereParams: any;
  params: any;
  assetsBase: any;
  brunetonShaderBase: any;
  blueNoiseUrl: any;
  atmosphereAssetsBase: any;
  atmosphereShaderBase: any;
  enableGui: any;
  aerial: any;
  atmosphere: any;
  cloudStage: any;
  textures: any;
  _listeners: any;
  _ready: any;
  _gui: any;
  _frameCount: any;
  _cloudUniforms: any;
  _cloudStageRebuiltFlag: any;
  _cloudResolutionScale: any;
  _cloudSplitMode: any;
  _cloudShaderLegacy: any;
  _cloudShaderSplit: any;
  _clockStartTime: any;
  _clockElapsedSeconds: any;
  _lastClockElapsedSeconds: any;
  _lastFrameTime: any;
  _lastOffsetFrame: any;
  _shapeOffsetX: any;
  _shapeOffsetY: any;
  _shapeOffsetZ: any;
  _shapeDetailOffsetX: any;
  _shapeDetailOffsetY: any;
  _shapeDetailOffsetZ: any;
  _weatherOffsetX: any;
  _weatherOffsetY: any;
  _terrainOffsetFrame: any;
  _terrainOffsetSampled: any;
  _terrainOffsetSmoothed: any;
  _scratch: any;
  _bsm: any;
  _bsmBlitDone: any;
  _bsmBlitSize: any;
  _bsmResourceSignature: any;
  _bsmShadowDisabled: any;
  _bsmShadowScale: any;
  _bsmSharedTexture: any;
  _taa: any;
  constructor(viewer: any, options: any = {}) {
    this.viewer = viewer;
    this.atmosphereParams = options.atmosphereParams ?? new AtmosphereParameters();
    this._frameCount = 0;
    this._gui = null;
    /** @type {boolean} 是否创建 dat.gui 调参面板（WebGIS 默认 false） */
    this.enableGui = options.enableGui === true;

    // 可配置的资源/shader 根路径（均带默认值，便于在任意部署路径下使用）
    this.assetsBase = options.cloudsAssetsBase ?? DEFAULT_CLOUDS_ASSETS_BASE;
    this.brunetonShaderBase = options.brunetonShaderBase ?? DEFAULT_BRUNETON_SHADER_BASE;
    this.blueNoiseUrl = options.blueNoiseUrl ?? DEFAULT_BLUE_NOISE_URL;
    this.atmosphereAssetsBase = options.atmosphereAssetsBase ?? DEFAULT_ATMOSPHERE_ASSETS_BASE;
    this.atmosphereShaderBase = options.atmosphereShaderBase ?? DEFAULT_ATMOSPHERE_SHADER_BASE;

    // bottomRadius 统一从 atmosphereParams 派生（V3.3.20 修复）：
    // 此前 params.bottomRadius=6371860 与 AtmosphereParameters.bottomRadius=6371030 双值并存，
    // 导致云层基准球(u_bottomRadius)与相机偏移基准球(u_altitudeCorrection)错位 ~830m，
    // 云漂浮高度错误、BSM 求交错位、移动抖动。现在统一以 atmosphereParams 为唯一真源。
    const bottomRadiusMeters = Number(this.atmosphereParams?.bottomRadius) || 6371030;

    this.params = {
      cloudsVisible: true,
      bottomRadius: bottomRadiusMeters,
      layers: [
        { channel: 'r', altitude: 1800, height: 650, densityScale: 0.2, shapeAmount: 1.0, shapeDetailAmount: 1.0, weatherExponent: 1.0, shapeAlteringBias: 0.35, coverageFilterWidth: 0.6, coverage: 0.3, densityProfile: { expTerm: 0, exponent: 0, linearTerm: 0.75, constantTerm: 0.25 } },
        { channel: 'g', altitude: 2400, height: 1200, densityScale: 0.2, shapeAmount: 1.0, shapeDetailAmount: 1.0, weatherExponent: 1.0, shapeAlteringBias: 0.35, coverageFilterWidth: 0.6, coverage: 0.3, densityProfile: { expTerm: 0, exponent: 0, linearTerm: 0.75, constantTerm: 0.25 } },
        { channel: 'b', altitude: 7500, height: 500, densityScale: 0.003, shapeAmount: 0.4, shapeDetailAmount: 0.0, weatherExponent: 1.0, shapeAlteringBias: 0.35, coverageFilterWidth: 0.5, coverage: 0.3, densityProfile: { expTerm: 0, exponent: 0, linearTerm: 0.75, constantTerm: 0.25 } },
        { channel: 'a' }
      ],
      maxSteps: 500, maxStepsToSun: 8, minStepSize: 20.0, maxStepSize: 1000.0, maxRayDistance: 200000.0,
      perspectiveStepScale: 1.005, minDensity: 1e-5, minExtinction: 1e-5, minTransmittance: 0.01,
      // 远处云距离衰减（米）：天际线附近射线斜穿云层累积过密，从 distFadeStart 起线性衰减到 distFadeEnd 完全消失
      distFadeStart: 11000.0, distFadeEnd: 51000.0,
      // 相机高度淡出（米）：相机升过云顶后，在 altitudeFadeRange 范围内线性淡出至消失
      altitudeFadeRange: 8000.0,
      // 云层高度基准："absolute"=相对海平面 0m；"terrain"=相对相机下方地形表面（每帧采样 + 指数平滑）
      altitudeMode: "absolute",
      minSecondaryStepSize: 100.0, secondaryStepScale: 2.0, multiScatteringOctaves: 8, lowLayerDensityBoost: 1.0,
      shadowLengthEnabled: true, useShadowBuffer: true, hazeEnabled: false,
      maxShadowLengthIterationCount: 500, minShadowLengthStepSize: 50.0, maxShadowLengthRayDistance: 200000.0,
      hazeDensityScale: 3e-5, hazeExponent: 1e-3, hazeScatteringCoefficient: 0.9, hazeAbsorptionCoefficient: 0.5,
      weatherRepeat: 100.0, shapeRepeat: 4.1, shapeDetailRepeat: 0.0005,
      turbulenceRepeat: 2.0, turbulenceDisplacement: 400.0,
      scatteringCoefficient: 1.0, absorptionCoefficient: 0.0,
      scatterG1: 0.7, scatterG2: -0.2, scatterMix: 0.5,
      sunIntensity: 20.0, skyLightScale: 1.0, skyToSunRatio: 0.28,
      powderScale: 0.8, powderExponent: 150.0,
      aerialPerspectiveScale: 0.0, cloudExposure: 3.0, magentaFixStrength: 2.0, edgeAlphaCutoff: 0.0, mipLevelScale: 0.35,
      windSpeed: 0.0, evolutionSpeed: 0.005,
      temporalEnabled: false, temporalAlpha: 0.1,
      blueNoiseScale: 1.0, jitterStrength: 1.0,
      // BSM cascade 几何：shadowFar 控制覆盖最远距离，splitLambda 控制近处分配，fadeScale 扩大 ortho radius 防切割
      // fadeScale 提高以扩大 ortho 覆盖，避免 cascade 矩形外硬切；不再依赖 UV edgeFade
      // shadowFar 对齐云可见距离量级（云 maxRayDistance=200000），否则超过 shadowFar 的云看得见但不产生 BSM、
      // cascade 边界硬切导致移动时阴影弹出。可经面板下调以换取帧率。
      shadowFar: 120000, shadowSplitLambda: 1.0, shadowFadeScale: 5.0,
      // 性能控制：默认值偏向极致；面板预设会在 init 前覆盖为 smooth/balanced/ultra。
      shadowMapSize: 1024, bsmUpdateInterval: 1, shadowResolveEnabled: true, shadowPcfTaps: 16,
      // 云主 raymarch 分辨率缩放（0.25~1）：<1 时拆分为低分辨率 raymarch + 全分辨率合成，
      // raymarch 像素成本按 scale² 下降；在 init 时生效（预设注入），运行时改动需重开体积云。
      cloudResolutionScale: 1.0,
    };

    if (options.initialCloudParams) {
      this._applyInitialCloudParams(options.initialCloudParams);
    }

    this.atmosphere = null;
    this.aerial = null;
    this.cloudStage = null;
    this.textures = null;
    this._ready = null;

    // BSM state
    this._bsm = { pass: null, resolve: null, blitFbo: null, blitProg: null, blitVbo: null, blitLoc: null };
    this._bsmBlitSize = Number(this.params.shadowMapSize) || BSM_BLIT_SIZE;
    /** 当前 BSM GPU 资源签名；质量预设/阴影尺寸变化时用于触发重建。 */
    this._bsmResourceSignature = null;
    this._bsmShadowDisabled = false;
    /** V3.3.20：每帧 _syncBSM blit 写入的共享 Cesium.Texture，供主云 stage u_shadowBuffer 采样 */
    this._bsmSharedTexture = null;
    /** BSM atlas 编码缩放；主云、天空与 Aerial 必须一致解码，避免云体/地面阴影强度错配。 */
    this._bsmShadowScale = 1.0;
    /** 共享纹理是否已至少 blit 一次（blit 门控用；BSM 未更新的帧跳过 blit） */
    this._bsmBlitDone = false;
    // TAA state
    this._taa = { texA: null, texB: null, current: 0, pbo: null, pboReady: false, w: 0, h: 0, frameCount: 0, prevVP: null, curVP: null };
    // Wind offsets
    this._weatherOffsetX = 0; this._weatherOffsetY = 0;
    this._shapeOffsetX = 0; this._shapeOffsetY = 0; this._shapeOffsetZ = 0;
    this._shapeDetailOffsetX = 0; this._shapeDetailOffsetY = 0; this._shapeDetailOffsetZ = 0;
    this._lastFrameTime = undefined;
    this._lastOffsetFrame = -1;
    this._clockStartTime = undefined;
    this._clockElapsedSeconds = 0;
    this._lastClockElapsedSeconds = undefined;
    this._listeners = [];
    // terrain 高度基准：每帧采样状态与平滑值
    this._terrainOffsetFrame = -1;
    this._terrainOffsetSampled = false;
    this._terrainOffsetSmoothed = 0;

    // 每帧 uniform 回调复用的 scratch 对象池：每个 uniform 独立实例，避免同帧互相覆盖与 GC 抖动
    this._scratch = {
      // _getAltitudeCorrectionOffset 内部中间量
      altCorrCarto: new Cesium.Cartographic(),
      altCorrSurface: new Cesium.Cartesian3(),
      altCorrNormal: new Cesium.Cartesian3(),
      altCorrCenter: new Cesium.Cartesian3(),
      // _getIntervalHeights 内部中间量与结果
      intervalEntries: Array.from({ length: 8 }, () => ({ v: 0, flag: 0 })),
      intervalRanges: Array.from({ length: 3 }, () => ({ min: 0, max: 0 })),
      intervalResult: { min: new Cesium.Cartesian3(), max: new Cesium.Cartesian3() },
      // uniform 回调各自的返回容器
      altitudeCorrection: new Cesium.Cartesian3(),
      cameraHeightCorr: new Cesium.Cartesian3(),
      cameraHeightPos: new Cesium.Cartesian3(),
      // _getTerrainOffset 内部中间量
      terrainCarto: new Cesium.Cartographic(),
      minLayerHeights: new Cesium.Cartesian4(),
      maxLayerHeights: new Cesium.Cartesian4(),
      densityScales: new Cesium.Cartesian4(),
      shapeAmounts: new Cesium.Cartesian4(),
      shapeDetailAmounts: new Cesium.Cartesian4(),
      weatherExponents: new Cesium.Cartesian4(),
      shapeAlteringBiases: new Cesium.Cartesian4(),
      coverageFilterWidths: new Cesium.Cartesian4(),
      coverages: new Cesium.Cartesian4(),
      densityProfileExpTerms: new Cesium.Cartesian4(),
      densityProfileExponents: new Cesium.Cartesian4(),
      densityProfileLinearTerms: new Cesium.Cartesian4(),
      densityProfileConstantTerms: new Cesium.Cartesian4(),
      shadowTexelSize: new Cesium.Cartesian2(),
      shadowDecode: new Cesium.Cartesian4(1.0, 1.0, 1.0, 1.0),
      shadowIntervals: Array.from({ length: 4 }, () => new Cesium.Cartesian2()),
      shadowMatrices: Array.from({ length: 4 }, () => new Cesium.Matrix4()),
      localWeatherOffset: new Cesium.Cartesian2(),
      shapeOffset: new Cesium.Cartesian3(),
      shapeDetailOffset: new Cesium.Cartesian3(),
      resolution: new Cesium.Cartesian2(),
      // _syncBSM 每帧传给 CloudShadowPass.updateDynamicParams / setCloudShadow 的复用容器
      bsmDynamicParams: {
        coverages: [0, 0, 0, 0], densityScales: [0, 0, 0, 0], shapeAmounts: [0, 0, 0, 0],
        shapeDetailAmounts: [0, 0, 0, 0], weatherExponents: [0, 0, 0, 0],
        shapeAlteringBiases: [0, 0, 0, 0], coverageFilterWidths: [0, 0, 0, 0],
        localWeatherOffset: [0, 0], shapeOffset: [0, 0, 0], shapeDetailOffset: [0, 0, 0],
        windSpeed: 0, evolutionSpeed: 0, clockElapsedSeconds: 0,
        // V3.4.x：层高/间隙/密度剖面运行时同步（此前 pass 创建后固化，
        // 面板改层高会造成云体与云影层高错位）
        minLayerHeights: [0, 0, 0, 0], maxLayerHeights: [0, 0, 0, 0],
        minIntervalHeights: [0, 0, 0], maxIntervalHeights: [0, 0, 0],
        densityProfileLinear: [0.75, 0.75, 0.75, 0.75],
        densityProfileConstant: [0.25, 0.25, 0.25, 0.25],
        densityProfileExpTerms: [0, 0, 0, 0], densityProfileExponents: [0, 0, 0, 0],
      },
      bsmShadowOpts: null, // 惰性构建：首次 _syncBSM 时按 setCloudShadow 期望字段填充
      bsmShadowIntervals: Array.from({ length: 4 }, () => new Cesium.Cartesian2()),
      bsmShadowMatrices: Array.from({ length: 4 }, () => new Cesium.Matrix4()),
    };
  }

  // ── Texture loading ────────────────────────────────────────────────────

  /**
   * 初始化前应用面板性能参数，确保 BSM 尺寸/开关在 GPU 资源创建前生效。
   * @param {Record<string, unknown>} params
   */
  _applyInitialCloudParams(params: any) {
    if (!params || typeof params !== "object") return;
    const p = this.params;
    if (typeof params.cloudsEnabled === "boolean") p.cloudsVisible = params.cloudsEnabled;
    const scalarKeys = [
      "sunIntensity", "cloudExposure", "skyToSunRatio", "aerialPerspectiveScale", "magentaFixStrength",
      "scatterG1", "scatterG2", "multiScatteringOctaves", "windSpeed", "evolutionSpeed",
      "distFadeStart", "distFadeEnd", "maxSteps", "maxStepsToSun", "minStepSize", "maxStepSize",
      "perspectiveStepScale", "maxRayDistance", "shadowFar", "shadowSplitLambda", "shadowFadeScale",
      "altitudeFadeRange", "maxShadowLengthIterationCount", "shadowMapSize", "bsmUpdateInterval", "shadowPcfTaps",
      "cloudResolutionScale"
    ];
    for (const key of scalarKeys) {
      const v = Number(params[key]);
      if (Number.isFinite(v)) p[key] = v;
    }
    // 低成本档关闭 3D detail 噪声采样：保持云形大轮廓，减少每步 texture3D 访问。
    const smoothMode = params.quality === "smooth";
    if (params.altitudeMode === "absolute" || params.altitudeMode === "terrain") p.altitudeMode = params.altitudeMode;
    for (let i = 0; i < 3; i++) {
      const layer = p.layers[i];
      if (!layer) continue;
      const altitude = Number(params[`layer${i}Altitude`]);
      const height = Number(params[`layer${i}Height`]);
      const coverage = Number(params[`layer${i}Coverage`]);
      if (Number.isFinite(altitude)) layer.altitude = altitude;
      if (Number.isFinite(height)) layer.height = height;
      if (Number.isFinite(coverage)) layer.coverage = coverage;
      if (smoothMode) layer.shapeDetailAmount = 0.0;
    }
    if (typeof params.useShadowBuffer === "boolean") p.useShadowBuffer = params.useShadowBuffer;
    if (typeof params.shadowLengthEnabled === "boolean") p.shadowLengthEnabled = params.shadowLengthEnabled;
    if (typeof params.hazeEnabled === "boolean") p.hazeEnabled = params.hazeEnabled;
    if (typeof params.temporalEnabled === "boolean") p.temporalEnabled = params.temporalEnabled;
    if (typeof params.shadowResolveEnabled === "boolean") p.shadowResolveEnabled = params.shadowResolveEnabled;
  }

  async _load3DTexture(url: string, size: number) {
    const data3D = await loadBinThreeGeospatial(url, size);
    return bindData3DTextureToCesiumContext(this.viewer, data3D, Cesium);
  }

  async _load3DTextureWHD(url: string, width: number, height: number, depth: number) {
    const arrayBuffer = await Cesium.Resource.fetchArrayBuffer(url);
    const raw = new Uint8Array(arrayBuffer);
    return new Cesium.Texture3D({
      context: this.viewer.scene.context,
      width,
      height,
      depth,
      pixelFormat: Cesium.PixelFormat.RED,
      pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
      source: {
        arrayBufferView: raw,
        width,
        height,
        depth,
      },
      sampler: new Cesium.Sampler({
        minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
        magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
        wrapS: Cesium.TextureWrap.REPEAT,
        wrapT: Cesium.TextureWrap.REPEAT,
        wrapR: Cesium.TextureWrap.REPEAT,
      }),
    });
  }

  async _load2DTexture(url: string) {
    const img = await Cesium.Resource.fetchImage(url);
    if (!img || img.width <= 2 || img.height <= 2) throw new Error(`Invalid image: ${url}`);
    return new Cesium.Texture({
      context: this.viewer.scene.context, source: img,
      sampler: new Cesium.Sampler({ minificationFilter: Cesium.TextureMinificationFilter.LINEAR, magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR, wrapS: Cesium.TextureWrap.REPEAT, wrapT: Cesium.TextureWrap.REPEAT })
    });
  }

  async _loadTextures() {
    const bp = this.assetsBase;
    const [shape, detail, stbn, weather, turb, noise] = await Promise.all([
      this._load3DTexture(bp + "shape.bin", 128).catch(() : any => null),
      this._load3DTexture(bp + "shape_detail.bin", 32).catch(() : any => null),
      this._load3DTextureWHD(bp + "stbn.bin", 128, 128, 64).catch(() : any => null),
      this._load2DTexture(bp + "local_weather.png").catch(() : any => null),
      this._load2DTexture(bp + "turbulence.png").catch(() : any => null),
      this._load2DTexture(this.blueNoiseUrl).catch(() : any => null),
    ]);
    this.textures = { shape, shapeDetail: detail, stbn, weather, turbulence: turb, blueNoise: noise };
    console.warn("[Pipeline] textures:", Object.fromEntries(Object.entries(this.textures).map(([k, v]) => [k, !!v])));
  }

  // ── Shader loading for Bruneton prefix ─────────────────────────────────

  async _loadShader(name: string) {
    return loadShaderSource(name, { shaderBaseUrl: this.brunetonShaderBase });
  }

  /**
   * 组装云主 pass 片元着色器。
   * @param {boolean} [splitMode=false] - true 时定义 SPLIT_CLOUD_OUTPUT：
   *   低分辨率 raymarch stage 只输出预乘云色，由全分辨率合成 stage 混合场景。
   */
  async _buildCloudFragmentShader(splitMode: boolean = false) {
    const provider = this.atmosphere.getAtmosphereForClouds();
    const [definitions, common, runtime] = await Promise.all([
      this._loadShader("definitions.glsl"),
      this._loadShader("common.glsl"),
      this._loadShader("runtime.glsl"),
    ]);
    const defines = "precision highp float;\nprecision highp sampler2D;\nprecision highp sampler3D;\n"
      + provider.constants.getShaderDefines()
      + "\n#define METER_TO_LENGTH_UNIT 0.001\n#define USE_ATMOSPHERE_IRRADIANCE\n"
      + (splitMode ? "#define SPLIT_CLOUD_OUTPUT\n" : "");
    const globalU = `
uniform vec3 sunDirection;
uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler2D irradiance_texture;
`;
    return defines + definitions + "\n" + common + "\n" + globalU + "\n" + runtime + "\n" + getCloudFragmentShader();
  }

  // ── Wind animation ─────────────────────────────────────────────────────

  /**
   * 获取 Cesium 仿真时钟经过秒数；用于让云演化跟随时间轴播放、倍速与拖拽。
   * @returns {number}
   */
  _getClockElapsedSeconds() {
    const clock = this.viewer?.clock;
    const currentTime = clock?.currentTime;
    if (!currentTime || typeof Cesium.JulianDate?.secondsDifference !== "function") {
      return performance.now() / 1000;
    }
    if (!this._clockStartTime) {
      this._clockStartTime = Cesium.JulianDate.clone(currentTime);
    }
    return Cesium.JulianDate.secondsDifference(currentTime, this._clockStartTime);
  }

  /**
   * 推进云纹理偏移。以 Cesium clock 为唯一时间源，支持时间轴拖拽和 multiplier 加速。
   * @returns {number} 当前仿真经过秒数
   */
  _advanceOffsets() {
    const frame = this._frameCount || 0;
    const elapsed = this._getClockElapsedSeconds();
    if (this._lastOffsetFrame === frame) return elapsed;
    this._lastOffsetFrame = frame;

    this._weatherOffsetX = (this.params.windSpeed || 0) * elapsed;
    this._shapeOffsetX = (this.params.evolutionSpeed || 0) * elapsed;
    this._shapeDetailOffsetX = (this.params.evolutionSpeed || 0) * 2 * elapsed;
    this._clockElapsedSeconds = elapsed;
    this._lastClockElapsedSeconds = elapsed;
    return elapsed;
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  // 以下 helper 均支持可选 result/内部 scratch：uniform 回调每帧执行，避免反复 new Cartesian* 触发 GC。

  _getDensityProfileVec4(key: string, result?: any) {
    const ls = this.params.layers, def = (k: any) => k === "linearTerm" ? 0.75 : k === "constantTerm" ? 0.25 : 0;
    const out = result || new Cesium.Cartesian4();
    const val = (i: any) => { const v = ls[i]?.densityProfile?.[key]; return v !== undefined ? Number(v) : def(key); };
    out.x = val(0); out.y = val(1); out.z = val(2); out.w = val(3);
    return out;
  }

  _getIntervalHeights() {
    const ls = this.params.layers;
    const entries = this._scratch.intervalEntries;
    for (let i = 0; i < 4; i++) {
      const a = Number(ls[i]?.altitude) || 0, h = Number(ls[i]?.height) || 0;
      const e0 = entries[i * 2], e1 = entries[i * 2 + 1];
      e0.v = a; e0.flag = 0;
      e1.v = a + h; e1.flag = 1;
    }
    entries.sort((a: any, b: any) => a.v !== b.v ? a.v - b.v : a.flag - b.flag);
    const iv = this._scratch.intervalRanges;
    for (let i = 0; i < 3; i++) { iv[i].min = 0; iv[i].max = 0; }
    let idx = 0, balance = 0;
    for (let i = 0; i < entries.length; i++) { if (balance === 0 && i > 0 && idx < 3) { iv[idx].min = entries[i - 1].v; iv[idx].max = entries[i].v; idx++; } balance += entries[i].flag === 0 ? 1 : -1; }
    const out = this._scratch.intervalResult;
    out.min.x = iv[0].min; out.min.y = iv[1].min; out.min.z = iv[2].min;
    out.max.x = iv[0].max; out.max.y = iv[1].max; out.max.z = iv[2].max;
    return out;
  }

  _getLayerVec4(key: string, fallback: any = 0, result?: any) {
    const ls = this.params.layers;
    const out = result || new Cesium.Cartesian4();
    const val = (i: any) => { const v = ls[i]?.[key]; return v !== undefined ? Number(v) : fallback; };
    out.x = val(0); out.y = val(1); out.z = val(2); out.w = val(3);
    return out;
  }

  _getAltitudeCorrectionOffset(bottomRadius: number, result?: any) {
    const out = result || new Cesium.Cartesian3();
    const ellipsoid = this.viewer?.scene?.globe?.ellipsoid;
    const cameraPos = this.viewer?.camera?.positionWC;
    if (!ellipsoid || !cameraPos) return Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, out);
    const s = this._scratch;
    const carto = Cesium.Cartographic.fromCartesian(cameraPos, ellipsoid, s.altCorrCarto);
    if (!carto) return Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, out);
    const surface = Cesium.Cartesian3.fromRadians(
      carto.longitude,
      carto.latitude,
      0.0,
      ellipsoid,
      s.altCorrSurface
    );
    const normal = ellipsoid.geodeticSurfaceNormal(surface, s.altCorrNormal);
    const center = Cesium.Cartesian3.subtract(
      surface,
      Cesium.Cartesian3.multiplyByScalar(normal, Number(bottomRadius) || 0, s.altCorrNormal),
      s.altCorrCenter
    );
    return Cesium.Cartesian3.negate(center, out);
  }

  // 层高出口统一叠加地形偏移：terrain 模式下所有高度消费方（uniform / BSM / 阴影）看到的是世界坐标
  _getMinHeight() { const ls = this.params.layers; const off = this._getTerrainOffset(); let m = Infinity; for (let i = 0; i < 4; i++) { if ((Number(ls[i]?.height) || 0) > 0) m = Math.min(m, Number(ls[i]?.altitude) || 0); } return (Number.isFinite(m) ? m : 0) + off; }
  _getMaxHeight() { const ls = this.params.layers; const off = this._getTerrainOffset(); let m = 0; for (let i = 0; i < 4; i++) { const h = Number(ls[i]?.height) || 0; if (h > 0) m = Math.max(m, (Number(ls[i]?.altitude) || 0) + h); } return m + off; }

  /**
   * 云层高度基准偏移（米）。
   * absolute 模式恒为 0；terrain 模式取相机正下方地形表面海拔，经指数平滑抑制采样跳变。
   * 每帧只采样一次（帧去重），uniform 回调与 _syncBSM 共享同一值。
   * @returns {number}
   */
  _getTerrainOffset() {
    if (this.params.altitudeMode !== "terrain") {
      this._terrainOffsetSmoothed = 0;
      return 0;
    }
    // 帧去重：同一帧内多个 uniform 回调 / BSM 同步复用首次采样结果
    const frame = this._frameCount || 0;
    if (this._terrainOffsetFrame === frame && this._terrainOffsetSampled) {
      return this._terrainOffsetSmoothed;
    }
    this._terrainOffsetFrame = frame;
    this._terrainOffsetSampled = true;

    const globe = this.viewer?.scene?.globe;
    const cameraPos = this.viewer?.camera?.positionWC;
    if (!globe || !cameraPos) return this._terrainOffsetSmoothed || 0;
    const carto = Cesium.Cartographic.fromCartesian(cameraPos, globe.ellipsoid, this._scratch.terrainCarto);
    if (!carto) return this._terrainOffsetSmoothed || 0;

    // 仅用已加载地形瓦片同步采样；未覆盖时保持上一帧平滑值，避免跳变
    const terrainHeight = globe.getHeight?.(carto);
    if (!Number.isFinite(terrainHeight)) return this._terrainOffsetSmoothed || 0;
    // 无有效历史时直接采用；否则指数平滑（相机平移/地形起伏时云层高度连续变化）
    const prev = Number.isFinite(this._terrainOffsetSmoothed) ? this._terrainOffsetSmoothed : terrainHeight;
    this._terrainOffsetSmoothed = prev + (terrainHeight - prev) * 0.08;
    return this._terrainOffsetSmoothed;
  }

  // ── Cloud PostProcessStage uniform map ─────────────────────────────────

  _buildCloudUniforms() {
    const self = this, p = () => self.params, tex = () => self.textures;
    const provider = this.atmosphere.getAtmosphereForClouds();
    const atm = provider.getUniforms();
    const u = {
      u_shapeTexture: () => tex()?.shape,
      u_shapeDetailTexture: () => tex()?.shapeDetail,
      u_stbnTexture: () => tex()?.stbn || tex()?.shape,
      u_weatherTexture: () => tex()?.weather,
      u_turbulenceTexture: () => tex()?.turbulence,
      u_blueNoise: () => tex()?.blueNoise,
      u_blueNoiseScale: () => p().blueNoiseScale ?? 1.0,
      u_jitterStrength: () => p().jitterStrength ?? 1.0,
      u_cameraPosition: () => self.viewer.camera.positionWC,
      u_altitudeCorrection: () => {
        const br = Number(atm.bottomRadius()) || Number(p().bottomRadius) || 0;
        return self._getAltitudeCorrectionOffset(br, self._scratch.altitudeCorrection);
      },
      u_cameraHeight: () => {
        const s = self._scratch;
        const br = Number(atm.bottomRadius()) || Number(p().bottomRadius) || 0;
        const corr = self._getAltitudeCorrectionOffset(br, s.cameraHeightCorr);
        const pos = Cesium.Cartesian3.add(self.viewer.camera.positionWC, corr, s.cameraHeightPos);
        return Math.max(0, Cesium.Cartesian3.magnitude(pos) - br);
      },
      u_bottomRadius: () => Number(p().bottomRadius),
      u_minHeight: () => self._getMinHeight(),
      u_maxHeight: () => self._getMaxHeight(),
      u_minLayerHeights: () => { const off = self._getTerrainOffset(); const out = self._getLayerVec4("altitude", 0, self._scratch.minLayerHeights); out.x += off; out.y += off; out.z += off; out.w += off; return out; },
      u_maxLayerHeights: () => { const ls = p().layers, out = self._scratch.maxLayerHeights, off = self._getTerrainOffset(); out.x = (Number(ls[0]?.altitude)||0)+(Number(ls[0]?.height)||0)+off; out.y = (Number(ls[1]?.altitude)||0)+(Number(ls[1]?.height)||0)+off; out.z = (Number(ls[2]?.altitude)||0)+(Number(ls[2]?.height)||0)+off; out.w = (Number(ls[3]?.altitude)||0)+(Number(ls[3]?.height)||0)+off; return out; },
      u_densityScales: () => self._getLayerVec4("densityScale", 0, self._scratch.densityScales),
      u_shapeAmounts: () => self._getLayerVec4("shapeAmount", 0, self._scratch.shapeAmounts),
      u_shapeDetailAmounts: () => self._getLayerVec4("shapeDetailAmount", 0, self._scratch.shapeDetailAmounts),
      u_weatherExponents: () => self._getLayerVec4("weatherExponent", 1, self._scratch.weatherExponents),
      u_shapeAlteringBiases: () => self._getLayerVec4("shapeAlteringBias", 0.35, self._scratch.shapeAlteringBiases),
      u_coverageFilterWidths: () => self._getLayerVec4("coverageFilterWidth", 0.6, self._scratch.coverageFilterWidths),
      u_maxSteps: () => p().maxSteps, u_maxStepsToSun: () => p().maxStepsToSun,
      u_minStepSize: () => p().minStepSize, u_maxStepSize: () => p().maxStepSize,
      u_maxRayDistance: () => p().maxRayDistance,
      u_distFadeStart: () => Number(p().distFadeStart) || 30000.0,
      u_distFadeEnd: () => Number(p().distFadeEnd) || 150000.0,
      u_altitudeFadeStart: () => self._getMaxHeight(),
      u_altitudeFadeEnd: () => self._getMaxHeight() + (Number(p().altitudeFadeRange) || 8000.0),
      u_cameraNear: () => Number(self.viewer.camera.frustum?.near) || 0,
      u_shadowTopHeight: () => self._getMaxHeight(),
      u_shadowLengthEnabled: () => p().shadowLengthEnabled ? 1 : 0,
      u_hazeEnabled: () => p().hazeEnabled ? 1 : 0,
      u_maxShadowLengthIterationCount: () => p().maxShadowLengthIterationCount,
      u_minShadowLengthStepSize: () => p().minShadowLengthStepSize,
      u_maxShadowLengthRayDistance: () => p().maxShadowLengthRayDistance,
      u_hazeDensityScale: () => p().hazeDensityScale, u_hazeExponent: () => p().hazeExponent,
      u_hazeScatteringCoefficient: () => p().hazeScatteringCoefficient,
      u_hazeAbsorptionCoefficient: () => p().hazeAbsorptionCoefficient,
      u_shadowBuffer: () => {
        if (p().useShadowBuffer && self._bsm.pass) {
          // V3.3.20 修复：不再返回自定义 bind() 对象——Cesium PostProcessStage uniform 采样走内部逻辑，
          // 不会调用自定义 bind，导致 BSM 纹理绑不上/采样残留。改为返回 _syncBSM 已 blit 写入的共享
          // Cesium.Texture（getCloudShadowTargetTexture），与 atmosphere/aerial 两侧 setCloudShadow 同源。
          const shared = self._bsmSharedTexture;
          if (shared) return shared;
          // 退化路径：无共享目标时回退到 pass 的原生 Cesium.Texture（CloudShadowPass 已用 Cesium.Texture 包 RT）
          const passTex = self._bsm.pass.getTexture?.();
          if (passTex) return passTex;
        }
        return tex()?.weather;
      },
      u_shadowScale: () => self._bsmShadowScale ?? 1.0,
      u_shadowDecode: () => self._scratch.shadowDecode,
      u_shadowTexelSize: () => { const tile = self._bsm.pass ? self._bsm.pass.getTileSize?.() || Math.floor((Number(p().shadowMapSize) || SHADOW_MAP_SIZE) / 2) : 512; const out = self._scratch.shadowTexelSize; out.x = 1 / tile; out.y = 1 / tile; return out; },
      u_shadowIntervals: () => {
        const out = self._scratch.shadowIntervals;
        if (p().useShadowBuffer && self._bsm.pass) {
          const iv = self._bsm.pass.getShadowIntervals();
          for (let i = 0; i < 4; i++) { out[i].x = iv[i][0]; out[i].y = iv[i][1]; }
        } else {
          for (let i = 0; i < 4; i++) { out[i].x = 0; out[i].y = 0; }
        }
        return out;
      },
      u_shadowMatrices: () => {
        const out = self._scratch.shadowMatrices;
        if (p().useShadowBuffer && self._bsm.pass) {
          // V3.4.7：必须读 published 矩阵（与 atlas 内容配对的快照）。
          // 旧代码读 RAW _shadowMatrices（updateShadowCascades 每帧覆盖），
          // interval>1 跳帧期间与旧 atlas 失配 → 云体 BSM 采样/丁达尔错位闪烁。
          const mats = self._bsm.pass.getShadowMatrices();
          for (let i = 0; i < 4; i++) Cesium.Matrix4.fromArray(mats[i], 0, out[i]);
        } else {
          for (let i = 0; i < 4; i++) Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY, out[i]);
        }
        return out;
      },
      u_shadowFar: () => self._bsm.pass ? self._bsm.pass.getShadowFar() : p().maxShadowLengthRayDistance,
      u_shadowNear: () => self._bsm.pass ? self._bsm.pass.getShadowNear() : (Number(self.viewer.camera.frustum?.near) || 0.1),
      u_maxShadowFilterRadius: () => 2.0,
      u_shadowPcfTaps: () => Math.min(16, Math.max(1, Number(p().shadowPcfTaps) || 16)),
      u_useShadowBuffer: () => p().useShadowBuffer ? 1 : 0,
      u_skyLightScale: () => p().skyLightScale,
      u_weatherRepeat: () => p().weatherRepeat,
      u_localWeatherOffset: () => { self._advanceOffsets(); const out = self._scratch.localWeatherOffset; out.x = self._weatherOffsetX; out.y = self._weatherOffsetY; return out; },
      u_shapeRepeat: () => (Number(p().shapeRepeat) || 3) / 1e4,
      u_shapeOffset: () => { self._advanceOffsets(); const out = self._scratch.shapeOffset; out.x = self._shapeOffsetX; out.y = self._shapeOffsetY; out.z = self._shapeOffsetZ; return out; },
      u_shapeDetailRepeat: () => p().shapeDetailRepeat,
      u_shapeDetailOffset: () => { self._advanceOffsets(); const out = self._scratch.shapeDetailOffset; out.x = self._shapeDetailOffsetX; out.y = self._shapeDetailOffsetY; out.z = self._shapeDetailOffsetZ; return out; },
      u_turbulenceRepeat: () => p().turbulenceRepeat, u_turbulenceDisplacement: () => p().turbulenceDisplacement,
      u_coverages: () => self._getLayerVec4("coverage", 0.3, self._scratch.coverages),
      u_coverageHaze: () => { const ls = p().layers; return Math.max(Number(ls[0]?.coverage) ?? 0.3, Number(ls[1]?.coverage) ?? 0.3, Number(ls[2]?.coverage) ?? 0.3); },
      u_scatteringCoefficient: () => p().scatteringCoefficient, u_absorptionCoefficient: () => p().absorptionCoefficient,
      u_scatterG1: () => p().scatterG1, u_scatterG2: () => p().scatterG2, u_scatterMix: () => p().scatterMix,
      u_sunIntensity: () => p().sunIntensity, u_skyToSunRatio: () => p().skyToSunRatio,
      u_powderScale: () => p().powderScale, u_powderExponent: () => p().powderExponent,
      u_aerialPerspectiveScale: () => p().aerialPerspectiveScale, u_cloudExposure: () => p().cloudExposure,
      u_magentaFixStrength: () => p().magentaFixStrength ?? 0.8,
      u_edgeAlphaCutoff: () => p().edgeAlphaCutoff ?? 0.03,
      u_resolution: () => { const ctx = self.viewer.scene.context; const out = self._scratch.resolution; out.x = ctx.drawingBufferWidth || 1; out.y = ctx.drawingBufferHeight || 1; return out; },
      u_mipLevelScale: () => Number(p().mipLevelScale) || 1.0,
      u_perspectiveStepScale: () => p().perspectiveStepScale ?? 1.01,
      u_minDensity: () => p().minDensity ?? 1e-5, u_minExtinction: () => p().minExtinction ?? 1e-5,
      u_minTransmittance: () => p().minTransmittance ?? 0.01,
      u_minSecondaryStepSize: () => p().minSecondaryStepSize ?? 100, u_secondaryStepScale: () => p().secondaryStepScale ?? 2,
      u_multiScatteringOctaves: () => Math.min(12, Math.max(1, p().multiScatteringOctaves ?? 8)),
      u_lowLayerDensityBoost: () => p().lowLayerDensityBoost ?? 1.0,
      u_densityProfileExpTerms: () => self._getDensityProfileVec4("expTerm", self._scratch.densityProfileExpTerms),
      u_densityProfileExponents: () => self._getDensityProfileVec4("exponent", self._scratch.densityProfileExponents),
      u_densityProfileLinearTerms: () => self._getDensityProfileVec4("linearTerm", self._scratch.densityProfileLinearTerms),
      u_densityProfileConstantTerms: () => self._getDensityProfileVec4("constantTerm", self._scratch.densityProfileConstantTerms),
      u_minIntervalHeights: () => self._getIntervalHeights().min,
      u_maxIntervalHeights: () => self._getIntervalHeights().max,
      u_historyTexture: () => { const t = self._taaGetHistoryTexture(); return t || tex()?.blueNoise; },
      u_prevViewProjection: () => self._taa.prevVP || Cesium.Matrix4.IDENTITY,
      u_temporalAlpha: () => p().temporalAlpha ?? 0.1,
      // 拆分模式下 in-shader TAA 不适用（输出为预乘云色，无场景合成），强制关闭
      u_temporalEnabled: () => (p().temporalEnabled && !self._cloudSplitMode && self._taa.frameCount > 2 && self._taa.prevVP) ? 1 : 0,
      u_frame: () => self._frameCount || 0,
    };

    Object.assign(u, atm);
    u.u_cameraPosition = atm.cameraPosition;
    u.u_bottomRadius = atm.bottomRadius;
    return u;
  }

  // ── BSM helpers ─────────────────────────────────────────────────────────

  /**
   * 计算当前 BSM GPU 资源签名；尺寸/更新节奏变化需要重建 RT/FBO 与 resolve pass。
   * @returns {{ size: number, updateInterval: number, resolveEnabled: boolean }}
   */
  _getBSMResourceSignature() {
    return {
      size: Math.max(256, Number(this.params.shadowMapSize) || SHADOW_MAP_SIZE),
      updateInterval: Math.max(1, Number(this.params.bsmUpdateInterval) || 1),
      resolveEnabled: this.params.shadowResolveEnabled !== false,
    };
  }

  /**
   * 判断两个 BSM 资源签名是否一致。
   * @param {{ size: number, updateInterval: number, resolveEnabled: boolean } | null} a
   * @param {{ size: number, updateInterval: number, resolveEnabled: boolean } | null} b
   * @returns {boolean}
   */
  _sameBSMResourceSignature(a: any, b: any) {
    return !!a && !!b && a.size === b.size && a.updateInterval === b.updateInterval && a.resolveEnabled === b.resolveEnabled;
  }

  /**
   * 创建或复用 BSM pass；用于初始化和运行时从“流畅/关闭”切换到开启云影。
   */
  _ensureBSMPasses() {
    if (!this.params.useShadowBuffer || !this.textures) return;
    const signature = this._getBSMResourceSignature();
    if (this._bsm.pass && this._sameBSMResourceSignature(this._bsmResourceSignature, signature)) {
      this._bsm.pass.updateInterval = signature.updateInterval;
      if (this._bsm.resolve) {
        this._bsm.resolve.updateInterval = signature.resolveEnabled ? signature.updateInterval : Number.MAX_SAFE_INTEGER;
        this._bsm.resolve.enabled = signature.resolveEnabled;
      }
      return;
    }

    this._destroyBSMPasses({ disableShadow: false });
    this._bsmBlitSize = signature.size;
    this._bsm.pass = new CloudShadowPass(this.viewer, {
      size: signature.size,
      updateInterval: signature.updateInterval,
      textures: this.textures,
      params: this._getShadowPassParams(),
      // V3.4.7：由 _syncBSM 显式驱动 render()，不自注册 preRender listener。
      // 运行时重建 pass 时监听器会排到 _syncBSM 之后，导致消费端固定读到上一帧状态。
      autoRender: false,
    });
    this._bsm.pass.init();
    this._bsm.resolve = new ShadowResolvePass(this.viewer, {
      size: signature.size,
      temporalAlpha: 0.01,
      updateInterval: signature.resolveEnabled ? signature.updateInterval : Number.MAX_SAFE_INTEGER,
      enabled: signature.resolveEnabled,
    });
    this._bsm.resolve.setInputTextures(this._bsm.pass.getTexture(), this._bsm.pass.getDepthVelocityTexture());
    this._bsm.resolve.init();
    this._bsmResourceSignature = signature;
  }

  /**
   * 销毁 BSM pass，并按需关闭大气/Aerial 侧的地面云影采样。
   * @param {{ disableShadow?: boolean }} [options]
   */
  _destroyBSMPasses(options: any = {}) {
    const disableShadow = options.disableShadow !== false;
    try { this._bsm.pass?.destroy(); } catch { /* ignore */ }
    try { this._bsm.resolve?.destroy(); } catch { /* ignore */ }
    this._bsm.pass = null;
    this._bsm.resolve = null;
    this._bsmSharedTexture = null;
    this._bsmShadowScale = 1.0;
    this._bsmBlitDone = false;
    this._bsmResourceSignature = null;
    if (disableShadow) {
      this.atmosphere?.setCloudShadow?.({ enabled: false });
      this.aerial?.setCloudShadow?.({ enabled: false });
      this._bsmShadowDisabled = true;
    }
  }

  /**
   * 返回 resolve pass 当前输出纹理（裸 WebGLTexture 句柄）。
   * V3.3.20：不再用作 u_shadowBuffer 返回值（自定义 bind 不被 Cesium 识别）。
   * 仅保留供 _syncBSM 内部 blit 读取 resolve 输出。
   */
  _bsmResolveGetTexture() {
    const r = this._bsm.resolve;
    const tex = r ? r._historyTex : (this._bsm.pass ? this._bsm.pass._colorTexture : null);
    return tex ? { _texture: tex } : null;
  }

  _taaGetHistoryTexture() {
    const gl = this.viewer.scene.context?._gl;
    if (!gl) return null;
    const tex = this._taa.current === 0 ? this._taa.texA : this._taa.texB;
    if (!tex) return null;
    return { _texture: tex, _textureTarget: gl.TEXTURE_2D, _target: gl.TEXTURE_2D };
  }

  // ── BSM blit to Cesium.Texture ─────────────────────────────────────────

  _blitBSM(sourceTex: any, targetCesiumTex: any, scale: any) {
    const gl = this.viewer.scene.context?._gl;
    if (!gl || !sourceTex?._texture || !targetCesiumTex?._texture) return;
    if (!this._bsm.blitFbo) {
      this._bsm.blitFbo = gl.createFramebuffer();
      this._bsm.blitProg = createGLProgram(gl,
        `#version 300 es\nin vec2 a_pos;\nout vec2 v_uv;\nvoid main(){v_uv=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0,1);}`,
        `#version 300 es\nprecision highp float;\nuniform sampler2D u_src;\nuniform float u_scale;\nin vec2 v_uv;\nout vec4 o;\nvoid main(){vec4 raw=texture(u_src,v_uv);\n  // 编码：rgba *= scale。HALF_FLOAT(scale=1)等价透传；RGBA8(scale=0.02)压到0..1，消费端 /scale 还原。\n  o=vec4(raw.rgb*u_scale, raw.a*u_scale);}`,
        "BSMBlit");
      this._bsm.blitLoc = {
        src: gl.getUniformLocation(this._bsm.blitProg, "u_src"),
        scale: gl.getUniformLocation(this._bsm.blitProg, "u_scale"),
        pos: gl.getAttribLocation(this._bsm.blitProg, "a_pos"),
      };
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      this._bsm.blitVbo = vbo;
    }
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING), prevVp = gl.getParameter(gl.VIEWPORT);
    const targetWidth = Number(targetCesiumTex.width ?? targetCesiumTex._width) || this._bsmBlitSize;
    const targetHeight = Number(targetCesiumTex.height ?? targetCesiumTex._height) || this._bsmBlitSize;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._bsm.blitFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetCesiumTex._texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo); gl.viewport(...prevVp); return; }
    gl.viewport(0, 0, targetWidth, targetHeight);
    // 清空整张目标 atlas，避免 512 BSM 写入 1024 共享纹理时旧像素残留。
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this._bsm.blitProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sourceTex._texture);
    if (this._bsm.blitLoc?.src) gl.uniform1i(this._bsm.blitLoc.src, 0);
    if (this._bsm.blitLoc?.scale) gl.uniform1f(this._bsm.blitLoc.scale, scale);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bsm.blitVbo);
    const aloc = this._bsm.blitLoc?.pos ?? gl.getAttribLocation(this._bsm.blitProg, "a_pos");
    if (aloc >= 0) { gl.enableVertexAttribArray(aloc); gl.vertexAttribPointer(aloc, 2, gl.FLOAT, false, 0, 0); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (aloc >= 0) gl.disableVertexAttribArray(aloc);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo); gl.viewport(prevVp[0], prevVp[1], prevVp[2], prevVp[3]);
  }

  // ── BSM sync to Atmosphere + Aerial ────────────────────────────────────

  _syncBSM() {
    if (!this.params.useShadowBuffer) {
      if (this._bsm.pass || this._bsm.resolve) {
        this._destroyBSMPasses({ disableShadow: true });
      } else if (!this._bsmShadowDisabled) {
        this.atmosphere?.setCloudShadow?.({ enabled: false });
        this.aerial?.setCloudShadow?.({ enabled: false });
        this._bsmShadowDisabled = true;
      }
      return;
    }
    this._ensureBSMPasses();
    const sp = this._bsm.pass;
    if (!sp) {
      if (!this._bsmShadowDisabled) {
        this.atmosphere?.setCloudShadow?.({ enabled: false });
        this.aerial?.setCloudShadow?.({ enabled: false });
        this._bsmShadowDisabled = true;
      }
      return;
    }
    const signature = this._getBSMResourceSignature();
    sp.updateInterval = signature.updateInterval;
    if (this._bsm.resolve) {
      this._bsm.resolve.updateInterval = signature.resolveEnabled ? signature.updateInterval : Number.MAX_SAFE_INTEGER;
      this._bsm.resolve.enabled = signature.resolveEnabled;
    }
    this._advanceOffsets();
    this._bsmShadowDisabled = false;
    // 复用 scratch 容器原地更新：CloudShadowPass.updateDynamicParams 内部 Object.assign 拷贝值，
    // BSM set4f 走原生 gl.uniform4fv 只接受数组/Float32Array，所以这里保持普通数组
    const dyn = this._scratch.bsmDynamicParams;
    const layers = this.params.layers;
    const layerVal = (i: any, key: any, fallback: any) => { const v = layers[i]?.[key]; return v !== undefined ? Number(v) : fallback; };
    for (let i = 0; i < 4; i++) {
      dyn.coverages[i] = layerVal(i, "coverage", 0.3);
      dyn.densityScales[i] = layerVal(i, "densityScale", 0);
      dyn.shapeAmounts[i] = layerVal(i, "shapeAmount", 0);
      dyn.shapeDetailAmounts[i] = layerVal(i, "shapeDetailAmount", 0);
      dyn.weatherExponents[i] = layerVal(i, "weatherExponent", 1);
      dyn.shapeAlteringBiases[i] = layerVal(i, "shapeAlteringBias", 0.35);
      dyn.coverageFilterWidths[i] = layerVal(i, "coverageFilterWidth", 0.6);
    }
    // V3.4.x：层高/间隙/密度剖面每帧装配（updateDynamicParams 值级检测，变更才触发 BSM 重绘）
    const iv = this._getIntervalHeights();
    const terrainOff = this._getTerrainOffset();
    for (let i = 0; i < 4; i++) {
      const alt = layerVal(i, "altitude", 0) + terrainOff;
      const hgt = layerVal(i, "height", 0);
      dyn.minLayerHeights[i] = alt;
      dyn.maxLayerHeights[i] = alt + hgt;
      const profile = layers[i]?.densityProfile;
      dyn.densityProfileLinear[i] = Number(profile?.linearTerm ?? 0.75);
      dyn.densityProfileConstant[i] = Number(profile?.constantTerm ?? 0.25);
      dyn.densityProfileExpTerms[i] = Number(profile?.expTerm ?? 0);
      dyn.densityProfileExponents[i] = Number(profile?.exponent ?? 0);
    }
    dyn.minIntervalHeights[0] = iv.min.x + terrainOff; dyn.minIntervalHeights[1] = iv.min.y + terrainOff; dyn.minIntervalHeights[2] = iv.min.z + terrainOff;
    dyn.maxIntervalHeights[0] = iv.max.x + terrainOff; dyn.maxIntervalHeights[1] = iv.max.y + terrainOff; dyn.maxIntervalHeights[2] = iv.max.z + terrainOff;
    dyn.localWeatherOffset[0] = this._weatherOffsetX || 0; dyn.localWeatherOffset[1] = this._weatherOffsetY || 0;
    dyn.shapeOffset[0] = this._shapeOffsetX || 0; dyn.shapeOffset[1] = this._shapeOffsetY || 0; dyn.shapeOffset[2] = this._shapeOffsetZ || 0;
    dyn.shapeDetailOffset[0] = this._shapeDetailOffsetX || 0; dyn.shapeDetailOffset[1] = this._shapeDetailOffsetY || 0; dyn.shapeDetailOffset[2] = this._shapeDetailOffsetZ || 0;
    dyn.bottomRadius = this.params.bottomRadius;
    dyn.shadowBottomHeight = this._getMinHeight();
    dyn.shadowTopHeight = this._getMaxHeight();
    // 每帧同步 shadow cascade far，限制到云层相关距离（避免 Cesium frustum.far~8e8 导致矩阵 NaN）
    dyn.shadowFar = Number(this.params.shadowFar) || Number(this.params.maxShadowLengthRayDistance) || 200000.0;
    dyn.maxShadowLengthRayDistance = Number(this.params.maxShadowLengthRayDistance) || 200000.0;
    dyn.shadowSplitLambda = Number(this.params.shadowSplitLambda) || 0.5;
    dyn.shadowFadeScale = Number(this.params.shadowFadeScale) || 1.0;
    dyn.scatteringCoefficient = Number(this.params.scatteringCoefficient) ?? 0.9;
    dyn.absorptionCoefficient = Number(this.params.absorptionCoefficient) ?? 1.0;
    // 演化活跃度同步：供 BSM 签名门控决定"无演化时不做周期刷新"
    dyn.windSpeed = Number(this.params.windSpeed) || 0;
    dyn.evolutionSpeed = Number(this.params.evolutionSpeed) || 0;
    dyn.clockElapsedSeconds = this._clockElapsedSeconds || 0;
    sp.updateDynamicParams(dyn);
    // V3.4.7：显式驱动 BSM 渲染（autoRender:false），保证与后续 resolve/blit/setCloudShadow
    // 严格同帧同序；内部仍按 updateInterval + 运动检测节流。
    sp.render();
    const passUpdated = sp.wasUpdatedThisFrame?.() === true;
    let resolveRan = false;
    if (this._bsm.resolve) {
      const passMotion = sp.getLastMotion?.() || 0.0;
      this._bsm.resolve.setInputTextures(sp.getTexture(), sp.getDepthVelocityTexture());
      this._bsm.resolve.setFrameState?.({
        // V3.4.12：锚定修复后重投影可信，reset 仅保留给大幅不连续（0.005→0.05）；
        // 垂直移动的中低速运动交给 resolve 的 velocity 重投影 + 受限 alpha 平滑。
        forceReset: passUpdated && passMotion > 0.05,
        motion: passMotion,
      });
      if (passUpdated) {
        // Resolve 必须在 CloudShadowPass 当帧写完 color/depthVelocity 后立即执行；
        // 不再依赖 ShadowResolvePass 自己的 preRender listener，避免 history 与 atlas 配对错帧。
        this._bsm.resolve.render(true);
        resolveRan = true;
      }
    }

    let tex = this._bsm.resolve ? this._bsmResolveGetTexture() : null;
    if (!tex) tex = sp.getTexture();
    if (!tex) { this.atmosphere?.setCloudShadow?.({ enabled: false }); this.aerial?.setCloudShadow?.({ enabled: false }); return; }

    const provider = this.atmosphere?.getAtmosphereForClouds?.();
    const targetTex = provider?.getCloudShadowTargetTexture?.();
    const clamp01 = provider?.getCloudShadowClamp01?.() ?? true;
    const scaleToPass = clamp01 ? 200.0 : 1.0;
    let textureToPass = tex;

    if (targetTex && tex._texture) {
      // 性能：blit 门控——仅 BSM/resolve 本帧有新内容时才 clear+blit 1024² 共享纹理；
      // 跳过帧消费端继续采样上一次 blit 结果（内容未变）。
      if (passUpdated || resolveRan || !this._bsmBlitDone) {
        this._blitBSM(tex, targetTex, scaleToPass);
        this._bsmBlitDone = true;
      }
      textureToPass = targetTex;
    }
    // V3.3.20：blit 写入的共享 Cesium.Texture 同时供主云 stage 的 u_shadowBuffer 采样，
    // 避免返回自定义 bind() 对象（见 _buildCloudUniforms.u_shadowBuffer）。
    this._bsmSharedTexture = targetTex || null;
    this._bsmShadowScale = targetTex ? scaleToPass : 1.0;

    const intervals = sp.getShadowIntervals();
    const mats = sp.getShadowMatrices();
    const tile = sp.getTileSize?.() || Math.floor(SHADOW_MAP_SIZE / 2);
    // BSM 地面采样位置必须与相机海拔解耦：之前按 camH 动态增加几何误差修正，
    // 会在镜头升降时连续把采样点拉向 bottom 球面，导致地面云影 UV 帧间滑动/抖动。
    // 如需远距地形修正，应使用显式、稳定的参数，而不是每帧相机高度驱动。
    const geoAmt = 0.0;
    // setCloudShadow 对 intervals/matrices 存引用（见 AtmospherePostProcess/AerialPerspectiveEffect），
    // 因此复用同一 opts 与数组、原地更新内容是安全的，避免每帧 new Cartesian2/Matrix4
    const s = this._scratch;
    for (let i = 0; i < 4; i++) {
      s.bsmShadowIntervals[i].x = intervals[i][0]; s.bsmShadowIntervals[i].y = intervals[i][1];
      Cesium.Matrix4.fromArray(mats[i], 0, s.bsmShadowMatrices[i]);
    }
    if (!s.bsmShadowOpts) {
      s.bsmShadowOpts = {
        enabled: true, texture: null, scale: 1,
        decode: { x: 1, y: 1, z: 1, w: 1 },
        near: 0.1, far: 200000, topHeight: 5000, bottomRadius: 6371000,
        altitudeFadeStart: 5000, altitudeFadeEnd: 13000,
        intervals: s.bsmShadowIntervals, matrices: s.bsmShadowMatrices,
        texelSize: { x: 1 / 512, y: 1 / 512 },
        geometricErrorCorrectionAmount: 0,
        pcfTaps: 16,
      };
    }
    const opts = s.bsmShadowOpts;
    opts.enabled = true; opts.texture = textureToPass; opts.scale = scaleToPass;
    // 性能：地面 PCF tap 数接入预设（smooth 1 / balanced 4 / ultra 8），不再硬编码 16
    opts.pcfTaps = Math.min(16, Math.max(1, Number(this.params.shadowPcfTaps) || 16));
    opts.near = sp.getShadowNear?.() ?? (Number(this.viewer.camera.frustum?.near) || 0.1);
    opts.far = sp.getShadowFar();
    opts.topHeight = this._getMaxHeight();
    opts.altitudeFadeStart = this._getMaxHeight();
    opts.altitudeFadeEnd = this._getMaxHeight() + (Number(this.params.altitudeFadeRange) || 8000.0);
    opts.bottomRadius = Number(this.params.bottomRadius) || 6371000;
    opts.texelSize.x = 1 / tile; opts.texelSize.y = 1 / tile;
    opts.geometricErrorCorrectionAmount = geoAmt;
    this.atmosphere?.setCloudShadow?.(opts);
    this.aerial?.setCloudShadow?.(opts);
  }

  // ── TAA (inline CloudsResolvePass) ─────────────────────────────────────

  _taaCapture() {
    const gl = this.viewer.scene.context?._gl;
    if (!gl) return;
    const canvas = this.viewer.scene.canvas;
    const w = canvas.width, h = canvas.height;
    if (w !== this._taa.w || h !== this._taa.h) {
      if (this._taa.texA) gl.deleteTexture(this._taa.texA);
      if (this._taa.texB) gl.deleteTexture(this._taa.texB);
      if (this._taa.pbo) gl.deleteBuffer(this._taa.pbo);
      const mkTex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.bindTexture(gl.TEXTURE_2D, null); return t; };
      this._taa.texA = mkTex(); this._taa.texB = mkTex();
      this._taa.pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._taa.pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this._taa.w = w; this._taa.h = h; this._taa.frameCount = 0; this._taa.pboReady = false;
    }
    const writeTex = this._taa.current === 0 ? this._taa.texB : this._taa.texA;
    if (this._taa.pboReady) {
      const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const flipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
      if (flipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (premul) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, this._taa.pbo);
      gl.bindTexture(gl.TEXTURE_2D, writeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindTexture(gl.TEXTURE_2D, prevTex);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      if (flipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      if (premul) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      this._taa.current = 1 - this._taa.current;
      this._taa.frameCount++;
    }
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._taa.pbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    if (prevFbo) gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    this._taa.pboReady = true;
  }

  _taaUpdateVP() {
    this._taa.prevVP = this._taa.curVP;
    const cam = this.viewer.camera;
    this._taa.curVP = Cesium.Matrix4.multiply(cam.frustum.projectionMatrix, cam.viewMatrix, new Cesium.Matrix4());
  }

  // ── GUI ────────────────────────────────────────────────────────────────

  _setupGUI() {
    if (this._gui || !this.enableGui) return;
    // 动态 import，避免未安装 dat.gui 时打包失败
    // 同步路径：仅在 enableGui=true 且宿主已全局提供 dat 时使用
    const dat = typeof window !== "undefined" && (window as any).dat ? (window as any).dat : null;
    if (!dat?.GUI) {
      console.warn("[Pipeline] enableGui=true 但未找到 dat.GUI，跳过调试面板");
      return;
    }
    this._gui = new dat.GUI({ name: "体积云管线" });
    const p = this.params, ls = p.layers;
    const f = this._gui.addFolder("云层");
    f.add(ls[0], "altitude", 0, 20000, 50).name("层0底高(m)");
    f.add(ls[0], "height", 0, 10000, 50).name("层0厚度(m)");
    f.add(ls[0], "coverage", 0, 1, 0.01).name("层0覆盖度");
    f.add(ls[1], "altitude", 0, 20000, 50).name("层1底高(m)");
    f.add(ls[1], "height", 0, 10000, 50).name("层1厚度(m)");
    f.add(ls[1], "coverage", 0, 1, 0.01).name("层1覆盖度");
    f.add(ls[2], "altitude", 0, 20000, 50).name("层2底高(m)");
    f.add(ls[2], "height", 0, 10000, 50).name("层2厚度(m)");
    f.add(ls[2], "coverage", 0, 1, 0.01).name("层2覆盖度");
    // 降高频相关参数（用于抑制边缘噪点/闪烁）
    f.add(p, "shapeRepeat", 1.0, 8.0, 0.1).name("主体噪声频率");
    f.add(p, "shapeDetailRepeat", 0.0005, 0.02, 0.0001).name("细节噪声频率");
    f.add(ls[0], "shapeDetailAmount", 0.0, 1.5, 0.01).name("层0细节权重");
    f.add(ls[1], "shapeDetailAmount", 0.0, 1.5, 0.01).name("层1细节权重");
    f.add(ls[2], "shapeDetailAmount", 0.0, 1.5, 0.01).name("层2细节权重");
    f.add(ls[0], "weatherExponent", 0.2, 2.0, 0.01).name("层0天气指数");
    f.add(ls[1], "weatherExponent", 0.2, 2.0, 0.01).name("层1天气指数");
    f.add(ls[2], "weatherExponent", 0.2, 2.0, 0.01).name("层2天气指数");
    f.add(ls[0], "coverageFilterWidth", 0.1, 1.0, 0.01).name("层0覆盖过滤宽度");
    f.add(ls[1], "coverageFilterWidth", 0.1, 1.0, 0.01).name("层1覆盖过滤宽度");
    f.add(ls[2], "coverageFilterWidth", 0.1, 1.0, 0.01).name("层2覆盖过滤宽度");
    f.open();
    const l = this._gui.addFolder("光照");
    l.add(p, "sunIntensity", 0, 150, 5).name("太阳强度");
    l.add(p, "skyToSunRatio", 0.05, 0.6, 0.01).name("天空/太阳比");
    l.add(p, "cloudExposure", 0.1, 5.0, 0.1).name("云曝光");
    l.add(p, "magentaFixStrength", 0.0, 2.0, 0.05).name("落日去品红强度");
    l.add(p, "edgeAlphaCutoff", 0.0, 0.2, 0.005).name("边缘Alpha裁剪");
    l.add(p, "aerialPerspectiveScale", 0, 3, 0.1).name("大气透视");
    const s = this._gui.addFolder("散射");
    s.add(p, "scatterG1", 0, 0.99, 0.01).name("前向散射G");
    s.add(p, "scatterG2", -0.99, 0, 0.01).name("后向散射G");
    s.add(p, "multiScatteringOctaves", 1, 12, 1).name("多散射阶数");
    const a = this._gui.addFolder("动画");
    a.add(p, "windSpeed", 0, 1, 0.0001).name("风速");
    a.add(p, "evolutionSpeed", 0, 0.0001, 0.000001).name("演化速度");
    // 远处云距离衰减：调小 distFadeStart 让衰减更早开始（远处更疏），调大 distFadeEnd 让衰减更平缓
    a.add(p, "distFadeStart", 5000, 100000, 1000).name("远处衰减起点(m)");
    a.add(p, "distFadeEnd", 20000, 200000, 1000).name("远处衰减终点(m)");
    const o = this._gui.addFolder("开关");
    o.add(p, "cloudsVisible").name("显示云").onChange((v: any) => {
      if (this.cloudStage) this.cloudStage.enabled = v;
    });
    o.add(p, "useShadowBuffer").name("BSM(云阴影)");
    o.add(p, "shadowLengthEnabled").name("阴影长度(丁达尔)");
    o.add(p, "hazeEnabled").name("雾效(HAZE)");
    o.add(p, "temporalEnabled").name("TAA");
    o.add(p, "maxSteps", 64, 1200, 1).name("主采样步数");
    o.add(p, "minStepSize", 5.0, 200.0, 1.0).name("最小步长");
    o.add(p, "blueNoiseScale", 0.25, 4.0, 0.05).name("噪声采样缩放");
    o.add(p, "jitterStrength", 0.0, 1.0, 0.01).name("抖动强度");

    // BSM OD 缩放联动：地面阴影实际在 AerialPerspectiveEffect stage 渲染，
    // 但原 GUI 只绑了 AtmospherePostProcess 实例，调不动。这里统一驱动两侧。
    const bsm = this._gui.addFolder("BSM 缩放");
    const syncBsmScale = (key: any, val: any) => {
      if (this.atmosphere) this.atmosphere[`_${key}`] = val;
      if (this.aerial) this.aerial[`_${key}`] = val;
    };
    // 用 params 上的占位属性承载 GUI 值，初始与两侧默认(1.0)对齐
    p._bsmGroundScale = 0.3; p._bsmTyndallScale = 1.0;
    bsm.add(p, "_bsmGroundScale", 0.1, 20.0, 0.1).name("OD缩放(地面)").onChange((v: any) => syncBsmScale("bsmGroundOpticalDepthScale", v));
    bsm.add(p, "_bsmTyndallScale", 0.1, 20.0, 0.1).name("OD缩放(光柱)").onChange((v: any) => syncBsmScale("bsmTyndallOpticalDepthScale", v));
    // cascade 几何：调这三个解决"近处阴影被切割"。shadowFar=覆盖最远距离，splitLambda=近处分配(越大近处越多)，fadeScale=ortho扩展
    bsm.add(p, "shadowFar", 20000, 500000, 5000).name("阴影覆盖距离");
    bsm.add(p, "shadowSplitLambda", 0.0, 1.0, 0.05).name("近处分配");
    bsm.add(p, "shadowFadeScale", 0.0, 5.0, 0.1).name("边缘扩展");
    // 关键：占位初始值不会自动触发 onChange，这里手动同步一次，否则启动时两侧 scale 仍是构造默认(1.0)
    syncBsmScale("bsmGroundOpticalDepthScale", p._bsmGroundScale);
    syncBsmScale("bsmTyndallOpticalDepthScale", p._bsmTyndallScale);
  }

  // ── BSM ShadowPass params (for CloudShadowPass) ────────────────────────

  _getShadowPassParams(): Record<string, any> {
    const ls = this.params.layers;
    const off = this._getTerrainOffset();
    const minLayerHeights = [], maxLayerHeights = [], densityProfileLinear = [], densityProfileConstant = [];
    const densityScales = [], shapeAmounts = [], shapeDetailAmounts = [], weatherExponents = [];
    const shapeAlteringBiases = [], coverageFilterWidths = [], coverages = [];
    let minAlt = 1e9, maxAltH = 0;
    for (let i = 0; i < 4; i++) {
      const a = (Number(ls[i]?.altitude) || 0) + off, h = Number(ls[i]?.height) || 0;
      if (a + h > 0) { minAlt = Math.min(minAlt, a); maxAltH = Math.max(maxAltH, a + h); }
      minLayerHeights[i] = a; maxLayerHeights[i] = a + h;
      densityProfileLinear[i] = Number(ls[i]?.densityProfile?.linearTerm) ?? 0.75;
      densityProfileConstant[i] = Number(ls[i]?.densityProfile?.constantTerm) ?? 0.25;
      densityScales[i] = Number(ls[i]?.densityScale) || 0;
      shapeAmounts[i] = Number(ls[i]?.shapeAmount) ?? 1;
      shapeDetailAmounts[i] = Number(ls[i]?.shapeDetailAmount) ?? 1;
      weatherExponents[i] = Number(ls[i]?.weatherExponent) ?? 1;
      shapeAlteringBiases[i] = Number(ls[i]?.shapeAlteringBias) ?? 0.35;
      coverageFilterWidths[i] = Number(ls[i]?.coverageFilterWidth) ?? 0.6;
      coverages[i] = Number(ls[i]?.coverage) ?? 0.3;
    }
    const iv = this._getIntervalHeights();
    const cBottom = Number.isFinite(minAlt) ? minAlt : 750;
    return {
      bottomRadius: Number(this.params.bottomRadius) || 6378137,
      cloudBottomHeight: cBottom, cloudTopHeight: Math.max(0, maxAltH - cBottom) || 1500,
      shadowBottomHeight: cBottom, shadowTopHeight: maxAltH || (cBottom + 1500),
      // shadow cascade far 必须限制到云层相关距离，否则会取 Cesium 相机 frustum.far（~8e8），
      // 导致 ortho proj radius 爆炸、数值精度崩坏产生 NaN、矩阵不可逆、BSM 全失效。
      shadowFar: Number(this.params.shadowFar) || Number(this.params.maxShadowLengthRayDistance) || 200000.0,
      maxShadowLengthRayDistance: Number(this.params.maxShadowLengthRayDistance) || 200000.0,
      shadowSplitLambda: Number(this.params.shadowSplitLambda) || 0.5,
      shadowFadeScale: Number(this.params.shadowFadeScale) || 1.0,
      weatherRepeat: Number(this.params.weatherRepeat) || 100, windSpeed: Number(this.params.windSpeed) || 0,
      shapeRepeat: (Number(this.params.shapeRepeat) || 3) / 1e4,
      shapeDetailRepeat: Number(this.params.shapeDetailRepeat) || 0.006,
      turbulenceRepeat: Number(this.params.turbulenceRepeat) || 2,
      turbulenceDisplacement: Number(this.params.turbulenceDisplacement) || 400,
      coverage: Math.max(...coverages), densityScale: Math.max(...densityScales),
      scatteringCoefficient: Number(this.params.scatteringCoefficient) ?? 0.9,
      absorptionCoefficient: Number(this.params.absorptionCoefficient) ?? 1.0,
      startTime: 0, evolutionSpeed: Number(this.params.evolutionSpeed) || 0.005,
      maxSteps: this.params.maxSteps, minStepSize: this.params.minStepSize,
      minDensity: this.params.minDensity ?? 1e-5, minExtinction: this.params.minExtinction ?? 1e-5,
      minTransmittance: this.params.minTransmittance ?? 0.01, opticalDepthTailScale: 1.0,
      minLayerHeights, maxLayerHeights, densityProfileLinear, densityProfileConstant,
      densityProfileExpTerms: [0,0,0,0], densityProfileExponents: [0,0,0,0],
      densityScales, shapeAmounts, shapeDetailAmounts, weatherExponents,
      shapeAlteringBiases, coverageFilterWidths, coverages,
      minIntervalHeights: [iv.min.x + off, iv.min.y + off, iv.min.z + off],
      maxIntervalHeights: [iv.max.x + off, iv.max.y + off, iv.max.z + off],
      localWeatherOffset: [0, 0], shapeOffset: [0, 0, 0], shapeDetailOffset: [0, 0, 0],
    };
  }

  // ── Cloud stage factory ────────────────────────────────────────────────

  /**
   * 创建云 stage。
   * - 全分辨率（scale≈1）：单一 PostProcessStage（原路径，零回归）。
   * - 拆分模式（scale<1）：Composite[低分辨率 raymarch(textureScale) → 全分辨率合成]，
   *   inputPreviousStageTexture:false 使两个子 stage 的 colorTexture 均为场景输入，
   *   合成 stage 通过 stage 名引用 raymarch 输出，scene*(1-a)+cloud 混合。
   * @param {string} fragmentShader - 云 raymarch 片元（拆分模式含 SPLIT_CLOUD_OUTPUT）
   * @param {Record<string, unknown>} uniforms - 云 raymarch uniforms
   * @returns {object} PostProcessStage 或 PostProcessStageComposite（都带 enabled/name）
   */
  _createCloudStage(fragmentShader: string, uniforms: any) {
    if (!this._cloudSplitMode) {
      return new Cesium.PostProcessStage({
        name: "GeospatialVolumetricClouds", fragmentShader, uniforms,
      });
    }
    const rayStage = new Cesium.PostProcessStage({
      name: "GeospatialVolumetricCloudsRay",
      fragmentShader,
      uniforms,
      textureScale: this._cloudResolutionScale,
    });
    const composeFragment = `
uniform sampler2D colorTexture;
uniform sampler2D u_cloudTexture;
in vec2 v_textureCoordinates;
void main() {
  vec4 scene = texture(colorTexture, v_textureCoordinates);
  vec4 cloud = texture(u_cloudTexture, v_textureCoordinates);
  out_FragColor = vec4(scene.rgb * (1.0 - cloud.a) + cloud.rgb, scene.a);
}`;
    const composeStage = new Cesium.PostProcessStage({
      name: "GeospatialVolumetricCloudsCompose",
      fragmentShader: composeFragment,
      uniforms: { u_cloudTexture: rayStage.name },
    });
    return new Cesium.PostProcessStageComposite({
      name: "GeospatialVolumetricClouds",
      stages: [rayStage, composeStage],
      inputPreviousStageTexture: false,
    });
  }

  /**
   * 运行时切换云主 raymarch 分辨率（切质量预设免重开体积云）。
   * 依赖 init 缓存的双 shader 变体与 uniforms（同步重建，无异步竞态）。
   * 重建后 cloudStage 会排到后处理链尾；若链上存在 lensFlare 等后续 stage，
   * 由集成层消费 consumeCloudStageRebuilt() 后协作重建以恢复顺序。
   * @param {number} scale - 目标分辨率缩放（0.25~1，≥0.999 走全分辨率单 stage 路径）
   * @returns {boolean} 是否发生了重建
   */
  setCloudResolutionScale(scale: number) {
    const next = Math.min(1, Math.max(0.25, Number(scale) || 1));
    this.params.cloudResolutionScale = next;
    // init 未完成（shader 缓存不存在）：仅记录 params，init 会按此值构建
    if (!this._cloudShaderSplit || !this._cloudShaderLegacy || !this.cloudStage) return false;
    if (Math.abs(next - (this._cloudResolutionScale ?? 1)) < 1e-3) return false;

    const stages = this.viewer?.scene?.postProcessStages;
    if (!stages) return false;

    const wasEnabled = this.cloudStage.enabled;
    try { stages.remove(this.cloudStage); } catch { /* ignore */ }

    this._cloudResolutionScale = next;
    this._cloudSplitMode = next < 0.999;
    this.cloudStage = this._createCloudStage(
      this._cloudSplitMode ? this._cloudShaderSplit : this._cloudShaderLegacy,
      this._cloudUniforms,
    );
    this.cloudStage.enabled = wasEnabled;
    // Keep the long-lived Aerial stage in place and append only the rebuilt Cloud stage.
    // PostProcessStageCollection.remove() destroys the removed stage; using it for reordering
    // permanently kills the Aerial ground-shadow consumer on the first resolution/preset switch.
    stages.add(this.cloudStage);
    this._cloudStageRebuiltFlag = true;
    this.viewer.scene.requestRender?.();
    return true;
  }

  /**
   * 一次性消费"云 stage 已重建"标志（供集成层决定是否重建 lensFlare 以恢复链序）。
   * @returns {boolean}
   */
  consumeCloudStageRebuilt() {
    const flag = this._cloudStageRebuiltFlag === true;
    this._cloudStageRebuiltFlag = false;
    return flag;
  }

  // ── Init ───────────────────────────────────────────────────────────────

  async init() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      const viewer = this.viewer;
      viewer.scene.globe.depthTestAgainstTerrain = true;

      // 1. Atmosphere
      this.atmosphere = new AtmospherePostProcess(viewer, {
        atmosphereParams: this.atmosphereParams, renderSky: true,
        applyGroundAtmosphere: false, autoAddStage: false,
        enableGui: false,
        assetsBaseUrl: this.atmosphereAssetsBase, shaderBaseUrl: this.atmosphereShaderBase,
      });
      await this.atmosphere.init();

      // 2. Aerial
      this.aerial = new AerialPerspectiveEffect(viewer, {
        atmosphereParams: this.atmosphereParams, autoAddStage: false,
        assetsBaseUrl: this.atmosphereAssetsBase, shaderBaseUrl: this.atmosphereShaderBase,
      });

      // 3. Load cloud textures + build shaders
      await this._loadTextures();
      // 性能：cloudResolutionScale<1 时启用拆分模式（低分辨率 raymarch + 全分辨率合成）。
      // V3.4.x：两个 shader 变体在 init 一次性预构建并缓存，
      // 使 setCloudResolutionScale 可同步重建 stage（切档免重开体积云）。
      const resolutionScale = Math.min(1, Math.max(0.25, Number(this.params.cloudResolutionScale) || 1));
      this._cloudResolutionScale = resolutionScale;
      this._cloudSplitMode = resolutionScale < 0.999;
      const [shaderSplit, shaderLegacy] = await Promise.all([
        this._buildCloudFragmentShader(true),
        this._buildCloudFragmentShader(false),
      ]);
      this._cloudShaderSplit = shaderSplit;
      this._cloudShaderLegacy = shaderLegacy;

      // 4. BSM passes：运行时也会通过 _syncBSM/_ensureBSMPasses 按开关动态创建或重建。
      this._ensureBSMPasses();

      // 5. Cloud PostProcessStage（拆分模式为 PostProcessStageComposite，外部接口不变）
      this._cloudUniforms = this._buildCloudUniforms();
      this.cloudStage = this._createCloudStage(
        this._cloudSplitMode ? this._cloudShaderSplit : this._cloudShaderLegacy,
        this._cloudUniforms,
      );
      this.cloudStage.enabled = this.params.cloudsVisible;

      // 6. Aerial init
      await this.aerial.init();

      // 7. Register stages in stable order: Atmosphere -> Aerial -> Cloud.
      const stages = viewer.scene.postProcessStages;
      if (this.atmosphere.stage) stages.add(this.atmosphere.stage);
      // Aerial owns the ground BSM shadow and must remain a long-lived stage.
      if (this.aerial.stage) stages.add(this.aerial.stage);
      // In split mode the composite receives the outer previous texture (the Aerial output)
      // as its scene input, so the final cloud composition preserves the ground shadow.
      stages.add(this.cloudStage);

      // 8. preRender: BSM sync
      this._listeners.push(viewer.scene.preRender.addEventListener(() => {
        const elapsed = this._getClockElapsedSeconds();
        if (this._lastClockElapsedSeconds !== undefined && Math.abs(elapsed - this._lastClockElapsedSeconds) > 1e-6) {
          viewer.scene.requestRender?.();
        }
        this._syncBSM();
      }));

      // 9. postRender: TAA capture + frame count
      this._listeners.push(viewer.scene.postRender.addEventListener(() => {
        this._taaUpdateVP();
        // 拆分模式下 in-shader TAA 关闭，跳过整屏 readPixels 回读，避免无谓带宽
        if (this.params.temporalEnabled && !this._cloudSplitMode) this._taaCapture();
        this._frameCount++;
      }));
      this._listeners.push(viewer.camera.changed.addEventListener(() => {
        Cesium.Cartographic.fromCartesian(
          viewer.camera.positionWC,
          viewer.scene.globe.ellipsoid
        );
        const atmBottomRadius = Number(
          this.atmosphere?.getAtmosphereForClouds?.()?.getUniforms?.()?.bottomRadius?.() ?? NaN
        );
        const usedBottomRadius = Number.isFinite(atmBottomRadius)
          ? atmBottomRadius
          : (Number(this.params.bottomRadius) || 0);
        const corr = this._getAltitudeCorrectionOffset(usedBottomRadius);
        Cesium.Cartesian3.add(
          viewer.camera.positionWC,
          corr,
          new Cesium.Cartesian3()
        );
      }));

      if (this.enableGui) this._setupGUI();
      console.warn("[Pipeline] ready: Atmosphere -> Aerial -> Cloud");
    })();
    return this._ready;
  }

  // ── Destroy ────────────────────────────────────────────────────────────

  destroy() {
    for (const remove of this._listeners) if (typeof remove === "function") remove();
    this._listeners = [];
    const stages = this.viewer?.scene?.postProcessStages;
    if (stages && this.cloudStage) { try { stages.remove(this.cloudStage); } catch { /* ignore */ } }
    this.cloudStage = null;
    try { this.aerial?.destroy(); } catch { /* ignore */ } this.aerial = null;
    try { this.atmosphere?.destroy(); } catch { /* ignore */ } this.atmosphere = null;
    try { this._destroyBSMPasses({ disableShadow: false }); } catch { /* ignore */ }
    const gl = this.viewer?.scene?.context?._gl;
    if (gl) {
      if (this._bsm.blitFbo) gl.deleteFramebuffer(this._bsm.blitFbo);
      if (this._bsm.blitProg) gl.deleteProgram(this._bsm.blitProg);
      if (this._bsm.blitVbo) gl.deleteBuffer(this._bsm.blitVbo);
      if (this._taa.texA) gl.deleteTexture(this._taa.texA);
      if (this._taa.texB) gl.deleteTexture(this._taa.texB);
      if (this._taa.pbo) gl.deleteBuffer(this._taa.pbo);
    }
    this._bsm = { pass: null, resolve: null, blitFbo: null, blitProg: null, blitVbo: null, blitLoc: null };
    this._bsmResourceSignature = null;
    this._bsmSharedTexture = null;
    this._taa = { texA: null, texB: null, current: 0, pbo: null, pboReady: false, w: 0, h: 0, frameCount: 0, prevVP: null, curVP: null };
    if (this.textures) { for (const k in this.textures) { try { this.textures[k]?.destroy?.(); } catch { /* ignore */ } } this.textures = null; }
    if (this._gui) { this._gui.destroy(); this._gui = null; }
    this._ready = null;
  }
}