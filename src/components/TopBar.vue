<template>
    <div class="top-bar">
        <!-- 左侧：Logo与标题 -->
        <div class="branding">
            <a href="../index.html" class="logo-link">
                <img :src="`${normalizedBase}images/icon.png`" alt="Icon" class="logo-icon" />
                <span class="title-text">The Science of Where</span>
            </a>
        </div>

        <!-- 右侧：控制区 -->
        <div class="controls">
            <!-- 隐藏的文件上传 Input -->
            <input type="file" ref="fileInput" class="hidden-input" accept=".geojson,.json,.kml"
                @change="handleFileUpload" />

            <!-- 1. 地图交互下拉菜单 -->
            <div class="dropdown-wrapper">
                <button class="nav-btn dropdown-trigger">
                    <span class="btn-icon">🛠️</span>
                    <span class="btn-text">工具箱</span>
                </button>

                <transition name="fade-slide">
                    <div class="dropdown-menu">
                        <div class="menu-scroll-container">
                            <!-- 数据操作 -->
                            <div class="menu-group">
                                <div class="group-title">数据</div>
                                <div class="menu-item" @click="triggerFileUpload">
                                    <span class="icon">📂</span> 上传数据 (GeoJSON/KML)
                                </div>
                            </div>

                            <!-- 测量工具 -->
                            <div class="menu-group">
                                <div class="group-title">测量</div>
                                <div class="menu-item" @click="$emit('interaction', 'MeasureDistance')">
                                    <span class="icon">📏</span> 距离测量
                                </div>
                                <div class="menu-item" @click="$emit('interaction', 'MeasureArea')">
                                    <span class="icon">📐</span> 面积测量
                                </div>
                            </div>

                            <!-- 标绘工具 -->
                            <div class="menu-group">
                                <div class="group-title">标绘 & 查询</div>
                                <div class="menu-item" @click="$emit('interaction', 'AttributeQuery')">
                                    <span class="icon">🔍</span> 属性查询
                                </div>
                                <div class="menu-item" @click="$emit('interaction', 'Point')">
                                    <span class="icon">📍</span> 绘制点
                                </div>
                                <div class="menu-item" @click="$emit('interaction', 'LineString')">
                                    <span class="icon">〰️</span> 绘制线
                                </div>
                                <div class="menu-item" @click="$emit('interaction', 'Polygon')">
                                    <span class="icon">⬠</span> 绘制面
                                </div>
                            </div>

                            <!-- 危险操作 -->
                            <div class="menu-group">
                                <div class="menu-item danger" @click="$emit('interaction', 'Clear')">
                                    <span class="icon">🗑️</span> 清除所有覆盖物
                                </div>
                            </div>
                        </div>
                    </div>
                </transition>
            </div>

            <!-- 2. 独立功能按钮 -->
            <button class="nav-btn" @click="$emit('toggle-3d')" title="切换2D/3D视图">
                <span class="btn-icon">🌍</span>
                <span class="btn-text">3D视图</span>
            </button>

            <button class="nav-btn magic-btn" @click="$emit('toggle-magic')" title="开启魔法特效">
                <span class="btn-icon">✨</span>
                <span class="btn-text">特效</span>
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['toggle-magic', 'toggle-3d', 'upload-data', 'interaction']);

// 路径处理
const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

const fileInput = ref(null);

function triggerFileUpload() {
    fileInput.value?.click();
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

        // 清空 input 允许重复上传同名文件
        event.target.value = '';
    };

    try {
        reader.readAsText(file);
    } catch (err) {
        console.error("File read error", err);
        alert("文件读取失败");
    }
}
</script>

<style scoped>
/* --- 布局容器 --- */
.top-bar {
    width: 100%;
    height: 60px;
    /* 固定高度，防止布局抖动 */
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;

    /* 现代毛玻璃风格背景 */
    background: #4CAF50;
    /* 深绿色半透明 */
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    z-index: 2000;
    position: relative;
}

/* --- 左侧 Branding --- */
.branding {
    flex-shrink: 0;
}

.logo-link {
    display: flex;
    align-items: center;
    text-decoration: none;
    color: #fff;
    gap: 12px;
}

.logo-icon {
    height: 36px;
    width: auto;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    transition: transform 0.3s;
}

.logo-link:hover .logo-icon {
    transform: rotate(-10deg) scale(1.1);
}

.title-text {
    font-family: 'Cinzel', 'Times New Roman', serif;
    /* 更有质感的字体 */
    font-size: 25px;
    font-weight: 700;
    letter-spacing: 1px;
    background: linear-gradient(to bottom, #fff, #e0e0e0);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* --- 右侧 Controls --- */
.controls {
    display: flex;
    align-items: center;
    gap: 12px;
}

.hidden-input {
    display: none;
}

/* 按钮通用样式 */
.nav-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #eee;
    padding: 8px 16px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.3s ease;
    white-space: nowrap;
}

.nav-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    color: #fff;
}

.nav-btn:active {
    transform: translateY(1px);
}

/* 特效按钮特殊样式 */
.magic-btn:hover {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 105, 180, 0.2));
    border-color: rgba(255, 215, 0, 0.4);
    text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
}

/* --- Dropdown 菜单逻辑 --- */
.dropdown-wrapper {
    position: relative;
    height: 100%;
    display: flex;
    align-items: center;
}

/* 透明桥梁：防止鼠标从按钮移向菜单时断触 */
.dropdown-wrapper::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    height: 15px;
    /* 桥接区域高度 */
}

.dropdown-menu {
    position: absolute;
    top: calc(100% + 10px);
    right: -20px;
    /* 向右对齐稍微偏移一点 */
    width: 240px;
    background: rgba(16, 115, 65, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 0;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    visibility: hidden;
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}

/* CSS Hover 触发显示 */
.dropdown-wrapper:hover .dropdown-menu {
    visibility: visible;
    opacity: 1;
    transform: translateY(0);
}

.menu-scroll-container {
    max-height: 80vh;
    overflow-y: auto;
}

.menu-group {
    padding: 4px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.menu-group:last-child {
    border-bottom: none;
}

.group-title {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    padding: 4px 16px;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
}

.menu-item {
    padding: 10px 16px;
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    display: flex;
    align-items: center;
    font-size: 14px;
    transition: background 0.2s;
}

.menu-item:hover {
    background: rgba(74, 197, 78, 0.2);
    color: #fff;
}

.menu-item .icon {
    margin-right: 10px;
    width: 20px;
    text-align: center;
}

.menu-item.danger {
    color: #ff8a80;
}

.menu-item.danger:hover {
    background: rgba(255, 82, 82, 0.15);
}

/* --- 移动端适配--- */
@media (max-width: 768px) {
    .top-bar {
        padding: 0 12px;
    }

    /* 隐藏标题文字，保留Logo */
    .title-text {
        /* display: none; */
        font-size: 18px;
    }

    .controls {
        gap: 8px;
    }

    .nav-btn {
        padding: 8px;
        /* 缩小按钮内边距 */
    }

    /* 隐藏按钮文字，只显示图标 */
    .btn-text {
        display: none;
    }

    .btn-icon {
        font-size: 18px;
        /* 图标放大一点 */
    }

    .dropdown-menu {
        right: -50px;
        /* 移动端菜单位置调整 */
        width: 200px;
    }
}
</style>