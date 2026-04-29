import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
//注意：此处仅仅引用了配置，实际的绘制实现和他们无关，绘制实现完全在CompassManager中，与Vue无关
import type { FengShuiCompassConfig, Layer } from '../components/feng-shui-compass-svg/types';
import localThemes from '../components/feng-shui-compass-svg/themes';

export type CompassMode = 'vector' | 'hud';

type SensorPermission = 'unknown' | 'granted' | 'denied' | 'unsupported';

type CompassPosition = {
    lng: number;
    lat: number;
};

type CompassThemeOption = {
    cid: string;
    name: string;
    description?: string;
};

const DEFAULT_CID = 'ancient-cinnabar';

const DEFAULT_THEME_OPTIONS: CompassThemeOption[] = [
    { cid: 'ancient-cinnabar', name: 'Ancient Cinnabar' },
    { cid: 'dark-gold', name: 'Dark Gold' },
    { cid: 'jade-realm', name: 'Jade Realm' },
    { cid: 'minimalist', name: 'Minimalist' },
    { cid: 'cyber-blueprint', name: 'Cyber Blueprint' }
];

const LOCAL_THEME_INDEX_BY_CID: Record<string, number> = {
    'ancient-cinnabar': 0,
    'dark-gold': 2,
    'jade-realm': 1,
    'minimalist': 4,
    'cyber-blueprint': 3
};

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function normalizeAngle(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const compact = numeric % 360;
    return compact < 0 ? compact + 360 : compact;
}

function clamp(value: number, minValue: number, maxValue: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return minValue;
    return Math.max(minValue, Math.min(maxValue, numeric));
}

function toLayerArray(data: FengShuiCompassConfig['data']): Layer[] {
    if (Array.isArray(data)) return deepClone(data);
    if (data && typeof data === 'object') return [deepClone(data as Layer)];
    return [];
}

function normalizeCompassConfig(rawConfig: Partial<FengShuiCompassConfig> | null | undefined, cid: string, name = ''): FengShuiCompassConfig {
    const fallback = {
        info: { id: cid, name: name || cid },
        compassSize: { width: 1000, height: 1000 },  // 罗盘大小
        data: [],                                 // 图层数据
        line: {
            borderColor: '#AAAAAA',                 // 边框颜色
            scaleColor: '#AAAAAA',                  // 刻度颜色
            scaleHighlightColor: '#FF0000'          // 高亮刻度
        },
        rotate: 0,                                // 旋转角度
        latticeFill: [],                          // 文字填充色
        isShowTianxinCross: true,                 // 显示天心十字线
        isShowScale: true,                        // 显示刻度
        scaclStyle: {
            minLineHeight: 10,                      // 刻度短线高度
            midLineHeight: 20,                      // 中线高度
            maxLineHeight: 25,                      // 长线高度
            numberFontSize: 15                      // 刻度文字大小
        },
        tianxinCrossWidth: 2,                     // 天心线宽度
        tianxinCrossColor: '#FF0000',             // 天心线颜色
    } as FengShuiCompassConfig;

    const merged = {
        ...fallback,
        ...(rawConfig || {}),
        info: {
            ...(fallback.info || {}),
            ...((rawConfig && rawConfig.info) || {}),
            id: cid,
            name: String((rawConfig && rawConfig.info && rawConfig.info.name) || name || cid)
        },
        compassSize: {
            ...(fallback.compassSize || {}),
            ...((rawConfig && rawConfig.compassSize) || {})
        },
        line: {
            ...(fallback.line || {}),
            ...((rawConfig && rawConfig.line) || {})
        },
        scaclStyle: {
            ...(fallback.scaclStyle || {}),
            ...((rawConfig && rawConfig.scaclStyle) || {})
        }
    } as FengShuiCompassConfig;

    merged.data = toLayerArray(rawConfig?.data || fallback.data);
    merged.rotate = 0;
    merged.tianxinCrossWidth = clamp(Number(merged.tianxinCrossWidth || 2), 1, 8);
    merged.tianxinCrossColor = String(merged.tianxinCrossColor || '#FF0000');
    merged.tianxinCrossLengthRatio = clamp(Number((rawConfig as any)?.tianxinCrossLengthRatio || 1 / 3), 0.1, 1);

    return merged;
}

