<!--
/**
 * CesiumExtentPicker - 三维地图范围框选组件（ExtentPicker 的 Cesium 镜像）。
 *
 * OL 侧用 DragBox，Cesium 侧用 ScreenSpaceEventHandler 左键拖拽 + pickEllipsoid；
 * 对外事件与 ExtentPicker 同形，可互换使用。
 *
 * @prop {Function} getViewer - 返回 Cesium Viewer（HomeView 经 SidePanel 注入）
 * @prop {Function} getCesium - 返回 Cesium 命名空间
 * @prop {boolean} showOverlay - 框选完成后是否保留蓝色覆盖层（默认 true）
 * @prop {boolean} disabled - 按钮禁用状态（默认 false）
 *
 * @event extent-change - 框选完成时触发
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
                {{ picking ? t('extent.picking') : hasExtent ? t('extent.pickAgain') : t('extent.pickStart') }}
            </button>
            <button
                v-if="hasExtent"
                class="extent-btn clear-btn"
                type="button"
                :disabled="disabled"
                @click="clearExtent"
            >
                <Eraser :size="12" />
                {{ t('extent.clear') }}
            </button>
        </div>
        <div class="extent-hint">
            <template v-if="picking">
                <span class="hint-picking">{{ t('extent.hintPicking') }}</span>
            </template>
            <template v-else-if="hasExtent">
                <span class="hint-success">✓ {{ extentLabel }}</span>
            </template>
            <template v-else>
                <span class="hint-muted">{{ t('extent.hintIdleCesium') }}</span>
            </template>
        </div>
    </div>
</template>

<script setup>
import { onUnmounted, ref } from 'vue';
import { Crosshair, Eraser } from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';

const { t } = useLocale();
const message = useMessage();

const props = defineProps({
    /** 返回 Cesium Viewer 实例 */
    getViewer: {
        type: Function,
        default: null,
    },
    /** 返回 Cesium 命名空间 */
    getCesium: {
        type: Function,
        default: null,
    },
    /** 框选完成后是否保留蓝色覆盖层（默认 true） */
    showOverlay: {
        type: Boolean,
        default: true,
    },
    /** 按钮禁用状态 */
    disabled: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits([
    /** 框选完成 { extent: [minLon,minLat,maxLon,maxLat], crs: 'EPSG:4326' } */
    'extent-change',
    /** 清除选区 */
    'extent-clear',
]);

const picking = ref(false);
const hasExtent = ref(false);
const extentLabel = ref('');

// ========== 三维拾取实例（非响应式） ==========
let pickHandler = null;
let previewEntity = null;
let dragStart = null;
let savedEnableRotate = null;

/** 屏幕点转经纬度（椭球拾取，框选用途足够；取不到返回 null） */
function screenToLonLat(viewer, Cesium, position) {
    try {
        const cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
        if (!cartesian) return null;
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        if (!cartographic) return null;
        return [
            Cesium.Math.toDegrees(cartographic.longitude),
            Cesium.Math.toDegrees(cartographic.latitude),
        ];
    } catch {
        return null;
    }
}

/** 由两屏点算归一化 bbox，非合法返回 null */
function boxFromScreenPoints(viewer, Cesium, a, b) {
    const pa = screenToLonLat(viewer, Cesium, a);
    const pb = screenToLonLat(viewer, Cesium, b);
    if (!pa || !pb) return null;
    const minLng = Math.min(pa[0], pb[0]);
    const maxLng = Math.max(pa[0], pb[0]);
    const minLat = Math.min(pa[1], pb[1]);
    const maxLat = Math.max(pa[1], pb[1]);
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
    if (maxLng - minLng < 1e-6 || maxLat - minLat < 1e-6) return null;
    return [minLng, minLat, maxLng, maxLat];
}

