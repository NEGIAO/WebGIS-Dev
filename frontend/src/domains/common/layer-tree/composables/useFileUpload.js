/**
 * useFileUpload.js — TOCPanel 文件/文件夹上传触发、大小校验与进度视图
 *
 * 从 TOCPanel.vue 抽离（P2 拆分，见 unified-layer-management-refactor-plan.md）。
 * 上传载荷统一交 gisLoader 构建，由宿主 emit('upload-data') 进入既有导入管线。
 */

import { computed } from 'vue';

export const MB = 1024 * 1024;
export const MAX_FILE_SIZE_MB = 200;

/**
 * @param {object} ctx
 * @param {Function} ctx.t i18n
 * @param {object} ctx.message 消息组件
 * @param {Function} ctx.emit 组件 emit（upload-data）
 * @param {{uploadProgress: object}} ctx.props 组件响应式 props（读取 uploadProgress）
 * @param {() => object} ctx.getGisLoader useGisLoader 实例（含 createUploadPayloadsFromFiles）
 * @param {() => HTMLElement|null} ctx.getFileInputRef 单文件 input 引用
 * @param {() => HTMLElement|null} ctx.getFolderInputRef 文件夹 input 引用
 */
export function useFileUpload({ t, message, emit, props, getGisLoader, getFileInputRef, getFolderInputRef }) {
    /** 进度视图模型（phase/计数/汇总消息），供上传进度条渲染 */
    const uploadProgressView = computed(() => {
        const raw = props.uploadProgress || {};
        return {
            phase: String(raw.phase || 'idle'),
            total: Math.max(0, Number(raw.total) || 0),
            current: Math.max(0, Number(raw.current) || 0),
            success: Math.max(0, Number(raw.success) || 0),
            failed: Math.max(0, Number(raw.failed) || 0),
            warnings: Math.max(0, Number(raw.warnings) || 0),
            errors: Math.max(0, Number(raw.errors) || 0),
            message: String(raw.message || ''),
        };
    });

    const shouldShowUploadProgress = computed(() => uploadProgressView.value.phase !== 'idle');

    const uploadProgressPercent = computed(() => {
        const total = uploadProgressView.value.total;
        const current = uploadProgressView.value.current;
        if (!total) {
            if (uploadProgressView.value.phase === 'done') return 100;
            if (uploadProgressView.value.phase === 'error') return 100;
            return 12;
        }
        return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
    });

    const uploadProgressLabel = computed(() => {
        const phase = uploadProgressView.value.phase;
        if (phase === 'validating') return t('layer.importValidating');
        if (phase === 'dispatching') return t('layer.importDispatching');
        if (phase === 'importing') return t('layer.importImporting');
        if (phase === 'done') return t('layer.importDone');
        if (phase === 'error') return t('layer.importError');
        return t('layer.importWaiting');
    });

    function triggerFileUpload() {
        getFileInputRef()?.click();
    }

    function triggerFolderUpload() {
        getFolderInputRef()?.click();
    }

    /** 检查文件尺寸并过滤超限项；返回超限名单 */
    function filterOversized(files) {
        return files.filter((file) => file.size / MB > MAX_FILE_SIZE_MB);
    }

    function handleFileUpload(event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        // 检查文件大小
        const oversized = filterOversized(files);
        if (oversized.length) {
            message.error(
                t('layer.fileOversizeSelected', {
                    count: oversized.length,
                    size: MAX_FILE_SIZE_MB,
                    names: oversized.map((f) => f.name).join(', '),
                }),
            );
            event.target.value = '';
            return;
        }

        emit('upload-data', getGisLoader().createUploadPayloadsFromFiles(files));

        event.target.value = '';
    }

    function handleDirectoryUpload(event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        const oversized = filterOversized(files);
        if (oversized.length) {
            message.warning(
                t('layer.fileOversizeFolder', {
                    count: oversized.length,
                    size: MAX_FILE_SIZE_MB,
                }),
                { duration: 5200 },
            );
        }

        emit('upload-data', getGisLoader().createUploadPayloadFromFolder(files));

        event.target.value = '';
    }

    return {
        uploadProgressView,
        shouldShowUploadProgress,
        uploadProgressPercent,
        uploadProgressLabel,
        triggerFileUpload,
        triggerFolderUpload,
        handleFileUpload,
        handleDirectoryUpload,
    };
}
