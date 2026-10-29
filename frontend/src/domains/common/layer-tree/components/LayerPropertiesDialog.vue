<template>
    <teleport to="body">
        <div
            v-if="visible"
            class="lp-overlay"
            @click.self="$emit('close')"
        >
            <div
                class="lp-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="图层属性"
            >
                <!-- 头部：与 FloatingAccountPanel 同 DNA（140° 品牌渐变 + 经纬网格纹理） -->
                <header class="lp-header">
                    <div class="lp-header-icon">
                        <component
                            :is="geometryIcon"
                            :size="18"
                            :stroke-width="2"
                        />
                    </div>
                    <div class="lp-heading">
                        <h2 class="lp-title">图层属性</h2>
                        <p class="lp-subtitle">{{ sourceTypeLabel }} · {{ geometryLabel }}</p>
                    </div>
                    <button
                        class="lp-close"
                        type="button"
                        aria-label="关闭"
                        @click="$emit('close')"
                    >
                        <X :size="15" :stroke-width="2.4" />
                    </button>
                </header>

                <div
                    v-if="layer"
                    class="lp-body"
                >
                    <!-- 概要区：图层名 + 属性徽章 -->
                    <section class="lp-hero">
                        <div
                            class="lp-hero-name"
                            :title="layer.name"
                        >
                            {{ layer.name || '未命名图层' }}
                        </div>
                        <div class="lp-chips">
                            <span class="lp-chip">
                                <component
                                    :is="geometryIcon"
                                    :size="11"
                                    :stroke-width="2.4"
                                />
                                {{ geometryLabel }}
                            </span>
                            <span class="lp-chip">
                                <Tag :size="11" :stroke-width="2.4" />
                                {{ sourceTypeLabel }}
                            </span>
                            <span
                                v-if="layer.format"
                                class="lp-chip"
                            >
                                <FileType :size="11" :stroke-width="2.4" />
                                {{ layer.format }}
                            </span>
                        </div>
                    </section>

                    <!-- 统计卡：要素数量 / 可见性 / 透明度 -->
                    <section class="lp-stats">
                        <div class="lp-stat">
                            <span class="lp-stat-label">
                                <Table :size="11" :stroke-width="2.4" />
                                要素数量
                            </span>
                            <span class="lp-stat-value">{{ layer.featureCount ?? '—' }}</span>
                        </div>
                        <div class="lp-stat">
                            <span class="lp-stat-label">
                                <component
                                    :is="layer.visible !== false ? Eye : EyeOff"
                                    :size="11"
                                    :stroke-width="2.4"
                                />
                                可见性
                            </span>
                            <span
                                class="lp-badge"
                                :class="layer.visible !== false ? 'is-on' : 'is-off'"
                            >
                                <i class="lp-dot" />
                                {{ layer.visible !== false ? '可见' : '隐藏' }}
                            </span>
                        </div>
                        <div class="lp-stat">
                            <span class="lp-stat-label">
                                <Percent :size="11" :stroke-width="2.4" />
                                透明度
                            </span>
                            <span class="lp-stat-value">{{ opacityPercent }}%</span>
                            <span class="lp-opbar">
                                <i :style="{ width: opacityPercent + '%' }" />
                            </span>
                        </div>
                    </section>

                    <!-- 明细区：ID / 几何 / 坐标系 / 中心点 / 范围 -->
                    <section class="lp-details">
                        <div class="lp-row">
                            <span class="lp-key">
                                <Hash :size="11" :stroke-width="2.4" />
                                图层 ID
                            </span>
                            <span class="lp-val mono">{{ layer.id }}</span>
                        </div>
                        <div class="lp-row">
                            <span class="lp-key">
                                <Shapes :size="11" :stroke-width="2.4" />
                                几何类型
                            </span>
                            <span class="lp-val">{{ geometryLabel }}</span>
                        </div>
                        <div class="lp-row">
                            <span class="lp-key">
                                <Globe :size="11" :stroke-width="2.4" />
                                坐标系
                            </span>
                            <span class="lp-val">{{ crsLabel }}</span>
                        </div>
                        <div
                            v-if="centerLongitude != null && centerLatitude != null"
                            class="lp-row"
                        >
                            <span class="lp-key">
                                <Crosshair :size="11" :stroke-width="2.4" />
                                中心经度
                            </span>
                            <span class="lp-val mono">{{ Number(centerLongitude).toFixed(6) }}</span>
                        </div>
                        <div
                            v-if="centerLongitude != null && centerLatitude != null"
                            class="lp-row"
                        >
                            <span class="lp-key">
                                <Crosshair :size="11" :stroke-width="2.4" />
                                中心纬度
                            </span>
                            <span class="lp-val mono">{{ Number(centerLatitude).toFixed(6) }}</span>
                        </div>
                        <div
                            v-if="extent"
                            class="lp-row"
                        >
                            <span class="lp-key">
                                <Ruler :size="11" :stroke-width="2.4" />
                                范围 (WSEN)
                            </span>
                            <span class="lp-val mono">{{ extent }}</span>
                        </div>
                    </section>

                    <!-- 重设源坐标系：只在导入期保留了原始几何时出现（见 crs/sourceSnapshot）。
                         判定错了就地改，不必重新上传 —— 补上「导入后不可逆」那半个缺口。
                         二维全类型留存快照；三维仅 GeoJSON（KML 坐标在解析期已变换、SHP 已按
                         .prj / override 走完），其余类型自然不渲染，不做基于已投影坐标的伪反推 -->
                    <section
                        v-if="canResetCrs"
                        class="lp-crs"
                    >
                        <div class="lp-crs-head">
                            <span class="lp-crs-title">
                                <Globe :size="11" :stroke-width="2.4" />
                                重设源坐标系
                            </span>
                            <span class="lp-crs-tip">判定有误时改这里，按原始数值重新投影</span>
                        </div>
                        <div class="lp-crs-body">
                            <select
                                v-model="crsDraft"
                                class="lp-crs-select"
                            >
                                <option value="">预置坐标系…</option>
                                <optgroup label="常用">
                                    <option
                                        v-for="preset in BASIC_CRS_PRESETS"
                                        :key="preset.code"
                                        :value="preset.code"
                                    >
                                        {{ preset.label }} · {{ preset.code.slice(5) }}
                                    </option>
                                </optgroup>
                                <optgroup label="CGCS2000 三度带">
                                    <option
                                        v-for="preset in cgcsPresets"
                                        :key="preset.code"
                                        :value="preset.code"
                                    >
                                        {{ preset.hint }} · {{ preset.code.slice(5) }}
                                    </option>
                                </optgroup>
                                <optgroup label="UTM">
                                    <option
                                        v-for="preset in utmPresets"
                                        :key="preset.code"
                                        :value="preset.code"
                                    >
                                        {{ preset.hint }} · {{ preset.code.slice(5) }}
                                    </option>
                                </optgroup>
                            </select>
                            <input
                                v-model="crsCustom"
                                class="lp-crs-input"
                                type="text"
                                spellcheck="false"
                                placeholder="或 EPSG:4547 / +proj=…"
                            />
                            <button
                                class="lp-crs-apply"
                                type="button"
                                :disabled="!crsNext"
                                @click="applyCrsReset"
                            >
                                重新投影
                            </button>
                        </div>
                        <p class="lp-crs-warn">
                            以「原始数值」重新解释为所选坐标系，当前图层随即替换为换算结果；原始数值仍留在内存中，可反复改判。
                        </p>
                    </section>
                </div>

                <div
                    v-else
                    class="lp-empty"
                >
                    <Info :size="26" :stroke-width="1.8" />
                    <p>暂无图层数据</p>
                </div>
            </div>
        </div>
    </teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
    CircleDot,
    Crosshair,
    Eye,
    EyeOff,
    FileType,
    Globe,
    Hash,
    Hexagon,
    Info,
    Layers,
    Percent,
    Route,
    Shapes,
    Table,
    Tag,
    X,
} from '@lucide/vue';
import {
    BASIC_CRS_PRESETS,
    listCgcs2000Presets,
    listUtmPresets,
} from '@common/data-import/crs/crsPresets';
import { getSourceSnapshot, hasSourceSnapshot } from '@common/data-import/crs/sourceSnapshot';

