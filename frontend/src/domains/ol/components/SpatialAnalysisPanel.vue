<template>
    <div class="spatial-panel">
        <div class="panel-header">
            <span class="panel-title">{{ t('spatial.title') }}</span>
            <button class="close-btn" :title="t('common.close')" @click="$emit('close')">
                <X :size="14" />
            </button>
        </div>

        <div class="panel-scroll-body">
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
                <label class="param-label">{{ t('spatial.bufferRadius') }}</label>
                <input
                    v-model.number="bufferRadius"
                    type="number"
                    class="param-input"
                    min="1"
                    max="100000"
                    :placeholder="t('spatial.bufferRadiusPlaceholder')"
                />
            </div>
            <div class="param-group">
                <label class="param-label">{{ t('spatial.targetLayer') }}</label>
                <select v-model="targetLayerId" class="param-select">
                    <option value="">{{ t('spatial.selectLayer') }}</option>
                    <option
                        v-for="layer in availableLayers"
                        :key="layer.id"
                        :value="layer.id"
                    >
                        {{ layer.name }}
                    </option>
                </select>
            </div>
            <button class="run-btn" :disabled="!canRun" @click="runBuffer">
                <Play :size="14" />
                {{ t('spatial.executeAnalysis') }}
            </button>
        </div>

        <!-- 叠加分析参数 -->
        <div v-if="activeTool === 'overlay'" class="params-section">
            <div class="param-group">
                <label class="param-label">{{ t('spatial.overlayMethod') }}</label>
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
                <label class="param-label">{{ t('spatial.layerA') }}</label>
                <select v-model="layerA" class="param-select">
                    <option value="">{{ t('spatial.selectLayer') }}</option>
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
                <label class="param-label">{{ t('spatial.layerB') }}</label>
                <select v-model="layerB" class="param-select">
                    <option value="">{{ t('spatial.selectLayer') }}</option>
                    <option
                        v-for="layer in availableLayers"
                        :key="layer.id"
                        :value="layer.id"
                    >
                        {{ layer.name }}
                    </option>
                </select>
            </div>
            <button class="run-btn" :disabled="!canRunOverlay" @click="runOverlay">
                <Play :size="14" />
                {{ t('spatial.executeAnalysis') }}
            </button>
        </div>

        <!-- 凸包分析参数 -->
        <div v-if="activeTool === 'convexHull'" class="params-section">
            <div class="param-group">
                <label class="param-label">{{ t('spatial.convexHullTarget') }}</label>
                <select v-model="targetLayerId" class="param-select">
                    <option value="">{{ t('spatial.selectLayer') }}</option>
                    <option
                        v-for="layer in availableLayers"
                        :key="layer.id"
                        :value="layer.id"
                    >
                        {{ layer.name }}
                    </option>
                </select>
            </div>
            <button class="run-btn" :disabled="!targetLayerId" @click="runConvexHull">
                <Play :size="14" />
                {{ t('spatial.executeAnalysis') }}
            </button>
        </div>

        <!-- 泰森多边形分析参数 -->
        <div v-if="activeTool === 'voronoi'" class="params-section">
            <div class="param-group">
                <label class="param-label">{{ t('spatial.voronoiTarget') }}</label>
                <select v-model="targetLayerId" class="param-select">
                    <option value="">{{ t('spatial.selectLayer') }}</option>
                    <option
                        v-for="layer in availableLayers"
                        :key="layer.id"
                        :value="layer.id"
                    >
                        {{ layer.name }}
                    </option>
                </select>
            </div>
            <button class="run-btn" :disabled="!targetLayerId" @click="runVoronoi">
                <Play :size="14" />
                {{ t('spatial.executeAnalysis') }}
            </button>
        </div>

        <!-- 空间聚合分析参数 -->
        <div v-if="activeTool === 'aggregation'" class="params-section">
            <div class="param-group">
                <label class="param-label">{{ t('spatial.aggregateTarget') }}</label>
                <select v-model="targetLayerId" class="param-select">
                    <option value="">{{ t('spatial.selectLayer') }}</option>
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
                <label class="param-label">{{ t('spatial.gridType') }}</label>
                <div class="overlay-mode-grid">
                    <button
                        class="mode-btn"
                        :class="{ active: gridType === 'grid' }"
                        @click="gridType = 'grid'"
                    >
                        {{ t('spatial.squareGrid') }}
                    </button>
                    <button
                        class="mode-btn"
                        :class="{ active: gridType === 'hexbin' }"
                        @click="gridType = 'hexbin'"
                    >
                        {{ t('spatial.hexGrid') }}
                    </button>
                </div>
            </div>
            <div class="param-group">
                <label class="param-label">{{ t('spatial.gridSize') }}</label>
                <input
                    v-model.number="gridSize"
                    type="number"
                    class="param-input"
                    min="1"
                    max="1000000"
                    step="100"
                    :placeholder="t('spatial.gridSizePlaceholder')"
                />
            </div>
            <div class="param-group">
                <label class="param-label">{{ t('spatial.bboxRange') }}</label>
                <div class="bbox-inputs">
                    <input v-model.number="bboxMinLon" type="number" class="param-input bbox-input" :placeholder="t('spatial.minLon')" step="0.1" />
                    <input v-model.number="bboxMinLat" type="number" class="param-input bbox-input" :placeholder="t('spatial.minLat')" step="0.1" />
                    <input v-model.number="bboxMaxLon" type="number" class="param-input bbox-input" :placeholder="t('spatial.maxLon')" step="0.1" />
                    <input v-model.number="bboxMaxLat" type="number" class="param-input bbox-input" :placeholder="t('spatial.maxLat')" step="0.1" />
                </div>
                <ExtentPicker
                    @extent-change="fillAggregationBbox"
                    @extent-clear="clearAggregationBbox"
                />
            </div>
            <button class="run-btn" :disabled="!canRunAggregation" @click="runAggregation">
                <Play :size="14" />
                {{ t('spatial.executeAnalysis') }}
            </button>
        </div>

        <!-- 多环缓冲区分析参数 -->
        <div v-if="activeTool === 'multiRingBuffer'" class="params-section">
            <div class="param-group">
                <label class="param-label">{{ t('spatial.multiRingTarget') }}</label>
                <select v-model="targetLayerId" class="param-select">
                    <option value="">{{ t('spatial.selectLayer') }}</option>
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
                <label class="param-label">{{ t('spatial.multiRingDistance') }}</label>
                <input
                    v-model="distancesInput"
                    type="text"
                    class="param-input"
                    :placeholder="t('spatial.multiRingPlaceholder')"
                />
                <span class="param-hint">{{ t('spatial.multiRingHint') }}</span>
            </div>
            <button class="run-btn" :disabled="!canRunMultiRing" @click="runMultiRingBuffer">
                <Play :size="14" />
                {{ t('spatial.executeAnalysis') }}
            </button>
        </div>

        <!-- 几何简化分析参数 -->
        <div v-if="activeTool === 'simplify'" class="params-section">
            <div class="param-group">
                <label class="param-label">{{ t('spatial.simplifyTarget') }}</label>
                <select v-model="targetLayerId" class="param-select">
                    <option value="">{{ t('spatial.selectLayer') }}</option>
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
                <label class="param-label">{{ t('spatial.simplifyTolerance') }}</label>
                <input
                    v-model.number="simplifyTolerance"
                    type="number"
                    class="param-input"
                    min="0.1"
                    max="100000"
                    step="1"
                    :placeholder="t('spatial.simplifyPlaceholder')"
                />
                <span class="param-hint">{{ t('spatial.simplifyHint') }}</span>
            </div>
            <button class="run-btn" :disabled="!canRunSimplify" @click="runSimplify">
                <Play :size="14" />
                {{ t('spatial.executeAnalysis') }}
            </button>
        </div>

        <!-- 渔网分析参数 -->
        <div v-if="activeTool === 'fishnet'" class="params-section">
            <div class="param-group">
                <label class="param-label">{{ t('spatial.fishnetRange') }}</label>
                <div class="bbox-inputs">
                    <input v-model.number="fishnetMinLon" type="number" class="param-input bbox-input" :placeholder="t('spatial.minLon')" step="0.1" />
                    <input v-model.number="fishnetMinLat" type="number" class="param-input bbox-input" :placeholder="t('spatial.minLat')" step="0.1" />
                    <input v-model.number="fishnetMaxLon" type="number" class="param-input bbox-input" :placeholder="t('spatial.maxLon')" step="0.1" />
                    <input v-model.number="fishnetMaxLat" type="number" class="param-input bbox-input" :placeholder="t('spatial.maxLat')" step="0.1" />
                </div>
                <ExtentPicker
                    @extent-change="fillFishnetBbox"
                    @extent-clear="clearFishnetBbox"
                />
            </div>
            <div class="param-group">
                <label class="param-label">{{ t('spatial.fishnetGridSize') }}<span class="required">*</span></label>
                <input
                    v-model.number="fishnetGridSize"
                    type="number"
                    class="param-input"
                    min="1"
                    max="1000000"
                    :placeholder="t('spatial.fishnetGridSizePlaceholder')"
                />
            </div>
            <div class="param-group">
                <label class="param-label">{{ t('spatial.fishnetGeomType') }}</label>
                <div class="overlay-mode-grid">
                    <button
                        class="mode-btn"
                        :class="{ active: fishnetGeometryType === 'polygon' }"
                        @click="fishnetGeometryType = 'polygon'"
                    >
                        {{ t('spatial.fishnetPolygon') }}
                    </button>
                    <button
                        class="mode-btn"
                        :class="{ active: fishnetGeometryType === 'line' }"
                        @click="fishnetGeometryType = 'line'"
                    >
                        {{ t('spatial.fishnetLine') }}
                    </button>
                </div>
            </div>
            <div class="param-group">
                <label class="param-label checkbox-label">
                    <input v-model="fishnetCreatePoints" type="checkbox" class="param-checkbox" />
                    {{ t('spatial.fishnetCreateCenter') }}
                </label>
            </div>
            <button class="run-btn" :disabled="!canRunFishnet" @click="runFishnet">
                <Play :size="14" />
                {{ t('spatial.executeAnalysis') }}
            </button>
        </div>

        <!-- 结果信息 -->
        <div v-if="resultMessage" class="result-section" :class="resultType">
            <component :is="resultType === 'success' ? CheckCircle2 : AlertCircle" :size="14" />
            <span>{{ resultMessage }}</span>
        </div>

        <div class="panel-hint">
            <Info :size="12" />
            <span>{{ t('spatial.resultHint') }}</span>
        </div>
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
    Network,
    LayoutGrid,
    Target,
    Shrink,
    Grid3x3,
} from '@lucide/vue';
import ExtentPicker from '@common/components/ExtentPicker.vue';
import { formatCoordinateValue } from '@common/map-view/coordinateFormatter';
import { useLocale } from '@common/app/useLocale';

