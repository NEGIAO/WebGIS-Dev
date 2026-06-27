<template>
    <Transition name="nav-guide-fade">
        <div
            v-if="navTarget"
            class="nav-guide-hud"
            :class="{ arrived: isArrived }"
        >
            <div class="hud-bg-glow"></div>
            
            <div class="hud-info-panel">
                <div class="hud-tag">
                    <span class="tag-dot"></span>
                    <span class="tag-text">NAV_TRACKING</span>
                </div>
                <div class="nav-target-name">
                    <span class="nav-name">{{ navTarget.name }}</span>
                </div>
                <div class="nav-distance-wrapper">
                    <span class="dist-label">DIST //</span>
                    <span class="nav-distance">
                        {{ isArrived ? 'ARRIVED' : formatDistance(navTarget.distance) }}
                    </span>
                </div>
            </div>

            <div class="hud-compass-panel">
                <div class="compass-dial">
                    <div class="dial-scale"></div>
                    <div class="dial-scale rotate-45"></div>
                    <div
                        class="compass-arrow-container"
                        :style="{ transform: `rotate(${arrowAngle}deg)` }"
                    >
                        <span class="hud-pointer"></span>
                    </div>
                    <div class="compass-center">
                        <span class="center-core"></span>
                    </div>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    navTarget: {
        type: Object,
        default: null,
    },
});

const ARRIVED_THRESHOLD = 10; // 到达判定距离（米）

/** 是否已到达 */
const isArrived = computed(() => {
    return props.navTarget?.distance != null && props.navTarget.distance < ARRIVED_THRESHOLD;
});

/** 箭头旋转角度 */
const arrowAngle = computed(() => {
    return props.navTarget?.bearing ?? 0;
});

/** 格式化距离显示 */
function formatDistance(dist) {
    if (dist == null) return '0.0 m';
    if (dist < 1000) return `${Math.round(dist)} m`;
    return `${(dist / 1000).toFixed(2)} km`;
}
</script>

<style scoped>
/* ==========================================================================
   1. 整体 HUD 框架与玻璃流光质感
   ========================================================================== */
