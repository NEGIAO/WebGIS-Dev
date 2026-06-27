// ============================================================
// cloudFragment.glsl — 体积云片元着色器
//
// 实现完整的体积云 Ray Marching 渲染：
// 1. 从屏幕 NDC 重建 ECEF 射线
// 2. 与云层壳体（球壳）求交确定 march 范围
// 3. 主循环：自适应步长 + 密度采样 + 光照计算
// 4. 合成到场景（alpha blend + 深度测试）
//
// 注意: PostProcessStage 不自动注入 czm_cameraPositionWC 等，
//       必须通过自定义 uniform 从 JS 端传入
// ============================================================

// ─── Cesium 相关 Uniform（通过 JS 自定义传入） ────────────────

uniform vec3 u_cameraPosition;       // czm_cameraPositionWC
uniform mat4 u_inverseProjection;    // czm_inverseProjection
uniform mat4 u_inverseView;          // czm_inverseView
uniform vec3 u_sunDirection;         // czm_sunDirectionWC
uniform vec3 u_ellipsoidRadii;       // czm_ellipsoidRadii
uniform sampler2D depthTexture;        // PostProcessStage 自动传入

// ─── 输入 ─────────────────────────────────────────────────────

in vec2 v_textureCoordinates;
out vec4 fragColor;

// ─── 自定义 Uniform ───────────────────────────────────────────

// 开关
uniform bool u_enabled;

// 云层几何
uniform float u_minHeight;        // 云底高度 (米)
uniform float u_maxHeight;        // 云顶高度 (米)
uniform float u_coverage;         // 云覆盖率 0-1

// 风 / 动画
uniform float u_windSpeed;        // 风速
uniform vec2 u_windDirection;     // 风向 (cos, sin)

// 散射
uniform float u_scatteringCoefficient;
uniform float u_absorptionCoefficient;
uniform float u_scatterAnisotropy1;
uniform float u_scatterAnisotropy2;
uniform float u_scatterAnisotropyMix;
uniform float u_skyLightScale;
uniform float u_groundBounceScale;
uniform float u_powderScale;

// 密度
uniform float u_densityScale;
uniform float u_shapeAmount;
uniform float u_shapeDetailAmount;
uniform float u_turbulenceDisplacement;

// 雾
uniform float u_hazeDensityScale;
uniform float u_hazeExponent;

// 夜间光照
uniform float u_nightMoonIntensity;
uniform float u_nightAmbientIntensity;
uniform vec3 u_nightColor;
uniform float u_dayLightFactor;

// 质量
uniform int u_maxIterationCount;
uniform float u_minStepSize;
uniform float u_maxStepSize;
uniform float u_maxRayDistance;
uniform float u_perspectiveStepScale;
uniform float u_minDensity;
uniform float u_minTransmittance;
uniform int u_multiScatteringOctaves;
uniform int u_maxIterationCountToSun;
uniform int u_maxIterationCountToGround;
uniform float u_minSecondaryStepSize;
uniform float u_shapeDetailEnabled;
uniform float u_turbulenceEnabled;

// 噪声纹理（程序化降级时可为空）
// 注意: shape/shapeDetail 存储为 2D 纹理（size × size²），用 sample3DAs2D 采样
uniform sampler2D u_shapeTexture;
uniform sampler2D u_shapeDetailTexture;
uniform sampler2D u_weatherTexture;
uniform sampler2D u_turbulenceTexture;

// 纹理参数
uniform vec3 u_shapeRepeat;       // shape 纹理 UV 重复率
uniform vec3 u_shapeDetailRepeat; // detail 纹理 UV 重复率
uniform vec2 u_weatherRepeat;     // 天气纹理 UV 重复率
uniform float u_time;             // 动画时间（秒）
uniform float u_shapeDepth;       // shape 纹理深度切片数（128）
uniform float u_shapeDetailDepth; // detail 纹理深度切片数（32）

// ─── 3D→2D 纹理采样辅助 ──────────────────────────────────────
// 将 3D UV (x,y,z ∈ [0,1]) 映射到 2D UV，纹理布局: width=depth, height=depth²
// slice = floor(z * depth), v = (slice + y) / depth²

vec4 sample3DAs2D(sampler2D tex, vec3 uvw, float depth) {
    float z = fract(uvw.z);
    float y = fract(uvw.y);
    float x = fract(uvw.x);
    float slice = floor(z * depth);
    float v = (slice + y) / (depth * depth);
    return texture(tex, vec2(x, v));
}

