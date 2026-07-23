import { computed, ref } from 'vue';

const FRAME_RATE_SAMPLE_INTERVAL_MS = 500;
const MAX_FRAME_RATE_SAMPLES = 48;
const CHART_WIDTH = 160;
const CHART_HEIGHT = 48;

export function useCesiumFrameRate({ getViewer }) {
    const frameRate = ref(null);
    const frameRateSamples = ref([]);
    const frameRateDisplay = computed(() => (
        Number.isFinite(frameRate.value) ? String(frameRate.value) : '--'
    ));
    const frameRateLinePoints = computed(() => (
        createFrameRateLinePoints(frameRateSamples.value)
    ));
    let removePreRenderListener = null;
    let frameCount = 0;
    let lastSampleTime = getNow();

    function setupFrameRateMonitor() {
        const scene = getViewer?.()?.scene;
        if (!scene?.preRender) return;

        cleanupFrameRateMonitor();
        frameRate.value = null;
        frameRateSamples.value = [];
        frameCount = 0;
        lastSampleTime = getNow();

        removePreRenderListener = scene.preRender.addEventListener(() => {
            frameCount += 1;
            const now = getNow();
            const elapsed = now - lastSampleTime;
            if (elapsed < FRAME_RATE_SAMPLE_INTERVAL_MS) return;

            const fps = Math.round((frameCount * 1000) / elapsed);
            frameRate.value = fps;
            frameRateSamples.value = [...frameRateSamples.value.slice(1 - MAX_FRAME_RATE_SAMPLES), fps];
            frameCount = 0;
            lastSampleTime = now;
        });
    }

    function cleanupFrameRateMonitor() {
        if (typeof removePreRenderListener === 'function') {
            removePreRenderListener();
            removePreRenderListener = null;
        }
    }

    return {
        frameRateDisplay,
        frameRateLinePoints,
        setupFrameRateMonitor,
        cleanupFrameRateMonitor,
    };
}

function getNow() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function createFrameRateLinePoints(samples) {
    if (!samples.length) return '';

    const maxFps = Math.max(60, ...samples);
    const xStep = CHART_WIDTH / (MAX_FRAME_RATE_SAMPLES - 1);
    const offset = MAX_FRAME_RATE_SAMPLES - samples.length;

    return samples
        .map((sample, index) => {
            const x = (offset + index) * xStep;
            const normalized = Math.max(0, Math.min(sample / maxFps, 1));
            const y = CHART_HEIGHT - normalized * CHART_HEIGHT;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
}
