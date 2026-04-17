import { ref } from 'vue';
import { defineStore } from 'pinia';

type WeatherPointPayload = {
    lon: number;
    lat: number;
    source?: string;
    timestamp?: number;
};

type SetAdcodeMeta = {
    city?: string;
    province?: string;
    source?: string;
};

function normalizeAdcode(value: unknown): string {
    const text = String(value ?? '').trim();
    return /^\d{6}$/.test(text) ? text : '';
}

export const useWeatherStore = defineStore('weatherStore', () => {
    const currentAdcode = ref('410202');
    const currentCity = ref('默认城市');
    const currentProvince = ref('');
    const lastSource = ref('default');
    const lastUpdatedAt = ref(Date.now());
    const mapPointTrigger = ref<WeatherPointPayload | null>(null);

    function setAdcode(adcode: unknown, meta: SetAdcodeMeta = {}): boolean {
        const normalized = normalizeAdcode(adcode);
        if (!normalized) return false;

        currentAdcode.value = normalized;
        if (meta.city !== undefined) {
            currentCity.value = String(meta.city || '').trim() || currentCity.value;
        }
        if (meta.province !== undefined) {
            currentProvince.value = String(meta.province || '').trim();
        }
        lastSource.value = String(meta.source || 'unknown').trim() || 'unknown';
        lastUpdatedAt.value = Date.now();
        return true;
    }

    function setMapPointTrigger(payload: WeatherPointPayload): boolean {
        const lon = Number(payload?.lon);
        const lat = Number(payload?.lat);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;

        mapPointTrigger.value = {
            lon,
            lat,
            source: String(payload?.source || 'map').trim() || 'map',
            timestamp: Number(payload?.timestamp) > 0 ? Number(payload.timestamp) : Date.now()
        };
        return true;
    }

    return {
        currentAdcode,
        currentCity,
        currentProvince,
        lastSource,
        lastUpdatedAt,
        mapPointTrigger,
        setAdcode,
        setMapPointTrigger
    };
});
