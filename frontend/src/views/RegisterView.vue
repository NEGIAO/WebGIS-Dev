<template>
    <div class="register-container">
        <div class="container fade-in">
            <div class="form-header">
                <div class="brand-badge">
                    <i class="fas fa-earth-asia"></i>
                </div>
                <h1 class="form-title">NEGIAO's WebGIS</h1>
                <p class="app-purpose-title">地理空间数据可视化与在线 WebGIS 平台</p>
                <p class="form-subtitle">
                    NEGIAO's WebGIS 用于浏览、导入、分析和保存个人地图项目；Google 登录仅用于账户认证与保存你的地图配置。
                </p>

                <div class="quick-hints">
                    <div class="hint-item"><i class="fas fa-map-location-dot"></i>WebGIS 地图可视化</div>
                    <div class="hint-item"><i class="fas fa-floppy-disk"></i>个人地图项目保存</div>
                    <div class="hint-item"><i class="fas fa-user-clock"></i>游客登陆 API 受限</div>
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

                <div
                    v-if="!requiresEmailBinding"
                    class="oauth-section"
                >
                    <button
                        type="button"
                        class="oauth-btn google"
                        @click="handleOAuthLogin('google')"
                    >
                        <i class="fab fa-google"></i>
                        使用 Google 继续
                    </button>
                    <button
                        type="button"
                        class="oauth-btn github"
                        @click="handleOAuthLogin('github')"
                    >
                        <i class="fab fa-github"></i>
                        使用 GitHub 继续
                    </button>
                    <div class="oauth-divider">
                        <span>或使用邮箱账号</span>
                    </div>
                </div>

                <form
                    v-if="!requiresEmailBinding"
                    @submit.prevent="handleSubmit"
                >
                    <div class="form-group">
                        <label for="username">{{ mode === 'login' ? '邮箱账号' : '昵称' }}</label>
                        <div class="input-group">
                            <i
                                class="icon fas"
                                :class="mode === 'login' ? 'fa-envelope' : 'fa-user'"
                            ></i>
                            <input
                                id="username"
                                v-model="username"
                                type="text"
                                :placeholder="mode === 'login'
                                        ? '请输入邮箱（旧用户可暂用原用户名）'
                                        : '请输入昵称，1-40个字符'
                                    "
                                :required="mode === 'register'"
                            />
                        </div>
                        <div
                            v-if="mode === 'login'"
                            class="hint"
                        >
                            <i class="fas fa-info-circle"></i>
                            新账号使用邮箱登录；旧账号会引导绑定邮箱
                        </div>
                        <div
                            v-else
                            class="hint"
                        >
                            <i class="fas fa-user-plus"></i>
                            昵称用于展示，可重复，后续可在账号中心修改
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
                        <label for="email">邮箱账号</label>
                        <div class="input-group">
                            <i class="icon fas fa-envelope"></i>
                            <input
                                id="email"
                                v-model="email"
                                type="email"
                                placeholder="请输入邮箱地址"
                                required
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
                        v-if="mode === 'register'"
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

                <form
                    v-else
                    class="legacy-bind-form"
                    @submit.prevent="handleBindEmailSubmit"
                >
                    <div class="bind-alert">
                        <i class="fas fa-envelope-circle-check"></i>
                        <div>
                            <strong>需要绑定邮箱</strong>
                            <p>你的旧账号已通过密码校验。绑定邮箱后，后续将使用邮箱进行登录、密码重置和身份验证。</p>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bindEmail">绑定邮箱</label>
                        <div class="input-group">
                            <i class="icon fas fa-envelope"></i>
                            <input
                                id="bindEmail"
                                v-model="bindEmail"
                                type="email"
                                placeholder="请输入邮箱地址"
                                required
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bindCode">邮箱验证码</label>
                        <div class="email-code-row">
                            <div class="input-group email-code-input">
                                <i class="icon fas fa-shield-alt"></i>
                                <input
                                    id="bindCode"
                                    v-model="bindCode"
                                    type="text"
                                    inputmode="numeric"
                                    pattern="[0-9]*"
                                    maxlength="6"
                                    placeholder="6位验证码"
                                />
                            </div>
                            <button
                                type="button"
                                class="send-code-btn"
                                :disabled="isBindingCodeSending || bindCodeCountdown > 0"
                                @click="handleBindSendCode"
                            >
                                <i
                                    class="fas"
                                    :class="isBindingCodeSending ? 'fa-spinner fa-spin' : 'fa-paper-plane'"
                                ></i>
                                {{ bindCodeCountdown > 0 ? `${bindCodeCountdown}s` : '发送验证码' }}
                            </button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bindPassword">当前密码</label>
                        <div class="input-group">
                            <i class="icon fas fa-lock"></i>
                            <input
                                id="bindPassword"
                                v-model="bindCurrentPassword"
                                type="password"
                                placeholder="请输入当前账号密码"
                                required
                            />
                        </div>
                    </div>

                    <div
                        v-if="formMessage"
                        :class="['validation-message', formStatus]"
                    >
                        {{ formMessage }}
                    </div>

                    <button
                        type="submit"
                        class="btn"
                        :disabled="isSubmitting"
                    >
                        {{ isSubmitting ? '绑定中...' : '绑定邮箱并进入系统' }}
                    </button>

                    <div class="login-link">
                        <a
                            href="#"
                            @click.prevent="cancelBinding"
                        >返回登录</a>
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
                                inputmode="numeric"
                                pattern="[0-9]*"
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
                        <div class="input-group">
                            <i class="icon fas fa-check-circle"></i>
                            <input
                                v-model="resetConfirmPassword"
                                type="password"
                                placeholder="再次输入新密码"
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
                            v-if="resetCodeSent && resetCodeCountdown <= 0"
                            type="button"
                            class="resend-btn"
                            @click="handleResetSendCode"
                        >
                            重新发送验证码
                        </button>
                        <span
                            v-if="resetCodeCountdown > 0"
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
    apiAuthLogin,
    apiAuthRegister,
    apiAuthSendCode,
    apiAuthVerifyCode,
    apiAuthResetPassword,
    apiAuthBindEmail,
    apiLocationTrackVisit,
    redirectToOAuthProvider,
} from '../api/backend';
import {
    consumePersistedPositionCode,
    clearAuthSession,
    getAuthToken,
    getAuthUser,
    getOrCreateGuestDeviceId,
    syncUserRoleToUrl,
    injectPositionCodeToPath,
    peekPersistedPositionCode,
    setAuthSession,
} from '../services/auth';
import {
    getUserDisplayName,
    isValidEmail,
    isValidPassword,
    normalizeCredential,
    normalizeDisplayName,
    normalizeEmail,
    validateDisplayName,
} from '../composables/auth/useAuthIdentity';

