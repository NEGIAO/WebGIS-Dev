<template>
    <div class="my-tasks-section">
        <!-- 列表头部 -->
        <div class="my-tasks-header">
            <div class="header-left">
                <span class="header-title">{{ t('mapDownload.myTasks') }}</span>
                <span v-if="store.myTasks.length" class="task-count-badge">
                    {{ store.myTasks.length }}
                </span>
            </div>
            <button
                class="btn-icon-text"
                type="button"
                :disabled="store.loadingMyTasks"
                @click="store.fetchMyTasks"
            >
                <svg
                    class="refresh-icon"
                    :class="{ spinning: store.loadingMyTasks }"
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    stroke="currentColor"
                    stroke-width="2"
                    fill="none"
                >
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                {{ t('mapDownload.refreshList') }}
            </button>
        </div>

        <!-- 加载状态 -->
        <div v-if="store.loadingMyTasks" class="loading-state">
            <span class="spinner-ring"></span>
            <span class="loading-text">{{ t('common.loading') }}</span>
        </div>

        <!-- 空数据状态 -->
        <div v-else-if="store.myTasks.length === 0" class="empty-state">
            <svg viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="1.5" fill="none" class="empty-icon">
                <path d="M9 17h6m-3-3v3m0-12a9 9 0 100 18 9 9 0 000-18z" />
            </svg>
            <span class="empty-text">{{ t('mapDownload.noTasks') }}</span>
        </div>

        <!-- 任务列表容器 (自适应滚动) -->
        <div v-else class="my-tasks-list">
            <div
                v-for="task in store.myTasks"
                :key="task.task_id"
                class="task-card"
                :class="`status-${task.status}`"
            >
                <!-- 第一行：任务 ID、复制按钮、状态 Badge -->
                <div class="task-item-info">
                    <span class="task-item-id" :title="task.task_id">
                        {{ task.task_id }}
                    </span>
                    
                    <button
                        class="icon-btn copy-btn"
                        type="button"
                        :title="t('mapDownload.copyTaskId')"
                        @click="copyTaskId(task.task_id)"
                    >
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                    </button>

                    <span class="task-item-status" :class="`badge-${task.status}`">
                        <span class="status-dot"></span>
                        {{ resolveTaskStatus(task) }}
                    </span>
                </div>

                <!-- 第二行：处理进度条与估算剩余时间 -->
                <div v-if="shouldShowProgress(task)" class="task-item-progress">
                    <div class="progress-track">
                        <div
                            class="progress-bar"
                            :style="{ width: Math.min(100, Math.max(0, task.progress || 0)) + '%' }"
                        ></div>
                    </div>
                    <div class="progress-meta">
                        <span class="progress-num">{{ Math.round(task.progress || 0) }}%</span>
                        <span v-if="resolveTaskRemaining(task)" class="remaining-text">
                            {{ resolveTaskRemaining(task) }}
                        </span>
                    </div>
                </div>

                <!-- 过期提示（独立于进度条，success 状态也显示） -->
                <div v-if="task.status === 'success' && task.expires_in_seconds > 0" class="task-item-expiry">
                    {{ resolveTaskRemaining(task) }}
                </div>

                <!-- 第三行：快捷操作按钮组 -->
                <div class="task-item-actions">
                    <!-- 详情/查看进度 -->
                    <button
                        v-if="['downloading', 'pending', 'stitching'].includes(task.status)"
                        class="action-btn"
                        type="button"
                        @click="$emit('view', task)"
                    >
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        {{ t('mapDownload.view') }}
                    </button>

                    <!-- 取消任务 -->
                    <button
                        v-if="['downloading', 'pending'].includes(task.status)"
                        class="action-btn danger"
                        type="button"
                        @click="$emit('cancel', task)"
                    >
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                        {{ t('mapDownload.cancel') }}
                    </button>

                    <!-- 下载本地文件 -->
                    <button
                        v-if="task.status === 'success' && task.file_ready"
                        class="action-btn primary"
                        type="button"
                        @click="$emit('download', task)"
                    >
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        {{ t('mapDownload.download') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useLocale } from '@common/app/useLocale';
import { useDownloadStore } from '@common/data-import/stores/useDownloadStore';
import { copyToClipboard } from '@common/utils/clipboard';

const { t } = useLocale();
const store = useDownloadStore();

defineEmits(['download', 'view', 'cancel']);

/** 复制 Task ID */
async function copyTaskId(taskId) {
    await copyToClipboard(taskId);
}

/** 判断是否需要渲染进度条 */
function shouldShowProgress(task) {
    return ['downloading', 'pending', 'stitching'].includes(task.status) || (task.status === 'success' && task.progress < 100);
}

/** 解析任务状态标签文本 */
function resolveTaskStatus(task) {
    const statusMap = {
        pending: t('mapDownload.statusPending'),
        downloading: t('mapDownload.statusDownloading'),
        stitching: t('mapDownload.statusStitching'),
        success: t('mapDownload.statusSuccess'),
        failed: t('mapDownload.statusFailed'),
        cancelled: t('mapDownload.statusCancelled'),
        expired: t('mapDownload.statusExpired'),
    };
    return statusMap[task.status] || task.status || '';
}

/** 解析时间/倒计时提示信息 */
function resolveTaskRemaining(task) {
    if (task.status === 'success') {
        if (task.expires_in_seconds > 0) {
            const minutes = Math.max(1, Math.ceil(task.expires_in_seconds / 60));
            return t('mapDownload.expiresIn', { minutes }, `${minutes}分钟后过期`);
        }
        return '';
    }
    if (task.estimated_remaining_seconds > 0) {
        const minutes = Math.max(1, Math.ceil(task.estimated_remaining_seconds / 60));
        return t('mapDownload.remainingApprox', { minutes }, `约${minutes}分钟`);
    }
    if (task.estimated_total_seconds > 0) {
        const minutes = Math.max(1, Math.ceil(task.estimated_total_seconds / 60));
        return t('mapDownload.estimatedTotal', { minutes }, `预计${minutes}分钟`);
    }
    return '';
}
</script>

<style scoped>
.my-tasks-section {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    gap: 12px;
}

/* 顶部栏 */
.my-tasks-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 6px;
}

