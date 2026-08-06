<template>
    <div v-if="visible" class="map-downloader-panel">
        <!-- 头部区域 -->
        <header class="panel-header">
            <div class="header-main">
                <h3 class="header-title">{{ t('mapDownload.title') }}</h3>
                <p class="header-subtitle">{{ t('mapDownload.subtitle') }}</p>
            </div>
            <div class="header-actions">
                <span class="status-badge" :class="statusClass">
                    <span class="status-dot"></span>
                    {{ statusText }}
                </span>
                <button class="close-btn" type="button" aria-label="Close" @click="emit('close')">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
        </header>

        <!-- Tab 切换标签页 -->
        <div class="panel-tabs">
            <button class="tab-item" :class="{ active: activeTab === 'config' }" @click="activeTab = 'config'">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                任务配置
            </button>
            <button class="tab-item" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                我的任务
            </button>
        </div>

        <section class="panel-body">
            <!-- TAB 1: 下载配置（支持拉宽自动分列网格） -->
            <div v-show="activeTab === 'config'" class="config-container">
                <!-- 1. 底图与源设置 -->
                <div class="section-card">
                    <div class="card-title">底图与数据源</div>
                    <div class="form-grid single-col">
                        <div class="form-field">
                            <label class="field-label">{{ t('mapDownload.basemapSource') }}</label>
                            <select v-model="selectedPreset" class="form-select">
                                <option
                                    v-for="preset in tilePresets"
                                    :key="preset.id"
                                    :value="preset.id"
                                    :disabled="!preset.downloadable"
                                >
                                    {{ preset.label }}
                                </option>
                            </select>
                            <span v-if="activePresetHint" class="field-hint warning">{{ activePresetHint }}</span>
                        </div>

                        <div class="form-field">
                            <label class="field-label">
                                <input
                                    type="checkbox"
                                    class="checkbox-inline"
                                    :checked="useCustomBasemapName"
                                    @change="onBasemapNameToggle"
                                />
                                自定义底图名称
                            </label>
                            <input
                                v-if="useCustomBasemapName"
                                v-model="store.basemapName"
                                class="form-input"
                                type="text"
                                placeholder="输入底图名称（用于文件命名）"
                            />
                        </div>

                        <div v-if="isCustomPreset" class="form-field">
                            <label class="field-label">{{ t('mapDownload.tileUrlTemplate') }}</label>
                            <input
                                v-model="store.tileUrlTemplate"
                                class="form-input code-font"
                                type="text"
                                placeholder="https://.../{z}/{x}/{y}.png"
                            />
                        </div>
                    </div>
                </div>

                <!-- 2. 空间与分辨率参数 -->
                <div class="section-card">
                    <div class="card-title-row">
                        <span class="card-title">裁剪与范围 (Extent)</span>
                        <ExtentPicker
                            :show-overlay="true"
                            @extent-change="applyExtentFromPicker"
                            @extent-clear="handleClearExtent"
                        />
                    </div>

                    <div class="form-grid two-col mb-12">
                        <div class="form-field">
                            <label class="field-label">{{ t('mapDownload.bboxCrs') }}</label>
                            <select v-model="store.bboxCrs" class="form-select">
                                <option value="EPSG:4326">EPSG:4326 (WGS 84)</option>
                            </select>
                        </div>
                        <div class="form-field">
                            <label class="field-label">{{ t('mapDownload.resolutionM') }} (m)</label>
                            <input
                                v-model.number="store.resolutionM"
                                class="form-input"
                                type="number"
                                min="0.1"
                                step="0.1"
                            />
                        </div>
                    </div>

                    <!-- 空间四至方位阵列 -->
                    <div class="spatial-compass-grid">
                        <div class="compass-cell north">
                            <span class="compass-tag">北 (Max Y)</span>
                            <input v-model.number="store.bbox.maxLat" class="form-input compass-input" type="number" step="0.000001" />
                        </div>
                        <div class="compass-cell west">
                            <span class="compass-tag">西 (Min X)</span>
                            <input v-model.number="store.bbox.minLon" class="form-input compass-input" type="number" step="0.000001" />
                        </div>
                        <div class="compass-cell center-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" opacity="0.3"><path d="M12 2v20M2 12h20"/></svg>
                        </div>
                        <div class="compass-cell east">
                            <span class="compass-tag">东 (Max X)</span>
                            <input v-model.number="store.bbox.maxLon" class="form-input compass-input" type="number" step="0.000001" />
                        </div>
                        <div class="compass-cell south">
                            <span class="compass-tag">南 (Min Y)</span>
                            <input v-model.number="store.bbox.minLat" class="form-input compass-input" type="number" step="0.000001" />
                        </div>
                    </div>

                    <label class="checkbox-card mt-12">
                        <input v-model="store.clipToExtent" type="checkbox" />
                        <div class="checkbox-meta">
                            <span class="checkbox-title">{{ t('mapDownload.clipToExtent') }}</span>
                            <span class="checkbox-desc">{{ t('mapDownload.clipToExtentHint') }}</span>
                        </div>
                    </label>
                </div>

                <!-- 3. 下载模式与策略（修改位置） -->
                <div class="section-card mode-section">
                    <div class="card-title">{{ t('mapDownload.downloadMode') }}</div>
                    <div class="mode-cards-grid">
                        <div
                            class="mode-card"
                            :class="{ active: store.downloadMode === 'native' }"
                            @click="store.downloadMode = 'native'"
                        >
                            <input
                                type="radio"
                                name="download-mode"
                                value="native"
                                :checked="store.downloadMode === 'native'"
                                class="sr-only"
                                tabindex="-1"
                            />
                            <div class="mode-header">
                                <span class="mode-name">{{ t('mapDownload.modeNative') }}</span>
                                <span class="radio-indicator"></span>
                            </div>
                            <span class="mode-desc">{{ t('mapDownload.modeNativeHint') }}</span>
                        </div>

                        <div
                            class="mode-card"
                            :class="{ active: store.downloadMode === 'progressive' }"
                            @click="store.downloadMode = 'progressive'"
                        >
                            <input
                                type="radio"
                                name="download-mode"
                                value="progressive"
                                :checked="store.downloadMode === 'progressive'"
                                class="sr-only"
                                tabindex="-1"
                            />
                            <div class="mode-header">
                                <span class="mode-name">{{ t('mapDownload.modeProgressive') }}</span>
                                <span class="radio-indicator"></span>
                            </div>
                            <span class="mode-desc">{{ t('mapDownload.modeProgressiveHint') }}</span>
                        </div>
                    </div>
                </div>

                <!-- 提交与控制栏（占用整行） -->
                <div class="execution-bar">
                    <div class="quota-info">
                        <span v-if="store.estimatingTiles" class="quota-badge">估算中...</span>
                        <span v-else-if="store.estimatedTileCount > 0" class="quota-badge">
                            约 <strong>{{ store.estimatedTileCount }}</strong> 瓦片
                        </span>
                        <span v-if="currentQuotaCost !== null && currentQuotaCost > 0" class="quota-badge">
                            预估消耗: <strong>{{ currentQuotaCost }}</strong> 配额
                        </span>
                    </div>

                    <div class="btn-group">
                        <button class="btn btn-ghost" type="button" @click="handleReset">
                            {{ t('mapDownload.reset') }}
                        </button>
                        <button v-if="store.isPolling" class="btn btn-warning" type="button" @click="store.stopPolling">
                            {{ t('mapDownload.stopPolling') }}
                        </button>
                        <button
                            class="btn btn-primary"
                            type="button"
                            :disabled="store.isSubmitting"
                            @click="handleSubmit"
                        >
                            <span v-if="store.isSubmitting" class="spinner"></span>
                            {{ store.isSubmitting ? t('mapDownload.submitting') : t('mapDownload.startDownload') }}
                        </button>
                    </div>
                </div>

                <!-- 后端生成进度（占用整行） -->
                <div v-if="store.taskId || store.isSubmitting" class="progress-panel">
                    <div class="progress-header">
                        <div class="progress-title">
                            <span>后端处理进度</span>
                            <span v-if="store.basemapName" class="task-basemap-badge">
                                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                                {{ store.basemapName }}
                            </span>
                            <span v-if="store.taskId" class="task-tag" @click="copyTaskId(store.taskId)">
                                ID: {{ store.taskId }}
                                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                            </span>
                        </div>
                        <span class="progress-percent">{{ progressLabel }}</span>
                    </div>

                    <div class="progress-bar-track">
                        <div class="progress-bar-fill" :style="{ width: progressWidth }"></div>
                    </div>

                    <div v-if="store.tileCount > 0" class="tile-progress-row">
                        <span class="tile-progress-text">
                            瓦片: <strong>{{ store.tilesDownloaded }}</strong> / {{ store.tileCount }}
                        </span>
                    </div>

                    <div class="progress-footer">
                        <span class="status-msg">{{ displayStoreMessage || expiresHint }}</span>
                        <span v-if="displayLastError" class="error-msg">{{ displayLastError }}</span>

                        <button
                            v-if="store.taskId && store.status === 'success' && store.fileReady"
                            class="btn btn-success btn-sm"
                            type="button"
                            @click="handleRedownload"
                        >
                            立即下载到本地
                        </button>
                    </div>
                </div>

                <!-- 客户端前端传输卡片 (仅用户选择 progressive 模式时显示) -->
                <div
                    v-if="(transferState.active || transferState.total > 0 || transferState.error) && store.downloadMode === 'progressive'"
                    class="progress-panel transfer-theme"
                >
                    <div class="progress-header">
                        <div class="progress-title">
                            <span>前端传输中 ({{ countdownText }})</span>
                        </div>
                        <span class="progress-percent">{{ transferState.progress }}%</span>
                    </div>

                    <div class="progress-bar-track">
                        <div class="progress-bar-fill transfer-fill" :style="{ width: transferState.progress + '%' }"></div>
                    </div>

                    <div class="progress-footer">
                        <span>
                            {{ transferState.total > 0 ? `${formatBytes(transferState.downloaded)} / ${formatBytes(transferState.total)}` : '计算传输量...' }}
                        </span>
                        <span v-if="transferState.error" class="error-msg">{{ transferState.error }}</span>

                        <div class="btn-group">
                            <button v-if="transferState.active" class="btn btn-danger btn-sm" type="button" @click="cancelTransfer">
                                {{ t('mapDownload.cancelDownload') }}
                            </button>
                            <button
                                v-if="!transferState.active && (store.status === 'success' || transferState.error)"
                                class="btn btn-primary btn-sm"
                                type="button"
                                @click="handleRedownload"
                            >
                                {{ t('mapDownload.redownload') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB 2: 历史任务列表 -->
            <div v-show="activeTab === 'history'" class="history-container">
                <div class="section-card">
                    <div class="card-title">{{ t('mapDownload.taskLookup') }}</div>
                    <div class="task-search-bar">
                        <input
                            v-model.trim="lookupTaskId"
                            class="form-input"
                            type="text"
                            :placeholder="t('mapDownload.taskIdPlaceholder')"
                        />
                        <button class="btn btn-ghost" type="button" @click="handleLookup">
                            {{ t('mapDownload.query') }}
                        </button>
                    </div>
                </div>

                <MyDownloadTasks
                    @download="handleDownloadFromList"
                    @view="handleViewFromList"
                    @cancel="handleCancelFromList"
                />
            </div>
        </section>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiDownloadCancelTask, apiDownloadTaskFile } from '@/api/download';
import { apiEstimateDownloadCost } from '@/api/backend/admin';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useDownloadStore } from '@common/data-import/stores/useDownloadStore';
import { triggerBrowserDownload, triggerUrlDownload } from '@common/utils/browserDownload';
import { BACKEND_BASE_URL } from '@/config/publicRuntime';
import { copyToClipboard } from '@common/utils/clipboard';
import { BASEMAP_OPTIONS, createLayerConfigs, resolvePresetLayerIds } from '@/constants';
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';
import ExtentPicker from '@common/components/ExtentPicker.vue';
import MyDownloadTasks from './MyDownloadTasks.vue';