const router = useRouter();
const route = useRoute();
const message = useMessage();

const mode = ref('login');
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const selectedAvatarIndex = ref(0);
const isSubmitting = ref(false);
const formMessage = ref('');
const formStatus = ref('');
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

// ─── 旧账号绑定邮箱 ───
const requiresEmailBinding = ref(false);
const bindEmail = ref('');
const bindCode = ref('');
const bindCurrentPassword = ref('');
const bindCodeCountdown = ref(0);
const isBindingCodeSending = ref(false);
let bindCountdownTimer = null;

// ─── 密码重置 ───
const showResetPanel = ref(false);
const resetEmail = ref('');
const resetCode = ref('');
const resetNewPassword = ref('');
const resetConfirmPassword = ref('');
const resetStep = ref(1); // 1=输入邮箱, 2=输入验证码+新密码
const isResetSubmitting = ref(false);
const resetCodeCountdown = ref(0);
const resetCodeSent = ref(false);
let resetCountdownTimer = null;

const avatarOptions = computed(() => {
    return Array.from({ length: 12 }, (_, index) => ({
        index,
        label: `头像 ${index + 1}`,
        src: resolvePublicAssetPath(`avatars/avatar-${index}.svg`),
    }));
});

function setFormState(status = '', text = '') {
    formStatus.value = status;
    formMessage.value = text;
}

function normalizeUsername(raw) {
    return normalizeCredential(raw);
}

