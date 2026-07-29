/**
 * MapCommandBus - fixed Agent map command router.
 *
 * It intentionally has no set_url, navigate, or arbitrary-command entry point.
 * URL updates remain owned by the existing OL/Cesium synchronization chains.
 */

const COMMAND_SPECS = Object.freeze({
    setMapView: { supportedViews: ['ol', 'cesium'], special: true },
    setViewCenter: { supportedViews: ['ol', 'cesium'] },
    setCameraOrientation: { supportedViews: ['cesium'] },
    zoomToExtent: { supportedViews: ['ol', 'cesium'] },
    switchBasemap: { supportedViews: ['ol', 'cesium'] },
});

function buildError({ code, command, view, message, supportedViews }) {
    return {
        success: false,
        code,
        command,
        view: view || null,
        ...(supportedViews ? { supportedViews } : {}),
        message,
    };
}

/**
 * @param {Object} options
 * @param {() => 'ol'|'cesium'} options.getActiveView
 * @param {(view: 'ol'|'cesium') => Promise<boolean>|boolean} options.switchView
 * @param {(view: 'ol'|'cesium') => Promise<boolean>|boolean} [options.waitForViewReady]
 * @param {{ol: Object, cesium: Object}} options.adapters
 */
export function createMapCommandBus({
    getActiveView,
    switchView,
    waitForViewReady = () => true,
    adapters = {},
} = {}) {
    const getNormalizedActiveView = () => getActiveView?.() === 'cesium' ? 'cesium' : 'ol';

    async function executeSetMapView(params = {}) {
        const command = 'setMapView';
        const targetView = params.view === 'cesium' ? 'cesium' : params.view === 'ol' ? 'ol' : null;
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

    async function execute(command, params = {}) {
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
        } catch (error) {
            return buildError({
                code: 'COMMAND_EXECUTION_FAILED',
                command,
                view: activeView,
                message: `Map command failed: ${error?.message || 'unknown error'}`,
            });
        }
    }

    return {
        execute,
        getActiveView: getNormalizedActiveView,
        getSupportedCommands: () => Object.keys(COMMAND_SPECS),
    };
}
