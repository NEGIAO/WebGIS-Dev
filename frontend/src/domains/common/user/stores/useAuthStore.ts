import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { apiAuthMe } from '@/api/backend';
import { clearAuthSession, getAuthToken, isGuestSession } from '@common/user/services/auth';
import { EMERGENCY_GUEST_MODE } from '@/config/publicRuntime';

type AuthUser = {
    username?: string;
    role?: string;
    requires_email_binding?: boolean;
    guest_uid?: string;
    [key: string]: unknown;
};

const AUTH_CHECK_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = AUTH_CHECK_TIMEOUT_MS): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('AUTH_CHECK_TIMEOUT'));
        }, timeoutMs);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

export const useAuthStore = defineStore('authStore', () => {
    const user = ref<AuthUser | null>(null);
    const validatedToken = ref('');
    const checkingCount = ref(0);

    const isAuthChecking = computed(() => checkingCount.value > 0);
    const requiresEmailBinding = computed(() => user.value?.requires_email_binding === true);

    function beginAuthCheck() {
        checkingCount.value += 1;
    }

    function endAuthCheck() {
        checkingCount.value = Math.max(0, checkingCount.value - 1);
    }

    function resetValidation() {
        user.value = null;
        validatedToken.value = '';
    }

    async function ensureValidSession() {
        const token = getAuthToken();

        if (!token) {
            resetValidation();
            return false;
        }

        // 应急游客强制模式下：游客会话直接信任，不再向后端 apiAuthMe 请求验证。
        // 否则后端离线时请求抛异常 → clearAuthSession → 拒绝放行，访客将无法浏览。
        if (EMERGENCY_GUEST_MODE && isGuestSession()) {
            return true;
        }

        if (validatedToken.value === token) {
            return true;
        }

        try {
            const result = await withTimeout(apiAuthMe());
            const payload =
                result && typeof result === 'object' && 'data' in result
                    ? (result as { data: { user?: AuthUser } | unknown }).data
                    : result;
            const nextUser = typeof payload === 'object' && payload !== null && 'user' in payload
                ? (payload as { user?: AuthUser }).user
                : null;
            user.value = nextUser && typeof nextUser === 'object' ? (nextUser as AuthUser) : null;
            validatedToken.value = token;
            return true;
        } catch {
            clearAuthSession();
            resetValidation();
            return false;
        }
    }

    return {
        user,
        isAuthChecking,
        requiresEmailBinding,
        beginAuthCheck,
        endAuthCheck,
        resetValidation,
        ensureValidSession,
    };
});
