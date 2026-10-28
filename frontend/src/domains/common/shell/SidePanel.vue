<template>
    <!-- 外壳：负责布局与折叠手柄溢出，不裁切 -->
    <div
        class="info-panel-shell"
        :class="{ collapsed: isCollapsed, 'in-dihuan': props.locationInfo.isInDihuan }"
    >
        <!-- 折叠开关（放在 shell 上，可伸出面板） -->
        <div
            class="toggle-handle"
            :title="isCollapsed ? t('shell.expandPanel') : t('shell.collapsePanel')"
            @click="$emit('toggle-panel')"
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

        <!-- 内层：overflow hidden + border-radius，子元素背景被圆角裁切 -->
        <div
            v-show="!isCollapsed"
            class="info-panel"
        >
        <!-- 面板内容区域 -->
        <div
            class="panel-content"
            :class="{
                'no-padding':
                    activeTab === 'chat' ||
                    activeTab === 'toolbox' ||
                    activeTab === 'bus' ||
                    activeTab === 'drive' ||
                    activeTab === 'compass' ||
                    activeTab === 'buildings' ||
                    activeTab === 'info',
            }"
        >
            <div
                v-if="activeFeature?.label && activeTab !== 'info'"
                class="active-feature-banner"
            >
                {{ t('shell.activeFeature', { label: activeFeature.label }) }}
            </div>

            <!-- 模式 1: AI 聊天 -->
            <div
                v-show="activeTab === 'chat'"
                class="toolbox-content"
            >
                <ChatPanelContent
                    v-if="loadedTabs.has('chat')"
                    :active-tab="activeTab"
                    @close-chat="$emit('close-chat')"
                />
            </div>

            <!-- 模式 2: 工具箱 -->
            <div
                v-show="activeTab === 'toolbox'"
                class="toolbox-content"
            >
                <ToolboxPanel
                    v-if="loadedTabs.has('toolbox')"
                    :user-layers="userLayers"
                    :base-layers="baseLayers"
                    :overview="toolboxOverview"
                    :default-tab="toolboxTab"
                    :upload-progress="uploadProgress"
                    :latest-search-poi="latestSearchPoi"
                    :active-engine="activeEngine"
                    @close="$emit('switch-tab', 'info')"
                    @upload-data="$emit('upload-data', $event)"
                    @interaction="$emit('interaction', $event)"
                    @toggle-layer-visibility="$emit('toggle-layer-visibility', $event)"
                    @change-layer-opacity="$emit('change-layer-opacity', $event)"
                    @toggle-layer-label-visibility="$emit('toggle-layer-label-visibility', $event)"
                    @zoom-layer="$emit('zoom-layer', $event)"
                    @view-layer="$emit('view-layer', $event)"
                    @remove-layer="$emit('remove-layer', $event)"
                    @edit-layer="$emit('edit-layer', $event)"
                    @reorder-user-layers="$emit('reorder-user-layers', $event)"
                    @solo-layer="$emit('solo-layer', $event)"
                    @apply-style-template="$emit('apply-style-template', $event)"
                    @update-draw-style="$emit('update-draw-style', $event)"
                    @update-layer-style="$emit('update-layer-style', $event)"
                    @update-cesium-layer-style="$emit('update-cesium-layer-style', $event)"
                    @highlight-attribute-feature="$emit('highlight-attribute-feature', $event)"
                    @zoom-attribute-feature="$emit('zoom-attribute-feature', $event)"
                    @draw-point-by-coordinates="$emit('draw-point-by-coordinates', $event)"
                    @draw-amap-aoi-from-json="$emit('draw-amap-aoi-from-json', $event)"
                    @toggle-layer-crs="$emit('toggle-layer-crs', $event)"
                    @export-layer-data="$emit('export-layer-data', $event)"
                    @import-to-3d="$emit('import-to-3d', $event)"
                    @rename-layer="$emit('rename-layer', $event)"
                    @layer-selected="$emit('layer-selected', $event)"
                />
            </div>

            <!-- 模式 3: 公交规划 -->
            <div
                v-show="activeTab === 'bus'"
                class="toolbox-content"
            >
                <RoutePlannerPanel
                    v-if="loadedTabs.has('bus')"
                    mode="bus"
                    :token="tiandituToken"
                    :start-point-pick="startBusPointPick"
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
                <RoutePlannerPanel
                    v-if="loadedTabs.has('drive')"
                    mode="drive"
                    :token="tiandituToken"
                    :start-point-pick="startBusPointPick"
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
                    v-if="loadedTabs.has('compass')"
                    :get-user-location="getUserLocation"
                    @close="$emit('switch-tab', 'info')"
                />
            </div>

            <!-- 模式 6: 腾讯建筑白模抓取 -->
            <div
                v-show="activeTab === 'buildings'"
                class="toolbox-content"
            >
                <TencentBuildingPanel
                    v-if="loadedTabs.has('buildings')"
                    :get-cesium-viewer="getCesiumViewer"
                    :get-cesium="getCesiumNamespace"
                    :active-engine="activeEngine"
                    @upload-data="$emit('upload-data', $event)"
                    @close="$emit('switch-tab', 'info')"
                />
            </div>

            <!-- 模式 7: 天气看板 -->
            <div
                v-show="activeTab === 'weather'"
                class="toolbox-content weather-tab-content"
            >
                <WeatherChartPanel v-if="loadedTabs.has('weather') && shouldLoadWeather" />
            </div>

            <!-- 模式 8: 热点新闻 -->
            <div
                v-show="activeTab === 'info'"
                class="news-dashboard"
            >
                <div class="news-header-bar">
                    <span class="news-logo">Hot News</span>
                    <span class="news-subtitle">{{ t('shell.newsSubtitle', { platform: currentPlatformLabel }) }}</span>
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
                    <span>{{ t('shell.loadingNews') }}</span>
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
                                v-if="item.desc || item.content"
                                class="news-meta"
                            >
                                <span class="news-desc">{{ item.desc || item.content }}</span>
                            </div>
                        </div>
                        <div
                            v-if="item.score || item.publish_time"
                            class="news-score"
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
                        {{ t('shell.noNews') }}
                    </div>
                </div>

                <!-- 访问统计 -->
                <!-- <div
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
                </div> -->

                <div class="news-footer">
                    <span
                        class="footer-status"
                        :class="{ live: !newsLoading }"
                    >
                        <span class="status-dot"></span>
                        {{ newsLoading ? t('shell.newsLoading') : t('shell.newsUpdated', { time: lastNewsUpdate }) }}
                    </span>
                </div>
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
import {
    computed,
    defineAsyncComponent,
    onMounted,
    onUnmounted,
    reactive,
    ref,
    watch,
} from 'vue';
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';
import { useLocale } from '@common/app/useLocale';
import { tileProxyUrl } from '@/config/publicRuntime';

