<!--
  SecurityTab.vue
  Purpose: Displays the security tab of the floating account panel.
  Allows registered users to change their password.
  Guest and admin roles see appropriate warning messages instead.
  Parent passes the user object and submission state; password change
  requests bubble up via the 'change-password' emit.
-->
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { getUserDisplayName, validateDisplayName } from '../../../composables/auth/useAuthIdentity';
import { useLocale } from '../../../composables/useLocale';

const props = defineProps({
    /** Current user object (used to check role) */
    user: {
        type: Object,
        default: null,
    },
    /** Whether a form submission is currently in flight */
    isSubmitting: {
        type: Boolean,
        default: false,
    },
    /** Bound Google/GitHub OAuth accounts for the current registered user */
    oauthAccounts: {
        type: Array,
        default: () => [],
    },
    /** Whether OAuth binding state is loading */
    oauthLoading: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits([
    /** Request parent to change display name. Payload: { displayName } */
    'change-display-name',
    /** Request parent to change password. Payload: { oldPassword, newPassword } */
    'change-password',
    /** Request parent to start Google/GitHub OAuth binding. Payload: provider */
    'bind-oauth',
    /** Request parent to unlink Google/GitHub OAuth binding. Payload: provider */
    'unlink-oauth',
]);

const { t } = useLocale();

/** OAuth 提供商品牌名（按钮文案用，避免小写 google/github） */
const PROVIDER_LABELS = Object.freeze({ google: 'Google', github: 'GitHub' });

// 昵称框预填当前昵称（V3.4.62 A7）；仅在「用户未改动」时跟随外部 user 变化，
// 防止 30s 轮询 mergeUserPatch 触发的 user 更新覆盖正在输入的内容
const displayName = ref(getUserDisplayName(props.user) || '');
watch(
    () => getUserDisplayName(props.user),
    (next, prev) => {
        if (!displayName.value || displayName.value === prev) {
            displayName.value = next || '';
        }
    },
);

const currentPassword = ref('');
const nextPassword = ref('');
const confirmPassword = ref('');

/** 三个密码框的明文显隐状态 */
const showPwd = ref({ current: false, next: false, confirm: false });

function togglePwd(key) {
    showPwd.value[key] = !showPwd.value[key];
}

/**
 * 新密码强度评估（V3.4.62 A5）：
 * 长度（≥6 / ≥10）+ 字符类别数（小写/大写/数字/符号）计分，映射三档。
 * 返回 0=未输入，1=弱，2=中，3=强。
 */
const pwdStrength = computed(() => {
    const value = String(nextPassword.value || '');
    if (!value) return 0;
    let score = 0;
    if (value.length >= 6) score += 1;
    if (value.length >= 10) score += 1;
    const classCount = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
    if (classCount >= 2) score += 1;
    if (classCount >= 3) score += 1;
    if (score >= 4) return 3;
    if (score >= 2) return 2;
    return 1;
});

const pwdStrengthText = computed(() => {
    const levels = [
        '',
        t('security.strengthLevels.weak'),
        t('security.strengthLevels.medium'),
        t('security.strengthLevels.strong'),
    ];
    return levels[pwdStrength.value] || '';
});

function resetForm() {
    displayName.value = getUserDisplayName(props.user) || '';
    currentPassword.value = '';
    nextPassword.value = '';
    confirmPassword.value = '';
    clearPendingUnlink();
}

function handleDisplayNameSubmit() {
    const validation = validateDisplayName(displayName.value);
    if (!validation.valid) {
        emit('change-display-name', { error: t(validation.code) });
        return;
    }

    emit('change-display-name', { displayName: validation.value });
}

function handlePasswordSubmit() {
    const oldPass = String(currentPassword.value || '').trim();
    const newPass = String(nextPassword.value || '').trim();
    const confirmPass = String(confirmPassword.value || '').trim();

    if (!oldPass || !newPass || !confirmPass) {
        emit('change-password', { error: t('security.errors.required') });
        return;
    }

    if (newPass !== confirmPass) {
        emit('change-password', { error: t('security.errors.mismatch') });
        return;
    }

    if (newPass.length < 6) {
        emit('change-password', { error: t('security.errors.minLength') });
        return;
    }

    emit('change-password', { oldPassword: oldPass, newPassword: newPass });
}

function getBoundAccount(provider) {
    return props.oauthAccounts.find((account) => String(account?.provider || '') === provider) || null;
}

// 解绑二段式确认（V3.4.62 A3）：首点进入待确认态（按钮变红提示），
// 3s 内再点才真正解绑，超时自动还原——防误触且不打断式
const pendingUnlink = ref('');
let pendingUnlinkTimer = null;

function clearPendingUnlink() {
    pendingUnlink.value = '';
    if (pendingUnlinkTimer) {
        clearTimeout(pendingUnlinkTimer);
        pendingUnlinkTimer = null;
    }
}

function handleOAuthAction(provider) {
    const account = getBoundAccount(provider);
    if (!account) {
        clearPendingUnlink();
        emit('bind-oauth', provider);
        return;
    }
    if (pendingUnlink.value !== provider) {
        clearPendingUnlink();
        pendingUnlink.value = provider;
        pendingUnlinkTimer = setTimeout(clearPendingUnlink, 3000);
        return;
    }
    clearPendingUnlink();
    emit('unlink-oauth', provider);
}

onBeforeUnmount(clearPendingUnlink);

/** Exposed method: allows parent to reset the form (e.g. on panel close) */
defineExpose({ resetForm });
</script>

<template>
    <div class="view-content security-view">
        <div v-if="user?.role === 'guest'" class="guest-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <p>{{ t('security.guestWarning') }}</p>
        </div>
        <div v-else-if="user?.role === 'admin'" class="guest-warning">
            <i class="fas fa-user-shield"></i>
            <p>{{ t('security.adminWarning') }}</p>
        </div>
        <div v-else class="password-form-container">
            <h4 class="section-title">{{ t('security.displayNameTitle') }}</h4>
            <!-- form 包裹：回车即提交（V3.4.62 A5） -->
            <form class="stack-form" @submit.prevent="handleDisplayNameSubmit">
                <div class="modern-input-group">
                    <i class="fas fa-user input-icon"></i>
                    <input
                        v-model="displayName"
                        type="text"
                        maxlength="40"
                        :placeholder="t('security.displayNamePlaceholder')"
                        :aria-label="t('security.displayNameTitle')"
                    />
                </div>
                <button
                    class="btn-primary w-100"
                    type="submit"
                    :disabled="isSubmitting"
                >
                    <i
                        class="fas"
                        :class="isSubmitting ? 'fa-spinner fa-spin' : 'fa-id-card'"
                    ></i>
                    {{ isSubmitting ? t('security.submitting') : t('security.saveDisplayName') }}
                </button>
            </form>

            <h4 class="section-title">{{ t('security.oauthTitle') }}</h4>
            <p class="oauth-bind-desc">{{ t('security.oauthDesc') }}</p>
            <div class="oauth-bind-list">
                <button
                    v-for="provider in ['google', 'github']"
                    :key="provider"
                    type="button"
                    class="oauth-bind-btn"
                    :class="[provider, { 'confirm-unlink': pendingUnlink === provider }]"
                    :disabled="isSubmitting || oauthLoading"
                    :aria-label="getBoundAccount(provider)
                        ? t('security.unlinkProvider', { provider: PROVIDER_LABELS[provider] })
                        : t('security.bindProvider', { provider: PROVIDER_LABELS[provider] })"
                    @click="handleOAuthAction(provider)"
                >
                    <i :class="provider === 'google' ? 'fab fa-google' : 'fab fa-github'"></i>
                    <span v-if="pendingUnlink === provider">
                        {{ t('security.confirmUnlink', { provider: PROVIDER_LABELS[provider] }) }}
                    </span>
                    <span v-else>
                        {{ getBoundAccount(provider)
                            ? t('security.unlinkProvider', { provider: PROVIDER_LABELS[provider] })
                            : t('security.bindProvider', { provider: PROVIDER_LABELS[provider] }) }}
                    </span>
                    <small v-if="getBoundAccount(provider) && pendingUnlink !== provider">
                        {{ getBoundAccount(provider)?.email || getBoundAccount(provider)?.display_name || t('security.bound') }}
                    </small>
                </button>
            </div>

            <h4 class="section-title">{{ t('security.passwordTitle') }}</h4>
            <!-- form 包裹：回车提交 + 隐藏用户名字段供密码管理器关联账号（V3.4.62 A5） -->
            <form class="stack-form" @submit.prevent="handlePasswordSubmit">
                <input
                    class="visually-hidden-input"
                    type="text"
                    name="username"
                    autocomplete="username"
                    :value="user?.username || ''"
                    readonly
                    tabindex="-1"
                    aria-hidden="true"
                />
                <div class="modern-input-group">
                    <i class="fas fa-lock input-icon"></i>
                    <input
                        v-model="currentPassword"
                        :type="showPwd.current ? 'text' : 'password'"
                        autocomplete="current-password"
                        :placeholder="t('security.currentPassword')"
                    />
                    <button
                        type="button"
                        class="pwd-toggle"
                        :title="showPwd.current ? t('security.hidePassword') : t('security.showPassword')"
                        @click="togglePwd('current')"
                    >
                        <i :class="showPwd.current ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                    </button>
                </div>
                <div class="modern-input-group">
                    <i class="fas fa-key input-icon"></i>
                    <input
                        v-model="nextPassword"
                        :type="showPwd.next ? 'text' : 'password'"
                        autocomplete="new-password"
                        :placeholder="t('security.newPassword')"
                    />
                    <button
                        type="button"
                        class="pwd-toggle"
                        :title="showPwd.next ? t('security.hidePassword') : t('security.showPassword')"
                        @click="togglePwd('next')"
                    >
                        <i :class="showPwd.next ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                    </button>
                </div>
                <!-- 新密码强度提示（仅输入后显示） -->
                <div
                    v-if="pwdStrength > 0"
                    class="pwd-strength"
                    :class="`level-${pwdStrength}`"
                    aria-live="polite"
                >
                    <span class="strength-bars">
                        <span v-for="n in 3" :key="n" class="bar" :class="{ on: pwdStrength >= n }"></span>
                    </span>
                    <span class="strength-text">{{ t('security.strength', { level: pwdStrengthText }) }}</span>
                </div>
                <div class="modern-input-group">
                    <i class="fas fa-check-double input-icon"></i>
                    <input
                        v-model="confirmPassword"
                        :type="showPwd.confirm ? 'text' : 'password'"
                        autocomplete="new-password"
                        :placeholder="t('security.confirmPassword')"
                    />
                    <button
                        type="button"
                        class="pwd-toggle"
                        :title="showPwd.confirm ? t('security.hidePassword') : t('security.showPassword')"
                        @click="togglePwd('confirm')"
                    >
                        <i :class="showPwd.confirm ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                    </button>
                </div>

                <button
                    class="btn-primary w-100"
                    type="submit"
                    :disabled="isSubmitting"
                >
                    <i
                        class="fas"
                        :class="isSubmitting ? 'fa-spinner fa-spin' : 'fa-save'"
                    ></i>
                    {{ isSubmitting ? t('security.submitting') : t('security.savePassword') }}
                </button>
            </form>
        </div>
    </div>
</template>

<style scoped>
/* 安全页（浅色单套设计，与账号中心壳统一视觉语言） */
.security-view {
    display: flex;
    flex-direction: column;
}

.password-form-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* form 化后的纵向栈（与容器同 gap，视觉零变化） */
.stack-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* 密码管理器关联用的隐藏用户名字段：视觉与交互双隐藏，但保留在可访问性树外 */
.visually-hidden-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}

/* 新密码强度条：三段指示 + 文案 */
.pwd-strength {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: -6px 2px 0;
}

.strength-bars {
    display: flex;
    gap: 4px;
}

.strength-bars .bar {
    width: 26px;
    height: 4px;
    border-radius: 999px;
    background: var(--border-light);
    transition: background 0.2s ease;
}

.pwd-strength.level-1 .bar.on { background: var(--danger); }
.pwd-strength.level-2 .bar.on { background: var(--warning); }
.pwd-strength.level-3 .bar.on { background: var(--brand-primary); }

.strength-text {
    font-size: 11px;
    color: var(--text-muted);
}

.pwd-strength.level-1 .strength-text { color: var(--danger); }
.pwd-strength.level-2 .strength-text { color: var(--warning); }
.pwd-strength.level-3 .strength-text { color: var(--brand-primary-dark); }

/* 分区标题：品牌左条 */
.section-title {
    margin: 6px 0 2px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    border-left: 3px solid var(--brand-primary);
    padding-left: 9px;
    letter-spacing: 0.3px;
}

.section-title:first-child {
    margin-top: 0;
}

.oauth-bind-desc {
    margin: -2px 0 2px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.55;
}

.oauth-bind-list {
    display: grid;
    gap: 8px;
}

.oauth-bind-btn {
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--border-light);
    border-radius: 10px;
    background: var(--bg-primary);
    color: var(--text-primary);
    cursor: pointer;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    text-align: left;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.18s ease;
    box-shadow: 0 1px 3px rgba(34, 50, 38, 0.04);
}

