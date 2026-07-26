/**
 * 分享链接入口解析特性（自 MapContainer 抽离，行为保持一致）。
 *
 * 职责：
 * - parseSharedEntryFlagFromUrl：识别当前 URL 是否为分享入口（新版 s=1 参数 + 旧版 from/shared 兼容）
 * - resolveSharedAddressByLonLat：分享启动问候的逆地理编码（高德优先，天地图兜底，失败静默）
 */
import { apiReverseGeocodeWithFallback } from '../../../api';

export function createSharedEntryResolver({ tiandituTkRef }) {
    function normalizeBinaryFlag(value, fallback = '0') {
        const compact = String(value ?? '')
            .trim()
            .toLowerCase();
        if (compact === '1' || compact === 'true') return '1';
        if (compact === '0' || compact === 'false') return '0';
        return fallback; // 直接返回 fallback，不再硬编码 '0'
    }

    /** 识别分享入口：hash/search 中 s=1，或旧版 from/shared 标记 */
    function parseSharedEntryFlagFromUrl() {
        if (typeof window === 'undefined') return false;

        const hash = String(window.location.hash || '');
        const queryStart = hash.indexOf('?');
        const hashParams =
            queryStart >= 0
                ? new URLSearchParams(hash.slice(queryStart + 1))
                : new URLSearchParams();

        const searchParams = new URLSearchParams(
            String(window.location.search || '').replace(/^\?/, ''),
        );
        const shareFlagRaw = hashParams.get('s') ?? searchParams.get('s');
        if (shareFlagRaw !== null && String(shareFlagRaw).trim() !== '') {
            return normalizeBinaryFlag(shareFlagRaw, '0') === '1';
        }

        // 兼容旧版分享链接。
        const legacyMarker = String(
            hashParams.get('from') ||
                hashParams.get('shared') ||
                searchParams.get('from') ||
                searchParams.get('shared') ||
                '',
        )
            .trim()
            .toLowerCase();

        return (
            legacyMarker === 'share' ||
            legacyMarker === 'shared' ||
            legacyMarker === '1' ||
            legacyMarker === 'true'
        );
    }

    /** 启动问候地址解析：高德优先，天地图兜底；失败返回空串不阻断启动 */
    async function resolveSharedAddressByLonLat(lng, lat) {
        const lon = Number(lng);
        const latitude = Number(lat);
        if (!Number.isFinite(lon) || !Number.isFinite(latitude)) return '';

        try {
            const geocodeResponse = await apiReverseGeocodeWithFallback(lon, latitude, {
                tiandituTk: tiandituTkRef.value, // 读取响应式 ref，确保 token 轮换后使用最新值
                tiandituTimeout: 3500,
                silent: true,
            });
            const geocodeResult = geocodeResponse?.data || null;
            return String(geocodeResult?.formattedAddress || '').trim();
        } catch {
            // 逆地理编码失败不阻断启动流程，回退到通用欢迎语。
            return '';
        }
    }

    return {
        parseSharedEntryFlagFromUrl,
        resolveSharedAddressByLonLat,
    };
}
