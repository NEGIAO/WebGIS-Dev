<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from '../../composables/useMessage'
import {
  apiAuthChangePassword,
  apiAuthLogout,
  apiAuthMe,
  apiCreateUserMessage,
  apiListUserMessages,
  apiStatisticsCenter,
  apiStatisticsRealtime
} from '../../api/backend'
import { clearAuthSession, getAuthToken, getAuthUser, setAuthSession } from '../../utils/auth'

const AdminControlPanel = defineAsyncComponent(() => import('./AdminControlPanel.vue'))
const ApiManagementPanel = defineAsyncComponent(() => import('./ApiManagementPanel.vue'))

const router = useRouter()
const message = useMessage()
const emit = defineEmits(['fullscreen-change'])

// Panel State
const isOpen = ref(false)
const isFullscreen = ref(false)
const activeMenu = ref('overview') // 'overview', 'security', 'admin', 'api-management', 'preferences'
const isSubmitting = ref(false)
const isLoadingCenter = ref(false)
const isPostingMessage = ref(false)
const user = ref(getAuthUser())

const centerData = ref({
  quota: {
    limit: null,
    used: 0,
    remaining: null,
    usage_date: ''
  },
  self_stats: {
    registered_at: '',
    login_count: 0,
    total_login_seconds: 0,
    total_api_calls: 0,
    total_visit_count: 0,
    last_login_at: '',
    last_logout_at: '',
    current_session_seconds: 0
  },
  realtime: {
    online_users: 0,
    total_visit_count: 0,
    total_api_calls: 0,
    total_registered_users: 0
  },
  admin_contact: '管理员联系方式：admin@negiao.local',
  messages: []
})

const newMessageText = ref('')

// Password Form
const currentPassword = ref('')
const nextPassword = ref('')
const confirmPassword = ref('')

const roleTextMap = Object.freeze({
  admin: '管理员',
  super_admin: '管理员',
  registered: '注册用户',
  guest: '游客'
})

const isAdmin = computed(() => String(user.value?.role || '') === 'admin')

function resolvePublicAssetPath(relativePath) {
  const base = String(import.meta.env.BASE_URL || '/').trim()
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = String(relativePath || '').replace(/^\/+/, '')
  return `${normalizedBase}${normalizedPath}`
}

const userAvatarIndex = computed(() => {
  const raw = Number(user.value?.avatar_index)
  if (Number.isInteger(raw) && raw >= 0 && raw <= 11) {
    return raw
  }
  const role = String(user.value?.role || '').trim()
  if (role === 'admin') {
    return 1
  }
  return 0
})

const userAvatarSrc = computed(() => {
  return resolvePublicAssetPath(`avatars/avatar-${userAvatarIndex.value}.svg`)
})

const roleText = computed(() => {
  const role = String(user.value?.role || '').trim()
  return roleTextMap[role] || '未知角色'
})

const panelLabel = computed(() => {
  const username = String(user.value?.username || '').trim()
  return username ? `账号：${username}` : '账号中心'
})

const selfStats = computed(() => centerData.value?.self_stats || {})
const quotaInfo = computed(() => centerData.value?.quota || {})
const realtimeStats = computed(() => centerData.value?.realtime || {})
const adminContact = computed(() => String(centerData.value?.admin_contact || '').trim())
const recentMessages = computed(() => {
  const source = centerData.value?.messages
  return Array.isArray(source) ? source : []
})

const quotaText = computed(() => {
  const used = Number(quotaInfo.value?.used || 0)
  const limit = quotaInfo.value?.limit
  if (limit == null) {
    return `已调用 ${used} 次 / 不限额`
  }
  return `已调用 ${used}/${limit} 次`
})

const sessionDurationText = computed(() => {
  const sec = Number(selfStats.value?.current_session_seconds || 0)
  return formatDuration(sec)
})

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds || 0))
  const day = Math.floor(sec / 86400)
  const hour = Math.floor((sec % 86400) / 3600)
  const minute = Math.floor((sec % 3600) / 60)
  const second = sec % 60

  if (day > 0) {
    return `${day}天 ${hour}小时 ${minute}分钟`
  }
  if (hour > 0) {
    return `${hour}小时 ${minute}分钟 ${second}秒`
  }
  if (minute > 0) {
    return `${minute}分钟 ${second}秒`
  }
  return `${second}秒`
}

