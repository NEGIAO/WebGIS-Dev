<template>
    <div
        v-if="!headless"
        class="advanced-effects-root"
    >
        <div class="effects-panel">
            <div class="panel-head">
                <span class="panel-title">Cinematic FX</span>
                <button
                    class="panel-btn"
                    @click="toggleChartVisibility"
                >
                    {{ chartVisible ? '隐藏图表' : '显示图表' }}
                </button>
            </div>

            <div class="effect-switches">
                <LilGuiControls
                    title="Effect Parameters"
                    :controls="effectGuiControls"
                    @change="handleEffectGuiChange"
                />
            </div>

            <div
                v-show="chartVisible"
                ref="chartRef"
                class="fx-chart"
            ></div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMessage } from '../../composables/useMessage';
import {
    captureRealisticAtmosphereState,
    configureRealisticAtmosphere,
    restoreRealisticAtmosphere,
} from './composables/scene/cesiumAtmosphere';
import LilGuiControls from './LilGuiControls.vue';

const props = defineProps({
    headless: {
        type: Boolean,
        default: false,
    },
    getViewer: {
        type: Function,
        required: true,
    },
    getCesium: {
        type: Function,
        required: true,
    },
    controls: {
        type: Object,
        default: () => ({}),
    },
});

const message = useMessage();
const chartRef = ref(null);

const fogEnabled = ref(false);
const hbaoEnabled = ref(false);
const tiltShiftEnabled = ref(false);
const atmosphereEnabled = ref(false);
const chartVisible = ref(false);

const effectGuiControls = computed(() => [
    { id: 'fog', label: 'Height Fog', type: 'toggle', value: fogEnabled.value },
    { id: 'hbao', label: 'HBAO', type: 'toggle', value: hbaoEnabled.value },
    { id: 'tiltShift', label: 'Tilt Shift', type: 'toggle', value: tiltShiftEnabled.value },
    { id: 'atmosphere', label: 'Atmosphere + Bloom', type: 'toggle', value: atmosphereEnabled.value },
]);

let fogStage = null;
let tiltShiftStage = null;
let ambientOcclusionStage = null;
let createdAmbientOcclusionStage = false;

let chartInstance = null;
let echartsModule = null;
let echartsRuntimePromise = null;

let bootstrapTimer = null;
let samplingTimer = null;
let resizeHandler = null;
let preRenderListener = null;
let renderErrorListener = null;
let hasRenderErrorNotified = false;
let realisticAtmosphereSnapshot = null;
let atmosphereRestoredOnce = false; // 标记是否已恢复过大气状态（避免每帧重复恢复）

let frameCounter = 0;
let fpsValue = 0;
let fpsStamp = typeof performance !== 'undefined' ? performance.now() : Date.now();

function loadEchartsRuntime() {
    if (echartsRuntimePromise) return echartsRuntimePromise;

    echartsRuntimePromise = import('../../utils/echarts/cesiumFxRuntime.js')
        .then((runtimeModule) => {
            const runtime = runtimeModule?.getCesiumFxEchartsRuntime?.();
            if (!runtime) {
                throw new Error('Cinematic FX 图表运行时加载失败');
            }

            echartsModule = runtime;
            return runtime;
        })
        .catch((error) => {
            echartsRuntimePromise = null;
            throw error;
        });

    return echartsRuntimePromise;
}

async function ensureEchartsReady() {
    if (echartsModule) return echartsModule;
    return loadEchartsRuntime();
}

const chartData = {
    labels: [],
    cameraHeightKm: [],
    pitchDeg: [],
    fps: [],
};

const originalSceneState = {
    hdr: null,
    bloom: null,
    sky: null,
};

onMounted(() => {
    bootstrapWhenReady();
});

onUnmounted(() => {
    cleanupEffects();
});

watch(
    () => props.controls,
    (controls) => {
        syncExternalControls(controls || {});
    },
    { deep: true, immediate: true },
);

