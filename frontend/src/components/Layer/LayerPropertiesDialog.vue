<template>
    <teleport to="body">
        <div
            v-if="visible"
            class="properties-overlay"
            @click.self="$emit('close')"
        >
            <div class="properties-dialog">
                <div class="dialog-header">
                    <span class="dialog-title">图层属性</span>
                    <button
                        class="close-btn"
                        @click="$emit('close')"
                    >
                        &times;
                    </button>
                </div>

                <div
                    v-if="layer"
                    class="dialog-body"
                >
                    <table class="props-table">
                        <tbody>
                            <tr>
                                <td class="prop-label">名称</td>
                                <td class="prop-value">{{ layer.name }}</td>
                            </tr>
                            <tr>
                                <td class="prop-label">图层 ID</td>
                                <td class="prop-value">{{ layer.id }}</td>
                            </tr>
                            <tr>
                                <td class="prop-label">几何类型</td>
                                <td class="prop-value">{{ layer.layerType || layer.raw?.type || '-' }}</td>
                            </tr>
                            <tr>
                                <td class="prop-label">数据来源</td>
                                <td class="prop-value">{{ sourceTypeLabel }}</td>
                            </tr>
                            <tr>
                                <td class="prop-label">要素数量</td>
                                <td class="prop-value">{{ layer.featureCount ?? '-' }}</td>
                            </tr>
                            <tr>
                                <td class="prop-label">坐标系</td>
                                <td class="prop-value">{{ layer.raw?.crs || layer.standardTocItem?.crs || 'EPSG:4326' }}</td>
                            </tr>
                            <tr v-if="centerLongitude != null && centerLatitude != null">
                                <td class="prop-label">中心经度</td>
                                <td class="prop-value">{{ Number(centerLongitude).toFixed(6) }}</td>
                            </tr>
                            <tr v-if="centerLongitude != null && centerLatitude != null">
                                <td class="prop-label">中心纬度</td>
                                <td class="prop-value">{{ Number(centerLatitude).toFixed(6) }}</td>
                            </tr>
                            <tr v-if="extent">
                                <td class="prop-label">范围 (WSEN)</td>
                                <td class="prop-value extent">{{ extent }}</td>
                            </tr>
                            <tr>
                                <td class="prop-label">可见性</td>
                                <td class="prop-value">{{ layer.visible !== false ? '可见' : '隐藏' }}</td>
                            </tr>
                            <tr>
                                <td class="prop-label">透明度</td>
                                <td class="prop-value">{{ opacityPercent }}%</td>
                            </tr>
                            <tr v-if="layer.format">
                                <td class="prop-label">数据格式</td>
                                <td class="prop-value">{{ layer.format }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </teleport>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    visible: { type: Boolean, default: false },
    layer: { type: Object, default: null },
});

defineEmits(['close']);

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
</script>

<style scoped>
.properties-overlay {
    position: fixed;
    inset: 0;
    background: var(--toc-bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(2px);
}

.properties-dialog {
    background: var(--toc-bg-dialog);
    border-radius: var(--toc-radius-lg);
    box-shadow: var(--toc-shadow-dialog);
    min-width: 360px;
    max-width: 480px;
    overflow: hidden;
    animation: dialogSlideIn var(--toc-transition-slow);
}

@keyframes dialogSlideIn {
    from {
        opacity: 0;
        transform: scale(0.95) translateY(-10px);
    }
    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    background: linear-gradient(135deg, var(--toc-primary) 0%, var(--toc-primary-dark) 100%);
    color: white;
}

.dialog-title {
    font-size: var(--toc-font-lg);
    font-weight: 600;
}

.close-btn {
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    color: white;
    padding: 0;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--toc-radius-full);
    transition: background var(--toc-transition-normal);
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
}

.dialog-body {
    padding: var(--toc-spacing-xl) 18px;
    max-height: 60vh;
    overflow-y: auto;
}

.props-table {
    width: 100%;
    border-collapse: collapse;
}

.props-table tr + tr {
    border-top: 1px solid var(--toc-table-separator);
}

.prop-label {
    padding: var(--toc-spacing-md) var(--toc-spacing-lg) var(--toc-spacing-md) 0;
    font-size: var(--toc-font-sm);
    font-weight: 600;
    color: var(--toc-text-secondary);
    white-space: nowrap;
    width: 90px;
    vertical-align: top;
}

.prop-value {
    padding: var(--toc-spacing-md) 0;
    font-size: var(--toc-font-sm);
    color: var(--toc-text-primary);
    word-break: break-all;
}

.prop-value.extent {
    font-family: monospace;
    font-size: var(--toc-font-xs);
}
</style>
