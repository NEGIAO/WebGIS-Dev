<template>
    <div class="top-bar">
        <div class="branding">
            <a href="../index.html" class="logo-link">
                <img :src="`${normalizedBase}images/icon.png`" alt="Icon" class="logo-icon" />
                <span class="title-text">The Science of Where</span>
            </a>
        </div>

        <div class="controls">
            <button class="nav-btn" @click="handleOpenToolbox" title="工具箱">
                <span class="btn-icon">🛠️</span>
                <span class="btn-text">工具箱</span>
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
const emit = defineEmits([
    'toggle-magic',
    'toggle-3d',
    'open-chat',
    'open-toolbox',
    'activate-feature'
]);

const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

function handleOpenToolbox() {
    emit('activate-feature', { key: 'toolbox', label: '工具箱' });
    emit('open-toolbox');
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
