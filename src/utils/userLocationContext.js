const USER_LOCATION_CONTEXT_CACHE_KEY = 'map_user_location_context_v1';
const GLOBAL_USER_LOCATION_CONTEXT_KEY = '__WEBGIS_USER_LOCATION_CONTEXT__';
export const USER_LOCATION_CONTEXT_CHANGE_EVENT = 'user-location-context-change';

let runtimeUserLocationContext = null;

function normalizeNumber(value) {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
}

function normalizeText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function normalizeEncodedLocation(encodedLocation = {}) {
    if (!encodedLocation || typeof encodedLocation !== 'object') return null;

    const formattedAddress = normalizeText(encodedLocation.formattedAddress);
    const province = normalizeText(encodedLocation.province);
    const city = normalizeText(encodedLocation.city);
    const district = normalizeText(encodedLocation.district);
    const township = normalizeText(encodedLocation.township);
    const adcode = normalizeText(encodedLocation.adcode);

    const businessAreasRaw = Array.isArray(encodedLocation.businessAreas)
        ? encodedLocation.businessAreas
        : [];

    const businessAreas = businessAreasRaw
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const name = normalizeText(item.name);
            if (!name) return null;
            return {
                name,
                id: normalizeText(item.id),
                location: normalizeText(item.location)
            };
        })
        .filter(Boolean);

    if (!formattedAddress && !province && !city && !district && !township && !adcode && !businessAreas.length) {
        return null;
    }

    return {
        formattedAddress,
        province,
        city,
        district,
        township,
        adcode,
        businessAreas
    };
}

function normalizeContext(context = {}) {
    if (!context || typeof context !== 'object') return null;

    const lon = normalizeNumber(context.lon);
    const lat = normalizeNumber(context.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

    const accuracy = normalizeNumber(context.accuracy);
    const accuracyMeters = normalizeNumber(context.accuracyMeters);
    const timestamp = normalizeNumber(context.timestamp) || Date.now();
    const source = normalizeText(context.source) || 'unknown';

    const encodedLocation = normalizeEncodedLocation(
        context.encodedLocation
        || context.reverseAddress
        || context.geocode
        || null
    );

    return {
        lon,
        lat,
        accuracy: Number.isFinite(accuracy) ? accuracy : 0,
        accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : 0,
        source,
        timestamp,
        encodedLocation
    };
}

function writeToWindow(context) {
    if (typeof window === 'undefined') return;
    if (context) {
        window[GLOBAL_USER_LOCATION_CONTEXT_KEY] = context;
    } else {
        delete window[GLOBAL_USER_LOCATION_CONTEXT_KEY];
    }
}

function notifyContextChange(context) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    try {
        window.dispatchEvent(new CustomEvent(USER_LOCATION_CONTEXT_CHANGE_EVENT, {
            detail: { context: context || null }
        }));
    } catch {
        // Ignore custom-event dispatch failures.
    }
}

function saveToLocalStorage(context) {
    try {
        if (!context) {
            localStorage.removeItem(USER_LOCATION_CONTEXT_CACHE_KEY);
            return;
        }
        localStorage.setItem(USER_LOCATION_CONTEXT_CACHE_KEY, JSON.stringify(context));
    } catch {
        // Ignore storage failures.
    }
}

function loadFromLocalStorage() {
    try {
        const raw = localStorage.getItem(USER_LOCATION_CONTEXT_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return normalizeContext(parsed);
    } catch {
        return null;
    }
}

export function setGlobalUserLocationContext(context) {
    const normalized = normalizeContext(context);
    if (!normalized) return null;

    runtimeUserLocationContext = normalized;
    writeToWindow(normalized);
    saveToLocalStorage(normalized);
    notifyContextChange(normalized);
    return normalized;
}

export function getGlobalUserLocationContext() {
    if (runtimeUserLocationContext) return runtimeUserLocationContext;

    if (typeof window !== 'undefined') {
        const fromWindow = normalizeContext(window[GLOBAL_USER_LOCATION_CONTEXT_KEY]);
        if (fromWindow) {
            runtimeUserLocationContext = fromWindow;
            return runtimeUserLocationContext;
        }
    }

    const fromStorage = loadFromLocalStorage();
    if (fromStorage) {
        runtimeUserLocationContext = fromStorage;
        writeToWindow(fromStorage);
        return runtimeUserLocationContext;
    }

    return null;
}

export function clearGlobalUserLocationContext() {
    runtimeUserLocationContext = null;
    writeToWindow(null);
    saveToLocalStorage(null);
    notifyContextChange(null);
}
