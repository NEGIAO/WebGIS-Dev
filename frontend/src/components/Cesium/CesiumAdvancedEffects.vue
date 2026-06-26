<template>
    <div
        v-if="!headless"
        class="advanced-effects-root"
    >
        <div class="effects-panel">
            <div class="panel-head">
                <span class="panel-title">Cinematic FX</span>
                <button
                    class="panel-btn"
                    @click="toggleChartVisibility"
                >
                    {{ chartVisible ? '隐藏图表' : '显示图表' }}
                </button>
            </div>

            <div class="effect-switches">
                <LilGuiControls
                    title="Effect Parameters"
                    :controls="effectGuiControls"
                    @change="handleEffectGuiChange"
                />
            </div>

            <div
                v-show="chartVisible"
                ref="chartRef"
                class="fx-chart"
            ></div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMessage } from '../../composables/useMessage';
import {
    captureRealisticAtmosphereState,
    configureRealisticAtmosphere,
    restoreRealisticAtmosphere,
} from './composables/cesiumAtmosphere';
import { useCesiumTemporalUpsampling } from './Clouds/composables/useCesiumTemporalUpsampling';
import AtmosphereLutResources from './Clouds/atmosphereLutResources';
import CloudShadowPrimitive from './Clouds/CloudShadowPrimitive';
import { SHADOW_RESOLVE_FRAGMENT_SHADER, SHADOW_TAA_CONFIG } from './Clouds/shadowResolveShaders';
import { QUALITY_PRESETS } from './Clouds/cloudDefaults';
import LilGuiControls from './LilGuiControls.vue';

const props = defineProps({
    headless: {
        type: Boolean,
        default: false,
    },
    getViewer: {
        type: Function,
        required: true,
    },
    getCesium: {
        type: Function,
        required: true,
    },
    controls: {
        type: Object,
        default: () => ({}),
    },
});

const message = useMessage();
const chartRef = ref(null);

const fogEnabled = ref(false);
const volumetricCloudsEnabled = ref(false);
const hbaoEnabled = ref(false);
const tiltShiftEnabled = ref(false);
const atmosphereEnabled = ref(false);
const chartVisible = ref(false);
const cloudControls = ref({
    quality: 'medium',  // 质量等级：low/medium/high/ultra
    coverage: 0.52,
    density: 0.00009,
    shadowStrength: 0.82,
    beerShadowStrength: 0.64,
    multiScattering: 0.58,
    powderStrength: 0.72,
    hazeStrength: 0.38,
    groundBounceStrength: 0.26,
    bsmShadow: false,
    shadowResolution: 256,
    maxDistance: 360000,
    stepCount: 32,  // 降低默认值避免卡死
});

const effectGuiControls = computed(() => [
    { id: 'fog', label: 'Height Fog', type: 'toggle', value: fogEnabled.value },
    { id: 'volumetricClouds', label: 'Clouds', type: 'toggle', value: volumetricCloudsEnabled.value },
    { id: 'hbao', label: 'HBAO', type: 'toggle', value: hbaoEnabled.value },
    { id: 'tiltShift', label: 'Tilt Shift', type: 'toggle', value: tiltShiftEnabled.value },
    { id: 'atmosphere', label: 'Atmosphere + Bloom', type: 'toggle', value: atmosphereEnabled.value },
]);

let fogStage = null;
let volumetricCloudsStage = null;
let cloudShadowPrimitive = null;
let cloudShadowFailed = false;
let atmosphereLutResources = null;
let cloudShadowFallbackTexture = null;
let ownsCloudShadowFallbackTexture = false;
let tiltShiftStage = null;
let ambientOcclusionStage = null;
let createdAmbientOcclusionStage = false;

// TAAU 时序上采样模块实例（懒初始化）
let _temporalUpsampling = null;
let _taaResolveStage = null;

// BSM Shadow TAA 历史纹理（用于时序抗锯齿）
let _shadowHistoryTexture = null;
let _shadowResolveStage = null;

let chartInstance = null;
let echartsModule = null;
let echartsRuntimePromise = null;

let bootstrapTimer = null;
let samplingTimer = null;
let resizeHandler = null;
let preRenderListener = null;
let renderErrorListener = null;
let hasRenderErrorNotified = false;
let realisticAtmosphereSnapshot = null;
let cloudClockEpoch = null;

let frameCounter = 0;
let fpsValue = 0;
let fpsStamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
const atmosphereScratchUp = {};

function loadEchartsRuntime() {
    if (echartsRuntimePromise) return echartsRuntimePromise;

    echartsRuntimePromise = import('../../utils/echarts/cesiumFxRuntime.js')
        .then((runtimeModule) => {
            const runtime = runtimeModule?.getCesiumFxEchartsRuntime?.();
            if (!runtime) {
                throw new Error('Cinematic FX 图表运行时加载失败');
            }

            echartsModule = runtime;
            return runtime;
        })
        .catch((error) => {
            echartsRuntimePromise = null;
            throw error;
        });

    return echartsRuntimePromise;
}

async function ensureEchartsReady() {
    if (echartsModule) return echartsModule;
    return loadEchartsRuntime();
}

const chartData = {
    labels: [],
    cameraHeightKm: [],
    pitchDeg: [],
    fps: [],
};

const cloudShadowUniformScratch = {
    texture: null,
    matrices: null,
    inverseMatrices: null,
    splits: null,
    params: null,
};

const originalSceneState = {
    hdr: null,
    bloom: null,
    sky: null,
};

