/**
 * ThreeGeospatialPipeline - 精炼版体积云 + Bruneton 大气 + 空中透视一体化管线。
 *
 * 渲染顺序（与 three-geospatial 对齐）：
 *  1. PostProcessStage: 体积云 raymarch（含 BSM 采样、shadowLength、haze）
 *  2. PostProcessStage: AtmospherePostProcess 天空
 *  3. PostProcessStage: AerialPerspectiveEffect 几何透视 + tonemap
 *
 * BSM（Beer Shadow Map）和 TAA 通过原生 WebGL 在 preRender/postRender 执行。
 * BSM 数据通过 setCloudShadow 同步到大气和 Aerial 两侧，实现丁达尔与地面云影。
 */

/* global Cesium */
/* eslint-disable @typescript-eslint/no-this-alias, no-constant-binary-expression */

// dat.gui 为可选依赖：生产环境由 WebGIS 工具面板调参，默认不加载
// import * as dat from "dat.gui";
import { AtmosphereParameters } from "./AtmosphereFromThreeGeospatial/AtmosphereParameters.js";
import { AtmospherePostProcess } from "./AtmosphereFromThreeGeospatial/AtmospherePostProcess.js";
import { AerialPerspectiveEffect } from "./AtmosphereFromThreeGeospatial/AerialPerspectiveEffect.js";
import { loadBinThreeGeospatial, bindData3DTextureToCesiumContext } from "./loadBinThreeGeospatial.js";
import { loadShaderSource } from "./shaderLoader.js";
import {
  DEFAULT_CLOUDS_ASSETS_BASE,
  DEFAULT_BRUNETON_SHADER_BASE,
  DEFAULT_BLUE_NOISE_URL,
  DEFAULT_ATMOSPHERE_ASSETS_BASE,
  DEFAULT_ATMOSPHERE_SHADER_BASE,
} from "./assetPaths.js";

const SHADOW_MAP_SIZE = 1024;
const BSM_BLIT_SIZE = 1024;

// ─── Cloud fragment shader (Bruneton integrated, no debug branches) ────────

