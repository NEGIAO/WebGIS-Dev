<template>
    <aside class="cesium-tool-panel">
        <div class="panel-header">
            <div>
                <div class="panel-title">Cesium 控制台</div>
                <div class="panel-subtitle">场景、图层与功能参数</div>
            </div>
            <Settings :size="18" />
        </div>

        <section class="panel-section">
            <div class="section-head">
                <Layers :size="16" />
                <span>地图源</span>
            </div>
            <div class="segmented">
                <button
                    v-for="option in basemapOptions"
                    :key="option.value"
                    class="segment-btn"
                    :class="{ active: option.value === activeBasemap }"
                    @click="$emit('update:activeBasemap', option.value)"
                >
                    {{ option.label }}
                </button>
            </div>
        </section>

        <section class="panel-section">
            <div class="section-head">
                <Mountain :size="16" />
                <span>地形</span>
            </div>
            <div class="segmented">
                <button
                    v-for="option in terrainOptions"
                    :key="option.value"
                    class="segment-btn"
                    :class="{ active: option.value === activeTerrain }"
                    @click="$emit('update:activeTerrain', option.value)"
                >
                    {{ option.label }}
                </button>
            </div>
        </section>

        <section class="panel-section">
            <div class="section-head">
                <SlidersHorizontal :size="16" />
                <span>功能模块</span>
            </div>

            <div class="module-list">
                <article
                    v-for="module in modules"
                    :key="module.id"
                    class="module-item"
                    :class="{ expanded: isModuleExpanded(module.id) }"
                >
                    <div
                        class="module-head"
                        role="button"
                        tabindex="0"
                        :aria-expanded="isModuleExpanded(module.id)"
                        @click="toggleModule(module.id)"
                        @keydown.enter.prevent="toggleModule(module.id)"
                        @keydown.space.prevent="toggleModule(module.id)"
                    >
                        <span class="module-icon">
                            <component
                                :is="getModuleIcon(module.id)"
                                :size="16"
                                stroke-width="2"
                            />
                        </span>
                        <span class="module-copy">
                            <span class="module-title">{{ module.title }}</span>
                            <span
                                v-if="module.description"
                                class="module-desc"
                            >
                                {{ module.description }}
                            </span>
                        </span>
                        <span class="module-head-side">
                            <span
                                v-if="module.status"
                                class="module-status"
                                :class="module.statusTone || 'neutral'"
                            >
                                {{ module.status }}
                            </span>
                            <ChevronDown
                                class="module-chevron"
                                :size="15"
                            />
                        </span>
                    </div>

                    <div
                        v-if="isModuleExpanded(module.id)"
                        class="module-body"
                    >
                        <div
                            v-if="module.actions?.length"
                            class="module-actions"
                        >
                            <button
                                v-for="action in module.actions"
                                :key="action.id"
                                class="tool-action"
                                :class="[action.variant || 'default', { active: action.active }]"
                                :disabled="action.disabled"
                                @click="$emit('module-action', { moduleId: module.id, actionId: action.id })"
                            >
                                <component
                                    :is="getActionIcon(module.id, action.id)"
                                    :size="14"
                                    stroke-width="2"
                                />
                                {{ action.label }}
                            </button>
                        </div>

                        <div
                            v-if="module.controls?.length"
                            class="control-list"
                        >
                            <label
                                v-for="control in module.controls"
                                :key="control.id"
                                class="control-row"
                            >
                                <span class="control-label">{{ control.label }}</span>

                                <template v-if="control.type === 'range'">
                                    <input
                                        class="control-range"
                                        type="range"
                                        :min="control.min"
                                        :max="control.max"
                                        :step="control.step"
                                        :value="control.value"
                                        :disabled="control.disabled"
                                        @input="emitControlChange(module.id, control, $event.target.value)"
                                    />
                                    <input
                                        class="control-number"
                                        type="number"
                                        :min="control.min"
                                        :max="control.max"
                                        :step="control.step"
                                        :value="control.value"
                                        :disabled="control.disabled"
                                        @input="emitControlChange(module.id, control, $event.target.value)"
                                    />
                                </template>

                                <select
                                    v-else-if="control.type === 'select'"
                                    class="control-select"
                                    :value="control.value"
                                    :disabled="control.disabled"
                                    @change="emitControlChange(module.id, control, $event.target.value)"
                                >
                                    <option
                                        v-for="option in control.options || []"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.label }}
                                    </option>
                                </select>

                                <input
                                    v-else-if="control.type === 'toggle'"
                                    class="control-toggle"
                                    type="checkbox"
                                    :checked="!!control.value"
                                    :disabled="control.disabled"
                                    @change="emitControlChange(module.id, control, $event.target.checked)"
                                />

                                <span
                                    v-if="control.displayValue"
                                    class="control-value"
                                >
                                    {{ control.displayValue }}
                                </span>
                            </label>
                        </div>
                    </div>
                </article>
            </div>
        </section>
    </aside>