const VOLUMETRIC_CLOUDS_FRAGMENT_SHADER = `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform sampler2D u_cloudShadowTexture;
uniform sampler2D u_atmosphereTransmittanceTexture;
uniform sampler2D u_atmosphereIrradianceTexture;
uniform sampler2D u_atmosphereScatteringTexture;
uniform vec3 u_cameraPositionWC;
uniform vec3 u_cameraDirectionWC;
uniform mat4 u_inverseViewProjection;
uniform vec3 u_sunDirectionWC;
uniform mat4 u_cloudShadowMatrices[4];
uniform mat4 u_cloudShadowInverseMatrices[4];
uniform vec4 u_cloudShadowSplits;
uniform vec4 u_cloudShadowParams;
uniform float u_cloudBottomRadius;
uniform float u_cloudTopRadius;
uniform float u_maxDistance;
uniform float u_coverage;
uniform float u_density;
uniform float u_shadowStrength;
uniform float u_beerShadowStrength;
uniform float u_multiScattering;
uniform float u_powderStrength;
uniform float u_hazeStrength;
uniform float u_groundBounceStrength;
uniform float u_stepCount;
uniform float u_timeSeconds;
uniform vec4 u_atmosphereParams; // x=enabled, y=rayleigh, z=mie, w=aerial perspective strength
uniform float u_qualityLevel; // 0=low, 1=medium, 2=high, 3=ultra

#if __VERSION__ == 300
in vec2 v_textureCoordinates;
#define SAMPLE_TEX texture
#define FRAG_COLOR out_FragColor
#else
varying vec2 v_textureCoordinates;
#define SAMPLE_TEX texture2D
#define FRAG_COLOR gl_FragColor
#endif

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    float y0 = mix(x00, x10, f.y);
    float y1 = mix(x01, x11, f.y);
    return mix(y0, y1, f.z);
}

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += valueNoise(p) * amplitude;
        p = p * 2.03 + vec3(17.1, 31.7, 11.3);
        amplitude *= 0.5;
    }
    return value;
}

vec2 raySphere(vec3 origin, vec3 direction, float radius) {
    float b = dot(origin, direction);
    float c = dot(origin, origin) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) {
        return vec2(1.0, 0.0);
    }
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

float getSceneDistance(vec2 uv) {
    float depth = czm_readDepth(depthTexture, uv);
    if (depth <= 0.0 || depth >= 1.0) {
        return 1.0e9;
    }
    vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
    return length(eye.xyz);
}

vec3 getRayDirection(vec2 uv) {
    vec2 ndc = uv * 2.0 - 1.0;
    vec4 farPosition = u_inverseViewProjection * vec4(ndc, 1.0, 1.0);
    float safeW = abs(farPosition.w) < 0.00001 ? 0.00001 : farPosition.w;
    farPosition.xyz /= safeW;
    return normalize(farPosition.xyz - u_cameraPositionWC);
}

float sampleCloudDensity(vec3 position, float heightFraction) {
    vec3 normal = normalize(position);
    vec3 wind = vec3(u_timeSeconds * 0.0025, u_timeSeconds * 0.0015, 0.0);
    vec3 weatherCoord = normal * 42.0 + wind;
    vec3 shapeCoord = position * 0.000075 + vec3(u_timeSeconds * 0.006, 0.0, 0.0);

    float weather = fbm(weatherCoord);
    float shape = fbm(shapeCoord);
    float detail = fbm(shapeCoord * 3.2 + 19.0);
    float profile = smoothstep(0.02, 0.22, heightFraction) * (1.0 - smoothstep(0.72, 1.0, heightFraction));
    float coverageCutoff = 1.0 - u_coverage;
    float baseDensity = smoothstep(coverageCutoff, coverageCutoff + 0.28, weather * 0.72 + shape * 0.28);
    float carved = baseDensity * smoothstep(0.10, 0.82, detail);

    return carved * profile;
}

float hgPhase(float cosTheta, float g) {
    float g2 = g * g;
    float denom = pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.001), 1.5);
    return (1.0 - g2) / (12.5663706144 * denom);
}

// ============================================================
// 大气散射物理常数（基于 Bruneton 预计算大气模型）
// ============================================================
// Rayleigh 散射系数 (RGB, 550nm 参考): vec3(5.5e-6, 13.0e-6, 28.4e-6)
// Mie 散射系数: 21.0e-6
// Rayleigh 标高: 10000.0m (10km)
// Mie 标高: 3200.0m (3.2km)
// 地球半径: 6378137.0m (WGS84)
// 大气层顶: 90000.0m (90km)
// ============================================================

float rayleighPhase(float cosTheta) {
    return 0.05968310366 * (1.0 + cosTheta * cosTheta);
}

float opticalDepthHeight(float radius, float scaleHeight) {
    float altitude = max(radius - 6378137.0, 0.0);
    return exp(-altitude / scaleHeight);
}

vec3 atmosphereExtinctionAtRadius(float radius) {
    vec3 betaRayleigh = vec3(5.5e-6, 13.0e-6, 28.4e-6) * max(u_atmosphereParams.y, 0.0);
    vec3 betaMie = vec3(21.0e-6) * max(u_atmosphereParams.z, 0.0);
    float rayleighDensity = opticalDepthHeight(radius, 10000.0);  // Rayleigh 标高 10km
    float mieDensity = opticalDepthHeight(radius, 3200.0);        // Mie 标高 3.2km
    return betaRayleigh * rayleighDensity + betaMie * mieDensity;
}

vec3 approximateSunTransmittance(vec3 position, vec3 sunDirection) {
    if (u_atmosphereParams.x < 0.5) {
        return vec3(1.0);
    }

    float radius = length(position);
    float mu = dot(normalize(position), sunDirection);
    float altitudeUv = saturate((radius - 6378137.0) / 90000.0);
    vec2 lutUv = vec2(mu * 0.5 + 0.5, altitudeUv);
    vec3 lutTransmittance = SAMPLE_TEX(u_atmosphereTransmittanceTexture, lutUv).rgb;
    float horizon = smoothstep(-0.08, 0.18, mu);
    float slant = 1.0 / max(mu * 0.5 + 0.5, 0.08);
    vec3 extinction = atmosphereExtinctionAtRadius(radius);
    vec3 analyticTransmittance = exp(-extinction * slant * 18000.0) * (0.22 + 0.78 * horizon);
    return mix(analyticTransmittance, lutTransmittance, 0.78);
}

vec3 approximateSkyIrradiance(vec3 position, vec3 sunDirection) {
    float radius = length(position);
    vec3 normal = normalize(position);
    float sunUp = saturate(dot(normal, sunDirection) * 0.5 + 0.5);
    float altitudeUv = saturate((radius - 6378137.0) / 90000.0);
    vec3 lutIrradiance = SAMPLE_TEX(u_atmosphereIrradianceTexture, vec2(sunUp, altitudeUv)).rgb;
    vec3 betaRayleigh = vec3(5.5e-6, 13.0e-6, 28.4e-6) * max(u_atmosphereParams.y, 0.0);
    vec3 blueScatter = normalize(betaRayleigh + vec3(0.000001));
    vec3 skyTint = mix(vec3(0.75, 0.56, 0.42), blueScatter * 1.85, smoothstep(0.08, 0.75, sunUp));
    float density = opticalDepthHeight(radius, 10000.0);
    float ambient = 0.18 + 0.55 * sunUp;
    vec3 analyticIrradiance = skyTint * ambient * (0.35 + 0.65 * density);
    return mix(analyticIrradiance, lutIrradiance, 0.78);
}

void GetSunAndSkyScalarIrradiance(vec3 position, vec3 sunDirection, out vec3 sunIrradiance, out vec3 skyIrradiance) {
    sunIrradiance = mix(vec3(1.0), approximateSunTransmittance(position, sunDirection), saturate(u_atmosphereParams.x));
    skyIrradiance = mix(vec3(0.42, 0.62, 0.86), approximateSkyIrradiance(position, sunDirection), saturate(u_atmosphereParams.x));
}

void GetSkyRadianceToPoint(vec3 cameraPosition, vec3 pointPosition, vec3 sunDirection, out vec3 transmittance, out vec3 inScattering) {
    vec3 segment = pointPosition - cameraPosition;
    float distanceMeters = length(segment);
    vec3 rayDirection = distanceMeters > 1.0 ? segment / distanceMeters : normalize(pointPosition);

    if (u_atmosphereParams.x < 0.5) {
        transmittance = vec3(1.0);
        inScattering = vec3(0.0);
        return;
    }

    float density = opticalDepthHeight(length(cameraPosition), 10000.0) * 0.35 +
        opticalDepthHeight(length(pointPosition), 10000.0) * 0.65;
    vec3 rayleigh = vec3(5.5e-6, 13.0e-6, 28.4e-6) * max(u_atmosphereParams.y, 0.0);
    vec3 mie = vec3(21.0e-6) * max(u_atmosphereParams.z, 0.0);
    vec3 extinction = (rayleigh * 1.15 + mie * 0.72) * density;
    transmittance = exp(-extinction * distanceMeters * u_atmosphereParams.w);
    float cosTheta = dot(rayDirection, sunDirection);
    vec3 sunTransmittance = approximateSunTransmittance(mix(cameraPosition, pointPosition, 0.55), sunDirection);
    float distanceUv = saturate(distanceMeters / 360000.0);
    vec3 lutScattering = SAMPLE_TEX(u_atmosphereScatteringTexture, vec2(cosTheta * 0.5 + 0.5, distanceUv)).rgb;
    vec3 phaseColor =
        vec3(0.42, 0.58, 0.86) * rayleighPhase(cosTheta) * 18.0 +
        vec3(1.0, 0.78, 0.48) * hgPhase(cosTheta, 0.76) * 6.0;
    inScattering = mix(phaseColor, lutScattering, 0.82) * sunTransmittance * (1.0 - transmittance);
}

vec3 applyAerialPerspective(vec3 color, vec3 rayDirection, vec3 sunDirection, float frontDistance, float alpha) {
    vec3 pointPosition = u_cameraPositionWC + rayDirection * max(frontDistance, 0.0);
    vec3 transmittance;
    vec3 inScattering;
    GetSkyRadianceToPoint(u_cameraPositionWC, pointPosition, sunDirection, transmittance, inScattering);
    return color * transmittance + inScattering * alpha;
}

float marchSunOpticalDepth(vec3 startPosition, vec3 sunDirection) {
    vec2 sunHit = raySphere(startPosition, sunDirection, u_cloudTopRadius);
    float maxDistance = max(sunHit.y, 0.0);
    // 性能优化：减少步数从 6 到 3
    float stepSize = min(maxDistance / 3.0, 5000.0);
    float distanceAlongRay = stepSize * 0.5;
    float opticalDepth = 0.0;

    for (int i = 0; i < 3; i++) {
        if (distanceAlongRay > maxDistance) {
            break;
        }

        vec3 samplePosition = startPosition + sunDirection * distanceAlongRay;
        float radius = length(samplePosition);
        float heightFraction = saturate((radius - u_cloudBottomRadius) / (u_cloudTopRadius - u_cloudBottomRadius));
        if (heightFraction > 0.0 && heightFraction < 1.0) {
            opticalDepth += sampleCloudDensity(samplePosition, heightFraction) * stepSize;
        }

        distanceAlongRay += stepSize;
    }

    return opticalDepth;
}

float structuredShadowJitter(vec3 position, vec3 sunDirection) {
    vec3 p = normalize(position) * 37.0 + sunDirection * 19.0;
    return hash31(p + vec3(fract(u_timeSeconds * 0.031)));
}

float marchBeerShadowOpticalDepth(vec3 startPosition, vec3 sunDirection) {
    vec2 sunHit = raySphere(startPosition, sunDirection, u_cloudTopRadius);
    float maxDistance = max(sunHit.y, 0.0);
    if (maxDistance <= 0.0) {
        return 0.0;
    }

    // 性能优化：减少步数从 10 到 4
    float stepSize = min(maxDistance / 4.0, 12000.0);
    float jitter = structuredShadowJitter(startPosition, sunDirection);
    float distanceAlongRay = stepSize * (0.35 + jitter * 0.55);
    float opticalDepth = 0.0;
    float lastDensity = 0.0;

    for (int i = 0; i < 4; i++) {
        if (distanceAlongRay > maxDistance) {
            break;
        }

        vec3 samplePosition = startPosition + sunDirection * distanceAlongRay;
        float radius = length(samplePosition);
        float heightFraction = saturate((radius - u_cloudBottomRadius) / (u_cloudTopRadius - u_cloudBottomRadius));
        if (heightFraction > 0.0 && heightFraction < 1.0) {
            lastDensity = sampleCloudDensity(samplePosition, heightFraction);
            opticalDepth += lastDensity * stepSize;
        }

        distanceAlongRay += stepSize * 1.18;
    }

    float tailDistance = max(maxDistance - distanceAlongRay, 0.0);
    opticalDepth += lastDensity * tailDistance * 0.28;
    return opticalDepth;
}

float sampleBsmShadow(vec3 position, float cameraDistance, float localShadow) {
    if (u_cloudShadowParams.x < 0.5) {
        return 1.0;
    }

    int cascadeIndex = 0;
    if (cameraDistance > u_cloudShadowSplits.z) {
        cascadeIndex = 3;
    } else if (cameraDistance > u_cloudShadowSplits.y) {
        cascadeIndex = 2;
    } else if (cameraDistance > u_cloudShadowSplits.x) {
        cascadeIndex = 1;
    }

    float cascadeCount = max(u_cloudShadowParams.y, 1.0);
    if (float(cascadeIndex) >= cascadeCount) {
        cascadeIndex = int(cascadeCount - 1.0);
    }

    vec4 shadowClip = u_cloudShadowMatrices[cascadeIndex] * vec4(position, 1.0);
    shadowClip.xyz /= max(abs(shadowClip.w), 0.000001);
    vec2 localUv = shadowClip.xy * 0.5 + 0.5;
    vec4 lightNearWorld = u_cloudShadowInverseMatrices[cascadeIndex] * vec4(shadowClip.xy, -1.0, 1.0);
    vec4 lightFarWorld = u_cloudShadowInverseMatrices[cascadeIndex] * vec4(shadowClip.xy, 1.0, 1.0);
    lightNearWorld.xyz /= max(abs(lightNearWorld.w), 0.000001);
    lightFarWorld.xyz /= max(abs(lightFarWorld.w), 0.000001);
    vec3 lightRayOrigin = lightNearWorld.xyz;
    vec3 lightRayDirection = normalize(lightFarWorld.xyz - lightNearWorld.xyz);
    if (dot(lightRayDirection, normalize(u_sunDirectionWC)) < 0.0) {
        lightRayDirection = -lightRayDirection;
    }
    vec2 lightOuterHit = raySphere(lightRayOrigin, lightRayDirection, u_cloudTopRadius);
    vec2 lightInnerHit = raySphere(lightRayOrigin, lightRayDirection, u_cloudBottomRadius);
    if (lightOuterHit.x > lightOuterHit.y || lightOuterHit.y <= 0.0) {
        return 1.0;
    }
    float lightNearT = max(lightOuterHit.x, 0.0);
    float lightFarT = lightOuterHit.y;
    if (lightInnerHit.x <= lightInnerHit.y && lightInnerHit.y > 0.0) {
        lightFarT = min(lightFarT, max(lightInnerHit.x, 0.0));
    }
    float currentLightT = dot(position - lightRayOrigin, lightRayDirection);
    float currentCloudDepth = saturate((currentLightT - lightNearT) / max(lightFarT - lightNearT, 1.0));

    if (localUv.x <= 0.001 || localUv.x >= 0.999 || localUv.y <= 0.001 || localUv.y >= 0.999) {
        return 1.0;
    }

    float atlasWidth = 1.0 / cascadeCount;
    vec2 atlasUv = vec2((float(cascadeIndex) + localUv.x) * atlasWidth, localUv.y);
    float atlasResolution = max(u_cloudShadowParams.z, 1.0);
    vec2 texel = vec2(atlasWidth / atlasResolution, 1.0 / atlasResolution);
    float accumulatedShadow = 0.0;
    float accumulatedWeight = 0.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 tapUv = atlasUv + vec2(float(x), float(y)) * texel;
            vec4 packed = SAMPLE_TEX(u_cloudShadowTexture, tapUv);
            float hasCloud = step(0.5, packed.a);
            float behindFront = step(packed.r + 0.006, currentCloudDepth);
            float densityWeight = smoothstep(0.015, 0.42, packed.b);
            float occlusion = saturate(packed.g) * hasCloud * behindFront * densityWeight;
            float weight = x == 0 && y == 0 ? 1.0 : 0.55;
            accumulatedShadow += (1.0 - occlusion) * weight;
            accumulatedWeight += weight;
        }
    }

    float atlasShadow = accumulatedShadow / max(accumulatedWeight, 0.001);
    return mix(1.0, min(localShadow, atlasShadow), u_cloudShadowParams.w);
}

float approximateMultipleScattering(float opticalDepth) {
    float attenuation = 1.0;
    float contribution = 0.0;
    float octaveWeight = 0.5;

    for (int i = 0; i < 3; i++) {
        attenuation *= exp(-opticalDepth * u_density * octaveWeight);
        contribution += (1.0 - attenuation) * octaveWeight;
        octaveWeight *= 0.5;
    }

    return saturate(contribution);
}

vec3 applyCloudHaze(vec3 color, vec3 rayDirection, vec3 sunDirection, float frontDistance, float alpha) {
    float distanceHaze = 1.0 - exp(-max(frontDistance, 0.0) * 0.0000028);
    float sunGlow = pow(saturate(dot(rayDirection, sunDirection) * 0.5 + 0.5), 5.0);
    float verticalFade = saturate(dot(rayDirection, normalize(u_cameraPositionWC)) * 1.8 + 0.9);
    vec3 skyHaze = mix(vec3(0.48, 0.62, 0.78), vec3(1.0, 0.82, 0.55), sunGlow);
    float hazeAmount = distanceHaze * u_hazeStrength * alpha * verticalFade;
    return mix(color, skyHaze, saturate(hazeAmount));
}

void main() {
    vec2 uv = v_textureCoordinates;
    vec4 sceneColor = SAMPLE_TEX(colorTexture, uv);
    vec3 rayDirection = getRayDirection(uv);

    vec2 outerHit = raySphere(u_cameraPositionWC, rayDirection, u_cloudTopRadius);
    if (outerHit.x > outerHit.y || outerHit.y <= 0.0) {
        FRAG_COLOR = sceneColor;
        return;
    }

    vec2 innerHit = raySphere(u_cameraPositionWC, rayDirection, u_cloudBottomRadius);
    float nearDistance = max(outerHit.x, 0.0);
    float farDistance = outerHit.y;
    if (innerHit.x <= innerHit.y && innerHit.y > 0.0) {
        if (length(u_cameraPositionWC) < u_cloudBottomRadius) {
            nearDistance = max(innerHit.y, nearDistance);
        } else {
            farDistance = min(farDistance, max(innerHit.x, 0.0));
        }
    }

    farDistance = min(farDistance, u_maxDistance);
    farDistance = min(farDistance, getSceneDistance(uv));
    if (farDistance <= nearDistance) {
        FRAG_COLOR = sceneColor;
        return;
    }

    float span = farDistance - nearDistance;

    // LOD 优化：根据距离和质量等级动态调整步数
    // 质量等级：0=low, 1=medium, 2=high, 3=ultra
    float distanceFactor = 1.0;
    float lodDistanceScale = 1.0 + (3.0 - u_qualityLevel) * 0.5; // 低质量时更早触发 LOD

    if (nearDistance > 150000.0 * lodDistanceScale) {
        distanceFactor = 0.4;
    } else if (nearDistance > 80000.0 * lodDistanceScale) {
        distanceFactor = 0.6;
    } else if (nearDistance > 40000.0 * lodDistanceScale) {
        distanceFactor = 0.8;
    }

    int stepCount = int(clamp(floor(u_stepCount * distanceFactor + 0.5), 16.0, 128.0));
    float baseStepSize = span / float(stepCount);
    // 自适应步长：最小 500m，最大 5000m，避免过密采样
    float stepSize = clamp(baseStepSize, 500.0, 5000.0);
    float jitter = hash31(vec3(gl_FragCoord.xy, fract(u_timeSeconds))) * stepSize;
    float distanceAlongRay = nearDistance + jitter;
    vec3 cloudLight = vec3(0.0);
    float transmittance = 1.0;
    float alpha = 0.0;
    float weightedDepth = 0.0;
    float depthWeight = 0.0;
    vec3 sunDirection = normalize(u_sunDirectionWC);
    // 性能优化：空白区域跳过计数器
    int emptySteps = 0;
    int maxEmptySteps = 8; // 连续空白 8 次后跳大步
    // LOD：远处云层禁用昂贵的阴影计算
    // 低质量模式下，更早禁用详细阴影
    float shadowDistanceThreshold = mix(100000.0, 50000.0, (3.0 - u_qualityLevel) / 3.0);
    bool enableDetailedShadows = nearDistance < shadowDistanceThreshold;

    for (int i = 0; i < 128; i++) {
        // 更激进的早期终止：
        // 1. 超过步数限制
        // 2. 超过最大距离
        // 3. 透射率过低（几乎不透明）
        // 4. 已经走了 80% 的步数且 alpha 很高（云已经很厚）
        if (i >= stepCount || distanceAlongRay > farDistance || transmittance < 0.03) {
            break;
        }
        if (i > 64 && alpha > 0.95) {
            break; // 已经足够厚，提前终止
        }

        vec3 position = u_cameraPositionWC + rayDirection * distanceAlongRay;
        float radius = length(position);
        float heightFraction = saturate((radius - u_cloudBottomRadius) / (u_cloudTopRadius - u_cloudBottomRadius));
        float density = sampleCloudDensity(position, heightFraction);

        if (density > 0.001) {
            // 有云：重置空白计数器，恢复正常步长
            emptySteps = 0;
            float extinction = density * u_density * stepSize;
            float opticalDepthToSun = marchSunOpticalDepth(position + sunDirection * stepSize * 0.35, sunDirection);
            float localShadow = exp(-opticalDepthToSun * u_density * 1.35);

            // LOD 优化：远处云层跳过昂贵的 Beer 阴影和 BSM 计算
            float beerShadow = 1.0;
            float bsmShadow = 1.0;
            float beerOpticalDepth = 0.0;
            if (enableDetailedShadows) {
                beerOpticalDepth = marchBeerShadowOpticalDepth(position + sunDirection * stepSize * 0.75, sunDirection);
                beerShadow = exp(-beerOpticalDepth * u_density * 0.72);
                bsmShadow = sampleBsmShadow(position, distanceAlongRay, localShadow);
            }

            float sunTransmittance = mix(1.0, localShadow * mix(1.0, beerShadow, u_beerShadowStrength) * bsmShadow, u_shadowStrength);
            float multipleScattering = approximateMultipleScattering(opticalDepthToSun + beerOpticalDepth * 0.45) * u_multiScattering;
            float lightFacing = saturate(dot(normalize(position), sunDirection) * 0.45 + 0.55);
            float cosTheta = dot(rayDirection, sunDirection);
            float phase = hgPhase(cosTheta, 0.68) * 4.6 + hgPhase(cosTheta, -0.22) * 1.25;
            float silverLining = pow(saturate(cosTheta * 0.5 + 0.5), 10.0);
            float powder = 1.0 - exp(-density * 3.8);
            vec3 atmosphereSun;
            vec3 atmosphereSky;
            GetSunAndSkyScalarIrradiance(position, sunDirection, atmosphereSun, atmosphereSky);
            vec3 sunColor = vec3(1.0, 0.88, 0.66) * atmosphereSun *
                (phase * (sunTransmittance + multipleScattering * 0.34) + silverLining * sunTransmittance * 0.42) *
                (0.62 + 0.68 * lightFacing) *
                (1.0 + powder * u_powderStrength * 0.42);
            vec3 skyColor = atmosphereSky * (0.24 + 0.30 * heightFraction) * (0.78 + 0.22 * multipleScattering);
            vec3 groundBounce = vec3(0.44, 0.38, 0.31) * (1.0 - heightFraction) * u_groundBounceStrength * 0.42 * (0.45 + 0.55 * lightFacing);
            vec3 sampleLight = sunColor + skyColor;
            float sampleAlpha = 1.0 - exp(-extinction);

            cloudLight += transmittance * (sampleLight + groundBounce) * sampleAlpha;
            weightedDepth += distanceAlongRay * transmittance * sampleAlpha;
            depthWeight += transmittance * sampleAlpha;
            transmittance *= exp(-extinction);
            alpha = 1.0 - transmittance;
        } else {
            // 空白区域：累加计数器
            emptySteps++;
        }

        // 自适应步长：空白区域跳大步，有云区域保持精细
        if (emptySteps >= maxEmptySteps) {
            // 连续空白，跳大步（3 倍步长）
            stepSize = clamp(stepSize * 3.0, 500.0, 8000.0);
            emptySteps = 0; // 重置避免无限放大
        } else {
            stepSize *= 1.018;
        }
        distanceAlongRay += stepSize;
    }

    if (alpha <= 0.001) {
        FRAG_COLOR = sceneColor;
        return;
    }

    float horizonFade = saturate(dot(rayDirection, normalize(u_cameraPositionWC)) * 2.5 + 0.8);
    alpha *= horizonFade;
    vec3 cloudColor = cloudLight / max(alpha, 0.001);
    vec3 finalColor = mix(sceneColor.rgb, cloudColor, saturate(alpha * 0.82));
    float frontDistance = weightedDepth / max(depthWeight, 0.001);
    finalColor = applyAerialPerspective(finalColor, rayDirection, sunDirection, frontDistance, alpha);
    finalColor = applyCloudHaze(finalColor, rayDirection, sunDirection, frontDistance, alpha * (1.0 - saturate(u_atmosphereParams.x) * 0.55));
    FRAG_COLOR = vec4(finalColor, sceneColor.a);
}
`;

