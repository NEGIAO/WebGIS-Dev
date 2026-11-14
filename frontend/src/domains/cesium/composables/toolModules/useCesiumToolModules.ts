/**
 * useCesiumToolModules.ts
 * 三维高级控制台（面板开关 / 模块清单 / 动作与控件分发）
 *
 * 职责边界（拆分后本文件只做装配与路由）：
 * - 特效与仿真参数状态：`./fxState`（大气/云/流体/浅水/人物漫游 + 互斥规则）
 * - 高级控制器：`./advancedControllers`（三维分析/面状航线/路线漫游的懒加载与动作）
 * - 各模块的面板定义：`./sceneModule`、`./atmosphereModule`、`./cloudModule` 等
 */

import { computed, ref, watch } from 'vue';
import { useLocale } from '@common/app/useLocale';
import { readStoredBoolean, writeStoredBoolean } from '../core/cesiumStorage';
import { createSceneModule } from './sceneModule';
import { createAtmosphereModule } from './atmosphereModule';
import { createCloudModule } from './cloudModule';
import { createWindModule } from '../../modules/wind/windModule';
import { createFluidModule } from './fluidModule';
import { createShallowWaterModule } from './shallowWaterModule';
import { createPlayerModule } from './playerModule';
import { createAnalysisModule } from '../../modules/analysis';
import { createPlanarRouteModule } from './planarRouteModule';
import { createRouteFlyModule } from './routeFlyModule';
import { createAdvancedControllers } from './advancedControllers';
import { createFxState } from './fxState';

const CESIUM_TOOL_PANEL_OPEN_KEY = 'cesium_tool_panel_open';

export interface CesiumToolModulesDeps {
    /** 流体面板实例（pick/floodSim/clear 等动作直驱） */
    fluidPanelRef?: { value: any } | null;
    /** 场景动作（复位/珠峰等） */
    sceneActions?: any;
    /** 风场能力集（windParams / loadSimulatedWind / clearWind2D / setWindParam） */
    wind?: any;
    /** 人物漫游控制器 */
    playerController?: any;
    getViewer?: () => any;
    getCesium?: () => any;
    /** 面板展开状态持久化 key */
    panelStorageKey?: string;
    /** 面状航线工作集注册桥（CesiumContainer 注入：写入 dataImport.loadedDataSources） */
    syncPlanarSource?: ((info: any) => void) | null;
    /** 路线漫游工作集注册桥（同上，type=wayline 复用删除分支） */
    syncRouteFlySource?: ((info: any) => void) | null;
}

