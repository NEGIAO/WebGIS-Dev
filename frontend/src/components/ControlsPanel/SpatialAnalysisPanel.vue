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
            <button class="run-btn" :disabled="!canRun" @click="runBuffer">
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
            <button class="run-btn" :disabled="!canRunOverlay" @click="runOverlay">
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
            <button class="run-btn" :disabled="!targetLayerId" @click="runConvexHull">
                <Play :size="14" />
                执行分析
            </button>
        </div>

        <!-- 泰森多边形分析参数 -->
        <div v-if="activeTool === 'voronoi'" class="params-section">
            <div class="param-group">
                <label class="param-label">目标图层（点要素）</label>
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
            <button class="run-btn" :disabled="!targetLayerId" @click="runVoronoi">
                <Play :size="14" />
                执行分析
            </button>
        </div>

        <!-- 空间聚合分析参数 -->
        <div v-if="activeTool === 'aggregation'" class="params-section">
            <div class="param-group">
                <label class="param-label">目标图层（点要素）</label>
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
            <div class="param-group">
                <label class="param-label">网格类型</label>
                <div class="overlay-mode-grid">
                    <button
                        class="mode-btn"
                        :class="{ active: gridType === 'grid' }"
                        @click="gridType = 'grid'"
                    >
                        方格网
                    </button>
                    <button
                        class="mode-btn"
                        :class="{ active: gridType === 'hexbin' }"
                        @click="gridType = 'hexbin'"
                    >
                        六边形
                    </button>
                </div>
            </div>
            <div class="param-group">
                <label class="param-label">网格大小（米）</label>
                <input
                    v-model.number="gridSize"
                    type="number"
                    class="param-input"
                    min="1"
                    max="1000000"
                    step="100"
                    placeholder="默认 500"
                />
            </div>
            <div class="param-group">
                <label class="param-label">可视范围 BBox</label>
                <div class="bbox-inputs">
                    <input v-model.number="bboxMinLon" type="number" class="param-input bbox-input" placeholder="最小经度" step="0.1" />
                    <input v-model.number="bboxMinLat" type="number" class="param-input bbox-input" placeholder="最小纬度" step="0.1" />
                    <input v-model.number="bboxMaxLon" type="number" class="param-input bbox-input" placeholder="最大经度" step="0.1" />
                    <input v-model.number="bboxMaxLat" type="number" class="param-input bbox-input" placeholder="最大纬度" step="0.1" />
                </div>
                <ExtentPicker
                    @extent-change="fillAggregationBbox"
                    @extent-clear="clearAggregationBbox"
                />
            </div>
            <button class="run-btn" :disabled="!canRunAggregation" @click="runAggregation">
                <Play :size="14" />
                执行分析
            </button>
        </div>

        <!-- 多环缓冲区分析参数 -->
        <div v-if="activeTool === 'multiRingBuffer'" class="params-section">
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
            <div class="param-group">
                <label class="param-label">缓冲距离（米，逗号分隔）</label>
                <input
                    v-model="distancesInput"
                    type="text"
                    class="param-input"
                    placeholder="例如：100, 300, 500"
                />
                <span class="param-hint">由内到外依次递增，如 100, 300, 500</span>
            </div>
            <button class="run-btn" :disabled="!canRunMultiRing" @click="runMultiRingBuffer">
                <Play :size="14" />
                执行分析
            </button>
        </div>

        <!-- 几何简化分析参数 -->
        <div v-if="activeTool === 'simplify'" class="params-section">
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
            <div class="param-group">
                <label class="param-label">简化容差（米）</label>
                <input
                    v-model.number="simplifyTolerance"
                    type="number"
                    class="param-input"
                    min="0.1"
                    max="100000"
                    step="1"
                    placeholder="例如：100"
                />
                <span class="param-hint">值越大简化程度越高，推荐 10 ~ 1000 米</span>
            </div>
            <button class="run-btn" :disabled="!canRunSimplify" @click="runSimplify">
                <Play :size="14" />
                执行分析
            </button>
        </div>

        <!-- 渔网分析参数 -->
        <div v-if="activeTool === 'fishnet'" class="params-section">
            <div class="param-group">
                <label class="param-label">四至范围</label>
                <div class="bbox-inputs">
                    <input v-model.number="fishnetMinLon" type="number" class="param-input bbox-input" placeholder="最小经度" step="0.1" />
                    <input v-model.number="fishnetMinLat" type="number" class="param-input bbox-input" placeholder="最小纬度" step="0.1" />
                    <input v-model.number="fishnetMaxLon" type="number" class="param-input bbox-input" placeholder="最大经度" step="0.1" />
                    <input v-model.number="fishnetMaxLat" type="number" class="param-input bbox-input" placeholder="最大纬度" step="0.1" />
                </div>
                <ExtentPicker
                    @extent-change="fillFishnetBbox"
                    @extent-clear="clearFishnetBbox"
                />
            </div>
            <div class="param-group">
                <label class="param-label">网格大小（米）<span class="required">*</span></label>
                <input
                    v-model.number="fishnetGridSize"
                    type="number"
                    class="param-input"
                    min="1"
                    max="1000000"
                    placeholder="例如：500"
                />
            </div>
            <div class="param-group">
                <label class="param-label">几何类型</label>
                <div class="overlay-mode-grid">
                    <button
                        class="mode-btn"
                        :class="{ active: fishnetGeometryType === 'polygon' }"
                        @click="fishnetGeometryType = 'polygon'"
                    >
                        面
                    </button>
                    <button
                        class="mode-btn"
                        :class="{ active: fishnetGeometryType === 'line' }"
                        @click="fishnetGeometryType = 'line'"
                    >
                        线
                    </button>
                </div>
            </div>
            <div class="param-group">
                <label class="param-label checkbox-label">
                    <input v-model="fishnetCreatePoints" type="checkbox" class="param-checkbox" />
                    创建渔网中心点
                </label>
            </div>
            <button class="run-btn" :disabled="!canRunFishnet" @click="runFishnet">
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
    Network,
    LayoutGrid,
    Target,
    Shrink,
    Grid3x3,
} from 'lucide-vue-next';
import ExtentPicker from '../Common/ExtentPicker.vue';
import { formatCoordinateValue } from '../../utils/coordinateFormatter';

