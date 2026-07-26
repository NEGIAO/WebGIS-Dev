/**
 * 启动视图解析特性（容器瘦身二轮·自 MapContainer 抽离，行为保持一致）。
 *
 * 职责：
 * - getInitialViewState：由 URL 参数（分享链接）或默认值解析初始视图中心/缩放
 * - applyDeferredUrlParams：底图稳定后延迟应用 URL 坐标参数（Cesium 模式跳过、
 *   失败也标记已应用防重试），并在完成后释放启动恢复守卫 + 绑定 moveend 写回
 */
export function createStartupViewResolver({
    mapInstanceRef,
    urlParamStore,
    startupUrlRestoreGuard,
    bindActiveMapViewSync,
    flyToView,
    parseUrlToState,
    INITIAL_VIEW,
}) {
    function applyDeferredUrlParams() {
        const finishInitialRestore = () => {
            startupUrlRestoreGuard.markInitialRestoreApplied();
            bindActiveMapViewSync();
        };

        if (!mapInstanceRef?.value) {
            console.warn('[MapContainer] Cannot apply deferred params: mapInstance not ready');
            finishInitialRestore();
            return;
        }

        // Cesium 模式下 OL 面板被隐藏，参数恢复由 CesiumContainer.restoreCameraFromUrl 处理。
        // 此处显式跳过避免隐式依赖 getValidCoordinateParams 返回 null。
        if (urlParamStore.getPendingParams().view === 'cesium') {
            urlParamStore.markParamsAsApplied();
            finishInitialRestore();
            return;
        }

        const validParams = urlParamStore.getValidCoordinateParams();
        if (!validParams) {
            // 没有有效的地理坐标参数，直接标记已应用
            urlParamStore.markParamsAsApplied();
            finishInitialRestore();
            return;
        }

        try {
            // 应用坐标、缩放、图层索引
            flyToView({
                lng: validParams.lng,
                lat: validParams.lat,
                z: validParams.z,
                l: validParams.l,
                duration: 500, // 应用参数时的动画持续时间
            });

            // 释放启动守卫后再绑定 moveend，避免 flyToView 动画产生的首次 moveend 覆盖分享链接。
            urlParamStore.markParamsAsApplied();
            finishInitialRestore();
        } catch (error) {
            console.error('[MapContainer] Failed to apply deferred URL params:', error);
            urlParamStore.markParamsAsApplied(); // 即使失败也标记已应用，防止重复尝试
            finishInitialRestore();
        }
    }

    /** 由 URL 参数（分享链接直达）或默认值解析初始视图状态 */
    function getInitialViewState() {
        const routeState = parseUrlToState();
        if (Number.isFinite(routeState?.lng) && Number.isFinite(routeState?.lat)) {
            return {
                center: [routeState.lng, routeState.lat],
                zoom: Number.isFinite(routeState.zoom) ? routeState.zoom : INITIAL_VIEW.zoom,
            };
        }
        return INITIAL_VIEW;
    }

    return { applyDeferredUrlParams, getInitialViewState };
}
