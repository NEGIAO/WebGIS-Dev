<template>
    <div
        v-if="visible"
        class="map-downloader"
    >
        <header class="downloader-header">
            <div>
                <div class="header-title">在线底图导出</div>
                <div class="header-subtitle">BBox 输入支持 EPSG:4326 / 3857，导出为 GeoTIFF</div>
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
                <label>底图源</label>
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
                <label>Tile URL 模板</label>
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
                    <label>BBox CRS</label>
                    <select
                        v-model="store.bboxCrs"
                        class="form-select"
                    >
                        <option value="EPSG:4326">EPSG:4326 (lon/lat)</option>
                        <!-- <option value="EPSG:3857">EPSG:3857 (meters)</option> -->
                    </select>
                </div>
                <div class="form-field">
                    <label>分辨率 (m)</label>
                    <input
                        v-model.number="store.resolutionM"
                        class="form-input"
                        type="number"
                        min="0.1"
                        step="0.1"
                    />
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

            <div class="action-row">
                <button
                    class="ghost-btn"
                    type="button"
                    @click="emit('request-extent')"
                >
                    地图框选范围
                </button>
                <span class="field-hint">在地图拖拽矩形框选下载范围</span>
            </div>

            <div class="action-row">
                <button
                    class="primary-btn"
                    type="button"
                    :disabled="store.isSubmitting"
                    @click="handleSubmit"
                >
                    {{ store.isSubmitting ? '提交中...' : '开始下载' }}
                </button>
                <button
                    class="ghost-btn"
                    type="button"
                    :disabled="!store.isPolling"
                    @click="store.stopPolling"
                >
                    停止轮询
                </button>
                <button
                    class="ghost-btn"
                    type="button"
                    @click="handleReset"
                >
                    重置
                </button>
            </div>

            <!-- 后端生成进度 -->
            <div class="progress-card">
                <div class="progress-head">
                    <span>后端生成进度</span>
                    <span class="progress-value">{{ progressLabel }}</span>
                </div>
                <div class="progress-track">
                    <div
                        class="progress-bar"
                        :style="{ width: progressWidth }"
                    ></div>
                </div>
                <div class="progress-meta">
                    <span v-if="store.taskId">任务 ID: {{ store.taskId }}</span>
                    <span v-if="store.message">{{ store.message }}</span>
                    <span v-if="expiresHint">{{ expiresHint }}</span>
                    <span
                        v-if="store.lastError"
                        class="error-text"
                        >{{ store.lastError }}</span
                    >
                </div>
            </div>

            <!-- 本地文件传输进度 (新增UI) -->
            <div
                v-if="transferState.active || transferState.total > 0 || transferState.error"
                class="progress-card transfer-card"
            >
                <div class="progress-head">
                    <span>本地下载传输进度 (15分钟限时)</span>
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
                        已传输: {{ formatBytes(transferState.downloaded) }} /
                        {{ formatBytes(transferState.total) }}
                    </span>
                    <span v-else-if="transferState.active">
                        已传输: {{ formatBytes(transferState.downloaded) }} (计算总大小中...)
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
                            取消下载
                        </button>
                        <button
                            v-if="!transferState.active && (store.status === 'success' || transferState.error)"
                            class="primary-btn re-download-btn"
                            type="button"
                            @click="downloadFileToLocal"
                        >
                            重新下载到本地
                        </button>
                    </div>
                </div>
            </div>

            <div class="task-query">
                <label>任务 ID 查询</label>
                <div class="task-query-row">
                    <input
                        v-model.trim="lookupTaskId"
                        class="form-input"
                        type="text"
                        placeholder="输入任务 ID"
                    />
                    <button
                        class="ghost-btn"
                        type="button"
                        @click="handleLookup"
                    >
                        查询
                    </button>
                </div>
            </div>
        </section>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { apiDownloadTaskFile } from '../api/download';
import { useMessage } from '../composables/useMessage';
import { useDownloadStore } from '../stores/useDownloadStore';
import { BASEMAP_OPTIONS, createLayerConfigs, resolvePresetLayerIds } from '../constants';

const props = defineProps({
    visible: { type: Boolean, default: true },
});

const emit = defineEmits(['close', 'request-extent']);
const message = useMessage();
const store = useDownloadStore();

const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '';
const layerConfigs = createLayerConfigs('/', TIANDITU_TK, '');
const layerConfigMap = new Map(layerConfigs.map((item) => [item.id, item]));

