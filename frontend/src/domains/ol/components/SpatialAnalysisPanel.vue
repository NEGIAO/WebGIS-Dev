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
            <CheckCircle2 v-if="resultType === 'success'" :size="14" />
            <AlertCircle v-else :size="14" />
            <span>{{ resultMessage }}</span>
        </div>

        <div class="panel-hint">
            <Info :size="12" />
            <span>{{ t('spatial.resultHint') }}</span>
        </div>
        </div>
    </div>
</template>

<script lang="ts" src="./SpatialAnalysisPanel.ts"></script>

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


