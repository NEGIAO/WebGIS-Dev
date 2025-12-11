<script setup>
import { ref, reactive } from 'vue';
import TopBar from '../components/TopBar.vue';
import MapContainer from '../components/MapContainer.vue';
import SidePanel from '../components/SidePanel.vue';
import CesiumContainer from '../components/CesiumContainer.vue';
import MagicCursor from '../components/MagicCursor.vue';

const locationInfo = reactive({
    isInDihuan: false,
    lonLat: [0, 0]
});
const selectedImage = ref('');
const currentNewsIndex = ref(0);
const is3DMode = ref(false);
const isMagicMode = ref(false);
const mapContainerRef = ref(null);
const isSidePanelCollapsed = ref(false);

function handleLocationChange(locationData) {
    Object.assign(locationInfo, locationData);
}

function handleUpdateNewsImage(imageSrc) {
    selectedImage.value = imageSrc;
}

function handleNewsChanged(newsIndex) {
    currentNewsIndex.value = newsIndex;
    console.log('News changed to index:', newsIndex);
}

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
    if (mapContainerRef.value) {
        mapContainerRef.value.addUserDataLayer(data);
    }
}

function handleInteraction(type) {
    if (mapContainerRef.value) {
        mapContainerRef.value.activateInteraction(type);
    }
}

function handleFeatureSelected(properties) {
    // Format properties for display
    let content = '<h4>要素属性</h4><div style="max-height: 300px; overflow-y: auto;">';
    for (const key in properties) {
        content += `<strong>${key}:</strong> ${properties[key]}<br>`;
    }
    content += '</div>';
    
    // We can reuse the SidePanel or just alert for now. 
    // Since SidePanel is complex, let's use a simple alert or maybe a custom modal later.
    // For now, let's just log it and maybe show a simple alert to prove it works.
    // Or better, update a reactive variable that SidePanel can display?
    // The user didn't ask for a specific UI for attributes, just "Attribute Query".
    // Let's try to be nice and show it in an alert for simplicity as a first step.
    // Actually, let's use a more modern approach if possible, but alert is safe.
    // Wait, I can add a "featureInfo" prop to SidePanel?
    // Let's just use alert for now to keep it simple and robust.
    // alert(JSON.stringify(properties, null, 2));
    
    // Better: Use a simple dialog or overlay. 
    // But I don't want to add too much UI code.
    // Let's stick to alert but formatted nicely.
    let msg = "要素属性:\n";
    for (const key in properties) {
        msg += `${key}: ${properties[key]}\n`;
    }
    alert(msg);
}
</script>

<template>
    <div class="home-container">
        <MagicCursor :active="isMagicMode" />
        <div class="top-section">
            <TopBar 
                @toggle-magic="toggleMagic" 
                @toggle-3d="toggle3D" 
                @upload-data="handleUploadData"
                @interaction="handleInteraction"
            />
        </div>

        <div class="content-section">
            <div class="map-wrapper">
                <MapContainer 
                    ref="mapContainerRef"
                    v-show="!is3DMode"
                    @location-change="handleLocationChange"
                    @update-news-image="handleUpdateNewsImage"
                    @feature-selected="handleFeatureSelected"
                />
                <CesiumContainer v-if="is3DMode" />
            </div>
            
            <div class="side-panel-wrapper" :class="{ 'collapsed': isSidePanelCollapsed }">
                <SidePanel
                    :locationInfo="locationInfo"
                    :selectedImage="selectedImage"
                    :isCollapsed="isSidePanelCollapsed"
                    @news-changed="handleNewsChanged"
                    @toggle-panel="toggleSidePanel"
                >
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
    height: 60px; /* Fixed height for top bar */
    flex-shrink: 0;
    width: 100%;
    background: #f5f5f5;
    z-index: 50;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
    min-width: 0; /* Important for flex items to shrink */
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
        flex: 1; /* Map takes available space */
        min-height: 50vh; /* Ensure map has height */
    }

    .side-panel-wrapper {
        width: 100%;
        height: 40vh; /* Fixed height for bottom panel on mobile */
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
