<template>
    <Transition name="nav-dialog-fade">
        <div
            v-if="visible"
            class="nav-dialog-overlay"
            @click.self="$emit('close')"
        >
            <div class="nav-dialog">
                <div class="border-corner top-left"></div>
                <div class="border-corner top-right"></div>
                <div class="border-corner bottom-left"></div>
                <div class="border-corner bottom-right"></div>

                <div class="nav-dialog-head futuristic-hud">
                    <div class="hud-scan-line"></div>

                    <div class="title-wrapper">
                        <div class="status-matrix-v2">
                            <div class="matrix-row">
                                <span class="matrix-dot activeanimate-flicker"></span>
                                <span class="matrix-dot active"></span>
                            </div>
                            <div class="matrix-row">
                                <span class="matrix-dot"></span>
                                <span class="matrix-dot active"></span>
                            </div>
                        </div>

                        <div class="title-text-group">
                            <span class="nav-dialog-title">设置导航目标</span>
                            <span class="title-sub">NAV.TARGET_SET // MODE:漫游</span>
                        </div>
                    </div>

                    <div class="head-right-decor">
                        <div class="decor-geometry">
                            <span class="geo-line"></span>
                            <span class="geo-angle"></span>
                        </div>
                        <button
                            class="nav-dialog-close v2"
                            title="关闭"
                            @click="$emit('close')"
                        >
                            <span class="close-icon-v2">×</span>
                        </button>
                    </div>
                </div>

                <div class="nav-dialog-body">
                    <button
                        class="nav-option"
                        @click="handleOption('search')"
                    >
                        <div class="nav-option-icon">
                            <span>🔍</span>
                        </div>
                        <div class="nav-option-text">
                            <span class="nav-option-label">搜索地点</span>
                            <span class="nav-option-desc">搜索 POI 兴趣点并设为漫游目标</span>
                        </div>
                        <span class="nav-option-arrow"></span>
                    </button>

                    <button
                        class="nav-option"
                        @click="handleOption('data')"
                    >
                        <div class="nav-option-icon">
                            <span>📁</span>
                        </div>
                        <div class="nav-option-text">
                            <span class="nav-option-label">选择数据要素</span>
                            <span class="nav-option-desc">从已载入的 GIS 图层中选取要素点</span>
                        </div>
                        <span class="nav-option-arrow"></span>
                    </button>

                    <button
                        class="nav-option"
                        @click="handleOption('pick')"
                    >
                        <div class="nav-option-icon">
                            <span>📍</span>
                        </div>
                        <div class="nav-option-text">
                            <span class="nav-option-label">地图点选</span>
                            <span class="nav-option-desc">在三维场景中交互单点击落点</span>
                        </div>
                        <span class="nav-option-arrow"></span>
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup>
defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(['close', 'select']);

function handleOption(type) {
    emit('select', type);
    emit('close');
}
</script>

<style scoped>
/* ==========================================================================
   1. 基础布局 & 磨砂玻璃底衬
   ========================================================================== */
.nav-dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(4, 12, 22, 0.4);
    /* 提升模糊度，过滤掉复杂的 Cesium 地球底色干扰 */
    backdrop-filter: blur(6px);
}

.nav-dialog {
    position: relative;
    width: 360px;
    border-radius: 4px;
    /* 科技风更倾向于微圆角或直角 */
    /* 深邃的网络流光背景 */
    background: linear-gradient(135deg, rgba(8, 22, 37, 0.95) 0%, rgba(4, 14, 24, 0.98) 100%);
    /* 内发光边框，模拟科幻 HUD 质感 */
    border: 1px solid rgba(0, 210, 255, 0.25);
    box-shadow:
        0 0 25px rgba(0, 180, 255, 0.15),
        inset 0 0 16px rgba(0, 180, 255, 0.1);
    overflow: visible;
    /* 允许科技边角外溢或精准对齐 */
    padding: 2px;
}

/* 微型网格背景，营造数字孪生科技感 */
.nav-dialog::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.04;
    background-image:
        linear-gradient(rgba(255, 255, 255, 1) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 1) 1px, transparent 1px);
    background-size: 8px 8px;
}

/* ==========================================================================
   2. 科技风四角装饰线 (Cyberpunk / Sci-fi Corners)
   ========================================================================== */
.border-corner {
    position: absolute;
    width: 10px;
    height: 10px;
    border: 2px solid #00e5ff;
    pointer-events: none;
}

.top-left {
    top: -1px;
    left: -1px;
    border-right: none;
    border-bottom: none;
}

