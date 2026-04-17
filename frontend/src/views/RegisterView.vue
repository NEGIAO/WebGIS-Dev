<template>
    <div class="register-container">
        <div class="container fade-in">
            <div class="form-header">
                <h1 class="form-title">WebGIS 用户登录</h1>
                <p class="form-subtitle">登录后才能访问系统主页与受保护 API</p>

                <div class="quick-hints">
                    <div class="hint-item">游客：用户名 user，密码 123</div>
                    <div class="hint-item">管理员账号由数据库维护，前端不展示管理员密码</div>
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
                            >
                        </div>
                        <div class="hint" v-if="mode === 'login'">
                            <i class="fas fa-info-circle"></i>
                            登录角色由后端统一校验（游客/注册用户/管理员）
                        </div>
                        <div class="hint" v-else>
                            <i class="fas fa-user-plus"></i>
                            user/admin/super_admin 为保留用户名，不能注册
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
                            管理员密码仅保存在数据库中，不在前端页面展示
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

                    <div class="quick-action-row" v-if="mode === 'login'">
                        <button type="button" class="quick-btn" @click="fillGuestAccount">
                            填入游客账号
                        </button>
                    </div>

                    <div v-if="formMessage" :class="['validation-message', formStatus]">
                        {{ formMessage }}
                    </div>
                    
                    <button type="submit" class="btn" :disabled="isSubmitting">
                        {{ isSubmitting ? '处理中...' : (mode === 'login' ? '登录系统' : '创建账号') }}
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
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRoute } from 'vue-router';
import { useMessage } from '../composables/useMessage';
import { apiAuthLogin, apiAuthRegister } from '../api/backend';
import { getAuthToken, setAuthSession } from '../utils/auth';

const router = useRouter();
const route = useRoute();
const message = useMessage();

const mode = ref('login');
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const isSubmitting = ref(false);
const formMessage = ref('');
const formStatus = ref('');

const usernameRegex = /^[A-Za-z0-9_]{3,24}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{6,64}$/;
const reservedNames = new Set(['user', 'admin', 'super_admin']);

function setFormState(status = '', text = '') {
    formStatus.value = status;
    formMessage.value = text;
}

function normalizeUsername(raw) {
    return String(raw || '').trim();
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
    }
}

function fillGuestAccount() {
    mode.value = 'login';
    username.value = 'user';
    password.value = '123';
    setFormState('success', '已填入游客账号，请点击“登录系统”');
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

        const result = await apiAuthLogin(payload);
        const token = String(result?.token || '').trim();
        const user = result?.user || null;

        if (!token || !user) {
            throw new Error('登录响应异常，请稍后重试');
        }

        setAuthSession({ token, user });
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
        setFormState('error', 'user/admin/super_admin 为系统保留用户名');
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

    isSubmitting.value = true;
    setFormState('', '');

    try {
        await apiAuthRegister(normalizedUsername, normalizedPassword);
        message.success('注册成功，请使用新账号登录');
        password.value = '';
        confirmPassword.value = '';
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
    margin-bottom: 8px;
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
    grid-template-columns: 1fr;
    gap: 10px;
    margin-top: 12px;
}

.quick-btn {
    border: 1px dashed #9ab79a;
    background: #f7fbf7;
    color: #2b5a2b;
    border-radius: 5px;
    padding: 9px 8px;
    font-size: 13px;
    cursor: pointer;
}

.quick-btn:hover {
    background: #edf7ed;
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
}
</style>
