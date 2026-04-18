<template>
    <div class="register-container">
        <div class="container fade-in">
            <div class="form-header">
                <h1 class="form-title">NEGIAO's WebGIS</h1>
                <h1 class="form-title"> 用户登录/注册</h1>
                <p class="form-subtitle">登录以访问系统主页与受保护 API</p>

                <div class="quick-hints">
                    <div class="hint-item">游客登陆API受限</div>
                </div>
            </div>
            
            <div class="form-body">
                <div class="mode-switch" role="tablist" aria-label="登录或注册">
                    <button
                        type="button"
                        class="mode-btn"
                        :class="{ active: mode === 'login' }"
                        @click="switchMode('login')"
                    >
                        登录
                    </button>
                    <button
                        type="button"
                        class="mode-btn"
                        :class="{ active: mode === 'register' }"
                        @click="switchMode('register')"
                    >
                        注册
                    </button>
                </div>

                <form @submit.prevent="handleSubmit">
                    <div class="form-group">
                        <label for="username">用户名</label>
                        <div class="input-group">
                            <i class="icon fas fa-user"></i>
                            <input 
                                type="text" 
                                id="username" 
                                v-model="username" 
                                :placeholder="mode === 'login' ? '请输入用户名（游客请输入 user）' : '3-24位：字母/数字/下划线'"
                                :required="mode === 'register'"
                                @blur="handleUsernameBlur"
                            >
                        </div>
                        <div class="hint" v-if="mode === 'login'">
                            <i class="fas fa-info-circle"></i>
                            登录角色由后端统一校验（游客/注册用户/管理员）
                        </div>
                        <div class="hint" v-else>
                            <i class="fas fa-user-plus"></i>
                            user/admin 为保留用户名，不能注册
                        </div>
                        <div
                            v-if="mode === 'register' && usernameCheckMessage"
                            class="hint username-check"
                            :class="usernameCheckStatus"
                        >
                            <i :class="usernameCheckIcon"></i>
                            {{ usernameCheckMessage }}
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="password">密码</label>
                        <div class="input-group">
                            <i class="icon fas fa-lock"></i>
                            <input 
                                type="password" 
                                id="password" 
                                v-model="password" 
                                :placeholder="mode === 'login' ? '请输入密码' : '6-64位，至少包含字母和数字'"
                                required
                            >
                        </div>
                        <div class="hint" v-if="mode === 'login'">
                            <i class="fas fa-shield-alt"></i>
                            游客默认一键登陆，无需密码，注册用户请使用注册时设置的密码登录
                        </div>
                        <div class="hint" v-else>
                            <i class="fas fa-shield-alt"></i>
                            注册密码必须包含字母和数字
                        </div>
                    </div>

                    <div class="form-group" v-if="mode === 'register'">
                        <label for="confirmPassword">确认密码</label>
                        <div class="input-group">
                            <i class="icon fas fa-check-circle"></i>
                            <input
                                type="password"
                                id="confirmPassword"
                                v-model="confirmPassword"
                                placeholder="再次输入密码"
                                required
                            >
                        </div>
                    </div>

                    <div class="form-group" v-if="mode === 'register'">
                        <label>选择头像</label>
                        <div class="avatar-grid" role="radiogroup" aria-label="注册头像选择">
                            <button
                                v-for="avatar in avatarOptions"
                                :key="avatar.index"
                                type="button"
                                class="avatar-item"
                                :class="{ active: selectedAvatarIndex === avatar.index }"
                                :aria-label="avatar.label"
                                :aria-pressed="selectedAvatarIndex === avatar.index"
                                @click="selectedAvatarIndex = avatar.index"
                            >
                                <img :src="avatar.src" :alt="avatar.label" loading="lazy">
                                <span>{{ avatar.label }}</span>
                            </button>
                        </div>
                    </div>

                    <div class="quick-action-row" v-if="mode === 'login'">
                        <button type="button" class="quick-btn guest-login" @click="quickGuestLogin">
                            <i class="fas fa-person-hiking"></i>
                            游客一键登陆
                        </button>
                        <button type="button" class="quick-btn confirm-login" :disabled="isSubmitting" @click="handleSubmit">
                            <i class="fas fa-sign-in-alt"></i>
                            {{ isSubmitting ? '处理中...' : '确认登陆' }}
                        </button>
                    </div>

                    <div v-if="formMessage" :class="['validation-message', formStatus]">
                        {{ formMessage }}
                    </div>
                    
                    <button v-if="mode === 'register'" type="submit" class="btn" :disabled="isSubmitting">
                        {{ isSubmitting ? '处理中...' : '创建账号' }}
                    </button>
                    
                    <div class="login-link">
                        <template v-if="mode === 'login'">
                            还没有账号？ <a href="#" @click.prevent="switchMode('register')">立即注册</a>
                        </template>
                        <template v-else>
                            已有账号？ <a href="#" @click.prevent="switchMode('login')">返回登录</a>
                        </template>
                    </div>
                </form>
            </div>
            
            <div class="form-footer">
                登录即表示您同意我们的 <a href="#">服务条款</a> 和 <a href="#">隐私政策</a>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from '../composables/useMessage';
