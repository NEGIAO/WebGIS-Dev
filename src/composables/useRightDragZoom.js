const DEFAULT_SENSITIVITY = 0.012;
const DEFAULT_TRIGGER_PX = 3;
const DEFAULT_SUPPRESS_CONTEXT_MENU_MS = 180;

/**
 * 为 OpenLayers 地图启用“右键按住拖拽缩放”。
 * 向上拖动放大，向下拖动缩小。
 */
export function createRightDragZoomController(map, options = {}) {
    if (!map) {
        return {
            dispose: () => {},
            shouldSuppressContextMenu: () => false
        };
    }

    const sensitivity = Number.isFinite(options.sensitivity)
        ? Number(options.sensitivity)
        : DEFAULT_SENSITIVITY;
    const triggerPx = Number.isFinite(options.triggerPx)
        ? Number(options.triggerPx)
        : DEFAULT_TRIGGER_PX;
    const suppressContextMenuMs = Number.isFinite(options.suppressContextMenuMs)
        ? Number(options.suppressContextMenuMs)
        : DEFAULT_SUPPRESS_CONTEXT_MENU_MS;

    const view = map.getView();
    const viewport = map.getViewport();
    const state = {
        active: false,
        moved: false,
        startY: 0,
        startZoom: 0,
        suppressContextMenuUntil: 0
    };

    const onPointerDown = (event) => {
        if (event.button !== 2) return;
        state.active = true;
        state.moved = false;
        state.startY = event.clientY;
        state.startZoom = Number(view?.getZoom?.() ?? 0);
        event.preventDefault();
    };

    const onPointerMove = (event) => {
        if (!state.active) return;

        const deltaY = event.clientY - state.startY;
        if (Math.abs(deltaY) > triggerPx) {
            state.moved = true;
        }

        const minZoom = Number(view?.getMinZoom?.() ?? 0);
        const maxZoom = Number(view?.getMaxZoom?.() ?? 22);
        const targetZoom = state.startZoom - (deltaY * sensitivity);
        const clampedZoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));

        view?.setZoom?.(clampedZoom);
        event.preventDefault();
    };

    const onPointerUp = () => {
        if (!state.active) return;
        if (state.moved) {
            state.suppressContextMenuUntil = Date.now() + suppressContextMenuMs;
        }
        state.active = false;
    };

    const onPointerCancel = () => {
        state.active = false;
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerCancel);

    return {
        dispose() {
            viewport.removeEventListener('pointerdown', onPointerDown);
            viewport.removeEventListener('pointermove', onPointerMove);
            viewport.removeEventListener('pointerup', onPointerUp);
            viewport.removeEventListener('pointercancel', onPointerCancel);
        },
        shouldSuppressContextMenu() {
            return Date.now() < state.suppressContextMenuUntil;
        }
    };
}
