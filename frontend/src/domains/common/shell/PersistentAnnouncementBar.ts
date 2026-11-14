/**
 * 功能名称：全局系统公告轮询条（PersistentAnnouncementBar）实例层
 * 日    期：2026/11/14
 * 说    明：仅在前台可见时每 20s 轮询系统公告，通过 useMessage 弹出常驻提示并支持用户手动关闭确认。
 */
import {
	defineComponent,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
	type ExtractPropTypes,
	type SetupContext,
} from 'vue';
import { apiDismissAnnouncement, apiGetCurrentAnnouncement } from '@/api/backend';
import { useMessage } from '@common/shell/useMessage';
import { formatDateTime } from '@common/utils/datetime';

type EmitsType = [];
const propDefine = {} as const;
export type PersistentAnnouncementBarProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'PersistentAnnouncementBar',
	props: propDefine,
	emits: [],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	private message = useMessage();
	public loading = ref(false);
	public announcement = ref<{
		id: number;
		message: string;
		created_by: string;
		updated_at: string;
	} | null>(null);
	private msgId: any = null;
	private pollTimer: number | null = null;

	constructor(
		_props: PersistentAnnouncementBarProps,
		_ctx: SetupContext<EmitsType>,
	) {
		this.init();
	}

	private init() {
		watch(this.announcement, (newVal) => {
			if (this.msgId) {
				this.message.remove(this.msgId);
				this.msgId = null;
			}
			if (newVal) {
				const currentId = newVal.id;
				this.msgId = this.message.info(this.getAnnouncementText(newVal), {
					duration: 0,
					showTitle: false,
					closable: true,
					onClose: () => {
						void this.dismissCurrentAnnouncement(currentId);
					},
				});
			}
		});

		onMounted(async () => {
			await this.refreshAnnouncement({ silent: true });
			if (typeof window !== 'undefined') {
				this.startPolling();
				document.addEventListener('visibilitychange', this.handleVisibilityChange);
			}
		});

		onBeforeUnmount(() => {
			this.stopPolling();
			if (typeof window !== 'undefined') {
				document.removeEventListener('visibilitychange', this.handleVisibilityChange);
			}
			if (this.msgId) {
				this.message.remove(this.msgId);
				this.msgId = null;
			}
		});
	}

	private startPolling = () => {
		if (this.pollTimer || typeof window === 'undefined') return;
		this.pollTimer = window.setInterval(() => {
			void this.refreshAnnouncement({ silent: true });
		}, 20000);
	};

	private stopPolling = () => {
		if (this.pollTimer && typeof window !== 'undefined') {
			window.clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	};

	private handleVisibilityChange = () => {
		if (document.hidden) {
			this.stopPolling();
		} else {
			void this.refreshAnnouncement({ silent: true });
			this.startPolling();
		}
	};

	private normalizeAnnouncement(payload: any) {
		if (!payload || typeof payload !== 'object') return null;
		const id = Number(payload.id);
		const text = String(payload.message || '').trim();
		if (!Number.isFinite(id) || id <= 0 || !text) return null;
		return {
			id,
			message: text,
			created_by: String(payload.created_by || ''),
			updated_at: String(payload.updated_at || payload.created_at || ''),
		};
	}

	private formatTimeLabel(raw: any) {
		return formatDateTime(String(raw || '').trim(), { locale: 'zh-CN', invalidText: null });
	}

	public refreshAnnouncement = async ({ silent = false } = {}) => {
		if (this.loading.value) return;
		this.loading.value = true;
		try {
			const result = await apiGetCurrentAnnouncement();
			const raw = this.normalizeAnnouncement(result?.data);
			if (!raw) {
				if (this.announcement.value) {
					this.announcement.value = null;
				}
				return;
			}
			if (
				!this.announcement.value ||
				this.announcement.value.id !== raw.id ||
				this.announcement.value.message !== raw.message
			) {
				this.announcement.value = raw;
			}
		} catch (error: any) {
			if (!silent) {
				this.message.warning(String(error?.message || '公告获取失败'));
			}
		} finally {
			this.loading.value = false;
		}
	};

	public dismissCurrentAnnouncement = async (idToDismiss: any) => {
		if (!idToDismiss) return;
		try {
			await apiDismissAnnouncement(idToDismiss);
			if (this.announcement.value && this.announcement.value.id === idToDismiss) {
				this.announcement.value = null;
			}
		} catch (error: any) {
			this.message.error(String(error?.message || '公告隐藏失败'));
		}
	};

	private getAnnouncementText(ann: any) {
		const time = this.formatTimeLabel(ann.updated_at);
		const by = ann.created_by ? `发布者: ${ann.created_by}` : '';
		const meta = [by, time ? `更新时间: ${time}` : ''].filter(Boolean).join(' | ');
		return `【系统公告】\n\n${ann.message}\n\n${meta}`;
	}
}
