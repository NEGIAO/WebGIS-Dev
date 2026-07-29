<template>
    <div class="draw-panel">
        <div class="panel-header">
            <span class="panel-title">{{ t('draw.title') }}</span>
            <button
                class="close-btn"
                :title="t('common.close')"
                @click="$emit('close')"
            >
                <X :size="14" />
            </button>
        </div>

        <div class="panel-body">
            <section
                v-for="group in toolGroups"
                :key="group.id"
                class="tool-section"
            >
                <div class="section-title">{{ group.label }}</div>
                <div class="tool-grid" :class="{ 'tool-grid-dense': group.tools.length > 3 }">
                    <button
                        v-for="tool in group.tools"
                        :key="tool.type"
                        class="tool-btn"
                        :class="{ active: activeType === tool.type }"
                        :title="tool.hint"
                        @click="selectTool(tool.type)"
                    >
                        <component :is="tool.icon" :size="16" />
                        <span class="tool-label">{{ tool.label }}</span>
                    </button>
                </div>
            </section>

            <section class="style-section">
                <div class="section-title">{{ t('draw.styleSettings') }}</div>

                <div class="style-row">
                    <label>{{ t('draw.strokeColor') }}</label>
                    <div class="style-control">
                        <input
                            v-model="styleForm.strokeColor"
                            type="color"
                            class="color-input"
                            @input="emitStyleChange"
                        />
                        <span class="color-value">{{ styleForm.strokeColor }}</span>
                    </div>
                </div>

                <div class="preset-row">
                    <button
                        v-for="color in presetColors"
                        :key="`stroke-${color}`"
                        class="preset-swatch"
                        :class="{ active: styleForm.strokeColor.toUpperCase() === color.toUpperCase() }"
                        :style="{ background: color }"
                        :title="color"
                        @click="selectPreset(color, 'stroke')"
                    />
                </div>

                <div class="style-row">
                    <label>{{ t('draw.strokeWidth') }}</label>
                    <div class="style-control">
                        <input
                            v-model.number="styleForm.strokeWidth"
                            type="range"
                            min="1"
                            max="10"
                            step="0.5"
                            class="range-input"
                            @input="emitStyleChange"
                        />
                        <span class="range-value">{{ styleForm.strokeWidth }}px</span>
                    </div>
                </div>

                <div class="style-row">
                    <label>{{ t('draw.strokeOpacity') }}</label>
                    <div class="style-control">
                        <input
                            v-model.number="styleForm.strokeOpacity"
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            class="range-input"
                            @input="emitStyleChange"
                        />
                        <span class="range-value">{{ Math.round(styleForm.strokeOpacity * 100) }}%</span>
                    </div>
                </div>

                <div v-if="showStrokeDash" class="style-row">
                    <label>{{ t('draw.strokeType') }}</label>
                    <div class="dash-toggle-group">
                        <button
                            class="dash-toggle-btn"
                            :class="{ active: styleForm.strokeDashType === 'solid' }"
                            @click="styleForm.strokeDashType = 'solid'; emitStyleChange()"
                        >
                            {{ t('draw.solidLine') }}
                        </button>
                        <button
                            class="dash-toggle-btn"
                            :class="{ active: styleForm.strokeDashType === 'dashed' }"
                            @click="styleForm.strokeDashType = 'dashed'; emitStyleChange()"
                        >
                            {{ t('draw.dashedLine') }}
                        </button>
                    </div>
                </div>

                <template v-if="showFill">
                    <div class="style-row">
                        <label>{{ t('draw.fillColor') }}</label>
                        <div class="style-control">
                            <input
                                v-model="styleForm.fillColor"
                                type="color"
                                class="color-input"
                                @input="emitStyleChange"
                            />
                            <span class="color-value">{{ styleForm.fillColor }}</span>
                        </div>
                    </div>
                    <div class="style-row">
                        <label>{{ t('draw.fillOpacity') }}</label>
                        <div class="style-control">
                            <input
                                v-model.number="styleForm.fillOpacity"
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                class="range-input"
                                @input="emitStyleChange"
                            />
                            <span class="range-value">{{ Math.round(styleForm.fillOpacity * 100) }}%</span>
                        </div>
                    </div>
                </template>

                <div v-if="showRadius" class="style-row">
                    <label>{{ radiusLabel }}</label>
                    <div class="style-control">
                        <input
                            v-model.number="styleForm.radius"
                            type="range"
                            min="2"
                            max="40"
                            step="1"
                            class="range-input"
                            @input="emitStyleChange"
                        />
                        <span class="range-value">{{ styleForm.radius }}</span>
                    </div>
                </div>

                <template v-if="showArrow">
                    <div class="style-row">
                        <label>{{ t('draw.arrowRatio') }}</label>
                        <div class="style-control">
                            <input
                                v-model.number="styleForm.arrowScale"
                                type="range"
                                min="0.5"
                                max="3"
                                step="0.1"
                                class="range-input"
                                @input="emitStyleChange"
                            />
                            <span class="range-value">{{ styleForm.arrowScale.toFixed(1) }}</span>
                        </div>
                    </div>
                    <div class="style-row">
                        <label>{{ t('draw.arrowHeadWidth') }}</label>
                        <div class="style-control">
                            <input
                                v-model.number="styleForm.arrowHeadWidth"
                                type="range"
                                min="2"
                                max="16"
                                step="1"
                                class="range-input"
                                @input="emitStyleChange"
                            />
                            <span class="range-value">{{ styleForm.arrowHeadWidth }}</span>
                        </div>
                    </div>
                </template>

                <template v-if="showBattleGradient">
                    <div class="style-row">
                        <label>{{ t('draw.gradientStart') }}</label>
                        <div class="style-control">
                            <input
                                v-model="styleForm.gradientStartColor"
                                type="color"
                                class="color-input"
                                @input="emitStyleChange"
                            />
                        </div>
                    </div>
                    <div class="style-row">
                        <label>{{ t('draw.gradientEnd') }}</label>
                        <div class="style-control">
                            <input
                                v-model="styleForm.gradientEndColor"
                                type="color"
                                class="color-input"
                                @input="emitStyleChange"
                            />
                        </div>
                    </div>
                </template>
            </section>

            <div class="panel-actions">
                <button
                    class="action-btn secondary-btn"
                    :disabled="activeType !== 'SelectEdit'"
                    @click="handleDeleteSelected"
                >
                    <Trash2 :size="14" />
                    <span>{{ t('draw.deleteSelected') }}</span>
                </button>
                <button class="action-btn secondary-btn" @click="handleUndoLast">
                    <Undo2 :size="14" />
                    <span>{{ t('draw.undoLast') }}</span>
                </button>
                <button
                    class="action-btn clear-btn"
                    :title="t('draw.clearAllTitle')"
                    @click="handleClear"
                >
                    <Eraser :size="14" />
                    <span>{{ t('draw.clearAll') }}</span>
                </button>
            </div>
        </div>

        <div class="panel-hint">
            <Info :size="12" />
            <span>{{ hint }}</span>
        </div>
    </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import {
    X,
    Info,
    Trash2,
    Undo2,
    Eraser,
    CircleDot,
    PenLine,
    Pentagon,
    Square,
    Circle,
    Move,
    MousePointer2,
    ArrowUpRight,
    Wind,
    Crosshair,
} from '@lucide/vue';
import {
    DRAWING_PRESET_COLORS,
    DEFAULT_DRAWING_STYLE_PARAMS,
    hasFill,
    hasRadius,
    hasStrokeDash,
    isArrowTool,
    isBattleArrowTool,
    normalizeDrawingStyleParams,
} from '@ol/drawing/registry/drawingToolRegistry';
import { useLocale } from '@common/app/useLocale';

