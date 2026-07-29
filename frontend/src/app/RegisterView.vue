<template>
    <div class="register-container">
        <div class="container fade-in">
            <div class="form-header">
                <div class="brand-row">
                    <div class="brand-badge">
                        <i class="fas fa-earth-asia"></i>
                    </div>
                    <div class="brand-text">
                        <h1 class="form-title">NEGIAO's WebGIS</h1>
                        <p class="app-purpose-title">{{ t('auth.appPurpose') }}</p>
                    </div>
                    <div
                        class="lang-toggle"
                        role="group"
                        :aria-label="t('preferences.language')"
                    >
                        <button
                            v-for="option in LANGUAGE_OPTIONS"
                            :key="option.value"
                            type="button"
                            class="lang-btn"
                            :class="{ active: language === option.value }"
                            :aria-pressed="language === option.value"
                            @click="switchLanguage(option.value)"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="form-body">
                <div
                    class="mode-switch"
                    role="tablist"
                    :aria-label="t('auth.modeSwitchAria')"
                >
                    <button
                        type="button"
                        class="mode-btn"
                        :class="{ active: mode === 'login' }"
                        @click="switchMode('login')"
                    >
                        {{ t('auth.login') }}
                    </button>
                    <button
                        type="button"
                        class="mode-btn"
                        :class="{ active: mode === 'register' }"
                        @click="switchMode('register')"
                    >
                        {{ t('auth.register') }}
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
                        {{ t('auth.loginWithGoogle') }}
                    </button>
                    <button
                        type="button"
                        class="oauth-btn github"
                        @click="handleOAuthLogin('github')"
                    >
                        <i class="fab fa-github"></i>
                        {{ t('auth.loginWithGithub') }}
                    </button>
                    <div class="oauth-divider">
                        <span>{{ t('auth.orUseEmail') }}</span>
                    </div>
                </div>

                <form
                    v-if="!requiresEmailBinding"
                    @submit.prevent="handleSubmit"
                >
                    <div class="form-group">
                        <label for="username">{{ mode === 'login' ? t('auth.usernameLogin') : t('auth.username') }}</label>
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
                                        ? t('auth.usernamePlaceholderLogin')
                                        : t('auth.usernamePlaceholderRegister')
                                    "
                                :required="mode === 'register'"
                            />
                        </div>
                        <div
                            v-if="mode === 'login'"
                            class="hint"
                        >
                            <i class="fas fa-info-circle"></i>
                            {{ t('auth.newAccountNote') }}
                        </div>
                        <div
                            v-else
                            class="hint"
                        >
                            <i class="fas fa-user-plus"></i>
                            {{ t('auth.nicknameNote') }}
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="password">{{ t('auth.password') }}</label>
                        <div class="input-group">
                            <i class="icon fas fa-lock"></i>
                            <input
                                id="password"
                                v-model="password"
                                type="password"
                                :placeholder="mode === 'login' ? t('auth.passwordPlaceholderLogin') : t('auth.passwordPlaceholderRegister')
                                    "
                                required
                            />
                        </div>
                        <div
                            v-if="mode === 'login'"
                            class="hint"
                        >
                            <i class="fas fa-shield-alt"></i>
                            {{ t('auth.guestNote') }}
                        </div>
                        <div
                            v-else
                            class="hint"
                        >
                            <i class="fas fa-shield-alt"></i>
                            {{ t('auth.passwordRuleNote') }}
                        </div>
                    </div>

                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label for="confirmPassword">{{ t('auth.confirmPassword') }}</label>
                        <div class="input-group">
                            <i class="icon fas fa-check-circle"></i>
                            <input
                                id="confirmPassword"
                                v-model="confirmPassword"
                                type="password"
                                :placeholder="t('auth.confirmPasswordPlaceholder')"
                                required
                            />
                        </div>
                    </div>

                    <!-- 注册模式：邮箱 & 验证码 -->
                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label for="email">{{ t('auth.email') }}</label>
                        <div class="input-group">
                            <i class="icon fas fa-envelope"></i>
                            <input
                                id="email"
                                v-model="email"
                                type="email"
                                :placeholder="t('auth.emailPlaceholder')"
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
                        <label for="emailCode">{{ t('auth.emailCode') }}</label>
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
                                    :placeholder="t('auth.emailCodePlaceholder')"
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
                                {{ codeCountdown > 0 ? t('auth.codeCountdown', { count: codeCountdown }) : t('auth.sendCode') }}
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
                                {{ t('auth.verify') }}
                            </button>
                            <span
                                v-if="emailVerified"
                                class="verified-badge"
                            >
                                <i class="fas fa-check-circle"></i> {{ t('auth.verified') }}
                            </span>
                        </div>
                    </div>

                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label>{{ t('auth.selectAvatar') }}</label>
                        <div
                            class="avatar-grid"
                            role="radiogroup"
                            :aria-label="t('auth.avatarGroupAria')"
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
                            {{ t('auth.guestLogin') }}
                        </button>
                        <button
                            type="button"
                            class="quick-btn confirm-login"
                            :disabled="isSubmitting"
                            @click="handleSubmit"
                        >
                            <i class="fas fa-sign-in-alt"></i>
                            {{ isSubmitting ? t('auth.submitting') : t('auth.confirmLogin') }}
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
                            {{ t('auth.forgotPassword') }}
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
                        {{ isSubmitting ? t('auth.submitting') : t('auth.createAccount') }}
                    </button>

                    <div class="login-link">
                        <template v-if="mode === 'login'">
                            {{ t('auth.noAccount') }}
                            <a
                                href="#"
                                @click.prevent="switchMode('register')"
                            >{{ t('auth.registerNow') }}</a>
                        </template>
                        <template v-else>
                            {{ t('auth.hasAccount') }}
                            <a
                                href="#"
                                @click.prevent="switchMode('login')"
                            >{{ t('auth.backToLogin') }}</a>
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
                            <strong>{{ t('auth.bindEmailTitle') }}</strong>
                            <p>{{ t('auth.bindEmailDesc') }}</p>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bindEmail">{{ t('auth.bindEmail') }}</label>
                        <div class="input-group">
                            <i class="icon fas fa-envelope"></i>
                            <input
                                id="bindEmail"
                                v-model="bindEmail"
                                type="email"
                                :placeholder="t('auth.emailPlaceholder')"
                                required
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bindCode">{{ t('auth.emailCode') }}</label>
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
                                    :placeholder="t('auth.emailCodePlaceholder')"
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
                                {{ bindCodeCountdown > 0 ? t('auth.codeCountdown', { count: bindCodeCountdown }) : t('auth.sendCode') }}
                            </button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bindPassword">{{ t('auth.currentPassword') }}</label>
                        <div class="input-group">
                            <i class="icon fas fa-lock"></i>
                            <input
                                id="bindPassword"
                                v-model="bindCurrentPassword"
                                type="password"
                                :placeholder="t('auth.currentPasswordPlaceholder')"
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
                        {{ isSubmitting ? t('auth.binding') : t('auth.bindEmailAndEnter') }}
                    </button>

                    <div class="login-link">
                        <a
                            href="#"
                            @click.prevent="cancelBinding"
                        >{{ t('auth.backToLogin') }}</a>
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
                        <h3><i class="fas fa-unlock-alt"></i> {{ t('auth.resetPasswordTitle') }}</h3>
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
                        <p class="reset-desc">{{ t('auth.resetStep1Desc') }}</p>
                        <div class="input-group">
                            <i class="icon fas fa-envelope"></i>
                            <input
                                v-model="resetEmail"
                                type="email"
                                :placeholder="t('auth.resetEmailPlaceholder')"
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
                            {{ isResetSubmitting ? t('auth.sendingCode') : t('auth.sendCode') }}
                        </button>
                    </div>

                    <!-- Step 2: 输入验证码 + 新密码 -->
                    <div
                        v-if="resetStep === 2"
                        class="reset-body"
                    >
                        <p class="reset-desc">
                            {{ t('auth.resetCodeSentTo') }} <strong>{{ resetEmail }}</strong>
                        </p>
                        <div class="input-group">
                            <i class="icon fas fa-shield-alt"></i>
                            <input
                                v-model="resetCode"
                                type="text"
                                inputmode="numeric"
                                pattern="[0-9]*"
                                maxlength="6"
                                :placeholder="t('auth.emailCodePlaceholder')"
                            />
                        </div>
                        <div class="input-group">
                            <i class="icon fas fa-lock"></i>
                            <input
                                v-model="resetNewPassword"
                                type="password"
                                :placeholder="t('auth.resetNewPasswordPlaceholder')"
                            />
                        </div>
                        <div class="input-group">
                            <i class="icon fas fa-check-circle"></i>
                            <input
                                v-model="resetConfirmPassword"
                                type="password"
                                :placeholder="t('auth.resetConfirmPasswordPlaceholder')"
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
                            {{ isResetSubmitting ? t('auth.submitting') : t('auth.resetPasswordAction') }}
                        </button>
                        <button
                            v-if="resetCodeSent && resetCodeCountdown <= 0"
                            type="button"
                            class="resend-btn"
                            @click="handleResetSendCode"
                        >
                            {{ t('auth.resendCode') }}
                        </button>
                        <span
                            v-if="resetCodeCountdown > 0"
                            class="countdown-text"
                        >
                            {{ t('auth.resetCountdownWait', { count: resetCodeCountdown }) }}
                        </span>
                    </div>
                </div>
            </div>

            <div class="form-footer">
                {{ t('auth.agreeToTerms') }} <router-link to="/terms">{{ t('auth.termsOfService') }}</router-link> {{ t('auth.and') }} <router-link to="/privacy">{{ t('auth.privacyPolicy') }}</router-link>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useUserPreferencesStore } from '../stores';