export function useCesiumToolModules({
    fluidPanelRef = null,
    sceneActions = {},
    wind = {},
    playerController: _playerController = null,
    getViewer = () => null,
    getCesium = () => null,
    panelStorageKey = CESIUM_TOOL_PANEL_OPEN_KEY,
    syncPlanarSource = null,
    syncRouteFlySource = null,
}: CesiumToolModulesDeps = {}) {
    const { language } = useLocale();
    const toolPanelOpen = ref(readStoredBoolean(panelStorageKey, true));

    // ========== 特效与仿真参数（含体积云 ↔ 地面大气互斥） ==========
    const fx = createFxState({ fluidPanelRef, playerController: _playerController });
    const {
        advancedEffectControls,
        baseAtmosphereParams,
        atmosphereParams,
        cloudParams,
        fluidParams,
        fluidState,
        playerParams,
        shallowWaterVisible,
        shallowWaterParams,
        applyAtmosphereControl,
        applyCloudControl,
        applyFluidControl,
        applyShallowWaterControl,
        applyPlayerControl,
        handleFluidStateChange,
    } = fx;

    // ========== 高级控制器（分析 / 面状航线 / 路线漫游，均懒加载） ==========
    const advanced = createAdvancedControllers({
        getViewer,
        getCesium,
        playerController: _playerController,
        syncPlanarSource,
        syncRouteFlySource,
    });
    const {
        analysisParams,
        analysisState,
        planarRouteState,
        routeFlyState,
        dispatchPlanarAction,
        dispatchRouteFlyAction,
        openRouteImportDialog,
        detachPlanarWorkingSet,
        detachRouteFlyWorkingSet,
        cleanupControllers,
    } = advanced;

    // ========== 工具模块定义（使用模块化工厂函数，聚合同类功能） ==========
    // language 依赖：语言切换时重建模块 title/label/tooltip
    const toolModules = computed(() => {
        void language.value;
        return [
            createSceneModule(),
            createAtmosphereModule(advancedEffectControls, baseAtmosphereParams, atmosphereParams),
            createCloudModule(cloudParams),
            createWindModule(wind.windParams),
            createFluidModule(fluidParams, fluidState),
            createShallowWaterModule(shallowWaterVisible, shallowWaterParams),
            createPlayerModule(playerParams, _playerController),
            createAnalysisModule(analysisParams, analysisState),
            createPlanarRouteModule(planarRouteState),
            createRouteFlyModule(routeFlyState),
        ];
    });

    watch(toolPanelOpen, (value) => {
        writeStoredBoolean(panelStorageKey, value);
    });

    function handleToolAction({ moduleId, actionId }: { moduleId: string; actionId: string }) {
        const actionMap: Record<string, Record<string, (() => any) | undefined>> = {
            scene: {
                home: () => sceneActions.flyToHome?.(),
                everest: sceneActions.flyToEverest,
            },
            wind: {
                load: wind.loadSimulatedWind,
                clear: wind.clearWind2D,
            },
            fluid: {
                pick: () => fluidPanelRef?.value?.startPickHeightMap?.(),
                floodSim: () => fluidPanelRef?.value?.toggleFloodSimulation?.(),
                clear: () => fluidPanelRef?.value?.clearFluid?.(),
            },
            shallowWater: {
                toggle: () => {
                    shallowWaterVisible.value = !shallowWaterVisible.value;
                },
            },
            player: {
                toggle: () => _playerController?.togglePlayer?.({ spawnHeight: playerParams.value.spawnHeight }),
                changeView: () => _playerController?.changeView?.(),
                setNavTarget: () => _playerController?.openNavDialog?.(),
                clearNavTarget: () => _playerController?.clearNavTarget?.(),
            },
            planarRoute: {
                setTakeoffPoint: () : any => void dispatchPlanarAction('setTakeoffPoint'),
                importKmz: () : any => void dispatchPlanarAction('importKmz'),
                saveKmz: () : any => void dispatchPlanarAction('saveKmz'),
                clearAll: () : any => void dispatchPlanarAction('clearAll'),
            },
            routeFly: {
                drawRoute: () : any => void dispatchRouteFlyAction('drawRoute'),
                startFly: () : any => void dispatchRouteFlyAction('startFly'),
                suspend: () : any => void dispatchRouteFlyAction('suspend'),
                speedUp: () : any => void dispatchRouteFlyAction('speedUp'),
                speedDown: () : any => void dispatchRouteFlyAction('speedDown'),
                stop: () : any => void dispatchRouteFlyAction('stop'),
                importRoute: () => openRouteImportDialog(),
                exportRoute: () : any => void dispatchRouteFlyAction('exportRoute'),
                clearAll: () : any => void dispatchRouteFlyAction('clearAll'),
            },
        };

        actionMap[moduleId]?.[actionId]?.();
    }
    /** 风场控件（面板参数名 → 引擎参数名映射） */
    function applyWindControl(controlId: string, value: any) {
        // windEnabled 开关→启动/关闭
        if (controlId === 'windEnabled') {
            if (value) {
                wind.loadSimulatedWind?.();
            } else {
                wind.clearWind2D?.();
            }
            return;
        }
        // 参数直接映射 — 控件 ID 与 windParams 字段名一致
        if (controlId in (wind.windParams?.value || {})) {
            wind.setWindParam?.(controlId, value);
        }
        return;
    }

    /**
     * 控件变更路由：moduleId → 该模块的写回函数。
     * 新增模块时只在这里挂一行，不再往 if 链尾部追加分支。
     */
    const CONTROL_HANDLERS: Record<string, (controlId: string, value: any) => void> = {
        analysis: advanced.applyAnalysisControl,
        planarRoute: advanced.applyPlanarRouteControl,
        routeFly: advanced.applyRouteFlyControl,
        wind: applyWindControl,
        fluid: applyFluidControl,
        shallowWater: applyShallowWaterControl,
        player: applyPlayerControl,
        atmosphere: applyAtmosphereControl,
        cloud: applyCloudControl,
    };

    function handleToolControlChange({ moduleId, controlId, value }: { moduleId: string; controlId: string; value: any }) {
        CONTROL_HANDLERS[moduleId]?.(controlId, value);
    }

    function cleanupTools() {
        wind.clearWind2D?.();
        cleanupControllers();
    }

    return {
        toolPanelOpen,
        planarRouteState,
        routeFlyState,
        analysisParams,
        analysisState,
        advancedEffectControls,
        baseAtmosphereParams,
        atmosphereParams,
        cloudParams,
        fluidParams,
        fluidState,
        shallowWaterVisible,
        shallowWaterParams,
        toolModules,
        handleToolAction,
        handleToolControlChange,
        handleFluidStateChange,
        cleanupTools,
        /** 图层管理外部删除 wayline 数据源前调用：控制器先复位内部状态 */
        detachPlanarWorkingSet,
        detachRouteFlyWorkingSet,
    };
}
