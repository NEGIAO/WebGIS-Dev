<!--
/**
 * ExtentPicker - 地图范围框选组件
 *
 * 完全自包含的框选组件，内置 DragBox 交互、红色预览、蓝色覆盖层。
 * 通过 provide('olMap') 自动获取地图实例，无需传入 props。
 *
 * @example 默认场景（保留蓝色覆盖层）
 * <ExtentPicker @extent-change="fillBbox" @extent-clear="clearBbox" />
 *
 * @example 不保留覆盖层场景
 * <ExtentPicker :show-overlay="false" @extent-change="fillBbox" />
 *
 * @prop {boolean} showOverlay - 框选完成后是否保留蓝色覆盖层（默认 true）
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
                {{ picking ? t('extent.picking') : hasExtent ? t('extent.pickAgain') : t('extent.pickStart') }}
            </button>
            <button
                class="extent-btn view-btn"
                type="button"
                :disabled="disabled"
                @click="getMapViewExtent"
            >
                <Eye :size="12" />
                {{ t('extent.currentView') }}
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
                <span class="hint-muted">{{ t('extent.hintIdle') }}</span>
            </template>
        </div>
    </div>
</template>

<script lang="ts" src="./ExtentPicker.ts"></script>

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