import { GOOGLE_OAUTH_CLIENT_ID } from '../config/publicRuntime';
import {
    apiAuthGoogleOneTap,
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
} from '@common/user/services/auth';
import {
    getUserDisplayName,
    isValidEmail,
    isValidPassword,
    normalizeCredential,
    normalizeDisplayName,
    normalizeEmail,
    validateDisplayName,
} from '@common/user/composables/useAuthIdentity';

const router = useRouter();
const route = useRoute();
const message = useMessage();
const { t, language } = useLocale();
const userPreferencesStore = useUserPreferencesStore();

// 语言切换器标签用固定文案（各自母语书写），不依赖懒加载 i18n chunk
const LANGUAGE_OPTIONS = Object.freeze([
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'EN' },
]);

/** 与账号中心偏好同一全局开关：本机 SSOT + 登录后回写远端 */
function switchLanguage(nextLanguage) {
    if (!nextLanguage || nextLanguage === language.value) return;
    void userPreferencesStore.setLanguagePreference(nextLanguage);
}

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
        label: t('auth.avatarOption', { index: index + 1 }),
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
    setFormState('success', t('auth.guestCredentialsFilled'));
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
            throw new Error(t('auth.guestLoginResponseError'));
        }

        setAuthSession({ token, user });
        syncUserRoleToUrl(user);
        message.success(t('auth.guestLoginSuccess'));
        await router.replace(resolveRedirectTarget());
        consumePersistedPositionCode();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message ||
            t('auth.guestLoginFailed'),
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
        setFormState('error', t('auth.pleaseEnterPassword'));
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
            throw new Error(t('auth.loginResponseError'));
        }

        setAuthSession({ token, user });
        syncUserRoleToUrl(user);
        if (user?.requires_email_binding) {
            requiresEmailBinding.value = true;
            bindCurrentPassword.value = normalizedPassword;
            setFormState('success', t('auth.legacyVerifiedBindEmail'));
            message.warning(t('auth.pleaseBindEmailFirst'));
            return;
        }

        message.success(t('auth.loginSuccessWithRole', { role: String(user.role || 'unknown') }));
        await router.replace(resolveRedirectTarget());
        consumePersistedPositionCode();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message ||
            t('auth.loginFailed'),
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
        setFormState('error', t(displayValidation.code));
        return;
    }

    if (!isValidEmail(normalizedEmail)) {
        setFormState('error', t('auth.invalidEmail'));
        return;
    }

    if (!emailVerified.value) {
        setFormState('error', t('auth.pleaseVerifyEmailFirst'));
        return;
    }

    if (!isValidPassword(normalizedPassword)) {
        setFormState('error', t('auth.passwordRuleError'));
        return;
    }

    if (normalizedConfirmPassword !== normalizedPassword) {
        setFormState('error', t('auth.passwordMismatch'));
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
        message.success(t('auth.registerSuccess'));
        username.value = '';
        password.value = '';
        confirmPassword.value = '';
        email.value = '';
        emailCode.value = '';
        emailVerified.value = false;
        selectedAvatarIndex.value = 0;
        switchMode('login');
        setFormState('success', t('auth.registerComplete'));
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message ||
            t('auth.registerFailed'),
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
        setFormState('error', t('auth.invalidEmail'));
        return;
    }
    if (codeCountdown.value > 0) return;

    isSendingCode.value = true;
    emailCheckStatus.value = 'loading';
    emailCheckMessage.value = t('auth.sendingCode');
    setFormState('', '');

    try {
        await apiAuthSendCode(normalizedEmail, 'register', normalizeDisplayName(username.value));
        emailCheckStatus.value = 'success';
        emailCheckMessage.value = t('auth.codeSentCheckInbox');
        message.success(t('auth.codeSentToYourEmail'));
        startSendCountdown();
    } catch (error) {
        const isTimeout = error?.code === 'ECONNABORTED'
            || /timeout/i.test(String(error?.message || ''));
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || t('auth.codeSendFailed'),
        );

        const isRateLimited = error?.isQuotaExceeded
            || error?.originalError?.response?.status === 429;

        if (isTimeout || isRateLimited) {
            // 超时或频率限制：后端可能已收到请求或需要等待，启动倒计时防止重复发送
            if (isRateLimited) {
                emailCheckStatus.value = 'loading';
                emailCheckMessage.value = detail || t('auth.tooFrequent');
                message.warning(detail || t('auth.tooFrequent'));
            } else {
                emailCheckStatus.value = 'loading';
                emailCheckMessage.value = t('auth.timeoutMayBeSending');
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
        setFormState('error', t('auth.invalidEmail'));
        return;
    }
    if (!code || code.length !== 6) {
        setFormState('error', t('auth.enter6DigitCode'));
        return;
    }

    isVerifyingCode.value = true;
    setFormState('', '');

    try {
        await apiAuthVerifyCode(normalizedEmail, code, 'register');
        emailVerified.value = true;
        emailCheckStatus.value = 'success';
        emailCheckMessage.value = '✅ ' + t('auth.emailVerifiedSuccess');
        message.success(t('auth.emailVerifiedSuccess'));
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || t('auth.codeVerifyFailed'),
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
        setFormState('error', t('auth.invalidEmail'));
        return;
    }
    if (bindCodeCountdown.value > 0) return;

    isBindingCodeSending.value = true;
    setFormState('', '');

    try {
        await apiAuthSendCode(normalizedEmail, 'bind_email', getUserDisplayName(getStoredBindingUser()));
        message.success(t('auth.codeSentToYourEmail'));
        startBindCountdown();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || t('auth.codeSendFailed'),
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
        setFormState('error', t('auth.invalidEmail'));
        return;
    }
    if (!code || code.length !== 6) {
        setFormState('error', t('auth.enter6DigitCode'));
        return;
    }
    if (!currentPass) {
        setFormState('error', t('auth.pleaseEnterCurrentPassword'));
        return;
    }

    isSubmitting.value = true;
    setFormState('', '');

    try {
        const result = await apiAuthBindEmail(normalizedEmail, code, currentPass);
        const token = String(result?.token || '').trim();
        const user = result?.user || null;
        if (!token || !user) {
            throw new Error(t('auth.emailBindResponseError'));
        }

        setAuthSession({ token, user });
        syncUserRoleToUrl(user);
        requiresEmailBinding.value = false;
        message.success(t('auth.emailBindSuccess'));
        await router.replace(resolveRedirectTarget());
        consumePersistedPositionCode();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || t('auth.emailBindFailed'),
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
        setFormState('error', t('auth.invalidEmail'));
        return;
    }
    if (resetCodeCountdown.value > 0) return;

    isResetSubmitting.value = true;
    setFormState('', '');

    try {
        await apiAuthSendCode(normalizedEmail, 'reset_password');
        message.success(t('auth.codeSentToYourEmail'));
        resetStep.value = 2;
        resetCodeSent.value = true;
        startResetCountdown();
    } catch (error) {
        const isTimeout = error?.code === 'ECONNABORTED'
            || /timeout/i.test(String(error?.message || ''));
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || t('auth.codeSendFailed'),
        );

        const isRateLimited = error?.isQuotaExceeded
            || error?.originalError?.response?.status === 429;

        if (isTimeout || isRateLimited) {
            // 超时或频率限制：后端可能已收到请求或需要等待，启动倒计时防止重复发送
            if (isRateLimited) {
                message.warning(detail || t('auth.tooFrequent'));
            } else {
                message.warning(t('auth.timeoutMayBeSending'));
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
        setFormState('error', t('auth.invalidEmail'));
        return;
    }
    if (!code || code.length !== 6) {
        setFormState('error', t('auth.enter6DigitCode'));
        return;
    }
    if (!isValidPassword(newPass)) {
        setFormState('error', t('auth.newPasswordRuleError'));
        return;
    }
    if (newPass !== confirmPass) {
        setFormState('error', t('auth.passwordMismatch'));
        return;
    }

    isResetSubmitting.value = true;
    setFormState('', '');

    try {
        await apiAuthResetPassword(normalizedEmail, code, newPass);
        message.success(t('auth.passwordResetSuccess'));
        setFormState('success', t('auth.passwordResetSuccess'));
        closeResetPanel();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message || t('auth.passwordResetFailed'),
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

/**
 * 处理 Google One Tap 返回的 ID Token 凭证，发送到后端验证并完成登录/注册。
 * @param {object} response - Google One Tap callback 的 credential response 对象
 */
async function handleGoogleOneTap(response) {
    const credential = String(response?.credential || '').trim();
    if (!credential) {
        console.warn('[Google One Tap] 未收到有效凭证');
        return;
    }

    isSubmitting.value = true;
    setFormState('', '');

    try {
        const result = await apiAuthGoogleOneTap(credential);
        const token = String(result?.token || '').trim();
        const user = result?.user || null;

        if (!token || !user) {
            throw new Error(t('auth.googleLoginResponseError'));
        }

        setAuthSession({ token, user });
        syncUserRoleToUrl(user);
        message.success(t('auth.googleLoginSuccess'));
        await router.replace(resolveRedirectTarget());
        consumePersistedPositionCode();
    } catch (error) {
        const detail = String(
            error?.originalError?.response?.data?.detail ||
            error?.message ||
            t('auth.googleLoginFailed'),
        );
        setFormState('error', detail);
        message.error(detail);
    } finally {
        isSubmitting.value = false;
    }
}

/**
 * 初始化 Google One Tap / Sign In With Google。
 * 仅在用户未登录时调用，展示 Google 一键登录提示。
 */
function initGoogleOneTap() {
    if (typeof window === 'undefined' || !window.google?.accounts?.id) {
        console.warn('[Google One Tap] Google Identity Services 脚本未加载');
        return;
    }

    const clientId = GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
        console.warn('[Google One Tap] 未配置 VITE_GOOGLE_OAUTH_CLIENT_ID，跳过初始化');
        return;
    }

    window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleOneTap,
        auto_select: false,
        cancel_on_tap_outside: true,
        context: 'signin',
        itp_support: true,
    });

    // 在页面右上角展示 One Tap 提示
    window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.warn(
                '[Google One Tap] 提示未展示:',
                notification.getNotDisplayedReason?.() || notification.getSkippedReason?.(),
            );
        }
        // 用户关闭/取消 One Tap 提示属于正常行为，无需额外处理
    });
}

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
            setFormState('success', t('auth.pleaseBindEmailToMigrate'));
            return;
        }

        await router.replace(resolveRedirectTarget());
        consumePersistedPositionCode();
        return;
    }

    // 完整语言包由 main.js / setLanguage 预热；此处无需重复 load

    // 初始化 Google One Tap（仅在未登录时展示）
    initGoogleOneTap();

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

            import('@common/data-import/deferredGisWarmupLauncher')
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