onMounted(() => {
    bootstrapWhenReady();
});

onUnmounted(() => {
    cleanupEffects();
});

watch(
    () => props.controls,
    (controls) => {
        syncExternalControls(controls || {});
    },
    { deep: true, immediate: true },
);

function syncExternalControls(controls) {
    if (Object.prototype.hasOwnProperty.call(controls, 'fog')) {
        fogEnabled.value = !!controls.fog;
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'volumetricClouds')) {
        volumetricCloudsEnabled.value = !!controls.volumetricClouds;
    }
    if (controls.clouds && typeof controls.clouds === 'object') {
        cloudControls.value = normalizeCloudControls(controls.clouds);
        if (cloudControls.value.bsmShadow) {
            cloudShadowFailed = false;
        }
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'hbao')) {
        hbaoEnabled.value = !!controls.hbao;
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'tiltShift')) {
        tiltShiftEnabled.value = !!controls.tiltShift;
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'atmosphere')) {
        atmosphereEnabled.value = !!controls.atmosphere;
    }
}

function handleEffectGuiChange({ controlId, value }) {
    const enabled = !!value;
    const controlMap = {
        fog: fogEnabled,
        volumetricClouds: volumetricCloudsEnabled,
        hbao: hbaoEnabled,
        tiltShift: tiltShiftEnabled,
        atmosphere: atmosphereEnabled,
    };
    const target = controlMap[controlId];
    if (target) {
        target.value = enabled;
    }
}