/** 红色预览样式 / 蓝色完成样式切换 */
function stylePreviewEntity(entity, Cesium, done) {
    if (!entity) return;
    if (done) {
        entity.rectangle.material = Cesium.Color.fromCssColorString('#0e77b8').withAlpha(0.15);
        entity.rectangle.outlineColor = Cesium.Color.fromCssColorString('#0e77b8');
    } else {
        entity.rectangle.material = Cesium.Color.fromCssColorString('#e74c3c').withAlpha(0.12);
        entity.rectangle.outlineColor = Cesium.Color.fromCssColorString('#e74c3c');
    }
}

function ensurePreviewEntity(viewer, Cesium) {
    if (previewEntity && viewer.entities.contains(previewEntity)) return previewEntity;
    previewEntity = viewer.entities.add({
        rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(0, 0, 0, 0),
            material: Cesium.Color.fromCssColorString('#e74c3c').withAlpha(0.12),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#e74c3c'),
            outlineWidth: 2,
        },
    });
    return previewEntity;
}

function removePreviewEntity(viewer) {
    if (previewEntity) {
        try {
            viewer?.entities?.remove?.(previewEntity);
        } catch {
            // 视图已销毁时忽略
        }
        previewEntity = null;
    }
}

/** 结束拾取：销交互、恢复旋转（覆盖层按需保留） */
function finishPick(viewer, Cesium, keepOverlay) {
    if (pickHandler) {
        try {
            pickHandler.destroy();
        } catch {
            // 忽略
        }
        pickHandler = null;
    }
    const controller = viewer?.scene?.screenSpaceCameraController;
    if (controller && savedEnableRotate !== null) {
        controller.enableRotate = savedEnableRotate;
    }
    savedEnableRotate = null;
    dragStart = null;
    picking.value = false;
    if (!keepOverlay) removePreviewEntity(viewer);
    else if (previewEntity) stylePreviewEntity(previewEntity, Cesium, true);
}

/** 开始拖拽框选 */
function startPick() {
    const viewer = props.getViewer?.();
    const Cesium = props.getCesium?.();
    if (!viewer || !Cesium) {
        message.warning(t('shell.buildings.viewEmpty'));
        return;
    }

    // 清上一次残留（覆盖层按 ExtentPicker 习惯先清）
    finishPick(viewer, Cesium, false);
    removePreviewEntity(viewer);
    hasExtent.value = false;
    extentLabel.value = '';

    picking.value = true;
    const controller = viewer.scene.screenSpaceCameraController;
    if (controller) {
        savedEnableRotate = controller.enableRotate;
        controller.enableRotate = false;
    }

    pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    pickHandler.setInputAction((movement) => {
        dragStart = movement.position?.clone?.() || movement.position;
        ensurePreviewEntity(viewer, Cesium);
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    pickHandler.setInputAction((movement) => {
        if (!picking.value || !dragStart) return;
        const bbox = boxFromScreenPoints(viewer, Cesium, dragStart, movement.endPosition);
        if (!bbox || !previewEntity) return;
        previewEntity.rectangle.coordinates = Cesium.Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3]);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    pickHandler.setInputAction((movement) => {
        const bbox = dragStart ? boxFromScreenPoints(viewer, Cesium, dragStart, movement.position) : null;
        const keep = props.showOverlay && !!bbox;
        finishPick(viewer, Cesium, keep);
        if (!keep) removePreviewEntity(viewer);
        if (!bbox) return;
        hasExtent.value = true;
        extentLabel.value = `${bbox[0].toFixed(4)},${bbox[1].toFixed(4)} → ${bbox[2].toFixed(4)},${bbox[3].toFixed(4)}`;
        emit('extent-change', { extent: bbox, crs: 'EPSG:4326' });
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
}

/** 清除选区 */
function clearExtent() {
    const viewer = props.getViewer?.();
    const Cesium = props.getCesium?.();
    if (viewer && Cesium) finishPick(viewer, Cesium, false);
    removePreviewEntity(viewer);
    hasExtent.value = false;
    extentLabel.value = '';
    emit('extent-clear');
}

onUnmounted(() => {
    const viewer = props.getViewer?.();
    const Cesium = props.getCesium?.();
    if (viewer && Cesium) finishPick(viewer, Cesium, false);
    removePreviewEntity(viewer);
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
    color: var(--text-muted, var(--text-muted));
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
