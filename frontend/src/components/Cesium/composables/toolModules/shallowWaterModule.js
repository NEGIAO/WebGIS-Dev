/**
 * shallowWaterModule.js
 * 热带浅水模块定义
 * Three.js 热带浅水场景（焦散/折射/物理吸色/体积云/闪电）
 * 模块元数据 + 控件定义合并为一个文件
 */

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
        title: '热带浅水',
        description: 'Three.js 热带浅水场景（焦散/折射/物理吸色/体积云/闪电）',
        status: visible ? '已启用' : '未启用',
        statusTone: visible ? 'success' : 'neutral',
        actions: [
            { id: 'toggle', label: visible ? '关闭' : '启用', variant: visible ? 'danger' : 'primary' },
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
            label: '高度角',
            type: 'range',
            min: 2,
            max: 80,
            step: 0.1,
            value: params.elevation ?? 30,
            displayValue: Number(params.elevation ?? 30).toFixed(1),
            disabled,
            tooltip: '太阳高度角（度），影响光照方向和阴影长度',
        },
        {
            id: 'azimuth',
            label: '方位角',
            type: 'range',
            min: -180,
            max: 180,
            step: 0.1,
            value: params.azimuth ?? 150,
            displayValue: Number(params.azimuth ?? 150).toFixed(1),
            disabled,
            tooltip: '太阳方位角（度），-180~180，影响光照方向',
        },
        {
            id: 'clarity',
            label: '清澈度',
            type: 'range',
            min: 0.03,
            max: 0.4,
            step: 0.005,
            value: params.clarity ?? 0.085,
            displayValue: Number(params.clarity ?? 0.085).toFixed(3),
            tooltip: '越小越清澈(Beer-Lambert 密度)',
            disabled,
        },
        {
            id: 'causticStrength',
            label: '焦散强度',
            type: 'range',
            min: 0,
            max: 2,
            step: 0.05,
            value: params.causticStrength ?? 0.9,
            displayValue: Number(params.causticStrength ?? 0.9).toFixed(2),
            disabled,
            tooltip: '水底焦散光斑强度（光线折射聚焦）',
        },
        {
            id: 'waveHeight',
            label: '浪高',
            type: 'range',
            min: 0,
            max: 1.5,
            step: 0.05,
            value: params.waveHeight ?? 0.5,
            displayValue: Number(params.waveHeight ?? 0.5).toFixed(2),
            disabled,
            tooltip: '水面波浪振幅，影响法线扰动和反射扭曲',
        },
        {
            id: 'foamWidth',
            label: '泡沫宽度',
            type: 'range',
            min: 0,
            max: 8,
            step: 0.1,
            value: params.foamWidth ?? 2.4,
            displayValue: Number(params.foamWidth ?? 2.4).toFixed(1),
            disabled,
            tooltip: '浪花泡沫带宽度（海岸线附近）',
        },
        {
            id: 'reflection',
            label: '反射强度',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.02,
            value: params.reflection ?? 0.38,
            displayValue: Number(params.reflection ?? 0.38).toFixed(2),
            disabled,
            tooltip: '水面菲涅尔反射强度（0=纯折射 1=纯反射）',
        },
        {
            id: 'waterColor',
            label: '远处浅水色',
            type: 'color',
            value: params.waterColor ?? '#2bb3c4',
            disabled,
            tooltip: '远处深水颜色（近处由清澈度控制）',
        },
        {
            id: 'cloudCoverage',
            label: '云量',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.cloudCoverage ?? 0.58,
            displayValue: Number(params.cloudCoverage ?? 0.58).toFixed(2),
            disabled,
            tooltip: '天空云量（0=晴天 1=全阴），影响光照和天空颜色',
        },
        {
            id: 'lightningEnabled',
            label: '闪电开关',
            type: 'toggle',
            value: params.lightningEnabled !== false,
            disabled,
            tooltip: '启用随机闪电效果',
        },
        {
            id: 'lightningInterval',
            label: '闪电间隔(秒)',
            type: 'range',
            min: 0.4,
            max: 8,
            step: 0.1,
            value: params.lightningInterval ?? 2.0,
            displayValue: Number(params.lightningInterval ?? 2.0).toFixed(1),
            disabled: disabled || params.lightningEnabled === false,
            tooltip: '闪电触发平均间隔（秒）',
        },
    ];
}