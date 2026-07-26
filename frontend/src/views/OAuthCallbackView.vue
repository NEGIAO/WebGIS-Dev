<template>
    <div class="oauth-callback-page">
        <div class="oauth-card">
            <h1>第三方登录处理中</h1>
            <p>{{ statusText }}</p>
            <button
                v-if="hasError"
                type="button"
                class="back-btn"
                @click="goRegister"
            >
                返回登录页
            </button>
        </div>
    </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from '../composables/useMessage';
import {
    consumePersistedPositionCode,
    injectPositionCodeToPath,
    peekPersistedPositionCode,
    setAuthSession,
    syncUserRoleToUrl,
} from '../services/auth';
import { apiAuthCompleteOAuthBind, apiAuthExchangeOAuthLoginTicket } from '../api/backend';

const route = useRoute();
const router = useRouter();
const message = useMessage();

const statusText = ref('正在完成 Google/GitHub 授权，请稍候...');
const hasError = ref(false);

function resolveRedirectTarget() {
    const redirect = String(route.query?.redirect || '/home').trim();
    const safeRedirect = redirect.startsWith('/') ? redirect : '/home';
    const persistedPositionCode = peekPersistedPositionCode();
    return injectPositionCodeToPath(safeRedirect, persistedPositionCode);
}

function goRegister() {
    router.replace({ name: 'register' });
}

function clearCallbackQuery() {
    if (typeof window === 'undefined') return;
    const cleanHash = '#/oauth/callback';
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}${cleanHash}`);
}

onMounted(async () => {
    const status = String(route.query?.status || '').trim().toLowerCase();
    const provider = String(route.query?.provider || '').trim();
    const ticket = String(route.query?.ticket || '').trim();
    const errorMessage = String(route.query?.message || '第三方登录失败').trim();
    clearCallbackQuery();

    if (status === 'bind_pending' && ticket) {
        try {
            await apiAuthCompleteOAuthBind(provider, ticket);
            statusText.value = `${provider || '第三方'} 账号绑定成功`;
            message.success(statusText.value);
            await router.replace({ name: 'home' });
        } catch (error) {
            hasError.value = true;
            statusText.value = String(error?.message || '第三方账号绑定失败');
            message.error(statusText.value);
        }
        return;
    }

    if (status === 'success' && ticket) {
        try {
            const result = await apiAuthExchangeOAuthLoginTicket(ticket);
            const token = String(result?.token || '').trim();
            const user = result?.user || null;
            if (!token || !user) throw new Error('OAuth 登录兑换响应异常');
            setAuthSession({ token, user });
            syncUserRoleToUrl(user);
            statusText.value = `${provider || '第三方'} 登录成功，正在进入系统...`;
            message.success(`${provider || '第三方'} 登录成功`);
            await router.replace(resolveRedirectTarget());
            consumePersistedPositionCode();
        } catch (error) {
            hasError.value = true;
            statusText.value = String(error?.message || '第三方登录 ticket 兑换失败');
            message.error(statusText.value);
        }
        return;
    }

    hasError.value = true;
    statusText.value = errorMessage;
    message.error(errorMessage);
});
</script>

<style scoped>
.oauth-callback-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary, #f5f7f6);
    padding: 20px;
}

.oauth-card {
    width: min(420px, 100%);
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
    padding: 28px 24px;
    text-align: center;
}

.oauth-card h1 {
    margin: 0 0 12px;
    font-size: 22px;
}

.oauth-card p {
    margin: 0;
    color: #5b6b63;
    line-height: 1.6;
}

.back-btn {
    margin-top: 18px;
    border: none;
    border-radius: 8px;
    background: var(--brand-primary, #2f8f5b);
    color: #fff;
    padding: 10px 16px;
    cursor: pointer;
}
</style>