const emit = defineEmits(['analysis', 'close']);

defineProps({
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
    {
        id: 'voronoi',
        label: '泰森多边形',
        description: '计算点集的最近邻服务范围',
        icon: Network,
        color: '#722ed1',
    },
    {
        id: 'aggregation',
        label: '空间聚合',
        description: '网格化统计离散点密度',
        icon: LayoutGrid,
        color: '#13c2c2',
    },
    {
        id: 'multiRingBuffer',
        label: '多环缓冲区',
        description: '生成多级同心环辐射圈',
        icon: Target,
        color: '#eb2f96',
    },
    {
        id: 'simplify',
        label: '几何简化',
        description: '抽稀复杂几何降低节点数',
        icon: Shrink,
        color: '#faad14',
    },
    {
        id: 'fishnet',
        label: '渔网分析',
        description: '在指定范围内生成规则网格',
        icon: Grid3x3,
        color: '#8b5cf6',
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

function runVoronoi() {
    if (!targetLayerId.value) return;
    emit('analysis', {
        type: 'voronoi',
        targetLayerId: targetLayerId.value,
    });
    showResult('success', '泰森多边形分析已提交');
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
    const gridLabel = gridType.value === 'hexbin' ? '六边形' : '方格';
    showResult('success', `${gridLabel}聚合分析已提交`);
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
    showResult('success', `多环缓冲区分析已提交（${distances.length} 环）`);
}

function runSimplify() {
    if (!canRunSimplify.value) return;
    emit('analysis', {
        type: 'simplify',
        targetLayerId: targetLayerId.value,
        tolerance: simplifyTolerance.value,
    });
    showResult('success', `几何简化分析已提交（容差 ${simplifyTolerance.value}m）`);
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
    const typeLabel = fishnetGeometryType.value === 'polygon' ? '面' : '线';
    const pointLabel = fishnetCreatePoints.value ? '含中心点' : '';
    showResult('success', `渔网分析已提交（${fishnetGridSize.value}m ${typeLabel} ${pointLabel}）`);
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
    border-color: var(--brand-accent);
    background: var(--bg-hover);
}

.analysis-item.active {
    border-color: var(--brand-accent);
    background: var(--bg-active);
    box-shadow: 0 2px 8px var(--bg-active);
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
    color: var(--text-primary);
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
    border: 1px solid var(--border-light);
    border-radius: 6px;
    font-size: 13px;
    background: white;
    color: var(--text-primary);
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
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: white;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.mode-btn:hover {
    border-color: var(--brand-accent);
    color: var(--brand-accent-muted);
}

.mode-btn.active {
    border-color: var(--brand-accent);
    background: linear-gradient(135deg, rgba(13, 151, 47, 0.1) 0%, var(--bg-active) 100%);
    color: var(--brand-accent-dark);
}

.run-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    background: linear-gradient(135deg, var(--brand-accent-dark) 0%, #0f995b 100%);
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
    color: var(--brand-primary-dark);
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
