<template>
    <div
        v-if="visible"
        class="map-downloader"
    >
        <header class="downloader-header">
            <div>
                <div class="header-title">{{ t('mapDownload.title') }}</div>
                <div class="header-subtitle">{{ t('mapDownload.subtitle') }}</div>
            </div>
            <div class="header-actions">
                <span
                    class="status-chip"
                    :class="statusClass"
                    >{{ statusText }}</span
                >
                <button
                    class="close-btn"
                    type="button"
                    @click="emit('close')"
                >
                    ×
                </button>
            </div>
        </header>

        <section class="downloader-body">
            <div class="form-row">
                <label>{{ t('mapDownload.basemapSource') }}</label>
                <select
                    v-model="selectedPreset"
                    class="form-select"
                >
                    <option
                        v-for="preset in tilePresets"
                        :key="preset.id"
                        :value="preset.id"
                        :disabled="!preset.downloadable"
                    >
                        {{ preset.label }}
                    </option>
                </select>
                <div
                    v-if="activePresetHint"
                    class="field-hint"
                >
                    {{ activePresetHint }}
                </div>
            </div>

            <div class="form-row">
                <label>{{ t('mapDownload.tileUrlTemplate') }}</label>
                <input
                    v-model="store.tileUrlTemplate"
                    class="form-input"
                    type="text"
                    :disabled="!isCustomPreset"
                    placeholder="https://.../{z}/{x}/{y}.png"
                />
            </div>

            <div class="form-row form-grid">
                <div class="form-field">
                    <label>{{ t('mapDownload.bboxCrs') }}</label>
                    <select
                        v-model="store.bboxCrs"
                        class="form-select"
                    >
                        <option value="EPSG:4326">EPSG:4326 (lon/lat)</option>
                        <!-- <option value="EPSG:3857">EPSG:3857 (meters)</option> -->
                    </select>
                </div>
                <div class="form-field">
                    <label>{{ t('mapDownload.resolutionM') }}</label>
                    <input
                        v-model.number="store.resolutionM"
                        class="form-input"
                        type="number"
                        min="0.1"
                        step="0.1"
                    />
                </div>
            </div>

            <!-- 下载模式选择 -->
            <div class="form-row">
                <label>{{ t('mapDownload.downloadMode') }}</label>
                <div class="download-mode-selector">
                    <label class="mode-option">
                        <input
                            v-model="store.downloadMode"
                            type="radio"
                            value="native"
                        />
                        <span class="mode-label">
                            {{ t('mapDownload.modeNative') }}
                            <span class="mode-hint">{{ t('mapDownload.modeNativeHint') }}</span>
                        </span>
                    </label>
                    <label class="mode-option">
                        <input
                            v-model="store.downloadMode"
                            type="radio"
                            value="progressive"
                        />
                        <span class="mode-label">
                            {{ t('mapDownload.modeProgressive') }}
                            <span class="mode-hint">{{ t('mapDownload.modeProgressiveHint') }}</span>
                        </span>
                    </label>
                </div>
            </div>

            <div class="bbox-grid">
                <div class="form-field">
                    <label>Min Lon/X</label>
                    <input
                        v-model.number="store.bbox.minLon"
                        class="form-input"
                        type="number"
                        step="0.000001"
                    />
                </div>
                <div class="form-field">
                    <label>Min Lat/Y</label>
                    <input
                        v-model.number="store.bbox.minLat"
                        class="form-input"
                        type="number"
                        step="0.000001"
                    />
                </div>
                <div class="form-field">
                    <label>Max Lon/X</label>
                    <input
                        v-model.number="store.bbox.maxLon"
                        class="form-input"
                        type="number"
                        step="0.000001"
                    />
                </div>
                <div class="form-field">
                    <label>Max Lat/Y</label>
                    <input
                        v-model.number="store.bbox.maxLat"
                        class="form-input"
                        type="number"
                        step="0.000001"
                    />
                </div>
            </div>

            <label class="clip-option">
                <input
                    v-model="store.clipToExtent"
                    type="checkbox"
                />
                <span class="clip-label">
                    {{ t('mapDownload.clipToExtent') }}
                    <span class="mode-hint">{{ t('mapDownload.clipToExtentHint') }}</span>
                </span>
            </label>

            <div class="action-row">
                <ExtentPicker
                    :show-overlay="true"
                    @extent-change="applyExtentFromPicker"
                    @extent-clear="handleClearExtent"
                />
            </div>

            <div class="action-row">
                <button
                    class="primary-btn"
                    type="button"
                    :disabled="store.isSubmitting"
                    @click="handleSubmit"
                >
                    {{ store.isSubmitting ? t('mapDownload.submitting') : t('mapDownload.startDownload') }}
                </button>
                <button
                    class="ghost-btn"
                    type="button"
                    :disabled="!store.isPolling"
                    @click="store.stopPolling"
                >
                    {{ t('mapDownload.stopPolling') }}
                </button>
                <button
                    class="ghost-btn"
                    type="button"
                    @click="handleReset"
                >
                    {{ t('mapDownload.reset') }}
                </button>
            </div>

            <!-- 后端生成进度 -->
            <div class="progress-card">
                <div class="progress-head">
                    <span>{{ t('mapDownload.backendProgress') }}</span>
                    <span class="progress-value">{{ progressLabel }}</span>
                </div>
                <div class="progress-track">
                    <div
                        class="progress-bar"
                        :style="{ width: progressWidth }"
                    ></div>
                </div>
                <div class="progress-meta">
                    <span v-if="store.taskId">{{ t('mapDownload.taskId', { id: store.taskId }) }}</span>
                    <span v-if="displayStoreMessage">{{ displayStoreMessage }}</span>
                    <span v-if="expiresHint">{{ expiresHint }}</span>
                    <span
                        v-if="displayLastError"
                        class="error-text"
                        >{{ displayLastError }}</span
                    >
                </div>
            </div>

            <div
                v-if="(transferState.active || transferState.total > 0 || transferState.error) && store.downloadMode === 'progressive'"
                class="progress-card transfer-card"
            >
                <div class="progress-head">
                    <span>{{ t('mapDownload.transferProgress', { time: countdownText }) }}</span>
                    <span class="progress-value">{{ transferState.progress }}%</span>
                </div>
                <div class="progress-track transfer-track">
                    <div
                        class="progress-bar transfer-bar"
                        :style="{ width: transferState.progress + '%' }"
                    ></div>
                </div>
                <div class="progress-meta transfer-meta">
                    <span v-if="transferState.total > 0">
                        {{
                            t('mapDownload.transferred', {
                                downloaded: formatBytes(transferState.downloaded),
                                total: formatBytes(transferState.total),
                            })
                        }}
                    </span>
                    <span v-else-if="transferState.active">
                        {{
                            t('mapDownload.transferredComputing', {
                                downloaded: formatBytes(transferState.downloaded),
                            })
                        }}
                    </span>
                    <span
                        v-if="transferState.error"
                        class="error-text"
                        >{{ transferState.error }}</span
                    >

                    <div class="transfer-actions">
                        <button
                            v-if="transferState.active"
                            class="ghost-btn cancel-btn"
                            type="button"
                            @click="cancelTransfer"
                        >
                            {{ t('mapDownload.cancelDownload') }}
                        </button>
                        <button
                            v-if="!transferState.active && (store.status === 'success' || transferState.error)"
                            class="primary-btn re-download-btn"
                            type="button"
                            @click="handleRedownload"
                        >
                            {{ t('mapDownload.redownload') }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="task-query">
                <label>{{ t('mapDownload.taskLookup') }}</label>
                <div class="task-query-row">
                    <input
                        v-model.trim="lookupTaskId"
                        class="form-input"
                        type="text"
                        :placeholder="t('mapDownload.taskIdPlaceholder')"
                    />
                    <button
                        class="ghost-btn"
                        type="button"
                        @click="handleLookup"
                    >
                        {{ t('mapDownload.query') }}
                    </button>
                </div>
            </div>
        </section>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiDownloadTaskFile, apiDownloadTaskFileUrl } from '@/api/download';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useDownloadStore } from '@common/data-import/stores/useDownloadStore';
