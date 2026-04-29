import { decodeCompassState, encodeCompassState } from '../utils/urlCrypto';

export type CompassUrlPayload = {
    lng?: number | null;
    lat?: number | null;
    radius?: number | null;
};

const COMPASS_PARAM_KEY = 'cs';
const LEGACY_PARAM_KEYS = ['clng', 'clat', 'crot', 'cid', 'cmode'];

function toFinite(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function readHashState(): { path: string; query: URLSearchParams } {
    const hash = String(window.location.hash || '#/home');
    const hashText = hash.startsWith('#') ? hash.slice(1) : hash;
    const [pathRaw, queryRaw = ''] = hashText.split('?');
    const path = pathRaw || '/home';

    return {
        path: path.startsWith('/') ? path : `/${path}`,
        query: new URLSearchParams(queryRaw)
    };
}

function readMergedQuery(): { path: string; query: URLSearchParams } {
    const { path, query } = readHashState();
    const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));

    searchParams.forEach((value, key) => {
        if (!query.has(key)) query.set(key, value);
    });

    return { path, query };
}

export function readCompassUrlState(): CompassUrlPayload {
    if (typeof window === 'undefined') return {};

    const { query } = readMergedQuery();
    const stateCode = String(query.get(COMPASS_PARAM_KEY) || '').trim();
    const decoded = decodeCompassState(stateCode);

    if (!decoded) return {};

    return {
        lng: toFinite(decoded.lng),
        lat: toFinite(decoded.lat),
        radius: toFinite(decoded.radius)
    };
}

export function writeCompassUrlState(payload: CompassUrlPayload): void {
    if (typeof window === 'undefined') return;

    try {
        const { path, query } = readMergedQuery();

        const lng = toFinite(payload.lng);
        const lat = toFinite(payload.lat);
        const radius = toFinite(payload.radius);

        const encoded = Number.isFinite(Number(lng))
            && Number.isFinite(Number(lat))
            && Number.isFinite(Number(radius))
            ? encodeCompassState(Number(lng), Number(lat), Number(radius))
            : '0';

        LEGACY_PARAM_KEYS.forEach((key) => query.delete(key));

        if (encoded && encoded !== '0') {
            query.set(COMPASS_PARAM_KEY, encoded);
        } else {
            query.delete(COMPASS_PARAM_KEY);
        }

        const nextQuery = query.toString();
        const nextHash = nextQuery ? `#${path}?${nextQuery}` : `#${path}`;
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
    } catch {
        // URL sync failures should not block map interaction.
    }
}
