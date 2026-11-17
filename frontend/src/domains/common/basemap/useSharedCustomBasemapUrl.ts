import { ref, watch, type Ref } from 'vue';
import { looksLikeWmsSourceUrl } from './wmsService';

/** OL/Cesium 共享的 custom/Wayback URL 持久化键。 */
export const CUSTOM_BASEMAP_URL_STORAGE_KEY = 'webgis_custom_basemap_url';
/** custom 矢量瓦片对应的 MapLibre/Mapbox 样式 URL 持久化键。 */
export const CUSTOM_MAP_STYLE_URL_STORAGE_KEY = 'webgis_custom_map_style_url';
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

function readInitialStyleUrl(): string {
    if (typeof window === 'undefined') return '';
    try {
        return String(window.localStorage.getItem(CUSTOM_MAP_STYLE_URL_STORAGE_KEY) || '').trim();
    } catch {
        return '';
    }
}

/**
 * custom/Wayback URL 的运行时唯一状态源。
 * 用户手动输入与 Wayback 系统选择都写入此 ref；OL/Cesium 直接共享，不经过路由。
 */
const sharedCustomBasemapUrl = ref(readInitialUrl());
/** 与 custom 矢量瓦片配套的服务端样式 URL；与瓦片 URL 平行共享/持久化。 */
const sharedCustomMapStyleUrl = ref(readInitialStyleUrl());

watch(sharedCustomBasemapUrl, (value) => {
    if (typeof window === 'undefined') return;
    const normalized = String(value || '').trim();
    try {
        if (normalized) {
            window.localStorage.setItem(CUSTOM_BASEMAP_URL_STORAGE_KEY, normalized);
        } else {
            window.localStorage.removeItem(CUSTOM_BASEMAP_URL_STORAGE_KEY);
            // 瓦片 URL 清空时样式 URL 一并清除，避免残留样式作用到别的图源
            sharedCustomMapStyleUrl.value = '';
        }
    } catch {
        // 隐私模式或禁用 storage 时保留当前会话内存状态。
    }
});

watch(sharedCustomMapStyleUrl, (value) => {
    if (typeof window === 'undefined') return;
    const normalized = String(value || '').trim();
    try {
        if (normalized) {
            window.localStorage.setItem(CUSTOM_MAP_STYLE_URL_STORAGE_KEY, normalized);
        } else {
            window.localStorage.removeItem(CUSTOM_MAP_STYLE_URL_STORAGE_KEY);
        }
    } catch {
        // 隐私模式或禁用 storage 时保留当前会话内存状态。
    }
});

export function setSharedCustomBasemapUrl(value: unknown): void {
    sharedCustomBasemapUrl.value = String(value ?? '').trim();
}

export function setSharedCustomMapStyleUrl(value: unknown): void {
    sharedCustomMapStyleUrl.value = String(value ?? '').trim();
}

export function useSharedCustomBasemapUrl(): {
    customBasemapUrl: Ref<string>;
    customMapStyleUrl: Ref<string>;
    setCustomBasemapUrl: typeof setSharedCustomBasemapUrl;
    setCustomMapStyleUrl: typeof setSharedCustomMapStyleUrl;
} {
    return {
        customBasemapUrl: sharedCustomBasemapUrl,
        customMapStyleUrl: sharedCustomMapStyleUrl,
        setCustomBasemapUrl: setSharedCustomBasemapUrl,
        setCustomMapStyleUrl: setSharedCustomMapStyleUrl,
    };
}