const { t } = useLocale();
const emit = defineEmits(['analysis', 'close']);

defineProps({
    availableLayers: {
        type: Array,
        default: () => [],
    },
});

/** 分析工具列表：label/description 随语言切换 */
const analysisTools = computed(() => [
    {
        id: 'buffer',
        label: t('spatial.tools.buffer'),
        description: t('spatial.tools.bufferDesc'),
        icon: CircleDot,
        color: '#1890ff',
    },
    {
        id: 'overlay',
        label: t('spatial.tools.overlay'),
        description: t('spatial.tools.overlayDesc'),
        icon: Combine,
        color: '#52c41a',
    },
    {
        id: 'convexHull',
        label: t('spatial.tools.convexHull'),
        description: t('spatial.tools.convexHullDesc'),
        icon: BoxSelect,
        color: '#fa8c16',
    },
    {
        id: 'voronoi',
        label: t('spatial.tools.voronoi'),
        description: t('spatial.tools.voronoiDesc'),
        icon: Network,
        color: '#722ed1',
    },
    {
        id: 'aggregation',
        label: t('spatial.tools.aggregate'),
        description: t('spatial.tools.aggregateDesc'),
        icon: LayoutGrid,
        color: '#13c2c2',
    },
    {
        id: 'multiRingBuffer',
        label: t('spatial.tools.multiRing'),
        description: t('spatial.tools.multiRingDesc'),
        icon: Target,
        color: '#eb2f96',
    },
    {
        id: 'simplify',
        label: t('spatial.tools.simplify'),
        description: t('spatial.tools.simplifyDesc'),
        icon: Shrink,
        color: '#faad14',
    },
    {
        id: 'fishnet',
        label: t('spatial.tools.fishnet'),
        description: t('spatial.tools.fishnetDesc'),
        icon: Grid3x3,
        color: '#8b5cf6',
    },
]);