const props = defineProps({
    visible: { type: Boolean, default: false },
    layer: { type: Object, default: null },
});

const emit = defineEmits(['close', 'reproject']);

const SOURCE_TYPE_LABELS = {
    draw: '绘制',
    upload: '上传/导入',
    search: '搜索结果',
    'district-boundary': '行政区划',
};

const sourceTypeLabel = computed(() => {
    const st = props.layer?.sourceType;
    return SOURCE_TYPE_LABELS[st] || st || '未知';
});

/** 几何类型 → 中文标签 + 图标（未收录类型原样展示原始值） */
const GEOMETRY_META = {
    Point: { label: '点要素', icon: CircleDot },
    MultiPoint: { label: '点要素', icon: CircleDot },
    LineString: { label: '线要素', icon: Route },
    MultiLineString: { label: '线要素', icon: Route },
    Polygon: { label: '面要素', icon: Hexagon },
    MultiPolygon: { label: '面要素', icon: Hexagon },
};

const geometryRaw = computed(() =>
    String(props.layer?.layerType || props.layer?.raw?.type || '').trim(),
);
const geometryMeta = computed(() => GEOMETRY_META[geometryRaw.value] || null);
const geometryLabel = computed(() => geometryMeta.value?.label || geometryRaw.value || '未知');
const geometryIcon = computed(() => geometryMeta.value?.icon || Layers);

