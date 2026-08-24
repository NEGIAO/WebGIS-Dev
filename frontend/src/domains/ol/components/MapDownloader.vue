<template>
    <div v-if="visible" class="map-downloader">
        <!-- 头部：标题徽章 + 状态 + 关闭（对齐兄弟 tab 的 section-header 语言） -->
        <div class="eco-section">
            <div class="section-header">
                <span class="section-icon">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                </span>
                <span class="section-title">{{ t('mapDownload.title') }}</span>
                <div class="header-actions">
                    <span class="status-badge" :class="statusClass">
                        <span class="status-dot"></span>
                        {{ statusText }}
                    </span>
                    <button class="mini-icon-btn danger" type="button" aria-label="Close" @click="emit('close')">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>
            <p class="head-subtitle">{{ t('mapDownload.subtitle') }}</p>
        </div>

        <!-- 子页签 -->
        <div class="subtabs">
            <button class="subtab" :class="{ active: activeTab === 'config' }" @click="activeTab = 'config'">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                任务配置
            </button>
            <button class="subtab" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                我的任务
            </button>
        </div>

        <!-- TAB 1: 下载配置 -->
        <div v-show="activeTab === 'config'" class="dl-col">
            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                    </span>
                    <span class="section-title">底图与数据源</span>
                </div>
                <div class="card glass">
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
            </div>

            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16"/></svg>
                    </span>
                    <span class="section-title">{{ t('mapDownload.bboxCrs') }}</span>
                    <div class="header-actions">
                        <ExtentPicker
                            :show-overlay="true"
                            @extent-change="applyExtentFromPicker"
                            @extent-clear="handleClearExtent"
                        />
                    </div>
                </div>
                <div class="card glass">
                    <div class="form-grid two-col mb-12">
                        <div class="form-field">
                            <label class="field-label">CRS</label>
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
            </div>

            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    </span>
                    <span class="section-title">{{ t('mapDownload.downloadMode') }}</span>
                </div>
                <div class="card glass">
                    <div class="mode-cards-grid">
                        <div
                            class="mode-card"
                            :class="{ active: store.downloadMode === 'native' }"
                            @click="store.downloadMode = 'native'"
                        >
                            <input type="radio" name="download-mode" value="native" :checked="store.downloadMode === 'native'" class="sr-only" tabindex="-1" />
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
                            <input type="radio" name="download-mode" value="progressive" :checked="store.downloadMode === 'progressive'" class="sr-only" tabindex="-1" />
                            <div class="mode-header">
                                <span class="mode-name">{{ t('mapDownload.modeProgressive') }}</span>
                                <span class="radio-indicator"></span>
                            </div>
                            <span class="mode-desc">{{ t('mapDownload.modeProgressiveHint') }}</span>
                        </div>
                    </div>
                </div>
            </div>

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
                        {{ transferState.total > 0 ? formatBytes(transferState.downloaded) + ' / ' + formatBytes(transferState.total) : '计算传输量...' }}
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

        <!-- TAB 2: 历史任务 -->
        <div v-show="activeTab === 'history'" class="dl-col">
            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    </span>
                    <span class="section-title">{{ t('mapDownload.taskLookup') }}</span>
                </div>
                <div class="card glass">
                    <div class="task-search-bar">
                        <input
                            v-model.trim="lookupTaskId"
                            class="form-input"
                            type="text"
                            :placeholder="t('mapDownload.taskIdPlaceholder')"
                        />
                        <button class="btn btn-primary btn-sm" type="button" @click="handleLookup">
                            {{ t('mapDownload.query') }}
                        </button>
                    </div>
                </div>
            </div>

            <MyDownloadTasks
                @download="handleDownloadFromList"
                @view="handleViewFromList"
                @cancel="handleCancelFromList"
            />
        </div>
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
let OVITAL_TDTKEY = getRuntimeMapTokensSync().ovitalTdtkey;
const layerConfigVersion = ref(0);
const layerConfigs = createLayerConfigs(TIANDITU_TK, OVITAL_TDTKEY);
let layerConfigMap = new Map(layerConfigs.map((item) => [item.id, item]));

