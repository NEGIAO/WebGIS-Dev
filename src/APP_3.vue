<script setup>
    import { ref, reactive } from 'vue';

    import Top_info from './components/Top_info_3.vue';
    import WebGIS from './components/WebGIS_3.vue';
    import Right_info from './components/Right_info_3.vue';

    // 共享状态
    const locationInfo = reactive({
        isInDihuan: false,
        lonLat: [0, 0]
    });
    const selectedImage = ref('');
    const currentNewsIndex = ref(0);

    // 处理地图位置变化
    function handleLocationChange(locationData) {
        Object.assign(locationInfo, locationData);
    }

    // 处理新闻图片更新
    function handleUpdateNewsImage(imageSrc) {
        selectedImage.value = imageSrc;
    }

    // 处理新闻索引变化
    function handleNewsChanged(newsIndex) {
        currentNewsIndex.value = newsIndex;
        console.log('News changed to index:', newsIndex);
    }
</script>

<template>
    <div class="main-container">
        <!-- 顶部导航 -->
        <div class="top-container">
            <Top_info />
        </div>
        
        <!-- 设置一个div,实现地图和信息栏的水平组合 -->
        <div class="content-row">
            <!-- 地图 -->
            <WebGIS 
                @location-change="handleLocationChange"
                @update-news-image="handleUpdateNewsImage"
            />
            
            <!-- 右侧信息组件 -->
            <Right_info
                :locationInfo="locationInfo"
                :selectedImage="selectedImage"
                @news-changed="handleNewsChanged"
            >
                <!-- 使用具名插槽传递额外内容 -->
                <template v-slot:extra-content>
                    <h3>最新新闻</h3>
                    <select>
                        <option> 84</option>
                        <option> 85</option>
                    </select>
                </template>
            </Right_info>
        </div>
    </div>
</template>

<style>
/* 设置全部样式文件 */
html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #666666;
    background: #ffffff;
    height: 100%;
    zoom: 1;
    -ms-zoom: 1;
    -webkit-text-size-adjust: 80%;
    overflow-x: hidden;
}

.main-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    box-sizing: border-box;
    background: #368a3a9e;
    justify-content: center;
}

.top-container {
    height: 56px;
    width: 100%;
    background: #f5f5f5;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    font-size: 22px;
    font-weight: bold;
    letter-spacing: 2px;
    box-sizing: border-box;
    margin-bottom: 8px;
    position: relative;
}
.content-row {
    display: flex;
    flex: 1;
    width: 100%;
    gap: 10px;
}

.map-container {
    flex: 1;
    min-width: 600px;
    background: #e6f7ff;
    border-radius: 12px;
    position: relative;
    overflow: hidden;
    display: flex;
}

.info-container {
    width: 380px;
    background: #f5f5f5;
    padding: 24px 16px;
    box-sizing: border-box;
    border-radius: 12px;
    border-left: 2px solid #13af1077;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    position: relative; 
}
</style>