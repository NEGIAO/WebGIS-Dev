<template>
    <div
        v-if="visible"
        class="aoi-dialog-inline"
    >
        <div
            class="aoi-dialog-card"
            role="dialog"
            aria-modal="false"
            :aria-label="t('layer.aoiInjectTitle')"
        >
            <div class="aoi-dialog-head">
                <div class="aoi-dialog-title">{{ t('layer.aoiInjectTitle') }}</div>
                <button
                    class="aoi-dialog-close"
                    type="button"
                    @click="emit('close')"
                >
                    ×
                </button>
            </div>

            <div class="aoi-dialog-tip">
                {{ t('layer.aoiRecommend') }}<br />
                {{ t('layer.aoiMethod2Note') }}
            </div>

            <div class="aoi-dialog-row">
                <label class="aoi-dialog-label">POI ID</label>
                <input
                    :value="poiId"
                    class="aoi-dialog-input"
                    type="text"
                    :placeholder="t('layer.poiIdPlaceholder')"
                    @input="onPoiIdInput"
                />
            </div>

            <!-- ============================================== -->
            <!-- 方式1：官方无Key接口 → 打开浏览器复制（推荐） -->
            <!-- ============================================== -->
            <div class="aoi-dialog-row aoi-dialog-actions-row">
                <button
                    class="aoi-dialog-btn"
                    type="button"
                    @click="openOfficialDetail"
                >
                    {{ t('layer.aoiMethod1') }}
                </button>
                <a
                    class="aoi-dialog-link"
                    :href="officialDetailUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {{ officialDetailUrl }}
                </a>
            </div>

            <!-- ============================================== -->
            <!-- 方式2：AOI边界接口 → 本地安全生成（不请求） -->
            <!-- ============================================== -->
            <div class="aoi-dialog-row aoi-dialog-actions-row">
                <button
                    class="aoi-dialog-btn"
                    type="button"
                    @click="getAoiBoundarySafe"
                >
                    {{ t('layer.aoiMethod2') }}
                </button>
                <a
                    class="aoi-dialog-link"
                    :href="aoiRequestUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {{ aoiRequestUrl }}
                </a>
            </div>

            <div class="aoi-dialog-row">
                <div class="aoi-dialog-row-head">
                    <div class="aoi-dialog-label-group">
                        <label class="aoi-dialog-label">{{ t('layer.aoiLabel') }}</label>
                        <span
                            class="aoi-dialog-help"
                            :title="t('layer.aoiHint')"
                            :aria-label="t('layer.aoiHintAria')"
                        >
                            ?
                        </span>
                    </div>
                    <button
                        class="aoi-dialog-mini-btn"
                        type="button"
                        @click="handlePasteJson"
                    >
                        {{ t('layer.pasteJson') }}
                    </button>
                </div>
                <textarea
                    :value="jsonText"
                    class="aoi-dialog-textarea"
                    :placeholder="t('layer.aoiTextareaPlaceholder')"
                    @input="onJsonTextInput"
                ></textarea>
            </div>

            <div
                v-if="sourceLayerName"
                class="aoi-dialog-source"
            >
                {{ t('layer.sourceLayer', { name: sourceLayerName }) }}
            </div>
            <div
                v-if="errorMessage"
                class="aoi-dialog-error"
            >
                {{ errorMessage }}
            </div>

            <div class="aoi-dialog-foot">
                <button
                    class="aoi-dialog-btn aoi-dialog-btn-primary"
                    type="button"
                    @click="emit('submit')"
                >
                    {{ t('layer.parseAndDraw') }}
                </button>
                <button
                    class="aoi-dialog-btn aoi-dialog-btn-ghost"
                    type="button"
                    @click="emit('close')"
                >
                    {{ t('common.cancel') }}
                </button>
            </div>
        </div>
    </div>
</template>

<script lang="ts" src="./AmapAoiInjectDialog.ts"></script>

<style scoped>
/* 的原有样式，完全不变 */
.aoi-dialog-inline {
    margin: 10px 0 12px;
}

.aoi-dialog-card {
    max-height: unset;
    overflow: auto;
    border-radius: 12px;
    background: linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-brand-light) 100%);
    border: 1px solid rgba(38, 122, 78, 0.22);
    box-shadow: 0 10px 24px rgba(36, 105, 67, 0.16);
    padding: 14px;
}

.aoi-dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.aoi-dialog-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-brand-dark);
}

.aoi-dialog-close {
    border: none;
    background: transparent;
    color: var(--text-brand);
    font-size: 20px;
    cursor: pointer;
}

.aoi-dialog-tip {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: 10px;
}

.aoi-dialog-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
}

.aoi-dialog-label {
    font-size: 12px;
    color: var(--text-brand-dark);
    font-weight: 600;
}

.aoi-dialog-label-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.aoi-dialog-help {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid rgba(24, 144, 255, 0.35);
    background: rgba(24, 144, 255, 0.08);
    color: #1677ff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    cursor: help;
    user-select: none;
    flex-shrink: 0;
}

.aoi-dialog-help:hover {
    border-color: rgba(24, 144, 255, 0.6);
    background: rgba(24, 144, 255, 0.14);
}

.aoi-dialog-input,
.aoi-dialog-textarea {
    width: 100%;
    border: 1px solid var(--border-brand-light);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    color: var(--text-brand-dark);
    background: #ffffff;
    box-sizing: border-box;
}

.aoi-dialog-textarea {
    min-height: 170px;
    resize: vertical;
    line-height: 1.5;
}

.aoi-dialog-input:focus,
.aoi-dialog-textarea:focus {
    outline: none;
    border-color: var(--brand-accent);
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.16);
}

.aoi-dialog-actions-row {
    gap: 8px;
}

.aoi-dialog-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.aoi-dialog-mini-btn {
    border: 1px solid var(--border-brand);
    border-radius: 6px;
    background: var(--bg-brand-light);
    color: var(--text-brand-dark);
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
}

.aoi-dialog-mini-btn:hover {
    border-color: var(--border-brand);
    background: var(--bg-brand-light);
}

.aoi-dialog-link {
    display: inline-block;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-brand);
    word-break: break-all;
}

.aoi-dialog-source {
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 8px;
}

.aoi-dialog-error {
    color: var(--danger);
    font-size: 12px;
    margin-bottom: 8px;
}

.aoi-dialog-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.aoi-dialog-btn {
    border: 1px solid var(--border-brand);
    border-radius: 8px;
    background: var(--bg-brand-light);
    color: var(--text-brand-dark);
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
}

.aoi-dialog-btn:hover {
    border-color: var(--border-brand);
    background: var(--bg-brand-light);
}

.aoi-dialog-btn-primary {
    border-color: var(--brand-accent);
    background: var(--brand-accent);
    color: #ffffff;
}

.aoi-dialog-btn-primary:hover {
    border-color: var(--brand-accent-dark);
    background: var(--brand-accent-dark);
}

.aoi-dialog-btn-ghost {
    background: #ffffff;
}

@media (max-width: 768px) {
    .aoi-dialog-card {
        padding: 12px;
    }

    .aoi-dialog-foot {
        flex-direction: column;
    }

    .aoi-dialog-btn {
        width: 100%;
    }
}
</style>
