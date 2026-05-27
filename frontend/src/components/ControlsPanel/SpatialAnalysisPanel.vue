<template>
    <div class="spatial-panel">
        <div class="panel-header">
            <span class="panel-title">空间分析</span>
            <button class="close-btn" @click="$emit('close')">
                <X :size="14" />
            </button>
        </div>

        <!-- 分析工具列表 -->
        <div class="analysis-list">
            <button
                v-for="tool in analysisTools"
                :key="tool.id"
                class="analysis-item"
                :class="{ active: activeTool === tool.id }"
                @click="selectTool(tool.id)"
            >
                <div class="item-icon" :style="{ background: tool.color }">
                    <component :is="tool.icon" :size="16" color="white" />
                </div>
                <div class="item-info">
                    <span class="item-label">{{ tool.label }}</span>
                    <span class="item-desc">{{ tool.description }}</span>
                </div>
            </button>
        </div>

        <!-- 缓冲区分析参数 -->
        <div v-if="activeTool === 'buffer'" class="params-section">
            <div class="param-group">
                <label class="param-label">缓冲半径（米）</label>
                <input
                    v-model.number="bufferRadius"
                    type="number"
                    class="param-input"
                    min="1"
                    max="100000"
                    placeholder="输入缓冲半径"
                />
            </div>
            <div class="param-group">
                <label class="param-label">目标图层</label>
                <select v-model="targetLayerId" class="param-select">
                    <option value="">-- 选择图层 --</option>
                    <option
                        v-for="layer in availableLayers"
                        :key="layer.id"
                        :value="layer.id"
                    >
                        {{ layer.name }}
                    </option>
                </select>
            </div>
            <button class="run-btn" @click="runBuffer" :disabled="!canRun">
                <Play :size="14" />
                执行分析
            </button>
        </div>

        <!-- 叠加分析参数 -->
        <div v-if="activeTool === 'overlay'" class="params-section">
            <div class="param-group">
                <label class="param-label">叠加方式</label>
                <div class="overlay-mode-grid">
                    <button
                        v-for="mode in overlayModes"
                        :key="mode.id"
                        class="mode-btn"
                        :class="{ active: overlayMode === mode.id }"
                        @click="overlayMode = mode.id"
                    >
                        {{ mode.label }}
                    </button>
                </div>
            </div>
            <div class="param-group">
                <label class="param-label">图层 A</label>
                <select v-model="layerA" class="param-select">
                    <option value="">-- 选择图层 --</option>
                    <option
                        v-for="layer in availableLayers"
                        :key="layer.id"
                        :value="layer.id"
                    >
                        {{ layer.name }}
                    </option>
                </select>
            </div>
            <div class="param-group">
                <label class="param-label">图层 B</label>
                <select v-model="layerB" class="param-select">
                    <option value="">-- 选择图层 --</option>
                    <option
                        v-for="layer in availableLayers"
                        :key="layer.id"
                        :value="layer.id"
                    >
                        {{ layer.name }}
                    </option>
                </select>
            </div>
            <button class="run-btn" @click="runOverlay" :disabled="!canRunOverlay">
                <Play :size="14" />
                执行分析
            </button>
        </div>

        <!-- 凸包分析参数 -->
        <div v-if="activeTool === 'convexHull'" class="params-section">
            <div class="param-group">
                <label class="param-label">目标图层</label>
                <select v-model="targetLayerId" class="param-select">
                    <option value="">-- 选择图层 --</option>
                    <option
                        v-for="layer in availableLayers"
                        :key="layer.id"
                        :value="layer.id"
                    >
                        {{ layer.name }}
                    </option>
                </select>
            </div>
            <button class="run-btn" @click="runConvexHull" :disabled="!targetLayerId">
                <Play :size="14" />
                执行分析
            </button>
        </div>

        <!-- 结果信息 -->
        <div v-if="resultMessage" class="result-section" :class="resultType">
            <component :is="resultType === 'success' ? CheckCircle2 : AlertCircle" :size="14" />
            <span>{{ resultMessage }}</span>
        </div>

        <div class="panel-hint">
            <Info :size="12" />
            <span>分析结果将作为新图层添加到地图</span>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import {
    X,
    Info,
    Play,
    CheckCircle2,
    AlertCircle,
    CircleDot,
    Combine,
    BoxSelect,
} from 'lucide-vue-next';

const emit = defineEmits(['analysis', 'close']);

const props = defineProps({
    availableLayers: {
        type: Array,
        default: () => [],
    },
});

