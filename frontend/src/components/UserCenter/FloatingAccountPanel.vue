<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from '../../composables/useMessage';
import {
    apiAuthChangePassword,
    apiAuthChangeAvatar,
    apiAuthChangeDisplayName,
    apiAuthLogout,
    apiAuthMe,
    apiAgentListModels,
    apiCreateUserMessage,
    apiListUserMessages,
    apiStatisticsCenter,
    apiStatisticsRealtime,
} from '../../api/backend';
import { clearAuthSession, getAuthToken, getAuthUser, setAuthSession, syncUserRoleToUrl } from '../../services/auth';
import { BASEMAP_OPTIONS } from '../../constants';
import { useUserPreferencesStore, useThemeStore } from '../../stores';
import { getUserDisplayName } from '../../composables/auth/useAuthIdentity';

const AdminControlPanel = defineAsyncComponent(() => import('./AdminControlPanel.vue'));
const ApiManagementPanel = defineAsyncComponent(() => import('./ApiManagementPanel.vue'));
const OverviewTab = defineAsyncComponent(() => import('./tabs/OverviewTab.vue'));
const SecurityTab = defineAsyncComponent(() => import('./tabs/SecurityTab.vue'));
const PreferencesTab = defineAsyncComponent(() => import('./tabs/PreferencesTab.vue'));

const router = useRouter();
const message = useMessage();
const userPreferencesStore = useUserPreferencesStore();
const themeStore = useThemeStore();
const props = defineProps({
    open: {
        type: Boolean,
        default: undefined,
    },
    showFab: {
        type: Boolean,
        default: true,
    },
});

const emit = defineEmits(['fullscreen-change', 'update:open']);

// Panel State
const isOpen = ref(false);
const isFullscreen = ref(false);
const activeMenu = ref('overview'); // 'overview', 'security', 'admin', 'api-management', 'preferences'
const isSubmitting = ref(false);
const isLoadingCenter = ref(false);
const isPostingMessage = ref(false);
const user = ref(getAuthUser());

const centerData = ref({
    quota: {
        limit: null,
        used: 0,
        remaining: null,
        usage_date: '',
    },
    self_stats: {
        registered_at: '',
        login_count: 0,
        total_login_seconds: 0,
        total_api_calls: 0,
        total_visit_count: 0,
        last_login_at: '',
        last_logout_at: '',
        current_session_seconds: 0,
    },
    realtime: {
        online_users: 0,
        total_visit_count: 0,
        total_api_calls: 0,
        total_registered_users: 0,
    },
    admin_contact: '管理员联系方式：admin@negiao.local',
    messages: [],
});

// Avatar Management
const selectedAvatarIndex = ref(0);
const avatarSaving = ref(false);

// Ref to SecurityTab component for form reset
const securityTabRef = ref(null);

const preferenceDraft = ref({
    default_basemap: '',
    language: 'zh-CN',
    unit_system: 'metric',
    preferred_agent_model: '',
});
const preferenceSaving = ref(false);
const preferenceModelOptions = ref([]);

const roleTextMap = Object.freeze({
    admin: '管理员',
    super_admin: '管理员',
    registered: '注册用户',
    guest: '游客',
});

const isAdmin = computed(() => String(user.value?.role || '') === 'admin');

function resolvePublicAssetPath(relativePath) {
    const base = String(import.meta.env.BASE_URL || '/').trim();
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const normalizedPath = String(relativePath || '').replace(/^\/+/, '');
    return `${normalizedBase}${normalizedPath}`;
}

const userAvatarIndex = computed(() => {
    const raw = Number(user.value?.avatar_index);
    if (Number.isInteger(raw) && raw >= 0 && raw <= 11) {
        return raw;
    }
    const role = String(user.value?.role || '').trim();
    if (role === 'admin') {
        return 1;
    }
    return 0;
});

const userAvatarSrc = computed(() => {
    return resolvePublicAssetPath(`avatars/avatar-${userAvatarIndex.value}.svg`);
});

const roleText = computed(() => {
    const role = String(user.value?.role || '').trim();
    return roleTextMap[role] || '未知角色';
});

const hasControlledOpen = computed(() => props.open !== undefined);

const panelLabel = computed(() => {
    const displayName = getUserDisplayName(user.value);
    return displayName ? `账号：${displayName}` : '账号中心';
});

const displayNameText = computed(() => getUserDisplayName(user.value));

