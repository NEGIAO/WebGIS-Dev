<template>
    <div class="map-container">
        <div id="ol-map" ref="mapDom"></div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Map2DManager } from '../core/map2d/Map2DManager';

const mapDom = ref<HTMLDivElement | null>(null);
let manager: Map2DManager | null = null;

onMounted(() => {
    if (!mapDom.value) return;
    manager = new Map2DManager(mapDom.value);
});

onBeforeUnmount(() => {
    manager?.destroy();
    manager = null;
});
</script>

<style scoped>
.map-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}

#ol-map {
    width: 100%;
    height: 100%;
}
</style>
