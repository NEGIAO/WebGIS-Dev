<template>
  <div id="cesiumContainer" class="cesium-container"></div>
  
  <!-- 坐标显示面板 (仿照 MapContainer 样式) -->
  <div class="map-controls-group">
      <div class="mouse-position-content">{{ coordinateDisplay }}</div>
      <div class="divider"></div>
      <button class="home-btn" @click="flyToHome" title="回到初始位置">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
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
import * as Cesium from 'cesium';

let viewer = null;
let handler = null;

const coordinateDisplay = ref('经度: 0.000000, 纬度: 0.000000, 海拔: 0.00米');

// 天地图 Token
const token = '4267820f43926eaf808d61dc07269beb';

// 动态加载脚本函数
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

onMounted(async () => {
  // 如果你有 Cesium Ion Token，可以在这里设置
  // Cesium.Ion.defaultAccessToken = 'YOUR_TOKEN_HERE';

  viewer = new Cesium.Viewer('cesiumContainer', {
    // terrain: Cesium.Terrain.fromWorldTerrain(), // 移除默认地形，避免 401 错误
    // imageryProvider: false, // 移除默认影像，避免 401 错误
    // 使用 Google Maps 影像作为基础图层，防止 Cesium 加载默认的 Ion 影像导致 401
    imageryProvider: new Cesium.UrlTemplateImageryProvider({
        url: 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}',
        tilingScheme : new Cesium.WebMercatorTilingScheme(),
        maximumLevel : 20
    }),
    infoBox: false,
    selectionIndicator: false,
    shadows: true,
    shouldAnimate: true,
    animation: false, // 隐藏动画控件
    timeline: false, // 隐藏时间轴
    geocoder: false, // 隐藏搜索框
    homeButton: false, // 隐藏Home按钮
    sceneModePicker: false, // 隐藏模式选择器
    baseLayerPicker: false, // 隐藏图层选择器
    navigationHelpButton: false, // 隐藏帮助按钮
  });

  // 1. 默认位置设置为中国
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(104.1954, 35.8617, 15000000),
    orientation: {
      heading: 0.0,
      pitch: -Cesium.Math.PI_OVER_TWO,
      roll: 0.0
    }
  });

  // 2. 开启地形夸张 (1倍)
  viewer.scene.globe.terrainExaggeration = 1;
  viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0;

  // 隐藏版权信息（仅用于开发演示，生产环境请保留）
  viewer._cesiumWidget._creditContainer.style.display = "none";

  // 添加鼠标移动事件监听，显示经纬度
  handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
      const ray = viewer.camera.getPickRay(movement.endPosition);
      if (!ray) return;
      const position = viewer.scene.globe.pick(ray, viewer.scene);
      if (position) {
          const cartographic = Cesium.Cartographic.fromCartesian(position);
          const longitude = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
          const latitude = Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
          const height = cartographic.height.toFixed(2);
          coordinateDisplay.value = `经度: ${longitude}, 纬度: ${latitude}, 海拔: ${height}米`;
      }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // --- 天地图集成 ---
  // 暴露 Cesium 到全局，供天地图插件使用 (使用解构复制以允许扩展，因为 import * as Cesium 得到的对象是不可变的)
  window.Cesium = { ...Cesium };

  // 猴子补丁：拦截 Object.defineProperty
  // 即使降级了 Cesium 版本，为了防止插件重复加载或潜在的兼容性问题，保留此拦截是安全的。
  const originalDefineProperty = Object.defineProperty;
  Object.defineProperty = function(obj, prop, descriptor) {
    if (prop === 'primitiveAdded' || prop === 'primitiveRemoved' || prop === 'primitiveMoved') {
      // 只有当属性不可配置时才拦截，或者直接拦截以防万一
      try {
         return originalDefineProperty.call(this, obj, prop, descriptor);
      } catch (e) {
         console.warn(`已拦截并忽略 ${prop} 属性定义 [defineProperty] (天地图插件兼容性处理)`);
         return obj;
      }
    }
    return originalDefineProperty.call(this, obj, prop, descriptor);
  };

  try {
    // 按顺序加载天地图插件
    // 检查是否已经加载过，避免重复加载导致报错
    if (!window.Cesium.GeoWTFS) {
        await loadScript('https://api.tianditu.gov.cn/cdn/plugins/cesium/Cesium_ext_min.js');
        await loadScript('https://api.tianditu.gov.cn/cdn/plugins/cesium/long.min.js');
        await loadScript('https://api.tianditu.gov.cn/cdn/plugins/cesium/bytebuffer.min.js');
        await loadScript('https://api.tianditu.gov.cn/cdn/plugins/cesium/protobuf.min.js');
    }

    // 恢复原始方法
    Object.defineProperty = originalDefineProperty;

    addTiandituLayers();
  } catch (e) {
    console.error('加载天地图插件失败', e);
    Object.defineProperty = originalDefineProperty;
  }
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

