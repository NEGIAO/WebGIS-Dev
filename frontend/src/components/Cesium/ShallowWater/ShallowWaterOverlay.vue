<template>
    <div
        v-show="visible"
        ref="canvasContainerRef"
        class="shallow-water-overlay"
    ></div>
</template>

<script setup>
/**
 * 热带浅水场景叠加层组件
 * 在 Cesium canvas 上方叠加 Three.js 渲染的热带浅水效果
 * 通过 CesiumToolPanel 控制开关和参数
 */
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useShallowWater } from './composables/useShallowWater';

const props = defineProps({
    /** 是否可见 */
    visible: {
        type: Boolean,
        default: false,
    },
    /** 太阳高度角 */
    elevation: {
        type: Number,
        default: 30,
    },
    /** 太阳方位角 */
    azimuth: {
        type: Number,
        default: 150,
    },
    /** 清澈度（越小越清澈） */
    clarity: {
        type: Number,
        default: 0.085,
    },
    /** 焦散强度 */
    causticStrength: {
        type: Number,
        default: 0.9,
    },
    /** 远处浅水颜色 */
    waterColor: {
        type: String,
        default: '#2bb3c4',
    },
    /** 浪高 */
    waveHeight: {
        type: Number,
        default: 0.5,
    },
    /** 泡沫宽度 */
    foamWidth: {
        type: Number,
        default: 2.4,
    },
    /** 反射强度 */
    reflection: {
        type: Number,
        default: 0.38,
    },
    /** 云量覆盖 */
    cloudCoverage: {
        type: Number,
        default: 0.58,
    },
    /** 是否启用闪电 */
    lightningEnabled: {
        type: Boolean,
        default: true,
    },
    /** 闪电间隔（秒） */
    lightningInterval: {
        type: Number,
        default: 2.0,
    },
});

const emit = defineEmits(['ready', 'error', 'fps-update']);

const canvasContainerRef = ref(null);

const {
    isReady,
    fps,
    init,
    start,
    pause,
    dispose,
    handleResize,
    updateParams,
} = useShallowWater({
    onReady: () => emit('ready'),
    onError: (err) => emit('error', err),
    onFpsUpdate: (val) => emit('fps-update', val),
});

// 监听 visible 变化，控制启停
watch(
    () => props.visible,
    async (visible) => {
        if (visible) {
            await initScene();
            start();
        } else {
            pause();
        }
    }
);

// 监听参数变化，同步到 Three.js 场景
watch(
    () => [
        props.elevation,
        props.azimuth,
        props.clarity,
        props.causticStrength,
        props.waterColor,
        props.waveHeight,
        props.foamWidth,
        props.reflection,
        props.cloudCoverage,
        props.lightningEnabled,
        props.lightningInterval,
    ],
    () => {
        syncParams();
    }
);

/** 初始化场景 */
async function initScene() {
    if (!canvasContainerRef.value || isReady.value) return;

    await init(canvasContainerRef.value);
    syncParams();
}

/** 同步参数到 Three.js */
function syncParams() {
    updateParams({
        elevation: props.elevation,
        azimuth: props.azimuth,
        clarity: props.clarity,
        causticStrength: props.causticStrength,
        waterColor: props.waterColor,
        waveHeight: props.waveHeight,
        foamWidth: props.foamWidth,
        reflection: props.reflection,
        cloudCoverage: props.cloudCoverage,
        lightningEnabled: props.lightningEnabled,
        lightningInterval: props.lightningInterval,
    });
}

// 窗口大小变化
function onResize() {
    handleResize();
}

onMounted(() => {
    window.addEventListener('resize', onResize);

    // 如果初始就可见，初始化场景
    if (props.visible) {
        initScene();
    }
});

onUnmounted(() => {
    window.removeEventListener('resize', onResize);
    dispose();
});

defineExpose({
    isReady,
    fps,
    start,
    pause,
});
</script>

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
