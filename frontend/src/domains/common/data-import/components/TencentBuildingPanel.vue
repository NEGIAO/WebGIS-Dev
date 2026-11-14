<template>
    <div class="txb-panel">
        <div
            v-if="complianceDialogOpen"
            class="txb-dialog-backdrop"
            role="presentation"
            @click.self="resolveComplianceDialog(false)"
        >
            <section
                class="txb-dialog"
                role="dialog"
                aria-modal="true"
                :aria-labelledby="complianceDialogTitleId"
            >
                <h3
                    :id="complianceDialogTitleId"
                    class="txb-dialog-title"
                >
                    {{ t('shell.buildings.complianceTitle') }}
                </h3>
                <p class="txb-dialog-message">
                    {{ t('shell.buildings.compliancePopup') }}
                </p>
                <div class="txb-dialog-actions">
                    <button
                        type="button"
                        class="txb-btn txb-btn-ghost"
                        @click="resolveComplianceDialog(false)"
                    >
                        {{ t('shell.buildings.complianceCancel') }}
                    </button>
                    <button
                        type="button"
                        class="txb-btn txb-btn-primary"
                        @click="resolveComplianceDialog(true)"
                    >
                        {{ t('shell.buildings.complianceContinue') }}
                    </button>
                </div>
            </section>
        </div>

        <div class="txb-header">
            <span class="txb-header-icon">
                <Building2 :size="16" />
            </span>
            <div class="txb-header-text">
                <div class="txb-title">{{ isTianditu ? t('shell.buildings.vectorTitle') : t('shell.buildings.title') }}</div>
                <div class="txb-subtitle">{{ isTianditu
                    ? t('shell.buildings.vectorSubtitle', { engine: engineLabel })
                    : t('shell.buildings.subtitle', { engine: engineLabel }) }}</div>
            </div>
            <button
                type="button"
                class="txb-close"
                :aria-label="t('shell.buildings.close')"
                :title="t('shell.buildings.close')"
                @click="$emit('close')"
            >
                <X :size="14" />
            </button>
        </div>

        <div class="txb-body">
            <div
                class="txb-source-tabs"
                role="tablist"
            >
                <button
                    type="button"
                    class="txb-source-tab"
                    data-s="tencent"
                    :class="{ active: source === 'tencent' }"
                    :disabled="isFetching"
                    @click="source = 'tencent'"
                >
                    <Building2 :size="13" />
                    {{ t('shell.buildings.sourceTencent') }}
                </button>
                <button
                    type="button"
                    class="txb-source-tab"
                    data-s="amap"
                    :class="{ active: source === 'amap' }"
                    :disabled="isFetching"
                    @click="source = 'amap'"
                >
                    <MapPin :size="13" />
                    {{ t('shell.buildings.sourceAmap') }}
                </button>
                <button
                    type="button"
                    class="txb-source-tab"
                    data-s="tianditu"
                    :class="{ active: source === 'tianditu' }"
                    :disabled="isFetching"
                    @click="source = 'tianditu'"
                >
                    <MapPin :size="13" />
                    {{ t('shell.buildings.sourceTianditu') }}
                </button>
            </div>
            <div class="txb-source-desc">
                {{ isAmap ? t('shell.buildings.sourceDescAmap') : (isTianditu ? t('shell.buildings.sourceDescTianditu') : t('shell.buildings.sourceDescTencent')) }}
            </div>
            <!-- 临时凭证（可选）：留空即用管理端 L2 配置。
                 刻意不用 type="password" —— Chrome 密码管理器对 password 字段忽略
                 autocomplete="off"，会把本 origin 保存的登录密码自动填入（凭据库按 origin
                 索引，与会话身份无关，游客态下同样会填管理员密码），该值曾以 ?key= / ?tk=
                 明文发往第三方。改用 text + CSS 遮蔽后，密码管理器不再将其识别为凭据框。 -->
            <label class="txb-field txb-token-field">
                <span>{{ isTianditu ? t('shell.buildings.tiandituTk') : (isAmap ? t('shell.buildings.amapKey') : t('shell.buildings.sourceCredential')) }}</span>
                <input
                    v-model="sourceCredential"
                    type="text"
                    class="txb-credential-input"
                    :name="`map-source-credential-${source}`"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    :placeholder="isTianditu
                        ? t('shell.buildings.tiandituTkPlaceholder')
                        : (isAmap ? t('shell.buildings.amapKeyPlaceholder') : t('shell.buildings.sourceCredentialTencentPlaceholder'))"
                />
            </label>
            <div class="txb-section-title">{{ t('shell.buildings.range') }}</div>
            <div class="txb-grid">
                <label class="txb-field">
                    <span>{{ t('shell.buildings.minLng') }}</span>
                    <input
                        v-model="form.minLng"
                        type="number"
                        step="0.0001"
                        placeholder="112.00"
                    />
                </label>
                <label class="txb-field">
                    <span>{{ t('shell.buildings.minLat') }}</span>
                    <input
                        v-model="form.minLat"
                        type="number"
                        step="0.0001"
                        placeholder="32.00"
                    />
                </label>
                <label class="txb-field">
                    <span>{{ t('shell.buildings.maxLng') }}</span>
                    <input
                        v-model="form.maxLng"
                        type="number"
                        step="0.0001"
                        placeholder="112.05"
                    />
                </label>
                <label class="txb-field">
                    <span>{{ t('shell.buildings.maxLat') }}</span>
                    <input
                        v-model="form.maxLat"
                        type="number"
                        step="0.0001"
                        placeholder="32.05"
                    />
                </label>
            </div>

            <div class="txb-row">
                <label class="txb-zoom">
                    <span>{{ t('shell.buildings.zoom') }}</span>
                    <select
                        v-if="!isAmap"
                        v-model.number="zoom"
                    >
                        <option
                            v-for="z in zoomOptions"
                            :key="z"
                            :value="z"
                        >
                            z{{ z }}
                        </option>
                    </select>
                    <span
                        v-else
                        class="txb-zoom-fixed"
                    >z14（{{ t('shell.buildings.zoomFixed') }}）</span>
                </label>
            </div>

            <!-- 天地图全量：多选勾选（含全选），腾讯/高德 tab 不渲染 -->
            <div
                v-if="isTianditu"
                class="txb-layers"
            >
                <div class="txb-section-title">{{ t('shell.buildings.vectorLayers') }}</div>
                <label class="txb-layer-all">
                    <input
                        type="checkbox"
                        :checked="allVectorLayersChecked"
                        :disabled="isFetching"
                        @change="toggleAllVectorLayers"
                    />
                    <span>{{ t('shell.buildings.vectorLayersAll') }}</span>
                </label>
                <div class="txb-layer-grid">
                    <label
                        v-for="opt in vectorLayerOptions"
                        :key="opt.value"
                        class="txb-layer-item"
                        :title="opt.desc"
                    >
                        <input
                            type="checkbox"
                            :value="opt.value"
                            :checked="selectedLayerList.includes(opt.value)"
                            :disabled="isFetching"
                            @change="toggleVectorLayer(opt.value)"
                        />
                        <span>{{ opt.label }}</span>
                    </label>
                </div>
                <div
                    v-if="!selectedLayerList.length"
                    class="txb-layer-hint"
                >
                    {{ t('shell.buildings.vectorLayersEmpty') }}
                </div>
            </div>

            <!-- 框选：OL 用 DragBox 自包含组件，Cesium 用三维拾取镜像版 -->
            <ExtentPicker
                v-if="activeEngine !== 'cesium'"
                :disabled="isFetching"
                @extent-change="onExtentPicked"
                @extent-clear="clearFormBbox"
            />
            <CesiumExtentPicker
                v-else
                :get-viewer="getCesiumViewer"
                :get-cesium="getCesium"
                :disabled="isFetching"
                @extent-change="onExtentPicked"
                @extent-clear="clearFormBbox"
            />

            <div
                v-if="estimate"
                class="txb-estimate"
            >
                {{ t('shell.buildings.estimate', { tiles: estimate.tiles, batches: estimate.batches, seconds: estimate.seconds }) }}
            </div>

            <div class="txb-actions">
                <button
                    v-if="!isFetching"
                    type="button"
                    class="txb-btn txb-btn-primary"
                    :disabled="!canFetch"
                    @click="onFetch"
                >
                    <Building2 :size="14" />
                    {{ isTianditu ? t('shell.buildings.vectorFetch') : t('shell.buildings.fetch') }}
                </button>
                <button
                    v-else
                    type="button"
                    class="txb-btn txb-btn-danger"
                    @click="cancel"
                >
                    <X :size="14" />
                    {{ t('shell.buildings.cancel') }}
                </button>
            </div>

            <div
                v-if="isFetching"
                class="txb-progress"
            >
                <div class="txb-progress-track">
                    <div
                        class="txb-progress-fill"
                        :style="{ width: progressPercent + '%' }"
                    ></div>
                </div>
                <div class="txb-progress-text">
                    {{ t('shell.buildings.progress', { done: progress.done, total: progress.total, count: progress.count }) }}
                </div>
            </div>

            <div
                v-if="errorText"
                class="txb-error"
            >
                <TriangleAlert :size="14" />
                <span>{{ errorText }}</span>
            </div>

            <div
                v-if="status === 'done' && result"
                class="txb-result"
            >
                <div class="txb-result-text">
                    {{ isTiandituVectorResult
                        ? t('shell.buildings.vectorResult', { count: result.featureCount, seconds: (result.elapsedMs / 1000).toFixed(1), layers: vectorLayerCount })
                        : t('shell.buildings.result', { count: result.featureCount, seconds: (result.elapsedMs / 1000).toFixed(1) }) }}
                </div>
                <!-- 全量分层明细：每层要素数（供用户核对各层产出，层数由字典决定） -->
                <ul
                    v-if="isTiandituVectorResult"
                    class="txb-vector-stats"
                >
                    <li
                        v-for="(_stat, code) in result.layerStats"
                        :key="code"
                    >
                        {{ code }} · {{ vectorLayerLabel(code) }}：{{ layerFeatureCount(code) }}
                    </li>
                </ul>
                <div
                    v-if="!result.featureCount"
                    class="txb-empty"
                >
                    {{ t('shell.buildings.empty') }}
                </div>
                <div class="txb-actions">
                    <button
                        type="button"
                        class="txb-btn txb-btn-ghost"
                        @click="downloadResult"
                    >
                        <Download :size="14" />
                        {{ t('shell.buildings.download') }}
                    </button>
                </div>
            </div>

            <div class="txb-compliance">
                <label class="txb-compliance-check">
                    <input
                        v-model="complianceAccepted"
                        type="checkbox"
                    />
                    <span>{{ t('shell.buildings.complianceAgree') }}</span>
                </label>
                <ul class="txb-compliance-list">
                    <li>{{ t('shell.buildings.complianceRuleAuth') }}</li>
                    <li>{{ t('shell.buildings.complianceRuleBulk') }}</li>
                    <li>{{ t('shell.buildings.complianceRuleNoBypass') }}</li>
                    <li>{{ t('shell.buildings.complianceRuleTerms') }}</li>
                </ul>
            </div>

            <div class="txb-note">
                {{ isAmap ? t('shell.buildings.disclaimerAmap') : (isTianditu ? t('shell.buildings.disclaimerTianditu') : t('shell.buildings.disclaimer')) }}
            </div>
        </div>
    </div>
