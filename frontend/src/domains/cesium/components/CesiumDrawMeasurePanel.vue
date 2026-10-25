<template>
    <div class="cesium-dm-panel">
        <div class="panel-header">
            <span class="panel-title">{{ title }}</span>
            <button class="close-btn" :title="t('common.close')" @click="$emit('close')">
                <X :size="14" />
            </button>
        </div>

        <div class="panel-body">
            <!-- 工具 -->
            <section class="tool-section">
                <div class="section-title">{{ groupLabel }}</div>
                <div class="tool-grid">
                    <button
                        v-for="tool in tools"
                        :key="tool.type"
                        class="tool-btn"
                        :class="{ active: activeType === tool.type }"
                        :title="t(`cesium.drawMeasure.hints.${tool.type}`)"
                        @click="selectTool(tool.type)"
                    >
                        <component :is="tool.icon" :size="16" />
                        <span class="tool-label">{{ t(`cesium.drawMeasure.tools.${tool.type}`) }}</span>
                    </button>
                </div>
            </section>

            <!-- 测量项 -->
            <section class="option-section">
                <div class="section-title">{{ t('cesium.drawMeasure.options.title') }}</div>
                <label class="check-row">
                    <input
                        type="checkbox"
                        :checked="measureOptions.measure"
                        @change="toggleOption('measure', $event)"
                    />
                    <span>{{ t('cesium.drawMeasure.options.measure') }}</span>
                </label>
                <label class="check-row" :class="{ disabled: subOptionsDisabled }">
                    <input
                        type="checkbox"
                        :disabled="subOptionsDisabled"
                        :checked="measureOptions.showArea"
                        @change="toggleOption('showArea', $event)"
                    />
                    <span>{{ t('cesium.drawMeasure.options.area') }}</span>
                </label>
                <label class="check-row" :class="{ disabled: subOptionsDisabled }">
                    <input
                        type="checkbox"
                        :disabled="subOptionsDisabled"
                        :checked="measureOptions.showPerimeter"
                        @change="toggleOption('showPerimeter', $event)"
                    />
                    <span>{{ t('cesium.drawMeasure.options.perimeter') }}</span>
                </label>
            </section>

            <!-- 结果读数 -->
            <section v-if="lastResult" class="result-section">
                <div class="section-title">
                    {{ t('cesium.drawMeasure.result.title') }}
                    <span class="type-chip">{{ t(`cesium.drawMeasure.tools.${lastResult.type}`) }}</span>
                </div>
                <div v-if="!rows.length" class="empty-tip">
                    {{ t('cesium.drawMeasure.result.drawOnly') }}
                </div>
                <div v-for="row in rows" :key="row.label" class="result-row">
                    <span class="result-label">{{ row.label }}</span>
                    <span class="result-value" :class="{ accent: row.accent }">{{ row.value }}</span>
                </div>
                <div class="result-actions">
                    <button class="mini-btn" @click="copyCoords">
                        <Copy :size="12" />
                        <span>{{ t('cesium.drawMeasure.actions.copy') }}</span>
                    </button>
                    <button class="mini-btn" @click="exportGeoJson">
                        <Download :size="12" />
                        <span>{{ t('cesium.drawMeasure.actions.export') }}</span>
                    </button>
                </div>
            </section>

            <!-- 测量记录 -->
            <section v-if="records.length" class="record-section">
                <div class="section-title">
                    {{ t('cesium.drawMeasure.records.title') }}（{{ records.length }}）
                </div>
                <div v-for="record in records" :key="record.id" class="record-item">
                    <b>{{ record.name }}</b> — {{ record.summary }}
                </div>
                <button class="link-btn" @click="clearRecords">
                    {{ t('cesium.drawMeasure.records.clear') }}
                </button>
            </section>

            <!-- 样式（仅绘制面板） -->
            <section v-if="variant === 'draw'" class="style-section">
                <div class="section-title">{{ t('cesium.drawMeasure.style.title') }}</div>

                <div class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.outlineColor') }}</label>
                    <input
                        type="color"
                        class="color-input"
                        :value="style.outlineColor"
                        @input="patchStyle({ outlineColor: $event.target.value })"
                    />
                </div>
                <div class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.outlineWidth') }}</label>
                    <input
                        type="range"
                        class="range-input"
                        min="1"
                        max="10"
                        step="0.5"
                        :value="style.outlineWidth"
                        @input="patchStyle({ outlineWidth: Number($event.target.value) })"
                    />
                    <span class="range-value">{{ style.outlineWidth }}px</span>
                </div>
                <div class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.fillColor') }}</label>
                    <input
                        type="color"
                        class="color-input"
                        :value="style.fillColor"
                        @input="patchStyle({ fillColor: $event.target.value })"
                    />
                </div>
                <div class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.fillOpacity') }}</label>
                    <input
                        type="range"
                        class="range-input"
                        min="0"
                        max="1"
                        step="0.05"
                        :value="style.fillOpacity"
                        @input="patchStyle({ fillOpacity: Number($event.target.value) })"
                    />
                    <span class="range-value">{{ Math.round(style.fillOpacity * 100) }}%</span>
                </div>
                <label class="check-row">
                    <input
                        type="checkbox"
                        :checked="style.showVertices"
                        @change="patchStyle({ showVertices: $event.target.checked })"
                    />
                    <span>{{ t('cesium.drawMeasure.style.showVertices') }}</span>
                </label>
                <div v-if="style.showVertices" class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.vertexSize') }}</label>
                    <input
                        type="range"
                        class="range-input"
                        min="3"
                        max="20"
                        step="1"
                        :value="style.vertexSize"
                        @input="patchStyle({ vertexSize: Number($event.target.value) })"
                    />
                    <span class="range-value">{{ style.vertexSize }}</span>
                </div>
            </section>

            <!-- 动作 -->
            <div class="panel-actions">
                <template v-if="drawing">
                    <button class="action-btn" @click="$emit('action', 'finish')">
                        <Play :size="13" />
                        <span>{{ t('cesium.drawMeasure.actions.finish') }}</span>
                    </button>
                    <button class="action-btn" @click="$emit('action', 'cancel')">
                        <Ban :size="13" />
                        <span>{{ t('cesium.drawMeasure.actions.cancel') }}</span>
                    </button>
                </template>
                <button class="action-btn" @click="$emit('action', 'undo')">
                    <Undo2 :size="13" />
                    <span>{{ t('cesium.drawMeasure.actions.undo') }}</span>
                </button>
                <button class="action-btn" @click="$emit('action', 'flyTo')">
                    <Maximize :size="13" />
                    <span>{{ t('cesium.drawMeasure.actions.flyTo') }}</span>
                </button>
                <button class="action-btn clear-btn" @click="$emit('action', 'clear')">
                    <Eraser :size="13" />
                    <span>{{ t('cesium.drawMeasure.actions.clear') }}</span>
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
/**
 * CesiumDrawMeasurePanel.vue — 3D 绘制 / 测量面板（引擎感知：2D 用 OL 的 DrawPanel/MeasurePanel）
 *
 * 单一职责：渲染 + 收集用户意图。所有场景动作通过 emit 上抛，
 * 由 HomeView 统一按引擎路由到 CesiumContainer（迁移方案 §2.1 引擎裁决单点）。
 * 测量开关与样式直接写 store（纯数据，无引擎依赖），由容器 watch 后下推管理器。
 *
 * variant：
 *   draw    绘制工具（点/线/面/矩形/圆）+ 样式
 *   measure 测量工具（测距/测面/测高距/方位角）
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import {
    Ban,
    Circle,
    CircleDot,
    Compass,
    Copy,
    Download,
    Eraser,
    Info,
    Maximize,
    PenLine,
    Pentagon,
    Play,
    Ruler,
    Square,
    SquareDashedBottom,
    TriangleRight,
    Undo2,
    X,
} from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import { formatAreaMeasure, formatDistanceMeasure } from '@common/map-view/units';
import { useDrawMeasureStore } from '@cesium-domain/stores/useDrawMeasureStore';
import { copyTextToClipboard, downloadTextFile } from '@cesium-domain/utils/browserIo';

const props = defineProps({
    /** 面板形态：draw = 绘制工具，measure = 测量工具 */
    variant: {
        type: String,
        default: 'measure',
    },
});