function normalizeCloudControls(input = {}) {
    const validQualities = ['low', 'medium', 'high', 'ultra'];
    const quality = validQualities.includes(input.quality) ? input.quality : 'medium';

    return {
        quality,
        coverage: clampNumberValue(input.coverage, 0.52, 0.18, 0.82),
        density: clampNumberValue(input.density, 0.00009, 0.000025, 0.00018),
        shadowStrength: clampNumberValue(input.shadowStrength, 0.82, 0, 1),
        beerShadowStrength: clampNumberValue(input.beerShadowStrength, 0.64, 0, 1),
        multiScattering: clampNumberValue(input.multiScattering, 0.58, 0, 1),
        powderStrength: clampNumberValue(input.powderStrength, 0.72, 0, 1.4),
        hazeStrength: clampNumberValue(input.hazeStrength, 0.38, 0, 1),
        groundBounceStrength: clampNumberValue(input.groundBounceStrength, 0.26, 0, 1),
        bsmShadow: input.bsmShadow === true,
        shadowResolution: Math.round(clampNumberValue(input.shadowResolution, 256, 128, 512) / 128) * 128,
        maxDistance: clampNumberValue(input.maxDistance, 360000, 120000, 900000),
        stepCount: Math.round(clampNumberValue(input.stepCount, 48, 16, 128)),
    };
}

function bootstrapWhenReady() {
    let attempts = 0;
    bootstrapTimer = window.setInterval(async () => {
        attempts += 1;

        const viewer = props.getViewer?.();
        const Cesium = props.getCesium?.() || window.Cesium;

        if (viewer && Cesium) {
            clearInterval(bootstrapTimer);
            bootstrapTimer = null;

            try {
                captureSceneDefaults(viewer);
                initRenderErrorGuard(viewer);
                initCinematicEffects(viewer, Cesium);
                bindFrameUpdates(viewer, Cesium);
                message.success('高级视觉效果已启用。');
            } catch (error) {
                message.error('高级视觉效果初始化失败', error);
                message.warning('高级视觉效果部分初始化失败，已自动降级。', { closable: true });
            }
            return;
        }

        if (attempts >= 150) {
            clearInterval(bootstrapTimer);
            bootstrapTimer = null;
            message.warning('高级视觉效果等待超时，未获取到 3D Viewer。');
        }
    }, 80);
}

function captureSceneDefaults(viewer) {
    const scene = viewer?.scene;
    if (!scene) return;

    if (typeof scene.highDynamicRange === 'boolean') {
        originalSceneState.hdr = scene.highDynamicRange;
    }

    if (scene.postProcessStages?.bloom) {
        const bloom = scene.postProcessStages.bloom;
        originalSceneState.bloom = {
            enabled: !!bloom.enabled,
            contrast: bloom.uniforms?.contrast,
            brightness: bloom.uniforms?.brightness,
            delta: bloom.uniforms?.delta,
            sigma: bloom.uniforms?.sigma,
            stepSize: bloom.uniforms?.stepSize,
        };
    }

    if (scene.skyAtmosphere) {
        originalSceneState.sky = {
            hueShift: scene.skyAtmosphere.hueShift,
            saturationShift: scene.skyAtmosphere.saturationShift,
            brightnessShift: scene.skyAtmosphere.brightnessShift,
        };
    }
}

function initCinematicEffects(viewer, Cesium) {
    const stageCollection = viewer?.scene?.postProcessStages;
    if (!stageCollection || !Cesium?.PostProcessStage) return;

    initHeightFogStage(viewer, Cesium);
    initVolumetricCloudsStage(viewer, Cesium);
    initAmbientOcclusion(viewer, Cesium);
    initTiltShiftStage(viewer, Cesium);

    // 仅在用户已开启大气效果时应用，否则恢复原始状态
    if (atmosphereEnabled.value) {
        applyAtmosphereEnhancement(viewer, Cesium, 1200);
    } else {
        restoreAtmosphereState(viewer);
    }
}

function initRenderErrorGuard(viewer) {
    const scene = viewer?.scene;
    if (!scene?.renderError?.addEventListener) return;

    scene.rethrowRenderErrors = false;
    renderErrorListener = scene.renderError.addEventListener((_scene, error) => {
        message.error('Cesium 渲染异常，已触发降级保护', error);
        degradeEffectsAfterRenderError();

        if (!hasRenderErrorNotified) {
            hasRenderErrorNotified = true;
            message.warning('检测到当前设备图形兼容性问题，已自动降级高级特效以保证 3D 可用。', {
                closable: true,
                duration: 6000,
            });
        }
    });
}

function degradeEffectsAfterRenderError() {
    fogEnabled.value = false;
    volumetricCloudsEnabled.value = false;
    tiltShiftEnabled.value = false;
    hbaoEnabled.value = false;
    atmosphereEnabled.value = false;

    if (fogStage) {
        fogStage.enabled = false;
    }
    if (volumetricCloudsStage) {
        volumetricCloudsStage.enabled = false;
    }
    if (cloudShadowPrimitive) {
        cloudShadowPrimitive.show = false;
        cloudShadowPrimitive.setParams?.({ enabled: false });
    }
    if (cloudShadowUniformScratch.params) {
        cloudShadowUniformScratch.params.x = 0;
        cloudShadowUniformScratch.params.w = 0;
    }
    if (tiltShiftStage) {
        tiltShiftStage.enabled = false;
    }
    if (ambientOcclusionStage) {
        ambientOcclusionStage.enabled = false;
    }
}

function initHeightFogStage(viewer, Cesium) {
    if (fogStage) return;

    fogStage = new Cesium.PostProcessStage({
        name: 'cinematic_height_fog_stage',
        fragmentShader: `
      uniform sampler2D colorTexture;
      uniform sampler2D depthTexture;
      uniform vec3 fogColor;
      uniform float fogDensity;
      uniform float cameraHeightFactor;

      #if __VERSION__ == 300
      in vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture
      #define FRAG_COLOR out_FragColor
      #else
      varying vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture2D
      #define FRAG_COLOR gl_FragColor
      #endif

      float getLinearDepth(vec2 uv) {
        float depth = czm_readDepth(depthTexture, uv);
        if (depth == 0.0) {
          return 0.0;
        }
        vec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        return max(0.0, -eyeCoordinate.z);
      }

      void main() {
        vec4 color = SAMPLE_TEX(colorTexture, v_textureCoordinates);
        float linearDepth = getLinearDepth(v_textureCoordinates);

        float depthFog = 1.0 - exp(-linearDepth * fogDensity);
        float groundBoost = clamp(1.0 - cameraHeightFactor, 0.0, 1.0);
        float fogAmount = clamp(depthFog * (0.22 + 1.28 * groundBoost), 0.0, 0.9);

        vec3 finalColor = mix(color.rgb, fogColor, fogAmount);
        FRAG_COLOR = vec4(finalColor, color.a);
      }
    `,
        uniforms: {
            fogColor: new Cesium.Color(0.78, 0.85, 0.92, 1.0),
            fogDensity: 0.00065,
            cameraHeightFactor: 1.0,
        },
    });

    viewer.scene.postProcessStages.add(fogStage);
    fogStage.enabled = fogEnabled.value;
}

