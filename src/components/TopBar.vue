<template>
    <div class="top-bar">
        <div class="branding">
            <a href="../index.html" class="logo-link">
                <img :src="`${normalizedBase}images/icon.webp`" alt="Icon" class="logo-icon" />
                <span class="title-text">The Science of Where</span>
            </a>
        </div>

        <div class="controls">
            <div class="menu-host" ref="menuHostRef">
                <button class="nav-btn" @click="toggleToolMenu" title="菜单项">
                    <span class="btn-icon">📋</span>
                    <span class="btn-text">菜单</span>
                </button>

                <div v-if="showToolMenu" class="floating-menu">
                    <button class="menu-item" @click="openLayerPanel">🛠️ 工具箱</button>
                    <button class="menu-item" @click="openRoutePanel('bus')">🚌 公交规划</button>
                    <button class="menu-item" @click="openRoutePanel('drive')">🚗 驾车规划</button>

                    <div class="menu-divider"></div>
                    <div class="menu-group-title">常用地点</div>
                    <button
                        v-for="loc in quickLocations"
                        :key="loc.key"
                        class="menu-item menu-item-quick"
                        @click="handleJump(loc)"
                    >
                        <span class="menu-item-icon">❤️</span>
                        <span class="menu-item-label">{{ loc.label }}</span>
                    </button>
                </div>
            </div>

            <button class="nav-btn" @click="handleShareView" title="分享当前视角">
                <span class="btn-icon" aria-hidden="true">🔗</span>
                <span class="btn-text">分享</span>
            </button>

            <button class="nav-btn" @click="openAiPanel" title="AI 助手">
                <span class="btn-icon">🤖</span>
                <span class="btn-text">AI 助手</span>
            </button>

            <button class="nav-btn" @click="handleToggle3D" title="切换 2D/3D 视图">
                <span class="btn-icon">🌍</span>
                <span class="btn-text">{{ mapStateStore.viewMode === '3D' ? '2D视图' : '3D视图' }}</span>
            </button>

            <button class="nav-btn magic-btn" @click="emit('toggle-magic')" title="开启魔法特效">
                <span class="btn-icon">✨</span>
                <span class="btn-text">特效</span>
            </button>
        </div>
    </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from '../composables/useMessage';
import { useAppStore } from '../stores/appStore';
import { useMapStateStore } from '../stores/mapStateStore';
import { useRouteStore } from '../stores/routeStore';

const emit = defineEmits(['toggle-magic', 'toggle-3d']);

const appStore = useAppStore();
const mapStateStore = useMapStateStore();
const routeStore = useRouteStore();

const showToolMenu = ref(false);
const menuHostRef = ref(null);

const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

const message = useMessage();

const quickLocations = [
    { key: 'dengzhou', label: '邓州', center: [112.089596, 32.690537], zoom: 12.01, basemap: 'google' },
    { key: 'hedu', label: '河大', center: [114.30796, 34.813566], zoom: 14.2, basemap: 'google' },
    { key: 'home', label: 'Home', center: [111.843768, 32.723897], zoom: 14.67, basemap: 'google' }
];

function toggleToolMenu() {
    showToolMenu.value = !showToolMenu.value;
}

function openLayerPanel() {
    showToolMenu.value = false;
    if (appStore.activePanel !== 'layer' || !appStore.isSideBarOpen) {
        appStore.togglePanel('layer');
    }
}

function openAiPanel() {
    appStore.togglePanel('ai');
}

function openRoutePanel(mode = 'bus') {
    routeStore.setMode(mode === 'drive' ? 'drive' : 'bus');
    showToolMenu.value = false;
    if (appStore.activePanel !== 'route' || !appStore.isSideBarOpen) {
        appStore.togglePanel('route');
    }
}

function handleToggle3D() {
    emit('toggle-3d');
}

function handleJump(location) {
    mapStateStore.setCenter(location.center);
    mapStateStore.setZoom(location.zoom);
    mapStateStore.setBasemap(location.basemap || 'google');
    showToolMenu.value = false;
}

function handleDocumentClick(event) {
    if (!showToolMenu.value) return;
    if (menuHostRef.value?.contains(event.target)) return;
    showToolMenu.value = false;
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

    textarea.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!succeeded) {
        throw new Error('execCommand copy failed');
    }
}

async function handleShareView() {
    const url = window.location.href;

    try {
        if (canUseNativeShare()) {
            await navigator.share({
                title: 'NEGIAO WebGIS 视角',
                text: '分享当前地图视角链接',
                url
            });
            message.success('已唤起系统分享面板');
            return;
        }
    } catch (error) {
        if (error && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
            return;
        }
    }

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(url);
        } else {
            fallbackCopyViaExecCommand(url);
        }
        message.success('视角链接已复制');
    } catch (error) {
        console.error('分享链接复制失败', error);
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
.top-bar {
    width: 100%;
    height: 60px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    background:
        radial-gradient(circle at 15% 22%, rgba(125, 231, 168, 0.2), transparent 45%),
        linear-gradient(135deg, rgba(20, 88, 57, 0.92), rgba(24, 116, 70, 0.9));
    border-bottom: 1px solid rgba(210, 250, 226, 0.26);
    box-shadow: 0 6px 18px rgba(5, 30, 20, 0.28);
    backdrop-filter: blur(12px);
    position: relative;
}

.logo-link {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: #fff;
}

.logo-icon {
    height: 34px;
}

.title-text {
    font-family: 'Cinzel', 'Times New Roman', serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.7px;
    color: #f8fafc;
}

.controls {
    display: flex;
    align-items: center;
    gap: 10px;
}

.nav-btn {
    border: 1px solid rgba(221, 251, 233, 0.16);
    border-radius: 10px;
    padding: 7px 10px;
    background: linear-gradient(140deg, rgba(221, 251, 233, 0.16), rgba(187, 247, 208, 0.08));
    color: #fff;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 13px;
}

.nav-btn:hover {
    background: linear-gradient(140deg, rgba(221, 251, 233, 0.24), rgba(187, 247, 208, 0.14));
}

.menu-host {
    position: relative;
}

.floating-menu {
    position: absolute;
    top: 42px;
    right: 0;
    min-width: 210px;
    background: linear-gradient(160deg, rgba(248, 253, 250, 0.98), rgba(236, 248, 241, 0.96));
    border: 1px solid rgba(22, 101, 52, 0.2);
    border-radius: 12px;
    box-shadow: 0 16px 30px rgba(8, 35, 25, 0.24);
    padding: 8px;
    z-index: 1300;
}

.menu-item {
    width: 100%;
    text-align: left;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #111827;
    padding: 8px 10px;
    cursor: pointer;
    font-size: 13px;
}

.menu-item:hover {
    background: rgba(217, 247, 227, 0.9);
}

.menu-divider {
    height: 1px;
    margin: 6px 0;
    background: rgba(17, 24, 39, 0.12);
}

.menu-group-title {
    font-size: 11px;
    font-weight: 700;
    color: #6b7280;
    padding: 2px 8px 6px;
}

.menu-item-quick {
    display: flex;
    align-items: center;
    gap: 8px;
}

@media (max-width: 768px) {
    .top-bar {
        padding: 0 10px;
    }

    .title-text {
        display: none;
    }

    .btn-text {
        display: none;
    }
}
</style>