function refreshLayerConfigs(tiandituTk, ovitalTdtkey) {
    const nextTiandituTk = String(tiandituTk || '').trim();
    const nextOvitalTdtkey = String(ovitalTdtkey || '').trim();
    const tiandituChanged = nextTiandituTk && nextTiandituTk !== TIANDITU_TK;
    const ovitalChanged = nextOvitalTdtkey && nextOvitalTdtkey !== OVITAL_TDTKEY;
    if (!tiandituChanged && !ovitalChanged) return;

    if (tiandituChanged) TIANDITU_TK = nextTiandituTk;
    if (ovitalChanged) OVITAL_TDTKEY = nextOvitalTdtkey;
    const nextLayerConfigs = createLayerConfigs(TIANDITU_TK, OVITAL_TDTKEY);
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
    refreshLayerConfigs(tokens?.tiandituTk, tokens?.ovitalTdtkey);
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
/* =====================================================================
   MapDownloader — 对齐 TOCPanel 兄弟 tab 的 eco-section 设计语言
   （渐变徽章标题 / 玻璃卡片 / 同源 --toc-* 令牌；逻辑层零改动）
   ===================================================================== */

.map-downloader {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 2px;
}

.dl-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* ---------- 分组：徽章标题（与兄弟 tab 同 DNA） ---------- */
.eco-section {
    display: flex;
    flex-direction: column;
}

.section-header {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 10px;
}

.section-icon {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--brand-gradient);
    color: #ffffff;
    box-shadow:
        0 2px 6px rgba(var(--brand-primary-dark-rgb), 0.26),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
    flex-shrink: 0;
}

.section-title {
    font-size: var(--toc-font-md, 13px);
    font-weight: 700;
    color: var(--toc-card-title-dark, var(--text-primary));
    letter-spacing: 0.3px;
}

.header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
}

.mini-icon-btn {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--toc-text-secondary, var(--text-secondary));
    cursor: pointer;
    transition:
        color 0.15s ease,
        background 0.15s ease,
        transform 0.15s ease;
}

.mini-icon-btn:hover {
    color: var(--toc-primary, var(--brand-primary));
    background: var(--toc-primary-bg-hover, rgba(var(--brand-primary-rgb), 0.08));
}

.mini-icon-btn.danger:hover {
    color: var(--toc-danger, #b83d3d);
    background: rgba(184, 61, 61, 0.1);
}

.mini-icon-btn:active {
    transform: scale(0.92);
}

.head-subtitle {
    margin: -4px 0 0 27px;
    font-size: 11.5px;
    color: var(--toc-text-secondary, var(--text-secondary));
}

/* ---------- 子页签（胶囊分段） ---------- */
.subtabs {
    display: inline-flex;
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.045);
    align-self: flex-start;
}

.subtab {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    font-size: 12px;
    font-weight: 600;
    color: var(--toc-text-secondary, var(--text-secondary));
    cursor: pointer;
    transition:
        background 0.18s ease,
        color 0.18s ease,
        box-shadow 0.18s ease;
}

.subtab:hover {
    color: var(--toc-primary, var(--brand-primary));
}

.subtab.active {
    background: #ffffff;
    color: var(--toc-primary, var(--brand-primary));
    box-shadow: 0 1px 4px rgba(58, 91, 67, 0.14);
}

/* ---------- 玻璃卡片 ---------- */
.card.glass {
    border: 1px solid rgba(153, 195, 170, 0.38);
    border-radius: 10px;
    padding: 11px;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 20px rgba(58, 91, 67, 0.08);
}

/* ---------- 表单控件 ---------- */
.form-grid {
    display: grid;
    gap: 10px;
}

.form-grid.single-col {
    grid-template-columns: 1fr;
}

.form-grid.two-col {
    grid-template-columns: 1fr 1fr;
}

.mb-12 {
    margin-bottom: 12px;
}

.form-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
}

.field-label {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--toc-text-secondary, var(--text-secondary));
    letter-spacing: 0.2px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.checkbox-inline {
    accent-color: var(--brand-primary);
    margin: 0;
}

