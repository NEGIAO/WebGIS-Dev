import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export type LngLat = [number, number];
export type RouteMode = 'bus' | 'drive';

export type RouteStepRecord = {
    id: string;
    name: string;
    modeText?: string;
    distanceText?: string;
    durationText?: string;
    coordinates: LngLat[];
    meta?: Record<string, unknown>;
};

export type RouteRecord = {
    id: string;
    name: string;
    mode: RouteMode;
    start: LngLat | null;
    end: LngLat | null;
    coordinates: LngLat[];
    steps: RouteStepRecord[];
    summary?: {
        distanceKm?: string;
        durationText?: string;
    };
    meta?: Record<string, unknown>;
};

function normalizeLngLat(value: unknown): LngLat | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
}

function normalizePath(coords: unknown): LngLat[] {
    if (!Array.isArray(coords)) return [];
    return coords
        .map((item) => normalizeLngLat(item))
        .filter(Boolean) as LngLat[];
}

export const useRouteStore = defineStore('routeStore', () => {
    const mode = ref<RouteMode>('bus');
    const startPoint = ref<LngLat | null>(null);
    const endPoint = ref<LngLat | null>(null);

    const routes = ref<RouteRecord[]>([]);
    const activeRouteIndex = ref(-1);
    const activeStepIndex = ref(-1);

    const activeRoute = computed<RouteRecord | null>(() => {
        const idx = Number(activeRouteIndex.value);
        if (idx < 0 || idx >= routes.value.length) return null;
        return routes.value[idx] || null;
    });

    const activeStep = computed<RouteStepRecord | null>(() => {
        const route = activeRoute.value;
        if (!route) return null;
        const idx = Number(activeStepIndex.value);
        if (idx < 0 || idx >= route.steps.length) return null;
        return route.steps[idx] || null;
    });

    function setMode(nextMode: RouteMode): void {
        mode.value = nextMode === 'drive' ? 'drive' : 'bus';
    }

    function setStartPoint(point: unknown): void {
        startPoint.value = normalizeLngLat(point);
    }

    function setEndPoint(point: unknown): void {
        endPoint.value = normalizeLngLat(point);
    }

    function clearPoints(): void {
        startPoint.value = null;
        endPoint.value = null;
    }

    function clearRoutes(): void {
        routes.value = [];
        activeRouteIndex.value = -1;
        activeStepIndex.value = -1;
    }

    function setRoutes(nextRoutes: RouteRecord[], nextMode?: RouteMode): void {
        routes.value = (Array.isArray(nextRoutes) ? nextRoutes : []).map((item, index) => ({
            ...item,
            id: String(item?.id || `route_${Date.now()}_${index}`),
            name: String(item?.name || `路线 ${index + 1}`),
            mode: item?.mode === 'drive' ? 'drive' : 'bus',
            start: normalizeLngLat(item?.start),
            end: normalizeLngLat(item?.end),
            coordinates: normalizePath(item?.coordinates),
            steps: Array.isArray(item?.steps)
                ? item.steps.map((step, stepIndex) => ({
                    ...step,
                    id: String(step?.id || `step_${index}_${stepIndex}`),
                    name: String(step?.name || `步骤 ${stepIndex + 1}`),
                    coordinates: normalizePath(step?.coordinates)
                }))
                : []
        }));

        if (nextMode) setMode(nextMode);

        activeRouteIndex.value = routes.value.length ? 0 : -1;
        activeStepIndex.value = -1;
    }

    function setActiveRouteIndex(index: number): void {
        const normalized = Number(index);
        if (!Number.isInteger(normalized) || normalized < 0 || normalized >= routes.value.length) {
            activeRouteIndex.value = -1;
            activeStepIndex.value = -1;
            return;
        }
        activeRouteIndex.value = normalized;
        activeStepIndex.value = -1;
    }

    function setActiveStepIndex(index: number): void {
        const route = activeRoute.value;
        if (!route) {
            activeStepIndex.value = -1;
            return;
        }

        const normalized = Number(index);
        if (!Number.isInteger(normalized) || normalized < 0 || normalized >= route.steps.length) {
            activeStepIndex.value = -1;
            return;
        }

        activeStepIndex.value = normalized;
    }

    function setActiveRouteById(routeId: string): void {
        const normalized = String(routeId || '').trim();
        if (!normalized) {
            setActiveRouteIndex(-1);
            return;
        }

        const index = routes.value.findIndex((item) => item.id === normalized);
        setActiveRouteIndex(index);
    }

    function removeRouteById(routeId: string): void {
        const normalized = String(routeId || '').trim();
        if (!normalized) return;

        const index = routes.value.findIndex((item) => item.id === normalized);
        if (index < 0) return;

        routes.value.splice(index, 1);

        if (!routes.value.length) {
            activeRouteIndex.value = -1;
            activeStepIndex.value = -1;
            return;
        }

        if (activeRouteIndex.value === index) {
            activeRouteIndex.value = Math.min(index, routes.value.length - 1);
            activeStepIndex.value = -1;
            return;
        }

        if (activeRouteIndex.value > index) {
            activeRouteIndex.value -= 1;
        }
    }

    return {
        mode,
        startPoint,
        endPoint,
        routes,
        activeRouteIndex,
        activeStepIndex,
        activeRoute,
        activeStep,
        setMode,
        setStartPoint,
        setEndPoint,
        clearPoints,
        clearRoutes,
        setRoutes,
        setActiveRouteIndex,
        setActiveStepIndex,
        setActiveRouteById,
        removeRouteById
    };
});
