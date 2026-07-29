/**
 * windModule.js
 * 风场可视化模块定义
 * 模块元数据 + 控件定义合并为一个文件
 *
 * 控件参数对应 cesium-wind-layer WindLayerOptions：
 *   speedFactor, particleHeight, particlesTextureSize, lineWidth, lineLength, dropRate, dynamic
 */

import { translate as t } from '@common/app/useLocale';

/**
 * 创建风场模块
 * @param {import('vue').Ref} windParams - 风场参数 ref
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, controls: Array }}
 */
export function createWindModule(windParams) {
    const params = windParams?.value ?? {};
    const status = params.windEnabled ? t('cesium.status.enabled') : t('cesium.status.disabled');
    const statusTone = params.windEnabled ? 'success' : 'neutral';

    return {
        id: 'wind',
        title: t('cesium.module.wind.title'),
        description: t('cesium.module.wind.description'),
        status,
        statusTone,
        controls: createWindControls(params, !params.windEnabled),
    };
}

/**
 * 构建风场控件列表
 * @param {Record<string, any>} params - 当前风场参数
 * @param {boolean} disabled - 是否禁用
 * @returns {Array<object>}
 */
function createWindControls(params = {}, disabled) {
    const off = disabled || !params.windEnabled;
    return [
        {
            id: 'windEnabled',
            label: t('cesium.module.wind.windEnabled'),
            type: 'toggle',
            value: params.windEnabled === true,
            tooltip: t('cesium.module.wind.windEnabledTip'),
        },
        {
            id: 'speedFactor',
            label: t('cesium.module.wind.speedFactor'),
            type: 'range',
            min: 0.1,
            max: 5,
            step: 0.1,
            value: params.speedFactor ?? 1.0,
            displayValue: Number(params.speedFactor ?? 1.0).toFixed(1),
            disabled: off,
            tooltip: t('cesium.module.wind.speedFactorTip'),
        },
        {
            id: 'particleHeight',
            label: t('cesium.module.wind.particleHeight'),
            type: 'range',
            min: 0,
            max: 10000,
            step: 100,
            value: params.particleHeight ?? 1000,
            displayValue: String(Math.round(params.particleHeight ?? 1000)) + 'm',
            disabled: off,
            tooltip: t('cesium.module.wind.particleHeightTip'),
        },
        {
            id: 'particlesTextureSize',
            label: t('cesium.module.wind.particlesTextureSize'),
            type: 'range',
            min: 100,
            max: 5000,
            step: 100,
            value: params.particlesTextureSize ?? 600,
            displayValue: String(Math.round(params.particlesTextureSize ?? 600)),
            disabled: off,
            tooltip: t('cesium.module.wind.particlesTextureSizeTip'),
        },
        {
            id: 'lineWidthVal',
            label: t('cesium.module.wind.lineWidthVal'),
            type: 'range',
            min: 1,
            max: 30,
            step: 1,
            value: params.lineWidthVal ?? 10,
            displayValue: String(Math.round(params.lineWidthVal ?? 10)),
            disabled: off,
            tooltip: t('cesium.module.wind.lineWidthValTip'),
        },
        {
            id: 'lineLengthVal',
            label: t('cesium.module.wind.lineLengthVal'),
            type: 'range',
            min: 20,
            max: 3000,
            step: 10,
            value: params.lineLengthVal ?? 800,
            displayValue: String(Math.round(params.lineLengthVal ?? 800)),
            disabled: off,
            tooltip: t('cesium.module.wind.lineLengthValTip'),
        },
        {
            id: 'dropRate',
            label: t('cesium.module.wind.dropRate'),
            type: 'range',
            min: 0,
            max: 0.02,
            step: 0.001,
            value: params.dropRate ?? 0.003,
            displayValue: Number(params.dropRate ?? 0.003).toFixed(3),
            disabled: off,
            tooltip: t('cesium.module.wind.dropRateTip'),
        },
        {
            id: 'dynamic',
            label: t('cesium.module.wind.dynamic'),
            type: 'toggle',
            value: params.dynamic === true,
            disabled: off,
            tooltip: t('cesium.module.wind.dynamicTip'),
        },
    ];
}
