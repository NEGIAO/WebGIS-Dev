import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { apiAuthMe } from '../api/backend';
import { clearAuthSession, getAuthToken } from '../utils/auth';

type AuthUser = {
    username?: string;
    role?: string;
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

        if (validatedToken.value === token) {
            return true;
        }

        try {
            const result = await withTimeout(apiAuthMe());
            const payload = (result && typeof result === 'object' && 'data' in result)
                ? (result as any).data
                : result;
            const nextUser = payload?.user;
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
        beginAuthCheck,
        endAuthCheck,
        resetValidation,
        ensureValidSession,
    };
});
