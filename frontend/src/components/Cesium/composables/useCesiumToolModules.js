import { computed, ref, watch } from 'vue';
import { readStoredBoolean, writeStoredBoolean } from './cesiumStorage';

const CESIUM_TOOL_PANEL_OPEN_KEY = 'cesium_tool_panel_open';

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
    });

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
            status: advancedEffectControls.value.atmosphere || advancedEffectControls.value.fog ? '启用' : '关闭',
            statusTone:
                advancedEffectControls.value.atmosphere || advancedEffectControls.value.fog ? 'success' : 'neutral',
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
        if (moduleId === 'effects' && controlId in advancedEffectControls.value) {
            advancedEffectControls.value = {
                ...advancedEffectControls.value,
                [controlId]: Boolean(value),
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

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatElevation(value) {
    const absoluteValue = Math.abs(value);
    if (absoluteValue >= 1000) return value.toFixed(1);
    if (absoluteValue >= 10) return value.toFixed(2);
    return value.toFixed(3);
}
