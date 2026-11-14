<template>
    <div
        v-if="active"
        class="magic-cursor-wrapper"
    >
        <!-- 物理特效画布 -->
        <canvas
            ref="canvasRef"
            class="magic-canvas active"
        ></canvas>
    </div>
</template>

<script lang="ts" src="./MagicCursor.ts"></script>

<style scoped>
/* ========== 画布样式 ========== */
.magic-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: calc(var(--z-toast) - 1);
    opacity: 0;
    transition: opacity 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    background: transparent;
}

.magic-canvas.active {
    opacity: 1;
}
</style>
