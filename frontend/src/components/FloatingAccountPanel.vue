<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from '../composables/useMessage'
import { apiAuthChangePassword, apiAuthLogout, apiAuthMe } from '../api/backend'
import { clearAuthSession, getAuthToken, getAuthUser, setAuthSession } from '../utils/auth'

const router = useRouter()
const message = useMessage()

// Panel State
const isOpen = ref(false)
const activeMenu = ref('overview') // 'overview', 'security', 'preferences'
const isSubmitting = ref(false)
const user = ref(getAuthUser())

// Password Form
const currentPassword = ref('')
const nextPassword = ref('')
const confirmPassword = ref('')

const roleTextMap = Object.freeze({
  super_admin: '超级管理员',
  registered: '注册用户',
  guest: '游客'
})

// Mocks for expanded UI
const mockJoinDate = ref(new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }))
const mockStats = ref({ routes: 12, draws: 35, logins: 128 })

const userInitial = computed(() => {
  const username = String(user.value?.username || 'U').trim()
  return username.slice(0, 1).toUpperCase() || 'U'
})

const roleText = computed(() => {
  const role = String(user.value?.role || '').trim()
  return roleTextMap[role] || '未知角色'
})

const panelLabel = computed(() => {
  const username = String(user.value?.username || '').trim()
  return username ? `账号：${username}` : '账号中心'
})

async function syncCurrentUser() {
  try {
    const result = await apiAuthMe()
    if (!result?.user) return

    user.value = result.user
    const token = getAuthToken()
    if (token) {
      setAuthSession({ token, user: result.user })
    }
  } catch {
    // handled by interceptor
  }
}

function closePanel() {
  isOpen.value = false
  setTimeout(() => {
    activeMenu.value = 'overview'
    resetPasswordForm()
  }, 200)
}

function togglePanel() {
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    setTimeout(() => {
      activeMenu.value = 'overview'
      resetPasswordForm()
    }, 200)
  }
}

function selectMenu(menu) {
  activeMenu.value = menu
  if (menu !== 'security') {
    resetPasswordForm()
  }
}

function resetPasswordForm() {
  currentPassword.value = ''
  nextPassword.value = ''
  confirmPassword.value = ''
}

function handleDocumentClick(event) {
  const root = event.target?.closest?.('.floating-account-manager')
  if (!root) {
    closePanel()
  }
}

async function forceBackToLogin(hintText = '') {
  clearAuthSession()
  closePanel()

  if (hintText) {
    message.success(hintText)
  }

  await router.replace('/register')
}

async function handleLogout() {
  if (isSubmitting.value) return
  isSubmitting.value = true

  try {
    await apiAuthLogout()
  } catch {
  } finally {
    isSubmitting.value = false
  }

  await forceBackToLogin('已退出登录')
}

async function handleChangePassword() {
  if (isSubmitting.value) return

  const oldPass = String(currentPassword.value || '').trim()
  const newPass = String(nextPassword.value || '').trim()
  const confirmPass = String(confirmPassword.value || '').trim()

  if (!oldPass || !newPass || !confirmPass) {
    message.error('请完整填写密码信息')
    return
  }

  if (newPass !== confirmPass) {
    message.error('两次输入的新密码不一致')
    return
  }

  if (newPass.length < 6) {
    message.error('新密码长度至少为 6 位')
    return
  }

  isSubmitting.value = true

  try {
    await apiAuthChangePassword(oldPass, newPass)
    resetPasswordForm()
    await forceBackToLogin('密码已修改，请重新登录')
  } catch (error) {
    const detail = String(error?.message || '').trim()
    message.error(detail || '密码修改失败，请稍后重试')
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  syncCurrentUser()
  document.addEventListener('pointerdown', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentClick)
})
</script>

