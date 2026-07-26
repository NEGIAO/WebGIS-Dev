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
    apiAuthListOAuthAccounts,
    apiAuthUnlinkOAuthAccount,
    redirectToOAuthBindProvider,
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
const oauthAccounts = ref([]);
const oauthLoading = ref(false);

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

/** 速览条用的精简配额文案 */
const quotaShortText = computed(() => {
    const limit = quotaInfo.value?.limit;
    if (limit == null) return '配额不限';
    const remaining = Number(quotaInfo.value?.remaining ?? 0);
    return `配额余 ${remaining}`;
});

/** 头部手动刷新：统计 + 实时 + 留言一次拉齐 */
async function handleManualRefresh() {
    if (isLoadingCenter.value) return;
    await Promise.allSettled([
        loadCenterData({ silent: false }),
        refreshRealtimeData({ silent: true }),
        refreshMessages(),
    ]);
    message.success('账号中心数据已刷新');
}

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

async function loadOAuthAccounts({ silent = true } = {}) {
    oauthLoading.value = true;
    try {
        const result = await apiAuthListOAuthAccounts();
        oauthAccounts.value = Array.isArray(result?.accounts) ? result.accounts : [];
    } catch (error) {
        oauthAccounts.value = [];
        if (!silent) {
            message.warning(String(error?.message || '第三方账号绑定状态加载失败'));
        }
    } finally {
        oauthLoading.value = false;
    }
}

/**
 * 跳转到第三方账号绑定授权入口。
 * @param {'google'|'github'} provider - 第三方提供商
 */
async function handleBindOAuth(provider) {
    try {
        await redirectToOAuthBindProvider(provider);
    } catch (error) {
        message.error(String(error?.message || '第三方账号绑定入口生成失败'));
    }
}

async function handleUnlinkOAuth(provider) {
    if (isSubmitting.value) return;
    isSubmitting.value = true;
    try {
        await apiAuthUnlinkOAuthAccount(provider);
        message.success('第三方账号已解绑');
        await loadOAuthAccounts({ silent: false });
    } catch (error) {
        message.error(String(error?.message || '第三方账号解绑失败'));
    } finally {
        isSubmitting.value = false;
    }
}