.oauth-bind-btn i {
    font-size: 15px;
}

.oauth-bind-btn.google i {
    color: #4285f4;
}

.oauth-bind-btn.github i {
    color: #24292f;
}

.oauth-bind-btn:hover:not(:disabled) {
    border-color: rgba(var(--brand-primary-rgb), 0.5);
    background: rgba(var(--brand-primary-rgb), 0.04);
    transform: translateY(-1px);
}

.oauth-bind-btn small {
    grid-column: 2;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 400;
}

.oauth-bind-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* 解绑二段确认态：转危险色提示，3s 未确认自动还原 */
.oauth-bind-btn.confirm-unlink {
    border-color: rgba(var(--danger-rgb), 0.55);
    background: rgba(var(--danger-rgb), 0.06);
    color: var(--danger);
}

.oauth-bind-btn.confirm-unlink i {
    color: var(--danger);
}

.oauth-bind-btn.confirm-unlink:hover:not(:disabled) {
    border-color: var(--danger);
    background: rgba(var(--danger-rgb), 0.1);
}

/* 输入组 */
.modern-input-group {
    position: relative;
    display: flex;
    align-items: center;
}

.input-icon {
    position: absolute;
    left: 13px;
    color: var(--text-muted);
    font-size: 13px;
    pointer-events: none;
    transition: color 0.15s;
}

