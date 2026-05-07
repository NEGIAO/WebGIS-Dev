<template>
    <div
        class="info-panel"
        :class="{ collapsed: isCollapsed, 'in-dihuan': props.locationInfo.isInDihuan }"
    >
        <!-- 折叠开关 -->
        <div
            class="toggle-handle"
            @click="$emit('toggle-panel')"
            :title="isCollapsed ? '展开面板' : '收起面板'"
        >
            <!-- 只用一个向左的箭头，通过动态 class 控制旋转 -->
            <svg
                class="handle-icon"
                :class="{ 'is-flipped': !isCollapsed }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 19l-7-7 7-7"
                />
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 19l-7-7 7-7"
                />
            </svg>
        </div>

        <!-- 面板内容区域 -->
        <div
            class="panel-content"
            v-show="!isCollapsed"
            :class="{
                'no-padding':
                    activeTab === 'chat' ||
                    activeTab === 'toolbox' ||
                    activeTab === 'bus' ||
                    activeTab === 'drive' ||
                    activeTab === 'compass' ||
                    activeTab === 'info',
            }"
        >
            <div
                class="active-feature-banner"
                v-if="activeFeature?.label && activeTab !== 'info'"
            >
                当前激活功能：{{ activeFeature.label }}
            </div>

            <!-- 模式 1: AI 聊天 -->
            <div
                v-show="activeTab === 'chat'"
                class="toolbox-content"
            >
                <ChatPanelContent @close-chat="$emit('close-chat')" />
            </div>

            <!-- 模式 2: 工具箱 -->
            <div
                v-show="activeTab === 'toolbox'"
                class="toolbox-content"
            >
                <ToolboxPanel
                    :userLayers="userLayers"
                    :baseLayers="baseLayers"
                    :overview="toolboxOverview"
                    :default-tab="toolboxTab"
                    :uploadProgress="uploadProgress"
                    :latest-search-poi="latestSearchPoi"
                    @close="$emit('switch-tab', 'info')"
                    @upload-data="$emit('upload-data', $event)"
                    @interaction="$emit('interaction', $event)"
                    @toggle-layer-visibility="$emit('toggle-layer-visibility', $event)"
                    @change-layer-opacity="$emit('change-layer-opacity', $event)"
                    @set-base-layer="$emit('set-base-layer', $event)"
                    @toggle-base-layer-visibility="$emit('toggle-base-layer-visibility', $event)"
                    @toggle-layer-label-visibility="$emit('toggle-layer-label-visibility', $event)"
                    @zoom-layer="$emit('zoom-layer', $event)"
                    @view-layer="$emit('view-layer', $event)"
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
                    @export-layer-data="$emit('export-layer-data', $event)"
                    @request-download-extent="$emit('request-download-extent')"
                />
            </div>

            <!-- 模式 3: 公交规划 -->
            <div
                v-show="activeTab === 'bus'"
                class="toolbox-content"
            >
                <BusPlannerPanel
                    :token="tiandituToken"
                    :start-bus-point-pick="startBusPointPick"
                    :draw-route-on-map="drawRouteOnMap"
                    :zoom-to-bus-route-step="zoomToBusRouteStep"
                    :preview-bus-route-step="previewBusRouteStep"
                    :clear-bus-route-step-preview="clearBusRouteStepPreview"
                    @close="$emit('switch-tab', 'info')"
                />
            </div>

            <!-- 模式 4: 驾车规划 -->
            <div
                v-show="activeTab === 'drive'"
                class="toolbox-content"
            >
                <DrivingPlannerPanel
                    :token="tiandituToken"
                    :start-map-point-pick="startBusPointPick"
                    :draw-drive-route-on-map="drawDriveRouteOnMap"
                    :zoom-to-drive-route-step="zoomToDriveRouteStep"
                    :preview-drive-route-step="previewDriveRouteStep"
                    :clear-drive-route-step-preview="clearDriveRouteStepPreview"
                    @close="$emit('switch-tab', 'info')"
                />
            </div>

            <!-- 模式 5: 风水罗盘 -->
            <div
                v-show="activeTab === 'compass'"
                class="toolbox-content"
            >
                <CompassControlPanel
                    :get-user-location="getUserLocation"
                    @close="$emit('switch-tab', 'info')"
                />
            </div>

            <!-- 模式 6: 热点新闻 -->
            <div
                v-show="activeTab === 'info'"
                class="news-dashboard"
            >
                <div class="news-header-bar">
                    <span class="news-logo">Hot News</span>
                    <span class="news-subtitle">{{ currentPlatformLabel }} 实时热点</span>
                </div>

                <!-- 平台标签 -->
                <div class="news-platform-tabs">
                    <button
                        v-for="p in newsPlatforms"
                        :key="p.key"
                        class="platform-chip"
                        :class="{ active: currentPlatform === p.key }"
                        @click="switchNewsPlatform(p.key)"
                    >
                        {{ p.label }}
                    </button>
                </div>

                <!-- 加载状态 -->
                <div
                    v-if="newsLoading"
                    class="news-loading"
                >
                    <div class="loading-dot-pulse"></div>
                    <span>获取热点中...</span>
                </div>

                <!-- 新闻列表 -->
                <div
                    v-else
                    class="news-list"
                >
                    <a
                        v-for="(item, idx) in newsItems"
                        :key="idx"
                        :href="item.url"
                        target="_blank"
                        class="news-card"
                    >
                        <div
                            class="news-rank"
                            :class="rankClass(idx)"
                        >
                            {{ idx + 1 }}
                        </div>
                        <div class="news-body">
                            <div class="news-title">{{ item.title }}</div>
                            <div
                                class="news-meta"
                                v-if="item.desc || item.content"
                            >
                                <span class="news-desc">{{ item.desc || item.content }}</span>
                            </div>
                        </div>
                        <div
                            class="news-score"
                            v-if="item.score || item.publish_time"
                        >
                            <span class="score-value">{{
                                item.publish_time
                                    ? item.publish_time.slice(-8)
                                    : formatScore(item.score)
                            }}</span>
                        </div>
                    </a>
                    <div
                        v-if="!newsItems.length && !newsLoading"
                        class="news-empty"
                    >
                        暂无热点数据
                    </div>
                </div>

                <!-- 访问统计 -->
                <div
                    style="
                        height: 20px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    "
                >
                    <img
                        src="https://visitor-badge.laobi.icu/badge?page_id=negiao.webgis"
                        alt="visitor badge"
                        loading="lazy"
                        decoding="async"
                    />
                </div>

                <div class="news-footer">
                    <span
                        class="footer-status"
                        :class="{ live: !newsLoading }"
                    >
                        <span class="status-dot"></span>
                        {{ newsLoading ? '加载中' : `更新于 ${lastNewsUpdate}` }}
                    </span>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ChatPanelContent from './ChatPanelContent.vue';
