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
import { useUserPreferencesStore, useThemeStore, isBasemapPreferenceSelectable } from '../../stores';
import { getUserDisplayName } from '../../composables/auth/useAuthIdentity';
import { setLocaleLanguage, useLocale } from '../../composables/useLocale';

const AdminControlPanel = defineAsyncComponent(() => import('./AdminControlPanel.vue'));
const ApiManagementPanel = defineAsyncComponent(() => import('./ApiManagementPanel.vue'));
const OverviewTab = defineAsyncComponent(() => import('./tabs/OverviewTab.vue'));
const SecurityTab = defineAsyncComponent(() => import('./tabs/SecurityTab.vue'));
const PreferencesTab = defineAsyncComponent(() => import('./tabs/PreferencesTab.vue'));

const router = useRouter();
const message = useMessage();
const userPreferencesStore = useUserPreferencesStore();
const themeStore = useThemeStore();
const { t } = useLocale();
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
const hasLoadedCenterOnce = ref(false); // 首次统计加载完成标记（骨架屏只在首载显示，30s 轮询不触发）
const isPostingMessage = ref(false);
const user = ref(getAuthUser());
const oauthAccounts = ref([]);
const oauthLoading = ref(false);

// 切页缓存标记（V3.4.62 A10）：面板单次打开期间各数据源只拉一次，
// 关闭面板时失效，下次打开首个进入重新拉取；变更操作自带刷新不受影响
const prefsLoadedOnce = ref(false);
const modelsLoadedOnce = ref(false);
const oauthLoadedOnce = ref(false);

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
    admin_contact: 'admin@negiao.local',
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

const presetAvatarSrc = computed(() => {
    return resolvePublicAssetPath(`avatars/avatar-${userAvatarIndex.value}.svg`);
});

// 第三方（Google/GitHub）头像加载失败标记：失败后回退预设头像
const oauthAvatarFailed = ref(false);

const oauthAvatarUrl = computed(() => {
    const url = String(user.value?.avatar_url || '').trim();
    return /^https?:\/\//i.test(url) ? url : '';
});

const userAvatarSrc = computed(() => {
    if (oauthAvatarUrl.value && !oauthAvatarFailed.value) {
        return oauthAvatarUrl.value;
    }
    return presetAvatarSrc.value;
});

watch(oauthAvatarUrl, () => {
    oauthAvatarFailed.value = false;
});

function handleAvatarImgError() {
    if (oauthAvatarUrl.value && !oauthAvatarFailed.value) {
        oauthAvatarFailed.value = true;
    }
}

const roleText = computed(() => {
    const role = String(user.value?.role || '').trim();
    const knownRole = ['admin', 'super_admin', 'registered', 'guest'].includes(role)
        ? role
        : 'unknown';
    return t(`account.roles.${knownRole}`);
});

const hasControlledOpen = computed(() => props.open !== undefined);

const panelLabel = computed(() => {
    const displayName = getUserDisplayName(user.value);
    return displayName ? t('account.accountOf', { name: displayName }) : t('account.title');
});

const displayNameText = computed(() => getUserDisplayName(user.value));

const basemapPreferenceOptions = computed(() => {
    // 过滤无法作为偏好还原的特殊 preset（custom 需配套 URL、local_tiles_preset 依赖本地环境）
    const options = Array.isArray(BASEMAP_OPTIONS) ? BASEMAP_OPTIONS : [];
    return options.filter((option) => isBasemapPreferenceSelectable(option?.value));
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
        return t('account.quotaUnlimited', { used });
    }
    return t('account.quotaLimited', { used, limit });
});

/** 速览条用的精简配额文案 */
const quotaShortText = computed(() => {
    const limit = quotaInfo.value?.limit;
    if (limit == null) return t('account.quotaShortUnlimited');
    const remaining = Number(quotaInfo.value?.remaining ?? 0);
    return t('account.quotaShortRemaining', { remaining });
});

