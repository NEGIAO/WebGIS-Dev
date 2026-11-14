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
export { loadCesiumRuntime, applyCesiumIonToken, CESIUM_BASE_URL, CESIUM_CSS_URL } from './core/cesiumRuntime';
export { readStoredString, writeStoredString, readStoredBoolean, writeStoredBoolean } from './core/cesiumStorage';
export { configureBeijingTimeSystem } from './core/cesiumTimeSystem';

// === scene ===
export { configureSolarLighting, configureRealisticAtmosphere, captureRealisticAtmosphereState, restoreRealisticAtmosphere } from './scene/cesiumAtmosphere';
export { useCesiumBeautify } from './scene/useCesiumBeautify';
export { useCesiumCreditHider } from './scene/useCesiumCreditHider';

// === camera ===
export { useCesiumCameraEnhanced, EasingFunctions, SpringController, FlightState } from './camera/useCesiumCameraEnhanced';
export { useCesiumSceneActions } from './camera/useCesiumSceneActions';

// === layers ===
export { useCesiumLayers } from './layers/useCesiumLayers';
export { useCesiumBasemapSwitcher } from './layers/useCesiumBasemapSwitcher';
export { useCesiumUrlTracking, DEFAULT_CESIUM_CAMERA } from './layers/useCesiumUrlTracking';
export {
    TDT_SUBDOMAINS, TDT_SERVICE_ROOT, ARCGIS_WORLD_TERRAIN_URL,
    CUSTOM_XYZ_BASEMAP_ID, CUSTOM_XYZ_BASEMAP_URL_KEY,
    getUnifiedBasemapOptions, terrainOptions,
    buildUnifiedBasemapOptions, getPresetDescription,
    getTerrainIconColor, getTerrainIconText,
    readRuntimeValue, destroyPrimitive,
    createCesiumOsmBuildingsTileset,
    getBasemapTooltip, getPresetPickerColor, getPresetPickerLabel,
    normalizeCustomXyzUrl, expandSubdomainRange, isValidCustomTileUrl,
    createOfficialBasemapId, createPickerIcon,
} from './layers/layerUtils';

// === interaction ===
export { useCesiumInteractions } from './interaction/useCesiumInteractions';
export { useCesiumFrameRate } from './interaction/useCesiumFrameRate';
export {
    ENABLE_REQUEST_RENDER_MODE, initRequestRenderMode,
    acquireContinuous, releaseContinuous, getContinuousRenderSnapshot,
} from './interaction/useCesiumRenderMode';

// === terrain ===
export { useCesiumHeightSampler } from './terrain/useCesiumHeightSampler';
export { useCesiumWind } from '../modules/wind/useCesiumWind';

// === models ===
export { useCesiumModelManager, ModelState } from './models/useCesiumModelManager';

// === dataImport ===
export { useCesiumDataImport } from './dataImport/useCesiumDataImport';
export {
    TILESET_JSON_INDICATOR, getExtension, createBlobUrl, revokeBlobUrl, flyToEntity,
} from './dataImport/importUtils';

// === toolModules ===
export { useCesiumToolModules } from './toolModules/useCesiumToolModules';