</template>

<script setup>
import { ref } from 'vue';
import {
    Box,
    ChevronDown,
    Droplets,
    Eye,
    Home,
    Layers,
    Mountain,
    Navigation,
    Play,
    RotateCcw,
    Settings,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    Wind,
} from 'lucide-vue-next';

defineProps({
    basemapOptions: {
        type: Array,
        default: () => [],
    },
    terrainOptions: {
        type: Array,
        default: () => [],
    },
    activeBasemap: {
        type: String,
        default: '',
    },
    activeTerrain: {
        type: String,
        default: '',
    },
    modules: {
        type: Array,
        default: () => [],
    },
});

const emit = defineEmits([
    'update:activeBasemap',
    'update:activeTerrain',
    'module-action',
    'control-change',
]);

const expandedModuleIds = ref(new Set());

function isModuleExpanded(moduleId) {
    return expandedModuleIds.value.has(moduleId);
}

function toggleModule(moduleId) {
    const next = new Set(expandedModuleIds.value);
    if (next.has(moduleId)) {
        next.delete(moduleId);
    } else {
        next.add(moduleId);
    }
    expandedModuleIds.value = next;
}

function getModuleIcon(moduleId) {
    const icons = {
        scene: Navigation,
        effects: Sparkles,
        wind: Wind,
        fluid: Droplets,
    };
    return icons[moduleId] || SlidersHorizontal;
}

function getActionIcon(moduleId, actionId) {
    const icons = {
        scene: {
            home: Home,
            everest: Mountain,
            tileset: Box,
        },
        wind: {
            load: Play,
            clear: Trash2,
        },
        fluid: {
            pick: Eye,
            clear: Trash2,
        },
    };
    return icons[moduleId]?.[actionId] || RotateCcw;
}

function emitControlChange(moduleId, control, rawValue) {
    const value = control.type === 'range' ? Number(rawValue) : rawValue;
    emit('control-change', {
        moduleId,
        controlId: control.id,
        value,
    });
}
</script>

<style scoped>
.cesium-tool-panel {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1200;
    width: 360px;
    max-height: calc(100% - 24px);
    overflow: auto;
    border: 1px solid rgba(114, 222, 151, 0.28);
    border-radius: 8px;
    background: rgba(8, 31, 20, 0.9);
    color: #eefbf3;
    box-shadow: 0 16px 34px rgba(2, 14, 8, 0.38);
    backdrop-filter: blur(12px);
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(114, 222, 151, 0.18);
}

.panel-title {
    font-size: 14px;
    font-weight: 700;
}

.panel-subtitle {
    margin-top: 3px;
    color: rgba(238, 251, 243, 0.66);
    font-size: 12px;
}

.panel-section {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(114, 222, 151, 0.14);
}

.panel-section:last-child {
    border-bottom: 0;
}

.section-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    color: rgba(238, 251, 243, 0.9);
    font-size: 12px;
    font-weight: 700;
}

.segmented {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 6px;
}

.segment-btn,
.tool-action {
    min-height: 32px;
    border: 1px solid rgba(114, 222, 151, 0.24);
    border-radius: 8px;
    background: rgba(16, 67, 41, 0.68);
    color: #eefbf3;
    cursor: pointer;
    line-height: 1.2;
    padding: 6px 10px;
}

.segment-btn.active,
.tool-action.primary,
.tool-action.active {
    border-color: rgba(134, 239, 172, 0.86);
    background: rgba(21, 128, 61, 0.9);
}