const emit = defineEmits(['close', 'action', 'activate']);

const { t } = useLocale();
const message = useMessage();
const store = useDrawMeasureStore();
const { measureOptions, style, activeType, drawing, lastResult, records, subOptionsDisabled } =
    storeToRefs(store);

const DRAW_TOOLS = [
    { type: 'Point', icon: CircleDot },
    { type: 'LineString', icon: PenLine },
    { type: 'Polygon', icon: Pentagon },
    { type: 'Rectangle', icon: Square },
    { type: 'Circle', icon: Circle },
];

const MEASURE_TOOLS = [
    { type: 'MeasureDistance', icon: Ruler },
    { type: 'MeasureArea', icon: SquareDashedBottom },
    { type: 'MeasureHeight', icon: TriangleRight },
    { type: 'MeasureAzimuth', icon: Compass },
];

const tools = computed(() => (props.variant === 'draw' ? DRAW_TOOLS : MEASURE_TOOLS));

const title = computed(() =>
    props.variant === 'draw'
        ? t('cesium.drawMeasure.title.draw')
        : t('cesium.drawMeasure.title.measure'),
);

const groupLabel = computed(() =>
    props.variant === 'draw'
        ? t('cesium.drawMeasure.groups.draw')
        : t('cesium.drawMeasure.groups.measure'),
);

