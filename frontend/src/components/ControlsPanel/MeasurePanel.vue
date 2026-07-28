<template>
    <div class="measure-panel">
        <div class="panel-header">
            <span class="panel-title">{{ t('measure.title') }}</span>
            <button class="close-btn" :title="t('common.close')" @click="$emit('close')">
                <X :size="14" />
            </button>
        </div>

        <div class="tool-grid">
            <button
                v-for="tool in measureTools"
                :key="tool.type"
                class="tool-btn"
                :class="{ active: activeType === tool.type }"
                @click="selectTool(tool.type)"
            >
                <component :is="tool.icon" :size="18" />
                <span class="tool-label">{{ tool.label }}</span>
            </button>
        </div>

        <div class="panel-actions">
            <button class="action-btn clear-btn" @click="handleClear">
                <Trash2 :size="14" />
                <span>{{ t('measure.clear') }}</span>
            </button>
        </div>

        <div class="panel-hint">
            <Info :size="12" />
            <span>{{ hint }}</span>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { X, Info, Trash2, Ruler, SquareDashedBottom } from 'lucide-vue-next';
import { useLocale } from '../../composables/useLocale';

const { t } = useLocale();
const emit = defineEmits(['measure-type', 'clear', 'close']);

const activeType = ref('');

const measureTools = computed(() => [
    { type: 'MeasureDistance', label: t('measure.tools.MeasureDistance'), icon: Ruler },
    { type: 'MeasureArea', label: t('measure.tools.MeasureArea'), icon: SquareDashedBottom },
]);

const hint = computed(() => {
    switch (activeType.value) {
        case 'MeasureDistance':
            return t('measure.hints.MeasureDistance');
        case 'MeasureArea':
            return t('measure.hints.MeasureArea');
        default:
            return t('measure.hints.default');
    }
});

function selectTool(type) {
    activeType.value = type;
    emit('measure-type', type);
}

function handleClear() {
    activeType.value = '';
    emit('clear');
}
</script>

<style scoped>
.measure-panel {
    width: 200px;
    background: var(--panel-bg);
    backdrop-filter: blur(12px);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.12);
    overflow: hidden;
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

.tool-grid {
    display: flex;
    gap: 8px;
    padding: 12px;
}

.tool-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
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

.panel-actions {
    padding: 0 12px 10px;
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
}

/* 移动端适配：面板宽度自适应小屏视口 */
@media (max-width: 768px) {
    .measure-panel {
        width: min(200px, calc(100vw - 24px));
    }
}
</style>
