<template>
    <aside
        class="cesium-tool-shell"
        :class="{
            'is-open': isPanelOpen,
            'is-embedded': embedded,
        }"
    >
        <button
            v-if="!embedded && !isPanelOpen"
            class="tool-launcher"
            type="button"
            title="打开 3D 高级控制台"
            @click="setPanelOpen(true)"
        >
            <SlidersHorizontal
                :size="18"
                stroke-width="2"
            />
            <span>高级控制台</span>
            <span
                v-if="activeModuleCount"
                class="launcher-count"
            >
                {{ activeModuleCount }}
            </span>
        </button>

        <section
            v-show="embedded || isPanelOpen"
            class="cesium-tool-panel"
            :class="{ compact: compactMode }"
            aria-label="Cesium 高级控制台"
        >
            <header class="panel-header">
                <div class="panel-title-block">
                    <span class="panel-mark">
                        <Navigation
                            :size="18"
                            stroke-width="2"
                        />
                    </span>
                    <span class="panel-copy">
                        <span class="panel-title">3D 高级控制台</span>
                        <span class="panel-subtitle">
                            {{ activeBasemapLabel }} / {{ activeTerrainLabel }}
                        </span>
                    </span>
                </div>

                <div class="panel-actions">
                    <button
                        class="icon-btn"
                        type="button"
                        :title="compactMode ? '切换为舒展布局' : '切换为紧凑布局'"
                        @click="compactMode = !compactMode"
                    >
                        <Settings
                            :size="16"
                            stroke-width="2"
                        />
                    </button>
                    <button
                        v-if="!embedded"
                        class="icon-btn"
                        type="button"
                        title="隐藏面板"
                        @click="setPanelOpen(false)"
                    >
                        <X
                            :size="17"
                            stroke-width="2"
                        />
                    </button>
                </div>
            </header>

            <nav
                class="panel-tabs"
                aria-label="3D 工具分类"
            >
                <button
                    v-for="tab in panelTabs"
                    :key="tab.id"
                    class="tab-btn"
                    :class="{ active: activeTab === tab.id }"
                    type="button"
                    :aria-pressed="activeTab === tab.id"
                    @click="activeTab = tab.id"
                >
                    <component
                        :is="tab.icon"
                        :size="15"
                        stroke-width="2"
                    />
                    <span>{{ tab.label }}</span>
                </button>
            </nav>

            <div class="panel-scroll">
                <section
                    v-show="activeTab === 'scene'"
                    class="panel-page"
                >
                    <div class="overview-grid">
                        <div class="overview-tile">
                            <span class="overview-label">地图源</span>
                            <strong>{{ activeBasemapLabel }}</strong>
                        </div>
                        <div class="overview-tile">
                            <span class="overview-label">地形</span>
                            <strong>{{ activeTerrainLabel }}</strong>
                        </div>
                        <div class="overview-tile">
                            <span class="overview-label">模块</span>
                            <strong>{{ activeModuleCount }}/{{ featureModules.length }}</strong>
                        </div>
                    </div>

                    <div
                        v-if="sceneActions.length"
                        class="quick-actions"
                    >
                        <button
                            v-for="action in sceneActions"
                            :key="action.id"
                            class="tool-action"
                            :class="[action.variant || 'default', { active: action.active }]"
                            :disabled="action.disabled"
                            type="button"
                            @click="emitModuleAction(sceneModule.id, action.id)"
                        >
                            <component
                                :is="getActionIcon(sceneModule.id, action.id)"
                                :size="15"
                                stroke-width="2"
                            />
                            {{ action.label }}
                        </button>
                    </div>
                    <div
                        v-else
                        class="empty-state"
                    >
                        暂无场景快捷操作
                    </div>
                </section>

                <section
                    v-show="activeTab === 'layers'"
                    class="panel-page"
                >
                    <div
                        v-if="basemapOptions.length"
                        class="option-group"
                    >
                        <div class="section-head">
                            <Layers
                                :size="16"
                                stroke-width="2"
                            />
                            <span>地图源</span>
                        </div>
                        <div class="option-grid">
                            <button
                                v-for="option in basemapOptions"
                                :key="option.value"
                                class="option-card"
                                :class="{ active: option.value === activeBasemap }"
                                type="button"
                                :aria-pressed="option.value === activeBasemap"
                                :title="option.description || option.label"
                                @click="$emit('update:activeBasemap', option.value)"
                            >
                                <span>{{ option.label }}</span>
                                <Check
                                    v-if="option.value === activeBasemap"
                                    :size="15"
                                    stroke-width="2.4"
                                />
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="terrainOptions.length"
                        class="option-group"
                    >
                        <div class="section-head">
                            <Mountain
                                :size="16"
                                stroke-width="2"
                            />
                            <span>地形</span>
                        </div>
                        <div class="option-grid">
                            <button
                                v-for="option in terrainOptions"
                                :key="option.value"
                                class="option-card"
                                :class="{ active: option.value === activeTerrain }"
                                type="button"
                                :aria-pressed="option.value === activeTerrain"
                                :title="option.description || option.label"
                                @click="$emit('update:activeTerrain', option.value)"
                            >
                                <span>{{ option.label }}</span>
                                <Check
                                    v-if="option.value === activeTerrain"
                                    :size="15"
                                    stroke-width="2.4"
                                />
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="!basemapOptions.length && !terrainOptions.length"
                        class="empty-state"
                    >
                        暂无图层配置项
                    </div>
                </section>

                <section
                    v-show="activeTab === 'modules'"
                    class="panel-page"
                >
                    <div class="module-list">
                        <article
                            v-for="module in featureModules"
                            :key="module.id"
                            class="module-item"
                            :class="{ expanded: isModuleExpanded(module.id) }"
                        >
                            <button
                                class="module-head"
                                type="button"
                                :aria-expanded="isModuleExpanded(module.id)"
                                @click="toggleModule(module.id)"
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
                                        stroke-width="2"
                                    />
                                </span>
                            </button>

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
                                        type="button"
                                        @click="emitModuleAction(module.id, action.id)"
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
                                        :class="`control-${control.type}`"
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

                                        <button
                                            v-else-if="control.type === 'toggle'"
                                            class="toggle-control"
                                            :class="{ active: !!control.value }"
                                            type="button"
                                            :aria-pressed="!!control.value"
                                            :disabled="control.disabled"
                                            @click="emitControlChange(module.id, control, !control.value)"
                                        >
                                            <span class="toggle-track">
                                                <span class="toggle-thumb"></span>
                                            </span>
                                        </button>

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
                    <div
                        v-if="!featureModules.length"
                        class="empty-state"
                    >
                        暂无可用功能模块
                    </div>
                </section>
            </div>
        </section>
    </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import {
    Box,
    Check,
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
    X,
} from 'lucide-vue-next';