import { apiAuthCheckUsername, apiAuthLogin, apiAuthRegister, apiLocationTrackVisit, syncUserRoleToUrl } from '../api/backend';
import { getAuthToken, getOrCreateGuestDeviceId, setAuthSession } from '../utils/auth';

const router = useRouter();
const route = useRoute();
const message = useMessage();

const mode = ref('login');
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const selectedAvatarIndex = ref(0);
const isSubmitting = ref(false);
const isCheckingUsername = ref(false);
const formMessage = ref('');
const formStatus = ref('');
const usernameCheckStatus = ref('');
const usernameCheckMessage = ref('');
const lastCheckedUsername = ref('');

const usernameRegex = /^[A-Za-z0-9_]{3,24}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{6,64}$/;
const reservedNames = new Set(['user', 'admin']);

const avatarOptions = computed(() => {
    return Array.from({ length: 8 }, (_, index) => ({
        index,
        label: `头像 ${index + 1}`,
        src: resolvePublicAssetPath(`avatars/avatar-${index}.svg`)
    }));
});

const usernameCheckIcon = computed(() => {
    if (usernameCheckStatus.value === 'success') {
        return 'fas fa-check-circle';
    }
    if (usernameCheckStatus.value === 'loading') {
        return 'fas fa-spinner fa-spin';
    }
    return 'fas fa-exclamation-circle';
});

function setFormState(status = '', text = '') {
    formStatus.value = status;
    formMessage.value = text;
}

function normalizeUsername(raw) {
    return String(raw || '').trim();
}

function resolvePublicAssetPath(relativePath) {
    const base = String(import.meta.env.BASE_URL || '/').trim();
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const normalizedPath = String(relativePath || '').replace(/^\/+/, '');
    return `${normalizedBase}${normalizedPath}`;
}

function resetUsernameCheck() {
    usernameCheckStatus.value = '';
    usernameCheckMessage.value = '';
    lastCheckedUsername.value = '';
}

function resolveRedirectTarget() {
    const redirect = String(route.query?.redirect || '/home').trim();
    return redirect.startsWith('/') ? redirect : '/home';
}

function switchMode(nextMode) {
    mode.value = nextMode;
    setFormState('', '');
    if (nextMode === 'login') {
        confirmPassword.value = '';
        resetUsernameCheck();
        selectedAvatarIndex.value = 0;
    }
}