import { triggerBrowserDownload, triggerUrlDownload } from '@common/utils/browserDownload';
import { BASEMAP_OPTIONS, createLayerConfigs, resolvePresetLayerIds } from '@/constants';
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';
import ExtentPicker from '@common/components/ExtentPicker.vue';

defineProps({
    visible: { type: Boolean, default: true },
});

const emit = defineEmits(['close']);
const message = useMessage();
const { t } = useLocale();
const store = useDownloadStore();

/**
 * 接收 ExtentPicker 的 extent-change 事件，将框选范围应用到 store
 * @param {{ extent: number[] }} param0 - extent 为 [minX, minY, maxX, maxY] 四元组 (EPSG:4326)
 */
function applyExtentFromPicker({ extent }) {
    if (extent?.length === 4) {
        store.applyBboxFromExtent(extent, 'EPSG:4326');
    }
}

/**
 * 接收 ExtentPicker 的 extent-clear 事件，清除已有的范围
 */
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

/* ----------- 倒计时逻辑 (新增) ----------- */
// 半小时下载有效期，时间到自动取消下载任务
const INITIAL_SECONDS = 1800; // 30分钟 = 1800秒
const timeLeft = ref(INITIAL_SECONDS);
const timer = ref(null);

const countdownText = computed(() => {
    if (timeLeft.value <= 0) return t('mapDownload.timedOut');
    const minutes = Math.floor(timeLeft.value / 60);
    const seconds = timeLeft.value % 60;
    return t('mapDownload.countdown', { m: minutes, s: String(seconds).padStart(2, '0') });
});