defineProps({
    visible: { type: Boolean, default: true },
});

const emit = defineEmits(['close']);
const message = useMessage();
const { t } = useLocale();
const store = useDownloadStore();

const activeTab = ref('config');

// 下载配额状态
const quotaRemaining = ref(null);
const quotaCost = ref(null);
const quotaChecking = ref(false);

async function loadDownloadQuota() {
    try {
        quotaChecking.value = true;
        const res = await apiEstimateDownloadCost(0);
        if (res?.status === 'success') {
            quotaRemaining.value = Number(res.remaining ?? 0);
        }
    } catch {
        quotaRemaining.value = null;
    } finally {
        quotaChecking.value = false;
    }
}

async function estimateCurrentCost() {
    const tileCount = store.estimatedTileCount;
    if (!tileCount || tileCount <= 0) {
        quotaCost.value = null;
        return;
    }
    quotaChecking.value = true;
    try {
        const res = await apiEstimateDownloadCost(tileCount);
        if (res?.status === 'success') {
            quotaCost.value = Number(res.cost ?? 0);
        }
    } catch {
        quotaCost.value = null;
    } finally {
        quotaChecking.value = false;
    }
}

// 配额消耗跟随 estimatedTileCount 变化（而非 bbox 变化），保证时序一致
watch(
    () => store.estimatedTileCount,
    () => {
        estimateCurrentCost();
    },
);

