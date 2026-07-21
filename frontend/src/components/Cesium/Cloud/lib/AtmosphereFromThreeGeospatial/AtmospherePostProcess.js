/**
 * 在 Cesium 中复刻 three-geospatial 大气渲染：从静态 LUT（.bin）加载 + 运行时天空着色。
 * 使用 PostProcessStage 展示 Bruneton 预计算大气（天空 + 太阳圆盘 + 与场景合成）。
 */

import { AtmosphereParameters,PRECOMPUTE_CONSTANTS,getPrecomputeDefines } from './AtmosphereParameters.js';
import { loadPrecomputedTextures } from './PrecomputedTexturesLoader.js';
import { loadShaderSource } from '../shaderLoader.js';
import { getCesium } from "../getCesium.js";
/* eslint-disable @typescript-eslint/no-this-alias */
const Cesium = getCesium();
// dat.gui 为可选依赖：WebGIS 默认关闭（enableGui=false），由工具面板调参
/** 本地 .bin 资源目录默认值（相对宿主页面 base）；可通过构造 options.assetsBaseUrl 覆盖 */
const LOCAL_ASSETS_BASE = './src/AtmosphereFromThreeGeospatial/assets/';

/** 将 ATMOSPHERE 嵌套 uniform 展平为 Cesium 可用的键名（如 ATMOSPHERE.solar_irradiance, ATMOSPHERE.rayleigh_density.layers[0].width） */
function flattenAtmosphereUniform(atmosphereUniform) {
  const out = {};
  for (const [key, value] of Object.entries(atmosphereUniform)) {
    if (Array.isArray(value)) {
      out[`ATMOSPHERE.${key}`] = value;
    } else if (value && typeof value === 'object' && !('length' in value) && value.layers) {
      value.layers.forEach((layer, i) => {
        for (const [k, v] of Object.entries(layer)) {
          out[`ATMOSPHERE.${key}.layers[${i}].${k}`] = v;
        }
      });
    } else if (typeof value === 'number') {
      out[`ATMOSPHERE.${key}`] = value;
    } else {
      out[`ATMOSPHERE.${key}`] = value;
    }
  }
  return out;
}

