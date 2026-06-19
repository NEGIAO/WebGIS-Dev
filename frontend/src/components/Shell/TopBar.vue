<template>
    <div class="top-bar">
        <div class="branding">
            <a
                href="../index.html"
                class="logo-link"
            >
                <img
                    :src="faviconUrl"
                    alt="Icon"
                    class="logo-icon"
                />
                <span class="title-text">The Science of Where！</span>
            </a>
        </div>

        <div class="controls">
            <div
                ref="menuHostRef"
                class="menu-host"
            >
                <button
                    class="nav-btn"
                    title="菜单项"
                    @click="toggleToolMenu"
                >
                    <span class="btn-icon">
                        <list-icon
                            :size="18"
                            :stroke-width="2"
                        />
                    </span>
                    <span class="btn-text">菜单</span>
                </button>
                <div
                    v-if="showToolMenu"
                    class="floating-menu tools-menu"
                >
                    <div class="menu-header">
                        <span class="menu-header-title">功能菜单</span>
                    </div>
                    <div class="menu-body">
                        <!-- 核心功能引入 2x2 现代网格排版 -->
                        <div class="menu-grid-layout">
                            <button
                                class="menu-item"
                                @click="handleOpenToolbox"
                            >
                                <layers-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                图层管理
                            </button>
                            <button
                                class="menu-item"
                                @click="handleOpenCompass"
                            >
                                <compass-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                风水罗盘
                            </button>
                            <button
                                class="menu-item"
                                @click="handleOpenBusPlanner"
                            >
                                <bus-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                公交规划
                            </button>
                            <button
                                class="menu-item"
                                @click="handleOpenDrivePlanner"
                            >
                                <car-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                驾车规划
                            </button>
                        </div>

                        <div class="menu-divider"></div>

                        <!-- 状态控制全宽项 -->
                        <button
                            class="menu-item status-item"
                            @click="handleToggleWeatherBoard"
                        >
                            <component
                                :is="isWeatherBoardMode ? MapIcon : CloudSunIcon"
                                :size="16"
                                class="m-icon"
                            />
                            {{ isWeatherBoardMode ? '返回地图视图' : '天气看板' }}
                        </button>

                        <button
                            class="menu-item status-item"
                            @click="handleToggleLogMonitor"
                        >
                            <activity-icon
                                :size="16"
                                class="m-icon"
                            />
                            {{ logMonitorVisible ? '关闭日志监控' : '日志监控' }}
                        </button>

                        <div class="menu-divider"></div>
                        <div class="menu-group-title">常用地点</div>

                        <!-- 常用地点流式标签包裹 -->
                        <div class="quick-loc-container">
                            <button
                                v-for="loc in quickLocations"
                                :key="loc.key"
                                class="menu-item menu-item-quick"
                                @click="handleJump(loc)"
                            >
                                <span class="menu-item-icon">
                                    <map-pin-icon :size="12" />
                                </span>
                                <span class="menu-item-label">{{ loc.label }}</span>
                            </button>
                        </div>

                        <div class="menu-divider"></div>
                        <button
                            class="menu-item soup-item"
                            title="来点鸡汤"
                            @click="handleSoup"
                        >
                            <smile-icon
                                :size="16"
                                class="m-icon"
                            />
                            鸡汤
                        </button>
                    </div>
                </div>
            </div>

            <button
                class="nav-btn"
                title="分享当前视角"
                @click="handleShareView"
            >
                <span class="btn-icon">
                    <share-2-icon
                        :size="18"
                        :stroke-width="1.8"
                    />
                </span>
                <span class="btn-text">分享</span>
            </button>

            <button
                class="nav-btn"
                title="AI 助手"
                @click="handleOpenChat"
            >
                <span class="btn-icon">
                    <bot-icon
                        :size="20"
                        :stroke-width="2"
                    />
                </span>
                <span class="btn-text">AI 助手</span>
            </button>

            <button
                class="nav-btn"
                title="切换2D/3D视图"
                @click="handleToggle3D"
            >
                <span class="btn-icon">
                    <GlobeIcon
                        :size="18"
                        :stroke-width="2"
                    />
                </span>
                <span class="btn-text">
                    {{ is3DMode ? '2D视图' : '3D视图' }}
                </span>
            </button>

            <button
                class="nav-btn"
                title="用户中心"
                @click="handleToggleAccountCenter"
            >
                <span class="btn-icon">
                    <user-icon
                        :size="18"
                        :stroke-width="2"
                    />
                </span>
                <span class="btn-text">用户中心</span>
            </button>

            <div
                ref="magicMenuHostRef"
                class="menu-host"
            >
                <button
                    class="nav-btn magic-btn"
                    title="魔法特效选项"
                    @click="toggleMagicMenu"
                >
                    <span class="btn-icon">
                        <sparkles-icon
                            :size="18"
                            :stroke-width="2"
                        />
                    </span>
                    <span class="btn-text">屏幕特效</span>
                </button>
                <div
                    v-if="showMagicMenu"
                    class="floating-menu magic-menu"
                >
                    <div class="menu-header">
                        <span class="menu-header-title">屏幕特效</span>
                    </div>
                    <div class="menu-body">
                        <!-- 特效采用高效的 2 列网格 -->
                        <div class="magic-grid-layout">
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('fluid')"
                            >
                                <wind-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                流体烟雾
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('gravity')"
                            >
                                <orbit-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                引力场
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('void')"
                            >
                                <aperture-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                维度塌陷
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('wave')"
                            >
                                <waves-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                量子波
                            </button>
                            <button
                                class="menu-item highlight-magic"
                                @click="handleActivateMagic('singularity')"
                            >
                                <circle-dot-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                黑洞引力
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('ring-explosion')"
                            >
                                <circle-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                圆环爆破
                            </button>
                        </div>

                        <div class="menu-divider"></div>
                        <button
                            class="menu-item magic-close-btn"
                            @click="handleActivateMagic('off')"
                        >
                            <circle-x-icon
                                :size="16"
                                class="m-icon"
                            />
                            关闭特效
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from '../../composables/useMessage';
import { DEFAULT_BASEMAP_LAYER_INDEX } from '../../constants';
import { normalizeBinaryFlag } from '../../utils/normalize';
// import { hideLoading, showLoading } from '@/utils';
import {
    List as ListIcon,
    Layers as LayersIcon,
    Compass as CompassIcon,
    Bus as BusIcon,
    Car as CarIcon,
    CloudSun as CloudSunIcon,
    Map as MapIcon,
    MapPin as MapPinIcon,
    Smile as SmileIcon,
    Share2 as Share2Icon,
    Bot as BotIcon,
    // Globe2 as GlobeIcon,
    Sparkles as SparklesIcon,
    Wind as WindIcon,
    Orbit as OrbitIcon,
    Aperture as ApertureIcon,
    Waves as WavesIcon,
    CircleDot as CircleDotIcon,
    CircleX as CircleXIcon,
    Circle as CircleIcon,
    User as UserIcon,
    Activity as ActivityIcon,
} from 'lucide-vue-next';
import { Globe as GlobeIcon } from 'lucide-vue-next';
import { useAppStore } from '../../stores/useAppStore';
import { useCompassStore } from '../../stores/useCompassStore';
import { storeToRefs } from 'pinia';

