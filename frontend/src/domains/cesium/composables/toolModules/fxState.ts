/**
 * 特效与仿真参数状态（大气 / 云 / 流体 / 浅水 / 人物漫游）
 *
 * 从 useCesiumToolModules 拆出：参数默认值、互斥规则（体积云 ↔ 原生地面大气）、
 * 控件写回与运行时同步都在这里；不涉及模块清单与面板动作分发。
 */

import { ref } from 'vue';
import {
    applyCloudQualityPreset,
    DEFAULT_CLOUD_QUALITY,
} from '../../modules/cloud/cloudQualityPresets';
import { toFiniteNumberOrNull } from './controlsUtils';

export interface FxStateDeps {
    /** 流体面板实例（洪水速度双向同步） */
    fluidPanelRef?: { value: any } | null;
    /** 人物漫游控制器（参数变化时同步到运行时） */
    playerController?: any;
}

/**
 * 创建特效参数状态与控件写回函数
 * @param deps 依赖注入（见 FxStateDeps）
 */
export function createFxState({ fluidPanelRef = null, playerController = null }: FxStateDeps = {}) {
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
        showGroundAtmosphere: true, // 地面大气 - 开启（默认随高度渐隐联动，可在面板关闭）
        // 地面大气按相机高度自动渐隐：低于下限全关（市/城乡/建筑尺度），高于上限全开（省/国家级视角），中间平滑过渡
        groundAtmosphereAutoFade: true,
        groundAtmosphereFadeLowHeight: 100000,
        groundAtmosphereFadeHighHeight: 500000,
        dynamicAtmosphereLighting: true,
        dynamicAtmosphereLightingFromSun: true,
        atmosphereLightIntensity: 16,
        atmosphereHueShift: 1,
        atmosphereSaturationShift: 1,
        atmosphereBrightnessShift: -0.12,
        // 天空大气（地球外环光晕）：光强按比例放大让渐隐尾部自然延伸（更厚且保持渐变）；
        // 亮度偏移是恒定加亮，过大会把渐隐区抬成均匀色带并在大气壳边界形成硬边；
        // Rayleigh 标高控制蓝色向外衰减的距离，是渐变厚度的物理参数
        skyAtmosphereLightIntensity: 6.5,
        skyAtmosphereBrightnessShift: 0.36,
        skyAtmosphereSaturationShift: 0.1,
        skyAtmosphereRayleighScaleHeight: 20000,
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
                altitudeMode: 'absolute',
            },
            DEFAULT_CLOUD_QUALITY,
        ),
    );

    // ========== 体积云 ↔ 原生地面大气互斥 ==========
    // 两套地面大气模型叠加会在天际线掠射带白屏闪烁：Bruneton Aerial（体积云管线自带）
    // 与 Cesium 原生 globe.showGroundAtmosphere 同时处理同一批地面像素，
    // 后处理天空/地面分类启发式（依赖像素亮度/深度）在双层大气下帧间翻转。
    // 规则：开体积云 → 记录并关闭地面大气；关体积云 → 恢复；开地面大气 → 关闭体积云。
    /** 体积云启用时被关闭前的地面大气状态，供关闭体积云时恢复 */
    let groundAtmosphereStateBeforeCloud: any = null;

    function setGroundAtmosphereEnabled(value: any) {
        baseAtmosphereParams.value = {
            ...baseAtmosphereParams.value,
            showGroundAtmosphere: Boolean(value),
        };
    }

    function handleCloudsEnabledToggle(enabled: any) {
        if (enabled) {
            // 开体积云：记录当前地面大气状态并关闭（互斥）
            groundAtmosphereStateBeforeCloud = baseAtmosphereParams.value.showGroundAtmosphere === true;
            setGroundAtmosphereEnabled(false);
        } else {
            // 关体积云：恢复开启体积云前的地面大气状态
            if (groundAtmosphereStateBeforeCloud !== null) {
                setGroundAtmosphereEnabled(groundAtmosphereStateBeforeCloud);
                groundAtmosphereStateBeforeCloud = null;
            }
        }
    }

    function handleGroundAtmosphereToggle(enabled: any) {
        if (!enabled) return;
        // 开地面大气：关闭体积云（互斥）；无需恢复标记——本次是用户主动切走
        if (cloudParams.value.cloudsEnabled === true) {
            groundAtmosphereStateBeforeCloud = null;
            cloudParams.value = {
                ...cloudParams.value,
                cloudsEnabled: false,
            };
        }
    }

    const fluidParams = ref<{
        threshold: number;
        blend: number;
        lightStrength: number;
        waterColor: string;
        waterLevel: number | null;
        floodSpeed: number;
    }>({
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

    const fluidState = ref<{
        isPicking: boolean;
        hasFluid: boolean;
        selectedText: string;
        waterLevel: number | null;
        waterLevelMin: number | null;
        waterLevelMax: number | null;
        floodSimActive: boolean;
    }>({
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

    /** 流体控件 */
    /** 流体控件 */
    function applyFluidControl(controlId: string, value: any) {
        if (!(controlId in fluidParams.value)) return;
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

    /** 热带浅水控件 */
    /** 热带浅水控件 */
    function applyShallowWaterControl(controlId: string, value: any) {
        if (!(controlId in shallowWaterParams.value)) return;
        shallowWaterParams.value = {
            ...shallowWaterParams.value,
            [controlId]: controlId === 'waterColor' || controlId === 'lightningEnabled'
                ? value
                : Number(value),
        };
        return;
    }

    /** 人物漫游控件（参数写回 + 运行时同步；spawnHeight 是启动前参数） */
    /** 人物漫游控件（参数写回 + 运行时同步；spawnHeight 是启动前参数） */
    function applyPlayerControl(controlId: string, value: any) {
        if (!(controlId in playerParams.value)) return;
        const numVal = Number(value);
        playerParams.value = { ...playerParams.value, [controlId]: numVal };
        // spawnHeight 是启动前参数，无需同步到运行时
        if (controlId === 'spawnHeight') return;
        const p = playerController?.getPlayerInstance?.();
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

    /** 大气模块（高级特效开关 / 原生基础参数 / Tellux 增强三组共用一个 moduleId） */
    /** 大气模块（高级特效开关 / 原生基础参数 / Tellux 增强三组共用一个 moduleId） */
    function applyAtmosphereControl(controlId: string, value: any) {
        // 高级特效开关（fog/hbao/tiltShift/atmosphere）
        if (controlId in advancedEffectControls.value) {
            // Tellux 大气增强（Atmosphere + Bloom）会在高空直写 globe.showGroundAtmosphere = true，
            // 等效开启原生地面大气 → 纳入同一互斥：开它则先关体积云
            if (controlId === 'atmosphere' && Boolean(value)) {
                handleGroundAtmosphereToggle(true);
            }
            advancedEffectControls.value = {
                ...advancedEffectControls.value,
                [controlId]: Boolean(value),
            };
            return;
        }

        // 基础大气参数（Cesium 原生）
        if (controlId in baseAtmosphereParams.value) {
            // 互斥：手动开地面大气时先关掉体积云，再写入开关值
            if (controlId === 'showGroundAtmosphere') {
                handleGroundAtmosphereToggle(Boolean(value));
            }
            baseAtmosphereParams.value = {
                ...baseAtmosphereParams.value,
                [controlId]: value,
            };
            return;
        }

        // Tellux 大气渲染参数（开启后等效硬写 globe.showGroundAtmosphere = true，纳入互斥）
        if (controlId === 'atmosphereEnabled') {
            if (value) {
                handleGroundAtmosphereToggle(true);
            }
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

    /** 体积云模块（布尔开关 / 数值滑杆 / 性能预设） */
    /** 体积云模块（布尔开关 / 数值滑杆 / 性能预设） */
    function applyCloudControl(controlId: string, value: any) {
        // 性能预设：一键覆盖参数组合（保留 cloudsEnabled）
        if (controlId === 'quality') {
            cloudParams.value = applyCloudQualityPreset(cloudParams.value, value);
            return;
        }
        // 总开关互斥：开体积云 → 记录并关地面大气；关体积云 → 恢复地面大气
        if (controlId === 'cloudsEnabled') {
            handleCloudsEnabledToggle(Boolean(value));
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
            // 字符串枚举键（select 控件），不能走 Number() 转换
            const stringKeys = new Set(['altitudeMode']);
            cloudParams.value = {
                ...cloudParams.value,
                [controlId]: booleanKeys.has(controlId)
                    ? Boolean(value)
                    : stringKeys.has(controlId)
                        ? String(value)
                        : Number(value),
            };
        }
    }

    function handleFluidStateChange(state: any) {
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
    return {
        advancedEffectControls,
        baseAtmosphereParams,
        atmosphereParams,
        cloudParams,
        fluidParams,
        fluidState,
        playerParams,
        shallowWaterVisible,
        shallowWaterParams,
        applyAtmosphereControl,
        applyCloudControl,
        applyFluidControl,
        applyShallowWaterControl,
        applyPlayerControl,
        handleFluidStateChange,
    };
}