.header-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #0f172a);
}

.task-count-badge {
    font-size: 10px;
    font-weight: 600;
    background: #e2e8f0;
    color: #475569;
    padding: 1px 6px;
    border-radius: 10px;
}

.btn-icon-text {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    font-size: 12px;
    color: var(--text-secondary, #475569);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: background 0.2s, color 0.2s;
}

.btn-icon-text:hover:not(:disabled) {
    background: #f1f5f9;
    color: var(--brand-primary, #10b981);
}

.btn-icon-text:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.refresh-icon.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

/* 任务列表核心容器 */
.my-tasks-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    flex: 1;
    padding-right: 2px;
}

/* 任务卡片定义 */
.task-card {
    background: #ffffff;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: all 0.2s ease-in-out;
}

.task-card:hover {
    border-color: #cbd5e1;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

/* 状态相关发光边缘提示 */
.task-card.status-downloading,
.task-card.status-stitching {
    border-left: 3px solid #0284c7;
}

.task-card.status-success {
    border-left: 3px solid #10b981;
}

.task-card.status-failed {
    border-left: 3px solid #ef4444;
}

/* 1. 单行 ID 与状态配置 (核心防溢出逻辑) */
.task-item-info {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
}

.task-item-id {
    font-family: ui-monospace, SFMono-Regular, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #334155;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 2px 6px;
    border-radius: 4px;
    
    /* 防超长拉变形截断处理 */
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.icon-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s;
}

.icon-btn:hover {
    background: #f1f5f9;
    color: #10b981;
    border-color: #10b981;
}

.task-item-status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    background: #f1f5f9;
    color: #64748b;
}

.status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #94a3b8;
}

/* 状态 Badge 高亮样式 */
.badge-success { background: #dcfce7; color: #15803d; }
.badge-success .status-dot { background: #22c55e; }

.badge-downloading, .badge-stitching { background: #e0f2fe; color: #0369a1; }
.badge-downloading .status-dot, .badge-stitching .status-dot { background: #0284c7; }

.badge-failed { background: #fee2e2; color: #b91c1c; }
.badge-failed .status-dot { background: #ef4444; }

.badge-cancelled, .badge-expired { background: #f1f5f9; color: #64748b; }

/* 2. 进度条与状态数字 */
.task-item-progress {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.progress-track {
    height: 5px;
    background: #f1f5f9;
    border-radius: 3px;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background: #0284c7;
    border-radius: 3px;
    transition: width 0.3s ease;
}

.status-success .progress-bar {
    background: #10b981;
}

.progress-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: #64748b;
}

.progress-num { font-weight: 600; }

/* 过期提示 */
.task-item-expiry {
    font-size: 10px;
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 4px;
    padding: 3px 8px;
    text-align: center;
}

/* 3. 底部快捷操作栏 */
.task-item-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px dashed #f1f5f9;
}

.action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
}

.action-btn.primary {
    background: #10b981;
    border-color: #10b981;
    color: #ffffff;
}

.action-btn.primary:hover {
    background: #059669;
}

.action-btn.danger {
    color: #ef4444;
    border-color: #fca5a5;
}

.action-btn.danger:hover {
    background: #fef2f2;
}

/* 空状态与加载中 */
.loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 30px 0;
    gap: 8px;
    color: #94a3b8;
}

.empty-icon { color: #cbd5e1; }
.empty-text, .loading-text { font-size: 12px; }

.spinner-ring {
    width: 16px;
    height: 16px;
    border: 2px solid #e2e8f0;
    border-top-color: #10b981;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
</style>