function formatDateTime(value) {
  const raw = String(value || '').trim()
  if (!raw) return '-'

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return raw
  }

  return parsed.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

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

async function loadCenterData({ silent = false } = {}) {
  if (isLoadingCenter.value) return

  isLoadingCenter.value = true
  try {
    const result = await apiStatisticsCenter()

    if (result?.user) {
      user.value = result.user
      const token = getAuthToken()
      if (token) {
        setAuthSession({ token, user: result.user })
      }
    }

    centerData.value = {
      ...centerData.value,
      ...(result || {})
    }
  } catch (error) {
    if (!silent) {
      message.warning(String(error?.message || '用户中心数据加载失败'))
    }
  } finally {
    isLoadingCenter.value = false
  }
}

async function refreshRealtimeData({ silent = true } = {}) {
  try {
    const result = await apiStatisticsRealtime()
    if (result?.data) {
      centerData.value = {
        ...centerData.value,
        realtime: {
          ...centerData.value.realtime,
          ...result.data
        }
      }
    }
  } catch (error) {
    if (!silent) {
      message.warning(String(error?.message || '实时统计刷新失败'))
    }
  }
}

async function refreshMessages() {
  try {
    const result = await apiListUserMessages()
    const list = Array.isArray(result?.data) ? result.data : []
    centerData.value = {
      ...centerData.value,
      messages: list
    }
  } catch {
    // keep latest messages in panel
  }
}

function closePanel() {
  isOpen.value = false
  setFullscreen(false)
  setTimeout(() => {
    activeMenu.value = 'overview'
    resetPasswordForm()
  }, 200)
}

function setFullscreen(nextValue) {
  const normalized = Boolean(nextValue)
  if (isFullscreen.value === normalized) return
  isFullscreen.value = normalized
  emit('fullscreen-change', normalized)
}

function toggleFullscreen() {
  setFullscreen(!isFullscreen.value)
}

function togglePanel() {
  const nextOpen = !isOpen.value
  isOpen.value = nextOpen

  if (nextOpen) {
    loadCenterData({ silent: true })
  }

  if (!nextOpen) {
    setFullscreen(false)
    setTimeout(() => {
      activeMenu.value = 'overview'
      resetPasswordForm()
    }, 200)
  }
}

