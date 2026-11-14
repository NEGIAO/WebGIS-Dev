/**
 * 在 Cesium 中复刻 three-geospatial 大气渲染：从静态 LUT（.bin）加载 + 运行时天空着色。
 * 使用 PostProcessStage 展示 Bruneton 预计算大气（天空 + 太阳圆盘 + 与场景合成）。
 */

import { AtmosphereParameters,PRECOMPUTE_CONSTANTS,getPrecomputeDefines } from './AtmosphereParameters';
import { loadPrecomputedTextures } from './PrecomputedTexturesLoader';
import { loadShaderSource } from '../shaderLoader';
import { getCesium } from "../getCesium";
import { buildSkyFragmentSource, flattenAtmosphereUniform } from "./atmosphereShaders";
/* eslint-disable @typescript-eslint/no-this-alias */
const Cesium = getCesium();
// dat.gui 为可选依赖：WebGIS 默认关闭（enableGui=false），由工具面板调参
/** 本地 .bin 资源目录默认值（相对宿主页面 base）；可通过构造 options.assetsBaseUrl 覆盖 */
const LOCAL_ASSETS_BASE = './src/AtmosphereFromThreeGeospatial/assets/';

/** 将 ATMOSPHERE 嵌套 uniform 展平为 Cesium 可用的键名（如 ATMOSPHERE.solar_irradiance, ATMOSPHERE.rayleigh_density.layers[0].width） */


/**
 * AtmospherePostProcess：从静态 LUT 加载并添加后处理阶段。
 * @param {Cesium.Viewer} viewer
 * @param {object} options
 * @param {string} [options.assetsBaseUrl] - .bin 所在目录，默认使用本地 assets/
 * @param {string} [options.shaderBaseUrl] - bruneton/*.glsl 所在目录，默认本地
 * @param {AtmosphereParameters} [options.atmosphereParams]
 * @param {boolean} [options.applyGroundAtmosphere=true] - 为 false 时本 pass 只对天空像素做 Bruneton；几何像素原样输出，供 AerialPerspectiveEffect 单独做空中透视，避免双重叠加。
 * @param {boolean} [options.exposureFollowTimeline=true] - 为 true 时曝光随当前仿真时间与太阳高度在 exposureDay / exposureNight 之间线性插值（见 _getEffectiveAtmosphereExposure）。
 * @param {number} [options.exposureDay=1.5] - 太阳高度角高于晨昏带时的曝光。
 * @param {number} [options.exposureNight=0.1] - 太阳高度角低于晨昏带时的曝光。
 * @param {number} [options.exposureTwilightAngleDegrees=6] - 晨昏过渡「半角」(度)：从地平下 -angle 到地平上 +angle 之间均匀插值。
 */
export class AtmospherePostProcess {
  // ==================== 状态字段（原 JS 动态字段收拢声明，一律 any 保持行为） ====================
  _applyGroundAtmosphere: any;
  _atmosphereExposure: any;
  _autoAddStage: any;
  _bsmGroundOpticalDepthScale: any;
  _bsmTyndallOpticalDepthScale: any;
  _cloudShadowAltitudeFadeEnd: any;
  _cloudShadowAltitudeFadeStart: any;
  _cloudShadowBottomRadius: any;
  _cloudShadowBuffer: any;
  _cloudShadowCesiumTexture: any;
  _cloudShadowDecode: any;
  _cloudShadowDummyArray: any;
  _cloudShadowEnabled: any;
  _cloudShadowFar: any;
  _cloudShadowIntervals: any;
  _cloudShadowMatrices: any;
  _cloudShadowNear: any;
  _cloudShadowPcfTaps: any;
  _cloudShadowTexClamp01: any;
  _cloudShadowTexScale: any;
  _cloudShadowTexelSize: any;
  _cloudShadowTopHeight: any;
  _debugTyndallMode: any;
  _exposureDay: any;
  _exposureFollowTimeline: any;
  _exposureNight: any;
  _exposureTwilightAngleDegrees: any;
  _geometricErrorCorrectionAmount: any;
  _gui: any;
  _ready: any;
  _renderSky: any;
  _shadowLengthEnabled: any;
  _shadowLengthScale: any;
  _shadowLengthTexture: any;
  _tyndallScale: any;
  assetsBaseUrl: any;
  atmosphereParams: any;
  enableGui: any;
  shaderBaseUrl: any;
  stage: any;
  textures: any;
  viewer: any;