</template>

<script lang="ts" src="./TencentBuildingPanel.ts"></script>

<style scoped>
/* 主题语言：白卡片 + 浅绿边框 + 品牌渐变头（与 DrawPanel/TopBar 一致） */
.txb-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    color: var(--toc-text-primary);
    font-size: 12px;
}

.txb-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--brand-gradient);
    color: #ffffff;
}

.txb-header-icon {
    display: inline-flex;
    flex-shrink: 0;
}

.txb-header-text {
    flex: 1;
    min-width: 0;
}

.txb-title {
    font-size: 13px;
    font-weight: 700;
}

.txb-subtitle {
    font-size: 11px;
    opacity: 0.85;
}

.txb-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
    color: #ffffff;
    cursor: pointer;
}

.txb-close:hover {
    background: rgba(255, 255, 255, 0.32);
}

.txb-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 10px;
    background: #ffffff;
}

.txb-section-title {
    color: var(--brand-accent-dark);
    font-size: 12px;
    font-weight: 700;
}

.txb-source-tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 9px;
    background: rgba(var(--brand-primary-rgb), 0.08);
}

.txb-source-tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 6px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--toc-text-secondary);
    font-size: 12px;
    cursor: pointer;
}

.txb-source-tab.active {
    background: #ffffff;
    color: var(--brand-accent-dark);
    font-weight: 700;
    box-shadow: 0 1px 3px rgba(var(--brand-primary-dark-rgb), 0.18);
}

