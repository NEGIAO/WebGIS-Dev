/**
 * 体积云性能预设：流畅 / 均衡 / 极致。
 * 只描述可调参数子集，应用时与当前 cloudParams 合并（保留 cloudsEnabled 等运行态）。
 *
 * @module Cloud/cloudQualityPresets
 */

/** @typedef {'smooth' | 'balanced' | 'ultra'} CloudQualityId */

/**
 * @type {Record<CloudQualityId, { label: string, description: string, params: Record<string, unknown> }>}
 */
export const CLOUD_QUALITY_PRESETS = {
  /**
   * 流畅：只保留体积云 raymarch，关掉 BSM / 丁达尔 / 雾 / TAA / 镜头光晕，
   * 并尽量压采样与多散射；大气天空仍可走极低曝光透传（不叠近距透视）。
   */
  smooth: {
    label: '流畅',
    description: '仅体积云，关 BSM/光晕/丁达尔，低采样，优先帧率',
    params: {
      quality: 'smooth',
      // 云层：两层即可，高云关掉（覆盖 0）
      layer0Altitude: 1800,
      layer0Height: 600,
      layer0Coverage: 0.28,
      layer1Altitude: 3200,
      layer1Height: 900,
      layer1Coverage: 0.18,
      layer2Altitude: 7500,
      layer2Height: 400,
      layer2Coverage: 0.0,
      // 光照
      sunIntensity: 14.0,
      cloudExposure: 2.2,
      skyToSunRatio: 0.2,
      aerialPerspectiveScale: 0.0,
      atmosphereExposureDay: 0.82,
      atmosphereExposureNight: 0.08,
      atmosphereExposureManual: 0.82,
      atmosphereExposureFollowTimeline: true,
      magentaFixStrength: 1.4,
      scatterG1: 0.62,
      scatterG2: -0.12,
      multiScatteringOctaves: 1,
      windSpeed: 0.001,
      evolutionSpeed: 0.008,
      distFadeStart: 12000,
      distFadeEnd: 40000,
      maxRayDistance: 52000,
      altitudeFadeRange: 52000,
      // 质量 / 开关：smooth 是默认 60FPS 目标档，优先减少每像素 raymarch 与全屏后处理。
      maxSteps: 108,
      maxStepsToSun: 2,
      minStepSize: 110,
      maxStepSize: 1400,
      perspectiveStepScale: 1.03,
      shadowMapSize: 512,
      bsmUpdateInterval: 4,
      shadowResolveEnabled: false,
      shadowPcfTaps: 1,
      useShadowBuffer: false,
      shadowLengthEnabled: false,
      hazeEnabled: false,
      temporalEnabled: false,
      bsmGroundScale: 0.1,
      bsmTyndallScale: 1.0,
      shadowFar: 25000,
      shadowSplitLambda: 0.8,
      shadowFadeScale: 3.0,
      // 镜头光晕全关
      lensFlareEnabled: false,
      bloomIntensity: 0.0,
      ghostIntensity: 0.0,
      haloIntensity: 0.0,
      // stage 级：压大气后处理负担（天空仍保留极轻曝光，Aerial 可关）
      atmosphereStageEnabled: true,
      aerialStageEnabled: false,
      // 地面发白独立控制：空中透视 stage 对地面的大气散射强度（0=原色 1=全散射）
      groundAerialScale: 0.0,
    },
  },

  /**
   * 均衡：体积云 + 中等 BSM 云影 + 轻量丁达尔，无 TAA/雾，镜头光晕弱。
   */
  balanced: {
    label: '均衡',
    description: '云 + 轻 BSM/丁达尔，中等采样，表现与性能折中',
    params: {
      quality: 'balanced',
      layer0Altitude: 1800,
      layer0Height: 650,
      layer0Coverage: 0.2,
      layer1Altitude: 2400,
      layer1Height: 1100,
      layer1Coverage: 0.28,
      layer2Altitude: 7500,
      layer2Height: 450,
      layer2Coverage: 0.15,
      sunIntensity: 18.0,
      cloudExposure: 2.8,
      skyToSunRatio: 0.26,
      aerialPerspectiveScale: 0.0,
      atmosphereExposureDay: 0.9,
      atmosphereExposureNight: 0.1,
      atmosphereExposureManual: 0.9,
      atmosphereExposureFollowTimeline: true,
      magentaFixStrength: 1.8,
      scatterG1: 0.7,
      scatterG2: -0.2,
      multiScatteringOctaves: 2,
      windSpeed: 0.001,
      evolutionSpeed: 0.008,
      distFadeStart: 14000,
      distFadeEnd: 48000,
      maxRayDistance: 62000,
      altitudeFadeRange: 60000,
      maxSteps: 156,
      maxStepsToSun: 4,
      minStepSize: 80,
      maxStepSize: 1200,
      perspectiveStepScale: 1.018,
      shadowMapSize: 512,
      bsmUpdateInterval: 3,
      shadowResolveEnabled: true,
      shadowPcfTaps: 4,
      useShadowBuffer: true,
      shadowLengthEnabled: false,
      hazeEnabled: false,
      temporalEnabled: false,
      bsmGroundScale: 0.08,
      bsmTyndallScale: 0.6,
      shadowFar: 30000,
      shadowSplitLambda: 0.9,
      shadowFadeScale: 3.5,
      lensFlareEnabled: false,
      bloomIntensity: 0.0,
      ghostIntensity: 0.0,
      haloIntensity: 0.0,
      atmosphereStageEnabled: true,
      aerialStageEnabled: true,
      groundAerialScale: 1.0,
    },
  },

  /**
   * 极致：全链路（BSM + 丁达尔 + 可选雾/TAA + 强光晕 + 高采样），硬件压力大。
   */
  ultra: {
    label: '极致',
    description: '全效果：高采样 + BSM + 丁达尔 + 光晕，偏重画质',
    params: {
      quality: 'ultra',
      layer0Altitude: 1800,
      layer0Height: 650,
      layer0Coverage: 0.2,
      layer1Altitude: 2400,
      layer1Height: 1200,
      layer1Coverage: 0.3,
      layer2Altitude: 7500,
      layer2Height: 500,
      layer2Coverage: 0.3,
      sunIntensity: 20.0,
      cloudExposure: 3.0,
      skyToSunRatio: 0.28,
      aerialPerspectiveScale: 0.0,
      atmosphereExposureDay: 0.85,
      atmosphereExposureNight: 0.1,
      atmosphereExposureManual: 0.85,
      atmosphereExposureFollowTimeline: true,
      magentaFixStrength: 2.0,
      scatterG1: 0.7,
      scatterG2: -0.2,
      multiScatteringOctaves: 6,
      windSpeed: 0.001,
      evolutionSpeed: 0.01,
      distFadeStart: 20000,
      distFadeEnd: 62000,
      maxRayDistance: 82000,
      altitudeFadeRange: 76000,
      maxSteps: 340,
      maxStepsToSun: 6,
      minStepSize: 45,
      maxStepSize: 1100,
      perspectiveStepScale: 1.008,
      shadowMapSize: 1024,
      bsmUpdateInterval: 1,
      shadowResolveEnabled: true,
      shadowPcfTaps: 8,
      useShadowBuffer: true,
      shadowLengthEnabled: true,
      hazeEnabled: false,
      temporalEnabled: false,
      bsmGroundScale: 0.1,
      bsmTyndallScale: 1.0,
      shadowFar: 45000,
      shadowSplitLambda: 1.0,
      shadowFadeScale: 5.0,
      lensFlareEnabled: true,
      bloomIntensity: 0.6,
      ghostIntensity: 1.1,
      haloIntensity: 0.2,
      atmosphereStageEnabled: true,
      aerialStageEnabled: true,
      groundAerialScale: 1.0,
    },
  },
};

/** 开启体积云时的默认性能档：默认走流畅档，确保开启即优先稳定帧率。 */
export const DEFAULT_CLOUD_QUALITY = 'smooth';

/**
 * 应用预设参数（不改写 cloudsEnabled）。
 * @param {Record<string, unknown>} current
 * @param {CloudQualityId | string} qualityId
 * @returns {Record<string, unknown>}
 */
export function applyCloudQualityPreset(current, qualityId) {
  const id = CLOUD_QUALITY_PRESETS[qualityId] ? qualityId : DEFAULT_CLOUD_QUALITY;
  const preset = CLOUD_QUALITY_PRESETS[id];
  return {
    ...current,
    ...preset.params,
    quality: id,
    // 总开关由调用方控制
    cloudsEnabled: current?.cloudsEnabled === true,
  };
}

/**
 * 获取预设选项列表（供 select 控件）。
 * @returns {{ value: string, label: string }[]}
 */
export function getCloudQualityOptions() {
  return Object.entries(CLOUD_QUALITY_PRESETS).map(([value, meta]) => ({
    value,
    label: meta.label,
  }));
}