// ─── 引入工具库 ───────────────────────────────────────────────

// 注意: Cesium PostProcessStage 会自动拼接 include，
// 这里用字符串拼接方式在 JS 端处理

// ─── 工具函数（内联，避免 include 兼容问题） ──────────────────

const float CLOUD_PI = 3.141592653589793;

float cloudSaturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 cloudSaturate(vec3 x) { return clamp(x, vec3(0.0), vec3(1.0)); }
vec4 cloudSaturate(vec4 x) { return clamp(x, vec4(0.0), vec4(1.0)); }

float cloudRemap(float value, float inMin, float inMax) {
    return cloudSaturate((value - inMin) / max(inMax - inMin, 1e-10));
}

float cloudRemap(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * cloudRemap(value, inMin, inMax);
}

// Henyey-Greenstein 相位函数
float henyeyGreenstein(float g, float cosTheta) {
    float g2 = g * g;
    float denom = 1.0 + g2 - 2.0 * g * cosTheta;
    return (1.0 - g2) / (4.0 * CLOUD_PI * pow(max(denom, 1e-10), 1.5));
}

// 双 HG 混合相位函数
float phaseFunction(float cosTheta) {
    return mix(
        henyeyGreenstein(u_scatterAnisotropy1, cosTheta),
        henyeyGreenstein(u_scatterAnisotropy2, cosTheta),
        u_scatterAnisotropyMix
    );
}

// 多重散射近似
float approximateMultipleScattering(float opticalDepth, float cosTheta) {
    vec3 coeffs = vec3(1.0);
    const vec3 attenuation = vec3(0.5, 0.5, 0.5);
    float scattering = 0.0;
    for (int i = 0; i < 8; i++) {
        if (i >= u_multiScatteringOctaves) break;
        float beerLambert = exp(-opticalDepth * coeffs.y);
        float phase = mix(
            henyeyGreenstein(u_scatterAnisotropy1 * coeffs.z, cosTheta),
            henyeyGreenstein(u_scatterAnisotropy2 * coeffs.z, cosTheta),
            u_scatterAnisotropyMix
        );
        scattering += coeffs.x * beerLambert * phase;
        coeffs *= attenuation;
    }
    return scattering;
}

// 密度剖面
float cloudDensityProfile(float heightFraction) {
    float base = exp(-heightFraction * 3.0);
    float bottomBoost = exp(-heightFraction * 8.0) * 0.5;
    float topErosion = 1.0 - exp(-(1.0 - heightFraction) * 4.0);
    float midBump = exp(-pow((heightFraction - 0.4) * 3.0, 2.0));
    return (base + bottomBoost) * topErosion * midBump;
}

// 光线-球面求交
bool raySphereIntersect(vec3 ro, vec3 rd, float radius, out float tNear, out float tFar) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - radius * radius;
    float disc = b * b - c;
    if (disc < 0.0) { tNear = 0.0; tFar = 0.0; return false; }
    float s = sqrt(disc);
    tNear = -b - s;
    tFar = -b + s;
    return true;
}

// ─── 3D Perlin 噪声（程序化降级用） ──────────────────────────

vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute4(vec4 x) { return mod289v4(((x * 34.0) + 10.0) * x); }
vec4 taylorInv(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float perlinNoise3D(vec3 P) {
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + 1.0;
    Pi0 = mod289v3(Pi0); Pi1 = mod289v3(Pi1);
    vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - 1.0;
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz; vec4 iz1 = Pi1.zzzz;
    vec4 ixy = permute4(permute4(ix) + iy);
    vec4 ixy0 = permute4(ixy + iz0);
    vec4 ixy1 = permute4(ixy + iz1);
    vec4 gx0 = ixy0 * (1.0 / 7.0);
    vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);
    vec4 gx1 = ixy1 * (1.0 / 7.0);
    vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);
    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
    vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
    vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
    vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
    vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
    vec4 norm0 = taylorInv(vec4(dot(g000,g000), dot(g010,g010), dot(g100,g100), dot(g110,g110)));
    g000*=norm0.x; g010*=norm0.y; g100*=norm0.z; g110*=norm0.w;
    vec4 norm1 = taylorInv(vec4(dot(g001,g001), dot(g011,g011), dot(g101,g101), dot(g111,g111)));
    g001*=norm1.x; g011*=norm1.y; g101*=norm1.z; g111*=norm1.w;
    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);
    vec3 fade = Pf0 * Pf0 * Pf0 * (Pf0 * (Pf0 * 6.0 - 15.0) + 10.0);
    vec4 nz = mix(vec4(n000,n100,n010,n110), vec4(n001,n101,n011,n111), fade.z);
    vec2 nyz = mix(nz.xy, nz.zw, fade.y);
    return 2.2 * mix(nyz.x, nyz.y, fade.x);
}