/** 底部提示：随当前交互类型切换 */
const hint = computed(() => {
    const type = activeType.value;
    if (!type) return t('cesium.drawMeasure.hints.default');
    return t(`cesium.drawMeasure.hints.${type}`);
});

// ────────────────────────── 交互 ──────────────────────────

function selectTool(type) {
    // 再次点击同一工具 = 取消当前交互（与侧栏二次点击收起的既有手感一致）
    if (activeType.value === type) {
        emit('action', 'cancel');
        return;
    }
    emit('activate', type);
}

function toggleOption(key, event) {
    store.setMeasureOption(key, !!event.target.checked);
}

function patchStyle(patch) {
    store.setStyle(patch);
}

function clearRecords() {
    store.clearRecords();
}

// ────────────────────────── 结果读数 ──────────────────────────

/**
 * 载荷 → 面板键值行。
 * 口径与场景标注一致：measure 为总开关，showArea 管面积，showPerimeter 管周长/长度/距离/角度。
 */
const rows = computed(() => {
    const r = lastResult.value;
    if (!r) return [];

    const onArea = measureOptions.value.measure && measureOptions.value.showArea;
    const onLength = measureOptions.value.measure && measureOptions.value.showPerimeter;
    const out = [];

    const coord = (p) => (p ? `${p[0].toFixed(6)}, ${p[1].toFixed(6)}` : '—');
    const pushArea = (value, label) => {
        if (!onArea || !Number.isFinite(value)) return;
        out.push({ label, value: formatAreaMeasure(value), accent: true });
    };
    const pushLength = (value, label, accent = false) => {
        if (!onLength || !Number.isFinite(value)) return;
        out.push({ label, value: formatDistanceMeasure(value), accent });
    };

    const K = (key) => t(`cesium.drawMeasure.result.${key}`);

    switch (r.type) {
        case 'Point':
            out.push({ label: K('position'), value: coord(r.lonLats[0]) });
            break;

        case 'LineString':
        case 'MeasureDistance':
            out.push({ label: K('pointCount'), value: `${r.lonLats.length}` });
            pushLength(r.length, K('length'), true);
            out.push({ label: K('start'), value: coord(r.lonLats[0]) });
            out.push({ label: K('end'), value: coord(r.lonLats[r.lonLats.length - 1]) });
            break;

        case 'Polygon':
        case 'MeasureArea':
            out.push({ label: K('vertexCount'), value: `${r.lonLats.length}` });
            pushArea(r.area, K('area'));
            pushLength(r.perimeter, K('perimeter'));
            out.push({ label: K('first'), value: coord(r.lonLats[0]) });
            break;

        case 'Rectangle':
            pushLength(r.width, K('spanEW'));
            pushLength(r.height, K('spanNS'));
            pushArea(r.area, K('area'));
            pushLength(r.perimeter, K('perimeter'));
            out.push({ label: K('southWest'), value: coord([r.rectangle.west, r.rectangle.south]) });
            out.push({ label: K('northEast'), value: coord([r.rectangle.east, r.rectangle.north]) });
            break;

        case 'Circle':
            out.push({ label: K('center'), value: coord(r.center) });
            pushLength(r.radius, K('radius'), true);
            pushArea(r.area, K('area'));
            pushLength(r.perimeter, K('perimeter'));
            break;

        case 'MeasureHeight':
            pushLength(r.verticalDistance, K('vertical'), true);
            pushLength(r.horizontalDistance, K('horizontal'), true);
            pushLength(r.slopeDistance, K('slope'));
            if (r.heights) {
                out.push({ label: K('heightStart'), value: formatDistanceMeasure(r.heights[0]) });
                out.push({ label: K('heightEnd'), value: formatDistanceMeasure(r.heights[1]) });
            }
            out.push({ label: K('start'), value: coord(r.lonLats[0]) });
            out.push({ label: K('end'), value: coord(r.lonLats[1]) });
            break;

        case 'MeasureAzimuth':
            if (onLength && Number.isFinite(r.azimuth)) {
                out.push({
                    label: K('azimuth'),
                    value: `${r.azimuth.toFixed(2)}°`,
                    accent: true,
                });
            }
            pushLength(r.distance, K('horizontal'));
            out.push({ label: K('start'), value: coord(r.lonLats[0]) });
            out.push({ label: K('end'), value: coord(r.lonLats[1]) });
            break;

        default:
            break;
    }

    return out;
});

