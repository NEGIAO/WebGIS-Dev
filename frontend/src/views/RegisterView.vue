<template>
    <div class="register-container">
        <div class="container fade-in">
            <div class="form-header">
                <h1 class="form-title">创建新账户</h1>
                <p class="form-subtitle">加入GIS系统，探索地理信息的世界</p>
                <div class="default-login-hint">
                    提示：默认账号密码都是123，直接输入即可进入
                </div>
            </div>
            
            <div class="form-body">
                <form @submit.prevent="handleRegister">
                    <div class="form-group">
                        <label for="username">用户名</label>
                        <div class="input-group">
                            <i class="icon fas fa-user"></i>
                            <input 
                                type="text" 
                                id="username" 
                                v-model="username" 
                                placeholder="输入用户名 (默认: 123)" 
                                required
                            >
                        </div>
                        <div class="hint">
                            <i class="fas fa-info-circle"></i>
                            默认用户名为"123"，可直接登录
                        </div>
                        <div v-if="usernameMessage" :class="['validation-message', usernameStatus]">
                            {{ usernameMessage }}
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
                                placeholder="输入密码 (默认: 123)" 
                                required
                            >
                        </div>
                        <div class="hint">
                            <i class="fas fa-shield-alt"></i>
                            默认密码为"123"，可直接登录
                        </div>
                        <div v-if="passwordMessage" :class="['validation-message', passwordStatus]">
                            {{ passwordMessage }}
                        </div>
                    </div>
                    
                    <button type="submit" class="btn">登录系统</button>
                    
                    <div class="login-link">
                        忘记密码? <a href="#">找回密码</a>
                    </div>
                </form>
            </div>
            
            <div class="form-footer">
                注册即表示您同意我们的 <a href="#">服务条款</a> 和 <a href="#">隐私政策</a>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from '../composables/useMessage';

const router = useRouter();
const message = useMessage();
const username = ref('');
const password = ref('');
const usernameMessage = ref('');
const usernameStatus = ref('');
const passwordMessage = ref('');
const passwordStatus = ref('');

const usernameRegex = /^(?=.*[A-Za-z])(?=.*\d).{4,20}$/;
// Simplified password regex for demo purposes, matching the original intent but maybe less strict if needed
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;

watch(username, (newVal) => {
    if (!newVal) {
        usernameMessage.value = '';
        usernameStatus.value = '';
        return;
    }
    if (usernameRegex.test(newVal) || newVal === '123') {
        usernameMessage.value = '✓ 用户名格式正确';
        usernameStatus.value = 'success';
    } else {
        usernameMessage.value = '✗ 用户名必须包含字母和数字，长度4-20位';
        usernameStatus.value = 'error';
    }
});

watch(password, (newVal) => {
    if (!newVal) {
        passwordMessage.value = '';
        passwordStatus.value = '';
        return;
    }
    // Allow '123' as a valid password for the demo
    if (passwordRegex.test(newVal) || newVal === '123') {
        passwordMessage.value = '✓ 密码格式正确';
        passwordStatus.value = 'success';
    } else {
        passwordMessage.value = '✗ 密码必须包含字母、数字和特殊字符，至少8位';
        passwordStatus.value = 'error';
    }
});

const handleRegister = () => {
    if (username.value === '123' && password.value === '123') {
        router.push('/home');
        return;
    }

    // Strict validation for non-default credentials
    let isValid = true;
    if (!usernameRegex.test(username.value)) {
        usernameMessage.value = '✗ 用户名必须包含字母和数字，长度4-20位';
        usernameStatus.value = 'error';
        isValid = false;
    }
    if (!passwordRegex.test(password.value)) {
        passwordMessage.value = '✗ 密码必须包含字母、数字和特殊字符，至少8位';
        passwordStatus.value = 'error';
        isValid = false;
    }

    if (isValid) {
        localStorage.setItem('username', username.value);
        message.success('注册成功！即将跳转...');
        router.push('/home');
    }
};
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
    min-height: 100vh;
    padding: 20px;
    width: 100%;
    box-sizing: border-box;
}

.container {
    background-color: #fff;
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 450px;
    overflow: hidden;
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

.form-body {
    padding: 35px;
    background-color: #ffffff;
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
        padding: 10px;
        align-items: flex-start; /* Allow scrolling on small screens if content is tall */
        padding-top: 20px;
    }

    .container {
        max-width: 100%;
        border-radius: 8px;
    }

    .form-body {
        padding: 20px;
    }

    .form-header {
        padding: 20px;
    }

    .form-title {
        font-size: 24px;
    }
}
</style>