/* ----------- 文件传输相关状态 (新增) ----------- */
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
        .replace(/[\/:*?"<>|]+/g, '_')
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
}

// 核心下载逻辑
async function downloadFileToLocal() {
    if (!store.taskId) return;
    cancelTransfer();

    // 初始化/重置传输状态
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
            throw new Error('下载文件为空或响应无效');
        }

        const contentLength = Number(response?.headers?.['content-length'] || 0);
        if (contentLength > 0) {
            transferState.value.total = contentLength;
            transferState.value.downloaded = Math.max(transferState.value.downloaded, contentLength);
            transferState.value.progress = 100;
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

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
        a.download = filename;

        document.body.appendChild(a);
        a.click();

        // 清理内存
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        transferState.value.active = false;
        transferState.value.error = '';
        lastTransferredTaskId.value = store.taskId;
        message.success('文件成功下载到本地！');
    } catch (err) {
        const canceledByUser = err?.code === 'ERR_CANCELED';
        if (canceledByUser) {
            transferState.value.error = '下载已手动取消';
        } else {
            transferState.value.error = `传输失败: ${err.message}`;
            message.error('文件传输到本地失败');
        }
        transferState.value.active = false;
        transferState.value.progress = 0;
    } finally {
        abortController = null;
    }
}

// 监听后端状态：当状态变为成功且文件就绪时，自动开始传输到本地
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
            downloadFileToLocal();
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
    return BASEMAP_OPTIONS.map((option) => {
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

const selectedPreset = ref('');
const activePreset = computed(() =>
    tilePresets.value.find((item) => item.id === selectedPreset.value),
);
const isCustomPreset = computed(
    () => activePreset.value?.isCustom || !activePreset.value?.template,
);
const activePresetHint = computed(() => {
    if (!activePreset.value) return '';
    if (activePreset.value.isCustom) return '可手动输入自定义 URL 模板';
    if (!activePreset.value.template) return '该底图暂不支持导出';
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
        store.tileUrlTemplate = preset.template;
    }
});

const statusText = computed(() => {
    if (transferState.value.active) return '传输中';
    if (transferState.value.error) return '传输失败';

    const statusMap = {
        idle: '待命',
        pending: '已提交',
        downloading: '下载中',
        stitching: '拼接中',
        success: '已完成',
        expired: '已过期',
        failed: '失败',
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
const expiresHint = computed(() => {
    if (!store.expiresAt && !store.expiresInSeconds) return '';
    if (store.isExpired) return '任务已过期（30分钟保留期）';
    if (store.expiresInSeconds > 0) {
        const minutes = Math.max(1, Math.ceil(store.expiresInSeconds / 60));
        return `任务将在 ${minutes} 分钟后过期`;
    }
    return '';
});

const lookupTaskId = ref('');

async function handleSubmit() {
    // 提交前重置传输状态
    transferState.value = { active: false, downloaded: 0, total: 0, progress: 0, error: '' };
    lastTransferredTaskId.value = '';

    const ok = await store.submitTask();
    if (ok) {
        message.success('下载任务已提交');
    } else if (store.lastError) {
        message.error(store.lastError);
    }
}

function handleReset() {
    store.resetTask();
    cancelTransfer();
    transferState.value = { active: false, downloaded: 0, total: 0, progress: 0, error: '' };
    lastTransferredTaskId.value = '';
    const first = tilePresets.value.find((item) => item.downloadable) || tilePresets.value[0];
    selectedPreset.value = first?.id || '';
}

async function handleLookup() {
    const ok = await store.fetchTaskById(lookupTaskId.value, true);
    if (ok) {
        message.success('任务状态已更新');
    } else if (store.lastError) {
        message.error(store.lastError);
    }
}

onBeforeUnmount(() => {
    store.stopPolling();
    cancelTransfer();
});
</script>

<style scoped>
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
    color: #1f6b46;
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
    color: #1f6b46;
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
    color: #2f5b47;
    font-weight: 600;
}

.field-hint {
    font-size: 11px;
    color: #5b7a68;
}

.form-input,
.form-select {
    border-radius: 8px;
    border: 1px solid rgba(31, 106, 63, 0.25);
    background: rgba(255, 255, 255, 0.92);
    padding: 8px 10px;
    font-size: 12px;
    color: #1f2e28;
}

.form-input:disabled {
    background: rgba(233, 241, 236, 0.7);
    color: #799183;
}

.bbox-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
}

.action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.primary-btn {
    border: none;
    border-radius: 9px;
    background: #1f7a4d;
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
    color: #1f6b46;
    font-weight: 600;
    padding: 8px 12px;
    cursor: pointer;
}

.ghost-btn:disabled {
    color: #9bb2a5;
    border-color: rgba(31, 122, 77, 0.15);
    cursor: not-allowed;
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
    color: #1f6b46;
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
    background: linear-gradient(90deg, #2faa66 0%, #1f7a4d 100%);
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
    color: #1e40af;
}
.transfer-track {
    background: rgba(37, 99, 235, 0.12);
}
.transfer-bar {
    background: linear-gradient(90deg, #60a5fa 0%, #2563eb 100%);
}
.transfer-meta {
    color: #1e3a8a;
}
.transfer-actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
}
.cancel-btn {
    border-color: rgba(220, 38, 38, 0.4);
    color: #dc2626;
    padding: 6px 12px;
}
.cancel-btn:hover {
    background: rgba(220, 38, 38, 0.1);
}
.re-download-btn {
    background: #2563eb;
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
    color: #c0392b;
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