// ── 重设源坐标系（导入期保留原始几何时可用；2D 全类型、3D 仅 GeoJSON） ──
const crsDraft = ref('');
const crsCustom = ref('');
/** CGCS2000 三度带 21 条 + UTM 中国带号 43~53：与上传区下拉同源，避免两套清单 */
const cgcsPresets = listCgcs2000Presets(3);
const utmPresets = listUtmPresets({ zoneFrom: 43, zoneTo: 53 });

/** TOC 节点 id：事件上报用（三维节点带引擎前缀，HomeView 据此分流） */
const nodeId = computed(() => String(props.layer?.id || '').trim());
/**
 * 快照键 = 引擎侧图层 id。二维节点 id 与之一致，三维节点带 `cesium:` 前缀
 * （见 cesiumLayerNodeBuilder），故此处按前缀剥除。
 * 不 import 该常量：common 层不得反向依赖 cesium 域，前缀在此只作字面量约定。
 */
const snapshotKey = computed(() => {
    const raw = String(props.layer?.raw?.id || '').trim();
    if (raw) return raw;
    const id = nodeId.value;
    return id.startsWith('cesium:') ? id.slice('cesium:'.length) : id;
});
/**
 * 快照注册表刻意不做响应式（可能很大，见 sourceSnapshot 注释），
 * 这里以 visible / snapshotKey 作为依赖，弹窗每次打开重新判定一次。
 */
const canResetCrs = computed(
    () => !!(props.visible && snapshotKey.value && hasSourceSnapshot(snapshotKey.value)),
);
const crsNext = computed(() => crsCustom.value.trim() || crsDraft.value);

watch(
    () => [props.visible, snapshotKey.value],
    () => {
        crsDraft.value = '';
        crsCustom.value = '';
    },
);

function applyCrsReset() {
    if (!crsNext.value || !nodeId.value) return;
    emit('reproject', { layerId: nodeId.value, crs: crsNext.value });
}

const crsLabel = computed(() => {
    const raw = props.layer?.raw || {};
    const item = props.layer?.standardTocItem || {};
    const meta = raw.metadata || item.metadata || {};
    // 导入时判定/指定的源坐标系优先展示（比默认 4326 更有诊断价值）；
    // 三维图层没有 2D 那套 metadata，直接取快照里记录的判定结果
    return (
        raw.crs ||
        item.crs ||
        meta.sourceCrs ||
        getSourceSnapshot(snapshotKey.value)?.sourceCrs ||
        'EPSG:4326'
    );
});

const centerLongitude = computed(() => {
    return props.layer?.raw?.longitude ?? props.layer?.standardTocItem?.longitude ?? null;
});

const centerLatitude = computed(() => {
    return props.layer?.raw?.latitude ?? props.layer?.standardTocItem?.latitude ?? null;
});

