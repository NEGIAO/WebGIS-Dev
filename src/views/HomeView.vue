<script setup>
import { ref, reactive } from 'vue';
import TopBar from '../components/TopBar.vue';
import MapContainer from '../components/MapContainer.vue';
import SidePanel from '../components/SidePanel.vue';

const locationInfo = reactive({
    isInDihuan: false,
    lonLat: [0, 0]
});
const selectedImage = ref('');
const currentNewsIndex = ref(0);

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
</script>

<template>
    <div class="home-container">
        <div class="top-section">
            <TopBar />
        </div>

        <div class="content-section">
            <div class="map-wrapper">
                <MapContainer 
                    @location-change="handleLocationChange"
                    @update-news-image="handleUpdateNewsImage"
                />
            </div>
            
            <div class="side-panel-wrapper">
                <SidePanel
                    :locationInfo="locationInfo"
                    :selectedImage="selectedImage"
                    @news-changed="handleNewsChanged"
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
    height: 100vh;
    width: 100vw;
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
}

.extra-info {
    padding: 10px;
    background: #eee;
    border-radius: 4px;
    margin-top: 10px;
}
</style>
