import { computed, ref, watch } from 'vue';
import { readStoredBoolean, writeStoredBoolean } from './cesiumStorage';
import { QUALITY_PRESETS } from '../Clouds/cloudDefaults';

const CESIUM_TOOL_PANEL_OPEN_KEY = 'cesium_tool_panel_open';

// 统一质量预设源，从 cloudDefaults.js 导入（含 label/stepCount/maxDistance/temporalUpsampling）

export function useCesiumToolModules({
    fluidPanelRef,
    sceneActions = {},
    wind = {},
    panelStorageKey = CESIUM_TOOL_PANEL_OPEN_KEY,
} = {}) {
    const toolPanelOpen = ref(readStoredBoolean(panelStorageKey, true));

    const advancedEffectControls = ref({
        fog: false,
        hbao: false,
        tiltShift: false,
        atmosphere: false,
        volumetricClouds: false,
    });

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

    const toolModules = computed(() => [
        {
            id: 'scene',
            title: '场景导航',
            description: '相机和演示数据',
            actions: [
                { id: 'home', label: '回到初始视角' },
                { id: 'everest', label: '飞越珠峰' },
                { id: 'tileset', label: '加载3D模型' },
            ],
        },
        {
            id: 'effects',
            title: '高级特效',
            description: '统一控制雾效、阴影和大气圈增强',
            status:
                advancedEffectControls.value.atmosphere ||
                advancedEffectControls.value.fog ||
                advancedEffectControls.value.hbao ||
                advancedEffectControls.value.tiltShift
                    ? '启用'
                    : '关闭',
            statusTone:
                advancedEffectControls.value.atmosphere ||
                advancedEffectControls.value.fog ||
                advancedEffectControls.value.hbao ||
                advancedEffectControls.value.tiltShift
                    ? 'success'
                    : 'neutral',
            controls: [
                { id: 'fog', label: '高度雾', type: 'toggle', value: advancedEffectControls.value.fog },
                { id: 'hbao', label: '微阴影', type: 'toggle', value: advancedEffectControls.value.hbao },
                { id: 'tiltShift', label: '移轴', type: 'toggle', value: advancedEffectControls.value.tiltShift },
                {
                    id: 'atmosphere',
                    label: '大气圈增强',
                    type: 'toggle',
                    value: advancedEffectControls.value.atmosphere,
                },
            ],
        },
        {
            id: 'clouds',
            title: '体积云',
            description: '云层质量、光照、自阴影和步进参数',
            status: advancedEffectControls.value.volumetricClouds ? '启用' : '关闭',
            statusTone: advancedEffectControls.value.volumetricClouds ? 'success' : 'neutral',
            controlLayout: 'clouds',
            controls: [
                {
                    id: 'volumetricClouds',
                    label: '云层',
                    type: 'toggle',
                    value: advancedEffectControls.value.volumetricClouds,
                    tooltip: 'Cesium ECEF 球壳体积云。包含向太阳二次步进、SVS Beer Shadow Map、自阴影与薄雾近似。',
                },
                {
                    id: 'cloudQuality',
                    label: '质量',
                    type: 'select',
                    value: cloudParams.value.quality,
                    options: Object.entries(QUALITY_PRESETS).map(([value, preset]) => ({
                        value,
                        label: preset.label,
                    })),
                    disabled: !advancedEffectControls.value.volumetricClouds,
                },
                ...createCloudControls(cloudParams.value, !advancedEffectControls.value.volumetricClouds),
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
                {
                    id: 'pick',
                    label: fluidState.value.isPicking ? '等待选点' : '捕捉高度图',
                    variant: 'primary',
                    active: fluidState.value.isPicking,
                },
                {
                    id: 'clear',
                    label: '清除',
                    variant: 'danger',
                    disabled: !fluidState.value.hasFluid && !fluidState.value.isPicking,
                },
            ],
            controls: createFluidControls(fluidParams.value, fluidState.value),
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
        };

        actionMap[moduleId]?.[actionId]?.();
    }

    function handleToolControlChange({ moduleId, controlId, value }) {
        if (
            (moduleId === 'effects' || moduleId === 'clouds') &&
            controlId in advancedEffectControls.value
        ) {
            advancedEffectControls.value = {
                ...advancedEffectControls.value,
                [controlId]: Boolean(value),
            };
            return;
        }

        if (moduleId === 'clouds' && isCloudControlId(controlId)) {
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

        if (moduleId === 'wind' && controlId in (wind.windParams?.value || {})) {
            wind.setWindParam?.(controlId, value);
            return;
        }

        if (moduleId === 'fluid' && controlId in fluidParams.value) {
            fluidParams.value = {
                ...fluidParams.value,
                [controlId]: controlId === 'waterColor' ? value : Number(value),
            };
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
        fluidParams,
        fluidState,
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
