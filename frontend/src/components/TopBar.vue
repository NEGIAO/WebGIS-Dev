<template>
    <div class="top-bar">
        <div class="branding">
            <a href="../index.html" class="logo-link">
                <img :src="`${normalizedBase}images/icon.webp`" alt="Icon" class="logo-icon" />
                <span class="title-text">The Science of Where！</span>
            </a>
        </div>

<div class="controls">
        <div class="menu-host" ref="menuHostRef">
            <button class="nav-btn" @click="toggleToolMenu" title="菜单项">
                <span class="btn-icon">
                    <list-icon :size="18" color="#ffffff" :stroke-width="2" />
                </span>
                <span class="btn-text">菜单</span>
            </button>
            <div v-if="showToolMenu" class="floating-menu">
                <button class="menu-item" @click="handleOpenToolbox">
                    <layers-icon :size="16" color="#38BDF8" class="m-icon" /> 图层管理
                </button>
                <button class="menu-item" @click="handleOpenCompass">
                    <compass-icon :size="16" color="#FB923C" class="m-icon" /> 风水罗盘
                </button>
                <button class="menu-item" @click="handleOpenBusPlanner">
                    <bus-icon :size="16" color="#4ADE80" class="m-icon" /> 公交规划
                </button>
                <button class="menu-item" @click="handleOpenDrivePlanner">
                    <car-icon :size="16" color="#F472B6" class="m-icon" /> 驾车规划
                </button>
                <button class="menu-item" @click="handleToggleWeatherBoard">
                    <span class="menu-item-icon">
                        <component 
                            :is="isWeatherBoardMode ? MapIcon : CloudSunIcon" 
                            :size="16" 
                            :color="isWeatherBoardMode ? '#38BDF8' : '#FACC15'"
                            class="m-icon"
                        />
                    </span>
                    {{ isWeatherBoardMode ? '返回地图视图' : '天气看板' }}
                </button>
                
                <div class="menu-divider"></div>
                <div class="menu-group-title">常用地点</div>
                <button
                    v-for="loc in quickLocations"
                    :key="loc.key"
                    class="menu-item menu-item-quick"
                    @click="handleJump(loc)"
                >
                    <span class="menu-item-icon">
                        <map-pin-icon :size="18" color="#4ADE80" style="margin: 0 10px;" />
                    </span>
                    <span class="menu-item-label">{{ loc.label }}</span>
                </button>
                <div class="menu-divider"></div>
                <button class="menu-item" @click="handleSoup" title="来点鸡汤">
                    <smile-icon :size="16" color="white" class="m-icon" /> 鸡汤
                </button>
            </div>
        </div>

        <button class="nav-btn" @click="handleShareView" title="分享当前视角">
            <span class="btn-icon">
                <share-2-icon :size="18" color="white" :stroke-width="1.8" />
            </span>
            <span class="btn-text">分享</span>
        </button>

        <button class="nav-btn" @click="handleOpenChat" title="AI 助手">
            <span class="btn-icon">
                <bot-icon :size="20" color="white" :stroke-width="2" />
            </span>
            <span class="btn-text">AI 助手</span>
        </button>

        <button class="nav-btn" @click="handleToggle3D" title="切换2D/3D视图">
            <span class="btn-icon">
                <GlobeIcon :size="18" color="white" :stroke-width="2" />
            </span>
            <span class="btn-text">3D视图</span>
        </button>

        <div class="menu-host" ref="magicMenuHostRef">
            <button class="nav-btn magic-btn" @click="toggleMagicMenu" title="魔法特效选项">
                <span class="btn-icon">
                    <sparkles-icon :size="18" color="white" :stroke-width="2" />
                </span>
                <span class="btn-text">特效</span>
            </button>
            <div v-if="showMagicMenu" class="floating-menu">
                <button class="menu-item" @click="handleActivateMagic('fluid')">
                    <wind-icon :size="16" color="#94A3B8" class="m-icon" /> 流体烟雾
                </button>
                <button class="menu-item" @click="handleActivateMagic('gravity')">
                    <orbit-icon :size="16" color="#818CF8" class="m-icon" /> 引力场
                </button>
                <button class="menu-item" @click="handleActivateMagic('void')">
                    <aperture-icon :size="16" color="#A78BFA" class="m-icon" /> 维度塌陷
                </button>
                <button class="menu-item" @click="handleActivateMagic('wave')">
                    <waves-icon :size="16" color="#2DD4BF" class="m-icon" /> 量子波
                </button>
                <button class="menu-item highlight-magic" @click="handleActivateMagic('singularity')">
                    <circle-dot-icon :size="16" color="#1E293B" class="m-icon" /> 黑洞引力
                </button>
                <div class="menu-divider"></div>
                <button class="menu-item magic-close-btn" @click="handleActivateMagic('off')">
                    <circle-x-icon :size="16" color="#EF4444" class="m-icon" /> 关闭特效
                </button>
            </div>
        </div>
</div>
    </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from '../composables/useMessage';
import { DEFAULT_BASEMAP_LAYER_INDEX } from '../constants';
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
    CircleX as CircleXIcon
} from 'lucide-vue-next';
import { Globe as GlobeIcon } from 'lucide-vue-next';

