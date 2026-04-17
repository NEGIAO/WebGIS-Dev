<template>
  <div id="cesiumContainer" class="cesium-container"></div>

  <component
    :is="CesiumAdvancedEffects"
    v-if="shouldLoadAdvancedEffects"
    :get-viewer="getViewer"
    :get-cesium="getCesium"
  />

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
import { showLoading, hideLoading } from '../utils/loading';
import CesiumAdvancedEffects from './CesiumAdvancedEffects.vue';

let Cesium = null;

// --- 配置常量区域 ---
const TDT_TOKEN = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';
const TDT_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7'];
const TDT_SERVICE_ROOT = 'https://t{s}.tianditu.gov.cn/';

// 参考天地图官方三维示例资源地址
const TDT_CESIUM_JS_URL = 'https://api.tianditu.gov.cn/cdn/demo/sanwei/static/cesium/Cesium.js';
const TDT_CESIUM_CSS_URL = 'https://api.tianditu.gov.cn/cdn/demo/sanwei/static/cesium/Widgets/widgets.css';
const TDT_PLUGIN_URLS = [
  'https://api.tianditu.gov.cn/cdn/plugins/cesium/Cesium_ext_min.js',
  'https://api.tianditu.gov.cn/cdn/plugins/cesium/long.min.js',
  'https://api.tianditu.gov.cn/cdn/plugins/cesium/bytebuffer.min.js',
  'https://api.tianditu.gov.cn/cdn/plugins/cesium/protobuf.min.js'
];

// --- 响应式变量 ---
let viewer = null;
let handler = null;
const coordinateDisplay = ref('经度: 0.000000, 纬度: 0.000000, 海拔: 0.00米');
const shouldLoadAdvancedEffects = ref(false);
const message = useMessage();

// --- 生命周期 ---
onMounted(() => {
  bootCesium();
});

onUnmounted(() => {
  shouldLoadAdvancedEffects.value = false;
  if (handler) {
    handler.destroy();
    handler = null;
  }
  if (viewer) {
    try {
      // 清理 credit 检查 interval
      if (viewer._creditCheckInterval) {
        clearInterval(viewer._creditCheckInterval);
      }
      viewer.destroy();
    } catch (e) {
      console.warn('Cesium viewer destroy warning:', e);
    }
    viewer = null;
  }
});

// --- 核心功能函数 ---

async function bootCesium() {
  showLoading('正在初始化 3D 场景...');
  try {
    await loadOfficialCesiumRuntime();
    if (!Cesium || !document.getElementById('cesiumContainer')) return;

    initViewer();
    setupInteractions();
    // 只做最基础能力：影像 + 地形
    addBaseImageryLayers();

    const terrainReady = initOfficialTerrain();
    shouldLoadAdvancedEffects.value = true;
    if (terrainReady) {
      message.success('天地图基础影像与地形加载成功。');
    } else {
      message.error('天地图地形加载失败，请检查 token 或网络。', { closable: true });
    }
  } catch (error) {
    message.error('Cesium 运行时加载失败', error);
    message.error('Cesium 初始化失败，请检查网络环境。', { closable: true });
  } finally {
    hideLoading();
  }
}

function getViewer() {
  return viewer;
}

function getCesium() {
  return Cesium || window.Cesium;
}

async function loadOfficialCesiumRuntime() {
  await loadStyleOnce(TDT_CESIUM_CSS_URL, 'tdt-cesium-widgets-style');

  await loadScriptOnce(TDT_CESIUM_JS_URL, 'tdt-cesium-runtime-script');
  for (let i = 0; i < TDT_PLUGIN_URLS.length; i++) {
    await loadScriptOnce(TDT_PLUGIN_URLS[i], `tdt-plugin-${i}`);
  }

  Cesium = window.Cesium;
  if (!Cesium) throw new Error('Cesium global 未找到');
}

/**
 * 1. 初始化 Cesium Viewer
 */
