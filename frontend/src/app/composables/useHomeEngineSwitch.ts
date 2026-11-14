/**
 * 功能名称：HomeView 2D/3D 引擎切换、视口尺度对齐、Cesium 懒加载与 Agent 地图总线 Composable
 * 说    明：统一承载 OL↔Cesium 视角换算与 Precision 校正环、isEngineSwitching 同步冻结窗口、
 *           CesiumContainer 懒加载与 useTimerRegistry 看门狗、Agent 命令总线及跨视图状态同步。
 */
import { computed, markRaw, nextTick, provide, ref, shallowRef, watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { showLoading, hideLoading } from '@common/ui/loading';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';
import {
    convertOlViewToCesium,
    convertCesiumViewToOl,
    canonicalScaleToOlView,
    nearlyEqual,
    olZoomToCesiumHeight,
} from '@common/utils/viewScale';
import { encodeCesiumPoseState } from '@common/url-state/crypto';
import {
    readQueryValue as readQueryFromSnapshot,
    getCurrentQuerySnapshot,
} from '@common/url-state/urlQueryReader';
import { createBasemapUrlMappingFeature } from '@common/url-state/useBasemapUrlMapping';
import {
    URL_LAYER_OPTIONS,
    getLayerCategory,
    getLayerGroup,
} from '@ol/basemap/constants/basemapResolver';
import { createMapCommandBus } from '@common/chat/agent/MapCommandBus';
import {
    createCesiumMapCommandAdapter,
    createOlMapCommandAdapter,
} from '@common/chat/agent/mapCommandAdapters';
import type { RuntimeMapState } from '@common/chat/agent/mapCommand/shared';
import { setActiveEngineType } from '@common/map-adapter';
import { MAP_VIEW_CESIUM, MAP_VIEW_OL } from '@ol/url-state/useMapViewUrlState';
import { importCesiumContainerWithRetry } from './useLazyModules';

export interface UseHomeEngineSwitchDeps {
    mapContainerRef: Ref<any>;
    cesiumContainerRef: Ref<any>;
    is3DMode: Ref<boolean>;
    isWeatherBoardMode: Ref<boolean>;
    sharedCustomBasemapUrl: Ref<string>;
    getCurrentMapView: () => string;
    replaceMapView: (view: string, opts?: any) => Promise<any>;
}

function parseFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function formatZParam(value: unknown): string | null {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return null;
    return numberValue.toFixed(2);
}

export function useHomeEngineSwitch(deps: UseHomeEngineSwitchDeps) {
    const {
        mapContainerRef,
        cesiumContainerRef,
        is3DMode,
        isWeatherBoardMode,
        sharedCustomBasemapUrl,
        getCurrentMapView,
        replaceMapView,
    } = deps;

    const message = useMessage();
    const { t } = useLocale();
    const route = useRoute();
    const { later, cancel } = useTimerRegistry();

    const { getLayerIdByIndex, getLayerIndexById } = createBasemapUrlMappingFeature({
        urlLayerOptions: URL_LAYER_OPTIONS,
        getLayerCategoryById: (layerId?: string) => (layerId ? getLayerCategory(layerId) : null),
        getLayerGroupById: (layerId?: string) => (layerId ? getLayerGroup(layerId) : null),
    });

    const CesiumContainer = shallowRef<any>(null);
    const isEngineSwitching = ref(false);
    const isCesiumLoaded = ref(false);
    const isCesiumLoading = ref(false);
    let _cesiumLoadPromise: Promise<boolean> | null = null;
    let activeWatchdogHandle: ReturnType<typeof later> | null = null;
    const latestCesiumOlEquivalent = ref<any>(null);
    let lastOlToCesiumTarget: { canonicalResolution: number; analyticHeight: number } | null = null;

    const readQueryValue = (key: string) => readQueryFromSnapshot(key, route.query);

    const olMap = computed(() => mapContainerRef.value?.mapInstance ?? null);
    provide('olMap', olMap);

    function waitForOlMapIdle(
        map: any,
        { timeoutMs = 2500, stableMs = 120 }: { timeoutMs?: number; stableMs?: number } = {},
    ): Promise<{ status: 'idle' | 'timeout' | 'destroyed' }> {
        return new Promise((resolve) => {
            const startedAt = Date.now();
            let stableSince: number | null = null;

            const check = () => {
                const view = map?.getView?.();
                if (!view || !map.getTargetElement?.()) {
                    resolve({ status: 'destroyed' });
                    return;
                }

                const now = Date.now();
                const moving = !!(view.getAnimating?.() || view.getInteracting?.());
                if (moving) {
                    stableSince = null;
                } else if (stableSince === null) {
                    stableSince = now;
                } else if (now - stableSince >= stableMs) {
                    resolve({ status: 'idle' });
                    return;
                }

                if (now - startedAt >= timeoutMs) {
                    resolve({ status: 'timeout' });
                    return;
                }
                later(check, 32);
            };

            check();
        });
    }

    function captureOlRuntimeState(): RuntimeMapState {
        const state = mapContainerRef.value?.getCurrentViewState?.();
        if (!state) return { view: 'ol' };
        const size = Array.isArray(state.size) ? state.size : [];
        const layerIndex = Number.isInteger(state.layerIndex) ? state.layerIndex : null;
        const basemapId = layerIndex === null ? null : getLayerIdByIndex(layerIndex);

        return {
            view: 'ol',
            center: { lng: state.lng, lat: state.lat },
            ol: {
                zoom: state.zoom,
                resolution: state.resolution,
                viewportWidth: size[0],
                viewportHeight: size[1],
            },
            basemap: {
                index: layerIndex,
                id: basemapId,
            },
        };
    }

    const agentMapRuntimeBridge = {
        capture(): RuntimeMapState {
            if (is3DMode.value) {
                return cesiumContainerRef.value?.getCurrentViewState?.() || { view: 'cesium' };
            }
            return captureOlRuntimeState();
        },
        waitForIdle(options: { timeoutMs?: number; stableMs?: number } = {}) {
            if (is3DMode.value) {
                return (
                    cesiumContainerRef.value?.waitForViewIdle?.(options) ||
                    Promise.resolve({ status: 'destroyed' })
                );
            }
            return waitForOlMapIdle(mapContainerRef.value?.mapInstance || null, options);
        },
    };
    provide('agentMapRuntimeBridge', agentMapRuntimeBridge);

    const setCustomBasemapByUrl = (url: string) => {
        if (is3DMode.value) {
            return cesiumContainerRef.value?.handleCustomBasemapSubmit?.({ url });
        }
        const handler = mapContainerRef.value?.setCustomBasemapByUrl;
        if (typeof handler !== 'function') {
            return {
                success: false,
                message: t('home.basemapNotReady'),
            };
        }
        return handler(url);
    };
    provide('setCustomBasemapByUrl', setCustomBasemapByUrl);

    async function ensureCesiumLoaded(): Promise<boolean> {
        if (isCesiumLoaded.value) return true;
        if (_cesiumLoadPromise) return _cesiumLoadPromise;

        isCesiumLoading.value = true;
        showLoading(t('loading.cesiumAssets'), { timeoutMs: 0 });

        cancel(activeWatchdogHandle);
        const watchdogHandle = later(() => {
            if (!isCesiumLoading.value) return;
            message.warning(t('loading.cesiumLoadTimeout'), { closable: true });
            isCesiumLoading.value = false;
            hideLoading();
        }, 120000);
        activeWatchdogHandle = watchdogHandle;

        const clearWatchdog = () => {
            cancel(watchdogHandle);
            if (activeWatchdogHandle === watchdogHandle) activeWatchdogHandle = null;
        };

        _cesiumLoadPromise = (async () => {
            try {
                const module = await importCesiumContainerWithRetry();
                CesiumContainer.value = markRaw(module.default);
                isCesiumLoaded.value = true;
                return true;
            } catch (error: any) {
                message.error(t('loading.cesiumLoadFailed', { error: error?.message || error }));
                _cesiumLoadPromise = null;
                return false;
            } finally {
                isCesiumLoading.value = false;
                hideLoading();
                clearWatchdog();
            }
        })();
        return _cesiumLoadPromise;
    }

    function handleCesiumReady(): void {
        if (!isCesiumLoading.value) return;
        isCesiumLoading.value = false;
        hideLoading();
    }

    function handleCesiumLoadFailed(): void {
        if (!isCesiumLoading.value) return;
        isCesiumLoading.value = false;
        hideLoading();
    }

    function readOlViewFromUrl(fallbackSize: number[] | null = null) {
        const lng = parseFiniteNumber(readQueryValue('lng'));
        const lat = parseFiniteNumber(readQueryValue('lat'));
        if (lng === null || lat === null) return null;

        const rawZoom = parseFiniteNumber(readQueryValue('z'));
        return {
            lng,
            lat,
            zoom: rawZoom !== null ? rawZoom : 17,
            resolution: null,
            size: Array.isArray(fallbackSize) ? fallbackSize : null,
        };
    }

    function buildCesiumQueryPatchFromOl(): Record<string, any> {
        const liveState = mapContainerRef.value?.getCurrentViewState?.();

        if (getCurrentMapView() === MAP_VIEW_CESIUM) {
            lastOlToCesiumTarget = null;
            const urlHeight = parseFiniteNumber(readQueryValue('z'));
            return {
                z: formatZParam(urlHeight !== null && urlHeight > 0 ? urlHeight : 6000000),
                layerId: '',
                customUrl: '',
            };
        }

        const settled = mapContainerRef.value?.isStartupViewSettled?.() !== false;
        const state = settled ? liveState : readOlViewFromUrl(liveState?.size) || liveState;

        if (!state || !Number.isFinite(state.lng) || !Number.isFinite(state.lat)) {
            return {
                z: formatZParam(6000000),
                layerId: '',
                customUrl: '',
            };
        }

        const converted = convertOlViewToCesium({
            zoom: state.zoom,
            resolution: state.resolution ?? undefined,
            center: { longitude: state.lng, latitude: state.lat },
            viewport: state.size ? { width: state.size[0], height: state.size[1] } : undefined,
            targetPitch: -90,
            targetHeading: 0,
            targetRoll: 0,
            earthModel: 'sphere',
        });
        const height = converted ? converted.cesium.height : null;
        lastOlToCesiumTarget = converted
            ? { canonicalResolution: converted.canonicalResolution, analyticHeight: height ?? 0 }
            : null;

        if (globalThis.localStorage?.getItem('__zdebug') === '1') {
            const __cesiumCanvas = cesiumContainerRef.value?.getViewer?.()?.scene?.canvas;
            const __fovy = cesiumContainerRef.value?.getViewer?.()?.camera?.frustum?.fovy;
            // 诊断输出：仅在 localStorage.__zdebug=1 时触发，属刻意保留的排查开关，故豁免 no-console
            // eslint-disable-next-line no-console
            console.info('[zdebug][FWD OL→3D]', {
                olZoom: state.zoom,
                olResolution: state.resolution,
                G_target: converted?.canonicalResolution ?? null,
                h_out: height,
                olViewportH: state.size?.[1] ?? null,
                cesiumCanvasH: __cesiumCanvas?.clientHeight ?? null,
                cesiumFovyRad: __fovy ?? null,
                earthModel: 'sphere',
            });
        }

        const poseCode = encodeCesiumPoseState({ heading: 0, pitch: -90, roll: 0 });
        const patch: Record<string, any> = {
            lng: Number(state.lng).toFixed(6),
            lat: Number(state.lat).toFixed(6),
            z: formatZParam(height ?? 6000000),
            cv: poseCode && poseCode !== '0' ? poseCode : undefined,
        };
        patch.layerId = '';
        if (Number.isInteger(state.layerIndex)) {
            patch.l = String(state.layerIndex);
        }
        patch.customUrl = '';
        return patch;
    }

    function syncOlFromCesiumPayload(payload: any = {}): void {
        const directEquivalent = payload?.olEquivalent;
        const camera = payload?.camera;
        let equivalent = directEquivalent;

        if (!equivalent && camera) {
            const conv = convertCesiumViewToOl({
                height: camera.height,
                pitch: camera.pitch,
                viewport: (() => {
                    const size = mapContainerRef.value?.getMapSize?.();
                    return Array.isArray(size) && size.length === 2
                        ? { width: size[0], height: size[1] }
                        : undefined;
                })(),
                measureGroundResolution: () =>
                    cesiumContainerRef.value?.measureGroundResolution?.() ?? null,
            });
            if (conv) {
                const olSeg = canonicalScaleToOlView({
                    canonicalResolution: conv.canonicalResolution,
                    latitude: camera.lat,
                });
                if (olSeg) {
                    equivalent = { lng: camera.lng, lat: camera.lat, zoom: olSeg.zoom };
                }
            }

            if (globalThis.localStorage?.getItem('__zdebug') === '1') {
                const __cesiumCanvas = cesiumContainerRef.value?.getViewer?.()?.scene?.canvas;
                // 诊断输出：同上，受 localStorage.__zdebug=1 门控
                // eslint-disable-next-line no-console
                console.info('[zdebug][REV 3D→OL]', {
                    camHeight: camera.height,
                    camPitchDeg: camera.pitch,
                    camLatDeg: camera.lat,
                    G_measured: conv?.canonicalResolution ?? null,
                    measuredByRay: conv?.measured ?? null,
                    zoom_recovered: equivalent?.zoom ?? null,
                    prev_zoom: latestCesiumOlEquivalent.value?.zoom ?? null,
                    cesiumCanvasH: __cesiumCanvas?.clientHeight ?? null,
                });
            }
        }

        if (!equivalent) return;
        latestCesiumOlEquivalent.value = equivalent;
        mapContainerRef.value?.syncViewFromCesium?.(equivalent);
    }

    function getCesiumActiveSelection() {
        const presetId = String(cesiumContainerRef.value?.activeBasemap || '').trim();
        if (!presetId) return null;
        return { id: presetId };
    }

    function getCesiumActiveLayerIndex(): number | null {
        const selection = getCesiumActiveSelection();
        if (!selection) return null;
        const idx = getLayerIndexById(selection.id);
        return Number.isInteger(idx) ? (idx as number) : null;
    }

    function buildOlQueryPatchFromCesium(): Record<string, any> | null {
        const equivalent = latestCesiumOlEquivalent.value;
        const patch: Record<string, any> = {};
        if (equivalent) {
            patch.lng = Number(equivalent.lng).toFixed(6);
            patch.lat = Number(equivalent.lat).toFixed(6);
            patch.z = formatZParam(equivalent.zoom);
        }
        patch.layerId = '';
        patch.customUrl = '';
        const cesiumLayerIndex = getCesiumActiveLayerIndex();
        if (cesiumLayerIndex !== null) {
            patch.l = String(cesiumLayerIndex);
        } else {
            const currentLayerIndex = parseFiniteNumber(readQueryValue('l'));
            if (currentLayerIndex !== null) {
                patch.l = String(currentLayerIndex);
            }
        }
        return Object.keys(patch).length ? patch : null;
    }

    async function runMapViewSwitch(
        view: string,
        { writeUrl = true }: { writeUrl?: boolean } = {},
    ): Promise<boolean> {
        const normalizedView = view === MAP_VIEW_CESIUM ? MAP_VIEW_CESIUM : MAP_VIEW_OL;
        const queryPatch =
            normalizedView === MAP_VIEW_CESIUM
                ? buildCesiumQueryPatchFromOl()
                : buildOlQueryPatchFromCesium();

        const preSwitchQuery = getCurrentQuerySnapshot(route.query);

        if (writeUrl) {
            await replaceMapView(normalizedView, queryPatch ? { queryPatch } : undefined);
        }

        if (normalizedView === MAP_VIEW_CESIUM) {
            isWeatherBoardMode.value = false;
            const loaded = await ensureCesiumLoaded();
            if (!loaded) {
                if (writeUrl) await replaceMapView(MAP_VIEW_OL, { queryPatch: preSwitchQuery });
                return false;
            }
            is3DMode.value = true;
            setActiveEngineType('cesium');

            const target = lastOlToCesiumTarget;
            if (target && target.analyticHeight > 0) {
                await nextTick();
                const targetG = target.canonicalResolution;
                const measured = cesiumContainerRef.value?.measureGroundResolution?.();
                if (
                    Number.isFinite(measured) &&
                    measured > 0 &&
                    !nearlyEqual(measured, targetG, 1e-9, 1e-6)
                ) {
                    const curH = cesiumContainerRef.value?.getCameraHeight?.();
                    const correctedH = Number(curH) * (targetG / measured);
                    cesiumContainerRef.value?.setCameraHeightKeepOrientation?.(correctedH);
                    // 尺度校正误差报告：§44 误差分析的唯一数据源，刻意常驻（非调试开关门控）
                    // eslint-disable-next-line no-console
                    console.info(
                        '[ViewScale][Report]',
                        JSON.stringify({
                            source: 'ol',
                            target: 'cesium',
                            sourceZoom: readQueryValue('z'),
                            sourceResolution: null,
                            canonicalResolution: targetG,
                            analyticCameraHeight: target.analyticHeight,
                            measuredGroundResolution: measured,
                            scaleError: measured / targetG,
                            correctedCameraHeight: correctedH,
                        }),
                    );
                }
            }
        } else {
            if (latestCesiumOlEquivalent.value) {
                mapContainerRef.value?.syncViewFromCesium?.(latestCesiumOlEquivalent.value);
            }
            const incomingLayerIndex =
                getCesiumActiveLayerIndex() ??
                parseFiniteNumber(queryPatch?.l || readQueryValue('l'));
            if (Number.isInteger(incomingLayerIndex)) {
                const targetLayerId = getLayerIdByIndex(incomingLayerIndex as number);
                if (targetLayerId === 'custom' && sharedCustomBasemapUrl.value) {
                    await mapContainerRef.value?.setCustomBasemapByUrl?.(
                        sharedCustomBasemapUrl.value,
                    );
                } else if (targetLayerId) {
                    await mapContainerRef.value?.setBaseLayerActive?.(targetLayerId);
                }
            }
            is3DMode.value = false;
            setActiveEngineType('openlayers');
            isCesiumLoading.value = false;
            hideLoading();
            isCesiumLoaded.value = false;
            CesiumContainer.value = null;
            cesiumContainerRef.value = null;
            _cesiumLoadPromise = null;
        }
        return true;
    }

    async function setMapView(
        view: string,
        options: { writeUrl?: boolean } = {},
    ): Promise<boolean> {
        isEngineSwitching.value = true;
        try {
            return await runMapViewSwitch(view, options);
        } finally {
            isEngineSwitching.value = false;
        }
    }

    async function waitForAgentMapViewReady(
        view: string,
        { timeoutMs = 10000 }: { timeoutMs?: number } = {},
    ): Promise<boolean> {
        const startedAt = Date.now();
        await nextTick();
        while (Date.now() - startedAt < timeoutMs) {
            if (view === MAP_VIEW_CESIUM) {
                const viewer = cesiumContainerRef.value?.getViewer?.();
                if (viewer && !viewer.isDestroyed?.() && viewer.camera) return true;
            } else {
                const map = mapContainerRef.value?.mapInstance;
                if (map?.getView?.() && map.getTargetElement?.()) return true;
            }
            await new Promise<void>((resolve) => {
                later(resolve, 50);
            });
        }
        return false;
    }

    const agentOlMapCommandAdapter = createOlMapCommandAdapter({
        getMap: () => mapContainerRef.value?.mapInstance || null,
        getRuntimeState: captureOlRuntimeState,
        setBasemap: (params: Record<string, any> = {}) => {
            if (!mapContainerRef.value) {
                return { success: false, message: 'Map container not ready' };
            }
            if (params.url) {
                return mapContainerRef.value.setCustomBasemapByUrl?.(params.url);
            }
            return mapContainerRef.value.setBaseLayerActive?.(params.presetId);
        },
        addSearchLayer: (payload: any) => mapContainerRef.value?.addSearchResultLayer?.(payload),
    });

    const agentCesiumMapCommandAdapter = createCesiumMapCommandAdapter({
        getViewer: () => cesiumContainerRef.value?.getViewer?.() || null,
        getCesium: () => cesiumContainerRef.value?.getCesium?.() || null,
        getRuntimeState: () =>
            cesiumContainerRef.value?.getCurrentViewState?.() || { view: MAP_VIEW_CESIUM },
        setBasemap: (params: Record<string, any> = {}) => {
            if (!cesiumContainerRef.value) {
                return { success: false, message: 'Cesium container not ready' };
            }
            if (params.url) {
                return cesiumContainerRef.value.handleCustomBasemapSubmit?.({ url: params.url });
            }
            return cesiumContainerRef.value.setBasemapById?.(params.presetId);
        },
        importGeoJson: (payload: any) => cesiumContainerRef.value?.importUserData?.(payload),
    });

    const agentMapCommandBus = createMapCommandBus({
        getActiveView: () => (is3DMode.value ? MAP_VIEW_CESIUM : MAP_VIEW_OL),
        switchView: (view: string) => setMapView(view),
        waitForViewReady: waitForAgentMapViewReady,
        adapters: {
            [MAP_VIEW_OL]: agentOlMapCommandAdapter,
            [MAP_VIEW_CESIUM]: agentCesiumMapCommandAdapter,
        },
    });
    provide('agentMapCommandBus', agentMapCommandBus);

    async function toggle3D(): Promise<void> {
        const nextView = is3DMode.value ? MAP_VIEW_OL : MAP_VIEW_CESIUM;
        await setMapView(nextView);
    }

    watch(
        () => getCurrentMapView(),
        async (nextView) => {
            const normalizedView = nextView === MAP_VIEW_CESIUM ? MAP_VIEW_CESIUM : MAP_VIEW_OL;
            if ((normalizedView === MAP_VIEW_CESIUM) === is3DMode.value) return;
            await setMapView(normalizedView, { writeUrl: false });
        },
    );

    function handleViewSync(payload: any): void {
        const view = String(payload?.view || '').trim();
        if (view === MAP_VIEW_CESIUM) {
            syncOlFromCesiumPayload(payload);
            return;
        }
        if (view === MAP_VIEW_OL && is3DMode.value) {
            is3DMode.value = false;
            setActiveEngineType('openlayers');
        }
    }

    function handleTopBarJumpView(lng: number, lat: number, z: number, layer: any): void {
        if (is3DMode.value) {
            const targetLat = Number(lat) || 0;
            const canvasHeight = cesiumContainerRef.value?.getViewer?.()?.scene?.canvas?.clientHeight;
            const height = olZoomToCesiumHeight({
                zoom: Number(z) || 0,
                centerLat: targetLat,
                viewportHeight:
                    Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : undefined,
            });
            const jumped = cesiumContainerRef.value?.jumpTo?.(lng, targetLat, height);
            if (jumped && Number.isInteger(Number(layer))) {
                const targetLayerId = getLayerIdByIndex(Number(layer));
                if (targetLayerId && targetLayerId !== 'custom') {
                    cesiumContainerRef.value?.setBasemapById?.(targetLayerId);
                }
            }
            return;
        }
        mapContainerRef.value?.updateViewByParams?.(lng, lat, z, layer);
    }

    function clearWatchdogOnUnmount(): void {
        cancel(activeWatchdogHandle);
        activeWatchdogHandle = null;
    }

    return {
        CesiumContainer,
        isEngineSwitching,
        isCesiumLoaded,
        isCesiumLoading,
        handleCesiumReady,
        handleCesiumLoadFailed,
        setMapView,
        waitForAgentMapViewReady,
        toggle3D,
        handleViewSync,
        handleTopBarJumpView,
        clearWatchdogOnUnmount,
    };
}