function selectMenu(menu) {
  if (menu === 'admin' && !isAdmin.value) return

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

function handleDocumentKeydown(event) {
  if (event.key === 'Escape' && isFullscreen.value) {
    setFullscreen(false)
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

async function handleSubmitUserMessage() {
  if (isPostingMessage.value) return

  const content = String(newMessageText.value || '').trim()
  if (!content) {
    message.warning('留言内容不能为空')
    return
  }

  isPostingMessage.value = true
  try {
    await apiCreateUserMessage(content)
    newMessageText.value = ''
    message.success('留言已发布')
    await refreshMessages()
    await refreshRealtimeData({ silent: true })
  } catch (error) {
    message.error(String(error?.message || '留言发布失败'))
  } finally {
    isPostingMessage.value = false
  }
}

let centerTimer = null

onMounted(() => {
  syncCurrentUser()
  loadCenterData({ silent: true })
  refreshRealtimeData({ silent: true })
  refreshMessages()

  if (typeof window !== 'undefined') {
    centerTimer = window.setInterval(() => {
      loadCenterData({ silent: true })
      refreshRealtimeData({ silent: true })
    }, 30000)
  }

  document.addEventListener('pointerdown', handleDocumentClick)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  setFullscreen(false)

  if (centerTimer && typeof window !== 'undefined') {
    window.clearInterval(centerTimer)
    centerTimer = null
  }

  document.removeEventListener('pointerdown', handleDocumentClick)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div class="floating-account-manager" :class="{ 'is-open': isOpen, 'is-fullscreen': isFullscreen }">
    <button
      class="account-fab"
      type="button"
      :aria-label="panelLabel"
      @click.stop="togglePanel"
    >
      <div class="fab-content">
        <div class="account-avatar-wrapper">
            <span class="account-avatar">
              <img :src="userAvatarSrc" :alt="`${user?.username || '用户'}头像`" loading="lazy">
            </span>
            <span class="status-dot"></span>
        </div>
        <span class="account-fab-text">{{ user?.username || '用户' }}</span>
        <i class="fas fa-chevron-up fold-icon" :class="{ 'rotated': !isOpen }"></i>
      </div>
    </button>

    <transition name="account-panel-transition">
      <div v-if="isOpen" class="account-panel" :class="{ 'is-fullscreen': isFullscreen }" @pointerdown.stop>
        
        <!-- Header Profile Summary -->
        <div class="panel-header blur-bg">
          <div class="profile-main">
            <div class="profile-avatar large">
              <img :src="userAvatarSrc" :alt="`${user?.username || '用户'}头像`" loading="lazy">
            </div>
            <div class="profile-info">
              <h3 class="profile-name">{{ user?.username || 'unknown' }}</h3>
              <span class="profile-role">
                <i class="fas fa-id-badge"></i> {{ roleText }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="btn-fullscreen"
            :title="isFullscreen ? '退出全屏' : '全屏展开'"
            @click="toggleFullscreen"
          >
            <i :class="isFullscreen ? 'fas fa-compress-alt' : 'fas fa-expand-alt'"></i>
          </button>
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
            v-if="isAdmin"
            type="button"
            class="nav-tab"
            :class="{ active: activeMenu === 'admin' }"
            @click="selectMenu('admin')"
          >
            <i class="fas fa-database"></i> 管理
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="nav-tab"
            :class="{ active: activeMenu === 'api-management' }"
            @click="selectMenu('api-management')"
          >
            <i class="fas fa-sliders-h"></i> API
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
                  <span class="info-value">{{ formatDateTime(selfStats.registered_at) }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">上次登录</span>
                  <span class="info-value">{{ formatDateTime(selfStats.last_login_at) }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">本次在线时长</span>
                  <span class="info-value">{{ sessionDurationText }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">当前 API 配额</span>
                  <span class="info-value">{{ quotaText }}</span>
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
                  <i class="fas fa-sign-in-alt stat-icon"></i>
                  <span class="stat-num">{{ selfStats.login_count || 0 }}</span>
                  <span class="stat-name">登录次数</span>
                </div>
                <div class="stat-box">
                  <i class="fas fa-chart-line stat-icon"></i>
                  <span class="stat-num">{{ selfStats.total_visit_count || 0 }}</span>
                  <span class="stat-name">访问次数</span>
                </div>
                <div class="stat-box">
                  <i class="fas fa-bolt stat-icon"></i>
                  <span class="stat-num">{{ selfStats.total_api_calls || 0 }}</span>
                  <span class="stat-name">API 调用</span>
                </div>
              </div>

              <div class="info-card account-extra-card">
                <div class="info-row">
                  <span class="info-label">全站在线用户</span>
                  <span class="info-value">{{ realtimeStats.online_users || 0 }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">全站总浏览量</span>
                  <span class="info-value">{{ realtimeStats.total_visit_count || 0 }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">全站总 API 调用</span>
                  <span class="info-value">{{ realtimeStats.total_api_calls || 0 }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">注册用户总数</span>
                  <span class="info-value">{{ realtimeStats.total_registered_users || 0 }}</span>
                </div>
              </div>

              <div class="info-card account-extra-card">
                <div class="info-row">
                  <span class="info-label">管理员联系方式</span>
                  <span class="info-value break-text">{{ adminContact || '未配置' }}</span>
                </div>
              </div>

              <div class="info-card account-extra-card">
                <div class="compose-title">用户留言</div>
                <textarea
                  v-model="newMessageText"
                  class="user-message-input"
                  placeholder="请输入你的建议或反馈，发布后所有用户都能看到"
                ></textarea>
                <button
                  class="btn-primary w-100"
                  type="button"
                  :disabled="isPostingMessage"
                  @click="handleSubmitUserMessage"
                >
                  <i class="fas" :class="isPostingMessage ? 'fa-spinner fa-spin' : 'fa-paper-plane'"></i>
                  {{ isPostingMessage ? '发布中...' : '发布留言' }}
                </button>

                <div class="message-list">
                  <div v-if="recentMessages.length === 0" class="message-empty">暂无留言</div>
                  <div v-for="item in recentMessages" :key="item.id" class="message-item">
                    <div class="message-item-meta">
                      <span class="message-author">{{ item.username || '匿名' }}</span>
                      <span class="message-time">{{ formatDateTime(item.created_at) }}</span>
                    </div>
                    <div class="message-item-content">{{ item.content }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- View 2: Security -->
            <div v-else-if="activeMenu === 'security'" class="view-content security-view" key="security">
              <div v-if="user?.role === 'guest'" class="guest-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <p>游客账号不支持修改密码，请注册正式账号享受完整功能。</p>
              </div>
              <div v-else-if="user?.role === 'admin'" class="guest-warning">
                <i class="fas fa-user-shield"></i>
                <p>管理员密码优先由 SUPER_USER 控制（本地未配置时默认 123456），不支持在线修改。</p>
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

            <!-- View 3: Admin -->
            <div v-else-if="activeMenu === 'admin' && isAdmin" class="view-content admin-view" key="admin">
              <AdminControlPanel />
            </div>

            <!-- View 4: API Management -->
            <div v-else-if="activeMenu === 'api-management' && isAdmin" class="view-content api-mgmt-view" key="api-management">
              <ApiManagementPanel />
            </div>

            <!-- View 5: Preferences -->
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
  High-End Atmospheric Floating Account Center
  Emerald Gradient & Premium Glassmorphism Design
*/

.floating-account-manager {
  position: fixed;
  top: 20px;
  left: 230px;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 16px;
}

.floating-account-manager.is-fullscreen {
  z-index: 3000;
}

.floating-account-manager.is-fullscreen .account-fab {
  display: none;
}

/* Float FAB */
.account-fab {
  border: 1px solid rgba(91, 207, 137, 0.4);
  border-radius: 40px;
  background: rgba(10, 24, 15, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #fff;
  height: 56px;
  padding: 6px 20px 6px 8px;
  cursor: pointer;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 16px rgba(91, 207, 137, 0.25);
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  overflow: hidden;
}

.account-fab::before {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 50%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(91,207,137,0.3), transparent);
  transition: left 0.6s ease;
}

.account-fab:hover {
  transform: translateY(-3px);
  background: rgba(10, 24, 15, 0.95);
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.6), 0 0 20px rgba(91, 207, 137, 0.5);
  border-color: rgba(91, 207, 137, 0.9);
}

.account-fab:hover::before {
  left: 150%;
}

.fab-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.account-avatar-wrapper {
  position: relative;
}

.account-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, #5bcf89 0%, #20874e 100%);
  color: #fff;
  box-shadow: inset 0 -3px 6px rgba(0,0,0,0.4);
  border: 2px solid rgba(91, 207, 137, 0.7);
}

.account-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  background: #5bcf89;
  border: 2px solid #0a180f;
  border-radius: 50%;
  box-shadow: 0 0 8px #5bcf89;
}

.account-fab-text {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
  white-space: nowrap;
  color: #ffffff;
  text-shadow: 0 0 10px rgba(91, 207, 137, 0.5);
}

.fold-icon {
  font-size: 14px;
  color: #5bcf89;
  opacity: 0.8;
  transition: transform 0.4s ease;
  margin-left: 2px;
}

.fold-icon.rotated {
  transform: rotate(180deg);
}

/* Glass Panel */
.account-panel {
  width: 380px;
  border-radius: 12px;
  border: 1px solid rgba(91, 207, 137, 0.3);
  background: linear-gradient(to bottom, rgba(12, 28, 18, 0.9), rgba(6, 18, 10, 0.96));
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.7), inset 0 0 24px rgba(91, 207, 137, 0.15);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px);
  display: flex;
  flex-direction: column;
  transform-origin: bottom left;
  clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.account-panel.is-fullscreen {
  border-radius: 0;
  border: none;
  clip-path: none;
  z-index: 1;
  transform-origin: center;
  /* background defaults to panel gradient */
}

.account-panel.is-fullscreen .panel-header {
  padding: 16px 20px;
}

.account-panel.is-fullscreen .panel-nav {
  flex-wrap: wrap;
  gap: 8px;
}

.account-panel.is-fullscreen .nav-tab {
  flex: 0 1 calc(25% - 6px);
  padding: 10px 12px;
}

.account-panel.is-fullscreen .panel-body {
  height: auto;
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.account-panel.is-fullscreen .panel-footer {
  position: sticky;
  bottom: 0;
  padding: 12px 20px;
}

.account-panel.is-fullscreen .panel-header {
  padding: 16px 20px;
}

.account-panel.is-fullscreen .panel-nav {
  flex-wrap: wrap;
  gap: 8px;
}

.account-panel.is-fullscreen .nav-tab {
  flex: 0 1 calc(25% - 6px);
  padding: 10px 12px;
}

.account-panel.is-fullscreen .panel-body {
  height: auto;
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.account-panel.is-fullscreen .panel-footer {
  position: sticky;
  bottom: 0;
  padding: 12px 20px;
}

.blur-bg {
  background: transparent;
}

/* Header */
.panel-header {
  padding: 24px;
  border-bottom: 1px solid rgba(91, 207, 137, 0.2);
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.panel-header::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(91,207,137,0.5), transparent);
}

.profile-main {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1;
}

.profile-avatar.large {
  width: 64px;
  height: 64px;
  font-size: 26px;
  background: linear-gradient(135deg, #5bcf89 0%, #3dce7e 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  border: 1px solid rgba(91, 207, 137, 0.6);
  box-shadow: 0 4px 18px rgba(91, 207, 137, 0.35);
}

.profile-avatar.large img {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  object-fit: cover;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-name {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.2;
  text-shadow: 0 0 10px rgba(91, 207, 137, 0.4);
}

.profile-role {
  font-size: 14px;
  color: #a0ddb6;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.profile-role i {
  color: #5bcf89;
}

.btn-fullscreen {
  background: rgba(91, 207, 137, 0.15);
  border: 1px solid rgba(91, 207, 137, 0.4);
  color: #5bcf89;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 16px;
  flex-shrink: 0;
}

.btn-fullscreen:hover {
  background: rgba(91, 207, 137, 0.25);
  border-color: rgba(91, 207, 137, 0.6);
  box-shadow: 0 0 12px rgba(91, 207, 137, 0.3);
}

.btn-fullscreen:active {
  transform: scale(0.95);
}

/* Nav Tabs */
.panel-nav {
  display: flex;
  padding: 0 12px;
  border-bottom: 1px solid rgba(91, 207, 137, 0.15);
  background: rgba(8, 20, 14, 0.6);
}

.nav-tab {
  flex: 1;
  background: transparent;
  border: none;
  padding: 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: #6a9c7e;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.nav-tab:hover {
  color: #a0ddb6;
  background: rgba(91, 207, 137, 0.05);
}

.nav-tab.active {
  color: #ffffff;
  text-shadow: 0 0 8px rgba(91, 207, 137, 0.6);
}

.nav-tab.active i {
  color: #5bcf89;
}

.nav-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 15%;
  width: 70%;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: #5bcf89;
  box-shadow: 0 -2px 10px #5bcf89;
}

/* Content Area */
.panel-body {
  height: 280px;
  overflow-y: auto;
  padding: 24px;
  position: relative;
}

.styled-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.styled-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.styled-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(91, 207, 137, 0.4);
  border-radius: 5px;
}
.styled-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(91, 207, 137, 0.7);
}

/* View: Overview */
.info-card {
  background: rgba(16, 32, 22, 0.6);
  border-radius: 10px;
  padding: 16px;
  border: 1px solid rgba(91, 207, 137, 0.2);
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: inset 0 0 12px rgba(0,0,0,0.4);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}

.info-label {
  color: #8fbc9f;
}

.info-value {
  font-weight: 600;
  color: #ffffff;
}

.text-success { color: #5bcf89; text-shadow: 0 0 6px rgba(91,207,137,0.5); }
.active-dot { font-size: 10px; margin-right: 6px; vertical-align: middle; box-shadow: 0 0 8px #5bcf89; border-radius: 50%; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.stat-box {
  background: rgba(16, 32, 22, 0.6);
  border-radius: 10px;
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(91, 207, 137, 0.2);
  transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease;
  box-shadow: inset 0 0 12px rgba(0,0,0,0.3);
}

.stat-box:hover {
  transform: translateY(-3px);
  border-color: #5bcf89;
  background: rgba(22, 44, 30, 0.8);
  box-shadow: inset 0 0 12px rgba(0,0,0,0.3), 0 6px 16px rgba(91,207,137,0.15);
}

.stat-icon {
  font-size: 20px;
  color: #5bcf89;
  filter: drop-shadow(0 0 6px rgba(91, 207, 137, 0.5));
}

.stat-num {
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
}

.stat-name {
  font-size: 12px;
  color: #8fbc9f;
}

.account-extra-card {
  margin-top: 12px;
}

.break-text {
  max-width: 200px;
  text-align: right;
  word-break: break-word;
}

.compose-title {
  font-size: 15px;
  font-weight: 700;
  color: #b9f7d8;
  margin-bottom: 4px;
}

.user-message-input {
  width: 100%;
  min-height: 86px;
  box-sizing: border-box;
  border: 1px solid rgba(91, 207, 137, 0.3);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  resize: vertical;
  color: #fff;
  background: rgba(8, 20, 14, 0.6);
  transition: all 0.3s ease;
}

.user-message-input:focus {
  outline: none;
  border-color: #5bcf89;
  box-shadow: 0 0 10px rgba(91, 207, 137, 0.3);
  background: rgba(12, 28, 18, 0.9);
}

.message-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.message-empty {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  border: 1px dashed rgba(91, 207, 137, 0.3);
  border-radius: 8px;
  padding: 12px;
}

.message-item {
  border: 1px solid rgba(91, 207, 137, 0.25);
  border-radius: 8px;
  background: rgba(4, 12, 8, 0.4);
  padding: 10px 12px;
  transition: border-color 0.2s ease;
}

.message-item:hover {
  border-color: rgba(91, 207, 137, 0.4);
}

.message-item-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.message-author {
  color: #8df3b9;
  font-weight: 700;
}

.message-item-content {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: #f2fff8;
  word-break: break-word;
}

.admin-view {
  display: flex;
  flex-direction: column;
}

.api-mgmt-view {
  display: flex;
  flex-direction: column;
}

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
  border-left: 3px solid #5bcf89;
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
  border: 1px solid rgba(91, 207, 137, 0.3);
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
  border-color: #5bcf89;
  box-shadow: 0 0 10px rgba(91, 207, 137, 0.3), inset 0 0 6px rgba(91, 207, 137, 0.15);
  background: rgba(12, 28, 18, 0.9);
}

.btn-primary {
  background: linear-gradient(135deg, rgba(91, 207, 137, 0.85) 0%, #20874e 100%);
  color: white;
  border: 1px solid rgba(91, 207, 137, 0.6);
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
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(91, 207, 137, 0.35);
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
  color: #ef4444;
  text-shadow: 0 0 12px rgba(239, 68, 68, 0.6);
}

.guest-warning p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

/* View: Preferences */
.pref-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pref-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(16, 32, 22, 0.6);
  padding: 16px;
  border-radius: 10px;
  border: 1px solid rgba(91, 207, 137, 0.25);
  transition: border-color 0.3s ease;
}

.pref-item:hover {
  border-color: rgba(91, 207, 137, 0.4);
}

.pref-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pref-title {
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 10px;
}

.pref-title i {
  color: #5bcf89;
}

.pref-desc {
  font-size: 13px;
  color: #8fbc9f;
}

.modern-toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
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
  height: 18px; width: 18px;
  left: 4px; bottom: 3px;
  background-color: #6a9c7e;
  transition: .4s;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0,0,0,0.5);
}

input:checked + .slider { 
  background-color: rgba(91, 207, 137, 0.4); 
  border-color: #5bcf89;
}
input:checked + .slider:before { 
  transform: translateX(20px); 
  background-color: #5bcf89;
  box-shadow: 0 0 10px #5bcf89;
}

.coming-soon {
  text-align: center;
  margin-top: 30px;
  color: #4b6a57;
  font-size: 13px;
  font-style: italic;
  position: relative;
}

.coming-soon::before, .coming-soon::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 25%;
  height: 1px;
  background: rgba(91, 207, 137, 0.25);
}

.coming-soon::before { left: 0; }
.coming-soon::after { right: 0; }

/* Footer Action */
.panel-footer {
  padding: 16px 24px;
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
  background: linear-gradient(90deg, transparent, rgba(91,207,137,0.5), transparent);
}

.btn-logout {
  width: 100%;
  height: 48px;
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s ease;
}

.btn-logout:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
  color: #fef2f2;
  box-shadow: 0 0 14px rgba(239, 68, 68, 0.4);
  transform: translateY(-1px);
}

/* Transitions */
.account-panel-transition-enter-active,
.account-panel-transition-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.account-panel-transition-enter-from,
.account-panel-transition-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.96);
  filter: blur(8px);
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(-15px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(15px);
}

/* Light Mint Theme Override (aligned with TopBar) */
.floating-account-manager {
  --acc-mint-50: #f3fff7;
  --acc-mint-100: #e8f8ee;
  --acc-mint-200: #d6f2e1;
  --acc-mint-300: #c1e8d0;
  --acc-mint-500: #59b66a;
  --acc-mint-600: #4ca65c;
  --acc-mint-700: #3c8d4c;
  --acc-text-strong: #214a31;
  --acc-text-main: #2c5f3e;
  --acc-text-soft: #5d7f6a;
}

.account-fab {
  border-color: rgba(76, 175, 80, 0.35);
  background: linear-gradient(135deg, rgba(245, 255, 248, 0.96) 0%, rgba(231, 248, 238, 0.96) 100%);
  box-shadow: 0 12px 28px rgba(54, 124, 76, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  color: var(--acc-text-strong);
}

.account-fab:hover {
  background: linear-gradient(135deg, rgba(250, 255, 252, 0.98) 0%, rgba(238, 251, 244, 0.98) 100%);
  border-color: rgba(76, 175, 80, 0.55);
  box-shadow: 0 14px 34px rgba(54, 124, 76, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.account-fab::before {
  background: linear-gradient(90deg, transparent, rgba(76, 175, 80, 0.22), transparent);
}

.account-fab-text {
  color: var(--acc-text-main);
  text-shadow: none;
}

.fold-icon {
  color: var(--acc-mint-700);
}

.status-dot {
  border-color: var(--acc-mint-50);
  box-shadow: 0 0 0 2px rgba(91, 207, 137, 0.3);
}

.account-panel {
  width: 420px;
  border: 1px solid rgba(76, 175, 80, 0.28);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(246, 255, 250, 0.96) 0%, rgba(232, 248, 238, 0.97) 100%);
  box-shadow: 0 24px 48px rgba(49, 111, 69, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  clip-path: polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px);
}

.panel-header,
.panel-nav,
.panel-footer {
  background: transparent;
}

.panel-header {
  border-bottom-color: rgba(76, 175, 80, 0.2);
}

.panel-header::after,
.panel-footer::before {
  background: linear-gradient(90deg, transparent, rgba(76, 175, 80, 0.35), transparent);
}

.profile-name {
  color: var(--acc-text-strong);
  text-shadow: none;
}

.profile-role {
  color: var(--acc-text-main);
}

.profile-role i,
.pref-title i,
.stat-icon,
.nav-tab.active i {
  color: var(--acc-mint-700);
}

.panel-nav {
  border-bottom-color: rgba(76, 175, 80, 0.2);
  background: rgba(255, 255, 255, 0.42);
}

.nav-tab {
  color: var(--acc-text-soft);
}

.nav-tab:hover {
  color: var(--acc-text-main);
  background: rgba(91, 207, 137, 0.12);
}

.nav-tab.active {
  color: var(--acc-text-strong);
  text-shadow: none;
}

.nav-tab.active::after {
  background: linear-gradient(90deg, var(--acc-mint-500), var(--acc-mint-700));
  box-shadow: 0 -1px 6px rgba(76, 175, 80, 0.45);
}

.panel-body {
  height: 210px;
}

.styled-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(76, 175, 80, 0.42);
}

.info-card,
.stat-box,
.pref-item,
.message-item {
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(76, 175, 80, 0.2);
  box-shadow: 0 4px 12px rgba(76, 130, 88, 0.08);
}

.stat-box:hover,
.pref-item:hover,
.message-item:hover {
  background: rgba(252, 255, 253, 0.95);
  border-color: rgba(76, 175, 80, 0.35);
}

.info-label,
.stat-name,
.pref-desc,
.message-item-meta,
.coming-soon,
.message-empty {
  color: var(--acc-text-soft);
}

.info-value,
.stat-num,
.pref-title,
.message-item-content,
.message-author,
.compose-title {
  color: var(--acc-text-strong);
  text-shadow: none;
}

.text-success {
  color: var(--acc-mint-700);
  text-shadow: none;
}

.active-dot {
  color: var(--acc-mint-600);
  box-shadow: none;
}

.user-message-input,
.modern-input-group input {
  color: var(--acc-text-strong);
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(76, 175, 80, 0.3);
}

.user-message-input::placeholder,
.modern-input-group input::placeholder {
  color: #88a797;
}

.user-message-input:focus,
.modern-input-group input:focus {
  border-color: rgba(76, 175, 80, 0.52);
  box-shadow: 0 0 0 3px rgba(91, 207, 137, 0.18);
  background: #ffffff;
}

.input-icon {
  color: #6e9c80;
}

.btn-primary {
  background: linear-gradient(135deg, #6fca7a 0%, #4caf50 100%);
  border-color: rgba(63, 148, 75, 0.55);
  color: #f8fff9;
  box-shadow: 0 6px 16px rgba(58, 129, 76, 0.24);
  text-shadow: none;
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #7fd489 0%, #57b862 100%);
  box-shadow: 0 8px 18px rgba(58, 129, 76, 0.3);
}

.guest-warning {
  background: rgba(255, 244, 244, 0.86);
  border-color: rgba(239, 68, 68, 0.3);
  color: #9b3f3f;
}

.btn-logout {
  background: rgba(255, 236, 236, 0.86);
  border-color: rgba(230, 93, 93, 0.36);
  color: #a34040;
}

.btn-logout:hover:not(:disabled) {
  background: rgba(255, 226, 226, 0.96);
  border-color: rgba(218, 76, 76, 0.58);
  color: #8f2f2f;
  box-shadow: 0 8px 18px rgba(207, 94, 94, 0.2);
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .floating-account-manager {
    top: 500px;
    left: 100px;
  }
  .account-panel {
    width: min(95vw, 420px);
  }

  /* Fullscreen mode on mobile */
  .account-panel.is-fullscreen {
    border-radius: 0;
    border: none;
  }

  .account-panel.is-fullscreen .panel-header {
    padding: 12px 16px;
  }

  .account-panel.is-fullscreen .profile-avatar.large {
    width: 48px;
    height: 48px;
    font-size: 20px;
  }

  .account-panel.is-fullscreen .profile-name {
    font-size: 16px;
  }

  .account-panel.is-fullscreen .panel-nav {
    flex-direction: column;
  }

  .account-panel.is-fullscreen .nav-tab {
    flex: none;
    width: 100%;
    justify-content: flex-start;
  }

  .account-panel.is-fullscreen .panel-body {
    padding: 16px;
    max-height: none;
  }

  .btn-fullscreen {
    width: 36px;
    height: 36px;
    font-size: 14px;
  }
}

@media (max-width: 480px) {
  .account-panel.is-fullscreen .panel-header {
    flex-direction: column;
    gap: 8px;
  }

  .account-panel.is-fullscreen .profile-main {
    gap: 12px;
  }

  .account-panel.is-fullscreen .panel-nav {
    padding: 0;
  }

  .account-panel.is-fullscreen .nav-tab {
    border-radius: 0;
    padding: 12px 16px;
  }
}
</style>