import ToolboxPanel from './TOCPanel.vue';
import BusPlannerPanel from './BusPlannerPanel.vue';
import DrivingPlannerPanel from './DrivingPlannerPanel.vue';
import CompassControlPanel from './CompassControlPanel.vue';

// ========== 1. 热点新闻平台配置 ==========
const NEWS_PLATFORMS = [
    { key: 'weibo', label: '微博' },
    { key: 'zhihu', label: '知乎' },
    { key: 'baidu', label: '百度' },
    { key: 'bilibili', label: 'B站' },
    { key: '36kr', label: '36氪' },
    { key: 'github', label: 'GitHub' },
    { key: 'juejin', label: '掘金' },
    { key: 'hackernews', label: 'HN' },
    { key: 'douyin', label: '抖音' },
    { key: 'v2ex', label: 'V2EX' },
    { key: 'tieba', label: '贴吧' },
    { key: 'jinritoutiao', label: '头条' },
    { key: 'shaoshupai', label: '少数派' },
    { key: '52pojie', label: '吾爱破解' },
    { key: 'douban', label: '豆瓣' },
    { key: 'hupu', label: '虎扑' },
    { key: 'tenxunwang', label: '腾讯网' },
    { key: 'stackoverflow', label: 'StackOverflow' },
    { key: 'sina_finance', label: '新浪财经' },
    { key: 'eastmoney', label: '东方财富' },
    { key: 'xueqiu', label: '雪球' },
    { key: 'cls', label: '财联社' },
];

