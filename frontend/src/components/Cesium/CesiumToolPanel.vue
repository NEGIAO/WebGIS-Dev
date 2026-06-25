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
                        :class="{ expanded: isLayerSectionExpanded('basemap') }"
                    >
                        <button
                            class="section-head section-toggle"
                            type="button"
                            :aria-expanded="isLayerSectionExpanded('basemap')"
                            @click="toggleLayerSection('basemap')"
                        >
                            <span class="section-main">
                                <Layers
                                    :size="16"
                                    stroke-width="2"
                                />
                                <span>底图源</span>
                            </span>
                            <span class="section-meta">
                                <span>{{ activeBasemapLabel }}</span>
                                <ChevronDown
                                    class="section-chevron"
                                    :size="15"
                                    stroke-width="2"
                                />
                            </span>
                        </button>
                        <div
                            v-if="isLayerSectionExpanded('basemap')"
                            class="section-body"
                        >
                            <div class="option-grid">
                                <button
                                    v-for="option in basemapOptions"
                                    :key="option.value"
                                    class="option-card"
                                    :class="{ active: option.value === activeBasemap }"
                                    type="button"
                                    :disabled="option.disabled"
                                    :aria-pressed="option.value === activeBasemap"
                                    :title="option.description || option.label"
                                    @click="selectBasemapOption(option)"
                                >
                                    <span>{{ option.label }}</span>
                                    <Check
                                        v-if="option.value === activeBasemap"
                                        :size="15"
                                        stroke-width="2.4"
                                    />
                                </button>
                            </div>

                            <form
                                class="custom-basemap-editor"
                                @submit.prevent="submitCustomBasemap"
                            >
                                <div class="custom-basemap-input-row">
                                    <Link
                                        class="custom-basemap-icon"
                                        :size="15"
                                        stroke-width="2"
                                    />
                                    <input
                                        v-model="customBasemapDraft"
                                        class="custom-basemap-input"
                                        type="text"
                                        inputmode="url"
                                        spellcheck="false"
                                        placeholder="https://example.com/tiles/{z}/{x}/{y}.png"
                                    />
                                    <button
                                        class="custom-basemap-submit"
                                        type="submit"
                                        :disabled="!customBasemapDraft.trim()"
                                        title="加载自定义 XYZ"
                                    >
                                        <Send
                                            :size="14"
                                            stroke-width="2"
                                        />
                                        <span>加载</span>
                                    </button>
                                </div>
                                <div
                                    v-if="customBasemapUrl"
                                    class="custom-basemap-current"
                                >
                                    {{ customBasemapUrl }}
                                </div>
                            </form>
                        </div>
                    </div>

                    <div
                        v-if="terrainOptions.length"
                        class="option-group"
                        :class="{ expanded: isLayerSectionExpanded('terrain') }"
                    >
                        <button
                            class="section-head section-toggle"
                            type="button"
                            :aria-expanded="isLayerSectionExpanded('terrain')"
                            @click="toggleLayerSection('terrain')"
                        >
                            <span class="section-main">
                                <Mountain
                                    :size="16"
                                    stroke-width="2"
                                />
                                <span>地形</span>
                            </span>
                            <span class="section-meta">
                                <span>{{ activeTerrainLabel }}</span>
                                <ChevronDown
                                    class="section-chevron"
                                    :size="15"
                                    stroke-width="2"
                                />
                            </span>
                        </button>
                        <div
                            v-if="isLayerSectionExpanded('terrain')"
                            class="section-body"
                        >
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
                    </div>

                    <div
                        v-if="overlayOptions.length"
                        class="option-group"
                        :class="{ expanded: isLayerSectionExpanded('overlay') }"
                    >
                        <button
                            class="section-head section-toggle"
                            type="button"
                            :aria-expanded="isLayerSectionExpanded('overlay')"
                            @click="toggleLayerSection('overlay')"
                        >
                            <span class="section-main">
                                <Eye
                                    :size="16"
                                    stroke-width="2"
                                />
                                <span>叠加层</span>
                            </span>
                            <span class="section-meta">
                                <span>{{ activeOverlayCount }}/{{ overlayOptions.length }}</span>
                                <ChevronDown
                                    class="section-chevron"
                                    :size="15"
                                    stroke-width="2"
                                />
                            </span>
                        </button>
                        <div
                            v-if="isLayerSectionExpanded('overlay')"
                            class="section-body"
                        >
                            <div class="overlay-list">
                                <button
                                    v-for="overlay in overlayOptions"
                                    :key="overlay.value"
                                    class="overlay-row"
                                    :class="{ active: !!overlay.active }"
                                    type="button"
                                    :disabled="overlay.disabled"
                                    :aria-pressed="!!overlay.active"
                                    :title="overlay.description || overlay.label"
                                    @click="emitOverlayToggle(overlay)"
                                >
                                    <span class="overlay-copy">
                                        <span class="overlay-title">{{ overlay.label }}</span>
                                        <span
                                            v-if="overlay.description"
                                            class="overlay-desc"
                                        >
                                            {{ overlay.description }}
                                        </span>
                                    </span>
                                    <span
                                        class="toggle-control"
                                        :class="{ active: !!overlay.active }"
                                        aria-hidden="true"
                                    >
                                        <span class="toggle-track">
                                            <span class="toggle-thumb"></span>
                                        </span>
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div
                        v-if="!basemapOptions.length && !terrainOptions.length && !overlayOptions.length"
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
                                    :class="module.controlLayout ? `control-list-${module.controlLayout}` : ''"
                                >
                                    <label
                                        v-for="control in module.controls"
                                        :key="control.id"
                                        class="control-row"
                                        :class="[
                                            `control-${control.type}`,
                                            module.controlLayout ? `control-row-${module.controlLayout}` : '',
                                            control.numberInput === false ? 'without-number-input' : '',
                                        ]"
                                    >
                                        <span class="control-label">
                                            <span class="control-label-text">{{ control.label }}</span>
                                            <span
                                                v-if="control.tooltip"
                                                class="control-help"
                                                :aria-label="control.tooltip"
                                                :title="control.tooltip"
                                                @click.prevent.stop
                                            >
                                                ?
                                            </span>
                                        </span>

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
                                                v-if="control.numberInput !== false"
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

                                        <template v-else-if="control.type === 'color'">
                                            <input
                                                class="control-color"
                                                type="color"
                                                :value="control.value"
                                                :disabled="control.disabled"
                                                @input="emitControlChange(module.id, control, $event.target.value)"
                                            />
                                            <span
                                                class="control-color-swatch"
                                                :style="{ backgroundColor: control.value }"
                                            ></span>
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

                <!-- ==================== 数据 tab ==================== -->
                <section
                    v-show="activeTab === 'data'"
                    class="panel-page"
                >
                    <!-- 文件选择区域 -->
                    <!--
                        注意：不要在外层 <div> 上挂 click 事件去转发 click() 到 input，
                        会与 input 自身的 change 事件耦合产生「弹两次文件选择框」的副作用。
                        这里用 <label for="..."> 原生关联即可：label 被点击 = input.click()。
                    -->
                    <label
                        for="cesium-data-file-input"
                        class="data-upload-area"
                        :aria-label="'选择要导入的数据文件'"
                    >
                        <input
                            id="cesium-data-file-input"
                            ref="fileInputRef"
                            class="data-file-input"
                            type="file"
                            multiple
                            :accept="supportedFormats"
                            @change="handleFileSelect"
                        />
                        <div class="data-upload-hint">
                            <Upload
                                :size="28"
                                stroke-width="1.5"
                            />
                            <span>选择文件或拖拽到此处</span>
                            <span class="data-formats-label">
                                支持: GeoJSON, KML/KMZ, SHP, GLB/GLTF, CZML, 3D Tiles
                            </span>
                        </div>
                    </label>

                    <!-- 已加载数据源列表 -->
                    <div
                        v-if="localDataSources.length"
                        class="data-source-list"
                    >
                        <div class="data-source-head">
                            <span class="data-source-count">
                                已加载 {{ localDataSources.length }} 个数据源
                            </span>
                            <button
                                class="tool-action danger"
                                type="button"
                                @click="emitClearAll"
                            >
                                <Trash2 :size="13" stroke-width="2" />
                                全部清除
                            </button>
                        </div>

                        <button
                            v-for="source in localDataSources"
                            :key="source.id"
                            class="data-source-row"
                            type="button"
                            :title="`点击移除 ${source.name} (${formatLabel(source.type)})`"
                            :aria-label="`移除 ${source.name}`"
                            @click="emitRemove(source.id)"
                        >
                            <span class="data-source-icon">
                                <component
                                    :is="getFormatIcon(source.type)"
                                    :size="15"
                                    stroke-width="2"
                                />
                            </span>
                            <span class="data-source-copy">
                                <span class="data-source-name">{{ source.name }}</span>
                                <span class="data-source-type">{{ formatLabel(source.type) }}</span>
                            </span>
                            <X
                                class="data-source-remove-icon"
                                :size="14"
                                stroke-width="2"
                            />
                        </button>
                    </div>

                    <div
                        v-else
                        class="empty-state"
                    >
                        暂无已导入的数据
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
    Cloud,
    Droplets,
    Eye,
    FileJson,
    Globe,
    Home,
    Layers,
    Link,
    Mountain,
    Navigation,
    Play,
    RotateCcw,
    Send,
    Settings,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    Upload,
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
    overlayOptions: {
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
    customBasemapUrl: {
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
    loadedDataSources: {
        type: Array,
        default: () => [],
    },
});

