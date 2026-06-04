<!--
/**
 * ExtentPicker - 地图范围框选组件
 *
 * 完全自包含的框选组件，内置 DragBox 交互、红色预览、蓝色覆盖层。
 * 通过 provide('olMap') 自动获取地图实例，无需传入 props。
 *
 * @example 分析场景（不保留覆盖层）
 * <ExtentPicker @extent-change="fillBbox" @extent-clear="clearBbox" />
 *
 * @example 下载场景（保留蓝色覆盖层）
 * <ExtentPicker :show-overlay="true" @extent-change="applyBbox" />
 *
 * @prop {boolean} showOverlay - 框选完成后是否保留蓝色覆盖层（默认 false）
 * @prop {boolean} disabled - 按钮禁用状态（默认 false）
 *
 * @event extent-change - 框选完成或获取视图范围后触发
 *   payload: { extent: [minLon, minLat, maxLon, maxLat], crs: 'EPSG:4326' }
 * @event extent-clear - 清除选区时触发
 */
-->
<template>
    <div class="extent-picker">
        <div class="extent-actions">
            <button
                class="extent-btn pick-btn"
                type="button"
                :disabled="disabled || picking"
                @click="startPick"
            >
                <Crosshair :size="12" />
                {{ picking ? '框选中...' : hasExtent ? '重新框选' : '开始框选' }}
            </button>
            <button
                class="extent-btn view-btn"
                type="button"
                :disabled="disabled"
                @click="getMapViewExtent"
            >
                <Eye :size="12" />
                当前视图
            </button>
            <button
                v-if="hasExtent"
                class="extent-btn clear-btn"
                type="button"
                :disabled="disabled"
                @click="clearExtent"
            >
                <Eraser :size="12" />
                清除
            </button>
        </div>
        <div class="extent-hint">
            <template v-if="picking">
                <span class="hint-picking">🔲 在地图上拖拽矩形框选范围</span>
            </template>
            <template v-else-if="hasExtent">
                <span class="hint-success">✓ {{ extentLabel }}</span>
            </template>
            <template v-else>
                <span class="hint-muted">拖拽框选或点击"当前视图"获取范围</span>
            </template>
        </div>
    </div>
</template>

<script setup>
import { ref, inject, onUnmounted } from 'vue';
import { toLonLat } from 'ol/proj';
import DragBox from 'ol/interaction/DragBox';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Style, Stroke, Fill } from 'ol/style';
import { Crosshair, Eraser, Eye } from 'lucide-vue-next';
import { formatCoordinateValue } from '../../utils/coordinateFormatter';

