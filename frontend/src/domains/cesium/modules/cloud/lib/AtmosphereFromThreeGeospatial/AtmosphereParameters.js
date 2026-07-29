/**
 * 大气参数（对应 three-geospatial AtmosphereParameters）
 * 地球半径、大气高度等与 AtmosphereBrunetonProcess.js 保持一致
 * 并包含预计算管线所需的常量、luminanceFromRadiance、OUTPUT 等，供传出着色器使用。
 */

const METER_TO_LENGTH_UNIT = 1 / 1000;
export { METER_TO_LENGTH_UNIT };

// ========== 预计算常量（与 three-geospatial constants.ts 一致，用于 #define 或创建 RT） ==========
export const PRECOMPUTE_CONSTANTS = {
  TRANSMITTANCE_TEXTURE_WIDTH: 256,
  TRANSMITTANCE_TEXTURE_HEIGHT: 64,
  SCATTERING_TEXTURE_R_SIZE: 32,
  SCATTERING_TEXTURE_MU_SIZE: 128,
  SCATTERING_TEXTURE_MU_S_SIZE: 32,
  SCATTERING_TEXTURE_NU_SIZE: 8,
  SCATTERING_TEXTURE_WIDTH: 8 * 32,   // NU * MU_S = 256
  SCATTERING_TEXTURE_HEIGHT: 128,
  SCATTERING_TEXTURE_DEPTH: 32,
  IRRADIANCE_TEXTURE_WIDTH: 64,
  IRRADIANCE_TEXTURE_HEIGHT: 16,
  METER_TO_LENGTH_UNIT: 1 / 1000,
};

// 预计算着色器编译时的 #define 字符串（可用于拼接 fragmentShader）
export function getPrecomputeDefines(options = {}) {
  const {
    useHalfFloat = false,
    output = null,
  } = options;
  const c = PRECOMPUTE_CONSTANTS;
  const defines = [
    `#define TRANSMITTANCE_TEXTURE_WIDTH ${c.TRANSMITTANCE_TEXTURE_WIDTH}`,
    `#define TRANSMITTANCE_TEXTURE_HEIGHT ${c.TRANSMITTANCE_TEXTURE_HEIGHT}`,
    `#define SCATTERING_TEXTURE_R_SIZE ${c.SCATTERING_TEXTURE_R_SIZE}`,
    `#define SCATTERING_TEXTURE_MU_SIZE ${c.SCATTERING_TEXTURE_MU_SIZE}`,
    `#define SCATTERING_TEXTURE_MU_S_SIZE ${c.SCATTERING_TEXTURE_MU_S_SIZE}`,
    `#define SCATTERING_TEXTURE_NU_SIZE ${c.SCATTERING_TEXTURE_NU_SIZE}`,
    `#define IRRADIANCE_TEXTURE_WIDTH ${c.IRRADIANCE_TEXTURE_WIDTH}`,
    `#define IRRADIANCE_TEXTURE_HEIGHT ${c.IRRADIANCE_TEXTURE_HEIGHT}`,
  ];
  if (useHalfFloat) {
    defines.push('#define TRANSMITTANCE_PRECISION_LOG 1');
  }
  if (output != null) {
    defines.push(`#define OUTPUT ${output}`);
  }
  return defines.join('\n');
}

/**
 * 将 ATMOSPHERE struct 展平为 Cesium 可设置的 uniform 键名。
 * 例如：
 * - ATMOSPHERE.bottom_radius
 * - ATMOSPHERE.rayleigh_density.layers[0].width
 * - ATMOSPHERE.rayleigh_scattering
 *
 * 注意：Cesium 的 uniformMap 无法直接给 `uniform AtmosphereParameters ATMOSPHERE;`
 * 传一个 JS 对象，必须逐字段设置。
 */