function resolvePublicAssetPath(relativePath) {
    const base = String(import.meta.env.BASE_URL || '/').trim();
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const normalizedPath = String(relativePath || '').replace(/^\/+/, '');
    return `${normalizedBase}${normalizedPath}`;
}

function resolveRedirectTarget() {
    const redirect = String(route.query?.redirect || '/home').trim();
    const safeRedirect = redirect.startsWith('/') ? redirect : '/home';
    const persistedPositionCode = peekPersistedPositionCode();
    return injectPositionCodeToPath(safeRedirect, persistedPositionCode);
}

function switchMode(nextMode) {
    mode.value = nextMode;
    requiresEmailBinding.value = false;
    setFormState('', '');
    if (nextMode === 'login') {
        confirmPassword.value = '';
        email.value = '';
        emailCode.value = '';
        emailVerified.value = false;
        selectedAvatarIndex.value = 0;
    }
}

/**
 * 跳转 Google/GitHub OAuth 登录入口。
 * @param {'google'|'github'} provider
 */
function handleOAuthLogin(provider) {
    setFormState('', '');
    redirectToOAuthProvider(provider);
}

function _fillGuestAccount() {
    mode.value = 'login';
    username.value = 'user';
    password.value = '123';
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
        if (user?.requires_email_binding) {
            requiresEmailBinding.value = true;
            bindCurrentPassword.value = normalizedPassword;
            setFormState('success', '旧账号验证成功，请绑定邮箱完成迁移');
            message.warning('请先绑定邮箱后继续使用完整功能');
            return;
        }

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
    const displayValidation = validateDisplayName(username.value);
    const normalizedPassword = String(password.value || '').trim();
    const normalizedConfirmPassword = String(confirmPassword.value || '').trim();
    const normalizedEmail = normalizeEmail(email.value);

    if (!displayValidation.valid) {
        setFormState('error', displayValidation.message);
        return;
    }

    if (!isValidEmail(normalizedEmail)) {
        setFormState('error', '请输入有效的邮箱地址');
        return;
    }

    if (!emailVerified.value) {
        setFormState('error', '请先完成邮箱验证码验证');
        return;
    }

    if (!isValidPassword(normalizedPassword)) {
        setFormState('error', '密码需包含字母和数字，长度 6-64 位');
        return;
    }

    if (normalizedConfirmPassword !== normalizedPassword) {
        setFormState('error', '两次输入的密码不一致');
        return;
    }

    isSubmitting.value = true;
    setFormState('', '');

    try {
        await apiAuthRegister({
            email: normalizedEmail,
            email_code: emailCode.value,
            password: normalizedPassword,
            display_name: displayValidation.value,
            avatar_index: selectedAvatarIndex.value,
        });
        message.success('注册成功，请使用邮箱登录');
        username.value = '';
        password.value = '';
        confirmPassword.value = '';
        email.value = '';
        emailCode.value = '';
        emailVerified.value = false;
        selectedAvatarIndex.value = 0;
        switchMode('login');
        setFormState('success', '注册完成，请输入邮箱和密码登录');
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
 * 启动 30 秒发送倒计时
 */
function startSendCountdown() {
    codeCountdown.value = 30;
    countdownTimer = setInterval(() => {
        codeCountdown.value--;
        if (codeCountdown.value <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
    }, 1000);
}

/**
 * 启动重置密码 30 秒发送倒计时
 */
function startResetCountdown() {
    resetCodeCountdown.value = 30;
    resetCountdownTimer = setInterval(() => {
        resetCodeCountdown.value--;
        if (resetCodeCountdown.value <= 0) {
            clearInterval(resetCountdownTimer);
            resetCountdownTimer = null;
        }
    }, 1000);
}

function startBindCountdown() {
    bindCodeCountdown.value = 30;
    bindCountdownTimer = setInterval(() => {
        bindCodeCountdown.value--;
        if (bindCodeCountdown.value <= 0) {
            clearInterval(bindCountdownTimer);
            bindCountdownTimer = null;
        }
    }, 1000);
}

/**
 * 发送邮箱验证码（注册用）
 * 校验邮箱格式 → 调用后端发送接口 → 成功后启动 30 秒倒计时
 */
async function handleSendCode() {
    const normalizedEmail = normalizeEmail(email.value);
    if (!isValidEmail(normalizedEmail)) {
        setFormState('error', '请输入有效的邮箱地址');
        return;
    }
    if (codeCountdown.value > 0) return;

    isSendingCode.value = true;
    emailCheckStatus.value = 'loading';
    emailCheckMessage.value = '正在发送验证码...';
    setFormState('', '');

    try {
        await apiAuthSendCode(normalizedEmail, 'register', normalizeDisplayName(username.value));
        emailCheckStatus.value = 'success';
        emailCheckMessage.value = '验证码已发送，请查收邮箱';
        message.success('验证码已发送至您的邮箱');
        startSendCountdown();
    } catch (error) {
        const isTimeout = error?.code === 'ECONNABORTED'
            || /timeout/i.test(String(error?.message || ''));
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || '验证码发送失败，请稍后重试',
        );

        const isRateLimited = error?.isQuotaExceeded
            || error?.originalError?.response?.status === 429;

        if (isTimeout || isRateLimited) {
            // 超时或频率限制：后端可能已收到请求或需要等待，启动倒计时防止重复发送
            if (isRateLimited) {
                emailCheckStatus.value = 'loading';
                emailCheckMessage.value = detail || '发送过于频繁，请稍后再试';
                message.warning(detail || '发送过于频繁，请稍后再试');
            } else {
                emailCheckStatus.value = 'loading';
                emailCheckMessage.value = '请求超时，邮件可能正在发送中，请稍后查收邮箱';
            }
            startSendCountdown();
        } else {
            emailCheckStatus.value = 'error';
            emailCheckMessage.value = detail;
            setFormState('error', detail);
        }
    } finally {
        isSendingCode.value = false;
    }
}

/**
 * 校验邮箱验证码（注册用）
 * 调用后端 verify-code 接口，成功后标记邮箱已验证
 */
async function handleVerifyCode() {
    const normalizedEmail = normalizeEmail(email.value);
    const code = String(emailCode.value || '').trim();
    if (!isValidEmail(normalizedEmail)) {
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

async function handleBindSendCode() {
    const normalizedEmail = normalizeEmail(bindEmail.value);
    if (!isValidEmail(normalizedEmail)) {
        setFormState('error', '请输入有效的邮箱地址');
        return;
    }
    if (bindCodeCountdown.value > 0) return;

    isBindingCodeSending.value = true;
    setFormState('', '');

    try {
        await apiAuthSendCode(normalizedEmail, 'bind_email', getUserDisplayName(getStoredBindingUser()));
        message.success('验证码已发送至您的邮箱');
        startBindCountdown();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || '验证码发送失败，请稍后重试',
        );
        setFormState('error', detail);
        message.error(detail);
    } finally {
        isBindingCodeSending.value = false;
    }
}

function getStoredBindingUser() {
    return getAuthUser();
}

async function handleBindEmailSubmit() {
    const normalizedEmail = normalizeEmail(bindEmail.value);
    const code = String(bindCode.value || '').trim();
    const currentPass = String(bindCurrentPassword.value || '').trim();

    if (!isValidEmail(normalizedEmail)) {
        setFormState('error', '请输入有效的邮箱地址');
        return;
    }
    if (!code || code.length !== 6) {
        setFormState('error', '请输入 6 位验证码');
        return;
    }
    if (!currentPass) {
        setFormState('error', '请输入当前账号密码');
        return;
    }

    isSubmitting.value = true;
    setFormState('', '');

    try {
        const result = await apiAuthBindEmail(normalizedEmail, code, currentPass);
        const token = String(result?.token || '').trim();
        const user = result?.user || null;
        if (!token || !user) {
            throw new Error('邮箱绑定响应异常，请稍后重试');
        }

        setAuthSession({ token, user });
        syncUserRoleToUrl(user);
        requiresEmailBinding.value = false;
        message.success('邮箱绑定成功');
        await router.replace(resolveRedirectTarget());
        consumePersistedPositionCode();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || '邮箱绑定失败',
        );
        setFormState('error', detail);
        message.error(detail);
    } finally {
        isSubmitting.value = false;
    }
}

function cancelBinding() {
    clearBindingState();
    clearAuthSession();
    setFormState('', '');
}

function clearBindingState() {
    requiresEmailBinding.value = false;
    bindEmail.value = '';
    bindCode.value = '';
    bindCurrentPassword.value = '';
    bindCodeCountdown.value = 0;
    if (bindCountdownTimer !== null) {
        clearInterval(bindCountdownTimer);
        bindCountdownTimer = null;
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
    resetConfirmPassword.value = '';
    resetCodeSent.value = false;
    setFormState('', '');
}

/**
 * 关闭密码重置面板
 */
function closeResetPanel() {
    showResetPanel.value = false;
    resetStep.value = 1;
    resetCodeSent.value = false;
    if (resetCountdownTimer) {
        clearInterval(resetCountdownTimer);
        resetCountdownTimer = null;
    }
    resetCodeCountdown.value = 0;
}

/**
 * 发送密码重置验证码
 */
async function handleResetSendCode() {
    const normalizedEmail = normalizeEmail(resetEmail.value);
    if (!isValidEmail(normalizedEmail)) {
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
        resetCodeSent.value = true;
        startResetCountdown();
    } catch (error) {
        const isTimeout = error?.code === 'ECONNABORTED'
            || /timeout/i.test(String(error?.message || ''));
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || '验证码发送失败',
        );

        const isRateLimited = error?.isQuotaExceeded
            || error?.originalError?.response?.status === 429;

        if (isTimeout || isRateLimited) {
            // 超时或频率限制：后端可能已收到请求或需要等待，启动倒计时防止重复发送
            if (isRateLimited) {
                message.warning(detail || '发送过于频繁，请稍后再试');
            } else {
                message.warning('请求超时，邮件可能正在发送中，请稍后查收邮箱');
            }
            resetStep.value = 2;
            resetCodeSent.value = true;
            startResetCountdown();
        } else {
            setFormState('error', detail);
            message.error(detail);
        }
    } finally {
        isResetSubmitting.value = false;
    }
}

/**
 * 提交密码重置
 */
async function handleResetSubmit() {
    const normalizedEmail = normalizeEmail(resetEmail.value);
    const code = String(resetCode.value || '').trim();
    const newPass = String(resetNewPassword.value || '').trim();
    const confirmPass = String(resetConfirmPassword.value || '').trim();

    if (!isValidEmail(normalizedEmail)) {
        setFormState('error', '请输入有效的邮箱地址');
        return;
    }
    if (!code || code.length !== 6) {
        setFormState('error', '请输入 6 位验证码');
        return;
    }
    if (!isValidPassword(newPass)) {
        setFormState('error', '新密码需包含字母和数字，长度 6-64 位');
        return;
    }
    if (newPass !== confirmPass) {
        setFormState('error', '两次输入的密码不一致');
        return;
    }

    isResetSubmitting.value = true;
    setFormState('', '');

    try {
        await apiAuthResetPassword(normalizedEmail, code, newPass);
        message.success('密码已重置，请使用新密码登录');
        setFormState('success', '密码重置成功，请使用新密码登录');
        closeResetPanel();
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

/**
 * 重置密码邮箱变更时回退到 step 1（验证码已失效）
 */
watch(resetEmail, () => {
    if (resetStep.value === 2) {
        resetStep.value = 1;
        resetCode.value = '';
        resetNewPassword.value = '';
        resetConfirmPassword.value = '';
        resetCodeSent.value = false;
        if (resetCountdownTimer) {
            clearInterval(resetCountdownTimer);
            resetCountdownTimer = null;
        }
        resetCodeCountdown.value = 0;
    }
});

onMounted(async () => {
    const oauthStatus = String(route.query?.status || '').trim().toLowerCase();
    const oauthMessage = String(route.query?.message || '').trim();
    if (oauthStatus === 'error' && oauthMessage) {
        setFormState('error', oauthMessage);
        message.error(oauthMessage);

        // 显示后清掉 OAuth 错误 query，避免刷新页面重复弹同一条错误。
        const nextQuery = { ...route.query };
        delete nextQuery.status;
        delete nextQuery.message;
        delete nextQuery.provider;
        await router.replace({ name: 'register', query: nextQuery });
    }

    const token = getAuthToken();
    if (token) {
        const storedUser = getAuthUser();
        if (storedUser?.requires_email_binding) {
            requiresEmailBinding.value = true;
            setFormState('success', '请先绑定邮箱以完成旧账号迁移');
            return;
        }

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
    if (bindCountdownTimer !== null) {
        clearInterval(bindCountdownTimer);
        bindCountdownTimer = null;
    }
});
</script>

<style scoped>
*,
*::before,
*::after {
    box-sizing: border-box;
}

.register-container {
    font-family: var(--font-base, 'PingFang SC', 'Microsoft YaHei', sans-serif);
    line-height: 1.6;
    color: var(--text-primary);
    background-color: var(--bg-secondary);
    background-image:
        radial-gradient(ellipse 70% 55% at 10% -5%, rgba(var(--brand-primary-rgb), 0.1), transparent 60%),
        radial-gradient(ellipse 55% 45% at 105% 105%, rgba(var(--brand-primary-rgb), 0.08), transparent 60%);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100dvh;
    padding: clamp(10px, 2.6vw, 24px);
    width: 100%;
    overflow: auto;
}

.container {
    background-color: var(--bg-primary);
    border-radius: 16px;
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.05),
        0 24px 60px -16px rgba(20, 45, 25, 0.18);
    width: 100%;
    max-width: 440px;
    max-height: calc(100dvh - 24px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* ─── 头部 ─── */
.form-header {
    position: relative;
    background: linear-gradient(140deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    color: #fff;
    padding: 22px 24px 18px;
    text-align: center;
    overflow: hidden;
    /* 关键：注册模式表单变高时，禁止 flex 压缩头部卡片（否则头部被表单区遮挡/裁切） */
    flex-shrink: 0;
}

/* 经纬网格纹理，呼应 GIS 主题 */
.form-header::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
    background-size: 26px 26px;
    -webkit-mask-image: radial-gradient(ellipse 95% 110% at 50% 0%, #000 30%, transparent 100%);
    mask-image: radial-gradient(ellipse 95% 110% at 50% 0%, #000 30%, transparent 100%);
    pointer-events: none;
}

.form-header > * {
    position: relative;
}

.brand-badge {
    width: 46px;
    height: 46px;
    margin: 0 auto 10px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
}

.form-title {
    font-weight: 700;
    font-size: 24px;
    margin: 0;
    letter-spacing: 0.4px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}

.app-purpose-title {
    margin: 4px 0 0;
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: 0.2px;
    opacity: 0.95;
}

.form-subtitle {
    font-size: 12px;
    opacity: 0.82;
    font-weight: 400;
    margin: 8px auto 0;
    max-width: 34em;
    line-height: 1.55;
}

.quick-hints {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
}

.hint-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    background-color: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
}

.hint-item i {
    font-size: 11px;
    opacity: 0.9;
}

/* ─── 表单主体 ─── */
.form-body {
    padding: clamp(18px, 3.2vw, 28px);
    background-color: var(--bg-primary);
    flex: 1;
    overflow-y: auto;
}

.form-body::-webkit-scrollbar {
    width: 6px;
}

.form-body::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.14);
    border-radius: 3px;
}

.mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    margin-bottom: 18px;
}

.mode-btn {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    padding: 9px 12px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 9px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.mode-btn:hover:not(.active) {
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.08);
}

.mode-btn.active {
    background: var(--brand-primary);
    color: #fff;
    box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), 0.35);
}

.oauth-section {
    display: grid;
    gap: 10px;
    margin-bottom: 18px;
}

.oauth-btn {
    width: 100%;
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 11px 14px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: all 0.2s ease;
}

.oauth-btn i {
    font-size: 16px;
}

.oauth-btn.google i {
    color: #4285f4;
}

.oauth-btn.github i {
    color: #24292f;
}

.oauth-btn:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.55);
    background: rgba(var(--brand-primary-rgb), 0.04);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.07);
}