const props = defineProps({
    open: {
        type: Boolean,
        default: true,
    },
    embedded: {
        type: Boolean,
        default: false,
    },
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
    storageKey: {
        type: String,
        default: 'cesium_tool_panel_ui',
    },
});

const emit = defineEmits([
    'update:open',
    'update:activeBasemap',
    'update:activeTerrain',
    'module-action',
    'control-change',
]);

const storedUiState = readStoredUiState();
const activeTab = ref(storedUiState.activeTab || 'scene');
const compactMode = ref(!!storedUiState.compactMode);
const expandedModuleIds = ref(new Set(storedUiState.expandedModuleIds || ['effects']));

const isPanelOpen = computed(() => props.embedded || props.open);
const sceneModule = computed(() => props.modules.find(module => module.id === 'scene') || null);
const sceneActions = computed(() => sceneModule.value?.actions || []);
const featureModules = computed(() => props.modules.filter(module => module.id !== 'scene'));
const activeModuleCount = computed(() => {
    return featureModules.value.filter(
        module => module.statusTone === 'success' || module.statusTone === 'warning',
    ).length;
});

const panelTabs = [
    { id: 'scene', label: '场景', icon: Navigation },
    { id: 'layers', label: '图层', icon: Layers },
    { id: 'modules', label: '模块', icon: SlidersHorizontal },
];