const basemapPreferenceOptions = computed(() => {
    return Array.isArray(BASEMAP_OPTIONS) ? BASEMAP_OPTIONS : [];
});

const selfStats = computed(() => centerData.value?.self_stats || {});
const quotaInfo = computed(() => centerData.value?.quota || {});
const realtimeStats = computed(() => centerData.value?.realtime || {});
const adminContact = computed(() => String(centerData.value?.admin_contact || '').trim());
const recentMessages = computed(() => {
    const source = centerData.value?.messages;
    return Array.isArray(source) ? source : [];
});

const quotaText = computed(() => {
    const used = Number(quotaInfo.value?.used || 0);
    const limit = quotaInfo.value?.limit;
    if (limit == null) {
        return `已调用 ${used} 次 / 不限额`;
    }
    return `已调用 ${used}/${limit} 次`;
});

const sessionDurationText = computed(() => {
    const sec = Number(selfStats.value?.current_session_seconds || 0);
    return formatDuration(sec);
});

function formatDuration(totalSeconds) {
    const sec = Math.max(0, Number(totalSeconds || 0));
    const day = Math.floor(sec / 86400);
    const hour = Math.floor((sec % 86400) / 3600);
    const minute = Math.floor((sec % 3600) / 60);
    const second = sec % 60;

    if (day > 0) {
        return `${day}天 ${hour}小时 ${minute}分钟`;
    }
    if (hour > 0) {
        return `${hour}小时 ${minute}分钟 ${second}秒`;
    }
    if (minute > 0) {
        return `${minute}分钟 ${second}秒`;
    }
    return `${second}秒`;
}

function mergeUserPatch(nextUser = {}) {
    const source = nextUser && typeof nextUser === 'object' ? nextUser : {};
    const current = user.value || {};
    const hasAvatarIndex = Object.prototype.hasOwnProperty.call(source, 'avatar_index');
    const merged = {
        ...current,
        ...source,
    };

    if (!Object.prototype.hasOwnProperty.call(source, 'display_name')) {
        merged.display_name = current.display_name || source.username || '';
    }
    if (!Object.prototype.hasOwnProperty.call(source, 'email')) {
        merged.email = current.email || '';
    }
    if (!Object.prototype.hasOwnProperty.call(source, 'email_verified')) {
        merged.email_verified = current.email_verified || false;
    }
    if (!Object.prototype.hasOwnProperty.call(source, 'requires_email_binding')) {
        merged.requires_email_binding = current.requires_email_binding || false;
    }
    if (!hasAvatarIndex) {
        merged.avatar_index = current.avatar_index ?? selectedAvatarIndex.value;
    }

    user.value = merged;
    if (hasAvatarIndex) {
        selectedAvatarIndex.value = Number(merged.avatar_index ?? selectedAvatarIndex.value);
    }
    syncUserRoleToUrl(merged);
    const token = getAuthToken();
    if (token) {
        setAuthSession({ token, user: merged });
    }
    return merged;
}

async function syncCurrentUser() {
    try {
        const result = await apiAuthMe();
        if (!result?.user) return;

        mergeUserPatch(result.user);
    } catch {
        // handled by interceptor
    }
}

async function loadCenterData({ silent = false } = {}) {
    if (isLoadingCenter.value) return;

    isLoadingCenter.value = true;
    try {
        const result = await apiStatisticsCenter();

        if (result?.user) {
            mergeUserPatch(result.user);
        }

        centerData.value = {
            ...centerData.value,
            ...(result || {}),
        };
    } catch (error) {
        if (!silent) {
            message.warning(String(error?.message || '用户中心数据加载失败'));
        }
    } finally {
        isLoadingCenter.value = false;
    }
}

async function refreshRealtimeData({ silent = true } = {}) {
    try {
        const result = await apiStatisticsRealtime();
        if (result?.data) {
            centerData.value = {
                ...centerData.value,
                realtime: {
                    ...centerData.value.realtime,
                    ...result.data,
                },
            };
        }
    } catch (error) {
        if (!silent) {
            message.warning(String(error?.message || '实时统计刷新失败'));
        }
    }
}

async function refreshMessages() {
    try {
        const result = await apiListUserMessages();
        const list = Array.isArray(result?.data) ? result.data : [];
        centerData.value = {
            ...centerData.value,
            messages: list,
        };
    } catch {
        // keep latest messages in panel
    }
}