.oauth-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-muted);
    font-size: 12px;
    margin-top: 2px;
}

.oauth-divider::before,
.oauth-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-light);
}

/* ─── 输入控件 ─── */
.form-group {
    margin-bottom: 16px;
    position: relative;
}

label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
    font-size: 13.5px;
    color: var(--text-primary);
    letter-spacing: 0.2px;
    transition: color 0.2s ease;
}

.form-group:focus-within > label {
    color: var(--brand-primary-dark);
}

.input-group {
    position: relative;
}

.input-group .icon {
    position: absolute;
    left: 13px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    font-size: 14px;
    transition: color 0.2s ease;
    pointer-events: none;
}

.input-group:focus-within .icon {
    color: var(--brand-primary);
}

input {
    width: 100%;
    padding: 11px 12px 11px 38px;
    border: 1px solid var(--border-light);
    border-radius: 10px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input::placeholder {
    color: var(--text-muted);
    font-size: 13px;
}

input:hover:not(:focus):not(:disabled) {
    border-color: rgba(var(--brand-primary-rgb), 0.45);
}

input:focus {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.14);
}

input:disabled {
    background: var(--bg-secondary);
    color: var(--text-muted);
    cursor: not-allowed;
}

.hint {
    display: flex;
    align-items: flex-start;
    margin-top: 5px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
}

