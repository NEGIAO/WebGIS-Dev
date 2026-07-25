/**
 * windModule.js
 * 风场可视化模块定义
 * 模块元数据 + 控件定义合并为一个文件
 *
 * 控件参数对应 cesium-wind-layer WindLayerOptions：
 *   speedFactor, particleHeight, particlesTextureSize, lineWidth, lineLength, dropRate, dynamic
 */

/**
 * 创建风场模块
 * @param {import('vue').Ref} windParams - 风场参数 ref
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, controls: Array }}
 */
export function createWindModule(windParams) {
    const params = windParams?.value ?? {};
    const status = params.windEnabled ? '已启用' : '未启用';
    const statusTone = params.windEnabled ? 'success' : 'neutral';

    return {
        id: 'wind',
        title: '风场可视化',
        description: '基于 GFS 全球风场数据的 GPU 粒子风场可视化（cesium-wind-layer）',
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
            label: '启用风场',
            type: 'toggle',
            value: params.windEnabled === true,
            tooltip: '基于 GFS 全球风场数据的 GPU 粒子可视化（cesium-wind-layer）',
        },
        {
            id: 'speedFactor',
            label: '速度倍率',
            type: 'range',
            min: 0.1,
            max: 5,
            step: 0.1,
            value: params.speedFactor ?? 1.0,
            displayValue: Number(params.speedFactor ?? 1.0).toFixed(1),
            disabled: off,
            tooltip: '粒子运动速度倍率，值越大粒子移动越快',
        },
        {
            id: 'particleHeight',
            label: '粒子高度',
            type: 'range',
            min: 0,
            max: 10000,
            step: 100,
            value: params.particleHeight ?? 1000,
            displayValue: String(Math.round(params.particleHeight ?? 1000)) + 'm',
            disabled: off,
            tooltip: '风场粒子悬浮高度（米）',
        },
        {
            id: 'particlesTextureSize',
            label: '粒子纹理尺寸',
            type: 'range',
            min: 100,
            max: 5000,
            step: 100,
            value: params.particlesTextureSize ?? 600,
            displayValue: String(Math.round(params.particlesTextureSize ?? 600)),
            disabled: off,
            tooltip: '粒子纹理尺寸（像素），越大密度越高但越耗 GPU',
        },
        {
            id: 'lineWidthVal',
            label: '线宽',
            type: 'range',
            min: 1,
            max: 30,
            step: 1,
            value: params.lineWidthVal ?? 10,
            displayValue: String(Math.round(params.lineWidthVal ?? 10)),
            disabled: off,
            tooltip: '风场轨迹线最大宽度（像素）',
        },
        {
            id: 'lineLengthVal',
            label: '拖尾长度',
            type: 'range',
            min: 20,
            max: 3000,
            step: 10,
            value: params.lineLengthVal ?? 800,
            displayValue: String(Math.round(params.lineLengthVal ?? 800)),
            disabled: off,
            tooltip: '粒子拖尾最大长度（像素），越大轨迹越长',
        },
        {
            id: 'dropRate',
            label: '丢弃率',
            type: 'range',
            min: 0,
            max: 0.02,
            step: 0.001,
            value: params.dropRate ?? 0.003,
            displayValue: Number(params.dropRate ?? 0.003).toFixed(3),
            disabled: off,
            tooltip: '粒子重置概率，越高粒子更新越快',
        },
        {
            id: 'dynamic',
            label: '动画',
            type: 'toggle',
            value: params.dynamic === true,
            disabled: off,
            tooltip: '启用/暂停粒子动画',
        },
    ];
}