function closePanel() {
    setOpen(false);
    setFullscreen(false);
    setTimeout(() => {
        activeMenu.value = 'overview';
        resetPasswordForm();
    }, 200);
}

function setOpen(nextValue) {
    const normalized = Boolean(nextValue);
    if (isOpen.value === normalized) return;
    isOpen.value = normalized;
    emit('update:open', normalized);
}

function setFullscreen(nextValue) {
    const normalized = Boolean(nextValue);
    if (isFullscreen.value === normalized) return;
    isFullscreen.value = normalized;
    emit('fullscreen-change', normalized);
}

function toggleFullscreen() {
    setFullscreen(!isFullscreen.value);
}

function togglePanel() {
    const nextOpen = !isOpen.value;
    setOpen(nextOpen);

    if (nextOpen) {
        loadCenterData({ silent: true });
    }

    if (!nextOpen) {
        setFullscreen(false);
        setTimeout(() => {
            activeMenu.value = 'overview';
            resetPasswordForm();
        }, 200);
    }
}

watch(
    () => props.open,
    (nextValue) => {
        if (!hasControlledOpen.value) return;
        const normalized = Boolean(nextValue);
        if (isOpen.value !== normalized) {
            isOpen.value = normalized;
            if (normalized) {
                loadCenterData({ silent: true });
            } else {
                setFullscreen(false);
                setTimeout(() => {
                    activeMenu.value = 'overview';
                    resetPasswordForm();
                }, 200);
            }
        }
    },
    { immediate: true },
);

function selectMenu(menu) {
    if (menu === 'admin' && !isAdmin.value) return;

    activeMenu.value = menu;
    if (menu === 'preferences') {
        void loadUserPreferences({ silent: true });
        void loadPreferenceModelOptions({ silent: true });
    }
    if (menu !== 'security') {
        resetPasswordForm();
    }
}

function normalizePreferences(raw = {}) {
    const languageRaw = String(raw?.language || '')
        .trim()
        .toLowerCase()
        .replace('_', '-');
    const language = languageRaw === 'en-us' ? 'en-US' : 'zh-CN';
    const unitRaw = String(raw?.unit_system || '')
        .trim()
        .toLowerCase();
    const unitSystem = unitRaw === 'imperial' ? 'imperial' : 'metric';

    return {
        default_basemap: String(raw?.default_basemap || '').trim(),
        language,
        unit_system: unitSystem,
        preferred_agent_model: String(raw?.preferred_agent_model || '').trim(),
    };
}

function syncPreferenceDraftFromStore() {
    preferenceDraft.value = normalizePreferences(userPreferencesStore.preferences);
}

async function loadUserPreferences({ silent = true } = {}) {
    try {
        await userPreferencesStore.loadPreferences({ force: true, silent });
        syncPreferenceDraftFromStore();
    } catch (error) {
        if (!silent) {
            message.error(String(error?.message || '偏好设置加载失败'));
        }
    }
}

async function loadPreferenceModelOptions({ silent = true } = {}) {
    try {
        const result = await apiAgentListModels();
        const data = result?.data || result || {};
        const models = Array.isArray(data?.models) ? data.models : [];
        preferenceModelOptions.value = models
            .filter((item) => item?.chat_compatible !== false)
            .map((item) => String(item?.id || '').trim())
            .filter(Boolean)
            .filter((item, index, array) => array.indexOf(item) === index);
    } catch (error) {
        preferenceModelOptions.value = [];
        if (!silent) {
            message.warning(String(error?.message || '模型列表加载失败'));
        }
    }
}

async function handleSavePreferences() {
    if (preferenceSaving.value) return;
    preferenceSaving.value = true;

    try {
        const saved = await userPreferencesStore.savePreferences(
            normalizePreferences(preferenceDraft.value),
        );
        preferenceDraft.value = normalizePreferences(saved);
        message.success('偏好设置已保存');
    } catch (error) {
        message.error(String(error?.message || '偏好设置保存失败'));
    } finally {
        preferenceSaving.value = false;
    }
}

function resetPasswordForm() {
    securityTabRef.value?.resetForm();
}

function handleDocumentClick(event) {
    if (!isOpen.value) return;
    const root = event.target?.closest?.('.floating-account-manager');
    if (!root) {
        closePanel();
    }
}

function handleDocumentKeydown(event) {
    if (event.key === 'Escape' && isFullscreen.value) {
        setFullscreen(false);
    }
}