.hint i {
    margin-right: 5px;
    margin-top: 2px;
    font-size: 12px;
    flex-shrink: 0;
}

.username-check {
    margin-top: 6px;
    font-weight: 500;
    font-size: 12.5px;
}

.username-check.success {
    color: var(--brand-primary-dark);
}

.username-check.error {
    color: var(--danger);
}

.username-check.loading {
    color: var(--text-secondary);
}

/* ─── 邮箱验证码行 ─── */
.email-code-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
}

.email-code-input {
    flex: 1;
    min-width: 0;
}

.send-code-btn,
.verify-code-btn {
    white-space: nowrap;
    padding: 10px 14px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.35);
    border-radius: 10px;
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--brand-primary-dark);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 5px;
}

.send-code-btn:hover:not(:disabled),
.verify-code-btn:hover:not(:disabled) {
    background: rgba(var(--brand-primary-rgb), 0.15);
    border-color: var(--brand-primary);
}

.send-code-btn:disabled,
.verify-code-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.verified-badge {
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.1);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 10px;
    padding: 0 12px;
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 5px;
}

/* ─── 头像选择 ─── */
.avatar-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.avatar-item {
    border: 1px solid var(--border-light);
    border-radius: 12px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    padding: 8px 4px;
    display: grid;
    justify-items: center;
    gap: 5px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.avatar-item:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--brand-primary-rgb), 0.5);
    background: rgba(var(--brand-primary-rgb), 0.06);
}

