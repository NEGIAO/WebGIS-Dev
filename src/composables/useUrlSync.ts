import { onMounted, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useMapStateStore } from '../stores/mapStateStore';

type UseUrlSyncOptions = {
    debounceMs?: number;
};

const QUERY_KEYS = {
    lon: 'lon',
    lat: 'lat',
    zoom: 'zoom',
    basemap: 'basemap',
    mode: 'mode'
} as const;

const LON_LAT_DIGITS = 6;
const ZOOM_DIGITS = 2;
const DEFAULT_DEBOUNCE_MS = 300;

function parseFiniteNumber(raw: string | null): number | null {
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number, digits: number): string {
    return Number(value).toFixed(digits);
}

function normalizeViewMode(raw: string | null): '2D' | '3D' | null {
    if (!raw) return null;
    return String(raw).trim().toUpperCase() === '3D' ? '3D' : '2D';
}

export function useUrlSync(options: UseUrlSyncOptions = {}) {
    const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    const mapStateStore = useMapStateStore();
    const { center, zoom, basemap, viewMode } = storeToRefs(mapStateStore);

    let isApplyingUrlState = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function clearDebounceTimer(): void {
        if (!debounceTimer) return;
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }

    function applyUrlToStore(): void {
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);
        const lon = parseFiniteNumber(params.get(QUERY_KEYS.lon));
        const lat = parseFiniteNumber(params.get(QUERY_KEYS.lat));
        const nextZoom = parseFiniteNumber(params.get(QUERY_KEYS.zoom));
        const nextBasemap = String(params.get(QUERY_KEYS.basemap) || '').trim();
        const nextMode = normalizeViewMode(params.get(QUERY_KEYS.mode));

        isApplyingUrlState = true;

        if (lon !== null && lat !== null) {
            mapStateStore.setCenter([lon, lat]);
        }

        if (nextZoom !== null) {
            mapStateStore.setZoom(nextZoom);
        }

        if (nextBasemap) {
            mapStateStore.setBasemap(nextBasemap);
        }

        if (nextMode) {
            mapStateStore.setViewMode(nextMode);
        }

        isApplyingUrlState = false;
    }

    function writeStoreToUrl(): void {
        if (typeof window === 'undefined' || isApplyingUrlState) return;

        const params = new URLSearchParams(window.location.search);
        const lon = Array.isArray(center.value) ? Number(center.value[0]) : null;
        const lat = Array.isArray(center.value) ? Number(center.value[1]) : null;
        const zoomValue = Number(zoom.value);
        const basemapValue = String(basemap.value || '').trim();
        const modeValue = String(viewMode.value || '').trim().toUpperCase() === '3D' ? '3D' : '2D';

        if (Number.isFinite(lon)) params.set(QUERY_KEYS.lon, formatNumber(lon, LON_LAT_DIGITS));
        if (Number.isFinite(lat)) params.set(QUERY_KEYS.lat, formatNumber(lat, LON_LAT_DIGITS));
        if (Number.isFinite(zoomValue)) params.set(QUERY_KEYS.zoom, formatNumber(zoomValue, ZOOM_DIGITS));

        if (basemapValue) {
            params.set(QUERY_KEYS.basemap, basemapValue);
        } else {
            params.delete(QUERY_KEYS.basemap);
        }

        params.set(QUERY_KEYS.mode, modeValue);

        const queryString = params.toString();
        const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`;
        const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextUrl === currentUrl) return;

        window.history.replaceState(window.history.state, '', nextUrl);
    }

    function scheduleUrlWrite(): void {
        clearDebounceTimer();
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            writeStoreToUrl();
        }, debounceMs);
    }

    const stopWatch = watch(
        () => [center.value[0], center.value[1], zoom.value, basemap.value, viewMode.value],
        () => {
            if (isApplyingUrlState) return;
            scheduleUrlWrite();
        }
    );

    function handlePopState(): void {
        applyUrlToStore();
    }

    onMounted(() => {
        applyUrlToStore();
        window.addEventListener('popstate', handlePopState);
    });

    onUnmounted(() => {
        clearDebounceTimer();
        stopWatch();
        window.removeEventListener('popstate', handlePopState);
    });

    return {
        applyUrlToStore,
        writeStoreToUrl
    };
}