function syncExternalControls(controls) {
    if (Object.prototype.hasOwnProperty.call(controls, 'fog')) {
        fogEnabled.value = !!controls.fog;
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'hbao')) {
        hbaoEnabled.value = !!controls.hbao;
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'tiltShift')) {
        tiltShiftEnabled.value = !!controls.tiltShift;
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'atmosphere')) {
        atmosphereEnabled.value = !!controls.atmosphere;
    }
}

function handleEffectGuiChange({ controlId, value }) {
    const enabled = !!value;
    const controlMap = {
        fog: fogEnabled,
        hbao: hbaoEnabled,
        tiltShift: tiltShiftEnabled,
        atmosphere: atmosphereEnabled,
    };
    const target = controlMap[controlId];
    if (target) {
        target.value = enabled;
    }
}

function bootstrapWhenReady() {
    let attempts = 0;
    bootstrapTimer = window.setInterval(async () => {
        attempts += 1;

        const viewer = props.getViewer?.();
        const Cesium = props.getCesium?.() || window.Cesium;

        if (viewer && Cesium) {
            clearInterval(bootstrapTimer);
            bootstrapTimer = null;

            try {
                captureSceneDefaults(viewer);
                initRenderErrorGuard(viewer);
                initCinematicEffects(viewer, Cesium);
                bindFrameUpdates(viewer, Cesium);
                message.success('高级视觉效果已启用。');
            } catch (error) {
                message.error('高级视觉效果初始化失败', error);
                message.warning('高级视觉效果部分初始化失败，已自动降级。', { closable: true });
            }
            return;
        }

        if (attempts >= 150) {
            clearInterval(bootstrapTimer);
            bootstrapTimer = null;
            message.warning('高级视觉效果等待超时，未获取到 3D Viewer。');
        }
    }, 80);
}

function captureSceneDefaults(viewer) {
    const scene = viewer?.scene;
    if (!scene) return;

    if (typeof scene.highDynamicRange === 'boolean') {
        originalSceneState.hdr = scene.highDynamicRange;
    }

    // 保存 sunBloom 状态
    if ('sunBloom' in scene) {
        originalSceneState.sunBloom = scene.sunBloom;
    }

    // 保存 Globe 关键属性（晨昏半球必需）
    const globe = scene.globe;
    if (globe) {
        originalSceneState.globe = {
            enableLighting: globe.enableLighting,
            showGroundAtmosphere: globe.showGroundAtmosphere,
            dynamicAtmosphereLighting: globe.dynamicAtmosphereLighting,
            dynamicAtmosphereLightingFromSun: globe.dynamicAtmosphereLightingFromSun,
            atmosphereLightIntensity: globe.atmosphereLightIntensity,
            atmosphereHueShift: globe.atmosphereHueShift,
            atmosphereSaturationShift: globe.atmosphereSaturationShift,
            atmosphereBrightnessShift: globe.atmosphereBrightnessShift,
            lightingFadeInDistance: globe.lightingFadeInDistance,
            lightingFadeOutDistance: globe.lightingFadeOutDistance,
            nightFadeInDistance: globe.nightFadeInDistance,
            nightFadeOutDistance: globe.nightFadeOutDistance,
        };
    }

    // 保存太阳光配置
    if (scene.light) {
        originalSceneState.light = {
            intensity: scene.light.intensity,
        };
    }

    if (scene.postProcessStages?.bloom) {
        const bloom = scene.postProcessStages.bloom;
        originalSceneState.bloom = {
            enabled: !!bloom.enabled,
            contrast: bloom.uniforms?.contrast,
            brightness: bloom.uniforms?.brightness,
            delta: bloom.uniforms?.delta,
            sigma: bloom.uniforms?.sigma,
            stepSize: bloom.uniforms?.stepSize,
        };
    }

    if (scene.skyAtmosphere) {
        originalSceneState.sky = {
            show: scene.skyAtmosphere.show,
            hueShift: scene.skyAtmosphere.hueShift,
            saturationShift: scene.skyAtmosphere.saturationShift,
            brightnessShift: scene.skyAtmosphere.brightnessShift,
        };
    }

    // 保存太阳、月亮、天空盒显示状态
    originalSceneState.celestial = {
        sunShow: scene.sun?.show,
        moonShow: scene.moon?.show,
        skyBoxShow: scene.skyBox?.show,
    };
}