async function forceBackToLogin(hintText = '') {
    clearAuthSession();
    closePanel();

    if (hintText) {
        message.success(hintText);
    }

    await router.replace('/register');
}

async function handleLogout() {
    if (isSubmitting.value) return;
    isSubmitting.value = true;

    try {
        await apiAuthLogout();
    } catch { /* ignored */ } finally {
        isSubmitting.value = false;
    }

    await forceBackToLogin('已退出登录');
}

async function handleChangePassword(payload) {
    if (isSubmitting.value) return;

    // Handle validation errors emitted from SecurityTab
    if (payload?.error) {
        message.error(payload.error);
        return;
    }

    const { oldPassword, newPassword } = payload || {};
    if (!oldPassword || !newPassword) {
        message.error('请完整填写密码信息');
        return;
    }

    isSubmitting.value = true;

    try {
        await apiAuthChangePassword(oldPassword, newPassword);
        resetPasswordForm();
        await forceBackToLogin('密码已修改，请重新登录');
    } catch (error) {
        const detail = String(error?.message || '').trim();
        message.error(detail || '密码修改失败，请稍后重试');
    } finally {
        isSubmitting.value = false;
    }
}

async function handleChangeDisplayName(payload) {
    if (isSubmitting.value) return;

    if (payload?.error) {
        message.error(payload.error);
        return;
    }

    const displayName = String(payload?.displayName || '').trim();
    if (!displayName) {
        message.error('请填写昵称');
        return;
    }

    isSubmitting.value = true;
    try {
        const result = await apiAuthChangeDisplayName(displayName);
        if (result?.user) {
            mergeUserPatch(result.user);
        }
        message.success('昵称已更新');
    } catch (error) {
        const detail = String(error?.message || '').trim();
        message.error(detail || '昵称更新失败，请稍后重试');
    } finally {
        isSubmitting.value = false;
    }
}

async function handleSaveAvatar() {
    if (avatarSaving.value) return;

    avatarSaving.value = true;
    try {
        const result = await apiAuthChangeAvatar(selectedAvatarIndex.value);
        if (result?.status === 'success') {
            message.success('头像已更新');
            mergeUserPatch(result?.user || {
                avatar_index: Number(result?.avatar_index ?? selectedAvatarIndex.value),
            });
        } else {
            message.error('头像更新失败，请稍后重试');
        }
    } catch (error) {
        const detail = String(error?.message || '').trim();
        message.error(detail || '头像更新失败，请稍后重试');
    } finally {
        avatarSaving.value = false;
    }
}

async function handleSubmitUserMessage(content) {
    if (isPostingMessage.value) return;

    if (!content) {
        message.warning('留言内容不能为空');
        return;
    }

    isPostingMessage.value = true;
    try {
        await apiCreateUserMessage(content);
        message.success('留言已发布');
        await refreshMessages();
        await refreshRealtimeData({ silent: true });
    } catch (error) {
        message.error(String(error?.message || '留言发布失败'));
    } finally {
        isPostingMessage.value = false;
    }
}

let centerTimer = null;

onMounted(() => {
    syncCurrentUser();
    void loadUserPreferences({ silent: true });
    void loadPreferenceModelOptions({ silent: true });
    // 初始化头像选择为当前用户的头像
    selectedAvatarIndex.value = userAvatarIndex.value;
    loadCenterData({ silent: true });
    refreshRealtimeData({ silent: true });
    refreshMessages();

    if (typeof window !== 'undefined') {
        centerTimer = window.setInterval(() => {
            loadCenterData({ silent: true });
            refreshRealtimeData({ silent: true });
        }, 30000);
    }

    document.addEventListener('pointerdown', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);
});

onBeforeUnmount(() => {
    setFullscreen(false);

    if (centerTimer && typeof window !== 'undefined') {
        window.clearInterval(centerTimer);
        centerTimer = null;
    }

    document.removeEventListener('pointerdown', handleDocumentClick);
    document.removeEventListener('keydown', handleDocumentKeydown);
});
</script>