onMounted(() => {
    loadDownloadQuota();
});

function applyExtentFromPicker({ extent }) {
    if (extent?.length === 4) {
        store.applyBboxFromExtent(extent, 'EPSG:4326');
    }
}

function handleClearExtent() {
    store.clearExtent();
}

let TIANDITU_TK = getRuntimeMapTokensSync().tiandituTk;
const layerConfigVersion = ref(0);
const layerConfigs = createLayerConfigs(TIANDITU_TK, '');
let layerConfigMap = new Map(layerConfigs.map((item) => [item.id, item]));

function refreshLayerConfigs(tiandituTk) {
    const nextTiandituTk = String(tiandituTk || '').trim();
    if (!nextTiandituTk || nextTiandituTk === TIANDITU_TK) return;

    TIANDITU_TK = nextTiandituTk;
    const nextLayerConfigs = createLayerConfigs(nextTiandituTk, '');
    layerConfigs.splice(0, layerConfigs.length, ...nextLayerConfigs);
    layerConfigMap = new Map(layerConfigs.map((item) => [item.id, item]));
    layerConfigVersion.value += 1;
}

/**
 * 构建浏览器托管下载 URL（后端 /file 端点无需登录）
 */
function buildDownloadUrl(taskId) {
    const safeId = encodeURIComponent(String(taskId || '').trim());
    return `${BACKEND_BASE_URL}/api/download/tasks/${safeId}/file`;
}