function initVolumetricCloudsStage(viewer, Cesium) {
    if (volumetricCloudsStage || !Cesium?.PostProcessStage) return;

    ensureAtmosphereLutResources(viewer, Cesium);

    // 初始化 TAAU 时序上采样模块
    if (!_temporalUpsampling) {
        _temporalUpsampling = useCesiumTemporalUpsampling({ Cesium, viewer });
        const canvas = viewer.scene.canvas;
        _temporalUpsampling.initialize(canvas.clientWidth, canvas.clientHeight);
    }

    const ellipsoidRadius = Number(Cesium?.Ellipsoid?.WGS84?.maximumRadius) || 6378137.0;
    const cameraPosition = new Cesium.Cartesian3();
    const cameraDirection = new Cesium.Cartesian3();
    const sunDirection = new Cesium.Cartesian3(0.35, -0.25, 0.9);
    const inverseViewProjection = new Cesium.Matrix4();
    const shadowMatrices = Array.from({ length: 4 }, () => new Cesium.Matrix4());
    const shadowInverseMatrices = Array.from({ length: 4 }, () => new Cesium.Matrix4());
    const shadowSplits = new Cesium.Cartesian4(0, 0, 0, 0);
    const shadowParams = new Cesium.Cartesian4(0, 1, 256, 0);
    const atmosphereParams = new Cesium.Cartesian4(1.0, 1.0, 1.0, 0.85);

    Cesium.Cartesian3.normalize(sunDirection, sunDirection);
    cloudShadowUniformScratch.texture = getCloudShadowFallbackTexture(viewer, Cesium);
    cloudShadowUniformScratch.matrices = shadowMatrices;
    cloudShadowUniformScratch.inverseMatrices = shadowInverseMatrices;
    cloudShadowUniformScratch.splits = shadowSplits;
    cloudShadowUniformScratch.params = shadowParams;

    volumetricCloudsStage = new Cesium.PostProcessStage({
        name: 'cesium_ecef_volumetric_clouds_stage',
        fragmentShader: VOLUMETRIC_CLOUDS_FRAGMENT_SHADER,
        uniforms: {
            u_cloudShadowTexture: () => cloudShadowUniformScratch.texture,
            u_atmosphereTransmittanceTexture: () => getAtmosphereTransmittanceTexture(viewer, Cesium),
            u_atmosphereIrradianceTexture: () => getAtmosphereIrradianceTexture(viewer, Cesium),
            u_atmosphereScatteringTexture: () => getAtmosphereScatteringTexture(viewer, Cesium),
            u_cameraPositionWC: cameraPosition,
            u_cameraDirectionWC: cameraDirection,
            u_inverseViewProjection: inverseViewProjection,
            u_sunDirectionWC: sunDirection,
            u_cloudShadowMatrices: () => cloudShadowUniformScratch.matrices,
            u_cloudShadowInverseMatrices: () => cloudShadowUniformScratch.inverseMatrices,
            u_cloudShadowSplits: () => cloudShadowUniformScratch.splits,
            u_cloudShadowParams: () => cloudShadowUniformScratch.params,
            u_cloudBottomRadius: ellipsoidRadius + 1500.0,
            u_cloudTopRadius: ellipsoidRadius + 8500.0,
            u_maxDistance: 420000.0,
            u_coverage: 0.52,
            u_density: 0.000085,
            u_shadowStrength: 0.82,
            u_beerShadowStrength: 0.64,
            u_multiScattering: 0.58,
            u_powderStrength: 0.72,
            u_hazeStrength: 0.38,
            u_groundBounceStrength: 0.26,
            u_stepCount: 48,
            u_timeSeconds: 0.0,
            u_atmosphereParams: atmosphereParams,
            u_qualityLevel: 1.0,  // 0=low, 1=medium, 2=high, 3=ultra
        },
    });

    viewer.scene.postProcessStages.add(volumetricCloudsStage);
    volumetricCloudsStage.enabled = volumetricCloudsEnabled.value;

    // 创建 TAAU Resolve Stage（时序上采样后处理）
    if (_temporalUpsampling) {
        const resolveShader = _temporalUpsampling.getResolveShader();
        const resolveUniforms = _temporalUpsampling.getJitterUniforms();

        _taaResolveStage = new Cesium.PostProcessStage({
            name: 'cesium_cloud_taa_resolve',
            fragmentShader: resolveShader,
            uniforms: {
                colorTexture: getStageOutputTexture(volumetricCloudsStage, viewer.scene.context),
                depthTexture: getSceneDepthTexture(viewer),
                historyTexture: () => getFramebufferColorTexture(_temporalUpsampling?.framebuffers?.value?.history),
                resolution: (() => {
                    const scratch = new Cesium.Cartesian2();
                    return () => {
                        scratch.x = viewer.scene.canvas.clientWidth;
                        scratch.y = viewer.scene.canvas.clientHeight;
                        return scratch;
                    };
                })(),
                jitterOffset: () => _temporalUpsampling?.getJitterUniforms()?.jitterOffset || new Cesium.Cartesian2(0, 0),
                historyBlendFactor: resolveUniforms.historyBlendFactor,
                frameIndex: () => _temporalUpsampling?.temporalState?.value?.frameIndex || 0,
            },
        });

        viewer.scene.postProcessStages.add(_taaResolveStage);
        _taaResolveStage.enabled = false; // 默认关闭，由质量预设控制
    }
}

/**
 * 安全获取 PostProcessStage 的输出纹理
 * 优先使用公共 API，回退到内部属性（Cesium 版本间可能变化）
 * @param {Object} stage - Cesium PostProcessStage
 * @param {Object} context - Cesium context
 * @returns {Object|null} 纹理对象
 */
function getStageOutputTexture(stage, context) {
    if (!stage) return null;
    // 公共 API：Cesium 1.104+ 的 outputTexture
    if (stage.outputTexture) return stage.outputTexture;
    // 回退内部属性
    return stage._colorTexture || stage._texture || context?.defaultTexture || null;
}

/**
 * 安全获取场景深度模板纹理
 * @param {Object} viewer - Cesium Viewer
 * @returns {Object|null} 深度纹理
 */
function getSceneDepthTexture(viewer) {
    const fb = viewer?.scene?._view?.sceneFramebuffer;
    if (fb?.depthStencilTexture) return fb.depthStencilTexture;
    // 回退：WebGL1 下可能使用 renderbuffer，此处返回 null 让 shader 跳过深度采样
    return null;
}

/**
 * 安全获取 Framebuffer 的首个颜色纹理
 * @param {Object} framebuffer - Cesium Framebuffer
 * @returns {Object|null} 颜色纹理
 */
function getFramebufferColorTexture(framebuffer) {
    if (!framebuffer) return null;
    // 公共 API
    if (framebuffer.colorTextures?.length) return framebuffer.colorTextures[0];
    // 回退内部属性
    return framebuffer._colorTextures?.[0] || null;
}

function getCloudShadowFallbackTexture(viewer, Cesium) {
    if (cloudShadowFallbackTexture) return cloudShadowFallbackTexture;
    const context = viewer?.scene?.context;
    if (!context || !Cesium?.Texture) return null;

    const defaultTexture = context.defaultTexture || context.defaultTexture2D;
    if (defaultTexture) {
        cloudShadowFallbackTexture = defaultTexture;
        ownsCloudShadowFallbackTexture = false;
        return cloudShadowFallbackTexture;
    }

    cloudShadowFallbackTexture = new Cesium.Texture({
        context,
        width: 1,
        height: 1,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
        source: {
            width: 1,
            height: 1,
            arrayBufferView: new Uint8Array([0, 0, 0, 0]),
        },
    });
    ownsCloudShadowFallbackTexture = true;
    return cloudShadowFallbackTexture;
}

function ensureAtmosphereLutResources(viewer, Cesium) {
    if (atmosphereLutResources || !viewer?.scene?.context || !Cesium?.Texture) return;

    try {
        atmosphereLutResources = new AtmosphereLutResources(viewer, { cesium: Cesium });
    } catch (error) {
        atmosphereLutResources = null;
        console.warn('Cesium cloud atmosphere LUT resources disabled:', error);
    }
}

function getAtmosphereTransmittanceTexture(viewer, Cesium) {
    ensureAtmosphereLutResources(viewer, Cesium);
    return atmosphereLutResources?.transmittanceTexture || getCloudShadowFallbackTexture(viewer, Cesium);
}

function getAtmosphereIrradianceTexture(viewer, Cesium) {
    ensureAtmosphereLutResources(viewer, Cesium);
    return atmosphereLutResources?.irradianceTexture || getCloudShadowFallbackTexture(viewer, Cesium);
}

function getAtmosphereScatteringTexture(viewer, Cesium) {
    ensureAtmosphereLutResources(viewer, Cesium);
    return atmosphereLutResources?.scatteringTexture || getCloudShadowFallbackTexture(viewer, Cesium);
}

