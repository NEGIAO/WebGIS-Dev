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
import { CESIUM_NODE_PREFIX } from '@common/layer-tree/protocol';
import { useCesiumLayersStore } from '@cesium-domain/stores/cesiumLayers';
import { useDrawMeasureStore } from '@cesium-domain/stores/useDrawMeasureStore';
import { useOlMeasureStore } from '@ol/stores/useOlMeasureStore';
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

    // 引擎状态店：Agent 只读工具与变更 sink 都要用，须在 bridge 之前初始化（避免 TDZ）
    const cesiumLayersStore = useCesiumLayersStore();
    const drawMeasureStore = useDrawMeasureStore();
    const olMeasureStore = useOlMeasureStore();

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
        /**
         * 聚合当前可被 Agent 操作的图层清单（只读，零副作用）。
         *
         * 2D 侧按 `managedLayerId` 过滤 OL 图层（排除底图/标注等非受管层）；
         * 3D 侧直接读 cesiumLayers store 的元数据。
         * 3D 的 id 带 `cesium:` 前缀以对齐 TOC 节点协议；变更类命令两种写法都接受。
         *
         * @returns 图层数组，字段：id / rawId / engine / name / type / category /
         *          visible / opacity / supportsOpacity / featureCount
         */
        listLayers() {
            const result: Array<Record<string, any>> = [];

            for (const record of cesiumLayersStore.records) {
                result.push({
                    id: `${CESIUM_NODE_PREFIX}${record.id}`,
                    rawId: record.id,
                    engine: 'cesium',
                    name: record.name,
                    type: record.type,
                    category: record.category || null,
                    visible: record.visible,
                    opacity: record.opacity,
                    supportsOpacity: record.supportsOpacity,
                    featureCount: record.featureCount ?? null,
                });
            }

            const olLayers = mapContainerRef.value?.mapInstance?.getLayers?.().getArray?.() || [];
            for (const layer of olLayers) {
                const managedId = String(layer?.get?.('managedLayerId') || '').trim();
                if (!managedId) continue;
                // 标注层与几何层共用 managedLayerId，只保留几何层以免同一图层出现两次
                if (layer?.get?.('isLabelLayer') === true) continue;
                const source = layer?.getSource?.();
                const features = source?.getFeatures?.();
                result.push({
                    id: managedId,
                    rawId: managedId,
                    engine: 'ol',
                    name: String(layer?.get?.('name') || managedId),
                    type: String(layer?.get?.('sourceType') || 'vector'),
                    category: null,
                    visible: layer?.getVisible?.() !== false,
                    opacity: Number(layer?.getOpacity?.() ?? 1),
                    supportsOpacity: true,
                    featureCount: Array.isArray(features) ? features.length : null,
                });
            }

            return result;
        },
        /**
         * 读取最近一次测量结果（2D / 3D 均支持）。
         *
         * 优先级：当前引擎最近一次 → 另一引擎最近一次（切引擎后仍可回答「刚才量的」）。
         * 返回值带 `view` 说明数据来源，避免模型把 2D 的结果当成 3D 的。
         *
         * 2D 侧在 `useDrawMeasure` 的 drawend 时写入 `olMeasure` store（V3.7.10 修复：
         * 此前只写 tooltip DOM，Agent 读不到）。
         */
        getMeasureResult() {
            const cesiumLast = drawMeasureStore.lastResult;
            const olLast = olMeasureStore.lastResult;

            const picked = is3DMode.value
                ? cesiumLast
                    ? { view: 'cesium', data: cesiumLast }
                    : olLast
                      ? { view: 'ol', data: olLast }
                      : null
                : olLast
                  ? { view: 'ol', data: olLast }
                  : cesiumLast
                    ? { view: 'cesium', data: cesiumLast }
                    : null;

            if (!picked) {
                return {
                    success: false,
                    code: 'NO_MEASUREMENT',
                    message: '还没有测量结果，请先用测量工具量一次',
                };
            }
            return { success: true, code: 'OK', view: picked.view, result: picked.data };
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
        // 图层管理（V3.7.9）：容器方法均为 async 且返回 LayerActionResult，
        // Agent 侧据此判断成败，不再出现「UI 没变但模型说已完成」。
        setLayerVisibility: (id: string, visible: boolean) =>
            mapContainerRef.value?.setUserLayerVisibility?.(id, visible),
        setLayerOpacity: (id: string, opacity: number) =>
            mapContainerRef.value?.setUserLayerOpacity?.(id, opacity),
        zoomToLayer: (id: string) => mapContainerRef.value?.zoomToUserLayer?.(id),
        soloLayer: (id: string) => mapContainerRef.value?.soloUserLayer?.(id),
        exportLayerGeoJson: (id: string) =>
            mapContainerRef.value?.exportUserLayerGeoJSON?.({ layerId: id }),
        removeLayer: (id: string) => mapContainerRef.value?.removeUserLayer?.(id),
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
        // 3D 图层操作直连 cesiumLayers store：它是「元数据 + adapter 回调」的唯一入口，
        // 不走容器方法，避免再暴露一层同义 API。
        setLayerVisibility: (id: string, visible: boolean) => cesiumLayersStore.setVisible(id, visible),
        setLayerOpacity: (id: string, opacity: number) => cesiumLayersStore.setOpacity(id, opacity),
        zoomToLayer: (id: string) => cesiumLayersStore.flyTo(id),
        removeLayer: (id: string) => cesiumLayersStore.remove(id),
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
