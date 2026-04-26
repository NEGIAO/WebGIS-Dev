export type CompassUrlPayload = {
    lng?: number | null;
    lat?: number | null;
    rotation?: number | null;
    cid?: string | null;
    mode?: 'vector' | 'hud' | null;
};

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

function normalizeMode(value: unknown): 'vector' | 'hud' | null {
    const compact = String(value || '').trim().toLowerCase();
    if (compact === 'vector') return 'vector';
    if (compact === 'hud') return 'hud';
    return null;
}

export function readCompassUrlState(): CompassUrlPayload {
    if (typeof window === 'undefined') return {};

    const { query } = readMergedQuery();
    return {
        lng: toFinite(query.get('clng')),
        lat: toFinite(query.get('clat')),
        rotation: toFinite(query.get('crot')),
        cid: String(query.get('cid') || '').trim() || null,
        mode: normalizeMode(query.get('cmode'))
    };
}

export function writeCompassUrlState(payload: CompassUrlPayload): void {
    if (typeof window === 'undefined') return;

    try {
        const { path, query } = readMergedQuery();

        if (toFinite(payload.lng) !== null) query.set('clng', String(Number(payload.lng).toFixed(6)));
        if (toFinite(payload.lat) !== null) query.set('clat', String(Number(payload.lat).toFixed(6)));
        if (toFinite(payload.rotation) !== null) query.set('crot', String(Number(payload.rotation).toFixed(2)));

        const cid = String(payload.cid || '').trim();
        if (cid) query.set('cid', cid);

        const mode = normalizeMode(payload.mode);
        if (mode) query.set('cmode', mode);

        const nextQuery = query.toString();
        const nextHash = nextQuery ? `#${path}?${nextQuery}` : `#${path}`;
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
    } catch {
        // URL sync failures should not block map interaction.
    }
}
