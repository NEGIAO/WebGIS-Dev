/**
 * atmosphereModule.js
 * 大气·光照·天空模块定义
 * 聚合 Cesium 原生光照 + Tellux 增强大气 + 高级后效
 * 模块元数据 + 控件定义合并为一个文件
 */

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
        ? '部分启用'
        : '仅晨昏半球';
    const statusTone = adv.atmosphere ? 'success' : 'neutral';

    return {
        id: 'atmosphere',
        title: '大气·光照·天空',
        description: 'Cesium 原生光照 + Tellux 增强大气 + 高级后效（全部可选）',
        status,
        statusTone,
        controls: [
            // --- Cesium 原生基础 ---
            ...createBaseAtmosphereControls(base),
            { id: 'fog', label: '高度雾', type: 'toggle', value: adv.fog, tooltip: '基于高度的指数雾效' },
            { id: 'hbao', label: '微阴影', type: 'toggle', value: adv.hbao, tooltip: '环境光遮蔽（HBAO）' },
            { id: 'tiltShift', label: '移轴', type: 'toggle', value: adv.tiltShift, tooltip: '移轴模糊后处理' },
            { id: 'atmosphere', label: '大气效果', type: 'toggle', value: adv.atmosphere, tooltip: '启用 Tellux 大气渲染（日夜过渡、月光、星空）' },
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
            label: '大气效果',
            type: 'toggle',
            value: !disabled,
            tooltip: '启用 Tellux 大气渲染系统（日夜过渡、月光、体积云、星空）',
        },
        {
            id: 'dayNightEnabled',
            label: '日夜过渡',
            type: 'toggle',
            value: params.dayNightEnabled !== false,
            disabled,
            tooltip: '基于太阳高度角的平滑日夜过渡效果',
        },
        {
            id: 'moonLightEnabled',
            label: '月光',
            type: 'toggle',
            value: params.moonLightEnabled !== false,
            disabled,
            tooltip: '夜间月光照明效果',
        },
        {
            id: 'moonLightIntensity',
            label: '月光强度',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.moonLightIntensity ?? 0.18,
            displayValue: Number(params.moonLightIntensity ?? 0.18).toFixed(2),
            disabled: disabled || !params.moonLightEnabled,
            tooltip: '月光对场景的照明强度（0=无月光 1=最亮）',
        },
        {
            id: 'ambientIntensity',
            label: '环境光',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: params.ambientIntensity ?? 0.08,
            displayValue: Number(params.ambientIntensity ?? 0.08).toFixed(2),
            disabled: disabled || !params.moonLightEnabled,
            tooltip: '夜间环境光底亮度，防止场景完全黑暗',
        },
        {
            id: 'starsEnabled',
            label: '星空',
            type: 'toggle',
            value: params.starsEnabled !== false,
            disabled,
            tooltip: '基于高度的星空可见性',
        },
        {
            id: 'starsIntensity',
            label: '星空强度',
            type: 'range',
            min: 0,
            max: 5,
            step: 0.1,
            value: params.starsIntensity ?? 1.0,
            displayValue: Number(params.starsIntensity ?? 1.0).toFixed(1),
            disabled: disabled || !params.starsEnabled,
            tooltip: '星空渲染亮度倍率',
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
            label: '日照',
            type: 'toggle',
            value: params.enableLighting !== false,
            tooltip: 'Cesium globe.enableLighting：启用日照贴图',
        },
        {
            id: 'showGroundAtmosphere',
            label: '地面大气',
            type: 'toggle',
            value: params.showGroundAtmosphere !== false,
            tooltip: 'globe.showGroundAtmosphere：地面大气光晕',
        },
        {
            id: 'dynamicAtmosphereLighting',
            label: '动态光照',
            type: 'toggle',
            value: params.dynamicAtmosphereLighting !== false,
            tooltip: '根据太阳位置动态调整大气光照颜色与强度',
        },
        {
            id: 'atmosphereLightIntensity',
            label: '大气光强',
            type: 'range',
            min: 0,
            max: 25,
            step: 0.5,
            value: params.atmosphereLightIntensity ?? 5.5,
            displayValue: Number(params.atmosphereLightIntensity ?? 5.5).toFixed(1),
            tooltip: '大气光晕整体亮度倍率，过高会让天空过曝',
        },
        {
            id: 'fogEnabled',
            label: '雾效',
            type: 'toggle',
            value: params.fogEnabled !== false,
            tooltip: 'Cesium 原生距离雾（非高度雾），基于相机到地表距离',
        },
        {
            id: 'fogDensity',
            label: '雾密度',
            type: 'range',
            min: 0.00001,
            max: 0.001,
            step: 0.00001,
            value: params.fogDensity ?? 0.00012,
            displayValue: Number(params.fogDensity ?? 0.00012).toFixed(5),
            disabled: !params.fogEnabled,
            tooltip: '雾浓度系数，值越大雾越浓、可视距离越短',
        },
        {
            id: 'sunShow',
            label: '太阳',
            type: 'toggle',
            value: params.sunShow !== false,
            tooltip: '显示太阳圆盘（晨昏线必需，关闭后无日照效果）',
        },
        {
            id: 'moonShow',
            label: '月亮',
            type: 'toggle',
            value: params.moonShow !== false,
            tooltip: '显示月亮圆盘',
        },
        {
            id: 'skyBoxShow',
            label: '星空盒',
            type: 'toggle',
            value: params.skyBoxShow !== false,
            tooltip: '显示星空天空盒（关闭后背景为纯黑）',
        },
    ];
}