.avatar-item.active {
    border-color: var(--brand-primary);
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--brand-primary-dark);
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.18);
}

.avatar-item img {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    object-fit: cover;
}

.avatar-item span {
    font-size: 11px;
    font-weight: 600;
}

/* ─── 校验提示与按钮 ─── */
.validation-message {
    display: none;
    margin-top: 12px;
    padding: 9px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.5;
}

.validation-message.error {
    display: block;
    color: var(--danger);
    background: rgba(var(--danger-rgb), 0.07);
    border: 1px solid rgba(var(--danger-rgb), 0.25);
}

.validation-message.success {
    display: block;
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.08);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.28);
}

.quick-action-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 4px;
    margin-bottom: 14px;
}

.quick-btn {
    border-radius: 10px;
    padding: 12px 8px;
    font-size: 14px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
}

.quick-btn i {
    font-size: 14px;
}

.quick-btn.guest-login {
    background: var(--bg-primary);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.4);
    color: var(--brand-primary-dark);
}

.quick-btn.guest-login:hover:not(:disabled) {
    background: rgba(var(--brand-primary-rgb), 0.06);
    border-color: var(--brand-primary);
    transform: translateY(-1px);
}

.quick-btn.confirm-login {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    border: 1px solid transparent;
    color: #fff;
    box-shadow: 0 4px 12px rgba(var(--brand-primary-rgb), 0.3);
}