// 分析工具配置
const analysisTools = [
    {
        id: 'buffer',
        label: '缓冲区分析',
        description: '对要素生成指定半径的缓冲区',
        icon: CircleDot,
        color: '#1890ff',
    },
    {
        id: 'overlay',
        label: '叠加分析',
        description: '交集、并集、差集运算',
        icon: Combine,
        color: '#52c41a',
    },
    {
        id: 'convexHull',
        label: '凸包分析',
        description: '计算要素集的最小凸多边形',
        icon: BoxSelect,
        color: '#fa8c16',
    },
];

// 叠加模式
const overlayModes = [
    { id: 'intersection', label: '交集' },
    { id: 'union', label: '并集' },
    { id: 'difference', label: '差集' },
];

// 状态
const activeTool = ref('');
const bufferRadius = ref(1000);
const targetLayerId = ref('');
const layerA = ref('');
const layerB = ref('');
const overlayMode = ref('intersection');
const resultMessage = ref('');
const resultType = ref('');

const canRun = computed(() => targetLayerId.value && bufferRadius.value > 0);
const canRunOverlay = computed(() => layerA.value && layerB.value && overlayMode.value);

function selectTool(id) {
    activeTool.value = activeTool.value === id ? '' : id;
    resultMessage.value = '';
}

function runBuffer() {
    if (!canRun.value) return;
    emit('analysis', {
        type: 'buffer',
        targetLayerId: targetLayerId.value,
        radius: bufferRadius.value,
    });
    showResult('success', `缓冲区分析已提交（半径 ${bufferRadius.value}m）`);
}

function runOverlay() {
    if (!canRunOverlay.value) return;
    if (layerA.value === layerB.value) {
        showResult('error', '图层 A 和图层 B 不能相同');
        return;
    }
    emit('analysis', {
        type: 'overlay',
        operation: overlayMode.value,
        layerA: layerA.value,
        layerB: layerB.value,
    });
    const modeLabel = overlayModes.find((m) => m.id === overlayMode.value)?.label || overlayMode.value;
    showResult('success', `${modeLabel}分析已提交`);
}

function runConvexHull() {
    if (!targetLayerId.value) return;
    emit('analysis', {
        type: 'convexHull',
        targetLayerId: targetLayerId.value,
    });
    showResult('success', '凸包分析已提交');
}

function showResult(type, msg) {
    resultType.value = type;
    resultMessage.value = msg;
    setTimeout(() => {
        resultMessage.value = '';
    }, 4000);
}
</script>

<style scoped>
.spatial-panel {
    width: 260px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(229, 236, 230, 0.6);
    overflow: hidden;
    animation: slideIn 0.2s ease-out;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
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

.spatial-panel::-webkit-scrollbar {
    width: 4px;
}

.spatial-panel::-webkit-scrollbar-thumb {
    background: #c0d8c0;
    border-radius: 4px;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: linear-gradient(135deg, #0d972fc8 0%, #0a6815c1 100%);
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

/* 分析工具列表 */
.analysis-list {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.analysis-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid #e8f0e8;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
}

.analysis-item:hover {
    border-color: #57b861;
    background: rgba(87, 184, 97, 0.05);
}

.analysis-item.active {
    border-color: #57b861;
    background: rgba(87, 184, 97, 0.1);
    box-shadow: 0 2px 8px rgba(87, 184, 97, 0.15);
}

.item-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.item-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.item-label {
    font-size: 13px;
    font-weight: 600;
    color: #333;
}

.item-desc {
    font-size: 11px;
    color: #888;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 参数区域 */
.params-section {
    padding: 10px 12px;
    border-top: 1px solid #e8f0e8;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.param-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.param-label {
    font-size: 12px;
    font-weight: 600;
    color: #555;
}

.param-input,
.param-select {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #d0d8d0;
    border-radius: 6px;
    font-size: 13px;
    background: white;
    color: #333;
    box-sizing: border-box;
    transition: border-color 0.2s;
}

.param-input:focus,
.param-select:focus {
    outline: none;
    border-color: #57b861;
    box-shadow: 0 0 0 2px rgba(87, 184, 97, 0.15);
}

.overlay-mode-grid {
    display: flex;
    gap: 6px;
}

.mode-btn {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #d0d8d0;
    border-radius: 6px;
    background: white;
    color: #666;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.mode-btn:hover {
    border-color: #57b861;
    color: #397d39;
}

.mode-btn.active {
    border-color: #57b861;
    background: linear-gradient(135deg, rgba(13, 151, 47, 0.1) 0%, rgba(87, 184, 97, 0.15) 100%);
    color: #0a6815;
}

.run-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    background: linear-gradient(135deg, #139647 0%, #0f995b 100%);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.run-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(19, 150, 71, 0.3);
}

.run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* 结果 */
.result-section {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 500;
    border-top: 1px solid #e8f0e8;
}

.result-section.success {
    background: #f0faf0;
    color: #2d8a4f;
}

.result-section.error {
    background: #fff0f0;
    color: #d44;
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
}
</style>
