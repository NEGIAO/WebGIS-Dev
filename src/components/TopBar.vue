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
                    <button class="menu-item" @click="handleOpenToolbox">🛠️ 工具箱</button>
                    <button class="menu-item" @click="handleOpenBusPlanner">🚌 公交规划</button>
                    <button class="menu-item" @click="handleOpenDrivePlanner">🚗 驾车规划</button>

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
                <span class="btn-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="6" cy="6" r="2" />
                        <circle cx="18" cy="12" r="2" />
                        <circle cx="6" cy="18" r="2" />
                        <path d="M8.5 7.3 15.5 10.3" />
                        <path d="M8.5 16.7 15.5 13.7" />
                    </svg>
                </span>
                <span class="btn-text">分享</span>
            </button>

            <button class="nav-btn" @click="handleOpenChat" title="AI 助手">
                <span class="btn-icon">🤖</span>
                <span class="btn-text">AI 助手</span>
            </button>

            <button class="nav-btn" @click="handleToggle3D" title="切换2D/3D视图">
                <span class="btn-icon">🌍</span>
                <span class="btn-text">3D视图</span>
            </button>

            <button class="nav-btn magic-btn" @click="handleToggleMagic" title="开启魔法特效">
                <span class="btn-icon">✨</span>
                <span class="btn-text">特效</span>
            </button>
        </div>
    </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from '../composables/useMessage';

const emit = defineEmits([
    'toggle-magic',
    'toggle-3d',
    'open-chat',
    'open-toolbox',
    'open-bus',
    'open-drive',
    'activate-feature',
    'jump-view'
]);

const showToolMenu = ref(false);
const menuHostRef = ref(null);

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

function handleOpenChat() {
    emit('activate-feature', { key: 'chat', label: 'AI助手' });
    emit('open-chat');
}

function handleToggle3D() {
    emit('activate-feature', { key: '3d', label: '3D视图' });
    emit('toggle-3d');
}

function handleToggleMagic() {
    emit('activate-feature', { key: 'magic', label: '特效' });
    emit('toggle-magic');
}

function toggleToolMenu() {
    showToolMenu.value = !showToolMenu.value;
}

function handleJump(location) {
    const lng = Number(location.lng);
    const lat = Number(location.lat);
    const z = Number(location.z);
    const layerIndexRaw = Number(location.layer);
    const layerIndex = Number.isInteger(layerIndexRaw) ? layerIndexRaw : 0;

    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(z)) return;

    showToolMenu.value = false;

    // 统一交给 MapContainer 的视图更新入口处理：飞行 + URL replace。
    emit('jump-view', lng, lat, z, layerIndex);
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
        // 其他错误则回退到剪贴板逻辑
    }

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(url);
        } else {
            fallbackCopyViaExecCommand(url);
        }
        message.success('✅ 视角链接已复制，快去分享吧！');
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
    font-size: 25px;
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
    background: rgba(37, 117, 67, 0.88);
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

@media (max-width: 768px) {
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
        padding: 8px;
        min-width: 36px;
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
