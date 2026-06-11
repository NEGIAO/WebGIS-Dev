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

defineProps({
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
});

const emit = defineEmits([
    /** Request parent to change display name. Payload: { displayName } */
    'change-display-name',
    /** Request parent to change password. Payload: { oldPassword, newPassword } */
    'change-password',
]);

const displayName = ref('');
const currentPassword = ref('');
const nextPassword = ref('');
const confirmPassword = ref('');

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

            <h4 class="section-title">修改密码</h4>
            <div class="modern-input-group">
                <i class="fas fa-lock input-icon"></i>
                <input
                    v-model="currentPassword"
                    type="password"
                    autocomplete="current-password"
                    placeholder="当前密码"
                />
            </div>
            <div class="modern-input-group">
                <i class="fas fa-key input-icon"></i>
                <input
                    v-model="nextPassword"
                    type="password"
                    autocomplete="new-password"
                    placeholder="新密码 (至少6位)"
                />
            </div>
            <div class="modern-input-group">
                <i class="fas fa-check-double input-icon"></i>
                <input
                    v-model="confirmPassword"
                    type="password"
                    autocomplete="new-password"
                    placeholder="确认新密码"
                />
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
/* View: Security */
.password-form-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.section-title {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 700;
    color: #a0ddb6;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-left: 3px solid var(--brand-accent-light);
    padding-left: 10px;
}

.modern-input-group {
    position: relative;
    display: flex;
    align-items: center;
}

.input-icon {
    position: absolute;
    left: 16px;
    color: #6a9c7e;
    font-size: 16px;
}

.modern-input-group input {
    width: 100%;
    height: 48px;
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.3);
    border-radius: 8px;
    padding: 0 16px 0 44px;
    font-size: 14px;
    color: #ffffff;
    transition: all 0.3s ease;
    background: rgba(8, 20, 14, 0.6);
}

.modern-input-group input::placeholder {
    color: #4b6a57;
}

.modern-input-group input:focus {
    outline: none;
    border-color: var(--brand-accent-light);
    box-shadow:
        0 0 10px rgba(var(--brand-accent-light-rgb), 0.3),
        inset 0 0 6px rgba(var(--brand-accent-light-rgb), 0.15);
    background: rgba(12, 28, 18, 0.9);
}

.guest-warning {
    background: rgba(60, 20, 20, 0.7);
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: #fca5a5;
    padding: 20px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 16px;
    box-shadow: inset 0 0 12px rgba(239, 68, 68, 0.1);
}

.guest-warning i {
    font-size: 28px;
    color: var(--danger);
    text-shadow: 0 0 12px rgba(239, 68, 68, 0.6);
}

.guest-warning p {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
}

/* Shared button styles needed by this tab */
.btn-primary {
    background: linear-gradient(135deg, rgba(var(--brand-accent-light-rgb), 0.85) 0%, var(--brand-primary-dark) 100%);
    color: white;
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.6);
    height: 48px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
    transition: all 0.3s ease;
    margin-top: 8px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(var(--brand-accent-light-rgb), 0.35);
    border-color: var(--brand-accent-light);
    background: linear-gradient(135deg, var(--brand-accent-light) 0%, var(--brand-primary) 100%);
}

.btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    filter: grayscale(0.5);
}

.w-100 {
    width: 100%;
}

/* Light Mint Theme Override */
.section-title {
    color: var(--acc-text-strong, #214a31);
}

.input-icon {
    color: #6e9c80;
}

.modern-input-group input {
    color: var(--acc-text-strong, #214a31);
    background: rgba(255, 255, 255, 0.92);
    border-color: rgba(var(--brand-primary-rgb), 0.3);
}

.modern-input-group input::placeholder {
    color: #88a797;
}

.modern-input-group input:focus {
    border-color: rgba(var(--brand-primary-rgb), 0.52);
    box-shadow: 0 0 0 3px rgba(var(--brand-accent-light-rgb), 0.18);
    background: #ffffff;
}

.btn-primary {
    background: linear-gradient(135deg, var(--brand-primary-light) 0%, var(--brand-primary) 100%);
    border-color: rgba(63, 148, 75, 0.55);
    color: #f8fff9;
    box-shadow: 0 6px 16px rgba(58, 129, 76, 0.24);
    text-shadow: none;
}

.btn-primary:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--brand-primary-lighter) 0%, var(--brand-accent) 100%);
    box-shadow: 0 8px 18px rgba(58, 129, 76, 0.3);
}

.guest-warning {
    background: rgba(255, 244, 244, 0.86);
    border-color: rgba(239, 68, 68, 0.3);
    color: #9b3f3f;
}
</style>