const opacityPercent = computed(() => {
    return Math.round((props.layer?.opacity ?? 1) * 100);
});

const extent = computed(() => {
    const meta = props.layer?.raw?.metadata || props.layer?.standardTocItem?.metadata;
    const ext = meta?.extent || props.layer?.raw?.extent;
    if (!Array.isArray(ext) || ext.length < 4) return null;
    return ext.map((v) => Number(v).toFixed(4)).join(', ');
});

/** Esc 关闭（与项目其他浮层一致：挂载即监听、卸载即移除） */
function handleKeydown(event) {
    if (event.key === 'Escape' && props.visible) {
        emit('close');
    }
}

onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.lp-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 2000);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 20, 0.45);
    backdrop-filter: blur(3px);
    animation: lpFadeIn var(--toc-transition-normal, 0.16s) ease-out;
}

@keyframes lpFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.lp-dialog {
    display: flex;
    flex-direction: column;
    width: min(440px, 100%);
    max-height: min(84vh, 720px);
    overflow: hidden;
    background: var(--toc-bg-dialog, #ffffff);
    border: var(--panel-border, 1px solid rgba(0, 0, 0, 0.06));
    border-radius: var(--panel-radius, 12px);
    box-shadow: var(--panel-shadow, 0 8px 32px rgba(0, 0, 0, 0.15));
    animation: lpPopIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes lpPopIn {
    from {
        opacity: 0;
        transform: translateY(12px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

/* ===== 头部：140° 品牌渐变 + 经纬网格纹理（全局主题联动） ===== */
.lp-header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    padding: 15px 16px;
    overflow: hidden;
    background: linear-gradient(140deg, var(--brand-primary, #4caf50) 0%, var(--brand-primary-dark, #2e7d32) 100%);
    color: #ffffff;
}

.lp-header::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
    background-size: 24px 24px;
    -webkit-mask-image: radial-gradient(ellipse 95% 120% at 50% 0%, #000 30%, transparent 100%);
    mask-image: radial-gradient(ellipse 95% 120% at 50% 0%, #000 30%, transparent 100%);
    pointer-events: none;
}

.lp-header > * {
    position: relative;
    z-index: 1;
}

.lp-header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 10px;
}

.lp-heading {
    flex: 1;
    min-width: 0;
}

.lp-title {
    margin: 0;
    font-size: var(--fs-lg, 16px);
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1.3;
}

.lp-subtitle {
    margin: 2px 0 0;
    font-size: var(--fs-xs, 11px);
    line-height: 1.3;
    opacity: 0.82;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.lp-close {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
    border: none;
    border-radius: var(--radius-full, 50%);
    cursor: pointer;
    transition: background var(--toc-transition-fast, 0.12s ease);
}

.lp-close:hover {
    background: rgba(255, 255, 255, 0.28);
}

/* ===== 主体 ===== */
.lp-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 18px 18px;
    overflow-y: auto;
}

/* 概要区 */
.lp-hero-name {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--text-brand-dark, #2c4638);
    word-break: break-all;
}

.lp-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}

.lp-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    font-size: var(--fs-xs, 11px);
    line-height: 1.4;
    color: var(--text-brand, #397d39);
    background: var(--bg-brand-light, #e8f5e9);
    border: 1px solid var(--border-brand-light, #c8e6c9);
    border-radius: 999px;
}

.lp-chip svg {
    flex-shrink: 0;
    opacity: 0.75;
}

/* 统计卡 */
.lp-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}

.lp-stat {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    padding: 10px;
    background: var(--toc-hint-bg, #f5f8f5);
    border: 1px solid var(--toc-hint-border, #edf2ed);
    border-radius: var(--panel-radius-sm, 8px);
}

.lp-stat-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--fs-xs, 11px);
    color: var(--text-secondary, #666);
    white-space: nowrap;
}

.lp-stat-label svg {
    flex-shrink: 0;
    color: var(--text-muted, #999);
}

.lp-stat-value {
    font-size: 16px;
    font-weight: 650;
    line-height: 1.2;
    color: var(--text-brand-dark, #2c4638);
    font-variant-numeric: tabular-nums;
}

.lp-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    align-self: flex-start;
    padding: 2px 9px;
    font-size: var(--fs-xs, 11px);
    font-weight: 600;
    line-height: 1.5;
    border-radius: 999px;
}

.lp-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}

.lp-badge.is-on {
    color: #1b7f3b;
    background: #e7f6ec;
}

.lp-badge.is-on .lp-dot {
    background: #22a34f;
    box-shadow: 0 0 0 3px rgba(34, 163, 79, 0.15);
}

.lp-badge.is-off {
    color: #7d827d;
    background: #f0f1f0;
}

.lp-badge.is-off .lp-dot {
    background: #b3b8b3;
}

.lp-opbar {
    display: block;
    height: 4px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 2px;
}

.lp-opbar i {
    display: block;
    height: 100%;
    background: var(--brand-gradient, linear-gradient(135deg, #5ec773 0%, #35a44f 100%));
    border-radius: 2px;
    transition: width var(--toc-transition-normal, 0.16s) ease-out;
}

/* 明细区 */
.lp-details {
    overflow: hidden;
    border: 1px solid var(--toc-hint-border, #edf2ed);
    border-radius: var(--panel-radius-sm, 8px);
}

.lp-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 12px;
}

.lp-row + .lp-row {
    border-top: 1px dashed var(--toc-table-separator, #f0f4f1);
}

.lp-row:nth-child(even) {
    background: rgba(var(--brand-primary-rgb, 76, 175, 80), 0.03);
}

.lp-key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    font-size: var(--fs-sm, 12px);
    color: var(--text-secondary, #666);
    white-space: nowrap;
}

.lp-val {
    min-width: 0;
    font-size: var(--fs-sm, 12px);
    color: var(--text-brand-dark, #2c4638);
    text-align: right;
    word-break: break-all;
}

.lp-val.mono {
    font-family: var(--font-mono, monospace);
    font-size: var(--fs-xs, 11px);
    letter-spacing: 0.01em;
}

/* 空态 */
.lp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 0;
    color: var(--text-muted, #999);
}

.lp-empty p {
    margin: 0;
    font-size: var(--fs-sm, 12px);
}

/* 重设源坐标系：与 lp-details 同一边框语汇，但底色略深以示「可操作」 */
.lp-crs {
    margin-top: 10px;
    padding: 10px;
    background: var(--toc-hint-bg, #f5f8f5);
    border: 1px solid var(--toc-hint-border, #edf2ed);
    border-radius: var(--panel-radius-sm, 8px);
}

.lp-crs-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
}

.lp-crs-title {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--fs-xs, 11px);
    font-weight: 600;
    color: var(--text-secondary, #666);
}

.lp-crs-title svg {
    flex-shrink: 0;
    color: var(--text-muted, #999);
}

.lp-crs-tip {
    font-size: 10px;
    color: var(--text-muted, #999);
}

.lp-crs-body {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.lp-crs-select,
.lp-crs-input {
    min-width: 0;
    height: 32px;
    padding: 0 8px;
    font-size: 12px;
    color: var(--text-primary, #333);
    background: #fff;
    border: 1px solid var(--toc-hint-border, #e2e8e2);
    border-radius: 6px;
}

.lp-crs-select {
    flex: 1 1 150px;
}

.lp-crs-input {
    flex: 0 1 150px;
}

.lp-crs-apply {
    flex: 0 0 auto;
    height: 32px;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: var(--brand-primary, #4caf50);
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

.lp-crs-apply:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.lp-crs-warn {
    margin: 8px 0 0;
    font-size: 10px;
    line-height: 1.6;
    color: var(--text-muted, #999);
}

/* 触屏：控件抬高到 40px，与上传区选择器一致 */
@media (pointer: coarse) {
    .lp-crs-select,
    .lp-crs-input,
    .lp-crs-apply {
        height: 40px;
    }
}

/* 窄屏适配 */
@media (max-width: 480px) {
    .lp-overlay {
        padding: 12px;
    }

    .lp-stats {
        grid-template-columns: 1fr 1fr;
    }

    .lp-stat:last-child {
        grid-column: span 2;
    }
}
</style>