function buildSkyFragmentSource(definitionsSource, commonSource, runtimeSource, skySource) {
  const c = PRECOMPUTE_CONSTANTS;
  const precisionHeader = `
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
`;
  const defines = [
    '#define COMBINED_SCATTERING_TEXTURES',
    // Cesium 相机是透视为主，这里直接开启以复刻 SkyMaterial 的太阳/月亮抗锯齿逻辑
    '#define PERSPECTIVE_CAMERA',
    '#define SUN',
    `#define SCATTERING_TEXTURE_R_SIZE ${c.SCATTERING_TEXTURE_R_SIZE}`,
    `#define SCATTERING_TEXTURE_MU_SIZE ${c.SCATTERING_TEXTURE_MU_SIZE}`,
    `#define SCATTERING_TEXTURE_MU_S_SIZE ${c.SCATTERING_TEXTURE_MU_S_SIZE}`,
    `#define SCATTERING_TEXTURE_NU_SIZE ${c.SCATTERING_TEXTURE_NU_SIZE}`,
    `#define TRANSMITTANCE_TEXTURE_WIDTH ${c.TRANSMITTANCE_TEXTURE_WIDTH}`,
    `#define TRANSMITTANCE_TEXTURE_HEIGHT ${c.TRANSMITTANCE_TEXTURE_HEIGHT}`,
    `#define IRRADIANCE_TEXTURE_WIDTH ${c.IRRADIANCE_TEXTURE_WIDTH}`,
    `#define IRRADIANCE_TEXTURE_HEIGHT ${c.IRRADIANCE_TEXTURE_HEIGHT}`,
  ].join('\n');

  const globalUniformsForRuntime = `
uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler2D irradiance_texture;
`;

  const mainBlock = `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
in vec2 v_textureCoordinates;
uniform vec3 u_cameraPosition;
uniform vec3 u_altitudeCorrection;
uniform vec3 u_sunDirection;
uniform vec3 u_groundAlbedo;
// 每像素对应的角度（弧度），用于太阳边缘抗锯齿；当 dFdx 不可用时作为 fallback（与 three-geospatial PERSPECTIVE_CAMERA 一致）
uniform float u_sunPixelAngle;
// 线性曝光（在 ACES 之前）；OETF 仅在后接 AerialPerspectiveEffect 做一次
uniform float u_atmosphereExposure;

// Cloud shadow (BSM) - Cesium 仅支持 sampler2D，使用 2×2 图集（每 cascade 一 tile）
uniform sampler2D u_cloudShadowBuffer;
uniform float u_cloudShadowScale;
uniform vec4 u_cloudShadowDecode;
uniform int u_cloudShadowEnabled;
uniform mat4 u_cloudShadowMatrices[4];
uniform vec2 u_cloudShadowIntervals[4];
uniform float u_cloudShadowNear;
uniform float u_cloudShadowFar;
uniform float u_cloudShadowTopHeight;
uniform float u_cloudShadowBottomRadius;
uniform vec2 u_cloudShadowTexelSize;
uniform float u_geometricErrorCorrectionAmount;
// three-geospatial 对齐：直接消费 shadowLengthBuffer（长度单位与大气 length unit 一致，当前为 km）
uniform sampler2D u_shadowLengthBuffer;
uniform int u_shadowLengthEnabled;
uniform float u_shadowLengthScale;
uniform int u_debugTyndall;
// 为 0 时几何像素不透传 Bruneton 地面项（只做天空），避免与 AerialPerspectiveEffect 双重叠加导致过曝/死黑/晨昏线色偏
uniform int u_applyGroundAtmosphere;
// 丁达尔光柱强度：对 shadow length 的缩放，>1 时阴影更明显（光柱更暗）
uniform float u_tyndallScale;
// BSM 光学厚度缩放：用于丁达尔/光柱（仅影响 shadowLength）
uniform float u_bsmTyndallOpticalDepthScale;
// BSM 光学厚度缩放：用于地面太阳遮光（仅影响地面变暗）
uniform float u_bsmGroundOpticalDepthScale;
uniform int u_renderSky;

const float MAX_FLOAT = 1e20;

// 2×2 图集：cascade 0=左上, 1=右上, 2=左下, 3=右下
vec2 getCloudShadowAtlasOffset(int ci) {
  float x = mod(float(ci), 2.0) * 0.5;
  float y = (ci < 2) ? 0.5 : 0.0;
  return vec2(x, y);
}

// Cesium 的矩阵/深度距离单位是“米”，而 Bruneton/LUT 这套在本工程中使用“千米”(lengthUnit=km)。
// ACES + gamma 改由 AerialPerspectiveEffect 在链路末端统一处理（避免与天空 pass 重复 OETF）。
const float METER_TO_LENGTH_UNIT = 0.001;


float raySphereFirstIntersection(const vec3 ro, const vec3 rd, const float radius) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float disc = b * b - c;
  if (disc <= 0.0) return -1.0;
  float t = -b - sqrt(disc);
  return t;
}

float readBSMOpticalDepth(vec3 posMeters) {
  float scale = max(u_cloudShadowScale, 1e-6);
  for (int ci = 0; ci < 4; ci++) {
    vec4 clip = u_cloudShadowMatrices[ci] * vec4(posMeters, 1.0);
    clip /= clip.w;
    vec2 uv = clip.xy * 0.5 + 0.5;
    if (uv.x < 0.01 || uv.x > 0.99 || uv.y < 0.01 || uv.y > 0.99) continue;
    vec2 atlasUv = getCloudShadowAtlasOffset(ci) + uv * 0.5;
    vec4 shadow = (texture(u_cloudShadowBuffer, atlasUv) / scale) * u_cloudShadowDecode;
    return shadow.b * max(u_bsmTyndallOpticalDepthScale, 0.0);
  }
  return 0.0;
}

float saturateAP(float x) { return clamp(x, 0.0, 1.0); }

float viewZToOrthographicDepth(float viewZ, float near, float far) {
  return (viewZ + near) / (near - far);
}

int getFadedCascadeIndex(mat4 viewMat, vec3 worldPos, vec2 intervals[4], float near, float far, float jitter) {
  vec4 vp = viewMat * vec4(worldPos, 1.0);
  float depth = viewZToOrthographicDepth(vp.z, near, far);
  int nextIndex = -1;
  int prevIndex = -1;
  float alpha = 1.0;
  for (int i = 0; i < 4; ++i) {
    vec2 interval = intervals[i];
    float intervalCenter = (interval.x + interval.y) * 0.5;
    float closestEdge = depth < intervalCenter ? interval.x : interval.y;
    float margin = closestEdge * closestEdge * 0.5;
    interval += margin * vec2(-0.5, 0.5);
    if (i < 3) {
      if (depth >= interval.x && depth < interval.y) {
        prevIndex = nextIndex;
        nextIndex = i;
        alpha = saturateAP(min(depth - interval.x, interval.y - depth) / max(margin, 1e-6));
      }
    } else {
      if (depth >= interval.x) {
        prevIndex = nextIndex;
        nextIndex = i;
        alpha = saturateAP((depth - interval.x) / max(margin, 1e-6));
      }
    }
  }
  return jitter <= alpha ? nextIndex : prevIndex;
}

vec2 getShadowUvGround(vec3 worldPos, int ci) {
  vec4 clip = u_cloudShadowMatrices[ci] * vec4(worldPos, 1.0);
  clip /= clip.w;
  return clip.xy * 0.5 + 0.5;
}

float interleavedGradientNoiseAP(vec2 coord) {
  const vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(coord, magic.xy)));
}

vec2 vogelDiskAP(int index, int count, float phi) {
  const float goldenAngle = 2.39996322972865332;
  float r = sqrt(float(index) + 0.5) / sqrt(float(count));
  float theta = float(index) * goldenAngle + phi;
  return r * vec2(cos(theta), sin(theta));
}

float readShadowOpticalDepthGround(vec2 uv, int ci, float distToTop) {
  float scale = max(u_cloudShadowScale, 1e-6);
  vec2 atlasUv = getCloudShadowAtlasOffset(ci) + uv * 0.5;
  vec4 shadow = (texture(u_cloudShadowBuffer, atlasUv) / scale) * u_cloudShadowDecode;
  float od = min(shadow.b, shadow.g * max(0.0, distToTop - shadow.r));
  return od * max(u_bsmGroundOpticalDepthScale, 0.0);
}

float sampleShadowOpticalDepthPCFGround(vec3 worldPos, float distToTop, float radius, int ci) {
  vec2 uv = getShadowUvGround(worldPos, ci);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  vec2 texel = max(u_cloudShadowTexelSize, vec2(1e-4));
  if (radius < 0.1) return readShadowOpticalDepthGround(uv, ci, distToTop);
  float sum = 0.0;
  float phi = interleavedGradientNoiseAP(gl_FragCoord.xy) * 6.28318530718;
  for (int i = 0; i < 16; ++i) {
    sum += readShadowOpticalDepthGround(uv + vogelDiskAP(i, 16, phi) * radius * texel, ci, distToTop);
  }
  return sum / 16.0;
}

vec3 correctBsmPosition(vec3 posMeters, float amount) {
  if (amount <= 0.0) return posMeters;
  vec3 sphereNormal = normalize(posMeters);
  vec3 spherePosition = u_cloudShadowBottomRadius * sphereNormal;
  return mix(posMeters, spherePosition, saturateAP(amount));
}

vec3 stabilizeBsmSamplePosition(vec3 posMeters, float viewDistMeters) {
  float geoAmt = max(u_geometricErrorCorrectionAmount, 0.0);
  float distAmt = smoothstep(8000.0, 50000.0, viewDistMeters);
  float amount = saturateAP(max(geoAmt, distAmt));
  vec3 corrected = correctBsmPosition(posMeters, amount);
  if (amount < 0.01) return corrected;
  vec3 n = normalize(corrected);
  float h = length(posMeters) - u_cloudShadowBottomRadius;
  float stableH = mix(h, max(h, 0.0) * (1.0 - 0.85 * amount), amount);
  return n * (u_cloudShadowBottomRadius + stableH);
}

float getGroundSunTransmittance(vec3 rawWorldPosMeters) {
  if (u_cloudShadowEnabled == 0) return 1.0;
  vec3 camMeters = (u_cameraPosition + u_altitudeCorrection) / METER_TO_LENGTH_UNIT;
  float viewDist = length(rawWorldPosMeters - camMeters);
  vec3 samplePos = stabilizeBsmSamplePosition(rawWorldPosMeters, viewDist);

  vec3 groundNormal = normalize(samplePos);
  float sunSinElev = dot(u_sunDirection, groundNormal);
  float horizonFade = smoothstep(-0.02, 0.02, sunSinElev);
  if (horizonFade <= 0.0) return 1.0;

  float topShellR = u_cloudShadowBottomRadius + u_cloudShadowTopHeight;
  vec3 rd = u_sunDirection;
  float bS = dot(rd, samplePos);
  float cS = dot(samplePos, samplePos) - topShellR * topShellR;
  float discS = bS * bS - cS;
  if (discS <= 0.0) return 1.0;
  float distToShadowTop = -bS + sqrt(discS);
  if (distToShadowTop <= 0.0) return 1.0;

  float lowSunFade = smoothstep(0.0, 0.087, sunSinElev);
  float rayLenFade = 1.0 - smoothstep(u_cloudShadowTopHeight * 6.0,
                                       u_cloudShadowTopHeight * 20.0,
                                       distToShadowTop);
  float fade = horizonFade * lowSunFade * rayLenFade;
  if (fade <= 0.0) return 1.0;

  float jitter = interleavedGradientNoiseAP(gl_FragCoord.xy);
  float near = max(u_cloudShadowNear, 1e-3);
  float far = max(u_cloudShadowFar, near + 1.0);
  int ci = getFadedCascadeIndex(czm_view, samplePos, u_cloudShadowIntervals, near, far, jitter);
  if (ci < 0) return 1.0;

  float pcfRadius = mix(1.5, 3.0, saturateAP(viewDist / max(far, 1.0)));
  float opticalDepth = sampleShadowOpticalDepthPCFGround(samplePos, distToShadowTop, pcfRadius, ci);
  float shade = exp(-opticalDepth);
  return mix(1.0, shade, fade);
}

float marchShadowLengthAtm(vec3 cameraKm, vec3 rd, float tNear, float tFar) {
  if (u_cloudShadowEnabled == 0) return 0.0;
  float maxDist = tFar - tNear;
  if (maxDist <= 0.0) return 0.0;
  const int STEPS = 64;
  float stepSize = maxDist / float(STEPS);
  float shadowLen = 0.0;
  float attenuation = 1.0;
  for (int i = 0; i < STEPS; i++) {
    float t = tNear + (float(i) + 0.5) * stepSize;
    vec3 posKm = cameraKm + rd * t;
    vec3 posMeters = posKm / METER_TO_LENGTH_UNIT;
    float opticalDepth = readBSMOpticalDepth(posMeters);
    shadowLen += (1.0 - exp(-opticalDepth)) * stepSize * attenuation;
    attenuation *= 0.9995;
  }
  return (shadowLen / METER_TO_LENGTH_UNIT) * max(u_tyndallScale, 0.0);
}

float readShadowLengthBuffer(vec2 uv) {
  if (u_shadowLengthEnabled == 0) return 0.0;
  // 约定：buffer 中存储的就是 Bruneton 所需的 shadowLength（length unit, km）
  // scale 用于可选的编码/解码缩放（默认 1.0）
  return max(texture(u_shadowLengthBuffer, uv).r, 0.0) * max(u_shadowLengthScale, 0.0);
}

void reconstructRay(out vec3 ro, out vec3 rd) {
  ro = u_cameraPosition + u_altitudeCorrection;
  vec2 uv = v_textureCoordinates * 2.0 - 1.0;
  vec4 clipPos = vec4(uv, 1.0, 1.0);
  vec4 viewPos = czm_inverseProjection * clipPos;
  viewPos /= viewPos.w;
  vec4 worldPos4 = czm_inverseView * viewPos;
  vec3 worldPos = worldPos4.xyz * METER_TO_LENGTH_UNIT + u_altitudeCorrection;
  rd = normalize(worldPos - ro);
}

// 与 Shaders/aerialPerspectiveEffect.frag 一致：前向半直线与球的交点判定
bool rayForwardHitsSphereAP(vec3 o, vec3 d, float R) {
  float b = dot(o, d);
  float c = dot(o, o) - R * R;
  float disc = b * b - c;
  if (disc < 0.0) {
    return false;
  }
  float s = sqrt(disc);
  float t0 = -b - s;
  float t1 = -b + s;
  return (t0 > 1e-6) || (t1 > 1e-6);
}

bool cameraInAtmosphereShellAP(vec3 o, float bottomR, float topR) {
  float r = length(o);
  return r > bottomR + 1e-5 && r < topR - 1e-5;
}

void main() {
  vec4 originalColor = texture(colorTexture, v_textureCoordinates);
  float depth = czm_readDepth(depthTexture, v_textureCoordinates);

  vec3 cameraPosition = u_cameraPosition;
  vec3 rayDirection;
  reconstructRay(cameraPosition, rayDirection);
  rayDirection = normalize(rayDirection);

  // Reconstruct raw ECEF world position from depth buffer
  vec3 rawWorldPosMeters = vec3(0.0);
  float sceneDist = MAX_FLOAT;
  // 基于 eye-space 重建来判定是否命中几何，避免远距 depth 阈值误判
  bool hasScene = false;
  if (depth < 1.0 - 1e-8) {
    vec4 eyePos = czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy, depth, 1.0));
    if (abs(eyePos.w) > 1e-6) {
      eyePos /= eyePos.w;
      // 掠射/天际附近 eyePos.z 在 0 附近抖动 → hasScene 帧间跳变 → isSky 与透传黑底交替闪烁；略收严
      if (eyePos.z < -1e-4) {
        hasScene = true;
        vec4 worldPos4 = czm_inverseView * eyePos;
        rawWorldPosMeters = worldPos4.xyz;
        vec3 sceneWorldPosKm = rawWorldPosMeters * METER_TO_LENGTH_UNIT + u_altitudeCorrection;
        sceneDist = length(sceneWorldPosKm - cameraPosition);
      }
    }
  }

  float bottomRadius = ATMOSPHERE.bottom_radius;
  float topRadius = ATMOSPHERE.top_radius;
  float camR = length(cameraPosition);

  // —— 天空/地面：与 aerialPerspectiveEffect.frag 对齐（几何 + 放宽深度带），减轻天际线 log-depth 闪烁
  bool hitBottom = rayForwardHitsSphereAP(cameraPosition, rayDirection, bottomRadius);
  bool hitTop = rayForwardHitsSphereAP(cameraPosition, rayDirection, topRadius);
  bool inShell = cameraInAtmosphereShellAP(cameraPosition, bottomRadius, topRadius);
  vec3 radialOut = normalize(cameraPosition);
  float muLook = dot(rayDirection, radialOut);

  const float AP_DEPTH_SKY_EPS = 1e-4;
  bool hasSceneDepth = depth < 1.0 - AP_DEPTH_SKY_EPS;

  // 宽带 0.014：与 log-depth 抖动折中。skyOverride 仅用于「真·净空 + 明显仰视」时压制误报的 hasScene，避免闪黑。
  // 过宽的 depth（原 1-5e-4）+ 小 mu 会在仰视山坡/远山时把地形当净空 → 大气盖在地形前；过一会深度稳定后又恢复。
  const float MU_EXPLICIT_GROUND = -0.01;
  const float SHELL_SKY_DEPTH_SLOP = 0.0005;
  const float SKY_OVERRIDE_MU = 0.075;
  const float SKY_OVERRIDE_DEPTH = 1.0 - 8e-6;
  bool explicitGround = hitBottom || (hasSceneDepth && muLook < MU_EXPLICIT_GROUND);
  bool cameraOutsideAtmosphere = camR > topRadius + 1e-5;
  bool forceGroundFromDepth = hasSceneDepth && cameraOutsideAtmosphere;
  bool passOriginalSpace = (muLook > 1e-5) && !hitTop;

  bool depthLikelySky = depth >= 1.0 - SHELL_SKY_DEPTH_SLOP;
  bool skyOverrideFromView =
    (muLook > SKY_OVERRIDE_MU) &&
    (depth >= SKY_OVERRIDE_DEPTH) &&
    depthLikelySky &&
    !explicitGround;

  bool isSky = false;
  if (inShell) {
    if (hasScene && !skyOverrideFromView) {
      isSky = false;
    } else {
      isSky = depthLikelySky && !explicitGround;
    }
  } else if (cameraOutsideAtmosphere) {
    if (forceGroundFromDepth) {
      isSky = false;
    } else if (passOriginalSpace) {
      isSky = true;
    } else {
      isSky = !hitBottom;
    }
  } else {
    isSky = false;
  }

  // 天际线黑带：壳层内 applyGroundAtmosphere=0 时 isSky=false 会透传 originalColor；掠射带 hasScene/深度抖动使误判为几何，
  // 而主缓冲该处常为未着色黑 → 一条黑带。仅在「宽带仍像天空 + 原色极暗 + 视线未朝脚下」时拉回天空，避免压暗色地形。
  if (inShell && u_applyGroundAtmosphere == 0) {
    float lum = dot(originalColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    if (!isSky && lum < 0.04 && depthLikelySky && !explicitGround && depth >= 1.0 - 0.01 && muLook > -0.14) {
      isSky = true;
    }
  }

  // 地面分支仍依赖 depth 重建；若几何上已判地面但深度未重建出 hit，用 bottom 球前向交点兜底（同 aerial）
  if (!isSky && !hasScene && hitBottom) {
    float bG = dot(cameraPosition, rayDirection);
    float cG = dot(cameraPosition, cameraPosition) - bottomRadius * bottomRadius;
    float discG = bG * bG - cG;
    if (discG > 0.0) {
      float sG = sqrt(discG);
      float tHitG = -bG - sG;
      if (tHitG <= 1e-6) {
        tHitG = -bG + sG;
      }
      if (tHitG > 1e-6) {
        hasScene = true;
        vec3 sceneKmG = cameraPosition + rayDirection * tHitG;
        rawWorldPosMeters = sceneKmG / METER_TO_LENGTH_UNIT;
        sceneDist = tHitG;
      }
    }
  }

  float b = dot(cameraPosition, rayDirection);
  float c = dot(cameraPosition, cameraPosition) - topRadius * topRadius;
  float disc = b * b - c;
  float tMax = MAX_FLOAT;
  float tEnterTop = 0.0;
  if (disc > 0.0) {
    float s = sqrt(disc);
    float t0 = -b - s;
    float t1 = -b + s;
    tEnterTop = (t0 > 0.0) ? t0 : max(t1, 0.0);
    tMax = max(t1, 0.0);
  }
  c = dot(cameraPosition, cameraPosition) - bottomRadius * bottomRadius;
  disc = b * b - c;
  if (disc > 0.0) {
    float tHit = -b - sqrt(disc);
    if (tHit > 0.0) tMax = min(tMax, tHit);
  }

  // Shadow length: march along view ray sampling BSM (Tyndall / God rays)
  // 云层典型高度 2~15km， marching 区间收紧到 0~25km 以提高采样密度
  float marchMax = 25.0;
  float startT = (isSky && camR > topRadius + 1e-3) ? tEnterTop : 0.0;
  float shadowRayEnd = isSky ? min(tMax, startT + marchMax) : min(sceneDist, marchMax);
  float shadowRayBegin = max(startT, shadowRayEnd - marchMax);
  // 优先 shadowLengthBuffer；未提供纹理时回退为沿视线 BSM 步进（与 three-geospatial 丁达尔一致）
  float shadowLength;
  if (u_shadowLengthEnabled != 0) {
    shadowLength = readShadowLengthBuffer(v_textureCoordinates) * max(u_tyndallScale, 0.0);
  } else if (u_cloudShadowEnabled != 0) {
    shadowLength = marchShadowLengthAtm(cameraPosition, rayDirection, shadowRayBegin, shadowRayEnd);
  } else {
    shadowLength = 0.0;
  }

  vec3 transmittance;
  vec3 finalColor;

  if (isSky) {
      // 注意：getSkyRadiance 内部会自己计算 transmittance
      vec3 skyRadiance = getSkyRadiance(
        cameraPosition,
        rayDirection,
        shadowLength,
        u_sunDirection
      );
      finalColor = skyRadiance;
  } else if (u_applyGroundAtmosphere == 0) {
    // 地面/几何交给后续 AerialPerspectiveEffect 等单独 pass，避免两次 * transmittance + inscatter
    finalColor = originalColor.rgb;
  } else {
    // 关键：直接使用 depth 重建出的世界坐标作为命中点，避免 camera + ray * dist 在远距下误差放大引发闪烁
    vec3 scenePos = rawWorldPosMeters * METER_TO_LENGTH_UNIT;
    vec3 inscatter = GetSkyRadianceToPoint(
      cameraPosition,
      scenePos,
      shadowLength,
      u_sunDirection,
      transmittance
    );
    float sunTransmittance = getGroundSunTransmittance(rawWorldPosMeters);
    finalColor = originalColor.rgb * transmittance * sunTransmittance + inscatter;
  }

  // 线性 HDR + 单次曝光；ACES/gamma 仅在后接 AerialPerspectiveEffect 中做，避免两道 ACES 叠乘过曝
  out_FragColor = vec4(finalColor * u_atmosphereExposure, originalColor.a);
}
`;

  return (
    precisionHeader +
    defines + '\n' +
    definitionsSource + '\n' +
    commonSource + '\n' +
    globalUniformsForRuntime +
    runtimeSource + '\n' +
    skySource + '\n' +
    mainBlock
  );
}

