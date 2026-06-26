export const QUALITY_PRESETS = {
    low: {
        label: '性能',
        stepCount: 32,
        maxDistance: 260000,
        temporalUpsampling: false,
    },
    medium: {
        label: '均衡',
        stepCount: 56,
        maxDistance: 360000,
        temporalUpsampling: false,
    },
    high: {
        label: '精细',
        stepCount: 88,
        maxDistance: 520000,
        temporalUpsampling: true,
    },
    ultra: {
        label: '极致',
        stepCount: 128,
        maxDistance: 720000,
        temporalUpsampling: true,
    },
};

export const DEFAULT_CLOUD_LAYER = {
    coverage: 0.46,
    density: 1.0,
    shapeScale: 0.000018,
    weatherScale: 0.000006,
};

export const DEFAULT_CLOUD_PARAMS = {
    enabled: false,
    quality: 'medium',
    coverage: DEFAULT_CLOUD_LAYER.coverage,
    densityMultiplier: DEFAULT_CLOUD_LAYER.density,
    bottomAltitude: 1800,
    thickness: 5200,
    stepCount: QUALITY_PRESETS.medium.stepCount,
    maxDistance: QUALITY_PRESETS.medium.maxDistance,
    windSpeed: 20,
    windDirectionDegrees: 90,
    lightIntensity: 1.25,
    ambientIntensity: 0.34,
    alphaScale: 0.82,
    shapeScale: DEFAULT_CLOUD_LAYER.shapeScale,
    weatherScale: DEFAULT_CLOUD_LAYER.weatherScale,
};

export const CLOUD_PARAM_LIMITS = {
    coverage: [0, 1],
    densityMultiplier: [0.1, 3],
    bottomAltitude: [500, 10000],
    thickness: [1000, 14000],
    stepCount: [16, 128],
    maxDistance: [100000, 900000],
    windSpeed: [0, 120],
    windDirectionDegrees: [0, 360],
    lightIntensity: [0, 3],
    ambientIntensity: [0, 1],
    alphaScale: [0, 1],
    shapeScale: [0.000004, 0.00006],
    weatherScale: [0.000001, 0.00002],
};