.form-select,
.form-input {
    width: 100%;
    padding: 7px 9px;
    border: 1px solid rgba(153, 195, 170, 0.45);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.85);
    font-size: 12.5px;
    color: var(--text-primary);
    outline: none;
    transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
}

.form-select:focus,
.form-input:focus {
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.14);
}

.code-font {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
}

.field-hint {
    font-size: 11px;
    color: var(--toc-text-secondary, var(--text-secondary));
}

.field-hint.warning {
    color: #b8863d;
}

/* ---------- 方位阵列 ---------- */
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
    gap: 3px;
    min-width: 0;
}

.compass-cell.north { grid-column: 2; grid-row: 1; }
.compass-cell.west  { grid-column: 1; grid-row: 2; }
.compass-cell.east  { grid-column: 3; grid-row: 2; }
.compass-cell.south { grid-column: 2; grid-row: 3; }

.compass-cell.center-icon {
    grid-column: 2;
    grid-row: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--toc-text-secondary, var(--text-secondary));
}

.compass-cell.north,
.compass-cell.south {
    grid-column: 2;
}

.compass-tag {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--toc-text-secondary, var(--text-secondary));
    letter-spacing: 0.3px;
}

.compass-input {
    padding: 5px 7px;
    font-size: 11.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* ---------- 复选卡片 ---------- */
.checkbox-card {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    padding: 9px 11px;
    border: 1px dashed rgba(153, 195, 170, 0.55);
    border-radius: 9px;
    cursor: pointer;
    transition: background 0.15s ease;
}

.checkbox-card:hover {
    background: rgba(var(--brand-primary-rgb), 0.05);
}

.checkbox-card input {
    accent-color: var(--brand-primary);
    margin-top: 2px;
}

.checkbox-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.checkbox-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
}

.checkbox-desc {
    font-size: 11px;
    color: var(--toc-text-secondary, var(--text-secondary));
}

.mt-12 {
    margin-top: 12px;
}

/* ---------- 模式选择卡 ---------- */
.mode-cards-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.mode-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px 11px;
    border: 1.5px solid rgba(153, 195, 170, 0.45);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.65);
    cursor: pointer;
    transition:
        border-color 0.15s ease,
        background 0.15s ease,
        box-shadow 0.15s ease;
}

.mode-card:hover {
    border-color: var(--brand-primary);
}

.mode-card.active {
    border-color: var(--brand-primary);
    background: rgba(var(--brand-primary-rgb), 0.07);
    box-shadow: 0 4px 12px rgba(var(--brand-primary-rgb), 0.16);
}

.mode-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}

.mode-name {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text-primary);
}

.radio-indicator {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid rgba(153, 195, 170, 0.7);
    transition: all 0.15s ease;
}

.mode-card.active .radio-indicator {
    border-color: var(--brand-primary);
    border-width: 4.5px;
}

.mode-desc {
    font-size: 11px;
    line-height: 1.45;
    color: var(--toc-text-secondary, var(--text-secondary));
}

/* ---------- 执行栏 ---------- */
.execution-bar {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 9px 11px;
    border: 1px solid rgba(153, 195, 170, 0.38);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(8px);
    box-shadow: 0 -2px 14px rgba(58, 91, 67, 0.08);
}

.quota-info {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.quota-badge {
    font-size: 11px;
    color: var(--toc-card-title-dark, var(--text-primary));
    background: rgba(var(--brand-primary-rgb), 0.09);
    border-radius: 999px;
    padding: 3px 9px;
}

.btn-group {
    display: flex;
    align-items: center;
    gap: 7px;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 13px;
    border: none;
    border-radius: 9px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition:
        transform 0.15s ease,
        box-shadow 0.15s ease,
        opacity 0.15s ease,
        background 0.15s ease;
}

.btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.btn:not(:disabled):active {
    transform: scale(0.96);
}

.btn-sm {
    padding: 5px 10px;
    font-size: 11.5px;
    border-radius: 8px;
}

.btn-primary {
    background: var(--brand-gradient);
    color: #fff;
    box-shadow: 0 4px 12px rgba(var(--brand-primary-rgb), 0.32);
}

.btn-primary:not(:disabled):hover {
    box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.42);
    transform: translateY(-1px);
}