// 3. 添加天地图图层
function addTiandituLayers() {
    // 服务域名
    var tdtUrl = 'https://t{s}.tianditu.gov.cn/';
    // 服务负载子域
    var subdomains=['0','1','2','3','4','5','6','7'];

    // 叠加影像服务 (Google Maps)
    // https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={col}&y={row}&z={level}
    // Cesium UrlTemplateImageryProvider 使用 {x}, {y}, {z} 占位符
    var imgMap = new window.Cesium.UrlTemplateImageryProvider({
        url: 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}',
        tilingScheme : new window.Cesium.WebMercatorTilingScheme(),
        maximumLevel : 20
    });
    viewer.imageryLayers.addImageryProvider(imgMap); 

    // 叠加国界服务 (天地图)
    var iboMap = new window.Cesium.UrlTemplateImageryProvider({
        url: 'https://t0.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cia&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb',
        tilingScheme : new window.Cesium.WebMercatorTilingScheme(),
        maximumLevel : 20
    });
    viewer.imageryLayers.addImageryProvider(iboMap);

    // 叠加地形服务
    var terrainUrls = new Array();

    for (var i = 0; i < subdomains.length; i++){
        var url = tdtUrl.replace('{s}', subdomains[i]) + 'mapservice/swdx?T=elv_c&tk=' + token;
        terrainUrls.push(url);
    }

    var provider = new window.Cesium.GeoTerrainProvider({
        urls: terrainUrls
    });

    viewer.terrainProvider = provider;

    // 叠加三维地名服务
    // 注意：这里使用 window.Cesium 因为插件挂载在全局对象上
    var wtfs = new window.Cesium.GeoWTFS({
        viewer,
        //三维地名服务，使用wtfs服务
        subdomains:subdomains,
        metadata:{
            boundBox: {
                minX: -180,
                minY: -90,
                maxX: 180,
                maxY: 90
            },
            minLevel: 1,
            maxLevel: 20
        },
        depthTestOptimization: true,
        dTOElevation: 15000,
        dTOPitch: window.Cesium.Math.toRadians(-70),
        aotuCollide: true, //是否开启避让
        collisionPadding: [5, 10, 8, 5], //开启避让时，标注碰撞增加内边距，上、右、下、左
        serverFirstStyle: true, //服务端样式优先
        labelGraphics: {
            font:"28px sans-serif",
            fontSize: 28,
            fillColor:window.Cesium.Color.WHITE,
            scale: 0.5,
            outlineColor:window.Cesium.Color.BLACK,
            outlineWidth: 2,
            style:window.Cesium.LabelStyle.FILL_AND_OUTLINE,
            showBackground:false,
            backgroundColor:window.Cesium.Color.RED,
            backgroundPadding:new window.Cesium.Cartesian2(10, 10),
            horizontalOrigin:window.Cesium.HorizontalOrigin.LEFT,
            verticalOrigin:window.Cesium.VerticalOrigin.TOP,
            eyeOffset:window.Cesium.Cartesian3.ZERO,
            pixelOffset: new window.Cesium.Cartesian2(5, 5),
            disableDepthTestDistance:undefined
        },
        billboardGraphics: {
            horizontalOrigin:window.Cesium.HorizontalOrigin.CENTER,
            verticalOrigin:window.Cesium.VerticalOrigin.CENTER,
            eyeOffset:window.Cesium.Cartesian3.ZERO,
            pixelOffset:window.Cesium.Cartesian2.ZERO,
            alignedAxis:window.Cesium.Cartesian3.ZERO,
            color:window.Cesium.Color.WHITE,
            rotation:0,
            scale:1,
            width:18,
            height:18,
            disableDepthTestDistance:undefined
        }
    });

    //三维地名服务，使用wtfs服务
    wtfs.getTileUrl = function(){
        return tdtUrl + 'mapservice/GetTiles?lxys={z},{x},{y}&VERSION=1.0.0&tk='+ token; 
    }

    // 三维图标服务
    wtfs.getIcoUrl = function(){
        return tdtUrl + 'mapservice/GetIcon?id={id}&tk='+ token;
    }

    wtfs.initTDT([{"x":6,"y":1,"level":2,"boundBox":{"minX":90,"minY":0,"maxX":135,"maxY":45}},{"x":7,"y":1,"level":2,"boundBox":{"minX":135,"minY":0,"maxX":180,"maxY":45}},{"x":6,"y":0,"level":2,"boundBox":{"minX":90,"minY":45,"maxX":135,"maxY":90}},{"x":7,"y":0,"level":2,"boundBox":{"minX":135,"minY":45,"maxX":180,"maxY":90}},{"x":5,"y":1,"level":2,"boundBox":{"minX":45,"minY":0,"maxX":90,"maxY":45}},{"x":4,"y":1,"level":2,"boundBox":{"minX":0,"minY":0,"maxX":45,"maxY":45}},{"x":5,"y":0,"level":2,"boundBox":{"minX":45,"minY":45,"maxX":90,"maxY":90}},{"x":4,"y":0,"level":2,"boundBox":{"minX":0,"minY":45,"maxX":45,"maxY":90}},{"x":6,"y":2,"level":2,"boundBox":{"minX":90,"minY":-45,"maxX":135,"maxY":0}},{"x":6,"y":3,"level":2,"boundBox":{"minX":90,"minY":-90,"maxX":135,"maxY":-45}},{"x":7,"y":2,"level":2,"boundBox":{"minX":135,"minY":-45,"maxX":180,"maxY":0}},{"x":5,"y":2,"level":2,"boundBox":{"minX":45,"minY":-45,"maxX":90,"maxY":0}},{"x":4,"y":2,"level":2,"boundBox":{"minX":0,"minY":-45,"maxX":45,"maxY":0}},{"x":3,"y":1,"level":2,"boundBox":{"minX":-45,"minY":0,"maxX":0,"maxY":45}},{"x":3,"y":0,"level":2,"boundBox":{"minX":-45,"minY":45,"maxX":0,"maxY":90}},{"x":2,"y":0,"level":2,"boundBox":{"minX":-90,"minY":45,"maxX":-45,"maxY":90}},{"x":0,"y":1,"level":2,"boundBox":{"minX":-180,"minY":0,"maxX":-135,"maxY":45}},{"x":1,"y":0,"level":2,"boundBox":{"minX":-135,"minY":45,"maxX":-90,"maxY":90}},{"x":0,"y":0,"level":2,"boundBox":{"minX":-180,"minY":45,"maxX":-135,"maxY":90}}]);
}