// FBM
float fbm3D(vec3 p, int octaves) {
    float sum = 0.0, amp = 1.0, freq = 1.0;
    for (int i = 0; i < 6; i++) {
        if (i >= octaves) break;
        sum += amp * perlinNoise3D(p * freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return sum;
}

// ─── 天气纹理采样 ─────────────────────────────────────────────
// 天气纹理编码: r=覆盖率, g=云类型, b=降水概率

struct WeatherData {
    float coverage;
    float cloudType;
    float precipitation;
};

WeatherData sampleWeather(vec3 worldPos, float bottomRadius) {
    // 世界坐标 → 经纬度 UV
    vec3 n = normalize(worldPos);
    float lon = atan(n.z, n.x);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    vec2 uv = vec2(lon / CLOUD_PI * 0.5 + 0.5, lat / CLOUD_PI + 0.5);

    // 风偏移动画
    uv += u_windDirection * u_windSpeed * u_time;
    uv *= u_weatherRepeat;

    // 采样天气纹理（或程序化生成）
    vec3 weatherTex = texture(u_weatherTexture, fract(uv)).rgb;
    // 若纹理未加载（全零），使用程序化天气
    float texLuma = dot(weatherTex, vec3(0.333));
    float coverage = texLuma > 0.01 ? weatherTex.r : 0.5 + 0.3 * perlinNoise3D(worldPos * 0.00005);
    float cloudType = texLuma > 0.01 ? weatherTex.g : 0.5;
    float precip = texLuma > 0.01 ? weatherTex.b : 0.0;

    WeatherData w;
    w.coverage = coverage * u_coverage;
    w.cloudType = cloudType;
    w.precipitation = precip;
    return w;
}

// ─── 密度采样 ─────────────────────────────────────────────────

struct DensityResult {
    float density;
    float extinction;
    float heightFraction;
};

DensityResult sampleCloudDensity(vec3 position, float heightFraction, WeatherData weather, float jitter) {
    // 基础密度 = 天气覆盖 × 密度剖面
    float baseDensity = weather.coverage * cloudDensityProfile(heightFraction);
    baseDensity *= u_densityScale;

    // Shape 纹理采样（低频形状）
    float shapeNoise = 0.0;
    vec3 shapePos = position * u_shapeRepeat + vec3(u_windDirection.x, 0.0, u_windDirection.y) * u_windSpeed * u_time * 0.01;
    vec3 shapeTex = sample3DAs2D(u_shapeTexture, shapePos, u_shapeDepth).rgb;
    float shapeTexLuma = dot(shapeTex, vec3(0.333));
    if (shapeTexLuma > 0.01) {
        shapeNoise = shapeTex.r;
    } else {
        // 程序化降级
        shapeNoise = perlinNoise3D(position * 0.0003) * 0.5 + 0.5;
    }
    // 用 shape 噪声侵蚀基础密度
    baseDensity = cloudRemap(baseDensity, (1.0 - shapeNoise) * u_shapeAmount, 1.0);

    // Shape Detail 纹理采样（高频细节）
    if (u_shapeDetailEnabled > 0.5) {
        vec3 detailPos = position * u_shapeDetailRepeat;
        vec3 detailTex = sample3DAs2D(u_shapeDetailTexture, detailPos, u_shapeDetailDepth).rgb;
        float detailNoise = dot(detailTex, vec3(0.333));
        if (detailNoise < 0.01) {
            // 程序化降级
            detailNoise = perlinNoise3D(position * 0.006) * 0.5 + 0.5;
        }
        float modifier = mix(pow(detailNoise, 6.0), 1.0 - detailNoise, cloudRemap(heightFraction, 0.2, 0.4));
        baseDensity = cloudRemap(baseDensity * 2.0, modifier * u_shapeDetailAmount, 1.0);
    }

    // Turbulence 域扭曲（可选）
    if (u_turbulenceEnabled > 0.5) {
        vec2 turbUV = fract(position.xz * 0.00005 + u_windDirection * u_windSpeed * u_time * 0.001);
        vec3 turbTex = texture(u_turbulenceTexture, turbUV).rgb;
        float turbNoise = dot(turbTex, vec3(0.333));
        if (turbNoise > 0.01) {
            vec3 displacement = (turbTex * 2.0 - 1.0) * u_turbulenceDisplacement;
            // 域扭曲：偏移采样位置后再采样 shape
            vec3 warpedPos = (position + displacement) * u_shapeRepeat;
            float warpedShape = sample3DAs2D(u_shapeTexture, warpedPos, u_shapeDepth).r;
            baseDensity *= mix(1.0, warpedShape, 0.3);
        }
    }

    // Clamp 最终密度
    float density = max(baseDensity, 0.0);
    float extinction = density * (u_scatteringCoefficient + u_absorptionCoefficient);

    DensityResult result;
    result.density = density;
    result.extinction = extinction;
    result.heightFraction = heightFraction;
    return result;
}

// ─── 光照计算 ─────────────────────────────────────────────────

struct LightResult {
    vec3 radiance;
    float opticalDepth;
};

LightResult computeLighting(
    vec3 position, float heightFraction,
    DensityResult density, vec3 sunDir,
    float cosTheta, float stepSize
) {
    // 向太阳方向做二次 ray march（光线能量累积）
    float opticalDepth = 0.0;
    if (u_maxIterationCountToSun > 0) {
        float sunStepSize = u_minSecondaryStepSize;
        float sunDistance = sunStepSize;
        for (int i = 0; i < 8; i++) {
            if (i >= u_maxIterationCountToSun) break;
            vec3 sunSamplePos = position + sunDir * sunDistance;
            float sunHeight = length(sunSamplePos) - u_ellipsoidRadii.x;
            float sunHF = cloudSaturate((sunHeight - u_minHeight) / max(u_maxHeight - u_minHeight, 1.0));
            if (sunHF > 0.0 && sunHF < 1.0) {
                WeatherData sunWeather = sampleWeather(sunSamplePos, u_ellipsoidRadii.x);
                DensityResult sunDensity = sampleCloudDensity(sunSamplePos, sunHF, sunWeather, 0.0);
                opticalDepth += sunDensity.extinction * sunStepSize;
            }
            sunDistance += sunStepSize;
            sunStepSize *= 2.0; // 步长递增
        }
    }

    // 太阳光照 × 多重散射
    float sunScattering = approximateMultipleScattering(opticalDepth, cosTheta);

    // 地面反弹光（简化：使用高度衰减近似）
    float heightFactor = cloudSaturate(heightFraction * 2.0);
    float groundBounce = heightFactor * u_groundBounceScale * 0.3;

    // 天空光（简化：基于高度的梯度）
    float skyGradient = cloudSaturate(1.0 - heightFraction * 0.5) * u_skyLightScale;

    // Powder 效应
    float powder = 1.0 - u_powderScale * exp(-density.extinction * 150.0);

    // 组合辐射度
    vec3 sunColor = vec3(1.0, 0.95, 0.9) * 4.0; // 太阳光色温
    vec3 skyColor = vec3(0.5, 0.6, 0.9);          // 天空光色温
    vec3 groundColor = vec3(0.3, 0.4, 0.2);       // 地面反弹色

    vec3 radiance = sunColor * sunScattering;
    radiance += skyColor * skyGradient;
    radiance += groundColor * groundBounce;
    radiance *= powder;

    // 夜间光照
    float nightFactor = 1.0 - u_dayLightFactor;
    if (nightFactor > 0.01) {
        vec3 moonDir = normalize(vec3(0.5, 0.7, -0.3)); // 简化月亮方向
        float moonDiffuse = max(dot(vec3(0.0, 1.0, 0.0), moonDir), 0.0);
        float moonPhase = approximateMultipleScattering(opticalDepth * 0.35, cosTheta);
        vec3 nightRadiance = u_nightColor * u_nightAmbientIntensity;
        nightRadiance += u_nightColor * u_nightMoonIntensity * moonDiffuse * moonPhase;
        radiance = mix(radiance, nightRadiance, nightFactor);
    }

    LightResult result;
    result.radiance = radiance;
    result.opticalDepth = opticalDepth;
    return result;
}

// ─── 主 Ray March ─────────────────────────────────────────────

struct MarchResult {
    vec3 color;
    float alpha;
    float depth;
};

MarchResult marchClouds(vec3 rayOrigin, vec3 rayDir, float marchStart, float marchEnd) {
    float bottomRadius = u_ellipsoidRadii.x;
    vec3 sunDir = normalize(u_sunDirection);
    float cosTheta = dot(rayDir, sunDir);

    // 累积变量
    vec3 radianceIntegral = vec3(0.0);
    float transmittanceIntegral = 1.0;
    float rayDistance = marchStart;
    float stepSize = u_minStepSize;

    // 时间抖动（蓝噪声降级：使用随机偏移）
    float jitter = fract(sin(dot(v_textureCoordinates, vec2(12.9898, 78.233))) * 43758.5453);

    MarchResult result;
    result.color = vec3(0.0);
    result.alpha = 0.0;
    result.depth = marchEnd;

    for (int i = 0; i < 512; i++) {
        if (i >= u_maxIterationCount) break;
        if (rayDistance > marchEnd || rayDistance > u_maxRayDistance) break;
        if (transmittanceIntegral < u_minTransmittance) break;

        // 当前采样位置
        vec3 position = rayOrigin + rayDir * rayDistance;
        float height = length(position) - bottomRadius;
        float heightFraction = cloudSaturate((height - u_minHeight) / max(u_maxHeight - u_minHeight, 1.0));

        // 在云层范围内才采样
        if (heightFraction > 0.0 && heightFraction < 1.0) {
            // 采样天气
            WeatherData weather = sampleWeather(position, bottomRadius);

            // 云覆盖率阈值
            if (weather.coverage > u_minDensity) {
                // 采样密度
                DensityResult density = sampleCloudDensity(
                    position, heightFraction, weather,
                    jitter + float(i) * 0.1
                );

                if (density.density > u_minDensity) {
                    // 光照计算
                    LightResult light = computeLighting(
                        position, heightFraction, density,
                        sunDir, cosTheta, stepSize
                    );

                    // Frostbite 能量守恒积分
                    float transmittance = exp(-density.extinction * stepSize);
                    float clampedExtinction = max(density.extinction, 1e-7);
                    vec3 scatteringIntegral = (light.radiance - light.radiance * transmittance) / clampedExtinction;

                    radianceIntegral += transmittanceIntegral * scatteringIntegral * u_scatteringCoefficient;
                    transmittanceIntegral *= transmittance;

                    // 记录第一个有效采样的深度
                    if (result.depth == marchEnd && density.density > 0.01) {
                        result.depth = rayDistance;
                    }

                    // 在云内使用较小步长
                    stepSize = max(stepSize * 0.8, u_minStepSize);
                } else {
                    // 空区域：步长递增
                    stepSize = min(stepSize * u_perspectiveStepScale, u_maxStepSize);
                }
            } else {
                stepSize = min(stepSize * u_perspectiveStepScale, u_maxStepSize);
            }
        } else {
            // 云层外：大步长快速跳过
            stepSize = min(stepSize * u_perspectiveStepScale * 1.5, u_maxStepSize * 2.0);
        }

        rayDistance += stepSize * (1.0 + jitter * 0.1);
    }

    result.color = radianceIntegral;
    result.alpha = 1.0 - transmittanceIntegral;
    return result;
}

// ─── Haze（大气雾霾） ─────────────────────────────────────────
// 云层以下的低空区域使用解析雾模型

vec3 applyHaze(vec3 cloudColor, float cloudAlpha, float rayDistance, float cameraHeight) {
    float hazeDensity = u_hazeDensityScale * exp(-cameraHeight * u_hazeExponent);
    float hazeOpticalDepth = hazeDensity * rayDistance;
    float hazeTransmittance = exp(-hazeOpticalDepth);
    vec3 hazeColor = vec3(0.7, 0.8, 0.9) * u_dayLightFactor; // 雾色
    return mix(hazeColor, cloudColor, cloudAlpha) * hazeTransmittance + cloudColor * (1.0 - hazeTransmittance);
}

// ─── 深度比较辅助 ─────────────────────────────────────────────
// Cesium 使用反向对数深度缓冲 (reverse-log depth):
//   - near plane → windowDepth = 1.0
//   - far plane  → windowDepth = 0.0
// 不使用 czm_reverseLogDepth（PostProcessStage 不可用），
// 改为将云的端点投影到 clip space 做深度比较。

bool isCloudOccluded(vec3 cloudPos, float sceneDepth) {
    // 将云位置投影到 clip space
    vec4 cloudClip = u_inverseView * vec4(cloudPos, 1.0);
    cloudClip = u_inverseProjection * vec4(cloudClip.xyz, 1.0);
    float cloudNdcZ = cloudClip.z / cloudClip.w;
    // 反向深度: cloudNdcZ < sceneNdcZ 表示云在几何后面（被遮挡）
    float sceneNdcZ = sceneDepth * 2.0 - 1.0;
    return cloudNdcZ < sceneNdcZ;
}

// ─── 云层壳体求交 ─────────────────────────────────────────────
// 根据相机与云层的相对位置，确定 ray march 的起止距离

void getCloudLayerIntersections(
    vec3 cameraPos, vec3 rayDir,
    float bottomRadius, float minHeight, float maxHeight,
    out float marchStart, out float marchEnd
) {
    float cloudBottomRadius = bottomRadius + minHeight;
    float cloudTopRadius = bottomRadius + maxHeight;
    float cameraHeight = length(cameraPos);

    float nearBottom, farBottom, nearTop, farTop;
    bool hitBottom = raySphereIntersect(cameraPos, rayDir, cloudBottomRadius, nearBottom, farBottom);
    bool hitTop = raySphereIntersect(cameraPos, rayDir, cloudTopRadius, nearTop, farTop);

    if (cameraHeight < cloudBottomRadius) {
        marchStart = hitBottom ? max(nearBottom, 0.0) : -1.0;
        marchEnd = hitTop ? max(nearTop, 0.0) : -1.0;
    } else if (cameraHeight > cloudTopRadius) {
        marchStart = hitTop ? max(nearTop, 0.0) : -1.0;
        marchEnd = hitBottom ? max(nearBottom, 0.0) : -1.0;
    } else {
        marchStart = 0.0;
        marchEnd = hitTop ? max(nearTop, 0.0) : (hitBottom ? max(farBottom, 0.0) : -1.0);
    }

    if (marchStart < 0.0 || marchEnd < 0.0 || marchEnd <= marchStart) {
        marchStart = -1.0;
        marchEnd = -1.0;
    }
}

// ─── 主函数 ───────────────────────────────────────────────────

void main() {
    fragColor = vec4(0.0);

    if (!u_enabled) return;

    // 1. 读取场景深度（用于深度裁剪）
    float sceneDepth = texture(depthTexture, v_textureCoordinates).r;

    // 2. 从 NDC 重建世界空间射线
    vec2 ndc = v_textureCoordinates * 2.0 - 1.0;
    vec4 clipPos = vec4(ndc, 1.0, 1.0);
    vec4 viewPos = u_inverseProjection * clipPos;
    viewPos /= viewPos.w;
    vec3 worldDir = normalize((u_inverseView * viewPos).xyz - u_cameraPosition);

    // 3. 云层壳体求交
    float bottomRadius = u_ellipsoidRadii.x;
    float cameraHeight = length(u_cameraPosition);

    float marchStart, marchEnd;
    getCloudLayerIntersections(
        u_cameraPosition, worldDir,
        bottomRadius, u_minHeight, u_maxHeight,
        marchStart, marchEnd
    );

    // 无交点 → 跳过
    if (marchStart < 0.0) return;

    // 深度裁剪：场景几何比云更近时跳过
    // sceneDepth < 1.0 表示深度缓冲中有非天空几何
    // 将云的端点投影到 clip space 与场景深度比较
    if (sceneDepth < 1.0) {
        vec3 cloudEndPos = u_cameraPosition + worldDir * marchEnd;
        if (isCloudOccluded(cloudEndPos, sceneDepth)) {
            return; // 云完全被场景几何遮挡
        }
    }

    // 4. 主 Ray March
    MarchResult result = marchClouds(u_cameraPosition, worldDir, marchStart, marchEnd);

    // 5. 应用大气雾霾
    vec3 finalColor = applyHaze(result.color, result.alpha, result.depth, cameraHeight);

    // 6. 应用昼夜过渡
    finalColor *= max(u_dayLightFactor, 0.1); // 夜间不完全黑

    // 7. 输出（alpha blend 到场景）
    fragColor = vec4(finalColor, result.alpha);
}