/** 叠加模式 */
const overlayModes = computed(() => [
    { id: 'intersection', label: t('spatial.modes.intersection') },
    { id: 'union', label: t('spatial.modes.union') },
    { id: 'difference', label: t('spatial.modes.difference') },
]);

// 状态
const activeTool = ref('');
const bufferRadius = ref(1000);
const targetLayerId = ref('');
const layerA = ref('');
const layerB = ref('');
const overlayMode = ref('intersection');
const resultMessage = ref('');
const resultType = ref('');

// 泰森多边形 - 无额外参数

// 空间聚合参数
const gridType = ref('grid');
const gridSize = ref(500);
const bboxMinLon = ref(null);
const bboxMinLat = ref(null);
const bboxMaxLon = ref(null);
const bboxMaxLat = ref(null);

// 多环缓冲区参数
const distancesInput = ref('');

// 几何简化参数
const simplifyTolerance = ref(100);

// 渔网分析参数
const fishnetMinLon = ref(null);
const fishnetMinLat = ref(null);
const fishnetMaxLon = ref(null);
const fishnetMaxLat = ref(null);
const fishnetGridSize = ref(null);
const fishnetGeometryType = ref('polygon');
const fishnetCreatePoints = ref(false);

// 辅助函数：验证 bbox 值是否为有效数字
function isValidBboxVal(v) {
    return v !== null && v !== '' && typeof v === 'number' && !isNaN(v);
}