/**
 * AtmospherePostProcess：从静态 LUT 加载并添加后处理阶段。
 * @param {Cesium.Viewer} viewer
 * @param {object} options
 * @param {string} [options.assetsBaseUrl] - .bin 所在目录，默认使用本地 assets/
 * @param {string} [options.shaderBaseUrl] - bruneton/*.glsl 所在目录，默认本地
 * @param {AtmosphereParameters} [options.atmosphereParams]
 * @param {boolean} [options.applyGroundAtmosphere=true] - 为 false 时本 pass 只对天空像素做 Bruneton；几何像素原样输出，供 AerialPerspectiveEffect 单独做空中透视，避免双重叠加。
 * @param {boolean} [options.exposureFollowTimeline=true] - 为 true 时曝光随当前仿真时间与太阳高度在 exposureDay / exposureNight 之间线性插值（见 _getEffectiveAtmosphereExposure）。
 * @param {number} [options.exposureDay=1.5] - 太阳高度角高于晨昏带时的曝光。
 * @param {number} [options.exposureNight=0.1] - 太阳高度角低于晨昏带时的曝光。
 * @param {number} [options.exposureTwilightAngleDegrees=6] - 晨昏过渡「半角」(度)：从地平下 -angle 到地平上 +angle 之间均匀插值。
 */