.tool-action.danger {
    border-color: rgba(255, 143, 143, 0.52);
    background: rgba(112, 35, 45, 0.72);
}

.segment-btn:hover,
.tool-action:hover {
    background: rgba(33, 138, 72, 0.88);
}

.tool-action:disabled {
    cursor: not-allowed;
    opacity: 0.48;
}

.module-list {
    display: grid;
    gap: 10px;
}

.module-item {
    overflow: hidden;
    border: 1px solid rgba(114, 222, 151, 0.16);
    border-radius: 8px;
    background: rgba(6, 24, 15, 0.72);
    box-shadow: inset 0 1px 0 rgba(214, 255, 227, 0.04);
}

.module-item.expanded {
    border-color: rgba(91, 209, 132, 0.42);
    background: rgba(7, 37, 22, 0.82);
}

.module-head {
    width: 100%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 11px;
    min-height: 58px;
    padding: 10px 12px;
    text-align: left;
}

.module-head:focus-visible {
    outline: 2px solid rgba(134, 239, 172, 0.72);
    outline-offset: -2px;
}

.module-head:hover {
    background: rgba(52, 168, 92, 0.14);
}

.module-icon {
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(134, 239, 172, 0.24);
    border-radius: 8px;
    background: rgba(30, 94, 54, 0.42);
    color: #9ef0bd;
}

.module-chevron {
    flex: 0 0 auto;
    color: rgba(190, 245, 210, 0.72);
    transition: transform 0.18s ease;
}

.module-item.expanded .module-chevron {
    transform: rotate(180deg);
}

.module-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
    flex: 1 1 auto;
}

.module-title {
    color: #f1fff5;
    font-size: 13.5px;
    font-weight: 750;
    line-height: 1.15;
}

.module-desc {
    overflow: hidden;
    color: rgba(223, 246, 231, 0.58);
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.module-status {
    flex: 0 0 auto;
    min-width: 48px;
    border-radius: 6px;
    padding: 3px 7px;
    font-size: 11px;
    line-height: 1.1;
    text-align: center;
}

.module-head-side {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    max-width: 116px;
}

.module-status.success {
    background: rgba(59, 180, 118, 0.26);
    color: #b8ffd6;
}

.module-status.warning {
    background: rgba(230, 164, 55, 0.24);
    color: #ffe0a3;
}

.module-status.neutral {
    background: rgba(114, 222, 151, 0.14);
    color: rgba(238, 251, 243, 0.78);
}

.module-body {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 12px;
    padding: 12px;
    border-top: 1px solid rgba(114, 222, 151, 0.12);
    background:
        linear-gradient(180deg, rgba(11, 48, 28, 0.78), rgba(6, 27, 17, 0.78));
}

.module-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    gap: 7px;
    padding: 0;
}

.tool-action {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-height: 34px;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
}

.control-list {
    display: grid;
    gap: 8px;
    padding: 0;
}

.control-row {
    display: grid;
    grid-template-columns: 68px minmax(0, 1fr) 64px;
    align-items: center;
    gap: 9px;
    min-height: 32px;
    border: 1px solid rgba(114, 222, 151, 0.1);
    border-radius: 7px;
    background: rgba(2, 16, 9, 0.32);
    padding: 6px 7px;
    font-size: 12px;
}

.control-label {
    color: rgba(238, 251, 243, 0.8);
    font-weight: 650;
}

.control-range {
    width: 100%;
    accent-color: #42b983;
}

.control-number,
.control-select {
    min-width: 0;
    height: 26px;
    border: 1px solid rgba(114, 222, 151, 0.24);
    border-radius: 5px;
    background: rgba(3, 18, 11, 0.84);
    color: #eefbf3;
    padding: 0 6px;
    font-size: 12px;
}

.control-select {
    grid-column: span 2;
}

.control-toggle {
    justify-self: start;
    accent-color: #42b983;
}

.control-value {
    grid-column: 2 / 4;
    color: rgba(174, 230, 194, 0.68);
    font-size: 11px;
}

@media (max-width: 768px) {
    .cesium-tool-panel {
        top: 10px;
        left: 10px;
        right: 10px;
        width: auto;
        max-height: 46%;
    }
}
</style>
