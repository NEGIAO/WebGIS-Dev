<template>
    <div
        ref="containerRef"
        class="lil-gui-host"
    ></div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import GUI from 'lil-gui';

const props = defineProps({
    title: {
        type: String,
        default: 'Parameters',
    },
    controls: {
        type: Array,
        default: () => [],
    },
});

const emit = defineEmits(['change']);

const containerRef = ref(null);
const guiTarget = {};
const controllers = new Map();

let gui = null;
let currentSignature = '';
let renderQueued = false;

watch(
    () => [props.title, props.controls],
    () => {
        queueRenderGui();
    },
    { deep: true, flush: 'post', immediate: true },
);

onBeforeUnmount(() => {
    destroyGui();
});

function queueRenderGui() {
    if (typeof window === 'undefined' || renderQueued) return;

    renderQueued = true;
    nextTick(() => {
        renderQueued = false;
        renderGui();
    });
}

function renderGui() {
    const container = containerRef.value;
    if (!container) return;

    const signature = getControlsSignature(props.controls);
    if (!gui || signature !== currentSignature) {
        destroyGui();
        createGui(container, signature);
    }

    syncGui();
}

function createGui(container, signature) {
    gui = new GUI({
        container,
        autoPlace: false,
        title: props.title || 'Parameters',
        width: Math.max(260, Math.floor(container.clientWidth || 320)),
    });
    gui.domElement.classList.add('cesium-lil-gui');
    container.replaceChildren(gui.domElement);
    currentSignature = signature;

    for (const control of props.controls || []) {
        const controller = createController(control);
        if (controller) {
            controllers.set(control.id, controller);
        }
    }
}

function createController(control) {
    guiTarget[control.id] = getControlValue(control);

    let controller = null;
    if (control.type === 'range') {
        controller = gui.add(
            guiTarget,
            control.id,
            toFiniteNumber(control.min, 0),
            toFiniteNumber(control.max, 1),
            toFiniteNumber(control.step, 0.01),
        );
    } else if (control.type === 'color') {
        controller = gui.addColor(guiTarget, control.id);
    } else if (control.type === 'select') {
        controller = gui.add(guiTarget, control.id, getControlOptions(control));
    } else {
        controller = gui.add(guiTarget, control.id);
    }

    controller
        .name(getControlLabel(control))
        .onChange((value) => {
            const latestControl = findControl(control.id) || control;
            if (latestControl.disabled) return;
            emit('change', {
                control: latestControl,
                controlId: latestControl.id,
                value,
            });
        });

    decorateController(controller, control);
    return controller;
}

function syncGui() {
    if (!gui) return;
    gui.title(props.title || 'Parameters');

    for (const control of props.controls || []) {
        const controller = controllers.get(control.id);
        if (!controller) continue;

        const nextValue = getControlValue(control);
        if (!areValuesEqual(guiTarget[control.id], nextValue)) {
            guiTarget[control.id] = nextValue;
            controller.updateDisplay();
        }

        controller.name(getControlLabel(control));
        controller.disable(!!control.disabled);
        decorateController(controller, control);
    }
}

function decorateController(controller, control) {
    controller.domElement.title = control.tooltip || '';
    controller.domElement.dataset.controlId = control.id || '';
    controller.domElement.dataset.controlType = control.type || '';
}

function getControlsSignature(controls = []) {
    return JSON.stringify(
        controls.map(control => ({
            id: control.id,
            type: control.type,
            min: control.min,
            max: control.max,
            step: control.step,
            options: (control.options || []).map(option => ({
                label: option.label,
                value: option.value,
            })),
        })),
    );
}

function getControlLabel(control) {
    if (!control.displayValue) return control.label || control.id;
    return `${control.label || control.id} (${control.displayValue})`;
}

function getControlValue(control) {
    if (control.type === 'range') {
        return toFiniteNumber(control.value, toFiniteNumber(control.min, 0));
    }
    if (control.type === 'toggle') {
        return !!control.value;
    }
    if (control.type === 'select') {
        return control.value ?? control.options?.[0]?.value ?? '';
    }
    if (control.type === 'color') {
        return typeof control.value === 'string' && control.value ? control.value : '#ffffff';
    }
    return control.value;
}

function getControlOptions(control) {
    const options = {};
    for (const option of control.options || []) {
        options[option.label || option.value] = option.value;
    }
    return options;
}

function findControl(controlId) {
    return props.controls.find(control => control.id === controlId) || null;
}

function areValuesEqual(left, right) {
    if (typeof left === 'number' || typeof right === 'number') {
        return Math.abs(Number(left) - Number(right)) < 1e-12;
    }
    return left === right;
}

function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function destroyGui() {
    if (gui) {
        try {
            gui.destroy();
        } catch (error) {
            console.warn('lil-gui destroy warning:', error);
        }
    }

    gui = null;
    currentSignature = '';
    controllers.clear();
    for (const key of Object.keys(guiTarget)) {
        delete guiTarget[key];
    }
}
</script>

<style scoped>
.lil-gui-host {
    min-width: 0;
}

.lil-gui-host :deep(.cesium-lil-gui) {
    width: 100% !important;
    overflow: hidden;
    border: 1px solid rgba(155, 216, 255, 0.14);
    border-radius: 8px;
    background: rgba(3, 18, 28, 0.72);
    color: #eefbf3;
    --background-color: rgba(3, 18, 28, 0.72);
    --title-background-color: rgba(15, 40, 54, 0.92);
    --title-text-color: #f6fffb;
    --text-color: rgba(238, 251, 243, 0.9);
    --widget-color: rgba(155, 216, 255, 0.16);
    --hover-color: rgba(155, 216, 255, 0.24);
    --focus-color: rgba(74, 222, 128, 0.36);
    --number-color: #85d7ff;
    --string-color: #b8ffd6;
    --font-size: 11px;
    --input-font-size: 11px;
    --widget-height: 24px;
    --title-height: 30px;
    --name-width: 46%;
    --slider-input-width: 31%;
    --color-input-width: 31%;
    --widget-border-radius: 6px;
}

.lil-gui-host :deep(.cesium-lil-gui > .lil-title) {
    /* 视觉隐藏 lil-gui 自带标题（避免与 module-head 重复），保留 DOM 以维持折叠逻辑 */
    height: 0;
    min-height: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: hidden;
    border: none !important;
    font-size: 0;
    line-height: 0;
}

.lil-gui-host :deep(.cesium-lil-gui .lil-children) {
    padding: 6px;
}

.lil-gui-host :deep(.cesium-lil-gui .lil-controller) {
    min-height: 30px;
    border-radius: 7px;
}

.lil-gui-host :deep(.cesium-lil-gui .lil-name) {
    overflow: hidden;
    color: rgba(238, 251, 243, 0.84);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.lil-gui-host :deep(.cesium-lil-gui input),
.lil-gui-host :deep(.cesium-lil-gui select) {
    color: #eefbf3;
}

.lil-gui-host :deep(.cesium-lil-gui .lil-controller.lil-disabled) {
    opacity: 0.46;
}
</style>