function ensureCloudShadowPrimitive(viewer, Cesium) {
    const controls = cloudControls.value;
    const shouldEnable = volumetricCloudsEnabled.value && controls.bsmShadow && !cloudShadowFailed;
    if (!shouldEnable) {
        destroyCloudShadowPrimitive(viewer);
        return;
    }
    if (cloudShadowPrimitive || !viewer?.scene?.primitives || !Cesium) return;

    try {
        cloudShadowPrimitive = new CloudShadowPrimitive(viewer, {
            cesium: Cesium,
            enabled: true,
            shadowResolution: controls.shadowResolution,
            maxDistance: controls.maxDistance,
        });
        viewer.scene.primitives.add(cloudShadowPrimitive);

        // 初始化 BSM Shadow TAA
        ensureShadowResolveStage(viewer, Cesium);
    } catch (error) {
        cloudShadowFailed = true;
        cloudShadowPrimitive = null;
        console.warn('Cesium cloud BSM resources disabled:', error);
    }
}

/**
 * 初始化 BSM Shadow TAA Resolve 阶段
 * 对 Beer Shadow Map 进行时序抗锯齿，减少低分辨率阴影图下的单像素闪烁
 */
function ensureShadowResolveStage(viewer, Cesium) {
    if (_shadowResolveStage || !viewer?.scene?.context || !Cesium?.PostProcessStage) return;

    const context = viewer.scene.context;
    const resolution = cloudControls.value.shadowResolution || 256;

    // 创建历史纹理（与 BSM 相同尺寸）
    _shadowHistoryTexture = new Cesium.Texture({
        context,
        width: resolution,
        height: resolution,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
        sampler: new Cesium.Sampler({
            minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
            magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
        }),
    });

    // 创建 Shadow Resolve PostProcessStage
    _shadowResolveStage = new Cesium.PostProcessStage({
        name: 'cesium_bsm_shadow_resolve',
        fragmentShader: SHADOW_RESOLVE_FRAGMENT_SHADER,
        uniforms: {
            shadowTexture: () => cloudShadowPrimitive?.resources?.texture || getCloudShadowFallbackTexture(viewer, Cesium),
            historyTexture: () => _shadowHistoryTexture,
            resolution: new Cesium.Cartesian2(resolution, resolution),
            historyBlendFactor: SHADOW_TAA_CONFIG.HISTORY_BLEND_FACTOR,
            frameIndex: 0,
        },
    });

    viewer.scene.postProcessStages.add(_shadowResolveStage);
    _shadowResolveStage.enabled = false; // 默认关闭，由 BSM 开关控制
}

function destroyCloudShadowPrimitive(viewer) {
    if (!cloudShadowPrimitive) return;
    const Cesium = props.getCesium?.() || window.Cesium;
    if (cloudShadowUniformScratch.params) {
        cloudShadowUniformScratch.params.x = 0;
        cloudShadowUniformScratch.params.w = 0;
    }
    cloudShadowUniformScratch.texture = getCloudShadowFallbackTexture(viewer, Cesium);
    if (viewer?.scene?.primitives) {
        try {
            viewer.scene.primitives.remove(cloudShadowPrimitive);
        } catch (error) {
            console.warn('Cesium cloud BSM primitive remove failed:', error);
            cloudShadowPrimitive.destroy?.();
        }
    } else {
        cloudShadowPrimitive.destroy?.();
    }
    cloudShadowPrimitive = null;
}

function initAmbientOcclusion(viewer, Cesium) {
    const sceneStages = viewer?.scene?.postProcessStages;
    if (!sceneStages) return;

    if (sceneStages.ambientOcclusion) {
        ambientOcclusionStage = sceneStages.ambientOcclusion;
        createdAmbientOcclusionStage = false;
    } else if (Cesium?.PostProcessStageLibrary?.createAmbientOcclusionStage) {
        ambientOcclusionStage = Cesium.PostProcessStageLibrary.createAmbientOcclusionStage();
        sceneStages.add(ambientOcclusionStage);
        createdAmbientOcclusionStage = true;
    }

    if (!ambientOcclusionStage) return;

    ambientOcclusionStage.enabled = hbaoEnabled.value;
    if (ambientOcclusionStage.uniforms) {
        if ('intensity' in ambientOcclusionStage.uniforms)
            ambientOcclusionStage.uniforms.intensity = 4.2;
        if ('bias' in ambientOcclusionStage.uniforms) ambientOcclusionStage.uniforms.bias = 0.08;
        if ('lengthCap' in ambientOcclusionStage.uniforms)
            ambientOcclusionStage.uniforms.lengthCap = 0.35;
        if ('stepSize' in ambientOcclusionStage.uniforms)
            ambientOcclusionStage.uniforms.stepSize = 1.8;
        if ('frustumLength' in ambientOcclusionStage.uniforms)
            ambientOcclusionStage.uniforms.frustumLength = 1200.0;
    }
}

function initTiltShiftStage(viewer, Cesium) {
    if (tiltShiftStage) return;

    tiltShiftStage = new Cesium.PostProcessStage({
        name: 'cinematic_tilt_shift_stage',
        fragmentShader: `
      uniform sampler2D colorTexture;
      uniform float focusCenter;
      uniform float focusSpread;
      uniform float blurStrength;

      #if __VERSION__ == 300
      in vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture
      #define FRAG_COLOR out_FragColor
      #else
      varying vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture2D
      #define FRAG_COLOR gl_FragColor
      #endif

      void main() {
        vec2 uv = v_textureCoordinates;
        vec4 centerColor = SAMPLE_TEX(colorTexture, uv);

        float dist = abs(uv.y - focusCenter);
        float blurMix = smoothstep(focusSpread * 0.7, focusSpread * 2.1, dist) * blurStrength;

        vec2 o = vec2(0.0035 * blurMix, 0.0);
        vec4 blurColor = vec4(0.0);
        blurColor += SAMPLE_TEX(colorTexture, uv - 3.0 * o) * 0.12;
        blurColor += SAMPLE_TEX(colorTexture, uv - 2.0 * o) * 0.16;
        blurColor += SAMPLE_TEX(colorTexture, uv - 1.0 * o) * 0.18;
        blurColor += SAMPLE_TEX(colorTexture, uv) * 0.20;
        blurColor += SAMPLE_TEX(colorTexture, uv + 1.0 * o) * 0.18;
        blurColor += SAMPLE_TEX(colorTexture, uv + 2.0 * o) * 0.16;
        blurColor += SAMPLE_TEX(colorTexture, uv + 3.0 * o) * 0.12;

        FRAG_COLOR = mix(centerColor, blurColor, clamp(blurMix * 1.05, 0.0, 1.0));
      }
    `,
        uniforms: {
            focusCenter: 0.56,
            focusSpread: 0.11,
            blurStrength: 0.0,
        },
    });

    viewer.scene.postProcessStages.add(tiltShiftStage);
    tiltShiftStage.enabled = false;
}

function bindFrameUpdates(viewer, Cesium) {
    const scene = viewer?.scene;
    if (!scene) return;

    preRenderListener = scene.preRender.addEventListener(() => {
        const height = getCameraHeight(viewer);
        const pitch = Number(viewer?.camera?.pitch ?? -1.2);

        frameCounter += 1;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - fpsStamp >= 1000) {
            fpsValue = Math.round((frameCounter * 1000) / (now - fpsStamp));
            frameCounter = 0;
            fpsStamp = now;
        }

        if (fogStage) {
            fogStage.enabled = fogEnabled.value;
            fogStage.uniforms.cameraHeightFactor = normalizeHeight(height, 150.0, 12000.0);
            fogStage.uniforms.fogDensity =
                0.00055 + (1.0 - fogStage.uniforms.cameraHeightFactor) * 0.00125;
        }

        if (volumetricCloudsStage) {
            volumetricCloudsStage.enabled = volumetricCloudsEnabled.value;
            ensureCloudShadowPrimitive(viewer, Cesium);
            if (cloudShadowPrimitive) {
                cloudShadowPrimitive.show = volumetricCloudsEnabled.value && cloudControls.value.bsmShadow;
            }
            if (volumetricCloudsStage.enabled) {
                updateVolumetricCloudUniforms(viewer, Cesium, height);
            }
        }

        // 更新 TAAU 时序状态（帧索引、Bayer 抖动偏移）
        if (_temporalUpsampling && volumetricCloudsEnabled.value) {
            const uniformState = viewer.scene.context?.uniformState;
            const viewProjection = uniformState?.viewProjection
                || Cesium.Matrix4.multiply(
                    viewer.scene.camera.viewMatrix,
                    viewer.scene.camera.frustum.projectionMatrix,
                    new Cesium.Matrix4(),
                );
            _temporalUpsampling.update(frameCounter, viewProjection);
        }

        // TAAU resolve stage 启用/禁用（由质量预设控制）
        if (_taaResolveStage) {
            const presetKey = cloudControls.value.quality || 'medium';
            const preset = QUALITY_PRESETS[presetKey];
            const taauEnabled = volumetricCloudsEnabled.value && !!preset?.temporalUpsampling;
            _taaResolveStage.enabled = taauEnabled;
            // 帧结束后交换 ping-pong framebuffer，使下一帧读取当前帧输出作为历史
            if (taauEnabled) {
                _temporalUpsampling?.swapBuffers();
                // TODO: TAAU 反馈循环未完整 — resolve 输出到屏幕管线，history 纹理从未被写入。
                // 需要在 resolve stage 执行后用 gl.copyTexImage2D 或 Framebuffer.afterExecute
                // 将屏幕内容捕获到 history framebuffer 的颜色纹理。
                // 当前 history 混合实质上读取的是未初始化数据，TAA 效果降级为单帧方差裁剪。
            }
        }

        if (ambientOcclusionStage) {
            ambientOcclusionStage.enabled = hbaoEnabled.value;
        }

        if (tiltShiftStage) {
            const lowAngleTrigger = pitch > -0.62;
            const blurStrength = lowAngleTrigger ? clamp01((pitch + 0.62) / 0.5) : 0;
            tiltShiftStage.enabled = tiltShiftEnabled.value && lowAngleTrigger;
            tiltShiftStage.uniforms.blurStrength = blurStrength;
        }

        if (atmosphereEnabled.value) {
            applyAtmosphereEnhancement(viewer, Cesium, height);
        } else {
            restoreAtmosphereState(viewer);
        }
    });
}

