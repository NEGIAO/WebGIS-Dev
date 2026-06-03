<template>
    <div class="register-container">
        <div class="container fade-in">
            <div class="form-header">
                <h1 class="form-title">NEGIAO's WebGIS</h1>
                <h1 class="form-title">用户登录/注册</h1>
                <p class="form-subtitle">登录以访问系统主页与受保护 API</p>

                <div class="quick-hints">
                    <div class="hint-item">游客登陆API受限</div>
                </div>
            </div>

            <div class="form-body">
                <div
                    class="mode-switch"
                    role="tablist"
                    aria-label="登录或注册"
                >
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
                                id="username"
                                v-model="username"
                                type="text"
                                :placeholder="mode === 'login'
                                        ? '请输入用户名（游客请输入 user）'
                                        : '3-24位：字母/数字/下划线'
                                    "
                                :required="mode === 'register'"
                                @blur="handleUsernameBlur"
                            />
                        </div>
                        <div
                            v-if="mode === 'login'"
                            class="hint"
                        >
                            <i class="fas fa-info-circle"></i>
                            登录角色由后端统一校验（游客/注册用户/管理员）
                        </div>
                        <div
                            v-else
                            class="hint"
                        >
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
                                id="password"
                                v-model="password"
                                type="password"
                                :placeholder="mode === 'login' ? '请输入密码' : '6-64位，至少包含字母和数字'
                                    "
                                required
                            />
                        </div>
                        <div
                            v-if="mode === 'login'"
                            class="hint"
                        >
                            <i class="fas fa-shield-alt"></i>
                            游客默认一键登陆，无需密码，注册用户请使用注册时设置的密码登录
                        </div>
                        <div
                            v-else
                            class="hint"
                        >
                            <i class="fas fa-shield-alt"></i>
                            注册密码必须包含字母和数字
                        </div>
                    </div>

                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label for="confirmPassword">确认密码</label>
                        <div class="input-group">
                            <i class="icon fas fa-check-circle"></i>
                            <input
                                id="confirmPassword"
                                v-model="confirmPassword"
                                type="password"
                                placeholder="再次输入密码"
                                required
                            />
                        </div>
                    </div>

                    <!-- 注册模式：邮箱 & 验证码 -->
                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label for="email">绑定邮箱</label>
                        <div class="input-group">
                            <i class="icon fas fa-envelope"></i>
                            <input
                                id="email"
                                v-model="email"
                                type="email"
                                placeholder="请输入邮箱地址（可选，用于密码找回）"
                            />
                        </div>
                        <div
                            v-if="emailCheckMessage"
                            class="hint username-check"
                            :class="emailCheckStatus"
                        >
                            <i
                                :class="emailCheckStatus === 'success'
                                    ? 'fas fa-check-circle'
                                    : emailCheckStatus === 'loading'
                                        ? 'fas fa-spinner fa-spin'
                                        : 'fas fa-exclamation-circle'"
                            ></i>
                            {{ emailCheckMessage }}
                        </div>
                    </div>

                    <div
                        v-if="mode === 'register' && email"
                        class="form-group"
                    >
                        <label for="emailCode">邮箱验证码</label>
                        <div class="email-code-row">
                            <div class="input-group email-code-input">
                                <i class="icon fas fa-shield-alt"></i>
                                <input
                                    id="emailCode"
                                    v-model="emailCode"
                                    type="text"
                                    inputmode="numeric"
                                    pattern="[0-9]*"
                                    maxlength="6"
                                    placeholder="6位验证码"
                                    :disabled="emailVerified"
                                />
                            </div>
                            <button
                                v-if="!emailVerified"
                                type="button"
                                class="send-code-btn"
                                :disabled="isSendingCode || codeCountdown > 0"
                                @click="handleSendCode"
                            >
                                <i
                                    class="fas"
                                    :class="isSendingCode ? 'fa-spinner fa-spin' : 'fa-paper-plane'"
                                ></i>
                                {{ codeCountdown > 0 ? `${codeCountdown}s` : '发送验证码' }}
                            </button>
                            <button
                                v-if="!emailVerified && emailCode.length === 6"
                                type="button"
                                class="verify-code-btn"
                                :disabled="isVerifyingCode"
                                @click="handleVerifyCode"
                            >
                                <i
                                    class="fas"
                                    :class="isVerifyingCode ? 'fa-spinner fa-spin' : 'fa-check'"
                                ></i>
                                验证
                            </button>
                            <span
                                v-if="emailVerified"
                                class="verified-badge"
                            >
                                <i class="fas fa-check-circle"></i> 已验证
                            </span>
                        </div>
                    </div>

                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label>选择头像</label>
                        <div
                            class="avatar-grid"
                            role="radiogroup"
                            aria-label="注册头像选择"
                        >
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
                                <img
                                    :src="avatar.src"
                                    :alt="avatar.label"
                                    loading="lazy"
                                />
                                <span>{{ avatar.label }}</span>
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="mode === 'login'"
                        class="quick-action-row"
                    >
                        <button
                            type="button"
                            class="quick-btn guest-login"
                            @click="quickGuestLogin"
                        >
                            <i class="fas fa-person-hiking"></i>
                            游客一键登陆
                        </button>
                        <button
                            type="button"
                            class="quick-btn confirm-login"
                            :disabled="isSubmitting"
                            @click="handleSubmit"
                        >
                            <i class="fas fa-sign-in-alt"></i>
                            {{ isSubmitting ? '处理中...' : '确认登陆' }}
                        </button>
                    </div>

                    <!-- 登录模式：忘记密码链接 -->
                    <div
                        v-if="mode === 'login'"
                        class="forgot-password-row"
                    >
                        <a
                            href="#"
                            class="forgot-link"
                            @click.prevent="openResetPanel"
                        >
                            <i class="fas fa-key"></i>
                            忘记密码？
                        </a>
                    </div>

                    <div
                        v-if="formMessage"
                        :class="['validation-message', formStatus]"
                    >
                        {{ formMessage }}
                    </div>

                    <button
                        v-if="mode === 'register'"
                        type="submit"
                        class="btn"
                        :disabled="isSubmitting"
                    >
                        {{ isSubmitting ? '处理中...' : '创建账号' }}
                    </button>

                    <div class="login-link">
                        <template v-if="mode === 'login'">
                            还没有账号？
                            <a
                                href="#"
                                @click.prevent="switchMode('register')"
                            >立即注册</a>
                        </template>
                        <template v-else>
                            已有账号？
                            <a
                                href="#"
                                @click.prevent="switchMode('login')"
                            >返回登录</a>
                        </template>
                    </div>
                </form>
            </div>

            <!-- 密码重置弹窗 -->
            <div
                v-if="showResetPanel"
                class="reset-overlay"
            >
                <div class="reset-panel">
                    <div class="reset-header">
                        <h3><i class="fas fa-unlock-alt"></i> 密码重置</h3>
                        <button
                            type="button"
                            class="reset-close"
                            @click="closeResetPanel"
                        >
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Step 1: 输入邮箱 -->
                    <div
                        v-if="resetStep === 1"
                        class="reset-body"
                    >
                        <p class="reset-desc">请输入您注册时绑定的邮箱，我们将发送验证码</p>
                        <div class="input-group">
                            <i class="icon fas fa-envelope"></i>
                            <input
                                v-model="resetEmail"
                                type="email"
                                placeholder="请输入绑定的邮箱地址"
                            />
                        </div>
                        <button
                            type="button"
                            class="btn reset-btn"
                            :disabled="isResetSubmitting"
                            @click="handleResetSendCode"
                        >
                            <i
                                class="fas"
                                :class="isResetSubmitting ? 'fa-spinner fa-spin' : 'fa-paper-plane'"
                            ></i>
                            {{ isResetSubmitting ? '发送中...' : '发送验证码' }}
                        </button>
                    </div>

                    <!-- Step 2: 输入验证码 + 新密码 -->
                    <div
                        v-if="resetStep === 2"
                        class="reset-body"
                    >
                        <p class="reset-desc">
                            验证码已发送至 <strong>{{ resetEmail }}</strong>
                        </p>
                        <div class="input-group">
                            <i class="icon fas fa-shield-alt"></i>
                            <input
                                v-model="resetCode"
                                type="text"
                                maxlength="6"
                                placeholder="6位验证码"
                            />
                        </div>
                        <div class="input-group">
                            <i class="icon fas fa-lock"></i>
                            <input
                                v-model="resetNewPassword"
                                type="password"
                                placeholder="新密码（6-64位，含字母和数字）"
                            />
                        </div>
                        <button
                            type="button"
                            class="btn reset-btn"
                            :disabled="isResetSubmitting"
                            @click="handleResetSubmit"
                        >
                            <i
                                class="fas"
                                :class="isResetSubmitting ? 'fa-spinner fa-spin' : 'fa-check'"
                            ></i>
                            {{ isResetSubmitting ? '提交中...' : '重置密码' }}
                        </button>
                        <button
                            v-if="resetCodeCountdown <= 0"
                            type="button"
                            class="resend-btn"
                            @click="handleResetSendCode"
                        >
                            重新发送验证码
                        </button>
                        <span
                            v-else
                            class="countdown-text"
                        >
                            {{ resetCodeCountdown }}s 后可重新发送
                        </span>
                    </div>
                </div>
            </div>

            <div class="form-footer">
                登录即表示您同意我们的 <router-link to="/terms">服务条款</router-link> 和 <router-link to="/privacy">隐私政策</router-link>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from '../composables/useMessage';
