/**
 * AerialPerspectiveEffect - 空中透视后处理（复刻 three-geospatial AerialPerspectiveEffect，但基于 Cesium.PostProcessStage）。
 *
 * 作用：
 * - 读取场景 color + depth，再结合 Bruneton LUT，对命中几何的像素应用大气透视：
 *   final = sceneColor * transmittance * sunTransmittance + inscatter
 * - 天空（depth=1）部分仍由 AtmospherePostProcess/sky 负责，这里只处理有几何的像素。
 *
 * 依赖：
 * - 预先通过 PrecomputedTexturesLoader.js 加载好的 LUT（transmittance / scattering / irradiance / singleMie / higherOrder）
 * - AtmosphereParameters 实例（与 AtmospherePostProcess 一致）
 * - GLSL 源：bruneton/definitions.glsl + bruneton/common.glsl + bruneton/runtime.glsl +
 *   Shaders/aerialPerspectiveEffect.frag（已根据 Cesium 环境适配）
 */

import {
  AtmosphereParameters,
  PRECOMPUTE_CONSTANTS,
  flattenAtmosphereUniform,
} from "./AtmosphereParameters.js";
import { loadPrecomputedTextures } from "./PrecomputedTexturesLoader.js";
import { loadShaderSource } from "../shaderLoader.js";
import { getCesium } from "../getCesium.js";
/* eslint-disable @typescript-eslint/no-this-alias, @typescript-eslint/no-unused-vars */
const Cesium = getCesium();

const LOCAL_ASSETS_BASE = "./src/AtmosphereFromThreeGeospatial/assets/";

export class AerialPerspectiveEffect {
  /**
   * @param {Cesium.Viewer} viewer
   * @param {{
   *   assetsBaseUrl?: string,
   *   shaderBaseUrl?: string,
   *   atmosphereParams?: AtmosphereParameters,
   *   logCameraAltitude?: boolean,
   *   logCameraPositionEpsilonMeters?: number,
   *   logCameraDirectionEpsilon?: number,
   * }} options
   * logCameraPositionEpsilonMeters：位置变化小于该值（米）视为未动。
   * logCameraDirectionEpsilon：1-dot(direction) 小于该值视为视线未变。
   */
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.assetsBaseUrl = options.assetsBaseUrl ?? LOCAL_ASSETS_BASE;
    this.shaderBaseUrl =
      options.shaderBaseUrl ??
      "./src/AtmosphereFromThreeGeospatial/Shaders/";
    this.atmosphereParams =
      options.atmosphereParams ?? new AtmosphereParameters();

    /** @type {Cesium.PostProcessStage | null} */
    this.stage = null;
    this.textures = null;
    this._ready = null;

    // 这些字段用于和 AtmospherePostProcess 共用的 BSM / shadowLength 配置；
    // 实际数值由外部 VolumetricCloudsProcess / BSM 管线通过 setCloudShadow / setCloudShadowLength 注入。
    this._cloudShadowEnabled = false;
    this._cloudShadowBuffer = null;
    this._cloudShadowDecode = null;
    this._cloudShadowNear = 0.1;
    this._cloudShadowFar = 200000.0;
    this._cloudShadowTopHeight = 5000.0;
    this._cloudShadowBottomRadius = this.atmosphereParams.bottomRadius;
    this._cloudShadowIntervals = null;
    this._cloudShadowMatrices = null;
    this._cloudShadowTexScale = 1.0;
    this._cloudShadowTexClamp01 = true;
    this._cloudShadowCesiumTexture = null;
    this._cloudShadowDummyArray = null;
    this._cloudShadowTexelSize = null;
    this._geometricErrorCorrectionAmount = 0.0;

    this._cloudShadowLengthEnabled = false;
    this._cloudShadowLengthTexture = null;
    this._cloudShadowLengthScale = 1.0;

    this._debugTyndallMode = 0;
    this._tyndallScale = 2.5;
    this._bsmTyndallOpticalDepthScale = 1.0;
    this._bsmGroundOpticalDepthScale = 1.0;

