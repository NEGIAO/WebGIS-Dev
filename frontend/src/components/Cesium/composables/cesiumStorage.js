export function readStoredString(key, fallback = '') {
    if (typeof window === 'undefined') return fallback;

    try {
        const value = window.localStorage.getItem(key);
        return value == null ? fallback : value;
    } catch {
        return fallback;
    }
}

export function writeStoredString(key, value) {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(key, String(value || ''));
    } catch {
        // Storage failures should not affect the Cesium runtime.
    }
}

export function readStoredBoolean(key, fallback) {
    if (typeof window === 'undefined') return fallback;

    try {
        const value = window.localStorage.getItem(key);
        if (value == null) return fallback;
        return value === 'true';
    } catch {
        return fallback;
    }
}

export function writeStoredBoolean(key, value) {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(key, String(Boolean(value)));
    } catch {
        // Storage failures should not affect the Cesium runtime.
    }
}
