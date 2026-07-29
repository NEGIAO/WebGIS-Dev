/**
 * fluidModule.js
 * 水体流体模块定义
 * 点击地形捕捉高度图并生成水体
 * 模块元数据 + 控件定义合并为一个文件
 */

import { toFiniteNumberOrNull, clampNumber, formatElevation } from './controlsUtils';
import { translate as t } from '@common/app/useLocale';

/**
 * 判断当前流体状态是否具有有效的水位范围
 * @param {Record<string, any>} fluidState
 * @returns {boolean}
 */
export function hasFluidWaterLevelRange(fluidState) {
    return toFiniteNumberOrNull(fluidState.waterLevelMin) !== null &&
           toFiniteNumberOrNull(fluidState.waterLevelMax) !== null;
}

/**
 * 创建水体流体模块
 * @param {import('vue').Ref} fluidParams - 流体参数 ref
 * @param {import('vue').Ref} fluidState - 流体状态 ref
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, actions: Array, controls: Array }}
 */
export function createFluidModule(fluidParams, fluidState) {
    const state = fluidState.value;
    const params = fluidParams.value;

    const status = state.isPicking ? t('cesium.status.waitingPick') : state.hasFluid ? t('cesium.status.created') : t('cesium.status.notCreated');
    const statusTone = state.isPicking ? 'warning' : state.hasFluid ? 'success' : 'neutral';

    return {
        id: 'fluid',
        title: t('cesium.module.fluid.title'),
        description: t('cesium.module.fluid.description'),
        status,
        statusTone,
        actions: [
            { id: 'pick', label: state.isPicking ? t('cesium.status.waitingPick') : t('cesium.status.pickHeightMap'), variant: 'primary', active: state.isPicking },
            { id: 'floodSim', label: state.floodSimActive ? t('cesium.status.stopFlood') : t('cesium.status.floodSim'), variant: state.floodSimActive ? 'danger' : 'default', active: state.floodSimActive, disabled: !hasFluidWaterLevelRange(state) },
            { id: 'clear', label: t('cesium.status.clear'), variant: 'danger', disabled: !state.hasFluid && !state.isPicking },
        ],
        controls: createFluidControls(params, state),
    };
}

/**
 * 构建流体模拟工具面板控件列表
 * @param {Record<string, any>} fluidParams - 当前流体参数
 * @param {Record<string, any>} fluidState - 当前流体状态（含水位范围）
 * @returns {Array<object>}
 */
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
            label: t('cesium.module.fluid.threshold'),
            type: 'range',
            min: 0,
            max: 500,
            step: 0.0001,
            value: fluidParams.threshold,
            displayValue: Number(fluidParams.threshold).toFixed(2),
            tooltip: t('cesium.module.fluid.thresholdTip'),
        },
        {
            id: 'blend',
            label: t('cesium.module.fluid.blend'),
            type: 'range',
            min: 0,
            max: 50,
            step: 0.0001,
            value: fluidParams.blend,
            displayValue: Number(fluidParams.blend).toFixed(2),
            tooltip: t('cesium.module.fluid.blendTip'),
        },
        {
            id: 'lightStrength',
            label: t('cesium.module.fluid.lightStrength'),
            type: 'range',
            min: 0,
            max: 10,
            step: 0.0001,
            value: fluidParams.lightStrength,
            displayValue: Number(fluidParams.lightStrength).toFixed(2),
            tooltip: t('cesium.module.fluid.lightStrengthTip'),
        },
        {
            id: 'waterLevel',
            label: t('cesium.module.fluid.waterLevel'),
            type: 'range',
            min: minWaterLevel,
            max: maxWaterLevel,
            step: waterLevelStep,
            value: waterLevel,
            displayValue: hasWaterLevelRange ? `${formatElevation(waterLevel)} m` : t('cesium.status.captureFirst'),
            disabled: !hasWaterLevelRange,
            tooltip: t('cesium.module.fluid.waterLevelTip'),
        },
        {
            id: 'floodSpeed',
            label: t('cesium.module.fluid.floodSpeed'),
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
                    ? t('cesium.status.floodSpeedDisplay', { speed: Number(speed).toFixed(1), duration: duration.toFixed(1) })
                    : t('cesium.status.captureFirst');
            })(),
            disabled: !hasWaterLevelRange || !!fluidState.floodSimActive,
            tooltip: t('cesium.module.fluid.floodSpeedTip'),
        },
        {
            id: 'waterColor',
            label: t('cesium.module.fluid.waterColor'),
            type: 'color',
            value: fluidParams.waterColor,
            tooltip: t('cesium.module.fluid.waterColorTip'),
        },
    ];
}