function fillGuestAccount() {
    mode.value = 'login';
    username.value = 'user';
    password.value = '123';
    resetUsernameCheck();
    setFormState('success', '已填入游客账号，请点击“登录系统”');
}
async function quickGuestLogin() {
    isSubmitting.value = true;
    setFormState('', '');

    try {
        const guestDeviceId = getOrCreateGuestDeviceId();
        // 游客一键登陆：账号 user，密码 123
        const result = await apiAuthLogin({ 
            username: 'user',
            password: '123',
            guest_device_id: guestDeviceId || undefined,
        });
        const token = String(result?.token || '').trim();
        const user = result?.user || null;

        if (!token || !user) {
            throw new Error('游客登录响应异常，请稍后重试');
        }

        setAuthSession({ token, user });
        syncUserRoleToUrl(user);
        message.success(`游客登陆成功，欢迎使用！`);
        await router.replace(resolveRedirectTarget());
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail
            || error?.message
            || '游客登陆失败，请稍后重试'
        );
        setFormState('error', detail);
        message.error(detail);
    } finally {
        isSubmitting.value = false;
    }
}
async function checkUsernameAvailability({ silent = false, force = false } = {}) {
    if (mode.value !== 'register') {
        return true;
    }

    const normalizedUsername = normalizeUsername(username.value);
    if (!normalizedUsername) {
        usernameCheckStatus.value = 'error';
        usernameCheckMessage.value = '请先输入用户名';
        lastCheckedUsername.value = '';
        if (!silent) {
            message.warning(usernameCheckMessage.value);
        }
        return false;
    }

    const lowered = normalizedUsername.toLowerCase();
    if (reservedNames.has(lowered)) {
        usernameCheckStatus.value = 'error';
        usernameCheckMessage.value = 'user/admin 为系统保留用户名';
        lastCheckedUsername.value = normalizedUsername;
        if (!silent) {
            message.warning(usernameCheckMessage.value);
        }
        return false;
    }

    if (!usernameRegex.test(normalizedUsername)) {
        usernameCheckStatus.value = 'error';
        usernameCheckMessage.value = '用户名仅支持字母、数字、下划线，长度 3-24 位';
        lastCheckedUsername.value = normalizedUsername;
        if (!silent) {
            message.warning(usernameCheckMessage.value);
        }
        return false;
    }

    if (
        !force
        && normalizedUsername === lastCheckedUsername.value
        && (usernameCheckStatus.value === 'success' || usernameCheckStatus.value === 'error')
    ) {
        return usernameCheckStatus.value === 'success';
    }

    isCheckingUsername.value = true;
    usernameCheckStatus.value = 'loading';
    usernameCheckMessage.value = '正在检查用户名可用性...';

    try {
        const result = await apiAuthCheckUsername(normalizedUsername);
        const available = Boolean(result?.available);
        const detail = String(result?.message || (available ? '用户名可用' : '用户名不可用'));

        lastCheckedUsername.value = normalizedUsername;
        usernameCheckStatus.value = available ? 'success' : 'error';
        usernameCheckMessage.value = detail;

        if (!silent && !available) {
            message.warning(detail);
        }

        return available;
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail
            || error?.message
            || '用户名校验失败，请稍后重试'
        );
        usernameCheckStatus.value = 'error';
        usernameCheckMessage.value = detail;
        lastCheckedUsername.value = normalizedUsername;
        if (!silent) {
            message.error(detail);
        }
        return false;
    } finally {
        isCheckingUsername.value = false;
    }
}

async function handleUsernameBlur() {
    if (mode.value !== 'register') {
        return;
    }
    await checkUsernameAvailability();
}

async function handleLogin() {
    const normalizedUsername = normalizeUsername(username.value);
    const normalizedPassword = String(password.value || '').trim();

    if (!normalizedPassword) {
        setFormState('error', '请输入密码');
        return;
    }

    isSubmitting.value = true;
    setFormState('', '');

    try {
        const payload = { password: normalizedPassword };
        if (normalizedUsername) {
            payload.username = normalizedUsername;
        }
        if (normalizedUsername.toLowerCase() === 'user') {
            payload.guest_device_id = getOrCreateGuestDeviceId() || undefined;
        }

        const result = await apiAuthLogin(payload);
        const token = String(result?.token || '').trim();
        const user = result?.user || null;

        if (!token || !user) {
            throw new Error('登录响应异常，请稍后重试');
        }

        setAuthSession({ token, user });
        syncUserRoleToUrl(user);
        message.success(`登录成功，当前角色：${String(user.role || 'unknown')}`);
        await router.replace(resolveRedirectTarget());
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail
            || error?.message
            || '登录失败，请稍后重试'
        );
        setFormState('error', detail);
        message.error(detail);
    } finally {
        isSubmitting.value = false;
    }
}

