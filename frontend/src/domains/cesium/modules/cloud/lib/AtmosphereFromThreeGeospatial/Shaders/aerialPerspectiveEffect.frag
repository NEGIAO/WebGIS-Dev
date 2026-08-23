// Cesium/PostProcessStage 版 AerialPerspectiveEffect 片元主体。
// 该文件不包含任何 #include；Bruneton 的 definitions/common/runtime 由 JS 侧拼接在它之前。

uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
in vec2 v_textureCoordinates;

uniform vec3 u_cameraPosition; // km
uniform vec3 u_altitudeCorrection; // km
uniform vec3 u_sunDirection;
// 曝光在上一 pass（AtmospherePostProcess）线性段完成；此处仅做 ACES + gamma
// three-geospatial 对齐：直接采样 shadowLengthBuffer（这里沿用现有 uniform 命名）
uniform int u_cloudShadowLengthEnabled;
uniform float u_cloudShadowLengthScale;
uniform sampler2D u_cloudShadowLengthTexture;
// BSM 地面太阳遮光（与 AtmospherePostProcess 中 getGroundSunTransmittance 一致；applyGroundAtmosphere=false 时仅靠本 pass 生效）
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
uniform float u_cloudShadowAltitudeFadeStart;
uniform float u_cloudShadowAltitudeFadeEnd;
uniform float u_bsmGroundOpticalDepthScale;
// cascade UV 空间 texel 尺寸（单 cascade tile，非整个 atlas）
uniform vec2 u_cloudShadowTexelSize;
// 地面云影 PCF tap 数（1~16），按质量预设注入；性能优化：不再硬编码 16
uniform int u_cloudShadowPcfTaps;
// 远距几何误差修正量 [0,1]：越大越把 BSM 采样点拉向椭球/bottom 球，抑制地形 LOD 抖动
uniform float u_geometricErrorCorrectionAmount;
// 空中透视强度 [0,1]：0=透传原色（无透视），1=全强度大气散射
uniform float u_aerialPerspectiveScale;

const float METER_TO_LENGTH_UNIT = 0.001; // m -> km

float saturateAP(float x) { return clamp(x, 0.0, 1.0); }

