/**
 * useVolumetricClouds - 体积云参数与控件定义
 *
 * 从 useCesiumToolModules.js 拆分而来，负责：
 * - 体积云参数状态（cloudParams）
 * - 质量预设（QUALITY_PRESETS）
 * - UI 控件定义（createCloudControls）
 * - 控件 ID 判断（isCloudControlId）
 * - 参数归一化（normalizeCloudParams）
 * - 控件变更处理（handleCloudControlChange）
 */
import { ref } from 'vue';

/** 云层质量预设 */
export const QUALITY_PRESETS = {
    low: { stepCount: 32, maxDistance: 200000, label: '低' },
    medium: { stepCount: 48, maxDistance: 360000, label: '中' },
    high: { stepCount: 64, maxDistance: 500000, label: '高' },
    ultra: { stepCount: 80, maxDistance: 700000, label: '超高' },
};

/** 体积云相关控件 ID 列表 */
const CLOUD_CONTROL_IDS = [
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
];

/**
 * 判断控件 ID 是否属于体积云参数
 * @param {string} controlId
 * @returns {boolean}
 */
export function isCloudControlId(controlId) {
    return CLOUD_CONTROL_IDS.includes(controlId);
}

/**
 * 归一化体积云参数，确保所有值在合法范围内
 * @param {Object} params - 原始参数
 * @returns {Object} 归一化后的参数
 */
export function normalizeCloudParams(params = {}) {
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

/**
 * 创建体积云 composable
 * @returns {{ cloudParams, handleCloudControlChange }}
 */
export function useVolumetricClouds() {
    /** 体积云参数（默认关闭） */
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

    /**
     * 处理体积云控件变更
     * @param {string} controlId - 控件 ID
     * @param {*} value - 新值
     * @returns {boolean} 是否已处理
     */
    function handleCloudControlChange(controlId, value) {
        if (!isCloudControlId(controlId)) return false;

        const nextCloudPatch = controlId === 'cloudQuality'
            ? { quality: value, previousQuality: cloudParams.value.quality }
            : { [controlId]: value };
        cloudParams.value = normalizeCloudParams({
            ...cloudParams.value,
            ...nextCloudPatch,
        });
        return true;
    }

    return {
        cloudParams,
        handleCloudControlChange,
    };
}

/**
 * 生成体积云 UI 控件列表
 * @param {Object} params - 体积云参数
 * @param {boolean} disabled - 是否禁用
 * @returns {Array} lil-gui 控件定义数组
 */
export function createCloudControls(params = {}, disabled) {
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

function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