// 计算属性
const canRun = computed(() => targetLayerId.value && bufferRadius.value > 0);
const canRunOverlay = computed(() => layerA.value && layerB.value && overlayMode.value);
const canRunAggregation = computed(() =>
    targetLayerId.value &&
    isValidBboxVal(bboxMinLon.value) &&
    isValidBboxVal(bboxMinLat.value) &&
    isValidBboxVal(bboxMaxLon.value) &&
    isValidBboxVal(bboxMaxLat.value)
);
const canRunMultiRing = computed(() => {
    if (!targetLayerId.value || !distancesInput.value) return false;
    const parts = distancesInput.value.split(/[,，\s]+/).filter(Boolean);
    return parts.every((p) => !isNaN(Number(p)) && Number(p) > 0);
});
const canRunSimplify = computed(() => targetLayerId.value && simplifyTolerance.value > 0);
const canRunFishnet = computed(() =>
    isValidBboxVal(fishnetMinLon.value) &&
    isValidBboxVal(fishnetMinLat.value) &&
    isValidBboxVal(fishnetMaxLon.value) &&
    isValidBboxVal(fishnetMaxLat.value) &&
    fishnetGridSize.value > 0
);
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
    showResult('success', t('spatial.bufferSubmitted', { radius: bufferRadius.value }));
}

function runOverlay() {
    if (!canRunOverlay.value) return;
    if (layerA.value === layerB.value) {
        showResult('error', t('spatial.overlaySameLayer'));
        return;
    }
    emit('analysis', {
        type: 'overlay',
        operation: overlayMode.value,
        layerA: layerA.value,
        layerB: layerB.value,
    });
    const modeLabel =
        overlayModes.value.find((m) => m.id === overlayMode.value)?.label || overlayMode.value;
    showResult('success', t('spatial.overlaySubmitted', { mode: modeLabel }));
}

function runConvexHull() {
    if (!targetLayerId.value) return;
    emit('analysis', {
        type: 'convexHull',
        targetLayerId: targetLayerId.value,
    });
    showResult('success', t('spatial.convexHullSubmitted'));
}

