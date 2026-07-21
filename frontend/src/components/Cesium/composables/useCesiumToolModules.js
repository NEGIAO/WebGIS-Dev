import { computed, ref, watch } from 'vue';
import { readStoredBoolean, writeStoredBoolean } from './cesiumStorage';
import {
    applyCloudQualityPreset,
    DEFAULT_CLOUD_QUALITY,
    getCloudQualityOptions,
} from '../Cloud/cloudQualityPresets.js';

const CESIUM_TOOL_PANEL_OPEN_KEY = 'cesium_tool_panel_open';

export function useCesiumToolModules({
    fluidPanelRef,
    sceneActions = {},
    wind = {},
    modelManager: _modelManager = null,
    cameraEnhanced: _cameraEnhanced = null,
    heightSampler: _heightSampler = null,
    playerController: _playerController = null,
    panelStorageKey = CESIUM_TOOL_PANEL_OPEN_KEY,
} = {}) {
    const toolPanelOpen = ref(readStoredBoolean(panelStorageKey, true));

    // ========== 高级特效开关（全部默认关闭） ==========
    const advancedEffectControls = ref({
        fog: false,
        hbao: false,
        tiltShift: false,
        atmosphere: false,
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

    // Tellux 大气渲染参数（默认开启，与 baseAtmosphereParams 配合）
    const atmosphereParams = ref({
        dayNightEnabled: true,
        nightFactor: 0,
        moonLightEnabled: true,
        moonLightIntensity: 0.18,
        ambientIntensity: 0.08,
        starsEnabled: true,
        starsIntensity: 1.0,
    });

    // 体积云独立参数（cesium-clouds-atmosphere 管线；默认关闭懒加载；开启时默认「流畅」档）
    const cloudParams = ref(
        applyCloudQualityPreset(
            {
                cloudsEnabled: false,
                quality: DEFAULT_CLOUD_QUALITY,
            },
            DEFAULT_CLOUD_QUALITY,
        ),
    );

    const fluidParams = ref({
        threshold: 10,
        blend: 20,
        lightStrength: 3,
        waterColor: '#0d4fa3',
        waterLevel: null,
        floodSpeed: 5,
    });

    // 人物漫游调试参数
    const playerParams = ref({
        speed: 300,
        flySpeed: 55000,
        gravity: -2400,
        jumpHeight: 600,
        sensitivity: 5,
        acceleration: 30,
        deceleration: 30,
        spawnHeight: 500,
    });

    const fluidState = ref({
        isPicking: false,
        hasFluid: false,
        selectedText: '',
        waterLevel: null,
        waterLevelMin: null,
        waterLevelMax: null,
        floodSimActive: false,
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
                    advancedEffectControls.value.hbao
                ? '部分启用' : '仅晨昏半球',
            statusTone: advancedEffectControls.value.atmosphere ? 'success' : 'neutral',
            controls: [
                // --- Cesium 原生基础 ---
                ...createBaseAtmosphereControls(baseAtmosphereParams.value),
                { id: 'fog', label: '高度雾', type: 'toggle', value: advancedEffectControls.value.fog, tooltip: '基于高度的指数雾效' },
                { id: 'hbao', label: '微阴影', type: 'toggle', value: advancedEffectControls.value.hbao, tooltip: '环境光遮蔽（HBAO）' },
                { id: 'tiltShift', label: '移轴', type: 'toggle', value: advancedEffectControls.value.tiltShift, tooltip: '移轴模糊后处理' },
                { id: 'atmosphere', label: '大气效果', type: 'toggle', value: advancedEffectControls.value.atmosphere, tooltip: '启用 Tellux 大气渲染（日夜过渡、月光、星空）' },
                ...createAtmosphereControls(atmosphereParams.value, !advancedEffectControls.value.atmosphere),
            ],
        },
        {
            id: 'cloud',
            title: '体积云·大气',
            description: 'Bruneton 大气 + 体积云 raymarch + BSM 云影/丁达尔（cesium-clouds-atmosphere）',
            status: cloudParams.value.cloudsEnabled
                ? qualityStatusLabel(cloudParams.value.quality)
                : '未启用',
            statusTone: cloudParams.value.cloudsEnabled ? 'success' : 'neutral',
            controls: createCloudControls(cloudParams.value, !cloudParams.value.cloudsEnabled),
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
                { id: 'floodSim', label: fluidState.value.floodSimActive ? '停止洪水' : '洪水模拟', variant: fluidState.value.floodSimActive ? 'danger' : 'default', active: fluidState.value.floodSimActive, disabled: !hasFluidWaterLevelRange(fluidState.value) },
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
        {
            id: 'player',
            title: '人物漫游',
            description: '第一/第三人称视角 + WASD 移动 + 碰撞检测 + 飞行模式',
            status: _playerController?.isActive?.value
                ? (_playerController.isFirstPerson?.value ? '第一人称' : '第三人称')
                : '未启动',
            statusTone: _playerController?.isActive?.value ? 'success' : 'neutral',
            actions: [
                {
                    id: 'toggle',
                    label: _playerController?.isActive?.value ? '停止漫游' : '启动漫游',
                    variant: _playerController?.isActive?.value ? 'danger' : 'primary',
                },
                {
                    id: 'changeView',
                    label: '切换视角',
                    disabled: !_playerController?.isActive?.value,
                },
                {
                    id: 'setNavTarget',
                    label: _playerController?.navTarget?.value ? '更改目标' : '设置导航',
                },
                {
                    id: 'clearNavTarget',
                    label: '清除导航',
                    disabled: !_playerController?.navTarget?.value,
                },
            ],
            controls: [
                { id: 'speed', label: '行走速度', type: 'range', value: playerParams.value.speed, min: 50, max: 2000, step: 10, disabled: !_playerController?.isActive?.value },
                { id: 'flySpeed', label: '飞行速度', type: 'range', value: playerParams.value.flySpeed, min: 2000, max: 1000000, step: 1000, disabled: !_playerController?.isActive?.value },
                { id: 'gravity', label: '重力', type: 'range', value: playerParams.value.gravity, min: -6000, max: 0, step: 50, disabled: !_playerController?.isActive?.value },
                { id: 'jumpHeight', label: '跳跃高度', type: 'range', value: playerParams.value.jumpHeight, min: 0, max: 3000, step: 50, disabled: !_playerController?.isActive?.value },
                { id: 'sensitivity', label: '鼠标灵敏度', type: 'range', value: playerParams.value.sensitivity, min: 1, max: 20, step: 0.5, disabled: !_playerController?.isActive?.value },
                { id: 'acceleration', label: '加速惯性', type: 'range', value: playerParams.value.acceleration, min: 1, max: 100, step: 1, disabled: !_playerController?.isActive?.value, tooltip: '值越大加速越快。WASD 按下后到达目标速度的响应快慢。' },
                { id: 'deceleration', label: '减速惯性', type: 'range', value: playerParams.value.deceleration, min: 1, max: 100, step: 1, disabled: !_playerController?.isActive?.value, tooltip: '值越大松手后停得越快。影响滑行/惯性感。' },
                { id: 'spawnHeight', label: '初始高度', type: 'range', value: playerParams.value.spawnHeight, min: 50, max: 5000, step: 50, disabled: false, tooltip: '漫游启动时的离地高度（米），重启后生效。' },
            ],
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
                floodSim: () => fluidPanelRef?.value?.toggleFloodSimulation?.(),
                clear: () => fluidPanelRef?.value?.clearFluid?.(),
            },
            shallowWater: {
                toggle: () => {
                    shallowWaterVisible.value = !shallowWaterVisible.value;
                },
            },
            player: {
                toggle: () => _playerController?.togglePlayer?.({ spawnHeight: playerParams.value.spawnHeight }),
                changeView: () => _playerController?.changeView?.(),
                setNavTarget: () => _playerController?.openNavDialog?.(),
                clearNavTarget: () => _playerController?.clearNavTarget?.(),
            },
        };

        actionMap[moduleId]?.[actionId]?.();
    }

    function handleToolControlChange({ moduleId, controlId, value }) {
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
            // floodSpeed 变化同步到 FluidSimulationPanel
            if (controlId === 'floodSpeed') {
                fluidPanelRef?.value?.setFloodSpeed?.(Number(value));
            }
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

        // 人物漫游控件
        if (moduleId === 'player' && controlId in playerParams.value) {
            const numVal = Number(value);
            playerParams.value = { ...playerParams.value, [controlId]: numVal };
            // spawnHeight 是启动前参数，无需同步到运行时
            if (controlId === 'spawnHeight') return;
            const p = _playerController?.getPlayerInstance?.();
            if (p) {
                if (controlId === 'speed') p.setPlayerSpeed(numVal);
                else if (controlId === 'flySpeed') p.setPlayerFlySpeed(numVal);
                else if (controlId === 'gravity') p.setGravity(numVal);
                else if (controlId === 'jumpHeight') p.setJumpHeight(numVal);
                else if (controlId === 'sensitivity') p.setMouseSensitivity(numVal);
                else if (controlId === 'acceleration') p.setAcceleration(numVal);
                else if (controlId === 'deceleration') p.setDeceleration(numVal);
            }
            return;
        }

        // ========== 合并的 atmosphere 模块处理 ==========
        if (moduleId === 'atmosphere') {
            // 高级特效开关（fog/hbao/tiltShift/atmosphere）
            if (controlId in advancedEffectControls.value) {
                advancedEffectControls.value = {
                    ...advancedEffectControls.value,
                    [controlId]: Boolean(value),
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

        // ========== 体积云独立模块（布尔开关 / 数值滑杆 / 性能预设） ==========
        if (moduleId === 'cloud') {
            // 性能预设：一键覆盖参数组合（保留 cloudsEnabled）
            if (controlId === 'quality') {
                cloudParams.value = applyCloudQualityPreset(cloudParams.value, value);
                return;
            }
            if (controlId in cloudParams.value) {
                const booleanKeys = new Set([
                    'cloudsEnabled',
                    'lensFlareEnabled',
                    'useShadowBuffer',
                    'shadowLengthEnabled',
                    'hazeEnabled',
                    'temporalEnabled',
                    'atmosphereExposureFollowTimeline',
                    'atmosphereStageEnabled',
                    'aerialStageEnabled',
                ]);
                cloudParams.value = {
                    ...cloudParams.value,
                    [controlId]: booleanKeys.has(controlId) ? Boolean(value) : Number(value),
                };
            }
        }
    }

    function handleFluidStateChange(state) {
        const nextWaterLevel = toFiniteNumberOrNull(state?.waterLevel);
        const nextWaterLevelMin = toFiniteNumberOrNull(state?.waterLevelMin);
        const nextWaterLevelMax = toFiniteNumberOrNull(state?.waterLevelMax);
        const nextFloodSpeed = toFiniteNumberOrNull(state?.floodSpeed);

        fluidState.value = {
            isPicking: !!state?.isPicking,
            hasFluid: !!state?.hasFluid,
            selectedText: state?.selectedText || '',
            waterLevel: nextWaterLevel,
            waterLevelMin: nextWaterLevelMin,
            waterLevelMax: nextWaterLevelMax,
            floodSimActive: !!state?.floodSimActive,
        };

        // 同步洪水速度（面板自动计算的默认值 = 值域/10）
        if (nextFloodSpeed !== null) {
            fluidParams.value = {
                ...fluidParams.value,
                floodSpeed: nextFloodSpeed,
            };
        }

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
        baseAtmosphereParams,
        atmosphereParams,
        cloudParams,
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

function hasFluidWaterLevelRange(fluidState) {
    return toFiniteNumberOrNull(fluidState.waterLevelMin) !== null &&
           toFiniteNumberOrNull(fluidState.waterLevelMax) !== null;
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
            id: 'floodSpeed',
            label: '洪水速度',
            type: 'range',
            min: hasWaterLevelRange ? Math.max((maxWaterLevel - minWaterLevel) / 100, 0.01) : 0.1,
            max: hasWaterLevelRange ? Math.max(maxWaterLevel - minWaterLevel, 1) : 50,
            step: hasWaterLevelRange ? Math.max((maxWaterLevel - minWaterLevel) / 1000, 0.01) : 0.5,
            value: fluidParams.floodSpeed ?? (hasWaterLevelRange ? (maxWaterLevel - minWaterLevel) / 10 : 5),
            displayValue: (() => {
                const rangeSpan = maxWaterLevel - minWaterLevel;
                const speed = fluidParams.floodSpeed ?? (hasWaterLevelRange ? rangeSpan / 10 : 5);
                const duration = hasWaterLevelRange && speed > 0 ? rangeSpan / speed : 0;
                return hasWaterLevelRange
                    ? `${Number(speed).toFixed(1)} m/s（${duration.toFixed(1)}s）`
                    : '先捕捉';
            })(),
            disabled: !hasWaterLevelRange || !!fluidState.floodSimActive,
            tooltip: '洪水模拟水位上涨速度。默认值域÷10（10s 完成），可自定义。范围：100s ~ 1s 完成。',
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

// ============================================================
// 大气系统控件
// ============================================================

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
// 体积云独立控件（cesium-clouds-atmosphere 参数子集）
// ============================================================

/**
 * 构建体积云工具面板控件。
 * @param {Record<string, unknown>} params
 * @param {boolean} disabled - 总开关关闭时子项禁用
 * @returns {Array<object>}
 */
function createCloudControls(params = {}, disabled) {
    const off = disabled || !params.cloudsEnabled;
    return [
        {
            id: 'cloudsEnabled',
            label: '启用体积云·大气',
            type: 'toggle',
            value: params.cloudsEnabled === true,
            tooltip: '懒加载 Bruneton 大气 + 体积云 raymarch；默认「流畅」档，首次开启会加载约 29MB 纹理/LUT',
        },
        {
            id: 'quality',
            label: '性能预设',
            type: 'select',
            value: params.quality ?? DEFAULT_CLOUD_QUALITY,
            options: getCloudQualityOptions(),
            disabled: off,
            tooltip: '流畅=仅云；均衡=云+轻 BSM/光晕；极致=全效果高采样',
        },
        {
            id: 'layer0Coverage',
            label: '低云覆盖',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.layer0Coverage ?? 0.3,
            displayValue: `${Math.round((params.layer0Coverage ?? 0.3) * 100)}%`,
            disabled: off,
        },
        {
            id: 'layer0Altitude',
            label: '低云底高',
            type: 'range',
            min: 0,
            max: 8000,
            step: 50,
            value: params.layer0Altitude ?? 1800,
            displayValue: `${Math.round(params.layer0Altitude ?? 1800)} m`,
            disabled: off,
        },
        {
            id: 'layer0Height',
            label: '低云厚度',
            type: 'range',
            min: 50,
            max: 5000,
            step: 50,
            value: params.layer0Height ?? 650,
            displayValue: `${Math.round(params.layer0Height ?? 650)} m`,
            disabled: off,
        },
        {
            id: 'layer1Coverage',
            label: '中云覆盖',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.layer1Coverage ?? 0.3,
            displayValue: `${Math.round((params.layer1Coverage ?? 0.3) * 100)}%`,
            disabled: off,
        },
        {
            id: 'layer1Altitude',
            label: '中云底高',
            type: 'range',
            min: 0,
            max: 12000,
            step: 50,
            value: params.layer1Altitude ?? 2400,
            displayValue: `${Math.round(params.layer1Altitude ?? 2400)} m`,
            disabled: off,
        },
        {
            id: 'layer1Height',
            label: '中云厚度',
            type: 'range',
            min: 50,
            max: 6000,
            step: 50,
            value: params.layer1Height ?? 1200,
            displayValue: `${Math.round(params.layer1Height ?? 1200)} m`,
            disabled: off,
        },
        {
            id: 'layer2Coverage',
            label: '高云覆盖',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.layer2Coverage ?? 0.3,
            displayValue: `${Math.round((params.layer2Coverage ?? 0.3) * 100)}%`,
            disabled: off,
        },
        {
            id: 'layer2Altitude',
            label: '高云底高',
            type: 'range',
            min: 2000,
            max: 16000,
            step: 100,
            value: params.layer2Altitude ?? 7500,
            displayValue: `${Math.round(params.layer2Altitude ?? 7500)} m`,
            disabled: off,
        },
        {
            id: 'layer2Height',
            label: '高云厚度',
            type: 'range',
            min: 50,
            max: 4000,
            step: 50,
            value: params.layer2Height ?? 500,
            displayValue: `${Math.round(params.layer2Height ?? 500)} m`,
            disabled: off,
        },
        {
            id: 'sunIntensity',
            label: '太阳强度',
            type: 'range',
            min: 0,
            max: 150,
            step: 1,
            value: params.sunIntensity ?? 20,
            displayValue: Number(params.sunIntensity ?? 20).toFixed(0),
            disabled: off,
        },
        {
            id: 'cloudExposure',
            label: '云曝光',
            type: 'range',
            min: 0.1,
            max: 8,
            step: 0.1,
            value: params.cloudExposure ?? 3.0,
            displayValue: Number(params.cloudExposure ?? 3.0).toFixed(1),
            disabled: off,
            tooltip: '只影响云颜色，不影响底图',
        },
        {
            id: 'skyToSunRatio',
            label: '天空/太阳比',
            type: 'range',
            min: 0.05,
            max: 0.6,
            step: 0.01,
            value: params.skyToSunRatio ?? 0.28,
            displayValue: Number(params.skyToSunRatio ?? 0.28).toFixed(2),
            disabled: off,
        },
        {
            id: 'aerialPerspectiveScale',
            label: '大气透视',
            type: 'range',
            min: 0,
            max: 3,
            step: 0.1,
            value: params.aerialPerspectiveScale ?? 0.0,
            displayValue: Number(params.aerialPerspectiveScale ?? 0.0).toFixed(1),
            disabled: off,
            tooltip: 'Aerial 阶段近距离散射；过高会让底图过曝涂白',
        },
        {
            id: 'atmosphereExposureDay',
            label: '大气曝光(白天)',
            type: 'range',
            min: 0.1,
            max: 3,
            step: 0.05,
            value: params.atmosphereExposureDay ?? 1.0,
            displayValue: Number(params.atmosphereExposureDay ?? 1.0).toFixed(2),
            disabled: off,
            tooltip: '乘到所有像素（含底图）；>1 会让底图偏白',
        },
        {
            id: 'atmosphereExposureNight',
            label: '大气曝光(夜晚)',
            type: 'range',
            min: 0.0,
            max: 1.5,
            step: 0.05,
            value: params.atmosphereExposureNight ?? 0.1,
            displayValue: Number(params.atmosphereExposureNight ?? 0.1).toFixed(2),
            disabled: off,
        },
        {
            id: 'atmosphereExposureManual',
            label: '大气曝光(手动)',
            type: 'range',
            min: 0.1,
            max: 5,
            step: 0.05,
            value: params.atmosphereExposureManual ?? 1.0,
            displayValue: Number(params.atmosphereExposureManual ?? 1.0).toFixed(2),
            disabled: off || params.atmosphereExposureFollowTimeline !== false,
            tooltip: '关闭「曝光随时间轴」后生效',
        },
        {
            id: 'atmosphereExposureFollowTimeline',
            label: '曝光随时间轴',
            type: 'toggle',
            value: params.atmosphereExposureFollowTimeline !== false,
            disabled: off,
        },
        {
            id: 'atmosphereStageEnabled',
            label: 'Bruneton 天空',
            type: 'toggle',
            value: params.atmosphereStageEnabled !== false,
            disabled: off,
            tooltip: '关闭后只保留体积云 stage，天空回退为透传场景色',
        },
        {
            id: 'aerialStageEnabled',
            label: '空中透视 stage',
            type: 'toggle',
            value: params.aerialStageEnabled !== false,
            disabled: off,
            tooltip: '链末端 ACES/几何透视；流畅档默认关闭以省 GPU',
        },
        {
            id: 'windSpeed',
            label: '风速',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.0001,
            value: params.windSpeed ?? 0,
            displayValue: Number(params.windSpeed ?? 0).toFixed(4),
            disabled: off,
        },
        {
            id: 'evolutionSpeed',
            label: '云演化速度',
            type: 'range',
            min: 0,
            max: 0.02,
            step: 0.0005,
            value: params.evolutionSpeed ?? 0.005,
            displayValue: Number(params.evolutionSpeed ?? 0.005).toFixed(4),
            disabled: off,
        },
        {
            id: 'maxSteps',
            label: '主采样步数',
            type: 'range',
            min: 64,
            max: 1000,
            step: 1,
            value: params.maxSteps ?? 500,
            displayValue: String(Math.round(params.maxSteps ?? 500)),
            disabled: off,
            tooltip: '越大越清晰但越耗 GPU（流畅约 140 / 均衡约 280 / 极致 500）',
        },
        {
            id: 'multiScatteringOctaves',
            label: '多散射阶数',
            type: 'range',
            min: 1,
            max: 12,
            step: 1,
            value: params.multiScatteringOctaves ?? 8,
            displayValue: String(Math.round(params.multiScatteringOctaves ?? 8)),
            disabled: off,
        },
        {
            id: 'useShadowBuffer',
            label: 'BSM 云阴影',
            type: 'toggle',
            value: params.useShadowBuffer !== false,
            disabled: off,
            tooltip: 'Beer Shadow Map：云对地面投影（流畅档关闭）',
        },
        {
            id: 'shadowLengthEnabled',
            label: '丁达尔光柱',
            type: 'toggle',
            value: params.shadowLengthEnabled !== false,
            disabled: off,
            tooltip: '阴影长度采样（流畅档关闭）',
        },
        {
            id: 'bsmGroundScale',
            label: '地面阴影强度',
            type: 'range',
            min: 0.1,
            max: 10,
            step: 0.1,
            value: params.bsmGroundScale ?? 0.3,
            displayValue: Number(params.bsmGroundScale ?? 0.3).toFixed(1),
            disabled: off || params.useShadowBuffer === false,
        },
        {
            id: 'bsmTyndallScale',
            label: '光柱强度',
            type: 'range',
            min: 0.1,
            max: 10,
            step: 0.1,
            value: params.bsmTyndallScale ?? 1.0,
            displayValue: Number(params.bsmTyndallScale ?? 1.0).toFixed(1),
            disabled: off || params.shadowLengthEnabled === false,
        },
        {
            id: 'shadowFar',
            label: '阴影覆盖距离',
            type: 'range',
            min: 10000,
            max: 200000,
            step: 1000,
            value: params.shadowFar ?? 40000,
            displayValue: `${Math.round((params.shadowFar ?? 40000) / 1000)} km`,
            disabled: off || params.useShadowBuffer === false,
        },
        {
            id: 'hazeEnabled',
            label: '雾霾',
            type: 'toggle',
            value: params.hazeEnabled === true,
            disabled: off,
        },
        {
            id: 'temporalEnabled',
            label: 'TAA 时序滤波',
            type: 'toggle',
            value: params.temporalEnabled === true,
            disabled: off,
            tooltip: '原生 WebGL PBO 时序抗锯齿，可能与部分 GPU 驱动不兼容',
        },
        {
            id: 'lensFlareEnabled',
            label: '镜头光晕',
            type: 'toggle',
            value: params.lensFlareEnabled !== false,
            disabled: off,
            tooltip: '流畅档默认关闭',
        },
        {
            id: 'bloomIntensity',
            label: '光晕 Bloom',
            type: 'range',
            min: 0,
            max: 3,
            step: 0.05,
            value: params.bloomIntensity ?? 0.6,
            displayValue: Number(params.bloomIntensity ?? 0.6).toFixed(2),
            disabled: off || params.lensFlareEnabled === false,
        },
        {
            id: 'ghostIntensity',
            label: '鬼影强度',
            type: 'range',
            min: 0,
            max: 3,
            step: 0.05,
            value: params.ghostIntensity ?? 1.1,
            displayValue: Number(params.ghostIntensity ?? 1.1).toFixed(2),
            disabled: off || params.lensFlareEnabled === false,
        },
        {
            id: 'haloIntensity',
            label: 'Halo 强度',
            type: 'range',
            min: 0,
            max: 2,
            step: 0.05,
            value: params.haloIntensity ?? 0.2,
            displayValue: Number(params.haloIntensity ?? 0.2).toFixed(2),
            disabled: off || params.lensFlareEnabled === false,
        },
    ];
}

/**
 * 模块卡片状态文案：流畅 / 均衡 / 极致。
 * @param {string | undefined} quality
 * @returns {string}
 */
function qualityStatusLabel(quality) {
    if (quality === 'balanced') return '均衡';
    if (quality === 'ultra') return '极致';
    return '流畅';
}

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
