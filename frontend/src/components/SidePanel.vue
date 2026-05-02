<template>
    <div class="info-panel" :class="{ 'collapsed': isCollapsed, 'in-dihuan': props.locationInfo.isInDihuan }">
        <!-- 折叠开关 -->
        <div class="toggle-handle" @click="$emit('toggle-panel')" :title="isCollapsed ? '展开面板' : '收起面板'">
            <!-- 只用一个向左的箭头，通过动态 class 控制旋转 -->
            <svg class="handle-icon" :class="{ 'is-flipped': !isCollapsed }" viewBox="0 0 24 24" fill="none"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 19l-7-7 7-7" />
            </svg>
        </div>

        <!-- 面板内容区域 -->
        <div class="panel-content" v-show="!isCollapsed"
            :class="{ 'no-padding': activeTab === 'chat' || activeTab === 'toolbox' || activeTab === 'bus' || activeTab === 'drive' || activeTab === 'compass' }">
            <div class="active-feature-banner" v-if="activeFeature?.label">
                当前激活功能：{{ activeFeature.label }}
            </div>

            <!-- 模式 1: AI 聊天 -->
            <div v-show="activeTab === 'chat'" class="toolbox-content">
                <ChatPanelContent @close-chat="$emit('close-chat')" />
            </div>

            <!-- 模式 2: 工具箱 -->
            <div v-show="activeTab === 'toolbox'" class="toolbox-content">
                <ToolboxPanel :userLayers="userLayers" :baseLayers="baseLayers" :overview="toolboxOverview"
                    :uploadProgress="uploadProgress" :latest-search-poi="latestSearchPoi"
                    @close="$emit('switch-tab', 'info')" @upload-data="$emit('upload-data', $event)"
                    @interaction="$emit('interaction', $event)"
                    @toggle-layer-visibility="$emit('toggle-layer-visibility', $event)"
                    @change-layer-opacity="$emit('change-layer-opacity', $event)"
                    @set-base-layer="$emit('set-base-layer', $event)"
                    @toggle-base-layer-visibility="$emit('toggle-base-layer-visibility', $event)"
                    @toggle-layer-label-visibility="$emit('toggle-layer-label-visibility', $event)"
                    @zoom-layer="$emit('zoom-layer', $event)" @view-layer="$emit('view-layer', $event)"
                    @remove-layer="$emit('remove-layer', $event)"
                    @reorder-user-layers="$emit('reorder-user-layers', $event)"
                    @solo-layer="$emit('solo-layer', $event)"
                    @apply-style-template="$emit('apply-style-template', $event)"
                    @update-draw-style="$emit('update-draw-style', $event)"
                    @update-layer-style="$emit('update-layer-style', $event)"
                    @highlight-attribute-feature="$emit('highlight-attribute-feature', $event)"
                    @zoom-attribute-feature="$emit('zoom-attribute-feature', $event)"
                    @draw-point-by-coordinates="$emit('draw-point-by-coordinates', $event)"
                    @draw-amap-aoi-from-json="$emit('draw-amap-aoi-from-json', $event)"
                    @toggle-layer-crs="$emit('toggle-layer-crs', $event)"
                    @export-layer-data="$emit('export-layer-data', $event)" />
            </div>

            <!-- 模式 3: 公交规划 -->
            <div v-show="activeTab === 'bus'" class="toolbox-content">
                <BusPlannerPanel :token="tiandituToken" :start-bus-point-pick="startBusPointPick"
                    :draw-route-on-map="drawRouteOnMap" :zoom-to-bus-route-step="zoomToBusRouteStep"
                    :preview-bus-route-step="previewBusRouteStep"
                    :clear-bus-route-step-preview="clearBusRouteStepPreview" @close="$emit('switch-tab', 'info')" />
            </div>

            <!-- 模式 4: 驾车规划 -->
            <div v-show="activeTab === 'drive'" class="toolbox-content">
                <DrivingPlannerPanel :token="tiandituToken" :start-map-point-pick="startBusPointPick"
                    :draw-drive-route-on-map="drawDriveRouteOnMap" :zoom-to-drive-route-step="zoomToDriveRouteStep"
                    :preview-drive-route-step="previewDriveRouteStep"
                    :clear-drive-route-step-preview="clearDriveRouteStepPreview" @close="$emit('switch-tab', 'info')" />
            </div>

            <!-- 模式 5: 风水罗盘 -->
            <div v-show="activeTab === 'compass'" class="toolbox-content">
                <CompassControlPanel :get-user-location="getUserLocation" @close="$emit('switch-tab', 'info')" />
            </div>

            <!-- 模式 6: 新闻展示 (默认) -->
            <div v-if="activeTab === 'info'" class="info-content">
                <!-- 顶部 Logo 栏 -->
                <div class="panel-header">
                    <img :src="resolvePath('images/院徽.webp')" class="logo" alt="河南大学地理科学学院Logo" loading="lazy"
                        decoding="async">
                    <div class="title-wrapper">
                        <a :href="LINKS.MAIN_NEWS" target="_blank" class="main-title">地科院新闻</a>
                    </div>
                </div>

                <!-- 新闻标题 -->
                <div class="news-header">
                    <a :href="displayData.href" :target="displayData.isExternal ? '_blank' : '_self'">
                        {{ displayData.title }}
                    </a>
                </div>

                <!-- 图片展示区 -->
                <div class="image-container">
                    <img :src="displayData.image" class="news-image" :alt="displayData.title" loading="lazy"
                        decoding="async" fetchpriority="low" @error="handleNewsImageError">
                </div>

                <!-- 文本内容 -->
                <div class="text-content" v-html="displayData.text"></div>

                <!-- 交互按钮 -->
                <button class="action-button" @click="nextNews" title="切换下一条新闻">
                    点击，新闻++
                </button>

                <!-- 插槽：允许父组件插入额外内容 -->
                <slot name="extra-content"></slot>

                <!-- 访问统计，2026.3.9开始 -->
                <div style="height: 20px; display: flex; justify-content: center; align-items: center;">
                    <img src="https://visitor-badge.laobi.icu/badge?page_id=negiao.webgis" alt="visitor badge"
                        loading="lazy" decoding="async" />
                </div>

                <!-- 底部链接 -->
                <div class="panel-footer">
                    <a :href="LINKS.MAIN_NEWS" target="_blank">河南大学地理科学学院！</a>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * SidePanel.vue - 可折叠侧边栏组件
 * 
 * 功能：
 * - 新闻展示模式 (info)
 * - AI 聊天模式 (chat)
 * - 支持折叠/展开
 * - 移动端自适应
 */
