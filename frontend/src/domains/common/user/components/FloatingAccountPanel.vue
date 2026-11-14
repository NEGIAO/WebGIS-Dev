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
                        <button
                            type="button"
                            class="btn-fullscreen"
                            :title="t('common.close')"
                            @click="closePanel"
                        >
                            <i class="fas fa-times"></i>
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
                        <i class="fas fa-users"></i>{{ t('account.usersOnline', { count: displayOnlineUsers }) }}
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
                            @update:preference-draft="handleUpdatePreferenceDraft"
                            @save-preferences="handleSavePreferences"
                            @reset-preferences="syncPreferenceDraftFromStore"
                            @update:selected-avatar-index="handleSelectAvatarIndex"
                            @save-avatar="handleSaveAvatar"
                            @set-theme="handleSetTheme"
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

<script lang="ts" src="./FloatingAccountPanel.ts"></script>

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
    width: 60px;
    height: 60px;
    border-radius: 50%;
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
    border-radius: 50%;
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
    border-radius: 50%;
}

.account-panel:not(.is-fullscreen) .profile-avatar.large img {
    border-radius: 50%;
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
    padding: 10px 18px;
    gap: 10px;
}

.account-panel.is-fullscreen .header-btns {
    flex-direction: row;
    gap: 6px;
}

.account-panel.is-fullscreen .profile-avatar.large {
    width: 44px;
    height: 44px;
    border-radius: 50%;
}

.account-panel.is-fullscreen .profile-avatar.large img {
    border-radius: 50%;
}

.account-panel.is-fullscreen    .profile-name {
    font-size: 15.5px;
}

.account-panel.is-fullscreen .panel-nav {
    flex-wrap: nowrap;
    padding: 0 14px;
}

.account-panel.is-fullscreen .nav-tab {
    flex: 1 1 0;
    padding: 11px 8px;
    font-size: 12.5px;
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
        /* 单行横滑：窄屏放不下全部页签时左右滑动，不换行堆叠 */
        overflow-x: auto;
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
    }

    .account-panel.is-fullscreen .panel-nav::-webkit-scrollbar {
        display: none;
    }

    .account-panel.is-fullscreen .nav-tab {
        flex: 1 0 auto;
        min-width: max-content;
        white-space: nowrap;
        justify-content: center;
        padding: 11px 10px;
        font-size: 12px;
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
    /* 保持单行：头像/信息在左、操作钮在右；窄屏只压缩中段文字而非换行堆叠 */
    .account-panel.is-fullscreen .panel-header {
        padding: 10px 12px;
        gap: 8px;
        align-items: center;
    }

    /* 中段可收缩：长邮箱/昵称走省略号，不把右侧按钮挤到下一行 */
    .account-panel.is-fullscreen .profile-main {
        gap: 10px;
        flex: 1;
        min-width: 0;
    }

    .account-panel.is-fullscreen .header-btns {
        flex-direction: row;
        gap: 5px;
    }

    .account-panel.is-fullscreen .panel-nav {
        padding: 0 8px;
    }

    .account-panel.is-fullscreen .nav-tab {
        padding: 10px 8px;
        font-size: 11.5px;
    }
}
</style>

