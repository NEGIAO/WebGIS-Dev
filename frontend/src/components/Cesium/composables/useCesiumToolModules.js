import { computed, ref, watch } from 'vue';
import { readStoredBoolean, writeStoredBoolean } from './cesiumStorage';

const CESIUM_TOOL_PANEL_OPEN_KEY = 'cesium_tool_panel_open';

// 云层质量预设（本地定义，原 atmosphereDefaults.js 已移除）
const QUALITY_PRESETS = {
    low: { stepCount: 32, maxDistance: 200000, label: '低' },
    medium: { stepCount: 48, maxDistance: 360000, label: '中' },
    high: { stepCount: 64, maxDistance: 500000, label: '高' },
    ultra: { stepCount: 80, maxDistance: 700000, label: '超高' },
};

// 统一质量预设源，从 cloudDefaults.js 导入（含 label/stepCount/maxDistance/temporalUpsampling）

export function useCesiumToolModules({
    fluidPanelRef,
    sceneActions = {},
    wind = {},
    modelManager: _modelManager = null,
    cameraEnhanced: _cameraEnhanced = null,
    heightSampler: _heightSampler = null,
    panelStorageKey = CESIUM_TOOL_PANEL_OPEN_KEY,
} = {}) {
    const toolPanelOpen = ref(readStoredBoolean(panelStorageKey, true));

    // ========== 高级特效开关（全部默认关闭） ==========
    const advancedEffectControls = ref({
        fog: false,
        hbao: false,
        tiltShift: false,
        atmosphere: false,
        volumetricClouds: false,
    });

    // 基础大气参数（只开启晨昏半球，其余全部关闭）
    const baseAtmosphereParams = ref({
        enableLighting: true,       // 晨昏线 - 开启
        showGroundAtmosphere: true, // 地面大气 - 开启（晨昏线必需）
        dynamicAtmosphereLighting: true,
        dynamicAtmosphereLightingFromSun: true,
        atmosphereLightIntensity: 5.5,
        atmosphereHueShift: -0.015,
        atmosphereSaturationShift: 0.08,
        atmosphereBrightnessShift: 0.02,
        lightingFadeInDistance: 0,
        lightingFadeOutDistance: Number.MAX_SAFE_INTEGER,
        nightFadeInDistance: 0,
        nightFadeOutDistance: Number.MAX_SAFE_INTEGER,
        fogEnabled: false,          // 雾效 - 关闭
        fogDensity: 0.00012,
        fogMinimumBrightness: 0.035,
        sunShow: true,              // 太阳 - 开启（晨昏线必需）
        moonShow: true,             // 月亮 - 开启
        skyBoxShow: true,           // 星空盒 - 开启
    });

    // Tellux 大气渲染参数（默认全部关闭，需要手动启用）
    const atmosphereParams = ref({
        dayNightEnabled: false,
        nightFactor: 0,
        moonLightEnabled: false,
        moonLightIntensity: 0.18,
        ambientIntensity: 0.08,
        cloudsEnabled: false,
        cloudCoverage: 0.3,
        cloudSpeed: 0.001,
        cloudBottom: 1500,
        cloudTop: 2150,
        cloudQuality: 'medium',
        starsEnabled: false,
        starsIntensity: 1.0,
    });

    // 体积云参数（默认关闭）
    const cloudParams = ref({
        quality: 'medium',
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
        maxDistance: QUALITY_PRESETS.medium.maxDistance,
        stepCount: QUALITY_PRESETS.medium.stepCount,
    });
    advancedEffectControls.value = {
        ...advancedEffectControls.value,
        clouds: cloudParams.value,
    };

    const fluidParams = ref({
        threshold: 10,
        blend: 20,
        lightStrength: 3,
        waterColor: '#0d4fa3',
        waterLevel: null,
    });

    const fluidState = ref({
        isPicking: false,
        hasFluid: false,
        selectedText: '',
        waterLevel: null,
        waterLevelMin: null,
        waterLevelMax: null,
    });

    // ========== 热带浅水参数 ==========
    const shallowWaterVisible = ref(false);
    const shallowWaterParams = ref({
        elevation: 30,
        azimuth: 150,
        clarity: 0.085,
        causticStrength: 0.9,
        waterColor: '#2bb3c4',
        waveHeight: 0.5,
        foamWidth: 2.4,
        reflection: 0.38,
        cloudCoverage: 0.58,
        lightningEnabled: true,
        lightningInterval: 2.0,
    });

    // ========== 工具模块定义（聚合同类功能，默认 Cesium 晨昏半球，其余关闭） ==========
    const toolModules = computed(() => [
        {
            id: 'scene',
            title: '场景导航',
            description: '相机飞行和演示数据',
            actions: [
                { id: 'home', label: '回到初始视角' },
                { id: 'everest', label: '飞越珠峰' },
                { id: 'tileset', label: '加载3D模型' },
            ],
        },
        {
            id: 'atmosphere',
            title: '大气·光照·天空',
            description: 'Cesium 原生光照 + Tellux 增强大气 + 高级后效（全部可选）',
            status: advancedEffectControls.value.atmosphere ||
                    advancedEffectControls.value.fog ||
                    advancedEffectControls.value.hbao ||
                    advancedEffectControls.value.volumetricClouds
                ? '部分启用' : '仅晨昏半球',
            statusTone: advancedEffectControls.value.atmosphere ? 'success' : 'neutral',
            controls: [
                // --- Cesium 原生基础 ---
                ...createBaseAtmosphereControls(baseAtmosphereParams.value),
                // --- 分隔：高级后效（全部默认关闭）---
                { id: '_sep_effects', label: '── 高级后效（默认关闭）──', type: 'info' },
                { id: 'fog', label: '高度雾', type: 'toggle', value: advancedEffectControls.value.fog, tooltip: '基于高度的指数雾效' },
                { id: 'hbao', label: '微阴影', type: 'toggle', value: advancedEffectControls.value.hbao, tooltip: '环境光遮蔽（HBAO）' },
                { id: 'tiltShift', label: '移轴', type: 'toggle', value: advancedEffectControls.value.tiltShift, tooltip: '移轴模糊后处理' },
                // --- 分隔：Tellux 大气渲染 ---
                { id: '_sep_tellux', label: '── Tellux 增强大气（默认关闭）──', type: 'info' },
                { id: 'atmosphere', label: '大气效果', type: 'toggle', value: advancedEffectControls.value.atmosphere, tooltip: '启用 Tellux 大气渲染（日夜过渡、月光、星空）' },
                ...createAtmosphereControls(atmosphereParams.value, !advancedEffectControls.value.atmosphere),
                // --- 分隔：体积云 ---
                { id: '_sep_clouds', label: '── 体积云（默认关闭）──', type: 'info' },
                { id: 'volumetricClouds', label: '云层', type: 'toggle', value: advancedEffectControls.value.volumetricClouds, tooltip: 'Cesium ECEF 球壳体积云' },
                {
                    id: 'cloudQuality', label: '云质量', type: 'select',
                    value: cloudParams.value.quality,
                    options: Object.entries(QUALITY_PRESETS).map(([value, preset]) => ({ value, label: preset.label })),
                    disabled: !advancedEffectControls.value.volumetricClouds,
                },
                ...createCloudControls(cloudParams.value, !advancedEffectControls.value.volumetricClouds),
            ],
        },
        {
            id: 'tools',
            title: '空间工具',
            description: '模型加载、增强相机、高度采样（Tellux 移植）',
            status: (_modelManager?.modelCount?.value > 0 ? '模型' : '') ||
                    (_cameraEnhanced?.flightState?.value === 'flying' ? '飞行中' : '就绪'),
            statusTone: _modelManager?.modelCount?.value > 0 ? 'success' : 'neutral',
            controls: [
                { id: 'modelManagerEnabled', label: '模型管理', type: 'toggle', value: false, tooltip: '启用后可加载 glTF/GLB 模型到地理坐标位置' },
                { id: 'cameraEnhancedEnabled', label: '增强相机', type: 'toggle', value: false, tooltip: '自定义缓动函数、角度插值和弹簧物理' },
                { id: 'heightSamplerEnabled', label: '高度采样', type: 'toggle', value: false, tooltip: '地形高度查询、批量异步采样、屏幕坐标拾取' },
            ],
        },
        {
            id: 'wind',
            title: '模拟风场',
            description: 'WebGL2 粒子风场',
            status: wind.wind2D?.value ? '已加载' : '未加载',
            statusTone: wind.wind2D?.value ? 'success' : 'neutral',
            actions: [
                { id: 'load', label: wind.wind2D?.value ? '重新加载' : '加载风场', variant: 'primary' },
                { id: 'clear', label: '清除', variant: 'danger', disabled: !wind.wind2D?.value },
            ],
            controls: createWindControls(wind.windParams?.value, !!wind.wind2D?.value),
        },
        {
            id: 'fluid',
            title: '水体流体',
            description: '点击地形捕捉高度图并生成水体',
            status: fluidState.value.isPicking ? '等待选点' : fluidState.value.hasFluid ? '已创建' : '未创建',
            statusTone: fluidState.value.isPicking ? 'warning' : fluidState.value.hasFluid ? 'success' : 'neutral',
            actions: [
                { id: 'pick', label: fluidState.value.isPicking ? '等待选点' : '捕捉高度图', variant: 'primary', active: fluidState.value.isPicking },
                { id: 'clear', label: '清除', variant: 'danger', disabled: !fluidState.value.hasFluid && !fluidState.value.isPicking },
            ],
            controls: createFluidControls(fluidParams.value, fluidState.value),
        },
        {
            id: 'shallowWater',
            title: '热带浅水',
            description: 'Three.js 热带浅水场景（焦散/折射/物理吸色/体积云/闪电）',
            status: shallowWaterVisible.value ? '已启用' : '未启用',
            statusTone: shallowWaterVisible.value ? 'success' : 'neutral',
            actions: [
                { id: 'toggle', label: shallowWaterVisible.value ? '关闭' : '启用', variant: shallowWaterVisible.value ? 'danger' : 'primary' },
            ],
            controls: createShallowWaterControls(shallowWaterParams.value, !shallowWaterVisible.value),
        },
    ]);

    watch(toolPanelOpen, (value) => {
        writeStoredBoolean(panelStorageKey, value);
    });

    function handleToolAction({ moduleId, actionId }) {
        const actionMap = {
            scene: {
                home: () => sceneActions.flyToHome?.(),
                everest: sceneActions.flyToEverest,
                tileset: sceneActions.loadCustomTileset,
            },
            wind: {
                load: wind.loadSimulatedWind,
                clear: wind.clearWind2D,
            },
            fluid: {
                pick: () => fluidPanelRef?.value?.startPickHeightMap?.(),
                clear: () => fluidPanelRef?.value?.clearFluid?.(),
            },
            shallowWater: {
                toggle: () => {
                    shallowWaterVisible.value = !shallowWaterVisible.value;
                },
            },
        };

        actionMap[moduleId]?.[actionId]?.();
    }

    function handleToolControlChange({ moduleId, controlId, value }) {
        // 跳过分隔符信息行
        if (controlId?.startsWith?.('_sep_')) return;

        // 风场控件
        if (moduleId === 'wind' && controlId in (wind.windParams?.value || {})) {
            wind.setWindParam?.(controlId, value);
            return;
        }

        // 流体控件
        if (moduleId === 'fluid' && controlId in fluidParams.value) {
            fluidParams.value = {
                ...fluidParams.value,
                [controlId]: controlId === 'waterColor' ? value : Number(value),
            };
            return;
        }

        // 热带浅水控件
        if (moduleId === 'shallowWater' && controlId in shallowWaterParams.value) {
            shallowWaterParams.value = {
                ...shallowWaterParams.value,
                [controlId]: controlId === 'waterColor' || controlId === 'lightningEnabled'
                    ? value
                    : Number(value),
            };
            return;
        }

        // ========== 合并的 atmosphere 模块处理 ==========
        if (moduleId === 'atmosphere') {
            // 高级特效开关（fog/hbao/tiltShift/atmosphere/volumetricClouds）
            if (controlId in advancedEffectControls.value) {
                advancedEffectControls.value = {
                    ...advancedEffectControls.value,
                    [controlId]: Boolean(value),
                };
                return;
            }

            // 体积云参数
            if (isCloudControlId(controlId)) {
                const nextCloudPatch = controlId === 'cloudQuality'
                    ? { quality: value, previousQuality: cloudParams.value.quality }
                    : { [controlId]: value };
                cloudParams.value = normalizeCloudParams({
                    ...cloudParams.value,
                    ...nextCloudPatch,
                });
                advancedEffectControls.value = {
                    ...advancedEffectControls.value,
                    clouds: cloudParams.value,
                };
                return;
            }

            // 基础大气参数（Cesium 原生）
            if (controlId in baseAtmosphereParams.value) {
                baseAtmosphereParams.value = {
                    ...baseAtmosphereParams.value,
                    [controlId]: value,
                };
                return;
            }

            // Tellux 大气渲染参数
            if (controlId === 'atmosphereEnabled') {
                advancedEffectControls.value = {
                    ...advancedEffectControls.value,
                    atmosphere: Boolean(value),
                };
                return;
            }
            if (controlId in atmosphereParams.value) {
                atmosphereParams.value = {
                    ...atmosphereParams.value,
                    [controlId]: value,
                };
            }
        }
    }

    function handleFluidStateChange(state) {
        const nextWaterLevel = toFiniteNumberOrNull(state?.waterLevel);
        const nextWaterLevelMin = toFiniteNumberOrNull(state?.waterLevelMin);
        const nextWaterLevelMax = toFiniteNumberOrNull(state?.waterLevelMax);

        fluidState.value = {
            isPicking: !!state?.isPicking,
            hasFluid: !!state?.hasFluid,
            selectedText: state?.selectedText || '',
            waterLevel: nextWaterLevel,
            waterLevelMin: nextWaterLevelMin,
            waterLevelMax: nextWaterLevelMax,
        };

        if (nextWaterLevel !== null) {
            fluidParams.value = {
                ...fluidParams.value,
                waterLevel: nextWaterLevel,
            };
        }
    }

    function cleanupTools() {
        wind.clearWind2D?.();
    }

    return {
        toolPanelOpen,
        advancedEffectControls,
        cloudParams,
        baseAtmosphereParams,
        atmosphereParams,
        fluidParams,
        fluidState,
        shallowWaterVisible,
        shallowWaterParams,
        toolModules,
        handleToolAction,
        handleToolControlChange,
        handleFluidStateChange,
        cleanupTools,
    };
}