const { t } = useLocale();
const emit = defineEmits(['draw-type', 'edit-action', 'style-change', 'clear', 'close']);

const activeType = ref('');
const presetColors = DRAWING_PRESET_COLORS;
const styleForm = reactive(normalizeDrawingStyleParams({ ...DEFAULT_DRAWING_STYLE_PARAMS }));

const ICON_MAP = {
    Point: CircleDot,
    LineString: PenLine,
    Polygon: Pentagon,
    Rectangle: Square,
    Ellipse: Move,
    CircleOutline: Circle,
    Arrow: ArrowUpRight,
    WindArrow: Wind,
    BattleArrow: Crosshair,
    SelectEdit: MousePointer2,
};

/** 工具分组与标签/提示随语言切换 */
const toolGroups = computed(() => [
    {
        id: 'basic',
        label: t('draw.groups.basic'),
        tools: [
            { type: 'Point', label: t('draw.tools.Point'), hint: t('draw.hints.Point'), icon: ICON_MAP.Point },
            { type: 'LineString', label: t('draw.tools.LineString'), hint: t('draw.hints.LineString'), icon: ICON_MAP.LineString },
            { type: 'Polygon', label: t('draw.tools.Polygon'), hint: t('draw.hints.Polygon'), icon: ICON_MAP.Polygon },
        ],
    },
    {
        id: 'shape',
        label: t('draw.groups.shapes'),
        tools: [
            { type: 'Rectangle', label: t('draw.tools.Rectangle'), hint: t('draw.hints.Rectangle'), icon: ICON_MAP.Rectangle },
            { type: 'Ellipse', label: t('draw.tools.Ellipse'), hint: t('draw.hints.Ellipse'), icon: ICON_MAP.Ellipse },
            { type: 'CircleOutline', label: t('draw.tools.CircleOutline'), hint: t('draw.hints.CircleOutline'), icon: ICON_MAP.CircleOutline },
        ],
    },
    {
        id: 'arrow',
        label: t('draw.groups.arrows'),
        tools: [
            { type: 'Arrow', label: t('draw.tools.Arrow'), hint: t('draw.hints.Arrow'), icon: ICON_MAP.Arrow },
            { type: 'WindArrow', label: t('draw.tools.WindArrow'), hint: t('draw.hints.WindArrow'), icon: ICON_MAP.WindArrow },
            { type: 'BattleArrow', label: t('draw.tools.BattleArrow'), hint: t('draw.hints.BattleArrow'), icon: ICON_MAP.BattleArrow },
        ],
    },
    {
        id: 'edit',
        label: t('draw.groups.edit'),
        tools: [
            {
                type: 'SelectEdit',
                label: t('draw.tools.SelectEdit'),
                hint: t('draw.hints.SelectEdit'),
                icon: ICON_MAP.SelectEdit,
            },
        ],
    },
]);