const activeBasemapLabel = computed(() => {
    return props.basemapOptions.find(option => option.value === props.activeBasemap)?.label || '未选择';
});

const activeTerrainLabel = computed(() => {
    return props.terrainOptions.find(option => option.value === props.activeTerrain)?.label || '未选择';
});

watch(
    () => props.modules.map(module => module.id),
    (moduleIds) => {
        if (moduleIds.includes(activeTab.value)) return;
        if (activeTab.value === 'scene' || activeTab.value === 'layers' || activeTab.value === 'modules') return;
        activeTab.value = 'scene';
    },
    { immediate: true },
);

watch([activeTab, compactMode, expandedModuleIds], persistUiState, { deep: true });

function setPanelOpen(value) {
    emit('update:open', value);
}

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

function readStoredUiState() {
    if (typeof window === 'undefined') return {};

    try {
        const raw = window.localStorage.getItem(props.storageKey);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function persistUiState() {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(
            props.storageKey,
            JSON.stringify({
                activeTab: activeTab.value,
                compactMode: compactMode.value,
                expandedModuleIds: [...expandedModuleIds.value],
            }),
        );
    } catch {
        // UI preferences are optional.
    }
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

function emitModuleAction(moduleId, actionId) {
    emit('module-action', { moduleId, actionId });
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
.cesium-tool-shell {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1200;
    max-width: min(390px, calc(100% - 24px));
    color: #eefbf3;
    pointer-events: none;
}

.cesium-tool-shell.is-embedded {
    position: relative;
    inset: auto;
    z-index: auto;
    width: 100%;
    max-width: none;
    color: var(--text-primary);
    pointer-events: auto;
}

.tool-launcher,
.cesium-tool-panel {
    pointer-events: auto;
}

.tool-launcher {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    border: 1px solid rgba(155, 216, 255, 0.42);
    border-radius: 8px;
    padding: 0 12px;
    background: rgba(9, 24, 34, 0.88);
    color: #f4fbff;
    box-shadow: 0 14px 34px rgba(0, 7, 14, 0.34);
    backdrop-filter: blur(14px);
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
}

.tool-launcher:hover {
    border-color: rgba(118, 202, 255, 0.72);
    background: rgba(12, 39, 55, 0.94);
}

.launcher-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    border-radius: 999px;
    background: #3ddc84;
    color: #062315;
    font-size: 11px;
}

.cesium-tool-panel {
    width: min(380px, calc(100vw - 24px));
    max-height: calc(100vh - 116px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(155, 216, 255, 0.28);
    border-radius: 10px;
    background: rgba(9, 24, 34, 0.9);
    box-shadow: 0 20px 48px rgba(0, 8, 15, 0.42);
    backdrop-filter: blur(16px);
}

.cesium-tool-shell.is-embedded .cesium-tool-panel {
    width: 100%;
    max-height: none;
    border-color: rgba(57, 142, 87, 0.18);
    background: #ffffff;
    box-shadow: none;
    color: var(--text-primary);
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 14px;
    border-bottom: 1px solid rgba(155, 216, 255, 0.16);
}

.panel-title-block {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
}

.panel-mark {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid rgba(74, 222, 128, 0.32);
    background: rgba(15, 73, 48, 0.62);
    color: #a7f3d0;
}

.panel-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
}

.panel-title {
    color: #f6fffb;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.2;
}

.panel-subtitle {
    max-width: 230px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(220, 243, 255, 0.66);
    font-size: 12px;
}

.panel-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.icon-btn {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(155, 216, 255, 0.24);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.07);
    color: #eaf8ff;
    cursor: pointer;
}

.icon-btn:hover {
    border-color: rgba(155, 216, 255, 0.48);
    background: rgba(255, 255, 255, 0.13);
}

.panel-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid rgba(155, 216, 255, 0.14);
}

.tab-btn {
    min-width: 0;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: rgba(225, 244, 255, 0.72);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
}

.tab-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f7fffb;
}

.tab-btn.active {
    border-color: rgba(74, 222, 128, 0.38);
    background: rgba(33, 117, 82, 0.6);
    color: #ecfff5;
}

.panel-scroll {
    overflow: auto;
    scrollbar-gutter: stable;
}