function createWindControls(windParams = {}, disabled) {
    return [
        {
            id: 'speedFactor',
            label: '速度因子',
            type: 'range',
            min: 0.1,
            max: 5,
            step: 0.1,
            value: windParams.speedFactor ?? 1,
            displayValue: Number(windParams.speedFactor ?? 1).toFixed(1),
            disabled,
        },
        {
            id: 'arrowLength',
            label: '箭头长度',
            type: 'range',
            min: 5000,
            max: 50000,
            step: 1000,
            value: windParams.arrowLength ?? 15000,
            displayValue: `${Math.round((windParams.arrowLength ?? 15000) / 1000)} km`,
            disabled,
        },
        {
            id: 'trailLength',
            label: '尾迹长度',
            type: 'range',
            min: 5000,
            max: 80000,
            step: 1000,
            value: windParams.trailLength ?? 20000,
            displayValue: `${Math.round((windParams.trailLength ?? 20000) / 1000)} km`,
            disabled,
        },
        {
            id: 'alphaFactor',
            label: '透明度',
            type: 'range',
            min: 0.1,
            max: 1,
            step: 0.05,
            value: windParams.alphaFactor ?? 1,
            displayValue: Number(windParams.alphaFactor ?? 1).toFixed(2),
            disabled,
        },
    ];
}

