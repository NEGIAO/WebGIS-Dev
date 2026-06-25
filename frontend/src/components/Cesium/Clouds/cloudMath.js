import { CLOUD_PARAM_LIMITS, DEFAULT_CLOUD_PARAMS, QUALITY_PRESETS } from './cloudDefaults';

export function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function normalizeCloudParams(input = {}) {
    const quality = Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, input.quality)
        ? input.quality
        : DEFAULT_CLOUD_PARAMS.quality;
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;
    const merged = {
        ...DEFAULT_CLOUD_PARAMS,
        ...preset,
        ...input,
        quality,
    };

    const normalized = { ...merged };
    Object.entries(CLOUD_PARAM_LIMITS).forEach(([key, [min, max]]) => {
        normalized[key] = clampNumber(toFiniteNumber(merged[key], DEFAULT_CLOUD_PARAMS[key]), min, max);
    });
    normalized.stepCount = Math.round(normalized.stepCount);
    normalized.windDirectionDegrees %= 360;
    if (normalized.windDirectionDegrees < 0) normalized.windDirectionDegrees += 360;
    normalized.enabled = !!merged.enabled;
    return normalized;
}

export function applyQualityPreset(params, quality) {
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;
    return normalizeCloudParams({
        ...params,
        ...preset,
        quality: QUALITY_PRESETS[quality] ? quality : 'medium',
    });
}

export function createCloudUniformScratch(Cesium) {
    return {
        radii: new Cesium.Cartesian4(),
        params: new Cesium.Cartesian4(),
        lighting: new Cesium.Cartesian4(),
        noise: new Cesium.Cartesian4(),
        wind: new Cesium.Cartesian2(),
        camera: new Cesium.Cartesian3(),
    };
}

/**
 * Updates Cesium uniform scratch values from the current cloud params.
 * The shader receives radii in ECEF meters and a time-varying weather offset.
 */
export function updateCloudUniformScratch({ Cesium, scratch, params, ellipsoid, elapsedSeconds }) {
    const normalized = normalizeCloudParams(params);
    const baseRadius = ellipsoid?.maximumRadius || 6378137.0;
    const bottomRadius = baseRadius + normalized.bottomAltitude;
    const topRadius = bottomRadius + normalized.thickness;
    const direction = Cesium.Math.toRadians(normalized.windDirectionDegrees);
    const windMeters = normalized.windSpeed * Math.max(0, elapsedSeconds || 0);

    scratch.radii.x = bottomRadius;
    scratch.radii.y = topRadius;
    scratch.radii.z = normalized.maxDistance;
    scratch.radii.w = normalized.stepCount;

    scratch.params.x = normalized.coverage;
    scratch.params.y = normalized.densityMultiplier;
    scratch.params.z = normalized.alphaScale;
    scratch.params.w = normalized.thickness;

    scratch.lighting.x = normalized.lightIntensity;
    scratch.lighting.y = normalized.ambientIntensity;
    scratch.lighting.z = normalized.bottomAltitude;
    scratch.lighting.w = 0;

    scratch.noise.x = normalized.shapeScale;
    scratch.noise.y = normalized.weatherScale;
    scratch.noise.z = windMeters;
    scratch.noise.w = elapsedSeconds || 0;

    scratch.wind.x = Math.sin(direction);
    scratch.wind.y = Math.cos(direction);

    return normalized;
}