<template>
    <div
        class="floating-account-manager"
        :class="{ 'is-open': isOpen, 'is-fullscreen': isFullscreen }"
    >
        <button
            v-if="showFab"
            class="account-fab"
            type="button"
            :aria-label="panelLabel"
            @click.stop="togglePanel"
        >
            <div class="fab-content">
                <div class="account-avatar-wrapper">
                    <span class="account-avatar">
                        <img
                            :src="userAvatarSrc"
                            :alt="`${displayNameText || '用户'}头像`"
                            loading="lazy"
                        />
                    </span>
                    <span class="status-dot"></span>
                </div>
                <span class="account-fab-text">{{ displayNameText || '用户' }}</span>
                <i
                    class="fas fa-chevron-up fold-icon"
                    :class="{ rotated: !isOpen }"
                ></i>
            </div>
        </button>

        <transition name="account-panel-transition">
            <div
                v-if="isOpen"
                class="account-panel"
                :class="{ 'is-fullscreen': isFullscreen }"
                @pointerdown.stop
            >
                <!-- Header Profile Summary -->
                <div class="panel-header blur-bg">
                    <div class="profile-main">
                        <div class="profile-avatar large blur-bg">
                            <img
                                :src="userAvatarSrc"
                                :alt="`${displayNameText || '用户'}头像`"
                                loading="lazy"
                            />
                        </div>
                        <div class="profile-info">
                            <h3 class="profile-name">{{ displayNameText || 'unknown' }}</h3>
                            <span
                                v-if="user?.email"
                                class="profile-email"
                            >
                                {{ user.email }}
                            </span>
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
                    <transition
                        name="fade-slide"
                        mode="out-in"
                    >
                        <!-- View 1: Overview -->
                        <OverviewTab
                            v-if="activeMenu === 'overview'"
                            key="overview"
                            :self-stats="selfStats"
                            :quota-info="quotaInfo"
                            :realtime-stats="realtimeStats"
                            :admin-contact="adminContact"
                            :recent-messages="recentMessages"
                            :quota-text="quotaText"
                            :session-duration-text="sessionDurationText"
                            :is-posting-message="isPostingMessage"
                            @submit-message="handleSubmitUserMessage"
                        />

                        <!-- View 2: Security -->
                        <SecurityTab
                            v-else-if="activeMenu === 'security'"
                            key="security"
                            ref="securityTabRef"
                            :user="user"
                            :is-submitting="isSubmitting"
                            @change-display-name="handleChangeDisplayName"
                            @change-password="handleChangePassword"
                        />

                        <!-- View 3: Admin -->
                        <div
                            v-else-if="activeMenu === 'admin' && isAdmin"
                            key="admin"
                            class="view-content admin-view"
                        >
                            <AdminControlPanel />
                        </div>

                        <!-- View 4: API Management -->
                        <div
                            v-else-if="activeMenu === 'api-management' && isAdmin"
                            key="api-management"
                            class="view-content api-mgmt-view"
                        >
                            <ApiManagementPanel />
                        </div>

                        <!-- View 5: Preferences -->
                        <PreferencesTab
                            v-else-if="activeMenu === 'preferences'"
                            key="preferences"
                            :preference-draft="preferenceDraft"
                            :preference-saving="preferenceSaving"
                            :preference-model-options="preferenceModelOptions"
                            :basemap-preference-options="basemapPreferenceOptions"
                            :selected-avatar-index="selectedAvatarIndex"
                            :avatar-saving="avatarSaving"
                            :user="user"
                            :current-theme="themeStore.theme"
                            @update:preference-draft="({ key, value }) => { preferenceDraft[key] = value }"
                            @save-preferences="handleSavePreferences"
                            @update:selected-avatar-index="(idx) => { selectedAvatarIndex.value = idx }"
                            @save-avatar="handleSaveAvatar"
                            @set-theme="(t) => themeStore.setTheme(t)"
                        />
                    </transition>
                </div>

                <!-- Footer Actions -->
                <div class="panel-footer blur-bg">
                    <button
                        class="btn-logout"
                        type="button"
                        :disabled="isSubmitting"
                        title="安全退出"
                        @click="handleLogout"
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

/* .floating-account-manager {
  position: fixed;
  top: 200px;
  left: 250px;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 16px;
} */

.floating-account-manager.is-fullscreen {
    z-index: 3000;
}

.floating-account-manager.is-fullscreen .account-fab {
    display: none;
}

