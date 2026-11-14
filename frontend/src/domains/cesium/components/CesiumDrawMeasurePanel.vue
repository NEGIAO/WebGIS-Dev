<template>
    <div class="cesium-dm-panel">
        <div class="panel-header">
            <span class="panel-title">{{ title }}</span>
            <button class="close-btn" :title="t('common.close')" @click="$emit('close')">
                <X :size="14" />
            </button>
        </div>

        <div class="panel-body">
            <!-- 工具 -->
            <section class="tool-section">
                <div class="section-title">{{ groupLabel }}</div>
                <div class="tool-grid">
                    <button
                        v-for="tool in tools"
                        :key="tool.type"
                        class="tool-btn"
                        :class="{ active: activeType === tool.type }"
                        :title="t(`cesium.drawMeasure.hints.${tool.type}`)"
                        @click="selectTool(tool.type)"
                    >
                        <component :is="tool.icon" :size="16" />
                        <span class="tool-label">{{ t(`cesium.drawMeasure.tools.${tool.type}`) }}</span>
                    </button>
                </div>
            </section>

            <!-- 测量项 -->
            <section class="option-section">
                <div class="section-title">{{ t('cesium.drawMeasure.options.title') }}</div>
                <label class="check-row">
                    <input
                        type="checkbox"
                        :checked="measureOptions.measure"
                        @change="toggleOption('measure', $event)"
                    />
                    <span>{{ t('cesium.drawMeasure.options.measure') }}</span>
                </label>
                <label class="check-row" :class="{ disabled: subOptionsDisabled }">
                    <input
                        type="checkbox"
                        :disabled="subOptionsDisabled"
                        :checked="measureOptions.showArea"
                        @change="toggleOption('showArea', $event)"
                    />
                    <span>{{ t('cesium.drawMeasure.options.area') }}</span>
                </label>
                <label class="check-row" :class="{ disabled: subOptionsDisabled }">
                    <input
                        type="checkbox"
                        :disabled="subOptionsDisabled"
                        :checked="measureOptions.showPerimeter"
                        @change="toggleOption('showPerimeter', $event)"
                    />
                    <span>{{ t('cesium.drawMeasure.options.perimeter') }}</span>
                </label>
            </section>

            <!-- 结果读数 -->
            <section v-if="lastResult" class="result-section">
                <div class="section-title">
                    {{ t('cesium.drawMeasure.result.title') }}
                    <span class="type-chip">{{ t(`cesium.drawMeasure.tools.${lastResult.type}`) }}</span>
                </div>
                <div v-if="!rows.length" class="empty-tip">
                    {{ t('cesium.drawMeasure.result.drawOnly') }}
                </div>
                <div v-for="row in rows" :key="row.label" class="result-row">
                    <span class="result-label">{{ row.label }}</span>
                    <span class="result-value" :class="{ accent: row.accent }">{{ row.value }}</span>
                </div>
                <div class="result-actions">
                    <button class="mini-btn" @click="copyCoords">
                        <Copy :size="12" />
                        <span>{{ t('cesium.drawMeasure.actions.copy') }}</span>
                    </button>
                    <button class="mini-btn" @click="exportGeoJson">
                        <Download :size="12" />
                        <span>{{ t('cesium.drawMeasure.actions.export') }}</span>
                    </button>
                </div>
            </section>

            <!-- 测量记录 -->
            <section v-if="records.length" class="record-section">
                <div class="section-title">
                    {{ t('cesium.drawMeasure.records.title') }}（{{ records.length }}）
                </div>
                <div v-for="record in records" :key="record.id" class="record-item">
                    <b>{{ record.name }}</b> — {{ record.summary }}
                </div>
                <button class="link-btn" @click="clearRecords">
                    {{ t('cesium.drawMeasure.records.clear') }}
                </button>
            </section>

            <!-- 样式（仅绘制面板） -->
            <section v-if="variant === 'draw'" class="style-section">
                <div class="section-title">{{ t('cesium.drawMeasure.style.title') }}</div>

                <div class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.outlineColor') }}</label>
                    <input
                        type="color"
                        class="color-input"
                        :value="style.outlineColor"
                        @input="onStyleColorInput('outlineColor', $event)"
                    />
                </div>
                <div class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.outlineWidth') }}</label>
                    <input
                        type="range"
                        class="range-input"
                        min="1"
                        max="10"
                        step="0.5"
                        :value="style.outlineWidth"
                        @input="onStyleNumberInput('outlineWidth', $event)"
                    />
                    <span class="range-value">{{ style.outlineWidth }}px</span>
                </div>
                <div class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.fillColor') }}</label>
                    <input
                        type="color"
                        class="color-input"
                        :value="style.fillColor"
                        @input="onStyleColorInput('fillColor', $event)"
                    />
                </div>
                <div class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.fillOpacity') }}</label>
                    <input
                        type="range"
                        class="range-input"
                        min="0"
                        max="1"
                        step="0.05"
                        :value="style.fillOpacity"
                        @input="onStyleNumberInput('fillOpacity', $event)"
                    />
                    <span class="range-value">{{ Math.round(style.fillOpacity * 100) }}%</span>
                </div>
                <label class="check-row">
                    <input
                        type="checkbox"
                        :checked="style.showVertices"
                        @change="onStyleCheckChange('showVertices', $event)"
                    />
                    <span>{{ t('cesium.drawMeasure.style.showVertices') }}</span>
                </label>
                <div v-if="style.showVertices" class="style-row">
                    <label>{{ t('cesium.drawMeasure.style.vertexSize') }}</label>
                    <input
                        type="range"
                        class="range-input"
                        min="3"
                        max="20"
                        step="1"
                        :value="style.vertexSize"
                        @input="onStyleNumberInput('vertexSize', $event)"
                    />
                    <span class="range-value">{{ style.vertexSize }}</span>
                </div>
            </section>

            <!-- 动作 -->
            <div class="panel-actions">
                <template v-if="drawing">
                    <button class="action-btn" @click="$emit('action', 'finish')">
                        <Play :size="13" />
                        <span>{{ t('cesium.drawMeasure.actions.finish') }}</span>
                    </button>
                    <button class="action-btn" @click="$emit('action', 'cancel')">
                        <Ban :size="13" />
                        <span>{{ t('cesium.drawMeasure.actions.cancel') }}</span>
                    </button>
                </template>
                <button class="action-btn" @click="$emit('action', 'undo')">
                    <Undo2 :size="13" />
                    <span>{{ t('cesium.drawMeasure.actions.undo') }}</span>
                </button>
                <button class="action-btn" @click="$emit('action', 'flyTo')">
                    <Maximize :size="13" />
                    <span>{{ t('cesium.drawMeasure.actions.flyTo') }}</span>
                </button>
                <button class="action-btn clear-btn" @click="$emit('action', 'clear')">
                    <Eraser :size="13" />
                    <span>{{ t('cesium.drawMeasure.actions.clear') }}</span>
                </button>
            </div>
        </div>

        <div class="panel-hint">
            <Info :size="12" />
            <span>{{ hint }}</span>
        </div>
    </div>
