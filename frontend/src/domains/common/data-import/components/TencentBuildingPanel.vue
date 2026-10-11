<template>
    <div class="txb-panel">
        <div class="txb-header">
            <span class="txb-header-icon">
                <Building2 :size="16" />
            </span>
            <div class="txb-header-text">
                <div class="txb-title">{{ t('shell.buildings.title') }}</div>
                <div class="txb-subtitle">{{ t('shell.buildings.subtitle', { engine: engineLabel }) }}</div>
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
                    <select v-model.number="zoom">
                        <option
                            v-for="z in zoomOptions"
                            :key="z"
                            :value="z"
                        >
                            z{{ z }}
                        </option>
                    </select>
                </label>
            </div>

            <!-- 框选：OL 用 DragBox 自包含组件，Cesium 用三维拾取镜像版 -->
            <ExtentPicker
                v-if="props.activeEngine !== 'cesium'"
                :disabled="isFetching"
                @extent-change="onExtentPicked"
            />
            <CesiumExtentPicker
                v-else
                :get-viewer="props.getCesiumViewer"
                :get-cesium="props.getCesium"
                :disabled="isFetching"
                @extent-change="onExtentPicked"
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
                    {{ t('shell.buildings.fetch') }}
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
                    {{ t('shell.buildings.result', { count: result.featureCount, seconds: (result.elapsedMs / 1000).toFixed(1) }) }}
                </div>
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

            <div class="txb-note">
                {{ t('shell.buildings.disclaimer') }}
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import {
    Building2,
    Download,
    TriangleAlert,
    X,
} from '@lucide/vue';
import ExtentPicker from '@common/components/ExtentPicker.vue';
import CesiumExtentPicker from '@common/components/CesiumExtentPicker.vue';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import {
    TXB_DEFAULT_ZOOM,
    TXB_ZOOM_OPTIONS,
    estimateTxbTiles,
    useTencentBuildingFetch,
} from '../useTencentBuildingFetch';

/**
 * 腾讯建筑白模抓取面板：范围表单 + 抓取进度 + 入库/下载。
 * 入库经 upload-data 事件交上层按引擎路由（ OL / Cesium 自动进 TOC 对应分组）。
 */
const props = defineProps({
    /** 返回 Cesium Viewer（3D 框选，HomeView 经 SidePanel 注入） */
    getCesiumViewer: {
        type: Function,
        default: null,
    },
    /** 返回 Cesium 命名空间（3D 框选） */
    getCesium: {
        type: Function,
        default: null,
    },
    /** 当前引擎 'ol' | 'cesium'（决定用哪种框选） */
    activeEngine: {
        type: String,
        default: 'ol',
    },
});

const emit = defineEmits(['upload-data', 'close']);

const { t } = useLocale();
const message = useMessage();
const {
    status,
    isFetching,
    progress,
    error,
    result,
    fileName,
    startFetch,
    cancel,
    buildImportFile,
    downloadResult,
} = useTencentBuildingFetch();

const form = reactive({ minLng: '', minLat: '', maxLng: '', maxLat: '' });
const zoom = ref(TXB_DEFAULT_ZOOM);
const zoomOptions = TXB_ZOOM_OPTIONS;

/** 解析表单为数值 bbox，非法返回 null */
function parsedBbox() {
    const bbox = {
        minLng: Number.parseFloat(form.minLng),
        minLat: Number.parseFloat(form.minLat),
        maxLng: Number.parseFloat(form.maxLng),
        maxLat: Number.parseFloat(form.maxLat),
    };
    if (Object.values(bbox).some((v) => !Number.isFinite(v))) return null;
    return bbox;
}

const engineLabel = computed(() => (props.activeEngine === 'cesium' ? '3D' : '2D'));

/** 抓取量估算（输入合法时显示，防手滑拉全城） */
const estimate = computed(() => {
    const bbox = parsedBbox();
    if (!bbox) return null;
    try {
        return estimateTxbTiles(bbox, zoom.value);
    } catch {
        return null;
    }
});

const canFetch = computed(() => !!parsedBbox() && !isFetching.value);

const progressPercent = computed(() => {
    if (!progress.value.total) return 0;
    return Math.round((progress.value.done / progress.value.total) * 100);
});

/** 错误码转文案（composable 只抛短码，文案归 i18n） */
const errorText = computed(() => {
    if (!error.value) return '';
    const known = ['empty', 'nan', 'order', 'range', 'oversize'];
    if (known.includes(error.value)) return t(`shell.buildings.err_${error.value}`);
    return t('shell.buildings.fetchFailed', { error: error.value });
});

/** 框选完成：ExtentPicker / CesiumExtentPicker 同形 payload，直接填表 */
function onExtentPicked({ extent } = {}) {
    if (!Array.isArray(extent) || extent.length !== 4) return;
    const [minLng, minLat, maxLng, maxLat] = extent;
    if ([minLng, minLat, maxLng, maxLat].some((v) => !Number.isFinite(Number(v)))) return;
    form.minLng = String(Number(minLng).toFixed(4));
    form.minLat = String(Number(minLat).toFixed(4));
    form.maxLng = String(Number(maxLng).toFixed(4));
    form.maxLat = String(Number(maxLat).toFixed(4));
}

/** 开始抓取；成功后按当前引擎自动入库（上层 upload-data 按引擎路由） */
async function onFetch() {
    const bbox = parsedBbox();
    if (!bbox) {
        message.warning(t('shell.buildings.err_nan'));
        return;
    }
    const fc = await startFetch(bbox, zoom.value);
    if (!fc) return;
    if (!fc.features.length) {
        message.warning(t('shell.buildings.empty'));
        return;
    }
    const file = buildImportFile();
    if (file) {
        emit('upload-data', { resources: [file] });
        message.success(t('shell.buildings.imported', { name: fileName.value }));
    } else {
        message.success(t('shell.buildings.result', { count: fc.features.length, seconds: ((result.value?.elapsedMs || 0) / 1000).toFixed(1) }));
    }
}
</script>

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