<template>
  <div class="floating-account-manager" :class="{ 'is-open': isOpen }">
    <button
      class="account-fab"
      type="button"
      :aria-label="panelLabel"
      @click.stop="togglePanel"
    >
      <div class="fab-content">
        <div class="account-avatar-wrapper">
            <span class="account-avatar">{{ userInitial }}</span>
            <span class="status-dot"></span>
        </div>
        <span class="account-fab-text">{{ user?.username || '用户' }}</span>
        <i class="fas fa-chevron-up fold-icon" :class="{ 'rotated': !isOpen }"></i>
      </div>
    </button>

    <transition name="account-panel-transition">
      <div v-if="isOpen" class="account-panel" @pointerdown.stop>
        
        <!-- Header Profile Summary -->
        <div class="panel-header blur-bg">
          <div class="profile-main">
            <div class="profile-avatar large">{{ userInitial }}</div>
            <div class="profile-info">
              <h3 class="profile-name">{{ user?.username || 'unknown' }}</h3>
              <span class="profile-role">
                <i class="fas fa-id-badge"></i> {{ roleText }}
              </span>
            </div>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="panel-nav">
          <button 
            type="button" 
            class="nav-tab" 
            :class="{ active: activeMenu === 'overview' }"
            @click="selectMenu('overview')"
          >
            <i class="fas fa-home"></i> 总览
          </button>
          <button 
            type="button" 
            class="nav-tab" 
            :class="{ active: activeMenu === 'security' }"
            @click="selectMenu('security')"
          >
            <i class="fas fa-shield-alt"></i> 安全
          </button>
          <button 
            type="button" 
            class="nav-tab" 
            :class="{ active: activeMenu === 'preferences' }"
            @click="selectMenu('preferences')"
          >
            <i class="fas fa-sliders-h"></i> 偏好
          </button>
        </div>

        <!-- Scrollable Content Area -->
        <div class="panel-body styled-scrollbar">
          
          <!-- View 1: Overview -->
          <transition name="fade-slide" mode="out-in">
            <div v-if="activeMenu === 'overview'" class="view-content overview-view" key="overview">
              <div class="info-card">
                <div class="info-row">
                  <span class="info-label">注册时间</span>
                  <span class="info-value">{{ mockJoinDate }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">当前状态</span>
                  <span class="info-value text-success">
                    <i class="fas fa-circle active-dot"></i> 在线
                  </span>
                </div>
              </div>
              
              <div class="stats-grid">
                <div class="stat-box">
                  <i class="fas fa-route stat-icon"></i>
                  <span class="stat-num">{{ mockStats.routes }}</span>
                  <span class="stat-name">路线</span>
                </div>
                <div class="stat-box">
                  <i class="fas fa-draw-polygon stat-icon"></i>
                  <span class="stat-num">{{ mockStats.draws }}</span>
                  <span class="stat-name">标绘</span>
                </div>
                <div class="stat-box">
                  <i class="fas fa-sign-in-alt stat-icon"></i>
                  <span class="stat-num">{{ mockStats.logins }}</span>
                  <span class="stat-name">访问</span>
                </div>
              </div>
            </div>

            <!-- View 2: Security -->
            <div v-else-if="activeMenu === 'security'" class="view-content security-view" key="security">
              <div v-if="user?.role === 'guest'" class="guest-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <p>游客账号不支持修改密码，请注册正式账号享受完整功能。</p>
              </div>
              <div v-else class="password-form-container">
                <h4 class="section-title">修改密码</h4>
                <div class="modern-input-group">
                  <i class="fas fa-lock input-icon"></i>
                  <input
                    v-model="currentPassword"
                    type="password"
                    autocomplete="current-password"
                    placeholder="当前密码"
                  >
                </div>
                <div class="modern-input-group">
                  <i class="fas fa-key input-icon"></i>
                  <input
                    v-model="nextPassword"
                    type="password"
                    autocomplete="new-password"
                    placeholder="新密码 (至少6位)"
                  >
                </div>
                <div class="modern-input-group">
                  <i class="fas fa-check-double input-icon"></i>
                  <input
                    v-model="confirmPassword"
                    type="password"
                    autocomplete="new-password"
                    placeholder="确认新密码"
                  >
                </div>
                
                <button
                  class="btn-primary w-100"
                  type="button"
                  :disabled="isSubmitting"
                  @click="handleChangePassword"
                >
                  <i class="fas" :class="isSubmitting ? 'fa-spinner fa-spin' : 'fa-save'"></i>
                  {{ isSubmitting ? '正在提交...' : '保存新密码' }}
                </button>
              </div>
            </div>

            <!-- View 3: Preferences -->
            <div v-else-if="activeMenu === 'preferences'" class="view-content prefs-view" key="preferences">
              <div class="pref-list">
                <div class="pref-item">
                  <div class="pref-info">
                    <span class="pref-title"><i class="fas fa-moon"></i> 深色模式</span>
                    <span class="pref-desc">跟随系统自动切换界面主题</span>
                  </div>
                  <label class="modern-toggle">
                    <input type="checkbox" disabled checked>
                    <span class="slider"></span>
                  </label>
                </div>
                <div class="pref-item">
                  <div class="pref-info">
                    <span class="pref-title"><i class="fas fa-bell"></i> 系统通知</span>
                    <span class="pref-desc">接收重要更新和消息推送</span>
                  </div>
                  <label class="modern-toggle">
                    <input type="checkbox" disabled checked>
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
              <div class="coming-soon">
                <span>更多个性化设置开发中...</span>
              </div>
            </div>
          </transition>
        </div>

        <!-- Footer Actions -->
        <div class="panel-footer blur-bg">
          <button
            class="btn-logout"
            type="button"
            :disabled="isSubmitting"
            @click="handleLogout"
            title="安全退出"
          >
            <i class="fas fa-sign-out-alt"></i>
            退出系统
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* 
  Modern Floating Account Center 
  Sci-Fi Green Glassmorphism Design
*/

.floating-account-manager {
  position: fixed;
  bottom: 24px;
  left: 20px;
  z-index: 1500;
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 12px;
}

/* Float FAB */
.account-fab {
  border: 1px solid rgba(91, 207, 137, 0.4);
  border-radius: 30px;
  background: rgba(14, 28, 20, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: #fff;
  height: 48px;
  padding: 4px 16px 4px 6px;
  cursor: pointer;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 10px rgba(91, 207, 137, 0.2);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  overflow: hidden;
}

.account-fab::before {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 50%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(91,207,137,0.2), transparent);
  transition: left 0.5s ease;
}

.account-fab:hover {
  transform: translateY(-2px);
  background: rgba(14, 28, 20, 0.9);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), 0 0 15px rgba(91, 207, 137, 0.4);
  border-color: rgba(91, 207, 137, 0.8);
}

