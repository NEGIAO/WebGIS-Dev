/**
 * shallowWaterModule.js
 * 热带浅水模块定义
 * Three.js 热带浅水场景（焦散/折射/物理吸色/体积云/闪电）
 * 模块元数据 + 控件定义合并为一个文件
 */

import { translate as t } from '@/composables/useLocale';

/**
 * 创建热带浅水模块
 * @param {import('vue').Ref} shallowWaterVisible - 是否可见 ref
 * @param {import('vue').Ref} shallowWaterParams - 浅水参数 ref
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, actions: Array, controls: Array }}
 */
export function createShallowWaterModule(shallowWaterVisible, shallowWaterParams) {
    const visible = shallowWaterVisible.value;
    const params = shallowWaterParams.value;

    return {
        id: 'shallowWater',
        title: t('cesium.module.shallowWater.title'),
        description: t('cesium.module.shallowWater.description'),
        status: visible ? t('cesium.status.enabled') : t('cesium.status.disabled'),
        statusTone: visible ? 'success' : 'neutral',
        actions: [
            { id: 'toggle', label: visible ? t('cesium.module.shallowWater.toggleOff') : t('cesium.module.shallowWater.toggleOn'), variant: visible ? 'danger' : 'primary' },
        ],
        controls: createShallowWaterControls(params, !visible),
    };
}

/**
 * 构建热带浅水控件列表
 * @param {Record<string, any>} params - 当前浅水参数
 * @param {boolean} disabled - 是否禁用
 * @returns {Array<object>}
 */
function createShallowWaterControls(params = {}, disabled = false) {
    return [
        {
            id: 'elevation',
            label: t('cesium.module.shallowWater.elevation'),
            type: 'range',
            min: 2,
            max: 80,
            step: 0.1,
            value: params.elevation ?? 30,
            displayValue: Number(params.elevation ?? 30).toFixed(1),
            disabled,
            tooltip: t('cesium.module.shallowWater.elevationTip'),
        },
        {
            id: 'azimuth',
            label: t('cesium.module.shallowWater.azimuth'),
            type: 'range',
            min: -180,
            max: 180,
            step: 0.1,
            value: params.azimuth ?? 150,
            displayValue: Number(params.azimuth ?? 150).toFixed(1),
            disabled,
            tooltip: t('cesium.module.shallowWater.azimuthTip'),
        },
        {
            id: 'clarity',
            label: t('cesium.module.shallowWater.clarity'),
            type: 'range',
            min: 0.03,
            max: 0.4,
            step: 0.005,
            value: params.clarity ?? 0.085,
            displayValue: Number(params.clarity ?? 0.085).toFixed(3),
            tooltip: t('cesium.module.shallowWater.clarityTip'),
            disabled,
        },
        {
            id: 'causticStrength',
            label: t('cesium.module.shallowWater.causticStrength'),
            type: 'range',
            min: 0,
            max: 2,
            step: 0.05,
            value: params.causticStrength ?? 0.9,
            displayValue: Number(params.causticStrength ?? 0.9).toFixed(2),
            disabled,
            tooltip: t('cesium.module.shallowWater.causticStrengthTip'),
        },
        {
            id: 'waveHeight',
            label: t('cesium.module.shallowWater.waveHeight'),
            type: 'range',
            min: 0,
            max: 1.5,
            step: 0.05,
            value: params.waveHeight ?? 0.5,
            displayValue: Number(params.waveHeight ?? 0.5).toFixed(2),
            disabled,
            tooltip: t('cesium.module.shallowWater.waveHeightTip'),
        },
        {
            id: 'foamWidth',
            label: t('cesium.module.shallowWater.foamWidth'),
            type: 'range',
            min: 0,
            max: 8,
            step: 0.1,
            value: params.foamWidth ?? 2.4,
            displayValue: Number(params.foamWidth ?? 2.4).toFixed(1),
            disabled,
            tooltip: t('cesium.module.shallowWater.foamWidthTip'),
        },
        {
            id: 'reflection',
            label: t('cesium.module.shallowWater.reflection'),
            type: 'range',
            min: 0,
            max: 1,
            step: 0.02,
            value: params.reflection ?? 0.38,
            displayValue: Number(params.reflection ?? 0.38).toFixed(2),
            disabled,
            tooltip: t('cesium.module.shallowWater.reflectionTip'),
        },
        {
            id: 'waterColor',
            label: t('cesium.module.shallowWater.waterColor'),
            type: 'color',
            value: params.waterColor ?? '#2bb3c4',
            disabled,
            tooltip: t('cesium.module.shallowWater.waterColorTip'),
        },
        {
            id: 'cloudCoverage',
            label: t('cesium.module.shallowWater.cloudCoverage'),
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.cloudCoverage ?? 0.58,
            displayValue: Number(params.cloudCoverage ?? 0.58).toFixed(2),
            disabled,
            tooltip: t('cesium.module.shallowWater.cloudCoverageTip'),
        },
        {
            id: 'lightningEnabled',
            label: t('cesium.module.shallowWater.lightningEnabled'),
            type: 'toggle',
            value: params.lightningEnabled !== false,
            disabled,
            tooltip: t('cesium.module.shallowWater.lightningEnabledTip'),
        },
        {
            id: 'lightningInterval',
            label: t('cesium.module.shallowWater.lightningInterval'),
            type: 'range',
            min: 0.4,
            max: 8,
            step: 0.1,
            value: params.lightningInterval ?? 2.0,
            displayValue: Number(params.lightningInterval ?? 2.0).toFixed(1),
            disabled: disabled || params.lightningEnabled === false,
            tooltip: t('cesium.module.shallowWater.lightningIntervalTip'),
        },
    ];
}