function initCinematicEffects(viewer, Cesium) {
    const stageCollection = viewer?.scene?.postProcessStages;
    if (!stageCollection || !Cesium?.PostProcessStage) return;

    initHeightFogStage(viewer, Cesium);
    initAmbientOcclusion(viewer, Cesium);
    initTiltShiftStage(viewer, Cesium);

    // 仅在用户已开启大气效果时应用，否则恢复原始状态
    if (atmosphereEnabled.value) {
        applyAtmosphereEnhancement(viewer, Cesium, 1200);
    } else {
        restoreAtmosphereState(viewer);
    }
}

function initRenderErrorGuard(viewer) {
    const scene = viewer?.scene;
    if (!scene?.renderError?.addEventListener) return;

    scene.rethrowRenderErrors = false;
    renderErrorListener = scene.renderError.addEventListener((_scene, error) => {
        message.error('Cesium 渲染异常，已触发降级保护', error);
        degradeEffectsAfterRenderError();

        if (!hasRenderErrorNotified) {
            hasRenderErrorNotified = true;
            message.warning('检测到当前设备图形兼容性问题，已自动降级高级特效以保证 3D 可用。', {
                closable: true,
                duration: 6000,
            });
        }
    });
}

function degradeEffectsAfterRenderError() {
    fogEnabled.value = false;
    tiltShiftEnabled.value = false;
    hbaoEnabled.value = false;
    atmosphereEnabled.value = false;

    if (fogStage) {
        fogStage.enabled = false;
    }
    if (tiltShiftStage) {
        tiltShiftStage.enabled = false;
    }
    if (ambientOcclusionStage) {
        ambientOcclusionStage.enabled = false;
    }
}

function initHeightFogStage(viewer, Cesium) {
    if (fogStage) return;

    fogStage = new Cesium.PostProcessStage({
        name: 'cinematic_height_fog_stage',
        fragmentShader: `
      uniform sampler2D colorTexture;
      uniform sampler2D depthTexture;
      uniform vec3 fogColor;
      uniform float fogDensity;
      uniform float cameraHeightFactor;

      #if __VERSION__ == 300
      in vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture
      #define FRAG_COLOR out_FragColor
      #else
      varying vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture2D
      #define FRAG_COLOR gl_FragColor
      #endif

      float getLinearDepth(vec2 uv) {
        float depth = czm_readDepth(depthTexture, uv);
        if (depth == 0.0) {
          return 0.0;
        }
        vec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        return max(0.0, -eyeCoordinate.z);
      }

      void main() {
        vec4 color = SAMPLE_TEX(colorTexture, v_textureCoordinates);
        float linearDepth = getLinearDepth(v_textureCoordinates);

        float depthFog = 1.0 - exp(-linearDepth * fogDensity);
        float groundBoost = clamp(1.0 - cameraHeightFactor, 0.0, 1.0);
        float fogAmount = clamp(depthFog * (0.22 + 1.28 * groundBoost), 0.0, 0.9);

        vec3 finalColor = mix(color.rgb, fogColor, fogAmount);
        FRAG_COLOR = vec4(finalColor, color.a);
      }
    `,
        uniforms: {
            fogColor: new Cesium.Color(0.78, 0.85, 0.92, 1.0),
            fogDensity: 0.00065,
            cameraHeightFactor: 1.0,
        },
    });

    viewer.scene.postProcessStages.add(fogStage);
    fogStage.enabled = fogEnabled.value;
}