const props = defineProps({
    /** 框选完成后是否保留蓝色覆盖层（下载场景=true，分析场景=false） */
    showOverlay: {
        type: Boolean,
        default: false,
    },
    /** 按钮禁用状态 */
    disabled: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits([
    /** 框选完成或获取视图范围后触发 { extent: [minLon,minLat,maxLon,maxLat], crs: 'EPSG:4326' } */
    'extent-change',
    /** 清除选区时触发 */
    'extent-clear',
]);

// ========== 注入地图实例 ==========

/**
 * 获取 OpenLayers Map 实例
 *
 * Provide/Inject 链路：
 * - HomeView: provide('olMap', computed(() => mapContainerRef.value?.mapInstance))
 * - MapContainer: mapInstance = shallowRef(null)
 *
 * 因此需要解包两层：
 * 1. olMapRef.value → computed 的值（shallowRef）
 * 2. val.value → Map 实例
 *
 * @returns {import('ol/Map').default|null} Map 实例或 null
 */
const olMapRef = inject('olMap', null);
function getMap() {
    const val = olMapRef?.value;
    // val 可能是 shallowRef（需要 .value）或直接是 Map 实例
    return val?.value ?? val ?? null;
}

// ========== 内部状态 ==========
const picking = ref(false);
const hasExtent = ref(false);
const extentLabel = ref('');
let currentExtent = null; // [minLon, minLat, maxLon, maxLat]

// ========== OL 交互实例（非响应式） ==========
let dragBoxInteraction = null;
let previewLayer = null;
let previewSource = null;
let overlayLayer = null;
let overlaySource = null;

// ========== 样式常量（懒加载） ==========
let PREVIEW_STYLE = null;
let OVERLAY_STYLE = null;

/**
 * 获取红色预览样式（拖拽过程中）
 * @returns {import('ol/style/Style').default} 样式对象
 */
function getPreviewStyle() {
    if (!PREVIEW_STYLE) {
        PREVIEW_STYLE = new Style({
            stroke: new Stroke({ color: '#e74c3c', width: 2, lineDash: [6, 4] }),
            fill: new Fill({ color: 'rgba(231, 76, 60, 0.12)' }),
        });
    }
    return PREVIEW_STYLE;
}

/**
 * 获取蓝色完成样式（框选完成后）
 * @returns {import('ol/style/Style').default} 样式对象
 */
function getOverlayStyle() {
    if (!OVERLAY_STYLE) {
        OVERLAY_STYLE = new Style({
            stroke: new Stroke({ color: '#0e77b8', width: 2, lineDash: [8, 4] }),
            fill: new Fill({ color: 'rgba(145, 192, 209, 0.15)' }),
        });
    }
    return OVERLAY_STYLE;
}

// ========== 预览图层管理 ==========

function ensurePreviewLayer() {
    const map = getMap();
    if (!map || previewLayer) return;
    previewSource = new VectorSource();
    previewLayer = new VectorLayer({ source: previewSource, style: getPreviewStyle(), zIndex: 99999 });
    map.addLayer(previewLayer);
}

function removePreviewLayer() {
    const map = getMap();
    if (previewLayer && map) map.removeLayer(previewLayer);
    previewLayer = null;
    previewSource = null;
}

function updatePreview(geometry) {
    if (!previewSource) return;
    previewSource.clear();
    if (geometry) previewSource.addFeature(new Feature({ geometry }));
}

// ========== 持久化覆盖层管理 ==========

function showExtentOverlay(geometry) {
    clearOverlayLayer();
    const map = getMap();
    if (!map || !geometry) return;
    overlaySource = new VectorSource();
    overlaySource.addFeature(new Feature({ geometry }));
    overlayLayer = new VectorLayer({ source: overlaySource, style: getOverlayStyle(), zIndex: 9999 });
    map.addLayer(overlayLayer);
}

function clearOverlayLayer() {
    const map = getMap();
    if (overlayLayer && map) map.removeLayer(overlayLayer);
    overlayLayer = null;
    overlaySource = null;
}

// ========== 框选交互 ==========

function cleanupInteraction() {
    const map = getMap();
    if (dragBoxInteraction && map) map.removeInteraction(dragBoxInteraction);
    dragBoxInteraction = null;
    removePreviewLayer();
    picking.value = false;
}

/** 开始拖拽框选 */
function startPick() {
    const map = getMap();
    if (!map) return;

    // 清除上一次的交互和覆盖层
    cleanupInteraction();
    clearOverlayLayer();

    picking.value = true;
    dragBoxInteraction = new DragBox({ condition: () => true });
    map.addInteraction(dragBoxInteraction);

    // 拖拽中：红色预览
    dragBoxInteraction.on('boxdrag', () => {
        const geom = dragBoxInteraction?.getGeometry?.();
        if (geom) {
            ensurePreviewLayer();
            updatePreview(geom);
        }
    });

    // 框选完成
    dragBoxInteraction.on('boxend', () => {
        const geom = dragBoxInteraction?.getGeometry?.();
        const ext = geom?.getExtent?.();

        // 移除交互和预览
        cleanupInteraction();

        if (!ext || ext.length < 4) return;

        // 蓝色覆盖层（按需）
        if (props.showOverlay && geom) {
            showExtentOverlay(geom);
        }

        // 坐标转换 3857 → 4326
        const [minLon, minLat] = toLonLat([ext[0], ext[1]]);
        const [maxLon, maxLat] = toLonLat([ext[2], ext[3]]);
        currentExtent = [minLon, minLat, maxLon, maxLat];

        hasExtent.value = true;
        extentLabel.value = `${formatCoordinateValue(minLon)},${formatCoordinateValue(minLat)} → ${formatCoordinateValue(maxLon)},${formatCoordinateValue(maxLat)}`;

        emit('extent-change', { extent: currentExtent, crs: 'EPSG:4326' });
    });
}

/** 获取当前地图可视范围 */
function getMapViewExtent() {
    const map = getMap();
    if (!map) return;

    cleanupInteraction();
    clearOverlayLayer();

    const view = map.getView();
    const ext = view.calculateExtent(map.getSize());
    const [minLon, minLat] = toLonLat([ext[0], ext[1]]);
    const [maxLon, maxLat] = toLonLat([ext[2], ext[3]]);
    currentExtent = [minLon, minLat, maxLon, maxLat];

    hasExtent.value = true;
    extentLabel.value = `${formatCoordinateValue(minLon)},${formatCoordinateValue(minLat)} → ${formatCoordinateValue(maxLon)},${formatCoordinateValue(maxLat)}`;

    emit('extent-change', { extent: currentExtent, crs: 'EPSG:4326' });
}

/** 清除选区 */
function clearExtent() {
    cleanupInteraction();
    clearOverlayLayer();
    hasExtent.value = false;
    extentLabel.value = '';
    currentExtent = null;
    emit('extent-clear');
}

// ========== 生命周期清理 ==========
onUnmounted(() => {
    cleanupInteraction();
    clearOverlayLayer();
    currentExtent = null;
});
</script>

<style scoped>
.extent-picker {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.extent-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}

.extent-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid var(--brand-accent);
    background: var(--bg-hover, #f0f7f0);
    color: var(--brand-accent-muted, #2d8a4e);
}

.extent-btn:hover:not(:disabled) {
    background: var(--bg-active, #e0f0e0);
    border-color: var(--brand-accent-dark, #1a7a3a);
    color: var(--brand-accent-dark, #1a7a3a);
}

.extent-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.view-btn {
    border-color: #a0b8c8;
    background: #f0f6fa;
    color: #3a6b8a;
}

.view-btn:hover:not(:disabled) {
    border-color: #6a9ab8;
    background: #e0eef6;
    color: #2a5a7a;
}

.clear-btn {
    border-color: #e8c8c8;
    background: #fdf5f5;
    color: #c44;
}

.clear-btn:hover:not(:disabled) {
    border-color: #d44;
    background: #fce8e8;
    color: #b00;
}

.extent-hint {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    line-height: 1.4;
}

.hint-muted {
    color: var(--text-muted, #999);
}

.hint-picking {
    color: #e74c3c;
    font-weight: 600;
    animation: blink 1s infinite;
}

.hint-success {
    color: var(--brand-accent, #2d8a4e);
    font-weight: 500;
    font-size: 10px;
    word-break: break-all;
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
</style>
