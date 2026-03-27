import { ref } from 'vue';
import { defineStore } from 'pinia';

export type ViewMode = '2D' | '3D';

const DEFAULT_CENTER: [number, number] = [114.302, 34.8146];
const DEFAULT_ZOOM = 16;
const DEFAULT_BASEMAP = 'google';
const DEFAULT_VIEW_MODE: ViewMode = '2D';

function toFiniteNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export const useMapStateStore = defineStore('mapStateStore', () => {
    const center = ref<[number, number]>([...DEFAULT_CENTER]);
    const zoom = ref(DEFAULT_ZOOM);
    const basemap = ref(DEFAULT_BASEMAP);
    const viewMode = ref<ViewMode>(DEFAULT_VIEW_MODE);

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

    function setViewMode(nextViewMode: string): void {
        const normalized = String(nextViewMode || '').trim().toUpperCase();
        viewMode.value = normalized === '3D' ? '3D' : '2D';
    }

    return {
        center,
        zoom,
        basemap,
        viewMode,
        setCenter,
        setZoom,
        setBasemap,
        setViewMode
    };
});