/**
 * 资源路径解析：本地默认布局 / 自定义部署。
 *
 * WebGIS 运行时实际使用 assetConfig.resolveWebgisCloudAssetPaths()
 * 显式传入 public/cloud-atmosphere/ 路径，本模块仅作为
 * ThreeGeospatialPipeline 构造参数缺省时的兜底，不再依赖任何公共 CDN。
 */

/** 仓库根目录直接部署时的默认相对路径 */
export const DEFAULT_CLOUDS_ASSETS_BASE = "./public/clouds-assets/";
export const DEFAULT_BRUNETON_SHADER_BASE =
  "./src/AtmosphereFromThreeGeospatial/Shaders/bruneton/";
export const DEFAULT_BLUE_NOISE_URL = "./public/data/noisePic/noisergba256.png";
export const DEFAULT_ATMOSPHERE_ASSETS_BASE =
  "./src/AtmosphereFromThreeGeospatial/assets/";
export const DEFAULT_ATMOSPHERE_SHADER_BASE =
  "./src/AtmosphereFromThreeGeospatial/Shaders/";

/**
 * @typedef {'local' | 'custom'} AssetPathMode
 */

/**
 * @typedef {Object} AssetPaths
 * @property {string} cloudsAssetsBase
 * @property {string} brunetonShaderBase
 * @property {string} blueNoiseUrl
 * @property {string} atmosphereAssetsBase
 * @property {string} atmosphereShaderBase
 */

/**
 * @typedef {Object} ResolveAssetPathsOptions
 * @property {AssetPathMode} [mode='local'] - local：仓库根目录相对路径；custom：自定义 base
 * @property {string} [base] - mode 为 custom 时的静态资源根路径，如 '/assets/cca'
 */

/**
 * 解析运行时 fetch 所需的资源路径。
 *
 * @param {ResolveAssetPathsOptions} [options]
 * @returns {AssetPaths}
 */
export function resolveAssetPaths(options = {}) {
  const mode = options.mode ?? "local";

  if (mode === "custom") {
    const root = (options.base ?? "").replace(/\/+$/, "");
    if (!root) {
      throw new Error('resolveAssetPaths({ mode: "custom" }) requires options.base');
    }
    return {
      cloudsAssetsBase: `${root}/public/clouds-assets/`,
      brunetonShaderBase: `${root}/shaders/bruneton/`,
      blueNoiseUrl: `${root}/public/data/noisePic/noisergba256.png`,
      atmosphereAssetsBase: `${root}/assets/`,
      atmosphereShaderBase: `${root}/shaders/`,
    };
  }

  return {
    cloudsAssetsBase: DEFAULT_CLOUDS_ASSETS_BASE,
    brunetonShaderBase: DEFAULT_BRUNETON_SHADER_BASE,
    blueNoiseUrl: DEFAULT_BLUE_NOISE_URL,
    atmosphereAssetsBase: DEFAULT_ATMOSPHERE_ASSETS_BASE,
    atmosphereShaderBase: DEFAULT_ATMOSPHERE_SHADER_BASE,
  };
}
