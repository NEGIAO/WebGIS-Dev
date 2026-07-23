/**
 * fluidModule.js
 * 水体流体模块定义
 * 点击地形捕捉高度图并生成水体
 * 模块元数据 + 控件定义合并为一个文件
 */

import { toFiniteNumberOrNull, clampNumber, formatElevation } from './controlsUtils';

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

    const status = state.isPicking ? '等待选点' : state.hasFluid ? '已创建' : '未创建';
    const statusTone = state.isPicking ? 'warning' : state.hasFluid ? 'success' : 'neutral';

    return {
        id: 'fluid',
        title: '水体流体',
        description: '点击地形捕捉高度图并生成水体',
        status,
        statusTone,
        actions: [
            { id: 'pick', label: state.isPicking ? '等待选点' : '捕捉高度图', variant: 'primary', active: state.isPicking },
            { id: 'floodSim', label: state.floodSimActive ? '停止洪水' : '洪水模拟', variant: state.floodSimActive ? 'danger' : 'default', active: state.floodSimActive, disabled: !hasFluidWaterLevelRange(state) },
            { id: 'clear', label: '清除', variant: 'danger', disabled: !state.hasFluid && !state.isPicking },
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