export function flattenAtmosphereUniform(atmosphereUniform) {
  const out = {};
  for (const [key, value] of Object.entries(atmosphereUniform)) {
    if (Array.isArray(value)) {
      out[`ATMOSPHERE.${key}`] = value;
    } else if (value && typeof value === "object" && value.layers) {
      value.layers.forEach((layer, i) => {
        for (const [k, v] of Object.entries(layer)) {
          out[`ATMOSPHERE.${key}.layers[${i}].${k}`] = v;
        }
      });
    } else {
      out[`ATMOSPHERE.${key}`] = value;
    }
  }
  return out;
}

// ========== 预计算：辐射 -> 亮度矩阵（mat3，列主序，与 three 一致用单位矩阵） ==========
/** 3x3 单位矩阵，列主序 [m0,m1,m2, m3,m4,m5, m6,m7,m8]，供 Cesium uniform mat3 使用 */
export const LUMINANCE_FROM_RADIANCE_IDENTITY = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

/** 预计算用的波长 (nm)，three 中为 [680, 550, 440]，建非单位矩阵时可用 */
export const PRECOMPUTE_LAMBDAS = [680, 550, 440];

// ========== 预计算：各 Pass 的 OUTPUT 取值（用于 #define OUTPUT） ==========
export const PRECOMPUTE_OUTPUT = {
  // directIrradiance.frag
  directIrradiance: {
    deltaIrradiance: 'deltaIrradiance',
    irradiance: 'irradiance',
  },
  // singleScattering.frag
  singleScattering: {
    deltaRayleigh: 'deltaRayleigh',
    deltaMie: 'deltaMie',
    scattering: 'scattering',
    singleMieScattering: 'singleMieScattering',
  },
  // indirectIrradiance.frag
  indirectIrradiance: {
    deltaIrradiance: 'deltaIrradiance',
    irradiance: 'irradiance',
  },
  // multipleScattering.frag
  multipleScattering: {
    deltaMultipleScattering: 'deltaMultipleScattering',
    scattering: 'scattering',
  },
};

// 散射阶数（Scattering Density / Indirect Irradiance 用）
export const PRECOMPUTE_SCATTERING_ORDERS = [2, 3, 4];

/** 各预计算 Pass 需要的 uniform 名称（不含纹理；纹理由上一步 RT 或 Context 提供） */
export const PRECOMPUTE_PASS_UNIFORMS = {
  transmittance: ['ATMOSPHERE'],
  directIrradiance: ['ATMOSPHERE', 'transmittanceTexture'],
  singleScattering: ['ATMOSPHERE', 'luminanceFromRadiance', 'transmittanceTexture', 'layer'],
  scatteringDensity: ['ATMOSPHERE', 'transmittanceTexture', 'singleRayleighScatteringTexture', 'singleMieScatteringTexture', 'multipleScatteringTexture', 'irradianceTexture', 'scatteringOrder', 'layer'],
  indirectIrradiance: ['ATMOSPHERE', 'luminanceFromRadiance', 'singleRayleighScatteringTexture', 'singleMieScatteringTexture', 'multipleScatteringTexture', 'scatteringOrder'],
  multipleScattering: ['ATMOSPHERE', 'luminanceFromRadiance', 'transmittanceTexture', 'scatteringDensityTexture', 'layer'],
};

// 弧度
function radians(deg) {
  return (deg * Math.PI) / 180;
}

// 亮度系数 (sRGB 权重)
const LUMINANCE_COEFFS = [0.2126, 0.7152, 0.0722];
function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * 密度剖面的一层：密度 = expTerm*exp(expScale*h) + linearTerm*h + constantTerm，再 clamp 到 [0,1]
 * @param {number} width - 层厚度 (km)
 * @param {number} expTerm
 * @param {number} expScale
 * @param {number} linearTerm
 * @param {number} constantTerm
 */
export function DensityProfileLayer(width, expTerm, expScale, linearTerm, constantTerm) {
  this.width = width;
  this.expTerm = expTerm;
  this.expScale = expScale;
  this.linearTerm = linearTerm;
  this.constantTerm = constantTerm;
}

DensityProfileLayer.prototype.toUniform = function () {
  return {
    width: this.width,
    exp_term: this.expTerm,
    exp_scale: this.expScale,
    linear_term: this.linearTerm,
    constant_term: this.constantTerm,
  };
};

