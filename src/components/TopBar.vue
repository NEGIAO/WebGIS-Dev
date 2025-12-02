<template>
    <div class="top-bar">
        <h1>
            <a href="https://negiao.github.io">
                <img :src="`${normalizedBase}images/icon.png`" alt="Icon" class="logo-icon">
                <span class="title-text">The science of where!</span>
            </a>
        </h1>
        <div class="controls">
            <button class="nav-btn" @click="$emit('toggle-3d')">
                🌍 3D地球
            </button>
            <button class="nav-btn" @click="$emit('toggle-magic')">
                ✨ 魔法特效
            </button>
        </div>
    </div>
</template>

<script setup>
defineEmits(['toggle-magic', 'toggle-3d']);
const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
</script>

<style scoped>
.top-bar {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, #4ac54e, #2E7D32);
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    box-sizing: border-box;
}

.controls {
    display: flex;
    gap: 10px;
}

.nav-btn {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: white;
    padding: 6px 12px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 5px;
}

.nav-btn:hover {
    background: rgba(255, 255, 255, 0.4);
    transform: scale(1.05);
}

.top-bar h1 {
    margin: 0;
    display: flex;
    align-items: center;
    font-family: 'Times New Roman', Times, serif;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
}

.top-bar a {
    color: white;
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 10px;
}

.logo-icon {
    height: 40px;
    width: auto;
}

.title-text {
    font-size: 24px;
    font-weight: bold;
}

/* Mobile adjustments */
@media (max-width: 768px) {
    .top-bar {
        padding: 0 10px;
    }

    .top-bar h1 {
        font-size: 1.2rem;
    }

    .title-text {
        font-size: 18px;
    }

    .logo-icon {
        height: 30px;
    }
}
</style>
