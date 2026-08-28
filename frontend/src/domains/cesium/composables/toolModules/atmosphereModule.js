/**
 * atmosphereModule.js
 * 大气·光照·天空模块定义
 * 聚合 Cesium 原生光照 + Tellux 增强大气 + 高级后效
 * 模块元数据 + 控件定义合并为一个文件
 */

import { translate as t } from '@common/app/useLocale';

/**
 * 创建大气光照模块
 * @param {import('vue').Ref} advancedEffectControls - 高级特效开关 ref（fog/hbao/tiltShift/atmosphere）
 * @param {import('vue').Ref} baseAtmosphereParams - 基础大气参数 ref
 * @param {import('vue').Ref} atmosphereParams - Tellux 大气参数 ref
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, controls: Array }}
 */
export function createAtmosphereModule(advancedEffectControls, baseAtmosphereParams, atmosphereParams) {
    const adv = advancedEffectControls.value;
    const base = baseAtmosphereParams.value;
    const atmos = atmosphereParams.value;

    const status = adv.atmosphere || adv.fog || adv.hbao
        ? t('cesium.status.partial')
        : t('cesium.status.terminatorOnly');
    const statusTone = adv.atmosphere ? 'success' : 'neutral';

    return {
        id: 'atmosphere',
        title: t('cesium.module.atmosphere.title'),
        description: t('cesium.module.atmosphere.description'),
        status,
        statusTone,
        controls: [
            // --- Cesium 原生基础 ---
            ...createBaseAtmosphereControls(base),
            { id: 'fog', label: t('cesium.module.atmosphere.fog'), type: 'toggle', value: adv.fog, tooltip: t('cesium.module.atmosphere.fogTip') },
            { id: 'hbao', label: t('cesium.module.atmosphere.hbao'), type: 'toggle', value: adv.hbao, tooltip: t('cesium.module.atmosphere.hbaoTip') },
            { id: 'tiltShift', label: t('cesium.module.atmosphere.tiltShift'), type: 'toggle', value: adv.tiltShift, tooltip: t('cesium.module.atmosphere.tiltShiftTip') },
            { id: 'atmosphere', label: t('cesium.module.atmosphere.atmosphere'), type: 'toggle', value: adv.atmosphere, tooltip: t('cesium.module.atmosphere.atmosphereTip') },
            ...createAtmosphereControls(atmos, !adv.atmosphere),
        ],
    };
}

/**
 * 构建 Tellux 大气系统控件列表
 * @param {Record<string, any>} params - 当前大气参数
 * @param {boolean} disabled - 是否禁用
 * @returns {Array<object>}
 */
function createAtmosphereControls(params = {}, disabled) {
    return [
        {
            id: 'atmosphereEnabled',
            label: t('cesium.module.atmosphere.atmosphereEnabled'),
            type: 'toggle',
            value: !disabled,
            tooltip: t('cesium.module.atmosphere.atmosphereEnabledTip'),
        },
        {
            id: 'dayNightEnabled',
            label: t('cesium.module.atmosphere.dayNightEnabled'),
            type: 'toggle',
            value: params.dayNightEnabled !== false,
            disabled,
            tooltip: t('cesium.module.atmosphere.dayNightEnabledTip'),
        },
        {
            id: 'moonLightEnabled',
            label: t('cesium.module.atmosphere.moonLightEnabled'),
            type: 'toggle',
            value: params.moonLightEnabled !== false,
            disabled,
            tooltip: t('cesium.module.atmosphere.moonLightEnabledTip'),
        },
        {
            id: 'moonLightIntensity',
            label: t('cesium.module.atmosphere.moonLightIntensity'),
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.moonLightIntensity ?? 0.18,
            displayValue: Number(params.moonLightIntensity ?? 0.18).toFixed(2),
            disabled: disabled || !params.moonLightEnabled,
            tooltip: t('cesium.module.atmosphere.moonLightIntensityTip'),
        },
        {
            id: 'ambientIntensity',
            label: t('cesium.module.atmosphere.ambientIntensity'),
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.ambientIntensity ?? 0.08,
            displayValue: Number(params.ambientIntensity ?? 0.08).toFixed(2),
            disabled: disabled || !params.moonLightEnabled,
            tooltip: t('cesium.module.atmosphere.ambientIntensityTip'),
        },
        {
            id: 'starsEnabled',
            label: t('cesium.module.atmosphere.starsEnabled'),
            type: 'toggle',
            value: params.starsEnabled !== false,
            disabled,
            tooltip: t('cesium.module.atmosphere.starsEnabledTip'),
        },
        {
            id: 'starsIntensity',
            label: t('cesium.module.atmosphere.starsIntensity'),
            type: 'range',
            min: 0,
            max: 5,
            step: 0.1,
            value: params.starsIntensity ?? 1.0,
            displayValue: Number(params.starsIntensity ?? 1.0).toFixed(1),
            disabled: disabled || !params.starsEnabled,
            tooltip: t('cesium.module.atmosphere.starsIntensityTip'),
        },
    ];
}