import {
    apiAuthCheckUsername,
    apiAuthLogin,
    apiAuthRegister,
    apiAuthSendCode,
    apiAuthVerifyCode,
    apiAuthResetPassword,
    apiLocationTrackVisit,
} from '../api/backend';
import {
    consumePersistedPositionCode,
    getAuthToken,
    getOrCreateGuestDeviceId,
    syncUserRoleToUrl,
    injectPositionCodeToPath,
    peekPersistedPositionCode,
    setAuthSession,
} from '../services/auth';

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
let gisPrewarmTimer = null;

// ─── 邮箱 & 验证码 ───
const email = ref('');
const emailCode = ref('');
const isSendingCode = ref(false);
const isVerifyingCode = ref(false);
const codeCountdown = ref(0);
const emailVerified = ref(false);
const emailCheckStatus = ref('');
const emailCheckMessage = ref('');
let countdownTimer = null;

// ─── 密码重置 ───
const showResetPanel = ref(false);
const resetEmail = ref('');
const resetCode = ref('');
const resetNewPassword = ref('');
const resetStep = ref(1); // 1=输入邮箱, 2=输入验证码+新密码
const isResetSubmitting = ref(false);
const resetCodeCountdown = ref(0);
let resetCountdownTimer = null;

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const usernameRegex = /^[A-Za-z0-9_]{3,24}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{6,64}$/;
const reservedNames = new Set(['user', 'admin']);