function startCountdown() {
    stopCountdown(); // 先清除旧的
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
/* --------------------------------------- */

/* ----------- 文件传输相关状态 ----------- */
const transferState = ref({
    active: false,
    downloaded: 0,
    total: 0,
    progress: 0,
    error: '',
});
const lastTransferredTaskId = ref('');

let abortController = null;

// 格式化字节大小
function formatBytes(bytes, decimals = 2) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 生成可读的文件名：{底图名称}_{分辨率m}_{mm_dd_hh}.tif
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

// 取消传输
function cancelTransfer() {
    if (abortController) {
        abortController.abort('UserCancelled');
        abortController = null;
    }
    stopCountdown(); // 取消下载时停止倒计时
}

async function downloadFileToLocal() {
    if (!store.taskId) return;
    cancelTransfer();

    // 开始下载时重置并启动倒计时（仅在 progressive 模式下）
    if (store.downloadMode === 'progressive') {
        startCountdown();
    }

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
                if (loaded > 0) {
                    transferState.value.downloaded = loaded;
                }
                if (total > 0) {
                    transferState.value.total = total;
                }
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

        // 尝试从 Content-Disposition 提取文件名
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
        stopCountdown(); // 传输成功后停止
    } catch (err) {
        const canceledByUser = err?.code === 'ERR_CANCELED';
        if (canceledByUser) {
            transferState.value.error = t('mapDownload.canceledByUser');
        } else {
            transferState.value.error = t('mapDownload.transferFailedDetail', {
                msg: err?.message || '',
            });
            message.error(t('mapDownload.transferToLocalFailed'));
        }
        transferState.value.active = false;
        transferState.value.progress = 0;
        stopCountdown(); // 失败后停止
    } finally {
        abortController = null;
    }
}

/**
 * 触发浏览器原生下载（使用 download_token）
 * 浏览器接管下载任务，不占用网页内存，大文件更稳定
 */
function triggerNativeDownload() {
    if (!store.taskId || !store.downloadToken) {
        message.error(t('mapDownload.missingToken'));
        return;
    }

    if (store.isExpired) {
        message.error(t('mapDownload.expiredCannotDownload'));
        return;
    }

    try {
        // 构建带 token 的下载 URL
        const downloadUrl = apiDownloadTaskFileUrl(store.taskId, store.downloadToken);

        // 通过临时链接触发浏览器原生下载
        triggerUrlDownload(downloadUrl);

        // 记录下载时间
        store.markDownloaded();
        message.success(t('mapDownload.nativeStarted'));

        // 停止倒计时（已完成）
        stopCountdown();
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : t('mapDownload.cannotStartDownload');
        message.error(t('mapDownload.nativeFailed', { msg: errorMsg }));
        console.error('[MapDownloader] triggerNativeDownload failed:', error);
    }
}