function runVoronoi() {
    if (!targetLayerId.value) return;
    emit('analysis', {
        type: 'voronoi',
        targetLayerId: targetLayerId.value,
    });
    showResult('success', t('spatial.voronoiSubmitted'));
}

function runAggregation() {
    if (!canRunAggregation.value) return;
    emit('analysis', {
        type: 'aggregation',
        targetLayerId: targetLayerId.value,
        bbox: [bboxMinLon.value, bboxMinLat.value, bboxMaxLon.value, bboxMaxLat.value],
        gridType: gridType.value,
        gridSize: gridSize.value,
    });
    const gridLabel =
        gridType.value === 'hexbin' ? t('spatial.hexLabel') : t('spatial.squareLabel');
    showResult('success', t('spatial.aggregateSubmitted', { grid: gridLabel }));
}

function runMultiRingBuffer() {
    if (!canRunMultiRing.value) return;
    const distances = distancesInput.value
        .split(/[,，\s]+/)
        .filter(Boolean)
        .map(Number)
        .sort((a, b) => a - b);
    emit('analysis', {
        type: 'multiRingBuffer',
        targetLayerId: targetLayerId.value,
        distances,
    });
    showResult('success', t('spatial.multiRingSubmitted', { count: distances.length }));
}

function runSimplify() {
    if (!canRunSimplify.value) return;
    emit('analysis', {
        type: 'simplify',
        targetLayerId: targetLayerId.value,
        tolerance: simplifyTolerance.value,
    });
    showResult('success', t('spatial.simplifySubmitted', { tolerance: simplifyTolerance.value }));
}

/**
 * 从 ExtentPicker 接收渔网分析的 BBox 范围
 * @param {{ extent: number[] }} param0 - extent 为 [minLon, minLat, maxLon, maxLat] 四元组
 */
function fillFishnetBbox({ extent }) {
    if (extent?.length === 4) {
        fishnetMinLon.value = formatCoordinateValue(extent[0]);
        fishnetMinLat.value = formatCoordinateValue(extent[1]);
        fishnetMaxLon.value = formatCoordinateValue(extent[2]);
        fishnetMaxLat.value = formatCoordinateValue(extent[3]);
    }
}

/**
 * 清除渔网分析的 BBox 范围
 */
function clearFishnetBbox() {
    fishnetMinLon.value = null;
    fishnetMinLat.value = null;
    fishnetMaxLon.value = null;
    fishnetMaxLat.value = null;
}

/**
 * 从 ExtentPicker 接收空间聚合的 BBox 范围
 * @param {{ extent: number[] }} param0 - extent 为 [minLon, minLat, maxLon, maxLat] 四元组
 */
function fillAggregationBbox({ extent }) {
    if (extent?.length === 4) {
        bboxMinLon.value = formatCoordinateValue(extent[0]);
        bboxMinLat.value = formatCoordinateValue(extent[1]);
        bboxMaxLon.value = formatCoordinateValue(extent[2]);
        bboxMaxLat.value = formatCoordinateValue(extent[3]);
    }
}

/**
 * 清除空间聚合的 BBox 范围
 */
function clearAggregationBbox() {
    bboxMinLon.value = null;
    bboxMinLat.value = null;
    bboxMaxLon.value = null;
    bboxMaxLat.value = null;
}

function runFishnet() {
    if (!canRunFishnet.value) return;
    emit('analysis', {
        type: 'fishnet',
        bbox: [fishnetMinLon.value, fishnetMinLat.value, fishnetMaxLon.value, fishnetMaxLat.value],
        gridSizeMeters: fishnetGridSize.value,
        geometryType: fishnetGeometryType.value,
        createCenterPoints: fishnetCreatePoints.value,
    });
    const typeLabel =
        fishnetGeometryType.value === 'polygon'
            ? t('spatial.fishnetPolygon')
            : t('spatial.fishnetLine');
    const pointLabel = fishnetCreatePoints.value ? t('spatial.fishnetWithCenter') : '';
    showResult(
        'success',
        t('spatial.fishnetSubmitted', {
            size: fishnetGridSize.value,
            geom: typeLabel,
            point: pointLabel,
        }),
    );
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
    width: 220px;
    background: var(--panel-bg);
    backdrop-filter: blur(12px);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.12);
    overflow: hidden;
    animation: slideIn 0.2s ease-out;
    max-height: calc(100vh - 120px);
    display: flex;
    flex-direction: column;
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