const props = defineProps({
    isWeatherBoardMode: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits([
    'toggle-magic',
    'activate-magic', // 发送特定的魔法特效
    'toggle-3d',
    'open-chat',
    'open-toolbox',
    'open-compass',
    'open-bus',
    'open-drive',
    'toggle-weather-board',
    'activate-feature',
    'jump-view',
    'toggle-account-center',
]);

const showToolMenu = ref(false);
const showMagicMenu = ref(false);
const menuHostRef = ref(null);
const magicMenuHostRef = ref(null);

// 日志监控状态
const appStore = useAppStore();
const { logMonitorVisible } = storeToRefs(appStore);

// 罗盘状态：用于分享链接时判断是否保留 cs 参数
const compassStore = useCompassStore();

const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

// 复用 index.html 中已加载的 favicon，避免重复请求同一资源
const faviconUrl = document.querySelector('link[rel="icon"]')?.href || `${normalizedBase}images/icon.webp`;

const message = useMessage();

//地点迁移
const quickLocations = [
    { key: 'dengzhou', label: '邓州', lng: 112.089596, lat: 32.690537, z: 12.01, layer: 0 },
    { key: 'hedu', label: '河大', lng: 114.30796, lat: 34.813566, z: 11.83, layer: 0 },
    { key: 'home', label: 'Home', lng: 111.843768, lat: 32.723897, z: 14.67, layer: 0 },
    { key: '51Area', label: '51区', lng: -115.808771, lat: 37.238119, z: 14.98, layer: 6 },
    { key: 'China', label: '美丽中国', lng: 116.397451, lat: 39.908722, z: 4.5, layer: 21 },
];

function handleOpenToolbox() {
    showToolMenu.value = false;
    emit('activate-feature', { key: 'toolbox', label: '工具箱' });
    emit('open-toolbox');
}

function handleOpenCompass() {
    showToolMenu.value = false;
    emit('activate-feature', { key: 'compass', label: '风水罗盘' });
    emit('open-compass');
}

function handleOpenBusPlanner() {
    showToolMenu.value = false;
    emit('activate-feature', { key: 'bus', label: '公交规划' });
    emit('open-bus');
}

function handleOpenDrivePlanner() {
    showToolMenu.value = false;
    emit('activate-feature', { key: 'drive', label: '驾车规划' });
    emit('open-drive');
}

function handleToggleWeatherBoard() {
    showToolMenu.value = false;
    emit('activate-feature', {
        key: props.isWeatherBoardMode ? 'map' : 'weather-board',
        label: props.isWeatherBoardMode ? '地图视图' : '天气看板',
    });
    emit('toggle-weather-board');
}

function handleOpenChat() {
    emit('activate-feature', { key: 'chat', label: 'AI助手' });
    emit('open-chat');
}

const is3DMode = ref(false);

function handleToggle3D() {
    is3DMode.value = !is3DMode.value;
    emit('activate-feature', { key: '3d', label: is3DMode.value ? '3D视图' : '2D视图' });
    emit('toggle-3d');
}

function handleToggleAccountCenter() {
    emit('toggle-account-center');
}

function toggleMagicMenu() {
    showMagicMenu.value = !showMagicMenu.value;
    showToolMenu.value = false;
}

function handleActivateMagic(effectName) {
    showMagicMenu.value = false;
    emit('activate-feature', { key: 'magic', label: '特效' });
    emit('activate-magic', effectName);
}

function toggleToolMenu() {
    showToolMenu.value = !showToolMenu.value;
    showMagicMenu.value = false;
}

function handleJump(location) {
    const lng = Number(location.lng);
    const lat = Number(location.lat);
    const z = Number(location.z);
    const layerIndexRaw = Number(location.layer);
    const layerIndex = Number.isInteger(layerIndexRaw)
        ? layerIndexRaw
        : DEFAULT_BASEMAP_LAYER_INDEX;

    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(z)) return;

    showToolMenu.value = false;

    // 统一交给 MapContainer 的视图更新入口处理：飞行 + URL replace。
    emit('jump-view', lng, lat, z, layerIndex);
}

function handleSoup() {
    showToolMenu.value = false;
    message.soup();
}

function handleToggleLogMonitor() {
    showToolMenu.value = false;
    appStore.toggleLogMonitor();
    message.info(logMonitorVisible.value ? '日志监控面板已打开' : '日志监控面板已关闭');
}

function handleDocumentClick(event) {
    if (showToolMenu.value && !menuHostRef.value?.contains(event.target)) {
        showToolMenu.value = false;
    }
    if (showMagicMenu.value && !magicMenuHostRef.value?.contains(event.target)) {
        showMagicMenu.value = false;
    }
}

function canUseNativeShare() {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
    const ua = navigator.userAgent || '';
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
}

function fallbackCopyViaExecCommand(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);

    const selection = window.getSelection();
    const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();

    let succeeded = false;
    try {
        succeeded = document.execCommand('copy');
    } catch (_e) {
        succeeded = false;
    }

    document.body.removeChild(textarea);

    if (originalRange && selection) {
        selection.removeAllRanges();
        selection.addRange(originalRange);
    }

    if (!succeeded) {
        throw new Error('execCommand copy failed');
    }
}

