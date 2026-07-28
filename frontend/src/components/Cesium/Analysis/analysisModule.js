/**
 * analysisModule.js
 * 三维分析模块的统一 GUI 控件定义（声明式，供 CesiumToolPanel → LilGuiControls 渲染）。
 * 控件 id 约定：vis* → 通视分析参数/动作；limit* → 限高分析参数/动作；
 * type:'button' 的控件 value 为稳定空函数，真实动作在 useCesiumToolModules 按 id 分发。
 */

import { translate as t } from '@/composables/useLocale';

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
        ? [params.visEnabled ? t('cesium.status.vis') : null, params.limitEnabled ? t('cesium.status.limit') : null].filter(Boolean).join('+')
        : t('cesium.status.disabled');

    return {
        id: 'analysis',
        title: t('cesium.module.analysis.title'),
        description: state.statusText
            || t('cesium.module.analysis.description'),
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
            label: t('cesium.module.analysis.visEnabled'),
            type: 'toggle',
            value: params.visEnabled === true,
            tooltip: t('cesium.module.analysis.visEnabledTip'),
        },
        {
            id: 'visPick',
            label: state.isPicking ? t('cesium.status.pickingMap') : t('cesium.status.pickObserver'),
            type: 'button',
            value: ANALYSIS_NOOP,
            disabled: off,
            tooltip: t('cesium.module.analysis.visPickTip'),
        },
        { id: 'visDistance', label: t('cesium.module.analysis.visDistance'), type: 'range', value: params.visDistance, min: 50, max: 5000, step: 10, disabled: off },
        { id: 'visStep', label: t('cesium.module.analysis.visStep'), type: 'range', value: params.visStep, min: 1, max: 30, step: 1, disabled: off },
        { id: 'visStartAngle', label: t('cesium.module.analysis.visStartAngle'), type: 'range', value: params.visStartAngle, min: -180, max: 180, step: 1, disabled: off },
        { id: 'visEndAngle', label: t('cesium.module.analysis.visEndAngle'), type: 'range', value: params.visEndAngle, min: -180, max: 180, step: 1, disabled: off },
        { id: 'visShowSector', label: t('cesium.module.analysis.visShowSector'), type: 'toggle', value: params.visShowSector, disabled: off },
        { id: 'visLineWidth', label: t('cesium.module.analysis.visLineWidth'), type: 'range', value: params.visLineWidth, min: 1, max: 10, step: 1, disabled: off },
        { id: 'visVisibleColor', label: t('cesium.module.analysis.visVisibleColor'), type: 'color', value: params.visVisibleColor, disabled: off },
        { id: 'visInvisibleColor', label: t('cesium.module.analysis.visInvisibleColor'), type: 'color', value: params.visInvisibleColor, disabled: off },
        {
            id: 'visClear',
            label: t('cesium.status.clearVis'),
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
            label: t('cesium.module.analysis.limitEnabled'),
            type: 'toggle',
            value: params.limitEnabled === true,
            tooltip: t('cesium.module.analysis.limitEnabledTip'),
        },
        {
            id: 'limitFit',
            label: t('cesium.status.autoFit'),
            type: 'button',
            value: ANALYSIS_NOOP,
            disabled: off,
            tooltip: t('cesium.module.analysis.limitFitTip'),
        },
        {
            id: 'limitDraw',
            label: state.isDrawing ? t('cesium.status.drawing') : t('cesium.status.drawRegion'),
            type: 'button',
            value: ANALYSIS_NOOP,
            disabled: off,
            tooltip: t('cesium.module.analysis.limitDrawTip'),
        },
        { id: 'limitHeight', label: t('cesium.module.analysis.limitHeight'), type: 'range', value: params.limitHeight, min: 0, max: 1000, step: 1, disabled: off },
        { id: 'limitOpacity', label: t('cesium.module.analysis.limitOpacity'), type: 'range', value: params.limitOpacity, min: 0.1, max: 1, step: 0.05, disabled: off },
        { id: 'limitColor', label: t('cesium.module.analysis.limitColor'), type: 'color', value: params.limitColor, disabled: off },
        { id: 'limitShowPlane', label: t('cesium.module.analysis.limitShowPlane'), type: 'toggle', value: params.limitShowPlane, disabled: off },
        {
            id: 'limitClear',
            label: t('cesium.status.clearLimit'),
            type: 'button',
            value: ANALYSIS_NOOP,
            disabled: off || !state.hasRegion,
        },
    ];
}
