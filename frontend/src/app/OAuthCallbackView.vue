<template>
    <div class="oauth-callback-container">
        <!-- 动态极光流光背景 -->
        <div class="aurora-bg">
            <div class="aurora-blob blob-1"></div>
            <div class="aurora-blob blob-2"></div>
            <div class="aurora-blob blob-3"></div>
        </div>

        <!-- 主卡片 -->
        <main class="oauth-card" :data-status="currentState">
            <!-- 状态图标指示器 -->
            <div class="status-badge" aria-live="polite">
                <!-- 1. 加载状态：双环脉冲 Spinner -->
                <div v-if="currentState === 'loading'" class="spinner-box" aria-label="处理中">
                    <div class="spinner-ring outer"></div>
                    <div class="spinner-ring inner"></div>
                    <div class="pulse-core"></div>
                </div>

                <!-- 2. 成功状态 -->
                <div v-else-if="currentState === 'success'" class="icon-box success-box" aria-label="成功">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 6L9 17l-5-5"/>
                    </svg>
                </div>

                <!-- 3. 失败状态 -->
                <div v-else-if="currentState === 'error'" class="icon-box error-box" aria-label="失败">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </div>
            </div>

            <!-- 文本与状态描述 -->
            <div class="text-content">
                <h1 class="card-title">{{ cardTitle }}</h1>
                <p class="card-message">{{ statusText }}</p>
            </div>

            <!-- 成功时的加载进度条指示 -->
            <div v-if="currentState === 'success'" class="redirect-progress">
                <div class="progress-bar"></div>
            </div>

            <!-- 操作按钮区域 -->
            <div v-if="currentState === 'error'" class="action-footer">
                <button
                    type="button"
                    class="btn btn-primary"
                    @click="goRegister"
                >
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    <span>返回登录 / 注册</span>
                </button>
            </div>
        </main>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import {
    consumePersistedPositionCode,
    injectPositionCodeToPath,
    peekPersistedPositionCode,
    setAuthSession,
    syncUserRoleToUrl,
} from '@common/user/services/auth';
import { apiAuthCompleteOAuthBind, apiAuthExchangeOAuthLoginTicket } from '../api/backend';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { t } = useLocale();

// 使用严格的状态机管理: 'loading' | 'success' | 'error'
const currentState = ref('loading');
const statusText = ref('正在完成第三方账号授权，请稍候...');

const cardTitle = computed(() => {
    switch (currentState.value) {
        case 'success':
            return t('oauth.success');
        case 'error':
            return t('oauth.error');
        case 'loading':
        default:
            return t('oauth.processing');
    }
});

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
            currentState.value = 'success';
            const bindSuccess = t('oauth.bindSuccess', { provider: provider || t('oauth.thirdParty') });
            statusText.value = bindSuccess;
            message.success(bindSuccess);
            
            setTimeout(async () => {
                await router.replace({ name: 'home' });
            }, 1000);
        } catch (error) {
            currentState.value = 'error';
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
            currentState.value = 'success';
            const loginSuccess = t('oauth.loginSuccess', { provider: provider || t('oauth.thirdParty') });
            statusText.value = loginSuccess;
            message.success(loginSuccess);
            
            setTimeout(async () => {
                await router.replace(resolveRedirectTarget());
                consumePersistedPositionCode();
            }, 1000);
        } catch (error) {
            currentState.value = 'error';
            statusText.value = String(error?.message || t('oauth.exchangeFailed'));
            message.error(statusText.value);
        }
        return;
    }

    currentState.value = 'error';
    statusText.value = errorMessage;
    message.error(errorMessage);
});
</script>

<style scoped>
/* ＝两套核心配色与CSS变量＝ */
.oauth-callback-container {
    --brand-primary: #10b981;
    --brand-dark: #047857;
    --brand-surface: #ecfdf5;
    --bg-page: #f0f7f4;
    --text-primary: #064e3b;
    --text-secondary: #4b6358;
    --danger-color: #f43f5e;
    --danger-surface: #fff1f2;

    position: relative;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--bg-page);
    padding: 24px;
    overflow: hidden;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ＝极光弥散背景＝ */
.aurora-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
}
.aurora-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    opacity: 0.6;
}
.blob-1 {
    width: 350px;
    height: 350px;
    background: #a7f3d0;
    top: -10%;
    left: 15%;
    animation: float 12s infinite alternate ease-in-out;
}
.blob-2 {
    width: 400px;
    height: 400px;
    background: #6ee7b7;
    bottom: -10%;
    right: 10%;
    animation: float 16s infinite alternate-reverse ease-in-out;
}
.blob-3 {
    width: 250px;
    height: 250px;
    background: #34d399;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.3;
}

/* ＝卡片容器＝ */
.oauth-card {
    position: relative;
    z-index: 10;
    width: min(420px, 100%);
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.8);
    border-radius: 24px;
    box-shadow: 
        0 20px 50px -10px rgba(6, 78, 59, 0.08),
        0 1px 3px rgba(0, 0, 0, 0.02);
    padding: 44px 32px 36px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
}

/* ＝图标指示器＝ */
.status-badge {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
}

/* Loading 动画：双向环绕 */
.spinner-box {
    position: relative;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.spinner-ring {
    position: absolute;
    border-radius: 50%;
    border: 2px solid transparent;
}
.spinner-ring.outer {
    inset: 0;
    border-top-color: var(--brand-primary);
    border-right-color: var(--brand-primary);
    animation: rotate 1.2s infinite linear;
}
.spinner-ring.inner {
    inset: 6px;
    border-bottom-color: #34d399;
    animation: rotate-reverse 0.8s infinite linear;
}
.pulse-core {
    width: 10px;
    height: 10px;
    background-color: var(--brand-primary);
    border-radius: 50%;
    animation: pulse 1.5s infinite ease-in-out;
}

/* 图标容器 */
.icon-box {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: springPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
.icon-box svg {
    width: 28px;
    height: 28px;
}
.success-box {
    background: var(--brand-surface);
    color: var(--brand-primary);
    border: 1px solid rgba(16, 185, 129, 0.2);
}
.error-box {
    background: var(--danger-surface);
    color: var(--danger-color);
    border: 1px solid rgba(244, 63, 94, 0.2);
}

/* ＝文本样式＝ */
.text-content {
    margin-bottom: 12px;
}
.card-title {
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.01em;
}
.card-message {
    margin: 0;
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.6;
    word-break: break-word;
}

/* ＝跳转进度条＝ */
.redirect-progress {
    width: 100%;
    height: 3px;
    background: var(--brand-surface);
    border-radius: 3px;
    overflow: hidden;
    margin-top: 20px;
}
.progress-bar {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, var(--brand-primary), #34d399);
    animation: progressFill 1s ease-in-out forwards;
}

/* ＝操作按钮＝ */
.action-footer {
    width: 100%;
    margin-top: 28px;
}
.btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.btn-primary {
    background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-dark) 100%);
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
}
.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
}
.btn-primary:active {
    transform: translateY(0);
}
.btn-icon {
    width: 18px;
    height: 18px;
}

/* ＝ Keyframes 动画定义 ＝ */
@keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
@keyframes rotate-reverse {
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
}
@keyframes pulse {
    0%, 100% { transform: scale(0.75); opacity: 0.5; }
    50% { transform: scale(1.15); opacity: 1; }
}
@keyframes springPop {
    0% { transform: scale(0.3); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
}
@keyframes float {
    0% { transform: translate(0, 0); }
    100% { transform: translate(30px, 20px); }
}
@keyframes progressFill {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(0%); }
}
</style>