.panel-scroll::-webkit-scrollbar {
    width: 8px;
}

.panel-scroll::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
}

.panel-scroll::-webkit-scrollbar-thumb {
    background: rgba(155, 216, 255, 0.28);
    border-radius: 999px;
}

.panel-page {
    display: grid;
    gap: 12px;
    padding: 12px;
}

.overview-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.overview-tile {
    min-width: 0;
    display: grid;
    gap: 4px;
    border: 1px solid rgba(155, 216, 255, 0.16);
    border-radius: 8px;
    padding: 9px 10px;
    background: rgba(255, 255, 255, 0.06);
}

.overview-label {
    color: rgba(220, 243, 255, 0.58);
    font-size: 11px;
}

.overview-tile strong {
    overflow: hidden;
    color: #f6fffb;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.quick-actions,
.module-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    gap: 7px;
}

.empty-state {
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed rgba(155, 216, 255, 0.22);
    border-radius: 8px;
    color: rgba(220, 243, 255, 0.58);
    font-size: 12px;
}

.section-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    color: rgba(238, 251, 243, 0.92);
    font-size: 12px;
    font-weight: 800;
}

.option-group {
    display: grid;
    gap: 8px;
}

.option-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
    gap: 8px;
}

.option-card {
    min-width: 0;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid rgba(155, 216, 255, 0.16);
    border-radius: 8px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(239, 250, 255, 0.82);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    text-align: left;
}

.option-card:hover {
    border-color: rgba(155, 216, 255, 0.38);
    background: rgba(255, 255, 255, 0.1);
}

.option-card span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.option-card.active {
    border-color: rgba(74, 222, 128, 0.52);
    background: rgba(24, 111, 75, 0.72);
    color: #f5fff9;
}

.module-list {
    display: grid;
    gap: 9px;
}

.module-item {
    overflow: hidden;
    border: 1px solid rgba(155, 216, 255, 0.16);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.045);
}

.module-item.expanded {
    border-color: rgba(74, 222, 128, 0.38);
    background: rgba(10, 47, 37, 0.64);
}

.module-head {
    width: 100%;
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 11px;
    border: 0;
    padding: 10px 12px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
}

.module-head:focus-visible {
    outline: 2px solid rgba(74, 222, 128, 0.72);
    outline-offset: -2px;
}

.module-head:hover {
    background: rgba(255, 255, 255, 0.07);
}

.module-icon {
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(155, 216, 255, 0.2);
    border-radius: 8px;
    background: rgba(15, 40, 54, 0.72);
    color: #b9e8ff;
}

.module-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
    flex: 1 1 auto;
}

.module-title {
    color: #f6fffb;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.15;
}

.module-desc {
    overflow: hidden;
    color: rgba(220, 243, 255, 0.58);
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.module-head-side {
    max-width: 116px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.module-status {
    min-width: 48px;
    border-radius: 6px;
    padding: 3px 7px;
    font-size: 11px;
    line-height: 1.1;
    text-align: center;
}

.module-status.success {
    background: rgba(59, 180, 118, 0.26);
    color: #b8ffd6;
}

.module-status.warning {
    background: rgba(245, 158, 11, 0.22);
    color: #ffe0a3;
}

.module-status.neutral {
    background: rgba(155, 216, 255, 0.13);
    color: rgba(238, 251, 243, 0.78);
}

.module-chevron {
    flex: 0 0 auto;
    color: rgba(220, 243, 255, 0.72);
    transition: transform 0.18s ease;
}

.module-item.expanded .module-chevron {
    transform: rotate(180deg);
}

.module-body {
    display: grid;
    gap: 12px;
    padding: 12px;
    border-top: 1px solid rgba(155, 216, 255, 0.12);
    background: rgba(0, 7, 12, 0.22);
}

.tool-action {
    min-width: 0;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid rgba(155, 216, 255, 0.18);
    border-radius: 8px;
    padding: 7px 10px;
    background: rgba(255, 255, 255, 0.065);
    color: #eefbf3;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
}

.tool-action:hover {
    border-color: rgba(155, 216, 255, 0.42);
    background: rgba(255, 255, 255, 0.12);
}

.tool-action.primary,
.tool-action.active {
    border-color: rgba(74, 222, 128, 0.58);
    background: rgba(21, 128, 79, 0.82);
}

.tool-action.danger {
    border-color: rgba(255, 143, 143, 0.42);
    background: rgba(120, 41, 53, 0.72);
}

.tool-action:disabled {
    cursor: not-allowed;
    opacity: 0.48;
}

.control-list {
    display: grid;
    gap: 8px;
}

.control-row {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) 64px;
    align-items: center;
    gap: 9px;
    min-height: 34px;
    border: 1px solid rgba(155, 216, 255, 0.11);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.045);
    padding: 7px;
    font-size: 12px;
}

