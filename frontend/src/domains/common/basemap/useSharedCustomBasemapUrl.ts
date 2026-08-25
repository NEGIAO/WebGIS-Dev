import { ref, watch, type Ref } from 'vue';
import { looksLikeWmsSourceUrl } from './wmsService';

/** OL/Cesium 共享的 custom/Wayback URL 持久化键。 */
export const CUSTOM_BASEMAP_URL_STORAGE_KEY = 'webgis_custom_basemap_url';
const LEGACY_CESIUM_CUSTOM_BASEMAP_URL_STORAGE_KEY = 'cesium_custom_xyz_basemap_url';

function readInitialUrl(): string {
    if (typeof window === 'undefined') return '';
    try {
        const stored = String(
            window.localStorage.getItem(CUSTOM_BASEMAP_URL_STORAGE_KEY) ||
                window.localStorage.getItem(LEGACY_CESIUM_CUSTOM_BASEMAP_URL_STORAGE_KEY) ||
                '',
        ).trim();

        // 历史污染治理：服务类地址（WMS/ArcGIS REST）归注册表管，
        // 不属于 XYZ 通道 —— 发现即清除，杜绝"每次刷新自动复活加载"
        if (stored && looksLikeWmsSourceUrl(stored)) {
            try {
                window.localStorage.removeItem(CUSTOM_BASEMAP_URL_STORAGE_KEY);
                window.localStorage.removeItem(LEGACY_CESIUM_CUSTOM_BASEMAP_URL_STORAGE_KEY);
            } catch {
                /* ignore */
            }
            return '';
        }
        return stored;
    } catch {
        return '';
    }
}

/**
 * custom/Wayback URL 的运行时唯一状态源。
 * 用户手动输入与 Wayback 系统选择都写入此 ref；OL/Cesium 直接共享，不经过路由。
 */
const sharedCustomBasemapUrl = ref(readInitialUrl());

watch(sharedCustomBasemapUrl, (value) => {
    if (typeof window === 'undefined') return;
    const normalized = String(value || '').trim();
    try {
        if (normalized) {
            window.localStorage.setItem(CUSTOM_BASEMAP_URL_STORAGE_KEY, normalized);
        } else {
            window.localStorage.removeItem(CUSTOM_BASEMAP_URL_STORAGE_KEY);
        }
    } catch {
        // 隐私模式或禁用 storage 时保留当前会话内存状态。
    }
});

export function setSharedCustomBasemapUrl(value: unknown): void {
    sharedCustomBasemapUrl.value = String(value ?? '').trim();
}

export function useSharedCustomBasemapUrl(): {
    customBasemapUrl: Ref<string>;
    setCustomBasemapUrl: typeof setSharedCustomBasemapUrl;
} {
    return {
        customBasemapUrl: sharedCustomBasemapUrl,
        setCustomBasemapUrl: setSharedCustomBasemapUrl,
    };
}