function createCloudControls(params = {}, disabled) {
    return [
        {
            id: 'coverage',
            label: '云量',
            type: 'range',
            min: 0.18,
            max: 0.82,
            step: 0.01,
            value: params.coverage ?? 0.52,
            displayValue: Number(params.coverage ?? 0.52).toFixed(2),
            disabled,
            tooltip: '覆盖率阈值。数值越大云越少，数值越小云越密。',
            numberInput: false,
        },
        {
            id: 'density',
            label: '密度',
            type: 'range',
            min: 0.000025,
            max: 0.00018,
            step: 0.000005,
            value: params.density ?? 0.00009,
            displayValue: Number(params.density ?? 0.00009).toExponential(2),
            disabled,
            tooltip: '体积消光密度。数值越大云更厚、更暗，也更影响性能观感。',
            numberInput: false,
        },
        {
            id: 'shadowStrength',
            label: '阴影',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.02,
            value: params.shadowStrength ?? 0.82,
            displayValue: Number(params.shadowStrength ?? 0.82).toFixed(2),
            disabled,
            numberInput: false,
        },
        {
            id: 'multiScattering',
            label: '散射',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.02,
            value: params.multiScattering ?? 0.58,
            displayValue: Number(params.multiScattering ?? 0.58).toFixed(2),
            disabled,
            numberInput: false,
        },
        {
            id: 'beerShadowStrength',
            label: '远影',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.02,
            value: params.beerShadowStrength ?? 0.64,
            displayValue: Number(params.beerShadowStrength ?? 0.64).toFixed(2),
            disabled,
            tooltip: 'Beer Shadow Map 风格的远距离光学深度近似。数值越大，云层背光阴影越明显。',
            numberInput: false,
        },
        {
            id: 'powderStrength',
            label: '银边',
            type: 'range',
            min: 0,
            max: 1.4,
            step: 0.02,
            value: params.powderStrength ?? 0.72,
            displayValue: Number(params.powderStrength ?? 0.72).toFixed(2),
            disabled,
            numberInput: false,
        },
        {
            id: 'hazeStrength',
            label: '薄霾',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.02,
            value: params.hazeStrength ?? 0.38,
            displayValue: Number(params.hazeStrength ?? 0.38).toFixed(2),
            disabled,
            numberInput: false,
        },
        {
            id: 'groundBounceStrength',
            label: '反照',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.02,
            value: params.groundBounceStrength ?? 0.26,
            displayValue: Number(params.groundBounceStrength ?? 0.26).toFixed(2),
            disabled,
            tooltip: '地面反弹光近似，用于提亮云底。',
            numberInput: false,
        },
        {
            id: 'bsmShadow',
            label: 'BSM',
            type: 'toggle',
            value: !!params.bsmShadow,
            disabled,
            tooltip: 'Beer Shadow Map 阴影 atlas。用于远距离自阴影，异常时会自动降级关闭。',
        },
        {
            id: 'shadowResolution',
            label: '影图',
            type: 'range',
            min: 128,
            max: 512,
            step: 128,
            value: params.shadowResolution ?? 256,
            displayValue: `${Math.round(params.shadowResolution ?? 256)} px`,
            disabled: disabled || !params.bsmShadow,
            tooltip: 'BSM 阴影 atlas 单级联分辨率。越高越清晰，也越影响性能。',
            numberInput: false,
        },
        {
            id: 'maxDistance',
            label: '距离',
            type: 'range',
            min: 120000,
            max: 900000,
            step: 10000,
            value: params.maxDistance ?? QUALITY_PRESETS.medium.maxDistance,
            displayValue: `${Math.round((params.maxDistance ?? QUALITY_PRESETS.medium.maxDistance) / 1000)} km`,
            disabled,
            numberInput: false,
        },
        {
            id: 'stepCount',
            label: '步数',
            type: 'range',
            min: 24,
            max: 80,
            step: 1,
            value: params.stepCount ?? QUALITY_PRESETS.medium.stepCount,
            displayValue: String(Math.round(params.stepCount ?? QUALITY_PRESETS.medium.stepCount)),
            disabled,
            numberInput: false,
        },
    ];
}

