<template>
    <Teleport to="body">
        <transition name="loading-fade">
            <div
                v-if="loading"
                class="global-loading-mask"
                role="status"
                aria-live="polite"
                aria-busy="true"
            >
                <div class="loading-shell">
                    <div class="hud-loader">
                        <svg class="sci-fi-ring" viewBox="0 0 100 100">
                            <circle class="ring-outer" cx="50" cy="50" r="45"></circle>
                            <circle class="ring-middle" cx="50" cy="50" r="36"></circle>
                            <polygon class="ring-inner" points="50,20 76,65 24,65"></polygon>
                        </svg>
                        <div class="radar-sweep"></div>
                        <div class="core-glow"></div>
                    </div>
                    <div class="hud-text-container">
                        <div class="loading-title">
                            <span class="glitch" :data-text="resolvedLoadingText">{{ resolvedLoadingText }}</span>
                        </div>
                        <div class="loading-subtitle">
                            <span>{{ loadingHint.replace(/\.+$/, '') }}</span>
                            <span class="dots">{{ '.'.repeat(dotFrame % 4) }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../stores';

const appStore = useAppStore();
const { loading, loadingText } = storeToRefs(appStore);

const dotFrame = ref(0);
let dotTimer = null;

const resolvedLoadingText = computed(() => {
    const text = String(loadingText.value || '').trim();
    return text || '正在加载，请稍候...';
});

const loadingHint = computed(() => {
    const dots = '.'.repeat(dotFrame.value % 4);
    return `正在努力加载中ing${dots}`;
});

function startHintAnimation() {
    if (dotTimer !== null) return;
    dotTimer = window.setInterval(() => {
        dotFrame.value = (dotFrame.value + 1) % 4;
    }, 360);
}

function stopHintAnimation() {
    if (dotTimer === null) return;
    window.clearInterval(dotTimer);
    dotTimer = null;
    dotFrame.value = 0;
}

watch(loading, (visible) => {
    if (visible) {
        startHintAnimation();
    } else {
        stopHintAnimation();
    }
}, { immediate: true });

onBeforeUnmount(() => {
    stopHintAnimation();
});
</script>

<style scoped>
.global-loading-mask {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none; /* 允许点击穿透 */
    /* 添加一个平缓的径向暗色阴影，增加发光元件在浅色/卫星底图上的对比度，同时保持四周透明 */
    background: radial-gradient(circle at center, rgba(10, 20, 15, 0.6) 0%, rgba(10, 20, 15, 0.4) 25%, transparent 70%);
}

.loading-shell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* 增加悬浮壳子本身的背部阴影以进一步提升与底图的抽离感 */
    filter: drop-shadow(0 15px 35px rgba(0, 0, 0, 0.6));
}

/* HUD Loader Container */
.hud-loader {
    position: relative;
    width: 90px;
    height: 90px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 0 15px rgba(91, 207, 137, 0.4));
}

/* Sci-fi SVG Ring */
.sci-fi-ring {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    overflow: visible;
}

.ring-outer {
    fill: none;
    stroke: rgba(91, 207, 137, 0.4);
    stroke-width: 1.5;
    stroke-dasharray: 4 4 12 4;
    transform-origin: center;
    animation: rotate-clockwise 15s linear infinite;
}

.ring-middle {
    fill: none;
    stroke: #5bcf89;
    stroke-width: 2.5;
    stroke-dasharray: 40 20 60 20;
    transform-origin: center;
    animation: rotate-counter-clockwise 3s cubic-bezier(0.68, -0.15, 0.265, 1.15) infinite;
    filter: drop-shadow(0 0 8px #5bcf89);
}

.ring-inner {
    fill: rgba(63, 181, 109, 0.15);
    stroke: #3fb56d;
    stroke-width: 1.5;
    transform-origin: center;
    animation: pulse-triangle 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* Radar Sweep Effect */
.radar-sweep {
    position: absolute;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 70%, rgba(91, 207, 137, 0.5) 100%);
    animation: rotate-clockwise 1.5s linear infinite;
    mask-image: radial-gradient(circle, transparent 40%, black 100%);
    -webkit-mask-image: radial-gradient(circle, transparent 40%, black 100%);
}

.core-glow {
    position: absolute;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #5bcf89;
    filter: blur(10px);
    animation: core-pulse 2s ease-in-out infinite;
}

/* Text Container */
.hud-text-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(14, 28, 20, 0.6);
    padding: 12px 28px;
    border-radius: 6px;
    border-left: 2px solid #5bcf89;
    border-right: 2px solid rgba(91, 207, 137, 0.3);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 0 15px rgba(91, 207, 137, 0.15);
    position: relative;
    overflow: hidden;
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}

.hud-text-container::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, #5bcf89, transparent);
    animation: scan-line 2s linear infinite;
}

.loading-title {
    color: #ffffff;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    text-shadow: 0 0 10px rgba(91, 207, 137, 0.8);
    position: relative;
}

.loading-subtitle {
    margin-top: 6px;
    display: flex;
    color: #a0ddb6;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    letter-spacing: 1px;
    opacity: 0.9;
}

.dots {
    display: inline-block;
    min-width: 24px;
    text-align: left;
}

/* Animations */
@keyframes rotate-clockwise {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

@keyframes rotate-counter-clockwise {
    0% { transform: rotate(360deg); }
    100% { transform: rotate(0deg); }
}

@keyframes pulse-triangle {
    0%, 100% { transform: scale(0.85); opacity: 0.6; filter: drop-shadow(0 0 4px rgba(63, 181, 109, 0.5)); }
    50% { transform: scale(1.05) rotate(180deg); opacity: 1; filter: drop-shadow(0 0 12px rgba(63, 181, 109, 0.9)); }
}

@keyframes core-pulse {
    0%, 100% { opacity: 0.4; transform: scale(0.8); }
    50% { opacity: 0.8; transform: scale(1.5); }
}

@keyframes scan-line {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

.loading-fade-enter-active,
.loading-fade-leave-active {
    transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.loading-fade-enter-from,
.loading-fade-leave-to {
    opacity: 0;
    transform: translateY(20px) scale(0.9);
}
</style>
