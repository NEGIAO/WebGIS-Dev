/**
 * windModule.js
 * 风场可视化模块定义
 * 模块元数据 + 控件定义合并为一个文件
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
        description: '基于 GFS 风速数据的粒子风场可视化',
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
            tooltip: '基于 GFS 全球风场数据的粒子可视化',
        },
        {
            id: 'windSpeed',
            label: '风速系数',
            type: 'range',
            min: 0.1,
            max: 15,
            step: 0.1,
            value: params.windSpeed ?? 1.0,
            displayValue: Number(params.windSpeed ?? 1.0).toFixed(1),
            disabled: off,
            tooltip: '粒子运动速度倍率，值越大粒子移动越快',
        },
        {
            id: 'particleCount',
            label: '粒子数量',
            type: 'range',
            min: 1000,
            max: 50000,
            step: 1000,
            value: params.particleCount ?? 10000,
            displayValue: String(Math.round(params.particleCount ?? 10000)),
            disabled: off,
            tooltip: '风场粒子总数，越大越密集但越耗 GPU',
        },
        {
            id: 'lineWidth',
            label: '线宽',
            type: 'range',
            min: 0.1,
            max: 5,
            step: 0.1,
            value: params.lineWidth ?? 1.0,
            displayValue: Number(params.lineWidth ?? 1.0).toFixed(1),
            disabled: off,
            tooltip: '风场轨迹线宽度',
        },
        {
            id: 'colorScale',
            label: '颜色刻度',
            type: 'range',
            min: 0.5,
            max: 5,
            step: 0.1,
            value: params.colorScale ?? 1.5,
            displayValue: Number(params.colorScale ?? 1.5).toFixed(1),
            disabled: off,
            tooltip: '风速到颜色的映射强度，值越大色彩对比越强',
        },
        {
            id: 'maxAge',
            label: '粒子寿命',
            type: 'range',
            min: 1,
            max: 10,
            step: 0.5,
            value: params.maxAge ?? 3,
            displayValue: Number(params.maxAge ?? 3).toFixed(1),
            disabled: off,
            tooltip: '粒子最大存活时间（秒），越大轨迹越长',
        },
        {
            id: 'opacity',
            label: '不透明度',
            type: 'range',
            min: 0.05,
            max: 1,
            step: 0.05,
            value: params.opacity ?? 0.7,
            displayValue: Math.round((params.opacity ?? 0.7) * 100) + '%',
            disabled: off,
            tooltip: '风场粒子整体不透明度',
        },
        {
            id: 'frameRate',
            label: '帧率',
            type: 'range',
            min: 5,
            max: 60,
            step: 5,
            value: params.frameRate ?? 30,
            displayValue: Math.round(params.frameRate ?? 30) + ' fps',
            disabled: off,
            tooltip: '风场粒子更新帧率，影响动画流畅度',
        },
        {
            id: 'wind2DEnabled',
            label: '2D 风场模式',
            type: 'toggle',
            value: params.wind2DEnabled === true,
            disabled: off,
            tooltip: '切换为 2D 屏幕空间风场渲染（性能更优，但无 3D 纵深）',
        },
    ];
}