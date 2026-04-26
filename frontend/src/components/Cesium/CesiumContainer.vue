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
    <button @click="loadSimulatedWind" class="fly-btn">🌬️ 加载模拟风场</button>
  </div>

  <!-- 风场参数调节面板 -->
  <div v-if="wind2D" class="wind-controls">
    <div class="param-row">
      <label>速度因子: {{ speedFactor.toFixed(1) }}</label>
      <input type="range" min="0.1" max="5" step="0.1" v-model.number="speedFactor" @input="onParamChange" />
    </div>
    <div class="param-row">
      <label>箭头长度: {{ arrowLength / 1000 }}km</label>
      <input type="range" min="5000" max="50000" step="1000" v-model.number="arrowLength" @input="onParamChange" />
    </div>
    <div class="param-row">
      <label>尾迹长度: {{ trailLength / 1000 }}km</label>
      <input type="range" min="5000" max="80000" step="1000" v-model.number="trailLength" @input="onParamChange" />
    </div>
    <div class="param-row">
      <label>透明度: {{ alphaFactor.toFixed(2) }}</label>
      <input type="range" min="0.1" max="1" step="0.05" v-model.number="alphaFactor" @input="onParamChange" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useMessage } from '../../composables/useMessage';
import { showLoading, hideLoading } from '../../utils/loading';
import CesiumAdvancedEffects from './CesiumAdvancedEffects.vue';
// import Wind2D from './Wind2D'; // 导入刚刚实现的 Wind2D 类
//此处还没实现

let Cesium = null;

// --- 配置常量区域 ---
const TDT_TOKEN = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';
const TDT_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7'];
const TDT_SERVICE_ROOT = 'https://t{s}.tianditu.gov.cn/';

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
let wind2D = null; // Wind2D 实例
const coordinateDisplay = ref('经度: 0.000000, 纬度: 0.000000, 海拔: 0.00米');
const shouldLoadAdvancedEffects = ref(false);
const message = useMessage();

// 风场参数绑定（与 Wind2D 实例同步）
const speedFactor = ref(1.0);
const arrowLength = ref(15000);
const trailLength = ref(20000);
const alphaFactor = ref(1.0);

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
  if (wind2D) {
    wind2D.destroy();
    wind2D = null;
  }
  if (viewer) {
    try {
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
    addBaseImageryLayers();

    const terrainReady = initOfficialTerrain();
    shouldLoadAdvancedEffects.value = true;
    if (terrainReady) {
      message.success('天地图基础影像与地形加载成功。');
    } else {
      message.error('天地图地形加载失败，请检查 token 或网络。', { closable: true });
    }

    // 风场在初始化完毕后即可准备加载（但需要手动点击按钮或自动加载）
    // 这里不自动加载，避免占满视野，等待用户点击“加载模拟风场”
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

  const hideCreditsAggressive = () => {
    if (viewer._cesiumWidget?._creditContainer) {
      viewer._cesiumWidget._creditContainer.style.cssText = 'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important;';
      viewer._cesiumWidget._creditContainer.innerHTML = '';
    }
    const creditElems = document.querySelectorAll('[class*="credit"], [class*="geostar"], [class*="GeoStar"]');
    creditElems.forEach(el => {
      el.style.cssText = 'display: none !important; visibility: hidden !important;';
      el.innerHTML = '';
    });
    if (viewer.scene && viewer.scene.frameState && viewer.scene.frameState.creditDisplay) {
      viewer.scene.frameState.creditDisplay.hasCredits = () => false;
      viewer.scene.frameState.creditDisplay.destroy = () => {};
    }
  };
  hideCreditsAggressive();

  const creditCheckInterval = setInterval(() => {
    const creditContainer = document.querySelector('.cesium-credit-container');
    if (creditContainer && creditContainer.innerHTML.length > 0) {
      creditContainer.innerHTML = '';
      creditContainer.style.cssText = 'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important;';
    }
  }, 500);
  viewer._creditCheckInterval = creditCheckInterval;

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

// --- 风场集成代码 ---
/**
 * 生成一个覆盖中国区域的模拟风场数据
 * 用于快速验证效果，实际项目中应替换为真实 API 数据
 */
function generateSimulatedWindData() {
  const centerLon = 104.0;  // 中国几何中心
  const centerLat = 35.0;
  const layerCount = 5;
  const altitudes = [0, 2000, 5000, 10000, 15000];  // 不同高度层（海拔米）
  const sizeMesh = [30000, 30000, 25000, 25000, 20000]; // 网格间距（米）
  const counts = [30, 30, 25, 25, 20]; // 各层网格分辨率 (nx=ny)
  
  const totalPoints = counts.reduce((sum, c) => sum + c * c, 0);
  const hspeed = new Array(totalPoints);
  const hdir = new Array(totalPoints);
  const vspeed = new Array(totalPoints);

  let offset = 0;
  for (let k = 0; k < layerCount; k++) {
    const nx = counts[k];
    const ny = counts[k];
    const gridSize = sizeMesh[k];
    // 模拟一个旋转风场 + 噪声
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = offset + j * nx + i;
        // 生成位置偏移（相对于中心，单位：度）
        const dx = (i - nx / 2) * (gridSize / 111320.0);
        const dy = (j - ny / 2) * (gridSize / 111320.0 / Math.cos(Cesium.Math.toRadians(centerLat)));
        // 风向：绕中心旋转 + 随机扰动
        const baseAngle = Math.atan2(dy, dx) + Math.PI / 2; // 逆时针旋转
        const angle = baseAngle + 0.2 * Math.sin(i * 0.5) * Math.cos(j * 0.5);
        hdir[idx] = Cesium.Math.toDegrees(angle) % 360;
        // 风速：随高度增加，中心附近更大
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 15; // 约15度范围
        const factor = Math.max(0, 1 - dist / maxDist);
        hspeed[idx] = (5 + k * 2) * factor + 2 * Math.random();
        vspeed[idx] = 0.5 * Math.sin(i * 0.3) * Math.cos(j * 0.3);
      }
    }
    offset += nx * ny;
  }

  return {
    longitude: centerLon,
    latitude: centerLat,
    altitude: altitudes,
    sizeMesh: sizeMesh,
    count: counts,
    hspeed: hspeed,
    hdir: hdir,
    vspeed: vspeed,
  };
}