    /** 是否在控制台打印相机椭球高（WGS84，米）；仅在相机相对上一帧有变动时打印 */
    this._logCameraAltitude = options.logCameraAltitude ?? false;
    this._logCameraPositionEpsilonMeters =
      options.logCameraPositionEpsilonMeters ?? 0.05;
    this._logCameraDirectionEpsilon =
      options.logCameraDirectionEpsilon ?? 1e-5;
    /** @type {((scene: unknown, time: number) => void) | null} */
    this._cameraAltitudePostRenderHandler = null;
    /** @type {boolean} */
    this._cameraAltitudeLogStateInitialized = false;
    /** @type {object | null} */
    this._lastCameraPosForAltitudeLog = null;
    /** @type {object | null} */
    this._lastCameraDirForAltitudeLog = null;
    /** @type {object | null} */
    this._scratchCartographic = null;
    this._autoAddStage = options.autoAddStage ?? true;
  }

  _getAltitudeCorrectionOffsetKm(bottomRadiusMeters) {
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
   * 异步初始化：加载 LUT（.bin）+ 加载 aerial fragment，创建 PostProcessStage。
   * 注意：这里只负责空中透视（几何像素），天空仍由 AtmospherePostProcess 或其他 sky stage 负责。
   * @returns {Promise<void>}
   */
  async init() {
    if (this._ready) return this._ready;
    const scene = this.viewer.scene;
    const context = scene.context;
    const gl = context._gl;
    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new Error(
        "AerialPerspectiveEffect 需要 WebGL2（用于 3D 散射纹理）。",
      );
    }

    const Cesium = window.Cesium;
    if (!Cesium) throw new Error("需要全局 Cesium。");

    this._ready = (async () => {
      // 1. 预计算 LUT（与 AtmospherePostProcess 一致）
      this.textures = await loadPrecomputedTextures(
        this.assetsBaseUrl,
        context,
        Cesium,
      );

      // 2. 预先为 BSM blit 分配 Cesium.Texture（与 AtmospherePostProcess 一致）
      const BSM_SIZE = 1024;
      const canHalfFloat =
        !!context.halfFloatingPointTexture && !!context.colorBufferHalfFloat;
      const bsmPixelDatatype = canHalfFloat
        ? Cesium.PixelDatatype.HALF_FLOAT
        : Cesium.PixelDatatype.UNSIGNED_BYTE;
      console.warn(
        `[AerialPerspective] cloudShadow texture datatype=${
          canHalfFloat ? "HALF_FLOAT" : "UNSIGNED_BYTE"
        }`,
      );
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
      this._cloudShadowDummyArray = null;

      // 3. 加载 Bruneton runtime + Cesium 版 aerialPerspectiveEffect.frag（无 #include）
      const shaderOpts = { shaderBaseUrl: this.shaderBaseUrl };
      const [definitions, common, runtime, aerialFrag] = await Promise.all([
        loadShaderSource("bruneton/definitions.glsl", shaderOpts),
        loadShaderSource("bruneton/common.glsl", shaderOpts),
        loadShaderSource("bruneton/runtime.glsl", shaderOpts),
        loadShaderSource("aerialPerspectiveEffect.frag", shaderOpts),
      ]);

      const c = PRECOMPUTE_CONSTANTS;
      const precisionHeader = `
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
`;
      const defines = [
        "#define COMBINED_SCATTERING_TEXTURES",
        `#define SCATTERING_TEXTURE_R_SIZE ${c.SCATTERING_TEXTURE_R_SIZE}`,
        `#define SCATTERING_TEXTURE_MU_SIZE ${c.SCATTERING_TEXTURE_MU_SIZE}`,
        `#define SCATTERING_TEXTURE_MU_S_SIZE ${c.SCATTERING_TEXTURE_MU_S_SIZE}`,
        `#define SCATTERING_TEXTURE_NU_SIZE ${c.SCATTERING_TEXTURE_NU_SIZE}`,
        `#define TRANSMITTANCE_TEXTURE_WIDTH ${c.TRANSMITTANCE_TEXTURE_WIDTH}`,
        `#define TRANSMITTANCE_TEXTURE_HEIGHT ${c.TRANSMITTANCE_TEXTURE_HEIGHT}`,
        `#define IRRADIANCE_TEXTURE_WIDTH ${c.IRRADIANCE_TEXTURE_WIDTH}`,
        `#define IRRADIANCE_TEXTURE_HEIGHT ${c.IRRADIANCE_TEXTURE_HEIGHT}`,
      ].join("\n");

      // runtime.glsl 需要这些全局 uniforms（必须在 runtime 之前声明）
      const globalUniformsForRuntime = `
uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;
uniform sampler2D irradiance_texture;
`;

      const fragmentSource =
        precisionHeader +
        defines +
        "\n" +
        definitions +
        "\n" +
        common +
        "\n" +
        globalUniformsForRuntime +
        runtime +
        "\n" +
        aerialFrag;

      // 4. 构建 uniforms（参考 AtmospherePostProcess.init 中的同名部分）
      const flatAtmosphere = flattenAtmosphereUniform(
        this.atmosphereParams.toUniform(),
      );

      const self = this;
      const uniforms = {
        u_cameraPosition: () => {
          const wc = self.viewer.camera.positionWC;
          // runtime.glsl 里用 km 单位
          return new Cesium.Cartesian3(wc.x * 0.001, wc.y * 0.001, wc.z * 0.001);
        },
        u_altitudeCorrection: () =>
          self._getAltitudeCorrectionOffsetKm(self.atmosphereParams.bottomRadius),
        u_sunDirection: () =>
          self.viewer.scene.context?.uniformState?.sunDirectionWC ??
          new Cesium.Cartesian3(1, 0, 0),
        u_sunPixelAngle: () => {
          const cam = self.viewer.camera;
          const h =
            (self.viewer.scene.canvas &&
              self.viewer.scene.canvas.clientHeight) ||
            1080;
          const fov =
            cam.frustum && cam.frustum.fov != null
              ? cam.frustum.fov
              : Math.PI / 3;
          return Math.max(fov / h, 1e-6);
        },
        transmittance_texture: () => self.textures.transmittanceTexture,
        scattering_texture: () => self.textures.scatteringTexture,
        single_mie_scattering_texture: () =>
          self.textures.singleMieScatteringTexture,
        higher_order_scattering_texture: () =>
          self.textures.higherOrderScatteringTexture,
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
        if (
          Array.isArray(value) &&
          value.length === 3 &&
          value.every(Number.isFinite)
        ) {
          uniforms[key] = new Cesium.Cartesian3(value[0], value[1], value[2]);
        } else {
          uniforms[key] = value;
        }
      }

      const METER_TO_KM = 0.001;
      uniforms["ATMOSPHERE.bottom_radius"] = () =>
        self.atmosphereParams.bottomRadius * METER_TO_KM;
      uniforms["ATMOSPHERE.top_radius"] = () =>
        self.atmosphereParams.topRadius * METER_TO_KM;
      // 曝光只在 AtmospherePostProcess 线性段乘入；此处不再绑定 u_atmosphereExposure
      uniforms.u_atmosphereExposure = () => self.viewer.scene.postProcessStages.getStageByName("AtmosphereFromThreeGeospatial")?._atmosphereExposure ?? 1.5;
      // Cloud shadow BSM uniforms（由外部 setCloudShadow 提供）
      uniforms.u_cloudShadowEnabled = () => (self._cloudShadowEnabled ? 1 : 0);
      uniforms.u_cloudShadowScale = () => self._cloudShadowTexScale ?? 1.0;
      uniforms.u_cloudShadowDecode = () =>
        self._cloudShadowDecode ??
        new Cesium.Cartesian4(1.0, 1.0, 1.0, 1.0);
      uniforms.u_cloudShadowBuffer = () =>
        self._cloudShadowBuffer ?? self.textures.transmittanceTexture;
      uniforms.u_cloudShadowNear = () => self._cloudShadowNear ?? 0.1;
      uniforms.u_cloudShadowFar = () => self._cloudShadowFar ?? 200000.0;
      uniforms.u_cloudShadowTopHeight = () =>
        self._cloudShadowTopHeight ?? 5000.0;
      uniforms.u_cloudShadowBottomRadius = () =>
        self._cloudShadowBottomRadius ?? self.atmosphereParams.bottomRadius;
      uniforms.u_cloudShadowIntervals = () =>
        self._cloudShadowIntervals ??
        [
          new Cesium.Cartesian2(0, 0),
          new Cesium.Cartesian2(0, 0),
          new Cesium.Cartesian2(0, 0),
          new Cesium.Cartesian2(0, 0),
        ];
      uniforms.u_cloudShadowMatrices = () =>
        self._cloudShadowMatrices ??
        [
          Cesium.Matrix4.IDENTITY.clone(),
          Cesium.Matrix4.IDENTITY.clone(),
          Cesium.Matrix4.IDENTITY.clone(),
          Cesium.Matrix4.IDENTITY.clone(),
        ];
      uniforms.u_cloudShadowTexelSize = () =>
        self._cloudShadowTexelSize ?? new Cesium.Cartesian2(1 / 512, 1 / 512);
      uniforms.u_geometricErrorCorrectionAmount = () =>
        self._geometricErrorCorrectionAmount ?? 0.0;

      // shadowLength MRT 纹理（可选）
      uniforms.u_cloudShadowLengthEnabled = () =>
        self._cloudShadowLengthEnabled ? 1 : 0;
      uniforms.u_cloudShadowLengthScale = () =>
        self._cloudShadowLengthScale ?? 1.0;
      uniforms.u_cloudShadowLengthTexture = () =>
        self._cloudShadowLengthTexture ??
        self.textures.transmittanceTexture;

      // 丁达尔调试与强度
      uniforms.u_debugTyndall = () => self._debugTyndallMode ?? 0;
      uniforms.u_tyndallScale = () => self._tyndallScale ?? 1.0;
      uniforms.u_bsmTyndallOpticalDepthScale = () =>
        self._bsmTyndallOpticalDepthScale ?? 1.0;
      uniforms.u_bsmGroundOpticalDepthScale = () =>
        self._bsmGroundOpticalDepthScale ?? 1.0;

      this.stage = new Cesium.PostProcessStage({
        name: "AerialPerspectiveEffect",
        fragmentShader: fragmentSource,
        uniforms,
      });

      if (self._autoAddStage !== false) {
        scene.postProcessStages.add(this.stage);
      }

      if (self._logCameraAltitude) {
        const ellipsoid =
          self.viewer.scene.globe?.ellipsoid ?? Cesium.Ellipsoid.WGS84;
        self._scratchCartographic = new Cesium.Cartographic();
        self._lastCameraPosForAltitudeLog = new Cesium.Cartesian3();
        self._lastCameraDirForAltitudeLog = new Cesium.Cartesian3();
        self._cameraAltitudePostRenderHandler = function () {
          const cam = self.viewer.camera;
          const pos = cam.positionWC;
          const dir = cam.directionWC;

          const epsPos = self._logCameraPositionEpsilonMeters;
          const epsDir = self._logCameraDirectionEpsilon;
          if (self._cameraAltitudeLogStateInitialized) {
            const dist = Cesium.Cartesian3.distance(
              pos,
              self._lastCameraPosForAltitudeLog,
            );
            const dotDir = Cesium.Cartesian3.dot(dir, self._lastCameraDirForAltitudeLog);
            if (dist < epsPos && 1.0 - dotDir < epsDir) {
              return;
            }
          }
          self._cameraAltitudeLogStateInitialized = true;
          Cesium.Cartesian3.clone(pos, self._lastCameraPosForAltitudeLog);
          Cesium.Cartesian3.clone(dir, self._lastCameraDirForAltitudeLog);

          Cesium.Cartographic.fromCartesian(
            pos,
            ellipsoid,
            self._scratchCartographic,
          );
          const c = self._scratchCartographic;
          const hMeters = c.height;
          const lonDeg = Cesium.Math.toDegrees(c.longitude);
          const latDeg = Cesium.Math.toDegrees(c.latitude);
          const rKm = Cesium.Cartesian3.magnitude(pos) * 0.001;
          console.warn(
            `[AerialPerspective] 相机高度(WGS84): ${hMeters.toFixed(1)} m | ${(hMeters * 0.001).toFixed(3)} km | 地心距 ${rKm.toFixed(3)} km | lon ${lonDeg.toFixed(4)}° lat ${latDeg.toFixed(4)}°`,
          );
        };
        self.viewer.scene.postRender.addEventListener(
          self._cameraAltitudePostRenderHandler,
        );
      }
    })();

    return this._ready;
  }

  /**
   * 供体积云 / BSM 管线在每帧更新 cloud shadow atlas 时调用。
   * 与 AtmospherePostProcess.setCloudShadow 完全一致，目的是保持两条链路对 BSM 的理解统一。
   */
  setCloudShadow(options) {
    const Cesium = window.Cesium;
    this._cloudShadowEnabled = options.enabled ?? false;
    this._cloudShadowBuffer = options.texture ?? null;
    if (options.scale !== undefined) this._cloudShadowTexScale = options.scale;
    if (options.decode) {
      const d = options.decode;
      this._cloudShadowDecode = new Cesium.Cartesian4(
        d.x ?? 1.0,
        d.y ?? 1.0,
        d.z ?? 1.0,
        d.w ?? 1.0,
      );
    }
    this._cloudShadowNear = options.near ?? this._cloudShadowNear ?? 0.1;
    this._cloudShadowFar = options.far ?? 200000.0;
    this._cloudShadowTopHeight = options.topHeight ?? 5000.0;
    this._cloudShadowBottomRadius = options.bottomRadius ?? this.atmosphereParams.bottomRadius;
    this._cloudShadowIntervals = options.intervals ?? null;
    this._cloudShadowMatrices = options.matrices ?? null;
    if (options.texelSize) {
      this._cloudShadowTexelSize = new Cesium.Cartesian2(
        options.texelSize.x ?? options.texelSize[0] ?? 1 / 512,
        options.texelSize.y ?? options.texelSize[1] ?? 1 / 512,
      );
    }
    if (options.geometricErrorCorrectionAmount !== undefined) {
      this._geometricErrorCorrectionAmount = options.geometricErrorCorrectionAmount;
    }
  }

  /**
   * 设置云 shadowLength 纹理（由云 MRT 渲染管线提供）。
   */
  setCloudShadowLength(options) {
    this._cloudShadowLengthEnabled = options.enabled ?? false;
    this._cloudShadowLengthTexture = options.texture ?? null;
    if (options.scale !== undefined) this._cloudShadowLengthScale = options.scale;
  }

  /**
   * 当前相机相对椭球的的海拔高（米，WGS84）。需在 viewer 已创建后调用。
   * @returns {number}
   */
  getCameraAltitudeMeters() {
    const Cesium = window.Cesium;
    if (!Cesium || !this.viewer?.camera?.positionWC) {
      return NaN;
    }
    const ellipsoid =
      this.viewer.scene.globe?.ellipsoid ?? Cesium.Ellipsoid.WGS84;
    const c = new Cesium.Cartographic();
    Cesium.Cartographic.fromCartesian(
      this.viewer.camera.positionWC,
      ellipsoid,
      c,
    );
    return c.height;
  }

  destroy() {
    const scene = this.viewer?.scene;
    if (this._cameraAltitudePostRenderHandler && scene) {
      scene.postRender.removeEventListener(this._cameraAltitudePostRenderHandler);
      this._cameraAltitudePostRenderHandler = null;
    }
    this._cameraAltitudeLogStateInitialized = false;
    this._lastCameraPosForAltitudeLog = null;
    this._lastCameraDirForAltitudeLog = null;
    this._scratchCartographic = null;
    if (this.stage && scene && scene.postProcessStages) {
      scene.postProcessStages.remove(this.stage);
    }
    this.stage = null;
    this.textures = null;
    this._ready = null;
    if (this._cloudShadowCesiumTexture) {
      this._cloudShadowCesiumTexture.destroy();
      this._cloudShadowCesiumTexture = null;
    }
  }
}