/**
 * 通过浏览器原生下载文件（Chrome 右上角显示进度，无 Save As 弹窗）
 * 使用隐藏锚点而非 window.open：避免 watch 等非用户手势上下文被弹窗拦截
 */
function browserManagedDownload(taskId) {
    if (!taskId) {
        message.error(t('mapDownload.errNoTaskId'));
        return;
    }
    if (store.isExpired) {
        message.error(t('mapDownload.expiredCannotDownload'));
        return;
    }
    triggerUrlDownload(buildDownloadUrl(taskId));
}

/* ----------- 前端可视化模式（用户主动选择 progressive 时启用） ----------- */
const INITIAL_SECONDS = 1800;
const timeLeft = ref(INITIAL_SECONDS);
const timer = ref(null);

const countdownText = computed(() => {
    if (timeLeft.value <= 0) return t('mapDownload.timedOut');
    const minutes = Math.floor(timeLeft.value / 60);
    const seconds = timeLeft.value % 60;
    return t('mapDownload.countdown', { m: minutes, s: String(seconds).padStart(2, '0') });
});

function startCountdown() {
    stopCountdown();
    timeLeft.value = INITIAL_SECONDS;
    timer.value = setInterval(() => {
        if (timeLeft.value > 0) {
            timeLeft.value--;
        } else {
            stopCountdown();
        }
    }, 1000);
}

function stopCountdown() {
    if (timer.value) {
        clearInterval(timer.value);
        timer.value = null;
    }
}

const transferState = ref({
    active: false,
    downloaded: 0,
    total: 0,
    progress: 0,
    error: '',
});
const lastTransferredTaskId = ref('');
let abortController = null;