function initViewer() {
  const mapCtor = typeof Cesium.Map === 'function' ? Cesium.Map : Cesium.Viewer;

  viewer = new mapCtor('cesiumContainer', {
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

  flyToHome(0);

  if (viewer._cesiumWidget?._creditContainer) {
    viewer._cesiumWidget._creditContainer.style.display = 'none';
  }

  viewer.scene.globe.terrainExaggeration = 1;
  viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.depthTestAgainstTerrain = true;

  // 隐藏所有归属信息 (Powered by GeoStar 等)
  const hideCreditsAggressive = () => {
    // 方法1：隐藏容器
    if (viewer._cesiumWidget?._creditContainer) {
      viewer._cesiumWidget._creditContainer.style.cssText = 'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important;';
      viewer._cesiumWidget._creditContainer.innerHTML = '';
    }

    // 方法2：查找并移除所有 credit 相关 DOM
    const creditElems = document.querySelectorAll('[class*="credit"], [class*="geostar"], [class*="GeoStar"]');
    creditElems.forEach(el => {
      el.style.cssText = 'display: none !important; visibility: hidden !important;';
      el.innerHTML = '';
    });

    // 方法3：禁用 credit 显示逻辑
    if (viewer.scene && viewer.scene.frameState && viewer.scene.frameState.creditDisplay) {
      viewer.scene.frameState.creditDisplay.hasCredits = () => false;
      viewer.scene.frameState.creditDisplay.destroy = () => {};
    }
  };

  hideCreditsAggressive();

  // 持续监控并移除 credits (因为 Cesium 可能会动态添加)
  const creditCheckInterval = setInterval(() => {
    const creditContainer = document.querySelector('.cesium-credit-container');
    if (creditContainer && creditContainer.innerHTML.length > 0) {
      creditContainer.innerHTML = '';
      creditContainer.style.cssText = 'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important;';
    }
  }, 500);

  // 存储 interval ID 以便清理
  viewer._creditCheckInterval = creditCheckInterval;

  // CSS 全局样式隐藏
  if (!document.getElementById('cesium-credit-override')) {
    const style = document.createElement('style');
    style.id = 'cesium-credit-override';
    style.textContent = `
      .cesium-credit-container { display: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; }
      .cesium-credit-text { display: none !important; visibility: hidden !important; }
      .cesium-credit-logo-link { display: none !important; visibility: hidden !important; }
      [class*="credit"] { display: none !important; visibility: hidden !important; }
    `;
    document.head.appendChild(style);
  }
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
 * 最基础影像图层：影像 + 国界注记
 * 参考官方调用：DataServer?T=img_w / ibo_w
 */
function addBaseImageryLayers() {
  const imageryLayers = viewer.imageryLayers;

  const imgLayer = new Cesium.UrlTemplateImageryProvider({
    url: `${TDT_SERVICE_ROOT}DataServer?T=img_w&x={x}&y={y}&l={z}&tk=${TDT_TOKEN}`,
    subdomains: TDT_SUBDOMAINS,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: 18
  });
  imageryLayers.addImageryProvider(imgLayer);

  const iboLayer = new Cesium.UrlTemplateImageryProvider({
    url: `${TDT_SERVICE_ROOT}DataServer?T=ibo_w&x={x}&y={y}&l={z}&tk=${TDT_TOKEN}`,
    subdomains: TDT_SUBDOMAINS,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: 10
  });
  imageryLayers.addImageryProvider(iboLayer);
}

/**
 * 地形初始化：官方 GeoTerrainProvider。
 */
function initOfficialTerrain() {
  const terrainUrls = TDT_SUBDOMAINS.map(
    (s) => `https://t${s}.tianditu.gov.cn/mapservice/swdx?T=elv_c&tk=${TDT_TOKEN}`
  );

  if (!window.Cesium?.GeoTerrainProvider) {
    message.error('GeoTerrainProvider 不存在，插件未正确加载。');
    return false;
  }

  try {
    viewer.terrainProvider = new window.Cesium.GeoTerrainProvider({ urls: terrainUrls });
    viewer.scene.globe.depthTestAgainstTerrain = true;
    return true;
  } catch (error) {
    message.error('GeoTerrainProvider 初始化失败', error);
    return false;
  }
}

// --- 辅助工具函数 ---

function loadScriptOnce(url, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true') {
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
    script.onload = () => {
      script.setAttribute('data-loaded', 'true');
      resolve();
    };
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
    message.error(`加载模型失败: ${error}`);
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