function selectMenu(menu) {
    if (menu === 'admin' && !isAdmin.value) return;

    activeMenu.value = menu;
    if (menu === 'preferences') {
        void loadUserPreferences({ silent: true });
        void loadPreferenceModelOptions({ silent: true });
    }
    if (menu === 'security') {
        void loadOAuthAccounts({ silent: true });
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
    if (event.key !== 'Escape') return;
    // Esc 分级退出：先退全屏，再关面板
    if (isFullscreen.value) {
        setFullscreen(false);
        return;
    }
    if (isOpen.value) {
        closePanel();
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
                    <div class="header-btns">
                        <button
                            type="button"
                            class="btn-fullscreen"
                            title="刷新数据"
                            :disabled="isLoadingCenter"
                            @click="handleManualRefresh"
                        >
                            <i
                                class="fas fa-rotate"
                                :class="{ 'fa-spin': isLoadingCenter }"
                            ></i>
                        </button>
                        <button
                            type="button"
                            class="btn-fullscreen"
                            :title="isFullscreen ? '退出全屏' : '全屏展开'"
                            @click="toggleFullscreen"
                        >
                            <i :class="isFullscreen ? 'fas fa-compress-alt' : 'fas fa-expand-alt'"></i>
                        </button>
                    </div>
                </div>

                <!-- 速览条：不滚动即可看到最常查的信息 -->
                <div class="quick-strip">
                    <span class="quick-item">
                        <i class="fas fa-bolt"></i>{{ quotaShortText }}
                    </span>
                    <span class="quick-item">
                        <i class="fas fa-stopwatch"></i>在线 {{ sessionDurationText }}
                    </span>
                    <span class="quick-item">
                        <i class="fas fa-users"></i>{{ realtimeStats.online_users || 0 }} 人在线
                    </span>
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
                            :oauth-accounts="oauthAccounts"
                            :oauth-loading="oauthLoading"
                            @change-display-name="handleChangeDisplayName"
                            @change-password="handleChangePassword"
                            @bind-oauth="handleBindOAuth"
                            @unlink-oauth="handleUnlinkOAuth"
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
                            @update:selected-avatar-index="(idx) => { selectedAvatarIndex = idx }"
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
  账号中心（浅色单套设计，与注册页/对话面板同一视觉语言）
  结构：FAB 胶囊按钮 → 弹出面板（品牌渐变头部横幅 + 分页导航 + 自适应内容区 + 页脚）
*/

/* 供子面板（Admin/API 管理等）引用的语义变量 */
.floating-account-manager {
    --acc-mint-50: var(--bg-brand-light);
    --acc-mint-100: var(--bg-brand-light);
    --acc-mint-200: var(--bg-brand-lighter);
    --acc-mint-300: var(--bg-brand-lighter);
    --acc-mint-500: var(--brand-primary-light);
    --acc-mint-600: var(--brand-primary);
    --acc-mint-700: var(--brand-primary-dark);
    --acc-text-strong: var(--text-brand-dark);
    --acc-text-main: var(--text-brand);
    --acc-text-soft: var(--text-secondary);
}

.floating-account-manager.is-fullscreen {
    z-index: var(--z-modal-high);
}

.floating-account-manager.is-fullscreen .account-fab {
    display: none;
}

/* ========== FAB 胶囊按钮 ========== */
.account-fab {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 999px;
    background: var(--panel-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--text-brand-dark);
    height: auto;
    min-height: 44px;
    padding: 5px 16px 5px 6px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(var(--brand-primary-rgb), 0.18);
    transition: all 0.25s ease;
    position: relative;
}

.account-fab:hover {
    transform: translateY(-2px);
    border-color: rgba(var(--brand-primary-rgb), 0.55);
    box-shadow: 0 10px 26px rgba(var(--brand-primary-rgb), 0.26);
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
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    border: 2px solid rgba(var(--brand-primary-rgb), 0.35);
    overflow: hidden;
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
    width: 10px;
    height: 10px;
    background: var(--brand-primary);
    border: 2px solid #fff;
    border-radius: 50%;
}

.account-fab-text {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--text-brand-dark);
}

.fold-icon {
    font-size: 12px;
    color: var(--brand-primary-dark);
    opacity: 0.75;
    transition: transform 0.3s ease;
    margin-left: 2px;
}

.fold-icon.rotated {
    transform: rotate(180deg);
}

/* ========== 弹出面板 ========== */
.account-panel {
    width: min(430px, 96vw);
    border-radius: 16px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    background: #fff;
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.05),
        0 24px 56px -12px rgba(20, 45, 25, 0.28);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform-origin: bottom left;
    transition: all 0.3s ease;
}

/* ── 头部：品牌渐变横幅 ── */
.panel-header {
    position: relative;
    padding: 18px 20px;
    background: linear-gradient(140deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    overflow: hidden;
}

/* 经纬网格纹理（与注册页同 DNA） */
.panel-header::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
    background-size: 24px 24px;
    -webkit-mask-image: radial-gradient(ellipse 95% 120% at 50% 0%, #000 30%, transparent 100%);
    mask-image: radial-gradient(ellipse 95% 120% at 50% 0%, #000 30%, transparent 100%);
    pointer-events: none;
}

.panel-header > * {
    position: relative;
    z-index: 1;
}

.blur-bg {
    background: transparent;
}

.profile-main {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    min-width: 0;
}

.profile-avatar.large {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.16);
    border: 2px solid rgba(255, 255, 255, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    flex-shrink: 0;
    overflow: hidden;
}

.profile-avatar.large img {
    width: 100%;
    height: 100%;
    border-radius: 12px;
    object-fit: cover;
}

.profile-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.profile-name {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: #fff;
    line-height: 1.25;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.profile-email {
    max-width: 230px;
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.82);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.profile-role {
    align-self: flex-start;
    margin-top: 2px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 999px;
    padding: 1px 9px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.profile-role i {
    font-size: 10px;
    color: #fff;
    opacity: 0.9;
}

.header-btns {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
}

/* 渐变横幅上的操作钮：实底白 + 品牌色图标，保证对比度 */
.btn-fullscreen {
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.6);
    color: var(--brand-primary-dark);
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 13px;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}

.btn-fullscreen:hover:not(:disabled) {
    background: #fff;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
}

.btn-fullscreen:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* ── 速览条 ── */
.quick-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: linear-gradient(180deg, rgba(var(--brand-primary-rgb), 0.07), rgba(var(--brand-primary-rgb), 0.03));
    border-bottom: 1px solid var(--border-light);
}

.quick-item {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-brand-dark);
    background: #fff;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.18);
    border-radius: 999px;
    padding: 4px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.quick-item i {
    color: var(--brand-primary);
    font-size: 10px;
    flex-shrink: 0;
}

.btn-fullscreen:active {
    transform: scale(0.95);
}

/* ── 导航分页 ── */
.panel-nav {
    display: flex;
    padding: 0 10px;
    border-bottom: 1px solid var(--border-light);
    background: #fff;
}

.nav-tab {
    flex: 1;
    background: transparent;
    border: none;
    padding: 12px 0 11px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.2s ease, background 0.2s ease;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}

.nav-tab i {
    font-size: 12px;
}

.nav-tab:hover {
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.05);
}

.nav-tab.active {
    color: var(--brand-primary-dark);
}

.nav-tab.active i {
    color: var(--brand-primary);
}

.nav-tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 22%;
    width: 56%;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--brand-primary);
}