function isCloudControlId(controlId) {
    return [
        'cloudQuality',
        'coverage',
        'density',
        'shadowStrength',
        'beerShadowStrength',
        'multiScattering',
        'powderStrength',
        'hazeStrength',
        'groundBounceStrength',
        'bsmShadow',
        'shadowResolution',
        'maxDistance',
        'stepCount',
    ].includes(controlId);
}

function normalizeCloudParams(params = {}) {
    const quality = Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, params.quality)
        ? params.quality
        : 'medium';
    const preset = QUALITY_PRESETS[quality];
    const qualityChanged = params.quality && params.quality !== params.previousQuality;
    return {
        quality,
        coverage: clampNumber(toFiniteNumber(params.coverage, 0.52), 0.18, 0.82),
        density: clampNumber(toFiniteNumber(params.density, 0.00009), 0.000025, 0.00018),
        shadowStrength: clampNumber(toFiniteNumber(params.shadowStrength, 0.82), 0, 1),
        beerShadowStrength: clampNumber(toFiniteNumber(params.beerShadowStrength, 0.64), 0, 1),
        multiScattering: clampNumber(toFiniteNumber(params.multiScattering, 0.58), 0, 1),
        powderStrength: clampNumber(toFiniteNumber(params.powderStrength, 0.72), 0, 1.4),
        hazeStrength: clampNumber(toFiniteNumber(params.hazeStrength, 0.38), 0, 1),
        groundBounceStrength: clampNumber(toFiniteNumber(params.groundBounceStrength, 0.26), 0, 1),
        bsmShadow: params.bsmShadow === true,
        shadowResolution: Math.round(clampNumber(toFiniteNumber(params.shadowResolution, 256), 128, 512) / 128) * 128,
        maxDistance: clampNumber(
            qualityChanged ? preset.maxDistance : toFiniteNumber(params.maxDistance, preset.maxDistance),
            120000,
            900000,
        ),
        stepCount: Math.round(clampNumber(
            qualityChanged ? preset.stepCount : toFiniteNumber(params.stepCount, preset.stepCount),
            24,
            80,
        )),
    };
}

