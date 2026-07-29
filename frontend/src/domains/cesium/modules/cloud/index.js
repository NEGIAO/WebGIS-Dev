/**
 * Cloud 模块统一出口。
 * 体积云 + Bruneton 大气 + 空中透视 + BSM + 可选镜头光晕
 * （源码移植自 cesium-clouds-atmosphere / three-geospatial，MIT）
 *
 * @module Cloud
 */

export { setupCloudIntegration } from './setupCloudIntegration.js';
export { resolveWebgisCloudAssetPaths, createDefaultCloudPanelParams } from './assetConfig.js';
export { applyCloudPanelParams, applyLensFlareParams } from './cloudParamsApply.js';
export {
  CLOUD_QUALITY_PRESETS,
  DEFAULT_CLOUD_QUALITY,
  applyCloudQualityPreset,
  getCloudQualityOptions,
} from './cloudQualityPresets.js';

// 高级用法：直接访问库 API（需在 Cesium 就绪后动态 import）
// import { createCloudAtmosphere } from './lib/createCloudAtmosphere.js';
// import { ThreeGeospatialPipeline } from './lib/ThreeGeospatialPipeline.js';
// import { LensFlareBloomStage } from './lib/AtmosphereFromThreeGeospatial/LensFlareBloomStage.js';
// import { AtmosphereParameters } from './lib/AtmosphereFromThreeGeospatial/AtmosphereParameters.js';
