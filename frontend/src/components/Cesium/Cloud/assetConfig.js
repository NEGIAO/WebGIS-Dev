/**
 * 体积云 / Bruneton 大气静态资源路径配置。
 * 资源位于 public/cloud-atmosphere/，随 Vite BASE_URL 部署。
 *
 * @module Cloud/assetConfig
 */

/**
 * 规范化 base 路径：保证以 / 结尾，兼容相对 './' 与绝对 '/'
 * @param {string} base
 * @returns {string}
 */
function withTrailingSlash(base) {
  if (!base) return '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * 解析 WebGIS 内嵌的云大气资源绝对路径。
 * @param {string} [baseUrl] - 通常为 import.meta.env.BASE_URL
 * @returns {{
 *   cloudsAssetsBase: string,
 *   brunetonShaderBase: string,
 *   blueNoiseUrl: string,
 *   atmosphereAssetsBase: string,
 *   atmosphereShaderBase: string,
 * }}
 */
export function resolveWebgisCloudAssetPaths(baseUrl) {
  const root = withTrailingSlash(baseUrl ?? (typeof import.meta !== 'undefined' ? import.meta.env?.BASE_URL : '/') ?? '/');
  const prefix = `${root}cloud-atmosphere/`;
  return {
    cloudsAssetsBase: `${prefix}clouds-assets/`,
    brunetonShaderBase: `${prefix}shaders/bruneton/`,
    blueNoiseUrl: `${prefix}noise/noisergba256.png`,
    atmosphereAssetsBase: `${prefix}assets/`,
    atmosphereShaderBase: `${prefix}shaders/`,
  };
}

import {
  applyCloudQualityPreset,
  DEFAULT_CLOUD_QUALITY,
} from './cloudQualityPresets.js';

/**
 * 默认面板参数。
 * 开启体积云时默认「流畅」档；总开关仍默认关闭。
 */
export function createDefaultCloudPanelParams() {
  return applyCloudQualityPreset(
    {
      cloudsEnabled: false,
      quality: DEFAULT_CLOUD_QUALITY,
    },
    DEFAULT_CLOUD_QUALITY,
  );
}
