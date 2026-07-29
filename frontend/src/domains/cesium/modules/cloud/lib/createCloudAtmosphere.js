import { ThreeGeospatialPipeline } from "./ThreeGeospatialPipeline.js";
import { AtmosphereParameters } from "./AtmosphereFromThreeGeospatial/AtmosphereParameters.js";
import { resolveAssetPaths } from "./assetPaths.js";

/**
 * 一行创建并初始化体积云 + 大气管线（推荐入口）。
 *
 * WebGIS 集成：调用方应直接传入 cloudsAssetsBase 等路径（见 assetConfig.js），
 * 此时不会走 jsDelivr CDN。
 *
 * @param {import('cesium').Viewer} viewer
 * @param {object} [options] - 透传给 ThreeGeospatialPipeline，额外支持：
 * @param {import('./assetPaths.js').ResolveAssetPathsOptions} [options.assets] - 资源路径模式（cdn/local/custom）
 * @param {AtmosphereParameters} [options.atmosphereParams]
 * @param {boolean} [options.enableGui=false] - 是否创建 dat.gui（WebGIS 默认关闭）
 * @returns {Promise<ThreeGeospatialPipeline>}
 */
export async function createCloudAtmosphere(viewer, options = {}) {
  const { assets: assetOptions, atmosphereParams, ...pipelineOptions } = options;

  // 若调用方已显式传入路径字段，则不再用 resolveAssetPaths 覆盖
  const hasExplicitPaths =
    pipelineOptions.cloudsAssetsBase ||
    pipelineOptions.atmosphereAssetsBase ||
    pipelineOptions.brunetonShaderBase;

  const paths = hasExplicitPaths
    ? {}
    : resolveAssetPaths(assetOptions ?? { mode: "cdn" });

  const pipeline = new ThreeGeospatialPipeline(viewer, {
    atmosphereParams: atmosphereParams ?? new AtmosphereParameters(),
    enableGui: false,
    ...paths,
    ...pipelineOptions,
  });

  await pipeline.init();
  return pipeline;
}