function initAmbientOcclusion(viewer, Cesium) {
    const sceneStages = viewer?.scene?.postProcessStages;
    if (!sceneStages) return;

    if (sceneStages.ambientOcclusion) {
        ambientOcclusionStage = sceneStages.ambientOcclusion;
        createdAmbientOcclusionStage = false;
    } else if (Cesium?.PostProcessStageLibrary?.createAmbientOcclusionStage) {
        ambientOcclusionStage = Cesium.PostProcessStageLibrary.createAmbientOcclusionStage();
        sceneStages.add(ambientOcclusionStage);
        createdAmbientOcclusionStage = true;
    }

    if (!ambientOcclusionStage) return;

    ambientOcclusionStage.enabled = hbaoEnabled.value;
    if (ambientOcclusionStage.uniforms) {
        if ('intensity' in ambientOcclusionStage.uniforms)
            ambientOcclusionStage.uniforms.intensity = 4.2;
        if ('bias' in ambientOcclusionStage.uniforms) ambientOcclusionStage.uniforms.bias = 0.08;
        if ('lengthCap' in ambientOcclusionStage.uniforms)
            ambientOcclusionStage.uniforms.lengthCap = 0.35;
        if ('stepSize' in ambientOcclusionStage.uniforms)
            ambientOcclusionStage.uniforms.stepSize = 1.8;
        if ('frustumLength' in ambientOcclusionStage.uniforms)
            ambientOcclusionStage.uniforms.frustumLength = 1200.0;
    }
}

function initTiltShiftStage(viewer, Cesium) {
    if (tiltShiftStage) return;

    tiltShiftStage = new Cesium.PostProcessStage({
        name: 'cinematic_tilt_shift_stage',
        fragmentShader: `
      uniform sampler2D colorTexture;
      uniform float focusCenter;
      uniform float focusSpread;
      uniform float blurStrength;

      #if __VERSION__ == 300
      in vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture
      #define FRAG_COLOR out_FragColor
      #else
      varying vec2 v_textureCoordinates;
      #define SAMPLE_TEX texture2D
      #define FRAG_COLOR gl_FragColor
      #endif

      void main() {
        vec2 uv = v_textureCoordinates;
        vec4 centerColor = SAMPLE_TEX(colorTexture, uv);

        float dist = abs(uv.y - focusCenter);
        float blurMix = smoothstep(focusSpread * 0.7, focusSpread * 2.1, dist) * blurStrength;

        vec2 o = vec2(0.0035 * blurMix, 0.0);
        vec4 blurColor = vec4(0.0);
        blurColor += SAMPLE_TEX(colorTexture, uv - 3.0 * o) * 0.12;
        blurColor += SAMPLE_TEX(colorTexture, uv - 2.0 * o) * 0.16;
        blurColor += SAMPLE_TEX(colorTexture, uv - 1.0 * o) * 0.18;
        blurColor += SAMPLE_TEX(colorTexture, uv) * 0.20;
        blurColor += SAMPLE_TEX(colorTexture, uv + 1.0 * o) * 0.18;
        blurColor += SAMPLE_TEX(colorTexture, uv + 2.0 * o) * 0.16;
        blurColor += SAMPLE_TEX(colorTexture, uv + 3.0 * o) * 0.12;

        FRAG_COLOR = mix(centerColor, blurColor, clamp(blurMix * 1.05, 0.0, 1.0));
      }
    `,
        uniforms: {
            focusCenter: 0.56,
            focusSpread: 0.11,
            blurStrength: 0.0,
        },
    });

    viewer.scene.postProcessStages.add(tiltShiftStage);
    tiltShiftStage.enabled = false;
}

