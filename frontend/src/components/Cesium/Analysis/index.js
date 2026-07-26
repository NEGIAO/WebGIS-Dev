/**
 * Analysis 模块统一出口
 * 三维分析（通视 + 限高）：文件夹级独立模块，经统一 GUI 接口（analysisModule 控件定义 +
 * useCesiumToolModules 分发）接入 3D 高级控制台，业务组件不直接操作分析器实例。
 *
 * 用法（useCesiumToolModules 内）：
 *   const runtime = createAnalysisRuntime({ getViewer, getCesium, onStateChange });
 *   runtime.handleControlChange(controlId, value, analysisParams.value);
 *   runtime.destroy();
 */

import { VisibilityAnalysis } from './visibilityAnalysis';
import { HeightLimitAnalysis } from './heightLimitAnalysis';

export { VisibilityAnalysis } from './visibilityAnalysis';
export { HeightLimitAnalysis } from './heightLimitAnalysis';
export {
    createAnalysisModule,
    DEFAULT_ANALYSIS_PARAMS,
    DEFAULT_ANALYSIS_STATE,
    ANALYSIS_NOOP,
} from './analysisModule';

/** 通视参数控件 id → VisibilityAnalysis.params 键映射 */
const VIS_PARAM_MAP = {
    visDistance: 'distance',
    visStep: 'step',
    visStartAngle: 'startAngle',
    visEndAngle: 'endAngle',
    visShowSector: 'showSector',
    visLineWidth: 'lineWidth',
    visVisibleColor: 'visibleColor',
    visInvisibleColor: 'invisibleColor',
};

/** 限高参数控件 id → HeightLimitAnalysis.params 键映射 */
const LIMIT_PARAM_MAP = {
    limitHeight: 'limitHeight',
    limitOpacity: 'opacity',
    limitColor: 'color',
    limitShowPlane: 'showPlane',
};

/**
 * 创建三维分析运行时：懒实例化两个分析器，统一分发控件变化与销毁。
 * @param {object} options
 * @param {() => object} options.getViewer - 返回 Cesium.Viewer
 * @param {() => object} options.getCesium - 返回 Cesium 命名空间
 * @param {(patch: object) => void} options.onStateChange - 状态回写（合并进 analysisState）
 * @returns {{ handleControlChange: Function, destroy: Function }}
 */
export function createAnalysisRuntime({ getViewer, getCesium, onStateChange = () => {} }) {
    let visibility = null;
    let heightLimit = null;

    const deps = { getViewer, getCesium, onStateChange };

    function ensureVisibility() {
        if (!visibility) visibility = new VisibilityAnalysis(deps);
        return visibility;
    }

    function ensureHeightLimit() {
        if (!heightLimit) heightLimit = new HeightLimitAnalysis(deps);
        return heightLimit;
    }

    /** 从面板参数快照同步分析器参数（按映射表换名） */
    function syncParams(analyzer, map, params) {
        const patch = {};
        for (const [controlId, paramKey] of Object.entries(map)) {
            if (controlId in params) patch[paramKey] = params[controlId];
        }
        analyzer.applyParams(patch);
    }

    /**
     * 统一控件分发：参数控件同步分析器并重算；按钮控件执行动作；
     * 开关控件负责生命周期（关闭即销毁对应分析器，释放实体/事件）。
     * @param {string} controlId - 控件 id（vis* 或 limit* 前缀）
     * @param {*} value - 控件值
     * @param {object} params - analysisParams 当前快照（已写入本次变更）
     */
    function handleControlChange(controlId, value, params) {
        if (!getViewer()) return;

        // —— 生命周期开关 ——
        if (controlId === 'visEnabled') {
            if (value) {
                syncParams(ensureVisibility(), VIS_PARAM_MAP, params);
                onStateChange({ statusText: '通视：点击「📍 地图选点」设置观察点' });
            } else if (visibility) {
                visibility.destroy();
                visibility = null;
            }
            return;
        }
        if (controlId === 'limitEnabled') {
            if (value) {
                syncParams(ensureHeightLimit(), LIMIT_PARAM_MAP, params);
                onStateChange({ statusText: '限高：「📦 自动框选」或「✍️ 手绘区域」开始分析' });
            } else if (heightLimit) {
                heightLimit.destroy();
                heightLimit = null;
            }
            return;
        }

        // —— 通视动作 / 参数 ——
        if (controlId === 'visPick') { ensureVisibility().startPickObserver(); return; }
        if (controlId === 'visClear') { visibility?.clear(); return; }
        if (controlId in VIS_PARAM_MAP) {
            if (params.visEnabled) syncParams(ensureVisibility(), VIS_PARAM_MAP, params);
            return;
        }

        // —— 限高动作 / 参数 ——
        if (controlId === 'limitFit') { ensureHeightLimit().fitToTileset(); return; }
        if (controlId === 'limitDraw') { ensureHeightLimit().startDrawRegion(); return; }
        if (controlId === 'limitClear') { heightLimit?.clear(); return; }
        if (controlId in LIMIT_PARAM_MAP) {
            if (params.limitEnabled) syncParams(ensureHeightLimit(), LIMIT_PARAM_MAP, params);
        }
    }

    /** 销毁全部分析器（组件卸载 / cleanupTools 时调用） */
    function destroy() {
        visibility?.destroy();
        heightLimit?.destroy();
        visibility = null;
        heightLimit = null;
    }

    return { handleControlChange, destroy };
}
