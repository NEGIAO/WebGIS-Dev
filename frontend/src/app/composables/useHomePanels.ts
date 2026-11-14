/**
 * 功能名称：HomeView 侧边栏、面板页签、天气看板、属性浮窗与拖拽分栏状态 Composable
 * 说    明：集中管理 SidePanel 展开/收起（含 useTimerRegistry 扫光动画定时器）、拖拽调宽、
 *           工具箱子标签二次点击切换、天气看板 2D 联动、账号中心浮窗与属性查询结果浮窗。
 */
import { nextTick, provide, reactive, ref, type Ref } from 'vue';
import { useCompassStore, useWeatherStore } from '@/stores';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';
import { MAP_VIEW_OL } from '@ol/url-state/useMapViewUrlState';

export const DEFAULT_SIDE_PANEL_RATIO = 30;
export const MIN_SIDE_PANEL_RATIO = 20;
export const MAX_SIDE_PANEL_RATIO = 70;

export interface UseHomePanelsDeps {
    mapContainerRef: Ref<any>;
    is3DMode: Ref<boolean>;
    replaceMapView: (view: string, opts?: any) => Promise<any>;
}

export function useHomePanels(deps: UseHomePanelsDeps) {
    const { mapContainerRef, is3DMode, replaceMapView } = deps;
    const message = useMessage();
    const { t } = useLocale();
    const weatherStore = useWeatherStore();
    const compassStore = useCompassStore();
    const { later, cancel } = useTimerRegistry();

    const locationInfo = reactive({
        isInDihuan: false,
        lonLat: [0, 0],
    });

    const selectedImage = ref('');
    const isWeatherBoardMode = ref(false);
    const shouldLoadWeatherChartPanel = ref(false);
    const isMagicMode = ref(false);
    const magicEffectData = ref('');
    const isSidePanelCollapsed = ref(true);
    const isPanelRevealing = ref(false);
    let revealTimerHandle: ReturnType<typeof later> | null = null;

    const shouldLoadSidePanel = ref(false);
    const activeSidePanelTab = ref('info');
    const toolboxTab = ref('layers');
    const userLayers = ref<any[]>([]);
    const featureQueryResult = ref<Record<string, any> | null>(null);
    const featureQueryMeta = ref<{ title?: string } | null>(null);
    const showQueryPanel = ref(false);
    const toolboxOverview = ref({ drawCount: 0, uploadCount: 0, layers: [] as any[] });
    const baseLayers = ref<any[]>([]);
    const uploadProgress = ref<{ phase: string; [key: string]: any }>({ phase: 'idle' });
    const latestSearchPoi = ref<Record<string, any>>({});
    const activeFeature = ref({ key: 'info', label: '' });
    const isAccountPanelOpen = ref(false);
    const isAccountPanelFullscreen = ref(false);

    const sidePanelRatio = ref(DEFAULT_SIDE_PANEL_RATIO);
    const isPanelDragging = ref(false);

    provide('isSidePanelCollapsed', isSidePanelCollapsed);

    function handlePanelResize(leftRatio: number): void {
        isPanelDragging.value = true;
        const rightRatio = 100 - leftRatio;
        sidePanelRatio.value = Math.max(
            MIN_SIDE_PANEL_RATIO,
            Math.min(MAX_SIDE_PANEL_RATIO, rightRatio),
        );
    }

    function handlePanelResizeEnd(): void {
        isPanelDragging.value = false;
        nextTick(() => {
            mapContainerRef.value?.updateSize?.();
        });
    }

    function handleLocationChange(locationData: any): void {
        Object.assign(locationInfo, locationData);

        const lon = Number(locationData?.lon);
        const lat = Number(locationData?.lat);
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
            weatherStore.setMapPointTrigger({
                lon,
                lat,
                source: String(locationData?.source || 'location-change'),
            });
        }
    }

    function stopCompassTransientInteractions(): void {
        compassStore.setPlacementMode(false);
    }

    function openSidePanelTab(tab: string, keepCompassPlacement = false): void {
        if (!keepCompassPlacement) {
            stopCompassTransientInteractions();
        }
        activeSidePanelTab.value = tab;
        if (!shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
        isSidePanelCollapsed.value = false;
    }

    function toggleSidePanel(): void {
        if (isSidePanelCollapsed.value && !shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
        isSidePanelCollapsed.value = !isSidePanelCollapsed.value;
        if (isSidePanelCollapsed.value) {
            compassStore.setPlacementMode(false);
        } else {
            isPanelRevealing.value = true;
            cancel(revealTimerHandle);
            revealTimerHandle = later(() => {
                isPanelRevealing.value = false;
                revealTimerHandle = null;
            }, 620);
        }
        message.soup();
    }

    function openChat(): void {
        openSidePanelTab('chat');
    }

    function openToolbox(): void {
        openSidePanelTab('toolbox');
    }

    async function openCompassPanel(): Promise<void> {
        openSidePanelTab('compass', true);
        await compassStore.ensureConfigLoaded();
    }

    function openBusPlanner(): void {
        openSidePanelTab('bus');
    }

    function openDrivePlanner(): void {
        openSidePanelTab('drive');
    }

    function openBuildingsPanel(): void {
        openSidePanelTab('buildings');
    }

    function handleActivateFeature(feature: any): void {
        activeFeature.value = feature || { key: 'info', label: t('shell.news') };
    }

    function handleSwitchSidePanelTab(tab: string): void {
        if (tab !== 'compass') {
            stopCompassTransientInteractions();
        }
        activeSidePanelTab.value = tab;
    }

    function handleControlsOpenTab(tab: string): void {
        const next = String(tab || '').trim();
        if (!next) return;

        handleSwitchSidePanelTab(next);
        if (!shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
        isSidePanelCollapsed.value = false;
    }

    function handleControlsToggleTab(tab: string): void {
        const next = String(tab || '').trim();
        if (!next) return;

        if (!isSidePanelCollapsed.value && activeSidePanelTab.value === next) {
            isSidePanelCollapsed.value = true;
            compassStore.setPlacementMode(false);
            return;
        }
        handleControlsOpenTab(next);
    }

    function handleControlsOpenToolboxTab(tab: string): void {
        const next = String(tab || '').trim();
        if (!next) return;

        if (toolboxTab.value === next) {
            toolboxTab.value = 'layers';
            nextTick(() => {
                toolboxTab.value = next;
            });
        } else {
            toolboxTab.value = next;
        }
        handleControlsOpenTab('toolbox');
    }

    function handleControlsToggleToolboxTab(tab: string): void {
        if (!isSidePanelCollapsed.value && activeSidePanelTab.value === 'toolbox') {
            isSidePanelCollapsed.value = true;
            compassStore.setPlacementMode(false);
            return;
        }
        handleControlsOpenToolboxTab(tab);
    }

    function handleAccountPanelFullscreenChange(fullscreen: boolean): void {
        isAccountPanelFullscreen.value = Boolean(fullscreen);
        if (isAccountPanelFullscreen.value) {
            isAccountPanelOpen.value = true;
        }
    }

    function handleToggleAccountPanel(): void {
        isAccountPanelOpen.value = !isAccountPanelOpen.value;
    }

    function handleCloseChat(): void {
        activeSidePanelTab.value = 'info';
        activeFeature.value = { key: 'info', label: t('shell.news') };
    }

    function toggleWeatherBoardMode(): void {
        const openingWeather = !isWeatherBoardMode.value;

        if (openingWeather) {
            if (!shouldLoadWeatherChartPanel.value) {
                shouldLoadWeatherChartPanel.value = true;
            }
            if (!shouldLoadSidePanel.value) {
                shouldLoadSidePanel.value = true;
            }
            activeSidePanelTab.value = 'weather';
            isSidePanelCollapsed.value = false;
            is3DMode.value = false;
            replaceMapView(MAP_VIEW_OL);
            activeFeature.value = { key: 'weather-board', label: t('shell.weather') };
        } else {
            activeSidePanelTab.value = 'info';
            activeFeature.value = { key: 'map', label: t('shell.mapView') };
        }
        isWeatherBoardMode.value = openingWeather;
    }

    function handleActivateMagic(effectName: string): void {
        if (effectName === 'off') {
            isMagicMode.value = false;
            magicEffectData.value = '';
        } else {
            isMagicMode.value = true;
            magicEffectData.value = effectName;
        }
    }

    function handleGraphicsOverview(data: any): void {
        toolboxOverview.value = data || { drawCount: 0, uploadCount: 0, layers: [] };
    }

    function handleUploadProgressChange(progress: any): void {
        uploadProgress.value = progress || { phase: 'idle' };
    }

    function handleSearchPoiSelected(poiPayload: any): void {
        const service = String(poiPayload?.service || '')
            .trim()
            .toLowerCase();
        if (service && service !== 'amap') return;
        const poiid = String(poiPayload?.poiid || '').trim();

        latestSearchPoi.value = {
            ...poiPayload,
            poiid,
            _syncAt: Date.now(),
        };
    }

    function closeQueryPanel(): void {
        showQueryPanel.value = false;
        featureQueryMeta.value = null;
    }

    function handleServiceFeatureQuery(payload: any): void {
        const attrs = payload?.attributes;
        if (!attrs || typeof attrs !== 'object' || !Object.keys(attrs).length) return;
        featureQueryResult.value = attrs;
        featureQueryMeta.value = payload.title ? { title: payload.title } : null;
        showQueryPanel.value = true;
    }

    return {
        locationInfo,
        selectedImage,
        isWeatherBoardMode,
        shouldLoadWeatherChartPanel,
        isMagicMode,
        magicEffectData,
        isSidePanelCollapsed,
        isPanelRevealing,
        shouldLoadSidePanel,
        activeSidePanelTab,
        toolboxTab,
        userLayers,
        featureQueryResult,
        featureQueryMeta,
        showQueryPanel,
        toolboxOverview,
        baseLayers,
        uploadProgress,
        latestSearchPoi,
        activeFeature,
        isAccountPanelOpen,
        isAccountPanelFullscreen,
        sidePanelRatio,
        isPanelDragging,
        handlePanelResize,
        handlePanelResizeEnd,
        handleLocationChange,
        toggleSidePanel,
        openChat,
        openToolbox,
        openCompassPanel,
        openBusPlanner,
        openDrivePlanner,
        openBuildingsPanel,
        handleActivateFeature,
        handleSwitchSidePanelTab,
        handleControlsOpenTab,
        handleControlsToggleTab,
        handleControlsToggleToolboxTab,
        handleAccountPanelFullscreenChange,
        handleToggleAccountPanel,
        handleCloseChat,
        toggleWeatherBoardMode,
        handleActivateMagic,
        handleGraphicsOverview,
        handleUploadProgressChange,
        handleSearchPoiSelected,
        closeQueryPanel,
        handleServiceFeatureQuery,
    };
}