function getCloudFragmentShader() {
  return /* glsl */ `
const float RECIPROCAL_PI4 = 0.07957747154594767;
const float EVOLUTION_SCALE = 2e4;

uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform sampler3D u_shapeTexture;
uniform sampler3D u_shapeDetailTexture;
uniform sampler3D u_stbnTexture;
uniform sampler2D u_weatherTexture;
uniform sampler2D u_turbulenceTexture;
uniform sampler2D u_blueNoise;
uniform float u_blueNoiseScale;
uniform float u_jitterStrength;

uniform vec3 u_cameraPosition;
uniform vec3 u_altitudeCorrection;
uniform float u_cameraHeight;
uniform float u_bottomRadius;
uniform float u_minHeight;
uniform float u_maxHeight;
uniform vec4 u_minLayerHeights;
uniform vec4 u_maxLayerHeights;
uniform vec4 u_densityScales;
uniform vec4 u_shapeAmounts;
uniform vec4 u_shapeDetailAmounts;
uniform vec4 u_weatherExponents;
uniform vec4 u_shapeAlteringBiases;
uniform vec4 u_coverageFilterWidths;
uniform float u_maxSteps;
uniform float u_maxStepsToSun;
uniform float u_minStepSize;
uniform float u_maxStepSize;
uniform float u_maxRayDistance;
uniform float u_cameraNear;
uniform float u_shadowTopHeight;
uniform int u_shadowLengthEnabled;
uniform int u_hazeEnabled;
uniform int u_maxShadowLengthIterationCount;
uniform float u_minShadowLengthStepSize;
uniform float u_maxShadowLengthRayDistance;
uniform float u_hazeDensityScale;
uniform float u_hazeExponent;
uniform float u_hazeScatteringCoefficient;
uniform float u_hazeAbsorptionCoefficient;
uniform sampler2D u_shadowBuffer;
uniform vec2 u_shadowTexelSize;
uniform vec2 u_shadowIntervals[4];
uniform mat4 u_shadowMatrices[4];
uniform float u_shadowFar;
uniform float u_maxShadowFilterRadius;
uniform int u_useShadowBuffer;
uniform float u_skyLightScale;
uniform float u_weatherRepeat;
uniform vec2 u_localWeatherOffset;
uniform float u_shapeRepeat;
uniform vec3 u_shapeOffset;
uniform float u_shapeDetailRepeat;
uniform vec3 u_shapeDetailOffset;
uniform float u_turbulenceRepeat;
uniform float u_turbulenceDisplacement;
uniform vec4 u_coverages;
uniform float u_coverageHaze;
uniform float u_scatteringCoefficient;
uniform float u_absorptionCoefficient;
uniform float u_scatterG1;
uniform float u_scatterG2;
uniform float u_scatterMix;
uniform float u_sunIntensity;
uniform float u_skyToSunRatio;
uniform float u_powderScale;
uniform float u_powderExponent;
uniform float u_aerialPerspectiveScale;
uniform float u_cloudExposure;
uniform float u_magentaFixStrength;
uniform float u_edgeAlphaCutoff;
uniform vec2 u_resolution;
uniform float u_mipLevelScale;
uniform float u_perspectiveStepScale;
uniform float u_minDensity;
uniform float u_minExtinction;
uniform float u_minTransmittance;
// 远处云密度距离衰减：从 u_distFadeStart（米）开始线性降到0，到 u_distFadeEnd 完全消失
// 消除天际线附近云"堆在一起"的视觉拥挤
uniform float u_distFadeStart;
uniform float u_distFadeEnd;
// 相机高度渐变淡出：从 u_altitudeFadeStart 开始线性衰减，到 u_altitudeFadeEnd 完全消失
// 避免相机升过云顶后云层突然消失
uniform float u_altitudeFadeStart;
uniform float u_altitudeFadeEnd;
uniform float u_minSecondaryStepSize;
uniform float u_secondaryStepScale;
uniform int u_multiScatteringOctaves;
uniform float u_lowLayerDensityBoost;
uniform vec4 u_densityProfileExpTerms;
uniform vec4 u_densityProfileExponents;
uniform vec4 u_densityProfileLinearTerms;
uniform vec4 u_densityProfileConstantTerms;
uniform vec3 u_minIntervalHeights;
uniform vec3 u_maxIntervalHeights;

uniform sampler2D u_historyTexture;
uniform mat4 u_prevViewProjection;
uniform float u_temporalAlpha;
uniform int u_temporalEnabled;
uniform int u_frame;

in vec2 v_textureCoordinates;

vec3 ACESFilmic(vec3 x) {
  float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec4 saturate(vec4 x) { return clamp(x, 0.0, 1.0); }
float remap(float v, float a, float b, float c, float d) { return c + (v - a) * (d - c) / (b - a); }
float remapClamped(float v, float a, float b, float c, float d) { return clamp(remap(v, a, b, c, d), min(c, d), max(c, d)); }
float remapClamped(float v, float a, float b) { return clamp((v - a) / (b - a), 0.0, 1.0); }
vec4 remap(vec4 v, vec4 a, vec4 b, vec4 c, vec4 d) { return c + (v - a) * (d - c) / (b - a); }
vec4 remapClamped(vec4 v, vec4 a, vec4 b, vec4 c, vec4 d) { return clamp(remap(v, a, b, c, d), min(c, d), max(c, d)); }
vec4 remapClamped(vec4 v, vec4 a, vec4 b) { return clamp((v - a) / (b - a), 0.0, 1.0); }

vec3 reduceMagenta(vec3 color, float strength) {
  float magenta = max(0.0, min(color.r, color.b) - color.g);
  float fix = clamp(magenta * 5.0 * max(strength, 0.0), 0.0, 1.0);
  float target = color.g;
  color.r = mix(color.r, target, fix);
  color.b = mix(color.b, target, fix);
  return color;
}

vec2 raySphereIntersect(vec3 ro, vec3 rd, float radius) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void reconstructRay(out vec3 ro, out vec3 rd) {
  ro = u_cameraPosition + u_altitudeCorrection;
  vec2 uv = v_textureCoordinates * 2.0 - 1.0;
  vec4 clipPos = vec4(uv, 1.0, 1.0);
  vec4 viewPos = czm_inverseProjection * clipPos;
  viewPos /= viewPos.w;
  vec4 worldPos4 = czm_inverseView * viewPos;
  vec3 worldPos = worldPos4.xyz + u_altitudeCorrection;
  rd = normalize(worldPos - ro);
}

float getSTBN() {
  // 与 three-geospatial 一致：按帧在 3D STBN 的 z 维切片轮换
  ivec3 size = textureSize(u_stbnTexture, 0);
  vec3 scale = 1.0 / vec3(size);
  return texture(
    u_stbnTexture,
    vec3(gl_FragCoord.xy, float(u_frame % size.z)) * scale
  ).r;
}

vec2 getCubeSphereUv(vec3 position) {
  vec3 n = normalize(position);
  vec3 f = abs(n);
  vec3 c = n / max(f.x, max(f.y, f.z));
  vec2 m;
  if (f.y >= f.x && f.y >= f.z) { m = c.y > 0.0 ? vec2(-n.x, n.z) : n.xz; }
  else if (f.x >= f.y && f.x >= f.z) { m = c.x > 0.0 ? n.yz : vec2(-n.y, n.z); }
  else { m = c.z > 0.0 ? n.xy : vec2(n.x, -n.y); }
  vec2 m2 = m * m;
  float q = dot(m2.xy, vec2(-2.0, 2.0)) - 3.0;
  float q2 = q * q;
  vec2 uv;
  uv.x = sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(max(0.0, -24.0 * m2.x + q2))) * (m.x > 0.0 ? 1.0 : -1.0);
  uv.y = sqrt(6.0 / max(0.001, 3.0 - uv.x * uv.x)) * m.y;
  return uv * 0.5 + 0.5;
}
vec2 getGlobeUv(vec3 position) { return getCubeSphereUv(position); }

float getMipLevel(vec2 uv) {
  vec2 coord = uv * u_resolution;
  vec2 ddx_v = dFdx(coord);
  vec2 ddy_v = dFdy(coord);
  float deltaMaxSqr = max(dot(ddx_v, ddx_v), dot(ddy_v, ddy_v)) * 0.1;
  return max(0.0, 0.5 * log2(max(1.0, deltaMaxSqr)));
}

bool inEmptySpace(float height) {
  bvec3 gt = greaterThan(vec3(height), u_minIntervalHeights);
  bvec3 lt = lessThan(vec3(height), u_maxIntervalHeights);
  return gt.x && lt.x || gt.y && lt.y || gt.z && lt.z;
}

vec4 getLayerDensity(vec4 hf) {
  return u_densityProfileExpTerms * exp(u_densityProfileExponents * hf) + u_densityProfileLinearTerms * hf + u_densityProfileConstantTerms;
}

vec4 getHeightFractions(float height) {
  vec4 range = u_maxLayerHeights - u_minLayerHeights;
  return clamp((vec4(height) - u_minLayerHeights) / max(range, vec4(0.0001)), 0.0, 1.0);
}

struct WeatherSample { vec4 heightFraction; vec4 density; };
struct MediaSample { float density; vec4 weight; float scattering; float extinction; };

vec4 shapeAlteringFunction(vec4 hf, vec4 bias) {
  vec4 biased = pow(hf, bias);
  vec4 x = clamp(biased * 2.0 - 1.0, -1.0, 1.0);
  return 1.0 - x * x;
}

WeatherSample sampleWeather(vec2 uv, float height, float mipLevel) {
  WeatherSample w;
  w.heightFraction = getHeightFractions(height);
  vec2 wUv = uv * u_weatherRepeat + u_localWeatherOffset;
  vec4 localW = pow(textureLod(u_weatherTexture, wUv, mipLevel).rgba, u_weatherExponents);
  vec4 hs = shapeAlteringFunction(w.heightFraction, u_shapeAlteringBiases);
  vec4 factor = 1.0 - u_coverages * hs;
  w.density = remapClamped(mix(localW, vec4(1.0), u_coverageFilterWidths), factor, factor + u_coverageFilterWidths);
  return w;
}

MediaSample sampleMedia(WeatherSample weather, vec3 position, vec2 uv, float mipLevel, float jitter) {
  vec4 density = weather.density;
  vec3 sn = normalize(position);
  vec3 evolution = -sn * length(u_localWeatherOffset) * EVOLUTION_SCALE;
  vec2 tUv = uv * u_weatherRepeat * u_turbulenceRepeat;
  vec3 turb = u_turbulenceDisplacement * (texture(u_turbulenceTexture, tUv).rgb * 2.0 - 1.0)
      * dot(density, remapClamped(weather.heightFraction, vec4(0.3), vec4(0.0)));
  vec3 sp = (position + evolution + turb) * u_shapeRepeat + u_shapeOffset;
  float shapeTex = texture(u_shapeTexture, fract(sp)).r;
  density = remapClamped(density, vec4(1.0 - shapeTex) * u_shapeAmounts, vec4(1.0));
  if (mipLevel * 0.5 + (jitter - 0.5) * 0.5 < 0.5) {
    vec3 dp = (position + turb) * u_shapeDetailRepeat + u_shapeDetailOffset;
    float detail = texture(u_shapeDetailTexture, dp).r;
    vec4 modifier = mix(vec4(pow(detail, 6.0)), vec4(1.0 - detail),
        remapClamped(weather.heightFraction, vec4(0.2), vec4(0.4), vec4(0.0), vec4(1.0)));
    modifier = mix(vec4(0.0), modifier, u_shapeDetailAmounts);
    density = remapClamped(density * 2.0, vec4(modifier * 0.5), vec4(1.0));
  }
  density = saturate(density * u_densityScales * getLayerDensity(weather.heightFraction));
  float ds = density.x + density.y + density.z + density.w;
  MediaSample m;
  m.density = ds;
  m.weight = density / max(ds, 1e-7);
  m.scattering = ds * u_scatteringCoefficient;
  m.extinction = ds * u_absorptionCoefficient + m.scattering;
  return m;
}

float henyeyGreenstein(float g, float cosTheta) {
  float g2 = g * g;
  return RECIPROCAL_PI4 * (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
}

float phaseFunction(float cosTheta, float attenuation) {
  return mix(henyeyGreenstein(u_scatterG1 * attenuation, cosTheta),
             henyeyGreenstein(u_scatterG2 * attenuation, cosTheta), u_scatterMix);
}

float approximateMultipleScattering(float opticalDepth, float cosTheta) {
  vec3 coeffs = vec3(1.0);
  const vec3 attenuation = vec3(0.5);
  float scattering = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= u_multiScatteringOctaves) break;
    scattering += coeffs.x * exp(-opticalDepth * coeffs.y) * phaseFunction(cosTheta, coeffs.z);
    coeffs *= attenuation;
  }
  return scattering;
}

float marchOpticalDepthToSun(vec3 rayOrigin, vec3 rayDirection, float mipLevel, float jitter, out float sunRayDist) {
  float iterCount = max(0.0, remap(mipLevel, 0.0, 1.0, float(u_maxStepsToSun) + 1.0, 1.0) - jitter);
  int ic = int(iterCount);
  if (ic == 0) return 0.5;
  float stepSize = u_minSecondaryStepSize / iterCount;
  float nextDist = stepSize * jitter;
  float od = 0.0;
  sunRayDist = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= ic) break;
    sunRayDist = nextDist;
    vec3 pos = rayDirection * nextDist + rayOrigin;
    vec2 uv = getGlobeUv(pos);
    float h = length(pos) - u_bottomRadius;
    WeatherSample ws = sampleWeather(uv, h, mipLevel);
    MediaSample ms = sampleMedia(ws, pos, uv, mipLevel, jitter);
    od += ms.extinction * stepSize;
    nextDist += stepSize;
    stepSize *= u_secondaryStepScale;
  }
  return od;
}

bool rayIntersectsGround(vec3 camPos, vec3 rd) {
  float r = length(camPos);
  float mu = dot(camPos, rd) / r;
  return mu < 0.0 && r * r * (mu * mu - 1.0) + u_bottomRadius * u_bottomRadius >= 0.0;
}

void raySphereIntersections(vec3 origin, vec3 direction, vec4 radius, out vec4 i1, out vec4 i2) {
  float b = 2.0 * dot(direction, origin);
  vec4 c = dot(origin, origin) - radius * radius;
  vec4 disc = b * b - 4.0 * c;
  vec4 mask = step(disc, vec4(0.0));
  vec4 Q = sqrt(max(vec4(0.0), disc));
  i1 = mix((-b - Q) * 0.5, vec4(-1.0), mask);
  i2 = mix((-b + Q) * 0.5, vec4(-1.0), mask);
}

void getIntersections(vec3 camPos, vec3 rd, out bool ground, out vec4 first, out vec4 second) {
  ground = rayIntersectsGround(camPos, rd);
  vec4 radii = u_bottomRadius + vec4(0.0, u_minHeight, u_maxHeight, u_shadowTopHeight);
  raySphereIntersections(camPos, rd, radii, first, second);
}

vec2 getRayNearFar(bool ground, vec4 first, vec4 second) {
  vec2 nearFar = vec2(-1.0);
  if (u_cameraHeight < u_minHeight) {
     if (ground) {
        nearFar = vec2(-1.0);
    } else {
        nearFar = vec2(second.y, second.z);
        nearFar.y = min(nearFar.y, u_maxRayDistance);
    }
  } else if (u_cameraHeight < u_maxHeight) {
      if (ground) {
          // 地面相交时，采样从相机近裁面到云层下边界
          nearFar = vec2(u_cameraNear, first.y);
          if (nearFar.y <= nearFar.x) nearFar = vec2(-1.0);
      } else {
          float farExit = max(max(first.y, second.y), max(first.z, second.z));
          if (farExit <= 0.0) {
          // 无有效远边界时，强制采样到最大射线距离
          farExit = u_maxRayDistance;
          }
          farExit = min(farExit, u_maxRayDistance);
          farExit = max(farExit, u_cameraNear + u_minStepSize * 0.5);
          nearFar = vec2(u_cameraNear, farExit);
      }
  } else {
      // 相机在云层上方：near 取射线进入云顶球面的距离（first.z），
      // 避免从相机近裁面出发耗尽步数穿越空旷空间导致云层突然消失
      float nearEntry = max(first.z, u_cameraNear);
      float farExit = max(max(first.y, second.y), second.z);
      if (farExit > nearEntry) {
          farExit = min(farExit, nearEntry + u_maxRayDistance);
          nearFar = vec2(nearEntry, farExit);
      }
  }
  return nearFar;
}

vec2 getShadowRayNearFar(bool ground, vec4 first, vec4 second) {
  vec2 nf;
  if (u_cameraHeight < u_shadowTopHeight) {
    nf = ground ? vec2(u_cameraNear, first.x) : vec2(u_cameraNear, second.w);
  } else {
    nf = vec2(first.w, second.w);
    if (ground) nf.y = first.x;
  }
  nf.y = min(nf.y, u_maxShadowLengthRayDistance);
  return nf;
}

vec2 getHazeRayNearFar(bool ground, vec4 first, vec4 second) {
  vec2 nf;
  if (u_cameraHeight < u_maxHeight) {
    nf = ground ? vec2(u_cameraNear, first.x) : vec2(u_cameraNear, second.z);
  } else {
    nf = vec2(u_cameraNear, second.z);
    if (ground) nf.y = first.x;
  }
  return nf;
}

// ── BSM sampling ──
float sampleShadowOpticalDepth(vec3 rayPosition, float distanceOffset, float radius, float jitter);

float getDistanceToShadowTop(vec3 rayPos) {
  vec3 rd = czm_sunDirectionWC;
  float R = u_bottomRadius + u_shadowTopHeight;
  float b = dot(rayPos, rd);
  float c = dot(rayPos, rayPos) - R * R;
  float h = b * b - c;
  if (h < 0.0) return -1.0;
  return -b + sqrt(h);
}

// three.js / CloudShadowPass intervals=(d-near)/(far-near) 一致
float viewZToOrthographicDepth(float viewZ, float near, float far) {
  return (viewZ + near) / (near - far);
}

int getFadedCascadeIndex(mat4 viewMat, vec3 worldPos, vec2 intervals[4], float near, float far, float jitter) {
  vec4 vp = viewMat * vec4(worldPos, 1.0);
  float depth = viewZToOrthographicDepth(vp.z, near, far);
  int nextIndex = -1, prevIndex = -1;
  float alpha = 1.0;
  for (int i = 0; i < 4; ++i) {
    vec2 interval = intervals[i];
    float intervalCenter = (interval.x + interval.y) * 0.5;
    float closestEdge = depth < intervalCenter ? interval.x : interval.y;
    float margin = closestEdge * closestEdge * 0.5;
    interval += margin * vec2(-0.5, 0.5);
    if (i < 3) {
      if (depth >= interval.x && depth < interval.y) { prevIndex = nextIndex; nextIndex = i; alpha = saturate(min(depth - interval.x, interval.y - depth) / max(margin, 1e-6)); }
    } else {
      if (depth >= interval.x) { prevIndex = nextIndex; nextIndex = i; alpha = saturate((depth - interval.x) / max(margin, 1e-6)); }
    }
  }
  return jitter <= alpha ? nextIndex : prevIndex;
}

vec2 getShadowUv(vec3 pos, int ci) { vec4 clip = u_shadowMatrices[ci] * vec4(pos, 1.0); clip /= clip.w; return clip.xy * 0.5 + 0.5; }
vec2 getShadowAtlasOffset(int ci) { return vec2(mod(float(ci), 2.0) * 0.5, (ci < 2) ? 0.5 : 0.0); }

float readShadowOpticalDepth(vec2 uv, int ci, float distToTop, float distOff) {
  if (u_useShadowBuffer == 0) return 0.0;
  vec2 atlasUv = getShadowAtlasOffset(ci) + uv * 0.5;
  vec4 shadow = texture(u_shadowBuffer, atlasUv);
  float distToFront = max(0.0, distToTop - distOff - shadow.r);
  return min(shadow.b + shadow.a, shadow.g * distToFront);
}

float interleavedGradientNoise(vec2 coord) {
  const vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(coord, magic.xy)));
}

vec2 vogelDisk(int index, int count, float phi) {
  const float goldenAngle = 2.39996322972865332;
  float r = sqrt(float(index) + 0.5) / sqrt(float(count));
  float theta = float(index) * goldenAngle + phi;
  return r * vec2(cos(theta), sin(theta));
}

float sampleShadowOpticalDepthPCF(vec3 worldPos, float distToTop, float distOff, float radius, int ci) {
  vec2 uv = getShadowUv(worldPos, ci);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  if (radius < 0.1) return readShadowOpticalDepth(uv, ci, distToTop, distOff);
  float sum = 0.0;
  float phi = interleavedGradientNoise(gl_FragCoord.xy) * 3.14159265 * 2.0;
  for (int i = 0; i < 16; ++i) sum += readShadowOpticalDepth(uv + vogelDisk(i, 16, phi) * radius * u_shadowTexelSize, ci, distToTop, distOff);
  return sum / 16.0;
}

float sampleShadowOpticalDepth(vec3 rayPos, float distOff, float radius, float jitter) {
  float distToTop = getDistanceToShadowTop(rayPos);
  if (distToTop <= 0.0) return 0.0;
  int ci = getFadedCascadeIndex(czm_view, rayPos, u_shadowIntervals, u_cameraNear, u_shadowFar, jitter);
  return ci >= 0 ? sampleShadowOpticalDepthPCF(rayPos, distToTop, distOff, radius, ci) : 0.0;
}

float marchShadowLength(vec3 rayOrigin, vec3 rayDir, vec2 rayNearFar, float jitter) {
  float shadowLen = 0.0;
  float maxDist = rayNearFar.y - rayNearFar.x;
  float stepSize = u_minShadowLengthStepSize;
  float rayDist = stepSize * jitter;
  for (int i = 0; i < 512; i++) {
    if (float(i) >= float(u_maxShadowLengthIterationCount)) break;
    if (rayDist > maxDist) break;
    vec3 pos = rayDir * rayDist + rayOrigin;
    float od = sampleShadowOpticalDepth(pos, 0.0, 0.0, jitter);
    shadowLen += (1.0 - exp(-od)) * stepSize;
    stepSize *= u_perspectiveStepScale;
    rayDist += stepSize;
  }
  return shadowLen;
}

#ifdef USE_ATMOSPHERE_IRRADIANCE
void applyAerialPerspective(vec3 camPos, vec3 frontPos, float dist, float shadowLen, inout vec4 color) {
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(camPos * METER_TO_LENGTH_UNIT, frontPos * METER_TO_LENGTH_UNIT, shadowLen * METER_TO_LENGTH_UNIT, sunDirection, transmittance);
  float horizonBias = smoothstep(20.0, 80.0, dist * METER_TO_LENGTH_UNIT);
  // 【新增】根据太阳高度计算可见度，晚上太阳沉下地平线时 sunVis 为 0
  float sunVis = smoothstep(-0.02, 0.05, dot(normalize(camPos), sunDirection));
  vec3 fakeHorizonColor = vec3(0.5, 0.6, 0.8) * 0.2 * sunVis;
  inscatter = mix(inscatter, inscatter * 0.4 + fakeHorizonColor, horizonBias);
  color.rgb = color.rgb * transmittance + inscatter * color.a * u_aerialPerspectiveScale;
}
#else
void applyAerialPerspective(vec3 camPos, vec3 frontPos, float dist, float shadowLen, inout vec4 color) {
  vec3 rayleigh = vec3(0.005802, 0.013558, 0.033100) * 0.001;
  float h = length(frontPos) - u_bottomRadius;
  float density = exp(-h / 8000.0);
  vec3 transmittance = exp(-dist * rayleigh * density * u_aerialPerspectiveScale);
  // 【新增】太阳可见度衰减
  float sunVis = smoothstep(-0.05, 0.1, dot(normalize(camPos), sunDirection));
  vec3 skyColor = vec3(0.4, 0.6, 1.0) * u_sunIntensity * 0.02 * sunVis;
  color.rgb = color.rgb * transmittance + skyColor * (1.0 - transmittance) * color.a;
}
#endif

vec4 approximateHaze(vec3 ro, vec3 rd, float maxDist, float cosTheta, float shadowLen) {
  float modulation = remapClamped(u_coverageHaze, 0.2, 0.4);
  if (u_cameraHeight * modulation < 0.0) return vec4(0.0);
  float density = modulation * u_hazeDensityScale * exp(-u_cameraHeight * u_hazeExponent);
  if (density < 1e-7) return vec4(0.0);
  vec3 nOrigin = normalize(ro);
  float sunHeight = dot(nOrigin, sunDirection);
  float sunVis = smoothstep(-0.02, 0.05, sunHeight);
  float viewZenith = abs(rd.y);
  float horizonTaming = smoothstep(0.0, 0.15, viewZenith);
  // 即使在天际线，也要保留一点点基础亮度，但不能是 1.0
  horizonTaming = mix(0.3, 1.0, horizonTaming);
  vec3 nHoriz = (ro - dot(ro, rd) * rd) / u_bottomRadius;
  float alpha = remapClamped(dot(nOrigin, nHoriz), 0.9, 1.0);
  vec3 normal = mix(nOrigin, nHoriz, alpha);
  float angle = max(dot(normal, rd), 1e-5);
  float exponent = angle * u_hazeExponent;
  float linearTerm = density / u_hazeExponent / angle;
  float expTerm = 1.0 - exp(-maxDist * exponent);
  float shadowExpTerm = 1.0 - exp(-min(maxDist, shadowLen) * exponent);
  float opticalDepth = expTerm * linearTerm;
  float shadowOD = max((expTerm - shadowExpTerm) * linearTerm, 0.0);
  float transmittance = saturate(1.0 - exp(-opticalDepth));
  float shadowTransmittance = saturate(1.0 - exp(-shadowOD));
  // 【修改】将硬编码的光源强度乘以太阳可见度
  vec3 skyIrradiance = vec3(0.4, 0.6, 1.0) * u_sunIntensity * 0.04 * sunVis * horizonTaming;
  vec3 sunIrradiance = vec3(1.0, 0.95, 0.9) * u_sunIntensity * sunVis;
  float ph = henyeyGreenstein(u_scatterG1, cosTheta) * (1.0 - u_scatterMix) + henyeyGreenstein(u_scatterG2, cosTheta) * u_scatterMix;
  vec3 inscatter = sunIrradiance * ph * shadowTransmittance + skyIrradiance * RECIPROCAL_PI4 * u_skyLightScale * transmittance;
  inscatter *= u_hazeScatteringCoefficient / (u_hazeAbsorptionCoefficient + u_hazeScatteringCoefficient);
  return vec4(inscatter, transmittance);
}

// ── Main raymarch ──
vec4 marchClouds(vec3 rayOrigin, vec3 rd, vec2 rayNearFar, float cosTheta, float jitter, float rayStartTexels, out float frontDepth) {
  float maxDist = min(rayNearFar.y - rayNearFar.x, u_maxRayDistance);
  vec3 radInt = vec3(0.0);
  float transInt = 1.0, wdSum = 0.0, tSum = 0.0;
  float perspDist = min(rayNearFar.x, 3000.0);
  float stepSize = u_minStepSize + (u_perspectiveStepScale - 1.0) * perspDist;
  float rayDist = stepSize * jitter * 2.0;
  #ifdef USE_ATMOSPHERE_IRRADIANCE
  float refRadius = u_bottomRadius;
  #else
  vec3 sunColorBase = vec3(1.0, 0.95, 0.9) * u_sunIntensity;
  vec3 skyColorBase = vec3(0.4, 0.6, 1.0) * u_sunIntensity * u_skyToSunRatio;
  float refRadius = u_bottomRadius;
  vec3 sunDirection = czm_sunDirectionWC;
  #endif

  for (int i = 0; i < 512; i++) {
    if (float(i) >= u_maxSteps) break;
    if (rayDist > maxDist) break;
    if (transInt <= u_minTransmittance) break;
    vec3 position = rayOrigin + rd * rayDist;
    float height = length(position) - refRadius;
    float mipLevel = log2(max(1.0, rayStartTexels + rayDist * 1e-5));
    if (inEmptySpace(height)) { stepSize *= u_perspectiveStepScale; rayDist += mix(stepSize, u_maxStepSize, min(1.0, mipLevel)); continue; }
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);
    if (!any(greaterThan(weather.density, vec4(u_minDensity)))) { stepSize *= u_perspectiveStepScale; rayDist += mix(stepSize, u_maxStepSize, min(1.0, mipLevel)); continue; }
    weather.density.xy *= u_lowLayerDensityBoost;
    MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter);
    if (media.extinction > u_minExtinction) {
      #ifdef USE_ATMOSPHERE_IRRADIANCE
      vec3 skyIrradiance;
      vec3 sunIrradiance = GetSunAndSkyScalarIrradiance(position * METER_TO_LENGTH_UNIT, sunDirection, skyIrradiance);
      float skyGradient = dot(weather.heightFraction * 0.3 + 0.7, media.weight);
      vec3 sunColor = sunIrradiance * u_sunIntensity;
      vec3 skyColor = skyIrradiance * u_sunIntensity * u_skyToSunRatio;
      #else
      float heightAlpha = clamp((height - u_minHeight) / max(u_maxHeight - u_minHeight, 1.0), 0.0, 1.0);
      vec3 sunColor = mix(sunColorBase * 0.95, sunColorBase, heightAlpha);
      vec3 skyColor = mix(skyColorBase * 0.85, skyColorBase, heightAlpha);
      float skyGradient = dot(weather.heightFraction * 0.3 + 0.7, media.weight);
      #endif
      float sunRayDist;
      float opticalDepth = marchOpticalDepthToSun(position, sunDirection, mipLevel, jitter, sunRayDist);
      if (length(position) - refRadius < u_shadowTopHeight && u_useShadowBuffer == 1) {
        vec3 sn = normalize(position);
        float r = u_maxShadowFilterRadius * remapClamped(dot(sunDirection, sn), 0.1, 0.0);
        opticalDepth += sampleShadowOpticalDepth(position, sunRayDist, r, jitter);
      }
      vec3 radiance = sunColor * approximateMultipleScattering(opticalDepth, cosTheta);
      radiance += skyColor * RECIPROCAL_PI4 * skyGradient * u_skyLightScale;
      // 环境光地板：模拟地面反射 + 深层多次散射，防止云底纯黑（现实中云底为浅灰）
      radiance += skyColor * RECIPROCAL_PI4 * 0.2 * u_skyLightScale;
      radiance *= media.scattering * (1.0 - u_powderScale * exp(-media.extinction * u_powderExponent));
      float transmittance = exp(-media.extinction * stepSize);
      vec3 scatInt = (radiance - radiance * transmittance) / max(media.extinction, 1e-7);
      radInt += transInt * scatInt;
      transInt *= transmittance;
      wdSum += rayDist * transInt;
      tSum += transInt;
    }
    stepSize *= u_perspectiveStepScale;
    rayDist += stepSize;
  }
  frontDepth = tSum > 0.0 ? wdSum / tSum : -1.0;
  float alpha = saturate(remapClamped(transInt, 1.0, u_minTransmittance));
  return vec4(radInt, alpha);
}

void main() {
  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  float depth = czm_readDepth(depthTexture, v_textureCoordinates);
  vec3 ro, rd;
  reconstructRay(ro, rd);
  #ifndef USE_ATMOSPHERE_IRRADIANCE
  vec3 sunDirection = czm_sunDirectionWC;
  #endif
  float jitter = getSTBN();
  bool ground; vec4 first, second;
  getIntersections(ro, rd, ground, first, second);
  vec2 rayNearFar = getRayNearFar(ground, first, second);
  vec2 shadowNF = vec2(-1.0), hazeNF = vec2(-1.0);
  if (u_shadowLengthEnabled == 1) shadowNF = getShadowRayNearFar(ground, first, second);
  if (u_hazeEnabled == 1) hazeNF = getHazeRayNearFar(ground, first, second);

  // depthTestAgainstTerrain 只影响 Globe/贴地物体与地形网格的深度关系，不能替后处理修正「沿像素射线」的距离。
  // 此处必须用 inverseView 还原命中点，再沿 rd 求距离；用 -viewZ/dot(rd, forward) 在离轴像素上会偏大 → 云压在地形前。
  float rayDistToScene = 0.0;
  if (depth < 1.0 - 1e-7) {
    vec4 eyePos = czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy, depth, 1.0));
    if (abs(eyePos.w) > 1e-6) {
      eyePos /= eyePos.w;
      if (eyePos.z < 0.0) {
        vec4 worldPos4 = czm_inverseView * eyePos;
        vec3 worldHit = worldPos4.xyz + u_altitudeCorrection;
        rayDistToScene = max(0.0, dot(worldHit - ro, rd));
      }
    }
  }
  float tMax = rayNearFar.y;
  // 原逻辑：低于云层且 !ground 时跳过深度钳位 —— 平视/看山体时 ground 常为 false，会整屏不钳位 → 云盖住地形。
  // 仅当该像素无场景深度（天空）时才允许跳过；有地形/几何时必须用 rayDistToScene 截断射线。
  const float DEPTH_SKY = 1.0 - 1e-7;
  bool skipDepthClamp =
    (depth >= DEPTH_SKY) && (u_cameraHeight < u_minHeight) && (!ground);
  if (rayDistToScene > 0.0 && !skipDepthClamp) {
    tMax = min(tMax, rayDistToScene);
    if (u_shadowLengthEnabled == 1 && shadowNF.y > 0.0) shadowNF.y = min(shadowNF.y, rayDistToScene);
    if (u_hazeEnabled == 1 && hazeNF.y > 0.0) hazeNF.y = min(hazeNF.y, rayDistToScene);
  }
  if (rayNearFar.x >= tMax) { out_FragColor = sceneColor; return; }

  float frontDepth;
  float cosTheta = dot(rd, sunDirection);
  vec2 globeUv = getGlobeUv(ro + rd * rayNearFar.x);
  float mipLevel = getMipLevel(globeUv * u_weatherRepeat) * u_mipLevelScale;
  mipLevel = mix(0.0, mipLevel, min(1.0, 0.2 * u_cameraHeight / max(u_maxHeight, 1.0)));
  vec4 cloudColor = marchClouds(ro + rd * rayNearFar.x, rd, vec2(rayNearFar.x, tMax), cosTheta, jitter, pow(2.0, mipLevel), frontDepth);

  // 远处云透明度距离衰减：用"相机到云层入口距离"（rayNearFar.x）衰减 alpha，
  // 而非云内穿行距离。天顶云入口近不衰减，天际线云入口远衰减——只压远处透明度，不影响各层密度。
  // 这解决斜射时云层路径长导致 alpha 堆积的问题，且不误伤高空稀疏层（层2 近处不衰减）。
  float entryFade = 1.0 - smoothstep(u_distFadeStart, u_distFadeEnd, rayNearFar.x);
  cloudColor.a *= entryFade;
  cloudColor.rgb *= entryFade;

  // 相机高度渐变淡出：升过云顶后线性衰减，避免硬切消失
  float altitudeFade = 1.0 - smoothstep(u_altitudeFadeStart, u_altitudeFadeEnd, u_cameraHeight);
  cloudColor.a *= altitudeFade;
  cloudColor.rgb *= altitudeFade;

  float shadowLen = 0.0;
  bool hitClouds = frontDepth > 0.0 && cloudColor.a > max(u_edgeAlphaCutoff, 0.02);
  float rayFrontT = rayNearFar.x + frontDepth;

  if (hitClouds) {
    if (u_shadowLengthEnabled == 1 && all(greaterThanEqual(shadowNF, vec2(0.0)))) {
      shadowNF.y = mix(shadowNF.y, min(rayFrontT, shadowNF.y), cloudColor.a);
      shadowLen = marchShadowLength(ro + rd * shadowNF.x, rd, shadowNF, jitter);
    }
    if (u_hazeEnabled == 1 && all(greaterThanEqual(hazeNF, vec2(0.0))))
      hazeNF.y = mix(hazeNF.y, min(rayFrontT, hazeNF.y), cloudColor.a);
      applyAerialPerspective(ro, ro + rd * rayFrontT, rayFrontT, shadowLen, cloudColor);
    } else if (u_shadowLengthEnabled == 1 && all(greaterThanEqual(shadowNF, vec2(0.0)))) {
    shadowLen = marchShadowLength(ro + rd * shadowNF.x, rd, shadowNF, jitter);
  }

  if (u_hazeEnabled == 1) {
    float hazeDist = all(greaterThanEqual(hazeNF, vec2(0.0))) ? (hazeNF.y - hazeNF.x) : 0.0;
    vec4 haze = approximateHaze(ro, rd, hazeDist, cosTheta, shadowLen);
    cloudColor.rgb = mix(cloudColor.rgb, haze.rgb, haze.a);
    cloudColor.a = cloudColor.a * (1.0 - haze.a) + haze.a;
  }

  // 边缘裁剪：低 alpha 区域直接清零，避免云边缘细碎噪点与闪烁
  if (cloudColor.a < u_edgeAlphaCutoff) {
    cloudColor = vec4(0.0);
  }
  // 边缘裁剪后再判一次：防止“已被裁掉的薄云像素”仍进入 TAA，导致底层模型抖动
  hitClouds = hitClouds && (cloudColor.a > max(u_edgeAlphaCutoff, 0.02));

  // 边缘稳噪：低 alpha 处直接除以 alpha 会把随机误差放大成亮点/闪点
  float edgeSafeAlpha = max(cloudColor.a, 0.08);
  vec3 cloudActual = cloudColor.rgb / edgeSafeAlpha;
  cloudActual = ACESFilmic(cloudActual * u_cloudExposure);
  cloudActual = pow(cloudActual, vec3(1.0 / 2.2));

  vec4 composited = vec4(
    sceneColor.rgb * (1.0 - cloudColor.a) + cloudActual * cloudColor.a,
    // 让 history.a 表示“云覆盖度”，用于后续 TAA 历史有效性判定
    cloudColor.a
  );
  // 在最终云合成色上去品红，按云覆盖度加权，确保无云区域不受影响
  vec3 compositedNoMagenta = reduceMagenta(composited.rgb, u_magentaFixStrength);
  float cloudW = smoothstep(0.02, 0.3, cloudColor.a);
  composited.rgb = mix(composited.rgb, compositedNoMagenta, cloudW);

  if (u_temporalEnabled > 0 && hitClouds) {
    vec3 worldPos = ro + rd * rayFrontT - u_altitudeCorrection;
    vec4 prevClip = u_prevViewProjection * vec4(worldPos, 1.0);
    vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
    if (prevUv.x >= 0.0 && prevUv.x <= 1.0 && prevUv.y >= 0.0 && prevUv.y <= 1.0) {
      vec4 history = texture(u_historyTexture, prevUv);
      // TAA 仅对“云增量”做融合，底层模型保持当前帧，减少模型虚影
      vec3 deltaNow = composited.rgb - sceneColor.rgb;
      vec3 deltaHist = history.rgb - sceneColor.rgb;
      float maxDiff = max(abs(deltaHist.r - deltaNow.r), max(abs(deltaHist.g - deltaNow.g), abs(deltaHist.b - deltaNow.b)));
      float reject = max(
        smoothstep(0.35, 0.75, maxDiff),
        smoothstep(0.004, 0.03, length(prevUv - v_textureCoordinates))
      );
      // 让低透明边缘也参与历史融合，抑制云边缘噪点“跳闪”
      float opacityW = smoothstep(0.015, 0.25, cloudColor.a);
      float a = mix(1.0, mix(u_temporalAlpha, 1.0, reject), opacityW);
      // 仅当“当前与历史”都存在足够云覆盖时才使用历史，避免把模型底色抖动带入
      float historyCloudW = smoothstep(0.02, 0.12, history.a);
      float currentCloudW = smoothstep(0.02, 0.12, cloudColor.a);
      float cloudHistoryValidity = min(historyCloudW, currentCloudW);
      a = mix(1.0, a, cloudHistoryValidity);
      vec3 deltaFiltered = mix(deltaHist, deltaNow, a);
      composited.rgb = sceneColor.rgb + deltaFiltered;
      composited.a = cloudColor.a;
    }
  }
  out_FragColor = composited;
}
`;
}

