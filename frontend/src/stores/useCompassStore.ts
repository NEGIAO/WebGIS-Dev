import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { FengShuiCompassConfig, Layer } from '../components/feng-shui-compass-svg/types';
import compassThemes from '../components/feng-shui-compass-svg/themes';
import type { CompassUrlPayload } from '../services/compass/compassUrlState';

type CompassPosition = {
    lng: number;
    lat: number;
};

type SensorPermission = 'unknown' | 'granted' | 'denied' | 'unsupported';

type CompassConfigPatch = Partial<Omit<FengShuiCompassConfig, 'line' | 'scaclStyle' | 'compassSize' | 'data'>> & {
    line?: Partial<FengShuiCompassConfig['line']>;
    scaclStyle?: Partial<FengShuiCompassConfig['scaclStyle']>;
    compassSize?: Partial<FengShuiCompassConfig['compassSize']>;
    data?: FengShuiCompassConfig['data'];
};

function cloneConfig(config: FengShuiCompassConfig): FengShuiCompassConfig {
    return JSON.parse(JSON.stringify(config || {}));
}

function cloneLayers(data: FengShuiCompassConfig['data']): Layer[] {
    if (Array.isArray(data)) {
        return JSON.parse(JSON.stringify(data));
    }
    if (data && typeof data === 'object') {
        return [JSON.parse(JSON.stringify(data)) as Layer];
    }
    return [];
}

function normalizeAngle(value: number): number {
    const next = Number(value);
    if (!Number.isFinite(next)) return 0;
    const compact = next % 360;
    return compact < 0 ? compact + 360 : compact;
}

function normalizeScale(value: number): number {
    const next = Number(value);
    if (!Number.isFinite(next)) return 1;
    return Math.max(0.35, Math.min(2.4, next));
}

function normalizeMeters(value: number): number {
    const next = Number(value);
    if (!Number.isFinite(next)) return 220;
    return Math.max(20, Math.min(500000, next));
}

function normalizeRenderPixels(value: number): number {
    const next = Number(value);
    if (!Number.isFinite(next)) return 800;
    return Math.max(120, Math.min(3200, next));
}

function normalizeOpacity(value: number): number {
    const next = Number(value);
    if (!Number.isFinite(next)) return 1;
    return Math.max(0, Math.min(1, next));
}

function normalizeStrokeWidth(value: number): number {
    const next = Number(value);
    if (!Number.isFinite(next)) return 1;
    return Math.max(0.5, Math.min(8, next));
}

function normalizeCrossLengthRatio(value: number): number {
    const next = Number(value);
    if (!Number.isFinite(next)) return 1 / 3;
    return Math.max(0.1, Math.min(1, next));
}

function isFiniteLonLat(lng: unknown, lat: unknown): boolean {
    const lon = Number(lng);
    const latitude = Number(lat);
    return Number.isFinite(lon)
        && Number.isFinite(latitude)
        && lon >= -180
        && lon <= 180
        && latitude >= -90
        && latitude <= 90;
}

const defaultTheme = Array.isArray(compassThemes) && compassThemes.length > 0
    ? cloneConfig(compassThemes[0] as FengShuiCompassConfig)
    : {
        info: { id: 'fallback-theme', name: 'fallback', preview: '' },
        compassSize: { width: 800, height: 800 },
        data: [],
        line: {
            borderColor: '#AAAAAA',
            scaleColor: '#AAAAAA',
            scaleHighlightColor: '#FF0000'
        },
        rotate: 0,
        latticeFill: [],
        isShowTianxinCross: true,
        isShowScale: true,
        scaclStyle: {
            minLineHeight: 10,
            midLineHeight: 20,
            maxLineHeight: 25
        },
        autoFontSize: true,
        animation: {
            enable: false,
            duration: 300,
            delay: 80
        },
        tianxinCrossWidth: 2,
        tianxinCrossColor: '#ff0000',
        tianxinCrossLengthRatio: 1 / 3
    } as FengShuiCompassConfig;