function resolveThemeNameByCid(cid: string): string {
    const matched = DEFAULT_THEME_OPTIONS.find((item) => item.cid === cid);
    return String(matched?.name || cid || DEFAULT_CID);
}

function createFallbackConfigByCid(cid: string): FengShuiCompassConfig {
    const safeCid = String(cid || DEFAULT_CID).trim() || DEFAULT_CID;
    const index = LOCAL_THEME_INDEX_BY_CID[safeCid] ?? 0;
    const localTheme = Array.isArray(localThemes) && localThemes[index]
        ? deepClone(localThemes[index] as FengShuiCompassConfig)
        : null;

    return normalizeCompassConfig(localTheme, safeCid, resolveThemeNameByCid(safeCid));
}

function hasValidLonLat(position: CompassPosition): boolean {
    return Number.isFinite(Number(position?.lng))
        && Number.isFinite(Number(position?.lat))
        && Number(position.lng) >= -180
        && Number(position.lng) <= 180
        && Number(position.lat) >= -90
        && Number(position.lat) <= 90;
}

export const useCompassStore = defineStore('compassStore', () => {
    const enabled = ref(false);
    const mode = ref<CompassMode>('vector');
    const placementMode = ref(false);

    const sensorEnabled = ref(false);
    const sensorPermission = ref<SensorPermission>('unknown');

    const position = ref<CompassPosition>({
        lng: 114.302,
        lat: 34.8146
    });

    const rotation = ref(0);
    const physicalRadiusMeters = ref(10000);
    const opacity = ref(0.9);
    const minResolution = ref(450);
    const hudSizePx = ref(280);

    const cid = ref(DEFAULT_CID);
    const themeOptions = ref<CompassThemeOption[]>(deepClone(DEFAULT_THEME_OPTIONS));

    const config = ref<FengShuiCompassConfig>(createFallbackConfigByCid(DEFAULT_CID));
    const configRevision = ref(1);

    const isConfigLoading = ref(false);
    const configError = ref('');
    const hasFetchedThemeCatalog = ref(false);
    const hasFetchedLocalConfig = ref(false);

    const hasValidPosition = computed(() => hasValidLonLat(position.value));
    const vectorVisible = computed(() => enabled.value && mode.value === 'vector');
    const hudVisible = computed(() => enabled.value && mode.value === 'hud');

    const vectorRenderConfig = computed<FengShuiCompassConfig>(() => {
        return {
            ...deepClone(config.value),
            rotate: normalizeAngle(rotation.value),
            tianxinCrossLengthRatio: clamp(Number(config.value?.tianxinCrossLengthRatio || 1 / 3), 0.1, 1)
        } as FengShuiCompassConfig;
    });

    const hudRenderConfig = computed<FengShuiCompassConfig>(() => {
        const baseConfig = vectorRenderConfig.value;
        const size = Math.round(clamp(hudSizePx.value, 180, 520));
        return {
            ...deepClone(baseConfig),
            compassSize: {
                ...(baseConfig?.compassSize || {}),
                width: size,
                height: size
            },
            rotate: normalizeAngle(rotation.value),
            tianxinCrossLengthRatio: clamp(Number(baseConfig?.tianxinCrossLengthRatio || 1 / 3), 0.1, 1)
        } as FengShuiCompassConfig;
    });

    const renderCacheToken = computed(() => `${String(cid.value)}:${Number(configRevision.value || 0)}`);

    function bumpConfigRevision(): void {
        configRevision.value += 1;
    }

    function setEnabled(next: boolean): void {
        enabled.value = Boolean(next);
        if (!enabled.value) {
            placementMode.value = false;
            sensorEnabled.value = false;
        }
    }

    function setMode(nextMode: CompassMode): void {
        mode.value = nextMode === 'hud' ? 'hud' : 'vector';
        if (mode.value !== 'vector') {
            placementMode.value = false;
        }
    }

    function setPlacementMode(next: boolean): void {
        placementMode.value = Boolean(next);
    }

    function setSensorEnabled(next: boolean): void {
        sensorEnabled.value = Boolean(next);
    }

    function setSensorPermission(next: SensorPermission): void {
        sensorPermission.value = next;
    }

    function setPosition(lng: number, lat: number): void {
        const nextPosition = {
            lng: Number(lng),
            lat: Number(lat)
        };
        if (!hasValidLonLat(nextPosition)) return;
        position.value = nextPosition;
    }

    function setRotation(nextRotation: number): void {
        rotation.value = normalizeAngle(nextRotation);
    }

    function setPhysicalRadiusMeters(nextMeters: number): void {
        const numeric = Number(nextMeters);
        if (!Number.isFinite(numeric)) return;
        physicalRadiusMeters.value = Math.abs(numeric);
    }

    function setOpacity(nextOpacity: number): void {
        opacity.value = clamp(Number(nextOpacity), 0.1, 1);
    }

    function setMinResolution(nextResolution: number): void {
        minResolution.value = clamp(Number(nextResolution), 0.01, 50000);
    }

    function setHudSize(nextSize: number): void {
        hudSizePx.value = clamp(Number(nextSize), 180, 520);
    }

    function replaceConfig(nextConfig: Partial<FengShuiCompassConfig> | null | undefined, nextCid?: string, nextName?: string): void {
        const targetCid = String(nextCid || cid.value || DEFAULT_CID).trim() || DEFAULT_CID;
        const normalized = normalizeCompassConfig(nextConfig, targetCid, String(nextName || resolveThemeNameByCid(targetCid)));
        config.value = normalized;
        cid.value = targetCid;
        bumpConfigRevision();
    }

    async function loadThemeCatalog(): Promise<void> {
        if (hasFetchedThemeCatalog.value) return;
        hasFetchedThemeCatalog.value = true;
        themeOptions.value = deepClone(DEFAULT_THEME_OPTIONS);
    }

    async function loadConfigByCid(nextCid: string): Promise<void> {
        const safeCid = String(nextCid || '').trim() || DEFAULT_CID;
        isConfigLoading.value = true;
        configError.value = '';

        try {
            const fallbackConfig = createFallbackConfigByCid(safeCid);
            replaceConfig(fallbackConfig, safeCid, resolveThemeNameByCid(safeCid));
            hasFetchedLocalConfig.value = true;
        } catch (error: any) {
            const fallbackConfig = createFallbackConfigByCid(safeCid);
            replaceConfig(fallbackConfig, safeCid, resolveThemeNameByCid(safeCid));
            configError.value = String(error?.message || `failed to load local cid: ${safeCid}`);
        } finally {
            isConfigLoading.value = false;
        }
    }

    async function setCidAndLoad(nextCid: string): Promise<void> {
        await loadConfigByCid(nextCid);
    }

    async function ensureConfigLoaded(): Promise<void> {
        await loadThemeCatalog();
        if (!hasFetchedLocalConfig.value) {
            await loadConfigByCid(cid.value || DEFAULT_CID);
        }
    }

    async function requestOrientationPermission(): Promise<boolean> {
        if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
            setSensorPermission('unsupported');
            return false;
        }

        const requester = (DeviceOrientationEvent as any)?.requestPermission;
        if (typeof requester !== 'function') {
            setSensorPermission('granted');
            return true;
        }

        try {
            const result = await requester.call(DeviceOrientationEvent);
            if (result === 'granted') {
                setSensorPermission('granted');
                return true;
            }
            setSensorPermission('denied');
            return false;
        } catch {
            setSensorPermission('denied');
            return false;
        }
    }

    return {
        enabled,
        mode,
        placementMode,
        sensorEnabled,
        sensorPermission,
        position,
        rotation,
        physicalRadiusMeters,
        opacity,
        minResolution,
        hudSizePx,
        cid,
        themeOptions,
        config,
        configRevision,
        isConfigLoading,
        configError,
        hasValidPosition,
        vectorVisible,
        hudVisible,
        vectorRenderConfig,
        hudRenderConfig,
        renderCacheToken,
        setEnabled,
        setMode,
        setPlacementMode,
        setSensorEnabled,
        setSensorPermission,
        setPosition,
        setRotation,
        setPhysicalRadiusMeters,
        setOpacity,
        setMinResolution,
        setHudSize,
        replaceConfig,
        loadThemeCatalog,
        loadConfigByCid,
        setCidAndLoad,
        ensureConfigLoaded,
        requestOrientationPermission
    };
});