/* Float FAB */
.account-fab {
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.4);
    border-radius: 40px;
    background: rgba(10, 24, 15, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    color: #fff;

    /* 👇 抛弃固定高度，用自适应单位 */
    height: auto;
    min-height: 44px; /* 移动端最小可点击高度 */
    max-height: 56px; /* 大屏不超出原来的设计 */

    /* 👇 内边距也自适应 */
    padding: 6px 20px 6px 8px;
    display: inline-flex;
    align-items: center;
    gap: 8px; /* 图标和文字的间距 */

    cursor: pointer;
    box-shadow:
        0 10px 40px rgba(0, 0, 0, 0.5),
        0 0 16px rgba(var(--brand-accent-light-rgb), 0.25);
    transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
    position: relative;
    overflow: hidden;
}

.account-fab::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 50%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(var(--brand-accent-light-rgb), 0.3), transparent);
    transition: left 0.6s ease;
}

.account-fab:hover {
    transform: translateY(-3px);
    background: rgba(10, 24, 15, 0.95);
    box-shadow:
        0 14px 44px rgba(0, 0, 0, 0.6),
        0 0 20px rgba(var(--brand-accent-light-rgb), 0.5);
    border-color: rgba(var(--brand-accent-light-rgb), 0.9);
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
    background: linear-gradient(135deg, var(--brand-accent-light) 0%, var(--brand-primary-dark) 100%);
    color: #fff;
    box-shadow: inset 0 -3px 6px rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(var(--brand-accent-light-rgb), 0.7);
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
    background: var(--brand-accent-light);
    border: 2px solid #0a180f;
    border-radius: 50%;
    box-shadow: 0 0 8px var(--brand-accent-light);
}

.account-fab-text {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.5px;
    white-space: nowrap;
    color: #ffffff;
    text-shadow: 0 0 10px rgba(var(--brand-accent-light-rgb), 0.5);
}

.fold-icon {
    font-size: 14px;
    color: var(--brand-accent-light);
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
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.3);
    background: linear-gradient(to bottom, rgba(12, 28, 18, 0.9), rgba(6, 18, 10, 0.96));
    box-shadow:
        0 30px 60px rgba(0, 0, 0, 0.7),
        inset 0 0 24px rgba(var(--brand-accent-light-rgb), 0.15);
    backdrop-filter: blur(24px) saturate(140%);
    -webkit-backdrop-filter: blur(24px);
    display: flex;
    flex-direction: column;
    transform-origin: bottom left;
    clip-path: polygon(
        20px 0,
        100% 0,
        100% calc(100% - 20px),
        calc(100% - 20px) 100%,
        0 100%,
        0 20px
    );
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

.blur-bg {
    background: transparent;
}

/* Header */
.panel-header {
    padding: 24px;
    border-bottom: 1px solid rgba(var(--brand-accent-light-rgb), 0.2);
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
    background: linear-gradient(90deg, transparent, rgba(var(--brand-accent-light-rgb), 0.5), transparent);
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
    /* background: linear-gradient(135deg, #5bcf89 0%, #3dce7e 100%); */
    /* background:transparent; */
    background: rgba(var(--brand-accent-light-rgb), 0.05);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    /* color: #fff; */
    font-weight: bold;
    /* border: 1px solid rgba(var(--brand-accent-light-rgb), 0.6); */
    box-shadow: 0 4px 18px rgba(var(--brand-accent-light-rgb), 0.35);
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
    text-shadow: 0 0 10px rgba(var(--brand-accent-light-rgb), 0.4);
}

.profile-email {
    max-width: 220px;
    overflow-wrap: anywhere;
    font-size: 12px;
    color: #7da48b;
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
    color: var(--brand-accent-light);
}

.btn-fullscreen {
    background: rgba(var(--brand-accent-light-rgb), 0.15);
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.4);
    color: var(--brand-accent-light);
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
    background: rgba(var(--brand-accent-light-rgb), 0.25);
    border-color: rgba(var(--brand-accent-light-rgb), 0.6);
    box-shadow: 0 0 12px rgba(var(--brand-accent-light-rgb), 0.3);
}

.btn-fullscreen:active {
    transform: scale(0.95);
}

/* Nav Tabs */
.panel-nav {
    display: flex;
    padding: 0 12px;
    border-bottom: 1px solid rgba(var(--brand-accent-light-rgb), 0.15);
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
    background: rgba(var(--brand-accent-light-rgb), 0.05);
}

.nav-tab.active {
    color: #ffffff;
    text-shadow: 0 0 8px rgba(var(--brand-accent-light-rgb), 0.6);
}

.nav-tab.active i {
    color: var(--brand-accent-light);
}