function normalizeLayerIndex(value, fallback = DEFAULT_BASEMAP_LAYER_INDEX) {
    const parsed = Number(String(value ?? '').trim());
    if (Number.isInteger(parsed) && parsed >= 0) return String(parsed);

    const fallbackParsed = Number(fallback);
    if (Number.isInteger(fallbackParsed) && fallbackParsed >= 0) return String(fallbackParsed);
    return String(DEFAULT_BASEMAP_LAYER_INDEX);
}

function normalizePositionCode(value, fallback = '0') {
    const text = String(value ?? '').trim();
    if (text) return text;
    return String(fallback ?? '0');
}

/**
 * 解析分享链接中的定位编码
 * 只在 URL 有 loc=1 标记（用户已授权定位）时才保留非零 p 值
 */
function resolvePositionCodeForShare(hashParams, searchParams) {
    // 只在 loc=1 时才保留 p 参数，否则返回 '0'
    const locFlag = String(hashParams.get('loc') || searchParams.get('loc') || '0').trim();
    if (locFlag !== '1') return '0';

    const hashCode = normalizePositionCode(hashParams?.get('p'), '');
    if (hashCode && hashCode !== '0') return hashCode;

    const searchCode = normalizePositionCode(searchParams?.get('p'), '');
    if (searchCode && searchCode !== '0') return searchCode;

    return '0';
}

