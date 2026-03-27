<template>
  <div id="cesiumContainer" class="cesium-container"></div>

  <!-- 坐标显示面板 -->
  <div class="map-controls-group">
    <div class="mouse-position-content">{{ coordinateDisplay }}</div>
    <div class="divider"></div>
    <button class="home-btn" @click="flyToHome" title="回到初始位置">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    </button>
  </div>

  <div class="cesium-controls">
    <button @click="flyToEverest" class="fly-btn">🏔️ 飞越珠穆朗玛峰</button>
    <button @click="loadCustomTileset" class="fly-btn">🏢 加载3D模型</button>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useMessage } from '../composables/useMessage';
import { useMapStateStore } from '../stores/mapStateStore';

// 动态引入cesium，避免性能问题和401错误，同时保持代码清晰和可维护。
let Cesium = null;
const CESIUM_VERSION = '1.117';
const CESIUM_BASE_CDN = `https://unpkg.com/cesium@${CESIUM_VERSION}/Build/Cesium`;
const CESIUM_JS_URL = `${CESIUM_BASE_CDN}/Cesium.js`;
const CESIUM_CSS_URL = `${CESIUM_BASE_CDN}/Widgets/widgets.css`;

// --- 配置常量区域 ---
// 天地图 Token：优先使用环境变量
const TDT_TOKEN = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';
//三个图源，俩不稳定
const GOOGLE_MAP_URL = 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}';
// const GOOGLE_MAP_URL = 'https://mt3v.gggis.com/maps/vt?lyrs=s&x={x}&y={y}&z={z}';
// const GooGLE_MAP_URL = 'https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb';

// 天地图插件脚本列表
const TDT_SCRIPTS = [
  'https://api.tianditu.gov.cn/cdn/plugins/cesium/Cesium_ext_min.js',
  'https://api.tianditu.gov.cn/cdn/plugins/cesium/long.min.js',
  'https://api.tianditu.gov.cn/cdn/plugins/cesium/bytebuffer.min.js',
  'https://api.tianditu.gov.cn/cdn/plugins/cesium/protobuf.min.js'
];

// 三维地名初始Grid数据 (提取出来以保持代码整洁)
const TDT_BOUNDS_DATA = [{ "x": 6, "y": 1, "level": 2, "boundBox": { "minX": 90, "minY": 0, "maxX": 135, "maxY": 45 } }, { "x": 7, "y": 1, "level": 2, "boundBox": { "minX": 135, "minY": 0, "maxX": 180, "maxY": 45 } }, { "x": 6, "y": 0, "level": 2, "boundBox": { "minX": 90, "minY": 45, "maxX": 135, "maxY": 90 } }, { "x": 7, "y": 0, "level": 2, "boundBox": { "minX": 135, "minY": 45, "maxX": 180, "maxY": 90 } }, { "x": 5, "y": 1, "level": 2, "boundBox": { "minX": 45, "minY": 0, "maxX": 90, "maxY": 45 } }, { "x": 4, "y": 1, "level": 2, "boundBox": { "minX": 0, "minY": 0, "maxX": 45, "maxY": 45 } }, { "x": 5, "y": 0, "level": 2, "boundBox": { "minX": 45, "minY": 45, "maxX": 90, "maxY": 90 } }, { "x": 4, "y": 0, "level": 2, "boundBox": { "minX": 0, "minY": 45, "maxX": 45, "maxY": 90 } }, { "x": 6, "y": 2, "level": 2, "boundBox": { "minX": 90, "minY": -45, "maxX": 135, "maxY": 0 } }, { "x": 6, "y": 3, "level": 2, "boundBox": { "minX": 90, "minY": -90, "maxX": 135, "maxY": -45 } }, { "x": 7, "y": 2, "level": 2, "boundBox": { "minX": 135, "minY": -45, "maxX": 180, "maxY": 0 } }, { "x": 5, "y": 2, "level": 2, "boundBox": { "minX": 45, "minY": -45, "maxX": 90, "maxY": 0 } }, { "x": 4, "y": 2, "level": 2, "boundBox": { "minX": 0, "minY": -45, "maxX": 45, "maxY": 0 } }, { "x": 3, "y": 1, "level": 2, "boundBox": { "minX": -45, "minY": 0, "maxX": 0, "maxY": 45 } }, { "x": 3, "y": 0, "level": 2, "boundBox": { "minX": -45, "minY": 45, "maxX": 0, "maxY": 90 } }, { "x": 2, "y": 0, "level": 2, "boundBox": { "minX": -90, "minY": 45, "maxX": -45, "maxY": 90 } }, { "x": 0, "y": 1, "level": 2, "boundBox": { "minX": -180, "minY": 0, "maxX": -135, "maxY": 45 } }, { "x": 1, "y": 0, "level": 2, "boundBox": { "minX": -135, "minY": 45, "maxX": -90, "maxY": 90 } }, { "x": 0, "y": 0, "level": 2, "boundBox": { "minX": -180, "minY": 45, "maxX": -135, "maxY": 90 } }];