const avatarOptions = computed(() => {
    return Array.from({ length: 12 }, (_, index) => ({
        index,
        label: `头像 ${index + 1}`,
        src: resolvePublicAssetPath(`avatars/avatar-${index}.svg`),
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
    const safeRedirect = redirect.startsWith('/') ? redirect : '/home';
    const persistedPositionCode = peekPersistedPositionCode();
    return injectPositionCodeToPath(safeRedirect, persistedPositionCode);
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

function _fillGuestAccount() {
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
        consumePersistedPositionCode();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message ||
            '游客登陆失败，请稍后重试',
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
        !force &&
        normalizedUsername === lastCheckedUsername.value &&
        (usernameCheckStatus.value === 'success' || usernameCheckStatus.value === 'error')
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
            error?.originalError?.response?.data?.detail ||
            error?.message ||
            '用户名校验失败，请稍后重试',
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
        consumePersistedPositionCode();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message ||
            '登录失败，请稍后重试',
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
    const normalizedEmail = String(email.value || '').trim().toLowerCase();

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
            normalizedEmail,
            emailCode.value,
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
            error?.originalError?.response?.data?.detail ||
            error?.message ||
            '注册失败，请稍后重试',
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

// ─── 邮箱验证码逻辑 ───

/**
 * 发送邮箱验证码（注册用）
 * 校验邮箱格式 → 调用后端发送接口 → 启动 60 秒倒计时
 */
async function handleSendCode() {
    const normalizedEmail = String(email.value || '').trim().toLowerCase();
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
        setFormState('error', '请输入有效的邮箱地址');
        return;
    }
    if (codeCountdown.value > 0) return;

    isSendingCode.value = true;
    emailCheckStatus.value = 'loading';
    emailCheckMessage.value = '正在发送验证码...';
    setFormState('', '');

    try {
        await apiAuthSendCode(normalizedEmail, 'register', normalizeUsername(username.value));
        emailCheckStatus.value = 'success';
        emailCheckMessage.value = '验证码已发送，请查收邮箱';
        message.success('验证码已发送至您的邮箱');
        // 启动 60 秒倒计时
        codeCountdown.value = 60;
        countdownTimer = setInterval(() => {
            codeCountdown.value--;
            if (codeCountdown.value <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
            }
        }, 1000);
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || '验证码发送失败，请稍后重试',
        );
        emailCheckStatus.value = 'error';
        emailCheckMessage.value = detail;
        setFormState('error', detail);
    } finally {
        isSendingCode.value = false;
    }
}

/**
 * 校验邮箱验证码（注册用）
 * 调用后端 verify-code 接口，成功后标记邮箱已验证
 */
async function handleVerifyCode() {
    const normalizedEmail = String(email.value || '').trim().toLowerCase();
    const code = String(emailCode.value || '').trim();
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
        setFormState('error', '请输入有效的邮箱地址');
        return;
    }
    if (!code || code.length !== 6) {
        setFormState('error', '请输入 6 位验证码');
        return;
    }

    isVerifyingCode.value = true;
    setFormState('', '');

    try {
        await apiAuthVerifyCode(normalizedEmail, code, 'register');
        emailVerified.value = true;
        emailCheckStatus.value = 'success';
        emailCheckMessage.value = '✅ 邮箱验证成功';
        message.success('邮箱验证成功');
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || '验证码校验失败',
        );
        emailCheckStatus.value = 'error';
        emailCheckMessage.value = detail;
        setFormState('error', detail);
    } finally {
        isVerifyingCode.value = false;
    }
}

// ─── 密码重置逻辑 ───

/**
 * 打开密码重置面板
 */
function openResetPanel() {
    showResetPanel.value = true;
    resetStep.value = 1;
    resetEmail.value = '';
    resetCode.value = '';
    resetNewPassword.value = '';
    setFormState('', '');
}

/**
 * 关闭密码重置面板
 */
function closeResetPanel() {
    showResetPanel.value = false;
    resetStep.value = 1;
    if (resetCountdownTimer) {
        clearInterval(resetCountdownTimer);
        resetCountdownTimer = null;
    }
    setFormState('', '');
}

/**
 * 发送密码重置验证码
 */
async function handleResetSendCode() {
    const normalizedEmail = String(resetEmail.value || '').trim().toLowerCase();
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
        setFormState('error', '请输入有效的邮箱地址');
        return;
    }
    if (resetCodeCountdown.value > 0) return;

    isResetSubmitting.value = true;
    setFormState('', '');

    try {
        await apiAuthSendCode(normalizedEmail, 'reset_password');
        message.success('验证码已发送至您的邮箱');
        resetStep.value = 2;
        resetCodeCountdown.value = 60;
        resetCountdownTimer = setInterval(() => {
            resetCodeCountdown.value--;
            if (resetCodeCountdown.value <= 0) {
                clearInterval(resetCountdownTimer);
                resetCountdownTimer = null;
            }
        }, 1000);
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || '验证码发送失败',
        );
        setFormState('error', detail);
        message.error(detail);
    } finally {
        isResetSubmitting.value = false;
    }
}

