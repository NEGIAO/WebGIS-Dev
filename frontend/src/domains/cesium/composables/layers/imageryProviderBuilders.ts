import {
    looksLikeWmsSourceUrl,
    ensureWmsServiceInfo,
    getCachedWmsInfo,
    buildArcgisExportTemplate,
} from '@common/basemap/wmsService';
import { tileProxyUrl } from '@/config/publicRuntime';
import { resolvePresetLayerIds } from '@common/basemap/catalogProjection';
import {
    buildCesiumImageryProvidersForPreset,
    wrapProviderWithFetchFallback,
} from '@cesium-domain/constants/basemapProviderFactory';
import { arcgisBboxParts } from './i3sWebMercator';
import {
    TDT_SERVICE_ROOT,
    TDT_SUBDOMAINS,
    CUSTOM_XYZ_BASEMAP_ID,
    getUnifiedBasemapOptions,
    terrainOptions,
    getTerrainIconColor,
    getTerrainIconText,
    getBasemapTooltip,
    getPresetPickerColor,
    getPresetPickerLabel,
    normalizeCustomXyzUrl,
    createOfficialBasemapId,
    createPickerIcon,
} from './layerUtils';

export function createImageryProviderBuilderSuite({
    getCesium,
    getTiandituToken,
    getOvitalTdtkey,
    customXyzBasemapUrl,
    activeBasemap,
    applyBasemap,
    message,
    imageryProviderViewModelById,
    imageryProviderIdByViewModel,
    terrainProviderViewModelById,
    terrainProviderIdByViewModel,
    officialBasemapOptions,
    createTerrainProviderById,
}: {
    getCesium?: () => any;
    getTiandituToken: () => string;
    getOvitalTdtkey: () => string;
    customXyzBasemapUrl: { value: string };
    activeBasemap: { value: string };
    applyBasemap: (value: string, options?: any) => boolean;
    message: any;
    imageryProviderViewModelById: Map<any, any>;
    imageryProviderIdByViewModel: Map<any, any>;
    terrainProviderViewModelById: Map<any, any>;
    terrainProviderIdByViewModel: Map<any, any>;
    officialBasemapOptions: { value: any[] };
    createTerrainProviderById: (id: string) => any;
}) {
    let customWmsSelectedLayer = '';
    let customWmsLayerForUrl = '';
    let wmsResolvingNotifiedUrl = '';
    let wmsFailureNotifiedUrl = '';

    function getCustomWmsSelectedLayer() {
        return customWmsSelectedLayer;
    }

    function updateCustomWmsLayerSelection(normalizedUrl: string, wmsLayer?: string, info?: any) {
        if (customWmsLayerForUrl !== normalizedUrl) {
            customWmsSelectedLayer = '';
            customWmsLayerForUrl = normalizedUrl;
        }
        if (wmsLayer && info?.layerOptions?.some((option: any) => option.name === wmsLayer)) {
            customWmsSelectedLayer = wmsLayer;
        }
        return customWmsSelectedLayer;
    }

    function getDefaultImageryProviderViewModels() {
        const Cesium = getCesium?.();
        if (typeof Cesium?.createDefaultImageryProviderViewModels !== 'function') {
            return [];
        }

        try {
            return Cesium.createDefaultImageryProviderViewModels() || [];
        } catch (error) {
            console.warn('Cesium default imagery provider view models unavailable:', error);
            return [];
        }
    }

    function createTiandituImageryProviders() {
        const Cesium = getCesium?.();
        return [
            new Cesium.UrlTemplateImageryProvider({
                url: `${TDT_SERVICE_ROOT}DataServer?T=img_w&x={x}&y={y}&l={z}&tk=${getTiandituToken()}`,
                subdomains: TDT_SUBDOMAINS,
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 18,
            }),
        ];
    }

    function createGoogleImageryProviders() {
        const Cesium = getCesium?.();
        return [
            new Cesium.UrlTemplateImageryProvider({
                url: tileProxyUrl('mt{s}.google.com/vt?lyrs=s&x={x}&y={y}&z={z}'),
                subdomains: ['0', '1', '2', '3'],
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 20,
            }),
        ];
    }

    function createCustomArcgisImageryProviders(Cesium: any, info: any, selectedLayer: any) {
        const template = buildArcgisExportTemplate(info, selectedLayer);
        return [
            new Cesium.UrlTemplateImageryProvider({
                url: template,
                customTags: {
                    minx: (_: any, x: number, y: number, z: number) => arcgisBboxParts(z, x, y).minx,
                    miny: (_: any, x: number, y: number, z: number) => arcgisBboxParts(z, x, y).miny,
                    maxx: (_: any, x: number, y: number, z: number) => arcgisBboxParts(z, x, y).maxx,
                    maxy: (_: any, x: number, y: number, z: number) => arcgisBboxParts(z, x, y).maxy,
                    w: () => 256,
                    h: () => 256,
                },
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 24,
                enablePickFeatures: false,
            }),
        ];
    }

    function createCustomWmsImageryProviders(Cesium: any, info: any) {
        if (!Cesium || typeof Cesium.WebMapServiceImageryProvider !== 'function') {
            console.warn('[useCesiumLayers] 当前 Cesium 运行时不支持 WebMapServiceImageryProvider');
            return [];
        }
        if (info.arcgis) {
            if (info.tileMode === 'tiles') {
                return [
                    new Cesium.UrlTemplateImageryProvider({
                        url: `${String(info.endpoint).replace(/\/+$/, '')}/tile/{z}/{y}/{x}`,
                        tilingScheme: new Cesium.WebMercatorTilingScheme(),
                        maximumLevel: Number.isFinite(info.maxLevel) ? Number(info.maxLevel) : 24,
                        enablePickFeatures: false,
                    }),
                ];
            }
            const selected = (info.layerOptions?.length && customWmsSelectedLayer) || '';
            return createCustomArcgisImageryProviders(Cesium, info, selected);
        }
        const layers =
            (info.layerOptions?.length && customWmsSelectedLayer) || info.layers;
        const tilingScheme = info.mercator
            ? new Cesium.WebMercatorTilingScheme()
            : new Cesium.GeographicTilingScheme();
        const crsParamName = String(info.version || '').startsWith('1.3') ? 'crs' : 'srs';
        return [
            new Cesium.WebMapServiceImageryProvider({
                url: info.endpoint,
                layers,
                parameters: {
                    service: 'WMS',
                    version: info.version || '1.1.1',
                    request: 'GetMap',
                    styles: '',
                    format: info.format || 'image/png',
                    transparent: true,
                    [crsParamName]: info.srs,
                },
                tilingScheme,
                enablePickFeatures: false,
            }),
        ];
    }

    function createCustomXyzImageryProviders() {
        const Cesium = getCesium?.();
        const rawUrl = customXyzBasemapUrl.value;

        if (rawUrl && looksLikeWmsSourceUrl(rawUrl)) {
            const cachedInfo = getCachedWmsInfo(rawUrl);
            if (cachedInfo) {
                return createCustomWmsImageryProviders(Cesium, cachedInfo);
            }
            if (wmsResolvingNotifiedUrl !== rawUrl) {
                wmsResolvingNotifiedUrl = rawUrl;
                message.info('正在解析 WMS 服务元数据，完成后自动加载', { duration: 3000 });
            }
            void ensureWmsServiceInfo(rawUrl).then((info) => {
                if (info && activeBasemap.value === CUSTOM_XYZ_BASEMAP_ID) {
                    applyBasemap(CUSTOM_XYZ_BASEMAP_ID, { forceReload: true });
                } else if (!info && wmsFailureNotifiedUrl !== rawUrl) {
                    wmsFailureNotifiedUrl = rawUrl;
                    message.warning('WMS 图源元数据解析失败，请检查服务地址是否可访问', { closable: true });
                }
            });
            return createTiandituImageryProviders();
        }

        const config = normalizeCustomXyzUrl(rawUrl);
        if (!config.valid) {
            message.warning(config.message, { closable: true });
            return createTiandituImageryProviders();
        }

        return [
            new Cesium.UrlTemplateImageryProvider({
                url: config.url,
                subdomains: config.subdomains,
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 20,
                enablePickFeatures: false,
            }),
        ];
    }

    function createImageryProvidersFromPreset(presetId: string) {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        const stackIds = resolvePresetLayerIds(presetId);
        if (!stackIds.length) {
            console.warn(`[useCesiumLayers] 预设 "${presetId}" 没有有效的图层栈`);
            return createTiandituImageryProviders();
        }

        const ctx = {
            tiandituTk: getTiandituToken(),
            ovitalTdtkey: getOvitalTdtkey(),
            customUrl: customXyzBasemapUrl.value,
            normBase: '',
        };

        return buildCesiumImageryProvidersForPreset(Cesium, stackIds, ctx);
    }

    function createImageryProvidersById(value: string) {
        const stackIds = resolvePresetLayerIds(value);
        if (stackIds.length > 0) {
            return createImageryProvidersFromPreset(value);
        }

        if (value === 'google') return createGoogleImageryProviders();
        if (value === CUSTOM_XYZ_BASEMAP_ID) return createCustomXyzImageryProviders();
        if (value === 'tianditu') return createTiandituImageryProviders();

        return createTiandituImageryProviders();
    }

    function createImageryProviderViewModels() {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        imageryProviderViewModelById.clear();
        imageryProviderIdByViewModel.clear();

        const projectProviderViewModels = getUnifiedBasemapOptions().map((option: any) => {
            const viewModel = new Cesium.ProviderViewModel({
                name: option.label,
                tooltip: getBasemapTooltip(option),
                category: '项目底图',
                iconUrl: createPickerIcon(
                    getPresetPickerColor(option.value),
                    getPresetPickerLabel(option.value, option.label),
                ),
                creationFunction: () => createImageryProvidersById(option.value),
            });
            imageryProviderViewModelById.set(option.value, viewModel);
            imageryProviderIdByViewModel.set(viewModel, option.value);
            return viewModel;
        });

        const officialProviderViewModels = getDefaultImageryProviderViewModels();
        officialBasemapOptions.value = officialProviderViewModels.map((viewModel: any, index: number) => {
            const label = String(viewModel?.name || `官方底图 ${index + 1}`).trim();
            const value = createOfficialBasemapId(label, index);
            if (label.toLowerCase().includes('openstreetmap') && typeof viewModel?.creationFunction === 'function') {
                const originalCreation = viewModel.creationFunction.bind(viewModel);
                viewModel.creationFunction = () => {
                    const rawProvider = originalCreation();
                    const CesiumRuntime = getCesium?.();
                    if (CesiumRuntime && rawProvider) {
                        wrapProviderWithFetchFallback(CesiumRuntime, rawProvider, undefined, {
                            isOsm: true,
                            descriptorId: 'official_osm',
                        });
                    }
                    return rawProvider;
                };
            }
            imageryProviderViewModelById.set(value, viewModel);
            imageryProviderIdByViewModel.set(viewModel, value);
            return {
                value,
                label: `官方 · ${label}`,
                description: String(viewModel?.tooltip || label),
                source: 'official',
            };
        });

        return [...projectProviderViewModels, ...officialProviderViewModels];
    }

    function createTerrainProviderViewModels() {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        terrainProviderViewModelById.clear();
        terrainProviderIdByViewModel.clear();

        return terrainOptions.map((option) => {
            const viewModel = new Cesium.ProviderViewModel({
                name: option.label,
                tooltip: option.description || option.label,
                category: '项目地形',
                iconUrl: createPickerIcon(
                    getTerrainIconColor(option.value),
                    getTerrainIconText(option.value),
                ),
                creationFunction: () => createTerrainProviderById(option.value),
            });
            terrainProviderViewModelById.set(option.value, viewModel);
            terrainProviderIdByViewModel.set(viewModel, option.value);
            return viewModel;
        });
    }

    return {
        getCustomWmsSelectedLayer,
        updateCustomWmsLayerSelection,
        createImageryProvidersById,
        createImageryProviderViewModels,
        createTerrainProviderViewModels,
    };
}
