<template>
    <div class="draw-panel">
        <div class="panel-header">
            <span class="panel-title">绘制工具</span>
            <button
                class="close-btn"
                title="关闭"
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
                <div class="section-title">样式设置</div>

                <div class="style-row">
                    <label>边线颜色</label>
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
                    <label>边线宽度</label>
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
                    <label>边线透明</label>
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
                    <label>边线类型</label>
                    <div class="dash-toggle-group">
                        <button
                            class="dash-toggle-btn"
                            :class="{ active: styleForm.strokeDashType === 'solid' }"
                            @click="styleForm.strokeDashType = 'solid'; emitStyleChange()"
                        >
                            实线
                        </button>
                        <button
                            class="dash-toggle-btn"
                            :class="{ active: styleForm.strokeDashType === 'dashed' }"
                            @click="styleForm.strokeDashType = 'dashed'; emitStyleChange()"
                        >
                            虚线
                        </button>
                    </div>
                </div>

                <template v-if="showFill">
                    <div class="style-row">
                        <label>填充颜色</label>
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
                        <label>填充透明</label>
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
                        <label>箭头比例</label>
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
                        <label>箭头头宽</label>
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
                        <label>渐变起点</label>
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
                        <label>渐变终点</label>
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
                    <span>删除选中</span>
                </button>
                <button class="action-btn secondary-btn" @click="handleUndoLast">
                    <Undo2 :size="14" />
                    <span>撤销最近</span>
                </button>
                <button class="action-btn clear-btn" @click="handleClear">
                    <Eraser :size="14" />
                    <span>清除所有</span>
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
} from 'lucide-vue-next';
import {
    DRAWING_PRESET_COLORS,
    DEFAULT_DRAWING_STYLE_PARAMS,
    getDrawingHint,
    hasFill,
    hasRadius,
    hasStrokeDash,
    isArrowTool,
    isBattleArrowTool,
    normalizeDrawingStyleParams,
} from '../../composables/map/features/drawingToolRegistry';

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

const toolGroups = [
    {
        id: 'basic',
        label: '基础',
        tools: [
            { type: 'Point', label: '点', hint: '单击地图放置点标记', icon: ICON_MAP.Point },
            { type: 'LineString', label: '线', hint: '单击绘制折线，双击结束', icon: ICON_MAP.LineString },
            { type: 'Polygon', label: '面', hint: '单击绘制多边形，双击结束', icon: ICON_MAP.Polygon },
        ],
    },
    {
        id: 'shape',
        label: '形状',
        tools: [
            { type: 'Rectangle', label: '矩形', hint: '拖拽绘制矩形', icon: ICON_MAP.Rectangle },
            { type: 'Ellipse', label: '椭圆', hint: '拖拽绘制椭圆', icon: ICON_MAP.Ellipse },
            { type: 'CircleOutline', label: '圆', hint: '拖拽绘制圆轮廓', icon: ICON_MAP.CircleOutline },
        ],
    },
    {
        id: 'arrow',
        label: '箭头',
        tools: [
            { type: 'Arrow', label: '箭头', hint: '绘制折线末端箭头', icon: ICON_MAP.Arrow },
            { type: 'WindArrow', label: '风向', hint: '绘制平滑风向箭头', icon: ICON_MAP.WindArrow },
            { type: 'BattleArrow', label: '军标', hint: '绘制军标攻击箭头', icon: ICON_MAP.BattleArrow },
        ],
    },
    {
        id: 'edit',
        label: '编辑',
        tools: [
            {
                type: 'SelectEdit',
                label: '选择编辑',
                hint: '选择绘制图层要素后可拖动顶点修改',
                icon: ICON_MAP.SelectEdit,
            },
        ],
    },
];

const currentStyleType = computed(() => activeType.value || 'Polygon');
const showFill = computed(() => hasFill(currentStyleType.value));
const showRadius = computed(() => hasRadius(currentStyleType.value));
const showStrokeDash = computed(() => hasStrokeDash(currentStyleType.value));
const showArrow = computed(() => isArrowTool(currentStyleType.value));
const showBattleGradient = computed(() => isBattleArrowTool(currentStyleType.value));
const radiusLabel = computed(() =>
    currentStyleType.value === 'CircleOutline' ? '圆半径' : '点大小',
);
const hint = computed(() => getDrawingHint(activeType.value));

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
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(229, 236, 230, 0.6);
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
    color: #6b8c6b;
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
    border: 2px solid #e8f0e8;
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
    color: #5f7a5f;
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
    border: 1px solid #d7e4d7;
    border-radius: 4px;
    padding: 0;
    background: transparent;
    cursor: pointer;
}

.color-value,
.range-value {
    font-size: 11px;
    color: #6b8c6b;
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
    border: 1px solid #d7e4d7;
    background: #fff;
    color: #6b8c6b;
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
    background: #f4faf4;
    border: 1px solid #d7e8d7;
    color: #3f6b3f;
}

.secondary-btn:hover:not(:disabled) {
    background: #eaf6ea;
    border-color: #c5dec5;
}

.secondary-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.clear-btn {
    background: #fff0f0;
    border: 1px solid #ffd0d0;
    color: #d44;
}

.clear-btn:hover {
    background: #ffe0e0;
    border-color: #ffb0b0;
}

.panel-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #f6faf6;
    color: #6b8c6b;
    font-size: 11px;
    border-top: 1px solid #e8f0e8;
    flex-shrink: 0;
}
</style>
