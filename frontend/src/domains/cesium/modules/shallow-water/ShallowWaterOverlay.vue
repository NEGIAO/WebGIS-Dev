<template>
    <div
        v-show="visible"
        ref="canvasContainerRef"
        class="shallow-water-overlay"
    ></div>
</template>

<script lang="ts" src="./ShallowWaterOverlay.ts"></script>

<style scoped>
.shallow-water-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    pointer-events: auto;
}
</style>