function extractPositionCodeFromText(rawHref) {
    const text = String(rawHref || '');
    const match = text.match(/[?#&]p=([^&#]*)/i);
    if (!match) return '0';

    try {
        return normalizePositionCode(decodeURIComponent(match[1] || ''), '0');
    } catch {
        return normalizePositionCode(match[1] || '', '0');
    }
}

function syncShareFlagInCurrentUrl() {
    if (typeof window === 'undefined') return;

    try {
        const hash = String(window.location.hash || '#/home');
        const hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
        const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
        const hashPath = hashPathRaw || '/home';
        const hashParams = new URLSearchParams(hashQueryRaw);
        const searchParams = new URLSearchParams(
            String(window.location.search || '').replace(/^\?/, ''),
        );

        hashParams.delete('from');
        hashParams.delete('shared');
        hashParams.set('s', '1');
        hashParams.set('loc', normalizeBinaryFlag(hashParams.get('loc'), '0'));
        hashParams.set('p', resolvePositionCodeForShare(hashParams, searchParams));
        hashParams.set(
            'l',
            normalizeLayerIndex(
                hashParams.get('l') ?? hashParams.get('layer'),
                DEFAULT_BASEMAP_LAYER_INDEX,
            ),
        );
        hashParams.delete('layer');

        // 只在罗盘启用时保留 cs 参数
        if (!compassStore.enabled) {
            hashParams.delete('cs');
        }

        const nextHashQuery = hashParams.toString();
        const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
        const nextHash = nextHashQuery
            ? `#${normalizedHashPath}?${nextHashQuery}`
            : `#${normalizedHashPath}`;
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;

        window.history.replaceState(window.history.state, '', nextUrl);
    } catch {
        // Ignore URL update failures to keep share flow unaffected.
    }
}

function buildShareMarkedUrl(rawHref) {
    try {
        const url = new URL(rawHref, window.location.origin);
        const hashText = String(url.hash || '');
        const hashWithoutSharp = hashText.startsWith('#') ? hashText.slice(1) : hashText;
        const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
        const hashPath = hashPathRaw || '/home';
        const hashParams = new URLSearchParams(hashQueryRaw);

        // 标记该链接来自”分享”入口，供启动流程识别。
        hashParams.delete('from');
        hashParams.delete('shared');
        hashParams.set('s', '1');
        // [Bug Fix] 先解析 p 再重置 loc：resolvePositionCodeForShare 依赖原始 loc 值判断是否保留 p
        // 如果先 set('loc','0')，函数永远看到 loc=0 导致 p 被丢弃
        const resolvedP = resolvePositionCodeForShare(hashParams, url.searchParams);
        hashParams.set('loc', '0');
        hashParams.set('p', resolvedP);
        hashParams.set(
            'l',
            normalizeLayerIndex(
                hashParams.get('l') ?? hashParams.get('layer'),
                DEFAULT_BASEMAP_LAYER_INDEX,
            ),
        );
        hashParams.delete('layer');

        // 只在罗盘启用时保留 cs 参数，未开启则删除
        if (!compassStore.enabled) {
            hashParams.delete('cs');
        }

        const nextHashQuery = hashParams.toString();
        const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
        url.hash = nextHashQuery ? `${normalizedHashPath}?${nextHashQuery}` : normalizedHashPath;
        return url.toString();
    } catch {
        const text = String(rawHref || '');
        const pCode = extractPositionCodeFromText(text);
        return text.includes('?')
            ? `${text}&s=1&loc=0&p=${encodeURIComponent(pCode)}&l=${DEFAULT_BASEMAP_LAYER_INDEX}`
            : `${text}?s=1&loc=0&p=${encodeURIComponent(pCode)}&l=${DEFAULT_BASEMAP_LAYER_INDEX}`;
    }
}

async function handleShareView() {
    const url = buildShareMarkedUrl(window.location.href);
    // showLoading('正在准备分享链接...');
    try {
        if (canUseNativeShare()) {
            await navigator.share({
                title: 'NEGIAO WebGIS 视角',
                text: '分享当前地图视角链接',
                url,
            });
            syncShareFlagInCurrentUrl();
            message.success('已唤起系统分享面板');
            return;
        }
    } catch (error) {
        if (error && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
            return;
        }
        // 其他错误则回退到剪贴板逻辑
    }

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(url);
        } else {
            fallbackCopyViaExecCommand(url);
        }
        syncShareFlagInCurrentUrl();
        message.success('✅ 视角链接已复制，快去分享吧！');
    } catch (error) {
        message.error('分享链接复制失败', error);
        message.error('复制失败，请手动从地址栏复制链接');
    }
}