// 3. 添加自定义3D图源的方法
async function loadCustomTileset() {
  if (!viewer) return;
  try {
    // 示例：加载一个公开的 3D Tiles 数据 (建筑物模型)
    // 你可以将下面的 URL 替换为你自己的 3D Tiles 数据的 json 地址
    // 例如: 'http://localhost:8080/my-tileset/tileset.json'
    const tileset = await Cesium.Cesium3DTileset.fromUrl(
      'https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/master/1.0/TilesetWithDiscreteLOD/tileset.json'
    );
    
    viewer.scene.primitives.add(tileset);
    
    // 飞向该模型
    viewer.zoomTo(tileset);
    
    console.log('3D Tiles loaded successfully');
  } catch (error) {
    console.error(`Error loading tileset: ${error}`);
    alert('加载3D模型失败，请检查控制台错误信息');
  }
}

function flyToEverest() {
  if (!viewer) return;
  
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(86.9250, 27.9881, 9000), // 珠峰坐标
    orientation: {
      heading: Cesium.Math.toRadians(0.0),
      pitch: Cesium.Math.toRadians(-25.0),
      roll: 0.0
    },
    duration: 3 // 飞行时间（秒）
  });
}

function flyToHome() {
  if (!viewer) return;
  // 回到中国视角
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(104.1954, 35.8617, 15000000),
    duration: 2
  });
}
</script>

<style scoped>
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
  bottom: 30px;
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

/* 坐标面板样式 (仿照 MapContainer) */
.map-controls-group {
    position: absolute;
    bottom: 20px;
    right: 10px;
    background: linear-gradient(to right, rgba(10, 121, 51, 0.9), rgba(8, 96, 41, 0.9));
    color: white;
    padding: 5px 10px;
    border-radius: 6px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    z-index: 1000;
    border: 1px solid rgba(255,255,255,0.2);
    display: flex;
    align-items: center;
    gap: 10px;
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
