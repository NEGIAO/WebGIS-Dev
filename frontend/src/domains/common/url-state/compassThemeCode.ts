/**
 * 罗盘主题与 cs 短码主题编号的共享映射。
 * 编号固定追加，未来新增主题只能往后排，避免旧分享链接主题错配。
 */

export const COMPASS_THEME_CODES = [
    'ancient-cinnabar',
    'jade-realm',
    'cyber-blueprint',
    'dark-gold',
    'minimalist',
] as const;

export type CompassThemeCid = (typeof COMPASS_THEME_CODES)[number];

export const DEFAULT_COMPASS_THEME_INDEX = 0;

const COMPAT_CID_ALIASES: Record<string, CompassThemeCid> = {
    compass: 'ancient-cinnabar',
    circle: 'jade-realm',
    dark: 'cyber-blueprint',
    polygon: 'dark-gold',
    simple: 'minimalist',
};

export const COMPASS_THEME_INDEX_BY_CID: Record<string, number> = COMPASS_THEME_CODES.reduce(
    (acc, cid, index) => {
        acc[cid] = index;
        return acc;
    },
    {} as Record<string, number>,
);

export function getCompassThemeIndex(cid: string | number | null | undefined): number {
    if (typeof cid === 'number' && Number.isInteger(cid) && cid >= 0 && cid < COMPASS_THEME_CODES.length) {
        return cid;
    }
    const text = String(cid || '').trim();
    const canonical = COMPAT_CID_ALIASES[text] || text;
    return COMPASS_THEME_INDEX_BY_CID[canonical] ?? DEFAULT_COMPASS_THEME_INDEX;
}

export function getCompassThemeCid(index: number | null | undefined): CompassThemeCid {
    if (typeof index !== 'number' || !Number.isInteger(index)) return COMPASS_THEME_CODES[DEFAULT_COMPASS_THEME_INDEX];
    return COMPASS_THEME_CODES[index] || COMPASS_THEME_CODES[DEFAULT_COMPASS_THEME_INDEX];
}