onMounted(() => {
    document.addEventListener('click', handleDocumentClick);
});

onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick);
});
</script>

<style scoped>
/* ===================================================== */
/* TopBar 主题适配：所有颜色从 theme.css CSS 变量派生        */
/* 切换 [data-theme] 属性即可自动联动全部色彩                */
/* ===================================================== */

/* ---- 工具类 ---- */
.m-icon {
    margin-right: 8px;
    vertical-align: middle;
    /* 图标继承父元素颜色，配合 currentColor 实现主题联动 */
    color: inherit;
}

/* ==================== 顶部导航栏 ==================== */
.top-bar {
    width: 100%;
    height: 60px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    background: var(--brand-primary);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: var(--shadow-md);
    z-index: 2000;
    position: relative;
}

.branding {
    flex-shrink: 0;
}

.logo-link {
    display: flex;
    align-items: center;
    text-decoration: none;
    color: var(--text-on-brand);
    gap: 12px;
}

.logo-icon {
    height: 40px;
    width: auto;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    transition: transform 0.3s;
}

.logo-link:hover .logo-icon {
    transform: rotate(-10deg) scale(1.1);
}

.title-text {
    font-family: 'Cinzel', 'Times New Roman', serif;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 1px;
    background: linear-gradient(to bottom, var(--text-on-brand), var(--border-light));
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* ==================== 导航按钮 ==================== */
.controls {
    display: flex;
    align-items: center;
    gap: 12px;
}

.btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
}

.btn-text {
    font-size: 16px;
    font-family: 'Cinzel', 'Times New Roman', serif;
}

.menu-host {
    position: relative;
}

.nav-btn {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.9);
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
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.25);
    color: #eee;
}

.nav-btn:active {
    transform: translateY(1px);
}

.magic-btn:hover {
    background: linear-gradient(135deg, rgba(var(--warning-rgb), 0.2), rgba(var(--brand-accent-rgb), 0.2));
    border-color: rgba(var(--warning-rgb), 0.4);
    text-shadow: 0 0 8px rgba(var(--warning-rgb), 0.6);
}

.account-btn {
    background: rgba(var(--brand-accent-light-rgb), 0.2);
    border-color: rgba(var(--brand-accent-light-rgb), 0.35);
}

.account-btn:hover {
    background: rgba(var(--brand-accent-light-rgb), 0.24);
    border-color: rgba(var(--brand-accent-light-rgb), 0.55);
    text-shadow: 0 0 8px rgba(var(--brand-accent-light-rgb), 0.45);
}

/* ===================================================== */
/* ===== 浮动菜单：参照 DrawPanel 风格 =================== */
/* ===================================================== */

