/**
 * MapCommandBus - fixed Agent map command router.
 *
 * It intentionally has no set_url, navigate, or arbitrary-command entry point.
 * URL updates remain owned by the existing OL/Cesium synchronization chains.
 */

/** 支持的地图引擎标识 */
export type MapView = 'ol' | 'cesium';

/** 单个指令的静态规格（白名单，禁止任意指令下发） */
interface MapCommandSpec {
    supportedViews: readonly MapView[];
    special?: boolean;
}

const COMMAND_SPECS: Readonly<Record<string, MapCommandSpec>> = Object.freeze({
    setMapView: { supportedViews: ['ol', 'cesium'], special: true },
    setViewCenter: { supportedViews: ['ol', 'cesium'] },
    setCameraOrientation: { supportedViews: ['cesium'] },
    zoomToExtent: { supportedViews: ['ol', 'cesium'] },
    switchBasemap: { supportedViews: ['ol', 'cesium'] },
    // 搜索结果落图：把命中的 POI 交给各引擎既有的「导入 / 受管图层」通道，
    // 使其出现在 TOC 并沿用系统默认符号，不引入第二套点样式。
    addSearchResultLayer: { supportedViews: ['ol', 'cesium'] },
});

/** 结构化失败结果（成功结果由适配器透传，形状不固定） */
export interface MapCommandError {
    success: false;
    code: string;
    command: string;
    view: MapView | null;
    message: string;
    supportedViews?: readonly MapView[];
}

interface BuildErrorInput {
    code: string;
    command: string;
    view?: MapView | null;
    message: string;
    supportedViews?: readonly MapView[];
}

/** 指令入参：由 LLM / GISCommander 传入，形状随指令而异 */
export type MapCommandParams = Record<string, any>;
/** 指令出参：失败为 MapCommandError，成功由适配器决定附加字段 */
export type MapCommandResponse = Record<string, any>;

function buildError({
    code,
    command,
    view,
    message,
    supportedViews
}: BuildErrorInput): MapCommandError {
    return {
        success: false,
        code,
        command,
        view: view || null,
        ...(supportedViews ? { supportedViews } : {}),
        message,
    };
}

/** 引擎适配器：键为指令名，值为处理函数；captureState 由 setMapView 使用 */
export type MapCommandAdapter = Record<string, any>;

export interface MapCommandBusOptions {
    /** 返回当前激活引擎；非 'cesium' 一律按 'ol' 处理 */
    getActiveView?: () => string | null | undefined;
    /** 切换引擎；返回值仅按真值判断是否成功 */
    switchView?: (view: MapView) => unknown;
    /** 等待目标引擎运行时就绪 */
    waitForViewReady?: (view: MapView) => boolean | Promise<boolean>;
    /** 以引擎标识为键的适配器集合 */
    adapters?: Record<string, MapCommandAdapter>;
}

export interface MapCommandBus {
    execute(command: string, params?: MapCommandParams): Promise<MapCommandResponse>;
    getActiveView(): MapView;
    getSupportedCommands(): string[];
}

/** 无参调用时的共享空值（只读使用，等价于每次新建 {}） */
const DEFAULT_BUS_OPTIONS: MapCommandBusOptions = Object.freeze({});
const DEFAULT_PARAMS: MapCommandParams = Object.freeze({});
const DEFAULT_ADAPTERS: Record<string, MapCommandAdapter> = Object.freeze({});

export function createMapCommandBus(options: MapCommandBusOptions = DEFAULT_BUS_OPTIONS): MapCommandBus {
    const {
        getActiveView,
        switchView,
        waitForViewReady = () => true,
        adapters = DEFAULT_ADAPTERS,
    } = options;
    const getNormalizedActiveView = (): MapView => getActiveView?.() === 'cesium' ? 'cesium' : 'ol';

    async function executeSetMapView(params: MapCommandParams = DEFAULT_PARAMS): Promise<MapCommandResponse> {
        const command = 'setMapView';
        const targetView: MapView | null = params.view === 'cesium'
            ? 'cesium'
            : params.view === 'ol'
                ? 'ol'
                : null;
        const currentView = getNormalizedActiveView();
        if (!targetView) {
            return buildError({
                code: 'INVALID_ARGUMENT',
                command,
                view: currentView,
                message: 'view must be ol or cesium',
            });
        }

        if (targetView !== currentView) {
            const switched = await switchView?.(targetView);
            if (!switched) {
                return buildError({
                    code: 'VIEW_SWITCH_FAILED',
                    command,
                    view: currentView,
                    message: `Failed to switch to the ${targetView} view`,
                });
            }
        }

        const ready = await waitForViewReady(targetView);
        if (!ready) {
            return buildError({
                code: 'MAP_RUNTIME_NOT_READY',
                command,
                view: targetView,
                message: `The ${targetView} map runtime did not become ready in time`,
            });
        }

        const adapter = adapters[targetView];
        return {
            success: true,
            code: 'OK',
            command,
            view: targetView,
            message: targetView === 'cesium' ? 'Switched to the Cesium 3D view' : 'Switched to the OpenLayers 2D view',
            resultingMapState: adapter?.captureState?.() || { view: targetView },
        };
    }

    async function execute(command: string, params: MapCommandParams = DEFAULT_PARAMS): Promise<MapCommandResponse> {
        const spec = COMMAND_SPECS[command];
        const activeView = getNormalizedActiveView();
        if (!spec) {
            return buildError({
                code: 'UNKNOWN_COMMAND',
                command: String(command || ''),
                view: activeView,
                message: `Unknown map command: ${String(command || '')}`,
            });
        }

        try {
            if (spec.special) return await executeSetMapView(params);

            if (!spec.supportedViews.includes(activeView)) {
                return buildError({
                    code: 'COMMAND_UNSUPPORTED_FOR_VIEW',
                    command,
                    view: activeView,
                    supportedViews: spec.supportedViews,
                    message: `Command ${command} is not supported in the active ${activeView} view`,
                });
            }

            const adapter = adapters[activeView];
            const handler = adapter?.[command];
            if (typeof handler !== 'function') {
                return buildError({
                    code: 'MAP_RUNTIME_NOT_READY',
                    command,
                    view: activeView,
                    message: `The ${activeView} command adapter is not ready`,
                });
            }

            const result = await handler(params || {});
            return {
                command,
                view: activeView,
                ...(result || {}),
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'unknown error';
            return buildError({
                code: 'COMMAND_EXECUTION_FAILED',
                command,
                view: activeView,
                message: `Map command failed: ${msg}`,
            });
        }
    }

    return {
        execute,
        getActiveView: getNormalizedActiveView,
        getSupportedCommands: () => Object.keys(COMMAND_SPECS),
    };
}
