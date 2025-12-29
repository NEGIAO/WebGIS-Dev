<script setup>
import { ref, reactive, defineAsyncComponent } from 'vue';

// 1. 同步导入核心 2D 地图及 UI 组件 (保证首屏速度和 SEO)
import TopBar from '../components/TopBar.vue';
import MapContainer from '../components/MapContainer.vue';
import SidePanel from '../components/SidePanel.vue';
import MagicCursor from '../components/MagicCursor.vue';

// 2. 异步导入 Cesium 组件 (优化：只有在 toggle 到 3D 模式时才去加载巨大的 Cesium 库)
const CesiumContainer = defineAsyncComponent(() =>
    import('../components/CesiumContainer.vue')
);

// --- 状态管理 ---
const locationInfo = reactive({
    isInDihuan: false,
    lonLat: [0, 0]
});
const selectedImage = ref('');
const currentNewsIndex = ref(0);
const is3DMode = ref(false);
const isMagicMode = ref(false);
const mapContainerRef = ref(null);
const isSidePanelCollapsed = ref(true);

// --- 事件处理函数 ---

function handleLocationChange(locationData) {
    Object.assign(locationInfo, locationData);
}

function handleUpdateNewsImage(imageSrc) {
    selectedImage.value = imageSrc;
}

function handleNewsChanged(newsIndex) {
    currentNewsIndex.value = newsIndex;
    // console.log('News changed to index:', newsIndex);
}

// 简单的开关逻辑简化
function toggleSidePanel() {
    isSidePanelCollapsed.value = !isSidePanelCollapsed.value;
}

function toggle3D() {
    is3DMode.value = !is3DMode.value;
}

function toggleMagic() {
    isMagicMode.value = !isMagicMode.value;
}

function handleUploadData(data) {
    // 使用可选链 ?. 防止组件未加载时报错
    mapContainerRef.value?.addUserDataLayer(data);
}

function handleInteraction(type) {
    mapContainerRef.value?.activateInteraction(type);
}

function handleFeatureSelected(properties) {
    if (!properties) return;

    // 优化：使用 Object.entries 更优雅地处理对象遍历
    let msg = "要素属性详情:\n----------------\n";
    const entries = Object.entries(properties);

    if (entries.length === 0) {
        msg += "无属性数据";
    } else {
        msg += entries.map(([key, val]) => `${key}: ${val}`).join('\n');
    }

    // 保持原来的 alert 逻辑，简单直接
    alert(msg);
}
</script>

<template>
    <div class="home-container">
        <!-- 特效光标 -->
        <MagicCursor :active="isMagicMode" />

        <!-- 顶部控制栏 -->
        <div class="top-section">
            <TopBar @toggle-magic="toggleMagic" @toggle-3d="toggle3D" @upload-data="handleUploadData"
                @interaction="handleInteraction" />
        </div>

        <div class="content-section">
            <div class="map-wrapper">
                <!-- 
                  优化点：
                  1. MapContainer 使用 v-show。2D地图是核心，需优先加载且切换3D时不销毁(保持状态)。
                  2. CesiumContainer 使用 v-if。3D地图很重，只有需要时才渲染 DOM。
                -->
                <MapContainer ref="mapContainerRef" v-show="!is3DMode" @location-change="handleLocationChange"
                    @update-news-image="handleUpdateNewsImage" @feature-selected="handleFeatureSelected" />

                <!-- 异步加载的 Cesium 组件 -->
                <CesiumContainer v-if="is3DMode" />
            </div>

            <div class="side-panel-wrapper" :class="{ 'collapsed': isSidePanelCollapsed }">
                <SidePanel :locationInfo="locationInfo" :selectedImage="selectedImage"
                    :isCollapsed="isSidePanelCollapsed" @news-changed="handleNewsChanged"
                    @toggle-panel="toggleSidePanel">
                    <template v-slot:extra-content>
                        <div class="extra-info">
                            <h3>提示</h3>
                            <p>缩放地图以查看更多细节</p>
                        </div>
                    </template>
                </SidePanel>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 
   CSS 样式 
*/
.home-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    background: #368a3a9e;
    overflow: hidden;
}

.top-section {
    height: 60px;
    /* Fixed height for top bar */
    flex-shrink: 0;
    width: 100%;
    background: #f5f5f5;
    z-index: 50;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.content-section {
    display: flex;
    flex: 1;
    width: 100%;
    height: calc(100vh - 60px);
    gap: 10px;
    padding: 10px;
    box-sizing: border-box;
    overflow: hidden;
}

.map-wrapper {
    flex: 1;
    background: #e6f7ff;
    border-radius: 12px;
    position: relative;
    overflow: hidden;
    display: flex;
    min-width: 0;
    /* Important for flex items to shrink */
}

.side-panel-wrapper {
    width: 350px;
    flex-shrink: 0;
    background: #f5f5f5;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: width 0.3s ease, height 0.3s ease;
}

.side-panel-wrapper.collapsed {
    width: 20px;
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
    .content-section {
        flex-direction: column;
        padding: 5px;
        gap: 5px;
    }

    .map-wrapper {
        flex: 1;
        /* Map takes available space */
        min-height: 50vh;
        /* Ensure map has height */
    }

    .side-panel-wrapper {
        width: 100%;
        height: 40vh;
        /* Fixed height for bottom panel on mobile */
        flex: none;
    }

    .side-panel-wrapper.collapsed {
        height: 24px;
        width: 100%;
    }
}

.extra-info {
    padding: 10px;
    background: #eee;
    border-radius: 4px;
    margin-top: 10px;
}
</style>