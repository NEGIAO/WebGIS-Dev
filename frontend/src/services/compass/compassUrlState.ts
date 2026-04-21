import type { FengShuiCompassConfig } from '../../components/feng-shui-compass-svg/types';

type CompassLayerUrlStyle = {
    visible?: boolean;
    fontSize?: number;
    textColor?: string | string[];
    textOpacity?: number;
    borderColor?: string;
    strokeWidth?: number;
    latticeFillColor?: string;
};

type CompassConfigUrlStyle = {
    line?: Partial<FengShuiCompassConfig['line']>;
    isShowScale?: boolean;
    isShowTianxinCross?: boolean;
    tianxinCrossColor?: string;
    tianxinCrossWidth?: number;
    tianxinCrossLengthRatio?: number;
    scaclStyle?: Partial<FengShuiCompassConfig['scaclStyle']>;
    layers?: CompassLayerUrlStyle[];
};

export type CompassUrlPayload = {
    lng?: number | null;
    lat?: number | null;
    rotation?: number | null;
    scale?: number | null;
    enabled?: boolean | null;
    diameterMeters?: number | null;
    themeId?: string | number | null;
    style?: CompassConfigUrlStyle | null;
};

const COMPASS_TOKEN = 'c:';
const COMPASS_SEPARATOR = '~';