// ────────────────────────── 导出 / 复制 ──────────────────────────

/** 组装 GeoJSON Feature（圆按绘制时的 64 边形环导出） */
function buildFeature() {
    const r = lastResult.value;
    if (!r) return null;

    const properties = {
        id: r.id,
        name: r.name,
        drawType: r.type,
    };
    if (Number.isFinite(r.area)) properties.area_m2 = Number(r.area.toFixed(2));
    if (Number.isFinite(r.perimeter)) properties.perimeter_m = Number(r.perimeter.toFixed(2));
    if (Number.isFinite(r.length)) properties.length_m = Number(r.length.toFixed(2));
    if (Number.isFinite(r.radius)) properties.radius_m = Number(r.radius.toFixed(2));
    if (Number.isFinite(r.azimuth)) properties.azimuth_deg = Number(r.azimuth.toFixed(2));
    if (Number.isFinite(r.verticalDistance)) {
        properties.vertical_m = Number(r.verticalDistance.toFixed(2));
    }
    if (Number.isFinite(r.horizontalDistance)) {
        properties.horizontal_m = Number(r.horizontalDistance.toFixed(2));
    }

    const ring = r.lonLats.map((p) => [p[0], p[1]]);
    let geometry = null;

    if (r.type === 'Point') {
        geometry = { type: 'Point', coordinates: ring[0] };
    } else if (
        r.type === 'LineString' ||
        r.type === 'MeasureDistance' ||
        r.type === 'MeasureHeight' ||
        r.type === 'MeasureAzimuth'
    ) {
        geometry = { type: 'LineString', coordinates: ring };
    } else {
        // 面类：补闭合点
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
        geometry = { type: 'Polygon', coordinates: [ring] };
    }

    return { type: 'Feature', properties, geometry };
}

/**
 * 导出 GeoJSON。剪贴与落盘兜底逻辑统一走 utils/browserIo
 * （与 TOC 右键「导出坐标」同一实现，避免两套各写一份）。
 */
function exportGeoJson() {
    const feature = buildFeature();
    if (!feature) return;
    const filename = `${feature.properties.id}-${feature.properties.drawType}.geojson`;
    downloadTextFile(JSON.stringify(feature, null, 2), filename, 'application/geo+json');
    message.success(t('cesium.exported', { name: filename }));
}

/**
 * 复制坐标。非安全上下文（http / 内网 IP）的兜底在 browserIo 内处理，
 * 此处只关心结果反馈（Force_command §2-8：不允许静默成功 / 失败）。
 */
async function copyCoords() {
    const r = lastResult.value;
    if (!r) return;
    const text = r.lonLats.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join('\n');
    const ok = await copyTextToClipboard(text);
    if (ok) message.success(t('cesium.drawMeasure.toast.coordsCopied', { count: r.lonLats.length }));
    else message.warning(t('cesium.copyCoordinatesFailed'));
}
</script>

<style scoped>
.cesium-dm-panel {
    width: 230px;
    bottom: 15px;
    max-height: calc(100vh - 110px);
    display: flex;
    flex-direction: column;
    background: var(--panel-bg);
    backdrop-filter: blur(12px);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.12);
    overflow: hidden;
    animation: dmSlideIn 0.2s ease-out;
}

