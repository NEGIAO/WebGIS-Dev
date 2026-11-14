/**
 * 功能名称：Cesium 三维场景启动、初始化、Token 重试、事件联动与资源卸载 Composable
 * 说    明：统一承载 bootCesium 多 Token 轮询重试流水线、initViewer、waitForInitialSceneReady
 *           （集成 useTimerRegistry）、resetCesiumViewerForRetry 与 onUnmounted 全链路清理。
 */
import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import { apiGetRuntimeDefaults } from '@/api/backend';
import { URL_LAYER_OPTIONS } from '@common/basemap/basemapOptions';
import {
    resolvePresetLayerIds,
    resolveRuntimeTokenPoolKey,
} from '@common/basemap/catalogProjection';
import { translate as t } from '@common/app/useLocale';
import { showLoading, hideLoading } from '@common/ui/loading';
import { markRuntimeMapTokenFailed, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';
import { readCachedPreferredBasemap } from '@common/user/stores/useUserPreferencesStore';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';
import { initRequestRenderMode } from '@cesium-domain/composables/interaction/useCesiumRenderMode';
import { setupCloudIntegration } from '@cesium-domain/modules/cloud';

import { configureSolarLighting } from '../scene/cesiumAtmosphere';
import { loadCesiumRuntime } from './cesiumRuntime';
import { configureBeijingTimeSystem } from './cesiumTimeSystem';
import { useCesiumCreditHider } from '../scene/useCesiumCreditHider';
import { useCesiumNavigation } from './useCesiumNavigation';
import { useCesiumInfoBoxTheme } from './useCesiumInfoBoxTheme';
import { assertGroundPlacementRegistry } from '../terrain/groundPlacementService';
import { destroySharedLercPool } from '../../providers/terrain/ArcGISTerrainProvider';
import { destroySharedGeoDecodePool } from '../../providers/terrain/GeoTerrainProvider';

const MAX_TOKEN_RETRY = 5;

export interface UseCesiumBootstrapDeps {
    getCesium: () => any;
    setCesium: (ns: any) => void;
    getViewer: () => any;
    setViewer: (v: any) => void;
    getCesiumIonToken: () => string;
    getTiandituToken: () => string;
    emit: (event: any, ...args: any[]) => void;
    message: any;
    cesiumReady: Ref<boolean>;
    bootComplete: Ref<boolean>;
    showPlayerGuide: Ref<boolean>;
    cesiumToolPanelOpen: Ref<boolean>;
    runtimeMapTokens: Ref<any>;
    activeBasemap: Ref<string>;
    customXyzBasemapUrl: Ref<string>;
    advancedEffectControls: Ref<any>;
    atmosphereParams: Ref<any>;
    cloudParams: Ref<any>;
    layers: any;
    cesiumLayersStore: any;
    drawMeasureStore: any;
    drawMeasureFeature: any;
    routeFeature: any;
    playerController: any;
    dataImport: any;
    modelManager: any;
    cameraEnhanced: any;
    heightSampler: any;
    attrViewExtentSync: any;
    cameraAttitude: Ref<{ heading: number; pitch: number; roll: number; height: number }>;
    syncTileZoomLevel: (cam: any, viewer: any) => void;
    updateGroundAtmosphereFade: () => void;
    setupInteractions: () => void;
    cleanupInteractions: () => void;
    cleanupTools: () => void;
    restoreCameraFromUrl: (opts?: any) => boolean;
    restoreBasemapFromUrl: () => any;
    syncBasemapToUrl: (payload: any) => void;
    bindCameraViewSync: (opts?: any) => void;
    cleanupCameraViewSync: () => void;
    flyToHome: (duration?: number) => any;
    cleanupAdapter: () => void;
    cleanupReverseGeocodePick: () => void;
}

export function useCesiumBootstrap(deps: UseCesiumBootstrapDeps) {
    const {
        getCesium,
        setCesium,
        getViewer,
        setViewer,
        getCesiumIonToken,
        getTiandituToken,
        emit,
        message,
        cesiumReady,
        bootComplete,
        showPlayerGuide,
        cesiumToolPanelOpen,
        runtimeMapTokens,
        activeBasemap,
        customXyzBasemapUrl,
        advancedEffectControls,
        atmosphereParams,
        cloudParams,
        layers,
        drawMeasureStore,
        drawMeasureFeature,
        routeFeature,
        playerController,
        dataImport,
        modelManager,
        cameraEnhanced,
        heightSampler,
        attrViewExtentSync,
        cameraAttitude,
        syncTileZoomLevel,
        updateGroundAtmosphereFade,
        setupInteractions,
        cleanupInteractions,
        cleanupTools,
        restoreCameraFromUrl,
        restoreBasemapFromUrl,
        syncBasemapToUrl,
        bindCameraViewSync,
        cleanupCameraViewSync,
        flyToHome,
        cleanupAdapter,
        cleanupReverseGeocodePick,
    } = deps;

    const { later, frame, cancel } = useTimerRegistry();

    const { installCreditHider, cleanupCreditHider, restoreCreditDisplay } = useCesiumCreditHider({
        getViewer,
    });
    const { initNavigation, cleanupNavigation } = useCesiumNavigation({ getViewer, getCesium });
    const { bindInfoBoxTheme, watchThemeChange, cleanupInfoBoxTheme } = useCesiumInfoBoxTheme({
        getViewer,
    });

    let componentUnmounted = false;
    let bootInProgress = false;
    let _cancelInitialSceneWait: (() => void) | null = null;
    let cloudCleanup: (() => void) | null = null;
    let cleanupAttitudeListener: (() => void) | null = null;
    let cleanupGroundAtmosphereFade: (() => void) | null = null;

    // 监听 activeBasemap 变化兜底：CesiumToolPanel 等其它入口也能触发 URL 同步
    watch(activeBasemap, (next, prev) => {
        if (!next || next === prev) return;
        syncBasemapToUrl({ id: next });
    });

    watch(
        [customXyzBasemapUrl, activeBasemap],
        ([nextUrl, nextBasemap], [previousUrl, previousBasemap]) => {
            if (nextUrl === previousUrl || nextBasemap !== 'custom') return;
            syncBasemapToUrl({ id: 'custom' });

            if (previousBasemap === 'custom' && nextUrl && getViewer() && getCesium()) {
                layers.applyBasemap('custom', { forceReload: true });
            }
        },
    );

    watch(
        () => playerController.isActive.value,
        (active) => {
            if (active) {
                showPlayerGuide.value = true;
                cesiumToolPanelOpen.value = false;
            }
        },
    );

    function haltViewerRenderLoop(v: any): void {
        try {
            const widget = v?.cesiumWidget || v?._cesiumWidget;
            if (widget && !widget.isDestroyed()) {
                widget._useDefaultRenderLoop = false;
                widget._renderLoopRunning = false;
            }
        } catch {
            /* ignore */
        }
    }

    function resetCesiumViewerForRetry(): void {
        cesiumReady.value = false;
        attrViewExtentSync.stop();
        cleanupCameraViewSync();
        cleanupInteractions();
        cleanupTools();
        layers.cleanupLayers();
        cleanupCreditHider();
        cleanupNavigation();
        cleanupInfoBoxTheme();
        try {
            playerController.stopPlayer();
        } catch {
            /* ignore */
        }
        try {
            playerController.clearNavTarget?.();
        } catch {
            /* ignore */
        }
        if (cloudCleanup) {
            cloudCleanup();
            cloudCleanup = null;
        }
        try {
            modelManager.dispose();
        } catch {
            /* ignore */
        }
        try {
            cameraEnhanced.cleanup();
        } catch {
            /* ignore */
        }
        try {
            heightSampler.cleanup();
        } catch {
            /* ignore */
        }
        dataImport.clearAllDataSources();
        const viewer = getViewer();
        if (!viewer) return;
        restoreCreditDisplay(viewer);
        try {
            viewer.destroy();
        } catch (error) {
            console.warn('Cesium viewer retry cleanup warning:', error);
            haltViewerRenderLoop(viewer);
        }
        setViewer(null);
    }

    function waitForInitialSceneReady({ timeoutMs = 30000 } = {}): Promise<void> {
        const activeViewer = getViewer();
        const scene = activeViewer?.scene;
        const globe = scene?.globe;

        if (!activeViewer || !scene) {
            return Promise.reject(new Error('Cesium scene is unavailable'));
        }

        return new Promise((resolve, reject) => {
            let settled = false;
            let renderedFrames = 0;
            let removePostRender: (() => void) | null = null;
            let removeTileProgress: (() => void) | null = null;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            let pendingRafId: number | null = null;

            const cleanup = () => {
                removePostRender?.();
                removeTileProgress?.();
                if (timeoutId !== null) {
                    cancel(timeoutId);
                    timeoutId = null;
                }
                if (pendingRafId !== null) {
                    cancel(pendingRafId);
                    pendingRafId = null;
                }
            };

            const finish = (error: Error | null = null) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (error) reject(error);
                else resolve();
            };

            _cancelInitialSceneWait = () => {
                finish(new Error('Cesium initial scene wait was cancelled'));
            };

            const requestNextFrame = () => {
                if (componentUnmounted || activeViewer.isDestroyed?.()) {
                    finish(new Error('Cesium component was destroyed before initial render'));
                    return;
                }
                scene.requestRender?.();
            };

            const checkReady = () => {
                if (componentUnmounted || activeViewer.isDestroyed?.()) {
                    finish(new Error('Cesium component was destroyed before initial render'));
                    return;
                }

                const tilesLoaded = !globe || globe.tilesLoaded === true;
                if (renderedFrames >= 2 && tilesLoaded) {
                    finish();
                    return;
                }

                if (tilesLoaded && renderedFrames > 0) {
                    pendingRafId = frame(requestNextFrame);
                }
            };

            removePostRender = scene.postRender.addEventListener(() => {
                renderedFrames += 1;
                checkReady();
            });

            if (globe?.tileLoadProgressEvent) {
                removeTileProgress = globe.tileLoadProgressEvent.addEventListener(
                    (pendingTiles: number) => {
                        if (pendingTiles === 0) requestNextFrame();
                    },
                );
            }

            timeoutId = later(() => {
                finish(new Error(`Cesium initial scene load timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            requestNextFrame();
        });
    }

    function initViewer(): void {
        assertGroundPlacementRegistry();
        try {
            drawMeasureFeature.reset();
        } catch {
            /* ignore */
        }
        try {
            drawMeasureStore.reset();
        } catch {
            /* ignore */
        }
        try {
            routeFeature.reset();
        } catch {
            /* ignore */
        }

        const Cesium = getCesium();
        const mapCtor = typeof Cesium.Map === 'function' ? Cesium.Map : Cesium.Viewer;
        const imageryProviderViewModels = layers.createImageryProviderViewModels();
        const terrainProviderViewModels = layers.createTerrainProviderViewModels();
        const viewer = new mapCtor('cesiumContainer', {
            baseLayerPicker: true,
            geocoder: true,
            homeButton: true,
            infoBox: true,
            selectionIndicator: true,
            timeline: true,
            animation: true,
            sceneModePicker: true,
            navigationHelpButton: false,
            imageryProviderViewModels,
            selectedImageryProviderViewModel: layers.getSelectedImageryProviderViewModel(
                imageryProviderViewModels,
            ),
            terrainProviderViewModels,
            selectedTerrainProviderViewModel: layers.getSelectedTerrainProviderViewModel(
                terrainProviderViewModels,
            ),
            shouldAnimate: true,
            useBrowserRecommendedResolution: false,
        });
        setViewer(viewer);

        viewer.scene.debugShowFramesPerSecond = true;
        viewer.scene.globe.terrainExaggeration = 1;
        viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0;
        viewer.scene.globe.baseColor = Cesium.Color.WHITE;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
        viewer.scene.backgroundColor = Cesium.Color.WHITE;
        viewer.scene.globe.showGroundAtmosphere = false;
        configureBeijingTimeSystem(viewer, Cesium);
        configureSolarLighting(viewer);
        initRequestRenderMode(viewer);

        installCreditHider();
        layers.bindLayerPickerStateSync();
        bindInfoBoxTheme();
        watchThemeChange();
        if (!restoreCameraFromUrl({ duration: 0 })) {
            flyToHome(0);
        }

        try {
            cloudCleanup = setupCloudIntegration({
                viewer,
                cloudParams,
                atmosphereParams,
                advancedEffectControls,
                message,
            });
        } catch (err) {
            console.warn('[Cesium] Cloud integration skipped:', err);
        }

        cleanupAttitudeListener = viewer.scene.postRender.addEventListener(() => {
            const cam = viewer.camera;
            const carto = cam.positionCartographic;
            cameraAttitude.value = {
                heading: Cesium.Math.toDegrees(cam.heading),
                pitch: Cesium.Math.toDegrees(cam.pitch),
                roll: Cesium.Math.toDegrees(cam.roll),
                height: carto.height,
            };
            syncTileZoomLevel(cam, viewer);
        });

        cleanupGroundAtmosphereFade = viewer.scene.preRender.addEventListener(
            updateGroundAtmosphereFade,
        );
        if (import.meta.env.DEV) console.warn('[大气渐隐] preRender 监听已注册');

        initNavigation();
    }

    async function bootCesium(): Promise<void> {
        if (bootInProgress) {
            console.warn('[Cesium][boot] skipped — already in progress');
            return;
        }
        bootInProgress = true;
        componentUnmounted = false;
        showLoading(t('loading.cesiumScene'), { timeoutMs: 0 });
        if (import.meta.env.DEV) {
            console.warn('[Cesium][boot] start', {
                ionTokenPresent: !!getCesiumIonToken(),
                tiandituPresent: !!getTiandituToken(),
            });
        }
        let bootSucceeded = false;
        let bootError: Error | null = null;
        try {
            let retryCount = 0;
            let maxRetryCount = 1;
            while (retryCount < maxRetryCount) {
                try {
                    runtimeMapTokens.value = await loadRuntimeMapTokens({
                        silent: false,
                        force: retryCount > 0,
                    });
                    maxRetryCount = Math.min(
                        MAX_TOKEN_RETRY,
                        Math.max(
                            maxRetryCount,
                            Array.isArray(runtimeMapTokens.value.tiandituTokens)
                                ? runtimeMapTokens.value.tiandituTokens.length
                                : 1,
                            Array.isArray(runtimeMapTokens.value.ovitalTdtkeys)
                                ? runtimeMapTokens.value.ovitalTdtkeys.length
                                : 1,
                            Array.isArray(runtimeMapTokens.value.cesiumIonTokens)
                                ? runtimeMapTokens.value.cesiumIonTokens.length
                                : 1,
                            1,
                        ),
                    );
                    console.warn('[Cesium][boot] runtime tokens loaded', {
                        td: !!runtimeMapTokens.value.tiandituTk,
                        ovital: !!runtimeMapTokens.value.ovitalTdtkey,
                        ion: !!runtimeMapTokens.value.cesiumIonToken,
                    });
                    const ns = await loadCesiumRuntime({ ionToken: getCesiumIonToken() });
                    setCesium(ns);
                    if (componentUnmounted || !ns || !document.getElementById('cesiumContainer')) {
                        return;
                    }
                    console.warn('[Cesium][boot] Cesium global ready', {
                        hasViewer: typeof ns.Viewer,
                        hasMap: typeof ns.Map,
                        hasIon: !!ns.Ion,
                    });

                    initViewer();
                    console.warn('[Cesium][boot] viewer constructed');
                    setupInteractions();
                    hideLoading();

                    const basemapReady = layers.addBaseImageryLayers();
                    const terrainReady = await layers.initCustomTerrain();
                    console.warn('[Cesium][boot] base layers', { basemapReady, terrainReady });
                    if (componentUnmounted) {
                        resetCesiumViewerForRetry();
                        return;
                    }
                    cesiumReady.value = true;
                    bindCameraViewSync({
                        initialSync: false,
                        getActivePresetId: () => activeBasemap.value,
                    });
                    attrViewExtentSync.start();

                    const restoredFromUrl = restoreBasemapFromUrl();
                    if (!restoredFromUrl) {
                        const preferredBasemapId = readCachedPreferredBasemap();
                        if (preferredBasemapId && URL_LAYER_OPTIONS.includes(preferredBasemapId)) {
                            if (activeBasemap.value !== preferredBasemapId) {
                                activeBasemap.value = preferredBasemapId;
                            }
                        } else {
                            try {
                                const defaultsRes = await apiGetRuntimeDefaults();
                                const serverIndex = defaultsRes?.data?.default_basemap_index;
                                if (serverIndex != null) {
                                    const serverLayerId = URL_LAYER_OPTIONS[serverIndex] || null;
                                    if (serverLayerId && activeBasemap.value !== serverLayerId) {
                                        activeBasemap.value = serverLayerId;
                                    }
                                }
                            } catch {
                                /* 静默失败 */
                            }
                        }
                    }

                    syncBasemapToUrl({ id: activeBasemap.value });
                    if (basemapReady && terrainReady) {
                        await waitForInitialSceneReady();
                        if (componentUnmounted) return;
                        bootSucceeded = true;
                        message.success(t('cesium.toast.basemapTerrainOk'));
                        return;
                    }

                    const activeStackHasOvital = resolvePresetLayerIds(activeBasemap.value).some(
                        (id) => resolveRuntimeTokenPoolKey(id) === 'ovital_tdtkey',
                    );

                    const switchedTianditu = !basemapReady
                        ? markRuntimeMapTokenFailed('tianditu_tk')
                        : { switched: false };
                    const switchedOvital =
                        !basemapReady && activeStackHasOvital
                            ? markRuntimeMapTokenFailed('ovital_tdtkey')
                            : { switched: false };
                    const switchedCesium = !terrainReady
                        ? markRuntimeMapTokenFailed('cesium_ion_token')
                        : { switched: false };
                    const switched =
                        switchedTianditu.switched ||
                        switchedOvital.switched ||
                        switchedCesium.switched;
                    if (!switched) {
                        bootError = new Error('Cesium basemap or terrain failed to initialize');
                        message.error(t('cesium.toast.basemapTerrainFail'), { closable: true });
                        return;
                    }

                    runtimeMapTokens.value = switchedCesium.switched
                        ? (switchedCesium as any).tokens
                        : switchedOvital.switched
                          ? (switchedOvital as any).tokens
                          : (switchedTianditu as any).tokens;
                    resetCesiumViewerForRetry();
                    retryCount += 1;
                    console.warn('[Cesium][boot] token switch retry', {
                        retryCount,
                        tdSwitched: !!switchedTianditu.switched,
                        ovitalSwitched: !!switchedOvital.switched,
                        ionSwitched: !!switchedCesium.switched,
                    });
                    message.warning(t('cesium.toast.primaryTokenFailRetry'), { closable: true });
                } catch (error) {
                    if (componentUnmounted) return;
                    const switchedCesium = markRuntimeMapTokenFailed('cesium_ion_token');
                    if (!switchedCesium.switched) throw error;
                    runtimeMapTokens.value = switchedCesium.tokens;
                    resetCesiumViewerForRetry();
                    retryCount += 1;
                    message.warning(t('cesium.toast.ionTokenFailRetry'), { closable: true });
                }
            }
            bootError = new Error('Cesium token pool exhausted');
            message.error(t('cesium.toast.tokenPoolExhausted'), { closable: true });
        } catch (error: any) {
            bootError = error instanceof Error ? error : new Error(String(error));
            if (bootError.message?.includes('timed out after')) {
                message.warning(t('cesium.toast.sceneLoadTimeout'), { closable: true });
            } else {
                (message as any).error(t('cesium.toast.runtimeLoadFailed'), error);
                message.error(t('cesium.toast.initFailed'), { closable: true });
            }
        } finally {
            bootInProgress = false;
            bootComplete.value = true;
            if (bootSucceeded) {
                emit('ready');
            } else if (!componentUnmounted) {
                emit('load-failed', {
                    message: bootError?.message || 'Cesium initialization failed',
                });
            }
        }
    }

    onMounted(() => {
        bootCesium().catch(() => {});
    });

    onUnmounted(() => {
        componentUnmounted = true;
        hideLoading();
        _cancelInitialSceneWait?.();
        _cancelInitialSceneWait = null;
        cesiumReady.value = false;
        cleanupReverseGeocodePick();
        cleanupAdapter();

        try {
            drawMeasureFeature.reset();
        } catch {
            /* ignore */
        }
        try {
            drawMeasureStore.reset();
        } catch {
            /* ignore */
        }
        try {
            routeFeature.reset();
        } catch {
            /* ignore */
        }

        try {
            playerController.stopPlayer();
        } catch {
            /* ignore */
        }
        try {
            playerController.clearNavTarget?.();
        } catch {
            /* ignore */
        }
        try {
            playerController.setOpenNavDialogHandler?.(null);
        } catch {
            /* ignore */
        }

        attrViewExtentSync.stop();
        cleanupCameraViewSync();
        cleanupInteractions();
        cleanupTools();
        layers.cleanupLayers();

        modelManager.dispose();
        cameraEnhanced.cleanup();
        heightSampler.cleanup();

        destroySharedLercPool?.();
        destroySharedGeoDecodePool?.();

        if (cloudCleanup) {
            cloudCleanup();
            cloudCleanup = null;
        }
        if (cleanupAttitudeListener) {
            cleanupAttitudeListener();
            cleanupAttitudeListener = null;
        }
        if (cleanupGroundAtmosphereFade) {
            cleanupGroundAtmosphereFade();
            cleanupGroundAtmosphereFade = null;
        }

        cleanupCreditHider();
        cleanupNavigation();
        cleanupInfoBoxTheme();
        dataImport.clearAllDataSources();

        const viewer = getViewer();
        if (viewer) {
            restoreCreditDisplay(viewer);
            try {
                viewer.destroy();
            } catch (e) {
                console.warn('Cesium viewer destroy warning:', e);
                haltViewerRenderLoop(viewer);
            }
            setViewer(null);
        }
    });

    return {
        isComponentUnmounted: () => componentUnmounted,
    };
}
