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

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useMessage } from '@common/shell/useMessage';

const props = defineProps({
    active: {
        type: Boolean,
        default: false,
    },
    effectName: {
        type: String,
        default: 'gravity',
    },
});

defineEmits(['toggle-active']);

const canvasRef = ref(null);
const isLoading = ref(false);

const message = useMessage();

let activeEngine = null;

// 导入模块缓存
const importedModules = {};

/**
 * 动态导入特效模块 - 仅在需要时加载
 */
async function dynamicImportEffect(effectName) {
    if (importedModules[effectName]) {
        return importedModules[effectName];
    }

    try {
        isLoading.value = true;
        let moduleLoader;
        switch (effectName) {
            case 'fluid':
                moduleLoader = () => import('@common/components/Magic/useFluid.js');
                break;
            case 'gravity':
                moduleLoader = () => import('@common/components/Magic/useGravity.js');
                break;
            case 'void':
                moduleLoader = () => import('@common/components/Magic/useDelaunay.js');
                break;
            case 'wave':
                moduleLoader = () => import('@common/components/Magic/useWave.js');
                break;
            case 'singularity':
                moduleLoader = () => import('@common/components/Magic/useSingularity.js');
                break;
            case 'ring-explosion':
                moduleLoader = () => import('@common/components/Magic/useRingExplosion.js');
                break;
            default:
                moduleLoader = () => import('@common/components/Magic/useGravity.js');
        }

        const module = await moduleLoader();
        const composableName =
            effectName === 'fluid'
                ? 'useFluid'
                : effectName === 'gravity'
                  ? 'useGravity'
                  : effectName === 'void'
                    ? 'useDelaunay'
                    : effectName === 'wave'
                      ? 'useWave'
                      : effectName === 'singularity'
                        ? 'useSingularity'
                        : effectName === 'ring-explosion'
                          ? 'useRingExplosion'
                          : 'useGravity';

        importedModules[effectName] = module[composableName];
        return importedModules[effectName];
    } finally {
        isLoading.value = false;
    }
}

/**
 * 切换特效引擎
 */
async function switchEffect(effectName) {
    if (isLoading.value) return;

    try {
        if (activeEngine) {
            activeEngine.destroy?.();
            activeEngine = null;
        }

        if (canvasRef.value) {
            const ctx = canvasRef.value.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
        }

        const useEffectComposable = await dynamicImportEffect(effectName);
        if (!useEffectComposable) return;

        activeEngine = useEffectComposable(canvasRef, { active: props.active });
        if (activeEngine?.init) {
            activeEngine.init();
        }
    } catch (_error) {
        // 特效动态加载失败:特效本身是装饰性增强,以 message 提示用户但不阻断交互
        message.error('特效加载失败，已跳过');
    }
}

watch(
    () => [props.active, props.effectName],
    async ([newActive, newEffectName], [_oldActive, oldEffectName]) => {
        if (newActive) {
            // 激活或切换了特效
            if (!activeEngine || newEffectName !== oldEffectName) {
                await switchEffect(newEffectName);
            }
        } else if (!newActive && activeEngine) {
            activeEngine.destroy?.();
            activeEngine = null;
        }
    },
);

onMounted(() => {
    if (props.active) {
        switchEffect(props.effectName);
    }
});

onUnmounted(() => {
    if (activeEngine) {
        activeEngine.destroy?.();
        activeEngine = null;
    }
});
</script>

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