// ─── Helper: compile & link GL program ─────────────────────────────────────

function createGLProgram(gl, vsSource, fsSource, label) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vsSource);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { console.error(`[${label}] VS:`, gl.getShaderInfoLog(vs)); gl.deleteShader(vs); return null; }
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fsSource);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error(`[${label}] FS:`, gl.getShaderInfoLog(fs)); gl.deleteShader(vs); gl.deleteShader(fs); return null; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(`[${label}] link:`, gl.getProgramInfoLog(prog)); gl.deleteProgram(prog); return null; }
  return prog;
}

// ─── Main pipeline class ──────────────────────────────────────────────────

export class ThreeGeospatialPipeline {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.atmosphereParams = options.atmosphereParams ?? new AtmosphereParameters();
    this._frameCount = 0;
    this._gui = null;
    /** @type {boolean} 是否创建 dat.gui 调参面板（WebGIS 默认 false） */
    this.enableGui = options.enableGui === true;

    // 可配置的资源/shader 根路径（均带默认值，便于在任意部署路径下使用）
    this.assetsBase = options.cloudsAssetsBase ?? DEFAULT_CLOUDS_ASSETS_BASE;
    this.brunetonShaderBase = options.brunetonShaderBase ?? DEFAULT_BRUNETON_SHADER_BASE;
    this.blueNoiseUrl = options.blueNoiseUrl ?? DEFAULT_BLUE_NOISE_URL;
    this.atmosphereAssetsBase = options.atmosphereAssetsBase ?? DEFAULT_ATMOSPHERE_ASSETS_BASE;
    this.atmosphereShaderBase = options.atmosphereShaderBase ?? DEFAULT_ATMOSPHERE_SHADER_BASE;