function toFinite(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function toBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    const compact = String(value ?? '').trim().toLowerCase();
    if (compact === '1' || compact === 'true') return true;
    if (compact === '0' || compact === 'false') return false;
    return null;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function base64UrlEncode(content: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(encoded: string): string {
    const normalized = String(encoded || '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const paddingLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
    const withPadding = normalized + '='.repeat(paddingLength);
    const binary = atob(withPadding);

    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
}

function readHashParts() {
    const hash = String(window.location.hash || '#/home');
    const withoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
    const [hashPathRaw, hashQueryRaw = ''] = withoutSharp.split('?');
    const hashPath = hashPathRaw || '/home';

    return {
        hashPath: hashPath.startsWith('/') ? hashPath : `/${hashPath}`,
        hashQueryRaw
    };
}

function getMergedQueryParams() {
    const { hashQueryRaw } = readHashParts();
    const hashParams = new URLSearchParams(hashQueryRaw);
    const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));

    searchParams.forEach((value, key) => {
        if (!hashParams.has(key)) {
            hashParams.set(key, value);
        }
    });

    return hashParams;
}

function splitPValue(rawValue: unknown): { positionCode: string; compassCode: string } {
    const compact = String(rawValue ?? '').trim();
    if (!compact) {
        return {
            positionCode: '0',
            compassCode: ''
        };
    }

    const marker = `${COMPASS_SEPARATOR}${COMPASS_TOKEN}`;
    const markerIndex = compact.indexOf(marker);
    if (markerIndex < 0) {
        return {
            positionCode: compact,
            compassCode: ''
        };
    }

    return {
        positionCode: compact.slice(0, markerIndex) || '0',
        compassCode: compact.slice(markerIndex + marker.length)
    };
}

function mergePValue(positionCode: string, compassCode: string): string {
    const safePositionCode = String(positionCode || '0').trim() || '0';
    if (!compassCode) return safePositionCode;
    return `${safePositionCode}${COMPASS_SEPARATOR}${COMPASS_TOKEN}${compassCode}`;
}

function normalizeDecodedPayload(rawPayload: unknown): CompassUrlPayload | null {
    if (!isObjectLike(rawPayload)) return null;

    const styleRaw = isObjectLike(rawPayload.style) ? rawPayload.style : null;
    const lineRaw = styleRaw && isObjectLike(styleRaw.line) ? styleRaw.line : null;
    const scaleRaw = styleRaw && isObjectLike(styleRaw.scaclStyle) ? styleRaw.scaclStyle : null;
    const layersRaw = Array.isArray(styleRaw?.layers) ? styleRaw.layers : null;

    return {
        lng: toFinite(rawPayload.lng),
        lat: toFinite(rawPayload.lat),
        rotation: toFinite(rawPayload.rotation),
        scale: toFinite(rawPayload.scale),
        enabled: toBoolean(rawPayload.enabled),
        diameterMeters: toFinite(rawPayload.diameterMeters),
        themeId: rawPayload.themeId == null ? null : String(rawPayload.themeId),
        style: styleRaw
            ? {
                line: lineRaw
                    ? {
                        borderColor: lineRaw.borderColor == null ? undefined : String(lineRaw.borderColor),
                        scaleColor: lineRaw.scaleColor == null ? undefined : String(lineRaw.scaleColor),
                        scaleHighlightColor: lineRaw.scaleHighlightColor == null ? undefined : String(lineRaw.scaleHighlightColor)
                    }
                    : undefined,
                isShowScale: toBoolean(styleRaw.isShowScale) ?? undefined,
                isShowTianxinCross: toBoolean(styleRaw.isShowTianxinCross) ?? undefined,
                tianxinCrossColor: styleRaw.tianxinCrossColor == null ? undefined : String(styleRaw.tianxinCrossColor),
                tianxinCrossWidth: toFinite(styleRaw.tianxinCrossWidth),
                tianxinCrossLengthRatio: toFinite(styleRaw.tianxinCrossLengthRatio),
                scaclStyle: scaleRaw
                    ? {
                        minLineHeight: toFinite(scaleRaw.minLineHeight) ?? undefined,
                        midLineHeight: toFinite(scaleRaw.midLineHeight) ?? undefined,
                        maxLineHeight: toFinite(scaleRaw.maxLineHeight) ?? undefined,
                        numberFontSize: toFinite(scaleRaw.numberFontSize) ?? undefined
                    }
                    : undefined,
                layers: Array.isArray(layersRaw)
                    ? layersRaw.map((layer) => {
                        const layerValue = isObjectLike(layer) ? layer : {};
                        return {
                            visible: toBoolean(layerValue.visible) ?? undefined,
                            fontSize: toFinite(layerValue.fontSize) ?? undefined,
                            textColor: Array.isArray(layerValue.textColor)
                                ? layerValue.textColor.map((item) => String(item))
                                : layerValue.textColor == null
                                    ? undefined
                                    : String(layerValue.textColor),
                            textOpacity: toFinite(layerValue.textOpacity) ?? undefined,
                            borderColor: layerValue.borderColor == null ? undefined : String(layerValue.borderColor),
                            strokeWidth: toFinite(layerValue.strokeWidth) ?? undefined,
                            latticeFillColor: layerValue.latticeFillColor == null ? undefined : String(layerValue.latticeFillColor)
                        };
                    })
                    : undefined
            }
            : null
    };
}

function buildLegacyPayload(params: URLSearchParams): CompassUrlPayload | null {
    const lng = toFinite(params.get('clng'));
    const lat = toFinite(params.get('clat'));
    const rotation = toFinite(params.get('crot'));
    const scale = toFinite(params.get('cscale'));
    const enabled = toBoolean(params.get('cshow'));

    if (
        lng === null
        && lat === null
        && rotation === null
        && scale === null
        && enabled === null
    ) {
        return null;
    }

    return {
        lng,
        lat,
        rotation,
        scale,
        enabled
    };
}

export function readCompassPayloadFromUrl(): CompassUrlPayload | null {
    if (typeof window === 'undefined') return null;

    const params = getMergedQueryParams();
    const pValue = params.get('p');
    const { compassCode } = splitPValue(pValue);

    if (compassCode) {
        try {
            const decodedJson = base64UrlDecode(compassCode);
            const parsed = JSON.parse(decodedJson);
            const normalized = normalizeDecodedPayload(parsed);
            if (normalized) return normalized;
        } catch {
            // Ignore malformed compact payloads and fallback to legacy fields.
        }
    }

    return buildLegacyPayload(params);
}

export function writeCompassPayloadToUrl(payload: CompassUrlPayload): void {
    if (typeof window === 'undefined') return;

    try {
        const params = getMergedQueryParams();
        const existingP = params.get('p');
        const { positionCode } = splitPValue(existingP);

        const serializablePayload = {
            lng: toFinite(payload.lng),
            lat: toFinite(payload.lat),
            rotation: toFinite(payload.rotation),
            scale: toFinite(payload.scale),
            enabled: toBoolean(payload.enabled),
            diameterMeters: toFinite(payload.diameterMeters),
            themeId: payload.themeId == null ? null : String(payload.themeId),
            style: payload.style || null
        };

        const compactCode = base64UrlEncode(JSON.stringify(serializablePayload));
        params.set('p', mergePValue(positionCode, compactCode));

        if (toFinite(payload.lng) !== null) params.set('clng', String(Number(payload.lng).toFixed(6)));
        if (toFinite(payload.lat) !== null) params.set('clat', String(Number(payload.lat).toFixed(6)));
        if (toFinite(payload.rotation) !== null) params.set('crot', String(Number(payload.rotation).toFixed(2)));
        if (toFinite(payload.scale) !== null) params.set('cscale', String(Number(payload.scale).toFixed(3)));
        if (toBoolean(payload.enabled) !== null) params.set('cshow', payload.enabled ? '1' : '0');

        const { hashPath } = readHashParts();
        const hashQuery = params.toString();
        const nextHash = hashQuery ? `#${hashPath}?${hashQuery}` : `#${hashPath}`;
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
    } catch {
        // URL sync failures should never block map interactions.
    }
}

export function extractPositionCodeFromP(rawValue: unknown): string {
    return splitPValue(rawValue).positionCode;
}

export function mergePositionCodeWithCompassToken(positionCode: string, compassToken: string): string {
    return mergePValue(positionCode, compassToken);
}
