/**
 * useGoogleOneTapAuth.ts — Google One Tap 脚本按需注入与凭据登录状态管理
 *
 * 从 RegisterView 抽离独立第三方身份服务域：
 * 负责 GSI 客户端脚本单次注入、就绪轮询（卸载自动中止并释放轮询句柄）、
 * One Tap 弹窗触发及 id_token 后端兑换会话。
 */
import { onUnmounted } from 'vue';
import type { Router } from 'vue-router';
import { apiAuthGoogleOneTap } from '@/api/backend';
import { GOOGLE_OAUTH_CLIENT_ID } from '@/config/publicRuntime';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';
import {
    consumePersistedPositionCode,
    setAuthSession,
    syncUserRoleToUrl,
} from '@common/user/services/auth';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface MessageLike {
    success: (msg: string) => void;
    error: (msg: string) => void;
}

export interface UseGoogleOneTapAuthOptions {
    t: (key: string, params?: Record<string, any>) => string;
    message: MessageLike;
    router: Router;
    setFormState: (status?: string, text?: string) => void;
    setSubmitting: (submitting: boolean) => void;
    resolveRedirectTarget: () => string;
}

export function useGoogleOneTapAuth(options: UseGoogleOneTapAuthOptions) {
    const timers = useTimerRegistry();
    let gsiScriptInjecting = false;
    let unmounted = false;
    let activePollTimer: ReturnType<typeof setInterval> | null = null;
    let activePollResolve: ((ready: boolean) => void) | null = null;

    onUnmounted(() => {
        unmounted = true;
        if (activePollTimer !== null) {
            timers.cancel(activePollTimer);
            activePollTimer = null;
        }
        if (activePollResolve) {
            const resolve = activePollResolve;
            activePollResolve = null;
            resolve(false);
        }
    });

    /** 按需注入 GSI 脚本（全局仅注入一次） */
    function ensureGsiScript(): void {
        if ((window as any).google?.accounts?.id) return;
        if (gsiScriptInjecting) return;
        if (document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`)) {
            gsiScriptInjecting = true;
            return;
        }
        const script = document.createElement('script');
        script.src = GSI_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            gsiScriptInjecting = false;
        };
        script.onerror = () => {
            gsiScriptInjecting = false;
        };
        document.head.appendChild(script);
        gsiScriptInjecting = true;
    }

    /**
     * 等待 GSI 就绪（async 加载，onMounted 时可能未完成；无等待则 OneTap 静默失效）。
     * 轮询定时器经 useTimerRegistry 托管，卸载时自动释放。
     */
    function waitForGsi(timeoutMs = 5000): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            if (unmounted) {
                resolve(false);
                return;
            }
            if ((window as any).google?.accounts?.id) {
                resolve(true);
                return;
            }
            ensureGsiScript();
            const start = Date.now();
            activePollResolve = resolve;
            activePollTimer = timers.every(() => {
                if (unmounted || Date.now() - start > timeoutMs) {
                    const ready = !unmounted && Boolean((window as any).google?.accounts?.id);
                    timers.cancel(activePollTimer);
                    activePollTimer = null;
                    activePollResolve = null;
                    resolve(ready);
                    return;
                }
                if ((window as any).google?.accounts?.id) {
                    timers.cancel(activePollTimer);
                    activePollTimer = null;
                    activePollResolve = null;
                    resolve(true);
                }
            }, 200);
        });
    }

    const handleGoogleOneTap = async (response: any): Promise<void> => {
        const credential = String(response?.credential || '').trim();
        if (!credential) {
            console.warn('[Google One Tap] 未收到有效凭证');
            return;
        }

        options.setSubmitting(true);
        options.setFormState('', '');
        try {
            const result: any = await apiAuthGoogleOneTap(credential);
            const token = String(result?.token || '').trim();
            const user = result?.user || null;
            if (!token || !user) throw new Error(options.t('auth.googleLoginResponseError'));

            setAuthSession({ token, user });
            syncUserRoleToUrl(user);
            options.message.success(options.t('auth.googleLoginSuccess'));
            await options.router.replace(options.resolveRedirectTarget());
            consumePersistedPositionCode();
        } catch (error: any) {
            const detail = String(
                error?.originalError?.response?.data?.detail ||
                    error?.message ||
                    options.t('auth.googleLoginFailed'),
            );
            options.setFormState('error', detail);
            options.message.error(detail);
        } finally {
            options.setSubmitting(false);
        }
    };

    /** 仅在用户未登录时调用，展示 Google 一键登录提示 */
    const initGoogleOneTap = async (): Promise<void> => {
        const gsiReady = await waitForGsi();
        if (unmounted) return;
        if (!gsiReady) {
            console.warn('[Google One Tap] Google Identity Services 脚本加载超时，跳过初始化');
            return;
        }
        const clientId = GOOGLE_OAUTH_CLIENT_ID;
        if (!clientId) {
            console.warn('[Google One Tap] 未配置 VITE_GOOGLE_OAUTH_CLIENT_ID，跳过初始化');
            return;
        }

        const google = (window as any).google;
        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleOneTap,
            auto_select: false,
            cancel_on_tap_outside: true,
            context: 'signin',
            itp_support: true,
        });

        // 在页面右上角展示 One Tap 提示
        google.accounts.id.prompt((notification: any) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                console.warn(
                    '[Google One Tap] 提示未展示:',
                    notification.getNotDisplayedReason?.() || notification.getSkippedReason?.(),
                );
            }
            // 用户关闭/取消 One Tap 提示属于正常行为
        });
    };

    return {
        handleGoogleOneTap,
        initGoogleOneTap,
    };
}