export class AtmospherePostProcess {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.assetsBaseUrl = options.assetsBaseUrl ?? LOCAL_ASSETS_BASE;
    // 默认指向库内 Shaders/（相对宿主页面 base），避免 404 被 SPA fallback 成 index.html 导致 shader 出现 '<' 编译错误
    this.shaderBaseUrl = options.shaderBaseUrl ?? './src/AtmosphereFromThreeGeospatial/Shaders/';
    this.atmosphereParams = options.atmosphereParams ?? new AtmosphereParameters();
    this.stage = null;
    this.textures = null;
    this._ready = null;
    /** 手动曝光；仅在 exposureFollowTimeline===false 时作为 u_atmosphereExposure */
    // 默认 1.0：不对几何/底图像素额外抬亮（库原默认 1.5 会让底图偏白）
    this._atmosphereExposure = options.atmosphereExposure ?? 1.0;
    /** 为 true 时曝光随 viewer.clock 对应的太阳位置（相机处太阳高度角）在白天/夜晚值之间线性变化 */
    this._exposureFollowTimeline = options.exposureFollowTimeline ?? true;
    this._exposureDay = options.exposureDay ?? 1.0;
    this._exposureNight = options.exposureNight ?? 0.1;
    /** 太阳高度从 -exposureTwilightAngleDegrees° 到 +exposureTwilightAngleDegrees° 之间从 night 线性过渡到 day */
    this._exposureTwilightAngleDegrees = options.exposureTwilightAngleDegrees ?? 6;
    this._debugTyndallMode = 0;
    this._tyndallScale = 2.5;
    this._bsmTyndallOpticalDepthScale = 1.0;
    this._bsmGroundOpticalDepthScale = 1.0;
    this._shadowLengthEnabled = true;
    this._shadowLengthTexture = null;
    this._shadowLengthScale = 1.0;
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
    this._cloudShadowTexelSize = null;
    this._geometricErrorCorrectionAmount = 0.0;
    this._gui = null;
    /** @type {boolean} 是否创建 dat.gui（WebGIS 默认 false） */
    this.enableGui = options.enableGui === true;
    // 当天空由 DrawCommand 版本的 SkyMaterial 绘制时，这里应关闭天空分支，只处理几何空中透视
    this._renderSky = options.renderSky ?? false;
    /** 是否与 AerialPerspectiveEffect 串联：为 false 时不在本 pass 对几何做 GetSkyRadianceToPoint，避免两次大气 */
    this._applyGroundAtmosphere = options.applyGroundAtmosphere ?? true;
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
   * 用于 u_atmosphereExposure：随时间轴（仿真时钟）下太阳方位变化。
   * 在相机当地「上」方向与指向太阳的视线夹角对应的高度角上，在 [-half,+half]° 内从 exposureNight 线性过渡到 exposureDay。
   */
  _getEffectiveAtmosphereExposure() {
    if (!this._exposureFollowTimeline) {
      return this._atmosphereExposure;
    }
    const Cesium = window.Cesium;
    if (!Cesium || !this.viewer?.camera?.positionWC) {
      return this._exposureDay;
    }
    const cameraPos = this.viewer.camera.positionWC;
    const ellipsoid = this.viewer.scene.globe?.ellipsoid ?? Cesium.Ellipsoid.WGS84;
    const sunDir = this.viewer.scene.context?.uniformState?.sunDirectionWC;
    if (!sunDir) {
      return this._exposureDay;
    }
    const carto = Cesium.Cartographic.fromCartesian(cameraPos, ellipsoid);
    if (!carto) {
      return this._exposureDay;
    }
    const surface = Cesium.Cartesian3.fromRadians(
      carto.longitude,
      carto.latitude,
      0.0,
      ellipsoid,
      new Cesium.Cartesian3()
    );
    const up = ellipsoid.geodeticSurfaceNormal(surface, new Cesium.Cartesian3());
    const sunDirNorm = Cesium.Cartesian3.normalize(sunDir, new Cesium.Cartesian3());
    const sinEl = Cesium.Math.clamp(Cesium.Cartesian3.dot(sunDirNorm, up), -1, 1);
    const elevDeg = Cesium.Math.toDegrees(Math.asin(sinEl));
    const half = Math.max(0.1, Number(this._exposureTwilightAngleDegrees) || 6);
    const low = -half;
    const high = half;
    let t = (elevDeg - low) / (high - low);
    t = Cesium.Math.clamp(t, 0, 1);
    const day = Number(this._exposureDay);
    const night = Number(this._exposureNight);
    return night + t * (day - night);
  }

