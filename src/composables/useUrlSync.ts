import { onMounted, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useMapStateStore } from '../stores/mapStateStore';

type UseUrlSyncOptions = {
    debounceMs?: number;
};

const QUERY_KEYS = {
    lon: ['lon', 'lng'] as const,
    lat: ['lat'] as const,
    zoom: ['zoom', 'z'] as const,
    basemap: ['basemap', 'l'] as const,
    mode: ['mode'] as const
} as const;

const LEGACY_LAYER_OPTIONS = [
    'local',
    'tianDiTu_vec',
    'tianDiTu',
    'google',
    'google_standard',
    'google_clean',
    'esri',
    'osm',
    'amap',
    'tengxun',
    'esri_ocean',
    'esri_terrain',
    'esri_physical',
    'esri_hillshade',
    'esri_gray',
    'gggis_time',
    'yandex_sat',
    'geoq_gray',
    'geoq_hydro',
    'custom'
] as const;

const LON_LAT_DIGITS = 6;
const ZOOM_DIGITS = 2;
const DEFAULT_DEBOUNCE_MS = 300;

function parseFiniteNumber(raw: string | null): number | null {
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function readFirstValue(params: URLSearchParams, keys: readonly string[]): string | null {
    for (const key of keys) {
        const value = params.get(key);
        if (value !== null && String(value).trim() !== '') {
            return value;
        }
    }
    return null;
}

function formatNumber(value: number, digits: number): string {
    return Number(value).toFixed(digits);
}

function normalizeViewMode(raw: string | null): '2D' | '3D' | null {
    if (!raw) return null;
    return String(raw).trim().toUpperCase() === '3D' ? '3D' : '2D';
}

function normalizeBasemapQueryValue(raw: string | null): string {
    const text = String(raw || '').trim();
    if (!text) return '';

    const maybeIndex = Number(text);
    if (Number.isInteger(maybeIndex) && maybeIndex >= 0 && maybeIndex < LEGACY_LAYER_OPTIONS.length) {
        return LEGACY_LAYER_OPTIONS[maybeIndex];
    }

    return text;
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
        const lon = parseFiniteNumber(readFirstValue(params, QUERY_KEYS.lon));
        const lat = parseFiniteNumber(readFirstValue(params, QUERY_KEYS.lat));
        const nextZoom = parseFiniteNumber(readFirstValue(params, QUERY_KEYS.zoom));
        const nextBasemap = normalizeBasemapQueryValue(readFirstValue(params, QUERY_KEYS.basemap));
        const nextMode = normalizeViewMode(readFirstValue(params, QUERY_KEYS.mode));

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

        if (Number.isFinite(lon)) {
            const lonText = formatNumber(lon, LON_LAT_DIGITS);
            params.set('lon', lonText);
            params.set('lng', lonText);
        }

        if (Number.isFinite(lat)) {
            params.set('lat', formatNumber(lat, LON_LAT_DIGITS));
        }

        if (Number.isFinite(zoomValue)) {
            const zoomText = formatNumber(zoomValue, ZOOM_DIGITS);
            params.set('zoom', zoomText);
            params.set('z', zoomText);
        }

        if (basemapValue) {
            params.set('basemap', basemapValue);
            const layerIndex = LEGACY_LAYER_OPTIONS.indexOf(basemapValue as typeof LEGACY_LAYER_OPTIONS[number]);
            params.set('l', layerIndex >= 0 ? String(layerIndex) : basemapValue);
        } else {
            params.delete('basemap');
            params.delete('l');
        }

        params.set('mode', modeValue);

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