.panel-scroll-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
}

.panel-scroll-body::-webkit-scrollbar {
    width: 4px;
}

.panel-scroll-body::-webkit-scrollbar-thumb {
    background: var(--border-brand-light);
    border-radius: 4px;
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
    border: 2px solid var(--bg-brand-light);
    border-radius: 8px;
    background: white;
    color: var(--brand-accent-muted);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
}

.analysis-item:hover {
    border-color: var(--brand-accent);
    background: var(--bg-hover);
}

.analysis-item.active {
    border-color: var(--brand-accent);
    background: linear-gradient(135deg, rgba(var(--brand-accent-rgb), 0.1) 0%, var(--bg-active) 100%);
    color: var(--brand-accent-dark);
    box-shadow: 0 2px 8px rgba(var(--brand-accent-rgb), 0.25);
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
    color: var(--brand-accent-muted);
}

.item-desc {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 参数区域 */
.params-section {
    padding: 10px 12px;
    border-top: 1px solid var(--bg-brand-light);
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
    color: var(--brand-accent-muted);
}

.param-input,
.param-select {
    width: 100%;
    padding: 7px 10px;
    border: 2px solid var(--bg-brand-light);
    border-radius: 8px;
    font-size: 13px;
    background: white;
    color: var(--brand-accent-muted);
    box-sizing: border-box;
    transition: border-color 0.2s;
}

.param-input:focus,
.param-select:focus {
    outline: none;
    border-color: var(--brand-accent);
    box-shadow: 0 0 0 2px var(--bg-active);
}

.param-hint {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 2px;
}

.bbox-inputs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
}

.bbox-input {
    min-width: 0;
}

.fetch-bbox-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 8px;
    margin-top: 4px;
    border: 1px dashed var(--brand-accent);
    border-radius: 4px;
    background: var(--bg-hover);
    color: var(--brand-accent-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
}

.fetch-bbox-btn:hover:not(:disabled) {
    background: var(--bg-active);
    border-color: var(--brand-accent-dark);
}

.fetch-bbox-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.overlay-mode-grid {
    display: flex;
    gap: 6px;
}

.mode-btn {
    flex: 1;
    padding: 6px 8px;
    border: 2px solid var(--bg-brand-light);
    border-radius: 8px;
    background: white;
    color: var(--brand-accent-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.mode-btn:hover {
    border-color: var(--brand-accent);
    background: var(--bg-hover);
}

.mode-btn.active {
    border-color: var(--brand-accent);
    background: linear-gradient(135deg, rgba(var(--brand-accent-rgb), 0.1) 0%, var(--bg-active) 100%);
    color: var(--brand-accent-dark);
    box-shadow: 0 2px 8px rgba(var(--brand-accent-rgb), 0.25);
}

.run-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--brand-gradient);
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
    box-shadow: 0 2px 8px rgba(var(--brand-accent-rgb), 0.3);
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
    border-top: 1px solid var(--bg-brand-light);
}

.result-section.success {
    background: var(--bg-brand-light);
    color: var(--brand-primary-dark);
}

.result-section.error {
    background: rgba(var(--danger-rgb), 0.06);
    border: 1px solid var(--danger-light);
    color: var(--danger);
}

.panel-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(var(--brand-primary-rgb), 0.04);
    color: var(--text-muted);
    font-size: 11px;
    border-top: 1px solid var(--bg-brand-light);
}

.bbox-actions {
    display: flex;
    gap: 6px;
    margin-top: 4px;
}

/* 平板/移动端适配 */
@media (max-width: 768px) {
    .spatial-panel {
        width: 180px;
    }
}

.bbox-actions .fetch-bbox-btn {
    flex: 1;
    margin-top: 0;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 12px;
}

.param-checkbox {
    width: 14px;
    height: 14px;
    accent-color: var(--brand-accent);
    cursor: pointer;
}

.required {
    color: #e74c3c;
    margin-left: 2px;
}
</style>
