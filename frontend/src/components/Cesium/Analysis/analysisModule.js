/**
 * analysisModule.js
 * 三维分析模块的统一 GUI 控件定义（声明式，供 CesiumToolPanel → LilGuiControls 渲染）。
 * 控件 id 约定：vis* → 通视分析参数/动作；limit* → 限高分析参数/动作；
 * type:'button' 的控件 value 为稳定空函数，真实动作在 useCesiumToolModules 按 id 分发。
 */

/** 按钮控件占位函数（稳定引用，避免 lil-gui 频繁 updateDisplay） */
export const ANALYSIS_NOOP = () => {};

/** 分析参数默认值（与 VisibilityAnalysis/HeightLimitAnalysis 内部默认一致） */
export const DEFAULT_ANALYSIS_PARAMS = {
    // —— 通视 ——
    visEnabled: false,
    visDistance: 300,
    visStep: 5,
    visStartAngle: -60,
    visEndAngle: 60,
    visShowSector: true,
    visLineWidth: 2,
    visVisibleColor: '#00ff7f',
    visInvisibleColor: '#ff4040',
    // —— 限高 ——
    limitEnabled: false,
    limitHeight: 80,
    limitOpacity: 0.6,
    limitColor: '#ff3b30',
    limitShowPlane: true,
};

/** 分析状态默认值（运行态回写，供模块 status/描述展示） */
export const DEFAULT_ANALYSIS_STATE = {
    isPicking: false,
    isDrawing: false,
    hasResult: false,
    hasRegion: false,
    observerText: '',
    statusText: '',
};

/**
 * 创建三维分析模块定义
 * @param {import('vue').Ref} analysisParams - 分析参数 ref
 * @param {import('vue').Ref} analysisState - 分析状态 ref
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, controls: Array }}
 */
export function createAnalysisModule(analysisParams, analysisState) {
    const params = analysisParams.value;
    const state = analysisState.value;

    const anyEnabled = params.visEnabled || params.limitEnabled;
    const status = anyEnabled
        ? [params.visEnabled ? '通视' : null, params.limitEnabled ? '限高' : null].filter(Boolean).join('+')
        : '未启用';

    return {
        id: 'analysis',
        title: '三维分析·通视/限高',
        description: state.statusText
            || '射线通视（可见/遮挡分色）与 3D Tiles 限高染色分析，建议配合城市模型使用',
        status,
        statusTone: anyEnabled ? 'success' : 'neutral',
        controls: [...createVisibilityControls(params, state), ...createHeightLimitControls(params, state)],
    };
}

/** 通视分析控件组 */
function createVisibilityControls(params, state) {
    const off = !params.visEnabled;
    return [
        {
            id: 'visEnabled',
            label: '启用通视分析',
            type: 'toggle',
            value: params.visEnabled === true,
            tooltip: '以观察点为圆心逐角度发射视线，绿色可见 / 红色遮挡',
        },
        {
            id: 'visPick',
            label: state.isPicking ? '⏳ 点击地图中…' : '📍 地图选点（观察点）',
            type: 'button',
            value: ANALYSIS_NOOP,
            disabled: off,
            tooltip: '左键点击地图设置观察点（自动抬高 1.5m），选完立即分析',
        },
        { id: 'visDistance', label: '分析半径(m)', type: 'range', value: params.visDistance, min: 50, max: 5000, step: 10, disabled: off },
        { id: 'visStep', label: '采样间隔(°)', type: 'range', value: params.visStep, min: 1, max: 30, step: 1, disabled: off },
        { id: 'visStartAngle', label: '起始方位(°)', type: 'range', value: params.visStartAngle, min: -180, max: 180, step: 1, disabled: off },
        { id: 'visEndAngle', label: '结束方位(°)', type: 'range', value: params.visEndAngle, min: -180, max: 180, step: 1, disabled: off },
        { id: 'visShowSector', label: '显示覆盖扇形', type: 'toggle', value: params.visShowSector, disabled: off },
        { id: 'visLineWidth', label: '射线宽度', type: 'range', value: params.visLineWidth, min: 1, max: 10, step: 1, disabled: off },
        { id: 'visVisibleColor', label: '可见颜色', type: 'color', value: params.visVisibleColor, disabled: off },
        { id: 'visInvisibleColor', label: '遮挡颜色', type: 'color', value: params.visInvisibleColor, disabled: off },
        {
            id: 'visClear',
            label: '🧹 清除通视结果',
            type: 'button',
            value: ANALYSIS_NOOP,
            disabled: off || !state.hasResult,
        },
    ];
}

/** 限高分析控件组 */
function createHeightLimitControls(params, state) {
    const off = !params.limitEnabled;
    return [
        {
            id: 'limitEnabled',
            label: '启用限高分析',
            type: 'toggle',
            value: params.limitEnabled === true,
            tooltip: '对分析区域内超过限高的 3D Tiles 建筑表面染色（ClassificationPrimitive）',
        },
        {
            id: 'limitFit',
            label: '📦 按 3D Tiles 自动框选',
            type: 'button',
            value: ANALYSIS_NOOP,
            disabled: off,
            tooltip: '按场景中城市模型包围球生成矩形区域并推荐限高、飞行定位',
        },
        {
            id: 'limitDraw',
            label: state.isDrawing ? '⏳ 绘制中（右键结束）' : '✍️ 手绘分析区域',
            type: 'button',
            value: ANALYSIS_NOOP,
            disabled: off,
            tooltip: '左键添加顶点、右键结束，至少 3 个顶点',
        },
        { id: 'limitHeight', label: '限高(m)', type: 'range', value: params.limitHeight, min: 0, max: 1000, step: 1, disabled: off },
        { id: 'limitOpacity', label: '染色不透明度', type: 'range', value: params.limitOpacity, min: 0.1, max: 1, step: 0.05, disabled: off },
        { id: 'limitColor', label: '超限颜色', type: 'color', value: params.limitColor, disabled: off },
        { id: 'limitShowPlane', label: '显示限高截面框', type: 'toggle', value: params.limitShowPlane, disabled: off },
        {
            id: 'limitClear',
            label: '🧹 清除限高结果',
            type: 'button',
            value: ANALYSIS_NOOP,
            disabled: off || !state.hasRegion,
        },
    ];
}
