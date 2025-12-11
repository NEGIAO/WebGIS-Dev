<template>
    <div class="top-bar">
        <h1>
            <a href="https://negiao.github.io">
                <img :src="`${normalizedBase}images/icon.png`" alt="Icon" class="logo-icon">
                <span class="title-text">The science of where!</span>
            </a>
        </h1>
        <div class="controls">
            <input 
                type="file" 
                ref="fileInput" 
                style="display: none" 
                accept=".geojson,.json,.kml" 
                @change="handleFileUpload"
            >
            
            <div class="dropdown" @mouseenter="showDropdown = true" @mouseleave="showDropdown = false">
                <button class="nav-btn">
                    🛠️ 地图交互
                </button>
                <transition name="slide-fade">
                    <div class="dropdown-content" v-show="showDropdown">
                        <div class="dropdown-header">数据操作</div>
                        <a href="#" @click.prevent="triggerFileUpload">
                            <span class="icon">📂</span> 上传数据
                        </a>
                        
                        <div class="dropdown-header">测量工具</div>
                        <a href="#" @click.prevent="$emit('interaction', 'MeasureDistance')">
                            <span class="icon">📏</span> 距离测量
                        </a>
                        <a href="#" @click.prevent="$emit('interaction', 'MeasureArea')">
                            <span class="icon">📐</span> 面积测量
                        </a>
                        
                        <div class="dropdown-header">查询与标绘</div>
                        <a href="#" @click.prevent="$emit('interaction', 'AttributeQuery')">
                            <span class="icon">🔍</span> 属性查询
                        </a>
                        <a href="#" @click.prevent="$emit('interaction', 'Point')">
                            <span class="icon">📍</span> 绘制点
                        </a>
                        <a href="#" @click.prevent="$emit('interaction', 'LineString')">
                            <span class="icon">〰️</span> 绘制线
                        </a>
                        <a href="#" @click.prevent="$emit('interaction', 'Polygon')">
                            <span class="icon">⬠</span> 绘制面
                        </a>
                        
                        <div class="divider"></div>
                        <a href="#" @click.prevent="$emit('interaction', 'Clear')" class="danger-item">
                            <span class="icon">🗑️</span> 清除所有
                        </a>
                    </div>
                </transition>
            </div>

            <button class="nav-btn" @click="$emit('toggle-3d')">
                🌍 3D地球
            </button>
            <button class="nav-btn" @click="$emit('toggle-magic')">
                ✨ 魔法特效
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['toggle-magic', 'toggle-3d', 'upload-data', 'interaction']);
const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
const fileInput = ref(null);
const showDropdown = ref(false);

function triggerFileUpload() {
    fileInput.value.click();
    showDropdown.value = false;
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const extension = file.name.split('.').pop().toLowerCase();
        
        emit('upload-data', {
            content,
            type: extension,
            name: file.name
        });
        
        // Reset input so the same file can be selected again if needed
        event.target.value = '';
    };
    reader.readAsText(file);
}
</script>

<style scoped>
.top-bar {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, #4ac54e, #2E7D32);
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    box-sizing: border-box;
}

.controls {
    display: flex;
    gap: 10px;
    align-items: center;
}

.dropdown {
    position: relative;
    display: inline-block;
    height: 100%;
    display: flex;
    align-items: center;
}

.dropdown-content {
    display: block;
    position: absolute;
    background-color: rgba(32, 128, 69, 0.9); /* 深色背景，避免与地图混淆 */
    backdrop-filter: blur(10px);
    min-width: 200px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    z-index: 1000;
    border-radius: 12px;
    overflow: hidden;
    top: calc(100% + 5px);
    right: 0;
    margin-top: 0;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    transform-origin: top right;
}

.dropdown-header {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    padding: 8px 12px 4px 12px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.dropdown-content a {
    color: rgba(255, 255, 255, 0.9);
    padding: 10px 12px;
    text-decoration: none;
    display: flex;
    align-items: center;
    font-size: 14px;
    transition: all 0.2s ease;
    border-radius: 8px;
    margin-bottom: 2px;
    font-weight: 500;
}

.dropdown-content a .icon {
    margin-right: 10px;
    font-size: 16px;
    width: 20px;
    text-align: center;
}

.dropdown-content a:hover:not(.disabled) {
    background-color: rgba(255, 255, 255, 0.15);
    color: #fff;
    transform: translateX(5px);
}

.dropdown-content a.danger-item {
    color: #ff8a80;
}

.dropdown-content a.danger-item:hover {
    background-color: rgba(211, 47, 47, 0.2);
    color: #ff5252;
}

.dropdown-content a.disabled {
    color: rgba(255, 255, 255, 0.3);
    cursor: not-allowed;
    background-color: transparent;
}

.divider {
    height: 1px;
    background-color: rgba(255, 255, 255, 0.1);
    margin: 6px 0;
}

/* Transitions */
.slide-fade-enter-active {
    transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
    transition: all 0.2s cubic-bezier(1.0, 0.5, 0.8, 1.0);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
    transform: translateY(-10px);
    opacity: 0;
}

.nav-btn {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: white;
    padding: 6px 12px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 5px;
}

.nav-btn:hover {
    background: rgba(255, 255, 255, 0.4);
    transform: scale(1.05);
}

.top-bar h1 {
    margin: 0;
    display: flex;
    align-items: center;
    font-family: 'Times New Roman', Times, serif;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
}

.top-bar a {
    color: white;
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 10px;
}

.logo-icon {
    height: 40px;
    width: auto;
}

.title-text {
    font-size: 24px;
    font-weight: bold;
}

/* Mobile adjustments */
@media (max-width: 768px) {
    .top-bar {
        padding: 0 10px;
    }

    .top-bar h1 {
        font-size: 1.2rem;
    }

    .title-text {
        font-size: 18px;
    }

    .logo-icon {
        height: 30px;
    }
}
</style>