  constructor(viewer: any, options: any = {}) {
    this.viewer = viewer;
    this.assetsBaseUrl = options.assetsBaseUrl ?? LOCAL_ASSETS_BASE;
    // 默认指向库内 Shaders/（相对宿主页面 base），避免 404 被 SPA fallback 成 index.html 导致 shader 出现 '<' 编译错误
    this.shaderBaseUrl = options.shaderBaseUrl ?? './src/AtmosphereFromThreeGeospatial/Shaders/';
    this.atmosphereParams = options.atmosphereParams ?? new AtmosphereParameters();
    this.stage = null;
    this.textures = null;
    this._ready = null;
    /** 手动曝光；仅在 exposureFollowTimeline===false 时作为 u_atmosphereExposure */
    // 默认 1.0：不对几何/底图像素额外抬亮（库原默认 1.5 会让底图偏白）
    this._atmosphereExposure = options.atmosphereExposure ?? 1.0;
    /** 为 true 时曝光随 viewer.clock 对应的太阳位置（相机处太阳高度角）在白天/夜晚值之间线性变化 */
    this._exposureFollowTimeline = options.exposureFollowTimeline ?? true;
    this._exposureDay = options.exposureDay ?? 1.0;
    this._exposureNight = options.exposureNight ?? 0.1;
    /** 太阳高度从 -exposureTwilightAngleDegrees° 到 +exposureTwilightAngleDegrees° 之间从 night 线性过渡到 day */
    this._exposureTwilightAngleDegrees = options.exposureTwilightAngleDegrees ?? 6;
    this._debugTyndallMode = 0;
    this._tyndallScale = 2.5;
    this._bsmTyndallOpticalDepthScale = 1.0;
    this._bsmGroundOpticalDepthScale = 1.0;
    this._shadowLengthEnabled = true;
    this._shadowLengthTexture = null;
    this._shadowLengthScale = 1.0;
    this._cloudShadowEnabled = false;
    this._cloudShadowBuffer = null;
    this._cloudShadowDecode = null;
    this._cloudShadowNear = 0.1;
    this._cloudShadowFar = 200000.0;
    this._cloudShadowTopHeight = 5000.0;
    this._cloudShadowAltitudeFadeStart = 5000.0;
    this._cloudShadowAltitudeFadeEnd = 13000.0;
    this._cloudShadowBottomRadius = this.atmosphereParams.bottomRadius;
    this._cloudShadowIntervals = null;
    this._cloudShadowMatrices = null;
    this._cloudShadowTexScale = 1.0;
    this._cloudShadowTexelSize = null;
    this._geometricErrorCorrectionAmount = 0.0;
    /** 地面云影 PCF tap 数（1~16），由管线按质量预设注入 */
    this._cloudShadowPcfTaps = 16;
    this._gui = null;
    /** @type {boolean} 是否创建 dat.gui（WebGIS 默认 false） */
    this.enableGui = options.enableGui === true;
    // 当天空由 DrawCommand 版本的 SkyMaterial 绘制时，这里应关闭天空分支，只处理几何空中透视
    this._renderSky = options.renderSky ?? false;
    /** 是否与 AerialPerspectiveEffect 串联：为 false 时不在本 pass 对几何做 GetSkyRadianceToPoint，避免两次大气 */
    this._applyGroundAtmosphere = options.applyGroundAtmosphere ?? true;
    this._autoAddStage = options.autoAddStage ?? true;
  }