function bindFrameUpdates(viewer, Cesium) {
    const scene = viewer?.scene;
    if (!scene) return;

    preRenderListener = scene.preRender.addEventListener(() => {
        const height = getCameraHeight(viewer);
        const pitch = Number(viewer?.camera?.pitch ?? -1.2);

        frameCounter += 1;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - fpsStamp >= 1000) {
            fpsValue = Math.round((frameCounter * 1000) / (now - fpsStamp));
            frameCounter = 0;
            fpsStamp = now;
        }

        if (fogStage) {
            fogStage.enabled = fogEnabled.value;
            fogStage.uniforms.cameraHeightFactor = normalizeHeight(height, 150.0, 12000.0);
            fogStage.uniforms.fogDensity =
                0.00055 + (1.0 - fogStage.uniforms.cameraHeightFactor) * 0.00125;
        }

        if (ambientOcclusionStage) {
            ambientOcclusionStage.enabled = hbaoEnabled.value;
        }

        if (tiltShiftStage) {
            const lowAngleTrigger = pitch > -0.62;
            const blurStrength = lowAngleTrigger ? clamp01((pitch + 0.62) / 0.5) : 0;
            tiltShiftStage.enabled = tiltShiftEnabled.value && lowAngleTrigger;
            tiltShiftStage.uniforms.blurStrength = blurStrength;
        }

        if (atmosphereEnabled.value) {
            // 高度阈值：低于 800m 时自动关闭大气增强，避免与晨昏半球冲突
            const ATMOSPHERE_MIN_HEIGHT = 80000;
            if (height >= ATMOSPHERE_MIN_HEIGHT) {
                applyAtmosphereEnhancement(viewer, Cesium, height);
                atmosphereRestoredOnce = false;
            } else if (!atmosphereRestoredOnce) {
                restoreAtmosphereState(viewer);
                atmosphereRestoredOnce = true;
            }
        } else if (!atmosphereRestoredOnce) {
            restoreAtmosphereState(viewer);
            atmosphereRestoredOnce = true; // 标记已恢复，避免每帧重复
        }
    });
}

function applyAtmosphereEnhancement(viewer, Cesium, cameraHeight) {
    const scene = viewer?.scene;
    if (!scene) return;

    if (!realisticAtmosphereSnapshot) {
        realisticAtmosphereSnapshot = captureRealisticAtmosphereState(viewer);
    }
    configureRealisticAtmosphere(viewer, Cesium);

    if (typeof scene.highDynamicRange === 'boolean') {
        scene.highDynamicRange = true;
    }

    const bloom = scene.postProcessStages?.bloom;
    if (bloom) {
        bloom.enabled = true;
        if (bloom.uniforms) {
            if ('contrast' in bloom.uniforms) bloom.uniforms.contrast = 149.0;
            if ('brightness' in bloom.uniforms) bloom.uniforms.brightness = -0.12;
            if ('delta' in bloom.uniforms) bloom.uniforms.delta = 1.0;
            if ('sigma' in bloom.uniforms) bloom.uniforms.sigma = 3.25;
            if ('stepSize' in bloom.uniforms) bloom.uniforms.stepSize = 5.0;
        }
    }

    const sky = scene.skyAtmosphere;
    if (!sky) return;

    const h = normalizeHeight(cameraHeight, 500.0, 120000.0);
    sky.hueShift = -0.035 + h * 0.035;
    sky.saturationShift = -0.14 + h * 0.09;
    sky.brightnessShift = 0.03 + (1.0 - h) * 0.08;
}