.account-fab:hover::before {
  left: 150%;
}

.fab-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.account-avatar-wrapper {
  position: relative;
}

.account-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(135deg, #5bcf89 0%, #20874e 100%);
  color: #fff;
  box-shadow: inset 0 -2px 4px rgba(0,0,0,0.4);
  border: 1px solid rgba(91, 207, 137, 0.6);
}

.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  background: #5bcf89;
  border: 2px solid #0e1c14;
  border-radius: 50%;
  box-shadow: 0 0 6px #5bcf89;
}

.account-fab-text {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
  white-space: nowrap;
  color: #ffffff;
  text-shadow: 0 0 8px rgba(91, 207, 137, 0.5);
}

.fold-icon {
  font-size: 12px;
  color: #5bcf89;
  opacity: 0.8;
  transition: transform 0.3s ease;
}

.fold-icon.rotated {
  transform: rotate(180deg);
}

/* Glass Panel */
.account-panel {
  width: 340px;
  border-radius: 6px;
  border-left: 2px solid #5bcf89;
  border-right: 2px solid rgba(91, 207, 137, 0.3);
  border-top: 1px solid rgba(91, 207, 137, 0.2);
  border-bottom: 1px solid rgba(91, 207, 137, 0.2);
  background: rgba(14, 28, 20, 0.9);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6), inset 0 0 20px rgba(91, 207, 137, 0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  transform-origin: bottom left;
  clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
}

.blur-bg {
  background: transparent;
}

/* Header */
.panel-header {
  padding: 20px;
  border-bottom: 1px solid rgba(91, 207, 137, 0.2);
  position: relative;
}

.panel-header::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #5bcf89, transparent);
  opacity: 0.5;
}

.profile-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.profile-avatar.large {
  width: 56px;
  height: 56px;
  font-size: 24px;
  background: linear-gradient(135deg, #5bcf89 0%, #20874e 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  border: 1px solid rgba(91, 207, 137, 0.5);
  box-shadow: 0 4px 15px rgba(91, 207, 137, 0.3);
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.2;
  text-shadow: 0 0 8px rgba(91, 207, 137, 0.4);
}

.profile-role {
  font-size: 13px;
  color: #a0ddb6;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.profile-role i {
  color: #5bcf89;
}

/* Nav Tabs */
.panel-nav {
  display: flex;
  padding: 0 10px;
  border-bottom: 1px solid rgba(91, 207, 137, 0.2);
  background: rgba(14, 28, 20, 0.4);
}

.nav-tab {
  flex: 1;
  background: transparent;
  border: none;
  padding: 14px 0;
  font-size: 13px;
  font-weight: 600;
  color: #6a9c7e;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.nav-tab:hover {
  color: #a0ddb6;
}

.nav-tab.active {
  color: #ffffff;
  text-shadow: 0 0 8px rgba(91, 207, 137, 0.5);
}

.nav-tab.active i {
  color: #5bcf89;
}

.nav-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20%;
  width: 60%;
  height: 2px;
  background: #5bcf89;
  box-shadow: 0 -2px 8px #5bcf89;
}

/* Content Area */
.panel-body {
  height: 240px;
  overflow-y: auto;
  padding: 20px;
  position: relative;
}

.styled-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.styled-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.styled-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(91, 207, 137, 0.3);
  border-radius: 4px;
}
.styled-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(91, 207, 137, 0.6);
}