.control-row.control-toggle {
    grid-template-columns: minmax(0, 1fr) auto;
}

.control-label {
    color: rgba(238, 251, 243, 0.82);
    font-weight: 700;
}

.control-range {
    width: 100%;
    accent-color: #3ddc84;
}

.control-number,
.control-select {
    min-width: 0;
    height: 28px;
    border: 1px solid rgba(155, 216, 255, 0.2);
    border-radius: 6px;
    background: rgba(3, 18, 28, 0.88);
    color: #eefbf3;
    padding: 0 7px;
    font-size: 12px;
}

.control-select {
    grid-column: span 2;
}

.toggle-control {
    width: 44px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    border: 0;
    background: transparent;
    cursor: pointer;
}

.toggle-control:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.toggle-track {
    width: 40px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 2px;
    background: rgba(155, 216, 255, 0.22);
    transition: background 0.18s ease;
}

.toggle-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #e9f7ff;
    transition: transform 0.18s ease;
}

.toggle-control.active .toggle-track {
    background: #3ddc84;
}

.toggle-control.active .toggle-thumb {
    transform: translateX(18px);
    background: #072417;
}

.control-value {
    grid-column: 2 / 4;
    color: rgba(190, 232, 255, 0.72);
    font-size: 11px;
}

.compact .panel-header {
    padding: 10px 12px;
}

.compact .panel-page {
    gap: 9px;
    padding: 10px;
}

.compact .module-head {
    min-height: 50px;
}

.compact .module-body {
    gap: 9px;
    padding: 10px;
}

.cesium-tool-shell.is-embedded .panel-title,
.cesium-tool-shell.is-embedded .module-title,
.cesium-tool-shell.is-embedded .overview-tile strong {
    color: var(--text-primary);
}

.cesium-tool-shell.is-embedded .panel-subtitle,
.cesium-tool-shell.is-embedded .module-desc,
.cesium-tool-shell.is-embedded .overview-label,
.cesium-tool-shell.is-embedded .control-value {
    color: var(--text-muted);
}

.cesium-tool-shell.is-embedded .panel-header,
.cesium-tool-shell.is-embedded .panel-tabs,
.cesium-tool-shell.is-embedded .module-body {
    border-color: var(--border-light);
}

.cesium-tool-shell.is-embedded .panel-mark,
.cesium-tool-shell.is-embedded .module-icon,
.cesium-tool-shell.is-embedded .overview-tile,
.cesium-tool-shell.is-embedded .option-card,
.cesium-tool-shell.is-embedded .module-item,
.cesium-tool-shell.is-embedded .control-row {
    background: var(--bg-secondary);
    border-color: var(--border-light);
}

.cesium-tool-shell.is-embedded .tab-btn,
.cesium-tool-shell.is-embedded .option-card,
.cesium-tool-shell.is-embedded .tool-action,
.cesium-tool-shell.is-embedded .control-label,
.cesium-tool-shell.is-embedded .section-head {
    color: var(--text-primary);
}

@media (max-width: 768px) {
    .cesium-tool-shell {
        top: 58px;
        right: 10px;
        left: 10px;
        max-width: none;
    }

    .cesium-tool-panel {
        width: 100%;
        max-height: min(68vh, calc(100vh - 124px));
    }

    .overview-grid {
        grid-template-columns: 1fr;
    }

    .control-row {
        grid-template-columns: 64px minmax(0, 1fr) 58px;
    }
}
</style>
