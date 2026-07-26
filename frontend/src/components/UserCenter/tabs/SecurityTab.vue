<!--
  SecurityTab.vue
  Purpose: Displays the security tab of the floating account panel.
  Allows registered users to change their password.
  Guest and admin roles see appropriate warning messages instead.
  Parent passes the user object and submission state; password change
  requests bubble up via the 'change-password' emit.
-->
<script setup>
import { ref } from 'vue';
import { getUserDisplayName, validateDisplayName } from '../../../composables/auth/useAuthIdentity';

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

const displayName = ref('');
const currentPassword = ref('');
const nextPassword = ref('');
const confirmPassword = ref('');

/** 三个密码框的明文显隐状态 */
const showPwd = ref({ current: false, next: false, confirm: false });

function togglePwd(key) {
    showPwd.value[key] = !showPwd.value[key];
}

function resetForm() {
    displayName.value = '';
    currentPassword.value = '';
    nextPassword.value = '';
    confirmPassword.value = '';
}

function handleDisplayNameSubmit() {
    const validation = validateDisplayName(displayName.value);
    if (!validation.valid) {
        emit('change-display-name', { error: validation.message });
        return;
    }

    emit('change-display-name', { displayName: validation.value });
}

function handlePasswordSubmit() {
    const oldPass = String(currentPassword.value || '').trim();
    const newPass = String(nextPassword.value || '').trim();
    const confirmPass = String(confirmPassword.value || '').trim();

    if (!oldPass || !newPass || !confirmPass) {
        emit('change-password', { error: '请完整填写密码信息' });
        return;
    }

    if (newPass !== confirmPass) {
        emit('change-password', { error: '两次输入的新密码不一致' });
        return;
    }

    if (newPass.length < 6) {
        emit('change-password', { error: '新密码长度至少为 6 位' });
        return;
    }

    emit('change-password', { oldPassword: oldPass, newPassword: newPass });
}

function getBoundAccount(provider) {
    return props.oauthAccounts.find((account) => String(account?.provider || '') === provider) || null;
}

function handleOAuthAction(provider) {
    const account = getBoundAccount(provider);
    emit(account ? 'unlink-oauth' : 'bind-oauth', provider);
}

/** Exposed method: allows parent to reset the form (e.g. on panel close) */
defineExpose({ resetForm });
</script>

<template>
    <div class="view-content security-view">
        <div v-if="user?.role === 'guest'" class="guest-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <p>游客账号不支持修改密码，请注册正式账号享受完整功能。</p>
        </div>
        <div v-else-if="user?.role === 'admin'" class="guest-warning">
            <i class="fas fa-user-shield"></i>
            <p>
                管理员密码优先由 SUPER_USER 控制（本地未配置时默认
                123456），不支持在线修改。
            </p>
        </div>
        <div v-else class="password-form-container">
            <h4 class="section-title">账号昵称</h4>
            <div class="modern-input-group">
                <i class="fas fa-user input-icon"></i>
                <input
                    v-model="displayName"
                    type="text"
                    maxlength="40"
                    :placeholder="getUserDisplayName(user)"
                />
            </div>
            <button
                class="btn-primary w-100"
                type="button"
                :disabled="isSubmitting"
                @click="handleDisplayNameSubmit"
            >
                <i
                    class="fas"
                    :class="isSubmitting ? 'fa-spinner fa-spin' : 'fa-id-card'"
                ></i>
                {{ isSubmitting ? '正在提交...' : '保存昵称' }}
            </button>

            <h4 class="section-title">第三方账号绑定</h4>
            <p class="oauth-bind-desc">已注册邮箱用户可绑定 Google 或 GitHub，后续可一键登录同一个 WebGIS 账号。</p>
            <div class="oauth-bind-list">
                <button
                    v-for="provider in ['google', 'github']"
                    :key="provider"
                    type="button"
                    class="oauth-bind-btn"
                    :class="provider"
                    :disabled="isSubmitting || oauthLoading"
                    @click="handleOAuthAction(provider)"
                >
                    <i :class="provider === 'google' ? 'fab fa-google' : 'fab fa-github'"></i>
                    <span>
                        {{ getBoundAccount(provider) ? `解绑 ${provider}` : `绑定 ${provider}` }}
                    </span>
                    <small v-if="getBoundAccount(provider)">
                        {{ getBoundAccount(provider)?.email || getBoundAccount(provider)?.display_name || '已绑定' }}
                    </small>
                </button>
            </div>

            <h4 class="section-title">修改密码</h4>
            <div class="modern-input-group">
                <i class="fas fa-lock input-icon"></i>
                <input
                    v-model="currentPassword"
                    :type="showPwd.current ? 'text' : 'password'"
                    autocomplete="current-password"
                    placeholder="当前密码"
                />
                <button
                    type="button"
                    class="pwd-toggle"
                    :title="showPwd.current ? '隐藏密码' : '显示密码'"
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
                    placeholder="新密码 (至少6位)"
                />
                <button
                    type="button"
                    class="pwd-toggle"
                    :title="showPwd.next ? '隐藏密码' : '显示密码'"
                    @click="togglePwd('next')"
                >
                    <i :class="showPwd.next ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                </button>
            </div>
            <div class="modern-input-group">
                <i class="fas fa-check-double input-icon"></i>
                <input
                    v-model="confirmPassword"
                    :type="showPwd.confirm ? 'text' : 'password'"
                    autocomplete="new-password"
                    placeholder="确认新密码"
                />
                <button
                    type="button"
                    class="pwd-toggle"
                    :title="showPwd.confirm ? '隐藏密码' : '显示密码'"
                    @click="togglePwd('confirm')"
                >
                    <i :class="showPwd.confirm ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                </button>
            </div>

            <button
                class="btn-primary w-100"
                type="button"
                :disabled="isSubmitting"
                @click="handlePasswordSubmit"
            >
                <i
                    class="fas"
                    :class="isSubmitting ? 'fa-spinner fa-spin' : 'fa-save'"
                ></i>
                {{ isSubmitting ? '正在提交...' : '保存新密码' }}
            </button>
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
    background: #fff;
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
    background: #fbfdfb;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
    box-sizing: border-box;
}

.modern-input-group input::placeholder {
    color: var(--text-muted);
}

.modern-input-group input:focus {
    outline: none;
    border-color: var(--brand-primary);
    background: #fff;
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