// --- 响应式变量 ---
let viewer = null;
let handler = null;
const coordinateDisplay = ref('经度: 0.000000, 纬度: 0.000000, 海拔: 0.00米');
const message = useMessage();
const mapStateStore = useMapStateStore();

// --- 生命周期 ---
onMounted(() => {
  bootCesium();
});

onUnmounted(() => {
  if (handler) {
    handler.destroy();
    handler = null;
  }
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
});

// --- 核心功能函数 ---

async function bootCesium() {
  try {
    await loadCesiumRuntime();
    if (!Cesium || !document.getElementById('cesiumContainer')) return;

    initViewer();
    setupInteractions();
    // 先保证首屏有地球和影像，再异步加载增强图层。
    addFastBaseImagery();
    loadAndSetupTiandituEnhancements();
  } catch (error) {
    console.error('Cesium 运行时加载失败', error);
  }
}

async function loadCesiumRuntime() {
  if (window.Cesium) {
    Cesium = window.Cesium;
    return;
  }

  await loadStyleOnce(CESIUM_CSS_URL, 'cesium-widgets-style');
  await loadScriptOnce(CESIUM_JS_URL, 'cesium-runtime-script');

  Cesium = window.Cesium;
  if (!Cesium) {
    throw new Error('Cesium global 未找到');
  }
}

/**
 * 1. 初始化 Cesium Viewer
 */
function initViewer() {
  viewer = new Cesium.Viewer('cesiumContainer', {
    // 移除默认图层和地形，完全由自定义逻辑控制，避免401错误
    imageryProvider: false,
    terrainProvider: undefined,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    selectionIndicator: false,
    timeline: false,
    animation: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    shouldAnimate: true,
  });

  // 默认位置：中国
  flyToStoreView(0);

  // 隐藏版权信息
  viewer._cesiumWidget._creditContainer.style.display = "none";

  // 开启地形夸张
  viewer.scene.globe.terrainExaggeration = 1;
  viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0;
}

/**
 * 2. 设置交互逻辑 (鼠标事件)
 */
