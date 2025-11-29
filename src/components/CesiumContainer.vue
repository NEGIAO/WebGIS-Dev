<template>
  <div id="cesiumContainer" class="cesium-container"></div>
  <div class="cesium-controls">
    <button @click="flyToEverest" class="fly-btn">🏔️ 飞越珠穆朗玛峰</button>
    <button @click="flyToHome" class="fly-btn">🏠 回到初始位置</button>
    <button @click="loadCustomTileset" class="fly-btn">🏢 加载3D模型</button>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import * as Cesium from 'cesium';

let viewer = null;

onMounted(async () => {
  // 如果你有 Cesium Ion Token，可以在这里设置
  // Cesium.Ion.defaultAccessToken = 'YOUR_TOKEN_HERE';

  viewer = new Cesium.Viewer('cesiumContainer', {
    terrain: Cesium.Terrain.fromWorldTerrain(), // 开启世界地形
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

  // 2. 开启地形夸张 (2.5倍)
  viewer.scene.globe.terrainExaggeration = 2.5;
  viewer.scene.globe.terrainExaggerationRelativeHeight = 0.0;

  // 隐藏版权信息（仅用于开发演示，生产环境请保留）
  viewer._cesiumWidget._creditContainer.style.display = "none";
});

onUnmounted(() => {
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
});

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
</style>