/**
 * 提交密码重置
 */
async function handleResetSubmit() {
    const normalizedEmail = String(resetEmail.value || '').trim().toLowerCase();
    const code = String(resetCode.value || '').trim();
    const newPass = String(resetNewPassword.value || '').trim();

    if (!code || code.length !== 6) {
        setFormState('error', '请输入 6 位验证码');
        return;
    }
    if (!passwordRegex.test(newPass)) {
        setFormState('error', '新密码需包含字母和数字，长度 6-64 位');
        return;
    }

    isResetSubmitting.value = true;
    setFormState('', '');

    try {
        await apiAuthResetPassword(normalizedEmail, code, newPass);
        message.success('密码已重置，请使用新密码登录');
        closeResetPanel();
        setFormState('success', '密码重置成功，请使用新密码登录');
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || '密码重置失败',
        );
        setFormState('error', detail);
        message.error(detail);
    } finally {
        isResetSubmitting.value = false;
    }
}

/**
 * 邮箱输入变化时重置验证状态
 */
watch(email, () => {
    if (emailVerified.value) {
        emailVerified.value = false;
        emailCheckStatus.value = '';
        emailCheckMessage.value = '';
        emailCode.value = '';
    }
    // 邮箱变更时重置倒计时
    if (countdownTimer !== null) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    codeCountdown.value = 0;
});