/**
 * 大气参数（与 AtmosphereBrunetonProcess 中几何与散射系数对齐）
 */
export function AtmosphereParameters() {

  // ----- 来自 AtmosphereBrunetonProcess.js 的几何与物理量 -----
  // 地球半径、大气顶半径 (m)
  //!!!!!!!!!!!!!!!!这里记住了，务必要用gui去调整bottomRadius，让他和cesium地球的半径真正相同
  //调整的部署设置为10米，妈的我就不信不能和ceisum地球半径一样大
  this.bottomRadius = 6371030//6374000; //就他妈是这个高度，不改了，比6371910小就行了
  this.topRadius = 6420000;
  // 太阳角半径 (rad)
  this.sunAngularRadius = 0.004675;

  // 大气顶太阳辐照度 (RGB)
  this.solarIrradiance = [1.474, 1.8504, 1.91198];

  // 瑞利密度剖面：指数衰减 (标准大气，scale height 约 8.5km 对应 -0.125)
  this.rayleighDensity = [
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -0.125, 0, 0),
  ];

  // 瑞利散射系数 (与 AtmosphereBrunetonProcess 一致，单位 1/km 在 toUniform 里不乘 1e-3，GLSL 里用 length unit)
  this.rayleighScattering = [0.005802, 0.013558, 0.0331];

  // 米氏密度剖面
  this.mieDensity = [
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -0.833333, 0, 0),
  ];

  this.mieScattering = [0.003996, 0.003996, 0.003996];
  this.mieExtinction = [0.00444, 0.00444, 0.00444];
  this.miePhaseFunctionG = 0.8;

  // 吸收（臭氧）密度剖面：线性层
  this.absorptionDensity = [
    new DensityProfileLayer(25, 0, 0, 1 / 15, -2 / 3),
    new DensityProfileLayer(0, 0, 0, -1 / 15, 8 / 3),
  ];
  this.absorptionExtinction = [0.00065, 0.001881, 0.000085];

  // 地面反照率 (RGB)
  this.groundAlbedo = [0.1, 0.1, 0.1];

  // 预计算太阳天顶角范围：120° 对应 mu_s_min
  this.muSMin = Math.cos(radians(120));

  // 辐射 -> 亮度转换系数（与 three-geospatial 默认一致）
  this.sunRadianceToLuminance = [98242.786222, 69954.398112, 66475.012354];
  this.skyRadianceToLuminance = [114974.916437, 71305.954816, 65310.548555];

  const sunLum = this.sunRadianceToLuminance;
  const luminance = dot3(LUMINANCE_COEFFS, sunLum);
  this.sunRadianceToRelativeLuminance = sunLum.map((c) => c / luminance);
  this.skyRadianceToRelativeLuminance = this.skyRadianceToLuminance.map((c) => c / luminance);
}

/**
 * 转为着色器 uniform 用的对象（snake_case，与 GLSL AtmosphereParameters 一致）
 * 长度单位已乘 METER_TO_LENGTH_UNIT（km）
 */
AtmosphereParameters.prototype.toUniform = function () {
  return {
    solar_irradiance: this.solarIrradiance,
    sun_angular_radius: this.sunAngularRadius,
    bottom_radius: this.bottomRadius * METER_TO_LENGTH_UNIT,
    top_radius: this.topRadius * METER_TO_LENGTH_UNIT,
    rayleigh_density: {
      layers: this.rayleighDensity.map((layer) => layer.toUniform()),
    },
    rayleigh_scattering: this.rayleighScattering,
    mie_density: {
      layers: this.mieDensity.map((layer) => layer.toUniform()),
    },
    mie_scattering: this.mieScattering,
    mie_extinction: this.mieExtinction,
    mie_phase_function_g: this.miePhaseFunctionG,
    absorption_density: {
      layers: this.absorptionDensity.map((layer) => layer.toUniform()),
    },
    absorption_extinction: this.absorptionExtinction,
    ground_albedo: this.groundAlbedo,
    mu_s_min: this.muSMin,
  };
};