const currentStyleType = computed(() => activeType.value || 'Polygon');
const showFill = computed(() => hasFill(currentStyleType.value));
const showRadius = computed(() => hasRadius(currentStyleType.value));
const showStrokeDash = computed(() => hasStrokeDash(currentStyleType.value));
const showArrow = computed(() => isArrowTool(currentStyleType.value));
const showBattleGradient = computed(() => isBattleArrowTool(currentStyleType.value));
const radiusLabel = computed(() =>
    currentStyleType.value === 'CircleOutline' ? t('draw.circleRadius') : t('draw.pointSize'),
);
const hint = computed(() => {
    const type = activeType.value;
    if (type && t(`draw.hints.${type}`) !== `draw.hints.${type}`) {
        return t(`draw.hints.${type}`);
    }
    return t('draw.hints.default');
});

/**
 * 选择绘制/编辑工具
 * @param {string} type
 */
function selectTool(type) {
    activeType.value = type;
    emit('draw-type', type);
}

/**
 * 向父组件同步样式参数
 */
function emitStyleChange() {
    emit('style-change', normalizeDrawingStyleParams({ ...styleForm }));
}

/**
 * 选择预设颜色
 * @param {string} color
 * @param {'stroke'|'fill'} target
 */
function selectPreset(color, target) {
    if (target === 'stroke') styleForm.strokeColor = color;
    if (target === 'fill') styleForm.fillColor = color;
    emitStyleChange();
}

/**
 * 删除选中要素
 */