// 监听后端状态：当状态变为成功且文件就绪时，根据用户选择的模式自动触发下载
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
            // 根据下载模式选择下载方式
            if (store.downloadMode === 'native') {
                // 浏览器托管模式：使用 token 直接下载
                triggerNativeDownload();
            } else {
                // 前端可视化模式：使用流式下载显示进度
                downloadFileToLocal();
            }
        }
    },
);
/* ------------------------------------------- */

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
        if (!config) continue;
        if (config.category === 'label') continue;
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
    }).filter((preset) => preset.downloadable || preset.isCustom);
});

onMounted(async () => {
    const tokens = await loadRuntimeMapTokens();
    refreshLayerConfigs(tokens?.tiandituTk);
});

const selectedPreset = ref('');
const activePreset = computed(() =>
    tilePresets.value.find((item) => item.id === selectedPreset.value),
);
const isCustomPreset = computed(
    () => activePreset.value?.isCustom || !activePreset.value?.template,
);
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
    if (transferState.value.error) return 'status-transfer-failed';
    return `status-${store.status}`;
});
const progressWidth = computed(() => `${Math.min(100, Math.max(0, store.progress))}%`);
const progressLabel = computed(() => `${Math.round(store.progress)}%`);

/** store 存 mapDownload.* key；后端原文非 key 时原样展示 */
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
    // 提交前重置传输状态和倒计时
    transferState.value = { active: false, downloaded: 0, total: 0, progress: 0, error: '' };
    lastTransferredTaskId.value = '';
    stopCountdown(); // 重新提交时先重置倒计时

    const ok = await store.submitTask();
    if (ok) {
        message.success(
            store.clipToExtent
                ? t('mapDownload.taskSubmittedClip')
                : t('mapDownload.taskSubmittedGrid'),
        );
        // 倒计时将在实际下载开始时根据模式启动
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

/**
 * 根据用户选择的模式重新下载
 * 在浏览器托管模式下使用原生下载，在前端可视化模式下使用流式下载
 */
function handleRedownload() {
    if (!store.taskId) return;
    
    if (store.downloadMode === 'native') {
        triggerNativeDownload();
    } else {
        downloadFileToLocal();
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

onBeforeUnmount(() => {
    store.dispose();
    cancelTransfer();
    stopCountdown();
});
</script>

<style scoped>
/* 样式部分保持不变，根据需要给 countdownText 所在的 span 加颜色 */
.map-downloader {
    border-radius: 14px;
    border: 1px solid rgba(46, 126, 78, 0.2);
    background: linear-gradient(180deg, #f6fff8 0%, #eef8f1 100%);
    box-shadow: 0 16px 34px rgba(33, 94, 63, 0.15);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.downloader-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.header-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-brand-dark);
}

.header-subtitle {
    font-size: 12px;
    color: #4a6d59;
    margin-top: 4px;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.status-chip {
    font-size: 12px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(46, 126, 78, 0.12);
    color: var(--text-brand-dark);
}

.status-chip.status-success {
    background: rgba(34, 197, 94, 0.16);
    color: #0f7a3b;
}

.status-chip.status-failed {
    background: rgba(239, 68, 68, 0.15);
    color: #b91c1c;
}

.status-chip.status-expired {
    background: rgba(245, 158, 11, 0.16);
    color: #b45309;
}

.status-chip.status-transferring {
    background: rgba(37, 99, 235, 0.16);
    color: #1d4ed8;
}

.status-chip.status-transfer-failed {
    background: rgba(239, 68, 68, 0.15);
    color: #b91c1c;
}

.close-btn {
    border: none;
    background: transparent;
    font-size: 20px;
    color: #3f6b55;
    cursor: pointer;
}

.downloader-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.form-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.form-row label,
.form-field label {
    font-size: 12px;
    color: var(--text-brand-dark);
    font-weight: 600;
}

.field-hint {
    font-size: 11px;
    color: var(--text-secondary);
}

.form-input,
.form-select {
    border-radius: 8px;
    border: 1px solid rgba(31, 106, 63, 0.25);
    background: rgba(255, 255, 255, 0.92);
    padding: 8px 10px;
    font-size: 12px;
    color: var(--text-brand-dark);
}

.form-input:disabled {
    background: rgba(233, 241, 236, 0.7);
    color: var(--text-muted);
}

.bbox-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
}

/* 下载模式选择器样式 (新增) */
.download-mode-selector {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mode-option {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    user-select: none;
}

.mode-option input[type="radio"] {
    margin-top: 3px;
    cursor: pointer;
    accent-color: var(--brand-primary-dark);
}

.mode-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: var(--text-brand-dark);
    font-weight: 500;
}

.mode-hint {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 400;
}

.clip-option {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(31, 122, 77, 0.15);
    background: rgba(255, 255, 255, 0.6);
}

.clip-option input[type="checkbox"] {
    margin-top: 2px;
    cursor: pointer;
    accent-color: var(--brand-primary-dark);
}

.clip-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: var(--text-brand-dark);
    font-weight: 500;
}

.action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.primary-btn {
    border: none;
    border-radius: 9px;
    background: var(--brand-primary-dark);
    color: #fff;
    font-weight: 700;
    padding: 8px 14px;
    cursor: pointer;
    transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
}

.primary-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 18px rgba(31, 122, 77, 0.2);
}

.primary-btn:disabled {
    background: rgba(31, 122, 77, 0.5);
    cursor: not-allowed;
}

.ghost-btn {
    border: 1px solid rgba(31, 122, 77, 0.3);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.9);
    color: var(--text-brand-dark);
    font-weight: 600;
    padding: 8px 12px;
    cursor: pointer;
}

