import { computed, ref, watch } from 'vue';
import { applyCesiumIonToken } from '../core/cesiumRuntime';
import {
    readStoredBoolean,
    readStoredString,
    writeStoredBoolean,
    writeStoredString,
} from '../core/cesiumStorage';
import createGeoTerrainProvider from '../../providers/terrain/GeoTerrainProvider';
import createArcGISTerrainProvider from '../../providers/terrain/ArcGISTerrainProvider';
import { resolvePresetLayerIds } from '@ol/basemap/constants/basemapResolver';
import { DEFAULT_BASEMAP_PRESET_ID } from '@ol/basemap/constants/basemapConfig';
import {
    buildCesiumImageryProvidersForPreset,
    abortAllDescriptorRequests,
} from '@cesium-domain/constants/basemapProviderFactory';
import { useCesiumBasemapSwitcher } from './useCesiumBasemapSwitcher';
import {
    TDT_SUBDOMAINS,
    TDT_SERVICE_ROOT,
    ARCGIS_WORLD_TERRAIN_URL,
    CUSTOM_XYZ_BASEMAP_ID,
    CUSTOM_XYZ_BASEMAP_URL_KEY,
    TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY,
    TDT_BOUNDARY_LAYER_VISIBLE_KEY,
    TDT_TEXT_LABEL_LAYER_VISIBLE_KEY,
    CESIUM_OSM_BUILDINGS_VISIBLE_KEY,
    GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY,
    unifiedBasemapOptions,
    terrainOptions,
    getTerrainIconColor,
    getTerrainIconText,
    readRuntimeValue,
    destroyPrimitive,
    createCesiumOsmBuildingsTileset,
    getBasemapTooltip,
    getPresetPickerColor,
    getPresetPickerLabel,
    normalizeCustomXyzUrl,
    createOfficialBasemapId,
    createPickerIcon,
} from './layerUtils';

