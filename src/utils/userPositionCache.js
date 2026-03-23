const USER_POSITION_CACHE_KEY = 'map_user_position_v1';

export function saveUserPositionToCache(pos) {
    if (!pos) return;

    try {
        localStorage.setItem(USER_POSITION_CACHE_KEY, JSON.stringify({
            lon: Number(pos.lon),
            lat: Number(pos.lat),
            accuracy: Number(pos.accuracy || 0),
            timestamp: Date.now()
        }));
    } catch (e) {
        // Ignore storage failures to avoid breaking map/chat flow.
    }
}

export function readUserPositionFromCache() {
    try {
        const raw = localStorage.getItem(USER_POSITION_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Number.isFinite(parsed?.lon) || !Number.isFinite(parsed?.lat)) return null;

        return {
            lon: Number(parsed.lon),
            lat: Number(parsed.lat),
            accuracy: Number(parsed.accuracy || 0),
            timestamp: Number(parsed.timestamp || 0)
        };
    } catch (e) {
        return null;
    }
}