/**
 * 构建 Cesium 原生基础大气控件列表（日照、雾、太阳/月亮/星空盒）
 * @param {Record<string, any>} params - 当前大气参数
 * @returns {Array<object>}
 */
function createBaseAtmosphereControls(params = {}) {
    return [
        {
            id: 'enableLighting',
            label: t('cesium.module.atmosphere.enableLighting'),
            type: 'toggle',
            value: params.enableLighting !== false,
            tooltip: t('cesium.module.atmosphere.enableLightingTip'),
        },
        {
            id: 'showGroundAtmosphere',
            label: t('cesium.module.atmosphere.showGroundAtmosphere'),
            type: 'toggle',
            value: params.showGroundAtmosphere !== false,
            tooltip: t('cesium.module.atmosphere.showGroundAtmosphereTip'),
        },
        {
            id: 'groundAtmosphereAutoFade',
            label: t('cesium.module.atmosphere.groundAtmosphereAutoFade'),
            type: 'toggle',
            value: params.groundAtmosphereAutoFade !== false,
            tooltip: t('cesium.module.atmosphere.groundAtmosphereAutoFadeTip'),
        },
        {
            id: 'groundAtmosphereFadeLowHeight',
            label: t('cesium.module.atmosphere.groundAtmosphereFadeLowHeight'),
            type: 'range',
            min: 10000,
            max: 1000000,
            step: 10000,
            value: params.groundAtmosphereFadeLowHeight ?? 100000,
            displayValue: `${(Number(params.groundAtmosphereFadeLowHeight ?? 100000) / 1000).toFixed(0)} km`,
            disabled: params.groundAtmosphereAutoFade === false,
            tooltip: t('cesium.module.atmosphere.groundAtmosphereFadeLowHeightTip'),
        },
        {
            id: 'groundAtmosphereFadeHighHeight',
            label: t('cesium.module.atmosphere.groundAtmosphereFadeHighHeight'),
            type: 'range',
            min: 50000,
            max: 2000000,
            step: 10000,
            value: params.groundAtmosphereFadeHighHeight ?? 500000,
            displayValue: `${(Number(params.groundAtmosphereFadeHighHeight ?? 500000) / 1000).toFixed(0)} km`,
            disabled: params.groundAtmosphereAutoFade === false,
            tooltip: t('cesium.module.atmosphere.groundAtmosphereFadeHighHeightTip'),
        },
        {
            id: 'dynamicAtmosphereLighting',
            label: t('cesium.module.atmosphere.dynamicAtmosphereLighting'),
            type: 'toggle',
            value: params.dynamicAtmosphereLighting !== false,
            tooltip: t('cesium.module.atmosphere.dynamicAtmosphereLightingTip'),
        },
        {
            id: 'atmosphereLightIntensity',
            label: t('cesium.module.atmosphere.atmosphereLightIntensity'),
            type: 'range',
            min: 0,
            max: 25,
            step: 0.5,
            value: params.atmosphereLightIntensity ?? 5.5,
            displayValue: Number(params.atmosphereLightIntensity ?? 5.5).toFixed(1),
            tooltip: t('cesium.module.atmosphere.atmosphereLightIntensityTip'),
        },
        {
            id: 'atmosphereHueShift',
            label: t('cesium.module.atmosphere.atmosphereHueShift'),
            type: 'range',
            min: -1,
            max: 1,
            step: 0.01,
            value: params.atmosphereHueShift ?? -0.015,
            displayValue: Number(params.atmosphereHueShift ?? -0.015).toFixed(2),
            tooltip: t('cesium.module.atmosphere.atmosphereHueShiftTip'),
        },
        {
            id: 'atmosphereSaturationShift',
            label: t('cesium.module.atmosphere.atmosphereSaturationShift'),
            type: 'range',
            min: -1,
            max: 1,
            step: 0.01,
            value: params.atmosphereSaturationShift ?? 0.08,
            displayValue: Number(params.atmosphereSaturationShift ?? 0.08).toFixed(2),
            tooltip: t('cesium.module.atmosphere.atmosphereSaturationShiftTip'),
        },
        {
            id: 'atmosphereBrightnessShift',
            label: t('cesium.module.atmosphere.atmosphereBrightnessShift'),
            type: 'range',
            min: -1,
            max: 1,
            step: 0.01,
            value: params.atmosphereBrightnessShift ?? 0.02,
            displayValue: Number(params.atmosphereBrightnessShift ?? 0.02).toFixed(2),
            tooltip: t('cesium.module.atmosphere.atmosphereBrightnessShiftTip'),
        },
        {
            id: 'skyAtmosphereLightIntensity',
            label: t('cesium.module.atmosphere.skyAtmosphereLightIntensity'),
            type: 'range',
            min: 0,
            // Cesium 1.121+ 引擎默认值为 50，滑杆上限需覆盖默认值区间（原 30 低于引擎默认，向上调节无效）
            max: 100,
            step: 0.5,
            value: params.skyAtmosphereLightIntensity ?? 20,
            displayValue: Number(params.skyAtmosphereLightIntensity ?? 20).toFixed(1),
            tooltip: t('cesium.module.atmosphere.skyAtmosphereLightIntensityTip'),
        },
        {
            id: 'skyAtmosphereRayleighScaleHeight',
            label: t('cesium.module.atmosphere.skyAtmosphereRayleighScaleHeight'),
            type: 'range',
            min: 2000,
            max: 50000,
            step: 500,
            value: params.skyAtmosphereRayleighScaleHeight ?? 10000,
            displayValue: `${Number(params.skyAtmosphereRayleighScaleHeight ?? 10000).toFixed(0)} m`,
            tooltip: t('cesium.module.atmosphere.skyAtmosphereRayleighScaleHeightTip'),
        },
        {
            id: 'skyAtmosphereBrightnessShift',
            label: t('cesium.module.atmosphere.skyAtmosphereBrightnessShift'),
            type: 'range',
            min: -1,
            max: 1,
            step: 0.01,
            value: params.skyAtmosphereBrightnessShift ?? 0.03,
            displayValue: Number(params.skyAtmosphereBrightnessShift ?? 0.03).toFixed(2),
            tooltip: t('cesium.module.atmosphere.skyAtmosphereBrightnessShiftTip'),
        },
        {
            id: 'skyAtmosphereSaturationShift',
            label: t('cesium.module.atmosphere.skyAtmosphereSaturationShift'),
            type: 'range',
            min: -1,
            max: 1,
            step: 0.01,
            value: params.skyAtmosphereSaturationShift ?? 0.08,
            displayValue: Number(params.skyAtmosphereSaturationShift ?? 0.08).toFixed(2),
            tooltip: t('cesium.module.atmosphere.skyAtmosphereSaturationShiftTip'),
        },
        {
            id: 'fogEnabled',
            label: t('cesium.module.atmosphere.fogEnabled'),
            type: 'toggle',
            value: params.fogEnabled !== false,
            tooltip: t('cesium.module.atmosphere.fogEnabledTip'),
        },
        {
            id: 'fogDensity',
            label: t('cesium.module.atmosphere.fogDensity'),
            type: 'range',
            min: 0.00001,
            max: 0.001,
            step: 0.00001,
            value: params.fogDensity ?? 0.00012,
            displayValue: Number(params.fogDensity ?? 0.00012).toFixed(5),
            disabled: !params.fogEnabled,
            tooltip: t('cesium.module.atmosphere.fogDensityTip'),
        },
        {
            id: 'sunShow',
            label: t('cesium.module.atmosphere.sunShow'),
            type: 'toggle',
            value: params.sunShow !== false,
            tooltip: t('cesium.module.atmosphere.sunShowTip'),
        },
        {
            id: 'moonShow',
            label: t('cesium.module.atmosphere.moonShow'),
            type: 'toggle',
            value: params.moonShow !== false,
            tooltip: t('cesium.module.atmosphere.moonShowTip'),
        },
        {
            id: 'skyBoxShow',
            label: t('cesium.module.atmosphere.skyBoxShow'),
            type: 'toggle',
            value: params.skyBoxShow !== false,
            tooltip: t('cesium.module.atmosphere.skyBoxShowTip'),
        },
    ];
}