const props = defineProps({
    isWeatherBoardMode: {
        type: Boolean,
        default: false
    }
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
    'jump-view'
]);

const showToolMenu = ref(false);
const showMagicMenu = ref(false);
const menuHostRef = ref(null);
const magicMenuHostRef = ref(null);

const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

const message = useMessage();

//地点迁移
const quickLocations = [
    { key: 'dengzhou', label: '邓州', lng: 112.089596, lat: 32.690537, z: 12.01, layer: 0 },
    { key: 'hedu', label: '河大', lng: 114.307960, lat: 34.813566, z: 11.83, layer: 0 },
    { key: 'home', label: 'Home', lng: 111.843768, lat: 32.723897, z: 14.67, layer: 0 },
    { key: '51Area', label: '51区', lng: -115.808771, lat: 37.238119, z: 14.98, layer: 3 }
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
        label: props.isWeatherBoardMode ? '地图视图' : '天气看板'
    });
    emit('toggle-weather-board');
}

function handleOpenChat() {
    emit('activate-feature', { key: 'chat', label: 'AI助手' });
    emit('open-chat');
}

function handleToggle3D() {
    emit('activate-feature', { key: '3d', label: '3D视图' });
    emit('toggle-3d');
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
    const layerIndex = Number.isInteger(layerIndexRaw) ? layerIndexRaw : DEFAULT_BASEMAP_LAYER_INDEX;

    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(z)) return;

    showToolMenu.value = false;

    // 统一交给 MapContainer 的视图更新入口处理：飞行 + URL replace。
    emit('jump-view', lng, lat, z, layerIndex);
}

function handleSoup() {
    showToolMenu.value = false;
    message.soup();
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
    } catch (e) {
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

function normalizeBinaryFlag(value, fallback = '0') {
    const text = String(value ?? '').trim().toLowerCase();
    if (text === '1' || text === 'true') return '1';
    if (text === '0' || text === 'false') return '0';
    return fallback === '1' ? '1' : '0';
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

function resolvePositionCodeForShare(hashParams, searchParams) {
    const hashCode = normalizePositionCode(hashParams?.get('p'), '');
    if (hashCode) return hashCode;

    const searchCode = normalizePositionCode(searchParams?.get('p'), '');
    if (searchCode) return searchCode;

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
        const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));

        hashParams.delete('from');
        hashParams.delete('shared');
        hashParams.set('s', '1');
        hashParams.set('loc', normalizeBinaryFlag(hashParams.get('loc'), '0'));
        hashParams.set('p', resolvePositionCodeForShare(hashParams, searchParams));
        hashParams.set('l', normalizeLayerIndex(hashParams.get('l') ?? hashParams.get('layer'), DEFAULT_BASEMAP_LAYER_INDEX));
        hashParams.delete('layer');

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

        // 标记该链接来自“分享”入口，供启动流程识别。
        hashParams.delete('from');
        hashParams.delete('shared');
        hashParams.set('s', '1');
        hashParams.set('loc', '0');
        hashParams.set('p', resolvePositionCodeForShare(hashParams, url.searchParams));
        hashParams.set('l', normalizeLayerIndex(hashParams.get('l') ?? hashParams.get('layer'), DEFAULT_BASEMAP_LAYER_INDEX));
        hashParams.delete('layer');

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
                url
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

.m-icon {
    margin-right: 8px;
    vertical-align: middle;
}
.top-bar {
    width: 100%;
    height: 60px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    background: #4caf50;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
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
    color: #fff;
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
    background: linear-gradient(to bottom, #fff, #e0e0e0);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.controls {
    display: flex;
    align-items: center;
    gap: 12px;
}

.btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.menu-host {
    position: relative;
}

.floating-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    min-width: 168px;
    background: #438a45d1;
    border-radius: 10px;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.24);
    border: 1px solid rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 6px;
    z-index: 2200;
}

.menu-divider {
    height: 1px;
    margin: 6px 4px;
    background: rgba(255, 255, 255, 0.2);
}

.menu-group-title {
    padding: 4px 10px 6px;
    color: rgba(232, 250, 236, 0.9);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.4px;
}

.menu-item {
    width: 100%;
    border: none;
    text-align: left;
    background: transparent;
    border-radius: 8px;
    padding: 8px 10px;
    color: #f3fff4;
    cursor: pointer;
    font-size: 13px;
}

.menu-item:hover {
    background: rgba(255, 255, 255, 0.15);
}

.menu-item-quick {
    display: flex;
    align-items: center;
    gap: 8px;
}

.menu-item-icon {
    opacity: 0.95;
}

.menu-item-label {
    min-width: 0;
}

.nav-btn {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.25);
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

.magic-btn:hover {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 105, 180, 0.2));
    border-color: rgba(255, 215, 0, 0.4);
    text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
}

.highlight-magic {
    color: #ff9800;
    font-weight: bold;
}
.highlight-magic:hover {
    background: rgba(255, 152, 0, 0.15) !important;
}

.magic-close-btn {
    color: #f80004;
}
.magic-close-btn:hover {
    background: rgba(255, 77, 79, 0.15) !important;
}

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