export function useCesiumLayers({
    getViewer,
    getCesium,
    message,
    backendBaseUrl,
    tiandituToken,
    cesiumIonToken,
}) {
    let tdtBoundaryLayer = null;
    let tdtTextLabelLayer = null;
    let osmBuildingsTileset = null;
    let osmBuildingsLoadPromise = null;
    let osmBuildingsLoadId = 0;
    let googlePhotorealistic3DTileset = null;
    let googlePhotorealistic3DTilesetLoadPromise = null;
    let googlePhotorealistic3DTilesetLoadId = 0;
    let customIonTileset = null;
    let customIonTilesetLoadPromise = null;
    let customIonTilesetLoadId = 0;
    let customIonImageryLayer = null;
    let customIonTerrainProvider = null;
    const customIonAssetId = ref(readStoredString('cesium_custom_ion_asset_id', '5115505'));
    const loadedAssetType = ref(null);
    const customIonHeightOffset = ref(0);
    let terrainSwitchId = 0;
    let layerPickerSubscriptions = [];

    const getTiandituToken = () => readRuntimeValue(tiandituToken);
    const getCesiumIonToken = () => readRuntimeValue(cesiumIonToken);

    const imageryLayerHandles = [];
    const officialBasemapOptions = ref([]);
    const imageryProviderViewModelById = new Map();
    const imageryProviderIdByViewModel = new Map();
    const terrainProviderViewModelById = new Map();
    const terrainProviderIdByViewModel = new Map();

    const LEGACY_CUSTOM_XYZ_BASEMAP_URL_KEY = 'cesium_custom_xyz_basemap_url';

    const activeBasemap = ref(DEFAULT_BASEMAP_PRESET_ID);
    const activeTerrain = ref('tianditu');
    // 读取自定义 URL：优先新 key，兼容旧 key
    const customXyzBasemapUrl = ref(
        readStoredString(CUSTOM_XYZ_BASEMAP_URL_KEY, '') ||
            readStoredString(LEGACY_CUSTOM_XYZ_BASEMAP_URL_KEY, ''),
    );
    // 叠加层默认全部关闭：国界线 + 文字注记 + Cesium OSM Buildings + Google 倾斜摄影
    const legacyTdtLabelLayerVisible = readStoredBoolean(TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY, false);
    const tdtBoundaryLayerVisible = ref(
        readStoredBoolean(TDT_BOUNDARY_LAYER_VISIBLE_KEY, legacyTdtLabelLayerVisible ?? false),
    );
    const tdtTextLabelLayerVisible = ref(
        readStoredBoolean(TDT_TEXT_LABEL_LAYER_VISIBLE_KEY, legacyTdtLabelLayerVisible ?? false),
    );
    const osmBuildingsVisible = ref(readStoredBoolean(CESIUM_OSM_BUILDINGS_VISIBLE_KEY, false));
    const googlePhotorealistic3DTilesVisible = ref(
        readStoredBoolean(GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY, false),
    );
    const customIon3DTilesVisible = ref(false);
    const customIonTilesetReady = ref(false);

    const basemapOptions = computed(() => [
        ...unifiedBasemapOptions.map((option) => {
            if (option.value !== 'custom') return option;
            return {
                ...option,
                description: customXyzBasemapUrl.value
                    ? customXyzBasemapUrl.value
                    : '输入 XYZ 瓦片 URL 后启用',
                source: 'custom',
                disabled: !customXyzBasemapUrl.value,
            };
        }),
        ...officialBasemapOptions.value,
    ]);

    // ========== 熔断/降级切换器 ==========
    const basemapSwitcher = useCesiumBasemapSwitcher({
        getViewer,
        getCesium,
        activeBasemap,
        applyBasemap,
        resolvePresetLayerIds,
        message,
    });

    /** 供 UI 绑定的熔断状态 */
    const basemapCircuitOpen = computed(() => basemapSwitcher.isCircuitOpen.value);

    const overlayOptions = computed(() => [
        {
            value: 'tdt-boundaries',
            label: '国界线',
            description: '天地图国界、行政边界与边界注记栅格层',
            active: tdtBoundaryLayerVisible.value,
        },
        {
            value: 'tdt-text-labels',
            label: '文字标注',
            description: '天地图官方文字注记栅格层',
            active: tdtTextLabelLayerVisible.value,
        },
        {
            value: 'cesium-osm-buildings',
            label: 'Cesium OSM建筑',
            description: 'Cesium ion OpenStreetMap 3D Buildings 图层',
            active: osmBuildingsVisible.value,
        },
        {
            value: 'google-photorealistic-3d-tiles',
            label: 'Google真实3D模型',
            description: 'Google Photorealistic 3D Tiles 倾斜摄影模型',
            active: googlePhotorealistic3DTilesVisible.value,
        },
        {
            value: 'custom-ion-3d-tiles',
            label: '自定义 Ion 3D',
            description: customIonAssetId.value
                ? `Ion Asset ID: ${customIonAssetId.value}`
                : '输入 Cesium Ion Asset ID 加载自定义 3D Tiles',
            active: customIon3DTilesVisible.value,
            hasInput: true,
        },
    ]);

    watch(activeBasemap, (value) => {
        if (!getViewer?.() || !getCesium?.()) return;
        applyBasemap(value);
    });

    watch(customXyzBasemapUrl, (value) => {
        writeStoredString(CUSTOM_XYZ_BASEMAP_URL_KEY, value);
    });

    watch(activeTerrain, async (value) => {
        if (!getViewer?.() || !getCesium?.()) return;
        await applyTerrain(value);
    });

    watch(tdtBoundaryLayerVisible, (value) => {
        writeStoredBoolean(TDT_BOUNDARY_LAYER_VISIBLE_KEY, value);
        syncTdtOverlayLayers();
    });

    watch(tdtTextLabelLayerVisible, (value) => {
        writeStoredBoolean(TDT_TEXT_LABEL_LAYER_VISIBLE_KEY, value);
        syncTdtOverlayLayers();
    });

    watch(osmBuildingsVisible, (value) => {
        writeStoredBoolean(CESIUM_OSM_BUILDINGS_VISIBLE_KEY, value);
        void syncOsmBuildingsLayer();
    });

    watch(googlePhotorealistic3DTilesVisible, (value) => {
        writeStoredBoolean(GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY, value);
        void syncGooglePhotorealistic3DTilesLayer();
    });

    watch(customIon3DTilesVisible, () => {
        void syncCustomIonLayer();
    });

    watch(customIonAssetId, (value) => {
        writeStoredString('cesium_custom_ion_asset_id', value);
    });

    // 在加载 Tileset 完成时保存原始矩阵
    let originMatrix = null;

    watch(customIonHeightOffset, (offset) => {
        const Cesium = getCesium?.();
        if (!customIonTileset || !Cesium) return;

        try {
            // 首次应用偏移时，保存原始 modelMatrix 作为基准
            if (!originMatrix) {
                originMatrix = customIonTileset.modelMatrix.clone();
            }

            const center = customIonTileset.boundingSphere.center;

            // 获取本地 ENU 坐标系下的”向上”法向量（Up Vector）
            const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
                center,
                new Cesium.Cartesian3(),
            );

            // 计算沿地表法线移动 offset 距离的平移向量
            const offsetVector = Cesium.Cartesian3.multiplyByScalar(
                up,
                offset,
                new Cesium.Cartesian3(),
            );

            // 基于原始矩阵复合平移变换：先还原原始位姿，再叠加偏移
            const translationMatrix = Cesium.Matrix4.fromTranslation(offsetVector);
            customIonTileset.modelMatrix = Cesium.Matrix4.multiply(
                originMatrix,
                translationMatrix,
                new Cesium.Matrix4(),
            );

            getViewer?.()?.scene?.requestRender?.();
        } catch (e) {
            console.warn('[CustomIon] 高度偏移应用失败:', e);
        }
    });

    function createImageryProviderViewModels() {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        imageryProviderViewModelById.clear();
        imageryProviderIdByViewModel.clear();

        // 从统一预设构建 ProviderViewModel 列表
        const projectProviderViewModels = unifiedBasemapOptions.map((option) => {
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
        officialBasemapOptions.value = officialProviderViewModels.map((viewModel, index) => {
            const label = String(viewModel?.name || `官方底图 ${index + 1}`).trim();
            const value = createOfficialBasemapId(label, index);
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

    function getSelectedImageryProviderViewModel(fallbackViewModels = []) {
        return imageryProviderViewModelById.get(activeBasemap.value) || fallbackViewModels[0];
    }

    function getSelectedTerrainProviderViewModel(fallbackViewModels = []) {
        return terrainProviderViewModelById.get(activeTerrain.value) || fallbackViewModels[0];
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

    function createImageryProvidersById(value) {
        // 先检查是否为统一预设 ID（如 'custom_China_Blender_preset_2'）
        const stackIds = resolvePresetLayerIds(value);
        if (stackIds.length > 0) {
            return createImageryProvidersFromPreset(value);
        }

        // 兼容旧的 Cesium 专用 ID
        if (value === 'google') return createGoogleImageryProviders();
        if (value === CUSTOM_XYZ_BASEMAP_ID) return createCustomXyzImageryProviders();
        if (value === 'tianditu') return createTiandituImageryProviders();

        // 默认 fallback
        return createTiandituImageryProviders();
    }

    /** 从统一预设创建 Cesium ImageryProvider 数组 */
    function createImageryProvidersFromPreset(presetId) {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        const stackIds = resolvePresetLayerIds(presetId);
        if (!stackIds.length) {
            console.warn(`[useCesiumLayers] 预设 "${presetId}" 没有有效的图层栈`);
            return createTiandituImageryProviders();
        }

        // 获取运行时 token
        const tiandituTk = getTiandituToken();
        const customUrl = customXyzBasemapUrl.value;

        const ctx = {
            tiandituTk,
            customUrl: customUrl,
            normBase: '',
        };

        return buildCesiumImageryProvidersForPreset(Cesium, stackIds, ctx);
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
                url: `${backendBaseUrl}/proxy/mt{s}.google.com/vt?lyrs=s&x={x}&y={y}&z={z}`,
                subdomains: ['0', '1', '2', '3'],
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 20,
            }),
        ];
    }

    function createCustomXyzImageryProviders() {
        const Cesium = getCesium?.();
        const config = normalizeCustomXyzUrl(customXyzBasemapUrl.value);
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

    function createTdtBoundaryImageryProvider() {
        const Cesium = getCesium?.();
        return new Cesium.UrlTemplateImageryProvider({
            url: `${TDT_SERVICE_ROOT}DataServer?T=ibo_w&x={x}&y={y}&l={z}&tk=${getTiandituToken()}`,
            subdomains: TDT_SUBDOMAINS,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 10,
        });
    }

    function createTdtTextLabelImageryProvider() {
        const Cesium = getCesium?.();
        return new Cesium.UrlTemplateImageryProvider({
            url: `${TDT_SERVICE_ROOT}DataServer?T=cia_w&x={x}&y={y}&l={z}&tk=${getTiandituToken()}`,
            subdomains: TDT_SUBDOMAINS,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 18,
        });
    }

    function bindLayerPickerStateSync() {
        unbindLayerPickerStateSync();
        const Cesium = getCesium?.();
        const pickerViewModel = getViewer?.()?.baseLayerPicker?.viewModel;
        if (!pickerViewModel || !Cesium?.knockout?.getObservable) return;

        const imageryObservable = Cesium.knockout.getObservable(pickerViewModel, 'selectedImagery');
        const terrainObservable = Cesium.knockout.getObservable(pickerViewModel, 'selectedTerrain');
        const subscriptions = [];

        const imagerySubscription = imageryObservable?.subscribe?.((viewModel) => {
            const value = imageryProviderIdByViewModel.get(viewModel);
            if (!value) return;
            if (activeBasemap.value !== value) {
                activeBasemap.value = value;
            }
            syncBasemapSideEffects();
        });

        const terrainSubscription = terrainObservable?.subscribe?.((viewModel) => {
            const value = terrainProviderIdByViewModel.get(viewModel);
            if (!value) return;
            if (activeTerrain.value !== value) {
                activeTerrain.value = value;
            }
            applyTerrainSceneFlags(value);
        });

        if (imagerySubscription) subscriptions.push(imagerySubscription);
        if (terrainSubscription) subscriptions.push(terrainSubscription);
        layerPickerSubscriptions = subscriptions;
    }

    function unbindLayerPickerStateSync() {
        layerPickerSubscriptions.forEach((subscription) => subscription?.dispose?.());
        layerPickerSubscriptions = [];
    }

    function addBaseImageryLayers() {
        // 同步叠加层（国界线 / 文字注记）
        syncTdtOverlayLayers();
        // 同步 Cesium OSM Buildings 与 Google 倾斜摄影
        void syncOsmBuildingsLayer();
        void syncGooglePhotorealistic3DTilesLayer();
        void syncCustomIonLayer();
        return true;
    }

    function clearBaseImageryLayers() {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers) return;

        while (imageryLayerHandles.length) {
            const layer = imageryLayerHandles.pop();
            try {
                viewer.imageryLayers.remove(layer, true);
            } catch (error) {
                console.warn('Imagery layer remove warning:', error);
            }
        }
    }

    function syncBasemapSideEffects() {
        syncTdtOverlayLayers();
        void syncOsmBuildingsLayer();
        void syncGooglePhotorealistic3DTilesLayer();
        getViewer?.()?.scene?.requestRender?.();
    }

    function syncTdtOverlayLayers() {
        const viewer = getViewer?.();
        if (!viewer || !getCesium?.()) return;

        if (tdtBoundaryLayerVisible.value) {
            ensureTdtBoundaryLayer();
        } else {
            clearTdtBoundaryLayer();
        }

        if (tdtTextLabelLayerVisible.value) {
            ensureTdtTextLabelLayer();
        } else {
            clearTdtTextLabelLayer();
        }

        viewer.scene.requestRender?.();
    }

    function ensureTdtBoundaryLayer() {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers || tdtBoundaryLayer) {
            if (tdtBoundaryLayer) {
                viewer?.imageryLayers?.raiseToTop?.(tdtBoundaryLayer);
            }
            return tdtBoundaryLayer;
        }

        try {
            tdtBoundaryLayer = viewer.imageryLayers.addImageryProvider(
                createTdtBoundaryImageryProvider(),
            );
            viewer.imageryLayers.raiseToTop?.(tdtBoundaryLayer);
            return tdtBoundaryLayer;
        } catch (error) {
            message.error('天地图国界线图层加载失败', error);
            return null;
        }
    }

    function ensureTdtTextLabelLayer() {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers || tdtTextLabelLayer) {
            if (tdtTextLabelLayer) {
                viewer?.imageryLayers?.raiseToTop?.(tdtTextLabelLayer);
            }
            return tdtTextLabelLayer;
        }

        try {
            tdtTextLabelLayer = viewer.imageryLayers.addImageryProvider(
                createTdtTextLabelImageryProvider(),
            );
            viewer.imageryLayers.raiseToTop?.(tdtTextLabelLayer);
            return tdtTextLabelLayer;
        } catch (error) {
            message.error('天地图文字标注图层加载失败', error);
            return null;
        }
    }

    function clearTdtBoundaryLayer() {
        const viewer = getViewer?.();
        if (!tdtBoundaryLayer || !viewer?.imageryLayers) return;

        try {
            viewer.imageryLayers.remove(tdtBoundaryLayer, true);
        } catch (error) {
            console.warn('TDT boundary layer remove warning:', error);
        }
        tdtBoundaryLayer = null;
    }

    function clearTdtTextLabelLayer() {
        const viewer = getViewer?.();
        if (!tdtTextLabelLayer || !viewer?.imageryLayers) return;

        try {
            viewer.imageryLayers.remove(tdtTextLabelLayer, true);
        } catch (error) {
            console.warn('TDT text label layer remove warning:', error);
        }
        tdtTextLabelLayer = null;
    }

    async function syncOsmBuildingsLayer() {
        const viewer = getViewer?.();
        if (!viewer?.scene?.primitives || !getCesium?.()) return;

        if (osmBuildingsVisible.value) {
            await ensureOsmBuildingsLayer();
        } else {
            clearOsmBuildingsLayer();
        }

        viewer.scene.requestRender?.();
    }

    async function syncGooglePhotorealistic3DTilesLayer() {
        const viewer = getViewer?.();
        if (!viewer?.scene?.primitives || !getCesium?.()) return;

        if (googlePhotorealistic3DTilesVisible.value) {
            await ensureGooglePhotorealistic3DTilesLayer();
        } else {
            clearGooglePhotorealistic3DTilesLayer();
        }

        viewer.scene.requestRender?.();
    }

    async function ensureGooglePhotorealistic3DTilesLayer() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.scene?.primitives) return null;
        if (googlePhotorealistic3DTileset) {
            return googlePhotorealistic3DTileset;
        }

        if (googlePhotorealistic3DTilesetLoadPromise)
            return googlePhotorealistic3DTilesetLoadPromise;

        if (typeof Cesium?.createGooglePhotorealistic3DTileset !== 'function') {
            message.warning('当前 Cesium 运行时不支持 Google Photorealistic 3D Tiles。', {
                closable: true,
            });
            googlePhotorealistic3DTilesVisible.value = false;
            return null;
        }

        const loadId = ++googlePhotorealistic3DTilesetLoadId;
        applyCesiumIonToken(Cesium, getCesiumIonToken());
        // Cesium 1.122 keeps the ion route when the legacy first argument is undefined.
        googlePhotorealistic3DTilesetLoadPromise = Cesium.createGooglePhotorealistic3DTileset(
            undefined,
            {
                maximumScreenSpaceError: 4,
                cacheBytes: 1536 * 1024 * 1024,
                enableCollision: true,
                // 显式声明使用 Google geocoder，抑制 Cesium 启动时的警告弹窗：
                // "Only the Google geocoder can be used with Google Photorealistic 3D Tiles."
                // 配置项来源：Cesium.GooglePhotorealistic3DTileset.additionalOptions
                onlyUsingWithGoogleGeocoder: true,
            },
        );

        try {
            const tileset = await googlePhotorealistic3DTilesetLoadPromise;
            if (
                loadId !== googlePhotorealistic3DTilesetLoadId ||
                !googlePhotorealistic3DTilesVisible.value
            ) {
                destroyPrimitive(tileset);
                return null;
            }

            googlePhotorealistic3DTileset = viewer.scene.primitives.add(tileset);
            viewer.scene.globe.show = false;
            viewer.scene.skyAtmosphere.show = true;
            viewer.scene.requestRender?.();
            return googlePhotorealistic3DTileset;
        } catch (error) {
            if (loadId !== googlePhotorealistic3DTilesetLoadId) return null;

            googlePhotorealistic3DTilesVisible.value = false;
            message.warning('Google 真实 3D 模型加载失败，已关闭该叠加层。', { closable: true });
            message.error('Google Photorealistic 3D Tiles 初始化失败', error);
            return null;
        } finally {
            if (loadId === googlePhotorealistic3DTilesetLoadId) {
                googlePhotorealistic3DTilesetLoadPromise = null;
            }
        }
    }

    function clearGooglePhotorealistic3DTilesLayer() {
        const viewer = getViewer?.();
        googlePhotorealistic3DTilesetLoadId += 1;
        googlePhotorealistic3DTilesetLoadPromise = null;
        if (!googlePhotorealistic3DTileset || !viewer?.scene?.primitives) {
            return;
        }

        try {
            viewer.scene.primitives.remove(googlePhotorealistic3DTileset);
        } catch (error) {
            console.warn('Google Photorealistic 3D Tiles layer remove warning:', error);
        }

        googlePhotorealistic3DTileset = null;
        // 仅在 OSM Buildings 也未激活时恢复 globe，避免多 Ion 图层并存时渲染闪烁
        if (viewer?.scene?.globe && !osmBuildingsVisible.value) {
            viewer.scene.globe.show = true;
        }
    }

    // ========== 自定义 Cesium Ion 资源（自动识别影像/地形/3D Tiles）==========

    /**
     * 通过 Cesium Ion API 查询资产类型。
     * @returns {Promise<'imagery'|'terrain'|'3dtiles'|null>}
     */
    async function syncCustomIonLayer() {
        const viewer = getViewer?.();
        if (!viewer?.scene || !getCesium?.()) return;

        if (customIon3DTilesVisible.value) {
            await ensureCustomIonLayer();
        } else {
            clearCustomIonLayer();
        }

        viewer.scene.requestRender?.();
    }

    async function ensureCustomIonLayer() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.scene) return null;
        if (!customIonAssetId.value.trim()) {
            message.warning('请先输入 Cesium Ion Asset ID', { closable: true });
            customIon3DTilesVisible.value = false;
            return null;
        }

        const assetId = Number(customIonAssetId.value);

        // 已有缓存的资产类型 → 直接加载
        if (loadedAssetType.value) {
            applyCesiumIonToken(Cesium, getCesiumIonToken());
            if (loadedAssetType.value === 'imagery')
                return await loadCustomIonImagery(viewer, Cesium, assetId);
            if (loadedAssetType.value === 'terrain')
                return await loadCustomIonTerrain(viewer, Cesium, assetId);
            return await loadCustomIon3DTiles(viewer, Cesium, assetId);
        }

        // 无缓存 → 依次尝试三种加载器（不依赖 Ion API 预检）
        applyCesiumIonToken(Cesium, getCesiumIonToken());

        // 优先尝试 3D Tiles（最常见）
        if (typeof Cesium?.Cesium3DTileset?.fromIonAssetId === 'function') {
            try {
                const result = await loadCustomIon3DTiles(viewer, Cesium, assetId);
                if (result) {
                    loadedAssetType.value = '3dtiles';
                    return result;
                }
            } catch {
                /* 不是 3D Tiles，继续尝试 */
            }
        }

        // 尝试地形
        if (typeof Cesium?.CesiumTerrainProvider?.fromIonAssetId === 'function') {
            try {
                const result = await loadCustomIonTerrain(viewer, Cesium, assetId);
                if (result) {
                    loadedAssetType.value = 'terrain';
                    return result;
                }
            } catch {
                /* 不是地形，继续尝试 */
            }
        }

        // 尝试影像
        if (typeof Cesium?.IonImageryProvider?.fromIonAssetId === 'function') {
            try {
                const result = await loadCustomIonImagery(viewer, Cesium, assetId);
                if (result) {
                    loadedAssetType.value = 'imagery';
                    return result;
                }
            } catch {
                /* 也不是影像 */
            }
        }

        message.warning(
            `Asset ${assetId} 无法加载（不是有效的 3D Tiles / 地形 / 影像，或 Ion 账户未授权）。`,
            { closable: true },
        );
        customIon3DTilesVisible.value = false;
        return null;
    }

    async function loadCustomIonImagery(viewer, Cesium, assetId) {
        if (customIonImageryLayer) return customIonImageryLayer;
        if (customIonTilesetLoadPromise) await customIonTilesetLoadPromise;

        if (typeof Cesium?.IonImageryProvider?.fromIonAssetId !== 'function') {
            message.warning('当前 Cesium 运行时不支持 IonImageryProvider.fromIonAssetId', {
                closable: true,
            });
            customIon3DTilesVisible.value = false;
            return null;
        }

        const loadId = ++customIonTilesetLoadId;
        customIonTilesetLoadPromise = (async () => {
            const provider = await Cesium.IonImageryProvider.fromIonAssetId(assetId);
            if (loadId !== customIonTilesetLoadId || !customIon3DTilesVisible.value) return null;
            customIonImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
            // 设为半透明叠加，不完全遮挡底图
            customIonImageryLayer.alpha = 0.7;
            viewer.scene.requestRender?.();
            return customIonImageryLayer;
        })();

        try {
            const result = await customIonTilesetLoadPromise;
            if (!result) {
                if (loadId !== customIonTilesetLoadId) return null;
                customIon3DTilesVisible.value = false;
                message.warning(`Ion 影像 (Asset ${assetId}) 加载失败。`, { closable: true });
                return null;
            }
            message.success(`已加载自定义 Ion 影像 (Asset ${assetId})`);
            return result;
        } catch (error) {
            if (loadId !== customIonTilesetLoadId) return null;
            customIon3DTilesVisible.value = false;
            message.warning(`Ion 影像 (Asset ${assetId}) 加载失败，已关闭。`, { closable: true });
            message.error('自定义 Ion 影像初始化失败', error);
            console.error('[CustomIon] 影像初始化失败', error);
            return null;
        } finally {
            if (loadId === customIonTilesetLoadId) {
                customIonTilesetLoadPromise = null;
            }
        }
    }

    async function loadCustomIonTerrain(viewer, Cesium, assetId) {
        if (customIonTerrainProvider) return customIonTerrainProvider;
        if (customIonTilesetLoadPromise) await customIonTilesetLoadPromise;

        if (typeof Cesium?.CesiumTerrainProvider?.fromIonAssetId !== 'function') {
            message.warning('当前 Cesium 运行时不支持 CesiumTerrainProvider.fromIonAssetId', {
                closable: true,
            });
            customIon3DTilesVisible.value = false;
            return null;
        }

        const loadId = ++customIonTilesetLoadId;
        customIonTilesetLoadPromise = (async () => {
            const provider = await Cesium.CesiumTerrainProvider.fromIonAssetId(assetId, {
                requestVertexNormals: true,
            });
            if (loadId !== customIonTilesetLoadId || !customIon3DTilesVisible.value) return null;
            viewer.scene.terrainProvider = provider;
            customIonTerrainProvider = provider;
            viewer.scene.requestRender?.();
            return provider;
        })();

        try {
            const result = await customIonTilesetLoadPromise;
            if (!result) {
                if (loadId !== customIonTilesetLoadId) return null;
                customIon3DTilesVisible.value = false;
                message.warning(`Ion 地形 (Asset ${assetId}) 加载失败。`, { closable: true });
                return null;
            }
            message.success(`已加载自定义 Ion 地形 (Asset ${assetId})`);
            return result;
        } catch (error) {
            if (loadId !== customIonTilesetLoadId) return null;
            customIon3DTilesVisible.value = false;
            message.warning(`Ion 地形 (Asset ${assetId}) 加载失败，已关闭。`, { closable: true });
            message.error('自定义 Ion 地形初始化失败', error);
            console.error('[CustomIon] 地形初始化失败', error);
            return null;
        } finally {
            if (loadId === customIonTilesetLoadId) {
                customIonTilesetLoadPromise = null;
            }
        }
    }

    async function loadCustomIon3DTiles(viewer, Cesium, assetId) {
        if (customIonTileset) return customIonTileset;
        if (customIonTilesetLoadPromise) return customIonTilesetLoadPromise;

        if (typeof Cesium?.Cesium3DTileset?.fromIonAssetId !== 'function') {
            message.warning('当前 Cesium 运行时不支持 Cesium3DTileset.fromIonAssetId', {
                closable: true,
            });
            customIon3DTilesVisible.value = false;
            return null;
        }

        const loadId = ++customIonTilesetLoadId;
        customIonTilesetLoadPromise = Cesium.Cesium3DTileset.fromIonAssetId(assetId, {
            maximumScreenSpaceError: 4,
            enableCollision: true,
        });

        try {
            const tileset = await customIonTilesetLoadPromise;
            if (loadId !== customIonTilesetLoadId || !customIon3DTilesVisible.value) {
                destroyPrimitive(tileset);
                return null;
            }

            customIonTileset = viewer.scene.primitives.add(tileset);
            // 保存原始 modelMatrix 作为高度偏移的基准（Ion tileset 可能自带定位矩阵）
            originMatrix = tileset.modelMatrix.clone();
            customIonTilesetReady.value = true;
            // 不隐藏 globe，让 3D Tiles 叠加在底图之上
            viewer.scene.requestRender?.();
            // 自动飞行定位到加载的 3D Tiles 数据范围
            // flyTo 做平滑渐变飞行，视觉体验优于 zoomTo 的瞬时跳转
            try {
                if (typeof viewer.flyTo === 'function') {
                    viewer.flyTo(tileset, {
                        duration: 1.5,
                        offset: new Cesium.HeadingPitchRange(
                            0,
                            Cesium.Math.toRadians(-45),
                            tileset.boundingSphere.radius * 3.5,
                        ),
                    });
                }
            } catch {
                // flyTo 失败不影响瓦片正常显示，静默忽略
            }
            message.success(`已加载自定义 Ion 3D Tiles (Asset ${assetId})`);
            return customIonTileset;
        } catch (error) {
            if (loadId !== customIonTilesetLoadId) return null;
            customIon3DTilesVisible.value = false;
            message.warning(`Ion 3D Tiles (Asset ${assetId}) 加载失败，已关闭。`, {
                closable: true,
            });
            message.error('自定义 Ion 3D Tiles 初始化失败', error);
            console.error('[CustomIon] 3D Tiles 初始化失败', error);
            return null;
        } finally {
            if (loadId === customIonTilesetLoadId) {
                customIonTilesetLoadPromise = null;
            }
        }
    }

    function clearCustomIonLayer() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.scene || !Cesium) return;

        // 清理影像层
        if (customIonImageryLayer) {
            try {
                viewer.imageryLayers.remove(customIonImageryLayer, true);
            } catch {
                /* ignore */
            }
            customIonImageryLayer = null;
        }

        // 清理地形 → 回退默认椭球
        if (customIonTerrainProvider) {
            try {
                viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            } catch {
                /* ignore */
            }
            customIonTerrainProvider = null;
        }

        // 清理 3D Tiles
        if (customIonTileset) {
            try {
                viewer.scene.primitives.remove(customIonTileset);
            } catch {
                /* ignore */
            }
            customIonTileset = null;
            originMatrix = null;
            customIonTilesetReady.value = false;
            if (
                viewer?.scene?.globe &&
                !osmBuildingsVisible.value &&
                !googlePhotorealistic3DTilesVisible.value
            ) {
                viewer.scene.globe.show = true;
            }
        }

        // 终止进行中的加载
        customIonTilesetLoadId += 1;
        customIonTilesetLoadPromise = null;
        loadedAssetType.value = null;
    }

    function handleCustomIonAssetSubmit({ assetId }) {
        const normalized = String(assetId || '').trim();
        if (!normalized || !/^\d+$/.test(normalized)) {
            message.warning('请输入有效的 Cesium Ion Asset ID（纯数字）', { closable: true });
            return;
        }
        customIonAssetId.value = normalized;
        customIon3DTilesVisible.value = true;
    }

    async function ensureOsmBuildingsLayer() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.scene?.primitives || osmBuildingsTileset) return osmBuildingsTileset;
        if (osmBuildingsLoadPromise) return osmBuildingsLoadPromise;

        if (
            typeof Cesium?.Cesium3DTileset?.fromIonAssetId !== 'function' &&
            typeof Cesium?.createOsmBuildingsAsync !== 'function'
        ) {
            message.warning('当前 Cesium 运行时不支持 Cesium OSM Buildings。', { closable: true });
            osmBuildingsVisible.value = false;
            return null;
        }

        const loadId = ++osmBuildingsLoadId;
        applyCesiumIonToken(Cesium, getCesiumIonToken());
        await ensureCesiumWorldTerrainForOsmBuildings();
        osmBuildingsLoadPromise = createCesiumOsmBuildingsTileset(Cesium, {
            maximumScreenSpaceError: 8,
        });
        try {
            const tileset = await osmBuildingsLoadPromise;
            if (loadId !== osmBuildingsLoadId || !osmBuildingsVisible.value) {
                destroyPrimitive(tileset);
                return null;
            }

            osmBuildingsTileset = viewer.scene.primitives.add(tileset);
            viewer.scene.requestRender?.();
            return osmBuildingsTileset;
        } catch (error) {
            if (loadId !== osmBuildingsLoadId) return null;
            osmBuildingsVisible.value = false;
            message.warning('Cesium OSM 建筑图层加载失败，已关闭该叠加层。', { closable: true });
            message.error('Cesium OSM 建筑图层初始化失败', error);
            return null;
        } finally {
            if (loadId === osmBuildingsLoadId) {
                osmBuildingsLoadPromise = null;
            }
        }
    }

    function clearOsmBuildingsLayer() {
        const viewer = getViewer?.();
        osmBuildingsLoadId += 1;
        osmBuildingsLoadPromise = null;
        if (!osmBuildingsTileset || !viewer?.scene?.primitives) return;

        try {
            viewer.scene.primitives.remove(osmBuildingsTileset);
        } catch (error) {
            console.warn('Cesium OSM buildings layer remove warning:', error);
        }
        osmBuildingsTileset = null;
        viewer.scene.requestRender?.();
    }

    async function ensureCesiumWorldTerrainForOsmBuildings() {
        if (activeTerrain.value === 'cesiumWorld') return true;

        // OSM Buildings 需要 Cesium World 地形才能正确显示高度，自动切换
        activeTerrain.value = 'cesiumWorld';
        const switched = await applyTerrain('cesiumWorld');
        if (!switched) {
            message.warning(
                'Cesium OSM Buildings 建议配合 Cesium 世界地形使用，当前地形可能导致建筑遮挡或高度偏移。',
                { closable: true },
            );
        }
        return switched;
    }

    function applyBasemap(value, options = {}) {
        const viewer = getViewer?.();
        if (!viewer || !getCesium?.()) return false;

        // 先中断所有旧请求，实现快速切换
        abortAllDescriptorRequests();
        clearBaseImageryLayers();

        const pickerViewModel = viewer.baseLayerPicker?.viewModel;
        const providerViewModel = imageryProviderViewModelById.get(value);

        // 如果有对应的 ProviderViewModel，通过 baseLayerPicker 切换
        if (pickerViewModel && providerViewModel) {
            if (options.forceReload && pickerViewModel.selectedImagery === providerViewModel) {
                const fallbackViewModel =
                    imageryProviderViewModelById.get(DEFAULT_BASEMAP_PRESET_ID) ||
                    imageryProviderViewModelById.get('tianditu');
                if (fallbackViewModel && fallbackViewModel !== providerViewModel) {
                    pickerViewModel.selectedImagery = fallbackViewModel;
                }
            }
            if (pickerViewModel.selectedImagery !== providerViewModel) {
                pickerViewModel.selectedImagery = providerViewModel;
            }
            syncBasemapSideEffects();
            return true;
        }

        // 降级路径：直接操作 imageryLayers
        try {
            const providers = createImageryProvidersById(value);
            providers.forEach((provider) => {
                if (provider) {
                    imageryLayerHandles.push(viewer.imageryLayers.addImageryProvider(provider));
                }
            });

            syncTdtOverlayLayers();
            viewer.scene.requestRender?.();
            return true;
        } catch (error) {
            message.error('地图源切换失败', error);
            return false;
        }
    }

    function initCustomTerrain() {
        return applyTerrain(activeTerrain.value);
    }

    async function applyTerrain(value) {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) return false;

        const pickerViewModel = viewer.baseLayerPicker?.viewModel;
        const providerViewModel = terrainProviderViewModelById.get(value);
        if (pickerViewModel && providerViewModel) {
            if (pickerViewModel.selectedTerrain !== providerViewModel) {
                pickerViewModel.selectedTerrain = providerViewModel;
            }
            applyTerrainSceneFlags(value);
            viewer.scene.requestRender?.();
            return true;
        }

        const switchId = ++terrainSwitchId;

        if (value === 'ellipsoid') {
            viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            applyTerrainSceneFlags(value);
            viewer.scene.requestRender?.();
            return true;
        }

        if (value === 'cesiumWorld') {
            try {
                const worldTerrain = await createCesiumWorldTerrainProvider();
                if (switchId !== terrainSwitchId) return false;

                viewer.terrainProvider = worldTerrain;
                applyTerrainSceneFlags(value);
                viewer.scene.requestRender?.();
                return true;
            } catch (error) {
                if (switchId !== terrainSwitchId) return false;

                viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                applyTerrainSceneFlags('ellipsoid');
                message.warning('Cesium 世界地形加载失败，已降级为平面地形。', { closable: true });
                message.error('Cesium 世界地形初始化失败', error);
                return false;
            }
        }

        if (value === 'arcgisWorld') {
            try {
                const arcgisTerrain = await createArcgisWorldTerrainProvider();
                if (switchId !== terrainSwitchId) return false;

                viewer.terrainProvider = arcgisTerrain;
                applyTerrainSceneFlags(value);
                viewer.scene.requestRender?.();
                return true;
            } catch (error) {
                if (switchId !== terrainSwitchId) return false;

                viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                applyTerrainSceneFlags('ellipsoid');
                message.warning('ArcGIS 世界地形加载失败，已降级为平面地形。', { closable: true });
                message.error('ArcGIS 世界地形初始化失败', error);
                return false;
            }
        }

        const GeoTerrainProvider = createGeoTerrainProvider(Cesium);
        try {
            viewer.terrainProvider = new GeoTerrainProvider({
                url: `${TDT_SERVICE_ROOT}mapservice/swdx?T=elv_c&tk={token}&x={x}&y={y}&l={z}`,
                subdomains: TDT_SUBDOMAINS,
                token: getTiandituToken(),
            });
            applyTerrainSceneFlags(value);
            viewer.scene.requestRender?.();
            return true;
        } catch (error) {
            viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            applyTerrainSceneFlags('ellipsoid');
            message.warning('官方地形服务加载失败，已降级为椭球地形。', { closable: true });
            message.error('官方地形初始化失败', error);
            return false;
        }
    }

    /** @type {Array<() => void>} 地形相关相机事件清理回调 */
    let terrainCameraCleanups = [];

    function applyTerrainSceneFlags(value) {
        const viewer = getViewer?.();
        if (!viewer?.scene?.globe) return;
        const globe = viewer.scene.globe;

        // 清理上一次地形的相机事件监听
        for (const cleanup of terrainCameraCleanups) cleanup();
        terrainCameraCleanups = [];

        globe.depthTestAgainstTerrain = value !== 'ellipsoid';

        if (value === 'arcgisWorld') {
            // ArcGIS 地形性能调优（LERC 解码已下放 Worker，主线程不再被解码占用；
            // 二次下探：SSE 4/8 → 3/6，层级硬顶同步放宽至 12——地形更细，
            // 移动期仍保留抑制细分风暴的保守性）
            globe.maximumScreenSpaceError = 3;
            globe.tileCacheSize = 1000;

            // 动态 SSE：相机移动时适度保守，停下后恢复细节
            const camera = viewer.scene.camera;
            const onMoveStart = () => {
                globe.maximumScreenSpaceError = 6;
            };
            const onMoveEnd = () => {
                globe.maximumScreenSpaceError = 3;
            };
            camera.moveStart.addEventListener(onMoveStart);
            camera.moveEnd.addEventListener(onMoveEnd);
            terrainCameraCleanups.push(() => {
                camera.moveStart.removeEventListener(onMoveStart);
                camera.moveEnd.removeEventListener(onMoveEnd);
            });
        } else {
            // 天地图 / Cesium World / 椭球：恢复默认
            globe.maximumScreenSpaceError = 2;
            globe.tileCacheSize = 100;
        }
    }

    function createTerrainProviderById(value) {
        const Cesium = getCesium?.();
        if (value === 'ellipsoid') {
            return new Cesium.EllipsoidTerrainProvider();
        }

        if (value === 'cesiumWorld') {
            return createCesiumWorldTerrainProvider().catch((error) => {
                message.warning('Cesium 世界地形加载失败，已降级为平面地形。', { closable: true });
                message.error('Cesium 世界地形初始化失败', error);
                queueTerrainFallback(value, 'ellipsoid');
                return new Cesium.EllipsoidTerrainProvider();
            });
        }

        if (value === 'arcgisWorld') {
            return createArcgisWorldTerrainProvider().catch((error) => {
                message.warning('ArcGIS 世界地形加载失败，已降级为平面地形。', { closable: true });
                message.error('ArcGIS 世界地形初始化失败', error);
                queueTerrainFallback(value, 'ellipsoid');
                return new Cesium.EllipsoidTerrainProvider();
            });
        }

        const GeoTerrainProvider = createGeoTerrainProvider(Cesium);
        try {
            return new GeoTerrainProvider({
                url: `${TDT_SERVICE_ROOT}mapservice/swdx?T=elv_c&tk={token}&x={x}&y={y}&l={z}`,
                subdomains: TDT_SUBDOMAINS,
                token: getTiandituToken(),
            });
        } catch (error) {
            message.warning('官方地形服务加载失败，已降级为椭球地形。', { closable: true });
            message.error('官方地形初始化失败', error);
            return new Cesium.EllipsoidTerrainProvider();
        }
    }

    async function createCesiumWorldTerrainProvider() {
        const Cesium = getCesium?.();
        applyCesiumIonToken(Cesium, getCesiumIonToken());

        const options = {
            requestWaterMask: false,
            requestVertexNormals: true,
        };

        if (typeof Cesium.createWorldTerrainAsync === 'function') {
            return Cesium.createWorldTerrainAsync(options);
        }

        if (typeof Cesium.createWorldTerrain === 'function') {
            return Cesium.createWorldTerrain(options);
        }

        if (typeof Cesium.CesiumTerrainProvider?.fromIonAssetId === 'function') {
            return Cesium.CesiumTerrainProvider.fromIonAssetId(1, options);
        }

        if (Cesium.IonResource?.fromAssetId && Cesium.CesiumTerrainProvider) {
            const ionResource = await Cesium.IonResource.fromAssetId(1);
            return new Cesium.CesiumTerrainProvider({
                url: ionResource,
                ...options,
            });
        }

        throw new Error('当前 Cesium 运行时不支持在线世界地形。');
    }

    async function createArcgisWorldTerrainProvider() {
        const Cesium = getCesium?.();
        if (typeof Cesium?.ArcGISTiledElevationTerrainProvider?.fromUrl !== 'function') {
            throw new Error('当前 Cesium 运行时不支持 ArcGIS 高程地形。');
        }

        // 使用增强包装器：补充 availability + getTileDataAvailable
        // 使 sampleTerrainMostDetailed 能正确查询最高精度层级（与天地图/Cesium 行为一致）
        const ArcGISTerrainProvider = createArcGISTerrainProvider(Cesium);
        return ArcGISTerrainProvider.fromUrl(ARCGIS_WORLD_TERRAIN_URL);
    }

    function queueTerrainFallback(failedValue, fallbackValue) {
        const schedule = typeof window !== 'undefined' ? window.setTimeout : setTimeout;
        schedule(() => {
            if (activeTerrain.value !== failedValue) return;
            activeTerrain.value = fallbackValue;
        }, 0);
    }

    function handleOverlayToggle({ overlayId, value }) {
        if (overlayId === 'tdt-boundaries') {
            tdtBoundaryLayerVisible.value = Boolean(value);
            return;
        }

        if (overlayId === 'tdt-text-labels') {
            tdtTextLabelLayerVisible.value = Boolean(value);
            return;
        }

        if (overlayId === 'cesium-osm-buildings') {
            osmBuildingsVisible.value = Boolean(value);
            return;
        }

        if (overlayId === 'google-photorealistic-3d-tiles') {
            googlePhotorealistic3DTilesVisible.value = Boolean(value);
            return;
        }

        if (overlayId === 'custom-ion-3d-tiles') {
            customIon3DTilesVisible.value = Boolean(value);
        }
    }

    function handleCustomBasemapSubmit({ url }) {
        const normalizedUrl = String(url || '').trim();
        const config = normalizeCustomXyzUrl(normalizedUrl);
        if (!config.valid) {
            message.warning(config.message, { closable: true });
            return;
        }

        customXyzBasemapUrl.value = normalizedUrl;

        if (activeBasemap.value === CUSTOM_XYZ_BASEMAP_ID) {
            if (applyBasemap(CUSTOM_XYZ_BASEMAP_ID, { forceReload: true })) {
                message.success('已加载自定义 XYZ 图源');
            }
            return;
        }

        activeBasemap.value = CUSTOM_XYZ_BASEMAP_ID;
        message.success('已切换到自定义 XYZ 图源');
    }

    function cleanupLayers() {
        clearBaseImageryLayers();
        clearTdtBoundaryLayer();
        clearTdtTextLabelLayer();
        clearOsmBuildingsLayer();
        clearGooglePhotorealistic3DTilesLayer();
        clearCustomIonLayer();
        unbindLayerPickerStateSync();
    }

    return {
        activeBasemap,
        activeTerrain,
        customXyzBasemapUrl,
        customIonAssetId,
        customIonHeightOffset,
        basemapOptions,
        terrainOptions,
        overlayOptions,
        createImageryProviderViewModels,
        createTerrainProviderViewModels,
        getSelectedImageryProviderViewModel,
        getSelectedTerrainProviderViewModel,
        bindLayerPickerStateSync,
        addBaseImageryLayers,
        initCustomTerrain,
        applyBasemap,
        applyTerrain,
        handleOverlayToggle,
        handleCustomBasemapSubmit,
        handleCustomIonAssetSubmit,
        cleanupLayers,
        // 熔断/降级切换器
        basemapSwitcher,
        basemapCircuitOpen,
        resetCircuitBreaker: basemapSwitcher.resetCircuitBreaker,
    };
}