.quick-btn.confirm-login:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.38);
}

.quick-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

.btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border: none;
    padding: 13px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.3px;
    transition: all 0.2s ease;
    margin-top: 18px;
    box-shadow: 0 4px 12px rgba(var(--brand-primary-rgb), 0.3);
}

.btn:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.4);
}

.btn:active:not(:disabled) {
    transform: translateY(0);
}

.btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.forgot-password-row {
    text-align: right;
    margin-top: -6px;
    margin-bottom: 10px;
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
    margin-right: 4px;
    font-size: 12px;
}

.login-link {
    text-align: center;
    margin-top: 16px;
    font-size: 13.5px;
    color: var(--text-secondary);
}

.login-link a {
    color: var(--brand-primary);
    text-decoration: none;
    font-weight: 600;
}

.login-link a:hover {
    text-decoration: underline;
}

/* ─── 旧账号绑定邮箱 ─── */
.legacy-bind-form {
    display: flex;
    flex-direction: column;
}

.bind-alert {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: flex-start;
    padding: 13px 14px;
    margin-bottom: 18px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 12px;
    background: rgba(var(--brand-primary-rgb), 0.07);
    color: var(--text-brand-dark);
}

.bind-alert i {
    margin-top: 2px;
    color: var(--brand-primary);
    font-size: 19px;
}