function updateVolumetricCloudUniforms(viewer, Cesium, cameraHeight) {
    const stage = volumetricCloudsStage;
    const scene = viewer?.scene;
    const camera = viewer?.camera;
    if (!stage || !scene || !camera || !Cesium) return;

    const uniforms = stage.uniforms;
    Cesium.Cartesian3.clone(camera.positionWC, uniforms.u_cameraPositionWC);
    Cesium.Cartesian3.clone(camera.directionWC, uniforms.u_cameraDirectionWC);

    const uniformState = scene.context?.uniformState;
    if (uniformState?.inverseViewProjection) {
        Cesium.Matrix4.clone(uniformState.inverseViewProjection, uniforms.u_inverseViewProjection);
    } else if (camera.inverseViewProjectionMatrix) {
        Cesium.Matrix4.clone(camera.inverseViewProjectionMatrix, uniforms.u_inverseViewProjection);
    }

    const sunDirection = getSunDirectionWC(viewer, Cesium);
    Cesium.Cartesian3.clone(sunDirection, uniforms.u_sunDirectionWC);

    const highAltitudeFade = normalizeHeight(cameraHeight, 10000.0, 180000.0);
    const cameraUp = Cesium.Cartesian3.normalize(camera.positionWC, atmosphereScratchUp);
    const sunElevation = Cesium.Cartesian3.dot(cameraUp, sunDirection);
    const duskBoost = 1.0 - clamp01((sunElevation + 0.08) / 0.55);
    const atmosphereMix = atmosphereEnabled.value ? 1.0 : 0.62;
    const controls = cloudControls.value;
    const ellipsoidRadius = Number(Cesium?.Ellipsoid?.WGS84?.maximumRadius) || 6378137.0;
    uniforms.u_coverage = controls.coverage;
    uniforms.u_density = controls.density * (1.0 - highAltitudeFade * 0.22);
    uniforms.u_maxDistance = controls.maxDistance;
    uniforms.u_shadowStrength = controls.shadowStrength * (1.0 - highAltitudeFade * 0.12);
    uniforms.u_beerShadowStrength = controls.beerShadowStrength * (1.0 - highAltitudeFade * 0.18);
    uniforms.u_multiScattering = controls.multiScattering;
    uniforms.u_powderStrength = controls.powderStrength;
    uniforms.u_hazeStrength = controls.hazeStrength * (1.0 - highAltitudeFade * 0.35);
    uniforms.u_groundBounceStrength = controls.groundBounceStrength;
    uniforms.u_stepCount = controls.stepCount;
    uniforms.u_timeSeconds = getClockSeconds(viewer, Cesium);
    if (uniforms.u_atmosphereParams) {
        uniforms.u_atmosphereParams.x = atmosphereMix;
        uniforms.u_atmosphereParams.y = 0.92 + duskBoost * 0.28;
        uniforms.u_atmosphereParams.z = 0.82 + duskBoost * 0.42;
        uniforms.u_atmosphereParams.w = (0.58 + atmosphereMix * 0.42) * (1.0 - highAltitudeFade * 0.28);
    }

    // 更新质量等级 uniform（用于 LOD 优化）
    const qualityLevel = controls.quality === 'ultra' ? 3.0 :
        controls.quality === 'high' ? 2.0 :
        controls.quality === 'medium' ? 1.0 : 0.0;
    uniforms.u_qualityLevel = qualityLevel;

    cloudShadowPrimitive?.setParams({
        enabled: volumetricCloudsEnabled.value && controls.bsmShadow && !cloudShadowFailed,
        coverage: uniforms.u_coverage,
        density: uniforms.u_density,
        bottomRadius: ellipsoidRadius + 1500.0,
        topRadius: ellipsoidRadius + 8500.0,
        maxDistance: uniforms.u_maxDistance,
        shadowResolution: controls.shadowResolution,
        timeSeconds: uniforms.u_timeSeconds,
    });
    syncCloudShadowUniforms(viewer, Cesium, controls);
}

function syncCloudShadowUniforms(viewer, Cesium, controls) {
    const shadowParams = cloudShadowUniformScratch.params;
    const shadowSplits = cloudShadowUniformScratch.splits;
    const shadowMatrices = cloudShadowUniformScratch.matrices;
    const shadowInverseMatrices = cloudShadowUniformScratch.inverseMatrices;
    if (!shadowParams || !shadowSplits || !shadowMatrices || !shadowInverseMatrices) return;

    const fallbackTexture = getCloudShadowFallbackTexture(viewer, Cesium);
    const resources = cloudShadowPrimitive?.resources;
    const shadowTexture = resources?.texture || null;
    const enabled = !!(
        volumetricCloudsEnabled.value &&
        controls.bsmShadow &&
        !cloudShadowFailed &&
        shadowTexture &&
        resources?.status?.ready
    );

    cloudShadowUniformScratch.texture = enabled ? shadowTexture : fallbackTexture;
    shadowParams.x = enabled ? 1 : 0;
    shadowParams.y = enabled ? Math.max(resources.options?.cascadeCount || 1, 1) : 1;
    shadowParams.z = enabled ? Math.max(resources.options?.resolution || 1, 1) : 1;
    shadowParams.w = enabled ? controls.beerShadowStrength : 0;

    for (let i = 0; i < 4; i += 1) {
        Cesium.Matrix4.clone(resources?.cascadeMatrices?.[i] || Cesium.Matrix4.IDENTITY, shadowMatrices[i]);
        Cesium.Matrix4.clone(resources?.inverseCascadeMatrices?.[i] || Cesium.Matrix4.IDENTITY, shadowInverseMatrices[i]);
    }

    const splits = resources?.cascadeSplits;
    shadowSplits.x = Number(splits?.[0] || 0);
    shadowSplits.y = Number(splits?.[1] || shadowSplits.x);
    shadowSplits.z = Number(splits?.[2] || shadowSplits.y);
    shadowSplits.w = Number(splits?.[3] || shadowSplits.z);

    // 同步 BSM Shadow TAA 状态
    if (_shadowResolveStage) {
        _shadowResolveStage.enabled = enabled;
    }
}

function getSunDirectionWC(viewer, Cesium) {
    const uniformStateSun = viewer?.scene?.context?.uniformState?.sunDirectionWC;
    if (uniformStateSun) return uniformStateSun;

    const fallback = new Cesium.Cartesian3(0.35, -0.25, 0.9);
    Cesium.Cartesian3.normalize(fallback, fallback);
    return fallback;
}

function getClockSeconds(viewer, Cesium) {
    try {
        const currentTime = viewer?.clock?.currentTime;
        if (currentTime && Cesium?.JulianDate?.secondsDifference && Cesium?.JulianDate?.fromIso8601) {
            if (!cloudClockEpoch) {
                cloudClockEpoch = Cesium.JulianDate.fromIso8601('2026-01-01T00:00:00Z');
            }
            return Cesium.JulianDate.secondsDifference(currentTime, cloudClockEpoch);
        }
    } catch {
        // Wall-clock time is good enough for cloud drift if Cesium clock helpers are unavailable.
    }
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
}

function applyAtmosphereEnhancement(viewer, Cesium, cameraHeight) {
    const scene = viewer?.scene;
    if (!scene) return;

    if (!realisticAtmosphereSnapshot) {
        realisticAtmosphereSnapshot = captureRealisticAtmosphereState(viewer);
    }
    configureRealisticAtmosphere(viewer, Cesium);

    if (typeof scene.highDynamicRange === 'boolean') {
        scene.highDynamicRange = true;
    }

    const bloom = scene.postProcessStages?.bloom;
    if (bloom) {
        bloom.enabled = true;
        if (bloom.uniforms) {
            if ('contrast' in bloom.uniforms) bloom.uniforms.contrast = 149.0;
            if ('brightness' in bloom.uniforms) bloom.uniforms.brightness = -0.12;
            if ('delta' in bloom.uniforms) bloom.uniforms.delta = 1.0;
            if ('sigma' in bloom.uniforms) bloom.uniforms.sigma = 3.25;
            if ('stepSize' in bloom.uniforms) bloom.uniforms.stepSize = 5.0;
        }
    }

    const sky = scene.skyAtmosphere;
    if (!sky) return;

    const h = normalizeHeight(cameraHeight, 500.0, 120000.0);
    sky.hueShift = -0.035 + h * 0.035;
    sky.saturationShift = -0.14 + h * 0.09;
    sky.brightnessShift = 0.03 + (1.0 - h) * 0.08;
}

function restoreAtmosphereState(viewer) {
    const scene = viewer?.scene;
    if (!scene) return;

    const Cesium = props.getCesium?.() || window.Cesium;
    if (realisticAtmosphereSnapshot) {
        restoreRealisticAtmosphere(viewer, Cesium, realisticAtmosphereSnapshot);
        realisticAtmosphereSnapshot = null;
        return;
    }

    if (typeof scene.highDynamicRange === 'boolean' && originalSceneState.hdr !== null) {
        scene.highDynamicRange = originalSceneState.hdr;
    }

    const bloom = scene.postProcessStages?.bloom;
    if (bloom && originalSceneState.bloom) {
        bloom.enabled = originalSceneState.bloom.enabled;
        if (bloom.uniforms) {
            if ('contrast' in bloom.uniforms && originalSceneState.bloom.contrast !== undefined)
                bloom.uniforms.contrast = originalSceneState.bloom.contrast;
            if ('brightness' in bloom.uniforms && originalSceneState.bloom.brightness !== undefined)
                bloom.uniforms.brightness = originalSceneState.bloom.brightness;
            if ('delta' in bloom.uniforms && originalSceneState.bloom.delta !== undefined)
                bloom.uniforms.delta = originalSceneState.bloom.delta;
            if ('sigma' in bloom.uniforms && originalSceneState.bloom.sigma !== undefined)
                bloom.uniforms.sigma = originalSceneState.bloom.sigma;
            if ('stepSize' in bloom.uniforms && originalSceneState.bloom.stepSize !== undefined)
                bloom.uniforms.stepSize = originalSceneState.bloom.stepSize;
        }
    }

    if (scene.skyAtmosphere && originalSceneState.sky) {
        scene.skyAtmosphere.hueShift = originalSceneState.sky.hueShift;
        scene.skyAtmosphere.saturationShift = originalSceneState.sky.saturationShift;
        scene.skyAtmosphere.brightnessShift = originalSceneState.sky.brightnessShift;
    }
}