  _getAltitudeCorrectionOffsetKm(bottomRadiusMeters: any) {
    const Cesium = window.Cesium;
    if (!Cesium) return { x: 0, y: 0, z: 0 };
    const ellipsoid = this.viewer?.scene?.globe?.ellipsoid;
    const cameraPos = this.viewer?.camera?.positionWC;
    if (!ellipsoid || !cameraPos) return new Cesium.Cartesian3(0, 0, 0);
    const carto = Cesium.Cartographic.fromCartesian(cameraPos, ellipsoid);
    if (!carto) return new Cesium.Cartesian3(0, 0, 0);
    const surface = Cesium.Cartesian3.fromRadians(
      carto.longitude,
      carto.latitude,
      0.0,
      ellipsoid
    );
    const normal = ellipsoid.geodeticSurfaceNormal(surface, new Cesium.Cartesian3());
    const center = Cesium.Cartesian3.subtract(
      surface,
      Cesium.Cartesian3.multiplyByScalar(
        normal,
        Number(bottomRadiusMeters) || 0,
        new Cesium.Cartesian3()
      ),
      new Cesium.Cartesian3()
    );
    const offsetMeters = Cesium.Cartesian3.negate(center, new Cesium.Cartesian3());
    return new Cesium.Cartesian3(
      offsetMeters.x * 0.001,
      offsetMeters.y * 0.001,
      offsetMeters.z * 0.001
    );
  }

  /**
   * 用于 u_atmosphereExposure：随时间轴（仿真时钟）下太阳方位变化。
   * 在相机当地「上」方向与指向太阳的视线夹角对应的高度角上，在 [-half,+half]° 内从 exposureNight 线性过渡到 exposureDay。
   */
  _getEffectiveAtmosphereExposure() {
    if (!this._exposureFollowTimeline) {
      return this._atmosphereExposure;
    }
    const Cesium = window.Cesium;
    if (!Cesium || !this.viewer?.camera?.positionWC) {
      return this._exposureDay;
    }
    const cameraPos = this.viewer.camera.positionWC;
    const ellipsoid = this.viewer.scene.globe?.ellipsoid ?? Cesium.Ellipsoid.WGS84;
    const sunDir = this.viewer.scene.context?.uniformState?.sunDirectionWC;
    if (!sunDir) {
      return this._exposureDay;
    }
    const carto = Cesium.Cartographic.fromCartesian(cameraPos, ellipsoid);
    if (!carto) {
      return this._exposureDay;
    }
    const surface = Cesium.Cartesian3.fromRadians(
      carto.longitude,
      carto.latitude,
      0.0,
      ellipsoid,
      new Cesium.Cartesian3()
    );
    const up = ellipsoid.geodeticSurfaceNormal(surface, new Cesium.Cartesian3());
    const sunDirNorm = Cesium.Cartesian3.normalize(sunDir, new Cesium.Cartesian3());
    const sinEl = Cesium.Math.clamp(Cesium.Cartesian3.dot(sunDirNorm, up), -1, 1);
    const elevDeg = Cesium.Math.toDegrees(Math.asin(sinEl));
    const half = Math.max(0.1, Number(this._exposureTwilightAngleDegrees) || 6);
    const low = -half;
    const high = half;
    let t = (elevDeg - low) / (high - low);
    t = Cesium.Math.clamp(t, 0, 1);
    const day = Number(this._exposureDay);
    const night = Number(this._exposureNight);
    return night + t * (day - night);
  }

  /**
   * 异步初始化：加载 LUT（.bin）+ 加载 shader，创建 PostProcessStage。
   * @returns {Promise<void>}
   */
  async init() {
    if (this._ready) return this._ready;
    this.viewer.scene.globe.depthTestAgainstTerrain = true; // 开启地形检测
    const scene = this.viewer.scene;
    const context = scene.context;
    const gl = context._gl;
    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new Error('AtmospherePostProcess 需要 WebGL2（用于 3D 散射纹理）。');
    }

    const Cesium = window.Cesium;
    if (!Cesium) throw new Error('需要全局 Cesium。');