</template>

<script lang="ts" src="./CesiumDrawMeasurePanel.ts"></script>

<style scoped>
.cesium-dm-panel {
    width: 230px;
    bottom: 15px;
    max-height: calc(100vh - 110px);
    display: flex;
    flex-direction: column;
    background: var(--panel-bg);
    backdrop-filter: blur(12px);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.12);
    overflow: hidden;
    animation: dmSlideIn 0.2s ease-out;
}

@keyframes dmSlideIn {
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
    color: #fff;
    flex: none;
}

.panel-title {
    font-size: 13px;
    font-weight: 600;
}

.close-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    cursor: pointer;
    transition: background 0.2s;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.4);
}

.panel-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 12px 12px;
}

.section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin: 4px 0 6px;
    color: var(--text-secondary, #6b7280);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
}

.type-chip {
    padding: 1px 7px;
    border-radius: 9px;
    background: rgba(var(--brand-accent-rgb), 0.12);
    color: var(--brand-accent-dark);
    font-size: 10px;
    font-weight: 600;
}

.tool-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
}

.tool-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 4px;
    border: 2px solid var(--bg-brand-light);
    border-radius: 8px;
    background: #fff;
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
    line-height: 1.2;
}

.check-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    color: var(--text-brand, #374151);
    font-size: 12px;
    cursor: pointer;
}

