import { ref } from 'vue';
import { defineStore } from 'pinia';

export type ViewMode = '2D' | '3D';
export type Extent4326 = [number, number, number, number];
export type BasemapState = {
    id: string;
    label: string;
    visible: boolean;
};

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
const DEFAULT_BASEMAP_STACK: BasemapState[] = [
    { id: 'google', label: 'Google 影像', visible: true },
    { id: 'google_standard', label: 'Google 标准', visible: false },
    { id: 'google_clean', label: 'Google 简洁', visible: false },
    { id: 'tianDiTu', label: '天地图影像', visible: false },
    { id: 'tianDiTu_vec', label: '天地图矢量', visible: false },
    { id: 'esri', label: 'ESRI 影像', visible: false },
    { id: 'esri_ocean', label: 'ESRI 海洋', visible: false },
    { id: 'esri_terrain', label: 'ESRI 地形', visible: false },
    { id: 'esri_physical', label: 'ESRI 自然地理', visible: false },
    { id: 'esri_hillshade', label: 'ESRI 阴影', visible: false },
    { id: 'esri_gray', label: 'ESRI 浅灰', visible: false },
    { id: 'osm', label: 'OpenStreetMap', visible: false },
    { id: 'amap', label: '高德地图', visible: false },
    { id: 'tengxun', label: '腾讯矢量', visible: false },
    { id: 'gggis_time', label: '影像时相', visible: false },
    { id: 'yandex_sat', label: 'Yandex 影像', visible: false },
    { id: 'geoq_gray', label: 'GeoQ 灰色', visible: false },
    { id: 'geoq_hydro', label: 'GeoQ 水系', visible: false },
    { id: 'custom', label: '自定义 URL', visible: false },
    { id: 'local', label: '本地瓦片', visible: false }
];

function toFiniteNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export const useMapStateStore = defineStore('mapStateStore', () => {
    const center = ref<[number, number]>([...DEFAULT_CENTER]);
    const zoom = ref(DEFAULT_ZOOM);
    const basemap = ref(DEFAULT_BASEMAP);
    const basemaps = ref<BasemapState[]>(DEFAULT_BASEMAP_STACK.map((item) => ({ ...item })));
    const startupBasemapNormalized = ref(false);
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
        const target = basemaps.value.find((item) => item.id === normalized);
        if (!target) return;
        basemap.value = normalized;
        target.visible = true;
    }

    function setBasemapVisible(nextBasemap: string, visible: boolean): void {
        const normalized = String(nextBasemap || '').trim();
        if (!normalized) return;

        const target = basemaps.value.find((item) => item.id === normalized);
        if (!target) return;

        if (!visible && basemap.value === normalized) {
            const fallback = basemaps.value.find((item) => item.id !== normalized && item.visible);
            if (!fallback) return;
            basemap.value = fallback.id;
        }

        target.visible = !!visible;
        if (visible) {
            basemap.value = normalized;
        }
    }

    function reorderBasemaps(fromId: string, toId: string): void {
        const from = String(fromId || '').trim();
        const to = String(toId || '').trim();
        if (!from || !to || from === to) return;

        const fromIndex = basemaps.value.findIndex((item) => item.id === from);
        const toIndex = basemaps.value.findIndex((item) => item.id === to);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

        const next = [...basemaps.value];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        basemaps.value = next;
    }

    function setBasemapOrder(orderedIds: string[]): void {
        const ids = Array.isArray(orderedIds) ? orderedIds.map((item) => String(item || '').trim()).filter(Boolean) : [];
        if (!ids.length) return;

        const current = basemaps.value;
        const mapById = new Map(current.map((item) => [item.id, item]));

        const ordered = ids
            .map((id) => mapById.get(id))
            .filter((item): item is BasemapState => !!item)
            .map((item) => ({ ...item }));

        const missing = current
            .filter((item) => !ids.includes(item.id))
            .map((item) => ({ ...item }));

        basemaps.value = [...ordered, ...missing];
    }

    function ensureSingleBasemapVisible(preferredBasemap?: string): void {
        if (startupBasemapNormalized.value) return;

        const preferred = String(preferredBasemap || basemap.value || '').trim();
        const target = basemaps.value.find((item) => item.id === preferred)
            || basemaps.value.find((item) => item.id === DEFAULT_BASEMAP)
            || basemaps.value[0];

        if (!target) return;

        basemap.value = target.id;
        basemaps.value = basemaps.value.map((item) => ({
            ...item,
            visible: item.id === target.id
        }));
        startupBasemapNormalized.value = true;
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
        basemaps,
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
        setBasemapVisible,
        reorderBasemaps,
        setBasemapOrder,
        ensureSingleBasemapVisible,
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