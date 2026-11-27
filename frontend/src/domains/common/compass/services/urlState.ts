import { decodeCompassState, encodeCompassState } from '@common/url-state/crypto';
import { getCompassThemeIndex } from '@common/url-state/compassThemeCode';
import { isSearchOnlyQueryKey } from '@common/url-state/urlParamSanitizer';

export type CompassUrlPayload = {
    lng?: number | null;
    lat?: number | null;
    radius?: number | null;
    /** 写入时可传主题 cid 或编号；不传则回退古朱砂（0）。 */
    theme?: string | number | null;
    /** 读取结果：V3 短码中的主题编号，历史短码为 0。 */
    themeIndex?: number | null;
    /** 读取结果：主题 cid。 */
    themeCid?: string | null;
};

const COMPASS_PARAM_KEY = 'cs';
const LEGACY_PARAM_KEYS = ['clng', 'clat', 'crot', 'cid', 'cmode'];

/**
 * 把任意输入转为有限数值。
 *
 * 注意：不能用 `Number(value)` 后直接判 `Number.isFinite` —— `Number(null)` 与
 * `Number('')` 均为 0，会把「未提供」误判成「坐标 0」。故先显式拦截空值，
 * 否则罗盘关闭时传入的 `{ null, null, null }` 会被编码成 `(0, 0, 0)` 写回 URL。
 */
function toFinite(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
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
        query: new URLSearchParams(queryRaw),
    };
}

function readMergedQuery(): { path: string; query: URLSearchParams } {
    const { path, query } = readHashState();
    const searchParams = new URLSearchParams(
        String(window.location.search || '').replace(/^\?/, ''),
    );

    searchParams.forEach((value, key) => {
        // V3.7.13：v 等仅 search 参数不得补进 hash query，避免写回时产生重复 v
        if (isSearchOnlyQueryKey(key)) return;
        if (!query.has(key)) query.set(key, value);
    });

    return { path, query };
}

/**
 * 把 path + query 写回地址栏（统一走 hash route）。
 *
 * 保留 location.search 会让已删除的 cs 复活，故只拼 pathname + hash。
 */
function commitCompassUrl(path: string, query: URLSearchParams): void {
    const nextQuery = query.toString();
    const nextHash = nextQuery ? `#${path}?${nextQuery}` : `#${path}`;
    const nextUrl = `${window.location.pathname}${nextHash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
}

export function readCompassUrlState(): CompassUrlPayload {
    if (typeof window === 'undefined') return {};

    const { query } = readMergedQuery();
    const stateCode = String(query.get(COMPASS_PARAM_KEY) || '').trim();
    // 空值和 cs=0 明确表示罗盘关闭，避免默认状态被误恢复。
    if (!stateCode || stateCode === '0') return {};

    const decoded = decodeCompassState(stateCode);

    if (!decoded) return {};

    const themeIndex = toFinite(decoded.themeIndex);

    return {
        lng: toFinite(decoded.lng),
        lat: toFinite(decoded.lat),
        radius: toFinite(decoded.radius),
        themeIndex: themeIndex === null ? null : Math.trunc(themeIndex),
        themeCid: decoded.themeCid ? String(decoded.themeCid) : null,
    };
}

/**
 * 写入罗盘位置到 URL；三项坐标任一缺失或非法时退化为「删除 cs」。
 *
 * @param payload 经纬度与物理半径（米）。传 null/undefined 表示清除。
 */
export function writeCompassUrlState(payload: CompassUrlPayload): void {
    if (typeof window === 'undefined') return;

    try {
        const { path, query } = readMergedQuery();

        const lng = toFinite(payload.lng);
        const lat = toFinite(payload.lat);
        const radius = toFinite(payload.radius);

        // 三项都必须是非 null 的数字；不能写成 Number.isFinite(Number(x))，
        // 那会把 null 折成 0 并通过校验（历史缺陷，见 V3.7.10 日志）。
        const hasCompleteState =
            typeof lng === 'number' &&
            typeof lat === 'number' &&
            typeof radius === 'number' &&
            Number.isFinite(lng) &&
            Number.isFinite(lat) &&
            Number.isFinite(radius);

        const themeSource = payload.theme ?? payload.themeIndex ?? 0;
        const themeIndex = getCompassThemeIndex(themeSource);
        const encoded = hasCompleteState
            ? encodeCompassState(lng, lat, radius, themeIndex)
            : '0';

        LEGACY_PARAM_KEYS.forEach((key) => query.delete(key));

        if (encoded && encoded !== '0') {
            query.set(COMPASS_PARAM_KEY, encoded);
        } else {
            query.delete(COMPASS_PARAM_KEY);
        }

        commitCompassUrl(path, query);
    } catch {
        // URL sync failures should not block map interaction.
    }
}

/**
 * 清理 URL 中的罗盘参数（含历史遗留 key）。
 *
 * 功能：从 hash query 删除 `cs` 与 `clng/clat/crot/cid/cmode`。
 * 核心逻辑：仅当这些参数确实存在时才重写 URL —— 避免罗盘关闭时无谓地
 *   触发 replaceState，也可用于把历史版本写入的脏值（如 (0,0,0) 编码）自愈清除。
 */
export function clearCompassUrlState(): void {
    if (typeof window === 'undefined') return;

    try {
        const { path, query } = readMergedQuery();
        const hasCompassKey =
            query.has(COMPASS_PARAM_KEY) || LEGACY_PARAM_KEYS.some((key) => query.has(key));

        if (!hasCompassKey) return;

        LEGACY_PARAM_KEYS.forEach((key) => query.delete(key));
        query.delete(COMPASS_PARAM_KEY);

        commitCompassUrl(path, query);
    } catch {
        // URL sync failures should not block map interaction.
    }
}