import { ref, computed } from 'vue';
import ChatPanelContent from './ChatPanelContent.vue';
import ToolboxPanel from './TOCPanel.vue';
import BusPlannerPanel from './BusPlannerPanel.vue';
import DrivingPlannerPanel from './DrivingPlannerPanel.vue';
import CompassControlPanel from './CompassControlPanel.vue';

// ========== 1. 常量定义 ==========
const LINKS = {
    MAIN_NEWS: "https://cep.henu.edu.cn/zhxw/xyxw.htm"
};

// ========== 2. Props & Emits ==========
const props = defineProps({
    locationInfo: {
        type: Object,
        default: () => ({ isInDihuan: false, lonLat: [0, 0] })
    },
    selectedImage: {
        type: String,
        default: ''
    },
    activeTab: {
        type: String,
        default: 'info' // 'info' | 'chat' | 'toolbox' | 'bus' | 'drive' | 'compass'
    },
    isCollapsed: {
        type: Boolean,
        default: false
    },
    userLayers: {
        type: Array,
        default: () => []
    },
    baseLayers: {
        type: Array,
        default: () => []
    },
    toolboxOverview: {
        type: Object,
        default: () => ({ drawCount: 0, uploadCount: 0, layers: [] })
    },
    uploadProgress: {
        type: Object,
        default: () => ({ phase: 'idle' })
    },
    latestSearchPoi: {
        type: Object,
        default: () => ({})
    },
    activeFeature: {
        type: Object,
        default: () => ({ key: 'info', label: '新闻' })
    },
    getUserLocation: {
        type: Function,
        default: null
    },
    startBusPointPick: {
        type: Function,
        default: null
    },
    drawRouteOnMap: {
        type: Function,
        default: null
    },
    zoomToBusRouteStep: {
        type: Function,
        default: null
    },
    previewBusRouteStep: {
        type: Function,
        default: null
    },
    clearBusRouteStepPreview: {
        type: Function,
        default: null
    },
    drawDriveRouteOnMap: {
        type: Function,
        default: null
    },
    zoomToDriveRouteStep: {
        type: Function,
        default: null
    },
    previewDriveRouteStep: {
        type: Function,
        default: null
    },
    clearDriveRouteStepPreview: {
        type: Function,
        default: null
    }
});

const tiandituToken = import.meta.env.VITE_TIANDITU_TK;