function handleDeleteSelected() {
    emit('edit-action', 'delete-selected');
}

/**
 * 撤销最近绘制图层
 */
function handleUndoLast() {
    emit('edit-action', 'undo-last');
}

/**
 * 清除全部绘制
 */
function handleClear() {
    activeType.value = '';
    emit('clear');
}
</script>

<style scoped>
.draw-panel {
    width: 248px;
    max-height: min(78vh, 720px);
    background: var(--panel-bg);
    backdrop-filter: blur(12px);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.12);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(-8px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--brand-gradient-header);
    color: white;
    flex-shrink: 0;
}

.panel-title {
    font-size: 13px;
    font-weight: 600;
}

.close-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.4);
}

.panel-body {
    overflow-y: auto;
    padding-bottom: 4px;
}

.tool-section,
.style-section {
    padding: 10px 12px 4px;
}

.section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-brand);
    margin-bottom: 8px;
}

.tool-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.tool-grid-dense {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.tool-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
    border: 2px solid var(--bg-brand-light);
    border-radius: 8px;
    background: white;
    color: var(--brand-accent-muted);
    cursor: pointer;
    transition: all 0.2s;
}

.tool-btn:hover {
    border-color: var(--brand-accent);
    background: var(--bg-hover);
}

.tool-btn.active {
    border-color: var(--brand-accent);
    background: linear-gradient(135deg, rgba(var(--brand-accent-rgb), 0.1) 0%, var(--bg-active) 100%);
    color: var(--brand-accent-dark);
    box-shadow: 0 2px 8px rgba(var(--brand-accent-rgb), 0.25);
}

.tool-label {
    font-size: 11px;
    font-weight: 500;
}

.style-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}

.style-row label {
    font-size: 11px;
    color: var(--text-brand);
    min-width: 56px;
}

.style-control {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    justify-content: flex-end;
}

.color-input {
    width: 28px;
    height: 22px;
    border: 1px solid var(--border-brand-light);
    border-radius: 4px;
    padding: 0;
    background: transparent;
    cursor: pointer;
}

.color-value,
.range-value {
    font-size: 11px;
    color: var(--text-brand);
    min-width: 42px;
    text-align: right;
}

.range-input {
    width: 90px;
    accent-color: var(--brand-accent);
}

.preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 10px;
}

.preset-swatch {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.12);
    cursor: pointer;
    padding: 0;
}

.preset-swatch.active {
    outline: 2px solid var(--brand-accent);
    outline-offset: 1px;
}

.dash-toggle-group {
    display: flex;
    gap: 6px;
}

.dash-toggle-btn {
    border: 1px solid var(--border-brand-light);
    background: #fff;
    color: var(--text-brand);
    border-radius: 6px;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
}

.dash-toggle-btn.active {
    border-color: var(--brand-accent);
    color: var(--brand-accent-dark);
    background: rgba(var(--brand-accent-rgb), 0.1);
}

.panel-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px 10px;
}

.action-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.secondary-btn {
    background: rgba(var(--brand-primary-rgb), 0.05);
    border: 1px solid var(--border-brand-light);
    color: var(--text-brand);
}

.secondary-btn:hover:not(:disabled) {
    background: rgba(var(--brand-primary-rgb), 0.1);
    border-color: var(--border-brand-light);
}

.secondary-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.clear-btn {
    background: rgba(var(--danger-rgb), 0.06);
    border: 1px solid var(--danger-light);
    color: var(--danger);
}

.clear-btn:hover {
    background: rgba(var(--danger-rgb), 0.12);
    border-color: rgba(var(--danger-rgb), 0.35);
}

.panel-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(var(--brand-primary-rgb), 0.04);
    color: var(--text-brand);
    font-size: 11px;
    border-top: 1px solid var(--bg-brand-light);
    flex-shrink: 0;
}

/* 移动端适配：面板宽度自适应小屏视口 */
@media (max-width: 768px) {
    .draw-panel {
        width: min(248px, calc(100vw - 24px));
        max-height: min(70vh, 560px);
    }
}
</style>