.modern-input-group:focus-within .input-icon {
    color: var(--brand-primary);
}

.modern-input-group input {
    width: 100%;
    height: 42px;
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 0 38px 0 38px;
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-secondary);
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
    box-sizing: border-box;
}

.modern-input-group input::placeholder {
    color: var(--text-muted);
}

.modern-input-group input:focus {
    outline: none;
    border-color: var(--brand-primary);
    background: var(--bg-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.1);
}

/* 密码显隐切换 */
.pwd-toggle {
    position: absolute;
    right: 6px;
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    border-radius: 7px;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: all 0.15s;
}

.pwd-toggle:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
}

/* 角色提示卡（游客/管理员） */
.guest-warning {
    background: rgba(var(--warning-rgb), 0.07);
    border: 1px solid rgba(var(--warning-rgb), 0.35);
    color: #8a6100;
    padding: 18px 16px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
}

.guest-warning i {
    font-size: 24px;
    color: var(--warning);
}

.guest-warning p {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
}

/* 主按钮 */
.btn-primary {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border: none;
    height: 40px;
    border-radius: 10px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 3px 10px rgba(var(--brand-primary-rgb), 0.28);
    transition: all 0.18s ease;
}

.btn-primary:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
}

.btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.w-100 {
    width: 100%;
}
</style>