.top-right {
    top: -1px;
    right: -1px;
    border-left: none;
    border-bottom: none;
}

.bottom-left {
    bottom: -1px;
    left: -1px;
    border-right: none;
    border-top: none;
}

.bottom-right {
    bottom: -1px;
    right: -1px;
    border-left: none;
    border-top: none;
}

/* ==========================================================================
   3. 头部区域设计
   ========================================================================== */
/* ==========================================================================
    futuristic-hud 科技感顶栏
   ========================================================================== */
.nav-dialog-head.futuristic-hud {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: rgba(4, 16, 29, 0.9);
    border-bottom: 1px solid rgba(0, 255, 255, 0.3);
    position: relative;
    overflow: hidden;
    /* 引入微弱的蓝色辉光 */
    box-shadow: 0 4px 15px rgba(0, 255, 255, 0.1);
}

/* 顶栏背景扫描线动画 */
.hud-scan-line {
    position: absolute;
    inset: 0;
    background: linear-gradient(
        180deg,
        transparent 0%,
        rgba(0, 255, 255, 0.05) 50%,
        transparent 100%
    );
    animation: scanMotor 3s infinite linear;
    pointer-events: none;
}

/* --- 左侧：标题与矩阵 --- */
.title-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 1; /* 保证在扫描线之上 */
}

/* 状态矩阵 V2：更有工业控制面板感 */
.status-matrix-v2 {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 3px;
    background: rgba(0, 255, 255, 0.05);
    border: 1px solid rgba(0, 255, 255, 0.15);
    border-radius: 2px;
}

.matrix-row {
    display: flex;
    gap: 3px;
}

.matrix-dot {
    width: 5px;
    height: 5px;
    background: rgba(0, 255, 255, 0.1);
    border-radius: 1px; /* 微圆角，像素感 */
    transition: background 0.2s;
}

.matrix-dot.active {
    background: #00ffff;
    box-shadow: 0 0 8px #00ffff, 0 0 2px #00ffff;
}

/* 增强：模拟故障或闪烁的异步动画 */
.animate-flicker {
    animation: flicker 2s infinite steps(1);
}

/* 标题文字 */
.title-text-group {
    display: flex;
    flex-direction: column;
}

.nav-dialog-title {
    font-size: 15px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 2px;
    /* 文字辉光，全息感核心 */
    text-shadow: 0 0 10px rgba(0, 255, 255, 0.7);
    font-family: 'Inter', sans-serif; /* 建议使用更现代硬朗的字体 */
}

.title-sub {
    font-size: 9px;
    color: rgba(0, 255, 255, 0.6);
    font-family: 'Courier New', Courier, monospace;
    font-weight: bold;
    transform: scale(0.9);
    transform-origin: left;
    margin-top: -1px;
}

/* --- 右侧：装饰与按钮 --- */
.head-right-decor {
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 1;
}

/* 不对称几何装饰 */
.decor-geometry {
    display: flex;
    align-items: center;
    position: relative;
    width: 30px;
    height: 20px;
}

.geo-line {
    width: 100%;
    height: 1px;
    background: linear-gradient(90deg, rgba(0, 255, 255, 0.1), rgba(0, 255, 255, 0.5));
}

.geo-angle {
    position: absolute;
    right: 0;
    top: 0;
    width: 8px;
    height: 8px;
    border-top: 2px solid #00ffff;
    border-right: 2px solid #00ffff;
    opacity: 0.8;
}

/* 关闭按钮 V2：更硬核的几何设计 */
.nav-dialog-close.v2 {
    width: 22px;
    height: 22px;
    border: 1px solid rgba(0, 255, 255, 0.3);
    background: rgba(0, 255, 255, 0.05);
    color: #00ffff;
    position: relative;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 0;
    border-radius: 2px;
}

/* 关闭按钮悬浮时的切角效果 */
.nav-dialog-close.v2::after {
    content: '';
    position: absolute;
    inset: -1px;
    border: 1px solid #00ffff;
    border-radius: 2px;
    opacity: 0;
    transition: opacity 0.2s;
}

.close-icon-v2 {
    font-size: 16px;
    line-height: 1;
    font-weight: bold;
    transition: transform 0.3s ease;
}

.nav-dialog-close.v2:hover {
    background: rgba(0, 255, 255, 0.2);
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
    border-color: #00ffff;
}

.nav-dialog-close.v2:hover::after {
    opacity: 1;
}

.nav-dialog-close.v2:hover .close-icon-v2 {
    transform: rotate(180deg) scale(1.1);
}