    // bottomRadius 统一从 atmosphereParams 派生（V3.3.20 修复）：
    // 此前 params.bottomRadius=6371860 与 AtmosphereParameters.bottomRadius=6371030 双值并存，
    // 导致云层基准球(u_bottomRadius)与相机偏移基准球(u_altitudeCorrection)错位 ~830m，
    // 云漂浮高度错误、BSM 求交错位、移动抖动。现在统一以 atmosphereParams 为唯一真源。
    const bottomRadiusMeters = Number(this.atmosphereParams?.bottomRadius) || 6371030;

    this.params = {
      cloudsVisible: true,
      bottomRadius: bottomRadiusMeters,
      layers: [
        { channel: 'r', altitude: 1800, height: 650, densityScale: 0.2, shapeAmount: 1.0, shapeDetailAmount: 1.0, weatherExponent: 1.0, shapeAlteringBias: 0.35, coverageFilterWidth: 0.6, coverage: 0.3, densityProfile: { expTerm: 0, exponent: 0, linearTerm: 0.75, constantTerm: 0.25 } },
        { channel: 'g', altitude: 2400, height: 1200, densityScale: 0.2, shapeAmount: 1.0, shapeDetailAmount: 1.0, weatherExponent: 1.0, shapeAlteringBias: 0.35, coverageFilterWidth: 0.6, coverage: 0.3, densityProfile: { expTerm: 0, exponent: 0, linearTerm: 0.75, constantTerm: 0.25 } },
        { channel: 'b', altitude: 7500, height: 500, densityScale: 0.003, shapeAmount: 0.4, shapeDetailAmount: 0.0, weatherExponent: 1.0, shapeAlteringBias: 0.35, coverageFilterWidth: 0.5, coverage: 0.3, densityProfile: { expTerm: 0, exponent: 0, linearTerm: 0.75, constantTerm: 0.25 } },
        { channel: 'a' }
      ],
      maxSteps: 500, maxStepsToSun: 8, minStepSize: 20.0, maxStepSize: 1000.0, maxRayDistance: 200000.0,
      perspectiveStepScale: 1.005, minDensity: 1e-5, minExtinction: 1e-5, minTransmittance: 0.01,
      // 远处云距离衰减（米）：天际线附近射线斜穿云层累积过密，从 distFadeStart 起线性衰减到 distFadeEnd 完全消失
      distFadeStart: 11000.0, distFadeEnd: 51000.0,
      // 相机高度淡出（米）：相机升过云顶后，在 altitudeFadeRange 范围内线性淡出至消失
      altitudeFadeRange: 8000.0,
      minSecondaryStepSize: 100.0, secondaryStepScale: 2.0, multiScatteringOctaves: 8, lowLayerDensityBoost: 1.0,
      shadowLengthEnabled: true, useShadowBuffer: true, hazeEnabled: false,
      maxShadowLengthIterationCount: 500, minShadowLengthStepSize: 50.0, maxShadowLengthRayDistance: 200000.0,
      hazeDensityScale: 3e-5, hazeExponent: 1e-3, hazeScatteringCoefficient: 0.9, hazeAbsorptionCoefficient: 0.5,
      weatherRepeat: 100.0, shapeRepeat: 4.1, shapeDetailRepeat: 0.0005,
      turbulenceRepeat: 2.0, turbulenceDisplacement: 400.0,
      scatteringCoefficient: 1.0, absorptionCoefficient: 0.0,
      scatterG1: 0.7, scatterG2: -0.2, scatterMix: 0.5,
      sunIntensity: 20.0, skyLightScale: 1.0, skyToSunRatio: 0.28,
      powderScale: 0.8, powderExponent: 150.0,
      aerialPerspectiveScale: 0.0, cloudExposure: 3.0, magentaFixStrength: 2.0, edgeAlphaCutoff: 0.0, mipLevelScale: 0.35,
      windSpeed: 0.0, evolutionSpeed: 0.005,
      temporalEnabled: false, temporalAlpha: 0.1,
      blueNoiseScale: 1.0, jitterStrength: 1.0,
      // BSM cascade 几何：shadowFar 控制覆盖最远距离，splitLambda 控制近处分配，fadeScale 扩大 ortho radius 防切割
      // fadeScale 提高以扩大 ortho 覆盖，避免 cascade 矩形外硬切；不再依赖 UV edgeFade
      // shadowFar 对齐云可见距离量级（云 maxRayDistance=200000），否则超过 shadowFar 的云看得见但不产生 BSM、
      // cascade 边界硬切导致移动时阴影弹出。可经面板下调以换取帧率。
      shadowFar: 120000, shadowSplitLambda: 1.0, shadowFadeScale: 5.0,
    };

