/**
 * cesium-clouds-atmosphere
 * 统一出口：体积云 + Bruneton 大气 + 空中透视 + 镜头光晕一体化渲染管线。
 *
 * 体积云与大气渲染的实现改编自开源项目 three-geospatial（MIT License）：
 *   https://github.com/takram-design-engineering/three-geospatial
 *
 * 典型用法见仓库根目录 README.md。
 */

export { createCloudAtmosphere } from "./createCloudAtmosphere.js";
export { ThreeGeospatialPipeline } from "./ThreeGeospatialPipeline.js";
export {
  resolveAssetPaths,
  getDefaultAssetPaths,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  DEFAULT_CLOUDS_ASSETS_BASE,
  DEFAULT_BRUNETON_SHADER_BASE,
  DEFAULT_BLUE_NOISE_URL,
  DEFAULT_ATMOSPHERE_ASSETS_BASE,
  DEFAULT_ATMOSPHERE_SHADER_BASE,
} from "./assetPaths.js";
export { loadShaderSource, BUNDLED_SHADERS } from "./shaderLoader.js";
export { LensFlareBloomStage } from "./AtmosphereFromThreeGeospatial/LensFlareBloomStage.js";
export {
  AtmosphereParameters,
  PRECOMPUTE_CONSTANTS,
  getPrecomputeDefines,
  flattenAtmosphereUniform,
} from "./AtmosphereFromThreeGeospatial/AtmosphereParameters.js";

// 以下为更细粒度的内部模块，按需导出供高级用法或二次开发使用。
export { AtmospherePostProcess } from "./AtmosphereFromThreeGeospatial/AtmospherePostProcess.js";
export { AerialPerspectiveEffect } from "./AtmosphereFromThreeGeospatial/AerialPerspectiveEffect.js";
export { loadPrecomputedTextures } from "./AtmosphereFromThreeGeospatial/PrecomputedTexturesLoader.js";
export {
  loadBinThreeGeospatial,
  bindData3DTextureToCesiumContext,
} from "./loadBinThreeGeospatial.js";