function createFluidControls(fluidParams, fluidState = {}) {
    const waterLevelMin = toFiniteNumberOrNull(fluidState.waterLevelMin);
    const waterLevelMax = toFiniteNumberOrNull(fluidState.waterLevelMax);
    const hasWaterLevelRange = waterLevelMin !== null && waterLevelMax !== null;
    const minWaterLevel = hasWaterLevelRange ? Math.min(waterLevelMin, waterLevelMax) : 0;
    const maxWaterLevel = hasWaterLevelRange ? Math.max(waterLevelMin, waterLevelMax) : 0;
    const rawWaterLevel = toFiniteNumberOrNull(fluidParams.waterLevel);
    const waterLevel = hasWaterLevelRange
        ? clampNumber(rawWaterLevel ?? minWaterLevel, minWaterLevel, maxWaterLevel)
        : 0;
    const waterLevelStep = hasWaterLevelRange
        ? Math.max((maxWaterLevel - minWaterLevel) / 1000, 0.01)
        : 1;

    return [
        {
            id: 'threshold',
            label: '阈值',
            type: 'range',
            min: 0,
            max: 500,
            step: 0.0001,
            value: fluidParams.threshold,
            displayValue: Number(fluidParams.threshold).toFixed(2),
            tooltip: '起流阈值。值越大，越小的水流越容易被过滤掉，水体越不容易产生细碎流动；同时会影响水体雾化距离。',
        },
        {
            id: 'blend',
            label: '混合',
            type: 'range',
            min: 0,
            max: 50,
            step: 0.0001,
            value: fluidParams.blend,
            displayValue: Number(fluidParams.blend).toFixed(2),
            tooltip: '流动混合/扩散强度。值越大，相邻区域之间的水量交换越强，水流传播更快；同时会影响水面高光的锐度。',
        },
        {
            id: 'lightStrength',
            label: '光强',
            type: 'range',
            min: 0,
            max: 10,
            step: 0.0001,
            value: fluidParams.lightStrength,
            displayValue: Number(fluidParams.lightStrength).toFixed(2),
            tooltip: '光照与衰减强度。值越大，水面高光越明显，模拟中的流量衰减越慢，水流会持续得更久。',
        },
        {
            id: 'waterLevel',
            label: '水位',
            type: 'range',
            min: minWaterLevel,
            max: maxWaterLevel,
            step: waterLevelStep,
            value: waterLevel,
            displayValue: hasWaterLevelRange ? `${formatElevation(waterLevel)} m` : '先捕捉',
            disabled: !hasWaterLevelRange,
            tooltip: '当前水位海拔。范围来自本次捕捉区域内的最低到最高高程，拖动后会按新水位重置并重新计算水流。',
        },
        {
            id: 'waterColor',
            label: '水色',
            type: 'color',
            value: fluidParams.waterColor,
            tooltip: '水体渲染颜色。改变后会实时更新当前水体颜色。',
        },
    ];
}

function toFiniteNumberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatElevation(value) {
    const absoluteValue = Math.abs(value);
    if (absoluteValue >= 1000) return value.toFixed(1);
    if (absoluteValue >= 10) return value.toFixed(2);
    return value.toFixed(3);
}

// ============================================================
// 大气系统控件
// ============================================================

const ATMOSPHERE_QUALITY_PRESETS = {
    low: { stepCount: 32, label: '低' },
    medium: { stepCount: 64, label: '中' },
    high: { stepCount: 96, label: '高' },
    ultra: { stepCount: 128, label: '超高' },
};

function createAtmosphereControls(params = {}, disabled) {
    return [
        {
            id: 'atmosphereEnabled',
            label: '大气效果',
            type: 'toggle',
            value: !disabled,
            tooltip: '启用 Tellux 大气渲染系统（日夜过渡、月光、体积云、星空）',
        },
        // 日夜过渡
        {
            id: 'dayNightEnabled',
            label: '日夜过渡',
            type: 'toggle',
            value: params.dayNightEnabled !== false,
            disabled,
            tooltip: '基于太阳高度角的平滑日夜过渡效果',
        },
        // 月光
        {
            id: 'moonLightEnabled',
            label: '月光',
            type: 'toggle',
            value: params.moonLightEnabled !== false,
            disabled,
            tooltip: '夜间月光照明效果',
        },
        {
            id: 'moonLightIntensity',
            label: '月光强度',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.moonLightIntensity ?? 0.18,
            displayValue: Number(params.moonLightIntensity ?? 0.18).toFixed(2),
            disabled: disabled || !params.moonLightEnabled,
        },
        {
            id: 'ambientIntensity',
            label: '环境光',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.ambientIntensity ?? 0.08,
            displayValue: Number(params.ambientIntensity ?? 0.08).toFixed(2),
            disabled: disabled || !params.moonLightEnabled,
        },
        // 体积云
        {
            id: 'cloudsEnabled',
            label: '体积云',
            type: 'toggle',
            value: params.cloudsEnabled === true,
            disabled,
            tooltip: '基于 PostProcessStage 的体积云渲染',
        },
        {
            id: 'cloudQuality',
            label: '云质量',
            type: 'select',
            value: params.cloudQuality ?? 'medium',
            options: Object.entries(ATMOSPHERE_QUALITY_PRESETS).map(([value, preset]) => ({
                value,
                label: preset.label,
            })),
            disabled: disabled || !params.cloudsEnabled,
        },
        {
            id: 'cloudCoverage',
            label: '覆盖度',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.cloudCoverage ?? 0.3,
            displayValue: `${Math.round((params.cloudCoverage ?? 0.3) * 100)}%`,
            disabled: disabled || !params.cloudsEnabled,
        },
        {
            id: 'cloudSpeed',
            label: '移动速度',
            type: 'range',
            min: 0,
            max: 0.01,
            step: 0.0001,
            value: params.cloudSpeed ?? 0.001,
            displayValue: Number(params.cloudSpeed ?? 0.001).toFixed(4),
            disabled: disabled || !params.cloudsEnabled,
        },
        {
            id: 'cloudBottom',
            label: '云底高度',
            type: 'range',
            min: 500,
            max: 5000,
            step: 50,
            value: params.cloudBottom ?? 1500,
            displayValue: `${Math.round(params.cloudBottom ?? 1500)} m`,
            disabled: disabled || !params.cloudsEnabled,
        },
        {
            id: 'cloudTop',
            label: '云顶高度',
            type: 'range',
            min: 1000,
            max: 10000,
            step: 100,
            value: params.cloudTop ?? 2150,
            displayValue: `${Math.round(params.cloudTop ?? 2150)} m`,
            disabled: disabled || !params.cloudsEnabled,
        },
        // 星空
        {
            id: 'starsEnabled',
            label: '星空',
            type: 'toggle',
            value: params.starsEnabled !== false,
            disabled,
            tooltip: '基于高度的星空可见性',
        },
        {
            id: 'starsIntensity',
            label: '星空强度',
            type: 'range',
            min: 0,
            max: 5,
            step: 0.1,
            value: params.starsIntensity ?? 1.0,
            displayValue: Number(params.starsIntensity ?? 1.0).toFixed(1),
            disabled: disabled || !params.starsEnabled,
        },
    ];
}