.ghost-btn:disabled {
    color: #9bb2a5;
    border-color: rgba(31, 122, 77, 0.15);
    cursor: not-allowed;
}

.clear-extent-btn {
    border-color: rgba(220, 38, 38, 0.3);
    color: #b91c1c;
}

.clear-extent-btn:hover {
    background: rgba(220, 38, 38, 0.08);
    border-color: rgba(220, 38, 38, 0.5);
}

.extent-active {
    color: #0f7a3b;
    font-weight: 500;
}

/* 原有的进度条卡片 */
.progress-card {
    border-radius: 12px;
    border: 1px solid rgba(31, 122, 77, 0.16);
    background: rgba(255, 255, 255, 0.85);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.progress-head {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-brand-dark);
    font-weight: 700;
}

.progress-track {
    height: 8px;
    border-radius: 999px;
    background: rgba(31, 122, 77, 0.12);
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    transition: width 0.3s ease;
}

.progress-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #4b6d5a;
}

/* 新增的下载传输 UI 样式 */
.transfer-card {
    border-color: rgba(37, 99, 235, 0.2);
    background: rgba(240, 248, 255, 0.85);
}
.transfer-card .progress-head {
    color: var(--info);
}
.transfer-track {
    background: rgba(37, 99, 235, 0.12);
}
.transfer-bar {
    background: linear-gradient(90deg, #60a5fa 0%, var(--info) 100%);
}
.transfer-meta {
    color: var(--info);
}
.transfer-actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
}
.cancel-btn {
    border-color: rgba(220, 38, 38, 0.4);
    color: var(--danger);
    padding: 6px 12px;
}
.cancel-btn:hover {
    background: rgba(220, 38, 38, 0.1);
}
.re-download-btn {
    background: var(--info);
    padding: 6px 12px;
    font-size: 12px;
}
.re-download-btn:hover {
    box-shadow: 0 8px 16px rgba(37, 99, 235, 0.2);
}

.task-query {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.task-query-row {
    display: flex;
    gap: 8px;
}

.task-query-row .form-input {
    flex: 1;
}

.error-text {
    color: var(--danger);
    font-weight: 600;
}

@media (max-width: 720px) {
    .form-grid,
    .bbox-grid {
        grid-template-columns: 1fr;
    }

    .downloader-header {
        flex-direction: column;
        align-items: flex-start;
    }

    .header-actions {
        align-self: flex-end;
    }
}
</style>