/* 高德 tab 用绿色系区分（腾讯保持品牌蓝） */
.txb-source-tab.active[data-s="amap"] {
    background: #f0fdf4;
    color: #15803d;
}

.txb-source-desc {
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--toc-primary-bg);
    color: var(--toc-text-secondary);
    font-size: 11px;
    line-height: 1.5;
}

.txb-source-tab:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

/* 全量多选：全选行 + 图层两列勾选（层数由 tdtVectorLayers 字典决定，与范围表单同语言） */
.txb-layers {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 8px;
    background: rgba(var(--brand-primary-rgb), 0.04);
}

.txb-layer-all {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--toc-text-primary);
    font-size: 12px;
    font-weight: 700;
}

.txb-layer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 8px;
}

.txb-layer-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--toc-text-secondary);
    font-size: 11px;
    line-height: 1.4;
}

.txb-layer-hint {
    color: var(--danger);
    font-size: 11px;
    line-height: 1.4;
}

.txb-vector-stats {
    margin: 6px 0 0;
    padding-left: 16px;
    color: var(--toc-text-secondary);
    font-size: 11px;
    line-height: 1.6;
}

.txb-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
}

.txb-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-field input,
.txb-zoom select {
    height: 28px;
    padding: 0 8px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.25);
    border-radius: 8px;
    background: #fff;
    color: var(--toc-text-primary, #333);
    font-size: 12px;
    outline: none;
}