// ============================================================
// 基础大气控件（Cesium 原生大气/光照/雾效）
// ============================================================

function createBaseAtmosphereControls(params = {}) {
    return [
        {
            id: 'enableLighting',
            label: '日照',
            type: 'toggle',
            value: params.enableLighting !== false,
            tooltip: 'Cesium globe.enableLighting：启用日照贴图',
        },
        {
            id: 'showGroundAtmosphere',
            label: '地面大气',
            type: 'toggle',
            value: params.showGroundAtmosphere !== false,
            tooltip: 'globe.showGroundAtmosphere：地面大气光晕',
        },
        {
            id: 'dynamicAtmosphereLighting',
            label: '动态光照',
            type: 'toggle',
            value: params.dynamicAtmosphereLighting !== false,
        },
        {
            id: 'atmosphereLightIntensity',
            label: '大气光强',
            type: 'range',
            min: 0,
            max: 25,
            step: 0.5,
            value: params.atmosphereLightIntensity ?? 5.5,
            displayValue: Number(params.atmosphereLightIntensity ?? 5.5).toFixed(1),
        },
        {
            id: 'fogEnabled',
            label: '雾效',
            type: 'toggle',
            value: params.fogEnabled !== false,
        },
        {
            id: 'fogDensity',
            label: '雾密度',
            type: 'range',
            min: 0.00001,
            max: 0.001,
            step: 0.00001,
            value: params.fogDensity ?? 0.00012,
            displayValue: Number(params.fogDensity ?? 0.00012).toFixed(5),
            disabled: !params.fogEnabled,
        },
        {
            id: 'sunShow',
            label: '太阳',
            type: 'toggle',
            value: params.sunShow !== false,
        },
        {
            id: 'moonShow',
            label: '月亮',
            type: 'toggle',
            value: params.moonShow !== false,
        },
        {
            id: 'skyBoxShow',
            label: '星空盒',
            type: 'toggle',
            value: params.skyBoxShow !== false,
        },
    ];
}