/* View: Overview */
.info-card {
  background: rgba(20, 35, 25, 0.5);
  border-radius: 8px;
  padding: 14px;
  border: 1px solid rgba(91, 207, 137, 0.2);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.info-label {
  color: #8fbc9f;
}

.info-value {
  font-weight: 600;
  color: #ffffff;
}

.text-success { color: #5bcf89; text-shadow: 0 0 5px rgba(91,207,137,0.5); }
.active-dot { font-size: 8px; margin-right: 4px; vertical-align: middle; box-shadow: 0 0 6px #5bcf89; border-radius: 50%; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.stat-box {
  background: rgba(20, 35, 25, 0.5);
  border-radius: 8px;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(91, 207, 137, 0.2);
  transition: transform 0.2s ease, border-color 0.2s ease;
  box-shadow: inset 0 0 10px rgba(0,0,0,0.3);
}

.stat-box:hover {
  transform: translateY(-2px);
  border-color: #5bcf89;
  background: rgba(20, 35, 25, 0.8);
}

.stat-icon {
  font-size: 16px;
  color: #5bcf89;
  filter: drop-shadow(0 0 4px rgba(91, 207, 137, 0.6));
}

.stat-num {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 0 4px rgba(255, 255, 255, 0.2);
}

.stat-name {
  font-size: 11px;
  color: #8fbc9f;
}

/* View: Security */
.password-form-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 700;
  color: #a0ddb6;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-left: 2px solid #5bcf89;
  padding-left: 8px;
}

.modern-input-group {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  color: #6a9c7e;
  font-size: 14px;
}

.modern-input-group input {
  width: 100%;
  height: 42px;
  border: 1px solid rgba(91, 207, 137, 0.3);
  border-radius: 6px;
  padding: 0 14px 0 38px;
  font-size: 13px;
  color: #ffffff;
  transition: all 0.2s ease;
  background: rgba(10, 20, 15, 0.6);
}

.modern-input-group input::placeholder {
  color: #4b6a57;
}

.modern-input-group input:focus {
  outline: none;
  border-color: #5bcf89;
  box-shadow: 0 0 8px rgba(91, 207, 137, 0.3), inset 0 0 5px rgba(91, 207, 137, 0.2);
  background: rgba(14, 28, 20, 0.9);
}

.btn-primary {
  background: linear-gradient(135deg, rgba(91, 207, 137, 0.8) 0%, #20874e 100%);
  color: white;
  border: 1px solid rgba(91, 207, 137, 0.5);
  height: 42px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
  margin-top: 4px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(91, 207, 137, 0.3);
  border-color: #5bcf89;
  background: linear-gradient(135deg, #5bcf89 0%, #28a763 100%);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.w-100 { width: 100%; }

.guest-warning {
  background: rgba(60, 20, 20, 0.6);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  padding: 16px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.guest-warning i {
  font-size: 24px;
  color: #ef4444;
  text-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
}

.guest-warning p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

/* View: Preferences */
.pref-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pref-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(20, 35, 25, 0.5);
  padding: 14px;
  border-radius: 8px;
  border: 1px solid rgba(91, 207, 137, 0.2);
}

.pref-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pref-title {
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pref-title i {
  color: #5bcf89;
}

.pref-desc {
  font-size: 12px;
  color: #8fbc9f;
}

.modern-toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.modern-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: not-allowed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(91, 207, 137, 0.2);
  transition: .4s;
  border-radius: 34px;
  border: 1px solid rgba(91, 207, 137, 0.4);
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px; width: 16px;
  left: 3px; bottom: 2px;
  background-color: #6a9c7e;
  transition: .4s;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

input:checked + .slider { 
  background-color: rgba(91, 207, 137, 0.4); 
  border-color: #5bcf89;
}
input:checked + .slider:before { 
  transform: translateX(20px); 
  background-color: #5bcf89;
  box-shadow: 0 0 8px #5bcf89;
}

.coming-soon {
  text-align: center;
  margin-top: 24px;
  color: #4b6a57;
  font-size: 12px;
  font-style: italic;
  position: relative;
}

.coming-soon::before, .coming-soon::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 25%;
  height: 1px;
  background: rgba(91, 207, 137, 0.2);
}

.coming-soon::before { left: 0; }
.coming-soon::after { right: 0; }

/* Footer Action */
.panel-footer {
  padding: 14px 20px;
  border-top: 1px solid rgba(91, 207, 137, 0.2);
  position: relative;
}

.panel-footer::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #5bcf89, transparent);
  opacity: 0.3;
}

.btn-logout {
  width: 100%;
  height: 40px;
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.btn-logout:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #fef2f2;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
}

/* Transitions */
.account-panel-transition-enter-active,
.account-panel-transition-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.account-panel-transition-enter-from,
.account-panel-transition-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  filter: blur(4px);
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .floating-account-manager {
    bottom: 20px;
    left: 12px;
  }
  .account-panel {
    width: min(90vw, 320px);
  }
}
</style>
