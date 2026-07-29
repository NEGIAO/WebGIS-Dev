/**
 * 大气对体积云的对外接口说明与常量（与 three-geospatial 对齐）。
 * 体积云阶段应使用 AtmospherePostProcess.getAtmosphereForClouds() 获取本接口，并复用同一套 LUT 与参数。
 *
 * @example
 *   const atmosphere = new AtmospherePostProcess(viewer);
 *   await atmosphere.init();
 *   const provider = atmosphere.getAtmosphereForClouds();
 *   // 纹理：供体积云着色器 sampler 绑定
 *   const { transmittanceTexture, scatteringTexture, irradianceTexture,
 *           singleMieScatteringTexture, higherOrderScatteringTexture } = provider.textures;
 *   // 展平 ATMOSPHERE + 动态 uniform：直接作为 Cesium PostProcessStage 的 uniforms 使用
 *   const uniforms = provider.getUniforms();
 *   // 常量与编译选项
 *   const { METER_TO_LENGTH_UNIT, precomputeConstants, getShaderDefines } = provider.constants;
 *   const fragmentSource = getShaderDefines() + '\n' + yourCloudFragSource;
 */

/** 与 three-geospatial METER_TO_LENGTH_UNIT 一致（km） */
export const METER_TO_LENGTH_UNIT = 0.001;

/**
 * 体积云着色器所需的大气 uniform 名称（与 three-geospatial clouds 一致）：
 * - ATMOSPHERE.*（展平）：ATMOSPHERE.bottom_radius, ATMOSPHERE.top_radius, ATMOSPHERE.solar_irradiance 等
 * - transmittance_texture, scattering_texture, irradiance_texture
 * - single_mie_scattering_texture, higher_order_scattering_texture（可为 null）
 * - SUN_SPECTRAL_RADIANCE_TO_LUMINANCE, SKY_SPECTRAL_RADIANCE_TO_LUMINANCE
 * - sunDirection, cameraPosition（每帧更新；cameraPosition 为 ECEF 米）
 * - bottomRadius, topRadius（米）
 * - worldToECEFMatrix, ecefToWorldMatrix, altitudeCorrection
 *
 * 此外 provider.constants 还暴露：
 * - precomputeConstants: 预计算纹理尺寸等，include bruneton 时需用相同 #define
 * - getShaderDefines(): 返回 bruneton 所需的 #define 字符串，用于拼接体积云 fragmentShader
 */

export { METER_TO_LENGTH_UNIT as CLOUD_ATMOSPHERE_METER_TO_LENGTH_UNIT };