    this._ready = (async () => {
      const [definitions, common, runtime] = await Promise.all([
        loadShaderSource('bruneton/definitions.glsl', { shaderBaseUrl: this.shaderBaseUrl }),
        loadShaderSource('bruneton/common.glsl', { shaderBaseUrl: this.shaderBaseUrl }),
        loadShaderSource('bruneton/runtime.glsl', { shaderBaseUrl: this.shaderBaseUrl }),
      ]);
      const sky = await loadShaderSource('sky.glsl', { shaderBaseUrl: this.shaderBaseUrl });

      this.textures = await loadPrecomputedTextures(
        this.assetsBaseUrl,
        context,
        Cesium
      );

      // 供云进程 blit BSM 用的 Cesium 纹理（大气 stage 只认 Cesium.Texture）
      // 优先用 HALF_FLOAT（避免 RGBA8 量化导致 B/G 等小值变 0 → 模式4/模式1全黑）。
      const BSM_SIZE = 1024;
      const canHalfFloat =
        !!context.halfFloatingPointTexture && !!context.colorBufferHalfFloat;
      const bsmPixelDatatype = canHalfFloat
        ? Cesium.PixelDatatype.HALF_FLOAT
        : Cesium.PixelDatatype.UNSIGNED_BYTE;
      // 与 three-geospatial 一致：天空/大气在浮点 RT 里累积，最后再 tonemap。
      // PostProcessStage 默认 RGBA8 会把 GetSkyRadiance 的高动态结果量化成明显「同心色带」。
      let postHdrPixelDatatype = Cesium.PixelDatatype.UNSIGNED_BYTE;
      if (canHalfFloat) {
        postHdrPixelDatatype = Cesium.PixelDatatype.HALF_FLOAT;
      } else if (context.colorBufferFloat && context.floatingPointTexture) {
        postHdrPixelDatatype = Cesium.PixelDatatype.FLOAT;
      }
      console.warn(
        `[Atmosphere] PostProcessStage pixel datatype=${postHdrPixelDatatype === Cesium.PixelDatatype.HALF_FLOAT ? 'HALF_FLOAT' : postHdrPixelDatatype === Cesium.PixelDatatype.FLOAT ? 'FLOAT' : 'UNSIGNED_BYTE'}`,
      );
      console.warn(`[Atmosphere] cloudShadow texture datatype=${canHalfFloat ? 'HALF_FLOAT' : 'UNSIGNED_BYTE'}`);
      this._cloudShadowCesiumTexture = new Cesium.Texture({
        context,
        width: BSM_SIZE,
        height: BSM_SIZE,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: bsmPixelDatatype,
        sampler: new Cesium.Sampler({
          minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
          magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
          wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
          wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
        }),
      });
      this._cloudShadowTexScale = canHalfFloat ? 1.0 : 0.02;
      this._cloudShadowTexClamp01 = !canHalfFloat;
      // BSM 未设置时绑定 2D 占位，避免 sampler 未绑定（用 transmittance 纹理即可）
      this._cloudShadowDummyArray = null;

      const fragmentSource = buildSkyFragmentSource(definitions, common, runtime, sky);

      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;

      const self = this;
      const flatAtmosphere = flattenAtmosphereUniform(this.atmosphereParams.toUniform());
      const uniforms: Record<string, any> = {
        u_cameraPosition: () => {
          const wc = self.viewer.camera.positionWC;
          return new Cesium.Cartesian3(wc.x * 0.001, wc.y * 0.001, wc.z * 0.001);
        },
        u_altitudeCorrection: () => self._getAltitudeCorrectionOffsetKm(self.atmosphereParams.bottomRadius),
        u_sunDirection: () => (self.viewer.scene.context?.uniformState?.sunDirectionWC ?? new Cesium.Cartesian3(1, 0, 0)),
        u_groundAlbedo: () => new Cesium.Cartesian3(0.0, 0.0, 0.0),
        u_renderSky: () => (self._renderSky ? 1 : 0),
        // 每像素角度（弧度），用于太阳边缘 smoothstep；与 three-geospatial 的 fragmentAngle 在 dFdx 无效时等效
        u_sunPixelAngle: () => {
          const cam = self.viewer.camera;
          const h = (self.viewer.scene.canvas && self.viewer.scene.canvas.clientHeight) || 1080;
          const fov = (cam.frustum && cam.frustum.fov) != null ? cam.frustum.fov : Math.PI / 3;
          return Math.max(fov / h, 1e-6);
        },
        transmittance_texture: () => self.textures.transmittanceTexture,
        scattering_texture: () => self.textures.scatteringTexture,
        single_mie_scattering_texture: () => self.textures.singleMieScatteringTexture,
        irradiance_texture: () => self.textures.irradianceTexture,
        SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: () => {
          const v = self.atmosphereParams.sunRadianceToRelativeLuminance;
          return new Cesium.Cartesian3(v[0], v[1], v[2]);
        },
        SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: () => {
          const v = self.atmosphereParams.skyRadianceToRelativeLuminance;
          return new Cesium.Cartesian3(v[0], v[1], v[2]);
        },
      };
      for (const [key, value] of Object.entries(flatAtmosphere)) {
        if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) {
          uniforms[key] = new Cesium.Cartesian3(value[0], value[1], value[2]);
        } else {
          uniforms[key] = value;
        }
      }
      const METER_TO_KM = 0.001;
      uniforms['ATMOSPHERE.bottom_radius'] = () => self.atmosphereParams.bottomRadius * METER_TO_KM;
      uniforms['ATMOSPHERE.top_radius'] = () => self.atmosphereParams.topRadius * METER_TO_KM;
      uniforms.u_atmosphereExposure = () => self._getEffectiveAtmosphereExposure();

      // Cloud shadow BSM uniforms (populated by VolumetricCloudsProcess if available)
      uniforms.u_cloudShadowEnabled = () => self._cloudShadowEnabled ? 1 : 0;
      uniforms.u_cloudShadowScale = () => self._cloudShadowTexScale ?? 1.0;
      uniforms.u_cloudShadowDecode = () =>
        self._cloudShadowDecode ?? new Cesium.Cartesian4(1.0, 1.0, 1.0, 1.0);
      uniforms.u_cloudShadowBuffer = () => self._cloudShadowBuffer ?? self.textures.transmittanceTexture;
      uniforms.u_cloudShadowNear = () => self._cloudShadowNear ?? 0.1;
      uniforms.u_cloudShadowFar = () => self._cloudShadowFar ?? 200000.0;
      uniforms.u_cloudShadowTopHeight = () => self._cloudShadowTopHeight ?? 5000.0;
      uniforms.u_cloudShadowAltitudeFadeStart = () =>
        self._cloudShadowAltitudeFadeStart ?? self._cloudShadowTopHeight ?? 5000.0;
      uniforms.u_cloudShadowAltitudeFadeEnd = () =>
        self._cloudShadowAltitudeFadeEnd ?? ((self._cloudShadowTopHeight ?? 5000.0) + 8000.0);
      uniforms.u_cloudShadowBottomRadius = () =>
        self._cloudShadowBottomRadius ?? self.atmosphereParams.bottomRadius;
      uniforms.u_cloudShadowIntervals = () => self._cloudShadowIntervals ?? [
        new Cesium.Cartesian2(0, 0), new Cesium.Cartesian2(0, 0),
        new Cesium.Cartesian2(0, 0), new Cesium.Cartesian2(0, 0)
      ];
      uniforms.u_cloudShadowMatrices = () => self._cloudShadowMatrices ?? [
        Cesium.Matrix4.IDENTITY.clone(), Cesium.Matrix4.IDENTITY.clone(),
        Cesium.Matrix4.IDENTITY.clone(), Cesium.Matrix4.IDENTITY.clone()
      ];
      uniforms.u_cloudShadowTexelSize = () =>
        self._cloudShadowTexelSize ?? new Cesium.Cartesian2(1 / 512, 1 / 512);
      uniforms.u_cloudShadowPcfTaps = () =>
        Math.max(1, Math.min(16, Math.round(self._cloudShadowPcfTaps ?? 16)));
      uniforms.u_geometricErrorCorrectionAmount = () =>
        self._geometricErrorCorrectionAmount ?? 0.0;
      // V3.4.x 修复：必须"开关开启且纹理确实存在"才启用。此前默认 enabled=true 而管线
      // 从未注入纹理，u_shadowLengthBuffer 兜底到 transmittance LUT → 天空辐射每帧被喂入
      // "把透射率查找表当阴影长度"的伪值（0~2.5km 随屏幕 UV 变化）。
      uniforms.u_shadowLengthEnabled = () =>
        (self._shadowLengthEnabled && self._shadowLengthTexture ? 1 : 0);
      uniforms.u_shadowLengthScale = () => (self._shadowLengthScale ?? 1.0);
      uniforms.u_shadowLengthBuffer = () => self._shadowLengthTexture ?? self.textures.transmittanceTexture;
      uniforms.u_applyGroundAtmosphere = () => (self._applyGroundAtmosphere ? 1 : 0);
      uniforms.u_debugTyndall = () => (self._debugTyndallMode ?? 0);
      uniforms.u_tyndallScale = () => (self._tyndallScale ?? 1.0);
      uniforms.u_bsmTyndallOpticalDepthScale = () => (self._bsmTyndallOpticalDepthScale ?? 1.0);
      uniforms.u_bsmGroundOpticalDepthScale = () => (self._bsmGroundOpticalDepthScale ?? 1.0);

      this.stage = new Cesium.PostProcessStage({
        name: 'AtmosphereFromThreeGeospatial',
        fragmentShader: fragmentSource,
        uniforms,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: postHdrPixelDatatype,
      });

      if (self._autoAddStage !== false) {
        scene.postProcessStages.add(this.stage);
      }

      if (this.enableGui) this._setupGUI();
    })();

    return this._ready;
  }

  _setupGUI() {
    if (this._gui || !this.enableGui) return;
    const dat = typeof window !== 'undefined' && (window as any).dat ? (window as any).dat : null;
    if (!dat?.GUI) {
      console.warn('[AtmospherePostProcess] enableGui=true 但未找到 dat.GUI，跳过调试面板');
      return;
    }
    this._gui = new dat.GUI({ name: '大气参数' });
    const folder = this._gui.addFolder('大气控制');
    folder.add(this, '_exposureFollowTimeline').name('曝光随时间轴(太阳高度)');
    folder.add(this, '_exposureDay', 0.0, 5.0, 0.05).name('白天曝光');
    folder.add(this, '_exposureNight', 0.0, 2.0, 0.01).name('夜晚曝光');
    folder.add(this, '_exposureTwilightAngleDegrees', 0.5, 18.0, 0.5).name('晨昏过渡半角(度)');
    folder.add(this, '_atmosphereExposure', 0.0, 30.0, 0.01).name('手动曝光(关时间轴时)');
    folder.add(this.atmosphereParams, 'bottomRadius', 6300000, 6400000, 10).name('bottom_radius (m)');
    folder.add(this.atmosphereParams, 'topRadius', 6350000, 6500000, 10).name('top_radius (m)');
    const debugFolder = this._gui.addFolder('丁达尔调试');
    debugFolder.add(this, '_tyndallScale', 0.5, 6.0, 0.25).name('光柱强度 (scale)');
    debugFolder.add(this, '_bsmTyndallOpticalDepthScale', 0.1, 50.0, 0.1).name('BSM OD 缩放(光柱)');
    debugFolder.add(this, '_bsmGroundOpticalDepthScale', 0.1, 50.0, 0.1).name('BSM OD 缩放(地面)');
    debugFolder.add(this, '_debugTyndallMode', {
      '关闭': 0,
      '1: shadowLength': 1,
      '2: BSM启用(绿=是)': 2,
      '3: BSM单点采样': 3,
      '4: BSM纹理直显(B)': 4,
      '5: transmittance诊断': 5,
      '6: BSM纹理直显(R)': 6,
      '7: BSM纹理直显(G)': 7,
      '8: BSM纹理直显(A)': 8
    }).name('调试模式');
    debugFolder.open();
    folder.open();
  }

  /**
   * 设置云阴影参数（由 VolumetricCloudsProcess 调用）。
   * options.scale：BSM 采样还原系数，1=原始浮点，0.02=从 RGBA8 解码（由 setCloudShadow 调用方传入）
   */
  setCloudShadow(options: any) {
    this._cloudShadowEnabled = options.enabled ?? false;
    this._cloudShadowBuffer = options.texture ?? null;
    if (options.scale !== undefined) this._cloudShadowTexScale = options.scale;
    if (options.decode) {
      const d = options.decode;
      this._cloudShadowDecode = new Cesium.Cartesian4(d.x ?? 1.0, d.y ?? 1.0, d.z ?? 1.0, d.w ?? 1.0);
    }
    this._cloudShadowNear = options.near ?? this._cloudShadowNear ?? 0.1;
    this._cloudShadowFar = options.far ?? 200000.0;
    this._cloudShadowTopHeight = options.topHeight ?? 5000.0;
    this._cloudShadowAltitudeFadeStart = options.altitudeFadeStart ?? this._cloudShadowTopHeight;
    this._cloudShadowAltitudeFadeEnd = options.altitudeFadeEnd ?? (this._cloudShadowTopHeight + 8000.0);
    this._cloudShadowBottomRadius = options.bottomRadius ?? this.atmosphereParams.bottomRadius;
    this._cloudShadowIntervals = options.intervals ?? null;
    this._cloudShadowMatrices = options.matrices ?? null;
    if (options.texelSize) {
      const tx = options.texelSize;
      this._cloudShadowTexelSize = new Cesium.Cartesian2(
        tx.x ?? tx[0] ?? 1 / 512,
        tx.y ?? tx[1] ?? 1 / 512,
      );
    }
    if (options.geometricErrorCorrectionAmount !== undefined) {
      this._geometricErrorCorrectionAmount = options.geometricErrorCorrectionAmount;
    }
    if (options.pcfTaps !== undefined) {
      this._cloudShadowPcfTaps = options.pcfTaps;
    }
  }

  /**
   * three-geospatial 对齐：设置屏幕空间 shadowLengthBuffer。
   * options.texture 需要是单通道/可采样纹理，其 r 通道存储 shadowLength（km）。
   */
  setCloudShadowLength(options: any) {
    this._shadowLengthEnabled = options.enabled ?? false;
    this._shadowLengthTexture = options.texture ?? null;
    if (options.scale !== undefined) this._shadowLengthScale = options.scale;
  }

  /**
   * 向外部暴露与 three-geospatial 一致的大气参数，供体积云等后续阶段使用。
   * 需在 init() 完成后再调用。
   * @returns {AtmosphereForCloudsProvider} 含：
   *   - textures: LUT 纹理（transmittance/scattering/irradiance/singleMie/higherOrder）
   *   - getUniforms(): 展平 ATMOSPHERE、sunDirection、cameraPosition(ECEF 米)、矩阵、常量等
   *   - atmosphereParams: AtmosphereParameters 引用
   *   - constants: METER_TO_LENGTH_UNIT、precomputeConstants、getShaderDefines()
   */
  getAtmosphereForClouds() {
    if (!this.textures) {
      throw new Error('AtmospherePostProcess.getAtmosphereForClouds() 需在 init() 完成后再调用');
    }
    const Cesium = window.Cesium;
    const self = this;
    const flatAtmosphere = flattenAtmosphereUniform(this.atmosphereParams.toUniform());

    const staticUniforms: Record<string, any> = {};
    for (const [key, value] of Object.entries(flatAtmosphere)) {
      if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) {
        staticUniforms[key] = new Cesium.Cartesian3(value[0], value[1], value[2]);
      } else {
        staticUniforms[key] = value;
      }
    }
    staticUniforms.SUN_SPECTRAL_RADIANCE_TO_LUMINANCE = (() => {
      const v = this.atmosphereParams.sunRadianceToRelativeLuminance;
      return new Cesium.Cartesian3(v[0], v[1], v[2]);
    })();
    staticUniforms.SKY_SPECTRAL_RADIANCE_TO_LUMINANCE = (() => {
      const v = this.atmosphereParams.skyRadianceToRelativeLuminance;
      return new Cesium.Cartesian3(v[0], v[1], v[2]);
    })();
    staticUniforms.altitudeCorrection = new Cesium.Cartesian3(0, 0, 0);
    staticUniforms.worldToECEFMatrix = Cesium.Matrix4.IDENTITY;
    staticUniforms.ecefToWorldMatrix = Cesium.Matrix4.IDENTITY;
    const METER_TO_KM = 0.001;
    staticUniforms['ATMOSPHERE.bottom_radius'] = () => self.atmosphereParams.bottomRadius * METER_TO_KM;
    staticUniforms['ATMOSPHERE.top_radius'] = () => self.atmosphereParams.topRadius * METER_TO_KM;

    function getUniforms() {
      return {
        ...staticUniforms,
        bottomRadius: () => self.atmosphereParams.bottomRadius,
        topRadius: () => self.atmosphereParams.topRadius,
        atmosphereExposure: () => self._getEffectiveAtmosphereExposure(),
        transmittance_texture: () => self.textures.transmittanceTexture,
        scattering_texture: () => self.textures.scatteringTexture,
        irradiance_texture: () => self.textures.irradianceTexture,
        single_mie_scattering_texture: () => self.textures.scatteringTexture,
        higher_order_scattering_texture: () : any => null,
        sunDirection: () =>
          self.viewer.scene.context?.uniformState?.sunDirectionWC ?? new Cesium.Cartesian3(1, 0, 0),
        // 与 three-geospatial 一致：cameraPosition 为 ECEF 米（vert 中 vCameraPosition = worldToECEF*cameraPosition，再参与 * METER_TO_LENGTH_UNIT）
        cameraPosition: () => {
          const wc = self.viewer.camera.positionWC;
          return new Cesium.Cartesian3(wc.x, wc.y, wc.z);
        },
      };
    }

    return {
      textures: {
        transmittanceTexture: this.textures.transmittanceTexture,
        scatteringTexture: this.textures.scatteringTexture,
        irradianceTexture: this.textures.irradianceTexture,
        singleMieScatteringTexture: this.textures.scatteringTexture,
        higherOrderScatteringTexture: null,
      },
      /** 供云进程每帧 blit BSM 的目标纹理（Cesium.Texture），blit 后通过 setCloudShadow 传入 */
      getCloudShadowTargetTexture: () => self._cloudShadowCesiumTexture ?? null,
      /** BSM 写入 Cesium 纹理时的缩放（1=不缩放；<1 时用于 RGBA8 编码，大气侧会除以该值还原） */
      getCloudShadowScale: () => self._cloudShadowTexScale ?? 1.0,
      /** blit 写入时是否需要 clamp 到 0..1（RGBA8 需要；HALF_FLOAT 不需要） */
      getCloudShadowClamp01: () => self._cloudShadowTexClamp01 ?? true,
      getUniforms,
      setCloudShadow: (opts: any) => self.setCloudShadow(opts),
      setCloudShadowLength: (opts: any) => self.setCloudShadowLength(opts),
      setDebugTyndall: (v: any) => { self._debugTyndallMode = v ? 1 : 0; },
      setDebugTyndallMode: (m: any) => { self._debugTyndallMode = m; },
      atmosphereParams: this.atmosphereParams,
      constants: {
        METER_TO_LENGTH_UNIT: 0.001,
        /** 预计算纹理尺寸等，体积云着色器 include bruneton 时需用相同 #define */
        precomputeConstants: PRECOMPUTE_CONSTANTS,
        /** 返回与天空阶段一致的 #define 字符串（含 COMBINED_SCATTERING_TEXTURES），用于拼接体积云 fragmentShader */
        getShaderDefines: () =>
          '#define COMBINED_SCATTERING_TEXTURES\n' + getPrecomputeDefines(),
      },
    };
  }

  destroy() {
    if (this.stage && this.viewer.scene.postProcessStages) {
      this.viewer.scene.postProcessStages.remove(this.stage);
      this.stage = null;
    }
    if (this.viewer.scene.skyAtmosphere) {
      this.viewer.scene.skyAtmosphere.show = true;
    }
    if (this._gui) {
      this._gui.destroy();
      this._gui = null;
    }
    if (this._cloudShadowCesiumTexture) {
      this._cloudShadowCesiumTexture.destroy();
      this._cloudShadowCesiumTexture = null;
    }
    this._cloudShadowDummyArray = null;
    this.textures = null;
    this._ready = null;
  }
}

export default AtmospherePostProcess;
export { loadPrecomputedTextures } from './PrecomputedTexturesLoader';
export { METER_TO_LENGTH_UNIT } from './AtmosphereForClouds';