/** 头部手动刷新：统计 + 实时 + 留言一次拉齐 */
async function handleManualRefresh() {
    if (isLoadingCenter.value) return;
    await Promise.allSettled([
        loadCenterData({ silent: false }),
        refreshRealtimeData({ silent: true }),
        refreshMessages(),
    ]);
    message.success(t('account.messages.refreshed'));
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
        return t('account.duration.day', { day, hour, minute });
    }
    if (hour > 0) {
        return t('account.duration.hour', { hour, minute, second });
    }
    if (minute > 0) {
        return t('account.duration.minute', { minute, second });
    }
    return t('account.duration.second', { second });
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
        hasLoadedCenterOnce.value = true;
    } catch (error) {
        if (!silent) {
            message.warning(String(error?.message || t('account.messages.centerLoadFailed')));
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
            message.warning(String(error?.message || t('account.messages.realtimeLoadFailed')));
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

/** 面板关闭后的统一收尾：回总览、清密码表单、失效切页缓存 */
function afterPanelClose() {
    activeMenu.value = 'overview';
    resetPasswordForm();
    prefsLoadedOnce.value = false;
    modelsLoadedOnce.value = false;
    oauthLoadedOnce.value = false;
}

function closePanel() {
    setOpen(false);
    setFullscreen(false);
    setTimeout(afterPanelClose, 200);
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
        setTimeout(afterPanelClose, 200);
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
                setTimeout(afterPanelClose, 200);
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
            message.warning(String(error?.message || t('account.messages.oauthLoadFailed')));
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
        message.error(String(error?.message || t('account.messages.oauthEntryFailed')));
    }
}

async function handleUnlinkOAuth(provider) {
    if (isSubmitting.value) return;
    isSubmitting.value = true;
    try {
        await apiAuthUnlinkOAuthAccount(provider);
        message.success(t('account.messages.oauthUnlinked'));
        await loadOAuthAccounts({ silent: false });
    } catch (error) {
        message.error(String(error?.message || t('account.messages.oauthUnlinkFailed')));
    } finally {
        isSubmitting.value = false;
    }
}

function selectMenu(menu) {
    if (menu === 'admin' && !isAdmin.value) return;

    activeMenu.value = menu;
    // 切页缓存（V3.4.62 A10）：本次打开期间首次进入才拉取；
    // 绑定/解绑等变更操作自身会刷新对应数据，不受缓存影响
    if (menu === 'preferences') {
        if (!prefsLoadedOnce.value) {
            prefsLoadedOnce.value = true;
            void loadUserPreferences({ silent: true });
        }
        if (!modelsLoadedOnce.value) {
            modelsLoadedOnce.value = true;
            void loadPreferenceModelOptions({ silent: true });
        }
    }
    if (menu === 'security' && !oauthLoadedOnce.value) {
        oauthLoadedOnce.value = true;
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

watch(
    () => preferenceDraft.value.language,
    (language) => {
        setLocaleLanguage(language);
    },
);

async function loadUserPreferences({ silent = true } = {}) {
    try {
        await userPreferencesStore.loadPreferences({ force: true, silent });
        syncPreferenceDraftFromStore();
    } catch (error) {
        if (!silent) {
            message.error(String(error?.message || t('account.messages.prefsLoadFailed')));
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
            message.warning(String(error?.message || t('account.messages.modelsLoadFailed')));
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
        message.success(t('account.messages.prefsSaved'));
    } catch (error) {
        message.error(String(error?.message || t('account.messages.prefsSaveFailed')));
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

    await forceBackToLogin(t('account.messages.loggedOut'));
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
        message.error(t('account.messages.passwordRequired'));
        return;
    }

    isSubmitting.value = true;

    try {
        await apiAuthChangePassword(oldPassword, newPassword);
        resetPasswordForm();
        await forceBackToLogin(t('account.messages.passwordChanged'));
    } catch (error) {
        const detail = String(error?.message || '').trim();
        message.error(detail || t('account.messages.passwordChangeFailed'));
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
        message.error(t('account.messages.displayNameRequired'));
        return;
    }

    isSubmitting.value = true;
    try {
        const result = await apiAuthChangeDisplayName(displayName);
        if (result?.user) {
            mergeUserPatch(result.user);
        }
        message.success(t('account.messages.displayNameUpdated'));
    } catch (error) {
        const detail = String(error?.message || '').trim();
        message.error(detail || t('account.messages.displayNameUpdateFailed'));
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
            message.success(t('account.messages.avatarUpdated'));
            mergeUserPatch(result?.user || {
                avatar_index: Number(result?.avatar_index ?? selectedAvatarIndex.value),
            });
        } else {
            message.error(t('account.messages.avatarUpdateFailed'));
        }
    } catch (error) {
        const detail = String(error?.message || '').trim();
        message.error(detail || t('account.messages.avatarUpdateFailed'));
    } finally {
        avatarSaving.value = false;
    }
}

async function handleSubmitUserMessage(content, onSuccess) {
    if (isPostingMessage.value) return;

    if (!content) {
        message.warning(t('account.messages.messageRequired'));
        return;
    }

    isPostingMessage.value = true;
    try {
        await apiCreateUserMessage(content);
        // 成功才回调清空输入框：发布失败时保留用户草稿（V3.4.62 A1）
        onSuccess?.();
        message.success(t('account.messages.messagePosted'));
        await refreshMessages();
        await refreshRealtimeData({ silent: true });
    } catch (error) {
        message.error(String(error?.message || t('account.messages.messagePostFailed')));
    } finally {
        isPostingMessage.value = false;
    }
}

let centerTimer = null;

onMounted(() => {
    syncCurrentUser();
    // 挂载预热偏好/模型（面板未开也先备好），并标记缓存已热
    prefsLoadedOnce.value = true;
    modelsLoadedOnce.value = true;
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
                            :alt="displayNameText || t('common.user')"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            @error="handleAvatarImgError"
                        />
                    </span>
                    <span class="status-dot"></span>
                </div>
                <span class="account-fab-text">{{ displayNameText || t('common.user') }}</span>
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
                role="dialog"
                aria-modal="false"
                :aria-label="panelLabel"
                @pointerdown.stop
            >
                <!-- Header Profile Summary -->
                <div class="panel-header">
                    <div class="profile-main">
                        <div class="profile-avatar large">
                            <img
                                :src="userAvatarSrc"
                                :alt="displayNameText || t('common.user')"
                                loading="lazy"
                                referrerpolicy="no-referrer"
                                @error="handleAvatarImgError"
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
                            :title="t('common.refresh')"
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
                            :title="isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')"
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
                        <i class="fas fa-stopwatch"></i>{{ t('account.onlineFor', { duration: sessionDurationText }) }}
                    </span>
                    <span class="quick-item">
                        <i class="fas fa-users"></i>{{ t('account.usersOnline', { count: realtimeStats.online_users || 0 }) }}
                    </span>
                </div>

                <!-- Navigation Tabs（role/aria 补齐，V3.4.62 A9） -->
                <div class="panel-nav" role="tablist" :aria-label="t('account.title')">
                    <button
                        type="button"
                        role="tab"
                        class="nav-tab"
                        :class="{ active: activeMenu === 'overview' }"
                        :aria-selected="activeMenu === 'overview'"
                        @click="selectMenu('overview')"
                    >
                        <i class="fas fa-home"></i> {{ t('account.tabs.overview') }}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        class="nav-tab"
                        :class="{ active: activeMenu === 'security' }"
                        :aria-selected="activeMenu === 'security'"
                        @click="selectMenu('security')"
                    >
                        <i class="fas fa-shield-alt"></i> {{ t('account.tabs.security') }}
                    </button>
                    <button
                        v-if="isAdmin"
                        type="button"
                        role="tab"
                        class="nav-tab"
                        :class="{ active: activeMenu === 'admin' }"
                        :aria-selected="activeMenu === 'admin'"
                        @click="selectMenu('admin')"
                    >
                        <i class="fas fa-database"></i> {{ t('account.tabs.admin') }}
                    </button>
                    <button
                        v-if="isAdmin"
                        type="button"
                        role="tab"
                        class="nav-tab"
                        :class="{ active: activeMenu === 'api-management' }"
                        :aria-selected="activeMenu === 'api-management'"
                        @click="selectMenu('api-management')"
                    >
                        <i class="fas fa-sliders-h"></i> {{ t('account.tabs.api') }}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        class="nav-tab"
                        :class="{ active: activeMenu === 'preferences' }"
                        :aria-selected="activeMenu === 'preferences'"
                        @click="selectMenu('preferences')"
                    >
                        <!-- 原 fa-sliders-h 与 API 页签重复（V3.4.62 A4）：偏好含主题/头像，palette 更贴切 -->
                        <i class="fas fa-palette"></i> {{ t('account.tabs.preferences') }}
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
                            :initial-loading="isLoadingCenter && !hasLoadedCenterOnce"
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
                            :saved-preferences="userPreferencesStore.preferences"
                            :preference-loading="userPreferencesStore.loading"
                            :preference-saving="preferenceSaving"
                            :preference-model-options="preferenceModelOptions"
                            :basemap-preference-options="basemapPreferenceOptions"
                            :selected-avatar-index="selectedAvatarIndex"
                            :avatar-saving="avatarSaving"
                            :current-avatar-index="userAvatarIndex"
                            :user="user"
                            :current-theme="themeStore.theme"
                            @update:preference-draft="({ key, value }) => { preferenceDraft[key] = value }"
                            @save-preferences="handleSavePreferences"
                            @reset-preferences="syncPreferenceDraftFromStore"
                            @update:selected-avatar-index="(idx) => { selectedAvatarIndex = idx }"
                            @save-avatar="handleSaveAvatar"
                            @set-theme="(t) => themeStore.setTheme(t)"
                        />
                    </transition>
                </div>

                <!-- Footer Actions -->
                <div class="panel-footer">
                    <button
                        class="btn-logout"
                        type="button"
                        :disabled="isSubmitting"
                        :title="t('common.safeLogout')"
                        @click="handleLogout"
                    >
                        <i class="fas fa-sign-out-alt"></i>
                        {{ t('common.logout') }}
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
    /* 整屏覆盖档：需压过 LayerControlPanel/TopBar 弹层等 --z-modal-high 同层浮层 */
    z-index: var(--z-overlay-top);
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
    /* 高度弹性链（V3.4.53）：上界继承父级（宿主给面板容器封顶，如 HomeView 的
       max-height: calc(100% - 10px)），min-height:0 允许在 flex 容器中收缩；
       唯一伸缩区为 .panel-body，其余区块 flex-shrink:0 保证页脚永远可见 */
    max-height: 100%;
    min-height: 0;
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
    flex-shrink: 0; /* 面板收缩时头部不被压扁，伸缩全部交给 .panel-body */
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

/* （V3.4.54 移除 .blur-bg）旧玻璃拟态遗留类 background:transparent 在源序上
   晚于 .panel-header，同特异性覆盖掉品牌渐变横幅——头部白字（昵称/邮箱/角色徽章）
   压在白面板上不可见。模板 3 处引用一并摘除：页脚/头像各自背景规则本就胜出，零影响 */

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

.btn-fullscreen:active {
    transform: scale(0.95);
}

/* ── 头部瘦身（V3.4.53，仅非全屏态；全屏态维持原观感） ──
   背景：非全屏头部原 92px 高但仅承载三行文字，竖排双按钮 74px 是第二支撑柱；
   横排 + 缩小头像/内边距后约 60px，同时缓解面板总高溢出 */
.account-panel:not(.is-fullscreen) .panel-header {
    padding: 12px 16px;
    gap: 12px;
}

.account-panel:not(.is-fullscreen) .profile-avatar.large {
    width: 44px;
    height: 44px;
    border-radius: 12px;
}

.account-panel:not(.is-fullscreen) .profile-avatar.large img {
    border-radius: 10px; /* 外框 12px − 2px 边框 */
}

.account-panel:not(.is-fullscreen) .profile-name {
    font-size: 15.5px;
}

.account-panel:not(.is-fullscreen) .header-btns {
    flex-direction: row; /* 竖排 → 横排，消除 74px 高度支撑柱 */
}

.account-panel:not(.is-fullscreen) .btn-fullscreen {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    font-size: 12px;
}

.account-panel:not(.is-fullscreen) .quick-strip {
    padding: 6px 12px;
}

/* ── 速览条 ── */
.quick-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: linear-gradient(180deg, rgba(var(--brand-primary-rgb), 0.07), rgba(var(--brand-primary-rgb), 0.03));
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
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

/* ── 导航分页 ── */
.panel-nav {
    display: flex;
    padding: 0 10px;
    border-bottom: 1px solid var(--border-light);
    background: #fff;
    flex-shrink: 0;
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

/* ── 内容区：面板内唯一弹性伸缩区（V3.4.53） ──
   原 max-height: min(58vh, 540px) 以视口 vh 为基准，但面板实际被 overflow:hidden 的
   .map-wrapper 约束（恒小于 100vh），小窗口下页脚「退出系统」会被裁掉不可点；
   改为 flex:1 + min-height:0，高度上界由宿主容器（HomeView :deep 的 max-height）封顶，
   内容超长时在本区内部滚动。与全屏态既有写法同一模式 */
.panel-body {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
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
    flex-shrink: 0; /* 退出按钮永远可见：收缩压力全部由 .panel-body 承担 */
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

    /* 原 .panel-body { max-height: min(52vh, 480px) } 已随弹性链移除（V3.4.53）：
       高度上界统一由宿主容器封顶，vh 基准在窄高窗口同样会溢出 */

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