/* ── 内容区：自适应视口高度（原固定 210px 的实用性修复） ── */
.panel-body {
    min-height: 280px;
    max-height: min(58vh, 540px);
    overflow-y: auto;
    padding: 16px 18px;
    background: var(--bg-secondary);
    position: relative;
}

.styled-scrollbar::-webkit-scrollbar {
    width: 6px;
}
.styled-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.styled-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 5px;
}
.styled-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(var(--brand-primary-rgb), 0.55);
}

.admin-view,
.api-mgmt-view {
    display: flex;
    flex-direction: column;
}

/* ── 页脚 ── */
.panel-footer {
    padding: 12px 18px;
    border-top: 1px solid var(--border-light);
    background: #fff;
}

.btn-logout {
    width: 100%;
    height: 42px;
    border-radius: 10px;
    border: 1px solid rgba(var(--danger-rgb), 0.35);
    background: rgba(var(--danger-rgb), 0.05);
    color: var(--danger);
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
    background: rgba(var(--danger-rgb), 0.12);
    border-color: var(--danger);
    transform: translateY(-1px);
}

.btn-logout:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* ========== 全屏模式 ========== */
.account-panel.is-fullscreen {
    border-radius: 0;
    border: none;
    z-index: 1;
    transform-origin: center;
}

.account-panel.is-fullscreen .panel-header {
    padding: 16px 22px;
}

.account-panel.is-fullscreen .panel-nav {
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 14px;
}

.account-panel.is-fullscreen .nav-tab {
    flex: 0 1 calc(25% - 6px);
    padding: 11px 12px;
}

.account-panel.is-fullscreen .panel-body {
    min-height: 0;
    max-height: none;
    height: auto;
    flex: 1;
    overflow-y: auto;
    padding: 20px 22px;
}

.account-panel.is-fullscreen .panel-footer {
    position: sticky;
    bottom: 0;
    padding: 12px 22px;
}

/* ========== 过渡动画 ========== */
.account-panel-transition-enter-active,
.account-panel-transition-leave-active {
    transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.account-panel-transition-enter-from,
.account-panel-transition-leave-to {
    opacity: 0;
    transform: translateY(14px) scale(0.97);
}

.fade-slide-enter-active,
.fade-slide-leave-active {
    transition: opacity 0.22s ease, transform 0.22s ease;
}

.fade-slide-enter-from {
    opacity: 0;
    transform: translateX(-12px);
}

.fade-slide-leave-to {
    opacity: 0;
    transform: translateX(12px);
}

/* ========== 移动端适配 ========== */
@media (max-width: 768px) {
    .account-panel {
        width: min(96vw, 430px);
    }

    .panel-body {
        max-height: min(52vh, 480px);
    }

    .account-panel.is-fullscreen {
        border-radius: 0;
        border: none;
    }

    .account-panel.is-fullscreen .panel-header {
        padding: 12px 16px;
    }

    .account-panel.is-fullscreen .profile-avatar.large {
        width: 46px;
        height: 46px;
    }

    .account-panel.is-fullscreen .profile-name {
        font-size: 15px;
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
        width: 32px;
        height: 32px;
        font-size: 12px;
    }
}

@media (max-width: 480px) {
    .account-panel.is-fullscreen .panel-header {
        flex-direction: column;
        gap: 8px;
        align-items: flex-start;
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