export const useCompassStore = defineStore('compassStore', () => {
    const enabled = ref(false);
    const placementMode = ref(false);
    const sensorEnabled = ref(false);
    const sensorPermission = ref<SensorPermission>('unknown');

    const position = ref<CompassPosition>({
        lng: 114.302,
        lat: 34.8146
    });

    const rotation = ref<number>(0);
    const scale = ref<number>(1);
    const realWorldDiameterMeters = ref<number>(220);
    const renderPixelDiameter = ref<number>(800);
    const minRenderPixels = ref<number>(120);
    const maxRenderPixels = ref<number>(3200);

    const config = ref<FengShuiCompassConfig>(cloneConfig(defaultTheme));
    config.value.tianxinCrossLengthRatio = normalizeCrossLengthRatio(Number(config.value.tianxinCrossLengthRatio || 1 / 3));

    const activeThemeId = ref<string | number>(String(config.value?.info?.id || ''));

    const hasValidPosition = computed(() => isFiniteLonLat(position.value.lng, position.value.lat));

    const renderCompassSize = computed(() => {
        const baseWidth = Number(config.value?.compassSize?.width || 800);
        const baseHeight = Number(config.value?.compassSize?.height || 800);
        const safeBaseWidth = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 800;
        const safeBaseHeight = Number.isFinite(baseHeight) && baseHeight > 0 ? baseHeight : 800;
        const ratio = safeBaseHeight / safeBaseWidth;

        const minPixels = Number(minRenderPixels.value || 120);
        const maxPixels = Number(maxRenderPixels.value || 3200);
        const normalizedMin = Number.isFinite(minPixels) ? Math.max(60, minPixels) : 120;
        const normalizedMax = Number.isFinite(maxPixels) ? Math.max(normalizedMin, maxPixels) : 3200;
        const width = Math.max(normalizedMin, Math.min(normalizedMax, Math.round(renderPixelDiameter.value)));
        const height = Math.max(normalizedMin, Math.min(normalizedMax, Math.round(width * ratio)));

        return {
            width,
            height
        };
    });

    const renderConfig = computed<FengShuiCompassConfig>(() => {
        const baseConfig = config.value || cloneConfig(defaultTheme);
        const layers = cloneLayers(baseConfig?.data);

        return {
            ...baseConfig,
            rotate: normalizeAngle(rotation.value || 0),
            compassSize: {
                ...(baseConfig?.compassSize || {}),
                width: renderCompassSize.value.width,
                height: renderCompassSize.value.height
            },
            data: layers,
            tianxinCrossColor: String(baseConfig?.tianxinCrossColor || '#ff0000'),
            tianxinCrossWidth: Math.max(1, Number(baseConfig?.tianxinCrossWidth || 2)),
            tianxinCrossLengthRatio: normalizeCrossLengthRatio(Number(baseConfig?.tianxinCrossLengthRatio || 1 / 3))
        } as FengShuiCompassConfig;
    });

    const themeOptions = computed(() => {
        return (Array.isArray(compassThemes) ? compassThemes : []).map((item: any) => ({
            id: item?.info?.id,
            name: String(item?.info?.name || item?.info?.id || 'Theme')
        }));
    });

    const layerEditors = computed(() => {
        const layers = cloneLayers(config.value?.data);
        return layers.map((layer, index) => {
            const layerName = Array.isArray(layer?.name)
                ? layer.name.filter(Boolean).join(' / ')
                : String(layer?.name || `Layer ${index + 1}`);

            return {
                index,
                name: layerName,
                visible: layer?.visible !== false,
                fontSize: Number(layer?.fontSize || 16),
                textOpacity: normalizeOpacity(Number(layer?.textOpacity ?? 1)),
                borderColor: String(layer?.borderColor || '#aaaaaa'),
                strokeWidth: normalizeStrokeWidth(Number(layer?.strokeWidth ?? 1)),
                latticeFillColor: String(layer?.latticeFillColor || '#ffffff'),
                textColor: layer?.textColor
            };
        });
    });

    const urlStyleSyncToken = computed(() => {
        const payload = {
            themeId: String(activeThemeId.value || ''),
            diameterMeters: Number(realWorldDiameterMeters.value || 220),
            style: exportUrlStyleState()
        };
        return JSON.stringify(payload);
    });

    function ensureCrossRatioInConfig(): void {
        config.value = {
            ...config.value,
            tianxinCrossLengthRatio: normalizeCrossLengthRatio(Number(config.value?.tianxinCrossLengthRatio || 1 / 3))
        } as FengShuiCompassConfig;
    }

    function setEnabled(value: boolean): void {
        enabled.value = Boolean(value);
        if (!enabled.value) {
            placementMode.value = false;
            sensorEnabled.value = false;
        }
    }

    function setPlacementMode(value: boolean): void {
        placementMode.value = Boolean(value);
    }

    function setPosition(lng: number, lat: number): void {
        if (!isFiniteLonLat(lng, lat)) return;
        position.value = {
            lng: Number(lng),
            lat: Number(lat)
        };
    }

    function setRotation(value: number): void {
        rotation.value = normalizeAngle(value);
    }

    function setScale(value: number): void {
        scale.value = normalizeScale(value);
    }

    function setRealWorldDiameterMeters(value: number): void {
        realWorldDiameterMeters.value = normalizeMeters(value);
    }

    function setRenderPixelDiameter(value: number): void {
        const normalizedValue = normalizeRenderPixels(value);
        const normalizedMin = Math.max(60, Number(minRenderPixels.value || 120));
        const normalizedMax = Math.max(normalizedMin, Number(maxRenderPixels.value || 3200));
        renderPixelDiameter.value = Math.max(normalizedMin, Math.min(normalizedMax, normalizedValue));
    }

    function setSensorEnabled(value: boolean): void {
        sensorEnabled.value = Boolean(value);
    }

    function setSensorPermission(value: SensorPermission): void {
        sensorPermission.value = value;
    }

    function applyThemeById(id: string | number): void {
        const nextTheme = (Array.isArray(compassThemes) ? compassThemes : []).find((item: any) => String(item?.info?.id) === String(id));
        if (!nextTheme) return;

        const clonedTheme = cloneConfig(nextTheme as FengShuiCompassConfig);
        clonedTheme.rotate = normalizeAngle(rotation.value);
        clonedTheme.tianxinCrossLengthRatio = normalizeCrossLengthRatio(Number(clonedTheme?.tianxinCrossLengthRatio || 1 / 3));
        config.value = clonedTheme;
        activeThemeId.value = String(clonedTheme?.info?.id || id);
    }

    function replaceConfig(nextConfig: FengShuiCompassConfig): void {
        const clonedConfig = cloneConfig(nextConfig as FengShuiCompassConfig);
        clonedConfig.rotate = normalizeAngle(rotation.value);
        clonedConfig.tianxinCrossLengthRatio = normalizeCrossLengthRatio(Number(clonedConfig?.tianxinCrossLengthRatio || 1 / 3));
        config.value = clonedConfig;
    }

    function patchConfig(partial: CompassConfigPatch): void {
        const merged = {
            ...config.value,
            ...partial,
            line: {
                ...(config.value?.line || {}),
                ...(partial?.line || {})
            },
            scaclStyle: {
                ...(config.value?.scaclStyle || {}),
                ...(partial?.scaclStyle || {})
            },
            compassSize: {
                ...(config.value?.compassSize || {}),
                ...(partial?.compassSize || {})
            },
            data: partial?.data === undefined
                ? config.value?.data
                : cloneLayers(partial.data)
        } as FengShuiCompassConfig;

        merged.rotate = normalizeAngle(rotation.value);
        merged.tianxinCrossLengthRatio = normalizeCrossLengthRatio(Number(merged?.tianxinCrossLengthRatio || 1 / 3));
        config.value = merged;
    }

    function patchLayerConfig(layerIndex: number, partial: Partial<Layer>): void {
        const layers = cloneLayers(config.value?.data);
        if (!layers[layerIndex]) return;
        layers[layerIndex] = {
            ...layers[layerIndex],
            ...partial
        } as Layer;
        patchConfig({ data: layers });
    }

    function setLayerVisibility(layerIndex: number, visible: boolean): void {
        patchLayerConfig(layerIndex, { visible: Boolean(visible) });
    }

    function setLayerFontSize(layerIndex: number, fontSize: number): void {
        const nextFontSize = Number(fontSize);
        if (!Number.isFinite(nextFontSize)) return;
        patchLayerConfig(layerIndex, {
            fontSize: Math.max(8, Math.min(72, nextFontSize))
        });
    }

    function setLayerTextOpacity(layerIndex: number, value: number): void {
        patchLayerConfig(layerIndex, {
            textOpacity: normalizeOpacity(value)
        });
    }

    function setLayerTextColor(layerIndex: number, value: string | string[]): void {
        if (Array.isArray(value)) {
            patchLayerConfig(layerIndex, {
                textColor: value.map((item) => String(item || '').trim()).filter(Boolean)
            });
            return;
        }

        const compact = String(value || '').trim();
        if (!compact) return;
        patchLayerConfig(layerIndex, { textColor: compact });
    }

    function setLayerBorderColor(layerIndex: number, value: string): void {
        const compact = String(value || '').trim() || '#aaaaaa';
        patchLayerConfig(layerIndex, { borderColor: compact });
    }

    function setLayerStrokeWidth(layerIndex: number, value: number): void {
        patchLayerConfig(layerIndex, {
            strokeWidth: normalizeStrokeWidth(value)
        });
    }

    function setLayerLatticeFillColor(layerIndex: number, value: string): void {
        const compact = String(value || '').trim() || '#ffffff';
        patchLayerConfig(layerIndex, {
            latticeFillColor: compact
        });
    }

    function exportUrlStyleState() {
        const currentConfig = config.value || cloneConfig(defaultTheme);
        const layers = cloneLayers(currentConfig?.data);

        return {
            line: {
                borderColor: String(currentConfig?.line?.borderColor || '#aaaaaa'),
                scaleColor: String(currentConfig?.line?.scaleColor || '#aaaaaa'),
                scaleHighlightColor: String(currentConfig?.line?.scaleHighlightColor || '#ff0000')
            },
            isShowScale: currentConfig?.isShowScale !== false,
            isShowTianxinCross: currentConfig?.isShowTianxinCross !== false,
            tianxinCrossColor: String(currentConfig?.tianxinCrossColor || '#ff0000'),
            tianxinCrossWidth: Math.max(1, Number(currentConfig?.tianxinCrossWidth || 2)),
            tianxinCrossLengthRatio: normalizeCrossLengthRatio(Number(currentConfig?.tianxinCrossLengthRatio || 1 / 3)),
            scaclStyle: {
                minLineHeight: Number(currentConfig?.scaclStyle?.minLineHeight || 10),
                midLineHeight: Number(currentConfig?.scaclStyle?.midLineHeight || 20),
                maxLineHeight: Number(currentConfig?.scaclStyle?.maxLineHeight || 25),
                numberFontSize: Number(currentConfig?.scaclStyle?.numberFontSize || 0) || undefined
            },
            layers: layers.map((layer) => ({
                visible: layer?.visible !== false,
                fontSize: Number(layer?.fontSize || 16),
                textColor: Array.isArray(layer?.textColor)
                    ? layer.textColor.map((item) => String(item || '').trim()).filter(Boolean)
                    : String(layer?.textColor || '#ffffff'),
                textOpacity: normalizeOpacity(Number(layer?.textOpacity ?? 1)),
                borderColor: String(layer?.borderColor || ''),
                strokeWidth: normalizeStrokeWidth(Number(layer?.strokeWidth ?? 1)),
                latticeFillColor: String(layer?.latticeFillColor || '')
            }))
        };
    }

    function applyUrlStyleState(style: CompassUrlPayload['style']): void {
        if (!style) return;

        patchConfig({
            line: {
                ...(style?.line || {})
            },
            isShowScale: typeof style?.isShowScale === 'boolean' ? style.isShowScale : config.value?.isShowScale,
            isShowTianxinCross: typeof style?.isShowTianxinCross === 'boolean' ? style.isShowTianxinCross : config.value?.isShowTianxinCross,
            tianxinCrossColor: style?.tianxinCrossColor || config.value?.tianxinCrossColor,
            tianxinCrossWidth: Number.isFinite(Number(style?.tianxinCrossWidth))
                ? Number(style?.tianxinCrossWidth)
                : config.value?.tianxinCrossWidth,
            tianxinCrossLengthRatio: Number.isFinite(Number(style?.tianxinCrossLengthRatio))
                ? normalizeCrossLengthRatio(Number(style?.tianxinCrossLengthRatio))
                : config.value?.tianxinCrossLengthRatio,
            scaclStyle: {
                ...(config.value?.scaclStyle || {}),
                ...(style?.scaclStyle || {})
            }
        });

        if (Array.isArray(style?.layers)) {
            style.layers.forEach((layerStyle, index) => {
                if (!layerStyle) return;

                if (typeof layerStyle.visible === 'boolean') {
                    setLayerVisibility(index, layerStyle.visible);
                }

                if (Number.isFinite(Number(layerStyle.fontSize))) {
                    setLayerFontSize(index, Number(layerStyle.fontSize));
                }

                if (layerStyle.textColor !== undefined) {
                    setLayerTextColor(index, layerStyle.textColor as string | string[]);
                }

                if (Number.isFinite(Number(layerStyle.textOpacity))) {
                    setLayerTextOpacity(index, Number(layerStyle.textOpacity));
                }

                if (layerStyle.borderColor) {
                    setLayerBorderColor(index, String(layerStyle.borderColor));
                }

                if (Number.isFinite(Number(layerStyle.strokeWidth))) {
                    setLayerStrokeWidth(index, Number(layerStyle.strokeWidth));
                }

                if (layerStyle.latticeFillColor) {
                    setLayerLatticeFillColor(index, String(layerStyle.latticeFillColor));
                }
            });
        }

        ensureCrossRatioInConfig();
    }

    function hydrateFromUrlPayload(payload: CompassUrlPayload): void {
        if (payload && isFiniteLonLat(payload.lng, payload.lat)) {
            setPosition(Number(payload.lng), Number(payload.lat));
        }

        if (Number.isFinite(Number(payload?.rotation))) {
            setRotation(Number(payload?.rotation));
        }

        if (Number.isFinite(Number(payload?.scale))) {
            setScale(Number(payload?.scale));
        }

        if (Number.isFinite(Number(payload?.diameterMeters))) {
            setRealWorldDiameterMeters(Number(payload?.diameterMeters));
        }

        if (payload?.themeId !== undefined && payload?.themeId !== null && payload?.themeId !== '') {
            applyThemeById(String(payload.themeId));
        }

        if (payload?.style) {
            applyUrlStyleState(payload.style);
        }

        if (typeof payload?.enabled === 'boolean') {
            setEnabled(payload.enabled);
        }
    }

    return {
        enabled,
        placementMode,
        sensorEnabled,
        sensorPermission,
        position,
        rotation,
        scale,
        realWorldDiameterMeters,
        renderPixelDiameter,
        minRenderPixels,
        maxRenderPixels,
        config,
        activeThemeId,
        hasValidPosition,
        renderCompassSize,
        renderConfig,
        themeOptions,
        layerEditors,
        urlStyleSyncToken,
        setEnabled,
        setPlacementMode,
        setPosition,
        setRotation,
        setScale,
        setRealWorldDiameterMeters,
        setRenderPixelDiameter,
        setSensorEnabled,
        setSensorPermission,
        applyThemeById,
        replaceConfig,
        patchConfig,
        patchLayerConfig,
        setLayerVisibility,
        setLayerFontSize,
        setLayerTextOpacity,
        setLayerTextColor,
        setLayerBorderColor,
        setLayerStrokeWidth,
        setLayerLatticeFillColor,
        exportUrlStyleState,
        applyUrlStyleState,
        hydrateFromUrlPayload,
    };
});
