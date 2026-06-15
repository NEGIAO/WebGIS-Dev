import { apiGetRuntimeMapTokens } from '../api/backend';

const EMPTY_RUNTIME_TOKENS = {
    tiandituTk: '',
    cesiumIonToken: '',
    tiandituTokens: [],
    cesiumIonTokens: [],
};

let cachedTokens = { ...EMPTY_RUNTIME_TOKENS };
let activeTokenIndexes = {
    tianditu_tk: 0,
    cesium_ion_token: 0,
};
let hasLoadedRuntimeTokens = false;
let loadPromise = null;

function normalizeRuntimeKeyName(keyName) {
    const normalized = String(keyName || '')
        .trim()
        .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
        .replace(/^_+/, '');
    if (normalized === 'cesium_ion_token' || normalized === 'cesium') return 'cesium_ion_token';
    if (normalized === 'tianditu_tk' || normalized === 'tianditu') return 'tianditu_tk';
    return '';
}

function normalizeTokenList(values = []) {
    const result = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const compact = String(value || '').trim();
        if (!compact || seen.has(compact)) continue;
        result.push(compact);
        seen.add(compact);
    }
    return result;
}

function toTokenArray(value) {
    if (Array.isArray(value)) return value;
    const compact = String(value || '').trim();
    return compact ? [compact] : [];
}

function normalizeRuntimeTokenPayload(payload = {}) {
    const data = payload?.data || payload || {};
    const pools = data.token_pools || data.tokenPools || {};
    const tiandituTokens = normalizeTokenList([
        data.tianditu_tk,
        data.tiandituTk,
        ...toTokenArray(pools.tianditu_tk || pools.tiandituTk),
        ...cachedTokens.tiandituTokens,
    ]);
    const cesiumIonTokens = normalizeTokenList([
        data.cesium_ion_token,
        data.cesiumIonToken,
        ...toTokenArray(pools.cesium_ion_token || pools.cesiumIonToken),
        ...cachedTokens.cesiumIonTokens,
    ]);
    activeTokenIndexes = {
        tianditu_tk: Math.min(
            activeTokenIndexes.tianditu_tk || 0,
            Math.max(tiandituTokens.length - 1, 0),
        ),
        cesium_ion_token: Math.min(
            activeTokenIndexes.cesium_ion_token || 0,
            Math.max(cesiumIonTokens.length - 1, 0),
        ),
    };

    return {
        tiandituTk: tiandituTokens[activeTokenIndexes.tianditu_tk] || tiandituTokens[0] || '',
        cesiumIonToken:
            cesiumIonTokens[activeTokenIndexes.cesium_ion_token] || cesiumIonTokens[0] || '',
        tiandituTokens,
        cesiumIonTokens,
    };
}

export function getRuntimeMapTokensSync() {
    return { ...cachedTokens };
}

export function markRuntimeMapTokenFailed(keyName) {
    const normalizedKey = normalizeRuntimeKeyName(keyName);
    if (!normalizedKey) {
        return { switched: false, tokens: getRuntimeMapTokensSync() };
    }

    const poolKey = normalizedKey === 'cesium_ion_token' ? 'cesiumIonTokens' : 'tiandituTokens';
    const activeKey = normalizedKey === 'cesium_ion_token' ? 'cesiumIonToken' : 'tiandituTk';
    const tokens = cachedTokens[poolKey] || [];
    if (tokens.length <= 1) {
        return { switched: false, tokens: getRuntimeMapTokensSync() };
    }

    const nextIndex = Math.min((activeTokenIndexes[normalizedKey] || 0) + 1, tokens.length - 1);
    if (nextIndex === activeTokenIndexes[normalizedKey]) {
        return { switched: false, tokens: getRuntimeMapTokensSync() };
    }

    activeTokenIndexes[normalizedKey] = nextIndex;
    cachedTokens = {
        ...cachedTokens,
        [activeKey]: tokens[nextIndex] || '',
    };
    return { switched: true, tokens: getRuntimeMapTokensSync() };
}

export async function loadRuntimeMapTokens({ force = false, silent = true } = {}) {
    if (hasLoadedRuntimeTokens && !force) {
        return getRuntimeMapTokensSync();
    }

    if (loadPromise && !force) {
        return loadPromise;
    }

    loadPromise = apiGetRuntimeMapTokens()
        .then((payload) => {
            cachedTokens = normalizeRuntimeTokenPayload(payload);
            hasLoadedRuntimeTokens = true;
            return getRuntimeMapTokensSync();
        })
        .catch((error) => {
            if (!silent) {
                console.warn('[runtimeMapTokens] Failed to load runtime map tokens:', error);
            }
            hasLoadedRuntimeTokens = true;
            return getRuntimeMapTokensSync();
        })
        .finally(() => {
            loadPromise = null;
        });

    return loadPromise;
}

export function clearRuntimeMapTokensCache() {
    cachedTokens = { ...EMPTY_RUNTIME_TOKENS };
    activeTokenIndexes = {
        tianditu_tk: 0,
        cesium_ion_token: 0,
    };
    hasLoadedRuntimeTokens = false;
    loadPromise = null;
}