async function handleRegister() {
    const normalizedUsername = normalizeUsername(username.value);
    const normalizedPassword = String(password.value || '').trim();
    const normalizedConfirmPassword = String(confirmPassword.value || '').trim();

    if (!normalizedUsername) {
        setFormState('error', '请填写用户名');
        return;
    }

    if (reservedNames.has(normalizedUsername.toLowerCase())) {
        setFormState('error', 'user/admin 为系统保留用户名');
        return;
    }

    if (!usernameRegex.test(normalizedUsername)) {
        setFormState('error', '用户名仅支持字母、数字、下划线，长度 3-24 位');
        return;
    }

    if (!passwordRegex.test(normalizedPassword)) {
        setFormState('error', '密码需包含字母和数字，长度 6-64 位');
        return;
    }

    if (normalizedConfirmPassword !== normalizedPassword) {
        setFormState('error', '两次输入的密码不一致');
        return;
    }

    const isUsernameAvailable = await checkUsernameAvailability({ silent: true, force: true });
    if (!isUsernameAvailable) {
        const detail = usernameCheckMessage.value || '用户名不可用，请更换后重试';
        setFormState('error', detail);
        message.warning(detail);
        return;
    }

    isSubmitting.value = true;
    setFormState('', '');

    try {
        await apiAuthRegister(
            normalizedUsername,
            normalizedPassword,
            selectedAvatarIndex.value,
        );
        message.success('注册成功，请使用新账号登录');
        password.value = '';
        confirmPassword.value = '';
        selectedAvatarIndex.value = 0;
        resetUsernameCheck();
        switchMode('login');
        setFormState('success', '注册完成，请输入账号密码登录');
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail
            || error?.message
            || '注册失败，请稍后重试'
        );
        setFormState('error', detail);
        message.error(detail);
    } finally {
        isSubmitting.value = false;
    }
}

async function handleSubmit() {
    if (isSubmitting.value) return;
    if (mode.value === 'register') {
        await handleRegister();
        return;
    }
    await handleLogin();
}

onMounted(async () => {
    const token = getAuthToken();
    if (token) {
        await router.replace('/home');
    }

    // 自动发送定位追踪请求（无需等待，异步处理）
    // 用户进入登陆页面时自动记录访问信息到数据库
    apiLocationTrackVisit({
        userAgent: navigator?.userAgent,
        referrer: document?.referrer
    }).then((result) => {
        if (result?.tracked) {
            console.log('[Location Tracking] 访问已记录:', {
                ip: result?.ip,
                city: result?.city,
                province: result?.province,
                country: result?.country
            });
        }
    }).catch((error) => {
        // 失败不影响登陆页面使用，静默处理
        console.warn('[Location Tracking] 追踪请求失败:', error?.message);
    });
});

watch(username, (nextUsername) => {
    if (mode.value !== 'register') {
        return;
    }

    const normalized = normalizeUsername(nextUsername);
    if (!normalized) {
        resetUsernameCheck();
        return;
    }

    if (normalized !== lastCheckedUsername.value) {
        usernameCheckStatus.value = '';
        usernameCheckMessage.value = '';
    }
});
</script>

<style scoped>
/* Scoped styles from Register.html */
*, *::before, *::after {
    box-sizing: border-box;
}

:root {
    --primary-color: #4CAF50;
    --primary-hover: #45a049;
    --error-color: #f44336;
    --success-color: #4CAF50;
    --text-color: #333;
    --light-bg: #f9f9f9;
    --border-color: #e0e0e0;
}

.register-container {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f9f9f9;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100dvh;
    padding: clamp(10px, 2.6vw, 20px);
    width: 100%;
    box-sizing: border-box;
    overflow: auto;
}

.container {
    background-color: #fff;
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 450px;
    max-height: calc(100dvh - 24px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.form-header {
    background: linear-gradient(135deg, #4CAF50, #2E7D32);
    color: white;
    padding: 25px;
    text-align: center;
    position: relative;
}

.form-title {
    font-weight: 700;
    font-size: 28px;
    margin-bottom: 0px;
    margin-top: 0px;
    letter-spacing: 0.5px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    
}

.form-subtitle {
    font-size: 15px;
    opacity: 0.9;
    font-weight: 300;
    margin-top: 5px;
}

.quick-hints {
    margin-top: 12px;
    display: grid;
    gap: 6px;
}

.hint-item {
    padding: 5px 10px;
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    font-size: 13px;
    border: 1px solid rgba(255, 255, 255, 0.3);
}

.form-body {
    padding: clamp(20px, 3.5vw, 35px);
    padding-top: 3%;
    background-color: #ffffff;
    flex: 1;
    overflow-y: auto;
}

.mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid #dfe8df;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 22px;
}

.mode-btn {
    border: none;
    background: #f4f8f4;
    color: #406040;
    padding: 10px 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}

.mode-btn.active {
    background: #4CAF50;
    color: #fff;
}

.form-group {
    margin-bottom: 28px;
    position: relative;
    transition: all 0.3s ease;
}

.form-group:hover {
    transform: translateY(-2px);
}

label {
    display: block;
    margin-bottom: 10px;
    font-weight: 500;
    font-size: 15px;
    color: #444;
    letter-spacing: 0.3px;
    transition: color 0.3s ease;
}

.form-group:hover label {
    color: #4CAF50;
}

.input-group {
    position: relative;
}

.input-group .icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #999;
}

input {
    width: 100%;
    padding: 12px 12px 12px 40px;
    border: 1px solid #e0e0e0;
    border-radius: 5px;
    transition: all 0.3s ease;
    font-size: 15px;
}

input:focus {
    outline: none;
    border-color: #4CAF50;
    box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.15);
}