.btn-ghost {
    background: transparent;
    border: 1px solid rgba(153, 195, 170, 0.55);
    color: var(--toc-text-secondary, var(--text-secondary));
}

.btn-ghost:hover {
    color: var(--toc-primary, var(--brand-primary));
    border-color: var(--brand-primary);
}

.btn-warning {
    background: #f0a63a;
    color: #fff;
}

.btn-success {
    background: linear-gradient(135deg, #3e9e5f, #2f7d4a);
    color: #fff;
}

.btn-danger {
    background: #c45454;
    color: #fff;
}

.spinner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #fff;
    animation: md-spin 0.7s linear infinite;
}

@keyframes md-spin {
    to {
        transform: rotate(360deg);
    }
}

/* ---------- 进度面板 ---------- */
.progress-panel {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 11px 12px;
    border: 1px solid rgba(153, 195, 170, 0.38);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(8px);
}

.progress-panel.transfer-theme {
    border-color: rgba(62, 158, 95, 0.45);
}

.progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.progress-title {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text-primary);
}

.task-basemap-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--toc-text-secondary, var(--text-secondary));
    background: rgba(0, 0, 0, 0.05);
    border-radius: 999px;
    padding: 2px 8px;
}

.task-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10.5px;
    color: var(--toc-text-secondary, var(--text-secondary));
    cursor: pointer;
    border-radius: 999px;
    padding: 2px 8px;
    transition: background 0.15s ease;
}

.task-tag:hover {
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--toc-primary, var(--brand-primary));
}

.progress-percent {
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    font-weight: 700;
    color: var(--toc-primary, var(--brand-primary));
}

.progress-bar-track {
    height: 7px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.07);
    overflow: hidden;
}

.progress-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--brand-gradient);
    transition: width 0.4s ease;
}

.progress-bar-fill.transfer-fill {
    background: linear-gradient(90deg, #3e9e5f, #56c47b);
}

.tile-progress-row {
    font-size: 11.5px;
    color: var(--toc-text-secondary, var(--text-secondary));
}

.tile-progress-row strong {
    color: var(--toc-primary, var(--brand-primary));
    font-variant-numeric: tabular-nums;
}

.progress-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 11.5px;
    color: var(--toc-text-secondary, var(--text-secondary));
}

.status-msg {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

.error-msg {
    color: #c45454;
    font-weight: 600;
}

/* ---------- 状态徽章 ---------- */
.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.06);
    color: var(--toc-text-secondary, var(--text-secondary));
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}

.status-badge.status-running,
.status-badge.status-processing,
.status-badge.status-transferring {
    background: rgba(62, 158, 95, 0.12);
    color: #2f7d4a;
}

.status-badge.status-success {
    background: rgba(62, 158, 95, 0.16);
    color: #2f7d4a;
}

.status-badge.status-error,
.status-badge.status-failed {
    background: rgba(196, 84, 84, 0.12);
    color: #c45454;
}

.status-badge.status-cancelled {
    background: rgba(0, 0, 0, 0.06);
    color: var(--toc-text-secondary, var(--text-secondary));
}

.status-badge.status-running .status-dot,
.status-badge.status-processing .status-dot,
.status-badge.status-transferring .status-dot {
    animation: md-pulse 1.2s ease infinite;
}

@keyframes md-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.35;
    }
}

/* ---------- 历史任务查询 ---------- */
.task-search-bar {
    display: flex;
    gap: 8px;
}

.task-search-bar .form-input {
    flex: 1;
    min-width: 0;
}

/* ---------- 窄屏 ---------- */
@media (max-width: 480px) {
    .form-grid.two-col {
        grid-template-columns: 1fr;
    }

    .mode-cards-grid {
        grid-template-columns: 1fr;
    }

    .execution-bar {
        flex-direction: column;
        align-items: stretch;
    }

    .btn-group {
        justify-content: flex-end;
    }
}
</style>