.check-row.disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.check-row input {
    width: 14px;
    height: 14px;
    accent-color: var(--brand-accent);
}

.result-section,
.record-section,
.style-section,
.option-section {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--bg-brand-light);
}

.result-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px dashed var(--bg-brand-light);
    font-size: 12px;
}

.result-label {
    flex: none;
    color: var(--text-secondary, #6b7280);
}

.result-value {
    color: var(--text-primary, #111827);
    font-weight: 600;
    text-align: right;
    word-break: break-all;
}

.result-value.accent {
    color: var(--brand-accent-dark);
}

.empty-tip {
    padding: 6px 0;
    color: var(--text-secondary, #6b7280);
    font-size: 11px;
    line-height: 1.6;
}

.result-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
}

.mini-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 5px 0;
    border: 1px solid var(--bg-brand-light);
    border-radius: 6px;
    background: #fff;
    color: var(--text-brand, #374151);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
}

.mini-btn:hover {
    border-color: var(--brand-accent);
    color: var(--brand-accent-dark);
}

.record-item {
    padding: 4px 0;
    border-bottom: 1px dashed var(--bg-brand-light);
    color: var(--text-secondary, #6b7280);
    font-size: 11px;
    line-height: 1.5;
}

.record-item b {
    color: var(--brand-accent-dark);
}

.link-btn {
    margin-top: 6px;
    border: none;
    background: none;
    color: var(--brand-accent);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 0;
}

.link-btn:hover {
    text-decoration: underline;
}

.style-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
    color: var(--text-brand, #374151);
}

.style-row label {
    flex: none;
    width: 72px;
    color: var(--text-secondary, #6b7280);
    font-size: 11px;
}

.color-input {
    width: 32px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--bg-brand-light);
    border-radius: 4px;
    background: none;
    cursor: pointer;
}

.range-input {
    flex: 1;
    min-width: 0;
    accent-color: var(--brand-accent);
}

.range-value {
    flex: none;
    min-width: 34px;
    text-align: right;
    font-size: 11px;
    color: var(--text-secondary, #6b7280);
}

.panel-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 10px;
}

.action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 4px;
    border: 1px solid var(--bg-brand-light);
    border-radius: 6px;
    background: #fff;
    color: var(--text-brand, #374151);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover {
    border-color: var(--brand-accent);
    color: var(--brand-accent-dark);
}

.clear-btn {
    border-color: var(--danger-light);
    background: rgba(var(--danger-rgb), 0.06);
    color: var(--danger);
}

.clear-btn:hover {
    background: rgba(var(--danger-rgb), 0.12);
    border-color: rgba(var(--danger-rgb), 0.35);
    color: var(--danger);
}

.panel-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(var(--brand-primary-rgb), 0.04);
    border-top: 1px solid var(--bg-brand-light);
    color: var(--text-brand);
    font-size: 11px;
    line-height: 1.5;
    flex: none;
}

/* ── 移动端基线（Force_command §3：判据用触屏能力，不用宽度断点） ── */
@media (pointer: coarse) {
    .cesium-dm-panel {
        width: min(226px, calc(100vw - 96px));
        max-height: calc(100vh - 150px);
    }

    .tool-btn,
    .action-btn,
    .mini-btn {
        min-height: 40px;
    }

    .tool-btn {
        padding: 10px 4px;
    }

    .check-row {
        min-height: 36px;
    }

    .color-input {
        width: 40px;
        height: 32px;
    }
}
</style>
