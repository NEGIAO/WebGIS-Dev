<template>
    <div class="map-container" ref="mapContainerRef">
        <div id="ol-map" ref="mapDom"></div>

        <transition name="fade">
            <div
                v-if="shouldMountImageSet && showImageSet"
                class="imageset"
                :style="{ left: `${imageSetPosition.x}px`, top: `${imageSetPosition.y}px` }"
            >
                <img
                    v-for="(img, index) in images"
                    :key="index"
                    :src="img"
                    class="thumbnail"
                    loading="lazy"
                    decoding="async"
                    @click.stop="showLargeImage(img)"
                />
            </div>
        </transition>

        <div v-if="showLargeImg" class="lightbox" @click="closeLargeImage">
            <img :src="largeImageSrc" class="large-image" @click.stop />
            <button class="close-btn" @click="closeLargeImage">x</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { toLonLat } from 'ol/proj';
import { unByKey } from 'ol/Observable';
import type { EventsKey } from 'ol/events';
import { Map2DManager } from '../core/map2d/Map2DManager';

const NORM_BASE = '/';
const DIHUAN_BOUNDS = { minLon: 114.3020, maxLon: 114.3030, minLat: 34.8149, maxLat: 34.8154 };
const IMAGE_NAMES = [
    '地理与环境学院标志牌.webp',
    '地理与环境学院入口.webp',
    '地学楼.webp',
    '教育部重点实验室.webp',
    '四楼逃生图.webp',
    '学院楼单侧.webp'
];

const mapDom = ref<HTMLDivElement | null>(null);
const mapContainerRef = ref<HTMLDivElement | null>(null);
let manager: Map2DManager | null = null;
let pointerMoveKey: EventsKey | null = null;
let viewportMouseOutHandler: (() => void) | null = null;

const showImageSet = ref(false);
const shouldMountImageSet = ref(false);
const images = ref<string[]>([]);
const imageSetPosition = ref({ x: 0, y: 0 });
const showLargeImg = ref(false);
const largeImageSrc = ref('');

watch(showImageSet, (visible) => {
    if (!visible || shouldMountImageSet.value) return;
    shouldMountImageSet.value = true;
    images.value = IMAGE_NAMES.map((img) => `${NORM_BASE}images/${img}`);
});

function showLargeImage(src: string): void {
    largeImageSrc.value = src;
    showLargeImg.value = true;
}

function closeLargeImage(): void {
    showLargeImg.value = false;
    largeImageSrc.value = '';
}

function bindAreaImageOverlay(): void {
    const map = manager?.getMapInstance();
    if (!map) return;

    pointerMoveKey = map.on('pointermove', (evt) => {
        const lonLat = toLonLat(evt.coordinate);
        const [lon, lat] = lonLat;
        const zoom = Number(map.getView().getZoom() || 0);

        const isInArea = lon >= DIHUAN_BOUNDS.minLon
            && lon <= DIHUAN_BOUNDS.maxLon
            && lat >= DIHUAN_BOUNDS.minLat
            && lat <= DIHUAN_BOUNDS.maxLat;

        if (zoom >= 17 && isInArea) {
            showImageSet.value = true;
            imageSetPosition.value = {
                x: Number(evt.pixel?.[0] || 0) + 15,
                y: Number(evt.pixel?.[1] || 0) + 15
            };
        } else {
            showImageSet.value = false;
        }
    });

    viewportMouseOutHandler = () => {
        if (!showLargeImg.value) {
            showImageSet.value = false;
        }
    };

    map.getViewport().addEventListener('mouseout', viewportMouseOutHandler);
}

onMounted(() => {
    if (!mapDom.value) return;
    manager = new Map2DManager(mapDom.value);
    bindAreaImageOverlay();
});

onBeforeUnmount(() => {
    if (pointerMoveKey) {
        unByKey(pointerMoveKey);
        pointerMoveKey = null;
    }

    const map = manager?.getMapInstance();
    if (map && viewportMouseOutHandler) {
        map.getViewport().removeEventListener('mouseout', viewportMouseOutHandler);
    }
    viewportMouseOutHandler = null;

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
    background: #f0f2f5;
}

#ol-map {
    width: 100%;
    height: 100%;
}

.imageset {
    position: absolute;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #ddd;
    padding: 6px;
    width: 310px;
    z-index: 1200;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.thumbnail {
    width: 96px;
    height: 64px;
    object-fit: cover;
    cursor: zoom-in;
    border-radius: 4px;
    transition: transform 0.2s ease;
}

.thumbnail:hover {
    transform: scale(1.05);
}

.lightbox {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    z-index: 2100;
    display: flex;
    justify-content: center;
    align-items: center;
}

.large-image {
    max-width: 90%;
    max-height: 90%;
    border: 2px solid #fff;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
}

.close-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    background: none;
    border: none;
    color: #fff;
    font-size: 36px;
    cursor: pointer;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

:deep(.ol-custom-overviewmap) {
    position: absolute;
    left: 10px;
    top: 10px;
    right: auto;
    bottom: auto;
}

:deep(.ol-custom-overviewmap:not(.ol-collapsed)) {
    border: 2px solid rgba(20, 156, 49, 0.72);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.9);
}

:deep(.ol-custom-overviewmap .ol-overviewmap-map) {
    border: none;
    width: 200px;
    height: 200px;
}

:deep(.ol-custom-overviewmap .ol-overviewmap-box) {
    border: 2px solid #00aaff;
    background: rgba(0, 170, 255, 0.2);
}

:deep(.ol-custom-overviewmap button) {
    background-color: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    padding: 2px 6px;
}

:deep(.ol-custom-overviewmap button:hover) {
    background-color: rgba(0, 0, 0, 0.8);
}

@media (max-width: 768px) {
    :deep(.ol-custom-overviewmap .ol-overviewmap-map) {
        width: 120px;
        height: 120px;
    }
}
</style>