.bind-alert strong {
    display: block;
    font-size: 14px;
    margin-bottom: 3px;
}

.bind-alert p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text-secondary);
}

/* ─── 密码重置弹窗 ─── */
.reset-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 25, 18, 0.45);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: var(--z-panel);
    backdrop-filter: blur(4px);
}

.reset-panel {
    background: var(--bg-primary);
    border-radius: 16px;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.22);
    overflow: hidden;
    animation: fadeIn 0.3s ease;
}

.reset-header {
    background: linear-gradient(140deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    padding: 15px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.reset-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.reset-header h3 i {
    margin-right: 7px;
}

.reset-close {
    background: rgba(255, 255, 255, 0.14);
    border: none;
    color: #fff;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.reset-close:hover {
    background: rgba(255, 255, 255, 0.26);
}

.reset-body {
    padding: 22px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.reset-desc {
    margin: 0;
    font-size: 13.5px;
    color: var(--text-secondary);
    line-height: 1.55;
}

.reset-btn {
    margin-top: 4px;
}

.resend-btn {
    display: block;
    width: 100%;
    background: none;
    border: 1px dashed var(--border-light);
    padding: 10px;
    border-radius: 10px;
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
    font-size: 12.5px;
    color: var(--text-muted);
}

/* ─── 页脚与动画 ─── */
.form-footer {
    padding: 12px 24px;
    text-align: center;
    background-color: var(--bg-secondary);
    border-top: 1px solid var(--border-light);
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
}

.form-footer a {
    color: var(--brand-primary-dark);
    text-decoration: none;
    font-weight: 500;
}

.form-footer a:hover {
    text-decoration: underline;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(12px) scale(0.99);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.fade-in {
    animation: fadeIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

/* ─── 移动端适配 ─── */
@media (max-width: 768px) {
    .register-container {
        align-items: stretch;
        padding: 0;
        background-image: none;
    }

    .container {
        max-width: 100%;
        border-radius: 0;
        max-height: 100dvh;
        min-height: 100dvh;
        box-shadow: none;
    }

    .form-body {
        padding: 18px 16px;
    }

    .form-header {
        padding: 18px 16px 16px;
        padding-top: max(18px, env(safe-area-inset-top));
    }

    .brand-badge {
        width: 40px;
        height: 40px;
        font-size: 19px;
        margin-bottom: 8px;
        border-radius: 12px;
    }

    .form-title {
        font-size: 21px;
    }

    .form-subtitle {
        font-size: 11.5px;
    }

    .form-footer {
        padding: 12px 16px;
        padding-bottom: max(12px, env(safe-area-inset-bottom));
    }

    .avatar-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .email-code-row {
        flex-wrap: wrap;
    }

    .send-code-btn,
    .verify-code-btn {
        padding: 9px 12px;
        font-size: 12px;
    }

    .verified-badge {
        padding: 9px 12px;
    }

    .quick-action-row {
        grid-template-columns: 1fr;
    }

    .reset-panel {
        width: 94%;
        max-height: 90dvh;
        overflow-y: auto;
    }

    .reset-body {
        padding: 18px 16px;
    }
}
</style>
