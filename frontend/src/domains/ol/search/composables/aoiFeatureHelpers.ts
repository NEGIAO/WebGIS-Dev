/**
 * 功能名称：搜索 AOI 要素纯工具（环闭合 / 属性清洗 / 中心点解析）
 * 日    期：2026/11/13
 */

export function closeLinearRing(ring: any = []): any[] {
    if (ring.length < 3) return [];
    const first = ring[0];
    const last = ring[ring.length - 1];
    const isClosed = Math.abs(first[0] - last[0]) < 1e-12 && Math.abs(first[1] - last[1]) < 1e-12;
    if (!isClosed) {
        ring.push([first[0], first[1]]);
    }
    return ring.length >= 4 ? ring : [];
}
export function normalizeScalarProperty(value: any): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
        const text = value.trim();
        return text ? text : null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'object') {
        try {
            const text = JSON.stringify(value);
            return text && text !== '{}' ? text : null;
        } catch {
            return null;
        }
    }
    return null;
}
export function pickAoiProperties(base: any = {}): Record<string, any> {
    const picked: Record<string, any> = {};
    Object.entries(base || {}).forEach(([key, value]) => {
        if (!key) return;
        if (/^pixel[xy]$/i.test(String(key))) return;

        const normalized = normalizeScalarProperty(value);
        if (normalized === null) return;
        picked[key] = normalized;
    });
    return picked;
}
export function parseCenterText(centerText: any): number[] | null {
    const parts = String(centerText || '').split(',');
    if (parts.length < 2) return null;

    const lng = Number.parseFloat(parts[0]);
    const lat = Number.parseFloat(parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
}
export const SEARCH_AOI_LAYER_NAME = '搜索 AOI 结果';