function setupInteractions() {
  handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
    const ray = viewer.camera.getPickRay(movement.endPosition);
    if (!ray) return;
    const position = viewer.scene.globe.pick(ray, viewer.scene);
    if (position) {
      const cartographic = Cesium.Cartographic.fromCartesian(position);
      const lng = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
      const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
      const height = cartographic.height.toFixed(2);
      coordinateDisplay.value = `经度: ${lng}, 纬度: ${lat}, 海拔: ${height}米`;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

/**
 * 3. 加载并配置天地图 (含插件和图层)
 */
async function loadAndSetupTiandituEnhancements() {
  // 暴露 Cesium 到全局供插件使用
  window.Cesium = Cesium;

  try {
    // 使用补丁模式加载脚本，防止插件报错
    await loadScriptsWithPatch(TDT_SCRIPTS);
    addTiandituEnhancements();
  } catch (e) {
    console.error('天地图插件加载或初始化失败', e);
  }
}

/**
 * 首屏快速影像图层：不依赖天地图插件，尽快出图
 */
function addFastBaseImagery() {
  const imageryLayers = viewer.imageryLayers;

  // 基础底图 (Google Maps)
  const googleLayer = new Cesium.UrlTemplateImageryProvider({
    url: GOOGLE_MAP_URL,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: 20
  });
  imageryLayers.addImageryProvider(googleLayer);
}

/**
 * 增强图层：插件加载完成后再异步补充
 */
function addTiandituEnhancements() {
  if (!viewer) return;
  const imageryLayers = viewer.imageryLayers;

  // 国界标注 (天地图)
  const borderLayer = new Cesium.UrlTemplateImageryProvider({
    url: `https://t0.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cia&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TDT_TOKEN}`,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: 20
  });
  imageryLayers.addImageryProvider(borderLayer);

  // 地形服务 (天地图)
  const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7'];
  const terrainUrls = subdomains.map(s =>
    `https://t${s}.tianditu.gov.cn/mapservice/swdx?T=elv_c&tk=${TDT_TOKEN}`
  );

  // 使用插件提供的 GeoTerrainProvider
  if (window.Cesium.GeoTerrainProvider) {
    viewer.terrainProvider = new window.Cesium.GeoTerrainProvider({ urls: terrainUrls });
  }

  // 三维地名服务 (WTFS)
  if (window.Cesium.GeoWTFS) {
    setupWTFS(subdomains);
  }
}

/**
 * 配置三维地名服务 (GeoWTFS)
 */
function setupWTFS(subdomains) {
  const tdtUrl = 'https://t{s}.tianditu.gov.cn/';

  const wtfs = new window.Cesium.GeoWTFS({
    viewer,
    subdomains: subdomains,
    metadata: {
      boundBox: { minX: -180, minY: -90, maxX: 180, maxY: 90 },
      minLevel: 1,
      maxLevel: 20
    },
    depthTestOptimization: true,
    dTOElevation: 15000,
    dTOPitch: Cesium.Math.toRadians(-70),
    aotuCollide: true,
    collisionPadding: [5, 10, 8, 5],
    serverFirstStyle: true,
    labelGraphics: {
      font: "28px sans-serif",
      fontSize: 28,
      fillColor: Cesium.Color.WHITE,
      scale: 0.5,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      showBackground: false,
      pixelOffset: new Cesium.Cartesian2(5, 5)
    },
    billboardGraphics: {
      width: 18,
      height: 18
    }
  });

  // 重写 URL 获取方法
  wtfs.getTileUrl = function () {
    return `https://t0.tianditu.gov.cn/mapservice/GetTiles?lxys={z},{x},{y}&VERSION=1.0.0&tk=${TDT_TOKEN}`;
  };
  wtfs.getIcoUrl = function () {
    return `https://t0.tianditu.gov.cn/mapservice/GetIcon?id={id}&tk=${TDT_TOKEN}`;
  };

  wtfs.initTDT(TDT_BOUNDS_DATA);
}

// --- 辅助工具函数 ---

/**
 * 带有兼容性补丁的脚本加载器
 * 拦截 Object.defineProperty 以兼容旧版/特定版天地图插件
 */
async function loadScriptsWithPatch(urls) {
  if (window.Cesium.GeoWTFS) return; // 避免重复加载

  const originalDefineProperty = Object.defineProperty;

  // 猴子补丁：拦截 Cesium 内部属性定义，防止插件崩溃
  Object.defineProperty = function (obj, prop, descriptor) {
    if (['primitiveAdded', 'primitiveRemoved', 'primitiveMoved'].includes(prop)) {
      try {
        return originalDefineProperty.call(this, obj, prop, descriptor);
      } catch (e) {
        return obj;
      }
    }
    return originalDefineProperty.call(this, obj, prop, descriptor);
  };

  try {
    for (const url of urls) {
      await loadScript(url);
    }
  } finally {
    // 无论成功失败，恢复原始方法
    Object.defineProperty = originalDefineProperty;
  }
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadScriptOnce(url, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (window.Cesium) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`脚本加载失败: ${url}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`脚本加载失败: ${url}`));
    document.head.appendChild(script);
  });
}

function loadStyleOnce(url, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`样式加载失败: ${url}`));
    document.head.appendChild(link);
  });
}

// --- 业务操作函数 ---

// 修改 script 部分的 flyToHome 函数

function flyToHome(param) {
  if (!viewer) return;

  // 【修复逻辑】
  // 如果 param 是数字（比如初始化调用 flyToHome(0)），就用 param
  // 如果 param 不是数字（比如点击按钮传入的 MouseEvent），就用默认值 2 秒
  const duration = typeof param === 'number' ? param : 2;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(104.1954, 35.8617, 15000000),
    orientation: {
      heading: 0.0,
      pitch: -Cesium.Math.PI_OVER_TWO,
      roll: 0.0
    },
    duration: duration
  });
}

function zoomToCameraHeight(zoom) {
  const parsed = Number(zoom);
  if (!Number.isFinite(parsed)) return 15000000;
  const clamped = Math.max(1, Math.min(20, parsed));
  return 591657550.5 / Math.pow(2, clamped);
}

function flyToStoreView(duration = 0) {
  if (!viewer || !Cesium) return;

  const center = Array.isArray(mapStateStore.center) ? mapStateStore.center : [104.1954, 35.8617];
  const lng = Number(center[0]);
  const lat = Number(center[1]);
  const validLng = Number.isFinite(lng) ? lng : 104.1954;
  const validLat = Number.isFinite(lat) ? lat : 35.8617;
  const height = zoomToCameraHeight(mapStateStore.zoom);

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(validLng, validLat, height),
    orientation: {
      heading: 0.0,
      pitch: -Cesium.Math.PI_OVER_FOUR,
      roll: 0.0
    },
    duration: Number(duration) || 0
  });
}

function flyToEverest() {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(86.9250, 27.9881, 9000),
    orientation: {
      heading: Cesium.Math.toRadians(0.0),
      pitch: Cesium.Math.toRadians(-25.0),
      roll: 0.0
    },
    duration: 3
  });
}

async function loadCustomTileset() {
  if (!viewer) return;
  try {
    // 官方示例 Tileset
    const tileset = await Cesium.Cesium3DTileset.fromUrl(
      'https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/master/1.0/TilesetWithDiscreteLOD/tileset.json'
    );
    viewer.scene.primitives.add(tileset);

    // --- 修改开始 ---
    // 使用 flyTo 替代 zoomTo，并添加动画参数
    viewer.flyTo(tileset, {
      duration: 3, // 飞行时间（秒），与飞越珠峰保持一致
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0.0),    // Heading: 方向 (0度)
        Cesium.Math.toRadians(-25.0),  // Pitch: 俯仰角 (-25度，从斜上方观看)
        tileset.boundingSphere.radius * 2.5 // Range: 距离 (根据模型大小自动调整距离)
      )
    });
    // --- 修改结束 ---

  } catch (error) {
    console.error(`加载模型失败: ${error}`);
    message.error('加载3D模型失败，可能是网络原因无法访问 GitHub 资源。', { closable: true, duration: 6500 });
  }
}
</script>

<style scoped>
/* 保持原有样式，无需变动 */
.cesium-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

.cesium-controls {
  position: absolute;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: flex;
  gap: 10px;
}

.fly-btn {
  background: rgba(42, 42, 42, 0.8);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 10px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
  backdrop-filter: blur(5px);
}

.fly-btn:hover {
  background: rgba(66, 185, 131, 0.9);
  transform: translateY(-2px);
}

.map-controls-group {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(to right, rgba(10, 121, 51, 0.9), rgba(8, 96, 41, 0.9));
  color: white;
  padding: 5px 10px;
  border-radius: 6px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .map-controls-group {
    width: 90%;
    justify-content: center;
    bottom: 15px;
  }

  .mouse-position-content {
    font-size: 12px;
    min-width: auto;
  }
}

.mouse-position-content {
  font-size: 14px;
  font-weight: bold;
  min-width: 120px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.divider {
  width: 1px;
  height: 20px;
  background-color: rgba(255, 255, 255, 0.4);
}

.home-btn {
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.home-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
</style>