/* ─── 头部（紧凑单行） ─── */
.form-header {
    position: relative;
    background: linear-gradient(140deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    color: #fff;
    padding: 14px 20px;
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

.brand-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.lang-toggle {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.28);
    flex-shrink: 0;
}

.lang-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.82);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    padding: 6px 8px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease;
}

.lang-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
}

.lang-btn.active {
    background: rgba(255, 255, 255, 0.92);
    color: var(--brand-primary-dark, #1f5d3a);
}

.lang-btn:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.95);
    outline-offset: 1px;
}

.brand-badge {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
}

.brand-text {
    min-width: 0;
    text-align: left;
}

.form-title {
    font-weight: 700;
    font-size: 19px;
    margin: 0;
    letter-spacing: 0.4px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.app-purpose-title {
    margin: 2px 0 0;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.2px;
    opacity: 0.88;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
        padding: 12px 16px;
        padding-top: max(12px, env(safe-area-inset-top));
    }

    .brand-row {
        gap: 8px;
    }

    .lang-toggle {
        gap: 1px;
        padding: 1px;
    }

    .lang-btn {
        font-size: 10px;
        padding: 5px 7px;
    }

    .brand-badge {
        width: 36px;
        height: 36px;
        font-size: 17px;
    }

    .form-title {
        font-size: 17px;
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