const emit = defineEmits([
    'news-changed',
    'toggle-panel',
    'close-chat',
    'switch-tab',
    'upload-data',
    'interaction',
    'toggle-layer-visibility',
    'change-layer-opacity',
    'set-base-layer',
    'toggle-base-layer-visibility',
    'toggle-layer-label-visibility',
    'zoom-layer',
    'view-layer',
    'remove-layer',
    'reorder-user-layers',
    'solo-layer',
    'apply-style-template',
    'update-draw-style',
    'update-layer-style',
    'highlight-attribute-feature',
    'zoom-attribute-feature',
    'draw-point-by-coordinates',
    'draw-amap-aoi-from-json',
    'toggle-layer-crs',
    'export-layer-data'
]);

// ========== 3. 工具函数 ==========
const baseUrl = import.meta.env.BASE_URL || '/';
const resolvePath = (path) => {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${base}${path}`;
};

// ========== 4. 新闻数据源 ==========
const NEWS_LIST = [
    {
        title: "4.22地球日，地环院开展系列活动",
        text: "春风拂绿野，万物竞芳华。在第56个世界地球日来临之际，4月21日上午，由河南大学相关单位主办，在金明校区马可广场举行。学校相关职能部门领导，地理科学与工程学部委员，地理科学学院全体班子成员和师生代表...",
        image: "images/地球日活动.webp",
        href: "https://cep.henu.edu.cn/info/1022/13421.htm"
    },
    {
        title: "地理科学与工程学部首届大会召开",
        text: "2025年2月23日，河南大学地理科学与工程学部首届大会在河南大学金明校区锥形报告厅顺利召开。中国工程院院士、空间基准全国重点实验室学术带头人王家耀等职能部门有关领导...",
        image: "images/学部大会.webp",
        href: "https://cep.henu.edu.cn/info/1022/12491.htm"
    },
    {
        title: "2023级本科生年级大会召开",
        text: "为助力我院2023级本科生厘清学术培养路径，系统提升科研素养与安全防范能力，树立科学的学术发展与职业规划意识，5月29日下午，我院于金明校区综合教学楼2306教室召开...",
        image: "images/年级大会.webp",
        href: "https://cep.henu.edu.cn/info/1022/14001.htm"
    },
];

const DEFAULT_STATE = {
    title: "地科院新闻",
    text: "请将鼠标移动到地科院区域<br>查看新闻内容<br><br>在左侧地图中放大<br>可以查看地科院的照片！<br><br>下方还有内容哦！<br>请鼠标下滑",
    image: "images/院徽.webp",
    href: LINKS.MAIN_NEWS,
    isExternal: true
};

const defaultNewsImage = resolvePath(DEFAULT_STATE.image);

// ========== 5. 状态管理 ==========
const currentNewsIndex = ref(0);
const shouldLoadNewsImage = computed(() => (
    props.activeTab === 'info' && (props.locationInfo.isInDihuan || Boolean(props.selectedImage))
));

// ========== 6. 计算属性 ==========
/**
 * 核心逻辑：统一决定当前应该显示什么数据
 * - 如果不在指定区域，显示默认提示
 * - 如果在区域内，显示当前新闻
 */
const displayData = computed(() => {
    if (!props.locationInfo.isInDihuan) {
        return {
            ...DEFAULT_STATE,
            image: shouldLoadNewsImage.value && props.selectedImage ? props.selectedImage : defaultNewsImage
        };
    }

    const currentItem = NEWS_LIST[currentNewsIndex.value];
    return {
        title: currentItem.title,
        text: currentItem.text,
        image: shouldLoadNewsImage.value
            ? (props.selectedImage || resolvePath(currentItem.image))
            : defaultNewsImage,
        href: currentItem.href,
        isExternal: true
    };
});

// ========== 7. 事件处理 ==========
/** 切换到下一条新闻 */
function nextNews() {
    currentNewsIndex.value = (currentNewsIndex.value + 1) % NEWS_LIST.length;
    emit('news-changed', currentNewsIndex.value);
}

function handleNewsImageError(event) {
    const target = event?.target;
    if (!target || typeof target.src !== 'string') return;
    if (!target.src.includes(DEFAULT_STATE.image)) {
        target.src = defaultNewsImage;
    }
}
</script>

<style scoped>
/* 布局容器 */
.info-panel {
    display: flex;
    flex-direction: row;
    height: 100%;
    background: #fff;
    overflow: hidden;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
    transition: width 0.3s ease;
    overflow: visible !important;
    position: relative;
}

/* 折叠手柄 */
.toggle-handle {
    background-color: transparent;
    width: 30px;
    height: 60px;
    align-self: center;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 12px 0 0 12px;
    transition: all 0.2s ease;
    z-index: 9999;

    /* 👇 向左偏移 15px 核心代码 */
    position: absolute;
    left: -30px;
    top: 50%;
    transform: translateY(-50%);
}

.toggle-handle:hover {
    background: #03431fc1;
    width: 30px;
}

.handle-icon {
    font-size: 12px;
    color: #0fb549;
    font-weight: bold;
    width: 20px;
    height: 20px;
    /* 增加平滑的过渡动画 */
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.handle-icon.is-flipped {
    transform: rotate(180deg);
}

/* 内容区域 */
.panel-content {
    flex: 1;
    /* padding: 20px;  Removed: Moved to .info-content */
    /* overflow-y: auto; Removed: Moved to .info-content */
    display: flex;
    flex-direction: column;
    min-width: 300px;
    height: 100%;
    overflow: hidden;
}

.active-feature-banner {
    padding: 8px 14px;
    background: linear-gradient(30deg, rgba(235, 222, 222, 0), #26bd58a3);
    color: #239c42;
    font-size: 12px;
    font-weight: 600;
}

.toolbox-content {
    flex: 1;
    overflow-y: auto;
    background: #fff;
}

.panel-content.no-padding {
    padding: 0;
}

.info-content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

/* 头部 */
.panel-header {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 10px;
}

.logo {
    width: 50px;
    height: 50px;
    object-fit: contain;
    margin-right: 15px;
}

.main-title {
    font-family: 'Courier New', Courier, monospace;
    font-size: 25px;
    color: #1f5eac;
    text-decoration: none;
    font-weight: 700;
}

/* 新闻标题 */
.news-header {
    font-size: 18px;
    margin: 10px 0;
    font-weight: bold;
    line-height: 1.4;
    min-height: 50px;
    /* 保持高度稳定，防止跳动 */
}

.news-header a {
    color: #2746ae;
    text-decoration: none;
    transition: color 0.2s;
}

.news-header a:hover {
    color: #1a2f75;
    text-decoration: underline;
}

/* 图片 */
.image-container {
    width: 100%;
    border-radius: 8px;
    /* 不裁剪图片，改为居中显示完整图片 */
    overflow: visible;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.news-image {
    width: 100%;
    height: auto;
    /* 始终完整显示（不裁剪） */
    object-fit: contain;
    display: block;
    transition: transform 0.25s ease, max-height 0.25s ease;
    max-height: 60vh;
}

.news-image:hover {
    transform: scale(1.01);
}

/* 文本 */
.text-content {
    font-size: 14px;
    color: #444;
    line-height: 1.6;
    margin-bottom: 15px;
    flex-grow: 1;
}

/* 按钮 */
.action-button {
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 12px;
    font-size: 16px;
    cursor: pointer;
    border-radius: 6px;
    transition: background-color 0.2s, transform 0.1s;
    box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
}

.action-button:hover {
    background-color: #43a047;
}

.action-button:active {
    transform: translateY(1px);
}

/* 底部 */
.panel-footer {
    margin-top: auto;
    text-align: center;
    padding-top: 15px;
    border-top: 1px solid #eee;
    font-size: 12px;
}

.panel-footer a {
    color: #999;
    text-decoration: none;
    transition: color 0.2s;
}

.panel-footer a:hover {
    color: #1c8ae4;
}

/* 移动端适配 */
@media (max-width: 768px) {
    .info-panel {
        flex-direction: column;
        /* 垂直排列 */
        width: 100% !important;
        transition: transform 0.3s ease;
        /* 改为 transform 动画更流畅 */
        /* 关键修复：移动端允许内容溢出，防止按钮被切掉 */
        overflow: visible;
    }

    /* 收起状态下的特殊处理 */
    .info-panel.collapsed {
        /* 这里假设你的面板是在底部，收起时往下移，只保留按钮高度 */
        /* 如果你的面板是根据高度变化的，请保留 height: auto */
        height: auto;
    }

    .toggle-handle {
        width: 80px;
        height: 30px;
        align-self: center;
        border-radius: 15px 15px 0 0;
        margin-top: 0;
        margin-bottom: 0;
        order: -1;

        /* 👇 核心：居中 + 向上偏移 30px */
        position: relative;
        top: -30px;
        transform: translateX(25%);
    }

    .handle-icon {
        /* 旋转箭头方向，使其指向合适的方向 */
        transform: rotate(90deg);
        font-size: 14px;
    }

    .handle-icon.is-flipped {
        transform: rotate(-90deg);
    }

    .panel-content {
        min-width: unset;
        /* padding: 15px; Removed */
        max-height: 60vh;
        /* overflow-y: auto; Removed */
    }

    .info-content {
        padding: 15px;
        overflow-y: auto;
    }
}
</style>