.nav-tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 15%;
    width: 70%;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--brand-accent-light);
    box-shadow: 0 -2px 10px var(--brand-accent-light);
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
    background-color: rgba(var(--brand-accent-light-rgb), 0.4);
    border-radius: 5px;
}
.styled-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(var(--brand-accent-light-rgb), 0.7);
}

/* Admin & API Management views */
.admin-view {
    display: flex;
    flex-direction: column;
}

.api-mgmt-view {
    display: flex;
    flex-direction: column;
}

/* Footer Action */
.panel-footer {
    padding: 16px 24px;
    border-top: 1px solid rgba(var(--brand-accent-light-rgb), 0.2);
    position: relative;
}

.panel-footer::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 0;
    width: 100%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(var(--brand-accent-light-rgb), 0.5), transparent);
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
    border-color: var(--danger);
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
    transition:
        opacity 0.3s ease,
        transform 0.3s ease;
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
    --acc-mint-50: var(--bg-brand-light);
    --acc-mint-100: var(--bg-brand-light);
    --acc-mint-200: var(--bg-brand-lighter);
    --acc-mint-300: var(--bg-brand-lighter);
    --acc-mint-500: var(--brand-primary-light);
    --acc-mint-600: var(--brand-primary);
    --acc-mint-700: var(--brand-primary-dark);
    --acc-text-strong: #214a31;
    --acc-text-main: #2c5f3e;
    --acc-text-soft: #5d7f6a;
}

.account-fab {
    border-color: rgba(var(--brand-primary-rgb), 0.35);
    background: linear-gradient(
        135deg,
        rgba(245, 255, 248, 0.96) 0%,
        rgba(231, 248, 238, 0.96) 100%
    );
    box-shadow:
        0 12px 28px rgba(54, 124, 76, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
    color: var(--acc-text-strong);
}

.account-fab:hover {
    background: linear-gradient(
        135deg,
        rgba(250, 255, 252, 0.98) 0%,
        rgba(238, 251, 244, 0.98) 100%
    );
    border-color: rgba(var(--brand-primary-rgb), 0.55);
    box-shadow:
        0 14px 34px rgba(54, 124, 76, 0.26),
        inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.account-fab::before {
    background: linear-gradient(90deg, transparent, rgba(var(--brand-primary-rgb), 0.22), transparent);
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
    box-shadow: 0 0 0 2px rgba(var(--brand-accent-light-rgb), 0.3);
}

.account-panel {
    width: min(420px, 96vw);
    /* 安全兜底：防止在窄屏设备上溢出 */
    border: 1px solid rgba(var(--brand-primary-rgb), 0.28);
    border-radius: 14px;
    background: linear-gradient(
        180deg,
        rgba(246, 255, 250, 0.96) 0%,
        rgba(232, 248, 238, 0.97) 100%
    );
    box-shadow:
        0 24px 48px rgba(49, 111, 69, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
    clip-path: polygon(
        18px 0,
        100% 0,
        100% calc(100% - 18px),
        calc(100% - 18px) 100%,
        0 100%,
        0 18px
    );
}

.panel-header,
.panel-nav,
.panel-footer {
    background: transparent;
}

.panel-header {
    border-bottom-color: rgba(var(--brand-primary-rgb), 0.2);
}

.panel-header::after,
.panel-footer::before {
    background: linear-gradient(90deg, transparent, rgba(var(--brand-primary-rgb), 0.35), transparent);
}

.profile-name {
    color: var(--acc-text-strong);
    text-shadow: none;
}

.profile-role {
    color: var(--acc-text-main);
}

.profile-role i,
.nav-tab.active i {
    color: var(--acc-mint-700);
}

.panel-nav {
    border-bottom-color: rgba(var(--brand-primary-rgb), 0.2);
    background: rgba(255, 255, 255, 0.42);
}

.nav-tab {
    color: var(--acc-text-soft);
}

.nav-tab:hover {
    color: var(--acc-text-main);
    background: rgba(var(--brand-accent-light-rgb), 0.12);
}

.nav-tab.active {
    color: var(--acc-text-strong);
    text-shadow: none;
}

.nav-tab.active::after {
    background: linear-gradient(90deg, var(--acc-mint-500), var(--acc-mint-700));
    box-shadow: 0 -1px 6px rgba(var(--brand-primary-rgb), 0.45);
}

.panel-body {
    height: 210px;
}

.styled-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(var(--brand-primary-rgb), 0.42);
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
        width: min(96vw, 420px);
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