// Load non-default tabs on first use; keep them mounted afterward to preserve state.
const ChatPanelContent = defineAsyncComponent(() =>
    import('@common/chat/components/ChatPanelContent.vue'),
);
// ToolboxPanel 预加载：与 defineAsyncComponent 共享同一个模块 Promise。
// 首屏就绪后延迟预取资源（不打开面板），用户点击工具箱时无需再等待动态分块加载。
let toolboxModulePromise = null;
function preloadToolboxPanel() {
    if (!toolboxModulePromise) {
        toolboxModulePromise = import('@common/layer-tree/components/TOCPanel.vue');
    }
    return toolboxModulePromise;
}
const ToolboxPanel = defineAsyncComponent(() => preloadToolboxPanel());
const RoutePlannerPanel = defineAsyncComponent(() =>
    import('@ol/routing/components/RoutePlannerPanel.vue'),
);
const CompassControlPanel = defineAsyncComponent(() =>
    import('@common/compass/components/CompassControlPanel.vue'),
);
const TencentBuildingPanel = defineAsyncComponent(() =>
    import('@common/data-import/components/TencentBuildingPanel.vue'),
);
const WeatherChartPanel = defineAsyncComponent(() =>
    import('@common/weather/components/WeatherChartPanel.vue'),
);

const { t } = useLocale();

// ========== 1. 热点新闻平台配置（label 随语言切换）==========
const NEWS_PLATFORM_KEYS = [
    'weibo', 'zhihu', 'baidu', 'bilibili', '36kr', 'github', 'juejin', 'hackernews',
    'douyin', 'v2ex', 'tieba', 'jinritoutiao', 'shaoshupai', '52pojie', 'douban',
    'hupu', 'tenxunwang', 'stackoverflow', 'sina_finance', 'eastmoney', 'xueqiu', 'cls',
];
const newsPlatforms = computed(() =>
    NEWS_PLATFORM_KEYS.map((key) => ({
        key,
        label: t(`shell.platforms.${key}`),
    })),
);

