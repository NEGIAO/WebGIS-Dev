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
                <span class="title-text">{{ t('topbar.slogan') }}</span>
            </a>
        </div>

        <div class="controls">
            <div
                ref="menuHostRef"
                class="menu-host"
            >
                <button
                    class="nav-btn"
                    :title="t('topbar.menuTitle')"
                    @click="toggleToolMenu"
                >
                    <span class="btn-icon">
                        <list-icon
                            :size="18"
                            :stroke-width="2"
                        />
                    </span>
                    <span class="btn-text">{{ t('topbar.menu') }}</span>
                </button>
                <div
                    v-if="showToolMenu"
                    class="floating-menu tools-menu"
                >
                    <div class="menu-header">
                        <span class="menu-header-title">{{ t('topbar.featureMenu') }}</span>
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
                                {{ t('topbar.layerManage') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleOpenCompass"
                            >
                                <compass-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.compass') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleOpenBusPlanner"
                            >
                                <bus-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.busPlanner') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleOpenDrivePlanner"
                            >
                                <car-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.drivePlanner') }}
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
                            {{ isWeatherBoardMode ? t('topbar.backToMap') : t('topbar.weatherBoard') }}
                        </button>

                        <button
                            class="menu-item status-item"
                            @click="handleToggleLogMonitor"
                        >
                            <activity-icon
                                :size="16"
                                class="m-icon"
                            />
                            {{ logMonitorVisible ? t('topbar.closeLogMonitor') : t('topbar.logMonitor') }}
                        </button>

                        <div class="menu-divider"></div>
                        <div class="menu-group-title">{{ t('topbar.quickLocations') }}</div>

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
                            :title="t('topbar.soupTitle')"
                            @click="handleSoup"
                        >
                            <smile-icon
                                :size="16"
                                class="m-icon"
                            />
                            {{ t('topbar.soup') }}
                        </button>
                    </div>
                </div>
            </div>

            <button
                class="nav-btn"
                :title="t('topbar.shareTitle')"
                @click="handleShareView"
            >
                <span class="btn-icon">
                    <share-2-icon
                        :size="18"
                        :stroke-width="1.8"
                    />
                </span>
                <span class="btn-text">{{ t('topbar.share') }}</span>
            </button>

            <button
                class="nav-btn"
                :title="t('topbar.aiAssistant')"
                @click="handleOpenChat"
            >
                <span class="btn-icon">
                    <bot-icon
                        :size="20"
                        :stroke-width="2"
                    />
                </span>
                <span class="btn-text">{{ t('topbar.aiAssistant') }}</span>
            </button>

            <button
                class="nav-btn"
                :title="t('topbar.toggleViewTitle')"
                @click="handleToggle3D"
            >
                <span class="btn-icon">
                    <GlobeIcon
                        :size="18"
                        :stroke-width="2"
                    />
                </span>
                <span class="btn-text">
                    {{ is3DMode ? t('topbar.view2d') : t('topbar.view3d') }}
                </span>
            </button>

            <button
                class="nav-btn"
                :title="t('topbar.userCenterTitle')"
                @click="handleToggleAccountCenter"
            >
                <span class="btn-icon">
                    <user-icon
                        :size="18"
                        :stroke-width="2"
                    />
                </span>
                <span class="btn-text">{{ t('topbar.userCenter') }}</span>
            </button>

            <div
                ref="magicMenuHostRef"
                class="menu-host"
            >
                <button
                    class="nav-btn magic-btn"
                    :title="t('topbar.magicEffectsTitle')"
                    @click="toggleMagicMenu"
                >
                    <span class="btn-icon">
                        <sparkles-icon
                            :size="18"
                            :stroke-width="2"
                        />
                    </span>
                    <span class="btn-text">{{ t('topbar.magicEffects') }}</span>
                </button>
                <div
                    v-if="showMagicMenu"
                    class="floating-menu magic-menu"
                >
                    <div class="menu-header">
                        <span class="menu-header-title">{{ t('topbar.magicEffects') }}</span>
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
                                {{ t('topbar.fluid') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('gravity')"
                            >
                                <orbit-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.gravity') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('void')"
                            >
                                <aperture-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.void') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('wave')"
                            >
                                <waves-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.wave') }}
                            </button>
                            <button
                                class="menu-item highlight-magic"
                                @click="handleActivateMagic('singularity')"
                            >
                                <circle-dot-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.singularity') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('ring-explosion')"
                            >
                                <circle-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.ringExplosion') }}
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
                            {{ t('topbar.closeEffects') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { ASSET_BASE_URL } from '@/config/publicRuntime';
import { DEFAULT_BASEMAP_LAYER_INDEX } from '@/constants';
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
} from '@lucide/vue';
import { Globe as GlobeIcon } from '@lucide/vue';
import { useAppStore } from '@common/app/stores/useAppStore';
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

const { t } = useLocale();
const showToolMenu = ref(false);
const showMagicMenu = ref(false);
const menuHostRef = ref(null);
const magicMenuHostRef = ref(null);

// 日志监控状态
const appStore = useAppStore();
const { logMonitorVisible } = storeToRefs(appStore);

const normalizedBase = ASSET_BASE_URL.endsWith('/') ? ASSET_BASE_URL : `${ASSET_BASE_URL}/`;

// 本组件在 HomeView 懒加载链路中,79.5KB 的 webp 不影响登录页首屏)
const faviconUrl = `${normalizedBase}images/icon.webp`;

const message = useMessage();

/** 常用地点坐标常量；label 经 i18n 计算，随语言切换更新 */
const QUICK_LOCATION_COORDS = Object.freeze([
    { key: 'dengzhou', labelKey: 'topbar.locations.dengzhou', lng: 112.089596, lat: 32.690537, z: 12.01, layer: 0 },
    { key: 'hedu', labelKey: 'topbar.locations.hedu', lng: 114.30796, lat: 34.813566, z: 11.83, layer: 0 },
    { key: 'home', labelKey: 'topbar.locations.home', lng: 111.843768, lat: 32.723897, z: 14.67, layer: 0 },
    { key: '51Area', labelKey: 'topbar.locations.area51', lng: -115.808771, lat: 37.238119, z: 14.98, layer: 6 },
    { key: 'China', labelKey: 'topbar.locations.china', lng: 116.397451, lat: 39.908722, z: 4.5, layer: 21 },
]);

const quickLocations = computed(() =>
    QUICK_LOCATION_COORDS.map((loc) => ({
        ...loc,
        label: t(loc.labelKey),
    })),
);

function handleOpenToolbox() {
    showToolMenu.value = false;
    emit('activate-feature', { key: 'toolbox', label: t('topbar.layerManage') });
    emit('open-toolbox');
}

function handleOpenCompass() {
    showToolMenu.value = false;
    emit('activate-feature', { key: 'compass', label: t('topbar.compass') });
    emit('open-compass');
}

function handleOpenBusPlanner() {
    showToolMenu.value = false;
    emit('activate-feature', { key: 'bus', label: t('topbar.busPlanner') });
    emit('open-bus');
}

function handleOpenDrivePlanner() {
    showToolMenu.value = false;
    emit('activate-feature', { key: 'drive', label: t('topbar.drivePlanner') });
    emit('open-drive');
}

function handleToggleWeatherBoard() {
    showToolMenu.value = false;
    emit('activate-feature', {
        key: props.isWeatherBoardMode ? 'map' : 'weather-board',
        label: props.isWeatherBoardMode ? t('topbar.mapView') : t('topbar.weatherBoard'),
    });
    emit('toggle-weather-board');
}

function handleOpenChat() {
    emit('activate-feature', { key: 'chat', label: t('topbar.aiAssistant') });
    emit('open-chat');
}

const is3DMode = ref(false);

function handleToggle3D() {
    is3DMode.value = !is3DMode.value;
    emit('activate-feature', {
        key: '3d',
        label: is3DMode.value ? t('topbar.view3d') : t('topbar.view2d'),
    });
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
    emit('activate-feature', { key: 'magic', label: t('topbar.effectLabel') });
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
    message.info(
        logMonitorVisible.value
            ? t('controls.logMonitorOpened')
            : t('controls.logMonitorClosed'),
    );
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

/**
 * 分享链接黑名单：这 3 个参数为用户私有信息，分享时一律清空。
 * ut  = 用户身份（guest/admin/registered）
 * loc = 定位授权来源（gps/ip）
 * p   = 编码后的 GPS 精准位置
 * 其余参数（lng、lat、z、l、view、cv、cs 等）全部保留，用于还原分享者的视图与位置状态。
 */
const SHARE_EXCLUDED_PARAMS = ['ut', 'loc', 'p'];

function syncShareFlagInCurrentUrl() {
    if (typeof window === 'undefined') return;

    try {
        const hash = String(window.location.hash || '#/home');
        const hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
        const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
        const hashPath = hashPathRaw || '/home';
        const hashParams = new URLSearchParams(hashQueryRaw);

        // 删除用户私有参数
        for (const key of SHARE_EXCLUDED_PARAMS) {
            hashParams.delete(key);
        }
        // layer 是 l 的历史别名，统一归一化为 l
        hashParams.set(
            'l',
            normalizeLayerIndex(
                hashParams.get('l') ?? hashParams.get('layer'),
                DEFAULT_BASEMAP_LAYER_INDEX,
            ),
        );
        hashParams.delete('layer');
        // 分享入口标记
        hashParams.set('s', '1');

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

/**
 * 构建分享链接：清空 ut、loc、p 三个用户私有参数，其余参数全部保留以还原视图状态。
 */
function buildShareMarkedUrl(rawHref) {
    try {
        const url = new URL(rawHref, window.location.origin);
        const hashText = String(url.hash || '');
        const hashWithoutSharp = hashText.startsWith('#') ? hashText.slice(1) : hashText;
        const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
        const hashPath = hashPathRaw || '/home';
        const hashParams = new URLSearchParams(hashQueryRaw);

        // 删除用户私有参数
        for (const key of SHARE_EXCLUDED_PARAMS) {
            hashParams.delete(key);
        }
        // layer 是 l 的历史别名，统一归一化为 l
        hashParams.set(
            'l',
            normalizeLayerIndex(
                hashParams.get('l') ?? hashParams.get('layer'),
                DEFAULT_BASEMAP_LAYER_INDEX,
            ),
        );
        hashParams.delete('layer');
        // 分享入口标记
        hashParams.set('s', '1');

        const nextHashQuery = hashParams.toString();
        const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
        url.hash = nextHashQuery ? `${normalizedHashPath}?${nextHashQuery}` : normalizedHashPath;
        return url.toString();
    } catch {
        // 降级：无法解析 URL 时，直接在原始链接上追加最小标记
        const text = String(rawHref || '');
        return text.includes('?')
            ? `${text}&s=1&l=${DEFAULT_BASEMAP_LAYER_INDEX}`
            : `${text}?s=1&l=${DEFAULT_BASEMAP_LAYER_INDEX}`;
    }
}

async function handleShareView() {
    const url = buildShareMarkedUrl(window.location.href);
    // showLoading('正在准备分享链接...');
    try {
        if (canUseNativeShare()) {
            await navigator.share({
                title: t('topbar.shareNativeTitle'),
                text: t('topbar.shareNativeText'),
                url,
            });
            syncShareFlagInCurrentUrl();
            message.success(t('topbar.sharePanelOpened'));
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
        message.success(t('topbar.shareCopied'));
    } catch (error) {
        message.error(t('topbar.shareCopyFailed'), error);
        message.error(t('topbar.shareManualCopy'));
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
    z-index: var(--z-modal);
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
    z-index: var(--z-modal-high);
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