const NEWS_API_BASE = 'https://orz.ai/api/v1/dailynews';
const NEWS_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 min

// ========== 2. Props & Emits ==========
const props = defineProps({
    locationInfo: {
        type: Object,
        default: () => ({ isInDihuan: false, lonLat: [0, 0] }),
    },
    activeTab: {
        type: String,
        default: 'info', // 'info(hotnews)' | 'chat' | 'toolbox' | 'bus' | 'drive' | 'compass'
    },
    toolboxTab: {
        type: String,
        default: 'layers',
    },
    isCollapsed: {
        type: Boolean,
        default: false,
    },
    userLayers: {
        type: Array,
        default: () => [],
    },
    baseLayers: {
        type: Array,
        default: () => [],
    },
    toolboxOverview: {
        type: Object,
        default: () => ({ drawCount: 0, uploadCount: 0, layers: [] }),
    },
    uploadProgress: {
        type: Object,
        default: () => ({ phase: 'idle' }),
    },
    latestSearchPoi: {
        type: Object,
        default: () => ({}),
    },
    activeFeature: {
        type: Object,
        default: () => ({ key: 'info', label: '新闻' }),
    },
    getUserLocation: {
        type: Function,
        default: null,
    },
    startBusPointPick: {
        type: Function,
        default: null,
    },
    drawRouteOnMap: {
        type: Function,
        default: null,
    },
    zoomToBusRouteStep: {
        type: Function,
        default: null,
    },
    previewBusRouteStep: {
        type: Function,
        default: null,
    },
    clearBusRouteStepPreview: {
        type: Function,
        default: null,
    },
    drawDriveRouteOnMap: {
        type: Function,
        default: null,
    },
    zoomToDriveRouteStep: {
        type: Function,
        default: null,
    },
    previewDriveRouteStep: {
        type: Function,
        default: null,
    },
    clearDriveRouteStepPreview: {
        type: Function,
        default: null,
    },
});

const tiandituToken = import.meta.env.VITE_TIANDITU_TK;

function formatScore(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
}

function rankClass(idx) {
    if (idx === 0) return 'rank-top1';
    if (idx === 1) return 'rank-top2';
    if (idx === 2) return 'rank-top3';
    return '';
}

const emit = defineEmits([
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
    'export-layer-data',
    'request-download-extent',
]);

// ========== 3. 新闻状态管理 ==========
const currentPlatform = ref('weibo');
const newsItems = ref([]);
const newsLoading = ref(false);
const lastNewsUpdate = ref('');
let newsTimer = null;

const newsPlatforms = computed(() => NEWS_PLATFORMS);

const currentPlatformLabel = computed(() => {
    const p = NEWS_PLATFORMS.find((p) => p.key === currentPlatform.value);
    return p?.label || currentPlatform.value;
});