    this.atmosphere = null;
    this.aerial = null;
    this.cloudStage = null;
    this.textures = null;
    this._ready = null;

    // BSM state
    this._bsm = { pass: null, resolve: null, blitFbo: null, blitProg: null, blitVbo: null };
    /** V3.3.20：每帧 _syncBSM blit 写入的共享 Cesium.Texture，供主云 stage u_shadowBuffer 采样 */
    this._bsmSharedTexture = null;
    // TAA state
    this._taa = { texA: null, texB: null, current: 0, pbo: null, pboReady: false, w: 0, h: 0, frameCount: 0, prevVP: null, curVP: null };
    // Wind offsets
    this._weatherOffsetX = 0; this._weatherOffsetY = 0;
    this._shapeOffsetX = 0; this._shapeOffsetY = 0; this._shapeOffsetZ = 0;
    this._shapeDetailOffsetX = 0; this._shapeDetailOffsetY = 0; this._shapeDetailOffsetZ = 0;
    this._lastFrameTime = undefined;
    this._listeners = [];
  }

  // ── Texture loading ────────────────────────────────────────────────────

  async _load3DTexture(url, size) {
    const data3D = await loadBinThreeGeospatial(url, size);
    return bindData3DTextureToCesiumContext(this.viewer, data3D, Cesium);
  }

  async _load3DTextureWHD(url, width, height, depth) {
    const arrayBuffer = await Cesium.Resource.fetchArrayBuffer(url);
    const raw = new Uint8Array(arrayBuffer);
    return new Cesium.Texture3D({
      context: this.viewer.scene.context,
      width,
      height,
      depth,
      pixelFormat: Cesium.PixelFormat.RED,
      pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
      source: {
        arrayBufferView: raw,
        width,
        height,
        depth,
      },
      sampler: new Cesium.Sampler({
        minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
        magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
        wrapS: Cesium.TextureWrap.REPEAT,
        wrapT: Cesium.TextureWrap.REPEAT,
        wrapR: Cesium.TextureWrap.REPEAT,
      }),
    });
  }

  async _load2DTexture(url) {
    const img = await Cesium.Resource.fetchImage(url);
    if (!img || img.width <= 2 || img.height <= 2) throw new Error(`Invalid image: ${url}`);
    return new Cesium.Texture({
      context: this.viewer.scene.context, source: img,
      sampler: new Cesium.Sampler({ minificationFilter: Cesium.TextureMinificationFilter.LINEAR, magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR, wrapS: Cesium.TextureWrap.REPEAT, wrapT: Cesium.TextureWrap.REPEAT })
    });
  }

  async _loadTextures() {
    const bp = this.assetsBase;
    const [shape, detail, stbn, weather, turb, noise] = await Promise.all([
      this._load3DTexture(bp + "shape.bin", 128).catch(() => null),
      this._load3DTexture(bp + "shape_detail.bin", 32).catch(() => null),
      this._load3DTextureWHD(bp + "stbn.bin", 128, 128, 64).catch(() => null),
      this._load2DTexture(bp + "local_weather.png").catch(() => null),
      this._load2DTexture(bp + "turbulence.png").catch(() => null),
      this._load2DTexture(this.blueNoiseUrl).catch(() => null),
    ]);
    this.textures = { shape, shapeDetail: detail, stbn, weather, turbulence: turb, blueNoise: noise };
    console.warn("[Pipeline] textures:", Object.fromEntries(Object.entries(this.textures).map(([k, v]) => [k, !!v])));
  }

  // ── Shader loading for Bruneton prefix ─────────────────────────────────

  async _loadShader(name) {
    return loadShaderSource(name, { shaderBaseUrl: this.brunetonShaderBase });
  }

  async _buildCloudFragmentShader() {
    const provider = this.atmosphere.getAtmosphereForClouds();
    const [definitions, common, runtime] = await Promise.all([
      this._loadShader("definitions.glsl"),
      this._loadShader("common.glsl"),
      this._loadShader("runtime.glsl"),
    ]);
    const defines = "precision highp float;\nprecision highp sampler2D;\nprecision highp sampler3D;\n"
      + provider.constants.getShaderDefines()
      + "\n#define METER_TO_LENGTH_UNIT 0.001\n#define USE_ATMOSPHERE_IRRADIANCE\n";
    const globalU = `
uniform vec3 sunDirection;
uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler2D irradiance_texture;
`;
    return defines + definitions + "\n" + common + "\n" + globalU + "\n" + runtime + "\n" + getCloudFragmentShader();
  }

  // ── Wind animation ─────────────────────────────────────────────────────

  _advanceOffsets() {
    const now = performance.now() / 1000;
    if (this._lastFrameTime !== undefined) {
      const dt = now - this._lastFrameTime;
      this._weatherOffsetX += (this.params.windSpeed || 0) * dt;
      this._shapeOffsetX += (this.params.evolutionSpeed || 0) * dt;
      this._shapeDetailOffsetX += (this.params.evolutionSpeed || 0) * 2 * dt;
    }
    this._lastFrameTime = now;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  _getDensityProfileVec4(key) {
    const ls = this.params.layers, def = k => k === "linearTerm" ? 0.75 : k === "constantTerm" ? 0.25 : 0;
    return new Cesium.Cartesian4(...[0,1,2,3].map(i => {
      const val = ls[i]?.densityProfile?.[key];
      return val !== undefined ? Number(val) : def(key);
    }));
  }

  _getIntervalHeights() {
    const ls = this.params.layers, entries = [];
    for (let i = 0; i < 4; i++) { const a = Number(ls[i]?.altitude) || 0, h = Number(ls[i]?.height) || 0; entries.push({ v: a, flag: 0 }, { v: a + h, flag: 1 }); }
    entries.sort((a, b) => a.v !== b.v ? a.v - b.v : a.flag - b.flag);
    const intervals = [{ min: 0, max: 0 }, { min: 0, max: 0 }, { min: 0, max: 0 }];
    let idx = 0, balance = 0;
    for (let i = 0; i < entries.length; i++) { if (balance === 0 && i > 0) { intervals[idx] = { min: entries[i - 1].v, max: entries[i].v }; idx++; } balance += entries[i].flag === 0 ? 1 : -1; }
    return { min: new Cesium.Cartesian3(intervals[0].min, intervals[1].min, intervals[2].min), max: new Cesium.Cartesian3(intervals[0].max, intervals[1].max, intervals[2].max) };
  }

  _getLayerVec4(key, fallback = 0) {
    const ls = this.params.layers;
    return new Cesium.Cartesian4(...[0,1,2,3].map(i => {
      const val = ls[i]?.[key];
      return val !== undefined ? Number(val) : fallback;
    }));
  }

  _getAltitudeCorrectionOffset(bottomRadius) {
    const ellipsoid = this.viewer?.scene?.globe?.ellipsoid;
    const cameraPos = this.viewer?.camera?.positionWC;
    if (!ellipsoid || !cameraPos) return Cesium.Cartesian3.ZERO.clone();
    const carto = Cesium.Cartographic.fromCartesian(cameraPos, ellipsoid);
    if (!carto) return Cesium.Cartesian3.ZERO.clone();
    const surface = Cesium.Cartesian3.fromRadians(
      carto.longitude,
      carto.latitude,
      0.0,
      ellipsoid
    );
    const normal = ellipsoid.geodeticSurfaceNormal(surface, new Cesium.Cartesian3());
    const center = Cesium.Cartesian3.subtract(
      surface,
      Cesium.Cartesian3.multiplyByScalar(normal, Number(bottomRadius) || 0, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    return Cesium.Cartesian3.negate(center, new Cesium.Cartesian3());
  }

  _getMinHeight() { const ls = this.params.layers; let m = Infinity; for (let i = 0; i < 4; i++) { if ((Number(ls[i]?.height) || 0) > 0) m = Math.min(m, Number(ls[i]?.altitude) || 0); } return Number.isFinite(m) ? m : 0; }
  _getMaxHeight() { const ls = this.params.layers; let m = 0; for (let i = 0; i < 4; i++) { const h = Number(ls[i]?.height) || 0; if (h > 0) m = Math.max(m, (Number(ls[i]?.altitude) || 0) + h); } return m; }

  // ── Cloud PostProcessStage uniform map ─────────────────────────────────

  _buildCloudUniforms() {
    const self = this, p = () => self.params, tex = () => self.textures;
    const provider = this.atmosphere.getAtmosphereForClouds();
    const atm = provider.getUniforms();
    const u = {
      u_shapeTexture: () => tex()?.shape,
      u_shapeDetailTexture: () => tex()?.shapeDetail,
      u_stbnTexture: () => tex()?.stbn || tex()?.shape,
      u_weatherTexture: () => tex()?.weather,
      u_turbulenceTexture: () => tex()?.turbulence,
      u_blueNoise: () => tex()?.blueNoise,
      u_blueNoiseScale: () => p().blueNoiseScale ?? 1.0,
      u_jitterStrength: () => p().jitterStrength ?? 1.0,
      u_cameraPosition: () => self.viewer.camera.positionWC,
      u_altitudeCorrection: () => {
        const br = Number(atm.bottomRadius()) || Number(p().bottomRadius) || 0;
        return self._getAltitudeCorrectionOffset(br);
      },
      u_cameraHeight: () => {
        const corr = u.u_altitudeCorrection();
        const pos = Cesium.Cartesian3.add(self.viewer.camera.positionWC, corr, new Cesium.Cartesian3());
        const br = Number(atm.bottomRadius()) || Number(p().bottomRadius) || 0;
        return Math.max(0, Cesium.Cartesian3.magnitude(pos) - br);
      },
      u_bottomRadius: () => Number(p().bottomRadius),
      u_minHeight: () => self._getMinHeight(),
      u_maxHeight: () => self._getMaxHeight(),
      u_minLayerHeights: () => self._getLayerVec4("altitude", 0),
      u_maxLayerHeights: () => { const ls = p().layers; return new Cesium.Cartesian4(...[0,1,2,3].map(i => (Number(ls[i]?.altitude)||0)+(Number(ls[i]?.height)||0))); },
      u_densityScales: () => self._getLayerVec4("densityScale", 0),
      u_shapeAmounts: () => self._getLayerVec4("shapeAmount", 0),
      u_shapeDetailAmounts: () => self._getLayerVec4("shapeDetailAmount", 0),
      u_weatherExponents: () => self._getLayerVec4("weatherExponent", 1),
      u_shapeAlteringBiases: () => self._getLayerVec4("shapeAlteringBias", 0.35),
      u_coverageFilterWidths: () => self._getLayerVec4("coverageFilterWidth", 0.6),
      u_maxSteps: () => p().maxSteps, u_maxStepsToSun: () => p().maxStepsToSun,
      u_minStepSize: () => p().minStepSize, u_maxStepSize: () => p().maxStepSize,
      u_maxRayDistance: () => p().maxRayDistance,
      u_distFadeStart: () => Number(p().distFadeStart) || 30000.0,
      u_distFadeEnd: () => Number(p().distFadeEnd) || 150000.0,
      u_altitudeFadeStart: () => self._getMaxHeight(),
      u_altitudeFadeEnd: () => self._getMaxHeight() + (Number(p().altitudeFadeRange) || 8000.0),
      u_cameraNear: () => Number(self.viewer.camera.frustum?.near) || 0,
      u_shadowTopHeight: () => self._getMaxHeight(),
      u_shadowLengthEnabled: () => p().shadowLengthEnabled ? 1 : 0,
      u_hazeEnabled: () => p().hazeEnabled ? 1 : 0,
      u_maxShadowLengthIterationCount: () => p().maxShadowLengthIterationCount,
      u_minShadowLengthStepSize: () => p().minShadowLengthStepSize,
      u_maxShadowLengthRayDistance: () => p().maxShadowLengthRayDistance,
      u_hazeDensityScale: () => p().hazeDensityScale, u_hazeExponent: () => p().hazeExponent,
      u_hazeScatteringCoefficient: () => p().hazeScatteringCoefficient,
      u_hazeAbsorptionCoefficient: () => p().hazeAbsorptionCoefficient,
      u_shadowBuffer: () => {
        if (p().useShadowBuffer && self._bsm.pass) {
          // V3.3.20 修复：不再返回自定义 bind() 对象——Cesium PostProcessStage uniform 采样走内部逻辑，
          // 不会调用自定义 bind，导致 BSM 纹理绑不上/采样残留。改为返回 _syncBSM 已 blit 写入的共享
          // Cesium.Texture（getCloudShadowTargetTexture），与 atmosphere/aerial 两侧 setCloudShadow 同源。
          const shared = self._bsmSharedTexture;
          if (shared) return shared;
          // 退化路径：无共享目标时回退到 pass 的原生 Cesium.Texture（CloudShadowPass 已用 Cesium.Texture 包 RT）
          const passTex = self._bsm.pass.getTexture?.();
          if (passTex) return passTex;
        }
        return tex()?.weather;
      },
      u_shadowTexelSize: () => { const tile = self._bsm.pass ? Math.floor(SHADOW_MAP_SIZE / 2) : 512; return new Cesium.Cartesian2(1 / tile, 1 / tile); },
      u_shadowIntervals: () => { if (p().useShadowBuffer && self._bsm.pass) { 
        const iv = self._bsm.pass.getShadowIntervals(); // 使用 Getter
        return iv.map(a => new Cesium.Cartesian2(a[0], a[1])); 
      } 
      return Array(4).fill(null).map(() => new Cesium.Cartesian2(0, 0)); },
      u_shadowMatrices: () => { if (p().useShadowBuffer && self._bsm.pass) return self._bsm.pass._shadowMatrices.map(m => Cesium.Matrix4.fromArray(m)); return Array(4).fill(null).map(() => Cesium.Matrix4.IDENTITY.clone()); },
      u_shadowFar: () => self._bsm.pass ? self._bsm.pass._shadowFar : p().maxShadowLengthRayDistance,
      u_maxShadowFilterRadius: () => 2.0,
      u_useShadowBuffer: () => p().useShadowBuffer ? 1 : 0,
      u_skyLightScale: () => p().skyLightScale,
      u_weatherRepeat: () => p().weatherRepeat,
      u_localWeatherOffset: () => { self._advanceOffsets(); return new Cesium.Cartesian2(self._weatherOffsetX, self._weatherOffsetY); },
      u_shapeRepeat: () => (Number(p().shapeRepeat) || 3) / 1e4,
      u_shapeOffset: () => { self._advanceOffsets(); return new Cesium.Cartesian3(self._shapeOffsetX, self._shapeOffsetY, self._shapeOffsetZ); },
      u_shapeDetailRepeat: () => p().shapeDetailRepeat,
      u_shapeDetailOffset: () => { self._advanceOffsets(); return new Cesium.Cartesian3(self._shapeDetailOffsetX, self._shapeDetailOffsetY, self._shapeDetailOffsetZ); },
      u_turbulenceRepeat: () => p().turbulenceRepeat, u_turbulenceDisplacement: () => p().turbulenceDisplacement,
      u_coverages: () => self._getLayerVec4("coverage", 0.3),
      u_coverageHaze: () => { const ls = p().layers; return Math.max(Number(ls[0]?.coverage) ?? 0.3, Number(ls[1]?.coverage) ?? 0.3, Number(ls[2]?.coverage) ?? 0.3); },
      u_scatteringCoefficient: () => p().scatteringCoefficient, u_absorptionCoefficient: () => p().absorptionCoefficient,
      u_scatterG1: () => p().scatterG1, u_scatterG2: () => p().scatterG2, u_scatterMix: () => p().scatterMix,
      u_sunIntensity: () => p().sunIntensity, u_skyToSunRatio: () => p().skyToSunRatio,
      u_powderScale: () => p().powderScale, u_powderExponent: () => p().powderExponent,
      u_aerialPerspectiveScale: () => p().aerialPerspectiveScale, u_cloudExposure: () => p().cloudExposure,
      u_magentaFixStrength: () => p().magentaFixStrength ?? 0.8,
      u_edgeAlphaCutoff: () => p().edgeAlphaCutoff ?? 0.03,
      u_resolution: () => { const ctx = self.viewer.scene.context; return new Cesium.Cartesian2(ctx.drawingBufferWidth || 1, ctx.drawingBufferHeight || 1); },
      u_mipLevelScale: () => Number(p().mipLevelScale) || 1.0,
      u_perspectiveStepScale: () => p().perspectiveStepScale ?? 1.01,
      u_minDensity: () => p().minDensity ?? 1e-5, u_minExtinction: () => p().minExtinction ?? 1e-5,
      u_minTransmittance: () => p().minTransmittance ?? 0.01,
      u_minSecondaryStepSize: () => p().minSecondaryStepSize ?? 100, u_secondaryStepScale: () => p().secondaryStepScale ?? 2,
      u_multiScatteringOctaves: () => Math.min(12, Math.max(1, p().multiScatteringOctaves ?? 8)),
      u_lowLayerDensityBoost: () => p().lowLayerDensityBoost ?? 1.0,
      u_densityProfileExpTerms: () => self._getDensityProfileVec4("expTerm"),
      u_densityProfileExponents: () => self._getDensityProfileVec4("exponent"),
      u_densityProfileLinearTerms: () => self._getDensityProfileVec4("linearTerm"),
      u_densityProfileConstantTerms: () => self._getDensityProfileVec4("constantTerm"),
      u_minIntervalHeights: () => self._getIntervalHeights().min,
      u_maxIntervalHeights: () => self._getIntervalHeights().max,
      u_historyTexture: () => { const t = self._taaGetHistoryTexture(); return t || tex()?.blueNoise; },
      u_prevViewProjection: () => self._taa.prevVP || Cesium.Matrix4.IDENTITY,
      u_temporalAlpha: () => p().temporalAlpha ?? 0.1,
      u_temporalEnabled: () => (p().temporalEnabled && self._taa.frameCount > 2 && self._taa.prevVP) ? 1 : 0,
      u_frame: () => self._frameCount || 0,
    };

    Object.assign(u, atm);
    u.u_cameraPosition = atm.cameraPosition;
    u.u_bottomRadius = atm.bottomRadius;
    return u;
  }

  // ── BSM helpers ─────────────────────────────────────────────────────────

  /**
   * 返回 resolve pass 当前输出纹理（裸 WebGLTexture 句柄）。
   * V3.3.20：不再用作 u_shadowBuffer 返回值（自定义 bind 不被 Cesium 识别）。
   * 仅保留供 _syncBSM 内部 blit 读取 resolve 输出。
   */
  _bsmResolveGetTexture() {
    const r = this._bsm.resolve;
    const tex = r ? r._historyTex : (this._bsm.pass ? this._bsm.pass._colorTexture : null);
    return tex ? { _texture: tex } : null;
  }

  _taaGetHistoryTexture() {
    const gl = this.viewer.scene.context?._gl;
    if (!gl) return null;
    const tex = this._taa.current === 0 ? this._taa.texA : this._taa.texB;
    if (!tex) return null;
    return { _texture: tex, _textureTarget: gl.TEXTURE_2D, _target: gl.TEXTURE_2D };
  }

  // ── BSM blit to Cesium.Texture ─────────────────────────────────────────

  _blitBSM(sourceTex, targetCesiumTex, scale) {
    const gl = this.viewer.scene.context?._gl;
    if (!gl || !sourceTex?._texture || !targetCesiumTex?._texture) return;
    if (!this._bsm.blitFbo) {
      this._bsm.blitFbo = gl.createFramebuffer();
      this._bsm.blitProg = createGLProgram(gl,
        `#version 300 es\nin vec2 a_pos;\nout vec2 v_uv;\nvoid main(){v_uv=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0,1);}`,
        `#version 300 es\nprecision highp float;\nuniform sampler2D u_src;\nuniform float u_scale;\nin vec2 v_uv;\nout vec4 o;\nvoid main(){vec4 raw=texture(u_src,v_uv);\n  // 编码：rgba *= scale。HALF_FLOAT(scale=1)等价透传；RGBA8(scale=0.02)压到0..1，消费端 /scale 还原。\n  o=vec4(raw.rgb*u_scale, raw.a*u_scale);}`,
        "BSMBlit");
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      this._bsm.blitVbo = vbo;
    }
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING), prevVp = gl.getParameter(gl.VIEWPORT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._bsm.blitFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetCesiumTex._texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo); gl.viewport(...prevVp); return; }
    gl.viewport(0, 0, BSM_BLIT_SIZE, BSM_BLIT_SIZE);
    gl.useProgram(this._bsm.blitProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sourceTex._texture);
    gl.uniform1i(gl.getUniformLocation(this._bsm.blitProg, "u_src"), 0);
    gl.uniform1f(gl.getUniformLocation(this._bsm.blitProg, "u_scale"), scale);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bsm.blitVbo);
    const aloc = gl.getAttribLocation(this._bsm.blitProg, "a_pos");
    if (aloc >= 0) { gl.enableVertexAttribArray(aloc); gl.vertexAttribPointer(aloc, 2, gl.FLOAT, false, 0, 0); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (aloc >= 0) gl.disableVertexAttribArray(aloc);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo); gl.viewport(prevVp[0], prevVp[1], prevVp[2], prevVp[3]);
  }

  // ── BSM sync to Atmosphere + Aerial ────────────────────────────────────

  _syncBSM() {
    const sp = this._bsm.pass;
    if (!sp || !this.params.useShadowBuffer) {
      this.atmosphere?.setCloudShadow?.({ enabled: false });
      this.aerial?.setCloudShadow?.({ enabled: false });
      return;
    }
    sp.updateDynamicParams({
      localWeatherOffset: [this._weatherOffsetX || 0, this._weatherOffsetY || 0],
      shapeOffset: [this._shapeOffsetX || 0, this._shapeOffsetY || 0, this._shapeOffsetZ || 0],
      shapeDetailOffset: [this._shapeDetailOffsetX || 0, this._shapeDetailOffsetY || 0, this._shapeDetailOffsetZ || 0],
      bottomRadius: this.params.bottomRadius,
      // 每帧同步 shadow cascade far，限制到云层相关距离（避免 Cesium frustum.far~8e8 导致矩阵 NaN）
      shadowFar: Number(this.params.shadowFar) || Number(this.params.maxShadowLengthRayDistance) || 200000.0,
      maxShadowLengthRayDistance: Number(this.params.maxShadowLengthRayDistance) || 200000.0,
      shadowSplitLambda: Number(this.params.shadowSplitLambda) || 0.5,
      shadowFadeScale: Number(this.params.shadowFadeScale) || 1.0,
      // 同步 layer 参数（coverage/densityScale 等），否则 GUI 调 coverage 只影响主云，BSM 阴影不变
      // 用普通数组（非 Cartesian4），因为 BSM 的 set4f 走原生 gl.uniform4fv 只接受数组/Float32Array
      coverages: [0,1,2,3].map(i => { const v = this.params.layers[i]?.coverage; return v !== undefined ? Number(v) : 0.3; }),
      densityScales: [0,1,2,3].map(i => { const v = this.params.layers[i]?.densityScale; return v !== undefined ? Number(v) : 0; }),
      shapeAmounts: [0,1,2,3].map(i => { const v = this.params.layers[i]?.shapeAmount; return v !== undefined ? Number(v) : 0; }),
      shapeDetailAmounts: [0,1,2,3].map(i => { const v = this.params.layers[i]?.shapeDetailAmount; return v !== undefined ? Number(v) : 0; }),
      weatherExponents: [0,1,2,3].map(i => { const v = this.params.layers[i]?.weatherExponent; return v !== undefined ? Number(v) : 1; }),
      shapeAlteringBiases: [0,1,2,3].map(i => { const v = this.params.layers[i]?.shapeAlteringBias; return v !== undefined ? Number(v) : 0.35; }),
      coverageFilterWidths: [0,1,2,3].map(i => { const v = this.params.layers[i]?.coverageFilterWidth; return v !== undefined ? Number(v) : 0.6; }),
      scatteringCoefficient: Number(this.params.scatteringCoefficient) ?? 0.9,
      absorptionCoefficient: Number(this.params.absorptionCoefficient) ?? 1.0,
    });

    let tex = this._bsm.resolve ? this._bsmResolveGetTexture() : null;
    if (!tex) tex = sp.getTexture();
    if (!tex) { this.atmosphere?.setCloudShadow?.({ enabled: false }); this.aerial?.setCloudShadow?.({ enabled: false }); return; }

    const provider = this.atmosphere?.getAtmosphereForClouds?.();
    const targetTex = provider?.getCloudShadowTargetTexture?.();
    const clamp01 = provider?.getCloudShadowClamp01?.() ?? true;
    const scaleToPass = clamp01 ? 200.0 : 1.0;
    let textureToPass = tex;

    if (targetTex && tex._texture) { this._blitBSM(tex, targetTex, scaleToPass); textureToPass = targetTex; }
    // V3.3.20：blit 写入的共享 Cesium.Texture 同时供主云 stage 的 u_shadowBuffer 采样，
    // 避免返回自定义 bind() 对象（见 _buildCloudUniforms.u_shadowBuffer）。
    this._bsmSharedTexture = targetTex || null;

    const intervals = sp.getShadowIntervals();
    const mats = sp.getShadowMatrices();
    const tile = sp.getTileSize?.() || Math.floor(SHADOW_MAP_SIZE / 2);
    // 远距几何误差修正：相机越高/越远，越把 BSM 采样点拉向稳定球面（对齐 three-geospatial correctGeometricError）
    const camH = this.viewer.camera.positionCartographic?.height ?? 0;
    const geoAmt = Math.min(1, Math.max(0, (camH - 2000) / 25000));
    const opts = {
      enabled: true, texture: textureToPass, scale: scaleToPass,
      decode: { x: 1, y: 1, z: 1, w: 1 },
      near: sp.getShadowNear?.() ?? (Number(this.viewer.camera.frustum?.near) || 0.1),
      far: sp.getShadowFar(),
      topHeight: this._getMaxHeight(), bottomRadius: Number(this.params.bottomRadius) || 6371000,
      intervals: intervals.map(a => new Cesium.Cartesian2(a[0], a[1])),
      matrices: mats.map(m => Cesium.Matrix4.fromArray(m)),
      texelSize: { x: 1 / tile, y: 1 / tile },
      geometricErrorCorrectionAmount: geoAmt,
    };
    this.atmosphere?.setCloudShadow?.(opts);
    this.aerial?.setCloudShadow?.(opts);
  }

  // ── TAA (inline CloudsResolvePass) ─────────────────────────────────────

  _taaCapture() {
    const gl = this.viewer.scene.context?._gl;
    if (!gl) return;
    const canvas = this.viewer.scene.canvas;
    const w = canvas.width, h = canvas.height;
    if (w !== this._taa.w || h !== this._taa.h) {
      if (this._taa.texA) gl.deleteTexture(this._taa.texA);
      if (this._taa.texB) gl.deleteTexture(this._taa.texB);
      if (this._taa.pbo) gl.deleteBuffer(this._taa.pbo);
      const mkTex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.bindTexture(gl.TEXTURE_2D, null); return t; };
      this._taa.texA = mkTex(); this._taa.texB = mkTex();
      this._taa.pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._taa.pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this._taa.w = w; this._taa.h = h; this._taa.frameCount = 0; this._taa.pboReady = false;
    }
    const writeTex = this._taa.current === 0 ? this._taa.texB : this._taa.texA;
    if (this._taa.pboReady) {
      const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const flipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
      if (flipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (premul) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, this._taa.pbo);
      gl.bindTexture(gl.TEXTURE_2D, writeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindTexture(gl.TEXTURE_2D, prevTex);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      if (flipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      if (premul) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      this._taa.current = 1 - this._taa.current;
      this._taa.frameCount++;
    }
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._taa.pbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    if (prevFbo) gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    this._taa.pboReady = true;
  }

  _taaUpdateVP() {
    this._taa.prevVP = this._taa.curVP;
    const cam = this.viewer.camera;
    this._taa.curVP = Cesium.Matrix4.multiply(cam.frustum.projectionMatrix, cam.viewMatrix, new Cesium.Matrix4());
  }

  // ── GUI ────────────────────────────────────────────────────────────────

  _setupGUI() {
    if (this._gui || !this.enableGui) return;
    // 动态 import，避免未安装 dat.gui 时打包失败
    // 同步路径：仅在 enableGui=true 且宿主已全局提供 dat 时使用
    const dat = typeof window !== "undefined" && window.dat ? window.dat : null;
    if (!dat?.GUI) {
      console.warn("[Pipeline] enableGui=true 但未找到 dat.GUI，跳过调试面板");
      return;
    }
    this._gui = new dat.GUI({ name: "体积云管线" });
    const p = this.params, ls = p.layers;
    const f = this._gui.addFolder("云层");
    f.add(ls[0], "altitude", 0, 20000, 50).name("层0底高(m)");
    f.add(ls[0], "height", 0, 10000, 50).name("层0厚度(m)");
    f.add(ls[0], "coverage", 0, 1, 0.01).name("层0覆盖度");
    f.add(ls[1], "altitude", 0, 20000, 50).name("层1底高(m)");
    f.add(ls[1], "height", 0, 10000, 50).name("层1厚度(m)");
    f.add(ls[1], "coverage", 0, 1, 0.01).name("层1覆盖度");
    f.add(ls[2], "altitude", 0, 20000, 50).name("层2底高(m)");
    f.add(ls[2], "height", 0, 10000, 50).name("层2厚度(m)");
    f.add(ls[2], "coverage", 0, 1, 0.01).name("层2覆盖度");
    // 降高频相关参数（用于抑制边缘噪点/闪烁）
    f.add(p, "shapeRepeat", 1.0, 8.0, 0.1).name("主体噪声频率");
    f.add(p, "shapeDetailRepeat", 0.0005, 0.02, 0.0001).name("细节噪声频率");
    f.add(ls[0], "shapeDetailAmount", 0.0, 1.5, 0.01).name("层0细节权重");
    f.add(ls[1], "shapeDetailAmount", 0.0, 1.5, 0.01).name("层1细节权重");
    f.add(ls[2], "shapeDetailAmount", 0.0, 1.5, 0.01).name("层2细节权重");
    f.add(ls[0], "weatherExponent", 0.2, 2.0, 0.01).name("层0天气指数");
    f.add(ls[1], "weatherExponent", 0.2, 2.0, 0.01).name("层1天气指数");
    f.add(ls[2], "weatherExponent", 0.2, 2.0, 0.01).name("层2天气指数");
    f.add(ls[0], "coverageFilterWidth", 0.1, 1.0, 0.01).name("层0覆盖过滤宽度");
    f.add(ls[1], "coverageFilterWidth", 0.1, 1.0, 0.01).name("层1覆盖过滤宽度");
    f.add(ls[2], "coverageFilterWidth", 0.1, 1.0, 0.01).name("层2覆盖过滤宽度");
    f.open();
    const l = this._gui.addFolder("光照");
    l.add(p, "sunIntensity", 0, 150, 5).name("太阳强度");
    l.add(p, "skyToSunRatio", 0.05, 0.6, 0.01).name("天空/太阳比");
    l.add(p, "cloudExposure", 0.1, 5.0, 0.1).name("云曝光");
    l.add(p, "magentaFixStrength", 0.0, 2.0, 0.05).name("落日去品红强度");
    l.add(p, "edgeAlphaCutoff", 0.0, 0.2, 0.005).name("边缘Alpha裁剪");
    l.add(p, "aerialPerspectiveScale", 0, 3, 0.1).name("大气透视");
    const s = this._gui.addFolder("散射");
    s.add(p, "scatterG1", 0, 0.99, 0.01).name("前向散射G");
    s.add(p, "scatterG2", -0.99, 0, 0.01).name("后向散射G");
    s.add(p, "multiScatteringOctaves", 1, 12, 1).name("多散射阶数");
    const a = this._gui.addFolder("动画");
    a.add(p, "windSpeed", 0, 1, 0.0001).name("风速");
    a.add(p, "evolutionSpeed", 0, 0.0001, 0.000001).name("演化速度");
    // 远处云距离衰减：调小 distFadeStart 让衰减更早开始（远处更疏），调大 distFadeEnd 让衰减更平缓
    a.add(p, "distFadeStart", 5000, 100000, 1000).name("远处衰减起点(m)");
    a.add(p, "distFadeEnd", 20000, 200000, 1000).name("远处衰减终点(m)");
    const o = this._gui.addFolder("开关");
    o.add(p, "cloudsVisible").name("显示云").onChange((v) => {
      if (this.cloudStage) this.cloudStage.enabled = v;
    });
    o.add(p, "useShadowBuffer").name("BSM(云阴影)");
    o.add(p, "shadowLengthEnabled").name("阴影长度(丁达尔)");
    o.add(p, "hazeEnabled").name("雾效(HAZE)");
    o.add(p, "temporalEnabled").name("TAA");
    o.add(p, "maxSteps", 64, 1200, 1).name("主采样步数");
    o.add(p, "minStepSize", 5.0, 200.0, 1.0).name("最小步长");
    o.add(p, "blueNoiseScale", 0.25, 4.0, 0.05).name("噪声采样缩放");
    o.add(p, "jitterStrength", 0.0, 1.0, 0.01).name("抖动强度");

    // BSM OD 缩放联动：地面阴影实际在 AerialPerspectiveEffect stage 渲染，
    // 但原 GUI 只绑了 AtmospherePostProcess 实例，调不动。这里统一驱动两侧。
    const bsm = this._gui.addFolder("BSM 缩放");
    const syncBsmScale = (key, val) => {
      if (this.atmosphere) this.atmosphere[`_${key}`] = val;
      if (this.aerial) this.aerial[`_${key}`] = val;
    };
    // 用 params 上的占位属性承载 GUI 值，初始与两侧默认(1.0)对齐
    p._bsmGroundScale = 0.3; p._bsmTyndallScale = 1.0;
    bsm.add(p, "_bsmGroundScale", 0.1, 20.0, 0.1).name("OD缩放(地面)").onChange((v) => syncBsmScale("bsmGroundOpticalDepthScale", v));
    bsm.add(p, "_bsmTyndallScale", 0.1, 20.0, 0.1).name("OD缩放(光柱)").onChange((v) => syncBsmScale("bsmTyndallOpticalDepthScale", v));
    // cascade 几何：调这三个解决"近处阴影被切割"。shadowFar=覆盖最远距离，splitLambda=近处分配(越大近处越多)，fadeScale=ortho扩展
    bsm.add(p, "shadowFar", 20000, 500000, 5000).name("阴影覆盖距离");
    bsm.add(p, "shadowSplitLambda", 0.0, 1.0, 0.05).name("近处分配");
    bsm.add(p, "shadowFadeScale", 0.0, 5.0, 0.1).name("边缘扩展");
    // 关键：占位初始值不会自动触发 onChange，这里手动同步一次，否则启动时两侧 scale 仍是构造默认(1.0)
    syncBsmScale("bsmGroundOpticalDepthScale", p._bsmGroundScale);
    syncBsmScale("bsmTyndallOpticalDepthScale", p._bsmTyndallScale);
  }

  // ── BSM ShadowPass params (for CloudShadowPass) ────────────────────────

  _getShadowPassParams() {
    const ls = this.params.layers;
    const minLayerHeights = [], maxLayerHeights = [], densityProfileLinear = [], densityProfileConstant = [];
    const densityScales = [], shapeAmounts = [], shapeDetailAmounts = [], weatherExponents = [];
    const shapeAlteringBiases = [], coverageFilterWidths = [], coverages = [];
    let minAlt = 1e9, maxAltH = 0;
    for (let i = 0; i < 4; i++) {
      const a = Number(ls[i]?.altitude) || 0, h = Number(ls[i]?.height) || 0;
      if (a + h > 0) { minAlt = Math.min(minAlt, a); maxAltH = Math.max(maxAltH, a + h); }
      minLayerHeights[i] = a; maxLayerHeights[i] = a + h;
      densityProfileLinear[i] = Number(ls[i]?.densityProfile?.linearTerm) ?? 0.75;
      densityProfileConstant[i] = Number(ls[i]?.densityProfile?.constantTerm) ?? 0.25;
      densityScales[i] = Number(ls[i]?.densityScale) || 0;
      shapeAmounts[i] = Number(ls[i]?.shapeAmount) ?? 1;
      shapeDetailAmounts[i] = Number(ls[i]?.shapeDetailAmount) ?? 1;
      weatherExponents[i] = Number(ls[i]?.weatherExponent) ?? 1;
      shapeAlteringBiases[i] = Number(ls[i]?.shapeAlteringBias) ?? 0.35;
      coverageFilterWidths[i] = Number(ls[i]?.coverageFilterWidth) ?? 0.6;
      coverages[i] = Number(ls[i]?.coverage) ?? 0.3;
    }
    const iv = this._getIntervalHeights();
    const cBottom = Number.isFinite(minAlt) ? minAlt : 750;
    return {
      bottomRadius: Number(this.params.bottomRadius) || 6378137,
      cloudBottomHeight: cBottom, cloudTopHeight: Math.max(0, maxAltH - cBottom) || 1500,
      shadowBottomHeight: cBottom, shadowTopHeight: maxAltH || (cBottom + 1500),
      // shadow cascade far 必须限制到云层相关距离，否则会取 Cesium 相机 frustum.far（~8e8），
      // 导致 ortho proj radius 爆炸、数值精度崩坏产生 NaN、矩阵不可逆、BSM 全失效。
      shadowFar: Number(this.params.shadowFar) || Number(this.params.maxShadowLengthRayDistance) || 200000.0,
      maxShadowLengthRayDistance: Number(this.params.maxShadowLengthRayDistance) || 200000.0,
      shadowSplitLambda: Number(this.params.shadowSplitLambda) || 0.5,
      shadowFadeScale: Number(this.params.shadowFadeScale) || 1.0,
      weatherRepeat: Number(this.params.weatherRepeat) || 100, windSpeed: Number(this.params.windSpeed) || 0,
      shapeRepeat: (Number(this.params.shapeRepeat) || 3) / 1e4,
      shapeDetailRepeat: Number(this.params.shapeDetailRepeat) || 0.006,
      turbulenceRepeat: Number(this.params.turbulenceRepeat) || 2,
      turbulenceDisplacement: Number(this.params.turbulenceDisplacement) || 400,
      coverage: Math.max(...coverages), densityScale: Math.max(...densityScales),
      scatteringCoefficient: Number(this.params.scatteringCoefficient) ?? 0.9,
      absorptionCoefficient: Number(this.params.absorptionCoefficient) ?? 1.0,
      startTime: performance.now() / 1000, evolutionSpeed: Number(this.params.evolutionSpeed) || 0.005,
      maxSteps: this.params.maxSteps, minStepSize: this.params.minStepSize,
      minDensity: this.params.minDensity ?? 1e-5, minExtinction: this.params.minExtinction ?? 1e-5,
      minTransmittance: this.params.minTransmittance ?? 0.01, opticalDepthTailScale: 1.0,
      minLayerHeights, maxLayerHeights, densityProfileLinear, densityProfileConstant,
      densityProfileExpTerms: [0,0,0,0], densityProfileExponents: [0,0,0,0],
      densityScales, shapeAmounts, shapeDetailAmounts, weatherExponents,
      shapeAlteringBiases, coverageFilterWidths, coverages,
      minIntervalHeights: [iv.min.x, iv.min.y, iv.min.z],
      maxIntervalHeights: [iv.max.x, iv.max.y, iv.max.z],
      localWeatherOffset: [0, 0], shapeOffset: [0, 0, 0], shapeDetailOffset: [0, 0, 0],
    };
  }

  // ── Init ───────────────────────────────────────────────────────────────

  async init() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      const viewer = this.viewer;
      viewer.scene.globe.depthTestAgainstTerrain = true;

      // 1. Atmosphere
      this.atmosphere = new AtmospherePostProcess(viewer, {
        atmosphereParams: this.atmosphereParams, renderSky: true,
        applyGroundAtmosphere: false, autoAddStage: false,
        enableGui: false,
        assetsBaseUrl: this.atmosphereAssetsBase, shaderBaseUrl: this.atmosphereShaderBase,
      });
      await this.atmosphere.init();

      // 2. Aerial
      this.aerial = new AerialPerspectiveEffect(viewer, {
        atmosphereParams: this.atmosphereParams, autoAddStage: false,
        assetsBaseUrl: this.atmosphereAssetsBase, shaderBaseUrl: this.atmosphereShaderBase,
      });

      // 3. Load cloud textures + build shader
      await this._loadTextures();
      const fragmentShader = await this._buildCloudFragmentShader();

      // 4. BSM passes (import dynamically to avoid circular deps)
      const { CloudShadowPass } = await import("./CloudShadowPass.js");
      const { ShadowResolvePass } = await import("./ShadowResolvePass.js");
      if (this.params.useShadowBuffer && this.textures) {
        this._bsm.pass = new CloudShadowPass(viewer, { textures: this.textures, params: this._getShadowPassParams() });
        this._bsm.pass.init();
        // 静止 temporalAlpha 对齐 three-geospatial≈0.01；运动时 ShadowResolvePass 内会抬高 alpha
        this._bsm.resolve = new ShadowResolvePass(viewer, { size: SHADOW_MAP_SIZE, temporalAlpha: 0.01 });
        this._bsm.resolve.setInputTextures(this._bsm.pass.getTexture(), this._bsm.pass.getDepthVelocityTexture());
        this._bsm.resolve.init();
      }

      // 5. Cloud PostProcessStage
      const uniforms = this._buildCloudUniforms();
      this.cloudStage = new Cesium.PostProcessStage({
        name: "GeospatialVolumetricClouds", fragmentShader, uniforms,
      });
      this.cloudStage.enabled = this.params.cloudsVisible;

      // 6. Aerial init
      await this.aerial.init();

      // 7. Register stages in correct order
      const stages = viewer.scene.postProcessStages;
      // 1. 先渲染大气天空打底
      if (this.atmosphere.stage) stages.add(this.atmosphere.stage); 
      // 2. 加上空中透视和 Tonemap
      if (this.aerial.stage) stages.add(this.aerial.stage);
      // 3. 最后在天空之上画体积云
      stages.add(this.cloudStage); 

      // 8. preRender: BSM sync
      this._listeners.push(viewer.scene.preRender.addEventListener(() => this._syncBSM()));

      // 9. postRender: TAA capture + frame count
      this._listeners.push(viewer.scene.postRender.addEventListener(() => {
        this._taaUpdateVP();
        if (this.params.temporalEnabled) this._taaCapture();
        this._frameCount++;
      }));
      this._listeners.push(viewer.camera.changed.addEventListener(() => {
        const c = Cesium.Cartographic.fromCartesian(
          viewer.camera.positionWC,
          viewer.scene.globe.ellipsoid
        );
        const _ellipsoidHeight = Number(c?.height) || 0;
        const atmBottomRadius = Number(
          this.atmosphere?.getAtmosphereForClouds?.()?.getUniforms?.()?.bottomRadius?.() ?? NaN
        );
        const usedBottomRadius = Number.isFinite(atmBottomRadius)
          ? atmBottomRadius
          : (Number(this.params.bottomRadius) || 0);
        const corr = this._getAltitudeCorrectionOffset(usedBottomRadius);
        const correctedPos = Cesium.Cartesian3.add(
          viewer.camera.positionWC,
          corr,
          new Cesium.Cartesian3()
        );
        const _correctedHeight = Math.max(
          0,
          Cesium.Cartesian3.magnitude(correctedPos) - usedBottomRadius
        );
      }));

      if (this.enableGui) this._setupGUI();
      console.warn("[Pipeline] ready: Atmosphere -> Aerial -> Cloud");
    })();
    return this._ready;
  }

  // ── Destroy ────────────────────────────────────────────────────────────

  destroy() {
    for (const remove of this._listeners) if (typeof remove === "function") remove();
    this._listeners = [];
    const stages = this.viewer?.scene?.postProcessStages;
    if (stages && this.cloudStage) { try { stages.remove(this.cloudStage); } catch { /* ignore */ } }
    this.cloudStage = null;
    try { this.aerial?.destroy(); } catch { /* ignore */ } this.aerial = null;
    try { this.atmosphere?.destroy(); } catch { /* ignore */ } this.atmosphere = null;
    try { this._bsm.pass?.destroy(); } catch { /* ignore */ } this._bsm.pass = null;
    try { this._bsm.resolve?.destroy(); } catch { /* ignore */ } this._bsm.resolve = null;
    const gl = this.viewer?.scene?.context?._gl;
    if (gl) {
      if (this._bsm.blitFbo) gl.deleteFramebuffer(this._bsm.blitFbo);
      if (this._bsm.blitProg) gl.deleteProgram(this._bsm.blitProg);
      if (this._bsm.blitVbo) gl.deleteBuffer(this._bsm.blitVbo);
      if (this._taa.texA) gl.deleteTexture(this._taa.texA);
      if (this._taa.texB) gl.deleteTexture(this._taa.texB);
      if (this._taa.pbo) gl.deleteBuffer(this._taa.pbo);
    }
    this._bsm = { pass: null, resolve: null, blitFbo: null, blitProg: null, blitVbo: null };
    this._taa = { texA: null, texB: null, current: 0, pbo: null, pboReady: false, w: 0, h: 0, frameCount: 0, prevVP: null, curVP: null };
    if (this.textures) { for (const k in this.textures) { try { this.textures[k]?.destroy?.(); } catch { /* ignore */ } } this.textures = null; }
    if (this._gui) { this._gui.destroy(); this._gui = null; }
    this._ready = null;
  }
}
