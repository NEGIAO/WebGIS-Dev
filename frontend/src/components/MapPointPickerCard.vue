<template>
    <div class="point-picker-wrap" :class="themeClass">
        <div class="point-picker-actions">
            <button
                type="button"
                class="point-btn"
                :class="{ active: pickMode === 'start' }"
                @click="$emit('pick-start')"
            >
                {{ pickMode === 'start' ? startPickingText : startLabel }}
            </button>
            <button
                type="button"
                class="point-btn"
                :class="{ active: pickMode === 'end' }"
                @click="$emit('pick-end')"
            >
                {{ pickMode === 'end' ? endPickingText : endLabel }}
            </button>
        </div>

        <div class="point-coords-grid">
            <div class="coord-card">
                <div class="coord-title">{{ startTitle }}</div>
                <div class="coord-value" v-if="hasStart">
                    {{ Number(startPoint.lng).toFixed(6) }}, {{ Number(startPoint.lat).toFixed(6) }}
                </div>
                <div class="coord-address" v-if="hasStartAddress">{{ startAddress }}</div>
                <div class="coord-empty" v-else>未设置</div>
            </div>

            <div class="coord-card">
                <div class="coord-title">{{ endTitle }}</div>
                <div class="coord-value" v-if="hasEnd">
                    {{ Number(endPoint.lng).toFixed(6) }}, {{ Number(endPoint.lat).toFixed(6) }}
                </div>
                <div class="coord-address" v-if="hasEndAddress">{{ endAddress }}</div>
                <div class="coord-empty" v-else>未设置</div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    pickMode: {
        type: String,
        default: ''
    },
    startPoint: {
        type: Object,
        default: null
    },
    endPoint: {
        type: Object,
        default: null
    },
    startAddress: {
        type: String,
        default: ''
    },
    endAddress: {
        type: String,
        default: ''
    },
    startLabel: {
        type: String,
        default: '设置起点（地图选择）'
    },
    endLabel: {
        type: String,
        default: '设置终点（地图选择）'
    },
    startPickingText: {
        type: String,
        default: '请在地图单击起点...'
    },
    endPickingText: {
        type: String,
        default: '请在地图单击终点...'
    },
    startTitle: {
        type: String,
        default: '起点坐标'
    },
    endTitle: {
        type: String,
        default: '终点坐标'
    },
    theme: {
        type: String,
        default: 'bus' // 'bus' | 'drive'
    }
});

defineEmits(['pick-start', 'pick-end']);

function isPointValid(point) {
    return Number.isFinite(Number(point?.lng)) && Number.isFinite(Number(point?.lat));
}

const hasStart = computed(() => isPointValid(props.startPoint));
const hasEnd = computed(() => isPointValid(props.endPoint));
const hasStartAddress = computed(() => Boolean(String(props.startAddress || '').trim()));
const hasEndAddress = computed(() => Boolean(String(props.endAddress || '').trim()));
const themeClass = computed(() => props.theme === 'drive' ? 'theme-drive' : 'theme-bus');
</script>

<style scoped>
.point-picker-wrap {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.point-picker-wrap.theme-drive {
    --pp-accent: #2563eb;
    --pp-soft-bg: #eff6ff;
    --pp-soft-border: rgba(37, 99, 235, 0.2);
    --pp-soft-text: #1e40af;
}

.point-picker-wrap.theme-bus {
    --pp-accent: #1f6a3f;
    --pp-soft-bg: #eefcf4;
    --pp-soft-border: rgba(31, 106, 63, 0.2);
    --pp-soft-text: #166534;
}

.point-picker-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.point-btn {
    border: 1px solid var(--pp-soft-border);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.92);
    color: var(--pp-accent);
    font-size: 13px;
    font-weight: 700;
    padding: 9px 10px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.point-btn:hover {
    background: var(--pp-soft-bg);
    border-color: var(--pp-accent);
}

.point-btn.active {
    background: var(--pp-accent);
    color: #fff;
    border-color: var(--pp-accent);
}

.point-coords-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.coord-card {
    border: 1px solid var(--pp-soft-border);
    border-radius: 9px;
    padding: 9px;
    background: var(--pp-soft-bg);
}

.coord-title {
    font-size: 12px;
    color: var(--pp-soft-text);
}

.coord-value {
    margin-top: 3px;
    font-size: 12px;
    font-weight: 700;
    color: #183a2a;
    word-break: break-all;
}

.coord-address {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.45;
    color: #2d5a43;
    word-break: break-word;
}

.coord-empty {
    margin-top: 3px;
    font-size: 12px;
    color: #9aaea0;
}

@media (max-width: 860px) {
    .point-picker-actions,
    .point-coords-grid {
        grid-template-columns: 1fr;
    }
}
</style>
