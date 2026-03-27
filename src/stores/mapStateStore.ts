import { ref } from 'vue';
import { defineStore } from 'pinia';

export type ViewMode = '2D' | '3D';
export type Extent4326 = [number, number, number, number];

export type SearchHighlight = {
    lon: number;
    lat: number;
    nonce: number;
};

export type PointerCoord4326 = [number, number] | null;

const DEFAULT_CENTER: [number, number] = [114.302, 34.8146];
const DEFAULT_ZOOM = 16;
const DEFAULT_BASEMAP = 'google';
const DEFAULT_VIEW_MODE: ViewMode = '2D';
const DEFAULT_CUSTOM_BASEMAP_URL = '';

function toFiniteNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export const useMapStateStore = defineStore('mapStateStore', () => {
    const center = ref<[number, number]>([...DEFAULT_CENTER]);
    const zoom = ref(DEFAULT_ZOOM);
    const basemap = ref(DEFAULT_BASEMAP);
    const customBasemapUrl = ref(DEFAULT_CUSTOM_BASEMAP_URL);
    const viewMode = ref<ViewMode>(DEFAULT_VIEW_MODE);
    const extent = ref<Extent4326 | null>(null);
    const searchHighlight = ref<SearchHighlight | null>(null);
    const pointerCoord = ref<PointerCoord4326>(null);
    const showDynamicGraticule = ref(false);

    const resetViewRequestNonce = ref(0);
    const locateUserRequestNonce = ref(0);

    function setCenter(nextCenter: [number, number] | number[]): void {
        if (!Array.isArray(nextCenter) || nextCenter.length < 2) return;

        const lon = toFiniteNumber(nextCenter[0]);
        const lat = toFiniteNumber(nextCenter[1]);
        if (lon === null || lat === null) return;

        center.value = [lon, lat];
    }

    function setZoom(nextZoom: number): void {
        const parsed = toFiniteNumber(nextZoom);
        if (parsed === null) return;
        zoom.value = parsed;
    }

    function setBasemap(nextBasemap: string): void {
        const normalized = String(nextBasemap || '').trim();
        if (!normalized) return;
        basemap.value = normalized;
    }

    function setCustomBasemapUrl(nextUrl: string): void {
        customBasemapUrl.value = String(nextUrl || '').trim();
    }

    function setViewMode(nextViewMode: string): void {
        const normalized = String(nextViewMode || '').trim().toUpperCase();
        viewMode.value = normalized === '3D' ? '3D' : '2D';
    }

    function setExtent(nextExtent: Extent4326 | number[] | null): void {
        if (!Array.isArray(nextExtent) || nextExtent.length < 4) {
            extent.value = null;
            return;
        }

        const minLon = toFiniteNumber(nextExtent[0]);
        const minLat = toFiniteNumber(nextExtent[1]);
        const maxLon = toFiniteNumber(nextExtent[2]);
        const maxLat = toFiniteNumber(nextExtent[3]);

        if (minLon === null || minLat === null || maxLon === null || maxLat === null) {
            extent.value = null;
            return;
        }

        extent.value = [minLon, minLat, maxLon, maxLat];
    }

    function focusSearchLocation(nextCenter: [number, number] | number[], nextZoom = 16): void {
        setCenter(nextCenter);
        setZoom(nextZoom);

        const lon = toFiniteNumber(Array.isArray(nextCenter) ? nextCenter[0] : null);
        const lat = toFiniteNumber(Array.isArray(nextCenter) ? nextCenter[1] : null);
        if (lon === null || lat === null) return;

        searchHighlight.value = {
            lon,
            lat,
            nonce: Date.now()
        };
    }

    function clearSearchHighlight(): void {
        searchHighlight.value = null;
    }

    function setPointerCoord(coord: PointerCoord4326): void {
        if (!Array.isArray(coord) || coord.length < 2) {
            pointerCoord.value = null;
            return;
        }

        const lon = toFiniteNumber(coord[0]);
        const lat = toFiniteNumber(coord[1]);
        if (lon === null || lat === null) {
            pointerCoord.value = null;
            return;
        }

        pointerCoord.value = [lon, lat];
    }

    function setDynamicGraticuleVisible(visible: boolean): void {
        showDynamicGraticule.value = !!visible;
    }

    function toggleDynamicGraticule(): void {
        showDynamicGraticule.value = !showDynamicGraticule.value;
    }

    function requestResetView(): void {
        resetViewRequestNonce.value = Date.now();
    }

    function requestLocateUser(): void {
        locateUserRequestNonce.value = Date.now();
    }

    return {
        center,
        zoom,
        basemap,
        customBasemapUrl,
        viewMode,
        extent,
        searchHighlight,
        pointerCoord,
        showDynamicGraticule,
        resetViewRequestNonce,
        locateUserRequestNonce,
        setCenter,
        setZoom,
        setBasemap,
        setCustomBasemapUrl,
        setViewMode,
        setExtent,
        focusSearchLocation,
        clearSearchHighlight,
        setPointerCoord,
        setDynamicGraticuleVisible,
        toggleDynamicGraticule,
        requestResetView,
        requestLocateUser
    };
});