onMounted(async () => {
    const token = getAuthToken();
    if (token) {
        await router.replace(resolveRedirectTarget());
        consumePersistedPositionCode();
        return;
    }

    // 自动发送定位追踪请求（无需等待，异步处理）
    // 用户进入登陆页面时自动记录访问信息到数据库
    apiLocationTrackVisit({
        userAgent: navigator?.userAgent,
        referrer: document?.referrer,
    })
        .then((result) => {
            if (result?.tracked) {
                console.warn('[Location Tracking] 访问已记录:', {
                    ip: result?.ip,
                    city: result?.city,
                    province: result?.province,
                    country: result?.country,
                });
            }
        })
        .catch((error) => {
            // 失败不影响登陆页面使用，静默处理
            console.warn('[Location Tracking] 追踪请求失败:', error?.message);
        });
    // 首屏加载后默认1秒 1S 1s 后开始加载，可根据实际情况调整这个预热时机和延迟，确保不与首屏关键资源争抢带宽。
    // 登录页就绪 1 秒后才开始后台预热 GIS 资产，避免首屏带宽争抢。
    if (typeof window !== 'undefined') {
        gisPrewarmTimer = window.setTimeout(() => {
            if (route.name !== 'register') return;

            import('../utils/gis/deferredGisWarmupLauncher')
                .then((mod) => mod.launchDeferredGisWarmup())
                .catch((error) => {
                    console.warn(
                        '[GIS Prewarm] 预热失败(不影响登录流程):',
                        error?.message || error,
                    );
                });
        }, 1000);
    }
});

onUnmounted(() => {
    if (gisPrewarmTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(gisPrewarmTimer);
        gisPrewarmTimer = null;
    }
    if (countdownTimer !== null) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    if (resetCountdownTimer !== null) {
        clearInterval(resetCountdownTimer);
        resetCountdownTimer = null;
    }
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
*,
*::before,
*::after {
    box-sizing: border-box;
}

:root {
    --primary-color: var(--brand-primary);
    --primary-hover: var(--brand-primary-dark);
    --error-color: var(--danger);
    --success-color: var(--brand-primary);
    --text-color: var(--text-primary);
    --light-bg: var(--bg-secondary);
    --border-color: var(--border-light);
}

.register-container {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: var(--text-primary);
    background-color: var(--bg-secondary);
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
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
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
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
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
    border: 1px solid var(--border-brand-light);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 22px;
}

.mode-btn {
    border: none;
    background: var(--bg-brand-light);
    color: var(--text-brand-dark);
    padding: 10px 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}

.mode-btn.active {
    background: var(--brand-primary);
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
    color: var(--text-primary);
    letter-spacing: 0.3px;
    transition: color 0.3s ease;
}

.form-group:hover label {
    color: var(--brand-primary);
}

.input-group {
    position: relative;
}

.input-group .icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
}

input {
    width: 100%;
    padding: 12px 12px 12px 40px;
    border: 1px solid var(--border-light);
    border-radius: 5px;
    transition: all 0.3s ease;
    font-size: 15px;
}

input:focus {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.15);
}

.hint {
    display: flex;
    align-items: center;
    margin-top: 6px;
    font-size: 13px;
    color: var(--text-secondary);
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
    color: var(--brand-primary-dark);
}