function formatBytes(bytes, decimals = 2) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function buildReadableFilename() {
    const activePreset = layerConfigMap.get(selectedPreset.value);
    const presetName = String(activePreset?.label || selectedPreset.value || 'basemap')
        .trim()
        .replace(/[/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    const resolution = Number(store.resolutionM || 0);
    const resolutionPart = Number.isFinite(resolution) ? `${resolution}m` : '0m';
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    return `${presetName}_${resolutionPart}_${mm}_${dd}_${hh}.tif`;
}

function cancelTransfer() {
    if (abortController) {
        abortController.abort('UserCancelled');
        abortController = null;
    }
    stopCountdown();
}

async function downloadFileToLocal() {
    if (!store.taskId) return;
    cancelTransfer();
    startCountdown();

    transferState.value = {
        active: true,
        downloaded: 0,
        total: 0,
        progress: 0,
        error: '',
    };

    abortController = new AbortController();

    try {
        const response = await apiDownloadTaskFile(
            store.taskId,
            (progress, meta) => {
                transferState.value.progress = progress;
                const loaded = Number(meta?.loaded || 0);
                const total = Number(meta?.total || 0);
                if (loaded > 0) transferState.value.downloaded = loaded;
                if (total > 0) transferState.value.total = total;
            },
            { signal: abortController.signal },
        );

        const blob = response?.data;
        if (!(blob instanceof Blob) || blob.size <= 0) {
            throw new Error(t('mapDownload.emptyFile'));
        }

        const contentLength = Number(response?.headers?.['content-length'] || 0);
        if (contentLength > 0) {
            transferState.value.total = contentLength;
            transferState.value.downloaded = Math.max(transferState.value.downloaded, contentLength);
            transferState.value.progress = 100;
        }

        let filename = buildReadableFilename();
        const disposition = String(response?.headers?.['content-disposition'] || '');
        if (disposition.includes('attachment')) {
            const filenameRegex = /filename\*?=(?:UTF-8''|['"])?([^;'"\n]+)/i;
            const matches = filenameRegex.exec(disposition);
            if (matches && matches[1]) {
                filename = decodeURIComponent(matches[1].replace(/['"]/g, '').trim());
            }
        }

        triggerBrowserDownload(blob, filename);

        transferState.value.active = false;
        transferState.value.error = '';
        lastTransferredTaskId.value = store.taskId;
        message.success(t('mapDownload.downloadSuccess'));
        stopCountdown();
    } catch (err) {
        const canceledByUser = err?.code === 'ERR_CANCELED';
        if (canceledByUser) {
            transferState.value.error = t('mapDownload.canceledByUser');
        } else {
            transferState.value.error = t('mapDownload.transferFailedDetail', { msg: err?.message || '' });
            message.error(t('mapDownload.transferToLocalFailed'));
        }
        transferState.value.active = false;
        transferState.value.progress = 0;
        stopCountdown();
    } finally {
        abortController = null;
    }
}

// 监听后端状态：任务成功后根据用户选择的模式自动触发下载
watch(
    () => store.status,
    (newStatus) => {
        if (
            newStatus === 'success' &&
            store.taskId &&
            !transferState.value.active &&
            lastTransferredTaskId.value !== store.taskId &&
            !transferState.value.error
        ) {
            if (store.downloadMode === 'progressive') {
                downloadFileToLocal();
            } else {
                browserManagedDownload(store.taskId);
            }
        }
    },
);

function extractTileTemplate(source) {
    if (!source) return '';
    const directUrl = typeof source.getUrl === 'function' ? source.getUrl() : '';
    const urls = typeof source.getUrls === 'function' ? source.getUrls() : null;
    const candidate = directUrl || (Array.isArray(urls) ? urls[0] : '');
    if (!candidate) return '';
    if (candidate.includes('{-y}')) return '';
    if (candidate.includes('{z}') && candidate.includes('{x}') && candidate.includes('{y}')) {
        return candidate;
    }
    return '';
}

function resolvePresetTemplate(presetId) {
    const layerIds = resolvePresetLayerIds(presetId);
    for (const layerId of layerIds) {
        const config = layerConfigMap.get(layerId);
        if (!config || config.category === 'label') continue;
        try {
            const source = config.createSource?.();
            const template = extractTileTemplate(source);
            if (template) return template;
        } catch {
            continue;
        }
    }
    return '';
}

const tilePresets = computed(() => {
    const sourceOptions = layerConfigVersion.value >= 0 ? BASEMAP_OPTIONS : [];
    return sourceOptions.map((option) => {
        const template = resolvePresetTemplate(option.value);
        const isCustom = option.value === 'custom';
        const downloadable = isCustom || Boolean(template);
        return {
            id: option.value,
            label: option.label,
            template,
            downloadable,
            isCustom,
        };
    }).filter((preset) => (preset.downloadable || preset.isCustom) && preset.id !== 'local_tiles_preset');
});

onMounted(async () => {
    const tokens = await loadRuntimeMapTokens();
    refreshLayerConfigs(tokens?.tiandituTk);
    store.fetchMyTasks();
    store.updateEstimatedTileCount(0);
});

watch(
    () => [store.bbox.minLon, store.bbox.minLat, store.bbox.maxLon, store.bbox.maxLat, store.resolutionM],
    () => {
        store.updateEstimatedTileCount();
    },
);

const selectedPreset = ref('');
const useCustomBasemapName = ref(false);

function onBasemapNameToggle(event) {
    useCustomBasemapName.value = event.target.checked;
    if (!useCustomBasemapName.value) {
        const preset = tilePresets.value.find((item) => item.id === selectedPreset.value);
        store.basemapName = preset?.label || '';
    }
}
const activePreset = computed(() => tilePresets.value.find((item) => item.id === selectedPreset.value));
const isCustomPreset = computed(() => activePreset.value?.isCustom || !activePreset.value?.template);
const activePresetHint = computed(() => {
    if (!activePreset.value) return '';
    if (activePreset.value.isCustom) return t('mapDownload.customUrlHint');
    if (!activePreset.value.template) return t('mapDownload.basemapNotExportable');
    return '';
});

watch(
    tilePresets,
    (list) => {
        if (!list.length) return;
        if (!selectedPreset.value || !list.some((item) => item.id === selectedPreset.value)) {
            const first = list.find((item) => item.downloadable) || list[0];
            selectedPreset.value = first?.id || '';
        }
    },
    { immediate: true },
);

watch(selectedPreset, (presetId) => {
    const preset = tilePresets.value.find((item) => item.id === presetId);
    if (preset && preset.template) {
        store.setTileUrlTemplate(preset.template);
    }
    if (!useCustomBasemapName.value) {
        store.basemapName = preset?.label || '';
    }
});

const statusText = computed(() => {
    if (transferState.value.active) return t('mapDownload.transferring');
    if (transferState.value.error) return t('mapDownload.transferFailed');

    const statusMap = {
        idle: t('mapDownload.statusIdle'),
        pending: t('mapDownload.statusPending'),
        downloading: t('mapDownload.statusDownloading'),
        stitching: t('mapDownload.statusStitching'),
        success: t('mapDownload.statusSuccess'),
        expired: t('mapDownload.statusExpired'),
        failed: t('mapDownload.statusFailed'),
    };
    return statusMap[store.status] || store.status;
});

const statusClass = computed(() => {
    if (transferState.value.active) return 'status-transferring';
    if (transferState.value.error) return 'status-failed';
    return `status-${store.status}`;
});
const progressWidth = computed(() => `${Math.min(100, Math.max(0, store.progress))}%`);
const progressLabel = computed(() => `${Math.round(store.progress)}%`);

// 实时配额消耗：下载过程中跟随 tilesDownloaded 变化，空闲时显示后端估算值
const currentQuotaCost = computed(() => {
    if (quotaCost.value === null || quotaCost.value <= 0) return null;
    // 下载中：按实际已处理瓦片比例实时计算（后端最终会按此多退少补）
    if (store.isRunning && store.tileCount > 0 && store.tilesDownloaded > 0) {
        const ratio = store.tilesDownloaded / store.tileCount;
        return Math.max(1, Math.round(quotaCost.value * ratio));
    }
    return quotaCost.value;
});

function resolveStoreText(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('mapDownload.')) return t(s);
    return s;
}
const displayLastError = computed(() => resolveStoreText(store.lastError));
const displayStoreMessage = computed(() => resolveStoreText(store.message));

const expiresHint = computed(() => {
    if (!store.expiresAt && !store.expiresInSeconds) return '';
    if (store.isExpired) return t('mapDownload.taskExpired');
    if (store.expiresInSeconds > 0) {
        const minutes = Math.max(1, Math.ceil(store.expiresInSeconds / 60));
        return t('mapDownload.taskExpiresIn', { minutes });
    }
    return '';
});

const lookupTaskId = ref('');

async function handleSubmit() {
    transferState.value = { active: false, downloaded: 0, total: 0, progress: 0, error: '' };
    lastTransferredTaskId.value = '';
    stopCountdown();

    const ok = await store.submitTask();
    if (ok) {
        message.success(
            store.clipToExtent
                ? t('mapDownload.taskSubmittedClip')
                : t('mapDownload.taskSubmittedGrid'),
        );
        loadDownloadQuota();
    } else if (store.lastError) {
        message.error(resolveStoreText(store.lastError));
    }
}

function handleReset() {
    store.resetTask();
    cancelTransfer();
    stopCountdown();
    transferState.value = { active: false, downloaded: 0, total: 0, progress: 0, error: '' };
    lastTransferredTaskId.value = '';
    const first = tilePresets.value.find((item) => item.downloadable) || tilePresets.value[0];
    selectedPreset.value = first?.id || '';
}

function handleRedownload() {
    if (!store.taskId) return;
    // 默认浏览器托管；若用户选了 progressive 则用前端可视化
    if (store.downloadMode === 'progressive') {
        downloadFileToLocal();
    } else {
        browserManagedDownload(store.taskId);
    }
}

async function handleLookup() {
    const ok = await store.fetchTaskById(lookupTaskId.value, true);
    if (ok) {
        message.success(t('mapDownload.taskStatusUpdated'));
    } else if (store.lastError) {
        message.error(resolveStoreText(store.lastError));
    }
}

async function handleDownloadFromList(task) {
    store.resetTask();
    store.setExternalTask(task.task_id);
    if (task.file_ready) {
        // 从列表下载默认浏览器托管；progressive 模式用户用前端可视化
        if (store.downloadMode === 'progressive') {
            downloadFileToLocal();
        } else {
            browserManagedDownload(task.task_id);
        }
    } else {
        message.warning(t('mapDownload.fileNotReady'));
    }
}

async function handleViewFromList(task) {
    lookupTaskId.value = task.task_id || '';
    activeTab.value = 'config';
    await handleLookup();
}

async function handleCancelFromList(task) {
    await apiDownloadCancelTask(task.task_id);
    message.success(t('mapDownload.cancelSuccess'));
    store.fetchMyTasks();
}

async function copyTaskId(taskId) {
    const id = String(taskId || '').trim();
    if (!id) return;
    await copyToClipboard(id);
    message.success(t('mapDownload.taskIdCopied'));
}

onBeforeUnmount(() => {
    store.dispose();
    cancelTransfer();
    stopCountdown();
});
</script>

<style scoped>
/* 全局变量定义（适配流式拖拽布局） */
.map-downloader-panel {
    --panel-bg: #ffffff;
    --section-bg: #f8fafc;
    --border-color: #e2e8f0;
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-muted: #94a3b8;
    --brand-primary: #10b981;
    --brand-primary-hover: #059669;
    --brand-light: #ecfdf5;

    width: 100%;
    height: 100%;
    min-width: 320px;
    box-sizing: border-box;
    background: var(--panel-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--text-primary);
}

/* 头部样式 */
.panel-header {
    padding: 16px 20px 12px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-shrink: 0;
}

.header-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
}

.header-subtitle {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 2px 0 0 0;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 12px;
    background: #f1f5f9;
    color: var(--text-secondary);
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
}

.status-badge.status-success { background: #dcfce7; color: #15803d; }
.status-badge.status-success .status-dot { background: #22c55e; }
.status-badge.status-failed { background: #fee2e2; color: #b91c1c; }
.status-badge.status-failed .status-dot { background: #ef4444; }
.status-badge.status-transferring { background: #e0f2fe; color: #0369a1; }
.status-badge.status-transferring .status-dot { background: #0284c7; }

.close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: inline-flex;
    transition: all 0.2s;
}

.close-btn:hover {
    background: #f1f5f9;
    color: var(--text-primary);
}

/* Tab 页签 */
.panel-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color);
    padding: 0 20px;
    gap: 16px;
    flex-shrink: 0;
}

.tab-item {
    background: none;
    border: none;
    padding: 8px 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
}

.tab-item:hover { color: var(--text-primary); }
.tab-item.active {
    color: var(--brand-primary);
    border-bottom-color: var(--brand-primary);
    font-weight: 600;
}

/* 核心内容纵向流体容器 */
.panel-body {
    padding: 16px;
    flex: 1;
    overflow-y: auto;
}

/* 响应式自适应卡片网格系统 (根据面板宽度自动从 1 列过渡到 2 列) */
.config-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
}

/* 让核心状态和执行栏填满单行跨列 */
.execution-bar, .progress-panel, .mode-section {
    grid-column: 1 / -1;
}

.history-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* 配置卡片 */
.section-card {
    background: var(--section-bg);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
}

.card-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.card-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

/* 表单通用控件 */
.form-grid {
    display: grid;
    gap: 10px;
}

.form-grid.single-col { grid-template-columns: 1fr; }
.form-grid.two-col { grid-template-columns: 1fr 1fr; }

.form-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.field-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
}

.field-hint {
    font-size: 11px;
    color: var(--text-muted);
}

.field-hint.warning { color: #d97706; }

.form-input, .form-select {
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background: #ffffff;
    font-size: 12px;
    color: var(--text-primary);
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus, .form-select:focus {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
}

.code-font { font-family: ui-monospace, SFMono-Regular, Monaco, Consolas, monospace; }

/* 空间四至方位盘 */
.spatial-compass-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: auto auto auto;
    gap: 6px;
    align-items: center;
    margin-top: 6px;
}

.compass-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.compass-cell.north { grid-column: 2; grid-row: 1; }
.compass-cell.west { grid-column: 1; grid-row: 2; }
.compass-cell.center-icon { grid-column: 2; grid-row: 2; display: flex; justify-content: center; }
.compass-cell.east { grid-column: 3; grid-row: 2; }
.compass-cell.south { grid-column: 2; grid-row: 3; }

.compass-tag {
    font-size: 10px;
    color: var(--text-muted);
    margin-bottom: 2px;
}

.compass-input {
    text-align: center;
    font-size: 11px;
    height: 28px;
}

/* Checkbox卡片 */
.checkbox-card {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    user-select: none;
}

.checkbox-meta { display: flex; flex-direction: column; }
.checkbox-title { font-size: 12px; font-weight: 500; color: var(--text-primary); }
.checkbox-desc { font-size: 11px; color: var(--text-muted); }

/* 下载模式卡片 */
.mode-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
}

.mode-card {
    border: 1px solid var(--border-color);
    background: #ffffff;
    border-radius: 8px;
    padding: 10px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    gap: 4px;
    user-select: none;
}

.mode-card:hover { border-color: var(--brand-primary); }

.mode-card.active {
    border-color: var(--brand-primary);
    background: var(--brand-light);
}

.mode-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.mode-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }

.radio-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid var(--border-color);
    background: #fff;
}

.mode-card.active .radio-indicator {
    border-color: var(--brand-primary);
    background: var(--brand-primary);
    box-shadow: inset 0 0 0 2px #fff;
}

.mode-desc { font-size: 11px; color: var(--text-muted); }

/* 控制栏 */
.execution-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 4px;
}

.quota-badge { font-size: 12px; color: var(--text-secondary); }
.quota-badge strong { color: var(--brand-primary-hover); }

.btn-group { display: flex; gap: 8px; }

.btn {
    height: 32px;
    padding: 0 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
}

.btn-primary { background: var(--brand-primary); color: #ffffff; }
.btn-primary:hover { background: var(--brand-primary-hover); }

.btn-ghost {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
}

.btn-ghost:hover { background: #f1f5f9; color: var(--text-primary); }
.btn-warning { background: #f59e0b; color: #ffffff; }
.btn-danger { background: #ef4444; color: #ffffff; }
.btn-success { background: #10b981; color: #ffffff; }

.btn-sm { height: 26px; padding: 0 8px; font-size: 11px; }

/* 进度反馈卡片 */
.progress-panel {
    background: #f8fafc;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.progress-panel.transfer-theme {
    background: #f0f9ff;
    border-color: #bae6fd;
}

.progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 500;
}

.task-tag {
    font-family: ui-monospace, SFMono-Regular, Monaco, Consolas, monospace;
    font-size: 10px;
    background: #e2e8f0;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.task-basemap-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 500;
    color: #6366f1;
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    padding: 2px 8px;
    border-radius: 10px;
    margin-left: 6px;
}

.tile-progress-row {
    text-align: center;
    margin-top: 6px;
}

.tile-progress-text {
    font-size: 11px;
    color: #64748b;
}

.tile-progress-text strong {
    color: #334155;
}

.progress-bar-track {
    height: 6px;
    background: #e2e8f0;
    border-radius: 3px;
    overflow: hidden;
}

.progress-bar-fill {
    height: 100%;
    background: var(--brand-primary);
    transition: width 0.3s ease;
}

.progress-bar-fill.transfer-fill { background: #0284c7; }

.progress-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--text-muted);
}

.error-msg { color: #ef4444; font-weight: 500; }
.task-search-bar { display: flex; gap: 8px; }

/* 隐藏 Radio 默认样式 */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
}

.mb-12 { margin-bottom: 12px; }
.mt-12 { margin-top: 12px; }

/* Task Item 单行 UI 样式 */
:deep(.task-item) {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    transition: border-color 0.2s, box-shadow 0.2s;
}

:deep(.task-item:hover) {
    border-color: var(--brand-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

:deep(.task-item-info) {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
}

:deep(.task-item-id) {
    font-family: ui-monospace, SFMono-Regular, Monaco, Consolas, monospace;
    font-size: 11px;
    color: var(--text-secondary);
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

:deep(.copy-btn) {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    background: #ffffff;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
}

:deep(.copy-btn:hover) {
    background: #f8fafc;
    color: var(--brand-primary);
    border-color: var(--brand-primary);
}

:deep(.task-item-status) {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    background: #f1f5f9;
    color: var(--text-secondary);
}

:deep(.task-status-success .task-item-status) { background: #dcfce7; color: #15803d; }
:deep(.task-status-downloading .task-item-status) { background: #e0f2fe; color: #0369a1; }
:deep(.task-status-failed .task-item-status) { background: #fee2e2; color: #b91c1c; }
</style>