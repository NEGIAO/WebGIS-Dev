import { computed, ref, watch } from 'vue';
import { useLocale, translate as t } from '@common/app/useLocale';
import { readStoredBoolean, writeStoredBoolean } from '../core/cesiumStorage';
import {
    applyCloudQualityPreset,
    DEFAULT_CLOUD_QUALITY,
} from '../../modules/cloud/cloudQualityPresets.js';
import { toFiniteNumberOrNull } from './controlsUtils';
import { createSceneModule } from './sceneModule';
import { createAtmosphereModule } from './atmosphereModule';
import { createCloudModule } from './cloudModule';
import { createWindModule } from '../../modules/wind/windModule';
import { createFluidModule } from './fluidModule';
import { createShallowWaterModule } from './shallowWaterModule';
import { createPlayerModule } from './playerModule';
import { createPlanarRouteModule } from './planarRouteModule';
import { createRouteFlyModule } from './routeFlyModule';
import {
    createAnalysisModule,
    createAnalysisRuntime,
    DEFAULT_ANALYSIS_PARAMS,
    DEFAULT_ANALYSIS_STATE,
} from '../../modules/analysis';

const CESIUM_TOOL_PANEL_OPEN_KEY = 'cesium_tool_panel_open';

export function useCesiumToolModules({
    fluidPanelRef,
    sceneActions = {},
    wind = {},
    playerController: _playerController = null,
    getViewer = () => null,
    getCesium = () => null,
    panelStorageKey = CESIUM_TOOL_PANEL_OPEN_KEY,
    /** 面状航线工作集注册桥（CesiumContainer 注入：写入 dataImport.loadedDataSources） */
    syncPlanarSource = null,
    /** 路线漫游工作集注册桥（同上，type=wayline 复用删除分支） */
    syncRouteFlySource = null,
} = {}) {
    const { language } = useLocale();
    const toolPanelOpen = ref(readStoredBoolean(panelStorageKey, true));

    // ========== 高级特效开关（全部默认关闭） ==========
    const advancedEffectControls = ref({
        fog: false,
        hbao: false,
        tiltShift: false,
        atmosphere: false,
    });

    // 基础大气参数（只开启晨昏半球，其余全部关闭）
    const baseAtmosphereParams = ref({
        enableLighting: true,       // 晨昏线 - 开启
        showGroundAtmosphere: true, // 地面大气 - 开启（默认随高度渐隐联动，可在面板关闭）
        // 地面大气按相机高度自动渐隐：低于下限全关（市/城乡/建筑尺度），高于上限全开（省/国家级视角），中间平滑过渡
        groundAtmosphereAutoFade: true,
        groundAtmosphereFadeLowHeight: 100000,
        groundAtmosphereFadeHighHeight: 500000,
        dynamicAtmosphereLighting: true,
        dynamicAtmosphereLightingFromSun: true,
        atmosphereLightIntensity: 16,
        atmosphereHueShift: 1,
        atmosphereSaturationShift: 1,
        atmosphereBrightnessShift: -0.12,
        // 天空大气（地球外环光晕）：光强按比例放大让渐隐尾部自然延伸（更厚且保持渐变）；
        // 亮度偏移是恒定加亮，过大会把渐隐区抬成均匀色带并在大气壳边界形成硬边；
        // Rayleigh 标高控制蓝色向外衰减的距离，是渐变厚度的物理参数
        skyAtmosphereLightIntensity: 6.5,
        skyAtmosphereBrightnessShift: 0.36,
        skyAtmosphereSaturationShift: 0.1,
        skyAtmosphereRayleighScaleHeight: 20000,
        lightingFadeInDistance: 0,
        lightingFadeOutDistance: Number.MAX_SAFE_INTEGER,
        nightFadeInDistance: 0,
        nightFadeOutDistance: Number.MAX_SAFE_INTEGER,
        fogEnabled: false,          // 雾效 - 关闭
        fogDensity: 0.00012,
        fogMinimumBrightness: 0.035,
        sunShow: true,              // 太阳 - 开启（晨昏线必需）
        moonShow: true,             // 月亮 - 开启
        skyBoxShow: true,           // 星空盒 - 开启
    });

    // Tellux 大气渲染参数（默认开启，与 baseAtmosphereParams 配合）
    const atmosphereParams = ref({
        dayNightEnabled: true,
        nightFactor: 0,
        moonLightEnabled: true,
        moonLightIntensity: 0.18,
        ambientIntensity: 0.08,
        starsEnabled: true,
        starsIntensity: 1.0,
    });

    // 体积云独立参数（cesium-clouds-atmosphere 管线；默认关闭懒加载；开启时默认「流畅」档）
    const cloudParams = ref(
        applyCloudQualityPreset(
            {
                cloudsEnabled: false,
                quality: DEFAULT_CLOUD_QUALITY,
                altitudeMode: 'absolute',
            },
            DEFAULT_CLOUD_QUALITY,
        ),
    );

    const fluidParams = ref({
        threshold: 10,
        blend: 20,
        lightStrength: 3,
        waterColor: '#0d4fa3',
        waterLevel: null,
        floodSpeed: 5,
    });

    // 人物漫游调试参数
    const playerParams = ref({
        speed: 300,
        flySpeed: 55000,
        gravity: -2400,
        jumpHeight: 600,
        sensitivity: 5,
        acceleration: 30,
        deceleration: 30,
        spawnHeight: 500,
    });

    const fluidState = ref({
        isPicking: false,
        hasFluid: false,
        selectedText: '',
        waterLevel: null,
        waterLevelMin: null,
        waterLevelMax: null,
        floodSimActive: false,
    });

    // ========== 热带浅水参数 ==========
    const shallowWaterVisible = ref(false);
    const shallowWaterParams = ref({
        elevation: 30,
        azimuth: 150,
        clarity: 0.085,
        causticStrength: 0.9,
        waterColor: '#2bb3c4',
        waveHeight: 0.5,
        foamWidth: 2.4,
        reflection: 0.38,
        cloudCoverage: 0.58,
        lightningEnabled: true,
        lightningInterval: 2.0,
    });

    // ========== 三维分析（通视/限高）参数与运行时（Analysis 文件夹模块，懒创建） ==========
    const analysisParams = ref({ ...DEFAULT_ANALYSIS_PARAMS });
    const analysisState = ref({ ...DEFAULT_ANALYSIS_STATE });

    let analysisRuntime = null;
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

    let planarRouteController = null;
    let planarRouteControllerLoading = null;

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
                        onStateChange: (patch) => {
                            planarRouteState.value = { ...planarRouteState.value, ...patch };
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
    async function dispatchPlanarAction(actionId) {
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

    let routeFlyController = null;
    let routeFlyControllerLoading = null;

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
                        onStateChange: (patch) => {
                            routeFlyState.value = { ...routeFlyState.value, ...patch };
                        },
                        onWorkingSetChange: (info) => syncRouteFlySource?.(info),
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
    let routeImportInput = null;
    let routeErrorTimer = null;

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
                    .then((controller) => controller?.applyImportFile(file))
                    .catch((error) => {
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
    function setRouteFlyError(text) {
        routeFlyState.value = { ...routeFlyState.value, errorText: text };
        if (routeErrorTimer) clearTimeout(routeErrorTimer);
        routeErrorTimer = setTimeout(() => {
            routeFlyState.value = { ...routeFlyState.value, errorText: '' };
            routeErrorTimer = null;
        }, 4000);
    }

    async function dispatchRouteFlyAction(actionId) {
        const controller = await ensureRouteFlyController();
        if (!controller) return;

        if (actionId === 'startFly') {
            try {
                _playerController?.stopPlayer?.();
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
                    } catch (error) {
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
        } catch (error) {
            const code = String(error?.message || '');
            const errKeys = {
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

    function handleToolAction({ moduleId, actionId }) {
        const actionMap = {
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
                setTakeoffPoint: () => void dispatchPlanarAction('setTakeoffPoint'),
                importKmz: () => void dispatchPlanarAction('importKmz'),
                saveKmz: () => void dispatchPlanarAction('saveKmz'),
                clearAll: () => void dispatchPlanarAction('clearAll'),
            },
            routeFly: {
                drawRoute: () => void dispatchRouteFlyAction('drawRoute'),
                startFly: () => void dispatchRouteFlyAction('startFly'),
                suspend: () => void dispatchRouteFlyAction('suspend'),
                speedUp: () => void dispatchRouteFlyAction('speedUp'),
                speedDown: () => void dispatchRouteFlyAction('speedDown'),
                stop: () => void dispatchRouteFlyAction('stop'),
                importRoute: () => openRouteImportDialog(),
                exportRoute: () => void dispatchRouteFlyAction('exportRoute'),
                clearAll: () => void dispatchRouteFlyAction('clearAll'),
            },
        };

        actionMap[moduleId]?.[actionId]?.();
    }

    function handleToolControlChange({ moduleId, controlId, value }) {
        // 三维分析控件（参数写回 + 统一分发给 Analysis 运行时；按钮 value 为函数，仅按 id 触发动作）
        if (moduleId === 'analysis') {
            if (controlId in analysisParams.value && typeof value !== 'function') {
                analysisParams.value = { ...analysisParams.value, [controlId]: value };
            }
            ensureAnalysisRuntime().handleControlChange(controlId, value, analysisParams.value);
            return;
        }

        // 面状航线控件（globeConfig 为模块内响应式单例，控制器统一写回 + 重规划）
        if (moduleId === 'planarRoute') {
            void ensurePlanarRouteController().then((controller) => {
                controller?.setParam(controlId, value);
            });
            return;
        }

        // 路线漫游控件（id → 控制器 setter 直驱；布尔/字符串/数值分流）
        if (moduleId === 'routeFly') {
            void ensureRouteFlyController().then((controller) => {
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

        // 风场控件（面板参数名 → 引擎参数名映射）
        if (moduleId === 'wind') {
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

        // 流体控件
        if (moduleId === 'fluid' && controlId in fluidParams.value) {
            fluidParams.value = {
                ...fluidParams.value,
                [controlId]: controlId === 'waterColor' ? value : Number(value),
            };
            // floodSpeed 变化同步到 FluidSimulationPanel
            if (controlId === 'floodSpeed') {
                fluidPanelRef?.value?.setFloodSpeed?.(Number(value));
            }
            return;
        }

        // 热带浅水控件
        if (moduleId === 'shallowWater' && controlId in shallowWaterParams.value) {
            shallowWaterParams.value = {
                ...shallowWaterParams.value,
                [controlId]: controlId === 'waterColor' || controlId === 'lightningEnabled'
                    ? value
                    : Number(value),
            };
            return;
        }

        // 人物漫游控件
        if (moduleId === 'player' && controlId in playerParams.value) {
            const numVal = Number(value);
            playerParams.value = { ...playerParams.value, [controlId]: numVal };
            // spawnHeight 是启动前参数，无需同步到运行时
            if (controlId === 'spawnHeight') return;
            const p = _playerController?.getPlayerInstance?.();
            if (p) {
                if (controlId === 'speed') p.setPlayerSpeed(numVal);
                else if (controlId === 'flySpeed') p.setPlayerFlySpeed(numVal);
                else if (controlId === 'gravity') p.setGravity(numVal);
                else if (controlId === 'jumpHeight') p.setJumpHeight(numVal);
                else if (controlId === 'sensitivity') p.setMouseSensitivity(numVal);
                else if (controlId === 'acceleration') p.setAcceleration(numVal);
                else if (controlId === 'deceleration') p.setDeceleration(numVal);
            }
            return;
        }

        // ========== 合并的 atmosphere 模块处理 ==========
        if (moduleId === 'atmosphere') {
            // 高级特效开关（fog/hbao/tiltShift/atmosphere）
            if (controlId in advancedEffectControls.value) {
                advancedEffectControls.value = {
                    ...advancedEffectControls.value,
                    [controlId]: Boolean(value),
                };
                return;
            }

            // 基础大气参数（Cesium 原生）
            if (controlId in baseAtmosphereParams.value) {
                baseAtmosphereParams.value = {
                    ...baseAtmosphereParams.value,
                    [controlId]: value,
                };
                return;
            }

            // Tellux 大气渲染参数
            if (controlId === 'atmosphereEnabled') {
                advancedEffectControls.value = {
                    ...advancedEffectControls.value,
                    atmosphere: Boolean(value),
                };
                return;
            }
            if (controlId in atmosphereParams.value) {
                atmosphereParams.value = {
                    ...atmosphereParams.value,
                    [controlId]: value,
                };
            }
        }

        // ========== 体积云独立模块（布尔开关 / 数值滑杆 / 性能预设） ==========
        if (moduleId === 'cloud') {
            // 性能预设：一键覆盖参数组合（保留 cloudsEnabled）
            if (controlId === 'quality') {
                cloudParams.value = applyCloudQualityPreset(cloudParams.value, value);
                return;
            }
            if (controlId in cloudParams.value) {
                const booleanKeys = new Set([
                    'cloudsEnabled',
                    'lensFlareEnabled',
                    'useShadowBuffer',
                    'shadowLengthEnabled',
                    'hazeEnabled',
                    'temporalEnabled',
                    'atmosphereExposureFollowTimeline',
                    'atmosphereStageEnabled',
                    'aerialStageEnabled',
                ]);
                // 字符串枚举键（select 控件），不能走 Number() 转换
                const stringKeys = new Set(['altitudeMode']);
                cloudParams.value = {
                    ...cloudParams.value,
                    [controlId]: booleanKeys.has(controlId)
                        ? Boolean(value)
                        : stringKeys.has(controlId)
                            ? String(value)
                            : Number(value),
                };
            }
        }
    }

    function handleFluidStateChange(state) {
        const nextWaterLevel = toFiniteNumberOrNull(state?.waterLevel);
        const nextWaterLevelMin = toFiniteNumberOrNull(state?.waterLevelMin);
        const nextWaterLevelMax = toFiniteNumberOrNull(state?.waterLevelMax);
        const nextFloodSpeed = toFiniteNumberOrNull(state?.floodSpeed);

        fluidState.value = {
            isPicking: !!state?.isPicking,
            hasFluid: !!state?.hasFluid,
            selectedText: state?.selectedText || '',
            waterLevel: nextWaterLevel,
            waterLevelMin: nextWaterLevelMin,
            waterLevelMax: nextWaterLevelMax,
            floodSimActive: !!state?.floodSimActive,
        };

        // 同步洪水速度（面板自动计算的默认值 = 值域/10）
        if (nextFloodSpeed !== null) {
            fluidParams.value = {
                ...fluidParams.value,
                floodSpeed: nextFloodSpeed,
            };
        }

        if (nextWaterLevel !== null) {
            fluidParams.value = {
                ...fluidParams.value,
                waterLevel: nextWaterLevel,
            };
        }
    }

    function cleanupTools() {
        wind.clearWind2D?.();
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
        detachPlanarWorkingSet: () => {
            planarRouteController?.detachForExternalRemoval();
        },
        detachRouteFlyWorkingSet,
    };
}