// 兼容两种调用方：直接传 ref / 直接传数组
// - ref：通过 .value 读取并在 watch 中响应变化
// - 数组：原样使用（不具备响应式，列表不会更新；调用方应改为传 ref）
const localDataSources = ref(Array.isArray(props.loadedDataSources) ? props.loadedDataSources : []);

watch(
    () => props.loadedDataSources,
    (next) => {
        const arr = Array.isArray(next) ? next : [];
        // 仅在引用变化时同步，避免无谓重渲染；不再使用 deep watch，避免每次 push 都重建数组
        if (arr !== localDataSources.value) {
            localDataSources.value = arr;
        }
    },
    { immediate: true },
);

const emit = defineEmits([
    'update:open',
    'update:activeBasemap',
    'update:activeTerrain',
    'module-action',
    'control-change',
    'overlay-toggle',
    'custom-basemap-submit',
    'data-import',
    'data-remove',
    'data-clear-all',
]);

const UI_STATE_VERSION = 3;
const storedUiState = readStoredUiState();
const shouldRestoreExpansionState = storedUiState.uiStateVersion === UI_STATE_VERSION;
const activeTab = ref(storedUiState.activeTab || 'scene');
const compactMode = ref(!!storedUiState.compactMode);
const expandedLayerSectionIds = ref(
    new Set(shouldRestoreExpansionState ? storedUiState.expandedLayerSectionIds || [] : []),
);
const expandedModuleIds = ref(
    new Set(shouldRestoreExpansionState ? storedUiState.expandedModuleIds || [] : []),
);
const customBasemapDraft = ref(props.customBasemapUrl || '');