.hint {
    display: flex;
    align-items: center;
    margin-top: 6px;
    font-size: 13px;
    color: #666;
}

.hint i {
    margin-right: 5px;
    font-size: 14px;
}

.username-check {
    margin-top: 8px;
    font-weight: 500;
}

.username-check.success {
    color: #2e7d32;
}

.username-check.error {
    color: #d32f2f;
}

.username-check.loading {
    color: #5f6f7f;
}

.avatar-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
}

.avatar-item {
    border: 1px solid #dfe7df;
    border-radius: 10px;
    background: #f8fbf8;
    color: #2e402e;
    padding: 8px;
    display: grid;
    justify-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.avatar-item:hover {
    transform: translateY(-1px);
    border-color: #7cb87c;
    background: #f1f8f1;
}

.avatar-item.active {
    border-color: #4CAF50;
    background: #edf7ed;
    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.15);
}

.avatar-item img {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
}

.avatar-item span {
    font-size: 12px;
    font-weight: 600;
}

.validation-message {
    margin-top: 8px;
    font-size: 13px;
    display: none;
}

.validation-message.error {
    color: #f44336;
    display: block;
}

.validation-message.success {
    color: #4CAF50;
    display: block;
}

.quick-action-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
    margin-bottom: 20px;
}

.quick-btn {
    border: 1px solid #9ab79a;
    background: #f7fbf7;
    color: #2b5a2b;
    border-radius: 5px;
    padding: 11px 8px;
    font-size: 14px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}

.quick-btn i {
    font-size: 14px;
}

.quick-btn:hover:not(:disabled) {
    background: #edf7ed;
    border-color: #7cb87c;
    transform: translateY(-1px);
}

.quick-btn.guest-login {
    background: linear-gradient(135deg, #e8f5e9 0%, #f1f8f1 100%);
    border-color: #81c784;
}

.quick-btn.guest-login:hover:not(:disabled) {
    background: linear-gradient(135deg, #dceee4 0%, #e8f5e9 100%);
    border-color: #66bb6a;
    box-shadow: 0 2px 6px rgba(76, 175, 80, 0.2);
}

.quick-btn.confirm-login {
    background: linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 100%);
    border-color: #66bb6a;
    color: #1b5e20;
    font-weight: 600;
}

.quick-btn.confirm-login:hover:not(:disabled) {
    background: linear-gradient(135deg, #a5d6a7 0%, #81c784 100%);
    border-color: #558b2f;
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
}

.quick-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn {
    display: block;
    width: 100%;
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 14px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    transition: all 0.3s ease;
    text-align: center;
    margin-top: 20px;
}

.btn:hover {
    background-color: #45a049;
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}

.btn:active {
    transform: translateY(0);
}

.btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.login-link {
    text-align: center;
    margin-top: 20px;
    font-size: 14px;
    color: #666;
}

.login-link a {
    color: #4CAF50;
    text-decoration: none;
    font-weight: 500;
}

.login-link a:hover {
    text-decoration: underline;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.fade-in {
    animation: fadeIn 0.5s ease forwards;
}

.form-footer {
    padding: 15px 30px;
    text-align: center;
    background-color: #f7f7f7;
    border-top: 1px solid #eee;
    font-size: 13px;
    color: #777;
    flex-shrink: 0;
}

.default-login-hint {
    margin-top: 10px;
    padding: 5px 10px;
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    display: inline-block;
    border: 1px solid rgba(255, 255, 255, 0.3);
}

@media (max-width: 768px) {
    .register-container {
        align-items: stretch;
        padding: 8px;
    }

    .container {
        max-width: 100%;
        border-radius: 8px;
        max-height: none;
        min-height: calc(100dvh - 16px);
    }

    .form-body {
        padding: 18px;
    }

    .form-header {
        padding: 18px;
    }

    .form-title {
        font-size: 24px;
    }

    .form-footer {
        padding: 12px 16px;
    }

    .avatar-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
}
</style>