// ============================================================
// 热带浅水控件
// ============================================================

function createShallowWaterControls(params = {}, disabled = false) {
    return [
        {
            id: '_sep_shallowWater',
            label: '── 太阳参数 ──',
            type: 'info',
        },
        {
            id: 'elevation',
            label: '高度角',
            type: 'range',
            min: 2,
            max: 80,
            step: 0.1,
            value: params.elevation ?? 30,
            displayValue: Number(params.elevation ?? 30).toFixed(1),
            disabled,
        },
        {
            id: 'azimuth',
            label: '方位角',
            type: 'range',
            min: -180,
            max: 180,
            step: 0.1,
            value: params.azimuth ?? 150,
            displayValue: Number(params.azimuth ?? 150).toFixed(1),
            disabled,
        },
        {
            id: '_sep_water',
            label: '── 水面参数 ──',
            type: 'info',
        },
        {
            id: 'clarity',
            label: '清澈度',
            type: 'range',
            min: 0.03,
            max: 0.4,
            step: 0.005,
            value: params.clarity ?? 0.085,
            displayValue: Number(params.clarity ?? 0.085).toFixed(3),
            tooltip: '越小越清澈(Beer-Lambert 密度)',
            disabled,
        },
        {
            id: 'causticStrength',
            label: '焦散强度',
            type: 'range',
            min: 0,
            max: 2,
            step: 0.05,
            value: params.causticStrength ?? 0.9,
            displayValue: Number(params.causticStrength ?? 0.9).toFixed(2),
            disabled,
        },
        {
            id: 'waveHeight',
            label: '浪高',
            type: 'range',
            min: 0,
            max: 1.5,
            step: 0.05,
            value: params.waveHeight ?? 0.5,
            displayValue: Number(params.waveHeight ?? 0.5).toFixed(2),
            disabled,
        },
        {
            id: 'foamWidth',
            label: '泡沫宽度',
            type: 'range',
            min: 0,
            max: 8,
            step: 0.1,
            value: params.foamWidth ?? 2.4,
            displayValue: Number(params.foamWidth ?? 2.4).toFixed(1),
            disabled,
        },
        {
            id: 'reflection',
            label: '反射强度',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.02,
            value: params.reflection ?? 0.38,
            displayValue: Number(params.reflection ?? 0.38).toFixed(2),
            disabled,
        },
        {
            id: 'waterColor',
            label: '远处浅水色',
            type: 'color',
            value: params.waterColor ?? '#2bb3c4',
            disabled,
        },
        {
            id: '_sep_clouds',
            label: '── 天空 / 闪电 ──',
            type: 'info',
        },
        {
            id: 'cloudCoverage',
            label: '云量',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.cloudCoverage ?? 0.58,
            displayValue: Number(params.cloudCoverage ?? 0.58).toFixed(2),
            disabled,
        },
        {
            id: 'lightningEnabled',
            label: '闪电开关',
            type: 'toggle',
            value: params.lightningEnabled !== false,
            disabled,
        },
        {
            id: 'lightningInterval',
            label: '闪电间隔(秒)',
            type: 'range',
            min: 0.4,
            max: 8,
            step: 0.1,
            value: params.lightningInterval ?? 2.0,
            displayValue: Number(params.lightningInterval ?? 2.0).toFixed(1),
            disabled: disabled || params.lightningEnabled === false,
        },
    ];
}
