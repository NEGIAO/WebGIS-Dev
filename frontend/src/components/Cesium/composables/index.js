/**
 * composables/index.js
 * Cesium 通用功能 composables 统一入口
 *
 * 架构说明（v3.0.2 重构）：
 *  composables 按功能模块分层组织，每个子目录独立封装一类功能：
 *  - core/      核心运行时与存储（Cesium 实例、时间系统、持久化）
 *  - scene/     场景美化（大气、光照、Credit 隐藏）
 *  - camera/    相机控制（增强相机、场景动作）
 *  - layers/    图层管理（图层增删、底图切换、URL 参数同步）
 *  - interaction/ 用户交互（鼠标/键盘事件、帧率显示）
 *  - terrain/   地形分析（高程采样、风力可视化）
 *  - models/    模型管理（3D 模型加载/卸载）
 *  - dataImport/  数据导入（GeoJSON/KML/KMZ/SHP/GLTF/CZML/3DTiles/GeoTIFF）
 *  - toolModules/ 工具面板模块（各类工具逻辑）
 *
 * 向后兼容：
 *  所有旧路径 `./composables/useCesiumXxx` 仍可工作，
 *  推荐使用新路径 `./composables/<module>/useCesiumXxx` 以获得更好的可维护性。
 */

// === core ===
export { loadCesiumRuntime, applyCesiumIonToken, CESIUM_BASE_URL, CESIUM_JS_URL, CESIUM_CSS_URL } from './core/cesiumRuntime.js';
export { readStoredString, writeStoredString, readStoredBoolean, writeStoredBoolean } from './core/cesiumStorage.js';
export { configureBeijingTimeSystem } from './core/cesiumTimeSystem.js';

// === scene ===
export { configureSolarLighting, configureRealisticAtmosphere, captureRealisticAtmosphereState, restoreRealisticAtmosphere } from './scene/cesiumAtmosphere.js';
export { useCesiumBeautify } from './scene/useCesiumBeautify.js';
export { useCesiumCreditHider } from './scene/useCesiumCreditHider.js';

// === camera ===
export { useCesiumCameraEnhanced, EasingFunctions, SpringController, FlightState } from './camera/useCesiumCameraEnhanced.js';
export { useCesiumSceneActions } from './camera/useCesiumSceneActions.js';

// === layers ===
export { useCesiumLayers } from './layers/useCesiumLayers.js';
export { useCesiumBasemapSwitcher } from './layers/useCesiumBasemapSwitcher.js';
export { useCesiumUrlTracking, DEFAULT_CESIUM_CAMERA } from './layers/useCesiumUrlTracking.js';
export {
    TDT_SUBDOMAINS, TDT_SERVICE_ROOT, ARCGIS_WORLD_TERRAIN_URL,
    CUSTOM_XYZ_BASEMAP_ID, CUSTOM_XYZ_BASEMAP_URL_KEY,
    unifiedBasemapOptions, terrainOptions,
    buildUnifiedBasemapOptions, getPresetDescription,
    getTerrainIconColor, getTerrainIconText,
    readRuntimeValue, destroyPrimitive,
    createCesiumOsmBuildingsTileset,
    getBasemapTooltip, getPresetPickerColor, getPresetPickerLabel,
    normalizeCustomXyzUrl, expandSubdomainRange, isValidCustomTileUrl,
    createOfficialBasemapId, createPickerIcon,
} from './layers/layerUtils.js';

// === interaction ===
export { useCesiumInteractions } from './interaction/useCesiumInteractions.js';
export { useCesiumFrameRate } from './interaction/useCesiumFrameRate.js';

// === terrain ===
export { useCesiumHeightSampler } from './terrain/useCesiumHeightSampler.js';
export { useCesiumWind } from './terrain/useCesiumWind.js';

// === models ===
export { useCesiumModelManager, ModelState } from './models/useCesiumModelManager.js';

// === dataImport ===
export { useCesiumDataImport } from './dataImport/useCesiumDataImport.js';
export {
    TILESET_JSON_INDICATOR, getExtension, createBlobUrl, revokeBlobUrl, flyToEntity,
    processLargeGeoJson, processLargeGeoJsonStream,
    processKml, processKmlStream,
    processShp, processShpStream,
    processGltf, processGltfStream,
    processCzml, processCzmlStream,
    processThreeDTiles, processThreeDTilesStream,
    processGeoTiff, processGeoTiffStream,
    DEFAULT_GEOTIFF_COLOR_MAP_CATEGORIES,
    SHP_EXTENSIONS, KML_EXTENSIONS, KMZ_EXTENSIONS,
    GEOJSON_EXTENSIONS, GLTF_EXTENSIONS, GLB_EXTENSIONS,
    CZML_EXTENSIONS, TILESET_EXTENSIONS, GEOTIFF_EXTENSIONS,
    addGeoJsonLayer, addKmlLayer, addKmlLayerFromUrl,
    addShpLayer, addGltfModel, addCzmlDataSource,
    addThreeDTilesFromUrl, addGeoTiffLayer,
} from './dataImport/importUtils.js';

// === toolModules ===
export { useCesiumToolModules } from './toolModules/useCesiumToolModules.js';