.username-check.error {
    color: var(--danger);
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
    border: 1px solid var(--border-brand-light);
    border-radius: 10px;
    background: #f8fbf8;
    color: var(--text-brand-dark);
    padding: 8px;
    display: grid;
    justify-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.avatar-item:hover {
    transform: translateY(-1px);
    border-color: var(--brand-primary-light);
    background: var(--bg-brand-light);
}

.avatar-item.active {
    border-color: var(--brand-primary);
    background: var(--bg-brand-light);
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.15);
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
    color: var(--danger);
    display: block;
}

.validation-message.success {
    color: var(--brand-primary);
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
    border: 1px solid var(--border-brand-light);
    background: var(--bg-brand-light);
    color: var(--text-brand-dark);
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
    background: var(--bg-brand-light);
    border-color: var(--brand-primary-light);
    transform: translateY(-1px);
}

.quick-btn.guest-login {
    background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-brand-light) 100%);
    border-color: var(--brand-primary-light);
}

.quick-btn.guest-login:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--bg-brand-lighter) 0%, var(--bg-brand-light) 100%);
    border-color: var(--brand-primary-light);
    box-shadow: 0 2px 6px rgba(var(--brand-primary-rgb), 0.2);
}

.quick-btn.confirm-login {
    background: linear-gradient(135deg, var(--bg-brand-lighter) 0%, var(--brand-primary-lighter) 100%);
    border-color: var(--brand-primary-light);
    color: var(--text-brand-dark);
    font-weight: 600;
}

.quick-btn.confirm-login:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--brand-primary-lighter) 0%, var(--brand-primary-light) 100%);
    border-color: var(--brand-accent-dark);
    box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), 0.3);
}

.quick-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn {
    display: block;
    width: 100%;
    background-color: var(--brand-primary);
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
    background-color: var(--brand-primary-dark);
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
    color: var(--text-secondary);
}

.login-link a {
    color: var(--brand-primary);
    text-decoration: none;
    font-weight: 500;
}

.login-link a:hover {
    text-decoration: underline;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.fade-in {
    animation: fadeIn 0.5s ease forwards;
}

.form-footer {
    padding: 15px 30px;
    text-align: center;
    background-color: var(--bg-secondary);
    border-top: 1px solid var(--border-light);
    font-size: 13px;
    color: var(--text-muted);
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

/* ─── 邮箱验证码行 ─── */
.email-code-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.email-code-input {
    flex: 1;
}

.send-code-btn,
.verify-code-btn {
    white-space: nowrap;
    padding: 10px 14px;
    border: 1px solid var(--border-brand-light);
    border-radius: 5px;
    background: linear-gradient(135deg, var(--bg-brand-lighter), var(--bg-brand-light));
    color: var(--text-brand-dark);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 4px;
}

.send-code-btn:hover:not(:disabled),
.verify-code-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--brand-primary-lighter), var(--brand-primary-light));
    border-color: var(--brand-primary);
    transform: translateY(-1px);
}

.send-code-btn:disabled,
.verify-code-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.verified-badge {
    color: var(--brand-primary-dark);
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
}

/* ─── 忘记密码链接 ─── */
.forgot-password-row {
    text-align: right;
    margin-top: -12px;
    margin-bottom: 12px;
}

.forgot-link {
    color: var(--text-secondary);
    font-size: 13px;
    text-decoration: none;
    transition: color 0.2s;
}

.forgot-link:hover {
    color: var(--brand-primary);
    text-decoration: underline;
}

.forgot-link i {
    margin-right: 3px;
}

/* ─── 密码重置弹窗 ─── */
.reset-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(3px);
}

.reset-panel {
    background: #fff;
    border-radius: 12px;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    animation: fadeIn 0.3s ease;
}

.reset-header {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.reset-header h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
}

.reset-header h3 i {
    margin-right: 6px;
}

.reset-close {
    background: none;
    border: none;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s;
}

.reset-close:hover {
    opacity: 1;
}

.reset-body {
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.reset-desc {
    margin: 0;
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.5;
}

.reset-btn {
    margin-top: 8px;
}

.resend-btn {
    display: block;
    width: 100%;
    background: none;
    border: 1px dashed var(--border-light);
    padding: 10px;
    border-radius: 5px;
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
}

.resend-btn:hover {
    border-color: var(--brand-primary);
    color: var(--brand-primary);
}

.countdown-text {
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
}
</style>
