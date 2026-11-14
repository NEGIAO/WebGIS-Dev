export function readStoredString(key: string, fallback = '') {
    if (typeof window === 'undefined') return fallback;

    try {
        const value = window.localStorage.getItem(key);
        return value == null ? fallback : value;
    } catch {
        return fallback;
    }
}

export function writeStoredString(key: string, value: any) {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(key, String(value ?? ''));
    } catch {
        // Storage failures should not affect the Cesium runtime.
    }
}

export function readStoredBoolean(key: string, fallback: boolean) {
    if (typeof window === 'undefined') return fallback;

    try {
        const value = window.localStorage.getItem(key);
        if (value == null) return fallback;
        return value === 'true';
    } catch {
        return fallback;
    }
}

export function writeStoredBoolean(key: string, value: boolean) {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(key, String(Boolean(value)));
    } catch {
        // Storage failures should not affect the Cesium runtime.
    }
}
