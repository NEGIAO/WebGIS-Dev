<script setup>
/**
 * HomeView.vue - 主页面组件
 * 
 * 功能：
 * - 2D/3D 地图切换
 * - AI 助手集成
 * - 新闻侧边栏展示
 * - 鼠标特效
 */
import { ref, reactive, defineAsyncComponent } from 'vue';

// ========== 1. 组件导入 ==========
// 同步导入：核心 2D 地图及 UI 组件 (保证首屏速度)
import TopBar from '../components/TopBar.vue';
import MapContainer from '../components/MapContainer.vue';
import MagicCursor from '../components/MagicCursor.vue';

// 异步导入：Cesium 组件 (优化：只有切换到 3D 模式时才加载库)
const CesiumContainer = defineAsyncComponent(() =>
    import('../components/CesiumContainer.vue')
);

// 异步导入：SidePanel 组件 (优化：延迟加载图片资源)
const SidePanel = defineAsyncComponent(() =>
    import('../components/SidePanel.vue')
);

// ========== 2. 响应式状态 ==========
// 地图位置信息
const locationInfo = reactive({
    isInDihuan: false,
    lonLat: [0, 0]
});

// UI 状态
const selectedImage = ref('');
const currentNewsIndex = ref(0);
const is3DMode = ref(false);
const isMagicMode = ref(false);
const isSidePanelCollapsed = ref(true);
const shouldLoadSidePanel = ref(false);
const activeSidePanelTab = ref('info'); // 'info' | 'chat'

// 组件引用
const mapContainerRef = ref(null);

// ========== 3. 事件处理函数 ==========

/** 地图位置变化处理 */
function handleLocationChange(locationData) {
    Object.assign(locationInfo, locationData);
}

/** 更新新闻图片 */
function handleUpdateNewsImage(imageSrc) {
    selectedImage.value = imageSrc;
}

/** 新闻切换处理 */
function handleNewsChanged(newsIndex) {
    currentNewsIndex.value = newsIndex;
}

/** 切换侧边栏展开/收起 */
function toggleSidePanel() {
    // 首次展开时才加载SidePanel组件及其资源
    if (isSidePanelCollapsed.value && !shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = !isSidePanelCollapsed.value;
}

/** 打开 AI 聊天面板 */
function openChat() {
    activeSidePanelTab.value = 'chat';
    if (!shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = false;
}

/** 关闭 AI 聊天，切换回新闻模式 */
function handleCloseChat() {
    activeSidePanelTab.value = 'info';
}

/** 切换 2D/3D 视图 */
function toggle3D() {
    is3DMode.value = !is3DMode.value;
}

/** 切换鼠标特效 */
function toggleMagic() {
    isMagicMode.value = !isMagicMode.value;
}

/** 处理文件上传 */
function handleUploadData(data) {
    mapContainerRef.value?.addUserDataLayer(data);
}

/** 处理地图交互工具 */
function handleInteraction(type) {
    mapContainerRef.value?.activateInteraction(type);
}

/** 处理要素选中事件 */
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
                @interaction="handleInteraction" @open-chat="openChat" />
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
                <!-- 使用v-if延迟加载SidePanel，避免初始化时加载大量图片资源 -->
                <SidePanel v-if="shouldLoadSidePanel" :locationInfo="locationInfo" :selectedImage="selectedImage"
                    :isCollapsed="isSidePanelCollapsed" :activeTab="activeSidePanelTab"
                    @news-changed="handleNewsChanged" @toggle-panel="toggleSidePanel"
                    @close-chat="handleCloseChat">
                    <template v-slot:extra-content>
                        <div class="extra-info">
                            <h3>提示</h3>
                            <p>缩放地图以查看更多细节</p>
                        </div>
                    </template>
                </SidePanel>
                <!-- 未加载时显示展开提示 -->
                <div v-else class="panel-placeholder" @click="toggleSidePanel">
                    <div class="placeholder-content">
                        <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                        </svg>
                        <span class="placeholder-text">展开</span>
                    </div>
                </div>
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

/* 侧边栏占位符样式 */
.panel-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: linear-gradient(135deg, rgba(24, 144, 255, 0.05) 0%, rgba(24, 144, 255, 0.15) 100%);
    border-left: 3px solid rgba(24, 144, 255, 0.3);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
}

.panel-placeholder::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transition: left 0.6s ease;
}

.panel-placeholder:hover {
    background: linear-gradient(135deg, rgba(24, 144, 255, 0.1) 0%, rgba(24, 144, 255, 0.25) 100%);
    border-left-color: rgba(24, 144, 255, 0.6);
    box-shadow: inset 0 0 20px rgba(24, 144, 255, 0.1);
}

.panel-placeholder:hover::before {
    left: 100%;
}

.panel-placeholder:active {
    transform: scale(0.98);
}

.placeholder-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 6px;
}

.placeholder-icon {
    width: 28px;
    height: 28px;
    color: #1890ff;
    transition: all 0.3s ease;
    filter: drop-shadow(0 2px 4px rgba(24, 144, 255, 0.2));
}

.panel-placeholder:hover .placeholder-icon {
    color: #096dd9;
    transform: translateX(-3px);
    filter: drop-shadow(0 3px 6px rgba(24, 144, 255, 0.4));
}

.placeholder-text {
    writing-mode: vertical-rl;
    font-size: 13px;
    font-weight: 600;
    color: #1890ff;
    letter-spacing: 2px;
    text-shadow: 0 1px 2px rgba(24, 144, 255, 0.1);
    transition: all 0.3s ease;
}

.panel-placeholder:hover .placeholder-text {
    color: #096dd9;
    text-shadow: 0 2px 4px rgba(24, 144, 255, 0.2);
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
        height: 40px;
        width: 100%;
    }

    /* 移动端占位符横向布局 */
    .placeholder-content {
        flex-direction: row;
        padding: 8px 16px;
        justify-content: center;
    }

    .placeholder-icon {
        width: 24px;
        height: 24px;
        transform: rotate(90deg);
    }

    .panel-placeholder:hover .placeholder-icon {
        transform: rotate(90deg) translateY(-3px);
    }

    .placeholder-text {
        writing-mode: horizontal-tb;
        font-size: 14px;
        letter-spacing: 1px;
    }
}

.extra-info {
    padding: 10px;
    background: #eee;
    border-radius: 4px;
    margin-top: 10px;
}
</style>