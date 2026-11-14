/**
 * 功能名称：账户中心 OAuth 绑定、安全设置与留言动作 Composable
 * 日    期：2026/11/14
 * 说    明：从 FloatingAccountPanel.ts 拆分出 OAuth 账号列表/绑定/解绑、密码与昵称修改、
 *          退出登录与留言发布逻辑，使宿主实例聚焦于面板生命周期与多页签统计协调。
 */
import type { Ref } from 'vue';
import type { Router } from 'vue-router';
import {
	apiAuthChangeDisplayName,
	apiAuthChangePassword,
	apiAuthListOAuthAccounts,
	apiAuthLogout,
	apiAuthUnlinkOAuthAccount,
	apiCreateUserMessage,
	redirectToOAuthBindProvider,
} from '@/api/backend';
import { clearAuthSession } from '@common/user/services/auth';
import { useRealtimeStats } from '@common/user/composables/useRealtimeStats';

export interface AccountSecurityAndActionsDeps {
	t: (key: string, params?: Record<string, any>) => string;
	message: {
		success: (msg: string) => void;
		warning: (msg: string) => void;
		error: (msg: string) => void;
	};
	router: Router;
	isSubmitting: Ref<boolean>;
	isPostingMessage: Ref<boolean>;
	oauthAccounts: Ref<any[]>;
	oauthLoading: Ref<boolean>;
	closePanel: () => void;
	resetPasswordForm: () => void;
	mergeUserPatch: (nextUser?: any) => void;
	refreshMessages: () => Promise<void>;
	refreshRealtimeData: (opts?: { silent?: boolean }) => Promise<void>;
}

export function useAccountSecurityAndActions(deps: AccountSecurityAndActionsDeps) {
	const loadOAuthAccounts = async ({ silent = true } = {}) => {
		deps.oauthLoading.value = true;
		try {
			const result: any = await apiAuthListOAuthAccounts();
			deps.oauthAccounts.value = Array.isArray(result?.accounts) ? result.accounts : [];
		} catch (error: any) {
			deps.oauthAccounts.value = [];
			if (!silent) deps.message.warning(String(error?.message || deps.t('account.messages.oauthLoadFailed')));
		} finally {
			deps.oauthLoading.value = false;
		}
	};

	const handleBindOAuth = async (provider: 'google' | 'github') => {
		try {
			await redirectToOAuthBindProvider(provider);
		} catch (error: any) {
			deps.message.error(String(error?.message || deps.t('account.messages.oauthEntryFailed')));
		}
	};

	const handleUnlinkOAuth = async (provider: string) => {
		if (deps.isSubmitting.value) return;
		deps.isSubmitting.value = true;
		try {
			await apiAuthUnlinkOAuthAccount(provider);
			deps.message.success(deps.t('account.messages.oauthUnlinked'));
			await loadOAuthAccounts({ silent: false });
		} catch (error: any) {
			deps.message.error(String(error?.message || deps.t('account.messages.oauthUnlinkFailed')));
		} finally {
			deps.isSubmitting.value = false;
		}
	};

	const forceBackToLogin = async (hintText = '') => {
		// 先于 clearAuthSession 断开并上送 offline beacon，确保 Authorization 尚未清空
		useRealtimeStats().disconnect();
		clearAuthSession();
		deps.closePanel();
		if (hintText) deps.message.success(hintText);
		await deps.router.replace('/register');
	};

	const handleLogout = async () => {
		if (deps.isSubmitting.value) return;
		deps.isSubmitting.value = true;
		useRealtimeStats().disconnect();
		try {
			await apiAuthLogout();
		} catch {
			/* ignored */
		} finally {
			deps.isSubmitting.value = false;
		}
		await forceBackToLogin(deps.t('account.messages.loggedOut'));
	};

	const handleChangePassword = async (payload: any) => {
		if (deps.isSubmitting.value) return;
		if (payload?.error) {
			deps.message.error(payload.error);
			return;
		}
		const { oldPassword, newPassword } = payload || {};
		if (!oldPassword || !newPassword) {
			deps.message.error(deps.t('account.messages.passwordRequired'));
			return;
		}

		deps.isSubmitting.value = true;
		try {
			await apiAuthChangePassword(oldPassword, newPassword);
			deps.resetPasswordForm();
			await forceBackToLogin(deps.t('account.messages.passwordChanged'));
		} catch (error: any) {
			const detail = String(error?.message || '').trim();
			deps.message.error(detail || deps.t('account.messages.passwordChangeFailed'));
		} finally {
			deps.isSubmitting.value = false;
		}
	};

	const handleChangeDisplayName = async (payload: any) => {
		if (deps.isSubmitting.value) return;
		if (payload?.error) {
			deps.message.error(payload.error);
			return;
		}
		const displayName = String(payload?.displayName || '').trim();
		if (!displayName) {
			deps.message.error(deps.t('account.messages.displayNameRequired'));
			return;
		}

		deps.isSubmitting.value = true;
		try {
			const result: any = await apiAuthChangeDisplayName(displayName);
			if (result?.user) deps.mergeUserPatch(result.user);
			deps.message.success(deps.t('account.messages.displayNameUpdated'));
		} catch (error: any) {
			const detail = String(error?.message || '').trim();
			deps.message.error(detail || deps.t('account.messages.displayNameUpdateFailed'));
		} finally {
			deps.isSubmitting.value = false;
		}
	};

	const handleSubmitUserMessage = async (content: string, onSuccess?: () => void) => {
		if (deps.isPostingMessage.value) return;
		if (!content) {
			deps.message.warning(deps.t('account.messages.messageRequired'));
			return;
		}

		deps.isPostingMessage.value = true;
		try {
			await apiCreateUserMessage(content);
			onSuccess?.();
			deps.message.success(deps.t('account.messages.messagePosted'));
			await deps.refreshMessages();
			await deps.refreshRealtimeData({ silent: true });
		} catch (error: any) {
			deps.message.error(String(error?.message || deps.t('account.messages.messagePostFailed')));
		} finally {
			deps.isPostingMessage.value = false;
		}
	};

	return {
		loadOAuthAccounts,
		handleBindOAuth,
		handleUnlinkOAuth,
		forceBackToLogin,
		handleLogout,
		handleChangePassword,
		handleChangeDisplayName,
		handleSubmitUserMessage,
	};
}