function restoreAtmosphereState(viewer) {
    const scene = viewer?.scene;
    if (!scene) return;

    const Cesium = props.getCesium?.() || window.Cesium;
    if (realisticAtmosphereSnapshot) {
        restoreRealisticAtmosphere(viewer, Cesium, realisticAtmosphereSnapshot);
        realisticAtmosphereSnapshot = null;
        return;
    }

    if (typeof scene.highDynamicRange === 'boolean' && originalSceneState.hdr !== null) {
        scene.highDynamicRange = originalSceneState.hdr;
    }

    // 恢复 sunBloom 状态
    if ('sunBloom' in scene && originalSceneState.sunBloom !== undefined) {
        scene.sunBloom = originalSceneState.sunBloom;
    }

    // 恢复 Globe 关键属性（晨昏半球必需）
    const globe = scene.globe;
    if (globe && originalSceneState.globe) {
        const g = originalSceneState.globe;
        if (g.enableLighting !== undefined) globe.enableLighting = g.enableLighting;
        if (g.showGroundAtmosphere !== undefined) globe.showGroundAtmosphere = g.showGroundAtmosphere;
        if (g.dynamicAtmosphereLighting !== undefined && 'dynamicAtmosphereLighting' in globe) globe.dynamicAtmosphereLighting = g.dynamicAtmosphereLighting;
        if (g.dynamicAtmosphereLightingFromSun !== undefined && 'dynamicAtmosphereLightingFromSun' in globe) globe.dynamicAtmosphereLightingFromSun = g.dynamicAtmosphereLightingFromSun;
        if (g.atmosphereLightIntensity !== undefined && 'atmosphereLightIntensity' in globe) globe.atmosphereLightIntensity = g.atmosphereLightIntensity;
        if (g.atmosphereHueShift !== undefined && 'atmosphereHueShift' in globe) globe.atmosphereHueShift = g.atmosphereHueShift;
        if (g.atmosphereSaturationShift !== undefined && 'atmosphereSaturationShift' in globe) globe.atmosphereSaturationShift = g.atmosphereSaturationShift;
        if (g.atmosphereBrightnessShift !== undefined && 'atmosphereBrightnessShift' in globe) globe.atmosphereBrightnessShift = g.atmosphereBrightnessShift;
        if (g.lightingFadeInDistance !== undefined && 'lightingFadeInDistance' in globe) globe.lightingFadeInDistance = g.lightingFadeInDistance;
        if (g.lightingFadeOutDistance !== undefined && 'lightingFadeOutDistance' in globe) globe.lightingFadeOutDistance = g.lightingFadeOutDistance;
        if (g.nightFadeInDistance !== undefined && 'nightFadeInDistance' in globe) globe.nightFadeInDistance = g.nightFadeInDistance;
        if (g.nightFadeOutDistance !== undefined && 'nightFadeOutDistance' in globe) globe.nightFadeOutDistance = g.nightFadeOutDistance;
    }

    // 恢复太阳光配置
    if (scene.light && originalSceneState.light) {
        if (originalSceneState.light.intensity !== undefined) {
            scene.light.intensity = originalSceneState.light.intensity;
        }
    }

    const bloom = scene.postProcessStages?.bloom;
    if (bloom && originalSceneState.bloom) {
        bloom.enabled = originalSceneState.bloom.enabled;
        if (bloom.uniforms) {
            if ('contrast' in bloom.uniforms && originalSceneState.bloom.contrast !== undefined)
                bloom.uniforms.contrast = originalSceneState.bloom.contrast;
            if ('brightness' in bloom.uniforms && originalSceneState.bloom.brightness !== undefined)
                bloom.uniforms.brightness = originalSceneState.bloom.brightness;
            if ('delta' in bloom.uniforms && originalSceneState.bloom.delta !== undefined)
                bloom.uniforms.delta = originalSceneState.bloom.delta;
            if ('sigma' in bloom.uniforms && originalSceneState.bloom.sigma !== undefined)
                bloom.uniforms.sigma = originalSceneState.bloom.sigma;
            if ('stepSize' in bloom.uniforms && originalSceneState.bloom.stepSize !== undefined)
                bloom.uniforms.stepSize = originalSceneState.bloom.stepSize;
        }
    }

    if (scene.skyAtmosphere && originalSceneState.sky) {
        if (originalSceneState.sky.show !== undefined) {
            scene.skyAtmosphere.show = originalSceneState.sky.show;
        }
        scene.skyAtmosphere.hueShift = originalSceneState.sky.hueShift;
        scene.skyAtmosphere.saturationShift = originalSceneState.sky.saturationShift;
        scene.skyAtmosphere.brightnessShift = originalSceneState.sky.brightnessShift;
    }

    // 恢复太阳、月亮、天空盒显示状态
    if (originalSceneState.celestial) {
        const c = originalSceneState.celestial;
        if (scene.sun && c.sunShow !== undefined) scene.sun.show = c.sunShow;
        if (scene.moon && c.moonShow !== undefined) scene.moon.show = c.moonShow;
        if (scene.skyBox && c.skyBoxShow !== undefined) scene.skyBox.show = c.skyBoxShow;
    }

    scene.requestRender?.();
}

