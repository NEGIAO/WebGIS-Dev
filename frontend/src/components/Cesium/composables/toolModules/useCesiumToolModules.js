import { computed, ref, watch } from 'vue';
import { readStoredBoolean, writeStoredBoolean } from '../core/cesiumStorage';
import {
    applyCloudQualityPreset,
    DEFAULT_CLOUD_QUALITY,
} from '../../Cloud/cloudQualityPresets.js';
import { toFiniteNumberOrNull } from './controlsUtils';
import { createSceneModule } from './sceneModule';
import { createAtmosphereModule } from './atmosphereModule';
import { createCloudModule } from './cloudModule';
import { createToolsModule } from './toolsModule';
import { createWindModule } from './windModule';
import { createFluidModule } from './fluidModule';
import { createShallowWaterModule } from './shallowWaterModule';
import { createPlayerModule } from './playerModule';

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

    // ========== 工具模块定义（使用模块化工厂函数，聚合同类功能） ==========
    const toolModules = computed(() => [
        createSceneModule(),
        createAtmosphereModule(advancedEffectControls, baseAtmosphereParams, atmosphereParams),
        createCloudModule(cloudParams),
        createToolsModule(_modelManager, _cameraEnhanced),
        createWindModule(wind),
        createFluidModule(fluidParams, fluidState),
        createShallowWaterModule(shallowWaterVisible, shallowWaterParams),
        createPlayerModule(playerParams, _playerController),
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
        // 风场控件（面板参数名 → 引擎参数名映射）
        if (moduleId === 'wind') {
            // windEnabled 开关→启动/关闭
            if (controlId === 'windEnabled') {
                if (value) {
                    wind.loadSimulatedWind?.();
                } else {
                    wind.clearWind2D?.();
                }
                return;
            }
            // 参数名映射表
            const paramMap = {
                windSpeed: 'speedFactor',
                lineWidth: 'arrowLength',
                colorScale: 'colorScale',
                opacity: 'alphaFactor',
                particleCount: 'particleCount',
                maxAge: 'maxAge',
                frameRate: 'frameRate',
                wind2DEnabled: 'wind2DEnabled',
            };
            const engineId = paramMap[controlId];
            if (engineId && engineId in (wind.windParams?.value || {})) {
                wind.setWindParam?.(engineId, value);
            }
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