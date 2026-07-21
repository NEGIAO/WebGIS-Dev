/**
 * 资源路径解析：CDN 零配置 / 本地开发 / 自定义部署。
 */

/** @type {string} */
export const PACKAGE_NAME = "cesium-clouds-atmosphere";

/** @type {string} */
export const PACKAGE_VERSION = "0.1.0";

/** @type {string} */
const JSDELIVR_BASE = `https://cdn.jsdelivr.net/npm/${PACKAGE_NAME}@${PACKAGE_VERSION}`;

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
 * @typedef {'cdn' | 'local' | 'custom'} AssetPathMode
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
 * @property {AssetPathMode} [mode='cdn'] - cdn：jsDelivr 零配置；local：仓库根目录相对路径；custom：自定义 base
 * @property {string} [base] - mode 为 custom 时的静态资源根路径，如 '/assets/cca'
 * @property {string} [version] - CDN 模式下的包版本，默认 PACKAGE_VERSION
 * @property {string} [cdnBase] - 完全自定义 CDN 根 URL（覆盖 jsDelivr 默认）
 */

/**
 * 解析运行时 fetch 所需的资源路径。
 *
 * @param {ResolveAssetPathsOptions} [options]
 * @returns {AssetPaths}
 */
export function resolveAssetPaths(options = {}) {
  const mode = options.mode ?? "cdn";

  if (mode === "local") {
    return {
      cloudsAssetsBase: DEFAULT_CLOUDS_ASSETS_BASE,
      brunetonShaderBase: DEFAULT_BRUNETON_SHADER_BASE,
      blueNoiseUrl: DEFAULT_BLUE_NOISE_URL,
      atmosphereAssetsBase: DEFAULT_ATMOSPHERE_ASSETS_BASE,
      atmosphereShaderBase: DEFAULT_ATMOSPHERE_SHADER_BASE,
    };
  }

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

  const cdnRoot = (options.cdnBase ?? JSDELIVR_BASE).replace(/\/+$/, "");
  return {
    cloudsAssetsBase: `${cdnRoot}/public/clouds-assets/`,
    brunetonShaderBase: `${cdnRoot}/src/AtmosphereFromThreeGeospatial/Shaders/bruneton/`,
    blueNoiseUrl: `${cdnRoot}/public/data/noisePic/noisergba256.png`,
    atmosphereAssetsBase: `${cdnRoot}/src/AtmosphereFromThreeGeospatial/assets/`,
    atmosphereShaderBase: `${cdnRoot}/src/AtmosphereFromThreeGeospatial/Shaders/`,
  };
}

/**
 * @deprecated 请使用 resolveAssetPaths({ mode: 'custom', base })
 * @param {string} [base='']
 * @returns {AssetPaths}
 */
export function getDefaultAssetPaths(base = "") {
  if (!base) return resolveAssetPaths({ mode: "local" });
  return resolveAssetPaths({ mode: "custom", base });
}
