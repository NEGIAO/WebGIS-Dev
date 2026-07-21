/**
 * 与 three-geospatial shadow.frag 对齐的 BSM 片元着色器源码。
 * 包含：SVS、与主 pass 一致的 sampleWeather/sampleMedia、raySphereFirstIntersection、getRayNearFar、marchClouds。
 * 单级 cascade，输出 vec4(frontDepth, meanExtinction, maxOpticalDepth, maxOpticalDepthTail)。
 */
export function getShadowFragmentSource(options) {
    const SHADOW_RAY_FAR = Number(options.SHADOW_RAY_FAR) || 500000.0;
    const maxSteps = Math.min(Number(options.maxSteps) || 500, 512);
    const minStepSize = Number(options.minStepSize) || 50.0;
    const maxStepSize = Number(options.maxStepSize) || 1000.0;

    return `#version 300 es
precision highp float;
precision highp sampler3D;

uniform mat4 u_inverseSunViewProj;
uniform mat4 u_reprojectionMatrix;
uniform vec3 u_sunDirection;
// Bruneton bottom 球(6371860) 与 WGS84(6378137) 球心偏移；point.xyz 已在 ECEF，
// 加该偏移对齐到 getRayNearFar 使用的 u_bottomRadius 球坐标系。对齐 three-geospatial shadow.frag。
uniform vec3 u_altitudeCorrection;
uniform vec2 u_resolution;
uniform vec2 u_atlasOffset;
uniform float u_atlasScale;
uniform vec2 u_atlasResolution;
uniform float u_bottomRadius;
uniform float u_shadowTopHeight;
uniform float u_shadowBottomHeight;
uniform float u_weatherRepeat;
uniform vec2 u_localWeatherOffset;
uniform float u_shapeRepeat;
uniform float u_shapeDetailRepeat;
uniform vec3 u_shapeOffset;
uniform vec3 u_shapeDetailOffset;
uniform float u_turbulenceRepeat;
uniform float u_turbulenceDisplacement;
uniform vec4 u_minLayerHeights;
uniform vec4 u_maxLayerHeights;
uniform vec3 u_minIntervalHeights;
uniform vec3 u_maxIntervalHeights;
uniform vec4 u_densityProfileExpTerms;
uniform vec4 u_densityProfileExponents;
uniform vec4 u_densityProfileLinearTerms;
uniform vec4 u_densityProfileConstantTerms;
uniform vec4 u_densityScales;
uniform vec4 u_shapeAmounts;
uniform vec4 u_shapeDetailAmounts;
uniform vec4 u_weatherExponents;
uniform vec4 u_shapeAlteringBiases;
uniform vec4 u_coverageFilterWidths;
uniform vec4 u_coverages;
uniform float u_scatteringCoefficient;
uniform float u_absorptionCoefficient;
uniform float u_time;
uniform float u_evolutionSpeed;
uniform float u_minDensity;
uniform float u_minExtinction;
uniform float u_minTransmittance;
uniform float u_opticalDepthTailScale;

uniform sampler3D u_shapeTexture;
uniform sampler3D u_shapeDetailTexture;
uniform sampler2D u_weatherTexture;
uniform sampler2D u_turbulenceTexture;
uniform sampler2D u_blueNoise;
uniform int u_debugShadow;

in vec2 v_uv;
layout(location = 0) out vec4 out_color;
layout(location = 1) out vec4 out_depthVelocity;

const float PI = 3.14159265359;
const float EVOLUTION_SCALE = 2e4;

float getBlueNoise() { return texture(u_blueNoise, gl_FragCoord.xy / 256.0).r; }

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec4 saturate(vec4 x) { return clamp(x, 0.0, 1.0); }
float remap(float v, float a, float b, float c, float d) { return c + (v - a) * (d - c) / (b - a); }
vec4 remapClamped(vec4 v, vec4 a, vec4 b, vec4 c, vec4 d) { return clamp(c + (v - a) * (d - c) / (b - a), min(c, d), max(c, d)); }
vec4 remapClamped(vec4 v, vec4 a, vec4 b) { return clamp((v - a) / max(b - a, vec4(0.0001)), 0.0, 1.0); }

vec2 getCubeSphereUv(vec3 position) {
    vec3 n = normalize(position);
    vec3 f = abs(n);
    vec3 c = n / max(f.x, max(f.y, f.z));
    vec2 m;
    if (f.y >= f.x && f.y >= f.z) {
        m = c.y > 0.0 ? vec2(-n.x, n.z) : n.xz;
    } else if (f.x >= f.y && f.x >= f.z) {
        m = c.x > 0.0 ? n.yz : vec2(-n.y, n.z);
    } else {
        m = c.z > 0.0 ? n.xy : vec2(n.x, -n.y);
    }
    vec2 m2 = m * m;
    float q = dot(m2.xy, vec2(-2.0, 2.0)) - 3.0;
    float q2 = q * q;
    vec2 uv;
    uv.x = sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(max(0.0, -24.0 * m2.x + q2))) * (m.x > 0.0 ? 1.0 : -1.0);
    uv.y = sqrt(6.0 / max(0.001, 3.0 - uv.x * uv.x)) * m.y;
    return uv * 0.5 + 0.5;
}
vec2 getGlobeUv(vec3 position) { return getCubeSphereUv(position); }

bool inEmptySpace(float height) {
    bvec3 gt = greaterThan(vec3(height), u_minIntervalHeights);
    bvec3 lt = lessThan(vec3(height), u_maxIntervalHeights);
    return (gt.x && lt.x) || (gt.y && lt.y) || (gt.z && lt.z);
}

vec4 getLayerDensity(vec4 heightFraction) {
    return u_densityProfileExpTerms * exp(u_densityProfileExponents * heightFraction)
        + u_densityProfileLinearTerms * heightFraction + u_densityProfileConstantTerms;
}

vec4 getHeightFractions(float height) {
    vec4 range = u_maxLayerHeights - u_minLayerHeights;
    return clamp((vec4(height) - u_minLayerHeights) / max(range, vec4(0.0001)), 0.0, 1.0);
}

struct WeatherSample { vec4 heightFraction; vec4 density; };
struct MediaSample { float density; vec4 weight; float scattering; float extinction; };

vec4 shapeAlteringFunction(vec4 heightFraction, vec4 bias) {
    vec4 biased = pow(heightFraction, bias);
    vec4 x = clamp(biased * 2.0 - 1.0, -1.0, 1.0);
    return 1.0 - x * x;
}

WeatherSample sampleWeather(vec2 uv, float height, float mipLevel) {
    WeatherSample w;
    w.heightFraction = getHeightFractions(height);
    vec2 weatherUv = uv * u_weatherRepeat + u_localWeatherOffset;
    vec4 localWeather = pow(textureLod(u_weatherTexture, weatherUv, mipLevel).rgba, u_weatherExponents);
    vec4 heightScale = shapeAlteringFunction(w.heightFraction, u_shapeAlteringBiases);
    vec4 factor = 1.0 - u_coverages * heightScale;
    w.density = remapClamped(mix(localWeather, vec4(1.0), u_coverageFilterWidths), factor, factor + u_coverageFilterWidths);
    return w;
}

MediaSample sampleMedia(WeatherSample weather, vec3 position, vec2 uv, float mipLevel, float jitter) {
    vec4 density = weather.density;
    vec3 surfaceNormal = normalize(position);
    float localWeatherSpeed = length(u_localWeatherOffset);
    vec3 evolution = -surfaceNormal * localWeatherSpeed * EVOLUTION_SCALE;
    vec2 turbulenceUv = uv * u_weatherRepeat * u_turbulenceRepeat;
    vec3 turbulence = u_turbulenceDisplacement * (texture(u_turbulenceTexture, turbulenceUv).rgb * 2.0 - 1.0)
        * dot(density, remapClamped(weather.heightFraction, vec4(0.3), vec4(0.0)));
    vec3 shapePosition = (position + evolution + turbulence) * u_shapeRepeat + u_shapeOffset;
    float shapeTex = texture(u_shapeTexture, fract(shapePosition)).r;
    density = remapClamped(density, vec4(1.0 - shapeTex) * u_shapeAmounts, vec4(1.0));
    if (mipLevel * 0.5 + (jitter - 0.5) * 0.5 < 0.5) {
        vec3 detailPosition = (position + turbulence) * u_shapeDetailRepeat + u_shapeDetailOffset;
        float detail = texture(u_shapeDetailTexture, detailPosition).r;
        vec4 modifier = mix(vec4(pow(detail, 6.0)), vec4(1.0 - detail), remapClamped(weather.heightFraction, vec4(0.2), vec4(0.4), vec4(0.0), vec4(1.0)));
        modifier = mix(vec4(0.0), modifier, u_shapeDetailAmounts);
        density = remapClamped(density * 2.0, vec4(modifier * 0.5), vec4(1.0));
    }
    density = saturate(density * u_densityScales * getLayerDensity(weather.heightFraction));
    float densitySum = density.x + density.y + density.z + density.w;
    MediaSample media;
    media.density = densitySum;
    media.weight = density / max(densitySum, 1e-7);
    media.scattering = densitySum * u_scatteringCoefficient;
    media.extinction = densitySum * u_absorptionCoefficient + media.scattering;
    return media;
}

void getIcosahedralVertices(vec3 direction, out vec3 v1, out vec3 v2, out vec3 v3) {
    const float a = 0.85065080835204;
    const float b = 0.5257311121191336;
    const float kT = 0.6180339887498948;
    const float kT2 = 0.38196601125010515;
    vec3 absD = abs(direction);
    float s1 = dot(absD, vec3(1.0, kT2, -kT));
    float s2 = dot(absD, vec3(-kT, 1.0, kT2));
    float s3 = dot(absD, vec3(kT2, -kT, 1.0));
    v1 = s1 > 0.0 ? vec3(a, b, 0.0) : vec3(-b, 0.0, a);
    v2 = s2 > 0.0 ? vec3(0.0, a, b) : vec3(a, -b, 0.0);
    v3 = s3 > 0.0 ? vec3(b, 0.0, a) : vec3(0.0, a, -b);
    vec3 octantSign = sign(direction);
    v1 *= octantSign; v2 *= octantSign; v3 *= octantSign;
}

void swapIfBigger(inout vec4 a, inout vec4 b) {
    if (a.w > b.w) { vec4 t = a; a = b; b = t; }
}

void sortVertices(inout vec3 a, inout vec3 b, inout vec3 c) {
    vec4 aw = vec4(a, dot(a, vec3(0.5, 0.5, 1.0)));
    vec4 bw = vec4(b, dot(b, vec3(0.5, 0.5, 1.0)));
    vec4 cw = vec4(c, dot(c, vec3(0.5, 0.5, 1.0)));
    swapIfBigger(aw, bw); swapIfBigger(bw, cw); swapIfBigger(aw, bw);
    a = aw.xyz; b = bw.xyz; c = cw.xyz;
}

vec3 getPentagonalWeights(vec3 direction, vec3 v1, vec3 v2, vec3 v3) {
    vec3 w = exp(vec3(dot(v1, direction), dot(v2, direction), dot(v3, direction)) * 40.0);
    return w / (w.x + w.y + w.z);
}

vec3 getStructureNormal(vec3 direction, float jitter) {
    vec3 a, b, c, weights;
    getIcosahedralVertices(direction, a, b, c);
    sortVertices(a, b, c);
    weights = getPentagonalWeights(direction, a, b, c);
    return jitter < weights.x ? a : (jitter < weights.x + weights.y ? b : c);
}

void intersectStructuredPlanes(vec3 normal, vec3 rayOrigin, vec3 rayDirection, float samplePeriod, out float stepOffset, out float stepSize) {
    float NoD = dot(rayDirection, normal);
    stepSize = samplePeriod / max(abs(NoD), 1e-7);
    stepOffset = -mod(dot(rayOrigin, normal), samplePeriod) / NoD;
    if (stepOffset < 0.0) stepOffset += stepSize;
}

vec4 raySphereFirstIntersection(vec3 origin, vec3 direction, vec3 center, vec4 radius) {
    vec3 a = origin - center;
    float b = 2.0 * dot(direction, a);
    vec4 c = vec4(dot(a, a)) - radius * radius;
    vec4 discriminant = b * b - 4.0 * c;
    vec4 mask = step(discriminant, vec4(0.0));
    return mix((-b - sqrt(max(vec4(0.0), discriminant))) * 0.5, vec4(-1.0), mask);
}

void getRayNearFar(vec3 sunPosition, vec3 rayDirection, out float rayNear, out float rayFar) {
    vec4 radii = u_bottomRadius + vec4(u_shadowTopHeight, u_shadowBottomHeight, 0.0, 0.0);
    vec4 firstIntersections = raySphereFirstIntersection(sunPosition, rayDirection, vec3(0.0), radii);
    rayNear = max(0.0, firstIntersections.x);
    rayFar = firstIntersections.y < 0.0 ? 1e6 : firstIntersections.y;
}

vec4 marchClouds(vec3 rayOrigin, vec3 rayDirection, float maxRayDistance, float jitter, float mipLevel) {
    vec3 normal = getStructureNormal(rayDirection, jitter);
    float rayDistance, stepSize;
    float samplePeriod = clamp(maxRayDistance / float(${maxSteps}), ${minStepSize.toFixed(1)}, ${maxStepSize.toFixed(1)});
    intersectStructuredPlanes(normal, rayOrigin, rayDirection, samplePeriod, rayDistance, stepSize);
    rayDistance -= stepSize * jitter;

    float extinctionSum = 0.0;
    float maxOpticalDepth = 0.0;
    float maxOpticalDepthTail = 0.0;
    float transmittanceIntegral = 1.0;
    float weightedDistanceSum = 0.0;
    float transmittanceSum = 0.0;
    int sampleCount = 0;

    for (int i = 0; i < 512; i++) {
        if (float(i) >= float(${maxSteps})) break;
        if (rayDistance > maxRayDistance) break;
        if (transmittanceIntegral <= u_minTransmittance) break;

        vec3 position = rayDistance * rayDirection + rayOrigin;
        float height = length(position) - u_bottomRadius;

        if (inEmptySpace(height)) {
            rayDistance += stepSize;
            continue;
        }

        vec2 uv = getGlobeUv(position);
        WeatherSample weather = sampleWeather(uv, height, mipLevel);
        if (!any(greaterThan(weather.density, vec4(u_minDensity)))) {
            rayDistance += stepSize;
            continue;
        }

        MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter);
        if (media.extinction > u_minExtinction) {
            extinctionSum += media.extinction;
            maxOpticalDepth += media.extinction * stepSize;
            transmittanceIntegral *= exp(-media.extinction * stepSize);
            weightedDistanceSum += rayDistance * transmittanceIntegral;
            transmittanceSum += transmittanceIntegral;
            sampleCount++;
        }

        if (transmittanceIntegral <= u_minTransmittance) {
            maxOpticalDepthTail = min(u_opticalDepthTailScale * stepSize * exp(float(1 - sampleCount)), stepSize * 0.5);
            break;
        }
        rayDistance += stepSize;
    }

    if (sampleCount == 0) {
        return vec4(maxRayDistance, 0.0, 0.0, 0.0);
    }
    float frontDepth = min(weightedDistanceSum / transmittanceSum, maxRayDistance);
    float meanExtinction = extinctionSum / float(sampleCount);
    return vec4(frontDepth, meanExtinction, maxOpticalDepth, maxOpticalDepthTail);
}

void main() {
    if (u_debugShadow == 1) {
        // 强制输出：用于验证 ShadowPass 是否在写入颜色附件
        out_color = vec4(0.0, 0.0, 1.0, 1.0);
        out_depthVelocity = vec4(0.0);
        return;
    }
    if (u_debugShadow == 2) {
        // 直接显示天气纹理采样（验证 u_weatherTexture 是否绑定/是否全 0）
        vec4 w = texture(u_weatherTexture, v_uv * 4.0);
        out_color = vec4(w.rgb, 1.0);
        out_depthVelocity = vec4(0.0);
        return;
    }
    if (u_debugShadow == 9) {
        // shapeTexture: sanity for 3D texture binding
        float s = texture(u_shapeTexture, vec3(v_uv, 0.5)).r;
        out_color = vec4(vec3(s), 1.0);
        out_depthVelocity = vec4(0.0);
        return;
    }
    if (u_debugShadow == 10) {
        // shapeDetailTexture: sanity for 3D texture binding
        float s = texture(u_shapeDetailTexture, vec3(v_uv, 0.5)).r;
        out_color = vec4(vec3(s), 1.0);
        out_depthVelocity = vec4(0.0);
        return;
    }
    if (u_debugShadow == 4 || u_debugShadow == 5 || u_debugShadow == 6 || u_debugShadow == 7 || u_debugShadow == 8) {
        vec2 clip = v_uv * 2.0 - 1.0;
        vec4 point = u_inverseSunViewProj * vec4(clip.xy, -1.0, 1.0);
        point /= point.w;
        vec3 sunPosition = point.xyz + u_altitudeCorrection;

        vec3 rayDirection = normalize(u_sunDirection);
        float rayNear, rayFar;
        getRayNearFar(sunPosition, rayDirection, rayNear, rayFar);
        vec3 rayOrigin = rayNear * rayDirection + sunPosition;
        float maxRayDist = min(rayFar - rayNear, ${SHADOW_RAY_FAR.toFixed(1)});
        float stbn = getBlueNoise();

        if (u_debugShadow == 7) {
            // Ray sanity: R=rayNear/max, G=rayFar/max, B=maxRayDist/max
            float m = max(${SHADOW_RAY_FAR.toFixed(1)}, 1.0);
            out_color = vec4(
                clamp(rayNear / m, 0.0, 1.0),
                clamp(rayFar / m, 0.0, 1.0),
                clamp(maxRayDist / m, 0.0, 1.0),
                1.0
            );
            out_depthVelocity = vec4(0.0);
            return;
        }
        if (u_debugShadow == 8) {
            // sunPosition sanity
            float lenN = clamp(length(sunPosition) / (u_bottomRadius + max(u_shadowTopHeight, 1.0)), 0.0, 1.0);
            out_color = vec4(vec3(lenN), 1.0);
            out_depthVelocity = vec4(0.0);
            return;
        }

        // March-lite diagnostics (no need for full BSM output)
        vec3 normal = getStructureNormal(rayDirection, stbn);
        float rayDistance, stepSize;
        float samplePeriod = clamp(max(maxRayDist, 0.0) / float(${maxSteps}), ${minStepSize.toFixed(1)}, ${maxStepSize.toFixed(1)});
        intersectStructuredPlanes(normal, rayOrigin, rayDirection, samplePeriod, rayDistance, stepSize);
        rayDistance -= stepSize * stbn;

        float maxDensitySum = 0.0;
        float maxExtinction = 0.0;
        int emptySkipped = 0;
        int iter = 0;
        for (int i = 0; i < 512; i++) {
            if (float(i) >= float(${maxSteps})) break;
            if (rayDistance > maxRayDist) break;
            iter++;
            vec3 position = rayDistance * rayDirection + rayOrigin;
            float height = length(position) - u_bottomRadius;
            if (inEmptySpace(height)) {
                emptySkipped++;
                rayDistance += stepSize;
                continue;
            }
            vec2 uv = getGlobeUv(position);
            WeatherSample weather = sampleWeather(uv, height, 0.0);
            if (!any(greaterThan(weather.density, vec4(u_minDensity)))) {
                rayDistance += stepSize;
                continue;
            }
            MediaSample media = sampleMedia(weather, position, uv, 0.0, stbn);
            maxDensitySum = max(maxDensitySum, media.density);
            maxExtinction = max(maxExtinction, media.extinction);
            rayDistance += stepSize;
        }

        float outV = 0.0;
        if (u_debugShadow == 4) {
            // max density
            outV = 1.0 - exp(-maxDensitySum * 2.0);
        } else if (u_debugShadow == 5) {
            // max extinction
            outV = 1.0 - exp(-maxExtinction * 0.5);
        } else {
            // empty ratio (u_debugShadow == 6)
            outV = (iter > 0) ? (float(emptySkipped) / float(iter)) : 0.0;
        }
        out_color = vec4(vec3(clamp(outV, 0.0, 1.0)), 1.0);
        out_depthVelocity = vec4(0.0);
        return;
    }
    vec2 clip = v_uv * 2.0 - 1.0;
    vec4 point = u_inverseSunViewProj * vec4(clip.xy, -1.0, 1.0);
    point /= point.w;
    vec3 sunPosition = point.xyz + u_altitudeCorrection;

    vec3 rayDirection = normalize(u_sunDirection);
    float rayNear, rayFar;
    getRayNearFar(sunPosition, rayDirection, rayNear, rayFar);

    vec3 rayOrigin = rayNear * rayDirection + sunPosition;
    float maxRayDist = min(rayFar - rayNear, ${SHADOW_RAY_FAR.toFixed(1)});
    float stbn = getBlueNoise();
    float mipLevel = 0.0;

    vec4 color = marchClouds(rayOrigin, rayDirection, maxRayDist, stbn, mipLevel);
    if (u_debugShadow == 3) {
        // 显示本像素是否采到云（sampleCount>0 时 meanExtinction>0）
        float hit = (color.y > 0.0) ? 1.0 : 0.0;
        out_color = vec4(hit, hit, hit, 1.0);
        out_depthVelocity = vec4(0.0);
        return;
    }
    out_color = color;

    // Velocity for temporal resolve (three-geospatial shadow.frag TEMPORAL_PASS)
    vec2 atlasUv = v_uv * u_atlasScale + u_atlasOffset;
    vec3 frontPosition = color.x * rayDirection + rayOrigin;
    // frontPosition 含 altitudeCorrection（Bruneton 球系）；reprojection 用世界坐标，需减回偏移。
    // 对齐 three-geospatial shadow.frag: ecefToWorldMatrix * (frontPosition - altitudeCorrection)
    vec4 prevClip = u_reprojectionMatrix * vec4(frontPosition - u_altitudeCorrection, 1.0);
    prevClip /= prevClip.w;
    vec2 prevUv = prevClip.xy * 0.5 + 0.5;
    vec2 prevAtlasUv = prevUv * u_atlasScale + u_atlasOffset;
    vec2 velocity = (atlasUv - prevAtlasUv) * u_atlasResolution;
    out_depthVelocity = vec4(color.x, velocity.x, velocity.y, 0.0);
}
`;
}