/* ==========================================================================
   动画定义
   ========================================================================== */
/* 背景扫描动画 */
@keyframes scanMotor {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
}

/* 故障闪烁动画 */
@keyframes flicker {
    0%, 100% { opacity: 1; background: #00ffff; }
    5%, 10% { opacity: 0.2; background: rgba(0, 255, 255, 0.2); }
    15% { opacity: 1; background: #00ffff; }
    80%, 85% { opacity: 0.5; }
}

.title-wrapper {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.title-icon {
    font-size: 10px;
    color: #00e5ff;
    margin-right: 6px;
    text-shadow: 0 0 8px #00e5ff;
    display: inline-block;
    animation: blink 2s infinite steps(2);
}

.nav-dialog-title {
    font-size: 15px;
    font-weight: 600;
    color: #ffffff;
    letter-spacing: 1px;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
    display: inline-flex;
    align-items: center;
}

.title-sub {
    font-size: 9px;
    color: rgba(0, 210, 255, 0.4);
    font-family: 'Courier New', Courier, monospace;
    letter-spacing: 0.5px;
}

.nav-dialog-close {
    width: 24px;
    height: 24px;
    border: 1px solid rgba(0, 210, 255, 0.2);
    border-radius: 2px;
    background: rgba(0, 210, 255, 0.05);
    color: #00e5ff;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
}

.nav-dialog-close:hover {
    background: #00e5ff;
    color: #040e18;
    box-shadow: 0 0 10px #00e5ff;
}

/* ==========================================================================
   4. 列表选项设计（核心优化）
   ========================================================================== */
.nav-dialog-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.nav-option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 12px 16px;
    border: 1px solid rgba(148, 210, 255, 0.08);
    border-radius: 4px;
    background: rgba(148, 210, 255, 0.02);
    color: #e8f6ff;
    cursor: pointer;
    text-align: left;
    transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
}

/* 选项卡左侧呼吸边条 */
.nav-option::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 0;
    background: #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
    transition: height 0.2s ease;
}

.nav-option:hover {
    background: rgba(0, 210, 255, 0.08);
    border-color: rgba(0, 210, 255, 0.4);
    box-shadow: inset 0 0 12px rgba(0, 210, 255, 0.1);
    transform: translateX(4px);
    /* 悬浮时微右移，动态交互感更强 */
}

.nav-option:hover::before {
    height: 60%;
}

.nav-option-icon {
    font-size: 18px;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    background: rgba(0, 210, 255, 0.08);
    border: 1px solid rgba(0, 210, 255, 0.15);
    transition: all 0.2s;
}

.nav-option:hover .nav-option-icon {
    background: rgba(0, 210, 255, 0.2);
    border-color: #00e5ff;
    box-shadow: 0 0 8px rgba(0, 210, 255, 0.3);
}

.nav-option-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.nav-option-label {
    font-size: 13px;
    font-weight: 600;
    color: #ffffff;
    letter-spacing: 0.5px;
}

.nav-option-desc {
    font-size: 11px;
    color: rgba(180, 215, 245, 0.6);
    line-height: 1.3;
}

/* 右侧科技质感箭头 */
.nav-option-arrow {
    width: 6px;
    height: 6px;
    border-top: 2px solid rgba(0, 210, 255, 0.4);
    border-right: 2px solid rgba(0, 210, 255, 0.4);
    transform: rotate(45deg);
    transition: all 0.2s;
}

.nav-option:hover .nav-option-arrow {
    border-color: #00e5ff;
    transform: rotate(45deg) translate(2px, -2px);
}

/* ==========================================================================
   5. 高级动效（出场动画升级）
   ========================================================================== */
.nav-dialog-fade-enter-active,
.nav-dialog-fade-leave-active {
    transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}

.nav-dialog-fade-enter-active .nav-dialog {
    transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}

.nav-dialog-fade-leave-active .nav-dialog {
    transition: all 0.2s cubic-bezier(0.19, 1, 0.22, 1);
}

/* 结合了透明度和缩放（Scale）的入场，极具大屏系统展开感 */
.nav-dialog-fade-enter-from {
    opacity: 0;
}

.nav-dialog-fade-enter-from .nav-dialog {
    opacity: 0;
    transform: scale(0.9) translateY(-10px);
}

.nav-dialog-fade-leave-to {
    opacity: 0;
}

.nav-dialog-fade-leave-to .nav-dialog {
    opacity: 0;
    transform: scale(0.95);
}

/* 呼吸灯动画 */
@keyframes blink {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.3;
    }
}
</style>