function stopRealtimeSampling() {
    if (samplingTimer) {
        clearInterval(samplingTimer);
        samplingTimer = null;
    }
}

async function toggleChartVisibility() {
    const nextVisible = !chartVisible.value;
    chartVisible.value = nextVisible;

    if (!nextVisible) {
        stopRealtimeSampling();
        return;
    }

    const viewer = props.getViewer?.();
    const Cesium = props.getCesium?.() || window.Cesium;
    if (!viewer || !Cesium) {
        chartVisible.value = false;
        message.warning('图表暂不可用：3D Viewer 尚未就绪。');
        return;
    }

    try {
        await initEchartsRuntime(viewer, Cesium);
        startRealtimeSampling(viewer, Cesium);
        collectAndRenderPoint(viewer, Cesium);
    } catch (error) {
        chartVisible.value = false;
        message.error('图表模块加载失败', error);
    }
}

async function initEchartsRuntime(viewer, Cesium) {
    await ensureEchartsReady();
    await nextTick();

    if (!chartRef.value) return;

    if (!chartInstance) {
        chartInstance = echartsModule.init(chartRef.value);
        renderChartOption();
    }

    if (!resizeHandler) {
        resizeHandler = () => {
            chartInstance?.resize();
        };
        window.addEventListener('resize', resizeHandler);
    }

    chartInstance.resize();
    collectAndRenderPoint(viewer, Cesium);
}

function startRealtimeSampling(viewer, Cesium) {
    if (samplingTimer) return;
    samplingTimer = window.setInterval(() => {
        if (!chartInstance || !chartVisible.value) return;
        collectAndRenderPoint(viewer, Cesium);
    }, 1200);
}

function collectAndRenderPoint(viewer, Cesium) {
    const now = new Date();
    const label = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const cameraHeightKm = Number((getCameraHeight(viewer) / 1000).toFixed(2));
    const pitchDeg = Number(Cesium.Math.toDegrees(viewer?.camera?.pitch ?? 0).toFixed(1));

    pushFixedLength(chartData.labels, label, 20);
    pushFixedLength(chartData.cameraHeightKm, cameraHeightKm, 20);
    pushFixedLength(chartData.pitchDeg, pitchDeg, 20);
    pushFixedLength(chartData.fps, fpsValue, 20);

    chartInstance.setOption({
        xAxis: {
            data: chartData.labels,
        },
        series: [
            { data: chartData.cameraHeightKm },
            { data: chartData.pitchDeg },
            { data: chartData.fps },
        ],
    });
}

function renderChartOption() {
    if (!chartInstance) return;

    chartInstance.setOption({
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
        },
        legend: {
            top: 10,
            left: 'center',
            textStyle: {
                color: '#ddf7e8',
                fontSize: 11,
            },
            itemGap: 22,
        },
        grid: {
            left: 38,
            right: 20,
            top: 85,
            bottom: 24,
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: [],
            axisLine: { lineStyle: { color: 'rgba(190, 240, 210, 0.35)' } },
            axisLabel: { color: 'rgba(223, 248, 232, 0.85)', fontSize: 10 },
        },
        yAxis: [
            {
                type: 'value',
                name: '高度(km)/FPS',
                nameTextStyle: { color: 'rgba(223, 248, 232, 0.85)' },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: 'rgba(190, 240, 210, 0.12)' } },
                axisLabel: { color: 'rgba(223, 248, 232, 0.85)', fontSize: 10 },
            },
            {
                type: 'value',
                name: '俯仰角(°)',
                position: 'right',
                min: -90,
                max: 0,
                nameTextStyle: { color: 'rgba(223, 248, 232, 0.85)' },
                splitLine: { show: false },
                axisLabel: { color: 'rgba(223, 248, 232, 0.85)', fontSize: 10 },
            },
        ],
        series: [
            {
                name: '相机高度(km)',
                type: 'line',
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#67e8f9' },
                areaStyle: { color: 'rgba(103, 232, 249, 0.14)' },
                data: [],
            },
            {
                name: '俯仰角(°)',
                type: 'line',
                yAxisIndex: 1,
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#facc15' },
                areaStyle: { color: 'rgba(250, 204, 21, 0.12)' },
                data: [],
            },
            {
                name: '帧率(FPS)',
                type: 'line',
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#86efac' },
                areaStyle: { color: 'rgba(134, 239, 172, 0.1)' },
                data: [],
            },
        ],
    });
}

