/**
 * 跨 OpenLayers/Cesium 的底图选择契约与历史影像分组工具。
 * Wayback 等动态目录项统一映射为固定 custom 选择，不注册为运行时底图 ID。
 */

export type BasemapSelectionSource = 'preset' | 'custom';

export type BasemapSelection = {
    id: string;
    customUrl?: string;
    source: BasemapSelectionSource;
};

function normalizeId(value: unknown): string {
    return String(value ?? '').trim();
}

export function normalizeBasemapSelection(
    value: Partial<BasemapSelection> | string | null | undefined,
    fallbackId = '',
): BasemapSelection {
    const raw = typeof value === 'string' ? { id: value } : value || {};
    const customUrl = String(raw.customUrl ?? '').trim();
    const id = customUrl
        ? 'custom'
        : normalizeId(raw.id) || normalizeId(fallbackId);
    const source: BasemapSelectionSource = id === 'custom' || customUrl ? 'custom' : 'preset';
    return customUrl ? { id, customUrl, source } : { id, source };
}

export function serializeBasemapSelection(
    selection: Partial<BasemapSelection> | string | null | undefined,
): Record<string, string> {
    void selection;
    // URL carries numeric l only; the custom/Wayback URL lives in shared runtime state.
    return {};
}

export function deserializeBasemapSelection(
    query: Record<string, unknown> | URLSearchParams,
    getLegacyId: (index: number) => string | null = () => null,
): BasemapSelection | null {
    const read = (key: string) => query instanceof URLSearchParams ? query.get(key) : query?.[key];
    const rawLayerIndex = read('l');
    // Numeric l is the shared OL/Cesium primary contract and overrides legacy layerId.
    if (rawLayerIndex !== null && rawLayerIndex !== undefined && rawLayerIndex !== '') {
        const layerIndex = Number(rawLayerIndex);
        if (Number.isInteger(layerIndex) && layerIndex >= 1) {
            const layerId = normalizeId(getLegacyId(layerIndex));
            if (layerId) {
                if (layerId === 'custom') return normalizeBasemapSelection({ id: 'custom' });
                return normalizeBasemapSelection({ id: layerId });
            }
        }
    }
    // Read legacy V3.5.25 layerId links, but all later writes migrate them to numeric l.
    const legacyLayerId = normalizeId(read('layerId'));
    if (!legacyLayerId) return null;
    if (legacyLayerId === 'custom') return normalizeBasemapSelection({ id: 'custom' });
    return normalizeBasemapSelection({ id: legacyLayerId });
}

export function getBasemapYear(value: { year?: unknown; date?: unknown } = {}): number | null {
    const explicit = Number(value.year);
    if (Number.isInteger(explicit) && explicit >= 1900 && explicit <= 2200) return explicit;
    const match = String(value.date ?? '').match(/(\d{4})/);
    return match ? Number(match[1]) : null;
}

export function groupBasemapsByYear<T extends { year?: unknown; date?: unknown }>(
    items: T[],
): Map<number | 'unknown', T[]> {
    const groups = new Map<number | 'unknown', T[]>();
    for (const item of items || []) {
        const year = getBasemapYear(item);
        const key = year ?? 'unknown';
        const group = groups.get(key) || [];
        group.push(item);
        groups.set(key, group);
    }
    return new Map([...groups.entries()].sort(([a], [b]) => {
        if (a === 'unknown') return 1;
        if (b === 'unknown') return -1;
        return Number(b) - Number(a);
    }));
}
