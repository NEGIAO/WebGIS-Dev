/**
 * useAuthVerificationFlows.ts — 注册邮箱校验、旧账号迁移绑邮与密码重置三条验证子流程
 *
 * 从 RegisterView 抽离多步骤验证码域，并复用 useTimerRegistry 统一托管三组 30s 倒计时句柄，
 * 消除重复 setInterval 清理代码与卸载泄漏隐患。
 */
import { ref, watch, type Ref } from 'vue';
import type { Router } from 'vue-router';
import {
    apiAuthBindEmail,
    apiAuthResetPassword,
    apiAuthSendCode,
    apiAuthVerifyCode,
} from '@/api/backend';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';
import {
    getUserDisplayName,
    isValidEmail,
    isValidPassword,
    normalizeDisplayName,
    normalizeEmail,
} from '@common/user/composables/useAuthIdentity';
import {
    clearAuthSession,
    consumePersistedPositionCode,
    getAuthUser,
    setAuthSession,
    syncUserRoleToUrl,
} from '@common/user/services/auth';

const COUNTDOWN_SECONDS = 30;

interface MessageLike {
    success: (msg: string) => void;
    warning: (msg: string) => void;
    error: (msg: string) => void;
}

export interface UseAuthVerificationFlowsOptions {
    username: Ref<string>;
    t: (key: string, params?: Record<string, any>) => string;
    message: MessageLike;
    router: Router;
    setFormState: (status?: string, text?: string) => void;
    setSubmitting: (submitting: boolean) => void;
    resolveRedirectTarget: () => string;
}

function extractErrorDetail(error: any, fallback: string): string {
    return String(error?.originalError?.response?.data?.detail || error?.message || fallback);
}

function analyzeSendError(error: any): { isTimeout: boolean; isRateLimited: boolean } {
    const isTimeout =
        error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''));
    const isRateLimited =
        Boolean(error?.isQuotaExceeded) || error?.originalError?.response?.status === 429;
    return { isTimeout, isRateLimited };
}

