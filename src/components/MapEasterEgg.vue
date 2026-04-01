<template>
    <transition name="fade">
        <div
            v-if="shouldRenderImageSet"
            class="imageset"
            :style="imageSetStyle"
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

    <Teleport to="body">
        <div v-if="showLargeImg" class="lightbox" @click="closeLargeImage">
            <img :src="largeImageSrc" class="large-image" @click.stop />
            <button class="close-btn" @click="closeLargeImage">×</button>
        </div>
    </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { toLonLat } from 'ol/proj';
import { unByKey } from 'ol/Observable';

/**
 * 地图彩蛋组件（图片集 + Lightbox）
 * 说明：
 * 1) 支持受控模式（show/position/shouldMount 由父组件传入）
 * 2) 支持自驱模式（通过 mapInstance + bounds 自动判定显示与像素定位）
 * 3) Lightbox 使用 Teleport 渲染到 body，确保层级不受地图容器影响
 */
const props = defineProps({
    /** OpenLayers Map 实例（shallowRef） */
    mapInstance: {
        type: Object,
        default: null
    },
    /** 彩蛋区域边界：{ minLon, maxLon, minLat, maxLat } */
    bounds: {
        type: Object,
        default: () => ({ minLon: 0, maxLon: 0, minLat: 0, maxLat: 0 })
    },
    /** 缩略图列表 */
    images: {
        type: Array,
        default: () => []
    },
    /** 受控显示状态（可选） */
    show: {
        type: Boolean,
        default: undefined
    },
    /** 受控像素坐标（可选） */
    position: {
        type: Object,
        default: undefined
    },
    /** 受控挂载状态（可选） */
    shouldMount: {
        type: Boolean,
        default: undefined
    },
    /** 缩略图显示最低缩放阈值 */
    zoomThreshold: {
        type: Number,
        default: 17
    }
});

/**
 * @event open-large-image 打开大图时触发，payload 为图片 URL
 * @event location-change 指针位于彩蛋区域时触发，payload 为 { isInDihuan, lonLat }
 */
const emit = defineEmits(['open-large-image', 'location-change']);

const INTERNAL_OFFSET_PX = 15;

// Lightbox 内部状态
const showLargeImg = ref(false);
const largeImageSrc = ref('');

// 图片集内部状态（用于自驱模式）
const internalShow = ref(false);
const internalShouldMount = ref(false);
const internalPosition = ref({ x: 0, y: 0 });

let pointerMoveKey = null;
let currentMapRef = null;

const resolvedShow = computed(() => (
    typeof props.show === 'boolean' ? props.show : internalShow.value
));

const resolvedShouldMount = computed(() => (
    typeof props.shouldMount === 'boolean' ? props.shouldMount : internalShouldMount.value
));

const resolvedPosition = computed(() => {
    if (props.position && Number.isFinite(props.position.x) && Number.isFinite(props.position.y)) {
        return props.position;
    }
    return internalPosition.value;
});

const shouldRenderImageSet = computed(() => resolvedShouldMount.value && resolvedShow.value);

const imageSetStyle = computed(() => ({
    left: `${Number(resolvedPosition.value?.x || 0)}px`,
    top: `${Number(resolvedPosition.value?.y || 0)}px`
}));

watch(resolvedShow, (visible) => {
    if (visible && !internalShouldMount.value) {
        internalShouldMount.value = true;
    }
}, { immediate: true });

/**
 * 依据指针坐标与缩放级别更新图片集显示状态和像素位置。
 */
function evaluateAreaVisibility(coordinate, pixel) {
    const map = props.mapInstance?.value;
    if (!map || !Array.isArray(coordinate)) return;

    const view = map.getView?.();
    const zoom = Number(view?.getZoom?.());
    const lonLat = toLonLat(coordinate);
    const [lon, lat] = lonLat;
    const inArea = (
        lon >= Number(props.bounds?.minLon)
        && lon <= Number(props.bounds?.maxLon)
        && lat >= Number(props.bounds?.minLat)
        && lat <= Number(props.bounds?.maxLat)
    );

    internalShow.value = Number.isFinite(zoom) && zoom >= Number(props.zoomThreshold) && inArea;
    if (internalShow.value && Array.isArray(pixel) && pixel.length >= 2) {
        internalPosition.value = {
            x: Number(pixel[0]) + INTERNAL_OFFSET_PX,
            y: Number(pixel[1]) + INTERNAL_OFFSET_PX
        };
    }

    emit('location-change', { isInDihuan: inArea, lonLat });
}

function cleanupMapListener() {
    if (pointerMoveKey) {
        unByKey(pointerMoveKey);
        pointerMoveKey = null;
    }
    currentMapRef = null;
}

function bindMapListener() {
    const map = props.mapInstance?.value;
    if (!map || map === currentMapRef) return;

    cleanupMapListener();
    currentMapRef = map;
    pointerMoveKey = map.on('pointermove', (evt) => {
        if (evt?.dragging) return;
        evaluateAreaVisibility(evt?.coordinate, evt?.pixel);
    });
}

watch(() => props.mapInstance?.value, () => {
    bindMapListener();
}, { immediate: true });

function showLargeImage(src) {
    largeImageSrc.value = src;
    showLargeImg.value = true;
    emit('open-large-image', src);
}

function closeLargeImage() {
    showLargeImg.value = false;
    largeImageSrc.value = '';
}

onBeforeUnmount(() => {
    cleanupMapListener();
});
</script>

<style scoped>
.imageset {
    position: absolute;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #ddd;
    padding: 6px;
    width: 310px;
    z-index: 1000;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
}

.thumbnail {
    width: 96px;
    height: 64px;
    object-fit: cover;
    cursor: zoom-in;
    border-radius: 4px;
    transition: all 0.2s;
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
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: center;
}

.large-image {
    max-width: 90%;
    max-height: 90%;
    border: 2px solid rgba(48, 148, 65, 0.78);
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
}

.close-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(48, 148, 65, 0.2);
    border: 1px solid rgba(48, 148, 65, 0.75);
    border-radius: 8px;
    color: #fff;
    font-size: 40px;
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
</style>