.txb-field input:focus,
.txb-zoom select:focus {
    border-color: var(--brand-primary);
}

/* 凭证框遮蔽：用 text + CSS 文本遮蔽替代 type="password"。
   password 类型会被浏览器密码管理器强行填充（autocomplete="off" 对其无效），
   改为 text 后不再被识别为登录凭据框；Firefox 不支持该属性，退化为明文显示。 */
.txb-credential-input {
    -webkit-text-security: disc;
    letter-spacing: 1px;
}

.txb-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
}

.txb-zoom {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-zoom-fixed {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 8px;
    color: var(--toc-text-secondary);
    font-size: 12px;
}

.txb-estimate {
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-actions {
    display: flex;
    gap: 8px;
}

.txb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
}

.txb-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.txb-btn-primary {
    background: var(--brand-gradient);
    color: #ffffff;
}

.txb-btn-primary:hover:not(:disabled) {
    filter: brightness(1.06);
}

.txb-btn-ghost {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.25);
    background: #ffffff;
    color: var(--brand-accent-dark);
}

.txb-btn-ghost:hover:not(:disabled) {
    background: var(--toc-primary-bg-hover);
}

.txb-btn-danger {
    background: rgba(var(--danger-rgb), 0.12);
    color: var(--danger);
}

.txb-progress-track {
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: rgba(var(--brand-primary-rgb), 0.12);
}

.txb-progress-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--brand-gradient);
    transition: width 0.2s ease;
}

.txb-progress-text {
    margin-top: 4px;
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(var(--danger-rgb), 0.08);
    color: var(--danger);
    font-size: 11px;
}

.txb-result-text {
    color: var(--brand-accent-dark);
    font-weight: 600;
}

.txb-empty {
    margin-top: 2px;
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-note {
    color: var(--toc-text-light);
    font-size: 11px;
    line-height: 1.5;
}

.txb-dialog-backdrop {
    position: fixed;
    z-index: var(--z-modal-high);
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(15, 23, 42, 0.46);
}

.txb-dialog {
    width: min(440px, 100%);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 12px;
    background: var(--toc-bg-dialog, #ffffff);
    box-shadow: var(--toc-shadow-dialog, 0 16px 48px rgba(15, 23, 42, 0.24));
    padding: 18px;
}

.txb-dialog-title {
    margin: 0 0 10px;
    color: var(--toc-text-primary);
    font-size: 16px;
}

.txb-dialog-message {
    margin: 0;
    color: var(--toc-text-secondary);
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-line;
}

.txb-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
}

.txb-compliance {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 8px;
    background: rgba(var(--brand-primary-rgb), 0.06);
    padding: 8px 10px;
}

.txb-compliance-check {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-bottom: 6px;
    color: var(--toc-text-primary);
    line-height: 1.5;
}

.txb-compliance-check input {
    margin-top: 2px;
}

.txb-compliance-list {
    margin: 0;
    padding-left: 16px;
    color: var(--toc-text-secondary);
    line-height: 1.5;
}

@media (max-width: 768px) {
    .txb-panel {
        padding: 10px;
    }

    .txb-btn {
        min-height: 36px;
        font-size: 13px;
    }
}
</style>