function stopRealtimeSampling() {
    if (samplingTimer) {
        clearInterval(samplingTimer);
        samplingTimer = null;
    }
}

async function toggleChartVisibility() {
    const nextVisible = !chartVisible.value;
    chartVisible.value = nextVisible;

    if (!nextVisible) {
        stopRealtimeSampling();
        return;
    }

    const viewer = props.getViewer?.();
    const Cesium = props.getCesium?.() || window.Cesium;
    if (!viewer || !Cesium) {
        chartVisible.value = false;
        message.warning('图表暂不可用：3D Viewer 尚未就绪。');
        return;
    }

    try {
        await initEchartsRuntime(viewer, Cesium);
        startRealtimeSampling(viewer, Cesium);
        collectAndRenderPoint(viewer, Cesium);
    } catch (error) {
        chartVisible.value = false;
        message.error('图表模块加载失败', error);
    }
}

async function initEchartsRuntime(viewer, Cesium) {
    await ensureEchartsReady();
    await nextTick();

    if (!chartRef.value) return;

    if (!chartInstance) {
        chartInstance = echartsModule.init(chartRef.value);
        renderChartOption();
    }

    if (!resizeHandler) {
        resizeHandler = () => {
            chartInstance?.resize();
        };
        window.addEventListener('resize', resizeHandler);
    }

    chartInstance.resize();
    collectAndRenderPoint(viewer, Cesium);
}

function startRealtimeSampling(viewer, Cesium) {
    if (samplingTimer) return;
    samplingTimer = window.setInterval(() => {
        if (!chartInstance || !chartVisible.value) return;
        collectAndRenderPoint(viewer, Cesium);
    }, 1200);
}

function collectAndRenderPoint(viewer, Cesium) {
    const now = new Date();
    const label = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const cameraHeightKm = Number((getCameraHeight(viewer) / 1000).toFixed(2));
    const pitchDeg = Number(Cesium.Math.toDegrees(viewer?.camera?.pitch ?? 0).toFixed(1));

    pushFixedLength(chartData.labels, label, 20);
    pushFixedLength(chartData.cameraHeightKm, cameraHeightKm, 20);
    pushFixedLength(chartData.pitchDeg, pitchDeg, 20);
    pushFixedLength(chartData.fps, fpsValue, 20);

    chartInstance.setOption({
        xAxis: {
            data: chartData.labels,
        },
        series: [
            { data: chartData.cameraHeightKm },
            { data: chartData.pitchDeg },
            { data: chartData.fps },
        ],
    });
}

function renderChartOption() {
    if (!chartInstance) return;

    chartInstance.setOption({
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
        },
        legend: {
            top: 10,
            left: 'center',
            textStyle: {
                color: '#ddf7e8',
                fontSize: 11,
            },
            itemGap: 22,
        },
        grid: {
            left: 38,
            right: 20,
            top: 85,
            bottom: 24,
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: [],
            axisLine: { lineStyle: { color: 'rgba(190, 240, 210, 0.35)' } },
            axisLabel: { color: 'rgba(223, 248, 232, 0.85)', fontSize: 10 },
        },
        yAxis: [
            {
                type: 'value',
                name: '高度(km)/FPS',
                nameTextStyle: { color: 'rgba(223, 248, 232, 0.85)' },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: 'rgba(190, 240, 210, 0.12)' } },
                axisLabel: { color: 'rgba(223, 248, 232, 0.85)', fontSize: 10 },
            },
            {
                type: 'value',
                name: '俯仰角(°)',
                position: 'right',
                min: -90,
                max: 0,
                nameTextStyle: { color: 'rgba(223, 248, 232, 0.85)' },
                splitLine: { show: false },
                axisLabel: { color: 'rgba(223, 248, 232, 0.85)', fontSize: 10 },
            },
        ],
        series: [
            {
                name: '相机高度(km)',
                type: 'line',
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#67e8f9' },
                areaStyle: { color: 'rgba(103, 232, 249, 0.14)' },
                data: [],
            },
            {
                name: '俯仰角(°)',
                type: 'line',
                yAxisIndex: 1,
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#facc15' },
                areaStyle: { color: 'rgba(250, 204, 21, 0.12)' },
                data: [],
            },
            {
                name: '帧率(FPS)',
                type: 'line',
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#86efac' },
                areaStyle: { color: 'rgba(134, 239, 172, 0.1)' },
                data: [],
            },
        ],
    });
}

function cleanupEffects() {
    if (bootstrapTimer) {
        clearInterval(bootstrapTimer);
        bootstrapTimer = null;
    }

    stopRealtimeSampling();

    const viewer = props.getViewer?.();
    const sceneStages = viewer?.scene?.postProcessStages;

    if (preRenderListener) {
        preRenderListener();
        preRenderListener = null;
    }

    if (renderErrorListener) {
        renderErrorListener();
        renderErrorListener = null;
    }

    if (fogStage && sceneStages) {
        sceneStages.remove(fogStage);
    }
    fogStage = null;

    if (volumetricCloudsStage && sceneStages) {
        sceneStages.remove(volumetricCloudsStage);
    }
    volumetricCloudsStage = null;

    if (cloudShadowPrimitive && viewer?.scene?.primitives) {
        viewer.scene.primitives.remove(cloudShadowPrimitive);
    } else if (cloudShadowPrimitive) {
        cloudShadowPrimitive.destroy?.();
    }
    cloudShadowPrimitive = null;
    if (ownsCloudShadowFallbackTexture && cloudShadowFallbackTexture) {
        cloudShadowFallbackTexture.destroy?.();
    }
    cloudShadowFallbackTexture = null;
    ownsCloudShadowFallbackTexture = false;
    cloudShadowUniformScratch.texture = null;
    cloudShadowUniformScratch.matrices = null;
    cloudShadowUniformScratch.inverseMatrices = null;
    atmosphereLutResources?.destroy?.();
    atmosphereLutResources = null;

    // 清理 BSM Shadow TAA 资源
    if (_shadowResolveStage && sceneStages) {
        sceneStages.remove(_shadowResolveStage);
    }
    _shadowResolveStage = null;
    _shadowHistoryTexture?.destroy?.();
    _shadowHistoryTexture = null;

    // 清理 TAAU 时序上采样模块
    if (_taaResolveStage && sceneStages) {
        sceneStages.remove(_taaResolveStage);
    }
    _taaResolveStage = null;
    _temporalUpsampling?.destroy?.();
    _temporalUpsampling = null;

    if (tiltShiftStage && sceneStages) {
        sceneStages.remove(tiltShiftStage);
    }
    tiltShiftStage = null;

    if (ambientOcclusionStage) {
        if (createdAmbientOcclusionStage && sceneStages) {
            sceneStages.remove(ambientOcclusionStage);
        }
        ambientOcclusionStage = null;
    }
    createdAmbientOcclusionStage = false;

    if (viewer) {
        restoreAtmosphereState(viewer);
    }

    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }

    if (chartInstance) {
        chartInstance.dispose();
        chartInstance = null;
    }
    echartsModule = null;
    hasRenderErrorNotified = false;
}

function getCameraHeight(viewer) {
    const ellipsoid = viewer?.scene?.globe?.ellipsoid;
    const position = viewer?.camera?.positionWC;
    if (!ellipsoid || !position) return 0;

    const cartographic = ellipsoid.cartesianToCartographic(position);
    return Math.max(0, Number(cartographic?.height ?? 0));
}

function normalizeHeight(value, min, max) {
    if (!Number.isFinite(value) || max <= min) return 0;
    return clamp01((value - min) / (max - min));
}

function clamp01(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
}

function clampNumberValue(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function pushFixedLength(arr, value, maxLen) {
    arr.push(value);
    if (arr.length > maxLen) arr.shift();
}

function pad2(value) {
    return String(value).padStart(2, '0');
}
</script>

<style scoped>
.advanced-effects-root {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1300;
    pointer-events: none;
}

.effects-panel {
    width: 360px;
    border-radius: 12px;
    border: 1px solid rgba(162, 245, 190, 0.22);
    background: linear-gradient(155deg, rgba(9, 38, 23, 0.82), rgba(20, 71, 44, 0.78));
    box-shadow: 0 14px 28px rgba(3, 17, 10, 0.35);
    color: #ddf8e8;
    backdrop-filter: blur(10px);
    pointer-events: auto;
}

.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(162, 245, 190, 0.15);
}

.panel-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.3px;
}

.panel-btn {
    border: 1px solid rgba(162, 245, 190, 0.35);
    background: rgba(13, 55, 33, 0.6);
    color: #def8e8;
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
}

.panel-btn:hover {
    background: rgba(25, 90, 52, 0.78);
}

.effect-switches {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 14px 16px 12px;
}

.switch-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(223, 248, 232, 0.95);
}

.switch-item input[type='checkbox'] {
    accent-color: #4ade80;
}

.fx-chart {
    width: calc(100% - 16px);
    height: 200px;
    margin: 0 8px 10px;
}

@media (max-width: 768px) {
    .advanced-effects-root {
        top: 10px;
        right: 10px;
    }

    .effects-panel {
        width: 320px;
    }

    .fx-chart {
        height: 160px;
    }
}
</style>