function cleanupEffects() {
    if (bootstrapTimer) {
        clearInterval(bootstrapTimer);
        bootstrapTimer = null;
    }

    stopRealtimeSampling();

    const viewer = props.getViewer?.();
    const sceneStages = viewer?.scene?.postProcessStages;

    if (preRenderListener) {
        preRenderListener();
        preRenderListener = null;
    }

    if (renderErrorListener) {
        renderErrorListener();
        renderErrorListener = null;
    }

    if (fogStage && sceneStages) {
        sceneStages.remove(fogStage);
    }
    fogStage = null;

    if (tiltShiftStage && sceneStages) {
        sceneStages.remove(tiltShiftStage);
    }
    tiltShiftStage = null;

    if (ambientOcclusionStage) {
        if (createdAmbientOcclusionStage && sceneStages) {
            sceneStages.remove(ambientOcclusionStage);
        }
        ambientOcclusionStage = null;
    }
    createdAmbientOcclusionStage = false;
    atmosphereRestoredOnce = false; // 重置大气恢复标记

    if (viewer) {
        restoreAtmosphereState(viewer);
    }

    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }

    if (chartInstance) {
        chartInstance.dispose();
        chartInstance = null;
    }
    echartsModule = null;
    hasRenderErrorNotified = false;
}

function getCameraHeight(viewer) {
    const ellipsoid = viewer?.scene?.globe?.ellipsoid;
    const position = viewer?.camera?.positionWC;
    if (!ellipsoid || !position) return 0;

    const cartographic = ellipsoid.cartesianToCartographic(position);
    return Math.max(0, Number(cartographic?.height ?? 0));
}

function normalizeHeight(value, min, max) {
    if (!Number.isFinite(value) || max <= min) return 0;
    return clamp01((value - min) / (max - min));
}

function clamp01(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
}

function pushFixedLength(arr, value, maxLen) {
    arr.push(value);
    if (arr.length > maxLen) arr.shift();
}

function pad2(value) {
    return String(value).padStart(2, '0');
}
</script>

<style scoped>
.advanced-effects-root {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1300;
    pointer-events: none;
}

.effects-panel {
    width: 360px;
    border-radius: 12px;
    border: 1px solid rgba(162, 245, 190, 0.22);
    background: linear-gradient(155deg, rgba(9, 38, 23, 0.82), rgba(20, 71, 44, 0.78));
    box-shadow: 0 14px 28px rgba(3, 17, 10, 0.35);
    color: #ddf8e8;
    backdrop-filter: blur(10px);
    pointer-events: auto;
}

.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(162, 245, 190, 0.15);
}

.panel-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.3px;
}

.panel-btn {
    border: 1px solid rgba(162, 245, 190, 0.35);
    background: rgba(13, 55, 33, 0.6);
    color: #def8e8;
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
}

.panel-btn:hover {
    background: rgba(25, 90, 52, 0.78);
}

.effect-switches {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 14px 16px 12px;
}

.switch-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(223, 248, 232, 0.95);
}

.switch-item input[type='checkbox'] {
    accent-color: #4ade80;
}

.fx-chart {
    width: calc(100% - 16px);
    height: 200px;
    margin: 0 8px 10px;
}

@media (max-width: 768px) {
    .advanced-effects-root {
        top: 10px;
        right: 10px;
    }

    .effects-panel {
        width: 320px;
    }

    .fx-chart {
        height: 160px;
    }
}
</style>