export function useAuthVerificationFlows(options: UseAuthVerificationFlowsOptions) {
    const timers = useTimerRegistry();

    /** 创建受 TimerRegistry 托管的可复位倒计时控制器 */
    function createCountdownController(countRef: Ref<number>) {
        let timerId: ReturnType<typeof setInterval> | null = null;

        const stop = () => {
            if (timerId !== null) {
                timers.cancel(timerId);
                timerId = null;
            }
            countRef.value = 0;
        };

        const start = () => {
            stop();
            countRef.value = COUNTDOWN_SECONDS;
            timerId = timers.every(() => {
                countRef.value--;
                if (countRef.value <= 0) {
                    timers.cancel(timerId);
                    timerId = null;
                    countRef.value = 0;
                }
            }, 1000);
        };

        return { start, stop };
    }

    // ── 邮箱 & 验证码（注册） ──
    const email = ref('');
    const emailCode = ref('');
    const isSendingCode = ref(false);
    const isVerifyingCode = ref(false);
    const codeCountdown = ref(0);
    const emailVerified = ref(false);
    const emailCheckStatus = ref('');
    const emailCheckMessage = ref('');
    const registerCountdown = createCountdownController(codeCountdown);

    // ── 旧账号绑定邮箱 ──
    const requiresEmailBinding = ref(false);
    const bindEmail = ref('');
    const bindCode = ref('');
    const bindCurrentPassword = ref('');
    const bindCodeCountdown = ref(0);
    const isBindingCodeSending = ref(false);
    const bindCountdown = createCountdownController(bindCodeCountdown);

    // ── 密码重置 ──
    const showResetPanel = ref(false);
    const resetEmail = ref('');
    const resetCode = ref('');
    const resetNewPassword = ref('');
    const resetConfirmPassword = ref('');
    /** 1=输入邮箱，2=输入验证码 + 新密码 */
    const resetStep = ref(1);
    const isResetSubmitting = ref(false);
    const resetCodeCountdown = ref(0);
    const resetCodeSent = ref(false);
    const resetCountdown = createCountdownController(resetCodeCountdown);

    // 邮箱输入变化时重置验证状态与倒计时
    watch(email, () => {
        if (emailVerified.value) {
            emailVerified.value = false;
            emailCheckStatus.value = '';
            emailCheckMessage.value = '';
            emailCode.value = '';
        }
        registerCountdown.stop();
    });

    // 重置密码邮箱变更时回退到 step 1（验证码已失效）
    watch(resetEmail, () => {
        if (resetStep.value !== 2) return;
        resetStep.value = 1;
        resetCode.value = '';
        resetNewPassword.value = '';
        resetConfirmPassword.value = '';
        resetCodeSent.value = false;
        resetCountdown.stop();
    });

    const resetEmailVerification = (): void => {
        email.value = '';
        emailCode.value = '';
        emailVerified.value = false;
        emailCheckStatus.value = '';
        emailCheckMessage.value = '';
        registerCountdown.stop();
    };

    /**
     * 发送注册验证码。
     * 超时或频率限制时也启动倒计时——后端可能已收到请求，防止用户重复点击。
     */
    const handleSendCode = async (): Promise<void> => {
        const normalizedEmail = normalizeEmail(email.value);
        if (!isValidEmail(normalizedEmail)) {
            options.setFormState('error', options.t('auth.invalidEmail'));
            return;
        }
        if (codeCountdown.value > 0) return;

        isSendingCode.value = true;
        emailCheckStatus.value = 'loading';
        emailCheckMessage.value = options.t('auth.sendingCode');
        options.setFormState('', '');

        try {
            await apiAuthSendCode(
                normalizedEmail,
                'register',
                normalizeDisplayName(options.username.value),
            );
            emailCheckStatus.value = 'success';
            emailCheckMessage.value = options.t('auth.codeSentCheckInbox');
            options.message.success(options.t('auth.codeSentToYourEmail'));
            registerCountdown.start();
        } catch (error: any) {
            const detail = extractErrorDetail(error, options.t('auth.codeSendFailed'));
            const { isTimeout, isRateLimited } = analyzeSendError(error);

            if (isTimeout || isRateLimited) {
                emailCheckStatus.value = 'loading';
                if (isRateLimited) {
                    emailCheckMessage.value = detail || options.t('auth.tooFrequent');
                    options.message.warning(detail || options.t('auth.tooFrequent'));
                } else {
                    emailCheckMessage.value = options.t('auth.timeoutMayBeSending');
                }
                registerCountdown.start();
            } else {
                emailCheckStatus.value = 'error';
                emailCheckMessage.value = detail;
                options.setFormState('error', detail);
            }
        } finally {
            isSendingCode.value = false;
        }
    };

    const handleVerifyCode = async (): Promise<void> => {
        const normalizedEmail = normalizeEmail(email.value);
        const code = String(emailCode.value || '').trim();
        if (!isValidEmail(normalizedEmail)) {
            options.setFormState('error', options.t('auth.invalidEmail'));
            return;
        }
        if (!code || code.length !== 6) {
            options.setFormState('error', options.t('auth.enter6DigitCode'));
            return;
        }

        isVerifyingCode.value = true;
        options.setFormState('', '');
        try {
            await apiAuthVerifyCode(normalizedEmail, code, 'register');
            emailVerified.value = true;
            emailCheckStatus.value = 'success';
            emailCheckMessage.value = options.t('auth.emailVerifiedSuccess');
            options.message.success(options.t('auth.emailVerifiedSuccess'));
        } catch (error: any) {
            const detail = extractErrorDetail(error, options.t('auth.codeVerifyFailed'));
            emailCheckStatus.value = 'error';
            emailCheckMessage.value = detail;
            options.setFormState('error', detail);
        } finally {
            isVerifyingCode.value = false;
        }
    };

    // ── 旧账号绑定邮箱 ──
    const getStoredBindingUser = () => getAuthUser();

    const clearBindingState = (): void => {
        requiresEmailBinding.value = false;
        bindEmail.value = '';
        bindCode.value = '';
        bindCurrentPassword.value = '';
        bindCountdown.stop();
    };

    const handleBindSendCode = async (): Promise<void> => {
        const normalizedEmail = normalizeEmail(bindEmail.value);
        if (!isValidEmail(normalizedEmail)) {
            options.setFormState('error', options.t('auth.invalidEmail'));
            return;
        }
        if (bindCodeCountdown.value > 0) return;

        isBindingCodeSending.value = true;
        options.setFormState('', '');
        try {
            await apiAuthSendCode(
                normalizedEmail,
                'bind_email',
                getUserDisplayName(getStoredBindingUser()),
            );
            options.message.success(options.t('auth.codeSentToYourEmail'));
            bindCountdown.start();
        } catch (error: any) {
            const detail = extractErrorDetail(error, options.t('auth.codeSendFailed'));
            options.setFormState('error', detail);
            options.message.error(detail);
        } finally {
            isBindingCodeSending.value = false;
        }
    };

    const handleBindEmailSubmit = async (): Promise<void> => {
        const normalizedEmail = normalizeEmail(bindEmail.value);
        const code = String(bindCode.value || '').trim();
        const currentPass = String(bindCurrentPassword.value || '').trim();

        if (!isValidEmail(normalizedEmail)) {
            options.setFormState('error', options.t('auth.invalidEmail'));
            return;
        }
        if (!code || code.length !== 6) {
            options.setFormState('error', options.t('auth.enter6DigitCode'));
            return;
        }
        if (!currentPass) {
            options.setFormState('error', options.t('auth.pleaseEnterCurrentPassword'));
            return;
        }

        options.setSubmitting(true);
        options.setFormState('', '');
        try {
            const result: any = await apiAuthBindEmail(normalizedEmail, code, currentPass);
            const token = String(result?.token || '').trim();
            const user = result?.user || null;
            if (!token || !user) throw new Error(options.t('auth.emailBindResponseError'));

            setAuthSession({ token, user });
            syncUserRoleToUrl(user);
            requiresEmailBinding.value = false;
            options.message.success(options.t('auth.emailBindSuccess'));
            await options.router.replace(options.resolveRedirectTarget());
            consumePersistedPositionCode();
        } catch (error: any) {
            const detail = extractErrorDetail(error, options.t('auth.emailBindFailed'));
            options.setFormState('error', detail);
            options.message.error(detail);
        } finally {
            options.setSubmitting(false);
        }
    };

    const cancelBinding = (): void => {
        clearBindingState();
        clearAuthSession();
        options.setFormState('', '');
    };

    // ── 密码重置 ──
    const openResetPanel = (): void => {
        showResetPanel.value = true;
        resetStep.value = 1;
        resetEmail.value = '';
        resetCode.value = '';
        resetNewPassword.value = '';
        resetConfirmPassword.value = '';
        resetCodeSent.value = false;
        options.setFormState('', '');
    };

    const closeResetPanel = (): void => {
        showResetPanel.value = false;
        resetStep.value = 1;
        resetCodeSent.value = false;
        resetCountdown.stop();
    };

    const handleResetSendCode = async (): Promise<void> => {
        const normalizedEmail = normalizeEmail(resetEmail.value);
        if (!isValidEmail(normalizedEmail)) {
            options.setFormState('error', options.t('auth.invalidEmail'));
            return;
        }
        if (resetCodeCountdown.value > 0) return;

        isResetSubmitting.value = true;
        options.setFormState('', '');
        try {
            await apiAuthSendCode(normalizedEmail, 'reset_password');
            options.message.success(options.t('auth.codeSentToYourEmail'));
            resetStep.value = 2;
            resetCodeSent.value = true;
            resetCountdown.start();
        } catch (error: any) {
            const detail = extractErrorDetail(error, options.t('auth.codeSendFailed'));
            const { isTimeout, isRateLimited } = analyzeSendError(error);

            if (isTimeout || isRateLimited) {
                if (isRateLimited) options.message.warning(detail || options.t('auth.tooFrequent'));
                else options.message.warning(options.t('auth.timeoutMayBeSending'));
                resetStep.value = 2;
                resetCodeSent.value = true;
                resetCountdown.start();
            } else {
                options.setFormState('error', detail);
                options.message.error(detail);
            }
        } finally {
            isResetSubmitting.value = false;
        }
    };

    const handleResetSubmit = async (): Promise<void> => {
        const normalizedEmail = normalizeEmail(resetEmail.value);
        const code = String(resetCode.value || '').trim();
        const newPass = String(resetNewPassword.value || '').trim();
        const confirmPass = String(resetConfirmPassword.value || '').trim();

        if (!isValidEmail(normalizedEmail)) {
            options.setFormState('error', options.t('auth.invalidEmail'));
            return;
        }
        if (!code || code.length !== 6) {
            options.setFormState('error', options.t('auth.enter6DigitCode'));
            return;
        }
        if (!isValidPassword(newPass)) {
            options.setFormState('error', options.t('auth.newPasswordRuleError'));
            return;
        }
        if (newPass !== confirmPass) {
            options.setFormState('error', options.t('auth.passwordMismatch'));
            return;
        }

        isResetSubmitting.value = true;
        options.setFormState('', '');
        try {
            await apiAuthResetPassword(normalizedEmail, code, newPass);
            options.message.success(options.t('auth.passwordResetSuccess'));
            options.setFormState('success', options.t('auth.passwordResetSuccess'));
            closeResetPanel();
        } catch (error: any) {
            const detail = extractErrorDetail(error, options.t('auth.passwordResetFailed'));
            options.setFormState('error', detail);
            options.message.error(detail);
        } finally {
            isResetSubmitting.value = false;
        }
    };

    return {
        // 注册邮箱验证
        email,
        emailCode,
        isSendingCode,
        isVerifyingCode,
        codeCountdown,
        emailVerified,
        emailCheckStatus,
        emailCheckMessage,
        handleSendCode,
        handleVerifyCode,
        resetEmailVerification,
        // 旧账号绑邮
        requiresEmailBinding,
        bindEmail,
        bindCode,
        bindCurrentPassword,
        bindCodeCountdown,
        isBindingCodeSending,
        getStoredBindingUser,
        handleBindSendCode,
        handleBindEmailSubmit,
        cancelBinding,
        clearBindingState,
        // 密码重置
        showResetPanel,
        resetEmail,
        resetCode,
        resetNewPassword,
        resetConfirmPassword,
        resetStep,
        isResetSubmitting,
        resetCodeCountdown,
        resetCodeSent,
        openResetPanel,
        closeResetPanel,
        handleResetSendCode,
        handleResetSubmit,
    };
}