// ========== 4. 新闻功能函数 ==========
async function fetchNews(platform) {
    newsLoading.value = true;
    try {
        const resp = await fetch(`${NEWS_API_BASE}/?platform=${platform}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (json.status === '200' && Array.isArray(json.data)) {
            newsItems.value = json.data.slice(0, 25);
            const now = new Date();
            lastNewsUpdate.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        } else {
            newsItems.value = [];
        }
    } catch (error) {
        console.error('获取新闻失败:', error);
        newsItems.value = [];
    } finally {
        newsLoading.value = false;
    }
}

function switchNewsPlatform(platform) {
    if (currentPlatform.value === platform) return;
    currentPlatform.value = platform;
    fetchNews(platform);
}

/** 生命周期钩子 */
onMounted(() => {
    fetchNews(currentPlatform.value);
    newsTimer = setInterval(() => fetchNews(currentPlatform.value), NEWS_REFRESH_INTERVAL);
});

onUnmounted(() => {
    if (newsTimer) clearInterval(newsTimer);
});
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
    border-radius: 16px 0 0 16px;
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

/* 移动端适配 */
@media (max-width: 768px) {
    .info-panel {
        display: flex;
        /* 确保父容器是 Flex 布局 */
        flex-direction: column;
        /* 垂直排列 */
        width: 100% !important;

        /* 1. 设置面板高度为视口高度的 60% */
        height: 60vh;

        transition: transform 0.3s ease;
        overflow: visible;
        /* 允许按钮溢出显示 */

        /* 定位基准，确保收起动画逻辑清晰 */
        position: fixed;
        bottom: 0;
        left: 0;
    }

    /* 收起状态下的处理：将整个面板向下推 */
    .info-panel.collapsed {
        /* 向上平移 100% 负方向减去按钮高度，或者直接推下去 */
        transform: translateY(100%);
        /* 注意：如果完全推下去，按钮也会看不见。
           通常配合 transition 使用，或者只推 60vh 的高度 */
    }

    .toggle-handle {
        width: 80px;
        height: 30px;
        align-self: center;
        border-radius: 15px 15px 0 0;

        /* 核心修改 */
        position: static;
        /* 恢复默认，不再需要 relative */
        margin-top: -30px;
        /* 用负外边距向上拉 */
        margin-bottom: 0;

        transform: translateX(0%);
        /* 保持的水平偏移 */
    }

    .handle-icon {
        /* 旋转箭头方向 */
        transition: transform 0.3s ease;
        transform: rotate(90deg);
        width: 20px;
        /* 建议给 SVG 设置明确大小 */
        height: 20px;
    }

    .handle-icon.is-flipped {
        transform: rotate(-90deg);
    }
}

/* ── News Dashboard 样式 ── */
.news-dashboard {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0;
    padding: 0 !important;
    background: #fff;
}

.news-header-bar {
    padding: 16px 16px 8px;
    flex-shrink: 0;
    border-bottom: 1px solid #f0f0f0;
}

.news-logo {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(135deg, #07ac4c, #239c42);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    display: block;
    line-height: 1.2;
}

.news-subtitle {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.news-platform-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 16px;
    flex-shrink: 0;
    border-bottom: 1px solid #f0f0f0;
}

.platform-chip {
    padding: 5px 12px;
    border: 1px solid #ddd;
    border-radius: 20px;
    background: transparent;
    color: #999;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.platform-chip:hover {
    border-color: #13c64f;
    color: #268c0a;
}

.platform-chip.active {
    background: rgba(0, 153, 204, 0.12);
    border-color: #0ea342;
    color: #15883d;
}

.news-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 16px;
    color: #999;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
}

.loading-dot-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #0dcd4a;
    animation: dotPulse 1.2s ease-out infinite;
}

@keyframes dotPulse {
    0%,
    100% {
        box-shadow: 0 0 0 0 rgba(5, 165, 59, 0.6);
    }
    50% {
        box-shadow: 0 0 0 12px rgba(0, 212, 255, 0);
    }
}

.news-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.news-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 8px;
    border-radius: 6px;
    text-decoration: none;
    color: inherit;
    transition: background 0.2s ease;
}

.news-card:hover {
    background: #f5f5f5;
}

.news-rank {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    font-weight: 600;
    color: #999;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.08);
}

.rank-top1 {
    color: #f0b35a;
    background: rgba(240, 179, 90, 0.12);
}

.rank-top2 {
    color: #a0b8c8;
    background: rgba(160, 184, 200, 0.1);
}

.rank-top3 {
    color: #c89070;
    background: rgba(200, 144, 112, 0.1);
}

.news-body {
    flex: 1;
    min-width: 0;
}

.news-title {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: #333;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    transition: color 0.2s ease;
}

.news-card:hover .news-title {
    color: #15ac3a;
}

.news-meta {
    margin-top: 2px;
}

.news-desc {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 12px;
    color: #999;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.news-score {
    flex-shrink: 0;
}

.score-value {
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    color: #999;
    background: rgba(0, 0, 0, 0.08);
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
}

.news-empty {
    padding: 40px 16px;
    text-align: center;
    color: #999;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
}

.news-footer {
    padding: 12px 16px;
    border-top: 1px solid #f0f0f0;
    flex-shrink: 0;
}

.footer-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    color: #999;
}

.footer-status.live {
    color: #4caf50;
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}

.footer-status.live .status-dot {
    animation: dotPulse 2s ease-out infinite;
}
</style>
