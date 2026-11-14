/**
 * 高级控制器（三维分析 / 面状航线 / 路线漫游）
 *
 * 从 useCesiumToolModules 拆出：三者都是「首次交互才动态 import chunk + 绑定宿主 Viewer」
 * 的无头控制器，生命周期与动作分发放在一起，避免再和特效参数混住。
 */

import { ref } from 'vue';
import { translate as t } from '@common/app/useLocale';
import {
    createAnalysisRuntime,
    DEFAULT_ANALYSIS_PARAMS,
    DEFAULT_ANALYSIS_STATE,
} from '../../modules/analysis';

export interface AdvancedControllerDeps {
    getViewer?: () => any;
    getCesium?: () => any;
    /** 人物漫游控制器（路线漫游起飞前需停步行漫游，二者共用时钟） */
    playerController?: any;
    /** 面状航线工作集注册桥（写入 dataImport.loadedDataSources） */
    syncPlanarSource?: ((info: any) => void) | null;
    /** 路线漫游工作集注册桥（同上，type=wayline 复用删除分支） */
    syncRouteFlySource?: ((info: any) => void) | null;
}

/**
 * 创建高级控制器集合
 * @param deps 依赖注入（见 AdvancedControllerDeps）
 */
export function createAdvancedControllers({
    getViewer = () => null,
    getCesium = () => null,
    playerController = null,
    syncPlanarSource = null,
    syncRouteFlySource = null,
}: AdvancedControllerDeps = {}) {
    // ========== 三维分析（通视/限高）参数与运行时（Analysis 文件夹模块，懒创建） ==========
    const analysisParams = ref({ ...DEFAULT_ANALYSIS_PARAMS });
    const analysisState = ref({ ...DEFAULT_ANALYSIS_STATE });

    let analysisRuntime: any = null;
    function ensureAnalysisRuntime() {
        if (!analysisRuntime) {
            analysisRuntime = createAnalysisRuntime({
                getViewer,
                getCesium,
                onStateChange: (patch) => {
                    analysisState.value = { ...analysisState.value, ...patch };
                },
            });
        }
        return analysisRuntime;
    }

    // ========== 面状航线（无头控制器，面板直驱；控制器按需懒创建） ==========
    const planarRouteState = ref({
        hasRoute: false,
        isCalculating: false,
        isImporting: false,
        pickingTakeoff: false,
        activeRouteIndex: 0,
        routeOptions: [],
        routeName: '',
    });

    let planarRouteController: any = null;
    let planarRouteControllerLoading: any = null;

    /**
     * 懒创建面状航线控制器（返回 Promise；就绪后自动绑定宿主 Viewer）。
     * 与 analysis 运行时同模式：首次交互才加载 chunk 并创建。
     */
    function ensurePlanarRouteController() {
        if (planarRouteController) {
            const viewer = getViewer();
            if (viewer) {
                try {
                    planarRouteController.bind(viewer);
                } catch {
                    /* viewer 未就绪时由下次交互重试 */
                }
            }
            return Promise.resolve(planarRouteController);
        }
        if (!planarRouteControllerLoading) {
            planarRouteControllerLoading = import('../../modules/planar-route/planarRouteController').then(
                ({ PlanarRouteController }) => {
                    planarRouteController = new PlanarRouteController({
                        getViewer,
                        onStateChange: (patch: any) => {
                            planarRouteState.value = { ...planarRouteState.value, ...patch } as any;
                        },
                        onWorkingSetChange: (info) => syncPlanarSource?.(info),
                    });
                    planarRouteControllerLoading = null;
                    const viewer = getViewer();
                    if (viewer) {
                        planarRouteController.bind(viewer);
                    }
                    return planarRouteController;
                },
            );
        }
        return planarRouteControllerLoading;
    }

    /**
     * 面状航线动作分发（等待懒加载完成后再执行实际动作）。
     */
    async function dispatchPlanarAction(actionId: any) {
        const controller = await ensurePlanarRouteController();
        if (!controller) return;
        switch (actionId) {
            case 'setTakeoffPoint':
                controller.setTakeoffPicking(!controller.pickingTakeoff.value);
                break;
            case 'importKmz':
                controller.pickAndImportKmz();
                break;
            case 'saveKmz':
                void controller.saveKmz();
                break;
            case 'clearAll':
                controller.clearAll();
                break;
        }
    }

    // ========== 路线漫游（无头控制器，面板直驱；控制器按需懒创建） ==========
    const routeFlyState = ref({
        isDrawing: false,
        pointCount: 0,
        hasRoute: false,
        isFlying: false,
        isPaused: false,
        multiplier: 30,
        routeLengthText: '',
        durationText: '',
        lastPreset: 'third',
        distance: 100,
        heading: 0,
        pitch: -30,
        flyHeight: 50,
        sampleStep: 20,
        clampToBuildings: true,
        showPath: true,
        showMarkers: true,
        showModel: true,
        modelScale: 1,
        modelHeadingOffset: 0,
        modelUri: 'glb/drone.glb',
        exportFormat: 'geojson',
        errorText: '',
    });

    let routeFlyController: any = null;
    let routeFlyControllerLoading: any = null;

    /** 懒创建路线漫游控制器（模式同 planarRoute：首次交互才加载 chunk 并绑定宿主） */
    function ensureRouteFlyController() {
        if (routeFlyController) {
            const viewer = getViewer();
            if (viewer) {
                try {
                    routeFlyController.bind(viewer);
                } catch {
                    /* viewer 未就绪时由下次交互重试 */
                }
            }
            return Promise.resolve(routeFlyController);
        }
        if (!routeFlyControllerLoading) {
            routeFlyControllerLoading = import('../../modules/route-fly/firstPersonFlyController').then(
                ({ FirstPersonFlyController }) => {
                    routeFlyController = new FirstPersonFlyController({
                        getViewer,
                        getCesium,
                        defaultSourceName: t('cesium.module.routeFly.sourceName'),
                        onStateChange: (patch: any) => {
                            routeFlyState.value = { ...routeFlyState.value, ...patch };
                        },
                        onWorkingSetChange: (info: any) => syncRouteFlySource?.(info),
                    });
                    routeFlyControllerLoading = null;
                    const viewer = getViewer();
                    if (viewer) {
                        routeFlyController.bind(viewer);
                    }
                    return routeFlyController;
                },
            );
        }
        return routeFlyControllerLoading;
    }

    /** 路线漫游动作分发（含与人物漫游的时钟互斥：起飞前先停步行漫游） */
    /** 路线漫游动作分发（含与人物漫游的时钟互斥：起飞前先停步行漫游） */
    let routeImportInput: any = null;
    let routeErrorTimer: any = null;

    /**
     * 打开路线导入文件框。
     * 关键：input.click() 必须发生在用户手势的同步调用栈内——
     * 若放在 await 懒加载之后，激活态过期会被浏览器静默拦截。
     */
    function openRouteImportDialog() {
        if (!routeImportInput) {
            routeImportInput = document.createElement('input');
            routeImportInput.type = 'file';
            routeImportInput.accept = '.geojson,.json,.kml,.kmz';
            routeImportInput.onchange = () => {
                const file = routeImportInput.files?.[0];
                if (!file) return;
                void ensureRouteFlyController()
                    .then((controller: any) => controller?.applyImportFile(file))
                    .catch((error: any) => {
                        const code = String(error?.message || 'IMPORT_FAILED');
                        setRouteFlyError(
                            code === 'IMPORT_EMPTY'
                                ? t('cesium.module.routeFly.err.importEmpty')
                                : t('cesium.module.routeFly.err.importFailed', { msg: code }),
                        );
                    });
            };
        }
        routeImportInput.click();
    }

    /** 写入错误文案并在 4 秒后自动清除 */
    function setRouteFlyError(text: any) {
        routeFlyState.value = { ...routeFlyState.value, errorText: text };
        if (routeErrorTimer) clearTimeout(routeErrorTimer);
        routeErrorTimer = setTimeout(() => {
            routeFlyState.value = { ...routeFlyState.value, errorText: '' };
            routeErrorTimer = null;
        }, 4000);
    }

    async function dispatchRouteFlyAction(actionId: any) {
        const controller = await ensureRouteFlyController();
        if (!controller) return;

        if (actionId === 'startFly') {
            try {
                playerController?.stopPlayer?.();
            } catch {
                /* 步行漫游未激活时忽略 */
            }
        }

        try {
            switch (actionId) {
                case 'drawRoute':
                    if (routeFlyState.value.isDrawing) {
                        controller.cancelDrawing();
                    } else {
                        controller.startDrawing();
                    }
                    break;
                case 'startFly':
                    routeFlyState.value = { ...routeFlyState.value, errorText: '' };
                    await controller.startFly();
                    break;
                case 'suspend':
                    controller.suspend();
                    break;
                case 'speedUp':
                    controller.speedUp();
                    break;
                case 'speedDown':
                    controller.speedDown();
                    break;
                case 'stop':
                    controller.stop();
                    break;
                case 'importRoute':
                    openRouteImportDialog();
                    break;
                case 'exportRoute': {
                    try {
                        controller.exportRoute();
                    } catch (error: any) {
                        const code = String(error?.message || 'NO_ROUTE');
                        const key = code === 'NO_ROUTE' ? 'cesium.module.routeFly.err.noRoute' : null;
                        setRouteFlyError(key ? t(key) : t('cesium.module.routeFly.err.generic', { msg: code }));
                    }
                    break;
                }
                case 'clearAll':
                    controller.clearAll();
                    routeFlyState.value = { ...routeFlyState.value, errorText: '' };
                    break;
            }
        } catch (error: any) {
            const code = String(error?.message || '');
            const errKeys: Record<string, string> = {
                DRAWING: 'cesium.module.routeFly.err.drawing',
                NO_ROUTE: 'cesium.module.routeFly.err.noRoute',
                ZERO_LENGTH: 'cesium.module.routeFly.err.zeroLength',
            };
            const text = errKeys[code] || t('cesium.module.routeFly.err.generic', { msg: code });
            setRouteFlyError(text);
        }
    }

    /** 外部删除托管数据源前复位控制器内部状态 */
    function detachRouteFlyWorkingSet() {
        routeFlyController?.detachForExternalRemoval();
    }
    /** 三维分析控件（参数写回 + 统一分发给 Analysis 运行时；按钮 value 为函数，仅按 id 触发动作） */
    /** 三维分析控件（参数写回 + 统一分发给 Analysis 运行时；按钮 value 为函数，仅按 id 触发动作） */
    function applyAnalysisControl(controlId: string, value: any) {
        if (controlId in analysisParams.value && typeof value !== 'function') {
            analysisParams.value = { ...analysisParams.value, [controlId]: value };
        }
        ensureAnalysisRuntime().handleControlChange(controlId, value, analysisParams.value);
        return;
    }

    /** 面状航线控件（globeConfig 为模块内响应式单例，控制器统一写回 + 重规划） */
    /** 面状航线控件（globeConfig 为模块内响应式单例，控制器统一写回 + 重规划） */
    function applyPlanarRouteControl(controlId: string, value: any) {
        void ensurePlanarRouteController().then((controller: any) => {
            controller?.setParam(controlId, value);
        });
        return;
    }

    /** 路线漫游控件（id → 控制器 setter 直驱；布尔/字符串/数值分流） */
    /** 路线漫游控件（id → 控制器 setter 直驱；布尔/字符串/数值分流） */
    function applyRouteFlyControl(controlId: string, value: any) {
        void ensureRouteFlyController().then((controller: any) => {
            if (!controller) return;
            switch (controlId) {
                case 'viewPreset':
                    controller.applyViewPreset(String(value));
                    break;
                case 'modelUri':
                    controller.setModelUri(String(value));
                    break;
                case 'showModel':
                    controller.setModelShow(Boolean(value));
                    break;
                case 'showPath':
                    controller.setPathShow(Boolean(value));
                    break;
                case 'showMarkers':
                    controller.setShowMarkers(Boolean(value));
                    break;
                case 'clampToBuildings':
                    controller.setClampToBuildings(Boolean(value));
                    break;
                default: {
                    const numVal = Number(value);
                    if (!Number.isFinite(numVal)) return;
                    if (controlId === 'distance') controller.setDistance(numVal);
                    else if (controlId === 'heading') controller.setHeading(numVal);
                    else if (controlId === 'pitch') controller.setPitch(numVal);
                    else if (controlId === 'flyHeight') controller.setFlyHeight(numVal);
                    else if (controlId === 'speed') controller.setSpeed(numVal);
                    else if (controlId === 'sampleStep') controller.setSampleStep(numVal);
                    else if (controlId === 'modelScale') controller.setModelScale(numVal);
                    else if (controlId === 'modelHeadingOffset') controller.setModelHeadingOffset(numVal);
                }
            }
        });
        return;
    }

    /** 图层管理外部删除测区/航线数据源前调用：控制器先复位内部状态 */
    function detachPlanarWorkingSet() {
        planarRouteController?.detachForExternalRemoval();
    }

    /** 销毁全部控制器（实体/事件 handler/全局 Viewer 引用全量释放） */
    function cleanupControllers() {
        // 销毁三维分析运行时（实体/事件 handler 全量释放）
        analysisRuntime?.destroy();
        analysisRuntime = null;
        // 销毁面状航线控制器（测区/航线实体与全局 Viewer 引用全量释放）
        planarRouteController?.destroy();
        planarRouteController = null;
        // 销毁路线漫游控制器（绘制/漫游实体、CZML 数据源与 clock 恢复）
        routeFlyController?.destroy();
        routeFlyController = null;
    }

    return {
        analysisParams,
        analysisState,
        planarRouteState,
        routeFlyState,
        ensureAnalysisRuntime,
        ensurePlanarRouteController,
        ensureRouteFlyController,
        dispatchPlanarAction,
        dispatchRouteFlyAction,
        openRouteImportDialog,
        applyAnalysisControl,
        applyPlanarRouteControl,
        applyRouteFlyControl,
        detachPlanarWorkingSet,
        detachRouteFlyWorkingSet,
        cleanupControllers,
    };
}