  /**
   * 异步初始化：加载 LUT（.bin）+ 加载 shader，创建 PostProcessStage。
   * @returns {Promise<void>}
   */
  async init() {
    if (this._ready) return this._ready;
    this.viewer.scene.globe.depthTestAgainstTerrain = true; // 开启地形检测
    const scene = this.viewer.scene;
    const context = scene.context;
    const gl = context._gl;
    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new Error('AtmospherePostProcess 需要 WebGL2（用于 3D 散射纹理）。');
    }

    const Cesium = window.Cesium;
    if (!Cesium) throw new Error('需要全局 Cesium。');

    this._ready = (async () => {
      const [definitions, common, runtime] = await Promise.all([
        loadShaderSource('bruneton/definitions.glsl', { shaderBaseUrl: this.shaderBaseUrl }),
        loadShaderSource('bruneton/common.glsl', { shaderBaseUrl: this.shaderBaseUrl }),
        loadShaderSource('bruneton/runtime.glsl', { shaderBaseUrl: this.shaderBaseUrl }),
      ]);
      const sky = await loadShaderSource('sky.glsl', { shaderBaseUrl: this.shaderBaseUrl });

      this.textures = await loadPrecomputedTextures(
        this.assetsBaseUrl,
        context,
        Cesium
      );

      // 供云进程 blit BSM 用的 Cesium 纹理（大气 stage 只认 Cesium.Texture）
      // 优先用 HALF_FLOAT（避免 RGBA8 量化导致 B/G 等小值变 0 → 模式4/模式1全黑）。
      const BSM_SIZE = 1024;
      const canHalfFloat =
        !!context.halfFloatingPointTexture && !!context.colorBufferHalfFloat;
      const bsmPixelDatatype = canHalfFloat
        ? Cesium.PixelDatatype.HALF_FLOAT
        : Cesium.PixelDatatype.UNSIGNED_BYTE;
      // 与 three-geospatial 一致：天空/大气在浮点 RT 里累积，最后再 tonemap。
      // PostProcessStage 默认 RGBA8 会把 GetSkyRadiance 的高动态结果量化成明显「同心色带」。
      let postHdrPixelDatatype = Cesium.PixelDatatype.UNSIGNED_BYTE;
      if (canHalfFloat) {
        postHdrPixelDatatype = Cesium.PixelDatatype.HALF_FLOAT;
      } else if (context.colorBufferFloat && context.floatingPointTexture) {
        postHdrPixelDatatype = Cesium.PixelDatatype.FLOAT;
      }
      console.warn(
        `[Atmosphere] PostProcessStage pixel datatype=${postHdrPixelDatatype === Cesium.PixelDatatype.HALF_FLOAT ? 'HALF_FLOAT' : postHdrPixelDatatype === Cesium.PixelDatatype.FLOAT ? 'FLOAT' : 'UNSIGNED_BYTE'}`,
      );
      console.warn(`[Atmosphere] cloudShadow texture datatype=${canHalfFloat ? 'HALF_FLOAT' : 'UNSIGNED_BYTE'}`);
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
      // BSM 未设置时绑定 2D 占位，避免 sampler 未绑定（用 transmittance 纹理即可）
      this._cloudShadowDummyArray = null;

      const fragmentSource = buildSkyFragmentSource(definitions, common, runtime, sky);

      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;

      const self = this;
      const flatAtmosphere = flattenAtmosphereUniform(this.atmosphereParams.toUniform());
      const uniforms = {
        u_cameraPosition: () => {
          const wc = self.viewer.camera.positionWC;
          return new Cesium.Cartesian3(wc.x * 0.001, wc.y * 0.001, wc.z * 0.001);
        },
        u_altitudeCorrection: () => self._getAltitudeCorrectionOffsetKm(self.atmosphereParams.bottomRadius),
        u_sunDirection: () => (self.viewer.scene.context?.uniformState?.sunDirectionWC ?? new Cesium.Cartesian3(1, 0, 0)),
        u_groundAlbedo: () => new Cesium.Cartesian3(0.0, 0.0, 0.0),
        u_renderSky: () => (self._renderSky ? 1 : 0),
        // 每像素角度（弧度），用于太阳边缘 smoothstep；与 three-geospatial 的 fragmentAngle 在 dFdx 无效时等效
        u_sunPixelAngle: () => {
          const cam = self.viewer.camera;
          const h = (self.viewer.scene.canvas && self.viewer.scene.canvas.clientHeight) || 1080;
          const fov = (cam.frustum && cam.frustum.fov) != null ? cam.frustum.fov : Math.PI / 3;
          return Math.max(fov / h, 1e-6);
        },
        transmittance_texture: () => self.textures.transmittanceTexture,
        scattering_texture: () => self.textures.scatteringTexture,
        single_mie_scattering_texture: () => self.textures.singleMieScatteringTexture,
        irradiance_texture: () => self.textures.irradianceTexture,
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
        if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) {
          uniforms[key] = new Cesium.Cartesian3(value[0], value[1], value[2]);
        } else {
          uniforms[key] = value;
        }
      }
      const METER_TO_KM = 0.001;
      uniforms['ATMOSPHERE.bottom_radius'] = () => self.atmosphereParams.bottomRadius * METER_TO_KM;
      uniforms['ATMOSPHERE.top_radius'] = () => self.atmosphereParams.topRadius * METER_TO_KM;
      uniforms.u_atmosphereExposure = () => self._getEffectiveAtmosphereExposure();

      // Cloud shadow BSM uniforms (populated by VolumetricCloudsProcess if available)
      uniforms.u_cloudShadowEnabled = () => self._cloudShadowEnabled ? 1 : 0;
      uniforms.u_cloudShadowScale = () => self._cloudShadowTexScale ?? 1.0;
      uniforms.u_cloudShadowDecode = () =>
        self._cloudShadowDecode ?? new Cesium.Cartesian4(1.0, 1.0, 1.0, 1.0);
      uniforms.u_cloudShadowBuffer = () => self._cloudShadowBuffer ?? self.textures.transmittanceTexture;
      uniforms.u_cloudShadowNear = () => self._cloudShadowNear ?? 0.1;
      uniforms.u_cloudShadowFar = () => self._cloudShadowFar ?? 200000.0;
      uniforms.u_cloudShadowTopHeight = () => self._cloudShadowTopHeight ?? 5000.0;
      uniforms.u_cloudShadowBottomRadius = () =>
        self._cloudShadowBottomRadius ?? self.atmosphereParams.bottomRadius;
      uniforms.u_cloudShadowIntervals = () => self._cloudShadowIntervals ?? [
        new Cesium.Cartesian2(0, 0), new Cesium.Cartesian2(0, 0),
        new Cesium.Cartesian2(0, 0), new Cesium.Cartesian2(0, 0)
      ];
      uniforms.u_cloudShadowMatrices = () => self._cloudShadowMatrices ?? [
        Cesium.Matrix4.IDENTITY.clone(), Cesium.Matrix4.IDENTITY.clone(),
        Cesium.Matrix4.IDENTITY.clone(), Cesium.Matrix4.IDENTITY.clone()
      ];
      uniforms.u_cloudShadowTexelSize = () =>
        self._cloudShadowTexelSize ?? new Cesium.Cartesian2(1 / 512, 1 / 512);
      uniforms.u_geometricErrorCorrectionAmount = () =>
        self._geometricErrorCorrectionAmount ?? 0.0;
      uniforms.u_shadowLengthEnabled = () => (self._shadowLengthEnabled ? 1 : 0);
      uniforms.u_shadowLengthScale = () => (self._shadowLengthScale ?? 1.0);
      uniforms.u_shadowLengthBuffer = () => self._shadowLengthTexture ?? self.textures.transmittanceTexture;
      uniforms.u_applyGroundAtmosphere = () => (self._applyGroundAtmosphere ? 1 : 0);
      uniforms.u_debugTyndall = () => (self._debugTyndallMode ?? 0);
      uniforms.u_tyndallScale = () => (self._tyndallScale ?? 1.0);
      uniforms.u_bsmTyndallOpticalDepthScale = () => (self._bsmTyndallOpticalDepthScale ?? 1.0);
      uniforms.u_bsmGroundOpticalDepthScale = () => (self._bsmGroundOpticalDepthScale ?? 1.0);

      this.stage = new Cesium.PostProcessStage({
        name: 'AtmosphereFromThreeGeospatial',
        fragmentShader: fragmentSource,
        uniforms,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: postHdrPixelDatatype,
      });

      if (self._autoAddStage !== false) {
        scene.postProcessStages.add(this.stage);
      }

      if (this.enableGui) this._setupGUI();
    })();

    return this._ready;
  }

  _setupGUI() {
    if (this._gui || !this.enableGui) return;
    const dat = typeof window !== 'undefined' && window.dat ? window.dat : null;
    if (!dat?.GUI) {
      console.warn('[AtmospherePostProcess] enableGui=true 但未找到 dat.GUI，跳过调试面板');
      return;
    }
    this._gui = new dat.GUI({ name: '大气参数' });
    const folder = this._gui.addFolder('大气控制');
    folder.add(this, '_exposureFollowTimeline').name('曝光随时间轴(太阳高度)');
    folder.add(this, '_exposureDay', 0.0, 5.0, 0.05).name('白天曝光');
    folder.add(this, '_exposureNight', 0.0, 2.0, 0.01).name('夜晚曝光');
    folder.add(this, '_exposureTwilightAngleDegrees', 0.5, 18.0, 0.5).name('晨昏过渡半角(度)');
    folder.add(this, '_atmosphereExposure', 0.0, 30.0, 0.01).name('手动曝光(关时间轴时)');
    folder.add(this.atmosphereParams, 'bottomRadius', 6300000, 6400000, 10).name('bottom_radius (m)');
    folder.add(this.atmosphereParams, 'topRadius', 6350000, 6500000, 10).name('top_radius (m)');
    const debugFolder = this._gui.addFolder('丁达尔调试');
    debugFolder.add(this, '_tyndallScale', 0.5, 6.0, 0.25).name('光柱强度 (scale)');
    debugFolder.add(this, '_bsmTyndallOpticalDepthScale', 0.1, 50.0, 0.1).name('BSM OD 缩放(光柱)');
    debugFolder.add(this, '_bsmGroundOpticalDepthScale', 0.1, 50.0, 0.1).name('BSM OD 缩放(地面)');
    debugFolder.add(this, '_debugTyndallMode', {
      '关闭': 0,
      '1: shadowLength': 1,
      '2: BSM启用(绿=是)': 2,
      '3: BSM单点采样': 3,
      '4: BSM纹理直显(B)': 4,
      '5: transmittance诊断': 5,
      '6: BSM纹理直显(R)': 6,
      '7: BSM纹理直显(G)': 7,
      '8: BSM纹理直显(A)': 8
    }).name('调试模式');
    debugFolder.open();
    folder.open();
  }

  /**
   * 设置云阴影参数（由 VolumetricCloudsProcess 调用）。
   * options.scale：BSM 采样还原系数，1=原始浮点，0.02=从 RGBA8 解码（由 setCloudShadow 调用方传入）
   */
  setCloudShadow(options) {
    this._cloudShadowEnabled = options.enabled ?? false;
    this._cloudShadowBuffer = options.texture ?? null;
    if (options.scale !== undefined) this._cloudShadowTexScale = options.scale;
    if (options.decode) {
      const d = options.decode;
      this._cloudShadowDecode = new Cesium.Cartesian4(d.x ?? 1.0, d.y ?? 1.0, d.z ?? 1.0, d.w ?? 1.0);
    }
    this._cloudShadowNear = options.near ?? this._cloudShadowNear ?? 0.1;
    this._cloudShadowFar = options.far ?? 200000.0;
    this._cloudShadowTopHeight = options.topHeight ?? 5000.0;
    this._cloudShadowBottomRadius = options.bottomRadius ?? this.atmosphereParams.bottomRadius;
    this._cloudShadowIntervals = options.intervals ?? null;
    this._cloudShadowMatrices = options.matrices ?? null;
    if (options.texelSize) {
      const tx = options.texelSize;
      this._cloudShadowTexelSize = new Cesium.Cartesian2(
        tx.x ?? tx[0] ?? 1 / 512,
        tx.y ?? tx[1] ?? 1 / 512,
      );
    }
    if (options.geometricErrorCorrectionAmount !== undefined) {
      this._geometricErrorCorrectionAmount = options.geometricErrorCorrectionAmount;
    }
  }

  /**
   * three-geospatial 对齐：设置屏幕空间 shadowLengthBuffer。
   * options.texture 需要是单通道/可采样纹理，其 r 通道存储 shadowLength（km）。
   */
  setCloudShadowLength(options) {
    this._shadowLengthEnabled = options.enabled ?? false;
    this._shadowLengthTexture = options.texture ?? null;
    if (options.scale !== undefined) this._shadowLengthScale = options.scale;
  }

  /**
   * 向外部暴露与 three-geospatial 一致的大气参数，供体积云等后续阶段使用。
   * 需在 init() 完成后再调用。
   * @returns {AtmosphereForCloudsProvider} 含：
   *   - textures: LUT 纹理（transmittance/scattering/irradiance/singleMie/higherOrder）
   *   - getUniforms(): 展平 ATMOSPHERE、sunDirection、cameraPosition(ECEF 米)、矩阵、常量等
   *   - atmosphereParams: AtmosphereParameters 引用
   *   - constants: METER_TO_LENGTH_UNIT、precomputeConstants、getShaderDefines()
   */
  getAtmosphereForClouds() {
    if (!this.textures) {
      throw new Error('AtmospherePostProcess.getAtmosphereForClouds() 需在 init() 完成后再调用');
    }
    const Cesium = window.Cesium;
    const self = this;
    const flatAtmosphere = flattenAtmosphereUniform(this.atmosphereParams.toUniform());

    const staticUniforms = {};
    for (const [key, value] of Object.entries(flatAtmosphere)) {
      if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) {
        staticUniforms[key] = new Cesium.Cartesian3(value[0], value[1], value[2]);
      } else {
        staticUniforms[key] = value;
      }
    }
    staticUniforms.SUN_SPECTRAL_RADIANCE_TO_LUMINANCE = (() => {
      const v = this.atmosphereParams.sunRadianceToRelativeLuminance;
      return new Cesium.Cartesian3(v[0], v[1], v[2]);
    })();
    staticUniforms.SKY_SPECTRAL_RADIANCE_TO_LUMINANCE = (() => {
      const v = this.atmosphereParams.skyRadianceToRelativeLuminance;
      return new Cesium.Cartesian3(v[0], v[1], v[2]);
    })();
    staticUniforms.altitudeCorrection = new Cesium.Cartesian3(0, 0, 0);
    staticUniforms.worldToECEFMatrix = Cesium.Matrix4.IDENTITY;
    staticUniforms.ecefToWorldMatrix = Cesium.Matrix4.IDENTITY;
    const METER_TO_KM = 0.001;
    staticUniforms['ATMOSPHERE.bottom_radius'] = () => self.atmosphereParams.bottomRadius * METER_TO_KM;
    staticUniforms['ATMOSPHERE.top_radius'] = () => self.atmosphereParams.topRadius * METER_TO_KM;

    function getUniforms() {
      return {
        ...staticUniforms,
        bottomRadius: () => self.atmosphereParams.bottomRadius,
        topRadius: () => self.atmosphereParams.topRadius,
        atmosphereExposure: () => self._getEffectiveAtmosphereExposure(),
        transmittance_texture: () => self.textures.transmittanceTexture,
        scattering_texture: () => self.textures.scatteringTexture,
        irradiance_texture: () => self.textures.irradianceTexture,
        single_mie_scattering_texture: () => self.textures.scatteringTexture,
        higher_order_scattering_texture: () => null,
        sunDirection: () =>
          self.viewer.scene.context?.uniformState?.sunDirectionWC ?? new Cesium.Cartesian3(1, 0, 0),
        // 与 three-geospatial 一致：cameraPosition 为 ECEF 米（vert 中 vCameraPosition = worldToECEF*cameraPosition，再参与 * METER_TO_LENGTH_UNIT）
        cameraPosition: () => {
          const wc = self.viewer.camera.positionWC;
          return new Cesium.Cartesian3(wc.x, wc.y, wc.z);
        },
      };
    }

    return {
      textures: {
        transmittanceTexture: this.textures.transmittanceTexture,
        scatteringTexture: this.textures.scatteringTexture,
        irradianceTexture: this.textures.irradianceTexture,
        singleMieScatteringTexture: this.textures.scatteringTexture,
        higherOrderScatteringTexture: null,
      },
      /** 供云进程每帧 blit BSM 的目标纹理（Cesium.Texture），blit 后通过 setCloudShadow 传入 */
      getCloudShadowTargetTexture: () => self._cloudShadowCesiumTexture ?? null,
      /** BSM 写入 Cesium 纹理时的缩放（1=不缩放；<1 时用于 RGBA8 编码，大气侧会除以该值还原） */
      getCloudShadowScale: () => self._cloudShadowTexScale ?? 1.0,
      /** blit 写入时是否需要 clamp 到 0..1（RGBA8 需要；HALF_FLOAT 不需要） */
      getCloudShadowClamp01: () => self._cloudShadowTexClamp01 ?? true,
      getUniforms,
      setCloudShadow: (opts) => self.setCloudShadow(opts),
      setCloudShadowLength: (opts) => self.setCloudShadowLength(opts),
      setDebugTyndall: (v) => { self._debugTyndallMode = v ? 1 : 0; },
      setDebugTyndallMode: (m) => { self._debugTyndallMode = m; },
      atmosphereParams: this.atmosphereParams,
      constants: {
        METER_TO_LENGTH_UNIT: 0.001,
        /** 预计算纹理尺寸等，体积云着色器 include bruneton 时需用相同 #define */
        precomputeConstants: PRECOMPUTE_CONSTANTS,
        /** 返回与天空阶段一致的 #define 字符串（含 COMBINED_SCATTERING_TEXTURES），用于拼接体积云 fragmentShader */
        getShaderDefines: () =>
          '#define COMBINED_SCATTERING_TEXTURES\n' + getPrecomputeDefines(),
      },
    };
  }

  destroy() {
    if (this.stage && this.viewer.scene.postProcessStages) {
      this.viewer.scene.postProcessStages.remove(this.stage);
      this.stage = null;
    }
    if (this.viewer.scene.skyAtmosphere) {
      this.viewer.scene.skyAtmosphere.show = true;
    }
    if (this._gui) {
      this._gui.destroy();
      this._gui = null;
    }
    if (this._cloudShadowCesiumTexture) {
      this._cloudShadowCesiumTexture.destroy();
      this._cloudShadowCesiumTexture = null;
    }
    this._cloudShadowDummyArray = null;
    this.textures = null;
    this._ready = null;
  }
}

export default AtmospherePostProcess;
export { loadPrecomputedTextures } from './PrecomputedTexturesLoader.js';
export { METER_TO_LENGTH_UNIT } from './AtmosphereForClouds.js';