.nav-guide-hud {
    position: fixed;
    top: 55px; /* 略微往上提，给三维视野留出空间 */
    left: 50%;
    transform: translateX(-50%);
    z-index: 9997;
    pointer-events: none;
    
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 12px 24px;
    
    background: linear-gradient(135deg, rgba(5, 20, 35, 0.9) 0%, rgba(2, 10, 18, 0.95) 100%);
    border: 1px solid rgba(0, 255, 255, 0.3);
    /* 切角科幻造型（通过裁剪路径实现，避免死板的正方形） */
    clip-path: polygon(0 0, 92% 0, 100% 30%, 100% 100%, 8% 100%, 0 70%);
    
    box-shadow: 
        0 10px 30px rgba(0, 0, 0, 0.5),
        inset 0 0 15px rgba(0, 255, 255, 0.1);
    backdrop-filter: blur(6px);
    transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

/* 霓虹底色流光 */
.hud-bg-glow {
    position: absolute;
    bottom: 0;
    left: 10%;
    width: 80%;
    height: 1px;
    background: linear-gradient(90deg, transparent, #00ffff, transparent);
    box-shadow: 0 0 8px #00ffff;
    filter: blur(1px);
}

/* ==========================================================================
   2. 左翼信息区：军工数据流布局
   ========================================================================== */
.hud-info-panel {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 150px;
}

.hud-tag {
    display: flex;
    align-items: center;
    gap: 6px;
}

.tag-dot {
    width: 4px;
    height: 4px;
    background: #00ffff;
    box-shadow: 0 0 6px #00ffff;
    border-radius: 50%;
    animation: blink 1.5s infinite steps(2);
}

.tag-text {
    font-size: 9px;
    color: rgba(0, 255, 255, 0.6);
    font-family: 'Courier New', monospace;
    letter-spacing: 1px;
    font-weight: bold;
}

.nav-target-name {
    font-size: 16px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 1px;
    text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.nav-distance-wrapper {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 2px;
}

.dist-label {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.3);
    font-family: 'Courier New', monospace;
}

.nav-distance {
    font-size: 15px;
    font-weight: 700;
    color: #00ffff;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    text-shadow: 0 0 6px rgba(0, 255, 255, 0.3);
}

/* ==========================================================================
   3. 右翼罗盘区：高精度数字化电子圆盘
   ========================================================================== */
.hud-compass-panel {
    flex-shrink: 0;
}

.compass-dial {
    position: relative;
    width: 52px;
    height: 52px;
    border: 2px dashed rgba(0, 255, 255, 0.25);
    border-radius: 50%;
    background: rgba(0, 255, 255, 0.02);
    display: flex;
    align-items: center;
    justify-content: center;
}

/* 十字刻度线 */
.dial-scale {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
}
.dial-scale::before, .dial-scale::after {
    content: '';
    position: absolute;
    background: rgba(0, 255, 255, 0.4);
}
.dial-scale::before { top: 0; left: 50%; width: 1px; height: 4px; transform: translateX(-50%); }
.dial-scale::after { bottom: 0; left: 50%; width: 1px; height: 4px; transform: translateX(-50%); }

.rotate-45 { transform: rotate(90deg); } /* 横向刻度 */

/* 核心旋转容器 */
.compass-arrow-container {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);
}

/* 数字化尖锐指针（用纯 CSS 绘制战术箭头） */
.hud-pointer {
    position: absolute;
    top: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 12px solid #00ffff;
    filter: drop-shadow(0 0 4px #00ffff);
}

.compass-center {
    width: 12px;
    height: 12px;
    border: 1px solid rgba(0, 255, 255, 0.4);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(2, 10, 18, 1);
}

.center-core {
    width: 4px;
    height: 4px;
    background: #00ffff;
    border-radius: 50%;
    box-shadow: 0 0 6px #00ffff;
}

/* ==========================================================================
   4. 到达目的地的绿色脉冲状态变换 (State: ARRIVED)
   ========================================================================== */
.nav-guide-hud.arrived {
    border-color: rgba(0, 255, 170, 0.5);
    background: linear-gradient(135deg, rgba(3, 28, 22, 0.95) 0%, rgba(1, 12, 10, 0.98) 100%);
    box-shadow: 
        0 10px 35px rgba(0, 255, 170, 0.2),
        inset 0 0 15px rgba(0, 255, 170, 0.15);
}

.arrived .hud-bg-glow {
    background: linear-gradient(90deg, transparent, #00ffaa, transparent);
    box-shadow: 0 0 10px #00ffaa;
}

.arrived .tag-dot, 
.arrived .center-core {
    background: #00ffaa;
    box-shadow: 0 0 8px #00ffaa;
}

.arrived .tag-text,
.arrived .nav-distance {
    color: #00ffaa;
    text-shadow: 0 0 8px rgba(0, 255, 170, 0.5);
}

.arrived .compass-dial {
    border-color: rgba(0, 255, 170, 0.4);
    background: rgba(0, 255, 170, 0.04);
}

.arrived .dial-scale::before, 
.arrived .dial-scale::after {
    background: rgba(0, 255, 170, 0.6);
}

.arrived .hud-pointer {
    border-bottom-color: #00ffaa;
    filter: drop-shadow(0 0 6px #00ffaa);
    animation: pulse 1s infinite alternate; /* 到达后指针轻微扩张呼吸 */
}

/* ==========================================================================
   5. 动效与进入过渡 (Transition Definitions)
   ========================================================================== */
.nav-guide-fade-enter-active,
.nav-guide-fade-leave-active {
    transition: all 0.4s cubic-bezier(0.19, 1, 0.22, 1);
}

/* 展开动效：进入时伴随轻微缩小和向上平移，模拟平视显示器初始化挂载 */
.nav-guide-fade-enter-from,
.nav-guide-fade-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px) scale(0.9);
    filter: blur(4px);
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
}

@keyframes pulse {
    0% { transform: translateX(-50%) scale(1); }
    100% { transform: translateX(-50%) scale(1.15); }
}
</style>