const NEWS_DIRECT_URL = 'https://news.orz.ai/api/v1/dailynews/';
const NEWS_API_TARGET = 'news.orz.ai/api/v1/dailynews/';
const NEWS_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 min
/** 直连超时：正常 1.6s 内可返回，超时即视为不可达，交由代理分支胜出 */
const NEWS_DIRECT_TIMEOUT = 2500;
/** 代理超时：实测 0.6–2.4s；上游抖动时可到数秒，故给到 8s（tile-proxy 自身上限 20s） */
const NEWS_PROXY_TIMEOUT = 8000;
/** 列表最多展示条数（上游通常返回 20–60 条） */
const NEWS_ITEM_LIMIT = 25;
/** 上次成功结果缓存键：刷新失败时用于兜底展示，避免列表被抹空 */
const NEWS_CACHE_KEY = 'webgis:news-cache:v1';
const NEWS_CACHE_MAX_PLATFORMS = 24;

// ========== 2. Props & Emits ==========
const props = defineProps({
    locationInfo: {
        type: Object,
        default: () => ({ isInDihuan: false, lonLat: [0, 0] }),
    },
    activeTab: {
        type: String,
        default: 'info', // 'info(hotnews)' | 'chat' | 'toolbox' | 'bus' | 'drive' | 'compass' | 'buildings'
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
    // 当前渲染引擎：'ol' | 'cesium'（TOC 动作按此分发到对应引擎）
    activeEngine: {
        type: String,
        default: 'ol',
    },
    activeFeature: {
        type: Object,
        default: () => ({ key: 'info', label: '' }),
    },
    getUserLocation: {
        type: Function,
        default: null,
    },
    /** 三维框选的 Viewer 提供器（HomeView 注入，透传给建筑抓取面板） */
    getCesiumViewer: {
        type: Function,
        default: null,
    },
    /** 三维框选的 Cesium 命名空间提供器 */
    getCesiumNamespace: {
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
    /** 是否加载天气看板组件（延迟加载优化） */
    shouldLoadWeather: {
        type: Boolean,
        default: false,
    },
});

const loadedTabs = reactive(new Set());
watch(
    () => props.activeTab,
    (tab) => {
        if (tab && tab !== 'info') loadedTabs.add(tab);
    },
    { immediate: true },
);

const tiandituToken = ref(getRuntimeMapTokensSync().tiandituTk);

// ========== 工具箱资源延迟预加载 ==========
// SidePanel 的挂载时机 = ol 首屏就绪（HomeView.handleMapCoreReady 触发）。
// 挂载后再延迟 10s 异步预取 ToolboxPanel 模块：
// - 不占用首屏 / 底图加载的带宽与主线程
// - 用户点击工具箱时立即渲染，无动态分块等待
const TOOLBOX_PRELOAD_DELAY_MS = 10000;
let toolboxPreloadTimer = null;

function scheduleToolboxPreload() {
    if (toolboxPreloadTimer) return;
    toolboxPreloadTimer = window.setTimeout(() => {
        toolboxPreloadTimer = null;
        preloadToolboxPanel().catch((error) => {
            // 预加载失败不影响用户后续点击（defineAsyncComponent 会按需重试）
            console.warn('ToolboxPanel 预加载失败，用户点击时自动重试', error);
            toolboxModulePromise = null;
        });
    }, TOOLBOX_PRELOAD_DELAY_MS);
}

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

defineEmits([
    'toggle-panel',
    'close-chat',
    'switch-tab',
    'upload-data',
    'interaction',
    'toggle-layer-visibility',
    'change-layer-opacity',
    'toggle-layer-label-visibility',
    'zoom-layer',
    'view-layer',
    'remove-layer',
    'edit-layer',
    'reorder-user-layers',
    'solo-layer',
    'apply-style-template',
    'update-draw-style',
    'update-layer-style',
    'update-cesium-layer-style',
    'highlight-attribute-feature',
    'zoom-attribute-feature',
    'draw-point-by-coordinates',
    'draw-amap-aoi-from-json',
    'toggle-layer-crs',
    'export-layer-data',
    'import-to-3d',
    'rename-layer',
    'layer-selected',
]);

// ========== 3. 新闻状态管理 ==========
const currentPlatform = ref('weibo');
const newsItems = ref([]);
const newsLoading = ref(false);
const lastNewsUpdate = ref('');
let newsTimer = null;
/** 当前在途请求的取消句柄：切平台/卸载时中断旧请求 */
let newsAbortController = null;
/** 请求序号：递增后旧请求的响应自动失效，防止慢响应覆盖新平台数据 */
let newsRequestSeq = 0;
/** 上次成功获取的时间戳，用于回到前台时判断是否需要补刷 */
let newsLastFetchedAt = 0;

const currentPlatformLabel = computed(() => {
    const p = newsPlatforms.value.find((item) => item.key === currentPlatform.value);
    return p?.label || currentPlatform.value;
});

// ========== 4. 新闻功能函数 ==========
/** 格式化为 HH:mm:ss（面板右上角「更新于」展示用） */
function formatNewsClock(date) {
    return [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map((value) => String(value).padStart(2, '0'))
        .join(':');
}

/** 读取本地缓存（隐私模式或配额异常时静默失效） */
function readNewsCache() {
    try {
        const raw = localStorage.getItem(NEWS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.platforms && typeof parsed.platforms === 'object' ? parsed.platforms : null;
    } catch {
        return null;
    }
}

/** 写入成功结果；按最近使用时间淘汰超量平台，避免长期堆积占满存储 */
function writeNewsCache(platform, items, updatedAt) {
    try {
        const platforms = readNewsCache() || {};
        platforms[platform] = { items, updatedAt, ts: Date.now() };
        const keys = Object.keys(platforms);
        if (keys.length > NEWS_CACHE_MAX_PLATFORMS) {
            keys.sort((a, b) => (platforms[a]?.ts || 0) - (platforms[b]?.ts || 0))
                .slice(0, keys.length - NEWS_CACHE_MAX_PLATFORMS)
                .forEach((key) => delete platforms[key]);
        }
        localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ version: 1, platforms }));
    } catch {
        // 写缓存失败不影响主流程
    }
}

/** 用缓存先渲染一帧，网络刷新完成后再覆盖；返回是否命中缓存 */
function hydrateNewsFromCache(platform) {
    const entry = readNewsCache()?.[platform];
    if (!entry || !Array.isArray(entry.items) || !entry.items.length) return false;
    newsItems.value = entry.items.slice(0, NEWS_ITEM_LIMIT);
    lastNewsUpdate.value = entry.updatedAt || '';
    // 以缓存写入时间作为「上次获取时间」，避免刚打开页面就重复补刷
    newsLastFetchedAt = Number(entry.ts) || 0;
    return true;
}

/**
 * 发起一次新闻请求并返回解析后的 JSON。
 * 超时由独立 AbortController 控制（父 signal 取消时同步中断）；响应按文本读取后再
 * JSON.parse —— 网关或 Cloudflare 出错时返回的是纯文本 504 页，直接 resp.json()
 * 抛出的 SyntaxError 无法与网络错误区分，日志会误导排查方向。
 */
async function requestNewsJson(url, timeoutMs, parentSignal) {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (parentSignal) {
        if (parentSignal.aborted) controller.abort();
        else parentSignal.addEventListener('abort', abortFromParent, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return JSON.parse(await resp.text());
    } finally {
        clearTimeout(timeoutId);
        parentSignal?.removeEventListener('abort', abortFromParent);
    }
}

/**
 * Promise.any 的最小兜底实现。
 * Promise.any 属 ES2021 运行时 API，构建工具不会转译；少数内嵌 WebView 缺失时
 * 会直接抛 TypeError，导致新闻永远空白。这里仅在缺失时降级为等价实现。
 */
function anyResolve(promises) {
    if (typeof Promise.any === 'function') return Promise.any(promises);
    return new Promise((resolve, reject) => {
        let pending = promises.length;
        const errors = [];
        if (!pending) {
            reject(new Error('no candidate'));
            return;
        }
        promises.forEach((promise, index) => {
            Promise.resolve(promise).then(resolve, (error) => {
                errors[index] = error;
                pending -= 1;
                if (!pending) reject(new Error(errors.map((e) => e?.message || e).join(' | ')));
            });
        });
    });
}

/**
 * 双通道竞速：直连与 VPS 代理同时发起，谁先拿到「status=200 且 data 非空」谁胜出。
 *
 * 依据实测：国内网络直连 news.orz.ai 间歇性不可达（连续采样全部超时），
 * 「直连优先」会让每次刷新白等一整个直连超时再回退；而代理正常时 0.6–2.4s 返回。
 * 竞速在直连可用时仍拿到 ~1.6s 的低延迟，不可用时也不必付双份等待。
 * 落败分支在 finally 中 abort，不留悬挂请求；10 分钟一次，对代理 180 req/min
 * 的限流与上游压力均可忽略。
 */
async function fetchNewsFromChannels(platform, parentSignal) {
    const query = `?platform=${encodeURIComponent(platform)}`;
    const branches = [
        { channel: 'direct', url: `${NEWS_DIRECT_URL}${query}`, timeoutMs: NEWS_DIRECT_TIMEOUT },
        { channel: 'proxy', url: `${tileProxyUrl(NEWS_API_TARGET)}${query}`, timeoutMs: NEWS_PROXY_TIMEOUT },
    ];
    const controllers = branches.map(() => new AbortController());
    const abortAll = () => controllers.forEach((controller) => controller.abort());
    if (parentSignal) {
        if (parentSignal.aborted) abortAll();
        else parentSignal.addEventListener('abort', abortAll, { once: true });
    }

    const attempts = branches.map((branch, index) => {
        const attempt = (async () => {
            const json = await requestNewsJson(branch.url, branch.timeoutMs, controllers[index].signal);
            const list = Array.isArray(json?.data) ? json.data : [];
            if (String(json?.status ?? '') !== '200' || !list.length) {
                throw new Error(`${branch.channel}: 上游无有效数据（status=${json?.status}）`);
            }
            return { channel: branch.channel, list };
        })();
        // 落败分支的拒绝由竞速聚合统一处理，这里再挂一次空 catch 避免未处理拒绝告警
        attempt.catch(() => {});
        return attempt;
    });

    try {
        return await anyResolve(attempts);
    } finally {
        abortAll();
        parentSignal?.removeEventListener('abort', abortAll);
    }
}

/**
 * 拉取指定平台新闻。
 * @param {string} platform 平台键（见 NEWS_PLATFORM_KEYS）
 * @param {{ silent?: boolean }} options silent=true 时不切换加载态（轮询/有缓存时用）
 *
 * 三类状态变化：
 * - 成功：覆盖列表 + 记录时间 + 落缓存
 * - 失败：保留上一次结果（不清空），只记一条告警
 * - 被取代：请求序号失效或被 abort，直接丢弃，不写状态
 */
async function fetchNews(platform, { silent = false } = {}) {
    const requestSeq = ++newsRequestSeq;
    const isLatest = () => requestSeq === newsRequestSeq;

    newsAbortController?.abort();
    const controller = new AbortController();
    newsAbortController = controller;

    // 已有数据时的静默刷新不切加载态，避免每 10 分钟整块闪一次
    if (!silent || !newsItems.value.length) newsLoading.value = true;

    try {
        const { list } = await fetchNewsFromChannels(platform, controller.signal);
        if (!isLatest()) return; // 已被更新的请求取代，丢弃本条结果

        newsItems.value = list.slice(0, NEWS_ITEM_LIMIT);
        lastNewsUpdate.value = formatNewsClock(new Date());
        newsLastFetchedAt = Date.now();
        writeNewsCache(platform, newsItems.value, lastNewsUpdate.value);
    } catch (error) {
        // 主动取消（切平台/卸载/被新请求取代）不告警；真实失败保留旧数据
        if (!controller.signal.aborted) {
            console.warn(`[news] ${platform} 获取失败，保留上次结果：`, error?.message || error);
        }
    } finally {
        if (isLatest()) newsLoading.value = false;
    }
}

function switchNewsPlatform(platform) {
    if (currentPlatform.value === platform) {
        // 再次点击当前平台视为手动刷新（失败后可重试）
        fetchNews(platform);
        return;
    }
    currentPlatform.value = platform;
    newsItems.value = [];
    // 有缓存则先出图，再静默刷新，切换平台不出现空白页
    const hasCache = hydrateNewsFromCache(platform);
    fetchNews(platform, { silent: hasCache });
}

/** 回到前台时：仅当距上次成功获取已超过刷新间隔才补刷，避免频繁切页产生多余请求 */
function handleNewsVisibilityChange() {
    if (document.hidden) return;
    if (Date.now() - newsLastFetchedAt < NEWS_REFRESH_INTERVAL) return;
    fetchNews(currentPlatform.value, { silent: newsItems.value.length > 0 });
}

/** 生命周期钩子 */
onMounted(() => {
    loadRuntimeMapTokens().then((tokens) => {
        const nextTiandituTk = String(tokens?.tiandituTk || '').trim();
        if (nextTiandituTk) {
            tiandituToken.value = nextTiandituTk;
        }
    });

    // 缓存优先：先渲染上次结果，避免首屏空白
    const hasCache = hydrateNewsFromCache(currentPlatform.value);
    fetchNews(currentPlatform.value, { silent: hasCache });
    newsTimer = setInterval(() => {
        if (document.hidden) return; // 后台标签页不占带宽与代理配额
        fetchNews(currentPlatform.value, { silent: true });
    }, NEWS_REFRESH_INTERVAL);
    document.addEventListener('visibilitychange', handleNewsVisibilityChange);

    // 挂载时即安排工具箱资源预加载（10s 后异步执行）
    scheduleToolboxPreload();
});

onUnmounted(() => {
    if (newsTimer) clearInterval(newsTimer);
    newsAbortController?.abort(); // 中断在途请求，防止卸载后写状态
    document.removeEventListener('visibilitychange', handleNewsVisibilityChange);
    // 组件卸载时取消未执行的预加载定时器，防止内存泄漏
    if (toolboxPreloadTimer) {
        clearTimeout(toolboxPreloadTimer);
        toolboxPreloadTimer = null;
    }
});
</script>

<style scoped>
/* 外壳：允许折叠手柄溢出，本身不做圆角裁切 */
.info-panel-shell {
    position: relative;
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    overflow: visible;
}

/* 内层面板：overflow hidden 让子元素背景被 border-radius 裁切 */
.info-panel {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-width: 0;
    height: 100%;
    background: #fff;
    overflow: hidden;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
    transition: width 0.3s ease;
    /* 简写顺序：左上 右上 右下 左下 */
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
    z-index: var(--z-toast);

    /* 相对 shell 定位，伸出面板左侧 */
    position: absolute;
    left: -30px;
    top: 50%;
    transform: translateY(-50%);
}

.toggle-handle:hover {
    background: var(--brand-accent-dark);
    width: 30px;
}

.handle-icon {
    font-size: 12px;
    color: var(--brand-accent);
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
    background: linear-gradient(30deg, rgba(235, 222, 222, 0), var(--brand-accent));
    color: var(--brand-primary-dark);
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
    .info-panel-shell {
        display: flex;
        flex-direction: column;
        width: 100% !important;
        height: 60vh;
        transition: transform 0.3s ease;
        overflow: visible;
        position: fixed;
        bottom: 0;
        left: 0;
    }

    /* .panel-content 基准 min-width: 300px 在窄屏抽屉内会撑出横向溢出，
       触发 iOS Safari 整页缩小（F12 模拟不复现）。移动端清零。 */
    .panel-content {
        min-width: 0;
    }

    /* 收起状态下的处理：将整个面板向下推 */
    .info-panel-shell.collapsed {
        transform: translateY(100%);
    }

    .info-panel {
        flex: 1;
        width: 100%;
        min-height: 0;
        flex-direction: column;
        /* 底部抽屉：圆角在上方 */
        border-radius: 16px 16px 0 0;
        overflow: hidden;
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
    border-radius: 16px 0 0 16px;
}

.news-header-bar {
    padding: 8px;
    flex-shrink: 0;
    border-bottom: 1px solid #f0f0f0;
}

.news-logo {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    display: block;
    line-height: 1.2;
}

.news-subtitle {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: var(--text-muted);
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
    color: var(--text-muted);
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
    color: var(--text-muted);
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
    color: var(--text-muted);
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
    color: var(--text-primary);
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
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
    color: var(--text-muted);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.news-score {
    flex-shrink: 0;
}

.score-value {
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    color: var(--text-muted);
    background: rgba(0, 0, 0, 0.08);
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
}

.news-empty {
    padding: 40px 16px;
    text-align: center;
    color: var(--text-muted);
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
    color: var(--text-muted);
}

.footer-status.live {
    color: var(--brand-primary);
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