/**
 * 点击按钮加载风场
 */
function loadSimulatedWind() {
  if (!viewer || !Cesium) {
    message.error('Cesium 尚未初始化');
    return;
  }

  // 如果已有实例则先销毁
  if (wind2D) {
    wind2D.destroy();
    wind2D = null;
  }

  const data = generateSimulatedWindData();

  // 创建 Wind2D 实例（与面板参数同步）
  wind2D = new Wind2D(viewer, {
    maxWindSpeed: 20,         // 最大风速（用于归一化）
    cesium: Cesium,
    speedFactor: speedFactor.value,
    arrowLength: arrowLength.value,
    trailLength: trailLength.value,
    alphaFactor: alphaFactor.value,
  });

  // 加载数据，内部会自动设置粒子数
  wind2D.loadData(data);

  // 飞到风场中央
  wind2D.flyTo();

  message.success('风场加载成功，可通过下方滑块调节样式');
}

/**
 * 滑块参数变化时，实时更新 Wind2D 实例
 */
function onParamChange() {
  if (!wind2D) return;
  wind2D.speedFactor = speedFactor.value;
  wind2D.arrowLength = arrowLength.value;
  wind2D.trailLength = trailLength.value;
  wind2D.alphaFactor = alphaFactor.value;
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

function flyToHome(param) {
  if (!viewer) return;
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
    const tileset = await Cesium.Cesium3DTileset.fromUrl(
      'https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/master/1.0/TilesetWithDiscreteLOD/tileset.json'
    );
    viewer.scene.primitives.add(tileset);
    viewer.flyTo(tileset, {
      duration: 3,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0.0),
        Cesium.Math.toRadians(-25.0),
        tileset.boundingSphere.radius * 2.5
      )
    });
  } catch (error) {
    message.error(`加载模型失败: ${error}`);
    message.error('加载3D模型失败，可能是网络原因无法访问 GitHub 资源。', { closable: true, duration: 6500 });
  }
}
</script>

<style scoped>
/* 原有样式保持不变 */
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

/* 新增风场控制面板样式 */
.wind-controls {
  position: absolute;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  background: rgba(20, 20, 20, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 15px 20px;
  color: white;
  font-size: 13px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  min-width: 600px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.param-row label {
  min-width: 100px;
  text-align: right;
  font-weight: bold;
}

.param-row input[type="range"] {
  width: 120px;
  cursor: pointer;
  accent-color: #42b983;
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
  .wind-controls {
    flex-direction: column;
    min-width: auto;
    width: 90%;
    bottom: 180px;
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