@keyframes dmSlideIn {
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
    color: #fff;
    flex: none;
}

.panel-title {
    font-size: 13px;
    font-weight: 600;
}

.close-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    cursor: pointer;
    transition: background 0.2s;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.4);
}

.panel-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 12px 12px;
}

.section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin: 4px 0 6px;
    color: var(--text-secondary, #6b7280);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
}

.type-chip {
    padding: 1px 7px;
    border-radius: 9px;
    background: rgba(var(--brand-accent-rgb), 0.12);
    color: var(--brand-accent-dark);
    font-size: 10px;
    font-weight: 600;
}

.tool-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
}

.tool-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 4px;
    border: 2px solid var(--bg-brand-light);
    border-radius: 8px;
    background: #fff;
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
    line-height: 1.2;
}

.check-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    color: var(--text-brand, #374151);
    font-size: 12px;
    cursor: pointer;
}

.check-row.disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.check-row input {
    width: 14px;
    height: 14px;
    accent-color: var(--brand-accent);
}

.result-section,
.record-section,
.style-section,
.option-section {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--bg-brand-light);
}

.result-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px dashed var(--bg-brand-light);
    font-size: 12px;
}

.result-label {
    flex: none;
    color: var(--text-secondary, #6b7280);
}

.result-value {
    color: var(--text-primary, #111827);
    font-weight: 600;
    text-align: right;
    word-break: break-all;
}

.result-value.accent {
    color: var(--brand-accent-dark);
}

.empty-tip {
    padding: 6px 0;
    color: var(--text-secondary, #6b7280);
    font-size: 11px;
    line-height: 1.6;
}

.result-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
}

.mini-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 5px 0;
    border: 1px solid var(--bg-brand-light);
    border-radius: 6px;
    background: #fff;
    color: var(--text-brand, #374151);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
}

.mini-btn:hover {
    border-color: var(--brand-accent);
    color: var(--brand-accent-dark);
}

.record-item {
    padding: 4px 0;
    border-bottom: 1px dashed var(--bg-brand-light);
    color: var(--text-secondary, #6b7280);
    font-size: 11px;
    line-height: 1.5;
}

.record-item b {
    color: var(--brand-accent-dark);
}

.link-btn {
    margin-top: 6px;
    border: none;
    background: none;
    color: var(--brand-accent);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 0;
}

.link-btn:hover {
    text-decoration: underline;
}

.style-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
    color: var(--text-brand, #374151);
}

.style-row label {
    flex: none;
    width: 72px;
    color: var(--text-secondary, #6b7280);
    font-size: 11px;
}

.color-input {
    width: 32px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--bg-brand-light);
    border-radius: 4px;
    background: none;
    cursor: pointer;
}

.range-input {
    flex: 1;
    min-width: 0;
    accent-color: var(--brand-accent);
}

.range-value {
    flex: none;
    min-width: 34px;
    text-align: right;
    font-size: 11px;
    color: var(--text-secondary, #6b7280);
}

.panel-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 10px;
}

.action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 4px;
    border: 1px solid var(--bg-brand-light);
    border-radius: 6px;
    background: #fff;
    color: var(--text-brand, #374151);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover {
    border-color: var(--brand-accent);
    color: var(--brand-accent-dark);
}

.clear-btn {
    border-color: var(--danger-light);
    background: rgba(var(--danger-rgb), 0.06);
    color: var(--danger);
}

.clear-btn:hover {
    background: rgba(var(--danger-rgb), 0.12);
    border-color: rgba(var(--danger-rgb), 0.35);
    color: var(--danger);
}

.panel-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(var(--brand-primary-rgb), 0.04);
    border-top: 1px solid var(--bg-brand-light);
    color: var(--text-brand);
    font-size: 11px;
    line-height: 1.5;
    flex: none;
}

/* ── 移动端基线（Force_command §3：判据用触屏能力，不用宽度断点） ── */
@media (pointer: coarse) {
    .cesium-dm-panel {
        width: min(226px, calc(100vw - 96px));
        max-height: calc(100vh - 150px);
    }

    .tool-btn,
    .action-btn,
    .mini-btn {
        min-height: 40px;
    }

    .tool-btn {
        padding: 10px 4px;
    }

    .check-row {
        min-height: 36px;
    }

    .color-input {
        width: 40px;
        height: 32px;
    }
}
</style>