vec3 ACESFilmic(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// AtmospherePostProcess 已输出曝光后的线性 HDR；本 pass 只做一次 OETF（勿再乘曝光）
vec4 tonemapDisplay(vec3 linearHdr, float a) {
  vec3 c = ACESFilmic(linearHdr);
  c = pow(c, vec3(1.0 / 2.2));
  return vec4(c, a);
}

void reconstructRay(out vec3 ro, out vec3 rd) {
  ro = u_cameraPosition + u_altitudeCorrection;
  vec2 uv = v_textureCoordinates * 2.0 - 1.0;
  vec4 clipPos = vec4(uv, 1.0, 1.0);
  vec4 viewPos = czm_inverseProjection * clipPos;
  viewPos /= viewPos.w;
  vec4 worldPos4 = czm_inverseView * viewPos;
  vec3 worldPosKm = worldPos4.xyz * METER_TO_LENGTH_UNIT + u_altitudeCorrection;
  rd = normalize(worldPosKm - ro);
}

// 射线 o + t*d 与以原点为球心、半径 R 的球在 t>eps 上是否存在交点（前向半直线）
bool rayForwardHitsSphere(vec3 o, vec3 d, float R) {
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

// 是否处于 bottom/top 大气壳层之间（不含恰贴内球心的情况，地表略大于 bottom 时算壳层内）
bool cameraInAtmosphereShell(vec3 o, float bottomR, float topR) {
  float r = length(o);
  return r > bottomR + 1e-5 && r < topR - 1e-5;
}

// 2×2 图集：cascade 0=左上, 1=右上, 2=左下, 3=右下（与 AtmospherePostProcess 一致）
vec2 getCloudShadowAtlasOffset(int ci) {
  float x = mod(float(ci), 2.0) * 0.5;
  float y = (ci < 2) ? 0.5 : 0.0;
  return vec2(x, y);
}

// three.js / three-geospatial：与 CloudShadowPass intervals=(d-near)/(far-near) 一致
float viewZToOrthographicDepth(float viewZ, float near, float far) {
  return (viewZ + near) / (near - far);
}

// 对齐 three-geospatial cascadedShadowMaps.glsl：按相机 view depth 选 cascade，边界 dither 淡入淡出
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
  // V3.4.12：硬阈值 0.35 会形成随相机深度扫动的 cascade 硬边界线（升降时肉眼可见）。
  // 改为逐像素 IGN 抖动阈值：边界带内两级 cascade 空间蓝噪声式混合，PCF 自然平滑。
  return alpha > jitter ? nextIndex : prevIndex;
}

vec2 getShadowUv(vec3 worldPos, int ci) {
  vec4 clip = u_cloudShadowMatrices[ci] * vec4(worldPos, 1.0);
  clip /= clip.w;
  return clip.xy * 0.5 + 0.5;
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

float readShadowOpticalDepth(vec2 uv, int ci, float distToTop) {
  float scale = max(u_cloudShadowScale, 1e-6);
  // V3.4.7：tile UV 半 texel gutter clamp。2×2 atlas + LINEAR 过滤下，
  // PCF vogel 偏移越过 tile 边界会读到相邻 cascade（矩阵语义不同）→ 边缘黑条/异常斑块。
  vec2 gutter = max(u_cloudShadowTexelSize, vec2(1e-4)) * 0.5;
  uv = clamp(uv, gutter, 1.0 - gutter);
  vec2 atlasUv = getCloudShadowAtlasOffset(ci) + uv * 0.5;
  vec4 shadow = (texture(u_cloudShadowBuffer, atlasUv) / scale) * u_cloudShadowDecode;
  // BSM atlas 语义：b=maxOpticalDepth，a=tail；地面也必须消费 tail，否则阴影边缘会被硬截断。
  float od = min(shadow.b + shadow.a, shadow.g * max(0.0, distToTop - shadow.r));
  return od * max(u_bsmGroundOpticalDepthScale, 0.0);
}

float sampleShadowOpticalDepthPCF(vec3 worldPos, float distToTop, float radius, int ci) {
  vec2 uv = getShadowUv(worldPos, ci);
  // 与 three-geospatial 一致：UV 出 [0,1] 才无阴影（硬切），不再做 edgeFade 矩形软边
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  vec2 texel = max(u_cloudShadowTexelSize, vec2(1e-4));
  int taps = clamp(u_cloudShadowPcfTaps, 1, 16);
  if (radius < 0.1 || taps <= 1) return readShadowOpticalDepth(uv, ci, distToTop);
  float sum = 0.0;
  float phi = interleavedGradientNoise(gl_FragCoord.xy) * 6.28318530718;
  for (int i = 0; i < 16; ++i) {
    if (i >= taps) break;
    sum += readShadowOpticalDepth(uv + vogelDisk(i, 16, phi) * radius * texel, ci, distToTop);
  }
  return sum / float(taps);
}

// three-geospatial correctGeometricError：远距把位置混向 bottom 球表面，减轻 tile/地形几何误差对阴影 UV 的影响
vec3 correctBsmPosition(vec3 posMeters, float amount) {
  if (amount <= 0.0) return posMeters;
  vec3 sphereNormal = normalize(posMeters);
  vec3 spherePosition = u_cloudShadowBottomRadius * sphereNormal;
  return mix(posMeters, spherePosition, saturateAP(amount));
}

// 远距额外径向稳定：保留水平位置方向，高度向粗略地表混合，进一步抑制 DEM LOD 高度跳变
vec3 stabilizeBsmSamplePosition(vec3 posMeters, float viewDistMeters) {
  float geoAmt = max(u_geometricErrorCorrectionAmount, 0.0);
  // 只使用显式几何误差修正；不再按距离强制贴合 bottom 球，避免远处地面云影被压平成“贴球滑动”的假阴影。
  float amount = saturateAP(geoAmt);
  vec3 corrected = correctBsmPosition(posMeters, amount);
  if (amount < 0.01) return corrected;
  // 径向高度：用当前高度与 bottom 的差做轻度保留，避免近处地形阴影完全贴球
  vec3 n = normalize(corrected);
  float h = length(posMeters) - u_cloudShadowBottomRadius;
  float stableH = mix(h, max(h, 0.0) * (1.0 - 0.85 * amount), amount);
  return n * (u_cloudShadowBottomRadius + stableH);
}

float getCloudShadowCameraAltitudeFade(vec3 cameraMeters) {
  float cameraHeight = length(cameraMeters) - u_cloudShadowBottomRadius;
  float fadeStart = max(u_cloudShadowAltitudeFadeStart, 0.0);
  float fadeEnd = max(u_cloudShadowAltitudeFadeEnd, fadeStart + 1.0);
  return 1.0 - smoothstep(fadeStart, fadeEnd, cameraHeight);
}

// rawWorldPosMeters：ECEF 米；u_cloudShadowBottomRadius / TopHeight 与管线 setCloudShadow 一致（米）
float getGroundSunTransmittance(vec3 rawWorldPosMeters) {
  if (u_cloudShadowEnabled == 0) return 1.0;

  // 采样前稳定 BSM 世界点（空中透视仍用原始 depth 点，见 main）
  vec3 camMeters = (u_cameraPosition + u_altitudeCorrection) / METER_TO_LENGTH_UNIT;
  float altitudeFade = getCloudShadowCameraAltitudeFade(camMeters);
  if (altitudeFade <= 0.0) return 1.0;
  float viewDist = length(rawWorldPosMeters - u_cameraPosition / METER_TO_LENGTH_UNIT);
  vec3 samplePos = stabilizeBsmSamplePosition(rawWorldPosMeters, viewDist);

  vec3 shellSamplePos = samplePos + u_altitudeCorrection / METER_TO_LENGTH_UNIT;
  vec3 groundNormal = normalize(shellSamplePos);
  float sunSinElev = dot(u_sunDirection, groundNormal);

  // 1) 昼夜线遮挡：太阳低于该地面点本地地平线时，地面点已入夜，无云阴影。
  float horizonFade = smoothstep(-0.02, 0.02, sunSinElev);
  if (horizonFade <= 0.0) return 1.0;

  float topShellR = u_cloudShadowBottomRadius + u_cloudShadowTopHeight;
  vec3 rd = u_sunDirection;
  float bS = dot(rd, shellSamplePos);
  float cTop = dot(shellSamplePos, shellSamplePos) - topShellR * topShellR;
  float discTop = bS * bS - cTop;
  if (discTop <= 0.0) return 1.0;
  float distToShadowTop = -bS + sqrt(discTop);
  if (distToShadowTop <= 0.0) return 1.0;

  // 2) 低太阳角 / 长阴影淡出（Cesium 椭球外地形专用，three-geospatial 无）
  float lowSunFade = smoothstep(0.0, 0.087, sunSinElev);
  float rayLenFade = 1.0 - smoothstep(u_cloudShadowTopHeight * 6.0,
                                       u_cloudShadowTopHeight * 20.0,
                                       distToShadowTop);
  float fade = horizonFade * lowSunFade * rayLenFade * altitudeFade;
  if (fade <= 0.0) return 1.0;

  float jitter = interleavedGradientNoise(gl_FragCoord.xy);
  float near = max(u_cloudShadowNear, 1e-3);
  float far = max(u_cloudShadowFar, near + 1.0);
  int ci = getFadedCascadeIndex(
    czm_view,
    samplePos,
    u_cloudShadowIntervals,
    near,
    far,
    jitter
  );
  if (ci < 0) return 1.0;

  // V3.4.12：PCF 半径固定（texel 单位，随 cascade 分辨率自适应）。
  // 旧 mix(1.5,3.0,viewDist/far) 随视距连续变化，相机升降时模糊宽度“呼吸”→ 抖动感。
  float pcfRadius = 2.0;
  float opticalDepth = sampleShadowOpticalDepthPCF(samplePos, distToShadowTop, pcfRadius, ci);
  float shade = exp(-opticalDepth);
  return mix(1.0, shade, fade);
}

// 上游（AtmospherePostProcess applyGround=0 直通）给到的是 sRGB 显示色；
// 空中透视必须在「线性化 → 合成 → mix(scale) → 与天空分支同一套 ACES+gamma」下进行：
// - 线性 inscatter 直接加在 sRGB 上 = 近地平线白蒙版（旧实现根因）
// - mix(u_aerialPerspectiveScale) 保证 scale=0 时严格原样，且强度平滑淡入
vec3 compositeAerialDisplay(vec3 srgbOriginal, vec3 transmittance, float sunT, vec3 inscatter, float alpha) {
  vec3 linOriginal = pow(max(srgbOriginal, vec3(0.0)), vec3(2.2));
  vec3 aerialLin = linOriginal * transmittance * sunT + max(inscatter, vec3(0.0));
  vec3 compositedLin = mix(linOriginal, aerialLin, saturateAP(alpha));
  return tonemapDisplay(compositedLin, 1.0).rgb;
}

void main() {
  vec4 originalColor = texture(colorTexture, v_textureCoordinates);
  float depth = czm_readDepth(depthTexture, v_textureCoordinates);
  // 深度清空判定：czm_readDepth 在 LOG_DEPTH 下已做对数深度反转，任何有限距离的几何
  // 都严格 < 1-ε；ε 取 1e-7（与体积云 stage 的 DEPTH_SKY 一致），使远距地形/远距
  // 低分辨率瓦片（反转后深度 ≈ 1-1/d，极易贴近 1）被可靠识别为几何而非「近似天空」。
  const float DEPTH_SKY_EPS = 1e-7;
  bool hasSceneDepth = depth < 1.0 - DEPTH_SKY_EPS;

  vec3 cameraPosition = u_cameraPosition;
  float camRadius = length(cameraPosition);
  vec3 rayDirection;
  reconstructRay(cameraPosition, rayDirection);

  float bottomR = ATMOSPHERE.bottom_radius;
  float topR = ATMOSPHERE.top_radius;
  bool inShell = cameraInAtmosphereShell(cameraPosition, bottomR, topR);
  bool hitBottom = rayForwardHitsSphere(cameraPosition, rayDirection, bottomR);
  bool hitTop = rayForwardHitsSphere(cameraPosition, rayDirection, topR);

  // 地心指向相机的单位向量（ECEF）；视线与其点积：<0 朝地心/地表一侧，>0 朝外（天空/深空）
  // 仅用 hitBottom 会错：Cesium 地表往往在 Bruneton bottom 球之外，斜视时射线可无 bottom 前向交点但仍指向地面 → 误透传原色
  vec3 radialOut = normalize(cameraPosition);
  float muLook = dot(rayDirection, radialOut);

  bool passOriginal = false;
  if (inShell) {
    passOriginal = false;
  } else if (camRadius > topR + 1e-5) {
    // 太空：朝外深空 → 透传；朝地球(mu<0)必做透视，避免仅靠 hitTop 在 grazing 时漏判
    float skyMuEps = 1e-5;
    passOriginal = (muLook > skyMuEps) && !hitTop;
  } else {
    // r <= bottom（地表贴内球或数值在内球内侧）：一律按地面管线处理
    passOriginal = false;
  }

  // 壳层内：完全听 passOriginal（天际线上方 mu>0 常为原色）；天际线附近深度常非 1，若用深度强制透视会把天空染色。
  // 仅当相机在 top 球外（太空）时：深度非空则强制透视，修「太空看地整片原色」。
  bool cameraOutsideAtmosphere = camRadius > topR + 1e-5;
  bool forceAerialFromDepth = hasSceneDepth && cameraOutsideAtmosphere;
  if (passOriginal && !forceAerialFromDepth) {
    out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
    return;
  }

  // 壳层内分类（V3.5.30 地形感知）：开启地形后真实地平线高低起伏，
  // 「视线最终与 bottom 球相交(hitBottom)」不再等价于「该像素是地面」，
  // 且深度清空的像素也不再能靠几何判据安全归类。改为按「深度 × 几何」三问：
  // ① 深度非清空 ⇒ 真实几何（含远距地形），一律地面管线，散射终点=深度重建点；
  //    （旧 SHELL_SKY_DEPTH_SLOP 宽带会把远距几何透传跳过 aerial，已随本版删除：
  //     两分支出口统一后无二次 OETF 之虞，深度重建终点也比椭球切点更短更准）
  // ② 深度清空且射线不碰 bottom 球 ⇒ 山脊之间的纯天空缝隙，透传
  //    （与天空分支同一 OETF 出口）；
  // ③ 深度清空但射线命中 bottom 球 ⇒ 切角以下的掠射大气段（从山缝里望向
  //    被地形遮挡的远侧大气）。旧路径把这种像素的终点经远平面重建/
  //    ClampRadius 顶到大气层顶，积分出过饱和暖黄 inscatter——即贴着理想
  //    椭圆边的黄蒙版本体；现把散射终点钳到 bottom 球「近交点」，得到与
  //    原生行星渲染一致的有界临边辉光。该点仅作散射锚点，不参与 BSM 云影。
  if (inShell && !forceAerialFromDepth) {
    bool skyPocket = !hasSceneDepth && !hitBottom;
    if (skyPocket) {
      out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
      return;
    }
    if (!hasSceneDepth) {
      float bL = dot(cameraPosition, rayDirection);
      float cL = dot(cameraPosition, cameraPosition) - bottomR * bottomR;
      float discL = bL * bL - cL;
      if (discL < 0.0) {
        out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
        return;
      }
      float sL = sqrt(discL);
      float tHitL = -bL - sL;
      if (tHitL <= 1e-6) {
        tHitL = -bL + sL;
      }
      if (tHitL <= 1e-6) {
        out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
        return;
      }
      vec3 limbPosKm = cameraPosition + rayDirection * tHitL;
      vec3 limbTransmittance;
      vec3 limbInscatter = GetSkyRadianceToPoint(
        cameraPosition,
        limbPosKm,
        0.0,
        u_sunDirection,
        limbTransmittance
      );
      vec3 finalColorLimb = compositeAerialDisplay(
        originalColor.rgb,
        limbTransmittance,
        1.0,
        limbInscatter,
        u_aerialPerspectiveScale
      );
      out_FragColor = vec4(finalColorLimb, originalColor.a);
      return;
    }
    // hasSceneDepth ⇒ 落到下方常规地面管线（终点=深度重建点）
  }

  // 重建 ECEF 世界坐标（米），再转 km，得到几何点位置
  vec4 eyePos = czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy, depth, 1.0));
  if (abs(eyePos.w) < 1e-6) {
    if (!hasSceneDepth) {
      out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
      return;
    }
    // w 异常但深度表明有几何：用当前像素射线与 bottom 球最近前向交点作 scene 近似（太空地表常见）
    float bW = dot(cameraPosition, rayDirection);
    float cW = dot(cameraPosition, cameraPosition) - bottomR * bottomR;
    float discW = bW * bW - cW;
    if (discW < 0.0) {
      out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
      return;
    }
    float sW = sqrt(discW);
    float tHit = -bW - sW;
    if (tHit <= 1e-6) {
      tHit = -bW + sW;
    }
    if (tHit <= 1e-6) {
      out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
      return;
    }
    vec3 scenePosKmApprox = cameraPosition + rayDirection * tHit;
    vec3 transmittanceW;
    vec3 inscatterW = GetSkyRadianceToPoint(
      cameraPosition,
      scenePosKmApprox,
      0.0,
      u_sunDirection,
      transmittanceW
    );
    // w 异常时的 bottom-sphere 交点只是透视兜底，不作为 BSM 地面阴影锚点，避免假贴地阴影粘屏。
    vec3 finalColorW = compositeAerialDisplay(
      originalColor.rgb,
      transmittanceW,
      1.0,
      inscatterW,
      u_aerialPerspectiveScale
    );
    out_FragColor = vec4(finalColorW, originalColor.a);
    return;
  }
  eyePos /= eyePos.w;
  if (eyePos.z >= 0.0 && !hasSceneDepth) {
    out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
    return;
  }

  vec3 scenePosKm;
  vec3 rawWorldPosMeters = vec3(0.0);
  if (eyePos.z >= 0.0 && hasSceneDepth) {
    // z>=0 但深度非空：远距/对数深度常见数值问题，眼→世界不可靠。
    // 这里仅做空中透视近似，不再把 bottom-sphere 交点喂给 BSM，避免假贴地阴影。
    float bz = dot(cameraPosition, rayDirection);
    float cz = dot(cameraPosition, cameraPosition) - bottomR * bottomR;
    float discz = bz * bz - cz;
    if (discz < 0.0) {
      out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
      return;
    }
    float sz = sqrt(discz);
    float tz = -bz - sz;
    if (tz <= 1e-6) {
      tz = -bz + sz;
    }
    if (tz <= 1e-6) {
      out_FragColor = tonemapDisplay(originalColor.rgb, originalColor.a);
      return;
    }
    scenePosKm = cameraPosition + rayDirection * tz;
  } else {
    vec4 worldPos4 = czm_inverseView * eyePos;
    rawWorldPosMeters = worldPos4.xyz;
    vec3 sceneWorldPosKm = rawWorldPosMeters * METER_TO_LENGTH_UNIT + u_altitudeCorrection;
    float sceneDist = length(sceneWorldPosKm - cameraPosition);
    scenePosKm = cameraPosition + rayDirection * sceneDist;
  }
  float shadowLength = 0.0;
  if (u_cloudShadowLengthEnabled > 0) {
    shadowLength = max(texture(u_cloudShadowLengthTexture, v_textureCoordinates).r, 0.0)
      * max(u_cloudShadowLengthScale, 0.0);
  }

  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    cameraPosition,
    scenePosKm,
    shadowLength,
    u_sunDirection,
    transmittance
  );

  // 仅在可靠 depth→ECEF 路径上启用地面 BSM；假球壳点不参与，防止屏幕粘滞阴影。
  float sunT = (rawWorldPosMeters.x != 0.0 || rawWorldPosMeters.y != 0.0 || rawWorldPosMeters.z != 0.0)
    ? getGroundSunTransmittance(rawWorldPosMeters)
    : 1.0;
  // 与天空分支同一 OETF 出口：线性域合成 + mix(scale) 强度语义，消除交界缝与白蒙版
  vec3 finalColor = compositeAerialDisplay(
    originalColor.rgb,
    transmittance,
    sunT,
    inscatter,
    u_aerialPerspectiveScale
  );

  out_FragColor = vec4(finalColor, originalColor.a);
}

