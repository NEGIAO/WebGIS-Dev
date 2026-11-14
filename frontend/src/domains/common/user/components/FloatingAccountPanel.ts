/**
 * 功能名称：浮动账户面板
 * 日    期：2026/11/13（范式化改造）
 * 说    明：账户中心总览 / 安全 / 管理 / API / 偏好五个分页的宿主，负责开关与全屏、
 *          15s 轮询、会话时长秒级递增、用户信息合并与各分页数据懒加载。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch, type ExtractPropTypes, type SetupContext } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from '@common/shell/useMessage';
import { ASSET_BASE_URL } from '@/config/publicRuntime';
import {
	apiAdminOverview,
	apiAuthMe,
	apiListUserMessages,
	apiStatisticsCenter,
	apiStatisticsRealtime,
} from '@/api/backend';
import { getAuthToken, getAuthUser, setAuthSession, syncUserRoleToUrl } from '@common/user/services/auth';
import { useAuthStore } from '@common/user/stores/useAuthStore';
import { useThemeStore, useUserPreferencesStore } from '@/stores';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';
import { useAccountPreferences } from '@common/user/composables/useAccountPreferences';
import { useAccountSecurityAndActions } from '@common/user/composables/useAccountSecurityAndActions';
import { getUserDisplayName } from '@common/user/composables/useAuthIdentity';
import { useRealtimeStats } from '@common/user/composables/useRealtimeStats';
import { useLocale } from '@common/app/useLocale';
import { defineResilientAsync } from '@common/utils/defineResilientAsync';

// 账号中心各分页均为按需加载的大组件。用 defineResilientAsync 而非裸 defineAsyncComponent：
// 移动网络下分片请求偶发超时/中断时，裸写法会让该页签永久空白（且无占位或重试入口）。
const AdminControlPanel = defineResilientAsync(() => import('./AdminControlPanel.vue'), {
	label: '管理面板加载失败，请检查网络后重试',
	minHeight: 240,
});
const ApiManagementPanel = defineResilientAsync(() => import('./ApiManagementPanel.vue'), {
	label: 'API 面板加载失败，请检查网络后重试',
	minHeight: 240,
});
const OverviewTab = defineResilientAsync(() => import('./tabs/OverviewTab.vue'), {
	label: '总览加载失败，请检查网络后重试',
	minHeight: 260,
});
const SecurityTab = defineResilientAsync(() => import('./tabs/SecurityTab.vue'), {
	label: '安全设置加载失败，请检查网络后重试',
	minHeight: 260,
});
const PreferencesTab = defineResilientAsync(() => import('./tabs/PreferencesTab.vue'), {
	label: '偏好设置加载失败，请检查网络后重试',
	minHeight: 260,
});

// 一、Emits
type EmitsType = ['fullscreen-change', 'update:open'];

// 二、Props
const propDefine = {
	open: { type: Boolean, default: undefined },
	showFab: { type: Boolean, default: true },
} as const;

export type FloatingAccountPanelProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'FloatingAccountPanel',
	components: { AdminControlPanel, ApiManagementPanel, OverviewTab, SecurityTab, PreferencesTab },
	props: propDefine,
	emits: ['fullscreen-change', 'update:open'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {


	public isOpen = ref(false);
	public isFullscreen = ref(false);
	/** 'overview' | 'security' | 'admin' | 'api-management' | 'preferences' */
	public activeMenu = ref('overview');
	public isSubmitting = ref(false);
	public isLoadingCenter = ref(false);
	/** 首次统计加载完成标记（骨架屏只在首载显示，30s 轮询不触发） */
	public hasLoadedCenterOnce = ref(false);
	public isPostingMessage = ref(false);
	public user = ref<any>(getAuthUser());
	public oauthAccounts = ref<any[]>([]);
	public oauthLoading = ref(false);

	// 切页缓存：面板单次打开期间各数据源只拉一次，关闭面板时失效
	public prefsLoadedOnce = ref(false);
	public modelsLoadedOnce = ref(false);
	public oauthLoadedOnce = ref(false);

	public centerData = ref<any>({
		quota: { limit: null, used: 0, remaining: null, usage_date: '' },
		self_stats: {
			registered_at: '',
			login_count: 0,
			total_login_seconds: 0,
			total_api_calls: 0,
			total_visit_count: 0,
			last_login_at: '',
			last_logout_at: '',
			current_session_seconds: 0,
		},
		realtime: { online_users: 0, total_visit_count: 0, total_api_calls: 0, total_registered_users: 0 },
		admin_contact: 'admin@negiao.local',
		messages: [],
	});

	// ── 头像与偏好（由 useAccountPreferences 托管） ──
	public selectedAvatarIndex;
	public avatarSaving;
	public securityTabRef = ref<any>(null);
	/** 第三方头像加载失败标记：失败后回退预设头像 */
	public oauthAvatarFailed;
	public preferenceDraft;
	public preferenceSaving;
	public preferenceModelOptions;
	public basemapPreferenceOptions;
	public syncPreferenceDraftFromStore;
	public loadUserPreferences;
	public loadPreferenceModelOptions;
	public handleSavePreferences;
	public handleSaveAvatar;

	// ── OAuth、安全设置与留言动作（由 useAccountSecurityAndActions 托管） ──
	public loadOAuthAccounts!: ReturnType<typeof useAccountSecurityAndActions>['loadOAuthAccounts'];
	public handleBindOAuth!: ReturnType<typeof useAccountSecurityAndActions>['handleBindOAuth'];
	public handleUnlinkOAuth!: ReturnType<typeof useAccountSecurityAndActions>['handleUnlinkOAuth'];
	public forceBackToLogin!: ReturnType<typeof useAccountSecurityAndActions>['forceBackToLogin'];
	public handleLogout!: ReturnType<typeof useAccountSecurityAndActions>['handleLogout'];
	public handleChangePassword!: ReturnType<typeof useAccountSecurityAndActions>['handleChangePassword'];
	public handleChangeDisplayName!: ReturnType<typeof useAccountSecurityAndActions>['handleChangeDisplayName'];
	public handleSubmitUserMessage!: ReturnType<typeof useAccountSecurityAndActions>['handleSubmitUserMessage'];

	/** 管理入口可见性只认后端判定：一次 403 即收回，身份变化时重置 */
	public adminDenied = ref(false);

	// ── 会话时长本地秒级递增 ──
	public nowTick = ref(Date.now());
	public sessionDurationBase = ref({ seconds: 0, at: Date.now() });

	public emit!: SetupContext<EmitsType>['emit'];
	public t!: (key: string, params?: Record<string, any>) => string;

	private message: ReturnType<typeof useMessage>;
	private router: ReturnType<typeof useRouter>;
	// 模板（PreferencesTab 绑定）需要直接读取这两个 store，因此必须 public
	public userPreferencesStore: ReturnType<typeof useUserPreferencesStore>;
	public themeStore: ReturnType<typeof useThemeStore>;
	private authStore: ReturnType<typeof useAuthStore>;
	private timers = useTimerRegistry();

	private sessionTickerTimer: ReturnType<typeof setInterval> | null = null;
	private centerTimer: ReturnType<typeof setInterval> | null = null;
	private closeResetTimer: ReturnType<typeof setTimeout> | null = null;

	public oauthAvatarUrl = computed(() => {
		const url = String(this.user.value?.avatar_url || '').trim();
		return /^https?:\/\//i.test(url) ? url : '';
	});

	constructor(
		private props: FloatingAccountPanelProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.message = useMessage();
		this.router = useRouter();
		this.userPreferencesStore = useUserPreferencesStore();
		this.themeStore = useThemeStore();
		this.authStore = useAuthStore();
		const { t } = useLocale();
		this.t = t;
		this.emit = this.ctx.emit;

		const accountPrefs = useAccountPreferences({
			t: this.t,
			message: this.message,
			userPreferencesStore: this.userPreferencesStore,
			mergeUserPatch: (nextUser?: any) => this.mergeUserPatch(nextUser),
			oauthAvatarUrl: this.oauthAvatarUrl,
		});
		this.selectedAvatarIndex = accountPrefs.selectedAvatarIndex;
		this.avatarSaving = accountPrefs.avatarSaving;
		this.oauthAvatarFailed = accountPrefs.oauthAvatarFailed;
		this.preferenceDraft = accountPrefs.preferenceDraft;
		this.preferenceSaving = accountPrefs.preferenceSaving;
		this.preferenceModelOptions = accountPrefs.preferenceModelOptions;
		this.basemapPreferenceOptions = accountPrefs.basemapPreferenceOptions;
		this.syncPreferenceDraftFromStore = accountPrefs.syncPreferenceDraftFromStore;
		this.loadUserPreferences = accountPrefs.loadUserPreferences;
		this.loadPreferenceModelOptions = accountPrefs.loadPreferenceModelOptions;
		this.handleSavePreferences = accountPrefs.handleSavePreferences;
		this.handleSaveAvatar = accountPrefs.handleSaveAvatar;

		const securityActions = useAccountSecurityAndActions({
			t: this.t,
			message: this.message,
			router: this.router,
			isSubmitting: this.isSubmitting,
			isPostingMessage: this.isPostingMessage,
			oauthAccounts: this.oauthAccounts,
			oauthLoading: this.oauthLoading,
			closePanel: () => this.closePanel(),
			resetPasswordForm: () => this.resetPasswordForm(),
			mergeUserPatch: (nextUser?: any) => this.mergeUserPatch(nextUser),
			refreshMessages: () => this.refreshMessages(),
			refreshRealtimeData: (opts) => this.refreshRealtimeData(opts),
		});
		this.loadOAuthAccounts = securityActions.loadOAuthAccounts;
		this.handleBindOAuth = securityActions.handleBindOAuth;
		this.handleUnlinkOAuth = securityActions.handleUnlinkOAuth;
		this.forceBackToLogin = securityActions.forceBackToLogin;
		this.handleLogout = securityActions.handleLogout;
		this.handleChangePassword = securityActions.handleChangePassword;
		this.handleChangeDisplayName = securityActions.handleChangeDisplayName;
		this.handleSubmitUserMessage = securityActions.handleSubmitUserMessage;

		// SSE 实时统计推送：连接由全局 HomeView 管理，本组件只注册回调消费数据
		useRealtimeStats({
			onStats: (data: any) => {
				if (!data) return;
				this.centerData.value = {
					...this.centerData.value,
					realtime: { ...this.centerData.value.realtime, ...data },
				};
			},
		});

		this.init();
	}

	//#region props 透传

	get open() {
		return this.props.open;
	}
	get showFab() {
		return this.props.showFab;
	}

	//#endregion

	//#region 派生

	public hasControlledOpen = computed(() => this.props.open !== undefined);

	public isAdmin = computed(() => !this.adminDenied.value && String(this.authStore.user?.role || '') === 'admin');

	public userAvatarIndex = computed(() => {
		const raw = Number(this.user.value?.avatar_index);
		if (Number.isInteger(raw) && raw >= 0 && raw <= 11) return raw;
		const role = String(this.user.value?.role || '').trim();
		return role === 'admin' ? 1 : 0;
	});

	public presetAvatarSrc = computed(() => this.resolvePublicAssetPath(`avatars/avatar-${this.userAvatarIndex.value}.svg`));

	public userAvatarSrc = computed(() => {
		if (this.oauthAvatarUrl.value && !this.oauthAvatarFailed.value) return this.oauthAvatarUrl.value;
		return this.presetAvatarSrc.value;
	});

	public roleText = computed(() => {
		const role = String(this.user.value?.role || '').trim();
		const knownRole = ['admin', 'super_admin', 'registered', 'guest'].includes(role) ? role : 'unknown';
		return this.t(`account.roles.${knownRole}`);
	});

	public panelLabel = computed(() => {
		const displayName = getUserDisplayName(this.user.value);
		return displayName ? this.t('account.accountOf', { name: displayName }) : this.t('account.title');
	});

	public displayNameText = computed(() => getUserDisplayName(this.user.value));

	public selfStats = computed(() => this.centerData.value?.self_stats || {});
	public quotaInfo = computed(() => this.centerData.value?.quota || {});
	public realtimeStats = computed(() => this.centerData.value?.realtime || {});

	/** 在线用户数：优先实时 tracker 口径（含游客）；其次统一 online_users；最后 DB 会话数 */
	public displayOnlineUsers = computed(() => {
		const rt = this.realtimeStats.value || {};
		if (rt.realtime_online_users !== null && rt.realtime_online_users !== undefined) return rt.realtime_online_users;
		if (rt.online_users !== null && rt.online_users !== undefined) return rt.online_users;
		return rt.online_users_db || 0;
	});

	public adminContact = computed(() => String(this.centerData.value?.admin_contact || '').trim());

	public recentMessages = computed(() => {
		const source = this.centerData.value?.messages;
		return Array.isArray(source) ? source : [];
	});

	public quotaText = computed(() => {
		const used = Number(this.quotaInfo.value?.used || 0);
		const limit = this.quotaInfo.value?.limit;
		if (limit == null) return this.t('account.quotaUnlimited', { used });
		return this.t('account.quotaLimited', { used, limit });
	});

	/** 速览条用的精简配额文案 */
	public quotaShortText = computed(() => {
		const limit = this.quotaInfo.value?.limit;
		if (limit == null) return this.t('account.quotaShortUnlimited');
		const remaining = Number(this.quotaInfo.value?.remaining ?? 0);
		return this.t('account.quotaShortRemaining', { remaining });
	});

	/** 当前展示用的会话秒数 = 后端基准秒数 + 本地自然流逝秒数 */
	public liveSessionSeconds = computed(() => {
		void this.nowTick.value; // 每秒 tick 触发重新求值
		const { seconds, at } = this.sessionDurationBase.value;
		const elapsed = Math.max(0, Math.floor((Date.now() - at) / 1000));
		return seconds + elapsed;
	});

	public sessionDurationText = computed(() => this.formatDuration(this.liveSessionSeconds.value));

	//#endregion

	//#region 生命周期

	private init() {
		// 身份变化（重新登录 / 切换账号）时重置拒绝标记，避免一次 403 永久锁死入口
		watch(
			() => this.authStore.user?.username,
			() => {
				this.adminDenied.value = false;
			}
		);

		// 会话时长基准：后端值变化时重置本地计时起点
		watch(
			() => this.selfStats.value?.current_session_seconds,
			(val) => {
				this.sessionDurationBase.value = { seconds: Math.max(0, Number(val || 0)), at: Date.now() };
			},
			{ immediate: true }
		);

		// 受控模式：外部 open 变化时统一走 setOpen（联动轮询启停 + 数据加载）
		watch(
			() => this.props.open,
			(nextValue) => {
				if (!this.hasControlledOpen.value) return;
				const normalized = Boolean(nextValue);
				if (this.isOpen.value === normalized) return;
				this.setOpen(normalized);
				if (normalized) {
					this.loadCenterData({ silent: true });
				} else {
					this.setFullscreen(false);
					this.scheduleAfterPanelClose();
				}
			},
			{ immediate: true }
		);

		onMounted(() => {
			this.syncCurrentUser();
			// 挂载预热偏好/模型（面板未开也先备好），并标记缓存已热
			this.prefsLoadedOnce.value = true;
			this.modelsLoadedOnce.value = true;
			void this.loadUserPreferences({ silent: true });
			void this.loadPreferenceModelOptions({ silent: true });
			this.selectedAvatarIndex.value = this.userAvatarIndex.value;
			this.loadCenterData({ silent: true });
			this.refreshRealtimeData({ silent: true });
			this.refreshMessages();

			if (this.isOpen.value) {
				this.startCenterPolling();
				this.startSessionTicker();
			}

			document.addEventListener('keydown', this.handleDocumentKeydown);
		});

		onBeforeUnmount(() => {
			this.setFullscreen(false);
			this.stopCenterPolling();
			this.stopSessionTicker();
			document.removeEventListener('keydown', this.handleDocumentKeydown);
		});
	}

	//#endregion

	//#region 用户与头像

	public resolvePublicAssetPath = (relativePath: string): string => {
		const normalizedBase = ASSET_BASE_URL.endsWith('/') ? ASSET_BASE_URL : `${ASSET_BASE_URL}/`;
		const normalizedPath = String(relativePath || '').replace(/^\/+/, '');
		return `${normalizedBase}${normalizedPath}`;
	};

	public handleAvatarImgError = (): void => {
		if (this.oauthAvatarUrl.value && !this.oauthAvatarFailed.value) this.oauthAvatarFailed.value = true;
	};

	/** 合并用户补丁：缺失字段回填旧值，并同步 URL 角色与本地会话缓存 */
	public mergeUserPatch = (nextUser: any = {}) => {
		const source = nextUser && typeof nextUser === 'object' ? nextUser : {};
		const current = this.user.value || {};
		const hasAvatarIndex = Object.prototype.hasOwnProperty.call(source, 'avatar_index');
		const merged: any = { ...current, ...source };

		if (!Object.prototype.hasOwnProperty.call(source, 'display_name')) {
			merged.display_name = current.display_name || source.username || '';
		}
		if (!Object.prototype.hasOwnProperty.call(source, 'email')) merged.email = current.email || '';
		if (!Object.prototype.hasOwnProperty.call(source, 'email_verified')) {
			merged.email_verified = current.email_verified || false;
		}
		if (!Object.prototype.hasOwnProperty.call(source, 'requires_email_binding')) {
			merged.requires_email_binding = current.requires_email_binding || false;
		}
		if (!hasAvatarIndex) merged.avatar_index = current.avatar_index ?? this.selectedAvatarIndex.value;

		this.user.value = merged;
		if (hasAvatarIndex) this.selectedAvatarIndex.value = Number(merged.avatar_index ?? this.selectedAvatarIndex.value);
		syncUserRoleToUrl(merged);
		const token = getAuthToken();
		if (token) setAuthSession({ token, user: merged });
		return merged;
	};

	public syncCurrentUser = async () => {
		try {
			const result: any = await apiAuthMe();
			if (!result?.user) return;
			this.mergeUserPatch(result.user);
		} catch {
			// handled by interceptor
		}
	};

	//#endregion

	//#region 数据加载

	public loadCenterData = async ({ silent = false } = {}) => {
		if (this.isLoadingCenter.value) return;
		this.isLoadingCenter.value = true;
		try {
			const result: any = await apiStatisticsCenter();
			if (result?.user) this.mergeUserPatch(result.user);
			this.centerData.value = {
				...this.centerData.value,
				...(result || {}),
				realtime: { ...this.centerData.value.realtime, ...((result && result.realtime) || {}) },
			};
			this.hasLoadedCenterOnce.value = true;
		} catch (error: any) {
			if (!silent) this.message.warning(String(error?.message || this.t('account.messages.centerLoadFailed')));
		} finally {
			this.isLoadingCenter.value = false;
		}
	};

	public refreshRealtimeData = async ({ silent = true } = {}) => {
		try {
			const result: any = await apiStatisticsRealtime();
			if (result?.data) {
				this.centerData.value = {
					...this.centerData.value,
					realtime: { ...this.centerData.value.realtime, ...result.data },
				};
			}
		} catch (error: any) {
			if (!silent) this.message.warning(String(error?.message || this.t('account.messages.realtimeLoadFailed')));
		}
	};

	public refreshMessages = async () => {
		try {
			const result: any = await apiListUserMessages();
			const list = Array.isArray(result?.data) ? result.data : [];
			this.centerData.value = { ...this.centerData.value, messages: list };
		} catch {
			// keep latest messages in panel
		}
	};

	/** 头部手动刷新：统计 + 实时 + 留言一次拉齐 */
	public handleManualRefresh = async () => {
		if (this.isLoadingCenter.value) return;
		await Promise.allSettled([
			this.loadCenterData({ silent: false }),
			this.refreshRealtimeData({ silent: true }),
			this.refreshMessages(),
		]);
		this.message.success(this.t('account.messages.refreshed'));
	};

	//#endregion

	//#region 面板开关

	/** 面板关闭后的统一收尾：回总览、清密码表单、失效切页缓存 */
	private afterPanelClose = () => {
		this.closeResetTimer = null;
		this.activeMenu.value = 'overview';
		this.resetPasswordForm();
		this.prefsLoadedOnce.value = false;
		this.modelsLoadedOnce.value = false;
		this.oauthLoadedOnce.value = false;
	};

	private cancelAfterPanelClose = () => {
		if (this.closeResetTimer !== null) {
			this.timers.cancel(this.closeResetTimer);
			this.closeResetTimer = null;
		}
	};

	private scheduleAfterPanelClose = () => {
		this.cancelAfterPanelClose();
		this.closeResetTimer = this.timers.later(this.afterPanelClose, 200);
	};

	public closePanel = () => {
		this.setOpen(false);
		this.setFullscreen(false);
		this.scheduleAfterPanelClose();
	};

	public setOpen = (nextValue: any) => {
		const normalized = Boolean(nextValue);
		if (this.isOpen.value === normalized) return;
		this.isOpen.value = normalized;
		this.emit('update:open', normalized);

		// 轮询仅面板打开时运行：打开即启动，关闭即停止（避免后台挂起积压拖垮后端）
		if (normalized) {
			this.cancelAfterPanelClose();
			this.startCenterPolling();
			this.startSessionTicker();
		} else {
			this.stopCenterPolling();
			this.stopSessionTicker();
		}
	};

	public setFullscreen = (nextValue: any) => {
		const normalized = Boolean(nextValue);
		if (this.isFullscreen.value === normalized) return;
		this.isFullscreen.value = normalized;
		this.emit('fullscreen-change', normalized);
	};

	public toggleFullscreen = () => this.setFullscreen(!this.isFullscreen.value);

	public togglePanel = () => {
		const nextOpen = !this.isOpen.value;
		this.setOpen(nextOpen);
		if (nextOpen) this.loadCenterData({ silent: true });
		if (!nextOpen) {
			this.setFullscreen(false);
			this.scheduleAfterPanelClose();
		}
	};

	//#endregion

	//#region 会话时长与轮询

	public formatDuration = (totalSeconds: number): string => {
		const sec = Math.max(0, Number(totalSeconds || 0));
		const day = Math.floor(sec / 86400);
		const hour = Math.floor((sec % 86400) / 3600);
		const minute = Math.floor((sec % 3600) / 60);
		const second = sec % 60;
		if (day > 0) return this.t('account.duration.day', { day, hour, minute });
		if (hour > 0) return this.t('account.duration.hour', { hour, minute, second });
		if (minute > 0) return this.t('account.duration.minute', { minute, second });
		return this.t('account.duration.second', { second });
	};

	public startSessionTicker = () => {
		if (this.sessionTickerTimer !== null || typeof window === 'undefined') return;
		this.sessionTickerTimer = this.timers.every(() => {
			this.nowTick.value = Date.now();
		}, 1000);
	};

	public stopSessionTicker = () => {
		if (this.sessionTickerTimer !== null) {
			this.timers.cancel(this.sessionTickerTimer);
			this.sessionTickerTimer = null;
		}
	};

	/** 用户中心 15s 轮询：仅面板打开时轮询，关闭即停 */
	public startCenterPolling = () => {
		if (this.centerTimer !== null || typeof window === 'undefined') return;
		this.centerTimer = this.timers.every(() => {
			this.loadCenterData({ silent: true });
			this.refreshRealtimeData({ silent: true });
		}, 15000);
	};

	public stopCenterPolling = () => {
		if (this.centerTimer !== null) {
			this.timers.cancel(this.centerTimer);
			this.centerTimer = null;
		}
	};

	//#endregion

	//#region 菜单切换

	public selectMenu = async (menu: string) => {
		if (menu === 'admin' && !this.isAdmin.value) return;

		// 进入管理页签前先向后端探活：403 即说明当前会话在后端看来不是管理员，立即收回入口
		if (menu === 'admin') {
			try {
				await apiAdminOverview();
			} catch (error: any) {
				if (Number(error?.status) === 403) {
					this.adminDenied.value = true;
					this.activeMenu.value = 'overview';
					this.message.error(this.t('account.messages.adminDenied'));
					return;
				}
				// 401 说明会话已失效，交给全局拦截器跳转登录
				if (Number(error?.status) === 401) return;
			}
		}

		this.activeMenu.value = menu;
		// 切页缓存：本次打开期间首次进入才拉取
		if (menu === 'preferences') {
			if (!this.prefsLoadedOnce.value) {
				this.prefsLoadedOnce.value = true;
				void this.loadUserPreferences({ silent: true });
			}
			if (!this.modelsLoadedOnce.value) {
				this.modelsLoadedOnce.value = true;
				void this.loadPreferenceModelOptions({ silent: true });
			}
		}
		if (menu === 'security' && !this.oauthLoadedOnce.value) {
			this.oauthLoadedOnce.value = true;
			void this.loadOAuthAccounts({ silent: true });
		}
		if (menu !== 'security') this.resetPasswordForm();
	};

	//#endregion

	//#region 账户操作

	public resetPasswordForm = () => {
		this.securityTabRef.value?.resetForm();
	};

	/** Esc 分级退出：先退全屏，再关面板 */
	public handleDocumentKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		if (this.isFullscreen.value) {
			this.setFullscreen(false);
			return;
		}
		if (this.isOpen.value) this.closePanel();
	};

	public handleUpdatePreferenceDraft = ({ key, value }: { key: string; value: any }) => {
		this.preferenceDraft.value[key] = value;
	};

	public handleSelectAvatarIndex = (idx: number) => {
		this.selectedAvatarIndex.value = idx;
	};

	public handleSetTheme = (t: string) => {
		this.themeStore.setTheme(t);
	};

	//#endregion
}
