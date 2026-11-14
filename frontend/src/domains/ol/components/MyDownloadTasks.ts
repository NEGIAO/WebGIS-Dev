/**
 * MyDownloadTasks.vue 实例逻辑（我的底图下载任务列表）
 * ⚠️ 底图下载依赖 /api/download/*，后端 V3.6.5 已删除该模块，当前 HF Space 返回 404
 */
import { defineComponent } from 'vue';
import { useLocale } from '@common/app/useLocale';
import { useDownloadStore } from '@common/data-import/stores/useDownloadStore';
import { copyToClipboard } from '@common/utils/clipboard';

export class Instance {
    public t: any;
    public store: any;

    constructor() {
        const { t } = useLocale();
        this.t = t;
        this.store = useDownloadStore();
    }

    public copyTaskId = async (taskId?: string) => {
        await copyToClipboard(taskId || '');
    };

    public shouldShowProgress = (task: any) => {
        return ['downloading', 'pending', 'stitching'].includes(task.status) || (task.status === 'success' && task.progress < 100);
    };

    public resolveTaskStatus = (task: any) => {
        const statusMap: Record<string, string> = {
            pending: this.t('mapDownload.statusPending'),
            downloading: this.t('mapDownload.statusDownloading'),
            stitching: this.t('mapDownload.statusStitching'),
            success: this.t('mapDownload.statusSuccess'),
            failed: this.t('mapDownload.statusFailed'),
            cancelled: this.t('mapDownload.statusCancelled'),
            expired: this.t('mapDownload.statusExpired'),
        };
        return statusMap[task.status] || task.status || '';
    };

    public resolveTaskRemaining = (task: any) => {
        if (task.status === 'success') {
            if (task.expires_in_seconds > 0) {
                const minutes = Math.max(1, Math.ceil(task.expires_in_seconds / 60));
                return this.t('mapDownload.expiresIn', { minutes });
            }
            return '';
        }
        if (task.estimated_remaining_seconds > 0) {
            const minutes = Math.max(1, Math.ceil(task.estimated_remaining_seconds / 60));
            return this.t('mapDownload.remainingApprox', { minutes });
        }
        if (task.estimated_total_seconds > 0) {
            const minutes = Math.max(1, Math.ceil(task.estimated_total_seconds / 60));
            return this.t('mapDownload.estimatedTotal', { minutes });
        }
        return '';
    };
}

export default defineComponent({
    name: 'MyDownloadTasks',
    emits: ['download', 'view', 'cancel'],
    setup() {
        return new Instance();
    },
});