.floating-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 12px);
    background: rgba(255, 255, 255, 0.96);
    border-radius: 12px;
    border: 1px solid rgba(229, 236, 230, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    overflow: hidden;
    z-index: 2200;
    box-sizing: border-box;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    animation: menuSlideIn 0.2s ease-out;
}

@keyframes menuSlideIn {
    from {
        opacity: 0;
        transform: translateY(-4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.floating-menu :deep(svg) {
    stroke: currentColor !important;
    transition: stroke 0.2s ease, transform 0.2s ease;
    margin-right: 8px;
}

/* 菜单宽度 */
.tools-menu { width: 280px; }
.magic-menu { width: 260px; }

/* ---- 品牌渐变顶栏（与 DrawPanel panel-header 一致） ---- */
.menu-header {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    background: var(--brand-gradient-header);
    color: white;
}

.menu-header-title {
    font-size: 13px;
    font-weight: 600;
}

/* ---- 菜单内容区 ---- */
.menu-body {
    padding: 10px;
}

/* ---- 2列网格 ---- */
.menu-grid-layout, .magic-grid-layout {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}

/* ---- 菜单单项：白卡片 + 浅绿边框（与 DrawPanel tool-btn 一致） ---- */
.menu-item {
    width: 100%;
    border: 2px solid var(--border-brand-light);
    text-align: left;
    background: white;
    border-radius: 8px;
    padding: 10px 12px;
    color: var(--brand-accent-muted);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    transition: all 0.2s;
}

.menu-item:hover {
    border-color: var(--brand-accent);
    background: var(--bg-hover);
    color: var(--text-brand-dark);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--brand-accent) 25%, transparent);
}

.menu-item:hover :deep(svg) {
    transform: scale(1.08);
}

/* ---- 全宽状态项 ---- */
.status-item, .soup-item {
    grid-column: span 2;
    background: white;
    border: 2px solid var(--border-brand-light);
    color: var(--brand-accent-muted);
}

.status-item:hover, .soup-item:hover {
    border-color: var(--brand-accent);
    background: var(--bg-hover);
    color: var(--text-brand-dark);
}

/* ---- 常用地点标签 ---- */
.quick-loc-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px;
}

.menu-item-quick {
    width: auto;
    padding: 5px 10px;
    background: white;
    border: 2px solid var(--border-brand-light);
    border-radius: 8px;
    font-size: 12px;
    color: var(--brand-accent-muted);
}

.menu-item-quick :deep(svg) {
    margin-right: 4px !important;
}

.menu-item-quick:hover {
    border-color: var(--brand-accent);
    background: var(--bg-hover);
    color: var(--text-brand-dark);
}

/* ---- 分割线 & 分组标题 ---- */
.menu-divider {
    height: 1px;
    margin: 8px 2px;
    background: var(--border-brand-light);
}

.menu-group-title {
    padding: 4px 10px 6px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
}

/* ---- 特效高亮项 ---- */
.highlight-magic {
    background: var(--bg-brand-light);
    border-color: var(--brand-accent);
    color: var(--brand-accent-dark);
    font-weight: bold;
}

.highlight-magic:hover {
    background: linear-gradient(135deg, rgba(var(--brand-accent-rgb), 0.1) 0%, var(--bg-active) 100%) !important;
    border-color: var(--brand-accent);
    color: var(--brand-accent-dark) !important;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--brand-accent) 25%, transparent);
}

/* ---- 特效关闭按钮 ---- */
.magic-close-btn {
    grid-column: span 2;
    justify-content: center;
    color: var(--danger);
    background: #fff0f0;
    border: 2px solid #ffd0d0;
}

.magic-close-btn:hover {
    background: #ffe0e0 !important;
    border-color: #ffb0b0;
    color: var(--danger);
}

/* ==================== 移动端适配 ==================== */
@media (max-width: 768px) {
    .logo-icon {
        height: 30px;
    }

    .top-bar {
        padding: 0 10px;
    }

    .title-text {
        font-size: 16px;
    }

    .controls {
        gap: 6px;
    }

    .nav-btn {
        padding: 5px;
        min-width: 20px;
        justify-content: center;
    }

    .btn-text {
        display: none;
    }

    .btn-icon {
        font-size: 17px;
    }
}
</style>