/** 文件上传 input 的模板 ref */
const fileInputRef = ref(null);

/** 支持的数据格式 accept 字符串 */
const supportedFormats =
    '.geojson,.json,.kml,.kmz,.shp,.dbf,.shx,.prj,.cpg,.glb,.gltf,.czml,.zip';

const isPanelOpen = computed(() => props.embedded || props.open);
const sceneModule = computed(() => props.modules.find(module => module.id === 'scene') || null);
const sceneActions = computed(() => sceneModule.value?.actions || []);
const featureModules = computed(() => props.modules.filter(module => module.id !== 'scene'));
const activeModuleCount = computed(() => {
    return featureModules.value.filter(
        module => module.statusTone === 'success' || module.statusTone === 'warning',
    ).length;
});
const activeOverlayCount = computed(() => {
    return props.overlayOptions.filter(overlay => !!overlay.active).length;
});

const panelTabs = [
    { id: 'scene', label: '场景', icon: Navigation },
    { id: 'layers', label: '图层', icon: Layers },
    { id: 'data', label: '数据', icon: Upload },
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

watch([activeTab, compactMode, expandedLayerSectionIds, expandedModuleIds], persistUiState, { deep: true });

watch(
    () => props.customBasemapUrl,
    (url) => {
        if (url !== customBasemapDraft.value) {
            customBasemapDraft.value = url || '';
        }
    },
);

function setPanelOpen(value) {
    emit('update:open', value);
}

function isLayerSectionExpanded(sectionId) {
    return expandedLayerSectionIds.value.has(sectionId);
}

function toggleLayerSection(sectionId) {
    const next = new Set(expandedLayerSectionIds.value);
    if (next.has(sectionId)) {
        next.delete(sectionId);
    } else {
        next.add(sectionId);
    }
    expandedLayerSectionIds.value = next;
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

function selectBasemapOption(option) {
    if (option?.disabled) return;
    emit('update:activeBasemap', option.value);
}

function submitCustomBasemap() {
    emit('custom-basemap-submit', {
        url: customBasemapDraft.value,
    });
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
                uiStateVersion: UI_STATE_VERSION,
                activeTab: activeTab.value,
                compactMode: compactMode.value,
                expandedLayerSectionIds: [...expandedLayerSectionIds.value],
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
        clouds: Cloud,
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

function emitOverlayToggle(overlay) {
    if (overlay.disabled) return;
    emit('overlay-toggle', {
        overlayId: overlay.value,
        value: !overlay.active,
    });
}

// ==========================================
// 数据导入相关函数
// ==========================================

/** 各数据格式对应的图标映射 */
function getFormatIcon(type) {
    const icons = {
        geojson: FileJson,
        json: FileJson,
        kml: Globe,
        kmz: Globe,
        shp: Layers,
        gltf: Box,
        czml: FileJson,
        '3dtiles': Box,
    };
    return icons[type] || FileJson;
}

/** 格式类型 → 人类可读标签 */
function formatLabel(type) {
    const labels = {
        geojson: 'GeoJSON',
        json: 'JSON',
        kml: 'KML',
        kmz: 'KMZ',
        shp: 'Shapefile',
        gltf: 'GLTF/GLB',
        czml: 'CZML',
        '3dtiles': '3D Tiles',
    };
    return labels[type] || type.toUpperCase();
}

/** 文件选择事件处理 */
function handleFileSelect(event) {
    const files = event.target?.files;
    if (!files || files.length === 0) return;

    emit('data-import', { files: Array.from(files) });

    // 重置 input 以支持重复选择同一文件
    if (fileInputRef.value) {
        fileInputRef.value.value = '';
    }
}

/** 移除单个数据源 */
function emitRemove(id) {
    emit('data-remove', { id });
}

/** 清除所有数据源 */
function emitClearAll() {
    emit('data-clear-all');
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
    grid-template-columns: repeat(4, 1fr);
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

.option-group {
    overflow: hidden;
    display: grid;
    border: 1px solid rgba(155, 216, 255, 0.16);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.045);
}

.option-group.expanded {
    border-color: rgba(74, 222, 128, 0.38);
    background: rgba(10, 47, 37, 0.52);
}

.section-head {
    display: flex;
    align-items: center;
    color: rgba(238, 251, 243, 0.92);
    font-size: 12px;
    font-weight: 800;
}

.section-toggle {
    width: 100%;
    min-height: 44px;
    justify-content: space-between;
    gap: 10px;
    border: 0;
    padding: 10px 12px;
    background: transparent;
    cursor: pointer;
    text-align: left;
}

.section-toggle:hover {
    background: rgba(255, 255, 255, 0.07);
}

.section-toggle:focus-visible {
    outline: 2px solid rgba(74, 222, 128, 0.72);
    outline-offset: -2px;
}

.section-main {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.section-meta {
    min-width: 0;
    max-width: 156px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    color: rgba(220, 243, 255, 0.6);
    font-size: 11px;
    font-weight: 700;
}

.section-meta span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.section-chevron {
    flex: 0 0 auto;
    color: rgba(220, 243, 255, 0.72);
    transition: transform 0.18s ease;
}

.option-group.expanded .section-chevron {
    transform: rotate(180deg);
}

.section-body {
    display: grid;
    gap: 8px;
    padding: 0 10px 10px;
    border-top: 1px solid rgba(155, 216, 255, 0.12);
    background: rgba(0, 7, 12, 0.14);
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

.option-card:disabled {
    cursor: not-allowed;
    opacity: 0.46;
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

.custom-basemap-editor {
    display: grid;
    gap: 6px;
    border: 1px solid rgba(155, 216, 255, 0.14);
    border-radius: 8px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.045);
}

.custom-basemap-input-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
}

.custom-basemap-icon {
    color: rgba(190, 232, 255, 0.78);
}

.custom-basemap-input {
    min-width: 0;
    height: 32px;
    border: 1px solid rgba(155, 216, 255, 0.2);
    border-radius: 7px;
    background: rgba(3, 18, 28, 0.88);
    color: #eefbf3;
    padding: 0 9px;
    font-size: 12px;
}

.custom-basemap-input:focus {
    border-color: rgba(74, 222, 128, 0.58);
    outline: none;
}

.custom-basemap-input::placeholder {
    color: rgba(220, 243, 255, 0.38);
}

.custom-basemap-submit {
    min-width: 64px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid rgba(74, 222, 128, 0.42);
    border-radius: 7px;
    background: rgba(21, 128, 79, 0.76);
    color: #f5fff9;
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
}

.custom-basemap-submit:disabled {
    cursor: not-allowed;
    opacity: 0.48;
}

.custom-basemap-current {
    overflow: hidden;
    color: rgba(220, 243, 255, 0.58);
    font-size: 11px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.overlay-list {
    display: grid;
    gap: 8px;
}

.overlay-row {
    width: 100%;
    min-width: 0;
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid rgba(155, 216, 255, 0.16);
    border-radius: 8px;
    padding: 9px 10px;
    background: rgba(255, 255, 255, 0.055);
    color: rgba(239, 250, 255, 0.86);
    cursor: pointer;
    text-align: left;
}

.overlay-row:hover {
    border-color: rgba(155, 216, 255, 0.38);
    background: rgba(255, 255, 255, 0.1);
}

.overlay-row.active {
    border-color: rgba(74, 222, 128, 0.44);
    background: rgba(18, 95, 68, 0.56);
}

.overlay-row:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.overlay-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
}

.overlay-title {
    overflow: hidden;
    color: #f6fffb;
    font-size: 12px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.overlay-desc {
    overflow: hidden;
    color: rgba(220, 243, 255, 0.58);
    font-size: 11px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    grid-template-columns: 72px minmax(0, 1fr) 76px;
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

.control-list-clouds {
    gap: 7px;
}

.control-row.control-row-clouds {
    width: 100%;
    box-sizing: border-box;
    grid-template-columns: 48px minmax(0, 1fr) 58px;
    gap: 8px;
    border-color: rgba(155, 216, 255, 0.14);
    background: rgba(7, 27, 36, 0.54);
}

.control-row-clouds.control-toggle {
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 38px;
    border-color: rgba(74, 222, 128, 0.2);
    background: rgba(17, 86, 66, 0.2);
}

.control-row-clouds.control-select {
    grid-template-columns: 48px minmax(0, 1fr);
}

.control-row-clouds.without-number-input {
    grid-template-columns: 48px minmax(0, 1fr) 58px;
}

.control-label {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: rgba(238, 251, 243, 0.82);
    font-weight: 700;
}

.control-label-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.control-help {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(155, 216, 255, 0.32);
    border-radius: 50%;
    background: rgba(155, 216, 255, 0.12);
    color: rgba(225, 244, 255, 0.86);
    cursor: help;
    font-size: 11px;
    line-height: 1;
}

.control-help:hover,
.control-help:focus-visible {
    border-color: rgba(74, 222, 128, 0.56);
    background: rgba(74, 222, 128, 0.18);
    color: #f6fffb;
    outline: none;
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

.control-row.control-select {
    grid-column: auto;
}

.control-row-clouds .control-select {
    grid-column: auto;
    width: 100%;
}

.control-row.control-color {
    grid-template-columns: 72px minmax(0, 1fr) 34px;
}

.control-color {
    width: 100%;
    height: 28px;
    min-width: 0;
    border: 1px solid rgba(155, 216, 255, 0.2);
    border-radius: 6px;
    background: rgba(3, 18, 28, 0.88);
    padding: 2px;
    cursor: pointer;
}

.control-color:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.control-color-swatch {
    width: 28px;
    height: 28px;
    border: 1px solid rgba(238, 251, 243, 0.46);
    border-radius: 6px;
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

.control-row-clouds .control-value {
    grid-column: auto;
    justify-self: end;
    min-width: 48px;
    border: 1px solid rgba(155, 216, 255, 0.13);
    border-radius: 999px;
    padding: 3px 7px;
    background: rgba(3, 18, 28, 0.62);
    color: rgba(225, 244, 255, 0.82);
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
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
.cesium-tool-shell.is-embedded .overlay-desc,
.cesium-tool-shell.is-embedded .custom-basemap-current,
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
.cesium-tool-shell.is-embedded .custom-basemap-editor,
.cesium-tool-shell.is-embedded .overlay-row,
.cesium-tool-shell.is-embedded .module-item,
.cesium-tool-shell.is-embedded .control-row {
    background: var(--bg-secondary);
    border-color: var(--border-light);
}

.cesium-tool-shell.is-embedded .custom-basemap-input {
    border-color: var(--border-light);
    background: #ffffff;
    color: var(--text-primary);
}

.cesium-tool-shell.is-embedded .custom-basemap-icon {
    color: var(--text-muted);
}

.cesium-tool-shell.is-embedded .tab-btn,
.cesium-tool-shell.is-embedded .option-card,
.cesium-tool-shell.is-embedded .overlay-row,
.cesium-tool-shell.is-embedded .overlay-title,
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
        grid-template-columns: 64px minmax(0, 1fr) 70px;
    }

    .control-row.control-row-clouds,
    .control-row-clouds.without-number-input {
        grid-template-columns: 44px minmax(0, 1fr) 54px;
    }

    .control-row.control-color {
        grid-template-columns: 64px minmax(0, 1fr) 34px;
    }
}

/* ==================== 数据导入 tab 样式 ==================== */

.data-upload-area {
    position: relative;
    border: 1px dashed rgba(155, 216, 255, 0.3);
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.18s ease;
}

.data-upload-area:hover {
    border-color: rgba(74, 222, 128, 0.48);
}

.data-file-input {
    position: absolute;
    inset: 0;
    z-index: 2;
    opacity: 0;
    cursor: pointer;
    font-size: 0;
}

.data-upload-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 28px 16px;
    color: rgba(220, 243, 255, 0.58);
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    pointer-events: none;
}

.data-upload-hint svg {
    color: rgba(155, 216, 255, 0.48);
}

.data-formats-label {
    font-size: 11px;
    font-weight: 500;
    color: rgba(220, 243, 255, 0.38);
}

.data-source-list {
    display: grid;
    gap: 8px;
}

.data-source-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.data-source-count {
    color: rgba(220, 243, 255, 0.58);
    font-size: 12px;
    font-weight: 700;
}

.data-source-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    border: 1px solid rgba(155, 216, 255, 0.16);
    border-radius: 8px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.055);
    color: rgba(239, 250, 255, 0.86);
    cursor: pointer;
    text-align: left;
    transition: all 0.18s ease;
}

.data-source-row:hover {
    border-color: rgba(255, 143, 143, 0.42);
    background: rgba(120, 41, 53, 0.32);
}

.data-source-icon {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(15, 40, 54, 0.72);
    border: 1px solid rgba(155, 216, 255, 0.2);
    color: #b9e8ff;
}

.data-source-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: grid;
    gap: 2px;
}

.data-source-name {
    overflow: hidden;
    color: #f6fffb;
    font-size: 12px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.data-source-type {
    color: rgba(220, 243, 255, 0.5);
    font-size: 11px;
}

.data-source-remove-icon {
    flex: 0 0 auto;
    color: rgba(255, 143, 143, 0.48);
    transition: color 0.18s ease;
}

.data-source-row:hover .data-source-remove-icon {
    color: #ff8f8f;
}
</style>
